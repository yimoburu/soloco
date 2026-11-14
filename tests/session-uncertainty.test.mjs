import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore} from '../plugins/soloco/runtime/store.mjs';
import {reference} from '../plugins/soloco/runtime/specialists.mjs';
import {controlledOriginalWorker} from './controlled-original-worker-fixture.mjs';

// Source mechanics with the real engine, SQLite, worker and Original observers;
// controlled ChildProcess events supply births/closes, never Native evidence.
const injected={
  check:()=>({available:true,authenticated:true,version:'fictional-adapter'}),
  catalog:()=>({supported:true,source:'fictional-catalog',models:[{id:'fictional-alternative'}]}),
  launch:()=>({on(){return this;},unref(){}})
};
const changedSelection={mode:'explicit',model:'fictional-alternative',reason:'Fictional session-retirement boundary test.'};
const instruction='FICTIONAL bounded preparation only; no tools, spending or publication.';
const future=ms=>new Date(Date.now()+ms).toISOString();

async function fixture(fn){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-session-uncertainty-')));
  const previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
  const args={root:path.join(base,'fixture'),session_id:'fictional-founder',epoch:1};
  fs.mkdirSync(args.root);
  const f={args,sequence:0,read:()=>withStore(args.root,db=>db.read()),worker:controlledOriginalWorker(args.root)};
  f.change=fn=>withStore(args.root,db=>db.transaction('fictional.session-uncertainty',s=>{fn(s);return s;}));
  f.queue=(profile,extra={},adapter=injected)=>engine.dispatch({...args,role:'engineer',task:profile?.specialist.definition.task??'Prepare a fictional evidence assessment.',...(profile?{specialist_ref:reference(profile)}:{}),...extra},'codex',adapter);
  f.action=(action,extra)=>engine.specialists({...args,action,operation_id:'fictional-'+(++f.sequence),source_instruction:instruction,...extra},'codex');
  try{
    engine.bind(args.root,args.session_id,'codex');
    engine.open({...args,idea:'Disposable fictional session-closure fixture'},'codex');
    withStore(args.root,db=>db.migrate());
    engine.save({...args,id:'data',kind:'artifact',content:'Fictional observation; no measured business outcome.'},'codex');
    await fn(f);
  }finally{
    f.worker.dispose();
    if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
    fs.rmSync(base,{recursive:true,force:true});
  }
}
function profiles(f,count){
  const policy=f.action('authorize',{policy:{base_roles:['engineer'],input_ids:['data'],scope:'Fictional evidence only.',expires_at:future(86400000),max_profiles:10,max_assignments:20}});
  return Array.from({length:count},(_,i)=>f.action('create',{policy_ref:reference(policy),definition:{base_role:'engineer',charter:{name:'Fictional analyst '+i,mission:'Assess supplied evidence.',inputs:'Exact supplied data.',outputs:'One supported finding.',block:'Missing evidence.',success:'Preserved uncertainty.',failure:'Invented evidence.',phase:'This fixture only.'},task:'Assess fictional supplied evidence '+i+'.',acceptance:'Retain unmeasured outcomes and uncertainty.',input_ids:['data'],expires_at:future(3600000),max_assignments:3}}));
}
async function complete(f,job,native='fictional-closed-native'){
  await f.worker.work(job.id,async()=>{
    return {native_id:native,text:JSON.stringify({content:'FICTIONAL bounded observation.',messages:[],notices:[]})};
  },{nativeId:native});
  const completed=f.read().jobs[job.id];
  assert.equal(completed.status,'completed',completed.error);
  assert.equal(completed.coordination_release.termination_confirmed,true);
  return completed;
}
async function failUncertain(f,job){
  let invokedNative;
  await f.worker.work(job.id,async(_host,native)=>{
    invokedNative=native;
    throw Object.assign(Error('FICTIONAL adapter termination unknown'),{termination_confirmed:false});
  });
  const failed=f.read().jobs[job.id];
  assert.equal(failed.status,'failed',failed.error);
  assert(failed.started_at);
  assert.notEqual(failed.coordination_release?.termination_confirmed,true);
  const invocation=failed.model_process_tracking.invocations.at(-1);
  assert.ok(invocation.birth);assert.equal(invocation.closure,null);
  const original=failed.original_execution_assignment.launches.find(launch=>launch.kind==='model');
  assert.equal(original.birth.pid,invocation.birth.pid);assert.equal(original.closure,null);
  return {job:failed,invokedNative};
}
function confirmFixtureClosure(f,id){
  // The actual adapter/Original observers record this external Source event.
  // This does not reconcile or kill a real Native process or rewrite failure.
  f.worker.close(id);
  const job=f.read().jobs[id],invocation=job.model_process_tracking.invocations.at(-1);
  assert.equal(job.coordination_release.termination_confirmed,true);
  assert.equal(job.coordination_release.reason,'model_process_closed');
  assert.ok(invocation.closure);
  const original=job.original_execution_assignment.launches.find(launch=>launch.kind==='model');
  assert.equal(original.closure.pid,invocation.birth.pid);
}

