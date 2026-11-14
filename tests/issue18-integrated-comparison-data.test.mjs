// Fictional closed DATA only. No Store, backend IO, model, grant or authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {capturePrompt,callPolicyHash} from '../tools/issue18/typed-capture.mjs';
import {DATA_CONTRACT,DATA_LIMITS,SLOT_ROSTER,validateRunManifest,encodeRunManifest,
  validateBindingSerialization,encodeBindingSerialization,validateQAPrerequisite,
  encodeQAPrerequisite,validateSlotRecord,encodeSlotRecord} from '../tools/issue18/integrated-comparison-data.mjs';

const H='1'.repeat(64),OTHER='2'.repeat(64),LEDGER='3'.repeat(64);
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const recordRef=id=>({id,revision:1,sha256:H});
const rejected=(fn,code)=>assert.throws(fn,value=>code?value.code===code:
  value instanceof TypeError&&/^ISSUE18_(DATA|CAPTURE|STORAGE)_/.test(value.code??''));
function source(){return {source_generation_sha256:H,source_manifest_sha256:H,git_head:'1'.repeat(40),git_tree:'2'.repeat(40),
  node_executable_sha256:H,node_version:'fictional-node-22',contract_A_manifest_sha256:DATA_CONTRACT.A_manifest_sha256,
  contract_B_manifest_sha256:DATA_CONTRACT.B_manifest_sha256,frozen_E3_component_sha256:H,codec_module_sha256:H};}
function qaPrerequisite(){return {engineer_slot_record_sha256:H,candidate_ref:recordRef('fictional-candidate'),candidate_sha256:OTHER,
  test_attempt_reservation_ref:recordRef('fictional-test-reservation'),test_job_id:'fictional-test-job',
  test_receipt_ref:recordRef('fictional-passed-test'),test_receipt_sha256:OTHER,producer_invocation_id:'fictional-generation-invocation',
  producer_native_id:'fictional-producer',actual_test_proof_ref:recordRef('fictional-test-proof'),qa_independence_policy_ref:recordRef('fictional-independent-policy')};}
