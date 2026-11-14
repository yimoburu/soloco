import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';

// SOURCE behavioral tests only. Actual module bodies run in complete synthetic
// dependency graphs. Fake children/loans/rows below are not actual Store custody,
// OS process birth, independent QA, Native qualification or execution authority.
// No subprocess, provider, compiler, SDK or company operation is selected here.
const runtime=new URL('../plugins/soloco/runtime/',import.meta.url);
function source(name){
  let value=fs.readFileSync(new URL(name,runtime),'utf8').replace(/^import .*;\r?\n/gm,'');
  const entry=value.indexOf('if(process.argv[1]');if(entry>=0)value=value.slice(0,entry);
  return value.replace(/^export \{[^\r\n]*\};(?:\r?\n|$)/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL(name,runtime).href)).replace(/\bexport (?=(?:async )?function|const|let|class)/g,'');
}
function load(name,names,deps,{modules=[]}={}){
  const context=vm.createContext(deps);
  const evaluate=(module,exports)=>vm.runInContext("(function(){'use strict';\n"+source(module)+'\n;return ({'+exports.join(',')+'});})()',context,{filename:'SOURCE-VM/'+module,timeout:1000});
  // Shared pure modules run as isolated module scopes in the SAME realm as the
  // consumer. Imported functions stay actual Source, with immutable bindings;
  // no copied validator or production private-map access is used by the test.
  for(const [module,exports] of modules)for(const [key,value] of Object.entries(evaluate(module,exports)))Object.defineProperty(context,key,{value,enumerable:true,writable:false,configurable:false});
  const api=evaluate(name,names);
  const wire=value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context,{timeout:1000});
  return {api,wire,context};
}
const unavailable=()=>{throw Error('Unselected dependency in SOURCE-only test');};
const code=value=>error=>error?.code===value;
const fixtureIdentity={protocol:'SOURCE-VM-fixture',factory:'fictional-only'};

