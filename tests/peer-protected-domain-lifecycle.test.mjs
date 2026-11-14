import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter,once} from 'node:events';
import {PassThrough} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';

const MODULE=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-codex-domain.mjs',import.meta.url));
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// Closed Source dependency and named-binding roster: a new import requires
// explicit review of this SYNTHETIC unit's predecessor boundary.
const EXPECTED_IMPORTS=Object.freeze([
  "import {ORIGINAL_CONTEXT_SELECTION,resolveOriginalPeerContextInterpreter,assertOriginalPeerContextInterpreterFinal,assertOriginalPeerContextSlot,inspectOriginalPeerContextInterpreter} from './protected-source-build-slot.mjs';",
  "import {originalPeerContextDeliveryInterpreter,inspectOriginalPeerContextDelivery,peerContextTurnInput} from './peer-context-interpreter.mjs';",
  "import fs from 'node:fs';",
  "import {EventEmitter} from 'node:events';",
  "import {Writable,PassThrough} from 'node:stream';",
  "import {randomBytes,createHash} from 'node:crypto';",
  "import {TextDecoder,types} from 'node:util';",
  "import {canonical,PeerLedger} from './ledger.mjs';",
  "import {assertOriginalPeerMaintenanceExecutionCapacityFrom as assertInventory,assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom as assertInventoryInTransaction,claimOriginalPeerExecutionLaunchFrom,bindOriginalPeerExecutionLaunchCutoffFrom,spawnOriginalPeerExecutionLaunch,originalWorkerFailedLaunchChild,cleanupOriginalWorkerLaunchFailure} from './prospective-local-worker-inventory-producer.mjs';",
  "import * as originalInventory from './prospective-local-worker-inventory-producer.mjs';",
  "import * as model from './model.mjs';",
  "import * as frontierSlots from './protected-source-build-slot.mjs';",
  "import * as originalExecutionDomain from './protected-codex-domain.mjs';",
  "import {INPUT_FRONTIER_CONTEXT_SELECTION,INPUT_FRONTIER_PROFILE,inputFrontierReadonly3Tools,inputFrontierResponsesTools,inspectOriginalInputFrontierPreflight,originalInputFrontierPreflightInterpreter,originalInputFrontierPreflightInput} from './input-frontier-wire.mjs';",
  "import {originalPeerInputFrontierMaintenanceLedger,inspectOriginalPeerInputFrontier,assertOriginalPeerInputFrontier,originalPeerInputFrontierPreflight} from './input-frontier-maintenance.mjs';",
  "import * as originWire from './origin-maintenance-wire.mjs';",
  "import * as originMaintenance from './origin-maintenance.mjs';",
  "import * as originSeal from './origin-frontier-seal.mjs';",
  "import * as ownerMaintenance from './owner-handover.mjs';",
  "import * as ordinaryOrigin from './origin-ordinary-task.mjs';",
  "import {inspectOriginalOriginOrdinaryTaskSupport as inspectOrdinarySourceTuple} from './context-component-deployment.mjs';",
  "import {parseGatewayJSON} from './gateway-wire.mjs';",
  "import {createOriginalControlTranscript,createOriginalInputFrontierControlTranscript,createOriginalOriginMaintenanceControlTranscript,createOriginalOriginFinalReviewControlTranscript,createOriginalOriginOrdinaryTaskControlTranscript,parseOriginalControlFrame} from './protected-context-channel.mjs';",
  "import {createFixedConnectBroker} from './protected-connect-broker.mjs';",
  "import {stableTaskHostTools} from './host-protocol.mjs';",
  "import {expectedResponsesTools} from './responses-gateway.mjs';",
  "import {inspectOriginalCompiledCodexPlan,claimOriginalCompiledCodexPlan,originalCompiledPeerContextInterpreter} from './policy-supervisor.mjs';",
  "import {inspectOriginalCompiledBootstrapScope} from './policy-supervisor.mjs';",
  "import {isOriginalBootstrapMembershipInterpreter,assertOriginalBootstrapMembershipInterpreterFinal,inspectOriginalBootstrapMembershipInterpreter,assertOriginalBootstrapMembershipSlot,originalBootstrapCompanionSlotMatches} from './protected-source-build-slot.mjs';",
  "import {BOOTSTRAP_PROFILE,BOOTSTRAP_CONTEXT_SELECTION,bootstrapReadonly3Tools} from './bootstrap-membership-delivery-frame.mjs';",
  "import {originalBootstrapMembershipPreflightInterpreter,originalBootstrapMembershipPreflightInput,assertOriginalBootstrapMembershipPreflightInput,inspectOriginalBootstrapMembershipPreflight} from './bootstrap-membership-preflight.mjs';",
  "import {assertOriginalPeerBootstrapMembershipRunner,originalPeerBootstrapMembershipRunnerDeadline,originalPeerBootstrapMembershipRunnerLedger,originalPeerBootstrapMembershipRunnerPreflight} from './bootstrap-membership.mjs';",
  "import {createOriginalBootstrapControlTranscript,parseOriginalBootstrapControlFrame} from './protected-context-channel.mjs';"
]);


