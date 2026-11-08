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
import {createHash} from 'node:crypto';

export const PEER_PROTOCOL='peer-cos-v1';
export const PEER_LAYOUT=5;
export const FAMILIES=Object.freeze(['control','principals','grants','commands','tasks','slots','claims','homes','proposals','reviews','effects','conflicts','notices','messages','deliveries','subscriptions','work_items']);
const families=new Set(FAMILIES);
const MAX_VALUE_BYTES=1_000_000;
const MAX_FILTERED_ROWS=10_000;
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
  #checkedRow(row){
    const item=envelope(row);
    const last=this.query('SELECT revision,sha256,bytes FROM peer_versions WHERE family=? AND id=? ORDER BY revision DESC LIMIT 1').get(row.family,row.id);
    if(last?.revision!==row.revision||last?.sha256!==row.sha256||last?.bytes!==row.bytes)throw Error('Peer canonical row lost its exact immutable version binding');
    decode(last.bytes,last.sha256);
    const first=this.query('SELECT bytes FROM peer_events WHERE seq=?').get(row.created_seq);
    if(!first)throw Error('Peer creation metadata has no event');
    const event=this.#eventAt(row.created_seq);
    if(!event.payload.changes.some(c=>c.family===row.family&&c.id===row.id&&c.revision===1))throw Error('Peer creation metadata differs from event');
    return item;
  }
  #get(f,id){
    family(f);exact(id,'row identity',2000);
    const row=this.query('SELECT * FROM peer_rows WHERE family=? AND id=?').get(f,id);
    if(!row){if(this.query('SELECT 1 FROM peer_versions WHERE family=? AND id=? LIMIT 1').get(f,id))throw Error('Peer canonical row is missing but history remains');return null;}
    return this.#checkedRow(row);
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
  #eventAt(seq){
    const row=this.query('SELECT * FROM peer_events WHERE seq=?').get(seq);
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
  #transaction(type,principal,fn,write,external=false){
    if(this.inTransaction)throw Error('Nested peer transaction is forbidden');
    if(typeof fn!=='function')throw Error('Peer transaction callback required');
    if(['[object AsyncFunction]','[object GeneratorFunction]','[object AsyncGeneratorFunction]'].includes(Object.prototype.toString.call(fn)))throw Error('Models, network calls and asynchronous work are forbidden inside peer transactions');
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
      const changes=[],events=[],pending=new Map();
      // Fence history before preparing the first modifying statement. A failed
      // mutation poisons this transaction even if the callback catches it.
      let rowMutationStarted=false,mutationFailed=false;
      const guard=()=>{
        if(!active||!this.inTransaction||!fence.owns(token))throw Error('Peer transaction handle expired');
        if(db.isTransaction!==true)throw Error('Peer transaction connection is no longer active');
        if(mutationFailed)throw Error('Peer transaction contains a failed row mutation; rollback required');
      };
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
        count:(f,o={})=>{guard();return this.#count(f,filters(o));},
        events:o=>{guard();return this.#events(o);},
        resolveLegacy:ref=>{
          guard();if(!ref||!/^[a-f0-9]{64}$/.test(ref.sha256??''))throw Error('Exact legacy immutable reference required');
          const bytes=this.query('SELECT bytes FROM immutable_values WHERE sha256=?').get(ref.sha256)?.bytes;
          if(typeof bytes!=='string'||hash(bytes)!==ref.sha256)throw Error('Legacy immutable evidence is missing or changed');
          return JSON.parse(bytes);
        },
        put:(f,id,value,expected_revision=0)=>{
          guard();if(!write)throw Error('Peer read snapshots cannot write');family(f);exact(id,'row identity',2000);
          if(!Number.isSafeInteger(expected_revision)||expected_revision<0)throw Error('Expected peer revision is required');
          const current=get(f,id);
          if((current?.revision??0)!==expected_revision)throw Error('Peer revision conflict; reload exact state');
          const bytes=canonical(value);if(Buffer.byteLength(bytes)>MAX_VALUE_BYTES)throw Error('Peer value exceeds bounded row capacity');
          const sha256=hash(bytes);if(current&&current.sha256===sha256)return current;
          const revision=expected_revision+1;positive(revision,'revision');
          const normalized=JSON.parse(bytes),dim=dimensions(normalized),created_seq=current?.created_seq??sequence;
          rowMutationStarted=true;
          try{
            this.query('INSERT INTO peer_versions VALUES(?,?,?,?,?)').run(f,id,revision,sha256,bytes);
            this.query('INSERT INTO peer_rows VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(family,id) DO UPDATE SET revision=excluded.revision,sha256=excluded.sha256,bytes=excluded.bytes,status=excluded.status,principal_id=excluded.principal_id,task_id=excluded.task_id,scope=excluded.scope').run(f,id,revision,sha256,bytes,created_seq,dim.status,dim.principal_id,dim.task_id,dim.scope);
            if(current)for(const key of selectors(dimensions(current.value))){const r=this.query('UPDATE peer_membership SET count=count-1 WHERE family=? AND selector=? AND count>0').run(f,key);if(r.changes!==1)throw Error('Peer membership predecessor missing');}
            for(const key of selectors(dim))this.query('INSERT INTO peer_membership VALUES(?,?,1) ON CONFLICT(family,selector) DO UPDATE SET count=count+1').run(f,key);
            if(this.query('UPDATE peer_generations SET generation=generation+1,count=count+? WHERE family=?').run(current?0:1,f).changes!==1)throw Error('Peer family generation is missing');
            changes.push({family:f,id,revision,sha256,previous_sha256:current?.sha256??null});
            const result={id,revision,sha256,created_seq,value:normalized};pending.set(canonical([f,id]),structuredClone(result));return result;
          }catch(error){mutationFailed=true;throw error;}
        },
        event:(kind,payload)=>{guard();if(!write)throw Error('Peer read snapshots cannot append events');exact(kind,'event type');events.push({type:kind,payload:JSON.parse(canonical(payload))});}
      });
      const result=fn(tx);
      if(result&&typeof result.then==='function'){
        if(result instanceof Promise)Promise.prototype.then.call(result,undefined,()=>{});
        throw Error('Models, network calls and asynchronous work are forbidden inside peer transactions');
      }
      guard();
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
  // Caller owns commit/rollback. A savepoint contains failed ledger mutations.
  writeWithin(type,principal,fn){if(this.ownsDb)throw Error('External migration transaction required');return this.#transaction(type,principal,fn,true,true);}
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
