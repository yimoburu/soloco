// Runtime-owned local acceptance evidence and attributed handoff observations.
// Declared contacts and operator reports grant no external execution authority.
import {digest,owner,stamp,VERSION,withStore} from './store.mjs';
import {retainSnapshot,resolveSnapshot,snapshotReference} from './snapshot.mjs';
import {validModelProcessTracking} from './model-process-closure.mjs';
import {validateRecordReadDelivery} from './record-read-delivery.mjs';
import {fits,sourceReference,storageSourceId} from './public-response.mjs';

export const DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL='development-delivery-contract-v1';
export const DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL='development-acceptance-report-v1';
export const DEVELOPMENT_DELIVERY_PROGRESS_PROTOCOL='development-delivery-progress-v1';
export const DEVELOPMENT_DELIVERY_ACTIONS=Object.freeze(['acceptance_report','delivery_inspect','delivery_transition']);
const hash=value=>digest(JSON.stringify(value)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,keys)=>plain(value)&&same(Object.keys(value).sort(),[...keys].sort());
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const need=(condition,message)=>{if(!condition)throw Error('Development delivery: '+message);};
const copy=value=>JSON.parse(JSON.stringify(value));
function text(value,label,max=1000){need(typeof value==='string'&&value.trim().length>0&&value.length<=max&&!value.includes('\0'),label+' must be bounded explicit text');return value;}
const scalarText={type:'string',minLength:1,maxLength:200};
const contactSchema={type:'object',properties:{host:{enum:['codex','claude']},session_id:scalarText,name:{type:'string',minLength:1,maxLength:120}},required:['host','session_id','name'],additionalProperties:false};
const refSchema={type:'object',properties:{id:scalarText,revision:{anyOf:[{type:'integer',minimum:1},{type:'null'}]},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}},required:['id','revision','sha256'],additionalProperties:false};
export const developmentDeliveryContractSchema={type:'object',properties:{
  protocol:{const:DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL},
  interfaces:{type:'array',maxItems:32,items:{type:'object',properties:{id:scalarText,description:{type:'string',minLength:1,maxLength:10000},paths:{type:'array',minItems:1,maxItems:32,items:scalarText}},required:['id','description','paths'],additionalProperties:false}},
  dependency_refs:{type:'array',maxItems:32,items:refSchema},required_test_roots:{type:'array',minItems:1,maxItems:32,items:scalarText},
  integrator:contactSchema,observer:contactSchema,installer:contactSchema,
},required:['protocol','interfaces','dependency_refs','required_test_roots','integrator','observer','installer'],additionalProperties:false};
export const developmentDeliveryTransitionFields={
  report_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},expected_handoff_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},transition_id:scalarText,
  to_stage:{enum:['integrator','installer']},reported_outcome:{enum:['completed','unknown','failed']},evidence_refs:{type:'array',maxItems:32,items:refSchema},
};

