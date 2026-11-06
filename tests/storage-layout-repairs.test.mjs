import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {retainSnapshot,snapshotBytes,bindSnapshots,inheritSnapshots,pinFrozenText,readFrozenText} from '../plugins/soloco/runtime/snapshot.mjs';
import {beginHandover,admitHandover,submitReconstruction,inspectHandover,handoverSubject} from '../plugins/soloco/runtime/handover.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';
const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'storage-repairs-')));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
const seed=()=>({id:'fictional',name:'Fixture',idea:'Preserve exact evidence',team_sha256:'team',phase:'Frame',mode:'preparation',owner:{host:'codex',session_id:'incoming',epoch:2},paused:true,governance:'rules',cos_instructions:'instructions',roles:{qa:{}},records:{},jobs:{},notices:[],messages:[],upgrade_history:[]});
function fixture(state=seed()){const root=fs.mkdtempSync(path.join(temporary,'company-'));const db=new Store(root,true);db.transaction('seed',()=>state);return {root,db};}
// Known old layouts with exact unencoded keys and monolithic journal arrays.
function oldLayout(version,state=seed()){
  const f=fixture(state),db=f.db.db,raw=JSON.stringify(f.db.read());
  db.exec(`CREATE TABLE company_layout(id INTEGER PRIMARY KEY,version INTEGER NOT NULL);
    CREATE TABLE immutable_values(sha256 TEXT PRIMARY KEY,bytes TEXT NOT NULL);
    CREATE TABLE state_entries(family TEXT NOT NULL,key TEXT NOT NULL,position INTEGER NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(family,key));`);
  db.prepare('INSERT INTO company_layout VALUES(1,?)').run(version);
  if(version>=3)db.exec("ALTER TABLE state_entries ADD COLUMN encoding TEXT NOT NULL DEFAULT 'json'");
  const put=(family,key,n,value)=>{const bytes=JSON.stringify(value),sha=digest(bytes);db.prepare('INSERT OR IGNORE INTO immutable_values VALUES(?,?)').run(sha,bytes);db.prepare('INSERT INTO state_entries(family,key,position,sha256) VALUES(?,?,?,?)').run(family,key,n,sha);};
  const collections=new Set(['records','jobs','sessions','notices','messages','upgrade_history','retired_sessions','context_classifications','upgrade']);
  Object.entries(JSON.parse(raw)).forEach(([key,value],n)=>{
    if(collections.has(key)&&value&&typeof value==='object'){put('shape',key,n,Array.isArray(value)?'array':'object');Object.entries(value).forEach(([id,item],i)=>put(key,id,i,item));}
    else put('root',key,n,value);
  });
  db.prepare('UPDATE company SET value=?').run(JSON.stringify({schema:0,storage_format:'normalized-v'+version}));
  for(const action of ['UPDATE','DELETE','INSERT'])db.exec(`CREATE TRIGGER fence_legacy_${action.toLowerCase()} BEFORE ${action} ON company BEGIN SELECT RAISE(ABORT,'Legacy writer fenced'); END;`);
  return f;
}

test('legacy capture holds atomically; ordinary writes/read/reopen do not migrate; explicit migration backs up exact origin',()=>{
  const {root,db}=fixture();const before=JSON.stringify(db.read()),token=db.changeToken();
  assert.equal(db.storageInfo().format,'legacy-json');
  assert.throws(()=>db.transaction('capture',s=>{s.original=retainSnapshot(s,{restriction:'Never omit'});return s;}),/explicit company_storage migrate/);
  assert.equal(JSON.stringify(db.read()),before);assert.equal(db.changeToken(),token);
  assert.equal(db.db.prepare("SELECT 1 FROM sqlite_master WHERE name='immutable_values'").get(),undefined);
  db.transaction('ordinary',s=>{s.name='Ordinary write';return s;});assert.equal(db.storageInfo().format,'legacy-json');
  db.close();const reopened=new Store(root);assert.equal(reopened.storageInfo().format,'legacy-json');
  const origin=reopened.db.prepare('SELECT value FROM company').get().value,m=reopened.migrate();assert.equal(m.format,'normalized-v4');
  assert.equal(m.source_sha256,digest(origin));assert.equal(m.readback_sha256,digest(JSON.stringify(reopened.read())));
  assert.equal(reopened.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(digest(origin)).bytes,origin);
  assert.ok(fs.existsSync(m.backup));assert.throws(()=>reopened.db.prepare('DELETE FROM company').run(),/Legacy writer fenced/);
  reopened.transaction('capture',s=>{s.original=retainSnapshot(s,{restriction:'Never omit'});return s;});
  assert.equal(JSON.parse(snapshotBytes(reopened.read(),reopened.read().original)).restriction,'Never omit');reopened.close();
});

