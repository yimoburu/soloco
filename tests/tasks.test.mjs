import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,stamp} from '../plugins/soloco/runtime/store.mjs';
import {resourceClaims} from '../plugins/soloco/runtime/coordination.mjs';
import {taskAssignmentContext,taskDefinitionBinding,taskCheckpoint} from '../plugins/soloco/runtime/task-context.mjs';
import {setRuntimeControl} from '../plugins/soloco/runtime/task-runtime-authority.mjs';
import {submitTask,amendTask,cancelTask,taskRecord,taskView,taskReady,bindTaskAttempt,reconcileTask,isTaskBookkeeping,isTaskOutput,isTaskOwnOutput,validateTaskRecord,sendTaskMessage,appendPeerMessage,messagesForTask,disposeTaskMessage,disposePeerMessage,isOwnMessageDisposition,taskMessageInput,validateTaskMessage,isTaskMessage,isTaskScopedMessage} from '../plugins/soloco/runtime/tasks.mjs';

function fixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-tasks-')),data=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-data-')),old=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=data;
  const identity={root,session_id:id('founder'),epoch:1};
  try{
    engine.bind(root,identity.session_id,'codex');engine.open({...identity,idea:'Fictional async task state machine'},'codex');
    const read=()=>withStore(root,db=>db.read());
    const write=f=>{let result;withStore(root,db=>db.transaction('fixture.task',s=>{result=f(s);return s;}));return result;};
    fn({root,identity,read,write});
  }finally{if(old===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=old;fs.rmSync(root,{recursive:true,force:true});fs.rmSync(data,{recursive:true,force:true});}
}
function args(identity,operation_id,extra={}){return {...identity,operation_id,source_instruction:'Prepare this bounded fictional task with no external effects.',role:'engineer',task:'Prepare a fictional evidence artifact',expected_deliverable:'One fictional evidence artifact',acceptance:'Evidence is complete and independently reviewable',...extra};}
function queue(state,record){
  const ready=taskReady(state,record);assert.equal(ready.ready,true,ready.reason);
  const t=record.runtime_task;
  const job={id:id('job'),instance_id:id(t.spec.role),native_id:null,role:t.spec.role,host:t.owner.host,epoch:t.owner.epoch,status:'queued',context_format:7,task:t.spec.task,inputs:ready.input_ids.map(key=>({id:key,revision:state.records[key].revision??null})),review_of:ready.review_of?{id:ready.review_of,revision:state.records[ready.review_of].revision}:null,coordination:ready.coordination,created_at:stamp()};
  state.jobs[job.id]=job;bindTaskAttempt(state,record,job);return job;
}
function finish(state,record,{verdict='Pass',native=id('native')}={}){
  const job=state.jobs[record.runtime_task.attempts[0].job_id],target=job.review_of&&state.records[job.review_of.id],key=id('artifact');
  job.status='completed';job.native_id=native;job.artifact_id=key;job.finished_at=stamp();job.coordination_release={termination_confirmed:true,reason:'model_process_closed'};
  state.records[key]={id:key,kind:target?'review':'artifact',revision:1,status:'Submitted',author_role:job.role,author_instance:job.instance_id,job_id:job.id,content:'Fictional exact output',...(target?{review_of:{id:target.id,revision:target.revision},review:{verdict,blockers:verdict==='Pass'?[]:['Missing evidence']}}:{})};
  reconcileTask(state,record);return job;
}

test('Store-backed submit is attributable, bounded, replay-safe and preserves fields through normalized migration',()=>fixture(({identity,root,write,read})=>{
  const original=write(s=>submitTask(s,args(identity,'submit-one'),'codex'));
  const before=read();assert.equal(original.status,'Async:planned');assert.equal(original.runtime_task.spec.max_attempts,1);assert.equal(isTaskBookkeeping(before,before.records[original.id]),true);
  const repeated=write(s=>submitTask(s,args(identity,'submit-one'),'codex'));
  assert.equal(repeated.id,original.id);assert.equal(Object.values(read().records).filter(r=>r.runtime_task).length,1);
  assert.throws(()=>write(s=>submitTask(s,args(identity,'submit-one',{task:'Different task'}),'codex')),/different command/);
  assert.throws(()=>write(s=>submitTask(s,args(identity,'submit-two',{max_attempts:2}),'codex')),/one attempt/);
  withStore(root,db=>db.migrate());const restored=read();assert.deepEqual(restored.records[original.id],read().records[original.id]);assert.equal(taskView(restored.records[original.id]).definition_revision,1);
}));

