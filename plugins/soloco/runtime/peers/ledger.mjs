// Shared by cooperating module/cache instances on the actual connection object.
// This is a trusted-host lifecycle fence, not protection against arbitrary raw
// SQL, connection manipulation, or implementations that ignore this protocol.
const PEER_CONNECTION_FENCE=Symbol.for('soloco.peer-ledger.connection-owner');
function peerConnectionFence(db){
  const descriptor=Object.getOwnPropertyDescriptor(db,PEER_CONNECTION_FENCE);
  if(descriptor){
    const value=descriptor.value;
    if(descriptor.configurable||descriptor.writable||!value||!Object.isFrozen(value)||value.protocol!=='peer-ledger-connection-v1'||['claim','owns','finish','idle'].some(k=>typeof value[k]!=='function'))throw Error('Incompatible peer connection ownership protocol');
    return value;
  }
  let owner=null,quarantined=false;
  const fence=Object.freeze({
    protocol:'peer-ledger-connection-v1',
    claim(){
      if(quarantined)throw Error('Peer connection is quarantined after uncertain transaction cleanup; replace the connection');
      if(owner!==null)throw Error('Peer connection already has an active transaction owner');
      owner=Object.freeze({});return owner;
    },
    owns(token){return owner===token;},
    finish(token,safe){
      if(owner!==token)throw Error('Peer connection ownership token changed; refusing to release another owner');
      owner=null;
      if(safe!==true)quarantined=true;
    },
    idle(){if(owner!==null)throw Error('Cannot close a connection with an active peer transaction owner');}
  });
  Object.defineProperty(db,PEER_CONNECTION_FENCE,{value:fence});
  return fence;
}
function peerConnectionEnded(db){
  try{return db.isOpen===false||db.isTransaction===false;}catch{return false;}
}

import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {REVIEW_SELECTION_RECIPE,REVIEW_PRODUCER_RECIPE,extractReviewSelection,reviewReference,reviewScope} from './review-selection.mjs';

export const PEER_PROTOCOL='peer-cos-v1';
export const PEER_LAYOUT=5;
export const FAMILIES=Object.freeze(['control','principals','grants','commands','tasks','slots','claims','homes','proposals','reviews','effects','conflicts','notices','messages','deliveries','subscriptions','work_items']);
const families=new Set(FAMILIES);
const MAX_VALUE_BYTES=1_000_000;
const MAX_FILTERED_ROWS=10_000;
// Materialization admission, not measured JS heap/RSS or whole-process limits.
// Classifier arrays admit at most 10,000 revisions, 8 MiB canonical UTF-8,
// and 16 MiB of encoded selected fields plus a 256-unit charge per row for
// numeric fields, references and framing. The charge is an accounting policy,
// not a claim about a JS engine's object size. Decoding expands bounded input;
// caller write buffers, SQLite work/storage and total audit IO are separate.
// Explicit audits page over-row histories only after aggregate admission and
// return uncertainty after complete verification, never a clean prefix.
export const REVIEW_SELECTION_HISTORY_BYTES=8*1024*1024;
export const REVIEW_SELECTION_HISTORY_COST=16*1024*1024;
export const REVIEW_SELECTION_AUDIT_PAGE_SIZE=100;
const REVIEW_SELECTION_ROW_COST=256;
const ZERO='0'.repeat(64);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);

// Reject values whose JSON encoding would silently drop or transform data.
export function canonical(value){
  const seen=new Set();
  const visit=v=>{
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number'&&Number.isFinite(v)&&!Object.is(v,-0))return v;
    if(!v||typeof v!=='object'||seen.has(v))throw Error('Peer values must be finite acyclic JSON');
    const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
    if(array?proto!==Array.prototype:![Object.prototype,null].includes(proto))throw Error('Peer values must be plain JSON');
    const keys=Reflect.ownKeys(v);
    if(keys.some(k=>typeof k!=='string'))throw Error('Peer JSON cannot contain symbol keys');
    seen.add(v);
    try{
      if(array){
        if(keys.length!==v.length+1||keys.some(k=>k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=v.length)))throw Error('Peer JSON arrays must be dense without extra properties');
        const result=[];
        for(let i=0;i<v.length;i++){
          const d=Object.getOwnPropertyDescriptor(v,String(i));
          if(!d||!d.enumerable||!own(d,'value'))throw Error('Peer JSON requires enumerable data properties');
          result.push(visit(d.value));
        }
        return result;
      }
      const result=Object.create(null);
      for(const k of keys.sort()){
        const d=Object.getOwnPropertyDescriptor(v,k);
        if(!d.enumerable||!own(d,'value'))throw Error('Peer JSON requires enumerable data properties');
        result[k]=visit(d.value);
      }
      return result;
    }finally{seen.delete(v);}
  };
  return JSON.stringify(visit(value));
}
export const peerDigest=value=>hash(canonical(value));
const exact=(v,label,max=300)=>{
  if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0')||/[\ud800-\udfff]/u.test(v))throw Error(`Invalid peer ${label}`);
  return v;
};
function family(value){if(!families.has(value))throw Error('Unknown peer row family');return value;}
function positive(v,label){if(!Number.isSafeInteger(v)||v<1)throw Error(`Invalid peer ${label}`);}
function digest(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw Error('Invalid peer hash');}
function decode(bytes,sha256){
  digest(sha256);
  if(typeof bytes!=='string'||Buffer.byteLength(bytes)>MAX_VALUE_BYTES||hash(bytes)!==sha256)throw Error('Peer row hash or capacity mismatch');
  const value=JSON.parse(bytes);
  if(canonical(value)!==bytes)throw Error('Peer row encoding changed');
  return value;
}
function dimensions(value){return {status:String(value?.status??value?.state??''),principal_id:String(value?.principal_id??value?.owner_principal_id??''),task_id:String(value?.task_id??''),scope:String(value?.scope??'')};}
function envelope(row){
  family(row.family);exact(row.id,'row identity',2000);positive(row.revision,'revision');positive(row.created_seq,'creation sequence');
  const value=decode(row.bytes,row.sha256);
  for(const [key,expected] of Object.entries(dimensions(value)))if(row[key]!==expected)throw Error('Peer row index differs from canonical value');
  return {id:row.id,revision:row.revision,sha256:row.sha256,created_seq:row.created_seq,value};
}
const filterKeys=['status','principal_id','task_id','scope'];
function filters(options={}){
  const result={};
  for(const key of filterKeys)if(options[key]!==undefined){
    const values=Array.isArray(options[key])?options[key]:[options[key]];
    if(!values.length||values.length>16||new Set(values).size!==values.length)throw Error('Invalid peer row filters');
    result[key]=values.map(v=>exact(v,key,1000)).sort();
  }
  return result;
}
function where(f,selected){
  let sql='family=?';const parameters=[family(f)];
  for(const [key,values] of Object.entries(selected)){sql+=` AND ${key} IN (${values.map(()=>'?').join(',')})`;parameters.push(...values);}
  return {sql,parameters};
}
function selectors(dim){
  const result=[];
  for(let mask=0;mask<16;mask++){const selected={};for(let i=0;i<4;i++)if(mask&(1<<i))selected[filterKeys[i]]=dim[filterKeys[i]];result.push(canonical(selected));}
  return result;
}
function selectedKeys(selected){
  let entries=[{}];for(const [key,values] of Object.entries(selected)){
    entries=entries.flatMap(entry=>values.map(value=>({...entry,[key]:value})));
    if(entries.length>256)throw Error('Peer filter expansion is too large');
  }return entries.map(canonical);
}
const selectionSchema={
  peer_review_recipe:'CREATE TABLE peer_review_recipe(id INTEGER PRIMARY KEY CHECK(id=1),recipe TEXT NOT NULL,producer_recipe TEXT NOT NULL,schema_sha256 TEXT NOT NULL,generation INTEGER NOT NULL)',
  peer_review_selection:'CREATE TABLE peer_review_selection(review_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,sha256 TEXT NOT NULL,anchor TEXT,outcome TEXT NOT NULL,scope TEXT,adverse INTEGER NOT NULL,subject_family TEXT,subject_id TEXT,subject_revision INTEGER,subject_sha256 TEXT)',
  peer_review_dirty:'CREATE TABLE peer_review_dirty(review_id TEXT PRIMARY KEY)',
  peer_review_errors:'CREATE TABLE peer_review_errors(review_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,sha256 TEXT NOT NULL,message TEXT NOT NULL)',
  peer_review_subject:'CREATE INDEX peer_review_subject ON peer_review_selection(subject_family,subject_id,subject_revision,subject_sha256,review_id)',
  peer_review_scope:'CREATE INDEX peer_review_scope ON peer_review_selection(adverse,scope,review_id)',
  peer_review_insert:"CREATE TRIGGER peer_review_insert AFTER INSERT ON peer_rows WHEN NEW.family='reviews' BEGIN INSERT INTO peer_review_dirty SELECT NEW.id WHERE NOT EXISTS(SELECT 1 FROM peer_review_dirty WHERE review_id=NEW.id); END",
  peer_review_update:"CREATE TRIGGER peer_review_update AFTER UPDATE ON peer_rows WHEN NEW.family='reviews' OR OLD.family='reviews' BEGIN INSERT INTO peer_review_dirty SELECT NEW.id WHERE NOT EXISTS(SELECT 1 FROM peer_review_dirty WHERE review_id=NEW.id); INSERT INTO peer_review_dirty SELECT OLD.id WHERE OLD.family='reviews' AND NOT EXISTS(SELECT 1 FROM peer_review_dirty WHERE review_id=OLD.id); END",
  peer_review_delete:"CREATE TRIGGER peer_review_delete BEFORE DELETE ON peer_rows WHEN OLD.family='reviews' BEGIN SELECT RAISE(ABORT,'Physical review deletion is forbidden'); END",
};
for(const [table,prefix] of [['peer_review_selection','projection'],['peer_review_errors','error']])for(const op of ['INSERT','UPDATE','DELETE']){
  const side=op==='DELETE'?'OLD':'NEW',mark=side=>`INSERT INTO peer_review_dirty SELECT ${side}.review_id WHERE NOT EXISTS(SELECT 1 FROM peer_review_dirty WHERE review_id=${side}.review_id);`;
  selectionSchema[`peer_review_${prefix}_${op.toLowerCase()}`]=`CREATE TRIGGER peer_review_${prefix}_${op.toLowerCase()} AFTER ${op} ON ${table} BEGIN ${mark(side)}${op==='UPDATE'?mark('OLD'):''} END`;
}
const normalizedSQL=sql=>sql.replace(/\s+/g,' ').trim();
const selectionSchemaHash=hash(canonical(Object.fromEntries(Object.entries(selectionSchema).map(([name,sql])=>[name,normalizedSQL(sql)]))));
function selectionError(code,message){throw Object.assign(Error(message),{code});}
function installSelection(db){
  for(const sql of Object.values(selectionSchema))db.exec(sql);
  const generation=db.prepare("SELECT generation FROM peer_generations WHERE family='reviews'").get().generation;
  db.prepare('INSERT INTO peer_review_recipe VALUES(1,?,?,?,?)').run(REVIEW_SELECTION_RECIPE,REVIEW_PRODUCER_RECIPE,selectionSchemaHash,generation);
}

