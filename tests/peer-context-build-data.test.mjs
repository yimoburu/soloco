import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {formatContextBuildInputData,formatContextBuildOutputData,createContextBuildIntentData,advanceContextBuildIntentData,inspectContextBuildIntentData,isContextBuildDataError} from '../plugins/soloco/runtime/peers/context-build-data.mjs';

// All identities, source digests and process observations below are FICTIONAL
// pure DATA. No compiler, original owner, storage CAS or native fact is invoked.
const digest=v=>createHash('sha256').update(v).digest('hex');
const pin=name=>({bytes:100,sha256:digest(name)});
function inputs(){return {protocol:'soloco-context-build-input-data-v1',owner_epoch:{owner_sha256:digest('fictional-original-owner'),generation:7},native:{source_package:pin('package'),compiled_manifest:pin('rust-inputs'),cargo_lock:pin('lock'),toolchain_manifest:pin('toolchain'),build_driver:pin('driver')},node:{manifest:pin('whole-node-inputs'),executable:pin('node-executable'),codec:pin('codec'),resource:pin('resource'),profile:pin('node-profile')},selection:pin('fixed-selection-forms-entry-target')};}
const step=(current,operation,details)=>advanceContextBuildIntentData(current,{expected_revision:current.revision,operation,details}).next;
function born(i=inputs()){let s=createContextBuildIntentData(i);s=step(s,'reserve-spawn',{reservation_sha256:digest('reservation')});return step(s,'observe-birth',{reservation_sha256:s.reservation_sha256,process_sha256:digest('original-process')});}
function closed(i=inputs(),extra={}){const s=born(i);return step(s,'observe-direct-close',{process_sha256:s.process_sha256,exit_code:0,signal:null,error_code:null,...extra});}
function association(i=inputs()){const c=formatContextBuildInputData(i);return {protocol:'soloco-context-build-output-data-v1',result_kind:'COMPILED_COMPONENT',input_key:c.input_key,intent_key:c.intent_key,reservation_sha256:digest('reservation'),process_sha256:digest('original-process'),compiled_manifest:i.native.compiled_manifest,node_manifest:i.node.manifest,executable:pin('new-compiled-binary'),build_receipt:pin('actual-later-build-receipt'),recipe:pin('external-outer-recipe'),capsule_manifest:pin('sealed-capsule')};}
const copy=v=>JSON.parse(JSON.stringify(v));
const error=code=>e=>isContextBuildDataError(e)&&e.code===code;

