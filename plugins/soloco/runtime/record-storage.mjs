import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {publicCatalog,publicIndexValue,PUBLIC_COLLECTIONS} from './public-response.mjs';
import {pendingSnapshots,bindSnapshots,captureSnapshotDependencies} from './snapshot.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const collections=new Set(['records','jobs','sessions','notices','messages','upgrade_history','retired_sessions','context_classifications','upgrade']);
const journals=new Set(['calls','cos_pages','qa_pages','replays','deliveries']);
const sqlString=value=>"'"+value.replaceAll("'","''")+"'";

// Layout 4 adds canonical key escaping for identities SQLite TEXT cannot retain.
// Only explicit migration changes an existing layout; ordinary writes use its
// compatible representation or hold. New companies remain legacy until migrate.
export const LATEST_LAYOUT = 4;
const keyPrefix='~json:';
const unsafeKey=key=>key.includes('\u0000')||/[\ud800-\udfff]/u.test(key);
// Reuse only the fixed query plans, never a layout result. Every call executes
// fresh reads so creation, migration, rollback and corruption remain observable.
const layoutStatements=new WeakMap();
function layoutVersion(db,reprepare=true) {
  let statements=layoutStatements.get(db);
  if(!statements){statements={exists:db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_layout'")};layoutStatements.set(db,statements);}
  try{
    if(!statements.exists.get())return 0;
    statements.version??=db.prepare('SELECT version FROM company_layout WHERE id=1');
    const version=statements.version.get()?.version;
    if(![1,2,3,4].includes(version))throw Error('Unknown or corrupt company storage layout; migration compatibility required');
    return version;
  }catch(error){
    // A DatabaseSync may close and open again with the same object identity.
    // Retry only its finalized statements; closed databases and SQL errors hold.
    if(!reprepare||error?.code!=='ERR_INVALID_STATE'||error.message!=='statement has been finalized')throw error;
    layoutStatements.delete(db);return layoutVersion(db,false);
  }
}
function storedKey(db,key) {
  key=String(key);
  if(layoutVersion(db)<4){if(unsafeKey(key))throw Error('Exact identity requires explicit company_storage migrate');return key;}
  return unsafeKey(key)||key.startsWith(keyPrefix)?keyPrefix+JSON.stringify(key):key;
}
function logicalKey(db,key) {
  if(layoutVersion(db)<4)return key;
  if(typeof key!=='string'||unsafeKey(key))throw Error('Corrupt normalized key encoding');
  if(!key.startsWith(keyPrefix))return key;
  let decoded;try{decoded=JSON.parse(key.slice(keyPrefix.length));}catch{throw Error('Corrupt normalized key encoding');}
  if(typeof decoded!=='string'||storedKey(db,decoded)!==key)throw Error('Unknown or noncanonical normalized key encoding');
  return decoded;
}
function logicalRow(db,row){return row?{...row,key:logicalKey(db,row.key)}:row;}
export function normalizedLayout(db) {
  return layoutVersion(db)>0;
}
function install(db) {
  db.exec(`CREATE TABLE company_layout(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL);
    CREATE TABLE state_entries(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,sha256 TEXT NOT NULL REFERENCES immutable_values(sha256),encoding TEXT NOT NULL DEFAULT 'json',PRIMARY KEY(family,key));
    CREATE INDEX state_entries_order ON state_entries(family,position);
    INSERT INTO company_layout VALUES(1,4);`);
}
function hasEncoding(db) {return db.prepare('PRAGMA table_info(state_entries)').all().some(c=>c.name==='encoding');}
function journalLayout(db) {
  if(layoutVersion(db)<3)throw Error('Journal entries require explicit company_storage migrate');
  if(!hasEncoding(db))throw Error('Journal storage encoding column missing');
}
function put(db,family,key,position,value,encoding='json') {
  key=storedKey(db,key);
  const bytes=JSON.stringify(value);if(bytes===undefined)throw Error('Unsupported undefined stored value');
  const sha=hash(bytes);
  db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(sha,bytes);
  if(readImmutable(db,sha)!==bytes)throw Error('Immutable storage collision or corruption');
  if(hasEncoding(db))db.prepare('INSERT INTO state_entries(family,key,position,sha256,encoding) VALUES(?,?,?,?,?) ON CONFLICT(family,key) DO UPDATE SET position=excluded.position,sha256=excluded.sha256,encoding=excluded.encoding WHERE state_entries.sha256<>excluded.sha256 OR state_entries.position<>excluded.position OR state_entries.encoding<>excluded.encoding').run(family,key,position,sha,encoding);
  else db.prepare('INSERT INTO state_entries(family,key,position,sha256) VALUES(?,?,?,?) ON CONFLICT(family,key) DO UPDATE SET position=excluded.position,sha256=excluded.sha256 WHERE state_entries.sha256<>excluded.sha256 OR state_entries.position<>excluded.position').run(family,key,position,sha);
}
export function readImmutable(db,sha) {
  const bytes=db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(sha)?.bytes;
  if(typeof bytes!=='string'||hash(bytes)!==sha)throw Error('Immutable storage value missing or hash mismatch');
  return bytes;
}
// Capturing a snapshot must never install a layout or advance a writer fence.
export function flushSnapshots(db,...states) {
  const pending=new Map(states.flatMap(state=>[...pendingSnapshots(state)]));
  if(!pending.size)return;
  if(layoutVersion(db)<2)throw Error('Immutable snapshot capture requires explicit company_storage migrate before retrying');
  for(const [sha,bytes] of pending) {
    if(hash(bytes)!==sha)throw Error('Immutable snapshot staged hash mismatch');
    db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(sha,bytes);
    if(readImmutable(db,sha)!==bytes)throw Error('Immutable snapshot collision or corruption');
  }
}
function fenceLegacy(db) {
  db.exec(`CREATE TRIGGER fence_legacy_update BEFORE UPDATE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;
    CREATE TRIGGER fence_legacy_delete BEFORE DELETE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;
    CREATE TRIGGER fence_legacy_insert BEFORE INSERT ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;`);
}
function valueEntries(db,family,key,position,value) {
  if(layoutVersion(db)>=3&&family==='upgrade'&&journals.has(key)&&Array.isArray(value)){
    const child='upgrade.'+key;
    return [[family,key,position,{version:1,family:child,length:value.length},'journal-array'],...value.map((entry,n)=>[child,String(n),n,entry])];
  }
  return [[family,key,position,value]];
}
function journalDescriptor(row) {
  if(typeof row.bytes!=='string'||hash(row.bytes)!==row.sha256)throw Error('Immutable storage value hash mismatch');
  const value=JSON.parse(row.bytes);
  if(row.encoding!=='journal-array'||row.family!=='upgrade'||!journals.has(row.key)||!value||Object.keys(value).sort().join(',')!=='family,length,version'
    ||value.version!==1||value.family!=='upgrade.'+row.key||!Number.isSafeInteger(value.length)||value.length<0)throw Error('Unknown journal storage encoding or shape');
  return value;
}
export function appendNormalizedJournal(db,key,value) {
  if(!journals.has(key))throw Error('Unknown upgrade journal');
  journalLayout(db);
  const indexed=readPublicIndex(db)!==null;
  installPublicIndex(db);
  let parent=db.prepare("SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family='upgrade' AND key=?").get(key);
  if(parent&&parent.encoding==='json'){
    const old=decode(parent,db);if(!Array.isArray(old))throw Error('Upgrade journal is not an array');
    for(const entry of valueEntries(db,'upgrade',key,parent.position,old))put(db,...entry);
    parent=db.prepare("SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family='upgrade' AND key=?").get(key);
  }
  const descriptor=parent?journalDescriptor(parent):{version:1,family:'upgrade.'+key,length:0};
  const rows=db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN e.key<>CAST(e.position AS TEXT) OR e.position<0 OR e.position>=? OR e.encoding<>'json' OR v.sha256 IS NULL THEN 1 ELSE 0 END),0) AS invalid FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=?").get(descriptor.length,descriptor.family);
  if(rows.count!==descriptor.length||rows.invalid)throw Error('Journal storage entries missing or reordered');
  put(db,descriptor.family,String(descriptor.length),descriptor.length,value);
  const position=parent?.position??db.prepare("SELECT COALESCE(MAX(position),-1)+1 AS n FROM state_entries WHERE family='upgrade'").get().n;
  put(db,'upgrade',key,position,{...descriptor,length:descriptor.length+1},'journal-array');
  if(indexed)finishPublicIndex(db);
  // Leave an unavailable catalog invalid; only a full write rebuilds it.
  // Native return retention must never depend on unrelated archived bodies.
}
function split(db,value) {
  const entries=[];
  Object.entries(value).forEach(([key,item],position)=>{
    if(collections.has(key)&&item&&typeof item==='object') {
      entries.push(['shape',key,position,Array.isArray(item)?'array':'object']);
      Object.entries(item).forEach(([id,v],n)=>entries.push(...valueEntries(db,key,id,n,v)));
    } else entries.push(['root',key,position,item]);
  });return entries;
}
function decode(row,db) {
  if(!row)return undefined;
  if(typeof row.bytes!=='string'||hash(row.bytes)!==row.sha256)throw Error('Immutable storage value hash mismatch');
  const value=JSON.parse(row.bytes);
  if(layoutVersion(db)<4&&['records','jobs'].includes(row.family)&&typeof value?.id==='string'&&value.id!==row.key&&unsafeKey(value.id))throw Error('Legacy normalized identity corruption; restore the exact original or backup');
  if(layoutVersion(db)<3&&row.encoding!==undefined&&row.encoding!=='json')throw Error('Unknown storage encoding for layout');
  if(row.encoding===undefined||row.encoding==='json'){
    if(row.family==='upgrade'&&journals.has(row.key)&&!Array.isArray(value)
      &&((value?.version===1&&value?.family==='upgrade.'+row.key)||db.prepare('SELECT 1 FROM state_entries WHERE family=? LIMIT 1').get('upgrade.'+row.key)))throw Error('Journal storage encoding marker missing');
    return value;
  }
  const descriptor=journalDescriptor(row);
  const children=db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? ORDER BY position').all(descriptor.family);
  if(children.length!==descriptor.length||children.some((row,n)=>row.key!==String(n)||row.position!==n||row.encoding!=='json'))throw Error('Journal storage entries missing or reordered');
  return children.map(row=>decode(row,db));
}
function validateKeyMetadata(db,families) {
  // Validate key metadata before filtering, so a damaged encoded identity
  // cannot masquerade as an absent selected entity. Values remain selected.
  if(layoutVersion(db)>0){
    const rows=db.prepare('SELECT family,key,hex(CAST(key AS BLOB)) AS key_utf8 FROM state_entries'+(families?' WHERE family IN ('+families.map(()=>'?').join(',')+')':'')).all(...(families??[]));
    for(const row of rows){
      if(Buffer.from(row.key,'utf8').toString('hex').toUpperCase()!==row.key_utf8)throw Error('Corrupt normalized key encoding');
      logicalKey(db,row.key);
    }
  }
}

