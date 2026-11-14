// Opt-in trusted model seam only. No tool, scope format, default, spawn or grant
// is added. The model must emit every write-path postimage byte in ONE call.
import {createHash} from 'node:crypto';
import {runModel} from './adapters.mjs';

export const FULL_FILE_OUTPUT_PROTOCOL='full-file-output-chunks-v1';
export const FULL_FILE_INPUT_CODEC='full-file-input-codec-v1';
const digest=text=>createHash('sha256').update(text).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const fail=(code,message=code)=>{throw Object.assign(Error(message),{code});};
const closed=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('FULL_FILE_SHAPE');return value;};
const valid=text=>typeof text==='string'&&!text.includes('\0')&&Buffer.from(text).toString('utf8')===text;
const label=value=>{if(typeof value!=='string'||!value.trim()||value.length>200)fail('FULL_FILE_BINDING');return value;};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function paths(input){
  if(!Array.isArray(input)||!input.length||input.length>32)fail('FULL_FILE_PATHS');
  const values=input.map(p=>{if(typeof p!=='string'||p.length>180||p.split('/').some(x=>!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(x)||x.endsWith('.')||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x)||/^(AGENTS|CLAUDE)\.md$/i.test(x)))fail('FULL_FILE_PATHS');return p;}).sort();
  if(new Set(values.map(p=>p.toLowerCase())).size!==values.length)fail('FULL_FILE_PATHS');return values;
}
function limits(input,maxBytes){
  closed(input,['chunk_bytes','frames','prompt_bytes','prompt_characters','evidence_bytes','wire_bytes']);
  const out={chunk_bytes:8192,frames:2048,prompt_bytes:2000000,prompt_characters:2000000,evidence_bytes:10000000,wire_bytes:maxBytes,...input};
  for(const n of Object.values(out))if(!Number.isSafeInteger(n)||n<1||n>20000000)fail('FULL_FILE_LIMIT');
  if(out.chunk_bytes>65536||out.frames>10000||out.wire_bytes>maxBytes)fail('FULL_FILE_LIMIT');return out;
}
function validatedBinding(input){
  closed(input,['job_id','instance_id','plan_id','scope_sha256','write_paths','max_bytes']);
  const bound=clone(input);for(const k of ['job_id','instance_id','plan_id'])label(bound[k]);
  if(!/^[a-f0-9]{64}$/.test(bound.scope_sha256)||!Number.isSafeInteger(bound.max_bytes)||bound.max_bytes<1000||bound.max_bytes>1000000)fail('FULL_FILE_BINDING');bound.write_paths=paths(bound.write_paths);
  return bound;
}
// The pure API accepts DATA, never caller callbacks, accessors or class instances.
// JavaScript reflection cannot authenticate a Proxy; the returned DATA grants no
// authority and a future owning worker must recompute it for its actual subject.
function copyData(value,seen=new Set(),depth=0){
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
  if(!value||typeof value!=='object'||seen.has(value)||depth>32)fail('FULL_FILE_DATA');
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if(prototype!==(array?Array.prototype:Object.prototype)&&!(prototype===null&&!array))fail('FULL_FILE_DATA');
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
  if(keys.some(k=>typeof k!=='string'||!Object.hasOwn(descriptors[k],'value')||!descriptors[k].enumerable&&!(array&&k==='length')))fail('FULL_FILE_DATA');
  seen.add(value);let result;
  if(array){
    const length=descriptors.length.value;
    if(keys.length!==length+1||keys.some(k=>k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=length)))fail('FULL_FILE_DATA');
    result=Array.from({length},(_,i)=>copyData(descriptors[i].value,seen,depth+1));
  }else result=Object.fromEntries(keys.map(k=>[k,copyData(descriptors[k].value,seen,depth+1)]));
  seen.delete(value);return result;
}
function sameData(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const left=Object.keys(a).sort(),right=Object.keys(b).sort();
  return left.length===right.length&&left.every((k,i)=>k===right[i]&&sameData(a[k],b[k]));
}
const measure=text=>({sha256:digest(text),utf8_bytes:Buffer.byteLength(text),utf16_characters:text.length});
// Strict JSON envelope: duplicate keys cannot hide a competing output/identity.
function parse(text){
  if(!valid(text))fail('FULL_FILE_UNICODE');let depth=0;const stack=[];
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      const start=i++;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"')break;}
      let value;try{value=JSON.parse(text.slice(start,i+1));}catch{fail('FULL_FILE_JSON');}
      if(!valid(value))fail('FULL_FILE_UNICODE');const top=stack.at(-1);
      if(top?.object&&top.key){if(top.keys.has(value))fail('FULL_FILE_DUPLICATE_KEY');top.keys.add(value);top.key=false;}
    }else if(c==='{'||c==='['){if(++depth>32)fail('FULL_FILE_DEPTH');stack.push({object:c==='{',key:c==='{',keys:new Set()});}
    else if(c==='}'||c===']'){depth--;stack.pop();}
    else if(c===','&&stack.at(-1)?.object)stack.at(-1).key=true;
  }
  try{return JSON.parse(text);}catch{fail('FULL_FILE_JSON');}
}

