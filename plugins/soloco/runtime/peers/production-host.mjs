// Fixed production provider. Model requests never select code, a spawn function,
// issuer, qualifier or account path. A checked adoption must already bind this
// launch recipe; matching JSON alone is not native qualification.
import fs from 'node:fs';
import path from 'node:path';
import {types} from 'node:util';
import {canonical,peerDigest} from './ledger.mjs';
import {createMembershipLifecycle} from './membership.mjs';
import * as model from './model.mjs';
import {loadOriginalSelectedPeerBridge,inspectOriginalLoadedPeerBridge,createOriginalLoadedProductionTaskRuntime} from './context-component-deployment.mjs';
import {createPolicySupervisor} from './policy-supervisor.mjs';
import {prepareOriginalProtectedPeerLaunch,originalProtectedPeerLaunchConfiguration,requestOriginalProtectedCodexStop} from './protected-codex-domain.mjs';

const fail=code=>{throw Object.assign(Error(code),{code});};
function data(value,seen=new Set()){
 if(!value||typeof value!=='object')return;
 if(types.isProxy(value))fail('PEER_PRODUCTION_INPUT');
 if(seen.has(value))return;seen.add(value);
 for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))){
  if(!Object.hasOwn(descriptor,'value'))fail('PEER_PRODUCTION_INPUT');data(descriptor.value,seen);
 }
}
const copy=v=>{data(v);return JSON.parse(canonical(v));};
function freeze(v){if(v&&typeof v==='object'){for(const value of Object.values(v))freeze(value);Object.freeze(v);}return v;}
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0')&&Buffer.from(v).toString('utf8')===v;
function closed(v,required,optional=[]){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;
 const keys=Reflect.ownKeys(v);
 return required.every(k=>keys.includes(k))&&keys.every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
}

export function peerProductionRecipe(control){
 if(!control)fail('PEER_REVIEWED_ADOPTION_REQUIRED');
 control=copy(control);
 const activation=control?.activation,environment=activation?.environment;
 if(control?.protocol!=='peer-cos-v1'||!activation||!text(activation.review_id,300)||!text(activation.native_reviewer_id,300)||!environment||environment.boundary_mode!=='enforced'||!['broker-only-native','separate-os-principal','remote-isolated'].includes(environment.worker_boundary)||peerDigest(environment)!==activation.environment_sha256)fail('PEER_REVIEWED_ADOPTION_REQUIRED');
 const recipe=environment.peer_runtime;
 if(!closed(recipe,['protocol','bridge_sha256','launch'])||recipe.protocol!=='peer-production-host-v1'||!hash(recipe.bridge_sha256)||!closed(recipe.launch,['profile_id','instruction_sources','base_instructions','developer_instructions']))fail('PEER_REVIEWED_LAUNCH_RECIPE_REQUIRED');
 const launch=recipe.launch;
 if(!text(launch.profile_id,200)||!Array.isArray(launch.instruction_sources)||launch.instruction_sources.length>32||Buffer.byteLength(canonical(launch.instruction_sources))>16000||!text(launch.base_instructions,10000)||!text(launch.developer_instructions,10000))fail('PEER_REVIEWED_LAUNCH_RECIPE_REQUIRED');
 return freeze(copy(recipe));
}

