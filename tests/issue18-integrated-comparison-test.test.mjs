// SOURCE-only state-machine regression graph. Store/COMMIT, completed Native
// evidence and actual-test producers are declared controlled dependencies in
// this isolated VM. No fixture object is accepted by the real private issuers.
// These tests are not an executed isolated test, Native result or adoption proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const filename=fileURLToPath(new URL('../plugins/soloco/runtime/integrated-comparison-test.mjs',import.meta.url));
const text=fs.readFileSync(filename,'utf8'),hash=value=>createHash('sha256').update(value).digest('hex'),digest=value=>hash(JSON.stringify(value));
const copy=value=>JSON.parse(JSON.stringify(value)),reference=value=>({id:value.id,revision:value.revision,sha256:digest(value)});
const errorCode=code=>error=>error.code==='ISSUE18_TEST_'+code;
function fixture(){
 const root='/SOURCE-only-fictional-company',run=Object.freeze({}),bound=Object.freeze({}),spend=Object.freeze({}),physicalCommit=Object.freeze({});
 const scope={max_bytes:200000,timeout_ms:10000,max_output_bytes:10000,expires_at:new Date(Date.now()+60000).toISOString(),sources:[{path:'module-0.mjs',content:'old'},{path:'fixture.test.mjs',content:'Controlled fixed test bytes, never executed here.'}],write_paths:['module-0.mjs'],test_paths:['fixture.test.mjs']};
 const plan={id:'plan',revision:1,development:{scope,scope_sha256:digest(scope),authorization:{selected:'SOURCE only'}}};
 const producer={id:'producer',status:'completed',role:'engineer',artifact_id:'candidate',instance_id:'engineer-instance',native_id:'controlled-engineer-id',coordination_release:{termination_confirmed:true}};
 const files=[{path:'fixture.test.mjs',content:scope.sources[1].content},{path:'module-0.mjs',content:'new'}];
 const candidate={id:'candidate',revision:1,status:'Submitted',job_id:producer.id,author_instance:producer.instance_id,development:{type:'candidate',plan_id:plan.id,scope_sha256:plan.development.scope_sha256,files,candidate_sha256:digest(files)}};
 const evidence={id:'evidence',revision:3,job_id:producer.id,runtime_wire_evidence:{state:'derived',binding:{profile_sha256:hash('controlled-profile'),run_id:'controlled-run',arm_id:'1-files',phase:'engineer',job:{id:producer.id},plan:{id:plan.id,revision:plan.revision,record_sha256:digest(plan),scope_sha256:plan.development.scope_sha256},invocation_id:'controlled-invocation'},derived:{codec_outcome:'normalized'}}};
 const state={id:'controlled-company',records:{plan,candidate,evidence},jobs:{producer}},events=[],immutables=new Map([[digest(candidate),JSON.stringify(candidate)]]),terminals=new WeakMap(),actualReceipts=new WeakSet();
 let persisted=copy(state);
 let active=true,scopeToken=Object.freeze({}),type='snapshot',postCommit=false,spent=false,spends=0,charges=0,pinned=true;
 const store={root,read:()=>copy(persisted),readSnapshot:operation=>operation(),db:{prepare(sql){return {
  get(...args){
   if(sql.includes('COUNT(*)'))return {n:events.filter(row=>{const value=JSON.parse(row.value).runtime_candidate_test_guard;return value?.run_id===args[0]&&value.arm_id===args[1]&&value.transition==='request';}).length};
   if(sql.includes('MAX(seq)'))return {seq:events.length+(sql.includes('+1')?1:0)};
   if(sql.includes('immutable_values'))return {bytes:immutables.get(args[0])};
   if(sql.includes('state_entries'))return {sha256:digest(state.records[args[0]])};
   if(sql.includes('WHERE seq=?'))return events.find(row=>row.seq===args[0]);
   assert.fail('Unhandled controlled Source SQL: '+sql);
  },
  all(id){assert(sql.includes('runtime_candidate_test_guard.record_id'));return events.filter(row=>JSON.parse(row.value).runtime_candidate_test_guard?.record_id===id);}
 };}}};
 const assertActive=()=>assert(active,'The declared Source snapshot is active');
 const deps={fs,fileURLToPath,createHash,randomUUID,Buffer,
  originalStoreExecutionCustodyFrom(value){assert.equal(value,store);assertActive();return {store,db:store.db,root,scope:scopeToken,type,state,mode:type==='snapshot'?'read':'write',assert:assertActive};},
  inspectRuntimeStoreCommitWitnessFrom(value,actualStore){assert.equal(actualStore,store);assert.equal(value,physicalCommit,'Only controlled lexical Source COMMIT witness');assert(postCommit);return {root,scope:scopeToken};},
  validTestExecution(_state,receipt){return actualReceipts.has(receipt);},
  inspectComparisonDevelopmentTestTerminalFrom(token,actualStore,actualState){assert.equal(actualStore,store);assert.equal(actualState,state);const facts=terminals.get(token);terminals.delete(token);assert(facts,'Only controlled lexical executor terminal loan');return facts;},
  comparisonProducedEvidenceFrom(actualRun,actualStore,job){assert.equal(actualRun,run);assert.equal(actualStore,store);assert([producer.id,'qa-job'].includes(job));assert(pinned,'A live original evidence pin is required');return job===producer.id?reference(evidence):{id:'qa-evidence',revision:3,sha256:hash('controlled genuine QA evidence seam')};},
  comparisonProducedArmFrom(actualRun,actualStore,job){assert.equal(actualRun,run);assert.equal(actualStore,store);assert.equal(job,producer.id);return bound;},
  inspectComparisonEvidenceRecordFrom(actualState,value){assert.equal(actualState.records[value.id],value);assert.equal(digest(value),digest(evidence));return {recordSha:digest(evidence)};},
  assertComparisonEvidenceAcceptanceFrom(){assert(pinned);},
  chargeComparisonTestEvidenceFrom(actualRun,actualStore,job,value){assert.equal(actualRun,run);assert.equal(actualStore,store);assert.equal(job,producer.id);assert.equal(value.header_bytes,65536);assert.equal(value.event_bytes,131072);charges++;},
  consumeComparisonTestEntitlementFrom(actualRun,actualStore,input){assert.equal(actualRun,run);assert.equal(actualStore,store);assert.equal(input.engineerBoundArm,bound);assert.equal(spent,false,'Global controlled one-test counter remains spent');spent=true;spends++;return spend;},
  inspectComparisonTestEntitlementFrom(token,actualStore){assert.equal(token,spend);assert.equal(actualStore,store);return {run_id:'controlled-run',arm_id:'1-files',store,db:store.db,root,deadlineAtMs:Date.now()+60000};},
  comparisonStoreBindingFrom(){return {root_sha256:hash(root),company_identity_sha256:hash('controlled-company'),incarnation_sha256:hash('controlled-incarnation'),physical_layout:'normalized4',lane:'unqualified_legacy'};}
 };
 const body=text.replace(/^import [^\n]+;\n/gm,'').replace(/^export (?=function )/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../plugins/soloco/runtime/integrated-comparison-test.mjs',import.meta.url).href));
 const names=['createComparisonTestPlanFrom','comparisonTestStoreFrom','comparisonTestGuardAppliesFrom','stageComparisonTestReservationFrom','beginComparisonTestWriteFrom','prepareComparisonTestWriteFrom','comparisonTestEventFrom','prepareComparisonTestCommitFrom','finalizeComparisonTestCommitFrom','assertComparisonTestCommittedFrom','stageComparisonTestTerminalFrom','validateStoredComparisonTestFrom','bindComparisonTestBookkeepingFrom','inspectComparisonTestRecordFrom','comparisonTestPrerequisiteFrom','assertComparisonAcceptanceFrom'];
 const api=vm.runInContext(body+'\n;({'+names.join(',')+'});',vm.createContext(deps),{filename:'SOURCE-only-integrated-comparison-test.mjs',timeout:1000});
 const job={id:'real-source-test-job',kind:'development_test',development_id:plan.id,candidate_id:candidate.id,status:'queued'};
 const bind=()=>api.bindComparisonTestBookkeepingFrom(store,state);
 function begin(event,baseline=state){type=event;scopeToken=Object.freeze({});postCommit=false;active=true;if(event!=='snapshot')api.beginComparisonTestWriteFrom(store,baseline);}
 function publish(){
  api.prepareComparisonTestWriteFrom(store,state);const payload=api.comparisonTestEventFrom(store,{revision:1,owner:'controlled-existing-source-payload'});
  const event={seq:events.length+1,at:new Date().toISOString(),type,value:JSON.stringify(payload)};events.push(event);for(const value of Object.values(state.records))immutables.set(digest(value),JSON.stringify(value));persisted=copy(state);postCommit=true;return event;
 }
 function reserve(){const handle=api.createComparisonTestPlanFrom(run,store,'1-files',candidate.id);api.comparisonTestStoreFrom(handle,root,candidate.id);begin('development.test_reserved');state.jobs[job.id]=job;candidate.development.run={job_id:job.id,status:'queued'};api.stageComparisonTestReservationFrom(handle,store,state,job,candidate,plan);return handle;}
 function commit(){const prepared=api.prepareComparisonTestCommitFrom(store,physicalCommit);api.finalizeComparisonTestCommitFrom(prepared);begin('snapshot');bind();return prepared;}
 function terminal({passed=true,reused=false,authenticate=true}={}){
  begin('development.test_finished');bind();job.status='completed';job.artifact_id='actual-runtime-receipt';
  const result={status:passed?'passed':'failed',exit_code:passed?0:1,tests_executed:true,...(reused?{reused:true}:{})},receipt={id:job.artifact_id,revision:1,kind:'artifact',author_role:'runtime',author_instance:job.id,status:'Submitted',development:{type:'test',plan_id:plan.id,candidate_id:candidate.id,candidate_sha256:candidate.development.candidate_sha256,result,receipt_sha256:digest(result)}};
  state.records[receipt.id]=receipt;candidate.development.run={job_id:job.id,status:'completed',receipt_id:receipt.id};if(authenticate)actualReceipts.add(receipt);
  const token=Object.freeze({});terminals.set(token,{job_id:job.id,receipt});api.stageComparisonTestTerminalFrom(token,store,state);return receipt;
 }
 function failure(){begin('development.test_spawn_failed');bind();job.status='failed';candidate.development.run.status='failed';const token=Object.freeze({});terminals.set(token,{job_id:job.id,receipt:null});api.stageComparisonTestTerminalFrom(token,store,state);}
 function qa(receipt){state.jobs['qa-job']={id:'qa-job',status:'completed',native_id:'controlled-independent-QA-id'};const value={id:'qa-review',revision:1,job_id:'qa-job',author_instance:'qa-instance',review_of:{id:receipt.id,revision:receipt.revision}};state.records[value.id]=value;return value;}
 return {api,store,state,run,plan,candidate,evidence,job,events,physicalCommit,begin,publish,reserve,commit,terminal,failure,qa,bind,
  get spends(){return spends;},get charges(){return charges;},set pinned(value){pinned=value;},endSnapshot(){active=false;},guard:()=>Object.values(state.records).find(value=>value.runtime_candidate_test_guard)};
}

test('one global spend precedes arm reservation and a prepared COMMIT remains unusable until finalization',()=>{
 const f=fixture(),plan=f.reserve();assert.equal(f.spends,1);assert.equal(f.charges,1);assert.equal(f.events.length,0);
 assert.throws(()=>f.api.assertComparisonTestCommittedFrom(plan,f.store),errorCode('ACTUAL_RESERVATION_COMMIT_REQUIRED'));
 const event=f.publish(),value=f.guard(),anchor=value.runtime_candidate_test_guard.reservation_anchor;
 assert.equal(value.job_id,f.job.id);assert.equal(value.author_instance,f.job.id);assert.equal(anchor.event_seq,event.seq);assert.equal(anchor.store_transaction_id,JSON.parse(event.value).runtime_candidate_test_guard.actual_store_commit_id);assert.equal(Object.hasOwn(anchor,'event_sha256'),false);
 const prepared=f.api.prepareComparisonTestCommitFrom(f.store,f.physicalCommit);
 assert.throws(()=>f.api.assertComparisonTestCommittedFrom(plan,f.store),errorCode('ACTUAL_RESERVATION_COMMIT_REQUIRED'));
 f.begin('snapshot');f.bind();assert.throws(()=>f.api.inspectComparisonTestRecordFrom(f.state,value),errorCode('UNFINALIZED_COMMIT'));
 f.api.finalizeComparisonTestCommitFrom(prepared);assert.equal(f.api.assertComparisonTestCommittedFrom(plan,f.store).record_id,value.id);
});
test('ordinary unselected candidates leave no guard, event contribution or test spend',()=>{
 const f=fixture();delete f.state.records.evidence;f.begin('development.test_reserved');f.api.stageComparisonTestReservationFrom(undefined,f.store,f.state,f.job,f.candidate,f.plan);
 assert.equal(f.guard(),undefined);assert.equal(f.spends,0);assert.equal(f.api.prepareComparisonTestCommitFrom(f.store,{}),null);
 const payload={existing:true};assert.equal(f.api.comparisonTestEventFrom(f.store,payload),payload);
});
test('initial null company and mixed legacy record leaves stay inactive without extra Store reads',()=>{
 const f=fixture(),legacy={records:{nothing:null,text:'unknown legacy DATA',number:7,flag:false,ordinary:{id:'ordinary',content:'Unrelated record'}},jobs:{nothing:null}};
 f.store.read=()=>{throw Error('The inactive path must not hydrate the Store');};
 f.begin('company.created',null);assert.doesNotThrow(()=>f.api.prepareComparisonTestWriteFrom(f.store,legacy));
 const payload={existing:'unchanged'};assert.equal(f.api.comparisonTestEventFrom(f.store,payload),payload);
 f.begin('ordinary-update',legacy);assert.doesNotThrow(()=>f.api.prepareComparisonTestWriteFrom(f.store,legacy));
 assert.doesNotThrow(()=>f.api.stageComparisonTestReservationFrom(undefined,f.store,legacy,f.job,f.candidate,f.plan));assert.equal(f.api.comparisonTestGuardAppliesFrom(legacy,f.job.id),false);
 assert.equal(f.spends,0);assert.equal(f.charges,0);assert.equal(f.api.prepareComparisonTestCommitFrom(f.store,{}),null);
});
test('selected producer without matching private plan cannot use the ordinary test path',()=>{
 const f=fixture();f.begin('development.test_reserved');assert.throws(()=>f.api.stageComparisonTestReservationFrom({},f.store,f.state,f.job,f.candidate,f.plan),errorCode('SELECTED_TEST_PLAN_REQUIRED'));assert.equal(f.guard(),undefined);
});
test('an alternate recovery reservation cannot bypass the selected one-test producer',()=>{
 const f=fixture();f.begin('development.preflight_recovery_reserved');f.state.jobs[f.job.id]=f.job;
 assert.throws(()=>f.api.prepareComparisonTestWriteFrom(f.store,f.state),errorCode('UNISSUED_TEST_RESERVATION'));assert.equal(f.spends,0);assert.equal(f.events.length,0);
});
test('prewrite uses the private class baseline without a second full Store hydration',()=>{
 const f=fixture();f.begin('ordinary-update');f.store.read=()=>{throw Error('No second full Store read is permitted');};
 assert.doesNotThrow(()=>f.api.prepareComparisonTestWriteFrom(f.store,f.state));
});
test('failed reservation and changed job cannot refund or rekey the global test spend',()=>{
 const f=fixture(),plan=f.api.createComparisonTestPlanFrom(f.run,f.store,'1-files',f.candidate.id);f.api.comparisonTestStoreFrom(plan,f.store.root,f.candidate.id);f.begin('development.test_reserved');
 f.job.reuse_receipt_id='forbidden-reuse';assert.throws(()=>f.api.stageComparisonTestReservationFrom(plan,f.store,f.state,f.job,f.candidate,f.plan),errorCode('ACTUAL_TEST_JOB'));
 delete f.job.reuse_receipt_id;assert.throws(()=>f.api.stageComparisonTestReservationFrom(plan,f.store,f.state,f.job,f.candidate,f.plan),errorCode('SELECTED_TEST_PLAN_REQUIRED'));
 assert.throws(()=>f.api.createComparisonTestPlanFrom(f.run,f.store,'1-files',f.candidate.id));assert.equal(f.spends,1);
});
test('public COMMIT-shaped DATA and copied plans cannot arm an actual test',()=>{
 const f=fixture(),plan=f.reserve();f.publish();assert.throws(()=>f.api.prepareComparisonTestCommitFrom(f.store,{root:f.store.root}));
 assert.throws(()=>f.api.assertComparisonTestCommittedFrom({...plan},f.store),errorCode('PLAN_CUSTODY'));
 assert.throws(()=>f.api.assertComparisonTestCommittedFrom(plan,f.store),errorCode('ACTUAL_RESERVATION_COMMIT_REQUIRED'));
});
test('passing exact nonreused terminal yields one immutable passed guard and canonical QA prerequisite',()=>{
 const f=fixture(),plan=f.reserve();f.publish();f.commit();f.api.assertComparisonTestCommittedFrom(plan,f.store);
 const anchor=copy(f.guard().runtime_candidate_test_guard.reservation_anchor),receipt=f.terminal();f.publish();f.commit();
 const value=f.guard(),g=value.runtime_candidate_test_guard;assert.equal(value.revision,2);assert.equal(g.state,'passed');assert.equal(g.test_job_id,f.job.id);assert.deepEqual(copy(g.reservation_anchor),anchor);
 const prerequisite=f.api.comparisonTestPrerequisiteFrom(f.store,f.state,reference(value),reference(receipt));assert.equal(prerequisite.test_job_id,f.job.id);assert.equal(prerequisite.actual_receipt_ref.id,receipt.id);assert.equal(prerequisite.candidate_sha256,f.candidate.development.candidate_sha256);assert.equal(f.spends,1);
 assert.throws(()=>f.api.comparisonTestPrerequisiteFrom(f.store,f.state,reference(value),reference(f.candidate)),errorCode('PASSED_GUARD_REQUIRED'));
});
for(const mode of ['failed','reused','unproved'])test(mode+' terminal cannot become QA eligibility',()=>{
 const f=fixture();f.reserve();f.publish();f.commit();const receipt=f.terminal({passed:mode!=='failed',reused:mode==='reused',authenticate:mode!=='unproved'});f.publish();f.commit();
 assert.equal(f.guard().runtime_candidate_test_guard.state,'failed_or_unknown');assert.throws(()=>f.api.comparisonTestPrerequisiteFrom(f.store,f.state,reference(f.guard()),reference(receipt)),errorCode('PASSED_GUARD_REQUIRED'));
});
test('a second terminal and arbitrary terminal-shaped objects cannot replace the first outcome',()=>{
 const f=fixture();f.reserve();f.publish();f.commit();f.terminal();f.publish();f.commit();
 assert.throws(()=>f.terminal(),errorCode('TERMINAL_SPENT'));assert.throws(()=>f.api.stageComparisonTestTerminalFrom({job_id:f.job.id},f.store,f.state));
});
test('actual spawn failure retains a sole failed guard with no invented receipt or retry',()=>{
 const f=fixture();f.reserve();f.publish();f.commit();f.failure();f.publish();f.commit();
 assert.equal(f.guard().runtime_candidate_test_guard.state,'failed_or_unknown');assert.equal(f.guard().runtime_candidate_test_guard.actual_receipt,null);assert.equal(f.spends,1);
 assert.throws(()=>f.api.createComparisonTestPlanFrom(f.run,f.store,'1-files',f.candidate.id));
});
test('acceptance rechecks the live pins and permits only its exact existing receipt annotation',()=>{
 const f=fixture();f.reserve();f.publish();f.commit();const receipt=f.terminal();f.publish();f.commit();const qa=f.qa(receipt);
 f.api.assertComparisonAcceptanceFrom(f.store,f.state,f.candidate.id,qa.id);
 receipt.development.acceptance={review_id:qa.id,candidate_sha256:f.candidate.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256};
 f.api.assertComparisonAcceptanceFrom(f.store,f.state,f.candidate.id,qa.id);
 receipt.content='Unrelated receipt mutation cannot hide behind acceptance';assert.throws(()=>f.api.assertComparisonAcceptanceFrom(f.store,f.state,f.candidate.id,qa.id),errorCode('ACCEPTANCE_ANNOTATION'));
 delete receipt.content;f.pinned=false;assert.throws(()=>f.api.assertComparisonAcceptanceFrom(f.store,f.state,f.candidate.id,qa.id));
});
test('mutable run bookkeeping does not mask changed candidate bytes or discarded evidence pins',()=>{
 const f=fixture();f.reserve();f.publish();f.commit();const receipt=f.terminal();f.publish();f.commit();const value=f.guard();
 f.candidate.development.files[0].content='corrupted fixed test';assert.throws(()=>f.api.comparisonTestPrerequisiteFrom(f.store,f.state,reference(value),reference(receipt)),errorCode('CANDIDATE_BYTES'));
 f.pinned=false;assert.throws(()=>f.api.assertComparisonAcceptanceFrom(f.store,f.state,f.candidate.id,'unavailable-review'));
});
test('unissued guard mutation cannot obtain event or currentness proof',()=>{
 const f=fixture();f.reserve();f.publish();f.commit();f.begin('unrelated.public_save');f.guard().runtime_candidate_test_guard.authority_or_refund_claim=true;
 assert.throws(()=>f.bind(),errorCode('GUARD_SHAPE'));
});
test('omitting an entire record family cannot hide deletion of the old selected guard',()=>{
 const f=fixture();f.reserve();f.publish();f.commit();f.begin('ordinary-update');delete f.state.records;
 assert.throws(()=>f.api.prepareComparisonTestWriteFrom(f.store,f.state),errorCode('UNISSUED_GUARD_WRITE'));
});
test('stored census allows only the exact private pending postimage and returns complete reference domains',()=>{
 const f=fixture();f.reserve();const value=f.guard(),valid=f.api.validateStoredComparisonTestFrom(f.store,{records:f.state.records},value);
 assert.equal(valid.recordSha,digest(value));assert.equal(valid.job_id,f.job.id);assert.deepEqual(Array.from(valid.references,ref=>ref.id).sort(),['candidate','evidence','plan']);assert.equal(valid.history[0].bytes,Buffer.byteLength(JSON.stringify(value)));
 f.bind();assert.throws(()=>f.api.inspectComparisonTestRecordFrom(f.state,value),errorCode('UNFINALIZED_COMMIT'));
 const altered=copy(value);altered.runtime_candidate_test_guard.test_job_id='different-job';assert.throws(()=>f.api.validateStoredComparisonTestFrom(f.store,f.state,altered));
});
test('historical reservation prefix remains passive Source evidence after terminal and snapshot expiry',()=>{
 const f=fixture();f.reserve();const original=copy(f.guard());f.publish();f.commit();f.terminal();f.publish();f.commit();
 const prefix=f.api.validateStoredComparisonTestFrom(f.store,{records:f.state.records},original);assert.equal(prefix.history.length,1);assert.equal(prefix.recordSha,digest(original));
 const current=f.guard();f.endSnapshot();assert.equal(f.api.inspectComparisonTestRecordFrom(f.state,current).recordSha,digest(current));
 assert.throws(()=>f.api.comparisonTestPrerequisiteFrom(f.store,f.state,reference(current),current.runtime_candidate_test_guard.actual_receipt),'Passive bookkeeping cannot replace a live Store scope');
});
