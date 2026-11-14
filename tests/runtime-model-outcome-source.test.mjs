// SOURCE-only positive/counterexample fixtures. SQLite Store commits are real
// when selected; Node's creation boundary returns controlled EventEmitters.
// No event here is OS/Native birth, provider execution or acceptance evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {Store} from '../plugins/soloco/runtime/store.mjs';
import {normalizeTimeout} from '../plugins/soloco/runtime/timeout.mjs';
import {recordRuntimeWorkerAssignmentFrom,prepareRuntimeWorkerLaunchFrom,spawnRuntimeWorkerLaunch,assertRuntimeWorkerStartedFrom,prepareRuntimeModelRequestFrom,approveRuntimeModelProcessObservationFrom} from '../plugins/soloco/runtime/runtime-execution.mjs';
import {requestModelProcess,recordModelProcessBirth,recordModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {runRuntimeModelWithOutcome,consumeRuntimeModelOutcome,inspectRuntimeModelOutcomeCaptureFrom,assertRuntimeModelOutcomeEligible} from '../plugins/soloco/runtime/adapters.mjs';
import {prepareOriginalWorkerLaunchFrom,prepareOriginalModelRequestFrom,spawnOriginalWorkerLaunch} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {freshInventoryStore} from './original-global-worker-inventory-fixture.mjs';

const roots=[];test.after(()=>{for(const root of roots)fs.rmSync(root,{recursive:true,force:true});});
const code=expected=>error=>error?.code===expected;
const nativeAccessSync=fs.accessSync,nativeLstatSync=fs.lstatSync;
function dummyExecutableMetadata(t,root){
  const bin=path.join(root,'bin'),file=path.join(bin,'codex');
  fs.mkdirSync(bin,{mode:0o700});fs.writeFileSync(file,'Source fixture; never execute this file.\n',{mode:0o700});
  // X_OK may be denied by the enclosing exec sandbox. Qualify only the
  // resolver's exact private dummy metadata; no CLI/OS executability is proved.
  // Restore with each fixture so sequential falsy-outcome fixtures never nest.
  const access=t.mock.method(fs,'accessSync',function(...args){
    if(args.length!==2||args[0]!==file||args[1]!==fs.constants.X_OK)return Reflect.apply(nativeAccessSync,fs,args);
    for(const directory of [root,bin]){
      Reflect.apply(nativeAccessSync,fs,[directory,fs.constants.F_OK]);
      const info=nativeLstatSync(directory);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&(info.mode&0o077)===0,'private real fixture directory');
    }
    Reflect.apply(nativeAccessSync,fs,[file,fs.constants.F_OK]);
    const info=nativeLstatSync(file);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&(info.mode&0o111)!==0,'regular nonlinked executable-mode dummy');
  });
  return {bin,file,restore:()=>access.mock.restore()};
}
function child(pid){
  const value=new EventEmitter();value.pid=pid;value.stdin=new PassThrough();value.stdout=new PassThrough();value.stderr=new PassThrough();value.kills=[];value.closed=false;
  value.kill=signal=>{value.kills.push(signal);return true;};value.once('close',()=>{value.closed=true;});return value;
}
function close(value,exit=0,signal=null){if(!value.closed){value.emit('exit',exit,signal);value.emit('close',exit,signal);}}
function fixture(t,{prompt='Fictional Source input \ud800',reason='Bounded fictional Source outcome fixture'}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-model-outcome-source-'));roots.push(root);
  const directory=path.join(root,'.company');fs.mkdirSync(directory,{mode:0o700});
  const executableMetadata=dummyExecutableMetadata(t,root),bin=executableMetadata.bin;
  let disposed=false;
  const hadPath=Object.hasOwn(process.env,'PATH'),savedPath=process.env.PATH;process.env.PATH=bin;
  t.after(()=>{if(!disposed){if(hadPath)process.env.PATH=savedPath;else delete process.env.PATH;}});
  const at=new Date().toISOString(),state={id:'fictional-outcome-company',revision:0,owner:{host:'codex',session_id:'fictional-owner',epoch:1},paused:false,mode:'preparation',phase:'Frame',roles:{engineer:{name:'Fictional engineer'}},records:{},jobs:{},sessions:{},messages:[],notices:[],created_at:at,updated_at:at};
  const raw=new DatabaseSync(path.join(directory,'company.sqlite'));
  try{
    raw.exec('CREATE TABLE company(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL,value TEXT NOT NULL);');
    raw.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(state));raw.prepare('INSERT INTO events VALUES(1,?,?,?)').run(at,'fixture.preexisting_unqualified',JSON.stringify({revision:0,owner:state.owner}));
  }finally{raw.close();}
  const store=new Store(root),policy=normalizeTimeout({timeout_ms:10000,timeout_reason:reason}),job={id:'fictional-outcome-job',role:'engineer',instance_id:'fictional-outcome-engineer',host:'codex',epoch:1,status:'queued',native_id:null,task:'Source fixture only',inputs:[],created_at:at,...policy};
  t.after(()=>{if(!store.closed)store.close();});
  const worker=child(process.pid),model=child(760001);let calls=0;
  const spawn=t.mock.method(childProcess,'spawn',()=>{calls++;assert.ok(calls<=2,'no replay may create another child');return calls===1?worker:model;});syncBuiltinESMExports();
  const dispose=()=>{
    if(disposed)return;disposed=true;
    try{close(model,1,'SIGTERM');close(worker,1,'SIGTERM');}finally{
      try{if(!store.closed)store.close();}finally{spawn.mock.restore();executableMetadata.restore();syncBuiltinESMExports();if(hadPath)process.env.PATH=savedPath;else delete process.env.PATH;}
    }
  };t.after(dispose);
  store.transaction('job.queued',s=>{recordRuntimeWorkerAssignmentFrom(store,s,job);s.jobs[job.id]=job;return s;});let workerToken;
  store.transaction('job.worker_launch_requested',s=>{workerToken=prepareRuntimeWorkerLaunchFrom(store,s,{job_id:job.id,kind:'worker'});return s;});spawnRuntimeWorkerLaunch(workerToken);worker.emit('spawn');
  store.transaction('job.started',s=>{assertRuntimeWorkerStartedFrom(store,s,job.id);Object.assign(s.jobs[job.id],{status:'running',started_at:new Date().toISOString(),worker_pid:process.pid});return s;});
  const invocation={invocation_id:'fictional-outcome-invocation',job_id:job.id,instance_id:job.instance_id,worker_pid:process.pid,host:'codex',requested_at:new Date().toISOString()};let token;
  store.transaction('job.model_process.requested',s=>{requestModelProcess(s.jobs[job.id],invocation);token=prepareRuntimeModelRequestFrom(store,s,{job_id:job.id,invocation_id:invocation.invocation_id,host:'codex',native_id:null,prompt,cwd:root,selection:null});return s;});
  const observed=(field,birth,receipt)=>{const db=new Store(root);try{db.transaction(field==='birth'?'job.model_process.born':'job.model_process.closed',s=>{if(field==='birth')recordModelProcessBirth(s.jobs[job.id],invocation,birth);else recordModelProcessClosure(s.jobs[job.id],invocation,birth,receipt);approveRuntimeModelProcessObservationFrom(db,s,token,field,birth,receipt);return s;});}finally{db.close();}};
  const options={runtimeExecutionLaunch:token,timeoutReason:policy.timeout_reason,onModelProcess:birth=>observed('birth',birth),onModelClosure:(birth,receipt)=>observed('closure',birth,receipt),onSpawn:timing=>store.transaction('job.execution_started',s=>{Object.assign(s.jobs[job.id],timing);return s;})};
  const start=(overrides={},actualPrompt=prompt,timeout=policy.timeout_ms)=>runRuntimeModelWithOutcome(store,'codex',null,actualPrompt,root,timeout,null,{...options,...overrides});
  const answer=(text,{warnings=[]}={})=>{
    model.emit('spawn');
    const thread='fictional-source-thread',turn='fictional-source-turn';
    model.stdout.end([{type:'thread.started',thread_id:thread},...warnings,{type:'turn.started',thread_id:thread,turn_id:turn},{type:'item.completed',thread_id:thread,turn_id:turn,item:{id:'answer',type:'agent_message',phase:'final_answer',text}},{type:'turn.completed',thread_id:thread,turn_id:turn}].map(value=>JSON.stringify(value)+'\n').join(''));
    close(model);
  };
  return {root,store,policy,job,prompt,token,workerToken,worker,model,options,start,answer,dispose,get calls(){return calls;}};
}
async function rejected(completion){let threw=false,value;try{await completion;}catch(reason){threw=true;value=reason;}assert.equal(threw,true);return {value};}

