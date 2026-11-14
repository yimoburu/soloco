import {retentionReviewAction,resolveRetentionRepair,retentionRepairSessionKey,retentionRepairContextInputs,assertRetentionRepairCommit} from './development-retention-repair.mjs';
import {retentionReviewAdmissionPreflight,assertRetentionReviewPreflightCommit} from './review-preflight.mjs';
import {developmentReviewContinuationAction,reviewContinuationAssignment,assertReviewContinuationCommit} from './development-review-continuation.mjs';
import {codeReviewWindowSubject} from './code-review-window.mjs';
import {SchedulingHold} from './recovery.mjs';
import {OPERATING_PROTOCOL,validateOperatingRecord,proposeOperatingState,publishOperatingState,operatingInspection,operatingMaintenanceEligible,operatingContext,admitOperatingAssignment} from './operating-state.mjs';
import {mechanicalOperatingControl} from './operating-control.mjs';
import * as scoped from './scoped-context.mjs';
import { currentView, upgradeView, publicPage, exactRead, mutationView, sourceReference, itemView, controlView, storageSourceId, fits, exactTextRead } from './public-response.mjs';
import {backupCompany,restoreCompany} from './storage-transfer.mjs';
import {contextPlan,validateContextPlan,applyContextQualification,recordReference,contextSource} from './current-state.mjs';
import {isCanonicalNoticeSource} from './notice-sources.mjs';
import {captureQualificationPlan,createQualificationTarget,qualificationPlanView,qualificationReadUnit,qualificationReadEvidence,validateQualificationApply,qualificationMaintenanceEligible,qualificationControlHash,qualificationWorkload,QualificationHold} from './context-qualification.mjs';
import {bindOperatingIntake,inheritSnapshots,retainSnapshot,resolveSnapshotEntry,snapshotReference,snapshotBytes} from './snapshot.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {dataDir} from './plugin-data.mjs';
export {dataDir} from './plugin-data.mjs';
import { PACKAGE, VERSION, stamp, id, digest, folder, noLink, withStore, owner, notice, requireText, SCHEMA, installedTeam, teamHash, upgradePending, compatibleRuntime, originalStoreExecutionCustodyFrom, retainOriginalStoreCommitCutoffFrom } from './store.mjs';
import { readiness, modelCatalog } from './adapters.mjs';
import { normalizeSelection, selectionKey } from './selection.mjs';
import {reconcileStoredModelProcessClosure} from './model-process-closure.mjs';
import { normalizeCoordination, bindCoordination } from './coordination.mjs';
import { progressSnapshot, renderProgress } from './progress-view.mjs';
import {progressObservations} from './progress-observations.mjs';
import { beginHandover, submitReconstruction, handoverReviewEligible, freshHandoverReviewEligible, verifyHandoverAcceptance, handoverSubject, inspectHandover, reconstructionReceipt, admitHandover } from './handover.mjs';
import { assignmentContext, contextMatches } from './context.mjs';
import { developmentAction, developmentCapability, developmentAssignment } from './develop.mjs';
import {isDevelopmentBudgetRequest,validateDevelopmentBudgetRequest,developmentBudgetRuntimeAction} from './development-budget-runtime.mjs';
import { prototypeAction, prototypeCapability, prototypeAssignment } from './prototype.mjs';
import { TIMEOUT_POLICY_VERSION, normalizeTimeout, normalizeHandoverReviewWindow, normalizeCodeReviewWindow, jobTimeoutState } from './timeout.mjs';
import {taskAction,runtimeAction} from './task-runtime.mjs';
import {peerRuntimeAction} from './peer-runtime.mjs';
import {peerAdoptionRuntimeAction} from './peer-adoption-runtime.mjs';
import {peerOwnerRuntimeAction,peerOwnerRoutingStorageKind,validatePeerOwnerRequest} from './peer-owner-runtime.mjs';
import {peerOriginRuntimeAction,validatePeerOriginRequest} from './peer-origin-runtime.mjs';
import {requireCodexRootActor} from './mcp-host-context.mjs';
import {taskRecord,taskReady,bindTaskAttempt,taskContextFormat} from './tasks.mjs';
import {runtimeGrant,runtimeControlBinding} from './task-runtime-authority.mjs';
import {readTaskState,updateTaskIndex} from './task-index.mjs';
import {specialistAction,isSpecialistRecord,prepareSpecialistAssignment,specialistSessionKey,specialistContext,usesSpecialistInputRevisions} from './specialists.mjs';
import * as originMechanicalQa from './peers/origin-mechanical-qa-policy.mjs';
import {qaData,qaRef,qaNeed,qaText,qaSame,qaCopy} from './peers/origin-mechanical-qa-contract.mjs';
import {recordOriginalWorkerAssignmentFrom,cleanupOriginalWorkerLaunchFailure} from './peers/prospective-local-worker-inventory-producer.mjs';
import {recordRuntimeWorkerAssignmentFrom,prepareRuntimeWorkerLaunchFrom,spawnRuntimeWorkerLaunch,cleanupLegacyRuntimeLaunchFailure,runtimeJobOccupied} from './runtime-execution.mjs';

function cleanupRuntimeWorkerLaunchFailure(error){
  const legacy=cleanupLegacyRuntimeLaunchFailure(error),original=cleanupOriginalWorkerLaunchFailure(error);
  return legacy||original;
}

