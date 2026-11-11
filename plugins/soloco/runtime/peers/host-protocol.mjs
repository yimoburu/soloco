import {inspectOriginalPeerContextDelivery,assertOriginalPeerContextDeliveryWire} from './peer-context-interpreter.mjs';
// ORDINARY SOURCE COMPONENT ONLY. No launcher, default transport, credentials,
// config access, human registration or native authentication lives here.
// Keep this module unrouted until a real adapter and effective host profile are
// qualified. Injected private capabilities/observations are not authentication.
import {canonical,peerDigest} from './ledger.mjs';

const copy=value=>JSON.parse(canonical(value));
const claimedTransports=new WeakSet();
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function closed(v,keys,label){if(!isObject(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('PROTOCOL_SHAPE',`Closed ${label} required`);return v;}
function text(v,label,max=200){if(typeof v!=='string'||!v.trim()||v.length>max||Buffer.from(v).toString('utf8')!==v||v.includes('\0'))fail('PROTOCOL_SHAPE',`Bounded ${label} required`);return v;}
function requestId(v){if(typeof v==='string')return text(v,'request id',200);if(Number.isSafeInteger(v)&&v>=0)return v;fail('PROTOCOL_SHAPE','String or safe integer request id required');}
function processIdentity(v,close=false){closed(v,close?['pid','started_at','close_observed','exit_code']:['pid','started_at'],'private process observation');if(!Number.isSafeInteger(v.pid)||v.pid<1||typeof v.started_at!=='string'||!Number.isFinite(Date.parse(v.started_at))||close&&v.close_observed!==true||v.exit_code!==undefined&&!Number.isSafeInteger(v.exit_code))fail('PROCESS_INVALID','Exact private process/start/close observation required');return {pid:v.pid,started_at:v.started_at,...(close?{close_observed:true}:{})};}
const EXECUTE=new Set(['task/submit','task/claim','task/cancel','task/transfer','home/propose','home/publish','message/send','notice/create','conflict/create','conflict/resolve']);
const INSPECT=new Set(['runtime/status','task/get','list']);
const IDENTITY=new Set(['root','company_id','actor','principal_id','session_id','generation','native_id','thread_id','threadId','turn_id','turnId','callId','attempt_id','incarnation','runtime_observer','observer_capability']);
function modelArgs(v){closed(v,Object.keys(v??{}),'tool arguments');for(const key of Object.keys(v))if(IDENTITY.has(key))fail('ACTOR_ARGUMENT','Model arguments cannot select identity or privileged handles');return v;}
const toolNames={membership:['soloco_context_header','soloco_context_read','soloco_context_submit'],peer:['soloco_peer_execute','soloco_peer_inspect']};
function toolSpec(name){
  const properties=name.endsWith('_read')?{sha256:{type:'string'},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:8192}}:name.endsWith('_submit')?{operation_id:{type:'string'},sha256:{type:'string'},content:{type:'string'}}:name.includes('_peer_')?{action:{type:'string'},args:{type:'object'}}:{};
  return {type:'function',name,description:'Private ordinary source protocol; capability is supplied by the protected composition, never by model identity fields.',inputSchema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};
}

// Fixed superset for NEW persistent threads only. Offered tools never widen
// the constructor-fixed per-turn mode allowlist above.
export function stablePeerHostTools(){return copy([...toolNames.membership,...toolNames.peer].map(toolSpec));}
// A distinct creation profile. A persisted old five-tool history is not this
// contract: the execute schema now advertises the one closed private stage.
export function stableTaskHostTools(){const tools=stablePeerHostTools();tools.find(t=>t.name==='soloco_peer_execute').inputSchema.properties.action.enum=[...EXECUTE,'software-publication/prepare'];return tools;}

/**
 * Trusted internal, synchronous structured-JSON transport contract:
 * transport.attach({message,close,error}) installs ONE private connection and
 * returns unsubscribe; send(frame) queues a JSON value without claiming ack.
 * No wire message can invoke the separate close callback. The future adapter
 * must own framing, actual OS observations, profile validation and credentials.
 *
 * admit returns an actual P8 {phase,context} or P2 {admitted,task,context} receipt.
 * bindNative returns {guard,channel} for P8 or {guard,client} for bound P2.
 * finish records through the actual private P8/P2 interface. All are private
 * software dependencies, NOT a human/operator or host authentication mechanism.
 */
export function createPeerHostProtocol(options){
  closed(options,['transport','owner','process','mode','resume_native_id','admit','bindNative','finish','limits','software_prepare','context_delivery'],'protocol options');
  const {transport,owner,admit,bindNative,finish}=options,mode=options.mode;
  const contextDelivery=options.context_delivery??null,delivery=contextDelivery?inspectOriginalPeerContextDelivery(contextDelivery):null;if(delivery&&delivery.delivery_kind!==(mode==='peer'?'task-context':'membership-assignment'))fail('PROTOCOL_CONTEXT_DELIVERY','Original delivery kind mismatch');
  if(options.software_prepare!==undefined&&(mode!=='peer'||typeof options.software_prepare!=='function'))fail('PROTOCOL_DEPENDENCY','Optional private preparation is peer-only');
  if(typeof owner!=='symbol'||!['membership','peer'].includes(mode)||!transport||typeof transport.send!=='function'||typeof transport.attach!=='function'||[admit,bindNative,finish].some(f=>typeof f!=='function'))fail('PROTOCOL_DEPENDENCY','Private owner, transport and lifecycle functions required');
  if(claimedTransports.has(transport))fail('CONNECTION_OWNED','This exact private transport capability already has an instruction owner');
  const process=processIdentity(copy(options.process)),resume=options.resume_native_id===undefined?null:text(options.resume_native_id,'stored resume native');
  const supplied=closed(copy(options.limits??{}),['messages','calls','frame_bytes','input_bytes','response_bytes','retained_bytes'],'limits');
  const limits={messages:1000,calls:128,frame_bytes:100000,input_bytes:100000,response_bytes:100000,retained_bytes:1000000,...supplied};
  for(const [k,v]of Object.entries(limits))if(!Number.isSafeInteger(v)||v<1||v>(k==='messages'?10000:k==='calls'?1000:k==='retained_bytes'?16000000:1000000))fail('PROTOCOL_LIMIT','Finite bounded protocol limits required');
  let state='new',admission=null,caps=null,native=null,turn=null,terminal=null,final=null,negative=null,closure=null,result=null,error=null,sequence=0,messages=0,retained=0,yielded=false,unsubscribe=null,threadNotice=null,turnNotice=null;
  let preparing=null;
  const pending=new Map(),responses=new Map(),calls=new Map(),rpcCalls=new Map(),items=new Map(),queued=[],agentMessages=[];
  const requireOwner=value=>{if(value!==owner)fail('INSTRUCTION_OWNER','Only the original private instruction owner may control this connection');};
  function hold(cause){error??=cause;state='held';throw cause;}
  function violation(code,message){try{fail(code,message);}catch(e){return hold(e);}}
  function sync(fn,...args){try{const value=fn(...args);if(value&&typeof value.then==='function'){Promise.resolve(value).catch(()=>{});return violation('ASYNC_CAPABILITY','Protocol capabilities must complete synchronously');}return value;}catch(e){return hold(e);}}
  function charge(value){const bytes=Buffer.byteLength(canonical(value));if(retained+bytes>limits.retained_bytes)return violation('PROTOCOL_RETAINED_LIMIT','Complete retained protocol evidence exceeds allowance');retained+=bytes;}
  function send(frame){const value=copy(frame);if(Buffer.byteLength(canonical(value))>limits.response_bytes)return violation('PROTOCOL_OUTPUT_LIMIT','Complete protocol output exceeds bound; nothing is clipped');return sync(transport.send.bind(transport),value);}
  function request(method,params){const id='soloco-peer-'+(++sequence),p={method,params:copy(params)};charge({id,...p});pending.set(id,p);send({id,method,params});return id;}
  function normalize(receipt){
    const r=copy(receipt);charge(r);
    if(mode==='membership'){
      if(r.phase?.value.kind!=='membership_phase'||r.phase.value.status!=='reserved'||r.phase.value.native_id!==null||r.phase.value.result_ref!==null)return violation('ADMISSION_REQUIRED','Actual reserved P8 phase receipt required');
      return {receipt:r,attempt_id:text(r.phase.value.attempt_id,'admitted attempt'),context_sha256:text(r.context?.sha256,'admitted context hash'),principal_id:text(r.phase.value.principal_id,'admitted principal'),generation:r.phase.value.generation};
    }
    if(r.admitted!==true||r.task?.value.status!=='running'||!r.task.value.attempt)return violation('ADMISSION_REQUIRED','Actual admitted P2 task receipt required');
    return {receipt:r,attempt_id:text(r.task.value.attempt.id,'admitted attempt'),context_sha256:text(r.context?.sha256,'admitted context hash'),principal_id:text(r.task.value.owner_principal_id,'admitted principal')};
  }
  function guard(){return sync(caps.guard);}
  function bind(thread){
    if(!isObject(thread)||typeof thread.id!=='string'||thread.parentThreadId!==null||thread.forkedFromId!==null||!Array.isArray(thread.turns)||!resume&&thread.turns.length)return violation('NATIVE_BINDING','Standalone host thread response required');
    text(thread.id,'host native identity');if(resume&&thread.id!==resume)return violation('NATIVE_CHANGED','Resumed host native identity changed');
    if(threadNotice&&threadNotice!==thread.id)return violation('NATIVE_CHANGED','Host thread notification and response diverged');
    native=thread.id;const bound=sync(bindNative,{native_id:native,observed_process:copy(process),admission:copy(admission.receipt)});
    closed(bound,mode==='membership'?['guard','channel']:['guard','client'],'private bound capabilities');
    if(typeof bound.guard!=='function')return violation('CAPABILITY_REQUIRED','Actual current-generation guard required');
    const methods=mode==='membership'?['header','read','submit']:['execute','inspect'],cap=mode==='membership'?bound.channel:bound.client;
    if(!cap||methods.some(name=>typeof cap[name]!=='function'))return violation('CAPABILITY_REQUIRED','Complete private P8/P2 capability required');
    caps=bound;guard();state='thread_ready';
  }
  function tool(params,id){
    closed(params,['threadId','turnId','callId','namespace','tool','arguments'],'dynamic call');
    if(state!=='running'||yielded||params.threadId!==native||params.turnId!==turn)return violation('CALL_BINDING','Tool call is not bound to the current unyielded private native turn');
    if(params.namespace!==null||!toolNames[mode].includes(params.tool))return violation('TOOL_FORBIDDEN','Tool/namespace is outside the fixed callback allowlist');
    const callId=text(params.callId,'host call id'),key=canonical(id),hash=peerDigest(params);guard();
    const previous=calls.get(callId);
    if(previous){if(previous.rpc!==key||previous.hash!==hash)return violation('CALL_REPLAY_MISMATCH','Host call identity already names another request');if(previous.response)send({id,result:copy(previous.response)});return;}
    if(preparing)return violation('PREPARATION_PENDING','A private preparation must settle before another callback');
    if(rpcCalls.has(key))return violation('RPC_ID_REUSED','Server request id already belongs to another host call');
    if(calls.size>=limits.calls)return violation('PROTOCOL_CALL_LIMIT','Private turn callback allowance exhausted');
    const args=modelArgs(copy(params.arguments));let value;
    if(mode==='membership'){
      if(params.tool==='soloco_context_header'){closed(args,[],'header request');value=sync(caps.channel.header);}
      else if(params.tool==='soloco_context_read'){closed(args,['sha256','offset','length'],'read request');value=sync(caps.channel.read,args);}
      else {closed(args,['operation_id','sha256','content'],'submission request');value=sync(caps.channel.submit,args);}
    }else{
      closed(args,['action','args'],'ordinary request');text(args.action,'ordinary action',100);const nested=modelArgs(copy(args.args));
      if(params.tool==='soloco_peer_execute'){
        if(args.action==='software-publication/prepare'){
          if(!options.software_prepare)return violation('PREPARATION_UNAVAILABLE','No genuine private software preparer is installed');
          // Reserve identity BEFORE invoking asynchronous IO. Identical in-flight
          // replay waits; it never repeats the operation. The backend additionally
          // owns durable operation/input replay across connections/lost replies.
          const entry={rpc:key,hash,response:null};calls.set(callId,entry);rpcCalls.set(key,callId);preparing=callId;
          let work;try{work=options.software_prepare(nested);}catch(error){return hold(error);}
          return Promise.resolve(work).then(prepared=>{
            if(state!=='running'||yielded)return violation('PREPARATION_OBSOLETE','Preparation completed after private turn ended');
            guard();const response={contentItems:[{type:'inputText',text:canonical(prepared)}],success:true};
            entry.response=copy(response);charge(response);preparing=null;send({id,result:response});
          }).catch(error=>hold(error));
        }
        if(!EXECUTE.has(args.action))return violation('ACTION_FORBIDDEN','Privileged or unsupported execution route');value=sync(caps.client.execute,args.action,nested);
      }
      else {if(!INSPECT.has(args.action))return violation('ACTION_FORBIDDEN','Unsupported or unpaged inspection route');value=sync(caps.client.inspect,args.action,nested);}
    }
    const response={contentItems:[{type:'inputText',text:canonical(value)}],success:true};
    // A callback can have durably committed before transport/output failure.
    // Preserve call identity, never repeat its side effect or claim rollback.
    charge(response);calls.set(callId,{rpc:key,hash,response});rpcCalls.set(key,callId);send({id,result:response});
  }
  function scoped(params){if(!isObject(params)||params.threadId!==native||params.turnId!==turn)return violation('TURN_BINDING','Notification is not bound to the current private native turn');}
  function notification(method,params){
    if(method==='thread/started'){
      closed(params,['thread'],'thread notification');
      const id=text(params?.thread?.id,'notified native');if(!['starting_thread','thread_ready'].includes(state)||native&&native!==id||threadNotice)return violation('NATIVE_CHANGED','Unmatched/replayed native thread notification');threadNotice=id;return;
    }
    if(state==='starting_turn'){if(queued.length>=limits.messages)return violation('PROTOCOL_LIMIT','Pre-response notification queue exceeded bound');const queuedFrame={method,params:copy(params)};charge(queuedFrame);queued.push(queuedFrame);return;}
    if(method==='turn/started'){
      closed(params,['threadId','turn'],'turn start notification');
      if(state!=='running'||params?.threadId!==native||params?.turn?.id!==turn||params.turn.status!=='inProgress'||turnNotice)return violation('TURN_BINDING','Unmatched/replayed turn start');turnNotice=turn;return;
    }
    if(method==='item/started'||method==='item/agentMessage/delta'){if(state!=='running')return violation('TURN_CLOSED','Item after terminal boundary');scoped(params);return;}
    if(method==='item/completed'){
      if(state!=='running')return violation('TURN_CLOSED','Item after terminal boundary');scoped(params);const item=params.item;
      closed(params,['item','threadId','turnId','completedAtMs'],'completed item notification');
      if(!isObject(item))return violation('PROTOCOL_SHAPE','Completed item required');const id=text(item.id,'completed item');
      if(items.has(id))return violation('ITEM_REPLAY','Completed item identity cannot be replayed');const hash=peerDigest(item);charge({id,hash});items.set(id,hash);
      if(item.type==='agentMessage'){
        text(item.text,'agent message',limits.frame_bytes);const observed={id,phase:item.phase??null,text:item.text};charge(observed);agentMessages.push(observed);
        try{const body=JSON.parse(item.text);if([body?.review,body?.qualification_result].some(r=>['Fail','Blocked'].includes(r?.verdict)))negative??=item.text;}catch{} // Retained text is not accepted semantic evidence here.
      }
      if(item.type==='agentMessage'&&item.phase==='final_answer'){
        const content=text(item.text,'final output',limits.frame_bytes);if(final!==null)return violation('OUTPUT_CONFLICT','Multiple final messages cannot replace one another');charge(content);final=content;
      }else if(!['agentMessage','reasoning','plan','userMessage','dynamicToolCall'].includes(item.type))return violation('UNEXPECTED_TOOL_ITEM','Unexpected execution/file/network item; effective isolation is not inferred');
      return;
    }
    if(method==='turn/completed'){
      if(preparing)return violation('PREPARATION_PENDING','A terminal cannot outrun private preparation');
      closed(params,['threadId','turn'],'terminal notification');
      if(state!=='running'||params?.threadId!==native||params?.turn?.id!==turn||!['completed','interrupted','failed'].includes(params.turn.status))return violation('TURN_BINDING','Exact terminal turn required');
      if(params.turn.status==='completed'&&(!final||params.turn.error!==null))return violation('OUTPUT_REQUIRED','Completed turn requires its actual final item and no error');
      if(params.turn.status==='completed'&&negative&&negative!==final)return violation('OUTPUT_CONFLICT','A later final cannot replace observed negative review evidence');
      charge(params.turn);terminal=copy(params.turn);state='terminal';return;
    }
    return violation('NOTIFICATION_UNKNOWN','Unsupported notification cannot establish native identity or physical closure');
  }
  function response(message){
    const key=canonical(message.id);if(responses.has(key))return violation('RESPONSE_REPLAY','RPC response cannot be replayed');
    const p=pending.get(message.id);if(!p)return violation('RESPONSE_UNMATCHED','No private request owns this response id');
    closed(message,['id','result','error'],'RPC response');if(Object.hasOwn(message,'result')===Object.hasOwn(message,'error'))return violation('PROTOCOL_SHAPE','One RPC result or error required');
    const hash=peerDigest(message);charge({id:message.id,hash});pending.delete(message.id);responses.set(key,hash);if(message.error!==undefined)return violation('RPC_ERROR','Host rejected the private request; no unchanged retry');
    if(p.method==='initialize'){
      if(state!=='initializing'||!isObject(message.result))return violation('RESPONSE_ORDER','Initialize response out of order');
      send({method:'initialized'});state='starting_thread';request(resume?'thread/resume':'thread/start',resume?{threadId:resume}:{dynamicTools:toolNames[mode].map(toolSpec)});
    }else if(['thread/start','thread/resume'].includes(p.method)){
      if(state!=='starting_thread')return violation('RESPONSE_ORDER','Native response out of order');bind(message.result?.thread);
    }else if(p.method==='turn/start'){
      const t=message.result?.turn;if(state!=='starting_turn'||!isObject(t)||t.status!=='inProgress')return violation('RESPONSE_ORDER','Admitted turn response required');turn=text(t.id,'host turn');state='running';if(yielded)request('turn/interrupt',{threadId:native,turnId:turn});while(queued.length&&state!=='held'){const n=queued.shift();notification(n.method,n.params);}
    }else if(p.method!=='turn/interrupt')return violation('RESPONSE_UNMATCHED','Unsupported private response');
  }
  function message(raw){
    if(['held','finished','closed'].includes(state))return violation('CONNECTION_HELD','Connection cannot accept more messages');
    try{
      const frame=copy(raw);closed(frame,['id','method','params','result','error'],'RPC frame');
      if(++messages>limits.messages||Buffer.byteLength(canonical(frame))>limits.frame_bytes)return violation('PROTOCOL_INPUT_LIMIT','Complete protocol input exceeds finite allowance');
      if(frame.method!==undefined){closed(frame,['id','method','params'],'RPC request/notification');text(frame.method,'RPC method');if(Object.hasOwn(frame,'id')){requestId(frame.id);if(frame.method!=='item/tool/call')return violation('REQUEST_UNKNOWN','Only the private dynamic tool request is supported');return tool(frame.params,frame.id);}else notification(frame.method,frame.params);}
      else {requestId(frame.id);response(frame);}
    }catch(e){return hold(e);}
  }
  function close(raw){
    if(closure)return violation('CLOSURE_REPLAY','Physical close callback is immutable');
    try{const p=processIdentity(copy(raw),true);if(p.pid!==process.pid||p.started_at!==process.started_at)return violation('PROCESS_CHANGED','Private close belongs to another process/start');charge(p);closure=p;
      if(state!=='terminal'||!terminal||!native)return violation('CLOSURE_INCOMPLETE','Physical close without exact native terminal retains obligations');
      const negative=terminal.status!=='completed'||raw.exit_code!==undefined&&raw.exit_code!==0;
      const packet={native_id:native,output:final,termination_confirmed:true,observed_process:p,...(negative?{error:{code:'TURN_NOT_SUCCESSFUL',message:'Native turn failed/interrupted or process exited unsuccessfully'}}:{})};
      const recorded=sync(finish,packet,copy(admission.receipt));charge(recorded);result=recorded;state='finished';unsubscribe?.();return result;
    }catch(e){return hold(e);}
  }
  claimedTransports.add(transport);unsubscribe=transport.attach(Object.freeze({message,close,error:cause=>hold(cause)}));if(typeof unsubscribe!=='function')fail('PROTOCOL_DEPENDENCY','Private transport must supply unsubscribe');
  return Object.freeze({
    start(token){requireOwner(token);if(state!=='new')return violation('ATTEMPT_CONSUMED','One connection admits only one physical inference turn');admission=normalize(sync(admit));state='initializing';request('initialize',{clientInfo:{name:'soloco-peer-host-protocol',version:'ordinary-source'},capabilities:{experimentalApi:true,requestAttestation:false}});},
    beginTurn(token,instruction){requireOwner(token);if(state!=='thread_ready'||yielded)return violation('TURN_ORDER','Native bind must precede context delivery and the only turn');guard();text(instruction,'host instruction',10000);let context;
      if(mode==='membership'){context=sync(caps.channel.header);if(context.sha256!==admission.context_sha256)return violation('CONTEXT_CHANGED','Exact admitted P8 context header changed');}
      else {context=sync(caps.client.inspect,'task/context',{task_id:admission.receipt.task.id});if(context.sha256!==admission.context_sha256)return violation('CONTEXT_CHANGED','Exact current admitted P2 context changed');}
      if(delivery&&delivery.payload_sha256!==admission.context_sha256)return violation('CONTEXT_CHANGED','Original framed complete payload changed');
      const input=contextDelivery?assertOriginalPeerContextDeliveryWire(contextDelivery,instruction,limits.input_bytes,limits.response_bytes).input:[{type:'text',text:instruction+'\nExact admitted context:\n'+canonical(context)}];if(Buffer.byteLength(canonical(input))>limits.input_bytes)return violation('PROTOCOL_INPUT_LIMIT','Whole turn input exceeds allowance; no clipping');state='starting_turn';request('turn/start',{threadId:native,input});
    },
    yield(token){requireOwner(token);if(!['thread_ready','starting_turn','running'].includes(state)||yielded)return violation('YIELD_ORDER','Only the original active instruction owner may yield once');yielded=true;if(turn)request('turn/interrupt',{threadId:native,turnId:turn});},
    snapshot(token){requireOwner(token);return {state,mode,native_id:native,turn_id:turn,attempt_id:admission?.attempt_id??null,principal_id:admission?.principal_id??null,messages,calls:calls.size,retained_bytes:retained,yield_requested:yielded,terminal:terminal?terminal.status:null,physical_close_observed:Boolean(closure),completed:state==='finished',hold:error?{code:String(error.code??'CAPABILITY_ERROR'),message:String(error.message??error)}:null};},
    evidence(token){requireOwner(token);return {native_id:native,turn_id:turn,process:copy(process),terminal:terminal?copy(terminal):null,physical_close:closure?copy(closure):null,raw_final_output:final,agent_messages:copy(agentMessages),attempt_id:admission?.attempt_id??null};},
    result(token){requireOwner(token);return result;},
    failure(token){requireOwner(token);return error;}
  });
}
