import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,digest} from '../plugins/soloco/runtime/store.mjs';
import {taskAction,runtimeAction,tickRuntime,claimSupervisor,ensureSupervisor} from '../plugins/soloco/runtime/task-runtime.mjs';
import {supervise} from '../plugins/soloco/runtime/supervisor.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {toolListFor,call} from '../plugins/soloco/runtime/main.mjs';
import {getEventListeners} from 'node:events';
import {resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';

const child=()=>({on(){return this;},unref(){}});
const ready=()=>({available:true,authenticated:true,version:'fictional-contract-adapter'});
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-async-runtime-')),cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-async-cache-')),previous=process.env.COMPANY_PLUGIN_DATA;
 process.env.COMPANY_PLUGIN_DATA=cache;
 const args={root,session_id:id('fictional-founder'),idea:'Fictional durable task runtime acceptance'};
 engine.bind(root,args.session_id,'codex');engine.open(args,'codex');withStore(root,db=>db.migrate());
 const start=runtimeAction({...args,epoch:1,action:'start',source_instruction:'Run only the explicitly submitted fictional preparation tasks.'},'codex',{launch:child});
 const submit=(operation,patch={})=>taskAction({...args,epoch:1,action:'submit',operation_id:operation,source_instruction:'Prepare fictional supplied evidence only.',spec:{role:'research',task:'Prepare a short fictional finding.',acceptance:'Return one source-grounded fictional finding.',expected_deliverable:'One fictional finding',context_scope:'fixture',...patch}},'codex',{wake:()=>({started:false,reason:'controlled test driver'})});
 return {root,args,start,submit,read:()=>withStore(root,db=>db.read()),close:()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(root,{recursive:true,force:true});fs.rmSync(cache,{recursive:true,force:true});}};
}
const queue=(root,key,launch=child)=>engine.queueRuntimeTask(root,key,{launch,check:ready});
const model=(native,content='A fictional attributable finding.')=>async(_host,session,_prompt,_dir,limit,_selection,options)=>{assert.equal(session,null,'new tasks use finite fresh native sessions');options.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:native,text:JSON.stringify({content,messages:[],notices:[]})};};
async function waitUntil(check,{ms=5000}={}){const until=Date.now()+ms;while(Date.now()<until){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Fictional runtime acceptance did not reach expected state');}

test('new task and status are durable while two workers remain in slow execution; runtime never impersonates owner',async()=>{
 const f=fixture();let releaseA,releaseB;const running=[];
 try{
  const a=f.submit('slow-a',{role:'research',context_scope:'a'}),b=f.submit('slow-b',{role:'engineer',context_scope:'b'});
  const ja=queue(f.root,a.id),jb=queue(f.root,b.id);
  const slow=(native,set)=>async(_h,_s,_p,_d,limit,_sel,o)=>{o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return new Promise(resolve=>set(()=>resolve({native_id:native,text:JSON.stringify({content:'Fictional bounded result',messages:[],notices:[]})})));};
  running.push(work(f.root,ja.job_id,slow('fictional-slow-a',fn=>releaseA=fn)),work(f.root,jb.job_id,slow('fictional-slow-b',fn=>releaseB=fn)));
  const c=f.submit('new-while-running',{role:'pm',context_scope:'new'});
  const view=taskAction({...f.args,action:'inspect'},'codex');
  assert(view.tasks.some(t=>t.id===c.id));assert.equal(f.read().jobs[ja.job_id].status,'running');assert.equal(f.read().jobs[jb.job_id].status,'running');
  const state=f.read();assert.equal(state.jobs[ja.job_id].requester.role,'runtime');assert.equal(state.jobs[ja.job_id].requester.session_id,undefined);assert.equal(state.jobs[ja.job_id].requester.task_id,a.id);
  const outsider={...f.args,session_id:id('other')};engine.bind(f.root,outsider.session_id,'codex');
  assert.throws(()=>engine.tasks({...outsider,action:'submit',epoch:1,operation_id:'forbidden',source_instruction:'not authority',spec:{role:'research',task:'x',acceptance:'x',expected_deliverable:'x'}},'codex'),/does not own/);
 }finally{releaseA?.();releaseB?.();await Promise.allSettled(running);f.close();}
});

test('A to exact independent QA to B advances in supervisor loop while CoS performs no polling',async()=>{
 const f=fixture(),controller=new AbortController(),workers=[];let supervisor;
 try{
  const a=f.submit('producer',{role:'engineer'});
  const qa=f.submit('qa',{role:'qa',review_task_id:a.id,task:'Independently assess the exact producer output.',acceptance:'Pass only the exact supplied source-grounded finding.'});
  const b=f.submit('receiver',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
  const launch=(root,jid)=>{workers.push(new Promise(resolve=>setTimeout(resolve,0)).then(()=>work(root,jid,async(_host,session,prompt,_dir,limit,_selection,options)=>{
    assert.equal(session,null);options.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));
    const state=f.read(),j=state.jobs[jid];
    return {native_id:'fictional-native-'+j.role,text:JSON.stringify({content:'Fictional exact evidence judged adequate.',messages:[],notices:[],...(j.review_of?{review:{verdict:'Pass',reason:'Exact supplied fictional candidate meets the declared criterion.'}}:{})})};
  })));return child();};
  supervisor=supervise(f.root,f.start.instance_id,{signal:controller.signal,poll_ms:20,queue:(root,key)=>queue(root,key,launch)});
  await waitUntil(()=>f.read().records[b.id]?.runtime_task.state==='returned');
  const s=f.read();assert.equal(s.records[qa.id].runtime_task.state,'accepted');assert.equal(s.records[a.id].runtime_task.state,'returned');
  const jobs=Object.values(s.jobs);assert.equal(jobs.length,3);assert.equal(new Set(jobs.map(j=>j.native_id)).size,3);
  const receiver=jobs.find(j=>j.runtime_task.id===b.id),reviewer=jobs.find(j=>j.runtime_task.id===qa.id);assert(receiver.inputs.some(ref=>ref.id===reviewer.artifact_id));
 }finally{controller.abort();await supervisor;await Promise.allSettled(workers);f.close();}
});

test('idle supervisor ticks do not create canonical history or invalidate task context',()=>{
 const f=fixture();try{
  claimSupervisor(f.root,f.start.instance_id);
  const before=withStore(f.root,db=>db.changeToken());
  for(let n=0;n<5;n++)tickRuntime(f.root,{instance:f.start.instance_id,dispatch:false});
  assert.equal(withStore(f.root,db=>db.changeToken()),before);
  const live=runtimeAction({...f.args,action:'status'},'codex');assert.equal(live.state,'running');assert.equal(live.supervisor_is_model,false);
 }finally{f.close();}
});

test('canonical task and queued attempt commit together; spawn failure is durable and never retries',()=>{
 const f=fixture();try{
  const t=f.submit('spawn-failure');assert.throws(()=>queue(f.root,t.id,()=>{throw Error('fictional spawn failure');}),/spawn failure/);
  tickRuntime(f.root,{dispatch:false});const s=f.read(),r=s.records[t.id];
  assert.equal(r.runtime_task.state,'needs_attention');assert.equal(r.runtime_task.attempts.length,1);
  assert.equal(s.jobs[r.runtime_task.attempts[0].job_id].coordination_release.termination_confirmed,true);
  const calls=[];tickRuntime(f.root,{queue:(...args)=>calls.push(args)});assert.equal(calls.length,0);
 }finally{f.close();}
});

test('startup detects existing live supervisor rather than duplicating it; stop fences queue grants',()=>{
 const f=fixture();try{
  const t=f.submit('stopped');claimSupervisor(f.root,f.start.instance_id);let launches=0;
  assert.equal(ensureSupervisor(f.root,{launch:()=>{launches++;return child();}}).started,false);assert.equal(launches,0);
  runtimeAction({...f.args,epoch:1,action:'stop',source_instruction:'Stop the fictional supervisor.'},'codex');
  assert.throws(()=>queue(f.root,t.id),/disabled|stopped/);
  assert.throws(()=>runtimeAction({...f.args,epoch:0,action:'start',source_instruction:'stale'},'codex'),/does not own/);
 }finally{f.close();}
});

test('public tools expose bounded task/runtime contracts and reject unrecognized authority arguments',async()=>{
 const names=toolListFor().map(t=>t.name);assert(names.includes('company_tasks'));assert(names.includes('company_runtime'));
 await assert.rejects(call('company_tasks',{root:'/private/tmp',session_id:'fixture',action:'inspect',runtime_authority:true},'codex'),/Unknown argument/);
 for(const action of ['message','dispose'])assert.throws(()=>taskAction({action,root:'/private/tmp',session_id:'fixture'},'codex'),/source_instruction/,'every new public mutation needs its actual source instruction');
});

test('background reconciliation catches a crash after queue commit even while runtime is stopped',()=>{
 const f=fixture();try{
  const t=f.submit('orphan'),j=queue(f.root,t.id);
  withStore(f.root,db=>db.transaction('fixture.orphan',s=>{s.jobs[j.job_id].created_at=new Date(Date.now()-600000).toISOString();return s;}));
  runtimeAction({...f.args,epoch:1,action:'stop',source_instruction:'Stop and inspect the fictional orphan.'},'codex');
  const r=runtimeAction({...f.args,epoch:1,action:'reconcile'},'codex');assert.equal(r.dispatched.length,0);
  const s=f.read();assert.equal(s.jobs[j.job_id].status,'interrupted');assert.equal(s.records[t.id].runtime_task.state,'needs_attention');
  assert.notEqual(s.jobs[j.job_id].coordination_release?.termination_confirmed,true);
  assert(s.notices.some(n=>n.reference===t.id));
 }finally{f.close();}
});

test('killed running attempts remain uncertain and occupy capacity without automatic replacement',()=>{
 const f=fixture();try{
  const jobs=[0,1,2].map(n=>queue(f.root,f.submit('uncertain-'+n).id));
  withStore(f.root,db=>db.transaction('fixture.worker_lost',s=>{for(const entry of jobs){const j=s.jobs[entry.job_id];j.status='running';j.started_at=new Date(Date.now()-600000).toISOString();Object.assign(j,executionTiming(Date.now()-600000,{timeout_ms:j.timeout_ms}));}return s;}));
  tickRuntime(f.root,{dispatch:false});
  const t=f.submit('after-uncertain');assert.throws(()=>queue(f.root,t.id),/capacity.*uncertain/);
  const s=f.read();assert.equal(Object.keys(s.jobs).length,3);assert(s.notices.length>=3);
  for(const {job_id} of jobs){assert.equal(s.jobs[job_id].status,'interrupted');assert.notEqual(s.jobs[job_id].coordination_release?.termination_confirmed,true);}
 }finally{f.close();}
});

test('format7 same-native exact supplemental reads are delivered and accounted in the visible wire budget',async()=>{
 const f=fixture();try{
  const evidence=engine.save({...f.args,epoch:1,kind:'artifact',id:'source',content:'Fictional exact source text.'},'codex');
  const value=f.read().records.source,hash=digest(JSON.stringify(value));
  const t=f.submit('read',{evidence_ids:['source']}),j=queue(f.root,t.id);let calls=0;
  await work(f.root,j.job_id,async(_h,native,_prompt,_dir,limit,_selection,o)=>{
    if(calls++===0){o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:'fictional-read-native',text:JSON.stringify({reads:[{id:'source',sha256:hash,offset:0,length:32}]})};}
    assert.equal(native,'fictional-read-native');assert.match(_prompt,/record-reads-v1/);return {native_id:native,text:JSON.stringify({content:'The exact delivered source was inspected.',messages:[],notices:[]})};
  });
  const result=f.read().jobs[j.job_id];assert.equal(calls,2);assert.equal(result.status,'completed');assert.equal(result.retrieved_inputs[0].sha256,hash);assert.equal(result.runtime_context_usage.rounds,2);assert(result.runtime_context_usage.visible_wire_bytes<=result.runtime_context_usage.budget_bytes);
 }finally{f.close();}
});

