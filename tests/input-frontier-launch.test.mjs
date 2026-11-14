import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as actualDomain from '../plugins/soloco/runtime/peers/protected-codex-domain.mjs';
import {createHash} from 'node:crypto';

const HOST=fileURLToPath(new URL('../plugins/soloco/runtime/peers/input-frontier-host.mjs',import.meta.url)),ENTRY=fileURLToPath(new URL('../plugins/soloco/runtime/peers/maintenance-launch.mjs',import.meta.url));
const NATIVE='00000000-0000-7000-8000-000000000001',TURN='00000000-0000-7000-8000-000000000002',SHA='1'.repeat(64),OUTPUT='SYNTHETIC bounded frontier output';
const flush=()=>new Promise(r=>setImmediate(r));

// Exact 439f8e73 Source import contracts, including named bindings and aliases.
// A changed predecessor requires an explicit fixture review, never a count bump.
const SOURCE_IMPORTS=Object.freeze({
  "HOST": [
    "import {TextDecoder} from 'node:util';",
    "import {canonical} from './ledger.mjs';",
    "import {parseGatewayJSON} from './gateway-wire.mjs';",
    "import {FRONTIER_INSTRUCTION} from './input-frontier.mjs';",
    "import {inputFrontierReadonly3Tools,originalInputFrontierPreflightInput} from './input-frontier-wire.mjs';",
    "import {inspectOriginalPeerInputFrontier,assertOriginalPeerInputFrontier,originalPeerInputFrontierPreflight,bindOriginalPeerInputFrontierNative,originalPeerInputFrontierChannel} from './input-frontier-maintenance.mjs';",
    "import * as domain from './protected-codex-domain.mjs';"
  ],
  "ENTRY": [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import {types} from 'node:util';",
    "import {canonical,peerDigest,PeerLedger} from './ledger.mjs';",
    "import {loadOriginalSelectedPackagedPeerBridge,inspectOriginalInputFrontierSupport,createOriginalLoadedBootstrapMembershipRuntime} from './context-component-deployment.mjs';",
    "import {createPolicySupervisor} from './policy-supervisor.mjs';",
    "import {prepareOriginalProtectedInputFrontierLaunch,requestOriginalProtectedCodexStop} from './protected-codex-domain.mjs';",
    "import {originalPeerInputFrontierMaintenanceLedger,prepareOriginalPeerInputFrontier,inspectOriginalPeerInputFrontier,originalPeerInputFrontierPreflight,completeOriginalPeerInputFrontier,holdOriginalPeerInputFrontier,recordOriginalPeerInputFrontierLateEvidence} from './input-frontier-maintenance.mjs';",
    "import {runOriginalInputFrontierHost} from './input-frontier-host.mjs';",
    "import * as originHost from './origin-maintenance-host.mjs';",
    "import * as originRange from './origin-maintenance.mjs';",
    "import * as originSeal from './origin-frontier-seal.mjs';",
    "import * as ownerReview from './owner-handover.mjs';",
    "import * as ordinaryReview from './origin-ordinary-task.mjs';",
    "import {inspectOriginalOriginOrdinaryTaskSupport as ordinaryOriginSupport} from './context-component-deployment.mjs';",
    "import {prepareOriginalProtectedOriginOrdinaryTaskLaunch} from './protected-codex-domain.mjs';",
    "import {closed as bootstrapClosed,bootstrapActor,bootstrapPhaseInput,text as bootstrapText} from './bootstrap-membership-contract.mjs';",
    "import {assertPeerBootstrapOperationFrom} from './bootstrap-membership-context.mjs';"
  ],
  "DOMAIN": [
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
  ]
});
function relocateSourceImports(original,sourcePath,kind,replacements){
 const lines=original.split('\n'),imports=lines.filter(line=>line.startsWith('import '));
 assert.deepEqual(imports,SOURCE_IMPORTS[kind],kind+' exact permitted import declarations');
 const seen=new Set(),relocated=lines.map(line=>{
  if(!line.startsWith('import '))return line;
  const match=line.match(/^(import .* from )'([^']+)';$/);assert.ok(match,'the selected Source import grammar is closed');
  const [,prefix,name]=match;
  if(replacements.has(name)){seen.add(name);return prefix+JSON.stringify(replacements.get(name))+';';}
  return name.startsWith('./')?prefix+JSON.stringify(new URL(name,pathToFileURL(sourcePath)).href)+';':line;
 }).join('\n');
 assert.deepEqual([...seen].sort(),[...replacements.keys()].sort(),kind+' exact replaced predecessor modules');
 const body=value=>value.split('\n').filter(line=>!line.startsWith('import ')).join('\n');
 assert.equal(body(relocated),body(original),'the entire production module body remains exact');
 return relocated;
}

