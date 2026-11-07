import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,stamp} from '../plugins/soloco/runtime/store.mjs';
import {submitTask,sendTaskMessage,disposeTaskMessage} from '../plugins/soloco/runtime/tasks.mjs';
import {installTaskIndex,updateTaskIndex,taskKeys,taskCursor,messageKeys,readTaskState,taskIndexAvailable} from '../plugins/soloco/runtime/task-index.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';

function fixture(fn){
  const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-index-'))),root=path.join(home,'source'),data=path.join(home,'data'),old=process.env.COMPANY_PLUGIN_DATA;
  fs.mkdirSync(root);fs.mkdirSync(data);process.env.COMPANY_PLUGIN_DATA=data;
  const identity={root,session_id:id('founder'),epoch:1};
  try{
    engine.bind(root,identity.session_id,'codex');engine.open({...identity,idea:'Fictional canonical async index'},'codex');withStore(root,db=>db.migrate());
    const db=f=>withStore(root,f),write=(f,{indexed=true}={})=>{let result;db(d=>d.transaction('fixture.async-index',s=>{result=f(s);return s;},indexed?{afterWrite:updateTaskIndex}:{}));return result;};
    const create=operation_id=>write(s=>submitTask(s,{...identity,operation_id,source_instruction:'Prepare bounded fictional evidence.',role:'engineer',task:'Prepare fictional output '+operation_id,acceptance:'Fictional facts remain attributable',expected_deliverable:'One bounded fictional artifact'},'codex'));
    fn({home,root,identity,db,write,create});
  }finally{if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(home,{recursive:true,force:true});}
}
const initialize=db=>db(d=>installTaskIndex(d));

test('read does not install a derived index; explicit rebuild verifies canonical task membership',()=>fixture(({db,create})=>{
  const task=create('before-start');
  db(d=>{assert.equal(taskIndexAvailable(d),false);assert.equal(taskKeys(d).uninitialized,true);assert.equal(taskIndexAvailable(d),false);});
  initialize(db);db(d=>{assert.deepEqual(taskKeys(d).ids,[task.id]);assert.equal(taskKeys(d,{active:true}).total,1);});
}));

test('metadata state tampering, missing and extra task IDs Hold even when source SHA is unchanged',()=>fixture(({db,create})=>{
  initialize(db);const task=create('indexed');
  db(d=>d.db.prepare("UPDATE async_task_index SET state='accepted' WHERE id=?").run(task.id));
  db(d=>assert.throws(()=>taskKeys(d,{active:true}),/tampered/));initialize(db);
  db(d=>d.db.prepare('DELETE FROM async_task_index WHERE id=?').run(task.id));db(d=>assert.throws(()=>taskKeys(d),/incomplete/));initialize(db);
  db(d=>d.db.prepare('INSERT INTO async_task_index VALUES(?,?,?)').run('async-task-'+'f'.repeat(32),'planned','a'.repeat(64)));db(d=>assert.throws(()=>taskKeys(d),/tampered/));initialize(db);
  db(d=>assert.equal(taskKeys(d).total,1));
}));

test('unmirrored canonical updates Hold and afterWrite failure rolls canonical state and index back together',()=>fixture(({db,create,write})=>{
  initialize(db);const task=create('atomic');
  write(s=>{s.records[task.id].revision++;s.records[task.id].updated_at=stamp();},{indexed:false});
  db(d=>assert.throws(()=>taskKeys(d),/stale/));initialize(db);
  const before=db(d=>JSON.stringify(d.read()));
  db(d=>assert.throws(()=>d.transaction('fixture.bad-task',s=>{s.records[task.id].runtime_task.state='invented-terminal-state';return s;},{afterWrite:updateTaskIndex}),/Invalid canonical/));
  assert.equal(db(d=>JSON.stringify(d.read())),before);db(d=>assert.equal(taskKeys(d,{active:true}).total,1));
}));

test('public cursors are opaque and generation-bound, while internal live scans survive mutations',()=>fixture(({db,create,write})=>{
  initialize(db);for(let n=0;n<5;n++)create('page-'+n);
  const first=db(d=>taskKeys(d,{limit:2}));assert.equal(first.ids.length,2);assert.notEqual(first.cursor,first.ids.at(-1));
  const second=db(d=>taskKeys(d,{limit:2,cursor:first.cursor})),third=db(d=>taskKeys(d,{limit:2,cursor:second.cursor}));
  assert.equal(new Set([...first.ids,...second.ids,...third.ids]).size,5);assert.equal(third.complete,true);
  const clipped=db(d=>taskCursor(d,first.ids[0]));assert.equal(db(d=>taskKeys(d,{limit:2,cursor:clipped})).ids[0],first.ids[1]);
  const live=db(d=>taskKeys(d,{limit:2,live:true}));assert.equal(live.cursor,live.ids.at(-1));
  const generation=first.generation;write(s=>{s.name=s.name;});assert.equal(db(d=>taskKeys(d)).generation,generation);initialize(db);assert.equal(db(d=>taskKeys(d)).generation,generation);
  create('new-page');db(d=>assert.throws(()=>taskKeys(d,{cursor:first.cursor}),/stale/));db(d=>assert.doesNotThrow(()=>taskKeys(d,{cursor:live.cursor,live:true})));
  db(d=>assert.throws(()=>taskKeys(d,{cursor:first.ids[0]}),/opaque/));db(d=>assert.throws(()=>taskKeys(d,{limit:0}),/limit/));
}));

test('cursor inventory binding rejects a changed index even if generation is reset to an old value',()=>fixture(({db,create})=>{
  initialize(db);create('one');create('two');const before=db(d=>taskKeys(d,{limit:1}));create('different-branch');
  db(d=>d.db.prepare('UPDATE async_index_meta SET generation=? WHERE id=1').run(before.generation));
  db(d=>assert.throws(()=>taskKeys(d,{cursor:before.cursor}),/stale/));
}));

