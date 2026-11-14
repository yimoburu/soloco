// Source mechanics only: unchanged Original issuers observe controlled worker/model
// processes. Fictional callback DATA does not establish Native qualification.
import hostTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id,digest} from '../plugins/soloco/runtime/store.mjs';
import {taskAction,runtimeAction,tickRuntime,claimSupervisor,ensureSupervisor} from '../plugins/soloco/runtime/task-runtime.mjs';
import {supervise} from '../plugins/soloco/runtime/supervisor.mjs';
import {workOriginal as work,disposeCoreOriginalWorkerFixtures} from './core-original-worker-fixture.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {toolListFor,call} from '../plugins/soloco/runtime/main.mjs';
import {getEventListeners} from 'node:events';
import {resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';
import {backupCompany,restoreCompany} from '../plugins/soloco/runtime/storage-transfer.mjs';
import {resourceClaims} from '../plugins/soloco/runtime/coordination.mjs';
import {inspectOriginalLocalExecutionInventoryFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';

for(const host of ['codex','claude']) {
const test=(name,fn)=>hostTest(`${host}: ${name}`,fn);
const child=()=>({on(){return this;},unref(){}});
const ready=()=>({available:true,authenticated:true,version:'fictional-contract-adapter'});
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-async-runtime-')),cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-async-cache-')),previous=process.env.COMPANY_PLUGIN_DATA;
 process.env.COMPANY_PLUGIN_DATA=cache;
 const args={root,session_id:id('fictional-founder'),idea:'Fictional durable task runtime acceptance'};
 engine.bind(root,args.session_id,host);engine.open(args,host);withStore(root,db=>db.migrate());
 const start=runtimeAction({...args,epoch:1,action:'start',source_instruction:'Run only the explicitly submitted fictional preparation tasks.'},host,{launch:child});
 const submit=(operation,patch={})=>taskAction({...args,epoch:1,action:'submit',operation_id:operation,source_instruction:'Prepare fictional supplied evidence only.',spec:{role:'research',task:'Prepare a short fictional finding.',acceptance:'Return one source-grounded fictional finding.',expected_deliverable:'One fictional finding',context_scope:'fixture',...patch}},host,{wake:()=>({started:false,reason:'controlled test driver'})});
 return {root,args,start,submit,read:()=>withStore(root,db=>db.read()),close:()=>{disposeCoreOriginalWorkerFixtures(root);if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(root,{recursive:true,force:true});fs.rmSync(cache,{recursive:true,force:true});}};
}
const queue=(root,key,launch=child)=>engine.queueRuntimeTask(root,key,{launch,check:ready});
const model=(native,content='A fictional attributable finding.')=>async(_host,session,_prompt,_dir,limit,_selection,options)=>{assert.equal(session,null,'new tasks use finite fresh native sessions');return {native_id:native,text:JSON.stringify({content,messages:[],notices:[]})};};
async function waitUntil(check,{ms=5000}={}){const until=Date.now()+ms;while(Date.now()<until){if(check())return;await new Promise(r=>setTimeout(r,20));}throw Error('Fictional runtime acceptance did not reach expected state');}

