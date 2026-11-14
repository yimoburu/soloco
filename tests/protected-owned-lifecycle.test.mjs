import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';

const MODULE=fileURLToPath(new URL('../plugins/soloco/runtime/peers/protected-codex-domain.mjs',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const PROTOCOL='soloco-protected-backend-permit-v2';
const HASH='1'.repeat(64),OUTPUT='SYNTHETIC bounded output: café 🧭';
const held=error=>typeof error?.code==='string'&&error.code.startsWith('PROTECTED_');

// SOURCE mechanics only. There is no native child, provider, socket, company,
// source-qualified executable or authentication here. Only predecessor imports
// are replaced in a test-owned copy; the original custody/FD3/lifecycle body,
// strict wire parser, token WeakMap and capability getters remain exact.
class SyntheticChild extends EventEmitter {
  constructor(){
    super();this.pid=424242;this.exitCode=null;this.signalCode=null;this.exited=false;this.signals=[];this.control=[];
    this.stdin=new PassThrough();this.stdout=new PassThrough();this.stderr=new PassThrough();
    this.stdio=[this.stdin,this.stdout,this.stderr,new PassThrough(),new PassThrough()];
    this.stdin.resume();let pending='';
    this.stdio[4].on('data',bytes=>{pending+=bytes.toString();for(;;){const end=pending.indexOf('\n');if(end<0)break;this.control.push(JSON.parse(pending.slice(0,end)));pending=pending.slice(end+1);}});
  }
  kill(signal){assert.equal(this.exited,false,'only retained living child may be signalled');this.signals.push(signal);return true;}
  exit(code=0,signal=null){this.exited=true;this.exitCode=code;this.signalCode=signal;this.emit('exit',code,signal);}
  async close({exit=true,missing=null,code=0,signal=null}={}){
    if(exit&&!this.exited)this.exit(code,signal);
    for(const [name,stream] of [['stdout',this.stdout],['stderr',this.stderr],['witness',this.stdio[3]]])if(name!==missing&&!stream.writableEnded)stream.end();
    for(const [name,stream] of [['stdin',this.stdin],['control',this.stdio[4]]])if(name!==missing&&!stream.destroyed)stream.destroy();
    await flush();this.emit('close',code,signal);await flush();
  }
}

function denyExternal(){
  const restores=[],calls=[];
  const replace=(object,key)=>{const previous=object[key];object[key]=(...args)=>{calls.push(key);throw Error('External operation denied: '+key);};restores.push(()=>{object[key]=previous;});};
  for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(childProcess,name);
  replace(childProcess.ChildProcess.prototype,'spawn');replace(net.Socket.prototype,'connect');replace(net.Server.prototype,'listen');
  for(const [object,names] of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dgram,['createSocket']]])for(const name of names)replace(object,name);
  for(const name of ['bind','connect','send'])replace(dgram.Socket.prototype,name);
  replace(process,'kill');replace(globalThis,'fetch');syncBuiltinESMExports();
  return {calls,restore(){for(const restore of restores.reverse())restore();syncBuiltinESMExports();}};
}