// Every predecessor, process identity and lifecycle event here is SYNTHETIC.
// The original production spawn/lifecycle BODY runs unchanged in a test-owned
// copy. No native child, OS signal/query, source-qualified plan, interpreter,
// deployment, authentication or provider operation is created by these tests.
class SyntheticChild extends EventEmitter {
  constructor(){
    super();this.pid=424242;this.exitCode=null;this.signalCode=null;this.exited=false;this.closed=false;this.signals=[];
    this.stdin=new PassThrough();this.stdout=new PassThrough();this.stderr=new PassThrough();
    this.stdio=[this.stdin,this.stdout,this.stderr,new PassThrough(),new PassThrough()];
    // Consume only fake child input/control bytes, so actual PassThrough end and
    // close events are observable without any OS pipe or subprocess.
    this.stdin.resume();this.stdio[4].resume();
  }
  kill(signal){
    this.signals.push({signal,after_exit:this.exited});
    if(this.exited)throw Error('retained child kill after observed synthetic exit');
    return true;
  }
  exit(code=0,signal=null,{updateProperties=true}={}){
    this.exited=true;
    if(updateProperties){this.exitCode=code;this.signalCode=signal;}
    this.emit('exit',code,signal);
  }
  async closeStreamsAndChild(code=0,signal=null){
    if(this.closed)return;
    for(const stream of [this.stdout,this.stderr,this.stdio[3]])stream.end();
    for(const stream of [this.stdin,this.stdio[4]])if(!stream.writableEnded)stream.end();
    await flush();
    for(const stream of [this.stdin,this.stdio[4]])if(!stream.destroyed)stream.destroy();
    await flush();this.closed=true;this.emit('close',code,signal);
  }
}

