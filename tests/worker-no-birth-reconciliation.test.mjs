// Controlled Source observations only: the default engine/runtime/Original
// launch path and Store journal are real; Node's spawn boundary returns a test
// emitter. No OS worker, CLI, provider or Native qualification is exercised.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store,SCHEMA,VERSION,installedTeam,teamHash,stamp} from '../plugins/soloco/runtime/store.mjs';
import {reference} from '../plugins/soloco/runtime/specialists.mjs';
import {resourceClaims} from '../plugins/soloco/runtime/state-projections.mjs';
import {reconcileOriginalWorkerNoBirthClosureFrom} from '../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs';

const instruction='Controlled Source no-birth reconciliation; no external execution, retry or allowance renewal.';
const ready=()=>({available:true,authenticated:true,version:'SOURCE-controlled-worker'});
const worker=fileURLToPath(new URL('../plugins/soloco/runtime/worker.mjs',import.meta.url));
function fixture(t){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-worker-no-birth-SOURCE-'))),root=path.join(base,'company');fs.mkdirSync(root);
  const previous=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(base,'bindings');
  const args={root,session_id:'SOURCE-founder'},store=new Store(root,true),children=[];
  t.after(()=>{for(const child of children)child.removeAllListeners();store.close();if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;fs.rmSync(base,{recursive:true,force:true});});
  const team={...installedTeam(),roles:{engineer:{name:'Engineering'},research:{name:'Research'},qa:{name:'QA'}},governance:'Read only; preserve failures and uncertainty.',cos_instructions:instruction};
  store.transaction('company.created',()=>({schema:SCHEMA,runtime_version:VERSION,id:'SOURCE-'+randomUUID(),name:'Controlled worker failure fixture',idea:instruction,phase:'Frame',mode:'preparation',paused:false,...team,team_sha256:teamHash(team),owner:{host:'codex',session_id:args.session_id,epoch:1},records:{},sessions:{},jobs:{},messages:[],notices:[],created_at:stamp()}));
  if(store.storageInfo().format!=='normalized-v4')store.migrate();engine.bind(root,args.session_id,'codex');
  const f={args,root,store,read:()=>store.read(),sequence:0};
  f.reconcile=(id,extra={})=>engine.control({...args,action:'reconcile_process_closure',expected_epoch:1,source_instruction:instruction,job_id:id,...extra},'codex');
  f.dispatch=({role='engineer',profile,pid,...extra}={})=>{
    const child=new EventEmitter();child.pid=pid;child.kill=()=>true;child.unref=()=>child;children.push(child);let calls=0,launchedJob;
    const replacement=mock.method(childProcess,'spawn',(command,argv,options)=>{
      assert.equal(++calls,1);assert.equal(command,process.execPath);
      assert.equal(argv.length,4);assert.deepEqual(argv.slice(0,3),['--no-warnings',worker,root]);assert.match(argv[3],/^job-/);launchedJob=argv[3];
      assert.deepEqual(Object.keys(options).sort(),['cwd','detached','env','stdio']);assert.equal(options.cwd,path.resolve(process.cwd()));assert.equal(options.detached,true);assert.equal(options.stdio,'ignore');assert.deepEqual(options.env,{...process.env,COMPANY_WORKER:'1'});
      assert.equal(child.pid,pid,'the Original boundary sees the declared PID on its FIRST return');return child;
    });syncBuiltinESMExports();
    try{
      const job=engine.dispatch({...args,epoch:1,role,task:profile?.specialist.definition.task??'Retain all fictional failure evidence.',...(profile?{specialist_ref:reference(profile)}:{}),...extra},'codex',{check:ready});
      assert.equal(calls,1);assert.equal(job.id,launchedJob);return {job,child};
    }finally{replacement.mock.restore();syncBuiltinESMExports();}
  };
  f.fail=(entry,{close=true}={})=>{entry.child.emit('error',Object.assign(Error('SOURCE ENOENT before worker birth'),{code:'ENOENT'}));if(close)entry.child.emit('close',-2,null);return f.read().jobs[entry.job.id];};
  f.profiles=count=>{
    const action=(kind,input)=>engine.specialists({...args,epoch:1,action:kind,operation_id:'SOURCE-profile-'+(++f.sequence),source_instruction:instruction,...input},'codex');
    const policy=action('authorize',{policy:{base_roles:['engineer'],input_ids:[],scope:'Controlled no-birth Source evidence only.',expires_at:new Date(Date.now()+3600000).toISOString(),max_profiles:4,max_assignments:10}});
    return Array.from({length:count},(_,i)=>action('create',{policy_ref:reference(policy),definition:{base_role:'engineer',charter:{name:'SOURCE no-birth profile '+i,mission:'Retain failure.',inputs:'No external input.',outputs:'No executed work.',block:'Missing authority.',success:'Preserve uncertainty.',failure:'Claim success.',phase:'Source test only.'},task:'Retain fictional no-birth failure.',acceptance:'No new execution or refund.',input_ids:[],expires_at:new Date(Date.now()+1800000).toISOString(),max_assignments:3}}));
  };
  return f;
}
function noRelease(f,id){assert.notEqual(f.read().jobs[id].coordination_release?.termination_confirmed,true);assert.throws(()=>f.reconcile(id),/Hold|closure|CLOSURE|SOURCE|WRITE/);assert.notEqual(f.read().jobs[id].coordination_release?.termination_confirmed,true);}

