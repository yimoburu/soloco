// SOURCE boundary negatives only. All databases are disposable and fictional.
// These cases use original module/Store/producer identities, never a fabricated
// Native issuer, currentNative override, relocated domain or stubbed join.
// Genuine positive origin launches still require a checked original peer prefix
// and selected component/compiled-plan capabilities. No such proof is minted here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../plugins/soloco/runtime/peers/protected-codex-domain.mjs';
import {peerFixture} from './peer-fixture.mjs';
import {logicalSQLState} from './peer-task-effects-fixture.mjs';
import {denyInventoryExternalEffects,freshInventoryStore,afterInventoryEventsRead} from './original-global-worker-inventory-fixture.mjs';

const originalHold=error=>error instanceof Error&&typeof error.code==='string'&&error.code.startsWith('ORIGINAL_EXECUTION_');
const originalPlan=error=>error?.code==='PROTECTED_CODEX_ORIGINAL_PLAN_REQUIRED';
const reference=Object.freeze({family:'work_items',id:'UNTRUSTED-origin-admission',revision:1,sha256:'a'.repeat(64)});
const binders=[domain.bindOriginalProtectedOriginAdmission,domain.bindOriginalProtectedOriginFrontierSealAdmission,domain.bindOriginalProtectedOwnerMaintenanceAdmission];

function unqualifiedPeer(t){const f=peerFixture();t.after(()=>f.close());return f;}
function prepareWorker(f){
  const job=f.queue();let token;
  f.store.transaction('job.worker_launch_requested',state=>{
    token=f.producer.prepareOriginalWorkerLaunchFrom(f.store,state,{job_id:job.id,kind:'worker'});return state;
  });
  assert.equal(f.producer.assertOriginalWorkerLaunchToken(token,{kind:'worker'}),true);
  return {job,token};
}

test('origin binders reject mixed caller DATA before inspecting a service or changing the real peer ledger',{concurrency:false},t=>{
  denyInventoryExternalEffects(t);const f=unqualifiedPeer(t),before=logicalSQLState(f);let touched=0;
  const foreign=new Proxy(Object.freeze({}),{get(){touched++;throw Error('Caller service must not be inspected');}});
  const handle=Object.freeze({origin_admission:{purpose:'range'},native_admission:{},membership_admission:{},frontier_admission:{},bootstrap_claim:{}});
  for(const bind of binders)assert.throws(()=>bind(Symbol('SOURCE-rejected-owner'),handle,foreign,foreign),originalPlan);
  assert.throws(()=>domain.bindOriginalProtectedExecutionLaunch(Symbol('SOURCE-rejected-owner'),handle,f.ledger,reference),originalPlan);
  assert.equal(touched,0);assert.deepEqual(logicalSQLState(f),before);
});

test('a genuine original worker token is foreign to every origin launch binder and remains unspent',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),{token}=prepareWorker(f),before=JSON.stringify(f.state()),seq=f.store.changeToken();
  for(const bind of binders)assert.throws(()=>bind(Symbol('SOURCE-origin-owner'),token,f.store,token),originalPlan);
  assert.throws(()=>domain.bindOriginalProtectedExecutionLaunch(Symbol('SOURCE-origin-owner'),token,f.store,reference),originalPlan);
  assert.equal(f.producer.assertOriginalWorkerLaunchToken(token,{kind:'worker'}),true);
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),seq);
  const facts=f.inspect();assert.equal(facts.occupied,1);assert.equal(facts.remaining,2);assert.equal(facts.raw_carrier_closure_unknown,1);
});

test('an original Store snapshot loan expires and cannot become an origin launch or a policy proof',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t),custody=f.storeModule.originalStoreExecutionCustodyFrom;
  const loan=f.store.readSnapshot(()=>custody(f.store.db)),before=JSON.stringify(f.state()),seq=f.store.changeToken();
  assert.throws(()=>loan.assert(),error=>error?.code==='ORIGINAL_EXECUTION_STORE_EXPIRED');
  for(const bind of binders)assert.throws(()=>bind(Symbol('SOURCE-origin-owner'),loan,f.store,loan),originalPlan);
  assert.throws(()=>domain.bindOriginalProtectedExecutionLaunch(Symbol('SOURCE-origin-owner'),loan,f.store,reference),originalPlan);
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),seq);
});

