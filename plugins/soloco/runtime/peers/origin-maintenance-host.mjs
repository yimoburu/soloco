// Fixed original range/seal/owner transport. A private SOURCE descriptor is
// selected only by the three exported fixed wrappers, never caller JSON.
import {TextDecoder} from 'node:util';
import {canonical} from './ledger.mjs';
import {parseGatewayJSON} from './gateway-wire.mjs';
import * as wire from './origin-maintenance-wire.mjs';
import * as range from './origin-maintenance.mjs';
import * as seal from './origin-frontier-seal.mjs';
import * as ownerReview from './owner-handover.mjs';
import * as domain from './protected-codex-domain.mjs';
export {prepareOriginalProtectedOriginMaintenanceLaunch,prepareOriginalProtectedOriginFinalReviewLaunch} from './protected-codex-domain.mjs';
export {inspectOriginalOriginMaintenanceSupport,inspectOriginalOriginFrontierSealSupport,inspectOriginalOwnerMaintenanceFreshSupport} from './context-component-deployment.mjs';
const RANGE=Object.freeze({purpose:'origin range',client:'soloco-origin-maintenance',instruction:wire.ORIGIN_MAINTENANCE_INSTRUCTION,readMaximum:4096,outputMaximum:16384,tools:wire.originMaintenanceReadonly3Tools,input:wire.originalOriginMaintenancePreflightInput,assert:range.assertOriginalPeerOriginMaintenance,inspect:range.inspectOriginalPeerOriginMaintenance,preflight:range.originalPeerOriginMaintenancePreflight,bindDomain:domain.bindOriginalProtectedOriginAdmission,bindNative:range.bindOriginalPeerOriginNative,channel:range.originalPeerOriginMaintenanceChannel});
const SEAL=Object.freeze({purpose:'origin whole-frontier seal review',client:'soloco-origin-frontier-seal',instruction:wire.ORIGIN_FRONTIER_SEAL_INSTRUCTION,readMaximum:4096,outputMaximum:16384,tools:wire.originFinalReviewReadonly3Tools,input:wire.originalOriginFrontierSealPreflightInput,assert:seal.assertOriginalPeerOriginFrontierSeal,inspect:seal.inspectOriginalPeerOriginFrontierSeal,preflight:seal.originalPeerOriginFrontierSealPreflight,bindDomain:domain.bindOriginalProtectedOriginFrontierSealAdmission,bindNative:seal.bindOriginalPeerOriginFrontierSealNative,channel:seal.originalPeerOriginFrontierSealChannel});
const OWNER=Object.freeze({purpose:'explicit new fresh-purpose owner handover review',client:'soloco-owner-fresh-review',instruction:wire.OWNER_MAINTENANCE_FRESH_INSTRUCTION,readMaximum:1024,outputMaximum:8192,tools:wire.originFinalReviewReadonly3Tools,input:wire.originalOwnerMaintenanceFreshPreflightInput,assert:ownerReview.assertOriginalPeerOwnerMaintenance,inspect:ownerReview.inspectOriginalPeerOwnerMaintenance,preflight:ownerReview.originalPeerOwnerMaintenanceWirePlan,bindDomain:domain.bindOriginalProtectedOwnerMaintenanceAdmission,bindNative:ownerReview.bindOriginalPeerOwnerMaintenanceNative,channel:ownerReview.originalPeerOwnerMaintenanceChannel});
export const ORIGIN_NATIVE_PERMISSION_PROFILE=':read-only';
const FRAME=100000,WIRE=4000000,COUNT=256;
const fail=code=>{throw Object.assign(Error(code),{code});};
const same=(a,b)=>canonical(a)===canonical(b);
const nativeUUID=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=300&&!v.includes('\0');
const key=id=>{if(!text(id)&&!(Number.isSafeInteger(id)&&id>=0))fail('ORIGIN_HOST_RPC_ID');return canonical(id);};
function closed(v,required,optional=[]){if(!v||Object.getPrototypeOf(v)!==Object.prototype||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>![...required,...optional].includes(k)))fail('ORIGIN_HOST_SHAPE');return v;}
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const int32=v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
const nullable=(value,check)=>value===null||check(value);
const string=v=>typeof v==='string'&&Buffer.byteLength(v)<=FRAME;
function tokenUsage(value){
 closed(value,['total','last','modelContextWindow']);
 for(const part of [value.total,value.last]){closed(part,['totalTokens','inputTokens','cachedInputTokens','cacheWriteInputTokens','outputTokens','reasoningOutputTokens']);if(Object.values(part).some(v=>!integer(v)))fail('ORIGIN_HOST_METADATA_SHAPE');}
 if(!nullable(value.modelContextWindow,integer))fail('ORIGIN_HOST_METADATA_SHAPE');
}
function rateLimits(value){
 closed(value,['limitId','limitName','normalModelSlug','primary','secondary','credits','individualLimit','spendControlReached','planType','rateLimitReachedType']);
 for(const field of ['limitId','limitName','normalModelSlug'])if(!nullable(value[field],string))fail('ORIGIN_HOST_METADATA_SHAPE');
 for(const window of [value.primary,value.secondary])if(window!==null){closed(window,['usedPercent','windowDurationMins','resetsAt']);if(!int32(window.usedPercent)||!nullable(window.windowDurationMins,integer)||!nullable(window.resetsAt,integer))fail('ORIGIN_HOST_METADATA_SHAPE');}
 if(value.credits!==null){closed(value.credits,['hasCredits','unlimited','balance']);if(typeof value.credits.hasCredits!=='boolean'||typeof value.credits.unlimited!=='boolean'||!nullable(value.credits.balance,string))fail('ORIGIN_HOST_METADATA_SHAPE');}
 if(value.individualLimit!==null){const x=closed(value.individualLimit,['limit','used','remainingPercent','resetsAt']);if(!string(x.limit)||!string(x.used)||!int32(x.remainingPercent)||!integer(x.resetsAt))fail('ORIGIN_HOST_METADATA_SHAPE');}
 const plans=['free','go','plus','pro','prolite','promax','team','self_serve_business_prolite','self_serve_business_usage_based','business','ent26','enterprise_cbp_automation','enterprise_cbp_usage_based','enterprise','edu','edu_plus','edu_pro','sci','sci_plus','unknown'],reached=['rate_limit_reached','workspace_owner_credits_depleted','workspace_member_credits_depleted','workspace_owner_usage_limit_reached','workspace_member_usage_limit_reached'];
 if(!nullable(value.spendControlReached,v=>typeof v==='boolean')||!nullable(value.planType,v=>plans.includes(v))||!nullable(value.rateLimitReachedType,v=>reached.includes(v)))fail('ORIGIN_HOST_METADATA_SHAPE');
}

