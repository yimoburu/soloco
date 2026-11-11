import {createOriginalPeerMembershipRestriction} from './peer-context-interpreter.mjs';
// Unrouted trusted source component. No qualification issuer or operator
// registration exists here. Missing private guards hold before admission/spawn.
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {TextDecoder} from 'node:util';
import {createPeerHostProtocol,stablePeerHostTools,stableTaskHostTools} from './host-protocol.mjs';
import {originalProtectedPeerContextInterpreter,assertOriginalProtectedPeerContextStatic,bindOriginalProtectedPeerContext,isOriginalProtectedCompanionLaunch,isOriginalProtectedCodexLaunch,bindOriginalProtectedCodexLaunch,spawnOriginalProtectedCodex,inspectOriginalProtectedCodexLaunch,assertOriginalProtectedCodexBoundary} from './protected-codex-domain.mjs';

export const CODEX_BINARY='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const businessGuards=['profile','instructions','external','actor'];
const guardNames=[...businessGuards,'closure'];
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const copy=v=>JSON.parse(JSON.stringify(v));
const digest=v=>createHash('sha256').update(v).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function closed(v,keys){if(!object(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('HOST_ARGUMENT');return v;}
function text(v,max=10000){if(typeof v!=='string'||!v.length||v.length>max||v.includes('\0')||Buffer.from(v).toString('utf8')!==v)fail('HOST_ARGUMENT');return v;}
function absolute(v){text(v,4096);if(!v.startsWith('/')||v.includes('/../')||v.includes('/./'))fail('HOST_PATH');return v;}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// JSON.parse validates syntax; this scan additionally rejects duplicate keys,
// excessive nesting and malformed Unicode, before a private callback sees data.
function decode(line){
  let depth=0,stack=[];
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      const begin=i++;
      for(;i<line.length;i++){if(line[i]==='\\'){i++;continue;}if(line[i]==='"')break;}
      const value=JSON.parse(line.slice(begin,i+1));
      if(Buffer.from(value).toString('utf8')!==value)fail('WIRE_UNICODE');
      const top=stack.at(-1);
      if(top?.object&&top.key){if(top.keys.has(value))fail('WIRE_DUPLICATE_KEY');top.keys.add(value);top.key=false;}
    }else if(c==='{'||c==='['){if(++depth>32)fail('WIRE_DEPTH');stack.push({object:c==='{',key:c==='{',keys:new Set()});}
    else if(c==='}'||c===']'){depth--;stack.pop();}
    else if(c===','&&stack.at(-1)?.object)stack.at(-1).key=true;
  }
  const result=JSON.parse(line);
  if(!object(result))fail('WIRE_FRAME');
  return result;
}

/**
 * Private software composition only. Guards are synchronous capabilities, not
 * proof-shaped data. Their existence does NOT authenticate an operator or host.
 * Actual producers remain unavailable. Controlled tests explicitly supply
 * synthetic guards; no model tool exposes this factory or its owner token.
 */
