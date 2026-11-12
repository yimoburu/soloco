// Original legacy evidence preparation. None of the DATA produced here is an
// admission capability, a native review, a peer-home seal or new authority.
import {createHash} from 'node:crypto';
import {readImmutable,readNormalized,readNormalizedValue,captureStorageBaseline,readStorageIntake} from '../record-storage.mjs';
import {bindSnapshots,bindOperatingIntake} from '../snapshot.mjs';
import {reviewedContext} from '../current-state.mjs';
import {validModelProcessTracking} from '../model-process-closure.mjs';
import {canonical,peerDigest} from './ledger.mjs';

export const LEGACY_ORIGIN_PROTOCOL='peer-legacy-origin-preparation-v2';
export const LEGACY_ADOPTION_LIMITS=Object.freeze({source_rows:10000,source_bytes:64*1024*1024,source_value_bytes:16*1024*1024,inventory_bytes:4*1024*1024,intake_events:10000,intake_event_bytes:64*1024*1024,intake_archive_bytes:64*1024*1024,page_rows:100,public_reply_bytes:24*1024,range_characters:4096});
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const copy=value=>JSON.parse(canonical(value));
export const legacyEncodedReplyBytes=value=>Buffer.byteLength(JSON.stringify({content:[{type:'text',text:JSON.stringify(value)}]}));
export function legacyReadReplyHold(retrieval){
  const guidance=retrieval?JSON.stringify(retrieval):'{"action":"inspect","input":{"limit":1}}';
  throw Object.assign(Error('Read-only reply exceeds the encoded 24576-byte limit; retrieve exact bounded evidence: '+guidance),{code:'LEGACY_READONLY_REPLY_CAPACITY',readonly:true,retrieval});
}
export function boundLegacyReadReply(value,retrieval){
 if(legacyEncodedReplyBytes(value)>LEGACY_ADOPTION_LIMITS.public_reply_bytes)legacyReadReplyHold(retrieval);
 return value;
}
export const legacySourceId=row=>'legacy-source:'+peerDigest({family:row.family,key:row.key,position:row.position,encoding:row.encoding,sha256:row.sha256});
const pinnedParts=['plugin_version','governance','roles','cos_instructions'];
const pinnedBody=(bundle,part)=>part==='roles'?bundle.roles_json:JSON.stringify(bundle[part]);
const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function validatePinnedBundle(bundle){
 if(!bundle||bundle.protocol!=='peer-pinned-team-bundle-v1'||bundle.selection!=='preserve-pinned-team'||typeof bundle.company_id!=='string'||!bundle.company_id||typeof bundle.plugin_version!=='string'||!bundle.plugin_version||typeof bundle.governance!=='string'||!bundle.governance||typeof bundle.cos_instructions!=='string'||!bundle.cos_instructions||typeof bundle.roles_json!=='string'||!isHash(bundle.team_sha256)||!isHash(bundle.governance_sha256)||!isHash(bundle.lineage?.source_cut_sha256))fail('LEGACY_PINNED_TEAM_REQUIRED');
 let roles;try{roles=JSON.parse(bundle.roles_json);}catch{fail('LEGACY_PINNED_TEAM_CHANGED');}
 if(!roles||Array.isArray(roles)||typeof roles!=='object'||JSON.stringify(roles)!==bundle.roles_json||hash(bundle.governance)!==bundle.governance_sha256||hash(JSON.stringify([bundle.plugin_version,bundle.governance,roles,bundle.cos_instructions]))!==bundle.team_sha256)fail('LEGACY_PINNED_TEAM_CHANGED');
 if(!Array.isArray(bundle.manifest)||bundle.manifest.length!==pinnedParts.length)fail('LEGACY_PINNED_TEAM_CHANGED');
 for(const [index,part] of pinnedParts.entries()){
  const body=pinnedBody(bundle,part),entry=bundle.manifest[index],reference=entry?.source;
  if(entry?.part!==part||entry.sha256!==hash(body)||entry.characters!==body.length||entry.utf8_bytes!==Buffer.byteLength(body)||reference?.family!=='root'||reference.key!==part||reference.encoding!=='json'||reference.sha256!==entry.sha256||reference.source_id!==legacySourceId(reference))fail('LEGACY_PINNED_TEAM_CHANGED');
 }
 if(Buffer.byteLength(canonical(bundle))>1_000_000-256)fail('LEGACY_PINNED_TEAM_CAPACITY');
 return bundle;
}