test('task creation rejects non-owner, stale epoch, pause, malformed dependencies and missing authority',()=>fixture(({identity,write})=>{
  for(const change of [{session_id:'not-owner'},{epoch:2},{source_instruction:''},{depends_on:[{task_id:'absent',gate:'output'}]},{resources:['shared','shared']},{role:'runner'}])assert.throws(()=>write(s=>submitTask(s,args(identity,id('operation'),change),'codex')));
  write(s=>{s.paused=true;});assert.throws(()=>write(s=>submitTask(s,args(identity,'paused'),'codex')),/paused/);
}));

test('definition amendments have guarded revisions and preserve a small previous-definition reference',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'first'),'codex'));
  const changed=write(s=>amendTask(s,args(identity,'amend',{task_id:a.id,expected_definition_revision:1,task:'Prepare revised fictional evidence'}),'codex'));
  assert.equal(changed.runtime_task.definition_revision,2);assert.equal(changed.runtime_task.previous_definition.sha256,a.runtime_task.definition_sha256);assert.equal(changed.status,'Async:planned');
  assert.throws(()=>write(s=>amendTask(s,args(identity,'stale',{task_id:a.id,expected_definition_revision:1}),'codex')),/definition changed/);
  const replay=write(s=>amendTask(s,args(identity,'amend',{task_id:a.id,expected_definition_revision:1,task:'Prepare revised fictional evidence'}),'codex'));
  assert.equal(replay.runtime_task.definition_revision,2);assert.equal(read().records[a.id].revision,2);
}));

test('A to independent QA to B advances only on a canonical exact Pass, never output completion alone',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a'),'codex'));
  const qa=write(s=>submitTask(s,args(identity,'qa',{role:'qa',review_task_id:a.id,task:'Review the exact fictional evidence'}),'codex'));
  const b=write(s=>submitTask(s,args(identity,'b',{depends_on:[{task_id:qa.id,gate:'accepted'}]}),'codex'));
  assert.equal(taskReady(read(),read().records[qa.id]).ready,false);assert.equal(taskReady(read(),read().records[b.id]).ready,false);
  write(s=>{queue(s,s.records[a.id]);finish(s,s.records[a.id]);});
  let state=read();assert.equal(state.records[a.id].runtime_task.state,'returned');assert.equal(taskReady(state,state.records[qa.id]).ready,true);assert.equal(taskReady(state,state.records[b.id]).ready,false);
  write(s=>{queue(s,s.records[qa.id]);finish(s,s.records[qa.id]);});
  state=read();assert.equal(state.records[qa.id].runtime_task.state,'accepted');const ready=taskReady(state,state.records[b.id]);assert.equal(ready.ready,true);assert.equal(ready.required_context_jobs.length,1);
  const qj=state.jobs[state.records[qa.id].runtime_task.attempts[0].job_id],aj=state.jobs[state.records[a.id].runtime_task.attempts[0].job_id];qj.native_id=aj.native_id;
  assert.equal(taskReady(state,state.records[b.id]).ready,false);
}));

test('Fail/Blocked reviews and changed exact subjects hold dependent work',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a'),'codex'));
  write(s=>{queue(s,s.records[a.id]);finish(s,s.records[a.id]);});
  const qa=write(s=>submitTask(s,args(identity,'qa',{role:'qa',review_task_id:a.id,task:'Review failed fictional evidence'}),'codex'));
  const b=write(s=>submitTask(s,args(identity,'b',{depends_on:[{task_id:qa.id,gate:'accepted'}]}),'codex'));
  write(s=>{queue(s,s.records[qa.id]);finish(s,s.records[qa.id],{verdict:'Blocked'});});
  const state=read();assert.equal(state.records[qa.id].runtime_task.state,'needs_attention');assert.equal(taskReady(state,state.records[b.id]).ready,false);
  const qj=state.jobs[state.records[qa.id].runtime_task.attempts[0].job_id];state.records[qj.artifact_id].review={verdict:'Pass',blockers:[]};state.records[qj.review_of.id].revision++;
  assert.equal(taskReady(state,state.records[b.id]).ready,false);
}));

