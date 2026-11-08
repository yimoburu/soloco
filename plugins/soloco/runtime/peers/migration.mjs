import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withStore,installedTeam,digest} from '../store.mjs';
import {resourceClaims} from '../coordination.mjs';
import {PeerLedger,installPeerSchema,peerDigest,PEER_PROTOCOL} from './ledger.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=(v,label,max=4000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`${label} is required`);return v;};
const defaults={worker_cap:3,queue_limit:1000,principal_queue_limit:100,max_context_bytes:65536,max_model_calls:100};
function stopped(state){
 if(!state.paused)throw Error('Pause and reconcile the existing company before peer adoption');
 if(Object.values(state.jobs??{}).some(j=>['queued','running'].includes(j.status))||resourceClaims(state).length)throw Error('Active or uncertain legacy execution must be closed before peer adoption');
 if(state.upgrade&&!['completed','recovered'].includes(state.upgrade.status))throw Error('Reconcile the current upgrade before peer adoption');
}
function sourceCut(db,{excluded_records=[],excluded_jobs=[]}={}){
 const ignoreRecords=new Set(excluded_records),ignoreJobs=new Set(excluded_jobs);
 const refs=db.db.prepare('SELECT family,key,sha256 FROM state_entries ORDER BY family,key').all().filter(r=>{
  if(r.family==='root'&&['revision','updated_at','selection_usage'].includes(r.key))return false;
  if(['sessions','retired_sessions'].includes(r.family))return false;
  if(r.family==='records'&&ignoreRecords.has(r.key))return false;
  if(r.family==='jobs'&&ignoreJobs.has(r.key))return false;
  return true;
 });
 return {references:refs,sha256:peerDigest(refs)};
}
function environment(value){
 if(!value||value.boundary_mode!=='enforced'||!['broker-only-native','separate-os-principal','remote-isolated'].includes(value.worker_boundary))throw Error('Protected peer execution requires a reviewed enforced environment, not shared unrestricted credentials');
 for(const name of ['broker_config_sha256','harness_sha256'])if(!/^[a-f0-9]{64}$/.test(value[name]??''))throw Error(`Exact ${name} required`);
 return plain(value);
}
export function planPeerAdoption(root,{source_instruction,environment:env,policy={},expires_at}={}){
 text(source_instruction,'Exact founder source instruction');env=environment(env);
 const end=Date.parse(expires_at);if(!Number.isFinite(end)||end<=Date.now()||end>Date.now()+7*86400000)throw Error('Adoption plan needs a future expiry within seven days');
 const limits={...defaults,...policy};
 if(!Number.isSafeInteger(limits.worker_cap)||limits.worker_cap<1||limits.worker_cap>3||!Number.isSafeInteger(limits.queue_limit)||limits.queue_limit<1||limits.queue_limit>10000||!Number.isSafeInteger(limits.principal_queue_limit)||limits.principal_queue_limit<1||limits.principal_queue_limit>limits.queue_limit||!Number.isSafeInteger(limits.max_context_bytes)||limits.max_context_bytes<512||limits.max_context_bytes>65536||!Number.isSafeInteger(limits.max_model_calls)||limits.max_model_calls<1)throw Error('Adoption cannot raise existing execution/context limits');
 return withStore(root,db=>db.readSnapshot(()=>{
  const state=db.read();stopped(state);if(db.storageInfo().format!=='normalized-v4')throw Error('Explicit normalized-v4 migration required before planning peer adoption');
  const cut=sourceCut(db),team=installedTeam();
  return {protocol:'peer-adoption-v1',company_id:state.id,owner:plain(state.owner),pinned_team_sha256:state.team_sha256,source_cut_sha256:cut.sha256,sources:cut.references,
    retired_legacy_session_authority:true,legacy_failures_and_attempts_preserved:true,scope_policy:'all-imported-sources-global-unqualified-until-independently-qualified',
    governance_sha256:team.governance_sha256,governance:team.governance,environment:env,environment_sha256:peerDigest(env),policy:limits,source_instruction,expires_at};
 }));
}
function parseContent(record,label){try{return JSON.parse(record.content);}catch{throw Error(`${label} must contain its exact structured JSON evidence`);}}
function reviewedPlan(state,plan_id,review_id){
 const target=state.records?.[plan_id],review=state.records?.[review_id];
 if(!target||!review||review.kind!=='review'||review.status!=='Submitted'||review.review?.verdict!=='Pass'||review.review?.blockers?.length||review.review_of?.id!==target.id||review.review_of?.revision!==target.revision)throw Error('Current independent exact-plan QA Pass required');
 const job=state.jobs?.[review.job_id],author=state.jobs?.[target.job_id];
 if(!job||job.status!=='completed'||job.artifact_id!==review.id||job.role!=='qa'||!job.native_id||job.instance_id!==review.author_instance||job.native_id===state.owner.session_id||job.native_id===author?.native_id||review.author_instance===target.author_instance||job.native_id===target.author_instance||job.coordination_release?.termination_confirmed!==true)throw Error('Observed independent native QA identity and confirmed closure required');
 const plan=parseContent(target,'Adoption plan'),proof=parseContent(review,'Native adoption review');
 if(plan.protocol!=='peer-adoption-v1'||proof.protocol!=='peer-adoption-review-v1'||proof.permitted_action!=='adopt_peer_coordination'||proof.plan_sha256!==peerDigest(plan)||proof.environment_sha256!==plan.environment_sha256||proof.complete_current_meaning!==true||proof.failures_preserved!==true)throw Error('Native review lacks exact adoption/environment/continuity permission');
 return {plan,proof,target,review,job};
}
export function adoptPeers(root,{plan_id,review_id,source_instruction,expected_epoch,founder_principal_id='founder',founder_native_id,founder_host='codex'}={}){
 text(source_instruction,'Exact founder adoption instruction');text(founder_native_id,'Observed founder CoS native identity',300);
 if(!['codex','claude'].includes(founder_host))throw Error('Unsupported founder host');
 let validated,backup;
 withStore(root,db=>{
  const state=db.read();stopped(state);validated=reviewedPlan(state,plan_id,review_id);const {plan}=validated;
  if(plan.owner.epoch!==expected_epoch||JSON.stringify(plan.owner)!==JSON.stringify(state.owner)||plan.company_id!==state.id||plan.pinned_team_sha256!==state.team_sha256||Date.parse(plan.expires_at)<=Date.now()||installedTeam().governance_sha256!==plan.governance_sha256)throw Error('Adoption plan authority, expiry or candidate governance changed');
  environment(plan.environment);
  const current=sourceCut(db,{excluded_records:[plan_id,review_id],excluded_jobs:[validated.job.id]});
  if(current.sha256!==plan.source_cut_sha256||peerDigest(plan.sources)!==plan.source_cut_sha256)throw Error('Company meaning changed since the reviewed adoption cut');
  const dir=path.join(db.dir,'backups','peer-'+randomUUID());fs.mkdirSync(dir,{recursive:true,mode:0o700});const target=path.join(dir,'company.sqlite');
  db.db.exec("VACUUM INTO '"+target.replaceAll("'","''")+"'");
  backup={directory:dir,file:target,sha256:hash(fs.readFileSync(target)),source_cut_sha256:plan.source_cut_sha256};
  fs.writeFileSync(path.join(dir,'peer-adoption-backup.json'),JSON.stringify(backup,null,2)+'\n',{flag:'wx',mode:0o600});
  db.db.exec('BEGIN IMMEDIATE');db.inTransaction=true;
  try{
   const fresh=db.read();stopped(fresh);
   const proof=reviewedPlan(fresh,plan_id,review_id);
   if(peerDigest(proof.plan)!==peerDigest(plan)||sourceCut(db,{excluded_records:[plan_id,review_id],excluded_jobs:[proof.job.id]}).sha256!==plan.source_cut_sha256)throw Error('Adoption changed during backup; retained backup only');
   installPeerSchema(db.db,{company_id:state.id,legacy_snapshot_sha256:backup.sha256});
   db.db.prepare('UPDATE company_layout SET version=5 WHERE id=1 AND version=4').run();
   const ledger=new PeerLedger(root,{connection:db.db});
  const {plan,job}=validated;
  ledger.writeWithin('peer.adopted',founder_principal_id,tx=>{
   tx.put('control','company',{protocol:PEER_PROTOCOL,paused:true,policy_generation:1,pause_generation:1,founder_principal_id,policy:plan.policy,governance_sha256:plan.governance_sha256,governance:plan.governance,
     activation:{environment_sha256:plan.environment_sha256,environment:plan.environment,review_id,native_reviewer_id:job.native_id},legacy_source_cut_sha256:plan.source_cut_sha256,legacy_backup:backup,source_instruction},0);
   tx.put('principals',founder_principal_id,{principal_id:founder_principal_id,kind:'founder',status:'active',generation:1,native_id:founder_native_id,host:founder_host,legacy_owner:plan.owner},0);
   for(const id of ['scheduler','publisher'])tx.put('principals',id,{principal_id:id,kind:id,status:'active',generation:1,internal:true},0);
   tx.put('control','resources',{worktrees:[]},0);
   for(const ref of plan.sources){
    const id='legacy-'+peerDigest([ref.family,ref.key]);
    tx.put('homes',id,{scope:'*',status:'current',qualification:'unclassified',source:{kind:'legacy',family:ref.family,key:ref.key,sha256:ref.sha256},conditions:'Original constraints, failures, uncertainty and exhausted attempts remain binding; no new execution permission inferred.'},0);
   }
   tx.event('adoption.held_for_explicit_resume',{plan_id,review_id,backup});
  });

   db.db.exec('COMMIT');
  }catch(e){db.db.exec('ROLLBACK');throw e;}finally{db.inTransaction=false;}
 });
 return {status:'adopted_paused',company_id:validated.plan.company_id,backup,peer_protocol:PEER_PROTOCOL,legacy_writers_fenced:true,execution_resumed:false};
}

export function registerPrincipal(ledger,actor,{principal_id,kind,host,native_id,session_id,source_instruction}){
 text(source_instruction,'Founder membership instruction');text(principal_id,'Principal identity',200);
 if(!['cos','reviewer','specialist'].includes(kind)||!['codex','claude'].includes(host))throw Error('Choose a supported independently managed agent role');
 text(native_id,'Observed independent native identity',300);text(session_id,'Host session attribution',300);
 return ledger.write('principal.registered',actor.principal_id,tx=>{
  const c=tx.get('control','company'),p=tx.get('principals',actor.principal_id);
  if(!p||p.value.kind!=='founder'||p.value.status!=='active'||c.value.founder_principal_id!==p.id)throw Error('Founder operator authority required');
  if(tx.get('principals',principal_id))throw Error('Principal already exists; use explicit revocation/replacement');
  if(tx.list('principals',{limit:100}).items.some(v=>v.value.native_id===native_id))throw Error('Native session is already assigned; do not share an active session');
  return tx.put('principals',principal_id,{principal_id,kind,host,native_id,session_id,status:'active',generation:1,source_instruction},0);
 });
}
