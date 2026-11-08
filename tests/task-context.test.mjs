import test from 'node:test';
import {SchedulingHold} from '../plugins/soloco/runtime/recovery.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {submitTask,amendTask,sendTaskMessage,disposePeerMessage} from '../plugins/soloco/runtime/tasks.mjs';
import {setRuntimeControl} from '../plugins/soloco/runtime/task-runtime-authority.mjs';
import {installTaskIndex} from '../plugins/soloco/runtime/task-index.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {taskAssignmentContext,taskContextMatches,portfolioContext,taskCheckpoint,taskDefinitionBinding} from '../plugins/soloco/runtime/task-context.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-task-context-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'plugin-data');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const read=f=>withStore(f.root,db=>db.read());
function change(f,fn){return withStore(f.root,db=>{let result;db.transaction('fictional.task-context',s=>{result=fn(s);return s;});return result;});}
function fixture(){
  const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'fictional-founder',epoch:1,source_instruction:'Fixture authorizes bounded read-only preparation only; no external action.'};
  engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'Fictional async context tests'},'codex');
  withStore(f.root,db=>db.migrate());
  change(f,s=>setRuntimeControl(s,{...f,action:'start'},'codex'));
  engine.save({...f,id:'current-input',kind:'artifact',content:'Exact current evidence; failures and uncertain effects remain unresolved.'},'codex');
  engine.save({...f,id:'global-rule',kind:'decision',content:'Do not contact anyone or retry uncertain work.'},'codex');
  return f;
}
function task(f,operation='one',scope='auth'){
  const record=change(f,s=>submitTask(s,{...f,operation_id:operation,spec:{role:'engineer',task:'Review the current fictional authentication input.',input_ids:['current-input'],resources:[],context_scope:scope,expected_deliverable:'A source-linked fictional assessment',acceptance:'Retain all conditions and unknown effects; no execution.'}},'codex'));
  return record.id;
}
function job(f,id){const s=read(f),r=s.records[id],spec=r.runtime_task.spec;return {id:'prospective-'+id,role:spec.role,task:spec.task,epoch:s.owner.epoch,context_scope:spec.context_scope,inputs:spec.input_ids.map(id=>({id,revision:s.records[id].revision})),review_of:null,runtime_task:{version:1,...taskDefinitionBinding(r)}};}

