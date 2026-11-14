// SOURCE fixture only. The actual Original adapter and launch/closure issuers
// observe a controlled Node ChildProcess emitter; no OS child or Native/model
// execution is claimed. Successful output is returned only after observed close.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {assertOriginalOrdinaryModelObservedFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {startOriginalModel} from './original-worker-model-fixture.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
export function closedMechanicalModel(f,{beforeBirth,native_id=randomUUID()}={}){
 let calls=0,closed=0;
 const model=async(...args)=>{
  calls++;
  const [host,native,prompt,cwd,timeout,selection,options]=args;
  assert.equal(host,'codex');assert.equal(native,null,'fresh independent reviewer');
  const state=f.state(),job=Object.values(state.jobs).find(value=>value.status==='running'&&value.worker_pid===process.pid);
  assert.ok(job);assert.equal(job.model_process_tracking?.invocations.length,1,'actual request journal precedes the adapter');
  beforeBirth?.({host,prompt,cwd,timeout,selection,options,job});
  const plan=state.records[job.review_of.id].origin_quarantine_plan;
  const content={protocol:'peer-origin-mechanical-review-v1',permitted_action:'quarantine_peer_origin',plan_sha256:peerDigest(plan),cut_sha256:plan.cut_sha256,maintenance_role:'reviewer',legacy_authority:'retired-without-conversion',execution_resumed:false};
  const text=JSON.stringify({content:JSON.stringify(content),messages:[],notices:[],review:{verdict:'Pass',reason:'SYNTHETIC exact SOURCE mechanics only; no native qualification.',blockers:[]}});
  let birth=null,receipt=null,observerFailed=false,observerFailure;
  const retainFailure=error=>{if(!observerFailed){observerFailed=true;observerFailure=error;}throw error;};
  const forwarded={...options,
   onModelProcess(value){try{options.onModelProcess(value);birth=copy(value);}catch(error){retainFailure(error);}},
   onModelClosure(value,closure){try{options.onModelClosure(value,closure);assert.deepEqual(value,birth);receipt=copy(closure);}catch(error){retainFailure(error);}}
  };
  const carrier=startOriginalModel([host,native,prompt,cwd,timeout,selection,forwarded],{nativeId:native_id});
  // Deliver output and close as test stimuli to the exact returned emitter.
  // Neither callbacks nor a cleanup path construct a birth/close receipt.
  carrier.respond(text);
  const output=await carrier.promise;
  if(observerFailed)throw observerFailure; // preserve the exact first rejection, including primitive values
  assert.ok(birth);assert.ok(receipt);assert.equal(receipt.exit_code,0);assert.equal(receipt.signal,null);
  assert.equal(assertOriginalOrdinaryModelObservedFrom(options.originalExecutionLaunch,birth,receipt),true);
  const observed=f.state().jobs[job.id].model_process_tracking.invocations[0];
  assert.deepEqual(observed.birth,birth);assert.deepEqual(observed.closure,receipt);closed++;
  return output;
 };
 return {model,get calls(){return calls;},get closed(){return closed;},native_id};
}
