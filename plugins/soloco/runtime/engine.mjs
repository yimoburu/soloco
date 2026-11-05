import {backupCompany,restoreCompany} from './storage-transfer.mjs';
import {contextPlan,validateContextPlan,recordReference,contextRead,contextSource} from './current-state.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { PACKAGE, VERSION, stamp, id, digest, folder, noLink, withStore, owner, notice, requireText, SCHEMA, installedTeam, teamHash, upgradePending, compatibleRuntime } from './store.mjs';
import { readiness, modelCatalog } from './adapters.mjs';
import { normalizeSelection, selectionKey, activityFor, selectionUsage } from './selection.mjs';
import { normalizeCoordination, bindCoordination, resourceClaims } from './coordination.mjs';
import { progressSnapshot, renderProgress } from './progress-view.mjs';
import { beginHandover, submitReconstruction, handoverReviewEligible, verifyHandoverAcceptance, handoverSubject } from './handover.mjs';
import { assignmentContext, contextMatches } from './context.mjs';
import { developmentAction, developmentCapability, developmentAssignment } from './develop.mjs';
import { prototypeAction, prototypeCapability, prototypeAssignment } from './prototype.mjs';
import { TIMEOUT_POLICY_VERSION, normalizeTimeout, jobTimeoutState } from './timeout.mjs';

