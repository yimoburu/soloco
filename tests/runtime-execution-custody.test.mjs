// SOURCE-only custody checks. The Node creation boundary is controlled here;
// these events do not qualify a Native process or a historical execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {Store,inspectRuntimeStoreCommitWitnessFrom} from '../plugins/soloco/runtime/store.mjs';
import {normalizeTimeout,STARTUP_TIMEOUT_MS,DEFAULT_EXECUTION_TIMEOUT_MS} from '../plugins/soloco/runtime/timeout.mjs';
import {
  recordRuntimeWorkerAssignmentFrom,prepareRuntimeWorkerLaunchFrom,spawnRuntimeWorkerLaunch,
  commitRuntimeExecutionWriteFrom,runtimeJobOccupied,legacyRuntimeFailedLaunchChild,
  legacyRuntimeFailedLaunchClosed,cleanupLegacyRuntimeLaunchFailure,
  assertRuntimeModelProcessObservedFrom,runtimeExecutionDeadlineFrom,assertRuntimeWorkerStartedFrom,
  prepareRuntimeModelRequestFrom,approveRuntimeModelProcessObservationFrom
} from '../plugins/soloco/runtime/runtime-execution.mjs';
import {runRuntimeModel} from '../plugins/soloco/runtime/adapters.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';

const roots=[];test.after(()=>{for(const root of roots)fs.rmSync(root,{recursive:true,force:true});});
function fixture(timeoutPolicy={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fictional-runtime-custody-'));roots.push(root);
  const directory=path.join(root,'.company');fs.mkdirSync(directory,{mode:0o700});
  const at=new Date().toISOString(),state={id:'fictional-company',revision:0,owner:{host:'codex',session_id:'fictional-owner',epoch:1},paused:false,mode:'preparation',phase:'Frame',roles:{engineer:{name:'Fictional engineer'}},records:{},jobs:{},sessions:{},messages:[],notices:[],created_at:at,updated_at:at};
  const raw=new DatabaseSync(path.join(directory,'company.sqlite'));
  raw.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');
  raw.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(state));raw.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fictional.historical_unqualified',JSON.stringify({revision:0,owner:state.owner}));raw.close();
  const store=new Store(root),job={id:'fictional-job',role:'engineer',instance_id:'fictional-engineer',host:'codex',epoch:1,status:'queued',native_id:null,created_at:at,...normalizeTimeout(timeoutPolicy)};
  store.transaction('job.queued',s=>{recordRuntimeWorkerAssignmentFrom(store,s,job);s.jobs[job.id]=job;return s;});
  return {root,store,job};
}
function reserve(f,options,onToken){let token;f.store.transaction('job.worker_launch_requested',s=>{token=prepareRuntimeWorkerLaunchFrom(f.store,s,{job_id:f.job.id,kind:'worker'});onToken?.(token);return s;},options);return token;}
function noRealSpawn(t,fn){const mocked=t.mock.method(childProcess,'spawn',fn);syncBuiltinESMExports();t.after(()=>{mocked.mock.restore();syncBuiltinESMExports();});return mocked;}
function controlledChild(pid){const child=new EventEmitter();child.pid=pid;child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kills=[];child.kill=signal=>{child.kills.push(signal);return true;};return child;}

