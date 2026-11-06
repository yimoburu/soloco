import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
function layoutVersion(db) {
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_layout'").get())return 0;
  const version=db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version;
  if(![1,2,3,4].includes(version))throw Error('Unknown or corrupt company storage layout; migration compatibility required');
  return version;
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
  if(!['root','records','jobs','context_classifications'].includes(family)||typeof key!=='string')throw Error('Raw storage read requires a direct supported family and exact key');
  if(layoutVersion(db)>=3&&!hasEncoding(db))throw Error('Journal storage encoding column missing');
  validateKeyMetadata(db,['root','shape',family]);
  if(family!=='root'){
    const shape=db.prepare("SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family='shape' AND key=?").get(storedKey(db,family));
    if(!shape)return null;
    if(decode(shape,db)!=='object')throw Error('Raw storage collection must be an object');
  }
  const row=db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? AND key=?').get(family,storedKey(db,key));
  if(!row)return null;
  if(row.encoding!==undefined&&row.encoding!=='json')throw Error('Raw storage read requires JSON value encoding');
  const value=decode(logicalRow(db,row),db);
  return {family,key,sha256:row.sha256,characters:row.bytes.length,raw:row.bytes,
    ...(value&&typeof value==='object'&&Object.hasOwn(value,'id')?{value_id:value.id}:{}),
    ...(value&&typeof value==='object'&&Object.hasOwn(value,'revision')?{revision:value.revision}:{})};
}

export function readNormalized(db,{rootKeys=null,entities=null}={}) {
  if(layoutVersion(db)>=3&&!hasEncoding(db))throw Error('Journal storage encoding column missing');
  validateKeyMetadata(db,entities===null?null:['root','shape',...Object.keys(entities)]);
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
  if(layoutVersion(db)>=3)journalLayout(db);
  const entries=split(db,state),existing=new Set(db.prepare('SELECT family,key FROM state_entries').all().map(r=>JSON.stringify([r.family,r.key])));
  for(const [family,key,n,value,encoding] of entries){put(db,family,key,n,value,encoding);existing.delete(JSON.stringify([family,storedKey(db,key)]));}
  for(const key of existing)db.prepare('DELETE FROM state_entries WHERE family=? AND key=?').run(...JSON.parse(key));
}
export function migrateNormalized(db,directory) {
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
  for(const {family,key,value} of changes) {
    const journal=family==='upgrade'&&journals.has(key);
    if(journal&&layoutVersion(db)>=3)journalLayout(db);
    const old=db.prepare('SELECT position FROM state_entries WHERE family=? AND key=?').get(family,storedKey(db,key));
    if(value===undefined)db.prepare('DELETE FROM state_entries WHERE family=? AND key=?').run(family,storedKey(db,key));
    else {
      const n=old?.position??db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM state_entries WHERE family=?').get(family).n;
      for(const entry of valueEntries(db,family,key,n,value))put(db,...entry);
    }
    if(journal)db.prepare('DELETE FROM state_entries WHERE family=? AND position>=?').run('upgrade.'+key,Array.isArray(value)?value.length:0);
  }
}
