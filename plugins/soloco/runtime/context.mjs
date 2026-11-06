import { handoverReviewContext } from './handover.mjs';
import { digest } from './store.mjs';
import { developmentTransportBudget } from './development-limits.mjs';
import {governingRecords,mandatoryExecutionEvidence,reviewedContext,currentRecords,currentExecutionEvidence,recordReference,validateContextPlan,contextSource,currentExtensions} from './current-state.mjs';
import {buildQualificationEvidence} from './upgrade-evidence.mjs';
import {hasSnapshotReferences,inheritSnapshots} from './snapshot.mjs';
import {qualificationAssignment,qualificationMatches,QUALIFICATION_LIMITS} from './context-qualification.mjs';

export const CONTEXT_LIMIT = 200000;
const required = record => ['intent', 'decision', 'preference'].includes(record.kind)
  || ['Fail', 'Blocked'].includes(record.review?.verdict);

export function contextBudgetForJob(state,job) {
  const target=state.records[job.review_of?.id];
  if(target?.context_qualification_target)return QUALIFICATION_LIMITS.input_bytes;
  const planId=job.development_id??target?.development?.plan_id;
  const scope=planId&&state.records[planId]?.development?.scope;
  return scope?.transport_max_characters===undefined?CONTEXT_LIMIT:developmentTransportBudget(scope.max_bytes);
}

// Every supplied fact is a dependency. Never silently trim a constraint or input.
export function assignmentContext(state, job) {
  const qualification=qualificationAssignment(state,job);if(qualification)return qualification;
  const handover=handoverReviewContext(state,job);if(handover)return handover;
  if(job.context_format===4)return qualificationReviewContext(state,job);
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
  const developmentId=job.development_id ?? target?.development?.plan_id;
  if(developmentId) {
    if(!state.records[developmentId]) throw new Error('Development scope missing');
    ids.add(developmentId);
    if(target?.development?.candidate_id)ids.add(target.development.candidate_id);
    if(target?.development?.reused_from)ids.add(target.development.reused_from);
    if(target?.development?.reuse_qualification)ids.add(target.development.reuse_qualification.id);
  }
  for (const ref of [...job.inputs, ...(job.review_of ? [job.review_of] : [])]) {
    const record = state.records[ref.id];
    if (!record || record.revision !== ref.revision) throw new Error('Assignment input version changed');
    ids.add(ref.id);
  }
  const records = [...ids].sort().map(key => state.records[key]);
  const pack = {
    company_id: state.id, name: state.name, idea: state.idea,
    mode: state.mode, phase: state.phase, team_sha256: state.team_sha256,
    governance: state.governance, charter: state.roles[job.role], records,
    notices: state.notices.filter(n => !n.resolution).map(({deliveries, seen_at, ...n}) => n),
    messages: state.messages.filter(m => m.to === job.role),
    ...([2,3,5].includes(job.context_format)?{assignment:{...(job.coordination?{coordination:job.coordination}:{}),...(Object.hasOwn(job,'expected_deliverable')?{expected_deliverable:job.expected_deliverable}:{}),...(Object.hasOwn(job,'requester')?{requester:job.requester}:{}),...(job.context_scope?{context_scope:job.context_scope}:{}),task:job.task,task_summary:job.task_summary??null,next_handoff:job.next_handoff??null,model_selection:job.model_selection??{mode:'default'},model_catalog:job.model_catalog??null}}:{}),
  };
  if(bounded)pack.supplemental_evidence={protocol:'record-reads-v1',available:true,sources:job.supplemental_sources??[],lookup:'company_context inspect/read',rule:'Request exact known source IDs and hashes; missing input holds work'};
  if(job.context_format===3){const homes=mandatoryExecutionEvidence(state,projection);if(homes.length)pack.mandatory_execution_evidence=homes;}
  if(bounded&&Object.keys(currentExtensions(state)).length)pack.state_extensions=currentExtensions(state);
  if(job.context_format===5)pack.current_execution_evidence=currentExecutionEvidence(state,job,projection);
  if(job.context_format===5&&hasSnapshotReferences({records,execution:pack.current_execution_evidence,extensions:pack.state_extensions??{}}))throw Error('Unqualified referenced evidence remains current; obtain exact independent qualification before ordinary dispatch');
  if(classificationPlan)pack.classification_evidence=[...classificationPlan.sources,...(classificationPlan.counterparts??[])];
  const text = JSON.stringify(pack);
  const limit=contextBudgetForJob(state,job);
  if (text.length > limit) throw new Error(`Assignment context exceeds ${limit} characters (actual ${text.length}); narrow the assignment or review and compact records. Nothing was truncated. Host/model context fit remains unverified`);
  const hashText=bounded&&(prototypeId||developmentId)?JSON.stringify({...pack,name:undefined}):text;
  return {text, hash: digest(hashText), inputs: records.map(r => ({id:r.id, revision:r.revision}))};
}

export function qualificationReviewContext(state,job) {
  const plan=state.records[job.review_of?.id];
  if(job.role!=='qa'||job.prototype_id||job.development_id||plan?.context_classification_plan?.version!==2)throw Error('Context format 4 requires independent v2 qualification QA');
  validateContextPlan(state,plan.context_classification_plan);
  const evidence=buildQualificationEvidence(state,plan,job),stream=evidence.sources[evidence.pages[0].source_id];
  const registry=Object.values(evidence.sources).find(s=>s.kind==='source-index');
  const ref=s=>({source_id:s.source_id,sha256:s.sha256,length:s.length});
  const text=JSON.stringify({protocol:'context-qualification-review-v2',plan:{id:plan.id,revision:plan.revision,sha256:digest(JSON.stringify(plan.context_classification_plan))},
    required_semantics:ref(stream),registry:ref(registry),range_limit:32768,
    rule:'Read the complete required_semantics stream on this native session before Pass. Use exact source_id/sha256 UTF-16 range reads. No fixed round count; runtime deadlines and per-request transport bounds remain. Only runtime delivery receipts prove coverage. Pass requires coverage_complete:true, obligations_preserved:true, unique_findings:[], blockers:[], permitted_action:apply_context_classification and the exact plan_sha256. Every missing or uncertain semantic counterpart blocks qualification.'});
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
    if(state.records?.[job.review_of?.id]?.context_qualification_target)return qualificationMatches(state,job,hash);
    // A job's published notices/messages are outputs, not changes to its inputs.
    // They remain in the real state and every subsequent assignment's context.
    if(!supplementalMatches(state,job))return false;
    const view=inheritSnapshots(state,{...state,notices:state.notices.filter(n=>n.job_id!==job.id),messages:state.messages.filter(m=>m.job_id!==job.id)});
    return assignmentContext(view, state.jobs[job.id]??job).hash === hash;
  }
  catch { return false; }
}
