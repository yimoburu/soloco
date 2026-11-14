import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Store,originalStoreExecutionCustodyFrom,originalStoreRetainedCommitCutoffFrom,inspectRuntimeStoreCommitWitnessFrom} from './store.mjs';
import {normalizedLayout,readNormalized} from './record-storage.mjs';
import {classifyRuntimeStorageFrom,inspectRuntimeStorageProofFrom,assertRuntimeStorageNextFrom,inspectRuntimeStorageJobBookkeepingFrom} from './legacy-storage-proof.mjs';
import {modelProcessProducerTransition,legacyRetentionModelRequestTransition,validModelProcessTracking,validModelProcessBirth} from './model-process-closure.mjs';
import {jobTimeoutState,jobExecutionTiming,normalizeTimeout,STARTUP_TIMEOUT_MS,TERMINATION_GRACE_MS} from './timeout.mjs';
import {resolveRetentionRepair} from './development-retention-repair.mjs';
import {reviewContinuationAssignment} from './development-review-continuation.mjs';
import {operatingContext,operatingReviewContext} from './operating-state.mjs';
import {assertSpecialistEligible} from './specialists.mjs';
import {developmentAssignment} from './develop.mjs';
import {prototypeAssignment} from './prototype.mjs';
import * as original from './peers/prospective-local-worker-inventory-producer.mjs';
import * as adapter from './adapters.mjs';
import * as sandbox from './local-sandbox.mjs';