function privateDirectory(directory){
 if(!path.isAbsolute(directory)||path.resolve(directory)!==directory)fail('PEER_PRIVATE_RUNTIME_DIRECTORY');
 // Reject a redirected ancestor before creating even an empty directory.
 for(let p=directory;;p=path.dirname(p)){
  try{if(fs.lstatSync(p).isSymbolicLink())fail('PEER_PRIVATE_RUNTIME_DIRECTORY');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(path.dirname(p)===p)break;
 }
 try{fs.mkdirSync(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 const s=fs.lstatSync(directory);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o777)!==0o700||fs.realpathSync(directory)!==directory)fail('PEER_PRIVATE_RUNTIME_DIRECTORY');
 return directory;
}

export function createOriginalPeerProductionProvider(options){
 if(!closed(options,['owner','ledger']))fail('PEER_PRODUCTION_DEPENDENCY');
 const {owner,ledger}=options;
 if(typeof owner!=='symbol'||!ledger||types.isProxy(ledger)||typeof ledger.read!=='function')fail('PEER_PRODUCTION_DEPENDENCY');
 const identity={};
 for(const key of ['root','company_id','directory']){
  const d=Object.getOwnPropertyDescriptor(ledger,key);if(!d||!Object.hasOwn(d,'value')||!text(d.value,4000))fail('PEER_PRODUCTION_DEPENDENCY');identity[key]=d.value;
 }
 if(!path.isAbsolute(identity.root)||path.resolve(identity.root)!==identity.root||identity.directory!==path.join(identity.root,'.company'))fail('PEER_PRODUCTION_DEPENDENCY');
 const prepared=new Set();let stopped=false;
 const stopOnDrift=code=>{
  const error=Object.assign(Error(code),{code}),stopErrors=[];stopped=true;
  // Latch and remove each entry BEFORE calling its retained original stop.
  // A stop result or failure supplies no physical-closure or release evidence.
  for(const entry of [...prepared])try{entry.stop();}catch(failure){stopErrors.push(failure);}
  if(stopErrors.length)Object.defineProperty(error,'stop_errors',{value:Object.freeze(stopErrors)});
  throw error;
 };
 const current=()=>{
  if(stopped)fail('PEER_PRODUCTION_STOPPED');
  for(const key of Object.keys(identity)){const d=Object.getOwnPropertyDescriptor(ledger,key);if(!d||!Object.hasOwn(d,'value')||d.value!==identity[key])stopOnDrift('PEER_PRODUCTION_CONNECTION_CHANGED');}
 };
 const operator=tx=>{
  const c=tx.get('control','company'),id=c?.value?.founder_principal_id,p=text(id,200)&&tx.get('principals',id);
  if(c?.value?.protocol!=='peer-cos-v1'||!p||p.id!==id||p.value?.kind!=='founder'||p.value.status!=='active'||!Number.isSafeInteger(p.revision)||p.revision<1||!hash(p.sha256))return null;
  return Object.freeze({id:p.id,revision:p.revision,sha256:p.sha256});
 };
 const operatorRef=ledger.read(operator);current();if(!operatorRef)fail('PEER_PRODUCTION_DEPENDENCY');
 const assertOperator=tx=>{const actual=operator(tx);if(!actual||actual.id!==operatorRef.id||actual.revision!==operatorRef.revision||actual.sha256!==operatorRef.sha256)stopOnDrift('PEER_PRODUCTION_AUTHORITY_CHANGED');};
 const read=fn=>{
  current();const value=ledger.read(tx=>{assertOperator(tx);const result=fn(tx);assertOperator(tx);return result;});current();return value;
 };
 if(typeof model.bindPeerProductionScheduler!=='function'||typeof model.bindPeerTaskEffects!=='function'||typeof ledger.guardedWrite!=='function')fail('PEER_TASK_EFFECTS_PRODUCER_HELD');
 const productionFacade=model.bindPeerProductionScheduler(ledger);
 const membership=createMembershipLifecycle(ledger,{operator_principal_id:operatorRef.id},productionFacade);
 read(()=>undefined);
 const retain=runtime=>{
  const entry={stopped:false,result:undefined,stop(){
   if(entry.stopped)return entry.result;entry.stopped=true;prepared.delete(entry);
   entry.result=runtime.stop(owner);return entry.result;
  }};
  prepared.add(entry);return Object.freeze({runtime,stop:entry.stop});
 };
 const effects=()=>{if(typeof model.bindPeerTaskEffects!=='function'||typeof ledger.guardedWrite!=='function')fail('PEER_TASK_EFFECTS_PRODUCER_HELD');};
 const recipe=()=>read(tx=>peerProductionRecipe(tx.get('control','company')?.value));
 const support=()=>{
  const selected=recipe();effects();const actual=inspectOriginalLoadedPeerBridge();
  if(peerDigest(actual)!==selected.bridge_sha256)fail('PEER_ORIGINAL_BRIDGE_CHANGED');
  return selected;
 };
 return Object.freeze({
  async initialize(...args){if(args.length)fail('PEER_PRODUCTION_INPUT');recipe();effects();await loadOriginalSelectedPeerBridge();support();},
  async readiness(input){
   let host;
   try{if(!closed(input,['host'],['task']))fail('PEER_PRODUCTION_INPUT');host=input.host;if(host!=='codex'){read(()=>undefined);fail('HOST_UNSUPPORTED');}support();return {host,available:true,authenticated:true,scope:'Original source composition only; task/native authority checked separately'};}
   catch(error){return {host,available:false,authenticated:false,error:String(error.code??'PEER_SOURCE_SUPPORT_HELD'),original_error:error};}
  },
  async prepare(request){
   if(!closed(request,['kind'],['input','task','context','signal']))fail('PEER_PRODUCTION_INPUT');
   if(request.kind==='membership'){
    if(!closed(request,['kind','input']))fail('PEER_PRODUCTION_INPUT');
    const a=request.input;if(!closed(a,['enrollment_id','phase','instruction'],['reviewer_principal_id'])||!text(a.enrollment_id,200)||!text(a.instruction,64000)||!['reconstruction','review'].includes(a.phase)||a.phase==='review'&&!text(a.reviewer_principal_id,200)||a.phase!=='review'&&Object.hasOwn(a,'reviewer_principal_id'))fail('PEER_PRODUCTION_INPUT');
    request={kind:request.kind,input:copy(a)};
   }else if(request.kind==='task'){
    if(!closed(request,['kind','task','context'],['signal']))fail('PEER_PRODUCTION_INPUT');
    const a=copy({task:request.task,context:request.context});
    if(!text(a.task?.id,200)||!text(a.task?.value?.attempt?.id,200)||!hash(a.context?.sha256))fail('PEER_PRODUCTION_INPUT');
    request={kind:request.kind,...a};
   }else fail('PEER_PRODUCTION_INPUT');
   const selected=support();
   const principal=read(tx=>{
    const control=tx.get('control','company');if(control?.value.paused)fail('PEER_PAUSED');
    if(request.kind==='membership'){
     const e=tx.get('work_items','membership:'+request.input.enrollment_id);
     if(e?.value.status!=='pending')fail('ENROLLMENT_MISSING');
     return request.input.phase==='review'?request.input.reviewer_principal_id:e.value.principal_id;
    }
    const t=tx.get('tasks',request.task.id);
    if(t?.value.status!=='running'||t.value.attempt?.id!==request.task.value.attempt?.id||t.value.attempt.context.sha256!==request.context.sha256)fail('HOST_LEASE_CHANGED');
    return t.value.owner_principal_id;
   });
   current();
   // State and scratch are stable for this principal's thread recipe. P2 must
   // close each previous phase/attempt before another one can run; uncertain
   // reservations remain occupied. Each launch and owned broker is nevertheless
   // new. These directories are never pruned or treated as closure evidence.
   const base=privateDirectory(path.join(ledger.directory,'peer-execution'));
   const own=privateDirectory(path.join(base,peerDigest(principal)));
   const state=privateDirectory(path.join(own,'state')),scratch=privateDirectory(path.join(own,'scratch'));
   const supervisor=createPolicySupervisor({owner,directory:own});
   const launch=await prepareOriginalProtectedPeerLaunch(owner,supervisor,{cwd:ledger.root,read_paths:[],state_root:state,scratch_root:scratch});
   let runtime,handle;
   try{
    read(()=>undefined);
    const original=originalProtectedPeerLaunchConfiguration(owner,launch);
    runtime=createOriginalLoadedProductionTaskRuntime({owner,ledger,membership,protected_launch:launch,launch:{...original,...copy(selected.launch)}});
    handle=retain(runtime);read(()=>undefined);return handle;
   }catch(error){
    try{if(handle)handle.stop();else if(runtime)runtime.stop(owner);else requestOriginalProtectedCodexStop(owner,launch);}
    catch(stopError){throw new AggregateError([error,stopError],'Peer runtime preparation failed and original stop failed',{cause:error});}
    throw error;
   }
  }
 });
}
