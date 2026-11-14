// Source fixture helpers are shared. All eighteen original cases and oracles
// remain; the foreign-module negative uses the canonical module rather than
// its intentional singleton tool reexport. First project entry stays engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store,originalStoreExecutionCustodyFrom} from '../plugins/soloco/runtime/store.mjs';
import * as issuer from '../tools/issue18/integrated-comparison-issuer.mjs';
import {createComparisonEvidenceStorageFrom} from '../tools/issue18/integrated-comparison-evidence-io.mjs';
import {fixture,runningArm,admitted,commitRequest,hash,digest,clone,optionalDarwin,pythonHash} from './issue18-comparison-fixture.mjs';

test('the default Store import completes its module graph before any comparison opt-in',()=>{
  // This file's first project import is engine.mjs, which reaches Store before
  // the optional issuer. A cold file process must finish that real import graph
  // to reach this assertion; no separate child or permission fixture is added.
  assert.equal(typeof Store,'function');assert.equal(typeof Store.prototype.readSnapshot,'function');assert.equal(typeof Store.prototype.transaction,'function');
});
test('foreign values, JSON brands and hostile Proxies cannot mint issuer custody',()=>{
  let traps=0;const hostile=new Proxy({}, {get(){traps++;throw Error('No inspection');},ownKeys(){traps++;throw Error('No inspection');},getPrototypeOf(){traps++;throw Error('No inspection');}});
  for(const value of [null,undefined,{},hostile]){
    assert.throws(()=>issuer.consumeComparisonBootstrapEntitlement(value));assert.throws(()=>issuer.consumeComparisonJournalEntitlement(value,{}));
    assert.throws(()=>issuer.inspectSelectedComparisonRun(value));assert.throws(()=>issuer.bindCommittedArmFrom(value,{}));assert.throws(()=>issuer.assertBoundComparisonArmFrom(value,{}));
  }assert.equal(traps,0);
});
test('canonical control creates a revision1 derived selection and one immutable RUN, without relabeling the control',optionalDarwin,t=>{
  const f=fixture(t),original=JSON.stringify(f.decision),run=f.initialize(),view=issuer.inspectSelectedComparisonRun(run);
  assert.equal(JSON.stringify(f.selectionStore.read().records[f.decision.id]),original);assert.equal(Object.hasOwn(f.decision,'revision'),false);
  const ref=view.run_manifest.supported_selection_ref,record=f.selectionStore.read().records[ref.id];assert.equal(record.revision,1);assert.equal(digest(record),ref.sha256);assert.deepEqual(record.comparison_selection.original_control,{id:f.decision.id,sha256:digest(f.decision)});
  const physical=fs.readFileSync(path.join(f.parentPath,'selected-run','RUN.json'));assert.equal(hash(physical),view.run_manifest_sha256);assert.deepEqual(JSON.parse(physical),view.run_manifest);assert(view.issuer_metadata_bytes<=32768);assert.throws(()=>f.issue(),/INITIALIZATION_SPENT/);f.done();
});
test('ordinary control purpose fails before filesystem initialization',optionalDarwin,t=>{
  const f=fixture(t,{selectionChange:selected=>{selected.purpose='ordinary-pause';}});assert.throws(()=>f.issue(),/EXPLICIT_SELECTION_REQUIRED/);assert.deepEqual(fs.readdirSync(f.parentPath),[]);f.done();
});
test('a caller Source tuple or copied opaque Source handle cannot replace physical Source custody',optionalDarwin,t=>{
  const f=fixture(t);for(const source of [f.selection.source,{...f.source}])assert.throws(()=>issuer.issueComparisonInitEntitlementFrom(f.selectionStore,{decision_id:f.decision.id,decision_sha256:digest(f.decision),parentFd:f.parentFd,pythonSha256:pythonHash(),source}));assert.deepEqual(fs.readdirSync(f.parentPath),[]);f.done();
});
test('lost bootstrap entitlement stays consumed across an independently imported issuer module',optionalDarwin,async t=>{
  const f=fixture(t),token=f.issue(),loan=issuer.consumeComparisonBootstrapEntitlement(token);assert(loan.issuerStoredBytes>0);assert.throws(()=>issuer.consumeComparisonBootstrapEntitlement(token));
  const duplicate=await import('../plugins/soloco/runtime/qualification/issue18/integrated-comparison-issuer.mjs?duplicate-negative-issuer');assert.throws(()=>duplicate.consumeComparisonBootstrapEntitlement(token));assert.throws(()=>duplicate.issueComparisonInitEntitlementFrom(f.selectionStore,{decision_id:f.decision.id,decision_sha256:digest(f.decision),parentFd:f.parentFd,pythonSha256:pythonHash(),source:f.source}),/INITIALIZATION_SPENT/);assert.deepEqual(fs.readdirSync(f.parentPath),[]);f.done();
});
test('arm enrollment rejects one physical Store under two arm keys and requires all four before per-call storage',optionalDarwin,t=>{
  const f=fixture(t),run=f.initialize(),arm=f.company('single-arm');issuer.enrollComparisonArmFrom(run,arm,'1-files');assert.throws(()=>issuer.enrollComparisonArmFrom(run,arm,'1-patches'),/ARMS_NOT_DISTINCT/);
  assert.throws(()=>issuer.consumeComparisonEvidenceStorageEntitlementFrom(run,arm,{arm_id:'1-files',phase:'engineer',deadline_at_ms:Date.now()+30000,capacity_reserved_bytes:9975424}),/EVIDENCE_INITIALIZATION_SPENT_OR_UNSELECTED/);assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'selected-run')),['RUN.json']);f.done();
});
test('genuine four-arm enrollment permits a paused budget-only A directory and spends its initialization once',optionalDarwin,t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),store=arms['1-files'];store.transaction('fictional.pause',s=>{s.paused=true;return s;});const options={arm_id:'1-files',phase:'engineer',deadline_at_ms:Date.parse(f.selection.expires_at),capacity_reserved_bytes:9975424};
  const a=createComparisonEvidenceStorageFrom(run,store,options);f.evidence.push(a);assert.throws(()=>createComparisonEvidenceStorageFrom(run,store,options),/EVIDENCE_INITIALIZATION_SPENT_OR_UNSELECTED/);assert.deepEqual(fs.readdirSync(path.join(f.parentPath,'selected-run')),['RUN.json']);f.done();
});
test('real immutable slot publication precedes one-use arm admission and creates no model child',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),reserved=issuer.reserveSelectedCallSlot(run,a.slot),file=path.join(f.parentPath,'selected-run','slot-1-files-engineer.json');
  assert.equal(hash(fs.readFileSync(file)),reserved.slot_commit.slot_record_sha256);assert.equal(reserved.slot_commit.binding_sha256,a.slot.binding_sha256);assert.throws(()=>issuer.reserveSelectedCallSlot(run,a.slot),/SLOT_SPENT/);
  const consumed=issuer.consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt});assert(consumed.armAdmission);assert.throws(()=>issuer.consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt}),/ADMISSION_SPENT_OR_FOREIGN/);
  assert.equal(f.boundary.effects.filter(e=>e.kind==='synthetic worker creation').length,1);assert.equal(a.store.read().jobs[a.job.id].model_process_tracking,undefined);f.done();
});
test('wrong prompt consumption fails and permanently spends the durable slot admission',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),reserved=issuer.reserveSelectedCallSlot(run,a.slot),before=fs.readFileSync(path.join(f.parentPath,'selected-run','slot-1-files-engineer.json'));
  assert.throws(()=>issuer.consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt+'changed'}),/ACTUAL_PROMPT_MISMATCH/);assert.throws(()=>issuer.consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt}),/ADMISSION_SPENT_OR_FOREIGN/);assert(fs.readFileSync(path.join(f.parentPath,'selected-run','slot-1-files-engineer.json')).equals(before));f.done();
});
test('admission consumption inside an actual arm writer is rejected and cannot be retried after rollback',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),reserved=issuer.reserveSelectedCallSlot(run,a.slot);
  assert.throws(()=>a.store.transaction('fictional.consume-inside-writer',s=>{issuer.consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt});return s;}),/ADMISSION_OUTSIDE_TRANSACTION_REQUIRED/);
  assert.throws(()=>issuer.consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt}),/ADMISSION_SPENT_OR_FOREIGN/);assert.equal(a.store.read().jobs[a.job.id].model_process_tracking,undefined);f.done();
});
test('actual request COMMIT and exact E3 inspector bind one arm; copied capabilities and private brands fail',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),selected=admitted(run,a),{launch,entered}=commitRequest(a,selected.armAdmission);assert.equal(entered,true);
  const result=issuer.bindCommittedArmFrom(selected.armAdmission,launch);assert.doesNotThrow(()=>issuer.assertBoundComparisonArmFrom(result.boundArm,launch));assert.equal(result.arm_commit.invocation_id,a.binding.invocation_id);assert.equal(result.arm_commit.binding_sha256,a.slot.binding_sha256);
  const event=a.store.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(result.arm_commit.request_event_seq);assert.equal(event.type,'job.model_process.requested');assert.equal(digest([event.seq,event.at,event.type,event.value]),result.arm_commit.request_event_sha256);
  assert.throws(()=>issuer.bindCommittedArmFrom(selected.armAdmission,launch),/ARM_COMMIT_REQUIRED/);assert.throws(()=>issuer.assertBoundComparisonArmFrom({...result.boundArm},launch));assert.throws(()=>issuer.assertBoundComparisonArmFrom(result.boundArm,{...launch}));assert.throws(()=>originalStoreExecutionCustodyFrom(a.store),'The completed writer scope no longer authorizes an inflight check');f.done();
});
test('rollback after genuine inflight entry cannot produce a committed arm or refund its slot',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),selected=admitted(run,a),result=commitRequest(a,selected.armAdmission,{rollback:true});assert.equal(result.entered,true);assert.equal(a.store.read().jobs[a.job.id].model_process_tracking,undefined);
  assert.throws(()=>issuer.bindCommittedArmFrom(selected.armAdmission,result.launch));assert.throws(()=>issuer.reserveSelectedCallSlot(run,a.slot));assert.equal(fs.existsSync(path.join(f.parentPath,'selected-run','slot-1-files-engineer.json')),true);f.done();
});
test('a forged post-COMMIT success object cannot bind an otherwise genuine request',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),selected=admitted(run,a),real=commitRequest(a,selected.armAdmission);assert.equal(real.entered,true);
  assert.throws(()=>issuer.bindCommittedArmFrom(selected.armAdmission,{committed:true,scope:{},job_id:a.job.id,invocation_id:a.binding.invocation_id}));assert.equal(fs.existsSync(path.join(f.parentPath,'selected-run','slot-1-files-engineer.json')),true);f.done();
});
test('a wrong actual writer scope invalidates its consumed arm and cannot be retried in a new transaction',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),selected=admitted(run,a);let entered=false;
  assert.throws(()=>a.store.transaction('fictional.wrong-writer',s=>{entered=true;issuer.assertInFlightArmAdmission(selected.armAdmission,{actualStore:a.store,currentState:s,callBinding:a.binding});return s;}),/ACTUAL_CAPABILITY_WRITER/);assert.equal(entered,true);
  assert.throws(()=>commitRequest(a,selected.armAdmission),/ARM_ADMISSION_FOREIGN_OR_SEALED/);assert.equal(a.store.read().jobs[a.job.id].model_process_tracking,undefined);assert.throws(()=>issuer.reserveSelectedCallSlot(run,a.slot),/SLOT_SPENT/);f.done();
});
test('B test selection requires the original private produced engineer arm, with no JSON success substitute',optionalDarwin,t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),before=fs.readFileSync(path.join(f.parentPath,'selected-run.journal.jsonl'));
  const input={arm_id:'1-files',engineerBoundArm:{completed:true,phase:'engineer'},candidateRef:{id:'fictional',revision:1,sha256:'1'.repeat(64)},planRef:{id:'fictional-plan',revision:1,sha256:'2'.repeat(64)}};
  assert.throws(()=>issuer.consumeComparisonTestEntitlementFrom(run,arms['1-files'],input),/TEST_ENGINEER_ARM/);assert(fs.readFileSync(path.join(f.parentPath,'selected-run.journal.jsonl')).equals(before));assert.throws(()=>issuer.inspectComparisonTestEntitlementFrom({},arms['1-files']),/TEST_ENTITLEMENT_FOREIGN/);f.done();
});
test('a different actual Store cannot consume a slot even when supplied exact copied binding DATA',optionalDarwin,async t=>{
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await runningArm(t,f,run,arms['1-files']),selected=issuer.reserveSelectedCallSlot(run,a.slot);
  assert.throws(()=>issuer.consumeCommittedSelectedCallSlotAdmission(selected.admission,{actualStore:arms['1-patches'],callBinding:clone(a.binding),actualPrompt:a.actualPrompt}),/ARM_STORE_REQUIRED/);assert.throws(()=>issuer.consumeCommittedSelectedCallSlotAdmission(selected.admission,{actualStore:a.store,callBinding:a.binding,actualPrompt:a.actualPrompt}),/ADMISSION_SPENT_OR_FOREIGN/);f.done();
});
test('closing a run retains immutable files and invalidates copied audit views as admission',optionalDarwin,t=>{
  const f=fixture(t),run=f.initialize(),view=issuer.inspectSelectedComparisonRun(run),before=fs.readFileSync(path.join(f.parentPath,'selected-run','RUN.json'));issuer.closeComparisonRun(run);
  assert.throws(()=>issuer.inspectSelectedComparisonRun(run));assert.throws(()=>issuer.inspectSelectedComparisonRun(view));assert(fs.readFileSync(path.join(f.parentPath,'selected-run','RUN.json')).equals(before));assert(fs.fstatSync(f.parentFd).isDirectory());f.done();
});
