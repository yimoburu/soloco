import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Store,originalStoreExecutionCustodyFrom,originalStoreRetainedCommitCutoffFrom,inspectRuntimeStoreCommitWitnessFrom,retainOriginalStoreCommitCutoffFrom as retainStoreCutoff} from '../store.mjs';
import {readNormalized} from '../record-storage.mjs';
import {prepareRuntimeOriginalModelAuthorityFrom,assertRuntimeOriginalModelAuthorityFrom} from '../runtime-execution.mjs';
import {comparisonEvidenceEventFrom} from '../integrated-comparison-evidence.mjs';
import {bindSnapshots,resolveSnapshotEntry} from '../snapshot.mjs';
import {dataDir} from '../plugin-data.mjs';
import {inspectOriginalUpgradeLaunchCutoffFrom} from '../upgrade.mjs';
import {inspectOriginalAdapterModelCutoffFrom} from '../adapters.mjs';
import {validateContext as validatePeerTaskContext} from './model.mjs';
import {PeerLedger,FAMILIES,canonical,originalPeerExecutionCustodyFrom,originalPeerExecutionLedgerFrom} from './ledger.mjs';
import {validateBootstrapMembershipOwnedClosure} from './bootstrap-membership-contract.mjs';
import {jobTimeoutState,normalizeTimeout,TERMINATION_GRACE_MS} from '../timeout.mjs';
import * as originalAdapter from '../adapters.mjs';
import * as originalProtectedDomain from './protected-codex-domain.mjs';
import * as originalMechanicalQa from './origin-mechanical-qa-policy.mjs';

// This is a fixed Source domain, never a caller-selected census. Carriers and
// capability queries are not additional assignment/model-invocation units.
// An original request with no original close is UNKNOWN and stays occupied.
const RUNTIME=fileURLToPath(new URL('../',import.meta.url));
// Node generation stays inside the runtime package in both layouts. Native
// code/resources are independently pinned by the actual full Native recipe,
// package inventory and original ordinary Source/native tuple below.
const SOURCE_FILES=Object.freeze(['store.mjs','runtime-execution.mjs','legacy-storage-proof.mjs','store-precommit-contract.mjs','record-storage.mjs','snapshot.mjs','plugin-data.mjs','engine.mjs','worker.mjs','adapters.mjs','timeout.mjs','model-process-closure.mjs','task-runtime.mjs','develop.mjs','local-sandbox.mjs','origin-mechanical-qa-worker.mjs','upgrade.mjs','current-state.mjs','task-context.mjs','peers/prospective-local-worker-inventory-producer.mjs','peers/ledger.mjs','peers/model.mjs','peers/membership.mjs','peers/bootstrap-membership.mjs','peers/bootstrap-membership-contract.mjs','peers/origin-quarantine.mjs','peers/origin-maintenance.mjs','peers/origin-mechanical-qa-policy.mjs','peers/input-frontier-maintenance.mjs','peers/origin-frontier-seal.mjs','peers/owner-handover.mjs','peers/protected-codex-domain.mjs','peers/codex-task-host.mjs','peers/scheduler.mjs','peers/origin-ordinary-task-contract.mjs','peers/origin-ordinary-task-transition.mjs','peers/origin-ordinary-task.mjs','peers/origin-ordinary-task-instruction.mjs','peers/origin-ordinary-task-readonly3-contract-v1.json','peers/origin-maintenance-authority.mjs','peers/owner-operating-state.mjs','peers/owner-transfer-intent.mjs','peers/origin-paused-bootstrap-accounting.mjs','peers/input-frontier-checkpoint.mjs','peers/origin-plan.mjs','peer-origin-runtime.mjs','peer-owner-runtime.mjs','peers/origin-maintenance-wire.mjs','peers/origin-maintenance-host.mjs','peers/maintenance-launch.mjs','peers/protected-context-channel.mjs','peers/protected-source-build-slot.mjs','peers/policy-supervisor.mjs','peers/context-component-deployment.mjs','operating-state.mjs','handover.mjs','scoped-context.mjs','runtime-execution-shapes.mjs','development-review-continuation.mjs','development-retention-repair.mjs','specialists.mjs','prototype.mjs','retention-primary-transport.mjs','development-delivery.mjs','context-qualification.mjs','notice-sources.mjs','legacy-operating.mjs','corpus-structure.mjs','upgrade-evidence.mjs','integrated-comparison-evidence.mjs','integrated-comparison-source.mjs','integrated-comparison-test.mjs','integrated-comparison-worker.mjs','qualification/issue18-ledger-storage.mjs','qualification/issue18/integrated-comparison-bootstrap.mjs','qualification/issue18/integrated-comparison-data.mjs','qualification/issue18/integrated-comparison-evidence-io.mjs','qualification/issue18/integrated-comparison-issuer.mjs','qualification/issue18/observed-outcome.mjs','qualification/issue18/typed-capture.mjs','development-full-file-output.mjs','state-projections.mjs','storage-transfer.mjs']);
const LEGACY_UNIT='legacy-standalone-assignment',PEER_UNIT='new-origin-maintenance-model-invocation';
const terminal=status=>['completed','failed','cancelled','interrupted','quarantined'].includes(status);
const ORIGIN='original-local-execution-origin-v1',ASSIGNMENT='original-local-execution-assignment-v1',JOURNAL='original-local-execution-journal-v1';
const MAX_ROWS=100_000,MAX_BYTES=64*1024*1024,MAX_JOB_BYTES=16*1024*1024;
const own=(v,k)=>Object.hasOwn(v,k),copy=v=>JSON.parse(JSON.stringify(v));
const hash=v=>createHash('sha256').update(v).digest('hex'),digest=v=>hash(canonical(v));
const same=(a,b)=>a===undefined||b===undefined?a===b:canonical(a)===canonical(b);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=2000;
const nat=v=>Number.isSafeInteger(v)&&v>=0;
const positive=v=>Number.isSafeInteger(v)&&v>0;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function need(ok,code,detail=''){if(!ok)throw Object.assign(Error('Original execution Hold: '+code+(detail?' ('+detail+')':'')),{code:'ORIGINAL_EXECUTION_'+code});}
function time(){return new Date().toISOString();}
const abortedGetter=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
function finiteCutoff(value){need(Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000,'CUTOFF_REQUIRED');return value;}
function finalLaunchCutoff(record){
  if(record.signal!==null&&record.signal!==undefined){let aborted;try{aborted=Reflect.apply(abortedGetter,record.signal,[]);}catch{record.invalid=true;need(false,'CUTOFF_SIGNAL_REQUIRED');}if(aborted){record.invalid=true;need(false,'LAUNCH_ABORTED');}}
  const cutoff=record.deadline_at_ms,now=Date.now();
  if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(cutoff)||now>=cutoff){record.invalid=true;need(false,'CUTOFF_EXPIRED');}
}
function originalJobCutoff(state,job,kind){
  if(job.kind==='development_test'){
    const plan=state.records?.[job.development_id],scope=plan?.development?.scope;need(plan?.development?.type==='plan'&&plan.development.scope_sha256===hash(JSON.stringify(scope))&&plan.development.authorization&&!plan.development.revoked,'DEVELOPMENT_CUTOFF_REQUIRED');
    let deadline=finiteCutoff(Date.parse(scope.expires_at));
    if(job.preflight_recovery_id){const recovery=state.records?.[job.preflight_recovery_id]?.development;need(recovery?.type==='preflight_recovery_request'&&recovery.job_id===job.id&&recovery.status==='consumed','DEVELOPMENT_CUTOFF_REQUIRED');deadline=Math.min(deadline,finiteCutoff(Date.parse(recovery.expires_at)));}
    if(kind==='development'){const p=job.execution_provenance;need(p?.protocol==='development-test-launch-v1'&&p.launch_intent===true&&Number.isSafeInteger(scope.timeout_ms)&&scope.timeout_ms>=100&&scope.timeout_ms<=120000,'DEVELOPMENT_CUTOFF_REQUIRED');deadline=Math.min(deadline,finiteCutoff(Date.parse(p.launch_intent_at)+scope.timeout_ms+5000));}
    return deadline;
  }
  if(job.kind==='development_preflight')return finiteCutoff(Date.parse(job.created_at)+45000);
  const observed=jobTimeoutState(job,Date.now());need(['waiting','executing'].includes(observed.state),'CUTOFF_REQUIRED');return finiteCutoff(Date.parse(observed.deadline_at));
}
function mechanicalQaLaunchCandidate(state,job){
  // Hints only select stricter validation. Original mechanical identities keep
  // that routing when a later write removes its current plan or admission.
  return Boolean(state.records?.[job.review_of?.id]?.origin_quarantine_plan)||Object.values(state.records??{}).some(r=>r?.origin_mechanical_qa?.protocol==='peer-origin-mechanical-qa-admission-v1'&&r.origin_mechanical_qa.job_id===job.id)||job.id.startsWith('job-origin-mechanical:')||typeof job.instance_id==='string'&&job.instance_id.startsWith('qa-origin-mechanical:')||typeof job.session_key==='string'&&job.session_key.startsWith('qa:origin-mechanical:');
}
function mechanicalQaLaunchAuthority(store,state,job,expected=null){
  need(typeof originalMechanicalQa.assertPeerOriginMechanicalQaJobFrom==='function','MECHANICAL_QA_SOURCE_REQUIRED');
  const proof=originalMechanicalQa.assertPeerOriginMechanicalQaJobFrom(store.db,state,job.id),binding={protocol:proof.protocol,admission_ref:copy(proof.admission_ref),grant_ref:copy(proof.grant_ref),packet_ref:copy(proof.packet_ref),plan_ref:copy(proof.plan_ref),context_sha256:proof.context_sha256,policy_generation:proof.policy_generation,deadline_at_ms:finiteCutoff(proof.deadline_at_ms)};
  if(expected!==null)need(same(binding,expected),'MECHANICAL_QA_ADMISSION_CHANGED');
  const execution=job.execution_deadline_at;need(execution===undefined||typeof execution==='string'&&Number.isSafeInteger(Date.parse(execution)),'CUTOFF_REQUIRED');
  return {binding,deadline_at_ms:Math.min(binding.deadline_at_ms,execution===undefined?Infinity:finiteCutoff(Date.parse(execution)))};
}
function check(loan,operation){loan.assert();const result=operation();loan.assert();return result;}
function query(loan,sql,method,...args){return check(loan,()=>loan.db.prepare(sql)[method](...args));}
function bounded(loan,table,bytesColumn,maximum=MAX_BYTES){
  const row=query(loan,`SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(${bytesColumn} AS BLOB))),0) AS bytes FROM ${table}`,'get');
  need(nat(row.n)&&row.n<=MAX_ROWS&&nat(row.bytes)&&row.bytes<=maximum,'INVENTORY_CAPACITY');return row;
}
function generation(){
  const rows=[];let total=0;
  for(const name of SOURCE_FILES){
    const file=path.join(RUNTIME,name),named=fs.lstatSync(file);need(named.isFile()&&!named.isSymbolicLink()&&nat(named.size)&&named.size<=2*1024*1024,'SOURCE_REQUIRED',name);
    const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let body;
    try{const before=fs.fstatSync(fd);need(before.dev===named.dev&&before.ino===named.ino&&before.size===named.size,'SOURCE_CHANGED');body=Buffer.alloc(named.size);let offset=0;
      while(offset<body.length){const n=fs.readSync(fd,body,offset,Math.min(65536,body.length-offset),offset);need(n>0,'SOURCE_CHANGED');offset+=n;}
      need(fs.readSync(fd,Buffer.alloc(1),0,1,named.size)===0,'SOURCE_CHANGED');const after=fs.fstatSync(fd),current=fs.lstatSync(file);
      for(const row of [after,current])need(row.dev===before.dev&&row.ino===before.ino&&row.size===before.size&&row.mtimeMs===before.mtimeMs&&row.ctimeMs===before.ctimeMs,'SOURCE_CHANGED');
    }finally{fs.closeSync(fd);}
    total+=body.length;need(total<=16*1024*1024,'SOURCE_CAPACITY');rows.push({path:name,sha256:hash(body),utf8_bytes:body.length});
  }
  return digest({protocol:'original-local-execution-source-v1',legacy_unit:LEGACY_UNIT,maintenance_unit:PEER_UNIT,files:rows});
}
// Node-only fixed Source metadata, not a Native-support lookup or a grant.
export function inspectOriginalSourceGenerationFrom(){need(arguments.length===0,'SOURCE_GENERATION_ARGUMENTS');return generation();}
function key(raw){if(!raw.startsWith('~json:'))return raw;let value;try{value=JSON.parse(raw.slice(6));}catch{need(false,'STORAGE_KEY');}need(typeof value==='string','STORAGE_KEY');return value;}
function storedProjection(loan){
  const layout=query(loan,"SELECT 1 FROM sqlite_master WHERE type='table' AND name='state_entries'",'get');
  if(!layout){
    const size=query(loan,'SELECT length(CAST(value AS BLOB)) AS bytes FROM company WHERE id=1','get');if(!size)return null;
    need(nat(size.bytes)&&size.bytes<=MAX_BYTES,'INVENTORY_CAPACITY');const row=query(loan,'SELECT value FROM company WHERE id=1','get');let state;
    try{state=JSON.parse(row.value);}catch{need(false,'STORAGE_BODY');}
    need(state&&typeof state==='object'&&!Array.isArray(state),'STORAGE_BODY');
    return {id:state.id,origin:state.original_execution_origin??null,jobs:state.jobs??{},upgrades:upgradeProjection(bindUpgradeSnapshotReader(loan,state))};
  }
  const aggregate=query(loan,"SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(v.bytes AS BLOB))),0) AS bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE e.family='jobs' OR (e.family='root' AND e.key IN ('id','original_execution_origin'))",'get');
  need(nat(aggregate.n)&&aggregate.n<=MAX_ROWS&&nat(aggregate.bytes)&&aggregate.bytes<=MAX_JOB_BYTES,'INVENTORY_CAPACITY');
  const rows=query(loan,"SELECT e.family,e.key,e.sha256,e.encoding,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE e.family='jobs' OR (e.family='root' AND e.key IN ('id','original_execution_origin')) ORDER BY e.family,e.key",'all');
  const value={id:null,origin:null,jobs:{}};
  for(const row of rows){need(row.encoding==='json'&&typeof row.bytes==='string'&&hash(row.bytes)===row.sha256,'STORAGE_BODY');let body;try{body=JSON.parse(row.bytes);}catch{need(false,'STORAGE_BODY');}
    if(row.family==='jobs')Object.defineProperty(value.jobs,key(row.key),{value:body,enumerable:true,writable:true,configurable:true});else if(row.key==='id')value.id=body;else value.origin=body;}
  value.upgrades=storedUpgrades(loan);return value;
}
function validOrigin(origin,loan,id){
  need(closed(origin,['protocol','origin_id','company_id','root_sha256','source_generation_sha256','legacy_unit','maintenance_unit'])&&origin.protocol===ORIGIN&&text(origin.origin_id)&&origin.company_id===id&&origin.root_sha256===hash(loan.root)&&origin.legacy_unit===LEGACY_UNIT&&origin.maintenance_unit===PEER_UNIT&&hex(origin.source_generation_sha256),'ORIGIN_REQUIRED');
  need(origin.source_generation_sha256===generation(),'SOURCE_GENERATION_CHANGED');
}
function validAssignment(job,origin){
  const a=job?.original_execution_assignment;
  need(closed(a,['protocol','origin_id','assignment_id','source_generation_sha256','unit','launches'])&&a.protocol===ASSIGNMENT&&a.origin_id===origin.origin_id&&a.assignment_id===job.id&&a.source_generation_sha256===origin.source_generation_sha256&&a.unit===LEGACY_UNIT&&Array.isArray(a.launches)&&a.launches.length<=10000,'ASSIGNMENT_REQUIRED');
  const ids=new Set(),invocations=new Set();let worker=0;
  for(const l of a.launches){need(closed(l,['launch_id','kind','invocation_id','requested_at','controller_pid','birth','closure'])&&text(l.launch_id)&&!ids.has(l.launch_id)&&['worker','model','development'].includes(l.kind)&&positive(l.controller_pid)&&typeof l.requested_at==='string'&&Number.isFinite(Date.parse(l.requested_at)),'LAUNCH_REQUIRED');ids.add(l.launch_id);
    if(l.kind==='worker')need(++worker===1&&l.invocation_id===null,'LAUNCH_CARDINALITY');else if(l.kind==='model'){need(text(l.invocation_id)&&!invocations.has(l.invocation_id),'LAUNCH_CARDINALITY');invocations.add(l.invocation_id);}else need(l.invocation_id===null,'LAUNCH_REQUIRED');
    if(l.birth!==null)need(closed(l.birth,['protocol','pid','parent_pid','command_sha256','argv_sha256','cwd_sha256','observed_at'])&&l.birth.protocol==='original-local-child-birth-v1'&&positive(l.birth.pid)&&l.birth.parent_pid===l.controller_pid&&['command_sha256','argv_sha256','cwd_sha256'].every(k=>hex(l.birth[k]))&&Number.isFinite(Date.parse(l.birth.observed_at)),'BIRTH_REQUIRED');
    if(l.closure!==null)need(closed(l.closure,['protocol','launch_id','pid','code','signal','never_started','observed_at'])&&l.closure.protocol==='original-local-child-close-v1'&&l.closure.launch_id===l.launch_id&&l.closure.pid===(l.birth?.pid??null)&&typeof l.closure.never_started==='boolean'&&(l.closure.never_started?l.birth===null:l.birth!==null)&&(l.closure.code===null||Number.isInteger(l.closure.code))&&(l.closure.signal===null||typeof l.closure.signal==='string')&&Number.isFinite(Date.parse(l.closure.observed_at)),'CLOSE_REQUIRED');
  }
}
function projectionHash(p){return digest(p);}
const queueTypes=new Set(['job.queued','task.job_queued','development.test_reserved','development.preflight_recovery_reserved','development.preflight_diagnostic_reserved']);
const observationTypes=new Set(['job.failed','job.spawn_failed','task.spawn_failed','jobs.interrupted','job.model_process.born','job.model_process.closed','job.original_execution.closed','development.test_spawn_failed','development.maintenance_spawn_failed','development.test_start_failed','development.preflight_diagnostic_finished','upgrade.native_returned','upgrade.interrupted','upgrade.failed','upgrade.worker_closed','upgrade.original_execution.born','upgrade.original_execution.closed','upgrade.recover','company.pause','prototype.exports_interrupted']);
function assignmentTransition(before,after,type){
  const a=before?.original_execution_assignment,b=after.original_execution_assignment;
  if(!before){need(queueTypes.has(type)&&b.launches.length===0,'QUEUE_WRITER_REQUIRED');return;}
  need(before.id===after.id&&before.instance_id===after.instance_id&&before.host===after.host&&before.role===after.role,'ASSIGNMENT_IDENTITY_CHANGED');
  if(same(a,b))return;
  need(same({...a,launches:[]},{...b,launches:[]}), 'ASSIGNMENT_CHANGED');
  if(b.launches.length===a.launches.length+1){
    need(a.launches.every((l,i)=>same(l,b.launches[i])),'LAUNCH_CHANGED');const l=b.launches.at(-1);
    need(type===(l.kind==='worker'?'job.worker_launch_requested':l.kind==='model'?'job.model_process.launch_requested':'development.execution_launch_requested')&&l.birth===null&&l.closure===null&&!terminal(before.status),'LAUNCH_WRITER_REQUIRED');
    if(l.kind==='model'){const entry=before.model_process_tracking?.invocations?.find(x=>x.invocation_id===l.invocation_id);need(before.model_process_tracking?.current===l.invocation_id&&entry?.worker_pid===l.controller_pid&&entry.birth===null&&entry.closure===null,'MODEL_REQUEST_REQUIRED');}
    if(l.kind!=='worker')need(a.launches.some(x=>x.birth?.pid===l.controller_pid&&x.closure===null&&(x.kind==='worker'||l.kind==='development'&&x.kind==='development')),'WORKER_IDENTITY_REQUIRED');
    if(l.kind==='development'){const prior=a.launches.filter(x=>x.kind==='development'),worker=a.launches.find(x=>x.kind==='worker');need(['development_test','development_preflight'].includes(before.kind)&&(worker?.birth?.pid===l.controller_pid?prior.length===0:prior.length===1&&prior[0].birth?.pid===l.controller_pid),'DEVELOPMENT_LAUNCH_CARDINALITY');}
    return;
  }
  need(a.launches.length===b.launches.length,'LAUNCH_CHANGED');let changed=0;
  for(let i=0;i<a.launches.length;i++){const old=a.launches[i],next=b.launches[i];if(same(old,next))continue;changed++;
    if(type==='job.original_execution.born')need(old.birth===null&&next.birth!==null&&same({...old,birth:null},{...next,birth:null}),'BIRTH_REQUIRED');
    else if(type==='job.original_execution.closed')need(old.closure===null&&next.closure!==null&&same({...old,closure:null},{...next,closure:null}),'CLOSE_REQUIRED');
    else need(false,'UNISSUED_ASSIGNMENT_CHANGE');
  }
  need(changed===1,'LAUNCH_CHANGED');
}
function originalHistory(loan,{current=storedProjection(loan),verifyCurrent=true}={}){
  need(current,'ORIGIN_REQUIRED');validOrigin(current.origin,loan,current.id);
  const aggregate=bounded(loan,'events','value');need(aggregate.n>0,'HISTORY_REQUIRED');
  const rows=query(loan,'SELECT seq,at,type,value FROM events ORDER BY seq','all');let previous=null,last=null,jobs={},upgrades={},origin=null,id=null;
  for(let i=0;i<rows.length;i++){
    const row=rows[i];need(row.seq===i+1&&typeof row.value==='string','HISTORY_REQUIRED');let payload;try{payload=JSON.parse(row.value);}catch{need(false,'HISTORY_REQUIRED');}
    const w=payload.original_execution;
    need(closed(w,['protocol','origin_id','source_generation_sha256','previous_event_sha256','before_sha256','after_sha256','genesis','changes','upgrade_changes'])&&w.protocol===JOURNAL&&w.origin_id===current.origin.origin_id&&w.source_generation_sha256===current.origin.source_generation_sha256&&w.previous_event_sha256===previous&&Array.isArray(w.changes)&&Array.isArray(w.upgrade_changes),'HISTORY_REQUIRED');
    if(i===0){need(row.type==='company.created'&&w.before_sha256===null&&same(w.genesis,current.origin)&&w.changes.length===0&&w.upgrade_changes.length===0,'GENESIS_REQUIRED');origin=copy(w.genesis);id=origin.company_id;}
    else need(w.genesis===null&&w.before_sha256===projectionHash({id,origin,jobs,upgrades}),'HISTORY_CHANGED');
    const seen=new Set();
    for(const c of w.changes){need(closed(c,['id','before_sha256','after'])&&text(c.id)&&!seen.has(c.id),'HISTORY_CHANGED');seen.add(c.id);const old=own(jobs,c.id)?jobs[c.id]:null;
      need(c.before_sha256===(old===null?null:digest(old))&&c.after&&c.after.id===c.id,'HISTORY_CHANGED');
      validAssignment(c.after,origin);assignmentTransition(old,c.after,row.type);
      jobs[c.id]=copy(c.after);
    }
    const upgraded=new Set();for(const c of w.upgrade_changes){need(closed(c,['id','before_sha256','after'])&&text(c.id)&&!upgraded.has(c.id),'UPGRADE_HISTORY_CHANGED');upgraded.add(c.id);const old=upgrades[c.id]??null;need(c.before_sha256===(old===null?null:digest(old))&&c.after?.id===c.id,'UPGRADE_HISTORY_CHANGED');validUpgrade(c.after,origin);upgradeTransition(old,c.after,row.type);upgrades[c.id]=copy(c.after);}
    need(w.after_sha256===projectionHash({id,origin,jobs,upgrades}),'HISTORY_CHANGED');previous=hash(JSON.stringify([row.seq,row.at,row.type,row.value]));last=row;
  }
  if(verifyCurrent)need(same({id,origin,jobs,upgrades},current),'PHYSICAL_STATE_CHANGED');
  for(const [jobId,job]of Object.entries(jobs)){need(jobId===job.id,'ASSIGNMENT_REQUIRED');validAssignment(job,origin);}
  return {id,origin,jobs,upgrades,event_sequence:last.seq,event_sha256:previous};
}
function assignmentOccupied(job){
  if(!terminal(job.status))return true;
  const launches=job.original_execution_assignment.launches,units=launches.filter(l=>l.kind!=='worker');
  if(units.length)return units.some(l=>l.closure===null||l.birth===null&&l.closure.never_started!==true);
  // A label/termination Boolean is never a never-created witness.
  return !launches.some(l=>l.kind==='worker'&&(l.birth!==null||l.closure?.never_started===true));
}
function originalFacts(history){
  let occupied=0,unknown=0,carrier_unknown=0;const upgrade=upgradeOccupancy(history);occupied+=upgrade.occupied;unknown+=upgrade.unknown;carrier_unknown+=upgrade.carrier_unknown;
  for(const job of Object.values(history.jobs)){if(assignmentOccupied(job))occupied++;for(const l of job.original_execution_assignment.launches)if(l.closure===null){if(l.kind==='worker')carrier_unknown++;else unknown++;}}
  need(nat(occupied)&&nat(unknown),'CARDINALITY_REQUIRED');
  return Object.freeze({protocol:'original-local-execution-inventory-v1',retained_row_census_complete:true,admission_launch_coverage_complete:true,cardinality_known:true,unit:LEGACY_UNIT,worker_cap:3,occupied,remaining:Math.max(0,3-occupied),origin_id:history.origin.origin_id,source_generation_sha256:history.origin.source_generation_sha256,event_sequence:history.event_sequence,event_sha256:history.event_sha256,unknown_invocations:unknown,upgrade_assignments:upgrade.occupied,raw_carrier_closure_unknown:carrier_unknown,physical_domain_closed:false,authority_issued:false});
}
export function inspectOriginalLocalExecutionInventoryFrom(actualDb){const loan=originalStoreExecutionCustodyFrom(actualDb);return check(loan,()=>originalFacts(originalHistory(loan)));}