test('actual Original no-birth close permits owner reconciliation and same-session reuse without refunding the failed assignment',t=>{
  const f=fixture(t),[profile]=f.profiles(1),entry=f.dispatch({profile,resources:['SOURCE/shared']}),failed=f.fail(entry);
  assert.equal(failed.status,'failed');assert.equal(failed.started_at,undefined);assert.equal(failed.original_execution_assignment.launches[0].birth,null);assert.equal(failed.original_execution_assignment.launches[0].closure.never_started,true);
  assert.equal(resourceClaims(f.read()).length,1);assert.throws(()=>f.dispatch({profile}),/uncertain|closure/);
  const result=f.reconcile(failed.id),after=f.read().jobs[failed.id];assert.equal(result.closure_reconciled,true);assert.equal(result.termination_confirmed,true);
  assert.equal(after.coordination_release.reason,'worker_not_started');assert.deepEqual({...after,coordination_release:failed.coordination_release},failed);assert.equal(resourceClaims(f.read()).length,0);
  const release=after.coordination_release,replay=f.reconcile(failed.id);assert.equal(replay.closure_reconciled,false);assert.deepEqual(f.read().jobs[failed.id].coordination_release,release);
  const next=f.dispatch({profile,resources:['SOURCE/shared']}).job;assert.equal(next.instance_id,failed.instance_id);
  const used=Object.values(f.read().jobs).filter(j=>j.specialist?.profile.id===profile.id);assert.equal(used.length,2);assert.equal(used.find(j=>j.id===failed.id).status,'failed');
});

test('three genuine worker-only no-birth failures leave capacity available to a distinct profile after reconciliation',t=>{
  const f=fixture(t),profiles=f.profiles(4),failed=[];
  for(const profile of profiles.slice(0,3)){const j=f.fail(f.dispatch({profile}));failed.push(j.id);assert.equal(f.reconcile(j.id).termination_confirmed,true);}
  const next=f.dispatch({profile:profiles[3]}).job;assert.equal(next.status,'queued');assert.equal(Object.keys(f.read().jobs).length,4);
  for(const id of failed)assert.equal(f.read().jobs[id].status,'failed');
});

test('an arbitrary injected launch throw remains UNKNOWN and cannot release or reuse its role session',t=>{
  const f=fixture(t),error=Error('SOURCE arbitrary launch exception');
  assert.throws(()=>engine.dispatch({...f.args,epoch:1,role:'engineer',task:instruction},'codex',{check:ready,launch(){throw error;}}),observed=>observed===error);
  const j=Object.values(f.read().jobs)[0];assert.equal(j.coordination_release.reason,'worker_not_started_unverified');assert.deepEqual(j.original_execution_assignment.launches,[]);noRelease(f,j.id);
  assert.throws(()=>f.dispatch(),/uncertain|closure/);
});

