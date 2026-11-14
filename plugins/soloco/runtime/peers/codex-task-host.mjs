import {prepareOriginalPeerContextDelivery,originalPeerContextCreationCommitment,originalPeerTaskInstruction} from './peer-context-interpreter.mjs';
import {inspectOriginalPeerContextSlot} from './protected-source-build-slot.mjs';
import {restrictFoundationCallbacks} from './foundation-callback-boundary.mjs';
import {createPeerExecutorIncarnationSource} from './executor-incarnation.mjs';
// Trusted TaskHost leaf. The fixed production provider supplies an original
// protected launch; controlled transports alone never establish qualification.
import path from 'node:path';
import {spawn} from 'node:child_process';
import {TextDecoder} from 'node:util';
import {canonical,peerDigest} from './ledger.mjs';
import * as model from './model.mjs';
import {PeerScheduler,createNativeExecutor} from './scheduler.mjs';
import {createPeerHostProtocol,stableTaskHostTools} from './host-protocol.mjs';
import {CODEX_BINARY,createCodexMembershipHost,decodeHostFrame} from './codex-host.mjs';
import {originalProtectedPeerContextInterpreter,assertOriginalProtectedPeerContextStatic,bindOriginalProtectedPeerContext,bindOriginalProtectedTaskAdmission,bindOriginalProtectedMembershipAdmission,isOriginalProtectedCompanionLaunch,isOriginalProtectedCodexLaunch,bindOriginalProtectedCodexLaunch,spawnOriginalProtectedCodex,inspectOriginalProtectedCodexLaunch,assertOriginalProtectedCodexBoundary,observeOriginalProtectedPeerExecutorIncarnation,requestOriginalProtectedCodexStop} from './protected-codex-domain.mjs';

export const STABLE_TOOL_SHA256=peerDigest(stableTaskHostTools());
const names=['profile','instructions','external','actor','closure','tools'];
const business=names.filter(n=>n!=='closure');
const copy=x=>JSON.parse(canonical(x));
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const same=(a,b)=>canonical(a)===canonical(b);
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const contractKey=native=>'p8e:codex-thread:'+peerDigest(native);
function assertProtectedTaskBoundary(owner,launch,interpreter,stage){
  // Readiness precedes birth and the context-contract acknowledgement. All
  // actual post-birth stages retain the original domain/runtime checks.
  if(interpreter&&stage==='before_admission')assertOriginalProtectedPeerContextStatic(owner,launch);
  else assertOriginalProtectedCodexBoundary(owner,launch,stage);
}

/** owner and all six qualifier functions are private host capabilities. There
 * is no JSON/model route to this constructor or to its dependency functions.
 * tools must independently establish actual restored offered-schema equality;
 * app-server ThreadResumeResponse itself has no such field. Missing producer
 * holds, even when our own persisted creation commitment matches. */