async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-owned-source-test-'));
  const external=denyExternal();let child,facade,original,timers=false;
  t.after(async()=>{
    try{
      if(child){if(!child.exited)child.exit();await child.close();for(const stream of child.stdio)stream.destroy();}
      facade?.stdin?.destroy();facade?.stdout?.destroy();
      assert.deepEqual(external.calls,[],'all process/network/provider access is denied before dynamic imports');
      if(original!==undefined)assert.equal(fs.readFileSync(MODULE,'utf8'),original,'production source stays unchanged');
    }finally{if(timers)t.mock.timers.reset();external.restore();fs.rmSync(directory,{recursive:true,force:true});}
  });
  original=fs.readFileSync(MODULE,'utf8');
  const shimFile=path.join(directory,'fictional-predecessors.mjs');
  fs.writeFileSync(shimFile,`// TEST-ONLY fixed fictional predecessor DATA; no original proof issuer.
import {createHash} from 'node:crypto';
export const canonical=value=>JSON.stringify((function visit(v){return v&&typeof v==='object'?Array.isArray(v)?v.map(visit):Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k])])):v;})(value));
export const ORIGINAL_CONTEXT_SELECTION=Object.freeze({synthetic:true});
export const compiledPlan=Object.freeze({SYNTHETIC_OWNED_LIFECYCLE_ONLY:true});
export const spawnCalls=[];
let owner,child,claimed=false,brokerMode='closed',settleBroker;
const interpreter=Object.freeze({SYNTHETIC_UNUSED_INTERPRETER:true});
export const slot=Object.freeze({slot_id:'SYNTHETIC-owned-lifecycle-only',scope_policy:'V5_ORIGINAL_MANAGED_PRIVATE_FD',executable_sha256:'a'.repeat(64),source_manifest_sha256:'b'.repeat(64),native_context_contract:{original_home_sha256:'c'.repeat(64),upstream_url:'https://example.invalid/responses',final_request_contract:{mode:'original-live-scoped-source',producer_module_sha256:'d'.repeat(64),tool_resource_sha256:'e'.repeat(64)}}});
const plan={launch_mode:'companion-v2',companion_slot:slot,executable_pin:{sha256:'a'.repeat(64)},sandbox_executable:'/SYNTHETIC/sandbox',executable:'/SYNTHETIC/companion',argv:['--source-only'],sbpl:'SYNTHETIC inert policy',cwd:'/SYNTHETIC-project',state_root:'/SYNTHETIC-state',scratch_root:'/SYNTHETIC-scratch',gateway_port:43123,policy_sha256:'f'.repeat(64),environment:{}};
const check=(actual,handle)=>{if(actual!==owner||handle!==compiledPlan)throw Error('wrong fictional predecessor');};
export function install(actual,process){owner=actual;child=process;}
export function inspectOriginalCompiledCodexPlan(actual,handle){check(actual,handle);return {...plan,consumed:claimed};}
export function claimOriginalCompiledCodexPlan(actual,handle){check(actual,handle);if(claimed)throw Error('fictional plan replay');claimed=true;return {...plan,consumed:true};}
// The delivery interpreter is outside this conditional lifecycle fixture. The
// actual domain's strict FD3 parser is still imported and exercised unchanged.
export function originalCompiledPeerContextInterpreter(actual,handle){check(actual,handle);return null;}
export function originalCompanionSlotMatches(value){return value===slot;}
export function resolveOriginalPeerContextInterpreter(){return interpreter;}
export function assertOriginalPeerContextInterpreterFinal(value){if(value!==interpreter)throw Error('wrong fictional interpreter');}
export function assertOriginalPeerContextSlot(){throw Error('unused fictional interpreter slot');}
export function inspectOriginalPeerContextInterpreter(){throw Error('unused fictional interpreter inspection');}
// Bootstrap is outside this ordinary-task predecessor fixture. New imports
// must remain explicit and denying, while every existing positive oracle runs.
export function isOriginalBootstrapMembershipInterpreter(){return false;}
export function originalBootstrapCompanionSlotMatches(){return false;}
const unusedBootstrap=()=>{throw Error('unused fictional bootstrap predecessor');};
export {unusedBootstrap as assertOriginalBootstrapMembershipInterpreterFinal,unusedBootstrap as inspectOriginalBootstrapMembershipInterpreter,unusedBootstrap as assertOriginalBootstrapMembershipSlot,unusedBootstrap as inspectOriginalCompiledBootstrapScope};
export function spawn(...args){spawnCalls.push(args);return child;}
export function setBrokerMode(value){brokerMode=value;}
export async function createFixedConnectBroker(){
 const closed=new Promise(resolve=>{settleBroker=resolve;});
 const closure=()=>({phase:brokerMode==='closed'?'CLOSED':'UNKNOWN',local_tcp_closure:brokerMode==='closed'?'OBSERVED':'UNKNOWN',remote_domain_closed:false});
 return Object.freeze({port:43123,closed,inspect:()=>({phase:'LISTENING',remote_domain_closed:false}),async close(){if(brokerMode!=='pending')settleBroker(closure());}});
}
export function settle(){settleBroker({phase:'CLOSED',local_tcp_closure:'OBSERVED',remote_domain_closed:false});}
export class PeerLedger {
 constructor(label='one'){
  this.root='/SYNTHETIC/'+label;this.directory=this.root+'/ledger';this.company_id='SYNTHETIC-'+label;
  this.context={protocol:'peer-task-context-v2',sha256:'1'.repeat(64),grant:{value:{expires_at:new Date(Date.now()+3600000).toISOString()}}};
  const principal={id:'fictional-cos',value:{status:'active',membership_qualification:{synthetic:true},native_id:'fictional-thread',generation:7,enrollment_id:'fictional-enrollment'}};
  const task={id:'fictional-task',value:{status:'running',scope:'fictional-scope',owner_principal_id:principal.id,attempt:{id:'fictional-attempt',effect_id:'fictional-effect',request_sha256:'2'.repeat(64),context:this.context}}};
  const effect={id:'fictional-effect',created_seq:10,value:{kind:'native',task_id:task.id,request_sha256:'2'.repeat(64),status:'reserved'}};
  this.rows=new Map([['tasks:'+task.id,task],['principals:'+principal.id,principal],['slots:'+task.id,{id:task.id,value:{status:'active',attempt_id:task.value.attempt.id}}],['effects:'+effect.id,effect]]);
  this.command={id:'fictional-admit-command',revision:1,sha256:'3'.repeat(64),value:{action:'task/admit',principal_id:'scheduler',result:{admitted:true,task:structuredClone(task),context:structuredClone(this.context)}}};
  // Original version and current HEAD are independent objects. A changed HEAD
  // must not rewrite the historical scheduler receipt returned by getVersion.
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  this.originalCommand=freeze(structuredClone(this.command));this.rows.set('commands:'+this.command.id,this.command);
  this.event={type:'task/admit',principal_id:'scheduler',payload:{changes:[{family:'commands',id:this.command.id,revision:1,sha256:this.command.sha256}]}};
 }
 read(fn){return fn({get:(family,id)=>this.rows.get(family+':'+id)??null,getVersion:ref=>ref.family==='commands'&&ref.id===this.originalCommand.id&&ref.revision===1&&ref.sha256===this.originalCommand.sha256?this.originalCommand:null,events:()=>({items:[this.event]})});}
 snapshot(){return canonical({rows:[...this.rows],originalCommand:this.originalCommand,event:this.event});}
}
export function validateContext(tx,context){return tx.get('tasks','fictional-task')?.value.attempt.context.sha256===context.sha256&&tx.get('tasks','fictional-task')?.value.attempt.context.protocol===context.protocol;}
`);
  const shimURL=pathToFileURL(shimFile).href;
  const replacements=new Set(['node:child_process','./protected-source-build-slot.mjs','./policy-supervisor.mjs','./ledger.mjs','./model.mjs','./protected-connect-broker.mjs']);
  let count=0;
  const relocated=original.split('\n').map(line=>{
    const match=line.match(/^(import .* from )'([^']+)';$/);if(!match)return line;
    const [,prefix,specifier]=match;
    if(replacements.has(specifier)){count++;return prefix+JSON.stringify(shimURL)+';';}
    return specifier.startsWith('./')?prefix+JSON.stringify(new URL(specifier,pathToFileURL(MODULE)).href)+';':line;
  }).join('\n');
  assert.equal(count,9,'only fixed spawn/slot/supervisor/ledger/model/broker predecessor imports change, including the explicit denying bootstrap slot/scope imports');
  const body=value=>value.split('\n').filter(line=>!line.startsWith('import ')).join('\n');
  assert.equal(body(relocated),body(original),'custody, private tokens, parser dispatch and lifecycle body remain byte-identical');
  const copy=path.join(directory,'domain.mjs');fs.writeFileSync(copy,relocated);
  const domain=await import(pathToFileURL(copy).href),shim=await import(shimURL);
  const {stableTaskHostTools}=await import(new URL('../plugins/soloco/runtime/peers/host-protocol.mjs',import.meta.url));
  const {expectedResponsesTools}=await import(new URL('../plugins/soloco/runtime/peers/responses-gateway.mjs',import.meta.url));
  child=new SyntheticChild();const owner=Symbol('SYNTHETIC original owner');shim.install(owner,child);
  let clock=Date.now();t.mock.method(Date,'now',()=>clock);
  const ledger=new shim.PeerLedger(),context=structuredClone(ledger.context);
  const expected={ledger,admission_ref:{family:'commands',id:ledger.command.id,revision:1,sha256:ledger.command.sha256},context_sha256:context.sha256,kind:'task'};
  t.mock.timers.enable({apis:['setTimeout']});timers=true;
  const supervisor={compile(actual,input){assert.equal(actual,owner);assert.equal(input.gateway_port,43123);return shim.compiledPlan;}};
  const handle=await domain.prepareOriginalProtectedPeerLaunch(owner,supervisor,{cwd:'/SYNTHETIC-project',read_paths:[],state_root:'/SYNTHETIC-state',scratch_root:'/SYNTHETIC-scratch'});
  domain.bindOriginalProtectedTaskAdmission(owner,handle,ledger,'fictional-task',context);
  const launch={cwd:'/SYNTHETIC-project',profile_id:'SYNTHETIC-profile',instruction_sources:[],base_instructions:'SYNTHETIC base',developer_instructions:'SYNTHETIC developer',environment:{}};
  domain.bindOriginalProtectedCodexLaunch(owner,handle,launch);
  facade=domain.spawnOriginalProtectedCodex(owner,handle);facade.stdout.resume();const errors=[];facade.on('error',error=>errors.push(error));facade.stdin.on('error',error=>errors.push(error));
  child.emit('spawn');assert.equal(shim.spawnCalls.length,1);assert.deepEqual(shim.spawnCalls[0][2].stdio,['pipe','pipe','pipe','pipe','pipe']);
  const challenge=child.control.find(frame=>frame.kind==='challenge');assert(challenge,'challenge is captured only from original FD4');
  const wire=frame=>child.stdio[3].write(JSON.stringify(frame)+'\n');
  const server=frame=>child.stdout.write(JSON.stringify(frame)+'\n');
  const send=frame=>new Promise((resolve,reject)=>facade.stdin.write(JSON.stringify(frame)+'\n',error=>error?reject(error):resolve()));
  wire({protocol:PROTOCOL,kind:'host_bootstrap',nonce:challenge.nonce,pid:child.pid,slot_id:shim.slot.slot_id,executable_sha256:shim.slot.executable_sha256,source_manifest_sha256:shim.slot.source_manifest_sha256,original_home_sha256:shim.slot.native_context_contract.original_home_sha256,state_root:'/SYNTHETIC-state',cwd:'/SYNTHETIC-project',host_instance_id:'11111111-1111-4111-8111-111111111111',sources:{config_layers:[],auth_owner_generation:0,auth_revision:0},loopback_proxy_port:43123});
  await send({id:1,method:'initialize',params:{}});server({id:1,result:{}});
  await send({id:2,method:'thread/start',params:{cwd:launch.cwd,runtimeWorkspaceRoots:[launch.cwd],permissions:launch.profile_id,approvalPolicy:'never',baseInstructions:launch.base_instructions,developerInstructions:launch.developer_instructions,dynamicTools:stableTaskHostTools(),ephemeral:false}});server({id:2,result:{thread:{id:'fictional-thread'}}});
  const input=[{type:'text',text:'SYNTHETIC exact admitted context'}];
  await send({id:3,method:'turn/start',params:{threadId:'fictional-thread',input}});server({id:3,result:{turn:{id:'fictional-turn'}}});
  const request=(sequence=1)=>{
    const request_id='00000000-0000-4000-8000-'+String(sequence).padStart(12,'0');
    const facts={protocol:PROTOCOL,kind:'final_request',nonce:challenge.nonce,pid:child.pid,sequence,source_commit:'c40729ea5cf8e947481b130c59807273eda2f8e9',producer_module_sha256:'d'.repeat(64),tool_resource_sha256:'e'.repeat(64),host_instance_id:'11111111-1111-4111-8111-111111111111',runtime_generation:1,profile_generation:1,services_generation:1,instruction_generation:1,thread_id:'fictional-thread',turn_id:'fictional-turn',step_id:sequence,auth_owner_generation:0,auth_revision:0,auth_send_epoch:sequence,runtime_id:null,request_id,gateway_instance_id:'22222222-2222-4222-8222-222222222222',method:'POST',url:'https://example.invalid/responses',request_sha256:sha('SYNTHETIC request '+sequence),request_bytes:100,context_sha256:HASH,input_text_sha256s:input.map(item=>sha(item.text)),ordered_instructions:[],ordered_instructions_sha256:sha('[]'),profile:{SYNTHETIC:true},tools:expectedResponsesTools(),provenance:{original_sampling_input_sha256:HASH,sources:{SYNTHETIC:true},unknown_origins:[]}};
    const raw=JSON.stringify(facts);wire({binding_sha256:sha(raw),observation:facts});
    return facts;
  };
  const headers=(facts,status=200)=>wire({protocol:PROTOCOL,kind:'transport_headers',nonce:challenge.nonce,pid:child.pid,sequence:facts.sequence,request_id:facts.request_id,gateway_instance_id:facts.gateway_instance_id,status});
  const eof=facts=>wire({protocol:PROTOCOL,kind:'local_body_eof',request_id:facts.request_id,sequence:facts.sequence,pid:child.pid,remote_domain_closed:false});
  const witness=(facts,change={})=>wire({protocol:PROTOCOL,kind:'original_response_terminal_drained',nonce:challenge.nonce,pid:child.pid,host_instance_id:facts.host_instance_id,request_id:facts.request_id,request_sha256:facts.request_sha256,sequence:facts.sequence,response_id:'SYNTHETIC-response-'+facts.sequence,terminal_logical_payload_sha256:sha('SYNTHETIC Completed '+facts.sequence),local_body_eof_observed:true,remote_domain_closed:false,...change});
  const completed=(status='completed')=>{server({method:'item/completed',params:{threadId:'fictional-thread',turnId:'fictional-turn',item:{type:'agentMessage',phase:'final_answer',text:OUTPUT}}});server({method:'turn/completed',params:{threadId:'fictional-thread',turn:{id:'fictional-turn',status,error:null}}});};
  const tokens=()=>domain.originalProtectedOwnedTaskTokens(owner,handle);
  return {domain,shim,owner,handle,facade,child,ledger,context,expected,errors,wire,server,send,request,headers,eof,witness,completed,tokens,executionDeadline:clock+120000,setClock(value){clock=value;}};
}

