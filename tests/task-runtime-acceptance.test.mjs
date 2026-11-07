// Explicit fictional model adapters exercise the real public API, Store,
// worker and supervisor. Actual MCP/native process lifecycle is separate evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id} from '../plugins/soloco/runtime/store.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {runtimeAction,claimSupervisor,tickRuntime} from '../plugins/soloco/runtime/task-runtime.mjs';
import {updateTaskIndex} from '../plugins/soloco/runtime/task-index.mjs';
import {taskReady} from '../plugins/soloco/runtime/tasks.mjs';
import {supervise} from '../plugins/soloco/runtime/supervisor.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {taskAssignmentContext,taskContextMatches} from '../plugins/soloco/runtime/task-context.mjs';
import {isTaskOutput,isTaskOwnOutput} from '../plugins/soloco/runtime/tasks.mjs';

const inertChild=()=>({on(){return this;},unref(){}});
const source_instruction='Prepare only the exact fictional supplied facts; no external execution or extra attempts.';
function fixture(){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-runtime-acceptance-')),root=path.join(home,'fictional-company'),previous=process.env.COMPANY_PLUGIN_DATA;
  fs.mkdirSync(root);process.env.COMPANY_PLUGIN_DATA=path.join(home,'fixture-plugin-data');
  const args={root,session_id:id('fictional-founder')};
  engine.bind(root,args.session_id,'codex');engine.open({...args,idea:'Fictional async API acceptance only'},'codex');
  withStore(root,db=>db.migrate());
  const control=runtimeAction({...args,epoch:1,action:'start',source_instruction},'codex',{launch:inertChild});
  // Public mutations may wake a supervisor. The real current test-process lease
  // prevents subprocess launches; model calls below are explicit fixture adapters.
  claimSupervisor(root,control.instance_id,process.pid);
  const api=(name,value={})=>call(name,{...args,...value},'codex');
  const spec=patch=>({role:'research',task:'Prepare one source-grounded fictional finding.',acceptance:'Preserve supplied restrictions and uncertainty.',expected_deliverable:'One attributable fictional finding',context_scope:'fixture',...patch});
  const submit=(operation_id,patch={})=>api('company_tasks',{action:'submit',epoch:1,operation_id,source_instruction,spec:spec(patch)});
  const queue=task_id=>engine.queueRuntimeTask(root,task_id,{check:()=>({available:true,authenticated:true,version:'fictional-contract-adapter'}),launch:inertChild});
  return {root,args,control,api,spec,submit,queue,read:()=>withStore(root,db=>db.read()),change:fn=>withStore(root,db=>db.transaction('fixture.acceptance-change',s=>{fn(s);return s;},{afterWrite:updateTaskIndex})),close:()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(home,{recursive:true,force:true});}};
}
const envelope=content=>({content,messages:[],notices:[]});
function immediate(native,artifact){return async(_host,prior,_prompt,_dir,timeout,_selection,options)=>{
  assert.equal(prior,null,'each fixture task starts a fresh native identity');
  options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
  return {native_id:native,text:JSON.stringify(artifact)};
};}
async function until(check,ms=5000){const deadline=Date.now()+ms;while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Fictional acceptance state did not arrive before its declared5s test timeout');}
const percentile=(values,fraction)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*fraction)-1];