/** Assemble emitted strings only. There is deliberately no source/base reader,
 * reference-copy instruction, patch decoder, declared hash or size completion.
 * Sequence/end validation is syntactic; tests/QA still judge the whole bytes. */
export function assembleFullFileOutput(raw,{write_paths,max_bytes,limits:input={}}){
  if(!Number.isSafeInteger(max_bytes)||max_bytes<1000||max_bytes>1000000)fail('FULL_FILE_LIMIT');
  const expected=paths(write_paths),cap=limits(input,max_bytes);
  if(!valid(raw))fail('FULL_FILE_UNICODE');if(Buffer.byteLength(raw)>cap.wire_bytes)fail('FULL_FILE_WIRE_LIMIT');
  const envelope=closed(parse(raw),['content','messages','notices','full_file_output']);
  if(typeof envelope.content!=='string'||!envelope.content.trim()||!Array.isArray(envelope.messages)||!Array.isArray(envelope.notices))fail('FULL_FILE_SHAPE');
  const stream=closed(envelope.full_file_output,['protocol','frames']);
  if(stream.protocol!==FULL_FILE_OUTPUT_PROTOCOL||!Array.isArray(stream.frames)||!stream.frames.length||stream.frames.length>cap.frames)fail('FULL_FILE_FRAMES');
  const files=[],ranges=[];let current=null,total=0,ended=false;
  for(let seq=0;seq<stream.frames.length;seq++){
    const f=closed(stream.frames[seq],['seq','type','path','text']);
    if(!Number.isSafeInteger(f.seq)||f.seq!==seq||ended)fail('FULL_FILE_SEQUENCE');
    if(f.type==='file_start'){
      if(Object.keys(f).length!==3||current||f.path!==expected[files.length])fail('FULL_FILE_FILE_ORDER');current={path:f.path,content:''};
    }else if(f.type==='chunk'){
      if(Object.keys(f).length!==4||!current||f.path!==current.path||!valid(f.text)||!f.text.length)fail('FULL_FILE_CHUNK');
      const n=Buffer.byteLength(f.text);if(n>cap.chunk_bytes||total+n>max_bytes)fail('FULL_FILE_BODY_LIMIT');
      ranges.push({seq,path:f.path,offset_utf16:current.content.length,offset_utf8:Buffer.byteLength(current.content),utf16_characters:f.text.length,utf8_bytes:n,sha256:digest(f.text)});
      current.content+=f.text;total+=n;
    }else if(f.type==='file_end'){
      if(Object.keys(f).length!==3||!current||f.path!==current.path)fail('FULL_FILE_FILE_ORDER');files.push(current);current=null;
    }else if(f.type==='output_end'){
      if(Object.keys(f).length!==2||current||files.length!==expected.length||seq!==stream.frames.length-1)fail('FULL_FILE_INCOMPLETE');ended=true;
    }else fail('FULL_FILE_FRAME_TYPE');
  }
  if(!ended||current||files.length!==expected.length)fail('FULL_FILE_INCOMPLETE');
  if(bytes(files)>max_bytes)fail('FULL_FILE_CANDIDATE_LIMIT');
  return {artifact:{content:envelope.content,messages:envelope.messages,notices:envelope.notices,files},accounting:{wire_utf8_bytes:Buffer.byteLength(raw),wire_utf16_characters:raw.length,wire_sha256:digest(raw),emitted_body_utf8_bytes:total,files_JSON_utf8_bytes:bytes(files),files_sha256:digest(JSON.stringify(files)),frames:stream.frames.length,ranges,semantic_full_byte_fidelity:'UNVERIFIED_REQUIRES_TASK_TESTS_AND_INDEPENDENT_QA'}};
}