export function createCodexTaskRuntime({owner,ledger,membership,launch,qualification=null,
  spawn_child=spawn,now=Date.now,scheduler_principal_id='scheduler',limits={},evidence_dir,software_prepare=null,protected_launch,callback_restriction}={}){
  if(typeof owner!=='symbol'||!ledger?.read||!ledger?.write||!membership?.host?.activeClient||typeof spawn_child!=='function')fail('HOST_DEPENDENCY');
  if(protected_launch!==undefined&&(!isOriginalProtectedCodexLaunch(owner,protected_launch)||spawn_child!==spawn))fail('HOST_ORIGINAL_PROTECTED_LAUNCH_REQUIRED');
  if(software_prepare!==null&&typeof software_prepare!=='function')fail('HOST_DEPENDENCY');
  if(callback_restriction!==undefined&&!['local-foundation-qualification','task-bound-effects'].includes(callback_restriction))fail('HOST_ARGUMENT');
  if(callback_restriction&&software_prepare!==null)fail('HOST_FOUNDATION_ACTION_HELD');
  if(callback_restriction==='task-bound-effects'&&(!protected_launch||!isOriginalProtectedCompanionLaunch(owner,protected_launch)||typeof model.bindPeerTaskEffects!=='function'))fail('HOST_TASK_EFFECTS_PRODUCER_HELD');
  const config=copy(launch),launchSHA=peerDigest(config),guards=qualification&&{...qualification};
  const interpreter=protected_launch===undefined?null:originalProtectedPeerContextInterpreter(owner,protected_launch),creationProtocol=interpreter?'p8e-stable-five-v3-context-contract-v1':'p8e-stable-five-v2',creationCommitment=interpreter?originalPeerContextCreationCommitment(interpreter):null;
  if(interpreter&&inspectOriginalPeerContextSlot(interpreter).scope_policy==='V5_ORIGINAL_MANAGED_PRIVATE_FD'&&!['local-foundation-qualification','task-bound-effects'].includes(callback_restriction))fail('HOST_FOUNDATION_ACTION_HELD');
  const effectSource=callback_restriction==='task-bound-effects'?createPeerExecutorIncarnationSource(ledger):null;
  if(protected_launch!==undefined)bindOriginalProtectedCodexLaunch(owner,protected_launch,config);
  if(!config||typeof config.cwd!=='string'||!config.cwd.startsWith('/')||typeof config.profile_id!=='string'||!Array.isArray(config.instruction_sources))fail('HOST_ARGUMENT');
  const bound={total_ms:60000,grace_ms:250,term_ms:500,kill_ms:1000,frame_bytes:100000,wire_bytes:2000000,transcript_bytes:2000000,...limits};
  for(const [key,n]of Object.entries(bound))if(!Number.isSafeInteger(n)||n<1||n>(key==='total_ms'?120000:key.endsWith('_ms')?5000:4000000))fail('HOST_LIMIT');
  const contextLimits=interpreter?Object.freeze({frame_bytes:Math.min(bound.frame_bytes,100000),wire_bytes:bound.wire_bytes}):null;
  // Reuse the tested leaf's closed launch/environment/limit validation only.
  // Constructing this unused object admits nothing and starts no process.
  createCodexMembershipHost({owner,membership,launch:config,...(protected_launch===undefined?{spawn_child}:{protected_launch}),...(interpreter?{tool_profile:'stable-five-v3-context-contract-v1'}:{}),now,limits:bound});
  const requireOwner=token=>{if(token!==owner)fail('INSTRUCTION_OWNER');};
  const checks=(stage,extra={},selected=business)=>{
    if(protected_launch!==undefined)assertProtectedTaskBoundary(owner,protected_launch,interpreter,stage);
    // Genuine protected companion facts come from original native producers, not caller proof callbacks.
    if(protected_launch!==undefined&&isOriginalProtectedCompanionLaunch(owner,protected_launch))return;
    if(!guards||names.some(name=>typeof guards[name]!=='function'))fail('HOST_QUALIFICATION_HELD');
    for(const name of selected){const result=guards[name]({stage,launch:copy(config),expected_tools:stableTaskHostTools(),tools_sha256:STABLE_TOOL_SHA256,...extra});if(result!==undefined){if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});fail('HOST_GUARD_RESULT');}}
  };
  function creation(packet){
    if(!same(packet.tools,stableTaskHostTools()))fail('HOST_TOOL_CONTRACT');
    if(interpreter&&!same(packet.context_limits,contextLimits))fail('HOST_CONTEXT_LIMITS_CHANGED');
    const admitted=packet.admission.phase.value;
    ledger.write('p8e.thread-created',scheduler_principal_id,tx=>{
      const phase=tx.get('work_items','membership-phase:'+admitted.membership_id+':'+admitted.phase);
      if(!phase||phase.value.attempt_id!==admitted.attempt_id||phase.value.native_id!==packet.native_id||!same(phase.value.process,packet.process))fail('HOST_STAGE_BINDING');
      const key=contractKey(packet.native_id);if(tx.get('work_items',key))fail('HOST_THREAD_REUSED');
      tx.put('work_items',key,{kind:'codex_thread_contract',status:'p8e_thread_sealed',protocol:creationProtocol,...(creationCommitment?{context_interpreter:creationCommitment,context_limits:contextLimits}:{}),native_id:packet.native_id,principal_id:admitted.principal_id,generation:admitted.generation,enrollment_id:admitted.membership_id,phase:admitted.phase,tools_sha256:STABLE_TOOL_SHA256,launch_sha256:launchSHA,creation_phase:ref('work_items',phase),attestation:'observed-own-start-request-and-correlated-response-only; not restored-tool or host qualification'},0);
    });
  }
  function active(tx,task){
    const principal=tx.get('principals',task.value.owner_principal_id),p=principal?.value;
    if(!p||p.status!=='active'||!p.membership_qualification||!uuid(p.native_id)||!Number.isSafeInteger(p.generation))fail('HOST_ACTIVE_BINDING_HELD');
    const seal=tx.get('work_items',contractKey(p.native_id)),v=seal?.value;
    if(!v||v.protocol!==creationProtocol||creationCommitment&&(!same(v.context_interpreter,creationCommitment)||!same(v.context_limits,contextLimits))||v.phase!=='reconstruction'||v.principal_id!==principal.id||v.generation!==p.generation||v.enrollment_id!==p.enrollment_id||v.native_id!==p.native_id||v.tools_sha256!==STABLE_TOOL_SHA256||v.launch_sha256!==launchSHA)fail('HOST_STABLE_TOOLS_HELD');
    return {principal_id:principal.id,generation:p.generation,native_id:p.native_id,enrollment_id:p.enrollment_id,seal:ref('work_items',seal)};
  }
  // Read the actual admission producer/history rather than accepting a caller's
  // admitted:true label. P3's task value may add host for its executor; identity
  // comes from the owning P1 rows and original native-effect admission event.
  function admission(task,context){
    return ledger.read(tx=>{
      const current=tx.get('tasks',task.id),t=current?.value,a=t?.attempt;
      if(t?.status!=='running'||a?.id!==task.value.attempt?.id||!same(a.context,context)||!model.validateContext(tx,context))fail('HOST_LEASE_CHANGED');
      const slot=tx.get('slots',task.id),effect=tx.get('effects',a.effect_id);
      if(slot?.value.status!=='active'||slot.value.attempt_id!==a.id||effect?.value.kind!=='native'||effect.value.task_id!==task.id||effect.value.request_sha256!==a.request_sha256)fail('HOST_LEASE_CHANGED');
      const event=tx.events({after:effect.created_seq-1,limit:1}).items[0];
      if(event?.type!=='task/admit'||event.principal_id!==scheduler_principal_id)fail('HOST_ADMISSION_PRODUCER');
      const changes=event.payload.changes.filter(c=>c.family==='commands');if(changes.length!==1)fail('HOST_ADMISSION_PRODUCER');
      const change=changes[0],command=tx.getVersion({family:'commands',id:change.id,revision:change.revision,sha256:change.sha256}),v=command?.value;
      if(v?.action!=='task/admit'||v.principal_id!==scheduler_principal_id||v.result?.admitted!==true||v.result.task.id!==task.id||v.result.task.value.attempt.id!==a.id||!same(v.result.context,context))fail('HOST_ADMISSION_PRODUCER');
      if(callback_restriction==='task-bound-effects'){
        if(!a.effect_authority?.production_authority||!same(a.effect_authority,v.result.task.value.attempt.effect_authority)||typeof model.assertPeerProductionAuthority!=='function')fail('HOST_PRODUCTION_ADMISSION_REQUIRED');
        model.assertPeerProductionAuthority(tx,a.effect_authority.production_authority,ledger);
      }
      const binding=active(tx,current);
      // Pure terminal cutoff after ALL provider/history/current-principal reads.
      // No provider callback runs between this check and the returned snapshot.
      const expiry=context.grant?.value?.expires_at;if(expiry!==undefined&&(!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()))fail('HOST_LEASE_EXPIRED');
      return {receipt:copy(v.result),binding};
    });
  }
  const reports=[];
  const executor={
    async probe({host,task}){
      try{if(reports.length>=128)fail('HOST_EVIDENCE_CAPACITY');if(host!=='codex'||!task)fail('HOST_UNSUPPORTED');const binding=ledger.read(tx=>active(tx,task));checks('before_admission',{task_id:task.id,binding});return {host,available:true,authenticated:true,source_boundary:'private qualifiers required; this Boolean is only scheduler readiness'};}
      catch(error){return {host,available:false,authenticated:false,error:String(error.code??'HOST_HELD'),original_error:error};}
    },
    async execute(args){
      let closed=null,qualifiedClose=false,rawClose=null,report=null;
      const runner=async(host,native,_prompt,_cwd,_timeout,_selection,options)=>{
        if(host!=='codex'||native!==null)fail('HOST_ARGUMENT');
        const admitted=admission(args.task,args.context);
        const contextDelivery=interpreter?prepareOriginalPeerContextDelivery(interpreter,{delivery_kind:'task-context',payload_protocol:args.context.protocol,payload_text:args.context.text,payload_sha256:args.context.sha256,payload_utf8_bytes:args.context.utf8_bytes,source_cut_protocol:null,source_cut_sha256:null,source_cut_utf8_bytes:null}):null;if(contextDelivery)bindOriginalProtectedPeerContext(owner,protected_launch,contextDelivery,taskInstruction(admitted.receipt.task,args.context));
        if(protected_launch!==undefined&&isOriginalProtectedCompanionLaunch(owner,protected_launch))bindOriginalProtectedTaskAdmission(owner,protected_launch,ledger,args.task.id,args.context);
        checks('before_spawn',{task_id:args.task.id,binding:admitted.binding});
        report=await activeTurn({owner,launch:config,admitted,context:args.context,signal:args.signal,spawn:spawn_child,protectedLaunch:protected_launch,now,limits:bound,
          checks:(stage,extra,which)=>checks(stage,{task_id:args.task.id,binding:admitted.binding,...extra},which),
          current:()=>{const fresh=admission(args.task,args.context);if(!same(fresh.binding,admitted.binding))fail('HOST_ACTIVE_BINDING_HELD');},
          software_prepare,contextDelivery,callbackRestriction:callback_restriction,effectSource,bind:()=>membership.host.activeClient({enrollment_id:admitted.binding.enrollment_id}),
          onModelProcess:options.onModelProcess,onModelClosure:options.onModelClosure,
          onSpawn:process=>options.onSpawn({...process}),onQualifiedClose:()=>{qualifiedClose=true;if(rawClose)args.onClosure?.(rawClose);}});
        if(report.error)throw Object.assign(Error(report.error.message),{code:report.error.code,rejected_output:{native_id:report.native_id,text:report.output??''},termination_confirmed:qualifiedClose});
        return {native_id:report.native_id,text:report.output};
      };
      const leaf=createNativeExecutor({cwd:config.cwd,evidence_dir:evidence_dir??path.join(ledger.directory,'evidence','p8e-codex-task'),runner,probe:()=>({available:false,authenticated:false}),now});
      const result=await leaf.execute({...args,onClosure:packet=>{rawClose=packet;if(qualifiedClose)args.onClosure?.(packet);}});
      closed=result.observed_process;reports.push({task_id:args.task.id,attempt_id:args.task.value.attempt?.id,report,result});
      return {...result,transport_report:report,termination_confirmed:qualifiedClose,observed_process:closed?{...closed,close_observed:qualifiedClose}:null,...(!qualifiedClose&&!result.error?{error:{code:'HOST_CLOSURE_UNQUALIFIED',message:'Complete private process closure remains unqualified'}}:{})};
    }
  };
  const observer=model.createRuntimeObserver(ledger,{principal_id:scheduler_principal_id});
  const scheduler=new PeerScheduler({ledger,principal_id:scheduler_principal_id,observer,executor,model,now,readiness_ms:0,...(evidence_dir?{evidence_dir}:{})});
  return Object.freeze({
    async stage(token,input){requireOwner(token);if(reports.length>=128)fail('HOST_EVIDENCE_CAPACITY');checks('before_stage');const wrapped=Object.fromEntries(['profile','instructions','external','actor','closure'].map(name=>[name,b=>checks(b.stage,{membership:b},[name,...(name==='external'?['tools']:[])])]));const host=createCodexMembershipHost({owner,membership,launch:config,qualification:wrapped,...(protected_launch===undefined?{spawn_child}:{protected_launch}),...(protected_launch!==undefined&&isOriginalProtectedCompanionLaunch(owner,protected_launch)?{on_admission:phase=>{bindOriginalProtectedMembershipAdmission(owner,protected_launch,ledger,phase);}}:{}),now,limits:bound,tool_profile:interpreter?'stable-five-v3-context-contract-v1':'stable-five-v2',on_thread:creation});const result=await host.run(owner,input);reports.push({membership:copy(input),report:host.evidence(owner),result});return result;},
    executor,scheduler,
    stop(token){requireOwner(token);effectSource?.stop();scheduler.stop();if(protected_launch)requestOriginalProtectedCodexStop(owner,protected_launch);return {stopped:true,closure:'UNKNOWN'};},
    inspect(token){requireOwner(token);return {tools_sha256:STABLE_TOOL_SHA256,reports:reports.map(r=>({task_id:r.task_id,attempt_id:r.attempt_id,report:r.report,result:r.result})),boundary:'Controlled source facts only; genuine profile/operator/restored-tools/closure qualification remains required'};}
  });
}

