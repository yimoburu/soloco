// Prospective composed SOURCE qualification. The actual worker, fixed adapter,
// private outcome producer, Store writers and pinned Python IO remain real.
// Worker/model ChildProcess objects and CLI frames are explicitly FICTIONAL.
// These checks establish no Native/provider run, sandbox qualification, task
// adequacy, independent QA, acceptance or measured benefit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// Keep ordinary engine -> Store startup as the first project entry, including
// the optional producer/issuer cycle. Import defines no selected comparison.
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {runRuntimeModel,assertRuntimeModelOutcomeEligible} from '../plugins/soloco/runtime/adapters.mjs';
import {createComparisonWorkerPlanFrom} from '../plugins/soloco/runtime/integrated-comparison-worker.mjs';
import {comparisonProducedEvidenceFrom} from '../plugins/soloco/runtime/integrated-comparison-evidence.mjs';
import {developmentAction,executeDevelopmentTest} from '../plugins/soloco/runtime/develop.mjs';
import {runtimeJobOccupied} from '../plugins/soloco/runtime/runtime-execution.mjs';
import {createComparisonTestPlanFrom,assertComparisonTestCommittedFrom,inspectComparisonTestRecordFrom,prepareComparisonTestCommitFrom,finalizeComparisonTestCommitFrom} from '../plugins/soloco/runtime/integrated-comparison-test.mjs';
import * as issuer from '../tools/issue18/integrated-comparison-issuer.mjs';
import * as canonicalIssuer from '../plugins/soloco/runtime/qualification/issue18/integrated-comparison-issuer.mjs';
import * as typed from '../tools/issue18/typed-capture.mjs';
import * as canonicalTyped from '../plugins/soloco/runtime/qualification/issue18/typed-capture.mjs';
import {fixture,queuedArm,optionalDarwin,hash,digest} from './issue18-comparison-fixture.mjs';