// Exact stored JSON for direct public sources. The caller must re-resolve this
// pointer inside its current read snapshot for every current-source range; a
// pinned text handle alone says nothing about current applicability/authority.
export function readNormalizedValue(db,{family,key}) {
  if(!['root','records','jobs','notices','messages','sessions','upgrade_history','context_classifications'].includes(family)||typeof key!=='string')throw Error('Raw storage read requires a direct supported family and exact key');
  if(layoutVersion(db)>=3&&!hasEncoding(db))throw Error('Journal storage encoding column missing');
  if(family!=='root'){
    const shape=db.prepare("SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family='shape' AND key=?").get(storedKey(db,family));
    if(!shape)return null;
    if(!['object','array'].includes(decode(shape,db)))throw Error('Unknown raw storage collection shape');
  }
  const row=db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? AND key=?').get(family,storedKey(db,key));
  if(!row)return null;
  if(row.encoding!==undefined&&row.encoding!=='json')throw Error('Raw storage read requires JSON value encoding');
  const value=decode(logicalRow(db,row),db);
  return {family,key,sha256:row.sha256,characters:row.bytes.length,raw:row.bytes,
    ...(value&&typeof value==='object'&&Object.hasOwn(value,'id')?{value_id:value.id}:{}),
    ...(value&&typeof value==='object'&&Object.hasOwn(value,'revision')?{revision:value.revision}:{})};
}

