// Actual adapter/worker/Store/SQLite; only native child/clock are controlled
// contract doubles. No Codex CLI/model, production company or process kill.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store,withStore,id,stamp,digest} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {bindCoordination,resourceClaims} from '../plugins/soloco/runtime/coordination.mjs';
import {TIMEOUT_POLICY_VERSION} from '../plugins/soloco/runtime/timeout.mjs';
import {validModelProcessTracking,modelProcessTransition,reconcileStoredModelProcessClosure} from '../plugins/soloco/runtime/model-process-closure.mjs';
class Clock{constructor(){this.time=Date.now();this.next=0;this.jobs=new Map();}now=()=>this.time;set=(fn,delay)=>{const key=++this.next;this.jobs.set(key,{at:this.time+delay,fn});return key;};clear=key=>this.jobs.delete(key);move(to){let n=0;while(true){const next=[...this.jobs].filter(([,v])=>v.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++n<100);this.time=next[1].at;this.jobs.delete(next[0]);next[1].fn();}this.time=to;}}
class Child extends EventEmitter{constructor(){super();this.pid=731005;this.stdout=new EventEmitter();this.stderr=new EventEmitter();this.stdin=new EventEmitter();this.stdin.end=()=>{};this.signals=[];}kill(signal){this.signals.push(signal);return true;}}
const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-late-model-close-')),previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(base,'registry');
test.after(()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(base,{recursive:true,force:true});});
const read=f=>withStore(f.root,db=>db.read());
function fixture(){
 const root=fs.mkdtempSync(path.join(base,'company-')),session_id='synthetic-original-owner';engine.bind(root,session_id,'codex');engine.open({root,session_id,idea:'Controlled original late-close lifecycle'},'codex');withStore(root,db=>db.migrate());
 const job_id=id('job'),instance_id=id('engineer');withStore(root,db=>db.transaction('fixture.queued',s=>{s.sessions[instance_id]={instance_id,role:'engineer',native_id:null,host:'codex'};s.jobs[job_id]={id:job_id,role:'engineer',session_key:instance_id,instance_id,host:'codex',epoch:1,status:'queued',task:'Controlled read-only fixture; no external action',inputs:[],review_of:null,coordination:bindCoordination(s,{resources:['original-output']}),timeout_policy_version:TIMEOUT_POLICY_VERSION,timeout_ms:1000,timeout_reason:'Controlled finite fake-clock timeout',created_at:stamp()};return s;}));return {root,session_id,job_id};
}
async function timeout(f,{failReconcile=false,dualField=false,latePipeErrors=false}={}){
 let child,clock,adapterResult;const original=Store.prototype.transaction;let blocked=0;
 const model=(_host,_native,prompt,cwd,limit,selection,options)=>{
  child=new Child();clock=new Clock();
  const result=runModel('codex',null,prompt,cwd,limit,selection,{...options,now:clock.now,setTimeout:clock.set,clearTimeout:clock.clear,resolveExecutable:()=>'/controlled-not-qualified/codex',spawn:()=>child});
  adapterResult=result.then(value=>({value}),error=>({error}));child.emit('spawn');clock.move(clock.time+limit+3000);return result;
 };
 await work(f.root,f.job_id,model);
 const failed=read(f).jobs[f.job_id];assert.equal(failed.status,'failed',failed.error);assert.equal(failed.execution_failure.termination_confirmed,false);assert.equal(failed.coordination_release,undefined);assert.equal(resourceClaims(read(f)).length,1);
 if(failReconcile||dualField)Store.prototype.transaction=function(type,change,...args){if(type==='job.process_closure_reconciled'&&failReconcile){blocked++;throw Error('Controlled second-write interruption after durable closure');}if(type==='job.model_process.closed'&&dualField)return original.call(this,type,s=>{const next=change(s);next.jobs[f.job_id].native_id='controlled-dual-field-native';return next;},...args);return original.call(this,type,change,...args);};
 try{if(latePipeErrors)for(const [name,stream]of [['stdout',child.stdout],['stderr',child.stderr],['stdin',child.stdin]])assert.doesNotThrow(()=>stream.emit('error',Error('controlled late '+name+' pipe error')),'original '+name+' errors must stay observed until actual childclose');child.emit('close',0,null);}finally{Store.prototype.transaction=original;}
 return {failed,child,clock,adapter:await adapterResult,blocked};
}
test('timeout remains failed while actual late original close releases only its existing resource claim',async()=>{
 const f=fixture(),{failed,child,clock,adapter}=await timeout(f),state=read(f),after=state.jobs[f.job_id];
 assert.equal(adapter.error.termination_confirmed,false,'original timeout evidence must remain immutable');assert.deepEqual(after.execution_failure,failed.execution_failure);assert.equal(after.status,'failed');assert.equal(after.finished_at,failed.finished_at);assert.equal(after.artifact_id,undefined);assert.equal(Object.keys(state.jobs).length,1);
 assert.equal(after.coordination_release?.termination_confirmed,true);assert.equal(after.coordination_release.reason,'model_process_closed');assert.equal(resourceClaims(state).length,0);assert.ok(validModelProcessTracking(after.model_process_tracking));assert.equal(after.model_process_tracking.invocations.length,1);
 assert.equal(after.model_process_tracking.invocations[0].closure.observation,'original-child-close');assert.deepEqual(child.signals,['SIGTERM','SIGKILL']);assert.equal(clock.jobs.size,0);assert.equal(child.listenerCount('close'),0);assert.equal(child.listenerCount('spawn'),0);assert.equal(child.listenerCount('error'),0);
 const result=engine.control({root:f.root,session_id:f.session_id,expected_epoch:1,action:'reconcile_process_closure',job_id:f.job_id,source_instruction:'Controlled observational readback only.'},'codex');assert.equal(result.closure_reconciled,false);assert.equal(result.semantic_acceptance,false);assert.equal(result.execution_resumed,false);assert.equal(result.new_model_calls,0);
});
test('cold supported reconciliation consumes actual durable closure after second-write failure without replay',async()=>{
 const f=fixture(),{failed,blocked}=await timeout(f,{failReconcile:true});let state=read(f),job=state.jobs[f.job_id];assert.equal(blocked,1);assert.equal(job.coordination_release,undefined);assert.ok(job.model_process_tracking.invocations[0].closure);assert.equal(resourceClaims(state).length,1);
 // No adapter/worker survives this step. The owner action must read the original
 // actual normalized event/immutable proof, not receive a process Boolean.
 const result=engine.control({root:f.root,session_id:f.session_id,expected_epoch:1,action:'reconcile_process_closure',job_id:f.job_id,source_instruction:'Controlled exact retained closure reconciliation.'},'codex');assert.equal(result.closure_reconciled,true);state=read(f);job=state.jobs[f.job_id];assert.deepEqual(job.execution_failure,failed.execution_failure);assert.equal(job.status,'failed');assert.equal(job.artifact_id,undefined);assert.equal(resourceClaims(state).length,0);assert.equal(job.model_process_tracking.invocations.length,1);
});
test('historical timeout with no original producer evidence cannot be closed by PID or caller proof',()=>{
 const f=fixture();withStore(f.root,db=>db.transaction('fixture.historical_timeout',s=>{const j=s.jobs[f.job_id];j.status='failed';j.started_at=stamp();j.worker_pid=process.pid;j.execution_failure={code:'ROLE_TIMEOUT',termination_confirmed:false};return s;}));
 const args={root:f.root,session_id:f.session_id,expected_epoch:1,action:'reconcile_process_closure',job_id:f.job_id,source_instruction:'Controlled unsupported historical closure.'},before=JSON.stringify(read(f));
 for(const extra of [{},{termination_confirmed:true},{pid:731005},{proof:{closed:true}}])assert.throws(()=>engine.control({...args,...extra},'codex'));
 assert.equal(JSON.stringify(read(f)),before);assert.equal(resourceClaims(read(f)).length,1);
});
test('forged readable job closure without exact runtime producer events remains held',async()=>{
 const f=fixture();await timeout(f,{failReconcile:true});withStore(f.root,db=>db.transaction('fixture.forged_tracking',s=>{const e=s.jobs[f.job_id].model_process_tracking.invocations[0];e.birth.launch_id='forged-reused-PID';e.closure.birth_sha256=digest(JSON.stringify(e.birth));return s;}));
 assert.throws(()=>engine.control({root:f.root,session_id:f.session_id,expected_epoch:1,action:'reconcile_process_closure',job_id:f.job_id,source_instruction:'Controlled forged readable snapshot.'},'codex'));assert.equal(read(f).jobs[f.job_id].coordination_release,undefined);assert.equal(resourceClaims(read(f)).length,1);
});