const writes=new WeakMap(),launchTokens=new WeakMap();
const modelRequestCommits=new WeakMap();
// Direct-child observations stay private after a token is consumed. Ordinary
// callback DATA cannot manufacture the physical model-call completion proof.
const ordinaryModelObservations=new WeakMap();
const originalLaunchChildren=new WeakMap();
const failedLaunches=new WeakMap();
function originalChildErrorSinks(child){
  const emitters=new Set([child,child.stdin,child.stdout,child.stderr,...(Array.isArray(child.stdio)?child.stdio:[])]),owned=[],onError=()=>{};
  for(const emitter of emitters)if(emitter&&typeof emitter.on==='function'&&typeof emitter.removeListener==='function'){emitter.on('error',onError);owned.push(emitter);}
  child.once('close',()=>{for(const emitter of owned)emitter.removeListener('error',onError);});
}
function retainFailedLaunch(error,child,closed,exited){
  if(!child)return;if(!error||(typeof error!=='object'&&typeof error!=='function')){try{if(!closed()&&!exited())child.kill('SIGTERM');}catch{}return;}
  failedLaunches.set(error,{child,kill:typeof child.kill==='function'?child.kill.bind(child):null,closed,exited,cleanup:false});
  // Diagnostic compatibility only; authority is exclusively the private map.
  try{if(!Object.hasOwn(error,'originalChild'))Object.defineProperty(error,'originalChild',{value:child});}catch{}
}
export function originalWorkerFailedLaunchChild(error){return error&&(typeof error==='object'||typeof error==='function')?failedLaunches.get(error)?.child??null:null;}
// null means no original failed-launch custody. A Boolean is only the exact
// child's observed close, never public error DATA or whole-domain closure.
export function originalWorkerFailedLaunchClosed(error){
  const r=error&&(typeof error==='object'||typeof error==='function')?failedLaunches.get(error):null;
  return r?r.closed()===true:null;
}
export function cleanupOriginalWorkerLaunchFailure(error){
  const r=error&&(typeof error==='object'||typeof error==='function')?failedLaunches.get(error):null;if(!r)return false;if(r.cleanup)return true;r.cleanup=true;
  if(!r.closed()&&!r.exited()){
    let timer;const end=()=>{if(timer!==undefined)clearTimeout(timer);r.child.removeListener('close',end);r.child.removeListener('exit',end);};
    r.child.once('close',end);r.child.once('exit',end);
    timer=setTimeout(()=>{timer=undefined;if(!r.closed()&&!r.exited())try{r.kill?.('SIGKILL');}catch{/* UNKNOWN retained */}end();},TERMINATION_GRACE_MS);timer.unref?.();
    try{r.kill?.('SIGTERM');}catch{/* exact original failure and UNKNOWN remain */}
    if(r.closed()||r.exited())end();
  }
  return true;
}
const bookkeeping=new WeakMap(),bookkeepingBuckets=new WeakMap();
const bookkeepingFor=state=>bookkeeping.get(state)??(state?.records&&typeof state.records==='object'?bookkeepingBuckets.get(state.records):null);
function bindBookkeeping(state,origin,jobs,lease=null){
  if(!state||typeof state!=='object')return;const stamps=new Map();for(const [id,job]of Object.entries(jobs))stamps.set(id,digest(job.original_execution_assignment));
  const proof={company_id:origin.company_id,source_generation_sha256:origin.source_generation_sha256,origin:copy(origin),stamps,lease};bookkeeping.set(state,proof);if(state.records&&typeof state.records==='object')bookkeepingBuckets.set(state.records,proof);
}
function bookkeepingLive(proof){if(!proof)return false;if(!proof.lease)return true;if(proof.lease.status==='committed')return true;if(proof.lease.status!=='pending')return false;try{proof.lease.assert();return true;}catch{return false;}}
export function bindOriginalWorkerAssignmentBookkeepingFrom(store,state){
  // Absence is raw fallback, not an alternate issuer or an exception that can
  // accidentally skip the ordinary context-preservation obligations.
  try{const loan=originalStoreExecutionCustodyFrom(store),p=storedProjection(loan);if(!p?.origin)return null;const history=originalHistory(loan,{current:p});bindBookkeeping(state,history.origin,history.jobs,writes.get(store)?.lease??null);return true;}catch{return null;}
}
export function inheritOriginalWorkerAssignmentBookkeepingFrom(source,derived){const proof=bookkeepingFor(source);if(!bookkeepingLive(proof)||!derived||typeof derived!=='object'||derived.id!==proof.company_id)return null;bookkeeping.set(derived,proof);return true;}
export function inspectOriginalWorkerAssignmentBookkeepingFrom(state,job){
  try{const proof=bookkeepingFor(state);if(!bookkeepingLive(proof)||state.id!==proof.company_id||!same(state.original_execution_origin,proof.origin)||proof.source_generation_sha256!==generation()||!job||proof.stamps.get(job.id)!==digest(job.original_execution_assignment))return null;
    return Object.freeze({field:'original_execution_assignment',projection:copy(job.original_execution_assignment),historical_original:!proof.lease||proof.lease.status==='committed',active_original_snapshot:proof.lease?.status==='pending'});}catch{return null;}
}
export function inspectOriginalExecutionOriginBookkeepingFrom(state){try{const proof=bookkeepingFor(state);if(!bookkeepingLive(proof)||state.id!==proof.company_id||proof.source_generation_sha256!==generation()||!same(state.original_execution_origin,proof.origin))return null;return Object.freeze({field:'original_execution_origin',projection:copy(proof.origin),historical_original:!proof.lease||proof.lease.status==='committed',active_original_snapshot:proof.lease?.status==='pending'});}catch{return null;}}
export function beginOriginalStoreExecutionWriteFrom(store,type){
  const loan=originalStoreExecutionCustodyFrom(store);need(loan.mode==='write'&&loan.type===type&&!writes.has(store),'WRITE_REQUIRED');const before=storedProjection(loan);
  let history=null,held=null;if(before?.origin)try{history=originalHistory(loan,{current:before});}catch(error){if(!observationTypes.has(type))throw error;held=typeof error.code==='string'?error.code:'ORIGINAL_EXECUTION_HISTORY_REQUIRED';}
  const w={loan,type,before:before===null?null:copy(before),history,held,expected:null,approved:new Map(),tokens:[],upgrade_approved:new Map(),upgrade_tokens:[],journal:null,issuance_sealed:false,launch_cutoff:null,verify_preimage:null};
  if(history&&type==='upgrade.verify'){const uid=currentUpgradeIdFrom(loan),original=history.upgrades[uid];need(original?.status==='applied','UPGRADE_VERIFY_PREIMAGE_REQUIRED');w.verify_preimage=Object.freeze({uid,original:copy(original)});w.launch_cutoff=original.review_deadline_policy==='finite'?original.deadline_ms:null;}w.lease={status:'pending',assert:()=>{loan.assert();need(writes.get(store)===w,'WRITE_EXPIRED');}};writes.set(store,w);
}
function writeContext(store,state){const w=writes.get(store),loan=originalStoreExecutionCustodyFrom(store);need(w&&loan.mode==='write'&&loan.state===state&&loan.type===w.type,'WRITE_REQUIRED');need(!w.issuance_sealed,'WRITE_SEALED');return w;}
function approve(w,job){need(!w.issuance_sealed,'WRITE_SEALED');w.approved.set(job.id,copy(job.original_execution_assignment));const state=originalStoreExecutionCustodyFrom(w.loan.store).state;if(state){const jobs=copy(w.before.jobs);for(const [id,stamp]of w.approved)jobs[id]={id,original_execution_assignment:stamp};bindBookkeeping(state,w.history.origin,jobs,w.lease);}}
export function prepareOriginalStoreExecutionWriteFrom(store,state,{selected=false,before=null}={}){
  const w=writes.get(store),loan=originalStoreExecutionCustodyFrom(store);need(w&&loan.mode==='write'&&state===loan.state,'WRITE_REQUIRED');
  // No issuer remains available once the callback's final intended state is
  // being derived. afterWrite/beforeCommit are verification-only boundaries.
  need(!w.issuance_sealed,'WRITE_SEALED');w.issuance_sealed=true;
  if(w.before===null){
    need(loan.fresh&&w.type==='company.created'&&!own(state,'original_execution_origin')&&Object.keys(state.jobs??{}).length===0&&Object.keys(upgradeProjection(state)).length===0&&text(state.id),'GENESIS_REQUIRED');
    need(query(loan,'SELECT COUNT(*) AS n FROM events','get').n===0,'GENESIS_REQUIRED');
    state.original_execution_origin={protocol:ORIGIN,origin_id:randomUUID(),company_id:state.id,root_sha256:hash(loan.root),source_generation_sha256:generation(),legacy_unit:LEGACY_UNIT,maintenance_unit:PEER_UNIT};
    w.expected={id:state.id,origin:copy(state.original_execution_origin),jobs:{},upgrades:{}};return;
  }
  if(!w.before.origin){need(!own(state,'original_execution_origin'),'GENESIS_REQUIRED');return;}
  const jobs=selected?copy(w.before.jobs):copy(state.jobs??{});
  if(selected&&own(state,'jobs'))for(const id of new Set([...Object.keys(before?.jobs??{}),...Object.keys(state.jobs??{})])){need(own(state.jobs??{},id),'RETAINED_ASSIGNMENT_REMOVED');jobs[id]=copy(state.jobs[id]);}
  const origin=own(state,'original_execution_origin')?state.original_execution_origin:w.before.origin,id=own(state,'id')?state.id:w.before.id;
  need(same(origin,w.before.origin)&&id===w.before.id,'ORIGIN_CHANGED');
  for(const oldId of Object.keys(w.before.jobs))need(own(jobs,oldId),'RETAINED_ASSIGNMENT_REMOVED');
  const upgrades=selected&&!own(state,'upgrade')&&!own(state,'upgrade_history')?copy(w.before.upgrades):upgradeProjection(state);
  if(w.verify_preimage)need(state.upgrade?.id===w.verify_preimage.uid&&upgrades[w.verify_preimage.uid]?.status==='completed','UPGRADE_VERIFY_TRANSITION_REQUIRED');
  for(const uid of Object.keys(w.before.upgrades))need(own(upgrades,uid),'RETAINED_UPGRADE_REMOVED');
  if(w.held){
    need(heldUpgradesPreserved(w.before.upgrades,upgrades),'HELD_UPGRADE_TRANSITION');
    need(Object.keys(jobs).length===Object.keys(w.before.jobs).length,'UNISSUED_ASSIGNMENT_CHANGE');
    for(const [jobId,job]of Object.entries(jobs)){const old=w.before.jobs[jobId];need(old&&job&&same(job.original_execution_assignment,old.original_execution_assignment)&&job.id===old.id&&job.instance_id===old.instance_id&&job.host===old.host&&job.role===old.role,'UNISSUED_ASSIGNMENT_CHANGE');need(job.status===old.status||['failed','cancelled','interrupted','quarantined','unknown'].includes(job.status),'HELD_POSITIVE_TRANSITION');need(job.coordination_release?.termination_confirmed!==true||same(job.coordination_release,old.coordination_release),'HELD_POSITIVE_RELEASE');}
    w.expected={id,origin:copy(origin),jobs,upgrades};return;
  }
  for(const [uid,u]of Object.entries(upgrades)){validUpgrade(u,origin);const old=w.before.upgrades[uid];need(same(upgradeStamps(u),w.upgrade_approved.get(uid)??(old?upgradeStamps(old):null)),'UNISSUED_UPGRADE_CHANGE');}
  for(const [jobId,job]of Object.entries(jobs)){
    need(job.id===jobId,'ASSIGNMENT_REQUIRED');validAssignment(job,origin);const old=w.before.jobs[jobId];
    const expected=w.approved.get(jobId)??old?.original_execution_assignment;need(expected&&same(job.original_execution_assignment,expected),'UNISSUED_ASSIGNMENT_CHANGE');
    if(old)need(job.instance_id===old.instance_id&&job.host===old.host&&job.role===old.role,'ASSIGNMENT_IDENTITY_CHANGED');
  }
  w.expected={id,origin:copy(origin),jobs,upgrades};
}
export function originalStoreExecutionEventFrom(store,payload){
  const w=writes.get(store),loan=originalStoreExecutionCustodyFrom(store);need(w,'WRITE_REQUIRED');
  // Contribute to the actual normal envelope, including Original's journal or
  // held facts. Legacy writes must pass through the same fixed producer.
  const finish=normal=>{const contributed=comparisonEvidenceEventFrom(store,normal);w.issuance_sealed=true;return contributed;};
  if(!w.before?.origin&&!w.expected?.origin)return finish(payload);
  const current=storedProjection(loan),expected=w.expected??w.before;need(same(current,expected),'PHYSICAL_STATE_CHANGED');
  if(w.held){
    // Preserve original negative/diagnostic DATA without enrolling an unknown
    // prefix. This deliberately does not satisfy JOURNAL's proof grammar.
    const tail=query(loan,'SELECT seq,at,type,value FROM events ORDER BY seq DESC LIMIT 1','get');
    w.heldMarker={protocol:'original-local-execution-held-observation-v1',reason:w.held,origin_id:expected.origin.origin_id,previous_event_sha256:tail?hash(JSON.stringify([tail.seq,tail.at,tail.type,tail.value])):null,inventory_qualified:false};return finish({...payload,original_execution:w.heldMarker});
  }
  const changes=[];for(const [id,job]of Object.entries(expected.jobs)){const before=w.before?.jobs[id]??null;if(!same(before,job))changes.push({id,before_sha256:before===null?null:digest(before),after:copy(job)});}
  const upgrade_changes=[];for(const [id,u]of Object.entries(expected.upgrades)){const before=w.before?.upgrades[id]??null;if(!same(before,u))upgrade_changes.push({id,before_sha256:before===null?null:digest(before),after:copy(u)});}
  const tail=query(loan,'SELECT seq,at,type,value FROM events ORDER BY seq DESC LIMIT 1','get');
  const journal={protocol:JOURNAL,origin_id:expected.origin.origin_id,source_generation_sha256:expected.origin.source_generation_sha256,previous_event_sha256:tail?hash(JSON.stringify([tail.seq,tail.at,tail.type,tail.value])):null,before_sha256:w.before===null?null:projectionHash(w.before),after_sha256:projectionHash(expected),genesis:w.before===null?copy(expected.origin):null,changes,upgrade_changes};
  w.journal=journal;return finish({...payload,original_execution:journal});
}
export function validateOriginalStoreExecutionCommitFrom(store){
  const w=writes.get(store);if(!w)return;const loan=originalStoreExecutionCustodyFrom(store);
  if(w.heldMarker){const tail=query(loan,'SELECT type,value FROM events ORDER BY seq DESC LIMIT 1','get');need(tail?.type===w.type&&same(JSON.parse(tail.value).original_execution,w.heldMarker)&&same(storedProjection(loan),w.expected??w.before),'PHYSICAL_STATE_CHANGED');return;}
  if(!w.journal)return;const history=originalHistory(loan);need(same({id:history.id,origin:history.origin,jobs:history.jobs,upgrades:history.upgrades},w.expected??w.before),'PHYSICAL_STATE_CHANGED');
  need(w.issuance_sealed,'WRITE_SEALED');
  for(const [jobId,stamp]of w.approved)need(history.jobs[jobId]&&same(history.jobs[jobId].original_execution_assignment,stamp),'UNPERSISTED_ASSIGNMENT');
  for(const token of w.tokens){const r=launchTokens.get(token),job=r&&history.jobs[r.job_id];need(r&&r.store===store&&!r.invalid&&!r.committed&&!r.consumed&&job&&job.instance_id===r.instance_id&&same(r.origin,history.origin)&&job.original_execution_assignment.launches.some(l=>same(l,r.launch)),'UNPERSISTED_LAUNCH');}
  for(const token of w.upgrade_tokens){const r=upgradeTokens.get(token),u=r&&history.upgrades[r.uid];need(r&&r.store===store&&!r.invalid&&!r.committed&&!r.consumed&&u&&upgradeLaunches(u).some(l=>same(l,r.launch)),'UNPERSISTED_UPGRADE_LAUNCH');}
  for(const token of w.upgrade_tokens)upgradeDeadline(upgradeTokens.get(token));
  w.validated_issuance=true;
  w.validated_sequence=history.event_sequence;
  if(w.upgrade_cutoff_record){upgradeDeadline(w.upgrade_cutoff_record);if(w.upgrade_cutoff_record.launch.kind==='model')modelAdapterDeadline(w.upgrade_cutoff_record);}
  for(const token of w.tokens){const r=launchTokens.get(token);if(r.request_input_binding){need(r.request_authority&&hex(r.request_assignment_sha256),'MODEL_REQUEST_CURRENT_REQUIRED');const bounds=assertRuntimeOriginalModelAuthorityFrom(r.request_authority,store,w.loan.scope,r.job_id);clipModelRequestCutoff(r,bounds);}}
  if(w.model_request_current){const r=launchTokens.get(w.model_request_current),bounds=assertOriginalModelRequestCurrentFrom(w.model_request_current,store);clipModelRequestCutoff(r,bounds);w.launch_cutoff=Math.min(w.launch_cutoff??Infinity,r.deadline_at_ms);}
  assertUpgradeCommitCutoff(w,history);
}
export function commitOriginalStoreExecutionWriteFrom(store){const w=writes.get(store);if(!w)return;need(w.loan.db.isTransaction===false,'COMMIT_REQUIRED');if(w.approved.size||w.tokens.length||w.upgrade_tokens.length)need(w.issuance_sealed&&w.validated_issuance&&positive(w.validated_sequence),'UNPERSISTED_ISSUANCE');for(const token of w.tokens){const r=launchTokens.get(token);need(positive(w.validated_sequence),'WRITE_REQUIRED');if(r.request_input_binding)r.request_commit_ready=true;else r.committed=true;r.event_sequence=w.validated_sequence;}for(const token of w.upgrade_tokens){const r=upgradeTokens.get(token);r.committed=true;r.event_sequence=w.validated_sequence;}w.lease.status='committed';}
// Called only from the fixed runtime Store commit hook with its lexical
// witness. The older committed bit alone is not a retained physical proof.
export function retainOriginalModelRequestCommitFrom(store,witness){
  const facts=inspectRuntimeStoreCommitWitnessFrom(witness,store),w=writes.get(store);
  need(w&&w.loan.store===store&&w.loan.scope===facts.scope&&w.loan.root===facts.root&&w.lease.status==='committed','MODEL_REQUEST_COMMIT_REQUIRED');
  const confirmations=[],ready=[];
  for(const token of w.tokens){
    const r=launchTokens.get(token);if(!r?.request_input_binding)continue;
    need(w.type==='job.model_process.launch_requested'&&w.issuance_sealed&&w.validated_issuance&&positive(w.validated_sequence)&&r.store===store&&r.launch.kind==='model'&&r.request_commit_ready===true&&r.request_authority&&hex(r.request_assignment_sha256)&&!r.committed&&!r.invalid&&!r.consumed&&!modelRequestCommits.has(token),'MODEL_REQUEST_COMMIT_REQUIRED');
    ready.push(r);confirmations.push([token,Object.freeze({protocol:'runtime-model-request-commit-v1',stage:'request',lane:'original',store,db:w.loan.db,root:facts.root,scope:facts.scope,type:w.type,job_id:r.job_id,instance_id:r.instance_id,invocation_id:r.launch.invocation_id,input_binding:r.request_input_binding,timeout_policy:r.request_timeout_policy})]);
  }
  // Every throwing guard/allocation precedes arming the new opt-in tokens.
  for(const [token,confirmation]of confirmations)modelRequestCommits.set(token,confirmation);
  for(const r of ready)r.committed=true;
}
export function inspectOriginalModelRequestCommitFrom(token,issuingStore){
  const r=launchTokens.get(token),facts=modelRequestCommits.get(token);
  need(r&&r.launch.kind==='model'&&r.committed&&r.request_input_binding&&facts&&r.store===issuingStore&&facts.store===issuingStore,'MODEL_REQUEST_COMMIT_REQUIRED');
  return facts;
}
// Select Store's existing final native clock/bound COMMIT path only for
// genuinely prepared opt-in model requests or their actual creation write.
export function originalModelRequestUsesNativeCommitFrom(store){
  const w=writes.get(store);if(!w)return false;
  if(w.type==='job.model_process.launch_requested')return w.tokens.some(token=>{const r=launchTokens.get(token);return Boolean(r?.request_input_binding&&r.request_authority);});
  if(w.type==='job.original_execution.born'&&w.model_request_current){const r=launchTokens.get(w.model_request_current);return Boolean(r?.request_input_binding&&r.request_authority&&r.consumed);}
  return false;
}
export function originalStoreExecutionCommitCutoffFrom(store){
  const w=writes.get(store);if(!w)return null;originalStoreExecutionCustodyFrom(store);
  const policy=originalStoreRetainedCommitCutoffFrom(store);let cutoff=w.launch_cutoff;
  const retain=deadline=>{if(deadline!==null){deadline=finiteCutoff(deadline);cutoff=cutoff===null?deadline:Math.min(cutoff,deadline);}};
  retain(policy);
  for(const token of w.tokens){const r=launchTokens.get(token);need(r&&!r.invalid,'CUTOFF_REQUIRED');if(policy!==null)r.deadline_at_ms=Math.min(r.deadline_at_ms,finiteCutoff(policy));retain(r.deadline_at_ms);}
  // The scheduler's original upgrade loans join the same private Store minimum;
  // their durable launch identity is never rewritten to extend or replace it.
  const upgrades=new Set(w.upgrade_tokens.map(token=>upgradeTokens.get(token)));
  if(w.upgrade_cutoff_record)upgrades.add(w.upgrade_cutoff_record);
  for(const r of upgrades){upgradeDeadline(r);retain(r.launch.deadline_at_ms);if(r.adapter_loan)retain(modelAdapterDeadline(r).deadline_at_ms);}
  return cutoff;
}
export function retainOriginalStoreCommitCutoffFrom(subject,proof,issuer='mechanical-qa'){const loan=originalStoreExecutionCustodyFrom(subject);return retainStoreCutoff(loan.store,proof,issuer);}
export function endOriginalStoreExecutionWriteFrom(store){const w=writes.get(store);if(w){if(w.lease.status!=='committed')w.lease.status='revoked';for(const token of w.tokens){const r=launchTokens.get(token);if(r&&!r.committed)r.invalid=true;}for(const token of w.upgrade_tokens){const r=upgradeTokens.get(token);if(r&&!r.committed)r.invalid=true;}}writes.delete(store);}
export function recordOriginalWorkerAssignmentFrom(store,state,job){
  const w=writeContext(store,state);need(w.history&&['job.queued','task.job_queued','development.test_reserved','development.preflight_recovery_reserved','development.preflight_diagnostic_reserved'].includes(w.type),'QUEUE_WRITER_REQUIRED');
  const development=['development_test','development_preflight'].includes(job?.kind);
  need(job&&text(job.id)&&(development?!own(job,'instance_id'):text(job.instance_id))&&text(job.role)&&['codex','claude','local'].includes(job.host)&&job.status==='queued'&&(job.native_id===null||!development&&text(job.native_id))&&!own(job,'original_execution_assignment')&&!own(w.before.jobs,job.id),'ASSIGNMENT_REQUIRED');
  const pending=[...w.approved.keys()].filter(id=>!own(w.before.jobs,id)).length,occupied=originalFacts(w.history).occupied+pending;need(occupied<3,'CAPACITY_EXHAUSTED');
  job.original_execution_assignment={protocol:ASSIGNMENT,origin_id:w.history.origin.origin_id,assignment_id:job.id,source_generation_sha256:w.history.origin.source_generation_sha256,unit:LEGACY_UNIT,launches:[]};approve(w,job);return job;
}
export function assertOriginalWorkerAssignmentFrom(store,state,job){const w=writeContext(store,state);need(w.history&&same(w.before.jobs[job.id],job),'ASSIGNMENT_CHANGED');validAssignment(job,w.history.origin);return originalFacts(w.history);}
export function prepareOriginalWorkerLaunchFrom(store,state,input){
  const w=writeContext(store,state);need(w.history&&closed(input,own(input??{},'invocation_id')?['job_id','kind','invocation_id']:['job_id','kind'])&&['worker','model','development'].includes(input.kind),'LAUNCH_INPUT');
  const job=state.jobs?.[input.job_id];need(job&&same(job.original_execution_assignment,w.before.jobs[input.job_id]?.original_execution_assignment),'ASSIGNMENT_CHANGED');validAssignment(job,w.history.origin);
  need(!terminal(job.status),'ASSIGNMENT_TERMINAL');
  const expectedType=input.kind==='worker'?'job.worker_launch_requested':input.kind==='model'?'job.model_process.launch_requested':'development.execution_launch_requested';need(w.type===expectedType,'LAUNCH_WRITER_REQUIRED');
  const launches=job.original_execution_assignment.launches;
  if(input.kind==='worker')need(job.status==='queued'&&!launches.some(l=>l.kind==='worker'),'LAUNCH_ALREADY_REQUESTED');
  else {
    const worker=launches.find(l=>l.kind==='worker');const controller=worker?.birth?.pid===process.pid&&worker.closure===null;
    const watchdog=launches.some(l=>l.kind==='development'&&l.birth?.pid===process.pid&&l.closure===null);
    need(job.status==='running'&&(controller||input.kind==='development'&&watchdog),'WORKER_IDENTITY_REQUIRED');
    if(input.kind==='development'){const prior=launches.filter(l=>l.kind==='development');need(['development_test','development_preflight'].includes(job.kind)&&(controller?prior.length===0:prior.length===1&&prior[0].birth?.pid===process.pid),'DEVELOPMENT_LAUNCH_CARDINALITY');}
    if(input.kind==='model'){const track=job.model_process_tracking,entry=track?.invocations?.find(x=>x.invocation_id===input.invocation_id);need(text(input.invocation_id)&&track?.current===input.invocation_id&&entry&&entry.job_id===job.id&&entry.instance_id===job.instance_id&&entry.worker_pid===process.pid&&entry.birth===null&&entry.closure===null&&!launches.some(l=>l.invocation_id===input.invocation_id),'MODEL_REQUEST_REQUIRED');}
  }
  const mechanical=mechanicalQaLaunchCandidate(state,job)?mechanicalQaLaunchAuthority(store,state,job):null,deadline_at_ms=Math.min(originalJobCutoff(state,job,input.kind),mechanical?.deadline_at_ms??Infinity),launch={launch_id:randomUUID(),kind:input.kind,invocation_id:input.kind==='model'?input.invocation_id:null,requested_at:time(),controller_pid:process.pid,birth:null,closure:null};launches.push(launch);approve(w,job);
  const token=Object.freeze({});launchTokens.set(token,{store,root:w.loan.root,job_id:job.id,instance_id:job.instance_id,host:job.host,origin:copy(w.history.origin),launch:copy(launch),deadline_at_ms,mechanical_qa:mechanical===null?null:copy(mechanical.binding),signal:null,adapter_cutoff_bound:false,committed:false,consumed:false,invalid:false});w.tokens.push(token);return token;
}
function requestInputBinding(input){
  need(closed(input,['host','native_id','prompt','cwd','selection'])&&['codex','claude'].includes(input.host)&&(input.native_id===null||typeof input.native_id==='string')&&typeof input.prompt==='string'&&typeof input.cwd==='string'&&path.isAbsolute(input.cwd),'MODEL_REQUEST_INPUT_REQUIRED');
  return Object.freeze({host:input.host,native_id:input.native_id,prompt_sha256:hash(input.prompt),prompt_utf16_sha256:createHash('sha256').update(input.prompt,'utf16le').digest('hex'),prompt_utf16_units:input.prompt.length,cwd:path.resolve(input.cwd),selection_sha256:hash(JSON.stringify(input.selection))});
}
// An opt-in ordinary Original request. Existing worker preparation stays
// unchanged; its unbound tokens cannot supply committed-input confirmations.
// This binds private input to issuance, not prompt bytes in canonical storage.
export function prepareOriginalModelRequestFrom(store,state,input){
  need(closed(input,['job_id','invocation_id','host','native_id','prompt','cwd','selection']),'MODEL_REQUEST_INPUT_REQUIRED');
  const binding=requestInputBinding({host:input.host,native_id:input.native_id,prompt:input.prompt,cwd:input.cwd,selection:input.selection}),w=writeContext(store,state);
  need(w.type==='job.model_process.launch_requested'&&state.jobs?.[input.job_id]?.host===binding.host,'MODEL_REQUEST_INPUT_REQUIRED');
  const job=state.jobs[input.job_id],policy=Object.freeze(normalizeTimeout({timeout_ms:job.timeout_ms,timeout_reason:job.timeout_reason}));
  // Authenticated Original launch history is nondeletable. A prior MODEL
  // birth requires the existing overall timing; the current first-call birth
  // is deliberately excluded and may precede its actual onSpawn recorder.
  if(!['execution_started_at','execution_deadline_at','termination_deadline_at'].some(key=>own(job,key)))need(!(w.history?.jobs?.[job.id]?.original_execution_assignment?.launches??[]).some(prior=>prior.kind==='model'&&prior.invocation_id!==input.invocation_id&&prior.birth!==null),'MODEL_OVERALL_DEADLINE_LOST');
  const token=prepareOriginalWorkerLaunchFrom(store,state,{job_id:input.job_id,kind:'model',invocation_id:input.invocation_id});
  const r=launchTokens.get(token);r.request_input_binding=binding;r.request_timeout_policy=policy;
  r.request_authority=prepareRuntimeOriginalModelAuthorityFrom(store,state,job);r.request_assignment_sha256=modelRequestAssignment(job);return token;
}
function modelRequestAssignment(job){
  const a=job.original_execution_assignment;
  return digest({...a,launches:a.launches.map(launch=>({...launch,birth:null,closure:null}))});
}
function clipModelRequestCutoff(record,bounds){
  for(const deadline of [bounds.authority_deadline_at_ms,bounds.execution_deadline_at_ms])if(deadline!==null)record.deadline_at_ms=Math.min(record.deadline_at_ms,finiteCutoff(deadline));
}
// Read current Source authority for the actual opt-in token before invocation
// and after consumption. This does not replace physical closure/timing guards.
export function assertOriginalModelRequestCurrentFrom(token,issuingStore){
  const facts=inspectOriginalModelRequestCommitFrom(token,issuingStore),r=launchTokens.get(token);
  need(!r.invalid&&!r.store.closed&&r.request_authority,'MODEL_REQUEST_CURRENT_REQUIRED');
  if(r.signal!==null&&r.signal!==undefined)need(!Reflect.apply(abortedGetter,r.signal,[]),'MODEL_REQUEST_ABORTED');
  return r.store.readSnapshot(()=>{
    const loan=originalStoreExecutionCustodyFrom(r.store),history=originalHistory(loan),job=history.jobs[r.job_id];
    const assignment=job?.original_execution_assignment,worker=assignment?.launches.find(x=>x.kind==='worker'),launch=assignment?.launches.find(x=>x.launch_id===r.launch.launch_id),entry=job?.model_process_tracking?.invocations?.find(x=>x.invocation_id===r.launch.invocation_id);
    need(job&&job.status==='running'&&job.instance_id===r.instance_id&&job.host===r.host&&job.worker_pid===process.pid&&same(history.origin,r.origin)&&worker?.birth?.pid===process.pid&&worker.closure===null&&launch&&entry&&job.model_process_tracking.current===r.launch.invocation_id&&entry.job_id===r.job_id&&entry.instance_id===r.instance_id&&entry.worker_pid===process.pid&&modelRequestAssignment(job)===r.request_assignment_sha256,'MODEL_REQUEST_ASSIGNMENT_CHANGED');
    const bounds=assertRuntimeOriginalModelAuthorityFrom(r.request_authority,r.store,facts.scope,r.job_id),physical=ordinaryModelObservations.get(token);
    if(physical?.closed)for(const deadline of [bounds.authority_deadline_at_ms,bounds.execution_deadline_at_ms])if(deadline!==null)need(physical.closed.at_ms<deadline,'MODEL_OVERALL_DEADLINE_EXPIRED');
    return bounds;
  });
}
function tokenRecord(token,kind){const r=launchTokens.get(token);need(r&&!r.invalid&&r.committed&&!r.consumed&&(!kind||r.launch.kind===kind)&&r.launch.controller_pid===process.pid,'PRIVATE_LAUNCH_REQUIRED');need(r.origin.source_generation_sha256===generation(),'SOURCE_GENERATION_CHANGED');need(!r.store.closed,'STORE_EXPIRED');r.store.readSnapshot(()=>{const loan=originalStoreExecutionCustodyFrom(r.store),history=originalHistory(loan),job=history.jobs[r.job_id];need(job&&job.instance_id===r.instance_id&&!terminal(job.status)&&same(history.origin,r.origin)&&job.original_execution_assignment.launches.some(l=>same(l,r.launch)),'LAUNCH_CHANGED');});return r;}
export function assertOriginalWorkerLaunchToken(token,{kind}={}){const r=tokenRecord(token,kind);finalLaunchCutoff(r);return true;}
export function bindOriginalAdapterLaunchCutoffFrom(token,loan){
  const r=tokenRecord(token,'model');need(!r.adapter_cutoff_bound&&typeof originalAdapter.inspectOriginalAdapterLaunchCutoffFrom==='function','CUTOFF_SOURCE_REQUIRED');const facts=originalAdapter.inspectOriginalAdapterLaunchCutoffFrom(loan,token);const deadline=finiteCutoff(facts?.deadline_at_ms);
  if(facts.signal!==null)try{Reflect.apply(abortedGetter,facts.signal,[]);}catch{need(false,'CUTOFF_SIGNAL_REQUIRED');}
  r.deadline_at_ms=Math.min(r.deadline_at_ms,deadline);r.signal=facts.signal;r.adapter_cutoff_bound=true;
}
function observe(r,field,value){
  const store=new Store(r.root);
  try{store.transaction(field==='birth'?'job.original_execution.born':'job.original_execution.closed',state=>{const w=writeContext(store,state),job=state.jobs?.[r.job_id];need(w.history&&job?.instance_id===r.instance_id&&same(w.history.origin,r.origin),'ASSIGNMENT_CHANGED');const l=job.original_execution_assignment.launches.find(x=>x.launch_id===r.launch.launch_id);need(l&&l[field]===null,'OBSERVATION_CHANGED');if(field==='closure')need(value.pid===(l.birth?.pid??null),'OBSERVATION_CHANGED');l[field]=copy(value);approve(w,job);return state;});}finally{store.close();}
}
function birthFor(command,args,options,pid){return {protocol:'original-local-child-birth-v1',pid,parent_pid:process.pid,command_sha256:hash(command),argv_sha256:digest(args),cwd_sha256:hash(path.resolve(options.cwd??process.cwd())),observed_at:time()};}
export function spawnOriginalWorkerLaunch(token,command,args,options={}){
  const r=tokenRecord(token);need(typeof command==='string'&&Array.isArray(args)&&args.every(x=>typeof x==='string')&&options&&typeof options==='object'&&!Array.isArray(options)&&(options.shell===undefined||options.shell===false),'LAUNCH_INPUT');
  need(!r.store.closed,'STORE_EXPIRED');if(r.launch.kind==='model')need(r.adapter_cutoff_bound,'CUTOFF_SOURCE_REQUIRED');let child,started=false,birth=null,closed=false,exited=false,birthDurable=false;
  // Hold the actual BEGIN IMMEDIATE across last currentness check and the one
  // real creation. A failed COMMIT leaves the pre-existing intent UNKNOWN.
  try{r.store.transaction('job.original_execution.born',state=>{const w=writeContext(r.store,state),job=state.jobs?.[r.job_id];need(w.history&&job&&job.instance_id===r.instance_id&&same(w.history.origin,r.origin)&&!terminal(job.status),'ASSIGNMENT_CHANGED');const l=job.original_execution_assignment.launches.find(x=>x.launch_id===r.launch.launch_id);need(l&&same(l,r.launch),'LAUNCH_CHANGED');r.consumed=true;
    if(r.mechanical_qa!==null){const current=mechanicalQaLaunchAuthority(r.store,state,job,r.mechanical_qa);r.deadline_at_ms=Math.min(r.deadline_at_ms,current.deadline_at_ms);const history=originalHistory(w.loan);need(same(history.jobs[r.job_id],job)&&same(history.origin,r.origin),'LAUNCH_CHANGED');}
    if(r.request_input_binding){const bounds=assertOriginalModelRequestCurrentFrom(token,r.store);clipModelRequestCutoff(r,bounds);w.model_request_current=token;}
    w.launch_cutoff=r.deadline_at_ms;
    finalLaunchCutoff(r);
    child=spawn(command,args,options);need(child&&typeof child.once==='function','ORIGINAL_CHILD_REQUIRED');
    originalLaunchChildren.set(token,child);
    const physical=r.launch.kind==='model'?{child,host:r.host,controller_pid:process.pid,command_sha256:hash(command),argv_sha256:hash(JSON.stringify(args)),cwd_sha256:hash(path.resolve(options.cwd??process.cwd())),pid:positive(child.pid)?child.pid:null,requested_at_ms:Date.parse(r.launch.requested_at),closed:null}:null;
    if(physical)ordinaryModelObservations.set(token,physical);
    originalChildErrorSinks(child);
    // Own the original emitter before any remaining physical write/COMMIT can
    // fail. The handle survives on the thrown error for exact-child cleanup;
    // no PID reacquisition, refund or retry is inferred.
    let erroredBeforeBirth=false;
    const onError=()=>{if(!started)erroredBeforeBirth=true;};
    const persistBirth=()=>{if(birth!==null&&!birthDurable)try{observe(r,'birth',birth);birthDurable=true;}catch{/* UNKNOWN retained */}};
    const onSpawn=()=>{if(!started&&positive(child.pid)){started=true;birth=birthFor(command,args,options,child.pid);}if(physical&&positive(child.pid))physical.pid=child.pid;persistBirth();};
    const onExit=()=>{exited=true;};child.on('error',onError);child.once('spawn',onSpawn);child.once('exit',onExit);
    child.once('close',(code,signal)=>{closed=true;if(physical)physical.closed={at_ms:Date.now(),code:Number.isInteger(code)?code:null,signal:typeof signal==='string'?signal:null};child.removeListener('error',onError);child.removeListener('spawn',onSpawn);child.removeListener('exit',onExit);if(!started&&!erroredBeforeBirth)return;persistBirth();const value={protocol:'original-local-child-close-v1',launch_id:r.launch.launch_id,pid:birth?.pid??null,code:code??null,signal:signal??null,never_started:!started&&erroredBeforeBirth,observed_at:time()};try{observe(r,'closure',value);}catch{/* UNKNOWN retained */}});
    if(positive(child.pid)){birth=birthFor(command,args,options,child.pid);l.birth=copy(birth);started=true;approve(w,job);}return state;
  });birthDurable=birth!==null;}catch(error){r.invalid=true;rememberModelFailure(error,child,()=>closed,()=>exited);throw error;}
  return child;
}

