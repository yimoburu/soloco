// Independently authored SYNTHETIC source lifecycle witnesses. No native/provider
// execution, real company data, adoption or whole-company fit is established.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import net from 'node:net';
import timers from 'node:timers';
import {syncBuiltinESMExports} from 'node:module';

async function withoutExternal(fn,{workerMonitor=false}={}){
  const undo=[],attempts=[],monitors=new Set();
  const deny=(object,key)=>{const previous=object[key];object[key]=()=>{attempts.push(key);throw Error('Unexpected external execution: '+key);};undo.push(()=>{object[key]=previous;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(cp,key);
  for(const key of ['connect','createConnection','createServer'])deny(net,key);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(globalThis,'fetch');deny(timers,'setInterval');
  if(workerMonitor){const interval=globalThis.setInterval,clear=globalThis.clearInterval;globalThis.setInterval=(fn,delay,...args)=>{assert.equal(delay,100,'Only the existing worker eligibility monitor is permitted');const timer=interval(fn,delay,...args);monitors.add(timer);return timer;};globalThis.clearInterval=timer=>{monitors.delete(timer);return clear(timer);};undo.push(()=>{globalThis.setInterval=interval;globalThis.clearInterval=clear;});}
  else deny(globalThis,'setInterval');
  syncBuiltinESMExports();
  try{return await fn();}finally{const leaked=monitors.size;for(const timer of monitors)clearInterval(timer);for(const restore of undo.reverse())restore();syncBuiltinESMExports();assert.equal(leaked,0,'All worker monitors must close before return');assert.deepEqual(attempts,[],'No CLI, provider, network or supervisor launch is permitted');}
}
const [store,tasks,authority,index,engine,main,worker,timeout,context,current,scoped,snapshot,assignment]=await withoutExternal(()=>Promise.all([
  import('../plugins/soloco/runtime/store.mjs'),import('../plugins/soloco/runtime/tasks.mjs'),import('../plugins/soloco/runtime/task-runtime-authority.mjs'),import('../plugins/soloco/runtime/task-index.mjs'),
  import('../plugins/soloco/runtime/engine.mjs'),import('../plugins/soloco/runtime/main.mjs'),import('../plugins/soloco/runtime/worker.mjs'),import('../plugins/soloco/runtime/timeout.mjs'),
  import('../plugins/soloco/runtime/task-context.mjs'),import('../plugins/soloco/runtime/current-state.mjs'),import('../plugins/soloco/runtime/scoped-context.mjs'),import('../plugins/soloco/runtime/snapshot.mjs'),import('../plugins/soloco/runtime/context.mjs')
]));
const {Store,SCHEMA,VERSION,digest,teamHash}=store,sha=value=>digest(JSON.stringify(value)),bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value));
const owner={host:'codex',session_id:'synthetic-scoped-lifecycle-owner',epoch:1};
const sourceInstruction='SYNTHETIC bounded preparation only. Preserve UNKNOWN, ZERO allowance and NO RETRY. No execution authority.';
const common={session_id:owner.session_id,epoch:1,source_instruction:sourceInstruction};
const MARKER='LIFECYCLE_NEGATIVE_UNKNOWN_ZERO_NO_RETRY';
const dependency='GLOBAL DEPENDENCY: no export or retry while the original effect is UNKNOWN; remaining allowance stays ZERO.';
const project=notice=>Object.fromEntries(Object.entries(notice).filter(([key])=>!['deliveries','seen_at'].includes(key)));
const ref=(value,id=value.id)=>({id,revision:value.revision??null,sha256:sha(value)});
const read=f=>f.db.read();
function recordSpawn(ceiling,options){const start=Date.now(),remaining=Math.min(ceiling,options.executionDeadlineAt?options.executionDeadlineAt-start:ceiling);options.onSpawn?.(timeout.executionTiming(start,{timeout_ms:remaining,timeout_reason:options.timeoutReason}));}
function fixture(t){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-notice-lifecycle-'))),root=path.join(directory,'attached'),data=path.join(directory,'plugin-data');fs.mkdirSync(root);fs.mkdirSync(data);
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
  const charter={name:'Synthetic Engineer',mission:'Preserve exact conditions',inputs:'Supplied evidence only',outputs:'Unaccepted assessment',block:'Missing evidence',success:'Complete handoff',failure:'Omitted conditions',phase:'Preparation'};
  const notice={id:'lifecycle-notice',kind:'must_know',summary:MARKER+': original failure remains UNKNOWN; allowance ZERO; no retry.',reference:'fictional-unconfirmed-event',author_role:'qa',author_instance:'synthetic-historical-qa',created_at:'2026-11-12T00:00:00.000Z',resolution:null,deliveries:[],seen_at:null,uncertain_effect:'Physical closure UNKNOWN'};
  const s={schema:SCHEMA,id:'synthetic-notice-lifecycle',name:'Synthetic scoped task lifecycle',idea:'Exercise real source queue and binding',runtime_version:VERSION,plugin_version:VERSION,paused:false,mode:'preparation',phase:'Frame',owner:{...owner},governance:'SYNTHETIC preparation only. UNKNOWN remains; ZERO allowance; no retry.',cos_instructions:'Do not infer authority or physical closure from source fixture results.',roles:{engineer:charter,qa:{...charter,name:'Synthetic independent QA'}},records:{},jobs:{},sessions:{},messages:[],notices:[notice],created_at:'2026-11-12T00:00:00.000Z'};
  s.governance_sha256=digest(s.governance);s.team_sha256=teamHash(s);
  // All applicable homes, dependencies, governing context and runtime control
  // exist before any qualification. There is no later home-completion rewrite.
  s.records.input={id:'input',revision:1,kind:'artifact',content:'Stable exact fictional engineering input.'};
  s.records['governing-rule']={id:'governing-rule',revision:1,kind:'decision',content:dependency};
  s.records['notice-home']={id:'notice-home',revision:1,kind:'artifact',content:JSON.stringify(project(notice)),context_obligations:{version:1,scope:'*'}};
  s.records['notice-dependency']={id:'notice-dependency',revision:1,kind:'artifact',content:dependency,context_obligations:{version:1,scope:'*'}};
  authority.setRuntimeControl(s,{...common,action:'start'},'codex');
  const db=new Store(root,true);db.transaction('synthetic.lifecycle.seed',()=>s);db.migrate();index.installTaskIndex(db);
  const bindings=path.join(data,'bindings');fs.mkdirSync(bindings);fs.writeFileSync(path.join(bindings,digest(JSON.stringify([root,'codex',owner.session_id]))+'.json'),JSON.stringify({root,host:'codex',session_id:owner.session_id}));
  let closed=false;const close=()=>{if(closed)return;closed=true;db.close();if(process.env.COMPANY_PLUGIN_DATA===data){if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;}fs.rmSync(directory,{recursive:true,force:true});};t.after(close);
  return {root,db,close,notice,meaning:JSON.stringify(project(notice))};
}
const sourceCall=(f,input)=>main.call('company_context',{root:f.root,...common,...input},'codex');
function judgment(p,meaning){
  const reason='SYNTHETIC exact fixture semantics and dependency closure; no native QA or authority.',shape=p.response_shape;
  const result={protocol:scoped.SCOPED_PROTOCOL,phase:p.phase,extraction_identity:p.extraction_identity,target_sha256:shape.target_sha256,verdict:'Pass',reason,permitted_action:p.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
  if(p.phase==='extract'){
    const bundle=p.reviewed_unit_bundle,items=bundle.primary.fragment.text.includes(MARKER)?[{id:'notice-meaning',kind:'negative_finding',text:meaning,scope:'*',provenance:bundle.provenance_sha256,interfaces:[{id:'global-dependency',with_scope:'*',text:dependency}]}]:[];
    Object.assign(result,{unit_id:bundle.primary.id,unit_sha256:sha(bundle.primary),reviewed_unit_bundle_sha256:sha(bundle),items});
  }else if(p.phase==='applicability'){
    const items=p.extractions.flatMap(e=>e.items.map(item=>({key:e.review.id+'/'+item.id,item}))).filter(item=>p.item_keys.includes(item.key));
    result.summary='Complete original notice meaning and stable global dependency remain UNKNOWN/ZERO/NO RETRY.';
    result.mappings=items.map(({key,item})=>({item:key,status:'represented',homes:p.homes.filter(h=>h.value.content.includes(item.text)).map(h=>h.source.id),reason:'Exact whole notice meaning retained; no permission.'}));assert(result.mappings.every(value=>value.homes.length));
    const delivered=[...p.homes,...p.dependencies];assert(delivered.some(entry=>entry.source.id==='notice-home'&&entry.value.content===meaning));assert(delivered.some(entry=>entry.source.id==='notice-dependency'&&entry.value.content===dependency));
    result.interfaces=p.interface_keys.length?[]:items.flatMap(({key,item})=>item.interfaces.map(value=>({key:key+'/'+value.id,item:key,scope:item.scope,...value})));result.reviewed_interfaces=p.interface_keys;
  }else{result.summary='All exact domain and independent interface receipts retain UNKNOWN, zero allowance and no retry.';result.domain_review_ids=shape.domain_review_ids;result.interface_review_ids=shape.interface_review_ids;result.unreviewed_interfaces=[];}
  return {content:reason,messages:[],notices:[],review:{verdict:result.verdict,reason,permitted_action:result.permitted_action},qualification_result:result};
}
async function scriptedReview(f,planId,input){
  const target=await sourceCall(f,{action:'target',plan_id:planId,...input});assert.notEqual(target.reused,true);
  const queued=engine.dispatch({root:f.root,...common,role:'qa',review_of:target.id,task:'SYNTHETIC exact notice and global dependency review.'},'codex',{check:()=>({available:true,authenticated:true,version:'synthetic-source-adapter'}),launch:()=>({on(){},unref(){}})});
  await worker.work(f.root,queued.id,async(_host,_native,prompt,_directory,ceiling,_selection,options)=>{recordSpawn(ceiling,options);return {native_id:'synthetic-independent-'+queued.id,text:JSON.stringify(judgment(JSON.parse(prompt),f.meaning))};});
  const s=read(f),job=s.jobs[queued.id];assert.equal(job.status,'completed',job.error);assert.equal(job.coordination_release.termination_confirmed,true);return {target,job,record:s.records[job.artifact_id]};
}
async function qualifiedFixture(t){
  const f=fixture(t),initial=read(f);assert(!Object.values(initial.records).some(record=>record.runtime_task));
  const plan=await sourceCall(f,{action:'plan',protocol:scoped.SCOPED_PROTOCOL,source_id:'notice:lifecycle-notice'}),extractions=[];let offset=0;
  do{const page=await sourceCall(f,{action:'inspect',plan_id:plan.id,offset,limit:16});for(const unit of page.units)extractions.push(await scriptedReview(f,plan.id,{phase:'extract',unit_id:unit.id}));offset=page.next_offset;}while(offset!==null);
  assert(extractions.some(value=>value.record.qualification_result.items.some(item=>item.kind==='negative_finding'&&item.text===f.meaning)));
  const closure={extraction_review_ids:extractions.map(value=>value.record.id),counterpart_ids:['notice-home'],dependency_ids:['notice-dependency'],context_scope:'*'};
  const domain=await scriptedReview(f,plan.id,{phase:'applicability',...closure}),interfaceKeys=domain.record.qualification_result.interfaces.map(value=>value.key);assert(interfaceKeys.length>0);
  const interfaces=await scriptedReview(f,plan.id,{phase:'applicability',...closure,interface_keys:interfaceKeys});
  const integrated=await scriptedReview(f,plan.id,{phase:'integration',domain_review_ids:[domain.record.id],interface_review_ids:[interfaces.record.id],counterpart_ids:['notice-home'],dependency_ids:['notice-dependency']});
  const applied=await sourceCall(f,{action:'apply',integration_review_id:integrated.record.id});assert.equal(applied.applied,true);
  const s=read(f);assert(!Object.values(s.records).some(record=>record.runtime_task),'All planned classifications finish before a task exists');
  f.planId=plan.id;f.classification=structuredClone(s.context_classifications['notice:lifecycle-notice']);f.classificationsBytes=JSON.stringify(s.context_classifications);f.canonicalNotices=JSON.stringify(s.notices);
  assert.equal(current.projectedNoticeContext(s).representations.length,1);return f;
}
function submit(f){
  let record;f.db.transaction('task.submitted',s=>{record=tasks.submitTask(s,{...common,operation_id:'after-complete-scoped-preservation',spec:{role:'engineer',task:'Prepare a source-linked fictional assessment preserving the complete notice and global dependency.',acceptance:'Retain UNKNOWN, ZERO allowance and no retry; no execution or acceptance authority.',expected_deliverable:'An unaccepted fictional assessment',input_ids:['input','notice-home','notice-dependency'],context_scope:'auth',context_protocol:'async-task-context-v2',model_selection:{mode:'default',reason:'SYNTHETIC source callback; no provider.'},timeout_ms:30000,timeout_reason:'Bounded source fixture only.'}},'codex');return s;},{afterWrite:index.updateTaskIndex});return record.id;
}
function queue(f,id){
  let launches=0;const result=engine.queueRuntimeTask(f.root,id,{check:()=>({available:true,authenticated:true,version:'synthetic-source-adapter'}),catalog:()=>assert.fail('Default source task must not probe a model catalog'),launch:(root,jobId)=>{assert.equal(root,f.root);assert.equal(typeof jobId,'string');launches++;return {on(){},unref(){}};}});assert.equal(launches,1);return result;
}
function assertFullPacket(f,s,packet){
  assert.equal(packet.protocol,'async-task-context-v2');assert.deepEqual(packet.notices,[]);assert.equal(packet.notice_representations.length,1);
  const representation=packet.notice_representations[0];assert.deepEqual(representation.source,ref(project(f.notice),'notice:lifecycle-notice'));assert.equal(representation.occurrence.notice_id,f.notice.id);
  assert.deepEqual(representation.provenance.qualification,s.context_classifications['notice:lifecycle-notice'].scoped_qualification);assert.deepEqual(snapshot.resolveSnapshot(s,representation.provenance.original),f.notice);
  const delivered=[...packet.records,...packet.mandatory_execution_evidence];
  for(const source of representation.homes){const entry=delivered.find(value=>value.source.id===source.id);assert(entry,'Every exact notice home must be in the same packet');assert.deepEqual(entry.source,source);assert.equal(sha(entry.value),source.sha256);}
  for(const id of ['input','notice-home','notice-dependency','governing-rule']){const entry=delivered.find(value=>value.source.id===id);assert(entry,'Missing exact current source '+id);assert.deepEqual(entry.source,ref(s.records[id]));assert.deepEqual(entry.value,s.records[id]);}
  assert.equal(delivered.find(value=>value.source.id==='notice-home').value.content,f.meaning);assert.equal(delivered.find(value=>value.source.id==='notice-dependency').value.content,dependency);
  assert.equal(JSON.stringify(s.context_classifications),f.classificationsBytes);assert.equal(JSON.stringify(s.notices),f.canonicalNotices);
}
function queuedState(f,id,q){
  const s=read(f),task=s.records[id].runtime_task,job=s.jobs[q.job_id];assert.equal(task.state,'queued');assert.equal(task.attempts.length,1);assert.equal(task.attempts[0].job_id,q.job_id);assert.equal(task.attempts[0].instance_id,q.instance_id);assert.equal(job.context_format,8);assert.deepEqual(job.runtime_task,context.taskDefinitionBinding(s.records[id]));
  const fresh=context.taskAssignmentContext(s,job);assert.equal(fresh.hash,job.context_sha256,'The pre-bind context must remain current after the real bind');assert.equal(context.taskContextMatches(s,job,job.context_sha256),true);assert.equal(assignment.contextBudgetForJob(s,job),65536);assert.equal(fresh.context_budget_bytes,65536);
  assertFullPacket(f,s,JSON.parse(fresh.text));assert.equal(current.projectedNoticeContext(s).representations.length,1);return {s,job,context:fresh};
}

test('genuine scoped preservation survives submit, real queue/bind and actual source worker delivery',async t=>{
  await withoutExternal(async()=>{
    const f=await qualifiedFixture(t),id=submit(f),submitted=read(f);assert.deepEqual(submitted.records[id].runtime_task.attempts,[]);assert.equal(current.projectedNoticeContext(submitted).representations.length,1,'The exact proof must still be current after real submission');
    const q=queue(f,id),bound=queuedState(f,id,q);let callbacks=0,promptBytes=0,responseBytes=0;
    await worker.work(f.root,q.job_id,async(_host,_native,prompt,_directory,ceiling,_selection,options)=>{
      callbacks++;promptBytes=bytes(prompt);assert(prompt.includes(bound.context.text),'Actual worker prompt must deliver the complete bound packet');assert(promptBytes+2048<=65536,'The complete prompt must retain the existing response reserve');
      const start=prompt.indexOf(bound.context.text),delivered=JSON.parse(prompt.slice(start,start+bound.context.text.length));assertFullPacket(f,read(f),delivered);assert.equal(delivered.assignment.job_id,q.job_id);
      recordSpawn(ceiling,options);const text=JSON.stringify({content:'SYNTHETIC unaccepted assessment: UNKNOWN remains; allowance ZERO; no retry. '+dependency,messages:[],notices:[],message_dispositions:[]});responseBytes=bytes(text);return {native_id:'synthetic-task-'+q.job_id,text};
    });
    f.db.transaction('task.reconciled',s=>{tasks.reconcileTask(s,s.records[id]);return s;},{afterWrite:index.updateTaskIndex});
    const s=read(f),job=s.jobs[q.job_id];assert.equal(callbacks,1);assert.equal(job.status,'completed',job.error);assert.equal(job.coordination_release.termination_confirmed,true);assert.equal(s.records[id].runtime_task.attempts.length,1);assert.equal(s.records[id].runtime_task.state,'returned','Existing runtime reconciliation returns the artifact without receiver acceptance');
    const usage=job.runtime_context_usage;assert.equal(usage.budget_bytes,65536);assert.equal(usage.context_utf8_bytes,bound.context.context_bytes);assert.equal(usage.initial_prompt_utf8_bytes,promptBytes);assert.equal(usage.visible_wire_bytes,promptBytes+responseBytes);assert(usage.visible_wire_bytes<=65536);assert.equal(usage.requests.length,1);
    assert.equal(JSON.stringify(s.context_classifications),f.classificationsBytes);assert.equal(current.projectedNoticeContext(s).representations.length,1);assert.equal(JSON.stringify(s.notices),f.canonicalNotices);
  },{workerMonitor:true});
});

test('changed home before queue permits only complete raw notice fallback or an explicit Hold',async t=>{
  await withoutExternal(async()=>{
    const f=await qualifiedFixture(t),id=submit(f);f.db.transaction('synthetic.home.drift',s=>{s.records['notice-home'].content+=' A new unresolved clearing condition.';return s;});
    const before=read(f),jobIds=Object.keys(before.jobs);let q;
    try{q=queue(f,id);}catch(error){if(error instanceof assert.AssertionError)throw error;assert.match(error.message,/hold|home|source|changed|governing|context/i);assert.deepEqual(Object.keys(read(f).jobs),jobIds);assert.deepEqual(read(f).records[id].runtime_task.attempts,[]);return;}
    const s=read(f),value=JSON.parse(context.taskAssignmentContext(s,s.jobs[q.job_id]).text);assert(value.notices.some(notice=>JSON.stringify(notice)===f.meaning));assert(!value.notice_representations.some(entry=>entry.source.id==='notice:lifecycle-notice'),'A changed home must not retain the old qualified substitution');assert.equal(s.jobs[q.job_id].native_id,null);
  },{workerMonitor:true});
});

test('governing drift after bind stops the stale source worker before its model callback',async t=>{
  await withoutExternal(async()=>{
    const f=await qualifiedFixture(t),id=submit(f),q=queue(f,id);queuedState(f,id,q);f.db.transaction('synthetic.governing.drift',s=>{s.records['governing-rule'].content+=' New global restriction: no continuation.';return s;});let callbacks=0;
    await worker.work(f.root,q.job_id,async()=>{callbacks++;assert.fail('Changed governing meaning must block before model invocation');});
    const s=read(f),job=s.jobs[q.job_id];assert.equal(callbacks,0);assert.equal(job.status,'failed');assert.match(job.error,/context|changed|governing|hold/i);assert.equal(job.artifact_id,undefined);assert.equal(s.records[id].runtime_task.attempts.length,1);assert.equal(JSON.stringify(s.context_classifications),f.classificationsBytes);
  },{workerMonitor:true});
});

test('format8 source worker retains an over-budget response as failure without output acceptance',async t=>{
  await withoutExternal(async()=>{
    const f=await qualifiedFixture(t),id=submit(f),q=queue(f,id),bound=queuedState(f,id,q);let callbacks=0;
    await worker.work(f.root,q.job_id,async(_host,_native,prompt,_directory,ceiling,_selection,options)=>{callbacks++;assert(prompt.includes(bound.context.text));recordSpawn(ceiling,options);return {native_id:'synthetic-overflow-'+q.job_id,text:JSON.stringify({content:'OVER_BUDGET_UNKNOWN_ZERO_NO_RETRY '.repeat(3000),messages:[],notices:[],message_dispositions:[]})};});
    const s=read(f),job=s.jobs[q.job_id];assert.equal(callbacks,1);assert.equal(job.status,'failed');assert.match(job.error,/cumulative visible task wire budget/);assert.equal(job.artifact_id,undefined);assert.equal(job.runtime_context_usage.budget_bytes,65536);assert(job.runtime_context_usage.visible_wire_bytes>65536);assert.equal(s.records[id].runtime_task.attempts.length,1);
  },{workerMonitor:true});
});