// Preserve the adopted company's actual full team; never read installedTeam.
// roles_json is intentional: the legacy team hash includes JSON key order,
// whereas the peer ledger canonically sorts object fields when it stores DATA.
export function captureLegacyPinnedTeam(state,sources,source_cut_sha256){
 const bundle={protocol:'peer-pinned-team-bundle-v1',selection:'preserve-pinned-team',company_id:state.id,plugin_version:state.plugin_version,governance:state.governance,governance_sha256:state.governance_sha256,roles_json:JSON.stringify(state.roles),cos_instructions:state.cos_instructions,team_sha256:state.team_sha256,lineage:{source_layout:4,source_cut_sha256,source_owner:JSON.parse(JSON.stringify(state.owner)),source_runtime_version:state.runtime_version},manifest:[]};
 for(const part of pinnedParts){
  const reference=sources.find(row=>row.family==='root'&&row.key===part);if(!reference)fail('LEGACY_PINNED_TEAM_REQUIRED');
  const body=pinnedBody(bundle,part);if(typeof body!=='string')fail('LEGACY_PINNED_TEAM_REQUIRED');
  bundle.manifest.push({part,sha256:hash(body),characters:body.length,utf8_bytes:Buffer.byteLength(body),source:copy(reference)});
 }
 return validatePinnedBundle(bundle);
}

function peerPinnedRow(tx,company_id){
 const control=tx.get('control','company'),reference=control?.value.pinned_team;
 if(!reference||Object.keys(reference).sort().join(',')!=='family,id,revision,sha256'||reference.family!=='control'||reference.id!=='pinned-team'||!Number.isSafeInteger(reference.revision)||reference.revision<1||!isHash(reference.sha256))fail('PEER_PINNED_TEAM_REQUIRED');
 const row=tx.get('control','pinned-team'),value=row?.value;
 if(!row||row.revision!==reference.revision||row.sha256!==reference.sha256||value?.protocol!=='peer-pinned-team-record-v1'||peerDigest(value.bundle)!==value.bundle_sha256)fail('PEER_PINNED_TEAM_CHANGED');
 const bundle=validatePinnedBundle(value.bundle);
 if(bundle.company_id!==company_id||control.value.legacy_source_cut_sha256!==bundle.lineage.source_cut_sha256||control.value.team_sha256!==bundle.team_sha256||control.value.governance_sha256!==bundle.governance_sha256)fail('PEER_PINNED_TEAM_CHANGED');
 if(typeof tx.resolveLegacy!=='function')fail('PEER_PINNED_TEAM_REQUIRED');
 for(const entry of bundle.manifest)if(JSON.stringify(tx.resolveLegacy({sha256:entry.source.sha256}))!==pinnedBody(bundle,entry.part))fail('PEER_PINNED_TEAM_CHANGED');
 return {reference:copy(reference),bundle};
}

// Same checked core inside the caller's ALREADY OWNING read/write snapshot.
// No nested transaction, mutation, actor authentication or permission issuance.
export function inspectPeerPinnedTeamFrom(tx,{company_id}={}){
 const {reference,bundle}=peerPinnedRow(tx,company_id);
 return {protocol:'peer-pinned-team-evidence-v1',reference,bundle:copy(bundle),bundle_sha256:peerDigest(bundle),roles:JSON.parse(bundle.roles_json),sources:bundle.manifest.map(({part,sha256,characters,utf8_bytes})=>({part,sha256,characters,utf8_bytes,reference}))};
}

