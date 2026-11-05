import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { PACKAGE, VERSION, stamp, id, digest, folder, noLink, withStore, owner, notice, requireText, SCHEMA, installedTeam, teamHash, upgradePending, compatibleRuntime } from './store.mjs';
import { readiness, modelCatalog } from './adapters.mjs';
import { normalizeSelection, selectionKey, activityFor, selectionUsage } from './selection.mjs';
import { progressSnapshot, renderProgress } from './progress-view.mjs';
import { assignmentContext } from './context.mjs';
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
function summary(state) {
  const activity=activityFor(state).map(item=>{
    const job=state.jobs[item.job_id];
    if(!job || job.kind==='development_test' || job.type==='development_test')return item;
    return {...item,timeout:{policy_version:job.timeout_policy_version??null,timeout_ms:job.timeout_ms??null,reason:job.timeout_reason??null,execution_started_at:job.execution_started_at??null,execution_deadline_at:job.execution_deadline_at??null,state:jobTimeoutState(job,Date.now()),reconciliation:job.timeout_reconciliation??null,failure:job.execution_failure??null}};
  });
  return {company_id:state.id, name:state.name, idea:state.idea, revision:state.revision, phase:state.phase, mode:state.mode, paused:state.paused, owner:state.owner, plugin_version:state.plugin_version, runtime_version:state.runtime_version??state.plugin_version, executing_runtime_version:VERSION, upgrade:upgradeSummary(state.upgrade), governance_sha256:state.governance_sha256, records:Object.values(state.records), sessions:state.sessions, jobs:Object.values(state.jobs), activity, selection_usage:selectionUsage(state), notices:state.notices.filter(n=>!n.resolution), messages:state.messages, capabilities:{standalone_sessions:true, model_selection:{eligible:['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6',VERSION].includes(state.plugin_version),catalog:'company_doctor.models',coordinator_model:'Host UI controlled; no automatic switching',billing:'Existing host account; no hard spending enforcement'},local_prototype:prototypeCapability(state), local_development:developmentCapability(state), external_execution:false, background_founder_delivery:false, automatic_team_migration:false, explicit_team_upgrade:true}};
}
export function develop(args,host) { binding(args,host); return developmentAction(args,host); }
export function prototype(args,host) { binding(args,host); return prototypeAction(args,host); }
function update(args, host, type, fn) {
  binding(args,host);
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  return withStore(args.root, db => db.transaction(type, state => {owner(state,args.session_id,host,args.epoch); fn(state); return state;}));
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
  return {...summary(state),governance:state.governance, roles:state.roles, cos_instructions:state.cos_instructions};
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
    return summary(state);
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
  });
  return state.records[recordId];
}
export function dispatch(args,host) {
  requireText(args.task,'task');
  if (!Number.isInteger(args.epoch)) throw new Error('Supply the current ownership epoch from company_status');
  if(args.task_summary!==undefined)requireText(args.task_summary,'task_summary',160);
  if(args.expected_deliverable!==undefined)requireText(args.expected_deliverable,'expected_deliverable',300);
  if(args.next_handoff!==undefined)requireText(args.next_handoff,'next_handoff',200);
  const timeout=normalizeTimeout({timeout_ms:args.timeout_ms,timeout_reason:args.timeout_reason});
  if (args.role==='runner') throw new Error('Choose a specialist role from company_open');
  binding(args,host);
  withStore(args.root,db=>{const s=db.read();owner(s,args.session_id,host,args.epoch);if(args.model_selection!==undefined&&!['0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6',VERSION].includes(s.plugin_version))throw new Error('Explicitly adopt the model-selection team before using model_selection');});
  const catalog=args.model_selection?.mode==='explicit' || args.model_selection?.speed==='fast_disabled'?modelCatalog(host):null;
  const selection=normalizeSelection(args.model_selection,host,catalog);
  const check=readiness(host);
  if (!check.available) throw new Error(check.error);
  if (check.authenticated===false) throw new Error(`${host} CLI is not signed in. Complete its normal login before starting specialists.`);
  const jobId=id('job');
  const state=update(args,host,'job.queued',s=>{
    if(s.paused) throw new Error('Company is paused');
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
    const inputs=args.input_ids??[];
    if(!Array.isArray(inputs) || inputs.some(k=>typeof k!=='string' || !Object.hasOwn(s.records,k))) throw new Error('An input record is missing');
    const job={...(args.expected_deliverable===undefined?{}:{expected_deliverable:args.expected_deliverable}),requester:{role:'runner',session_id:s.owner.session_id,host:s.owner.host,epoch:s.owner.epoch},id:jobId,role:args.role,session_key:key,instance_id:session.instance_id,native_id:session.native_id,host,epoch:s.owner.epoch,status:'queued',task:args.task,context_format:2,timeout_policy_version:TIMEOUT_POLICY_VERSION,...timeout,model_selection:selection,cli_version:check.version,task_summary:args.task_summary??null,next_handoff:args.next_handoff??null,...(catalog?{model_catalog:{source:catalog.source,...(selection.mode==='explicit'?{model:catalog.models.find(m=>m.id===selection.model)}:{}),speed_support:catalog.speed_support}}:{}),inputs:inputs.map(k=>({id:k,revision:s.records[k].revision})),review_of:target?{id:target.id,revision:target.revision}:null,...(args.prototype_id?{prototype_id:args.prototype_id}:{}),...(args.development_id?{development_id:args.development_id}:{}),created_at:stamp()};
    prototypeAssignment(s,job,true);developmentAssignment(s,job,true);
    const context=assignmentContext(s,job);
    s.jobs[jobId]={...job,inputs:context.inputs,context_sha256:context.hash};
    s.runtime_version=VERSION;
  });
  try {
    const worker=spawn(process.execPath,['--no-warnings',path.join(PACKAGE,'runtime/worker.mjs'),folder(args.root),jobId],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'}});
    worker.on('error',error=>withStore(args.root,db=>db.transaction('job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;notice(s,'must_know','Unable to start specialist session.',jobId);return s;})));
    worker.unref();
  } catch(error) {update(args,host,'job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;});throw error;}
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
      s.owner={host,session_id:args.session_id,epoch:s.owner.epoch+1};
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
    } else {owner(s,args.session_id,host);s.paused=false;}
    const decisionId=id('control');
    s.records[decisionId]={id:decisionId,kind:'decision',author_role:'human_founder',recorded_by:args.session_id,content:args.source_instruction,status:'Recorded',action:args.action,...(args.action==='rename'?{previous_name:previousName,name:s.name}:{}),created_at:stamp()};
    return s;
  })));
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