test('attempt binding is atomic, uniquely attributable and one-shot',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a',{resources:['fixture/output']}),'codex'));
  write(s=>{queue(s,s.records[a.id]);});let state=read();assert.equal(state.records[a.id].runtime_task.state,'queued');assert.equal(state.records[a.id].status,'Async:queued');
  assert.equal(resourceClaims(state).length,1);assert.throws(()=>write(s=>queue(s,s.records[a.id])),/fresh planned/);
  write(s=>{const r=s.records[a.id],j=s.jobs[r.runtime_task.attempts[0].job_id];j.status='running';reconcileTask(s,r);});
  state=read();assert.equal(state.records[a.id].runtime_task.state,'running');
  write(s=>{const r=s.records[a.id],j=s.jobs[r.runtime_task.attempts[0].job_id];j.status='failed';reconcileTask(s,r);});
  state=read();assert.equal(state.records[a.id].runtime_task.state,'needs_attention');assert.equal(resourceClaims(state).length,1);assert.equal(taskReady(state,state.records[a.id]).ready,false);
}));

test('cancellation requests stop without claiming closure; resource claims survive until confirmed',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a',{resources:['fixture/output']}),'codex'));
  write(s=>{queue(s,s.records[a.id]);});
  const cancelled=write(s=>cancelTask(s,args(identity,'cancel',{task_id:a.id,expected_definition_revision:1}),'codex'));
  assert.equal(cancelled.runtime_task.state,'cancelling');let state=read();assert.equal(resourceClaims(state).length,1);
  write(s=>{const r=s.records[a.id],j=s.jobs[r.runtime_task.attempts[0].job_id];j.coordination_release={termination_confirmed:true,reason:'model_process_closed'};reconcileTask(s,r);});
  state=read();assert.equal(state.records[a.id].runtime_task.state,'cancelled');assert.equal(resourceClaims(state).length,0);
}));

test('amending in-flight work fences the definition and never authorizes automatic retry',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a'),'codex'));write(s=>{queue(s,s.records[a.id]);});
  write(s=>amendTask(s,args(identity,'amend',{task_id:a.id,expected_definition_revision:1,task:'Different bounded deliverable'}),'codex'));
  const state=read(),r=state.records[a.id],job=state.jobs[r.runtime_task.attempts[0].job_id];assert.equal(job.status,'cancelled');assert.equal(r.runtime_task.definition_revision,2);assert.equal(r.runtime_task.attempts[0].definition_revision,1);assert.equal(taskReady(state,r).ready,false);
}));

test('cycles and forged bookkeeping remain visible or rejected',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a'),'codex'));const b=write(s=>submitTask(s,args(identity,'b',{depends_on:[{task_id:a.id,gate:'output'}]}),'codex'));
  assert.throws(()=>write(s=>amendTask(s,args(identity,'cycle',{task_id:a.id,expected_definition_revision:1,depends_on:[{task_id:b.id,gate:'output'}]}),'codex')),/Cyclic/);
  const state=read(),forged=structuredClone(state.records[a.id]);forged.content+=' Hidden new instruction';state.records[a.id]=forged;assert.equal(isTaskBookkeeping(state,forged),false);assert.throws(()=>validateTaskRecord(forged,state));
}));