test('explicit host model metadata survives queue, worker startup and task reconciliation',async()=>{
 const f=fixture();try {
  const selected=host==='claude'?'sonnet':'fictional-model';
  const catalog={supported:true,source:host==='claude'?'documented_aliases':'host_catalog',models:[{id:selected,supported_efforts:[],effort_support:host==='claude'?'alias_specific_support_unverified':'host_catalog'}]};
  const t=f.submit('explicit-selection',{model_selection:{mode:'explicit',model:selected,reason:'Small fictional transformation using a supported host model.'}});
  const j=engine.queueRuntimeTask(f.root,t.id,{launch:child,check:ready,catalog:()=>catalog});
  await work(f.root,j.job_id,model('fictional-selected-'+host));
  tickRuntime(f.root,{dispatch:false});
  const s=f.read(),job=s.jobs[j.job_id];
  assert.equal(job.status,'completed',job.error);
  assert.equal(s.records[t.id].runtime_task.state,'returned',s.records[t.id].runtime_task.attention);
  assert.equal(job.model_catalog.source,catalog.source);
 }finally{f.close();}
});
if(host==='claude')test('host-default fast-off survives the same durable task workflow',async()=>{
 const f=fixture();try {
  const catalog={supported:true,source:'documented_aliases',models:[],speed_support:{host_default:true,fast_disabled:true,evidence:'documented_fastMode_false_with_installed_version_and_settings_control',default_service_tier:null,default_speed:'unverified',paid_tiers_enabled:false}};
  const t=f.submit('default-fast-off',{model_selection:{mode:'default',speed:'fast_disabled',reason:'Use the host default while explicitly disabling fast mode.'}});
  const j=engine.queueRuntimeTask(f.root,t.id,{launch:child,check:ready,catalog:()=>catalog});
  await work(f.root,j.job_id,model('fictional-default-claude'));
  tickRuntime(f.root,{dispatch:false});
  const s=f.read();assert.equal(s.jobs[j.job_id].status,'completed',s.jobs[j.job_id].error);
  assert.equal(s.records[t.id].runtime_task.state,'returned',s.records[t.id].runtime_task.attention);
 }finally{f.close();}
});

test('new task and status are durable while two workers remain in slow execution; runtime never impersonates owner',async()=>{
 const f=fixture();let releaseA,releaseB;const running=[];
 try{
  const a=f.submit('slow-a',{role:'research',context_scope:'a'}),b=f.submit('slow-b',{role:'engineer',context_scope:'b'});
  const ja=queue(f.root,a.id),jb=queue(f.root,b.id);
  const slow=(native,set)=>async(_h,_s,_p,_d,limit,_sel,o)=>{return new Promise(resolve=>set(()=>resolve({native_id:native,text:JSON.stringify({content:'Fictional bounded result',messages:[],notices:[]})})));};
  running.push(work(f.root,ja.job_id,slow('fictional-slow-a',fn=>releaseA=fn)),work(f.root,jb.job_id,slow('fictional-slow-b',fn=>releaseB=fn)));
  await waitUntil(()=>typeof releaseA==='function'&&typeof releaseB==='function');
  const c=f.submit('new-while-running',{role:'pm',context_scope:'new'});
  const view=taskAction({...f.args,action:'inspect'},host);
  assert(view.tasks.some(t=>t.id===c.id));assert.equal(f.read().jobs[ja.job_id].status,'running');assert.equal(f.read().jobs[jb.job_id].status,'running');
  const state=f.read();assert.equal(state.jobs[ja.job_id].requester.role,'runtime');assert.equal(state.jobs[ja.job_id].requester.session_id,undefined);assert.equal(state.jobs[ja.job_id].requester.task_id,a.id);
  const outsider={...f.args,session_id:id('other')};engine.bind(f.root,outsider.session_id,host);
  assert.throws(()=>engine.tasks({...outsider,action:'submit',epoch:1,operation_id:'forbidden',source_instruction:'not authority',spec:{role:'research',task:'x',acceptance:'x',expected_deliverable:'x'}},host),/does not own/);
 }finally{releaseA?.();releaseB?.();await Promise.allSettled(running);f.close();}
});