const wire=text=>[{type:'thread.started',thread_id:'synthetic-closed-thread'},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text}},{type:'turn.completed'}].map(JSON.stringify).join('\n')+'\n';
test('ordinary successful adapter result retains matching birth and closure and completes once',async()=>{
 const f=fixture();await work(f.root,f.job_id,(host,native,prompt,cwd,limit,selection,options)=>{
  const child=new Child(),clock=new Clock(),promise=runModel(host,native,prompt,cwd,limit,selection,{...options,now:clock.now,setTimeout:clock.set,clearTimeout:clock.clear,resolveExecutable:()=>'/controlled-not-qualified/codex',spawn:()=>child});child.emit('spawn');child.stdout.emit('data',wire(JSON.stringify({content:'Controlled complete output',messages:[],notices:[]})));child.emit('close',0,null);return promise;
 });
 const state=read(f),job=state.jobs[f.job_id];assert.equal(job.status,'completed',job.error);assert.equal(job.coordination_release.termination_confirmed,true);assert.ok(job.artifact_id);assert.equal(state.records[job.artifact_id].content,'Controlled complete output');assert.ok(validModelProcessTracking(job.model_process_tracking));assert.equal(job.model_process_tracking.invocations.length,1);assert.ok(job.model_process_tracking.invocations[0].closure);assert.equal(resourceClaims(state).length,0);
 assert.throws(()=>engine.control({root:f.root,session_id:f.session_id,expected_epoch:1,action:'reconcile_process_closure',job_id:f.job_id,source_instruction:'Cannot reinterpret completed output.'},'codex'));
});
test('earlier read closure and reused PID cannot release the later uncertain invocation',async()=>{
 const f=fixture();let source;
 withStore(f.root,db=>db.transaction('fixture.format3',s=>{source={id:'source',revision:1,kind:'artifact',content:'Complete controlled supplemental original'};s.records.source=source;const j=s.jobs[f.job_id];j.timeout_ms=10000;j.timeout_reason='Controlled two-invocation fake-clock fixture with finite original total window';j.context_format=3;j.supplemental_sources=[{id:source.id,revision:1,sha256:digest(JSON.stringify(source))}];return s;}));
 let calls=0,last,first;
 await work(f.root,f.job_id,(host,native,prompt,cwd,limit,selection,options)=>{
  const child=new Child(),clock=new Clock(),promise=runModel(host,native,prompt,cwd,limit,selection,{...options,now:clock.now,setTimeout:clock.set,clearTimeout:clock.clear,resolveExecutable:()=>'/controlled-not-qualified/codex',spawn:()=>child});child.emit('spawn');
  if(calls++===0){first=child;child.stdout.emit('data',wire(JSON.stringify({reads:[{id:source.id,sha256:digest(JSON.stringify(source)),offset:0,length:20}]})));child.emit('close',0,null);}else{last=child;clock.move(clock.time+limit+3000);}return promise;
 });
 let state=read(f),job=state.jobs[f.job_id];assert.equal(calls,2,job.error);assert.equal(job.status,'failed');assert.equal(job.model_process_tracking.invocations.length,2);assert.ok(job.model_process_tracking.invocations[0].closure);assert.equal(job.model_process_tracking.invocations[1].closure,null);assert.equal(job.coordination_release,undefined);assert.equal(resourceClaims(state).length,1);
 first.emit('close',0,null);assert.equal(read(f).jobs[f.job_id].coordination_release,undefined);
 last.emit('close',0,null);state=read(f);job=state.jobs[f.job_id];assert.equal(job.status,'failed');assert.equal(job.coordination_release.termination_confirmed,true);assert.equal(resourceClaims(state).length,0);assert.notEqual(job.model_process_tracking.invocations[0].birth.launch_id,job.model_process_tracking.invocations[1].birth.launch_id);assert.equal(job.model_process_tracking.invocations[0].birth.pid,job.model_process_tracking.invocations[1].birth.pid);
});


