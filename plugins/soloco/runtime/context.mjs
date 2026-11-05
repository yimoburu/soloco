import { digest } from './store.mjs';

export const CONTEXT_LIMIT = 200000;
const required = record => ['intent', 'decision', 'preference'].includes(record.kind)
  || ['Fail', 'Blocked'].includes(record.review?.verdict);

// Every supplied fact is a dependency. Never silently trim a constraint or input.
export function assignmentContext(state, job) {
  const ids = new Set(Object.values(state.records).filter(required).map(r => r.id));
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
    ...(job.context_format===2?{assignment:{...(Object.hasOwn(job,'expected_deliverable')?{expected_deliverable:job.expected_deliverable}:{}),...(Object.hasOwn(job,'requester')?{requester:job.requester}:{}),task:job.task,task_summary:job.task_summary??null,next_handoff:job.next_handoff??null,model_selection:job.model_selection??{mode:'default'},model_catalog:job.model_catalog??null}}:{}),
  };
  const text = JSON.stringify(pack);
  if (text.length > CONTEXT_LIMIT) throw new Error('Assignment context exceeds 200000 characters; narrow the assignment or review and compact records. Nothing was truncated');
  return {text, hash: digest(text), inputs: records.map(r => ({id:r.id, revision:r.revision}))};
}

export function contextMatches(state, job, hash) {
  try {
    // A job's published notices/messages are outputs, not changes to its inputs.
    // They remain in the real state and every subsequent assignment's context.
    const view={...state,notices:state.notices.filter(n=>n.job_id!==job.id),messages:state.messages.filter(m=>m.job_id!==job.id)};
    return assignmentContext(view, state.jobs[job.id]??job).hash === hash;
  }
  catch { return false; }
}