test('public task and scoped portfolio pages have exact membership, source references and visible related resources',async()=>{
  const f=fixture();try{
    const tasks=[];
    for(let n=0;n<7;n++)tasks.push(await f.submit('page-'+n,{task:'Fictional objective '+n,context_scope:n%2?'auth':'shipping',resources:n===1||n===3?['shared/auth']:['resource/'+n]}));
    for(const action of ['inspect','context']){
      const found=[],cursors=new Set();let cursor;
      do{
        const page=await f.api('company_tasks',{action,limit:2,...(cursor?{cursor}:{})});
        const collection=action==='context'?page.tasks:page,items=action==='context'?collection.items:collection.tasks;
        assert.equal(collection.total,7);assert(items.length>0);assert(items.length<=2);
        if(action==='context'){assert.equal(page.summary_only,true);assert.equal(page.decision_ready,false);assert.equal(page.coverage.semantic_evidence_complete,false);}
        for(const item of items){const source=action==='context'?item.record_source:item.source;assert.match(source.sha256,/^[a-f0-9]{64}$/);found.push(action==='context'?item.source.id:item.id);}
        cursor=collection.next_cursor;if(!collection.complete){assert(cursor);assert(!cursors.has(cursor));cursors.add(cursor);}else assert.equal(cursor,null);
      }while(cursor);
      assert.deepEqual(found.slice().sort(),tasks.map(task=>task.id).sort());assert.equal(new Set(found).size,7);
    }
    const related=[];let cursor;
    do{
      const page=await f.api('company_tasks',{action:'context',context_scope:'auth',limit:1,...(cursor?{cursor}:{})});
      assert.equal(page.tasks.total,3);assert.equal(page.tasks.items.length,1,'scope filtering must not emit an empty initial page');
      related.push(...page.tasks.items);cursor=page.tasks.next_cursor;
      if(!page.tasks.complete)assert(cursor);
    }while(cursor);
    assert.deepEqual(related.map(item=>item.source.id).sort(),[tasks[1].id,tasks[3].id,tasks[5].id].sort());
    assert.equal(related.filter(item=>item.resources.includes('shared/auth')).length,2,'CoS sees the exact overlapping declared resource before adding work');
    const first=await f.api('company_tasks',{action:'context',limit:1});await f.submit('new-membership');
    await assert.rejects(f.api('company_tasks',{action:'context',limit:1,cursor:first.tasks.next_cursor}),/stale|invalid/i);
  }finally{f.close();}
});

test('public submit and bounded status complete while two model promises remain outstanding, with separate control timings',async()=>{
  const f=fixture(),releases=[],workers=[];let completed=0;
  try{
    for(const [n,role] of ['research','engineer'].entries()){
      const task=await f.submit('slow-'+n,{role,context_scope:'slow-'+n,resources:['slow/'+n]}),job=f.queue(task.id);
      workers.push(work(f.root,job.job_id,async(_h,_n,_p,_d,timeout,_s,options)=>{
        options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
        return new Promise(resolve=>releases.push(()=>{completed++;resolve({native_id:'fictional-slow-'+role,text:JSON.stringify(envelope('Fictional independently attributable result.'))});}));
      }));
    }
    assert.equal(releases.length,2);const status_ms=[],submitStart=performance.now();
    const newTask=await f.submit('new-during-slow',{role:'pm',context_scope:'new',resources:['new/output']});
    const submit_ms=performance.now()-submitStart;
    for(let n=0;n<5;n++){const start=performance.now(),view=await f.api('company_tasks',{action:'inspect',limit:2});status_ms.push(performance.now()-start);assert.equal(view.total,3);}
    assert.equal(completed,0,'control did not await either model');assert.equal(f.read().records[newTask.id].runtime_task.state,'planned');
    assert.equal(Object.values(f.read().jobs).filter(job=>job.status==='running').length,2);
    assert(Math.max(submit_ms,...status_ms)<10000,'only a generous10s blocking-regression threshold is enforced');
    console.log('FICTIONAL control latency '+JSON.stringify({unit:'milliseconds',samples:status_ms.length,status_median:percentile(status_ms,.5),status_p95:percentile(status_ms,.95),submit:submit_ms,outstanding_model_promises:2,model_response_time:'unmeasured; fictional promises deliberately held'}));
  }finally{for(const release of releases)release();await Promise.allSettled(workers);f.close();}
});