test('input keys use exact complete closed pins and are independent of object key order',()=>{
 const i=inputs(),a=formatContextBuildInputData(i),reordered=Object.fromEntries(Object.entries(i).reverse());
 assert.equal(a.input_key,digest(a.encoded));assert.equal(a.utf8_bytes,Buffer.byteLength(a.encoded));assert.deepEqual(formatContextBuildInputData(reordered),a);
 const changed=copy(i);changed.native.compiled_manifest.bytes++;assert.notEqual(formatContextBuildInputData(changed).input_key,a.input_key);
});
test('owner generation and each source relation change the unique intent key',()=>{
 const i=inputs(),a=formatContextBuildInputData(i);
 for(const update of [v=>v.owner_epoch.generation++,v=>v.owner_epoch.owner_sha256=digest('foreign-owner'),v=>v.native.source_package=pin('different-package'),v=>v.node.manifest=pin('different-node'),v=>v.selection=pin('different-form')]){const b=copy(i);update(b);assert.notEqual(formatContextBuildInputData(b).intent_key,a.intent_key);}
});
test('input/output schemas reject self hashes, later output fields and caller ready labels',()=>{
 for(const field of ['output_sha256','recipe','ready','authenticated']){const i=inputs();i[field]=field;assert.throws(()=>formatContextBuildInputData(i),error('BUILD_DATA_SCHEMA'));}
 const a=association();a.sha256=digest('self');assert.throws(()=>formatContextBuildOutputData(inputs(),a),error('BUILD_DATA_SCHEMA'));
});
test('plain closed input pins reject accessors and proxies without executing them',()=>{
 let hits=0;const i=inputs();Object.defineProperty(i.node,'manifest',{enumerable:true,get(){hits++;throw Error('must not run');}});assert.throws(()=>formatContextBuildInputData(i),error('BUILD_DATA_SCHEMA'));assert.equal(hits,0);
 const p=new Proxy(inputs(),{ownKeys(){hits++;throw Error('must not run');}});assert.throws(()=>formatContextBuildInputData(p),error('BUILD_DATA_SCHEMA'));assert.equal(hits,0);
});
test('later recipe and binary commitments do not feed back into input bytes',()=>{
 const i=inputs(),before=formatContextBuildInputData(i),a=formatContextBuildOutputData(i,association(i)),changed=association(i);changed.executable=pin('different-later-binary');changed.recipe=pin('different-later-recipe');const b=formatContextBuildOutputData(i,changed);
 assert.notEqual(a.sha256,b.sha256);assert.deepEqual(formatContextBuildInputData(i),before);assert.equal(a.sha256,digest(a.encoded));assert.equal(a.encoded.includes('"sha256":"'+a.sha256+'"'),false);assert.equal(before.encoded.includes(a.sha256),false);
});
test('wrong input, manifest or owner cannot be described as this output association',()=>{
 const i=inputs();for(const update of [v=>v.input_key=digest('foreign-input'),v=>v.intent_key=digest('foreign-intent'),v=>v.compiled_manifest=pin('foreign-rust'),v=>v.node_manifest=pin('foreign-node')]){const a=association(i);update(a);assert.throws(()=>formatContextBuildOutputData(i,a),error('BUILD_DATA_SOURCE_MISMATCH'));}
 const foreign=copy(i);foreign.owner_epoch.generation++;assert.throws(()=>formatContextBuildOutputData(foreign,association(i)),error('BUILD_DATA_SOURCE_MISMATCH'));
});
test('duplicate prepare returns one deterministic intent and reserve only requests durable CAS',()=>{
 const a=createContextBuildIntentData(inputs()),b=createContextBuildIntentData(inputs());assert.deepEqual(a,b);
 const d={reservation_sha256:digest('reservation')},request=advanceContextBuildIntentData(a,{expected_revision:0,operation:'reserve-spawn',details:d});
 assert.equal(request.compare_and_swap.intent_key,a.intent_key);assert.equal(request.compare_and_swap.expected_revision,0);assert.equal(request.next.phase,'SPAWN_RESERVED');assert.equal(request.compare_and_swap.expected_sha256,inspectContextBuildIntentData(a).sha256);
 // Reformatting identical DATA is not a second CAS success or physical action.
 assert.deepEqual(advanceContextBuildIntentData(b,{expected_revision:0,operation:'reserve-spawn',details:d}),request);
});
test('stale reserve/replayed birth and out-of-order close are rejected against advanced state',()=>{
 const a=createContextBuildIntentData(inputs()),reserved=step(a,'reserve-spawn',{reservation_sha256:digest('reservation')});
 assert.throws(()=>advanceContextBuildIntentData(reserved,{expected_revision:0,operation:'reserve-spawn',details:{reservation_sha256:digest('again')}}),error('BUILD_DATA_REPLAY'));
 assert.throws(()=>step(reserved,'reserve-spawn',{reservation_sha256:digest('again')}),error('BUILD_DATA_TRANSITION'));
 assert.throws(()=>step(a,'observe-direct-close',{process_sha256:digest('original-process'),exit_code:0,signal:null,error_code:null}),error('BUILD_DATA_TRANSITION'));
 const running=born();assert.throws(()=>step(running,'observe-birth',{reservation_sha256:running.reservation_sha256,process_sha256:running.process_sha256}),error('BUILD_DATA_TRANSITION'));
});
test('a foreign reservation or process cannot supply birth, close or output for the intent',()=>{
 const a=createContextBuildIntentData(inputs()),r=step(a,'reserve-spawn',{reservation_sha256:digest('reservation')});
 assert.throws(()=>step(r,'observe-birth',{reservation_sha256:digest('foreign-reservation'),process_sha256:digest('original-process')}),error('BUILD_DATA_TRANSITION'));
 assert.throws(()=>step(born(),'observe-direct-close',{process_sha256:digest('foreign-process'),exit_code:0,signal:null,error_code:null}),error('BUILD_DATA_TRANSITION'));
 const wrong=association();wrong.reservation_sha256=digest('foreign-reservation');assert.throws(()=>step(closed(),'seal-output',{association:wrong}),error('BUILD_DATA_SOURCE_MISMATCH'));
});
test('unknown post-reservation or post-birth outcomes are retained terminal without restart',()=>{
 for(const s of [step(createContextBuildIntentData(inputs()),'reserve-spawn',{reservation_sha256:digest('reservation')}),born()]){
  const u=step(s,'record-unknown',{reason:s.phase==='BORN'?'PROCESS_OUTCOME_UNKNOWN':'BIRTH_UNOBSERVED'});assert.equal(u.phase,'UNKNOWN');assert.equal(u.reservation_sha256,s.reservation_sha256);assert.equal(u.process_sha256,s.process_sha256);assert.equal(u.domain_closure,'unestablished');
  for(const [op,d] of [['reserve-spawn',{reservation_sha256:digest('again')}],['seal-output',{association:association()}],['observe-birth',{reservation_sha256:u.reservation_sha256,process_sha256:digest('late')}]] )assert.throws(()=>step(u,op,d),error('BUILD_DATA_TRANSITION'));
 }
});
test('adverse close DATA remain inspectable but cannot seal a successful compiled component',()=>{
 for(const adverse of [{exit_code:1},{exit_code:null,signal:'SIGKILL'},{exit_code:null},{error_code:'PROCESS_ERROR'}]){const c=closed(inputs(),adverse);assert.deepEqual(inspectContextBuildIntentData(c).record.direct_close,c.direct_close);assert.equal(c.domain_closure,'unestablished');assert.throws(()=>step(c,'seal-output',{association:association()}),error('BUILD_DATA_ADVERSE_CLOSE'));}
});
test('successful direct close can describe sealed then selected output without asserting whole-domain closure',()=>{
 const i=inputs(),c=closed(i),sealed=step(c,'seal-output',{association:association(i)}),output=formatContextBuildOutputData(i,sealed.output),selected=step(sealed,'select-output',{output_sha256:output.sha256,selection_sequence:19});
 assert.equal(selected.phase,'OUTPUT_SELECTED');assert.equal(selected.output.result_kind,'COMPILED_COMPONENT');assert.equal(selected.selection_sequence,19);assert.equal(selected.domain_closure,'unestablished');assert.equal(Object.hasOwn(output.record,'selection_sequence'),false);assert.equal(Object.hasOwn(output.record,'sha256'),false);assert.ok(Object.isFrozen(selected.output.executable));
 assert.throws(()=>step(selected,'reserve-spawn',{reservation_sha256:digest('again')}),error('BUILD_DATA_TRANSITION'));
});
test('selection rejects an unsealed, foreign or modified output commitment',()=>{
 const c=closed(),s=step(c,'seal-output',{association:association()});assert.throws(()=>step(c,'select-output',{output_sha256:digest('fake'),selection_sequence:1}),error('BUILD_DATA_TRANSITION'));
 assert.throws(()=>step(s,'select-output',{output_sha256:digest('fake'),selection_sequence:1}),error('BUILD_DATA_SOURCE_MISMATCH'));
 assert.throws(()=>step(s,'select-output',{output_sha256:formatContextBuildOutputData(inputs(),s.output).sha256,selection_sequence:0}),error('BUILD_DATA_TRANSITION'));
});
test('only source-created finite DATA errors have the private marker',()=>{
 assert.equal(isContextBuildDataError(Object.assign(Error('BUILD_DATA_SCHEMA'),{code:'BUILD_DATA_SCHEMA'})),false);
 const a=inputs();a.node.manifest.bytes=Infinity;assert.throws(()=>formatContextBuildInputData(a),e=>isContextBuildDataError(e)&&e.code==='BUILD_DATA_SCHEMA');
});

test('component artifacts with unknown domain closure cannot be labelled qualified runtime outputs',()=>{
 const i=inputs();for(const kind of ['NATIVE_QUALIFIED','QUALIFIED_RUNTIME_OUTPUT','ACTIVE_INTERPRETER']){const a=association(i);a.result_kind=kind;assert.throws(()=>formatContextBuildOutputData(i,a),error('BUILD_DATA_SCHEMA'));}
 const component=formatContextBuildOutputData(i,association(i));assert.equal(component.record.result_kind,'COMPILED_COMPONENT');assert.equal(Object.hasOwn(component.record,'native_qualified'),false);assert.equal(Object.hasOwn(component.record,'closure_confirmed'),false);assert.equal(closed(i).domain_closure,'unestablished');
});