async function fixture(t,{entry=false}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-frontier-source-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const shim=path.join(directory,'SYNTHETIC-predecessors.mjs');
 // The entire new host/entry BODY is exercised unchanged. Only predecessor
 // imports are fictional. These are NOT real service/domain issuers, original
 // source selection, physical process closure, native QA or company acceptance.
 fs.writeFileSync(shim,`import {EventEmitter} from 'node:events';import {PassThrough,Writable} from 'node:stream';
export const api=Object.freeze({SYNTHETIC:true}),cap=Object.freeze({SYNTHETIC:true}),launch=Object.freeze({SYNTHETIC:true});
const preflight=Object.freeze({SYNTHETIC:true}),creation=Object.freeze({SYNTHETIC:true}),drain=Object.freeze({SYNTHETIC:true}),diagnostic=Object.freeze({SYNTHETIC:true});
const ledger={root:'/SYNTHETIC',directory:'/SYNTHETIC/.company',company_id:'SYNTHETIC'};
export const counts={prepare:0,spawn:0,load:0,stop:0,creation:0,normal_eof:0,ledger:0};
export let deadline=Date.now()+120000,native=null,submitted=null,read=0,creationReady=false,terminal=false,suppressDrain=false;export function setDeadline(n){deadline=n;}export function setSuppressDrain(v){suppressDrain=v;}
export class Child extends EventEmitter{constructor(){super();this.frames=[];this.closed=false;this.autoClose=true;this.stdout=new PassThrough();this.stderr=new PassThrough();this.stdin=new Writable({write:(chunk,e,done)=>{this.frames.push(JSON.parse(chunk.toString()));done();}});this.stdin.on('finish',()=>{counts.normal_eof++;if(this.autoClose)setImmediate(()=>this.close());});}message(frame){if(frame.id==='soloco-peer-2'&&frame.result?.thread)creationReady=true;if(frame.method==='turn/completed')terminal=true;this.stdout.write(JSON.stringify(frame)+'\\n');}close(code=0,signal=null){if(this.closed)return;this.closed=true;this.stdout.end();this.stderr.end();setImmediate(()=>this.emit('close',code,signal));}}
export const child=new Child();
const requireCap=c=>{if(c!==cap)throw Object.assign(Error('SYNTHETIC_CAP_REQUIRED'),{code:'SYNTHETIC_CAP_REQUIRED'});};
export function inspectOriginalPeerInputFrontier(c){requireCap(c);return {deadline_at_ms:deadline,native_id:native,admission_ref:{family:'work_items',id:'SYNTHETIC-admission',revision:1,sha256:'${SHA}'},context_sha256:'${SHA}',kind:'input-frontier-produce'};}
export function assertOriginalPeerInputFrontier(c,{stage}={}){requireCap(c);if(Date.now()>=deadline||stage!==(native?'execution':'reserved'))throw Object.assign(Error('SYNTHETIC_CURRENT_CHANGED'),{code:'SYNTHETIC_CURRENT_CHANGED'});return inspectOriginalPeerInputFrontier(c);}
export function originalPeerInputFrontierPreflight(c){requireCap(c);return preflight;}
export function originalInputFrontierPreflightInput(p){if(p!==preflight)throw Error('SYNTHETIC_PREFLIGHT_REQUIRED');return [{type:'text',text:'SYNTHETIC complete assignment'}];}
export function inputFrontierReadonly3Tools(){return ['soloco_context_header','soloco_context_read','soloco_context_submit'].map(name=>({type:'function',name,inputSchema:{type:'object',properties:{},required:[],additionalProperties:false}}));}
export function bindOriginalPeerInputFrontierNative(c,token){requireCap(c);if(token!==creation||!creationReady||native)throw Error('SYNTHETIC_CREATION_REQUIRED');counts.creation++;native='${NATIVE}';}
export function originalPeerInputFrontierChannel(c){requireCap(c);return {header(){return {sha256:'${SHA}',total_characters:4};},read(a){if(a.sha256!=='${SHA}'||a.offset!==0||a.length!==4)throw Object.assign(Error('SYNTHETIC_RANGE'),{code:'SYNTHETIC_RANGE'});read=4;return {text:'DATA'};},submit(a){if(read!==4||a.sha256!=='${SHA}'||submitted!==null)throw Object.assign(Error('SYNTHETIC_INCOMPLETE'),{code:'SYNTHETIC_INCOMPLETE'});submitted=a.content;return {submitted:true};}};}
export function originalProtectedPeerLaunchConfiguration(){return {cwd:'/SYNTHETIC',environment:{}};}
export function bindOriginalProtectedInputFrontierAdmission(o,l,a,c){if(typeof o!=='symbol'||l!==launch||a!==api||c!==cap)throw Error('SYNTHETIC_BINDING');}
export function bindOriginalProtectedCodexLaunch(){}export function assertOriginalProtectedPeerContextStatic(){}export function assertOriginalProtectedCodexBoundary(){}
export function spawnOriginalProtectedCodex(o,l){if(typeof o!=='symbol'||l!==launch)throw Error('SYNTHETIC_LAUNCH');counts.spawn++;setImmediate(()=>child.emit('spawn'));return child;}
export function originalProtectedOwnedTaskTokens(){return {creation:creationReady?creation:null,drain:child.closed&&terminal&&submitted!==null&&counts.normal_eof===1&&!counts.stop&&!suppressDrain?drain:null,diagnostic:counts.stop?diagnostic:null};}
export function requestOriginalProtectedCodexStop(){counts.stop++;child.close(null,'SIGTERM');}
export function originalPeerInputFrontierMaintenanceLedger(a){if(a!==api)throw Error('SYNTHETIC_API');counts.ledger++;return ledger;}
export function prepareOriginalPeerInputFrontier(){counts.prepare++;return cap;}export function loadOriginalSelectedPackagedPeerBridge(){counts.load++;}export function createOriginalLoadedBootstrapMembershipRuntime(){throw Error('SYNTHETIC_UNSELECTED_BOOTSTRAP');}export function inspectOriginalOriginOrdinaryTaskSupport(){throw Error('SYNTHETIC_UNSELECTED_ORDINARY');}export function prepareOriginalProtectedOriginOrdinaryTaskLaunch(){throw Error('SYNTHETIC_UNSELECTED_ORDINARY');}export function inspectOriginalInputFrontierSupport(){}export function createPolicySupervisor(){throw Error('SYNTHETIC_UNSELECTED');}export function prepareOriginalProtectedInputFrontierLaunch(){throw Error('SYNTHETIC_UNSELECTED');}export function completeOriginalPeerInputFrontier(){throw Error('SYNTHETIC_UNSELECTED');}export function holdOriginalPeerInputFrontier(){throw Error('SYNTHETIC_UNSELECTED');}export function recordOriginalPeerInputFrontierLateEvidence(){throw Error('SYNTHETIC_UNSELECTED');}export function runOriginalInputFrontierHost(){throw Error('SYNTHETIC_UNSELECTED');}
`);
 const sourcePath=entry?ENTRY:HOST,original=fs.readFileSync(sourcePath,'utf8'),shimURL=pathToFileURL(shim).href;
 const replaced=entry?['./context-component-deployment.mjs','./policy-supervisor.mjs','./protected-codex-domain.mjs','./input-frontier-maintenance.mjs','./input-frontier-host.mjs']:['./input-frontier-wire.mjs','./input-frontier-maintenance.mjs','./protected-codex-domain.mjs'];
 const relocated=relocateSourceImports(original,sourcePath,entry?'ENTRY':'HOST',new Map(replaced.map(name=>[name,shimURL])));
 const copy=path.join(directory,entry?'entry.mjs':'host.mjs');fs.writeFileSync(copy,relocated);const module=await import(pathToFileURL(copy).href),synthetic=await import(shimURL);
 t.after(()=>synthetic.child.close(null,'SIGTERM'));return {module,s:synthetic,start(){return module.runOriginalInputFrontierHost(Symbol('SYNTHETIC owner'),synthetic.launch,synthetic.api,synthetic.cap);}};
}
function threadResult(overrides={}){return {thread:{id:NATIVE,parentThreadId:null,forkedFromId:null,turns:[],ephemeral:false},cwd:'/SYNTHETIC',runtimeWorkspaceRoots:['/SYNTHETIC'],approvalPolicy:'never',activePermissionProfile:{id:':read-only'},instructionSources:[],...overrides};}
async function running(f){
 const result=f.start();await flush();assert.equal(f.s.child.frames[0].method,'initialize');f.s.child.message({id:'soloco-peer-1',result:{}});assert.equal(f.s.child.frames[1].method,'initialized');const start=f.s.child.frames[2];assert.equal(start.method,'thread/start');assert.equal(start.params.permissions,':read-only');assert.equal(start.params.ephemeral,false);assert.ok(!f.s.child.frames.some(x=>x.method==='thread/resume'));
 f.s.child.message({id:'soloco-peer-2',result:threadResult()});assert.equal(f.s.counts.creation,1);f.s.child.message({id:'soloco-peer-3',result:{turn:{id:TURN,status:'inProgress'}}});return {result};
}
function tool(f,name,args,id=name,extra={}){f.s.child.message({id,method:'item/tool/call',params:{threadId:NATIVE,turnId:TURN,callId:id,namespace:null,tool:name,arguments:args,...extra}});}
function submit(f){tool(f,'soloco_context_header',{});tool(f,'soloco_context_read',{sha256:SHA,offset:0,length:4});tool(f,'soloco_context_submit',{sha256:SHA,content:OUTPUT});}
function finalItem(f,output=OUTPUT){f.s.child.message({method:'item/completed',params:{threadId:NATIVE,turnId:TURN,completedAtMs:0,item:{id:'final',type:'agentMessage',phase:'final_answer',text:output}}});}
function terminal(f,output=OUTPUT){finalItem(f,output);f.s.child.message({method:'turn/completed',params:{threadId:NATIVE,turn:{id:TURN,status:'completed',error:null}}});}