test('known v1/v2/v3 layouts retain pending journals and compatibility; incompatible capture/keys require explicit migration',()=>{
  for(const version of [1,2,3]){
    const s=seed();s.upgrade={id:'pending',status:'checking',calls:[{text:'Exact old negative return'}],cos_pages:[],qa_pages:[],replays:[],deliveries:[]};
    const {db}=oldLayout(version,s),before=JSON.stringify(db.read());
    assert.equal(db.storageInfo().migration_required,true);
    assert.equal(db.appendUpgradeCall('pending',{role:'qa',text:'New negative fact'}),version>=3);
    if(version<3)db.transaction('legacy.return',state=>{state.upgrade.calls.push({text:'Compatible fallback'});return state;});
    assert.equal(db.storageInfo().format,'normalized-v'+version);
    const capture=()=>db.transaction('capture',state=>{state.ref=retainSnapshot(state,{exact:'original'});return state;});
    if(version===1)assert.throws(capture,/explicit company_storage migrate/);else capture();
    assert.throws(()=>db.transaction('unsafe key',state=>{state.records['a\0b']={id:'a\0b'};return state;}),/explicit company_storage migrate/);
    const logical=JSON.stringify(db.read()),m=db.migrate();assert.equal(m.format,'normalized-v4');assert.equal(JSON.stringify(db.read()),logical);
    assert.equal(db.read().upgrade.calls[0].text,'Exact old negative return');assert.ok(before.includes('Exact old negative return'));
    assert.throws(()=>db.db.prepare('UPDATE company SET value=?').run('{}'),/Legacy writer fenced/);db.close();
  }
});

test('v4 keys round-trip NUL, lone surrogates, literal prefix, unknown roots and order through selected writes and portable restore',()=>{
  const keys=['nul\0suffix','nul','surrogate\ud800suffix','surrogate\udfffsuffix','surrogate�suffix','pair🧪suffix','~json:"literal"','__proto__'];
  const s=seed();for(const key of keys){Object.defineProperty(s,key,{value:{unknown:key},enumerable:true,writable:true,configurable:true});Object.defineProperty(s.records,key,{value:{id:key,revision:1,content:'Exact '+key},enumerable:true,writable:true,configurable:true});}
  const {db}=fixture(s),before=JSON.stringify(db.read()),m=db.migrate();assert.equal(JSON.stringify(db.read()),before);assert.equal(m.source_sha256,m.readback_sha256);
  for(const key of keys){const selected=db.readSelected({rootKeys:[key],entities:{records:[key]}});assert.equal(Object.keys(selected.records)[0],key);assert.equal(selected.records[key].id,key);assert.equal(selected[key].unknown,key);}
  assert.deepEqual(Object.keys(db.readSelected({rootKeys:[],entities:{records:[...keys].reverse()}}).records),keys);
  db.selectedTransaction('exact selected',{rootKeys:['revision'],entities:{records:[keys[0]]}},state=>{state.records[keys[0]].content='Changed exactly';return state;});
  assert.equal(db.read().records[keys[0]].content,'Changed exactly');assert.equal(db.read().records.nul.content,'Exact nul');
  db.selectedTransaction('root exact',{rootKeys:[keys[1],keys[2]],entities:{}},state=>{delete state[keys[2]];state[keys[1]]={unknown:'updated'};return state;});
  assert.equal(Object.hasOwn(db.read(),keys[2]),false);assert.equal(db.read()[keys[1]].unknown,'updated');
  for(const key of ['added\0root','added\ud800root']){db.transaction('new exact identity',state=>{state[key]={unknown:key};state.records[key]={id:key,revision:1,content:'New exact value'};return state;});keys.push(key);assert.equal(db.readSelected({rootKeys:[key],entities:{records:[key]}}).records[key].id,key);}
  const exact=JSON.stringify(db.read()),backup=path.join(temporary,'identity-backup'),target=path.join(temporary,'identity-restore');backupCompany(db,backup);db.close();restoreCompany(backup,target);
  const restored=new Store(target);assert.equal(JSON.stringify(restored.read()),exact);assert.deepEqual(Object.keys(restored.read().records),keys);restored.close();
});