function contact(value){need(exact(value,['host','session_id','name'])&&['codex','claude'].includes(value.host),'invalid declared session contact');text(value.session_id,'contact session',200);text(value.name,'contact name',120);return copy(value);}
function references(values,label){
  need(Array.isArray(values)&&values.length<=32,label+' must contain at most 32 exact references');const ids=new Set();
  for(const r of values){need(exact(r,['id','revision','sha256'])&&hex(r.sha256)&&(r.revision===null||Number.isSafeInteger(r.revision)&&r.revision>0),'invalid '+label+' reference');text(r.id,label+' id',200);need(!ids.has(r.id),'duplicate '+label+' id');ids.add(r.id);}
  return values;
}
function recordReference(value){return {id:value.id,revision:value.revision??null,revision_present:Object.hasOwn(value,'revision'),sha256:hash(value)};}
function dependency(s,ref){const value=s.records[ref.id];need(value&&value.id===ref.id&&(value.revision??null)===ref.revision&&hash(value)===ref.sha256,'missing or changed dependency/evidence: '+ref.id);return value;}
function paths(values,all,label){need(Array.isArray(values)&&values.length>0&&values.length<=32&&values.every(p=>typeof p==='string'&&all.includes(p))&&new Set(values).size===values.length,label+' must be unique complete scoped paths');return [...values].sort();}
function declaration(s,scope,input){
  need(exact(input,['protocol','interfaces','dependency_refs','required_test_roots','integrator','observer','installer'])&&input.protocol===DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL,'invalid complete delivery contract');
  const all=[...new Set([...scope.read_paths,...scope.write_paths])].sort();
  need(Array.isArray(input.interfaces)&&input.interfaces.length<=32,'interfaces must be an explicit array of at most 32 complete declarations');const ids=new Set();
  const interfaces=input.interfaces.map(value=>{need(exact(value,['id','description','paths']),'invalid interface declaration');text(value.id,'interface id',200);text(value.description,'interface description',10000);need(!ids.has(value.id),'duplicate interface id');ids.add(value.id);return {...value,paths:paths(value.paths,all,'interface paths')};});
  const roots=paths(input.required_test_roots,all,'required test roots');need(same(roots,[...scope.test_paths].sort()),'required test roots must equal the existing authorized test paths');
  references(input.dependency_refs,'dependency');
  const dependencies=input.dependency_refs.map(ref=>{const record=dependency(s,ref);return {reference:recordReference(record),record:copy(record)};});
  return {protocol:DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL,interfaces,dependency_refs:copy(input.dependency_refs),required_test_roots:roots,
    integrator:contact(input.integrator),observer:contact(input.observer),installer:contact(input.installer),
    dependency_snapshots:dependencies,source_snapshot_sha256:hash(scope.sources),
    candidate_snapshot:{protocol:'complete-scoped-candidate-files-v1',paths:all,hash_algorithm:'sha256-json-complete-files',candidate_sha256:null,observation:'not_generated_at_plan_time'},
    independent_qa:{required:true,permitted_action:'accept_local_development'},source_integration:false,additional_action_authority:false};
}
export function createDevelopmentDeliveryContract(s,scope,input){return declaration(s,scope,input);}
export function validateDevelopmentDeliveryContract(s,scope){
  const contract=scope.delivery_contract;if(contract===undefined)return null;
  need(plain(contract),'stored contract is not an object');
  const input=Object.fromEntries(['protocol','interfaces','dependency_refs','required_test_roots','integrator','observer','installer'].map(key=>[key,contract[key]]));
  need(same(declaration(s,scope,input),contract),'immutable delivery contract or dependency snapshot changed');return contract;
}
function snapshot(s,value,storageFormat){
  need(['legacy-json','normalized-v1','normalized-v2','normalized-v3','normalized-v4'].includes(storageFormat),'unsupported snapshot storage');
  return ['normalized-v2','normalized-v3','normalized-v4'].includes(storageFormat)?retainSnapshot(s,value):{protocol:'development-delivery-inline-snapshot-v1',value:copy(value)};
}
function captured(s,value,storageFormat){need(value&&typeof value.id==='string','missing canonical acceptance input');return {...recordReference(value),snapshot:snapshot(s,value,storageFormat)};}
function capturedValue(s,value,storageFormat){return {sha256:hash(value),snapshot:snapshot(s,value,storageFormat)};}
function ledgerStatus(job){if(job.delivered_record_reads===undefined)return 'unobserved';try{validateRecordReadDelivery(job.delivered_record_reads);return 'observed';}catch{return 'held';}}
function closureStatus(job){if(job.model_process_tracking===undefined)return 'unobserved';return validModelProcessTracking(job.model_process_tracking)&&job.model_process_tracking.invocations.every(v=>v.birth&&v.closure)?'observed':'held';}
function candidateTarget(s,value,c,t){
  if(value?.id===t.id||value?.id===c.id)return true;
  const d=value?.development,subject=d?.proposal?.subject;
  return d?.candidate_id===c.id||d?.candidate_sha256===c.development.candidate_sha256||subject?.candidate?.id===c.id||subject?.candidate_sha256===c.development.candidate_sha256;
}
function history(s,p,c,t,storageFormat){
  const records=Object.values(s.records).filter(r=>r.kind==='review'&&candidateTarget(s,s.records[r.review_of?.id],c,t)||r.development?.plan_id===p.id&&['candidate','test'].includes(r.development.type));
  const jobs=Object.values(s.jobs).filter(j=>j.development_id===p.id||candidateTarget(s,s.records[j.review_of?.id],c,t));
  return {records:records.map(r=>captured(s,r,storageFormat)),jobs:jobs.map(j=>captured(s,j,storageFormat)),
    adverse_record_ids:records.filter(r=>['Fail','Blocked'].includes(r.review?.verdict)).map(r=>r.id),
    uncertain_or_rejected_job_ids:jobs.filter(j=>j.rejected_output!==undefined&&j.rejected_output!==null||j.model_evidence?.cli_observed_negative_outputs?.length||['failed','cancelled','interrupted'].includes(j.status)&&j.coordination_release?.termination_confirmed!==true).map(j=>j.id)};
}