// Checked migration/operator path or isolated fictional fixtures only.
export function installPeerSchema(db,{company_id,legacy_snapshot_sha256=null}={}){
  exact(company_id,'company identity');
  if(legacy_snapshot_sha256!==null)digest(legacy_snapshot_sha256);
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='peer_meta'").get())throw Error('Peer schema already exists; do not initialize again');
  db.exec('SAVEPOINT peer_schema_install');
  try{
    db.exec(`CREATE TABLE peer_meta(id INTEGER PRIMARY KEY CHECK(id=1),protocol TEXT NOT NULL,company_id TEXT NOT NULL,legacy_snapshot_sha256 TEXT,last_event_sha256 TEXT NOT NULL);
      CREATE TABLE peer_rows(family TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes TEXT NOT NULL,created_seq INTEGER NOT NULL,status TEXT NOT NULL,principal_id TEXT NOT NULL,task_id TEXT NOT NULL,scope TEXT NOT NULL,PRIMARY KEY(family,id));
      CREATE INDEX peer_rows_status ON peer_rows(family,status,id);
      CREATE INDEX peer_rows_principal ON peer_rows(family,principal_id,status,id);
      CREATE INDEX peer_rows_task ON peer_rows(family,task_id,status,id);
      CREATE INDEX peer_rows_scope ON peer_rows(family,scope,status,id);
      CREATE TABLE peer_versions(family TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes TEXT NOT NULL,PRIMARY KEY(family,id,revision));
      CREATE TABLE peer_generations(family TEXT PRIMARY KEY,generation INTEGER NOT NULL,count INTEGER NOT NULL);
      CREATE TABLE peer_membership(family TEXT NOT NULL,selector TEXT NOT NULL,count INTEGER NOT NULL CHECK(count>=0),PRIMARY KEY(family,selector));
      CREATE TABLE peer_events(seq INTEGER PRIMARY KEY,type TEXT NOT NULL,principal_id TEXT NOT NULL,bytes TEXT NOT NULL,sha256 TEXT NOT NULL,previous_sha256 TEXT NOT NULL);
      CREATE TABLE peer_outbox(seq INTEGER PRIMARY KEY REFERENCES peer_events(seq),status TEXT NOT NULL DEFAULT 'pending');
      CREATE INDEX peer_outbox_pending ON peer_outbox(status,seq);
      CREATE TRIGGER peer_history_update BEFORE UPDATE ON peer_versions BEGIN SELECT RAISE(ABORT,'Peer version history is immutable'); END;
      CREATE TRIGGER peer_history_delete BEFORE DELETE ON peer_versions BEGIN SELECT RAISE(ABORT,'Peer version history is immutable'); END;
      CREATE TRIGGER peer_events_update BEFORE UPDATE ON peer_events BEGIN SELECT RAISE(ABORT,'Peer event history is immutable'); END;
      CREATE TRIGGER peer_events_delete BEFORE DELETE ON peer_events BEGIN SELECT RAISE(ABORT,'Peer event history is immutable'); END;`);
    db.prepare('INSERT INTO peer_meta VALUES(1,?,?,?,?)').run(PEER_PROTOCOL,company_id,legacy_snapshot_sha256,ZERO);
    for(const name of FAMILIES)db.prepare('INSERT INTO peer_generations VALUES(?,0,0)').run(name);
    installSelection(db);
    db.exec('RELEASE peer_schema_install');
  }catch(error){db.exec('ROLLBACK TO peer_schema_install; RELEASE peer_schema_install');throw error;}
}