for(const kind of ['ordinary','profile'])for(const mode of ['reuse','selection-change','fresh']){
  test(`${kind}/${mode}: unknown prior termination fences reuse and retirement until closure`,()=>fixture(async f=>{
    const profile=kind==='profile'?profiles(f,1)[0]:null;
    const first=await complete(f,f.queue(profile));
    const second=f.queue(profile),failed=await failUncertain(f,second);
    assert.equal(failed.invokedNative,first.native_id,'the uncertain invocation used the established native session');
    const extra=mode==='selection-change'?{model_selection:changedSelection}:mode==='fresh'?{fresh_session:true,fresh_session_reason:'Fictional fresh-session closure control.'}:{};
    const before=f.read();
    assert.throws(()=>f.queue(profile,extra),/execution is uncertain|process closure/i);
    const held=f.read();
    assert.deepEqual(held.jobs,before.jobs,'no new job or attempt on a held dispatch');
    assert.deepEqual(held.sessions,before.sessions,'no implicit retirement of an uncertain session');
    assert.deepEqual(held.retired_sessions,before.retired_sessions);
    confirmFixtureClosure(f,second.id);
    const next=f.queue(profile,extra),after=f.read();
    assert.equal(next.status,'queued');
    if(mode==='reuse'){
      assert.equal(next.instance_id,second.instance_id);
      assert.equal(next.native_id,first.native_id);
    }else{
      assert.notEqual(next.instance_id,second.instance_id);
      assert.equal(next.native_id,null);
      assert(after.retired_sessions.some(s=>s.instance_id===second.instance_id));
    }
    assert.equal(after.jobs[second.id].status,'failed','closure never erases the original failure');
    assert.equal(after.jobs[second.id].execution_failure.termination_confirmed,false);
    if(profile)assert.equal(Object.values(after.jobs).filter(j=>j.specialist?.profile.id===profile.id).length,3,'failed assignment remains consumed');
  }));
}

test('a distinct profile below capacity proceeds while the old uncertainty and resource claims remain',()=>fixture(async f=>{
  const [oldProfile,newProfile]=profiles(f,2);
  const old=f.queue(oldProfile,{resources:['fictional/shared']});
  await failUncertain(f,old);
  assert.throws(()=>f.queue(newProfile,{resources:['fictional/shared']}),/reserved|uncertain/i);
  const next=f.queue(newProfile,{resources:['fictional/disjoint']});
  assert.equal(next.status,'queued');
  assert.notEqual(next.instance_id,old.instance_id);
  assert.notEqual(next.session_key,old.session_key);
  assert.equal(next.native_id,null);
  assert.notEqual(f.read().jobs[old.id].coordination_release?.termination_confirmed,true);
}));