test('only an actual committed Store scope arms a capability; copied and rolled-back tokens cannot create',t=>{
  const f=fixture();t.after(()=>f.store.close());
  const spawn=noRealSpawn(t,()=>{throw Error('No creation is selected in this negative Source check');});
  let pending;
  const token=reserve(f,{beforeCommit:()=>{
    assert.throws(()=>spawnRuntimeWorkerLaunch(pending),/PRIVATE_CAPABILITY_REQUIRED/);
    assert.throws(()=>commitRuntimeExecutionWriteFrom(f.store,Object.freeze({})),error=>error?.code==='LEGACY_RUNTIME_COMMIT_WITNESS_REQUIRED');
    assert.throws(()=>inspectRuntimeStoreCommitWitnessFrom(Object.freeze({}),f.store),error=>error?.code==='LEGACY_RUNTIME_COMMIT_WITNESS_REQUIRED');
  }},value=>{pending=value;});
  assert.throws(()=>spawnRuntimeWorkerLaunch({...token}),/PRIVATE_CAPABILITY_REQUIRED/);
  assert.equal(spawn.mock.calls.length,0);
  assert.equal(runtimeJobOccupied(f.store.read().jobs[f.job.id]),true);
  assert.throws(()=>reserve(f),/LAUNCH_ALREADY_REQUESTED/);

  const rollback=fixture();t.after(()=>rollback.store.close());let lost;
  assert.throws(()=>rollback.store.transaction('job.worker_launch_requested',s=>{lost=prepareRuntimeWorkerLaunchFrom(rollback.store,s,{job_id:rollback.job.id,kind:'worker'});throw Error('Selected rollback');}),/Selected rollback/);
  assert.throws(()=>spawnRuntimeWorkerLaunch(lost),/PRIVATE_CAPABILITY_REQUIRED/);
  assert.equal(rollback.store.read().jobs[rollback.job.id].legacy_runtime.worker,null);
});

test('a committed request stays spent through reopen without becoming a new launch allowance',t=>{
  const f=fixture();reserve(f);f.store.close();
  const reopened=new Store(f.root);t.after(()=>reopened.close());
  noRealSpawn(t,()=>{throw Error('No creation is selected in this reopen Source check');});
  assert.equal(runtimeJobOccupied(reopened.read().jobs[f.job.id]),true);
  assert.throws(()=>reopened.transaction('job.worker_launch_requested',s=>{prepareRuntimeWorkerLaunchFrom(reopened,s,{job_id:f.job.id,kind:'worker'});return s;}),/LAUNCH_ALREADY_REQUESTED/);
  assert.equal(reopened.read().jobs[f.job.id].legacy_runtime.worker.birth,null);
  assert.equal(reopened.read().jobs[f.job.id].legacy_runtime.worker.closure,null);
});

test('controlled Source child observations monotonically close the one fixed worker request',t=>{
  const f=fixture();t.after(()=>f.store.close());const token=reserve(f),child=controlledChild(740001);
  const spawn=noRealSpawn(t,(command,args,options)=>{assert.equal(command,process.execPath);assert.equal(args.at(-2),f.root);assert.equal(args.at(-1),f.job.id);assert.equal(path.basename(args[1]),'worker.mjs');assert.equal(options.shell,undefined);return child;});
  assert.equal(spawnRuntimeWorkerLaunch(token),child);
  const creation=f.store.read().jobs[f.job.id].legacy_runtime.worker.deadline_at_ms;
  assert.equal(creation,Date.parse(f.job.created_at)+STARTUP_TIMEOUT_MS);
  assert.equal(runtimeExecutionDeadlineFrom(child),Date.parse(f.job.created_at)+2*STARTUP_TIMEOUT_MS+DEFAULT_EXECUTION_TIMEOUT_MS,'carrier lifetime covers the existing queue then worker-startup phases and execution; it does not reuse the creation cutoff');
  assert.throws(()=>runtimeExecutionDeadlineFrom({deadline_at_ms:Date.now()+600000}),/ACTUAL_CHILD_DEADLINE_REQUIRED/);
  assert.equal(runtimeJobOccupied(f.store.read().jobs[f.job.id]),true);
  assert.throws(()=>spawnRuntimeWorkerLaunch(token),/PRIVATE_CAPABILITY_REQUIRED/);
  child.emit('spawn');child.emit('exit',0,null);child.emit('close',0,null);
  const after=f.store.read().jobs[f.job.id].legacy_runtime.worker;
  assert.equal(after.birth.pid,child.pid);assert.equal(after.closure.pid,child.pid);assert.equal(after.closure.never_started,false);
  assert.equal(runtimeJobOccupied(f.store.read().jobs[f.job.id]),false);
  assert.equal(spawn.mock.calls.length,1);
  assert.throws(()=>assertRuntimeModelProcessObservedFrom(token,{pid:child.pid},{exit_code:0}),/MODEL_PHYSICAL_CLOSURE_REQUIRED/);
});

