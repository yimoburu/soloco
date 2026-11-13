import {retentionRepairContextInputs} from './development-retention-repair.mjs';
import {reviewContinuationContextInputs} from './development-review-continuation.mjs';
import {operatingReviewContext,operatingContext} from './operating-state.mjs';
import {scopedAssignment,scopedMatches,isScopedJob,SCOPED_LIMITS} from './scoped-context.mjs';
import { handoverReviewContext } from './handover.mjs';
import { digest } from './store.mjs';
import { developmentTransportBudget } from './development-limits.mjs';
import {governingRecords,mandatoryExecutionEvidence,reviewedContext,currentRecords,currentExecutionEvidence,recordReference,validateContextPlan,contextSource,currentExtensions} from './current-state.mjs';
import {buildQualificationEvidence,evidencePage} from './upgrade-evidence.mjs';
import {buildQualificationReviewFrame} from './qualification-frame.mjs';
import {hasSnapshotReferences,inheritSnapshots} from './snapshot.mjs';
import {qualificationAssignment,qualificationMatches,QUALIFICATION_LIMITS} from './context-qualification.mjs';
import {taskAssignmentContext,taskContextMatches,TASK_CONTEXT_BUDGET} from './task-context.mjs';
import {specialistContext} from './specialists.mjs';
import {createOriginMechanicalQaWire} from './peers/origin-mechanical-qa-wire-contract.mjs';

export const CONTEXT_LIMIT = 200000;
// An immutable runtime task cannot select a legacy builder by changing its job
// format. The task validator must reject that mismatch before any delivery.
const hasTaskContext=job=>Object.hasOwn(job,'runtime_task')||[7,8].includes(job.context_format);
const required = record => ['intent', 'decision', 'preference'].includes(record.kind)
  || ['Fail', 'Blocked'].includes(record.review?.verdict);

export function contextBudgetForJob(state,job) {
  if(hasTaskContext(job))return TASK_CONTEXT_BUDGET;
  const target=state.records[job.review_of?.id];
  if(target?.scoped_context_target)return SCOPED_LIMITS.input_bytes;
  if(target?.context_qualification_target)return QUALIFICATION_LIMITS.input_bytes;
  const planId=job.development_id??target?.development?.plan_id??target?.preflight_qualification?.plan_id;
  const scope=planId&&state.records[planId]?.development?.scope;
  return scope?.transport_max_characters===undefined?CONTEXT_LIMIT:developmentTransportBudget(scope.max_bytes);
}

// Every supplied fact is a dependency. Never silently trim a constraint or input.
// Revisionless canonical records use explicit null in persisted input DTOs.
// Normalize the source side only; a missing incoming revision remains invalid.
export function assignmentContext(state, job) {
  if(job.specialist!==undefined&&(![3,5,6,7,8].includes(job.context_format)||job.review_of||job.prototype_id||job.development_id))throw Error('Specialist profile is unsupported for this assignment context');
  if(hasTaskContext(job))return taskAssignmentContext(state,job);
  const specialist=job.specialist===undefined?{}:{specialist:specialistContext(state,job)};
  const operatingReview=operatingReviewContext(state,job);if(operatingReview)return operatingReview;
  if(job.context_format===6){
    const checkpoint=operatingContext(state,{scope:job.context_scope??'*',job_id:job.id});
    const records=(job.inputs??[]).map(ref=>{const r=state.records[ref.id];if(!r||(r.revision??null)!==ref.revision)throw Error('Assignment input version changed');return r;});
    const text=JSON.stringify({protocol:'operating-assignment-v1',checkpoint,charter:state.roles[job.role],...specialist,assignment:{task:job.task,...(job.output_contract?{output_contract:job.output_contract,output_rule:'Return an unaccepted proposal only. It changes no current knowledge or authority. Surface discovered restrictions, contradictions and uncertain obligations as notices; required notices are never suppressed. Return only content, messages and notices.'}:{}),context_scope:job.context_scope??'*',coordination:job.coordination??null,model_selection:job.model_selection??{mode:'default'}},records,supplemental_evidence:{protocol:'record-reads-v1',available:true,sources:job.supplemental_sources??[],lookup:'company_context inspect/read',rule:job.output_contract==='operating-proposal-v1'?'Read only IDs explicitly listed in supplemental_evidence.sources. The complete inline records and checkpoint homes are supplied evidence. Checkpoint acceptance receipts are provenance, not a request to repeat publication review. If sources is empty, supplemental reads are unavailable; use the supplied evidence and disclose any substantive gap.':'Request exact known source IDs and hashes; missing input holds work'}});
    if(text.length>CONTEXT_LIMIT)throw Error('Operating assignment exceeds supported coherent context; Held');
    return {text,hash:digest(text),inputs:records.map(r=>({id:r.id,revision:r.revision??null}))};
  }
  if(isScopedJob(state,job))return scopedAssignment(state,job);
  const qualification=qualificationAssignment(state,job);if(qualification)return qualification;
  const handover=handoverReviewContext(state,job);if(handover)return handover;
  if(job.context_format===4)return qualificationReviewContext(state,job);
  const {pack,records,bounded,prototypeId,developmentId}=assignmentPack(state,job,specialist);
  const text = JSON.stringify(pack);
  const limit=contextBudgetForJob(state,job);
  if (text.length > limit) throw new Error(`Assignment context exceeds ${limit} characters (actual ${text.length}); narrow the assignment or review and compact records. Nothing was truncated. Host/model context fit remains unverified`);
  const hashText=bounded&&(prototypeId||developmentId)?JSON.stringify({...pack,name:undefined}):text;
  return {text, hash: digest(hashText), inputs: records.map(r => ({id:r.id, revision:r.revision??null}))};
}

