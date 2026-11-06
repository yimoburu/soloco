import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call} from '../plugins/soloco/runtime/main.mjs';
import {Store,withStore,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {resourceClaims} from '../plugins/soloco/runtime/coordination.mjs';
import {runFictionalQualification} from '../tools/qualify-fictional.mjs';

// All databases, bindings and sessions are disposable; dispatch never launches
// a worker or provider process. Only work() invokes the injected local adapter.
const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cancel-finalization-')));
const previous=process.env.COMPANY_PLUGIN_DATA;
test.after(()=>{if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(tmp,{recursive:true,force:true});});
const check=()=>({available:true,authenticated:true,version:'synthetic'}),launch=()=>({on(){},unref(){}});
const read=root=>withStore(root,db=>db.read());
async function fixture(revoke=false) {
 const directory=fs.mkdtempSync(path.join(tmp,'fixture-'));
 let root,base,plan,host='codex',target;
 if(revoke){
  let f;
  await assert.rejects(runFictionalQualification({directory,afterPlan:value=>{f=value;throw Error('fixture ready');}}),/fixture ready/);
  ({root,base,plan,host}=f);
  process.env.COMPANY_PLUGIN_DATA=path.join(root,'fixture-plugin-data');
  const page=await call('company_context',{...base,action:'inspect',plan_id:plan.id},host);
  target=await call('company_context',{...base,action:'target',plan_id:plan.id,unit_id:page.units[0].id,source_instruction:'Synthetic cancellation target.'},host);
 }else{
  root=path.join(directory,'project');fs.mkdirSync(root);base={root,session_id:'synthetic-founder',epoch:1};
  process.env.COMPANY_PLUGIN_DATA=path.join(directory,'cache');engine.bind(root,base.session_id,host);engine.open({...base,idea:'Synthetic cancellation fixture.'},host);
  withStore(root,db=>db.transaction('fixture.roles',s=>{s.roles={qa:{name:'QA'}};s.team_sha256=teamHash(s);return s;}));
 }
 const job=engine.dispatch({...base,role:'qa',task:'Bounded synthetic assignment.',resources:['fixture/shared'],...(target?{review_of:target.id}:{})},host,{check,launch});
 const cancel=()=>revoke?call('company_context',{...base,action:'revoke',plan_id:plan.id,source_instruction:'Revoke synthetic maintenance.'},host):call('company_control',{root,session_id:base.session_id,action:'pause',expected_epoch:1,source_instruction:'Cancel synthetic assignment.'},host);
 return {root,base,host,job,cancel,directory,revoke};
}
async function storageRoundTrip(f) {
 const {root,base,host,directory}=f,before=read(root);
 // The receipt can remove only the execution hold, never owner fencing.
 await assert.rejects(call('company_storage',{...base,epoch:2,action:'backup',directory:path.join(directory,'wrong-owner'),source_instruction:'Synthetic stale request.'},host),/own|epoch/i);
 if(f.revoke)await assert.rejects(call('company_storage',{...base,action:'migrate',source_instruction:'Inspect synthetic migrated storage.'},host),/already migrated/);
 else await call('company_storage',{...base,action:'migrate',source_instruction:'Migrate closed synthetic fixture.'},host);
 assert.deepEqual(read(root),before);
 const backup=path.join(directory,'backup'),destination=path.join(directory,'recovered');
 await call('company_storage',{...base,action:'backup',directory:backup,source_instruction:'Back up retained synthetic receipts.'},host);
 const restored=await call('company_storage',{...base,action:'restore',backup_dir:backup,directory:destination,source_instruction:'Recover exact synthetic receipts.'},host);
 assert.equal(restored.readback_verified,true);assert.deepEqual(read(destination),before);
 assert.equal(read(root).paused,true);assert.deepEqual(read(root).notices,before.notices);
}

function pendingAdapter() {
 let reject,options;
 const pending=new Promise((resolve,fail)=>{reject=fail;});
 return {
  model:async(h,native,wire,dir,remaining,selection,value)=>{
   options=value;options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
   return pending;
  },
  aborted:()=>options.signal.aborted?Promise.resolve():new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true})),
  close:confirmed=>reject(Object.assign(Error('Original invocation closure evidence'),{code:'ROLE_ABORTED',...(confirmed===undefined?{}:{termination_confirmed:confirmed})}))
 };
}
async function assertStorageHeld(f) {
 assert.equal(resourceClaims(read(f.root)).length,1);
 for(const action of ['backup','migrate','restore'])await assert.rejects(call('company_storage',{...f.base,action,directory:path.join(f.directory,action),backup_dir:path.join(f.directory,'unused'),source_instruction:'Synthetic outstanding invocation must hold.'},f.host),/Uncertain worker/);
}

