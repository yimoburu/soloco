// Optional A2 producer. Public guard fields are audit DATA; a selected test
// needs the global private spend AND its actual owning reservation COMMIT.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {originalStoreExecutionCustodyFrom,inspectRuntimeStoreCommitWitnessFrom} from './store.mjs';
import {validTestExecution,inspectComparisonDevelopmentTestTerminalFrom} from './develop.mjs';
import {comparisonProducedEvidenceFrom,comparisonProducedArmFrom,inspectComparisonEvidenceRecordFrom,chargeComparisonTestEvidenceFrom,assertComparisonAcceptanceFrom as assertComparisonEvidenceAcceptanceFrom} from './integrated-comparison-evidence.mjs';
import {consumeComparisonTestEntitlementFrom,inspectComparisonTestEntitlementFrom,comparisonStoreBindingFrom} from './qualification/issue18/integrated-comparison-issuer.mjs';

const plans=new WeakMap(),pendingWrites=new WeakMap(),pendingStores=new WeakMap(),baselines=new WeakMap(),proofs=new WeakMap(),witnesses=new WeakMap(),finalizations=new WeakMap(),commitLeases=new Map(),selected=new Map(),selectedRoots=new Set();
const hash=value=>createHash('sha256').update(value).digest('hex'),digest=value=>hash(JSON.stringify(value)),copy=value=>JSON.parse(JSON.stringify(value));
const need=(ok,code)=>{if(!ok)throw Object.assign(Error('Issue18 test Hold: '+code),{code:'ISSUE18_TEST_'+code});};
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const ref=record=>({id:record.id,revision:record.revision,sha256:digest(record)}),guard=record=>record?.runtime_candidate_test_guard;
const same=(a,b)=>digest(a)===digest(b),key=(root,candidate)=>root+'\0'+candidate;
const types=new Set(['development.test_reserved','development.test_finished','development.test_spawn_failed','development.test_start_failed']);
const source=()=>hash(fs.readFileSync(fileURLToPath(import.meta.url)));
const label=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.exec(value)?.[0]===value,hex=value=>typeof value==='string'&&value.length===64&&/^[a-f0-9]{64}$/.test(value);
function closed(value,keys){need(value&&typeof value==='object'&&!Array.isArray(value),'GUARD_SHAPE');const own=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);need(own.length===keys.length&&keys.every(name=>Object.hasOwn(descriptors,name)&&Object.hasOwn(descriptors[name],'value')&&descriptors[name].enumerable),'GUARD_SHAPE');}
function referenceShape(value){closed(value,['id','revision','sha256']);need(label(value.id)&&Number.isSafeInteger(value.revision)&&value.revision>=1&&hex(value.sha256),'GUARD_SHAPE');}
function guardShape(value,root){
  closed(value,['id','kind','author_role','author_instance','revision','status','created_at','content','job_id','inputs','runtime_candidate_test_guard']);
  const g=guard(value);closed(g,['protocol','profile_sha256','run_id','arm_id','store','plan_id','scope_sha256','producer_evidence_record','candidate','candidate_sha256','test_job_id','state','actual_receipt','revision','authority_or_refund_claim','reservation_anchor']);
  closed(g.reservation_anchor,['event_seq','store_transaction_id','reservation_id','producer_source_sha256']);closed(g.store,['root_sha256','company_identity_sha256','incarnation_sha256','physical_layout','lane']);
  referenceShape(g.producer_evidence_record);referenceShape(g.candidate);if(g.actual_receipt!==null)referenceShape(g.actual_receipt);
  need(g.protocol==='issue18-one-test-arm-guard-v1'&&value.kind==='artifact'&&value.author_role==='runner'&&value.status==='Recorded'&&value.content==='One original issue18 test reservation; no retry or authority.'&&Array.isArray(value.inputs)&&value.inputs.length===0,'GUARD_SHAPE');
  need(label(g.run_id)&&['1-files','1-patches','3-files','3-patches'].includes(g.arm_id)&&label(g.plan_id)&&label(g.test_job_id)&&hex(g.profile_sha256)&&hex(g.scope_sha256)&&hex(g.candidate_sha256),'GUARD_SHAPE');
  need(value.id==='issue18-test-'+digest([g.profile_sha256,g.run_id,g.arm_id])&&value.job_id===g.test_job_id&&value.author_instance===g.test_job_id&&value.revision===g.revision&&g.authority_or_refund_claim===false,'GUARD_SHAPE');
  need(g.state==='requested'?g.revision===1&&g.actual_receipt===null:['passed','failed_or_unknown'].includes(g.state)&&g.revision===2&&(g.state!=='passed'||g.actual_receipt!==null),'GUARD_SHAPE');
  const anchor=g.reservation_anchor;need(Number.isSafeInteger(anchor.event_seq)&&anchor.event_seq>=1&&label(anchor.store_transaction_id)&&label(anchor.reservation_id)&&hex(anchor.producer_source_sha256),'GUARD_SHAPE');
  need(g.store.root_sha256===hash(root)&&hex(g.store.company_identity_sha256)&&hex(g.store.incarnation_sha256)&&g.store.physical_layout==='normalized4'&&['original','unqualified_legacy'].includes(g.store.lane),'GUARD_SHAPE');
  need(typeof value.created_at==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.exec(value.created_at)?.[0]===value.created_at&&Number.isFinite(Date.parse(value.created_at)),'GUARD_SHAPE');
}
function snapshot(store,fn){return store.readSnapshot(()=>{const loan=originalStoreExecutionCustodyFrom(store);loan.assert();const result=fn(store.read(),loan);loan.assert();return result;});}
function record(state,reference){const value=state.records?.[reference?.id];need(value&&same(ref(value),reference),'RECORD_REFERENCE');return value;}
function immutable(store,reference){const row=store.db.prepare('SELECT bytes FROM immutable_values WHERE sha256=?').get(reference.sha256);need(typeof row?.bytes==='string'&&hash(row.bytes)===reference.sha256,'IMMUTABLE_REFERENCE');const value=JSON.parse(row.bytes);need(value.id===reference.id&&value.revision===reference.revision,'IMMUTABLE_REFERENCE');return value;}
function producerRecord(state,candidate){
  if(!candidate)return null;
  const list=Object.values(state?.records??{}).filter(value=>{const binding=value?.runtime_wire_evidence?.binding;return binding?.phase==='engineer'&&binding.job?.id===candidate.job_id;});
  if(!list.length)return null;need(list.length===1,'PRODUCER_CENSUS');inspectComparisonEvidenceRecordFrom(state,list[0]);return list[0];
}
function candidateJoin(state,candidate,plan){
  need(candidate&&plan?.development?.scope,'PLAN_OR_CANDIDATE');
  const d=candidate?.development,s=plan?.development?.scope,job=state.jobs?.[candidate?.job_id];
  need(d?.type==='candidate'&&candidate.status==='Submitted'&&d.plan_id===plan.id&&d.scope_sha256===plan.development.scope_sha256&&digest(s)===d.scope_sha256&&plan.development.authorization&&!plan.development.revoked&&Date.now()<Date.parse(s.expires_at),'PLAN_OR_CANDIDATE');
  need(job?.status==='completed'&&job.artifact_id===candidate.id&&job.role==='engineer'&&job.native_id&&candidate.author_instance===job.instance_id&&job.coordination_release?.termination_confirmed===true,'ACTUAL_PRODUCER');
  need(d.candidate_sha256===digest(d.files)&&Buffer.byteLength(JSON.stringify(d.files))<=s.max_bytes&&s.max_bytes===200000,'CANDIDATE_BYTES');
  need(s.timeout_ms===10000&&s.max_output_bytes===10000,'ORIGINAL_TEST_LIMITS');
  need(Array.isArray(s.test_paths)&&s.test_paths.length>0&&s.sources.filter(file=>!s.write_paths.includes(file.path)).every(file=>d.files.some(output=>output.path===file.path&&output.content===file.content)),'UNCHANGED_FIXTURES');
  return job;
}
function current(plan){
  const facts=inspectComparisonTestEntitlementFrom(plan.spend,plan.store);need(facts.run_id===plan.run_id&&facts.arm_id===plan.arm_id&&facts.db===plan.db&&facts.root===plan.root&&Date.now()<facts.deadlineAtMs,'TEST_SPEND_CURRENT');
  need(same(comparisonProducedEvidenceFrom(plan.run,plan.store,plan.producerJob),plan.evidence),'PRODUCER_EVIDENCE_CHANGED');return facts;
}
/** Fixed factory consumes once itself, before the actual arm reservation SQL.
 * There is intentionally no factory accepting a caller-supplied spend token. */