test('durable messages preserve body, attribution and cursors; read is not processing',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a'),'codex'));
  const sent=write(s=>sendTaskMessage(s,{...identity,operation_id:'message-a',to_task_id:a.id,content:'The fictional receiver needs this evidence.'},'codex'));
  assert.equal(write(s=>sendTaskMessage(s,{...identity,operation_id:'message-a',to_task_id:a.id,content:'The fictional receiver needs this evidence.'},'codex')).id,sent.id);
  write(s=>sendTaskMessage(s,{...identity,operation_id:'message-b',to_task_id:a.id,content:'Second required fictional fact.'},'codex'));
  let state=read();assert.equal(isTaskBookkeeping(state,state.records[sent.id]),false);assert.equal(isTaskMessage(state,state.records[sent.id]),true);
  const page=messagesForTask(state,a.id,{limit:1});assert.equal(page.total,2);assert.equal(page.complete,false);assert.equal(messagesForTask(state,a.id,{after:page.next_cursor,limit:1}).complete,true);assert.equal(state.records[sent.id].runtime_message.state,'pending');
  write(s=>disposeTaskMessage(s,{...identity,operation_id:'dispose-a',message_id:sent.id,disposition:'Included this evidence in the receiver assignment.'},'codex'));
  state=read();assert.equal(state.records[sent.id].runtime_message.state,'processed');assert.equal(messagesForTask(state,a.id).total,2);assert.equal(state.records[sent.id].content,sent.content);
  assert.equal(write(s=>disposeTaskMessage(s,{...identity,operation_id:'dispose-a',message_id:sent.id,disposition:'Included this evidence in the receiver assignment.'},'codex')).id,sent.id);
}));

test('peer messages bind exact source attempt and reject forged or late writers',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a'),'codex')),b=write(s=>submitTask(s,args(identity,'b'),'codex'));
  write(s=>amendTask(s,args(identity,'peer-route',{task_id:a.id,expected_definition_revision:1,peer_task_ids:[b.id]}),'codex'));
  write(s=>{const j=queue(s,s.records[a.id]);j.status='running';reconcileTask(s,s.records[a.id]);appendPeerMessage(s,j,{operation_id:'peer-one',to_task_id:b.id,content:'Bounded direct peer handoff.'});});
  const state=read(),message=Object.values(state.records).find(r=>r.runtime_message),job=state.jobs[state.records[a.id].runtime_task.attempts[0].job_id];assert.equal(validateTaskMessage(message,state),message);
  const forged=structuredClone(state);forged.records[message.id].content='Changed message';assert.equal(isTaskMessage(forged,forged.records[message.id]),false);
  const wrong=structuredClone(state);wrong.records[message.id].author_instance='another-native';assert.equal(isTaskMessage(wrong,wrong.records[message.id]),false);
  state.paused=true;assert.throws(()=>appendPeerMessage(state,job,{operation_id:'late',to_task_id:b.id,content:'Late peer message.'}),/eligible/);
}));

test('only exact prospective scoped worker proposals can be omitted from unrelated current knowledge',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'output'),'codex'));
  write(s=>{queue(s,s.records[a.id]);const job=finish(s,s.records[a.id]);job.context_format=7;job.context_scope=s.records[a.id].runtime_task.spec.context_scope;job.context_sha256='a'.repeat(64);const r=s.records[job.artifact_id];Object.assign(r,{inputs:job.inputs,review_of:null,review:null,created_at:stamp(),runtime_output:{version:1,task_id:a.id,definition_revision:1,definition_sha256:s.records[a.id].runtime_task.definition_sha256}});});
  const state=read(),record=state.records[state.jobs[state.records[a.id].runtime_task.attempts[0].job_id].artifact_id];
  assert.equal(isTaskOutput(state,record),true);
  for(const mutate of [x=>delete x.records[record.id].runtime_output,x=>x.records[record.id].runtime_output.definition_revision=2,x=>x.records[record.id].status='Quarantined',x=>x.records[record.id].author_instance='forged',x=>x.records[record.id].hidden_policy='new global instruction',x=>x.jobs[record.job_id].native_id=identity.session_id,x=>x.jobs[record.job_id].coordination_release.termination_confirmed=false,x=>x.jobs[record.job_id].runtime_task.definition_revision=2]){const copy=structuredClone(state);mutate(copy);assert.equal(isTaskOutput(copy,copy.records[record.id]),false);}
}));