test('a committed actual Source call captures exact immutable text and uses private positive eligibility once',async t=>{
  const f=fixture(t),different=f.prompt.slice(0,-1)+'\ud801';
  assert.equal(createHash('sha256').update(f.prompt).digest('hex'),createHash('sha256').update(different).digest('hex'),'UTF8 alone aliases these two prepared inputs');
  assert.throws(()=>f.start({},different),code('RUNTIME_MODEL_OUTCOME_INPUT_CHANGED'));assert.equal(f.calls,1);
  const operation=f.start(),text='Exact Source answer \ud800\u0000 tail';f.answer(text);const result=await operation.completion;
  result.text='caller mutation after public settlement';result.native_id='caller-mutated-session';result.cli_version='caller-invented-version';
  result.model_evidence.reported_models.push('caller-mutated-model');result.model_evidence.applied_controls.model='caller-mutated-control';
  const capture=consumeRuntimeModelOutcome(operation.call,result);
  assert.equal(capture.kind,'returned');assert.equal(capture.text,text);assert.equal(capture.process.closed,true);assert.equal(capture.process.birth.pid,f.model.pid);
  assert.equal(capture.native_id,'fictional-source-thread');assert.equal(capture.provenance.input_binding.native_id,null);
  assert.deepEqual(capture.model_evidence.reported_models,[]);assert.equal(capture.model_evidence.applied_controls.model,null);assert.equal(capture.model_evidence.applied_controls.scope,'child_launch_argv');
  assert.ok(Object.isFrozen(capture.model_evidence));assert.ok(Object.isFrozen(capture.model_evidence.reported_models));assert.ok(Object.isFrozen(capture.model_evidence.applied_controls));assert.equal(capture.cli_version,null,'the adapter does not invent a CLI version probe');
  assert.equal(capture.provenance.invocation_id,'fictional-outcome-invocation');assert.equal(capture.provenance.input_binding.prompt_utf16_units,f.prompt.length);
  assert.equal(Object.hasOwn(capture.provenance,'store'),false);assert.equal(Object.hasOwn(capture.provenance,'db'),false);assert.equal(Object.hasOwn(capture.provenance,'scope'),false);
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture),capture);assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture),capture);
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture,f.store,f.token),capture);
  const reopened=new Store(f.root);try{assert.throws(()=>inspectRuntimeModelOutcomeCaptureFrom(capture,reopened,f.token),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CAPTURE_REQUIRED'));}finally{reopened.close();}
  for(const args of [[capture,f.store,f.workerToken],[capture,f.store,{...f.token}],[capture,f.store]])assert.throws(()=>inspectRuntimeModelOutcomeCaptureFrom(...args),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CAPTURE_REQUIRED'));
  let traps=0;const foreign=new Proxy(capture,{get(){traps++;throw Error('foreign capture property');},getPrototypeOf(){traps++;throw Error('foreign capture prototype');}});
  for(const value of [{...capture},foreign,operation.call,undefined])assert.throws(()=>inspectRuntimeModelOutcomeCaptureFrom(value),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CAPTURE_REQUIRED'));
  assert.equal(traps,0);
  assert.equal(assertRuntimeModelOutcomeEligible(capture),true);
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture),capture,'factual inspection does not rearm or require eligibility');
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture,f.store,f.token),capture);
  assert.throws(()=>assertRuntimeModelOutcomeEligible(capture),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CAPTURE_REQUIRED'));
  assert.throws(()=>assertRuntimeModelOutcomeEligible({...capture}),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CAPTURE_REQUIRED'));
  assert.throws(()=>consumeRuntimeModelOutcome(operation.call,result),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CALL_REQUIRED'));
  assert.throws(()=>f.start(),code('RUNTIME_MODEL_OUTCOME_CALL_ALREADY_ATTEMPTED'));assert.equal(f.calls,2);
});

test('oversized-depth Source metadata holds capture without silently dropping facts or repeating the model',async t=>{
  const f=fixture(t),operation=f.start();let detail='Fictional nested diagnostic';for(let index=0;index<40;index++)detail={detail};
  f.answer('Fictional completed answer with deep warning',{warnings:[{type:'error',message:'Fictional nonterminal diagnostic',detail}]});
  const result=await operation.completion;assert.equal(result.text,'Fictional completed answer with deep warning');assert.equal(result.model_evidence.cli_warnings.length,1);
  assert.throws(()=>consumeRuntimeModelOutcome(operation.call,result),code('RUNTIME_MODEL_OUTCOME_CAPTURE_UNAVAILABLE'));
  assert.throws(()=>consumeRuntimeModelOutcome(operation.call,result),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CALL_REQUIRED'));
  assert.throws(()=>f.start(),code('RUNTIME_MODEL_OUTCOME_CALL_ALREADY_ATTEMPTED'));assert.equal(f.calls,2);
});

test('wrong settlement consumption burns the private call without a second invocation',async t=>{
  const f=fixture(t),operation=f.start();f.answer('Fictional complete answer');const result=await operation.completion;
  assert.throws(()=>consumeRuntimeModelOutcome({...operation.call},result),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CALL_REQUIRED'));
  assert.throws(()=>consumeRuntimeModelOutcome(operation.call,{...result}),code('RUNTIME_MODEL_OUTCOME_VALUE_CHANGED'));
  assert.throws(()=>consumeRuntimeModelOutcome(operation.call,result),code('RUNTIME_MODEL_OUTCOME_PRIVATE_CALL_REQUIRED'));
  assert.throws(()=>f.start(),code('RUNTIME_MODEL_OUTCOME_CALL_ALREADY_ATTEMPTED'));assert.equal(f.calls,2);
});

test('prepared policy refusal is factual and cannot retry the same model request',async t=>{
  const f=fixture(t),operation=f.start({timeoutReason:'different from committed policy'}),failure=await rejected(operation.completion);
  const capture=consumeRuntimeModelOutcome(operation.call,failure.value);assert.equal(capture.kind,'threw');assert.equal(capture.thrown,failure.value);assert.equal(capture.process.entered,false);
  assert.equal(capture.model_evidence,null);assert.equal(capture.cli_version,null);
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture),capture);
  assert.throws(()=>assertRuntimeModelOutcomeEligible(capture),code('RUNTIME_MODEL_OUTCOME_NOT_ELIGIBLE'));
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture),capture);
  assert.throws(()=>f.start(),code('RUNTIME_MODEL_OUTCOME_CALL_ALREADY_ATTEMPTED'));assert.equal(f.calls,1);
});

