// Optional qualification DATA tooling. No issuer, Store, IO, clock or authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {captureBinding,callPolicyHash} from './typed-capture.mjs';
import {encodeIssue18LedgerData} from '../issue18-ledger-storage.mjs';

export const DATA_CONTRACT=Object.freeze({
  scope:'DATA_CONSISTENCY_ONLY_NOT_AUTHORITY',
  A_manifest_sha256:'6016550e2052de17c001b40d60a99bb42ea52f0a3c4941a429b2f4504d9d8a03',
  A_evidence_schema_sha256:'0846a27387b916b1d95ccace259b990c822a18af179b0e2c8e8f838d26afe522',
  B_manifest_sha256:'673415b5c573d42305d2541eb5d96e6dae5c2b08e8b64bca34af495ac144b2f6',
  B_schema_sha256:'cc751b527a2ce0591c1f4852a13052028598faf0daac0dccb83902ee8c6a7e4d',
  shared_schema_sha256:'152b44928e314bcb2e1145c77dc45e9f2ba358fed06694f058af236f147f474f',
  profile_sha256:'11174e64cd21ec21d3f420cb48ff3fcbbc82f1e9d462880beedffdb8ccd2ace7',
  profile_id:'soloco-issue18-literal-comparison-contract-v1',
  evidence_schema_uri:'urn:soloco:issue18:contract-A:v2:evidence',
  B_schema_uri:'urn:soloco:issue18:contract-B:v2:records'
});
export const DATA_LIMITS=Object.freeze({run_bytes:32768,slot_bytes:16384,issuer_bytes:32768,
  B_total_bytes:196608,shared_bytes:65536,A_per_call_bytes:9975424,
  B_slot_bytes:16384,shared_per_call_bytes:8192,run_evidence_bytes:80000000});
const ARMS=['1-files','1-patches','3-files','3-patches'];
export const SLOT_ROSTER=Object.freeze(ARMS.flatMap(arm_id=>['engineer','qa'].map(phase=>
  Object.freeze({arm_id,phase,filename:`slot-${arm_id}-${phase}.json`}))));
const CONTROLS=Object.freeze({max_native_calls_total:8,generation_per_arm:1,test_per_arm:1,
  qa_per_arm:1,repairs:0,scope_max_bytes:200000,native_timeout_ms:300000,test_timeout_ms:10000,test_wait_ms:20000});
const CAPACITY=Object.freeze({manifest_bytes_max:32768,slot_bytes_max:16384,per_call_manifest_charge:8192,
  per_call_B_charge:16384,per_call_A_upper_ceiling:9975424,run_upper_evidence_bytes:80000000,
  issuer_metadata_bytes_max:32768,shared_metadata_bytes_max:65536});
