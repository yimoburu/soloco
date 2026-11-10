// One prospective review of an unchanged, live-grant candidate. The historical
// Blocked judgment and session remain immutable; no string grants an exception.
import {digest,id,stamp,owner,requireText,withStore,STORE_PRECOMMIT_GUARD_VERSION} from './store.mjs';
import {developmentReviewAuthority,liveDevelopmentReviewSubject} from './develop.mjs';
import {assignmentContext,contextMatches} from './context.mjs';
import {contextSource} from './current-state.mjs';
import {validateCodeReviewDelivery} from './code-review-window.mjs';
import {validateRetentionPrimaryDelivery,retentionRepairVerdictShape} from './retention-primary-transport.mjs';
import {validModelProcessTracking} from './model-process-closure.mjs';
import {inheritSnapshots} from './snapshot.mjs';

export const RETENTION_REPAIR_PROTOCOL='development-retention-review-repair-v1';
if(STORE_PRECOMMIT_GUARD_VERSION!==1)throw Error('Retention repair requires the private final pre-COMMIT guard');
const hash=v=>digest(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ref=r=>({id:r.id,revision:r.revision??null,sha256:hash(r)});
const plain=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v,keys)=>plain(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=v=>typeof v==='string'&&v.trim().length>0&&!v.includes('\0');
const isTicket=r=>r?.development?.type==='retention_review_repair'&&r.development.protocol===RETENTION_REPAIR_PROTOCOL;
const subjectOf=r=>r?.development?.proposal?.subject;
const closed=j=>j?.status==='completed'&&j.coordination_release?.termination_confirmed===true&&j.coordination_release.reason==='model_process_closed'&&text(j.native_id)&&Number.isFinite(Date.parse(j.finished_at))&&Number.isFinite(Date.parse(j.coordination_release.at))&&Date.parse(j.coordination_release.at)<=Date.parse(j.finished_at)&&validModelProcessTracking(j.model_process_tracking)&&j.model_process_tracking.invocations.every(x=>x.job_id===j.id&&x.instance_id===j.instance_id&&x.worker_pid===j.worker_pid&&x.host===j.host&&x.birth&&x.closure&&Date.parse(x.closure.closed_at)<=Date.parse(j.coordination_release.at));
const time=expires=>{if(!Number.isFinite(Date.parse(expires))||Date.now()>=Date.parse(expires))throw Error('Original retention-review authority expired');};
function primary(s,a){owner(s,a.session_id,a.host,a.epoch);if(s.paused)throw Error('Retention review is paused');}
function sourceRef(s,key){const v=contextSource(s,key);if(v===undefined)throw Error('Required retention evidence missing: '+key);return {...ref(v),id:key,total_characters:JSON.stringify(v).length};}
function currentRef(s,r){const v=contextSource(s,r.id);if(v===undefined||(v.revision??null)!==r.revision||hash(v)!==r.sha256||r.total_characters!==undefined&&JSON.stringify(v).length!==r.total_characters)throw Error('Retention evidence changed: '+r.id);return v;}
function equivalent(s,target,subject){
  if(!target)return false;const d=target.development,p=subjectOf(target);
  return target.id===subject.receipt.id||target.id===subject.candidate.id||d?.type==='candidate'&&d.candidate_sha256===subject.candidate_sha256||d?.type==='test'&&(d.candidate_id===subject.candidate.id||d.candidate_sha256===subject.candidate_sha256)||p&&(p.candidate?.id===subject.candidate.id||p.candidate_sha256===subject.candidate_sha256);
}
function rejected(j){
  if(j.rejected_output!==undefined&&j.rejected_output!==null)throw Error('Rejected or uncertain candidate review remains: '+j.id);
  const v=j.model_evidence?.cli_observed_negative_outputs;if(v!==undefined&&(!Array.isArray(v)||v.length))throw Error('Adapter-observed negative or malformed review remains: '+j.id);
}
function adverse(s,subject,prior,ownJob=null){
  const records=[],jobs=[];
  for(const r of Object.values(s.records)){
    if(r.kind!=='review'||r.id===ownJob?.artifact_id||!equivalent(s,s.records[r.review_of?.id],subject))continue;
    if(!['Pass','Fail','Blocked'].includes(r.review?.verdict))throw Error('Unknown candidate review remains: '+r.id);
    if(r.review.verdict==='Fail'||r.review.verdict==='Blocked'&&r.id!==prior.id)throw Error('Another adverse candidate review remains: '+r.id);
    records.push(ref(r));
  }
  for(const j of Object.values(s.jobs)){
    if(j.role!=='qa'||j.id===ownJob?.id||!equivalent(s,s.records[j.review_of?.id],subject))continue;
    rejected(j);if(!closed(j)||!s.records[j.artifact_id]||s.records[j.artifact_id].job_id!==j.id)throw Error('Another candidate review is unfinished or uncertain: '+j.id);
    jobs.push({id:j.id,sha256:hash(j)});
  }
  return {reviews:records.sort((a,b)=>a.id.localeCompare(b.id)),jobs:jobs.sort((a,b)=>a.id.localeCompare(b.id))};
}
function priorReview(s,a,e){
  const r=s.records[a.prior_review_id],j=s.jobs[a.prior_job_id],v=r?.review;
  if(r?.kind!=='review'||r.status!=='Submitted'||r.author_role!=='qa'||r.revision!==1||r.job_id!==j?.id||j.role!=='qa'||j.artifact_id!==r.id||r.author_instance!==j.instance_id||!closed(j)||!same(r.review_of,{id:e.receipt.id,revision:e.receipt.revision})||!same(j.review_of,r.review_of)||v?.verdict!=='Blocked'||v.permitted_action!=='hold'||!text(v.reason)||!Array.isArray(v.blockers)||!v.blockers.length||v.blockers.some(b=>!text(b))||v.candidate_sha256!==e.candidate.development.candidate_sha256||v.receipt_sha256!==e.receipt.development.receipt_sha256)throw Error('Exact submitted closed independent Blocked review required');
  if([e.producer.native_id,e.producer.instance_id].includes(j.native_id)||r.author_instance===e.candidate.author_instance)throw Error('Prior review was not independent of candidate');
  rejected(j);return {record:r,job:j};
}
function required(s,subject,prior){
  const keys=new Set([subject.plan.id,subject.candidate.id,subject.receipt.id,prior.record.id,...(prior.job.inputs??[]).map(r=>r.id),...(prior.job.supplemental_sources??[]).map(r=>r.id)]);
  for(const r of prior.job.inputs??[])if(s.records[r.id]?.revision!==r.revision)throw Error('Original review input changed: '+r.id);
  for(const r of prior.job.supplemental_sources??[])currentRef(s,r);
  return [...keys].sort().map(key=>sourceRef(s,key));
}
function subjectArgs(p){return {plan_id:p.subject.plan.id,candidate_id:p.subject.candidate.id,receipt_id:p.subject.receipt.id,receipt_sha256:p.subject.receipt_sha256,prior_review_id:p.prior_review.id,prior_job_id:p.prior_job.id,code_review_window_minutes:p.code_review_window_minutes};}
function proposalData(s,a,e,ownJob=null){
  if(!e||!same(e.plan,s.records[a.plan_id])||!same(e.candidate,s.records[a.candidate_id])||!same(e.receipt,s.records[a.receipt_id])||!same(e.producer,s.jobs[e.candidate?.job_id])||!same(e.controller,s.jobs[e.receipt?.author_instance]))throw Error('Proposal DATA requires the exact supplied actual subject values');
  const prior=priorReview(s,a,e),d=e.plan.development;
  if(e.producer.model_process_tracking!==undefined&&!closed(e.producer))throw Error('Tracked candidate producer lacks its complete original CLI closure');
  if(![30,45].includes(a.code_review_window_minutes))throw Error('Choose a supported fixed30/45-minute retention-review window');
  const subject={plan:ref(e.plan),scope_sha256:d.scope_sha256,candidate:ref(e.candidate),candidate_sha256:e.candidate.development.candidate_sha256,receipt:ref(e.receipt),receipt_sha256:e.receipt.development.receipt_sha256,validation_manifest_sha256:hash(e.receipt.development.validation_manifest),producer:{id:e.producer.id,sha256:hash(e.producer),native_id:e.producer.native_id,instance_id:e.producer.instance_id},controller:{id:e.controller.id,sha256:hash(e.controller)}};
  const evidence=required(s,subject,prior);
  return {protocol:RETENTION_REPAIR_PROTOCOL,subject,owner:{...s.owner},authority_sha256:developmentReviewAuthority(s,e.plan.id),expires_at:d.scope.expires_at,code_review_window_minutes:a.code_review_window_minutes,per_call_timeout_ms:600000,max_review_attempts:1,max_native_calls:17,prior_review:ref(prior.record),prior_job:{id:prior.job.id,sha256:hash(prior.job),native_id:prior.job.native_id,instance_id:prior.job.instance_id},adverse_snapshot:adverse(s,subject,prior.record,ownJob),required_evidence_manifest:{count:evidence.length,sha256:hash(evidence)},permissions:{review:true,accept_local_development:true,generation:false,test_execution:false,recovery:false,reuse:false,source_integration:false,allowance_reset:false,prior_release:false}};
}
// Definition-only geometry DATA, never an eligibility/authorization API. The
// caller supplies an independently verified actual subject; no executor probe,
// Store, process or authority mutation is performed here.
export function retentionReviewProposalData(s,a,alreadyPureSubject){return proposalData(s,a,alreadyPureSubject);}
function proposal(s,a,root,ownJob=null){return proposalData(s,a,liveDevelopmentReviewSubject(s,a,root),ownJob);}
export function prepareRetentionReview(s,a,root){
  primary(s,a);const p=proposal(s,a,root);
  if(Object.values(s.records).some(r=>isTicket(r)&&(r.development.proposal.subject.candidate.id===p.subject.candidate.id||r.development.proposal.subject.candidate_sha256===p.subject.candidate_sha256)))throw Error('This candidate already has its one retention-review ticket');
  return p;
}
export function authorizeRetentionReview(s,a,root){
  const p=prepareRetentionReview(s,a,root);requireText(a.source_instruction,'exact current founder source_instruction');requireText(a.approval_reference,'approval_reference',300);
  if(a.model_data_approved!==true||a.proposal_sha256!==hash(p))throw Error('Explicitly approve this exact retention-review proposal and existing model-data scope');
  if(Date.now()+p.code_review_window_minutes*60000>Date.parse(p.expires_at))throw Error('Insufficient original authorized time for the full fixed review window');
  if(Object.values(s.records).some(r=>isTicket(r)&&r.development.authorization.approval_reference===a.approval_reference))throw Error('Retention-review approval already used');
  const key=id('retention-review'),at=stamp();
  return s.records[key]={id:key,kind:'artifact',author_role:'runtime',author_instance:a.session_id,revision:1,status:'Submitted',created_at:at,content:'One prospective independent evidence-retention repair and local code review. The old Blocked judgment, original grant, source, receipt, charges and deadlines remain unchanged.',development:{type:'retention_review_repair',protocol:RETENTION_REPAIR_PROTOCOL,plan_id:p.subject.plan.id,candidate_id:p.subject.candidate.id,receipt_id:p.subject.receipt.id,proposal:p,authorization:{proposal_sha256:hash(p),recorded_by:a.session_id,source_instruction:a.source_instruction,approval_reference:a.approval_reference,model_data_approved:true,authority_sha256:p.authority_sha256}}};
}
export function retentionRepairSessionKey(ticket){if(!isTicket(ticket))throw Error('Invalid retention-review ticket');return `qa:review:${ticket.development.receipt_id}:${ticket.development.proposal.subject.receipt.revision}:retention:${ticket.id}`;}
function ticketOf(s,key,root,ownJob=null){
  const t=s.records[key],d=t?.development,p=d?.proposal,g=d?.authorization;
  if(!isTicket(t)||t.kind!=='artifact'||t.author_role!=='runtime'||t.status!=='Submitted'||t.revision!==1||!p||d.plan_id!==p.subject.plan.id||d.candidate_id!==p.subject.candidate.id||d.receipt_id!==p.subject.receipt.id||g?.model_data_approved!==true||!text(g.source_instruction)||!text(g.approval_reference)||g.recorded_by!==p.owner.session_id||g.proposal_sha256!==hash(p)||g.authority_sha256!==p.authority_sha256)throw Error('Retention-review ticket integrity failed');
  if(s.paused||!same(s.owner,p.owner)||developmentReviewAuthority(s,p.subject.plan.id)!==p.authority_sha256)throw Error('Retention-review ownership or authority changed');
  time(p.expires_at);const current=proposal(s,subjectArgs(p),root,ownJob);
  if(!same(current,p))throw Error('Retention-review subject, adverse history or complete evidence changed');
  return t;
}
export function resolveRetentionRepair(s,a,{root=process.cwd(),reserve=false,phase='admission'}={}){
  if(a.retention_repair_id===undefined)return null;
  const own=a.id?s.jobs[a.id]??a:null,t=ticketOf(s,a.retention_repair_id,root,own),p=t.development.proposal;
  const target=typeof a.review_of==='string'?{id:a.review_of,revision:s.records[a.review_of]?.revision}:a.review_of;
  if(a.role!=='qa'||a.development_id!==undefined||a.prototype_id!==undefined||a.specialist_ref!==undefined||a.specialist!==undefined||!same(target,{id:p.subject.receipt.id,revision:p.subject.receipt.revision})||a.code_review_window_minutes!==p.code_review_window_minutes||a.timeout_ms!==p.per_call_timeout_ms)throw Error('Retention repair requires its exact separate ordinary QA window');
  if(a.id&&(a.session_key!==retentionRepairSessionKey(t)||a.epoch!==s.owner.epoch||a.host!==s.owner.host||!text(a.instance_id)))throw Error('Retention-review job identity changed');
  const stored=a.id&&s.jobs[a.id];if(stored)for(const key of ['retention_repair_id','review_of','role','session_key','instance_id','epoch','host','code_review_window_minutes','timeout_ms','context_sha256','inputs','supplemental_sources'])if(!same(stored[key],key==='review_of'?target:a[key]))throw Error('Retention-review immutable job binding changed: '+key);
  const jobs=Object.values(s.jobs).filter(j=>j.retention_repair_id===t.id);
  if(reserve?jobs.some(j=>j.id!==a.id)||jobs.length>1:a.id&&(jobs.length!==1||jobs[0].id!==a.id))throw Error('Retention-review one-use allowance is unavailable');
  if(!a.id&&jobs.length)throw Error('Retention-review ticket already spent');
  if(phase==='admission'&&!a.execution_started_at&&Date.now()+p.code_review_window_minutes*60000>Date.parse(p.expires_at))throw Error('Insufficient original time for the complete fixed retention review');
  if(a.execution_deadline_at!==undefined&&Date.parse(a.execution_deadline_at)>Date.parse(p.expires_at))throw Error('Retention-review execution exceeds original expiry');
  const refs=required(s,p.subject,{record:s.records[p.prior_review.id],job:s.jobs[p.prior_job.id]});
  return {ticket:t,proposal:p,subject:p.subject,requiredEvidence:refs,control:{owner:p.owner,expires_at:p.expires_at,plan_id:p.subject.plan.id,authority_sha256:p.authority_sha256,ticket_id:t.id,root,own_job_id:a.id??null}};
}
export function retentionRepairContextInputs(s,a){if(a.retention_repair_id===undefined)return [];const t=s.records[a.retention_repair_id];if(!isTicket(t))throw Error('Missing retention-review ticket');return [t.id,t.development.proposal.prior_review.id];}
// Definition-only DATA assembly for strict read-only prompt measurement. This
// function grants no eligibility and never probes an executor. Runtime callers
// MUST use the checked wrapper below, not a caller-controlled bypass flag.
export function retentionRepairPrimarySnapshotData(s,job,{contextText}={}){
  if(job.retention_repair_id===undefined)return null;const ticket=s.records[job.retention_repair_id];if(!isTicket(ticket))throw Error('Exact stored retention ticket required');
  // Match ordinary contextMatches exactly: this job's newly published outputs
  // are not its own inputs. Keep them in the real state and every later job;
  // exclude no other producer or material current change from this view.
  // A DATA-only request without a job ID has no own outputs to filter.
  const boundJob=text(job.id),view=boundJob?inheritSnapshots(s,{...s,notices:s.notices.filter(n=>n.job_id!==job.id),messages:s.messages.filter(m=>m.job_id!==job.id)}):s;
  const p=ticket.development.proposal,refs=required(s,p.subject,{record:s.records[p.prior_review.id],job:s.jobs[p.prior_job.id]}),c=assignmentContext(view,boundJob?s.jobs[job.id]??job:job),contextString=contextText??c.text;if(contextString!==c.text)throw Error('Retention primary must use the exact current canonical assignment');
  const primary=new Set([p.subject.plan.id,p.subject.candidate.id,p.subject.receipt.id,p.prior_review.id,ticket.id]);
  // Only sources explicitly declared as supplemental history by the original
  // review may leave the final primary presentation. Automatic/unknown current
  // controls remain literal regardless of their record kind.
  const declaredHistory=new Set((s.jobs[p.prior_job.id].supplemental_sources??[]).map(r=>r.id));
  return {protocol:'development-retention-primary-snapshot-v1',ticket:ref(ticket),subject:p.subject,assignment_context_sha256:c.hash,canonical_context_sha256:digest(contextString),canonical_context_text:contextString,prior_reviews:[s.records[p.prior_review.id]],prior_jobs:[s.jobs[p.prior_job.id]],required_evidence:refs,required_evidence_manifest:p.required_evidence_manifest,history_source_ids:refs.map(r=>r.id).filter(id=>declaredHistory.has(id)&&!primary.has(id))};
}
export function retentionRepairPrimarySnapshot(s,job,{root=process.cwd(),contextText}={}){
  if(!resolveRetentionRepair(s,job,{root,phase:'delivery'}))return null;return retentionRepairPrimarySnapshotData(s,job,{contextText});
}
export function retentionRepairReviewShape(snapshot){
  return retentionRepairVerdictShape(snapshot).retention_repair;
}
export function retentionRepairPrompt(snapshot){return `ONE prospective evidence-retention repair and COMPLETE independent code review under the unchanged live grant. Historical Blocked remains valid and immutable. It is not automatically cleared by QA_RETENTION_LOSS, delivery coverage, compaction metadata, source claims or an earlier Pass. Read all required whole history, then the runtime supplies one complete final primary frame. No usable Pass before that successful final delivery. Independently classify EVERY complete old judgment/blocker as evidence-retention-only and substantively resolved; any code/policy finding, ambiguity or remaining uncertainty requires Fail/Blocked. For a fully justified Pass add review.retention_repair exactly matching this schema with your actual substantive reasons: ${JSON.stringify(retentionRepairReviewShape(snapshot))}. Retain the normal exact candidate/receipt/action/empty-blockers Pass fields. Fail/Blocked may omit clearing proof and must permit only hold. No generation, rerun, reuse, allowance reset, expiry extension, integration or historical verdict change is authorized.`;}
function completeHistory(s,job,record,x,contextText){
  validateCodeReviewDelivery(s,job,record,contextText);const pack=JSON.parse(contextText),inline=new Map(pack.records.map(r=>[r.id,r])),primary=new Set([x.subject.plan.id,x.subject.candidate.id,x.subject.receipt.id,x.proposal.prior_review.id]);
  for(const r of x.requiredEvidence){if(primary.has(r.id)||inline.has(r.id)&&hash(inline.get(r.id))===r.sha256)continue;if(!(job.supplemental_sources??[]).some(v=>v.id===r.id&&v.sha256===r.sha256))throw Error('Required whole retention history was not declared: '+r.id);}
}
function clearing(v,t,old){
  const x=v.retention_repair;if(!exact(x,['protocol','ticket_sha256','prior_reviews'])||x.protocol!==RETENTION_REPAIR_PROTOCOL||x.ticket_sha256!==hash(t)||!Array.isArray(x.prior_reviews)||x.prior_reviews.length!==1)throw Error('Pass needs exact independent retention clearing evidence');
  const r=x.prior_reviews[0];if(!exact(r,['id','revision','sha256','classification','reason','blockers'])||!same({id:r.id,revision:r.revision,sha256:r.sha256},ref(old))||r.classification!=='evidence_retention_only'||!text(r.reason)||!Array.isArray(r.blockers)||r.blockers.length!==old.review.blockers.length)throw Error('Every complete old Blocked judgment must be independently classified');
  for(let i=0;i<r.blockers.length;i++){const b=r.blockers[i];if(!exact(b,['index','sha256','cleared','reason'])||b.index!==i||b.sha256!==digest(old.review.blockers[i])||b.cleared!==true||!text(b.reason))throw Error('Every exact old blocker must have a substantive clearing judgment');}
}
export function validateRetentionRepairPublication(s,job,record,{root=process.cwd(),phase='publication'}={}){
  const x=resolveRetentionRepair(s,job,{root,phase});if(!x)return null;const {ticket:t,proposal:p}=x,v=record.review;
  if(!closed(job)||job.model_process_tracking.invocations.length>p.max_native_calls||job.artifact_id!==record.id||record.kind!=='review'||record.status!=='Submitted'||record.author_role!=='qa'||record.author_instance!==job.instance_id||record.job_id!==job.id||!same(record.review_of,job.review_of)||!contextMatches(s,job,job.context_sha256))throw Error('Retention review lacks exact closed current native provenance');
  const originals=[s.owner.session_id,p.subject.producer.native_id,p.subject.producer.instance_id,p.prior_job.native_id,p.prior_job.instance_id];if(originals.some(k=>k&&[job.native_id,job.instance_id].includes(k)))throw Error('Retention reviewer is not fresh and independent');
  const start=Date.parse(job.execution_started_at),end=Date.parse(job.execution_deadline_at),finished=Date.parse(job.finished_at),release=Date.parse(job.coordination_release.at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==p.code_review_window_minutes*60000||finished<start||finished>=end||release<start||release>finished||phase==='publication'&&Date.now()>=end)throw Error('Retention review is outside its exact original bounded window');
  if(!['Pass','Fail','Blocked'].includes(v?.verdict)||!text(v.reason)||!Array.isArray(v.blockers)||v.candidate_sha256!==p.subject.candidate_sha256||v.receipt_sha256!==p.subject.receipt_sha256)throw Error('Retention review must bind its exact tested candidate/result');
  const snapshot=retentionRepairPrimarySnapshot(s,job,{root});
  if(!same(record.retention_primary_delivery,job.retention_primary_delivery))throw Error('Published retention primary delivery proof changed');
  validateRetentionPrimaryDelivery(job,snapshot);completeHistory(s,job,record,x,snapshot.canonical_context_text);
  if(v.verdict==='Pass'){
    rejected(job);
    if(v.permitted_action!=='accept_local_development'||v.blockers.length)throw Error('Retention Pass must independently accept complete code without blockers');
    clearing(v,t,s.records[p.prior_review.id]);
  }else if(v.permitted_action!=='hold')throw Error('Negative retention review cannot permit acceptance');
  if(phase==='publication'&&Date.now()>=end)throw Error('Retention-review deadline reached during final validation');
  time(p.expires_at);Object.assign(x.control,{own_record_id:record.id,own_job_sha256:hash(job),own_record_sha256:hash(record),qa_deadline_at:phase==='publication'?job.execution_deadline_at:null});return x;
}
export function validateRetentionRepairAcceptance(s,job,record,{root=process.cwd()}={}){const x=validateRetentionRepairPublication(s,job,record,{root,phase:'acceptance'});if(!x||record.review.verdict!=='Pass')throw Error('Exact retention-repair Pass required');return {clearedReviewIds:new Set([x.proposal.prior_review.id]),binding:{ticket:ref(x.ticket),cleared_reviews:[x.proposal.prior_review]},control:x.control};}
export function assertRetentionRepairCommit(s,c){
  if(!c||s.paused||!same(s.owner,c.owner))throw Error('Retention-review owner/pause changed before COMMIT');
  let view=s;
  if(c.accepted_receipt_id){
    const current=s.records[c.accepted_receipt_id];if(hash(current?.development?.acceptance)!==c.acceptance_sha256)throw Error('Retention acceptance changed before COMMIT');
    const development={...current.development};delete development.acceptance;
    view=inheritSnapshots(s,{...s,records:{...s.records,[current.id]:{...current,development}}});
  }
  if(c.own_job_sha256&&hash(s.jobs[c.own_job_id])!==c.own_job_sha256||c.own_record_sha256&&hash(s.records[c.own_record_id])!==c.own_record_sha256)throw Error('Retention publication changed before COMMIT');
  if(c.ticket_id)ticketOf(view,c.ticket_id,c.root, c.own_job_id?view.jobs[c.own_job_id]:null);
  if(c.plan_id&&(view.records[c.plan_id]?.development?.revoked||developmentReviewAuthority(view,c.plan_id)!==c.authority_sha256))throw Error('Retention-review authority changed before COMMIT');
  time(c.expires_at);if(c.qa_deadline_at!==null&&c.qa_deadline_at!==undefined&&(!Number.isFinite(Date.parse(c.qa_deadline_at))||Date.now()>=Date.parse(c.qa_deadline_at)))throw Error('Retention-review QA cutoff reached before COMMIT');
}
export function retentionReviewAction(a,host){
  const args={...a,host};if(a.action==='prepare_retention_review')return withStore(a.root,db=>db.readSnapshot(()=>{const proposal=prepareRetentionReview(db.read(),args,a.root);return {proposal,proposal_sha256:hash(proposal)};}));
  if(a.action!=='authorize_retention_review')throw Error('Unknown retention-review action');let result,control;
  withStore(a.root,db=>db.transaction('development.authorize_retention_review',s=>{result=authorizeRetentionReview(s,args,a.root);const p=result.development.proposal;control={owner:p.owner,expires_at:p.expires_at,plan_id:p.subject.plan.id,authority_sha256:p.authority_sha256,ticket_id:result.id,root:a.root};return s;},{beforeCommit:(_db,s)=>assertRetentionRepairCommit(s,control)}));return result;
}