async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-domain-lifecycle-test-'));
  let original,child,facade,restoreKill=null,timersEnabled=false;
  const numericCalls=[];
  // Install cleanup before any transform/import, global patch or production
  // launch call can fail. A failing regression must not contaminate the next.
  t.after(async()=>{
    try{
      if(child){if(!child.exited)child.exit(0,null);await child.closeStreamsAndChild();}
      facade?.stdin?.destroy();facade?.stdout?.destroy();
      for(const stream of child?.stdio??[])stream.destroy();
      assert.deepEqual(numericCalls,[],'even failure cleanup must never query or signal numeric PIDs/groups');
      if(original!==undefined)assert.equal(fs.readFileSync(MODULE,'utf8'),original,'the actual production module stays untouched');
    }finally{
      if(restoreKill)process.kill=restoreKill;
      if(timersEnabled)t.mock.timers.reset();
      fs.rmSync(directory,{recursive:true,force:true});
    }
  });
  original=fs.readFileSync(MODULE,'utf8');
  assert.deepEqual(original.split('\n').filter(line=>line.startsWith('import ')),EXPECTED_IMPORTS,
    'the complete dependency and named-binding roster must be explicitly reviewed');
  const copy=path.join(directory,'domain.mjs'),copyURL=pathToFileURL(copy).href;
  const shimFile=path.join(directory,'synthetic-predecessors.mjs');
  fs.writeFileSync(shimFile,`// TEST-ONLY SYNTHETIC authority/predecessor DATA; no genuine producer or Native proof.
import assert from 'node:assert/strict';
import * as lifecycleDomain from ${JSON.stringify(copyURL)};
export const canonical=value=>JSON.stringify((function visit(v){return v&&typeof v==='object'?Array.isArray(v)?v.map(visit):Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k])])):v;})(value));
export const ORIGINAL_CONTEXT_SELECTION=Object.freeze({SYNTHETIC_LIFECYCLE_ONLY:true});
export const INPUT_FRONTIER_CONTEXT_SELECTION=Object.freeze({SYNTHETIC_UNAVAILABLE:true}),INPUT_FRONTIER_PROFILE='SYNTHETIC_UNAVAILABLE';
export const BOOTSTRAP_CONTEXT_SELECTION=Object.freeze({SYNTHETIC_UNAVAILABLE:true}),BOOTSTRAP_PROFILE='SYNTHETIC_UNAVAILABLE';
export const compiledPlan=Object.freeze({SYNTHETIC_LIFECYCLE_ONLY:true});
export const spawnCalls=[],executionCalls={claim:0,cutoff:0,spawn:0};
let owner,child,compiledClaimed=false,executionClaimed=false,executionCutoff=null,executionSpawned=false;
const unavailable=()=>{throw Error('unused SYNTHETIC lifecycle predecessor');};
const slot=Object.freeze({slot_id:'synthetic-legacy-lifecycle-only',scope_policy:'SYNTHETIC_LEGACY_LIFECYCLE_ONLY',executable_sha256:'a'.repeat(64),source_manifest_sha256:'b'.repeat(64),native_context_contract:Object.freeze({original_home_sha256:'c'.repeat(64),upstream_url:'https://example.invalid/responses'})});
const plan=Object.freeze({launch_mode:'companion-v2',companion_slot:slot,executable_pin:{sha256:'a'.repeat(64)},sandbox_executable:'/synthetic/sandbox',sbpl:'SYNTHETIC policy DATA; never executed',executable:'/synthetic/companion',argv:['--synthetic-lifecycle-only'],cwd:'/synthetic-project',state_root:'/synthetic-state',scratch_root:'/synthetic-scratch',policy_sha256:'d'.repeat(64),environment:{}});
const deadline=Date.now()+120000,expires_at=new Date(deadline).toISOString();
export const syntheticTaskId='synthetic-lifecycle-task';
export const syntheticTaskContext=Object.freeze({protocol:'SYNTHETIC-lifecycle-context-v1',sha256:'e'.repeat(64),grant:{value:{expires_at}}});
const task={id:syntheticTaskId,value:{status:'running',scope:'SYNTHETIC lifecycle only',owner_principal_id:'synthetic-principal',attempt:{id:'synthetic-attempt',context:syntheticTaskContext,effect_id:'synthetic-effect',request_sha256:'f'.repeat(64),effect_authority:{expires_at}}}};
const command={id:'synthetic-admission',revision:1,sha256:'1'.repeat(64),value:{action:'task/admit',principal_id:'scheduler',result:{admitted:true,task,context:syntheticTaskContext}}};
const reference=Object.freeze({family:'commands',id:command.id,revision:command.revision,sha256:command.sha256});
const rows={tasks:{[task.id]:task},principals:{'synthetic-principal':{id:'synthetic-principal',value:{status:'active',membership_qualification:{SYNTHETIC_LIFECYCLE_ONLY:true},native_id:'synthetic-native',generation:1,enrollment_id:'synthetic-enrollment'}}},slots:{[task.id]:{value:{status:'active',attempt_id:task.value.attempt.id}}},effects:{'synthetic-effect':{created_seq:1,value:{kind:'native',task_id:task.id,request_sha256:task.value.attempt.request_sha256,status:'reserved'}}},commands:{[command.id]:command}};
const tx={
  get(family,id){assert.ok(Object.hasOwn(rows,family),'unsupported SYNTHETIC ledger family');return rows[family][id]??null;},
  getVersion(value){assert.deepEqual(value,reference);return command;},
  events(options){assert.deepEqual(options,{after:0,limit:1});return {items:[{type:'task/admit',principal_id:'scheduler',payload:{changes:[reference]}}]};}
};
export class PeerLedger {
  constructor(){this.root='/SYNTHETIC-ledger';this.directory='/SYNTHETIC-ledger/.company';this.company_id='SYNTHETIC-lifecycle-only';}
  read(fn){assert.equal(this,lifecycleLedger);return fn(tx);}
}
export const lifecycleLedger=new PeerLedger();
export function validateContext(actualTx,context){return actualTx===tx&&canonical(context)===canonical(syntheticTaskContext);}
const checkPlan=(actualOwner,handle)=>{assert.equal(actualOwner,owner);assert.equal(handle,compiledPlan);};
const checkInventory=(actualLedger,options)=>{assert.equal(actualLedger,lifecycleLedger);assert.deepEqual(options,{stage:'existing',admission_ref:reference});};
const executionToken=Object.freeze({SYNTHETIC_LIFECYCLE_ONLY:true});
export function installSyntheticPredecessors(actualOwner,actualChild){assert.equal(owner,undefined);assert.equal(typeof actualOwner,'symbol');owner=actualOwner;child=actualChild;}
export function inspectOriginalCompiledCodexPlan(actualOwner,handle){checkPlan(actualOwner,handle);return {...plan,consumed:compiledClaimed};}
export function claimOriginalCompiledCodexPlan(actualOwner,handle){checkPlan(actualOwner,handle);assert.equal(compiledClaimed,false);compiledClaimed=true;return {...plan,consumed:true};}
export function originalCompiledPeerContextInterpreter(actualOwner,handle){checkPlan(actualOwner,handle);return null;}
export function originalCompanionSlotMatches(value){return value===slot;}
export function isOriginalBootstrapMembershipInterpreter(value){assert.equal(value,null);return false;}
export function assertOriginalPeerMaintenanceExecutionCapacityFrom(actualLedger,options){checkInventory(actualLedger,options);return Object.freeze({SYNTHETIC_LIFECYCLE_ONLY:true});}
export function assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom(actualLedger,actualTx,options){assert.equal(actualTx,tx);return assertOriginalPeerMaintenanceExecutionCapacityFrom(actualLedger,options);}
export function claimOriginalPeerExecutionLaunchFrom(actualLedger,options){assert.equal(actualLedger,lifecycleLedger);assert.deepEqual(options,{admission_ref:reference});assert.equal(executionClaimed,false);executionClaimed=true;executionCalls.claim++;return executionToken;}
export function bindOriginalPeerExecutionLaunchCutoffFrom(token,loan){
  assert.equal(token,executionToken);assert.equal(executionClaimed,true);assert.equal(executionCutoff,null);
  // Inspect the actual same-copy private loan. No shaped cutoff enters any
  // real production module, producer, Store or company.
  executionCutoff=lifecycleDomain.inspectOriginalProtectedExecutionCutoffFrom(loan,token);
  assert.equal(executionCutoff.deadline_at_ms,deadline);assert.ok(executionCutoff.signal instanceof AbortSignal);assert.equal(executionCutoff.signal.aborted,false);executionCalls.cutoff++;
}
export function spawnOriginalPeerExecutionLaunch(token,...args){
  assert.equal(token,executionToken);assert.equal(executionClaimed,true);assert.ok(executionCutoff);assert.equal(executionCutoff.signal.aborted,false);assert.equal(executionSpawned,false);assert.ok(child);
  assert.deepEqual(args,[plan.sandbox_executable,['-p',plan.sbpl,plan.executable,...plan.argv],{cwd:plan.cwd,env:plan.environment,stdio:['pipe','pipe','pipe','pipe','pipe'],shell:false,detached:true}]);
  executionSpawned=true;executionCalls.spawn++;spawnCalls.push(args);return child;
}
export {
  unavailable as assertOriginalBootstrapMembershipInterpreterFinal,
  unavailable as assertOriginalBootstrapMembershipPreflightInput,
  unavailable as assertOriginalBootstrapMembershipSlot,
  unavailable as assertOriginalPeerBootstrapMembershipRunner,
  unavailable as assertOriginalPeerContextInterpreterFinal,
  unavailable as assertOriginalPeerContextSlot,
  unavailable as assertOriginalPeerInputFrontier,
  unavailable as bootstrapReadonly3Tools,
  unavailable as cleanupOriginalWorkerLaunchFailure,
  unavailable as createFixedConnectBroker,
  unavailable as createOriginalBootstrapControlTranscript,
  unavailable as createOriginalControlTranscript,
  unavailable as createOriginalInputFrontierControlTranscript,
  unavailable as createOriginalOriginFinalReviewControlTranscript,
  unavailable as createOriginalOriginMaintenanceControlTranscript,
  unavailable as createOriginalOriginOrdinaryTaskControlTranscript,
  unavailable as expectedResponsesTools,
  unavailable as inputFrontierReadonly3Tools,
  unavailable as inputFrontierResponsesTools,
  unavailable as inspectOriginalBootstrapMembershipInterpreter,
  unavailable as inspectOriginalBootstrapMembershipPreflight,
  unavailable as inspectOriginalCompiledBootstrapScope,
  unavailable as inspectOriginalInputFrontierPreflight,
  unavailable as inspectOriginalOriginOrdinaryTaskSupport,
  unavailable as inspectOriginalPeerContextDelivery,
  unavailable as inspectOriginalPeerContextInterpreter,
  unavailable as inspectOriginalPeerInputFrontier,
  unavailable as originalBootstrapCompanionSlotMatches,
  unavailable as originalBootstrapMembershipPreflightInput,
  unavailable as originalBootstrapMembershipPreflightInterpreter,
  unavailable as originalInputFrontierPreflightInput,
  unavailable as originalInputFrontierPreflightInterpreter,
  unavailable as originalPeerBootstrapMembershipRunnerDeadline,
  unavailable as originalPeerBootstrapMembershipRunnerLedger,
  unavailable as originalPeerBootstrapMembershipRunnerPreflight,
  unavailable as originalPeerContextDeliveryInterpreter,
  unavailable as originalPeerInputFrontierMaintenanceLedger,
  unavailable as originalPeerInputFrontierPreflight,
  unavailable as originalWorkerFailedLaunchChild,
  unavailable as parseGatewayJSON,
  unavailable as parseOriginalBootstrapControlFrame,
  unavailable as parseOriginalControlFrame,
  unavailable as peerContextTurnInput,
  unavailable as resolveOriginalPeerContextInterpreter,
  unavailable as stableTaskHostTools
};
`);
  const shimURL=pathToFileURL(shimFile).href;
  const actualImports=[],syntheticImports=[];
  let selfImports=0,inventoryImports=0,spawnImports=0;
  const relocated=original.split('\n').map(line=>{
    const match=line.match(/^(import .* from )'([^']+)';$/);
    if(!match)return line;
    const [,prefix,specifier]=match;actualImports.push(line);
    if(specifier==='node:child_process')spawnImports++;
    if(specifier==='./protected-codex-domain.mjs'){
      selfImports++;return prefix+JSON.stringify(copyURL)+';';
    }
    if(specifier.startsWith('./')){
      syntheticImports.push(line);
      if(specifier==='./prospective-local-worker-inventory-producer.mjs')inventoryImports++;
      return prefix+JSON.stringify(shimURL)+';';
    }
    return line;
  }).join('\n');
  assert.deepEqual(actualImports,EXPECTED_IMPORTS,'all fixed import declarations retain their exact named bindings');
  assert.deepEqual(syntheticImports,EXPECTED_IMPORTS.filter(line=>line.includes(" from './")&&!line.includes(" from './protected-codex-domain.mjs'")),
    'only the closed application predecessor roster is SYNTHETIC');
  assert.equal(selfImports,1,'the private cutoff binder uses exactly the same copied domain namespace');
  assert.equal(inventoryImports,2,'the exact seven-binding producer import and its namespace share one SYNTHETIC contract');
  assert.equal(spawnImports,0,'the domain delegates spawn through the fixed inventory predecessor');
  const body=text=>text.split('\n').filter(line=>!line.startsWith('import ')).join('\n');
  assert.equal(body(relocated),body(original),'all production lifecycle code and timing constants stay exact');
  fs.writeFileSync(copy,relocated);
  const domain=await import(copyURL),shim=await import(shimURL);
  child=new SyntheticChild();const owner=Symbol('synthetic lifecycle owner');
  shim.installSyntheticPredecessors(owner,child);
  restoreKill=process.kill;
  process.kill=(...args)=>{numericCalls.push(args);throw Error('numeric PID/group operation is forbidden in this source regression');};
  t.mock.timers.enable({apis:['setTimeout']});timersEnabled=true;
  const handle=domain.createOriginalProtectedCodexLaunch(owner,shim.compiledPlan);
  // Conditional unit predecessor DATA only. The unchanged domain binder and
  // private cutoff map run, but genuine producer/admission positives are UNPROVED.
  domain.bindOriginalProtectedTaskAdmission(owner,handle,shim.lifecycleLedger,shim.syntheticTaskId,shim.syntheticTaskContext);
  facade=domain.spawnOriginalProtectedCodex(owner,handle);
  const errors=[];facade.on('error',error=>errors.push(error));
  assert.deepEqual(shim.executionCalls,{claim:1,cutoff:1,spawn:1},'the SYNTHETIC predecessor still traverses the unchanged private binder and delegated spawn seam');
  assert.equal(shim.spawnCalls.length,1);
  assert.equal(shim.spawnCalls[0][0],'/synthetic/sandbox');
  assert.deepEqual(shim.spawnCalls[0][2].stdio,['pipe','pipe','pipe','pipe','pipe']);
  assert.equal(shim.spawnCalls[0][2].detached,true);
  child.emit('spawn');
  assert.equal(domain.inspectOriginalProtectedCodexLaunch(owner,handle).state,'born');
  return {domain,owner,handle,facade,child,numericCalls,errors};
}

