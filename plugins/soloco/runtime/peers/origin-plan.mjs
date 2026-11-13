// Internal SOURCE producer. No public action, execution, migration or caller
// exclusion list. Current bytes and every original archive entry remain data.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {types} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {withStore,owner} from '../store.mjs';
import {captureStorageBaseline,readStorageIntake,readImmutable,readNormalizedValue} from '../record-storage.mjs';
import {contextMatches} from '../context.mjs';
import {proofJobSafe,qualificationNegatives} from '../current-state.mjs';
import {validModelProcessTracking,modelProcessTransition} from '../model-process-closure.mjs';
import {canonical,peerDigest} from './ledger.mjs';
import {captureLegacyOrigin,authenticateLegacyOwner} from './legacy-origin.mjs';
import {captureOriginSidecarContents,assertOriginSidecarCaptureSupport} from './origin-sidecar-capture.mjs';
import {peerOriginPausedBootstrapPurpose} from './origin-paused-bootstrap-contract.mjs';
import {qaPurpose} from './origin-mechanical-qa-contract.mjs';
import * as mechanicalQa from './origin-mechanical-qa-policy.mjs';
import {inspectOriginalWorkerAssignmentBookkeepingFrom} from './prospective-local-worker-inventory-producer.mjs';
export {captureOriginSidecarContents} from './origin-sidecar-capture.mjs';

