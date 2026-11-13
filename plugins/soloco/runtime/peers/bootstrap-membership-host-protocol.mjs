// Fixed fresh readonly3 protocol mechanics. No launcher, admission, Native
// issuer or qualification is created by this structured transport component.
import {types} from 'node:util';
import {canonical,peerDigest} from './ledger.mjs';
import {bootstrapReadonly3Tools} from './bootstrap-membership-delivery-frame.mjs';

export const BOOTSTRAP_NATIVE_PERMISSION=':read-only';
export const BOOTSTRAP_NATIVE_BASE='Execute only the complete private paused-bootstrap membership assignment. Preserve all Holds, negative evidence, uncertainty and finite authority. No ordinary actions.';
export const BOOTSTRAP_NATIVE_DEVELOPER='The fixed context header/read/submit protocol is the only callback channel. Read every admitted range before submitting once. The final answer must equal the first attributed submission exactly.';
const fail=code=>{throw Object.assign(Error(code),{code});},copy=v=>JSON.parse(canonical(v)),same=(a,b)=>canonical(a)===canonical(b);
const text=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max&&!v.includes('\0')&&Buffer.from(v).toString('utf8')===v;
function closed(v,required,optional=[]){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)fail('BOOTSTRAP_HOST_SHAPE');const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);if(required.some(k=>!Object.hasOwn(d,k))||keys.some(k=>typeof k!=='string'||![...required,...optional].includes(k)||!d[k].enumerable||!Object.hasOwn(d[k],'value')))fail('BOOTSTRAP_HOST_SHAPE');return v;}
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const rpcId=value=>text(value)||Number.isSafeInteger(value)&&value>=0;
const integer=value=>Number.isSafeInteger(value)&&value>=0,nullable=(value,check)=>value===null||check(value),wireText=value=>typeof value==='string'&&!value.includes('\0')&&Buffer.from(value).toString('utf8')===value;
const metadataMethods=new Set(['thread/status/changed','thread/name/updated','thread/readState/changed','thread/tokenUsage/updated','rawResponse/completed','rawResponseItem/completed','serverRequest/resolved','account/rateLimits/updated','item/reasoning/summaryTextDelta','item/reasoning/summaryPartAdded','item/reasoning/textDelta','item/plan/delta','turn/plan/updated']);
const terminalMetadata=new Set(['thread/status/changed','thread/name/updated','thread/readState/changed','thread/tokenUsage/updated','rawResponse/completed','serverRequest/resolved','account/rateLimits/updated']);
function usage(value){closed(value,['totalTokens','inputTokens','cachedInputTokens','cacheWriteInputTokens','outputTokens','reasoningOutputTokens']);if(!Object.values(value).every(integer))fail('BOOTSTRAP_HOST_USAGE');}
function rateLimits(value){
 closed(value,['limitId','limitName','normalModelSlug','primary','secondary','credits','individualLimit','spendControlReached','planType','rateLimitReachedType']);
 if(!['limitId','limitName','normalModelSlug'].every(key=>nullable(value[key],wireText))||!nullable(value.planType,v=>['free','go','plus','pro','prolite','promax','team','self_serve_business_prolite','self_serve_business_usage_based','business','ent26','enterprise_cbp_automation','enterprise_cbp_usage_based','enterprise','edu','edu_plus','edu_pro','sci','sci_plus','unknown'].includes(v))||!nullable(value.spendControlReached,v=>typeof v==='boolean')||!nullable(value.rateLimitReachedType,v=>['rate_limit_reached','workspace_owner_credits_depleted','workspace_member_credits_depleted','workspace_owner_usage_limit_reached','workspace_member_usage_limit_reached'].includes(v)))fail('BOOTSTRAP_HOST_RATE_LIMITS');
 for(const key of ['primary','secondary'])if(value[key]!==null){const w=closed(value[key],['usedPercent','windowDurationMins','resetsAt']);if(!Number.isSafeInteger(w.usedPercent)||!nullable(w.windowDurationMins,integer)||!nullable(w.resetsAt,integer))fail('BOOTSTRAP_HOST_RATE_LIMITS');}
 if(value.credits!==null){const c=closed(value.credits,['hasCredits','unlimited','balance']);if(typeof c.hasCredits!=='boolean'||typeof c.unlimited!=='boolean'||!nullable(c.balance,wireText))fail('BOOTSTRAP_HOST_RATE_LIMITS');}
 if(value.individualLimit!==null){const c=closed(value.individualLimit,['limit','used','remainingPercent','resetsAt']);if(!wireText(c.limit)||!wireText(c.used)||!Number.isSafeInteger(c.remainingPercent)||!integer(c.resetsAt))fail('BOOTSTRAP_HOST_RATE_LIMITS');}
}
const transports=new WeakSet();

