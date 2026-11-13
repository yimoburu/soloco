// SYNTHETIC source fixture only. Scripted identities are not native QA evidence.
// This exercises existing currentness limits; it grants no async exemption.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import net from 'node:net';
import timers from 'node:timers';
import {syncBuiltinESMExports} from 'node:module';

async function sourceOnly(fn){
  const restore=[],attempts=[],monitors=new Set();
  const deny=(object,key)=>{const prior=object[key];object[key]=()=>{attempts.push(key);throw Error('Unexpected external call: '+key);};restore.push(()=>{object[key]=prior;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])deny(cp,key);
  for(const key of ['connect','createConnection','createServer'])deny(net,key);
  deny(net.Socket.prototype,'connect');deny(net.Server.prototype,'listen');deny(globalThis,'fetch');
  deny(timers,'setInterval');
  const interval=globalThis.setInterval,clear=globalThis.clearInterval;
  globalThis.setInterval=(fn,delay,...args)=>{assert.equal(delay,100,'Only the source worker monitor is allowed');const timer=interval(fn,delay,...args);monitors.add(timer);return timer;};
  globalThis.clearInterval=timer=>{monitors.delete(timer);return clear(timer);};
  restore.push(()=>{globalThis.setInterval=interval;globalThis.clearInterval=clear;});
  syncBuiltinESMExports();
  try{return await fn();}finally{const leaked=monitors.size;for(const timer of monitors)clear(timer);for(const undo of restore.reverse())undo();syncBuiltinESMExports();assert.equal(leaked,0);assert.deepEqual(attempts,[]);}
}
const [store,tasks,authority,current,notices,engine,worker,timeout,scoped]=await sourceOnly(()=>Promise.all([
  import('../plugins/soloco/runtime/store.mjs'),import('../plugins/soloco/runtime/tasks.mjs'),import('../plugins/soloco/runtime/task-runtime-authority.mjs'),
  import('../plugins/soloco/runtime/current-state.mjs'),import('../plugins/soloco/runtime/notice-sources.mjs'),import('../plugins/soloco/runtime/engine.mjs'),
  import('../plugins/soloco/runtime/worker.mjs'),import('../plugins/soloco/runtime/timeout.mjs'),import('../plugins/soloco/runtime/scoped-context.mjs')
]));
const sha=value=>store.digest(JSON.stringify(value)),sourceId='notice:fictional-original';
const owner={session_id:'fictional-corpus-owner',host:'codex',epoch:1};
const actor={session_id:owner.session_id,epoch:1,source_instruction:'FICTIONAL read-only source contract. Failure remains UNKNOWN; allowance ZERO; no retry.'};
const notice={id:'fictional-original',kind:'must_know',summary:'FICTIONAL failure remains UNKNOWN; allowance ZERO; no retry.',reference:'fictional-timeout',resolution:null,seen:'Consequential literal field',unknown:{seen_at:'Nested qualifier remains semantic'},deliveries:[],seen_at:null};
const meaning=JSON.stringify(notices.projectNotice(notice));
function submit(s,operation_id){return tasks.submitTask(s,{...actor,operation_id,spec:{role:'engineer',task:'Read the fictional retained notice conditions.',acceptance:'Preserve UNKNOWN, ZERO and no retry.',expected_deliverable:'A fictional source assessment',input_ids:['input'],context_scope:'*',context_protocol:'async-task-context-v2'}},'codex');}
function fixture(t,{preexistingTask=false}={}){
  const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-notice-corpus-currentness-'))),root=path.join(temp,'attached'),data=path.join(temp,'plugin-data');
  fs.mkdirSync(root);fs.mkdirSync(data);
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=data;
  const charter={name:'Fictional specialist',mission:'Retain complete conditions',inputs:'Fictional exact sources',outputs:'Fictional assessment',block:'Missing evidence',success:'No meaning omitted',failure:'Omission',phase:'Preparation'};
  const s={id:'fictional-corpus-company',schema:store.SCHEMA,runtime_version:store.VERSION,plugin_version:store.VERSION,owner:{...owner},name:'Fictional corpus currentness',idea:'Check source contract boundaries',mode:'preparation',phase:'Frame',paused:false,governance:'Fictional preparation only; no external execution or renewed allowance.',cos_instructions:'Retain UNKNOWN, ZERO and no retry.',roles:{engineer:{...charter},qa:{...charter,name:'Fictional independent QA'}},records:{input:{id:'input',revision:1,kind:'artifact',content:'Fictional evidence.'},home:{id:'home',revision:1,kind:'artifact',content:meaning,context_obligations:{version:1,scope:'*'}}},jobs:{},sessions:{},notices:[structuredClone(notice)],messages:[],created_at:'2026-11-12T00:00:00.000Z'};
  s.governance_sha256=store.digest(s.governance);s.team_sha256=store.teamHash(s);
  authority.setRuntimeControl(s,{...actor,action:'start'},'codex');
  const initial=preexistingTask?submit(s,'pre-capture-task'):null;
  const db=new store.Store(root,true);db.transaction('fictional.corpus.setup',()=>s);db.migrate();
  const bindings=path.join(data,'bindings');fs.mkdirSync(bindings);fs.writeFileSync(path.join(bindings,store.digest(JSON.stringify([root,'codex',owner.session_id]))+'.json'),JSON.stringify({root,host:'codex',session_id:owner.session_id}));
  t.after(()=>{db.close();if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(temp,{recursive:true,force:true});});
  return {root,db,taskId:initial?.id};
}
const control=(f,args)=>engine.contextControl({root:f.root,...actor,...args},'codex');
function judgment(packet){
  const result={...packet.response_shape,verdict:'Pass',reason:'FICTIONAL scripted currentness fixture; no native semantic QA claim.',permitted_action:packet.phase==='integration'?'apply_scoped_context':'continue',preservation_complete:true,interfaces_complete:true,authority_checked:true,scope_complete:true,blockers:[]};
  if(packet.phase==='extract'){
    const bundle=packet.reviewed_unit_bundle,primary=bundle.primary;
    result.unit_id=primary.id;result.unit_sha256=sha(primary);result.reviewed_unit_bundle_sha256=sha(bundle);
    result.items=[{id:'coherent-occurrence',kind:'boundary',text:meaning+' Every fictional occurrence remains globally constrained; no execution permission.',scope:'*',provenance:bundle.provenance_sha256,interfaces:[primary.required_interface]}];
  }else if(packet.phase==='applicability'){
    assert.deepEqual(packet.corpus_claim.selected_source_ids,[sourceId]);assert(packet.homes.some(home=>home.source.id==='home'&&home.value.content===meaning));
    const items=packet.extractions.flatMap(extraction=>(extraction.result?.items??extraction.items).map(item=>({key:extraction.review.id+'/'+item.id,item}))).filter(({key})=>packet.item_keys.includes(key));
    result.summary='All fictional original, negative, uncertain and zero-allowance conditions remain global; no retry.';
    result.mappings=items.map(({key})=>({item:key,source_ids:[sourceId],occurrence_ids:packet.mapping_occurrence_ids,context_sha256:packet.mapping_context_sha256,typed_homes:packet.typed_homes,conditions:meaning,unresolved_outcomes:'Failure remains UNKNOWN; allowance ZERO; no retry.',status:'represented',homes:['home'],reason:'Complete declared fictional conditions remain in the exact global home.'}));
    result.interfaces=packet.interface_keys.length?[]:items.flatMap(({key,item})=>item.interfaces.map(value=>({key:key+'/'+value.id,item:key,scope:item.scope,...value})));
    result.reviewed_interfaces=packet.interface_keys;
  }else{result.summary='Fictional independent interface/final composition retains all UNKNOWN and ZERO conditions.';result.unreviewed_interfaces=[];}
  return {content:result.reason,messages:[],notices:[],review:{verdict:result.verdict,reason:result.reason,permitted_action:result.permitted_action},qualification_result:result};
}
async function review(f,planId,args){
  const target=control(f,{action:'target',plan_id:planId,delivery_protocol:scoped.SCOPED_STREAM,...args});assert.equal(target.reused,undefined);
  const queued=engine.dispatch({root:f.root,...actor,role:'qa',review_of:target.id,task:'FICTIONAL canonical corpus currentness review.'},'codex',{check:()=>({available:true,authenticated:true,version:'fictional-source-adapter'}),launch:()=>({on(){},unref(){}})}),parts=[];
  await worker.work(f.root,queued.id,async(_host,_session,prompt,_dir,ceiling,_selection,options)=>{
    const start=Date.now(),remaining=Math.min(ceiling,options.executionDeadlineAt===undefined?ceiling:options.executionDeadlineAt-start);
    options.onSpawn?.(timeout.executionTiming(start,{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
    let packet=JSON.parse(prompt);
    if(packet.protocol===scoped.SCOPED_STREAM){parts.push(packet.text);if(!packet.final)return {native_id:'fictional-corpus-'+queued.id,text:JSON.stringify({scoped_stream_ack:{body_sha256:packet.body_sha256,sequence:packet.sequence,range_sha256:packet.range_sha256}})};packet=JSON.parse(parts.join(''));}
    return {native_id:'fictional-corpus-'+queued.id,text:JSON.stringify(judgment(packet))};
  });
  const s=f.db.read(),job=s.jobs[queued.id];assert.equal(job.status,'completed',job.error);assert.equal(job.coordination_release.termination_confirmed,true);
  return s.records[job.artifact_id];
}
async function qualifyCorpus(f){
  const plan=control(f,{action:'plan',protocol:scoped.SCOPED_PROTOCOL,partitioner:scoped.CORPUS_PARTITIONER,source_id:sourceId,selected_source_ids:[sourceId]}),extractions=[];
  let offset=0;do{const page=control(f,{action:'inspect',plan_id:plan.id,offset,limit:16});for(const unit of page.units)extractions.push(await review(f,plan.id,{phase:'extract',unit_id:unit.id}));offset=page.next_offset;}while(offset!==null);
  const domainArgs={phase:'applicability',extraction_review_ids:extractions.map(value=>value.id),counterpart_ids:['home'],context_scope:'*'};
  const domain=await review(f,plan.id,domainArgs),interfaces=await review(f,plan.id,{...domainArgs,domain_review_ids:[domain.id],interface_keys:domain.qualification_result.interfaces.map(value=>value.key)});
  const integration=await review(f,plan.id,{phase:'integration',domain_review_ids:[domain.id],interface_review_ids:[interfaces.id],counterpart_ids:['home']});
  assert.equal(control(f,{action:'apply',integration_review_id:integration.id}).applied,true);
  const s=f.db.read(),proof=scoped.validateCorpusPreservation(s,{integration_review_id:integration.id});
  assert.equal(proof.protocol,scoped.CORPUS_PRESERVATION);assert.deepEqual(proof.selected_source_ids,[sourceId]);
  assert.equal(current.projectedNoticeContext(s).representations.length,1);assert.deepEqual(s.notices,[notice]);
  return integration;
}
function assertRetained(f,integration){
  const s=f.db.read();assert.throws(()=>scoped.validateCorpusPreservation(s,{integration_review_id:integration.id}),/changed|membership|hold/i);
  const projection=current.projectedNoticeContext(s);assert.deepEqual(projection.representations,[]);assert(projection.notices.some(value=>JSON.stringify(value)===meaning));
  assert.equal(s.records.home.content,meaning);assert.equal(s.notices.find(value=>value.id===notice.id).summary,notice.summary);assert(s.context_classifications[sourceId]);
  return s;
}
test('new post-proof task causes genuine corpus currentness Hold before async bookkeeping filters',async t=>{
  const f=fixture(t);await sourceOnly(async()=>{
    const integration=await qualifyCorpus(f);let taskId;
    f.db.transaction('fictional.post-proof.submit',s=>{taskId=submit(s,'post-proof-task').id;return s;});
    const before=assertRetained(f,integration),jobs=Object.keys(before.jobs);let launches=0;
    assert.throws(()=>engine.queueRuntimeTask(f.root,taskId,{check:()=>({available:true,authenticated:true,version:'fictional'}),catalog:()=>{throw Error('No catalog needed');},launch:()=>{launches++;return {on(){},unref(){}};}}),/required referenced originals|membership|hold/i);
    const after=assertRetained(f,integration);assert.equal(launches,0);assert.deepEqual(Object.keys(after.jobs),jobs);assert.deepEqual(after.records[taskId].runtime_task.attempts,[]);
  });
});
test('pre-captured task can assemble before bind, then corpus change Holds worker before model invocation',async t=>{
  const f=fixture(t,{preexistingTask:true});await sourceOnly(async()=>{
    const integration=await qualifyCorpus(f);let launches=0,modelCalls=0;
    const queued=engine.queueRuntimeTask(f.root,f.taskId,{check:()=>({available:true,authenticated:true,version:'fictional'}),catalog:()=>{throw Error('No catalog needed');},launch:()=>{launches++;return {on(){},unref(){}};}});
    assert.equal(launches,1);assert.equal(f.db.read().records[f.taskId].runtime_task.attempts.length,1);assertRetained(f,integration);
    await worker.work(f.root,queued.job_id,async()=>{modelCalls++;throw Error('Corpus-stale task must not invoke a model');});
    const after=assertRetained(f,integration),job=after.jobs[queued.job_id];assert.equal(modelCalls,0);assert.equal(job.status,'failed');assert.equal(job.coordination_release.reason,'model_not_invoked');assert.match(job.error,/required referenced originals|changed|membership|hold/i);
  });
});
