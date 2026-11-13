// AUTHORED, UNRUN Source cases. These exercise genuine temporary Store/ledger
// writers and private launch boundaries. No synthetic creation/drain issuer or
// currentNative override supplies a successful fresh-owner release. That
// positive requires the actual fixed interpreter, owner admission and domain
// creation/drain chain, which remains outside these reachable negative cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import {denyInventoryExternalEffects,freshInventoryStore,historicalInventoryStore,inventorySourceModules,controlledInventoryChild} from './original-global-worker-inventory-fixture.mjs';

const originalHold=error=>error instanceof Error&&typeof error.code==='string'&&error.code.startsWith('ORIGINAL_EXECUTION_');
const ownerHold=error=>error instanceof Error&&error.code==='OWNER_MAINTENANCE_ORIGINAL_REQUIRED';
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
function facts(f,occupied){
  const value=f.inspect();
  assert.equal(value.protocol,'original-local-execution-inventory-v1');
  assert.equal(value.retained_row_census_complete,true);
  assert.equal(value.admission_launch_coverage_complete,true);
  assert.equal(value.cardinality_known,true);
  assert.equal(value.unit,'legacy-standalone-assignment');
  assert.equal(value.occupied,occupied);assert.equal(value.remaining,3-occupied);
  assert.equal(value.physical_domain_closed,false);
  return value;
}
function claimedFreshResult(native_id='SYNTHETIC-unobserved-fresh-native'){
  // Deliberately untrusted DATA only: no production issuer creates this object.
  const admission_ref={family:'work_items',id:'SYNTHETIC-owner-admission',revision:1,sha256:'a'.repeat(64)};
  const creation_ref={family:'work_items',id:'SYNTHETIC-owner-creation',revision:1,sha256:'b'.repeat(64)};
  return {kind:'owner_handover_qualification',fresh_review_purpose:'peer-owner-maintenance-fresh-purpose-v1',
    creation_mode:'fresh-original-protected-thread',profile_id:'soloco-origin-final-review-readonly-v1',
    admission_ref,creation_ref,native_id,thread_id:native_id,owned_task_drained:true,termination_confirmed:true,
    drain:{protocol:'peer-owned-admitted-task-drain-v1',kind:'owner-handover-review',admission_ref,
      native_id,thread_id:native_id,terminal_status:'completed',group_absent:null,remote_domain_closed:false,
      whole_domain_closed:false,prior_unknown_slots_released:false}};
}
async function unqualifiedPeer(t){
  const {peerFixture}=await import('./peer-fixture.mjs'),f=peerFixture();t.after(()=>f.close());
  const {producer}=await inventorySourceModules();return {...f,producer};
}
const peerState=f=>f.ledger.read(tx=>JSON.stringify({slots:tx.list('slots',{limit:100}).items,
  work_items:tx.list('work_items',{limit:100}).items,events:tx.events({limit:100}).items}));

test('fresh-owner-looking result DATA cannot convert a genuine resumed legacy assignment',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  const job=f.queue({role:'reviewer',native_id:'SYNTHETIC-retained-qualified-reviewer'});
  const assignment=JSON.stringify(job.original_execution_assignment);
  f.store.transaction('job.failed',state=>{
    const current=state.jobs[job.id];current.status='failed';current.result=claimedFreshResult();
    current.coordination_release={termination_confirmed:false,reason:'No original close or owner drain was observed.'};
    return state;
  });
  const current=f.state().jobs[job.id];
  assert.equal(current.native_id,job.native_id,'fresh runtime DATA cannot replace the legacy resume identity');
  assert.equal(JSON.stringify(current.original_execution_assignment),assignment);
  assert.equal(current.coordination_release.termination_confirmed,false);
  facts(f,1);assert.equal(f.state().paused,true);
});

test('fresh-owner drain claims cannot free any of three genuine UNKNOWN legacy reservations',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  const jobs=[f.queue(),f.queue({host:'claude'}),f.queue({host:'local'})];
  const unrelated=JSON.stringify(jobs.slice(1).map(job=>f.state().jobs[job.id]));
  f.store.transaction('job.failed',state=>{
    const job=state.jobs[jobs[0].id];job.status='failed';job.result=claimedFreshResult();
    job.coordination_release={termination_confirmed:false,reason:'Untrusted fresh-owner result is not original closure.'};
    return state;
  });
  facts(f,3);const before=JSON.stringify(f.state()),event=f.store.changeToken();
  assert.throws(()=>f.queue(),error=>error.code==='ORIGINAL_EXECUTION_CAPACITY_EXHAUSTED');
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),event);
  assert.equal(JSON.stringify(jobs.slice(1).map(job=>f.state().jobs[job.id])),unrelated);
});

