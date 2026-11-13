// Unrouted trusted Source composition. Source authoring is not enrollment,
// launch selection, Native QA, model permission or company acceptance.
import {TextDecoder,types} from 'node:util';
import {canonical} from './ledger.mjs';
import {createPolicySupervisor} from './policy-supervisor.mjs';
import {decodeHostFrame} from './codex-host.mjs';
import {claimOriginalPeerBootstrapMembershipRunner,assertOriginalPeerBootstrapMembershipRunner,originalPeerBootstrapMembershipRunnerDeadline,originalPeerBootstrapMembershipChannel,bindOriginalPeerBootstrapMembershipNative,completeOriginalPeerBootstrapMembership,holdOriginalPeerBootstrapMembership,recordOriginalPeerBootstrapMembershipLateEvidence} from './bootstrap-membership.mjs';
import {prepareOriginalProtectedBootstrapLaunch,originalProtectedPeerLaunchConfiguration,bindOriginalProtectedCodexLaunch,spawnOriginalProtectedCodex,assertOriginalProtectedCodexBoundary,originalProtectedOwnedTaskTokens,awaitOriginalProtectedBootstrapTokens,requestOriginalProtectedCodexStop} from './protected-codex-domain.mjs';
import * as executionLaunch from './protected-codex-domain.mjs';
import {createBootstrapMembershipHostProtocol,BOOTSTRAP_NATIVE_PERMISSION,BOOTSTRAP_NATIVE_BASE,BOOTSTRAP_NATIVE_DEVELOPER} from './bootstrap-membership-host-protocol.mjs';
import {originalPeerBootstrapMembershipRunnerPreflight,originalPeerBootstrapMembershipRunnerLedger} from './bootstrap-membership.mjs';
import {originalBootstrapMembershipPreflightInput} from './bootstrap-membership-preflight.mjs';

