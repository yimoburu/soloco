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
  assert.equal(count,7,'only fixed spawn/slot/supervisor/ledger/model/broker predecessor imports change');
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
  assert.equal(typeof f.domain.inspectOriginalPeerBootstrapMembershipCreation,'undefined','ordinary task association cannot impersonate unsupported readonly3 bootstrap creation');
  assert.equal(typeof f.domain.assertOriginalProtectedBootstrapMembershipClosure,'undefined');
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