test('cancelled original invocation may close observationally while paused without resume or artifact',async()=>{
 const f=fixture();let child,clock;
 await work(f.root,f.job_id,(host,native,prompt,cwd,limit,selection,options)=>{
  child=new Child();clock=new Clock();const promise=runModel(host,native,prompt,cwd,limit,selection,{...options,now:clock.now,setTimeout:clock.set,clearTimeout:clock.clear,resolveExecutable:()=>'/controlled-not-qualified/codex',spawn:()=>child});child.emit('spawn');
  engine.control({root:f.root,session_id:f.session_id,expected_epoch:1,action:'pause',source_instruction:'Controlled pause; no retry or fresh authority.'},'codex');clock.move(clock.time+limit+3000);return promise;
 });
 let state=read(f),before=state.jobs[f.job_id];assert.equal(before.status,'cancelled');assert.equal(before.coordination_release,undefined);assert.equal(before.finished_at,undefined);assert.equal(state.paused,true);assert.equal(resourceClaims(state).length,1);
 child.emit('close',null,'SIGKILL');state=read(f);const after=state.jobs[f.job_id];assert.equal(after.status,'cancelled');assert.equal(after.coordination_release.termination_confirmed,true);assert.ok(after.finished_at);assert.deepEqual(after.execution_failure,before.execution_failure);assert.equal(after.artifact_id,undefined);assert.equal(state.paused,true);assert.equal(Object.keys(state.jobs).length,1);assert.equal(resourceClaims(state).length,0);
});