/** Pure mechanical component. Production supplies only original bound source
 * functions; synthetic tests can exercise this grammar without Native proof. */
export function createBootstrapMembershipHostProtocol(options){
 closed(options,['owner','transport','launch','input','guard','onThread','channel']);
 const {owner,transport,guard,onThread,channel}=options,launch=closed(options.launch,['cwd','profile_id','instruction_sources','base_instructions','developer_instructions','environment']);
 if(typeof owner!=='symbol'||!transport||typeof transport.send!=='function'||typeof transport.attach!=='function'||transports.has(transport)||typeof guard!=='function'||typeof onThread!=='function'||!channel||['header','read','submit'].some(k=>typeof channel[k]!=='function')||launch.profile_id!==BOOTSTRAP_NATIVE_PERMISSION||launch.base_instructions!==BOOTSTRAP_NATIVE_BASE||launch.developer_instructions!==BOOTSTRAP_NATIVE_DEVELOPER||!Array.isArray(launch.instruction_sources)||launch.instruction_sources.length!==0||!Array.isArray(options.input)||options.input.length!==2)fail('BOOTSTRAP_HOST_ORIGINAL_SOURCE_REQUIRED');
 const input=copy(options.input);if(input.some(item=>{closed(item,['type','text']);return item.type!=='text'||!text(item.text,100000);}))fail('BOOTSTRAP_HOST_INPUT');
 let state='new',sequence=0,native=null,turn=null,threadNotice=null,turnNotice=null,final=null,terminal=null,submission=null,error=null,messages=0,retained=0;
 const pending=new Map(),responses=new Set(),calls=new Map(),rpcCalls=new Map(),resolvedCalls=new Set(),items=new Set(),queued=[];
 const requireOwner=token=>{if(token!==owner)fail('BOOTSTRAP_HOST_OWNER');};
 const account=v=>{retained+=Buffer.byteLength(canonical(v));if(retained>1000000)fail('BOOTSTRAP_HOST_RETAINED_CAPACITY');};
 const synchronous=(fn,...args)=>{const result=fn(...args);if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});fail('BOOTSTRAP_HOST_ASYNC_CALLBACK');}return result;};
 function send(frame){synchronous(guard,['initialize','initialized'].includes(frame.method)?'initialize':frame.method==='thread/start'?'before_thread':frame.method==='turn/start'?'before_turn':'callback');if(Buffer.byteLength(canonical(frame))+1>100000)fail('BOOTSTRAP_HOST_FRAME_CAPACITY');account(frame);synchronous(transport.send.bind(transport),copy(frame));}
 function request(method,params){const id='soloco-peer-'+(++sequence);pending.set(id,method);send({id,method,params});return id;}
 function enqueue(method,p){if(queued.length>=256)fail('BOOTSTRAP_HOST_MESSAGES');account({method,params:p});queued.push({method,params:copy(p)});}
 // These exact pinned SDK notifications carry progress/accounting DATA only.
 // They never establish birth, turn identity, callbacks, final output or closure.
 function metadata(method,p){
  if(!metadataMethods.has(method))return false;
  if(state==='terminal'&&!terminalMetadata.has(method))fail('BOOTSTRAP_HOST_CLOSED');
  if(!['initializing','starting_thread','starting_turn','running','terminal'].includes(state))fail('BOOTSTRAP_HOST_ORDER');
  if(method==='account/rateLimits/updated'){closed(p,['rateLimits']);rateLimits(p.rateLimits);return true;}
  if(state==='starting_thread'||state==='starting_turn'){enqueue(method,p);return true;}
  if(!native||p?.threadId!==native)fail('BOOTSTRAP_HOST_TURN_BINDING');
  if(method==='thread/status/changed'){closed(p,['threadId','status']);const s=p.status;if(s?.type==='active'){closed(s,['type','activeFlags']);if(state==='terminal'||!Array.isArray(s.activeFlags)||s.activeFlags.length!==0)fail('BOOTSTRAP_HOST_ACTIVE_STATUS');}else{closed(s,['type']);if(!['idle','notLoaded'].includes(s.type))fail('BOOTSTRAP_HOST_STATUS');}return true;}
  if(method==='thread/name/updated'){closed(p,['threadId'],['threadName']);if(Object.hasOwn(p,'threadName')&&!nullable(p.threadName,wireText))fail('BOOTSTRAP_HOST_METADATA');return true;}
  if(method==='thread/readState/changed'){closed(p,['threadId','readState']);const s=closed(p.readState,['firstUnread','revision']);if(!text(s.revision))fail('BOOTSTRAP_HOST_METADATA');if(s.firstUnread!==null){const pos=s.firstUnread;if(pos?.type==='threadStart')closed(pos,['type']);else{closed(pos,['type','turnId']);if(pos.type!=='turn'||pos.turnId!==turn)fail('BOOTSTRAP_HOST_TURN_BINDING');}}return true;}
  if(method==='serverRequest/resolved'){closed(p,['threadId','requestId']);const key=canonical(p.requestId);if(!rpcId(p.requestId)||!rpcCalls.has(key)||resolvedCalls.has(key))fail('BOOTSTRAP_HOST_RPC_REPLAY');resolvedCalls.add(key);return true;}
  if(!turn||p.turnId!==turn)fail('BOOTSTRAP_HOST_TURN_BINDING');
  if(method==='rawResponseItem/completed'){closed(p,['threadId','turnId','item']);const item=p.item;if(!item||types.isProxy(item)||Object.getPrototypeOf(item)!==Object.prototype||!['message','reasoning','function_call','function_call_output'].includes(item.type))fail('BOOTSTRAP_HOST_EXTERNAL_ITEM');if(['function_call','function_call_output'].includes(item.type)&&(Object.hasOwn(item,'name')&&!bootstrapReadonly3Tools().some(t=>t.name===item.name)||Object.hasOwn(item,'namespace')&&item.namespace!==null))fail('BOOTSTRAP_HOST_EXTERNAL_ITEM');return true;}
  if(method==='thread/tokenUsage/updated'){closed(p,['threadId','turnId','tokenUsage']);const u=closed(p.tokenUsage,['total','last','modelContextWindow']);usage(u.total);usage(u.last);if(!nullable(u.modelContextWindow,integer))fail('BOOTSTRAP_HOST_USAGE');return true;}
  if(method==='rawResponse/completed'){closed(p,['threadId','turnId','responseId','usage','usageMetadata']);if(!text(p.responseId))fail('BOOTSTRAP_HOST_METADATA');if(p.usage!==null)usage(p.usage);if(p.usageMetadata!==null){const m=closed(p.usageMetadata,['amount','metadata']);if(!nullable(m.amount,wireText))fail('BOOTSTRAP_HOST_METADATA');}return true;}
  if(method==='turn/plan/updated'){closed(p,['threadId','turnId','explanation','plan']);if(!nullable(p.explanation,wireText)||!Array.isArray(p.plan)||p.plan.length>128)fail('BOOTSTRAP_HOST_METADATA');for(const step of p.plan){closed(step,['step','status']);if(!wireText(step.step)||!['pending','inProgress','completed'].includes(step.status))fail('BOOTSTRAP_HOST_METADATA');}return true;}
  const index=method==='item/reasoning/textDelta'?'contentIndex':'summaryIndex',part=method==='item/reasoning/summaryPartAdded',plan=method==='item/plan/delta';closed(p,['threadId','turnId','itemId',...(plan?['delta']:part?[index]:['delta',index])]);if(!text(p.itemId)||!part&&!wireText(p.delta)||!plan&&!integer(p[index]))fail('BOOTSTRAP_HOST_METADATA');return true;
 }
 function notification(method,p){
  if(metadata(method,p))return;
  if(method==='thread/started'){closed(p,['thread']);if(!['starting_thread','starting_turn','running'].includes(state)||threadNotice||!uuid(p.thread?.id)||native&&native!==p.thread.id)fail('BOOTSTRAP_HOST_THREAD_REPLAY');threadNotice=p.thread.id;return;}
  if(state==='starting_turn'){enqueue(method,p);return;}
  if(state!=='running'||p?.threadId!==native)fail('BOOTSTRAP_HOST_TURN_BINDING');
  if(method==='turn/started'){closed(p,['threadId','turn']);if(turnNotice||p.turn?.id!==turn||p.turn.status!=='inProgress')fail('BOOTSTRAP_HOST_TURN_REPLAY');turnNotice=turn;return;}
  if(method==='turn/completed'){closed(p,['threadId','turn']);if(p.turn?.id!==turn||!['completed','failed','interrupted'].includes(p.turn.status)||p.turn.status==='completed'&&(p.turn.error!==null||final===null||submission===null||final!==submission))fail('BOOTSTRAP_HOST_TERMINAL');terminal=copy(p.turn);state='terminal';return;}
  if(p.turnId!==turn)fail('BOOTSTRAP_HOST_TURN_BINDING');
  if(method==='item/started'||method==='item/agentMessage/delta')return;
  if(method!=='item/completed')fail('BOOTSTRAP_HOST_NOTIFICATION');
  closed(p,['item','threadId','turnId'],['completedAtMs']);const item=p.item;if(!item||!text(item.id)||items.has(item.id))fail('BOOTSTRAP_HOST_ITEM_REPLAY');items.add(item.id);
  if(!['agentMessage','reasoning','plan','userMessage','dynamicToolCall'].includes(item.type))fail('BOOTSTRAP_HOST_EXTERNAL_ITEM');
  if(item.type==='agentMessage'&&item.phase==='final_answer'){if(final!==null||!text(item.text,12000)||Buffer.byteLength(item.text)>12000)fail('BOOTSTRAP_HOST_FINAL');final=item.text;}
 }
 function response(frame){
  closed(frame,['id'],['result','error']);if(Object.hasOwn(frame,'result')===Object.hasOwn(frame,'error')||responses.has(canonical(frame.id))||!pending.has(frame.id))fail('BOOTSTRAP_HOST_RPC_REPLAY');
  const method=pending.get(frame.id);pending.delete(frame.id);responses.add(canonical(frame.id));if(Object.hasOwn(frame,'error'))fail('BOOTSTRAP_HOST_RPC_ERROR');
  if(method==='initialize'){if(state!=='initializing'||!frame.result||typeof frame.result!=='object')fail('BOOTSTRAP_HOST_ORDER');send({method:'initialized'});state='starting_thread';request('thread/start',{cwd:launch.cwd,runtimeWorkspaceRoots:[launch.cwd],permissions:BOOTSTRAP_NATIVE_PERMISSION,approvalPolicy:'never',baseInstructions:BOOTSTRAP_NATIVE_BASE,developerInstructions:BOOTSTRAP_NATIVE_DEVELOPER,dynamicTools:bootstrapReadonly3Tools(),ephemeral:false});}
  else if(method==='thread/start'){const r=frame.result,t=r?.thread;if(state!=='starting_thread'||!t||!uuid(t.id)||!uuid(t.sessionId)||t.parentThreadId!==null||t.forkedFromId!==null||!Array.isArray(t.turns)||t.turns.length!==0||t.canAcceptDirectInput!==true||t.ephemeral!==false||threadNotice&&threadNotice!==t.id||r.cwd!==launch.cwd||!same(r.runtimeWorkspaceRoots,[launch.cwd])||r.activePermissionProfile?.id!==BOOTSTRAP_NATIVE_PERMISSION||r.approvalPolicy!=='never'||!same(r.instructionSources,[]))fail('BOOTSTRAP_HOST_EFFECTIVE_PROFILE');native=t.id;synchronous(onThread,native);state='starting_turn';request('turn/start',{threadId:native,input:copy(input)});}
  else if(method==='turn/start'){const t=frame.result?.turn;if(state!=='starting_turn'||!t||!text(t.id)||t.status!=='inProgress')fail('BOOTSTRAP_HOST_ORDER');turn=t.id;state='running';while(queued.length){const n=queued.shift();notification(n.method,n.params);}}
  else fail('BOOTSTRAP_HOST_RPC_METHOD');
 }
 function tool(frame){
  closed(frame,['id','method','params']);const p=closed(frame.params,['threadId','turnId','callId','namespace','tool','arguments']);
  if(state!=='running'||p.threadId!==native||p.turnId!==turn||p.namespace!==null||!text(p.callId)||!bootstrapReadonly3Tools().some(t=>t.name===p.tool))fail('BOOTSTRAP_HOST_TOOL_BINDING');
  const key=canonical(frame.id),digest=peerDigest(p),prior=calls.get(p.callId);synchronous(guard,'callback');if(prior){if(prior.id!==key||prior.sha256!==digest)fail('BOOTSTRAP_HOST_CALL_REPLAY');send({id:frame.id,result:copy(prior.response)});return;}
  if(calls.size>=128||rpcCalls.has(key))fail('BOOTSTRAP_HOST_CALL_CAPACITY');
  const args=p.arguments;let value;
  if(p.tool==='soloco_context_header'){closed(args,[]);value=synchronous(channel.header);}
  else if(p.tool==='soloco_context_read'){closed(args,['sha256','offset','length']);if(!Number.isSafeInteger(args.offset)||args.offset<0||!Number.isSafeInteger(args.length)||args.length<1||args.length>4096)fail('BOOTSTRAP_HOST_READ_RANGE');value=synchronous(channel.read,copy(args));}
  else{closed(args,['sha256','content']);if(!text(args.content,12000)||Buffer.byteLength(args.content)>12000||submission!==null&&submission!==args.content)fail('BOOTSTRAP_HOST_FIRST_SUBMISSION');value=synchronous(channel.submit,copy(args));submission??=args.content;}
  const result={contentItems:[{type:'inputText',text:canonical(value)}],success:true};account(result);calls.set(p.callId,{id:key,sha256:digest,response:copy(result)});rpcCalls.set(key,p.callId);send({id:frame.id,result});
 }
 function message(raw){
  try{
   if(state==='held'||state==='terminal'&&(!Object.hasOwn(raw,'method')||Object.hasOwn(raw,'id')||!terminalMetadata.has(raw.method)))fail('BOOTSTRAP_HOST_CLOSED');closed(raw,[],['id','method','params','result','error']);
   if(Object.hasOwn(raw,'id')&&!rpcId(raw.id))fail('BOOTSTRAP_HOST_RPC_ID');
   if(++messages>256||Buffer.byteLength(canonical(raw))+1>100000)fail('BOOTSTRAP_HOST_MESSAGES');account(raw);
   if(Object.hasOwn(raw,'method')){
    if(Object.hasOwn(raw,'id')){if(raw.method!=='item/tool/call')fail('BOOTSTRAP_HOST_SERVER_METHOD');tool(raw);}
    else notification(raw.method,raw.params);
   }else response(raw);
  }catch(cause){error??=cause;state='held';throw cause;}
 }
 transports.add(transport);const unsubscribe=transport.attach(Object.freeze({message,error:cause=>{error??=cause;state='held';}}));if(typeof unsubscribe!=='function')fail('BOOTSTRAP_HOST_TRANSPORT');
 return Object.freeze({start(token){requireOwner(token);if(state!=='new')fail('BOOTSTRAP_HOST_REUSE');state='initializing';request('initialize',{clientInfo:{name:'soloco-peer',version:'1'},capabilities:{experimentalApi:true}});},inspect(token){requireOwner(token);return {state,native_id:native,turn_id:turn,terminal:terminal?copy(terminal):null,final,submission,error:error?String(error.code??error.message):null,pending:pending.size};},close(token){requireOwner(token);unsubscribe();if(state!=='terminal')state='held';}});
}
