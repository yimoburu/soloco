import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';

// SOURCE wiring tests only. Execute the actual adapter/timeout bodies in a
// complete synthetic dependency graph. The fake child is not a real process,
// a Store witness, Original custody, Native qualification or provider evidence.
const directory=new URL('../plugins/soloco/runtime/',import.meta.url);
function body(name){
  let source=fs.readFileSync(new URL(name,directory),'utf8').replace(/^import .*;\r?\n/gm,'');
  const entry=source.indexOf('if(process.argv[1]');if(entry>=0)source=source.slice(0,entry);
  return source.replaceAll('import.meta.url',JSON.stringify(new URL(name,directory).href)).replace(/\bexport (?=(?:async )?function|const|let|class)/g,'');
}
function fixture({clock=Date}={}){
  const original=Object.freeze({}),legacy=Object.freeze({});
  const calls={original:0,legacy:0,original_assert:0,legacy_assert:0,original_bind:0,legacy_bind:0,time_spawn:0,time_close:0};
  const eventTimes=new WeakMap(),nativeNow=Date.now;
  let api,lastLoan,lastDescriptor,child;
  const syntheticChild=()=>{
    const value=new EventEmitter();value.pid=41001;value.stdin=new PassThrough();value.stdout=new PassThrough();value.stderr=new PassThrough();value.kill=()=>true;
    // The synthetic boundary records its event clock BEFORE observers run.
    // Only this private map supplies time; public child fields and options.now
    // cannot mint it. These remain synthetic events, never Native witnesses.
    const observed={};eventTimes.set(value,observed);
    setImmediate(()=>{observed.spawn=Reflect.apply(nativeNow,Date,[]);value.emit('spawn');value.stderr.write('synthetic boundary');setImmediate(()=>{value.stdout.end();value.stderr.end();observed.close=Reflect.apply(nativeNow,Date,[]);value.emit('close',1,null);});});
    child=value;return value;
  };
  const unavailable=()=>{throw Error('Unselected dependency in SOURCE-only adapter test');};
  const timeout=vm.runInNewContext(body('timeout.mjs')+'\n;({normalizeTimeout,executionTiming,MIN_EXECUTION_TIMEOUT_MS,STARTUP_TIMEOUT_MS,TERMINATION_GRACE_MS});',{Date:clock},{filename:'actual-timeout-source.mjs',timeout:1000});
  const deps={...timeout,Date:clock,fs,path,os,createHash,randomUUID,fileURLToPath,AbortSignal,Map,WeakMap,Set,Promise,Buffer,setTimeout,clearTimeout,setImmediate,
    process:{env:{PATH:'/synthetic'},argv:[],pid:23001},spawn:unavailable,spawnSync:unavailable,
    claudeNameSupport:()=>false,nameCodexSession:unavailable,writeNamingReceipt:unavailable,
    assertOriginalModelLaunchToken:token=>{calls.original_assert++;if(token!==original)throw Object.assign(Error('Original token required'),{code:'ORIGINAL_EXECUTION_PRIVATE_LAUNCH_REQUIRED'});return {deadline_at_ms:null};},
    bindOriginalModelAdapterCutoffFrom:()=>false,
    bindOriginalAdapterLaunchCutoffFrom:(token,loan)=>{assert.equal(token,original);api.inspectOriginalAdapterLaunchCutoffFrom(loan,token);calls.original_bind++;},
    spawnOriginalModelLaunch:token=>{assert.equal(token,original);calls.original++;return syntheticChild();},
    originalWorkerFailedLaunchChild:()=>null,originalModelFailedLaunchChild:()=>null,cleanupOriginalWorkerLaunchFailure:()=>false,cleanupOriginalModelLaunchFailure:()=>false,
    isLegacyRuntimeModelCapabilityFrom:token=>token===legacy,
    assertLegacyRuntimeModelLaunchFrom:token=>{calls.legacy_assert++;assert.equal(token,legacy);return {deadline_at_ms:clock.now()+60000};},
    bindLegacyRuntimeModelAdapterFrom:(token,loan)=>{assert.equal(token,legacy);lastLoan=loan;lastDescriptor=api.inspectLegacyRuntimeAdapterLoanFrom(loan,token);calls.legacy_bind++;},
    spawnLegacyRuntimeModelLaunch:token=>{assert.equal(token,legacy);calls.legacy++;return syntheticChild();},
    legacyRuntimeFailedLaunchChild:()=>null,cleanupLegacyRuntimeLaunchFailure:()=>false,
    runtimeExecutionObservationTimeFrom:(value,event)=>{
      const observed=eventTimes.get(value),time=observed?.[event];
      if(!observed||!['spawn','close'].includes(event)||!Number.isSafeInteger(time))throw Object.assign(Error('Private synthetic child event required'),{code:'LEGACY_RUNTIME_ACTUAL_CHILD_OBSERVATION_REQUIRED'});
      calls['time_'+event]++;return time;
    }
  };
  const names=['runModel','runRuntimeModel','commandArgs','inspectLegacyRuntimeAdapterLoanFrom','assertRuntimeAdapterModelBirthFrom','assertRuntimeAdapterModelClosureFrom'];
  api=vm.runInNewContext(body('adapters.mjs')+'\n;({'+names.join(',')+'});',deps,{filename:'actual-adapter-source.mjs',timeout:1000});
  const options=token=>({...(token===legacy?{runtimeExecutionLaunch:token}:{originalExecutionLaunch:token}),resolveExecutable:()=>'/synthetic/codex'});
  const invoke=(fn,opts)=>fn('codex',null,'SOURCE-only fixture prompt','/synthetic/work',1000,null,opts);
  return {api,original,legacy,calls,options,invoke,get loan(){return lastLoan;},get descriptor(){return lastDescriptor;},get child(){return child;},get observedTimes(){const value=eventTimes.get(child);return value?{...value}:null;}};
}
const isCode=code=>error=>error?.code===code;