export function createCodexMembershipHost(options){
  closed(options,['owner','membership','launch','qualification','spawn_child','now','limits','tool_profile','on_thread','on_admission','protected_launch']);
  const {owner,membership}=options;
  const protectedLaunch=options.protected_launch;
  const interpreter=protectedLaunch===undefined?null:originalProtectedPeerContextInterpreter(owner,protectedLaunch);if(options.tool_profile==='stable-five-v3-context-contract-v1'&&!interpreter||interpreter&&options.tool_profile!=='stable-five-v3-context-contract-v1')fail('CONTEXT_INTERPRETER_UNAVAILABLE');let contextDelivery=null;
  if(protectedLaunch!==undefined&&(!isOriginalProtectedCodexLaunch(owner,protectedLaunch)||options.spawn_child!==undefined))fail('HOST_ORIGINAL_PROTECTED_LAUNCH_REQUIRED');
  if(options.tool_profile!==undefined&&!['stable-five-v1','stable-five-v2','stable-five-v3-context-contract-v1'].includes(options.tool_profile)||options.on_thread!==undefined&&typeof options.on_thread!=='function'||options.on_admission!==undefined&&typeof options.on_admission!=='function')fail('HOST_ARGUMENT');
  if(typeof owner!=='symbol'||!membership?.operator?.admit||!membership?.host?.bind||!membership.host.channel||!membership.host.finish||!membership.host.close)fail('HOST_DEPENDENCY');
  const launch=copy(closed(options.launch,['cwd','profile_id','instruction_sources','base_instructions','developer_instructions','environment']));
  if(protectedLaunch!==undefined)bindOriginalProtectedCodexLaunch(owner,protectedLaunch,launch);
  absolute(launch.cwd);text(launch.profile_id,80);
  if(!/^[A-Za-z0-9_.-]+$/.test(launch.profile_id)||launch.profile_id.startsWith(':'))fail('HOST_PROFILE');
  if(!Array.isArray(launch.instruction_sources)||new Set(launch.instruction_sources).size!==launch.instruction_sources.length)fail('HOST_INSTRUCTIONS');
  launch.instruction_sources.forEach(absolute);
  text(launch.base_instructions);text(launch.developer_instructions);
  closed(launch.environment,['PATH','HOME','CODEX_HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL']);
  for(const value of Object.values(launch.environment))text(value,8192);
  const limits={total_ms:60000,grace_ms:250,term_ms:500,kill_ms:1000,frame_bytes:100000,wire_bytes:2000000,transcript_bytes:2000000,...closed(options.limits??{},['total_ms','grace_ms','term_ms','kill_ms','frame_bytes','wire_bytes','transcript_bytes'])};
  for(const [key,value]of Object.entries(limits)){
    const max=key==='total_ms'?120000:key.endsWith('_ms')?5000:4000000;
    if(!Number.isSafeInteger(value)||value<1||value>max)fail('HOST_LIMIT');
  }
  const spawnChild=options.spawn_child??spawn,now=options.now??Date.now;
  if(typeof spawnChild!=='function'||typeof now!=='function')fail('HOST_DEPENDENCY');
  const guards=options.qualification?{...closed(options.qualification,guardNames)}:null;
  let consumed=false,child=null,process=null,protocol=null,admission=null,request=null,native=null,closeInfo=null,firstError=null,answer=null;
  let state='new',buffer='',wireBytes=0,transcriptBytes=0,ended=false,settled=false,closing=false,forced=false;
  const transcript=[],timers=new Set(),decoder=new TextDecoder('utf-8',{fatal:true});
  let resolveRun;
  const requireOwner=token=>{if(token!==owner)fail('INSTRUCTION_OWNER');};
  const setTimer=(fn,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;};
  const boundary=(stage,extra={})=>({stage,enrollment_id:request?.enrollment_id??null,phase:request?.phase??null,launch:copy(launch),process:process?copy(process):null,native_id:native,...extra});
  function check(stage,names=businessGuards,extra={}){
    if(protectedLaunch!==undefined){if(interpreter&&stage==='before_admission')assertOriginalProtectedPeerContextStatic(owner,protectedLaunch);else assertOriginalProtectedCodexBoundary(owner,protectedLaunch,stage);}
    if(protectedLaunch!==undefined&&isOriginalProtectedCompanionLaunch(owner,protectedLaunch))return;
    if(!guards||guardNames.some(name=>typeof guards[name]!=='function'))fail('HOST_QUALIFICATION_HELD');
    for(const name of names){const result=guards[name](boundary(stage,extra));if(result!==undefined){if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});fail('HOST_GUARD_RESULT');}}
  }
  function retain(direction,line){
    const bytes=Buffer.byteLength(line);
    if(transcriptBytes+bytes>limits.transcript_bytes)fail('HOST_TRANSCRIPT_BOUND');
    transcriptBytes+=bytes;transcript.push({direction,bytes,sha256:digest(line),text:line});
  }
  function finishOutcome(){
    if(settled)return;settled=true;for(const timer of timers)clearTimeout(timer);timers.clear();
    state=answer?.accepted===true?'returned':'held';
    resolveRun({status:state,accepted:answer?.accepted===true,result:answer,code:firstError?.code??(answer?'RESULT_NOT_ACCEPTED':'PHYSICAL_CLOSURE_UNKNOWN'),physical_close_observed:Boolean(closeInfo),termination_qualified:Boolean(closeInfo?.qualified),native_id:native,process:process?copy(process):null,attempt_id:admission?.phase?.value.attempt_id??null,forced});
  }
  function remember(error){firstError??=error instanceof Error?error:Object.assign(Error('HOST_CALLBACK_ERROR'),{cause:error});}
  function shutdown(){
    if(closing||settled)return;closing=true;
    try{child?.stdin.end();}catch(error){remember(error);}
    setTimer(()=>{if(closeInfo)return;try{child?.kill('SIGTERM');}catch(error){remember(error);}
      setTimer(()=>{if(closeInfo)return;forced=true;try{child?.kill('SIGKILL');}catch(error){remember(error);}
        setTimer(finishOutcome,limits.kill_ms);
      },limits.term_ms);
    },limits.grace_ms);
  }
  function hold(error){remember(error);state='held';shutdown();if(!child)finishOutcome();}
  function received(frame){
    if(firstError||settled)return;
    if(frame.id===threadRequest&&Object.hasOwn(frame,'result')){
      const response=frame.result,t=response?.thread;
      if(!t||!uuid(t.id)||!uuid(t.sessionId)||t.parentThreadId!==null||t.forkedFromId!==null||!Array.isArray(t.turns)||t.turns.length||t.canAcceptDirectInput!==true||t.ephemeral!==false)fail('HOST_NATIVE_BINDING');
      if(response.cwd!==launch.cwd||!equal(response.runtimeWorkspaceRoots,[launch.cwd])||response.approvalPolicy!=='never'||response.activePermissionProfile?.id!==launch.profile_id||!equal(response.instructionSources,launch.instruction_sources))fail('HOST_EFFECTIVE_METADATA');
      check('thread_response',businessGuards,{response:copy(response)});
    }
    callbacks.message(frame);
    const snap=protocol.snapshot(owner);
    if(snap.state==='thread_ready'){check('before_context');protocol.beginTurn(owner,request.instruction);}
    if(protocol.snapshot(owner).state==='terminal')shutdown();
  }
  function data(chunk,stderr=false){
    if(settled)return;
    try{
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);wireBytes+=bytes.length;
      if(wireBytes>limits.wire_bytes)fail('HOST_WIRE_BOUND');
      if(stderr||firstError)return; // Raw stderr is neither retained nor returned.
      buffer+=decoder.decode(bytes,{stream:true});
      let split;
      while((split=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,split);buffer=buffer.slice(split+1);
        if(Buffer.byteLength(line)>limits.frame_bytes)fail('HOST_FRAME_BOUND');
        if(!line.trim())fail('WIRE_EMPTY_FRAME');
        retain('in',line+'\n');received(decode(line));
        if(firstError)return;
      }
      if(Buffer.byteLength(buffer)>limits.frame_bytes)fail('HOST_FRAME_BOUND');
    }catch(error){hold(error);}
  }
  let callbacks=null,threadRequest=null;
  const transport={
    attach(value){if(callbacks)fail('HOST_TRANSPORT_OWNED');callbacks=value;return ()=>{};},
    send(frame){
      check(frame.method==='turn/start'?'before_turn':'before_wire');
      const value=copy(frame);
      if(value.method==='thread/resume')fail('HOST_RESUME_HELD');
      if(value.method==='thread/start'){
        threadRequest=value.id;
        value.params={...value.params,...(options.tool_profile?{dynamicTools:options.tool_profile!=='stable-five-v1'?stableTaskHostTools():stablePeerHostTools()}:{}),cwd:launch.cwd,runtimeWorkspaceRoots:[launch.cwd],permissions:launch.profile_id,approvalPolicy:'never',baseInstructions:launch.base_instructions,developerInstructions:launch.developer_instructions,ephemeral:false,environments:[]};
      }
      const line=JSON.stringify(value)+'\n';
      if(Buffer.byteLength(line)>limits.frame_bytes||(child.stdin.writableLength??0)+Buffer.byteLength(line)>limits.frame_bytes)fail('HOST_OUTPUT_BOUND');
      retain('out',line);child.stdin.write(line); // false means queued; never resend.
    }
  };
  function observeClose(code,signal){
    if(closeInfo||settled)return;
    try{
      if(!ended){buffer+=decoder.decode();if(buffer.length)fail('WIRE_UNTERMINATED_FRAME');}
    }catch(error){remember(error);}
    closeInfo={code,signal,qualified:false};
    if(process&&native){
      try{
        check('physical_close',['closure'],{close:copy(closeInfo)});
        closeInfo.qualified=true;
        if(!firstError&&protocol?.snapshot(owner).state==='terminal'){
          try{answer=callbacks.close({...process,close_observed:true,...(Number.isInteger(code)?{exit_code:code}:{})});}catch(error){remember(error);}
        }
        if(!answer)membership.host.close({operation_id:operation+'-close',...binding(),termination_confirmed:true,observed_process:{...process,close_observed:true}});
      }catch(error){remember(error);}
    }
    finishOutcome();
  }
  const operation='codex-host-'+randomUUID();
  const binding=()=>({enrollment_id:request.enrollment_id,phase:request.phase,attempt_id:admission.phase.value.attempt_id});
  return Object.freeze({
    async run(token,input){
      requireOwner(token);if(consumed)fail('HOST_ATTEMPT_CONSUMED');consumed=true;
      closed(input,['enrollment_id','phase','reviewer_principal_id','instruction']);
      request=copy(input);text(request.enrollment_id,200);text(request.instruction);
      if(!['reconstruction','review'].includes(request.phase)||request.phase==='review'&&typeof request.reviewer_principal_id!=='string'||request.phase==='reconstruction'&&Object.hasOwn(request,'reviewer_principal_id'))fail('HOST_ARGUMENT');
      const result=new Promise(resolve=>{resolveRun=resolve;});
      try{
        check('before_admission');
        const wireRestriction=interpreter?createOriginalPeerMembershipRestriction(interpreter,{instruction:request.instruction,frame_bytes:Math.min(limits.frame_bytes,100000),wire_bytes:limits.wire_bytes}):null;
        admission=membership.operator.admit({operation_id:operation+'-admit',enrollment_id:request.enrollment_id,phase:request.phase,...(request.phase==='review'?{reviewer_principal_id:request.reviewer_principal_id}:{})},wireRestriction);
        if(interpreter){if(typeof membership.host.prepareDelivery!=='function')fail('CONTEXT_INTERPRETER_UNAVAILABLE');contextDelivery=membership.host.prepareDelivery({enrollment_id:request.enrollment_id,phase:request.phase,attempt_id:admission.phase.value.attempt_id},interpreter);bindOriginalProtectedPeerContext(owner,protectedLaunch,contextDelivery,request.instruction);}
        if(options.on_admission){
          // Notification of the actual reserved P1 phase only. The source-owned
          // consumer rechecks its ledger; no callback result replaces admission,
          // interpreter support or subsequent native/process observations.
          const p=admission.phase,observed=options.on_admission(Object.freeze({family:'work_items',id:p.id,revision:p.revision,sha256:p.sha256}));
          if(observed!==undefined){if(observed&&typeof observed.then==='function')Promise.resolve(observed).catch(()=>{});fail('HOST_GUARD_RESULT');}
        }
        check('before_spawn');state='starting';
        child=protectedLaunch!==undefined?spawnOriginalProtectedCodex(owner,protectedLaunch):spawnChild(CODEX_BINARY,['app-server','--listen','stdio://','-c','approval_policy="never"'],{cwd:launch.cwd,env:copy(launch.environment),stdio:['pipe','pipe','pipe'],shell:false});
        if(child&&typeof child.then==='function'){Promise.resolve(child).catch(()=>{});child=null;fail('HOST_ASYNC_LAUNCHER');}
        if(!child?.once||!child?.stdout?.on||!child?.stderr?.on||!child?.stdin?.write||!child?.kill)fail('HOST_CHILD_DEPENDENCY');
        child.on('error',hold);child.stdin.on?.('error',hold);
        child.stdout.on('data',chunk=>data(chunk));
        child.stderr.on('data',chunk=>data(chunk,true));
        child.stdout.on('end',()=>{try{buffer+=decoder.decode();ended=true;if(buffer.length)fail('WIRE_UNTERMINATED_FRAME');}catch(error){hold(error);}});
        child.once('close',observeClose);
        child.once('spawn',()=>{
          if(firstError||settled)return;
          try{
            if(!Number.isSafeInteger(child.pid)||child.pid<1)fail('HOST_PROCESS_UNOBSERVED');
            const birth=protectedLaunch===undefined?null:inspectOriginalProtectedCodexLaunch(owner,protectedLaunch).birth;
            if(birth&&birth.pid!==child.pid)fail('HOST_PROCESS_UNOBSERVED');
            process={pid:child.pid,started_at:birth?.at??new Date(now()).toISOString()};
            check('child_spawned');
            protocol=createPeerHostProtocol({transport,owner,process,mode:'membership',admit:()=>admission,...(contextDelivery?{context_delivery:contextDelivery}:{}),
              bindNative(packet){check('before_bind');membership.host.bind({operation_id:operation+'-bind',...binding(),native_id:packet.native_id,observed_process:packet.observed_process});native=packet.native_id;if(options.on_thread){const observed=options.on_thread({native_id:native,process:copy(process),admission:copy(admission),tools:options.tool_profile?(options.tool_profile!=='stable-five-v1'?stableTaskHostTools():stablePeerHostTools()):null,launch:copy(launch),...(interpreter?{context_limits:{frame_bytes:Math.min(limits.frame_bytes,100000),wire_bytes:limits.wire_bytes}}:{})});if(observed!==undefined){if(observed&&typeof observed.then==='function')Promise.resolve(observed).catch(()=>{});fail('HOST_GUARD_RESULT');}}const channel=membership.host.channel(binding());
                const wrap=name=>args=>{check('callback_'+name);return name==='header'?channel.header():channel[name](args);};
                return {guard:wrap('header'),channel:{header:wrap('header'),read:wrap('read'),submit:wrap('submit')}};},
              finish(packet){const error=packet.error??(closeInfo?.signal?{code:'HOST_PROCESS_SIGNAL',signal:closeInfo.signal}:!Number.isInteger(closeInfo?.code)?{code:'HOST_EXIT_UNKNOWN'}:undefined);return membership.host.finish({operation_id:operation+'-finish',...binding(),output:packet.output,termination_confirmed:true,observed_process:packet.observed_process,...(error?{error}:{})});}
            });
            state='running';protocol.start(owner);
          }catch(error){hold(error);}
        });
        setTimer(()=>hold(Object.assign(Error('HOST_DEADLINE'),{code:'HOST_DEADLINE'})),limits.total_ms);
      }catch(error){hold(error);}
      return result;
    },
    snapshot(token){requireOwner(token);return {state,consumed,process:process?copy(process):null,native_id:native,wire_bytes:wireBytes,transcript_bytes:transcriptBytes,physical_close_observed:Boolean(closeInfo),termination_qualified:Boolean(closeInfo?.qualified),protocol:protocol?protocol.snapshot(owner):null};},
    evidence(token){requireOwner(token);return {transcript:copy(transcript),protocol:protocol?protocol.evidence(owner):null,close:closeInfo?copy(closeInfo):null};},
    failure(token){requireOwner(token);return firstError;}
  });
}

// Shared strict framing primitive; no identity, ledger or auth capability.
export {decode as decodeHostFrame};