test('creation followed by a changed physical commit entry retains exact-child cleanup and UNKNOWN request',t=>{
  const f=fixture();t.after(()=>f.store.close());const token=reserve(f),exec=f.store.db.exec;let child,lateCommitCalls=0;
  const spawn=noRealSpawn(t,()=>{
    child=controlledChild(740002);
    // The preceding withCurrent/readSnapshot COMMIT is legitimate. Change the
    // entry only after this selected controlled creation boundary is reached.
    assert.equal(f.store.db.isTransaction,true);
    f.store.db.exec=function(sql){if(sql==='COMMIT')lateCommitCalls++;return exec.call(this,sql);};
    return child;
  });
  let failure;try{spawnRuntimeWorkerLaunch(token);}catch(error){failure=error;}finally{f.store.db.exec=exec;}
  assert.equal(spawn.mock.calls.length,1,'the physical entry changes only after the one selected creation');
  assert.equal(failure?.code,'LEGACY_RUNTIME_COMMIT_ENTRY_CHANGED');
  assert.equal(lateCommitCalls,0,'mutable COMMIT callbacks are rejected before the final native clock sample');
  assert.equal(legacyRuntimeFailedLaunchChild(failure),child);
  assert.equal(legacyRuntimeFailedLaunchChild({child}),null);
  assert.equal(legacyRuntimeFailedLaunchClosed(failure),false);
  assert.equal(cleanupLegacyRuntimeLaunchFailure(failure),true);
  assert.deepEqual(child.kills,['SIGTERM']);
  assert.equal(runtimeJobOccupied(f.store.read().jobs[f.job.id]),true);
  child.emit('spawn');child.emit('exit',1,null);child.emit('close',1,null);
  assert.equal(legacyRuntimeFailedLaunchClosed(failure),true);
  assert.equal(f.store.read().jobs[f.job.id].legacy_runtime.worker.launch_id.length,36);
  assert.throws(()=>spawnRuntimeWorkerLaunch(token),/PRIVATE_CAPABILITY_REQUIRED/);
});

test('a native busy COMMIT in a rollback-journal fixture retains exact-child cleanup and UNKNOWN request',t=>{
  const f=fixture();t.after(()=>f.store.close());const token=reserve(f),child=controlledChild(740003);
  const spawn=noRealSpawn(t,()=>child);
  // This deliberately selects rollback-journal locking for the fictional DB.
  // It is a native failure fixture, not a claim about normal WAL contention.
  f.store.db.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=0');
  const reader=new DatabaseSync(path.join(f.root,'.company','company.sqlite'));let failure;
  try{
    reader.exec('BEGIN');reader.prepare('SELECT value FROM company WHERE id=1').get();
    try{spawnRuntimeWorkerLaunch(token);}catch(error){failure=error;}
  }finally{if(reader.isTransaction)reader.exec('ROLLBACK');reader.close();}
  assert.equal(spawn.mock.calls.length,1,'the selected child boundary precedes the native COMMIT failure');
  assert.equal(failure?.errcode,5,'SQLite BUSY comes from the unchanged native COMMIT entry');
  assert.equal(legacyRuntimeFailedLaunchChild(failure),child);
  assert.equal(cleanupLegacyRuntimeLaunchFailure(failure),true);
  assert.deepEqual(child.kills,['SIGTERM']);
  assert.equal(runtimeJobOccupied(f.store.read().jobs[f.job.id]),true);
  assert.equal(f.store.read().jobs[f.job.id].legacy_runtime.worker.birth,null);
  child.emit('spawn');child.emit('exit',1,null);child.emit('close',1,null);
  assert.equal(legacyRuntimeFailedLaunchClosed(failure),true);
  assert.throws(()=>spawnRuntimeWorkerLaunch(token),/PRIVATE_CAPABILITY_REQUIRED/);
});