test('duplicates before and after pause cannot certify or overwrite the outstanding owner',async()=>{
 for(const confirmed of [false,undefined,true]){
  const f=await fixture(),adapter=pendingAdapter(),owner=work(f.root,f.job.id,adapter.model);
  let duplicateCalls=0;
  const duplicate=async()=>{duplicateCalls++;throw Error('Duplicate must not invoke');};
  try {
   const running=read(f.root);
   await work(f.root,f.job.id,duplicate);
   assert.deepEqual(read(f.root),running);
   await f.cancel();await adapter.aborted();
   const cancelled=read(f.root);
   await work(f.root,f.job.id,duplicate);
   assert.deepEqual(read(f.root),cancelled);
   assert.equal(duplicateCalls,0);
   assert.equal(cancelled.jobs[f.job.id].finished_at,undefined);
   assert.equal(cancelled.jobs[f.job.id].coordination_release,undefined);
   await assertStorageHeld(f);
  } finally {adapter.close(confirmed);await owner;}
  const state=read(f.root),current=state.jobs[f.job.id];
  assert.equal(current.status,'cancelled');assert.equal(current.execution_failure.termination_confirmed,confirmed);
  assert.equal(current.execution_failure.message,'Original invocation closure evidence');
  assert.equal(current.native_id,null);assert.equal(current.artifact_id,undefined);
  if(confirmed===true){
   assert.ok(current.finished_at);assert.equal(current.coordination_release.reason,'model_process_closed');
   assert.equal(resourceClaims(state).length,0);await storageRoundTrip(f);
  }else{
   assert.equal(current.finished_at,undefined);assert.equal(current.coordination_release,undefined);await assertStorageHeld(f);
  }
  const final=read(f.root);await work(f.root,f.job.id,duplicate);assert.deepEqual(read(f.root),final);
 }
});

test('failed startup rechecks ownership when another worker claims before failure handling',async()=>{
 const f=await fixture(),adapter=pendingAdapter();
 withStore(f.root,db=>db.transaction('fixture.invalid_context',s=>{s.jobs[f.job.id].context_sha256='invalid';return s;}));
 const transaction=Store.prototype.transaction;
 let owner,intercepted=false;
 Store.prototype.transaction=function(type,change){
  if(type==='job.failed'&&!intercepted){
   intercepted=true;
   withStore(f.root,db=>transaction.call(db,'fixture.repair_context',s=>{delete s.jobs[f.job.id].context_sha256;return s;}));
   owner=work(f.root,f.job.id,adapter.model);
  }
  return transaction.call(this,type,change);
 };
 try {
  await work(f.root,f.job.id,async()=>{throw Error('Rejected startup must not invoke');});
  assert.equal(intercepted,true);
  const current=read(f.root).jobs[f.job.id];
  assert.equal(current.status,'running');assert.ok(current.execution_started_at);
  assert.equal(current.execution_failure,undefined);assert.equal(current.coordination_release,undefined);
  assert.equal(current.finished_at,undefined);
  await f.cancel();await adapter.aborted();await assertStorageHeld(f);
 } finally {Store.prototype.transaction=transaction;adapter.close(false);await owner;}
 const current=read(f.root).jobs[f.job.id];
 assert.equal(current.status,'cancelled');assert.equal(current.coordination_release,undefined);
 assert.equal(current.finished_at,undefined);await assertStorageHeld(f);
});