test('error without close and close without error confer no never-started proof; a real late close can be reconciled',t=>{
  const f=fixture(t),entry=f.dispatch(),errorOnly=f.fail(entry,{close:false});assert.equal(errorOnly.original_execution_assignment.launches[0].closure,null);noRelease(f,errorOnly.id);
  entry.child.emit('close',-2,null);assert.equal(f.reconcile(errorOnly.id).termination_confirmed,true);
  const closeOnly=f.dispatch({role:'research'});closeOnly.child.emit('close',0,null);const j=f.read().jobs[closeOnly.job.id];assert.equal(j.original_execution_assignment.launches[0].closure,null);noRelease(f,j.id);
});

test('copied state or copied closure DATA cannot acquire the Original observer or reconciliation identity',t=>{
  const f=fixture(t),closed=f.fail(f.dispatch()),pending=f.fail(f.dispatch({role:'research'}),{close:false});
  assert.throws(()=>f.store.transaction('job.process_closure_reconciled',s=>{reconcileOriginalWorkerNoBirthClosureFrom(f.store,structuredClone(s),closed.id);return s;}),/WRITE_REQUIRED/);
  assert.throws(()=>f.store.transaction('SOURCE.copied-closure',s=>{s.jobs[pending.id].original_execution_assignment.launches[0].closure=structuredClone(closed.original_execution_assignment.launches[0].closure);return s;}),/CLOSE_REQUIRED|UNISSUED_ASSIGNMENT_CHANGE|WRITE/);
  noRelease(f,pending.id);assert.notEqual(f.read().jobs[closed.id].coordination_release?.termination_confirmed,true);
});

test('a born worker or any model/development/execution marker keeps the no-birth path held',t=>{
  const f=fixture(t),born=f.fail(f.dispatch({pid:910001}));assert.equal(born.original_execution_assignment.launches[0].birth.pid,910001);assert.equal(born.original_execution_assignment.launches[0].closure.never_started,false);noRelease(f,born.id);
  const mixed=f.fail(f.dispatch({role:'research'}));f.store.transaction('SOURCE.mixed-tracking',s=>{s.jobs[mixed.id].model_process_tracking=null;return s;});noRelease(f,mixed.id);
  const clocked=f.fail(f.dispatch({role:'qa'}));f.store.transaction('SOURCE.unproved-execution-marker',s=>{s.jobs[clocked.id].execution_started_at=null;return s;});noRelease(f,clocked.id);
});

for(const [field,value]of [['artifact_id','SOURCE-contradictory-artifact'],['model_evidence',{verification:'unverified'}],['execution_failure',{termination_confirmed:false,outcome:'failure'}],['rejected_output',{uncertainty:'Retained UNKNOWN output'}]])test(`contradictory ${field} metadata cannot be cleared by a worker-only no-birth receipt`,t=>{
  const f=fixture(t),job=f.fail(f.dispatch());
  f.store.transaction('SOURCE.retained-execution-marker',s=>{s.jobs[job.id][field]=value;return s;});
  noRelease(f,job.id);assert.deepEqual(f.read().jobs[job.id][field],value);
});

test('owner, epoch, closed public input and exact preimage remain mandatory even for a genuine no-birth close',t=>{
  const f=fixture(t),closed=f.fail(f.dispatch());engine.bind(f.root,'SOURCE-other-owner','codex');
  assert.throws(()=>f.reconcile(closed.id,{session_id:'SOURCE-other-owner'}),/does not own/);assert.throws(()=>f.reconcile(closed.id,{expected_epoch:2}),/does not own/);
  assert.throws(()=>f.reconcile(closed.id,{proof:{termination_confirmed:true}}),/only|accepts/);
  assert.throws(()=>f.store.transaction('job.process_closure_reconciled',s=>{s.jobs[closed.id].error='Changed before consuming the proof.';reconcileOriginalWorkerNoBirthClosureFrom(f.store,s,closed.id);return s;}),/SOURCE_CHANGED/);
  assert.equal(f.reconcile(closed.id).termination_confirmed,true);
});