test('public pause and resume control evidence binds as nullable revisions without weakening output references',()=>fixture(({identity,write,read})=>{
  for(const action of ['pause','resume'])engine.control({...identity,action,expected_epoch:identity.epoch,source_instruction:action+' this fictional fixture without new authority.'},'codex');
  const controls=Object.values(read().records).filter(r=>r.kind==='decision'&&['pause','resume'].includes(r.action));
  assert.equal(controls.length,2);assert(controls.every(r=>!Object.hasOwn(r,'revision')));
  const a=write(s=>submitTask(s,args(identity,'control-evidence',{input_ids:controls.map(r=>r.id)}),'codex'));
  write(s=>{queue(s,s.records[a.id]);const job=finish(s,s.records[a.id]);job.context_format=7;job.context_scope=s.records[a.id].runtime_task.spec.context_scope;job.context_sha256='a'.repeat(64);Object.assign(s.records[job.artifact_id],{inputs:job.inputs,review_of:null,review:null,created_at:stamp(),runtime_output:{version:1,task_id:a.id,definition_revision:1,definition_sha256:s.records[a.id].runtime_task.definition_sha256}});});
  const state=read(),job=state.jobs[state.records[a.id].runtime_task.attempts[0].job_id],record=state.records[job.artifact_id];
  assert(job.inputs.every(ref=>ref.revision===null));assert.equal(isTaskOutput(state,record),true);
  for(const revision of [undefined,0,'1',{hidden:'unrecognized qualifier'}]){
    const copy=structuredClone(state);copy.jobs[job.id].inputs[0].revision=revision;copy.records[record.id].inputs[0].revision=revision;
    assert.equal(isTaskOutput(copy,copy.records[record.id]),false);
  }
  const missing=structuredClone(state);delete missing.records[controls[0].id];assert.equal(isTaskOutput(missing,missing.records[record.id]),false);
}));

test('an exact negative output is excluded only from its own original inputs, never unrelated task context',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'a-negative'),'codex'));write(s=>{queue(s,s.records[a.id]);finish(s,s.records[a.id]);});
  const qa=write(s=>submitTask(s,args(identity,'qa-negative',{role:'qa',review_task_id:a.id,task:'Review fictional source and preserve blockers'}),'codex'));
  write(s=>{queue(s,s.records[qa.id]);const job=finish(s,s.records[qa.id],{verdict:'Blocked'}),r=s.records[job.artifact_id];job.context_format=7;job.context_scope=s.records[qa.id].runtime_task.spec.context_scope;job.context_sha256='b'.repeat(64);Object.assign(r,{inputs:job.inputs,created_at:stamp(),runtime_output:{version:1,task_id:qa.id,definition_revision:1,definition_sha256:s.records[qa.id].runtime_task.definition_sha256}});r.review.reason='A material blocker remains.';});
  const state=read(),job=state.jobs[state.records[qa.id].runtime_task.attempts[0].job_id],record=state.records[job.artifact_id];
  assert.equal(isTaskOutput(state,record),false);assert.equal(isTaskOwnOutput(state,job,record),true);assert.equal(isTaskOutput(state,record,{own_job_id:'other-job'}),false);
  record.unknown_qualifier='Do not omit this unrecognized condition';assert.equal(isTaskOwnOutput(state,job,record),false);
}));

test('worker disposition binds the delivered receiver attempt and preserves its immutable original message input',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'receiver'),'codex'));
  const message=write(s=>sendTaskMessage(s,{...identity,operation_id:'receiver-message',to_task_id:a.id,content:'This exact required fact was delivered.'},'codex'));
  write(s=>{const job=queue(s,s.records[a.id]);job.status='running';job.inputs.push({id:message.id,revision:1});});
  const before=read(),job=before.jobs[before.records[a.id].runtime_task.attempts[0].job_id],original=structuredClone(before.records[message.id]);
  write(s=>disposePeerMessage(s,s.jobs[job.id],{message_id:message.id,disposition:'Used the required fact in this returned artifact.',operation_id:'receiver-disposition'}));
  const after=read(),current=after.jobs[job.id],processed=after.records[message.id];
  assert.equal(processed.runtime_message.disposition.by,'worker');assert.equal(isOwnMessageDisposition(after,current,processed),true);assert.deepEqual(taskMessageInput(after,current,processed),original);assert.equal(taskMessageInput(after,{...current,id:'different-job'},processed),processed);
  assert.equal(write(s=>disposePeerMessage(s,s.jobs[job.id],{message_id:message.id,disposition:'Used the required fact in this returned artifact.',operation_id:'receiver-disposition'})).revision,2);
  assert.throws(()=>write(s=>disposePeerMessage(s,s.jobs[job.id],{message_id:message.id,disposition:'Different claim',operation_id:'receiver-disposition'})),/different durable/);
  const forged=structuredClone(after);forged.records[message.id].content='Altered fact';assert.equal(isOwnMessageDisposition(forged,forged.jobs[job.id],forged.records[message.id]),false);
}));

