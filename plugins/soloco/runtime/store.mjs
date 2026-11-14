export {STORE_PRECOMMIT_GUARD_VERSION} from './store-precommit-contract.mjs';
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
import {beginOriginalStoreExecutionWriteFrom,prepareOriginalStoreExecutionWriteFrom,originalStoreExecutionEventFrom,validateOriginalStoreExecutionCommitFrom,originalStoreExecutionCommitCutoffFrom,commitOriginalStoreExecutionWriteFrom,endOriginalStoreExecutionWriteFrom,bindOriginalWorkerAssignmentBookkeepingFrom} from './peers/prospective-local-worker-inventory-producer.mjs';
import * as originalMechanicalPolicy from './peers/origin-mechanical-qa-policy.mjs';
import * as originalEngine from './engine.mjs';
import * as originalWorker from './worker.mjs';
import * as originalDevelopment from './develop.mjs';
import {beginRuntimeExecutionWriteFrom,prepareRuntimeExecutionWriteFrom,validateRuntimeExecutionCommitFrom,runtimeExecutionCommitCutoffFrom,runtimeExecutionUsesNativeClockFrom,commitRuntimeExecutionWriteFrom,endRuntimeExecutionWriteFrom,bindRuntimeBookkeepingFrom} from './runtime-execution.mjs';
export {PACKAGE,VERSION,skillBody,installedTeam,teamHash} from './team-source.mjs';