export function createComparisonTestPlanFrom(run,actualStore,arm_id,candidate_id){
  const subject=snapshot(actualStore,(state,loan)=>{const candidate=state.records[candidate_id],plan=state.records[candidate?.development?.plan_id];candidateJoin(state,candidate,plan);need(!candidate.development.run,'TEST_ALREADY_ATTEMPTED');return {candidate:ref(candidate),plan:ref(plan),producer:candidate.job_id,root:loan.root,expires:Date.parse(plan.development.scope.expires_at)};});
  const evidence=comparisonProducedEvidenceFrom(run,actualStore,subject.producer),engineerBoundArm=comparisonProducedArmFrom(run,actualStore,subject.producer);
  const spend=consumeComparisonTestEntitlementFrom(run,actualStore,{arm_id,engineerBoundArm,candidateRef:subject.candidate,planRef:subject.plan});
  // Consume the privately PREPAID escrow for both closed revisions and their
  // event/copy footprints. This never changes an immutable A header counter;
  // unused prepaid capacity stays spent on failure.
  chargeComparisonTestEvidenceFrom(run,actualStore,subject.producer,{header_bytes:2*32768,event_bytes:2*65536,pin_copy_bytes:0});
  const facts=inspectComparisonTestEntitlementFrom(spend,actualStore),handle=Object.freeze({}),p={run,store:actualStore,db:facts.db,root:facts.root,arm_id,run_id:facts.run_id,spend,candidate:subject.candidate,plan:subject.plan,producerJob:subject.producer,evidence,storeBinding:comparisonStoreBindingFrom(actualStore),claimed:false,staged:false,commit:null,recordId:null,source:source()};
  // Existing E3 worker/watchdog cutoffs already enforce this immutable scope.
  // A wider scope must Hold rather than launch beyond the selected run limit.
  need(Number.isSafeInteger(facts.deadlineAtMs)&&subject.expires<=facts.deadlineAtMs,'TEST_DEADLINE_SCOPE');
  need(!selected.has(key(p.root,candidate_id)),'TEST_ALREADY_SELECTED');plans.set(handle,p);selected.set(key(p.root,candidate_id),p);selectedRoots.add(p.root);current(p);return handle;
}
export function comparisonTestStoreFrom(handle,root,candidate_id){const p=plans.get(handle);need(p&&!p.claimed&&p.root===root&&p.candidate.id===candidate_id,'PLAN_CUSTODY');p.claimed=true;current(p);return p.store;}
export function comparisonTestGuardAppliesFrom(state,job_id){return Object.values(state?.records??{}).some(value=>guard(value)?.test_job_id===job_id);}
function stage(store,state,value,previous,plan=null){
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();need(loan.mode==='write'&&loan.state===state&&types.has(loan.type)&&!pendingWrites.has(loan.scope),'ACTUAL_TEST_WRITE');
  const row=loan.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM events').get();need(Number.isSafeInteger(row.seq)&&row.seq>=0,'EVENT_SEQUENCE');
  need(Buffer.byteLength(JSON.stringify(value))<=32768,'HEADER_CAPACITY');
  const pending={store,db:loan.db,root:loan.root,scope:loan.scope,type:loan.type,record:value,before:previous?digest(previous):null,after:digest(value),seq:row.seq+1,transaction:'issue18-test-write-'+randomUUID(),eventProduced:false,plan,lease:{committed:false}};
  pendingWrites.set(loan.scope,pending);pendingStores.set(store,pending);commitLeases.set(pending.after,pending.lease);state.records[value.id]=value;loan.assert();return pending;
}
export function stageComparisonTestReservationFrom(handle,store,state,job,candidate,plan){
  const evidence=producerRecord(state,candidate),p=plans.get(handle);
  if(!evidence&&!p&&!selected.has(key(store.root,candidate.id)))return;
  need(p&&p.store===store&&p.claimed&&!p.staged&&p.candidate.id===candidate.id&&p.plan.id===plan.id,'SELECTED_TEST_PLAN_REQUIRED');p.staged=true;current(p);
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();need(loan.type==='development.test_reserved'&&loan.state===state,'RESERVATION_WRITER');
  need(evidence&&same(ref(evidence),p.evidence)&&evidence.runtime_wire_evidence.state==='derived'&&evidence.runtime_wire_evidence.derived?.codec_outcome==='normalized','NORMALIZED_PRODUCER');
  candidateJoin(state,candidate,plan);need(job.kind==='development_test'&&job.development_id===plan.id&&job.candidate_id===candidate.id&&job.status==='queued'&&job.reuse_receipt_id===undefined,'ACTUAL_TEST_JOB');
  const id='issue18-test-'+digest([evidence.runtime_wire_evidence.binding.profile_sha256,p.run_id,p.arm_id]);
  need(!state.records[id]&&!Object.values(state.records).some(value=>guard(value)?.run_id===p.run_id&&guard(value).arm_id===p.arm_id),'ORIGINAL_RESERVATION_EXISTS');
  const count=loan.db.prepare("SELECT COUNT(*) AS n FROM events WHERE json_extract(value,'$.runtime_candidate_test_guard.run_id')=? AND json_extract(value,'$.runtime_candidate_test_guard.arm_id')=? AND json_extract(value,'$.runtime_candidate_test_guard.transition')='request'").get(p.run_id,p.arm_id);need(count.n===0,'ORIGINAL_RESERVATION_EXISTS');
  const seq=loan.db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS seq FROM events').get().seq,transaction='issue18-test-write-'+randomUUID();
  const anchor={event_seq:seq,store_transaction_id:transaction,reservation_id:'issue18-test-reservation-'+randomUUID(),producer_source_sha256:p.source};
  const value={id,kind:'artifact',author_role:'runner',author_instance:job.id,revision:1,status:'Recorded',created_at:new Date().toISOString(),content:'One original issue18 test reservation; no retry or authority.',job_id:job.id,inputs:[],runtime_candidate_test_guard:{protocol:'issue18-one-test-arm-guard-v1',profile_sha256:evidence.runtime_wire_evidence.binding.profile_sha256,run_id:p.run_id,arm_id:p.arm_id,store:p.storeBinding,plan_id:plan.id,scope_sha256:plan.development.scope_sha256,producer_evidence_record:p.evidence,candidate:p.candidate,candidate_sha256:candidate.development.candidate_sha256,test_job_id:job.id,state:'requested',actual_receipt:null,revision:1,authority_or_refund_claim:false,reservation_anchor:anchor}};
  const pending=stage(store,state,value,null,p);need(pending.seq===seq,'EVENT_SEQUENCE');pending.transaction=transaction;p.recordId=id;
}
export function beginComparisonTestWriteFrom(store,state){
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();need(loan.mode==='write'&&!baselines.has(loan.scope),'CLASS_WRITE_BASELINE');
  const records=Object.values(state?.records??{}),headers=records.filter(value=>value?.runtime_wire_evidence),guards=new Map(),candidates=new Set(),engineers=new Map();
  for(const value of records){if(guard(value))guards.set(value.id,digest(value));}
  for(const header of headers){const binding=header.runtime_wire_evidence.binding;if(binding?.phase==='engineer'){need(!engineers.has(binding.job.id),'PRODUCER_CENSUS');inspectComparisonEvidenceRecordFrom(state,header);engineers.set(binding.job.id,header.id);}}
  if(engineers.size)for(const value of records){if(value?.development?.type==='candidate'&&engineers.has(value.job_id))candidates.add(value.id);}
  const jobs=headers.length||guards.size||selectedRoots.has(loan.root)?new Map(Object.entries(state?.jobs??{}).map(([id,job])=>[id,{kind:job?.kind,candidate_id:job?.candidate_id}])):null;
  baselines.set(loan.scope,{store,db:loan.db,root:loan.root,guards,candidates,jobs,hasFamily:headers.length>0||guards.size>0});loan.assert();
}
export function prepareComparisonTestWriteFrom(store,next){
  const loan=originalStoreExecutionCustodyFrom(store);loan.assert();const before=baselines.get(loan.scope),pending=pendingWrites.get(loan.scope);
  need(before?.store===store&&before.db===loan.db&&before.root===loan.root,'CLASS_WRITE_BASELINE');
  const values=Object.values(next?.records??{}),nextGuards=values.filter(guard);
  if(!before.hasFamily&&!selectedRoots.has(loan.root)&&!nextGuards.length&&!values.some(value=>value?.runtime_wire_evidence))return;
  // Recovery/alternate reservation routes cannot create a second selected
  // candidate test merely by skipping queueRun's explicit private-plan hook.
  for(const [id,job]of Object.entries(next?.jobs??{})){
    const prior=before.jobs?.get(id);if(job?.kind!=='development_test'||prior?.kind==='development_test'&&prior.candidate_id===job.candidate_id)continue;
    if(!before.candidates.has(job.candidate_id)&&!selected.has(key(loan.root,job.candidate_id)))continue;
    need(pending&&pending.store===store&&pending.type==='development.test_reserved'&&guard(pending.record)?.test_job_id===id,'UNISSUED_TEST_RESERVATION');
  }
  for(const id of new Set([...before.guards.keys(),...nextGuards.map(value=>value.id)])){
    const previous=before.guards.get(id)??null,value=next?.records?.[id];if(value&&previous===digest(value))continue;
    need(value&&pending&&pending.store===store&&pending.record.id===id&&pending.after===digest(value)&&pending.before===previous,'UNISSUED_GUARD_WRITE');
  }
}
export function comparisonTestEventFrom(store,payload){
  const loan=originalStoreExecutionCustodyFrom(store),pending=pendingWrites.get(loan.scope);if(!pending)return payload;loan.assert();
  need(pending.store===store&&pending.type===loan.type&&!pending.eventProduced&&digest(loan.state.records[pending.record.id])===pending.after,'EVENT_SCOPE');pending.eventProduced=true;
  const g=guard(pending.record),proof={protocol:'issue18-one-test-producer-transition-v1',profile_sha256:g.profile_sha256,run_id:g.run_id,arm_id:g.arm_id,record_id:pending.record.id,before_record_sha256:pending.before,after_record_sha256:pending.after,candidate_sha256:g.candidate_sha256,test_job_id:g.test_job_id,scope_sha256:g.scope_sha256,transition:g.state==='requested'?'request':g.state==='passed'?'pass':'failed_or_unknown',actual_store_commit_id:pending.transaction,reservation_anchor:g.reservation_anchor};
  const result={...payload,existing_payload_without_test_guard_and_delta_seal_sha256:digest(payload),runtime_candidate_test_guard:proof};need(Buffer.byteLength(JSON.stringify(result))<=65536,'EVENT_CAPACITY');return result;
}
/** Must be called ONLY by the existing fixed Store-owned post-COMMIT path.
 * Transaction return, callback identity, event readback or DATA cannot replace
 * the genuine lexical Store witness inspected here. */