const busy = state => Object.values(state.jobs).filter(j => ['queued','running'].includes(j.status));
export function dataDir() {
  return process.env.COMPANY_PLUGIN_DATA || process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(),'.cache','soloco');
}
export function bind(root, session, host) {
  requireText(session,'session_id',200);
  const dir = path.join(dataDir(),'bindings');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file = path.join(dir,digest(JSON.stringify([folder(root),host,session]))+'.json');
  noLink(file);
  fs.writeFileSync(file,JSON.stringify({root:folder(root),host,session_id:session,at:stamp(),plugin_version:VERSION,plugin_root:PACKAGE,data_directory:dataDir()}),{mode:0o600});
}
export function binding(args, host) {
  requireText(args.session_id,'session_id',200);
  const file = path.join(dataDir(),'bindings',digest(JSON.stringify([folder(args.root),host,args.session_id]))+'.json');
  if (!fs.existsSync(file)) throw new Error('No startup-hook binding in this MCP data directory. Run company_doctor with root and session_id to distinguish missing discovery, stale project hooks, disabled/untrusted hooks, or a data-directory mismatch. Then reopen this chat and send a prompt.');
}
export function upgradeSummary(u) {
  if (!u) return null;
  const {checkpoint,previous,candidate,calls,deliveries,cos_pages,qa_pages,replays,evidence,...progress}=u;
  const total=key=>(calls??[]).reduce((sum,call)=>sum+(key==='prompt_characters'?call.budget?.prompt_characters??0:call[key]??0),0);
  const paging=evidence?{inventory_sha256:evidence.inventory_sha256,counts:evidence.counts,
    pages:evidence.pages.length,cos_pages:cos_pages?.length??0,qa_pages:qa_pages?.length??0,
    qa_blocked_pages:qa_pages?.filter(p=>p.artifact.review?.verdict!=='Pass').map(p=>p.page_id)??[],
    calls:calls?.length??0,replay_batches:replays?.length??0,prompt_characters:total('prompt_characters'),response_characters:total('response_characters'),
    token_estimate_only:true,context_fit_verified:false}:null;
  return {...progress,candidate_version:candidate.plugin_version,previous_version:previous.plugin_version,...(paging?{paging}:{})};
}
function summary(state,root=process.cwd()) {
  const activity=activityFor(state).map(item=>{
    const job=state.jobs[item.job_id];
    if(!job || job.kind==='development_test' || job.type==='development_test')return item;
    return {...item,timeout:{policy_version:job.timeout_policy_version??null,timeout_ms:job.timeout_ms??null,reason:job.timeout_reason??null,execution_started_at:job.execution_started_at??null,execution_deadline_at:job.execution_deadline_at??null,state:jobTimeoutState(job,Date.now()),reconciliation:job.timeout_reconciliation??null,failure:job.execution_failure??null}};
  });
  return {company_id:state.id, name:state.name, idea:state.idea, revision:state.revision, phase:state.phase, mode:state.mode, paused:state.paused, owner:state.owner, plugin_version:state.plugin_version, runtime_version:state.runtime_version??state.plugin_version, executing_runtime_version:VERSION, upgrade:upgradeSummary(state.upgrade), governance_sha256:state.governance_sha256, records:Object.values(state.records), sessions:state.sessions, jobs:Object.values(state.jobs), activity, handover:state.handover??null, resource_claims:resourceClaims(state), selection_usage:selectionUsage(state), notices:state.notices.filter(n=>!n.resolution), messages:state.messages, capabilities:{standalone_sessions:true, model_selection:{eligible:['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7',VERSION].includes(state.plugin_version),catalog:'company_doctor.models',coordinator_model:'Host UI controlled; no automatic switching',billing:'Existing host account; no hard spending enforcement'},local_prototype:prototypeCapability(state), local_development:developmentCapability(state,root), external_execution:false, background_founder_delivery:false, automatic_team_migration:false, explicit_team_upgrade:true}};
}
export function develop(args,host) { binding(args,host); return developmentAction(args,host); }
export function prototype(args,host) { binding(args,host); return prototypeAction(args,host); }
function update(args, host, type, fn, selection=null) {
  binding(args,host);
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  return withStore(args.root, db => {const mutate=state=>{owner(state,args.session_id,host,args.epoch);fn(state);return state;};return selection&&db.selectedTransaction?db.selectedTransaction(type,selection,mutate):db.transaction(type,mutate);});
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
  return {...summary(state,args.root),governance:state.governance, roles:state.roles, cos_instructions:state.cos_instructions};
}
export function status(args, host) {
  binding(args,host);
  return withStore(args.root, db => {
    let state=db.read();
    if (!state) throw new Error('Company initialization is incomplete; use company_open');
    const needsReconciliation=j=>['overdue','inspection'].includes(jobTimeoutState(j,Date.now()).state);
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
    const interruptedExports=Object.values(state.records).filter(r=>r.prototype?.export?.status==='writing' && Date.now()-Date.parse(r.prototype.export.started_at)>60000);
    if(interruptedExports.length) state=db.transaction('prototype.exports_interrupted',s=>{
      for(const r of interruptedExports) {
        if(s.records[r.id]?.prototype?.export?.status!=='writing') continue;
        s.records[r.id].prototype.export.status='failed';
        s.records[r.id].prototype.export.error='File creation was interrupted; inspect possible partial files before any new scope';
        notice(s,'must_know',s.records[r.id].prototype.export.error,r.id);
      }
      return s;
    });
    const noOverallDeadline=state.upgrade?.review_deadline_policy==='none' && state.upgrade.deadline_ms===null && state.upgrade.review_window_minutes===null;
    if (state.upgrade && ['queued','checking'].includes(state.upgrade.status) && !noOverallDeadline && Date.now()>=(state.upgrade.deadline_ms ?? Date.parse(state.upgrade.created_at)+420000)) {
      state=db.transaction('upgrade.interrupted',s=>{s.upgrade.status='failed';s.upgrade.error='Upgrade checks were interrupted or timed out; inspect and recover before retrying';notice(s,'must_know',s.upgrade.error,s.upgrade.id);return s;});
    }
    // Status is visible to a new founder chat so it can establish a handover.
    return summary(state,args.root);
  });
}
// Read only: unlike status, never reconciles jobs or writes receipts.
export function progress(args,host) {
  binding(args,host);
  if (!['json','html','text','mermaid'].includes(args.format ?? 'json')) throw new Error('Unknown progress format');
  if (args.recent_jobs !== undefined && (!Number.isInteger(args.recent_jobs) || args.recent_jobs < 1 || args.recent_jobs > 50)) throw new Error('recent_jobs must be 1 to 50');
  return withStore(args.root,db=>{
    const state=db.read();
    if (!state) throw new Error('Company initialization is incomplete; use company_open');
    const projection=progressSnapshot(state,{recentJobs:args.recent_jobs ?? 20});
    return args.format && args.format !== 'json' ? renderProgress(projection,args.format,{renderId:args.render_id}) : projection;
  });
}
export function save(args,host) {
  requireText(args.content,'content',100000);
  if (!['intent','plan','decision','preference','artifact'].includes(args.kind)) throw new Error('Unsupported record kind');
  if (args.kind==='preference' && (!['explicit','inferred'].includes(args.basis) || !args.source_reference)) throw new Error('Preferences need explicit/inferred basis and source_reference');
  const recordId=args.id ?? id(args.kind);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,200}$/.test(recordId) || ['constructor','prototype','__proto__'].includes(recordId)) throw new Error('Invalid record ID');
  const state=update(args,host,'record.saved',s=>{
    const old=s.records[recordId];
    if(old?.development) throw new Error('Development records are immutable; use company_develop');
    if(old?.prototype) throw new Error('Prototype records are immutable; use company_prototype or create a new scope');
    if (old && (old.author_instance!==s.owner.session_id || old.revision!==args.expected_revision)) throw new Error('Record owner or version conflict; create a new proposal instead');
    if (!old && args.expected_revision !== undefined && args.expected_revision !== 0) throw new Error('Record does not exist at expected version');
    s.records[recordId]={id:recordId,kind:args.kind,content:args.content,author_role:'runner',author_instance:s.owner.session_id,revision:(old?.revision??0)+1,status:'Draft',source_reference:args.source_reference??null,basis:args.basis??null,updated_at:stamp(),previous:old ? [...(old.previous??[]), {revision:old.revision,content:old.content,source_reference:old.source_reference}] : []};
    // An amended artifact never retains a review of its earlier version.
  },{rootKeys:['schema','runtime_version','plugin_version','team_sha256','owner','paused','roles','governance','governance_sha256','cos_instructions','revision','updated_at'],entities:{records:[recordId],upgrade:['status']}});
  return state.records[recordId];
}
export function handover(args,host) {
  if(args.action==='inspect'){binding(args,host);return withStore(args.root,db=>{const s=db.read();return {handover:s.handover??null,subject:handoverSubject(s)};});}
  if(args.action!=='submit')throw new Error('Choose inspect or submit');
  let result;update(args,host,'handover.reconstruction_submitted',s=>{result=submitReconstruction(s,args);});return result;
}
export function dispatch(args,host) {
  requireText(args.task,'task');
  normalizeCoordination(args);
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  if(args.task_summary!==undefined)requireText(args.task_summary,'task_summary',160);
  if(args.expected_deliverable!==undefined)requireText(args.expected_deliverable,'expected_deliverable',300);
  if(args.evidence_ids!==undefined&&(!Array.isArray(args.evidence_ids)||args.evidence_ids.length>100||args.evidence_ids.some(id=>typeof id!=='string')||new Set(args.evidence_ids).size!==args.evidence_ids.length))throw Error('Choose up to100 unique supplemental source IDs');
  if(args.next_handoff!==undefined)requireText(args.next_handoff,'next_handoff',200);
  const timeout=normalizeTimeout({timeout_ms:args.timeout_ms,timeout_reason:args.timeout_reason});
  if (args.role==='runner') throw new Error('Choose a specialist role from company_open');
  binding(args,host);
  withStore(args.root,db=>{const s=db.read();owner(s,args.session_id,host,args.epoch);if(args.model_selection!==undefined&&!['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7',VERSION].includes(s.plugin_version))throw new Error('Explicitly adopt the model-selection team before using model_selection');});
  const catalog=args.model_selection?.mode==='explicit' || args.model_selection?.speed==='fast_disabled'?modelCatalog(host):null;
  const selection=normalizeSelection(args.model_selection,host,catalog);
  const check=readiness(host);
  if (!check.available) throw new Error(check.error);
  if (check.authenticated===false) throw new Error(`${host} CLI is not signed in. Complete its normal login before starting specialists.`);
  const jobId=id('job');
  const state=update(args,host,'job.queued',s=>{
    if(s.paused && !handoverReviewEligible(s,args)) throw new Error('Company is paused; only current handover QA may run');
    if(!Object.hasOwn(s.roles,args.role)) throw new Error('Role is absent from the pinned team catalog');
    if(busy(s).length>=3) throw new Error('Three assignments already active; wait for a result');
    const target=args.review_of && Object.hasOwn(s.records,args.review_of) ? s.records[args.review_of] : null;
    if(args.review_of && !target) throw new Error('Review target not found');
    const key=target ? `${args.role}:review:${target.id}:${target.revision}` : args.prototype_id ? `${args.role}:prototype:${jobId}` : args.development_id ? `${args.role}:development:${jobId}` : args.role;
    let session=s.sessions[key];
    if(session && busy(s).some(j=>j.instance_id===session.instance_id)) throw new Error('This role session already has an assignment');
    if(session && selectionKey(session.model_selection)!==selectionKey(selection)) {
      (s.retired_sessions??=[]).push({...session,retired_at:stamp(),reason:'model_selection_changed'});session=null;
    }
    if(!session) session=s.sessions[key]={instance_id:id(args.role),role:args.role,native_id:null,host,model_selection:selection};
    if(target?.author_instance===session.instance_id) throw new Error('Authors cannot independently review their own artifact');
    if(session.host!==host) throw new Error('Role belongs to another host; perform company handover first');
    if(args.input_ids!==undefined && !Array.isArray(args.input_ids))throw new Error('input_ids must be an array');
    const handoverInputs=target?.handover?.input_refs?.map(r=>r.id)??[];
    const coordination=bindCoordination(s,args);
    const inputs=[...new Set([...(args.input_ids??[]),...handoverInputs,...(coordination?.dependencies??[]).map(d=>d.artifact_id)])];
    if(!Array.isArray(inputs) || inputs.some(k=>typeof k!=='string' || !Object.hasOwn(s.records,k))) throw new Error('An input record is missing');
    const job={...(coordination?{coordination}:{}),...(args.expected_deliverable===undefined?{}:{expected_deliverable:args.expected_deliverable}),requester:{role:'runner',session_id:s.owner.session_id,host:s.owner.host,epoch:s.owner.epoch},id:jobId,role:args.role,session_key:key,instance_id:session.instance_id,native_id:session.native_id,host,epoch:s.owner.epoch,status:'queued',task:args.task,...(args.evidence_ids?{supplemental_sources:args.evidence_ids.map(key=>{const value=contextSource(s,key);if(!value)throw Error('Supplemental source missing');return recordReference(value,key);})}:{}),context_format:3,...(args.context_scope?{context_scope:requireText(args.context_scope,'context_scope',160)}:{}),timeout_policy_version:TIMEOUT_POLICY_VERSION,...timeout,model_selection:selection,cli_version:check.version,task_summary:args.task_summary??null,next_handoff:args.next_handoff??null,...(catalog?{model_catalog:{source:catalog.source,...(selection.mode==='explicit'?{model:catalog.models.find(m=>m.id===selection.model)}:{}),speed_support:catalog.speed_support}}:{}),inputs:inputs.map(k=>({id:k,revision:s.records[k].revision})),review_of:target?{id:target.id,revision:target.revision}:null,...(args.prototype_id?{prototype_id:args.prototype_id}:{}),...(args.development_id?{development_id:args.development_id}:{}),created_at:stamp()};
    prototypeAssignment(s,job,true);developmentAssignment(s,job,true,args.root);
    const context=assignmentContext(s,job);
    s.jobs[jobId]={...job,inputs:context.inputs,context_sha256:context.hash};
    s.runtime_version=VERSION;
  });
  try {
    const worker=spawn(process.execPath,['--no-warnings',path.join(PACKAGE,'runtime/worker.mjs'),folder(args.root),jobId],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'}});
    worker.on('error',error=>withStore(args.root,db=>db.transaction('job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;s.jobs[jobId].coordination_release={termination_confirmed:true,reason:'worker_spawn_failed',at:stamp()};notice(s,'must_know','Unable to start specialist session.',jobId);return s;})));
    worker.unref();
  } catch(error) {update(args,host,'job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;s.jobs[jobId].coordination_release={termination_confirmed:true,reason:'worker_not_started',at:stamp()};});throw error;}
  return state.jobs[jobId];
}
export function control(args,host) {
  if(!['pause','resume','handover','rename'].includes(args.action)) throw new Error('Unknown control action');
  binding(args,host);
  requireText(args.source_instruction,'source_instruction');
  return withStore(args.root,db=>summary(db.transaction(`company.${args.action}`,s=>{
    if (!s || ![1,SCHEMA].includes(s.schema)) throw new Error('Unsupported company version');
    if (args.action!=='pause') {
      if (!compatibleRuntime(s)) throw new Error('Use company_upgrade before resuming or handing over this version');
      if (upgradePending(s)) throw new Error('Finish or recover the pending team upgrade first');
      if (teamHash(s)!==s.team_sha256) throw new Error('Pinned team integrity check failed');
    }
    if(args.expected_epoch!==s.owner.epoch) throw new Error('Stale control request; read current status');
    const previousName=s.name;
    // Pause is always available to a founder chat, even if the old coordinator failed.
    if(args.action==='pause') {
      s.paused=true; for(const j of busy(s)) j.status='cancelled';
      if (s.upgrade && ['queued','checking','ready','applied'].includes(s.upgrade.status)) {s.upgrade.status='failed';s.upgrade.error='Founder paused during upgrade; inspect and recover before retrying';}
    }
    else if(args.action==='handover') {
      if(busy(s).length) throw new Error('Assignments are active. Pause and reconcile them before handing over.');
      const previous={...s.owner};
      s.owner={host,session_id:args.session_id,epoch:s.owner.epoch+1};
      beginHandover(s,previous);
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
    } else {owner(s,args.session_id,host);const acceptance=verifyHandoverAcceptance(s);if(acceptance){s.handover.acceptance=acceptance;s.handover.status='completed';}s.paused=false;}
    const decisionId=id('control');
    s.records[decisionId]={id:decisionId,kind:'decision',author_role:'human_founder',recorded_by:args.session_id,content:args.source_instruction,status:'Recorded',action:args.action,...(args.action==='rename'?{previous_name:previousName,name:s.name}:{}),created_at:stamp()};
    return s;
  }),args.root));
}
export function notify(args,host) {
  if(!['must_know','decision_required'].includes(args.kind)) throw new Error('Unknown notice kind');
  requireText(args.summary,'summary');
  const s=update(args,host,'notice.created',s=>{notice(s,args.kind,args.summary,args.reference??null);});
  return s.notices.at(-1);
}
export function acknowledge(args,host) {
  return update(args,host,'notice.updated',s=>{
    const n=s.notices.find(n=>n.id===args.notice_id); if(!n) throw new Error('Notice not found');
    if(args.seen) n.seen_at=stamp();
    if(args.resolution) {requireText(args.source_reference,'source_reference'); n.resolution={text:args.resolution,source_reference:args.source_reference,at:stamp()};}
    // A notice receipt/resolution cannot authorize venture execution.
  }).notices.find(n=>n.id===args.notice_id);
}
export function message(args,host) {
  requireText(args.content,'content');
  const s=update(args,host,'message.sent',s=>{if(!Object.hasOwn(s.roles,args.to)) throw new Error('Unknown recipient role');s.messages.push({id:id('message'),from:'runner',author_instance:s.owner.session_id,to:args.to,content:args.content,at:stamp()});});
  return s.messages.at(-1);
}

// Explicit operations only. Neither API is called automatically on an existing company.
export function contextControl(args,host) {
  binding(args,host);
  if(args.action==='inspect')return withStore(args.root,db=>{
    const s=db.read();const offset=args.offset??0,limit=args.limit??50;
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid context index window');
    const records=[...Object.values(s.records).map(r=>recordReference(r)),...Object.values(s.jobs).map(j=>recordReference(j,'job:'+j.id)),...(s.upgrade_history??[]).map(u=>recordReference(u,'upgrade:'+u.id))];return {sources:records.slice(offset,offset+limit),total:records.length,offset,limit,classifications:Object.fromEntries(records.slice(offset,offset+limit).filter(r=>s.context_classifications?.[r.id]).map(r=>[r.id,s.context_classifications[r.id]]))};
  });
  if(args.action==='read')return withStore(args.root,db=>contextRead(db.read(),args));
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
  return args.action==='plan'?s.records[s.context_last_plan]:{classifications:s.context_classifications};
}
export function storageControl(args,host) {
  binding(args,host);
  return withStore(args.root,db=>{
    if(args.action==='inspect')return db.storageInfo();
    if(!['migrate','backup','restore'].includes(args.action))throw Error('Choose storage inspect, migrate, backup or restore');
    const s=db.read();owner(s,args.session_id,host,args.epoch);requireText(args.source_instruction,'source_instruction');
    if(!s.paused||busy(s).length)throw Error('Pause and reconcile before explicit storage migration');
    if(Object.values(s.jobs).some(j=>(j.status==='cancelled'&&!j.finished_at)||(j.timeout_reconciliation?.termination_confirmed===false&&!j.artifact_id)))throw Error('Uncertain worker execution must reach a terminal retained receipt before storage transfer or migration');
    if(args.action==='backup')return backupCompany(db,args.directory,{artifacts:args.artifacts});
    if(args.action==='restore'){const restored=restoreCompany(args.backup_dir,args.directory);return withStore(restored.directory,r=>{if(digest(JSON.stringify(r.read()))!==restored.manifest.state_sha256)throw Error('Restored company state differs from backup');return {...restored,readback_verified:true};});}
    return db.migrate();
  });
}