// Private exact pack composition, shared without a generic budget override.
function assignmentPack(state,job,specialist){
  const bounded=[3,5].includes(job.context_format),projection=bounded?reviewedContext(state):null;
  const ids = new Set((job.context_format===5?currentRecords(state,job,projection):bounded?governingRecords(state,job,projection):Object.values(state.records).filter(required)).map(r => r.id));
  const classificationPlan=state.records[job.review_of?.id]?.context_classification_plan;
  if(classificationPlan){validateContextPlan(state,classificationPlan);for(const source of [...classificationPlan.sources,...(classificationPlan.counterparts??[])])if(state.records[source.id])ids.add(source.id);}
  const prototypeId=job.prototype_id ?? state.records[job.review_of?.id]?.prototype?.plan_id;
  if(prototypeId) {
    if(!state.records[prototypeId]) throw new Error('Prototype scope is missing');
    ids.add(prototypeId);
  }
  const target=state.records[job.review_of?.id];
  for(const key of reviewContinuationContextInputs(state,target))ids.add(key);
  for(const key of retentionRepairContextInputs(state,job))ids.add(key);
  const developmentId=job.development_id ?? target?.development?.plan_id;
  if(developmentId) {
    if(!state.records[developmentId]) throw new Error('Development scope missing');
    ids.add(developmentId);
    if(target?.development?.candidate_id)ids.add(target.development.candidate_id);
    if(target?.development?.preflight_recovery_id){const recovery=state.records[target.development.preflight_recovery_id];if(!recovery)throw Error('Recovery request missing');ids.add(recovery.id);ids.add(recovery.development.subject.receipt_id);ids.add(recovery.development.diagnostic_id);if(recovery.development.proof.legacy)ids.add(recovery.development.proof.legacy.id);}
    if(target?.development?.reused_from)ids.add(target.development.reused_from);
    if(target?.development?.reuse_qualification)ids.add(target.development.reuse_qualification.id);
  }
  for (const ref of [...job.inputs, ...(job.review_of ? [job.review_of] : [])]) {
    const record = state.records[ref.id];
    if (!record || (record.revision??null) !== ref.revision) throw new Error('Assignment input version changed');
    ids.add(ref.id);
  }
  const records = [...ids].sort().map(key => state.records[key]);
  const pack = {
    company_id: state.id, name: state.name, idea: state.idea,
    mode: state.mode, phase: state.phase, team_sha256: state.team_sha256,
    governance: state.governance, charter: state.roles[job.role], ...specialist, records,
    // Resolution ends pending attention; its conditions remain company evidence.
    notices: state.notices.map(({deliveries, seen_at, ...n}) => n),
    messages: state.messages.filter(m => m.to === job.role),
    ...([2,3,5].includes(job.context_format)?{assignment:{...(job.coordination?{coordination:job.coordination}:{}),...(Object.hasOwn(job,'expected_deliverable')?{expected_deliverable:job.expected_deliverable}:{}),...(Object.hasOwn(job,'requester')?{requester:job.requester}:{}),...(job.context_scope?{context_scope:job.context_scope}:{}),task:job.task,task_summary:job.task_summary??null,next_handoff:job.next_handoff??null,model_selection:job.model_selection??{mode:'default'},model_catalog:job.model_catalog??null}}:{}),
  };
  if(bounded)pack.supplemental_evidence={protocol:'record-reads-v1',available:true,sources:job.supplemental_sources??[],lookup:'company_context inspect/read',rule:'Request exact known source IDs and hashes; missing input holds work'};
  if(job.context_format===3){const homes=mandatoryExecutionEvidence(state,projection);if(homes.length)pack.mandatory_execution_evidence=homes;}
  if(bounded&&Object.keys(currentExtensions(state)).length)pack.state_extensions=currentExtensions(state);
  if(job.context_format===5)pack.current_execution_evidence=currentExecutionEvidence(state,job,projection);
  if(job.context_format===5&&hasSnapshotReferences({records,execution:pack.current_execution_evidence,extensions:pack.state_extensions??{}}))throw Error('Unqualified referenced evidence remains current; obtain exact independent qualification before ordinary dispatch');
  if(classificationPlan)pack.classification_evidence=[...classificationPlan.sources,...(classificationPlan.counterparts??[])];
  return {pack,records,bounded,prototypeId,developmentId};
}

