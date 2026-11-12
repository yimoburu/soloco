// Trusted SOURCE preparation and read-only capacity accounting. This module
// grants no execution, release, acceptance, retry or accounting authority.
import fs from 'node:fs';
import {types} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {validModelProcessTracking,modelProcessTransition} from '../model-process-closure.mjs';
import {PeerLedger,canonical,peerDigest} from './ledger.mjs';

const PROJECTION='legacy-local-worker-occupancy-v1',RECORD='legacy-local-worker-occupancy-record-v1';
const LIMITS=Object.freeze({rows:10000,bytes:64*1024*1024,value_bytes:16*1024*1024,projection_bytes:900000,changes:100000,depth:128,nodes:1000000});
const captures=new WeakMap(),ownErrors=new WeakSet();
const hash=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(canonical(value));
const same=(a,b)=>canonical(a)===canonical(b);
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&!value.includes('\0');
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
const order=(a,b)=>a<b?-1:a>b?1:0;
const eventTypes=new Set(['job.model_process.requested','job.model_process.born','job.model_process.closed','job.completed','job.failed','job.process_closure_reconciled']);
const recipe=Object.freeze({protocol:'legacy-local-worker-policy-v1',runtime_version:'0.7.8',unit:'legacy-standalone-assignment',worker_cap:3,
  predicate:'queued/running OR ((runtime_task OR started_at) AND cancelled/interrupted/failed AND termination_confirmed !== true)',
  engine_sha256:'f3cc2d3e6b217cb786d02658fa55341402dcac36e07c3a7bc203303f24364bcd',
  model_process_closure_sha256:'6572e0bf415988edba857dead658e17ab2e0c2ce55a4a8f57acda317ea58e72a',
  scope:'original-CLI-child-only',whole_domain_qualified:false});