export function prepareComparisonTestCommitFrom(store,witness){
  const pending=pendingStores.get(store);if(!pending)return null;const actual=inspectRuntimeStoreCommitWitnessFrom(witness,store);
  if(actual.scope!==pending.scope){pendingStores.delete(store);return null;} // A rolled-back selection cannot poison unrelated later writes.
  need(actual.scope===pending.scope&&actual.root===pending.root&&pending.eventProduced&&store.db===pending.db,'COMMIT_CUSTODY');
  const event=pending.db.prepare('SELECT seq,at,type,value FROM events WHERE seq=?').get(pending.seq),eventProof=event&&JSON.parse(event.value).runtime_candidate_test_guard;
  need(event?.type===pending.type&&eventProof?.record_id===pending.record.id&&eventProof.after_record_sha256===pending.after&&eventProof.actual_store_commit_id===pending.transaction&&same(eventProof.reservation_anchor,guard(pending.record).reservation_anchor),'COMMITTED_EVENT');
  const row=pending.db.prepare("SELECT sha256 FROM state_entries WHERE family='records' AND key=?").get(pending.record.id);need(row?.sha256===pending.after,'COMMITTED_GUARD');
  const token=Object.freeze({}),g=guard(pending.record),data=freeze({protocol:'issue18-test-commit-witness-data-v1',store_incarnation_sha256:g.store.incarnation_sha256,record_id:pending.record.id,record_sha256:pending.after,event_seq:event.seq,event_sha256:hash(JSON.stringify([event.seq,event.at,event.type,event.value])),store_transaction_id:pending.transaction,reservation_id:g.reservation_anchor.reservation_id,producer_source_sha256:g.reservation_anchor.producer_source_sha256,authority_claim:false});
  const proof=pending.lease;Object.assign(proof,{store,db:pending.db,scope:pending.scope,data});witnesses.set(token,proof);if(pending.plan)pending.plan.commit=token;
  const prepared=Object.freeze({});finalizations.set(prepared,{proof,finalized:false});pendingStores.delete(store);return prepared;
}
// Fixed E3 finalizer only: every check/allocation/registration happened above.
// A later failure before this call leaves all prepared registrations unusable.
export function finalizeComparisonTestCommitFrom(prepared){const finalization=finalizations.get(prepared);if(finalization){finalization.proof.committed=true;finalization.finalized=true;}}
export function assertComparisonTestCommittedFrom(handle,store){const p=plans.get(handle);need(p&&p.store===store,'PLAN_CUSTODY');current(p);const proof=witnesses.get(p.commit);need(proof?.committed===true&&proof.store===store&&proof.db===p.db&&proof.data.record_id===p.recordId,'ACTUAL_RESERVATION_COMMIT_REQUIRED');return proof.data;}

