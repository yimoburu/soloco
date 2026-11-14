import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store,VERSION,SCHEMA,digest} from '../plugins/soloco/runtime/store.mjs';
import {proofJobSafe,runtimeReceiptClosed} from '../plugins/soloco/runtime/current-state.mjs';
import {TIMEOUT_POLICY_VERSION,normalizeTimeout} from '../plugins/soloco/runtime/timeout.mjs';
import {recordRuntimeWorkerAssignmentFrom,prepareRuntimeWorkerLaunchFrom,assertRuntimeWorkerStartedFrom,runtimeJobOccupied,inheritRuntimeBookkeepingFrom} from '../plugins/soloco/runtime/runtime-execution.mjs';

// Explicitly preexisting FICTIONAL unqualified DATA. This fixture creates no
// Original genesis, provider process, worker birth or acceptance evidence.
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fictional-runtime-context-'));
  fs.mkdirSync(path.join(root,'.company'),{mode:0o700});
  const at=new Date().toISOString(),governance='FICTIONAL Source bookkeeping mechanics only; no execution authority.';
  const state={schema:SCHEMA,runtime_version:VERSION,plugin_version:VERSION,id:'fictional-runtime-context',name:'Fictional runtime context',idea:'Synthetic mechanical checks',phase:'Frame',mode:'preparation',paused:false,owner:{host:'codex',session_id:'fictional-owner',epoch:1},governance,governance_sha256:digest(governance),cos_instructions:governance,roles:{qa:{name:'Fictional QA'}},records:{},jobs:{},sessions:{},messages:[],notices:[],upgrade_history:[],revision:0,created_at:at,updated_at:at};
  const raw=new DatabaseSync(path.join(root,'.company','company.sqlite'));
  try{raw.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');raw.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(state));raw.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fixture.historical_unqualified',JSON.stringify({revision:0,owner:state.owner}));}finally{raw.close();}
  const store=new Store(root);
  t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
  return store;
}
function queued(store){
  const job={id:'job-fictional-context',role:'qa',host:'codex',instance_id:'fictional-qa-instance',session_key:'fictional-qa-session',epoch:1,status:'queued',native_id:null,created_at:new Date().toISOString(),timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout({timeout_ms:60000,timeout_reason:'Bounded fictional Source custody check'})};
  store.transaction('job.queued',state=>{recordRuntimeWorkerAssignmentFrom(store,state,job);state.jobs[job.id]=job;return state;});
  return job.id;
}

test('unqualified mechanical context omission needs actual Store bookkeeping, not copied DATA',t=>{
  const store=fixture(t),jobId=queued(store),state=store.read();
  assert.equal(Object.hasOwn(state,'original_execution_origin'),false);
  assert.equal(Object.hasOwn(state.jobs[jobId],'original_execution_assignment'),false);
  assert.equal(proofJobSafe(state.jobs[jobId],state),true);
  assert.equal(runtimeReceiptClosed(state,state.jobs[jobId]),false,'Context bookkeeping does not finalize a worker receipt');
  const detached=JSON.parse(JSON.stringify(state));
  assert.equal(proofJobSafe(detached.jobs[jobId],detached),false);
  assert.equal(inheritRuntimeBookkeepingFrom(state,detached),true);
  assert.equal(proofJobSafe(detached.jobs[jobId],detached),true);
  detached.jobs[jobId].legacy_runtime.protocol='fabricated-unqualified-proof';
  assert.equal(proofJobSafe(detached.jobs[jobId],detached),false);
  const other={...state,id:'different-company'};
  assert.equal(inheritRuntimeBookkeepingFrom(state,other),null);
  store.transaction('fixture.completion_label',current=>{current.jobs[jobId].status='completed';return current;});
  const labelled=store.read();
  assert.equal(proofJobSafe(labelled.jobs[jobId],labelled),true,'Mechanical context stays readable during completion');
  assert.equal(runtimeReceiptClosed(labelled,labelled.jobs[jobId]),false,'A completed label cannot finalize an unobserved carrier');
});

test('committed worker request stays occupied without birth and cannot be reissued or fabricated',t=>{
  const store=fixture(t),jobId=queued(store);
  store.transaction('job.worker_launch_requested',state=>{prepareRuntimeWorkerLaunchFrom(store,state,{job_id:jobId,kind:'worker'});return state;});
  const requested=store.read().jobs[jobId].legacy_runtime.worker;
  assert.equal(requested.birth,null);assert.equal(requested.closure,null);
  assert.throws(()=>store.transaction('job.worker_launch_requested',state=>{prepareRuntimeWorkerLaunchFrom(store,state,{job_id:jobId,kind:'worker'});return state;}));
  assert.throws(()=>store.transaction('job.started',state=>{assertRuntimeWorkerStartedFrom(store,state,jobId);state.jobs[jobId].status='running';return state;}));
  assert.throws(()=>store.transaction('job.legacy_runtime.born',state=>{state.jobs[jobId].legacy_runtime.worker.birth={pid:process.pid,observed_at:new Date().toISOString()};return state;}));
  store.transaction('job.spawn_failed',state=>{state.jobs[jobId].status='failed';return state;});
  const failed=store.read().jobs[jobId];
  assert.equal(failed.status,'failed');assert.equal(failed.started_at,undefined);
  assert.deepEqual(failed.legacy_runtime.worker,requested);
  assert.equal(runtimeJobOccupied(failed),true);
  assert.equal(Object.hasOwn(failed,'original_execution_assignment'),false);
});
