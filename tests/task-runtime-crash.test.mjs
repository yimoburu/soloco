// Process/SQLite crash acceptance using fictional adapters. This does not
// establish native session replacement, model quality or before/after outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store,withStore,id} from '../plugins/soloco/runtime/store.mjs';
import {taskAction,runtimeAction,tickRuntime} from '../plugins/soloco/runtime/task-runtime.mjs';
import {resourceClaims} from '../plugins/soloco/runtime/coordination.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {taskAssignmentContext} from '../plugins/soloco/runtime/task-context.mjs';
import {prepareOriginalWorkerLaunchFrom,spawnOriginalWorkerLaunch,cleanupOriginalWorkerLaunchFailure,originalWorkerFailedLaunchChild,originalWorkerFailedLaunchClosed} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';

const source_instruction='Prepare only supplied fictional facts; preserve uncertainty and no external effects.';
const child=()=>({on(){return this;},unref(){}});
const wake=()=>({started:false,reason:'fictional crash driver'});
function fixture(){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-async-crash-')),root=path.join(home,'company'),data=path.join(home,'plugin-data'),previous=process.env.COMPANY_PLUGIN_DATA;
  let retainHome=false;
  fs.mkdirSync(root);process.env.COMPANY_PLUGIN_DATA=data;
  const args={root,session_id:id('fictional-founder'),epoch:1};
  engine.bind(root,args.session_id,'codex');engine.open({...args,idea:'Fictional bounded runtime crash acceptance'},'codex');
  withStore(root,db=>db.migrate());
  runtimeAction({...args,action:'start',source_instruction},'codex',{launch:child});
  const spec={role:'research',task:'Preserve supplied fictional restrictions.',acceptance:'Return one attributable finding preserving the exact restriction.',expected_deliverable:'One fictional evidence artifact',context_scope:'crash-fixture',resources:['fictional/output']};
  const command=(action,operation_id,extra={})=>({...args,action,operation_id,source_instruction,...extra});
  const task=(value)=>taskAction(value,'codex',{wake});
  const submit=(operation_id='receiver',extra={})=>task(command('submit',operation_id,{spec:{...spec,...extra}}));
  const read=()=>withStore(root,db=>db.read());
  const events=type=>withStore(root,db=>db.db.prepare('SELECT COUNT(*) AS n FROM events WHERE type=?').get(type).n);
  const queue=task_id=>engine.queueRuntimeTask(root,task_id,{check:()=>({available:true,authenticated:true,version:'fictional-crash-adapter'}),launch:child});
  async function crashWorker(value,request){
    // The parent survives the kill point and observes the actual worker child.
    // A controlled carrier inside that child could not report its own SIGKILL.
    const issuer=new Store(root);let token,timer;
    try{
      issuer.transaction('job.worker_launch_requested',state=>{token=prepareOriginalWorkerLaunchFrom(issuer,state,{job_id:value.job_id,kind:'worker'});return state;});
      let worker;
      try{worker=spawnOriginalWorkerLaunch(token,process.execPath,['--no-warnings',fileURLToPath(new URL('./fixtures/task-runtime-crash-child.mjs',import.meta.url)),request],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,COMPANY_PLUGIN_DATA:data}});}
      catch(error){
        // A cleanup request is not a close witness. Retain this exact fixture
        // if a failed write let the original child escape without observed close.
        if(originalWorkerFailedLaunchChild(error)&&originalWorkerFailedLaunchClosed(error)!==true)retainHome=true;
        cleanupOriginalWorkerLaunchFailure(error);throw error;
      }
      let stdout='',stderr='',error,timedOut=false;
      worker.stdout.setEncoding('utf8');worker.stderr.setEncoding('utf8');
      worker.stdout.on('data',chunk=>stdout+=chunk);worker.stderr.on('data',chunk=>stderr+=chunk);
      const result=await new Promise(resolve=>{
        worker.on('error',value=>{error=value;});
        worker.once('close',(status,signal)=>resolve({status,signal}));
        timer=setTimeout(()=>{timedOut=true;worker.kill('SIGKILL');},15000);
      });
      clearTimeout(timer);
      assert.equal(timedOut,false,'the original 15s watchdog must not supply the expected crash');
      assert.equal(error,undefined,error?.message);assert.equal(result.signal,'SIGKILL',stderr);assert.equal(result.status,null);
      assert.deepEqual(JSON.parse(stdout),{cut:value.cut,phase:value.phase},'the child reached the intended real transaction cut');
      const observed=read().jobs[value.job_id].original_execution_assignment.launches.find(launch=>launch.kind==='worker');
      assert.equal(observed.birth.pid,worker.pid);assert.equal(observed.closure.pid,worker.pid);
      assert.equal(observed.closure.code,null);assert.equal(observed.closure.signal,'SIGKILL');assert.equal(observed.closure.never_started,false);
    }finally{clearTimeout(timer);issuer.close();}
  }
  function crash(value){
    const request=path.join(home,'cut.json');fs.writeFileSync(request,JSON.stringify({args,...value}));
    if(value.action==='work')return crashWorker(value,request);
    const result=spawnSync(process.execPath,['--no-warnings',fileURLToPath(new URL('./fixtures/task-runtime-crash-child.mjs',import.meta.url)),request],{encoding:'utf8',timeout:15000,env:{...process.env,COMPANY_PLUGIN_DATA:data}});
    assert.equal(result.error,undefined,result.error?.message);assert.equal(result.signal,'SIGKILL',result.stderr);assert.equal(result.status,null);
    assert.deepEqual(JSON.parse(result.stdout),{cut:value.cut,phase:value.phase},'the child reached the intended real transaction cut');
  }
  return {args,spec,command,task,submit,read,events,queue,crash,close:()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;if(retainHome)process.stderr.write('Retained Source crash fixture after escaped launch failure: '+home+'\n');else fs.rmSync(home,{recursive:true,force:true});}};
}
function expireQueue(f,job_id){
  withStore(f.args.root,db=>db.transaction('fictional.expire_queue',state=>{state.jobs[job_id].created_at=new Date(Date.now()-600000).toISOString();return state;}));
  tickRuntime(f.args.root,{dispatch:false});
}

