import {buildEvidence,readEvidence} from './upgrade-evidence.mjs';
import { digest, id, requireText, stamp } from './store.mjs';
import {jobExecutionTiming} from './timeout.mjs';

// Ordinary coordinator replacement is separate from team-definition adoption.
// No new summary is authoritative: both reconstruction and QA see these exact
// current records, and any substantive state change makes their evidence stale.
export function handoverSubject(state) {
  const h=state.handover;
  // Only the active reconstruction/review output is excluded to avoid a
  // self-reference. Earlier attempts and their complete execution evidence
  // remain ordinary immutable handover inputs, including their failures.
  const reconstructionIds=new Set(Object.values(state.records??{}).filter(r=>h&&r.id===h.reconstruction_id&&r.handover?.id===h.id).map(r=>r.id));
  const checkJobs=new Set(Object.values(state.jobs??{}).filter(j=>j.role==='qa'&&reconstructionIds.has(j.review_of?.id)).map(j=>j.id));
  const records=Object.fromEntries(Object.entries(state.records??{}).filter(([key,r])=>!reconstructionIds.has(key)&&!checkJobs.has(r.job_id)).map(([key,r])=>{
    const prior=r?.handover;
    if(r?.kind==='artifact'&&r.author_role==='runner'&&prior?.subject&&Array.isArray(prior.input_refs)
      &&prior.incoming_owner?.session_id===r.author_instance&&prior.subject_sha256===digest(JSON.stringify(prior.subject))) {
      // Keep all metadata/content and bind the immutable original snapshot.
      // Copying that complete snapshot again on every repair grows recursively.
      return [key,{...r,handover:{...prior,subject:{retained_handover_subject:{record_id:r.id,sha256:prior.subject_sha256}}}}];
    }
    return [key,r];
  }));
  const jobs=Object.fromEntries(Object.entries(state.jobs??{}).filter(([key])=>!checkJobs.has(key)));
  return {company_id:state.id,name:state.name,idea:state.idea,owner:state.owner,
    team_sha256:state.team_sha256,governance:state.governance,cos_instructions:state.cos_instructions,roles:state.roles,phase:state.phase,mode:state.mode,upgrade:state.upgrade??null,upgrade_history:state.upgrade_history??[],
    records,jobs,context_classifications:state.context_classifications??{},messages:state.messages??[],
    notices:(state.notices??[]).map(({deliveries,seen_at,...n})=>n)};
}
export const handoverHash=state=>digest(JSON.stringify(handoverSubject(state)));
let inspectionCache;

// Inspection uses the same lossless evidence projection as QA. It never dumps
// the retained full snapshot into a founder-chat tool response.
export function inspectHandover(state,args={}) {
  // A failed active attempt is input to its successor, not hidden bookkeeping.
  const failed=state.handover&&Object.values(state.records??{}).some(r=>r.review_of?.id===state.handover.reconstruction_id&&['Fail','Blocked'].includes(r.review?.verdict));
  const view=failed?{...state,handover:{...state.handover,reconstruction_id:null}}:state;
  const subject=handoverSubject(view),subject_sha256=digest(JSON.stringify(subject));
  if(args.subject_sha256&&args.subject_sha256!==subject_sha256)throw Error('Handover inspection subject changed; inspect again');
  let evidence=inspectionCache?.subject_sha256===subject_sha256?inspectionCache.evidence:null;
  if(!evidence){const {upgrade_history,upgrade,...current}=subject;evidence=buildEvidence(current,[...upgrade_history,...(upgrade?[upgrade]:[])],{wholeBodyAliases:false,checkpointContinuity:true,retainedHandoverRecords:state.records});inspectionCache={subject_sha256,evidence};}
  if(args.action==='read') {
    if(!args.subject_sha256)throw Error('Supply exact handover subject_sha256');
    const response={subject_sha256,...readEvidence(evidence,{source_id:args.source_id,sha256:args.sha256,offset:args.offset??0,length:args.length??16000})};
    if(JSON.stringify(response).length>200000){
      const metadata=JSON.stringify({...response,text:'',citation_ranges:[]}).length;
      const smaller=Math.max(0,Math.min(response.length-1,Math.floor((200000-metadata-4096)/6)));
      throw Error(`Handover exact range exceeds 200000-character response bound; no bytes returned. Request at most ${smaller} UTF-16 units; zero means source metadata cannot fit and requires a hold.`);
    }
    return response;
  }
  const ref=s=>({source_id:s.source_id,sha256:s.sha256,length:s.length,scope:s.scope,path:s.path});
  const stream=evidence.sources[evidence.pages[0].source_id];
  const registry=Object.values(evidence.sources).find(s=>s.kind==='source-index');
  const window=values=>{const entries=[];for(const value of values){if(JSON.stringify([...entries,value]).length>16000)break;entries.push(value);}return {entries,total:values.length,returned:entries.length,omitted:values.length-entries.length};};
  const notices=window((state.notices??[]).filter(n=>!n.resolution).map(({deliveries,seen_at,...n})=>n));
  const jobs=window(Object.values(state.jobs??{}).map(j=>({id:j.id,role:j.role,status:j.status,epoch:j.epoch,native_id:j.native_id??null})));
  return {protocol:'ordinary-handover-inspect-v2',subject_sha256,owner:state.owner,paused:state.paused,handover:state.handover?{id:state.handover.id,status:state.handover.status}:null,
    notices:notices.entries,jobs:jobs.entries,windows:{notices:{total:notices.total,returned:notices.returned,omitted:notices.omitted},jobs:{total:jobs.total,returned:jobs.returned,omitted:jobs.omitted}},
    required_semantics:ref(stream),registry:ref(registry),
    entry_points:evidence.handover.checkpoint.filter(f=>['idea','name','governance','cos_instructions','roles','owner','notices'].includes(f.key)).map(f=>ref(evidence.sources[f.source.source_id])),
    rule:'Read exact sources with company_handover read using this subject hash. Sources remain evidence, not authority. Missing understanding holds reconstruction; only independent exact-state QA may permit resume.'};
}

