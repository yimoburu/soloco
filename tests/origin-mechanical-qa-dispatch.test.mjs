// Actual queue/worker/Store/model-process source. ONLY original execution
// inventory and native observations are explicitly SYNTHETIC, never qualified.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fixture,disposeMechanicalPublicFixture} from './peer-origin-mechanical-public-fixture.mjs';
import {disposeOriginPublicFixture} from './peer-origin-public-fixture.mjs';
import {loadMechanicalQueueWorkerSource,syntheticMechanicalModel} from './origin-mechanical-qa-dispatch-fixture.mjs';
import * as actualEngine from '../plugins/soloco/runtime/engine.mjs';
import {Store,withStore} from '../plugins/soloco/runtime/store.mjs';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
const previous=process.env.COMPANY_PLUGIN_DATA,cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-mechanical-queue-hooks-'));process.env.COMPANY_PLUGIN_DATA=cache;
after(()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(cache,{recursive:true,force:true});disposeMechanicalPublicFixture();disposeOriginPublicFixture();});
async function setup(t,changes={}){
 const f=fixture(t,changes),modules=await loadMechanicalQueueWorkerSource(t,f.policyModuleUrl),counts={check:0,catalog:0,launch:0};
 modules.engine.bind(f.root,f.actor.session_id,'codex');
 const args={root:f.root,session_id:f.actor.session_id,epoch:f.epoch,input:{plan_id:f.plan_id,grant_ref:f.grant_ref}},options={check:()=>{counts.check++;return {available:true,authenticated:true,version:'SYNTHETIC-source-only'};},catalog:()=>{counts.catalog++;return {supported:true,source:'SYNTHETIC catalog, no live CLI',models:[{id:'synthetic-source-model',supported_efforts:[]}],speed_support:{host_default:true}};},launch:(_root,id)=>{counts.launch++;assert.equal(f.state().jobs[id].status,'queued','Queue committed before launcher');return {on(){return this;},unref(){}};}};
 return Object.assign(f,{...modules,counts,args,options,queue(extra={}){return modules.engine.dispatchPeerOriginMechanicalReview({...args,...extra},'codex',options);},jobId(){return f.state().records[f.packet.packet_ref.id].origin_mechanical_qa.job.id;}});
}
const unchanged=(f,fn,predicate)=>{const before=f.raw();assert.throws(fn,predicate);assert.deepEqual(f.raw(),before);};
test('actual default missing original inventory Holds before CLI, reservation, charge or launch',async t=>{
 const f=await setup(t);unchanged(f,()=>actualEngine.dispatchPeerOriginMechanicalReview(f.args,'codex',f.options),error=>error.code==='ORIGIN_MECHANICAL_QA_EXECUTION_INVENTORY_SOURCE_REQUIRED');assert.deepEqual(f.counts,{check:0,catalog:0,launch:0});assert.equal(f.state().records[f.grant_ref.id].origin_mechanical_qa.used_attempts,0);
});
test('SYNTHETIC complete inventory: SAME original queue receipt and fixed worker preserve full context and original process journal',async t=>{
 const f=await setup(t),before=f.state();f.queue();assert.deepEqual(f.counts,{check:1,catalog:1,launch:1});const id=f.jobId(),script=syntheticMechanicalModel(f),result=await f.worker.work(f.root,id,script.model),state=f.state(),job=state.jobs[id];
 assert.equal(script.calls,1);assert.equal(result.verdict,'Pass');assert.equal(job.status,'completed');assert.equal(job.model_process_tracking.invocations.length,1);assert.ok(job.model_process_tracking.invocations[0].birth&&job.model_process_tracking.invocations[0].closure);assert.equal(job.context_sha256,f.packet.context_sha256);assert.equal(state.records[result.review_id].raw_response.length>0,true);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.deepEqual(state.jobs.old,before.jobs.old);assert.deepEqual(state.original_grant,before.original_grant);assert.equal(state.paused,true);
 const sourcePlan=await import(pathToFileURL(f.planModulePath).href);assert.doesNotThrow(()=>withStore(f.root,store=>store.readSnapshot(()=>sourcePlan.validateSelectedPeerOriginMechanicalReviewAtEpoch(store,{plan_id:f.plan_id,review_ids:[result.review_id]},f.actor,f.epoch))));
 const after=f.raw();assert.throws(()=>f.queue());assert.deepEqual(f.raw(),after);
});
test('generic dispatch rejects the ACTUAL plan target before CLI probes and cannot bypass the grant',async t=>{
 const f=await setup(t);unchanged(f,()=>f.engine.dispatch({root:f.root,session_id:f.actor.session_id,epoch:f.epoch,role:'qa',review_of:f.plan_id,task:'Attempt generic bypass'},'codex',f.options),error=>error.code==='ORIGIN_MECHANICAL_QA_FIXED_DISPATCH_REQUIRED');assert.deepEqual(f.counts,{check:0,catalog:0,launch:0});
});
test('unknown cardinality holds without a queue charge or launch',async t=>{
 const f=await setup(t);f.inventory.setSyntheticCardinality(false);try{unchanged(f,()=>f.queue(),error=>error.code==='ORIGIN_MECHANICAL_QA_EXECUTION_CARDINALITY_UNKNOWN');}finally{f.inventory.setSyntheticCardinality(true);}assert.equal(f.counts.launch,0);
});
test('worker original admission guard precedes claim and default absent inventory cannot use synthetic queue evidence',async t=>{
 const f=await setup(t);f.queue();const before=f.raw(),script=syntheticMechanicalModel(f);const actualWorker=await import('../plugins/soloco/runtime/worker.mjs');await assert.rejects(()=>actualWorker.work(f.root,f.jobId(),script.model),error=>error.code==='ORIGIN_MECHANICAL_QA_EXECUTION_INVENTORY_SOURCE_REQUIRED');assert.equal(script.calls,0);assert.deepEqual(f.raw(),before);
});
test('queued original worker rechecks UNKNOWN inventory before claim without model or SQL changes',async t=>{
 const f=await setup(t);f.queue();const before=f.raw(),script=syntheticMechanicalModel(f);f.inventory.setSyntheticCardinality(false);try{await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error.code==='ORIGIN_MECHANICAL_QA_EXECUTION_CARDINALITY_UNKNOWN');}finally{f.inventory.setSyntheticCardinality(true);}assert.equal(script.calls,0);assert.deepEqual(f.raw(),before);
});
test('queue final original receipt fence preserves provider AggregateError and rolls back job, session and spend before launch',async t=>{
 const f=await setup(t),before=f.raw(),cause=Error('SYNTHETIC actual provider cause'),failure=new AggregateError([cause],'SYNTHETIC provider aggregate',{cause}),transaction=Store.prototype.transaction;let hit=0;
 Store.prototype.transaction=function(type,body,options){if(type!=='job.queued')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,body,{...options,beforeCommit:(db,next)=>{const prepare=db.prepare;db.prepare=function(sql,...args){if(sql.startsWith('SELECT')){hit++;throw failure;}return Reflect.apply(prepare,this,[sql,...args]);};try{return options.beforeCommit(db,next);}finally{db.prepare=prepare;}}}]);};
 try{assert.throws(()=>f.queue(),error=>error===failure);}finally{Store.prototype.transaction=transaction;}
 assert.equal(hit,1);assert.equal(f.counts.launch,0);assert.deepEqual(f.raw(),before);assert.strictEqual(failure.cause,cause);assert.strictEqual(failure.errors[0],cause);
});
test('queue expiry AFTER its LAST successful provider read rolls back the original receipt and every charge',async t=>{
 const f=await setup(t),before=f.raw(),originalNow=Date.now,read=Store.prototype.read,transaction=Store.prototype.transaction,deadline=f.state().records[f.grant_ref.id].origin_mechanical_qa.deadline_at_ms;let terminalStore=null,clock=originalNow(),hit=0;Date.now=()=>clock;
 Store.prototype.read=function(...args){const result=Reflect.apply(read,this,args);if(this===terminalStore){hit++;clock=deadline;}return result;};
 Store.prototype.transaction=function(type,body,options){if(type!=='job.queued')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,body,{...options,beforeCommit:(db,next)=>{terminalStore=this;try{return options.beforeCommit(db,next);}finally{terminalStore=null;}}}]);};
 try{assert.throws(()=>f.queue(),error=>error.code==='ORIGIN_MECHANICAL_QA_EXPIRED');}finally{Store.prototype.read=read;Store.prototype.transaction=transaction;Date.now=originalNow;}
 assert.equal(hit,1);assert.equal(f.counts.launch,0);assert.deepEqual(f.raw(),before);
});
test('inventory lost after original request commit prevents adapter invocation and retains one spent attempt',async t=>{
 const f=await setup(t);f.queue();const transaction=Store.prototype.transaction,script=syntheticMechanicalModel(f);let hit=0;
 Store.prototype.transaction=function(type,...args){const result=Reflect.apply(transaction,this,[type,...args]);if(type==='job.model_process.requested'){hit++;f.inventory.setSyntheticCardinality(false);}return result;};
 try{await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error.code==='ORIGIN_MECHANICAL_QA_EXECUTION_CARDINALITY_UNKNOWN');}finally{Store.prototype.transaction=transaction;f.inventory.setSyntheticCardinality(true);}
 assert.equal(hit,1);assert.equal(script.calls,0);const state=f.state(),job=state.jobs[f.jobId()];assert.equal(job.status,'failed');assert.equal(job.model_process_tracking.invocations.length,1);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.equal(state.jobs.old.coordination_release.termination_confirmed,false);
});
test('fixed adapter spawn seam rechecks UNKNOWN BEFORE creating any actual child',async t=>{
 const f=await setup(t);f.queue();const original=Error('SYNTHETIC stop after proving pre-spawn denial'),script=syntheticMechanicalModel(f,{beforeBirth:({options})=>{f.inventory.setSyntheticCardinality(false);assert.throws(()=>options.spawn('/must-never-spawn',[],{}),error=>error.code==='ORIGIN_MECHANICAL_QA_EXECUTION_CARDINALITY_UNKNOWN');throw original;}});
 try{await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error===original);}finally{f.inventory.setSyntheticCardinality(true);}assert.equal(script.calls,1);const state=f.state(),job=state.jobs[f.jobId()];assert.equal(job.model_process_tracking.invocations.length,1);assert.equal(job.model_process_tracking.invocations[0].birth,null);assert.equal(job.coordination_release.termination_confirmed,false);assert.equal(state.jobs.old.coordination_release.termination_confirmed,false);
});
test('original claim fence rejects a target changed after startup classification without any claim/model write',async t=>{
 const f=await setup(t);f.write('SYNTHETIC unrelated ordinary queue',s=>{s.jobs['ordinary-source-job']={id:'ordinary-source-job',status:'queued',role:'qa',review_of:{id:'original',revision:1},epoch:f.epoch,instance_id:'ordinary-source-instance',session_key:'ordinary-source-session',native_id:null};return s;});const before=f.raw(),transaction=Store.prototype.transaction;let hit=0,calls=0;
 Store.prototype.transaction=function(type,body,options){if(type!=='job.started')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,state=>{hit++;state.jobs['ordinary-source-job'].review_of={id:f.plan_id,revision:1};return body(state);},options]);};
 try{await assert.rejects(()=>f.worker.work(f.root,'ordinary-source-job',async()=>{calls++;}),error=>error.code==='ORIGIN_MECHANICAL_QA_FIXED_WORKER_REQUIRED');}finally{Store.prototype.transaction=transaction;}
 assert.equal(hit,1);assert.equal(calls,0);assert.deepEqual(f.raw(),before);
});
test('Fail review and malformed original wire retain exact adverse/raw result without another attempt',async t=>{
 for(const invalidWire of [false,true]){const f=await setup(t);f.queue();const script=syntheticMechanicalModel(f,{verdict:'Fail',invalidWire});if(invalidWire)await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error.code==='ORIGIN_MECHANICAL_QA_OUTPUT_JSON');else{const out=await f.worker.work(f.root,f.jobId(),script.model);assert.equal(out.verdict,'Fail');assert.equal(f.state().records[out.review_id].review.blockers.length,1);}
 const state=f.state(),job=state.jobs[f.jobId()];if(invalidWire)assert.equal(job.rejected_output.text,'SYNTHETIC original malformed raw wire');assert.equal(job.model_process_tracking.invocations.length,1);assert.equal(script.calls,1);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);const after=f.raw();assert.throws(()=>f.queue());assert.deepEqual(f.raw(),after);}
});
test('same global capacity retains all three SYNTHETIC old UNKNOWN hints without granting a second pool',async t=>{
 const jobs=Object.fromEntries([0,1,2].map(n=>['old-'+n,{id:'old-'+n,status:'failed',native_id:'SYNTHETIC-old-unknown-'+n,coordination_release:{termination_confirmed:false}}])),f=await setup(t,{jobs}),before=f.raw();
 assert.throws(()=>f.queue(),error=>error.code==='ORIGIN_MECHANICAL_QA_CAPACITY');assert.deepEqual(f.raw(),before);assert.deepEqual(f.state().jobs,jobs);assert.deepEqual(f.counts,{check:0,catalog:0,launch:0});
});
test('uncached worker monitor notices transient UNKNOWN even with no database change and preserves original raw output',async t=>{
 const f=await setup(t);f.queue();const script=syntheticMechanicalModel(f,{beforeReturn:async()=>{f.inventory.setSyntheticCardinality(false);await new Promise(resolve=>setTimeout(resolve,250));f.inventory.setSyntheticCardinality(true);}});
 try{await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error.code==='ORIGIN_MECHANICAL_QA_EXECUTION_CARDINALITY_UNKNOWN');}finally{f.inventory.setSyntheticCardinality(true);}
 const state=f.state(),job=state.jobs[f.jobId()];assert.equal(script.calls,1);assert.equal(job.status,'failed');assert.equal(job.rejected_output.accepted,false);assert.equal(JSON.parse(job.rejected_output.text).review.verdict,'Pass');assert.equal(job.model_process_tracking.invocations.length,1);assert.ok(job.model_process_tracking.invocations[0].closure);assert.equal(state.jobs.old.coordination_release.termination_confirmed,false);
});
test('publication expiry after the LAST successful provider read rolls back acceptance and retains original raw custody',async t=>{
 const f=await setup(t);f.queue();const originalNow=Date.now,read=Store.prototype.read,transaction=Store.prototype.transaction,deadline=f.state().records[f.grant_ref.id].origin_mechanical_qa.deadline_at_ms;let cutoff=null,terminalStore=null,hit=0;Date.now=()=>cutoff??originalNow();
 Store.prototype.read=function(...args){const result=Reflect.apply(read,this,args);if(this===terminalStore){hit++;cutoff=deadline;}return result;};
 Store.prototype.transaction=function(type,body,options){if(type!=='job.completed')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,body,{...options,beforeCommit:(db,next)=>{terminalStore=this;try{return options.beforeCommit(db,next);}finally{terminalStore=null;}}}]);};
 const script=syntheticMechanicalModel(f);try{await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error.code==='ORIGIN_MECHANICAL_QA_EXPIRED');}finally{Store.prototype.read=read;Store.prototype.transaction=transaction;Date.now=originalNow;}
 assert.equal(hit,1);const state=f.state(),job=state.jobs[f.jobId()];assert.equal(job.status,'failed');assert.equal(job.artifact_id,undefined);assert.equal(job.rejected_output.accepted,false);assert.equal(JSON.parse(job.rejected_output.text).review.verdict,'Pass');assert.equal(Object.values(state.records).filter(r=>r.kind==='review'&&r.job_id===job.id).length,0);assert.equal(state.sessions[job.session_key].native_id,null);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.equal(state.jobs.old.coordination_release.termination_confirmed,false);
});
test('original late child-close after failed return reconciles ONLY its new unit without refund, retry or old UNKNOWN release',async t=>{
 const f=await setup(t);f.queue();const failure=Error('SYNTHETIC original child still closing after adapter rejection');let lateClose;
 const rawHash=value=>createHash('sha256').update(value).digest('hex');
 const model=async(host,_native,_prompt,cwd,timeout,_selection,options)=>{const at=Date.now(),birth={protocol:'ordinary-model-process-birth-v1',launch_id:'SYNTHETIC-'+randomUUID(),host,pid:88002,worker_pid:process.pid,spawned_at:new Date(at).toISOString(),command_sha256:rawHash('SYNTHETIC'),argv_sha256:rawHash('SYNTHETIC'),cwd_sha256:rawHash(cwd)};options.onModelProcess(birth);options.onSpawn(executionTiming(at,{timeout_ms:timeout,timeout_reason:options.timeoutReason}));lateClose=()=>options.onModelClosure(birth,{protocol:'ordinary-model-process-close-v1',birth_sha256:rawHash(JSON.stringify(birth)),closed_at:new Date().toISOString(),exit_code:0,signal:null,observation:'original-child-close'});throw failure;};
 await assert.rejects(()=>f.worker.work(f.root,f.jobId(),model),error=>error===failure);const before=f.state();assert.equal(before.jobs[f.jobId()].coordination_release.termination_confirmed,false);lateClose();const after=f.state(),job=after.jobs[f.jobId()];assert.ok(job.model_process_tracking.invocations[0].closure);assert.equal(job.coordination_release.termination_confirmed,true);assert.equal(job.coordination_release.reason,'model_process_closed');assert.equal(job.status,'failed');assert.deepEqual(after.jobs.old,before.jobs.old);assert.equal(after.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);
});
