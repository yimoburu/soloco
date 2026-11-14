import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {types} from 'node:util';
import {normalizedLayout,readNormalized,writeNormalized,migrateNormalized,writeNormalizedSelection,flushSnapshots,readImmutable,appendNormalizedJournal,LATEST_LAYOUT,readNormalizedValue,readPublicIndex,readPublicRows,readPublicHandle,readPublicAlias,captureStorageMetadata,captureStorageBaseline,insertStorageEvent,readStorageIntake} from './record-storage.mjs';
import {bindSnapshots,bindOperatingIntake} from './snapshot.mjs';
import {bindPublicReader,PUBLIC_COLLECTIONS} from './state-projections.mjs';
export {digest} from './state-projections.mjs';
import {PACKAGE,VERSION,teamHash} from './team-source.mjs';
export {PACKAGE,VERSION,skillBody,installedTeam,teamHash} from './team-source.mjs';

// Explicitly tested state producers, not a blanket semver compatibility promise.
export const COMPATIBLE_RUNTIME_VERSIONS = ['0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.4.0', '0.4.1', '0.5.0', '0.6.0', '0.6.1', '0.6.2', '0.6.3', '0.6.4', '0.6.5', '0.6.6', '0.6.7', '0.6.8', '0.6.9', '0.6.10', '0.6.11', '0.6.12', '0.6.13', '0.7.0', '0.7.1', '0.7.2', '0.7.3', '0.7.4', '0.7.5', '0.7.6', '0.7.7', VERSION];
export const COMPATIBLE_TEAM_VERSIONS = ['0.1.0', ...COMPATIBLE_RUNTIME_VERSIONS];
// Exact published v0.18/v0.19/v0.20 contracts; compatibility never adopts new instructions.
export const V018_GOVERNANCE_SHA256 = '185933ddeafe9709bef44e9a6605ba7adb5faaa8bc43c1c64f1da3b03ae5f400';
export const V019_GOVERNANCE_SHA256 = 'd79b73676543ab053ea5ce7e456364f68700d0340d47c852a83bc97308f6a422';
export const V020_GOVERNANCE_SHA256 = '28f99838abc3794da94f97f7a2d234554811da3aef7b8ddb3742075caa78ec36';
export const SCHEMA = 2;
export const compatibleRuntime = state => state?.schema === SCHEMA && COMPATIBLE_RUNTIME_VERSIONS.includes(state.runtime_version);
export const stamp = () => new Date().toISOString();
export const id = (prefix) => `${prefix}-${randomUUID()}`;
export function requireText(value, name, max = 20000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must be nonempty text, at most ${max} characters`);
  return value;
}
export function folder(root) {
  if (!path.isAbsolute(root ?? '')) throw new Error('Use an absolute company folder');
  const real = fs.realpathSync(root);
  if (!fs.statSync(real).isDirectory()) throw new Error('Company folder is not a directory');
  if (real === PACKAGE || real.startsWith(PACKAGE + path.sep)) throw new Error('Company records must live outside the installed plugin');
  return real;
}
export function noLink(file) {
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Refusing linked company record: ${file}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// Trusted synchronous final guard, immediately before issuing COMMIT after all
// storage/event work. COMMIT completion latency is not a zero-time promise.
export const STORE_PRECOMMIT_GUARD_VERSION=1;
function checkBeforeCommit(check,db,state){
  if(check===undefined)return;
  if(typeof check!=='function')throw Error('beforeCommit must be a private synchronous function');
  const result=check(db,state);
  if(result!==undefined){if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});throw Error('beforeCommit must complete synchronously without a return value');}
}
// SOURCE-only attachment. This is an original connection/storage fence, never
// caller identity or permission. Ordinary two-argument Stores are unchanged.
const attachedStores=new WeakMap();
const attachmentError=(code,message=code)=>Object.assign(Error(message),{code});
function checkAttached(store,transaction=false){
  const attached=attachedStores.get(store);if(!attached)return;
  if(attached.closed)throw attachmentError('STORE_CONNECTION_EXPIRED');
  if(store.db!==attached.connection)throw attachmentError('STORE_CONNECTION_CHANGED');
  if(transaction&&attached.connection.isTransaction!==true)throw attachmentError('STORE_CONNECTION_TRANSACTION');
  const result=attached.guard();
  if(result!==undefined){if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});throw attachmentError('STORE_CONNECTION_GUARD','connectionGuard must complete synchronously without a return value');}
  if(transaction&&attached.connection.isTransaction!==true)throw attachmentError('STORE_CONNECTION_TRANSACTION');
}
function attachedOptions(options,create){
  if(options===undefined)return null;
  if(create||!options||typeof options!=='object'||types.isProxy(options)||Object.getPrototypeOf(options)!==Object.prototype)throw attachmentError('STORE_CONNECTION_INPUT');
  const fields=Object.getOwnPropertyDescriptors(options),keys=Reflect.ownKeys(fields);
  if(keys.length!==2||keys.some(k=>!['connection','connectionGuard'].includes(k)||!fields[k].enumerable||!Object.hasOwn(fields[k],'value')))throw attachmentError('STORE_CONNECTION_INPUT');
  const connection=fields.connection?.value,guard=fields.connectionGuard?.value;
  if(!connection||types.isProxy(connection)||Object.getPrototypeOf(connection)!==DatabaseSync.prototype||typeof guard!=='function')throw attachmentError('STORE_CONNECTION_INPUT');
  return {connection,guard,closed:false};
}
function checkedAttachedLayout(db,file){
  // The native prototype call also rejects an object merely cast to its shape.
  const actual=DatabaseSync.prototype.prepare.call(db,'PRAGMA database_list').all().find(row=>row.name==='main');
  if(!actual?.file||fs.realpathSync(actual.file)!==file)throw attachmentError('STORE_CONNECTION_PATH');
  normalizedLayout(db);
  const names=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  if([...names].some(name=>name.startsWith('peer_'))||!['company','events','company_layout','immutable_values','state_entries'].every(name=>names.has(name)))throw attachmentError('STORE_CONNECTION_LAYOUT');
  const rows=db.prepare('SELECT id,version FROM company_layout').all();
  if(rows.length!==1||rows[0].id!==1||rows[0].version!==4)throw attachmentError('STORE_CONNECTION_LAYOUT');
}
function checkedAttachedWritable(store){
  const db=attachedStores.get(store).connection;
  let opened=false,failed=false,failure;const cleanup=[];
  try{
    checkAttached(store);
    db.exec('SAVEPOINT soloco_attached_writability;');opened=true;
    checkAttached(store,true);
    // BEGIN IMMEDIATE alone does not establish native main writability. This
    // real write statement requires it, while selecting no canonical rows.
    db.exec('UPDATE main.company_layout SET version=version WHERE 0;');
    checkAttached(store,true);
  }catch(error){failed=true;failure=error;}
  finally{
    if(opened)for(const sql of ['ROLLBACK TO SAVEPOINT soloco_attached_writability;','RELEASE SAVEPOINT soloco_attached_writability;']){
      try{db.exec(sql);}catch(error){cleanup.push(error);}
    }
    // Also handles a provider which opens the savepoint and then throws, or a
    // failed RELEASE. The constructor refused any pre-existing transaction.
    try{if(db.isTransaction)db.exec('ROLLBACK');}catch(error){cleanup.push(error);}
  }
  if(failed){if(cleanup.length)throw new AggregateError([failure,...cleanup],'Attached Store writability and cleanup failed',{cause:failure});throw failure;}
  if(cleanup.length)throw cleanup.length===1?cleanup[0]:new AggregateError(cleanup,'Attached Store writability cleanup failed');
  checkAttached(store);
}
function rollbackStore(store,error){
  const attached=attachedStores.get(store);
  if(!attached){store.db.exec('ROLLBACK');throw error;}
  try{if(attached.connection.isTransaction)attached.connection.exec('ROLLBACK');}
  catch(cleanup){throw new AggregateError([error,cleanup],'Attached Store operation and rollback failed',{cause:error});}
  throw error;
}
export class Store {
  constructor(root, create = false, options) {
    const attached=attachedOptions(options,create);
    this.root = folder(root);
    this.dir = path.join(this.root, '.company');
    noLink(this.dir);
    if (create) fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.dir)) throw new Error('No company here yet; call company_open');
    const file = path.join(this.dir, 'company.sqlite');
    for (const suffix of ['', '-wal', '-shm']) noLink(file + suffix);
    if(attached){
      this.db=attached.connection;this.inTransaction=false;
      attachedStores.set(this,attached);
      try{
        checkAttached(this);
        if(this.db.isTransaction)throw attachmentError('STORE_CONNECTION_TRANSACTION');
        this.db.exec('PRAGMA busy_timeout=5000;');
        checkedAttachedLayout(this.db,file);checkedAttachedWritable(this);
        return;
      }catch(error){attachedStores.delete(this);throw error;}
    }
    this.db = new DatabaseSync(file);
    this.inTransaction=false;
    try {
      this.db.exec('PRAGMA busy_timeout=5000;');
      // Validate the existing layout before any legacy setup. In particular a
      // peer database must not acquire legacy tables just because a supervisor
      // or an incompatible public route tried to open it.
      normalizedLayout(this.db);
      if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('peer_meta','peer_rows','peer_versions','peer_events') LIMIT 1").get())throw Error('Peer storage requires the peer runtime; legacy Store initialization is unavailable');
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      this.db.exec('CREATE TABLE IF NOT EXISTS company (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL);');
    }catch(error){this.db.close();throw error;}
  }
  changeToken() { checkAttached(this);return this.db.prepare('SELECT COALESCE(MAX(seq),0) AS version FROM events').get().version; }
  captureIntakeBaseline() {return this.readSnapshot(()=>captureStorageBaseline(this.db));}
  // Exact row/event verification only. Checkpoint callers must resolve accepted
  // old/new envelopes against their frozen version map and validate snapshot
  // dependencies via captureSnapshotDependencies/validateSnapshotDependencies
  // against the bound vault before review/publication/use; missing originals hold.
  readIntake(baseline,options) {return this.readSnapshot(()=>readStorageIntake(this.db,baseline,options));}
  storageInfo() {
    checkAttached(this);
    const normalized=normalizedLayout(this.db),sentinel=normalized?JSON.parse(this.db.prepare('SELECT value FROM company WHERE id=1').get().value):null;
    return {format:normalized?'normalized-v'+this.db.prepare('SELECT version FROM company_layout WHERE id=1').get().version:'legacy-json',migration_required:!normalized||this.db.prepare('SELECT version FROM company_layout WHERE id=1').get().version<LATEST_LAYOUT,
      ...(sentinel?.source_state_sha256?{retained_source_state:{sha256:sentinel.source_state_sha256,characters:sentinel.source_state_characters}}:{})};
  }
  migrate() { if(attachedStores.has(this))throw attachmentError('STORE_ATTACHED_OPERATION_UNSUPPORTED');return migrateNormalized(this.db,this.dir); }
  readSnapshot(fn) {
    checkAttached(this);
    if(this.inTransaction){const value=fn();checkAttached(this,true);return value;}
    this.db.exec('BEGIN');this.inTransaction=true;
    try {const value=fn();checkAttached(this,true);this.db.exec('COMMIT');return value;}
    catch(error){rollbackStore(this,error);}
    finally {this.inTransaction=false;}
  }
  snapshotState(state) {
    checkAttached(this);
    const file=path.join(this.dir,'company.sqlite');
    const bound=bindSnapshots(state,sha=>{
      if(attachedStores.has(this)){checkAttached(this);const value=readImmutable(this.db,sha);checkAttached(this);return value;}
      const reader=new DatabaseSync(file,{readOnly:true});
      try{return readImmutable(reader,sha);}finally{reader.close();}
    },file);
    if(bound&&this.storageInfo().format==='normalized-v4')bindOperatingIntake(bound,this,()=>{
      if(attachedStores.has(this))throw attachmentError('STORE_ATTACHED_OPERATION_UNSUPPORTED');
      return new Store(this.root);
    });
    return bound;
  }
  readSelected(options) { return this.readSnapshot(()=>normalizedLayout(this.db)?this.snapshotState(readNormalized(this.db,options)):this.read()); }
  readRawValue(options) {return this.readSnapshot(()=>normalizedLayout(this.db)?readNormalizedValue(this.db,options):null);}
  // Callers keep this reader and all resulting pages inside one readSnapshot.
  // No canonical-state hydration or broad key validation is needed for previews;
  // delivered values still pass the ordinary immutable hash/encoding checks.
  publicState(current=false) {
    checkAttached(this);
    const catalog=readPublicIndex(this.db);
    if(!catalog)return this.read();
    const state=this.snapshotState(readNormalized(this.db,{rootKeys:current?['id','name','idea','revision','phase','mode','paused','plugin_version','runtime_version','governance_sha256','team_sha256','owner','handover','upgrade','governance','cos_instructions','roles']:[],entities:current?{upgrade:null}:{},validateKeys:false}));
    const cache=new Map(Object.entries(state).map(([key,value])=>[JSON.stringify(key==='upgrade'?['upgrade',null]:['root',key]),value]));
    const rows=(collection,offset,limit)=>{
      checkAttached(this);
      const selected=readPublicRows(this.db,collection,offset,limit);
      if(selected.length!==Math.min(limit,catalog.collections[collection].total-offset))throw Error('Public read index rows missing');
      const pointers=selected.map(row=>{
        let family=['active_jobs','claimed_jobs'].includes(collection)?'jobs':collection==='unresolved_notices'?'notices':['development','prototype_plans'].includes(collection)?'records':collection,key=row.key;
        if(collection==='sources') {
          if(['context_classifications','upgrade'].includes(key)){family=key;key=null;}
          else family='root';
        }
        return {row,family,key,identity:JSON.stringify([family,key])};
      });
      const missing=pointers.filter(p=>!cache.has(p.identity));
      if(missing.length) {
        const rootKeys=[],entities={};
        for(const {family,key} of missing) {
          if(family==='root')rootKeys.push(key);
          else if(key===null){rootKeys.push(family);entities[family]=null;}
          else (entities[family]??=[]).push(key);
        }
        const loaded=this.snapshotState(readNormalized(this.db,{rootKeys,entities,validateKeys:false}));
        for(const {family,key,identity} of missing)cache.set(identity,family==='root'?loaded[key]:key===null?loaded[family]:loaded[family]?.[key]);
      }
      const values=pointers.map(({row,identity})=>{
        const value=cache.get(identity);
        if(value===undefined)throw Error('Missing or changed public index source');
        return {...row,value};
      });
      checkAttached(this);return values;
    };
    return bindPublicReader(state,{...catalog,info:collection=>{
      checkAttached(this);
      if(!PUBLIC_COLLECTIONS.includes(collection))throw Error('Unknown public collection');
      return catalog.collections[collection];
    },rows});
  }
  publicReconciliationState(includeExports=true) {
    checkAttached(this);
    const catalog=readPublicIndex(this.db);
    if(!catalog)return null;
    const keys=collection=>{
      const rows=readPublicRows(this.db,collection,0,Number.MAX_SAFE_INTEGER);
      if(rows.length!==(collection==='_exports'?catalog.exports:catalog.collections[collection].total))throw Error('Public reconciliation index rows missing');
      return rows.map(row=>row.key);
    };
    return this.snapshotState(readNormalized(this.db,{rootKeys:[],entities:{jobs:keys('active_jobs'),...(includeExports?{records:keys('_exports')}:{}),upgrade:['status','review_deadline_policy','deadline_ms','review_window_minutes','created_at']},validateKeys:false}));
  }
  publicHandle(collection,keyHash) {checkAttached(this);return readPublicIndex(this.db)?readPublicHandle(this.db,collection,keyHash):null;}
  publicAlias(collection,id) {checkAttached(this);return readPublicIndex(this.db)?readPublicAlias(this.db,collection,id):undefined;}
  readPublicSelected(options) {return this.readSnapshot(()=>readPublicIndex(this.db)?this.snapshotState(readNormalized(this.db,{...options,validateKeys:false})):this.readSelected(options));}
  // Native output is an append-only fact, including late returns. This path
  // reads the current attempt identity and journal metadata, never old reports
  // or company records. Historical/legacy attempts use the ordinary fallback.
  appendUpgradeCall(uid,entry) {
    if(attachedStores.has(this))throw attachmentError('STORE_ATTACHED_OPERATION_UNSUPPORTED');
    if(!normalizedLayout(this.db)||this.db.prepare('SELECT version FROM company_layout WHERE id=1').get().version<3)return false;
    this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
    try {
      const metadata=captureStorageMetadata(this.db);
      const header=readNormalized(this.db,{rootKeys:['revision','owner'],entities:{upgrade:['id']}});
      if(header.upgrade?.id!==uid){this.db.exec('ROLLBACK');return false;}
      appendNormalizedJournal(this.db,'calls',entry);
      const changes=[{family:'root',key:'revision',value:(header.revision??-1)+1},{family:'root',key:'updated_at',value:stamp()}];
      if(entry.native_id)changes.push({family:'upgrade',key:entry.role==='cos'?'probe_native_id':'reviewer_native_id',value:entry.native_id});
      writeNormalizedSelection(this.db,changes);
      insertStorageEvent(this.db,'upgrade.native_returned',{revision:(header.revision??-1)+1,owner:header.owner},metadata);
      this.db.exec('COMMIT');return true;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    finally{this.inTransaction=false;}
  }
  selectedTransaction(type,options,fn,{afterWrite,beforeCommit}={}) {
    checkAttached(this);
    if(!normalizedLayout(this.db))return this.transaction(type,s=>fn(s),{afterWrite,beforeCommit});
    this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
    try {
      const metadata=captureStorageMetadata(this.db);
      const state=this.snapshotState(readNormalized(this.db,options)),before=JSON.stringify(state);
      const result=fn(state);
      checkAttached(this,true);
      state.revision=(state.revision??0)+1;state.updated_at=stamp();
      const changes=[];const old=JSON.parse(before);
      for(const key of new Set([...Object.keys(old),...Object.keys(state)])) {const value=state[key];
        if(Object.hasOwn(options.entities??{},key)) {
          for(const id of new Set([...Object.keys(old[key]??{}),...Object.keys(value??{})]))if(JSON.stringify(old[key]?.[id])!==JSON.stringify(value?.[id]))changes.push({family:key,key:id,value:value?.[id]});
        } else if(JSON.stringify(old[key])!==JSON.stringify(value))changes.push({family:'root',key,value});
      }
      flushSnapshots(this.db,state);
      writeNormalizedSelection(this.db,changes);
      if(afterWrite)afterWrite(this.db,state);
      checkAttached(this,true);
      insertStorageEvent(this.db,type,{revision:state.revision,owner:state.owner},metadata);
      checkBeforeCommit(beforeCommit,this.db,state);
      checkAttached(this,true);
      this.db.exec('COMMIT');this.snapshotState(state);return result;
    }catch(error){rollbackStore(this,error);}
    finally {this.inTransaction=false;}
  }
  read() {
    return this.readSnapshot(()=>{
      if(normalizedLayout(this.db))return this.snapshotState(readNormalized(this.db));
      const row = this.db.prepare('SELECT value FROM company WHERE id=1').get();
      return row ? this.snapshotState(JSON.parse(row.value)) : null;
    });
  }
  transaction(type, fn, {afterWrite,beforeCommit}={}) {
    checkAttached(this);
    this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
    try {
      const metadata=normalizedLayout(this.db)?captureStorageMetadata(this.db):null;
      const state = this.read();
      const next = fn(state);
      checkAttached(this,true);
      next.revision = (state?.revision ?? -1) + 1;
      next.updated_at = stamp();
      flushSnapshots(this.db,state,next);
      if(normalizedLayout(this.db))writeNormalized(this.db,next);
      else this.db.prepare('INSERT INTO company VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(next));
      if(afterWrite)afterWrite(this.db,next);
      checkAttached(this,true);
      insertStorageEvent(this.db,type,{revision:next.revision,owner:next.owner},metadata);
      checkBeforeCommit(beforeCommit,this.db,next);
      checkAttached(this,true);
      this.db.exec('COMMIT');
      return this.snapshotState(next);
    } catch (error) { rollbackStore(this,error); }
    finally {this.inTransaction=false;}
  }
  close() { const attached=attachedStores.get(this);if(attached)attached.closed=true;this.closed=true;if(!attached)this.db.close(); }
}
export function withStore(root, fn, create = false) {
  const db = new Store(root, create);
  try { return fn(db); } finally { db.close(); }
}
export function owner(state, actor, host, epoch) {
  if (!compatibleRuntime(state)) throw new Error('Company needs a checked runtime upgrade; use company_upgrade inspect, never reinitialize');
  if (state.owner.session_id !== actor || state.owner.host !== host || (epoch !== undefined && state.owner.epoch !== epoch)) throw new Error('This chat does not own the company. Resume the active chat or perform a checked handover.');
  if (!COMPATIBLE_TEAM_VERSIONS.includes(state.plugin_version)) throw new Error('Unsupported pinned team version');
  if (state.team_sha256 !== teamHash(state)) throw new Error('Pinned team integrity check failed');
  if (upgradePending(state)) throw new Error('Team upgrade is held; use company_upgrade to inspect, verify, or recover');
}
export const upgradePending = state => state?.upgrade && !['completed','recovered'].includes(state.upgrade.status);
export function notice(state, kind, summary, reference = null) {
  const item = {id: id('notice'), kind, summary, reference, created_at: stamp(), deliveries: [], seen_at: null, resolution: null};
  state.notices.push(item);
  return item;
}