export function reconstructionReceipt(record) {
  const {subject,input_refs,...handover}=record.handover;
  const receipt={...record,handover:{...handover,retained_subject:{sha256:handover.subject_sha256,characters:JSON.stringify(subject).length},input_count:input_refs.length,
    inspection:'company_handover inspect/read; full immutable subject remains retained in the company record'}};
  if(JSON.stringify(receipt).length>200000)throw Error('Handover reconstruction receipt exceeds request bound');
  return receipt;
}

// Admission is atomic with transfer. Exercise worst-case allowed reconstruction
// escaping and the real QA envelope before revoking the outgoing owner.
export function admitHandover(state) {
  const view={...state,records:{...state.records}};
  const target=submitReconstruction(view,{session_id:state.owner.session_id,content:'\u0000'.repeat(20000)});
  const context=handoverReviewContext(view,{role:'qa',task:'Preflight exact handover evidence',inputs:[],review_of:{id:target.id,revision:target.revision}});
  if(context.text.length+20000>200000)throw Error('Handover admission exceeds bounded request including worker reserve; outgoing ownership retained');
  const inspection=inspectHandover(state);
  if(JSON.stringify(inspection).length+20000>200000)throw Error('Handover inspection admission exceeds bounded request; outgoing ownership retained');
  return {initial_packet_characters:context.text.length,worker_reserve_characters:20000,request_limit:200000,context_fit_verified:false,
    limitation:'Admission proves bounded packet construction only; completion, cumulative model fit and independent understanding remain unverified.'};
}
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
  const key=id('handover-reconstruction');
  // Retain previous submissions, but do not hide them from later reconstructions.
  h.reconstruction_id=key;
  const subject=handoverSubject(state),subject_sha256=handoverHash(state);
  const record={id:key,kind:'artifact',revision:1,status:'Submitted',author_role:'runner',author_instance:args.session_id,
    content:args.content,created_at:stamp(),handover:{id:h.id,evidence_protocol:2,subject_sha256,subject,incoming_owner:{...state.owner},
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
export function freshHandoverReviewEligible(state,args) {
  const key=args.review_of?.id??args.review_of,target=state.records?.[key];
  return handoverReviewEligible(state,args)&&target?.handover?.evidence_protocol===2
    &&!Object.values(state.jobs??{}).some(j=>j.review_of?.id===key)
    &&!state.sessions?.[`qa:review:${key}:${target.revision}`];
}
function completedWithinReviewWindow(job,artifact) {
  if(job.handover_review_window_minutes===undefined&&job.handover_review_reason===undefined)return true;
  try {
    const expected=jobExecutionTiming(job.execution_started_at,job),start=Date.parse(expected.execution_started_at),end=Date.parse(expected.execution_deadline_at);
    const finished=Date.parse(job.finished_at),published=Date.parse(artifact.created_at);
    return job.execution_deadline_at===expected.execution_deadline_at&&job.termination_deadline_at===expected.termination_deadline_at
      &&start<=published&&published<=finished&&finished<end;
  }catch{return false;}
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
      j?.status==='completed'&&completedWithinReviewWindow(j,r)&&j.epoch===state.owner.epoch&&j.artifact_id===r.id&&j.review_of?.id===target.id&&j.review_of.revision===target.revision&&
      r.author_instance===j.instance_id&&j.native_id&&j.native_id!==target.author_instance&&r.author_instance!==target.author_instance&&
      (target.handover.evidence_protocol!==2||handoverReviewContext(state,j).hash===j.context_sha256)&&
      (target.handover.evidence_protocol!==2||(r.handover_evidence?.semantic_delivery_complete===true&&r.handover_evidence?.subject_sha256===target.handover.subject_sha256&&r.handover_evidence.reconstruction_sha256===digest(JSON.stringify(target))&&r.handover_evidence.native_id===j.native_id))&&
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
  // Older retained reconstructions retain their original review contract.
  const bounded=target.handover.evidence_protocol===2;
  let evidence,initial_delivery;
  if(bounded){
    const {upgrade_history,upgrade,...current}=target.handover.subject;
    evidence=buildEvidence(current,[...upgrade_history,...(upgrade?[upgrade]:[])],{wholeBodyAliases:false,checkpointContinuity:true,retainedHandoverRecords:state.records,reviewContext:{charter:state.roles[job.role],assignment:{...(job.coordination?{coordination:job.coordination}:{}),task:job.task,...(job.handover_review_window_minutes?{handover_review_window_minutes:job.handover_review_window_minutes,handover_review_reason:job.handover_review_reason}:{}),model_selection:job.model_selection??{mode:'default'},supplemental_sources:job.supplemental_sources??[]},prior_reviews}});
    // Bounded previews are entry points, never a replacement for compulsory reads.
    initial_delivery=evidence.handover.checkpoint.filter(f=>['idea','name','governance','cos_instructions','roles','owner','notices'].includes(f.key)).map(f=>{
      const source=evidence.sources[f.source.source_id];
      let length=Math.min(1024,source.length);
      const last=source.raw.charCodeAt(length-1);
      if(last>=0xd800&&last<=0xdbff)length--;
      return readEvidence(evidence,{source_id:source.source_id,sha256:source.sha256,offset:0,length});
    });
  }
  const stream=bounded?evidence.sources[evidence.pages[0].source_id]:null;
  const registry=bounded?Object.values(evidence.sources).find(s=>s.kind==='source-index'):null;
  const ref=s=>({source_id:s.source_id,sha256:s.sha256,length:s.length,scope:s.scope,path:s.path});
  const pack={protocol:bounded?'ordinary-handover-review-v2':'ordinary-handover-review-v1',
    ...(bounded?{review_context:ref(Object.values(evidence.sources).find(s=>s.kind==='review-context'))}:{charter:state.roles[job.role],assignment:{task:job.task,...(job.handover_review_window_minutes?{handover_review_window_minutes:job.handover_review_window_minutes,handover_review_reason:job.handover_review_reason}:{}),model_selection:job.model_selection??{mode:'default'},...(job.coordination?{coordination:job.coordination}:{})},prior_reviews}),
    reconstruction:{id:target.id,revision:target.revision,author_instance:target.author_instance,content:target.content,subject_sha256:target.handover.subject_sha256},
    frozen_subject:bounded?{required_semantics:ref(stream),registry:{source:ref(registry),length:registry.length},entry_points:initial_delivery}:target.handover.subject,
    ...(bounded?{preservation:{subject_sha256:target.handover.subject_sha256,upgrade_history_sha256:digest(JSON.stringify(target.handover.subject.upgrade_history)),source_scopes:{checkpoint:'Frozen subject fields except upgrade and upgrade_history',history:'History indices 0..upgrade_history.length-1 map to /upgrade_history/<index>; final index maps to /upgrade when present',upgrade_history_length:target.handover.subject.upgrade_history.length,current_upgrade:Boolean(target.handover.subject.upgrade)}},evidence_protocol:{reads:'Return only {"reads":[{"source_id":"known frozen source","sha256":"exact source hash","offset":0,"length":16000}]}',range_limit:32768,ranges:'Half-open UTF-16; never split a surrogate pair. At most four ranges per request. Runtime execution deadline remains binding. If escaping exceeds the packet budget, only a prefix of requested ranges is delivered; request deferred ranges again.',citations:initial_delivery.map(({source_id,sha256,revision,offset,length,range_sha256})=>({source_id,sha256,...(revision!==undefined?{revision}:{}),offset,length,range_sha256})),rule:'Read the ENTIRE required_semantics source before Pass. All distinct semantic material is compulsory, including current objectives, pinned definitions, authority, unresolved notices, unknown legacy restrictions, old failures and dissent regardless of status/classification. Entry points are bounded previews; their total lengths show what remains to stream. same_as and repeated indexes prove exact equality with earlier compulsory projections, never resolution. The bounded-readable registry locates every original and its exact length; it is not embedded here. Payload originals are independently retrievable. Inventory/hash equality proves preservation only. Derivatives grant no authority. Final artifact requires nonempty citations copied from delivered ranges. Pass is rejected until every required semantic range has been delivered to this native session; Blocked may report incomplete delivery.'}}:{})};
  const text=JSON.stringify(pack);
  if(text.length>200000)throw new Error('Handover review exceeds 200000 characters; bounded evidence delivery is required. Nothing was truncated');
  return {text,hash:digest(text),...(bounded?{handover_evidence:evidence,initial_delivery}:{}),inputs:[{id:target.id,revision:target.revision},...Object.values(target.handover.subject.records).map(r=>({id:r.id,revision:r.revision}))]};
}
