// Prospective review/local-acceptance capability only. Nothing in this module
// renews the old development grant or releases its uncertain process/session.
import {digest,id,stamp,owner,requireText,withStore,STORE_PRECOMMIT_GUARD_VERSION} from './store.mjs';
import {developmentReviewAuthority,developmentReviewSubject} from './develop.mjs';
import {assignmentContext,contextMatches} from './context.mjs';
import {contextSource} from './current-state.mjs';

export const REVIEW_CONTINUATION_PROTOCOL='development-review-local-acceptance-continuation-v1';
if(STORE_PRECOMMIT_GUARD_VERSION!==1)throw Error('Continuation requires the private final pre-COMMIT guard; old SDK is unsupported');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=value=>digest(JSON.stringify(value));
const ref=r=>({id:r.id,revision:r.revision??null,sha256:hash(r)});
const sourceRef=(s,key)=>{const value=contextSource(s,key);if(value===undefined)throw Error('Required continuation evidence missing: '+key);return {id:key,revision:value.revision??null,sha256:hash(value),total_characters:JSON.stringify(value).length};};
const isTarget=r=>r?.development?.type==='review_continuation'&&r.development.protocol===REVIEW_CONTINUATION_PROTOCOL;
const subjectOf=r=>isTarget(r)?r.development.proposal.subject:null;
const occupied=j=>['queued','running'].includes(j.status)||Boolean(j.started_at)&&['failed','cancelled','interrupted','unknown'].includes(j.status)&&j.coordination_release?.termination_confirmed!==true;
const closed=j=>j?.coordination_release?.termination_confirmed===true;
function primary(s,a) {owner(s,a.session_id,a.host,a.epoch);if(s.paused)throw Error('Continuation is paused');}
function time(expires) {const n=Date.parse(expires);if(!Number.isFinite(n)||Date.now()>=n)throw Error('Explicit prospective continuation deadline is missing or expired');return n;}
function currentRef(s,r) {const v=contextSource(s,r.id);if(v===undefined||(v.revision??null)!==r.revision||hash(v)!==r.sha256||r.total_characters!==undefined&&JSON.stringify(v).length!==r.total_characters)throw Error('Continuation evidence changed: '+r.id);return v;}
function canonicalJobSubject(s,j) {
  const record=s.records[j?.review_of?.id],d=record?.development;
  if(d?.type==='test')return {candidate_id:d.candidate_id,candidate_sha256:d.candidate_sha256,receipt_id:record.id};
  if(d?.type==='candidate')return {candidate_id:record.id,candidate_sha256:d.candidate_sha256};
  return subjectOf(record);
}
function equivalent(s,record,subject) {
  if(!record)return false;
  const d=record.development,other=subjectOf(record);
  return record.id===subject.receipt.id||record.id===subject.candidate.id||d?.type==='test'&&(d.candidate_id===subject.candidate.id||d.candidate_sha256===subject.candidate_sha256)||other&&(other.candidate.id===subject.candidate.id||other.candidate_sha256===subject.candidate_sha256);
}
function negativeWire(job) {
  const raw=job.rejected_output;
  if(!raw)return null;
  if(raw.truncated||raw.original)return 'Unknown';
  let parsed;try{parsed=JSON.parse(raw.text?.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return 'Unknown';}
  return ['Fail','Blocked'].includes(parsed?.review?.verdict)?parsed.review.verdict:'Unknown';
}
function modelNegative(job) {
  const values=job.model_evidence?.cli_observed_negative_outputs;
  if(values!==undefined&&(!Array.isArray(values)||values.length))throw Error('Candidate retains adapter-observed negative or malformed review evidence: '+job.id);
}
// Candidate-equivalent authenticated targets share one negative history. An ID
// change or quarantined/rejected output never launders a negative judgment.
export function reviewContinuationAdverse(s,subject,exceptionJobId,ownJobId=null) {
  for(const r of Object.values(s.records))if(r.kind==='review'&&equivalent(s,s.records[r.review_of?.id],subject)&&['Fail','Blocked'].includes(r.review?.verdict))throw Error('Candidate retains a failed/blocked review: '+r.id);
  for(const j of Object.values(s.jobs)) {
    if(j.role!=='qa')continue;
    const q=canonicalJobSubject(s,j);
    if(!q||(q.candidate_id??q.candidate?.id)!==subject.candidate.id&&q.candidate_sha256!==subject.candidate_sha256)continue;
    // The own prospective completedJob is checked below for usable Pass. Do
    // not turn an honest current negative verdict into a transport rejection.
    if(j.id===ownJobId)continue;
    modelNegative(j);
    if(negativeWire(j))throw Error('Candidate retains rejected or uncertain review evidence: '+j.id);
    if(j.id!==exceptionJobId&&(occupied(j)||['failed','cancelled','interrupted','unknown','quarantined'].includes(j.status)&&!j.artifact_id))throw Error('Another candidate review is unfinished or uncertain: '+j.id);
  }
}
function priorUnknown(s,a,evidence) {
  const j=s.jobs[a.prior_job_id];
  if(j?.role!=='qa'||j.status!=='failed'||!j.started_at||!j.native_id||closed(j)||j.artifact_id||j.review_of?.id!==evidence.receipt.id||j.review_of?.revision!==evidence.receipt.revision||j.execution_failure?.termination_confirmed!==false||j.execution_failure?.outcome!=='timeout'||!s.sessions[j.session_key]||s.sessions[j.session_key].instance_id!==j.instance_id)throw Error('Replacement exception must name the exact retained unclosed failed review');
  if(a.prior_job_sha256!==hash(j))throw Error('Prior UNKNOWN job binding changed');
  const home=s.records[a.failure_evidence_id];let body;try{body=JSON.parse(home?.content);}catch{}
  if(home?.kind!=='artifact'||!['Draft','Submitted'].includes(home.status)||!same(body?.canonical_public_terminal_job?.complete_data?.value,j))throw Error('Whole canonical prior failure evidence is missing or changed');
  return {job:j,home};
}
function permissionArgs(a) {
  requireText(a.source_instruction,'new founder primary source_instruction');requireText(a.approval_reference,'new founder primary approval_reference',300);
  if(a.model_data_approved!==true||a.unknown_prior_replacement_approved!==true)throw Error('Explicit NEW model-data and exact UNKNOWN-prior replacement approval required');
}
// The source set comes from canonical bound ancestry, never from a caller's
// editable descriptor list. Only its exact digest/count is repeated inline.
function requiredEvidence(s,p) {
  const prior=s.jobs[p.unknown_prior.job_id],receipt=s.records[p.subject.receipt.id];
  const keys=new Set([p.subject.plan.id,p.subject.candidate.id,receipt.id,p.failure_evidence.id,...(prior.inputs??[]).map(r=>r.id),...(prior.supplemental_sources??[]).map(r=>r.id)]);
  if(receipt.development.preflight_recovery_id!==undefined) {
    const recovery=s.records[receipt.development.preflight_recovery_id],r=recovery.development;
    for(const key of [recovery.id,r.subject.receipt_id,r.diagnostic_id])keys.add(key);
    if(r.proof.legacy){keys.add(r.proof.legacy.id);keys.add(s.records[r.proof.legacy.id].review_of.id);}
  }
  return [...keys].sort().map(key=>sourceRef(s,key));
}
function evidenceManifest(refs) {return {protocol:'deterministic-prior-review-evidence-v1',count:refs.length,sha256:hash(refs)};}
function verifyEvidenceManifest(s,p) {
  const refs=requiredEvidence(s,p);
  if(p.required_evidence!==undefined||!same(p.required_evidence_manifest,evidenceManifest(refs)))throw Error('Complete continuation evidence manifest changed');
  return refs;
}
export function prepareReviewContinuation(s,a,root) {
  primary(s,a);time(a.expires_at);
  if(![30,45].includes(a.code_review_window_minutes))throw Error('Continuation requires explicit proposed fixed review bounds');
  const e=developmentReviewSubject(s,a,root),{plan:p,candidate:c,receipt:t,producer,controller}=e;
  if(Date.now()<Date.parse(p.development.scope.expires_at))throw Error('Use ordinary review/acceptance while its original grant remains live');
  const prior=priorUnknown(s,a,e),subject={plan:ref(p),scope_sha256:p.development.scope_sha256,candidate:ref(c),candidate_sha256:c.development.candidate_sha256,receipt:ref(t),receipt_sha256:t.development.receipt_sha256,validation_manifest_sha256:hash(t.development.validation_manifest),producer:{id:producer.id,sha256:hash(producer),native_id:producer.native_id,instance_id:producer.instance_id},controller:{id:controller.id,sha256:hash(controller)},historical_authority_sha256:p.development.authorization.authority_sha256,original_expires_at:p.development.scope.expires_at,generations_spent:p.development.attempts.length,generations_remaining:Math.max(0,p.development.scope.max_attempts-p.development.attempts.length)};
  reviewContinuationAdverse(s,subject,prior.job.id);
  const proposal={protocol:REVIEW_CONTINUATION_PROTOCOL,status:'proposal_only_not_authorized',subject,owner:{...s.owner},expires_at:new Date(a.expires_at).toISOString(),code_review_window_minutes:a.code_review_window_minutes,per_call_timeout_ms:600000,max_review_attempts:1,unknown_prior:{job_id:prior.job.id,sha256:hash(prior.job),native_id:prior.job.native_id,session_key:prior.job.session_key,session_sha256:hash(s.sessions[prior.job.session_key]),closure:'unknown',reservation_preserved:true,replacement_exception:'one explicitly authorized independent read-only judgment; no old session replacement or closure claim'},failure_evidence:sourceRef(s,prior.home.id),requested_permissions:{review:true,accept_local_development:true,generation:false,test_execution:false,validation_reuse:false,recovery:false,source_integration:false,allowance_reset:false,prior_release:false}};
  proposal.required_evidence_manifest=evidenceManifest(requiredEvidence(s,proposal));return proposal;
}
export function authorizeReviewContinuation(s,a,root) {
  permissionArgs(a);
  const proposal=prepareReviewContinuation(s,a,root);
  if(hash(proposal)!==a.proposal_sha256)throw Error('Approve exact current continuation proposal');
  if(Object.values(s.records).some(r=>r.review_continuation_authorization?.approval_reference===a.approval_reference))throw Error('Primary approval already recorded; inspect its original target, never mint a replay');
  if(Object.values(s.records).some(r=>isTarget(r)&&r.development.proposal.unknown_prior.job_id===proposal.unknown_prior.job_id))throw Error('Exact UNKNOWN-prior exception already has a continuation target');
  const targetId=id('review-continuation'),key=id('review-continuation-authorization'),at=stamp();
  const decision={id:key,kind:'decision',author_role:'human_founder',recorded_by:a.session_id,revision:1,status:'Recorded',created_at:at,content:a.source_instruction,review_continuation_authorization:{protocol:REVIEW_CONTINUATION_PROTOCOL,target_id:targetId,proposal_sha256:hash(proposal),approval_reference:a.approval_reference,model_data_approved:true,unknown_prior_replacement_approved:true,expires_at:proposal.expires_at}};
  s.records[key]=decision;
  const authority_sha256=developmentReviewAuthority(s,proposal.subject.plan.id),target={id:targetId,kind:'artifact',author_role:'runtime',author_instance:a.session_id,revision:1,status:'Submitted',created_at:at,content:'Protected prospective independent review and local-acceptance target. Original expired grant, failures, consumed recovery and UNKNOWN reservation are unchanged.',development:{type:'review_continuation',protocol:REVIEW_CONTINUATION_PROTOCOL,plan_id:proposal.subject.plan.id,candidate_id:proposal.subject.candidate.id,receipt_id:proposal.subject.receipt.id,...(s.records[proposal.subject.receipt.id].development.preflight_recovery_id?{preflight_recovery_id:s.records[proposal.subject.receipt.id].development.preflight_recovery_id}:{}),proposal,authorization:{decision:ref(decision),authority_sha256}}};
  time(proposal.expires_at);s.records[targetId]=target;return target;
}
function targetOf(s,key,root) {
  const target=s.records[key],d=target?.development,p=d?.proposal;
  if(!isTarget(target)||target.kind!=='artifact'||target.author_role!=='runtime'||target.status!=='Submitted'||target.revision!==1||p?.protocol!==REVIEW_CONTINUATION_PROTOCOL||d.plan_id!==p.subject.plan.id||d.candidate_id!==p.subject.candidate.id||d.receipt_id!==p.subject.receipt.id)throw Error('Protected continuation target missing or invalid');
  const decision=currentRef(s,d.authorization.decision),g=decision.review_continuation_authorization;
  if(decision.kind!=='decision'||decision.author_role!=='human_founder'||decision.status!=='Recorded'||g?.protocol!==REVIEW_CONTINUATION_PROTOCOL||g.target_id!==target.id||g.proposal_sha256!==hash(p)||g.model_data_approved!==true||g.unknown_prior_replacement_approved!==true||g.expires_at!==p.expires_at||!g.approval_reference||!decision.content?.trim())throw Error('Continuation grant or proposal integrity failed');
  if(s.paused||!same(s.owner,p.owner)||d.authorization.authority_sha256!==developmentReviewAuthority(s,p.subject.plan.id))throw Error('Current continuation authority/ownership changed');
  time(p.expires_at);
  const old=s.jobs[p.unknown_prior.job_id];
  if(hash(old)!==p.unknown_prior.sha256||hash(s.sessions[p.unknown_prior.session_key])!==p.unknown_prior.session_sha256||closed(old)||!occupied(old))throw Error('Original UNKNOWN reservation or session changed');
  currentRef(s,p.failure_evidence);
  const e=developmentReviewSubject(s,{plan_id:d.plan_id,candidate_id:d.candidate_id,receipt_id:d.receipt_id,receipt_sha256:p.subject.receipt_sha256},root);
  for(const [key,value] of [['plan',e.plan],['candidate',e.candidate],['receipt',e.receipt]])if(!same(ref(value),p.subject[key]))throw Error('Historical continuation subject changed');
  if(hash(e.producer)!==p.subject.producer.sha256||hash(e.controller)!==p.subject.controller.sha256||hash(e.receipt.development.validation_manifest)!==p.subject.validation_manifest_sha256)throw Error('Historical native/controller/manifest binding changed');
  verifyEvidenceManifest(s,p);
  return target;
}
export function reviewContinuationRequiredEvidence(s,target,{root=process.cwd()}={}) {
  const current=targetOf(s,target.id,root);
  if(hash(current)!==hash(target))throw Error('Continuation target reference changed');
  return verifyEvidenceManifest(s,current.development.proposal);
}
export function reviewContinuationContextInputs(s,target) {
  if(!isTarget(target))return [];
  // Ordinary assignment construction already adds plan/candidate and recovery
  // ancestry. The old actual receipt must ALSO remain a primary whole input.
  return [target.development.receipt_id];
}
export function reviewContinuationCandidate(s,target) {return isTarget(target)?s.records[target.development.candidate_id]:null;}
// Runtime-only transaction fence. The full authority/source/evidence checks run
// under the same exclusive transaction earlier; only this cheap clock/owner
// predicate belongs after SQLite/snapshot/event writes immediately pre-COMMIT.
export function assertReviewContinuationCommit(state,control) {
  if(!control||state.paused||!same(state.owner,control.owner))throw Error('Continuation owner/paused state changed before commit');
  time(control.expires_at);return true;
}
export function reviewContinuationPrompt(target) {
  if(!isTarget(target))return '';
  const d=target.development,p=d.proposal;
  return `Independent complete-code review under this PROSPECTIVE review/local-acceptance target only. Original scope is expired, ${p.subject.generations_spent} generations remain charged, original UNKNOWN job stays occupied, and consumed recovery is not reusable. The actual historical receipt is evidence of execution, not code acceptance or a current-host rerun. Assess every full original scope/contract and retained adverse evidence. Pass only after all required whole values were actually delivered, with no blockers. Return review.verdict Pass/Fail/Blocked and reason; permitted_action accept_local_development for Pass, otherwise hold; candidate_sha256 ${p.subject.candidate_sha256}; receipt_sha256 ${p.subject.receipt_sha256}; continuation_target_sha256 ${hash(target)}; continuation_grant_sha256 ${d.authorization.decision.sha256}; continuation_authorization_sha256 ${d.authorization.authority_sha256}; blockers array. No generation, testing, recovery, reuse, integration, production/host claim, old session replacement or closure is authorized.`;
}
export function reviewContinuationSubject(s,args,{fresh=true,root=process.cwd()}={}) {
  if(!isTarget(s.records[args.review_of]))return null;
  const target=targetOf(s,args.review_of,root),p=target.development.proposal;
  if(args.role!=='qa'||args.development_id!==undefined||args.prototype_id!==undefined||args.specialist_ref!==undefined)throw Error('Continuation permits independent QA only');
  if(fresh&&(s.sessions[`qa:review:${target.id}:${target.revision}`]||Object.values(s.jobs).some(j=>j.review_of?.id===target.id)))throw Error('Continuation permits exactly ONE fresh review, not replacement/retry');
  return {protocol:'development-code-review-window-subject-v1',continuation:ref(target),receipt:p.subject.receipt,candidate:p.subject.candidate,plan:p.subject.plan,controller_sha256:p.subject.controller.sha256,candidate_sha256:p.subject.candidate_sha256,receipt_sha256:p.subject.receipt_sha256,current_authority_sha256:target.development.authorization.authority_sha256};
}
function requiredDelivery(s,job,target,{complete=false}={}) {
  const pack=JSON.parse(assignmentContext(s,job).text),inline=new Map((pack.records??[]).map(r=>[r.id,r])),ledger=job.delivered_record_reads;
  if(complete&&(ledger?.version!==1||ledger.protocol!=='record-reads-v1-runtime-delivery'||ledger.native_id!==job.native_id||ledger.initial_delivery?.assignment_context_sha256!==job.context_sha256||!/^[a-f0-9]{64}$/.test(ledger.initial_delivery?.request_sha256)||!Number.isFinite(Date.parse(ledger.initial_delivery?.delivered_at))||Date.parse(ledger.initial_delivery.delivered_at)<Date.parse(job.execution_started_at)||Date.parse(ledger.initial_delivery.delivered_at)>Date.parse(job.finished_at)||!Array.isArray(ledger.ranges)||ledger.ranges.length>64))throw Error('Missing same-native closed initial/range delivery ledger');
  for(const r of verifyEvidenceManifest(s,target.development.proposal)) {
    const value=inline.get(r.id);
    if(value!==undefined&&hash(value)===r.sha256&&JSON.stringify(value).length===r.total_characters)continue;
    if(!(job.supplemental_sources??[]).some(x=>x.id===r.id&&x.sha256===r.sha256))throw Error('Whole continuation source neither INLINE nor declared: '+r.id);
    if(!complete)continue;
    const text=JSON.stringify(currentRef(s,r)),ranges=ledger.ranges.filter(x=>x.id===r.id).sort((a,b)=>a.offset-b.offset);let end=0;
    for(const range of ranges) {
      if(range.revision!==r.revision||range.sha256!==r.sha256||range.total_characters!==text.length||!Number.isSafeInteger(range.offset)||!Number.isSafeInteger(range.length)||range.offset<0||range.length<=0||range.offset+range.length>text.length||range.range_sha256!==digest(text.slice(range.offset,range.offset+range.length))||!Number.isSafeInteger(range.round)||range.round<1||range.round>16||!/^[a-f0-9]{64}$/.test(range.request_sha256)||!Number.isFinite(Date.parse(range.delivered_at))||Date.parse(range.delivered_at)<Date.parse(job.execution_started_at)||Date.parse(range.delivered_at)>Date.parse(job.finished_at))throw Error('Closed continuation delivery range invalid: '+r.id);
      if(range.offset>end)throw Error('Whole continuation delivery has a gap: '+r.id);end=Math.max(end,range.offset+range.length);
    }
    if(end!==text.length)throw Error('Whole continuation source was not delivered: '+r.id);
  }
}
export function reviewContinuationAssignment(s,job,{reserve=false,root=process.cwd()}={}) {
  if(!isTarget(s.records[job.review_of?.id]))return null;
  const t=targetOf(s,job.review_of.id,root),p=t.development.proposal;
  if(job.role!=='qa'||job.development_id!==undefined||job.prototype_id!==undefined||job.specialist!==undefined||job.review_of.revision!==t.revision||job.epoch!==s.owner.epoch||job.host!==s.owner.host||job.session_key!==`qa:review:${t.id}:${t.revision}`||job.code_review_window_minutes!==p.code_review_window_minutes||job.timeout_ms!==p.per_call_timeout_ms)throw Error('Continuation assignment is not its exact new read-only QA window');
  if(job.execution_deadline_at!==undefined&&Date.parse(job.execution_deadline_at)>Date.parse(p.expires_at))throw Error('Review execution exceeds its new authorization deadline');
  const jobs=Object.values(s.jobs).filter(j=>j.review_of?.id===t.id&&j.review_of.revision===t.revision);
  if(reserve?jobs.some(j=>j.id!==job.id)||jobs.length>1:jobs.length!==1||jobs[0].id!==job.id)throw Error('Continuation one-review allowance is unavailable');
  reviewContinuationAdverse(s,p.subject,p.unknown_prior.job_id,job.id);requiredDelivery(s,job,t);
  return t;
}
function independent(s,job,t) {
  const p=t.development.proposal,identities=[s.owner.session_id,p.subject.producer.native_id,p.subject.producer.instance_id,p.unknown_prior.native_id,s.jobs[p.unknown_prior.job_id]?.instance_id];
  for(const r of verifyEvidenceManifest(s,p)){const v=contextSource(s,r.id);identities.push(v?.author_instance,s.jobs[v?.job_id]?.native_id);}
  if(!job.native_id||identities.some(x=>x&&[job.native_id,job.instance_id].includes(x)))throw Error('Continuation reviewer is not independent of retained authors/UNKNOWN session');
}
export function validateReviewContinuationPublication(s,job,record,{root=process.cwd(),phase='publication'}={}) {
  if(!['publication','acceptance'].includes(phase))throw Error('Unknown private continuation validation phase');
  const t=reviewContinuationAssignment(s,job,{root});if(!t)return null;
  const p=t.development.proposal,v=record.review;
  if(job.status!=='completed'||!closed(job)||job.artifact_id!==record.id||record.kind!=='review'||record.status!=='Submitted'||record.author_role!=='qa'||record.author_instance!==job.instance_id||record.job_id!==job.id||!same(record.review_of,job.review_of)||!contextMatches(s,job,job.context_sha256))throw Error('Continuation review lacks exact closed current native provenance');
  const start=Date.parse(job.execution_started_at),end=Date.parse(job.execution_deadline_at),finished=Date.parse(job.finished_at),release=Date.parse(job.coordination_release.at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==p.code_review_window_minutes*60000||!Number.isFinite(finished)||finished<start||finished>=end||!Number.isFinite(release)||release<start||release>finished||job.coordination_release.reason!=='model_process_closed'||phase==='publication'&&Date.now()>=end)throw Error('Continuation review is outside its exact closed prospective window');
  independent(s,job,t);
  if(!['Pass','Fail','Blocked'].includes(v?.verdict)||!v.reason?.trim()||v.candidate_sha256!==p.subject.candidate_sha256||v.receipt_sha256!==p.subject.receipt_sha256||v.continuation_target_sha256!==hash(t)||v.continuation_grant_sha256!==t.development.authorization.decision.sha256||v.continuation_authorization_sha256!==t.development.authorization.authority_sha256||!Array.isArray(v.blockers))throw Error('Continuation review must bind exact target/grant/candidate/result');
  // Honest negative judgments stay canonical counterevidence even if they stop
  // before completing every read. Only a usable Pass needs complete delivery.
  if(v.verdict==='Pass') {
    modelNegative(job);
    requiredDelivery(s,job,t,{complete:true});
    if(v.permitted_action!=='accept_local_development'||v.blockers.length)throw Error('Continuation Pass requires local acceptance and no blockers');
  } else if(v.permitted_action!=='hold')throw Error('Negative continuation review cannot permit acceptance');
  time(p.expires_at);return t;
}
export function acceptReviewContinuation(s,a,root) {
  primary(s,a);const t=targetOf(s,a.target_id,root),review=s.records[a.review_id],job=s.jobs[review?.job_id];
  const validated=validateReviewContinuationPublication(s,job??{},review??{},{root,phase:'acceptance'});
  if(validated?.id!==t.id||review?.review?.verdict!=='Pass')throw Error('Local acceptance requires this exact continuation Pass');
  if(review?.review_of?.id!==t.id||a.target_sha256!==hash(t)||a.candidate_sha256!==t.development.proposal.subject.candidate_sha256||a.receipt_sha256!==t.development.proposal.subject.receipt_sha256)throw Error('Local continuation acceptance subject mismatch');
  if(Object.values(s.records).some(r=>r.development?.type==='review_continuation_acceptance'&&r.development.target_id===t.id))throw Error('Continuation was already locally accepted; inspect original record');
  const key=id('review-continuation-acceptance');time(t.development.proposal.expires_at);
  return s.records[key]={id:key,kind:'artifact',author_role:'runtime',author_instance:a.session_id,revision:1,status:'Submitted',created_at:stamp(),content:'Local development code accepted under an explicit prospective continuation only. No source integration, production/host proof, old-process release, new validation execution or allowance reset.',development:{type:'review_continuation_acceptance',protocol:REVIEW_CONTINUATION_PROTOCOL,target_id:t.id,target_sha256:hash(t),review:ref(review),candidate_id:t.development.candidate_id,receipt_id:t.development.receipt_id,candidate_sha256:a.candidate_sha256,receipt_sha256:a.receipt_sha256,current_authority_sha256:t.development.authorization.authority_sha256,source_integrated:false,old_scope_unchanged:true,old_unknown_reservation_preserved:true}};
}
export function developmentReviewContinuationAction(a,host) {
  const args={...a,host};let result,control;
  if(a.action==='prepare_review_continuation')return withStore(a.root,db=>db.readSnapshot(()=>prepareReviewContinuation(db.read(),args,a.root)));
  if(!['authorize_review_continuation','accept_review_continuation'].includes(a.action))throw Error('Unknown continuation action');
  withStore(a.root,db=>db.transaction('development.'+a.action,s=>{
    result=a.action==='authorize_review_continuation'?authorizeReviewContinuation(s,args,a.root):acceptReviewContinuation(s,args,a.root);
    const target=a.action==='authorize_review_continuation'?result:s.records[a.target_id];
    control={owner:{...target.development.proposal.owner},expires_at:target.development.proposal.expires_at};return s;
  },{beforeCommit:(_db,nextState)=>{assertReviewContinuationCommit(nextState,control);}}));return result;
}