export const ORIGIN_PLAN_PROTOCOL='peer-origin-quarantine-plan-v1';
export const ORIGIN_REVIEW_CONTEXT='peer-origin-mechanical-review-v1';
export const ORIGIN_LIMITS=Object.freeze({rows:10000,bytes:64*1024*1024,value_bytes:16*1024*1024,sidecar_files:1000,sidecar_bytes:64*1024*1024,page_bytes:24000,range_characters:4096,context_bytes:65536,mechanical_jobs:1});
const fail=code=>{throw Object.assign(Error(code),{code});};
export const originNeed=(yes,code)=>{if(!yes)fail(code);};
export const originCopy=value=>JSON.parse(canonical(value));
export const originSame=(a,b)=>canonical(a)===canonical(b);
export const originRef=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
export const originHash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function originSafeData(value){
 let nodes=0;const seen=new Set(),visit=(v,depth)=>{originNeed(++nodes<=20000&&depth<=30,'ORIGIN_INPUT');if(v===null||['string','boolean'].includes(typeof v))return;if(typeof v==='number'){originNeed(Number.isFinite(v)&&!Object.is(v,-0),'ORIGIN_INPUT');return;}originNeed(v&&typeof v==='object'&&!types.isProxy(v)&&!seen.has(v),'ORIGIN_INPUT');const array=Array.isArray(v);originNeed(array?Object.getPrototypeOf(v)===Array.prototype:Object.getPrototypeOf(v)===Object.prototype,'ORIGIN_INPUT');seen.add(v);const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);originNeed(array?keys.length===v.length+1:keys.every(k=>typeof k==='string'),'ORIGIN_INPUT');for(const k of keys){if(array&&k==='length')continue;originNeed(typeof k==='string'&&d[k].enumerable&&Object.hasOwn(d[k],'value'),'ORIGIN_INPUT');visit(d[k].value,depth+1);}seen.delete(v);};visit(value,0);return originCopy(value);
}
const text=(v,max=4000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!v.includes('\0');
const logical=key=>key.startsWith('~json:')?JSON.parse(key.slice(6)):key;
export function assertOriginActor(actor){
 actor=originSafeData(actor);
 originNeed(actor&&Object.getPrototypeOf(actor)===Object.prototype&&Object.keys(actor).sort().join(',')==='host,native_id,session_id'&&actor.host==='codex'&&text(actor.session_id,200)&&actor.native_id===actor.session_id,'ORIGIN_ACTUAL_ROOT_CALLER_REQUIRED');
 return Object.freeze(originCopy(actor));
}
// Verify existence/layout and actual canonical owner read-only BEFORE Store's
// compatibility constructor can create a table, database or change WAL mode.
export function withOriginLegacyStore(root,actor,fn){
 originNeed(typeof root==='string'&&path.isAbsolute(root),'ORIGIN_EXISTING_STORAGE_REQUIRED');const real=fs.realpathSync(root),directory=path.join(real,'.company'),file=path.join(directory,'company.sqlite');
 for(const p of [root,directory,file,file+'-wal',file+'-shm']){try{const st=fs.lstatSync(p);originNeed(!st.isSymbolicLink(),'ORIGIN_LINKED_STORAGE');}catch(error){if(error.code!=='ENOENT')throw error;if(p===directory||p===file)originNeed(false,'ORIGIN_EXISTING_STORAGE_REQUIRED');}}
 originNeed(fs.statSync(directory).isDirectory()&&fs.statSync(file).isFile(),'ORIGIN_EXISTING_STORAGE_REQUIRED');assertOriginSidecarCaptureSupport();const db=new DatabaseSync(file,{readOnly:true});try{db.exec('BEGIN');originNeed(db.prepare("SELECT 1 FROM sqlite_master WHERE name='company_layout' AND type='table'").get()&&db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version===4,'ORIGIN_LAYOUT4_REQUIRED');const entry=readNormalizedValue(db,{family:'root',key:'owner'}),ownerValue=entry&&JSON.parse(entry.raw);authenticateLegacyOwner(db,{session_id:actor.session_id,epoch:ownerValue?.epoch},actor.host);}finally{if(db.isTransaction)db.exec('ROLLBACK');db.close();}
 return withStore(real,fn);
}
function rows(db,table,sql){
 const count=db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;originNeed(count<=ORIGIN_LIMITS.rows,'ORIGIN_ARCHIVE_CAPACITY');return db.prepare(sql).all();
}
// The fixed original POSIX helper owns complete FD-relative capture. Missing
// reviewed deployment Holds; no pathname/listing or caller helper fallback.
export function originSidecars(directory){return captureOriginSidecarContents(directory).map(({content,...entry})=>entry);}
export function capturePeerOriginCut(db,{directory}={}){
 originNeed(db.isTransaction===true,'ORIGIN_SNAPSHOT_REQUIRED');const snapshot=captureLegacyOrigin(db);
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 const archive=rows(db,'immutable_values','SELECT sha256,bytes,CAST(bytes AS BLOB) AS raw FROM immutable_values ORDER BY sha256').map(r=>{originNeed(typeof r.bytes==='string'&&Buffer.from(r.bytes).equals(Buffer.from(r.raw))&&originHash(r.raw)===r.sha256,'ORIGIN_ARCHIVE_CHANGED');return {sha256:r.sha256,characters:r.bytes.length,utf8_bytes:r.raw.length};});
 const events=rows(db,'events','SELECT seq,at,type,value,CAST(value AS BLOB) AS raw FROM events ORDER BY seq').map(r=>{originNeed(typeof r.value==='string'&&Buffer.from(r.value).equals(Buffer.from(r.raw)),'ORIGIN_ARCHIVE_CHANGED');return {seq:r.seq,at:r.at,type:r.type,sha256:originHash(r.raw),utf8_bytes:r.raw.length};});
 originNeed(archive.reduce((n,r)=>n+r.utf8_bytes,0)<=ORIGIN_LIMITS.bytes&&events.reduce((n,r)=>n+r.utf8_bytes,0)<=ORIGIN_LIMITS.bytes,'ORIGIN_ARCHIVE_CAPACITY');
 const sidecars=directory?originSidecars(directory):[];
 const body={protocol:'peer-origin-exact-cut-v1',authority:snapshot.authority,sources:snapshot.sources,pinned_team:snapshot.pinned_team,projection:snapshot.projection,schema,archive,events,sidecars};
 return {snapshot,body,sha256:peerDigest(body),baseline:captureStorageBaseline(db)};
}
function policy(value){
 const keys=['worker_cap','queue_limit','principal_queue_limit','max_context_bytes','max_model_calls'];
 originNeed(value&&Object.keys(value).sort().join(',')===keys.sort().join(',')&&keys.every(k=>Number.isSafeInteger(value[k])&&value[k]>0)&&value.worker_cap<=3&&value.queue_limit<=1000&&value.principal_queue_limit<=value.queue_limit&&value.max_context_bytes>=512&&value.max_context_bytes<=65536,'ORIGIN_NEW_POLICY_REQUIRED');return originCopy(value);
}
function recordPeerOriginQuarantinePlanSelected(root,actor,input,expected_epoch){
 const a=assertOriginActor(actor);input=originSafeData(input);originNeed(input&&['expires_at','maintenance','policy','source_instruction'].every(k=>Object.hasOwn(input,k))&&Object.keys(input).every(k=>['expires_at','maintenance','policy','source_instruction','frontier','frontier_seal','paused_bootstrap','mechanical_qa'].includes(k)),'ORIGIN_PLAN_INPUT');
 const end=Date.parse(input.expires_at);originNeed(text(input.source_instruction)&&end>Date.now()&&end<=Date.now()+7*86400000,'ORIGIN_PLAN_EXPIRY');
 const m=input.maintenance;originNeed(m&&Object.keys(m).sort().join(',')==='max_model_calls,max_review_calls,scope,source_instruction'&&m.scope==='*'&&text(m.source_instruction)&&Number.isSafeInteger(m.max_model_calls)&&m.max_model_calls>=2&&Number.isSafeInteger(m.max_review_calls)&&m.max_review_calls>=1&&m.max_review_calls<m.max_model_calls,'ORIGIN_MAINTENANCE_AUTHORITY_REQUIRED');
 let frontier=null;if(Object.hasOwn(input,'frontier')){const f=input.frontier;originNeed(f&&Object.keys(f).sort().join(',')==='max_model_calls,max_review_calls,protocol'&&f.protocol==='peer-origin-input-frontier-v1'&&Number.isSafeInteger(f.max_model_calls)&&f.max_model_calls>0&&f.max_model_calls<=m.max_model_calls&&Number.isSafeInteger(f.max_review_calls)&&f.max_review_calls>0&&f.max_review_calls<=f.max_model_calls&&f.max_review_calls<=m.max_review_calls,'ORIGIN_FRONTIER_SUBCAP_REQUIRED');frontier=originCopy(f);}
 let frontier_seal=null;if(Object.hasOwn(input,'frontier_seal')){const f=input.frontier_seal;originNeed(f&&Object.keys(f).sort().join(',')==='max_reviews,protocol,purpose'&&f.protocol==='peer-origin-frontier-seal-purpose-v1'&&f.purpose==='bounded-preparation-bootstrap'&&Number.isSafeInteger(f.max_reviews)&&f.max_reviews>0&&f.max_reviews<=m.max_model_calls&&f.max_reviews<=m.max_review_calls,'ORIGIN_FRONTIER_SEAL_PURPOSE_REQUIRED');frontier_seal=originCopy(f);}
 let mechanical_qa=null;if(Object.hasOwn(input,'mechanical_qa'))mechanical_qa=qaPurpose(input.mechanical_qa);
 let paused_bootstrap=null;if(Object.hasOwn(input,'paused_bootstrap')){originNeed(frontier_seal,'ORIGIN_PAUSED_BOOTSTRAP_SEAL_PURPOSE_REQUIRED');paused_bootstrap=peerOriginPausedBootstrapPurpose(input.paused_bootstrap,m);}
 return withOriginLegacyStore(root,a,store=>{
  let result;store.transaction('origin.quarantine.planned',s=>{
   if(expected_epoch!==undefined)originNeed(s.owner?.epoch===expected_epoch,'ORIGIN_OWNER_EPOCH_CHANGED');owner(s,a.session_id,a.host,expected_epoch);originNeed(s.paused===true,'ORIGIN_PAUSE_REQUIRED');const cut=capturePeerOriginCut(store.db,{directory:store.dir});
   originNeed(cut.snapshot.execution.pending_jobs===0,'ORIGIN_ACTIVE_LEGACY_WORK');
   const id='origin-quarantine-plan:'+randomUUID(),plan={protocol:ORIGIN_PLAN_PROTOCOL,plan_id:id,company_id:s.id,owner:originCopy(s.owner),actor:a,baseline:cut.baseline,cut:cut.body,cut_sha256:cut.sha256,policy:policy(input.policy),maintenance:originCopy(m),...(frontier?{frontier}:{}),...(frontier_seal?{frontier_seal}:{}),...(paused_bootstrap?{paused_bootstrap}:{}),...(mechanical_qa?{mechanical_qa}:{}),expires_at:input.expires_at,source_instruction:input.source_instruction,exclusion_contract:'only-source-produced-mechanical-review-journal-v1',legacy_authority:'retired-without-conversion',execution_resumed:false};
   const record={id,kind:'plan',status:'Draft',revision:1,author_role:'cos',author_instance:a.native_id,content:canonical(plan),origin_quarantine_plan:plan,created_at:new Date().toISOString()};originNeed(Buffer.byteLength(canonical(record))<=ORIGIN_LIMITS.value_bytes,'ORIGIN_PLAN_CAPACITY');
   s.records[id]=record;result={plan_id:id,plan_sha256:peerDigest(plan),cut_sha256:cut.sha256,expires_at:plan.expires_at};return s;
  },{beforeCommit:db=>{if(expected_epoch!==undefined){const entry=readNormalizedValue(db,{family:'root',key:'owner'}),actual=entry&&JSON.parse(entry.raw);originNeed(actual&&actual.session_id===a.session_id&&actual.host===a.host&&actual.epoch===expected_epoch,'ORIGIN_OWNER_EPOCH_CHANGED');}originNeed(Date.now()<end,'ORIGIN_PLAN_EXPIRED');}});return result;
 });
}
// Legacy internal compatibility writer. Public routing must use the strict
// fixed-epoch form below; it must never fall back to this epochless entrypoint.
export function recordPeerOriginQuarantinePlan(root,actor,input){return recordPeerOriginQuarantinePlanSelected(root,actor,input);}
export function recordPeerOriginQuarantinePlanAtEpoch(root,actor,epoch,input){originNeed(Number.isSafeInteger(epoch)&&epoch>0,'ORIGIN_EXPECTED_OWNER_EPOCH_REQUIRED');return recordPeerOriginQuarantinePlanSelected(root,actor,input,epoch);}

// Source bridge for the existing legacy scheduler/worker. Shared consumers must
// explicitly join it; adding this pure predicate does not expose a new action.
export function originMechanicalReviewEligible(state,job){
 const target=state.records?.[typeof job.review_of==='string'?job.review_of:job.review_of?.id],p=target?.origin_quarantine_plan;
 return Boolean(state.paused===true&&job.role==='qa'&&p?.protocol===ORIGIN_PLAN_PROTOCOL&&p.company_id===state.id&&originSame(p.owner,state.owner)&&Date.parse(p.expires_at)>Date.now()&&(!job.review_of?.revision||job.review_of.revision===target.revision)&&!job.prototype_id&&!job.development_id&&!job.specialist&&!job.coordination?.resources?.length);
}
const nativeAliases=state=>new Set([state.owner.session_id,...Object.values(state.jobs??{}).map(j=>j.native_id),...Object.values(state.sessions??{}).map(s=>s.native_id),...(state.retired_sessions??[]).map(s=>s.native_id)].filter(Boolean));
// Historical bounded local-child fact, never an original-domain/environment
// qualification. A release Boolean or plausible journal alone is insufficient.
export function inspectLegacyLocalReleaseFrom(db,job){
 const held={proved:false,scope:'original-CLI-child-only',whole_domain_qualified:false};if(!job||job.coordination_release?.termination_confirmed!==true||!validModelProcessTracking(job.model_process_tracking)||job.model_process_tracking.invocations.some(i=>!i.birth||!i.closure||i.job_id!==job.id||i.instance_id!==job.instance_id||i.worker_pid!==job.worker_pid||i.host!==job.host))return held;
 try{
  const events=db.prepare("SELECT seq,at,type,value FROM events WHERE type IN ('job.model_process.requested','job.model_process.born','job.model_process.closed','job.completed','job.failed','job.process_closure_reconciled') ORDER BY seq").all();originNeed(events.length<=ORIGIN_LIMITS.rows&&events.reduce((n,e)=>n+Buffer.byteLength(e.value),0)<=ORIGIN_LIMITS.bytes,'ORIGIN_ARCHIVE_CAPACITY');const phases=new Map(),refs=[];let release=null;
  for(const e of events){const p=JSON.parse(e.value),d=p.storage_delta;if(!d?.changes?.some(c=>(c.after??c.before)?.family==='jobs'&&(c.after??c.before).key===job.id))continue;const {sha256,...body}=d;originNeed(sha256===originHash(JSON.stringify([e.seq,e.at,e.type,{...p,storage_delta:body}])),'ORIGIN_LEGACY_LOCAL_PROOF_CHANGED');const previous=db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(e.seq-1);originNeed(d.previous_event_sha256===(previous?originHash(JSON.stringify([previous.seq,previous.at,previous.type,previous.value])):null),'ORIGIN_LEGACY_LOCAL_PROOF_CHANGED');
   for(const c of d.changes){if(c.after?.family!=='jobs'||c.after.key!==job.id)continue;const before=c.before?JSON.parse(readImmutable(db,c.before.sha256)):null,after=JSON.parse(readImmutable(db,c.after.sha256));originNeed(after.id===job.id&&after.instance_id===job.instance_id&&after.worker_pid===job.worker_pid&&after.host===job.host,'ORIGIN_LEGACY_LOCAL_PROOF_CHANGED');
    if(e.type.startsWith('job.model_process.')){originNeed(modelProcessTransition(before,after,e.type)&&originSame(Object.fromEntries(Object.entries(before??{}).filter(([k])=>k!=='model_process_tracking')),Object.fromEntries(Object.entries(after).filter(([k])=>k!=='model_process_tracking'))),'ORIGIN_LEGACY_LOCAL_PROOF_CHANGED');const phase=e.type.split('.').at(-1);for(const entry of after.model_process_tracking.invocations){const old=before?.model_process_tracking?.invocations.find(v=>v.invocation_id===entry.invocation_id);if(phase==='requested'&&!old||phase==='born'&&old?.birth===null&&entry.birth||phase==='closed'&&old?.closure===null&&entry.closure){const value=phases.get(entry.invocation_id)??{};originNeed(!value[phase],'ORIGIN_LEGACY_LOCAL_PROOF_CHANGED');value[phase]={seq:e.seq,entry};phases.set(entry.invocation_id,value);}}}
    else if(after.coordination_release?.termination_confirmed===true&&after.coordination_release.reason==='model_process_closed'&&originSame(after.model_process_tracking,job.model_process_tracking)&&after.native_id===job.native_id)release={seq:e.seq,sha256:c.after.sha256};
   }refs.push({seq:e.seq,sha256:originHash(e.value)});
  }
  originNeed(release&&job.model_process_tracking.invocations.every(i=>{const p=phases.get(i.invocation_id);return p?.requested&&p.born&&p.closed&&p.requested.seq<p.born.seq&&p.born.seq<p.closed.seq&&p.closed.seq<=release.seq&&originSame(p.closed.entry,i);}),'ORIGIN_LEGACY_LOCAL_PROOF_CHANGED');return {proved:true,scope:held.scope,whole_domain_qualified:false,job_id:job.id,tracking_sha256:peerDigest(job.model_process_tracking),release,events:refs};
 }catch(cause){return {...held,hold:cause.code??'ORIGIN_LEGACY_LOCAL_PROVENANCE_UNQUALIFIED'};}
}
function reviewState(db,plan,job,review,state){
 originNeed(proofJobSafe(job,state)&&job.status==='completed'&&job.role==='qa'&&job.artifact_id===review.id&&job.review_of?.id===plan.plan_id&&job.review_of.revision===1&&review.job_id===job.id&&review.kind==='review'&&review.status==='Submitted'&&review.author_role==='qa'&&review.author_instance===job.instance_id&&review.revision===1&&originSame(review.review_of,job.review_of)&&job.coordination_release?.termination_confirmed===true&&text(job.native_id,300)&&job.native_id!==plan.actor.native_id&&review.author_instance!==plan.actor.native_id,'ORIGIN_MECHANICAL_REVIEW_REQUIRED');
 if(plan.mechanical_qa){const checked=mechanicalQa.prepareOriginalPeerOriginMechanicalQaContextFrom(db,state,{job_id:job.id});originNeed(checked.sha256===job.context_sha256,'ORIGIN_MECHANICAL_CONTEXT_CHANGED');}else originNeed(contextMatches(state,job,job.context_sha256),'ORIGIN_MECHANICAL_CONTEXT_CHANGED');
 originNeed(validModelProcessTracking(job.model_process_tracking)&&job.model_process_tracking.invocations.every(i=>i.job_id===job.id&&i.instance_id===job.instance_id&&i.host===job.host&&i.worker_pid===job.worker_pid&&i.birth&&i.closure&&i.closure.exit_code===0&&i.closure.signal===null),'ORIGIN_MECHANICAL_CLOSURE_REQUIRED');
 const local=inspectLegacyLocalReleaseFrom(db,job);originNeed(local.proved===true&&local.release.seq>plan.baseline.seq&&local.events.every(e=>e.seq>plan.baseline.seq),'ORIGIN_MECHANICAL_CLOSURE_REQUIRED');
 originNeed(review.review?.verdict==='Pass'&&Array.isArray(review.review.blockers)&&review.review.blockers.length===0,'ORIGIN_MECHANICAL_NEGATIVE');
 let value;try{value=JSON.parse(review.content);}catch{fail('ORIGIN_MECHANICAL_REVIEW_REQUIRED');}
 originNeed(value.protocol===ORIGIN_REVIEW_CONTEXT&&value.permitted_action==='quarantine_peer_origin'&&value.plan_sha256===peerDigest(plan)&&value.cut_sha256===plan.cut_sha256&&value.legacy_authority==='retired-without-conversion'&&value.execution_resumed===false,'ORIGIN_MECHANICAL_REVIEW_REQUIRED');
 return {job_id:job.id,native_id:job.native_id,instance_id:job.instance_id,role:'mechanical-review',review_id:review.id,job_sha256:peerDigest(job),review_sha256:peerDigest(review),context_sha256:job.context_sha256};
}
// No caller-defined ignored rows. The complete original cut is retained. This
// narrow journal admits only the NEW plan and its exact native QA producer data;
// every change is independently verified by canonical normalized intake.
export function validatePeerOriginMechanicalReview(store,{plan_id,review_ids},actor){
 const a=assertOriginActor(actor),db=store.db;originNeed(db.isTransaction===true,'ORIGIN_SNAPSHOT_REQUIRED');const state=store.read();owner(state,a.session_id,a.host);
 const record=state.records?.[plan_id],plan=record?.origin_quarantine_plan;originNeed(plan?.protocol===ORIGIN_PLAN_PROTOCOL&&record.id===plan.plan_id&&record.revision===1&&record.content===canonical(plan)&&record.author_instance===a.native_id&&originSame(plan.owner,state.owner)&&originSame(plan.actor,a)&&state.paused===true,'ORIGIN_PLAN_CHANGED');
 originNeed(Date.parse(plan.expires_at)>Date.now(),'ORIGIN_PLAN_EXPIRED');originNeed(Array.isArray(review_ids)&&review_ids.length===1&&new Set(review_ids).size===1,'ORIGIN_MECHANICAL_REVIEW_REQUIRED');
 const reviews=review_ids.map(id=>state.records[id]);originNeed(reviews.every(Boolean),'ORIGIN_MECHANICAL_REVIEW_REQUIRED');const jobs=reviews.map(r=>state.jobs[r.job_id]);originNeed(jobs.every(Boolean)&&new Set(jobs.map(j=>j.id)).size===1,'ORIGIN_MECHANICAL_REVIEW_REQUIRED');
 // This journal admits a NEW mechanical producer only. Reusing a baseline job
 // ID would overwrite its failed/UNKNOWN current occurrence and reservation.
 originNeed(jobs.every(job=>!plan.cut.sources.some(s=>s.family==='jobs'&&logical(s.key)===job.id)),'ORIGIN_REVIEW_JOURNAL_CHANGED');
 originNeed(qualificationNegatives(state,record).length===0,'ORIGIN_MECHANICAL_NEGATIVE');
 const observed=reviews.map((r,i)=>reviewState(db,plan,jobs[i],r,state));originNeed(new Set(observed.map(o=>o.native_id)).size===1,'ORIGIN_REVIEW_INDEPENDENCE');
 const originalJobs=plan.cut.sources.filter(s=>s.family==='jobs').map(s=>JSON.parse(readImmutable(db,s.sha256))),originalSessions=plan.cut.sources.filter(s=>['sessions','retired_sessions'].includes(s.family)).map(s=>JSON.parse(readImmutable(db,s.sha256)));
 const excluded=nativeAliases({owner:plan.owner,jobs:Object.fromEntries(originalJobs.map(j=>[j.id,j])),sessions:Object.fromEntries(originalSessions.map((s,i)=>[i,s]))});originNeed(observed.every(o=>!excluded.has(o.native_id)),'ORIGIN_REVIEW_INDEPENDENCE');
 const intake=readStorageIntake(db,plan.baseline,{values:true}),jobIds=new Set(jobs.map(j=>j.id)),recordIds=new Set([plan_id,...review_ids]),instances=new Set(jobs.map(j=>j.instance_id)),tracking=new Map(),journal=new Map(),sessions=new Map();let planned=0;
 const selectedAdmin=plan.mechanical_qa?mechanicalQa.preparePeerOriginMechanicalQaAdministrativeFrom(db,state,{plan_ref:{id:record.id,revision:record.revision,sha256:originHash(JSON.stringify(record))},job_id:jobs[0].id}):null;
 const originalTypes=new Set(['job.worker_launch_requested','job.model_process.launch_requested','job.original_execution.born','job.original_execution.closed']);
 // These extra transitions affect only Source-owned operational metadata.
 // The actual Store snapshot/full original replay must authenticate that
 // metadata before this closed interval can recognize any such transition.
 const originalJobIds=new Set(jobs.filter(job=>{const proof=inspectOriginalWorkerAssignmentBookkeepingFrom(state,job);return proof?.field==='original_execution_assignment'&&(proof.historical_original===true||proof.active_original_snapshot===true);}).map(job=>job.id));
 const types=new Set([...(selectedAdmin?['origin.mechanical_qa.packet_prepared','origin.mechanical_qa.grant_selected']:[]),...(selectedAdmin&&originalJobIds.size===jobs.length?[...originalTypes]:[]),'job.queued','job.started','job.model_process.requested','job.model_process.born','job.model_process.closed','job.execution_started','job.record_reads_delivered','job.completed']);
 for(const e of intake.events){
  originNeed(e.type==='origin.quarantine.planned'||types.has(e.type),'ORIGIN_REVIEW_JOURNAL_CHANGED');if(e.type==='origin.quarantine.planned')planned++;
  originNeed(originSame(e.payload.owner,plan.owner),'ORIGIN_REVIEW_JOURNAL_CHANGED');
  for(const change of e.changes){const r=change.after??change.before,k=logical(r.key),before=change.before?JSON.parse(change.before.raw):null,after=change.after?JSON.parse(change.after.raw):null;
   if(r.family==='root'&&k==='revision'){originNeed(Number.isSafeInteger(after)&&after===(before??-1)+1,'ORIGIN_REVIEW_JOURNAL_CHANGED');continue;}
   if(r.family==='root'&&k==='updated_at'){originNeed(typeof after==='string'&&Number.isFinite(Date.parse(after))&&Date.parse(after)<=Date.parse(e.at),'ORIGIN_REVIEW_JOURNAL_CHANGED');continue;}
   if(selectedAdmin&&mechanicalQa.isPeerOriginMechanicalQaAdministrativeChange(selectedAdmin,e,change))continue;
   if(r.family==='records'){originNeed(recordIds.has(k)&&!before&&after?.revision===1&&(k===plan_id?e.type==='origin.quarantine.planned'&&originSame(after,record):e.type==='job.completed'&&originSame(after,state.records[k])),'ORIGIN_REVIEW_JOURNAL_CHANGED');continue;}
   if(r.family==='jobs'){
    originNeed(jobIds.has(k)&&after?.id===k&&after.role==='qa'&&after.review_of?.id===plan_id&&after.review_of.revision===1,'ORIGIN_REVIEW_JOURNAL_CHANGED');
    const prior=journal.get(k),originalMetadata=originalTypes.has(e.type)&&selectedAdmin&&originalJobIds.has(k);originNeed(prior?originSame(prior.value,before)&&(!prior.completed||originalMetadata):e.type==='job.queued'&&!before,'ORIGIN_REVIEW_JOURNAL_CHANGED');
    const without=(v,keys)=>Object.fromEntries(Object.entries(v??{}).filter(([name])=>!keys.includes(name))),only=keys=>originSame(without(before,keys),without(after,keys));
    if(e.type==='job.queued')originNeed(!prior&&!before&&after.status==='queued'&&after.native_id===null&&!after.model_process_tracking,'ORIGIN_REVIEW_JOURNAL_CHANGED');
    else if(originalTypes.has(e.type))originNeed(originalMetadata&&before&&before.status===after.status&&only(['original_execution_assignment'])&&originSame(before.model_process_tracking??null,after.model_process_tracking??null),'ORIGIN_REVIEW_JOURNAL_CHANGED');
    else if(e.type==='job.started')originNeed(!prior.started&&before.status==='queued'&&after.status==='running'&&Number.isSafeInteger(after.worker_pid)&&after.worker_pid>0&&Number.isFinite(Date.parse(after.started_at))&&only(['inputs','context_sha256','status','started_at','worker_pid']),'ORIGIN_REVIEW_JOURNAL_CHANGED');
    else{originNeed(prior.started&&before.status==='running','ORIGIN_REVIEW_JOURNAL_CHANGED');if(e.type==='job.completed')originNeed(after.status==='completed'&&only(['status','artifact_id','finished_at','native_id','coordination_release','model_evidence']),'ORIGIN_REVIEW_JOURNAL_CHANGED');else{originNeed(after.status==='running','ORIGIN_REVIEW_JOURNAL_CHANGED');if(e.type==='job.execution_started')originNeed(before.execution_started_at==null&&Number.isFinite(Date.parse(after.execution_started_at))&&Number.isFinite(Date.parse(after.execution_deadline_at))&&Date.parse(after.execution_deadline_at)>Date.parse(after.execution_started_at)&&only(['timeout_policy_version','timeout_ms','timeout_reason','execution_started_at','execution_deadline_at','termination_deadline_at']),'ORIGIN_REVIEW_JOURNAL_CHANGED');else if(e.type==='job.record_reads_delivered')originNeed(after.delivered_record_reads&&only(['delivered_record_reads']),'ORIGIN_REVIEW_JOURNAL_CHANGED');else originNeed(e.type.startsWith('job.model_process.'),'ORIGIN_REVIEW_JOURNAL_CHANGED');}}
    if(['job.model_process.requested','job.model_process.born','job.model_process.closed'].includes(e.type)){originNeed(modelProcessTransition(before,after,e.type)&&originSame(Object.fromEntries(Object.entries(before??{}).filter(([k])=>k!=='model_process_tracking')),Object.fromEntries(Object.entries(after).filter(([k])=>k!=='model_process_tracking'))),'ORIGIN_MECHANICAL_CLOSURE_REQUIRED');const phases=tracking.get(k)??new Set();phases.add(e.type);tracking.set(k,phases);}
    journal.set(k,{value:after,started:prior?.started||e.type==='job.started',completed:prior?.completed||e.type==='job.completed'});
    continue;
   }
   if(r.family==='sessions'){const j=jobs.find(j=>j.session_key===k),prior=sessions.get(k);originNeed(j&&after&&after.instance_id===j.instance_id&&instances.has(after.instance_id)&&(prior?originSame(prior,before)&&e.type==='job.completed'&&originSame({...before,native_id:after.native_id},after)&&after.native_id===j.native_id:!before&&e.type==='job.queued'&&after.native_id===null),'ORIGIN_REVIEW_JOURNAL_CHANGED');sessions.set(k,after);continue;}
   fail('ORIGIN_REVIEW_JOURNAL_CHANGED');
  }
 }
 originNeed(planned===1&&jobs.every(j=>tracking.get(j.id)?.size===3&&journal.get(j.id)?.completed&&originSame(journal.get(j.id).value,j)),'ORIGIN_MECHANICAL_CLOSURE_REQUIRED');
 // The original schema, archive prefix and sidecars are not ignored by the
 // review journal, even though normal QA adds fresh vault/event entries.
 for(const row of plan.cut.archive)originNeed(Buffer.byteLength(readImmutable(db,row.sha256))===row.utf8_bytes,'ORIGIN_ARCHIVE_CHANGED');
 for(const row of plan.cut.events){const event=db.prepare('SELECT seq,at,type,value,CAST(value AS BLOB) AS raw FROM events WHERE seq=?').get(row.seq);originNeed(event&&event.seq===row.seq&&event.at===row.at&&event.type===row.type&&typeof event.value==='string'&&Buffer.from(event.value).equals(Buffer.from(event.raw))&&originHash(event.raw)===row.sha256&&event.raw.length===row.utf8_bytes,'ORIGIN_ARCHIVE_CHANGED');}
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();originNeed(originSame(schema,plan.cut.schema)&&originSame(originSidecars(store.dir),plan.cut.sidecars),'ORIGIN_SOURCE_CHANGED');
 const current=capturePeerOriginCut(db,{directory:store.dir});originNeed(current.snapshot.execution.pending_jobs===0,'ORIGIN_ACTIVE_LEGACY_WORK');
 return {plan,record,observed,intake,current};
}

// Fixed public-source policy producers; actual prospective founder selection is
// separate from plan DATA. These must never infer or reuse an old/R6 allowance.
export function recordPeerOriginMechanicalQaDecisionAtEpoch(root,actor,epoch,input){const a=assertOriginActor(actor);return withOriginLegacyStore(root,a,s=>mechanicalQa.recordPeerOriginMechanicalQaDecisionFrom(s,a,epoch,input));}
export function preparePeerOriginMechanicalQaPacketAtEpoch(root,actor,epoch,input){const a=assertOriginActor(actor);return withOriginLegacyStore(root,a,s=>mechanicalQa.preparePeerOriginMechanicalQaPacketFrom(s,a,epoch,input));}
export function grantPeerOriginMechanicalQaPacketAtEpoch(root,actor,epoch,input){const a=assertOriginActor(actor);return withOriginLegacyStore(root,a,s=>mechanicalQa.grantPeerOriginMechanicalQaPacketFrom(s,a,epoch,input));}

export function inspectPeerOriginMechanicalQaPacketAtEpoch(root,actor,epoch,input){const a=assertOriginActor(actor);return withOriginLegacyStore(root,a,s=>mechanicalQa.inspectPeerOriginMechanicalQaPacketFrom(s,a,epoch,input));}
export function readPeerOriginMechanicalQaPacketAtEpoch(root,actor,epoch,input){const a=assertOriginActor(actor);return withOriginLegacyStore(root,a,s=>mechanicalQa.readPeerOriginMechanicalQaPacketFrom(s,a,epoch,input));}

// Supported public adoption must select this strict validator. The older core
// remains internal compatibility evidence, never a fallback launch/apply route.
export function validateSelectedPeerOriginMechanicalReviewAtEpoch(store,input,actor,epoch){const a=assertOriginActor(actor),s=store.read();originNeed(Number.isSafeInteger(epoch)&&epoch>0&&s.owner?.epoch===epoch,'ORIGIN_OWNER_EPOCH_CHANGED');owner(s,a.session_id,a.host,epoch);originNeed(s.records?.[input.plan_id]?.origin_quarantine_plan?.mechanical_qa,'ORIGIN_MECHANICAL_QA_PURPOSE_REQUIRED');qaPurpose(s.records[input.plan_id].origin_quarantine_plan.mechanical_qa);return validatePeerOriginMechanicalReview(store,input,a);}