for(const status of ['failed','cancelled','interrupted']){
  test(`${status}: three started uncertain jobs occupy capacity until one closure is confirmed`,()=>fixture(async f=>{
    const ps=profiles(f,4),old=[];
    for(const p of ps.slice(0,3)){
      const j=f.queue(p);await failUncertain(f,j);old.push(j.id);
      if(status!=='failed')f.change(s=>{s.jobs[j.id].status=status;});
    }
    const before=f.read();
    assert.throws(()=>f.queue(ps[3]),/active or uncertain|occupied|process closure/i);
    assert.deepEqual(f.read().jobs,before.jobs,'capacity hold creates no fourth assignment');
    confirmFixtureClosure(f,old[0]);
    const next=f.queue(ps[3]);
    assert.equal(next.status,'queued');
    assert.equal(f.read().jobs[old[0]].status,status);
    for(const id of old.slice(1))assert.notEqual(f.read().jobs[id].coordination_release?.termination_confirmed,true);
  }));
}

test('an unverified launch exception retains session uncertainty and consumes capacity without a close witness',()=>fixture(async f=>{
  const ps=profiles(f,4),broken={...injected,launch:()=>{throw Error('FICTIONAL worker never spawned');}};
  for(const p of ps.slice(0,3)){
    assert.throws(()=>f.queue(p,{},broken),/never spawned/);
    const failed=Object.values(f.read().jobs).find(j=>j.specialist?.profile.id===p.id);
    assert.equal(failed.status,'failed');assert.equal(failed.started_at,undefined);
    assert.equal(failed.coordination_release.termination_confirmed,false);
    assert.equal(failed.coordination_release.reason,'worker_not_started_unverified');
    assert.deepEqual(failed.original_execution_assignment.launches,[],'a thrown message is not Original process evidence');
  }
  const before=f.read();
  assert.throws(()=>f.queue(ps[0]),/Prior role session execution is uncertain/);
  assert.throws(()=>f.queue(ps[3]),{code:'ORIGINAL_EXECUTION_CAPACITY_EXHAUSTED'});
  const held=f.read();
  assert.deepEqual(held.jobs,before.jobs);
  assert.deepEqual(held.sessions,before.sessions,'the original session remains retained, without implicit replacement');
  assert.deepEqual(held.retired_sessions,before.retired_sessions);
}));

test('an observed failed model close permits the same session and later distinct-profile capacity while retaining failure evidence',()=>fixture(async f=>{
  const ps=profiles(f,4),failures=[];
  for(const p of ps.slice(0,3)){
    const job=f.queue(p),failure=Object.assign(Error('FICTIONAL original callback failed after observed close'),{code:'FICTIONAL_SOURCE_FAILURE'});
    await f.worker.work(job.id,async(_host,_native,_prompt,_cwd,_timeout,_selection,_options,observed)=>{
      observed.close(1);
      throw failure;
    });
    const failed=f.read().jobs[job.id],invocation=failed.model_process_tracking.invocations.at(-1);
    assert.equal(failed.status,'failed');assert.ok(failed.started_at);assert.ok(failed.finished_at);
    assert.equal(failed.coordination_release.termination_confirmed,true);
    assert.equal(failed.coordination_release.reason,'model_process_closed');
    assert.equal(failed.error,failure.message);assert.equal(failed.execution_failure.message,failure.message);
    assert.equal(failed.execution_failure.code,failure.code);assert.equal(failed.execution_failure.outcome,'failure');
    // No public closure flag was supplied: the observed close permits release,
    // while the original failure record remains exactly that failure.
    assert.equal(failed.execution_failure.termination_confirmed,undefined);
    assert.equal(failed.native_id,null);assert.equal(failed.artifact_id,undefined);
    assert.ok(invocation.birth);assert.equal(invocation.closure.exit_code,1);
    const original=failed.original_execution_assignment.launches.find(launch=>launch.kind==='model');
    assert.equal(original.closure.pid,invocation.birth.pid);assert.equal(original.closure.code,1);
    assert.equal(original.closure.never_started,false);
    failures.push(failed);
  }
  const failed=failures[0];
  const reused=f.queue(ps[0]);
  assert.equal(reused.status,'queued');assert.equal(reused.instance_id,failed.instance_id);assert.equal(reused.native_id,null);
  const distinct=f.queue(ps[3]);
  assert.equal(distinct.status,'queued');assert.notEqual(distinct.instance_id,failed.instance_id);
  const after=f.read();
  for(const prior of failures)assert.deepEqual(after.jobs[prior.id],prior,'new admission preserves the original failed assignment and observed close');
}));