async function activeTurn({owner,launch,admitted,context,signal,spawn,protectedLaunch,now,limits,checks,current,bind,onSpawn,onModelProcess,onModelClosure,onQualifiedClose,software_prepare,contextDelivery,callbackRestriction,effectSource}){
  const observeProcess=onModelProcess!==undefined||onModelClosure!==undefined;
  if(observeProcess&&(typeof onModelProcess!=='function'||typeof onModelClosure!=='function'))fail('HOST_PROCESS_OBSERVERS_REQUIRED');
  const effectDeadline=Date.now()+limits.total_ms;
  let incarnation=null,effectClient=null;
  let softwareOutstanding=0,cliQualified=false;const softwareOperations=[];
  const combinedClose=()=>{if(process&&cliQualified&&softwareOutstanding===0&&!physicalQualified){physicalQualified=true;onQualifiedClose();}};
  let child,process,protocol,callbacks,threadRequest,buffer='',physicalQualified=false,ended=false,closing=false,done=false,error=null,result=null,wireBytes=0,retained=0;
  let observedBirth=null,rawClosed=false;
  const transcript=[],decoder=new TextDecoder('utf-8',{fatal:true}),timers=new Set();let resolve;
  const promise=new Promise(r=>{resolve=r;});
  const timer=(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);};
  const remember=e=>{error??={code:String(e.code??'HOST_ERROR'),message:String(e.message??e)};};
  const finish=()=>{if(done)return;done=true;effectSource?.stop();for(const t of timers)clearTimeout(t);signal?.removeEventListener('abort',cancel);const evidence=protocol?.evidence(owner);resolve({native_id:evidence?.native_id??null,output:evidence?.raw_final_output??null,error,process,qualified_close:physicalQualified,software_operations:copy(softwareOperations),transcript});};
  const shutdown=()=>{if(closing||done)return;closing=true;effectSource?.stop();try{child?.stdin.end();}catch(e){remember(e);}timer(()=>{if(done)return;try{child?.kill('SIGTERM');}catch(e){remember(e);}timer(()=>{if(done)return;try{child?.kill('SIGKILL');}catch(e){remember(e);}timer(finish,limits.kill_ms);},limits.term_ms);},limits.grace_ms);};
  const hold=e=>{remember(e);shutdown();if(!child)finish();};
  const cancel=()=>{try{protocol?.yield(owner);}catch(e){remember(e);}hold(signal?.reason??Object.assign(Error('Cancelled'),{code:'HOST_CANCELLED'}));};
  const retain=(direction,line)=>{const bytes=Buffer.byteLength(line);if(retained+bytes>limits.transcript_bytes)fail('HOST_TRANSCRIPT_BOUND');retained+=bytes;transcript.push({direction,text:line});};
  const transport={attach(c){if(callbacks)fail('HOST_TRANSPORT_OWNED');callbacks=c;return ()=>{};},send(frame){
    checks(frame.method==='turn/start'?'before_turn':'before_wire');current();const value=copy(frame);
    if(value.method==='thread/start')fail('HOST_RESUME_ONLY');
    if(value.method==='thread/resume'){threadRequest=value.id;value.params={threadId:admitted.binding.native_id,cwd:launch.cwd,runtimeWorkspaceRoots:[launch.cwd],permissions:launch.profile_id,approvalPolicy:'never',baseInstructions:launch.base_instructions,developerInstructions:launch.developer_instructions,excludeTurns:true};}
    const line=JSON.stringify(value)+'\n';if(Buffer.byteLength(line)>limits.frame_bytes||(child.stdin.writableLength??0)+Buffer.byteLength(line)>limits.frame_bytes)fail('HOST_OUTPUT_BOUND');retain('out',line);child.stdin.write(line);
  }};
  function received(frame){
    if(error||done)return;checks('before_message');current();
    if(frame.id===threadRequest&&Object.hasOwn(frame,'result')){const response=frame.result,t=response?.thread;
      if(!t||t.id!==admitted.binding.native_id||!uuid(t.sessionId)||t.parentThreadId!==null||t.forkedFromId!==null||!Array.isArray(t.turns)||t.canAcceptDirectInput!==true||t.ephemeral!==false)fail('HOST_NATIVE_BINDING');
      if(response.cwd!==launch.cwd||!same(response.runtimeWorkspaceRoots,[launch.cwd])||response.activePermissionProfile?.id!==launch.profile_id||response.approvalPolicy!=='never'||!same(response.instructionSources,launch.instruction_sources))fail('HOST_EFFECTIVE_METADATA');
      checks('resume_response',{response:copy(response)});current();
    }
    const handled=callbacks.message(frame);if(handled&&typeof handled.then==='function')handled.catch(hold);const state=protocol.snapshot(owner).state;
    if(state==='thread_ready'){checks('before_context');current();protocol.beginTurn(owner,taskInstruction(admitted.receipt.task,context));}
    if(protocol.snapshot(owner).state==='terminal')shutdown();
  }
  function data(chunk,stderr=false){if(done)return;try{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);wireBytes+=b.length;if(wireBytes>limits.wire_bytes)fail('HOST_WIRE_BOUND');if(stderr||error)return;buffer+=decoder.decode(b,{stream:true});let split;while((split=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,split);buffer=buffer.slice(split+1);if(!line.trim()||Buffer.byteLength(line)>limits.frame_bytes)fail('HOST_FRAME_BOUND');retain('in',line+'\n');received(decodeHostFrame(line));if(error)return;}if(Buffer.byteLength(buffer)>limits.frame_bytes)fail('HOST_FRAME_BOUND');}catch(e){hold(e);}}
  try{
    if(signal?.aborted)fail('HOST_CANCELLED');checks('before_process');current();
    child=protectedLaunch!==undefined?spawnOriginalProtectedCodex(owner,protectedLaunch):spawn(CODEX_BINARY,['app-server','--listen','stdio://','-c','approval_policy="never"'],{cwd:launch.cwd,env:copy(launch.environment),stdio:['pipe','pipe','pipe'],shell:false});
    if(!child?.once||!child?.stdin?.write||!child?.kill||child?.then)fail('HOST_CHILD_DEPENDENCY');
    child.on('error',hold);child.stdin.on?.('error',hold);child.stdout.on('data',b=>data(b));child.stderr.on('data',b=>data(b,true));
    child.stdout.on('end',()=>{try{buffer+=decoder.decode();ended=true;if(buffer.length)fail('WIRE_UNTERMINATED_FRAME');}catch(e){hold(e);}});
    child.once('close',(code,exitSignal)=>{
      try{
        // This exact original emitter remains observed after finish() returned
        // UNKNOWN. Raw CLI close is separate from whole-scope qualification;
        // decoder/provider failures must not erase that physical observation.
        if(observedBirth&&!rawClosed){rawClosed=true;onModelClosure(observedBirth,Object.freeze({closed_at:new Date(protectedLaunch===undefined?now():Date.now()).toISOString()}));}
        if(!ended){buffer+=decoder.decode();if(buffer.length)fail('WIRE_UNTERMINATED_FRAME');}checks('physical_close',{process,code,signal:exitSignal},['closure']);cliQualified=true;combinedClose();
        if(softwareOutstanding)remember(Object.assign(Error('Software preparation closure remains unknown'),{code:'HOST_PREPARATION_UNKNOWN'}));
        if(!error&&protocol?.snapshot(owner).state==='terminal'){result=callbacks.close({...process,close_observed:true,...(Number.isInteger(code)?{exit_code:code}:{})});if(result.error)remember(Object.assign(Error(result.error.message),{code:result.error.code}));if(exitSignal||!Number.isInteger(code))remember(Object.assign(Error('Signal or unknown exit cannot accept output'),{code:'HOST_EXIT_UNKNOWN'}));}
        else if(!error)remember(Object.assign(Error('Physical close had no logical terminal'),{code:'HOST_TERMINAL_UNKNOWN'}));
      }catch(e){remember(e);}finish();
    });
    child.once('spawn',()=>{try{if(!Number.isSafeInteger(child.pid)||child.pid<1)fail('HOST_PROCESS_UNOBSERVED');const birth=protectedLaunch===undefined?null:inspectOriginalProtectedCodexLaunch(owner,protectedLaunch).birth;if(protectedLaunch!==undefined&&(!birth||birth.pid!==child.pid||typeof birth.at!=='string'||!Number.isFinite(Date.parse(birth.at))))fail('HOST_PROCESS_UNOBSERVED');process={pid:child.pid,started_at:birth?.at??new Date(now()).toISOString()};
      // Minimal private executor projection, not an ordinary-model journal or
      // a caller-authored process/closure credential.
      if(observeProcess){observedBirth=Object.freeze({pid:process.pid,spawned_at:process.started_at});const returned=onModelProcess(observedBirth);if(returned&&typeof returned.then==='function'){Promise.resolve(returned).catch(()=>{});fail('HOST_PROCESS_OBSERVER_ASYNC');}}
      onSpawn(process);checks('child_spawned',{process});
      protocol=createPeerHostProtocol({transport,owner,process,mode:'peer',resume_native_id:admitted.binding.native_id,admit:()=>admitted.receipt,...(contextDelivery?{context_delivery:contextDelivery}:{}),
        ...(software_prepare?{software_prepare:async args=>{
          preparationArgs(args);checks('before_software_prepare');current();
          const binding={task_id:admitted.receipt.task.id,attempt_id:admitted.receipt.task.value.attempt.id,context_sha256:context.sha256,principal_id:admitted.binding.principal_id,generation:admitted.binding.generation,native_id:admitted.binding.native_id};
          const operation={operation_id:args.operation_id,input_id:args.input_id,request_sha256:peerDigest(args),closure:'unknown'};softwareOperations.push(operation);softwareOutstanding++;
          let closed=false;
          const onClosure=()=>{if(closed)fail('HOST_SOFTWARE_CLOSURE_REPLAY');closed=true;operation.closure='observed_private_backend';softwareOutstanding--;combinedClose();};
          const fresh=()=>{if(signal?.aborted||closing||done)fail('HOST_PREPARATION_OBSOLETE');checks('software_prepare_current');current();};
          // Backend must durably bind exact lease/input/op, retain unknowns,
          // and read back lost ACKs. onClosure is private observed scope, not a
          // returned JSON Boolean; settling/rejecting its Promise proves none.
          const value=await software_prepare({args:copy(args),binding:copy(binding),current:fresh,signal,onClosure});
          fresh();if(!closed)fail('HOST_SOFTWARE_CLOSURE_UNQUALIFIED');preparationReply(value,args);operation.result_sha256=peerDigest(value);return copy(value);
        }}:{}),
        bindNative(){
          checks('before_bind');current();const original=bind(),foundation=restrictFoundationCallbacks(original,admitted.receipt.task.id);
          const taskBound=()=>{
            if(!effectSource||!protectedLaunch||closing||done||error)fail('HOST_TASK_EFFECTS_PRODUCER_HELD');
            if(!effectClient){
              incarnation=observeOriginalProtectedPeerExecutorIncarnation(owner,protectedLaunch,effectSource,{deadline_at_ms:effectDeadline,readTurn:()=>{if(closing||done||error)fail('HOST_TASK_EFFECTS_OBSOLETE');return protocol.snapshot(owner);}});
              effectClient=model.bindPeerTaskEffects(original,{task_id:admitted.receipt.task.id},incarnation);
            }
            return effectClient;
          };
          const client=callbackRestriction==='task-bound-effects'?{
            execute:(action,args)=>taskBound().execute(action,args),
            // The internal context read precedes turn/start; dynamic callbacks
            // require the correlated running turn and its original incarnation.
            inspect:(action,args)=>protocol.snapshot(owner).state==='thread_ready'?foundation.inspect(action,args):taskBound().inspect(action,args)
          }:callbackRestriction?foundation:original;
          return {guard:()=>{checks(['starting_thread','thread_ready'].includes(protocol.snapshot(owner).state)?'before_context':'callback_guard');current();},client:{execute:(action,args)=>{checks('callback_execute');current();return client.execute(action,args);},inspect:(action,args)=>{
            const internal=protocol.snapshot(owner).state==='thread_ready'&&action==='task/context'&&args&&Object.keys(args).length===1&&args.task_id===admitted.receipt.task.id;
            checks(internal?'before_context':'callback_inspect');current();return client.inspect(action,args);
          }}};
        },
        finish:packet=>copy(packet),limits:{input_bytes:Math.max(100000,Buffer.byteLength(context.text)+4096)}});protocol.start(owner);
    }catch(e){hold(e);}});
    signal?.addEventListener('abort',cancel,{once:true});timer(()=>hold(Object.assign(Error('Finite turn deadline'),{code:'HOST_DEADLINE'})),limits.total_ms);
  }catch(e){hold(e);}
  return promise;
}