function instruction(binding,cap){return `\nHOST-SELECTED FULL-FILE OUTPUT ENCODING (${FULL_FILE_OUTPUT_PROTOCOL}). This changes only the response encoding; the complete canonical assignment and ALL source/task criteria above still apply. In THIS SAME invocation return one JSON object with content,messages,notices and full_file_output:{protocol:"${FULL_FILE_OUTPUT_PROTOCOL}",frames:[...]}. Do not include files, patches, base-copy references or invented hashes. Emit EVERY byte of EACH complete postimage, including unchanged padding, BOM and newlines, exactly once in chunk.text. The runtime cannot fill bytes from sources. Frames have small consecutive seq integers starting0: {seq,type:"file_start",path}, then {seq,type:"chunk",path,text} as needed, then {seq,type:"file_end",path}; finish {seq,type:"output_end"}. File order is ${JSON.stringify(binding.write_paths)}. Each text must contain valid complete Unicode scalars and at most${cap.chunk_bytes} UTF8 bytes; prefer conservatively smaller chunks. The runtime computes all offsets, byte counts and hashes. Empty files use start/end without chunks. No declarations prove fidelity: complete tests and independent QA remain required. At most${cap.frames} frames and${cap.wire_bytes} UTF8 bytes for the ENTIRE raw JSON. No continuation, extra native call, retry or repair. If unable, return the existing blocked envelope honestly instead of partial files.\n`;}

/** Pure preparation only: no clock, files, recorder, invocation or capability.
 * The builder commitment identifies the exact fixed instruction source, not the
 * complete physical module or authority of a supplied job/instance/scope label. */
export function prepareFullFileInput(configuration){
  const data=closed(copyData(configuration),['canonical_prompt','binding','limits']);
  if(!valid(data.canonical_prompt))fail('FULL_FILE_REQUEST');
  const bound=validatedBinding(data.binding),cap=limits(Object.hasOwn(data,'limits')?data.limits:{},bound.max_bytes);
  const encoding=instruction(bound,cap),actual=data.canonical_prompt+encoding;
  if(Buffer.byteLength(actual)>cap.prompt_bytes||actual.length>cap.prompt_characters)fail('FULL_FILE_PROMPT_LIMIT');
  return freeze({protocol:FULL_FILE_OUTPUT_PROTOCOL,codec:{id:FULL_FILE_INPUT_CODEC,instruction_builder_sha256:digest(instruction.toString())},binding:bound,limits:cap,
    canonical_prompt:data.canonical_prompt,canonical_prompt_metrics:measure(data.canonical_prompt),
    encoding_instruction:encoding,encoding_instruction_metrics:measure(encoding),actual_prompt:actual,actual_prompt_metrics:measure(actual)});
}

/** Pure decoding only. Recompute all joins rather than trusting supplied frozen
 * flags/metrics. A consistent prepared value is still untrusted, nonauthority
 * DATA; storage eligibility and real invocation/response provenance live outside. */
export function normalizePreparedFullFileResult(prepared,originalOutputText){
  const data=closed(copyData(prepared),['protocol','codec','binding','limits','canonical_prompt','canonical_prompt_metrics','encoding_instruction','encoding_instruction_metrics','actual_prompt','actual_prompt_metrics']);
  const recomputed=prepareFullFileInput({canonical_prompt:data.canonical_prompt,binding:data.binding,limits:data.limits});
  if(!sameData(data,recomputed))fail('FULL_FILE_PREPARED');
  if(!valid(originalOutputText))fail('FULL_FILE_UNICODE');
  if(Buffer.byteLength(originalOutputText)>recomputed.limits.wire_bytes)fail('FULL_FILE_WIRE_LIMIT');
  const envelope=parse(originalOutputText);
  if(envelope?.blocked){
    closed(envelope,['content','messages','notices','blocked']);
    return freeze({status:'PRODUCER_BLOCKED',original_output_text:originalOutputText,artifact:envelope,accounting:{wire_utf8_bytes:Buffer.byteLength(originalOutputText),wire_utf16_characters:originalOutputText.length,wire_sha256:digest(originalOutputText)}});
  }
  const assembled=assembleFullFileOutput(originalOutputText,{write_paths:recomputed.binding.write_paths,max_bytes:recomputed.binding.max_bytes,limits:recomputed.limits});
  return freeze({status:'ASSEMBLED',...assembled});
}