// Read the already-consumed token's retained minimum for this exact actual
// child. This is a timer bound, never another launch permission or issuer.
export function inspectOriginalWorkerLaunchDeadlineFrom(token,child){
  const r=launchTokens.get(token);
  need(r&&r.committed&&r.consumed&&!r.invalid&&r.launch.controller_pid===process.pid&&originalLaunchChildren.get(token)===child&&child!==undefined,'PRIVATE_CHILD_DEADLINE_REQUIRED');
  return finiteCutoff(r.deadline_at_ms);
}

export function assertOriginalOrdinaryModelBirthObservedFrom(token,birth){
  const r=launchTokens.get(token),physical=ordinaryModelObservations.get(token);
  need(r&&r.launch.kind==='model'&&r.committed&&r.consumed&&physical&&physical.child&&positive(physical.pid),'MODEL_PHYSICAL_BIRTH_REQUIRED');
  need(closed(birth,['protocol','launch_id','host','pid','worker_pid','spawned_at','command_sha256','argv_sha256','cwd_sha256'])&&birth.protocol==='ordinary-model-process-birth-v1'&&text(birth.launch_id)&&birth.host===physical.host&&birth.pid===physical.pid&&birth.worker_pid===physical.controller_pid&&birth.command_sha256===physical.command_sha256&&birth.argv_sha256===physical.argv_sha256&&birth.cwd_sha256===physical.cwd_sha256,'MODEL_PHYSICAL_BIRTH_REQUIRED');
  const born=Date.parse(birth.spawned_at);
  need(Number.isSafeInteger(born)&&born>=physical.requested_at_ms&&born<=Date.now(),'MODEL_PHYSICAL_BIRTH_REQUIRED');
  return true;
}
export function assertOriginalOrdinaryModelClosureObservedFrom(token,birth,receipt){
  assertOriginalOrdinaryModelBirthObservedFrom(token,birth);
  const physical=ordinaryModelObservations.get(token),born=Date.parse(birth.spawned_at),ended=Date.parse(receipt?.closed_at);
  need(physical.closed&&born<=physical.closed.at_ms&&closed(receipt,['protocol','birth_sha256','closed_at','exit_code','signal','observation'])&&receipt.protocol==='ordinary-model-process-close-v1'&&receipt.birth_sha256===hash(JSON.stringify(birth))&&Number.isSafeInteger(ended)&&ended>=born&&ended<=Date.now()&&receipt.exit_code===physical.closed.code&&receipt.signal===physical.closed.signal&&receipt.observation==='original-child-close','MODEL_PHYSICAL_CLOSURE_REQUIRED');
  return true;
}
export function assertOriginalOrdinaryModelObservedFrom(token,birth,receipt){
  assertOriginalOrdinaryModelClosureObservedFrom(token,birth,receipt);
  const r=launchTokens.get(token),physical=ordinaryModelObservations.get(token);
  need(!r.invalid,'MODEL_PHYSICAL_CLOSURE_REQUIRED');
  need(r.origin.source_generation_sha256===generation(),'SOURCE_GENERATION_CHANGED');
  need(!r.store.closed,'STORE_EXPIRED');
  r.store.readSnapshot(()=>{
    const history=originalHistory(originalStoreExecutionCustodyFrom(r.store)),job=history.jobs[r.job_id],launch=job?.original_execution_assignment?.launches.find(x=>x.launch_id===r.launch.launch_id),entry=job?.model_process_tracking?.invocations?.find(x=>x.invocation_id===r.launch.invocation_id);
    need(job&&job.instance_id===r.instance_id&&same(history.origin,r.origin)&&launch?.birth?.pid===physical.pid&&launch.birth.command_sha256===physical.command_sha256&&launch.birth.argv_sha256===physical.argv_sha256&&launch.birth.cwd_sha256===physical.cwd_sha256&&launch.closure?.pid===physical.pid&&launch.closure.never_started===false&&launch.closure.code===physical.closed.code&&launch.closure.signal===physical.closed.signal&&entry&&same(entry.birth,birth)&&same(entry.closure,receipt),'MODEL_PHYSICAL_RECORD_REQUIRED');
  });
  return true;
}

