// Recovery policy is software-owned. Message wording and worker output cannot
// turn an unknown failure into permission to retry an execution.
const policies=Object.freeze({
  DEPENDENCY_PENDING:{owner:'runtime',automatic:true,next_action:'Wait for the declared producer or reviewer, then revalidate its exact result.'},
  AUTHORITY_CHANGED:{owner:'cos',automatic:false,next_action:'Read current ownership and authority before proposing further work.'},
  PAUSED:{owner:'founder',automatic:false,next_action:'Wait for an authorized resume; elapsed time grants no authority.'},
  CAPACITY_BUSY:{owner:'runtime',automatic:true,next_action:'Wait for confirmed capacity, then recheck the unstarted task.'},
  RESOURCE_BUSY:{owner:'runtime',automatic:true,next_action:'Wait for confirmed resource release, then recheck the unstarted task.'},
  GENERATION_CHANGED:{owner:'runtime',automatic:false,next_action:'Stop this supervisor generation; inspect the current runtime owner.'},
  HOST_UNAVAILABLE:{owner:'cos',automatic:false,next_action:'Restore the supported host, inspect the unstarted task, and reconcile within existing authority.'},
  CONTEXT_CAPACITY:{owner:'cos',automatic:false,next_action:'Preserve exact held inputs and attempts; independently qualify current evidence, then prepare a separately authorized current-owner task or valid unstarted amendment. No unchanged retry, raised cap or truncation; no new permission is granted.'},
  CONTEXT_CHANGED:{owner:'cos',automatic:false,next_action:'Read the changed evidence and prepare a separately bounded task if existing authority covers it.'},
  DEFINITION_CHANGED:{owner:'cos',automatic:false,next_action:'Retain the superseded attempt, confirm closure, and prepare a task for the current definition.'},
  EXECUTION_UNCERTAIN:{owner:'cos',automatic:false,next_action:'Inspect retained execution evidence and confirm closure before releasing resources or starting replacement work.'},
  REVIEW_HELD:{owner:'cos',automatic:false,next_action:'Read the exact review and route an authorized repair or the concrete missing decision.'},
  UNKNOWN:{owner:'cos',automatic:false,next_action:'Inspect the exact retained error and task sources; no automatic retry is permitted.'}
});
export class SchedulingHold extends Error {
  constructor(code,message){super(message);this.name='SchedulingHold';this.code=Object.hasOwn(policies,code)?code:'UNKNOWN';}
}
export function schedulingRecovery(error){
  const code=error instanceof SchedulingHold?error.code:'UNKNOWN';
  return {code,...policies[code],retry_execution:false};
}
export function taskRecovery(task,job){
  if(!['needs_attention','cancelling'].includes(task.state))return null;
  const code=job&&job.coordination_release?.termination_confirmed!==true?'EXECUTION_UNCERTAIN':task.attention_code??'UNKNOWN';
  return {code,...(policies[code]??policies.UNKNOWN),retry_execution:false};
}
export const recoveryCode=code=>typeof code==='string'&&Object.hasOwn(policies,code);