function globalsRemainUnknown(f){
  const value=f.domain.inspectOriginalProtectedCodexLaunch(f.owner,f.handle);
  assert.equal(value.original_group_absent,null);assert.equal(value.local_domain_closed,false);assert.equal(value.whole_domain_qualified,false);
  assert.equal(value.native_final_observation_qualified,false);
  assert.throws(()=>f.domain.assertOriginalProtectedCodexBoundary(f.owner,f.handle,'physical_close'),held);
}
function diagnostic(f){
  const caps=f.tokens();assert.equal(caps.drain,null);assert(caps.diagnostic);
  const value=f.domain.assertOriginalProtectedOwnedTaskDiagnostic(caps.diagnostic,f.expected);
  assert.equal(value.qualifies,false);assert.equal(value.group_absent,null);assert.equal(value.remote_domain_closed,false);assert.equal(value.prior_unknown_slots_released,false);
  const {observation_sha256,...body}=value;assert.equal(observation_sha256,sha(f.shim.canonical(body)));
  globalsRemainUnknown(f);return {caps,value};
}
async function successful(f){const facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();await f.child.close();return facts;}

// DISTINCT CONDITIONAL fixture for the new work_items bootstrap branch. The
// cap, existing-capacity reader, interpreter, preflight and compiler below are
// explicitly SYNTHETIC predecessors, not issuers of genuine Native/company
// acceptance. The production domain body, actual fixed codec/catalogue and FD
// parser, original stream custody and all private token maps remain unchanged.
async function bootstrapFixture(t){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-bootstrap-owned-source-test-'))),external=denyExternal();let child,facade,original,timers=false;
  t.after(async()=>{try{if(child){if(!child.exited)child.exit();await child.close();for(const stream of child.stdio)stream.destroy();}facade?.stdin?.destroy();facade?.stdout?.destroy();assert.deepEqual(external.calls,[]);if(original!==undefined)assert.equal(fs.readFileSync(MODULE,'utf8'),original);}finally{if(timers)t.mock.timers.reset();external.restore();fs.rmSync(directory,{recursive:true,force:true});}});
  original=fs.readFileSync(MODULE,'utf8');
  const {formatBootstrapMembershipFirstRpcGeometry}=await import(new URL('../plugins/soloco/runtime/peers/bootstrap-membership-preflight.mjs',import.meta.url));
  const {bootstrapReadonly3Tools,BOOTSTRAP_CONTEXT_SELECTION}=await import(new URL('../plugins/soloco/runtime/peers/bootstrap-membership-delivery-frame.mjs',import.meta.url));
  const sourceCut=JSON.stringify({protocol:'peer-bootstrap-membership-context-v1',control:{value:{policy:{max_context_bytes:65536}}},current_meaning:{protocol:'peer-checked-input-current-meaning-v1',SYNTHETIC_conditional_meaning_only:true}});
  const assignment='{"protocol":"peer-bootstrap-membership-assignment-v1","source_cut":'+sourceCut+',"source_cut_sha256":"'+sha(sourceCut)+'","SYNTHETIC_nonqualifying_context":true}';
  const geometry=formatBootstrapMembershipFirstRpcGeometry(assignment),shimFile=path.join(directory,'fictional-bootstrap-predecessors.mjs');
  fs.writeFileSync(shimFile,`// TEST-ONLY cap/capacity/interpreter/preflight/compiler/Native predecessors.
// No actual admission, spend, private Native issuer or accepted meaning exists.
export const canonical=value=>JSON.stringify((function visit(v){return v&&typeof v==='object'?Array.isArray(v)?v.map(visit):Object.fromEntries(Object.keys(v).sort().map(k=>[k,visit(v[k])])):v;})(value));
const copy=value=>JSON.parse(canonical(value));
const fail=code=>{throw Object.assign(Error(code),{code});};
export const ORIGINAL_CONTEXT_SELECTION=Object.freeze({SYNTHETIC_unused_ordinary_selection:true});
export const compiledPlan=Object.freeze({SYNTHETIC_bootstrap_compiler_predecessor:true}),claim=Object.freeze({SYNTHETIC_existing_bootstrap_cap_claim:true}),preflight=Object.freeze({SYNTHETIC_original_preflight_predecessor:true});
const interpreter=Object.freeze({SYNTHETIC_private_bootstrap_interpreter:true});
export const spawnCalls=[],checks={capacity:0},ledgerUnits={existing_admissions:1,model_calls:1,new_admissions:0,new_charges:0,released:0};
let owner,child,consumed=false,native=null,capacity=true,brokerMode='closed',settleBroker,afterScope=null,afterAssertion=null;
export class PeerLedger {constructor(label='bootstrap'){this.root='/SYNTHETIC/'+label;this.directory=this.root+'/.company';this.company_id='SYNTHETIC-'+label;}snapshot(){return canonical({connection:{root:this.root,directory:this.directory,company_id:this.company_id},units:ledgerUnits});}}
export const ledger=new PeerLedger(),admission_ref=Object.freeze({family:'work_items',id:'membership-admission:SYNTHETIC-existing-attempt',revision:1,sha256:'3'.repeat(64)}),deadline_at_ms=Date.now()+3600000,execution_deadline_ms=Date.now()+120000;
const invariant={protocol:'peer-bootstrap-membership-admission-v1',kind:'peer-bootstrap-membership-reconstruction',admission_ref,context_sha256:${JSON.stringify(sha(assignment))},deadline_at_ms};
const input=${JSON.stringify(geometry.input)},frame_sha256=${JSON.stringify(geometry.frame.sha256)},recipe_sha256='4'.repeat(64);
export const slot=Object.freeze({slot_id:'SYNTHETIC-bootstrap-owned-only',scope_policy:'V5_ORIGINAL_MANAGED_PRIVATE_FD',executable_sha256:'a'.repeat(64),source_manifest_sha256:'b'.repeat(64),native_context_contract:{original_home_sha256:'c'.repeat(64),upstream_url:'https://example.invalid/responses',final_request_contract:{mode:'original-live-scoped-source',producer_module_sha256:'d'.repeat(64),tool_resource_sha256:${JSON.stringify(BOOTSTRAP_CONTEXT_SELECTION.resource_sha256)}}}});
const plan={launch_mode:'companion-v2',companion_slot:slot,executable_pin:{sha256:'a'.repeat(64)},sandbox_executable:'/SYNTHETIC/sandbox',executable:'/SYNTHETIC/companion',argv:['--source-only'],sbpl:'SYNTHETIC inert bootstrap policy',cwd:'/SYNTHETIC-bootstrap-project',state_root:'/SYNTHETIC-bootstrap-state',scratch_root:'/SYNTHETIC-bootstrap-scratch',gateway_port:43123,policy_sha256:'f'.repeat(64),scope_root:'/SYNTHETIC-bootstrap-scope',environment:{}};
const check=(actual,handle)=>{if(actual!==owner||handle!==compiledPlan)fail('SYNTHETIC_COMPILER_PREDECESSOR_CHANGED');};
const cap=(handle,actual)=>{if(handle!==claim||actual!==owner)fail('SYNTHETIC_CAP_PREDECESSOR_CHANGED');};
export function install(actual,process){owner=actual;child=process;}
export function inspectOriginalCompiledCodexPlan(actual,handle){check(actual,handle);return {...plan,consumed};}
export function claimOriginalCompiledCodexPlan(actual,handle){check(actual,handle);if(consumed)fail('SYNTHETIC_COMPILER_REPLAY');consumed=true;return {...plan,consumed};}
export function originalCompiledPeerContextInterpreter(actual,handle){check(actual,handle);return interpreter;}
export function inspectOriginalCompiledBootstrapScope(actual,handle){check(actual,handle);const value=copy({scope_root:plan.scope_root,state_root:plan.state_root,scratch_root:plan.scratch_root,launch:plan,directory_pins:{SYNTHETIC_conditional_compiler_pins:true},read_paths:[]}),advance=afterScope;afterScope=null;advance?.();return value;}
export function isOriginalBootstrapMembershipInterpreter(value){return value===interpreter;}
export function assertOriginalBootstrapMembershipInterpreterFinal(value){if(value!==interpreter)fail('SYNTHETIC_INTERPRETER_PREDECESSOR_CHANGED');}
export function inspectOriginalBootstrapMembershipInterpreter(value){assertOriginalBootstrapMembershipInterpreterFinal(value);return {recipe_sha256};}
export function assertOriginalBootstrapMembershipSlot(value,actual){assertOriginalBootstrapMembershipInterpreterFinal(value);if(actual!==slot&&canonical(actual)!==canonical(slot))fail('SYNTHETIC_SLOT_PREDECESSOR_CHANGED');}
export function originalBootstrapCompanionSlotMatches(value){return canonical(value)===canonical(slot);}
export function assertOriginalPeerBootstrapMembershipRunner(handle,actual,stage='current'){cap(handle,actual);checks.capacity++;if(!capacity)fail('SYNTHETIC_EXISTING_CAPACITY_HELD');if(Date.now()>=deadline_at_ms)fail('SYNTHETIC_CAP_EXPIRED');if(stage==='reserved'&&native!==null)fail('SYNTHETIC_CAP_ALREADY_BOUND');const value={...copy(invariant),native_id:native},advance=afterAssertion;afterAssertion=null;advance?.();return value;}
export function originalPeerBootstrapMembershipRunnerLedger(handle,actual){cap(handle,actual);return ledger;}
export function originalPeerBootstrapMembershipRunnerPreflight(handle,actual){cap(handle,actual);return preflight;}
export function originalPeerBootstrapMembershipRunnerDeadline(handle,actual){cap(handle,actual);return execution_deadline_ms;}
export function originalBootstrapMembershipPreflightInterpreter(value){if(value!==preflight)fail('SYNTHETIC_PREFLIGHT_PREDECESSOR_CHANGED');return interpreter;}
export function originalBootstrapMembershipPreflightInput(value){if(value!==preflight)fail('SYNTHETIC_PREFLIGHT_PREDECESSOR_CHANGED');return copy(input);}
export function assertOriginalBootstrapMembershipPreflightInput(value,actual){if(value!==preflight||canonical(actual)!==canonical(input))fail('SYNTHETIC_PREFLIGHT_INPUT_CHANGED');}
export function inspectOriginalBootstrapMembershipPreflight(value){if(value!==preflight)fail('SYNTHETIC_PREFLIGHT_PREDECESSOR_CHANGED');return {frame_sha256};}
export function bindSyntheticNative(value){if(native!==null)fail('SYNTHETIC_CAP_ALREADY_BOUND');native=value;}
export function setCapacity(value){capacity=value;}
export function setAfterScope(value){afterScope=value;}
export function setAfterAssertion(value){afterAssertion=value;}
const unused=()=>{throw Error('ordinary interpreter predecessor is outside the conditional bootstrap fixture');};
export {unused as resolveOriginalPeerContextInterpreter,unused as assertOriginalPeerContextInterpreterFinal,unused as assertOriginalPeerContextSlot,unused as inspectOriginalPeerContextInterpreter};
export function originalCompanionSlotMatches(){return false;}
export function spawn(...args){spawnCalls.push(args);return child;}
export function setBrokerMode(value){brokerMode=value;}
export async function createFixedConnectBroker(){const closed=new Promise(resolve=>{settleBroker=resolve;});return Object.freeze({port:43123,closed,inspect:()=>({phase:'LISTENING',remote_domain_closed:false}),async close(){if(brokerMode!=='pending')settleBroker({phase:brokerMode==='closed'?'CLOSED':'UNKNOWN',local_tcp_closure:brokerMode==='closed'?'OBSERVED':'UNKNOWN',remote_domain_closed:false});}});}
export function settle(){settleBroker({phase:'CLOSED',local_tcp_closure:'OBSERVED',remote_domain_closed:false});}
`);
  const shimURL=pathToFileURL(shimFile).href,replacements=new Set(['node:child_process','./protected-source-build-slot.mjs','./policy-supervisor.mjs','./ledger.mjs','./model.mjs','./protected-connect-broker.mjs','./bootstrap-membership.mjs','./bootstrap-membership-preflight.mjs']);let count=0;
  const relocated=original.split('\n').map(line=>{const match=line.match(/^(import .* from )'([^']+)';$/);if(!match)return line;const [,prefix,specifier]=match;if(replacements.has(specifier)){count++;return prefix+JSON.stringify(shimURL)+';';}return specifier.startsWith('./')?prefix+JSON.stringify(new URL(specifier,pathToFileURL(MODULE)).href)+';':line;}).join('\n');
  assert.equal(count,11,'only fixed explicitly synthetic bootstrap predecessor imports change');const body=value=>value.split('\n').filter(line=>!line.startsWith('import ')).join('\n');assert.equal(body(relocated),body(original),'actual bootstrap domain body and token/closure logic remain exact');
  const file=path.join(directory,'bootstrap-domain.mjs');fs.writeFileSync(file,relocated);const domain=await import(pathToFileURL(file).href),shim=await import(shimURL);
  child=new SyntheticChild();const owner=Symbol('SYNTHETIC conditional bootstrap owner');shim.install(owner,child);let clock=Date.now();t.mock.method(Date,'now',()=>clock);t.mock.timers.enable({apis:['setTimeout']});timers=true;
  const supervisor={compile(actual,request,privateBinding){assert.equal(actual,owner);assert.equal(request.gateway_port,43123);assert.equal(shim.isOriginalBootstrapMembershipInterpreter(privateBinding.context_interpreter),true);return shim.compiledPlan;}};
  const scope={cwd:'/SYNTHETIC-bootstrap-project',read_paths:[],state_root:'/SYNTHETIC-bootstrap-state',scratch_root:'/SYNTHETIC-bootstrap-scratch'},handle=await domain.prepareOriginalProtectedBootstrapLaunch(owner,supervisor,shim.claim,scope);
  const launch={cwd:scope.cwd,profile_id:':read-only',instruction_sources:[],base_instructions:'SYNTHETIC bootstrap base',developer_instructions:'SYNTHETIC bootstrap developer',environment:{}};domain.bindOriginalProtectedCodexLaunch(owner,handle,launch);
  facade=domain.spawnOriginalProtectedCodex(owner,handle);facade.stdout.resume();const errors=[];facade.on('error',error=>errors.push(error));facade.stdin.on('error',error=>errors.push(error));child.emit('spawn');
  assert.equal(shim.spawnCalls.length,1);const challenge=child.control.find(frame=>frame.kind==='challenge');assert(challenge);assert.deepEqual(challenge.context_contract,BOOTSTRAP_CONTEXT_SELECTION);
  const wire=frame=>child.stdio[3].write(JSON.stringify(frame)+'\n'),server=frame=>child.stdout.write(JSON.stringify(frame)+'\n'),send=frame=>new Promise((resolve,reject)=>facade.stdin.write(JSON.stringify(frame)+'\n',error=>error?reject(error):resolve()));
  await send({id:'soloco-peer-1',method:'initialize',params:{}});
  const host='11111111-1111-4111-8111-111111111111',native='33333333-3333-7333-8333-333333333333',session='44444444-4444-7444-8444-444444444444',turn='SYNTHETIC-bootstrap-turn';
  wire({protocol:PROTOCOL,kind:'host_bootstrap',nonce:challenge.nonce,pid:child.pid,slot_id:shim.slot.slot_id,executable_sha256:shim.slot.executable_sha256,source_manifest_sha256:shim.slot.source_manifest_sha256,original_home_sha256:shim.slot.native_context_contract.original_home_sha256,state_root:scope.state_root,cwd:scope.cwd,host_instance_id:host,sources:{config_layers:[],auth_owner_generation:0,auth_revision:0},loopback_proxy_port:43123});
  const observation={protocol:PROTOCOL,kind:'scoped_context_contract',nonce:challenge.nonce,pid:child.pid,slot_id:shim.slot.slot_id,executable_sha256:shim.slot.executable_sha256,source_manifest_sha256:shim.slot.source_manifest_sha256,host_instance_id:host,scope_instance_id:'55555555-5555-4555-8555-555555555555',context_contract_protocol:BOOTSTRAP_CONTEXT_SELECTION.protocol,context_contract_id:BOOTSTRAP_CONTEXT_SELECTION.contract_id,context_contract_sha256:BOOTSTRAP_CONTEXT_SELECTION.resource_sha256,context_encoding:BOOTSTRAP_CONTEXT_SELECTION.context_encoding,scope_profile_id:BOOTSTRAP_CONTEXT_SELECTION.scope_profile_id,evidence_scope:'source-resource-and-whole-payload-source-cut-wire-compatibility-only'};
  const acknowledge=async()=>{const raw=JSON.stringify(observation);wire({binding_sha256:sha(raw),observation});await flush();assert.equal(child.control.filter(v=>v.kind==='context_contract_permit').length,1);};
  const expected={ledger:shim.ledger,admission_ref:cloneForBootstrap(shim.admission_ref),context_sha256:sha(assignment),kind:'peer-bootstrap-membership-reconstruction'};
  server({id:'soloco-peer-1',result:{SYNTHETIC_initialize:true}});await send({method:'initialized'});
  const start=async(change={})=>{await send({id:'soloco-peer-2',method:'thread/start',params:{cwd:scope.cwd,runtimeWorkspaceRoots:[scope.cwd],permissions:':read-only',approvalPolicy:'never',baseInstructions:launch.base_instructions,developerInstructions:launch.developer_instructions,dynamicTools:bootstrapReadonly3Tools(),ephemeral:false}});server({id:'soloco-peer-2',result:{thread:{id:native,sessionId:session,parentThreadId:null,forkedFromId:null,turns:[],canAcceptDirectInput:true,ephemeral:false},cwd:scope.cwd,runtimeWorkspaceRoots:[scope.cwd],activePermissionProfile:{id:':read-only',SYNTHETIC_correlated_metadata_only:true},approvalPolicy:'never',instructionSources:[],...change}});await flush();};
  const tokens=()=>domain.originalProtectedOwnedTaskTokens(owner,handle),bind=()=>{const creation=tokens().creation;assert(creation);const facts=domain.inspectOriginalPeerBootstrapMembershipCreation(creation,expected);shim.bindSyntheticNative(facts.native_id);return facts;};
  const startTurn=async()=>{await send({id:'soloco-peer-3',method:'turn/start',params:{threadId:native,input:geometry.input}});server({id:'soloco-peer-3',result:{turn:{id:turn}}});await flush();};
  // Independently literal materialized SDK schemas, not the domain converter.
  const description='Private bootstrap membership context protocol; identity and authority are supplied only by the original protected composition.',tools=[{type:'function',name:'soloco_context_header',description,strict:false,parameters:{type:'object',properties:{},required:[],additionalProperties:false}},{type:'function',name:'soloco_context_read',description,strict:false,parameters:{type:'object',properties:{sha256:{type:'string'},offset:{type:'integer'},length:{type:'integer'}},required:['sha256','offset','length'],additionalProperties:false}},{type:'function',name:'soloco_context_submit',description,strict:false,parameters:{type:'object',properties:{sha256:{type:'string'},content:{type:'string'}},required:['sha256','content'],additionalProperties:false}}];
  const request=(change={})=>{const facts={protocol:PROTOCOL,kind:'final_request',nonce:challenge.nonce,pid:child.pid,sequence:1,source_commit:'c40729ea5cf8e947481b130c59807273eda2f8e9',producer_module_sha256:'d'.repeat(64),tool_resource_sha256:BOOTSTRAP_CONTEXT_SELECTION.resource_sha256,host_instance_id:host,runtime_generation:1,profile_generation:1,services_generation:1,instruction_generation:1,thread_id:native,turn_id:turn,step_id:1,auth_owner_generation:0,auth_revision:0,auth_send_epoch:1,runtime_id:null,request_id:'66666666-6666-4666-8666-666666666666',gateway_instance_id:'77777777-7777-4777-8777-777777777777',method:'POST',url:'https://example.invalid/responses',request_sha256:sha('SYNTHETIC bootstrap request'),request_bytes:100,context_sha256:HASH,input_text_sha256s:geometry.input.map(item=>sha(item.text)),ordered_instructions:[],ordered_instructions_sha256:sha('[]'),profile:{SYNTHETIC_model_request_projection:true},tools:cloneForBootstrap(tools),provenance:{original_sampling_input_sha256:HASH,sources:{SYNTHETIC:true},unknown_origins:[]},...change};const raw=JSON.stringify(facts);wire({binding_sha256:sha(raw),observation:facts});return facts;};
  const headers=facts=>wire({protocol:PROTOCOL,kind:'transport_headers',nonce:challenge.nonce,pid:child.pid,sequence:facts.sequence,request_id:facts.request_id,gateway_instance_id:facts.gateway_instance_id,status:200}),eof=facts=>wire({protocol:PROTOCOL,kind:'local_body_eof',request_id:facts.request_id,sequence:facts.sequence,pid:child.pid,remote_domain_closed:false}),witness=facts=>wire({protocol:PROTOCOL,kind:'original_response_terminal_drained',nonce:challenge.nonce,pid:child.pid,host_instance_id:host,request_id:facts.request_id,request_sha256:facts.request_sha256,sequence:facts.sequence,response_id:'SYNTHETIC-bootstrap-response',terminal_logical_payload_sha256:sha('SYNTHETIC bootstrap terminal'),local_body_eof_observed:true,remote_domain_closed:false});
  const completed=()=>{server({method:'item/completed',params:{threadId:native,turnId:turn,item:{id:'SYNTHETIC-bootstrap-final',type:'agentMessage',phase:'final_answer',text:OUTPUT}}});server({method:'turn/completed',params:{threadId:native,turn:{id:turn,status:'completed',error:null}}});};
  const ready=async()=>{await acknowledge();await start();const birth=bind();await startTurn();return birth;};
  return {domain,shim,owner,handle,facade,child,ledger:shim.ledger,expected,errors,challenge,geometry,scope,launch,wire,server,send,acknowledge,start,bind,startTurn,tokens,ready,request,headers,eof,witness,completed,native,turn,tools,deadline:shim.deadline_at_ms,executionDeadline:clock+120000,setClock(value){clock=value;}};
}
function cloneForBootstrap(value){return JSON.parse(JSON.stringify(value));}

test('conditional bootstrap original FD acknowledgement and fresh thread precede its separate creation token',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();assert.equal(f.tokens().creation,null);await f.start();assert.equal(f.tokens().creation,null,'a correlated thread cannot replace the original FD4 acknowledgement');await f.acknowledge();
  const cap=f.tokens().creation;assert(cap);const birth=f.domain.inspectOriginalPeerBootstrapMembershipCreation(cap,f.expected);assert.equal(birth.protocol,'peer-bootstrap-membership-original-creation-v1');assert.equal(birth.native_id,f.native);assert.equal(birth.thread_id,f.native);assert.equal(birth.profile_id,'soloco-bootstrap-membership-readonly3-v1');assert.equal(birth.original_runtime.native_permission_profile.id,':read-only');assert.notEqual(birth.profile_id,birth.original_runtime.native_permission_profile.id);assert.equal(birth.original_runtime.context_binding.frame_sha256,f.geometry.frame.sha256);assert.equal(birth.original_runtime.creation_tools_sha256,sha(f.shim.canonical((await import(new URL('../plugins/soloco/runtime/peers/bootstrap-membership-delivery-frame.mjs',import.meta.url))).bootstrapReadonly3Tools())));assert.equal(f.tokens().drain,null);
  f.bind();await f.startTurn();assert.throws(()=>f.domain.inspectOriginalPeerBootstrapMembershipCreation(cap,f.expected),held,'creation cannot be rebound after the conditional cap has a native identity');assert.equal(f.ledger.snapshot(),before,'actual producer cannot admit, recharge or release the synthetic existing unit');
});