for(const phase of ['before','uncommitted','committed'])test(`SIGKILL ${phase} task persistence loses no acknowledged command and replay creates one task`,()=>{
  const f=fixture();try{
    const args=f.command('submit','lost-command-reply',{spec:f.spec});f.crash({action:'task',args,cut:'task.submit',phase});
    const before=f.read(),tasks=Object.values(before.records).filter(r=>r.runtime_task);
    assert.equal(tasks.length,phase==='committed'?1:0,'uncommitted task and command roll back together');
    assert.equal(Object.values(before.records).filter(r=>r.runtime_command).length,tasks.length);
    assert.equal(f.events('task.submit'),tasks.length,'command, task, index and event share the commit');
    const recovered=f.task(args);assert.equal(f.task(args).id,recovered.id);
    const after=f.read();assert.equal(Object.values(after.records).filter(r=>r.runtime_task).length,1);assert.equal(Object.values(after.records).filter(r=>r.runtime_command).length,1);
    assert.equal(after.records[recovered.id].runtime_task.attempts.length,0);
    assert.throws(()=>f.task({...args,spec:{...f.spec,task:'Changed payload'}}),/different command/);
  }finally{f.close();}
});

for(const phase of ['before','uncommitted','committed'])test(`SIGKILL ${phase} dispatch fences uncertain attempts and retains exclusive claims`,()=>{
  const f=fixture();try{
    const task=f.submit();f.crash({action:'queue',task_id:task.id,cut:'task.job_queued',phase});
    let state=f.read();assert.equal(Object.keys(state.jobs).length,phase==='committed'?1:0);
    assert.equal(f.events('task.job_queued'),Object.keys(state.jobs).length);
    assert.equal(state.records[task.id].runtime_task.attempts.length,phase==='committed'?1:0);
    if(phase==='committed'){
      const job_id=state.records[task.id].runtime_task.attempts[0].job_id;expireQueue(f,job_id);state=f.read();
      assert.equal(state.jobs[job_id].status,'interrupted');assert.equal(state.records[task.id].runtime_task.state,'needs_attention');assert.notEqual(state.jobs[job_id].coordination_release?.termination_confirmed,true);
      assert(resourceClaims(state).some(claim=>claim.job_id===job_id));
      assert.throws(()=>f.queue(task.id),/fresh planned|attempt|attention/i);
      const conflict=f.submit('conflict');assert.throws(()=>f.queue(conflict.id),/reserved/);
    }else{
      f.queue(task.id);state=f.read();assert.equal(Object.keys(state.jobs).length,1);assert.equal(state.records[task.id].runtime_task.attempts.length,1);
    }
  }finally{f.close();}
});

for(const phase of ['before','uncommitted','committed'])test(`SIGKILL ${phase} result commit keeps artifact, message action and acknowledgment atomic`,async()=>{
  const f=fixture();try{
    const receiver=f.submit(),message=f.task(f.command('message','durable-restriction',{to_task_id:receiver.id,content:'Exact fictional restriction: no external effects.'})),queued=f.queue(receiver.id);
    await f.crash({action:'work',job_id:queued.job_id,message_id:message.id,cut:'job.completed',phase});
    let state=f.read(),job=state.jobs[queued.job_id];
    assert.equal(job.status,phase==='committed'?'completed':'running');
    assert.equal(state.records[message.id].runtime_message.state,phase==='committed'?'processed':'pending');
    assert.equal(state.records[message.id].revision,phase==='committed'?2:1);
    assert.equal(Object.values(state.records).filter(r=>r.runtime_output).length,phase==='committed'?1:0);
    assert.equal(f.events('job.completed'),phase==='committed'?1:0);
    if(phase==='committed'){
      assert.equal(state.records[message.id].runtime_message.disposition.attempt_id,job.id);assert.equal(job.coordination_release.termination_confirmed,true);
      tickRuntime(f.args.root,{dispatch:false});assert.equal(f.read().records[receiver.id].runtime_task.state,'returned');
    }else{
      assert.equal(job.artifact_id,undefined);assert.notEqual(job.coordination_release?.termination_confirmed,true);assert(resourceClaims(state).some(claim=>claim.job_id===job.id));
    }
    let calls=0;await work(f.args.root,job.id,async()=>{calls++;throw Error('A consumed attempt must never be blindly re-executed');});assert.equal(calls,0);
    state=f.read();assert.equal(Object.keys(state.jobs).length,1);assert.equal(state.records[receiver.id].runtime_task.attempts.length,1);assert.equal(state.records[message.id].revision,phase==='committed'?2:1);
  }finally{f.close();}
});