// Trusted internal API. Principal strings are attribution, not authentication.
export class PeerLedger{
  #fence;
  constructor(root,{busy_timeout_ms=100,onQuery=null,connection=null}={}){
    if(!path.isAbsolute(root))throw Error('Use an absolute company root');
    this.root=fs.realpathSync(root);
    if(!fs.statSync(this.root).isDirectory())throw Error('Company root is not a directory');
    this.directory=path.join(this.root,'.company');this.file=path.join(this.directory,'company.sqlite');
    for(const p of [this.directory,this.file,this.file+'-wal',this.file+'-shm']){
      try{if(fs.lstatSync(p).isSymbolicLink())throw Error('Refusing linked peer company storage');}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    if(!fs.existsSync(this.file))throw Error('Peer company does not exist; checked adoption is required');
    if(!Number.isSafeInteger(busy_timeout_ms)||busy_timeout_ms<0||busy_timeout_ms>1000)throw Error('Peer busy timeout must be bounded');
    Object.defineProperties(this,{
      db:{value:connection??new DatabaseSync(this.file),enumerable:true},
      ownsDb:{value:!connection,enumerable:true}
    });
    this.onQuery=onQuery;this.inTransaction=false;
    try{
      // Construction may occur during a sibling transaction. Reuse its fence;
      // never initialize away an existing owner or quarantine.
      this.#fence=peerConnectionFence(this.db);
      const main=this.db.prepare('PRAGMA database_list').all().find(v=>v.name==='main');
      if(!main?.file||fs.realpathSync(main.file)!==fs.realpathSync(this.file))throw Error('Peer connection does not match company storage');
      if(this.ownsDb)this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=${busy_timeout_ms};`);
      const layout=this.db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version;
      const meta=this.db.prepare('SELECT * FROM peer_meta WHERE id=1').get();
      if(layout!==PEER_LAYOUT||meta?.protocol!==PEER_PROTOCOL)throw Error('Checked peer adoption and physical legacy-writer fence required');
      exact(meta.company_id,'company identity');digest(meta.last_event_sha256);
      this.company_id=meta.company_id;
    }catch(e){if(this.ownsDb)this.db.close();throw e;}
  }
  query(sql,...parameters){this.onQuery?.({sql,parameters:parameters.length});return this.db.prepare(sql);}
  #checkedRow(row,checked=operation=>operation()){
    const item=checked(()=>envelope(row));
    const last=this.#selectionRead(checked,'SELECT revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? ORDER BY revision DESC LIMIT 1','get',row.family,row.id);
    checked(()=>{
      if(last?.revision!==row.revision||last?.sha256!==row.sha256||last?.bytes!==row.bytes)throw Error('Peer canonical row lost its exact immutable version binding');
      decode(last.bytes,last.sha256);
    });
    const first=this.#selectionRead(checked,'SELECT bytes FROM peer_events WHERE seq=?','get',row.created_seq);
    checked(()=>{if(!first)throw Error('Peer creation metadata has no event');});
    const event=this.#eventAt(row.created_seq,checked);
    checked(()=>{if(!event.payload.changes.some(c=>c.family===row.family&&c.id===row.id&&c.revision===1))throw Error('Peer creation metadata differs from event');});
    return item;
  }
  #get(f,id,checked=operation=>operation()){
    checked(()=>{family(f);exact(id,'row identity',2000);});
    const row=this.#selectionRead(checked,'SELECT * FROM peer_rows WHERE family=? AND id=?','get',f,id);
    if(!row){
      const historical=this.#selectionRead(checked,'SELECT 1 FROM peer_versions WHERE family=? AND id=? LIMIT 1','get',f,id);
      checked(()=>{if(historical)throw Error('Peer canonical row is missing but history remains');});return null;
    }
    return this.#checkedRow(row,checked);
  }
  #count(f,selected){
    const q=where(f,selected),keys=selectedKeys(selected);
    const expected=this.query(`SELECT COALESCE(SUM(count),0) AS n FROM peer_membership WHERE family=? AND selector IN (${keys.map(()=>'?').join(',')})`).get(f,...keys).n;
    if(!Number.isSafeInteger(expected)||expected<0)throw Error('Invalid peer membership count');
    if(expected>MAX_FILTERED_ROWS)throw Error('Peer filtered membership overflow; narrow filters');
    const count=this.query(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM peer_rows WHERE ${q.sql} LIMIT ?)`).get(...q.parameters,MAX_FILTERED_ROWS+1).n;
    if(count>MAX_FILTERED_ROWS)throw Error('Peer filtered membership overflow; narrow filters');
    if(count!==expected)throw Error('Peer filtered membership is incomplete or changed outside the ledger');
    return count;
  }
  #list(f,options={},checked=operation=>operation()){
    // Options and synchronous query hooks may run caller code. Private helpers
    // do not publish results: validate their boundary before using their output.
    const {limit,selected,cursor}=checked(()=>{
      family(f);const limit=options.limit??50;
      if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Peer list limit must be 1..100');
      return {limit,selected:filters(options),cursor:options.cursor};
    });
    const read=(sql,method,...parameters)=>{
      const statement=checked(()=>this.query(sql));
      return checked(()=>statement[method](...parameters));
    };
    const generation=read('SELECT generation FROM peer_generations WHERE family=?','get',f)?.generation;
    if(!Number.isSafeInteger(generation)||generation<0)throw Error('Peer family generation is missing');
    let after='';
    if(cursor){
      after=checked(()=>{
        let c;try{c=JSON.parse(Buffer.from(exact(cursor,'cursor',16000),'base64url').toString('utf8'));}catch{throw Error('Invalid peer cursor');}
        if(!c||c.family!==f||c.generation!==generation||canonical(c.filters)!==canonical(selected)||typeof c.after!=='string')throw Error('Stale or mismatched peer cursor; restart this collection');
        return exact(c.after,'cursor identity',2000);
      });
      const anchor=checked(()=>this.#get(f,after));
      if(!anchor||Object.entries(selected).some(([k,values])=>!values.includes(dimensions(anchor.value)[k])))throw Error('Peer cursor anchor is unavailable');
    }
    const q=where(f,selected),total=checked(()=>this.#count(f,selected));
    const raw=read(`SELECT * FROM peer_rows WHERE ${q.sql} AND id>? ORDER BY id LIMIT ?`,'all',...q.parameters,after,limit+1);
    const complete=raw.length<=limit,chosen=raw.slice(0,limit),items=chosen.map(row=>checked(()=>this.#checkedRow(row)));
    // This check also covers empty pages and the generation-bound cursor.
    return checked(()=>({items,total,complete,next_cursor:complete?null:Buffer.from(canonical({family:f,generation,filters:selected,after:chosen.at(-1).id})).toString('base64url')}));
  }
  #eventAt(seq,checked=operation=>operation()){
    const row=this.#selectionRead(checked,'SELECT * FROM peer_events WHERE seq=?','get',seq);
    return checked(()=>{
    if(!row)throw Error('Peer event chain is incomplete');
    positive(row.seq,'event sequence');exact(row.type,'event type');exact(row.principal_id,'principal identity');digest(row.sha256);digest(row.previous_sha256);
    const payload=JSON.parse(row.bytes);
    if(canonical(payload)!==row.bytes||!payload||Array.isArray(payload)||Object.keys(payload).sort().join(',')!=='changes,events'||!Array.isArray(payload.changes)||!Array.isArray(payload.events))throw Error('Peer event payload shape or encoding changed');
    for(const c of payload.changes){
      if(!c||Object.keys(c).sort().join(',')!=='family,id,previous_sha256,revision,sha256')throw Error('Peer change shape changed');
      family(c.family);exact(c.id,'row identity',2000);positive(c.revision,'revision');digest(c.sha256);
      if(c.revision===1?c.previous_sha256!==null:typeof c.previous_sha256!=='string')throw Error('Peer change predecessor mismatch');
      if(c.previous_sha256!==null)digest(c.previous_sha256);
    }
    for(const e of payload.events)if(!e||Object.keys(e).sort().join(',')!=='payload,type')throw Error('Peer nested event shape changed');else exact(e.type,'event type');
    const signed=canonical({seq:row.seq,type:row.type,principal_id:row.principal_id,payload,previous_sha256:row.previous_sha256});
    if(hash(signed)!==row.sha256)throw Error('Peer event hash changed');
    return {seq:row.seq,type:row.type,principal_id:row.principal_id,payload,sha256:row.sha256,previous_sha256:row.previous_sha256};
    });
  }
  #head(){
    const meta=this.query('SELECT * FROM peer_meta WHERE id=1').get();
    if(meta?.protocol!==PEER_PROTOCOL||meta.company_id!==this.company_id)throw Error('Peer metadata changed');
    const total=this.query('SELECT COALESCE(MAX(seq),0) AS n FROM peer_events').get().n;
    if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid peer event head');
    const tail=total?this.#eventAt(total):null;
    if(meta.last_event_sha256!==(tail?.sha256??ZERO))throw Error('Peer event head is inconsistent');
    return {total,sha256:meta.last_event_sha256};
  }
  #events({after=0,limit=100}={}){
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid peer event cursor/limit');
    const head=this.#head();
    if(after>head.total)throw Error('Peer event cursor is unavailable; recover from an exact snapshot');
    let previous=after?this.#eventAt(after).sha256:ZERO;
    const rows=this.query('SELECT seq FROM peer_events WHERE seq>? ORDER BY seq LIMIT ?').all(after,limit+1);
    const items=[];let expected=after+1;
    for(const row of rows.slice(0,limit)){
      const item=this.#eventAt(row.seq);
      if(item.seq!==expected++||item.previous_sha256!==previous)throw Error('Peer event chain changed or is incomplete');
      for(const c of item.payload.changes){
        const version=this.query('SELECT bytes,sha256 FROM peer_versions WHERE family=? AND id=? AND revision=?').get(c.family,c.id,c.revision);
        if(version?.sha256!==c.sha256)throw Error('Peer event version binding changed');
        decode(version.bytes,version.sha256);
        if(c.revision>1){const prior=this.query('SELECT sha256 FROM peer_versions WHERE family=? AND id=? AND revision=?').get(c.family,c.id,c.revision-1);if(prior?.sha256!==c.previous_sha256)throw Error('Peer event predecessor version changed');}
      }
      previous=item.sha256;items.push(item);
    }
    const complete=rows.length<=limit;
    if(complete&&((items.at(-1)?.seq??after)!==head.total||previous!==head.sha256))throw Error('Peer event terminal head mismatch');
    return {items,complete,next_cursor:items.at(-1)?.seq??after,total:head.total};
  }
  #selectionRead(checked,sql,method,...args){const statement=checked(()=>this.query(sql));return checked(()=>statement[method](...args));}
  #selectionCapability(checked,{clean=false}={}){
    const names=Object.keys(selectionSchema),objects=this.#selectionRead(checked,`SELECT name,sql FROM sqlite_master WHERE name IN (${names.map(()=>'?').join(',')})`,'all',...names);
    if(objects.length!==names.length||objects.some(v=>normalizedSQL(v.sql??'')!==normalizedSQL(selectionSchema[v.name])))selectionError('REVIEW_SELECTION_CAPABILITY','Checked review selection capability/schema required');
    const recipe=this.#selectionRead(checked,'SELECT * FROM peer_review_recipe WHERE id=1','get');
    if(recipe?.recipe!==REVIEW_SELECTION_RECIPE||recipe.producer_recipe!==REVIEW_PRODUCER_RECIPE||recipe.schema_sha256!==selectionSchemaHash)selectionError('REVIEW_SELECTION_CAPABILITY','Incompatible review selection/producer recipe');
    if(clean){
      if(this.#selectionRead(checked,'SELECT review_id FROM peer_review_dirty LIMIT 1','get'))selectionError('REVIEW_SELECTION_DIRTY','Review selection has unrefreshed canonical changes');
      if(this.#selectionRead(checked,'SELECT review_id FROM peer_review_errors LIMIT 1','get'))selectionError('REVIEW_SELECTION_INTEGRITY','Review selection has unknown production integrity');
      const generation=this.#selectionRead(checked,"SELECT generation FROM peer_generations WHERE family='reviews'",'get')?.generation;
      if(recipe.generation!==generation)selectionError('REVIEW_SELECTION_DIRTY','Review selection generation is incomplete');
    }
    return recipe;
  }
  #selectionFacts(current,pending,checked,initial=new Map(),fullAudit=false){
    const capacity=()=>({outcome:'INTEGRITY_UNKNOWN',anchor:null,subject:null,scope:null,adverse:['Fail','Blocked'].includes(current.value?.verdict),origin:'unknown',error:'Review retained classification exceeds 10,000 exact revisions'});
    if(current.revision>MAX_FILTERED_ROWS&&!fullAudit)return capacity();
    // These aggregate queries return scalars, not retained body arrays. Include
    // repeated IDs/hashes and row framing: many tiny bodies are not free.
    const volume=this.#selectionRead(checked,`SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(bytes AS BLOB))),0) AS utf8_bytes,COALESCE(SUM(length(CAST(bytes AS BLOB))+length(CAST(family AS BLOB))+length(CAST(id AS BLOB))+length(CAST(sha256 AS BLOB))+${REVIEW_SELECTION_ROW_COST}),0) AS materialization_cost,MIN(revision) AS first_revision,MAX(revision) AS last_revision FROM peer_versions WHERE family='reviews' AND id=?`,'get',current.id);
    if(!Number.isSafeInteger(volume?.count)||volume.count<0||!Number.isSafeInteger(volume.utf8_bytes)||volume.utf8_bytes<0||!Number.isSafeInteger(volume.materialization_cost)||volume.materialization_cost<volume.utf8_bytes)selectionError('REVIEW_SELECTION_INTEGRITY','Invalid review history aggregate');
    if(fullAudit&&(volume.count!==current.revision||volume.first_revision!==1||volume.last_revision!==current.revision))selectionError('REVIEW_SELECTION_INTEGRITY','Canonical review history is incomplete or noncontiguous');
    const excess=volume.utf8_bytes>REVIEW_SELECTION_HISTORY_BYTES
      ?`Review retained classification exceeds aggregate UTF-8 history byte budget: actual ${volume.utf8_bytes}, limit ${REVIEW_SELECTION_HISTORY_BYTES}`
      :volume.materialization_cost>REVIEW_SELECTION_HISTORY_COST
        ?`Review retained classification exceeds encoded-field/framing materialization cost budget: actual ${volume.materialization_cost}, limit ${REVIEW_SELECTION_HISTORY_COST}`:null;
    if(excess){
      if(fullAudit)selectionError('REVIEW_SELECTION_CAPACITY',excess);
      // Unknown is bound to this current revision. No partial facts qualify it;
      // raw verdicts and production anchors remain in immutable source history.
      return {...capacity(),error:excess};
    }
    if(!fullAudit&&volume.count>MAX_FILTERED_ROWS)return capacity();
    if(fullAudit&&current.revision>MAX_FILTERED_ROWS){
      // History-sized IO is intentional. Each completed SQL page is bounded;
      // there is no live SQLite iterator or accumulated decoded history here.
      let after=0,expected=1,lastHash=null;
      for(;;){
        const page=this.#selectionRead(checked,`SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family='reviews' AND id=? AND revision>? ORDER BY revision LIMIT ${REVIEW_SELECTION_AUDIT_PAGE_SIZE}`,'all',current.id,after);
        if(!page.length)break;
        for(const row of page){if(row.revision!==expected++)selectionError('REVIEW_SELECTION_INTEGRITY','Canonical review history is incomplete or noncontiguous');checked(()=>decode(row.bytes,row.sha256));lastHash=row.sha256;}
        after=page.at(-1).revision;
      }
      if(expected-1!==current.revision||lastHash!==current.sha256)selectionError('REVIEW_SELECTION_INTEGRITY','Canonical review history changed during audit');
      return capacity();
    }
    const history=this.#selectionRead(checked,"SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family='reviews' AND id=? ORDER BY revision LIMIT 10001",'all',current.id).map(({bytes,...row})=>({...row,value:checked(()=>decode(bytes,row.sha256))}));
    if(fullAudit&&(history.length!==current.revision||history.some((row,i)=>row.revision!==i+1)||history.at(-1)?.sha256!==current.sha256))selectionError('REVIEW_SELECTION_INTEGRITY','Canonical review history is incomplete or noncontiguous');
    if(current.revision>MAX_FILTERED_ROWS)return capacity();
    const resolve=r=>{
      checked(()=>{if(!r||Object.keys(r).sort().join(',')!=='family,id,revision,sha256')throw Error('Private exact production reference required');family(r.family);exact(r.id,'production identity',2000);positive(r.revision,'production revision');digest(r.sha256);});
      const final=pending.get(canonical([r.family,r.id]));
      const original=initial.get(canonical([r.family,r.id]));
      if(original!==undefined&&r.revision>original&&(!final||r.revision!==final.revision))return null;
      if(final?.revision===r.revision&&final.sha256!==r.sha256)return null;
      const row=this.#selectionRead(checked,'SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?','get',r.family,r.id,r.revision);
      if(!row||row.sha256!==r.sha256)return null;
      const value=checked(()=>decode(row.bytes,row.sha256));
      if(final?.revision===r.revision&&canonical(final.value)!==canonical(value))throw Error('Final pending production binding changed');
      return {family:row.family,id:row.id,revision:row.revision,sha256:row.sha256,value};
    };
    const facts=checked(()=>extractReviewSelection({current,history,resolve,canonical,hash}));
    if(facts.anchor?.review&&!resolve(facts.anchor.review))return {...facts,outcome:'INTEGRITY_UNKNOWN',error:'Production anchor is not committed history or a final pending version'};
    return facts;
  }
  #selectionMetadata(current,facts){return {review_id:current.id,revision:current.revision,sha256:current.sha256,anchor:facts.anchor?canonical(facts.anchor):null,outcome:facts.outcome,scope:facts.scope,adverse:Number(facts.adverse),subject_family:facts.subject?.family??null,subject_id:facts.subject?.id??null,subject_revision:facts.subject?.revision??null,subject_sha256:facts.subject?.sha256??null};}
  *#reviewIds(checked){
    let after=null;
    for(;;){
      const tail=`FROM peer_rows WHERE family='reviews'${after===null?'':' AND id>?'} ORDER BY id LIMIT ${REVIEW_SELECTION_AUDIT_PAGE_SIZE}`,args=after===null?[]:[after];
      // Bound variable-width identity metadata before retrieving its array.
      // A supported 2,000-UTF-16-unit identity needs at most 6,000 UTF-8 bytes.
      const size=this.#selectionRead(checked,`SELECT COUNT(*) AS count,COALESCE(MAX(length(CAST(id AS BLOB))),0) AS max_id_bytes FROM (SELECT id ${tail})`,'get',...args);
      if(!Number.isSafeInteger(size?.count)||size.count<0||size.count>REVIEW_SELECTION_AUDIT_PAGE_SIZE||!Number.isSafeInteger(size.max_id_bytes)||size.max_id_bytes<0||size.max_id_bytes>6000)selectionError('REVIEW_SELECTION_INTEGRITY','Invalid or oversized review audit identity page');
      const page=this.#selectionRead(checked,`SELECT id ${tail}`,'all',...args);
      if(page.length!==size.count)selectionError('REVIEW_SELECTION_INTEGRITY','Review audit identity page changed');
      if(!page.length)return;
      // This generator yields only IDs from completed bounded arrays. Every
      // resume reaches checked work before another yield; early close owns no
      // StatementSync iterator, and the caller retains transaction cleanup.
      for(const row of page){checked(()=>exact(row.id,'review identity',2000));yield row.id;}
      const next=page.at(-1).id;if(next===after)selectionError('REVIEW_SELECTION_INTEGRITY','Nonprogressing review audit cursor');after=next;
    }
  }
  #refreshSelection(ids,pending,checked,initial=new Map(),fullAudit=false){
    for(const id of ids){
      const raw=this.#selectionRead(checked,"SELECT * FROM peer_rows WHERE family='reviews' AND id=?",'get',id);
      if(!raw)selectionError('REVIEW_SELECTION_INTEGRITY','Canonical review disappeared during refresh');
      const current=checked(()=>envelope(raw)),final=pending.get(canonical(['reviews',id]));
      if(final&&(final.revision!==current.revision||final.sha256!==current.sha256))throw Error('Final review binding differs from pending production');
      const facts=this.#selectionFacts(current,pending,checked,initial,fullAudit),m=this.#selectionMetadata(current,facts);
      this.#selectionRead(checked,'INSERT INTO peer_review_selection VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(review_id) DO UPDATE SET revision=excluded.revision,sha256=excluded.sha256,anchor=excluded.anchor,outcome=excluded.outcome,scope=excluded.scope,adverse=excluded.adverse,subject_family=excluded.subject_family,subject_id=excluded.subject_id,subject_revision=excluded.subject_revision,subject_sha256=excluded.subject_sha256','run',...Object.values(m));
      this.#selectionRead(checked,'DELETE FROM peer_review_errors WHERE review_id=?','run',id);
      if(facts.error)this.#selectionRead(checked,'INSERT INTO peer_review_errors VALUES(?,?,?,?)','run',id,current.revision,current.sha256,facts.error);
      this.#selectionRead(checked,'DELETE FROM peer_review_dirty WHERE review_id=?','run',id);
    }
    if(!this.#selectionRead(checked,'SELECT review_id FROM peer_review_dirty LIMIT 1','get'))this.#selectionRead(checked,"UPDATE peer_review_recipe SET generation=(SELECT generation FROM peer_generations WHERE family='reviews') WHERE id=1",'run');
  }
  #auditSelection(pending,checked){
    this.#selectionCapability(checked);
    if(this.#selectionRead(checked,"SELECT v.id FROM peer_versions v WHERE v.family='reviews' AND NOT EXISTS(SELECT 1 FROM peer_rows r WHERE r.family='reviews' AND r.id=v.id) LIMIT 1",'get'))selectionError('REVIEW_SELECTION_INTEGRITY','Orphan review history requires disposition');
    if(this.#selectionRead(checked,"SELECT p.review_id FROM peer_review_selection p WHERE NOT EXISTS(SELECT 1 FROM peer_rows r WHERE r.family='reviews' AND r.id=p.review_id) LIMIT 1",'get')||this.#selectionRead(checked,"SELECT e.review_id FROM peer_review_errors e WHERE NOT EXISTS(SELECT 1 FROM peer_rows r WHERE r.family='reviews' AND r.id=e.review_id) LIMIT 1",'get'))selectionError('REVIEW_SELECTION_INTEGRITY','Orphan review selection metadata');
    let reviews=0,errors=0;
    for(const id of this.#reviewIds(checked)){
      const current=checked(()=>this.#get('reviews',id)),facts=this.#selectionFacts(current,pending,checked,new Map(),true),expected=this.#selectionMetadata(current,facts);
      const actual=this.#selectionRead(checked,'SELECT * FROM peer_review_selection WHERE review_id=?','get',current.id);
      if(!actual||canonical(actual)!==canonical(expected))selectionError('REVIEW_SELECTION_INTEGRITY','Exact review projection audit failed');
      const error=this.#selectionRead(checked,'SELECT * FROM peer_review_errors WHERE review_id=?','get',current.id);
      if(facts.error?(!error||error.revision!==current.revision||error.sha256!==current.sha256||error.message!==facts.error):Boolean(error))selectionError('REVIEW_SELECTION_INTEGRITY','Review error coverage audit failed');
      reviews++;if(facts.error)errors++;
    }
    if(this.#selectionRead(checked,'SELECT review_id FROM peer_review_dirty LIMIT 1','get'))selectionError('REVIEW_SELECTION_DIRTY','Review selection has dirty records');
    const recipe=this.#selectionCapability(checked),generation=this.#selectionRead(checked,"SELECT generation FROM peer_generations WHERE family='reviews'",'get').generation;
    if(recipe.generation!==generation)selectionError('REVIEW_SELECTION_DIRTY','Review selection generation audit failed');
    return {recipe:REVIEW_SELECTION_RECIPE,reviews,errors,clean:errors===0};
  }
  #queryReviews(options,checked,snapshot){
    const input=checked(()=>JSON.parse(canonical(options))),keys=Object.keys(input);
    if(keys.some(k=>!['subjects','scopes','limit','cursor'].includes(k)))throw Error('Unknown review selection option');
    const subjects=own(input,'subjects')?input.subjects:[],requested=own(input,'scopes')?input.scopes:[],limit=own(input,'limit')?input.limit:50;
    if(!Array.isArray(subjects)||subjects.length>100||!Array.isArray(requested)||requested.length>16||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Invalid bounded review selection');
    const refs=subjects.map(reviewReference),scopes=requested.length?[...new Set([...requested.map(reviewScope),'*','unknown'])].sort():[];
    if(new Set(refs.map(canonical)).size!==refs.length||new Set(requested.map(reviewScope)).size!==requested.length)throw Error('Duplicate review selectors');
    const selectors={subjects:refs.sort((a,b)=>canonical(a).localeCompare(canonical(b))),scopes},selector=hash(canonical(selectors)),recipe=this.#selectionCapability(checked,{clean:true});
    let after='';
    if(own(input,'cursor')){let c;try{c=JSON.parse(Buffer.from(exact(input.cursor,'review cursor',16000),'base64url').toString('utf8'));}catch{throw Error('Invalid review selection cursor');}
      if(c.recipe!==REVIEW_SELECTION_RECIPE||c.snapshot!==snapshot||c.generation!==recipe.generation||c.selector!==selector||typeof c.after!=='string')throw Error('Stale or mismatched review selection cursor');after=exact(c.after,'review cursor identity',2000);}
    const ids=new Set(),add=rows=>{for(const row of rows){ids.add(row.review_id);if(ids.size>MAX_FILTERED_ROWS)selectionError('LOOKUP_CAPACITY','10,000 matching review selection bound exceeded');}};
    for(const r of selectors.subjects)add(this.#selectionRead(checked,'SELECT review_id FROM peer_review_selection INDEXED BY peer_review_subject WHERE subject_family=? AND subject_id=? AND subject_revision=? AND subject_sha256=? ORDER BY review_id LIMIT 10001','all',r.family,r.id,r.revision,r.sha256));
    for(const scope of scopes)add(this.#selectionRead(checked,'SELECT review_id FROM peer_review_selection INDEXED BY peer_review_scope WHERE adverse=1 AND scope=? ORDER BY review_id LIMIT 10001','all',scope));
    const ordered=[...ids].sort();if(after&&!ids.has(after))throw Error('Review selection cursor anchor unavailable');
    const remaining=ordered.filter(id=>id>after),chosen=remaining.slice(0,limit),items=[];
    for(const id of chosen){
      const metadata=this.#selectionRead(checked,'SELECT revision,sha256 FROM peer_review_selection WHERE review_id=?','get',id),row=checked(()=>this.#get('reviews',id));
      if(!row||row.revision!==metadata?.revision||row.sha256!==metadata.sha256)selectionError('REVIEW_SELECTION_INTEGRITY','Selected review binding differs from projection');items.push(row);
    }
    this.#selectionCapability(checked,{clean:true});const complete=remaining.length<=limit;
    return checked(()=>({items,total:ordered.length,complete,next_cursor:complete?null:Buffer.from(canonical({recipe:REVIEW_SELECTION_RECIPE,snapshot,generation:recipe.generation,selector,after:chosen.at(-1)})).toString('base64url'),recipe:REVIEW_SELECTION_RECIPE}));
  }
  #transaction(type,principal,fn,write,external=false,maintenance=null,terminalGuard=null){
    if(this.inTransaction)throw Error('Nested peer transaction is forbidden');
    if(typeof fn!=='function')throw Error('Peer transaction callback required');
    if(['[object AsyncFunction]','[object GeneratorFunction]','[object AsyncGeneratorFunction]'].includes(Object.prototype.toString.call(fn)))throw Error('Models, network calls and asynchronous work are forbidden inside peer transactions');
    if(terminalGuard!==null){
      if(typeof terminalGuard!=='function'||typeof terminalGuard.then==='function'||['[object AsyncFunction]','[object GeneratorFunction]','[object AsyncGeneratorFunction]'].includes(Object.prototype.toString.call(terminalGuard)))throw Error('Synchronous peer terminal guard required');
      if(external||this.db.isTransaction!==false)throw Error('Guarded peer operations require their own physical commit');
    }
    if(write){exact(type,'event type');exact(principal,'principal identity');}
    const db=this.db,fence=this.#fence,token=fence.claim();
    let begun=false,active=false,safe=true,startAttempted=false;
    this.inTransaction=true;
    try{
      const outer=db.isTransaction;
      if(typeof outer!=='boolean')throw Error('Runtime must expose SQLite isTransaction');
      if(external&&!outer)throw Error('Active external transaction required; runtime must expose isTransaction');
      if(!external&&outer)throw Error('Caller-owned transaction requires writeWithin');
      // Claim precedes BEGIN/SAVEPOINT and every hook-capable startup read.
      safe=false;startAttempted=true;
      db.exec(external?'SAVEPOINT peer_migration_write':write?'BEGIN IMMEDIATE':'BEGIN');begun=true;active=true;
      const head=this.#head(),sequence=head.total+1;positive(sequence,'next event sequence');
      const changes=[],events=[],pending=new Map(),initial=new Map();
      // Fence history before preparing the first modifying statement. A failed
      // mutation poisons this transaction even if the callback catches it.
      let rowMutationStarted=false,mutationFailed=false,finalizing=false,putInProgress=false;
      const snapshot=randomUUID();
      const boundary=()=>{
        if(!active||!this.inTransaction||!fence.owns(token))throw Error('Peer transaction handle expired');
        if(db.isTransaction!==true)throw Error('Peer transaction connection is no longer active');
        if(mutationFailed)throw Error('Peer transaction contains a failed row mutation; rollback required');
      };
      const guard=()=>{boundary();if(finalizing)throw Error('Peer public handle is closed during final review maintenance');};
      const get=(f,id)=>{
        const key=canonical([f,id]);
        if(pending.has(key))return structuredClone(pending.get(key));
        return this.#get(f,id);
      };
      const tx=Object.freeze({
        sequence,
        get:(f,id)=>{guard();return get(f,id);},
        // Evidence only: exact canonical history bytes, not current authority or
        // per-version event/producer provenance. No created_seq is inferred.
        // Lookup ends when a modifying put begins, including a failed attempt;
        // successful no-op puts do not end it. External transactions may already
        // hold uncommitted versions, so are excluded.
        getVersion:ref=>{
          const historicalGuard=()=>{
            guard();
            if(external||rowMutationStarted)throw Error('Peer historical lookup requires an owning snapshot before pending writes; external transactions are excluded');
          };
          // Synchronous query hooks can reenter this same live handle. Check
          // after every operation that can run caller code, including failures,
          // before using a statement or returning any historical evidence.
          const checked=operation=>{
            historicalGuard();
            let result;
            try{result=operation();}catch(error){
              try{historicalGuard();}catch(boundaryError){
                throw new AggregateError([error,boundaryError],'Peer historical lookup failed after its transaction boundary changed');
              }
              throw error;
            }
            historicalGuard();
            return result;
          };
          const r=checked(()=>JSON.parse(canonical(ref)));
          if(!r||Array.isArray(r)||typeof r!=='object'||Object.keys(r).sort().join(',')!=='family,id,revision,sha256')throw Error('Exact peer historical reference requires family, id, revision and sha256 only');
          family(r.family);exact(r.id,'row identity',2000);positive(r.revision,'revision');digest(r.sha256);
          const statement=checked(()=>this.query('SELECT family,id,revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? AND revision=?'));
          const row=checked(()=>statement.get(r.family,r.id,r.revision));
          if(!row)throw Error('Exact peer historical version is unavailable in this snapshot');
          if(row.family!==r.family||row.id!==r.id||row.revision!==r.revision||row.sha256!==r.sha256)throw Error('Exact peer historical reference hash or identity mismatch');
          const value=checked(()=>decode(row.bytes,row.sha256));
          historicalGuard();
          return {family:r.family,id:r.id,revision:r.revision,sha256:r.sha256,value};
        },
        list:(f,o)=>{
          const collectionGuard=()=>{
            guard();
            if(rowMutationStarted)throw Error('List after pending writes requires a new snapshot');
          };
          const checked=operation=>{
            collectionGuard();
            let result;
            try{result=operation();}catch(error){
              try{collectionGuard();}catch(boundaryError){
                throw new AggregateError([error,boundaryError],'Peer collection enumeration failed after its transaction boundary changed');
              }
              throw error;
            }
            collectionGuard();
            return result;
          };
          collectionGuard();
          return this.#list(f,o,checked);
        },
        queryCurrentReviews:(options={})=>{
          const selectionGuard=()=>{guard();if(external||rowMutationStarted)throw Error('Review selection requires an owning snapshot before pending writes');};
          const checked=operation=>{
            selectionGuard();let result;
            try{result=operation();}catch(error){try{selectionGuard();}catch(boundaryError){throw new AggregateError([error,boundaryError],'Review selection failed after transaction boundary changed');}throw error;}
            selectionGuard();return result;
          };
          return this.#queryReviews(options,checked,snapshot);
        },
        count:(f,o={})=>{guard();return this.#count(f,filters(o));},
        events:o=>{guard();return this.#events(o);},
        resolveLegacy:ref=>{
          guard();if(!ref||!/^[a-f0-9]{64}$/.test(ref.sha256??''))throw Error('Exact legacy immutable reference required');
          const bytes=this.query('SELECT bytes FROM immutable_values WHERE sha256=?').get(ref.sha256)?.bytes;
          if(typeof bytes!=='string'||hash(bytes)!==ref.sha256)throw Error('Legacy immutable evidence is missing or changed');
          return JSON.parse(bytes);
        },
        put:(f,id,value,expected_revision=0)=>{
          guard();
          // Independently revised from the attributed external put-fence proposal.
          // Denial precedes argument inspection, including no-op/malformed calls.
          // A denied nested call must not enter the owner's finally block.
          if(putInProgress){mutationFailed=true;throw Error('Reentrant peer row mutation is forbidden; rollback required');}
          putInProgress=true;
          try{
            // Query preparation, actual retrieval/execution and canonical input
            // inspection can run synchronous caller code. Preserve an original
            // failure and report a simultaneous boundary failure separately.
            const checked=operation=>{
              guard();let result;
              try{result=operation();}catch(error){
                try{guard();}catch(boundaryError){
                  throw new AggregateError([error,boundaryError],'Peer put failed after its transaction boundary changed');
                }
                throw error;
              }
              guard();return result;
            };
            checked(()=>{
              if(!write)throw Error('Peer read snapshots cannot write');
              family(f);exact(id,'row identity',2000);
              if(!Number.isSafeInteger(expected_revision)||expected_revision<0)throw Error('Expected peer revision is required');
            });
            const current=checked(()=>get(f,id));
            if((current?.revision??0)!==expected_revision)throw Error('Peer revision conflict; reload exact state');
            const bytes=checked(()=>canonical(value));if(Buffer.byteLength(bytes)>MAX_VALUE_BYTES)throw Error('Peer value exceeds bounded row capacity');
            const sha256=hash(bytes);
            if(current&&current.sha256===sha256){guard();return current;}
            const revision=expected_revision+1;positive(revision,'revision');
            const normalized=checked(()=>JSON.parse(bytes)),dim=checked(()=>dimensions(normalized)),created_seq=current?.created_seq??sequence;
            const identity=canonical([f,id]);if(!initial.has(identity))initial.set(identity,current?.revision??0);
            rowMutationStarted=true;
            const run=(sql,...parameters)=>{
              const statement=checked(()=>this.query(sql));
              return checked(()=>statement.run(...parameters));
            };
            try{
              run('INSERT INTO peer_versions VALUES(?,?,?,?,?)',f,id,revision,sha256,bytes);
              run('INSERT INTO peer_rows VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(family,id) DO UPDATE SET revision=excluded.revision,sha256=excluded.sha256,bytes=excluded.bytes,status=excluded.status,principal_id=excluded.principal_id,task_id=excluded.task_id,scope=excluded.scope',f,id,revision,sha256,bytes,created_seq,dim.status,dim.principal_id,dim.task_id,dim.scope);
              if(current)for(const key of selectors(dimensions(current.value))){const r=run('UPDATE peer_membership SET count=count-1 WHERE family=? AND selector=? AND count>0',f,key);if(checked(()=>r.changes)!==1)throw Error('Peer membership predecessor missing');}
              for(const key of selectors(dim))run('INSERT INTO peer_membership VALUES(?,?,1) ON CONFLICT(family,selector) DO UPDATE SET count=count+1',f,key);
              const generation=run('UPDATE peer_generations SET generation=generation+1,count=count+? WHERE family=?',current?0:1,f);
              if(checked(()=>generation.changes)!==1)throw Error('Peer family generation is missing');
              guard();
              changes.push({family:f,id,revision,sha256,previous_sha256:current?.sha256??null});
              const result={id,revision,sha256,created_seq,value:normalized};pending.set(canonical([f,id]),structuredClone(result));return result;
            }catch(error){mutationFailed=true;throw error;}
          }finally{
            // This call owns only this flag. Poison, lifetime and the physical
            // connection owner remain controlled by the enclosing transaction.
            putInProgress=false;
          }
        },
        event:(kind,payload)=>{guard();if(!write)throw Error('Peer read snapshots cannot append events');exact(kind,'event type');events.push({type:kind,payload:JSON.parse(canonical(payload))});}
      });
      let result=fn(tx);
      if(result&&typeof result.then==='function'){
        if(result instanceof Promise)Promise.prototype.then.call(result,undefined,()=>{});
        throw Error('Models, network calls and asynchronous work are forbidden inside peer transactions');
      }
      guard();
      const reviewIds=[...new Set(changes.filter(c=>c.family==='reviews').map(c=>c.id))];
      if(maintenance||reviewIds.length){
        finalizing=true;
        const checked=operation=>{boundary();let value;try{value=operation();}catch(error){try{boundary();}catch(boundaryError){throw new AggregateError([error,boundaryError],'Review maintenance lost transaction boundary');}throw error;}boundary();return value;};
        const installed=this.#selectionRead(checked,"SELECT 1 FROM sqlite_master WHERE type='table' AND name='peer_review_recipe'",'get');
        if(maintenance==='upgrade'){
          if(!installed)checked(()=>installSelection(db));else this.#selectionCapability(checked);
          if(this.#selectionRead(checked,"SELECT v.id FROM peer_versions v WHERE v.family='reviews' AND NOT EXISTS(SELECT 1 FROM peer_rows r WHERE r.family='reviews' AND r.id=v.id) LIMIT 1",'get'))selectionError('REVIEW_SELECTION_INTEGRITY','Orphan canonical review history blocks upgrade');
          const ids=this.#reviewIds(checked);
          this.#selectionRead(checked,'DELETE FROM peer_review_selection','run');this.#selectionRead(checked,'DELETE FROM peer_review_errors','run');this.#selectionRead(checked,'DELETE FROM peer_review_dirty','run');
          this.#refreshSelection(ids,pending,checked,new Map(),true);result=this.#auditSelection(pending,checked);
        }else if(maintenance==='audit'){result=this.#auditSelection(pending,checked);}
        else if(installed){this.#selectionCapability(checked);this.#refreshSelection(reviewIds,pending,checked,initial);}
        finalizing=false;guard();
      }
      active=false;
      if(write&&(changes.length||events.length)){
        const currentHead=this.#head();
        if(currentHead.total!==head.total||currentHead.sha256!==head.sha256)throw Error('Peer event head changed inside callback');
        const payload={changes,events},bytes=canonical(payload),sha256=hash(canonical({seq:sequence,type,principal_id:principal,payload,previous_sha256:head.sha256}));
        this.query('INSERT INTO peer_events VALUES(?,?,?,?,?,?)').run(sequence,type,principal,bytes,sha256,head.sha256);
        this.query('INSERT INTO peer_outbox(seq) VALUES(?)').run(sequence);
        this.query('UPDATE peer_meta SET last_event_sha256=? WHERE id=1').run(sha256);
      }
      if(!fence.owns(token)||db.isTransaction!==true)throw Error('Peer transaction lost its connection owner before completion');
      if(terminalGuard!==null){
        // This private view exists only after ALL row/review/event/outbox/meta
        // staging. It reads the physical owning snapshot, never the planner's
        // cache, and does not reopen the already-expired public tx handle.
        let terminalActive=true,reading=false,terminalFailure=null,deadline;
        const state=()=>{
          if(!terminalActive||!this.inTransaction||!fence.owns(token)||db.isTransaction!==true)throw Error('Peer terminal view expired or lost its connection owner');
          if(mutationFailed||putInProgress)throw Error('Peer terminal view has a failed or active row mutation');
        };
        const usable=()=>{state();if(terminalFailure)throw terminalFailure;};
        const checked=operation=>{
          usable();let value;
          try{value=operation();}catch(error){
            try{state();}catch(boundaryError){terminalFailure=new AggregateError([error,boundaryError],'Peer terminal read failed after its transaction boundary changed');throw terminalFailure;}
            terminalFailure??=error;throw error;
          }
          try{usable();}catch(error){terminalFailure??=error;throw error;}
          return value;
        };
        const view=Object.freeze({get:(f,id)=>{
          usable();
          if(reading){terminalFailure=Error('Reentrant peer terminal read is forbidden; rollback required');throw terminalFailure;}
          reading=true;
          try{return this.#get(f,id,checked);}finally{reading=false;}
        }});
        try{
          deadline=terminalGuard(view);
          if(deadline&&typeof deadline.then==='function'){
            if(deadline instanceof Promise)Promise.prototype.then.call(deadline,undefined,()=>{});
            throw Error('Asynchronous work is forbidden inside peer terminal guards');
          }
          usable();
        }finally{terminalActive=false;}
        if(typeof deadline!=='number'||!Number.isFinite(deadline))throw Error('Peer terminal guard requires a primitive finite deadline');
        if(!fence.owns(token)||db.isTransaction!==true)throw Error('Peer transaction lost its connection owner before guarded commit');
        // No provider/onQuery or host guard runs between this final clock
        // sample and the actual owning COMMIT. A savepoint is not sufficient.
        const cutoff=Date.now();
        if(!Number.isFinite(cutoff)||cutoff>=deadline)throw Object.assign(Error('Peer task effect lease expired before physical commit'),{code:'TASK_EFFECT_EXPIRED'});
      }
      db.exec(external?'RELEASE peer_migration_write':'COMMIT');
      safe=external?db.isTransaction===true:peerConnectionEnded(db);
      if(!safe)throw Error('Peer transaction completion state is uncertain');
      begun=false;return result;
    }catch(error){
      active=false;
      if(begun){
        try{
          db.exec(external?'ROLLBACK TO peer_migration_write; RELEASE peer_migration_write':'ROLLBACK');
          safe=external?db.isTransaction===true:peerConnectionEnded(db);
          if(!safe)throw Error('Peer transaction rollback state is uncertain');
        }catch(rollbackError){
          // An owning rollback that actually ended the transaction can release
          // the token even if its caller observed an error afterward. A failed
          // external savepoint cleanup cannot prove containment merely because
          // its caller's outer transaction remains active.
          safe=!external&&peerConnectionEnded(db);
          throw new AggregateError([error,rollbackError],'Peer transaction rollback failed');
        }
      }else if(startAttempted){
        // Do not roll back a caller transaction on failed savepoint startup.
        // If startup may have changed it, quarantine this connection instead.
        safe=!external&&peerConnectionEnded(db);
      }
      throw error;
    }finally{
      active=false;this.inTransaction=false;
      fence.finish(token,safe);
    }
  }
  read(fn){return this.#transaction(null,null,fn,false);}
  write(type,principal,fn){return this.#transaction(type,typeof principal==='object'&&principal!==null?principal.principal_id:principal,fn,true);}
  // Trusted internal composition only. The caller must create terminalGuard
  // from its opaque task authority; neither this ledger nor the callback may
  // be supplied to a model. Even inspections/replays acquire BEGIN IMMEDIATE.
  guardedWrite(type,principal,fn,terminalGuard){
    if(terminalGuard===undefined||terminalGuard===null)throw Error('Synchronous peer terminal guard required');
    return this.#transaction(type,typeof principal==='object'&&principal!==null?principal.principal_id:principal,fn,true,false,null,terminalGuard);
  }
  // Caller owns commit/rollback. A savepoint contains failed ledger mutations.
  writeWithin(type,principal,fn){if(this.ownsDb)throw Error('External migration transaction required');return this.#transaction(type,principal,fn,true,true);}
  upgradeReviewSelection({retained_copy=false,producer_recipe=null}={}){
    if(retained_copy!==true||producer_recipe!==REVIEW_PRODUCER_RECIPE)throw Error('Explicit retained-copy and supported producer recipe admission required');
    return this.#transaction('peer.review-selection.upgrade','operator',()=>null,true,false,'upgrade');
  }
  auditReviewSelection(){return this.#transaction(null,null,()=>null,false,false,'audit');}
  events(options){return this.read(tx=>tx.events(options));}
  verify({after=0,limit=100}={}){return this.events({after,limit});}
  close(){
    if(this.inTransaction)throw Error('Cannot close an active peer transaction');
    if(this.ownsDb){
      this.#fence.idle();
      if(this.db.isTransaction===true)throw Error('Cannot close a connection with an active external transaction');
      this.db.close();
    }
  }
}