test('conditional bootstrap owns distinct work_items drain and narrow closure after every original EOF',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot(),birth=await f.ready();assert.equal(birth.native_id,f.native);const facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();assert.equal(f.tokens().drain,null);await f.child.close();
  const tokens=f.tokens();assert(tokens.creation&&tokens.drain);assert.equal(tokens.diagnostic,null);const drain=f.domain.assertOriginalProtectedOwnedTaskDrain(tokens.drain,f.expected),closure=f.domain.assertOriginalProtectedBootstrapMembershipClosure(tokens.drain,f.expected);assert.equal(drain.kind,f.expected.kind);assert.equal(drain.output,OUTPUT);assert.equal(drain.requests.length,1);assert.equal(closure.protocol,'peer-bootstrap-membership-owned-unit-closure-v1');assert.equal(closure.scope,'original-owned-admitted-bootstrap-unit');assert.equal(closure.drain_sha256,sha(f.shim.canonical(drain)));assert.equal(closure.termination_confirmed,true);assert.equal(closure.group_absent,null);for(const key of ['remote_domain_closed','whole_domain_qualified','prior_unknown_slots_released'])assert.equal(closure[key],false);assert.equal(f.ledger.snapshot(),before);assert.deepEqual(f.errors,[]);t.mock.timers.tick(120000);assert.deepEqual(f.child.signals,[],'no signal follows a reaped synthetic original child');
});