const recipeHash=peerDigest(recipe);
function fail(code,cause){const error=Object.assign(Error(code,{cause}),{code});ownErrors.add(error);throw error;}
function need(ok,code='LEGACY_WORKER_OCCUPANCY_UNQUALIFIED'){if(!ok)fail(code);}
function json(value){try{return JSON.parse(value);}catch(cause){fail('LEGACY_WORKER_SOURCE_JSON',cause);}}
function bounded(value){let nodes=0;const visit=(v,depth)=>{need(++nodes<=LIMITS.nodes&&depth<=LIMITS.depth,'LEGACY_WORKER_PREPARATION_CAPACITY');if(v&&typeof v==='object')for(const item of Object.values(v))visit(item,depth+1);};visit(value,0);return value;}
function logicalKey(key){
  need(typeof key==='string'&&!/[\u0000\ud800-\udfff]/u.test(key),'LEGACY_WORKER_SOURCE_KEY');
  if(!key.startsWith('~json:'))return key;
  const decoded=json(key.slice(6));need(typeof decoded==='string','LEGACY_WORKER_SOURCE_KEY');
  const encoded=decoded.startsWith('~json:')||/[\u0000\ud800-\udfff]/u.test(decoded)?'~json:'+JSON.stringify(decoded):decoded;
  need(encoded===key,'LEGACY_WORKER_SOURCE_KEY');return decoded;
}
function sourceRef(row){const value={family:row.family,key:row.key,position:row.position,encoding:row.encoding,sha256:row.sha256};return {...value,source_id:'legacy-source:'+peerDigest(value)};}
function checkSource(db,{peer=false}={}){
  need(!types.isProxy(db)&&Object.getPrototypeOf(db)===DatabaseSync.prototype&&db.isTransaction===true,'LEGACY_WORKER_SNAPSHOT_REQUIRED');
  const layout=db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version;
  need(layout===(peer?5:4),'LEGACY_WORKER_LAYOUT_REQUIRED');
  if(peer)for(const table of ['company','events','state_entries','immutable_values','company_layout'])for(const op of ['insert','update','delete']){
    const row=db.prepare("SELECT tbl_name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(`peer_origin_legacy_${table}_${op}`);
    const sql=`CREATE TRIGGER peer_origin_legacy_${table}_${op} BEFORE ${op.toUpperCase()} ON ${table} BEGIN SELECT RAISE(ABORT,'Original legacy writer retired: origin quarantine'); END`;
    const normalize=value=>value.replace(/\s+/g,' ').trim().replace(/;$/,'');
    need(row?.tbl_name===table&&normalize(row.sql)===normalize(sql),'LEGACY_WORKER_FENCE_REQUIRED');
  }
}
function inventory(db,table,column){
  const totals=db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(${column} AS BLOB))),0) AS bytes,COALESCE(MAX(length(CAST(${column} AS BLOB))),0) AS largest FROM ${table}`).get();
  need(['count','bytes','largest'].every(k=>Number.isSafeInteger(totals[k])&&totals[k]>=0)&&totals.count<=LIMITS.rows&&totals.bytes<=LIMITS.bytes&&totals.largest<=LIMITS.value_bytes,'LEGACY_WORKER_PREPARATION_CAPACITY');
  const metadata=table==='events'?db.prepare('SELECT COALESCE(SUM(length(CAST(at AS BLOB))+length(CAST(type AS BLOB))),0) AS bytes FROM events').get():db.prepare('SELECT COALESCE(SUM(length(CAST(sha256 AS BLOB))),0) AS bytes FROM immutable_values').get();
  need(Number.isSafeInteger(metadata.bytes)&&metadata.bytes>=0&&metadata.bytes<=4*1024*1024,'LEGACY_WORKER_PREPARATION_CAPACITY');
}
function currentInventory(db){
  const t=db.prepare('SELECT COUNT(*) AS count,COUNT(v.sha256) AS present,COALESCE(SUM(length(CAST(v.bytes AS BLOB))),0) AS bytes,COALESCE(SUM(length(CAST(e.family AS BLOB))+length(CAST(e.key AS BLOB))+length(CAST(e.sha256 AS BLOB))+length(CAST(e.encoding AS BLOB))),0) AS metadata_bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256)').get();
  need(['count','present','bytes','metadata_bytes'].every(k=>Number.isSafeInteger(t[k])&&t[k]>=0)&&t.count===t.present&&t.count<=LIMITS.rows&&t.bytes<=LIMITS.bytes&&t.metadata_bytes<=4*1024*1024,'LEGACY_WORKER_PREPARATION_CAPACITY');
}
function rawText(row,key){const value=row[key];need(typeof value==='string'&&row.raw instanceof Uint8Array&&Buffer.from(value).equals(Buffer.from(row.raw)),'LEGACY_WORKER_SOURCE_BYTES');return value;}
function fixedRecipe(version){
  need(version===recipe.runtime_version,'LEGACY_WORKER_POLICY_UNAVAILABLE');
  // Pin the reviewed derivative to its actual source leaves. A later source
  // release needs an explicit recipe review, not semver/readiness inference.
  need(hash(fs.readFileSync(new URL('../engine.mjs',import.meta.url)))===recipe.engine_sha256&&hash(fs.readFileSync(new URL('../model-process-closure.mjs',import.meta.url)))===recipe.model_process_closure_sha256,'LEGACY_WORKER_POLICY_UNAVAILABLE');
  return clone(recipe);
}
function localProof(job,events,vault){
  const held={proved:false,scope:'original-CLI-child-only',whole_domain_qualified:false};
  if(job.coordination_release?.termination_confirmed!==true||!validModelProcessTracking(job.model_process_tracking)||job.model_process_tracking.invocations.some(i=>!i.birth||!i.closure||i.job_id!==job.id||i.instance_id!==job.instance_id||i.worker_pid!==job.worker_pid||i.host!==job.host))return held;
  try{
    const phases=new Map(),used=[];let release=null;
    for(const event of events){
      if(!eventTypes.has(event.type))continue;
      const p=event.payload,d=p?.storage_delta;
      if(!Array.isArray(d?.changes)||!d.changes.some(c=>(c.after??c.before)?.family==='jobs'&&(c.after??c.before).key===job.id))continue;
      const {sha256,...body}=d;
      need(sha256===hash(JSON.stringify([event.seq,event.at,event.type,{...p,storage_delta:body}]))&&d.previous_event_sha256===event.previous_record_sha256,'LEGACY_WORKER_LOCAL_PROOF');
      for(const change of d.changes){
        if(change.after?.family!=='jobs'||change.after.key!==job.id)continue;
        const load=r=>{need(r?.family==='jobs'&&r.key===job.id&&hex(r.sha256)&&vault.has(r.sha256),'LEGACY_WORKER_LOCAL_PROOF');return bounded(json(vault.get(r.sha256)));};
        const before=change.before?load(change.before):null,after=load(change.after);
        need(after?.id===job.id&&after.instance_id===job.instance_id&&after.worker_pid===job.worker_pid&&after.host===job.host,'LEGACY_WORKER_LOCAL_PROOF');
        if(event.type.startsWith('job.model_process.')){
          need(modelProcessTransition(before,after,event.type),'LEGACY_WORKER_LOCAL_PROOF');
          const other=v=>Object.fromEntries(Object.entries(v??{}).filter(([key])=>key!=='model_process_tracking'));
          need(same(other(before),other(after)),'LEGACY_WORKER_LOCAL_PROOF');
          const phase=event.type.split('.').at(-1);
          for(const entry of after.model_process_tracking.invocations){
            const prior=before?.model_process_tracking?.invocations.find(i=>i.invocation_id===entry.invocation_id);
            if(phase==='requested'&&!prior||phase==='born'&&prior?.birth===null&&entry.birth||phase==='closed'&&prior?.closure===null&&entry.closure){
              const old=phases.get(entry.invocation_id)??{};need(!old[phase],'LEGACY_WORKER_LOCAL_PROOF');old[phase]={seq:event.seq,entry};phases.set(entry.invocation_id,old);
            }
          }
        }else if(after.coordination_release?.termination_confirmed===true&&after.coordination_release.reason==='model_process_closed'&&same(after.model_process_tracking,job.model_process_tracking)&&after.native_id===job.native_id)release={seq:event.seq,job_sha256:change.after.sha256,event_sha256:event.value_sha256};
      }
      used.push({seq:event.seq,sha256:event.value_sha256});
    }
    need(release&&job.model_process_tracking.invocations.every(i=>{const p=phases.get(i.invocation_id);return p?.requested&&p.born&&p.closed&&p.requested.seq<p.born.seq&&p.born.seq<p.closed.seq&&p.closed.seq<=release.seq&&same(p.closed.entry,i);}),'LEGACY_WORKER_LOCAL_PROOF');
    return {...held,proved:true,job_id:job.id,tracking_sha256:peerDigest(job.model_process_tracking),release,events:used};
  }catch(error){if(!ownErrors.has(error))throw error;return {...held,hold:error.code};}
}
function capture(db,options){
  checkSource(db,options);inventory(db,'immutable_values','bytes');inventory(db,'events','value');currentInventory(db);
  const vault=new Map(),archive=[];
  for(const row of db.prepare('SELECT sha256,bytes,CAST(bytes AS BLOB) AS raw FROM immutable_values ORDER BY sha256').all()){
    const value=rawText(row,'bytes');need(hex(row.sha256)&&hash(row.raw)===row.sha256,'LEGACY_WORKER_VAULT_CHANGED');vault.set(row.sha256,value);archive.push({sha256:row.sha256,utf8_bytes:row.raw.length});
  }
  const rows=db.prepare('SELECT family,key,position,sha256,encoding FROM state_entries ORDER BY family,key').all();need(rows.length<=LIMITS.rows,'LEGACY_WORKER_PREPARATION_CAPACITY');
  const sources=[],jobs=[],root=new Map();let changes=0;
  for(const row of rows){
    need(text(row.family)&&Number.isSafeInteger(row.position)&&row.position>=0&&['json','journal-array'].includes(row.encoding)&&vault.has(row.sha256),'LEGACY_WORKER_SOURCE_METADATA');
    const original=vault.get(row.sha256),key=logicalKey(row.key),source={...sourceRef(row),characters:original.length,utf8_bytes:Buffer.byteLength(original)};sources.push(source);
    if(row.family==='root'){need(row.encoding==='json'&&!root.has(key),'LEGACY_WORKER_SOURCE_METADATA');root.set(key,bounded(json(vault.get(row.sha256))));}
    if(row.family==='shape'&&key==='jobs')need(row.encoding==='json'&&json(vault.get(row.sha256))==='object','LEGACY_WORKER_JOBS_REQUIRED');
    if(row.family==='jobs')jobs.push({key,source,value:row.encoding==='json'?bounded(json(vault.get(row.sha256))):null});
  }
  need(rows.some(r=>r.family==='shape'&&logicalKey(r.key)==='jobs'),'LEGACY_WORKER_JOBS_REQUIRED');
  need(text(root.get('id'))&&root.get('paused')===true,'LEGACY_WORKER_PAUSED_COMPANY_REQUIRED');
  const policy=fixedRecipe(root.get('runtime_version')),events=[],eventManifest=[];let previous=null;
  for(const row of db.prepare('SELECT seq,at,type,value,CAST(value AS BLOB) AS raw FROM events ORDER BY seq').all()){
    const value=rawText(row,'value');need(row.seq===(previous?.seq??0)+1&&text(row.at)&&text(row.type),'LEGACY_WORKER_EVENT_CHANGED');
    const payload=bounded(json(value));changes+=payload?.storage_delta?.changes?.length??0;need(changes<=LIMITS.changes,'LEGACY_WORKER_PREPARATION_CAPACITY');
    const event={seq:row.seq,at:row.at,type:row.type,value_sha256:hash(value),previous_record_sha256:previous?hash(JSON.stringify([previous.seq,previous.at,previous.type,previous.value])):null,payload};events.push(event);
    eventManifest.push({seq:row.seq,at:row.at,type:row.type,sha256:event.value_sha256,utf8_bytes:row.raw.length});previous=row;
  }
  const partition=jobs.map(({key,source,value:job})=>{
    const valid=job&&typeof job==='object'&&!Array.isArray(job)&&job.id===key&&['queued','running','completed','failed','cancelled','interrupted','quarantined'].includes(job.status);
    if(!valid)return {job_id:key,source,capacity_known:false,local_occupied:null,reason:'malformed-original-job',original_unit:policy.unit,release_authority:false};
    const attempted=Boolean(job.runtime_task||job.model_process_tracking||job.native_id||job.started_at||job.worker_pid||job.execution_started_at||job.coordination?.resources?.length),proof=attempted?localProof(job,events,vault):null,active=['queued','running'].includes(job.status);
    // This is a conservative qualification of the reviewed original job-slot
    // policy, not a semantic status or UNKNOWN reservation release.
    // Missing attempt fields are not a negative producer proof. Prelaunch
    // failures need their own reviewed not-started recipe before becoming free.
    const occupied=active||proof?.proved!==true;
    return {job_id:key,source,original_status:job.status,original_unit:policy.unit,attempted,capacity_known:true,local_occupied:occupied,local_release_proof:proof,release_authority:false};
  }).sort((a,b)=>order(a.job_id,b.job_id));
  const data={protocol:PROJECTION,company_id:root.get('id'),original_layout:4,policy_recipe:policy,policy_recipe_sha256:recipeHash,source_cut_sha256:peerDigest(sources),database_cut_sha256:peerDigest({sources,archive,events:eventManifest}),sources,archive,events:eventManifest,jobs:partition,scope:'original-CLI-child-only',whole_domain_qualified:false,release_authority:false,authority_issued:false};
  need(Buffer.byteLength(canonical(data))<=LIMITS.projection_bytes,'LEGACY_WORKER_PROJECTION_CAPACITY');return data;
}

export function captureLegacyLocalWorkerOccupancyFrom(db){need(arguments.length===1,'LEGACY_WORKER_INPUT');const data=capture(db),cap=Object.freeze(Object.create(null));captures.set(cap,{db,data});return cap;}
export function inspectOriginalLegacyLocalWorkerOccupancy(cap){need(arguments.length===1,'LEGACY_WORKER_INPUT');const r=captures.get(cap);need(r,'LEGACY_WORKER_ORIGINAL_CAPTURE_REQUIRED');return clone(r.data);}

function exact(tx,r){need(r?.family==='work_items'&&typeof r.id==='string'&&r.revision===1&&hex(r.sha256),'LEGACY_WORKER_RECORD_REQUIRED');const row=tx.getVersion(r),current=tx.get(r.family,r.id);need(row&&current&&same(ref(r.family,row),r)&&same(ref(r.family,current),r)&&peerDigest(row.value)===row.sha256,'LEGACY_WORKER_RECORD_CHANGED');return current;}
function physicalRow(db,family,row,{historical=false}={}){
  need(row&&typeof row.id==='string'&&Number.isSafeInteger(row.revision)&&hex(row.sha256),'LEGACY_WORKER_PHYSICAL_BINDING');
  const raw=historical?db.prepare('SELECT sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?').get(family,row.id,row.revision):db.prepare('SELECT revision,sha256,bytes,created_seq FROM peer_rows WHERE family=? AND id=?').get(family,row.id);
  need(raw&&raw.sha256===row.sha256&&raw.bytes===canonical(row.value)&&(historical||raw.revision===row.revision&&raw.created_seq===row.created_seq),'LEGACY_WORKER_PHYSICAL_BINDING');
}
function physicalEvent(db,event){
  need(event&&Number.isSafeInteger(event.seq),'LEGACY_WORKER_PHYSICAL_BINDING');
  const raw=db.prepare('SELECT type,principal_id,bytes,sha256,previous_sha256 FROM peer_events WHERE seq=?').get(event.seq);
  need(raw&&raw.type===event.type&&raw.principal_id===event.principal_id&&raw.bytes===canonical(event.payload)&&raw.sha256===event.sha256&&raw.previous_sha256===event.previous_sha256&&hash(canonical({seq:event.seq,type:event.type,principal_id:event.principal_id,payload:event.payload,previous_sha256:event.previous_sha256}))===raw.sha256,'LEGACY_WORKER_PHYSICAL_BINDING');
}
function allSlots(tx,db){
  const physical=db.prepare("SELECT id,revision,sha256 FROM peer_rows WHERE family='slots' ORDER BY id").all();need(physical.length<=LIMITS.rows,'LEGACY_WORKER_PREPARATION_CAPACITY');
  const result=[];let cursor,total;
  for(;;){const page=tx.list('slots',{limit:100,...(cursor?{cursor}:{})});need(page&&Array.isArray(page.items)&&page.items.length<=100&&typeof page.complete==='boolean','LEGACY_WORKER_SLOT_INVENTORY');if(page.total!==undefined){need(Number.isSafeInteger(page.total)&&page.total>=0&&page.total<=LIMITS.rows&&(total===undefined||total===page.total),'LEGACY_WORKER_SLOT_INVENTORY');total=page.total;}result.push(...page.items);need(result.length<=physical.length,'LEGACY_WORKER_SLOT_INVENTORY');if(page.complete)break;need(page.items.length>0&&typeof page.next_cursor==='string'&&page.next_cursor!==cursor,'LEGACY_WORKER_SLOT_INVENTORY');cursor=page.next_cursor;}
  need((total===undefined||result.length===total)&&result.length===physical.length,'LEGACY_WORKER_SLOT_INVENTORY');result.sort((a,b)=>order(a.id,b.id));
  for(let i=0;i<result.length;i++)need(result[i].id===physical[i].id&&result[i].revision===physical[i].revision&&result[i].sha256===physical[i].sha256&&peerDigest(result[i].value)===result[i].sha256,'LEGACY_WORKER_SLOT_INVENTORY');return result;
}
// NEW integration contract, intentionally unavailable without the frozen
// backend's real mechanical-plan validator/canonical quarantine writer join.
// Call before ANY planned/physical put, in the actual owning P1 transaction.
export function inspectLegacyMaintenanceWorkerCapacityFrom(ledger,tx){
  need(arguments.length===2,'LEGACY_WORKER_INPUT');
  need(!types.isProxy(ledger)&&Object.getPrototypeOf(ledger)===PeerLedger.prototype,'LEGACY_WORKER_LEDGER_REQUIRED');
  const db=Object.getOwnPropertyDescriptor(ledger,'db')?.value;checkSource(db,{peer:true});
  const c=tx.get('control','company'),o=tx.get('control','origin');
  physicalRow(db,'control',c);physicalRow(db,'control',o);
  need(c?.value.protocol==='peer-cos-v1'&&c.value.paused===true&&o?.value.protocol==='peer-origin-quarantine-v1'&&same(c.value.origin,ref('control',o))&&o.value.company_id===ledger.company_id,'LEGACY_WORKER_ORIGIN_REQUIRED');
  const row=exact(tx,o.value.legacy_worker_occupancy_ref),v=row.value;
  physicalRow(db,'work_items',row);physicalRow(db,'work_items',row,{historical:true});
  need(Object.keys(v).sort().join(',')==='kind,origin_id,plan_id,plan_sha256,projection,projection_sha256,protocol,release_authority,source_cut_sha256,whole_domain_qualified','LEGACY_WORKER_RECORD_CHANGED');
  need(v.kind==='legacy_local_worker_occupancy'&&v.protocol===RECORD&&v.origin_id===o.value.id&&v.plan_id===o.value.plan_id&&v.plan_sha256===o.value.plan_sha256&&v.source_cut_sha256===o.value.current_cut_sha256&&v.release_authority===false&&v.whole_domain_qualified===false&&v.projection_sha256===peerDigest(v.projection),'LEGACY_WORKER_RECORD_CHANGED');
  const produced=tx.events({after:row.created_seq-1,limit:1}).items[0],change=produced?.payload?.changes?.find(r=>r.family==='control'&&r.id==='origin'&&r.revision===1);
  physicalEvent(db,produced);
  need(produced?.seq===row.created_seq&&produced.type==='origin.quarantined'&&change&&produced.payload.changes.some(r=>r.family==='work_items'&&r.id===row.id&&r.revision===1&&r.sha256===row.sha256)&&produced.payload.events.some(e=>e.type==='origin.paused_quarantine_committed'),'LEGACY_WORKER_RECORD_PRODUCER');
  const initial=tx.getVersion({family:'control',id:'origin',revision:1,sha256:change.sha256});
  physicalRow(db,'control',initial,{historical:true});
  need(initial?.value.id===o.value.id&&same(initial.value.legacy_worker_occupancy_ref,ref('work_items',row))&&initial.value.plan_sha256===v.plan_sha256&&initial.value.current_cut_sha256===v.source_cut_sha256,'LEGACY_WORKER_RECORD_PRODUCER');
  // Recompute from the entire physically frozen original inventory. A matching
  // DATA record, record kind, label or release Boolean cannot substitute for it.
  const current=capture(db,{peer:true});need(current.company_id===ledger.company_id&&same(current,v.projection),'LEGACY_WORKER_SOURCE_CHANGED');
  const slots=allSlots(tx,db),byJob=new Map(current.jobs.map(j=>[j.job_id,j])),listed=o.value.legacy_unknown_reservations;
  need(Array.isArray(listed)&&new Set(listed).size===listed.length,'LEGACY_WORKER_RESERVATION_CHANGED');
  const reservations=slots.filter(r=>r.value?.kind==='legacy_origin_reservation');need(same(reservations.map(r=>r.id).sort(),listed.slice().sort()),'LEGACY_WORKER_RESERVATION_CHANGED');
  need(current.jobs.every(j=>j.capacity_known===true),'LEGACY_WORKER_RESERVATION_UNQUALIFIED');
  let occupied=current.jobs.filter(j=>j.local_occupied).length;const legacy=[],newExecutions=[];
  for(const slot of slots){
    const s=slot.value;need(s&&typeof s==='object'&&['active','unknown','released'].includes(s.status),'LEGACY_WORKER_SLOT_INVENTORY');
    if(s.kind==='legacy_origin_reservation'){
      const j=byJob.get(s.job_id);need(s.status==='unknown'&&s.release_authority===false&&s.origin_id===o.value.id&&j&&same(s.source,j.source)&&j.capacity_known===true&&s.capacity_known!==false,'LEGACY_WORKER_RESERVATION_UNQUALIFIED');
      legacy.push({ref:ref('slots',slot),job_id:j.job_id,local_occupied:j.local_occupied,unknown_reservation_preserved:true,release_authority:false});
    }else if(['active','unknown'].includes(s.status)){need(s.capacity_known!==false,'LEGACY_WORKER_RESERVATION_UNQUALIFIED');occupied++;newExecutions.push(ref('slots',slot));}
  }
  const workerCap=c.value.policy?.worker_cap;need(Number.isSafeInteger(workerCap)&&workerCap>0&&workerCap<=recipe.worker_cap,'LEGACY_WORKER_POLICY_UNAVAILABLE');
  return {protocol:'legacy-aware-maintenance-capacity-v1',origin_ref:ref('control',o),projection_ref:ref('work_items',row),projection_sha256:v.projection_sha256,worker_cap:workerCap,occupied,remaining:Math.max(0,workerCap-occupied),admission_available:occupied<workerCap,legacy,new_execution_refs:newExecutions,authority_issued:false,old_reservations_released:false,whole_domain_qualified:false};
}