test('a throwing post-commit snapshot cannot leave a captured launch capability armed',t=>{
  const f=fixture();t.after(()=>f.store.close());noRealSpawn(t,()=>{throw Error('No creation is selected');});
  const snapshot=f.store.snapshotState.bind(f.store);let captured;
  f.store.snapshotState=value=>{if(!f.store.db.isTransaction)throw Error('Selected return binding failure');return snapshot(value);};
  assert.throws(()=>f.store.transaction('job.worker_launch_requested',s=>{captured=prepareRuntimeWorkerLaunchFrom(f.store,s,{job_id:f.job.id,kind:'worker'});return s;}),/Selected return binding failure/);
  f.store.snapshotState=snapshot;
  assert.throws(()=>spawnRuntimeWorkerLaunch(captured),/PRIVATE_CAPABILITY_REQUIRED/);
  assert.equal(runtimeJobOccupied(f.store.read().jobs[f.job.id]),true,'durable request stays spent despite failed return');
  assert.throws(()=>reserve(f),/LAUNCH_ALREADY_REQUESTED/);
});

test('the entire immutable assignment remains bound across a deferred creation',t=>{
  const f=fixture();t.after(()=>f.store.close());const token=reserve(f),spawn=noRealSpawn(t,()=>{throw Error('No creation is selected');});
  f.store.transaction('fictional.changed_assignment',s=>{s.jobs[f.job.id].task='Changed task after admission';s.jobs[f.job.id].context_sha256='a'.repeat(64);s.jobs[f.job.id].model_selection={mode:'explicit',model:'another-model'};return s;});
  assert.throws(()=>spawnRuntimeWorkerLaunch(token),/AUTHORITY_CHANGED/);
  assert.equal(spawn.mock.calls.length,0);
});

test('a callback cannot use mutable Date.now to commit a launch after its actual queue deadline',t=>{
  const f=fixture();t.after(()=>f.store.close());noRealSpawn(t,()=>{throw Error('No creation is selected');});
  const nativeNow=Date.now,expires=nativeNow()+1000;let captured,checked=false;
  f.store.transaction('fictional.near_queue_deadline',s=>{s.jobs[f.job.id].created_at=new Date(expires-STARTUP_TIMEOUT_MS).toISOString();return s;});
  try{
    assert.throws(()=>f.store.transaction('job.worker_launch_requested',s=>{captured=prepareRuntimeWorkerLaunchFrom(f.store,s,{job_id:f.job.id,kind:'worker'});return s;},{beforeCommit:()=>{
      checked=true;while(nativeNow()<=expires){} // Bounded one-second Source fault injection.
      Date.now=()=>0;
    }}),/expired before physical commit|CUTOFF_EXPIRED/);
  }finally{Date.now=nativeNow;}
  assert.equal(checked,true);
  assert.throws(()=>spawnRuntimeWorkerLaunch(captured),/PRIVATE_CAPABILITY_REQUIRED/);
  assert.equal(f.store.read().jobs[f.job.id].legacy_runtime.worker,null);
});