const runs=new WeakSet(),fail=code=>{throw Object.assign(Error(code),{code});};
function options(value){if(!value||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('BOOTSTRAP_RUNNER_INPUT');const d=Object.getOwnPropertyDescriptors(value),required=['scope_root','cwd','read_paths','state_root','scratch_root'];if(required.some(k=>!Object.hasOwn(d,k))||Reflect.ownKeys(d).some(k=>typeof k!=='string'||![...required,'signal'].includes(k)||!d[k].enumerable||!Object.hasOwn(d[k],'value')))fail('BOOTSTRAP_RUNNER_INPUT');return Object.fromEntries(Reflect.ownKeys(d).map(k=>[k,d[k].value]));}
const errorCode=error=>typeof error?.code==='string'?error.code:'BOOTSTRAP_RUNNER_UNKNOWN';

/** Consume one already admitted original cap. No operation_id, phase request,
 * profile, native/thread ID, transport/spawn hook or replacement cap is input. */
export async function runOriginalPeerBootstrapMembership(cap,input){
 const a=options(input);if(!cap||runs.has(cap))fail('BOOTSTRAP_RUNNER_REUSE');runs.add(cap);
 const owner=Symbol('original-bootstrap-readonly3-runner'),claim=claimOriginalPeerBootstrapMembershipRunner(cap,owner),facts=assertOriginalPeerBootstrapMembershipRunner(claim,owner,'reserved'),finalDeadline=originalPeerBootstrapMembershipRunnerDeadline(claim,owner),cleanup=1750;
 let launch,child,protocol,callbacks,firstError=null,closed=false,settled=false,resolve,wire=0,pending='',stdoutEnded=false,inputClosed=false;
 const timers=new Set(),decoder=new TextDecoder('utf-8',{fatal:true}),completion=new Promise(r=>{resolve=r;});
 const timer=(fn,ms)=>{const handle=setTimeout(()=>{timers.delete(handle);fn();},Math.max(1,ms));timers.add(handle);};
 const remember=error=>{firstError??=error;};
 const finish=()=>{if(settled)return;settled=true;for(const handle of timers)clearTimeout(handle);timers.clear();a.signal?.removeEventListener('abort',cancel);resolve();};
 const stop=error=>{remember(error);if(launch)try{requestOriginalProtectedCodexStop(owner,launch);}catch(cause){remember(cause);}if(!child)finish();};
 const cancel=()=>stop(a.signal?.reason??Object.assign(Error('BOOTSTRAP_RUNNER_CANCELLED'),{code:'BOOTSTRAP_RUNNER_CANCELLED'}));
 try{
  if(finalDeadline-Date.now()<=cleanup||a.signal?.aborted)fail('BOOTSTRAP_RUNNER_WINDOW');
  timer(finish,finalDeadline-Date.now());
  const supervisor=createPolicySupervisor({owner,directory:a.scope_root});
  launch=await prepareOriginalProtectedBootstrapLaunch(owner,supervisor,claim,{cwd:a.cwd,read_paths:a.read_paths,state_root:a.state_root,scratch_root:a.scratch_root});
  if(typeof executionLaunch.bindOriginalProtectedExecutionLaunch!=='function')fail('BOOTSTRAP_EXECUTION_LAUNCH_SOURCE_REQUIRED');
  const bound=executionLaunch.bindOriginalProtectedExecutionLaunch(owner,launch,originalPeerBootstrapMembershipRunnerLedger(claim,owner),facts.admission_ref);if(bound&&typeof bound.then==='function'){Promise.resolve(bound).catch(()=>{});fail('BOOTSTRAP_EXECUTION_LAUNCH_SYNC_REQUIRED');}
  if(a.signal?.aborted||firstError||Date.now()>=finalDeadline-cleanup)fail('BOOTSTRAP_RUNNER_CANCELLED');
  const configuration=originalProtectedPeerLaunchConfiguration(owner,launch),selected={...configuration,profile_id:BOOTSTRAP_NATIVE_PERMISSION,instruction_sources:[],base_instructions:BOOTSTRAP_NATIVE_BASE,developer_instructions:BOOTSTRAP_NATIVE_DEVELOPER};
  bindOriginalProtectedCodexLaunch(owner,launch,selected);
  const plan=originalPeerBootstrapMembershipRunnerPreflight(claim,owner),turnInput=originalBootstrapMembershipPreflightInput(plan);
  const transport={attach(value){if(callbacks)fail('BOOTSTRAP_RUNNER_TRANSPORT_REUSE');callbacks=value;return ()=>{};},send(frame){if(!child?.stdin?.write)fail('BOOTSTRAP_RUNNER_CHILD_REQUIRED');const bytes=canonical(frame)+'\n';if(Buffer.byteLength(bytes)>100000||(child.stdin.writableLength??0)+Buffer.byteLength(bytes)>100000)fail('BOOTSTRAP_RUNNER_OUTPUT_CAPACITY');child.stdin.write(bytes);}};
  protocol=createBootstrapMembershipHostProtocol({owner,transport,launch:selected,input:turnInput,guard(stage){assertOriginalPeerBootstrapMembershipRunner(claim,owner);if(Date.now()>=finalDeadline-cleanup)fail('BOOTSTRAP_RUNNER_WINDOW');assertOriginalProtectedCodexBoundary(owner,launch,stage==='callback'?'callback_guard':stage==='before_turn'?'before_turn':stage==='before_thread'?'before_context':'before_wire');},onThread(){const creation=originalProtectedOwnedTaskTokens(owner,launch).creation;if(!creation)fail('BOOTSTRAP_RUNNER_CREATION_UNPROVED');bindOriginalPeerBootstrapMembershipNative(cap,creation);},channel:originalPeerBootstrapMembershipChannel(cap)});
  child=spawnOriginalProtectedCodex(owner,launch);
  child.on('error',stop);child.once('spawn',()=>{try{assertOriginalPeerBootstrapMembershipRunner(claim,owner,'reserved');protocol.start(owner);}catch(error){stop(error);}});
  child.stdout.on('data',chunk=>{if(settled)return;try{const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);wire+=bytes.length;if(wire>4000000)fail('BOOTSTRAP_RUNNER_WIRE_CAPACITY');pending+=decoder.decode(bytes,{stream:true});let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(!line.length||Buffer.byteLength(line)+1>100000)fail('BOOTSTRAP_RUNNER_FRAME');callbacks.message(decodeHostFrame(line));if(protocol.inspect(owner).state==='terminal'&&!inputClosed){inputClosed=true;child.stdin.end();}}if(Buffer.byteLength(pending)>100000)fail('BOOTSTRAP_RUNNER_FRAME');}catch(error){stop(error);}});
  child.stdout.on('end',()=>{try{decoder.decode();if(pending.length)fail('BOOTSTRAP_RUNNER_PARTIAL_FRAME');stdoutEnded=true;}catch(error){stop(error);}});
  child.stderr.on('data',chunk=>{wire+=Buffer.byteLength(chunk);if(wire>4000000)stop(Object.assign(Error('BOOTSTRAP_RUNNER_WIRE_CAPACITY'),{code:'BOOTSTRAP_RUNNER_WIRE_CAPACITY'}));});
  child.once('close',(code,signal)=>{closed=true;if(code!==0||signal!==null||!stdoutEnded)remember(Object.assign(Error('BOOTSTRAP_RUNNER_CLOSE_UNKNOWN'),{code:'BOOTSTRAP_RUNNER_CLOSE_UNKNOWN'}));finish();});
  a.signal?.addEventListener('abort',cancel,{once:true});
  timer(()=>stop(Object.assign(Error('BOOTSTRAP_RUNNER_WINDOW'),{code:'BOOTSTRAP_RUNNER_WINDOW'})),finalDeadline-Date.now()-cleanup);
  await completion;
  if(!firstError&&closed&&protocol.inspect(owner).terminal?.status==='completed'&&Date.now()<finalDeadline){const tokens=await awaitOriginalProtectedBootstrapTokens(owner,launch,finalDeadline);if(!tokens.drain)fail('BOOTSTRAP_RUNNER_DRAIN_UNPROVED');return await completeOriginalPeerBootstrapMembership(cap,tokens.drain);}
  fail(firstError?errorCode(firstError):'BOOTSTRAP_RUNNER_DRAIN_UNPROVED');
 }catch(error){
  stop(error);if(child&&!closed&&!settled)await completion;
  let observation=null,recording_error=null;
  try{const tokens=launch?originalProtectedOwnedTaskTokens(owner,launch):null;observation=tokens?.diagnostic?await recordOriginalPeerBootstrapMembershipLateEvidence(cap,tokens.diagnostic):holdOriginalPeerBootstrapMembership(cap,{error:errorCode(firstError??error)});}catch(cause){recording_error=errorCode(cause);}
  return {status:'unknown',accepted:false,error:errorCode(firstError??error),observation,recording_error,old_reservations_released:false,authority_issued:false};
 }finally{for(const handle of timers)clearTimeout(handle);timers.clear();a.signal?.removeEventListener('abort',cancel);protocol?.close(owner);}
}
