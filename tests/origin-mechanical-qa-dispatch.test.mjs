// Actual queue/worker/Store/model-process and Original inventory Source.
// Standard Node child events are controlled, never Native qualification.
import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {fixture,disposeMechanicalPublicFixture} from './peer-origin-mechanical-public-fixture.mjs';
import {disposeOriginPublicFixture} from './peer-origin-public-fixture.mjs';
import {loadMechanicalQueueWorkerSource,syntheticMechanicalModel} from './origin-mechanical-qa-dispatch-fixture.mjs';
import * as actualEngine from '../plugins/soloco/runtime/engine.mjs';
import {Store,withStore} from '../plugins/soloco/runtime/store.mjs';
import {pathToFileURL} from 'node:url';
import {stageOriginalWorker,runOriginalAdapterWithMock} from './original-adapter-process-fixture.mjs';
import {recordOriginalWorkerAssignmentFrom,inspectOriginalLocalExecutionInventoryFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';
const previous=process.env.COMPANY_PLUGIN_DATA,cache=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-mechanical-queue-hooks-'));process.env.COMPANY_PLUGIN_DATA=cache;
after(()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(cache,{recursive:true,force:true});disposeMechanicalPublicFixture();disposeOriginPublicFixture();});
async function setup(t,changes={}){
 const f=fixture(t,changes),modules=await loadMechanicalQueueWorkerSource(t,f.policyModuleUrl),counts={check:0,catalog:0,launch:0};
 modules.engine.bind(f.root,f.actor.session_id,'codex');
 const args={root:f.root,session_id:f.actor.session_id,epoch:f.epoch,input:{plan_id:f.plan_id,grant_ref:f.grant_ref}},options={check:()=>{counts.check++;return {available:true,authenticated:true,version:'SYNTHETIC-source-only'};},catalog:()=>{counts.catalog++;return {supported:true,source:'SYNTHETIC catalog, no live CLI',models:[{id:'synthetic-source-model',supported_efforts:[]}],speed_support:{host_default:true}};},launch:(_root,id)=>{counts.launch++;assert.equal(f.state().jobs[id].status,'queued','Queue committed before launcher');return {on(){return this;},unref(){}};}};
 return Object.assign(f,{...modules,counts,args,options,queue(extra={}){return modules.engine.dispatchPeerOriginMechanicalReview({...args,...extra},'codex',options);},jobId(){return f.state().records[f.packet.packet_ref.id].origin_mechanical_qa.job.id;}});
}
const unchanged=(f,fn,predicate)=>{const before=f.raw();assert.throws(fn,predicate);assert.deepEqual(f.raw(),before);};
const historyHold=error=>error?.code==='ORIGINAL_EXECUTION_HISTORY_REQUIRED';
function breakOriginalHistory(f){
 const saved=f.db(db=>{const row=db.prepare('SELECT seq,value FROM events ORDER BY seq LIMIT 1').get(),body=JSON.parse(row.value);assert.equal(body.original_execution.protocol,'original-local-execution-journal-v1');body.original_execution.protocol='SYNTHETIC-broken-original-history';const changed=JSON.stringify(body);db.prepare('UPDATE events SET value=? WHERE seq=?').run(changed,row.seq);return {...row,changed};});
 let restored=false;return ()=>{if(restored)return;f.db(db=>{assert.equal(db.prepare('SELECT value FROM events WHERE seq=?').get(saved.seq).value,saved.changed);db.prepare('UPDATE events SET value=? WHERE seq=?').run(saved.value,saved.seq);});restored=true;};
}
function restoreAfterOriginalDenial(f,restore){
 const methods=['readSnapshot','transaction'].map(name=>[name,Store.prototype[name]]);let observed=0;
 for(const [name,original]of methods)Store.prototype[name]=function(...args){try{return Reflect.apply(original,this,args);}catch(error){if(this.root===f.root&&!this.inTransaction&&historyHold(error)){observed++;restore();}throw error;}};
 return {get observed(){return observed;},dispose(){for(const [name,original]of methods)Store.prototype[name]=original;}};
}
function controlledModelChild(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.signals=[];child.kill=signal=>{child.signals.push(signal);return true;};return child;}
test('actual default canonical inventory admits a genuine fresh Original queue before its controlled carrier',async t=>{
 const f=await setup(t);assert.equal(f.original_inventory,true);
 actualEngine.dispatchPeerOriginMechanicalReview(f.args,'codex',{...f.options,launch(root,id){f.options.launch(root,id);const carrier=stageOriginalWorker(root,id);t.after(()=>carrier.dispose());return carrier.child;}});
 assert.deepEqual(f.counts,{check:1,catalog:1,launch:1});assert.equal(f.state().records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);
 assert.ok(f.state().jobs[f.jobId()].original_execution_assignment.launches[0].birth);
});
test('actual default mechanical carrier cannot outlive the grant after its queue committed',async t=>{
 const f=await setup(t),old=f.state().jobs.old,deadline=f.state().records[f.grant_ref.id].origin_mechanical_qa.deadline_at_ms,transaction=Store.prototype.transaction,now=Date.now;let clock=now(),queued=0,created=0;
 const cp=mock.method(childProcess,'spawn',()=>{created++;const child=controlledModelChild();child.pid=process.pid+800000;child.unref=()=>child;return child;});syncBuiltinESMExports();Date.now=()=>clock;
 Store.prototype.transaction=function(type,...args){const result=Reflect.apply(transaction,this,[type,...args]);if(this.root===f.root&&type==='job.queued'){queued++;clock=deadline;}return result;};
 try{assert.throws(()=>actualEngine.dispatchPeerOriginMechanicalReview(f.args,'codex',{check:f.options.check,catalog:f.options.catalog}),error=>error.code==='ORIGIN_MECHANICAL_QA_POLICY_CHANGED');}finally{Store.prototype.transaction=transaction;Date.now=now;cp.mock.restore();syncBuiltinESMExports();}
 const state=f.state(),job=state.jobs[f.jobId()];assert.equal(queued,1);assert.equal(created,0);assert.equal(job.status,'failed');assert.equal(job.original_execution_assignment.launches.length,0);assert.equal(job.coordination_release.termination_confirmed,false);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.deepEqual(state.jobs.old,old);withStore(f.root,store=>store.readSnapshot(()=>{const facts=inspectOriginalLocalExecutionInventoryFrom(store.db);assert.equal(facts.occupied,2);assert.equal(facts.remaining,1);}));
});
test('actual default mechanical carrier samples its bound after the final full inventory read',async t=>{
 const f=await setup(t),old=f.state().jobs.old,deadline=f.state().records[f.grant_ref.id].origin_mechanical_qa.deadline_at_ms,transaction=Store.prototype.transaction,prepare=DatabaseSync.prototype.prepare,now=Date.now;let clock=now(),insideBorn=false,inventoryReads=0,created=0;
 const cp=mock.method(childProcess,'spawn',()=>{created++;const child=controlledModelChild();child.pid=process.pid+800001;child.unref=()=>child;return child;});syncBuiltinESMExports();Date.now=()=>clock;
 // Only the owning born callback is armed: its first replay is the canonical
 // policy's capacity check, its second is the final complete inventory read.
 DatabaseSync.prototype.prepare=function(sql,...args){const statement=Reflect.apply(prepare,this,[sql,...args]);if(insideBorn&&sql==='SELECT seq,at,type,value FROM events ORDER BY seq'){const all=statement.all;statement.all=function(...values){const rows=Reflect.apply(all,this,values);if(++inventoryReads===2)clock=deadline;return rows;};}return statement;};
 Store.prototype.transaction=function(type,body,options){if(this.root!==f.root||type!=='job.original_execution.born')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,state=>{insideBorn=true;try{return body(state);}finally{insideBorn=false;}},options]);};
 try{assert.throws(()=>actualEngine.dispatchPeerOriginMechanicalReview(f.args,'codex',{check:f.options.check,catalog:f.options.catalog}),error=>error.code==='ORIGINAL_EXECUTION_CUTOFF_EXPIRED');}finally{Store.prototype.transaction=transaction;DatabaseSync.prototype.prepare=prepare;Date.now=now;cp.mock.restore();syncBuiltinESMExports();}
 const state=f.state(),job=state.jobs[f.jobId()],launches=job.original_execution_assignment.launches;assert.equal(inventoryReads,2);assert.equal(created,0);assert.equal(job.status,'failed');assert.equal(launches.length,1);assert.equal(launches[0].kind,'worker');assert.equal(launches[0].birth,null);assert.equal(launches[0].closure,null);assert.equal(job.coordination_release.termination_confirmed,false);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.deepEqual(state.jobs.old,old);withStore(f.root,store=>store.readSnapshot(()=>{const facts=inspectOriginalLocalExecutionInventoryFrom(store.db);assert.equal(facts.occupied,2);assert.equal(facts.remaining,1);}));
});
test('genuine Original inventory: SAME original queue receipt and fixed worker preserve full context and controlled process journal',async t=>{
 const f=await setup(t),before=f.state();f.queue();assert.deepEqual(f.counts,{check:1,catalog:1,launch:1});const id=f.jobId(),script=syntheticMechanicalModel(f),result=await f.worker.work(f.root,id,script.model),state=f.state(),job=state.jobs[id];
 assert.equal(script.calls,1);assert.equal(result.verdict,'Pass');assert.equal(job.status,'completed');assert.equal(job.model_process_tracking.invocations.length,1);assert.ok(job.model_process_tracking.invocations[0].birth&&job.model_process_tracking.invocations[0].closure);assert.equal(job.context_sha256,f.packet.context_sha256);assert.equal(state.records[result.review_id].raw_response.length>0,true);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.deepEqual(state.jobs.old,before.jobs.old);assert.deepEqual(state.original_grant,before.original_grant);assert.equal(state.paused,true);
 const sourcePlan=await import(pathToFileURL(f.planModulePath).href);assert.doesNotThrow(()=>withStore(f.root,store=>store.readSnapshot(()=>sourcePlan.validateSelectedPeerOriginMechanicalReviewAtEpoch(store,{plan_id:f.plan_id,review_ids:[result.review_id]},f.actor,f.epoch))));
 const after=f.raw();assert.throws(()=>f.queue());assert.deepEqual(f.raw(),after);
});
test('generic dispatch rejects the ACTUAL plan target before CLI probes and cannot bypass the grant',async t=>{
 const f=await setup(t);unchanged(f,()=>f.engine.dispatch({root:f.root,session_id:f.actor.session_id,epoch:f.epoch,role:'qa',review_of:f.plan_id,task:'Attempt generic bypass'},'codex',f.options),error=>error.code==='ORIGIN_MECHANICAL_QA_FIXED_DISPATCH_REQUIRED');assert.deepEqual(f.counts,{check:0,catalog:0,launch:0});
});
test('lost original history holds without a queue charge or launch',async t=>{
 const f=await setup(t);breakOriginalHistory(f);unchanged(f,()=>f.queue(),historyHold);assert.equal(f.counts.launch,0);assert.equal(f.state().records[f.grant_ref.id].origin_mechanical_qa.used_attempts,0);
});
test('default canonical worker consumes the genuine same-company Original admission and fixed controlled model',async t=>{
 const f=await setup(t);f.queue();const before=f.state(),script=syntheticMechanicalModel(f),actualWorker=await import('../plugins/soloco/runtime/worker.mjs');
 const result=await actualWorker.work(f.root,f.jobId(),script.model),state=f.state();assert.equal(script.calls,1);assert.equal(result.verdict,'Pass');assert.equal(state.jobs[f.jobId()].status,'completed');
 assert.deepEqual(state.jobs.old,before.jobs.old);assert.deepEqual(state.original_grant,before.original_grant);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);
});
test('queued original worker rechecks damaged original history before claim without model or SQL changes',async t=>{
 const f=await setup(t);f.queue();breakOriginalHistory(f);const before=f.raw(),script=syntheticMechanicalModel(f);await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),historyHold);assert.equal(script.calls,0);assert.deepEqual(f.raw(),before);
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
test('original history lost after original request commit prevents adapter invocation and retains one spent attempt',async t=>{
 const f=await setup(t);f.queue();const transaction=Store.prototype.transaction,script=syntheticMechanicalModel(f);let hit=0,restore,denial;
 Store.prototype.transaction=function(type,...args){const result=Reflect.apply(transaction,this,[type,...args]);if(type==='job.model_process.requested'){hit++;restore=breakOriginalHistory(f);denial=restoreAfterOriginalDenial(f,restore);}return result;};
 try{await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),historyHold);}finally{denial?.dispose();Store.prototype.transaction=transaction;restore?.();}
 assert.ok(denial.observed>0,'restore only after the real Source denial/rollback; the denied attempt remains failed');
 assert.equal(hit,1);assert.equal(script.calls,0);const state=f.state(),job=state.jobs[f.jobId()];assert.equal(job.status,'failed');assert.equal(job.model_process_tracking.invocations.length,1);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);assert.equal(state.jobs.old.coordination_release.termination_confirmed,false);
});
test('actual fixed adapter rechecks the original prefix BEFORE its controlled Node child can be created',async t=>{
 const f=await setup(t);f.queue();const original=Error('SYNTHETIC stop after proving real pre-spawn denial');let calls=0,created=0;
 const model=async(host,native,prompt,cwd,timeout,selection,options)=>{
  calls++;const restore=breakOriginalHistory(f),child=controlledModelChild();
  try{await assert.rejects(()=>runOriginalAdapterWithMock(host,native,prompt,cwd,timeout,selection,{...options,resolveExecutable:()=>process.execPath},{child,onLaunch(){created++;}}),historyHold);}
  finally{restore();}throw original;
 };
 await assert.rejects(()=>f.worker.work(f.root,f.jobId(),model),error=>error===original);assert.equal(calls,1);assert.equal(created,0);
 const state=f.state(),job=state.jobs[f.jobId()];assert.equal(job.model_process_tracking.invocations.length,1);assert.equal(job.model_process_tracking.invocations[0].birth,null);assert.equal(job.coordination_release.termination_confirmed,false);assert.equal(state.jobs.old.coordination_release.termination_confirmed,false);
 assert.ok(job.original_execution_assignment.launches.filter(l=>l.kind==='model').every(l=>l.birth===null&&l.closure===null));
});
test('original claim fence rejects a target changed after startup classification without any claim/model write',async t=>{
 const f=await setup(t);f.write('job.queued',(s,store)=>{const job={id:'ordinary-source-job',status:'queued',role:'qa',host:'codex',review_of:{id:'original',revision:1},epoch:f.epoch,instance_id:'ordinary-source-instance',session_key:'ordinary-source-session',native_id:null,created_at:new Date().toISOString()};recordOriginalWorkerAssignmentFrom(store,s,job);s.jobs[job.id]=job;return s;});const before=f.raw(),transaction=Store.prototype.transaction;let hit=0,calls=0;
 Store.prototype.transaction=function(type,body,options){if(type!=='job.started')return Reflect.apply(transaction,this,[type,body,options]);return Reflect.apply(transaction,this,[type,state=>{hit++;state.jobs['ordinary-source-job'].review_of={id:f.plan_id,revision:1};return body(state);},options]);};
 try{await assert.rejects(()=>f.worker.work(f.root,'ordinary-source-job',async()=>{calls++;}),error=>error.code==='ORIGIN_MECHANICAL_QA_FIXED_WORKER_REQUIRED');}finally{Store.prototype.transaction=transaction;}
 assert.equal(hit,1);assert.equal(calls,0);assert.deepEqual(f.raw(),before);
});
test('Fail review and malformed original wire retain exact adverse/raw result without another attempt',async t=>{
 for(const invalidWire of [false,true]){const f=await setup(t);f.queue();const script=syntheticMechanicalModel(f,{verdict:'Fail',invalidWire});if(invalidWire)await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error.code==='ORIGIN_MECHANICAL_QA_OUTPUT_JSON');else{const out=await f.worker.work(f.root,f.jobId(),script.model);assert.equal(out.verdict,'Fail');assert.equal(f.state().records[out.review_id].review.blockers.length,1);}
 const state=f.state(),job=state.jobs[f.jobId()];if(invalidWire)assert.equal(job.rejected_output.text,'SYNTHETIC original malformed raw wire');assert.equal(job.model_process_tracking.invocations.length,1);assert.equal(script.calls,1);assert.equal(state.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);const after=f.raw();assert.throws(()=>f.queue());assert.deepEqual(f.raw(),after);}
});
test('same genuine Original capacity retains all three controlled old UNKNOWN assignments without granting a second pool',async t=>{
 const jobs=Object.fromEntries([0,1,2].map(n=>['old-'+n,{id:'old-'+n,status:'failed',native_id:'SYNTHETIC-old-unknown-'+n,coordination_release:{termination_confirmed:false}}])),f=await setup(t,{jobs}),before=f.raw();
 assert.throws(()=>f.queue(),error=>error.code==='ORIGIN_MECHANICAL_QA_CAPACITY');assert.deepEqual(f.raw(),before);
 for(const [id,original]of Object.entries(jobs)){const current=f.state().jobs[id];for(const [key,value]of Object.entries(original))assert.deepEqual(current[key],value,'preserve every old business field');assert.equal(current.original_execution_assignment.unit,'legacy-standalone-assignment');}
 assert.deepEqual(f.counts,{check:0,catalog:0,launch:0});
});
test('uncached worker monitor notices transient real Original-history loss and preserves already-observed original raw output',async t=>{
 const f=await setup(t);f.queue();let restore,observed=false;const script=syntheticMechanicalModel(f,{beforeReturn:async({options})=>{restore=breakOriginalHistory(f);await new Promise(resolve=>setTimeout(resolve,250));assert.equal(options.signal.aborted,true);assert.ok(historyHold(options.signal.reason),'the actual source inventory denial caused cancellation');observed=true;restore();}});
 try{await assert.rejects(()=>f.worker.work(f.root,f.jobId(),script.model),error=>error.code==='ROLE_ABORTED');}finally{restore?.();}
 assert.equal(observed,true);
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
 const model=(host,native,prompt,cwd,timeout,selection,options)=>{
  const child=controlledModelChild();let started;const birthObserved=new Promise(resolve=>{started=resolve;});
  const actual=runOriginalAdapterWithMock(host,native,prompt,cwd,timeout,selection,{...options,resolveExecutable:()=>process.execPath},{child,onLaunch(){queueMicrotask(()=>{child.emit('spawn');started();});}});
  actual.catch(()=>{}); // original adapter stays alive through actual late close
  lateClose=()=>{child.stdout.end();child.stderr.end();child.emit('exit',0,null);child.emit('close',0,null);};
  return birthObserved.then(()=>{throw failure;});
 };
 await assert.rejects(()=>f.worker.work(f.root,f.jobId(),model),error=>error===failure);const before=f.state();assert.equal(before.jobs[f.jobId()].coordination_release.termination_confirmed,false);lateClose();const after=f.state(),job=after.jobs[f.jobId()];assert.ok(job.model_process_tracking.invocations[0].closure);assert.equal(job.coordination_release.termination_confirmed,true);assert.equal(job.coordination_release.reason,'model_process_closed');assert.equal(job.status,'failed');assert.deepEqual(after.jobs.old,before.jobs.old);assert.equal(after.records[f.grant_ref.id].origin_mechanical_qa.used_attempts,1);
});
