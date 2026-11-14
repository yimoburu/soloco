import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,stamp,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {submitTask,sendTaskMessage,disposeTaskMessage,bindTaskAttempt,reconcileTask,taskReady,taskContextFormat,isTaskOwnOutput,cancelTask} from '../plugins/soloco/runtime/tasks.mjs';
import {installTaskIndex,updateTaskIndex,taskKeys,taskCursor,messageKeys,readTaskState,taskIndexAvailable} from '../plugins/soloco/runtime/task-index.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {taskDefinitionBinding} from '../plugins/soloco/runtime/task-context.mjs';
import {setRuntimeControl} from '../plugins/soloco/runtime/task-runtime-authority.mjs';
import {TIMEOUT_POLICY_VERSION,normalizeTimeout} from '../plugins/soloco/runtime/timeout.mjs';
import {recordOriginalWorkerAssignmentFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {launchOriginalWorker,startOriginalModel,disposeOriginalProcessFixtures} from './original-worker-model-fixture.mjs';
import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {upgrade,rehearse} from '../plugins/soloco/runtime/upgrade.mjs';
import {contractModel} from './helpers/upgrade-incremental-model.mjs';

async function fixture(fn){
  const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-index-'))),root=path.join(home,'source'),data=path.join(home,'data'),old=process.env.COMPANY_PLUGIN_DATA;
  fs.mkdirSync(root);fs.mkdirSync(data);process.env.COMPANY_PLUGIN_DATA=data;
  const identity={root,session_id:id('founder'),epoch:1};
  try{
    engine.bind(root,identity.session_id,'codex');engine.open({...identity,idea:'Fictional canonical async index'},'codex');withStore(root,db=>db.migrate());
    const db=f=>withStore(root,f),write=(f,{indexed=true}={})=>{let result;db(d=>d.transaction('fixture.async-index',s=>{result=f(s);return s;},indexed?{afterWrite:updateTaskIndex}:{}));return result;};
    const create=operation_id=>write(s=>submitTask(s,{...identity,operation_id,source_instruction:'Prepare bounded fictional evidence.',role:'engineer',task:'Prepare fictional output '+operation_id,acceptance:'Fictional facts remain attributable',expected_deliverable:'One bounded fictional artifact'},'codex'));
    await fn({home,root,identity,db,write,create});
  }finally{disposeOriginalProcessFixtures(root);if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(home,{recursive:true,force:true});}
}
// Session naming is a separate cosmetic CLI operation outside this fixture.
const withoutSessionNaming=args=>[...args.slice(0,6),{...args[6],sessionTitle:undefined,sessionNameDirectory:undefined}];
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

test('targeted controls include normalized pending upgrade status; semantic reads retain unknown extensions',t=>fixture(async({root,identity,db,write})=>{
  initialize(db);write(s=>{s.plugin_version='0.7.7';s.team_sha256=teamHash(s);s.unknown_new_extension={condition:'Unknown obligations remain compulsory'};});
  // The pending upgrade comes from its real admission and carrier observers.
  // Only the standard Node child is controlled; no pending row is fabricated.
  const child=new EventEmitter();child.pid=process.pid;child.unref=()=>child;child.kill=()=>true;
  let carrierCreated=false;
  const spawn=t.mock.method(childProcess,'spawn',(command,args)=>{
    assert.equal(command,process.execPath);assert.ok(args[1].endsWith('/runtime/upgrade.mjs'));carrierCreated=true;return child;
  });syncBuiltinESMExports();
  let prepared,observed=0;const modelCwds=new Set(),answer=contractModel({proposalSize:100});
  try{
   try{
    const candidate=upgrade({...identity,action:'inspect',context_mode:'full'},'codex');
    prepared=upgrade({...identity,action:'prepare',expected_epoch:1,candidate_hash:candidate.candidate_hash,workflow:'incremental-v1',context_mode:'full',source_instruction:'SOURCE temporary pending-upgrade index control; no actual company authority.'},'codex',{check:()=>({available:true,authenticated:true})});
    child.emit('spawn');
     }finally{spawn.mock.restore();syncBuiltinESMExports();}
    await rehearse(root,prepared.upgrade.id,async(...args)=>{
      db(d=>{const targeted=readTaskState(d).state;assert.equal(targeted.upgrade.status,'checking');const semantic=readTaskState(d,{semantic:true}).state;assert.equal(semantic.unknown_new_extension.condition,'Unknown obligations remain compulsory');});observed++;
      modelCwds.add(args[3]);const result=await answer(...args),model=startOriginalModel(withoutSessionNaming(args),{nativeId:result.native_id});model.respond(result.text);return model.promise;
    },db(d=>d.read().upgrade.worker.token));
    assert.ok(observed>0,'the targeted and semantic reads must execute during the genuine pending upgrade');
    const current=db(d=>d.read().upgrade);assert.equal(current.status,'ready',current.error);
  }finally{if(carrierCreated)child.emit('close',0,null);for(const cwd of modelCwds)disposeOriginalProcessFixtures(cwd);}
}));

async function returnedOutput(root,taskId,{verdict='Pass'}={}){
  const jobId=id('job'),instance=id('fictional-worker');let reviewing=false;
  withStore(root,db=>db.transaction('task.job_queued',state=>{
    const task=state.records[taskId],ready=taskReady(state,task);assert.equal(ready.ready,true,ready.reason);
    const t=task.runtime_task,target=ready.review_of&&state.records[ready.review_of];reviewing=Boolean(target);
    // This enables only fixture metadata; no supervisor or OS process is started.
    const control=setRuntimeControl(state,{...t.owner,action:'start',source_instruction:'Prepare controlled fictional task outputs for the Source index fixture.'},t.owner.host).runtime_control;
    const sessionKey=t.spec.role+':async:'+jobId,selection=t.spec.model_selection??{mode:'default'};
    const job={id:jobId,instance_id:instance,session_key:sessionKey,native_id:null,host:t.owner.host,epoch:t.owner.epoch,role:t.spec.role,task:t.spec.task,status:'queued',
      requester:{role:'runtime',instance_id:control.instance_id,task_id:taskId,owner_epoch:t.owner.epoch},runtime_task:taskDefinitionBinding(task),
      inputs:ready.input_ids.map(key=>({id:key,revision:state.records[key].revision??null})),review_of:target?{id:target.id,revision:target.revision}:null,coordination:ready.coordination,
      context_format:taskContextFormat(t.spec),context_scope:t.spec.context_scope,expected_deliverable:t.spec.expected_deliverable,
      timeout_policy_version:TIMEOUT_POLICY_VERSION,...normalizeTimeout({timeout_ms:t.spec.timeout_ms,timeout_reason:t.spec.timeout_reason}),model_selection:selection,
      task_summary:t.spec.expected_deliverable,next_handoff:'Runtime validates the exact result and wakes eligible dependent tasks',created_at:stamp()};
    recordOriginalWorkerAssignmentFrom(db,state,job);
    state.sessions[sessionKey]={instance_id:instance,role:job.role,native_id:null,host:job.host,model_selection:selection};
    const context=assignmentContext(state,job);job.inputs=context.inputs;job.context_sha256=context.hash;
    bindTaskAttempt(state,task,job);state.jobs[job.id]=job;return state;
  },{afterWrite:updateTaskIndex}));
  const carrier=launchOriginalWorker(root,jobId),modelCwds=new Set();
  try{await work(root,jobId,(...args)=>{
    modelCwds.add(args[3]);const model=startOriginalModel(withoutSessionNaming(args),{nativeId:id('fictional-native')});
    model.respond(JSON.stringify({content:'Complete retained fictional output '+verdict,messages:[],notices:[],message_dispositions:[],
      ...(reviewing?{review:{verdict,reason:'Fictional exact review preserves its unresolved condition.',blockers:verdict==='Pass'?[]:['A fictional condition remains unresolved.']}}:{})}));
    return model.promise;
  });}finally{carrier.emit('close',0,null);for(const cwd of modelCwds)disposeOriginalProcessFixtures(cwd);disposeOriginalProcessFixtures(root);}
  let result;
  withStore(root,db=>db.transaction('fixture.async-index',state=>{
    const job=state.jobs[jobId];assert.equal(job.status,'completed',job.error);reconcileTask(state,state.records[taskId]);result={job_id:job.id,artifact_id:job.artifact_id};return state;
  },{afterWrite:updateTaskIndex}));
  return result;
}

test('explicit terminal output inputs load exact producer provenance without a declared dependency',()=>fixture(async({root,db,create,write,identity})=>{
  initialize(db);const a=create('terminal-producer'),result=await returnedOutput(root,a.id);
  const b=write(s=>submitTask(s,{...identity,operation_id:'explicit-output-consumer',source_instruction:'Inspect only this exact fictional returned output.',role:'engineer',task:'Inspect the exact producer body with no readiness edge.',input_ids:[result.artifact_id],acceptance:'Preserve source attribution and conditions.',expected_deliverable:'One fictional assessment'},'codex'));
  const unrelated=create('unrelated-planned-task');
  db(d=>{const {state}=readTaskState(d,{task_ids:[b.id],active:true,limit:1});assert.equal(state.records[a.id].runtime_task.state,'returned');assert(state.jobs[result.job_id]);assert(state.records[result.artifact_id]);assert(!state.records[unrelated.id]);assert.equal(state.records[b.id].runtime_task.spec.depends_on.length,0);assert.equal(taskReady(state,state.records[b.id]).ready,true);});
  write(s=>cancelTask(s,{...identity,operation_id:'cancel-explicit-producer',task_id:a.id,expected_definition_revision:1,source_instruction:'Cancel further use of this exact producer while preserving its retained body.'},'codex'));
  db(d=>{const {state}=readTaskState(d,{task_ids:[b.id],active:true,limit:1});assert(state.records[result.artifact_id]);assert.match(taskReady(state,state.records[b.id]).reason,/cancelled/);});
}));

test('explicit negative review inputs retain body and complete producer attribution in targeted state',()=>fixture(async({root,db,create,write,identity})=>{
  initialize(db);const a=create('negative-subject');await returnedOutput(root,a.id);
  const qa=write(s=>submitTask(s,{...identity,operation_id:'negative-reviewer',source_instruction:'Review only this exact fictional candidate.',role:'qa',task:'Preserve a fictional unresolved condition in an independent review.',review_task_id:a.id,acceptance:'Return an honest review without acceptance authority.',expected_deliverable:'One fictional negative review'},'codex'));
  const result=await returnedOutput(root,qa.id,{verdict:'Blocked'});
  const b=write(s=>submitTask(s,{...identity,operation_id:'negative-evidence-consumer',source_instruction:'Read this exact negative evidence without treating it as readiness or permission.',role:'engineer',task:'Inspect the complete unresolved review.',input_ids:[result.artifact_id],acceptance:'Keep the condition unresolved.',expected_deliverable:'One fictional assessment'},'codex'));
  db(d=>{const {state}=readTaskState(d,{task_ids:[b.id],active:true,limit:1});assert.equal(state.records[result.artifact_id].review.verdict,'Blocked');assert.equal(state.records[qa.id].runtime_task.state,'needs_attention');assert(state.records[a.id]);assert(state.jobs[result.job_id]);assert.equal(isTaskOwnOutput(state,state.jobs[result.job_id],state.records[result.artifact_id]),true);assert.equal(taskReady(state,state.records[b.id]).ready,true);});
}));