const ref=row=>({family:row.family,id:row.id,revision:row.revision,sha256:row.sha256});
const rowKey=(family,id)=>canonical([family,id]),versionKey=r=>canonical([r.family,r.id,r.revision]);
function assertLegacyFences(loan){
  const normalize=sql=>sql.replace(/\s+/g,' ').trim().replace(/;$/,'');
  for(const table of ['company','events','state_entries','immutable_values','company_layout'])for(const op of ['insert','update','delete']){
    const name=`peer_origin_legacy_${table}_${op}`,expected=`CREATE TRIGGER ${name} BEFORE ${op.toUpperCase()} ON ${table} BEGIN SELECT RAISE(ABORT,'Original legacy writer retired: origin quarantine'); END`;
    const row=query(loan,"SELECT tbl_name,sql FROM sqlite_master WHERE type='trigger' AND name=?",'get',name);need(row?.tbl_name===table&&typeof row.sql==='string'&&normalize(row.sql)===normalize(expected),'LEGACY_WRITER_FENCE_CHANGED');
  }
}
function exactReference(value){need(closed(value,['family','id','revision','sha256'])&&['commands','work_items'].includes(value.family)&&text(value.id)&&value.revision===1&&hex(value.sha256),'ADMISSION_REFERENCE_REQUIRED');return copy(value);}
function peerHistory(loan){
  need(query(loan,"SELECT 1 FROM sqlite_master WHERE type='table' AND name='events'",'get')&&query(loan,"SELECT 1 FROM sqlite_master WHERE type='table' AND name='company'",'get'),'ORIGIN_REQUIRED');
  assertLegacyFences(loan);
  const legacy=originalHistory(loan),meta=query(loan,'SELECT * FROM peer_meta WHERE id=1','get');
  need(meta?.protocol==='peer-cos-v1'&&meta.company_id===legacy.id&&meta.company_id===loan.company_id,'PEER_ORIGIN_REQUIRED');
  bounded(loan,'peer_events','bytes');bounded(loan,'peer_versions','bytes');bounded(loan,'peer_rows','bytes');
  const physicalVersions=query(loan,'SELECT family,id,revision,sha256,bytes FROM peer_versions ORDER BY family,id,revision','all'),versions=new Map();
  for(const row of physicalVersions){need(positive(row.revision)&&hex(row.sha256)&&hash(row.bytes)===row.sha256,'PEER_HISTORY_CHANGED');let value;try{value=JSON.parse(row.bytes);}catch{need(false,'PEER_HISTORY_CHANGED');}need(canonical(value)===row.bytes,'PEER_HISTORY_CHANGED');versions.set(versionKey(row),{...row,value});}
  const physicalEvents=query(loan,'SELECT seq,type,principal_id,bytes,sha256,previous_sha256 FROM peer_events ORDER BY seq','all');
  const pending=loan.phase==='raw'&&loan.write?loan.pending():null;
  const committedHead=physicalEvents.at(-1)?.sha256??'0'.repeat(64);need(meta.last_event_sha256===committedHead,'PEER_HISTORY_CHANGED');
  if(pending&&(pending.changes.length||pending.events.length)){
    need(loan.sequence===physicalEvents.length+1&&pending.previous_sha256===committedHead,'PEER_HISTORY_CHANGED');
    const payload={changes:pending.changes,events:pending.events},row={seq:loan.sequence,type:loan.type,principal_id:loan.principal,previous_sha256:committedHead};row.bytes=canonical(payload);
    // Do not pass undefined through canonical JSON; this is exactly the private
    // owning writer's future event envelope, not a caller-supplied provider.
    row.sha256=digest({seq:row.seq,type:row.type,principal_id:row.principal_id,payload,previous_sha256:row.previous_sha256});physicalEvents.push(row);
  }
  need(physicalEvents.length>0,'PEER_ORIGIN_REQUIRED');const heads=new Map(),events=[],claimed=new Set();let previous='0'.repeat(64);
  for(let i=0;i<physicalEvents.length;i++){
    const raw=physicalEvents[i];need(raw.seq===i+1&&raw.previous_sha256===previous&&hex(raw.sha256),'PEER_HISTORY_CHANGED');let payload;try{payload=JSON.parse(raw.bytes);}catch{need(false,'PEER_HISTORY_CHANGED');}
    need(closed(payload,['changes','events'])&&Array.isArray(payload.changes)&&Array.isArray(payload.events)&&canonical(payload)===raw.bytes&&digest({seq:raw.seq,type:raw.type,principal_id:raw.principal_id,payload,previous_sha256:raw.previous_sha256})===raw.sha256,'PEER_HISTORY_CHANGED');
    const event={...raw,payload,rows:[]};
    for(const change of payload.changes){need(closed(change,['family','id','revision','sha256','previous_sha256']),'PEER_HISTORY_CHANGED');const vkey=versionKey(change),version=versions.get(vkey),identity=rowKey(change.family,change.id),old=heads.get(identity);
      need(version&&version.sha256===change.sha256&&!claimed.has(vkey)&&change.revision===(old?.revision??0)+1&&change.previous_sha256===(old?.sha256??null),'PEER_HISTORY_CHANGED');claimed.add(vkey);
      const row={family:version.family,id:version.id,revision:version.revision,sha256:version.sha256,value:version.value,created_seq:old?.created_seq??raw.seq,event_sequence:raw.seq};heads.set(identity,row);event.rows.push(row);version.created_seq=row.created_seq;version.event_sequence=raw.seq;
    }
    for(const e of payload.events)need(closed(e,['type','payload'])&&text(e.type),'PEER_HISTORY_CHANGED');events.push(event);previous=raw.sha256;
  }
  need(claimed.size===versions.size,'PEER_HISTORY_CHANGED');const physicalRows=query(loan,'SELECT family,id,revision,sha256,bytes,created_seq FROM peer_rows ORDER BY family,id','all');need(physicalRows.length===heads.size,'PEER_HISTORY_CHANGED');
  for(const row of physicalRows){const head=heads.get(rowKey(row.family,row.id));need(head&&row.revision===head.revision&&row.sha256===head.sha256&&row.bytes===canonical(head.value)&&row.created_seq===head.created_seq,'PEER_HISTORY_CHANGED');}
  const first=events[0];need(first.type==='origin.quarantined'&&first.principal_id==='founder','PEER_ORIGIN_REQUIRED');const origin=heads.get(rowKey('control','origin')),company=heads.get(rowKey('control','company'));
  need(['quarantined','sealed'].includes(origin?.value.status)&&origin.value.company_id===legacy.id&&origin.value.legacy_authority==='retired-without-conversion'&&company?.value.protocol==='peer-cos-v1'&&same(company.value.origin,ref(origin)),'PEER_ORIGIN_REQUIRED');
  const originalOrigin=first.rows.find(r=>r.family==='control'&&r.id==='origin'),originalCompany=first.rows.find(r=>r.family==='control'&&r.id==='company');need(originalOrigin?.revision===1&&originalCompany?.revision===1&&same(originalCompany.value.origin,ref(originalOrigin)),'PEER_ORIGIN_REQUIRED');
  const history={legacy,heads,versions,events,company,origin,event_sha256:previous,event_sequence:events.length};
  if(origin.value.status==='sealed'){
    need(origin.value.seal_ref,'ORIGIN_SEAL_REQUIRED');const seal=historicalRow(history,origin.value.seal_ref),sealEvent=events[seal.created_seq-1],expected=seal.value.kind==='origin_obligation_seal'?'origin.sealed':seal.value.kind==='origin_frontier_obligation_seal'?'origin.frontier-seal.sealed':null;
    need(expected&&sealEvent?.type===expected&&sealEvent.principal_id==='founder'&&seal.value.source_cut_sha256===origin.value.current_cut_sha256&&seal.value.old_reservations_released===false&&seal.value.execution_resumed===false,'ORIGIN_SEAL_CHANGED');
  }
  return history;
}
function historicalRow(history,reference){need(closed(reference,['family','id','revision','sha256'])&&FAMILIES.includes(reference.family)&&text(reference.id)&&positive(reference.revision)&&hex(reference.sha256),'HISTORICAL_REFERENCE_REQUIRED');const row=history.versions.get(versionKey(reference));need(row&&row.sha256===reference.sha256,'ADMISSION_CHANGED');return {...row,family:reference.family};}
function admissionFor(history,reference){
  const r=exactReference(reference),row=historicalRow(history,r),event=history.events[row.created_seq-1];need(event&&event.rows.some(v=>same(ref(v),r)),'ADMISSION_CHANGED');const v=row.value;
  const fixed={origin_maintenance_admission:['origin.maintenance.admitted','origin_maintenance_execution','origin_maintenance_phase'],input_frontier_admission:['input-frontier.admitted','input_frontier_execution','input_frontier_phase'],origin_frontier_seal_admission:['origin.frontier-seal.admitted','origin_frontier_seal_execution','origin_frontier_seal_phase'],origin_ordinary_task_admission:['origin.ordinary-task.admitted','origin_ordinary_task_execution','origin_ordinary_task_phase'],bootstrap_membership_admission:['membership/admit','membership_execution','membership_phase'],owner_maintenance_admission:['owner/maintenance.admit','owner_maintenance_slot','owner_maintenance_phase']};
  let kind,slotKind,phaseKind,phase,slot,effect;
  if(r.family==='commands'){
    need(event.type==='task/admit'&&event.principal_id==='scheduler'&&v.action==='task/admit'&&v.result?.admitted===true&&event.rows.filter(x=>x.family==='commands').length===1,'ADMISSION_KIND_UNSUPPORTED');kind='task';
    const task=v.result.task,attempt=task?.value?.attempt;need(task?.id&&text(attempt?.id),'ADMISSION_CHANGED');slot=event.rows.find(x=>x.family==='slots'&&x.id===task.id&&x.value.task_id===task.id&&x.value.attempt_id===attempt.id);effect=slot&&event.rows.find(x=>x.family==='effects'&&x.id===slot.value.effect_id&&x.value.kind==='native');
  }else if(fixed[v.kind]){
    const [eventType,sk,pk]=fixed[v.kind];need(event.type===eventType,'ADMISSION_PRODUCER_CHANGED');if(['origin_maintenance_admission','input_frontier_admission','origin_frontier_seal_admission','origin_ordinary_task_admission'].includes(v.kind))need(event.principal_id==='founder','ADMISSION_PRODUCER_CHANGED');kind=v.kind;slotKind=sk;phaseKind=pk;
    const candidates=event.rows.filter(x=>x.family==='work_items'&&x.value.kind===phaseKind&&(same(x.value.admission_ref??null,r)||v.kind==='bootstrap_membership_admission'&&x.value.attempt_id===v.binding?.attempt_id));need(candidates.length===1,'ADMISSION_CHANGED');phase=candidates[0];
    const slots=event.rows.filter(x=>x.family==='slots'&&x.value.kind===slotKind&&(same(x.value.admission_ref??null,r)||v.kind==='bootstrap_membership_admission'&&x.value.attempt_id===v.binding?.attempt_id));need(slots.length===1,'ADMISSION_CHANGED');slot=slots[0];effect=event.rows.find(x=>x.family==='effects'&&x.id===slot.id);
    if(phase.value.execution_id!==undefined)need(phase.value.execution_id===slot.id,'ADMISSION_CHANGED');
    if(v.binding?.context_ref){const context=historicalRow(history,v.binding.context_ref);need(context.family==='work_items'&&context.value.sha256===v.binding.context_sha256,'ADMISSION_CONTEXT_CHANGED');}
  }else if(v.kind==='membership_phase'&&!v.bootstrap_protocol){
    need(event.type==='membership/admit'&&v.status==='reserved','ADMISSION_KIND_UNSUPPORTED');kind='membership';phase={...row,family:'work_items'};slot=event.rows.find(x=>x.family==='slots'&&x.id===v.execution_id&&x.value.kind==='membership_execution'&&x.value.attempt_id===v.attempt_id&&x.value.membership_id===v.membership_id&&x.value.principal_id===v.principal_id);effect=slot&&event.rows.find(x=>x.family==='effects'&&x.id===slot.id);
  }else need(false,'ADMISSION_KIND_UNSUPPORTED');
  if(kind!=='membership')need(same(ref(history.heads.get(rowKey(r.family,r.id))),r),'ADMISSION_CHANGED');
  need(slot&&effect&&slot.revision===1&&effect.revision===1&&slot.created_seq===event.seq&&effect.created_seq===event.seq&&slot.value.status==='active'&&['reserved','running'].includes(effect.value.status)&&effect.value.termination_confirmed===false,'ADMISSION_RESERVATION_CHANGED');
  return {reference:r,row,event,kind,phase,slot,effect};
}
function allAdmissions(history){
  const admissions=new Map();
  for(const event of history.events)for(const row of event.rows){if(row.revision!==1)continue;
    const candidate=row.family==='commands'&&row.value.action==='task/admit'&&row.value.result?.admitted===true||row.family==='work_items'&&(['origin_maintenance_admission','input_frontier_admission','origin_frontier_seal_admission','origin_ordinary_task_admission','bootstrap_membership_admission','owner_maintenance_admission'].includes(row.value.kind)||row.value.kind==='membership_phase'&&!row.value.bootstrap_protocol);
    if(candidate){const admission=admissionFor(history,ref(row));admissions.set(canonical(admission.reference),admission);}
  }
  return admissions;
}
function latestUnitRow(history,initial,admission){
  let last=initial;
  const mutable=new Set(['status','termination_confirmed','result_ref','release_proof','result_sha256','closure','owned_task_drained']),identity=v=>Object.fromEntries(Object.entries(v).filter(([k])=>!mutable.has(k)));
  for(let revision=initial.revision+1;;revision++){const row=history.versions.get(versionKey({...initial,revision}));if(!row)break;
    // A task slot is reusable only after the exact previous invocation closed.
    if(admission.kind==='task'&&row.value.attempt_id!==initial.value.attempt_id)break;
    need(same(identity(row.value),identity(initial.value)),'RESERVATION_IDENTITY_CHANGED');
    last={...row,family:initial.family};
  }
  return last;
}
function genuineRelease(history,a,slot,effect){
  if(slot.value.status!=='released')return false;
  need(effect.value.termination_confirmed===true&&['returned','succeeded','failed'].includes(effect.value.status),'RELEASE_PROOF_REQUIRED');
  const event=history.events[slot.event_sequence-1];need(event&&effect.event_sequence===slot.event_sequence,'RELEASE_PROOF_REQUIRED');
  if(a.kind==='task'){
    need(['task/finish','task/closure'].includes(event.type)&&slot.value.termination_confirmed===true,'RELEASE_PROOF_REQUIRED');
    const task=event.rows.find(r=>r.family==='tasks'&&r.id===slot.value.task_id),proof=event.type==='task/closure'?task?.value.closure:task?.value.result;
    need(task&&task.value.attempt?.id===slot.value.attempt_id&&proof?.termination_confirmed===true,'RELEASE_PROOF_REQUIRED');const process=proof.observed_process;need(positive(process?.pid)&&Number.isFinite(Date.parse(process.started_at??process.execution_started_at))&&process.close_observed===true,'RELEASE_PROCESS_REQUIRED');
    const observation=historicalRow(history,proof.observation);need(observation.family==='effects'&&observation.created_seq===event.seq&&observation.value.kind==='runtime_observation'&&observation.value.action===event.type&&observation.value.principal_id===event.principal_id&&observation.value.task_id===task.id&&observation.value.attempt_id===slot.value.attempt_id&&observation.value.termination_confirmed===true&&same(observation.value.process,process),'RELEASE_OBSERVATION_REQUIRED');return true;
  }
  if(a.kind==='membership'){
    need(['membership/finish','membership/close'].includes(event.type)&&slot.value.termination_confirmed===true,'RELEASE_PROOF_REQUIRED');const phase=event.rows.find(r=>r.family==='work_items'&&r.id===a.phase.id);need(phase?.value.status==='closed','RELEASE_PROOF_REQUIRED');
    let process;if(event.type==='membership/close'){need(phase.value.closure?.termination_confirmed===true,'RELEASE_PROOF_REQUIRED');process=phase.value.closure.process;}
    else {const result=historicalRow(history,phase.value.result_ref);need(result.created_seq===event.seq&&result.value.termination_confirmed===true&&result.value.attempt_id===a.phase.value.attempt_id&&result.value.membership_id===a.phase.value.membership_id&&result.value.principal_id===a.phase.value.principal_id,'RELEASE_PROOF_REQUIRED');process=result.value.process;}
    need(positive(process?.pid)&&Number.isFinite(Date.parse(process.started_at))&&process.close_observed===true&&process.pid===phase.value.process?.pid&&process.started_at===phase.value.process?.started_at,'RELEASE_PROCESS_REQUIRED');return true;
  }
  const expected={origin_maintenance_admission:'origin.maintenance.completed',input_frontier_admission:'input-frontier.completed',origin_frontier_seal_admission:'origin.frontier-seal.completed',origin_ordinary_task_admission:'origin.ordinary-task.completed',bootstrap_membership_admission:'bootstrap-membership.completed',owner_maintenance_admission:'owner/maintenance.complete'}[a.kind];
  need(event.type===expected,'RELEASE_PRODUCER_CHANGED');const resultRef=slot.value.result_ref??slot.value.release_proof??effect.value.result_ref;need(resultRef&&same(resultRef,effect.value.result_ref),'RELEASE_PROOF_REQUIRED');const result=historicalRow(history,resultRef);need(result.created_seq===event.seq&&same(result.value.admission_ref,a.reference),'RELEASE_PROOF_REQUIRED');
  const phase=event.rows.find(r=>r.family==='work_items'&&r.id===a.phase.id);need(phase&&same(phase.value.result_ref,resultRef),'RELEASE_PROOF_REQUIRED');
  if(['bootstrap_membership_admission','owner_maintenance_admission'].includes(a.kind))need(phase.value.status==='closed'&&slot.value.termination_confirmed===true&&result.value.termination_confirmed===true&&(a.kind!=='bootstrap_membership_admission'||result.value.closure?.termination_confirmed===true),'RELEASE_PROOF_REQUIRED');
  else need(['returned','rejected'].includes(phase.value.status)&&phase.value.termination_confirmed===true,'RELEASE_PROOF_REQUIRED');
  // This is durable Source-observed drain provenance. It is never recreated
  // from a caller Boolean or used to assert the unrelated physical domain shut.
  const d=result.value.drain,b=a.row.value.binding;
  need(d?.protocol==='peer-owned-admitted-task-drain-v1'&&d.kind===b.kind&&same(d.admission_ref,a.reference)&&d.context_sha256===b.context_sha256&&text(d.native_id)&&d.native_id===d.thread_id&&d.native_id===result.value.native_id&&text(d.turn_id)&&d.terminal_status==='completed'&&typeof d.output==='string'&&hash(d.output)===d.output_sha256&&d.output_sha256===result.value.output_sha256&&d.output===(result.value.text??result.value.output)&&d.group_absent===null&&d.remote_domain_closed===false&&d.whole_domain_closed!==true&&Array.isArray(d.requests)&&d.requests.length>0,'RELEASE_DRAIN_REQUIRED');
  const requests=new Set();for(const request of d.requests){need(closed(request,['request_id','request_sha256','sequence','response_id','terminal_logical_payload_sha256'])&&text(request.request_id)&&!requests.has(request.request_id)&&hex(request.request_sha256)&&positive(request.sequence)&&text(request.response_id)&&hex(request.terminal_logical_payload_sha256),'RELEASE_DRAIN_REQUIRED');requests.add(request.request_id);}
  if(a.kind==='bootstrap_membership_admission'){
    try{validateBootstrapMembershipOwnedClosure(result.value.closure,{drain:d,kind:b.kind,admission_ref:a.reference,context_sha256:b.context_sha256,native_id:d.native_id});}catch{need(false,'RELEASE_BOOTSTRAP_CLOSURE_REQUIRED');}
  }
  const owner=a.kind==='owner_maintenance_admission';
  // Fresh markers only select stricter checks. A partial/relabelled binding
  // cannot fall back to the legacy resumed reviewer identity.
  const freshOwner=owner&&['fresh_review_purpose','creation_mode','reviewer_native_id'].some(key=>own(b,key));
  if(owner){
    need(slot.value.owned_task_drained===true&&effect.value.owned_task_drained===true,'RELEASE_DRAIN_REQUIRED');
    if(freshOwner){
      need(b.kind==='owner-handover-review'&&b.fresh_review_purpose==='peer-owner-maintenance-fresh-purpose-v1'&&b.creation_mode==='fresh-original-protected-thread'&&!own(b,'native_id')&&text(b.reviewer_native_id)&&b.reviewer_native_id!==d.native_id,'RELEASE_CREATION_REQUIRED');
      need(closed(b.reviewer_principal_ref,['family','id','revision','sha256'])&&b.reviewer_principal_ref.family==='principals'&&text(b.reviewer_principal_ref.id)&&positive(b.reviewer_principal_ref.revision)&&hex(b.reviewer_principal_ref.sha256),'RELEASE_CREATION_REQUIRED');
      const reviewer=historicalRow(history,b.reviewer_principal_ref);
      need(reviewer.family==='principals'&&reviewer.value.kind==='reviewer'&&reviewer.value.status==='active'&&reviewer.value.native_id===b.reviewer_native_id,'RELEASE_CREATION_REQUIRED');
      need(result.value.kind==='owner_handover_qualification'&&result.value.fresh_review_purpose===b.fresh_review_purpose&&same(result.value.reviewer_principal_ref,b.reviewer_principal_ref)&&result.value.reviewer_native_id===b.reviewer_native_id&&phase.value.kind==='owner_maintenance_phase'&&same(phase.value.admission_ref,a.reference)&&phase.value.native_id===d.native_id&&same(phase.value.creation_ref,result.value.creation_ref)&&d.whole_domain_qualified!==true&&d.prior_unknown_slots_released!==true,'RELEASE_CREATION_REQUIRED');
    }
    else need(d.native_id===b.native_id,'RELEASE_DRAIN_REQUIRED');
  }
  if(!owner||freshOwner){
    const creation=historicalRow(history,result.value.creation_ref),facts=creation.value.facts,spec={origin_maintenance_admission:['origin_maintenance_creation','origin.maintenance.native_created','peer-origin-original-creation-v1','soloco-origin-maintenance-readonly-v1'],input_frontier_admission:['input_frontier_creation','input-frontier.created','peer-input-frontier-original-creation-v1','soloco-input-frontier-readonly-v1'],origin_frontier_seal_admission:['origin_frontier_seal_creation','origin.frontier-seal.native_created','peer-origin-frontier-seal-original-creation-v1','soloco-origin-final-review-readonly-v1'],origin_ordinary_task_admission:['origin_ordinary_task_creation','origin.ordinary-task.native_created','peer-origin-ordinary-task-original-creation-v1','soloco-origin-ordinary-task-readonly-v1'],bootstrap_membership_admission:['bootstrap_membership_creation','bootstrap-membership.native_created','peer-bootstrap-membership-original-creation-v1','soloco-bootstrap-membership-readonly3-v1'],owner_maintenance_admission:['owner_maintenance_creation','owner/maintenance.native-created','peer-owner-maintenance-original-creation-v1','soloco-origin-final-review-readonly-v1']}[a.kind];
    need(spec&&creation.value.kind===spec[0]&&history.events[creation.created_seq-1]?.type===spec[1]&&a.event.seq<creation.created_seq&&creation.created_seq<event.seq&&same(creation.value.admission_ref,a.reference)&&facts?.protocol===spec[2]&&facts.profile_id===spec[3]&&facts.kind===b.kind&&same(facts.admission_ref,a.reference)&&facts.context_sha256===b.context_sha256&&facts.native_id===d.native_id&&facts.thread_id===d.native_id,'RELEASE_CREATION_REQUIRED');
    if(freshOwner)need(creation.family==='work_items'&&creation.revision===1&&creation.event_sequence===creation.created_seq&&creation.value.protocol==='peer-owner-maintenance-creation-record-v1'&&creation.value.fresh_review_purpose===b.fresh_review_purpose,'RELEASE_CREATION_REQUIRED');
  }
  return true;
}
function peerFacts(loan,options){
  need(closed(options,options?.stage==='existing'?['stage','admission_ref']:['stage'])&&['reserve','existing'].includes(options.stage),'CAPACITY_STAGE_REQUIRED');
  const history=peerHistory(loan),admissions=allAdmissions(history),coveredSlots=new Set(),coveredEffects=new Set(),legacyJobs=new Set();let peerOccupied=0;
  for(const a of admissions.values()){
    const slot=latestUnitRow(history,a.slot,a),effect=latestUnitRow(history,a.effect,a);need(['active','unknown','released'].includes(slot.value.status),'SLOT_STATUS_UNKNOWN');
    if(slot.value.status==='released')genuineRelease(history,a,slot,effect);else peerOccupied++;
    coveredSlots.add(rowKey('slots',a.slot.id));coveredEffects.add(rowKey('effects',a.effect.id));
  }
  for(const row of history.heads.values()){
    if(row.family==='slots'&&row.value.kind==='legacy_origin_reservation'){
      const jobId=row.value.job_id;need(text(jobId)&&history.legacy.jobs[jobId]&&!legacyJobs.has(jobId)&&history.origin.value.legacy_unknown_reservations?.includes(row.id),'LEGACY_RESERVATION_CHANGED');legacyJobs.add(jobId);coveredSlots.add(rowKey('slots',row.id));
    }
    if(row.family==='slots')need(coveredSlots.has(rowKey('slots',row.id)),'SLOT_KIND_UNSUPPORTED');
    if(row.family==='effects'&&['native','membership_execution','origin_maintenance_execution','input_frontier_execution','origin_frontier_seal_execution','origin_ordinary_task_execution','owner_maintenance_effect'].includes(row.value.kind))need(coveredEffects.has(rowKey('effects',row.id)),'UNPAIRED_EXECUTION');
  }
  need(upgradeOccupancy(history.legacy).occupied===0,'UPGRADE_ASSIGNMENTS_OCCUPIED');const legacyOccupied=Object.values(history.legacy.jobs).filter(assignmentOccupied).length;for(const job of Object.values(history.legacy.jobs))if(assignmentOccupied(job))need(legacyJobs.has(job.id),'LEGACY_RESERVATION_CHANGED');
  const cap=history.company.value.policy?.worker_cap,occupied=legacyOccupied+peerOccupied;need(positive(cap)&&cap<=3&&nat(occupied)&&occupied<=cap,'CAPACITY_EXHAUSTED');
  let ownReservation=null;if(options.stage==='existing'){const r=exactReference(options.admission_ref),a=admissions.get(canonical(r));need(a,'ADMISSION_NOT_INCLUDED');ownReservation={admission_ref:r,slot_ref:ref(latestUnitRow(history,a.slot,a)),occupied:latestUnitRow(history,a.slot,a).value.status!=='released'};}
  const remaining=cap-occupied;if(options.stage==='reserve')need(remaining>=1,'CAPACITY_EXHAUSTED');
  loan.assert();return Object.freeze({protocol:'original-local-execution-inventory-v1',retained_row_census_complete:true,admission_launch_coverage_complete:true,cardinality_known:true,unit:PEER_UNIT,worker_cap:cap,occupied,remaining,legacy_assignments:legacyOccupied,peer_invocations:peerOccupied,legacy_unit:LEGACY_UNIT,capacity_mapping:'fixed-source-shared-slot-v1',old_allowance_conversion:'none',source_generation_sha256:history.legacy.origin.source_generation_sha256,event_sequence:history.event_sequence,event_sha256:history.event_sha256,own_reservation:ownReservation,physical_domain_closed:false,authority_issued:false});
}
export function assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom(ledger,handle,options){const loan=originalPeerExecutionCustodyFrom(ledger,handle);need(!loan.external,'OWNING_TRANSACTION_REQUIRED');return check(loan,()=>peerFacts(loan,options));}
export function assertOriginalPeerMaintenanceExecutionCapacityFrom(ledger,options){
  originalPeerExecutionLedgerFrom(ledger);need(!ledger.inTransaction,'PEER_SNAPSHOT_REQUIRED');return Reflect.apply(PeerLedger.prototype.read,ledger,[tx=>assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom(ledger,tx,options)]);
}