// This route deliberately asserts no Original provenance. The only issuers are
// actual Store write scopes. Public JSON, callback identity and error recovery
// cannot select this lane, manufacture a capability or reopen a spent request.
import {LEGACY_RUNTIME_PROTOCOL,validateLegacyRuntimeJobShape,legacyRuntimeJobTransition,legacyRuntimeJobPhase} from './runtime-execution-shapes.mjs';
export {LEGACY_RUNTIME_PROTOCOL,validateLegacyRuntimeJobShape,legacyRuntimeJobTransition,legacyRuntimeJobPhase,legacyRetentionModelRequestTransition};
const DIRECTORY=fileURLToPath(new URL('./',import.meta.url));
const queueTypes=new Set(['job.queued','task.job_queued','development.test_reserved','development.preflight_recovery_reserved','development.preflight_diagnostic_reserved']);
const slots=['worker','watchdog','test_child'];
const recipes=new Set(['ordinary_worker','development_worker','watchdog','sandbox_test_child']);
const terminal=status=>['completed','failed','cancelled','interrupted','quarantined'].includes(status);
const own=(value,key)=>value!==null&&typeof value==='object'&&Object.hasOwn(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const closed=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const copy=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>a===undefined||b===undefined?a===b:JSON.stringify(a)===JSON.stringify(b);
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>sha(JSON.stringify(value));
const identity=value=>digest({id:value.id,instance_id:value.instance_id??null,host:value.host??null,role:value.role??null,epoch:value.epoch??null});
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=2000;
const nat=value=>Number.isSafeInteger(value)&&value>=0;
const positive=value=>Number.isSafeInteger(value)&&value>0;
const nativeParse=Date.parse,nativeApply=Reflect.apply;
const instant=value=>typeof value==='string'&&Number.isSafeInteger(nativeParse(value))&&nativeParse(value)>=0;
const abortGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
const realNow=Date.now;
const nativeSchedule=setTimeout,nativeUnschedule=clearTimeout;
const nativeSignalAdd=EventTarget.prototype.addEventListener,nativeSignalRemove=EventTarget.prototype.removeEventListener;
const writes=new WeakMap(),capabilities=new WeakMap(),originalDescriptors=new WeakMap();
const modelRequestCommits=new WeakMap(),originalModelAuthorities=new WeakMap();
const childDeadlines=new WeakMap();
const failures=new WeakMap(),bookkeeping=new WeakMap(),bookkeepingBuckets=new WeakMap();

function need(ok,code){if(!ok)throw Object.assign(Error('Runtime execution Hold: '+code),{code:'LEGACY_RUNTIME_'+code});}
function finite(value){need(nat(value)&&value<=8640000000000000,'CUTOFF_REQUIRED');return value;}
function clock(){return finite(realNow());}
function signalAborted(signal){if(signal===null||signal===undefined)return false;try{return nativeApply(abortGetter,signal,[]);}catch{need(false,'NATIVE_SIGNAL_REQUIRED');}}
function finalCutoff(record){need(!signalAborted(record.signal),'LAUNCH_ABORTED');need(clock()<finite(record.deadline_at_ms),'CUTOFF_EXPIRED');}
function rawState(store){return normalizedLayout(store.db)?readNormalized(store.db):JSON.parse(store.db.prepare('SELECT value FROM company WHERE id=1').get().value);}
function boundState(store){return store.snapshotState(rawState(store));}
function active(store,state){const loan=originalStoreExecutionCustodyFrom(store),w=writes.get(loan.store);need(w&&loan.mode==='write'&&loan.scope===w.scope&&loan.state===state&&!w.sealed,'WRITE_REQUIRED');return w;}
const completedLifecycle=new Set(['legacy_runtime','model_process_tracking','status','worker_pid','started_at','finished_at','execution_started_at','execution_deadline_at','termination_deadline_at','artifact_id','coordination_release','model_evidence','retrieved_inputs','proposal_reads','delivered_record_reads','handover_reads','operating_delivery','qualification_delivery','runtime_context_usage','retention_primary_delivery','error','execution_failure','rejected_output','rejected_native_id','rejected_native_ids','qualification_hold']);
function jobBinding(job,{afterCreation=false}={}){
  const value=Object.fromEntries(Object.entries(job).filter(([key])=>afterCreation?!completedLifecycle.has(key):!['legacy_runtime','model_process_tracking'].includes(key)));
  if(!['development_test','development_preflight'].includes(job.kind))Object.assign(value,{timeout_policy_version:1,...normalizeTimeout({timeout_ms:job.timeout_ms,timeout_reason:job.timeout_reason})});
  return value;
}
function recordsBinding(state,job,{afterCreation=false}={}){
  const roots=Object.fromEntries(Object.entries(state).filter(([key])=>!['jobs','records','sessions','revision','updated_at'].includes(key)));
  return digest({roots,records:state.records??{},session:job.session_key?state.sessions?.[job.session_key]??null:null,job:jobBinding(job,{afterCreation})});
}
function authorityDeadline(state,job,root){
  let deadline=null;const add=value=>{need(typeof value==='string','AUTHORITY_EXPIRY_REQUIRED');const date=finite(nativeParse(value));deadline=deadline===null?date:Math.min(deadline,date);};
  if(own(job,'execution_deadline_at'))add(job.execution_deadline_at);
  const target=state.records?.[job.review_of?.id];
  if(job.review_of)need(target&&target.id===job.review_of.id&&(target.revision??null)===(job.review_of.revision??null),'REVIEW_TARGET_REQUIRED');
  // These are the same mutually exclusive ACTIVE assignment branches used by
  // the worker. Historical input plans/ancestry are evidence, never grants.
  if(job.retention_repair_id!==undefined){
    const repair=resolveRetentionRepair(state,job,{root,phase:job.execution_started_at?'execution':'admission'});need(repair?.proposal,'RETENTION_AUTHORITY_REQUIRED');add(repair.proposal.expires_at);
  }else if(target?.development?.type==='review_continuation'){
    const continuation=reviewContinuationAssignment(state,job,{root});need(continuation?.development?.proposal,'CONTINUATION_AUTHORITY_REQUIRED');add(continuation.development.proposal.expires_at);
  }else if(job.development_id!==undefined){
    const plan=state.records?.[job.development_id],scope=plan?.development?.scope;need(plan?.development?.type==='plan'&&scope&&plan.development.scope_sha256===digest(scope)&&plan.development.authorization&&!plan.development.revoked&&job.role==='engineer'&&!job.review_of&&!job.prototype_id,'DEVELOPMENT_SCOPE_REQUIRED');if(job.kind!=='development_test')need(developmentAssignment(state,job,false,root)===plan,'DEVELOPMENT_SCOPE_REQUIRED');add(scope.expires_at);
  }else if(job.prototype_id!==undefined){
    const plan=state.records?.[job.prototype_id],scope=plan?.prototype?.scope;need(plan?.prototype?.type==='plan'&&scope&&plan.prototype.scope_sha256===digest(scope)&&plan.prototype.authorization&&!plan.prototype.revoked&&prototypeAssignment(state,job)===plan,'PROTOTYPE_SCOPE_REQUIRED');add(scope.expires_at);
  }
  if(job.preflight_recovery_id!==undefined){const recovery=state.records?.[job.preflight_recovery_id]?.development;need(recovery?.type==='preflight_recovery_request'&&recovery.status==='consumed'&&recovery.job_id===job.id,'RECOVERY_REQUIRED');add(recovery.expires_at);}
  if(job.specialist){
    assertSpecialistEligible(state,job);
    for(const kind of ['profile','policy']){const ref=job.specialist[kind],record=state.records?.[ref?.id];need(ref&&record&&(record.revision??null)===ref.revision&&digest(record)===ref.sha256&&record.specialist?.type===kind,'SPECIALIST_AUTHORITY_REQUIRED');add(kind==='profile'?record.specialist.definition.expires_at:record.specialist.policy.expires_at);}
  }
  if(job.context_format===6){
    const context=operatingContext(state,{scope:job.context_scope??'*',now:clock(),job_id:job.id});
    if(context.valid_until!==null)add(context.valid_until);
    for(const home of context.homes){need(home.value?.operating_record,'OPERATING_AUTHORITY_REQUIRED');if(home.value.operating_record.expires_at!==null)add(home.value.operating_record.expires_at);}
  }
  if(target?.operating_plan){need(operatingReviewContext(state,job),'OPERATING_REVIEW_AUTHORITY_REQUIRED');if(target.operating_plan.valid_until!==null)add(target.operating_plan.valid_until);}
  return deadline;
}
function carrierDeadline(r){
  const job=r.timing_job;
  if(job.kind==='development_preflight'){const maximum=finite(nativeParse(job.created_at)+45000);return r.authority_deadline_at_ms===null?maximum:Math.min(maximum,r.authority_deadline_at_ms);}
  if(job.kind==='development_test'){need(r.authority_deadline_at_ms!==null,'DEVELOPMENT_SCOPE_REQUIRED');return finite(r.authority_deadline_at_ms);}
  // A worker can claim at the last queue instant; that claim starts the
  // existing startup phase. This is a finite planned carrier ceiling, never
  // another admission window or an extension of the one-shot creation gate.
  const latestClaim=Math.min(r.deadline_at_ms,finite(nativeParse(job.created_at)+STARTUP_TIMEOUT_MS));
  const latestFirst=finite(latestClaim+STARTUP_TIMEOUT_MS),duration=finite(nativeParse(jobExecutionTiming(0,job).execution_deadline_at));
  const maximum=finite(latestFirst+duration);
  return r.authority_deadline_at_ms===null?maximum:Math.min(maximum,r.authority_deadline_at_ms);
}
function cutoff(state,job,kind,root){
  let deadline;
  if(job.kind==='development_preflight')deadline=finite(nativeParse(job.created_at)+45000);
  else if(job.kind==='development_test'){
    const plan=state.records?.[job.development_id],scope=plan?.development?.scope;
    need(plan?.development?.type==='plan'&&scope&&plan.development.scope_sha256===digest(scope)&&plan.development.authorization&&!plan.development.revoked,'DEVELOPMENT_SCOPE_REQUIRED');
    deadline=finite(nativeParse(scope.expires_at));
    if(job.preflight_recovery_id){const recovery=state.records?.[job.preflight_recovery_id]?.development;need(recovery?.type==='preflight_recovery_request'&&recovery.status==='consumed'&&recovery.job_id===job.id,'RECOVERY_REQUIRED');deadline=Math.min(deadline,finite(nativeParse(recovery.expires_at)));}
    if(kind==='worker')deadline=Math.min(deadline,finite(nativeParse(job.created_at)+STARTUP_TIMEOUT_MS));
    else {const p=job.execution_provenance;need(p?.protocol==='development-test-launch-v1'&&p.launch_intent===true&&p.runner_entered===true&&positive(p.worker_pid)&&text(p.worker_nonce)&&Number.isSafeInteger(scope.timeout_ms)&&scope.timeout_ms>=100&&scope.timeout_ms<=120000,'DEVELOPMENT_INTENT_REQUIRED');deadline=Math.min(deadline,finite(nativeParse(p.launch_intent_at)+scope.timeout_ms+5000));}
  }else{
    const timing=jobTimeoutState(job,clock());need(['waiting','executing'].includes(timing.state),'JOB_CUTOFF_REQUIRED');deadline=finite(nativeParse(timing.deadline_at));
  }
  const authority=authorityDeadline(state,job,root);
  if(authority!==null)deadline=Math.min(deadline,authority);
  return deadline;
}
function exactDescriptor(command,args,options,recipe){
  need(typeof command==='string'&&path.isAbsolute(command)&&Array.isArray(args)&&args.every(x=>typeof x==='string')&&object(options)&&(recipes.has(recipe)||recipe==='model'),'DESCRIPTOR_REQUIRED');
  need(Object.keys(options).every(key=>['cwd','env','stdio','detached','shell','timeout','killSignal'].includes(key))&&(options.shell===undefined||options.shell===false),'DESCRIPTOR_OPTIONS_REQUIRED');
  const cwd=path.resolve(options.cwd??process.cwd());need(object(options.env)&&Object.values(options.env).every(x=>typeof x==='string'),'DESCRIPTOR_ENV_REQUIRED');
  const stdio=options.stdio;need(stdio==='ignore'||Array.isArray(stdio)&&stdio.every(x=>['ignore','pipe','ipc'].includes(x)),'DESCRIPTOR_STDIO_REQUIRED');
  need(options.detached===undefined||typeof options.detached==='boolean','DESCRIPTOR_OPTIONS_REQUIRED');
  if(own(options,'timeout'))need(positive(options.timeout)&&options.timeout<=45000&&options.killSignal==='SIGKILL','DESCRIPTOR_OPTIONS_REQUIRED');
  const retained={command,args:[...args],options:{...options,cwd,env:{...options.env},stdio:Array.isArray(stdio)?[...stdio]:stdio},recipe};
  retained.sha256=digest({recipe,command,args:retained.args,cwd,env_sha256:digest(Object.fromEntries(Object.entries(options.env).sort(([a],[b])=>a.localeCompare(b)))),stdio:retained.options.stdio,detached:options.detached??false,shell:false,timeout:options.timeout??null,killSignal:options.killSignal??null});
  return retained;
}
function workerDescriptor(root,job){
  const development=['development_test','development_preflight'].includes(job.kind),recipe=development?'development_worker':'ordinary_worker';
  const options={detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'},...(job.kind==='development_preflight'?{timeout:45000,killSignal:'SIGKILL'}:{})};
  return exactDescriptor(process.execPath,['--no-warnings',path.join(DIRECTORY,development?'develop.mjs':'worker.mjs'),root,job.id],options,recipe);
}
function developmentDescriptor(loan,root,job,state){
  need(typeof sandbox.inspectRuntimeDevelopmentDescriptorFrom==='function','DEVELOPMENT_DESCRIPTOR_SOURCE_REQUIRED');
  const facts=sandbox.inspectRuntimeDevelopmentDescriptorFrom(loan,{root,job_id:job.id});
  need(facts&&facts.root===root&&facts.job_id===job.id&&['watchdog','test_child'].includes(facts.slot)&&facts.parent_pid===process.pid&&facts.recipe===(facts.slot==='watchdog'?'watchdog':'sandbox_test_child')&&hex(facts.request_sha256),'DEVELOPMENT_DESCRIPTOR_REQUIRED');
  const plan=state.records?.[job.development_id],candidate=state.records?.[job.candidate_id],scope=plan?.development?.scope;
  need(job.kind==='development_test'&&!job.reuse_receipt_id&&scope&&candidate?.development?.type==='candidate'&&candidate.development.plan_id===plan.id,'DEVELOPMENT_SCOPE_REQUIRED');
  need(same(facts.test_paths,scope.test_paths)&&facts.timeout_ms===scope.timeout_ms&&facts.max_output_bytes===scope.max_output_bytes&&same(facts.test_fixture,scope.test_fixture??null),'DEVELOPMENT_DESCRIPTOR_CHANGED');
  // The candidate directory is separately derived by the Source builder and
  // its branded loan. Company root must never substitute for candidate cwd.
  const base=path.join(root,'.company','development'),expected=candidate.development.validation_directory_relative?path.resolve(root,candidate.development.validation_directory_relative):path.join(base,plan.id,candidate.id,'source');
  need(expected.startsWith(base+path.sep)&&facts.directory===expected,'DEVELOPMENT_DIRECTORY_REQUIRED');
  signalAborted(facts.signal);if(facts.slot==='test_child')need(typeof facts.onCutoff==='function','DEVELOPMENT_CLEANUP_SOURCE_REQUIRED');
  return {descriptor:exactDescriptor(facts.command,facts.args,facts.options,facts.recipe),slot:facts.slot,request_sha256:facts.request_sha256,signal:facts.signal??null,onCutoff:facts.onCutoff??null};
}
export function runtimeJobOccupied(job){
  if(!own(job,'legacy_runtime'))return false;
  need(validateLegacyRuntimeJobShape(job),'BOOKKEEPING_REQUIRED');
  if(slots.some(name=>job.legacy_runtime[name]!==null&&job.legacy_runtime[name].closure===null))return true;
  if(own(job,'model_process_tracking')){need(validModelProcessTracking(job.model_process_tracking),'MODEL_REQUEST_REQUIRED');if(job.model_process_tracking.invocations.some(x=>x.birth===null||x.closure===null))return true;}
  return false;
}
function bindProof(state,jobs,lease,historical=[],companyId=state?.id){
  if(!object(state)||!text(companyId)||state.id!==companyId)return;
  const fields=new Map(),add=(id,identity_sha256,guard)=>{const values=fields.get(id)??new Set();values.add(digest([identity_sha256,digest(guard)]));fields.set(id,values);};
  for(const entry of historical)add(entry.id,entry.identity_sha256,entry.legacy_runtime);
  for(const [key,job]of Object.entries(jobs))if(own(job,'legacy_runtime'))add(key,identity(job),job.legacy_runtime);
  const proof={company_id:companyId,fields,lease};
  bookkeeping.set(state,proof);if(object(state.records))bookkeepingBuckets.set(state.records,proof);
}
function proofFor(state){return bookkeeping.get(state)??(state?.records&&bookkeepingBuckets.get(state.records));}
function leaseLive(lease){if(lease.status==='committed')return true;if(lease.status!=='pending')return false;try{lease.assert();return true;}catch{return false;}}
export function inheritRuntimeBookkeepingFrom(source,derived){const proof=proofFor(source);if(!proof||!leaseLive(proof.lease)||!object(derived)||derived.id!==proof.company_id)return null;bookkeeping.set(derived,proof);return true;}
export function inspectLegacyRuntimeBookkeepingFrom(state,job){
  const proof=proofFor(state),fields=proof?.fields.get(job?.id);
  if(!proof||!leaseLive(proof.lease)||state.id!==proof.company_id||!fields||!validateLegacyRuntimeJobShape(job)||!fields.has(digest([identity(job),digest(job.legacy_runtime)])))return null;
  return Object.freeze({field:'legacy_runtime',projection:copy(job.legacy_runtime),historical_unqualified:proof.lease.status==='committed',active_unqualified_snapshot:proof.lease.status==='pending'});
}
export function bindRuntimeBookkeepingFrom(store,state){
  if(!state||!Object.values(state.jobs??{}).some(job=>own(job,'legacy_runtime')))return null;
  let loan;try{loan=originalStoreExecutionCustodyFrom(store);}catch{return null;}
  const w=writes.get(loan.store);
  if(w?.lane==='legacy'&&w.expected){bindProof(state,w.expected,w.lease,w.historical,w.before.id);return true;}
  const proof=classifyRuntimeStorageFrom(loan.store);if(proof.lane!=='legacy')return null;
  const physical=rawState(loan.store),jobs={};
  for(const [key,job]of Object.entries(state.jobs??{})){const actual=physical.jobs?.[key];if(actual&&same(actual,job)&&own(job,'legacy_runtime')){need(validateLegacyRuntimeJobShape(job),'BOOKKEEPING_REQUIRED');jobs[key]=job;}}
  bindProof(state,jobs,w?.lease??{status:'committed'},inspectRuntimeStorageJobBookkeepingFrom(proof,loan.store),physical.id);return true;
}
export function beginRuntimeExecutionWriteFrom(store,type){
  const loan=originalStoreExecutionCustodyFrom(store);need(loan.mode==='write'&&loan.type===type&&!writes.has(store),'WRITE_REQUIRED');
  const row=loan.db.prepare('SELECT 1 AS present FROM company WHERE id=1').get();
  if(!row){need(loan.fresh===true,'COMPANY_REQUIRED');writes.set(store,{lane:'genesis',scope:loan.scope,loan,type,tokens:[],sealed:false,lease:{status:'pending'}});return;}
  const proof=classifyRuntimeStorageFrom(store),before=proof.lane==='legacy'?rawState(store):null;
  const w={lane:proof.lane,scope:loan.scope,loan,proof,before,type,tokens:[],approved:new Map(),modelApproved:new Map(),expected:null,sealed:false,validated:false,cutoff:null,historical:proof.lane==='legacy'?inspectRuntimeStorageJobBookkeepingFrom(proof,store):[]};
  w.lease={status:'pending',assert:()=>{loan.assert();need(writes.get(store)===w,'WRITE_EXPIRED');}};writes.set(store,w);
}
export function runtimeExecutionLaneFrom(store,state){return active(store,state).lane;}
function approve(w,job){w.approved.set(job.id,copy(job.legacy_runtime));const state=originalStoreExecutionCustodyFrom(w.loan.store).state;if(state){const jobs={...w.before.jobs,[job.id]:job};bindProof(state,jobs,w.lease,w.historical,w.before.id);}}
export function recordRuntimeWorkerAssignmentFrom(store,state,job){
  const w=active(store,state);if(w.lane==='original')return original.recordOriginalWorkerAssignmentFrom(store,state,job);
  need(w.lane==='legacy'&&queueTypes.has(w.type)&&object(job)&&text(job.id)&&job.status==='queued'&&!own(w.before.jobs??{},job.id)&&!own(job,'legacy_runtime')&&!own(job,'original_execution_assignment'),'QUEUE_WRITER_REQUIRED');
  const development=['development_test','development_preflight'].includes(job.kind);
  need(text(job.role)&&['codex','claude','local'].includes(job.host)&&positive(job.epoch)&&(development?!own(job,'instance_id'):text(job.instance_id))&&(job.native_id===null||!development&&text(job.native_id)),'ASSIGNMENT_REQUIRED');
  need(Object.values(state.jobs??{}).filter(j=>['queued','running'].includes(j.status)||runtimeJobOccupied(j)).length<3,'CAPACITY_EXHAUSTED');
  job.legacy_runtime={protocol:LEGACY_RUNTIME_PROTOCOL,worker:null,watchdog:null,test_child:null};approve(w,job);return job;
}
function makeCapability(w,job,{kind,slot=null,descriptor=null,request_sha256=null,model_binding=null,invocation_id=null}){
  const state=originalStoreExecutionCustodyFrom(w.loan.store).state;need(state?.jobs?.[job.id]===job,'ASSIGNMENT_SOURCE_REQUIRED');
  const token=Object.freeze({}),r={store:w.loan.store,root:w.loan.root,company_id:w.before.id,job_id:job.id,instance_id:job.instance_id??null,host:job.host,kind,slot,descriptor,request_sha256,model_binding,invocation_id,authority:recordsBinding(state,job),after_authority:recordsBinding(state,job,{afterCreation:true}),authority_deadline_at_ms:authorityDeadline(state,job,w.loan.root),monitor_owner:copy(w.before.owner),monitor_paused:w.before.paused,deadline_at_ms:cutoff(state,job,kind,w.loan.root),timing_job:copy(job),approved_call_timeout_ms:kind==='model'?normalizeTimeout({timeout_ms:job.timeout_ms,timeout_reason:job.timeout_reason}).timeout_ms:null,signal:null,committed:false,consumed:false,invalid:false,child:null,birth:null,closed:false,exited:false,errored:false,adapter_bound:false};
  capabilities.set(token,r);w.tokens.push(token);return {token,r};
}
export function prepareRuntimeWorkerLaunchFrom(store,state,input,descriptorLoan){
  const w=active(store,state);need(input&&['worker','model','development'].includes(input.kind)&&closed(input,input.kind==='model'?['job_id','kind','invocation_id']:['job_id','kind'])&&text(input.job_id),'LAUNCH_INPUT');
  const job=state.jobs?.[input.job_id];need(job,'JOB_REQUIRED');
  if(w.lane==='original'){
    const strict={job_id:input.job_id,kind:input.kind,...(input.kind==='model'?{invocation_id:input.invocation_id}:{})};
    const token=original.prepareOriginalWorkerLaunchFrom(store,state,strict);
    if(input.kind==='worker')originalDescriptors.set(token,workerDescriptor(w.loan.root,job));
    else if(input.kind==='development')originalDescriptors.set(token,developmentDescriptor(descriptorLoan,w.loan.root,job,state).descriptor);
    return token;
  }
  need(w.lane==='legacy'&&validateLegacyRuntimeJobShape(job)&&!terminal(job.status)&&input.kind!=='model','LAUNCH_WRITER_REQUIRED');
  need(same(job,w.before.jobs?.[job.id]),'ASSIGNMENT_CHANGED');
  const chosen=input.kind==='worker'?{descriptor:workerDescriptor(w.loan.root,job),slot:'worker',request_sha256:null}:developmentDescriptor(descriptorLoan,w.loan.root,job,state);
  const slot=chosen.slot,guard=job.legacy_runtime;
  need(w.type===(slot==='worker'?'job.worker_launch_requested':'development.execution_launch_requested')&&guard[slot]===null,'LAUNCH_ALREADY_REQUESTED');
  let parent=null;
  if(slot==='worker')need(job.status==='queued','JOB_CHANGED');
  else {parent=slot==='watchdog'?guard.worker:guard.watchdog;need(job.kind==='development_test'&&!job.reuse_receipt_id&&job.status==='running'&&parent?.birth?.pid===process.pid&&parent.closure===null,'CONTROLLER_REQUIRED');}
  const {token,r}=makeCapability(w,job,{kind:input.kind,slot,descriptor:chosen.descriptor,request_sha256:chosen.request_sha256});
  r.signal=chosen.signal??null;r.onCutoff=chosen.onCutoff??null;
  guard[slot]={launch_id:randomUUID(),controller_pid:process.pid,requested_at:new Date(clock()).toISOString(),deadline_at_ms:r.deadline_at_ms,recipe:chosen.descriptor.recipe,descriptor_sha256:chosen.descriptor.sha256,parent_launch_id:parent?.launch_id??null,request_sha256:chosen.request_sha256,birth:null,closure:null};r.request=copy(guard[slot]);approve(w,job);return token;
}
export function prepareRuntimeModelRequestFrom(store,state,input){
  const w=active(store,state);if(w.lane==='original')return null;
  need(w.lane==='legacy'&&w.type==='job.model_process.requested'&&closed(input,['job_id','invocation_id','host','native_id','prompt','cwd','selection']),'MODEL_REQUEST_REQUIRED');
  const job=state.jobs?.[input.job_id],old=w.before.jobs?.[input.job_id];
  need(job&&old&&validateLegacyRuntimeJobShape(job)&&job.status==='running'&&job.worker_pid===process.pid&&job.legacy_runtime.worker?.birth?.pid===process.pid&&job.legacy_runtime.worker.closure===null&&modelProcessProducerTransition(old,job,w.type),'MODEL_REQUEST_REQUIRED');
  const entry=job.model_process_tracking.invocations.at(-1);
  need(entry.invocation_id===input.invocation_id&&entry.job_id===job.id&&entry.instance_id===job.instance_id&&entry.worker_pid===process.pid&&entry.host===job.host&&input.host===job.host&&(input.native_id===null||typeof input.native_id==='string')&&typeof input.prompt==='string'&&path.isAbsolute(input.cwd)&&!w.tokens.some(token=>capabilities.get(token)?.invocation_id===input.invocation_id),'MODEL_REQUEST_REQUIRED');
  need(nativeParse(entry.requested_at)<=clock()&&nativeParse(entry.requested_at)>=nativeParse(job.started_at),'MODEL_REQUEST_TIMESTAMP_REQUIRED');
  const rest=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='model_process_tracking'));
  if(!same(rest(old),rest(job)))need(legacyRetentionModelRequestTransition(old,job)&&job.retention_primary_delivery.frame_sha256===sha(input.prompt),'MODEL_REQUEST_ASSIGNMENT_CHANGED');
  const binding={host:input.host,native_id:input.native_id,prompt_sha256:sha(input.prompt),cwd:path.resolve(input.cwd),selection_sha256:digest(input.selection)};
  const requestInput=Object.freeze({...binding,prompt_utf16_sha256:createHash('sha256').update(input.prompt,'utf16le').digest('hex'),prompt_utf16_units:input.prompt.length});
  const requestPolicy=Object.freeze(normalizeTimeout({timeout_ms:job.timeout_ms,timeout_reason:job.timeout_reason}));
  const grantJob={...job};delete grantJob.execution_deadline_at;const requestAuthorityDeadline=authorityDeadline(state,grantJob,w.loan.root),requestExecutionTiming=modelRequestKnownExecution(job,clock());
  // A new request cannot turn an erased overall window into another startup
  // allowance. Use the actual durable preimage, not callback-supplied history.
  if(requestExecutionTiming===null)need(!(old.model_process_tracking?.invocations??[]).some(prior=>prior.invocation_id!==input.invocation_id&&prior.birth!==null),'MODEL_OVERALL_DEADLINE_LOST');
  const {token,r}=makeCapability(w,job,{kind:'model',invocation_id:input.invocation_id,model_binding:binding});r.request=copy(entry);r.request_input_binding=requestInput;r.request_timeout_policy=requestPolicy;r.request_authority_deadline_at_ms=requestAuthorityDeadline;r.request_known_execution=requestExecutionTiming;return token;
}
function intendedJobs(w,state,{selected=false,before=null}={}){
  if(!selected)return state.jobs??{};
  const jobs=copy(w.before.jobs??{});if(own(state,'jobs')||own(before,'jobs'))for(const key of new Set([...Object.keys(before?.jobs??{}),...Object.keys(state.jobs??{})])){if(own(state.jobs??{},key))jobs[key]=copy(state.jobs[key]);else delete jobs[key];}return jobs;
}
export function prepareRuntimeExecutionWriteFrom(store,state,options={}){
  const w=active(store,state);w.sealed=true;if(w.lane!=='legacy')return;
  assertRuntimeStorageNextFrom(w.proof,store,state,options);
  const jobs=intendedJobs(w,state,options),policy=originalStoreRetainedCommitCutoffFrom(store);
  for(const token of w.tokens){const r=capabilities.get(token);if(policy!==null)r.deadline_at_ms=Math.min(r.deadline_at_ms,finite(policy));if(r.slot){jobs[r.job_id].legacy_runtime[r.slot].deadline_at_ms=r.deadline_at_ms;r.request=copy(jobs[r.job_id].legacy_runtime[r.slot]);const selected=state.jobs?.[r.job_id];if(selected)selected.legacy_runtime[r.slot].deadline_at_ms=r.deadline_at_ms;w.approved.set(r.job_id,copy(jobs[r.job_id].legacy_runtime));}if(r.kind==='worker')r.operation_deadline_at_ms=carrierDeadline(r);}
  for(const key of new Set([...Object.keys(w.before.jobs??{}),...Object.keys(jobs)])){
    const old=w.before.jobs?.[key],job=jobs[key];
    if(!own(old,'legacy_runtime')&&!own(job,'legacy_runtime'))continue;
    need(job&&legacyRuntimeJobTransition(old,job,w.type),'BOOKKEEPING_TRANSITION_REQUIRED');
    need(same(job.legacy_runtime,w.approved.get(key)??old?.legacy_runtime),'UNISSUED_BOOKKEEPING_CHANGE');
    if(!same(old?.model_process_tracking,job.model_process_tracking)){
      need(modelProcessProducerTransition(old,job,w.type),'MODEL_TRANSITION_REQUIRED');
      if(w.type==='job.model_process.requested')need(w.tokens.some(token=>{const r=capabilities.get(token);return r.kind==='model'&&r.job_id===key&&same(r.request,job.model_process_tracking.invocations.at(-1));}),'UNISSUED_MODEL_REQUEST');
      else need(same(job.model_process_tracking,w.modelApproved.get(key)),'UNOBSERVED_MODEL_PROCESS');
    }
  }
  w.expected=copy(jobs);bindProof(state,jobs,w.lease,w.historical,w.before.id);
}
export function validateRuntimeExecutionCommitFrom(store){
  const w=writes.get(store);if(!w||w.lane!=='legacy')return;
  need(w.sealed,'WRITE_SEALED_REQUIRED');inspectRuntimeStorageProofFrom(w.proof,store);
  const current=classifyRuntimeStorageFrom(store);need(current.lane==='legacy'&&current.company_id===w.before.id,'STORAGE_CHANGED');
  const state=boundState(store);
  for(const key of new Set([...Object.keys(w.expected??{}),...Object.keys(state.jobs??{})])){
    const expected=w.expected?.[key],actual=state.jobs?.[key];
    need(same(expected?.legacy_runtime,actual?.legacy_runtime),'PHYSICAL_BOOKKEEPING_CHANGED');
    if(own(expected,'legacy_runtime')||own(actual,'legacy_runtime'))need(same(expected?.model_process_tracking,actual?.model_process_tracking),'PHYSICAL_MODEL_TRACKING_CHANGED');
  }
  for(const token of w.tokens){const r=capabilities.get(token),job=state.jobs?.[r.job_id];need(job&&!r.invalid&&recordsBinding(state,job)===r.authority,'AUTHORITY_CHANGED');if(r.slot)need(same(job.legacy_runtime[r.slot],r.request),'PHYSICAL_REQUEST_CHANGED');else need(same(job.model_process_tracking?.invocations.at(-1),r.request),'PHYSICAL_REQUEST_CHANGED');}
  for(const r of [...w.tokens.map(token=>capabilities.get(token)),...(w.launch_record?[w.launch_record]:[])]){const job=state.jobs?.[r.job_id];need(job&&recordsBinding(state,job)===r.authority&&authorityDeadline(state,job,r.root)===r.authority_deadline_at_ms,'ACTIVE_AUTHORITY_CHANGED');}
  w.validated=true;
}
export function runtimeExecutionUsesNativeClockFrom(store){const w=writes.get(store);return w?.lane==='legacy'||w?.lane==='original'&&original.originalModelRequestUsesNativeCommitFrom(store);}
export function runtimeExecutionCommitCutoffFrom(store){
  const w=writes.get(store);if(!w||w.lane!=='legacy')return null;
  originalStoreExecutionCustodyFrom(store);let value=w.cutoff;
  const policy=originalStoreRetainedCommitCutoffFrom(store);
  for(const token of w.tokens){const r=capabilities.get(token);need(r&&!r.invalid,'CAPABILITY_REQUIRED');need(!signalAborted(r.signal),'LAUNCH_ABORTED');if(policy!==null)r.deadline_at_ms=Math.min(r.deadline_at_ms,finite(policy));value=value===null?r.deadline_at_ms:Math.min(value,r.deadline_at_ms);}
  if(w.launch_record){need(!signalAborted(w.launch_record.signal),'LAUNCH_ABORTED');value=value===null?w.launch_record.deadline_at_ms:Math.min(value,w.launch_record.deadline_at_ms);}
  return value;
}
export function commitRuntimeExecutionWriteFrom(store,witness){
  const w=writes.get(store);if(!w)return;
  const facts=inspectRuntimeStoreCommitWitnessFrom(witness,store);need(facts.scope===w.scope&&facts.root===w.loan.root,'COMMIT_WITNESS_REQUIRED');
  if(w.lane==='legacy'){
    need(w.sealed&&w.validated,'UNPERSISTED_REQUEST');const confirmations=[],ready=[];
    for(const token of w.tokens){
      const r=capabilities.get(token);need(r&&!r.invalid&&!r.committed,'CAPABILITY_REQUIRED');ready.push(r);
      if(r.kind==='model'){
        need(w.type==='job.model_process.requested'&&r.request_input_binding&&!modelRequestCommits.has(token),'MODEL_REQUEST_COMMIT_REQUIRED');
        confirmations.push([token,Object.freeze({protocol:'runtime-model-request-commit-v1',stage:'request',lane:'legacy',store,db:w.loan.db,root:facts.root,scope:facts.scope,type:w.type,job_id:r.job_id,instance_id:r.instance_id,invocation_id:r.invocation_id,input_binding:r.request_input_binding,timeout_policy:r.request_timeout_policy})]);
      }
    }
    // Construct every throwing binding before arming any capability. A child
    // creation write's launch_record is deliberately not request issuance.
    for(const [token,confirmation]of confirmations)modelRequestCommits.set(token,confirmation);
    for(const r of ready)r.committed=true;
  }else if(w.lane==='original')original.retainOriginalModelRequestCommitFrom(store,witness);
  w.lease.status='committed';
}
// Historical REQUEST facts only, minted by the fixed Store post-COMMIT hook.
// Reading them after close/consumption/failure never refreshes a launch token,
// proves child creation, or replaces the existing active/process result guards.
export function inspectRuntimeModelRequestCommitFrom(token,issuingStore){
  const r=capabilities.get(token);
  if(!r)return original.inspectOriginalModelRequestCommitFrom(token,issuingStore);
  const facts=modelRequestCommits.get(token);
  need(r.kind==='model'&&r.committed&&facts&&r.store===issuingStore&&facts.store===issuingStore,'MODEL_REQUEST_COMMIT_REQUIRED');
  return facts;
}
function modelRequestExecutionDeadline(job,now){
  if(!own(job,'execution_deadline_at')){need(!own(job,'execution_started_at')&&!own(job,'termination_deadline_at'),'MODEL_OVERALL_DEADLINE_REQUIRED');return null;}
  need(typeof job.execution_deadline_at==='string','MODEL_OVERALL_DEADLINE_REQUIRED');
  const value=finite(nativeParse(job.execution_deadline_at)),timing=jobTimeoutState(job,now);
  need(timing.state==='executing'&&nativeParse(timing.deadline_at)===value&&now<value,'MODEL_OVERALL_DEADLINE_EXPIRED');return value;
}
function modelRequestTiming(job){return Object.fromEntries(['execution_started_at','execution_deadline_at','termination_deadline_at'].filter(key=>own(job,key)).map(key=>[key,job[key]]));}
function modelRequestKnownExecution(job,now){return modelRequestExecutionDeadline(job,now)===null?null:Object.freeze(modelRequestTiming(job));}
function originalModelAuthority(state,job,root){
  // Original owns its typed assignment/launch identity separately. Generic
  // authority must tolerate only the same execution lifecycle as Legacy.
  const bindingJob={...job};delete bindingJob.original_execution_assignment;
  const grantJob={...job};delete grantJob.execution_deadline_at;
  return {authority_sha256:recordsBinding(state,bindingJob,{afterCreation:true}),authority_deadline_at_ms:authorityDeadline(state,grantJob,root)};
}
// Fixed Source loan for the new Original opt-in preparer. No caller-selected
// state, callback, cold JSON or returned fingerprint can issue a model token.
export function prepareRuntimeOriginalModelAuthorityFrom(store,state,job){
  const w=active(store,state);
  need(w.lane==='original'&&w.type==='job.model_process.launch_requested'&&state.jobs?.[job?.id]===job&&job.status==='running'&&job.worker_pid===process.pid&&job.epoch===state.owner?.epoch,'ORIGINAL_MODEL_AUTHORITY_REQUIRED');
  const facts=originalModelAuthority(state,job,w.loan.root),known_execution=modelRequestKnownExecution(job,clock()),loan=Object.freeze({});
  originalModelAuthorities.set(loan,{store,root:w.loan.root,scope:w.scope,company_id:state.id,job_id:job.id,instance_id:job.instance_id,known_execution,...facts});return loan;
}
export function assertRuntimeOriginalModelAuthorityFrom(subject,issuingStore,preparedScope,jobId){
  const r=originalModelAuthorities.get(subject);
  need(r&&r.store===issuingStore&&r.scope===preparedScope&&r.job_id===jobId&&!r.store.closed,'ORIGINAL_MODEL_AUTHORITY_REQUIRED');
  return r.store.readSnapshot(()=>{
    const actual=originalStoreExecutionCustodyFrom(r.store);
    need(actual.store===r.store&&actual.root===r.root,'ORIGINAL_MODEL_AUTHORITY_CHANGED');
    const write=actual.mode==='write'?writes.get(r.store):null;
    if(actual.mode==='write')need(write&&write.scope===actual.scope,'ORIGINAL_MODEL_AUTHORITY_REQUIRED');
    // Only the actual unsealed Store callback lends next state. Once the
    // physical write is sealed, reread rows rather than trusting stale next.
    const state=write&&!write.sealed?actual.state:boundState(r.store),job=state?.jobs?.[r.job_id];
    need(state?.id===r.company_id&&job&&job.instance_id===r.instance_id&&job.status==='running'&&job.worker_pid===process.pid&&job.epoch===state.owner?.epoch,'ORIGINAL_MODEL_AUTHORITY_CHANGED');
    const facts=originalModelAuthority(state,job,r.root);
    need(facts.authority_sha256===r.authority_sha256&&facts.authority_deadline_at_ms===r.authority_deadline_at_ms,'ORIGINAL_MODEL_AUTHORITY_CHANGED');
    if(r.known_execution!==null)need(same(modelRequestTiming(job),r.known_execution),'MODEL_OVERALL_DEADLINE_CHANGED');
    const now=clock();if(facts.authority_deadline_at_ms!==null)need(now<finite(facts.authority_deadline_at_ms),'ORIGINAL_MODEL_AUTHORITY_EXPIRED');
    const execution=modelRequestExecutionDeadline(job,now);
    return Object.freeze({authority_deadline_at_ms:facts.authority_deadline_at_ms,execution_deadline_at_ms:execution});
  });
}
// Phase-agnostic currentness/bounds for the opt-in outcome facade. Actual
// process closure and strict per-call timing remain separate private guards.
export function assertRuntimeModelRequestCurrentFrom(token,issuingStore){
  const r=capabilities.get(token);
  if(!r)return original.assertOriginalModelRequestCurrentFrom(token,issuingStore);
  inspectRuntimeModelRequestCommitFrom(token,issuingStore);
  need(!r.invalid&&!r.store.closed&&!signalAborted(r.signal),'MODEL_REQUEST_CURRENT_REQUIRED');
  return withCurrent(r,state=>{
    const job=state.jobs?.[r.job_id],entry=job?.model_process_tracking?.invocations?.find(x=>x.invocation_id===r.invocation_id);
    need(job&&job.status==='running'&&job.worker_pid===process.pid&&job.instance_id===r.instance_id&&job.legacy_runtime.worker?.birth?.pid===process.pid&&job.legacy_runtime.worker.closure===null&&job.model_process_tracking.current===r.invocation_id&&entry&&recordsBinding(state,job,{afterCreation:true})===r.after_authority,'MODEL_ASSIGNMENT_CHANGED');
    const grantJob={...job};delete grantJob.execution_deadline_at;
    const grant=authorityDeadline(state,grantJob,r.root);
    // Non-operation expiry is captured independently of first-spawn timing.
    need(grant===r.request_authority_deadline_at_ms,'MODEL_AUTHORITY_CHANGED');
    const now=clock();if(grant!==null){need(now<finite(grant),'MODEL_AUTHORITY_EXPIRED');if(r.closed_at_ms!==undefined)need(r.closed_at_ms<grant,'MODEL_AUTHORITY_EXPIRED');}
    if(r.request_known_execution!==null)need(same(modelRequestTiming(job),r.request_known_execution),'MODEL_OVERALL_DEADLINE_CHANGED');
    const execution=modelRequestExecutionDeadline(job,now);
    if(execution!==null&&r.closed_at_ms!==undefined)need(r.closed_at_ms<execution,'MODEL_OVERALL_DEADLINE_EXPIRED');
    return Object.freeze({authority_deadline_at_ms:grant,execution_deadline_at_ms:execution});
  });
}
export function endRuntimeExecutionWriteFrom(store){const w=writes.get(store);if(w){if(w.lease.status!=='committed')w.lease.status='revoked';for(const token of w.tokens){const r=capabilities.get(token);if(r&&!r.committed)r.invalid=true;}}writes.delete(store);}
function cap(token,kind,{consumed=false}={}){
  const r=capabilities.get(token);need(r&&!r.invalid&&r.committed&&(consumed||!r.consumed)&&(!kind||r.kind===kind)&&!r.store.closed,'PRIVATE_CAPABILITY_REQUIRED');return r;
}
function currentRequest(r,state){
  need(state.id===r.company_id&&recordsBinding(state,state.jobs?.[r.job_id]??{})===r.authority,'AUTHORITY_CHANGED');
  const job=state.jobs?.[r.job_id];need(job&&validateLegacyRuntimeJobShape(job)&&(job.instance_id===undefined?r.instance_id===null:job.instance_id===r.instance_id),'JOB_CHANGED');
  need(job&&!terminal(job.status),'JOB_TERMINAL');
  if(r.slot){need(same(job.legacy_runtime[r.slot],r.request),'REQUEST_CHANGED');if(r.slot!=='worker'){const parent=job.legacy_runtime[r.slot==='watchdog'?'worker':'watchdog'];need(parent?.birth?.pid===process.pid&&parent.closure===null,'CONTROLLER_REQUIRED');}}
  else need(job.worker_pid===process.pid&&job.legacy_runtime.worker?.birth?.pid===process.pid&&job.legacy_runtime.worker.closure===null&&job.model_process_tracking?.current===r.invocation_id&&same(job.model_process_tracking.invocations.at(-1),r.request),'MODEL_REQUEST_CHANGED');
  r.deadline_at_ms=Math.min(r.deadline_at_ms,cutoff(state,job,r.kind,r.root));return job;
}
function withCurrent(r,fn){return r.store.readSnapshot(()=>{const proof=classifyRuntimeStorageFrom(r.store);need(proof.lane==='legacy','STORAGE_CHANGED');return fn(boundState(r.store));});}
function observeSlot(r,field,value){
  const store=new Store(r.root);
  try{store.transaction(field==='birth'?'job.legacy_runtime.born':'job.legacy_runtime.closed',state=>{const w=active(store,state),job=state.jobs?.[r.job_id];need(w.lane==='legacy'&&job&&validateLegacyRuntimeJobShape(job),'OBSERVATION_CHANGED');const old=job.legacy_runtime[r.slot];need(old&&same({...old,birth:null,closure:null},{...r.request,birth:null,closure:null})&&old[field]===null,'OBSERVATION_CHANGED');if(field==='closure')need(value.pid===(old.birth?.pid??null),'OBSERVATION_CHANGED');old[field]=copy(value);approve(w,job);return state;});}finally{store.close();}
}
function sinks(child){const emitters=new Set([child,child.stdin,child.stdout,child.stderr,...(Array.isArray(child.stdio)?child.stdio:[])]),owned=[],ignore=()=>{};for(const emitter of emitters)if(emitter&&typeof emitter.on==='function'&&typeof emitter.removeListener==='function'){emitter.on('error',ignore);owned.push(emitter);}child.once('close',()=>{for(const emitter of owned)emitter.removeListener('error',ignore);});}
function retainFailure(error,r){if(error&&(typeof error==='object'||typeof error==='function')&&r.child)failures.set(error,r);}
function abortActualChild(r){
  if(r.closed||r.exited)return;
  if(r.onCutoff)try{r.onCutoff(r.child);}catch{/* Exact-child fallback remains bounded. */}
  if(r.descriptor?.recipe==='watchdog'&&r.send&&r.abortBinding&&r.child.connected)try{r.send({type:'abort',binding:r.abortBinding},()=>{});}catch{}
  try{r.kill('SIGTERM');}catch{}
  if(!r.killTimer){r.killTimer=nativeSchedule(()=>{if(!r.closed&&!r.exited)try{r.kill('SIGKILL');}catch{}},TERMINATION_GRACE_MS);r.killTimer.unref?.();}
}
function scheduleOperationCutoff(r,deadline){
  deadline=finite(deadline);
  if(r.operation_deadline_at_ms!==undefined&&deadline>r.operation_deadline_at_ms)need(false,'OPERATION_DEADLINE_EXTENSION');
  r.operation_deadline_at_ms=deadline;
  if(r.deadlineTimer)nativeUnschedule(r.deadlineTimer);
  r.deadlineTimer=nativeSchedule(()=>{r.operation_expired=true;abortActualChild(r);},Math.max(0,Math.min(2147483647,deadline-clock())));r.deadlineTimer.unref?.();
}
function carrierState(r,store){
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();
  if(normalizedLayout(loan.db)){
    const bounds=loan.db.prepare("SELECT COALESCE(SUM(length(CAST(v.bytes AS BLOB))),0) AS bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE (e.family='root' AND e.key IN ('id','owner','paused')) OR (e.family='jobs' AND e.key=?)").get(r.job_id);need(nat(bounds.bytes)&&bounds.bytes<=16*1024*1024,'MONITOR_CAPACITY');
    return readNormalized(loan.db,{rootKeys:['id','owner','paused'],entities:{jobs:[r.job_id]}});
  }
  const size=loan.db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM company WHERE id=1').get();need(size&&nat(size.bytes)&&size.bytes<=64*1024*1024,'MONITOR_CAPACITY');return rawState(store);
}
function watchCarrier(r){
  if(r.closed||r.exited||r.operation_expired)return;
  let store;
  try{
    store=new Store(r.root,false,{readOnly:true});store.readSnapshot(()=>{
      const state=carrierState(r,store),job=state.jobs?.[r.job_id];
      need(state.id===r.company_id&&same(state.owner,r.monitor_owner)&&state.paused===r.monitor_paused&&job&&validateLegacyRuntimeJobShape(job)&&job.legacy_runtime.worker?.launch_id===r.request.launch_id&&job.legacy_runtime.worker.birth?.pid===r.child.pid&&!['cancelled','interrupted','quarantined'].includes(job.status),'CARRIER_CHANGED');
      if(!own(job,'execution_started_at'))return;
      const first=job.model_process_tracking?.invocations?.[0];
      need(validModelProcessTracking(job.model_process_tracking)&&first?.birth&&first.worker_pid===r.child.pid&&first.birth.worker_pid===r.child.pid&&nativeParse(first.birth.spawned_at)<=nativeParse(job.execution_started_at),'CARRIER_EXECUTION_UNPROVED');
      const timing=jobExecutionTiming(job.execution_started_at,r.timing_job);
      for(const key of ['timeout_policy_version','timeout_ms','timeout_reason','execution_started_at','execution_deadline_at','termination_deadline_at'])need(job[key]===timing[key],'CARRIER_TIMING_CHANGED');
      const deadline=Math.min(r.operation_deadline_at_ms,finite(nativeParse(timing.execution_deadline_at)));
      if(deadline<r.operation_deadline_at_ms)scheduleOperationCutoff(r,deadline);
    });
  }catch{r.operation_expired=true;abortActualChild(r);}
  finally{store?.close();}
  if(!r.closed&&!r.exited){r.carrierPoll=nativeSchedule(()=>watchCarrier(r),250);r.carrierPoll.unref?.();}
}
function deadlineObservation(r,child){
  need(child&&typeof child.once==='function'&&typeof child.kill==='function','ACTUAL_CHILD_REQUIRED');
  r.child=child;r.kill=child.kill.bind(child);r.send=typeof child.send==='function'?child.send.bind(child):null;
  childDeadlines.set(child,r);
  child.once('close',()=>{r.closed=true;if(r.deadlineTimer)nativeUnschedule(r.deadlineTimer);if(r.killTimer)nativeUnschedule(r.killTimer);if(r.carrierPoll)nativeUnschedule(r.carrierPoll);if(r.signal&&r.onSignal)nativeApply(nativeSignalRemove,r.signal,['abort',r.onSignal]);});
  if(r.signal){r.onSignal=()=>{r.operation_expired=true;abortActualChild(r);};nativeApply(nativeSignalAdd,r.signal,['abort',r.onSignal,{once:true}]);if(signalAborted(r.signal))r.onSignal();}
  if(r.kind==='model'){
    // Before an actual model spawn event this is a startup timer, not the
    // future execution duration. The one-shot creation deadline never moves.
    r.deadlineTimer=nativeSchedule(()=>{r.operation_expired=true;abortActualChild(r);},Math.max(0,Math.min(2147483647,r.deadline_at_ms-clock())));r.deadlineTimer.unref?.();
  }else scheduleOperationCutoff(r,r.kind==='worker'?carrierDeadline(r):r.deadline_at_ms);
  if(r.kind==='worker'&&!['development_test','development_preflight'].includes(r.timing_job.kind)){r.carrierPoll=nativeSchedule(()=>watchCarrier(r),250);r.carrierPoll.unref?.();}
}
export function runtimeExecutionDeadlineFrom(child){const r=childDeadlines.get(child);need(r&&r.child===child,'ACTUAL_CHILD_DEADLINE_REQUIRED');return finite(r.operation_deadline_at_ms??r.deadline_at_ms);}
export function runtimeExecutionObservationTimeFrom(child,event){const r=childDeadlines.get(child);need(r&&r.child===child&&['spawn','close'].includes(event),'ACTUAL_CHILD_OBSERVATION_REQUIRED');const value=event==='spawn'?r.spawn_observed_at_ms:r.closed_at_ms;need(value!==undefined,'ACTUAL_CHILD_OBSERVATION_REQUIRED');return finite(value);}
function create(r){
  need(r.descriptor,'DESCRIPTOR_REQUIRED');let birthDurable=false;
  try{r.store.transaction(r.slot?'job.legacy_runtime.born':'job.model_process.launch_requested',state=>{
    const w=active(r.store,state);need(w.lane==='legacy','STORAGE_CHANGED');const job=currentRequest(r,state);r.consumed=true;w.cutoff=r.deadline_at_ms;w.launch_record=r;finalCutoff(r);
    const d=r.descriptor;r.create_before_ms=clock();const child=spawn(d.command,d.args,d.options);r.child=child;r.create_return_ms=clock();need(child&&typeof child.once==='function'&&typeof child.kill==='function','ACTUAL_CHILD_REQUIRED');sinks(child);
    if(d.recipe==='watchdog'){const request=JSON.parse(d.args.at(-1)).request;need(request&&request.controller_pid===process.pid&&request.request_sha256===r.request_sha256,'DEVELOPMENT_REQUEST_CHANGED');r.abortBinding={...request,watchdog_pid:child.pid??null};}
    deadlineObservation(r,child);
    const persist=()=>{if(r.slot&&r.birth&&!birthDurable)try{observeSlot(r,'birth',r.birth);birthDurable=true;}catch{/* retained UNKNOWN */}};
    const born=()=>{
      const observed=clock();r.spawn_observed_at_ms=observed;
      if(!r.birth&&positive(child.pid))r.birth={pid:child.pid,observed_at:new Date(observed).toISOString()};persist();
      if(r.kind==='model'&&!r.execution_started){
        const now=observed;if(now>=r.deadline_at_ms){r.operation_expired=true;abortActualChild(r);return;}
        r.execution_started=true;
        // Creation and execution are separate stages. Only an actual spawn
        // starts the validated per-call duration; this never reissues a token.
        const operation=Math.min(finite(now+r.execution_timeout_ms),r.authority_deadline_at_ms??Infinity,r.requested_execution_deadline_at_ms??Infinity);
        scheduleOperationCutoff(r,operation);
      }
    };
    child.on('error',()=>{if(!r.birth)r.errored=true;});child.once('spawn',born);child.once('exit',()=>{r.exited=true;});
    child.once('close',(code,signal)=>{r.closed=true;const observed=clock();r.close={code:code??null,signal:signal??null,observed_at:new Date(observed).toISOString()};r.closed_at_ms=observed;persist();if(r.slot&&(r.birth||r.errored)){const value={pid:r.birth?.pid??null,observed_at:r.close.observed_at,exit_code:r.close.code,signal:r.close.signal,never_started:r.birth===null&&r.errored};try{observeSlot(r,'closure',value);}catch{/* no inferred closure */}}});
    if(positive(child.pid)){r.birth={pid:child.pid,observed_at:new Date(clock()).toISOString()};if(r.slot){job.legacy_runtime[r.slot].birth=copy(r.birth);approve(w,job);}}
    return state;
  });birthDurable=r.slot!==null&&r.birth!==null;return r.child;}catch(error){r.invalid=true;retainFailure(error,r);throw error;}
}
export function spawnRuntimeWorkerLaunch(token){
  const originalDescriptor=originalDescriptors.get(token);if(originalDescriptor){
    originalDescriptors.delete(token);const child=original.spawnOriginalWorkerLaunch(token,originalDescriptor.command,originalDescriptor.args,originalDescriptor.options),r={child,descriptor:originalDescriptor,closed:false,exited:false};
    try{
      // Own the returned exact child before any new cross-module inspection.
      r.kill=child.kill.bind(child);child.once('close',()=>{r.closed=true;});child.once('exit',()=>{r.exited=true;});
      need(typeof original.inspectOriginalWorkerLaunchDeadlineFrom==='function','ORIGINAL_DEADLINE_SOURCE_REQUIRED');r.deadline_at_ms=finite(original.inspectOriginalWorkerLaunchDeadlineFrom(token,child));
      // This is a read-only creation cutoff for the existing strict route.
      // Its execution timers remain owned by that route; a queued carrier's
      // startup cutoff must not become a new lifetime ceiling on a review.
      childDeadlines.set(child,r);return child;
    }catch(error){retainFailure(error,r);throw error;}
  }
  const r=cap(token);need(r.slot!==null,'LAUNCH_KIND_REQUIRED');withCurrent(r,state=>currentRequest(r,state));finalCutoff(r);return create(r);
}
export function assertRuntimeWorkerStartedFrom(store,state,jobId){
  const w=active(store,state);if(w.lane==='original')return true;
  const job=state.jobs?.[jobId];need(w.lane==='legacy'&&job&&validateLegacyRuntimeJobShape(job)&&job.legacy_runtime.worker?.birth?.pid===process.pid&&job.legacy_runtime.worker.closure===null&&clock()<job.legacy_runtime.worker.deadline_at_ms,'WORKER_BIRTH_REQUIRED');return true;
}
export function isLegacyRuntimeModelCapabilityFrom(token){return capabilities.get(token)?.kind==='model';}
export function assertLegacyRuntimeModelLaunchFrom(token,input){
  const r=cap(token,'model');need(closed(input,['host','native_id','prompt','cwd','selection'])&&same(r.model_binding,{host:input.host,native_id:input.native_id,prompt_sha256:sha(input.prompt),cwd:path.resolve(input.cwd),selection_sha256:digest(input.selection)}),'MODEL_INPUT_CHANGED');withCurrent(r,state=>currentRequest(r,state));finalCutoff(r);return Object.freeze({deadline_at_ms:r.authority_deadline_at_ms});
}
function modelExecutionPolicy(record,facts){need(positive(record.approved_call_timeout_ms)&&record.approved_call_timeout_ms>=1000&&record.approved_call_timeout_ms<=600000&&positive(facts.execution_timeout_ms)&&facts.execution_timeout_ms>=1000&&facts.execution_timeout_ms<=record.approved_call_timeout_ms,'EXECUTION_POLICY_REQUIRED');return facts.execution_timeout_ms;}
export function bindLegacyRuntimeModelAdapterFrom(token,loan){
  const r=cap(token,'model');need(!r.adapter_bound&&typeof adapter.inspectLegacyRuntimeAdapterLoanFrom==='function','ADAPTER_SOURCE_REQUIRED');
  const facts=adapter.inspectLegacyRuntimeAdapterLoanFrom(loan,token);need(facts&&same(facts.options?.stdio,['pipe','pipe','pipe'])&&path.resolve(facts.options.cwd)===r.model_binding.cwd,'ADAPTER_DESCRIPTOR_REQUIRED');
  const duration=modelExecutionPolicy(r,facts);
  const descriptor=exactDescriptor(facts.command,facts.args,facts.options,'model');r.deadline_at_ms=Math.min(r.deadline_at_ms,finite(facts.deadline_at_ms));signalAborted(facts.signal);r.signal=facts.signal;r.descriptor=descriptor;r.execution_timeout_ms=duration;r.requested_execution_deadline_at_ms=facts.execution_deadline_at_ms===null?null:finite(facts.execution_deadline_at_ms);r.adapter_bound=true;finalCutoff(r);
}
export function spawnLegacyRuntimeModelLaunch(token){const r=cap(token,'model');need(r.adapter_bound,'ADAPTER_SOURCE_REQUIRED');withCurrent(r,state=>currentRequest(r,state));finalCutoff(r);return create(r);}
export function legacyRuntimeFailedLaunchChild(error){return failures.get(error)?.child??null;}
export function legacyRuntimeFailedLaunchClosed(error){const r=failures.get(error);return r?r.closed:null;}
export function cleanupLegacyRuntimeLaunchFailure(error){
  const r=failures.get(error);if(!r)return false;if(r.closed||r.exited)return true;
  if(!r.kill&&r.child&&typeof r.child.kill==='function')r.kill=r.child.kill.bind(r.child);
  abortActualChild(r);if(r.killTimer)r.child.once('close',()=>{nativeUnschedule(r.killTimer);});
  return true;
}
function actualModelObservation(r,birth,receipt){
  need(r.kind==='model'&&r.committed&&r.consumed&&r.child&&r.birth&&r.closed&&r.close&&validModelProcessBirth(birth),'MODEL_PHYSICAL_CLOSURE_REQUIRED');
  actualBirthTimestamp(r,birth);
  need(birth.pid===r.birth.pid&&birth.worker_pid===process.pid&&birth.host===r.host&&birth.command_sha256===sha(r.descriptor.command)&&birth.argv_sha256===digest(r.descriptor.args)&&birth.cwd_sha256===sha(r.descriptor.options.cwd),'MODEL_PHYSICAL_BIRTH_CHANGED');
  need(closed(receipt,['protocol','birth_sha256','closed_at','exit_code','signal','observation'])&&receipt.protocol==='ordinary-model-process-close-v1'&&receipt.birth_sha256===digest(birth)&&receipt.observation==='original-child-close'&&receipt.exit_code===r.close.code&&receipt.signal===r.close.signal&&instant(receipt.closed_at)&&nativeParse(receipt.closed_at)===r.closed_at_ms&&r.closed_at_ms>=r.spawn_observed_at_ms&&r.closed_at_ms<=clock(),'MODEL_PHYSICAL_CLOSURE_CHANGED');
  return true;
}
function actualBirthTimestamp(r,birth){need(r.spawn_observed_at_ms!==undefined&&nativeParse(birth.spawned_at)===r.spawn_observed_at_ms&&r.spawn_observed_at_ms>=r.create_return_ms&&r.create_return_ms>=r.create_before_ms&&r.spawn_observed_at_ms>=nativeParse(r.request.requested_at)&&r.spawn_observed_at_ms<=clock(),'MODEL_PHYSICAL_TIMESTAMP_CHANGED');}
function modelResultTiming(r){need(!r.invalid&&!r.store.closed&&r.execution_started&&!r.operation_expired&&r.closed_at_ms<finite(r.operation_deadline_at_ms),'MODEL_LAUNCH_FAILED');return true;}
export function assertRuntimeModelProcessObservedFrom(token,birth,receipt){
  const r=capabilities.get(token);
  if(!r){need(typeof original.assertOriginalOrdinaryModelObservedFrom==='function','ORIGINAL_OBSERVATION_SOURCE_REQUIRED');return original.assertOriginalOrdinaryModelObservedFrom(token,birth,receipt);}
  actualModelObservation(r,birth,receipt);modelResultTiming(r);
  r.store.readSnapshot(()=>{
    const proof=classifyRuntimeStorageFrom(r.store);need(proof.lane==='legacy'&&proof.company_id===r.company_id,'MODEL_STORAGE_CHANGED');
    const state=boundState(r.store),job=state.jobs?.[r.job_id],entry=job?.model_process_tracking?.invocations.find(x=>x.invocation_id===r.invocation_id);
    need(job&&job.id===r.job_id&&job.instance_id===r.instance_id&&job.worker_pid===process.pid&&entry&&entry.job_id===job.id&&entry.instance_id===job.instance_id&&entry.worker_pid===process.pid&&same(entry.birth,birth)&&same(entry.closure,receipt),'MODEL_CANONICAL_OBSERVATION_CHANGED');
    need(job.status==='running'&&recordsBinding(state,job,{afterCreation:true})===r.after_authority,'MODEL_ASSIGNMENT_CHANGED');
  });return true;
}
export function approveRuntimeModelProcessObservationFrom(store,state,token,field,birth,receipt){
  const w=active(store,state);need(['birth','closure'].includes(field),'MODEL_OBSERVATION_REQUIRED');
  const r=capabilities.get(token);
  if(!r){
    need(w.lane==='original','MODEL_CAPABILITY_REQUIRED');
    const inspect=field==='birth'?original.assertOriginalOrdinaryModelBirthObservedFrom:original.assertOriginalOrdinaryModelClosureObservedFrom;
    need(typeof inspect==='function','ORIGINAL_OBSERVATION_SOURCE_REQUIRED');inspect(token,birth,receipt);return true;
  }
  need(w.lane==='legacy'&&r.root===w.loan.root&&r.company_id===state.id&&r.kind==='model'&&r.committed&&r.consumed&&r.child&&r.birth&&validModelProcessBirth(birth),'MODEL_PHYSICAL_BIRTH_REQUIRED');
  actualBirthTimestamp(r,birth);
  need(birth.pid===r.birth.pid&&birth.worker_pid===process.pid&&birth.host===r.host&&birth.command_sha256===sha(r.descriptor.command)&&birth.argv_sha256===digest(r.descriptor.args)&&birth.cwd_sha256===sha(r.descriptor.options.cwd),'MODEL_PHYSICAL_BIRTH_CHANGED');
  if(field==='closure')actualModelObservation(r,birth,receipt);
  const job=state.jobs?.[r.job_id],entry=job?.model_process_tracking?.invocations.find(x=>x.invocation_id===r.invocation_id);
  need(job&&entry&&same(entry.birth,birth)&&(field==='birth'?entry.closure===null:same(entry.closure,receipt)),'MODEL_OBSERVATION_CHANGED');
  w.modelApproved.set(job.id,copy(job.model_process_tracking));return true;
}
export function assertRuntimeDevelopmentProcessClosureFrom(store,state,jobId,result){
  const w=active(store,state);if(w.lane==='original')return true;
  const job=state.jobs?.[jobId];need(w.lane==='legacy'&&job&&validateLegacyRuntimeJobShape(job),'DEVELOPMENT_PROCESSES_REQUIRED');
  if(result?.status!=='passed')return true;
  if(job.reuse_receipt_id){
    const source=state.records?.[job.reuse_receipt_id];
    need(source?.development?.type==='test'&&source.development.result?.status==='passed'&&source.development.result.tests_executed===true&&result.reused===true&&result.tests_executed===false&&result.original_tests_executed===true&&result.reused_from===source.id&&job.legacy_runtime.watchdog===null&&job.legacy_runtime.test_child===null,'REUSE_BINDING_REQUIRED');
    // Existing development validation still verifies the exact fingerprint,
    // candidate and independent reuse qualification. This only prevents a
    // reused Boolean from pretending new physical child observations exist.
    return true;
  }
  need(result.reused!==true,'REUSE_BINDING_REQUIRED');
  need(['watchdog','test_child'].every(name=>job.legacy_runtime[name]?.birth&&job.legacy_runtime[name]?.closure&&job.legacy_runtime[name].closure.never_started===false),'DEVELOPMENT_PHYSICAL_CLOSURE_REQUIRED');return true;
}