test('unknown layouts, corrupt key markers, missing originals and failed migration readback hold without adopting a layout',()=>{
  const {db}=oldLayout(1),before=JSON.stringify(db.read()),prepare=db.db.prepare;
  db.db.prepare=function(sql,...rest){if(sql.startsWith('SELECT e.*,v.bytes')&&this.prepare('SELECT version FROM company_layout').get().version===4)throw Error('Injected migration readback failure');return Reflect.apply(prepare,this,[sql,...rest]);};
  assert.throws(()=>db.migrate(),/Injected migration readback failure/);db.db.prepare=prepare;
  assert.equal(db.storageInfo().format,'normalized-v1');assert.equal(JSON.stringify(db.read()),before);
  assert.ok(fs.readdirSync(db.dir).some(name=>name.startsWith('storage-backup-')));db.migrate();
  db.db.prepare("UPDATE state_entries SET key='~json:123' WHERE family='root' AND key='name'").run();assert.throws(()=>db.read(),/key encoding/);
  assert.throws(()=>db.readSelected({rootKeys:['~json:123'],entities:{}}),/key encoding/);
  db.db.prepare("UPDATE state_entries SET key='name' WHERE family='root' AND key='~json:123'").run();
  db.db.prepare('UPDATE company_layout SET version=99').run();assert.throws(()=>db.read(),/Unknown or corrupt/);assert.throws(()=>db.transaction('hold',s=>s),/Unknown or corrupt/);db.close();
  const corrupt=oldLayout(2);corrupt.db.db.prepare("UPDATE immutable_values SET bytes='{}' WHERE sha256=(SELECT sha256 FROM state_entries WHERE family='root' AND key='name')").run();
  assert.throws(()=>corrupt.db.migrate(),/hash mismatch/);assert.equal(corrupt.db.storageInfo().format,'normalized-v2');corrupt.db.close();
});

test('contextMatches inherits exact resolver while arbitrary unbound copies still hold',()=>{
  const state=bindSnapshots(seed()),ref=retainSnapshot(state,{id:'fictional',records:{},jobs:{},notices:[],messages:[],obligation:'Never forget'});
  state.upgrade_history.push({id:'u',checkpoint:ref,checkpoint_sha256:ref.immutable_snapshot.sha256});
  const view=inheritSnapshots(state,{...state,owner:{...state.owner,epoch:3},records:{...state.records}});beginHandover(view,state.owner);admitHandover(view);
  const target=submitReconstruction(view,{session_id:view.owner.session_id,content:'Reconstruction of every objective, rule, authority, pending work, uncertainty and next action. '.repeat(3)});
  const job={id:'q',role:'qa',epoch:3,task:'Review',inputs:[],review_of:{id:target.id,revision:target.revision}};view.jobs.q=job;
  const pack=assignmentContext(view,job);job.context_sha256=pack.hash;assert.equal(contextMatches(view,job,pack.hash),true);
  const unbound=JSON.parse(JSON.stringify(view));assert.throws(()=>inspectHandover(unbound),/missing or corrupt/);
});

function range(state,packet){const s=packet.required_semantics;return inspectHandover(state,{action:'read',subject_sha256:packet.subject_sha256,source_id:s.source_id,sha256:s.sha256,offset:0,length:Math.min(1024,s.length)});}
test('frozen projection reuses exact bytes, invalidates second-writer/dependency changes, and detects original corruption between reads',()=>{
  const {root,db}=fixture();db.migrate();db.transaction('original',state=>{state.retained=retainSnapshot(state,{id:state.id,records:{},jobs:{},notices:[],messages:[],unknown:'Original nested immutable obligation'});state.upgrade_history.push({id:'old',checkpoint:state.retained,checkpoint_sha256:state.retained.immutable_snapshot.sha256});state.records.body={id:'body',revision:1,content:'Large frozen source '.repeat(10000)};return state;});
  let state=db.read(),packet=inspectHandover(state),a=range(state,packet),b=range(db.read(),packet);assert.deepEqual(a,b);
  // Mutating a returned descriptor cannot poison the frozen stream.
  packet.required_semantics.sha256='bad';assert.deepEqual(range(state,inspectHandover(state)),a);
  const writer=new Store(root);writer.transaction('source changed',s=>{s.records.body.content+='New restriction';return s;});
  assert.throws(()=>range(db.read(),inspectHandover(state)),/subject changed/);
  state=db.read();packet=inspectHandover(state);writer.transaction('dependency changed',s=>{s.governance+=' Revised relevant rule';return s;});assert.throws(()=>range(db.read(),packet),/subject changed/);
  state=db.read();packet=inspectHandover(state);const sha=state.retained.immutable_snapshot.sha256;
  writer.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{}',sha);assert.throws(()=>range(db.read(),packet),/hash mismatch|missing or corrupt/);
  writer.close();db.close();
});

