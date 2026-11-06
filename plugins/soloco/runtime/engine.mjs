import {OPERATING_PROTOCOL,validateOperatingRecord,proposeOperatingState,publishOperatingState,operatingInspection,operatingMaintenanceEligible,operatingContext} from './operating-state.mjs';
import * as scoped from './scoped-context.mjs';
import { currentView, upgradeView, publicPage, exactRead, mutationView, sourceReference, itemView, controlView, storageSourceId, fits, exactTextRead } from './public-response.mjs';
import {backupCompany,restoreCompany} from './storage-transfer.mjs';
import {contextPlan,validateContextPlan,recordReference,contextSource} from './current-state.mjs';
import {captureQualificationPlan,createQualificationTarget,qualificationPlanView,qualificationReadUnit,qualificationReadEvidence,validateQualificationApply,qualificationMaintenanceEligible,qualificationControlHash,qualificationWorkload,QualificationHold} from './context-qualification.mjs';
import {inheritSnapshots,retainSnapshot,resolveSnapshotEntry,snapshotReference,snapshotBytes} from './snapshot.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { PACKAGE, VERSION, stamp, id, digest, folder, noLink, withStore, owner, notice, requireText, SCHEMA, installedTeam, teamHash, upgradePending, compatibleRuntime } from './store.mjs';
import { readiness, modelCatalog } from './adapters.mjs';
import { normalizeSelection, selectionKey } from './selection.mjs';
import { normalizeCoordination, bindCoordination } from './coordination.mjs';
import { progressSnapshot, renderProgress } from './progress-view.mjs';
import { beginHandover, submitReconstruction, handoverReviewEligible, freshHandoverReviewEligible, verifyHandoverAcceptance, handoverSubject, inspectHandover, reconstructionReceipt, admitHandover } from './handover.mjs';
import { assignmentContext, contextMatches } from './context.mjs';
import { developmentAction, developmentCapability, developmentAssignment } from './develop.mjs';
import { prototypeAction, prototypeCapability, prototypeAssignment } from './prototype.mjs';
import { TIMEOUT_POLICY_VERSION, normalizeTimeout, normalizeHandoverReviewWindow, jobTimeoutState } from './timeout.mjs';

