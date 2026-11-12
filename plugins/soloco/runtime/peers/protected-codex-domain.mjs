import {ORIGINAL_CONTEXT_SELECTION,resolveOriginalPeerContextInterpreter,assertOriginalPeerContextInterpreterFinal,assertOriginalPeerContextSlot,inspectOriginalPeerContextInterpreter} from './protected-source-build-slot.mjs';
import {originalPeerContextDeliveryInterpreter,inspectOriginalPeerContextDelivery,peerContextTurnInput} from './peer-context-interpreter.mjs';
// Original compiled Codex launch and bounded stdio lifecycle. This source does
// not qualify the stock binary, its auth context or its final model request.
// In particular, a well-typed child frame never substitutes for a reviewed
// source-build association. No model-facing tool exposes these owner handles.
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {Writable,PassThrough} from 'node:stream';
import {randomBytes,createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {canonical,PeerLedger} from './ledger.mjs';
import * as model from './model.mjs';
import {originalCompanionSlotMatches} from './protected-source-build-slot.mjs';
import {parseGatewayJSON} from './gateway-wire.mjs';
import {createOriginalControlTranscript,parseOriginalControlFrame} from './protected-context-channel.mjs';
import {createFixedConnectBroker} from './protected-connect-broker.mjs';
import {stableTaskHostTools} from './host-protocol.mjs';
import {expectedResponsesTools} from './responses-gateway.mjs';
import {inspectOriginalCompiledCodexPlan,claimOriginalCompiledCodexPlan,originalCompiledPeerContextInterpreter} from './policy-supervisor.mjs';

const launches=new WeakMap(),facades=new WeakMap(),nativeMC23Proofs=new WeakMap();
const PROTOCOL='soloco-protected-backend-witness-v1';
const PERMIT_PROTOCOL='soloco-protected-backend-permit-v2';
// This is intentionally not a caller parameter or a child-provided flag.
// A future reviewed source/build tuple must replace this source declaration.
const QUALIFIED_BACKEND_BUILD=null;
const MAX_FRAME=100000,MAX_WIRE=4000000,MAX_FRAMES=256,TOTAL_MS=120000;
const GRACE_MS=250,TERM_MS=500,KILL_MS=1000;
const controls=new Set(['initialize','initialized','config/read','configRequirements/read','permissionProfile/list','mcpServerStatus/list','app/installed','thread/start','thread/resume','turn/start','turn/interrupt']);
const toolNames=new Set(stableTaskHostTools().map(tool=>tool.name));
const fail=code=>{throw Object.assign(Error(code),{code});};
const copy=value=>JSON.parse(canonical(value));
const same=(a,b)=>canonical(a)===canonical(b);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const closed=(value,keys)=>plain(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!value.includes('\0');
const idKey=value=>{if(!text(value)&&!(Number.isSafeInteger(value)&&value>=0))fail('PROTECTED_CODEX_RPC_ID');return canonical(value);};
function record(owner,handle){const r=launches.get(handle);if(!r||r.owner!==owner||typeof owner!=='symbol')fail('PROTECTED_CODEX_ORIGINAL_PLAN_REQUIRED');return r;}
function safeError(error){try{return typeof error?.code==='string'&&error.code.startsWith('PROTECTED_CODEX_')?error.code:'PROTECTED_CODEX_DOMAIN_UNKNOWN';}catch{return 'PROTECTED_CODEX_DOMAIN_UNKNOWN';}}
function companionBuild(r){return r.plan.launch_mode==='companion-v2'&&originalCompanionSlotMatches(r.plan.companion_slot)&&r.plan.companion_slot.executable_sha256===r.plan.executable_pin.sha256;}
function companionArmed(r){
 if(!companionBuild(r))fail('PROTECTED_CODEX_BACKEND_BUILD_UNQUALIFIED');
 const h=r.backend.original_host,s=r.plan.companion_slot,c=s.native_context_contract;
 if(!h||!c||h.slot_id!==s.slot_id||h.executable_sha256!==s.executable_sha256||h.source_manifest_sha256!==s.source_manifest_sha256||h.original_home_sha256!==c.original_home_sha256||h.state_root!==r.plan.state_root||h.cwd!==r.plan.cwd||s.scope_policy==='V5_ORIGINAL_MANAGED_PRIVATE_FD'&&(!r.connect_broker||h.loopback_proxy_port!==r.connect_broker.port||h.loopback_proxy_port!==r.plan.gateway_port))fail('PROTECTED_CODEX_NATIVE_HOST_ASSOCIATION_HELD');
 if(r.stopping||r.closed||r.failed||r.state!=='born')fail('PROTECTED_CODEX_DOMAIN_INACTIVE');
}
function buildQualified(r){
 if(r.plan.launch_mode==='companion-v2'){try{companionArmed(r);return true;}catch{return false;}}
 const expected=QUALIFIED_BACKEND_BUILD,seen=r.backend.hello;
 return Boolean(expected&&seen&&same(seen.build,expected)&&expected.executable_sha256===r.plan.executable_pin.sha256&&r.backend.native_auth_context_qualified&&r.backend.gateway_qualified);
}
function beforeModel(r){
 if(r.stopping||r.closed||r.state!=='born')fail('PROTECTED_CODEX_DOMAIN_INACTIVE');
 if(!buildQualified(r))fail('PROTECTED_CODEX_BACKEND_BUILD_UNQUALIFIED');
 // No producer for these facts exists in the stock host. A future original
 // gateway/backend integration must populate private state from real events.
 if(!r.backend.durable_catalog_qualified||!r.backend.last_step)fail('PROTECTED_CODEX_FINAL_FACTS_HELD');
}

/** Seal only an ORIGINAL policy-supervisor handle. This creates no process. */
export function createOriginalProtectedCodexLaunch(owner,compiledPlan){
 const plan=inspectOriginalCompiledCodexPlan(owner,compiledPlan);
 const context_interpreter=originalCompiledPeerContextInterpreter(owner,compiledPlan);if(context_interpreter)assertOriginalPeerContextSlot(context_interpreter,plan.companion_slot);
 if(plan.consumed)fail('PROTECTED_CODEX_LAUNCH_CONSUMED');
 const handle=Object.freeze(Object.create(null));
 launches.set(handle,{owner,compiledPlan,plan,context_interpreter,context_delivery:null,state:'sealed',consumed:false,child:null,facade:null,
  stopping:false,closed:false,birth:null,close:null,code:null,unknown:true,failed:false,
  stdout_eof:false,stderr_eof:false,witness_eof:false,stdin_finished:false,child_stdin_closed:false,control_closed:false,
  bytes:{stdout:0,stderr:0,witness:0,control:0},frames:{stdout:0,witness:0,control:0},
  timers:new Set(),pendingReplies:new Set(),backend:{hello:null,last_step:null,sequence:0,native_auth_context_qualified:false,gateway_qualified:false,durable_catalog_qualified:false},
  nonce:randomBytes(32).toString('hex'),group_absent:null,backend_operations:0});
 return handle;
}
/** The new managed route owns its broker before compiling the exact loopback
 * policy. No caller endpoint, proxy factory, token or interpreter is accepted. */
export async function prepareOriginalProtectedPeerLaunch(owner,supervisor,input){
 if(typeof owner!=='symbol'||!supervisor?.compile)fail('PROTECTED_CODEX_ORIGINAL_PLAN_REQUIRED');
 const interpreter=resolveOriginalPeerContextInterpreter(),nonce=randomBytes(32).toString('hex'),brokerOwner=Object.freeze(Object.create(null));let r;
 const broker=await createFixedConnectBroker({owner:brokerOwner,token:nonce,deadline:Date.now()+115000,guard:(token,stage)=>{
  if(token!==brokerOwner)fail('PROTECTED_CODEX_DOMAIN_INACTIVE');
  if(stage==='listen'){assertOriginalPeerContextInterpreterFinal(interpreter);return;}
  if(!r||r.stopping||r.closed||r.failed)fail('PROTECTED_CODEX_DOMAIN_INACTIVE');currentNativeAuthority(r);
 }});
 try{
  if(!plain(input)||Object.keys(input).some(k=>!['cwd','read_paths','state_root','scratch_root'].includes(k)))fail('PROTECTED_CODEX_ORIGINAL_PLAN_REQUIRED');
  const compiled=supervisor.compile(owner,{kind:'codex-companion',...input,gateway_port:broker.port},{context_interpreter:interpreter});
  const h=createOriginalProtectedCodexLaunch(owner,compiled);r=record(owner,h);r.nonce=nonce;r.connect_broker=broker;void broker.closed.then(data=>{r.connect_broker_closure=data;});return h;
 }catch(error){await broker.close();throw error;}
}
export function isOriginalProtectedCompanionLaunch(owner,handle){return isOriginalProtectedCodexLaunch(owner,handle)&&record(owner,handle).plan.launch_mode==='companion-v2';}
export function isOriginalProtectedCodexLaunch(owner,handle){return launches.get(handle)?.owner===owner&&typeof owner==='symbol';}
export function bindOriginalProtectedCodexLaunch(owner,handle,launch){
 const r=record(owner,handle);
 if(!closed(launch,['cwd','profile_id','instruction_sources','base_instructions','developer_instructions','environment'])||launch.cwd!==r.plan.cwd||!same(launch.environment,r.plan.environment))fail('PROTECTED_CODEX_COMPILED_LAUNCH_CHANGED');
 if(r.launch&&!same(r.launch,launch))fail('PROTECTED_CODEX_COMPILED_LAUNCH_CHANGED');
 if(!r.launch){if(r.consumed)fail('PROTECTED_CODEX_LAUNCH_CONSUMED');r.launch=copy(launch);}
}
export function assertOriginalProtectedCodexBoundary(owner,handle,stage){
 const r=record(owner,handle);if(typeof stage!=='string'||!stage)fail('PROTECTED_CODEX_STAGE_REQUIRED');
 if(['before_admission','before_context','before_turn','callback_guard','callback_execute','callback_inspect','before_software_prepare','software_prepare_current'].includes(stage)){if(r.context_interpreter)assertOriginalPeerContextRuntime(owner,handle,r.context_delivery,stage);if(r.plan.launch_mode==='companion-v2'){companionArmed(r);if(r.native_admission)currentNativeTask(r);if(['callback_guard','callback_execute','callback_inspect','before_software_prepare','software_prepare_current'].includes(stage)&&!r.backend.last_step)fail('PROTECTED_CODEX_FINAL_FACTS_HELD');}else beforeModel(r);}
 else if(stage==='physical_close'){
  if(r.plan.launch_mode==='companion-v2')fail('PROTECTED_CODEX_WHOLE_DOMAIN_CLOSURE_UNPROVED');
  if(!r.closed||r.unknown||r.backend_operations||!buildQualified(r))fail('PROTECTED_CODEX_WHOLE_DOMAIN_CLOSURE_HELD');
 }else if(r.stopping||r.closed||!['sealed','armed','born'].includes(r.state))fail('PROTECTED_CODEX_DOMAIN_INACTIVE');
 // A permitted preparation stage describes a sealed/armed enforcement path,
 // never an already-observed final instruction, tool or native auth fact.
}

function parseLine(bytes){return parseGatewayJSON(bytes,{max_bytes:MAX_FRAME,max_depth:32});}
function frameReader(r,kind,consume){
 let pending=Buffer.alloc(0);const decoder=new TextDecoder('utf-8',{fatal:true});
 return {data(chunk){
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);r.bytes[kind]+=bytes.length;
  if(r.bytes[kind]>MAX_WIRE)fail('PROTECTED_CODEX_WIRE_CAPACITY');
  // Fatal decoder validates chunk boundaries, while exact original bytes are
  // retained only until one bounded JSONL frame has been consumed.
  decoder.decode(bytes,{stream:true});let offset=0;
  while(offset<bytes.length){const at=bytes.indexOf(10,offset),end=at<0?bytes.length:at;
   if(pending.length+end-offset>MAX_FRAME)fail('PROTECTED_CODEX_FRAME_CAPACITY');
   pending=Buffer.concat([pending,bytes.subarray(offset,end)]);
   if(at<0)break;
   if(!pending.length||++r.frames[kind]>MAX_FRAMES)fail('PROTECTED_CODEX_FRAME_CAPACITY');
   const original=pending,value=parseLine(original);pending=Buffer.alloc(0);consume(value,original);offset=at+1;
  }
 },end(){decoder.decode();if(pending.length)fail('PROTECTED_CODEX_UNTERMINATED_FRAME');}};
}
function controlFrame(r,frame){
 if(!plain(frame))fail('PROTECTED_CODEX_CONTROL_FRAME');
 // This is the exact notification emitted by the original host protocol.
 // It deliberately has neither id nor params; no generic method wildcard is
 // implied by accepting this one initialized envelope.
 if(frame.method==='initialized'){if(!closed(frame,['method']))fail('PROTECTED_CODEX_CONTROL_FRAME');return;}
 if(!Object.hasOwn(frame,'method')){
  if(!closed(frame,['id','result'])&&!closed(frame,['id','error']))fail('PROTECTED_CODEX_CONTROL_FRAME');
  const key=idKey(frame.id);if(!r.pendingReplies.delete(key))fail('PROTECTED_CODEX_UNBOUND_TOOL_REPLY');return;
 }
 if(!closed(frame,['method','params','id'])&&!closed(frame,['method','params']))fail('PROTECTED_CODEX_CONTROL_FRAME');
 if(!controls.has(frame.method)||!plain(frame.params))fail('PROTECTED_CODEX_CONTROL_METHOD');
 if(Object.hasOwn(frame,'id'))idKey(frame.id);
 if(['thread/start','thread/resume'].includes(frame.method)){
  const launch=r.launch,p=frame.params;
  if(!launch||p.cwd!==r.plan.cwd||!same(p.runtimeWorkspaceRoots,[r.plan.cwd])||p.permissions!==launch.profile_id||p.approvalPolicy!=='never'||p.baseInstructions!==launch.base_instructions||p.developerInstructions!==launch.developer_instructions)fail('PROTECTED_CODEX_COMPILED_LAUNCH_CHANGED');
 }
 if(frame.method==='thread/start'){
  if(!same(frame.params.dynamicTools,stableTaskHostTools()))fail('PROTECTED_CODEX_FIVE_TOOLS_REQUIRED');
  if(frame.params.ephemeral!==false)fail('PROTECTED_CODEX_PERSISTENT_THREAD_REQUIRED');
 }
 if(frame.method==='thread/resume'&&['history','path','config'].some(key=>Object.hasOwn(frame.params,key)))fail('PROTECTED_CODEX_FOREIGN_RESUME');
 if(Object.hasOwn(frame,'id')){r.rpc??=new Map();const key=idKey(frame.id);if(r.rpc.has(key))fail('PROTECTED_CODEX_RPC_ID');r.rpc.set(key,{method:frame.method,params:copy(frame.params)});}
 if(frame.method==='turn/start'){if(r.context_interpreter){assertOriginalPeerContextRuntime(r.owner,r.facade_handle,r.context_delivery,'final_model_send');if(!same(frame.params.input,r.context_input))fail('PROTECTED_CODEX_CONTEXT_WIRE_CHANGED');}r.native_turn_input_text_sha256s=frame.params.input.map(item=>{if(item?.type!=='text'||typeof item.text!=='string')fail('PROTECTED_CODEX_INPUT_SHAPE');return digest(Buffer.from(item.text));});if(r.plan.launch_mode==='companion-v2')companionArmed(r);else beforeModel(r);}
}
function serverFrame(r,frame){
 if(!plain(frame))fail('PROTECTED_CODEX_SERVER_FRAME');
 if(!Object.hasOwn(frame,'method')&&Object.hasOwn(frame,'id')){
  const request=r.rpc?.get(idKey(frame.id));if(request){r.rpc.delete(idKey(frame.id));
   if(!frame.error&&['thread/start','thread/resume'].includes(request.method)){const native=frame.result?.thread?.id;if(!text(native))fail('PROTECTED_CODEX_NATIVE_THREAD');r.native_thread=native;}
   if(!frame.error&&request.method==='turn/start'){const turn=frame.result?.turn?.id;if(!text(turn))fail('PROTECTED_CODEX_NATIVE_TURN');r.native_turn=turn;maybeIssueNativePermit(r);}
  }
 }
 if(Object.hasOwn(frame,'method')&&Object.hasOwn(frame,'id')){
  if(frame.method!=='item/tool/call'||!plain(frame.params)||!toolNames.has(frame.params.tool))fail('PROTECTED_CODEX_UNEXPECTED_SERVER_CALL');
  const key=idKey(frame.id);if(r.pendingReplies.has(key))fail('PROTECTED_CODEX_TOOL_CALL_REPLAY');r.pendingReplies.add(key);r.original_native_tool_frames??=new Map();r.original_native_tool_frames.set(key,{frame:copy(frame),claimed:false});
 }
}
function observedNativeFinalRequest(r,envelope,raw){
 const parsed=parseOriginalControlFrame(raw);if(parsed.kind!=='observation'||!same(parsed.observation,envelope.observation))fail('PROTECTED_CODEX_BACKEND_FRAME');
 if(!closed(envelope,['binding_sha256','observation'])||!hash(envelope.binding_sha256)||!Buffer.isBuffer(raw))fail('PROTECTED_CODEX_BACKEND_FRAME');
 const prefix=Buffer.from('{"binding_sha256":"'+envelope.binding_sha256+'","observation":');
 if(raw.length<=prefix.length+1||!raw.subarray(0,prefix.length).equals(prefix)||raw.at(-1)!==125||digest(raw.subarray(prefix.length,-1))!==envelope.binding_sha256)fail('PROTECTED_CODEX_OBSERVATION_SERIALIZATION');
 const f=envelope.observation,keys=['protocol','kind','nonce','pid','sequence','source_commit','producer_module_sha256','tool_resource_sha256','host_instance_id','runtime_generation','profile_generation','services_generation','instruction_generation','thread_id','turn_id','step_id','auth_owner_generation','auth_revision','auth_send_epoch','runtime_id','request_id','gateway_instance_id','method','url','request_sha256','request_bytes','context_sha256','input_text_sha256s','ordered_instructions','ordered_instructions_sha256','profile','tools','provenance'];
 if(!closed(f,keys)||f.protocol!==PERMIT_PROTOCOL||f.kind!=='final_request'||f.nonce!==r.nonce||f.pid!==r.birth?.pid)fail('PROTECTED_CODEX_BACKEND_BINDING');
 const integer=key=>Number.isSafeInteger(f[key])&&f[key]>0,uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
 if(!['sequence','runtime_generation','profile_generation','services_generation','instruction_generation','step_id'].every(integer)||!['auth_owner_generation','auth_revision','auth_send_epoch'].every(k=>Number.isSafeInteger(f[k])&&f[k]>=0)||!['thread_id','turn_id'].every(k=>text(f[k]))||!(f.runtime_id===null||text(f.runtime_id))||!uuid(f.request_id)||!uuid(f.gateway_instance_id)||!Number.isSafeInteger(f.request_bytes)||f.request_bytes<1||f.request_bytes>MAX_WIRE||!['producer_module_sha256','tool_resource_sha256','request_sha256','context_sha256','ordered_instructions_sha256'].every(k=>hash(f[k]))||f.source_commit!=='c40729ea5cf8e947481b130c59807273eda2f8e9'||f.method!=='POST'||!plain(f.profile)||!Array.isArray(f.ordered_instructions)||!same(f.tools,expectedResponsesTools()))fail('PROTECTED_CODEX_FINAL_FACTS_HELD');
 let url;try{url=new URL(f.url);}catch{fail('PROTECTED_CODEX_NATIVE_GATEWAY_HELD');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/responses'))fail('PROTECTED_CODEX_NATIVE_GATEWAY_HELD');
 let index=-1;for(const item of f.ordered_instructions){if(!closed(item,['input_index','item'])||!Number.isSafeInteger(item.input_index)||item.input_index<=index||!plain(item.item)||!['system','developer'].includes(item.item.role))fail('PROTECTED_CODEX_FINAL_FACTS_HELD');index=item.input_index;}
 const previous=r.backend.native_final_observation;
 if(f.sequence!==(previous?.sequence??0)+1||previous&&f.runtime_generation===previous.runtime_generation&&(['profile','tools','ordered_instructions'].some((key,i)=>{const generation=['profile_generation','services_generation','instruction_generation'][i];return f[generation]!==previous[generation]+(same(f[key],previous[key])?0:1);})))fail('PROTECTED_CODEX_FINAL_GENERATION');
 // Actual FD3 data is retained as an observation before checking qualification.
 // Source self-hashes and a well-typed gateway UUID do not prove a built output,
 // original managed AuthManager, or complete original instruction-source provenance.
 r.backend.native_final_observation=copy(f);r.backend.native_binding_sha256=envelope.binding_sha256;
 if(!buildQualified(r))fail('PROTECTED_CODEX_BACKEND_BUILD_UNQUALIFIED');
 if(f.host_instance_id!==r.backend.original_host?.host_instance_id)fail('PROTECTED_CODEX_NATIVE_HOST_ASSOCIATION_HELD');
 r.backend.pending_final={facts:copy(f),binding:envelope.binding_sha256};maybeIssueNativePermit(r);
}
function currentNativeTask(r){
 const a=r.native_admission;if(!a||Object.getPrototypeOf(a.ledger)!==PeerLedger.prototype)fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
 return Reflect.apply(PeerLedger.prototype.read,a.ledger,[tx=>{
  const task=tx.get('tasks',a.task_id),t=task?.value,attempt=t?.attempt,p=t&&tx.get('principals',t.owner_principal_id),slot=task&&tx.get('slots',task.id),effect=attempt&&tx.get('effects',attempt.effect_id);
  if(t?.status!=='running'||p?.value.status!=='active'||!p.value.membership_qualification||!attempt||!same(attempt.context,a.context)||!model.validateContext(tx,a.context)||slot?.value.status!=='active'||slot.value.attempt_id!==attempt.id||effect?.value.kind!=='native'||effect.value.task_id!==task.id||effect.value.request_sha256!==attempt.request_sha256||!['reserved','sent'].includes(effect.value.status))fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
  const event=tx.events({after:effect.created_seq-1,limit:1}).items[0],changes=event?.payload?.changes?.filter(c=>c.family==='commands');
  if(event?.type!=='task/admit'||event.principal_id!=='scheduler'||changes?.length!==1)fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
  const c=changes[0],command=tx.getVersion({family:'commands',id:c.id,revision:c.revision,sha256:c.sha256}),result=command?.value?.result;
  if(command?.value?.action!=='task/admit'||command.value.principal_id!=='scheduler'||result?.admitted!==true||result.task.id!==task.id||result.task.value.attempt.id!==attempt.id||!same(result.context,a.context))fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
  const expiry=a.context.grant?.value?.expires_at;if(typeof expiry!=='string'||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now())fail('PROTECTED_CODEX_ADMISSION_EXPIRED');
  return {task_id:task.id,scope:t.scope,attempt_id:attempt.id,native_id:p.value.native_id,generation:p.value.generation,enrollment_id:p.value.enrollment_id,context_sha256:attempt.context.sha256};
 }]);
}
export function claimOriginalNativeMC23Frame(owner,handle,frame){
 const r=record(owner,handle);companionArmed(r);const current=currentNativeTask(r),original=r.original_native_tool_frames?.get(idKey(frame.id));
 const sent=r.backend.last_step,headers=r.backend.transport_headers?.find(h=>h.request_id===sent?.request_id&&h.status===200);
 if(!original||original.claimed||!same(original.frame,frame)||frame.params?.threadId!==r.native_thread||frame.params?.turnId!==r.native_turn||current.native_id!==r.native_thread||!headers||!r.native_turn_input_text_sha256s?.length||r.native_turn_input_text_sha256s.some(hash=>!sent.input_text_sha256s?.includes(hash)))fail('MC23_GENUINE_NATIVE_SOURCE_UNPROVED');
 original.claimed=true;const proof=Object.freeze(Object.create(null));nativeMC23Proofs.set(proof,{owner,launch:handle,frame:copy(frame),frame_sha256:digest(Buffer.from(canonical(frame))),binding:copy(current),process:copy(r.birth),model_request:copy(sent),actual_transport_headers:copy(headers)});return proof;
}
export function inspectOriginalNativeMC23Proof(owner,handle,proof){const r=nativeMC23Proofs.get(proof);if(!r||r.owner!==owner||r.launch!==handle)fail('MC23_ORIGINAL_NATIVE_PROOF_REQUIRED');return copy({frame:r.frame,frame_sha256:r.frame_sha256,binding:r.binding,process:r.process,model_request:r.model_request,actual_transport_headers:r.actual_transport_headers});}
export function bindOriginalProtectedTaskAdmission(owner,handle,ledger,task_id,context){
 const r=record(owner,handle);if(Object.getPrototypeOf(ledger)!==PeerLedger.prototype||!text(task_id))fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
 const next={ledger,task_id,context:copy(context)};if(r.native_admission&&(r.native_admission.ledger!==ledger||r.native_admission.task_id!==task_id||!same(r.native_admission.context,context)))fail('PROTECTED_CODEX_ADMISSION_REUSED');r.native_admission=next;currentNativeTask(r);
}
// This producer is reachable only by the trusted TaskHost, after the ORIGINAL
// launch has observed birth and correlated its native thread and turn. The
// reader retained by the incarnation module is synchronous private state only:
// it performs no ledger/provider I/O inside an effect's final COMMIT guard.
export function observeOriginalProtectedPeerExecutorIncarnation(owner,handle,source,{deadline_at_ms,readTurn}={}){
 const r=record(owner,handle),admission=r.native_admission;
 if(r.executor_incarnation||!source||typeof source.observe!=='function'||typeof readTurn!=='function'||!Number.isSafeInteger(deadline_at_ms)||!Number.isSafeInteger(r.execution_deadline_ms)||deadline_at_ms>r.execution_deadline_ms)fail('PROTECTED_CODEX_EXECUTOR_SOURCE_REQUIRED');
 companionArmed(r);
 if(r.backend.last_step?.thread_id!==r.native_thread||r.backend.last_step?.turn_id!==r.native_turn)fail('PROTECTED_CODEX_FINAL_FACTS_HELD');
 const admitted=currentNativeTask(r);
 const principal_id=Reflect.apply(PeerLedger.prototype.read,admission.ledger,[tx=>{
  const task=tx.get('tasks',admission.task_id),principal=task&&tx.get('principals',task.value.owner_principal_id);
  if(task?.value.attempt?.id!==admitted.attempt_id||principal?.value.native_id!==admitted.native_id||principal.value.generation!==admitted.generation)fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
  return principal.id;
 }]);
 const association={task_id:admitted.task_id,attempt_id:admitted.attempt_id,context_sha256:admitted.context_sha256,principal_id,generation:admitted.generation,native_id:admitted.native_id,turn_id:r.native_turn,process:{pid:r.birth?.pid,started_at:r.birth?.at},deadline_at_ms};
 const current=()=>{
  if(r.native_admission!==admission||r.state!=='born'||r.stopping||r.failed||r.exit_observed||r.close||r.closed||!r.child||r.child.exitCode!==null&&r.child.exitCode!==undefined||typeof r.child.signalCode==='string'||r.native_thread!==association.native_id||r.native_turn!==association.turn_id||r.birth?.pid!==association.process.pid||r.birth?.at!==association.process.started_at)fail('PROTECTED_CODEX_EXECUTOR_INACTIVE');
  const turn=readTurn();
  if(!turn||turn.state!=='running'||turn.yield_requested||turn.hold||turn.native_id!==association.native_id||turn.turn_id!==association.turn_id||turn.attempt_id!==association.attempt_id||turn.principal_id!==association.principal_id)fail('PROTECTED_CODEX_EXECUTOR_TURN_CHANGED');
  return association;
 };
 const incarnation=source.observe(association,current);r.executor_incarnation=incarnation;return incarnation;
}
function currentNativeMembership(r){
 const a=r.membership_admission;if(!a||Object.getPrototypeOf(a.ledger)!==PeerLedger.prototype)fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
 return Reflect.apply(PeerLedger.prototype.read,a.ledger,[tx=>{
  const held=()=>fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD'),rowRef=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256}),retained=new Set();let retainedBytes=0;
  const retain=(family,row)=>{const key=canonical(rowRef(family,row));if(!retained.has(key)){retained.add(key);retainedBytes+=Buffer.byteLength(canonical({family,...row}));if(retainedBytes>model.REVIEW_PREPARATION_BYTES)held();}return row;};
  const exactRow=reference=>{if(!closed(reference,['family','id','revision','sha256']))held();const row=tx.get(reference.family,reference.id);if(!row||!same(rowRef(reference.family,row),reference))held();return retain(reference.family,row);};
  const p=tx.get('work_items',a.phase.id),v=p?.value,initial=a.phase.value,e=v&&tx.get('work_items','membership:'+v.membership_id),c=tx.get('control','company');
  if(!p||v.kind!=='membership_phase'||!['reserved','running'].includes(v.status)||v.result_ref||initial?.status!=='reserved'||initial.result_ref||!['reconstruction','review'].includes(v.phase)||['membership_id','phase','attempt_id','principal_id','generation','execution_id'].some(key=>v[key]!==initial[key])||!same(v.context_ref,initial.context_ref)||!same(v.principal_ref,initial.principal_ref)||e?.value.kind!=='membership_enrollment'||e.value.status!=='pending'||e.value.enrollment_id!==v.membership_id||c?.value.protocol!=='peer-cos-v1'||c.value.paused)held();
  const enrollment=e.value;if(!closed(enrollment.operator_ref,['family','id','revision','sha256'])||enrollment.operator_ref.family!=='principals')held();
  const connection={company_id:a.ledger.company_id,root_sha256:digest(Buffer.from(a.ledger.root))},operator=tx.get('principals',enrollment.operator_ref.id),index=tx.get('work_items','membership-index:'+enrollment.principal_id),member=tx.get('principals',enrollment.principal_id);
  if(enrollment.connection_sha256!==digest(Buffer.from(canonical(connection)))||operator?.value.kind!=='founder'||operator.value.status!=='active'||c.value.founder_principal_id!==operator.id||!same(rowRef('principals',operator),enrollment.operator_ref)||enrollment.policy_sha256!==digest(Buffer.from(canonical(c.value)))||enrollment.policy_generation!==c.value.policy_generation||enrollment.pause_generation!==c.value.pause_generation||index?.value.enrollment_id!==enrollment.enrollment_id)held();
  if(enrollment.base_principal){if(!member||member.value.status!=='active'||!same(rowRef('principals',member),enrollment.base_principal))held();}
  else if(member?.value.status!=='pending'||member.value.generation!==enrollment.generation||member.value.enrollment_id!==enrollment.enrollment_id)held();
  const principal=tx.get('principals',v.principal_id);
  if(!principal||!same(rowRef('principals',principal),v.principal_ref)||v.phase==='reconstruction'&&(v.principal_id!==enrollment.principal_id||v.generation!==enrollment.generation)||v.phase==='review'&&(!['active','pending'].includes(principal.value.status)||v.generation!==principal.value.generation))held();
  const context=exactRow(v.context_ref),cv=context.value;
  if(v.context_ref.family!=='work_items'||cv.kind!=='membership_context'||typeof cv.text!=='string'||cv.sha256!==digest(Buffer.from(cv.text))||cv.membership_id!==v.membership_id||cv.principal_id!==v.principal_id)held();
  const {used_model_calls,...stableEnrollment}=enrollment;
  if(cv.enrollment_sha256!==digest(Buffer.from(canonical(stableEnrollment))))held();
  // Match the owning membership service's complete pending-recovery cut. Read
  // CURRENT exact references, never historical replacements; keep the original
  // 10,000-row and encoded preparation bounds on this read-only guard.
  const history=[],seen=new Set();let next=enrollment.recovered_from;
  while(next){
   const key=canonical(next);if(seen.has(key)||history.length>=10000)held();seen.add(key);const old=exactRow(next);
   if(old.value.kind!=='membership_enrollment'||old.value.status!=='revoked'||old.value.principal_id!==enrollment.principal_id||old.value.connection_sha256!==enrollment.connection_sha256)held();
   const phases=[];for(const name of ['reconstruction','review']){
    const previous=tx.get('work_items','membership-phase:'+old.value.enrollment_id+':'+name);if(!previous)continue;retain('work_items',previous);
    const cut=exactRow(previous.value.context_ref),result=previous.value.result_ref?exactRow(previous.value.result_ref):null;
    if(cut.value.kind!=='membership_context'||typeof cut.value.text!=='string'||cut.value.sha256!==digest(Buffer.from(cut.value.text)))held();
    phases.push({reference:rowRef('work_items',previous),value:previous.value,assignment:{context_ref:previous.value.context_ref,sha256:cut.value.sha256,text:cut.value.text},result:result?{reference:rowRef('work_items',result),value:result.value}:null});
   }
   history.push({reference:next,enrollment:old.value,phases});next=old.value.recovered_from;
  }
  if(cv.recovery_sha256!==digest(Buffer.from(canonical(history))))held();
  const snapshot=model.membershipPolicyEvidence(tx,{principal_id:enrollment.principal_id,scope:enrollment.scope,input_refs:enrollment.input_refs,enrollment_id:enrollment.enrollment_id});
  if(cv.source_cut_sha256!==snapshot.sha256)held();
  const slot=tx.get('slots',v.execution_id),effect=tx.get('effects',v.execution_id),event=tx.events({after:p.created_seq-1,limit:1}).items[0],commands=event?.payload?.changes?.filter(change=>change.family==='commands');
  if(slot?.value.kind!=='membership_execution'||slot.value.status!=='active'||slot.value.membership_id!==v.membership_id||slot.value.principal_id!==v.principal_id||slot.value.attempt_id!==v.attempt_id||effect?.value.kind!=='membership_execution'||effect.value.membership_id!==v.membership_id||effect.value.principal_id!==v.principal_id||effect.value.attempt_id!==v.attempt_id||!['reserved','sent'].includes(effect.value.status)||event?.type!=='membership/admit'||event.principal_id!=='operator'||commands?.length!==1||!event.payload.changes.some(change=>change.family==='work_items'&&change.id===p.id&&change.revision===a.phase.revision&&change.sha256===a.phase.sha256))held();
  const change=commands[0],command=tx.getVersion({family:'commands',id:change.id,revision:change.revision,sha256:change.sha256}),result=command?.value?.result;
  if(command?.value?.kind!=='membership_command'||command.value.channel!=='operator'||command.value.principal_id!==operator.id||!result?.phase||!same(rowRef('work_items',result.phase),rowRef('work_items',a.phase))||!same(result.phase.value,a.phase.value)||result.context?.sha256!==cv.sha256||!same(result.context?.context_ref,v.context_ref))held();
  if(v.status==='running'){
   if(!r.birth||!text(v.native_id)||!v.process||v.process.pid!==r.birth.pid||v.process.started_at!==r.birth.at||r.native_thread&&r.native_thread!==v.native_id)held();
  }else if(v.native_id!==null||v.process!==null)held();
  // Terminal cutoff after all provider, history, current-policy and identity
  // reads. An expired original enrollment never admits a final request.
  if(typeof enrollment.expires_at!=='string'||!Number.isFinite(Date.parse(enrollment.expires_at))||Date.parse(enrollment.expires_at)<=Date.now())fail('PROTECTED_CODEX_ADMISSION_EXPIRED');
  return {membership_id:v.membership_id,phase:v.phase,attempt_id:v.attempt_id,native_id:v.native_id,context_sha256:cv.sha256,scope:enrollment.scope};
 }]);
}
function currentNativeAuthority(r){return r.native_admission?currentNativeTask(r):currentNativeMembership(r);}
export function bindOriginalProtectedMembershipAdmission(owner,handle,ledger,reference){
 const r=record(owner,handle);if(r.consumed||r.native_admission||r.membership_admission||Object.getPrototypeOf(ledger)!==PeerLedger.prototype||reference?.family!=='work_items')fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');
 const phase=Reflect.apply(PeerLedger.prototype.read,ledger,[tx=>tx.getVersion(reference)]);if(!phase)fail('PROTECTED_CODEX_ORIGINAL_ADMISSION_HELD');r.membership_admission={ledger,phase};currentNativeMembership(r);
}
function maybeIssueNativePermit(r){
 const pending=r.backend.pending_final;if(!pending)return;companionArmed(r);
 const f=pending.facts,slot=r.plan.companion_slot,expected=slot.native_context_contract?.final_request_contract;
 // Missing original source spans/catalog origins remain UNKNOWN, never complete:true.
 if(!closed(f.provenance,['original_sampling_input_sha256','sources','unknown_origins'])||!hash(f.provenance.original_sampling_input_sha256)||!plain(f.provenance.sources)||!Array.isArray(f.provenance.unknown_origins)||f.provenance.unknown_origins.length)fail('PROTECTED_CODEX_INSTRUCTION_ORIGIN_UNKNOWN');
 if(expected?.mode==='original-live-scoped-source'){
  const initial=r.backend.original_host?.sources;
  if(f.url!==slot.native_context_contract.upstream_url||f.producer_module_sha256!==expected.producer_module_sha256||f.tool_resource_sha256!==expected.tool_resource_sha256||f.auth_owner_generation!==initial?.auth_owner_generation||f.auth_revision<initial.auth_revision)fail('PROTECTED_CODEX_REVIEWED_FINAL_CONTRACT_HELD');
  // These facts come from the actual source-associated Rust owner and its live
  // Session projection, not a caller's prospective profile hash. The original
  // runtime's selected profile stays fixed for this bounded launch.
  const profile=digest(Buffer.from(canonical(f.profile)));if(r.backend.live_profile&&r.backend.live_profile!==profile)fail('PROTECTED_CODEX_FINAL_GENERATION');r.backend.live_profile=profile;
 }else if(!expected||!hash(expected.profile_sha256)||!hash(expected.sources_sha256)||digest(Buffer.from(canonical(f.profile)))!==expected.profile_sha256||digest(Buffer.from(canonical(f.provenance.sources)))!==expected.sources_sha256||f.url!==slot.native_context_contract.upstream_url||f.producer_module_sha256!==expected.producer_module_sha256||f.tool_resource_sha256!==expected.tool_resource_sha256)fail('PROTECTED_CODEX_REVIEWED_FINAL_CONTRACT_HELD');
 if(!Array.isArray(f.input_text_sha256s)||!r.native_turn_input_text_sha256s?.length||r.native_turn_input_text_sha256s.some(hash=>!f.input_text_sha256s.includes(hash)))fail('PROTECTED_CODEX_ORIGINAL_CONTEXT_DELIVERY_HELD');
 const task=currentNativeAuthority(r);if(!r.native_turn){if([...r.rpc?.values()??[]].some(v=>v.method==='turn/start'))return;fail('PROTECTED_CODEX_NATIVE_TURN');}
 if(f.thread_id!==r.native_thread||f.thread_id!==task.native_id||f.turn_id!==r.native_turn||expected.mode!=='original-live-scoped-source'&&f.context_sha256!==expected.final_context_sha256)fail('PROTECTED_CODEX_NATIVE_TASK_BINDING');
 r.backend.used_requests??=new Set();if(r.backend.used_requests.has(f.request_id)||r.backend_operations)fail('PROTECTED_CODEX_SEND_REPLAY_OR_UNKNOWN');
 r.backend.used_requests.add(f.request_id);r.backend.pending_final=null;r.backend_operations++;r.backend.last_step={thread_id:f.thread_id,turn_id:f.turn_id,request_sha256:f.request_sha256,request_id:f.request_id,gateway_instance_id:f.gateway_instance_id,input_text_sha256s:copy(f.input_text_sha256s)};
 const permit={protocol:PERMIT_PROTOCOL,kind:'send_permit',nonce:r.nonce,pid:r.birth.pid,sequence:f.sequence,binding_sha256:pending.binding,request_sha256:f.request_sha256,request_id:f.request_id,gateway_instance_id:f.gateway_instance_id};
 // Reservation precedes the write; write failure cannot make this request reusable.
 r.child.stdio[4].write(JSON.stringify(permit)+'\n',error=>{if(error){r.unknown=true;r.code='PROTECTED_CODEX_PERMIT_WRITE_UNKNOWN';try{r.facade.kill('SIGTERM');}catch{}}});
}
function backendFrame(r,frame,raw){
 if(frame?.kind==='host_bootstrap'){
  if(r.control_transcript)r.control_transcript.acceptFrame(raw);
  const keys=['protocol','kind','nonce','pid','slot_id','executable_sha256','source_manifest_sha256','original_home_sha256','state_root','cwd','host_instance_id','sources',...(r.plan.companion_slot?.scope_policy==='V5_ORIGINAL_MANAGED_PRIVATE_FD'?['loopback_proxy_port']:[])];
  if(!closed(frame,keys)||frame.protocol!==PERMIT_PROTOCOL||frame.nonce!==r.nonce||frame.pid!==r.birth?.pid||r.backend.original_host||!plain(frame.sources))fail('PROTECTED_CODEX_BOOTSTRAP_FRAME');
  r.backend.original_host=copy(frame);companionArmed(r);r.unknown=false;r.release_original_stdout?.();return;
 }
 if(frame?.kind==='transport_headers'){
  if(!closed(frame,['protocol','kind','nonce','pid','sequence','request_id','gateway_instance_id','status'])||frame.protocol!==PERMIT_PROTOCOL||frame.nonce!==r.nonce||frame.pid!==r.birth?.pid||frame.request_id!==r.backend.last_step?.request_id||frame.gateway_instance_id!==r.backend.last_step?.gateway_instance_id||frame.sequence!==r.backend.native_final_observation?.sequence||!Number.isSafeInteger(frame.status)||frame.status<100||frame.status>599||!r.backend_operations)fail('PROTECTED_CODEX_TRANSPORT_OBSERVATION');
  r.backend.transport_headers??=[];if(r.backend.transport_headers.some(h=>h.request_id===frame.request_id))fail('PROTECTED_CODEX_TRANSPORT_OBSERVATION_REPLAY');r.backend.transport_headers.push(copy(frame));r.release_original_stdout?.();return;
 }
 if(frame?.kind==='local_body_eof'){
  if(!closed(frame,['protocol','kind','request_id','sequence','pid','remote_domain_closed'])||frame.protocol!==PERMIT_PROTOCOL||frame.pid!==r.birth?.pid||frame.remote_domain_closed!==false||!r.backend_operations||frame.request_id!==r.backend.last_step?.request_id||frame.sequence!==r.backend.native_final_observation?.sequence)fail('PROTECTED_CODEX_BACKEND_CLOSE_REPLAY');
  r.backend_operations--;r.backend.local_body_eof=copy(frame);return;
 }
 if(plain(frame)&&Object.hasOwn(frame,'observation')){if(frame.observation?.kind==='scoped_context_contract')return observedScopedContextContract(r,frame,raw);return observedNativeFinalRequest(r,frame,raw);}
 if(!plain(frame)||frame.protocol!==PROTOCOL||frame.nonce!==r.nonce||frame.pid!==r.birth?.pid)fail('PROTECTED_CODEX_BACKEND_BINDING');
 if(frame.kind==='hello'){
  if(!closed(frame,['protocol','kind','nonce','pid','build'])||!closed(frame.build,['source_commit','patch_sha256','executable_sha256'])||!text(frame.build.source_commit)||!hash(frame.build.patch_sha256)||!hash(frame.build.executable_sha256)||r.backend.hello)fail('PROTECTED_CODEX_BACKEND_FRAME');
  r.backend.hello=copy(frame);
  if(!QUALIFIED_BACKEND_BUILD||!same(frame.build,QUALIFIED_BACKEND_BUILD))fail('PROTECTED_CODEX_BACKEND_BUILD_UNQUALIFIED');
 }else if(frame.kind==='model_request'){
  const keys=['protocol','kind','nonce','pid','sequence','thread_id','turn_id','step_id','request_sha256','request_bytes','tools','ordered_instructions_sha256','context_sha256','profile_generation','services_generation'];
  if(!closed(frame,keys)||!Number.isSafeInteger(frame.sequence)||frame.sequence!==r.backend.sequence+1||!['thread_id','turn_id','step_id'].every(key=>text(frame[key]))||!['request_sha256','ordered_instructions_sha256','context_sha256'].every(key=>hash(frame[key]))||!Number.isSafeInteger(frame.request_bytes)||frame.request_bytes<1||frame.request_bytes>MAX_WIRE||!['profile_generation','services_generation'].every(key=>Number.isSafeInteger(frame[key])&&frame[key]>0))fail('PROTECTED_CODEX_BACKEND_FRAME');
  if(!same(frame.tools,expectedResponsesTools()))fail('PROTECTED_CODEX_FIVE_TOOLS_REQUIRED');
  // Well-typed data from an unqualified stock/build source cannot qualify it.
  if(!buildQualified(r))fail('PROTECTED_CODEX_BACKEND_BUILD_UNQUALIFIED');
  r.backend.sequence=frame.sequence;r.backend.last_step={thread_id:frame.thread_id,turn_id:frame.turn_id,step_id:frame.step_id,request_sha256:frame.request_sha256};
 }else fail('PROTECTED_CODEX_BACKEND_FRAME');
}

/** Spawn the exact compiled executable/argv/env in its original OS policy. */
export function spawnOriginalProtectedCodex(owner,handle){
 const r=record(owner,handle);if(r.consumed||r.stopping)fail('PROTECTED_CODEX_LAUNCH_CONSUMED');r.facade_handle=handle;if(r.context_interpreter&&(!r.context_delivery||!r.context_input))fail('PROTECTED_CODEX_CONTEXT_DELIVERY_HELD');
 if(r.plan.companion_slot?.scope_policy==='V5_ORIGINAL_MANAGED_PRIVATE_FD'){if(!r.connect_broker||r.connect_broker.port!==r.plan.gateway_port)fail('PROTECTED_CODEX_NATIVE_GATEWAY_HELD');currentNativeAuthority(r);}
 r.consumed=true;r.state='armed';r.execution_deadline_ms=Date.now()+TOTAL_MS;
 let plan;try{plan=claimOriginalCompiledCodexPlan(owner,r.compiledPlan);r.plan=plan;}catch(error){r.state='unknown';r.code='PROTECTED_CODEX_PLAN_HELD';throw error;}
 const facade=new EventEmitter();r.facade=facade;facades.set(facade,r);
 // Own an error sink before any child/provider can emit. Registered consumers
 // still receive every error; an early construction failure cannot become an
 // unhandled EventEmitter exception or a false physical-close observation.
 facade.on('error',()=>{});
 const later=(fn,ms)=>{const timer=setTimeout(()=>{r.timers.delete(timer);fn();},ms);r.timers.add(timer);};
 const clear=()=>{for(const timer of r.timers)clearTimeout(timer);r.timers.clear();};
 // Retain the original ChildProcess and latch exit. Never reacquire a numeric
 // process/group identity after leader exit or reap; group closure stays unknown.
 const signal=name=>{if(!r.child||r.close||r.exit_observed||Number.isInteger(r.child.exitCode)||typeof r.child.signalCode==='string')return;try{r.child.kill(name);}catch{r.code??='PROTECTED_CODEX_SIGNAL_UNKNOWN';}};
 function stop(code='PROTECTED_CODEX_STOPPED'){
  if(r.stopping||r.closed)return;r.stopping=true;r.code??=code;
  try{r.control_transcript?.closeUnknown(code==='PROTECTED_CODEX_DEADLINE'?'timeout':'cancelled');}catch{}void r.connect_broker?.close();
  if(r.close)return;
  try{r.child?.stdin?.end();r.child?.stdio?.[4]?.end();}catch{r.code??='PROTECTED_CODEX_STDIN_UNKNOWN';}
  later(()=>{signal('SIGTERM');later(()=>{signal('SIGKILL');later(()=>{if(!r.close){r.state='unknown';r.unknown=true;facade.emit('error',Object.assign(Error('PROTECTED_CODEX_CLOSURE_UNKNOWN'),{code:'PROTECTED_CODEX_CLOSURE_UNKNOWN'}));}},KILL_MS);},TERM_MS);},GRACE_MS);
 }
 const hold=error=>{const code=safeError(error);r.failed=true;r.unknown=true;r.closed=false;if(r.close)r.state='unknown';stop(code);facade.emit('error',Object.assign(Error(code),{code}));};
 const originalClose=(code,exitSignal)=>{
  try{r.control_transcript?.closeUnknown('closed');}catch{}void r.connect_broker?.close();
  r.close={code:Number.isInteger(code)?code:null,signal:exitSignal??null};clear();
  r.local_process_closed=r.exit_observed&&r.stdout_eof&&r.stderr_eof&&r.witness_eof&&r.child_stdin_closed&&r.control_closed&&r.pendingReplies.size===0&&r.backend_operations===0;
  r.group_absent=null;r.closed=false;
  r.unknown=!r.closed||!buildQualified(r);r.state=r.closed?'closed':'unknown';facade.emit('close',code,exitSignal);
 };
 try{
  // No caller-supplied spawn, executable, argv, env, proof or stdio is used.
  // FDs3/4 are private observer/control pipes, never model tools or inherited
  // secrets. Stock has no qualified producer and cannot pass beforeModel.
  const child=spawn(plan.sandbox_executable,['-p',plan.sbpl,plan.executable,...plan.argv],{cwd:plan.cwd,env:copy(plan.environment),stdio:['pipe','pipe','pipe','pipe','pipe'],shell:false,detached:true});r.child=child;
  // Node may return an original ChildProcess with missing stdio and emit its
  // EAGAIN/ENOENT/EMFILE error later. Observe that original object before any
  // stream-shape validation or wrapper construction can throw.
  if(typeof child?.on==='function')child.on('error',hold);
  if(typeof child?.once==='function')child.once('exit',(code,signal)=>{r.exit_observed=true;r.original_exit={code:Number.isInteger(code)?code:null,signal:signal??null};void r.connect_broker?.close();});
  if(typeof child?.once==='function')child.once('close',originalClose);
  const watched=new WeakSet();
  for(const stream of [child?.stdin,child?.stdout,child?.stderr,...(Array.isArray(child?.stdio)?child.stdio:[])]){
   if(stream&&typeof stream.on==='function'&&!watched.has(stream)){watched.add(stream);stream.on('error',hold);}
  }
  if(!child?.once||!child.stdin?.write||!child.stdout?.on||!child.stderr?.on||!child.stdio?.[3]?.on||!child.stdio?.[4]?.write)fail('PROTECTED_CODEX_CHILD_UNKNOWN');
  const companion=r.plan.launch_mode==='companion-v2',forwarded=companion?new PassThrough({highWaterMark:MAX_FRAME}):null;
  if(forwarded)forwarded.on('error',hold);
  const originalFrames=[];let originalOutputEnded=false;
  function releaseOriginalStdout(){
   if(!companion||r.failed||r.stopping)return;
   while(originalFrames.length){const first=originalFrames[0];
    // FD3 and stdout have independent delivery order. Wait for ORIGINAL observations,
    // retaining exact original JSONL bytes and FIFO; never infer a witness from output.
    if(!r.backend.original_host||r.context_interpreter&&!r.backend.context_contract_acked)return;
    if(first.frame.method==='item/tool/call'&&!r.backend.transport_headers?.some(h=>h.request_id===r.backend.last_step?.request_id&&h.status===200))return;
    originalFrames.shift();if(forwarded.writableLength+first.bytes.length>MAX_WIRE)fail('PROTECTED_CODEX_WIRE_CAPACITY');forwarded.write(first.bytes);
   }
   if(originalOutputEnded)forwarded.end();
  }
  r.release_original_stdout=releaseOriginalStdout;
  const output=frameReader(r,'stdout',(frame,raw)=>{serverFrame(r,frame);if(companion){originalFrames.push({frame,bytes:Buffer.concat([raw,Buffer.from('\n')])});releaseOriginalStdout();}}),witness=frameReader(r,'witness',(frame,raw)=>backendFrame(r,frame,raw));
  const stdin=new Writable({write(chunk,_encoding,done){try{
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);r.bytes.control+=bytes.length;
   if(r.bytes.control>MAX_WIRE||bytes.length<2||bytes.length>MAX_FRAME||bytes.at(-1)!==10||bytes.subarray(0,-1).includes(10)||++r.frames.control>MAX_FRAMES)fail('PROTECTED_CODEX_CONTROL_CAPACITY');
   const frame=parseLine(bytes.subarray(0,-1));controlFrame(r,frame);child.stdin.write(bytes,done);if(frame.method==='initialize'&&r.control_transcript)r.control_transcript.noteInitializeSent();
  }catch(error){done(error);stop(safeError(error));}},final(done){try{child.stdin.end(done);}catch(error){done(error);stop(safeError(error));}}});
  stdin.on('finish',()=>{r.stdin_finished=true;});stdin.on('error',error=>stop(safeError(error)));
  facade.stdin=stdin;facade.stdout=forwarded??child.stdout;facade.stderr=child.stderr;
  facade.kill=name=>{if(!['SIGTERM','SIGKILL'].includes(name))fail('PROTECTED_CODEX_SIGNAL');stop('PROTECTED_CODEX_STOPPED');signal(name);return true;};
  Object.defineProperty(facade,'pid',{enumerable:true,get:()=>r.birth?.pid??child.pid});
  child.stdin.on('close',()=>{r.child_stdin_closed=true;});child.stdout.on('data',chunk=>{try{output.data(chunk);}catch(error){hold(error);}});child.stderr.on('data',chunk=>{r.bytes.stderr+=chunk.length;if(r.bytes.stderr>MAX_WIRE)hold(Object.assign(Error('PROTECTED_CODEX_WIRE_CAPACITY'),{code:'PROTECTED_CODEX_WIRE_CAPACITY'}));});
  child.stdout.on('end',()=>{try{output.end();r.stdout_eof=true;originalOutputEnded=true;releaseOriginalStdout();}catch(error){hold(error);}});child.stderr.on('end',()=>{r.stderr_eof=true;});
  child.stdio[3].on('data',chunk=>{try{witness.data(chunk);}catch(error){hold(error);}});child.stdio[3].on('end',()=>{try{witness.end();r.witness_eof=true;}catch(error){hold(error);}});child.stdio[4].on('close',()=>{r.control_closed=true;});
  child.once('spawn',()=>{try{
   if(!Number.isSafeInteger(child.pid)||child.pid<1)fail('PROTECTED_CODEX_BIRTH_UNKNOWN');
   r.birth={pid:child.pid,at:new Date().toISOString(),executable_sha256:plan.executable_pin.sha256,policy_sha256:plan.policy_sha256};r.state='born';
   if(r.plan.launch_mode==='companion-v2'){
    if(!companionBuild(r))fail('PROTECTED_CODEX_BACKEND_BUILD_UNQUALIFIED');const slot=r.plan.companion_slot,c=slot.native_context_contract;
    if(!c||!hash(c.original_home_sha256)||typeof c.upstream_url!=='string')fail('PROTECTED_CODEX_NATIVE_HOST_ASSOCIATION_HELD');
    if(r.context_interpreter){const route=slot.scope_policy==='V5_ORIGINAL_MANAGED_PRIVATE_FD'?{loopback_proxy_port:r.connect_broker?.port}:{};if(Object.hasOwn(route,'loopback_proxy_port')&&route.loopback_proxy_port!==plan.gateway_port)fail('PROTECTED_CODEX_NATIVE_GATEWAY_HELD');r.control_transcript=createOriginalControlTranscript({nonce:r.nonce,pid:child.pid,slot_id:slot.slot_id,executable_sha256:slot.executable_sha256,source_manifest_sha256:slot.source_manifest_sha256,state_root:plan.state_root,cwd:plan.cwd,original_home_sha256:c.original_home_sha256,upstream_url:c.upstream_url,...route});child.stdio[4].write(r.control_transcript.challengeBytes());}
    else child.stdio[4].write(JSON.stringify({protocol:PERMIT_PROTOCOL,kind:'challenge',nonce:r.nonce,pid:child.pid,slot_id:slot.slot_id,executable_sha256:slot.executable_sha256,source_manifest_sha256:slot.source_manifest_sha256,state_root:plan.state_root,cwd:plan.cwd,original_home_sha256:c.original_home_sha256,upstream_url:c.upstream_url})+'\n');
   }else child.stdio[4].write(JSON.stringify({protocol:PROTOCOL,kind:'challenge',nonce:r.nonce,pid:child.pid})+'\n');facade.emit('spawn');
  }catch(error){hold(error);}});
  later(()=>stop('PROTECTED_CODEX_DEADLINE'),TOTAL_MS);
 }catch(error){r.state='unknown';r.unknown=true;r.code=safeError(error);if(r.child)stop(r.code);queueMicrotask(()=>facade.emit('error',Object.assign(Error(r.code),{code:r.code})));}
 return facade;
}
export function inspectOriginalProtectedCodexLaunch(owner,handle){
 const r=record(owner,handle);
 return copy({protocol:'original-protected-codex-domain-v1',state:r.state,consumed:r.consumed,birth:r.birth,close:r.close,code:r.code,
  bytes:r.bytes,frames:r.frames,local_stdio_closed:{stdout:r.stdout_eof,stderr:r.stderr_eof,witness:r.witness_eof,stdin:r.child_stdin_closed,control:r.control_closed},
  original_group_absent:r.group_absent,original_exit_observed:Boolean(r.exit_observed),original_exit:r.original_exit??null,local_process_and_streams_closed:r.local_process_closed===true,connect_broker:r.connect_broker_closure??r.connect_broker?.inspect()??null,local_domain_closed:r.closed,whole_domain_qualified:false,
  pending_tool_replies:r.pendingReplies.size,backend_operations:r.backend_operations,backend_hello_observed:Boolean(r.backend.hello),
  actual_backend_source_build_qualified:buildQualified(r),native_auth_context_qualified:r.backend.native_auth_context_qualified,
  final_request_observed:Boolean(r.backend.last_step),native_final_serialization_observed:Boolean(r.backend.native_final_observation),native_final_observation_qualified:false,native_host_observation:r.backend.original_host??null,native_transport_headers:r.backend.transport_headers??[],native_turn_input_text_sha256s:r.native_turn_input_text_sha256s??[],native_last_permitted_request:r.backend.last_step??null,scope_state_root:r.plan.state_root,scope_scratch_root:r.plan.scratch_root,
  source_boundary:'Source-associated original process/FD/transport observations only. Group and remote-domain closure, native acceptance and retry permission remain unproved.'});
}

/** Request cleanup of the original owned child. No returned Boolean implies close. */
export function requestOriginalProtectedCodexStop(owner,handle){
 const r=record(owner,handle);
 if(!r.facade&&!r.consumed){r.stopping=true;r.code??='PROTECTED_CODEX_STOPPED_BEFORE_SPAWN';void r.connect_broker?.close();}
 if(r.facade&&!r.closed&&!r.stopping)r.facade.kill('SIGTERM');
 return inspectOriginalProtectedCodexLaunch(owner,handle);
}

// Fixed provider composition may copy the original compiled launch DATA. This
// does not expose an issuer, change the plan or attest native qualification.
export function originalProtectedPeerLaunchConfiguration(owner,handle){
 const r=record(owner,handle);return Object.freeze({cwd:r.plan.cwd,environment:Object.freeze(copy(r.plan.environment))});
}


/** Original private delivery binding, before birth. No caller JSON record can
 * replace the slot/interpreter/plan WeakMap identities; support is not authority. */
export function bindOriginalProtectedPeerContext(owner,handle,delivery,instruction){
 const r=record(owner,handle),interpreter=originalPeerContextDeliveryInterpreter(delivery);
 if(r.consumed||!r.context_interpreter||interpreter!==r.context_interpreter||r.context_delivery&&r.context_delivery!==delivery)fail('PROTECTED_CODEX_CONTEXT_DELIVERY_HELD');
 assertOriginalPeerContextSlot(interpreter,r.plan.companion_slot);const prepared=inspectOriginalPeerContextDelivery(delivery),input=peerContextTurnInput(instruction,prepared.frame_text);if(r.context_input&&!same(r.context_input,input))fail('PROTECTED_CODEX_CONTEXT_WIRE_CHANGED');r.context_delivery=delivery;r.context_input=input;
}
export function originalProtectedPeerContextInterpreter(owner,handle){return record(owner,handle).context_interpreter;}
export function assertOriginalPeerContextRuntime(owner,handle,delivery,stage){
 const r=record(owner,handle);
 if(!['before_admission','before_context','before_turn','callback_guard','callback_execute','callback_inspect','before_software_prepare','software_prepare_current','final_model_send'].includes(stage)||!r.context_interpreter||r.context_delivery!==delivery||originalPeerContextDeliveryInterpreter(delivery)!==r.context_interpreter)fail('PROTECTED_CODEX_CONTEXT_RUNTIME_HELD');
 assertOriginalPeerContextInterpreterFinal(r.context_interpreter);assertOriginalPeerContextSlot(r.context_interpreter,r.plan.companion_slot);
 companionArmed(r);if(!r.context_input)fail('PROTECTED_CODEX_CONTEXT_WIRE_CHANGED');if(r.native_admission){const current=currentNativeTask(r),prepared=inspectOriginalPeerContextDelivery(delivery);if(prepared.payload_sha256!==current.context_sha256||prepared.payload_protocol!==r.native_admission.context.protocol)fail('PROTECTED_CODEX_CONTEXT_PAYLOAD_CHANGED');}
 const observation=r.backend.context_contract_observation;
 if(!r.backend.context_contract_attempted||!r.backend.context_contract_acked||!observation||observation.pid!==r.birth?.pid||observation.host_instance_id!==r.backend.original_host?.host_instance_id||r.backend.context_contract_binding!==digest(r.backend.context_contract_raw))fail('PROTECTED_CODEX_CONTEXT_RUNTIME_HELD');
}
function observedScopedContextContract(r,envelope,raw){
 const transcriptPermit=r.control_transcript?.acceptFrame(raw);
 const keys=['protocol','kind','nonce','pid','slot_id','executable_sha256','source_manifest_sha256','host_instance_id','scope_instance_id','context_contract_protocol','context_contract_id','context_contract_sha256','context_encoding','scope_profile_id','evidence_scope'];
 if(!closed(envelope,['binding_sha256','observation'])||!hash(envelope.binding_sha256)||!Buffer.isBuffer(raw))fail('PROTECTED_CODEX_CONTEXT_OBSERVATION_HELD');
 const prefix=Buffer.from('{"binding_sha256":"'+envelope.binding_sha256+'","observation":');
 if(raw.length<=prefix.length+1||!raw.subarray(0,prefix.length).equals(prefix)||raw.at(-1)!==125||digest(raw.subarray(prefix.length,-1))!==envelope.binding_sha256)fail('PROTECTED_CODEX_OBSERVATION_SERIALIZATION');
 const f=envelope.observation,slot=r.plan.companion_slot,selected=ORIGINAL_CONTEXT_SELECTION;
 if(!closed(f,keys)||!r.context_interpreter||!r.context_delivery||r.backend.context_contract_attempted||r.backend.native_final_observation||r.backend_operations||r.backend.sequence!==0||f.protocol!==PERMIT_PROTOCOL||f.kind!=='scoped_context_contract'||f.nonce!==r.nonce||f.pid!==r.birth?.pid||f.slot_id!==slot.slot_id||f.executable_sha256!==slot.executable_sha256||f.source_manifest_sha256!==slot.source_manifest_sha256||f.host_instance_id!==r.backend.original_host?.host_instance_id||typeof f.scope_instance_id!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/).test(f.scope_instance_id)||f.context_contract_protocol!==selected.protocol||f.context_contract_id!==selected.contract_id||f.context_contract_sha256!==selected.resource_sha256||f.context_encoding!==selected.context_encoding||f.scope_profile_id!==selected.scope_profile_id||f.evidence_scope!=='source-resource-and-whole-payload-source-cut-wire-compatibility-only')fail('PROTECTED_CODEX_CONTEXT_OBSERVATION_HELD');
 // Retain ORIGINAL raw observation before qualification. Node-owned pins are
 // separate static facts and are never relabeled as Rust observations/echoes.
 r.backend.context_contract_attempted=true;r.backend.context_contract_observation=copy(f);r.backend.context_contract_raw=Buffer.from(raw.subarray(prefix.length,-1));r.backend.context_contract_binding=envelope.binding_sha256;r.backend.context_contract_acked=false;
 companionArmed(r);assertOriginalPeerContextSlot(r.context_interpreter,slot);inspectOriginalPeerContextInterpreter(r.context_interpreter);if(r.native_admission)currentNativeTask(r);
 const ack={protocol:PERMIT_PROTOCOL,kind:'context_contract_permit',nonce:r.nonce,pid:r.birth.pid,slot_id:f.slot_id,source_manifest_sha256:f.source_manifest_sha256,host_instance_id:f.host_instance_id,scope_instance_id:f.scope_instance_id,binding_sha256:envelope.binding_sha256,context_contract_protocol:f.context_contract_protocol,context_contract_id:f.context_contract_id,context_contract_sha256:f.context_contract_sha256,context_encoding:f.context_encoding,scope_profile_id:f.scope_profile_id,evidence_scope:f.evidence_scope};
 // Attempt/reservation precedes one original FD4 write. Error/late cancel keeps
 // UNKNOWN; no replay, refund or second acknowledgement is possible.
 r.child.stdio[4].write(transcriptPermit?.permitBytes??JSON.stringify(ack)+'\n',error=>{if(error){try{r.control_transcript?.closeUnknown('io-error');}catch{}r.unknown=true;r.failed=true;r.code='PROTECTED_CODEX_CONTEXT_ACK_UNKNOWN';try{r.facade.kill('SIGTERM');}catch{}return;}if(!r.failed&&!r.stopping&&!r.closed&&r.state==='born'){try{r.control_transcript?.noteContextPermitSent();r.backend.context_contract_acked=true;r.release_original_stdout?.();}catch(error){r.backend.context_contract_acked=false;r.unknown=true;r.failed=true;r.code=safeError(error);try{r.facade.kill('SIGTERM');}catch{}}}});
}

export function assertOriginalProtectedPeerContextStatic(owner,handle){
 const r=record(owner,handle);if(r.consumed||r.state!=='sealed'||!r.context_interpreter)fail('PROTECTED_CODEX_CONTEXT_STATIC_HELD');
 const current=inspectOriginalCompiledCodexPlan(owner,r.compiledPlan);assertOriginalPeerContextSlot(r.context_interpreter,current.companion_slot);inspectOriginalPeerContextInterpreter(r.context_interpreter);
}
