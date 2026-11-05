import { digest, id, requireText, stamp } from './store.mjs';

// Ordinary coordinator replacement is separate from team-definition adoption.
// No new summary is authoritative: both reconstruction and QA see these exact
// current records, and any substantive state change makes their evidence stale.
export function handoverSubject(state) {
  const h=state.handover;
  const reconstructionIds=new Set(Object.values(state.records??{}).filter(r=>h&&r.handover?.id===h.id).map(r=>r.id));
  const checkJobs=new Set(Object.values(state.jobs??{}).filter(j=>j.role==='qa'&&reconstructionIds.has(j.review_of?.id)).map(j=>j.id));
  const records=Object.fromEntries(Object.entries(state.records??{}).filter(([key,r])=>!reconstructionIds.has(key)&&!checkJobs.has(r.job_id)));
  const jobs=Object.fromEntries(Object.entries(state.jobs??{}).filter(([key])=>!checkJobs.has(key)));
  return {company_id:state.id,name:state.name,idea:state.idea,owner:state.owner,
    team_sha256:state.team_sha256,governance:state.governance,cos_instructions:state.cos_instructions,roles:state.roles,phase:state.phase,mode:state.mode,upgrade:state.upgrade??null,upgrade_history:state.upgrade_history??[],
    records,jobs,messages:state.messages??[],
    notices:(state.notices??[]).map(({deliveries,seen_at,...n})=>n)};
}
export const handoverHash=state=>digest(JSON.stringify(handoverSubject(state)));
export function beginHandover(state,previous) {
  state.handover={id:id('handover'),status:'pending',previous_owner:previous,incoming_owner:{...state.owner},created_at:stamp()};
}
export function submitReconstruction(state,args) {
  const h=state.handover;
  if(!h||h.status!=='pending'||!state.paused)throw new Error('No pending paused coordinator handover');
  if(h.incoming_owner.session_id!==args.session_id||h.incoming_owner.host!==state.owner.host||h.incoming_owner.epoch!==state.owner.epoch)throw new Error('Incoming coordinator changed');
  requireText(args.content,'reconstruction',20000);
  if(args.content.trim().length<100)throw new Error('Reconstruct objectives, rules, authority, pending work, uncertainty and next action substantively');
  if(Object.values(state.jobs).some(j=>['queued','running'].includes(j.status)))throw new Error('Review is active; reconcile it before replacing reconstruction');
  const subject=handoverSubject(state),subject_sha256=handoverHash(state);
  const key=id('handover-reconstruction');
  // Retain previous submissions, but do not hide them from later reconstructions.
  h.reconstruction_id=key;
  const record={id:key,kind:'artifact',revision:1,status:'Submitted',author_role:'runner',author_instance:args.session_id,
    content:args.content,created_at:stamp(),handover:{id:h.id,subject_sha256,subject,incoming_owner:{...state.owner},
      input_refs:Object.values(subject.records).map(r=>({id:r.id,revision:r.revision,sha256:digest(JSON.stringify(r))}))}};
  state.records[key]=record;
  return record;
}
export function handoverReviewEligible(state,job) {
  const h=state.handover,target=state.records?.[job.review_of?.id??job.review_of];
  return Boolean(h?.status==='pending'&&state.paused&&job.role==='qa'&&!job.prototype_id&&!job.development_id&&
    target?.id===h.reconstruction_id&&target.status==='Submitted'&&target.handover?.id===h.id&&
    target.handover.subject_sha256===handoverHash(state)&&digest(JSON.stringify(target.handover.subject))===target.handover.subject_sha256&&
    target.handover.incoming_owner.epoch===state.owner.epoch&&target.author_instance===state.owner.session_id);
}
export function verifyHandoverAcceptance(state) {
  const h=state.handover;if(!h||h.status==='completed')return null;
  const target=state.records[h.reconstruction_id];
  if(!target||target.handover?.subject_sha256!==handoverHash(state)||digest(JSON.stringify(target.handover.subject))!==target.handover.subject_sha256)throw new Error('Handover reconstruction missing or stale; submit current understanding and obtain independent QA');
  const candidates=Object.values(state.records).filter(r=>r.kind==='review'&&r.review_of?.id===target.id);
  if(candidates.some(r=>r.status==='Submitted'&&['Fail','Blocked'].includes(r.review?.verdict)))throw new Error('Handover has an unresolved negative review; revise reconstruction and obtain fresh review');
  const review=candidates.find(r=>{
    const j=state.jobs[r.job_id],v=r.review;
    return r.status==='Submitted'&&r.author_role==='qa'&&r.review_of.revision===target.revision&&
      j?.status==='completed'&&j.epoch===state.owner.epoch&&j.artifact_id===r.id&&j.review_of?.id===target.id&&j.review_of.revision===target.revision&&
      r.author_instance===j.instance_id&&j.native_id&&j.native_id!==target.author_instance&&r.author_instance!==target.author_instance&&
      v?.verdict==='Pass'&&v.permitted_action==='resume_handover'&&v.subject_sha256===target.handover.subject_sha256&&
      Array.isArray(v.blockers)&&v.blockers.length===0;
  });
  if(!review)throw new Error('Independent exact-state handover QA Pass is required before resuming');
  return {reconstruction_id:target.id,review_id:review.id,subject_sha256:target.handover.subject_sha256,incoming_owner:{...state.owner},at:stamp()};
}

export function handoverReviewContext(state,job) {
  const target=state.records?.[job.review_of?.id];
  if(!target?.handover)return null;
  if(!handoverReviewEligible(state,job)||target.revision!==job.review_of.revision)throw new Error('Handover review subject changed');
  const prior_reviews=Object.values(state.records).filter(r=>r.kind==='review'&&r.review_of?.id!==target.id&&state.records[r.review_of?.id]?.handover?.id===state.handover.id)
    .map(r=>({id:r.id,review_of:r.review_of,content:r.content,review:r.review,status:r.status,author_instance:r.author_instance}));
  const pack={protocol:'ordinary-handover-review-v1',charter:state.roles[job.role],assignment:{...(job.coordination?{coordination:job.coordination}:{}),task:job.task,model_selection:job.model_selection??{mode:'default'}},
    reconstruction:{id:target.id,revision:target.revision,author_instance:target.author_instance,content:target.content,subject_sha256:target.handover.subject_sha256},
    frozen_subject:target.handover.subject,prior_reviews};
  const text=JSON.stringify(pack);
  if(text.length>200000)throw new Error('Handover review exceeds 200000 characters; bounded evidence delivery is required. Nothing was truncated');
  return {text,hash:digest(text),inputs:[{id:target.id,revision:target.revision},...Object.values(target.handover.subject.records).map(r=>({id:r.id,revision:r.revision}))]};
}