/** Host-only opt-in for work(root,jobId,model). Default worker/runModel unchanged.
 * record must synchronously retain the ORIGINAL request/response before parse.
 * Injected invoke/record functions are trusted test seams, never authentication. */
export function createFullFileProducer(configuration){
  // Snapshot the clock before unrelated configuration getters. Observable
  // presence and the actual selected clock are disclosures, never authentication.
  const defaultClock=Date.now,clockPresent=Object.hasOwn(configuration,'now')||('now' in configuration);
  const configuredClock=configuration.now,now=configuredClock===undefined?defaultClock:configuredClock;
  const factoryClockInjected=clockPresent||now!==defaultClock;
  const {binding,record,invoke=runModel,limits:input={}}=configuration;
  const bound=validatedBinding(binding);
  if(typeof record!=='function'||typeof invoke!=='function'||typeof now!=='function')fail('FULL_FILE_DEPENDENCY');
  const cap=limits(input,bound.max_bytes);let consumed=false,evidenceBytes=0;
  function retain(event){const item=freeze(clone({binding:bound,...event}));evidenceBytes+=bytes(item);if(evidenceBytes>cap.evidence_bytes)fail('FULL_FILE_EVIDENCE_LIMIT');const result=record(item);if(result!==undefined){if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});fail('FULL_FILE_RECORDER_RESULT');}return item;}
  return async function fullFileProducer(host,native,prompt,cwd,timeout,selection,options={}){
    if(consumed)fail('FULL_FILE_ATTEMPT_CONSUMED');consumed=true;
    if(!valid(prompt)||!Number.isSafeInteger(timeout)||timeout<1000)fail('FULL_FILE_REQUEST');
    const started=now();if(!Number.isSafeInteger(started))fail('FULL_FILE_CLOCK');
    if(options.executionDeadlineAt!==undefined&&(!Number.isSafeInteger(options.executionDeadlineAt)||options.executionDeadlineAt<0))fail('FULL_FILE_DEADLINE');
    const deadline=Math.min(started+timeout,options.executionDeadlineAt??Infinity);
    if(deadline<=started)fail('FULL_FILE_DEADLINE');
    if(options.signal?.aborted)throw options.signal.reason??Error('Cancelled');
    const prepared=prepareFullFileInput({canonical_prompt:prompt,binding:bound,limits:cap}),wirePrompt=prepared.actual_prompt;
    const injectedLifecycle=factoryClockInjected||['spawn','resolveExecutable','now','setTimeout','clearTimeout'].some(k=>Object.hasOwn(options,k));
    retain({stage:'request',host,native_id_requested:native??null,canonical_prompt:prepared.canonical_prompt,canonical_prompt_utf8_bytes:prepared.canonical_prompt_metrics.utf8_bytes,canonical_prompt_utf16_characters:prepared.canonical_prompt_metrics.utf16_characters,canonical_prompt_sha256:prepared.canonical_prompt_metrics.sha256,encoding_instruction:prepared.encoding_instruction,actual_prompt:wirePrompt,actual_prompt_utf8_bytes:prepared.actual_prompt_metrics.utf8_bytes,actual_prompt_utf16_characters:prepared.actual_prompt_metrics.utf16_characters,actual_prompt_sha256:prepared.actual_prompt_metrics.sha256,selection:selection??null,timeout_ms:timeout,absolute_deadline_ms:deadline,factory_clock_injected:factoryClockInjected,injected_lifecycle_dependencies:injectedLifecycle,max_native_calls:1,output_limits:cap,actual_adapter_max_output_characters:Math.min(options.maxOutputCharacters??2000000,Math.max(100000,cap.wire_bytes))});
    if(now()>=deadline)fail('FULL_FILE_DEADLINE');if(options.signal?.aborted)throw options.signal.reason??Error('Cancelled');
    let spawned=0,spawnTiming=null,output;
    try{
      output=await invoke(host,native,wirePrompt,cwd,timeout,selection,{...options,executionDeadlineAt:deadline,maxOutputCharacters:Math.min(options.maxOutputCharacters??2000000,Math.max(100000,cap.wire_bytes)),onSpawn(timing){
        if(++spawned!==1)fail('FULL_FILE_SPAWN_REPLAY');spawnTiming=clone(timing);
        const at=Date.parse(timing?.execution_started_at);if(!Number.isFinite(at)||at<started||at>now()||at>=deadline)fail('FULL_FILE_SPAWN_TIMING');
        const result=options.onSpawn?.(timing);if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});fail('FULL_FILE_SPAWN_TIMING');}
        retain({stage:'spawn',timing:spawnTiming,factory_clock_injected:factoryClockInjected,injected_lifecycle_dependencies:injectedLifecycle});
      }});
      // Existing runModel resolves on its owned close. Injected invocations are
      // explicitly controlled doubles; response-shaped closure labels add none.
      retain({stage:'response',original_model_text:output?.text??null,raw_model_utf8_bytes:typeof output?.text==='string'?Buffer.byteLength(output.text):null,raw_model_utf16_characters:typeof output?.text==='string'?output.text.length:null,raw_model_sha256:typeof output?.text==='string'?digest(output.text):null,native_id_observed:output?.native_id??null,model_evidence:output?.model_evidence??null,spawn_timing:spawnTiming,native_calls:1,spawn_callbacks:spawned,elapsed_ms:now()-started,invoke_kind:invoke===runModel?'existing_runModel_resolves_on_owned_close':'INJECTED_CONTROLLED_INVOKE_NOT_NATIVE_PROOF',factory_clock_injected:factoryClockInjected,injected_lifecycle_dependencies:injectedLifecycle,native_authentication_or_semantic_fidelity_claim:false});
      if(spawned!==1||!output||typeof output.native_id!=='string'||!output.native_id.trim()||native&&output.native_id!==native)fail('FULL_FILE_PROVENANCE');
      if(now()>=deadline)fail('FULL_FILE_DEADLINE');if(options.signal?.aborted)throw options.signal.reason??Error('Cancelled');
      const normalized=normalizePreparedFullFileResult(prepared,output.text);
      if(normalized.status==='PRODUCER_BLOCKED')return {...output,model_evidence:{...(output.model_evidence??{}),full_file_output:{protocol:FULL_FILE_OUTPUT_PROTOCOL,binding:bound,status:'PRODUCER_BLOCKED',raw_model_text:output.text,native_calls:1,elapsed_ms:now()-started,factory_clock_injected:factoryClockInjected,injected_lifecycle_dependencies:injectedLifecycle,evidence_record_utf8_bytes_total:evidenceBytes}}};
      const assembled=clone(normalized);
      const artifactText=JSON.stringify(assembled.artifact);
      const accounting={protocol:FULL_FILE_OUTPUT_PROTOCOL,binding:bound,...assembled.accounting,native_calls:1,spawn_callbacks:1,elapsed_ms:now()-started,actual_prompt_utf8_bytes:Buffer.byteLength(wirePrompt),actual_prompt_utf16_characters:wirePrompt.length,evidence_record_utf8_bytes_before_assembly_record:evidenceBytes,raw_model_text:output.text,raw_model_native_id:output.native_id,underlying_model_evidence:output.model_evidence??null,invoke_kind:invoke===runModel?'existing_runModel':'INJECTED_CONTROLLED_INVOKE',factory_clock_injected:factoryClockInjected,injected_lifecycle_dependencies:injectedLifecycle,native_authentication_or_semantic_fidelity_claim:false};
      retain({stage:'assembled',accounting});
      accounting.evidence_record_utf8_bytes_total=evidenceBytes;
      accounting.elapsed_ms=now()-started;
      if(now()>=deadline)fail('FULL_FILE_DEADLINE');if(options.signal?.aborted)throw options.signal.reason??Error('Cancelled');
      return {...output,text:artifactText,model_evidence:{...(output.model_evidence??{}),full_file_output:accounting}};
    }catch(error){if(output&&error&&typeof error==='object'&&Object.isExtensible(error)&&!error.rejected_output)error.rejected_output=output;throw error;}
  };
}