test('conditional bootstrap token copies ordinary command families and foreign phases cannot alias its capabilities',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t);await f.acknowledge();await f.start();const birth=f.tokens().creation;assert(birth);
  for(const expected of [{...f.expected,kind:'task'},{...f.expected,kind:'peer-bootstrap-membership-review'},{...f.expected,admission_ref:{...f.expected.admission_ref,family:'commands'}},{...f.expected,admission_ref:{...f.expected.admission_ref,id:'membership-admission:SYNTHETIC-foreign-phase'}},{...f.expected,ledger:new f.shim.PeerLedger('foreign')}])assert.throws(()=>f.domain.inspectOriginalPeerBootstrapMembershipCreation(birth,expected),held);
  for(const copied of [{},cloneForBootstrap(birth),Object.freeze(Object.create(null))])assert.throws(()=>f.domain.inspectOriginalPeerBootstrapMembershipCreation(copied,f.expected),held);
  f.bind();await f.startTurn();const facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();await f.child.close();const drain=f.tokens().drain;assert(drain);assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDrain(drain,{...f.expected,kind:'task'}),held);assert.throws(()=>f.domain.assertOriginalProtectedBootstrapMembershipClosure(cloneForBootstrap(drain),f.expected),held);assert.throws(()=>f.domain.assertOriginalProtectedBootstrapMembershipClosure(drain,{...f.expected,admission_ref:{...f.expected.admission_ref,family:'commands'}}),held);
});