const peerTokens=new WeakMap(),peerLaunches=new WeakMap();
function originalPeerCutoff(history,a){
  if(a.kind==='task'){
    const attempt=a.row.value.result?.task?.value?.attempt,authority=attempt?.effect_authority;need(authority?.protocol==='peer-task-effect-authority-v1','CUTOFF_REQUIRED');let deadline=finiteCutoff(Date.parse(authority.expires_at));
    const grant=attempt.context?.grant?.value;if(grant)deadline=Math.min(deadline,finiteCutoff(Date.parse(grant.expires_at)));return deadline;
  }
  if(a.kind==='membership'){
    const context=historicalRow(history,a.phase.value.context_ref);need(context.value.kind==='membership_context'&&typeof context.value.text==='string'&&hash(context.value.text)===context.value.sha256,'CUTOFF_REQUIRED');let assignment;try{assignment=JSON.parse(context.value.text);}catch{need(false,'CUTOFF_REQUIRED');}
    need(assignment.protocol==='peer-membership-assignment-v1'&&assignment.enrollment_id===a.phase.value.membership_id,'CUTOFF_REQUIRED');return finiteCutoff(Date.parse(assignment.enrollment?.expires_at));
  }
  return finiteCutoff(a.row.value.binding?.deadline_at_ms);
}
export function prepareOriginalPeerExecutionLaunchFrom(ledger,raw,{admission_ref}){
  const loan=originalPeerExecutionCustodyFrom(ledger,raw);need(loan.phase==='raw'&&loan.write&&!loan.external,'OWNING_WRITE_REQUIRED');const r=exactReference(admission_ref),history=peerHistory(loan),a=admissionFor(history,r);
  need(a.event.seq===loan.sequence&&a.row.created_seq===loan.sequence&&a.slot.created_seq===loan.sequence&&a.effect.created_seq===loan.sequence,'NEW_ADMISSION_REQUIRED');
  const key=canonical(r);let map=peerLaunches.get(ledger);if(!map){map=new Map();peerLaunches.set(ledger,map);}need(!map.has(key),'LAUNCH_ALREADY_REQUESTED');
  const token=Object.freeze({}),record={ledger,reference:r,source_generation_sha256:history.legacy.origin.source_generation_sha256,deadline_at_ms:originalPeerCutoff(history,a),signal:null,domain_cutoff_bound:false,armed:false,claimed:false,consumed:false,invalid:false};peerTokens.set(token,record);map.set(key,token);
  loan.onCommit(()=>{record.armed=true;});loan.onRollback(()=>{record.invalid=true;});return token;
}
export function claimOriginalPeerExecutionLaunchFrom(ledger,{admission_ref}){
  const r=exactReference(admission_ref),token=peerLaunches.get(ledger)?.get(canonical(r)),record=peerTokens.get(token);need(record&&record.ledger===ledger&&record.armed&&!record.invalid&&!record.claimed&&!record.consumed,'ORIGINAL_PROCESS_LAUNCH_REQUIRED');
  const facts=assertOriginalPeerMaintenanceExecutionCapacityFrom(ledger,{stage:'existing',admission_ref:r});need(facts.own_reservation?.occupied===true,'ADMISSION_TERMINAL');record.claimed=true;return token;
}
export function bindOriginalPeerExecutionLaunchCutoffFrom(token,loan){
  const r=peerTokens.get(token);need(r&&r.armed&&r.claimed&&!r.invalid&&!r.consumed&&!r.domain_cutoff_bound&&typeof originalProtectedDomain.inspectOriginalProtectedExecutionCutoffFrom==='function','CUTOFF_SOURCE_REQUIRED');const facts=originalProtectedDomain.inspectOriginalProtectedExecutionCutoffFrom(loan,token),deadline=finiteCutoff(facts?.deadline_at_ms);
  if(facts.signal!==null)try{Reflect.apply(abortedGetter,facts.signal,[]);}catch{need(false,'CUTOFF_SIGNAL_REQUIRED');}r.deadline_at_ms=Math.min(r.deadline_at_ms,deadline);r.signal=facts.signal;r.domain_cutoff_bound=true;
}
export function spawnOriginalPeerExecutionLaunch(token,command,args,options){
  const r=peerTokens.get(token);need(r&&r.armed&&r.claimed&&!r.invalid&&!r.consumed&&r.domain_cutoff_bound&&r.source_generation_sha256===generation(),'PRIVATE_PEER_LAUNCH_REQUIRED');
  need(command==='/usr/bin/sandbox-exec'&&Array.isArray(args)&&args.length>=3&&args[0]==='-p'&&args.every(x=>typeof x==='string')&&options&&options.shell===false&&Array.isArray(options.stdio)&&options.stdio.length===5,'FIXED_PEER_LAUNCH_REQUIRED');let child,closed=false,exited=false;
  try{return Reflect.apply(PeerLedger.prototype.write,r.ledger,['original.execution.launch','original-execution',raw=>{
    const facts=assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom(r.ledger,raw,{stage:'existing',admission_ref:r.reference});need(facts.own_reservation?.occupied===true,'ADMISSION_TERMINAL');need(!r.consumed,'LAUNCH_ALREADY_CONSUMED');r.consumed=true;finalLaunchCutoff(r);child=spawn(command,args,options);need(child&&typeof child.once==='function','ORIGINAL_CHILD_REQUIRED');originalChildErrorSinks(child);const onError=()=>{},onExit=()=>{exited=true;};child.on('error',onError);child.once('exit',onExit);child.once('close',()=>{closed=true;child.removeListener('error',onError);child.removeListener('exit',onExit);});return child;
  }]);}catch(error){r.invalid=true;rememberModelFailure(error,child,()=>closed,()=>exited);throw error;}
}