test('frontier actual host body conditionally completes only fresh-start readall submit exactfinal gracefulEOF and opaque drain',async t=>{
 const f=await fixture(t),{result}=await running(f);submit(f);terminal(f);const actual=await result;assert.equal(actual.error,null);assert.ok(actual.drain);assert.equal(f.s.counts.spawn,1);assert.equal(f.s.counts.normal_eof,1);assert.equal(f.s.counts.stop,0);assert.equal(f.s.counts.creation,1);
});
for(const [name,override] of [['fork',{thread:{...threadResult().thread,parentThreadId:'parent'}}],['prior turns',{thread:{...threadResult().thread,turns:[{id:'old'}]}}],['wrong permission',{activePermissionProfile:{id:':workspace-write'}}],['descriptor mistaken for permission',{activePermissionProfile:{id:'soloco-input-frontier-readonly-v1'}}],['wrong roots',{runtimeWorkspaceRoots:['/other']}],['ephemeral',{thread:{...threadResult().thread,ephemeral:true}}]])test('frontier host rejects '+name+' before creation or first turn',async t=>{
 const f=await fixture(t),result=f.start();await flush();f.s.child.message({id:'soloco-peer-1',result:{}});f.s.child.message({id:'soloco-peer-2',result:threadResult(override)});const actual=await result;assert.ok(actual.error);assert.equal(actual.drain,null);assert.equal(f.s.counts.creation,0);assert.equal(f.s.child.frames.some(x=>x.method==='turn/start'),false);
});
test('frontier callbacks require the correlated native turn and forbid ordinary execution tools',async t=>{
 const f=await fixture(t),{result}=await running(f);tool(f,'soloco_peer_execute',{action:'task/submit',args:{}},'ordinary');const actual=await result;assert.equal(actual.error,'FRONTIER_HOST_TOOL_BINDING');assert.equal(actual.drain,null);
});
test('frontier cross-native callback is held before invoking the private channel',async t=>{
 const f=await fixture(t),{result}=await running(f);tool(f,'soloco_context_header',{},'cross',{threadId:'foreign'});assert.equal((await result).error,'FRONTIER_HOST_TOOL_BINDING');assert.equal(f.s.read,0);
});
test('frontier identical callback replay returns cached bytes without repeating the private submission',async t=>{
 const f=await fixture(t),{result}=await running(f);submit(f);tool(f,'soloco_context_submit',{sha256:SHA,content:OUTPUT});terminal(f);assert.equal((await result).error,null);assert.equal(f.s.submitted,OUTPUT);
});
test('frontier changed callback replay cannot replace the first submission',async t=>{
 const f=await fixture(t),{result}=await running(f);submit(f);tool(f,'soloco_context_submit',{sha256:SHA,content:'changed'});assert.equal((await result).error,'FRONTIER_HOST_TOOL_REPLAY');assert.equal(f.s.submitted,OUTPUT);
});
test('frontier incomplete coverage cannot submit or produce an accepted drain',async t=>{
 const f=await fixture(t),{result}=await running(f);tool(f,'soloco_context_submit',{sha256:SHA,content:OUTPUT});const actual=await result;assert.equal(actual.error,'SYNTHETIC_INCOMPLETE');assert.equal(actual.drain,null);
});
test('frontier final answer must equal the first attributed submission byte for byte',async t=>{
 const f=await fixture(t),{result}=await running(f);submit(f);finalItem(f,OUTPUT+' changed');assert.equal((await result).error,'FRONTIER_HOST_FINAL_SUBMISSION');assert.equal(f.s.counts.normal_eof,0);assert.equal(f.s.counts.stop,1,'the rejected first final item stops the producer before another frame');
});
test('frontier unmatched RPC cannot start or continue a turn',async t=>{
 const f=await fixture(t),{result}=await running(f);f.s.child.message({id:'unmatched',result:{}});assert.equal((await result).error,'FRONTIER_HOST_RPC_REPLAY');
});
test('frontier early direct-child close retains UNKNOWN and cannot release through a copied EOF label',async t=>{
 const f=await fixture(t),{result}=await running(f);f.s.child.close(0,null);const actual=await result;assert.equal(actual.error,'FRONTIER_HOST_CHILD_UNKNOWN');assert.equal(actual.drain,null);
});
test('frontier expired original deadline cannot become a new drain wait allowance',async t=>{
 const f=await fixture(t);let now=Date.now();t.mock.method(Date,'now',()=>now);f.s.setDeadline(now+1000);const {result}=await running(f);f.s.child.autoClose=false;submit(f);f.s.setSuppressDrain(true);terminal(f);await flush();assert.equal(f.s.counts.normal_eof,1,'valid terminal caused graceful EOF before expiry');assert.equal(f.s.child.closed,false);assert.equal(f.s.counts.stop,0);now+=1001;f.s.child.close(0,null);const actual=await result;assert.equal(actual.error,'FRONTIER_HOST_DEADLINE');assert.equal(actual.drain,null);assert.equal(f.s.counts.stop,1);
});
test('frontier entry missing genuine global inventory Holds before prepare, build load, charge or spawn',async t=>{
 const f=await fixture(t,{entry:true});await assert.rejects(f.module.runOriginalPeerInputFrontier(f.s.api,{operation_id:'SYNTHETIC',frontier_id:'SYNTHETIC',node_id:'SYNTHETIC',stage:'produce'}),{code:'FRONTIER_ORIGINAL_EXECUTION_INVENTORY_SOURCE_REQUIRED'});assert.equal(f.s.counts.prepare,0);assert.equal(f.s.counts.load,0);assert.equal(f.s.counts.spawn,0);
});
test('frontier entry rejects caller profile and accessor selectors before touching the service',async t=>{
 const f=await fixture(t,{entry:true}),input={operation_id:'SYNTHETIC',frontier_id:'SYNTHETIC',node_id:'SYNTHETIC',stage:'produce'};await assert.rejects(f.module.runOriginalPeerInputFrontier(f.s.api,{...input,profile:'caller'}),{code:'FRONTIER_LAUNCH_INPUT'});let calls=0;Object.defineProperty(input,'stage',{enumerable:true,get(){calls++;return 'produce';}});await assert.rejects(f.module.runOriginalPeerInputFrontier(f.s.api,input),{code:'FRONTIER_LAUNCH_INPUT'});assert.equal(calls,0);assert.equal(f.s.counts.ledger,0);
});
test('frontier production creation and drain interfaces reject copied facts and wrong reference-family aliases',()=>{
 const expected={ledger:{},admission_ref:{family:'work_items',id:'forged',revision:1,sha256:SHA},context_sha256:SHA,kind:'input-frontier-produce'};
 for(const fake of [{},{protocol:'peer-input-frontier-original-creation-v1',native_id:NATIVE},{protocol:'peer-owned-admitted-task-drain-v1',kind:'input-frontier-produce',terminal_status:'completed'}]){assert.throws(()=>actualDomain.assertOriginalProtectedInputFrontierCreation(fake,expected),{code:'PROTECTED_CODEX_ORIGINAL_OWNED_CAP_REQUIRED'});assert.throws(()=>actualDomain.assertOriginalProtectedOwnedTaskDrain(fake,expected),{code:'PROTECTED_CODEX_ORIGINAL_OWNED_CAP_REQUIRED'});}
});

