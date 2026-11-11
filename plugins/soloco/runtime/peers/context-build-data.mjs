// Pure DATA only. These records issue no owner, process, build or interpreter
// capability. A real original service must verify the referenced bytes and
// durably win the returned CAS BEFORE any await/spawn. This module performs no
// storage, lookup, execution, selection, closure reconciliation or slot writes.
import {createHash} from 'node:crypto';
import {types} from 'node:util';

const inputProtocol='soloco-context-build-input-data-v1';
const outputProtocol='soloco-context-build-output-data-v1';
const intentProtocol='soloco-context-build-intent-data-v1';
const errors=new WeakSet();
function fail(code='BUILD_DATA_SCHEMA') {const e=Object.assign(Error(code),{code});errors.add(e);throw e;}
export const isContextBuildDataError=e=>Boolean(e&&typeof e==='object'&&errors.has(e));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sha=v=>createHash('sha256').update(v).digest('hex');
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
function own(value,keys) {
 if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))fail();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out[k]=d.value;}return out;
}
function pin(value) {const v=own(value,['bytes','sha256']);if(!integer(v.bytes,1)||!hash(v.sha256))fail();return v;}
function epoch(value) {const v=own(value,['owner_sha256','generation']);if(!hash(v.owner_sha256)||!integer(v.generation))fail();return v;}
function canonical(value) {
 const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
 return JSON.stringify(sorted(value))+'\n';
}
function freeze(value) {const todo=[value];while(todo.length){const v=todo.pop();if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))todo.push(x);Object.freeze(v);}}return value;}
const equal=(a,b)=>canonical(a)===canonical(b);
function input(value) {
 const v=own(value,['protocol','owner_epoch','native','node','selection']);if(v.protocol!==inputProtocol)fail();
 const native=own(v.native,['source_package','compiled_manifest','cargo_lock','toolchain_manifest','build_driver']);
 const node=own(v.node,['manifest','executable','codec','resource','profile']);
 return {protocol:inputProtocol,owner_epoch:epoch(v.owner_epoch),native:Object.fromEntries(Object.entries(native).map(([k,p])=>[k,pin(p)])),node:Object.fromEntries(Object.entries(node).map(([k,p])=>[k,pin(p)])),selection:pin(v.selection)};
}
export function formatContextBuildInputData(value) {
 const inputs=input(value),encoded=canonical(inputs),input_key=sha(encoded);
 // The original durable service must UNIQUE(owner_epoch,input_key). Pure DATA
 // cannot prove that a caller actually inserted or won that uniqueness/CAS.
 const intent_key=sha(canonical({protocol:intentProtocol,owner_epoch:inputs.owner_epoch,input_key}));
 return freeze({inputs,input_key,intent_key,encoded,utf8_bytes:Buffer.byteLength(encoded)});
}
function output(value,commitment) {
 const v=own(value,['protocol','result_kind','input_key','intent_key','reservation_sha256','process_sha256','compiled_manifest','node_manifest','executable','build_receipt','recipe','capsule_manifest']);
 if(v.protocol!==outputProtocol||v.result_kind!=='COMPILED_COMPONENT'||!hash(v.reservation_sha256)||!hash(v.process_sha256))fail();
 if(v.input_key!==commitment.input_key||v.intent_key!==commitment.intent_key)fail('BUILD_DATA_SOURCE_MISMATCH');
 const out={...v};for(const k of ['compiled_manifest','node_manifest','executable','build_receipt','recipe','capsule_manifest'])out[k]=pin(v[k]);
 if(!equal(out.compiled_manifest,commitment.inputs.native.compiled_manifest)||!equal(out.node_manifest,commitment.inputs.node.manifest))fail('BUILD_DATA_SOURCE_MISMATCH');
 return out;
}
export function formatContextBuildOutputData(inputs,value) {
 const record=output(value,formatContextBuildInputData(inputs)),encoded=canonical(record);
 // COMPILED_COMPONENT is an inspectable artifact, never qualified runtime
 // support. Unknown domain closure remains held; no claims are released.
 // Raw failed-close DATA stays retainable independently. Record SHA and later
 // journal sequence stay OUTSIDE immutable record bytes.
 return freeze({record,encoded,utf8_bytes:Buffer.byteLength(encoded),sha256:sha(encoded)});
}
export function createContextBuildIntentData(inputs) {
 const c=formatContextBuildInputData(inputs);
 return freeze({protocol:intentProtocol,inputs:c.inputs,input_key:c.input_key,intent_key:c.intent_key,revision:0,phase:'PREPARED',reservation_sha256:null,process_sha256:null,direct_close:null,output:null,selection_sequence:null,unknown_reason:null,domain_closure:'unestablished'});
}
const signals=new Set(['SIGHUP','SIGINT','SIGQUIT','SIGILL','SIGABRT','SIGFPE','SIGKILL','SIGSEGV','SIGPIPE','SIGTERM','SIGBUS']);
function close(value) {
 const v=own(value,['process_sha256','exit_code','signal','error_code']);
 if(!hash(v.process_sha256)||(v.exit_code!==null&&(!Number.isSafeInteger(v.exit_code)||v.exit_code<0||v.exit_code>255))||(v.signal!==null&&!signals.has(v.signal))||![null,'PROCESS_ERROR','OUTPUT_ERROR'].includes(v.error_code))fail();return v;
}
const successful=v=>v.exit_code===0&&v.signal===null&&v.error_code===null;
function intent(value) {
 const v=own(value,['protocol','inputs','input_key','intent_key','revision','phase','reservation_sha256','process_sha256','direct_close','output','selection_sequence','unknown_reason','domain_closure']);
 const c=formatContextBuildInputData(v.inputs);if(v.protocol!==intentProtocol||v.input_key!==c.input_key||v.intent_key!==c.intent_key)fail('BUILD_DATA_SOURCE_MISMATCH');
 if(!integer(v.revision)||typeof v.phase!=='string'||v.domain_closure!=='unestablished')fail();
 const phases={PREPARED:0,SPAWN_RESERVED:1,BORN:2,CLOSED:3,OUTPUT_SEALED:4,OUTPUT_SELECTED:5};
 if(v.phase==='UNKNOWN') {if(![2,3].includes(v.revision)||!['BIRTH_UNOBSERVED','PROCESS_OUTCOME_UNKNOWN','PERSISTENCE_UNKNOWN'].includes(v.unknown_reason))fail();}
 else if(!Object.hasOwn(phases,v.phase)||v.revision!==phases[v.phase]||v.unknown_reason!==null)fail();
 const born=v.phase==='UNKNOWN'?v.revision===3:v.revision>=2,reserved=v.revision>=1;
 if(reserved?!hash(v.reservation_sha256):v.reservation_sha256!==null)fail();
 if(born?!hash(v.process_sha256):v.process_sha256!==null)fail();
 const closed=v.phase!=='UNKNOWN'&&v.revision>=3,sealed=v.phase!=='UNKNOWN'&&v.revision>=4;
 const result={...v,inputs:c.inputs};
 if(closed){result.direct_close=close(v.direct_close);if(result.direct_close.process_sha256!==v.process_sha256)fail('BUILD_DATA_SOURCE_MISMATCH');}else if(v.direct_close!==null)fail();
 if(sealed){result.output=output(v.output,c);if(!successful(result.direct_close)||result.output.reservation_sha256!==v.reservation_sha256||result.output.process_sha256!==v.process_sha256)fail('BUILD_DATA_SOURCE_MISMATCH');}else if(v.output!==null)fail();
 if(v.phase==='OUTPUT_SELECTED'?!integer(v.selection_sequence,1):v.selection_sequence!==null)fail();
 return result;
}
export function advanceContextBuildIntentData(current,change) {
 const before=intent(current),header=own(change,['expected_revision','operation','details']);
 if(header.expected_revision!==before.revision)fail('BUILD_DATA_REPLAY');
 const next={...before,revision:before.revision+1};let d;
 switch(header.operation) {
 case 'reserve-spawn':
  d=own(header.details,['reservation_sha256']);if(before.phase!=='PREPARED'||!hash(d.reservation_sha256))fail('BUILD_DATA_TRANSITION');
  next.phase='SPAWN_RESERVED';next.reservation_sha256=d.reservation_sha256;break;
 case 'observe-birth':
  d=own(header.details,['reservation_sha256','process_sha256']);if(before.phase!=='SPAWN_RESERVED'||d.reservation_sha256!==before.reservation_sha256||!hash(d.process_sha256))fail('BUILD_DATA_TRANSITION');
  next.phase='BORN';next.process_sha256=d.process_sha256;break;
 case 'observe-direct-close':
  d=close(header.details);if(before.phase!=='BORN'||d.process_sha256!==before.process_sha256)fail('BUILD_DATA_TRANSITION');next.phase='CLOSED';next.direct_close=d;break;
 case 'record-unknown':
  d=own(header.details,['reason']);if(!['SPAWN_RESERVED','BORN'].includes(before.phase)||!['BIRTH_UNOBSERVED','PROCESS_OUTCOME_UNKNOWN','PERSISTENCE_UNKNOWN'].includes(d.reason))fail('BUILD_DATA_TRANSITION');next.phase='UNKNOWN';next.unknown_reason=d.reason;break;
 case 'seal-output':
  d=own(header.details,['association']);if(before.phase!=='CLOSED')fail('BUILD_DATA_TRANSITION');if(!successful(before.direct_close))fail('BUILD_DATA_ADVERSE_CLOSE');
  next.phase='OUTPUT_SEALED';next.output=output(d.association,formatContextBuildInputData(before.inputs));if(next.output.reservation_sha256!==before.reservation_sha256||next.output.process_sha256!==before.process_sha256)fail('BUILD_DATA_SOURCE_MISMATCH');break;
 case 'select-output': {
  d=own(header.details,['output_sha256','selection_sequence']);if(before.phase!=='OUTPUT_SEALED'||!integer(d.selection_sequence,1))fail('BUILD_DATA_TRANSITION');
  const expected=formatContextBuildOutputData(before.inputs,before.output).sha256;if(d.output_sha256!==expected)fail('BUILD_DATA_SOURCE_MISMATCH');next.phase='OUTPUT_SELECTED';next.selection_sequence=d.selection_sequence;break;
 }
 default:fail('BUILD_DATA_TRANSITION');
 }
 // This is a compare-and-swap REQUEST, never evidence that storage accepted it.
 // UNKNOWN is terminal here; no API resets/retries/resends or fabricates birth.
 return freeze({compare_and_swap:{intent_key:before.intent_key,input_key:before.input_key,expected_revision:before.revision,expected_sha256:sha(canonical(before))},next:intent(next)});
}
export function inspectContextBuildIntentData(value) {
 const record=intent(value),encoded=canonical(record);
 return freeze({record,encoded,utf8_bytes:Buffer.byteLength(encoded),sha256:sha(encoded)});
}