test('conditional bootstrap refuses an ordinary or descriptor-labelled effective permission response',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t);await f.acknowledge();await f.start({activePermissionProfile:{id:'soloco-bootstrap-membership-readonly3-v1'}});assert.equal(f.tokens().creation,null);assert.equal(f.tokens().drain,null);assert(f.errors.some(error=>error.code==='PROTECTED_CODEX_BOOTSTRAP_EFFECTIVE_PROFILE'));
});

test('conditional bootstrap exact original input and closed materialized three-tool catalogue stay bound',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t);await f.ready();const changed=cloneForBootstrap(f.tools);changed[1].parameters.properties.length.maximum=4096;f.request({tools:changed});assert.equal(f.tokens().drain,null);assert(f.errors.some(error=>error.code==='PROTECTED_CODEX_FINAL_FACTS_HELD'),'input schema bounds cannot masquerade as actual materialized Responses parameters');
});

test('conditional bootstrap creation observation cannot replace binding the existing admission before turn start',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.acknowledge();await f.start();assert(f.tokens().creation);await assert.rejects(()=>f.startTurn(),error=>error.code==='PROTECTED_CODEX_BOOTSTRAP_CREATION_REQUIRED');assert.equal(f.tokens().drain,null);assert.equal(f.ledger.snapshot(),before);
});

for(const missing of ['response-body-eof','native-terminal-witness'])test('conditional bootstrap missing '+missing+' cannot be excused by local stream closure',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.ready();const facts=f.request();f.headers(facts);if(missing!=='response-body-eof')f.eof(facts);f.completed();await f.child.close();assert.equal(f.tokens().drain,null);assert(f.tokens().diagnostic);assert.equal(f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected).qualifies,false);assert.equal(f.ledger.snapshot(),before);
});

for(const missing of ['stdout','stderr','witness','stdin','control'])test('conditional bootstrap missing '+missing+' EOF cannot produce owned closure',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.ready();const facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();await f.child.close({missing});assert.equal(f.tokens().drain,null);const diagnostic=f.tokens().diagnostic;assert(diagnostic);const data=f.domain.assertOriginalProtectedOwnedTaskDiagnostic(diagnostic,f.expected);assert.equal(data.qualifies,false);assert.equal(data.kind,f.expected.kind);assert.equal(f.ledger.snapshot(),before);assert.throws(()=>f.domain.assertOriginalProtectedBootstrapMembershipClosure(diagnostic,f.expected),held);
});

test('conditional bootstrap post-terminal data cannot renew or release the existing unit',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.ready();const facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();f.server({method:'turn/started',params:{threadId:f.native,turn:{id:f.turn,status:'inProgress'}}});await f.child.close();assert.equal(f.tokens().drain,null);assert(f.tokens().diagnostic);assert.equal(f.ledger.snapshot(),before);assert(f.errors.some(error=>error.code==='PROTECTED_CODEX_OWNED_POST_TERMINAL'));
});

for(const negative of ['capacity-loss','deadline-expiry'])test('conditional bootstrap '+negative+' cannot issue a positive closure',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.ready();const facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();if(negative==='capacity-loss')f.shim.setCapacity(false);else f.setClock(f.deadline);await f.child.close();assert.equal(f.tokens().drain,null);assert(f.tokens().diagnostic);const data=f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected);assert.equal(data.qualifies,false);assert.equal(f.ledger.snapshot(),before);assert.throws(()=>f.domain.assertOriginalProtectedBootstrapMembershipClosure(f.tokens().diagnostic,f.expected),held);
});

test('conditional bootstrap cancellation retains only negative evidence and never signals after reap',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.ready();f.facade.kill('SIGTERM');assert.deepEqual(f.child.signals,['SIGTERM']);await f.child.close();assert.equal(f.tokens().drain,null);assert(f.tokens().diagnostic);const diagnostic=f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected);assert.equal(diagnostic.qualifies,false);assert.equal(diagnostic.prior_unknown_slots_released,false);assert.equal(f.ledger.snapshot(),before);t.mock.timers.tick(120000);assert.deepEqual(f.child.signals,['SIGTERM']);
});