// Explicitly tested state producers, not a blanket semver compatibility promise.
export const COMPATIBLE_RUNTIME_VERSIONS = ['0.2.0', '0.2.1', '0.2.2', '0.3.0', '0.3.1', '0.4.0', '0.4.1', '0.5.0', '0.6.0', '0.6.1', '0.6.2', '0.6.3', '0.6.4', '0.6.5', '0.6.6', '0.6.7', '0.6.8', '0.6.9', '0.6.10', '0.6.11', '0.6.12', '0.6.13', '0.7.0', '0.7.1', '0.7.2', '0.7.3', '0.7.4', '0.7.5', '0.7.6', '0.7.7', '0.7.8', VERSION];
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
// Only these exact class-created objects can lend the original inventory its
// current physical snapshot. Public properties alone are not a transaction.
const originalStores=new WeakMap(),originalDatabases=new WeakMap();
const runtimeCommitWitnesses=new WeakMap();
const runtimeRealNow=Date.now;
const runtimeSafeInteger=Number.isSafeInteger;
const runtimeNativeExec=DatabaseSync.prototype.exec;
const runtimeNativeBind=Function.prototype.bind,runtimeNativeApply=Reflect.apply;
// Only this lexical Store code can mint a successful physical-commit witness.
// A transaction callback cannot arm a launch by reporting that COMMIT worked.
function runtimeCommitWitness(store){
  const owned=originalStores.get(store);
  if(!owned||!owned.active||owned.mode!=='write'||store.closed||store.db!==owned.db||store.root!==owned.root||owned.db.isTransaction!==false)throw Object.assign(Error('Actual Store physical commit required'),{code:'LEGACY_RUNTIME_COMMIT_WITNESS_REQUIRED'});
  const witness=Object.freeze({});runtimeCommitWitnesses.set(witness,{store,db:owned.db,root:owned.root,scope:owned.scope});return witness;
}
export function inspectRuntimeStoreCommitWitnessFrom(witness,store){
  const facts=runtimeCommitWitnesses.get(witness),owned=originalStores.get(store);
  if(!facts||!owned||facts.store!==store||facts.db!==owned.db||facts.root!==owned.root||facts.scope!==owned.scope||!owned.active||owned.mode!=='write'||store.closed||owned.db.isTransaction!==false)throw Object.assign(Error('Actual Store physical commit witness required'),{code:'LEGACY_RUNTIME_COMMIT_WITNESS_REQUIRED'});
  return Object.freeze({root:facts.root,scope:facts.scope});
}
export function originalStoreExecutionCustodyFrom(subject){
  const owned=originalStores.get(subject)??originalDatabases.get(subject);
  if(!owned)throw Object.assign(Error('Original execution requires an actual Store snapshot'),{code:'ORIGINAL_EXECUTION_STORE_REQUIRED'});
  const capturedScope=owned.scope;
  const assert=()=>{checkAttached(owned.store,true);if(owned.store.closed||owned.store.db!==owned.db||owned.store.root!==owned.root||!owned.store.inTransaction||owned.db.isTransaction!==true||!owned.active||owned.scope!==capturedScope)throw Object.assign(Error('Original Store snapshot expired or changed'),{code:'ORIGINAL_EXECUTION_STORE_EXPIRED'});};
  assert();return Object.freeze({store:owned.store,db:owned.db,root:owned.root,fresh:owned.fresh,mode:owned.mode,type:owned.type,state:owned.state,scope:owned.scope,assert});
}
function originalScope(store,mode,type=null){const owned=originalStores.get(store);if(!owned||owned.active)throw Error('Nested original Store scope');owned.active=true;owned.mode=mode;owned.type=type;owned.state=null;owned.commitCutoff=null;owned.scope=Object.freeze({});return owned;}
function originalEnd(store){const owned=originalStores.get(store);owned.active=false;owned.mode=null;owned.type=null;owned.state=null;owned.commitCutoff=null;owned.scope=null;}
export function retainOriginalStoreCommitCutoffFrom(subject,proof,issuer='mechanical-qa'){
  const loan=originalStoreExecutionCustodyFrom(subject),owned=originalStores.get(loan.store);
  const inspect=issuer==='mechanical-qa'?originalMechanicalPolicy.inspectOriginalMechanicalQaCommitCutoffFrom:issuer==='engine'?originalEngine.inspectOriginalEngineCommitCutoffFrom:issuer==='worker'?originalWorker.inspectOriginalWorkerCommitCutoffFrom:issuer==='development'?originalDevelopment.inspectOriginalDevelopmentCommitCutoffFrom:null;
  if(loan.mode!=='write'||typeof inspect!=='function')throw Object.assign(Error('Original validated commit cutoff required'),{code:'ORIGINAL_EXECUTION_COMMIT_CUTOFF_REQUIRED'});
  const facts=inspect(proof,loan.db),deadline=facts?.deadline_at_ms,code=issuer==='mechanical-qa'?'ORIGIN_MECHANICAL_QA_EXPIRED':facts?.code,message=issuer==='mechanical-qa'?'Original mechanical QA expired before physical commit':facts?.message;
  loan.assert();if(!Number.isSafeInteger(deadline)||deadline<0||deadline>8640000000000000)throw Object.assign(Error('Original validated commit cutoff required'),{code:'ORIGINAL_EXECUTION_COMMIT_CUTOFF_REQUIRED'});
  if(code!==null&&(typeof code!=='string'||!code||code.length>200)||typeof message!=='string'||!message||message.length>2000)throw Object.assign(Error('Original cutoff failure identity required'),{code:'ORIGINAL_EXECUTION_COMMIT_CUTOFF_REQUIRED'});
  if(owned.commitCutoff===null||deadline<owned.commitCutoff.deadline_at_ms)owned.commitCutoff=Object.freeze({deadline_at_ms:deadline,code,message});
}
export function originalStoreRetainedCommitCutoffFrom(store){const loan=originalStoreExecutionCustodyFrom(store);if(loan.mode!=='write')throw Object.assign(Error('Original write cutoff scope required'),{code:'ORIGINAL_EXECUTION_COMMIT_CUTOFF_REQUIRED'});return originalStores.get(loan.store).commitCutoff?.deadline_at_ms??null;}
function checkOriginalCommitCutoff(store){
  const owned=originalStores.get(store),originalLaunch=originalStoreExecutionCommitCutoffFrom(store),runtimeLaunch=runtimeExecutionCommitCutoffFrom(store),launch=originalLaunch===null?runtimeLaunch:runtimeLaunch===null?originalLaunch:Math.min(originalLaunch,runtimeLaunch),policy=owned.commitCutoff;
  const deadline=policy===null?launch:launch===null?policy.deadline_at_ms:Math.min(policy.deadline_at_ms,launch);
  const nativeClock=runtimeExecutionUsesNativeClockFrom(store),nativeChecker=nativeClock?runtimeSafeInteger:null;
  let nativeCommit=null;
  if(nativeClock){
    if(owned.db.exec!==runtimeNativeExec)throw Object.assign(Error('Legacy physical COMMIT entry changed'),{code:'LEGACY_RUNTIME_COMMIT_ENTRY_CHANGED'});
    nativeCommit=runtimeNativeApply(runtimeNativeBind,runtimeNativeExec,[owned.db,'COMMIT']);
  }
  if(deadline===null)return nativeCommit;
  // All mutable/provider/integrity reads are over. The next operation after
  // this one primitive clock sample is the owning physical COMMIT.
  const now=nativeClock?runtimeRealNow():Date.now();
  if(!(nativeClock?nativeChecker(now):Number.isSafeInteger(now))||now<0||now>=deadline){const usePolicy=policy!==null&&policy.deadline_at_ms<=deadline,error=Error(usePolicy?policy.message:'Original authority expired before physical commit'),code=usePolicy?policy.code:'ORIGINAL_EXECUTION_CUTOFF_EXPIRED';if(code!==null)error.code=code;throw error;}
  return nativeCommit;
}
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
  // A post-COMMIT arming failure is still the original failure. There is no
  // transaction left to roll back; do not replace its private child custody
  // with a new "no transaction" error.
  if(!attached){try{if(store.db.isTransaction)store.db.exec('ROLLBACK');}catch(cleanup){throw new AggregateError([error,cleanup],'Store operation and rollback failed',{cause:error});}throw error;}
  try{if(attached.connection.isTransaction)attached.connection.exec('ROLLBACK');}
  catch(cleanup){throw new AggregateError([error,cleanup],'Attached Store operation and rollback failed',{cause:error});}
  throw error;
}
function writableStore(store){
  if(originalStores.get(store)?.readOnly)throw Object.assign(Error('Read-only Store cannot write, create or migrate company storage'),{code:'STORE_READONLY_WRITE_FORBIDDEN'});
}
function readonlySnapshotLayout(store){
  normalizedLayout(store.db);
  const names=new Set(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  if([...names].some(name=>name.startsWith('peer_')))throw Error('Peer storage requires the peer runtime; legacy Store initialization is unavailable');
  if(!names.has('company')||!names.has('events'))throw Error('Read-only Store requires existing legacy company storage');
}
function snapshotResult(store,fn){
  const result=fn();
  if(originalStores.get(store)?.readOnly&&result&&typeof result.then==='function'){
    Promise.resolve(result).catch(()=>{});
    throw Object.assign(Error('Read-only Store snapshot must complete synchronously'),{code:'STORE_READONLY_SNAPSHOT_ASYNC'});
  }
  return result;
}
export class Store {
  constructor(root, create = false, options) {
    // Two closed SOURCE protocols: owned read-only selection or an original
    // writable connection attachment. Neither option object supplies authority.
    let attached=null,readOnly=false;
    if(options!==undefined){
      if(!options||typeof options!=='object'||types.isProxy(options)||Object.getPrototypeOf(options)!==Object.prototype)throw attachmentError('STORE_CONNECTION_INPUT');
      const descriptors=Object.getOwnPropertyDescriptors(options),keys=Reflect.ownKeys(descriptors);
      if(keys.length===1&&keys[0]==='readOnly'){
        if(!Object.hasOwn(descriptors.readOnly,'value')||typeof descriptors.readOnly.value!=='boolean')throw new TypeError('Store options accept only a readOnly boolean');
        readOnly=descriptors.readOnly.value;
      }else attached=attachedOptions(options,create);
    }
    if(readOnly&&create)throw Object.assign(Error('Read-only Store requires existing storage'),{code:'STORE_READONLY_WRITE_FORBIDDEN'});
    this.root = folder(root);
    this.dir = path.join(this.root, '.company');
    noLink(this.dir);
    if (create) fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(this.dir)) throw new Error('No company here yet; call company_open');
    const file = path.join(this.dir, 'company.sqlite');
    for (const suffix of ['', '-wal', '-shm']) noLink(file + suffix);
    if(attached){
      this.db=attached.connection;this.inTransaction=false;
      const previous=originalDatabases.get(this.db);
      if(previous&&!previous.store.closed)throw attachmentError('STORE_CONNECTION_INPUT');
      // Reserve one live custodian before invoking any guard/provider callback.
      const owned={store:this,db:this.db,root:this.root,fresh:false,readOnly:false,active:false,mode:null,type:null,state:null};
      attachedStores.set(this,attached);
      originalStores.set(this,owned);originalDatabases.set(this.db,owned);
      try{
        checkAttached(this);
        if(this.db.isTransaction)throw attachmentError('STORE_CONNECTION_TRANSACTION');
        this.db.exec('PRAGMA busy_timeout=5000;');
        checkedAttachedLayout(this.db,file);checkedAttachedWritable(this);
        return;
      }catch(error){
        if(originalDatabases.get(attached.connection)===owned)originalDatabases.delete(attached.connection);
        if(originalStores.get(this)===owned)originalStores.delete(this);
        if(attachedStores.get(this)===attached)attachedStores.delete(this);
        throw error;
      }
    }
    if(readOnly&&!fs.existsSync(file))throw new Error('No company here yet; call company_open');
    const absent=create===true&&!fs.existsSync(file);
    this.db = new DatabaseSync(file,...(readOnly?[{readOnly:true}]:[]));
    this.inTransaction=false;
    try {
      this.db.exec('PRAGMA busy_timeout=5000;');
      const fresh=!readOnly&&absent&&this.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n===0;
      const owned={store:this,db:this.db,root:this.root,fresh,readOnly,active:false,mode:null,type:null,state:null};originalStores.set(this,owned);originalDatabases.set(this.db,owned);
      // The public opener must finish its retained original-fd/path binding
      // BEFORE any schema or canonical row is trusted. Read-only open performs
      // no setup/probe here; first-use validation belongs to its real snapshot.
      if(readOnly){this.db.exec('PRAGMA query_only=ON;');return;}
      // Validate the existing layout before any legacy setup. In particular a
      // peer database must not acquire legacy tables just because a supervisor
      // or an incompatible public route tried to open it.
      normalizedLayout(this.db);
      if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('peer_meta','peer_rows','peer_versions','peer_events') LIMIT 1").get())throw Error('Peer storage requires the peer runtime; legacy Store initialization is unavailable');
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      this.db.exec('CREATE TABLE IF NOT EXISTS company (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, type TEXT NOT NULL, value TEXT NOT NULL);');
    }catch(error){this.db.close();throw error;}
  }
  get readOnly() {return originalStores.get(this)?.readOnly===true;}
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
  migrate() { if(attachedStores.has(this))throw attachmentError('STORE_ATTACHED_OPERATION_UNSUPPORTED');writableStore(this);return migrateNormalized(this.db,this.dir); }
  // This exact layout change owns a real Store scope, but it is not an
  // ordinary legacy-state writer. In particular it never prepares/serializes
  // legacy state or arms an ordinary worker/model launch token.
  peerLayoutTransition(fn,{beforeCommit}={}) {
    if(attachedStores.has(this))throw attachmentError('STORE_ATTACHED_OPERATION_UNSUPPORTED');
    writableStore(this);
    const owned=originalStores.get(this);
    if(!owned||owned.db!==this.db||owned.root!==this.root||this.closed||owned.active||this.inTransaction||this.db.isTransaction)throw Object.assign(Error('Peer layout transition requires an idle original Store'),{code:'STORE_PEER_TRANSITION_REQUIRED'});
    if(typeof fn!=='function')throw new TypeError('Peer layout transition requires a synchronous function');
    const db=owned.db,root=owned.root;
    db.exec('BEGIN IMMEDIATE');this.inTransaction=true;originalScope(this,'write','origin.quarantined');
    const assertOriginal=()=>{if(this.db!==db||this.root!==root||this.closed||!this.inTransaction||!db.isTransaction)throw Object.assign(Error('Original peer layout transition changed'),{code:'STORE_PEER_TRANSITION_REQUIRED'});};
    try{
      if(!normalizedLayout(db)||db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version!==4)throw Object.assign(Error('Peer layout transition requires original layout 4'),{code:'STORE_PEER_TRANSITION_REQUIRED'});
      const result=fn(this);
      if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw Object.assign(Error('Peer layout transition must complete synchronously'),{code:'STORE_PEER_TRANSITION_ASYNC'});}
      assertOriginal();
      if(db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version!==5||['peer_meta','peer_rows','peer_versions','peer_events'].some(name=>!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)))throw Object.assign(Error('Peer layout transition did not produce exact layout 5'),{code:'STORE_PEER_TRANSITION_REQUIRED'});
      checkBeforeCommit(beforeCommit,db,result);assertOriginal();
      checkOriginalCommitCutoff(this);
      db.exec('COMMIT');return result;
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
    finally{originalEnd(this);this.inTransaction=false;}
  }
  readSnapshot(fn) {
    checkAttached(this);
    if(this.inTransaction){const value=snapshotResult(this,fn);checkAttached(this,true);return value;}
    this.db.exec('BEGIN');this.inTransaction=true;originalScope(this,'read');
    try {if(originalStores.get(this)?.readOnly)readonlySnapshotLayout(this);const value=snapshotResult(this,fn);checkAttached(this,true);this.db.exec('COMMIT');return value;}
    catch(error){rollbackStore(this,error);}
    finally {originalEnd(this);this.inTransaction=false;}
  }
  snapshotState(state) {
    checkAttached(this);
    const file=path.join(this.dir,'company.sqlite');
    const bound=bindSnapshots(state,sha=>{
      if(attachedStores.has(this)){checkAttached(this);const value=readImmutable(this.db,sha);checkAttached(this);return value;}
      const reader=new DatabaseSync(file,{readOnly:true});
      try{return readImmutable(reader,sha);}finally{reader.close();}
    },file);
    const reopenReadOnly=originalStores.get(this)?.readOnly===true;
    if(bound&&this.storageInfo().format==='normalized-v4')bindOperatingIntake(bound,this,()=>{
      if(attachedStores.has(this))throw attachmentError('STORE_ATTACHED_OPERATION_UNSUPPORTED');
      return new Store(this.root,false,{readOnly:reopenReadOnly});
    });
    bindOriginalWorkerAssignmentBookkeepingFrom(this,bound);
    bindRuntimeBookkeepingFrom(this,bound);
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
    writableStore(this);
    if(!normalizedLayout(this.db)||this.db.prepare('SELECT version FROM company_layout WHERE id=1').get().version<3)return false;
    this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
    originalScope(this,'write','upgrade.native_returned');
    try {
      beginOriginalStoreExecutionWriteFrom(this,'upgrade.native_returned');
      const metadata=captureStorageMetadata(this.db);
      const header=readNormalized(this.db,{rootKeys:['revision','owner'],entities:{upgrade:['id']}});
      if(header.upgrade?.id!==uid){this.db.exec('ROLLBACK');return false;}
      appendNormalizedJournal(this.db,'calls',entry);
      const changes=[{family:'root',key:'revision',value:(header.revision??-1)+1},{family:'root',key:'updated_at',value:stamp()}];
      if(entry.native_id)changes.push({family:'upgrade',key:entry.role==='cos'?'probe_native_id':'reviewer_native_id',value:entry.native_id});
      writeNormalizedSelection(this.db,changes);
      insertStorageEvent(this.db,'upgrade.native_returned',originalStoreExecutionEventFrom(this,{revision:(header.revision??-1)+1,owner:header.owner}),metadata);
      validateOriginalStoreExecutionCommitFrom(this);
      checkOriginalCommitCutoff(this);
      this.db.exec('COMMIT');commitOriginalStoreExecutionWriteFrom(this);return true;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    finally{endOriginalStoreExecutionWriteFrom(this);originalEnd(this);this.inTransaction=false;}
  }
  selectedTransaction(type,options,fn,{afterWrite,beforeCommit}={}) {
    checkAttached(this);
    writableStore(this);
    if(!normalizedLayout(this.db))return this.transaction(type,s=>fn(s),{afterWrite,beforeCommit});
    this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
    const owned=originalScope(this,'write',type);
    try {
      beginOriginalStoreExecutionWriteFrom(this,type);
      beginRuntimeExecutionWriteFrom(this,type);
      const metadata=captureStorageMetadata(this.db);
      const state=this.snapshotState(readNormalized(this.db,options)),before=JSON.stringify(state);
      owned.state=state;const result=fn(state);
      checkAttached(this,true);
      prepareOriginalStoreExecutionWriteFrom(this,state,{selected:true,before:JSON.parse(before)});
      prepareRuntimeExecutionWriteFrom(this,state,{selected:true,before:JSON.parse(before)});
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
      insertStorageEvent(this.db,type,originalStoreExecutionEventFrom(this,{revision:state.revision,owner:state.owner}),metadata);
      checkBeforeCommit(beforeCommit,this.db,state);
      validateOriginalStoreExecutionCommitFrom(this);
      validateRuntimeExecutionCommitFrom(this);
      checkAttached(this,true);
      const nativeCommit=checkOriginalCommitCutoff(this);
      if(nativeCommit===null)this.db.exec('COMMIT');else nativeCommit();
      commitOriginalStoreExecutionWriteFrom(this);this.snapshotState(state);commitRuntimeExecutionWriteFrom(this,runtimeCommitWitness(this));return result;
    }catch(error){rollbackStore(this,error);}
    finally {endRuntimeExecutionWriteFrom(this);endOriginalStoreExecutionWriteFrom(this);originalEnd(this);this.inTransaction=false;}
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
    writableStore(this);
    this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;
    const owned=originalScope(this,'write',type);
    try {
      beginOriginalStoreExecutionWriteFrom(this,type);
      beginRuntimeExecutionWriteFrom(this,type);
      const metadata=normalizedLayout(this.db)?captureStorageMetadata(this.db):null;
      const state = this.read();
      owned.state=state;const next = fn(state);owned.state=next;
      checkAttached(this,true);
      prepareOriginalStoreExecutionWriteFrom(this,next);
      prepareRuntimeExecutionWriteFrom(this,next);
      next.revision = (state?.revision ?? -1) + 1;
      next.updated_at = stamp();
      flushSnapshots(this.db,state,next);
      if(normalizedLayout(this.db))writeNormalized(this.db,next);
      else this.db.prepare('INSERT INTO company VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(next));
      if(afterWrite)afterWrite(this.db,next);
      checkAttached(this,true);
      insertStorageEvent(this.db,type,originalStoreExecutionEventFrom(this,{revision:next.revision,owner:next.owner}),metadata);
      checkBeforeCommit(beforeCommit,this.db,next);
      validateOriginalStoreExecutionCommitFrom(this);
      validateRuntimeExecutionCommitFrom(this);
      checkAttached(this,true);
      const nativeCommit=checkOriginalCommitCutoff(this);
      if(nativeCommit===null)this.db.exec('COMMIT');else nativeCommit();
      commitOriginalStoreExecutionWriteFrom(this);
      const result=this.snapshotState(next);
      commitRuntimeExecutionWriteFrom(this,runtimeCommitWitness(this));
      return result;
    } catch (error) { rollbackStore(this,error); }
    finally {endRuntimeExecutionWriteFrom(this);endOriginalStoreExecutionWriteFrom(this);originalEnd(this);this.inTransaction=false;}
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
