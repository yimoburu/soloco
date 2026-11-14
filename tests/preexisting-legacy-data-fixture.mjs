// TEST DATA only: a deliberately preexisting, unqualified legacy prefix.
// This is the direct-SQL recipe already used by model-process-closure and
// peer-origin-public-fixture. It creates no Original origin, issuer or
// assignment/launch stamps; ordinary legacy revision/update/event DATA remains.
import {Store,stamp} from '../plugins/soloco/runtime/store.mjs';
import {normalizedLayout,flushSnapshots,insertStorageEvent} from '../plugins/soloco/runtime/record-storage.mjs';

export function seedPreexistingLegacyData(store,type,makeState){
  const db=store.db;
  if(store.inTransaction||db.isTransaction||typeof makeState!=='function')throw Error('Preexisting legacy DATA fixture requires an idle Store and synchronous seed');
  db.exec('BEGIN IMMEDIATE');
  try{
    if(normalizedLayout(db)||db.prepare('SELECT COUNT(*) AS n FROM company').get().n!==0||db.prepare('SELECT COUNT(*) AS n FROM events').get().n!==0)throw Error('Preexisting legacy DATA fixture requires empty legacy tables');
    const state=makeState(null);
    if(!state||typeof state!=='object'||Array.isArray(state)||typeof state.then==='function'||Object.hasOwn(state,'original_execution_origin'))throw Error('Preexisting legacy DATA fixture cannot provide Original provenance');
    // Preserve the original first-writer mutation of the callback's exact
    // object, including revision, clock-derived update and original event type.
    state.revision=0;state.updated_at=stamp();
    flushSnapshots(db,null,state);
    db.prepare('INSERT INTO company VALUES(1,?)').run(JSON.stringify(state));
    insertStorageEvent(db,type,{revision:0,owner:state.owner},null);
    db.exec('COMMIT');
    return store.snapshotState(state);
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
}

export function preexistingLegacyStore(root,type,makeState){
  const created=new Store(root,true);
  try{seedPreexistingLegacyData(created,type,makeState);}finally{created.close();}
  // Normal Store construction observes the existing DATA. Subsequent writes
  // and migration use their original production paths and retain every guard.
  return new Store(root);
}