// Fixed mechanical DATA representation only. All execution authority remains
// in the original policy/owning Store path; this cannot authorize dispatch.
export function originMechanicalQaAssignmentContext(state,job,plan_ref){
  if(job.role!=='qa'||job.context_format!==3||job.specialist!==undefined||job.prototype_id!==undefined||job.development_id!==undefined||job.context_scope!==undefined||job.review_of?.id!==plan_ref.id||job.review_of.revision!==plan_ref.revision)throw Error('ORIGIN_MECHANICAL_QA_CONTEXT_PURPOSE');
  const {pack,records}=assignmentPack(state,job,{});
  const context=createOriginMechanicalQaWire(JSON.stringify(pack),plan_ref);
  return {context,inputs:records.map(r=>({id:r.id,revision:r.revision??null}))};
}

export function qualificationReviewContext(state,job) {
  const plan=state.records[job.review_of?.id];
  if(job.role!=='qa'||job.prototype_id||job.development_id||plan?.context_classification_plan?.version!==2)throw Error('Context format 4 requires independent v2 qualification QA');
  validateContextPlan(state,plan.context_classification_plan);
  const evidence=buildQualificationEvidence(state,plan,job),stream=evidence.sources[evidence.pages[0].source_id];
  const registry=Object.values(evidence.sources).find(s=>s.kind==='source-index');
  const ref=s=>({source_id:s.source_id,sha256:s.sha256,length:s.length});
  const read_ranges=evidence.pages.filter(page=>page.source_id===stream.source_id)
    .flatMap(page=>evidencePage(evidence,page).citation_ranges.map(({offset,length})=>({offset,length})));
  const text=JSON.stringify(buildQualificationReviewFrame({
    plan:{id:plan.id,revision:plan.revision,sha256:digest(JSON.stringify(plan.context_classification_plan))},
    required_semantics:ref(stream),registry:ref(registry),read_ranges,
    charter:state.roles[job.role],assignment:{task:job.task,instance_id:job.instance_id??null}
  }));
  if(text.length>CONTEXT_LIMIT)throw Error('Qualification packet exceeds context bound');
  return {text,hash:digest(text),qualification_evidence:evidence,initial_delivery:[],inputs:[{id:plan.id,revision:plan.revision}]};
}

// Declared and retrieved evidence stays bound after generation, even when later
// review/output context is allowed to change. This does not rebuild that context.
export function supplementalMatches(state, job) {
  try {
    const current=state.jobs[job.id]??job;
    for(const ref of [...(current.supplemental_sources??[]),...(current.retrieved_inputs??[])])if(digest(JSON.stringify(contextSource(state,ref.id)))!==ref.sha256)return false;
    return true;
  }
  catch { return false; }
}

export function contextMatches(state, job, hash) {
  try {
    if(hasTaskContext(job))return taskContextMatches(state,job,hash);
    if(isScopedJob(state,job))return scopedMatches(state,job,hash);
    if(state.records?.[job.review_of?.id]?.context_qualification_target)return qualificationMatches(state,job,hash);
    // A job's published notices/messages are outputs, not changes to its inputs.
    // They remain in the real state and every subsequent assignment's context.
    if(!supplementalMatches(state,job))return false;
    if(state.records?.[job.review_of?.id]?.operating_plan||job.context_format===6)return assignmentContext(state,state.jobs[job.id]??job).hash===hash;
    const view=inheritSnapshots(state,{...state,notices:state.notices.filter(n=>n.job_id!==job.id),messages:state.messages.filter(m=>m.job_id!==job.id)});
    return assignmentContext(view, state.jobs[job.id]??job).hash === hash;
  }
  catch { return false; }
}