test('preflight opaque rejection is preserved without property access or model creation',async t=>{
  const f=fixture(t);let traps=0;const opaque=new Proxy(Object.create(null),{get(){traps++;throw Error('opaque get');},set(){traps++;throw Error('opaque set');},ownKeys(){traps++;throw Error('opaque keys');},getOwnPropertyDescriptor(){traps++;throw Error('opaque descriptor');}});
  const operation=f.start({beforeOriginalSpawn:()=>{throw opaque;}}),failure=await rejected(operation.completion);
  assert.equal(Object.is(failure.value,opaque),true);const capture=consumeRuntimeModelOutcome(operation.call,failure.value);
  assert.equal(capture.kind,'threw');assert.equal(capture.native_id,null);assert.equal(Object.is(capture.thrown,opaque),true);assert.equal(capture.process.entered,false);assert.equal(traps,0);
  assert.throws(()=>assertRuntimeModelOutcomeEligible(capture),code('RUNTIME_MODEL_OUTCOME_NOT_ELIGIBLE'));assert.equal(f.calls,1);
});

test('falsy throws from a live Source callback remain rejections through stop and close',async t=>{
  for(const original of [false,null,undefined]){
    const f=fixture(t);
    try{
      const operation=f.start({onSpawn:()=>{throw original;}});
      f.model.emit('spawn');assert.ok(f.model.kills.includes('SIGTERM'));close(f.model,1,'SIGTERM');
      const failure=await rejected(operation.completion);assert.equal(Object.is(failure.value,original),true);
      const capture=consumeRuntimeModelOutcome(operation.call,failure.value);assert.equal(capture.kind,'threw');assert.equal(Object.is(capture.thrown,original),true);assert.equal(capture.process.closed,true);
      assert.throws(()=>assertRuntimeModelOutcomeEligible(capture),code('RUNTIME_MODEL_OUTCOME_NOT_ELIGIBLE'));assert.equal(f.calls,2);
    }finally{f.dispose();}
  }
});