test('unrelated runtime journals do not consume the target-job reconciliation inventory',async()=>{
 const f=fixture();await timeout(f,{failReconcile:true});
 withStore(f.root,store=>{
  const at=stamp(),row=store.db.prepare('SELECT MAX(seq) AS seq FROM events').get();let seq=row.seq;
  // Controlled unrelated inventory proves the reader admits by exact job, not
  // all-company history. It grants no target closure or native authority.
  const entry={revision:1,owner:{},storage_delta:{changes:[{after:{family:'jobs',key:'unrelated-job',sha256:'0'.repeat(64)}}]}};
  store.db.exec('BEGIN');try{const insert=store.db.prepare('INSERT INTO events(seq,at,type,value)VALUES(?,?,?,?)');for(let i=0;i<10001;i++)insert.run(++seq,at,'job.model_process.closed',JSON.stringify(entry));store.db.exec('COMMIT');}catch(e){store.db.exec('ROLLBACK');throw e;}
 });
 const result=engine.control({root:f.root,session_id:f.session_id,expected_epoch:1,action:'reconcile_process_closure',job_id:f.job_id,source_instruction:'Controlled targeted readback; unrelated producer inventory is not proof.'},'codex');assert.equal(result.closure_reconciled,true);assert.equal(read(f).jobs[f.job_id].status,'failed');assert.equal(resourceClaims(read(f)).length,0);
});


test('cold closure provenance rejects an actual dual-field runtime event without releasing the original claim',async()=>{
 const f=fixture();await timeout(f,{failReconcile:true,dualField:true});const before=read(f),job=before.jobs[f.job_id];assert.equal(job.native_id,'controlled-dual-field-native');assert.ok(job.model_process_tracking.invocations[0].closure);assert.equal(job.coordination_release,undefined);
 const event=withStore(f.root,store=>{const e=store.db.prepare("SELECT value FROM events WHERE type='job.model_process.closed' ORDER BY seq DESC LIMIT 1").get();const d=JSON.parse(e.value).storage_delta,ref=d.changes.find(c=>c.after?.family==='jobs'&&c.after.key===f.job_id),get=r=>JSON.parse(store.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(r.sha256).bytes);return {before:get(ref.before),after:get(ref.after)};});
 assert.equal(event.before.model_process_tracking.invocations[0].closure,null);assert.ok(event.after.model_process_tracking.invocations[0].closure);assert.notEqual(event.before.native_id,event.after.native_id,'the real Store producer event must contain the second changed field');
 const args={root:f.root,session_id:f.session_id,expected_epoch:1,action:'reconcile_process_closure',job_id:f.job_id,source_instruction:'Controlled actual dual-field event provenance rejection only.'};
 assert.throws(()=>engine.control(args,'codex'),error=>error.code==='MODEL_PROCESS_CLOSURE_HELD','cold proof must not accept a physical-journal event that also changed native identity');
 assert.deepEqual(read(f),before,'failed cold reconciliation must leave the full retained journal, failure, altered-field evidence and claim intact');assert.equal(resourceClaims(read(f)).length,1);
});


test('late original pipe errors remain observed until durable closure without replacing timeout failure',async()=>{
 const f=fixture(),{failed,child,clock}=await timeout(f,{latePipeErrors:true}),after=read(f).jobs[f.job_id];
 assert.deepEqual(after.execution_failure,failed.execution_failure);assert.equal(after.status,'failed');assert.equal(after.artifact_id,undefined);assert.equal(after.coordination_release?.termination_confirmed,true);assert.ok(after.model_process_tracking.invocations[0].closure);assert.equal(resourceClaims(read(f)).length,0);assert.equal(clock.jobs.size,0);
 for(const stream of [child,child.stdout,child.stderr,child.stdin])assert.equal(stream.listenerCount('error'),0,'all original pipe error listeners must be removed after actual close');
});