test('strict runModel rejects a genuine legacy capability and does not enter the legacy route',async()=>{
  const f=fixture();
  await assert.rejects(f.invoke(f.api.runModel,f.options(f.legacy)),isCode('ORIGINAL_EXECUTION_LAUNCH_GATE_REQUIRED'));
  await assert.rejects(f.invoke(f.api.runModel,{...f.options(f.original),originalExecutionLaunch:f.legacy}),isCode('ORIGINAL_EXECUTION_PRIVATE_LAUNCH_REQUIRED'));
  assert.equal(f.calls.legacy,0);assert.equal(f.calls.legacy_assert,0);assert.equal(f.calls.original,0);
});

test('ordinary facade rejects forged and mixed capability fields before creation',async()=>{
  const f=fixture();
  await assert.rejects(f.invoke(f.api.runRuntimeModel,{...f.options(f.legacy),runtimeExecutionLaunch:{}}),isCode('RUNTIME_EXECUTION_MODEL_CAPABILITY_REQUIRED'));
  await assert.rejects(f.invoke(f.api.runRuntimeModel,{...f.options(f.legacy),originalExecutionLaunch:f.original}),isCode('RUNTIME_EXECUTION_MODEL_CAPABILITY_REQUIRED'));
  assert.equal(f.calls.original+f.calls.legacy,0);
});

test('legacy facade binds final Source descriptor and private observations without Original issuance',async()=>{
  const f=fixture();let birth,receipt;
  await assert.rejects(f.invoke(f.api.runRuntimeModel,{...f.options(f.legacy),onModelProcess:value=>{f.api.assertRuntimeAdapterModelBirthFrom(f.legacy,value);birth=value;},onModelClosure:(value,close)=>{f.api.assertRuntimeAdapterModelClosureFrom(f.legacy,value,close);receipt=close;}}),isCode('ROLE_EXIT_ERROR'));
  assert.equal(f.calls.legacy,1);assert.equal(f.calls.legacy_bind,1);assert.equal(f.calls.original_assert,0);assert.equal(f.calls.original,0);
  assert.equal(f.descriptor.command,'/synthetic/codex');assert.deepEqual([...f.descriptor.args],[...f.api.commandArgs('codex',null,null)]);
  assert.equal(f.descriptor.options.cwd,'/synthetic/work');assert.deepEqual([...f.descriptor.options.stdio],['pipe','pipe','pipe']);
  assert.equal(Object.isFrozen(f.descriptor),true);assert.equal(Object.isFrozen(f.descriptor.args),true);assert.equal(Object.isFrozen(f.descriptor.options.env),true);
  assert.equal(birth.pid,f.child.pid);assert.equal(receipt.exit_code,1);
  assert.throws(()=>f.api.inspectLegacyRuntimeAdapterLoanFrom(f.loan,{}),isCode('RUNTIME_EXECUTION_ADAPTER_REQUIRED'));
});

