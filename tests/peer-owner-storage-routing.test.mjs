// Actual SQLite/filesystem races over disposable SOURCE fixtures. These tests
// perform no live company, native/model/provider call or runtime acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {peerOwnerStorageKind,peerOwnerRoutingStorageKind,peerOwnerRuntimeAction,withPeerPublicStorage} from '../plugins/soloco/runtime/peer-owner-runtime.mjs';
import {runWithMcpHostContext} from '../plugins/soloco/runtime/mcp-host-context.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {captureLegacyPinnedTeam,legacySourceId} from '../plugins/soloco/runtime/peers/legacy-origin.mjs';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import * as main from '../plugins/soloco/runtime/main.mjs';

const ROOT='11111111-1111-4111-8111-111111111111';
const hash=value=>createHash('sha256').update(value).digest('hex');
const code=expected=>error=>error?.code===expected;
function temp(t,prefix='soloco-SOURCE-storage-routing-'){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),prefix)));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;
}
function legacy(t){
 const root=temp(t),directory=path.join(root,'.company');fs.mkdirSync(directory);const file=path.join(directory,'company.sqlite'),db=new DatabaseSync(file);
 db.exec("CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER);INSERT INTO company_layout VALUES(1,4);CREATE TABLE company(id INTEGER PRIMARY KEY,value TEXT);INSERT INTO company VALUES(1,'original');CREATE TABLE events(seq INTEGER PRIMARY KEY,at TEXT,type TEXT,value TEXT);");db.close();return {root,file};
}
function sqlState(file){
 const db=new DatabaseSync(file,{readOnly:true});try{const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();return canonical({schema,tables:schema.filter(r=>r.type==='table').map(({name})=>({name,rows:db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'" ORDER BY rowid').all()}))});}finally{db.close();}
}
function changedProbe(file,{every=false}={}){
 const lstat=fs.lstatSync,open=fs.openSync;let armed=false,changes=0,opens=0;
 fs.openSync=function(name,...args){const fd=Reflect.apply(open,this,[name,...args]);if(name===file){armed=true;opens++;}return fd;};
 fs.lstatSync=function(name,...args){
  const result=Reflect.apply(lstat,this,[name,...args]),stack=new Error().stack;
  if(armed&&name===file&&(every||changes===0)&&stack.includes('at storagePreflight (')&&!stack.includes('at pinned (')&&!stack.includes('at location (')){
   armed=false;changes++;const next=new Date(Date.now()+changes*1000);fs.utimesSync(file,next,next);
  }
  return result;
 };
 return {get opens(){return opens;},get changes(){return changes;},restore(){fs.lstatSync=lstat;fs.openSync=open;}};
}