test('A to exact independent QA to B advances in supervisor loop while CoS performs no polling',async()=>{
 const f=fixture(),controller=new AbortController(),workers=[];let supervisor;
 try{
  const a=f.submit('producer',{role:'engineer'});
  const qa=f.submit('qa',{role:'qa',review_task_id:a.id,task:'Independently assess the exact producer output.',acceptance:'Pass only the exact supplied source-grounded finding.'});
  const b=f.submit('receiver',{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
  const launch=(root,jid)=>{workers.push(new Promise(resolve=>setTimeout(resolve,0)).then(()=>work(root,jid,async(_host,session,prompt,_dir,limit,_selection,options)=>{
    assert.equal(session,null);
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
  const live=runtimeAction({...f.args,action:'status'},host);assert.equal(live.state,'running');assert.equal(live.supervisor_is_model,false);
 }finally{f.close();}
});

test('canonical task and queued attempt commit together; an unverified launch throw remains occupied and never retries',()=>{
 const f=fixture();try{
  let launches=0;
  const t=f.submit('spawn-failure');assert.throws(()=>queue(f.root,t.id,()=>{launches++;throw Error('fictional spawn failure');}),/spawn failure/);
  tickRuntime(f.root,{dispatch:false});const s=f.read(),r=s.records[t.id],job=s.jobs[r.runtime_task.attempts[0].job_id];
  assert.equal(r.runtime_task.state,'needs_attention');assert.equal(r.runtime_task.attempts.length,1);assert.equal(job.status,'failed');
  // An arbitrary callback throw provides no original process observation.
  assert.equal(job.coordination_release.termination_confirmed,false);assert.equal(job.coordination_release.reason,'worker_not_started_unverified');
  assert.deepEqual(job.original_execution_assignment.launches,[]);
  const calls=[];tickRuntime(f.root,{queue:(...args)=>calls.push(args)});assert.equal(calls.length,0);assert.equal(launches,1);
  withStore(f.root,store=>store.readSnapshot(()=>{const facts=inspectOriginalLocalExecutionInventoryFrom(store.db);assert.equal(facts.occupied,1);assert.equal(facts.remaining,facts.worker_cap-1);}));
 }finally{f.close();}
});

test('startup detects existing live supervisor rather than duplicating it; stop fences queue grants',()=>{
 const f=fixture();try{
  const t=f.submit('stopped');claimSupervisor(f.root,f.start.instance_id);let launches=0;
  assert.equal(ensureSupervisor(f.root,{launch:()=>{launches++;return child();}}).started,false);assert.equal(launches,0);
  runtimeAction({...f.args,epoch:1,action:'stop',source_instruction:'Stop the fictional supervisor.'},host);
  assert.throws(()=>queue(f.root,t.id),/disabled|stopped/);
  assert.throws(()=>runtimeAction({...f.args,epoch:0,action:'start',source_instruction:'stale'},host),/does not own/);
 }finally{f.close();}
});

test('public tools expose bounded task/runtime contracts and reject unrecognized authority arguments',async()=>{
 const names=toolListFor().map(t=>t.name);assert(names.includes('company_tasks'));assert(names.includes('company_runtime'));
 await assert.rejects(call('company_tasks',{root:'/private/tmp',session_id:'fixture',action:'inspect',runtime_authority:true},host),/Unknown argument/);
 for(const action of ['message','dispose'])assert.throws(()=>taskAction({action,root:'/private/tmp',session_id:'fixture'},host),/source_instruction/,'every new public mutation needs its actual source instruction');
});

test('background reconciliation catches a crash after queue commit even while runtime is stopped',()=>{
 const f=fixture();try{
  const t=f.submit('orphan'),j=queue(f.root,t.id);
  withStore(f.root,db=>db.transaction('fixture.orphan',s=>{s.jobs[j.job_id].created_at=new Date(Date.now()-600000).toISOString();return s;}));
  runtimeAction({...f.args,epoch:1,action:'stop',source_instruction:'Stop and inspect the fictional orphan.'},host);
  const r=runtimeAction({...f.args,epoch:1,action:'reconcile'},host);assert.equal(r.dispatched.length,0);
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
  const evidence=engine.save({...f.args,epoch:1,kind:'artifact',id:'source',content:'Fictional exact source text.'},host);
  const value=f.read().records.source,hash=digest(JSON.stringify(value));
  const t=f.submit('read',{evidence_ids:['source']}),j=queue(f.root,t.id);let calls=0;
  await work(f.root,j.job_id,async(_h,native,_prompt,_dir,limit,_selection,o)=>{
    if(calls++===0){return {native_id:'fictional-read-native',text:JSON.stringify({reads:[{id:'source',sha256:hash,offset:0,length:32}]})};}
    assert.equal(native,'fictional-read-native');assert.match(_prompt,/record-reads-v1/);return {native_id:native,text:JSON.stringify({content:'The exact delivered source was inspected.',messages:[],notices:[]})};
  });
  const result=f.read().jobs[j.job_id];assert.equal(calls,2);assert.equal(result.status,'completed');assert.equal(result.retrieved_inputs[0].sha256,hash);assert.equal(result.runtime_context_usage.rounds,2);assert(result.runtime_context_usage.visible_wire_bytes<=result.runtime_context_usage.budget_bytes);
 }finally{f.close();}
});

test('format7 Original adapter rejects changed native identity on retrieval and preserves the rejected return',async()=>{
 const f=fixture();try{
  engine.save({...f.args,epoch:1,kind:'artifact',id:'source',content:'Fictional exact source.'},host);const hash=digest(JSON.stringify(f.read().records.source));
  const t=f.submit('wrong-read',{evidence_ids:['source']}),j=queue(f.root,t.id);let calls=0;
  await work(f.root,j.job_id,async(_h,native,_p,_d,limit,_s,o)=>{if(calls++===0){return {native_id:'fictional-read-a',text:JSON.stringify({reads:[{id:'source',sha256:hash,offset:0,length:16}]})};}return {native_id:'fictional-read-b',text:JSON.stringify({content:'This is the wrong native.',messages:[],notices:[]})};});
  const s=f.read(),job=s.jobs[j.job_id];assert.equal(calls,2);assert.equal(job.status,'failed');
  assert.equal(job.error,host==='codex'?'Codex resumed thread identity changed':'Claude resumed session identity changed');
  assert.equal(job.native_id,'fictional-read-b');assert.equal(job.rejected_output.text,JSON.stringify({content:'This is the wrong native.',messages:[],notices:[]}));assert(!job.artifact_id);
 }finally{f.close();}
});

test('cumulative multibyte and escaped retrieval history Holds before another oversized native call',async()=>{
 const f=fixture();try{
  engine.save({...f.args,epoch:1,kind:'artifact',id:'source',content:'"\\é'.repeat(1800)},host);const hash=digest(JSON.stringify(f.read().records.source));
  const t=f.submit('budget-read',{evidence_ids:['source']}),j=queue(f.root,t.id);let calls=0;
  await work(f.root,j.job_id,async(_h,native,_p,_d,limit,_s,o)=>{calls++;return {native_id:native??'fictional-budget-read',text:JSON.stringify({reads:[{id:'source',sha256:hash,offset:0,length:6000}]})};});
  const job=f.read().jobs[j.job_id];assert.equal(job.status,'failed');assert.match(job.error,/wire budget/);assert(calls>1&&calls<16);assert(job.rejected_output);assert.equal(job.coordination_release.termination_confirmed,true);
 }finally{f.close();}
});

test('fatal supervisor validation is durable and suppresses automatic restart churn',async()=>{
 const f=fixture();try{
  const t=f.submit('corrupt-index');
  withStore(f.root,db=>db.db.prepare("UPDATE async_task_index SET state='cancelled' WHERE id=?").run(t.id));
  const result=await supervise(f.root,f.start.instance_id,{poll_ms:1});assert.equal(result.stopped,true);assert.match(result.reason,/index/i);
  let spawns=0;assert.equal(ensureSupervisor(f.root,{launch:()=>{spawns++;return child();}}).started,false);assert.equal(spawns,0);
  const status=runtimeAction({...f.args,action:'status'},host);assert.equal(status.state,'needs_attention');assert.equal(status.complete,false);assert.match(status.error,/index/i);
  assert(f.read().notices.some(n=>n.reference==='async-runtime-control'));
 }finally{f.close();}
});

test('superseded supervisor generation cannot dispatch through a newly started runtime principal',()=>{
 const f=fixture();try{
  const t=f.submit('old-supervisor');claimSupervisor(f.root,f.start.instance_id);
  runtimeAction({...f.args,epoch:1,action:'stop',source_instruction:'Replace only the fictional supervisor.'},host);
  const restarted=runtimeAction({...f.args,epoch:1,action:'start',source_instruction:'Start the replacement fictional supervisor.'},host,{launch:child});
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
  await work(f.root,jq.job_id,async(_h,_n,_p,_d,limit,_s,o)=>{return {native_id:'fictional-rule-reviewer',text:JSON.stringify({content:'This fictional candidate passes the prior current criterion.',review:{verdict:'Pass',reason:'The exact supplied criterion was met.'},messages:[],notices:[]})};});
  assert.equal(f.read().jobs[jq.job_id].status,'completed');
  engine.save({...f.args,epoch:1,kind:'decision',content:'New applicable rule: this finding is not sufficient for current acceptance.'},host);
  tickRuntime(f.root,{dispatch:false});const state=f.read();assert.equal(state.records[q.id].runtime_task.state,'needs_attention');assert.match(state.records[q.id].runtime_task.attention,/context changed/);
  for(let n=0;n<3;n++)tickRuntime(f.root,{queue:()=>assert.fail('A held result cannot create another attempt')});
  const idle=f.read();assert.deepEqual(idle.records[q.id],state.records[q.id]);assert.deepEqual(idle.notices,state.notices);assert.equal(idle.revision,state.revision,'Idle held ticks create no canonical writes');
 }finally{f.close();}
});

test('negative review recovery is independent of task index order and remains stable on idle ticks',async()=>{
 const orders=[['a','qa','b'],['a','b','qa'],['qa','a','b'],['qa','b','a'],['b','a','qa'],['b','qa','a']];
 for(const verdict of ['Fail','Blocked'])for(const order of orders){
  const f=fixture();try{
   const state=f.read(),operations=['order-0','order-1','order-2'].map(operation=>({operation,id:'async-task-'+digest(JSON.stringify([state.id,state.owner.epoch,operation])).slice(0,32)})).sort((a,b)=>a.id.localeCompare(b.id));
   const named=Object.fromEntries(order.map((name,n)=>[name,operations[n].operation]));
   const a=f.submit(named.a,{role:'engineer'}),qa=f.submit(named.qa,{role:'qa',review_task_id:a.id}),b=f.submit(named.b,{role:'pm',depends_on:[{task_id:qa.id,gate:'accepted'}]});
   assert.deepEqual(Object.entries({a,qa,b}).sort(([,a],[,b])=>a.id.localeCompare(b.id)).map(([name])=>name),order);
   const aj=queue(f.root,a.id);await work(f.root,aj.job_id,model('fictional-order-author'));
   const qj=queue(f.root,qa.id);await work(f.root,qj.job_id,async(_h,_n,_p,_d,limit,_s,o)=>{
    return {native_id:'fictional-order-independent-qa',text:JSON.stringify({content:'Retained exact negative finding.',review:{verdict,reason:'Required evidence is absent.',blockers:['Missing exact evidence']},messages:[],notices:[]})};
   });
   tickRuntime(f.root,{dispatch:false});const held=f.read(),label=verdict+' '+order.join(',');
   for(const task of [qa,b]){assert.equal(held.records[task.id].runtime_task.state,'needs_attention',label);assert.equal(held.records[task.id].runtime_task.attention_code,'REVIEW_HELD',label);}
   assert.equal(held.records[b.id].runtime_task.attempts.length,0);
   assert.equal(held.records[held.jobs[qj.job_id].artifact_id].review.verdict,verdict);
   for(let n=0;n<3;n++)tickRuntime(f.root,{queue:()=>assert.fail('Negative review cannot dispatch a dependent')});
   const idle=f.read();for(const task of [a,qa,b])assert.deepEqual(idle.records[task.id],held.records[task.id],label);
   assert.deepEqual(idle.notices,held.notices,label);assert.equal(idle.revision,held.revision,label);assert.deepEqual(idle.jobs,held.jobs,label);
  }finally{f.close();}
 }
});

test('peer handoff is delivered to the declared receiver and acknowledged atomically with its actual result',async()=>{
 const f=fixture();try{
  const a=f.submit('peer-author',{role:'research'}),b=f.submit('peer-receiver',{role:'engineer',depends_on:[{task_id:a.id,gate:'output'}]});
  const amended=taskAction({...f.args,epoch:1,action:'amend',task_id:a.id,expected_definition_revision:1,operation_id:'declare-peer',source_instruction:'Route this fictional handoff only to the named receiver.',spec:{...f.read().records[a.id].runtime_task.spec,peer_task_ids:[b.id]}},host,{wake:()=>({started:false})});
  assert.equal(amended.definition_revision,2);
  const ja=queue(f.root,a.id);await work(f.root,ja.job_id,async(_h,_n,prompt,_d,limit,_s,o)=>{assert.match(prompt,new RegExp(b.id));return {native_id:'fictional-peer-author',text:JSON.stringify({content:'Fictional producer evidence.',messages:[{to:'engineer',to_task_id:b.id,content:'Required fictional qualifier: retain the source uncertainty.'}],notices:[]})};});
  tickRuntime(f.root,{dispatch:false});
  const inbox=taskAction({...f.args,action:'inbox',task_id:b.id},host);assert.equal(inbox.total,1);assert.equal(inbox.items[0].content_complete,false);
  const messageId=inbox.items[0].id,jb=queue(f.root,b.id);
  await work(f.root,jb.job_id,async(_h,_n,prompt,_d,limit,_s,o)=>{assert.match(prompt,/Required fictional qualifier/);return {native_id:'fictional-peer-receiver',text:JSON.stringify({content:'The fictional result preserves the source uncertainty.',messages:[],notices:[],message_dispositions:[{message_id:messageId,disposition:'The result explicitly preserves the supplied uncertainty.'}]})};});
  tickRuntime(f.root,{dispatch:false});const state=f.read();assert.equal(state.records[messageId].runtime_message.state,'processed');assert.equal(state.records[messageId].runtime_message.disposition.by,'worker');assert.equal(state.records[b.id].runtime_task.state,'returned');
 }finally{f.close();}
});

test('an interrupted exact attempt retains its late native response and full negative original without acceptance',async()=>{
 const f=fixture();let release,running;
 try{
  const t=f.submit('late-interrupted'),j=queue(f.root,t.id);
  const reason='NEVER RETRY: observed effects remain uncertain. '.repeat(3000);
  const wire=JSON.stringify({content:'Late observation only.',review:{verdict:'Blocked',reason},messages:[],notices:[]});
  running=work(f.root,j.job_id,async(_h,_n,_p,_d,limit,_s,o)=>{return new Promise(resolve=>release=()=>resolve({native_id:'fictional-late-interrupted',text:wire}));});
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
  await work(f.root,jb.job_id,async(_h,_n,prompt,_d,limit,_s,o)=>{assert.match(prompt,/Exact retained terminal producer content/);return {native_id:'fictional-explicit-output-consumer',text:JSON.stringify({content:'The exact retained producer evidence was read.',messages:[],notices:[]})};});
  tickRuntime(f.root,{dispatch:false});assert.equal(f.read().records[b.id].runtime_task.state,'returned');assert.equal(Object.keys(f.read().jobs).length,2);
 }finally{f.close();}
});


test('restore preserves accepted exact evidence, a queued obligation and an unprocessed peer message',async()=>{
 const f=fixture(),transfer=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-async-restore-')));
 try{
  const a=f.submit('restore-producer',{role:'engineer'}),qa=f.submit('restore-qa',{role:'qa',review_task_id:a.id});
  const b=f.submit('restore-receiver',{role:'research',resources:['fictional/shared-resource'],depends_on:[{task_id:qa.id,gate:'accepted'}]});
  const msg=taskAction({...f.args,epoch:1,action:'message',operation_id:'restore-pending-message',source_instruction:'Preserve this fictional uncertainty for the receiver.',to_task_id:b.id,content:'Unresolved fictional qualifier: no permission for external effects.'},host,{wake:()=>({started:false})});
  const ja=queue(f.root,a.id);await work(f.root,ja.job_id,model('fictional-restore-producer'));
  const jq=queue(f.root,qa.id);await work(f.root,jq.job_id,async(_h,_n,_p,_d,limit,_s,o)=>{
   return {native_id:'fictional-restore-independent-qa',text:JSON.stringify({content:'Fictional independent review only.',review:{verdict:'Pass',reason:'Exact fictional producer meets the stated requirement.'},messages:[],notices:[]})};
  });
  tickRuntime(f.root,{dispatch:false});assert.equal(f.read().records[qa.id].runtime_task.state,'accepted');
  const jb=queue(f.root,b.id),before=f.read(),backup=path.join(transfer,'backup'),restored=path.join(transfer,'restored');
  withStore(f.root,db=>backupCompany(db,backup));const receipt=restoreCompany(backup,restored);
  assert.equal(receipt.ownership_transferred,false);
  const after=withStore(restored,db=>db.read());assert.deepEqual(after,before);
  assert.equal(after.records[qa.id].runtime_task.state,'accepted');
  assert.equal(after.records[after.jobs[jq.job_id].artifact_id].review.verdict,'Pass');
  assert.equal(after.jobs[jq.job_id].review_of.id,after.jobs[ja.job_id].artifact_id);
  assert.equal(after.records[b.id].runtime_task.state,'queued');
  assert.equal(after.records[b.id].runtime_task.attempts[0].job_id,jb.job_id);
  assert.equal(after.jobs[jb.job_id].artifact_id,undefined);
  assert(resourceClaims(after).some(c=>c.job_id===jb.job_id));
  assert.equal(after.records[msg.id].runtime_message.state,'pending');
  assert.equal(after.records[msg.id].runtime_message.disposition,null);
  assert.deepEqual(after.owner,before.owner);assert.deepEqual(Object.keys(after.jobs),Object.keys(before.jobs));
 }finally{f.close();fs.rmSync(transfer,{recursive:true,force:true});}
});

test('real context overflow holds before any execution and never retries',()=>{
 const f=fixture();try{
  const t=f.submit('context-capacity');
  engine.save({...f.args,epoch:1,id:'oversize-unknown',kind:'artifact',content:'保留未知限制😀'.repeat(6000)},host);
  const before=f.read();let calls=0,launches=0,error;
  const queue=(root,key)=>{calls++;try{return engine.queueRuntimeTask(root,key,{check:ready,launch:()=>{launches++;return child();}});}catch(e){error=e;throw e;}};
  tickRuntime(f.root,{queue});const s=f.read(),r=s.records[t.id].runtime_task;
  assert.equal(r.state,'needs_attention');assert.equal(r.attention_code,'CONTEXT_CAPACITY');assert.equal(r.attention,error.message);
  const m=/^Task context Held: required coherent packet exceeds 65536 UTF-8bytes \(actual (\d+)\); coverage incomplete; widen retrieval or split the task; nothing was truncated$/.exec(r.attention);
  assert(m);assert(Number(m[1])>65536);assert.equal(r.attempts.length,0);
  assert.deepEqual(s.jobs,before.jobs);assert.deepEqual(Object.keys(s.sessions),Object.keys(before.sessions));assert.equal(resourceClaims(s).length,0);
  for(const action of ['checkpoint','inspect']){const v=taskAction({...f.args,action,task_id:t.id},host),x=action==='checkpoint'?v.recovery:v.tasks[0].recovery;assert.deepEqual([x.code,x.owner,x.automatic,x.retry_execution],['CONTEXT_CAPACITY','cos',false,false]);}
  tickRuntime(f.root,{queue});const last=f.read();assert.deepEqual([calls,launches],[1,0]);
  for(const key of ['jobs','sessions','notices'])assert.deepEqual(last[key],s[key]);
  assert.deepEqual(last.records,s.records);
 }finally{f.close();}
});

test('scheduler retries only typed pre-execution waits and retains misleading unknown failures',async()=>{
 const {SchedulingHold}=await import('../plugins/soloco/runtime/recovery.mjs');
 const f=fixture();
 try{
  const t=f.submit('typed-wait');
  tickRuntime(f.root,{queue:()=>{throw new SchedulingHold('CAPACITY_BUSY','Completely different display wording');}});
  assert.equal(f.read().records[t.id].runtime_task.state,'planned');
  tickRuntime(f.root,{queue:()=>{throw Error('capacity reserved already active: an unknown integrity failure');}});
  const state=f.read();assert.equal(state.records[t.id].runtime_task.state,'needs_attention');
  assert.equal(state.records[t.id].runtime_task.attention_code,'UNKNOWN');
  assert.equal(state.records[t.id].runtime_task.attempts.length,0);
  const page=taskAction({...f.args,action:'inspect',task_id:t.id},host);
  assert.equal(page.tasks[0].recovery.automatic,false);
  assert.equal(page.tasks[0].recovery.retry_execution,false);
 }finally{f.close();}
});

test('unstarted dependents expose an actionable wait without claiming an attempt',()=>{
 const f=fixture();
 try{const a=f.submit('pending-producer'),b=f.submit('pending-review',{role:'qa',review_task_id:a.id});
  const page=taskAction({...f.args,action:'inspect',task_id:b.id},host);
  assert.equal(page.tasks[0].readiness.ready,false);assert.equal(page.tasks[0].readiness.recovery.code,'DEPENDENCY_PENDING');assert.equal(page.tasks[0].readiness.recovery.automatic,true);assert.equal(page.tasks[0].attempts.length,0);
 }finally{f.close();}
});

test('nonautomatic readiness holds persist even after the original evidence is restored',()=>{
 const f=fixture();try{
  engine.save({...f.args,epoch:1,id:'fixed-input',kind:'artifact',content:'Original evidence'},host);
  const t=f.submit('readiness-integrity',{input_ids:['fixed-input']});
  const original=f.read().records['fixed-input'];
  withStore(f.root,db=>db.transaction('fixture.changed',s=>{s.records['fixed-input'].content='Changed source';s.records['fixed-input'].revision++;return s;}));
  let calls=0;tickRuntime(f.root,{queue:()=>{calls++;return {};}});assert.equal(calls,0,'held task must not dispatch');
  assert.equal(f.read().records[t.id].runtime_task.state,'needs_attention');
  assert.equal(f.read().records[t.id].runtime_task.attention_code,'CONTEXT_CHANGED');
  withStore(f.root,db=>db.transaction('fixture.restored',s=>{s.records['fixed-input']=original;return s;}));
  tickRuntime(f.root,{queue:()=>{calls++;return {};}});assert.equal(calls,0,'restoration alone cannot reconcile a held task');
  assert.equal(f.read().records[t.id].runtime_task.attempts.length,0);
 }finally{f.close();}
});

test('two simultaneously ready resource claimants preserve the unstarted wait at queue revalidation',async()=>{
 const f=fixture();try{
  const tasks=[f.submit('shared-a',{resources:['fixture/shared']}),f.submit('shared-b',{resources:['fixture/shared']})];
  const first=tickRuntime(f.root,{queue:(root,key)=>queue(root,key)});
  assert.equal(first.ready.length,2);assert.equal(first.dispatched.length,1);
  const waiting=tasks.find(t=>f.read().records[t.id].runtime_task.state==='planned');assert(waiting);
  assert.equal(f.read().records[waiting.id].runtime_task.attempts.length,0);
  await work(f.root,first.dispatched[0].job_id,model('fictional-shared-first'));
  const next=tickRuntime(f.root,{queue:(root,key)=>queue(root,key)});
  assert.equal(next.dispatched.length,1);assert.equal(f.read().records[waiting.id].runtime_task.state,'queued');
 }finally{f.close();}
});

}