// Real NEW domain body/private WeakMaps/FD decoder, with every selected build,
// global inventory, ledger service and child predecessor explicitly SYNTHETIC.
// No native executable, actual global coverage or company proof is manufactured.
async function originalDomainFixture(t,{admissionMs=60000,beforeCreation,beforeRequest,stopAt,centralAvailable=true}={}){
 const file=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-codex-domain.mjs',import.meta.url)),directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-frontier-domain-source-')),shim=path.join(directory,'SYNTHETIC-domain-predecessors.mjs'),copy=path.join(directory,'domain.mjs'),copyURL=pathToFileURL(copy).href;
 let facade,s,original,timersEnabled=false;
 t.after(async()=>{try{await s?.child.close();facade?.stdin.destroy();facade?.stdout.destroy();if(original!==undefined)assert.equal(fs.readFileSync(file,'utf8'),original);}finally{if(timersEnabled)t.mock.timers.reset();fs.rmSync(directory,{recursive:true,force:true});}});
 const peers=new URL('../plugins/soloco/runtime/peers/',import.meta.url),wireURL=new URL('input-frontier-wire.mjs',peers).href,ledgerURL=new URL('ledger.mjs',peers).href;
 fs.writeFileSync(shim,`import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import * as copiedDomain from ${JSON.stringify(copyURL)};
export {canonical} from ${JSON.stringify(ledgerURL)};
export {INPUT_FRONTIER_CONTEXT_SELECTION,INPUT_FRONTIER_PROFILE,inputFrontierReadonly3Tools,inputFrontierResponsesTools} from ${JSON.stringify(wireURL)};
export const ORIGINAL_CONTEXT_SELECTION={SYNTHETIC:true},interpreter=Object.freeze({SYNTHETIC:true}),compiledPlan=Object.freeze({SYNTHETIC:true}),api=Object.freeze({SYNTHETIC:true}),cap=Object.freeze({SYNTHETIC:true}),preflight=Object.freeze({SYNTHETIC:true});
export class PeerLedger{constructor(){this.root='/SYNTHETIC-project';this.directory=this.root+'/.company';this.company_id='SYNTHETIC';}}
export const ledger=new PeerLedger();let native=null,capacityKnown=true,capacityReadHook=null;export function onceCapacityRead(fn){capacityReadHook=fn;}export function setNative(v){native=v;}export function setCapacity(v){capacityKnown=v;}
export const reference={family:'work_items',id:'SYNTHETIC-admission',revision:1,sha256:'${SHA}'},input=[{type:'text',text:'SYNTHETIC admitted input-frontier frame'}];
export function inspectOriginalPeerInputFrontier(c){if(c!==cap)throw Error('SYNTHETIC_CAP');return {kind:'input-frontier-produce',admission_ref:reference,context_sha256:'${SHA}',frontier_id:'SYNTHETIC-frontier',node_id:'SYNTHETIC-node',stage:'produce',deadline_at_ms:Date.now()+60000,owner_epoch:1,pause_generation:1,native_id:native};}
// Stable expiry is essential: it is not renewed by an inspection.
export const expiry=Date.now()+${admissionMs};export function assertOriginalPeerInputFrontier(c,{ledger:actual,stage}={}){if(actual!==undefined&&actual!==ledger||stage!==(native?'execution':'reserved'))throw Error('SYNTHETIC_CURRENT');return {...inspectOriginalPeerInputFrontier(c),deadline_at_ms:expiry};}
export function originalPeerInputFrontierMaintenanceLedger(a){if(a!==api)throw Error('SYNTHETIC_API');return ledger;}export function originalPeerInputFrontierPreflight(c){if(c!==cap)throw Error('SYNTHETIC_CAP');return preflight;}
export function assertOriginalPeerMaintenanceExecutionCapacityFrom(actual,{stage,admission_ref}){if(actual!==ledger||stage!=='existing'||JSON.stringify(admission_ref)!==JSON.stringify(reference))throw Error('SYNTHETIC_INVENTORY_BINDING');const result={protocol:'original-local-execution-inventory-v1',retained_row_census_complete:true,admission_launch_coverage_complete:capacityKnown,cardinality_known:true,unit:'new-origin-maintenance-model-invocation',occupied:1,remaining:0};const hook=capacityReadHook;capacityReadHook=null;hook?.();return result;}
export function originalInputFrontierPreflightInterpreter(p){if(p!==preflight)throw Error('SYNTHETIC_PREFLIGHT');return interpreter;}export function originalInputFrontierPreflightInput(p){if(p!==preflight)throw Error('SYNTHETIC_PREFLIGHT');return input;}export function inspectOriginalInputFrontierPreflight(p){if(p!==preflight)throw Error('SYNTHETIC_PREFLIGHT');return {payload_sha256:'${SHA}'};}
export const slot={slot_id:'SYNTHETIC-frontier-slot',scope_policy:'V5_ORIGINAL_MANAGED_PRIVATE_FD',executable_sha256:'a'.repeat(64),source_manifest_sha256:'b'.repeat(64),native_context_contract:{original_home_sha256:'c'.repeat(64),upstream_url:'https://example.invalid/responses',final_request_contract:{mode:'original-live-scoped-source',producer_module_sha256:'d'.repeat(64),tool_resource_sha256:'b15ae178857196eac75123652817c1673a2e4941b409f6d5cbb72225800f7863'}}};
const plan={launch_mode:'companion-v2',companion_slot:slot,executable_pin:{sha256:'a'.repeat(64)},sandbox_executable:'/SYNTHETIC/sandbox',executable:'/SYNTHETIC/companion',argv:[],sbpl:'SYNTHETIC policy',cwd:'/SYNTHETIC-project',state_root:'/SYNTHETIC-state',scratch_root:'/SYNTHETIC-scratch',gateway_port:43123,environment:{}};
export function isOriginalInputFrontierInterpreter(h){return h===interpreter;}export function assertOriginalInputFrontierInterpreterFinal(h){if(h!==interpreter)throw Error('SYNTHETIC_INTERPRETER');}export function inspectOriginalInputFrontierInterpreter(h){assertOriginalInputFrontierInterpreterFinal(h);return {SYNTHETIC:true};}export function assertOriginalInputFrontierSlot(h,s){assertOriginalInputFrontierInterpreterFinal(h);if(JSON.stringify(s)!==JSON.stringify(slot))throw Error('SYNTHETIC_SLOT');}
export function assertOriginalPeerContextInterpreterFinal(){throw Error('ordinary alias forbidden');}export function assertOriginalPeerContextSlot(){throw Error('ordinary alias forbidden');}export function inspectOriginalPeerContextInterpreter(){throw Error('ordinary alias forbidden');}export function resolveOriginalPeerContextInterpreter(){throw Error('ordinary alias forbidden');}export function originalCompanionSlotMatches(){return false;}
export function isOriginalBootstrapMembershipInterpreter(){return false;}export function assertOriginalBootstrapMembershipInterpreterFinal(){throw Error('SYNTHETIC_UNSELECTED_BOOTSTRAP');}export function inspectOriginalBootstrapMembershipInterpreter(){throw Error('SYNTHETIC_UNSELECTED_BOOTSTRAP');}export function assertOriginalBootstrapMembershipSlot(){throw Error('SYNTHETIC_UNSELECTED_BOOTSTRAP');}export function originalBootstrapCompanionSlotMatches(){return false;}
export function inspectOriginalCompiledBootstrapScope(){throw Error('SYNTHETIC_UNSELECTED_BOOTSTRAP');}
let owner,claimed=false;export function install(o){owner=o;}const check=(o,h)=>{if(o!==owner||h!==compiledPlan)throw Error('SYNTHETIC_OWNER');};export function inspectOriginalCompiledCodexPlan(o,h){check(o,h);return {...plan,consumed:claimed};}export function claimOriginalCompiledCodexPlan(o,h){check(o,h);if(claimed)throw Error('SYNTHETIC_REPLAY');claimed=true;return plan;}export function originalCompiledPeerContextInterpreter(o,h){check(o,h);return interpreter;}
export async function createFixedConnectBroker({owner,guard}){guard(owner,'listen');const facts={phase:'CLOSED',local_tcp_closure:'OBSERVED',remote_domain_closed:false};return {port:43123,closed:Promise.resolve(facts),close:async()=>facts};}
class Child extends EventEmitter{constructor(){super();this.pid=424242;this.exitCode=null;this.signalCode=null;this.stdin=new PassThrough();this.stdout=new PassThrough();this.stderr=new PassThrough();this.stdio=[this.stdin,this.stdout,this.stderr,new PassThrough(),new PassThrough()];this.stdin.resume();this.controls=[];let buffer='';this.stdio[4].on('data',b=>{buffer+=b.toString();for(;;){const end=buffer.indexOf('\\n');if(end<0)break;this.controls.push(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);}});}kill(){return true;}async close(){if(this.exitCode!==null)return;this.exitCode=0;this.emit('exit',0,null);this.stdout.end();this.stderr.end();this.stdio[3].end();this.stdin.destroy();this.stdio[4].destroy();await new Promise(r=>setImmediate(r));this.emit('close',0,null);await new Promise(r=>setImmediate(r));}}
export const child=new Child(),spawns=[];export let centralBindings=0;
// Only the explicitly missing-ABI negative imports this value. Positive cases
// use the SAME copied domain's real binder and its private launch record.
export const bindOriginalProtectedExecutionLaunch=undefined;
const sourceToken=Object.freeze(Object.create(null));let cutoffLoan=null,cutoffFacts=null,spawned=false;
export function claimOriginalPeerExecutionLaunchFrom(actual,{admission_ref}){assert.equal(actual,ledger);assert.deepEqual(admission_ref,reference);assert.equal(centralBindings,0,'one Synthetic Original-predecessor claim');assert.equal(capacityKnown,true);centralBindings++;return sourceToken;}
export function bindOriginalPeerExecutionLaunchCutoffFrom(token,loan){assert.equal(token,sourceToken);assert.equal(centralBindings,1);assert.equal(cutoffLoan,null,'one cutoff loan');const facts=copiedDomain.inspectOriginalProtectedExecutionCutoffFrom(loan,token);assert.ok(Number.isSafeInteger(facts.deadline_at_ms)&&Date.now()<facts.deadline_at_ms);assert.equal(facts.signal.aborted,false);cutoffLoan=loan;cutoffFacts=facts;}
export function spawnOriginalPeerExecutionLaunch(token,command,args,options){assert.equal(token,sourceToken);assert.equal(centralBindings,1);assert.ok(cutoffLoan);assert.equal(spawned,false,'one Synthetic child');const facts=copiedDomain.inspectOriginalProtectedExecutionCutoffFrom(cutoffLoan,token);assert.equal(facts.deadline_at_ms,cutoffFacts.deadline_at_ms);assert.equal(facts.signal,cutoffFacts.signal);assert.ok(Date.now()<facts.deadline_at_ms);assert.equal(facts.signal.aborted,false);assert.equal(command,plan.sandbox_executable);assert.deepEqual(args,['-p',plan.sbpl,plan.executable,...plan.argv]);assert.deepEqual(options,{cwd:plan.cwd,env:plan.environment,stdio:['pipe','pipe','pipe','pipe','pipe'],shell:false,detached:true});spawned=true;spawns.push([command,args,options]);return child;}
export function assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom(){throw Error('SYNTHETIC_UNSELECTED_TRANSACTION');}
export function originalWorkerFailedLaunchChild(){return null;}
export function cleanupOriginalWorkerLaunchFailure(){throw Error('SYNTHETIC_UNSELECTED_FAILED_LAUNCH');}
`);
 const producerFile=path.join(directory,'prospective-local-worker-inventory-producer.mjs'),url=pathToFileURL(shim).href;
 // Both producer import declarations and the fixed local-file presence check
 // select this exact seven-binding Synthetic namespace, never the real issuer.
 fs.writeFileSync(producerFile,'export {assertOriginalPeerMaintenanceExecutionCapacityFrom,assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom,claimOriginalPeerExecutionLaunchFrom,bindOriginalPeerExecutionLaunchCutoffFrom,spawnOriginalPeerExecutionLaunch,originalWorkerFailedLaunchChild,cleanupOriginalWorkerLaunchFailure} from '+JSON.stringify(url)+';\n');
 original=fs.readFileSync(file,'utf8');const replaced=new Map(['./protected-source-build-slot.mjs','./policy-supervisor.mjs','./ledger.mjs','./protected-connect-broker.mjs','./input-frontier-maintenance.mjs','./input-frontier-wire.mjs'].map(name=>[name,url]));
 replaced.set('./prospective-local-worker-inventory-producer.mjs',pathToFileURL(producerFile).href);
 replaced.set('./protected-codex-domain.mjs',centralAvailable?copyURL:url);
 const relocated=relocateSourceImports(original,file,'DOMAIN',replaced);fs.writeFileSync(copy,relocated);
 const domain=await import(pathToFileURL(copy).href);s=await import(url);const w=await import(wireURL),owner=Symbol('SYNTHETIC original frontier owner');s.install(owner);t.mock.timers.enable({apis:['setTimeout']});timersEnabled=true;
 const handle=await domain.prepareOriginalProtectedInputFrontierLaunch(owner,{compile:()=>s.compiledPlan},{cwd:'/SYNTHETIC-project',read_paths:[],state_root:'/SYNTHETIC-state',scratch_root:'/SYNTHETIC-scratch'},s.preflight);domain.bindOriginalProtectedInputFrontierAdmission(owner,handle,s.api,s.cap);
 const config={cwd:'/SYNTHETIC-project',environment:{},profile_id:':read-only',instruction_sources:null,base_instructions:'SYNTHETIC base',developer_instructions:'SYNTHETIC developer'};domain.bindOriginalProtectedCodexLaunch(owner,handle,config);facade=domain.spawnOriginalProtectedCodex(owner,handle);facade.stdout.resume();const errors=[];facade.on('error',e=>errors.push(e));facade.stdin.on('error',e=>errors.push(e));s.child.emit('spawn');
 const sha=v=>createHash('sha256').update(v).digest('hex'),protocol='soloco-protected-backend-permit-v2',challenge=s.child.controls[0],host='11111111-1111-4111-8111-111111111111';
 const send=frame=>new Promise((resolve,reject)=>facade.stdin.write(JSON.stringify(frame)+'\n',e=>e?reject(e):resolve())),server=frame=>s.child.stdout.write(JSON.stringify(frame)+'\n'),witness=frame=>s.child.stdio[3].write(JSON.stringify(frame)+'\n'),wrapped=f=>{const raw=JSON.stringify(f);witness({binding_sha256:sha(raw),observation:f});};
 await send({id:1,method:'initialize',params:{}});
 witness({protocol,kind:'host_bootstrap',nonce:challenge.nonce,pid:s.child.pid,slot_id:s.slot.slot_id,executable_sha256:s.slot.executable_sha256,source_manifest_sha256:s.slot.source_manifest_sha256,original_home_sha256:s.slot.native_context_contract.original_home_sha256,state_root:config.cwd.replace('project','state'),cwd:config.cwd,host_instance_id:host,sources:{config_layers:[],auth_owner_generation:0,auth_revision:0},loopback_proxy_port:43123});
 const selected=w.INPUT_FRONTIER_CONTEXT_SELECTION;wrapped({protocol,kind:'scoped_context_contract',nonce:challenge.nonce,pid:s.child.pid,slot_id:s.slot.slot_id,executable_sha256:s.slot.executable_sha256,source_manifest_sha256:s.slot.source_manifest_sha256,host_instance_id:host,scope_instance_id:'33333333-3333-4333-8333-333333333333',context_contract_protocol:selected.protocol,context_contract_id:selected.contract_id,context_contract_sha256:selected.resource_sha256,context_encoding:selected.context_encoding,scope_profile_id:selected.scope_profile_id,evidence_scope:'source-resource-and-whole-payload-source-cut-wire-compatibility-only'});await flush();server({id:1,result:{}});
 await send({id:2,method:'thread/start',params:{cwd:config.cwd,runtimeWorkspaceRoots:[config.cwd],permissions:':read-only',approvalPolicy:'never',baseInstructions:config.base_instructions,developerInstructions:config.developer_instructions,dynamicTools:w.inputFrontierReadonly3Tools(),ephemeral:false}});const expected={ledger:s.ledger,admission_ref:s.reference,context_sha256:SHA,kind:'input-frontier-produce'},tokens=()=>domain.originalProtectedOwnedTaskTokens(owner,handle);beforeCreation?.(s);server({id:2,result:{...threadResult(),cwd:config.cwd,runtimeWorkspaceRoots:[config.cwd]}});if(stopAt==='creation')return {domain,s,owner,handle,expected,tokens,errors};
 const creation=domain.assertOriginalProtectedInputFrontierCreation(tokens().creation,expected);assert.equal(creation.profile_id,'soloco-input-frontier-readonly-v1');assert.equal(creation.effective_permission_profile.id,':read-only');assert.equal(creation.turn_id,null);s.setNative(NATIVE);
 await send({id:3,method:'turn/start',params:{threadId:NATIVE,input:s.input}});server({id:3,result:{turn:{id:TURN,status:'inProgress'}}});
 const facts={protocol,kind:'final_request',nonce:challenge.nonce,pid:s.child.pid,sequence:1,source_commit:'c40729ea5cf8e947481b130c59807273eda2f8e9',producer_module_sha256:'d'.repeat(64),tool_resource_sha256:selected.resource_sha256,host_instance_id:host,runtime_generation:1,profile_generation:1,services_generation:1,instruction_generation:1,thread_id:NATIVE,turn_id:TURN,step_id:1,auth_owner_generation:0,auth_revision:0,auth_send_epoch:1,runtime_id:null,request_id:'00000000-0000-4000-8000-000000000001',gateway_instance_id:'22222222-2222-4222-8222-222222222222',method:'POST',url:'https://example.invalid/responses',request_sha256:sha('SYNTHETIC request'),request_bytes:100,context_sha256:SHA,input_text_sha256s:s.input.map(i=>sha(i.text)),ordered_instructions:[],ordered_instructions_sha256:sha('[]'),profile:{SYNTHETIC:true},tools:w.inputFrontierResponsesTools(),provenance:{original_sampling_input_sha256:SHA,sources:{SYNTHETIC:true},unknown_origins:[]}};beforeRequest?.(s);wrapped(facts);if(stopAt==='request')return {domain,s,owner,handle,expected,tokens,errors};
 witness({protocol,kind:'transport_headers',nonce:challenge.nonce,pid:s.child.pid,sequence:1,request_id:facts.request_id,gateway_instance_id:facts.gateway_instance_id,status:200});witness({protocol,kind:'local_body_eof',pid:s.child.pid,request_id:facts.request_id,sequence:1,remote_domain_closed:false});
 const terminalWitness=()=>witness({protocol,kind:'original_response_terminal_drained',nonce:challenge.nonce,pid:s.child.pid,host_instance_id:host,request_id:facts.request_id,request_sha256:facts.request_sha256,sequence:1,response_id:'SYNTHETIC-response',terminal_logical_payload_sha256:sha('SYNTHETIC Completed'),local_body_eof_observed:true,remote_domain_closed:false});
 const complete=()=>{server({method:'item/completed',params:{threadId:NATIVE,turnId:TURN,completedAtMs:0,item:{type:'agentMessage',phase:'final_answer',text:OUTPUT}}});server({method:'turn/completed',params:{threadId:NATIVE,turn:{id:TURN,status:'completed',error:null}}});};
 return {domain,s,owner,handle,expected,tokens,terminalWitness,complete,errors};
}
test('frontier actual domain conditionally mints distinct fresh creation and local-only drain with real private custody',async t=>{
 const f=await originalDomainFixture(t);assert.equal(f.tokens().drain,null);f.terminalWitness();f.complete();await f.s.child.close();const token=f.tokens().drain;assert.ok(token);const facts=f.domain.assertOriginalProtectedOwnedTaskDrain(token,f.expected);assert.equal(facts.kind,'input-frontier-produce');assert.equal(facts.admission_ref.family,'work_items');assert.equal(facts.output,OUTPUT);assert.equal(facts.group_absent,null);assert.equal(facts.remote_domain_closed,false);assert.equal(facts.whole_domain_qualified,false);assert.equal(facts.prior_unknown_slots_released,false);assert.deepEqual(f.errors,[]);assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDrain(token,{...f.expected,kind:'task'}));assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDrain(token,{...f.expected,admission_ref:{...f.expected.admission_ref,family:'commands'}}));const copied=f.domain.inspectOriginalProtectedOwnedTaskCreation(f.tokens().creation,f.expected);assert.throws(()=>f.domain.assertOriginalProtectedInputFrontierCreation(copied,f.expected));
});
test('frontier actual domain rechecks genuine inventory before granting drain and preserves a nonqualifying diagnostic',async t=>{
 const f=await originalDomainFixture(t);f.terminalWitness();f.complete();f.s.setCapacity(false);await f.s.child.close();assert.equal(f.tokens().drain,null);const token=f.tokens().diagnostic;assert.ok(token);const diagnostic=f.domain.assertOriginalProtectedOwnedTaskDiagnostic(token,f.expected);assert.equal(diagnostic.kind,'input-frontier-produce');assert.equal(diagnostic.qualifies,false);assert.equal(diagnostic.frontier_id,'SYNTHETIC-frontier');assert.equal(diagnostic.prior_unknown_slots_released,false);
});
test('frontier actual domain raw EOF without authenticated response terminal never yields drain',async t=>{
 const f=await originalDomainFixture(t);f.complete();await f.s.child.close();assert.equal(f.tokens().drain,null);assert.ok(f.tokens().diagnostic);
});