// These are explicit fictional semantic judgments. The worker, SQLite, exact
// source/review attribution and canonical qualification paths are real.
async function qualify(f,ids,{disposition='resolved',scopes=[]}={}){
  const p=engine.contextControl({...f,action:'plan',record_ids:ids,disposition,scopes},'codex');
  const q=engine.dispatch({...f,role:'qa',task:'Read complete fictional archive and judge its applicability',review_of:p.id},'codex',{check:()=>({available:true,authenticated:true,version:'fictional-adapter'}),launch:()=>({on(){},unref(){}})});
  const sourceState=read(f),nonrecords=ids.filter(id=>!sourceState.records[id]).map(id=>{const value=id.startsWith('job:')?sourceState.jobs[id.slice(4)]:sourceState.upgrade_history.find(u=>u.id===id.slice(8));return {id,sha256:digest(JSON.stringify(value)),offset:0,length:JSON.stringify(value).length};});
  await work(f.root,q.id,async(_host,_native,_prompt,_dir,timeout,_selection,options)=>{
    if(!_native)options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
    if(nonrecords.length)return {native_id:'fictional-independent-'+p.id,text:JSON.stringify({reads:nonrecords.splice(0,4)})};
    const target=read(f).records[p.id];
    return {native_id:'fictional-independent-'+p.id,text:JSON.stringify({content:'FICTIONAL semantic applicability judgment only; no native acceptance claimed.',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional complete supplied evidence',permitted_action:'apply_context_classification',plan_sha256:digest(JSON.stringify(target.context_classification_plan)),blockers:[]}})};
  });
  const completed=read(f).jobs[q.id];assert.equal(completed.status,'completed',completed.error);
  engine.contextControl({...f,action:'apply',plan_id:p.id,review_id:completed.artifact_id},'codex');
  return {plan_id:p.id,review_id:completed.artifact_id,job_id:q.id};
}

test('packet binds canonical task definition and current sources without mutable task bookkeeping',()=>{
  const f=fixture(),id=task(f),j=job(f,id),before=taskAssignmentContext(read(f),j),packet=JSON.parse(before.text);
  assert.equal(packet.protocol,'async-task-context-v1');
  assert.equal(packet.task.spec.source_instruction,f.source_instruction);
  assert.match(packet.governance,/SoloCo/);
  assert(packet.records.some(r=>r.source.id==='global-rule'));
  assert(before.required_sources.some(ref=>ref.id==='global-rule'));
  assert(before.required_sources.every(ref=>!ref.id.startsWith('@public:')));
  assert(!packet.records.some(r=>r.value.runtime_task||r.value.runtime_command||r.value.runtime_control));
  assert.equal(packet.runtime.enabled,true);
  change(f,s=>{const r=s.records[id];r.revision++;r.runtime_task.updated_at=new Date().toISOString();s.records['async-runtime-control'].runtime_control.heartbeat_at=new Date().toISOString();});
  assert.equal(taskContextMatches(read(f),j,before.hash),true,'verified lifecycle metadata must not invalidate the definition');
  const second=task(f,'unrelated','shipping');
  assert.notEqual(id,second);assert.equal(taskContextMatches(read(f),j,before.hash),true,'independent task creation is not governing semantic intake');
});

test('new applicable membership, source changes, task amendments, controls and incomplete evidence fence context',()=>{
  for(const mode of ['new-rule','source','amend','pause','owner','runtime-stop','runtime-instruction','unknown-extension','missing']){
    const f=fixture(),id=task(f),j=job(f,id),context=taskAssignmentContext(read(f),j);
    change(f,s=>{
      if(mode==='new-rule')s.records['new-condition']={id:'new-condition',kind:'decision',revision:1,content:'A newly introduced distant rule blocks this action.'};
      if(mode==='source')s.records['current-input'].content+=' Changed source condition.';
      if(mode==='amend')amendTask(s,{...f,operation_id:'amend',task_id:id,expected_definition_revision:1,spec:{...s.records[id].runtime_task.spec,task:'A different bounded question'}},'codex');
      if(mode==='pause')s.paused=true;
      if(mode==='owner')s.owner.epoch++;
      if(mode==='runtime-stop')s.records['async-runtime-control'].runtime_control.enabled=false;
      if(mode==='runtime-instruction')s.records['async-runtime-control'].runtime_control.source_instruction+=' A new material restriction.';
      if(mode==='unknown-extension')s.new_rule_provider={content:'Unknown current authority restriction'};
      if(mode==='missing')delete s.records['current-input'];
    });
    assert.equal(taskContextMatches(read(f),j,context.hash),false,mode);
  }
});

test('unclassified evidence is retained and required packet overflow is explicit, never truncation',()=>{
  const f=fixture(),id=task(f),j=job(f,id);
  engine.save({...f,id:'unknown-history',kind:'artifact',content:'A possibly material legacy restriction. '.repeat(2000)},'codex');
  const s=read(f),original=structuredClone(s.records['unknown-history']),c=taskAssignmentContext(s,j,{budget:200000});
  let packet;
  assert.throws(()=>{packet=taskAssignmentContext(s,j);},error=>{
    assert(error instanceof SchedulingHold);assert.equal(error.code,'CONTEXT_CAPACITY');
    assert.equal(error.message,`Task context Held: required coherent packet exceeds 65536 UTF-8bytes (actual ${Buffer.byteLength(c.text)}); coverage incomplete; widen retrieval or split the task; nothing was truncated`);
    return /Held.*coverage incomplete.*nothing was truncated/.test(error.message);
  });
  assert.equal(packet,undefined);
  assert.deepEqual(read(f).records['unknown-history'],original);
  assert.equal(read(f).records['unknown-history'].content.length,'A possibly material legacy restriction. '.repeat(2000).length);
  assert.match(c.text,/possibly material legacy restriction/);
});

test('1x/10x/100x canonical resolved archive grows without growing fixed task working context',async()=>{
  const f=fixture(),id=task(f),j=job(f,id),metrics=[];let prior=0;
  for(const scale of [1,10,100]){
    const ids=[];
    for(let n=prior;n<scale;n++){
      const key='archive-'+n;ids.push(key);
      engine.save({...f,id:key,kind:'artifact',content:'FICTIONAL INERT ARCHIVE ONLY '+String(n)+' '+'.'.repeat(400)},'codex');
    }
    await qualify(f,ids);
    const state=read(f),context=taskAssignmentContext(state,j);
    assert(!context.text.includes('FICTIONAL INERT ARCHIVE ONLY'));
    const archived=Object.values(state.records).filter(r=>r.id?.startsWith('archive-'));
    assert.equal(archived.length,scale);
    metrics.push({scale,archive_bytes:Buffer.byteLength(JSON.stringify(state)),archive_content_bytes:archived.reduce((sum,r)=>sum+Buffer.byteLength(r.content),0),context_bytes:context.context_bytes,hash:context.hash});prior=scale;
  }
  assert.equal(new Set(metrics.map(m=>m.context_bytes)).size,1);
  assert.equal(new Set(metrics.map(m=>m.hash)).size,1);
  // Compare the growing archive content itself: pinned instructions and
  // qualification receipts add fixed overhead unrelated to the scale factor.
  assert(metrics[2].archive_content_bytes>=metrics[0].archive_content_bytes*100);
  assert(metrics[2].archive_bytes>metrics[0].archive_bytes);
  console.log('FICTIONAL accepted archive task context '+JSON.stringify(metrics));
});

test('completely qualified unrelated sources stay outside context; unqualified receipt evidence is not erased',async()=>{
  const f=fixture(),id=task(f),j=job(f,id);
  const before=taskAssignmentContext(read(f),j);
  engine.save({...f,id:'shipping-rule',kind:'decision',content:'A fictional shipping-only condition.'},'codex');
  assert.equal(taskContextMatches(read(f),j,before.hash),false,'unqualified new conditions remain current until checked');
  const current=await qualify(f,['shipping-rule'],{disposition:'current',scopes:['shipping']});
  assert.equal(taskContextMatches(read(f),j,before.hash),false,'a current-source scope judgment does not classify the new receipt bodies themselves');
  await qualify(f,[current.plan_id,current.review_id]);
  assert.equal(taskContextMatches(read(f),j,before.hash),false,'the original current-classification execution body is also unqualified evidence');
  await qualify(f,['job:'+current.job_id]);
  assert.equal(taskContextMatches(read(f),j,before.hash),true);
  assert(!taskAssignmentContext(read(f),j).text.includes('shipping-only condition'));
  engine.save({...f,id:'shipping-rule',expected_revision:1,kind:'decision',content:'Changed fictional shipping-only condition.'},'codex');
  assert.equal(taskContextMatches(read(f),j,before.hash),false,'changed classification is mandatory until independently requalified');
});

test('legacy failed jobs, recovered upgrade bodies and unknown own-job fields remain exact compulsory evidence',()=>{
  for(const mode of ['legacy-failure','recovered-upgrade','unknown-own-job']){
    const f=fixture(),id=task(f),j=job(f,id),before=taskAssignmentContext(read(f),j);
    change(f,s=>{
      if(mode==='legacy-failure')s.jobs.legacy={id:'legacy',status:'failed',rejected_output:{text:'NEVER RETRY: possible external effect remains unknown.'},error:'Unreconciled historical outcome'};
      if(mode==='recovered-upgrade')s.upgrade_history=[{id:'recovered',status:'recovered',failure_disposition:'The previous timeout remains unresolved; do not retry.'}];
      if(mode==='unknown-own-job')s.jobs[j.id]={...j,status:'queued',unrecognized_restriction:'Never hide a new field simply because the source claims this job ID.'};
    });
    assert.equal(taskContextMatches(read(f),j,before.hash),false,mode);
    const next=JSON.parse(taskAssignmentContext(read(f),j).text),sources=next.mandatory_execution_evidence;
    assert(sources.some(source=>mode==='recovered-upgrade'?source.source.id==='upgrade:recovered':source.source.id==='job:'+(mode==='legacy-failure'?'legacy':j.id)));
    assert.match(JSON.stringify(sources),mode==='recovered-upgrade'?/timeout remains unresolved/:mode==='legacy-failure'?/NEVER RETRY/:/Never hide a new field/);
  }
  const f=fixture(),id=task(f),j=job(f,id);
  change(f,s=>{s.upgrade_history=[{id:'same',status:'recovered',content:'Distinct original A remains compulsory.'}];s.upgrade={id:'same',status:'recovered',content:'Distinct original B remains compulsory.'};});
  const evidence=JSON.parse(taskAssignmentContext(read(f),j).text).mandatory_execution_evidence.filter(e=>e.source.id==='upgrade:same');
  assert.equal(evidence.length,2,'duplicate source IDs with different original bytes must not collapse');
  assert.equal(new Set(evidence.map(e=>e.source.sha256)).size,2);
});

test('task inbox messages are exact task evidence, including stored dispositions',()=>{
  const f=fixture(),one=task(f,'one'),two=task(f,'two','shipping'),j=job(f,one),before=taskAssignmentContext(read(f),j);
  change(f,s=>sendTaskMessage(s,{...f,operation_id:'message-one',to_task_id:one,content:'A material peer question; do not infer its answer.'},'codex'));
  const received=taskAssignmentContext(read(f),j);
  assert.match(received.text,/material peer question/);assert.notEqual(received.hash,before.hash);
  change(f,s=>sendTaskMessage(s,{...f,operation_id:'message-two',to_task_id:two,content:'Task-specific shipping message, no global authority.'},'codex'));
  assert.equal(taskContextMatches(read(f),j,received.hash),false,'unqualified owner source instructions remain compulsory across recipients');
  const instructed=taskAssignmentContext(read(f),j);
  assert.match(instructed.text,/Fixture authorizes bounded read-only preparation/);
  change(f,s=>sendTaskMessage(s,{...f,source_instruction:undefined,operation_id:'legacy-message-two',to_task_id:two,content:'Legacy typed task-scoped body with no retained owner instruction.'},'codex'));
  assert.equal(taskContextMatches(read(f),j,instructed.hash),true,'the supported source-less legacy scoped-message contract remains disjoint');
});

test('declared peer targets expose exact receivers without copying their task histories; lifecycle changes stay stable',()=>{
  const f=fixture(),receiver=task(f,'peer-receiver','shipping');
  const sender=change(f,s=>submitTask(s,{...f,operation_id:'peer-sender',spec:{...s.records[receiver].runtime_task.spec,task:'Prepare a bounded peer question.',context_scope:'auth',peer_task_ids:[receiver]}},'codex'));
  const j=job(f,sender.id),before=taskAssignmentContext(read(f),j),packet=JSON.parse(before.text),peer=read(f).records[receiver];
  assert.deepEqual(packet.peer_targets,[{...taskDefinitionBinding(peer),role:peer.runtime_task.spec.role,scope:'shipping'}]);
  assert(!packet.records.some(r=>r.source.id===receiver),'peer declaration is not a request to copy every receiver input');
  withStore(f.root,db=>installTaskIndex(db));
  engine.queueRuntimeTask(f.root,receiver,{check:()=>({available:true,authenticated:true,version:'fictional-adapter'}),launch:()=>({on(){},unref(){}})});
  assert.equal(read(f).records[receiver].runtime_task.state,'queued');
  assert.equal(taskContextMatches(read(f),j,before.hash),true);
  assert.deepEqual(taskCheckpoint(read(f),read(f).records[sender.id]).peer_task_ids,[receiver]);
});

test('peer definition, canonical owner or membership changes stale the sender context',()=>{
  for(const mode of ['definition','owner','deleted']){
    const f=fixture(),receiver=task(f,'peer-receiver','shipping');
    const sender=change(f,s=>submitTask(s,{...f,operation_id:'peer-sender',spec:{...s.records[receiver].runtime_task.spec,task:'Prepare a bounded peer question.',context_scope:'auth',peer_task_ids:[receiver]}},'codex'));
    const j=job(f,sender.id),before=taskAssignmentContext(read(f),j);
    change(f,s=>{
      if(mode==='definition')amendTask(s,{...f,operation_id:'peer-amend',task_id:receiver,expected_definition_revision:1,spec:{...s.records[receiver].runtime_task.spec,task:'The receiver now has a different bounded objective.'}},'codex');
      if(mode==='owner')s.records[receiver].runtime_task.owner.epoch++;
      if(mode==='deleted')delete s.records[receiver];
    });
    assert.equal(taskContextMatches(read(f),j,before.hash),false,mode);
  }
});

test('exact runtime proposal is output, not a new global input; declared consumers receive its complete body',async()=>{
  const f=fixture(),id=task(f);
  withStore(f.root,db=>installTaskIndex(db));
  const queued=engine.queueRuntimeTask(f.root,id,{check:()=>({available:true,authenticated:true,version:'fictional-adapter'}),launch:()=>({on(){},unref(){}})});
  await work(f.root,queued.job_id,async(_host,_native,_prompt,_dir,timeout,_selection,options)=>{
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
    return {native_id:'fictional-task-producer',text:JSON.stringify({content:'Complete attributable fictional proposal; it remains unaccepted.',messages:[],notices:[]})};
  });
  let s=read(f),producer=s.jobs[queued.job_id];
  assert.equal(producer.status,'completed',producer.error);
  assert.equal(taskContextMatches(s,producer,producer.context_sha256),true);
  const consumer=change(f,state=>submitTask(state,{...f,operation_id:'consumer',spec:{...state.records[id].runtime_task.spec,input_ids:[producer.artifact_id],task:'Read the exact proposed producer output'}},'codex'));
  const consumerJob=job(f,consumer.id),packet=JSON.parse(taskAssignmentContext(read(f),consumerJob).text);
  assert(packet.records.some(r=>r.source.id===producer.artifact_id&&r.value.content==='Complete attributable fictional proposal; it remains unaccepted.'));
  change(f,state=>{state.records['unknown-output']={...state.records[producer.artifact_id],id:'unknown-output',content:'An unknown record that only claims the same job ID.'};});
  s=read(f);assert.equal(taskContextMatches(s,producer,producer.context_sha256),false,'job_id alone must not hide an arbitrary source');
});

test('a proven receiver acknowledgment preserves its delivered message body without hiding later messages',async()=>{
  const f=fixture(),id=task(f);
  const message=change(f,s=>sendTaskMessage(s,{...f,operation_id:'delivered-message',to_task_id:id,content:'Keep this exact peer condition in the task evidence.'},'codex'));
  withStore(f.root,db=>installTaskIndex(db));
  const q=engine.queueRuntimeTask(f.root,id,{check:()=>({available:true,authenticated:true,version:'fictional-adapter'}),launch:()=>({on(){},unref(){}})});
  await work(f.root,q.job_id,async(_host,_native,prompt,_dir,timeout,_selection,options)=>{
    assert.match(prompt,/Keep this exact peer condition/);
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
    return {native_id:'fictional-message-receiver',text:JSON.stringify({content:'Fictional proposal preserving the delivered condition.',messages:[],notices:[]})};
  });
  let s=read(f),current=s.jobs[q.job_id];assert.equal(current.status,'completed',current.error);
  change(f,state=>disposePeerMessage(state,state.jobs[q.job_id],{message_id:message.id,operation_id:'worker-ack',disposition:'Read the delivered condition; this acknowledgment grants no permission.'}));
  s=read(f);current=s.jobs[q.job_id];
  assert.equal(s.records[message.id].revision,2);
  assert.equal(taskContextMatches(s,current,current.context_sha256),true);
  const packet=JSON.parse(taskAssignmentContext(s,current).text),delivered=packet.records.find(r=>r.source.id===message.id);
  assert.equal(delivered.value.revision,1);assert.match(delivered.value.content,/exact peer condition/);
  assert(!taskAssignmentContext(s,current).required_sources.some(ref=>ref.id===message.id),'original delivery projection is not a current exact-read handle');
  change(f,state=>sendTaskMessage(state,{...f,operation_id:'late-message',to_task_id:id,content:'New material peer information remains pending and requires reconciliation.'},'codex'));
  assert.equal(taskContextMatches(read(f),current,current.context_sha256),false,'late material inbox content is never silently ignored');
});

test('QA and accepted dependents receive exact producer objectives, candidate and current acknowledged input evidence',async()=>{
  const f=fixture(),a=task(f,'producer'),other=task(f,'unrelated','shipping');
  const condition=change(f,s=>sendTaskMessage(s,{...f,operation_id:'producer-condition',to_task_id:a,content:'Producer-only condition: retain ORCHID and do not contact anyone.'},'codex'));
  change(f,s=>sendTaskMessage(s,{...f,source_instruction:undefined,operation_id:'other-condition',to_task_id:other,content:'Unrelated inbox body must stay out of this pipeline.'},'codex'));
  const qa=change(f,s=>submitTask(s,{...f,operation_id:'review',spec:{...s.records[a].runtime_task.spec,role:'qa',task:'Independently review the exact producer and its conditions.',review_task_id:a}},'codex'));
  const b=change(f,s=>submitTask(s,{...f,operation_id:'consumer',spec:{...s.records[a].runtime_task.spec,role:'pm',task:'Use the independently reviewed exact candidate.',depends_on:[{task_id:qa.id,gate:'accepted'}]}},'codex'));
  withStore(f.root,db=>installTaskIndex(db));
  const queue=id=>engine.queueRuntimeTask(f.root,id,{check:()=>({available:true,authenticated:true,version:'fictional-adapter'}),launch:()=>({on(){},unref(){}})});
  const finish=async(entry,native,review=false,message_dispositions=[])=>work(f.root,entry.job_id,async(_h,_n,_p,_d,timeout,_s,options)=>{
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));
    return {native_id:native,text:JSON.stringify({content:review?'Fictional exact-subject independent review.':'Fictional candidate retains ORCHID; no contact.',messages:[],notices:[],message_dispositions,...(review?{review:{verdict:'Pass',reason:'Supplied complete candidate and exact conditions meet the task criteria.'}}:{})})};
  });
  const aj=queue(a);await finish(aj,'fictional-pipeline-producer',false,[{message_id:condition.id,disposition:'Retained ORCHID and the no-contact condition.'}]);
  let state=read(f);assert.equal(taskContextMatches(state,state.jobs[aj.job_id],state.jobs[aj.job_id].context_sha256),true);
  const qj=queue(qa.id),qpacket=JSON.parse(taskAssignmentContext(read(f),read(f).jobs[qj.job_id]).text);
  const visible=qpacket.records.find(r=>r.source.id===condition.id),original=qpacket.producer_evidence.find(e=>e.job_id===aj.job_id).inputs.find(e=>e.delivered_ref.id===condition.id);
  assert.equal(visible.source.revision,2);assert.equal(visible.value.runtime_message.state,'processed');
  assert(taskAssignmentContext(read(f),read(f).jobs[qj.job_id]).required_sources.some(ref=>ref.id===condition.id&&ref.revision===2));
  assert.equal(original.delivered_ref.revision,1);assert.equal(original.current_source.revision,2);assert.equal(original.original_delivery.value.runtime_message.state,'pending');
  assert.match(original.original_delivery.provenance,/not a current company_context retrieval handle/);
  assert(qpacket.producer_tasks.some(t=>t.binding.id===a&&t.spec.acceptance===state.records[a].runtime_task.spec.acceptance));
  assert(!JSON.stringify(qpacket).includes('Unrelated inbox body'));
  await finish(qj,'fictional-pipeline-independent-qa',true);
  state=read(f);assert.equal(state.jobs[qj.job_id].status,'completed',state.jobs[qj.job_id].error);
  const bj=queue(b.id),bstate=read(f),bpacket=JSON.parse(taskAssignmentContext(bstate,bstate.jobs[bj.job_id]).text);
  for(const source of [bstate.jobs[aj.job_id].artifact_id,bstate.jobs[qj.job_id].artifact_id,condition.id])assert(bpacket.records.some(r=>r.source.id===source),source);
  assert(bpacket.producer_tasks.some(t=>t.binding.id===a));assert(bpacket.producer_tasks.some(t=>t.binding.id===qa.id));
  const before=taskAssignmentContext(bstate,bstate.jobs[bj.job_id]);
  assert.throws(()=>taskAssignmentContext(bstate,bstate.jobs[bj.job_id],{budget:before.context_bytes-1}),/nothing was truncated/);
  change(f,s=>{s.records[condition.id].content+=' Newly changed condition.';s.records[condition.id].revision++;});
  assert.equal(taskContextMatches(read(f),bstate.jobs[bj.job_id],before.hash),false,'stale producer evidence cannot borrow its previous Pass');
});

test('positive prospective job metadata is omitted only while its strict source-generated envelope remains closed',async()=>{
  const f=fixture(),a=task(f,'producer'),b=task(f,'disjoint','shipping');
  withStore(f.root,db=>installTaskIndex(db));
  const aj=engine.queueRuntimeTask(f.root,a,{check:()=>({available:true,authenticated:true,version:'fictional-adapter'}),launch:()=>({on(){},unref(){}})});
  await work(f.root,aj.job_id,async(_h,_n,_p,_d,timeout,_s,options)=>{options.onSpawn(executionTiming(Date.now(),{timeout_ms:timeout}));return {native_id:'fictional-closed-source',text:JSON.stringify({content:'A positive fictional proposal.',messages:[],notices:[]})};});
  const j=job(f,b),state=read(f),before=taskAssignmentContext(state,j);
  assert(!JSON.parse(before.text).mandatory_execution_evidence.some(e=>e.source.id==='job:'+aj.job_id));
  for(const extension of [{error:'Unknown unresolved restriction'},{runtime_context_usage:{...state.jobs[aj.job_id].runtime_context_usage,semantic_override:'NEVER RETRY'}},{requester:{...state.jobs[aj.job_id].requester,role:'runner'}}]){
    const changed=structuredClone(state);Object.assign(changed.jobs[aj.job_id],extension);
    const current=taskAssignmentContext(changed,j);assert.notEqual(current.hash,before.hash);
    assert(JSON.parse(current.text).mandatory_execution_evidence.some(e=>e.source.id==='job:'+aj.job_id));
  }
});

test('portfolio pages are bounded metadata with exact refs and explicit incomplete coverage',()=>{
  const f=fixture();for(let i=0;i<5;i++)task(f,'task-'+i,i%2?'auth':'shipping');
  const s=read(f),first=portfolioContext(s,{limit:2});
  assert.equal(first.tasks.items.length,2);assert.equal(first.tasks.total,5);assert.equal(first.tasks.complete,false);
  assert.equal(first.summary_only,true);assert.equal(first.decision_ready,false);assert.equal(first.coverage.semantic_evidence_complete,false);
  const second=portfolioContext(s,{limit:2,cursor:first.tasks.next_cursor});assert.equal(second.tasks.offset,2);
  assert.notEqual(second.tasks.items[0].source.id,first.tasks.items[0].source.id);
  const filtered=portfolioContext(s,{scope:'auth'});assert.equal(filtered.tasks.total,2);
  assert(Buffer.byteLength(JSON.stringify(first))<=16384);
  task(f,'new-member');assert.throws(()=>portfolioContext(read(f),{cursor:first.tasks.next_cursor}),/stale/);
  assert.throws(()=>portfolioContext(s,{budget:512}),/budget/);
});

test('checkpoint rehydrates source-linked current objective and rejects stale records or remembered task facts',()=>{
  const f=fixture(),id=task(f),initial=read(f),record=initial.records[id],checkpoint=taskCheckpoint(initial,record);
  assert.equal(checkpoint.objective,record.runtime_task.spec.task);
  assert(checkpoint.input_sources.some(r=>r.id==='current-input'));
  assert.match(checkpoint.freshness,/current canonical records/);
  assert.throws(()=>taskCheckpoint(initial,record,{budget:512}),/checkpoint exceeds/);
  change(f,s=>amendTask(s,{...f,operation_id:'amend',task_id:id,expected_definition_revision:1,spec:{...s.records[id].runtime_task.spec,task:'The current changed objective'}},'codex'));
  assert.throws(()=>taskCheckpoint(read(f),record),/not the current canonical/);
  const current=taskCheckpoint(read(f),read(f).records[id]);assert.equal(current.objective,'The current changed objective');
  assert.notEqual(current.task.definition_sha256,checkpoint.task.definition_sha256);
  assert(!JSON.stringify(current).includes('private native conversation'));
});

test('outcome hypothesis and evidence survive task context and cold reconstruction',()=>{
 const f=fixture(),outcome={objective:'Reduce founder repair effort',expected_effect:'Fewer repeated explanations',observation:'Record actual founder interventions and accepted results',assessment_period:'This supplied improvement workflow',evidence_ids:['current-input']};
 const record=change(f,s=>submitTask(s,{...f,operation_id:'outcome-context',spec:{role:'engineer',task:'Prepare a bounded improvement',input_ids:['current-input'],expected_deliverable:'Reviewed proposal',acceptance:'Preserve every current restriction',outcome}},'codex'));
 const j=job(f,record.id),state=read(f),pack=JSON.parse(taskAssignmentContext(state,j).text);
 assert.deepEqual(pack.task.spec.outcome,outcome);
 const checkpoint=taskCheckpoint(state,state.records[record.id]);assert.deepEqual(checkpoint.outcome,outcome);assert.match(checkpoint.outcome_status,/hypothesis/);
 assert(checkpoint.input_sources.some(ref=>ref.id==='current-input'));
 const original=taskAssignmentContext(state,j).hash;
 change(f,s=>{s.records['current-input'].revision++;s.records['current-input'].content='Revised observation contradicts the original';});
 assert.equal(taskContextMatches(read(f),j,original),false);
});