async function selected(t,armId='1-files'){
  const f=fixture(t),run=f.initialize(),arms=f.enroll(run),a=await queuedArm(t,f,run,arms[armId],armId);
  const plan=createComparisonWorkerPlanFrom(run,a.store,armId,a.job.id),model=f.modelFor(a.store,a.job);
  return {f,run,a,plan,model};
}
function start(s,adapter=runRuntimeModel,plan=s.plan){
  const completion=work(s.a.store.root,s.a.job.id,adapter,plan);completion.catch(()=>{});return completion;
}
async function entered(s,completion){
  const observed=await Promise.race([s.model.ready,completion.then(()=>{throw Error('Worker finished before the selected model creation');},error=>{throw error;})]);
  assert.equal(observed,s.model);assert.equal(s.model.called,true);
  const job=s.a.store.read().jobs[s.a.job.id];assert.equal(job.status,'running');assert.equal(job.model_process_tracking.invocations.length,1);
  assert.equal(wire(s).runtime_wire_evidence.state,'requested','The actual A request COMMIT must precede controlled model creation');
  assert.equal(fs.existsSync(slotPath(s)),true,'The immutable global slot must precede controlled model creation');
}
async function joined(s,completion){
  if(!s.model.child.closed)s.model.close(1,'SIGTERM');await completion.catch(()=>{});
}
const slotPath=s=>path.join(s.f.parentPath,'selected-run',`slot-${s.a.armId}-engineer.json`);
const evidenceDirectory=s=>path.join(s.f.parentPath,'a-'+digest([s.f.selection.run_id,s.a.armId,'engineer']));
function wire(s){const records=Object.values(s.a.store.read().records).filter(record=>record.job_id===s.a.job.id&&record.runtime_wire_evidence);assert.equal(records.length,1);return records[0];}
function candidates(s){return Object.values(s.a.store.read().records).filter(record=>record.job_id===s.a.job.id&&record.development?.type==='candidate');}
function noCandidate(s){assert.equal(candidates(s).length,0);assert.notEqual(s.a.store.read().jobs[s.a.job.id].status,'completed');}
function rawBlob(s,rawCapture){return fs.readFileSync(path.join(evidenceDirectory(s),rawCapture.lossless_blob.object_name));}
function rawExact(s,expected){
  const record=wire(s),capture=record.runtime_wire_evidence.outcome.raw,body=rawBlob(s,capture),bytes=Buffer.from(expected,'utf16le');
  assert.equal(capture.state,'complete');assert.equal(capture.lossless_blob.encoding,'js-utf16le-code-units-v1');assert.equal(capture.lossless_blob.bytes,expected.length*2);
  assert.equal(capture.lossless_blob.sha256,hash(bytes));assert(body.equals(bytes));assert.equal(capture.lower_cli_transport.status,'not_captured');return record;
}
function chunks(text){
  const out=[];let part='',bytes=0;
  for(const scalar of text){const count=Buffer.byteLength(scalar);if(bytes+count>4096){out.push(part);part='';bytes=0;}part+=scalar;bytes+=count;}
  if(part)out.push(part);return out;
}
function artifact(s){
  if(s.a.armId.endsWith('patches'))return {content:'FICTIONAL full scoped patch proposal; unaccepted.',messages:[],notices:[],patches:s.a.files.map(file=>{
    const marker=file.content.indexOf('value = 0');assert(marker>=0);const start=marker+'value = '.length;assert.equal(file.content[start],'0');
    return {path:file.path,base_sha256:hash(file.content),edits:[{start,end:start+1,text:'1'}]};
  })};
  const frames=[];for(const file of s.a.files){frames.push({seq:frames.length,type:'file_start',path:file.path});for(const text of chunks(file.target))frames.push({seq:frames.length,type:'chunk',path:file.path,text});frames.push({seq:frames.length,type:'file_end',path:file.path});}frames.push({seq:frames.length,type:'output_end'});
  return {content:'FICTIONAL complete files; task tests and independent acceptance are still required.',messages:[],notices:[],full_file_output:{protocol:'full-file-output-chunks-v1',frames}};
}
function oneModel(s){assert.equal(s.f.boundary.effects.filter(effect=>effect.kind==='synthetic model creation').length,1);assert.equal(s.f.boundary.models.length,1);}
function noTestOrAcceptance(s){
  assert.equal(s.a.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type IN ('development.test_reserved','development.accepted')").get().n,0);
  assert.equal(Object.values(s.a.store.read().jobs).filter(job=>job.role==='qa'||job.kind==='development_test').length,0);
}
function validateCompleted(s,text){
  const state=s.a.store.read(),job=state.jobs[s.a.job.id],record=rawExact(s,text),e=record.runtime_wire_evidence,rows=candidates(s);
  const promptText=ref=>fs.readFileSync(path.join(evidenceDirectory(s),ref.blob.object_name),'utf8');
  assert.equal(hash(s.model.prompt),e.binding.actual_prompt_sha256);assert.equal(s.model.prompt.length,e.request.actual.utf16_units);
  assert.equal(s.model.prompt,promptText(e.request.canonical)+(e.request.encoding_instruction?promptText(e.request.encoding_instruction):''));assert.equal(s.model.prompt,promptText(e.request.actual));
  assert.equal(job.status,'completed',job.error);assert.equal(rows.length,1);const candidate=rows[0];assert.equal(candidate.status,'Submitted');assert.equal(candidate.id,job.artifact_id);
  for(const expected of s.a.files){const actual=candidate.development.files.find(file=>file.path===expected.path);assert(actual);assert.equal(Buffer.byteLength(actual.content),32768);assert.equal(actual.content,expected.target);assert(actual.content.startsWith('\ufeff'));assert(actual.content.includes('\r\n'));}
  assert.equal(candidate.development.files.find(file=>file.path==='fixed.test.mjs').content,s.a.testSource);assert.equal(candidate.development.candidate_sha256,digest(candidate.development.files));
  assert.equal(e.state,'derived');assert.equal(e.revision,3);assert.equal(e.derived.native_fidelity_or_acceptance_claim,false);assert.equal(e.derived.raw_lossless_sha256,e.outcome.raw.lossless_blob.sha256);
  const invocation=job.model_process_tracking.invocations[0];assert.equal(invocation.birth.pid,s.model.child.pid);assert.equal(invocation.birth.worker_pid,process.pid);assert.equal(invocation.closure.exit_code,0);assert.equal(invocation.closure.signal,null);assert(job.execution_started_at);assert(job.execution_deadline_at);
  assert.equal(e.outcome.physical_birth.invocation_id,invocation.invocation_id);assert.equal(e.outcome.physical_close.invocation_id,invocation.invocation_id);
  const events=s.a.store.db.prepare('SELECT seq,at,type,value FROM events ORDER BY seq').all(),position=type=>events.find(row=>row.type===type)?.seq;
  for(const [before,after]of [['job.model_process.requested','job.model_process.born'],['job.model_process.born','job.model_process.closed'],['job.model_process.closed','job.model_wire.response_retained'],['job.model_wire.response_retained','job.model_wire.derived_recorded'],['job.model_wire.derived_recorded','job.completed']])assert(position(before)<position(after),before+' precedes '+after);
  const history=events.filter(row=>JSON.parse(row.value).runtime_wire_evidence?.record_id===record.id);assert.equal(history.length,3);
  assert.deepEqual(history.map(row=>JSON.parse(s.a.store.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(JSON.parse(row.value).runtime_wire_evidence.after_record_sha256).bytes).runtime_wire_evidence.state),['requested','response_retained','derived']);
  const slot=JSON.parse(fs.readFileSync(slotPath(s)));assert.equal(slot.binding.job.id,job.id);assert.equal(slot.binding.invocation_id,invocation.invocation_id);assert.equal(e.request.B_slot.slot_record_sha256,hash(fs.readFileSync(slotPath(s))));
  oneModel(s);noTestOrAcceptance(s);assert.equal(s.f.boundary.effects.filter(effect=>effect.kind==='synthetic model stop').length,0);return {job,candidate,record};
}
async function engineerForReservation(t){
  const s=await selected(t),text=JSON.stringify(artifact(s)),completion=start(s);
  try{
    await entered(s,completion);s.model.answer(text);await completion;const completed=validateCompleted(s,text);
    // The ordinary worker closes after work() returns. Drive its original
    // controlled child; editing a job status cannot stand in for closure.
    s.f.boundary.finishWorker(s.a.store.root,s.a.job.id);const producer=s.a.store.read().jobs[s.a.job.id];
    assert.equal(producer.legacy_runtime.worker.closure.exit_code,0);assert.equal(runtimeJobOccupied(producer),false);
    return {...s,completed};
  }finally{await joined(s,completion);}
}
function testArgs(s){return {root:s.a.store.root,session_id:'fictional-founder',epoch:1,action:'run',plan_id:s.a.plan.id,candidate_id:s.completed.candidate.id};}
function testGuards(s){return s.a.store.db.prepare("SELECT v.bytes FROM state_entries e JOIN immutable_values v USING(sha256) WHERE e.family='records' AND json_extract(v.bytes,'$.runtime_candidate_test_guard.arm_id')=?").all(s.a.armId).map(row=>JSON.parse(row.bytes));}
function noTestReceipt(s){assert.equal(s.a.store.db.prepare("SELECT COUNT(*) AS n FROM state_entries e JOIN immutable_values v USING(sha256) WHERE e.family='records' AND json_extract(v.bytes,'$.development.type')='test'").get().n,0);}

test('tools reexports share canonical functions and private blob ownership across the package boundary',()=>{
  assert.equal(typeof Store,'function');assert.equal(typeof engine.control,'function');assert.equal(issuer.issueComparisonInitEntitlementFrom,canonicalIssuer.issueComparisonInitEntitlementFrom);
  assert.equal(issuer.consumeCommittedSelectedCallSlotAdmission,canonicalIssuer.consumeCommittedSelectedCallSlotAdmission);assert.equal(typed.capturePrompt,canonicalTyped.capturePrompt);
  const text='FICTIONAL cross-package blob \ufeff\r\n\ud83d\ude00',capture=typed.capturePrompt(text);assert(canonicalTyped.copyBlobBytes(capture.blob).equals(Buffer.from(text,'utf8')));
  assert.throws(()=>canonicalTyped.copyBlobBytes({...capture.blob}),/LOCAL_BLOB/);
});
for(const armId of ['1-files','1-patches','3-files','3-patches']){
  test('default work + private outcome + durable raw + complete candidate: '+armId,optionalDarwin,async t=>{
    const s=await selected(t,armId),text=JSON.stringify(artifact(s)),completion=start(s);
    try{await entered(s,completion);s.model.spawn();assert(s.a.store.read().jobs[s.a.job.id].execution_started_at);s.model.answer(text);await completion;validateCompleted(s,text);s.f.done();}
    finally{await joined(s,completion);}
  });
}
test('copied plans, public outcome DATA and a wrapped adapter fail; the original private plan still composes positively',optionalDarwin,async t=>{
  const s=await selected(t);let called=false;
  await assert.rejects(start(s,runRuntimeModel,{...s.plan}),/PLAN_CUSTODY/);
  await assert.rejects(start(s,async()=>{called=true;return {text:'caller copy',native_id:'caller'};}),/fixed runtime adapter/);
  assert.equal(called,false);assert.throws(()=>assertRuntimeModelOutcomeEligible({kind:'returned',text:'caller copy',native_id:'caller',process:{entered:true,closed:true}}),/PRIVATE_CAPTURE_REQUIRED/);
  assert.equal(s.a.store.read().jobs[s.a.job.id].status,'queued');assert.equal(fs.existsSync(slotPath(s)),false);assert.equal(s.model.called,false);
  const completion=start(s),text=JSON.stringify(artifact(s));try{await entered(s,completion);s.model.answer(text);await completion;validateCompleted(s,text);s.f.done();}finally{await joined(s,completion);}
});
test('failure at the actual request pre-COMMIT fence retains the spent B slot and creates no model child',optionalDarwin,async t=>{
  const s=await selected(t),original=Store.prototype.transaction,problem=Error('Selected actual request pre-COMMIT failure');let reached=false;
  const mock=t.mock.method(Store.prototype,'transaction',function(type,change,options={}){
    if(this!==s.a.store||type!=='job.model_process.requested')return Reflect.apply(original,this,[type,change,options]);
    return Reflect.apply(original,this,[type,change,{...options,beforeCommit:(db,state)=>{options.beforeCommit?.(db,state);reached=true;throw problem;}}]);
  });
  const completion=start(s);try{await assert.rejects(completion,error=>error===problem);assert.equal(reached,true);assert.equal(s.model.called,false);assert.equal(s.a.store.read().jobs[s.a.job.id].model_process_tracking,undefined);assert.equal(fs.existsSync(slotPath(s)),true);noCandidate(s);noTestOrAcceptance(s);s.f.done();}finally{mock.mock.restore();await joined(s,completion);}
});
test('malformed first sequence is rejected only after exact raw durability, with one actual Source invocation',optionalDarwin,async t=>{
  const s=await selected(t),envelope=artifact(s);envelope.full_file_output.frames[1].seq=91;const text=JSON.stringify(envelope),completion=start(s);
  try{await entered(s,completion);s.model.answer(text);await assert.rejects(completion,error=>error.code==='FULL_FILE_SEQUENCE');const record=rawExact(s,text);assert.equal(record.runtime_wire_evidence.state,'response_retained');assert.equal(record.revision,2);assert.equal(record.runtime_wire_evidence.derived,null);noCandidate(s);oneModel(s);
    await assert.rejects(start(s),/PLAN_CUSTODY/);assert.equal(fs.existsSync(slotPath(s)),true);s.f.done();}finally{await joined(s,completion);}
});
test('an unpaired returned JS code unit is retained losslessly before normalization refuses it',optionalDarwin,async t=>{
  const s=await selected(t),text='FICTIONAL exact malformed answer \ud800',completion=start(s);
  try{await entered(s,completion);s.model.answer(text);await assert.rejects(completion,error=>error.code==='FULL_FILE_UNICODE');const record=rawExact(s,text);assert.equal(record.runtime_wire_evidence.outcome.raw.unicode_well_formed,false);assert.equal(record.runtime_wire_evidence.state,'response_retained');noCandidate(s);oneModel(s);s.f.done();}finally{await joined(s,completion);}
});
test('objects-name replacement after Source birth leaves raw durability unproved and cannot publish a candidate or retry',optionalDarwin,async t=>{
  const s=await selected(t),text=JSON.stringify(artifact(s)),completion=start(s);let moved=false;
  try{await entered(s,completion);s.model.spawn();assert(s.a.store.read().jobs[s.a.job.id].model_process_tracking.invocations[0].birth);const objects=path.join(evidenceDirectory(s),'objects');fs.renameSync(objects,objects+'-retained');moved=true;s.model.answer(text);
    await assert.rejects(completion);assert.equal(moved,true);noCandidate(s);oneModel(s);assert.equal(wire(s).runtime_wire_evidence.state,'requested');assert.equal(fs.existsSync(path.join(objects+'-retained',hash(Buffer.from(text,'utf16le'))+'.blob')),false);assert.equal(fs.existsSync(objects),false);assert.equal(fs.existsSync(slotPath(s)),true);
    await assert.rejects(start(s),/PLAN_CUSTODY/);s.f.done();}finally{await joined(s,completion);}
});
test('authority mutation queued after genuine Source close preserves factual raw but blocks publication',optionalDarwin,async t=>{
  const s=await selected(t),text=JSON.stringify(artifact(s)),completion=start(s);let changed=false;
  s.model.afterClose=()=>{s.a.store.transaction('fictional.authority-changed-after-close',state=>{state.records['fictional-B-policy'].content+=' changed governing condition';return state;});changed=true;};
  try{await entered(s,completion);s.model.spawn();s.model.answer(text);await assert.rejects(completion);assert.equal(changed,true);const record=rawExact(s,text);assert.equal(record.runtime_wire_evidence.state,'error_retained');assert.equal(record.runtime_wire_evidence.outcome.adapter_state,'returned');assert.equal(record.runtime_wire_evidence.outcome.primary_error,null);assert(record.runtime_wire_evidence.outcome.capture_error);noCandidate(s);oneModel(s);s.f.done();}finally{await joined(s,completion);}
});
test('produced evidence custody survives worker return and ends only at explicit run close, retaining immutable files',optionalDarwin,async t=>{
  const s=await selected(t),text=JSON.stringify(artifact(s)),completion=start(s);
  try{await entered(s,completion);s.model.answer(text);await completion;const {record}=validateCompleted(s,text),ref=comparisonProducedEvidenceFrom(s.run,s.a.store,s.a.job.id),before=rawBlob(s,record.runtime_wire_evidence.outcome.raw);assert.equal(ref.id,record.id);assert.equal(ref.sha256,digest(record));
    issuer.closeComparisonRun(s.run);assert.throws(()=>comparisonProducedEvidenceFrom(s.run,s.a.store,s.a.job.id));assert(rawBlob(s,record.runtime_wire_evidence.outcome.raw).equals(before));assert.equal(fs.existsSync(slotPath(s)),true);s.f.done();}finally{await joined(s,completion);}
});

// This integration stops at the real reservation gate. Test-worker creation is
// controlled; no watchdog/TAP result, Pass receipt, QA or acceptance record is
// fabricated to fill the unexecuted remainder.
test('actual development run reserves one guarded test only after the genuine Store COMMIT witness',optionalDarwin,async t=>{
  const s=await engineerForReservation(t),candidate=s.completed.candidate,plan=createComparisonTestPlanFrom(s.run,s.a.store,s.a.armId,candidate.id),permit=s.f.testWorkerFor(s.a.store,s.a.plan.id,candidate.id);
  const job=await developmentAction(testArgs(s),'codex',{comparisonTestPlan:plan});assert.equal(permit.called,true);assert.equal(permit.jobId,job.id);permit.child.emit('spawn');
  const committed=assertComparisonTestCommittedFrom(plan,s.a.store),rows=testGuards(s);assert.equal(rows.length,1);const value=rows[0],g=value.runtime_candidate_test_guard;
  assert.equal(committed.protocol,'issue18-test-commit-witness-data-v1');assert.equal(committed.record_id,value.id);assert.equal(committed.record_sha256,digest(value));assert.equal(committed.authority_claim,false);
  assert.equal(value.revision,1);assert.equal(g.state,'requested');assert.equal(g.actual_receipt,null);assert.equal(g.test_job_id,job.id);assert.equal(g.candidate.id,candidate.id);assert.equal(g.candidate.sha256,digest(candidate));assert.equal(g.candidate_sha256,candidate.development.candidate_sha256);
  const event=s.a.store.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(committed.event_seq),proof=JSON.parse(event.value).runtime_candidate_test_guard;
  assert.equal(event.type,'development.test_reserved');assert.equal(digest([event.seq,event.at,event.type,event.value]),committed.event_sha256);assert.equal(proof.after_record_sha256,digest(value));assert.equal(proof.actual_store_commit_id,committed.store_transaction_id);assert.equal(g.reservation_anchor.event_seq,event.seq);
  s.a.store.readSnapshot(()=>{const state=s.a.store.read(),record=state.records[value.id];assert.equal(inspectComparisonTestRecordFrom(state,record).recordSha,digest(value));});
  assert.equal(s.a.store.read().records[candidate.id].development.run.job_id,job.id);assert.equal(s.a.store.read().jobs[job.id].status,'queued');assert.throws(()=>assertComparisonTestCommittedFrom({...plan},s.a.store),/PLAN_CUSTODY/);
  await assert.rejects(developmentAction(testArgs(s),'codex',{comparisonTestPlan:plan}),/PLAN_CUSTODY/);assert.throws(()=>createComparisonTestPlanFrom(s.run,s.a.store,s.a.armId,candidate.id));
  let called=false;await assert.rejects(executeDevelopmentTest(s.a.store.root,job.id,{runLocalTests:()=>{called=true;throw Error('An unselected executor override must never run');}}),error=>error.code==='RUNTIME_EXECUTION_TEST_OVERRIDE_FORBIDDEN');assert.equal(called,false);
  assert.equal(s.f.boundary.effects.filter(effect=>effect.kind==='synthetic fixed development-test worker creation').length,1);assert.equal(s.f.boundary.effects.filter(effect=>/watchdog|sandboxed test/.test(effect.kind)).length,0);noTestReceipt(s);oneModel(s);s.f.done();
});
test('actual reservation rollback cannot mint a witness or refund the original test selection',optionalDarwin,async t=>{
  const s=await engineerForReservation(t),plan=createComparisonTestPlanFrom(s.run,s.a.store,s.a.armId,s.completed.candidate.id),permit=s.f.testWorkerFor(s.a.store,s.a.plan.id,s.completed.candidate.id),problem=Error('Selected actual test reservation rollback');
  const original=Store.prototype.transaction;let enteredFence=false,checksCompleted=false;
  const mocked=t.mock.method(Store.prototype,'transaction',function(type,change,options={}){
    if(this!==s.a.store||type!=='development.test_reserved')return Reflect.apply(original,this,[type,change,options]);
    return Reflect.apply(original,this,[type,change,{...options,beforeCommit:(db,state)=>{
      options.beforeCommit?.(db,state);enteredFence=true;assert.equal(db.isTransaction,true);
      assert.throws(()=>prepareComparisonTestCommitFrom(s.a.store,Object.freeze({})),error=>error.code==='LEGACY_RUNTIME_COMMIT_WITNESS_REQUIRED');
      finalizeComparisonTestCommitFrom(Object.freeze({}));assert.throws(()=>assertComparisonTestCommittedFrom(plan,s.a.store));checksCompleted=true;throw problem;
    }}]);
  });
  try{
    await assert.rejects(developmentAction(testArgs(s),'codex',{comparisonTestPlan:plan}),error=>error===problem);assert.equal(enteredFence,true);assert.equal(checksCompleted,true);assert.equal(permit.called,false);assert.equal(testGuards(s).length,0);
    assert.equal(s.a.store.read().records[s.completed.candidate.id].development.run,undefined);assert.throws(()=>assertComparisonTestCommittedFrom(plan,s.a.store));assert.throws(()=>createComparisonTestPlanFrom(s.run,s.a.store,s.a.armId,s.completed.candidate.id));
    assert.equal(s.a.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='development.test_reserved'").get().n,0);noTestReceipt(s);oneModel(s);s.f.done();
  }finally{mocked.mock.restore();}
});
test('durable reservation plus a lost post-COMMIT return cannot be adopted as the private launch witness',optionalDarwin,async t=>{
  const s=await engineerForReservation(t),plan=createComparisonTestPlanFrom(s.run,s.a.store,s.a.armId,s.completed.candidate.id),permit=s.f.testWorkerFor(s.a.store,s.a.plan.id,s.completed.candidate.id),problem=Error('Selected return failure after real test reservation COMMIT');
  const original=Store.prototype.snapshotState;let failedAfterPhysicalCommit=false;
  const mocked=t.mock.method(Store.prototype,'snapshotState',function(state){
    if(this===s.a.store&&this.inTransaction===true&&this.db.isTransaction===false&&!failedAfterPhysicalCommit&&Object.values(state.records??{}).some(record=>record.runtime_candidate_test_guard)){
      failedAfterPhysicalCommit=true;throw problem;
    }return Reflect.apply(original,this,[state]);
  });
  try{
    await assert.rejects(developmentAction(testArgs(s),'codex',{comparisonTestPlan:plan}),error=>error===problem);assert.equal(failedAfterPhysicalCommit,true);assert.equal(permit.called,false);assert.equal(s.a.store.db.isTransaction,false);
  }finally{mocked.mock.restore();}
  // Read committed SQL DATA without adopting an unfinalized hot guard. A
  // normal Store/currentness reader is permitted to Hold on this residue.
  const rows=testGuards(s);assert.equal(rows.length,1);const value=rows[0],event=s.a.store.db.prepare("SELECT seq,type,value FROM events WHERE type='development.test_reserved'").get();assert(event);assert.equal(JSON.parse(event.value).runtime_candidate_test_guard.after_record_sha256,digest(value));assert.equal(value.runtime_candidate_test_guard.state,'requested');
  assert.throws(()=>assertComparisonTestCommittedFrom(plan,s.a.store));finalizeComparisonTestCommitFrom(Object.freeze({}));assert.throws(()=>assertComparisonTestCommittedFrom(plan,s.a.store));
  await assert.rejects(developmentAction(testArgs(s),'codex',{comparisonTestPlan:plan}));assert.equal(s.a.store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='development.test_reserved'").get().n,1);noTestReceipt(s);oneModel(s);s.f.done();
});
test('the actual public run path cannot bypass the private test selection for a captured engineer candidate',optionalDarwin,async t=>{
  const s=await engineerForReservation(t),permit=s.f.testWorkerFor(s.a.store,s.a.plan.id,s.completed.candidate.id);
  await assert.rejects(developmentAction(testArgs(s),'codex'),error=>error.code==='ISSUE18_TEST_SELECTED_TEST_PLAN_REQUIRED');assert.equal(permit.called,false);assert.equal(testGuards(s).length,0);assert.equal(s.a.store.read().records[s.completed.candidate.id].development.run,undefined);noTestReceipt(s);oneModel(s);s.f.done();
});