test('worker cannot acknowledge a task message that was not part of its actual delivered inputs',()=>fixture(({identity,write,read})=>{
  const a=write(s=>submitTask(s,args(identity,'receiver-unread'),'codex'));
  write(s=>{const j=queue(s,s.records[a.id]);j.status='running';});
  const message=write(s=>sendTaskMessage(s,{...identity,operation_id:'late-message',to_task_id:a.id,content:'New evidence arrived after dispatch.'},'codex'));
  const state=read(),job=state.jobs[state.records[a.id].runtime_task.attempts[0].job_id];
  assert.throws(()=>write(s=>disposePeerMessage(s,{...s.jobs[job.id],inputs:[{id:message.id,revision:1}]},{message_id:message.id,disposition:'Pretend it was read'})),/delivered/);
}));

test('known bookkeeping fields reject object-valued qualifiers and malformed timestamps',()=>fixture(({identity,write,read})=>{
  const task=write(s=>submitTask(s,args(identity,'metadata-shapes'),'codex'));
  const state=read(),command=Object.values(state.records).find(r=>r.runtime_command);
  for(const mutate of [r=>r.created_at={hidden:'Material qualifier'},r=>r.updated_at='not-a-date',r=>r.runtime_task.created_at=['hidden'],r=>r.runtime_task.updated_at='2026-99-99T00:00:00Z']){
    const copy=structuredClone(state);mutate(copy.records[task.id]);assert.equal(isTaskBookkeeping(copy,copy.records[task.id]),false);
  }
  const broken=structuredClone(state);broken.records[command.id].created_at={hidden:'Another qualifier'};assert.equal(isTaskBookkeeping(broken,broken.records[command.id]),false);
  write(s=>{queue(s,s.records[task.id]);});const queued=read();
  for(const mutate of [a=>a.created_at={hidden:'x'},a=>a.artifact_id={hidden:'x'},a=>a.finished_at='invalid',a=>a.definition_sha256=['hidden']]){const copy=structuredClone(queued);mutate(copy.records[task.id].runtime_task.attempts[0]);assert.equal(isTaskBookkeeping(copy,copy.records[task.id]),false);}
}));

function unrelatedPacket(state,record){const spec=record.runtime_task.spec;return JSON.parse(taskAssignmentContext(state,{id:'fictional-prospective-unrelated',role:spec.role,task:spec.task,epoch:state.owner.epoch,context_scope:spec.context_scope,inputs:[],review_of:null,runtime_task:taskDefinitionBinding(record)}).text);}

test('cancel preserves verbatim attributed source intent, replay and compulsory unrelated-task context',()=>fixture(({identity,write,read})=>{
  write(s=>setRuntimeControl(s,{...identity,action:'start',source_instruction:'Prepare only the bounded fictional task context in this test.'},'codex'));
  const a=write(s=>submitTask(s,args(identity,'cancel-intent-a'),'codex'));
  const b=write(s=>submitTask(s,args(identity,'cancel-intent-b',{context_scope:'unrelated-scope'}),'codex'));
  const source_instruction='  Cancel this task.\nAll company exports stay blocked until an independent exact review passes.  ';
  const request=args(identity,'cancel-intent-operation',{task_id:a.id,expected_definition_revision:1,source_instruction});
  write(s=>cancelTask(s,request,'codex'));let state=read();
  const command=Object.values(state.records).find(r=>r.runtime_command?.operation_id===request.operation_id);
  assert.equal(command.content,source_instruction);assert.equal(command.runtime_command.source_instruction,source_instruction);
  assert.equal(command.author_instance,identity.session_id);assert.deepEqual(command.runtime_command.owner,state.owner);assert.equal(isTaskBookkeeping(state,command),false);
  const revision=state.records[a.id].revision;write(s=>cancelTask(s,request,'codex'));assert.equal(read().records[a.id].revision,revision);
  assert.throws(()=>write(s=>cancelTask(s,{...request,source_instruction:source_instruction+' Different condition.'},'codex')),/different command/);
  const packet=unrelatedPacket(state,state.records[b.id]);assert(packet.records.some(entry=>entry.source.id===command.id&&entry.value.content===source_instruction));
  const forged=structuredClone(state);forged.records[command.id].runtime_command.source_instruction+=' Hidden new qualifier.';forged.records[command.id].content=forged.records[command.id].runtime_command.source_instruction;
  assert.throws(()=>cancelTask(forged,request,'codex'),/different command/);
}));