const busy = state => Object.values(state.jobs??{}).filter(j => ['queued','running'].includes(j?.status));
const originalEngineCommitCutoffs=new WeakMap();
export function inspectOriginalEngineCommitCutoffFrom(proof,actualDb){
  const record=originalEngineCommitCutoffs.get(proof),loan=originalStoreExecutionCustodyFrom(actualDb);
  if(!record||record.db!==loan.db||record.scope!==loan.scope||loan.mode!=='write')throw Error('Original engine commit cutoff custody required');
  return record.facts;
}
function retainEngineCommitCutoff(actualDb,bounds){
  if(!bounds.length)return;
  const loan=originalStoreExecutionCustodyFrom(actualDb);if(loan.mode!=='write')throw Error('Original engine write required');
  const candidates=bounds.map(({at,code=null,message})=>{const deadline=typeof at==='number'?at:Date.parse(at);if(!Number.isSafeInteger(deadline)||deadline<0||deadline>8640000000000000)throw Object.assign(Error(message),code===null?{}:{code});return {deadline_at_ms:deadline,code,message};});
  const facts=Object.freeze(candidates.reduce((a,b)=>a.deadline_at_ms<=b.deadline_at_ms?a:b)),proof=Object.freeze({});
  originalEngineCommitCutoffs.set(proof,{db:loan.db,scope:loan.scope,facts});retainOriginalStoreCommitCutoffFrom(actualDb,proof,'engine');
}
// Terminal status does not prove that a started model process has closed.
const occupiedJobs = state => Object.values(state.jobs??{}).filter(j=>runtimeJobOccupied(j)||['queued','running'].includes(j.status)||(j.runtime_task||j.started_at)&&['cancelled','interrupted','failed'].includes(j.status)&&j.coordination_release?.termination_confirmed!==true);
export function bind(root, session, host) {
  requireText(session,'session_id',200);
  const dir = path.join(dataDir(),'bindings');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file = path.join(dir,digest(JSON.stringify([folder(root),host,session]))+'.json');
  noLink(file);
  let previous={};try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  fs.writeFileSync(file,JSON.stringify({...previous,root:folder(root),host,session_id:session,at:stamp(),plugin_version:VERSION,plugin_root:PACKAGE,data_directory:dataDir()}),{mode:0o600});
}
export function binding(args, host) {
  requireText(args.session_id,'session_id',200);
  const file = path.join(dataDir(),'bindings',digest(JSON.stringify([folder(args.root),host,args.session_id]))+'.json');
  if (!fs.existsSync(file)) throw new Error('No startup-hook binding in this MCP data directory. Run company_doctor with root and session_id to distinguish missing discovery, stale project hooks, disabled/untrusted hooks, or a data-directory mismatch. Then reopen this chat and send a prompt.');
}
export const noticePreviewHash=n=>digest(JSON.stringify([n.kind,n.summary,n.reference]));
export function openedTeam(args,host,team) {
  binding(args,host);
  const file=path.join(dataDir(),'bindings',digest(JSON.stringify([folder(args.root),host,args.session_id]))+'.json');
  noLink(file);
  const bindingState=JSON.parse(fs.readFileSync(file,'utf8'));
  if(team!==undefined) {
    bindingState.opened_team_sha256=team;
    fs.writeFileSync(file,JSON.stringify(bindingState),{mode:0o600});
  }
  return bindingState.opened_team_sha256??null;
}
export function upgradeSummary(u) { return upgradeView(u); }
function summary(state,root,options={}) { return currentView(state,{...options,capabilities:{local_prototype:prototypeCapability(state),local_development:developmentCapability(state,root)}}); }
// Read-only public presentation; never an authorization/acceptance check.
export function current(args,host,resultId) {
  binding(args,host);
  return withStore(args.root,db=>db.readSnapshot(()=>{
    const state=db.publicState(true),view=summary(state,args.root);
    if(typeof resultId==='string') {
      const selected=db.readPublicSelected({rootKeys:[],entities:{records:[resultId],jobs:[resultId]}});
      if(Object.hasOwn(selected.records??{},resultId))view.operation_source=sourceReference(selected.records[resultId],storageSourceId('records',resultId));
      else if(Object.hasOwn(selected.jobs??{},resultId))view.operation_source=sourceReference(selected.jobs[resultId],storageSourceId('jobs',resultId));
    }
    return view;
  }));
}
// Read back persisted attribution without constructing another potentially large
// current view. Never retry a completed mutation just to recover its receipt.
export function operationReceipt(args,host,result,operation) {
  binding(args,host);
  return withStore(args.root,db=>{
    const state=db.read(),receipt={...controlView(state)};
    for(const family of ['records','jobs','notices','messages']) {
      const match=Object.entries(state[family]??{}).find(([key,v])=>typeof result?.id==='string'&&(v?.id===result.id||key===result.id));
      if(match){const [key,value]=match;const id=storageSourceId(family,key);receipt.operation_source=sourceReference(value,id);receipt.result=itemView(value,id,family);return receipt;}
    }
    if(operation==='company_upgrade'&&state.upgrade){receipt.result=upgradeView(state.upgrade);receipt.operation_source=receipt.result.source;}
    else if(args.plan_id&&state.records[args.plan_id]){receipt.operation_source=sourceReference(state.records[args.plan_id],storageSourceId('records',args.plan_id));receipt.result=itemView(state.records[args.plan_id],receipt.operation_source.id);}
    else {receipt.attribution_hold='No exact persisted result could be identified. Inspect current sources before taking further action; do not repeat the mutation.';receipt.sources=publicPage(state,{collection:'sources',limit:8});}
    return receipt;
  });
}
export function inspectionPage(args,host,collection) {
  binding(args,host);return withStore(args.root,db=>db.readSnapshot(()=>publicPage(db.publicState(),{collection})));
}
export function develop(args,host) {
  if(isDevelopmentBudgetRequest(args)) {
    const checked=validateDevelopmentBudgetRequest(args);
    const actor=peerCallerActor(checked,host);
    return developmentBudgetRuntimeAction(checked,actor);
  }
  binding(args,host);
  return ['prepare_retention_review','authorize_retention_review'].includes(args.action)?retentionReviewAction(args,host):['prepare_review_continuation','authorize_review_continuation','accept_review_continuation'].includes(args.action)?developmentReviewContinuationAction(args,host):developmentAction(args,host);
}
export function prototype(args,host) { binding(args,host); return prototypeAction(args,host); }
export function tasks(args,host){binding(args,host);return taskAction(args,host);}
export function runtime(args,host){binding(args,host);return runtimeAction(args,host);}
// New peer authority never falls back to a caller-selected session or a legacy
// binding file. The fixed MCP ingress supplies identity; the current binding is
// an additional lifecycle/source consistency check, not a native proof.
export function peerCallerActor(args,host){
  const actor=requireCodexRootActor({host,session_id:args.session_id});
  const fail=()=>{throw Object.assign(Error('PEER_CURRENT_HOOK_REQUIRED: New peer access requires a current matching managed startup-hook record; a legacy binding is not caller identity.'),{code:'PEER_CURRENT_HOOK_REQUIRED'});};
  const sameNode=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
  const stableFile=(a,b)=>sameNode(a,b)&&a.size===b.size&&a.nlink===b.nlink&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
  if(typeof args.root!=='string'||!path.isAbsolute(args.root))fail();
  const root=folder(args.root),directory=dataDir(),name=digest(JSON.stringify([root,host,actor.session_id]))+'.json';
  if(!path.isAbsolute(directory))fail();
  const {O_RDONLY,O_NOFOLLOW,O_DIRECTORY,O_NONBLOCK}=fs.constants;
  if(!Number.isInteger(O_NOFOLLOW)||!Number.isInteger(O_DIRECTORY)||!Number.isInteger(O_NONBLOCK))fail();
  const descriptors=[];let current;
  try{
    const namedData=fs.lstatSync(directory,{bigint:true});
    if(!namedData.isDirectory()||namedData.isSymbolicLink())fail();
    const realData=fs.realpathSync(directory),bindings=path.join(realData,'bindings'),file=path.join(bindings,name);
    const dataFd=fs.openSync(realData,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_NONBLOCK);descriptors.push(dataFd);
    const dataBefore=fs.fstatSync(dataFd,{bigint:true});
    if(!dataBefore.isDirectory()||!sameNode(namedData,dataBefore))fail();
    const namedDirectory=fs.lstatSync(bindings,{bigint:true});
    if(!namedDirectory.isDirectory()||namedDirectory.isSymbolicLink())fail();
    const directoryFd=fs.openSync(bindings,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_NONBLOCK);descriptors.push(directoryFd);
    const directoryBefore=fs.fstatSync(directoryFd,{bigint:true});
    if(!directoryBefore.isDirectory()||!sameNode(namedDirectory,directoryBefore))fail();
    const fd=fs.openSync(file,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);descriptors.push(fd);
    const before=fs.fstatSync(fd,{bigint:true});
    if(!before.isFile()||before.nlink!==1n||before.size<0n||before.size>65536n)fail();
    const bytes=Buffer.alloc(Number(before.size)+1);let read=0;
    while(read<bytes.length){const count=fs.readSync(fd,bytes,read,bytes.length-read,read);if(!count)break;read+=count;}
    const after=fs.fstatSync(fd,{bigint:true}),namedFile=fs.lstatSync(file,{bigint:true});
    const directoryAfter=fs.fstatSync(directoryFd,{bigint:true}),dataAfter=fs.fstatSync(dataFd,{bigint:true});
    const dataNameAfter=fs.lstatSync(directory,{bigint:true}),directoryNameAfter=fs.lstatSync(bindings,{bigint:true});
    if(read!==Number(before.size)||!stableFile(before,after)||!stableFile(after,namedFile)||namedFile.isSymbolicLink()||!sameNode(directoryBefore,directoryAfter)||!sameNode(directoryAfter,directoryNameAfter)||directoryNameAfter.isSymbolicLink()||!sameNode(dataBefore,dataAfter)||!sameNode(dataAfter,dataNameAfter)||dataNameAfter.isSymbolicLink())fail();
    const raw=bytes.subarray(0,read),text=raw.toString('utf8');
    if(!Buffer.from(text,'utf8').equals(raw))fail();
    current=JSON.parse(text);
  }catch{fail();}
  finally{for(const fd of descriptors.reverse())try{fs.closeSync(fd);}catch{}}
  if(!current||Array.isArray(current)||current.root!==root||current.host!==actor.host||current.session_id!==actor.session_id||current.plugin_version!==VERSION||current.plugin_root!==PACKAGE||current.data_directory!==directory||typeof current.at!=='string'||!Number.isFinite(Date.parse(current.at)))fail();
  return actor;
}
export function peers(args,host){peerCallerActor(args,host);return peerRuntimeAction(args,host);}
export function ownerLifecycle(args,host){
  const checked=validatePeerOwnerRequest(args,host);
  peerCallerActor(checked,host);
  return peerOwnerRuntimeAction(checked,host);
}
export function originLifecycle(args,host){
  const checked=validatePeerOriginRequest(args,host);
  peerCallerActor(checked,host);
  return peerOriginRuntimeAction(checked,host);
}
export function peerAdoption(args,host){binding(args,host);return peerAdoptionRuntimeAction(args,host);}
export function specialists(args,host){
  binding(args,host);
  const options={host,reviewCurrent:(state,job,hash)=>{
    // Assessment consumes the exact QA output as a verdict, not as a new input
    // to that same QA invocation. Every other negative remains current evidence.
    const current=state.jobs?.[job.id],output=current?.artifact_id&&state.records?.[current.artifact_id];
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const keys=['id','kind','content','author_role','author_instance','revision','status','job_id','inputs','retrieved_inputs','review_of','review','created_at'];
    if(current?.status==='completed'&&current.role==='qa'&&current.native_id&&current.coordination_release?.termination_confirmed===true
      &&output?.id===current.artifact_id&&output.kind==='review'&&output.status==='Submitted'&&output.revision===1
      &&output.job_id===current.id&&output.author_role===current.role&&output.author_instance===current.instance_id
      &&['Fail','Blocked'].includes(output.review?.verdict)&&same(output.review_of,current.review_of)&&same(output.inputs,current.inputs)
      &&Object.keys(output).every(key=>keys.includes(key))&&!current.inputs.some(ref=>ref.id===output.id)){
      const view=inheritSnapshots(state,{...state,records:Object.fromEntries(Object.entries(state.records).filter(([id])=>id!==output.id))});
      return contextMatches(view,current,hash);
    }
    return contextMatches(state,job,hash);
  }};
  if(args.action==='inspect')return withStore(args.root,db=>db.readSnapshot(()=>{
    const state=db.read();owner(state,args.session_id,host,args.epoch);
    const result=specialistAction(state,args,options);
    return {...result,items:result.items.map(record=>itemView(record,storageSourceId('records',record.id),'records'))};
  }));
  let result;update(args,host,'specialist.'+args.action,state=>{result=specialistAction(state,args,options);});return result;
}
function update(args, host, type, fn, selection=null,beforeCommit=null) {
  binding(args,host);
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  return withStore(args.root, db => {const mutate=state=>{owner(state,args.session_id,host,args.epoch);if(state.operating_state||type.startsWith('operating.'))bindOperatingIntake(state,db);fn(state,db);state.runtime_version=VERSION;return state;};return selection&&db.selectedTransaction?db.selectedTransaction(type,selection,mutate):db.transaction(type,mutate,beforeCommit?{beforeCommit}:{});});
}
export function open(args, host) {
  // Select the existing peer reader before constructing a legacy Store. This
  // route never initializes/migrates peer storage or substitutes legacy identity.
  if(peerOwnerRoutingStorageKind(args.root)==='peer')return ownerLifecycle({root:args.root,session_id:args.session_id,action:'status'},host);
  binding(args,host);
  const state=withStore(args.root, db => {
    const current=db.read();
    if (current) {owner(current,args.session_id,host); return current;}
    if (fs.existsSync(path.join(folder(args.root),'team/manifest.json'))) throw new Error('Legacy workspace detected; explicit migration is required. Existing team records were not changed.');
    const team=installedTeam();
    return db.transaction('company.created', () => ({schema:SCHEMA,runtime_version:VERSION,id:id('company'),name:requireText(args.name ?? 'Untitled Venture','name',200).trim(),idea:requireText(args.idea,'idea'),phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host,session_id:args.session_id,epoch:1},records:{},sessions:{},jobs:{},messages:[],notices:[],created_at:stamp()}));
  }, true);
  const result=summary(state,args.root,{open:true});
  openedTeam(args,host,state.team_sha256);
  return result;
}
export function status(args, host) {
  if(peerOwnerRoutingStorageKind(args.root)==='peer')return ownerLifecycle({root:args.root,session_id:args.session_id,action:'status'},host);
  binding(args,host);
  return withStore(args.root, db => {
    const needsReconciliation=j=>['overdue','inspection'].includes(jobTimeoutState(j,Date.now()).state);
    const expiredExports=s=>Object.values(s.records??{}).filter(r=>r?.prototype?.export?.status==='writing' && Date.now()-Date.parse(r.prototype.export.started_at)>60000);
    const expiredUpgrade=s=>{
      const u=s.upgrade,noOverallDeadline=u?.review_deadline_policy==='none' && u.deadline_ms===null && u.review_window_minutes===null;
      return u && ['queued','checking'].includes(u.status) && !noOverallDeadline && Date.now()>=(u.deadline_ms ?? Date.parse(u.created_at)+420000);
    };
    // Reconciliation decisions and an idle view share one WAL snapshot. A
    // concurrent writer cannot slip new overdue work into an unchecked view.
    const initial=db.readSnapshot(()=>{
      const selected=db.publicReconciliationState(),state=selected??db.read();
      if(!state)throw Error('Company initialization is incomplete; use company_open');
      return busy(state).some(needsReconciliation)||expiredExports(state).length||expiredUpgrade(state)
        ? {state}:{view:summary(selected?db.publicState(true):state,args.root)};
    });
    if(initial.view)return initial.view;
    let state=initial.state;
    if (busy(state).some(needsReconciliation)) state=db.transaction('jobs.interrupted', s=>{
      for (const job of busy(s)) {
        const timing=jobTimeoutState(job,Date.now());
        if(!['overdue','inspection'].includes(timing.state))continue;
        job.status='interrupted';job.finished_at=stamp();
        job.timeout_reconciliation={...timing,at:stamp(),termination_confirmed:false};
        job.error=timing.state==='inspection'?'Assignment timing requires inspection: '+timing.reason:`Assignment ${timing.phase} deadline exceeded; process termination is unverified`;
        notice(s,'must_know',job.error+'; inspect before retrying.',job.id);
      }
      return s;
    });
    const interruptedExports=expiredExports(state);
    if(interruptedExports.length) state=db.transaction('prototype.exports_interrupted',s=>{
      for(const r of interruptedExports) {
        if(s.records[r.id]?.prototype?.export?.status!=='writing') continue;
        s.records[r.id].prototype.export.status='failed';
        s.records[r.id].prototype.export.error='File creation was interrupted; inspect possible partial files before any new scope';
        notice(s,'must_know',s.records[r.id].prototype.export.error,r.id);
      }
      return s;
    });
    if (expiredUpgrade(state)) {
      state=db.transaction('upgrade.interrupted',s=>{s.upgrade.status='failed';s.upgrade.error='Upgrade checks were interrupted or timed out; inspect and recover before retrying';notice(s,'must_know',s.upgrade.error,s.upgrade.id);return s;});
    }
    // Status is visible to a new founder chat so it can establish a handover.
    return summary(state,args.root);
  });
}
// Lifecycle projections are scheduling hints only. Final status performs the
// integrity-checked selected read and reconciliation before returning any truth.
const lifecycleKeys=['id','status','kind','type','timeout_policy_version','timeout_ms','timeout_reason','created_at','started_at','execution_started_at','execution_deadline_at'];
function waitLifecycle(db) {
  const selected=db.publicReconciliationState(false);
  if(selected)return {jobs:Object.values(selected.jobs??{}),upgrade:selected.upgrade??{}};
  const projection=lifecycleKeys.map(k=>"'"+k+"',json_extract(v.bytes,'$."+k+"')").join(',');
  const normalized=/^normalized-v[1-4]$/.test(db.storageInfo().format);
  const jobs=normalized
    ? db.db.prepare("SELECT json_object("+projection+") AS value FROM state_entries e JOIN immutable_values v USING(sha256) WHERE e.family='jobs' AND json_extract(v.bytes,'$.status') IN ('queued','running')").all().map(r=>Object.fromEntries(Object.entries(JSON.parse(r.value)).filter(([,v])=>v!==null)))
    : db.db.prepare("SELECT json_object("+projection.replaceAll('v.bytes','j.value')+") AS value FROM company c, json_each(c.value,'$.jobs') j WHERE json_extract(j.value,'$.status') IN ('queued','running')").all().map(r=>Object.fromEntries(Object.entries(JSON.parse(r.value)).filter(([,v])=>v!==null)));
  const keys=['status','review_deadline_policy','deadline_ms','review_window_minutes','created_at'];
  let upgrade;
  if(normalized) {
    const rows=db.db.prepare("SELECT e.key,json_extract(v.bytes,'$') AS value FROM state_entries e JOIN immutable_values v USING(sha256) WHERE e.family='upgrade' AND e.key IN ("+keys.map(()=>'?').join(',')+")").all(...keys);
    upgrade=Object.fromEntries(rows.map(r=>[r.key,r.value]));
  } else {
    const fields=keys.map(k=>"'"+k+"',json_extract(value,'$.upgrade."+k+"')").join(',');
    const row=db.db.prepare('SELECT json_object('+fields+') AS value FROM company WHERE id=1').get();
    upgrade=row?JSON.parse(row.value):{};
  }
  return {jobs,upgrade};
}
export async function wait(args,host) {
  binding(args,host);
  const until=Date.now()+Math.min(20,Math.max(0,args.seconds??15))*1000;
  let previous,observed;
  do {
    observed=withStore(args.root,db=>db.readSnapshot(()=>{
      const token=db.changeToken();
      if(previous?.token===token)return previous;
      return {token,...waitLifecycle(db)};
    }));
    previous=observed;
    const u=observed.upgrade,now=Date.now();
    const pendingUpgrade=['queued','checking'].includes(u.status);
    const unlimited=u.review_deadline_policy==='none'&&u.deadline_ms===null&&u.review_window_minutes===null;
    const overdueUpgrade=pendingUpgrade&&!unlimited&&now>=(u.deadline_ms??Date.parse(u.created_at)+420000);
    if((!observed.jobs.length&&!pendingUpgrade)||observed.jobs.some(j=>['overdue','inspection'].includes(jobTimeoutState(j,now).state))||overdueUpgrade||now>=until)break;
    await new Promise(resolve=>setTimeout(resolve,Math.min(500,until-now)));
  } while(true);
  return status(args,host);
}
// Read only: unlike status, never reconciles jobs or writes receipts.
export function progress(args,host) {
  binding(args,host);
  if (!['json','html','text','mermaid','observations'].includes(args.format ?? 'json')) throw new Error('Unknown progress format');
  if (args.recent_jobs !== undefined && (!Number.isInteger(args.recent_jobs) || args.recent_jobs < 1 || args.recent_jobs > 50)) throw new Error('recent_jobs must be 1 to 50');
  if(args.format==='observations'&&args.action!==undefined)throw Error('Observations use cursor pages, not progress artifact reads');
  if(args.action==='read')return readProgressArtifact(args,host);
  return withStore(args.root,db=>db.readSnapshot(()=>{
    const state=db.read();
    if (!state) throw new Error('Company initialization is incomplete; use company_open');
    if(args.format==='observations')return progressObservations(state,args);
    const projection=progressSnapshot(state,{recentJobs:args.recent_jobs ?? 20});
    const result=args.format && args.format !== 'json' ? renderProgress(projection,args.format,{renderId:args.render_id}) : projection;
    if(fits(result))return result;
    const format=args.format??'json',snapshot={generated_at:stamp(),company_revision:state.revision,change_token:db.changeToken(),source_sha256:digest(JSON.stringify(state)),projection_sha256:digest(JSON.stringify(projection)),format,render_id:args.render_id??null};
    const text=JSON.stringify({snapshot,result}),file=progressArtifactPath(args,host,format);
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});noLink(file);
    const temporary=file+'.'+id('write');
    try {fs.writeFileSync(temporary,text,{mode:0o600,flag:'wx'});fs.renameSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
    return {response_format:'soloco-current-v2',render_not_inlined:true,format,snapshot,
      artifact:{id:format,sha256:digest(text),total_characters:text.length,read:{tool:'company_progress',action:'read',artifact:format},encoding:'Exact JSON envelope {snapshot,result}; UTF-16 ranges. Parse the concatenated text; result is the original render/projection.',retention:'Latest oversized render per format in this company/host. Replaced only by another oversized render of the same format; missing/replaced/tampered artifacts fail closed.'},
      attention:publicPage(state,{collection:'unresolved_notices',limit:3}),
      retrieval:'Follow company_progress read next_offset until complete, verify sha256, then parse result. HTML result is the complete mountable fragment, not an inline preview. Frozen snapshot; current state may have changed. Present every unresolved notice using attention pages and exact company_context sources.'};
  }));
}
function progressArtifactPath(args,host,format) {
  if(!['json','html','text','mermaid'].includes(format))throw Error('Invalid progress artifact');
  const directory=path.join(dataDir(),'progress-renders',digest(JSON.stringify([folder(args.root),host])));
  noLink(path.dirname(directory));noLink(directory);
  return path.join(directory,format+'.json');
}
function readProgressArtifact(args,host) {
  const file=progressArtifactPath(args,host,args.artifact);noLink(file);
  let text;try{text=fs.readFileSync(file,'utf8');}catch(error){if(error.code==='ENOENT')throw Error('Missing or replaced progress artifact; request a new render');throw error;}
  return exactTextRead(text,{...args,id:args.artifact});
}
export function save(args,host) {
  if(args.operating_record!==undefined)validateOperatingRecord(args.operating_record);
  requireText(args.content,'content',100000);
  if (!['intent','plan','decision','preference','artifact'].includes(args.kind)) throw new Error('Unsupported record kind');
  if (args.kind==='preference' && (!['explicit','inferred'].includes(args.basis) || !args.source_reference)) throw new Error('Preferences need explicit/inferred basis and source_reference');
  if(args.context_obligations!==undefined&&(args.context_obligations?.version!==1||!['artifact','decision','intent','preference'].includes(args.kind)||typeof args.context_obligations.scope!=='string'||!args.context_obligations.scope.trim()))throw Error('Versioned context_obligations requires scope and a current artifact record');
  const recordId=args.id ?? id(args.kind);
  if(typeof recordId==='string'&&/^specialist-[a-f0-9]{32}$/.test(recordId))throw Error('Specialist records require company_specialists');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,200}$/.test(recordId) || ['constructor','prototype','__proto__'].includes(recordId)) throw new Error('Invalid record ID');
  const state=update(args,host,'record.saved',s=>{
    const old=s.records[recordId];
    if(isSpecialistRecord(old)||old?.specialist!==undefined)throw Error('Specialist records are immutable; use company_specialists');
    if(old?.handover)throw new Error('Handover reconstructions are immutable; submit a new reconstruction');
    if(old?.development) throw new Error('Development records are immutable; use company_develop');
    if(old?.prototype) throw new Error('Prototype records are immutable; use company_prototype or create a new scope');
    if (old && (old.author_instance!==s.owner.session_id || old.revision!==args.expected_revision)) throw new Error('Record owner or version conflict; create a new proposal instead');
    if (!old && args.expected_revision !== undefined && args.expected_revision !== 0) throw new Error('Record does not exist at expected version');
    const bootstrap=scoped.bootstrapSaveProvenance(s,args,old);
    s.records[recordId]={...(bootstrap?{bootstrap_home_provenance:bootstrap}:{}),id:recordId,kind:args.kind,content:args.content,...(args.operating_record===undefined?{}:{operating_record:structuredClone(args.operating_record)}),...(args.context_obligations===undefined?{}:{context_obligations:structuredClone(args.context_obligations)}),author_role:'runner',author_instance:s.owner.session_id,revision:(old?.revision??0)+1,status:'Draft',source_reference:args.source_reference??null,basis:args.basis??null,updated_at:stamp(),previous:old ? [...(old.previous??[]), {revision:old.revision,content:old.content,source_reference:old.source_reference,...(old.operating_record?{operating_record:old.operating_record}:{}),...(old.context_obligations?{context_obligations:old.context_obligations}:{})}] : []};
    // An amended artifact never retains a review of its earlier version.
  },args.bootstrap_plan_id||args.id?null:{rootKeys:['schema','runtime_version','plugin_version','team_sha256','owner','paused','roles','governance','governance_sha256','cos_instructions','revision','updated_at'],entities:{records:[recordId],upgrade:['status']}});
  return mutationView(state.records[recordId],recordId);
}
export function handover(args,host) {
  if(['inspect','read'].includes(args.action)){binding(args,host);return withStore(args.root,db=>inspectHandover(db.read(),args));}
  if(args.action!=='submit')throw new Error('Choose inspect or submit');
  let result;update(args,host,'handover.reconstruction_submitted',s=>{result=submitReconstruction(s,args);});return reconstructionReceipt(result);
}
export function dispatch(args,host,{launch=launchWorker,check=readiness,catalog=modelCatalog}={}) {
  requireText(args.task,'task');
  if(args.fresh_session!==undefined && typeof args.fresh_session!=='boolean')throw new Error('fresh_session must be boolean');
  const fresh=args.fresh_session===true;
  const freshReason=fresh?requireText(args.fresh_session_reason,'fresh_session_reason',300).trim():null;
  if(!fresh && args.fresh_session_reason!==undefined)throw new Error('fresh_session_reason requires fresh_session: true');
  if(fresh && (args.review_of!==undefined || args.prototype_id!==undefined || args.development_id!==undefined))throw new Error('fresh_session is only for ordinary specialist assignments; review and scoped generation retain their existing session lifecycle');
  if(args.specialist_ref!==undefined&&(args.review_of!==undefined||args.prototype_id!==undefined||args.development_id!==undefined||args.handover_review_window_minutes!==undefined))throw Error('Temporary specialist profiles support ordinary assignments only');
  normalizeCoordination(args);
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  if(args.task_summary!==undefined)requireText(args.task_summary,'task_summary',160);
  if(args.expected_deliverable!==undefined)requireText(args.expected_deliverable,'expected_deliverable',300);
  if(args.evidence_ids!==undefined&&(!Array.isArray(args.evidence_ids)||args.evidence_ids.length>100||args.evidence_ids.some(id=>typeof id!=='string')||new Set(args.evidence_ids).size!==args.evidence_ids.length))throw Error('Choose up to100 unique supplemental source IDs');
  if(args.next_handoff!==undefined)requireText(args.next_handoff,'next_handoff',200);
  const timeout=normalizeTimeout({timeout_ms:args.timeout_ms,timeout_reason:args.timeout_reason});
  const reviewWindow=normalizeHandoverReviewWindow(args);
  const codeWindow=normalizeCodeReviewWindow(args);
  if (args.role==='runner') throw new Error('Choose a specialist role from company_open');
  binding(args,host);
  if(reviewWindow)withStore(args.root,db=>{const s=db.read();owner(s,args.session_id,host,args.epoch);if(!freshHandoverReviewEligible(s,args))throw Error('Review window is only for a fresh current paused streamed handover QA');});
  if(codeWindow)withStore(args.root,db=>{const s=db.read();owner(s,args.session_id,host,args.epoch);codeReviewWindowSubject(s,args,{root:args.root});});
  withStore(args.root,db=>{const s=db.read();owner(s,args.session_id,host,args.epoch);if(s.records?.[args.review_of]?.origin_quarantine_plan)throw Object.assign(Error('Use company_origin mechanical_review with the exact original grant'),{code:'ORIGIN_MECHANICAL_QA_FIXED_DISPATCH_REQUIRED'});if(args.model_selection!==undefined&&!['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.6.10','0.6.11','0.6.12','0.6.13','0.7.0','0.7.1','0.7.2','0.7.3','0.7.4','0.7.5','0.7.6','0.7.7','0.7.8',VERSION].includes(s.plugin_version))throw new Error('Explicitly adopt the model-selection team before using model_selection');});
  const inventory=args.model_selection?.mode==='explicit' || args.model_selection?.speed==='fast_disabled'?catalog(host):null;
  const selection=normalizeSelection(args.model_selection,host,inventory);
  const ready=check(host);
  if (!ready.available) throw new Error(ready.error);
  if (ready.authenticated===false) throw new Error(`${host} CLI is not signed in. Complete its normal login before starting specialists.`);
  const jobId=id('job');let retentionControl=null,retentionPreflight=null;
  const state=update(args,host,'job.queued',(s,store)=>{
    if(s.records?.[args.review_of]?.origin_quarantine_plan)throw Object.assign(Error('Use company_origin mechanical_review with the exact original grant'),{code:'ORIGIN_MECHANICAL_QA_FIXED_DISPATCH_REQUIRED'});
    if(s.paused && !handoverReviewEligible(s,args)&&!qualificationMaintenanceEligible(s,args)&&!scoped.scopedMaintenanceEligible(s,args)&&!operatingMaintenanceEligible(s,args)) throw new Error('Company is paused; only current handover QA or explicitly authorized read-only qualification may run');
    if(reviewWindow&&!freshHandoverReviewEligible(s,args))throw Error('Review window is only for a fresh current paused streamed handover QA');
    if(!Object.hasOwn(s.roles,args.role)) throw new Error('Role is absent from the pinned team catalog');
    const occupied=occupiedJobs(s);
    if(occupied.length>=3)throw new SchedulingHold(occupied.some(j=>!['queued','running'].includes(j.status))?'EXECUTION_UNCERTAIN':'CAPACITY_BUSY','Three assignments already active or uncertain; wait for confirmed process closure or a result');
    const codeSubject=codeWindow?codeReviewWindowSubject(s,args,{root:args.root}):null;
    const target=args.review_of && Object.hasOwn(s.records,args.review_of) ? s.records[args.review_of] : null;
    if(args.review_of && !target) throw new Error('Review target not found');
    const specialist=args.specialist_ref===undefined?null:prepareSpecialistAssignment(s,args,{reserve:true});
    const repair=resolveRetentionRepair(s,{...args,...timeout,...codeWindow},{root:args.root});
    const key=repair?retentionRepairSessionKey(repair.ticket):specialist?specialistSessionKey(args.role,specialist.binding):target ? `${args.role}:review:${target.id}:${target.revision}` : args.prototype_id ? `${args.role}:prototype:${jobId}` : args.development_id ? `${args.role}:development:${jobId}` : args.role;
    const qualification=Boolean(target?.context_qualification_target||target?.scoped_context_target);
    if(qualification&&(args.role!=='qa'||args.prototype_id||args.development_id||args.input_ids?.length||args.evidence_ids?.length))throw Error('Qualification requires separate bounded QA without extra inputs');
    let session=s.sessions[key];
    if(session && busy(s).some(j=>j.instance_id===session.instance_id)) throw new Error('This role session already has an assignment');
    if(session && session.host!==host) throw new Error('Role belongs to another host; perform company handover first');
    if(session && target?.author_instance===session.instance_id) throw new Error('Authors cannot independently review their own artifact');
    if(session && Object.values(s.jobs).some(j=>j.instance_id===session.instance_id && j.coordination_release?.termination_confirmed!==true && (!['completed','quarantined'].includes(j.status) || j.coordination?.resources?.length)))throw new Error('Prior role session execution is uncertain; inspect and confirm process closure before reusing or replacing it');
    if(session && (qualification || fresh || selectionKey(session.model_selection)!==selectionKey(selection))) {
      (s.retired_sessions??=[]).push({...session,retired_at:stamp(),reason:qualification?'qualification_fresh_node':fresh?'fresh_session_requested':'model_selection_changed',...(fresh?{fresh_session_reason:freshReason,replacement_job_id:jobId}:{})});session=null;
    }
    if(!session) session={instance_id:id(args.role),role:args.role,native_id:null,host,model_selection:selection,...(specialist?{specialist:specialist.binding}:{})};
    if(specialist){
      if(JSON.stringify(session.specialist)!==JSON.stringify(specialist.binding))throw Error('Specialist session binding changed');
    }else if(session.specialist!==undefined)throw Error('Generic role session cannot reuse a specialist profile');
    if(target?.author_instance===session.instance_id) throw new Error('Authors cannot independently review their own artifact');
    if(session.host!==host) throw new Error('Role belongs to another host; perform company handover first');
    if(args.input_ids!==undefined && !Array.isArray(args.input_ids))throw new Error('input_ids must be an array');
    const handoverInputs=qualification?[]:target?.handover?.input_refs?.map(r=>r.id)??[];
    const profileProducer=target?.job_id&&s.jobs[target.job_id]?.specialist!==undefined?s.jobs[target.job_id]:null;
    const nullableInputs=(specialist||profileProducer&&args.role==='qa')?usesSpecialistInputRevisions(s,{role:args.role,review_of:target?{id:args.review_of,revision:target.revision}:null,...(specialist?{specialist:specialist.binding}:{})}):false;
    const profileReviewInputs=[];
    if(profileProducer&&args.role==='qa'){
      if(profileProducer.artifact_id!==target.id)throw Error('Specialist review target lacks its exact producer output binding');
      specialistContext(s,profileProducer);
      for(const ref of profileProducer.inputs??[]){
        if(!s.records[ref.id]||(s.records[ref.id].revision??null)!==ref.revision)throw Error('Specialist producer input changed before independent review');
        profileReviewInputs.push(ref.id);
      }
    }
    const coordination=bindCoordination(s,args);
    const inputs=[...new Set([...(args.input_ids??[]),...retentionRepairContextInputs(s,args),...(specialist?.input_ids??[]),...handoverInputs,...profileReviewInputs,...(coordination?.dependencies??[]).map(d=>d.artifact_id)])];
    if(!Array.isArray(inputs) || inputs.some(k=>typeof k!=='string' || !Object.hasOwn(s.records,k))) throw new Error('An input record is missing');
    const job={...(repair?{retention_repair_id:repair.ticket.id}:{}),...(coordination?{coordination}:{}),...(args.expected_deliverable===undefined?{}:{expected_deliverable:args.expected_deliverable}),requester:{role:'runner',session_id:s.owner.session_id,host:s.owner.host,epoch:s.owner.epoch},id:jobId,role:args.role,session_key:key,instance_id:session.instance_id,native_id:session.native_id,host,epoch:s.owner.epoch,status:'queued',task:args.task,...(args.evidence_ids?{supplemental_sources:args.evidence_ids.map(key=>{const value=contextSource(s,key);if(!value)throw Error('Supplemental source missing');return recordReference(value,key);})}:{}),context_format:target?.context_classification_plan?.version===2?4:s.operating_state&&!target&&!args.prototype_id&&!args.development_id?6:3,...(args.context_scope?{context_scope:requireText(args.context_scope,'context_scope',160)}:{}),timeout_policy_version:TIMEOUT_POLICY_VERSION,...timeout,...(reviewWindow??{}),...(codeWindow?{...codeWindow,code_review_subject:codeSubject}:{}),model_selection:selection,cli_version:ready.version,task_summary:args.task_summary??null,next_handoff:args.next_handoff??null,...(inventory?{model_catalog:{source:inventory.source,...(selection.mode==='explicit'?{model:inventory.models.find(m=>m.id===selection.model)}:{}),speed_support:inventory.speed_support}}:{}),inputs:inputs.map(k=>({id:k,revision:nullableInputs?s.records[k].revision??null:s.records[k].revision})),review_of:target?{id:target.id,revision:target.revision}:null,...(args.prototype_id?{prototype_id:args.prototype_id}:{}),...(args.development_id?{development_id:args.development_id}:{}),created_at:stamp()};
    if(specialist)job.specialist=specialist.binding;
    if(args.output_contract!==undefined){if(args.output_contract!=='operating-proposal-v1'||job.context_format!==6)throw Error('Operating proposal contract requires an ordinary accepted-checkpoint assignment');job.output_contract=args.output_contract;}
    if(fresh)Object.assign(job,{fresh_session:true,fresh_session_reason:freshReason});
    recordRuntimeWorkerAssignmentFrom(store,s,job);
    s.sessions[key]=session;
    // Dependencies add explicit data after initial admission. Check that final
    // explicit set before context assembly adds mandatory governing evidence.
    if(specialist)prepareSpecialistAssignment(s,{...args,input_ids:inputs});
    prototypeAssignment(s,job,true);developmentAssignment(s,job,true,args.root);
    reviewContinuationAssignment(s,job,{reserve:true,root:args.root});
    if(repair)retentionControl=resolveRetentionRepair(s,job,{reserve:true,root:args.root}).control;
    const context=assignmentContext(s,job);
    if(repair)retentionPreflight=retentionReviewAdmissionPreflight(s,{...job,inputs:context.inputs,context_sha256:context.hash},context,{validateCurrent:()=>{retentionControl=resolveRetentionRepair(s,job,{reserve:true,root:args.root}).control;}}).commit;
    if(job.context_format===6){job.inputs=context.inputs;job.context_sha256=context.hash;admitOperatingAssignment(s,job);}
    if(specialist)prepareSpecialistAssignment(s,{...args,input_ids:inputs},{reserve:true});
    s.jobs[jobId]={...job,inputs:context.inputs,context_sha256:context.hash};
    s.runtime_version=VERSION;
  },null,(_db,next)=>{
    const bounds=[];
    if(retentionControl){assertRetentionRepairCommit(next,retentionControl);bounds.push({at:retentionControl.expires_at,message:'Original retention-review authority expired'});}
    if(retentionPreflight){
      assertRetentionReviewPreflightCommit(next,next.jobs[jobId],retentionPreflight);
      const window=retentionPreflight.code_review_window_minutes*60000;
      if(!Number.isSafeInteger(window)||window<=0)throw Error('Invalid retained fixed review window');
      // The existing fresh-window guard permits equality; integer millisecond
      // clocks first fail one millisecond after expiry minus the whole window.
      bounds.push({at:Date.parse(retentionPreflight.expires_at)-window+1,code:'REVIEW_PREFLIGHT_HELD',message:'Retention review held before any attempt was queued: precommit_geometry_changed'});
    }
    const continuation=next.records[next.jobs[jobId]?.review_of?.id];
    if(continuation?.development?.type==='review_continuation'){
      const proposal=continuation.development.proposal;assertReviewContinuationCommit(next,{owner:proposal.owner,expires_at:proposal.expires_at});
      const window=proposal.code_review_window_minutes*60000;if(!Number.isSafeInteger(window)||window<=0)throw Error('Invalid retained continuation review window');
      bounds.push({at:Date.parse(proposal.expires_at)-window+1,code:'SCOPE_WINDOW_UNAVAILABLE',message:'Insufficient authorized time for the complete fixed code review window'});
    }
    retainEngineCommitCutoff(_db,bounds);
  });
  try {
    const worker=launch(args.root,jobId);
    worker.on('error',error=>withStore(args.root,db=>db.transaction('job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;s.jobs[jobId].coordination_release={termination_confirmed:false,reason:'worker_spawn_failed_unverified',at:stamp()};notice(s,'must_know','Unable to start specialist session.',jobId);return s;})));
    worker.unref();
  } catch(error) {const escaped=cleanupRuntimeWorkerLaunchFailure(error);try{update(args,host,'job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;s.jobs[jobId].coordination_release={termination_confirmed:false,reason:'worker_not_started_unverified',at:stamp()};});}catch(failure){if(!escaped)throw failure;}throw error;}
  return mutationView(state.jobs[jobId],'job:'+jobId,'jobs');
}
// Trusted engine join ONLY. Public callers provide closed DATA; neither an
// ordinary dispatch flag nor a paused eligibility predicate can reserve this.
export function dispatchPeerOriginMechanicalReview(request,host,{launch=launchWorker,check=readiness,catalog=modelCatalog}={}){
 const args=qaData(request,['root','session_id','epoch','input']),input=qaData(args.input,['plan_id','grant_ref']);qaRef(input.grant_ref);
 qaNeed(['codex','claude'].includes(host)&&qaText(args.root,4000)&&path.isAbsolute(args.root)&&qaText(args.session_id,200)&&Number.isSafeInteger(args.epoch)&&args.epoch>0&&qaText(input.plan_id,200),'ORIGIN_MECHANICAL_QA_INPUT');binding(args,host);
 // Full original inventory/context/owner preflight comes BEFORE CLI probes.
 const selected=withStore(args.root,store=>store.readSnapshot(()=>{const s=store.read();owner(s,args.session_id,host,args.epoch);const p=originMechanicalQa.preparePeerOriginMechanicalQaDispatchFrom(store.db,s,{expected_epoch:args.epoch,grant_ref:input.grant_ref});qaNeed(p.plan_ref.id===input.plan_id,'ORIGIN_MECHANICAL_QA_PLAN_CHANGED');return p;}));
 const ready=check(host);qaNeed(ready?.available===true&&ready.authenticated===true,'ORIGIN_MECHANICAL_QA_CLI_UNAVAILABLE');
 const advertised=catalog(host),selection=normalizeSelection(selected.job_template.model_selection,host,advertised);qaNeed(qaSame(selection,selected.job_template.model_selection),'ORIGIN_MECHANICAL_QA_MODEL_SELECTION_CHANGED');
 let receipt,jobId;
 const state=withStore(args.root,store=>store.transaction('job.queued',s=>{
  owner(s,args.session_id,host,args.epoch);const fresh=originMechanicalQa.preparePeerOriginMechanicalQaDispatchFrom(store.db,s,{expected_epoch:args.epoch,grant_ref:input.grant_ref});qaNeed(qaSame(fresh,selected)&&fresh.plan_ref.id===input.plan_id,'ORIGIN_MECHANICAL_QA_DISPATCH_CHANGED');
  const job={...qaCopy(fresh.job_template),created_at:stamp(),cli_version:ready.version};jobId=job.id;qaNeed(!s.jobs[job.id]&&!s.sessions[job.session_key]&&job.native_id===null,'ORIGIN_MECHANICAL_QA_FRESH_JOB_REQUIRED');
  recordOriginalWorkerAssignmentFrom(store,s,job);
  receipt=originMechanicalQa.reservePeerOriginMechanicalQaFrom(store,s,job,{expected_epoch:args.epoch,grant_ref:input.grant_ref});
  s.jobs[job.id]=job;s.sessions[job.session_key]={instance_id:job.instance_id,role:job.role,host,native_id:null,model_selection:qaCopy(job.model_selection)};return s;
 },{beforeCommit:(_db,next)=>{originMechanicalQa.assertOriginalPeerOriginMechanicalQaReservationCommitFrom(store,next,receipt);}}));
 // The opaque reservation never leaves this SAME Store closure. A failed
 // final provider read/deadline rolls back before launch; no generic fallback.
 try{const worker=launch(args.root,jobId);worker.on('error',error=>withStore(args.root,store=>store.transaction('job.spawn_failed',s=>{const job=s.jobs[jobId];qaNeed(job?.status==='queued'&&!job.started_at,'ORIGIN_MECHANICAL_QA_JOB_CHANGED');job.status='failed';job.error=String(error.message).slice(0,1000);job.coordination_release={termination_confirmed:false,reason:'worker_spawn_failed_unverified',at:stamp()};return s;})));worker.unref();}
 catch(error){const escaped=cleanupOriginalWorkerLaunchFailure(error);try{withStore(args.root,store=>store.transaction('job.spawn_failed',s=>{const job=s.jobs[jobId];qaNeed(job?.status==='queued'&&!job.started_at,'ORIGIN_MECHANICAL_QA_JOB_CHANGED');job.status='failed';job.error=String(error.message).slice(0,1000);job.coordination_release={termination_confirmed:false,reason:'worker_not_started_unverified',at:stamp()};return s;}));}catch(failure){if(!escaped)throw failure;}throw error;}
 return mutationView(state.jobs[jobId],'job:'+jobId,'jobs');
}
function launchWorker(root,jobId){try{return withStore(root,store=>{
  let launch;
  store.transaction('job.worker_launch_requested',s=>{
    const job=s.jobs[jobId],bounds=[],repair=resolveRetentionRepair(s,job,{root});
    if(repair){
      assertRetentionRepairCommit(s,repair.control);const window=repair.proposal.code_review_window_minutes*60000;
      if(!Number.isSafeInteger(window)||window<=0)throw Error('Invalid retained fixed review window');
      bounds.push({at:Date.parse(repair.control.expires_at)-window+1,message:'Insufficient original time for the complete fixed retention review'});
    }
    const continuation=s.records[job?.review_of?.id];
    if(continuation?.development?.type==='review_continuation'){
      reviewContinuationAssignment(s,job,{root});const proposal=continuation.development.proposal;assertReviewContinuationCommit(s,{owner:proposal.owner,expires_at:proposal.expires_at});
      const window=proposal.code_review_window_minutes*60000;if(!Number.isSafeInteger(window)||window<=0)throw Error('Invalid retained continuation review window');
      bounds.push({at:Date.parse(proposal.expires_at)-window+1,code:'SCOPE_WINDOW_UNAVAILABLE',message:'Insufficient authorized time for the complete fixed code review window'});
    }
    retainEngineCommitCutoff(store.db,bounds);launch=prepareRuntimeWorkerLaunchFrom(store,s,{job_id:jobId,kind:'worker'});return s;
  });
  return spawnRuntimeWorkerLaunch(launch);
});}catch(error){cleanupLegacyRuntimeLaunchFailure(error);cleanupOriginalWorkerLaunchFailure(error);throw error;}}
// Internal runtime principal. No owner session is substituted into the public
// dispatch API: the exact canonical task and current runtime grant authorize
// this one queue transition, atomically with its attempt binding.
export function queueRuntimeTask(root,taskId,{launch=launchWorker,check=readiness,catalog=modelCatalog,runtime_instance_id,supervisor_pid}={}) {
  const snapshot=withStore(root,db=>readTaskState(db,{task_ids:[taskId],limit:1,semantic:true}).state);
  const task=taskRecord(snapshot,taskId),host=task.runtime_task.owner.host,spec=task.runtime_task.spec;
  const grant=runtimeGrant(snapshot,task),readyHost=check(host);
  if(runtime_instance_id!==undefined&&(grant.instance_id!==runtime_instance_id||snapshot.records['async-runtime-control'].runtime_control.pid!==supervisor_pid))throw new SchedulingHold('GENERATION_CHANGED','Supervisor generation changed before dispatch');
  if(!readyHost.available||readyHost.authenticated===false)throw new SchedulingHold('HOST_UNAVAILABLE',readyHost.error??'Selected host is not ready or authenticated');
  const inventory=spec.model_selection?.mode==='explicit'||spec.model_selection?.speed==='fast_disabled'?catalog(host):null;
  const selection=normalizeSelection(spec.model_selection,host,inventory),timeout=normalizeTimeout({timeout_ms:spec.timeout_ms,timeout_reason:spec.timeout_reason});
  const jobId=id('job'),instance=id(spec.role),sessionKey=spec.role+':async:'+jobId;
  const result=withStore(root,db=>db.transaction('task.job_queued',s=>{
    const record=taskRecord(s,taskId),current=runtimeGrant(s,record);
    if(runtime_instance_id!==undefined&&(current.instance_id!==runtime_instance_id||s.records['async-runtime-control'].runtime_control.pid!==supervisor_pid))throw new SchedulingHold('GENERATION_CHANGED','Supervisor generation changed before queue commit');
    if(JSON.stringify(current)!==JSON.stringify(grant))throw Error('Runtime task grant changed before queue commit');
    const ready=taskReady(s,record);if(!ready.ready)throw new SchedulingHold(ready.recovery?.code,ready.reason);
    const occupied=occupiedJobs(s);
    if(occupied.length>=3)throw new SchedulingHold(occupied.some(j=>!['queued','running'].includes(j.status))?'EXECUTION_UNCERTAIN':'CAPACITY_BUSY','Scheduling capacity occupied by active or uncertain processes');
    for(const jid of ready.required_context_jobs??[]){const prior=s.jobs[jid];if(prior?.context_sha256&&!contextMatches(s,prior,prior.context_sha256))throw new SchedulingHold('CONTEXT_CHANGED','Prerequisite task context is stale; inspect current evidence before continuing');}
    const specialist=spec.specialist_ref===undefined?null:prepareSpecialistAssignment(s,spec,{reserve:true});
    if(specialist&&ready.review_of)throw Error('Temporary specialist profiles cannot be independent review assignments');
    const target=ready.review_of?s.records[ready.review_of]:null;
    if(target?.author_instance===instance)throw Error('A task author cannot review its own result');
    const job={id:jobId,role:spec.role,session_key:sessionKey,instance_id:instance,native_id:null,host,epoch:s.owner.epoch,status:'queued',task:spec.task,
      requester:{role:'runtime',instance_id:grant.instance_id,task_id:taskId,owner_epoch:s.owner.epoch},
      runtime_task:{id:taskId,definition_revision:record.runtime_task.definition_revision,definition_sha256:record.runtime_task.definition_sha256},
      supplemental_sources:(spec.evidence_ids??[]).map(key=>recordReference(contextSource(s,key),key)),
      coordination:ready.coordination,context_format:taskContextFormat(spec),context_scope:spec.context_scope,expected_deliverable:spec.expected_deliverable,
      inputs:ready.input_ids.map(key=>({id:key,revision:s.records[key].revision??null})),review_of:target?{id:target.id,revision:target.revision}:null,
      timeout_policy_version:TIMEOUT_POLICY_VERSION,...timeout,model_selection:selection,cli_version:readyHost.version??null,task_summary:spec.expected_deliverable,next_handoff:'Runtime validates the exact result and wakes eligible dependent tasks',created_at:stamp(),
      ...(inventory?{model_catalog:{source:inventory.source,model:inventory.models.find(m=>m.id===selection.model),speed_support:inventory.speed_support}}:{})};
    if(specialist)job.specialist=specialist.binding;
    recordRuntimeWorkerAssignmentFrom(db,s,job);
    s.sessions[sessionKey]={instance_id:instance,role:spec.role,native_id:null,host,model_selection:selection,...(specialist?{specialist:specialist.binding}:{})};
    if(specialist)prepareSpecialistAssignment(s,{...spec,input_ids:ready.input_ids});
    const context=assignmentContext(s,job);job.inputs=context.inputs;job.context_sha256=context.hash;
    // Context assembly may add current constraints, but declared dependency
    // outputs must remain exact explicit inputs at the atomic attempt fence.
    bindTaskAttempt(s,record,job);
    if(specialist)prepareSpecialistAssignment(s,{...spec,input_ids:ready.input_ids},{reserve:true});
    s.jobs[jobId]=job;s.runtime_version=VERSION;
    return s;
  },{afterWrite:updateTaskIndex}));
  try{const child=launch(root,jobId);child.on('error',error=>withStore(root,db=>db.transaction('task.spawn_failed',s=>{const j=s.jobs[jobId];if(j?.status==='queued'){j.status='failed';j.error=error.message;j.coordination_release={termination_confirmed:false,reason:'worker_spawn_failed_unverified',at:stamp()};}return s;})));child.unref();}
  catch(error){const escaped=cleanupRuntimeWorkerLaunchFailure(error);try{withStore(root,db=>db.transaction('task.spawn_failed',s=>{const j=s.jobs[jobId];j.status='failed';j.error=error.message;j.coordination_release={termination_confirmed:false,reason:'worker_not_started_unverified',at:stamp()};return s;}));}catch(failure){if(!escaped)throw failure;}throw error;}
  return {task_id:taskId,job_id:jobId,instance_id:instance,status:result.jobs[jobId].status,native_id:null,native_identity:'not_observed_until_native_return'};
}
export function control(args,host) {
  if(!['pause','resume','handover','rename','reconcile_process_closure'].includes(args.action)) throw new Error('Unknown control action');
  binding(args,host);
  requireText(args.source_instruction,'source_instruction');
  if(args.action==='reconcile_process_closure'){
    if(Object.keys(args).some(k=>!['root','session_id','action','expected_epoch','source_instruction','job_id'].includes(k)))throw Error('Closure reconciliation accepts only the existing job identity, never process/proof assertions');
    requireText(args.job_id,'job_id',200);
    return withStore(args.root,db=>{let changed=false;const result=db.transaction('job.process_closure_reconciled',s=>{owner(s,args.session_id,host,args.expected_epoch);const job=s.jobs?.[args.job_id];changed=reconcileStoredModelProcessClosure(db,job);return s;});
      return {job_id:args.job_id,closure_reconciled:changed,termination_confirmed:result.jobs[args.job_id].coordination_release.termination_confirmed,status:result.jobs[args.job_id].status,original_failure:result.jobs[args.job_id].execution_failure??null,semantic_acceptance:false,execution_resumed:false,new_model_calls:0};});
  }
  if(args.job_id!==undefined)throw Error('job_id is only supported for process closure reconciliation');
  return withStore(args.root,db=>{const result=db.transaction(`company.${args.action}`,s=>{
    if (!s || ![1,SCHEMA].includes(s.schema)) throw new Error('Unsupported company version');
    if (args.action!=='pause') {
      if (!compatibleRuntime(s)) throw new Error('Use company_upgrade before resuming or handing over this version');
      if (upgradePending(s)) throw new Error('Finish or recover the pending team upgrade first');
      if (teamHash(s)!==s.team_sha256) throw new Error('Pinned team integrity check failed');
    }
    if(args.expected_epoch!==s.owner.epoch) throw new Error('Stale control request; read current status');
    const previousName=s.name;
    const decisionId=id('control');
    const decision={id:decisionId,kind:'decision',author_role:'human_founder',recorded_by:args.session_id,content:args.source_instruction,status:'Recorded',action:args.action,...(args.action==='rename'?{previous_name:previousName,name:args.name?.trim()}:{}),created_at:stamp()};
    // Pause is always available to a founder chat, even if the old coordinator failed.
    if(args.action==='pause') {
      s.paused=true; for(const j of busy(s)) j.status='cancelled';
      if (s.upgrade && ['queued','checking','ready','applied'].includes(s.upgrade.status)) {s.upgrade.status='failed';s.upgrade.error='Founder paused during upgrade; inspect and recover before retrying';}
    }
    else if(args.action==='handover') {
      if(busy(s).length) throw new Error('Assignments are active. Pause and reconcile them before handing over.');
      if(s.operating_state&&!mechanicalOperatingControl(decision))throw Error('Operating state Held: DIRTY condition-bearing handover instruction');
      const previous={...s.owner};
      const prospective=inheritSnapshots(s,{...s,owner:{host,session_id:args.session_id,epoch:s.owner.epoch+1},paused:true,records:{...s.records,[decisionId]:decision}});
      beginHandover(prospective,previous);
      const admission=admitHandover(prospective,s);
      s.owner=prospective.owner;s.handover={...prospective.handover,admission};
      // Incoming role instances cold-start from records; old native histories remain attributable.
      s.retired_sessions=[...(s.retired_sessions??[]),...Object.values(s.sessions)]; s.sessions={};
      s.paused=true;
    } else if(args.action==='rename') {
      owner(s,args.session_id,host);
      const name=requireText(args.name,'name',200).trim();
      requireText(args.expected_name,'expected_name',200);
      if(args.expected_name!==s.name) throw new Error('Company name changed; read current status before renaming');
      if(busy(s).length) throw new Error('Assignments are active; wait or pause before renaming');
      s.name=name;
    } else {owner(s,args.session_id,host);if(s.operating_state){
      // A condition-bearing instruction must not unpause work before its new
      // meaning is accepted. Check its actual audit record atomically too.
      operatingContext(s);
      if(!mechanicalOperatingControl(decision))throw Error('Operating state Held: DIRTY condition-bearing resume instruction');
    }const acceptance=verifyHandoverAcceptance(s);if(acceptance){s.handover.acceptance=acceptance;s.handover.status='completed';}s.paused=false;}
    s.records[decisionId]=decision;
    // A new handover gate must fence old coordinators even on an older pinned
    // team. Pause remains available across unsupported versions and must never
    // downgrade a future producer's fence.
    if(args.action!=='pause')s.runtime_version=VERSION;
    return s;
  });return args.action==='handover'?{...inspectHandover(result),paused:true,admission:result.handover.admission}:summary(result,args.root);});
}
export function notify(args,host) {
  if(!['must_know','decision_required'].includes(args.kind)) throw new Error('Unknown notice kind');
  requireText(args.summary,'summary');
  const s=update(args,host,'notice.created',s=>{Object.assign(notice(s,args.kind,args.summary,args.reference??null),{author_role:'runner',author_instance:s.owner.session_id,author_host:host,author_epoch:s.owner.epoch});});
  const n=s.notices.at(-1);return mutationView(n,'@public:notices:'+(s.notices.length-1),'notices');
}
export function acknowledge(args,host) {
  const state=update(args,host,'notice.updated',s=>{
    const n=s.notices.find(n=>n.id===args.notice_id); if(!n) throw new Error('Notice not found');
    if(args.resolution) {
      requireText(args.resolution,'resolution');requireText(args.source_reference,'source_reference');
      // Dispositions are consequential history. Exact replays are harmless;
      // a correction must be a new attributable notice referencing this one.
      if(n.resolution && (n.resolution.text!==args.resolution || n.resolution.source_reference!==args.source_reference))throw new Error('Notice resolution is immutable; record a correction in a new notice referencing this notice');
      n.resolution??={text:args.resolution,source_reference:args.source_reference,at:stamp(),recorded_by:args.session_id,host,epoch:s.owner.epoch};
    }
    if(args.seen && !n.seen_at) n.seen_at=stamp();
    // A notice receipt/resolution cannot authorize venture execution.
  });const index=state.notices.findIndex(n=>n.id===args.notice_id);return mutationView(state.notices[index],'@public:notices:'+index,'notices');
}
export function message(args,host) {
  requireText(args.content,'content');
  const s=update(args,host,'message.sent',s=>{if(!Object.hasOwn(s.roles,args.to)) throw new Error('Unknown recipient role');s.messages.push({id:id('message'),from:'runner',author_instance:s.owner.session_id,to:args.to,content:args.content,at:stamp()});});
  return mutationView(s.messages.at(-1),'@public:messages:'+(s.messages.length-1),'messages');
}

function readPublicState(db,id) {
  if(typeof id!=='string')throw Error('Supply an exact source id');
  if(id.startsWith('@public:')) {
    const [,family,...tail]=id.split(':'),key=tail.join(':');
    if(family==='team')return db.readSelected({rootKeys:['plugin_version','governance','governance_sha256','roles','cos_instructions'],entities:{}});
    if(['key','keyname'].includes(family)&&['records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(tail[0]))return db.readSelected({rootKeys:[],entities:{[tail[0]]:null}});
    if(family==='pinned'&&key==='context_classifications')return db.readSelected({rootKeys:[],entities:{context_classifications:null}});
    if(family==='pinned'&&['governance','cos_instructions','roles','owner','idea','name','id','plugin_version','runtime_version','team_sha256','governance_sha256','context_classifications'].includes(key))return db.readSelected({rootKeys:[key],entities:{}});
    if(family==='current'&&key==='handover')return db.readSelected({rootKeys:['handover'],entities:{}});
    if(family==='current'&&key==='upgrade')return db.readSelected({rootKeys:[],entities:{upgrade:null}});
    if(['records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(family))return db.readSelected({rootKeys:[],entities:{[family]:[key]}});
    throw Error('Unknown public source');
  }
  // Stable canonical notice identities need the complete notice ID census;
  // first-match aliases and record precedence cannot establish uniqueness.
  if(id.startsWith('notice:'))return db.readSelected({rootKeys:[],entities:{records:[id],notices:null}});
  if(id.startsWith('upgrade:'))return db.readSelected({rootKeys:[],entities:{records:[id],upgrade_history:null}});
  return db.readSelected({rootKeys:[],entities:{records:[id],...(id.startsWith('job:')?{jobs:[id.slice(4)]}:{})}});
}
function readPublicExact(db,args){return db.readSnapshot(()=>{
  const id=args.id;let location;
  if(typeof id!=='string')throw Error('Supply an exact source id');
  if(id.startsWith('notice:')){
    const state=readPublicState(db,id);
    if(!Object.hasOwn(state.records??{},id)&&isCanonicalNoticeSource(state,id))return exactRead(state,args);
    // A legacy record with this prefix retains its original raw read path when
    // it owns the storage key. A new colliding notice's distinct semantic hash
    // cannot borrow this raw record; explicit canonical selection still denies.
  }
  if(id.startsWith('@public:')){
    const [,family,...tail]=id.split(':'),key=tail.join(':');
    if(['records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(family))location={family,key};
    else if(['key','keyname'].includes(family)) {
      const [collection,hash]=tail;
      if(!['records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(collection))throw Error('Unknown public source');
      const stored=db.publicHandle(collection,hash);
      if(stored!==null) {
        const raw=db.readRawValue({family:collection,key:stored});
        if(!raw)throw Error('Missing or changed supplemental source');
        return family==='keyname'?exactTextRead(JSON.stringify(stored),args):exactTextRead(raw.raw,args,{revision:raw.revision});
      }
    }
    else if(family==='pinned'&&['governance','cos_instructions','roles','owner','idea','name','id','plugin_version','runtime_version','team_sha256','governance_sha256'].includes(key))location={family:'root',key};
    else if(family==='current'&&key==='handover')location={family:'root',key};
  }else{
    // Raw record keys have precedence over typed job aliases, just as publicSource.
    const record=db.readRawValue({family:'records',key:id});
    if(record)return exactTextRead(record.raw,args,{revision:record.revision});
    if(id.startsWith('job:'))location={family:'jobs',key:id.slice(4)};
    if(id.startsWith('upgrade:')) {
      const key=db.publicAlias('upgrade_history',id.slice(8));
      if(key!==undefined) {
        if(key!==null)location={family:'upgrade_history',key};
        else return exactRead(db.readPublicSelected({rootKeys:['upgrade'],entities:{upgrade:null}}),args);
      }
    }
  }
  if(location){const raw=db.readRawValue(location);if(raw){
    if(id.startsWith('upgrade:')&&raw.value_id!==id.slice(8))throw Error('Missing or changed supplemental source');
    return exactTextRead(raw.raw,args,{revision:raw.revision});
  }}
  return exactRead(readPublicState(db,id),args);
});}
// Explicit operations only. Neither API is called automatically on an existing company.
export function contextControl(args,host) {
  binding(args,host);
  if(args.frozen_intake!==undefined||args.home_intake_policy!==undefined||args.batching_policy!==undefined||args.semantic_partition?.context_policy!==undefined||args.semantic_partition?.shared_selection_ids!==undefined){
    if(args.delivery_schema!==undefined||args.raw_review_ids!==undefined||args.action!=='plan'||args.protocol!==scoped.SCOPED_PROTOCOL||args.partitioner!==scoped.CORPUS_PARTITIONER)throw Error('Physical/batching policy requires an explicit scoped corpus plan');
    return scopedControl(args,host);
  }
  if(args.unit_selection_schema!==undefined||args.current_home_inventory!==undefined||args.repair_of!==undefined||args.delivery_schema!==undefined||args.raw_review_ids!==undefined){
    if(args.action!=='target'||args.protocol!==undefined&&args.protocol!==scoped.SCOPED_PROTOCOL)throw Error('Corpus delivery options require a new scoped target');
    return scopedControl(args,host);
  }
  if(args.protocol===OPERATING_PROTOCOL){
    if(args.action==='inspect')return withStore(args.root,db=>db.readSnapshot(()=>operatingInspection(bindOperatingIntake(db.read(),db))));
    if(!['plan','apply'].includes(args.action))throw Error('Operating protocol supports inspect, plan or apply');
    let result;update(args,host,'operating.'+args.action,s=>{requireText(args.source_instruction,'source_instruction');result=args.action==='plan'?proposeOperatingState(s,args):publishOperatingState(s,args);});return result;
  }
  if(args.profile!==undefined&&(args.action!=='plan'||!args.source_id))throw Error('Qualification profile selects fresh source plans only; existing plans cannot be extended');
  if(args.action==='inspect'&&args.plan_id)return withStore(args.root,db=>{const s=db.read();return s.records[args.plan_id]?.scoped_context_plan?scoped.scopedPlanView(s,args):qualificationPlanView(s,args);});
  if(args.action==='read'&&args.snapshot)return withStore(args.root,db=>{
    const s=db.readSelected({rootKeys:[],entities:{}}),ref=snapshotReference(args.snapshot),offset=args.offset??0;
    if(!ref)throw Error('Exact immutable snapshot reference required');
    const total=ref.characters,raw=snapshotBytes(s,args.snapshot),split=index=>index>0&&index<total&&/[\uD800-\uDBFF]/.test(raw[index-1])&&/[\uDC00-\uDFFF]/.test(raw[index]);
    if(!Number.isSafeInteger(offset)||offset<0||offset>=total||split(offset))throw Error('Invalid immutable snapshot offset or surrogate boundary');
    let length=args.length??8000;
    if(!Number.isSafeInteger(length)||length<1||length>32768)throw Error('Invalid immutable snapshot range');
    length=Math.min(length,total-offset);
    while(length>0){
      if(split(offset+length)){length--;continue;}
      const text=raw.slice(offset,offset+length),r={snapshot:args.snapshot,offset,length,total,text,range_sha256:digest(text)};
      const next_offset=offset+r.length<total?offset+r.length:null,result={...r,next_offset,complete:next_offset===null,retrieval_only:true};
      if(fits(result))return result;length=Math.floor(length/2);
    }
    throw Error('Invalid or oversized immutable snapshot range');
  });
  if(args.action==='read'&&args.plan_id)return withStore(args.root,db=>{
    const s=db.read();if(s.records[args.plan_id]?.scoped_context_plan)return scoped.scopedPlanView(s,args);if(args.unit_id)return qualificationReadUnit(s,args);
    let length=args.length??8000;
    if(!Number.isSafeInteger(length)||length<1||length>32768)throw Error('Invalid qualification evidence range');
    while(length>0){
      let result;
      try{result=qualificationReadEvidence(s,{...args,offset:args.offset??0,length});}
      catch(error){if(error instanceof QualificationHold&&error.held.boundary==='evidence-read'){length=Math.floor(length/2);continue;}throw error;}
      const {end,total}=result.evidence,next_offset=end<total?end:null;
      result={...result,next_offset,complete:next_offset===null};
      if(fits(result))return result;length=Math.floor(length/2);
    }
    throw Error('Qualification source metadata exceeds public read budget');
  });
  if(args.action==='inspect')return withStore(args.root,db=>db.readSnapshot(()=>publicPage(db.publicState(),args)));
  if(args.action==='read')return withStore(args.root,db=>readPublicExact(db,args));
  if(args.protocol===undefined&&args.action==='revoke'&&args.plan_id&&withStore(args.root,db=>db.read().records[args.plan_id]?.context_classification_plan?.version===2)){
    update(args,host,'context.revoke',state=>{requireText(args.source_instruction,'source_instruction');const p=state.records[args.plan_id];if(!p.context_maintenance)throw Error('Represented plan has no maintenance grant');p.context_maintenance.revoked_at=stamp();p.context_maintenance.revocation_instruction=args.source_instruction;});
    return {revoked:true,plan_id:args.plan_id,readonly:true};
  }
  if(args.protocol===scoped.SCOPED_PROTOCOL||args.integration_review_id||args.phase)return scopedControl(args,host);
  if(args.action==='revoke'&&args.plan_id&&withStore(args.root,db=>Boolean(db.read().records[args.plan_id]?.scoped_context_plan)))return scopedControl(args,host);
  if(args.protocol!==undefined)throw Error('Unsupported context protocol');
  if(args.source_id||args.aggregate_review_id||['target','revoke'].includes(args.action))return qualificationControl(args,host);
  if(!['plan','apply'].includes(args.action))throw Error('Choose context inspect, read, plan or apply');
  const s=update(args,host,'context.'+args.action,state=>{
    requireText(args.source_instruction,'source_instruction');
    if(args.action==='plan'){
      const plan=contextPlan(state,args),key=id('context-plan');
      if(args.maintenance===true&&plan.version!==2)throw Error('Read-only maintenance requires represented v2 preservation');
      state.records[key]={id:key,kind:'plan',revision:1,status:'Draft',author_role:'runner',author_instance:args.session_id,content:'Proposed context applicability; not an authority or resolution by itself.',context_classification_plan:plan,...(args.maintenance===true?{context_maintenance:{readonly:true,owner:{...state.owner},controls_sha256:qualificationControlHash(state),source_instruction:args.source_instruction,at:stamp()}}:{}),source_reference:args.source_instruction,created_at:stamp()};
      state.context_last_plan=key;
    }else{
      const plan=state.records[args.plan_id],r=state.records[args.review_id],j=state.jobs[r?.job_id],v=r?.review;
      if(!plan?.context_classification_plan)throw Error('Context plan missing');
      if(plan.context_classification_plan.version===2){
        Object.assign(state.context_classifications??={},applyContextQualification(state,plan,r,{source_instruction:args.source_instruction,contextMatches}));
        return;
      }
      validateContextPlan(state,plan.context_classification_plan);
      if(r?.status!=='Submitted'||r.author_role!=='qa'||j?.status!=='completed'||r.review_of?.id!==plan.id||r.review_of?.revision!==plan.revision||v?.verdict!=='Pass'||v.permitted_action!=='apply_context_classification'||v.plan_sha256!==digest(JSON.stringify(plan.context_classification_plan))||!Array.isArray(v.blockers)||v.blockers.length||!j.native_id||r.author_instance===plan.author_instance||!contextMatches(state,j,j.context_sha256))throw Error('Fresh independent exact-plan classification Pass required');
      if(j.native_id===plan.author_instance||j.native_id===state.owner.session_id)throw Error('Classification must use a separate native reviewer');
      if(Object.values(state.records).some(x=>x.status==='Submitted'&&x.review_of?.id===plan.id&&x.review_of?.revision===plan.revision&&['Fail','Blocked'].includes(x.review?.verdict)))throw Error('Classification plan retains a negative review; prepare a repaired plan with the failure evidence');
      const c=plan.context_classification_plan;
      for(const ref of c.sources){
        const value=contextSource(state,ref.id);if(value?.author_instance===j.instance_id||value?.author_instance===j.native_id||state.jobs[value?.job_id]?.native_id===j.native_id)throw Error('Classification reviewer owns source evidence');
        if(state.records[ref.id]&&j.inputs.some(i=>i.id===ref.id&&i.revision===ref.revision))continue;
        const total=JSON.stringify(contextSource(state,ref.id)).length;let end=0;
        for(const read of (j.retrieved_inputs??[]).filter(r=>r.id===ref.id&&r.sha256===ref.sha256).sort((a,b)=>a.offset-b.offset)){if(read.offset>end)break;end=Math.max(end,read.offset+read.length);}
        if(end<total)throw Error('Classification reviewer did not receive complete exact source '+ref.id);
      }
      state.context_classifications??={};
      for(const source of c.sources)state.context_classifications[source.id]={source,disposition:c.disposition,roles:c.roles,scopes:c.scopes,plan:recordReference(plan),review:recordReference(r),source_instruction:args.source_instruction,at:stamp()};
    }
  });
  return args.action==='plan'?mutationView(s.records[s.context_last_plan],s.context_last_plan):{applied:true,response_format:'soloco-current-v2',records:publicPage(s,{collection:'records'}),classifications:publicPage(s,{collection:'context_classifications'}),note:'Stored metadata; current applicability is not validated by inspection. Applicability dispositions do not authorize execution'};
}

function scopedControl(args,host){
  if(!['plan','target','apply','revoke'].includes(args.action))throw Error('Choose scoped plan, target, apply or revoke');
  let result;
  update(args,host,'context.scoped.'+args.action,s=>{
    requireText(args.source_instruction,'source_instruction');
    if(args.action==='plan'){
      if(args.protocol!==scoped.SCOPED_PROTOCOL)throw Error('New scoped plans require explicit protocol:scoped-context-v1');
      const plan=scoped.captureScopedPlan(s,args),key=id('scoped-plan');
      s.records[key]={id:key,kind:'plan',revision:1,status:'Draft',author_role:'runner',author_instance:args.session_id,scoped_context_plan:plan,
        ...(args.maintenance===true?{context_maintenance:{readonly:true,owner:{...s.owner},controls_sha256:qualificationControlHash(s),source_instruction:args.source_instruction,at:stamp()}}:{}),source_reference:args.source_instruction,created_at:stamp()};
      result={id:key,...scoped.scopedPlanView(s,{plan_id:key})};
    }else if(args.action==='target'){
      const target=scoped.createScopedTarget(s,args);
      if(target.reused){result=target;return;}
      const key=id('scoped-target');s.records[key]={id:key,kind:'qualification_target',revision:1,status:'Draft',author_role:'runner',author_instance:args.session_id,scoped_context_target:target,source_reference:args.source_instruction,created_at:stamp()};
      result={id:key,source:recordReference(s.records[key]),target};
    }else if(args.action==='apply'){
      const proof=scoped.validateScopedApply(s,args);
      s.context_classifications??={};s.context_classifications[proof.source.id]={source:proof.source,disposition:'represented',plan:proof.plan,review:proof.integration,scoped_qualification:proof,source_instruction:args.source_instruction,at:stamp()};
      result={applied:true,source:proof.source,plan:proof.plan,review:proof.integration};
    }else {
      const p=s.records[args.plan_id];if(!p?.scoped_context_plan||!p.context_maintenance)throw Error('Scoped maintenance authorization missing');
      p.context_maintenance.revoked_at=stamp();p.context_maintenance.revocation_instruction=args.source_instruction;
      for(const j of busy(s))if(s.records[j.review_of?.id]?.scoped_context_target?.plan.id===p.id)j.status='cancelled';
      result={revoked:true,plan_id:p.id};
    }
  });return {...result,protocol:scoped.SCOPED_PROTOCOL,response_format:'soloco-current-v2'};
}

function qualificationControl(args,host){
  if(!['plan','target','apply','revoke'].includes(args.action))throw Error('Choose qualification plan, target, apply or revoke');
  let result;
  const state=update(args,host,'context.tree.'+args.action,s=>{
    requireText(args.source_instruction,'source_instruction');
    if(args.action==='plan'){
      const {original,plan,units}=captureQualificationPlan(s,args),key=id('context-plan');
      const refs=[plan.source,...plan.reviewed_subject.records.flatMap(r=>[r.ref,r.producer]),plan.producer].filter(Boolean);
      const originals=[...new Map(refs.map(ref=>[ref.id,ref])).values()].map(ref=>({source:ref,snapshot:retainSnapshot(s,resolveSnapshotEntry(s,contextSource(s,ref.id)))}));
      const record={id:key,kind:'plan',revision:1,status:'Draft',author_role:'runner',author_instance:args.session_id,content:'Exact historical preservation qualification; no resolution or business authority.',context_partition_plan:plan,
        context_originals:{source:originals.find(r=>r.source.id===plan.source.id).snapshot,subject:retainSnapshot(s,plan.reviewed_subject),inputs:originals},context_units:units,
        ...(args.maintenance===true?{context_maintenance:{readonly:true,owner:{...s.owner},controls_sha256:qualificationControlHash(s),source_instruction:args.source_instruction,at:stamp()}}:{}),source_reference:args.source_instruction,created_at:stamp()};
      if(record.context_originals.source.immutable_snapshot.sha256!==original.sha256)throw Error('Qualification original capture differs');
      s.records[key]=record;result={id:key,source:recordReference(record),protocol:plan.protocol,...qualificationWorkload(plan),roots:plan.roots,original:record.context_originals.source,subject:record.context_originals.subject,maintenance:args.maintenance===true,retrieval:'company_context inspect plan_id with section units/nodes; read snapshot or exact plan source'};
    }else if(args.action==='target'){
      const target=createQualificationTarget(s,args),key=id('context-target');
      s.records[key]={id:key,kind:'qualification_target',revision:1,status:'Draft',author_role:'runner',author_instance:args.session_id,context_qualification_target:target,source_reference:args.source_instruction,created_at:stamp()};
      result={id:key,source:recordReference(s.records[key]),target};
    }else if(args.action==='apply'){
      const proof=validateQualificationApply(s,args);
      s.context_classifications??={};s.context_classifications[proof.source.id]={source:proof.source,disposition:'represented',plan:proof.plan,review:proof.aggregate,partition_qualification:proof,source_instruction:args.source_instruction,at:stamp()};
      result={applied:true,source:proof.source,plan:proof.plan,review:proof.aggregate};
    }else{
      const p=s.records[args.plan_id];if(!p?.context_maintenance)throw Error('Read-only maintenance authorization missing');
      p.context_maintenance.revoked_at=stamp();p.context_maintenance.revocation_instruction=args.source_instruction;
      for(const j of busy(s))if(s.records[j.review_of?.id]?.context_qualification_target?.plan.id===p.id)j.status='cancelled';
      result={revoked:true,plan_id:p.id};
    }
  });
  return {...result,response_format:'soloco-current-v2',...(args.action==='apply'?{classifications:publicPage(state,{collection:'context_classifications'})}:{})};
}
export function storageControl(args,host) {
  binding(args,host);
  return withStore(args.root,db=>{
    if(args.action==='inspect')return db.storageInfo();
    if(!['migrate','backup','restore'].includes(args.action))throw Error('Choose storage inspect, migrate, backup or restore');
    const s=db.read();
    if(args.action==='migrate'&&s.schema===1){
      if(s.plugin_version!=='0.1.0'||s.mode!=='preparation'||s.runtime_version!==undefined&&!compatibleRuntime({...s,schema:SCHEMA})||digest(s.governance)!==s.governance_sha256)throw Error('Unsupported legacy company; separate migration required');
      if(!Number.isInteger(args.epoch)||s.owner.session_id!==args.session_id||s.owner.host!==host||s.owner.epoch!==args.epoch)throw Error('Current owner and epoch required for explicit storage migration');
      if(upgradePending(s))throw Error('Recover the pending upgrade before storage migration');
    }else owner(s,args.session_id,host,args.epoch);
    requireText(args.source_instruction,'source_instruction');
    if(!s.paused||busy(s).length)throw Error('Pause and reconcile before explicit storage migration');
    if(Object.values(s.jobs).some(j=>(j.status==='cancelled'&&!j.finished_at)||(j.timeout_reconciliation?.termination_confirmed===false&&!j.artifact_id)))throw Error('Uncertain worker execution must reach a terminal retained receipt before storage transfer or migration');
    if(args.action==='backup')return backupCompany(db,args.directory,{artifacts:args.artifacts});
    if(args.action==='restore'){const restored=restoreCompany(args.backup_dir,args.directory);return withStore(restored.directory,r=>{if(digest(JSON.stringify(r.read()))!==restored.manifest.state_sha256)throw Error('Restored company state differs from backup');return {...restored,readback_verified:true};});}
    return db.migrate();
  });
}