test('projection cache eviction retains exact legacy frozen contract and failed-successor preview distinction',()=>{
  const s=bindSnapshots(seed());s.records.original={id:'original',revision:1,content:'Unique legacy evidence'};beginHandover(s,{...s.owner,epoch:1});
  const target=submitReconstruction(s,{session_id:s.owner.session_id,content:'Reconstruct all objectives, authority, constraints, failed work, uncertainty and evidence before an independent review. '.repeat(2)});
  target.handover.evidence_protocol=2;target.handover.subject=handoverSubject(s);target.handover.subject_sha256=digest(JSON.stringify(target.handover.subject));
  const job={role:'qa',task:'Legacy exact QA',inputs:[],review_of:{id:target.id,revision:1}};
  const ctx=assignmentContext(s,job);assert.equal(JSON.parse(ctx.text).protocol,'ordinary-handover-review-v2');
  s.records.negative={id:'negative',kind:'review',review_of:{id:target.id,revision:1},review:{verdict:'Blocked'},content:'Distinct unresolved negative review'};
  const original=JSON.stringify(target.handover.subject),packet=inspectHandover(s),first=range(s,packet);
  assert.notEqual(packet.subject_sha256,target.handover.subject_sha256);assert.equal(JSON.stringify(target.handover.subject),original);
  for(let i=0;i<3;i++){const other=bindSnapshots({...seed(),id:'evict-'+i});inspectHandover(other);}
  assert.deepEqual(range(s,packet),first);assert.equal(JSON.stringify(target.handover.subject),original);
  const ref=ctx.handover_evidence.sources[ctx.handover_evidence.pages[0].source_id];assert.ok(ref.raw.includes('Unique legacy evidence'));
});

test('raw direct-source reads bind exact pointers and originals across another writer, including unsafe keys and corruption',()=>{
  const state=seed(),key='raw\0\ud800';state.records[key]={id:key,revision:1,content:'Exact direct original 🧪'};
  const {root,db}=fixture(state);assert.equal(db.readRawValue({family:'records',key}),null);db.migrate();
  const raw=db.readRawValue({family:'records',key});assert.equal(raw.raw,JSON.stringify(db.read().records[key]));assert.equal(raw.sha256,digest(raw.raw));assert.equal(raw.value_id,key);assert.equal(raw.revision,1);
  const writer=new Store(root);writer.transaction('new source',s=>{s.records[key].revision++;s.records[key].content+='New rule';return s;});
  const after=db.readRawValue({family:'records',key});assert.notEqual(after.sha256,raw.sha256);assert.equal(after.revision,2);
  writer.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run('{}',after.sha256);assert.throws(()=>db.readRawValue({family:'records',key}),/hash mismatch/);
  writer.db.prepare('UPDATE immutable_values SET bytes=? WHERE sha256=?').run(after.raw,after.sha256);
  writer.db.exec('PRAGMA foreign_keys=OFF'); // Simulate out-of-band loss only.
  writer.db.prepare('DELETE FROM immutable_values WHERE sha256=?').run(after.sha256);assert.throws(()=>db.readRawValue({family:'records',key}),/hash mismatch/);
  writer.close();db.close();
});