function sandboxFixture(t,{remaining=321,failDuringChildCreation=false}={}){
  const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'source-development-routing-')));
  const company=path.join(temp,'fictional-company'),candidate=path.join(temp,'candidate');
  fs.mkdirSync(company);fs.mkdirSync(candidate);fs.writeFileSync(path.join(candidate,'case.test.mjs'),'// Not executed: SOURCE-only lifecycle fixture.\n');
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const timers=[],groupKills=[],cleanupErrors=[],deadlines=new WeakMap(),factsByToken=new WeakMap();let helper,sandboxChild,lastFacts,now=10000,loaded;
  class Clock extends Date{static now(){return now;}}
  const schedule=(fn,delay)=>{const timer={fn,delay,active:true,unref(){}};timers.push(timer);return timer;};
  const unschedule=timer=>{if(timer)timer.active=false;};
  const statIdentity=directory=>{const stat=fs.statSync(directory);return {path:fs.realpathSync(directory),dev:String(stat.dev),ino:String(stat.ino)};};
  const wrappedFs={...fs,
    existsSync:file=>file==='/usr/bin/sandbox-exec'||fs.existsSync(file),
    realpathSync:file=>['/System/Library','/usr/lib','/synthetic/home'].includes(file)?file:fs.realpathSync(file),
    lstatSync:file=>file==='/System'||file.startsWith('/System/')||file==='/synthetic'||file.startsWith('/synthetic/')?{isSymbolicLink:()=>false,isDirectory:()=>true,isFile:()=>false,nlink:1}:fs.lstatSync(file)
  };
  const deps={fs:wrappedFs,os:{tmpdir:()=>temp,homedir:()=>'/synthetic/home'},path,URL,fileURLToPath,createHash,randomBytes,AbortSignal,Date:Clock,Buffer,setTimeout:schedule,clearTimeout:unschedule,
    process:{execPath:process.execPath,platform:'darwin',pid:23001,ppid:22001,argv:[],kill:(pid,signal)=>{groupKills.push({pid,signal});return true;}},
    spawn:unavailable,
    spawnSync:(command,args)=>({status:0,signal:null,pid:34001,stdout:command==='/usr/bin/otool'?String(args.at(-1))+':\n /usr/lib/libSystem.B.dylib (compatibility version 1.0.0)\n':command==='/usr/bin/sandbox-exec'?'TAP version 13\nSOLOCO_SANDBOX_READY\n':'',stderr:''}),
    readSystemBuildDescriptor:unavailable,
    assertTestFixtureIdentity:value=>{assert.equal(JSON.stringify(value),JSON.stringify(fixtureIdentity));return value;},
    prepareTestFixture:unavailable,cleanupTestFixture:unavailable,scratchIdentity:statIdentity,fixtureEnvironmentBindings:unavailable,
    withStore:(root,fn)=>{assert.equal(root,company);return fn({transaction(type,write){assert.equal(type,'development.execution_launch_requested');return write({});}});},
    prepareRuntimeWorkerLaunchFrom:(_store,_state,input,loan)=>{assert.equal(input.job_id,'job-fictional');lastFacts=loaded.api.inspectRuntimeDevelopmentDescriptorFrom(loan,{root:company,job_id:input.job_id});const token={};factsByToken.set(token,lastFacts);return token;},
    spawnRuntimeWorkerLaunch:token=>{
      const facts=factsByToken.get(token);assert.ok(facts);
      const value=new EventEmitter();value.pid=41001;value.connected=true;value.stdout=new PassThrough();value.stderr=new PassThrough();value.kills=[];value.sent=[];
      value.send=message=>{value.sent.push(message);};value.disconnect=()=>{value.connected=false;};value.kill=signal=>{value.kills.push(signal);return true;};
      deadlines.set(value,now+remaining);
      if(facts.slot==='watchdog'){
        const {request,payload}=JSON.parse(facts.args.at(-1));value.binding={...request,watchdog_pid:value.pid};value.payload=payload;helper=value;
      }else{
        sandboxChild=value;
        if(failDuringChildCreation){now+=remaining+1;facts.onCutoff(value);throw Object.assign(Error('SOURCE post-spawn commit failure'),{code:'SOURCE_VM_COMMIT_FAILED'});}
      }
      return value;
    },
    runtimeExecutionDeadlineFrom:child=>{if(!deadlines.has(child))throw Object.assign(Error('Actual child required'),{code:'LEGACY_RUNTIME_ACTUAL_CHILD_DEADLINE_REQUIRED'});return deadlines.get(child);},
    cleanupLegacyRuntimeLaunchFailure:error=>{cleanupErrors.push(error);return false;},cleanupOriginalWorkerLaunchFailure:()=>false
  };
  loaded=load('local-sandbox.mjs',['runLocalTests','executeTests','runtimeDevelopmentDescriptor','inspectRuntimeDevelopmentDescriptorFrom','runtimeTimeout'],deps);
  const args=()=>loaded.wire({directory:candidate,test_paths:['case.test.mjs'],timeout_ms:1000,max_output_bytes:10000,testFixture:fixtureIdentity,originalExecution:{root:company,job_id:'job-fictional'}});
  const emitResult=()=>{
    const stdout='TAP version 13\nSOURCE fixture output\n',bytes=Buffer.byteLength(stdout);
    helper.emit('message',loaded.wire({type:'ready',binding:helper.binding}));
    helper.emit('message',loaded.wire({type:'result',binding:helper.binding,result:{status:'passed',exit_code:0,signal:null,stdout,stderr:'',duration_ms:4,tests_executed:true,test_execution_attempted:true,output_truncated:false,output_bytes:{captured:bytes,observed:bytes},test_fixture:{identity:fixtureIdentity,termination_confirmed:true,cleanup:{status:'confirmed',root_absent:true}}}}));
  };
  const childInvocation=()=>{
    const scratch=path.join(candidate,'.scratch');fs.mkdirSync(scratch,{mode:0o700});
    return {args:loaded.wire({root:candidate,scratch,paths:['./case.test.mjs'],timeout_ms:1000,max_output_bytes:10000,scratch_identity:statIdentity(scratch),original_execution:{root:company,job_id:'job-fictional'}}),binding:loaded.wire({protocol:'owned-scratch-close-v1',request_id:'c'.repeat(64),runner_sha256:'d'.repeat(64),request_sha256:'e'.repeat(64),controller_pid:22001,watchdog_pid:23001})};
  };
  return {...loaded,company,candidate,timers,groupKills,cleanupErrors,args,emitResult,childInvocation,get helper(){return helper;},get child(){return sandboxChild;},get facts(){return lastFacts;},set now(value){now=value;}};
}