function assertUnqualifiedLocalClose(domain,owner,handle){
  const observed=domain.inspectOriginalProtectedCodexLaunch(owner,handle);
  assert.equal(observed.original_exit_observed,true);
  assert.equal(observed.original_group_absent,null,'local events do not establish process-group absence');
  assert.equal(observed.local_process_and_streams_closed,true);
  assert.deepEqual(observed.local_stdio_closed,{stdout:true,stderr:true,witness:true,stdin:true,control:true});
  assert.equal(observed.local_domain_closed,false);
  assert.equal(observed.whole_domain_qualified,false);
  assert.equal(observed.actual_backend_source_build_qualified,false);
  assert.equal(observed.state,'unknown');
  return observed;
}

test('leader exit before stdio close forbids later numeric PID operations and retained-child signals',{concurrency:false},async t=>{
  const {domain,owner,handle,facade,child,numericCalls,errors}=await fixture(t);
  // Deliberately lag secondary exitCode/signalCode properties: the actual exit
  // event latch alone must stop signals while streams remain open.
  child.exit(0,null,{updateProperties:false});
  const exited=domain.inspectOriginalProtectedCodexLaunch(owner,handle);
  assert.equal(exited.original_exit_observed,true);
  assert.deepEqual(exited.original_exit,{code:0,signal:null});
  assert.equal(exited.local_process_and_streams_closed,false);
  facade.kill('SIGTERM');facade.kill('SIGKILL');domain.requestOriginalProtectedCodexStop(owner,handle);
  t.mock.timers.tick(250);t.mock.timers.tick(500);
  assert.deepEqual(child.signals,[],'no retained-child signal after the original leader exit');
  assert.deepEqual(numericCalls,[]);
  const closed=once(facade,'close');await child.closeStreamsAndChild(0,null);await closed;
  assertUnqualifiedLocalClose(domain,owner,handle);
  t.mock.timers.tick(120000); // Original close must clear escalation and lifetime timers.
  assert.deepEqual(child.signals,[]);assert.deepEqual(numericCalls,[]);assert.deepEqual(errors,[]);
});

test('pre-exit stop signals only the retained child and exit cancels all later escalation and queries',{concurrency:false},async t=>{
  const {domain,owner,handle,facade,child,numericCalls,errors}=await fixture(t);
  facade.kill('SIGTERM');
  assert.deepEqual(child.signals,[{signal:'SIGTERM',after_exit:false}]);
  assert.deepEqual(numericCalls,[],'the initial signal uses only the retained ChildProcess method');
  child.exit(null,'SIGTERM');
  t.mock.timers.tick(250);t.mock.timers.tick(500);
  assert.deepEqual(child.signals,[{signal:'SIGTERM',after_exit:false}],'no delayed escalation after exit');
  const closed=once(facade,'close');await child.closeStreamsAndChild(null,'SIGTERM');await closed;
  const observed=assertUnqualifiedLocalClose(domain,owner,handle);
  assert.deepEqual(observed.original_exit,{code:null,signal:'SIGTERM'});
  assert.deepEqual(observed.close,{code:null,signal:'SIGTERM'});
  t.mock.timers.tick(120000);
  assert.deepEqual(child.signals,[{signal:'SIGTERM',after_exit:false}]);assert.deepEqual(numericCalls,[]);assert.deepEqual(errors,[]);
});