test('conditional bootstrap last synchronous scope read cannot mint creation after the absolute deadline',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.acknowledge();f.shim.setAfterScope(()=>f.setClock(f.executionDeadline));await f.start();assert.equal(f.tokens().creation,null);assert.equal(f.tokens().drain,null);assert(f.tokens().diagnostic);assert.equal(f.ledger.snapshot(),before);assert(f.executionDeadline<f.deadline,'absolute process deadline is distinct from longer original admission expiry');
});

test('conditional bootstrap last synchronous admission read cannot mint a late drain',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.ready();const facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();f.shim.setAfterAssertion(()=>f.setClock(f.executionDeadline));await f.child.close();assert.equal(f.tokens().drain,null);assert(f.tokens().diagnostic);assert.equal(f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected).qualifies,false);assert.equal(f.ledger.snapshot(),before);
});

test('conditional bootstrap last synchronous admission read cannot issue a late final send permit',{concurrency:false},async t=>{
  const f=await bootstrapFixture(t),before=f.ledger.snapshot();await f.ready();f.shim.setAfterAssertion(()=>f.setClock(f.executionDeadline));f.request();await flush();assert.equal(f.child.control.filter(frame=>frame.kind==='send_permit').length,0);assert.equal(f.tokens().drain,null);assert(f.tokens().diagnostic);assert.equal(f.domain.assertOriginalProtectedOwnedTaskDiagnostic(f.tokens().diagnostic,f.expected).qualifies,false);assert.equal(f.ledger.snapshot(),before);
});

test('original FD3 terminal plus complete owned lifecycle creates only narrow task capabilities',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot();assert.equal(f.tokens().drain,null);await successful(f);
  const caps=f.tokens();assert(Object.isFrozen(caps));assert(caps.creation);assert(caps.drain);assert.equal(caps.diagnostic,null);
  const creation=f.domain.inspectOriginalProtectedOwnedTaskCreation(caps.creation,f.expected);
  assert.equal(creation.creation_mode,'original-owned-task-thread-association');assert.equal(creation.context_sha256,HASH);
  assert.equal(creation.fresh_bootstrap_creation,false);assert.equal(creation.authority_issued,false);
  const drain=f.domain.assertOriginalProtectedOwnedTaskDrain(caps.drain,f.expected);
  assert.equal(drain.output,OUTPUT);assert.equal(drain.output_sha256,sha(OUTPUT));assert.equal(drain.requests.length,1);assert.equal(drain.terminal_status,'completed');
  for(const name of ['whole_domain_qualified','whole_domain_closed','prior_unknown_slots_released'])assert.equal(drain[name],false);
  assert.equal(drain.group_absent,null);assert.equal(drain.remote_domain_closed,false);
  assert.deepEqual(f.domain.assertOriginalProtectedOwnedTaskDrain(caps.drain,f.expected),drain,'inspection does not spend consumer finalization authority');
  assert.equal(f.ledger.snapshot(),before,'producer and assertions cannot release a slot or alter source records');globalsRemainUnknown(f);assert.deepEqual(f.errors,[]);
  t.mock.timers.tick(120000);assert.deepEqual(f.child.signals,[],'actual local close cancels remaining lifetime/escalation timers');
  const bootstrapExpected={...f.expected,kind:'peer-bootstrap-membership-reconstruction',admission_ref:{...f.expected.admission_ref,family:'work_items',id:'membership-admission:SYNTHETIC-other-kind'}};
  assert.throws(()=>f.domain.inspectOriginalPeerBootstrapMembershipCreation(caps.creation,bootstrapExpected),held,'ordinary task association cannot impersonate readonly3 bootstrap creation');
  assert.throws(()=>f.domain.assertOriginalProtectedBootstrapMembershipClosure(caps.drain,bootstrapExpected),held);
});

test('two sequential requests in one owned turn retain both exact terminal histories',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),first=f.request(1);
  f.headers(first);f.eof(first);f.witness(first);assert.equal(f.tokens().drain,null);
  const second=f.request(2);assert.notEqual(second.request_id,first.request_id);assert.notEqual(second.request_sha256,first.request_sha256);
  const expectedRequests=[1,2].map(sequence=>({request_id:'00000000-0000-4000-8000-'+String(sequence).padStart(12,'0'),request_sha256:sha('SYNTHETIC request '+sequence),sequence,response_id:'SYNTHETIC-response-'+sequence,terminal_logical_payload_sha256:sha('SYNTHETIC Completed '+sequence)}));
  assert.deepEqual(f.child.control.filter(frame=>frame.kind==='send_permit').map(frame=>({request_id:frame.request_id,request_sha256:frame.request_sha256,sequence:frame.sequence})),expectedRequests.map(({request_id,request_sha256,sequence})=>({request_id,request_sha256,sequence})));
  f.headers(second);f.eof(second);f.witness(second);assert.equal(f.tokens().drain,null,'response completion alone is not owned lifecycle closure');
  f.completed();assert.equal(f.tokens().drain,null);await f.child.close();
  const caps=f.tokens();assert(caps.drain);assert.equal(caps.diagnostic,null);
  const drain=f.domain.assertOriginalProtectedOwnedTaskDrain(caps.drain,f.expected);
  assert.deepEqual(drain.requests,expectedRequests,'retain the first terminal request as well as the final request');
  assert.equal(drain.output,OUTPUT);assert.equal(drain.output_sha256,sha(OUTPUT));assert.equal(drain.turn_id,'fictional-turn');
  assert.equal(f.ledger.snapshot(),before);globalsRemainUnknown(f);assert.deepEqual(f.errors,[]);
});

for(const missing of ['raw-eof','terminal','turn'])test('missing '+missing+' cannot turn Completed/local EOF into drain',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);
  if(missing!=='raw-eof')f.eof(facts);
  if(missing==='turn')f.witness(facts);
  if(missing!=='turn')f.completed();await f.child.close();diagnostic(f);assert.equal(f.ledger.snapshot(),before);
});

for(const variant of ['duplicate','foreign-request','wrong-host','wrong-hash','wrong-sequence','wrong-nonce','wrong-pid','extra-field','before-eof'])test('terminal witness '+variant+' is nonqualifying',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);
  if(variant!=='before-eof')f.eof(facts);
  const changes={'foreign-request':{request_id:'33333333-3333-4333-8333-333333333333'},'wrong-host':{host_instance_id:'33333333-3333-4333-8333-333333333333'},'wrong-hash':{request_sha256:'f'.repeat(64)},'wrong-sequence':{sequence:2},'wrong-nonce':{nonce:'f'.repeat(64)},'wrong-pid':{pid:424243},'extra-field':{completed:true}};
  f.witness(facts,changes[variant]??{});if(variant==='duplicate')f.witness(facts);
  f.completed();await f.child.close();diagnostic(f);assert.equal(f.ledger.snapshot(),before);assert(f.errors.length>0);
});

for(const status of [null,500])test('missing successful transport headers ('+status+') cannot qualify a terminal response',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();if(status!==null)f.headers(facts,status);
  f.eof(facts);f.witness(facts);f.completed();await f.child.close();diagnostic(f);assert.equal(f.ledger.snapshot(),before);
});

test('earlier unresolved response cannot be hidden by a later apparently good final',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),first=f.request();f.headers(first);f.eof(first);
  const last=f.request(2);f.headers(last);f.eof(last);f.witness(last);f.completed();await f.child.close();
  const {value}=diagnostic(f);assert(value.requests.some(request=>request.request_id===first.request_id&&!request.terminal_observed));assert.equal(f.ledger.snapshot(),before);
});