test('closure recording failure cannot replace an opaque primary rejection or create eligibility',async t=>{
  const f=fixture(t);let traps=0,recordingAttempts=0;
  const original=new Proxy(Object.create(null),{get(){traps++;throw Error('opaque get');},set(){traps++;throw Error('opaque set');},ownKeys(){traps++;throw Error('opaque keys');},getOwnPropertyDescriptor(){traps++;throw Error('opaque descriptor');}}),auxiliary=Symbol('fixture recording failure');
  const operation=f.start({onSpawn:()=>{throw original;},onModelClosure:()=>{recordingAttempts++;throw auxiliary;}});
  f.model.emit('spawn');close(f.model,1,'SIGTERM');const failure=await rejected(operation.completion);
  assert.equal(Object.is(failure.value,original),true);assert.equal(traps,0);assert.equal(recordingAttempts,1);
  const capture=consumeRuntimeModelOutcome(operation.call,failure.value);
  assert.equal(capture.thrown,original);assert.equal(capture.process.closed,true);assert.equal(capture.process.receipt.signal,'SIGTERM');
  assert.equal(f.store.read().jobs[f.job.id].model_process_tracking.invocations.at(-1).closure,null,'a failed recorder leaves canonical uncertainty');
  assert.throws(()=>assertRuntimeModelOutcomeEligible(capture),code('RUNTIME_MODEL_OUTCOME_NOT_ELIGIBLE'));assert.equal(f.calls,2);
});