// Trusted read-only cold-start helpers. Caller authenticates the operator; these
// expose original instructions only and issue no adoption/execution authority.
export function inspectPeerPinnedTeam(ledger){
 return ledger.read(tx=>{
  const {reference,bundle,sources}=inspectPeerPinnedTeamFrom(tx,{company_id:ledger.company_id});
  return boundLegacyReadReply({protocol:'peer-pinned-team-sources-v1',reference,plugin_version:bundle.plugin_version,team_sha256:bundle.team_sha256,governance_sha256:bundle.governance_sha256,lineage:copy(bundle.lineage),sources},{part:'plugin_version',reference,sha256:sources[0].sha256,offset:0,length:LEGACY_ADOPTION_LIMITS.range_characters});
 });
}
export function readPeerPinnedTeamFrom(tx,args,{company_id}={}){
 const input=copy(args);
 if(!input||Object.keys(input).some(key=>!['part','reference','sha256','offset','length'].includes(key))||!pinnedParts.includes(input.part)||!isHash(input.sha256))fail('PEER_PINNED_TEAM_INPUT');
  const {reference,bundle}=peerPinnedRow(tx,company_id);if(canonical(input.reference)!==canonical(reference))fail('PEER_PINNED_TEAM_CHANGED');
  const body=pinnedBody(bundle,input.part),entry=bundle.manifest.find(value=>value.part===input.part),offset=input.offset??0,length=input.length??LEGACY_ADOPTION_LIMITS.range_characters;
  const split=index=>index>0&&index<body.length&&/[\uD800-\uDBFF]/.test(body[index-1])&&/[\uDC00-\uDFFF]/.test(body[index]);
  if(input.sha256!==entry.sha256)fail('PEER_PINNED_TEAM_CHANGED');
  if(!Number.isSafeInteger(offset)||offset<0||offset>=body.length||!Number.isSafeInteger(length)||length<1||length>LEGACY_ADOPTION_LIMITS.range_characters||split(offset))fail('PEER_PINNED_TEAM_RANGE');
  let end=Math.min(body.length,offset+length);if(split(end))end--;if(end===offset)fail('PEER_PINNED_TEAM_RANGE');
  return boundLegacyReadReply({part:input.part,reference,sha256:entry.sha256,offset,length:end-offset,text:body.slice(offset,end),total_characters:body.length,next_offset:end<body.length?end:null,complete:end===body.length},{part:input.part,reference,sha256:entry.sha256,offset,length:LEGACY_ADOPTION_LIMITS.range_characters});
}
export function readPeerPinnedTeam(ledger,args){
 return ledger.read(tx=>readPeerPinnedTeamFrom(tx,args,{company_id:ledger.company_id}));
}