for(const variant of ['post-terminal','post-terminal-tool','post-terminal-request','post-terminal-turn-started','post-terminal-thread-started','failed-turn','interrupted-turn','cancel','timeout','child-error'])test(variant+' retains only original nonqualifying custody',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);
  f.completed(variant==='failed-turn'?'failed':variant==='interrupted-turn'?'interrupted':'completed');
  if(variant==='post-terminal')f.server({method:'item/agentMessage/delta',params:{threadId:'fictional-thread',turnId:'fictional-turn',delta:'late'}});
  if(variant==='post-terminal-tool')f.server({id:99,method:'item/tool/call',params:{threadId:'fictional-thread',turnId:'fictional-turn',tool:'soloco_context_header',arguments:{}}});
  if(variant==='post-terminal-turn-started')f.server({method:'turn/started',params:{threadId:'fictional-thread',turn:{id:'fictional-turn'}}});
  if(variant==='post-terminal-thread-started')f.server({method:'thread/started',params:{thread:{id:'fictional-thread'}}});
  if(variant==='post-terminal-request'){
    const beforePermits=f.child.control.filter(frame=>frame.kind==='send_permit').length;
    f.request(2);assert.equal(f.child.control.filter(frame=>frame.kind==='send_permit').length,beforePermits,'completed turn cannot grant another permit');
  }
  if(variant==='cancel')f.facade.kill('SIGTERM');
  if(variant==='timeout')t.mock.timers.tick(120000);
  if(variant==='child-error')f.child.emit('error',Error('SYNTHETIC original child error'));
  await f.child.close();diagnostic(f);assert.equal(f.ledger.snapshot(),before);
});

test('second turn/start cannot replace the originally latched task turn',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);
  await assert.rejects(()=>f.send({id:4,method:'turn/start',params:{threadId:'fictional-thread',input:[{type:'text',text:'SYNTHETIC replacement turn'}]}}),error=>error?.code==='PROTECTED_CODEX_OWNED_TURN_REPLAY');
  f.completed();await f.child.close();const {value}=diagnostic(f);assert.equal(value.turn_id,'fictional-turn');assert.equal(f.ledger.snapshot(),before);
});

for(const stage of ['exited','closed'])test('explicit cancellation after original '+stage+' cannot retain or mint a drain',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();
  let formerDrain=null;
  if(stage==='closed'){await f.child.close();formerDrain=f.tokens().drain;assert(formerDrain);}
  else f.child.exit();
  f.facade.kill('SIGTERM');assert.deepEqual(f.child.signals,[],'observed exit forbids signaling even on explicit cancellation');
  if(stage==='exited'){await f.child.close();diagnostic(f);}
  else assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDrain(formerDrain,f.expected),error=>error?.code==='PROTECTED_CODEX_OWNED_DRAIN_STALE');
  assert.equal(f.ledger.snapshot(),before);globalsRemainUnknown(f);
});

for(const pending of ['rpc','tool'])test('pending '+pending+' obligation survives a completed turn without drain',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);
  if(pending==='rpc')await f.send({id:99,method:'config/read',params:{}});
  else f.server({id:99,method:'item/tool/call',params:{threadId:'fictional-thread',turnId:'fictional-turn',tool:'soloco_context_header',arguments:{}}});
  f.completed();await f.child.close();diagnostic(f);assert.equal(f.ledger.snapshot(),before);
});

for(const variant of ['missing-exit','one-fd','broker-pending','broker-unknown'])test(variant+' blocks narrow drain despite valid terminal data',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();
  if(variant.startsWith('broker'))f.shim.setBrokerMode(variant==='broker-pending'?'pending':'unknown');
  await f.child.close({exit:variant!=='missing-exit',missing:variant==='one-fd'?'witness':null});diagnostic(f);assert.equal(f.ledger.snapshot(),before);
  if(variant==='broker-pending'){f.shim.settle();await flush();assert(f.tokens().drain,'only actual broker settlement completes conditional narrow lifecycle');}
});

test('private capabilities reject copies, purpose confusion and mixed original bindings',{concurrency:false},async t=>{
  const f=await fixture(t);await successful(f);const caps=f.tokens(),before=f.ledger.snapshot();
  const inspect=(token,expected=f.expected)=>f.domain.assertOriginalProtectedOwnedTaskDrain(token,expected);
  for(const token of [{},{...caps.drain},structuredClone(caps.drain),caps.creation])assert.throws(()=>inspect(token),held);
  for(const change of [{ledger:new f.shim.PeerLedger('other')},{admission_ref:{...f.expected.admission_ref,revision:2}},{context_sha256:'f'.repeat(64)},{kind:'membership'},{extra:true}])assert.throws(()=>inspect(caps.drain,{...f.expected,...change}),held);
  let getterCalls=0;assert.throws(()=>inspect(caps.drain,{...f.expected,get kind(){getterCalls++;return 'task';}}),held);assert.equal(getterCalls,0);
  assert.throws(()=>inspect(caps.drain,{...f.expected,admission_ref:{...f.expected.admission_ref,get sha256(){getterCalls++;return f.expected.admission_ref.sha256;}}}),held);assert.equal(getterCalls,0);
  assert.throws(()=>inspect(caps.drain,new Proxy(f.expected,{})),held);
  assert.throws(()=>f.domain.originalProtectedOwnedTaskTokens(Symbol('foreign owner'),f.handle),held);
  assert.throws(()=>f.domain.bindOriginalProtectedTaskAdmission(f.owner,f.handle,new f.shim.PeerLedger('other'),'fictional-task',f.context),held);
  assert.equal(f.ledger.snapshot(),before);
});

for(const drift of ['expired','principal','task','connection','command-head-ref','command-head-value'])test('positive capability becomes stale after '+drift,{concurrency:false},async t=>{
  const f=await fixture(t);await successful(f);const caps=f.tokens();assert(caps.drain);
  if(drift==='expired')f.setClock(Date.parse(f.context.grant.value.expires_at)+1);
  if(drift==='principal')f.ledger.rows.get('principals:fictional-cos').value.generation++;
  if(drift==='task')f.ledger.rows.get('tasks:fictional-task').value.status='unknown';
  if(drift==='connection')f.ledger.company_id='SYNTHETIC-replaced';
  if(drift==='command-head-ref')f.ledger.command.revision=2;
  if(drift==='command-head-value')f.ledger.command.value.result.admitted=false;
  assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDrain(caps.drain,f.expected),held);
  assert.equal(f.ledger.originalCommand.revision,1);assert.equal(f.ledger.originalCommand.value.result.admitted,true,'historical admission is independent of current HEAD');
  // This test asserts revocation of a former positive, not a new diagnostic.
  // A negative token is captured independently below before authority changes.
});

test('current command HEAD drift blocks first drain despite immutable original admission',{concurrency:false},async t=>{
  const f=await fixture(t),facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();
  const historical=f.shim.canonical(f.ledger.originalCommand);f.ledger.command.value.result.admitted=false;const before=f.ledger.snapshot();
  await f.child.close();diagnostic(f);assert.equal(f.ledger.snapshot(),before);assert.equal(f.shim.canonical(f.ledger.originalCommand),historical);
});

for(const stage of ['mint','assert'])test('exact execution deadline fences '+stage+' before any live admission read',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);f.eof(facts);f.witness(facts);f.completed();
  if(stage==='mint')f.shim.setBrokerMode('pending');
  await f.child.close();const prior=stage==='assert'?f.tokens().drain:null;if(stage==='assert')assert(prior);
  let reads=0;t.mock.method(f.shim.PeerLedger.prototype,'read',()=>{reads++;throw Error('SYNTHETIC live read past deadline must not occur');});
  f.setClock(f.executionDeadline);
  if(stage==='mint'){f.shim.settle();await flush();const {value}=diagnostic(f);assert.equal(value.error,'PROTECTED_CODEX_OWNED_DEADLINE');}
  else assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDrain(prior,f.expected),error=>error?.code==='PROTECTED_CODEX_OWNED_DRAIN_STALE');
  assert.equal(reads,0);assert.equal(f.ledger.snapshot(),before);
});

test('negative token keeps original binding after expiry/replacement without a live authority lookup',{concurrency:false},async t=>{
  const f=await fixture(t),before=f.ledger.snapshot(),facts=f.request();f.headers(facts);f.eof(facts);f.completed();await f.child.close();
  const {caps,value}=diagnostic(f);assert.equal(f.ledger.snapshot(),before);
  f.ledger.rows.get('tasks:fictional-task').value.status='unknown';f.ledger.rows.get('principals:fictional-cos').value.generation++;
  f.setClock(Date.parse(f.context.grant.value.expires_at)+1);
  assert.deepEqual(f.domain.assertOriginalProtectedOwnedTaskDiagnostic(caps.diagnostic,f.expected),value);
  assert.equal(f.tokens().drain,null);assert.throws(()=>f.domain.assertOriginalProtectedOwnedTaskDiagnostic({...caps.diagnostic},f.expected),held);
});