// These guards close the transport envelope. The genuine preparer independently
// verifies its private approved input, exact path set, bytes and all receipts.
function preparationArgs(a){
  if(!a||Array.isArray(a)||typeof a!=='object'||Object.keys(a).sort().join(',')!=='files,input_id,operation_id')fail('HOST_PREPARATION_ARGUMENT');
  for(const k of ['operation_id','input_id'])if(typeof a[k]!=='string'||!a[k].trim()||a[k].length>160||a[k].includes('\0'))fail('HOST_PREPARATION_ARGUMENT');
  if(!Array.isArray(a.files)||!a.files.length||a.files.length>32)fail('HOST_PREPARATION_ARGUMENT');
  const seen=new Set();for(const f of a.files){if(!f||Array.isArray(f)||typeof f!=='object'||Object.keys(f).sort().join(',')!=='content,path'||typeof f.path!=='string'||!f.path.length||f.path.length>4096||f.path.startsWith('/')||f.path.split('/').some(x=>['','.','..'].includes(x))||f.path.includes('\\')||f.path.includes('\0')||seen.has(f.path)||typeof f.content!=='string'||f.content.includes('\0'))fail('HOST_PREPARATION_ARGUMENT');seen.add(f.path);}
  if(Buffer.byteLength(canonical(a))>100000)fail('HOST_PREPARATION_ARGUMENT');
}
function preparationReply(v,args){
  const keys=['protocol','preparation_id','input_id','candidate_sha256','files','test_receipt_sha256','git','pr','github_publication','github_atomic_publication','proposal_content'];
  if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join(',')!==keys.sort().join(',')||v.protocol!=='software-publication-preparation-v1'||Buffer.byteLength(canonical(v))>100000||v.input_id!==args.input_id)fail('HOST_PREPARATION_RESULT');
  for(const k of ['preparation_id','input_id'])if(typeof v[k]!=='string'||!v[k].trim()||v[k].length>160)fail('HOST_PREPARATION_RESULT');
  for(const k of ['candidate_sha256','test_receipt_sha256'])if(!/^[a-f0-9]{64}$/.test(v[k]))fail('HOST_PREPARATION_RESULT');
  if(!same(v.files,args.files.map(f=>({path:f.path,sha256:model.digest(f.content),bytes:Buffer.byteLength(f.content)}))))fail('HOST_PREPARATION_RESULT');
  if(!v.git||Object.keys(v.git).sort().join(',')!=='B,H,M,T,ordered_parents'||['B','H','M','T'].some(k=>!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(v.git[k]))||!same(v.git.ordered_parents,[v.git.B,v.git.H]))fail('HOST_PREPARATION_RESULT');
  for(const k of ['pr','github_publication','github_atomic_publication'])if(!v[k]||Array.isArray(v[k])||typeof v[k]!=='object')fail('HOST_PREPARATION_RESULT');
  if(typeof v.proposal_content!=='string'||!v.proposal_content.trim())fail('HOST_PREPARATION_RESULT');
}
function taskInstruction(task,context){return originalPeerTaskInstruction(task,context);}
