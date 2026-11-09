import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const collections=new Set(['records','jobs','sessions','notices','messages','upgrade_history','retired_sessions','context_classifications','upgrade']);
const arrayCollections=new Set(['notices','messages','upgrade_history','retired_sessions']);
const sqlString=value=>"'"+value.replaceAll("'","''")+"'";

// Explicit opt-in layout. Legacy company is retained as a fenced sentinel;
// all logical state, including unknown fields, remains round-trippable.
export function normalizedLayout(db) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='company_layout'").get()
    && db.prepare('SELECT version FROM company_layout WHERE id=1').get()?.version===1;
}
function install(db) {
  db.exec(`CREATE TABLE company_layout(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
    CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL);
    CREATE TABLE state_entries(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,sha256 TEXT NOT NULL REFERENCES immutable_values(sha256),PRIMARY KEY(family,key));
    CREATE INDEX state_entries_order ON state_entries(family,position);
    INSERT INTO company_layout VALUES(1,1);`);
}
function put(db,family,key,position,value) {
  const bytes=JSON.stringify(value);if(bytes===undefined)throw Error('Unsupported undefined stored value');
  const sha=hash(bytes);
  db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(sha,bytes);
  db.prepare('INSERT INTO state_entries VALUES(?,?,?,?) ON CONFLICT(family,key) DO UPDATE SET position=excluded.position,sha256=excluded.sha256 WHERE state_entries.sha256<>excluded.sha256 OR state_entries.position<>excluded.position').run(family,key,position,sha);
}
function split(value) {
  const entries=[];
  Object.entries(value).forEach(([key,item],position)=>{
    if(collections.has(key)&&item&&typeof item==='object') {
      entries.push(['shape',key,position,Array.isArray(item)?'array':'object']);
      Object.entries(item).forEach(([id,v],n)=>entries.push([key,id,n,v]));
    } else entries.push(['root',key,position,item]);
  });return entries;
}
function decode(row) {
  if(!row)return undefined;
  if(typeof row.bytes!=='string'||hash(row.bytes)!==row.sha256)throw Error('Immutable storage value hash mismatch');
  return JSON.parse(row.bytes);
}
export function readNormalized(db,{rootKeys=null,entities=null}={}) {
  const state={};
  const selected=[],params=[];
  if(rootKeys===null)selected.push("e.family='root'");
  else if(rootKeys.length){selected.push("(e.family='root' AND e.key IN ("+rootKeys.map(()=>'?').join(',')+"))");params.push(...rootKeys);}
  if(entities===null)selected.push("e.family='shape'");
  else if(Object.keys(entities).length){const keys=Object.keys(entities);selected.push("(e.family='shape' AND e.key IN ("+keys.map(()=>'?').join(',')+"))");params.push(...keys);}
  const rows=selected.length?db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE '+selected.join(' OR ')+' ORDER BY position').all(...params):[];
  for(const row of rows) {
    if(rootKeys&&!rootKeys.includes(row.key)&&row.family==='root')continue;
    if(row.family==='root')state[row.key]=decode(row);
    else {
      if(entities&&!Object.hasOwn(entities,row.key))continue;
      const shape=decode(row);state[row.key]=shape==='array'?[]:{};
      const wanted=entities?.[row.key];
      const entryRows=wanted===undefined||wanted===null?db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? ORDER BY position').all(row.key):wanted.map(key=>db.prepare('SELECT e.*,v.bytes FROM state_entries e LEFT JOIN immutable_values v USING(sha256) WHERE family=? AND key=?').get(row.key,String(key))).filter(Boolean);
      for(const entry of entryRows)Object.defineProperty(state[row.key],entry.key,{value:decode(entry),enumerable:true,writable:true,configurable:true});
    }
  }return state;
}
export function writeNormalized(db,state) {
  const entries=split(state),existing=new Set(db.prepare('SELECT family,key FROM state_entries').all().map(r=>JSON.stringify([r.family,r.key])));
  for(const [family,key,n,value] of entries){put(db,family,key,n,value);existing.delete(JSON.stringify([family,key]));}
  for(const key of existing)db.prepare('DELETE FROM state_entries WHERE family=? AND key=?').run(...JSON.parse(key));
}
export function migrateNormalized(db,directory) {
  if(normalizedLayout(db))throw Error('Company storage already migrated');
  const row=db.prepare('SELECT value FROM company WHERE id=1').get();if(!row)throw Error('No initialized company');
  const state=JSON.parse(row.value);
  const backup=path.join(directory,'storage-backup-'+Date.now()+'-'+hash(row.value).slice(0,12)+'.sqlite');
  if(fs.existsSync(backup))throw Error('Backup exists');
  db.exec('VACUUM INTO '+sqlString(backup));
  try {
    db.exec('BEGIN IMMEDIATE');
    const current=db.prepare('SELECT value FROM company WHERE id=1').get();
    if(current.value!==row.value)throw Error('Company changed during migration; retained backup, retry with fresh authority');
    install(db);writeNormalized(db,state);
    const readback=JSON.stringify(readNormalized(db));
    if(readback!==JSON.stringify(state))throw Error('Storage migration readback mismatch');
    db.prepare('UPDATE company SET value=? WHERE id=1').run(JSON.stringify({schema:0,storage_format:'normalized-v1',message:'This company requires a runtime supporting normalized storage; do not reinitialize.'}));
    db.exec(`CREATE TRIGGER fence_legacy_update BEFORE UPDATE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;
      CREATE TRIGGER fence_legacy_delete BEFORE DELETE ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;
      CREATE TRIGGER fence_legacy_insert BEFORE INSERT ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced: normalized company storage'); END;`);
    db.exec('COMMIT');
    return {format:'normalized-v1',backup,source_sha256:hash(row.value),readback_sha256:hash(readback),originals_preserved:true};
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
}
export function writeNormalizedSelection(db,changes) {
  for(const {family,key,value} of changes) {
    const old=db.prepare('SELECT position FROM state_entries WHERE family=? AND key=?').get(family,key);
    if(value===undefined)db.prepare('DELETE FROM state_entries WHERE family=? AND key=?').run(family,key);
    else put(db,family,key,old?.position??db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM state_entries WHERE family=?').get(family).n,value);
  }
}
