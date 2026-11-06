import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runFictionalQualification} from '../tools/qualify-fictional.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {validateQualificationApply,validateQualificationExclusion} from '../plugins/soloco/runtime/context-qualification.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {contractResult} from '../tools/qualify-fictional.mjs';
import {buildEvidence} from '../plugins/soloco/runtime/upgrade-evidence.mjs';
import {fits} from '../plugins/soloco/runtime/public-response.mjs';
const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'public-tree-tests-')));test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const directory=()=>fs.mkdtempSync(path.join(tmp,'company-'));
const check=()=>({available:true,authenticated:true,version:'contract-fixture'}),launch=()=>({on(){},unref(){}});

test('public paused tree workflow captures originals, pages topology, observes spawn and applies canonical worker proof',async()=>{
 const f=await runFictionalQualification({directory:directory(),afterPlan:async({base,plan,host})=>{
  const s=withStore(base.root,db=>db.read());assert.equal(s.paused,true);
  assert.throws(()=>engine.dispatch({...base,role:'engineer',task:'Ordinary work while paused'},host,{check,launch}),/paused/);
  assert.throws(()=>engine.dispatch({...base,role:'qa',task:'Arbitrary QA while paused',review_of:'home'},host,{check,launch}),/paused/);
  assert.throws(()=>engine.contextControl({...base,action:'apply',aggregate_review_id:'missing',source_instruction:'No forged proof.'},host),/missing/);
  assert.equal(plan.maintenance,true);assert.ok(s.records[plan.id].context_originals.inputs.length>=2);
 }});
 const s=withStore(f.root,db=>db.read()),proof=s.context_classifications.old.partition_qualification;
 assert.equal(new Set(f.jobs.map(id=>s.jobs[id].native_id)).size,f.jobs.length);
 assert.equal(new Set(f.jobs.map(id=>s.jobs[id].instance_id)).size,f.jobs.length);
 assert.ok(f.jobs.every(id=>s.jobs[id].qualification_delivery.wire&&s.jobs[id].execution_started_at));
 assert.deepEqual(validateQualificationExclusion(s,proof),proof);
 assert.ok(!JSON.parse(assignmentContext(s,{role:'engineer',context_format:3,task:'Current scope',inputs:[]}).text).records.some(r=>r.id==='old'));
 s.owner.epoch++;assert.throws(()=>validateQualificationApply(s,{aggregate_review_id:f.aggregate}),/epoch/);
});

test('public maintenance is fenced by new founder pause, revocation and queued cancellation',async()=>{
 for(const fence of ['pause','revoke','cancel']){
  // Use the synthetic catalog by keeping the canonical injected contract adapter;
  // rejection occurs before any adapter call in each of these scenarios.
  const options={directory:directory()};
  if(fence==='pause')options.afterPlan=({base,host})=>call('company_control',{root:base.root,session_id:base.session_id,action:'pause',expected_epoch:1,source_instruction:'A new explicit founder pause supersedes earlier maintenance.'},host);
  if(fence==='revoke')options.afterTarget=({base,plan,host})=>call('company_context',{...base,action:'revoke',plan_id:plan.id,source_instruction:'Revoke this exact fictional read-only maintenance.'},host);
  if(fence==='cancel')options.afterQueued=({root,queued})=>withStore(root,db=>db.transaction('fixture.cancel',s=>{s.jobs[queued.id].status='cancelled';return s;}));
  await assert.rejects(runFictionalQualification(options),/subject|paused|eligible|cancelled/);
  const s=withStore(options.directory,db=>db.read());assert.equal(s.paused,true);assert.equal(s.context_classifications?.old,undefined);
  assert.ok(Object.values(s.jobs).every(j=>!j.qualification_delivery));assert.ok(Object.values(s.jobs).every(j=>!j.execution_started_at));
 }
});

test('new tree capture on legacy storage holds atomically until explicit migration',()=>{
 const root=directory(),previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(root,'fixture-plugin-data');
 try{
  const base={root,session_id:'founder',epoch:1};engine.bind(root,base.session_id,'codex');engine.open({...base,idea:'Fictional migration gate'},'codex');
  withStore(root,db=>db.transaction('fixture.source',s=>{s.records.old={id:'old',kind:'artifact',revision:1,content:'Exact old original.'};return s;}));
  const before=withStore(root,db=>({hash:digest(JSON.stringify(db.read())),token:db.changeToken()}));
  assert.throws(()=>engine.contextControl({...base,action:'plan',source_id:'old',source_instruction:'Authorized fictional qualification.'},'codex'),/migration|migrate|requires/i);
  withStore(root,db=>{assert.equal(db.storageInfo().format,'legacy-json');assert.equal(digest(JSON.stringify(db.read())),before.hash);assert.equal(db.changeToken(),before.token);});
 }finally{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;}
});