function manifest(){
  const directory=ino=>({dev:'16777231',ino,uid:'501',gid:'20',permissions_octal:'0700',name_binding_sha256:H});
  return {protocol:'issue18-eight-slot-run-v2',schema_version:2,profile_id:DATA_CONTRACT.profile_id,profile_sha256:DATA_CONTRACT.profile_sha256,
    shared_schema_sha256:DATA_CONTRACT.shared_schema_sha256,run_id:'fictional-run',supported_selection_ref:recordRef('fictional-selection'),
    selected_initialization_id:'fictional-initialization',source:source(),original_controls_sha256:'f42e97413de5f5a0998b8064ab5068fbb59c12823081df67dc0eb5c6595e3498',
    predeclared_protocol_sha256:'9e910e30873fa4eba7aac89b650da688c30492fb64d6230c054600af725a3e38',created_at:'2030-01-01T00:00:00Z',expires_at:'2035-01-01T00:00:00Z',
    parent_identity:directory('100'),ledger_identity:directory('101'),ledger_identity_sha256:LEDGER,
    slot_roster:['1-files','1-patches','3-files','3-patches'].flatMap(arm_id=>['engineer','qa'].map(phase=>({arm_id,phase,filename:`slot-${arm_id}-${phase}.json` }))),
    original_controls:{max_native_calls_total:8,generation_per_arm:1,test_per_arm:1,qa_per_arm:1,repairs:0,scope_max_bytes:200000,native_timeout_ms:300000,test_timeout_ms:10000,test_wait_ms:20000},
    capacity:{manifest_bytes_max:32768,slot_bytes_max:16384,per_call_manifest_charge:8192,per_call_B_charge:16384,per_call_A_upper_ceiling:9975424,
      run_upper_evidence_bytes:80000000,issuer_metadata_bytes_max:32768,shared_metadata_bytes_max:65536},
    model_policy_ref:recordRef('fictional-model-policy'),durability_profile_ref:recordRef('fictional-durability'),retention_policy_ref:recordRef('fictional-retention'),
    cold_read_authorizes:false,evidence_schema_sha256:DATA_CONTRACT.A_evidence_schema_sha256};
}
function serialization(text){return {encoding:'exact-shared-call-binding-utf8-v1',text,utf8_bytes:Buffer.byteLength(text),sha256:sha(Buffer.from(text))};}
function fixture(arm_id='1-files',phase='engineer'){
  const encoded=phase==='engineer'&&arm_id.endsWith('files'),canonicalText='FICTIONAL canonical assignment\n',encodingText=encoded?'FICTIONAL selected encoding\n':'';
  const canonical=capturePrompt(canonicalText),encoding=encoded?capturePrompt(encodingText):null,actual=capturePrompt(canonicalText+encodingText);
  // Deliberately nonalphabetical order: B's sorted projection is NOT these bytes.
  const selection={reason:'Fictional DATA; no selected execution.',mode:'explicit',model:'gpt-6.1-sol',effort:phase==='engineer'?'medium':'high',speed:'host_default'};
  const policy={configured_timeout_ms:300000,call_timeout_ms:299000,absolute_deadline_ms:2000000000000,authority_expiry_ms:2000000300000,
    overall_deadline_ms:null,max_output_utf16_units:encoded?200000:2000000,evidence_ceiling_bytes:10000000,cancellation_binding_id:'fictional-signal'};
  policy.policy_sha256=callPolicyHash(JSON.stringify(policy));
  const prerequisite=phase==='qa'?qaPrerequisite():null;
  const binding={protocol:'issue18-call-binding-v1',profile_id:DATA_CONTRACT.profile_id,profile_sha256:DATA_CONTRACT.profile_sha256,
    run_id:'fictional-run',arm_id,phase,store:{root_sha256:H,company_identity_sha256:H,incarnation_sha256:H,physical_layout:'normalized4',lane:'unqualified_legacy'},
    job:{id:'fictional-'+phase+'-job',instance_id:'fictional-'+phase+'-instance',worker_pid:123,owner_epoch:1,preimage_sha256:H,context_sha256:H,role:phase,
      development_id:phase==='engineer'?'fictional-plan':null,review_of:prerequisite?.test_receipt_ref??null,prototype_id:null,retention_repair_id:null,stream_mode:false,continuation_mode:false},
    plan:{id:'fictional-plan',revision:1,record_sha256:H,scope_sha256:H,authorization_sha256:H,source_corpus_sha256:H,
      write_paths:arm_id.startsWith('3')?['module-0.mjs','module-1.mjs','module-2.mjs']:['module-0.mjs'],output_format:arm_id.endsWith('files')?'files':'patches',max_bytes:200000,expires_at:'2035-01-01T00:00:00Z'},
    invocation_id:'fictional-'+phase+'-invocation',source:source(),model:{host:'codex',native_id_requested:null,selection,selection_sha256:sha(Buffer.from(JSON.stringify(selection))),cwd_sha256:H},
    call_policy:policy,codec_mode:encoded?'full_file_chunks_v1':'identity',canonical_prompt_sha256:canonical.blob.ref.sha256,
    encoding_instruction_sha256:encoding?.blob.ref.sha256??null,actual_prompt_sha256:actual.blob.ref.sha256,fixture_sha256:H};
  const run=manifest(),runHash=sha(encodeRunManifest(run)),serial=serialization(JSON.stringify(binding)+'\n');
  const slot={protocol:'issue18-eight-slot-consumption-v2',schema_version:2,record_kind:'consumption_record',run_manifest_sha256:runHash,
    ledger_identity_sha256:LEDGER,slot_commit_id:'fictional-'+arm_id+'-'+phase,prepared_at:'2030-01-01T00:01:00.123456Z',binding:clone(binding),binding_sha256:serial.sha256,
    phase_prerequisite:prerequisite,cold_read_authorizes:false,binding_serialization:serial,
    request_prompts:{canonical:canonical.prompt_ref,encoding_instruction:encoding?.prompt_ref??null,actual:actual.prompt_ref}};
  return {run,binding,slot,context:{run_manifest:run,run_manifest_sha256:runHash,arm_id,phase}};
}
function replaceBinding(f,change){change(f.binding);f.slot.binding=clone(f.binding);f.slot.binding_serialization=serialization(JSON.stringify(f.binding)+'\n');f.slot.binding_sha256=f.slot.binding_serialization.sha256;}