// The upgrade unit is the existing pair of CoS/QA assignments. Its carrier is
// physical custody, not a third assignment. These are projections of the real
// upgrade journals, not another persistent registry or a legacy enrollment.
const UPGRADE_KEYS=Object.freeze(['id','epoch','host','owner_session_id','status','created_at','checkpoint_sha256','history_sha256','candidate_hash','workflow','workflow_rules_sha256','source_instruction','review_deadline_policy','deadline_ms','call_timeout_minutes','model_selection_sha256','probe_instance','reviewer_instance','worker','steps','continuations']);
const UPGRADE_IDENTITY=Object.freeze(UPGRADE_KEYS.filter(k=>!['status','probe_instance','reviewer_instance','worker','steps','continuations'].includes(k)));
const upgradeTokens=new WeakMap(),modelFailureChildren=new WeakMap();
function upgradeProjection(state){
  const result={};
  for(const entry of [...(state.upgrade_history??[]),...(state.upgrade?[state.upgrade]:[])]){
    const u=resolveSnapshotEntry(state,entry);need(u&&text(u.id)&&!own(result,u.id),'UPGRADE_IDENTITY_REQUIRED');
    const item=Object.fromEntries(UPGRADE_IDENTITY.map(k=>[k,u[k]??null]));
    item.status=u.status;item.probe_instance=u.probe_instance??null;item.reviewer_instance=u.reviewer_instance??null;
    item.workers=[...(u.continuations??[]).map(c=>c.previous_worker).filter(Boolean),...(u.worker?[u.worker]:[])].map(w=>({token:w.token,state:w.state,pid:w.pid??null,original_execution:w.original_execution??null}));
    item.steps=(u.steps??[]).map(step=>({id:step.id,role:step.role,input_sha256:step.input_sha256,budget:step.budget,requested_native_id:step.requested_native_id??null,state:step.state,worker_token:step.worker_token,original_execution:step.original_execution??null}));
    result[u.id]=item;
  }
  return result;
}
function storedUpgrades(loan){
  const aggregate=query(loan,"SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(v.bytes AS BLOB))),0) AS bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE e.family IN ('upgrade','upgrade.steps','upgrade_history')",'get');
  need(nat(aggregate.n)&&aggregate.n<=MAX_ROWS&&nat(aggregate.bytes)&&aggregate.bytes<=MAX_BYTES,'UPGRADE_INVENTORY_CAPACITY');
  const state=check(loan,()=>readNormalized(loan.db,{rootKeys:[],entities:{upgrade:UPGRADE_KEYS,upgrade_history:null}}));
  return check(loan,()=>upgradeProjection(bindUpgradeSnapshotReader(loan,state)));
}
function bindUpgradeSnapshotReader(loan,state){
  let external=0;return bindSnapshots(state,sha=>{
    const size=query(loan,'SELECT length(CAST(bytes AS BLOB)) AS bytes FROM immutable_values WHERE sha256=?','get',sha);need(size&&nat(size.bytes)&&size.bytes<=MAX_BYTES&&external+size.bytes<=MAX_BYTES,'UPGRADE_INVENTORY_CAPACITY');external+=size.bytes;
    const row=query(loan,'SELECT bytes FROM immutable_values WHERE sha256=?','get',sha);need(typeof row?.bytes==='string'&&hash(row.bytes)===sha,'UPGRADE_SNAPSHOT_CHANGED');return row.bytes;
  });
}
function upgradeLaunches(u){return [...u.workers.map(w=>w.original_execution),...u.steps.map(s=>s.original_execution)];}
function upgradeStamps(u){return {workers:u.workers.map(w=>w.original_execution),steps:u.steps.map(s=>s.original_execution)};}
function validUpgradeLaunch(l,origin,kind){
  need(closed(l,['protocol','launch_id','kind','origin_id','source_generation_sha256','controller_pid','requested_at','worker_token','role','call_id','input_sha256','budget_sha256','native_id','model_selection_sha256','deadline_at_ms','birth','closure'])&&l.protocol==='original-upgrade-launch-v1'&&l.kind===kind&&text(l.launch_id)&&l.origin_id===origin.origin_id&&l.source_generation_sha256===origin.source_generation_sha256&&positive(l.controller_pid)&&Number.isFinite(Date.parse(l.requested_at))&&text(l.worker_token),'UPGRADE_LAUNCH_REQUIRED');
  if(kind==='model')need(['cos','qa'].includes(l.role)&&text(l.call_id)&&hex(l.input_sha256)&&hex(l.budget_sha256)&&hex(l.model_selection_sha256)&&Number.isSafeInteger(l.deadline_at_ms)&&l.deadline_at_ms>Date.parse(l.requested_at)&&(l.native_id===null||text(l.native_id)),'UPGRADE_CALL_REQUIRED');
  else need(l.role===null&&l.call_id===null&&l.input_sha256===null&&l.budget_sha256===null&&l.native_id===null&&hex(l.model_selection_sha256)&&(l.deadline_at_ms===null||Number.isSafeInteger(l.deadline_at_ms)),'UPGRADE_CARRIER_REQUIRED');
  if(l.birth!==null)need(closed(l.birth,['protocol','pid','parent_pid','command_sha256','argv_sha256','cwd_sha256','observed_at'])&&l.birth.protocol==='original-local-child-birth-v1'&&positive(l.birth.pid)&&l.birth.parent_pid===l.controller_pid&&['command_sha256','argv_sha256','cwd_sha256'].every(k=>hex(l.birth[k]))&&Number.isFinite(Date.parse(l.birth.observed_at)),'UPGRADE_BIRTH_REQUIRED');
  if(l.closure!==null)need(closed(l.closure,['protocol','launch_id','pid','code','signal','never_started','observed_at'])&&l.closure.protocol==='original-local-child-close-v1'&&l.closure.launch_id===l.launch_id&&l.closure.pid===(l.birth?.pid??null)&&typeof l.closure.never_started==='boolean'&&(l.closure.never_started?l.birth===null:l.birth!==null)&&(l.closure.code===null||Number.isInteger(l.closure.code))&&(l.closure.signal===null||typeof l.closure.signal==='string')&&Number.isFinite(Date.parse(l.closure.observed_at)),'UPGRADE_CLOSE_REQUIRED');
}
function validUpgrade(u,origin){
  need(text(u.id)&&['incremental-v1','incremental-v2'].includes(u.workflow)&&positive(u.epoch)&&['codex','claude'].includes(u.host)&&text(u.owner_session_id)&&hex(u.checkpoint_sha256)&&hex(u.history_sha256)&&hex(u.candidate_hash)&&hex(u.workflow_rules_sha256)&&hex(u.model_selection_sha256)&&typeof u.source_instruction==='string'&&u.source_instruction.trim().length>0&&u.source_instruction.length<=20000&&['finite','none'].includes(u.review_deadline_policy)&&(u.review_deadline_policy==='none'?u.deadline_ms===null:Number.isSafeInteger(u.deadline_ms))&&[10,30].includes(u.call_timeout_minutes)&&u.workers.length>0&&u.workers.length<=10000&&u.steps.length<=10000,'UPGRADE_ORIGINAL_ADMISSION_REQUIRED');
  const launches=new Set(),workers=new Map(),calls=new Set();
  for(const worker of u.workers){need(text(worker.token)&&!workers.has(worker.token),'UPGRADE_WORKER_CHANGED');const l=worker.original_execution;validUpgradeLaunch(l,origin,'carrier');need(l.worker_token===worker.token&&!launches.has(l.launch_id)&&(!['running','closed'].includes(worker.state)||l.birth?.pid===worker.pid),'UPGRADE_WORKER_CHANGED');launches.add(l.launch_id);workers.set(worker.token,l);}
  for(const step of u.steps){const l=step.original_execution;validUpgradeLaunch(l,origin,'model');need(!calls.has(step.id)&&!launches.has(l.launch_id)&&step.id===l.call_id&&step.role===l.role&&step.worker_token===l.worker_token&&workers.has(l.worker_token)&&step.input_sha256===l.input_sha256&&digest(step.budget)===l.budget_sha256&&step.requested_native_id===l.native_id&&l.model_selection_sha256===u.model_selection_sha256,'UPGRADE_CALL_CHANGED');calls.add(step.id);launches.add(l.launch_id);if(step.state==='returned')need(l.birth&&l.closure&&!l.closure.never_started,'UPGRADE_CALL_CLOSURE_REQUIRED');}
}
function upgradeStampTransition(old,next,type){
  if(same(old,next))return;
  const strip=l=>({...l,birth:null,closure:null});need(same(strip(old),strip(next)),'UPGRADE_LAUNCH_CHANGED');
  if(type==='upgrade.original_execution.born')need(old.birth===null&&next.birth!==null&&same(old.closure,next.closure),'UPGRADE_BIRTH_REQUIRED');
  else if(type==='upgrade.original_execution.closed')need(same(old.birth,next.birth)&&old.closure===null&&next.closure!==null,'UPGRADE_CLOSE_REQUIRED');
  else need(false,'UPGRADE_OBSERVER_REQUIRED');
}
function upgradeTransition(old,next,type){
  if(!old){need(type==='upgrade.prepared'&&next.workers.length===1&&next.steps.length===0&&next.status==='queued','UPGRADE_ADMISSION_WRITER_REQUIRED');return;}
  for(const key of UPGRADE_IDENTITY)need(same(old[key],next[key]),'UPGRADE_AUTHORITY_CHANGED');
  if(old.status!==next.status){const status={
    'upgrade.resumed':['queued','checking'],'upgrade.checking':['queued'],'upgrade.reviewed':['checking'],'upgrade.worker_claimed':['queued'],
    'upgrade.failed':['queued','checking','ready'],'upgrade.interrupted':['queued','checking','ready','applied'],
    'company.pause':['queued','checking','ready','applied'],'upgrade.apply':['ready'],'upgrade.verify':['applied'],'upgrade.recover':['queued','checking','ready','failed','applied','completed']
  };const result={'upgrade.worker_claimed':['failed'],'upgrade.resumed':['queued'],'upgrade.checking':['checking'],'upgrade.reviewed':['ready','failed'],'upgrade.failed':['failed'],'upgrade.interrupted':['failed'],'company.pause':['failed'],'upgrade.apply':['applied'],'upgrade.verify':['completed'],'upgrade.recover':['recovered']};need(status[type]?.includes(old.status)&&result[type].includes(next.status),'UPGRADE_STATUS_WRITER_REQUIRED');}
  for(const key of ['probe_instance','reviewer_instance'])if(old[key]!==next[key])need(type==='upgrade.checking'&&old[key]===null&&text(next[key]),'UPGRADE_SESSION_CHANGED');
  need(next.workers.length===old.workers.length||type==='upgrade.resumed'&&next.workers.length===old.workers.length+1&&old.workers.every(w=>w.original_execution.closure!==null),'UPGRADE_WORKER_REPLACEMENT_HELD');
  for(let i=0;i<old.workers.length;i++){const a=old.workers[i],b=next.workers[i];need(a.token===b.token,'UPGRADE_WORKER_CHANGED');if(a.state!==b.state||a.pid!==b.pid)need(type==='upgrade.worker_claimed'&&a.state==='reserved'&&b.state==='running'&&b.pid===b.original_execution.birth?.pid||type==='upgrade.worker_closed'&&a.state==='running'&&b.state==='closed'&&a.pid===b.pid,'UPGRADE_WORKER_WRITER_REQUIRED');upgradeStampTransition(old.workers[i].original_execution,next.workers[i].original_execution,type);}
  need(next.steps.length===old.steps.length||type==='upgrade.call_started'&&next.steps.length===old.steps.length+1,'UPGRADE_CALL_WRITER_REQUIRED');
  for(let i=0;i<old.steps.length;i++){const a=old.steps[i],b=next.steps[i];need(same({...a,state:null,original_execution:null},{...b,state:null,original_execution:null}),'UPGRADE_CALL_CHANGED');if(a.state!==b.state)need(type==='upgrade.call_closed'&&a.state==='started'&&b.state==='returned','UPGRADE_CALL_CHANGED');upgradeStampTransition(a.original_execution,b.original_execution,type);}
}
function upgradeOccupancy(history){
  let occupied=0,unknown=0,carrier_unknown=0;
  for(const u of Object.values(history.upgrades??{})){
    const carriersClosed=u.workers.every(w=>w.original_execution.closure!==null);
    for(const w of u.workers)if(w.original_execution.closure===null)carrier_unknown++;
    for(const l of u.steps.map(s=>s.original_execution))if(l.closure===null)unknown++;
    // One upgrade reserves the existing pair jointly. A role finishing first
    // cannot release half the pair while any original model remains UNKNOWN.
    const allModelsClosed=u.steps.every(s=>s.original_execution.closure!==null);
    if(!carriersClosed||!allModelsClosed)occupied+=2;
  }
  return {occupied,unknown,carrier_unknown};
}
function approveUpgrade(w,state,uid){const u=upgradeProjection(state)[uid];need(u,'UPGRADE_CHANGED');validUpgrade(u,w.history.origin);w.upgrade_approved.set(uid,copy(upgradeStamps(u)));}
function upgradeRecordIn(state,uid){
  if(state.upgrade?.id===uid)return state.upgrade;
  const entry=(state.upgrade_history??[]).find(u=>u.id===uid);need(entry&&!own(entry,'immutable_entry'),'UPGRADE_HISTORY_OBSERVATION_REQUIRED');return entry;
}
function upgradePolicy(u){return u.review_deadline_policy==='none'&&u.deadline_ms===null?Infinity:u.deadline_ms;}
function newUpgradeLaunch(w,u,kind,workerToken,step=null){
  const started=Date.parse(step?.started_at??u.worker.requested_at);need(Number.isSafeInteger(started),'UPGRADE_START_REQUIRED');
  return {protocol:'original-upgrade-launch-v1',launch_id:randomUUID(),kind,origin_id:w.history.origin.origin_id,source_generation_sha256:w.history.origin.source_generation_sha256,controller_pid:process.pid,requested_at:new Date(started).toISOString(),worker_token:workerToken,role:step?.role??null,call_id:step?.id??null,input_sha256:step?.input_sha256??null,budget_sha256:step?digest(step.budget):null,native_id:step?.requested_native_id??null,model_selection_sha256:u.model_selection_sha256,deadline_at_ms:kind==='model'?Math.min(started+u.call_timeout_minutes*60000,upgradePolicy(u)):Number.isFinite(upgradePolicy(u))?upgradePolicy(u):null,birth:null,closure:null};
}
function issueUpgradeLaunch(store,state,w,u,launch){
  const token=Object.freeze({}),record={store,root:w.loan.root,uid:u.id,origin:copy(w.history.origin),launch:copy(launch),committed:false,consumed:false,invalid:false,cutoff:null};if(launch.kind==='model')record.binding={host:u.host,native_id:launch.native_id,prompt_sha256:launch.input_sha256,cwd:path.join(dataDir(),'sessions',launch.role==='cos'?u.probe_instance:u.reviewer_instance),selection_sha256:u.model_selection_sha256};upgradeTokens.set(token,record);w.upgrade_tokens.push(token);approveUpgrade(w,state,u.id);return token;
}
export function prepareOriginalUpgradeCarrierLaunchFrom(store,state){
  const w=writeContext(store,state),u=state.upgrade;need(w.history&&['upgrade.prepared','upgrade.resumed'].includes(w.type)&&u?.status==='queued'&&u.epoch===state.owner.epoch&&u.owner_session_id===state.owner.session_id&&u.host===state.owner.host&&state.paused===true&&text(u.worker?.token)&&u.worker.state==='reserved'&&!u.worker.original_execution,'UPGRADE_ADMISSION_REQUIRED');
  const old=w.before.upgrades[u.id];if(old)need(w.type==='upgrade.resumed'&&old.workers.every(worker=>worker.original_execution.closure)&&old.steps.every(step=>step.state==='returned'&&step.original_execution.closure),'UPGRADE_AMBIGUOUS_RESUME_HELD');
  need(originalFacts(w.history).remaining>=2,'CAPACITY_EXHAUSTED');u.worker.original_execution=newUpgradeLaunch(w,u,'carrier',u.worker.token);
  return issueUpgradeLaunch(store,state,w,u,u.worker.original_execution);
}
export function assertOriginalUpgradeWorkerFrom(store,state,{uid,worker_token}){
  const w=writeContext(store,state),u=state.upgrade,old=w.history?.upgrades[uid],worker=old?.workers.at(-1),launch=worker?.original_execution;
  need(u?.id===uid&&old&&worker.token===worker_token&&u.worker?.token===worker_token&&launch.birth?.pid===process.pid&&launch.closure===null&&u.worker.original_execution?.launch_id===launch.launch_id,'UPGRADE_ORIGINAL_WORKER_REQUIRED');return true;
}
export function prepareOriginalUpgradeModelLaunchFrom(store,state,{call_id}){
  const w=writeContext(store,state),u=state.upgrade;need(w.history&&w.type==='upgrade.call_started'&&u?.status==='checking','UPGRADE_CALL_WRITER_REQUIRED');assertOriginalUpgradeWorkerFrom(store,state,{uid:u.id,worker_token:u.worker?.token});
  const step=u.steps?.at(-1),old=w.before.upgrades[u.id];need(step&&step.id===call_id&&step.state==='started'&&['cos','qa'].includes(step.role)&&step.worker_token===u.worker.token&&!step.original_execution&&u.steps.length===old.steps.length+1&&!old.steps.some(s=>s.id===call_id),'UPGRADE_CALL_ALREADY_REQUESTED');
  need(!old.steps.some(s=>s.role===step.role&&s.original_execution.closure===null),'UPGRADE_AMBIGUOUS_CALL_HELD');step.original_execution=newUpgradeLaunch(w,u,'model',u.worker.token,step);
  return issueUpgradeLaunch(store,state,w,u,step.original_execution);
}
function upgradeDeadline(r){
  need(r&&!r.invalid&&r.cutoff,'UPGRADE_ORIGINAL_CUTOFF_REQUIRED');const facts=inspectOriginalUpgradeLaunchCutoffFrom(r.cutoff,r.token);need(facts.store===r.store&&facts.uid===r.uid&&facts.worker_token===r.launch.worker_token&&facts.call_id===r.launch.call_id&&facts.deadline_at_ms===r.launch.deadline_at_ms,'UPGRADE_CUTOFF_CHANGED');
  if(facts.signal?.aborted||r.launch.deadline_at_ms!==null&&Date.now()>=r.launch.deadline_at_ms){r.invalid=true;need(false,'UPGRADE_DEADLINE');}return facts;
}
export function bindOriginalUpgradeLaunchCutoffFrom(token,loan){const r=upgradeTokens.get(token);need(r&&!r.committed&&!r.consumed&&!r.cutoff,'UPGRADE_CUTOFF_REUSED');r.token=token;r.cutoff=loan;upgradeDeadline(r);}
function currentUpgradeLaunch(r){
  need(r&&!r.invalid&&r.committed&&!r.consumed&&r.launch.controller_pid===process.pid&&!r.store.closed&&r.origin.source_generation_sha256===generation(),'PRIVATE_UPGRADE_LAUNCH_REQUIRED');
  r.store.readSnapshot(()=>{const loan=originalStoreExecutionCustodyFrom(r.store),history=originalHistory(loan),u=history.upgrades[r.uid];need(u&&same(history.origin,r.origin)&&upgradeLaunches(u).some(l=>same(l,r.launch))&&['queued','checking'].includes(u.status),'UPGRADE_LAUNCH_CHANGED');});upgradeDeadline(r);return r;
}
function mutateUpgradeLaunch(r,field,value){
  const store=new Store(r.root);try{store.transaction('upgrade.original_execution.'+(field==='birth'?'born':'closed'),state=>{const w=writeContext(store,state),u=upgradeRecordIn(state,r.uid),workers=[...(u.continuations??[]).map(c=>c.previous_worker).filter(Boolean),u.worker].filter(Boolean),l=r.launch.kind==='carrier'?workers.find(worker=>worker.original_execution?.launch_id===r.launch.launch_id)?.original_execution:u.steps?.find(step=>step.original_execution?.launch_id===r.launch.launch_id)?.original_execution;need(w.history&&l&&l[field]===null&&same({...l,birth:null,closure:null},{...r.launch,birth:null,closure:null}),'UPGRADE_OBSERVATION_CHANGED');if(field==='closure')need(value.pid===(l.birth?.pid??null),'UPGRADE_OBSERVATION_CHANGED');l[field]=copy(value);approveUpgrade(w,state,r.uid);return state;});}finally{store.close();}
}
function rememberModelFailure(error,child,closed,exited){
  // Every issuer retains real original emitter custody before COMMIT can fail.
  // Public diagnostic properties and caller closure flags are never consulted.
  retainFailedLaunch(error,child,closed,exited);
  if(child&&error&&(typeof error==='object'||typeof error==='function'))modelFailureChildren.set(error,{child});
}
export function originalModelFailedLaunchChild(error){return originalWorkerFailedLaunchChild(error)??modelFailureChildren.get(error)?.child??null;}
export function cleanupOriginalModelLaunchFailure(error){return cleanupOriginalWorkerLaunchFailure(error);}
function spawnUpgradeLaunch(token,command,args,options){
  const r=currentUpgradeLaunch(upgradeTokens.get(token));need(Array.isArray(args)&&args.every(a=>typeof a==='string')&&typeof command==='string'&&options.shell!==true,'UPGRADE_LAUNCH_INPUT');let child,birth=null,started=false,errored=false,closed=false,exited=false;
  try{r.store.transaction('upgrade.original_execution.born',state=>{
    const w=writeContext(r.store,state),u=state.upgrade,projection=w.history?.upgrades[r.uid];w.upgrade_cutoff_record=r;need(u?.id===r.uid&&projection&&upgradeLaunches(projection).some(l=>same(l,r.launch))&&['queued','checking'].includes(u.status),'UPGRADE_LAUNCH_CHANGED');
    // Last synchronous inventory is complete. The canonical loan checks only
    // the original cutoff/signal here, immediately before this one Popen.
    upgradeDeadline(r);if(r.launch.kind==='model')modelAdapterDeadline(r);r.consumed=true;child=spawn(command,args,options);need(child&&typeof child.once==='function','ORIGINAL_CHILD_REQUIRED');originalChildErrorSinks(child);
    const onError=()=>{if(!started)errored=true;};const onSpawn=()=>{if(!started&&positive(child.pid)){started=true;birth=birthFor(command,args,options,child.pid);try{mutateUpgradeLaunch(r,'birth',birth);}catch{/* UNKNOWN retained */}}};
    const onExit=()=>{exited=true;};child.on('error',onError);child.once('spawn',onSpawn);child.once('exit',onExit);child.once('close',(code,signal)=>{closed=true;child.removeListener('error',onError);child.removeListener('spawn',onSpawn);child.removeListener('exit',onExit);if(!started&&!errored)return;try{if(birth){const snapshot=new Store(r.root);try{const current=snapshot.read(),v=upgradeProjection(current)[r.uid],l=v&&upgradeLaunches(v).find(l=>l.launch_id===r.launch.launch_id);if(l?.birth===null)mutateUpgradeLaunch(r,'birth',birth);}finally{snapshot.close();}}mutateUpgradeLaunch(r,'closure',{protocol:'original-local-child-close-v1',launch_id:r.launch.launch_id,pid:birth?.pid??null,code:code??null,signal:signal??null,never_started:!started&&errored,observed_at:time()});}catch{/* UNKNOWN retained */}});
    if(positive(child.pid)){started=true;birth=birthFor(command,args,options,child.pid);const launch=r.launch.kind==='carrier'?u.worker.original_execution:u.steps.find(step=>step.id===r.launch.call_id).original_execution;launch.birth=copy(birth);approveUpgrade(w,state,r.uid);}return state;
  });}catch(error){r.invalid=true;rememberModelFailure(error,child,()=>closed,()=>exited);throw error;}return child;
}
export function spawnOriginalUpgradeCarrierLaunch(token,command,args,options){const r=upgradeTokens.get(token);need(r?.launch.kind==='carrier'&&command===process.execPath&&Array.isArray(args)&&args[1]===path.join(RUNTIME,'upgrade.mjs')&&args[2]===r.root&&args[3]===r.uid&&args[4]===r.launch.worker_token,'FIXED_UPGRADE_CARRIER_REQUIRED');return spawnUpgradeLaunch(token,command,args,options);}

