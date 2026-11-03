import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { PACKAGE, VERSION, stamp, id, digest, folder, noLink, withStore, owner, notice, requireText, SCHEMA, installedTeam, teamHash, upgradePending } from './store.mjs';
import { readiness, roles } from './adapters.mjs';

const busy = state => Object.values(state.jobs).filter(j => ['queued','running'].includes(j.status));
export function dataDir() {
  return process.env.COMPANY_PLUGIN_DATA || process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(),'.cache','ai-operated-startup');
}
export function bind(root, session, host) {
  requireText(session,'session_id',200);
  const dir = path.join(dataDir(),'bindings');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file = path.join(dir,digest(JSON.stringify([folder(root),host,session]))+'.json');
  noLink(file);
  fs.writeFileSync(file,JSON.stringify({root:folder(root),host,session_id:session,at:stamp()}),{mode:0o600});
}
export function binding(args, host) {
  requireText(args.session_id,'session_id',200);
  const file = path.join(dataDir(),'bindings',digest(JSON.stringify([folder(args.root),host,args.session_id]))+'.json');
  if (!fs.existsSync(file)) throw new Error('No trusted startup-hook binding for this chat. Enable/trust Company hooks, then reopen this chat.');
}
export function upgradeSummary(u) {
  if (!u) return null;
  const {checkpoint,previous,candidate,...progress}=u;
  return {...progress,candidate_version:candidate.plugin_version,previous_version:previous.plugin_version};
}
function summary(state) {
  return {company_id:state.id, name:state.name, idea:state.idea, revision:state.revision, phase:state.phase, mode:state.mode, paused:state.paused, owner:state.owner, plugin_version:state.plugin_version, runtime_version:state.runtime_version??state.plugin_version, upgrade:upgradeSummary(state.upgrade), governance_sha256:state.governance_sha256, records:Object.values(state.records), sessions:state.sessions, jobs:Object.values(state.jobs), notices:state.notices.filter(n=>!n.resolution), messages:state.messages, capabilities:{standalone_sessions:true, external_execution:false, background_founder_delivery:false, automatic_team_migration:false, explicit_team_upgrade:true}};
}
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
    return db.transaction('company.created', () => ({schema:SCHEMA,runtime_version:VERSION,id:id('company'),name:requireText(args.name ?? path.basename(args.root),'name',200),idea:requireText(args.idea,'idea'),phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host,session_id:args.session_id,epoch:1},records:{},sessions:{},jobs:{},messages:[],notices:[],created_at:stamp()}));
  }, true);
  return {...summary(state),governance:state.governance, roles:state.roles, cos_instructions:state.cos_instructions};
}
export function status(args, host) {
  binding(args,host);
  return withStore(args.root, db => {
    let state=db.read();
    if (!state) throw new Error('Company initialization is incomplete; use company_open');
    const expired=busy(state).filter(j=>Date.now()-Date.parse(j.created_at)>240000);
    if (expired.length) state=db.transaction('jobs.interrupted', s=>{
      for (const job of expired) {s.jobs[job.id].status='interrupted'; notice(s,'must_know','A role session did not finish; inspect before retrying.',job.id);}
      return s;
    });
    if (state.upgrade && ['queued','checking'].includes(state.upgrade.status) && Date.now()-Date.parse(state.upgrade.created_at)>420000) {
      state=db.transaction('upgrade.interrupted',s=>{s.upgrade.status='failed';s.upgrade.error='Upgrade checks were interrupted or timed out; inspect and recover before retrying';notice(s,'must_know',s.upgrade.error,s.upgrade.id);return s;});
    }
    // Status is visible to a new founder chat so it can establish a handover.
    return summary(state);
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
    if (old && (old.author_instance!==s.owner.session_id || old.revision!==args.expected_revision)) throw new Error('Record owner or version conflict; create a new proposal instead');
    if (!old && args.expected_revision !== undefined && args.expected_revision !== 0) throw new Error('Record does not exist at expected version');
    s.records[recordId]={id:recordId,kind:args.kind,content:args.content,author_role:'runner',author_instance:s.owner.session_id,revision:(old?.revision??0)+1,status:'Draft',source_reference:args.source_reference??null,basis:args.basis??null,updated_at:stamp(),previous:old ? [...(old.previous??[]), {revision:old.revision,content:old.content,source_reference:old.source_reference}] : []};
    // An amended artifact never retains a review of its earlier version.
  });
  return state.records[recordId];
}
export function dispatch(args,host) {
  requireText(args.task,'task');
  if (!Object.hasOwn(roles,args.role) || args.role==='runner') throw new Error('Choose a specialist role from company_open');
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
    const key=target ? `${args.role}:review:${target.id}:${target.revision}` : args.role;
    let session=s.sessions[key];
    if(!session) session=s.sessions[key]={instance_id:id(args.role),role:args.role,native_id:null,host};
    if(target?.author_instance===session.instance_id) throw new Error('Authors cannot independently review their own artifact');
    if(busy(s).some(j=>j.instance_id===session.instance_id)) throw new Error('This role session already has an assignment');
    if(session.host!==host) throw new Error('Role belongs to another host; perform company handover first');
    const inputs=args.input_ids??[];
    if(!Array.isArray(inputs) || inputs.some(k=>typeof k!=='string' || !Object.hasOwn(s.records,k))) throw new Error('An input record is missing');
    s.jobs[jobId]={id:jobId,role:args.role,session_key:key,instance_id:session.instance_id,native_id:session.native_id,host,epoch:s.owner.epoch,status:'queued',task:args.task,inputs:inputs.map(k=>({id:k,revision:s.records[k].revision})),review_of:target?{id:target.id,revision:target.revision}:null,created_at:stamp()};
  });
  try {
    const worker=spawn(process.execPath,['--no-warnings',path.join(PACKAGE,'runtime/worker.mjs'),folder(args.root),jobId],{detached:true,stdio:'ignore',env:{...process.env,COMPANY_WORKER:'1'}});
    worker.on('error',error=>withStore(args.root,db=>db.transaction('job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;notice(s,'must_know','Unable to start specialist session.',jobId);return s;})));
    worker.unref();
  } catch(error) {update(args,host,'job.spawn_failed',s=>{s.jobs[jobId].status='failed';s.jobs[jobId].error=error.message;});throw error;}
  return state.jobs[jobId];
}
export function control(args,host) {
  if(!['pause','resume','handover'].includes(args.action)) throw new Error('Unknown control action');
  binding(args,host);
  requireText(args.source_instruction,'source_instruction');
  return withStore(args.root,db=>summary(db.transaction(`company.${args.action}`,s=>{
    if (!s || ![1,SCHEMA].includes(s.schema)) throw new Error('Unsupported company version');
    if (args.action!=='pause') {
      if (s.schema!==SCHEMA || s.runtime_version!==VERSION) throw new Error('Use company_upgrade before resuming or handing over this version');
      if (upgradePending(s)) throw new Error('Finish or recover the pending team upgrade first');
      if (teamHash(s)!==s.team_sha256) throw new Error('Pinned team integrity check failed');
    }
    if(args.expected_epoch!==s.owner.epoch) throw new Error('Stale control request; read current status');
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
    } else {owner(s,args.session_id,host);s.paused=false;}
    const decisionId=id('control');
    s.records[decisionId]={id:decisionId,kind:'decision',author_role:'human_founder',recorded_by:args.session_id,content:args.source_instruction,status:'Recorded',action:args.action,created_at:stamp()};
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
  if(!Object.hasOwn(roles,args.to)) throw new Error('Unknown recipient role');
  const s=update(args,host,'message.sent',s=>{s.messages.push({id:id('message'),from:'runner',author_instance:s.owner.session_id,to:args.to,content:args.content,at:stamp()});});
  return s.messages.at(-1);
}
