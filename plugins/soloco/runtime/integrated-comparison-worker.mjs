// Explicit same-process qualification only. Ordinary work() does not select a
// comparison, initialize storage, read a helper or change the selected model.
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {originalStoreExecutionCustodyFrom} from './store.mjs';
import {inspectComparisonWorkerPromptFrom} from './worker.mjs';
import {prepareFullFileInput,normalizePreparedFullFileResult} from './development-full-file-output.mjs';
import {runRuntimeModelWithOutcome,consumeRuntimeModelOutcome} from './adapters.mjs';
import {inspectSelectedComparisonRun,comparisonStoreBindingFrom,reserveSelectedCallSlot,consumeCommittedSelectedCallSlotAdmission,assertInFlightArmAdmission,bindCommittedArmFrom,assertBoundComparisonArmFrom} from './qualification/issue18/integrated-comparison-issuer.mjs';
import {capturePrompt,captureBytes,callPolicyHash,captureBinding} from './qualification/issue18/typed-capture.mjs';
import {DATA_CONTRACT,validateBindingSerialization} from './qualification/issue18/integrated-comparison-data.mjs';
import {createComparisonEvidenceStorageFrom,publishComparisonEvidenceBlob,closeComparisonEvidenceStorage} from './qualification/issue18/integrated-comparison-evidence-io.mjs';
import {preflightComparisonEvidenceMetadataFrom,prepayComparisonEvidenceMetadataFrom,prepareComparisonEvidenceFrom,stageComparisonRequestFrom,stageComparisonObservationFrom,sealComparisonEvidenceFrom,retainComparisonOutcomeFrom,retainComparisonDerivedFrom,assertComparisonEvidenceCurrentFrom,assertComparisonEvidenceOutcomeEligibleFrom,comparisonEvidenceProcessClosedFrom} from './integrated-comparison-evidence.mjs';

const plans=new WeakMap(),calls=new WeakMap();
const hash=text=>createHash('sha256').update(text).digest('hex');
const digest=value=>hash(JSON.stringify(value));
const copy=value=>JSON.parse(JSON.stringify(value));
const need=(ok,code)=>{if(!ok)throw Object.assign(Error('Issue18 worker Hold: '+code),{code:'ISSUE18_WORKER_'+code});};
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const reference=record=>({id:record.id,revision:record.revision,sha256:digest(record)});
const arms=['1-files','1-patches','3-files','3-patches'];
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get;
function snapshot(store,fn){return store.readSnapshot(()=>{const loan=originalStoreExecutionCustodyFrom(store);loan.assert();const value=fn(store.read(),loan);loan.assert();return value;});}

/** The run and actual Store are live private capabilities. DTOs/cold archives
 * cannot recreate either. All four distinct arms must already be enrolled. */
export function createComparisonWorkerPlanFrom(run,actualStore,arm_id,job_id,phase_prerequisite=null){
  inspectSelectedComparisonRun(run);need(arms.includes(arm_id)&&typeof job_id==='string','PLAN');
  need(comparisonStoreBindingFrom(actualStore).physical_layout==='normalized4','NORMALIZED_COMPARISON_STORE_REQUIRED');
  const root=snapshot(actualStore,(state,loan)=>{need(state.jobs?.[job_id]&&['queued','running'].includes(state.jobs[job_id].status),'JOB');return loan.root;});
  const plan=Object.freeze({});plans.set(plan,{run,store:actualStore,arm_id,job_id,root,phasePrerequisite:phase_prerequisite===null?null:freeze(copy(phase_prerequisite)),claimed:false,prepared:false});return plan;
}
export function comparisonWorkerStoreFrom(plan,root,jobId){
  const p=plans.get(plan);need(p&&!p.claimed&&p.job_id===jobId&&p.root===fs.realpathSync(root),'PLAN_CUSTODY');
  inspectSelectedComparisonRun(p.run);snapshot(p.store,(_state,loan)=>need(loan.root===p.root,'STORE'));p.claimed=true;return p.store;
}
function active(handle){const c=calls.get(handle);need(c&&!c.closed,'CALL_CUSTODY');return c;}
function fresh(c){
  need(Date.now()<c.binding.call_policy.absolute_deadline_ms&&!Reflect.apply(aborted,c.signal,[]),'DEADLINE_OR_CANCEL');
  inspectSelectedComparisonRun(c.plan.run);
}

/** Called with a lexical worker prompt loan BEFORE accounting or arm SQL. The
 * worker's private inspector, not a supplied prompt/binding object, is trusted. */