test('readonly routing schema discovery waits for a real independently committing SQLite writer',async t=>{
 const f=legacy(t),shared=new Int32Array(new SharedArrayBuffer(12));
 const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const state=new Int32Array(workerData.shared);const db=new DatabaseSync(workerData.file);try{db.exec('BEGIN EXCLUSIVE');parentPort.postMessage('locked');if(Atomics.wait(state,0,0,5000)==='timed-out')throw Error('SOURCE schema reader never armed');Atomics.wait(state,1,0,120);db.exec("UPDATE company SET value='writer-committed' WHERE id=1;COMMIT");Atomics.store(state,2,1);parentPort.postMessage('committed');}finally{if(db.isTransaction)db.exec('ROLLBACK');db.close();}`,{eval:true,execArgv:[],workerData:{file:f.file,shared:shared.buffer}});
 const finished=new Promise((resolve,reject)=>{worker.once('error',reject);worker.once('exit',status=>status===0?resolve():reject(Error('SOURCE writer exit '+status)));});finished.catch(()=>{});
 await new Promise((resolve,reject)=>{worker.once('message',value=>value==='locked'?resolve():reject(Error('Unexpected SOURCE lock state')));worker.once('error',reject);});
 const prepare=DatabaseSync.prototype.prepare,exec=DatabaseSync.prototype.exec;let configured=false,armed=false;
 DatabaseSync.prototype.exec=function(sql,...args){if(sql==='PRAGMA busy_timeout=5000;')configured=true;return Reflect.apply(exec,this,[sql,...args]);};
 DatabaseSync.prototype.prepare=function(sql,...args){if(!armed&&typeof sql==='string'&&sql.includes('SELECT name FROM sqlite_master')){assert.equal(configured,true,'Existing Store-equivalent finite wait precedes schema discovery');assert.equal(Atomics.load(shared,2),0,'The actual other writer still owns its exclusive transaction');armed=true;Atomics.store(shared,0,1);Atomics.notify(shared,0);}return Reflect.apply(prepare,this,[sql,...args]);};
 try{assert.equal(peerOwnerRoutingStorageKind(f.root),null);}
 finally{DatabaseSync.prototype.prepare=prepare;DatabaseSync.prototype.exec=exec;Atomics.store(shared,0,1);Atomics.notify(shared,0);await finished;}
 assert.equal(armed,true);assert.equal(Atomics.load(shared,2),1);const db=new DatabaseSync(f.file,{readOnly:true});try{assert.equal(db.prepare('SELECT value FROM company WHERE id=1').get().value,'writer-committed');}finally{db.close();}
});
test('a benign file-version change is still a direct Hold but routing discards that probe and reopens once',t=>{
 const f=legacy(t),before=sqlState(f.file);let race=changedProbe(f.file);
 try{assert.throws(()=>peerOwnerStorageKind(f.root),code('OWNER_STORAGE_CHANGED'));assert.equal(race.opens,1);}finally{race.restore();}
 race=changedProbe(f.file);try{assert.equal(peerOwnerRoutingStorageKind(f.root),null);assert.equal(race.changes,1);assert.equal(race.opens,2);}finally{race.restore();}
 assert.equal(sqlState(f.file),before);
});
test('routing retries at most three owned changes and never falls back to legacy classification',t=>{
 const f=legacy(t),before=sqlState(f.file),race=changedProbe(f.file,{every:true});
 try{assert.throws(()=>peerOwnerRoutingStorageKind(f.root),code('OWNER_STORAGE_CHANGED'));assert.equal(race.changes,3);assert.equal(race.opens,3);}finally{race.restore();}
 assert.equal(sqlState(f.file),before);
});
test('provider Error and AggregateError lookalikes propagate unchanged without any retry',t=>{
 const f=legacy(t),before=sqlState(f.file),prepare=DatabaseSync.prototype.prepare,cause=Error('SYNTHETIC provider cause'),member=Error('SYNTHETIC member');
 for(const sentinel of [Object.assign(Error('SYNTHETIC provider'),{code:'OWNER_STORAGE_CHANGED'}),Object.assign(new AggregateError([member],'SYNTHETIC provider group',{cause}),{code:'OWNER_STORAGE_CHANGED',name:'OWNER_STORAGE_CHANGED'})]){
  let calls=0;DatabaseSync.prototype.prepare=function(sql,...args){if(typeof sql==='string'&&sql.includes('SELECT name FROM sqlite_master')){calls++;throw sentinel;}return Reflect.apply(prepare,this,[sql,...args]);};
  try{assert.throws(()=>peerOwnerRoutingStorageKind(f.root),error=>error===sentinel);assert.equal(calls,1);if(sentinel instanceof AggregateError){assert.strictEqual(sentinel.cause,cause);assert.strictEqual(sentinel.errors[0],member);}}finally{DatabaseSync.prototype.prepare=prepare;}
 }
 assert.equal(sqlState(f.file),before);
});
function closedPeer(t,paused){
 const f=peerFixture({control:{paused},principals:{founder:{native_id:ROOT,legacy_owner:{host:'codex',session_id:ROOT,epoch:7}}}}),roles={cos:{mission:'SYNTHETIC routing source'}},state={id:f.ledger.company_id,plugin_version:'fixture',runtime_version:'fixture',governance:'Fictional complete governance.',cos_instructions:'Fictional complete instructions.',roles,owner:{host:'codex',session_id:ROOT,epoch:7}};
 state.governance_sha256=hash(state.governance);state.team_sha256=hash(JSON.stringify([state.plugin_version,state.governance,roles,state.cos_instructions]));
 const sources=['plugin_version','governance','roles','cos_instructions'].map((key,position)=>{const bytes=JSON.stringify(state[key]),source={family:'root',key,position,encoding:'json',sha256:hash(bytes)};source.source_id=legacySourceId(source);f.ledger.db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(source.sha256,bytes);return source;});
 const cut=hash('SYNTHETIC complete source'),bundle=captureLegacyPinnedTeam(state,sources,cut);
 f.ledger.write('SYNTHETIC.pins','founder',tx=>{const p=tx.put('control','pinned-team',{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256:peerDigest(bundle)},0),c=tx.get('control','company');tx.put('control','company',{...c.value,pinned_team:{family:'control',id:p.id,revision:p.revision,sha256:p.sha256},legacy_source_cut_sha256:cut,team_sha256:state.team_sha256,governance_sha256:state.governance_sha256},c.revision);});
 const root=f.ledger.root,file=f.ledger.file;f.ledger.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');f.ledger.close();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,file};
}
function sourceSwap(a,b){
 const held=a.file+'.held',other=a.file+'.replacement';fs.copyFileSync(b.file,other);const lstat=fs.lstatSync,rename=fs.renameSync;let attacked=false,swapped=false;
 const restore=()=>{if(swapped){rename(a.file,other);rename(held,a.file);swapped=false;}};
 fs.lstatSync=function(file,...args){if(swapped&&file===a.root)restore();const result=Reflect.apply(lstat,this,[file,...args]),stack=new Error().stack;if(!attacked&&file===a.file&&stack.includes('at storagePreflight (')&&!stack.includes('at pinned (')&&!stack.includes('at location (')){rename(a.file,held);rename(other,a.file);swapped=true;attacked=true;}return result;};
 return {get attacked(){return attacked;},dispose(){fs.lstatSync=lstat;restore();fs.rmSync(other,{force:true});}};
}
test('routing discards an actual A/B-open swap while strict discovery and actual private peer access stay original',async t=>{
 const a=closedPeer(t,false),b=closedPeer(t,true),before=sqlState(a.file);let swap=sourceSwap(a,b);
 try{assert.throws(()=>peerOwnerStorageKind(a.root),code('OWNER_STORAGE_CHANGED'));assert.equal(swap.attacked,true);}finally{swap.dispose();}
 let privateQueries=0;const prepare=DatabaseSync.prototype.prepare;DatabaseSync.prototype.prepare=function(sql,...args){if(typeof sql==='string'&&/\bpeer_(rows|versions|events)\b/i.test(sql))privateQueries++;return Reflect.apply(prepare,this,[sql,...args]);};
 swap=sourceSwap(a,b);try{assert.equal(peerOwnerRoutingStorageKind(a.root),'peer');assert.equal(swap.attacked,true);assert.equal(privateQueries,0,'Routing never reads canonical peer records, including wrong B');}finally{swap.dispose();DatabaseSync.prototype.prepare=prepare;}
 const result=await runWithMcpHostContext('codex',{threadId:ROOT,sessionId:ROOT},()=>peerOwnerRuntimeAction({root:a.root,session_id:ROOT,action:'status'},'codex'));
 assert.equal(result.paused,false,'Actual private peer access reopened and validated original A');assert.equal(sqlState(a.file),before);
});
test('linked storage retains its typed failure and the existing friendly linked-path message',t=>{
 const f=legacy(t),root=temp(t);fs.symlinkSync(path.join(f.root,'.company'),path.join(root,'.company'),'dir');
 assert.throws(()=>peerOwnerRoutingStorageKind(root),error=>error.code==='OWNER_STORAGE_LINK'&&/linked/.test(error.message));
});
test('actual legacy engine open/status and startup hook use only the retried routing probe',t=>{
 const cache=temp(t),root=temp(t),previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=cache;
 t.after(()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;});
 const args={root,session_id:ROOT,name:'SYNTHETIC source company',idea:'Fictional routing test only'};engine.bind(root,ROOT,'codex');engine.open(args,'codex');const file=path.join(root,'.company','company.sqlite');
 for(const invoke of [()=>engine.open(args,'codex'),()=>engine.status(args,'codex'),()=>main.hook({cwd:root,session_id:ROOT,hook_event_name:'SessionStart'},'codex')]){
  const race=changedProbe(file);try{const value=invoke();assert.ok(value&&typeof value==='object');assert.equal(race.changes,1);assert.equal(race.opens,2);}finally{race.restore();}
 }
});

// Controlled branch evidence: these are real Stats from an opened, then
// unlinked file, substituted at lstat. The separate genuine SQLite observation
// proves that premise; this fixture does not claim an actual lstat race.
function retiredStats(t){
 const file=path.join(temp(t,'soloco-SOURCE-retired-stats-'),'retired');fs.writeFileSync(file,'retired sidecar fixture');
 const fd=fs.openSync(file,'r');fs.unlinkSync(file);const value=fs.fstatSync(fd,{bigint:true});t.after(()=>fs.closeSync(fd));
 assert.equal(value.isFile(),true);assert.equal(value.isSymbolicLink(),false);assert.equal(value.nlink,0n);return value;
}
function sidecarProbe(f,suffix,site,value,{every=false,armed=()=>true}={}){
 const original=fs.lstatSync;let hits=0,locations=0;
 fs.lstatSync=function(file,...args){
  const stack=new Error().stack;
  if(file===f.file&&stack.includes('at location ('))locations++;
  if(file===f.file+suffix&&stack.includes(`at ${site} (`)&&armed()&&(every||hits===0)){hits++;return value;}
  return Reflect.apply(original,this,[file,...args]);
 };
 return {get hits(){return hits;},get locations(){return locations;},restore(){fs.lstatSync=original;}};
}
test('retired original sidecars Hold directly while routing starts a fresh complete classification',t=>{
 for(const suffix of ['-wal','-shm'])for(const site of ['location','stable']){
  const f=legacy(t),before=sqlState(f.file),zero=retiredStats(t);let probe=sidecarProbe(f,suffix,site,zero);
  try{assert.throws(()=>peerOwnerStorageKind(f.root),error=>error.code==='OWNER_STORAGE_CHANGED'&&error.message.includes(`component=${suffix.slice(1)}`)&&/type=regular;links=0/.test(error.message)&&!error.message.includes(f.root));assert.equal(probe.hits,1);}finally{probe.restore();}
  probe=sidecarProbe(f,suffix,site,zero);
  try{assert.equal(peerOwnerRoutingStorageKind(f.root),null);assert.equal(probe.hits,1);assert.equal(probe.locations,2,'routing restarts from a fresh original main-file stat');}finally{probe.restore();}
  assert.equal(sqlState(f.file),before);
 }
});
test('perpetually retired sidecars exhaust exactly three readonly probes',t=>{
 for(const suffix of ['-wal','-shm'])for(const site of ['location','stable']){
  const f=legacy(t),before=sqlState(f.file),probe=sidecarProbe(f,suffix,site,retiredStats(t),{every:true});
  try{assert.throws(()=>peerOwnerRoutingStorageKind(f.root),code('OWNER_STORAGE_CHANGED'));assert.equal(probe.hits,3);assert.equal(probe.locations,3);}finally{probe.restore();}
  assert.equal(sqlState(f.file),before);
 }
});
test('a retired probe followed by actual hardlinked symlink or directory sidecars remains fatal',t=>{
 for(const suffix of ['-wal','-shm'])for(const kind of ['hardlink','symlink','directory']){
  const f=legacy(t),originalBytes=fs.readFileSync(f.file),other=path.join(f.root,'other');fs.writeFileSync(other,'not SQLite');
  if(kind==='hardlink')fs.linkSync(other,f.file+suffix);else if(kind==='symlink')fs.symlinkSync(other,f.file+suffix);else fs.mkdirSync(f.file+suffix);
  const probe=sidecarProbe(f,suffix,'location',retiredStats(t));
  try{assert.throws(()=>peerOwnerRoutingStorageKind(f.root),error=>error.code==='OWNER_STORAGE_LINK'&&/linked/.test(error.message)&&error.message.includes(`component=${suffix.slice(1)}`)&&error.message.length<250&&!error.message.includes(f.root));assert.equal(probe.hits,1);assert.equal(probe.locations,2,'fatal links do not receive another retry');}finally{probe.restore();}
  assert.deepEqual(fs.readFileSync(f.file),originalBytes);
 }
});
test('sidecar provider lookalikes preserve identity and missing-main or main-hardlink storage still Holds',t=>{
 for(const suffix of ['-wal','-shm']){
  const f=legacy(t),original=fs.lstatSync,cause=Error('source cause'),member=Error('source member');
  for(const sentinel of [Object.assign(Error('source provider'),{code:'OWNER_STORAGE_CHANGED'}),Object.assign(new AggregateError([member],'source group',{cause}),{code:'OWNER_STORAGE_CHANGED'})]){
   let calls=0;fs.lstatSync=function(file,...args){if(file===f.file+suffix){calls++;throw sentinel;}return Reflect.apply(original,this,[file,...args]);};
   try{assert.throws(()=>peerOwnerRoutingStorageKind(f.root),error=>error===sentinel);assert.equal(calls,1);if(sentinel instanceof AggregateError){assert.strictEqual(sentinel.cause,cause);assert.strictEqual(sentinel.errors[0],member);}}finally{fs.lstatSync=original;}
  }
  fs.unlinkSync(f.file);fs.writeFileSync(f.file+suffix,'orphan');assert.throws(()=>peerOwnerRoutingStorageKind(f.root),code('OWNER_STORAGE_LAYOUT'));
 }
 const f=legacy(t);fs.linkSync(f.file,f.file+'.hardlink');assert.throws(()=>peerOwnerRoutingStorageKind(f.root),code('OWNER_STORAGE_LINK'));
});
test('a retired post-invoke sidecar rejects the operation without replaying its callback',async t=>{
 for(const suffix of ['-wal','-shm']){
  const f=legacy(t),before=sqlState(f.file);let calls=0,armed=false;const probe=sidecarProbe(f,suffix,'stable',retiredStats(t),{armed:()=>armed});
  try{await assert.rejects(withPeerPublicStorage(f.root,true,()=>{calls++;armed=true;return {read:true};}),code('OWNER_STORAGE_CHANGED'));assert.equal(calls,1);assert.equal(probe.hits,1);}finally{probe.restore();}
  assert.equal(sqlState(f.file),before);
 }
});