test('exact A2/B pins and finite shared-pool accounting stay distinct from authority',()=>{
  assert.equal(DATA_CONTRACT.B_schema_sha256,'cc751b527a2ce0591c1f4852a13052028598faf0daac0dccb83902ee8c6a7e4d');
  assert.equal(DATA_CONTRACT.A_evidence_schema_sha256,'0846a27387b916b1d95ccace259b990c822a18af179b0e2c8e8f838d26afe522');
  assert.equal(DATA_CONTRACT.scope,'DATA_CONSISTENCY_ONLY_NOT_AUTHORITY');
  assert.equal(DATA_LIMITS.run_bytes+8*DATA_LIMITS.slot_bytes+DATA_LIMITS.issuer_bytes,196608);
  assert.equal(8*(DATA_LIMITS.A_per_call_bytes+DATA_LIMITS.B_slot_bytes+DATA_LIMITS.shared_per_call_bytes),80000000);
  assert.deepEqual(SLOT_ROSTER.map(row=>row.filename),['slot-1-files-engineer.json','slot-1-files-qa.json','slot-1-patches-engineer.json','slot-1-patches-qa.json','slot-3-files-engineer.json','slot-3-files-qa.json','slot-3-patches-engineer.json','slot-3-patches-qa.json']);
});
test('a consistent identity envelope cannot replace an encoded files engineer slot',()=>{
  const f=fixture('1-files','engineer');
  replaceBinding(f,b=>{b.codec_mode='identity';b.encoding_instruction_sha256=null;b.actual_prompt_sha256=b.canonical_prompt_sha256;});
  f.slot.request_prompts.encoding_instruction=null;f.slot.request_prompts.actual=clone(f.slot.request_prompts.canonical);
  rejected(()=>validateSlotRecord(f.slot,f.context),'ISSUE18_DATA_PROFILE_ENCODING_SELECTOR');
});
for(const arm of ['1-files','1-patches','3-files','3-patches'])for(const phase of ['engineer','qa']){
  test('whole closed record and canonical roundtrip: '+arm+'/'+phase,()=>{
    const f=fixture(arm,phase),bytes=encodeSlotRecord(f.slot,f.context),round=JSON.parse(bytes.toString('utf8'));
    assert.deepEqual(validateSlotRecord(round,f.context),validateSlotRecord(f.slot,f.context));
    assert.ok(encodeSlotRecord(round,f.context).equals(bytes));assert.equal(bytes.at(-1),10);assert.equal(bytes.at(-2),125);
    assert.equal(round.binding_serialization.text,f.slot.binding_serialization.text);assert.equal(round.cold_read_authorizes,false);
  });
}
test('RUN encoding is canonical fresh bytes and copied immutable DATA',()=>{
  const run=manifest(),data=validateRunManifest(run),first=encodeRunManifest(run),second=encodeRunManifest(clone(run));
  assert.notEqual(data,run);assert.ok(Object.isFrozen(data)&&Object.isFrozen(data.source)&&Object.isFrozen(data.slot_roster));
  run.run_id='changed';assert.equal(data.run_id,'fictional-run');assert.ok(first.equals(second));assert.equal(first.at(-1),10);
  assert.ok(first.toString().startsWith('{"capacity":'));first[0]=0;assert.equal(second[0],123);
});
test('old A1 Evidence, unknown nested fields and substituted controls are rejected',()=>{
  const old=manifest();old.evidence_schema_sha256='149b7ccc9f38f17fb19de479578eb6694e03cdf2b335ec20d355fab85d7ddc09';rejected(()=>validateRunManifest(old),'ISSUE18_DATA_CONTRACT_PIN');
  const unknown=manifest();unknown.capacity.extra=1;rejected(()=>validateRunManifest(unknown));
  const more=manifest();more.original_controls.repairs=1;rejected(()=>validateRunManifest(more),'ISSUE18_DATA_ORIGINAL_CONTROLS');
  const wrong=manifest();wrong.source.contract_B_manifest_sha256=H;rejected(()=>validateRunManifest(wrong),'ISSUE18_DATA_CONTRACT_PIN');
});
test('the eight fixed ordered keys cannot be omitted, reordered or renamed',()=>{
  const missing=manifest();missing.slot_roster.pop();rejected(()=>validateRunManifest(missing),'ISSUE18_DATA_ROSTER');
  const swapped=manifest();swapped.slot_roster.reverse();rejected(()=>validateRunManifest(swapped),'ISSUE18_DATA_ROSTER');
  const renamed=manifest();renamed.slot_roster[0].filename='retry.json';rejected(()=>validateRunManifest(renamed),'ISSUE18_DATA_ROSTER');
});
test('real calendar validation and microsecond ordering do not normalize invalid dates',()=>{
  const impossible=manifest();impossible.created_at='2100-02-29T00:00:00Z';impossible.expires_at='2101-01-01T00:00:00Z';rejected(()=>validateRunManifest(impossible),'ISSUE18_DATA_TIME');
  const reversed=manifest();reversed.created_at='2030-01-01T00:00:00.000002Z';reversed.expires_at='2030-01-01T00:00:00.000001Z';rejected(()=>validateRunManifest(reversed),'ISSUE18_DATA_TIME_ORDER');
  const leap=manifest();leap.created_at='2032-02-29T00:00:00.000001Z';assert.equal(validateRunManifest(leap).created_at,leap.created_at);
});
test('Proxy and getter inputs are rejected without reading their hooks',()=>{
  let reads=0;const hostile=new Proxy({}, {get(){reads++;throw Error('get');},ownKeys(){reads++;throw Error('keys');},getPrototypeOf(){reads++;throw Error('prototype');}});
  rejected(()=>validateRunManifest(hostile));const nested=manifest();nested.source=hostile;rejected(()=>validateRunManifest(nested));
  const getter=manifest();Object.defineProperty(getter.source,'node_version',{enumerable:true,get(){reads++;return 'node';}});rejected(()=>validateRunManifest(getter));assert.equal(reads,0);
});
test('binding identity uses exact original bytes through B key sorting',()=>{
  const f=fixture(),encoded=encodeSlotRecord(f.slot,f.context),round=JSON.parse(encoded.toString());
  assert.notEqual(JSON.stringify(round.binding.model.selection),JSON.stringify(f.binding.model.selection));
  assert.equal(round.binding_serialization.text,f.slot.binding_serialization.text);
  assert.equal(validateBindingSerialization(round.binding_serialization).sha256,sha(Buffer.from(f.slot.binding_serialization.text)));
  assert.doesNotThrow(()=>validateSlotRecord(round,f.context));
  const shifted=clone(f.slot.binding_serialization);shifted.text+=' ';rejected(()=>validateBindingSerialization(shifted),'ISSUE18_DATA_BINDING_BYTES');
  assert.equal(JSON.parse(encodeBindingSerialization(f.slot.binding_serialization)).text,f.slot.binding_serialization.text);
});
test('duplicate binding keys and altered policy commitments are rejected with correct outer hashes',()=>{
  const f=fixture(),duplicate=f.slot.binding_serialization.text.replace('"run_id":','"run_id":"hidden","run_id":');
  rejected(()=>validateBindingSerialization(serialization(duplicate)));
  replaceBinding(f,b=>{b.call_policy.policy_sha256=H;});rejected(()=>validateSlotRecord(f.slot,f.context),'ISSUE18_DATA_POLICY_HASH');
});
test('strict binding leaf labels reject newline aliases and decoded malformed scalars',()=>{
  const newline=fixture();replaceBinding(newline,b=>{b.job.id+='\n';});rejected(()=>validateBindingSerialization(newline.slot.binding_serialization),'ISSUE18_DATA_LABEL');
  const malformed=fixture();replaceBinding(malformed,b=>{b.model.selection.reason='\ud800';b.model.selection_sha256=sha(Buffer.from(JSON.stringify(b.model.selection)));});
  rejected(()=>validateBindingSerialization(malformed.slot.binding_serialization),'ISSUE18_DATA_STRING');
});
test('canonical whole slot capacity includes escaped exact binding and its projection',()=>{
  const f=fixture(),raw=JSON.stringify(f.binding),padding=15000-Buffer.byteLength(raw);assert.ok(padding>0);
  f.slot.binding_serialization=serialization(' '.repeat(padding)+raw);f.slot.binding_sha256=f.slot.binding_serialization.sha256;
  assert.doesNotThrow(()=>validateBindingSerialization(f.slot.binding_serialization));
  assert.ok(Buffer.byteLength(JSON.stringify(f.slot))+1>16384);rejected(()=>encodeSlotRecord(f.slot,f.context),'ISSUE18_STORAGE_DATA_LIMIT');
});
test('QA prerequisite is closed DATA and retains distinct record/byte hash domains',()=>{
  const value=qaPrerequisite(),checked=validateQAPrerequisite(value);assert.notEqual(checked.candidate_ref.sha256,checked.candidate_sha256);
  assert.notEqual(checked.test_receipt_ref.sha256,checked.test_receipt_sha256);assert.deepEqual(JSON.parse(encodeQAPrerequisite(value)),checked);
  const fake=qaPrerequisite();fake.passed=true;rejected(()=>validateQAPrerequisite(fake),'ISSUE18_DATA_FIELDS');
  const f=fixture('1-files','qa');assert.doesNotThrow(()=>validateSlotRecord(f.slot,f.context));assert.equal(f.slot.cold_read_authorizes,false);
});
test('phase prerequisites and real review association cannot be substituted',()=>{
  const engineer=fixture();engineer.slot.phase_prerequisite=qaPrerequisite();rejected(()=>validateSlotRecord(engineer.slot,engineer.context),'ISSUE18_DATA_ENGINEER_PHASE');
  const qa=fixture('1-files','qa');qa.slot.phase_prerequisite=null;rejected(()=>validateSlotRecord(qa.slot,qa.context));
  const crossed=fixture('1-files','qa');crossed.slot.phase_prerequisite.test_receipt_ref.id='another-test';rejected(()=>validateSlotRecord(crossed.slot,crossed.context),'ISSUE18_DATA_QA_REVIEW');
  const same=fixture('1-files','qa');same.slot.phase_prerequisite.producer_invocation_id=same.binding.invocation_id;rejected(()=>validateSlotRecord(same.slot,same.context),'ISSUE18_DATA_QA_PHASE');
});
test('manifest context joins exact LF bytes and phase rather than caller labels',()=>{
  const f=fixture(),withoutLF={...f.context,run_manifest_sha256:sha(encodeRunManifest(f.run).subarray(0,-1))};
  rejected(()=>validateSlotRecord(f.slot,withoutLF),'ISSUE18_DATA_MANIFEST_BYTES');
  rejected(()=>validateSlotRecord(f.slot,{...f.context,phase:'qa'}),'ISSUE18_DATA_SLOT_KEY');
  const crossed=fixture();replaceBinding(crossed,b=>{b.source.source_generation_sha256=OTHER;});
  rejected(()=>validateSlotRecord(crossed.slot,crossed.context),'ISSUE18_DATA_SOURCE_JOIN');
});
test('identity prompt and concatenation facts remain independent checks',()=>{
  const identity=fixture('1-patches');identity.slot.request_prompts.actual.blob={...identity.slot.request_prompts.actual.blob,sha256:H,object_name:`objects/${H}.blob`};
  replaceBinding(identity,b=>{b.actual_prompt_sha256=H;});rejected(()=>validateSlotRecord(identity.slot,identity.context),'ISSUE18_DATA_IDENTITY_PROMPT');
  const concat=fixture();concat.slot.request_prompts.actual.utf16_units--;rejected(()=>validateSlotRecord(concat.slot,concat.context),'ISSUE18_DATA_PROMPT_CONCATENATION');
});
test('physical identity integers stay exact strings and no validated file authorizes',()=>{
  const bad=manifest();bad.ledger_identity.ino='01';rejected(()=>validateRunManifest(bad),'ISSUE18_DATA_PHYSICAL_INTEGER');
  const large=manifest();large.ledger_identity.ino='18446744073709551615';assert.equal(validateRunManifest(large).ledger_identity.ino,'18446744073709551615');
  const run=manifest();run.cold_read_authorizes=true;rejected(()=>validateRunManifest(run),'ISSUE18_DATA_NO_AUTHORITY');
  const f=fixture();f.slot.authority_claim=true;rejected(()=>validateSlotRecord(f.slot,f.context),'ISSUE18_DATA_FIELDS');
  const negativeZero=manifest();negativeZero.original_controls.repairs=-0;rejected(()=>validateRunManifest(negativeZero),'ISSUE18_DATA_NUMBER');
});