test('actual Source development descriptor accepts its branded loan and rejects copied DATA',t=>{
  const f=sandboxFixture(t);
  const input=f.wire({command:process.execPath,args:['/source/local-sandbox.mjs','--watch-tests','{}'],options:{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','ignore','pipe','ipc'],detached:true},recipe:'watchdog',request_sha256:'a'.repeat(64),directory:f.candidate,test_paths:['case.test.mjs'],timeout_ms:1000,max_output_bytes:10000});
  const controller=new AbortController(),onCutoff=()=>{};input.signal=controller.signal;input.onCutoff=onCutoff;
  const loan=f.api.runtimeDevelopmentDescriptor(f.wire({root:f.company,job_id:'job-fictional'}),input);
  const facts=f.api.inspectRuntimeDevelopmentDescriptorFrom(loan,{root:f.company,job_id:'job-fictional'});
  assert.equal(facts.slot,'watchdog');assert.equal(facts.directory,f.candidate);assert.equal(Object.isFrozen(facts),true);
  assert.equal(facts.signal,controller.signal);assert.equal(facts.onCutoff,onCutoff);controller.abort();assert.equal(facts.signal.aborted,true);
  const copied=f.wire(JSON.parse(JSON.stringify(facts)));
  assert.throws(()=>f.api.inspectRuntimeDevelopmentDescriptorFrom(copied,{root:f.company,job_id:'job-fictional'}),code('RUNTIME_EXECUTION_DESCRIPTOR_REQUIRED'));
  assert.throws(()=>f.api.inspectRuntimeDevelopmentDescriptorFrom({}, {root:f.company,job_id:'job-fictional'}),code('RUNTIME_EXECUTION_DESCRIPTOR_REQUIRED'));
  assert.throws(()=>f.api.inspectRuntimeDevelopmentDescriptorFrom(loan,{root:f.company,job_id:'job-fictional',slot:'test_child'}),code('RUNTIME_EXECUTION_DESCRIPTOR_REQUIRED'));
  assert.throws(()=>f.api.inspectRuntimeDevelopmentDescriptorFrom(loan,{root:f.candidate,job_id:'job-fictional'}),code('RUNTIME_EXECUTION_DESCRIPTOR_REQUIRED'));
});

test('company timer uses private actual-child cutoff rather than caller fields or full test allowance',async t=>{
  const f=sandboxFixture(t,{remaining:321}),pending=f.api.runLocalTests(f.args());
  assert.equal(f.timers.at(-1).delay,321);
  assert.throws(()=>f.api.runtimeTimeout(f.wire({root:f.company,job_id:'job-fictional'}),{deadline_at_ms:999999},6000),code('LEGACY_RUNTIME_ACTUAL_CHILD_DEADLINE_REQUIRED'));
  f.emitResult();f.helper.emit('close',0,null);await pending;
});

test('valid result remains pending until actual watchdog close',async t=>{
  const f=sandboxFixture(t),pending=f.api.runLocalTests(f.args());let settled=false;pending.then(()=>{settled=true;});
  f.emitResult();await Promise.resolve();await Promise.resolve();
  assert.equal(settled,false);assert.equal(f.timers.at(-1).active,true);
  f.helper.emit('close',0,null);const result=await pending;
  assert.equal(result.status,'passed');assert.equal(result.tests_executed,true);assert.match(result.stdout,/SOURCE fixture output/);assert.equal(f.timers.at(-1).active,false);
});

test('later watchdog failure cannot be overridden by an earlier valid Pass',async t=>{
  const f=sandboxFixture(t),pending=f.api.runLocalTests(f.args());f.emitResult();f.helper.emit('close',1,null);const result=await pending;
  assert.equal(result.status,'error');assert.equal(result.tests_executed,true);assert.match(result.stdout,/SOURCE fixture output/);assert.equal(result.test_fixture.cleanup.status,'confirmed');
});

test('watchdog timeout after known test result retains observed execution and output',async t=>{
  const f=sandboxFixture(t),pending=f.api.runLocalTests(f.args());f.emitResult();f.timers.at(-1).fn();const result=await pending;
  assert.equal(result.status,'error');assert.equal(result.tests_executed,true);assert.match(result.stdout,/SOURCE fixture output/);assert.equal(result.test_fixture.cleanup.status,'confirmed');
  assert.deepEqual(f.helper.kills,['SIGKILL']);assert.match(result.error,/watchdog/i);
});

test('sandbox test-child timer uses the same private minimum cutoff',async t=>{
  const f=sandboxFixture(t,{remaining:123}),call=f.childInvocation(),pending=f.api.executeTests(call.args,call.binding);
  assert.equal(f.timers.at(-1).delay,123);
  f.child.emit('spawn');f.child.stdout.write('TAP version 13\n');f.child.emit('close',0,null);
  const result=await pending;assert.equal(result.status,'passed');assert.equal(result.local_execution.child.close_observed,true);assert.equal(result.local_execution.cleanup.status,'confirmed');
});

test('cutoff callback owns the actual child even before the caller assigns its handle',async t=>{
  const f=sandboxFixture(t,{remaining:1,failDuringChildCreation:true}),call=f.childInvocation();
  const result=await f.api.executeTests(call.args,call.binding);
  assert.equal(result.status,'error');assert.match(result.error,/unconfirmed/);
  assert.equal(f.cleanupErrors[0]?.code,'SOURCE_VM_COMMIT_FAILED');
  assert.deepEqual(f.groupKills,[{pid:-41001,signal:'SIGKILL'}]);
  assert.equal(result.local_execution.termination_confirmed,false);assert.equal(result.local_execution.cleanup.status,'not_attempted');
});

function custodyFixture(stateInput){
  let state,store,loan;
  const deps={path,URL,fileURLToPath,createHash,randomUUID,AbortSignal,EventTarget,Date,setTimeout,clearTimeout,
    spawn:unavailable,Store:class{},normalizedLayout:()=>false,readNormalized:unavailable,
    originalStoreExecutionCustodyFrom:subject=>{assert.equal(subject,store);return loan;},originalStoreRetainedCommitCutoffFrom:()=>null,inspectRuntimeStoreCommitWitnessFrom:unavailable,
    classifyRuntimeStorageFrom:()=>({lane:'legacy',company_id:'fictional-company'}),inspectRuntimeStorageProofFrom:()=>true,assertRuntimeStorageNextFrom:unavailable,inspectRuntimeStorageJobBookkeepingFrom:()=>[],
    jobTimeoutState:unavailable,jobExecutionTiming:unavailable,STARTUP_TIMEOUT_MS:240000,TERMINATION_GRACE_MS:3000,
    original:{},adapter:{},sandbox:{}
  };
  const loaded=load('runtime-execution.mjs',['beginRuntimeExecutionWriteFrom','assertRuntimeDevelopmentProcessClosureFrom','bindRuntimeBookkeepingFrom','inspectLegacyRuntimeBookkeepingFrom','validateLegacyRuntimeJobShape','runtimeJobOccupied'],deps,{modules:[
    ['runtime-execution-shapes.mjs',['LEGACY_RUNTIME_PROTOCOL','validateLegacyRuntimeJobShape','legacyRuntimeJobTransition','legacyRuntimeJobPhase']],
    ['model-process-closure.mjs',['modelProcessTransition','modelProcessProducerTransition','legacyRetentionModelRequestTransition','validModelProcessTracking','validModelProcessBirth']]
  ]});
  state=loaded.wire(stateInput);store={db:{prepare(){return {get:()=>({value:JSON.stringify(state)})};}}};
  loan={store,db:store.db,root:'/fictional-company',scope:{},mode:'write',type:'development.test_finished',state,fresh:false,assert(){}};
  loaded.api.beginRuntimeExecutionWriteFrom(store,'development.test_finished');
  return {...loaded,state,store};
}
const emptyGuard=()=>({protocol:'unqualified-runtime-processes-v1',worker:null,watchdog:null,test_child:null});

// This exercises the closure guard's canonical reuse link, not develop's
// separate full fingerprint/candidate/independent-QA reuse qualification.
test('canonical reuse guard keeps zero children and rejects an invented reused Boolean',()=>{
  const state={id:'fictional-company',records:{prior:{id:'prior',development:{type:'test',result:{status:'passed',tests_executed:true}}}},jobs:{job:{id:'job',kind:'development_test',reuse_receipt_id:'prior',legacy_runtime:emptyGuard()}}};
  const f=custodyFixture(state),result=f.wire({status:'passed',reused:true,tests_executed:false,original_tests_executed:true,reused_from:'prior'});
  assert.equal(f.api.assertRuntimeDevelopmentProcessClosureFrom(f.store,f.state,'job',result),true);
  result.reused_from='other';assert.throws(()=>f.api.assertRuntimeDevelopmentProcessClosureFrom(f.store,f.state,'job',result),code('LEGACY_RUNTIME_REUSE_BINDING_REQUIRED'));
  result.reused_from='prior';f.state.records.prior.development.result.tests_executed=false;
  assert.throws(()=>f.api.assertRuntimeDevelopmentProcessClosureFrom(f.store,f.state,'job',result),code('LEGACY_RUNTIME_REUSE_BINDING_REQUIRED'));
  const noReuse=custodyFixture({...state,jobs:{job:{...state.jobs.job,reuse_receipt_id:undefined}}});
  assert.throws(
    ()=>noReuse.api.assertRuntimeDevelopmentProcessClosureFrom(noReuse.store,noReuse.state,'job',noReuse.wire({status:'passed',reused:true,tests_executed:false})),
    code('LEGACY_RUNTIME_REUSE_BINDING_REQUIRED')
  );
});

function workerGuard({closed=false}={}){
  return {...emptyGuard(),worker:{launch_id:'00000000-0000-4000-8000-000000000001',controller_pid:23001,requested_at:'2026-11-13T00:00:00.000Z',deadline_at_ms:1794528060000,recipe:'ordinary_worker',descriptor_sha256:'b'.repeat(64),parent_launch_id:null,request_sha256:null,birth:{pid:41001,observed_at:'2026-11-13T00:00:00.001Z'},closure:closed?{pid:41001,observed_at:'2026-11-13T00:00:00.010Z',exit_code:0,signal:null,never_started:false}:null}};
}
function receiptFixture(closed){
  const job={id:'job',role:'qa',host:'codex',instance_id:'fictional-instance',epoch:1,status:'completed',native_id:'fictional-native',legacy_runtime:workerGuard({closed})};
  const f=custodyFixture({id:'fictional-company',records:{},jobs:{job}});f.api.bindRuntimeBookkeepingFrom(f.store,f.state);
  const current=load('current-state.mjs',['proofJobSafe','runtimeReceiptClosed'],{
    inspectLegacyRuntimeBookkeepingFrom:f.api.inspectLegacyRuntimeBookkeepingFrom,validateLegacyRuntimeJobShape:f.api.validateLegacyRuntimeJobShape,runtimeJobOccupied:f.api.runtimeJobOccupied,
    validCodeReviewMetadata:()=>true,validateSpecialistBindingShape:()=>true,inspectOriginalWorkerAssignmentBookkeepingFrom:()=>null
  });
  return {f,current,job:f.state.jobs.job};
}

test('pending carrier does not deadlock context bookkeeping but cannot freeze an acceptance receipt',()=>{
  const {f,current,job}=receiptFixture(false);
  assert.equal(current.api.proofJobSafe(job,f.state),true);assert.equal(current.api.runtimeReceiptClosed(f.state,job),false);
  job.unrelated_permission='invented';assert.equal(current.api.proofJobSafe(job,f.state),false);delete job.unrelated_permission;
  const finished=receiptFixture(true);
  assert.equal(finished.current.api.runtimeReceiptClosed(finished.f.state,finished.job),true);
  const detached=finished.f.wire(JSON.parse(JSON.stringify(finished.f.state)));
  assert.equal(finished.current.api.runtimeReceiptClosed(detached,detached.jobs.job),false);
  assert.equal(current.api.runtimeReceiptClosed({},{}),true,'historical no-guard behavior remains unchanged');
});