// Private composition called ONLY after develop.mjs's complete acceptance gates.
// It records those actual inputs; it neither judges QA nor supplies a bypass.
export function createDevelopmentAcceptanceReport(s,p,c,t,r,qaJob,acceptance,{storageFormat,acceptanceHome=null}={}){
  need(acceptanceHome?acceptanceHome.development.acceptance_report===undefined&&acceptanceHome.development.delivery===undefined:t.development.acceptance===undefined&&t.development.delivery===undefined,'acceptance report cannot be backfilled or duplicated');
  const contract=validateDevelopmentDeliveryContract(s,p.development.scope),producer=s.jobs[c.job_id],controller=s.jobs[t.author_instance];
  const receiver={stage:'owner',principal:{kind:'registered-owner',...copy(s.owner)}};
  const report={protocol:DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL,acceptance_kind:acceptanceHome?'review-continuation':'ordinary',recorded_at:acceptance.at,recorded_by:copy(s.owner),basis:acceptanceHome?'existing-guarded-local-development-continuation-acceptance':'existing-guarded-local-development-acceptance',
    acceptance:copy(acceptance),scope_sha256:p.development.scope_sha256,contract:contract?capturedValue(s,contract,storageFormat):null,
    plan_preimage:captured(s,p,storageFormat),candidate_preimage:captured(s,c,storageFormat),receipt_before_acceptance:captured(s,t,storageFormat),qa_record:captured(s,r,storageFormat),qa_job:captured(s,qaJob,storageFormat),candidate_producer:captured(s,producer,storageFormat),test_controller:captured(s,controller,storageFormat),
    native_identities:{candidate:{instance_id:producer.instance_id??null,native_id:producer.native_id??null},qa:{instance_id:qaJob.instance_id??null,native_id:qaJob.native_id??null}},
    source_snapshot_sha256:hash(p.development.scope.sources),candidate_snapshot_sha256:c.development.candidate_sha256,
    test_evidence:{result:capturedValue(s,t.development.result,storageFormat),validation_manifest:t.development.validation_manifest?capturedValue(s,t.development.validation_manifest,storageFormat):null,validation_fingerprint:t.development.validation_fingerprint??null,reused_from:t.development.reused_from??null},
    qa_evidence:{bounded_delivery_required:qaJob.code_review_window_minutes!==undefined,read_delivery:ledgerStatus(qaJob),original_process_journal:closureStatus(qaJob),coordination_release_recorded:qaJob.coordination_release?.termination_confirmed===true,
      delivery_receipts:qaJob.delivered_record_reads?capturedValue(s,qaJob.delivered_record_reads,storageFormat):null,final_primary_delivery:qaJob.retention_primary_delivery?capturedValue(s,qaJob.retention_primary_delivery,storageFormat):null},
    retained_history:history(s,p,c,t,storageFormat),exact_clearing:acceptance.retention_repair?copy(acceptance.retention_repair):null,
    acceptance_home_before_report:acceptanceHome?captured(s,acceptanceHome,storageFormat):null,continuation_target:acceptanceHome?captured(s,s.records[acceptanceHome.development.target_id],storageFormat):null,
    initial_handoff:{protocol:'development-delivery-initial-handoff-v1',from:{stage:'qa',principal:{kind:'recorded-native-specialist',host:qaJob.host??null,instance_id:qaJob.instance_id??null,native_id:qaJob.native_id??null}},receiver,observer:contract?{kind:'declared-session-contact',...copy(contract.observer)}:null,
      recorded_at:acceptance.at,recorded_by:copy(s.owner),basis:'local-acceptance-recorded',notification_delivery:'unobserved'},
    repository_head:{status:'unobserved',sha:null,authenticated_producer:false},source_integration:false,external_producer_authentication:'not_established',external_actions_authorized:false,installation:'unobserved',company_adoption:'unobserved'};
  validateCapturedGraph(s,report,t,acceptanceHome??t);return {report,sha256:hash(report)};
}