test('actual in-flight maintenance worker rejects late output after founder pause, revoke or cancellation',async()=>{
 for(const fence of ['pause','revoke','cancel']){
  let fixture;
  await assert.rejects(runFictionalQualification({directory:directory(),afterPlan:value=>{fixture=value;throw Error('fixture prepared');}}),/fixture prepared/);
  const {root,base,plan,host}=fixture,previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(root,'fixture-plugin-data');
  try{
   const page=await call('company_context',{...base,action:'inspect',plan_id:plan.id},host);
   const target=await call('company_context',{...base,action:'target',plan_id:plan.id,unit_id:page.units[0].id,source_instruction:'Exact fictional leaf.'},host);
   const j=engine.dispatch({...base,role:'qa',task:'Independent fictional preservation review.',review_of:target.id},host,{check,launch});let calls=0;
   await work(root,j.id,async(h,native,wire,dir,remaining,selection,options)=>{
    calls++;options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
    if(fence==='pause')await call('company_control',{root,session_id:base.session_id,action:'pause',expected_epoch:1,source_instruction:'Stop earlier maintenance immediately.'},host);
    if(fence==='revoke')await call('company_context',{...base,action:'revoke',plan_id:plan.id,source_instruction:'Revoke active maintenance.'},host);
    if(fence==='cancel')withStore(root,db=>db.transaction('fixture.cancel-active',s=>{s.jobs[j.id].status='cancelled';return s;}));
    const r=contractResult(JSON.parse(wire));return {native_id:'late-fictional-native',text:JSON.stringify({content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r})};
   });
   const s=withStore(root,db=>db.read());assert.equal(calls,1);assert.ok(s.jobs[j.id].execution_started_at);assert.notEqual(s.jobs[j.id].status,'completed');assert.ok(!s.jobs[j.id].qualification_delivery);assert.equal(s.context_classifications?.old,undefined);assert.equal(s.paused,true);
  }finally{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;}
 }
});

test('supported paused schema-1 storage migration is explicit, owner fenced and preserves exact logical state',()=>{
 const root=directory(),previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(root,'fixture-plugin-data');
 try{
  const base={root,session_id:'legacy-founder',epoch:1};engine.bind(root,base.session_id,'codex');engine.open({...base,idea:'Fictional legacy maintenance'},'codex');
  withStore(root,db=>db.transaction('fixture.legacy-schema',s=>{s.schema=1;s.plugin_version='0.1.0';delete s.runtime_version;delete s.cos_instructions;delete s.team_sha256;s.paused=true;return s;}));
  const before=withStore(root,db=>JSON.stringify(db.read()));
  assert.throws(()=>engine.storageControl({...base,epoch:2,action:'migrate',source_instruction:'Wrong epoch.'},'codex'),/owner|epoch/);
  const result=engine.storageControl({...base,action:'migrate',source_instruction:'Standing fictional upgrade instruction explicitly covers this storage migration.'},'codex');
  assert.equal(result.format,'normalized-v4');assert.ok(fs.existsSync(result.backup));assert.equal(withStore(root,db=>JSON.stringify(db.read())),before);
 }finally{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;}
});

test('public qualification originals and payload ranges adapt to escaped reply budgets without mutation receipts',async()=>{
 const payload=('"\\\n\r\t\u0000😀漢字\ud800').repeat(5000),sourceText=JSON.stringify({files:[{path:'constraint.txt',content:payload}]});
 await assert.rejects(runFictionalQualification({directory:directory(),sourceText,afterPlan:async({root,base,plan,host})=>{
  const state=withStore(root,db=>db.read()),before=withStore(root,db=>db.changeToken());
  const evidence=buildEvidence({records:{old:state.records.old}},[],{wholeBodyAliases:false,checkpointContinuity:true,snapshotState:state});
  const source=Object.values(evidence.sources).find(s=>s.kind==='payload'&&s.raw.length>=32768);assert.ok(source);
  let length=32768;if(/[\uD800-\uDBFF]/.test(source.raw[length-1]))length--;
  const r=await call('company_context',{...base,action:'read',plan_id:plan.id,source_id:source.source_id,sha256:source.sha256,offset:0,length},host);
  assert.ok(fits(r));assert.equal(r.retrieval_only,true);assert.equal(r.operation_returned,undefined);assert.equal(r.evidence.text,source.raw.slice(0,r.evidence.length));assert.equal(r.next_offset,r.evidence.length);assert.ok(r.evidence.length<length);
  const original=await call('company_context',{...base,action:'read',snapshot:plan.original,length:32768},host);assert.ok(fits(original));assert.equal(original.text,JSON.stringify(state.records.old).slice(0,original.length));assert.equal(original.next_offset,original.length);
  assert.equal(withStore(root,db=>db.changeToken()),before);
  throw Error('range fixture complete');
 }}),/range fixture complete/);
});