for(const [deadline,admissionMs,advance] of [['admission',60000,60001],['execution',300000,120001]]){
 test('frontier creation mint rejects '+deadline+' expiry advancing inside the final synchronous inventory provider',async t=>{
  let now=Date.now();const start=now;t.mock.method(Date,'now',()=>now);const f=await originalDomainFixture(t,{admissionMs,beforeCreation:s=>s.onceCapacityRead(()=>{now=start+advance;}),stopAt:'creation'});assert.equal(f.tokens().creation,null);assert.equal(f.tokens().drain,null);const diagnostic=f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected);assert.equal(diagnostic.error,'PROTECTED_CODEX_FRONTIER_DEADLINE');assert.equal(f.s.child.controls.filter(x=>x.kind==='send_permit').length,0);now=start;assert.equal(f.tokens().creation,null,'a backward clock cannot undo the latched Hold');
 });
 test('frontier creation assertion rejects '+deadline+' expiry advancing inside its final synchronous provider',async t=>{
  let now=Date.now();const start=now;t.mock.method(Date,'now',()=>now);const f=await originalDomainFixture(t,{admissionMs}),token=f.tokens().creation;assert.ok(token);f.s.onceCapacityRead(()=>{now=start+advance;});assert.throws(()=>f.domain.assertOriginalProtectedInputFrontierCreation(token,f.expected),{code:'PROTECTED_CODEX_FRONTIER_DEADLINE'});assert.equal(f.tokens().drain,null);
 });
 test('frontier drain mint rejects '+deadline+' expiry advancing inside the final synchronous inventory provider',async t=>{
  let now=Date.now();const start=now;t.mock.method(Date,'now',()=>now);const f=await originalDomainFixture(t,{admissionMs});f.terminalWitness();f.complete();f.s.onceCapacityRead(()=>{now=start+advance;});await f.s.child.close();assert.equal(f.tokens().drain,null);const value=f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected);assert.equal(value.error,'PROTECTED_CODEX_FRONTIER_DEADLINE');assert.equal(value.prior_unknown_slots_released,false);
 });
 test('frontier drain assertion rejects '+deadline+' expiry advancing inside the final synchronous inventory provider',async t=>{
  let now=Date.now();const start=now;t.mock.method(Date,'now',()=>now);const f=await originalDomainFixture(t,{admissionMs});f.terminalWitness();f.complete();await f.s.child.close();const token=f.tokens().drain;assert.ok(token);f.s.onceCapacityRead(()=>{now=start+advance;});assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDrain(token,f.expected),{code:'PROTECTED_CODEX_FRONTIER_DEADLINE'});
 });
 test('frontier final FD4 permit rejects '+deadline+' expiry advancing inside the final synchronous inventory provider',async t=>{
  let now=Date.now();const start=now;t.mock.method(Date,'now',()=>now);const f=await originalDomainFixture(t,{admissionMs,beforeRequest:s=>s.onceCapacityRead(()=>{now=start+advance;}),stopAt:'request'});assert.equal(f.s.child.controls.filter(x=>x.kind==='send_permit').length,0);assert.equal(f.tokens().drain,null);assert.equal(f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected).error,'PROTECTED_CODEX_FRONTIER_DEADLINE');
 });
}
test('frontier missing central original execution-launch ABI Holds before any child birth',async t=>{
 await assert.rejects(originalDomainFixture(t,{centralAvailable:false}),{code:'PROTECTED_CODEX_ORIGINAL_EXECUTION_LAUNCH_SOURCE_REQUIRED'});
});