export function prepareComparisonWorkerCallFrom(plan,promptLoan){
  const p=plans.get(plan);need(p&&p.claimed&&!p.prepared,'PLAN_SPENT');p.prepared=true;
  const actual=inspectComparisonWorkerPromptFrom(promptLoan,p.store);
  need(actual.job_id===p.job_id&&actual.root===p.root&&actual.round===0&&actual.native_id===null,'SINGLE_FRESH_CALL');
  const run=inspectSelectedComparisonRun(p.run),manifest=run.run_manifest;
  const subject=snapshot(p.store,(state,loan)=>{
    const job=state.jobs[p.job_id],target=state.records[job?.review_of?.id],planRecord=state.records[job?.development_id??target?.development?.plan_id],scope=planRecord?.development?.scope;
    need(job&&job.status==='running'&&job.worker_pid===process.pid&&job.host==='codex'&&['engineer','qa'].includes(job.role)&&job.timeout_ms===300000,'JOB_POLICY');
    need(!job.model_process_tracking?.invocations?.length&&Buffer.byteLength(JSON.stringify(job))<=16384,'FRESH_BOUNDED_REQUEST_JOB');
    need(!job.prototype_id&&!job.retention_repair_id&&!job.specialist&&!actual.stream&&!actual.qualification&&!actual.continuation&&!actual.supplemental,'UNSUPPORTED_MODE');
    need(scope&&scope.max_bytes===200000&&planRecord.development.authorization&&Date.now()<Date.parse(scope.expires_at),'PLAN_AUTHORITY');
    const selection=job.model_selection;need(selection?.mode==='explicit'&&selection.model==='gpt-6.1-sol'&&selection.effort===(job.role==='engineer'?'medium':'high')&&selection.speed==='host_default','UNSELECTED_MODEL');
    return {job:copy(job),plan:copy(planRecord),scope:copy(scope),root:loan.root};
  });
  const {job,scope,plan:planRecord}=subject;
  const encoded=job.role==='engineer'&&p.arm_id.endsWith('files');
  const prepared=encoded?prepareFullFileInput({canonical_prompt:actual.prompt,binding:{job_id:job.id,instance_id:job.instance_id,plan_id:planRecord.id,scope_sha256:planRecord.development.scope_sha256,write_paths:scope.write_paths,max_bytes:scope.max_bytes},limits:{wire_bytes:200000}}):null;
  const prompt=prepared?.actual_prompt??actual.prompt;
  const canonical=capturePrompt(actual.prompt),encoding=prepared?capturePrompt(prepared.encoding_instruction):null,wire=capturePrompt(prompt);
  const planText=JSON.stringify(planRecord),planBlob=captureBytes(Buffer.from(planText),'closed-json-utf8-v1');
  const reviewRecord=job.review_of?snapshot(p.store,state=>copy(state.records[job.review_of.id])):null;
  const reviewText=reviewRecord?JSON.stringify(reviewRecord):null,reviewBlob=reviewText===null?null:captureBytes(Buffer.from(reviewText),'closed-json-utf8-v1');
  const now=Date.now(),deadline=Math.min(now+actual.timeout_ms,Date.parse(scope.expires_at),actual.overall_deadline_at??Infinity,Date.parse(manifest.expires_at));
  const timeout=Math.min(actual.timeout_ms,deadline-now);
  need(Number.isSafeInteger(timeout)&&timeout>=1000&&timeout<=300000&&Number.isSafeInteger(deadline),'TIMEOUT');
  const outputUnits=encoded?200000:actual.max_output_characters;need(Number.isSafeInteger(outputUnits)&&outputUnits>0&&outputUnits<=2000000,'OUTPUT_LIMIT');
  // Reserve all possible new header/event histories and temporary+published
  // blob charges before consuming B. Identity normalization reuses raw UTF16.
  const policy={configured_timeout_ms:300000,call_timeout_ms:timeout,absolute_deadline_ms:deadline,authority_expiry_ms:Date.parse(scope.expires_at),overall_deadline_ms:actual.overall_deadline_at,max_output_utf16_units:outputUnits,evidence_ceiling_bytes:10000000,cancellation_binding_id:'issue18-cancel-'+randomUUID()};
  policy.policy_sha256=callPolicyHash(JSON.stringify(policy));
  const binding={protocol:'issue18-call-binding-v1',profile_id:DATA_CONTRACT.profile_id,profile_sha256:DATA_CONTRACT.profile_sha256,run_id:manifest.run_id,arm_id:p.arm_id,phase:job.role,
    store:comparisonStoreBindingFrom(p.store),job:{id:job.id,instance_id:job.instance_id,worker_pid:job.worker_pid,owner_epoch:job.epoch,preimage_sha256:digest(job),context_sha256:job.context_sha256,role:job.role,development_id:job.development_id??null,review_of:job.review_of?reference(snapshot(p.store,state=>state.records[job.review_of.id])):null,prototype_id:null,retention_repair_id:null,stream_mode:false,continuation_mode:false},
    plan:{id:planRecord.id,revision:planRecord.revision,record_sha256:digest(planRecord),scope_sha256:planRecord.development.scope_sha256,authorization_sha256:digest(planRecord.development.authorization),source_corpus_sha256:digest(scope.sources),write_paths:scope.write_paths,output_format:scope.output_format,max_bytes:scope.max_bytes,expires_at:scope.expires_at},
    invocation_id:actual.invocation_id,source:manifest.source,model:{host:job.host,native_id_requested:null,selection:job.model_selection,selection_sha256:digest(job.model_selection),cwd_sha256:hash(actual.cwd)},call_policy:policy,codec_mode:encoded?'full_file_chunks_v1':'identity',canonical_prompt_sha256:canonical.blob.ref.sha256,encoding_instruction_sha256:encoding?.blob.ref.sha256??null,actual_prompt_sha256:wire.blob.ref.sha256,fixture_sha256:digest(scope.sources.filter(file=>scope.test_paths.includes(file.path)))};
  const text=JSON.stringify(binding),serialization={encoding:'exact-shared-call-binding-utf8-v1',text,utf8_bytes:Buffer.byteLength(text),sha256:hash(text)};
  validateBindingSerialization(serialization);const capturedBinding=captureBinding(text);
  const metadata=preflightComparisonEvidenceMetadataFrom(p.store,{job_id:job.id,phase:job.role});
  const uniqueInputs=new Map([[canonical,encoding,wire].filter(Boolean).map(x=>x.blob),[planBlob,reviewBlob,capturedBinding.blob].filter(Boolean)].flat().map(blob=>[blob.ref.sha256,blob.ref.bytes]));
  const reserve=2*[...uniqueInputs.values()].reduce((n,b)=>n+b,0)+4*outputUnits+(encoded?800000:0)+2*3*32768+metadata.total_bytes+4096+32768;
  need(Number.isSafeInteger(reserve)&&reserve<=9975424&&reserve+24576<=10000000,'EVIDENCE_PREFLIGHT');
  const io=createComparisonEvidenceStorageFrom(p.run,p.store,{arm_id:p.arm_id,phase:job.role,deadline_at_ms:Date.parse(manifest.expires_at),capacity_reserved_bytes:9975424});
  try{
  for(const capture of [canonical,encoding,wire].filter(Boolean))publishComparisonEvidenceBlob(io,capture.blob);
  for(const blob of [planBlob,reviewBlob].filter(Boolean))publishComparisonEvidenceBlob(io,blob);
  publishComparisonEvidenceBlob(io,capturedBinding.blob);
  const metadataPrepayment=prepayComparisonEvidenceMetadataFrom(p.store,io,{job_id:job.id,phase:job.role});
  const slot={protocol:'issue18-eight-slot-consumption-v2',schema_version:2,record_kind:'consumption_record',run_manifest_sha256:run.run_manifest_sha256,ledger_identity_sha256:manifest.ledger_identity_sha256,slot_commit_id:'issue18-slot-'+randomUUID(),prepared_at:new Date().toISOString(),binding,binding_sha256:serialization.sha256,phase_prerequisite:p.phasePrerequisite,cold_read_authorizes:false,binding_serialization:serialization,request_prompts:{canonical:canonical.prompt_ref,encoding_instruction:encoding?.prompt_ref??null,actual:wire.prompt_ref}};
  const reserved=reserveSelectedCallSlot(p.run,slot);
  const admitted=consumeCommittedSelectedCallSlotAdmission(reserved.admission,{actualStore:p.store,callBinding:binding,actualPrompt:prompt});
  const evidence=prepareComparisonEvidenceFrom(p.store,p.run,binding,{canonical,encoding_instruction:encoding,actual:wire},io,{binding_blob:capturedBinding.blob,requested_at:actual.requested_at,metadata_prepayment:metadataPrepayment,related_records:[{ref:reference(planRecord),text:planText,blob:planBlob},...(reviewRecord?[{ref:reference(reviewRecord),text:reviewText,blob:reviewBlob}]:[])]});
  const handle=Object.freeze({});calls.set(handle,{plan:p,binding:freeze(binding),prepared,prompt,io,evidence,armAdmission:admitted.armAdmission,slotCommit:admitted.slot_commit,signal:actual.signal,cwd:actual.cwd,timeoutReason:actual.timeout_reason,launch:null,bound:null,invoked:false,closed:false});
  return Object.freeze({call:handle,prompt,timeout_ms:timeout,absolute_deadline_ms:deadline,max_output_characters:outputUnits});
  }catch(error){try{closeComparisonEvidenceStorage(io);}catch{/* failed cleanup never replaces the original failure; files/charges remain spent */}throw error;}
}
export function stageComparisonWorkerRequestFrom(call,state){const c=active(call);fresh(c);stageComparisonRequestFrom(c.evidence,state,c.slotCommit);}
export function stageComparisonWorkerObservationFrom(call,store,state,kind){const c=active(call);stageComparisonObservationFrom(c.evidence,store,state,kind);}
export function guardComparisonWorkerRequestFrom(call,state){const c=active(call);fresh(c);assertInFlightArmAdmission(c.armAdmission,{actualStore:c.plan.store,currentState:state,callBinding:c.binding});}
export function bindComparisonWorkerRequestFrom(call,launch){
  const c=active(call);need(c.launch===null,'BIND_SPENT');c.launch=launch;fresh(c);
  const committed=bindCommittedArmFrom(c.armAdmission,launch);c.bound=committed.boundArm;
  sealComparisonEvidenceFrom(c.evidence,launch,c.bound,committed.arm_commit);
}
export async function invokeComparisonWorkerCallFrom(call,options){
  const c=active(call);need(c.bound&&!c.invoked,'INVOKE_SPENT');c.invoked=true;fresh(c);assertBoundComparisonArmFrom(c.bound,c.launch);
  const launchOptions={...options,maxOutputCharacters:c.binding.call_policy.max_output_utf16_units,executionDeadlineAt:c.binding.call_policy.absolute_deadline_ms,timeoutReason:c.timeoutReason};
  // Fixed facade exactly once. There is deliberately no caller invoke/recorder.
  const invocation=runRuntimeModelWithOutcome(c.plan.store,c.binding.model.host,null,c.prompt,c.cwd,c.binding.call_policy.call_timeout_ms,c.binding.model.selection,launchOptions);
  let settlement,threw=false;
  try{settlement=await invocation.completion;}catch(error){settlement=error;threw=true;}
  let outcome;
  try{outcome=consumeRuntimeModelOutcome(invocation.call,settlement);need(outcome.kind===(threw?'threw':'returned'),'OUTCOME_KIND');}
  catch(error){c.captureFailure=error;if(threw)throw settlement;throw error;}
  // Always retain factual captured bytes/error first, even when currentness or
  // physical closure later disqualifies acceptance. Never inspect opaque throws.
  let retentionFailure,retentionFailed=false;
  try{retainComparisonOutcomeFrom(c.evidence,outcome);}catch(error){retentionFailure=error;retentionFailed=true;}
  if(threw)throw settlement;
  if(retentionFailed)throw retentionFailure;
  assertComparisonEvidenceOutcomeEligibleFrom(c.evidence);fresh(c);assertBoundComparisonArmFrom(c.bound,c.launch);assertComparisonEvidenceCurrentFrom(c.evidence);
  need(typeof outcome.text==='string'&&typeof outcome.native_id==='string'&&outcome.native_id.length>0,'OUTCOME_TEXT_IDENTITY');
  let normalized=null,text=outcome.text;
  if(c.prepared){normalized=normalizePreparedFullFileResult(c.prepared,outcome.text);text=JSON.stringify(normalized.artifact);}
  retainComparisonDerivedFrom(c.evidence,{original_text:outcome.text,normalized_text:text,normalization:normalized});
  assertComparisonEvidenceCurrentFrom(c.evidence);fresh(c);assertBoundComparisonArmFrom(c.bound,c.launch);
  return Object.freeze({text,native_id:outcome.native_id,model_evidence:outcome.model_evidence});
}
export function assertComparisonWorkerPublicationFrom(call){const c=active(call);fresh(c);assertComparisonEvidenceCurrentFrom(c.evidence);}
export function comparisonWorkerProcessClosedFrom(call,birth,receipt){const c=active(call);return comparisonEvidenceProcessClosedFrom(c.evidence,birth,receipt);}
// Evidence and its pin live until explicit run close, including test/QA and the
// actual owner acceptance path. Ending this adapter call does not release them.
export function closeComparisonWorkerCall(call){const c=active(call);c.closed=true;}