test('native cancellation after settlement denies positive eligibility despite public signal overrides',async t=>{
  const f=fixture(t),controller=new AbortController();let publicCalls=0;
  Object.defineProperties(controller.signal,{aborted:{configurable:true,value:false},addEventListener:{configurable:true,value:()=>{publicCalls++;throw Error('public listener');}},removeEventListener:{configurable:true,value:()=>{publicCalls++;throw Error('public listener');}}});
  const operation=f.start({signal:controller.signal});f.answer('Fictional answer before cancellation');
  const result=await operation.completion,capture=consumeRuntimeModelOutcome(operation.call,result);
  controller.abort();assert.equal(controller.signal.aborted,false,'the public shadow is deliberately false');assert.equal(publicCalls,0);
  assert.throws(()=>assertRuntimeModelOutcomeEligible(capture),code('RUNTIME_MODEL_OUTCOME_NOT_ELIGIBLE'));assert.equal(f.calls,2);
});

test('opt-in clock and spawn timing ignore replaced public clock and recorder mutation',async t=>{
  const f=fixture(t),nativeNow=Date.now,nativeSetTimeout=globalThis.setTimeout,nativeClearTimeout=globalThis.clearTimeout;let recordedBirth,recordedTiming,publicTimers=0;
  try{
    Date.now=()=>0;
    globalThis.setTimeout=()=>{publicTimers++;throw Error('replaced public timer');};
    globalThis.clearTimeout=()=>{publicTimers++;throw Error('replaced public timer');};
    const operation=f.start({onModelProcess:birth=>{
      recordedBirth=birth.spawned_at;f.options.onModelProcess(birth);
      birth.spawned_at='9999-01-01T00:00:00.000Z';
    },onSpawn:timing=>{recordedTiming=timing;f.options.onSpawn(timing);}});
    f.answer('Fictional answer under captured native timing');const result=await operation.completion,capture=consumeRuntimeModelOutcome(operation.call,result);
    assert.equal(recordedTiming.execution_started_at,recordedBirth);assert.equal(capture.process.birth.spawned_at,recordedBirth);
    assert.ok(Date.parse(recordedBirth)>0);assert.ok(Date.parse(capture.process.receipt.closed_at)>0);assert.equal(publicTimers,0);
    assert.equal(assertRuntimeModelOutcomeEligible(capture),true);assert.equal(f.calls,2);
  }finally{Date.now=nativeNow;globalThis.setTimeout=nativeSetTimeout;globalThis.clearTimeout=nativeClearTimeout;}
});