function originalCandidate(store,state,g){const original=immutable(store,g.candidate),candidate=state.records[g.candidate.id],plan=state.records[g.plan_id];candidateJoin(state,candidate,plan);const before=copy(original),after=copy(candidate);delete before.development.run;delete after.development.run;need(same(before,after)&&original.development?.candidate_sha256===g.candidate_sha256&&candidate.development.candidate_sha256===g.candidate_sha256&&same(original.development.files,candidate.development.files),'CANDIDATE_CHANGED');return {candidate,plan,producer:state.jobs[candidate.job_id]};}
function passed(store,state,value,receipt){
  const g=guard(value),{candidate,plan,producer}=originalCandidate(store,state,g),job=state.jobs[g.test_job_id],d=receipt?.development;
  need(receipt?.kind==='artifact'&&receipt.author_role==='runtime'&&job?.kind==='development_test'&&job.status==='completed'&&job.artifact_id===receipt.id&&job.reuse_receipt_id===undefined&&receipt.author_instance===job.id&&receipt.status==='Submitted'&&d?.type==='test'&&d.reused_from===undefined&&d.result?.reused===undefined,'ACTUAL_NONREUSED_RECEIPT');
  need(validTestExecution(state,receipt)&&d.result.status==='passed'&&d.result.exit_code===0&&d.result.tests_executed===true&&!d.result.error&&!d.result.output_truncated&&d.result.signal==null&&d.receipt_sha256===digest(d.result),'TEST_NOT_PASSED');
  need(job.candidate_id===candidate.id&&job.development_id===plan.id&&d.candidate_id===candidate.id&&d.plan_id===plan.id&&d.candidate_sha256===g.candidate_sha256&&candidate.development.run?.job_id===job.id&&candidate.development.run.status==='completed'&&candidate.development.run.receipt_id===receipt.id,'TEST_JOIN');
  return {candidate,plan,producer,job};
}
export function stageComparisonTestTerminalFrom(terminal,store,state){
  const facts=inspectComparisonDevelopmentTestTerminalFrom(terminal,store,state),list=Object.values(state.records??{}).filter(value=>guard(value)?.test_job_id===facts.job_id);if(!list.length)return;
  need(list.length===1,'GUARD_CENSUS');const previous=list[0],g=guard(previous);inspectComparisonTestRecordFrom(state,previous);need(previous.revision===1&&g.state==='requested','TERMINAL_SPENT');
  const next=copy(previous);next.revision=2;next.runtime_candidate_test_guard.revision=2;next.runtime_candidate_test_guard.actual_receipt=facts.receipt?ref(facts.receipt):null;
  let success=false;if(facts.receipt){try{passed(store,state,previous,facts.receipt);success=true;}catch{/* Retain actual failed/unknown outcome, never invent a Pass. */}}
  next.runtime_candidate_test_guard.state=success?'passed':'failed_or_unknown';stage(store,state,next,previous);
}
export function validateStoredComparisonTestFrom(subject,state,value){
  const loan=originalStoreExecutionCustodyFrom(subject),store=loan.store;loan.assert();guardShape(value,loan.root);const g=guard(value),valueSha=digest(value),pending=pendingWrites.get(loan.scope);
  const isPending=pending?.store===store&&pending.scope===loan.scope&&pending.record.id===value.id&&pending.after===valueSha&&loan.mode==='write';
  const all=loan.db.prepare("SELECT seq,at,type,value FROM events WHERE json_extract(value,'$.runtime_candidate_test_guard.record_id')=? ORDER BY seq").all(value.id);
  need(all.length<=2&&(isPending?all.length===value.revision-1:all.length>=value.revision),'GUARD_HISTORY');let previous=null;const history=[];
  for(let index=0;index<value.revision;index++){
    let historical;
    if(isPending&&index===value.revision-1){need(previous===pending.before&&(value.revision===1?pending.seq===g.reservation_anchor.event_seq&&pending.type==='development.test_reserved'&&pending.transaction===g.reservation_anchor.store_transaction_id:pending.seq>g.reservation_anchor.event_seq&&types.has(pending.type)&&pending.type!=='development.test_reserved'),'GUARD_HISTORY');historical=value;}
    else{
      const event=all[index],p=JSON.parse(event.value).runtime_candidate_test_guard;
      closed(p,['protocol','profile_sha256','run_id','arm_id','record_id','before_record_sha256','after_record_sha256','candidate_sha256','test_job_id','scope_sha256','transition','actual_store_commit_id','reservation_anchor']);
      need(types.has(event.type)&&p.protocol==='issue18-one-test-producer-transition-v1'&&p.profile_sha256===g.profile_sha256&&p.run_id===g.run_id&&p.arm_id===g.arm_id&&p.record_id===value.id&&p.before_record_sha256===previous&&p.test_job_id===value.job_id&&p.candidate_sha256===g.candidate_sha256&&p.scope_sha256===g.scope_sha256&&same(p.reservation_anchor,g.reservation_anchor),'GUARD_HISTORY');
      need(hex(p.after_record_sha256)&&label(p.actual_store_commit_id),'GUARD_HISTORY');historical=immutable(store,{id:value.id,revision:index+1,sha256:p.after_record_sha256});
      need(index===0?event.type==='development.test_reserved'&&p.transition==='request'&&event.seq===g.reservation_anchor.event_seq&&p.actual_store_commit_id===g.reservation_anchor.store_transaction_id:event.type!=='development.test_reserved'&&p.transition===(guard(historical).state==='passed'?'pass':'failed_or_unknown'),'GUARD_TRANSITION');
    }
    guardShape(historical,loan.root);const stable=copy(historical);stable.revision=value.revision;stable.runtime_candidate_test_guard.revision=g.revision;stable.runtime_candidate_test_guard.state=g.state;stable.runtime_candidate_test_guard.actual_receipt=copy(g.actual_receipt);need(digest(stable)===valueSha,'GUARD_IMMUTABLE');previous=digest(historical);history.push({...ref(historical),bytes:Buffer.byteLength(JSON.stringify(historical))});
  }
  need(previous===valueSha,'GUARD_CURRENT');const references=[g.candidate,g.producer_evidence_record,...(g.actual_receipt?[g.actual_receipt]:[])];
  const resolve=reference=>{if(isPending&&state.records?.[reference.id]&&same(ref(state.records[reference.id]),reference))return state.records[reference.id];return immutable(store,reference);};
  const candidate=resolve(g.candidate),evidence=resolve(g.producer_evidence_record),binding=evidence.runtime_wire_evidence?.binding;
  need(candidate.development?.type==='candidate'&&candidate.development.plan_id===g.plan_id&&candidate.development.scope_sha256===g.scope_sha256&&candidate.development.candidate_sha256===g.candidate_sha256&&digest(candidate.development.files)===g.candidate_sha256,'GUARD_CANDIDATE_REFERENCE');
  need(evidence.runtime_wire_evidence?.state==='derived'&&binding?.phase==='engineer'&&binding.job?.id===candidate.job_id&&binding.run_id===g.run_id&&binding.arm_id===g.arm_id&&binding.profile_sha256===g.profile_sha256&&binding.plan?.id===g.plan_id&&binding.plan.scope_sha256===g.scope_sha256,'GUARD_EVIDENCE_REFERENCE');
  const planRef={id:binding.plan.id,revision:binding.plan.revision,sha256:binding.plan.record_sha256};referenceShape(planRef);const plan=resolve(planRef);need(plan.development?.scope_sha256===g.scope_sha256&&digest(plan.development.scope)===g.scope_sha256,'GUARD_PLAN_REFERENCE');references.push(planRef);
  if(g.actual_receipt){const receipt=resolve(g.actual_receipt),d=receipt.development;need(receipt.author_instance===g.test_job_id&&d?.type==='test'&&d.plan_id===g.plan_id&&d.candidate_id===g.candidate.id&&d.candidate_sha256===g.candidate_sha256&&(g.state!=='passed'||d.reused_from===undefined&&d.result?.reused===undefined),'GUARD_RECEIPT_REFERENCE');}
  loan.assert();return freeze({recordSha:valueSha,job_id:value.job_id,references:copy(references),history});
}
export function bindComparisonTestBookkeepingFrom(store,state){
  const values=Object.values(state?.records??{}).filter(guard);if(!values.length)return;let loan;try{loan=originalStoreExecutionCustodyFrom(store);}catch{return;}loan.assert();const bound=new Map();
  for(const value of values){const valid=validateStoredComparisonTestFrom(store,state,value);bound.set(value.id,{recordSha:valid.recordSha,job_id:valid.job_id});}
  const value={store,db:loan.db,root:loan.root,scope:loan.scope,bound};proofs.set(state,value);proofs.set(state.records,value);
}
export function inspectComparisonTestRecordFrom(state,value){if(!guard(value))return null;const binding=proofs.get(state)??proofs.get(state?.records),proof=binding?.bound.get(value.id);need(proof&&proof.recordSha===digest(value),'GUARD_CUSTODY');need(!commitLeases.has(proof.recordSha)||commitLeases.get(proof.recordSha).committed,'UNFINALIZED_COMMIT');return freeze({...proof});}
export function comparisonTestPrerequisiteFrom(store,state,guard_ref,receipt_ref){
  const loan=originalStoreExecutionCustodyFrom(store),binding=proofs.get(state)??proofs.get(state?.records);loan.assert();need(binding?.store===store&&binding.db===loan.db&&binding.scope===loan.scope,'GUARD_STORE_CUSTODY');
  const value=record(state,guard_ref);inspectComparisonTestRecordFrom(state,value);const g=guard(value);need(g?.state==='passed'&&value.revision===2&&same(g.actual_receipt,receipt_ref),'PASSED_GUARD_REQUIRED');
  const receipt=record(state,receipt_ref),joined=passed(store,state,value,receipt),evidence=record(state,g.producer_evidence_record);inspectComparisonEvidenceRecordFrom(state,evidence);
  need(evidence.runtime_wire_evidence.binding.job.id===joined.producer.id&&evidence.runtime_wire_evidence.binding.run_id===g.run_id&&evidence.runtime_wire_evidence.binding.arm_id===g.arm_id,'PRODUCER_EVIDENCE_JOIN');
  return freeze({guard:copy(g),guard_ref:ref(value),actual_receipt:copy(receipt),actual_receipt_ref:ref(receipt),candidate_ref:ref(joined.candidate),candidate_sha256:g.candidate_sha256,test_job_id:g.test_job_id,plan_id:g.plan_id,scope_sha256:g.scope_sha256,producer_evidence_record:g.producer_evidence_record,producer_job_id:joined.producer.id,producer_invocation_id:evidence.runtime_wire_evidence.binding.invocation_id,producer_native_id:joined.producer.native_id,run_id:g.run_id,arm_id:g.arm_id,profile_sha256:g.profile_sha256});
}
export function assertComparisonAcceptanceFrom(subject,state,candidate_id,qa_record_id){
  const loan=originalStoreExecutionCustodyFrom(subject),store=loan.store;loan.assert();
  const candidate=state.records?.[candidate_id];if(!candidate)return;const evidence=producerRecord(state,candidate);if(!evidence)return;
  const p=selected.get(key(store.root,candidate_id));need(p,'LIVE_TEST_PLAN_REQUIRED');current(p);const value=state.records[p.recordId],qa=state.records[qa_record_id],receipt=state.records[qa?.review_of?.id];
  need(value&&qa&&receipt,'ACCEPTANCE_SUBJECT');assertComparisonEvidenceAcceptanceFrom(store,state,candidate_id,qa_record_id);
  inspectComparisonTestRecordFrom(state,value);const g=guard(value);need(g.state==='passed'&&value.revision===2&&g.actual_receipt?.id===receipt.id,'PASSED_GUARD_REQUIRED');
  if(!same(ref(receipt),g.actual_receipt)){
    // Existing owner acceptance annotates this same revision1 runtime receipt.
    // Permit only that exact annotation in this fixed acceptance hook, while
    // preserving the original immutable test proof used for QA admission.
    immutable(store,g.actual_receipt);const original=copy(receipt);delete original.development.acceptance;
    need(same(ref(original),g.actual_receipt)&&receipt.development.acceptance?.review_id===qa.id&&receipt.development.acceptance.candidate_sha256===g.candidate_sha256&&receipt.development.acceptance.receipt_sha256===receipt.development.receipt_sha256,'ACCEPTANCE_ANNOTATION');
  }
  passed(store,state,value,receipt);
  const qaEvidence=comparisonProducedEvidenceFrom(p.run,p.store,qa.job_id);need(qaEvidence&&qa.author_instance!==candidate.author_instance&&state.jobs[qa.job_id]?.native_id!==state.jobs[candidate.job_id]?.native_id,'INDEPENDENT_QA_PIN');
}