test('format7 changed native identity on retrieval fails and preserves the rejected return',async()=>{
 const f=fixture();try{
  engine.save({...f.args,epoch:1,kind:'artifact',id:'source',content:'Fictional exact source.'},'codex');const hash=digest(JSON.stringify(f.read().records.source));
  const t=f.submit('wrong-read',{evidence_ids:['source']}),j=queue(f.root,t.id);let calls=0;
  await work(f.root,j.job_id,async(_h,native,_p,_d,limit,_s,o)=>{if(calls++===0){o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:'fictional-read-a',text:JSON.stringify({reads:[{id:'source',sha256:hash,offset:0,length:16}]})};}return {native_id:'fictional-read-b',text:JSON.stringify({content:'This is the wrong native.',messages:[],notices:[]})};});
  const s=f.read(),job=s.jobs[j.job_id];assert.equal(job.status,'failed');assert.match(job.error,/native identity/);assert(job.rejected_output);assert(!job.artifact_id);
 }finally{f.close();}
});

test('cumulative multibyte and escaped retrieval history Holds before another oversized native call',async()=>{
 const f=fixture();try{
  engine.save({...f.args,epoch:1,kind:'artifact',id:'source',content:'"\\é'.repeat(1800)},'codex');const hash=digest(JSON.stringify(f.read().records.source));
  const t=f.submit('budget-read',{evidence_ids:['source']}),j=queue(f.root,t.id);let calls=0;
  await work(f.root,j.job_id,async(_h,native,_p,_d,limit,_s,o)=>{if(calls++===0)o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:native??'fictional-budget-read',text:JSON.stringify({reads:[{id:'source',sha256:hash,offset:0,length:6000}]})};});
  const job=f.read().jobs[j.job_id];assert.equal(job.status,'failed');assert.match(job.error,/wire budget/);assert(calls>1&&calls<16);assert(job.rejected_output);assert.equal(job.coordination_release.termination_confirmed,true);
 }finally{f.close();}
});