test('new origin purpose labels cannot supply missing original peer launch coverage or mint a cold claim',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=unqualifiedPeer(t),producer=await import('../plugins/soloco/runtime/peers/prospective-local-worker-inventory-producer.mjs'),before=logicalSQLState(f);
  for(const kind of ['peer-origin-reconstruction','peer-origin-review','peer-origin-frontier-seal-review','owner-handover-review']){
    assert.throws(()=>producer.assertOriginalPeerMaintenanceExecutionCapacityFrom(f.ledger,{stage:'reserve',kind,remaining:3,cardinality_known:true}),originalHold);
    assert.throws(()=>producer.assertOriginalPeerMaintenanceExecutionCapacityFrom(f.ledger,{stage:'existing',admission_ref:reference}),originalHold);
    assert.throws(()=>producer.claimOriginalPeerExecutionLaunchFrom(f.ledger,{admission_ref:reference}),originalHold);
  }
  assert.deepEqual(logicalSQLState(f),before);
});

test('the final actual history read cannot renew the original worker launch cutoff or enable a second claim',{concurrency:false},async t=>{
  const attempted=denyInventoryExternalEffects(t),f=await freshInventoryStore(t),{job,token}=prepareWorker(f);
  const {STARTUP_TIMEOUT_MS}=await import('../plugins/soloco/runtime/timeout.mjs'),start=Date.parse(job.created_at),deadline=start+STARTUP_TIMEOUT_MS;
  let now=start,inBirth=false,reads=0;const transaction=f.store.transaction;
  t.mock.method(Date,'now',()=>now);
  t.mock.method(f.store,'transaction',function(type,fn,options){
    if(type!=='job.original_execution.born')return Reflect.apply(transaction,this,[type,fn,options]);
    inBirth=true;try{return Reflect.apply(transaction,this,[type,fn,options]);}finally{inBirth=false;}
  });
  afterInventoryEventsRead(t,()=>{if(inBirth){reads++;now=deadline;}});
  const before=JSON.stringify(f.state()),seq=f.store.changeToken();
  assert.throws(()=>f.producer.spawnOriginalWorkerLaunch(token,process.execPath,['SOURCE-never-created'],{cwd:f.root}),error=>error?.code==='ORIGINAL_EXECUTION_CUTOFF_EXPIRED');
  assert.ok(reads>0,'the actual original history provider returned before clock drift');
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),seq);
  const pending=f.state().jobs[job.id].original_execution_assignment.launches[0];assert.equal(pending.birth,null);assert.equal(pending.closure,null);
  now=start;assert.throws(()=>f.producer.assertOriginalWorkerLaunchToken(token,{kind:'worker'}),originalHold);
  assert.deepEqual(attempted,[]);assert.equal(attempted.spawnCalls.length,0);
});

test('three genuine queued assignments stay occupied after foreign origin binding and a fourth reservation rolls back',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await freshInventoryStore(t);
  for(const host of ['codex','claude','local'])f.queue({host});
  const before=JSON.stringify(f.state()),seq=f.store.changeToken(),facts=f.inspect();assert.equal(facts.occupied,3);assert.equal(facts.remaining,0);
  assert.throws(()=>domain.bindOriginalProtectedExecutionLaunch(Symbol('SOURCE-origin-owner'),Object.freeze({}),f.store,reference),originalPlan);
  assert.throws(()=>f.queue(),error=>error?.code==='ORIGINAL_EXECUTION_CAPACITY_EXHAUSTED');
  assert.equal(JSON.stringify(f.state()),before);assert.equal(f.store.changeToken(),seq);
  assert.equal(f.inspect().occupied,3);assert.equal(f.inspect().remaining,0);
});

// No positive origin launch, release, Native creation or whole-domain closure is
// claimed by these six negatives. Those assertions remain external prerequisites;
// they are not replaced by skipped tests or manufactured issuer receipts.
