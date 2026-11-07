import {digest} from './store.mjs';
import {validateTaskRecord,validateTaskMessage} from './tasks.mjs';
import {RUNTIME_CONTROL_ID} from './task-runtime-authority.mjs';

export const TASK_ROOT_KEYS=['id','schema','name','idea','mode','phase','paused','owner','runtime_version','plugin_version','team_sha256','governance','governance_sha256','cos_instructions','roles','revision','upgrade','handover','operating_state','context_classifications'];
const taskPattern=/^async-task-[a-f0-9]{32}$/;
const messagePattern=/^async-message-[a-f0-9]{32}$/;
const tables=['async_task_index','async_message_index','async_index_meta','async_runtime_lease'];
const present=(sql,name)=>Boolean(sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
const canonicalKeys=(sql,prefix)=>sql.prepare("SELECT key FROM state_entries WHERE family='records' AND key GLOB ? ORDER BY key").all(prefix+'*').map(r=>r.key);
export function requireTaskStorage(db){if(db.storageInfo().format!=='normalized-v4')throw Error('Async tasks require explicit company_storage migrate to normalized-v4; no implicit migration was performed');}
export function taskIndexAvailable(db){
  const exists=tables.map(name=>present(db.db,name));
  if(!exists.some(Boolean))return false;
  if(!exists.every(Boolean))throw Error('Async index layout is incomplete; current-owner company_runtime start must rebuild it');
  const meta=db.db.prepare('SELECT version,generation FROM async_index_meta WHERE id=1').get();
  if(!meta||meta.version!==1||!Number.isSafeInteger(meta.generation)||meta.generation<1)throw Error('Async index metadata is unsupported or corrupt; explicit rebuild required');
  return true;
}
function generation(sql){const row=sql.prepare('SELECT version,generation FROM async_index_meta WHERE id=1').get();if(row?.version!==1||!Number.isSafeInteger(row.generation)||row.generation<1)throw Error('Async index generation is corrupt');return row.generation;}
function assertIndex(db){
  requireTaskStorage(db);if(!taskIndexAvailable(db))return null;
  const sql=db.db;
  // Check membership AND indexed scalar fields against canonical records. A
  // forged terminal state must never silently hide live work from active pages.
  const badTasks=sql.prepare("SELECT COUNT(*) AS n FROM state_entries e LEFT JOIN immutable_values v ON v.sha256=e.sha256 LEFT JOIN async_task_index i ON i.id=e.key WHERE e.family='records' AND e.key GLOB 'async-task-*' AND (i.id IS NULL OR i.sha256<>e.sha256 OR v.bytes IS NULL OR json_extract(v.bytes,'$.id') IS NOT e.key OR json_extract(v.bytes,'$.runtime_task.version') IS NOT 1 OR json_extract(v.bytes,'$.runtime_task.state') IS NOT i.state OR i.state NOT IN ('planned','queued','running','returned','accepted','needs_attention','cancelling','cancelled'))").get().n;
  const extraTasks=sql.prepare("SELECT COUNT(*) AS n FROM async_task_index i LEFT JOIN state_entries e ON e.family='records' AND e.key=i.id WHERE e.key IS NULL OR e.key NOT GLOB 'async-task-*'").get().n;
  const badMessages=sql.prepare("SELECT COUNT(*) AS n FROM state_entries e LEFT JOIN immutable_values v ON v.sha256=e.sha256 LEFT JOIN async_message_index i ON i.id=e.key WHERE e.family='records' AND e.key GLOB 'async-message-*' AND (i.id IS NULL OR i.sha256<>e.sha256 OR v.bytes IS NULL OR json_extract(v.bytes,'$.id') IS NOT e.key OR json_extract(v.bytes,'$.runtime_message.version') IS NOT 1 OR json_extract(v.bytes,'$.runtime_message.to_task_id') IS NOT i.to_task_id OR json_extract(v.bytes,'$.runtime_message.state') IS NOT i.state OR json_extract(v.bytes,'$.created_at') IS NOT i.created_at OR i.state NOT IN ('pending','processed'))").get().n;
  const extraMessages=sql.prepare("SELECT COUNT(*) AS n FROM async_message_index i LEFT JOIN state_entries e ON e.family='records' AND e.key=i.id WHERE e.key IS NULL OR e.key NOT GLOB 'async-message-*'").get().n;
  if(badTasks||extraTasks||badMessages||extraMessages)throw Error('Async task/message index stale, incomplete or tampered; current-owner company_runtime start must rebuild it');
  return generation(sql);
}
function fingerprints(sql){return digest(JSON.stringify([sql.prepare('SELECT id,state,sha256 FROM async_task_index ORDER BY id').all(),sql.prepare('SELECT id,to_task_id,state,created_at,sha256 FROM async_message_index ORDER BY id').all()]));}
function changedGeneration(sql){const prior=generation(sql);if(prior>=Number.MAX_SAFE_INTEGER)throw Error('Async index generation exhausted');sql.prepare('UPDATE async_index_meta SET generation=? WHERE id=1').run(prior+1);}
function sourceHash(sql,key){const row=sql.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key=?").get(key);if(!row)throw Error('Canonical async record disappeared before index update');return row.sha256;}
function upsertTask(sql,state,r){
  validateTaskRecord(r,state);
  return Number(sql.prepare('INSERT INTO async_task_index VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,sha256=excluded.sha256 WHERE state<>excluded.state OR sha256<>excluded.sha256').run(r.id,r.runtime_task.state,sourceHash(sql,r.id)).changes);
}
function upsertMessage(sql,state,r){
  validateTaskMessage(r,state);
  return Number(sql.prepare('INSERT INTO async_message_index VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET to_task_id=excluded.to_task_id,state=excluded.state,created_at=excluded.created_at,sha256=excluded.sha256 WHERE to_task_id<>excluded.to_task_id OR state<>excluded.state OR created_at<>excluded.created_at OR sha256<>excluded.sha256').run(r.id,r.runtime_message.to_task_id,r.runtime_message.state,r.created_at,sourceHash(sql,r.id)).changes);
}
export function installTaskIndex(db){
  requireTaskStorage(db);const sql=db.db,own=!db.inTransaction;
  if(own){sql.exec('BEGIN IMMEDIATE');db.inTransaction=true;}
  try{
    sql.exec('CREATE TABLE IF NOT EXISTS async_task_index(id TEXT PRIMARY KEY,state TEXT NOT NULL,sha256 TEXT NOT NULL); CREATE INDEX IF NOT EXISTS async_task_states ON async_task_index(state,id); CREATE TABLE IF NOT EXISTS async_message_index(id TEXT PRIMARY KEY,to_task_id TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,sha256 TEXT NOT NULL); CREATE INDEX IF NOT EXISTS async_message_recipient ON async_message_index(to_task_id,created_at,id); CREATE TABLE IF NOT EXISTS async_index_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,generation INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS async_runtime_lease(instance_id TEXT PRIMARY KEY,pid INTEGER NOT NULL,heartbeat_at TEXT NOT NULL);');
    const previous=sql.prepare('SELECT version,generation FROM async_index_meta WHERE id=1').get();
    if(previous&&(previous.version!==1||!Number.isSafeInteger(previous.generation)||previous.generation<1))throw Error('Unsupported async index version; explicit compatibility repair required');
    if(!previous)sql.prepare('INSERT INTO async_index_meta VALUES(1,1,1)').run();
    const before=fingerprints(sql),taskIds=canonicalKeys(sql,'async-task-'),messageIds=canonicalKeys(sql,'async-message-');
    const state=db.readPublicSelected({rootKeys:['id'],entities:{records:[...taskIds,...messageIds],jobs:[]}}),jobs=new Set();
    for(const r of Object.values(state.records??{})){
      for(const a of r.runtime_task?.attempts??[])jobs.add(a.job_id);
      const m=r.runtime_message;if(m?.from_attempt_id)jobs.add(m.from_attempt_id);if(m?.disposition?.attempt_id)jobs.add(m.disposition.attempt_id);
    }
    if(jobs.size)Object.assign(state.jobs,db.readPublicSelected({rootKeys:[],entities:{jobs:[...jobs]}}).jobs);
    sql.exec('DELETE FROM async_task_index; DELETE FROM async_message_index;');
    for(const key of taskIds){if(!state.records[key])throw Error('Canonical task index source missing');upsertTask(sql,state,state.records[key]);}
    for(const key of messageIds){if(!state.records[key])throw Error('Canonical message index source missing');upsertMessage(sql,state,state.records[key]);}
    if(previous&&before!==fingerprints(sql))changedGeneration(sql);
    if(own)sql.exec('COMMIT');
  }catch(error){if(own)sql.exec('ROLLBACK');throw error;}
  finally{if(own)db.inTransaction=false;}
}
export function updateTaskIndex(sql,state){
  if(!present(sql,'async_index_meta'))return;
  let changed=0;
  for(const key of Object.keys(state.records??{})){
    if(key.startsWith('async-task-'))changed+=upsertTask(sql,state,state.records[key]);
    else if(key.startsWith('async-message-'))changed+=upsertMessage(sql,state,state.records[key]);
  }
  changed+=Number(sql.prepare("DELETE FROM async_task_index WHERE NOT EXISTS(SELECT 1 FROM state_entries e WHERE e.family='records' AND e.key=async_task_index.id)").run().changes);
  changed+=Number(sql.prepare("DELETE FROM async_message_index WHERE NOT EXISTS(SELECT 1 FROM state_entries e WHERE e.family='records' AND e.key=async_message_index.id)").run().changes);
  if(changed)changedGeneration(sql);
}
function taskInventory(sql){return digest(JSON.stringify(sql.prepare('SELECT id,state,sha256 FROM async_task_index ORDER BY id').all()));}
function encodeCursor(after,gen,active,inventory){const value={version:1,collection:'async_tasks',generation:gen,inventory_sha256:inventory,active,after};return Buffer.from(JSON.stringify({...value,sha256:digest(JSON.stringify(value))})).toString('base64url');}
function decodeCursor(cursor,gen,active,inventory){
  if(typeof cursor!=='string'||cursor.length>2048||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error('Invalid opaque task cursor');
  let p;try{p=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));}catch{throw Error('Invalid opaque task cursor');}
  const {sha256,...value}=p??{};
  if(Object.keys(value).sort().join(',')!=='active,after,collection,generation,inventory_sha256,version'||value.version!==1||value.collection!=='async_tasks'||typeof value.active!=='boolean'||value.active!==active||!taskPattern.test(value.after??'')||sha256!==digest(JSON.stringify(value)))throw Error('Invalid opaque task cursor');
  if(value.generation!==gen||value.inventory_sha256!==inventory)throw Error('Task cursor is stale; restart the collection');return value.after;
}
export function taskCursor(db,key,{active=false}={}){
  return db.readSnapshot(()=>{const gen=assertIndex(db);if(gen===null)throw Error('Async task index is not initialized');if(!taskPattern.test(key??''))throw Error('Cursor needs an exact returned task ID');const row=db.db.prepare('SELECT state FROM async_task_index WHERE id=?').get(key);if(!row||active&&!['planned','queued','running','cancelling'].includes(row.state))throw Error('Task cursor item is missing or no longer matches');return encodeCursor(key,gen,active,taskInventory(db.db));});
}
export function taskKeys(db,{active=false,limit=100,cursor='',live=false}={}){
  return db.readSnapshot(()=>{
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||typeof active!=='boolean'||typeof live!=='boolean')throw Error('Task page requires limit1..100 and boolean selectors');
    const gen=assertIndex(db);if(gen===null)return {ids:[],complete:true,total:0,cursor:null,generation:null,uninitialized:true};
    const inventory=live?null:taskInventory(db.db);
    let after='';if(cursor){if(live){if(!taskPattern.test(cursor))throw Error('Internal live cursor must be an exact task key');after=cursor;}else after=decodeCursor(cursor,gen,active,inventory);}
    const clauses=active?" AND state IN ('planned','queued','running','cancelling')":'';
    const total=db.db.prepare('SELECT COUNT(*) AS n FROM async_task_index WHERE 1=1'+clauses).get().n;
    const rows=db.db.prepare('SELECT id FROM async_task_index WHERE id>?'+clauses+' ORDER BY id LIMIT ?').all(after,limit+1),ids=rows.slice(0,limit).map(r=>r.id),complete=rows.length<=limit;
    return {ids,complete,total,generation:gen,cursor:complete?null:live?ids.at(-1):encodeCursor(ids.at(-1),gen,active,inventory)};
  });
}
export function messageKeys(db,to_task_id,{after=null,limit=100}={}){
  return db.readSnapshot(()=>{
    if(!taskPattern.test(to_task_id??'')||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('Inbox needs an exact task ID and limit1..100');
    const gen=assertIndex(db);if(gen===null)return {ids:[],complete:true,total:0,cursor:null,generation:null,uninitialized:true};
    let at='',key='';
    if(after!==null){if(!messagePattern.test(after))throw Error('Inbox cursor must name an exact message');const row=db.db.prepare('SELECT to_task_id,created_at FROM async_message_index WHERE id=?').get(after);if(!row||row.to_task_id!==to_task_id)throw Error('Message cursor is stale or belongs to another inbox');at=row.created_at;key=after;}
    const total=db.db.prepare('SELECT COUNT(*) AS n FROM async_message_index WHERE to_task_id=?').get(to_task_id).n;
    const rows=db.db.prepare('SELECT id FROM async_message_index WHERE to_task_id=? AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT ?').all(to_task_id,at,at,key,limit+1),ids=rows.slice(0,limit).map(r=>r.id),complete=rows.length<=limit;
    return {ids,total,complete,generation:gen,cursor:complete?null:ids.at(-1)};
  });
}
export function readTaskState(db,{task_ids=[],message_ids=[],include_messages=true,active=false,limit=100,cursor='',live=false,semantic=false}={}){
  return db.readSnapshot(()=>{
    const page=taskKeys(db,{active,limit,cursor,live}),seeds=task_ids.length||message_ids.length?task_ids:page.ids,ids=new Set([...seeds,RUNTIME_CONTROL_ID,...message_ids]),inboxTargets=new Set(seeds),jobs=new Set(),sources=new Set();let state,changed=true,round=0;
    while(changed){
      if(round++>32||ids.size+jobs.size+sources.size>4096)throw Error('Task prerequisite/inbox closure exceeds bounded lookup; split the workflow');
      const before=ids.size+jobs.size+sources.size;
      state=db.readPublicSelected({rootKeys:TASK_ROOT_KEYS,entities:{records:[...ids,...sources],jobs:[...jobs],sessions:[],notices:null,messages:[],upgrade:['id','status']}});
      for(const r of Object.values(state.records??{})){
        const t=r.runtime_task;if(t){
          for(const d of t.spec?.depends_on??[])ids.add(d.task_id);if(t.spec?.review_task_id)ids.add(t.spec.review_task_id);for(const key of t.spec?.peer_task_ids??[])ids.add(key);
          for(const a of t.attempts??[])if(a.job_id)jobs.add(a.job_id);
          for(const key of [...(t.spec?.input_ids??[]),...(t.spec?.evidence_ids??[])])sources.add(key);
          if(include_messages&&inboxTargets.has(r.id)&&!page.uninitialized){const inbox=messageKeys(db,r.id,{limit:100});if(!inbox.complete)throw Error('Task inbox requires explicit bounded reconciliation before full working context');for(const key of inbox.ids)ids.add(key);}
        }
        const m=r.runtime_message;if(m){ids.add(m.to_task_id);if(m.from_task_id)ids.add(m.from_task_id);if(m.from_attempt_id)jobs.add(m.from_attempt_id);if(m.disposition?.attempt_id)jobs.add(m.disposition.attempt_id);}
      }
      for(const j of Object.values(state.jobs??{})){
        if(j.runtime_task?.id)ids.add(j.runtime_task.id);if(j.artifact_id)sources.add(j.artifact_id);if(j.review_of?.id)sources.add(j.review_of.id);
        for(const r of [...(j.inputs??[]),...(j.supplemental_sources??[]),...(j.retrieved_inputs??[])])if(r.id){if(r.id.startsWith('job:'))jobs.add(r.id.slice(4));else if(!r.id.startsWith('@public:'))sources.add(r.id);}
      }
      changed=before!==ids.size+jobs.size+sources.size;
    }
    // Qualification can require legacy originals and unknown root extensions.
    // Preserve the conservative full-state semantic path; index filtering alone
    // never grants semantic permission to omit company evidence.
    return {state:semantic?db.read():state,page};
  });
}