function configuration(owner,launch,fixed){
 const original=domain.originalProtectedPeerLaunchConfiguration(owner,launch);
 return Object.freeze({...original,profile_id:ORIGIN_NATIVE_PERMISSION_PROFILE,instruction_sources:null,base_instructions:'You are an independent bounded '+fixed.purpose+' maintenance reader. Preserve original evidence and every failed, expired or uncertain obligation. You have no ordinary company action, owner activation or old reservation release authority.',developer_instructions:fixed.instruction});
}
export function originalOriginMaintenanceLaunchConfiguration(owner,launch){return configuration(owner,launch,RANGE);}
export function originalOriginFrontierSealLaunchConfiguration(owner,launch){return configuration(owner,launch,SEAL);}
export function originalOwnerMaintenanceFreshLaunchConfiguration(owner,launch){return configuration(owner,launch,OWNER);}

/** Source composition only. Capabilities and real FD observations remain in
 * the original domain; returned JSON cannot replace any of these handles. */
async function runHost(owner,launch,api,cap,fixed){
 if(typeof owner!=='symbol')fail('ORIGIN_HOST_OWNER');
 const admitted=fixed.assert(cap,{stage:'reserved'}),preflight=fixed.preflight(cap),launchConfiguration=configuration(owner,launch,fixed),deadline=Math.min(admitted.deadline_at_ms,Date.now()+120000);
 fixed.bindDomain(owner,launch,api,cap);domain.bindOriginalProtectedCodexLaunch(owner,launch,launchConfiguration);domain.assertOriginalProtectedPeerContextStatic(owner,launch);
 let child,phase='PREPARED',native=null,turn=null,channel=null,buffer='',bytes=0,messages=0,sequence=0,submission=null,final=null,terminal=false,closedChild=false,settled=false,error=null,stopped=false,threadNotice=null,turnNotice=false;
 let dispatch=Promise.resolve(),queuedFrames=0;
 const decoder=new TextDecoder('utf-8',{fatal:true}),pending=new Map(),responses=new Set(),calls=new Map(),callRpcs=new Map(),items=new Set(),queue=[],timers=new Set(),metadataCounts=new Map(),resolved=new Set(),summaryParts=new Set(),rawResponses=new Set();let resolve;
 const result=new Promise(r=>{resolve=r;});
 const timer=(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},Math.max(0,ms));timers.add(t);};
 const current=()=>{const facts=fixed.inspect(cap);return fixed.assert(cap,{stage:facts.native_id?'execution':'reserved'});};
 const tokens=()=>domain.originalProtectedOwnedTaskTokens(owner,launch);
 const finish=()=>{if(settled)return;settled=true;for(const t of timers)clearTimeout(t);let observed;try{observed=tokens();}catch{}resolve(Object.freeze({drain:!error?observed?.drain??null:null,diagnostic:observed?.diagnostic??null,error:error??(!observed?.drain?'ORIGIN_HOST_DRAIN_UNPROVED':null),observational_notifications:Object.freeze({qualifies:false,counts:Object.fromEntries(metadataCounts)}),closure:'Original direct child/FD custody only; remote/group/whole-domain closure remains unproved'}));};
 const hold=e=>{error??=typeof e?.code==='string'?e.code:'ORIGIN_HOST_UNKNOWN';phase='HELD';if(!stopped){stopped=true;try{domain.requestOriginalProtectedCodexStop(owner,launch);}catch{}}if(!child||Date.now()>=deadline)finish();};
 const drain=()=>{
  if(settled)return;if(Date.now()>=deadline){hold({code:'ORIGIN_HOST_DEADLINE'});finish();return;}
  if(error){if(closedChild)finish();return;}
  if(!closedChild||!terminal)return;
  try{current();const observed=tokens();if(observed.drain){phase='DRAINED';finish();return;}timer(drain,5);}catch(e){hold(e);finish();}
 };
 function send(frame){
  current();if(Date.now()>=deadline)fail('ORIGIN_HOST_DEADLINE');
  const line=JSON.stringify(frame)+'\n';if(Buffer.byteLength(line)>FRAME||(child.stdin.writableLength??0)+Buffer.byteLength(line)>FRAME)fail('ORIGIN_HOST_WIRE_CAPACITY');child.stdin.write(line,e=>{if(e)hold(e);});
 }
 function request(method,params){const id='soloco-peer-'+(++sequence);pending.set(key(id),{method,params});send({id,method,params});return id;}
 function beginTurn(){
  current();domain.assertOriginalProtectedCodexBoundary(owner,launch,'before_turn');phase='STARTING_TURN';request('turn/start',{threadId:native,input:fixed.input(preflight)});
 }
 async function response(frame){
  closed(frame,['id'],['result','error']);if(Object.hasOwn(frame,'result')===Object.hasOwn(frame,'error'))fail('ORIGIN_HOST_RPC_RESULT');
  const id=key(frame.id),requestFrame=pending.get(id);if(!requestFrame||responses.has(id))fail('ORIGIN_HOST_RPC_REPLAY');pending.delete(id);responses.add(id);if(frame.error)fail('ORIGIN_HOST_RPC_ERROR');
  if(requestFrame.method==='initialize'){
   if(phase!=='INITIALIZING'||!frame.result||typeof frame.result!=='object')fail('ORIGIN_HOST_ORDER');send({method:'initialized'});phase='STARTING_THREAD';request('thread/start',{dynamicTools:fixed.tools(),cwd:launchConfiguration.cwd,runtimeWorkspaceRoots:[launchConfiguration.cwd],permissions:ORIGIN_NATIVE_PERMISSION_PROFILE,approvalPolicy:'never',baseInstructions:launchConfiguration.base_instructions,developerInstructions:launchConfiguration.developer_instructions,ephemeral:false,environments:[]});
  }else if(requestFrame.method==='thread/start'){
   const p=frame.result,t=p?.thread;
   if(phase!=='STARTING_THREAD'||!nativeUUID(t?.id)||t.parentThreadId!==null||t.forkedFromId!==null||!Array.isArray(t.turns)||t.turns.length||t.ephemeral!==false||p.cwd!==launchConfiguration.cwd||!same(p.runtimeWorkspaceRoots,[launchConfiguration.cwd])||p.approvalPolicy!=='never'||p.activePermissionProfile?.id!==ORIGIN_NATIVE_PERMISSION_PROFILE||!Array.isArray(p.instructionSources)||Buffer.byteLength(canonical(p.instructionSources))>16000||threadNotice&&threadNotice!==t.id)fail('ORIGIN_HOST_FRESH_PERMISSION_METADATA');
   native=t.id;const creation=tokens().creation;if(!creation)fail('ORIGIN_HOST_ORIGINAL_CREATION_REQUIRED');await fixed.bindNative(cap,creation);current();channel=fixed.channel(cap);phase='THREAD_READY';while(queue.length&&!error)notification(queue.shift());beginTurn();
  }else if(requestFrame.method==='turn/start'){
   const t=frame.result?.turn;if(phase!=='STARTING_TURN'||!text(t?.id)||t.status!=='inProgress')fail('ORIGIN_HOST_ORDER');turn=t.id;phase='RUNNING';while(queue.length&&!error)notification(queue.shift());
  }else fail('ORIGIN_HOST_RPC_METHOD');
 }
 function tool(frame){
  const p=closed(frame.params,['threadId','turnId','callId','namespace','tool','arguments']);
  if(phase!=='RUNNING'||terminal||p.threadId!==native||p.turnId!==turn||p.namespace!==null||!text(p.callId)||!fixed.tools().some(t=>t.name===p.tool))fail('ORIGIN_HOST_TOOL_BINDING');
  const rpc=key(frame.id),prior=calls.get(p.callId);current();domain.assertOriginalProtectedCodexBoundary(owner,launch,'callback_guard');
  if(prior){if(prior.rpc!==rpc||prior.body!==canonical(p))fail('ORIGIN_HOST_TOOL_REPLAY');send({id:frame.id,result:prior.response});return;}
  if(callRpcs.has(rpc)||calls.size>=128)fail('ORIGIN_HOST_TOOL_REPLAY');
  let value;if(p.tool==='soloco_context_header'){closed(p.arguments,[]);value=channel.header();}
  else if(p.tool==='soloco_context_read'){closed(p.arguments,['sha256','offset','length']);if(!Number.isSafeInteger(p.arguments.offset)||p.arguments.offset<0||!Number.isSafeInteger(p.arguments.length)||p.arguments.length<1||p.arguments.length>fixed.readMaximum)fail('ORIGIN_HOST_PURPOSE_READ_BOUND');value=channel.read(p.arguments);}
  else{closed(p.arguments,['sha256','content']);if(typeof p.arguments.content!=='string'||Buffer.byteLength(p.arguments.content)>fixed.outputMaximum)fail('ORIGIN_HOST_PURPOSE_OUTPUT_BOUND');if(submission!==null)fail('ORIGIN_HOST_SUBMISSION_IMMUTABLE');value=channel.submit(p.arguments);submission=p.arguments.content;}
  const response={contentItems:[{type:'inputText',text:canonical(value)}],success:true};if(Buffer.byteLength(canonical(response))>FRAME)fail('ORIGIN_HOST_WIRE_CAPACITY');
  calls.set(p.callId,{rpc,body:canonical(p),response});callRpcs.set(rpc,p.callId);send({id:frame.id,result:response});
 }
 // Exact pinned c407 DTO metadata. These observations never create an identity,
 // turn, callback permission, completion, budget or drain. In particular status
 // Active precedes TurnStarted and Idle precedes TurnCompleted in the actual
 // handler. A queued thread status cannot replace the correlated start RPC.
 function metadata(frame){
  const p=frame.params,method=frame.method;let turnScoped=false;
  if(method==='thread/status/changed'){
   closed(p,['threadId','status']);const v=p.status;if(!v||!['notLoaded','idle','systemError','active'].includes(v.type))fail('ORIGIN_HOST_METADATA_SHAPE');closed(v,v.type==='active'?['type','activeFlags']:['type']);
   if(v.type==='active'&&(!Array.isArray(v.activeFlags)||v.activeFlags.length>2||new Set(v.activeFlags).size!==v.activeFlags.length||v.activeFlags.some(x=>!['waitingOnApproval','waitingOnUserInput'].includes(x))))fail('ORIGIN_HOST_METADATA_SHAPE');
   if(v.type==='systemError'||v.type==='active'&&v.activeFlags.length||terminal&&!['idle','notLoaded'].includes(v.type)||!terminal&&v.type==='notLoaded')fail('ORIGIN_HOST_STATUS_HELD');
  }else if(method==='thread/name/updated'){
   closed(p,['threadId'],['threadName']);if(Object.hasOwn(p,'threadName')&&!nullable(p.threadName,string))fail('ORIGIN_HOST_METADATA_SHAPE');
  }else if(method==='thread/readState/changed'){
   closed(p,['threadId','readState']);const state=closed(p.readState,['firstUnread','revision']);if(!text(state.revision))fail('ORIGIN_HOST_METADATA_SHAPE');
   if(state.firstUnread!==null){const first=state.firstUnread;if(!first||!['threadStart','turn'].includes(first.type))fail('ORIGIN_HOST_METADATA_SHAPE');closed(first,first.type==='turn'?['type','turnId']:['type']);if(first.type==='turn'&&!text(first.turnId))fail('ORIGIN_HOST_METADATA_SHAPE');}
  }else if(method==='thread/tokenUsage/updated'){
   closed(p,['threadId','turnId','tokenUsage']);tokenUsage(p.tokenUsage);turnScoped=true;
  }else if(method==='turn/plan/updated'){
   closed(p,['threadId','turnId','explanation','plan']);if(!nullable(p.explanation,string)||!Array.isArray(p.plan)||p.plan.length>COUNT)fail('ORIGIN_HOST_METADATA_SHAPE');for(const step of p.plan){closed(step,['step','status']);if(!string(step.step)||!['pending','inProgress','completed'].includes(step.status))fail('ORIGIN_HOST_METADATA_SHAPE');}turnScoped=true;
  }else if(['item/agentMessage/delta','item/plan/delta','item/reasoning/summaryTextDelta','item/reasoning/summaryPartAdded','item/reasoning/textDelta'].includes(method)){
   const index=method.endsWith('textDelta')?'contentIndex':method.includes('/reasoning/')?'summaryIndex':null,hasDelta=!method.endsWith('summaryPartAdded');
   closed(p,['threadId','turnId','itemId',...(hasDelta?['delta']:[]),...(index?[index]:[])]);if(!text(p.itemId)||hasDelta&&!string(p.delta)||index&&!integer(p[index]))fail('ORIGIN_HOST_METADATA_SHAPE');turnScoped=true;
   if(terminal||items.has(p.itemId))fail('ORIGIN_HOST_ITEM_CLOSED');
  }else if(method==='rawResponse/completed'){
   closed(p,['threadId','turnId','responseId','usage','usageMetadata']);if(!text(p.responseId))fail('ORIGIN_HOST_METADATA_SHAPE');
   if(p.usage!==null){const usage={total:p.usage,last:p.usage,modelContextWindow:null};tokenUsage(usage);}
   if(p.usageMetadata!==null){closed(p.usageMetadata,['amount','metadata']);if(!nullable(p.usageMetadata.amount,string))fail('ORIGIN_HOST_METADATA_SHAPE');}turnScoped=true;
  }else if(method==='rawResponseItem/completed'){
   closed(p,['threadId','turnId','item']);if(!p.item||Object.getPrototypeOf(p.item)!==Object.prototype||!text(p.item.type))fail('ORIGIN_HOST_METADATA_SHAPE');turnScoped=true;if(terminal)fail('ORIGIN_HOST_ITEM_CLOSED');if(!['message','reasoning','function_call','function_call_output'].includes(p.item.type))fail('ORIGIN_HOST_EXTERNAL_ITEM_HELD');
   // ResponseItem is retained as opaque bounded metadata, never interpreted as
   // a final answer or an admitted callback; the separate item/turn path owns it.
  }else if(method==='serverRequest/resolved'){
   closed(p,['threadId','requestId']);key(p.requestId);
  }else if(method==='account/rateLimits/updated'){
   closed(p,['rateLimits']);rateLimits(p.rateLimits);if(!['INITIALIZING','STARTING_THREAD','THREAD_READY','STARTING_TURN','RUNNING','TERMINAL'].includes(phase))fail('ORIGIN_HOST_ORDER');
   // This DTO has no thread/turn ID: owned-connection metadata only. It cannot
   // stand in for a correlated thread observation or increase any allowance.
   metadataCounts.set(method,(metadataCounts.get(method)??0)+1);return true;
  }else return false;
  if(!nativeUUID(p.threadId)||turnScoped&&!text(p.turnId))fail('ORIGIN_HOST_METADATA_BINDING');
  if(phase==='STARTING_THREAD'&&!turnScoped&&method!=='serverRequest/resolved'||phase==='STARTING_TURN'&&turnScoped){if(queue.length>=COUNT)fail('ORIGIN_HOST_WIRE_CAPACITY');queue.push(frame);return true;}
  if(!native||p.threadId!==native||turnScoped&&(p.turnId!==turn||!['RUNNING','TERMINAL'].includes(phase))||!turnScoped&&!['THREAD_READY','STARTING_TURN','RUNNING','TERMINAL'].includes(phase))fail('ORIGIN_HOST_METADATA_BINDING');
  if(terminal&&!['thread/status/changed','thread/readState/changed','thread/tokenUsage/updated','rawResponse/completed'].includes(method))fail('ORIGIN_HOST_TURN_BINDING');
  if(method==='thread/readState/changed'&&p.readState.firstUnread?.type==='turn'&&p.readState.firstUnread.turnId!==turn)fail('ORIGIN_HOST_METADATA_BINDING');
  if(method==='serverRequest/resolved'){const rpc=key(p.requestId);if(!callRpcs.has(rpc)||resolved.has(rpc))fail('ORIGIN_HOST_METADATA_REPLAY');resolved.add(rpc);}
  if(method==='item/reasoning/summaryPartAdded'){const id=canonical([p.itemId,p.summaryIndex]);if(summaryParts.has(id))fail('ORIGIN_HOST_METADATA_REPLAY');summaryParts.add(id);}
  if(method==='rawResponse/completed'){if(rawResponses.has(p.responseId))fail('ORIGIN_HOST_METADATA_REPLAY');rawResponses.add(p.responseId);}
  metadataCounts.set(method,(metadataCounts.get(method)??0)+1);return true;
 }
 function notification(frame){
  const p=frame.params;if(frame.method==='thread/started'){closed(p,['thread']);if(!['STARTING_THREAD','STARTING_TURN','RUNNING'].includes(phase)||threadNotice||!nativeUUID(p?.thread?.id)||native&&p.thread.id!==native)fail('ORIGIN_HOST_THREAD_NOTICE');threadNotice=p.thread.id;return;}
  if(metadata(frame))return;
  if(phase==='STARTING_TURN'){if(queue.length>=COUNT)fail('ORIGIN_HOST_WIRE_CAPACITY');queue.push(frame);return;}
  if(phase!=='RUNNING'||terminal||p?.threadId!==native||p?.turnId!==undefined&&p.turnId!==turn)fail('ORIGIN_HOST_TURN_BINDING');
  if(frame.method==='turn/started'){closed(p,['threadId','turn']);if(turnNotice||p.turn?.id!==turn||p.turn.status!=='inProgress')fail('ORIGIN_HOST_TURN_BINDING');turnNotice=true;return;}
  if(frame.method==='item/started'){closed(p,['threadId','turnId','item','startedAtMs']);if(!text(p.item?.id)||!text(p.item.type)||!integer(p.startedAtMs)||items.has(p.item.id))fail('ORIGIN_HOST_ITEM_REPLAY');return;}
  if(frame.method==='item/completed'){
   closed(p,['threadId','turnId','item','completedAtMs']);if(!integer(p.completedAtMs))fail('ORIGIN_HOST_SHAPE');const item=p.item;if(!text(item?.id)||items.has(item.id))fail('ORIGIN_HOST_ITEM_REPLAY');items.add(item.id);
   if(item.type==='agentMessage'&&item.phase==='final_answer'){if(final!==null||typeof item.text!=='string'||Buffer.byteLength(item.text)>fixed.outputMaximum||submission===null||item.text!==submission)fail('ORIGIN_HOST_FINAL_SUBMISSION');final=item.text;}return;
  }
  if(frame.method==='turn/completed'){
   closed(p,['threadId','turn']);if(p.turn?.id!==turn||p.turn.status!=='completed'||p.turn.error!==null||final===null||pending.size||queue.length)fail('ORIGIN_HOST_TERMINAL');terminal=true;phase='TERMINAL';
   // Graceful EOF, not cancellation: requestStop would correctly disqualify the
   // original drain. Reaping/FD closure and every HTTP terminal witness remain
   // independently necessary in the original domain before completion.
   child.stdin.end();drain();return;
  }
  fail('ORIGIN_HOST_NOTIFICATION');
 }
 async function received(frame){
  if(error||settled)return;current();if(++messages>COUNT)fail('ORIGIN_HOST_WIRE_CAPACITY');
  closed(frame,[],['id','method','params','result','error']);
  if(Object.hasOwn(frame,'method')){closed(frame,['method','params'],['id']);if(typeof frame.method!=='string')fail('ORIGIN_HOST_SHAPE');if(Object.hasOwn(frame,'id')){if(frame.method!=='item/tool/call')fail('ORIGIN_HOST_TOOL_BINDING');tool(frame);}else notification(frame);}
  else await response(frame);
 }
 function data(chunk,stderr=false){
  if(settled)return;try{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=b.length;if(bytes>WIRE)fail('ORIGIN_HOST_WIRE_CAPACITY');if(stderr||error)return;
   buffer+=decoder.decode(b,{stream:true});for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.length||Buffer.byteLength(line)>FRAME)fail('ORIGIN_HOST_WIRE_CAPACITY');const frame=parseGatewayJSON(Buffer.from(line),{max_bytes:FRAME,max_depth:32});if(++queuedFrames>COUNT)fail('ORIGIN_HOST_WIRE_CAPACITY');dispatch=dispatch.then(()=>received(frame)).catch(hold).finally(()=>{queuedFrames--;});if(error)return;}if(Buffer.byteLength(buffer)>FRAME)fail('ORIGIN_HOST_WIRE_CAPACITY');
  }catch(e){hold(e);}
 }
 try{
  child=domain.spawnOriginalProtectedCodex(owner,launch);child.on('error',hold);child.stdout.on('data',b=>data(b));child.stderr.on('data',b=>data(b,true));
  child.stdout.on('end',()=>{try{buffer+=decoder.decode();if(buffer.length)fail('ORIGIN_HOST_UNTERMINATED_FRAME');}catch(e){hold(e);}});
  child.once('close',(code,signal)=>{void dispatch.then(()=>{closedChild=true;if(code!==0||signal||!terminal)hold({code:'ORIGIN_HOST_CHILD_UNKNOWN'});drain();}).catch(hold);});
  child.once('spawn',()=>{try{if(phase!=='PREPARED')fail('ORIGIN_HOST_ORDER');current();phase='INITIALIZING';request('initialize',{clientInfo:{name:fixed.client,version:'source-v1'},capabilities:{experimentalApi:true,requestAttestation:false}});}catch(e){hold(e);}});
  timer(()=>{hold({code:'ORIGIN_HOST_DEADLINE'});finish();},deadline-Date.now());
 }catch(e){hold(e);finish();}
 return result;
}

export async function runOriginalOriginMaintenanceHost(owner,launch,api,cap){if(arguments.length!==4)fail('ORIGIN_HOST_INPUT');return runHost(owner,launch,api,cap,RANGE);}
export async function runOriginalOriginFrontierSealHost(owner,launch,api,cap){if(arguments.length!==4)fail('ORIGIN_HOST_INPUT');return runHost(owner,launch,api,cap,SEAL);}
export async function runOriginalOwnerMaintenanceFreshHost(owner,launch,lifecycle,cap){if(arguments.length!==4)fail('ORIGIN_HOST_INPUT');return runHost(owner,launch,lifecycle,cap,OWNER);}