test('typed fresh-owner release history cannot replace genuine original peer coverage',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await unqualifiedPeer(t);let admission_ref;
  // A real ledger write persists these negative rows under an explicitly
  // non-producer event. It does not impersonate owner/maintenance.admit.
  f.ledger.write('SYNTHETIC.unqualified-owner-release-DATA','founder',tx=>{
    const result=claimedFreshResult(),admission=tx.put('work_items','SYNTHETIC-owner-admission',{
      kind:'owner_maintenance_admission',binding:{kind:'owner-handover-review',
        fresh_review_purpose:result.fresh_review_purpose,creation_mode:result.creation_mode,
        reviewer_native_id:'SYNTHETIC-qualified-reviewer'}},0);
    admission_ref=ref('work_items',admission);
    tx.put('work_items','SYNTHETIC-owner-result',{...result,admission_ref},0);
    tx.put('slots','SYNTHETIC-owner-execution',{kind:'owner_maintenance_slot',status:'released',
      admission_ref,termination_confirmed:true,owned_task_drained:true},0);
    tx.put('effects','SYNTHETIC-owner-execution',{kind:'owner_maintenance_effect',status:'succeeded',
      admission_ref,termination_confirmed:true,owned_task_drained:true},0);
  });
  const before=peerState(f);
  assert.throws(()=>f.producer.assertOriginalPeerMaintenanceExecutionCapacityFrom(f.ledger,{stage:'existing',admission_ref}),originalHold);
  assert.equal(peerState(f),before,'Held census cannot repair or qualify the negative rows');
});

test('copied owner creation and drain facts cannot claim original owner or peer capabilities',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await unqualifiedPeer(t);
  const owner=await import('../plugins/soloco/runtime/peers/owner-handover.mjs');
  const copied=claimedFreshResult(),before=peerState(f);
  for(const fake of [{},structuredClone(copied),Object.create(copied)]){
    assert.throws(()=>f.producer.claimOriginalPeerExecutionLaunchFrom(f.ledger,{admission_ref:copied.admission_ref}),originalHold);
    assert.throws(()=>f.producer.spawnOriginalPeerExecutionLaunch(fake,process.execPath,['SYNTHETIC-never-launch'],{}),originalHold);
    await assert.rejects(owner.bindOriginalPeerOwnerMaintenanceNative(fake,copied),ownerHold);
    await assert.rejects(owner.completeOriginalPeerOwnerMaintenance(fake,copied.drain),ownerHold);
  }
  assert.equal(peerState(f),before);assert.deepEqual(attempted,[]);
});

test('copied fresh-owner release records cannot enroll a pre-existing Store into a fresh zero',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const original=await freshInventoryStore(t),state=original.state();
  state.records['SYNTHETIC-copied-owner-release']=claimedFreshResult();
  const copied=await historicalInventoryStore(t,{sourceState:state}),before=JSON.stringify(copied.state());
  assert.throws(()=>copied.inspect(),originalHold);
  assert.equal(JSON.stringify(copied.state()),before);facts(original,0);
});

test('model cleanup preserves real private failed-launch custody after the original child exits',{concurrency:false},async t=>{
  const child=controlledInventoryChild(),attempted=denyInventoryExternalEffects(t,{spawnChildren:[child]});
  const f=await freshInventoryStore(t),job=f.queue();let token;
  t.mock.method(Date,'now',()=>Date.parse(job.created_at));
  f.store.transaction('job.worker_launch_requested',state=>{
    token=f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;
  });
  const failure=Object.assign(Error('SYNTHETIC original birth COMMIT rejection'),{termination_confirmed:true});Object.freeze(failure);
  const transaction=f.store.transaction;
  t.mock.method(f.store,'transaction',function(type,fn,hooks={}){
    if(type!=='job.original_execution.born')return Reflect.apply(transaction,this,[type,fn,hooks]);
    return Reflect.apply(transaction,this,[type,fn,{...hooks,beforeCommit:(db,next)=>{
      if(hooks.beforeCommit)hooks.beforeCommit(db,next);throw failure;
    }}]);
  });
  try{
    assert.throws(()=>f.producer.spawnOriginalWorkerLaunch(token,process.execPath,['SYNTHETIC-controlled-child'],{cwd:f.root}),error=>error===failure);
    assert.equal(f.producer.originalWorkerFailedLaunchChild(failure),child);
    assert.equal(f.producer.originalModelFailedLaunchChild(failure),child);
    child.emit('exit',0,null);
    assert.equal(f.producer.originalWorkerFailedLaunchClosed(failure),false,'exit is not close or global release');
    const forged=Object.assign(Error('SYNTHETIC caller diagnostic'),{originalChild:child,termination_confirmed:true});
    assert.equal(f.producer.originalModelFailedLaunchChild(forged),null);
    assert.equal(f.producer.cleanupOriginalModelLaunchFailure(forged),false);
    assert.equal(f.producer.cleanupOriginalModelLaunchFailure(failure),true);
    assert.equal(f.producer.cleanupOriginalWorkerLaunchFailure(failure),true);
    assert.deepEqual(child.signals,[],'neither cleanup path may signal after the actual original exit');
    assert.equal(attempted.spawnCalls.length,1);facts(f,1);
  }finally{child.emit('close',0,null);}
  assert.equal(f.producer.originalWorkerFailedLaunchClosed(failure),true);
  assert.equal(f.producer.cleanupOriginalModelLaunchFailure(failure),true);
  assert.deepEqual(child.signals,[]);facts(f,1);
});