test('fatal supervisor validation is durable and suppresses automatic restart churn',async()=>{
 const f=fixture();try{
  const t=f.submit('corrupt-index');
  withStore(f.root,db=>db.db.prepare("UPDATE async_task_index SET state='cancelled' WHERE id=?").run(t.id));
  const result=await supervise(f.root,f.start.instance_id,{poll_ms:1});assert.equal(result.stopped,true);assert.match(result.reason,/index/i);
  let spawns=0;assert.equal(ensureSupervisor(f.root,{launch:()=>{spawns++;return child();}}).started,false);assert.equal(spawns,0);
  const status=runtimeAction({...f.args,action:'status'},'codex');assert.equal(status.state,'needs_attention');assert.equal(status.complete,false);assert.match(status.error,/index/i);
  assert(f.read().notices.some(n=>n.reference==='async-runtime-control'));
 }finally{f.close();}
});

test('superseded supervisor generation cannot dispatch through a newly started runtime principal',()=>{
 const f=fixture();try{
  const t=f.submit('old-supervisor');claimSupervisor(f.root,f.start.instance_id);
  runtimeAction({...f.args,epoch:1,action:'stop',source_instruction:'Replace only the fictional supervisor.'},'codex');
  const restarted=runtimeAction({...f.args,epoch:1,action:'start',source_instruction:'Start the replacement fictional supervisor.'},'codex',{launch:child});
  assert.notEqual(restarted.instance_id,f.start.instance_id);
  assert.throws(()=>engine.queueRuntimeTask(f.root,t.id,{launch:child,check:ready,runtime_instance_id:f.start.instance_id,supervisor_pid:process.pid}),/generation changed/);
  assert.equal(Object.keys(f.read().jobs).length,0);
 }finally{f.close();}
});