test('factual failed late-close capture survives issuer close without becoming positive eligibility',async t=>{
  const f=fixture(t),controller=new AbortController(),operation=f.start({signal:controller.signal});
  f.model.emit('spawn');controller.abort();assert.ok(f.model.kills.includes('SIGTERM'));
  f.store.transaction('job.failed',s=>{s.jobs[f.job.id].status='failed';return s;});f.store.close();
  close(f.model,1,'SIGTERM');const failure=await rejected(operation.completion);
  assert.equal(failure.value.code,'ROLE_ABORTED');const capture=consumeRuntimeModelOutcome(operation.call,failure.value);
  assert.equal(capture.kind,'threw');assert.equal(capture.process.closed,true);assert.equal(capture.process.receipt.signal,'SIGTERM');assert.equal(f.store.closed,true);
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture,f.store,f.token),capture);
  assert.throws(()=>assertRuntimeModelOutcomeEligible(capture),code('RUNTIME_MODEL_OUTCOME_NOT_ELIGIBLE'));
  assert.equal(inspectRuntimeModelOutcomeCaptureFrom(capture),capture);
  const read=new Store(f.root);try{assert.equal(read.read().jobs[f.job.id].status,'failed');}finally{read.close();}
  assert.equal(f.calls,2);
});

test('new committed Original request reaches the actual opt-in outcome and positive consumer path',async t=>{
  const worker=child(process.pid),model=child(760002);let mock,executableMetadata,savedPath,hadPath=false,pathInstalled=false;
  // Close the controlled children before the helper disposes their real
  // fictional Store. Original provenance comes from its fresh Store producer.
  t.after(()=>{try{close(model,1,'SIGTERM');close(worker,1,'SIGTERM');}finally{mock?.mock.restore();executableMetadata?.restore();syncBuiltinESMExports();if(pathInstalled){if(hadPath)process.env.PATH=savedPath;else delete process.env.PATH;}}});
  const f=await freshInventoryStore(t,{stateOptions:{extra:{paused:false}}}),policy=normalizeTimeout({timeout_ms:10000,timeout_reason:'Bounded genuine Original Source outcome fixture'}),job=f.queue(policy);
  executableMetadata=dummyExecutableMetadata(t,f.root);const bin=executableMetadata.bin;hadPath=Object.hasOwn(process.env,'PATH');savedPath=process.env.PATH;process.env.PATH=bin;pathInstalled=true;
  let calls=0;mock=t.mock.method(childProcess,'spawn',()=>{calls++;assert.ok(calls<=2);return calls===1?worker:model;});syncBuiltinESMExports();
  let workerToken;f.store.transaction('job.worker_launch_requested',s=>{workerToken=prepareOriginalWorkerLaunchFrom(f.store,s,{job_id:job.id,kind:'worker'});return s;});spawnOriginalWorkerLaunch(workerToken,process.execPath,['SOURCE-controlled-worker'],{cwd:f.root,stdio:'ignore'});worker.emit('spawn');
  f.store.transaction('job.started',s=>{Object.assign(s.jobs[job.id],{status:'running',worker_pid:process.pid,started_at:new Date().toISOString()});return s;});
  const prompt='Fictional Original input \ud800',selection=job.model_selection,invocation={invocation_id:'fictional-original-outcome-invocation',job_id:job.id,instance_id:job.instance_id,worker_pid:process.pid,host:'codex',requested_at:new Date().toISOString()};let token;
  f.store.transaction('job.model_process.requested',s=>{requestModelProcess(s.jobs[job.id],invocation);return s;});
  f.store.transaction('job.model_process.launch_requested',s=>{token=prepareOriginalModelRequestFrom(f.store,s,{job_id:job.id,invocation_id:invocation.invocation_id,host:'codex',native_id:null,prompt,cwd:f.root,selection});return s;});
  const observe=(field,birth,receipt)=>{const db=new Store(f.root);try{db.transaction(field==='birth'?'job.model_process.born':'job.model_process.closed',s=>{if(field==='birth')recordModelProcessBirth(s.jobs[job.id],invocation,birth);else recordModelProcessClosure(s.jobs[job.id],invocation,birth,receipt);approveRuntimeModelProcessObservationFrom(db,s,token,field,birth,receipt);return s;});}finally{db.close();}};
  const controller=new AbortController();let publicListeners=0;
  Object.defineProperties(controller.signal,{addEventListener:{configurable:true,value:()=>{publicListeners++;throw Error('public listener');}},removeEventListener:{configurable:true,value:()=>{publicListeners++;throw Error('public listener');}}});
  let actualBirth;
  const operation=runRuntimeModelWithOutcome(f.store,'codex',null,prompt,f.root,policy.timeout_ms,selection,{originalExecutionLaunch:token,signal:controller.signal,timeoutReason:policy.timeout_reason,onModelProcess:birth=>{actualBirth=birth.spawned_at;observe('birth',birth);birth.spawned_at='9999-01-01T00:00:00.000Z';},onModelClosure:(birth,receipt)=>observe('closure',birth,receipt),onSpawn:timing=>{assert.equal(timing.execution_started_at,actualBirth);return f.store.transaction('job.execution_started',s=>{Object.assign(s.jobs[job.id],timing);return s;});}});
  model.emit('spawn');const text='Original Source answer \ud800',thread='fictional-original-source-thread',turn='fictional-original-source-turn';
  model.stdout.end([{type:'thread.started',thread_id:thread},{type:'turn.started',thread_id:thread,turn_id:turn},{type:'item.completed',thread_id:thread,turn_id:turn,item:{id:'answer',type:'agent_message',phase:'final_answer',text}},{type:'turn.completed',thread_id:thread,turn_id:turn}].map(value=>JSON.stringify(value)+'\n').join(''));close(model);
  const result=await operation.completion,capture=consumeRuntimeModelOutcome(operation.call,result);
  assert.equal(capture.provenance.lane,'original');assert.equal(capture.text,text);assert.equal(capture.native_id,thread);assert.equal(capture.process.receipt.exit_code,0);
  assert.equal(assertRuntimeModelOutcomeEligible(capture),true);assert.equal(calls,2);assert.equal(publicListeners,0);
});