test('public fresh profile binds immutable capsule, persists dense worker results and still requires independent handover',async()=>{
 await assert.rejects(runFictionalQualification({directory:directory(),afterPlan:async({root,base,plan:legacy,host})=>{
  const old=withStore(root,db=>JSON.stringify(db.read().records[legacy.id]));
  const plan=await call('company_context',{...base,action:'plan',source_id:'old',counterpart_ids:['home'],profile:'large-v2',maintenance:true,source_instruction:'Authorize only fresh fictional bounded read-only QA.'},host);
  assert.equal(plan.profile,'large-v2');assert.equal(plan.total_sessions,plan.total_units+plan.total_nodes+1);assert.equal(plan.limits.output_bytes,48000);
  assert.equal(withStore(root,db=>JSON.stringify(db.read().records[legacy.id])),old);
  await assert.rejects(call('company_context',{...base,action:'target',plan_id:legacy.id,unit_id:'historical-0',profile:'large-v2',source_instruction:'Cannot extend old plan.'},host),/fresh source plans only/);
  const state=withStore(root,db=>db.read()),p=state.records[plan.id].context_partition_plan;
  assert.ok(state.records[plan.id].context_units.immutable_snapshot);assert.deepEqual(p.limits,plan.limits);
  const proofs=new Map();
  const run=async args=>{
   const target=await call('company_context',{...base,action:'target',plan_id:plan.id,...args,source_instruction:'Exact fictional fresh profile review.'},host);
   const j=engine.dispatch({...base,role:'qa',task:'Fictional bounded review.',review_of:target.id},host,{check,launch});
   await work(root,j.id,async(h,native,wire,dir,remaining,selection,options)=>{
    options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
    const r=contractResult(JSON.parse(wire));
    if(r.kind==='unit')r.items=r.items.flatMap(item=>Array.from({length:24},(_,i)=>({...item,id:'dense-'+i,text:item.text.repeat(10)})));
    let text=JSON.stringify({content:r.reason,messages:[],notices:[],review:{verdict:r.verdict,reason:r.reason,permitted_action:r.permitted_action},qualification_result:r});
    if(r.kind==='unit'){
     assert.ok(Buffer.byteLength(text)>12000&&Buffer.byteLength(text)<48000);
     text+='\n'.repeat(128000-Buffer.byteLength(text));
     const wrapped=JSON.stringify({type:'item.completed',item:{type:'agent_message',text}})+'\n';
     assert.ok(wrapped.length>128001,'Native JSONL quoting exceeds the raw response length');
     assert.ok(options.maxOutputCharacters>=wrapped.length,'Adapter transport must carry a valid full raw response');
    }
    return {native_id:'fresh-profile-'+j.id,text};
   });
   const after=withStore(root,db=>db.read()).jobs[j.id];assert.equal(after.status,'completed',after.error);return after.artifact_id;
  };
  for(const u of p.units)proofs.set(u.id,await run({unit_id:u.id}));
  for(const n of p.nodes)proofs.set(n.id,await run({node_id:n.id,child_review_ids:n.children.map(id=>proofs.get(id))}));
  const aggregate=await run({root_review_ids:[proofs.get(p.roots.historical),proofs.get(p.roots.current)]});
  await call('company_context',{...base,action:'apply',aggregate_review_id:aggregate,source_instruction:'Preservation only; no handover approval.'},host);
  const applied=withStore(root,db=>db.read());assert.equal(applied.paused,true);validateQualificationExclusion(applied,applied.context_classifications.old.partition_qualification);
  const incoming={...base,session_id:'fictional-incoming-profile-owner',epoch:2};
  engine.bind(root,incoming.session_id,host);
  engine.control({...incoming,action:'handover',expected_epoch:1,source_instruction:'Continue fictional company in replacement coordinator.'},host);
  engine.handover({...incoming,action:'submit',content:'Recover fictional objectives, exact rules, held work and uncertainty from current company records. This classification proof does not establish independent handover acceptance. No external authority is granted.'},host);
  assert.throws(()=>engine.control({...incoming,action:'resume',expected_epoch:2,source_instruction:'Cannot use extraction as handover QA.'},host),/Independent exact-state handover QA Pass/);
  throw Error('fresh profile public fixture complete');
 }}),/fresh profile public fixture complete/);
});
