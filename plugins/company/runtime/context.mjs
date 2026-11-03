import { digest } from './store.mjs';

export const CONTEXT_LIMIT = 200000;
const required = record => ['intent', 'decision', 'preference'].includes(record.kind)
  || ['Fail', 'Blocked'].includes(record.review?.verdict);

// Every supplied fact is a dependency. Never silently trim a constraint or input.
export function assignmentContext(state, job) {
  const ids = new Set(Object.values(state.records).filter(required).map(r => r.id));
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
  };
  const text = JSON.stringify(pack);
  if (text.length > CONTEXT_LIMIT) throw new Error('Assignment context exceeds 200000 characters; narrow the assignment or review and compact records. Nothing was truncated');
  return {text, hash: digest(text), inputs: records.map(r => ({id:r.id, revision:r.revision}))};
}

export function contextMatches(state, job, hash) {
  try { return assignmentContext(state, job).hash === hash; }
  catch { return false; }
}