test('owner message and disposition source qualifiers survive, affect replay and remain globally compulsory',()=>fixture(({identity,write,read})=>{
  write(s=>setRuntimeControl(s,{...identity,action:'start',source_instruction:'Prepare only the bounded fictional task context in this test.'},'codex'));
  const a=write(s=>submitTask(s,args(identity,'owner-intent-a'),'codex'));
  const b=write(s=>submitTask(s,args(identity,'owner-intent-b',{context_scope:'another-scope'}),'codex'));
  const source_instruction='  Send the bounded fact.\nNo company contact is permitted until founder clarification.  ';
  const request={...identity,operation_id:'owner-intent-message',to_task_id:a.id,content:'Exact bounded fictional fact.',source_instruction};
  const message=write(s=>sendTaskMessage(s,request,'codex'));assert.equal(message.runtime_message.source_instruction,source_instruction);
  assert.equal(write(s=>sendTaskMessage(s,request,'codex')).id,message.id);
  assert.throws(()=>write(s=>sendTaskMessage(s,{...request,source_instruction:source_instruction+'Changed qualifier.'},'codex')),/different content/);
  let state=read();assert.equal(isTaskMessage(state,state.records[message.id]),true);assert.equal(isTaskScopedMessage(state,state.records[message.id]),false);
  assert(unrelatedPacket(state,state.records[b.id]).records.some(entry=>entry.source.id===message.id&&entry.value.runtime_message.source_instruction===source_instruction));
  const legacy=write(s=>sendTaskMessage(s,{...identity,operation_id:'legacy-source-less-message',to_task_id:a.id,content:'A legacy task-local fact.'},'codex'));
  state=read();assert.equal(isTaskScopedMessage(state,state.records[legacy.id]),true);
  const dispositionSource='  Record this handling.\nKeep exports blocked even after the inbox is marked processed.  ';
  const disposition={...identity,operation_id:'owner-intent-dispose',message_id:legacy.id,disposition:'Preserved this fact in the task assignment.',source_instruction:dispositionSource};
  const processed=write(s=>disposeTaskMessage(s,disposition,'codex'));assert.equal(processed.runtime_message.disposition.source_instruction,dispositionSource);
  assert.equal(write(s=>disposeTaskMessage(s,disposition,'codex')).revision,processed.revision);
  assert.throws(()=>write(s=>disposeTaskMessage(s,{...disposition,source_instruction:dispositionSource+'Changed condition.'},'codex')),/different command/);
  state=read();const command=Object.values(state.records).find(r=>r.runtime_command?.operation_id===disposition.operation_id);
  assert.equal(command.content,dispositionSource);assert.equal(command.runtime_command.message_id,legacy.id);assert.equal(isTaskBookkeeping(state,command),false);assert.equal(isTaskScopedMessage(state,state.records[legacy.id]),false);
  const packet=unrelatedPacket(state,state.records[b.id]);assert(packet.records.some(entry=>entry.source.id===command.id));assert(packet.records.some(entry=>entry.source.id===legacy.id&&entry.value.runtime_message.disposition.source_instruction===dispositionSource));
  const malformed=structuredClone(state);malformed.records[message.id].runtime_message.source_instruction={hidden:'Unrecognized authority'};assert.equal(isTaskMessage(malformed,malformed.records[message.id]),false);
}));