export function readNormalized(db,{rootKeys=null,entities=null,validateKeys=true}={}) {
  if(layoutVersion(db)>=3&&!hasEncoding(db))throw Error('Journal storage encoding column missing');
  if(validateKeys)validateKeyMetadata(db,entities===null?null:['root','shape',...Object.keys(entities)]);
  const state={};
  const define=(key,value)=>Object.defineProperty(state,key,{value,enumerable:true,writable:true,configurable:true});
  const selected=[],params=[];
  if(rootKeys===null)selected.push("e.family='root'");
  else if(rootKeys.length){selected.push("(e.family='root' AND e.key IN ("+rootKeys.map(()=>'?').join(',')+"))");params.push(...rootKeys.map(key=>storedKey(db,key)));}
  if(entities===null)selected.push("e.family='shape'");
  else if(Object.keys(entities).length){const keys=Object.keys(entities);selected.push("(e.family='shape' AND e.key IN ("+keys.map(()=>'?').join(',')+"))");params.push(...keys.map(key=>storedKey(db,key)));}
  const rows=selected.length?db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE '+selected.join(' OR ')+' ORDER BY position').all(...params):[];
  for(const stored of rows) {
    const row=logicalRow(db,stored);
    if(rootKeys&&!rootKeys.includes(row.key)&&row.family==='root')continue;
    if(row.family==='root')define(row.key,decode(row,db));
    else {
      if(entities&&!Object.hasOwn(entities,row.key))continue;
      const shape=decode(row,db);if(!['array','object'].includes(shape))throw Error('Unknown normalized collection shape');
      define(row.key,shape==='array'?[]:{});
      const wanted=entities?.[row.key];
      const entryRows=wanted===undefined||wanted===null?db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? ORDER BY position').all(row.key):wanted.map(key=>db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? AND key=?').get(row.key,storedKey(db,key))).filter(Boolean).sort((a,b)=>a.position-b.position);
      for(const stored of entryRows){const entry=logicalRow(db,stored);Object.defineProperty(state[row.key],entry.key,{value:decode(entry,db),enumerable:true,writable:true,configurable:true});}
    }
  }return state;
}
export function writeNormalized(db,state) {
  readPublicIndex(db); // Never overwrite an unknown derived-index protocol.
  installPublicIndex(db); // Surviving invalidation triggers may reference a missing catalog.
  if(layoutVersion(db)>=3)journalLayout(db);
  const entries=split(db,state),existing=new Set(db.prepare('SELECT family,key FROM state_entries').all().map(r=>JSON.stringify([r.family,r.key])));
  for(const [family,key,n,value,encoding] of entries){put(db,family,key,n,value,encoding);existing.delete(JSON.stringify([family,storedKey(db,key)]));}
  for(const key of existing)db.prepare('DELETE FROM state_entries WHERE family=? AND key=?').run(...JSON.parse(key));
  writePublicIndex(db,state);
}
export function migrateNormalized(db,directory) {
  readPublicIndex(db);
  const version=layoutVersion(db);
  if(version===LATEST_LAYOUT)throw Error('Company storage already migrated');
  const row=db.prepare('SELECT value FROM company WHERE id=1').get();if(!row)throw Error('No initialized company');
  const state=version?readNormalized(db):JSON.parse(row.value),original=JSON.stringify(state);
  if(version){
    captureSnapshotDependencies(bindSnapshots(state,sha=>readImmutable(db,sha)),()=>undefined);
    const sentinel=JSON.parse(row.value);if(sentinel.source_state_sha256){const source=readImmutable(db,sentinel.source_state_sha256);if(source.length!==sentinel.source_state_characters)throw Error('Retained migration origin length mismatch');}
  }
  const backup=path.join(directory,'storage-backup-'+Date.now()+'-'+hash(original).slice(0,12)+'.sqlite');
  if(fs.existsSync(backup))throw Error('Backup exists');
  db.exec('VACUUM INTO '+sqlString(backup));
  try {
    db.exec('BEGIN IMMEDIATE');
    const currentRow=db.prepare('SELECT value FROM company WHERE id=1').get();
    const current=version?JSON.stringify(readNormalized(db)):JSON.stringify(JSON.parse(currentRow?.value));
    if(layoutVersion(db)!==version||currentRow?.value!==row.value||current!==original)throw Error('Company changed during migration; retained backup, retry with fresh authority');
    if(version)captureSnapshotDependencies(bindSnapshots(state,sha=>readImmutable(db,sha)),()=>undefined);
    if(!version)install(db);
    else {
      installPublicIndex(db);
      if(!hasEncoding(db))db.exec("ALTER TABLE state_entries ADD COLUMN encoding TEXT NOT NULL DEFAULT 'json'");
      db.prepare('UPDATE company_layout SET version=4 WHERE id=1').run();
      db.exec('DELETE FROM state_entries');
    }
    const retained=version?row.value:JSON.stringify({schema:0,storage_format:'normalized-v4',source_state_sha256:hash(row.value),source_state_characters:row.value.length,message:'Explicit migration: compatible runtime required; do not reinitialize.'});
    db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(hash(row.value),row.value);
    if(readImmutable(db,hash(row.value))!==row.value)throw Error('Retained migration origin corrupt');
    writeNormalized(db,state);
    const readback=JSON.stringify(readNormalized(db));
    if(readback!==original)throw Error('Storage migration readback mismatch');
    if(!version){db.prepare('UPDATE company SET value=? WHERE id=1').run(retained);fenceLegacy(db);}
    db.exec('COMMIT');
    return {format:'normalized-v4',backup,source_sha256:hash(version?original:row.value),readback_sha256:hash(readback),originals_preserved:true};
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
export function writeNormalizedSelection(db,changes) {
  const catalog=readPublicIndex(db);
  const indexed=catalog!==null&&changes.every(({family,value})=>publicIndexCompatible(family,value));
  let catalogChanged=false;
  installPublicIndex(db);
  for(const {family,key,value} of changes) {
    const journal=family==='upgrade'&&journals.has(key);
    if(journal&&layoutVersion(db)>=3)journalLayout(db);
    const old=db.prepare('SELECT position FROM state_entries WHERE family=? AND key=?').get(family,storedKey(db,key));
    if(value===undefined)db.prepare('DELETE FROM state_entries WHERE family=? AND key=?').run(family,storedKey(db,key));
    else {
      // Root values and collection shapes share the top-level object order.
      const n=old?.position??(['root','shape'].includes(family)
        ?db.prepare("SELECT COALESCE(MAX(position),-1)+1 AS n FROM state_entries WHERE family IN ('root','shape')").get().n
        :db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM state_entries WHERE family=?').get(family).n);
      for(const entry of valueEntries(db,family,key,n,value))put(db,...entry);
    }
    if(journal)db.prepare('DELETE FROM state_entries WHERE family=? AND position>=?').run('upgrade.'+key,Array.isArray(value)?value.length:0);
    if(indexed)catalogChanged=updatePublicIndexValue(db,family,key,value)||catalogChanged;
  }
  if(indexed){
    if(catalogChanged)finishPublicIndex(db);
    else retainPublicCatalog(db,catalog);
  }
  // Leave an unavailable catalog invalid; only a full write rebuilds it.
  // Native return retention must never depend on unrelated archived bodies.
}

// Independently versioned, discardable presentation index. Canonical v1-v4
// entries and exact receipts are unchanged. Reads never install or repair it.
function publicIndexCompatible(family,value) {
  return family!=='jobs'||value===undefined||(value!==null&&(!value.coordination?.resources?.length||typeof value.coordination.resources[Symbol.iterator]==='function'));
}
function installPublicIndex(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS public_read_values(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,bytes TEXT NOT NULL,value_id_sha256 TEXT,sha256 TEXT NOT NULL,PRIMARY KEY(family,key));
    CREATE INDEX IF NOT EXISTS public_read_value_ids ON public_read_values(family,value_id_sha256,position);
    CREATE TABLE IF NOT EXISTS public_read_rows(collection TEXT NOT NULL,ordinal INTEGER NOT NULL,key TEXT NOT NULL,id TEXT NOT NULL,sha256 TEXT NOT NULL,key_sha256 TEXT NOT NULL,PRIMARY KEY(collection,ordinal));
    CREATE INDEX IF NOT EXISTS public_read_handles ON public_read_rows(collection,key_sha256);
    CREATE TABLE IF NOT EXISTS public_read_catalog(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,sha256 TEXT NOT NULL,bytes TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS public_read_insert AFTER INSERT ON state_entries BEGIN DELETE FROM public_read_catalog; END;
    CREATE TRIGGER IF NOT EXISTS public_read_update AFTER UPDATE ON state_entries BEGIN DELETE FROM public_read_catalog; END;
    CREATE TRIGGER IF NOT EXISTS public_read_delete AFTER DELETE ON state_entries BEGIN DELETE FROM public_read_catalog; END;`);
}
// A selected write often changes only execution receipts, revision or updated_at.
// Restore the previously checked catalog after canonical invalidation only when
// its exact membership/order inputs have not changed. No cross-transaction memo.
function retainPublicCatalog(db,catalog) {
  const bytes=JSON.stringify(catalog);
  db.prepare('INSERT OR REPLACE INTO public_read_catalog VALUES(1,1,?,?)').run(hash(bytes),bytes);
}
const receiptRoots=new Set(['revision','updated_at']);
function updatePublicIndexValue(db,family,key,value) {
  if(family!=='root'&&!collections.has(family))return false;
  const stored=storedKey(db,key);
  const prior=db.prepare('SELECT * FROM public_read_values WHERE family=? AND key=?').get(family,stored);
  if(prior)checkPublicValue(prior);
  const affectsCatalog=family!=='root'||!receiptRoots.has(key);
  if(value===undefined){db.prepare('DELETE FROM public_read_values WHERE family=? AND key=?').run(family,stored);return !!prior&&affectsCatalog;}
  const row=db.prepare('SELECT position FROM state_entries WHERE family=? AND key=?').get(family,stored);
  if(!row)return !!prior&&affectsCatalog;
  // Collection .id is also the aggregate source's identity, with any JSON shape.
  const projected=key==='id'&&['root','upgrade','context_classifications'].includes(family)?value:publicIndexValue(family,value);
  const bytes=JSON.stringify(projected),valueId=typeof value?.id==='string'?hash(JSON.stringify(value.id)):null;
  if(prior&&prior.position===row.position&&prior.bytes===bytes&&prior.value_id_sha256===valueId)return false;
  db.prepare('INSERT OR REPLACE INTO public_read_values VALUES(?,?,?,?,?,?)').run(family,stored,row.position,bytes,valueId,hash(JSON.stringify([family,stored,row.position,bytes,valueId])));
  return affectsCatalog;
}
function writePublicIndex(db,state) {
  installPublicIndex(db);
  db.exec('DELETE FROM public_read_catalog');
  if([...collections].some(key=>state[key]!=null&&typeof state[key]!=='object')||Object.values(state.jobs??{}).some(value=>!publicIndexCompatible('jobs',value)))return;
  db.exec('DELETE FROM public_read_values');
  for(const [key,value] of Object.entries(state)) {
    if(collections.has(key)&&value&&typeof value==='object') {
      const shape=db.prepare("SELECT position FROM state_entries WHERE family='shape' AND key=?").get(storedKey(db,key));
      const stored=storedKey(db,key),bytes=JSON.stringify(Array.isArray(value)?'array':'object');
      db.prepare('INSERT INTO public_read_values VALUES(?,?,?,?,?,?)').run('shape',stored,shape.position,bytes,null,hash(JSON.stringify(['shape',stored,shape.position,bytes,null])));
      for(const [id,item] of Object.entries(value))updatePublicIndexValue(db,key,id,item);
    } else updatePublicIndexValue(db,'root',key,value);
  }
  finishPublicIndex(db);
}
function checkPublicValue(row) {
  if(hash(JSON.stringify([row.family,row.key,row.position,row.bytes,row.value_id_sha256]))!==row.sha256)throw Error('Public read metadata hash mismatch');
  return row;
}
function finishPublicIndex(db) {
  const state={};
  for(const row of db.prepare("SELECT * FROM public_read_values WHERE family IN ('root','shape') ORDER BY position").all().map(checkPublicValue)) {
    Object.defineProperty(state,logicalKey(db,row.key),{value:row.family==='shape'?(JSON.parse(row.bytes)==='array'?[]:{}):JSON.parse(row.bytes),enumerable:true});
  }
  for(const row of db.prepare("SELECT * FROM public_read_values WHERE family NOT IN ('root','shape') ORDER BY position").all().map(checkPublicValue)) {
    Object.defineProperty(state[row.family],logicalKey(db,row.key),{value:JSON.parse(row.bytes),enumerable:true});
  }
  const catalog=publicCatalog(state),insert=db.prepare('INSERT INTO public_read_rows VALUES(?,?,?,?,?,?)');
  db.exec('DELETE FROM public_read_rows');
  for(const [collection,info] of Object.entries(catalog.collections)) {
    info.rows.forEach((row,n)=>insert.run(collection,n,storedKey(db,row.key),JSON.stringify(row.id),hash(JSON.stringify([collection,n,row.key,row.id])),hash(JSON.stringify(row.key))));delete info.rows;
  }
  const exports=Object.entries(state.records??{}).filter(([,v])=>v.prototype?.export?.status==='writing');
  exports.forEach(([key],n)=>insert.run('_exports',n,storedKey(db,key),JSON.stringify(''),hash(JSON.stringify(['_exports',n,key,''])),hash(JSON.stringify(key))));
  catalog.exports=exports.length;
  const bytes=JSON.stringify(catalog);
  db.prepare('INSERT OR REPLACE INTO public_read_catalog VALUES(1,1,?,?)').run(hash(bytes),bytes);
}
export function readPublicIndex(db) {
  if(!normalizedLayout(db)||!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='public_read_catalog'").get())return null;
  const row=db.prepare('SELECT * FROM public_read_catalog WHERE id=1').get();
  if(!row)return null; // An older/foreign writer invalidated the projection.
  if(row.version!==1)throw Error('Unknown public read index version');
  if(hash(row.bytes)!==row.sha256)throw Error('Public read index hash mismatch');
  const catalog=JSON.parse(row.bytes);
  if(catalog.version!==1||Object.keys(catalog).sort().join(',')!=='claims,collections,exports,usage,version'||Object.keys(catalog.collections).join(',')!==PUBLIC_COLLECTIONS.join(','))throw Error('Unknown public read index fields');
  if(!Number.isSafeInteger(catalog.exports)||catalog.exports<0||!Number.isSafeInteger(catalog.claims)||catalog.claims<0)throw Error('Corrupt public reconciliation metadata');
  if(!catalog.usage||Object.keys(catalog.usage).sort().join(',')!=='assignments,coordinator_usage,details_collection,effective_settings,missing_reasons,scope,unit,with_applied_controls,with_host_reported_models'||['assignments','missing_reasons','with_applied_controls','with_host_reported_models'].some(key=>!Number.isSafeInteger(catalog.usage[key])||catalog.usage[key]<0))throw Error('Unknown or corrupt public usage metadata');
  for(const info of Object.values(catalog.collections))if(Object.keys(info).sort().join(',')!=='inventory,total'||!Number.isSafeInteger(info.total)||info.total<0||!/^[a-f0-9]{64}$/.test(info.inventory))throw Error('Corrupt public collection metadata');
  // A partial derived schema cannot safely serve reads or incremental writes.
  // Keep this fixed-size metadata check independent of canonical archive size.
  const objects=db.prepare("SELECT name FROM sqlite_master WHERE (type='table' AND name IN ('public_read_values','public_read_rows')) OR (type='index' AND name IN ('public_read_value_ids','public_read_handles')) OR (type='trigger' AND name IN ('public_read_insert','public_read_update','public_read_delete'))").all();
  if(objects.length!==7)return null;
  return catalog;
}
function publicRow(db,row) {
  const key=logicalKey(db,row.key);let id;
  try{id=JSON.parse(row.id);}catch{throw Error('Corrupt public index identity');}
  if(typeof id!=='string'||JSON.stringify(id)!==row.id||hash(JSON.stringify([row.collection,row.ordinal,key,id]))!==row.sha256)throw Error('Public read index row hash mismatch');
  return {key,id};
}
export function readPublicRows(db,collection,offset,limit) {
  return db.prepare('SELECT collection,ordinal,key,id,sha256 FROM public_read_rows WHERE collection=? AND ordinal>=? AND ordinal<? ORDER BY ordinal').all(collection,offset,offset+limit).map(row=>publicRow(db,row));
}
export function readPublicHandle(db,collection,keyHash) {
  const rows=db.prepare('SELECT collection,ordinal,key,id,sha256 FROM public_read_rows WHERE collection=? AND key_sha256=? ORDER BY ordinal').all(collection,keyHash);
  if(rows.length!==1)throw Error('Missing or ambiguous public storage-key handle');
  const key=publicRow(db,rows[0]).key;
  if(hash(JSON.stringify(key))!==keyHash)throw Error('Public storage-key handle hash mismatch');
  return key;
}

export function readPublicAlias(db,collection,id) {
  const row=db.prepare('SELECT * FROM public_read_values WHERE family=? AND value_id_sha256=? ORDER BY position LIMIT 1').get(collection,hash(JSON.stringify(id)));
  return row?logicalKey(db,checkPublicValue(row).key):null;
}

// Internal mechanical intake evidence. No acceptance or transition semantics.
const metadataId=row=>JSON.stringify([row.family,row.key]);
const metadataSort=(a,b)=>a.family<b.family?-1:a.family>b.family?1:a.key<b.key?-1:a.key>b.key?1:0;
const metadataRoot=(layout,entries)=>hash(JSON.stringify([layout,entries]));
const eventHash=row=>row?hash(JSON.stringify([row.seq,row.at,row.type,row.value])):null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function intakeHold(message){throw Error('Storage intake hold: '+message);}
export function captureStorageMetadata(db) {
  const version=layoutVersion(db);if(!version)intakeHold('legacy JSON requires explicit migration');
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('company','events','company_layout','state_entries','immutable_values') AND name NOT GLOB 'public_read_*' ORDER BY type,name").all();
  const layout={version,identity:hash(JSON.stringify([schema,db.prepare('SELECT * FROM company_layout ORDER BY id').all()]))};
  validateKeyMetadata(db);
  const entries=db.prepare('SELECT family,key,position,sha256'+(hasEncoding(db)?',encoding':",'json' AS encoding")+' FROM state_entries').all().map(row=>({...row,key:logicalKey(db,row.key)})).sort(metadataSort);
  return {layout,entries,root:metadataRoot(layout,entries)};
}
function eventTail(db) {return db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq DESC LIMIT 1').get();}
function cut(db,metadata) {
  const tail=eventTail(db);
  return {version:1,...metadata,seq:tail?.seq??0,event_sha256:eventHash(tail)};
}
export function captureStorageBaseline(db) {
  const metadata=captureStorageMetadata(db);
  if(metadata.layout.version!==4)intakeHold('exact intake requires explicit migration to normalized v4');
  validateMetadata(db,metadata);
  const baseline=cut(db,metadata);
  return {...baseline,sha256:hash(JSON.stringify(baseline))};
}
// Called inside the writer's existing transaction. Metadata queries never join
// immutable bodies, including when an old native return is being appended.
export function insertStorageEvent(db,type,payload,before) {
  const at=new Date().toISOString(),tail=eventTail(db),seq=(tail?.seq??0)+1;
  if(before) {
    const after=captureStorageMetadata(db);
    if(!same(before.layout,after.layout))intakeHold('layout changed during write');
    const old=new Map(before.entries.map(row=>[metadataId(row),row])),next=new Map(after.entries.map(row=>[metadataId(row),row]));
    const changes=[];
    for(const identity of new Set([...old.keys(),...next.keys()])) {
      const a=old.get(identity)??null,b=next.get(identity)??null;
      if(!same(a,b))changes.push({before:a,after:b});
    }
    payload={...payload,storage_delta:{version:1,layout:before.layout,before_root:before.root,after_root:after.root,previous_event_sha256:eventHash(tail),changes}};
    payload.storage_delta.sha256=hash(JSON.stringify([seq,at,type,payload]));
  }
  db.prepare('INSERT INTO events(seq,at,type,value) VALUES(?,?,?,?)').run(seq,at,type,JSON.stringify(payload));
}
function validateMetadata(db,metadata,verifyValue=null) {
  if(metadata.layout?.version!==4||metadata.root!==metadataRoot(metadata.layout,metadata.entries))intakeHold('metadata root or layout mismatch');
  const ids=new Set(),positions=new Set(),top=new Map(),shapes=new Map(),journalParents=new Map();
  for(const row of metadata.entries) {
    if(Object.keys(row).sort().join(',')!=='encoding,family,key,position,sha256'||typeof row.family!=='string'||typeof row.key!=='string'||!Number.isSafeInteger(row.position)||row.position<0||!/^[a-f0-9]{64}$/.test(row.sha256))intakeHold('invalid metadata identity');
    // Round-trip the canonical v4 key representation without reading a body.
    if(logicalKey(db,storedKey(db,row.key))!==row.key)intakeHold('inexact identity');
    const identity=metadataId(row),position=JSON.stringify([['root','shape'].includes(row.family)?'top':row.family,row.position]);
    if(ids.has(identity)||positions.has(position))intakeHold('duplicate identity or order');
    ids.add(identity);positions.add(position);
    if(!['json','journal-array'].includes(row.encoding))intakeHold('ambiguous encoding');
    if(row.encoding==='journal-array') {
      if(row.family!=='upgrade'||!journals.has(row.key))intakeHold('ambiguous journal encoding');
      journalParents.set('upgrade.'+row.key,row);
    }
    if(['root','shape'].includes(row.family)) {
      if(top.has(row.key))intakeHold('ambiguous root/shape');top.set(row.key,row);
      if(row.family==='shape') {if(!collections.has(row.key)||row.encoding!=='json')intakeHold('unsupported shape');shapes.set(row.key,row);}
    }
    if(verifyValue)verifyValue(row);
  }
  const ordered=[...metadata.entries].sort(metadataSort);
  if(!same(ordered,metadata.entries))intakeHold('noncanonical metadata order');
  for(const row of metadata.entries) {
    if(['root','shape'].includes(row.family))continue;
    if(!shapes.has(row.family)&&!journalParents.has(row.family))intakeHold('orphan family');
  }
  // Descriptors and shapes are small metadata values. Baseline capture stays
  // body-free; the explicit reader validates directly referenced row envelopes,
  // not the transitive snapshot dependency graph inside their JSON values.
  if(verifyValue) {
    for(const row of shapes.values())if(!['array','object'].includes(JSON.parse(readImmutable(db,row.sha256))))intakeHold('unknown collection shape');
    for(const [family,row] of journalParents) {
      const descriptor=journalDescriptor({...row,bytes:readImmutable(db,row.sha256)});
      const children=metadata.entries.filter(entry=>entry.family===family).sort((a,b)=>a.position-b.position);
      if(children.length!==descriptor.length||children.some((child,n)=>child.key!==String(n)||child.position!==n||child.encoding!=='json'))intakeHold('journal shape mismatch');
    }
    for(const row of metadata.entries)if(row.family==='upgrade'&&journals.has(row.key)&&row.encoding==='json') {
      const value=JSON.parse(readImmutable(db,row.sha256));
      if(!Array.isArray(value)&&((value?.version===1&&value?.family==='upgrade.'+row.key)||journalParents.has('upgrade.'+row.key)))intakeHold('journal encoding marker missing');
    }
  }
}
// Verifies exact normalized row envelopes and event changes only. Before review,
// publication or use, the checkpoint caller must resolve accepted old/new
// envelopes against its frozen version map and captureSnapshotDependencies /
// validateSnapshotDependencies against the bound vault. Missing/corrupt originals
// hold there; intake success alone does not validate immutable_snapshot or
// immutable_entry dependencies. Writer capture remains metadata-only.
export function readStorageIntake(db,baseline,{values=false}={}) {
  const {sha256,...unsigned}=baseline??{};
  if(sha256!==hash(JSON.stringify(unsigned))||unsigned.version!==1||!Number.isSafeInteger(unsigned.seq)||unsigned.seq<0)intakeHold('invalid baseline; bind the runtime baseline into the reviewed proposal');
  const current=captureStorageMetadata(db);
  if(!same(baseline.layout,current.layout))intakeHold('changed layout');
  const checked=new Set(),verify=row=>{
    if(checked.has(row.sha256))return;
    JSON.parse(readImmutable(db,row.sha256));checked.add(row.sha256);
  };
  validateMetadata(db,baseline,verify);
  const anchor=baseline.seq?db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(baseline.seq):undefined;
  if(eventHash(anchor)!==baseline.event_sha256)intakeHold('baseline event changed or missing');
  const end=cut(db,current),events=db.prepare('SELECT seq,at,type,value FROM events WHERE seq>? ORDER BY seq').all(baseline.seq);
  if(end.seq<baseline.seq||events.length!==end.seq-baseline.seq)intakeHold('event coverage gap');
  let metadata={layout:baseline.layout,entries:baseline.entries,root:baseline.root},previous=baseline.event_sha256,seq=baseline.seq;
  const intake=[];
  for(const event of events) {
    if(event.seq!==++seq)intakeHold('nonconsecutive event coverage');
    const payload=JSON.parse(event.value),delta=payload.storage_delta;
    if(event.value!==JSON.stringify(payload))intakeHold('changed event bytes');
    if(!delta||delta.version!==1)intakeHold('uncovered writer');
    const {sha256:seal,...body}=delta;
    if(seal!==hash(JSON.stringify([event.seq,event.at,event.type,{...payload,storage_delta:body}]))||delta.previous_event_sha256!==previous)intakeHold('changed event or chain');
    if(!same(delta.layout,baseline.layout)||delta.before_root!==metadata.root||!Array.isArray(delta.changes))intakeHold('before root or layout mismatch');
    const rows=new Map(metadata.entries.map(row=>[metadataId(row),row])),seen=new Set();
    for(const change of delta.changes) {
      const {before,after}=change;
      if(!before&&!after||before&&after&&metadataId(before)!==metadataId(after))intakeHold('delta identity mismatch');
      const identity=metadataId(before??after);
      if(seen.has(identity)||!same(rows.get(identity)??null,before)||same(before,after))intakeHold('before/after chain mismatch');
      seen.add(identity);
      if(after)rows.set(identity,after);else rows.delete(identity);
    }
    metadata={layout:baseline.layout,entries:[...rows.values()].sort(metadataSort),root:delta.after_root};
    validateMetadata(db,metadata,verify);
    intake.push({seq:event.seq,at:event.at,type:event.type,payload,changes:delta.changes.map(change=>values?Object.fromEntries(Object.entries(change).map(([side,ref])=>[side,ref?{...ref,raw:readImmutable(db,ref.sha256)}:null])):change)});
    previous=eventHash(event);
  }
  validateMetadata(db,current,verify);
  if(!same(metadata,current)||previous!==end.event_sha256)intakeHold('current end state mismatch');
  return {baseline_sha256:sha256,cut:{version:end.version,layout:end.layout,seq:end.seq,event_sha256:end.event_sha256,root:end.root},events:intake};
}