// This exact cut includes ordering, encodings and every current entry, including
// unknown root extensions. It deliberately does not claim that current entries
// alone qualify archived events, original native provenance or semantic scope.
export function captureLegacyOrigin(db){
 if(db.isTransaction!==true)fail('LEGACY_SNAPSHOT_REQUIRED');
 if(db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version!==4)fail('LEGACY_LAYOUT4_REQUIRED');
 const volume=db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(v.bytes AS BLOB))),0) AS bytes,COALESCE(MAX(length(CAST(v.bytes AS BLOB))),0) AS largest,COUNT(v.sha256) AS present FROM state_entries e LEFT JOIN immutable_values v USING(sha256)').get();
 if(volume.count>LEGACY_ADOPTION_LIMITS.source_rows||volume.bytes>LEGACY_ADOPTION_LIMITS.source_bytes||volume.largest>LEGACY_ADOPTION_LIMITS.source_value_bytes)fail('LEGACY_PREPARATION_CAPACITY','Complete current-source preparation exceeds its declared row/byte bound');
 if(volume.present!==volume.count)fail('LEGACY_SOURCE_MISSING');
 const rows=db.prepare('SELECT e.family,e.key,e.position,e.sha256,e.encoding,v.bytes,CAST(v.bytes AS BLOB) AS raw FROM state_entries e LEFT JOIN immutable_values v USING(sha256) ORDER BY e.family,e.key').all();
 const sources=rows.map(row=>{
  if(typeof row.bytes!=='string'||!(row.raw instanceof Uint8Array)||!Buffer.from(row.bytes).equals(Buffer.from(row.raw))||hash(row.raw)!==row.sha256)fail('LEGACY_SOURCE_CHANGED');
  if(typeof row.family!=='string'||typeof row.key!=='string'||!Number.isSafeInteger(row.position)||row.position<0||!['json','journal-array'].includes(row.encoding))fail('LEGACY_SOURCE_METADATA');
  return {source_id:legacySourceId(row),family:row.family,key:row.key,position:row.position,sha256:row.sha256,encoding:row.encoding,characters:row.bytes.length,utf8_bytes:row.raw.byteLength};
 });
 if(Buffer.byteLength(canonical(sources))>LEGACY_ADOPTION_LIMITS.inventory_bytes)fail('LEGACY_PREPARATION_CAPACITY');
 const accounted=new Set(sources.map(row=>row.sha256));let dependencyBytes=volume.bytes;
 const source_cut_sha256=peerDigest(sources);
 const state=bindSnapshots(readNormalized(db),sha=>{
  if(!accounted.has(sha)){
   const size=db.prepare('SELECT length(CAST(bytes AS BLOB)) AS bytes FROM immutable_values WHERE sha256=?').get(sha)?.bytes;
   if(!Number.isSafeInteger(size)||size<1)fail('LEGACY_SOURCE_MISSING');
   if(size>LEGACY_ADOPTION_LIMITS.source_value_bytes||dependencyBytes+size>LEGACY_ADOPTION_LIMITS.source_bytes)fail('LEGACY_PREPARATION_CAPACITY');
   dependencyBytes+=size;accounted.add(sha);
  }
  return readImmutable(db,sha);
 });
 // Canonical bootstrap-home classification checks actual normalized intake.
 // Bind that REAL provider to this same read transaction, without opening a
 // writable Store or replacing producer validation with a readiness flag.
 const admitIntake=baseline=>{
  if(db.isTransaction!==true)fail('LEGACY_SNAPSHOT_REQUIRED');
  const archive=db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(bytes AS BLOB))),0) AS bytes,COALESCE(MAX(length(CAST(bytes AS BLOB))),0) AS largest FROM immutable_values').get();
  if(archive.count>LEGACY_ADOPTION_LIMITS.source_rows||archive.bytes>LEGACY_ADOPTION_LIMITS.intake_archive_bytes||archive.largest>LEGACY_ADOPTION_LIMITS.source_value_bytes)fail('LEGACY_PREPARATION_CAPACITY');
  if(baseline!==undefined){
   if(!Number.isSafeInteger(baseline?.seq)||baseline.seq<0)fail('LEGACY_INTAKE_BASELINE_REQUIRED');
   const events=db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(value AS BLOB))),0) AS bytes FROM events WHERE seq>?').get(baseline.seq);
   if(events.count>LEGACY_ADOPTION_LIMITS.intake_events||events.bytes>LEGACY_ADOPTION_LIMITS.intake_event_bytes)fail('LEGACY_PREPARATION_CAPACITY');
  }
 };
 const provider=Object.freeze({db,storageInfo:()=>({format:'normalized-v4'}),readSnapshot:fn=>{if(db.isTransaction!==true)fail('LEGACY_SNAPSHOT_REQUIRED');return fn();},captureIntakeBaseline:()=>{admitIntake();return captureStorageBaseline(db);},readIntake:(baseline,options)=>{admitIntake(baseline);return readStorageIntake(db,baseline,options);}});
 bindOperatingIntake(state,provider);
 const authority={company_id:state.id,owner:copy(state.owner),team_sha256:state.team_sha256,governance_sha256:state.governance_sha256};
 const pinned_team=captureLegacyPinnedTeam(state,sources,source_cut_sha256);
 // Normalized-v4 stored keys may encode a logical identity containing NUL or
 // an isolated surrogate. readNormalized above already checked canonical form.
 const logicalKey=key=>key.startsWith('~json:')?JSON.parse(key.slice(6)):key;
 const byJob=new Map(sources.filter(row=>row.family==='jobs').map(row=>[logicalKey(row.key),row.source_id]));
 const issues=[];
 const add=(code,extra={})=>issues.push({code,...extra});
 if(state.paused!==true)add('LEGACY_PAUSE_REQUIRED');
 if(state.upgrade&&!['completed','recovered'].includes(state.upgrade.status))add('LEGACY_UPGRADE_UNRECONCILED');
 if(state.handover&&!['completed','accepted'].includes(state.handover.status))add('LEGACY_HANDOVER_UNRECONCILED');
 let pendingJobs=0,uncertainJobs=0,closedChildJobs=0;
 for(const [id,job] of Object.entries(state.jobs??{})){
  const source_id=byJob.get(id);if(!source_id)fail('LEGACY_JOB_SOURCE_MISSING');
  if(!job||typeof job!=='object'||Array.isArray(job)||job.id!==id){add('LEGACY_JOB_PROVENANCE_UNQUALIFIED',{source_id});uncertainJobs++;continue;}
  if(['queued','running'].includes(job.status)){add('LEGACY_JOB_ACTIVE',{source_id});pendingJobs++;continue;}
  const tracking=job.model_process_tracking;
  if(own(job,'model_process_tracking')&&(!validModelProcessTracking(tracking)||tracking.invocations.some(entry=>!entry.birth||!entry.closure||entry.job_id!==id||entry.instance_id!==job.instance_id||entry.worker_pid!==job.worker_pid||entry.host!==job.host))){add('LEGACY_MODEL_INVOCATION_UNCLOSED',{source_id});uncertainJobs++;continue;}
  const attempted=Boolean(tracking||job.native_id||job.started_at||job.worker_pid||job.execution_started_at||job.coordination?.resources?.length);
  if(attempted&&job.coordination_release?.termination_confirmed!==true){add('LEGACY_JOB_CLOSURE_UNKNOWN',{source_id});uncertainJobs++;continue;}
  // Even a valid shaped journal / legacy release flag only describes its child.
  // Original event provenance and whole-domain closure require their own bridge.
  if(attempted)closedChildJobs++;
 }
 let projection=null,qualification_error;
 try{
  const current=reviewedContext(state);
  const order=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
  const contextId=row=>row.family==='records'?logicalKey(row.key):row.family==='jobs'?'job:'+logicalKey(row.key):null;
  projection={protocol:'legacy-classification-frontier-v1',qualification:'Existing validated legacy classification frontier only; not an origin or peer-home seal. Unclassified originals remain compulsory with unknown/global applicability.',classifications:[...current.classifications].map(([id,value])=>({id,value:copy(value)})).sort(order),mandatory:[...current.mandatory].sort(),proofs:[...current.proofs].sort(),proof_jobs:[...current.proofJobs].sort(),scoped_homes:[...current.scopedHomes].map(([id,scopes])=>({id,scopes:[...scopes].sort()})).sort(order),global_mandatory:[...current.globalMandatory].sort(),unclassified_sources:sources.filter(row=>!contextId(row)||!current.classifications.has(contextId(row))).map(row=>row.source_id)};
 }catch(cause){
  add('LEGACY_CONTEXT_QUALIFICATION_HELD');
  // The original failure remains available to source callers; it is not turned
  // into a clean empty classification or a claim of semantic completeness.
  qualification_error=cause;
 }
 // These are missing source producers at this implementation cut. Caller DATA
 // cannot replace them. A future implementation must change this code under QA.
 add('FIXED_ADOPTION_ENVIRONMENT_PRODUCER_MISSING');
 add('ORIGINAL_OBLIGATION_TRANSITION_PRODUCER_MISSING');
 add('NATIVE_ADOPTION_REVIEW_BRIDGE_MISSING');
 const origin_projection_sha256=projection?peerDigest(projection):null;
 const basis={protocol:LEGACY_ORIGIN_PROTOCOL,authority,source_cut_sha256,origin_projection_sha256,issues};
 const result={state,sources,projection,pinned_team,issues,authority,source_cut_sha256,origin_projection_sha256,basis_sha256:peerDigest(basis),volume:{rows:volume.count,utf8_bytes:volume.bytes},execution:{pending_jobs:pendingJobs,uncertain_jobs:uncertainJobs,closed_child_jobs:closedChildJobs,whole_domain_qualified:false},notices:{unresolved:(state.notices??[]).filter(n=>!n.resolution).length}};
 if(qualification_error)Object.defineProperty(result,'qualification_error',{value:qualification_error});
 return result;
}