// The default unprotected preparation scheduler may consume only its genuine
// task admission. Protected production authority is never a raw CLI permission.
const rawPeerModelTokens=new WeakMap();
function rawPeerCurrent(r,raw){
  const loan=originalPeerExecutionCustodyFrom(r.ledger,raw),history=peerHistory(loan),a=admissionFor(history,r.reference),task=raw.get('tasks',r.task_id),t=task?.value;
  need(a.kind==='task'&&t?.status==='running'&&t.attempt?.id===r.attempt_id&&t.authority_epoch===r.authority_epoch&&same(t.attempt.context,r.context)&&same(a.row.value.result.context,r.context),'PEER_MODEL_ADMISSION_CHANGED');
  need(!t.attempt.effect_authority?.production_authority&&!a.row.value.result.task.value.attempt.effect_authority?.production_authority,'PROTECTED_PEER_RUNTIME_REQUIRED');
  need(validatePeerTaskContext(raw,r.context)===true,'PEER_MODEL_CONTEXT_CHANGED');
  const capacity=assertOriginalPeerMaintenanceExecutionCapacityInTransactionFrom(r.ledger,raw,{stage:'existing',admission_ref:r.reference});need(capacity.own_reservation?.occupied===true,'ADMISSION_TERMINAL');
  // No further provider or user callback follows this final immutable fence.
  modelAdapterDeadline(r);return r;
}
export function claimOriginalPeerModelLaunchFrom(ledger,{admission_ref,task,context,prompt,cwd,selection=null}){
  const reference=exactReference(admission_ref);let selected;
  Reflect.apply(PeerLedger.prototype.read,ledger,[raw=>{
    const history=peerHistory(originalPeerExecutionCustodyFrom(ledger,raw)),a=admissionFor(history,reference),original=a.row.value.result?.task;
    need(a.kind==='task'&&original?.id===task?.id&&same(original,task)&&same(a.row.value.result.context,context)&&typeof prompt==='string'&&path.resolve(cwd)===ledger.root,'PEER_MODEL_ADMISSION_CHANGED');
    const t=original.value,authority=t.attempt?.effect_authority;
    need(authority&&!authority.production_authority&&Number.isSafeInteger(Date.parse(authority.expires_at)),'PROTECTED_PEER_RUNTIME_REQUIRED');
    selected={ledger,reference,task_id:task.id,attempt_id:t.attempt.id,authority_epoch:t.authority_epoch,context:copy(context),binding:{host:t.host??'codex',native_id:null,prompt_sha256:hash(prompt),cwd:path.resolve(cwd),selection_sha256:hash(JSON.stringify(selection))},deadline_at_ms:Date.parse(authority.expires_at),adapter_loan:null,invalid:false};
    need(validatePeerTaskContext(raw,context)===true&&Date.now()<selected.deadline_at_ms,'PEER_MODEL_CONTEXT_CHANGED');
  }]);
  const original=claimOriginalPeerExecutionLaunchFrom(ledger,{admission_ref:reference}),r=peerTokens.get(original);need(r&&!r.raw_model,'LAUNCH_ALREADY_REQUESTED');
  const token=Object.freeze({});selected.original=original;r.raw_model=token;rawPeerModelTokens.set(token,selected);return token;
}
function modelAdapterDeadline(r){
  need(!r.invalid&&r.adapter_loan,'MODEL_ADAPTER_CUTOFF_REQUIRED');const f=inspectOriginalAdapterModelCutoffFrom(r.adapter_loan,r.model_token);
  need(Number.isSafeInteger(f.deadline_at_ms)&&f.deadline_at_ms<=r.deadline_at_ms,'MODEL_ADAPTER_CUTOFF_CHANGED');
  if(f.signal?.aborted||Date.now()>=f.deadline_at_ms){r.invalid=true;need(false,'MODEL_DEADLINE');}return f;
}
export function bindOriginalModelAdapterCutoffFrom(token,loan){
  const r=rawPeerModelTokens.get(token)??upgradeTokens.get(token);if(!r)return false;
  need(!r.adapter_loan&&!r.consumed&&!r.invalid,'MODEL_ADAPTER_CUTOFF_REUSED');r.model_token=token;r.adapter_loan=loan;
  if(upgradeTokens.has(token))r.deadline_at_ms=r.launch.deadline_at_ms;
  modelAdapterDeadline(r);return true;
}
function modelBinding(r,input){
  need(closed(input,['host','native_id','prompt','cwd','selection'])&&same(r.binding,{host:input.host,native_id:input.native_id,prompt_sha256:hash(input.prompt),cwd:path.resolve(input.cwd),selection_sha256:hash(JSON.stringify(input.selection))}),'MODEL_INPUT_CHANGED');
}
export function assertOriginalModelLaunchToken(token,input){
  const peer=rawPeerModelTokens.get(token);if(peer){modelBinding(peer,input);need(!peer.invalid&&!peerTokens.get(peer.original)?.consumed,'PRIVATE_PEER_MODEL_LAUNCH_REQUIRED');return Object.freeze({kind:'peer-model',deadline_at_ms:peer.deadline_at_ms});}
  const upgrade=upgradeTokens.get(token);if(upgrade){need(upgrade.launch.kind==='model','MODEL_TOKEN_KIND_CHANGED');currentUpgradeLaunch(upgrade);modelBinding(upgrade,input);return Object.freeze({kind:'upgrade-model',deadline_at_ms:upgrade.launch.deadline_at_ms});}
  assertOriginalWorkerLaunchToken(token,{kind:'model'});const ordinary=launchTokens.get(token);
  if(ordinary.request_input_binding){
    need(same(ordinary.request_input_binding,requestInputBinding(input)),'MODEL_INPUT_CHANGED');
    const bounds=assertOriginalModelRequestCurrentFrom(token,ordinary.store),deadlines=[bounds.authority_deadline_at_ms,bounds.execution_deadline_at_ms].filter(value=>value!==null);
    return Object.freeze({kind:'legacy-model',deadline_at_ms:deadlines.length?Math.min(...deadlines):null});
  }
  return Object.freeze({kind:'legacy-model',deadline_at_ms:null});
}
export function spawnOriginalModelLaunch(token,command,args,options){
  const peer=rawPeerModelTokens.get(token);
  if(peer){need(peer.adapter_loan&&typeof command==='string'&&Array.isArray(args)&&args.every(x=>typeof x==='string')&&options.shell!==true&&options.stdio?.length===3&&path.resolve(options.cwd)===peer.binding.cwd,'FIXED_RAW_PEER_MODEL_REQUIRED');let child,closed=false,exited=false;
    try{return Reflect.apply(PeerLedger.prototype.write,peer.ledger,['original.execution.launch','original-execution',raw=>{
      rawPeerCurrent(peer,raw);const r=peerTokens.get(peer.original);need(r&&r.armed&&r.claimed&&!r.invalid&&!r.consumed,'PRIVATE_PEER_MODEL_LAUNCH_REQUIRED');r.consumed=true;child=spawn(command,args,options);need(child&&typeof child.once==='function','ORIGINAL_CHILD_REQUIRED');originalChildErrorSinks(child);const ignore=()=>{},onExit=()=>{exited=true;};child.on('error',ignore);child.once('exit',onExit);child.once('close',()=>{closed=true;child.removeListener('error',ignore);child.removeListener('exit',onExit);});return child;
    }]);}catch(error){peer.invalid=true;rememberModelFailure(error,child,()=>closed,()=>exited);throw error;}
  }
  const upgrade=upgradeTokens.get(token);if(upgrade){need(upgrade.launch.kind==='model'&&upgrade.adapter_loan&&path.resolve(options.cwd)===upgrade.binding.cwd&&options.stdio?.length===3,'FIXED_UPGRADE_MODEL_REQUIRED');modelAdapterDeadline(upgrade);return spawnUpgradeLaunch(token,command,args,options);}
  return spawnOriginalWorkerLaunch(token,command,args,options);
}