test('an actual Source callback can retain a controlled late model close after cancellation and issuer close',async t=>{
  const policy=normalizeTimeout({timeout_ms:1000,timeout_reason:'Bounded fictional late-close Source callback'}),f=fixture(policy);t.after(()=>{if(!f.store.closed)f.store.close();});
  const worker=controlledChild(process.pid),model=controlledChild(750003);model.stdin=new PassThrough();model.stdout=new PassThrough();model.stderr=new PassThrough();let calls=0;
  let workerClosed=false,modelClosed=false;worker.once('close',()=>{workerClosed=true;});model.once('close',()=>{modelClosed=true;});
  noRealSpawn(t,()=>++calls===1?worker:model);
  const workerToken=reserve(f);spawnRuntimeWorkerLaunch(workerToken);worker.emit('spawn');
  f.store.transaction('job.started',s=>{assertRuntimeWorkerStartedFrom(f.store,s,f.job.id);Object.assign(s.jobs[f.job.id],{status:'running',started_at:new Date().toISOString(),worker_pid:process.pid});return s;});
  const invocation={invocation_id:'fictional-model-invocation',job_id:f.job.id,instance_id:f.job.instance_id,worker_pid:process.pid,host:'codex',requested_at:new Date().toISOString()};let token,birth,receipt;
  f.store.transaction('job.model_process.requested',s=>{requestModelProcess(s.jobs[f.job.id],invocation);token=prepareRuntimeModelRequestFrom(f.store,s,{job_id:f.job.id,invocation_id:invocation.invocation_id,host:'codex',native_id:null,prompt:'FICTIONAL Source callback mechanics',cwd:f.root,selection:null});return s;});
  const observed=(field,value,close)=>{const db=new Store(f.root);try{db.transaction(field==='birth'?'job.model_process.born':'job.model_process.closed',s=>{if(field==='birth')recordModelProcessBirth(s.jobs[f.job.id],invocation,value);else recordModelProcessClosure(s.jobs[f.job.id],invocation,value,close);approveRuntimeModelProcessObservationFrom(db,s,token,field,value,close);return s;});}finally{db.close();}};
  const controller=new AbortController();let pending,drained,timing;
  try{
    await assert.rejects(runRuntimeModel('codex',null,'FICTIONAL Source callback mechanics',f.root,policy.timeout_ms,null,{runtimeExecutionLaunch:token,
      resolveExecutable:()=>assert.fail('Unreasoned timeout reached executable resolution'),onModelProcess:()=>assert.fail('Unreasoned timeout produced birth'),onModelClosure:()=>assert.fail('Unreasoned timeout produced closure')}),/A custom execution timeout requires a reason/);
    assert.equal(calls,1,'the missing-reason refusal creates no model child');
    assert.equal(f.store.read().jobs[f.job.id].model_process_tracking.invocations.at(-1).birth,null);assert.equal(birth,undefined);
    pending=runRuntimeModel('codex',null,'FICTIONAL Source callback mechanics',f.root,policy.timeout_ms,null,{runtimeExecutionLaunch:token,timeoutReason:policy.timeout_reason,resolveExecutable:()=>process.execPath,signal:controller.signal,
      onModelProcess:value=>{observed('birth',value);birth=value;},onModelClosure:(value,close)=>{observed('closure',value,close);receipt=close;},onSpawn:value=>{timing=value;assert.equal(value.timeout_ms,policy.timeout_ms);assert.equal(value.timeout_reason,policy.timeout_reason);}});
    // Observe the raw promise immediately. The rejection assertion is awaited
    // inline below, so a failed birth assertion cannot orphan its own rejecting
    // assert.rejects promise. Draining never turns a failed assertion into Pass.
    drained=pending.then(()=>undefined,()=>undefined);
    model.emit('spawn');assert.ok(birth);assert.ok(timing);assert.equal(calls,2);
    controller.abort();await assert.rejects(pending,/cancelled|aborted|Role/i);
    f.store.transaction('job.failed',s=>{s.jobs[f.job.id].status='failed';return s;});f.store.close();assert.equal(f.store.closed,true);
    model.emit('exit',1,'SIGTERM');model.emit('close',1,'SIGTERM');assert.ok(receipt);
    const read=new Store(f.root);try{const job=read.read().jobs[f.job.id];assert.equal(job.status,'failed');assert.deepEqual(job.model_process_tracking.invocations.at(-1).closure,receipt);}finally{read.close();}
    worker.emit('exit',1,'SIGTERM');worker.emit('close',1,'SIGTERM');
  }finally{
    controller.abort();
    if(calls===2&&!modelClosed){model.emit('exit',1,'SIGTERM');model.emit('close',1,'SIGTERM');}
    if(!workerClosed){worker.emit('exit',1,'SIGTERM');worker.emit('close',1,'SIGTERM');}
    if(drained)await drained;
  }
});