test('message index selects one recipient, pages chronologically, and detects recipient/status tampering',()=>fixture(({db,create,write,identity})=>{
  initialize(db);const a=create('receiver-a'),b=create('receiver-b');
  const send=(operation_id,target,content)=>write(s=>sendTaskMessage(s,{...identity,operation_id,to_task_id:target,content},'codex'));
  const one=send('message-one',a.id,'First exact body'),two=send('message-two',a.id,'Second exact body');send('other-message',b.id,'Unrelated body');
  const first=db(d=>messageKeys(d,a.id,{limit:1})),next=db(d=>messageKeys(d,a.id,{after:first.cursor,limit:1}));
  assert.equal(first.total,2);assert.equal(first.complete,false);assert.equal(next.complete,true);assert.equal(new Set([...first.ids,...next.ids]).size,2);
  db(d=>assert.throws(()=>messageKeys(d,b.id,{after:one.id}),/another inbox/));
  db(d=>d.db.prepare('UPDATE async_message_index SET to_task_id=? WHERE id=?').run(b.id,one.id));db(d=>assert.throws(()=>messageKeys(d,a.id),/tampered/));initialize(db);
  db(d=>d.db.prepare("UPDATE async_message_index SET state='processed' WHERE id=?").run(two.id));db(d=>assert.throws(()=>messageKeys(d,a.id),/tampered/));initialize(db);
  write(s=>disposeTaskMessage(s,{...identity,message_id:one.id,operation_id:'dispose-one',disposition:'This exact input has an explicit recorded disposition.'},'codex'));
  assert.equal(db(d=>messageKeys(d,a.id)).total,2);
}));

test('targeted inbox closure includes exact message provenance but not unrelated archive bodies',()=>fixture(({db,create,write,identity})=>{
  initialize(db);const a=create('target'),b=create('other');
  const message=write(s=>sendTaskMessage(s,{...identity,operation_id:'one-message',to_task_id:a.id,content:'Exact relevant message'},'codex'));
  write(s=>{for(let i=0;i<100;i++){const key='unrelated-'+i;s.records[key]={id:key,kind:'artifact',status:'Draft',revision:1,content:'archive'.repeat(1000)};}});
  db(d=>{
    const calls=[],read=d.readPublicSelected.bind(d);d.readPublicSelected=options=>{calls.push(options.entities?.records??[]);return read(options);};
    const {state}=readTaskState(d,{task_ids:[a.id],limit:1});
    assert(state.records[a.id]);assert(state.records[message.id]);assert(!state.records[b.id]);assert(!Object.keys(state.records).some(k=>k.startsWith('unrelated-')));assert(!calls.flat().some(k=>k.startsWith('unrelated-')));
  });
}));

test('fixed task/index read volume is unchanged by 100x unrelated archive growth',()=>fixture(({db,create,write})=>{
  initialize(db);const a=create('fixed'),metrics=[];
  for(const size of [1,10,100]){
    write(s=>{for(let i=0;i<size;i++){const key='resolved-archive-'+i;s.records[key]={id:key,kind:'artifact',status:'Draft',revision:1,content:'Complete retained fictional archive '.repeat(100)};}});
    const data=db(d=>readTaskState(d,{task_ids:[a.id],limit:1}));metrics.push({size,bytes:Buffer.byteLength(JSON.stringify(data.state)),generation:data.page.generation});
  }
  assert.equal(new Set(metrics.map(m=>m.bytes)).size,1);assert.equal(new Set(metrics.map(m=>m.generation)).size,1);
}));

test('backup restore preserves canonical evidence and permits explicit derived-index rebuild',()=>fixture(({home,root,db,create,write,identity})=>{
  initialize(db);const a=create('portable');write(s=>sendTaskMessage(s,{...identity,operation_id:'portable-message',to_task_id:a.id,content:'Retain this canonical evidence across restore.'},'codex'));
  const backup=path.join(home,'backup'),restored=path.join(home,'restored');db(d=>backupCompany(d,backup));restoreCompany(backup,restored);
  withStore(restored,d=>{assert.equal(taskKeys(d).total,1);assert.equal(messageKeys(d,a.id).total,1);d.db.prepare('DELETE FROM async_task_index').run();assert.throws(()=>taskKeys(d),/incomplete/);installTaskIndex(d);assert.equal(taskKeys(d).ids[0],a.id);assert.equal(messageKeys(d,a.id).total,1);});
}));

test('unknown index versions and missing tables Hold instead of implying an empty queue',()=>fixture(({db})=>{
  initialize(db);db(d=>d.db.prepare('UPDATE async_index_meta SET version=99 WHERE id=1').run());db(d=>assert.throws(()=>taskKeys(d),/unsupported/));db(d=>assert.throws(()=>installTaskIndex(d),/Unsupported/));
  db(d=>{d.db.prepare('UPDATE async_index_meta SET version=1 WHERE id=1').run();d.db.exec('DROP TABLE async_message_index');assert.throws(()=>taskKeys(d),/incomplete/);});
}));

test('targeted controls include normalized pending upgrade status; semantic reads retain unknown extensions',()=>fixture(({db,write})=>{
  initialize(db);write(s=>{s.upgrade={id:'pending-upgrade',status:'checking'};s.unknown_new_extension={condition:'Unknown obligations remain compulsory'};});
  db(d=>{const targeted=readTaskState(d).state;assert.equal(targeted.upgrade.status,'checking');const semantic=readTaskState(d,{semantic:true}).state;assert.equal(semantic.unknown_new_extension.condition,'Unknown obligations remain compulsory');});
}));