test('forwarding wrappers retain the strict Original route through the ordinary facade',async()=>{
  const f=fixture();
  const forwarding=async(...args)=>{await Promise.resolve();return f.api.runRuntimeModel(...args);};
  await assert.rejects(f.invoke(forwarding,f.options(f.original)),isCode('ROLE_EXIT_ERROR'));
  assert.equal(f.calls.original,1);assert.equal(f.calls.original_bind,1);assert.equal(f.calls.legacy,0);assert.equal(f.calls.time_spawn+f.calls.time_close,0);
});

test('injected lifecycle clock cannot extend the private real-clock startup cutoff',async()=>{
  let real=1000;class Clock extends Date{static now(){return real;}}
  const f=fixture({clock:Clock});
  await assert.rejects(f.invoke(f.api.runRuntimeModel,{...f.options(f.legacy),now:()=>1000,resolveExecutable:()=>{real+=240001;return '/synthetic/codex';}}),isCode('RUNTIME_EXECUTION_MODEL_DEADLINE'));
  assert.equal(f.calls.legacy,0);assert.equal(f.calls.original,0);
});

test('caller spawn override stays rejected for strict and legacy adapter routes',async()=>{
  const f=fixture();
  for(const token of [f.original,f.legacy])await assert.rejects(f.invoke(f.api.runRuntimeModel,{...f.options(token),spawn:()=>f.child}),isCode('ORIGINAL_EXECUTION_LAUNCH_GATE_REQUIRED'));
  assert.equal(f.calls.original+f.calls.legacy,0);
});

test('raw or altered callback DATA cannot establish private adapter birth or closure',async()=>{
  const f=fixture();let birth,receipt;
  assert.throws(()=>f.api.assertRuntimeAdapterModelBirthFrom(f.legacy,{pid:41001}),isCode('MODEL_PROCESS_CLOSURE_HELD'));
  await assert.rejects(f.invoke(f.api.runRuntimeModel,{...f.options(f.legacy),onModelProcess:value=>{birth=value;},onModelClosure:(_value,close)=>{receipt=close;}}),isCode('ROLE_EXIT_ERROR'));
  assert.throws(()=>f.api.assertRuntimeAdapterModelBirthFrom(f.legacy,{...birth,pid:birth.pid+1}),isCode('MODEL_PROCESS_CLOSURE_HELD'));
  assert.throws(()=>f.api.assertRuntimeAdapterModelClosureFrom(f.legacy,birth,{...receipt,exit_code:0}),isCode('MODEL_PROCESS_CLOSURE_HELD'));
  const future=new Date(Date.now()+60000).toISOString();
  assert.throws(()=>f.api.assertRuntimeAdapterModelBirthFrom(f.legacy,{...birth,spawned_at:future}),isCode('MODEL_PROCESS_CLOSURE_HELD'));
  assert.throws(()=>f.api.assertRuntimeAdapterModelClosureFrom(f.legacy,birth,{...receipt,closed_at:future}),isCode('MODEL_PROCESS_CLOSURE_HELD'));
  assert.equal(f.api.assertRuntimeAdapterModelClosureFrom(f.legacy,birth,receipt),true);
});


test('future lifecycle clock and public child fields cannot timestamp legacy observations',async()=>{
  const f=fixture();let birth,receipt,timing;
  const invocation=f.invoke(f.api.runRuntimeModel,{
    ...f.options(f.legacy),now:()=>Date.now()+30000,
    onModelProcess:value=>{birth=value;f.child.spawn_observed_at_ms=Date.now()+60000;},
    onModelClosure:(_value,close)=>{receipt=close;f.child.closed_at_ms=Date.now()+60000;},
    onSpawn:value=>{timing=value;}
  });
  const actualClose=new Promise(resolve=>f.child.once('close',resolve));
  await assert.rejects(invocation,isCode('ROLE_TIMEOUT'));await actualClose;
  assert.equal(Date.parse(birth.spawned_at),f.observedTimes.spawn);
  assert.equal(Date.parse(receipt.closed_at),f.observedTimes.close);
  assert.equal(Date.parse(timing.execution_started_at),f.observedTimes.spawn);
  assert.notEqual(Date.parse(birth.spawned_at),f.child.spawn_observed_at_ms);
  assert.notEqual(Date.parse(receipt.closed_at),f.child.closed_at_ms);
  assert.equal(f.calls.time_spawn,2);assert.equal(f.calls.time_close,1);
});