const usage=()=>({totalTokens:10,inputTokens:7,cachedInputTokens:0,cacheWriteInputTokens:0,outputTokens:3,reasoningOutputTokens:2});
const usageNotification=()=>({threadId:NATIVE,turnId:TURN,tokenUsage:{total:usage(),last:usage(),modelContextWindow:32000}});
const rates=()=>({rateLimits:{limitId:'SYNTHETIC',limitName:null,normalModelSlug:null,primary:{usedPercent:10,windowDurationMins:5,resetsAt:123},secondary:null,credits:{hasCredits:true,unlimited:false,balance:null},individualLimit:null,spendControlReached:false,planType:'unknown',rateLimitReachedType:null}});
const notify=(f,method,params)=>f.s.child.message({method,params});
test('frontier pinned normal SDK order accepts typed status token usage reasoning and related metadata without granting authority',async t=>{
 const f=await fixture(t),result=f.start();await flush();f.s.child.message({id:'soloco-peer-1',result:{}});
 notify(f,'thread/status/changed',{threadId:NATIVE,status:{type:'idle'}});notify(f,'thread/readState/changed',{threadId:NATIVE,readState:{firstUnread:null,revision:'SYNTHETIC-revision'}});assert.equal(f.s.counts.creation,0);assert.equal(f.s.child.frames.some(x=>x.method==='turn/start'),false,'status alone cannot identify/create or start a turn');
 notify(f,'thread/started',{thread:{id:NATIVE}});f.s.child.message({id:'soloco-peer-2',result:threadResult()});
 notify(f,'thread/status/changed',{threadId:NATIVE,status:{type:'active',activeFlags:[]}});
 notify(f,'turn/started',{threadId:NATIVE,turn:{id:TURN,status:'inProgress'}});
 notify(f,'item/reasoning/summaryPartAdded',{threadId:NATIVE,turnId:TURN,itemId:'reason',summaryIndex:0});
 f.s.child.message({id:'soloco-peer-3',result:{turn:{id:TURN,status:'inProgress'}}});
 notify(f,'item/reasoning/summaryTextDelta',{threadId:NATIVE,turnId:TURN,itemId:'reason',summaryIndex:0,delta:'SYNTHETIC thought'});
 notify(f,'item/reasoning/textDelta',{threadId:NATIVE,turnId:TURN,itemId:'reason',contentIndex:0,delta:'SYNTHETIC thought'});
 notify(f,'item/agentMessage/delta',{threadId:NATIVE,turnId:TURN,itemId:'agent',delta:'partial'});
 notify(f,'item/plan/delta',{threadId:NATIVE,turnId:TURN,itemId:'plan',delta:'SYNTHETIC plan'});
 notify(f,'turn/plan/updated',{threadId:NATIVE,turnId:TURN,explanation:null,plan:[{step:'SYNTHETIC read',status:'inProgress'}]});
 notify(f,'thread/tokenUsage/updated',usageNotification());notify(f,'account/rateLimits/updated',rates());
 notify(f,'rawResponseItem/completed',{threadId:NATIVE,turnId:TURN,item:{type:'message',id:'raw',role:'assistant',content:[]}});
 notify(f,'rawResponse/completed',{threadId:NATIVE,turnId:TURN,responseId:'SYNTHETIC-response',usage:usage(),usageMetadata:{amount:null,metadata:null}});
 notify(f,'thread/name/updated',{threadId:NATIVE,threadName:'SYNTHETIC frontier'});assert.equal(f.s.submitted,null);assert.equal(f.s.counts.normal_eof,0,'raw response and usage/status metadata cannot complete an assignment');
 submit(f);notify(f,'serverRequest/resolved',{threadId:NATIVE,requestId:'soloco_context_header'});notify(f,'thread/status/changed',{threadId:NATIVE,status:{type:'idle'}});assert.equal(f.s.counts.normal_eof,0);terminal(f);const actual=await result;assert.equal(actual.error,null);assert.ok(actual.drain);assert.equal(actual.observational_notifications.qualifies,false);assert.equal(actual.observational_notifications.counts['thread/status/changed'],3);assert.equal(actual.observational_notifications.counts['item/reasoning/summaryPartAdded'],1);assert.equal(f.s.counts.creation,1);assert.equal(f.s.counts.normal_eof,1);
});
for(const [name,method,params,expected] of [
 ['foreign thread','thread/status/changed',{threadId:'00000000-0000-7000-8000-000000000099',status:{type:'idle'}},'FRONTIER_HOST_METADATA_BINDING'],
 ['foreign turn','thread/tokenUsage/updated',{...usageNotification(),turnId:'foreign'},'FRONTIER_HOST_METADATA_BINDING'],
 ['unknown status','thread/status/changed',{threadId:NATIVE,status:{type:'completed',accepted:true}},'FRONTIER_HOST_METADATA_SHAPE'],
 ['negative reasoning index','item/reasoning/textDelta',{threadId:NATIVE,turnId:TURN,itemId:'reason',contentIndex:-1,delta:'x'},'FRONTIER_HOST_METADATA_SHAPE'],
 ['extra status authority','thread/status/changed',{threadId:NATIVE,status:{type:'idle'},grantsAuthority:true},'FRONTIER_HOST_SHAPE'],
 ['unmatched resolved request','serverRequest/resolved',{threadId:NATIVE,requestId:'never-issued'},'FRONTIER_HOST_METADATA_REPLAY'],
 ['waiting permission status','thread/status/changed',{threadId:NATIVE,status:{type:'active',activeFlags:['waitingOnApproval']}},'FRONTIER_HOST_STATUS_HELD'],
 ['system error status','thread/status/changed',{threadId:NATIVE,status:{type:'systemError'}},'FRONTIER_HOST_STATUS_HELD'],
 ['foreign read-state turn','thread/readState/changed',{threadId:NATIVE,readState:{firstUnread:{type:'turn',turnId:'foreign'},revision:'SYNTHETIC-revision'}},'FRONTIER_HOST_METADATA_BINDING'],
 ['external raw item','rawResponseItem/completed',{threadId:NATIVE,turnId:TURN,item:{type:'web_search_call'}},'FRONTIER_HOST_EXTERNAL_ITEM_HELD'],
 ['unknown notification','thread/not-a-pinned-method',{threadId:NATIVE,turnId:TURN},'FRONTIER_HOST_NOTIFICATION'],
])test('frontier typed metadata rejects '+name+' without granting final or callback authority',async t=>{
 const f=await fixture(t),{result}=await running(f);notify(f,method,params);const actual=await result;assert.equal(actual.error,expected);assert.equal(actual.drain,null);assert.equal(f.s.submitted,null);
});
test('frontier repeated reasoning part metadata is rejected and cannot masquerade as a completed item',async t=>{
 const f=await fixture(t),{result}=await running(f),part={threadId:NATIVE,turnId:TURN,itemId:'reason',summaryIndex:0};notify(f,'item/reasoning/summaryPartAdded',part);notify(f,'item/reasoning/summaryPartAdded',part);const actual=await result;assert.equal(actual.error,'FRONTIER_HOST_METADATA_REPLAY');assert.equal(actual.drain,null);
});