for(const phase of ['uncommitted','committed'])test(`SIGKILL ${phase} receiver disposition and command replay commit one durable action`,()=>{
  const f=fixture();try{
    const receiver=f.submit(),message=f.task(f.command('message','durable-message',{to_task_id:receiver.id,content:'Keep this exact fictional uncertainty.'}));
    const args=f.command('dispose','lost-disposition-reply',{message_id:message.id,disposition:'Recorded this exact uncertainty as an unresolved obligation.'});
    f.crash({action:'task',args,cut:'task.dispose',phase});
    const initial=f.read();assert.equal(initial.records[message.id].runtime_message.state,phase==='committed'?'processed':'pending');
    assert.equal(f.events('task.dispose'),phase==='committed'?1:0);
    const recovered=f.task(args),again=f.task(args);assert.equal(again.id,recovered.id);
    const state=f.read();assert.equal(state.records[message.id].revision,2);assert.equal(Object.values(state.records).filter(r=>r.runtime_command?.action==='dispose').length,1);
    assert.throws(()=>f.task({...args,disposition:'Different action'}),/different command/);
  }finally{f.close();}
});

test('lost message response replays its original envelope after receiver amendment without granting a new definition',()=>{
  const f=fixture();try{
    const receiver=f.submit(),args=f.command('message','lost-message-reply',{to_task_id:receiver.id,content:'Keep the original exact fictional qualifier.'});
    f.crash({action:'task',args,cut:'task.message',phase:'committed'});
    const before=f.read(),message=Object.values(before.records).find(r=>r.runtime_message);
    f.task(f.command('amend','changed-receiver',{task_id:receiver.id,expected_definition_revision:1,spec:{...f.spec,task:'A separately revised fictional purpose.'}}));
    assert.equal(f.task(args).id,message.id);const after=f.read();assert.deepEqual(after.records[message.id],message);
    assert.equal(after.records[message.id].runtime_message.definition_revision,1);assert.equal(after.records[receiver.id].runtime_task.definition_revision,2);
    assert.equal(Object.values(after.records).filter(r=>r.runtime_message).length,1);
    assert.throws(()=>f.task({...args,content:'Changed qualifier'}),/different content/);
    assert.throws(()=>f.task(f.command('dispose','stale-message-disposition',{message_id:message.id,disposition:'Use the old message for the new task.'})),/definition changed/);
    const queued=f.queue(receiver.id),state=f.read(),packet=JSON.parse(taskAssignmentContext(state,state.jobs[queued.job_id]).text);
    assert.equal(packet.task.source.definition_revision,2);
    assert(packet.records.some(entry=>entry.source.id===message.id&&entry.value.runtime_message.definition_revision===1),'new work receives the unchanged old message as evidence, never a retargeted message');
  }finally{f.close();}
});

for(const phase of ['before','uncommitted','committed'])test(`SIGKILL ${phase} next-event reconciliation resumes once from the committed result`,async()=>{
  const f=fixture();try{
    const receiver=f.submit(),message=f.task(f.command('message','event-restriction',{to_task_id:receiver.id,content:'Keep the exact fictional event restriction.'})),queued=f.queue(receiver.id);
    const dependent=f.submit('next-event-consumer',{role:'pm',depends_on:[{task_id:receiver.id,gate:'output'}],resources:['fictional/downstream']});
    await f.crash({action:'work',job_id:queued.job_id,message_id:message.id,cut:'job.completed',phase:'committed'});
    f.crash({action:'reconcile',cut:'runtime.reconciled',phase});
    let state=f.read();assert.equal(state.records[receiver.id].runtime_task.state,phase==='committed'?'returned':'queued');
    assert.equal(f.events('runtime.reconciled'),phase==='committed'?1:0);
    const dispatched=[];
    for(let n=0;n<3;n++)tickRuntime(f.args.root,{queue:(root,task_id)=>{dispatched.push(task_id);return f.queue(task_id);}});
    state=f.read();assert.deepEqual(dispatched,[dependent.id]);assert.equal(Object.keys(state.jobs).length,2);assert.equal(state.records[dependent.id].runtime_task.attempts.length,1);
    assert.equal(state.records[receiver.id].runtime_task.attempts.length,1);assert.equal(state.records[receiver.id].runtime_task.state,'returned');
    assert.equal(Object.values(state.records).filter(r=>r.runtime_output).length,1);assert.equal(state.records[message.id].revision,2);
  }finally{f.close();}
});