function verifyCapture(s,ref){
  need(plain(ref)&&hex(ref.sha256)&&ref.snapshot,'invalid captured acceptance input');
  let value;if(snapshotReference(ref.snapshot))value=resolveSnapshot(s,ref.snapshot);else {need(exact(ref.snapshot,['protocol','value'])&&ref.snapshot.protocol==='development-delivery-inline-snapshot-v1','invalid inline acceptance snapshot');value=ref.snapshot.value;}
  need(hash(value)===ref.sha256,'captured acceptance input changed');
  if(Object.hasOwn(ref,'id'))need(value.id===ref.id&&(value.revision??null)===ref.revision&&Object.hasOwn(value,'revision')===ref.revision_present,'captured identity or missing/null revision changed');return value;
}
export function developmentDeliverySnapshotValue(s,ref){return verifyCapture(s,ref);}
export function continuationAcceptanceFacts(home){const d=home.development;return {at:home.created_at,review_id:d.review.id,candidate_sha256:d.candidate_sha256,receipt_sha256:d.receipt_sha256,source_integrated:false,continuation:{acceptance_id:home.id,target_id:d.target_id,target_sha256:d.target_sha256,current_authority_sha256:d.current_authority_sha256,old_unknown_reservation_preserved:d.old_unknown_reservation_preserved}};}
function validateCapturedGraph(s,report,receipt,home){
  const p=verifyCapture(s,report.plan_preimage),c=verifyCapture(s,report.candidate_preimage),t=verifyCapture(s,report.receipt_before_acceptance),r=verifyCapture(s,report.qa_record),j=verifyCapture(s,report.qa_job),producer=verifyCapture(s,report.candidate_producer),controller=verifyCapture(s,report.test_controller),d=t.development,v=r.review;
  need(p.development?.type==='plan'&&p.development.scope_sha256===hash(p.development.scope)&&p.development.scope_sha256===report.scope_sha256&&report.source_snapshot_sha256===hash(p.development.scope.sources),'captured plan/source scope linkage changed');
  need(c.development?.type==='candidate'&&c.development.plan_id===p.id&&c.development.scope_sha256===report.scope_sha256&&hash(c.development.files)===c.development.candidate_sha256&&report.candidate_snapshot_sha256===c.development.candidate_sha256,'captured candidate/scope linkage changed');
  need(t.id===receipt.id&&d?.type==='test'&&d.plan_id===p.id&&d.candidate_id===c.id&&d.candidate_sha256===c.development.candidate_sha256&&d.receipt_sha256===hash(d.result)&&t.content===JSON.stringify(d.result)&&report.acceptance.candidate_sha256===d.candidate_sha256&&report.acceptance.receipt_sha256===d.receipt_sha256,'captured receipt/result linkage changed');
  need(controller.id===t.author_instance&&controller.kind==='development_test'&&controller.status==='completed'&&controller.artifact_id===t.id&&controller.candidate_id===c.id&&controller.development_id===p.id&&c.development.run?.job_id===controller.id&&c.development.run?.receipt_id===t.id,'captured test controller lineage changed');
  need(producer.id===c.job_id&&producer.status==='completed'&&producer.artifact_id===c.id&&producer.instance_id===c.author_instance&&producer.development_id===p.id,'captured candidate producer lineage changed');
  const target=report.acceptance_kind==='review-continuation'?verifyCapture(s,report.continuation_target):t;
  need(r.id===report.acceptance.review_id&&r.kind==='review'&&r.status==='Submitted'&&r.author_role==='qa'&&r.job_id===j.id&&r.author_instance===j.instance_id&&j.role==='qa'&&j.status==='completed'&&j.artifact_id===r.id&&same(r.review_of,j.review_of)&&r.review_of?.id===target.id&&r.review_of.revision===target.revision,'captured QA record/job/subject linkage changed');
  need(v?.verdict==='Pass'&&v.permitted_action==='accept_local_development'&&v.candidate_sha256===d.candidate_sha256&&v.receipt_sha256===d.receipt_sha256&&Array.isArray(v.blockers)&&v.blockers.length===0&&j.native_id&&j.native_id!==producer.native_id&&r.author_instance!==c.author_instance,'captured accepted QA facts changed');
  need(same(report.native_identities,{candidate:{instance_id:producer.instance_id??null,native_id:producer.native_id??null},qa:{instance_id:j.instance_id??null,native_id:j.native_id??null}}),'captured native identity linkage changed');
  need(same(verifyCapture(s,report.test_evidence.result),d.result)&&same(report.test_evidence.validation_manifest?verifyCapture(s,report.test_evidence.validation_manifest):null,d.validation_manifest??null)&&report.test_evidence.validation_fingerprint===(d.validation_fingerprint??null)&&report.test_evidence.reused_from===(d.reused_from??null),'captured test/manifest evidence changed');
  need(report.qa_evidence.bounded_delivery_required===(j.code_review_window_minutes!==undefined)&&report.qa_evidence.read_delivery===ledgerStatus(j)&&report.qa_evidence.original_process_journal===closureStatus(j)&&report.qa_evidence.coordination_release_recorded===(j.coordination_release?.termination_confirmed===true)&&same(report.qa_evidence.delivery_receipts?verifyCapture(s,report.qa_evidence.delivery_receipts):null,j.delivered_record_reads??null)&&same(report.qa_evidence.final_primary_delivery?verifyCapture(s,report.qa_evidence.final_primary_delivery):null,j.retention_primary_delivery??null),'captured delivery/closure evidence changed');
  need(same(report.contract?verifyCapture(s,report.contract):null,p.development.scope.delivery_contract??null)&&same(report.exact_clearing,report.acceptance.retention_repair??null),'captured contract/clearing linkage changed');
  if(report.acceptance_kind==='review-continuation')need(target.development?.type==='review_continuation'&&home.development.target_id===target.id&&home.development.target_sha256===hash(target)&&target.development.plan_id===p.id&&target.development.candidate_id===c.id&&target.development.receipt_id===t.id&&same(home.development.review,{id:r.id,revision:r.revision??null,sha256:hash(r)}),'captured continuation acceptance linkage changed');
  else need(report.acceptance_kind==='ordinary'&&report.acceptance_home_before_report===null&&report.continuation_target===null,'unknown acceptance report kind');
  need(report.recorded_at===report.acceptance.at&&report.initial_handoff.recorded_at===report.recorded_at&&same(report.initial_handoff.recorded_by,report.recorded_by)&&same(report.initial_handoff.from,{stage:'qa',principal:{kind:'recorded-native-specialist',host:j.host??null,instance_id:j.instance_id??null,native_id:j.native_id??null}})&&same(report.initial_handoff.receiver,{stage:'owner',principal:{kind:'registered-owner',...report.recorded_by}}),'captured initial acceptance handoff changed');
  need(same(report.repository_head,{status:'unobserved',sha:null,authenticated_producer:false})&&report.source_integration===false&&report.external_actions_authorized===false,'local acceptance cannot authenticate external integration');
}
function acceptedReport(s,a){
  const receipt=s.records[a.receipt_id];need(receipt?.development?.type==='test'&&receipt.development.plan_id===a.plan_id,'exact canonical receipt/plan required');
  const home=a.acceptance_id===undefined?receipt:s.records[a.acceptance_id];
  if(a.acceptance_id!==undefined){need(home?.development?.type==='review_continuation_acceptance'&&home.kind==='artifact'&&home.author_role==='runtime'&&home.status==='Submitted'&&home.development.receipt_id===receipt.id&&(home.development.plan_id??receipt.development.plan_id)===a.plan_id,'exact canonical continuation acceptance home required');const report=home.development.acceptance_report;
    if(report===undefined&&home.development.acceptance_report_sha256===undefined)return {status:'unobserved',reason:'legacy_continuation_acceptance_report_unavailable',receipt,home,report:null};
    need(report?.protocol===DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL&&report.acceptance_kind==='review-continuation'&&hash(report)===home.development.acceptance_report_sha256,'continuation acceptance report integrity failed');
    need(same(continuationAcceptanceFacts(home),report.acceptance),'immutable continuation acceptance facts changed');const prior=verifyCapture(s,report.acceptance_home_before_report),current=copy(home);delete current.development.acceptance_report;delete current.development.acceptance_report_sha256;delete current.development.delivery;need(same(prior,current),'continuation acceptance pre-report home changed');
    need(same(verifyCapture(s,report.receipt_before_acceptance),receipt),'historical continuation receipt changed');validateCapturedGraph(s,report,receipt,home);
    for(const value of [...report.retained_history.records,...report.retained_history.jobs])verifyCapture(s,value);
    return {status:'observed',reason:'canonical_local_continuation_acceptance_recorded',receipt,home,report,report_sha256:home.development.acceptance_report_sha256,acceptance_id:home.id};
  }
  const acceptance=receipt.development.acceptance;
  if(!acceptance)return {status:'unobserved',reason:'not_locally_accepted',receipt,report:null};
  if(acceptance.report===undefined&&acceptance.report_sha256===undefined)return {status:'unobserved',reason:'legacy_acceptance_report_unavailable',receipt,report:null};
  const report=acceptance.report;need(report?.protocol===DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL&&hash(report)===acceptance.report_sha256,'acceptance report integrity failed');
  const base=copy(acceptance);delete base.report;delete base.report_sha256;need(same(base,report.acceptance),'immutable acceptance facts changed');
  const before=verifyCapture(s,report.receipt_before_acceptance),current=copy(receipt);delete current.development.acceptance;delete current.development.delivery;
  need(before.development.acceptance===undefined&&same(current,before)&&before.id===receipt.id,'receipt pre-acceptance image changed');
  for(const name of ['plan_preimage','candidate_preimage','qa_record','qa_job','candidate_producer','test_controller'])verifyCapture(s,report[name]);
  for(const value of [report.contract,report.test_evidence.result,report.test_evidence.validation_manifest,report.qa_evidence.delivery_receipts,report.qa_evidence.final_primary_delivery])if(value)verifyCapture(s,value);
  for(const value of [...report.retained_history.records,...report.retained_history.jobs])verifyCapture(s,value);
  validateCapturedGraph(s,report,receipt,home);
  return {status:'observed',reason:'canonical_local_acceptance_recorded',receipt,home,report,report_sha256:acceptance.report_sha256,acceptance_id:null};
}
function initialProgress(report,sha256){return {protocol:DEVELOPMENT_DELIVERY_PROGRESS_PROTOCOL,report_sha256:sha256,revision:0,current_receiver:copy(report.initial_handoff.receiver),observer:copy(report.initial_handoff.observer),transitions:[]};}
function nextReceiver(report,current,to){
  const contract=report.contract?verifyContractSnapshot(report.contract):null;need(contract,'delivery transitions require the original frozen contract');
  const allowed=current.stage==='owner'?'integrator':current.stage==='integrator'?'installer':'installer';need(to===allowed,'receiver transition skips or reverses the declared handoff order');
  return {stage:to,principal:{kind:'declared-session-contact',...copy(contract[to])}};
}
// The contract snapshot is resolved by progressOf before this helper is called.
function verifyContractSnapshot(value){return value.resolved_contract??null;}
function progressOf(s,accepted){
  const {home,report,report_sha256}=accepted;
  const contract=report.contract?verifyCapture(s,report.contract):null,view={...report,contract:contract?{...report.contract,resolved_contract:contract}:null};
  const initial=initialProgress(report,report_sha256),stored=home.development.delivery;if(stored===undefined)return {progress:initial,view};
  need(exact(stored,['protocol','report_sha256','revision','current_receiver','observer','transitions'])&&stored.protocol===initial.protocol&&stored.report_sha256===report_sha256&&Array.isArray(stored.transitions),'invalid canonical delivery progress');
  let expected=initial;const ids=new Set();
  for(const entry of stored.transitions){
    need(exact(entry,['sequence','recorded_at','request','request_sha256','previous_handoff_sha256','from','to','status','evidence','attribution','authenticated_external_producer','source_integration','external_actions_authorized']),'invalid delivery transition fields');
    const q=entry.request;need(exact(q,['transition_id','acceptance_id','report_sha256','expected_handoff_sha256','to_stage','reported_outcome','evidence_refs','source_instruction','recorded_by'])&&hex(entry.request_sha256)&&entry.request_sha256===hash(q)&&q.report_sha256===report_sha256&&q.acceptance_id===(accepted.acceptance_id??null),'transition request binding changed');
    text(q.transition_id,'transition id',200);need(!ids.has(q.transition_id),'duplicate transition id');ids.add(q.transition_id);
    need(entry.sequence===expected.revision+1&&entry.previous_handoff_sha256===hash(expected)&&q.expected_handoff_sha256===entry.previous_handoff_sha256&&same(entry.from,expected.current_receiver),'transition compare-and-swap chain changed');
    need(Number.isFinite(Date.parse(entry.recorded_at))&&plain(q.recorded_by)&&['codex','claude'].includes(q.recorded_by.host)&&text(q.recorded_by.session_id,'recording owner',200)&&Number.isInteger(q.recorded_by.epoch),'transition attribution is invalid');
    text(q.source_instruction,'transition source instruction',10000);references(q.evidence_refs,'transition evidence');
    need(['completed','unknown','failed'].includes(q.reported_outcome)&&entry.status===outcomeStatus(q.reported_outcome),'invalid reported transition outcome');
    const to=nextReceiver(view,expected.current_receiver,q.to_stage);need(same(to,entry.to)&&entry.attribution==='operator-reported'&&entry.authenticated_external_producer===false&&entry.source_integration===false&&entry.external_actions_authorized===false,'transition cannot grant external authority');
    need(Array.isArray(entry.evidence)&&entry.evidence.length===q.evidence_refs.length&&q.evidence_refs.every((r,i)=>{const value=verifyCapture(s,entry.evidence[i]);return r.id===value.id&&r.revision===(value.revision??null)&&r.sha256===hash(value);}),'transition evidence snapshot changed');
    need(q.reported_outcome!=='completed'||entry.evidence.length>0,'completed operator observation needs explicit evidence');
    expected={...expected,revision:entry.sequence,current_receiver:q.reported_outcome==='completed'?to:expected.current_receiver,transitions:[...expected.transitions,entry]};
  }
  need(same(expected,stored),'delivery progress/current receiver changed');return {progress:stored,view};
}
const outcomeStatus=value=>value==='completed'?'observed':value==='failed'?'held':'unobserved';
function boundedReply(receipt,result){
  if(fits(result))return result;
  const source=sourceReference(receipt,storageSourceId('records',receipt.id));
  const reportPath=receipt.development.type==='review_continuation_acceptance'?['development','acceptance_report']:['development','acceptance','report'];
  let compact={...result,report:null,report_inline:false,report_source:{record:source,path_in_record:reportPath,sha256:result.report_sha256},retrieval:'Read the exact canonical acceptance home through company_context read ranges. The report is immutable; its containing record can change when attributed progress is appended.'};
  if(fits(compact))return compact;
  compact={...compact,handoff:null,transition:null,handoff_inline:false,handoff_source:{record:source,path_in_record:receipt.development.delivery?['development','delivery']:[...reportPath,'initial_handoff'],value_kind:receipt.development.delivery?'stored-progress':'initial-handoff-only',progress_sha256:result.handoff_sha256}};
  need(fits(compact),'exact delivery handles exceed the public response budget');return compact;
}