const busy = state => Object.values(state.jobs??{}).filter(j => ['queued','running'].includes(j?.status));
export function dataDir() {
  return process.env.COMPANY_PLUGIN_DATA || process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(),'.cache','soloco');
}
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
export function develop(args,host) { binding(args,host); return developmentAction(args,host); }
export function prototype(args,host) { binding(args,host); return prototypeAction(args,host); }
function update(args, host, type, fn, selection=null) {
  binding(args,host);
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  return withStore(args.root, db => {const mutate=state=>{owner(state,args.session_id,host,args.epoch);fn(state);state.runtime_version=VERSION;return state;};return selection&&db.selectedTransaction?db.selectedTransaction(type,selection,mutate):db.transaction(type,mutate);});
}
export function open(args, host) {
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
  if (!['json','html','text','mermaid'].includes(args.format ?? 'json')) throw new Error('Unknown progress format');
  if (args.recent_jobs !== undefined && (!Number.isInteger(args.recent_jobs) || args.recent_jobs < 1 || args.recent_jobs > 50)) throw new Error('recent_jobs must be 1 to 50');
  if(args.action==='read')return readProgressArtifact(args,host);
  return withStore(args.root,db=>db.readSnapshot(()=>{
    const state=db.read();
    if (!state) throw new Error('Company initialization is incomplete; use company_open');
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
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,200}$/.test(recordId) || ['constructor','prototype','__proto__'].includes(recordId)) throw new Error('Invalid record ID');
  const state=update(args,host,'record.saved',s=>{
    const old=s.records[recordId];
    if(old?.handover)throw new Error('Handover reconstructions are immutable; submit a new reconstruction');
    if(old?.development) throw new Error('Development records are immutable; use company_develop');
    if(old?.prototype) throw new Error('Prototype records are immutable; use company_prototype or create a new scope');
    if (old && (old.author_instance!==s.owner.session_id || old.revision!==args.expected_revision)) throw new Error('Record owner or version conflict; create a new proposal instead');
    if (!old && args.expected_revision !== undefined && args.expected_revision !== 0) throw new Error('Record does not exist at expected version');
    s.records[recordId]={id:recordId,kind:args.kind,content:args.content,...(args.operating_record===undefined?{}:{operating_record:structuredClone(args.operating_record)}),...(args.context_obligations===undefined?{}:{context_obligations:structuredClone(args.context_obligations)}),author_role:'runner',author_instance:s.owner.session_id,revision:(old?.revision??0)+1,status:'Draft',source_reference:args.source_reference??null,basis:args.basis??null,updated_at:stamp(),previous:old ? [...(old.previous??[]), {revision:old.revision,content:old.content,source_reference:old.source_reference,...(old.operating_record?{operating_record:old.operating_record}:{}),...(old.context_obligations?{context_obligations:old.context_obligations}:{})}] : []};
    // An amended artifact never retains a review of its earlier version.
  },{rootKeys:['schema','runtime_version','plugin_version','team_sha256','owner','paused','roles','governance','governance_sha256','cos_instructions','revision','updated_at'],entities:{records:[recordId],upgrade:['status']}});
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
  normalizeCoordination(args);
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  if(args.task_summary!==undefined)requireText(args.task_summary,'task_summary',160);
  if(args.expected_deliverable!==undefined)requireText(args.expected_deliverable,'expected_deliverable',300);
  if(args.evidence_ids!==undefined&&(!Array.isArray(args.evidence_ids)||args.evidence_ids.length>100||args.evidence_ids.some(id=>typeof id!=='string')||new Set(args.evidence_ids).size!==args.evidence_ids.length))throw Error('Choose up to100 unique supplemental source IDs');
  if(args.next_handoff!==undefined)requireText(args.next_handoff,'next_handoff',200);
  const timeout=normalizeTimeout({timeout_ms:args.timeout_ms,timeout_reason:args.timeout_reason});
  const reviewWindow=normalizeHandoverReviewWindow(args);
  if (args.role==='runner') throw new Error('Choose a specialist role from company_open');
  binding(args,host);
  if(reviewWindow)withStore(args.root,db=>{const s=db.read();owner(s,args.session_id,host,args.epoch);if(!freshHandoverReviewEligible(s,args))throw Error('Review window is only for a fresh current paused streamed handover QA');});
  withStore(args.root,db=>{const s=db.read();owner(s,args.session_id,host,args.epoch);if(args.model_selection!==undefined&&!['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.6.8','0.6.9','0.6.10','0.6.11','0.6.12','0.6.13','0.7.0','0.7.1','0.7.2',VERSION].includes(s.plugin_version))throw new Error('Explicitly adopt the model-selection team before using model_selection');});
  const inventory=args.model_selection?.mode==='explicit' || args.model_selection?.speed==='fast_disabled'?catalog(host):null;
  const selection=normalizeSelection(args.model_selection,host,inventory);
  const ready=check(host);
  if (!ready.available) throw new Error(ready.error);
  if (ready.authenticated===false) throw new Error(`${host} CLI is not signed in. Complete its normal login before starting specialists.`);
  const jobId=id('job');
  const state=update(args,host,'job.queued',s=>{
    if(s.paused && !handoverReviewEligible(s,args)&&!qualificationMaintenanceEligible(s,args)&&!scoped.scopedMaintenanceEligible(s,args)&&!operatingMaintenanceEligible(s,args)) throw new Error('Company is paused; only current handover QA or explicitly authorized read-only qualification may run');
    if(reviewWindow&&!freshHandoverReviewEligible(s,args))throw Error('Review window is only for a fresh current paused streamed handover QA');
    if(!Object.hasOwn(s.roles,args.role)) throw new Error('Role is absent from the pinned team catalog');
    if(busy(s).length>=3) throw new Error('Three assignments already active; wait for a result');
    const target=args.review_of && Object.hasOwn(s.records,args.review_of) ? s.records[args.review_of] : null;
    if(args.review_of && !target) throw new Error('Review target not found');
    const key=target ? `${args.role}:review:${target.id}:${target.revision}` : args.prototype_id ? `${args.role}:prototype:${jobId}` : args.development_id ? `${args.role}:development:${jobId}` : args.role;
    const qualification=Boolean(target?.context_qualification_target||target?.scoped_context_target);
    if(qualification&&(args.role!=='qa'||args.prototype_id||args.development_id||args.input_ids?.length||args.evidence_ids?.length))throw Error('Qualification requires separate bounded QA without extra inputs');
    let session=s.sessions[key];
    if(session && busy(s).some(j=>j.instance_id===session.instance_id)) throw new Error('This role session already has an assignment');
    if(session && session.host!==host) throw new Error('Role belongs to another host; perform company handover first');
    if(session && target?.author_instance===session.instance_id) throw new Error('Authors cannot independently review their own artifact');
    if(fresh && session && Object.values(s.jobs).some(j=>j.instance_id===session.instance_id && j.coordination_release?.termination_confirmed!==true && (!['completed','quarantined'].includes(j.status) || j.coordination?.resources?.length)))throw new Error('Prior role session execution is uncertain; inspect and confirm process closure before requesting a fresh session');
    if(session && (qualification || fresh || selectionKey(session.model_selection)!==selectionKey(selection))) {
      (s.retired_sessions??=[]).push({...session,retired_at:stamp(),reason:qualification?'qualification_fresh_node':fresh?'fresh_session_requested':'model_selection_changed',...(fresh?{fresh_session_reason:freshReason,replacement_job_id:jobId}:{})});session=null;
    }
    if(!session) session=s.sessions[key]={instance_id:id(args.role),role:args.role,native_id:null,host,model_selection:selection};
    if(target?.author_instance===session.instance_id) throw new Error('Authors cannot independently review their own artifact');
    if(session.host!==host) throw new Error('Role belongs to another host; perform company handover first');
    if(args.input_ids!==undefined && !Array.isArray(args.input_ids))throw new Error('input_ids must be an array');
    const handoverInputs=qualification?[]:target?.handover?.input_refs?.map(r=>r.id)??[];
    const coordination=bindCoordination(s,args);
    const inputs=[...new Set([...(args.input_ids??[]),...handoverInputs,...(coordination?.dependencies??[]).map(d=>d.artifact_id)])];
    if(!Array.isArray(inputs) || inputs.some(k=>typeof k!=='string' || !Object.hasOwn(s.records,k))) throw new Error('An input record is missing');
    const job={...(coordination?{coordination}:{}),...(args.expected_deliverable===undefined?{}:{expected_deliverable:args.expected_deliverable}),requester:{role:'runner',session_id:s.owner.session_id,host:s.owner.host,epoch:s.owner.epoch},id:jobId,role:args.role,session_key:key,instance_id:session.instance_id,native_id:session.native_id,host,epoch:s.owner.epoch,status:'queued',task:args.task,...(args.evidence_ids?{supplemental_sources:args.evidence_ids.map(key=>{const value=contextSource(s,key);if(!value)throw Error('Supplemental source missing');return recordReference(value,key);})}:{}),context_format:s.operating_state&&!target&&!args.prototype_id&&!args.development_id?6:3,...(args.context_scope?{context_scope:requireText(args.context_scope,'context_scope',160)}:{}),timeout_policy_version:TIMEOUT_POLICY_VERSION,...timeout,...(reviewWindow??{}),model_selection:selection,cli_version:ready.version,task_summary:args.task_summary??null,next_handoff:args.next_handoff??null,...(inventory?{model_catalog:{source:inventory.source,...(selection.mode==='explicit'?{model:inventory.models.find(m=>m.id===selection.model)}:{}),speed_support:inventory.speed_support}}:{}),inputs:inputs.map(k=>({id:k,revision:s.records[k].revision})),review_of:target?{id:target.id,revision:target.revision}:null,...(args.prototype_id?{prototype_id:args.prototype_id}:{}),...(args.development_id?{development_id:args.development_id}:{}),created_at:stamp()};
    if(fresh)Object.assign(job,{fresh_session:true,fresh_session_reason:freshReason});
    prototypeAssignment(s,job,true);developmentAssignment(s,job,true,args.root);
    const context=assignmentContext(s,job);
    s.jobs[jobId]={...job,inputs:context.inputs,context_sha256:context.hash};
    s.runtime_version=VERSION;
  });
  try {
    const worker=launch(args.root,jobId);
    worker.on('error',error=>withStore(args.root,db=>db.transaction('job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;s.jobs[jobId].coordination_release={termination_confirmed:true,reason:'worker_spawn_failed',at:stamp()};notice(s,'must_know','Unable to start specialist session.',jobId);return s;})));
    worker.unref();
  } catch(error) {update(args,host,'job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;s.jobs[jobId].coordination_release={termination_confirmed:true,reason:'worker_not_started',at:stamp()};});throw error;}
  return mutationView(state.jobs[jobId],'job:'+jobId,'jobs');
}
function launchWorker(root,jobId){return spawn(process.execPath,['--no-warnings',path.join(PACKAGE,'runtime/worker.mjs'),folder(root),jobId],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'}});}
export function control(args,host) {
  if(!['pause','resume','handover','rename'].includes(args.action)) throw new Error('Unknown control action');
  binding(args,host);
  requireText(args.source_instruction,'source_instruction');
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
      const previous={...s.owner};
      const prospective=inheritSnapshots(s,{...s,owner:{host,session_id:args.session_id,epoch:s.owner.epoch+1},paused:true,records:{...s.records,[decisionId]:decision}});
      beginHandover(prospective,previous);
      const admission=admitHandover(prospective);
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
    } else {owner(s,args.session_id,host);if(s.operating_state)operatingContext(s);const acceptance=verifyHandoverAcceptance(s);if(acceptance){s.handover.acceptance=acceptance;s.handover.status='completed';}s.paused=false;}
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
  const s=update(args,host,'notice.created',s=>{notice(s,args.kind,args.summary,args.reference??null);});
  const n=s.notices.at(-1);return mutationView(n,'@public:notices:'+(s.notices.length-1),'notices');
}
export function acknowledge(args,host) {
  const state=update(args,host,'notice.updated',s=>{
    const n=s.notices.find(n=>n.id===args.notice_id); if(!n) throw new Error('Notice not found');
    if(args.seen) n.seen_at=stamp();
    if(args.resolution) {requireText(args.source_reference,'source_reference'); n.resolution={text:args.resolution,source_reference:args.source_reference,at:stamp()};}
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
  if(id.startsWith('upgrade:'))return db.readSelected({rootKeys:[],entities:{records:[id],upgrade_history:null}});
  return db.readSelected({rootKeys:[],entities:{records:[id],...(id.startsWith('job:')?{jobs:[id.slice(4)]}:{})}});
}
function readPublicExact(db,args){return db.readSnapshot(()=>{
  const id=args.id;let location;
  if(typeof id!=='string')throw Error('Supply an exact source id');
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
  if(args.protocol===OPERATING_PROTOCOL){
    if(args.action==='inspect')return withStore(args.root,db=>db.readSnapshot(()=>operatingInspection(db.read())));
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
  if(args.protocol===scoped.SCOPED_PROTOCOL||args.integration_review_id||args.phase)return scopedControl(args,host);
  if(args.action==='revoke'&&args.plan_id&&withStore(args.root,db=>Boolean(db.read().records[args.plan_id]?.scoped_context_plan)))return scopedControl(args,host);
  if(args.protocol!==undefined)throw Error('Unsupported context protocol');
  if(args.source_id||args.aggregate_review_id||['target','revoke'].includes(args.action))return qualificationControl(args,host);
  if(!['plan','apply'].includes(args.action))throw Error('Choose context inspect, read, plan or apply');
  const s=update(args,host,'context.'+args.action,state=>{
    requireText(args.source_instruction,'source_instruction');
    if(args.action==='plan'){
      const plan=contextPlan(state,args),key=id('context-plan');
      state.records[key]={id:key,kind:'plan',revision:1,status:'Draft',author_role:'runner',author_instance:args.session_id,content:'Proposed context applicability; not an authority or resolution by itself.',context_classification_plan:plan,source_reference:args.source_instruction,created_at:stamp()};
      state.context_last_plan=key;
    }else{
      const plan=state.records[args.plan_id],r=state.records[args.review_id],j=state.jobs[r?.job_id],v=r?.review;
      if(!plan?.context_classification_plan)throw Error('Context plan missing');
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