export function authenticateLegacyOwner(db,{session_id,epoch},host){
 const row=db.prepare("SELECT v.bytes,CAST(v.bytes AS BLOB) AS raw FROM state_entries e JOIN immutable_values v USING(sha256) WHERE e.family='root' AND e.key='owner'").get();
 if(!row||typeof row.bytes!=='string'||Buffer.byteLength(row.bytes)>16000||!Buffer.from(row.bytes).equals(Buffer.from(row.raw)))fail('LEGACY_OPERATOR_REQUIRED');
 const owner=readNormalizedValue(db,{family:'root',key:'owner'});
 const value=owner&&JSON.parse(owner.raw);
 if(!value||Object.keys(value).sort().join(',')!=='epoch,host,session_id'||value.host!==host||value.session_id!==session_id||value.epoch!==epoch)fail('LEGACY_OPERATOR_REQUIRED');
 return value;
}

export function legacyOriginReadiness(snapshot){
 return {protocol:LEGACY_ORIGIN_PROTOCOL,company_id:snapshot.authority.company_id,owner:copy(snapshot.authority.owner),source_cut_sha256:snapshot.source_cut_sha256,origin_projection_sha256:snapshot.origin_projection_sha256,basis_sha256:snapshot.basis_sha256,current_source_inventory:{...snapshot.volume,complete:true,coverage:'All current normalized entries, ordering and encodings; archived-event/native and semantic qualification remain separate'},issue_count:snapshot.issues.length,execution:snapshot.execution,notices:snapshot.notices,capabilities:{readiness:true,plan:true,inspect:true,read:true,apply:false},ready_for_apply:false,limits:LEGACY_ADOPTION_LIMITS};
}