// Presentation of an already successful mutation only. Keep the established
// acceptance fields even when its new historical report is too large for MCP.
// This never changes canonical acceptance bytes or any before-COMMIT hash.
export function boundedDevelopmentAcceptanceReply(a,host,result){
  const continuation=a.action==='accept_review_continuation';
  need(a.action==='accept'||continuation,'unsupported public acceptance reply');
  const report=continuation?result?.development?.acceptance_report:result?.report;
  const reportSha=continuation?result?.development?.acceptance_report_sha256:result?.report_sha256;
  need(report?.protocol===DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL&&hex(reportSha)&&hash(report)===reportSha,'returned canonical acceptance report changed');
  const canonicalSha=hash(result);
  const compact=continuation?{...result,development:{...result.development,acceptance_report:null},acceptance_report_inline:false,canonical_acceptance_record_sha256:canonicalSha}
    :{...result,report:null,report_inline:false,canonical_acceptance_sha256:canonicalSha};
  compact.report_sha256=reportSha;
  compact.retrieval='The acceptance operation returned successfully. Read the exact canonical acceptance home/report through company_context ranges; do not repeat acceptance to retrieve its report.';
  try{
    Object.assign(compact,withStore(a.root,db=>db.readSnapshot(()=>{
      const s=db.read();owner(s,a.session_id,host,a.epoch);
      const selected=acceptedReport(s,{plan_id:continuation?result.development.plan_id:a.plan_id,receipt_id:continuation?result.development.receipt_id:a.receipt_id,...(continuation?{acceptance_id:result.id}:{})});
      need(selected.report&&selected.report_sha256===reportSha,'returned report no longer matches the canonical acceptance home');
      if(continuation)need(hash(selected.home)===canonicalSha,'returned continuation acceptance home changed after acceptance');
      else need(hash(selected.home.development.acceptance)===canonicalSha,'returned acceptance no longer matches its canonical receipt');
      const source=sourceReference(selected.home,storageSourceId('records',selected.home.id)),acceptancePath=continuation?[]:['development','acceptance'],reportPath=continuation?['development','acceptance_report']:['development','acceptance','report'];
      return {acceptance_source:{record:source,path_in_record:acceptancePath,sha256:canonicalSha},report_source:{record:source,path_in_record:reportPath,sha256:reportSha}};
    })));
  }catch(error){compact.acceptance_source=null;compact.report_source=null;compact.readback_hold='The operation returned, but exact current readback is unavailable: '+String(error?.message??error).slice(0,300);}
  need(fits(compact),'established acceptance facts exceed the public response budget');return compact;
}
function inspected(s,a){
  const accepted=acceptedReport(s,a);if(!accepted.report)return {status:accepted.status,reason:accepted.reason,report:null,source_integration:false,external_actions_authorized:false};
  const {progress}=progressOf(s,accepted);
  const last=progress.transitions.at(-1),acceptanceOnly=a.action==='acceptance_report';
  return boundedReply(accepted.home,{status:acceptanceOnly?'observed':accepted.report.contract?(last?.status??'observed'):'held',reason:acceptanceOnly?accepted.reason:!accepted.report.contract?'delivery_contract_unavailable':last?'operator_report_'+last.request.reported_outcome:'local_acceptance_waiting_for_handoff',acceptance_id:accepted.acceptance_id??null,report:accepted.report,report_sha256:accepted.report_sha256,
    handoff:progress,handoff_sha256:hash(progress),current_receiver:progress.current_receiver,observer:progress.observer,contacts_authenticated:false,notification_delivery:'unobserved',source_integration:false,external_actions_authorized:false});
}
export function developmentDeliveryAction(a,host){
  need(DEVELOPMENT_DELIVERY_ACTIONS.includes(a.action),'unknown delivery action');
  const keys=['root','session_id','epoch','action','plan_id','receipt_id',...(Object.hasOwn(a,'acceptance_id')?['acceptance_id']:[]),...(a.action==='delivery_transition'?['report_sha256','expected_handoff_sha256','transition_id','to_stage','reported_outcome','evidence_refs','source_instruction']:[])];
  need(exact(a,keys),'use exact complete delivery action fields');
  if(Object.hasOwn(a,'acceptance_id'))text(a.acceptance_id,'acceptance id',200);
  if(a.action!=='delivery_transition')return withStore(a.root,db=>{const s=db.read();owner(s,a.session_id,host,a.epoch);return inspected(s,a);});
  let result,committedReport,committedProgress;const replayAbort=new Error('Read-only exact delivery replay');
  try{withStore(a.root,db=>db.transaction('development.delivery_transition',s=>{
    owner(s,a.session_id,host,a.epoch);need(!s.paused,'company is paused');const accepted=acceptedReport(s,a);need(accepted.report,'canonical acceptance report unavailable; legacy acceptance is not backfilled');
    need(hex(a.report_sha256)&&a.report_sha256===accepted.report_sha256&&hex(a.expected_handoff_sha256),'exact acceptance report and handoff SHA256 required');
    text(a.transition_id,'transition id',200);text(a.source_instruction,'transition source instruction',10000);references(a.evidence_refs,'transition evidence');need(['completed','unknown','failed'].includes(a.reported_outcome),'invalid reported outcome');
    const {progress,view}=progressOf(s,accepted),request={transition_id:a.transition_id,acceptance_id:a.acceptance_id??null,report_sha256:a.report_sha256,expected_handoff_sha256:a.expected_handoff_sha256,to_stage:a.to_stage,reported_outcome:a.reported_outcome,evidence_refs:copy(a.evidence_refs),source_instruction:a.source_instruction,recorded_by:copy(s.owner)};
    const replay=progress.transitions.find(v=>v.request.transition_id===a.transition_id);
    if(replay){need(replay.request_sha256===hash(request),'transition id replay changed its exact request');result=boundedReply(accepted.home,{...inspected(s,{...a,action:'delivery_inspect'}),status:replay.status,transition:replay,replayed:true});throw replayAbort;}
    need(hash(progress)===a.expected_handoff_sha256,'handoff compare-and-swap is stale');
    const to=nextReceiver(view,progress.current_receiver,a.to_stage),evidence=a.evidence_refs.map(r=>captured(s,dependency(s,r),db.storageInfo().format));need(a.reported_outcome!=='completed'||evidence.length>0,'completed operator observation needs explicit evidence');
    const entry={sequence:progress.revision+1,recorded_at:stamp(),request,request_sha256:hash(request),previous_handoff_sha256:hash(progress),from:copy(progress.current_receiver),to,status:outcomeStatus(a.reported_outcome),evidence,attribution:'operator-reported',authenticated_external_producer:false,source_integration:false,external_actions_authorized:false};
    accepted.home.development.delivery={...progress,revision:entry.sequence,current_receiver:a.reported_outcome==='completed'?to:progress.current_receiver,transitions:[...progress.transitions,entry]};
    committedReport=accepted.report_sha256;committedProgress=hash(accepted.home.development.delivery);s.runtime_version=VERSION;
    result=boundedReply(accepted.home,{...inspected(s,{...a,action:'delivery_inspect'}),status:entry.status,transition:entry,replayed:false});return s;
  },{beforeCommit:(_db,s)=>{owner(s,a.session_id,host,a.epoch);need(!s.paused,'company paused before transition commit');if(committedReport){const accepted=acceptedReport(s,a);need(accepted.report_sha256===committedReport&&hash(progressOf(s,accepted).progress)===committedProgress,'delivery changed before commit');}}}));}catch(error){if(error!==replayAbort)throw error;}return result;
}