// Read only the real CURRENT upgrade identity in the owning snapshot. A
// historical applied/completed row cannot select this typed verify cutoff.
function currentUpgradeIdFrom(loan){
  const normalized=query(loan,"SELECT 1 FROM sqlite_master WHERE type='table' AND name='state_entries'",'get');let uid;
  if(normalized){const row=query(loan,"SELECT e.encoding,e.sha256,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE e.family='upgrade' AND e.key='id'",'get');need(row?.encoding==='json'&&typeof row.bytes==='string'&&hash(row.bytes)===row.sha256,'UPGRADE_CURRENT_IDENTITY_REQUIRED');try{uid=JSON.parse(row.bytes);}catch{need(false,'UPGRADE_CURRENT_IDENTITY_REQUIRED');}}
  else {const size=query(loan,'SELECT length(CAST(value AS BLOB)) AS bytes FROM company WHERE id=1','get');need(size&&nat(size.bytes)&&size.bytes<=MAX_BYTES,'INVENTORY_CAPACITY');const row=query(loan,'SELECT value FROM company WHERE id=1','get');try{uid=JSON.parse(row.value).upgrade?.id;}catch{need(false,'UPGRADE_CURRENT_IDENTITY_REQUIRED');}}
  need(text(uid),'UPGRADE_CURRENT_IDENTITY_REQUIRED');return uid;
}
function assertUpgradeCommitCutoff(w,history){
  const observational=new Set(['upgrade.original_execution.born','upgrade.original_execution.closed','upgrade.worker_closed','upgrade.failed','upgrade.interrupted','upgrade.native_returned','upgrade.recover']);
  if(!w.type.startsWith('upgrade.')||observational.has(w.type))return;
  let cutoff=null;
  // w.launch_cutoff is the corrected Store's existing private per-write
  // minimum input. The typed verify PREIMAGE survives completed postimage,
  // full replay and final current-id read; no caller deadline is admitted.
  if(w.verify_preimage){const {uid,original}=w.verify_preimage;need(w.type==='upgrade.verify'&&currentUpgradeIdFrom(w.loan)===uid&&history.upgrades[uid]?.status==='completed','UPGRADE_VERIFY_TRANSITION_REQUIRED');need(w.launch_cutoff===(original.review_deadline_policy==='finite'?original.deadline_ms:null),'UPGRADE_VERIFY_CUTOFF_CHANGED');cutoff=w.launch_cutoff;}
  const active=Object.values(history.upgrades).filter(u=>['queued','checking','ready','applied'].includes(u.status));
  for(const u of active)if(u.review_deadline_policy!=='none')cutoff=cutoff===null?u.deadline_ms:Math.min(cutoff,u.deadline_ms);
  // No provider or current-id read follows this final primitive sample. The
  // composed corrected Store samples the same private minimum before COMMIT.
  if(cutoff!==null){const now=Date.now();need(Number.isSafeInteger(now)&&now>=0&&now<cutoff,'UPGRADE_DEADLINE');}
}

function heldUpgradesPreserved(before,after){
  if(!same(Object.keys(before).sort(),Object.keys(after).sort()))return false;
  for(const [uid,a]of Object.entries(before)){const b=after[uid],strip=u=>({...u,status:null,workers:u.workers.map(w=>({...w,state:null}))});if(!same(strip(a),strip(b))||b.status!==a.status&&!['failed','recovered'].includes(b.status))return false;for(let i=0;i<a.workers.length;i++)if(a.workers[i].state!==b.workers[i].state&&b.workers[i].state!=='closed')return false;}
  return true;
}

export function inspectOriginalOrdinaryTaskSourceTupleFrom(){need(arguments.length===0&&typeof originalProtectedDomain.inspectOriginalProtectedOrdinaryOriginSourceTuple==='function','ORDINARY_SOURCE_TUPLE_REQUIRED');return Object.freeze({protocol:'peer-origin-ordinary-source-tuple-v1',source_generation_sha256:generation(),support:originalProtectedDomain.inspectOriginalProtectedOrdinaryOriginSourceTuple()});}
export function assertOriginalOrdinaryTaskSourceTupleFrom(expected){const current=inspectOriginalOrdinaryTaskSourceTupleFrom();need(same(current,expected),'ORDINARY_SOURCE_TUPLE_CHANGED');return current;}
