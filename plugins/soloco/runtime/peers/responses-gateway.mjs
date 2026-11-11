// Unrouted HTTP-only source component. No listener, provider credentials, OS
// confinement, operator registration, six-guard issuer, or native launcher.
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {canonical,peerDigest} from './ledger.mjs';
import * as model from './model.mjs';
import {stableTaskHostTools} from './host-protocol.mjs';
import {parseGatewayJSON,validateGatewaySSE} from './gateway-wire.mjs';

const fail=code=>{throw Object.assign(Error(code),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const copy=value=>JSON.parse(canonical(value));
const same=(a,b)=>canonical(a)===canonical(b);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const closed=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const nonempty=v=>typeof v==='string'&&v.trim().length>0&&Buffer.byteLength(v)<=10000&&!v.includes('\0')&&Buffer.from(v).toString('utf8')===v;
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const identity=new Set(['root','company_id','actor','principal_id','session_id','generation','native_id','thread_id','threadId','turn_id','turnId','callId','attempt_id','incarnation','runtime_observer','observer_capability']);
const inspectActions=new Set(['runtime/status','task/get','list']);
const claimedTransports=new WeakSet();

// EXACT fixed stable-five subset of c407 tools::parse_tool_input_schema ->
// JsonSchema serde -> ResponsesApiTool. Not a generic schema converter. Serde
// drops numeric min/max; args below still enforce the ORIGINAL SDK bounds.
function parameters(s){
 if(!object(s))fail('GATE_SOURCE_SCHEMA');
 for(const key of Object.keys(s))if(!['type','properties','required','additionalProperties','enum','minimum','maximum'].includes(key))fail('GATE_SOURCE_SCHEMA');
 const out={type:s.type};
 if(s.enum!==undefined)out.enum=copy(s.enum);
 if(s.type==='object')out.properties=Object.fromEntries(Object.entries(s.properties??{}).map(([key,value])=>[key,parameters(value)]));
 if(s.required!==undefined)out.required=copy(s.required);
 if(s.additionalProperties!==undefined)out.additionalProperties=s.additionalProperties;
 return out;
}
export function expectedResponsesTools(){return stableTaskHostTools().map(t=>{if(Buffer.byteLength(canonical(t.inputSchema))>5000)fail('GATE_SOURCE_SCHEMA');return {type:'function',name:t.name,description:t.description,strict:false,parameters:parameters(t.inputSchema)};});}
function checkValue(value,schema){
 if(schema.enum&&!schema.enum.some(v=>same(v,value)))fail('GATE_TOOL_ARGUMENTS');
 if(schema.type==='object'){
  if(!object(value))fail('GATE_TOOL_ARGUMENTS');
  const properties=schema.properties??{};
  if((schema.required??[]).some(key=>!Object.hasOwn(value,key))||schema.additionalProperties===false&&Object.keys(value).some(key=>!Object.hasOwn(properties,key)))fail('GATE_TOOL_ARGUMENTS');
  for(const [key,child]of Object.entries(properties))if(Object.hasOwn(value,key))checkValue(value[key],child);
 }else if(schema.type==='string'){
  if(typeof value!=='string'||Buffer.from(value).toString('utf8')!==value)fail('GATE_TOOL_ARGUMENTS');
 }else if(schema.type==='integer'){
  if(!Number.isSafeInteger(value)||schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)fail('GATE_TOOL_ARGUMENTS');
 }else fail('GATE_SOURCE_SCHEMA');
}
function checkArguments(name,args){
 const spec=stableTaskHostTools().find(t=>t.name===name);if(!spec)fail('GATE_TOOL_NAME');checkValue(args,spec.inputSchema);
 if(!['soloco_peer_execute','soloco_peer_inspect'].includes(name))fail('GATE_CALLBACK_MODE');
 if(name==='soloco_peer_inspect'&&!inspectActions.has(args.action))fail('GATE_TOOL_ARGUMENTS');
 if(Object.keys(args.args).some(key=>identity.has(key)))fail('GATE_ACTOR_ARGUMENT');
}
const internalCodes=new Set(['GATE_SOURCE_SCHEMA','GATE_TOOL_ARGUMENTS','GATE_TOOL_NAME','GATE_CALLBACK_MODE','GATE_ACTOR_ARGUMENT','GATE_OBSERVATION_HELD','GATE_ARGUMENT','GATE_DEPENDENCY','GATE_TRANSPORT_OWNED','GATE_LIMIT','GATE_OWNER','GATE_HANDLE','GATE_ACTOR','GATE_BINDING_CHANGED','GATE_ADMISSION','GATE_EXPIRED','GATE_TRANSPORT_UNCONFIGURED','GATE_TRANSPORT_UNKNOWN','GATE_CAPACITY','GATE_ATTEMPT_CONSUMED','GATE_REQUEST_CAPACITY','GATE_HTTP_ONLY','GATE_REQUEST_CONTRACT','GATE_TIMEOUT','GATE_RESPONSE_CONTRACT','GATE_RESPONSE_CAPACITY','GATE_RESPONSE_PROGRESS','GATE_CLOSURE_UNKNOWN','GATEWAY_JSON_INVALID','GATEWAY_SSE_INVALID']);
function safeCode(error){let code;try{code=error?.code;}catch{return 'GATE_OBSERVATION_HELD';}return internalCodes.has(code)?code:'GATE_OBSERVATION_HELD';}
const typed=Object.getPrototypeOf(Uint8Array.prototype);
const byteLength=Object.getOwnPropertyDescriptor(typed,'byteLength').get;
const byteOffset=Object.getOwnPropertyDescriptor(typed,'byteOffset').get;
const arrayBuffer=Object.getOwnPropertyDescriptor(typed,'buffer').get;
// Intrinsics ignore spoofed .length/.byteLength/.buffer properties on a
// Buffer/subclass. No incoming byte allocation occurs until the cap is known.
function boundedView(value,remaining,capacityCode,progressCode){
 if(!(value instanceof Uint8Array))fail(capacityCode);
 const length=byteLength.call(value);
 if(!Number.isSafeInteger(length)||length>remaining)fail(capacityCode);
 if(length<1)fail(progressCode);
 const backing=arrayBuffer.call(value);
 if(typeof SharedArrayBuffer!=='undefined'&&backing instanceof SharedArrayBuffer)fail(capacityCode);
 return new Uint8Array(backing,byteOffset.call(value),length);
}

/** Source-only private adapter. Constructor data is policy, NOT authentication.
 * Actual P1/P2/P8 derive the kernel binding. No JSON caller can select an actor,
 * arbitrary expected body/hash, endpoint, tools or registration proof. The fixed
 * cold HTTP envelope includes the COMPLETE actual admitted context. Existing
 * P8e persistent history/Lite/WS is deliberately unsupported, not rewritten.
 */
export function createProtectedResponsesGateway(options={}){
 if(!object(options)||Object.keys(options).some(k=>!['owner','ledger','membership','model','instructions','transport','limits'].includes(k)))fail('GATE_ARGUMENT');
 const {owner,ledger,membership,transport}=options;
 if(typeof owner!=='symbol'||!ledger?.read||!membership?.host?.activeClient||!nonempty(options.model)||!Array.isArray(options.instructions)||!options.instructions.length||options.instructions.length>16||options.instructions.some(v=>!nonempty(v)))fail('GATE_DEPENDENCY');
 if(transport!==undefined&&(!object(transport)||typeof transport.exchange!=='function'))fail('GATE_DEPENDENCY');
 if(transport&&claimedTransports.has(transport))fail('GATE_TRANSPORT_OWNED');if(transport)claimedTransports.add(transport);
 const selectedModel=options.model,instructions=copy(options.instructions),tools=expectedResponsesTools();
 const limits={timeout_ms:10000,request_bytes:100000,response_bytes:100000,max_events:1000,max_leases:64,...(options.limits??{})};
 for(const [key,value]of Object.entries(limits))if(!Number.isSafeInteger(value)||value<1||value>({timeout_ms:120000,request_bytes:100000,response_bytes:100000,max_events:1000,max_leases:64}[key]??0))fail('GATE_LIMIT');
 const exchange=transport?transport.exchange.bind(transport):null;
 const handles=new WeakMap(),records=[],attempts=new Set();let occupied=null;
 const token=t=>{if(t!==owner)fail('GATE_OWNER');};
 const record=h=>{const r=handles.get(h);if(!r)fail('GATE_HANDLE');return r;};
 function deriveBinding(taskId){
  const first=ledger.read(tx=>{const t=tx.get('tasks',taskId),p=t&&tx.get('principals',t.value.owner_principal_id);if(!p)fail('GATE_ACTOR');return {principal_id:p.id,generation:p.value.generation,native_id:p.value.native_id,enrollment_id:p.value.enrollment_id};});
  membership.host.activeClient({enrollment_id:first.enrollment_id});
  return ledger.read(tx=>{
   const task=tx.get('tasks',taskId),t=task?.value,a=t?.attempt,p=task&&tx.get('principals',t.owner_principal_id),v=p?.value;
   if(!p||v.status!=='active'||!v.membership_qualification||!uuid(v.native_id)||!same(first,{principal_id:p.id,generation:v.generation,native_id:v.native_id,enrollment_id:v.enrollment_id})||t.status!=='running'||!a?.id||!a.context||!model.validateContext(tx,a.context))fail('GATE_BINDING_CHANGED');
   const slot=tx.get('slots',taskId),effect=tx.get('effects',a.effect_id);
   if(slot?.value.status!=='active'||slot.value.attempt_id!==a.id||effect?.value.kind!=='native'||!['reserved','sent'].includes(effect.value.status)||effect.value.task_id!==taskId||effect.value.request_sha256!==a.request_sha256)fail('GATE_ADMISSION');
   const event=tx.events({after:effect.created_seq-1,limit:1}).items[0];if(event?.type!=='task/admit'||event.principal_id!=='scheduler')fail('GATE_ADMISSION');
   const changes=event.payload.changes.filter(c=>c.family==='commands');if(changes.length!==1)fail('GATE_ADMISSION');
   const c=changes[0],command=tx.getVersion({family:'commands',id:c.id,revision:c.revision,sha256:c.sha256}),result=command?.value?.result;
   if(command?.value?.action!=='task/admit'||command.value.principal_id!=='scheduler'||result?.admitted!==true||result.task.id!==taskId||result.task.value.attempt.id!==a.id||!same(result.context,a.context))fail('GATE_ADMISSION');
   const value={company_id:ledger.company_id,root_sha256:peerDigest(ledger.root),task:ref('tasks',task),principal:ref('principals',p),principal_id:p.id,generation:v.generation,native_id:v.native_id,enrollment_id:v.enrollment_id,attempt_id:a.id,context_sha256:a.context.sha256,request_sha256:a.request_sha256,slot:ref('slots',slot),effect:ref('effects',effect),admission:ref('commands',command)};
   const expiry=a.context.grant?.value?.expires_at;
   if(typeof expiry!=='string'||!Number.isFinite(Date.parse(expiry))||Date.now()>=Date.parse(expiry))fail('GATE_EXPIRED');
   return {binding:value,context:copy(a.context)};
  });
 }
 function binding(taskId){try{return deriveBinding(taskId);}catch(error){fail(safeCode(error));}}
 function current(r){const fresh=binding(r.binding.task.id);if(!same(fresh.binding,r.binding))fail('GATE_BINDING_CHANGED');return fresh;}
 function expected(context){return {model:selectedModel,stream:true,input:[...instructions.map(text=>({type:'message',role:'developer',content:[{type:'input_text',text}]})),{type:'message',role:'user',content:[{type:'input_text',text:context.text}]}],tools:copy(tools),tool_choice:'auto',parallel_tool_calls:true,reasoning:null,store:false,include:[]};}
 function publicRecord(r){return {binding:copy(r.binding),state:r.state,request_sha256:r.request_sha256??null,request_bytes:r.request_bytes??null,response_sha256:r.response_sha256??null,response_bytes:r.response_bytes??0,transport_started:r.started,private_transport_invocations:r.started?1:0,actual_upstream_network_write:'not observed by this leaf',transport_close_observed:r.closed,transport_closure_replay:r.closure_replay===true,whole_scope_closure:'not established',code:r.code??null,result:r.result?copy(r.result):null,qualified_host_guards:false};}
 return Object.freeze({
  prepare(t,input){token(t);if(!transport)fail('GATE_TRANSPORT_UNCONFIGURED');if(!closed(input,['task_id'])||!nonempty(input.task_id))fail('GATE_ARGUMENT');if(occupied&&(!occupied.closed||occupied.closure_replay))fail('GATE_TRANSPORT_UNKNOWN');if(records.length>=limits.max_leases)fail('GATE_CAPACITY');
   const fresh=binding(input.task_id),key=peerDigest([fresh.binding.company_id,fresh.binding.task.id,fresh.binding.attempt_id]);if(attempts.has(key))fail('GATE_ATTEMPT_CONSUMED');
   const value=expected(fresh.context),bytes=Buffer.byteLength(canonical(value));if(bytes>limits.request_bytes)fail('GATE_REQUEST_CAPACITY');
   const r={binding:fresh.binding,expected:value,state:'prepared',started:false,closed:false,result:null};current(r);attempts.add(key);records.push(r);const h=Object.freeze(Object.create(null));handles.set(h,r);return h;
  },
  request(t,h){token(t);const r=record(h);if(r.state!=='prepared')fail('GATE_ATTEMPT_CONSUMED');current(r);return {method:'POST',path:'/v1/responses',headers:{'content-type':'application/json'},body:Buffer.from(canonical(r.expected))};},
  async forward(t,h,request){token(t);const r=record(h);if(r.state!=='prepared')fail('GATE_ATTEMPT_CONSUMED');r.state='validating';const cutoff=performance.now()+limits.timeout_ms;const timeCut=()=>{if(performance.now()>=cutoff)fail('GATE_TIMEOUT');};let iterator,timer,rejectDeadline;const abort=new AbortController();
   const deadline=new Promise((_,reject)=>{rejectDeadline=reject;});deadline.catch(()=>{});
   const wait=p=>Promise.race([p,deadline]);
   try{
    if(occupied&&(!occupied.closed||occupied.closure_replay))fail('GATE_TRANSPORT_UNKNOWN');
    if(!closed(request,['method','path','headers','body']))fail('GATE_HTTP_ONLY');
    const method=request.method,requestPath=request.path,headers=request.headers,requestBody=request.body;
    if(method!=='POST'||requestPath!=='/v1/responses'||!closed(headers,['content-type'])||headers['content-type']!=='application/json'||!Buffer.isBuffer(requestBody))fail('GATE_HTTP_ONLY');
    const bytes=Buffer.from(boundedView(requestBody,limits.request_bytes,'GATE_REQUEST_CAPACITY','GATE_HTTP_ONLY')),value=parseGatewayJSON(bytes,{max_bytes:limits.request_bytes,max_depth:32});
    if(!same(value,r.expected))fail('GATE_REQUEST_CONTRACT');
    r.request_sha256=sha(bytes);r.request_bytes=bytes.length;current(r);timeCut();
    // No awaited provider runs between this final binding/expiry cut and the
    // one upstream invocation. A transport exception never permits a retry.
    r.state='waiting_for_transport';occupied=r;
    timer=setTimeout(()=>{abort.abort();rejectDeadline(Object.assign(Error('GATE_TIMEOUT'),{code:'GATE_TIMEOUT'}));},Math.max(1,cutoff-performance.now()));
    const onClose=()=>{if(r.closed){r.closure_replay=true;return;}r.closed=true;};
    const response=await wait(Promise.resolve().then(()=>{current(r);timeCut();r.state='sent';r.started=true;return exchange({method:'POST',path:'/v1/responses',headers:{'content-type':'application/json'},body:bytes,signal:abort.signal,onClose});}));
    timeCut();if(!closed(response,['status','headers','body']))fail('GATE_RESPONSE_CONTRACT');
    const status=response.status,responseHeaders=response.headers,responseBody=response.body;
    if(status!==200||!closed(responseHeaders,['content-type'])||responseHeaders['content-type']!=='text/event-stream')fail('GATE_RESPONSE_CONTRACT');
    const iterate=responseBody?.[Symbol.asyncIterator];if(typeof iterate!=='function')fail('GATE_RESPONSE_CONTRACT');
    timeCut();iterator=iterate.call(responseBody);timeCut();
    const readNext=iterator?.next;if(typeof readNext!=='function')fail('GATE_RESPONSE_CONTRACT');
    // One fixed bounded allocation; empty chunks cannot grow an array or keep
    // a microtask-only iterator alive while timer callbacks are starved.
    const capture=Buffer.alloc(limits.response_bytes);let count=0;
    for(;;){
     timeCut();const next=await wait(readNext.call(iterator));timeCut();
     if(!object(next))fail('GATE_RESPONSE_CONTRACT');const done=next.done;if(typeof done!=='boolean')fail('GATE_RESPONSE_CONTRACT');timeCut();if(done)break;
     const chunk=next.value;timeCut();const view=boundedView(chunk,limits.response_bytes-count,'GATE_RESPONSE_CAPACITY','GATE_RESPONSE_PROGRESS');timeCut();
     capture.set(view,count);count+=view.byteLength;r.response_bytes=count;timeCut();
    }
    const body=capture.subarray(0,count);r.response_sha256=sha(body);r.response_bytes=count;
    const result=validateGatewaySSE(body,{allowed_calls:['soloco_peer_execute','soloco_peer_inspect'],validate_arguments:checkArguments,max_events:limits.max_events});
    if(!r.closed||r.closure_replay)fail('GATE_CLOSURE_UNKNOWN');current(r);timeCut();
    r.state='validated';r.result=copy(result);return {status:200,headers:{'content-type':'text/event-stream'},body,receipt:publicRecord(r)};
   }catch(error){r.code=safeCode(error);r.state=r.started?'held_after_send':'rejected_before_send';abort.abort();if(iterator?.return)try{Promise.resolve(iterator.return()).catch(()=>{});}catch{}throw Object.assign(Error(r.code),{code:r.code});}
   finally{clearTimeout(timer);r.expected=null;if(occupied===r&&(!r.started||r.closed&&!r.closure_replay))occupied=null;}
  },
  inspect(t,h){token(t);return h?publicRecord(record(h)):{requests:records.map(publicRecord),private_transport_invocations:records.filter(r=>r.started).length,P2_admitted_attempt_units:'unchanged by gate',configured:Boolean(transport),whole_scope_closure:'not established',operator_registration:'not issued',six_host_guards:'not qualified'};}
 });
}