test('explicit migration refuses a second-writer change after backup and keeps its exact source backup',()=>{
  const {root,db}=fixture(),writer=new Store(root),exec=db.db.exec,before=JSON.stringify(db.read());
  db.db.exec=function(sql){const result=Reflect.apply(exec,this,[sql]);if(sql.startsWith('VACUUM INTO'))writer.transaction('concurrent source',s=>{s.idea='New source restriction';return s;});return result;};
  assert.throws(()=>db.migrate(),/Company changed during migration/);db.db.exec=exec;
  assert.equal(db.storageInfo().format,'legacy-json');assert.equal(db.read().idea,'New source restriction');
  const backup=fs.readdirSync(db.dir).find(name=>name.startsWith('storage-backup-')),target=fs.mkdtempSync(path.join(temporary,'race-backup-'));
  fs.mkdirSync(path.join(target,'.company'));fs.copyFileSync(path.join(db.dir,backup),path.join(target,'.company/company.sqlite'));
  const restored=new Store(target);assert.equal(JSON.stringify(restored.read()),before);restored.close();writer.close();db.close();
});

test('detectable old lossy identities hold rather than adopting a normalized substitute',()=>{
  const {db}=oldLayout(1);
  const raw=JSON.stringify({id:'surrogate\ud800suffix',revision:1,content:'Exact original'}),sha=digest(raw);
  db.db.prepare('INSERT INTO immutable_values VALUES(?,?)').run(sha,raw);
  db.db.prepare("INSERT INTO state_entries VALUES('records',?,0,?)").run('surrogate\ud800suffix',sha);
  assert.throws(()=>db.read(),/identity corruption/);assert.throws(()=>db.migrate(),/identity corruption/);db.close();
});


test('pinned text preserves exact lone-surrogate hash encoding and Unicode range boundaries',()=>{
  const raw='Exact \ud800 lone and 🧪 pair',source={source_id:'frozen',raw,length:raw.length,scope:'test',path:'',encoding:'text',hash_encoding:'utf16le',sha256:createHash('sha256').update(raw,'utf16le').digest('hex')};
  const pin=pinFrozenText(source);source.raw='Mutable caller changed';
  const exact=readFrozenText(pin,{sha256:pin.sha256,offset:0,length:raw.length});assert.equal(exact.text,raw);assert.equal(exact.range_hash_encoding,'utf16le');assert.equal(exact.range_sha256,pin.sha256);
  const pair=raw.indexOf('🧪');assert.throws(()=>readFrozenText(pin,{sha256:pin.sha256,offset:pair+1,length:1}),/surrogate/);
  assert.throws(()=>readFrozenText({},{}),/Unknown frozen/);assert.throws(()=>pinFrozenText({...source,raw,sha256:'0'.repeat(64)}),/hash mismatch/);
});

test('pending legacy handover context and ordinary delivery writes keep their inline storage contract',()=>{
  const state=seed();state.records.original={id:'original',revision:1,content:'Exact pending legacy obligation'};
  beginHandover(state,{...state.owner,epoch:1});const target={id:'legacy',kind:'artifact',revision:1,status:'Submitted',author_role:'runner',author_instance:state.owner.session_id,content:'Retained legacy reconstruction',handover:{id:state.handover.id,evidence_protocol:2,input_refs:[],incoming_owner:{...state.owner}}};
  state.records.legacy=target;state.handover.reconstruction_id=target.id;target.handover.subject=handoverSubject(state);target.handover.subject_sha256=digest(JSON.stringify(target.handover.subject));
  const {db}=fixture(state),job={id:'legacy-qa',role:'qa',task:'Retained legacy review',inputs:[],review_of:{id:target.id,revision:1}},pack=assignmentContext(db.read(),job);
  assert.equal(JSON.parse(pack.text).protocol,'ordinary-handover-review-v2');
  db.transaction('pending legacy delivery',s=>{assert.equal(contextMatches(s,job,pack.hash),true);s.notices.push({id:'delivery',job_id:job.id,summary:'Own review output',resolution:null});return s;});
  assert.equal(contextMatches(db.read(),job,pack.hash),true);assert.equal(db.storageInfo().format,'legacy-json');db.close();
});


test('a duplicate original hash cannot conceal conflicting reference shape metadata in extension slots',()=>{
  const state=bindSnapshots(seed()),ref=retainSnapshot(state,{exact:'original'});
  state.wrong={immutable_snapshot:{...ref.immutable_snapshot,shape:'array'}};state.right=ref;
  assert.throws(()=>inspectHandover(state),/metadata mismatch|shape mismatch/);
});