test('task outcome is a bound hypothesis with exact evidence, retained through checkpoint definition changes',()=>fixture(({identity,write,read})=>{
 write(s=>{s.records['feedback']={id:'feedback',kind:'artifact',revision:1,content:'Supplied fictional customer feedback'};});
 const outcome={objective:'Reduce invalid configuration failures',expected_effect:'Clearer validation helps users correct input',observation:'Compare supplied failure counts before and after',assessment_period:'Next supplied weekly observation',evidence_ids:['feedback']};
 const record=write(s=>submitTask(s,args(identity,'outcome',{input_ids:['feedback'],outcome}),'codex'));
 assert.deepEqual(taskView(record).outcome,outcome);
 assert.match(taskView(record).outcome_status,/hypothesis/);
 assert.throws(()=>write(s=>submitTask(s,args(identity,'missing-outcome-input',{outcome}),'codex')),/exact task inputs/);
 assert.throws(()=>write(s=>submitTask(s,args(identity,'invalid-outcome',{input_ids:['feedback'],outcome:{...outcome,achieved:true}}),'codex')),/Outcome requires/);
 const amended=write(s=>amendTask(s,args(identity,'outcome-amend',{task_id:record.id,expected_definition_revision:1,input_ids:['feedback'],outcome:{...outcome,expected_effect:'A revised hypothesis'}}),'codex'));
 assert.notEqual(amended.runtime_task.definition_sha256,record.runtime_task.definition_sha256);
 assert.equal(read().records[record.id].runtime_task.spec.outcome.expected_effect,'A revised hypothesis');
}));

test('readiness validates an attempted producer before classifying a pending dependency',()=>fixture(({identity,read,write})=>{
 const a=write(s=>submitTask(s,args(identity,'pending-exact-producer'),'codex'));
 const b=write(s=>submitTask(s,args(identity,'pending-exact-consumer',{depends_on:[{task_id:a.id,gate:'output'}]}),'codex'));
 const job=write(s=>queue(s,s.records[a.id])),state=read();
 assert.equal(taskReady(state,state.records[b.id]).recovery.code,'DEPENDENCY_PENDING');
 for(const mode of ['missing','identity','failed','interrupted']){
  const changed=structuredClone(state);
  if(mode==='missing')delete changed.jobs[job.id];
  else if(mode==='identity')changed.jobs[job.id].instance_id='changed';
  else changed.jobs[job.id].status=mode;
  const recovery=taskReady(changed,changed.records[b.id]).recovery;
  assert.equal(recovery.automatic,false,mode);assert.notEqual(recovery.code,'DEPENDENCY_PENDING',mode);
 }
}));

test('a held completed producer cannot become a positive prerequisite after source restoration',()=>fixture(({identity,write,read})=>{
 const a=write(s=>submitTask(s,args(identity,'held-producer'),'codex'));
 const b=write(s=>submitTask(s,args(identity,'held-consumer',{depends_on:[{task_id:a.id,gate:'output'}]}),'codex'));
 write(s=>queue(s,s.records[a.id]));write(s=>finish(s,s.records[a.id]));
 assert.equal(taskReady(read(),read().records[b.id]).ready,true);
 write(s=>{const r=s.records[a.id];r.runtime_task.state='needs_attention';r.runtime_task.attention_code='CONTEXT_CHANGED';r.status='Async:needs_attention';});
 const result=taskReady(read(),read().records[b.id]);assert.equal(result.ready,false);assert.equal(result.recovery.automatic,false);assert.equal(result.recovery.code,'CONTEXT_CHANGED');
}));

test('explicit amendment clears a reconciled unstarted hold from the cold checkpoint',()=>fixture(({identity,write,read})=>{
 const a=write(s=>submitTask(s,args(identity,'amend-held'),'codex'));
 write(s=>{const r=s.records[a.id];r.runtime_task.state='needs_attention';r.runtime_task.attention_code='CONTEXT_CHANGED';r.runtime_task.attention='Old input hold';r.status='Async:needs_attention';});
 write(s=>amendTask(s,{...args(identity,'reconcile-held'),task_id:a.id,expected_definition_revision:1},'codex'));
 const r=read().records[a.id];assert.equal(r.runtime_task.state,'planned');assert.equal(r.runtime_task.attention,undefined);assert.equal(r.runtime_task.attention_code,undefined);assert.equal(taskReady(read(),r).ready,true);assert.deepEqual(taskCheckpoint(read(),r).blockers,[]);assert.equal(taskCheckpoint(read(),r).recovery,null);
}));
