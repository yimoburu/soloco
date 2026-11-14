// Negative SOURCE fixtures only. peerFixture's direct schema setup is NOT a
// checked adoption, original launch prefix, qualified meaning or Native proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {denyInventoryExternalEffects,inventorySourceModules} from './original-global-worker-inventory-fixture.mjs';

const originalHold=error=>error instanceof Error&&typeof error.code==='string'&&error.code.startsWith('ORIGINAL_EXECUTION_');
const ref=(family,row)=>({family,id:row.id,revision:row.revision,sha256:row.sha256});
async function unqualifiedPeer(t){
  const {peerFixture}=await import('./peer-fixture.mjs'),f=peerFixture();t.after(()=>f.close());
  const {producer}=await inventorySourceModules();return {...f,producer};
}

test('empty directly initialized peer rows cannot replace an original launch-coverage prefix',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await unqualifiedPeer(t);
  assert.throws(()=>f.producer.assertOriginalPeerMaintenanceExecutionCapacityFrom(f.ledger,{stage:'reserve'}),originalHold);
  assert.deepEqual(f.ledger.read(tx=>tx.list('slots',{limit:100}).items),[]);
});

test('caller completeness flags cannot turn unqualified peer capacity into a reserve proof',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await unqualifiedPeer(t);
  assert.throws(()=>f.producer.assertOriginalPeerMaintenanceExecutionCapacityFrom(f.ledger,{stage:'reserve',
    retained_row_census_complete:true,admission_launch_coverage_complete:true,cardinality_known:true,
    unit:'new-origin-maintenance-model-invocation',occupied:0,remaining:3}),originalHold);
});

test('typed-looking admission and own slot do not fabricate genuine adoption or launch coverage',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await unqualifiedPeer(t);let admission_ref;
  f.ledger.write('SYNTHETIC.unqualified-admission-DATA','founder',tx=>{
    const admission=tx.put('work_items','SYNTHETIC-unqualified-input-admission',{kind:'input_frontier_admission',binding:{protocol:'peer-input-frontier-admission-v1',kind:'input-frontier-produce'}},0);
    admission_ref=ref('work_items',admission);
    tx.put('slots','SYNTHETIC-unqualified-input-execution',{kind:'input_frontier_execution',status:'unknown',scope:'*',admission_ref,capacity_known:true,termination_confirmed:false},0);
  });
  const before=f.ledger.read(tx=>JSON.stringify(tx.list('slots',{limit:100}).items));
  assert.throws(()=>f.producer.assertOriginalPeerMaintenanceExecutionCapacityFrom(f.ledger,{stage:'existing',admission_ref}),originalHold);
  assert.equal(f.ledger.read(tx=>JSON.stringify(tx.list('slots',{limit:100}).items)),before);
});

test('reserve accepts no existing admission reference or caller-defined stage',{concurrency:false},async t=>{
  denyInventoryExternalEffects(t);const f=await unqualifiedPeer(t);
  const admission_ref={family:'work_items',id:'SYNTHETIC-caller-ref',revision:1,sha256:'a'.repeat(64)};
  for(const options of [{stage:'reserve',admission_ref},{stage:'existing'},{stage:'SYNTHETIC-skip-legacy',admission_ref}]){
    assert.throws(()=>f.producer.assertOriginalPeerMaintenanceExecutionCapacityFrom(f.ledger,options),originalHold);
  }
});
