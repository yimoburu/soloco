// Authored SOURCE integration only. Real disposable Store/C7/ledger writers
// and the released fixed Python IO remain selected by the shared fixture;
// its worker child is controlled. No model/provider/Native run is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// Preserve the ordinary engine -> Store entry before the optional C7 cycle.
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {originalStoreExecutionCustodyFrom} from '../plugins/soloco/runtime/store.mjs';
import {requestModelProcess} from '../plugins/soloco/runtime/model-process-closure.mjs';
import {prepareRuntimeModelRequestFrom,inspectRuntimeModelRequestCommitFrom,assertLegacyRuntimeModelLaunchFrom} from '../plugins/soloco/runtime/runtime-execution.mjs';
import {stageComparisonRequestFrom,inspectComparisonEvidenceRecordFrom} from '../plugins/soloco/runtime/integrated-comparison-evidence.mjs';
import * as issuer from '../tools/issue18/integrated-comparison-issuer.mjs';
import {fixture,runningArm,admitted,digest,optionalDarwin} from './issue18-comparison-fixture.mjs';

test('C7 preparation before a failed core confirmation cannot finalize the captured header or arm a model',optionalDarwin,async t=>{
  assert.equal(typeof engine.control,'function');
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),selected=admitted(run,a);
  const slotPath=path.join(f.parentPath,'selected-run','slot-1-files-engineer.json'),slotBefore=fs.readFileSync(slotPath);
  const problem=Error('Selected core request-confirmation registration failure after C7 preparation');
  const nativeSet=WeakMap.prototype.set;
  let next,scope,requested,launch,entered=false,preparedRegistration=null,preparedRegistrations=0,confirmationAttempts=0;
  // Observe actual registrations, never substitute a witness, state, result
  // or producer. Only the selected core confirmation throws after native set.
  const interception=t.mock.method(WeakMap.prototype,'set',function(key,value){
    const result=Reflect.apply(nativeSet,this,[key,value]);
    if(value?.store===a.store&&value.scope===scope&&value.proofs instanceof Map){
      const proof=requested&&value.proofs.get(requested.id);
      if(proof?.registration&&a.store.inTransaction===true&&a.store.db.isTransaction===false){
        assert.equal(proof.recordSha,digest(requested));assert.equal(proof.registration.committed,false);
        preparedRegistration=proof.registration;preparedRegistrations++;
      }
    }
    if(value?.protocol==='runtime-model-request-commit-v1'&&value.store===a.store){
      confirmationAttempts++;assert.equal(a.store.inTransaction,true);assert.equal(a.store.db.isTransaction,false);
      assert.ok(preparedRegistrations>0,'the genuine C7 post-COMMIT prepare ran before core registration');
      assert.equal(preparedRegistration.committed,false);throw problem;
    }
    return result;
  });
  try{
    assert.throws(()=>a.store.transaction('job.model_process.requested',state=>{
      next=state;scope=originalStoreExecutionCustodyFrom(a.store).scope;
      requestModelProcess(state.jobs[a.job.id],a.invocation);
      stageComparisonRequestFrom(a.header,state,a.slot_commit);
      requested=Object.values(state.records).find(record=>record.runtime_wire_evidence?.binding?.invocation_id===a.binding.invocation_id);
      assert.ok(requested);
      launch=prepareRuntimeModelRequestFrom(a.store,state,{job_id:a.job.id,invocation_id:a.binding.invocation_id,host:'codex',native_id:null,prompt:a.actualPrompt,cwd:a.store.root,selection:a.binding.model.selection});
      issuer.assertInFlightArmAdmission(selected.armAdmission,{actualStore:a.store,currentState:state,callBinding:a.binding});entered=true;return state;
    }),error=>error===problem);
  }finally{interception.mock.restore();}
  assert.equal(entered,true);assert.equal(confirmationAttempts,1);assert.ok(preparedRegistrations>0);assert.ok(launch);
  assert.equal(a.store.inTransaction,false);assert.equal(a.store.db.isTransaction,false);assert.equal(preparedRegistration.committed,false);
  const unconfirmed=error=>error?.code==='LEGACY_RUNTIME_MODEL_REQUEST_COMMIT_REQUIRED';
  const unarmed=error=>error?.code==='LEGACY_RUNTIME_PRIVATE_CAPABILITY_REQUIRED';
  assert.throws(()=>inspectRuntimeModelRequestCommitFrom(launch,a.store),unconfirmed);
  assert.throws(()=>assertLegacyRuntimeModelLaunchFrom(launch,{host:'codex',native_id:null,prompt:a.actualPrompt,cwd:a.store.root,selection:a.binding.model.selection}),unarmed);
  assert.throws(()=>inspectComparisonEvidenceRecordFrom(next,requested),error=>error?.code==='ISSUE18_EVIDENCE_CENSUS_CUSTODY');

  // Lost return does not erase physically committed DATA. A later passive
  // census may recover historical bookkeeping, without finalizing next or
  // adopting this request as a live launch/arm capability.
  const passive=a.store.read(),historical=passive.records[requested.id];assert.deepEqual(historical,requested);
  assert.equal(inspectComparisonEvidenceRecordFrom(passive,historical).recordSha,digest(requested));
  const events=a.store.db.prepare("SELECT seq,at,type,value FROM events WHERE type='job.model_process.requested'").all();assert.equal(events.length,1);
  const event=events[0],contribution=JSON.parse(event.value).runtime_wire_evidence;
  assert.equal(contribution.record_id,requested.id);assert.equal(contribution.after_record_sha256,digest(requested));assert.equal(contribution.invocation_id,a.binding.invocation_id);
  const persisted=a.store.db.prepare("SELECT v.bytes FROM state_entries e JOIN immutable_values v USING(sha256) WHERE e.family='records' AND e.key=?").get(requested.id);
  assert.deepEqual(JSON.parse(persisted.bytes),requested);
  const job=passive.jobs[a.job.id],entry=job.model_process_tracking.invocations[0];
  assert.equal(job.status,'running');assert.equal(job.artifact_id,undefined);assert.equal(job.model_process_tracking.invocations.length,1);
  assert.equal(entry.invocation_id,a.binding.invocation_id);assert.equal(entry.birth,null);assert.equal(entry.closure,null);
  assert.equal(preparedRegistration.committed,false);assert.throws(()=>inspectComparisonEvidenceRecordFrom(next,requested),error=>error?.code==='ISSUE18_EVIDENCE_CENSUS_CUSTODY');
  assert.throws(()=>inspectRuntimeModelRequestCommitFrom(launch,a.store),unconfirmed);

  assert.equal(JSON.parse(slotBefore).binding.invocation_id,a.binding.invocation_id);
  assert.throws(()=>issuer.reserveSelectedCallSlot(run,a.slot),/SLOT_SPENT/);
  assert.throws(()=>issuer.bindCommittedArmFrom(selected.armAdmission,launch),unconfirmed);
  assert.throws(()=>issuer.bindCommittedArmFrom(selected.armAdmission,launch),/ARM_COMMIT_REQUIRED/);
  assert.ok(fs.readFileSync(slotPath).equals(slotBefore),'the original immutable B slot remains spent, without replacement or refund');
  const records=Object.values(passive.records);
  assert.equal(records.some(record=>record.development?.type==='candidate'||record.development?.type==='test'||record.runtime_candidate_test_guard),false);
  assert.equal(records.some(record=>record.kind==='review'||record.author_role==='qa'||record.development?.acceptance!==undefined),false);
  assert.equal(Object.values(passive.jobs).some(value=>value.kind==='development_test'||value.role==='qa'),false);
  assert.equal(f.boundary.effects.filter(effect=>effect.kind==='synthetic worker creation').length,1);
  assert.equal(f.boundary.effects.filter(effect=>effect.kind==='synthetic model creation'||effect.kind==='synthetic fixed development-test worker creation').length,0);
  f.done();
});