test('task amendment, pause, owner change and runtime revocation fence slow late results while retaining their evidence',async t=>{
  for(const fence of ['amend','pause','owner','stop'])await t.test(fence,async()=>{
    const f=fixture();let release,worker;
    try{
      const a=await f.submit('producer'),qa=await f.submit('qa',{role:'qa',review_task_id:a.id}),b=await f.submit('dependent',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]}),queued=f.queue(a.id);
      worker=work(f.root,queued.job_id,async(_h,_n,_p,_d,timeout,_s,options)=>{
        options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
        return new Promise(resolve=>release=()=>resolve({native_id:'fictional-late-'+fence,text:JSON.stringify(envelope('LATE FICTIONAL RESULT '+fence+' must remain evidence without acceptance.'))}));
      });
      assert(release);assert.equal(f.read().jobs[queued.job_id].status,'running');
      if(fence==='amend')await f.api('company_tasks',{action:'amend',epoch:1,operation_id:'amend-live',task_id:a.id,expected_definition_revision:1,source_instruction,spec:f.spec({task:'A changed fictional objective.'})});
      if(fence==='pause')await f.api('company_control',{action:'pause',expected_epoch:1,source_instruction:'Pause this fictional acceptance fixture now.'});
      if(fence==='owner')f.change(state=>{state.owner={host:'codex',session_id:'fictional-new-owner',epoch:2};}); // Inject an authority transition while the old attempt is still live.
      if(fence==='stop')await f.api('company_runtime',{action:'stop',epoch:1,source_instruction:'Revoke this fictional runtime scheduling and acceptance grant.'});
      release();await worker;
      const state=f.read(),job=state.jobs[queued.job_id],artifact=state.records[job.artifact_id];
      assert.notEqual(job.status,'completed');assert.notEqual(artifact?.status,'Submitted');
      assert.match(JSON.stringify(job.rejected_output??artifact??{}),new RegExp('LATE FICTIONAL RESULT '+fence));
      assert.equal(job.coordination_release?.termination_confirmed,true,'the fixture adapter returned, so this invocation has actual closure evidence');
      assert.equal(state.records[a.id].runtime_task.attempts.length,1);assert.equal(state.records[b.id].runtime_task.attempts.length,0);
      assert.equal(taskReady(state,state.records[b.id]).ready,false);assert.equal(Object.keys(state.jobs).length,1);
    }finally{release?.();await worker;f.close();}
  });
});