const SOURCE_KEYS=['source_generation_sha256','source_manifest_sha256','git_head','git_tree',
  'node_executable_sha256','node_version','contract_A_manifest_sha256','contract_B_manifest_sha256',
  'frozen_E3_component_sha256','codec_module_sha256'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const has=(v,k)=>Object.hasOwn(v,k);
const fail=code=>{throw Object.assign(new TypeError('ISSUE18_DATA_'+code),{code:'ISSUE18_DATA_'+code});};
const need=(ok,code)=>{if(!ok)fail(code);};
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
function scalar(value){
  if(typeof value!=='string')return false;
  for(let i=0;i<value.length;i++){
    const unit=value.charCodeAt(i);
    if(unit>=0xd800&&unit<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(unit>=0xdc00&&unit<=0xdfff)return false;
  }
  return true;
}
// Check proxies before reflection; copy data descriptors, never caller getters.
function dataCopy(input){
  const seen=new Set();let nodes=0,characters=0;
  function copy(value,depth){
    need(++nodes<=8192&&depth<=32,'DATA_LIMIT');
    if(value===null||typeof value==='boolean')return value;
    if(typeof value==='number'){need(integer(value,Number.MIN_SAFE_INTEGER),'NUMBER');return value;}
    if(typeof value==='string'){
      need(value.length<=32768&&scalar(value),'STRING');characters+=value.length;need(characters<=65536,'DATA_LIMIT');return value;
    }
    need(value&&typeof value==='object'&&!types.isProxy(value)&&!seen.has(value),'DATA');
    const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
    need(prototype===(array?Array.prototype:Object.prototype)||(!array&&prototype===null),'PROTOTYPE');
    const keys=Reflect.ownKeys(value);need(keys.length<=8193&&keys.every(k=>typeof k==='string'),'DATA_LIMIT');
    const descriptors=Object.getOwnPropertyDescriptors(value);
    need(keys.every(k=>has(descriptors[k],'value')&&(descriptors[k].enumerable||(array&&k==='length'))),'ACCESSOR_OR_HIDDEN');
    seen.add(value);let result;
    if(array){
      const length=descriptors.length.value;
      need(integer(length,0,8192)&&keys.length===length+1&&keys.every(k=>k==='length'||/^(0|[1-9][0-9]*)$/.test(k)&&Number(k)<length),'ARRAY');
      result=[];for(let i=0;i<length;i++){need(has(descriptors,String(i)),'ARRAY');result.push(copy(descriptors[i].value,depth+1));}
    }else{
      result={};for(const key of keys){
        need(key.length<=200&&/^[\x20-\x7e]+$/.test(key),'KEY');
        Object.defineProperty(result,key,{value:copy(descriptors[key].value,depth+1),enumerable:true,writable:true,configurable:true});
      }
    }
    seen.delete(value);return result;
  }
  return copy(input,0);
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function closed(value,keys){
  need(value!==null&&typeof value==='object'&&!Array.isArray(value),'OBJECT');
  const own=Object.keys(value);need(own.length===keys.length&&keys.every(k=>has(value,k)),'FIELDS');return value;
}
function exact(value,expected,code='VALUE'){
  if(value===expected)return;
  need(value!==null&&expected!==null&&typeof value==='object'&&typeof expected==='object'&&Array.isArray(value)===Array.isArray(expected),code);
  const keys=Object.keys(value),other=Object.keys(expected);need(keys.length===other.length&&other.every(k=>has(value,k)),code);
  for(const key of other)exact(value[key],expected[key],code);
}
function pattern(value,expression,code){const match=typeof value==='string'?expression.exec(value):null;need(match!==null&&match[0]===value,code);}
const label=value=>pattern(value,/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/,'LABEL');
const digest=value=>pattern(value,/^[a-f0-9]{64}$/,'HASH');
function ref(value){closed(value,['id','revision','sha256']);label(value.id);need(integer(value.revision,1),'REVISION');digest(value.sha256);}
function timeKey(value){
  const match=typeof value==='string'?/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/.exec(value):null;
  need(match!==null&&match[0]===value,'TIME');
  const [,year,month,day,hour,minute,second,fraction='']=match,y=Number(year),m=Number(month),d=Number(day);
  const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  need(m>=1&&m<=12&&d>=1&&d<=days[m-1]&&Number(hour)<24&&Number(minute)<60&&Number(second)<60,'TIME');
  return year+month+day+hour+minute+second+fraction.padEnd(6,'0');
}
function source(value){
  closed(value,SOURCE_KEYS);
  for(const key of SOURCE_KEYS.filter(k=>!['git_head','git_tree','node_version'].includes(k)))digest(value[key]);
  for(const key of ['git_head','git_tree'])pattern(value[key],/^[a-f0-9]{40}$/,'GIT_ID');
  need(typeof value.node_version==='string'&&[...value.node_version].length<=64,'NODE_VERSION');
  need(value.contract_A_manifest_sha256===DATA_CONTRACT.A_manifest_sha256&&value.contract_B_manifest_sha256===DATA_CONTRACT.B_manifest_sha256,'CONTRACT_PIN');
}
function directory(value){
  closed(value,['dev','ino','uid','gid','permissions_octal','name_binding_sha256']);
  for(const key of ['dev','ino','uid','gid'])pattern(value[key],/^(0|[1-9][0-9]{0,19})$/,'PHYSICAL_INTEGER');
  need(value.permissions_octal==='0700','DIRECTORY_MODE');digest(value.name_binding_sha256);
}
function prompt(value){
  closed(value,['blob','utf16_units','utf8_bytes','unicode_well_formed','contains_nul']);
  closed(value.blob,['sha256','bytes','encoding','object_name']);digest(value.blob.sha256);
  need(value.blob.encoding==='utf8-scalar-text-v1'&&value.blob.object_name===`objects/${value.blob.sha256}.blob`,'PROMPT_DOMAIN');
  need(integer(value.blob.bytes,0,2000000)&&integer(value.utf8_bytes,0,2000000)&&integer(value.utf16_units,0,2000000),'PROMPT_LIMIT');
  need(value.utf8_bytes===value.blob.bytes&&value.unicode_well_formed===true&&value.contains_nul===false,'PROMPT_FACTS');
  need(value.utf16_units<=value.utf8_bytes&&value.utf8_bytes<=3*value.utf16_units,'PROMPT_FACTS');
}
function bounded(value,maximum){encodeIssue18LedgerData(value,maximum);return freeze(value);}
function checkedBinding(value){
  closed(value,['encoding','text','utf8_bytes','sha256']);
  need(value.encoding==='exact-shared-call-binding-utf8-v1'&&typeof value.text==='string'&&value.text.length>0&&!value.text.startsWith('\ufeff'),'BINDING_DOMAIN');
  const bytes=Buffer.from(value.text,'utf8');
  need(integer(value.utf8_bytes,1,16384)&&bytes.length===value.utf8_bytes&&value.sha256===hash(bytes),'BINDING_BYTES');
  const binding=dataCopy(captureBinding(value.text).binding);
  source(binding.source);
  // The frozen capture checker establishes closed shapes. These exact matches
  // additionally exclude a trailing newline accepted by JavaScript's $ anchor.
  for(const key of ['run_id','invocation_id'])label(binding[key]);
  for(const key of ['root_sha256','company_identity_sha256','incarnation_sha256'])digest(binding.store[key]);
  for(const key of ['id','instance_id'])label(binding.job[key]);
  if(binding.job.development_id!==null)label(binding.job.development_id);
  if(binding.job.review_of!==null)ref(binding.job.review_of);
  for(const key of ['preimage_sha256','context_sha256'])digest(binding.job[key]);
  label(binding.plan.id);
  for(const key of ['record_sha256','scope_sha256','authorization_sha256','source_corpus_sha256'])digest(binding.plan[key]);
  for(const key of ['selection_sha256','cwd_sha256'])digest(binding.model[key]);
  for(const key of ['canonical_prompt_sha256','actual_prompt_sha256','fixture_sha256'])digest(binding[key]);
  if(binding.encoding_instruction_sha256!==null)digest(binding.encoding_instruction_sha256);
  const policy=binding.call_policy;
  label(policy.cancellation_binding_id);digest(policy.policy_sha256);
  need(policy.policy_sha256===callPolicyHash(JSON.stringify(policy)),'POLICY_HASH');
  need(policy.absolute_deadline_ms<=policy.authority_expiry_ms&&(policy.overall_deadline_ms===null||policy.absolute_deadline_ms<=policy.overall_deadline_ms),'POLICY_DEADLINE');
  need(policy.call_timeout_ms<=policy.configured_timeout_ms&&policy.evidence_ceiling_bytes>24576,'POLICY_CAPACITY');
  timeKey(binding.plan.expires_at);
  return binding;
}

/** Exact A bytes are preserved in text. A copied result is not a prepared loan. */
export function validateBindingSerialization(input){const value=dataCopy(input);checkedBinding(value);return bounded(value,16384);}
export function encodeBindingSerialization(input){return encodeIssue18LedgerData(validateBindingSerialization(input),16384);}

function qa(value){
  closed(value,['engineer_slot_record_sha256','candidate_ref','candidate_sha256','test_attempt_reservation_ref',
    'test_job_id','test_receipt_ref','test_receipt_sha256','producer_invocation_id','producer_native_id','actual_test_proof_ref','qa_independence_policy_ref']);
  for(const key of ['engineer_slot_record_sha256','candidate_sha256','test_receipt_sha256'])digest(value[key]);
  for(const key of ['candidate_ref','test_attempt_reservation_ref','test_receipt_ref','actual_test_proof_ref','qa_independence_policy_ref'])ref(value[key]);
  for(const key of ['test_job_id','producer_invocation_id','producer_native_id'])label(value[key]);
  // Record-ref hashes and candidate/test byte hashes have different domains.
}
/** Presence and association DATA only; no genuine passing-test assertion. */
export function validateQAPrerequisite(input){const value=dataCopy(input);qa(value);return bounded(value,16384);}
export function encodeQAPrerequisite(input){return encodeIssue18LedgerData(validateQAPrerequisite(input),16384);}

export function validateRunManifest(input){
  const value=dataCopy(input);
  closed(value,['protocol','schema_version','profile_id','profile_sha256','shared_schema_sha256','run_id',
    'supported_selection_ref','selected_initialization_id','source','original_controls_sha256','predeclared_protocol_sha256',
    'created_at','expires_at','parent_identity','ledger_identity','ledger_identity_sha256','slot_roster','original_controls',
    'capacity','model_policy_ref','durability_profile_ref','retention_policy_ref','cold_read_authorizes','evidence_schema_sha256']);
  need(value.protocol==='issue18-eight-slot-run-v2'&&value.schema_version===2,'RUN_PROTOCOL');
  need(value.profile_id===DATA_CONTRACT.profile_id&&value.profile_sha256===DATA_CONTRACT.profile_sha256&&
    value.shared_schema_sha256===DATA_CONTRACT.shared_schema_sha256&&value.evidence_schema_sha256===DATA_CONTRACT.A_evidence_schema_sha256,'CONTRACT_PIN');
  label(value.run_id);label(value.selected_initialization_id);source(value.source);
  for(const key of ['supported_selection_ref','model_policy_ref','durability_profile_ref','retention_policy_ref'])ref(value[key]);
  need(value.original_controls_sha256==='f42e97413de5f5a0998b8064ab5068fbb59c12823081df67dc0eb5c6595e3498'&&
    value.predeclared_protocol_sha256==='9e910e30873fa4eba7aac89b650da688c30492fb64d6230c054600af725a3e38','ORIGINAL_CONTROLS');
  need(timeKey(value.created_at)<timeKey(value.expires_at),'TIME_ORDER');
  directory(value.parent_identity);directory(value.ledger_identity);digest(value.ledger_identity_sha256);
  exact(value.slot_roster,SLOT_ROSTER,'ROSTER');exact(value.original_controls,CONTROLS,'ORIGINAL_CONTROLS');exact(value.capacity,CAPACITY,'CAPACITY');
  need(value.cold_read_authorizes===false,'NO_AUTHORITY');return bounded(value,32768);
}
export function encodeRunManifest(input){return encodeIssue18LedgerData(validateRunManifest(input),32768);}

/** Optional context strengthens DATA joins; it never authenticates that context. */
export function validateSlotRecord(input,context){
  const value=dataCopy(input);
  closed(value,['protocol','schema_version','record_kind','run_manifest_sha256','ledger_identity_sha256','slot_commit_id',
    'prepared_at','binding','binding_sha256','phase_prerequisite','cold_read_authorizes','binding_serialization','request_prompts']);
  need(value.protocol==='issue18-eight-slot-consumption-v2'&&value.schema_version===2&&value.record_kind==='consumption_record','SLOT_PROTOCOL');
  digest(value.run_manifest_sha256);digest(value.ledger_identity_sha256);digest(value.binding_sha256);label(value.slot_commit_id);timeKey(value.prepared_at);
  need(value.cold_read_authorizes===false,'NO_AUTHORITY');
  const binding=checkedBinding(value.binding_serialization);exact(value.binding,binding,'BINDING_PROJECTION');
  need(value.binding_sha256===value.binding_serialization.sha256,'BINDING_JOIN');
  const prompts=closed(value.request_prompts,['canonical','encoding_instruction','actual']);
  prompt(prompts.canonical);prompt(prompts.actual);if(prompts.encoding_instruction!==null)prompt(prompts.encoding_instruction);
  need(prompts.canonical.blob.sha256===binding.canonical_prompt_sha256&&prompts.actual.blob.sha256===binding.actual_prompt_sha256&&
    (prompts.encoding_instruction?.blob.sha256??null)===binding.encoding_instruction_sha256,'PROMPT_JOIN');
  const encoded=binding.codec_mode==='full_file_chunks_v1';need(encoded===(prompts.encoding_instruction!==null),'ENCODING_PHASE');
  need(encoded===(binding.phase==='engineer'&&binding.arm_id.endsWith('files')),'PROFILE_ENCODING_SELECTOR');
  if(encoded)need(prompts.encoding_instruction.utf16_units>0,'ENCODING_PHASE');
  need(prompts.actual.utf16_units===prompts.canonical.utf16_units+(prompts.encoding_instruction?.utf16_units??0)&&
    prompts.actual.utf8_bytes===prompts.canonical.utf8_bytes+(prompts.encoding_instruction?.utf8_bytes??0),'PROMPT_CONCATENATION');
  if(!encoded)need(prompts.actual.blob.sha256===prompts.canonical.blob.sha256,'IDENTITY_PROMPT');
  if(binding.phase==='engineer'){
    need(value.phase_prerequisite===null&&binding.job.development_id===binding.plan.id,'ENGINEER_PHASE');
  }else{
    qa(value.phase_prerequisite);
    exact(binding.job.review_of,value.phase_prerequisite.test_receipt_ref,'QA_REVIEW');
    need(value.phase_prerequisite.producer_invocation_id!==binding.invocation_id&&value.phase_prerequisite.test_job_id!==binding.job.id,'QA_PHASE');
  }
  if(context!==undefined){
    const expected=closed(dataCopy(context),['run_manifest','run_manifest_sha256','arm_id','phase']),run=validateRunManifest(expected.run_manifest);
    digest(expected.run_manifest_sha256);need(expected.run_manifest_sha256===hash(encodeRunManifest(run)),'MANIFEST_BYTES');
    need(expected.run_manifest_sha256===value.run_manifest_sha256&&run.ledger_identity_sha256===value.ledger_identity_sha256,'MANIFEST_JOIN');
    need(ARMS.includes(expected.arm_id)&&['engineer','qa'].includes(expected.phase)&&binding.arm_id===expected.arm_id&&binding.phase===expected.phase,'SLOT_KEY');
    need(binding.run_id===run.run_id&&binding.profile_id===run.profile_id&&binding.profile_sha256===run.profile_sha256,'RUN_JOIN');
    exact(binding.source,run.source,'SOURCE_JOIN');
    need(timeKey(value.prepared_at)>=timeKey(run.created_at)&&timeKey(value.prepared_at)<timeKey(run.expires_at),'SLOT_TIME');
  }
  return bounded(value,16384);
}
export function encodeSlotRecord(input,context){return encodeIssue18LedgerData(validateSlotRecord(input,context),16384);}