test('long idle supervisor waits keep only the current abort listener',async()=>{
 const f=fixture(),controller=new AbortController();let running;
 try{
  running=supervise(f.root,f.start.instance_id,{signal:controller.signal,poll_ms:2,queue:()=>{throw Error('No task should dispatch');}});
  await new Promise(r=>setTimeout(r,100));assert(getEventListeners(controller.signal,'abort').length<=1);
  controller.abort();await running;assert.equal(getEventListeners(controller.signal,'abort').length,0);
 }finally{controller.abort();await running;f.close();}
});

test('new applicable rules between worker publication and runtime acceptance fence a formerly passing review',async()=>{
 const f=fixture();try{
  const a=f.submit('before-rule-a',{role:'engineer'}),ja=queue(f.root,a.id);await work(f.root,ja.job_id,model('fictional-rule-author'));tickRuntime(f.root,{dispatch:false});
  const q=f.submit('before-rule-review',{role:'qa',review_task_id:a.id}),jq=queue(f.root,q.id);
  await work(f.root,jq.job_id,async(_h,_n,_p,_d,limit,_s,o)=>{o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:'fictional-rule-reviewer',text:JSON.stringify({content:'This fictional candidate passes the prior current criterion.',review:{verdict:'Pass',reason:'The exact supplied criterion was met.'},messages:[],notices:[]})};});
  assert.equal(f.read().jobs[jq.job_id].status,'completed');
  engine.save({...f.args,epoch:1,kind:'decision',content:'New applicable rule: this finding is not sufficient for current acceptance.'},'codex');
  tickRuntime(f.root,{dispatch:false});const state=f.read();assert.equal(state.records[q.id].runtime_task.state,'needs_attention');assert.match(state.records[q.id].runtime_task.attention,/context changed/);
 }finally{f.close();}
});