test('pause/revoke cancellation finalizes only confirmed closure, then permits exact storage recovery',async()=>{
 for(const revoke of [false,true])for(const confirmed of [true,false,undefined]){
  const f=await fixture(revoke),{root,job}=f;
  await work(root,job.id,async(h,native,wire,dir,remaining,selection,options)=>{
   options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
   await f.cancel();
   // Exercise the actual monitor and its abort signal before adapter rejection.
   await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));
   throw Object.assign(Error('Synthetic adapter cancelled; provider/descendant outcome unknown'),{code:'ROLE_ABORTED',...(confirmed===undefined?{}:{termination_confirmed:confirmed})});
  });
  const state=read(root),current=state.jobs[job.id];
  assert.equal(current.status,'cancelled');assert.equal(current.execution_failure.outcome,'cancellation');
  assert.equal(current.execution_failure.termination_confirmed,confirmed);
  assert.equal(current.native_id,null);assert.equal(current.artifact_id,undefined);
  assert.equal(state.sessions[job.session_key].native_id,null);
  if(confirmed===true){
   assert.ok(current.finished_at);assert.equal(current.coordination_release.reason,'model_process_closed');
   assert.equal(resourceClaims(state).length,0);await storageRoundTrip(f);
  }else{
   assert.equal(current.finished_at,undefined);assert.equal(current.coordination_release,undefined);
   assert.equal(resourceClaims(state).length,1);
   for(const action of ['backup','migrate','restore'])await assert.rejects(call('company_storage',{...f.base,action,directory:path.join(f.directory,action),backup_dir:path.join(f.directory,'unused'),source_instruction:'Synthetic unknown closure must hold.'},f.host),/Uncertain worker/);
  }
 }
});

test('queued cancellation closes truthfully without invoking an adapter, including revocation',async()=>{
 for(const revoke of [false,true]){
  const f=await fixture(revoke);await f.cancel();let invoked=false;
  await work(f.root,f.job.id,async()=>{invoked=true;throw Error('Must not invoke');});
  const current=read(f.root).jobs[f.job.id];
  assert.equal(invoked,false);assert.equal(current.status,'cancelled');assert.ok(current.finished_at);
  assert.equal(current.started_at,undefined);assert.equal(current.execution_started_at,undefined);
  assert.equal(current.coordination_release.reason,'model_not_invoked');
  assert.equal(current.coordination_release.termination_confirmed,true);
  const closed=read(f.root);await work(f.root,f.job.id,async()=>{throw Error('Closed queue must not invoke');});
  assert.deepEqual(read(f.root),closed);await storageRoundTrip(f);
 }
});

test('late success after pause stays quarantined and retains exact evidence through recovery',async()=>{
 const f=await fixture();
 await work(f.root,f.job.id,async(h,native,wire,dir,remaining,selection,options)=>{
  options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));
  await f.cancel();
  return {native_id:'late-native',text:JSON.stringify({content:'Retained late result',messages:[{to:'qa',content:'Must not deliver'}],notices:[]})};
 });
 const state=read(f.root),current=state.jobs[f.job.id];
 assert.equal(current.status,'quarantined');assert.ok(current.finished_at);
 assert.equal(current.coordination_release.termination_confirmed,true);
 assert.equal(state.records[current.artifact_id].content,'Retained late result');
 assert.equal(state.records[current.artifact_id].status,'Quarantined');
 assert.equal(state.sessions[f.job.session_key].native_id,null);assert.equal(state.messages.length,0);
 await storageRoundTrip(f);
});

test('rejected late output after cancellation retains evidence without accepting it',async()=>{
 const f=await fixture();
 await work(f.root,f.job.id,async(h,native,wire,dir,remaining,selection,options)=>{
  options.onSpawn(executionTiming(Date.now(),{timeout_ms:remaining,timeout_reason:options.timeoutReason}));await f.cancel();
  return {native_id:'rejected-native',text:JSON.stringify({content:'Retain rejected result',messages:[{to:'missing',content:'Invalid peer'}],notices:[]})};
 });
 const state=read(f.root),current=state.jobs[f.job.id];
 assert.equal(current.status,'cancelled');assert.ok(current.finished_at);assert.equal(current.artifact_id,undefined);
 assert.match(current.rejected_output.text,/Retain rejected result/);assert.equal(current.rejected_output.author_instance,f.job.instance_id);
 assert.equal(state.sessions[f.job.session_key].native_id,null);assert.equal(state.messages.length,0);
 await storageRoundTrip(f);
});
