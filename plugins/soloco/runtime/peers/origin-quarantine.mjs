// Checked internal same-company quarantine. This is deliberately absent from
// public tools and never calls the historical adoptPeers implementation.
import {peerOriginPausedBootstrapInitialPurpose} from './origin-paused-bootstrap-contract.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {backupCompany} from '../storage-transfer.mjs';
import {PeerLedger,installPeerSchema,PEER_PROTOCOL,canonical,peerDigest} from './ledger.mjs';
import {inspectPeerPinnedTeamFrom} from './legacy-origin.mjs';
import {ORIGIN_LIMITS,assertOriginActor,originSafeData,withOriginLegacyStore,validatePeerOriginMechanicalReview,validateSelectedPeerOriginMechanicalReviewAtEpoch,inspectLegacyLocalReleaseFrom,capturePeerOriginCut,originSidecars,originHash,originNeed as need,originSame as same,originCopy as copy,originRef as ref} from './origin-plan.mjs';

export const ORIGIN_QUARANTINE_PROTOCOL='peer-origin-quarantine-v1';
const retainedBackups=new WeakMap();
// Diagnostic custody only. A provider's public property cannot attest which
// backup this operation actually retained, and callers receive only a copy.
export function retainedPeerOriginQuarantineBackupFrom(error){
 const value=error&&(typeof error==='object'||typeof error==='function')?retainedBackups.get(error):null;
 return value?copy(value):null;
}
function retainBackupFailure(error,backup){
 if(!error||typeof error!=='object'&&typeof error!=='function')return;
 const value=copy(backup);retainedBackups.set(error,value);
 // Keep existing mutable Error diagnostics without invoking a provider's
 // prototype setter or masking a frozen/nonextensible original failure.
 try{
  const old=Object.getOwnPropertyDescriptor(error,'retained_backup');
  if(old?Object.hasOwn(old,'value')&&old.writable:Object.isExtensible(error))Object.defineProperty(error,'retained_backup',old?{value:copy(value)}:{value:copy(value),writable:true,enumerable:true,configurable:true});
 }catch{}
}
const legacyTables=['company','events','state_entries','immutable_values','company_layout'];
const normalized=sql=>sql.replace(/\s+/g,' ').trim().replace(/;$/,'');
const fenceSQL=(table,op)=>`CREATE TRIGGER peer_origin_legacy_${table}_${op} BEFORE ${op.toUpperCase()} ON ${table} BEGIN SELECT RAISE(ABORT,'Original legacy writer retired: origin quarantine'); END`;
function newPeerState(db){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'peer_*' ORDER BY name").all().map(({name})=>({name,rows:db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all()}));}
function fence(db,tables){for(const table of tables)for(const op of ['insert','update','delete']){const sql=fenceSQL(table,op);db.exec(sql);const r=db.prepare("SELECT tbl_name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(`peer_origin_legacy_${table}_${op}`);need(r?.tbl_name===table&&normalized(r.sql)===normalized(sql),'ORIGIN_WRITER_FENCE_CHANGED');}}
export function assertPeerOriginLegacyFences(db){
 for(const table of legacyTables)for(const op of ['insert','update','delete']){const r=db.prepare("SELECT tbl_name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(`peer_origin_legacy_${table}_${op}`);need(r?.tbl_name===table&&normalized(r.sql)===normalized(fenceSQL(table,op)),'ORIGIN_WRITER_FENCE_CHANGED');}
}
function pages(tx,originId,kind,items){
 const refs=[];let part=[];
 const flush=()=>{if(!part.length)return;const r=tx.put('work_items',originId+':archive:'+kind+':'+refs.length,{kind:'origin_archive_page',protocol:'peer-origin-archive-page-v1',origin_id:originId,section:kind,index:refs.length,items:part},0);refs.push(ref('work_items',r));part=[];};
 for(const item of items){part.push(item);if(Buffer.byteLength(canonical(part))>ORIGIN_LIMITS.page_bytes){part.pop();flush();part.push(item);need(Buffer.byteLength(canonical(part))<=ORIGIN_LIMITS.page_bytes,'ORIGIN_ARCHIVE_ITEM_CAPACITY');}}flush();return {count:items.length,sha256:peerDigest(items),pages:refs};
}
function exactTextPages(tx,originId,section,value){
 const text=canonical(value),parts=[];for(let offset=0;offset<text.length;){let end=Math.min(text.length,offset+4096);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1])&&/[\uDC00-\uDFFF]/.test(text[end]))end--;need(end>offset,'ORIGIN_ARCHIVE_RANGE');parts.push({offset,text:text.slice(offset,end)});offset=end;}
 return {...pages(tx,originId,section,parts),encoding:'canonical-json-chunks-v1',body_sha256:peerDigest(value),characters:text.length};
}
function archiveEvents(tx,originId,db,events){
 return events.map(e=>{const value=db.prepare('SELECT value FROM events WHERE seq=?').get(e.seq)?.value;need(typeof value==='string'&&originHash(value)===e.sha256,'ORIGIN_ARCHIVE_CHANGED');const chunks=[];let offset=0;
  while(offset<value.length){let end=Math.min(value.length,offset+4096);if(end<value.length&&/[\uD800-\uDBFF]/.test(value[end-1])&&/[\uDC00-\uDFFF]/.test(value[end]))end--;need(end>offset,'ORIGIN_ARCHIVE_RANGE');const text=value.slice(offset,end),row=tx.put('work_items',originId+':event:'+e.seq+':'+offset,{kind:'origin_archive_event_chunk',origin_id:originId,seq:e.seq,sha256:e.sha256,offset,text,total_characters:value.length},0);chunks.push(ref('work_items',row));offset=end;}
  return {...e,characters:value.length,chunks};
 });
}
function verifiedBackup(store,directory,expected){
 const manifest=backupCompany(store,directory);
 // The general transfer helper omits historical storage-backup-* entries.
 // Quarantine preserves those originals too, under a distinct complete manifest
 // while retaining the helper's unmodified original manifest and its scope.
 const files=manifest.files.slice();
 for(const item of expected.body.sidecars){const key='.company/'+item.path,target=path.join(directory,key);if(files.some(r=>r.path===key))continue;fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.copyFileSync(path.join(store.dir,item.path),target,fs.constants.COPYFILE_EXCL);files.push({path:key,bytes:item.bytes,sha256:item.sha256});}
 files.sort((a,b)=>a.path.localeCompare(b.path));for(const item of files){const file=path.join(directory,item.path),st=fs.lstatSync(file);need(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size===item.bytes&&originHash(fs.readFileSync(file))===item.sha256,'ORIGIN_BACKUP_CHANGED');}
 fs.writeFileSync(path.join(directory,'origin-complete-backup.json'),canonical({protocol:'peer-origin-complete-backup-v1',source_cut_sha256:expected.sha256,canonical_backup_manifest_sha256:originHash(fs.readFileSync(path.join(directory,'manifest.json'))),files}),{flag:'wx',mode:0o600});
 const file=path.join(directory,'.company','company.sqlite'),db=new DatabaseSync(file,{readOnly:true});let cut;
 try{need(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','ORIGIN_BACKUP_CHANGED');db.exec('BEGIN');cut=capturePeerOriginCut(db,{directory:path.join(directory,'.company')});need(cut.sha256===expected.sha256,'ORIGIN_BACKUP_CHANGED');}finally{if(db.isTransaction)db.exec('ROLLBACK');db.close();}
 return {protocol:'peer-origin-backup-v1',directory,file,sha256:originHash(fs.readFileSync(file)),manifest_sha256:originHash(fs.readFileSync(path.join(directory,'origin-complete-backup.json'))),cut_sha256:cut.sha256,files};
}
function legacyReservations(db,snapshot){
 const out=[],releases=[];for(const [id,j]of Object.entries(snapshot.state.jobs??{})){
  const attempted=Boolean(j?.native_id||j?.started_at||j?.worker_pid||j?.model_process_tracking||j?.execution_started_at||j?.coordination?.resources?.length);
  if(!j||j.id!==id||typeof j!=='object'||Array.isArray(j)){out.push({job_id:id,status:'unknown',capacity_known:false,scope:'*',resources:null,original_unit:'legacy-standalone-assignment',release_authority:false});continue;}
  const local=attempted?inspectLegacyLocalReleaseFrom(db,j):null;
  if(['queued','running'].includes(j.status)||attempted&&(j.status!=='completed'||!local?.proved)){const source=snapshot.sources.find(r=>r.family==='jobs'&&(r.key===id||r.key==='~json:'+JSON.stringify(id)));need(source,'ORIGIN_JOB_SOURCE_REQUIRED');out.push({job_id:id,status:'unknown',capacity_known:true,scope:'*',resources:copy(j.coordination?.resources??null),original_unit:'legacy-standalone-assignment',source,original_status:j.status,native_id:j.native_id??null,local_release_proof:local,release_authority:false});}
  else if(local?.proved)releases.push(local);
 }
 return {reservations:out,local_releases:releases};
}
function quarantinePeerOriginSelected(root,actor,input,expected_epoch){
 const a=assertOriginActor(actor),args=originSafeData(input);need(args&&Object.keys(args).sort().join(',')==='plan_id,review_ids,source_instruction','ORIGIN_QUARANTINE_INPUT');const {plan_id,review_ids,source_instruction}=args;need(typeof source_instruction==='string'&&source_instruction.trim()&&source_instruction.length<=4000,'ORIGIN_INSTRUCTION_REQUIRED');
 return withOriginLegacyStore(root,a,store=>{
  const validate=()=>expected_epoch===undefined?validatePeerOriginMechanicalReview(store,{plan_id,review_ids},a):validateSelectedPeerOriginMechanicalReviewAtEpoch(store,{plan_id,review_ids},a,expected_epoch);
  const first=store.readSnapshot(validate);
  const backup=verifiedBackup(store,path.join(store.root,'.origin-quarantine-backups',randomUUID()),first.current);
  let checkedPlan;
  try{
  return store.peerLayoutTransition(()=>{
   const checked=validate();need(checked.current.sha256===backup.cut_sha256,'ORIGIN_CHANGED_DURING_BACKUP');
   const {plan,current,observed}=checked,db=store.db,id='origin:'+peerDigest([plan_id,peerDigest(plan)]),{reservations,local_releases}=legacyReservations(db,current.snapshot);checkedPlan=plan;
   need(!db.prepare("SELECT 1 FROM sqlite_master WHERE name GLOB 'peer_*' LIMIT 1").get(),'ORIGIN_PEER_SCHEMA_ALREADY_PRESENT');
   // Fence all existing data tables before any layout/schema-trigger effect.
   // The layout row is fenced immediately after the one exact 4 -> 5 update.
   fence(db,legacyTables.filter(t=>t!=='company_layout'));
   installPeerSchema(db,{company_id:plan.company_id,legacy_snapshot_sha256:backup.sha256});
   const pristine=newPeerState(db);need(db.prepare('UPDATE company_layout SET version=5 WHERE id=1 AND version=4').run().changes===1,'ORIGIN_LAYOUT_CHANGED');need(same(newPeerState(db),pristine),'ORIGIN_LAYOUT_TRIGGER_CHANGED_PEER_STATE');fence(db,['company_layout']);assertPeerOriginLegacyFences(db);
   const ledger=new PeerLedger(root,{connection:db});let origin_ref;
   ledger.writeWithin('origin.quarantined','founder',tx=>{
    const bundle=plan.cut.pinned_team,pins=tx.put('control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256:peerDigest(bundle)},0);
    const eventRecords=archiveEvents(tx,id,db,current.body.events),manifest={};
    for(const name of ['sources','archive','schema','sidecars'])manifest[name]=pages(tx,id,name,current.body[name]);manifest.events=pages(tx,id,'events',eventRecords);
    // Original business/current-meaning inputs precede the closed mechanical
    // plan/review journal. Both vectors are retained, with separate provenance;
    // the journal is not reintroduced as arbitrary new business instructions.
    manifest.original_sources=pages(tx,id,'original_sources',plan.cut.sources);
    manifest.projection=exactTextPages(tx,id,'projection',current.body.projection);
    const mechanical=observed.map(o=>({...o,historical_only:true,ordinary_membership:false}));
    const maintenance={protocol:'peer-origin-maintenance-authority-v1',status:'active',generation:1,pause_generation:1,scope:plan.maintenance.scope,source_instruction:plan.maintenance.source_instruction,expires_at:plan.expires_at,max_model_calls:plan.maintenance.max_model_calls,max_review_calls:plan.maintenance.max_review_calls,used_model_calls:0,used_review_calls:0,units:'new-origin-maintenance-model-invocation',old_allowance_conversion:'none',...(plan.frontier?{frontier_protocol:plan.frontier.protocol,max_frontier_calls:plan.frontier.max_model_calls,max_frontier_reviews:plan.frontier.max_review_calls,used_frontier_calls:0,used_frontier_reviews:0}:{}),...(plan.frontier_seal?{frontier_seal_protocol:plan.frontier_seal.protocol,frontier_seal_purpose:plan.frontier_seal.purpose,max_frontier_seal_reviews:plan.frontier_seal.max_reviews,used_frontier_seal_reviews:0}:{}),...(plan.paused_bootstrap?{paused_bootstrap:peerOriginPausedBootstrapInitialPurpose(plan.paused_bootstrap,plan.maintenance)}:{})};
    const legacy=current.snapshot.state,legacy_native_aliases=Array.from(new Set([legacy.owner.session_id,...Object.values(legacy.jobs??{}).map(j=>j?.native_id),...Object.values(legacy.sessions??{}).map(s=>s?.native_id),...(legacy.retired_sessions??[]).map(s=>s?.native_id),...Object.values(legacy.records??{}).map(r=>r?.author_instance)].filter(v=>typeof v==='string'&&v.length>0))).sort();
    const row=tx.put('control','origin',{protocol:ORIGIN_QUARANTINE_PROTOCOL,id,status:'quarantined',company_id:plan.company_id,owner:plan.owner,actor:a,plan_id,plan_sha256:peerDigest(plan),baseline_cut_sha256:plan.cut_sha256,current_cut_sha256:current.sha256,current_sources_sha256:current.snapshot.source_cut_sha256,manifest,backup,...(plan.ordinary_tasks?{ordinary_task_proposal:plan.ordinary_tasks}:{}),mechanical_reviews:mechanical,legacy_native_aliases,legacy_local_releases:local_releases,pinned_team:ref('control',pins),maintenance,legacy_authority:'retired-without-conversion',legacy_unknown_reservations:reservations.map(r=>'legacy-origin-slot:'+peerDigest(r.job_id)),sidecar_frontier:current.body.sidecars,late_obligation_refs:[],seal_ref:null,execution_resumed:false,source_instruction,quarantined_at_ms:Date.now()},0);origin_ref=ref('control',row);
    tx.put('control','company',{protocol:PEER_PROTOCOL,paused:true,policy_generation:1,pause_generation:1,founder_principal_id:'founder',policy:plan.policy,governance:bundle.governance,governance_sha256:bundle.governance_sha256,team_sha256:bundle.team_sha256,pinned_team:ref('control',pins),legacy_source_cut_sha256:bundle.lineage.source_cut_sha256,legacy_backup:backup,origin:origin_ref,activation:{status:'origin-quarantine',ordinary_authority:false},source_instruction},0);
    tx.put('principals','founder',{kind:'founder',principal_id:'founder',status:'active',generation:1,host:a.host,native_id:a.native_id,legacy_owner:plan.owner},0);
    for(const role of ['scheduler','publisher'])tx.put('principals',role,{kind:role,principal_id:role,status:'held',generation:1,internal:true},0);
    tx.put('control','resources',{worktrees:[]},0);
    for(const s of current.body.sources)tx.put('homes','legacy-'+peerDigest([s.family,s.key]),{kind:'legacy_origin_source',scope:'*',status:'current',qualification:'unclassified',origin_id:id,source:{kind:'legacy',...s},conditions:'All original conditions, units, UNKNOWN outcomes, spent attempts and expired grants retained. No ordinary authority inferred.'},0);
    for(const r of reservations)tx.put('slots','legacy-origin-slot:'+peerDigest(r.job_id),{kind:'legacy_origin_reservation',origin_id:id,...r},0);
    for(const [index,n]of (current.snapshot.state.notices??[]).entries()){
     const s=current.body.sources.find(s=>s.family==='notices'&&Number(s.key)===index);need(s,'ORIGIN_NOTICE_SOURCE_REQUIRED');
     tx.put('notices','legacy-origin-notice:'+peerDigest([index,n.id??null]),{protocol:'peer-origin-legacy-notice-v1',kind:'legacy_obligation',status:n.resolution?'legacy-resolved':'pending',scope:'*',principal_id:'founder',origin_id:id,source:s,original_id:n.id??null,original_kind:n.kind??null,summary_preview:typeof n.summary==='string'?n.summary.slice(0,500):'',summary_complete:typeof n.summary==='string'&&n.summary.length<=500,required_handoff:!n.resolution,legacy_attribution_preserved:true,resolution_is_new_acknowledgement:false},0);
    }
    inspectPeerPinnedTeamFrom(tx,{company_id:plan.company_id});tx.event('origin.paused_quarantine_committed',{origin_ref,backup_sha256:backup.sha256,legacy_reservations_preserved:reservations.length,ordinary_authority:false});
   });
   return {status:'quarantined',company_id:plan.company_id,origin_ref,backup,legacy_writers_fenced:true,execution_resumed:false};
  },{beforeCommit:db=>{
   // Storage owns COMMIT and the genuine same-scope policy cutoff. All schema
   // and writer-fence reads precede the last original plan expiry sample.
   assertPeerOriginLegacyFences(db);need(Date.parse(checkedPlan.expires_at)>Date.now(),'ORIGIN_PLAN_EXPIRED');
  }});
  }catch(error){retainBackupFailure(error,backup);throw error;}
 });
}

function origin(tx){const c=tx.get('control','company'),r=tx.get('control','origin');need(c?.value.protocol===PEER_PROTOCOL&&r?.value.protocol===ORIGIN_QUARANTINE_PROTOCOL&&same(c.value.origin,ref('control',r)),'ORIGIN_QUARANTINE_REQUIRED');return {c,r};}
export function readPeerOriginManifestFrom(tx,{section,page=0}){
 const {r}=origin(tx),descriptor=r.value.manifest[section];need(descriptor&&Number.isSafeInteger(page)&&page>=0&&page<descriptor.pages.length,'ORIGIN_MANIFEST_RANGE');const item=tx.getVersion(descriptor.pages[page]);need(item?.value.kind==='origin_archive_page'&&item.value.origin_id===r.value.id&&item.value.section===section&&item.value.index===page,'ORIGIN_ARCHIVE_CHANGED');return {origin_ref:ref('control',r),section,page,total_items:descriptor.count,sha256:descriptor.sha256,...(descriptor.encoding?{encoding:descriptor.encoding,body_sha256:descriptor.body_sha256,characters:descriptor.characters}:{}),value:item.value,next_page:page+1<descriptor.pages.length?page+1:null};
}
export function readPeerOriginSourceFrom(tx,{source_id,sha256,offset=0,length=4096}){
 const {r}=origin(tx),descriptor=r.value.manifest.sources;let found;
 for(const p of descriptor.pages){const row=tx.getVersion(p);need(row.value.kind==='origin_archive_page'&&row.value.origin_id===r.value.id,'ORIGIN_ARCHIVE_CHANGED');found=row.value.items.find(s=>s.source_id===source_id);if(found)break;}
 need(found&&found.sha256===sha256,'ORIGIN_SOURCE_CHANGED');const text=JSON.stringify(tx.resolveLegacy(found));need(originHash(text)===sha256,'ORIGIN_SOURCE_ENCODING_CHANGED');
 need(Number.isSafeInteger(offset)&&offset>=0&&offset<text.length&&Number.isSafeInteger(length)&&length>0&&length<=4096,'ORIGIN_SOURCE_RANGE');const split=i=>i>0&&i<text.length&&/[\uD800-\uDBFF]/.test(text[i-1])&&/[\uDC00-\uDFFF]/.test(text[i]);need(!split(offset),'ORIGIN_SOURCE_RANGE');let end=Math.min(text.length,offset+length);if(split(end))end--;need(end>offset,'ORIGIN_SOURCE_RANGE');return {source_id,sha256,offset,length:end-offset,text:text.slice(offset,end),total_characters:text.length,next_offset:end<text.length?end:null,complete:end===text.length};
}
// A late file does not disappear because its earlier snapshot was sealed.
// This creates only an original unresolved obligation; it grants no release.
export function observePeerOriginSidecars(ledger,actor){
 const a=assertOriginActor(actor);need(Object.getPrototypeOf(ledger)===PeerLedger.prototype,'ORIGIN_LEDGER_REQUIRED');let expected,frontier;const deadline=Date.now()+120000;return ledger.guardedWrite('origin.late_sidecars','founder',tx=>{
  const {c,r}=origin(tx),p=tx.get('principals','founder');need(p?.value.native_id===a.native_id&&same(p.value.legacy_owner,r.value.owner),'ORIGIN_OWNER_CHANGED');const now=originSidecars(ledger.directory);frontier=now;expected={c,r,p};if(same(now,r.value.sidecar_frontier)){tx.sealWrites();return {changed:false};}
  const evidence=tx.put('work_items',r.value.id+':late-sidecars:'+peerDigest(now),{kind:'origin_late_sidecar_evidence',origin_id:r.value.id,before:r.value.sidecar_frontier,after:now,release_authority:false,closure:'UNKNOWN'},0),notice=tx.put('notices',r.value.id+':late-sidecar-notice:'+evidence.sha256,{kind:'decision_required',status:'pending',scope:'*',principal_id:'founder',origin_id:r.value.id,required_handoff:true,evidence_ref:ref('work_items',evidence),uncertain_obligation:true},0);
  const changed=tx.put('control','origin',{...r.value,status:'quarantined',sidecar_frontier:now,late_obligation_refs:[...r.value.late_obligation_refs,ref('notices',notice)],seal_ref:null},r.revision),company=tx.put('control','company',{...c.value,origin:ref('control',changed)},c.revision);expected={c:company,r:changed,p};tx.sealWrites();return {changed:true,evidence_ref:ref('work_items',evidence),notice_ref:ref('notices',notice),closure:'UNKNOWN'};
 },view=>{assertPeerOriginLegacyFences(ledger.db);need(same(originSidecars(ledger.directory),frontier)&&same(view.get('control','company'),expected.c)&&same(view.get('control','origin'),expected.r)&&same(view.get('principals','founder'),expected.p),'ORIGIN_LATE_FRONTIER_CHANGED');return deadline;});
}

// Internal compatibility entrypoint is not a public adoption fallback.
export function quarantinePeerOrigin(root,actor,input){return quarantinePeerOriginSelected(root,actor,input);}
export function quarantinePeerOriginAtEpoch(root,actor,epoch,input){need(Number.isSafeInteger(epoch)&&epoch>0,'ORIGIN_EXPECTED_OWNER_EPOCH_REQUIRED');return quarantinePeerOriginSelected(root,actor,input,epoch);}