test('peer handoff is delivered to the declared receiver and acknowledged atomically with its actual result',async()=>{
 const f=fixture();try{
  const a=f.submit('peer-author',{role:'research'}),b=f.submit('peer-receiver',{role:'engineer',depends_on:[{task_id:a.id,gate:'output'}]});
  const amended=taskAction({...f.args,epoch:1,action:'amend',task_id:a.id,expected_definition_revision:1,operation_id:'declare-peer',source_instruction:'Route this fictional handoff only to the named receiver.',spec:{...f.read().records[a.id].runtime_task.spec,peer_task_ids:[b.id]}},'codex',{wake:()=>({started:false})});
  assert.equal(amended.definition_revision,2);
  const ja=queue(f.root,a.id);await work(f.root,ja.job_id,async(_h,_n,prompt,_d,limit,_s,o)=>{assert.match(prompt,new RegExp(b.id));o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:'fictional-peer-author',text:JSON.stringify({content:'Fictional producer evidence.',messages:[{to:'engineer',to_task_id:b.id,content:'Required fictional qualifier: retain the source uncertainty.'}],notices:[]})};});
  tickRuntime(f.root,{dispatch:false});
  const inbox=taskAction({...f.args,action:'inbox',task_id:b.id},'codex');assert.equal(inbox.total,1);assert.equal(inbox.items[0].content_complete,false);
  const messageId=inbox.items[0].id,jb=queue(f.root,b.id);
  await work(f.root,jb.job_id,async(_h,_n,prompt,_d,limit,_s,o)=>{assert.match(prompt,/Required fictional qualifier/);o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:'fictional-peer-receiver',text:JSON.stringify({content:'The fictional result preserves the source uncertainty.',messages:[],notices:[],message_dispositions:[{message_id:messageId,disposition:'The result explicitly preserves the supplied uncertainty.'}]})};});
  tickRuntime(f.root,{dispatch:false});const state=f.read();assert.equal(state.records[messageId].runtime_message.state,'processed');assert.equal(state.records[messageId].runtime_message.disposition.by,'worker');assert.equal(state.records[b.id].runtime_task.state,'returned');
 }finally{f.close();}
});

test('an interrupted exact attempt retains its late native response and full negative original without acceptance',async()=>{
 const f=fixture();let release,running;
 try{
  const t=f.submit('late-interrupted'),j=queue(f.root,t.id);
  const reason='NEVER RETRY: observed effects remain uncertain. '.repeat(3000);
  const wire=JSON.stringify({content:'Late observation only.',review:{verdict:'Blocked',reason},messages:[],notices:[]});
  running=work(f.root,j.job_id,async(_h,_n,_p,_d,limit,_s,o)=>{o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return new Promise(resolve=>release=()=>resolve({native_id:'fictional-late-interrupted',text:wire}));});
  await waitUntil(()=>typeof release==='function');
  withStore(f.root,db=>db.transaction('fixture.supervisor_interrupted',s=>{const job=s.jobs[j.job_id];job.status='interrupted';job.finished_at=new Date().toISOString();job.timeout_reconciliation={state:'inspection',termination_confirmed:false};return s;}));
  release();await running;
  const s=f.read(),job=s.jobs[j.job_id];
  assert.equal(job.status,'interrupted');assert.equal(job.native_id,'fictional-late-interrupted');assert.equal(job.coordination_release.termination_confirmed,true);
  assert(!job.artifact_id);assert.equal(job.rejected_output.negative_reason,reason);assert.equal(job.rejected_output.truncated,true);assert.equal(resolveSnapshot(s,job.rejected_output.original),wire);
  tickRuntime(f.root,{dispatch:false});assert.equal(f.read().records[t.id].runtime_task.state,'needs_attention');assert.equal(Object.keys(f.read().jobs).length,1);
 }finally{release?.();await running;f.close();}
});

test('supervisor starts an explicit output consumer after its producer is terminal without another active transition',async()=>{
 const f=fixture();try{
  const a=f.submit('terminal-explicit-producer',{role:'engineer'}),ja=queue(f.root,a.id);
  await work(f.root,ja.job_id,model('fictional-terminal-explicit-producer','Exact retained terminal producer content.'));
  tickRuntime(f.root,{dispatch:false});assert.equal(f.read().records[a.id].runtime_task.state,'returned');
  const artifactId=f.read().jobs[ja.job_id].artifact_id;
  const b=f.submit('explicit-output-consumer',{role:'research',input_ids:[artifactId]});
  const scheduled=tickRuntime(f.root,{queue:(root,key)=>queue(root,key)});
  assert.equal(scheduled.dispatched.length,1,'a compact no-change scheduling tick must load input producer provenance');
  const jb=scheduled.dispatched[0];assert(f.read().jobs[jb.job_id].inputs.some(ref=>ref.id===artifactId));
  await work(f.root,jb.job_id,async(_h,_n,prompt,_d,limit,_s,o)=>{assert.match(prompt,/Exact retained terminal producer content/);o.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));return {native_id:'fictional-explicit-output-consumer',text:JSON.stringify({content:'The exact retained producer evidence was read.',messages:[],notices:[]})};});
  tickRuntime(f.root,{dispatch:false});assert.equal(f.read().records[b.id].runtime_task.state,'returned');assert.equal(Object.keys(f.read().jobs).length,2);
 }finally{f.close();}
});