test('independent worker Fail and Blocked reviews keep accepted dependents planned',async t=>{
  for(const verdict of ['Fail','Blocked'])await t.test(verdict,async()=>{
    const f=fixture();try{
      const a=await f.submit('producer'),qa=await f.submit('qa',{role:'qa',review_task_id:a.id}),b=await f.submit('dependent',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
      const aj=f.queue(a.id);await work(f.root,aj.job_id,immediate('fictional-author-'+verdict,envelope('A fictional candidate with unresolved evidence.')));
      const qj=f.queue(qa.id);await work(f.root,qj.job_id,immediate('fictional-independent-'+verdict,{...envelope('Independent fictional negative finding.'),review:{verdict,reason:'Required evidence is absent.',blockers:['Missing exact evidence']}}));
      tickRuntime(f.root,{dispatch:false});const state=f.read();
      assert.equal(state.records[qa.id].runtime_task.state,'needs_attention');assert.equal(state.records[state.jobs[qj.job_id].artifact_id].review.verdict,verdict);
      assert.notEqual(state.jobs[aj.job_id].native_id,state.jobs[qj.job_id].native_id);assert.equal(taskReady(state,state.records[b.id]).ready,false);
      assert.throws(()=>f.queue(b.id));assert.equal(Object.keys(f.read().jobs).length,2);
    }finally{f.close();}
  });
});

test('a fresh supervisor resumes after result commit, preserving peer delivery and one receiver disposition without duplicate attempts',async()=>{
  const f=fixture(),controller=new AbortController(),workers=[],queued=[];let supervisor;
  try{
    const a=await f.submit('producer'),qa=await f.submit('qa',{role:'qa',review_task_id:a.id}),b=await f.submit('receiver',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
    await f.api('company_tasks',{action:'amend',epoch:1,operation_id:'declare-receiver',task_id:a.id,expected_definition_revision:1,source_instruction,spec:f.spec({peer_task_ids:[b.id]})});
    const aj=f.queue(a.id);
    await work(f.root,aj.job_id,immediate('fictional-before-restart',{...envelope('Committed fictional candidate.'),messages:[{to:'pm',to_task_id:b.id,content:'The exact durable fictional handoff must be dispositioned.'}]}));
    const committed=f.read(),message=Object.values(committed.records).find(record=>record.runtime_message);
    assert.equal(committed.jobs[aj.job_id].status,'completed');assert.equal(committed.records[a.id].runtime_task.state,'queued','result committed before runtime reconciliation');
    assert.equal(message.runtime_message.state,'pending');
    // Every Store read is reopened. A new supervisor invocation starts solely
    // from the committed source, rather than retained coordinator memory.
    const launch=(root,jobId)=>{
      queued.push(jobId);workers.push(new Promise(resolve=>setTimeout(resolve,0)).then(()=>{
        const state=f.read(),job=state.jobs[jobId],review=job.role==='qa';
        return work(root,jobId,immediate('fictional-restarted-'+job.role,{...envelope('Resumed fictional '+job.role+' result.'),...(review?{review:{verdict:'Pass',reason:'The supplied exact fictional candidate meets its criteria.',blockers:[]}}:{message_dispositions:[{message_id:message.id,disposition:'Applied the exact durable handoff in this receiver result.'}]})}));
      }));return inertChild();
    };
    supervisor=supervise(f.root,f.control.instance_id,{signal:controller.signal,poll_ms:10,queue:(root,key)=>engine.queueRuntimeTask(root,key,{check:()=>({available:true,authenticated:true,version:'fictional-contract-adapter'}),launch})});
    await until(()=>f.read().records[b.id].runtime_task.state==='returned');controller.abort();await supervisor;await Promise.all(workers);
    let state=f.read();const outputIds=Object.values(state.jobs).map(job=>job.artifact_id);
    assert.equal(state.records[qa.id].runtime_task.state,'accepted');assert.equal(state.records[message.id].runtime_message.state,'processed');assert.equal(state.records[message.id].revision,2);
    assert.equal(state.records[message.id].runtime_message.disposition.attempt_id,state.records[b.id].runtime_task.attempts[0].job_id);
    assert.equal(queued.length,2);assert.equal(Object.keys(state.jobs).length,3);assert.equal(new Set(outputIds).size,3);
    for(const task of [a,qa,b])assert.equal(state.records[task.id].runtime_task.attempts.length,1);
    assert.equal(state.jobs[aj.job_id].native_id,'fictional-before-restart');
    let duplicateCalls=0;await work(f.root,aj.job_id,async()=>{duplicateCalls++;throw Error('Completed attempt must never call the model again');});
    assert.equal(duplicateCalls,0);await f.submit('receiver',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
    state=f.read();assert.equal(Object.keys(state.jobs).length,3);assert.equal(Object.values(state.records).filter(record=>record.runtime_message).length,1);assert.equal(state.records[message.id].revision,2);
  }finally{controller.abort();await supervisor;await Promise.allSettled(workers);f.close();}
});

for(const explicit of [false,true])test(`public pause, storage migration and resume retain ${explicit?'explicit':'current'} nullable control references through A to independent QA to B`,async()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-public-control-references-')),root=path.join(home,'fictional-company'),previous=process.env.COMPANY_PLUGIN_DATA;
  fs.mkdirSync(root);process.env.COMPANY_PLUGIN_DATA=path.join(home,'fixture-plugin-data');
  const args={root,session_id:id('fictional-lifecycle-founder')},base={...args,epoch:1};
  const api=(name,value={})=>call(name,{...args,...value},'codex');
  try{
    engine.bind(root,args.session_id,'codex');
    await api('company_open',{name:'Fictional nullable reference fixture',idea:'Fictional lifecycle regression; no actual native model calls.'});
    await api('company_control',{action:'pause',expected_epoch:1,source_instruction:'Pause this fictional fixture for explicit backed-up migration.'});
    await api('company_storage',{action:'migrate',epoch:1,source_instruction:'Migrate only this paused fictional fixture, retaining its exact backup.'});
    await api('company_control',{action:'resume',expected_epoch:1,source_instruction:'Resume fictional preparation only; no contact or external effects.'});
    const control=runtimeAction({...base,action:'start',source_instruction},'codex',{launch:inertChild});claimSupervisor(root,control.instance_id,process.pid);
    const read=()=>withStore(root,db=>db.read()),controls=Object.values(read().records).filter(record=>['pause','resume'].includes(record.action));
    assert.equal(controls.length,2);assert(controls.every(record=>record.revision===undefined));
    const sourceIds=controls.map(record=>record.id),spec=patch=>({role:'engineer',task:'Preserve the exact fictional lifecycle restrictions.',input_ids:explicit?sourceIds:[],acceptance:'Retain both exact control instructions; no external effects.',expected_deliverable:'One attributable fictional finding',context_scope:'nullable-controls',...patch});
    const submit=async(operation_id,patch={})=>api('company_tasks',{action:'submit',epoch:1,operation_id,source_instruction,spec:spec(patch)});
    const a=await submit('producer'),qa=await submit('qa',{role:'qa',review_task_id:a.id,depends_on:[{task_id:a.id,gate:'output'}]}),b=await submit('receiver',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
    const queue=task_id=>engine.queueRuntimeTask(root,task_id,{check:()=>({available:true,authenticated:true,version:'fictional-contract-adapter'}),launch:inertChild});
    const jobs=[];
    for(const [task,native,review] of [[a,'fictional-nullable-producer',false],[qa,'fictional-nullable-independent-qa',true],[b,'fictional-nullable-receiver',false]]){
      const queued=queue(task.id);jobs.push(queued.job_id);
      const pending=read().jobs[queued.job_id];
      for(const id of sourceIds)assert(pending.inputs.some(ref=>ref.id===id&&ref.revision===null),'canonical source references normalize an absent control revision to null');
      await work(root,queued.job_id,immediate(native,{...envelope('The exact supplied fictional control instructions remain binding; no contact or external effects.'),...(review?{review:{verdict:'Pass',reason:'The exact fictional candidate preserves both supplied lifecycle instructions.',blockers:[]}}:{})}));
      const state=read(),job=state.jobs[queued.job_id];assert.equal(job.status,'completed',job.error);assert.equal(isTaskOutput(state,state.records[job.artifact_id]),true);
      assert.equal(taskContextMatches(state,job,job.context_sha256),true,'its own completed bookkeeping must not stale a nullable source input');
      const packet=JSON.parse(taskAssignmentContext(state,job).text);
      for(const id of sourceIds)assert(packet.records.some(entry=>entry.source.id===id&&entry.source.revision===null&&entry.value.content===state.records[id].content));
    }
    tickRuntime(root,{dispatch:false});const state=read(),receiver=state.jobs[jobs[2]];
    assert.equal(state.records[a.id].runtime_task.state,'returned');assert.equal(state.records[qa.id].runtime_task.state,'accepted');assert.equal(state.records[b.id].runtime_task.state,'returned');
    assert.equal(new Set(jobs.map(id=>state.jobs[id].native_id)).size,3);
    const missing=structuredClone(state);delete missing.records[sourceIds[0]];
    assert.equal(taskContextMatches(missing,receiver,receiver.context_sha256),false,'a missing source cannot match a null reference');
    assert.equal(isTaskOutput(missing,missing.records[receiver.artifact_id]),false);
    for(const revision of [undefined,0,'1']){
      const malformed=structuredClone(state);malformed.jobs[receiver.id].inputs.find(ref=>ref.id===sourceIds[0]).revision=revision;
      assert.equal(taskContextMatches(malformed,malformed.jobs[receiver.id],receiver.context_sha256),false,'expected references must contain canonical null or a positive integer');
    }
    const changed=structuredClone(state);changed.records[sourceIds[0]].content+=' A new unresolved condition.';
    assert.equal(taskContextMatches(changed,receiver,receiver.context_sha256),false,'null revision does not weaken exact source hash binding');
  }finally{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(home,{recursive:true,force:true});}
});

test('cancelling committed producer or review evidence revokes readiness without rewriting its completed job',async t=>{
  for(const phase of ['producer-before-reconcile','review-after-Pass','negative-review'])await t.test(phase,async()=>{
    const f=fixture();try{
      const a=await f.submit('producer'),qa=await f.submit('qa',{role:'qa',review_task_id:a.id}),b=await f.submit('dependent',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
      const aj=f.queue(a.id);await work(f.root,aj.job_id,immediate('fictional-cancel-author',envelope('Retained fictional candidate.')));
      let target=a,jobId=aj.job_id;
      if(phase!=='producer-before-reconcile'){
        const qj=f.queue(qa.id);jobId=qj.job_id;target=qa;
        await work(f.root,qj.job_id,immediate('fictional-cancel-independent-review',{...envelope('Retained exact-subject fictional review.'),review:{verdict:phase==='negative-review'?'Blocked':'Pass',reason:'Exact supplied fictional candidate reviewed independently.',blockers:phase==='negative-review'?['A retained fictional blocker']:[]}}));
        tickRuntime(f.root,{dispatch:false});
        if(phase==='review-after-Pass')assert.equal(f.read().records[qa.id].runtime_task.state,'accepted');
      }else assert.equal(f.read().records[a.id].runtime_task.state,'queued','exercise completion before task reconciliation');
      const artifactId=f.read().jobs[jobId].artifact_id;
      await f.api('company_tasks',{action:'cancel',epoch:1,operation_id:'cancel-prerequisite',task_id:target.id,expected_definition_revision:1,source_instruction:'Cancel this exact fictional prerequisite; its retained result grants no further readiness.'});
      const state=f.read();assert.equal(state.records[target.id].runtime_task.state,'cancelled');assert.equal(state.jobs[jobId].status,'completed');assert.equal(state.records[artifactId].status,'Submitted');
      assert.equal(isTaskOutput(state,state.records[artifactId]),false);assert.equal(taskReady(state,state.records[b.id]).ready,false);
      if(phase==='producer-before-reconcile')assert.equal(taskReady(state,state.records[qa.id]).ready,false);
      if(phase==='negative-review')assert.equal(isTaskOwnOutput(state,state.jobs[jobId],state.records[artifactId]),true,'exact own negative evidence remains eligible only for its original output view');
      assert.throws(()=>engine.dispatch({...f.args,epoch:1,role:'growth',task:'Consume the explicitly named fictional job.',depends_on:[jobId]},'codex',{check:()=>({available:true,authenticated:true,version:'fictional-contract-adapter'}),launch:inertChild}),/cancelled/,'legacy dispatch cannot bypass an async task cancellation by naming its job');
      if(phase==='negative-review')return; // Declared negative inputs are repair evidence, not positive readiness.
      const explicit=await f.submit('explicit-cancelled-output',{role:'engineer',input_ids:[artifactId]});
      const current=f.read(),spec=current.records[explicit.id].runtime_task.spec,prospective={id:'prospective-cancelled-input',role:spec.role,task:spec.task,host:'codex',epoch:1,context_scope:spec.context_scope,inputs:[{id:artifactId,revision:1}],review_of:null,runtime_task:{id:explicit.id,definition_revision:explicit.definition_revision,definition_sha256:explicit.definition_sha256}};
      assert.equal(taskReady(current,current.records[explicit.id]).ready,false);
      assert.throws(()=>taskAssignmentContext(current,prospective),/cancelled/);assert.throws(()=>f.queue(explicit.id),/cancelled/);
      assert.equal(f.read().records[explicit.id].runtime_task.attempts.length,0);
    }finally{f.close();}
  });
});

test('cancelling producer or accepted reviewer fences an already-running dependent and retains its late return',async t=>{
  for(const cancel of ['producer','review'])await t.test(cancel,async()=>{
    const f=fixture();let release,worker;
    try{
      const a=await f.submit('producer'),qa=await f.submit('qa',{role:'qa',review_task_id:a.id}),b=await f.submit('dependent',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
      const aj=f.queue(a.id);await work(f.root,aj.job_id,immediate('fictional-running-cancel-author',envelope('Retained fictional candidate.')));
      const qj=f.queue(qa.id);await work(f.root,qj.job_id,immediate('fictional-running-cancel-review',{...envelope('Exact fictional review.'),review:{verdict:'Pass',reason:'The exact fictional candidate meets its stated criterion.',blockers:[]}}));
      tickRuntime(f.root,{dispatch:false});assert.equal(f.read().records[qa.id].runtime_task.state,'accepted');
      const bj=f.queue(b.id);worker=work(f.root,bj.job_id,async(_h,_n,_p,_d,timeout,_s,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));return new Promise(resolve=>release=()=>resolve({native_id:'fictional-late-dependent-'+cancel,text:JSON.stringify(envelope('LATE DEPENDENT AFTER CANCEL '+cancel))}));});
      assert(release);const target=cancel==='producer'?a:qa;
      await f.api('company_tasks',{action:'cancel',epoch:1,operation_id:'cancel-upstream',task_id:target.id,expected_definition_revision:1,source_instruction:'Revoke this exact fictional prerequisite while its dependent is running.'});
      release();await worker;tickRuntime(f.root,{dispatch:false});
      const state=f.read(),job=state.jobs[bj.job_id];assert.notEqual(job.status,'completed');assert.match(job.rejected_output?.text??'',new RegExp('LATE DEPENDENT AFTER CANCEL '+cancel));
      assert.equal(state.records[b.id].runtime_task.state,'needs_attention');assert.equal(state.records[b.id].runtime_task.attempts.length,1);assert.equal(job.coordination_release?.termination_confirmed,true);
      assert.equal(state.jobs[aj.job_id].status,'completed');assert.equal(state.jobs[qj.job_id].status,'completed');assert.equal(Object.keys(state.jobs).length,3);
    }finally{release?.();await worker;f.close();}
  });
});

test('compulsory and declared cancelled negative evidence do not become positive prerequisites for an independent pipeline',async t=>{
  for(const declared of [false,true])await t.test(declared?'declared repair evidence':'compulsory counterevidence',async()=>{
    const f=fixture();try{
      const old=await f.submit('old-producer'),oldQA=await f.submit('old-review',{role:'qa',review_task_id:old.id});
      const aj=f.queue(old.id);await work(f.root,aj.job_id,immediate('fictional-old-author',envelope('Old exact fictional candidate.')));
      tickRuntime(f.root,{dispatch:false});
      const qj=f.queue(oldQA.id);await work(f.root,qj.job_id,immediate('fictional-old-blocked',{...envelope('OLD BLOCKED CONDITION must remain visible.'),review:{verdict:'Blocked',reason:'Old unresolved evidence remains compulsory.',blockers:['An old fictional uncertainty']}}));
      const negative=f.read().jobs[qj.job_id].artifact_id;
      await f.api('company_tasks',{action:'cancel',epoch:1,operation_id:'cancel-old-negative',task_id:oldQA.id,expected_definition_revision:1,source_instruction:'Cancel further use of this old task as readiness; retain its negative evidence.'});
      const a=await f.submit('new-producer',{role:'engineer',input_ids:declared?[negative]:[]}),qa=await f.submit('new-review',{role:'qa',review_task_id:a.id}),b=await f.submit('new-receiver',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
      for(const [task,native,review] of [[a,'fictional-new-author',false],[qa,'fictional-new-review',true],[b,'fictional-new-receiver',false]]){
        const queued=f.queue(task.id),before=f.read(),packet=JSON.parse(taskAssignmentContext(before,before.jobs[queued.job_id]).text);
        assert(packet.records.some(entry=>entry.source.id===negative&&entry.value.review.verdict==='Blocked'));
        assert(packet.records.some(entry=>entry.source.id===before.jobs[aj.job_id].artifact_id),'negative subject body remains visible');
        assert(packet.producer_tasks.some(entry=>entry.binding.id===oldQA.id&&entry.use==='retained evidence only; no prerequisite permission'));
        await work(f.root,queued.job_id,immediate(native,{...envelope('Current independent fictional result retains the old unresolved condition.'),...(review?{review:{verdict:'Pass',reason:'The exact new candidate meets its independent criterion while retaining the old uncertainty.',blockers:[]}}:{})}));
        const state=f.read();assert.equal(state.jobs[queued.job_id].status,'completed',state.jobs[queued.job_id].error);
        tickRuntime(f.root,{dispatch:false});
      }
      tickRuntime(f.root,{dispatch:false});const state=f.read();assert.equal(state.records[qa.id].runtime_task.state,'accepted');assert.equal(state.records[b.id].runtime_task.state,'returned');
      assert.equal(state.records[oldQA.id].runtime_task.state,'cancelled');assert.equal(state.records[negative].review.verdict,'Blocked');
    }finally{f.close();}
  });
});
