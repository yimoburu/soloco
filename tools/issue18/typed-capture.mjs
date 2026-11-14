// Pure prepared DATA/byte relationships for frozen issue18 contract A-v2.
// No IO, clock, adapter, Store, issuer, durability/currentness or authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';

export const CONTRACT = Object.freeze({
  manifest_sha256:'6016550e2052de17c001b40d60a99bb42ea52f0a3c4941a429b2f4504d9d8a03',
  profile_sha256:'11174e64cd21ec21d3f420cb48ff3fcbbc82f1e9d462880beedffdb8ccd2ace7',
  evidence_schema_sha256:'0846a27387b916b1d95ccace259b990c822a18af179b0e2c8e8f838d26afe522'
});
const UTF8='utf8-scalar-text-v1',UTF16='js-utf16le-code-units-v1',JSON_BYTES='closed-json-utf8-v1';
const ENCODINGS=new Set([UTF8,UTF16,JSON_BYTES]);
const blobs=new WeakMap(),thrownValues=new WeakMap();
const typedPrototype=Object.getPrototypeOf(Uint8Array.prototype);
const byteLength=Object.getOwnPropertyDescriptor(typedPrototype,'byteLength').get;
const arrayBuffer=Object.getOwnPropertyDescriptor(typedPrototype,'buffer').get;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const has=(v,k)=>Object.hasOwn(v,k);
const fail=code=>{const e=new TypeError('ISSUE18_CAPTURE_'+code);e.code='ISSUE18_CAPTURE_'+code;throw e;};
const need=(ok,code)=>{if(!ok)fail(code);};
const integer=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};

function options(value,allowed){
  if(value===undefined)return Object.create(null);
  need(value&&typeof value==='object'&&!types.isProxy(value),'OPTIONS');
  const proto=Object.getPrototypeOf(value);
  need(proto===Object.prototype||proto===null,'OPTIONS');
  const descriptors=Object.getOwnPropertyDescriptors(value),out=Object.create(null);
  need(Reflect.ownKeys(descriptors).every(k=>typeof k==='string'&&allowed.includes(k)),'OPTIONS');
  for(const [k,d] of Object.entries(descriptors)){need(has(d,'value'),'OPTIONS_ACCESSOR');out[k]=d.value;}
  return out;
}
function limit(value,fallback,max){const n=value===undefined?fallback:value;need(integer(n,0,max),'LIMIT');return n;}
function textFacts(text){
  let wellFormed=true,nul=false;
  for(let i=0;i<text.length;i++){
    const u=text.charCodeAt(i);if(u===0)nul=true;
    if(u>=0xd800&&u<=0xdbff){const next=text.charCodeAt(i+1);if(next>=0xdc00&&next<=0xdfff)i++;else wellFormed=false;}
    else if(u>=0xdc00&&u<=0xdfff)wellFormed=false;
  }
  return {wellFormed,nul};
}
function primitiveText(text,maxUnits){need(typeof text==='string','TEXT');need(text.length<=maxUnits,'TEXT_LIMIT');return text;}
function scalarText(text,maxUnits){primitiveText(text,maxUnits);const f=textFacts(text);need(f.wellFormed&&!f.nul,'PROMPT_UNICODE');return text;}
function copiedBytes(input,max){
  need(!types.isProxy(input)&&types.isUint8Array(input),'BYTES');
  const n=Reflect.apply(byteLength,input,[]),buffer=Reflect.apply(arrayBuffer,input,[]);
  need(!types.isSharedArrayBuffer(buffer),'SHARED_BYTES');need(integer(n,0,max),'BYTE_LIMIT');
  const out=Buffer.alloc(n);for(let i=0;i<n;i++)out[i]=input[i];return out;
}
function ownBlob(bytes,encoding){
  need(ENCODINGS.has(encoding),'ENCODING');
  const sha256=hash(bytes),ref=freeze({sha256,bytes:bytes.length,encoding,object_name:`objects/${sha256}.blob`});
  const handle=Object.freeze({ref});blobs.set(handle,{bytes,ref});return handle;
}
function owned(handle){const b=blobs.get(handle);need(b,'LOCAL_BLOB');return b;}

/** A local handle owns bytes only; it is not a persistence or execution loan. */
export function captureBytes(input,encoding,configuration){
  const o=options(configuration,['max_bytes']),cap=limit(o.max_bytes,9975424,9975424);
  const bytes=copiedBytes(input,cap);checkDomain(bytes,encoding);return ownBlob(bytes,encoding);
}
export function copyBlobBytes(handle){return Buffer.from(owned(handle).bytes);}
export function verifyBlob(input,ref){
  const b=copiedBytes(input,9975424),r=options(ref,['sha256','bytes','encoding','object_name']);
  need(Object.keys(r).length===4&&ENCODINGS.has(r.encoding),'BLOB_REF');
  need(r.bytes===b.length&&r.sha256===hash(b)&&r.object_name===`objects/${r.sha256}.blob`,'BLOB_REF');
  checkDomain(b,r.encoding);
  return freeze({...r});
}

export function capturePrompt(text,configuration){
  const o=options(configuration,['max_utf16_units','max_utf8_bytes','max_evidence_bytes']);
  const units=limit(o.max_utf16_units,2000000,2000000),wire=limit(o.max_utf8_bytes,2000000,2000000),evidence=limit(o.max_evidence_bytes,9975424,9975424);
  scalarText(text,units);const n=Buffer.byteLength(text,'utf8');need(n<=wire&&n<=evidence,'PROMPT_LIMIT');
  const blob=ownBlob(Buffer.from(text,'utf8'),UTF8);
  return freeze({blob,prompt_ref:{blob:blob.ref,utf16_units:text.length,utf8_bytes:n,unicode_well_formed:true,contains_nul:false},scope:'PREPARED_DATA_ONLY'});
}
function rawCapture(text,configuration,partial){
  const o=options(configuration,['max_utf16_units','max_evidence_bytes','original_units_observed']);
  const units=limit(o.max_utf16_units,2000000,2000000),evidence=limit(o.max_evidence_bytes,9975424,9975424);
  primitiveText(text,units);need(text.length*2<=evidence,'EVIDENCE_LIMIT');
  const original=partial?(o.original_units_observed===undefined?null:o.original_units_observed):text.length;
  need(original===null||integer(original,text.length),'ORIGINAL_UNITS');
  if(!partial&&o.original_units_observed!==undefined)need(o.original_units_observed===text.length,'ORIGINAL_UNITS');
  const bytes=Buffer.alloc(text.length*2);for(let i=0;i<text.length;i++)bytes.writeUInt16LE(text.charCodeAt(i),i*2);
  const blob=ownBlob(bytes,UTF16),f=textFacts(text),utf8=Buffer.from(text,'utf8');
  const raw={state:partial?'partial':'complete',original_units_observed:original,retained_units:text.length,lossless_blob:blob.ref,
    utf8_measurement:{bytes:utf8.length,sha256:hash(utf8),encoding_semantics:f.wellFormed?'exact_scalar_utf8':'replacement_encoding_not_original_wire'},
    unicode_well_formed:f.wellFormed,contains_nul:f.nul,reason:partial?'adapter_supplied_partial_text':'whole_returned_value',
    provider_answer_completeness:'not_established',lower_cli_transport:{status:'not_captured',bytes:null,sha256:null}};
  return freeze({blob,raw_capture:raw,scope:'PREPARED_DATA_ONLY'});
}
export const captureRawText=(text,configuration)=>rawCapture(text,configuration,false);
/** Prefix is explicit input. This never truncates a supplied whole response. */
export const captureRawPrefix=(prefix,configuration)=>rawCapture(prefix,configuration,true);
export function unavailableCapture(originalUnits=null){
  need(originalUnits===null||integer(originalUnits),'ORIGINAL_UNITS');
  return freeze({state:'unavailable',original_units_observed:originalUnits,retained_units:0,lossless_blob:null,utf8_measurement:null,
    unicode_well_formed:null,contains_nul:null,reason:'no_text_available',provider_answer_completeness:'not_established',
    lower_cli_transport:{status:'not_captured',bytes:null,sha256:null}});
}

// No instanceof, getter, cause, Proxy, JSON, toString or diagnostic inspection.
export function keepThrownValue(value){const h=Object.freeze({scope:'LOCAL_VALUE_ONLY'});thrownValues.set(h,value);return h;}
export function readThrownValue(handle){need(thrownValues.has(handle),'LOCAL_THROWN_VALUE');return thrownValues.get(handle);}

function parseData(text,maxBytes){
  scalarText(text,maxBytes);need(Buffer.byteLength(text,'utf8')<=maxBytes,'JSON_LIMIT');
  const stack=[];
  try{
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){
        const start=i++;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"')break;}
        const token=JSON.parse(text.slice(start,i+1)),top=stack.at(-1);
        if(top?.object&&top.key){need(!top.keys.has(token),'DUPLICATE_KEY');top.keys.add(token);top.key=false;}
      }else if(c==='{'||c==='['){need(stack.length<32,'JSON_DEPTH');stack.push({object:c==='{',key:c==='{',keys:new Set()});}
      else if(c==='}'||c===']')stack.pop();
      else if(c===','&&stack.at(-1)?.object)stack.at(-1).key=true;
    }
    return JSON.parse(text);
  }catch(error){if(error?.code?.startsWith('ISSUE18_CAPTURE_'))throw error;fail('JSON');}
}
function canonical(v){
  if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
  if(typeof v==='number'){need(Number.isSafeInteger(v),'JSON_NUMBER');return JSON.stringify(v);}
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
export function captureCanonicalData(serialized){
  const data=parseData(serialized,32768),bytes=Buffer.from(canonical(data),'utf8');
  return ownBlob(bytes,JSON_BYTES);
}

// Frozen A2 structural projection follows. Relational checks below are separate.
const SHAPES = {
  shared: {
    "Hash": {"type":"string","pattern":"^[a-f0-9]{64}$"},
    "Label": {"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},
    "Time": {"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$"},
    "SafeInteger": {"type":"integer","minimum":0,"maximum":9007199254740991},
    "StoreBinding": {"type":"object","properties":{"root_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"company_identity_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"incarnation_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"physical_layout":{"enum":["raw0","normalized4"]},"lane":{"enum":["original","unqualified_legacy"]}},"required":["root_sha256","company_identity_sha256","incarnation_sha256","physical_layout","lane"],"additionalProperties":false},
    "RecordRef": {"type":"object","properties":{"id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["id","revision","sha256"],"additionalProperties":false},
    "JobBinding": {"type":"object","properties":{"id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"instance_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"worker_pid":{"type":"integer","minimum":1,"maximum":9007199254740991},"owner_epoch":{"type":"integer","minimum":1,"maximum":9007199254740991},"preimage_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"context_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"role":{"enum":["engineer","qa"]},"development_id":{"oneOf":[{"type":"null"},{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"}]},"review_of":{"oneOf":[{"type":"null"},{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/RecordRef"}]},"prototype_id":{"const":null},"retention_repair_id":{"const":null},"stream_mode":{"const":false},"continuation_mode":{"const":false}},"required":["id","instance_id","worker_pid","owner_epoch","preimage_sha256","context_sha256","role","development_id","review_of","prototype_id","retention_repair_id","stream_mode","continuation_mode"],"additionalProperties":false},
    "PlanBinding": {"type":"object","properties":{"id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"record_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"scope_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"authorization_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"source_corpus_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"write_paths":{"type":"array","items":{"type":"string","pattern":"^module-[0-2]\\.mjs$"},"minItems":1,"maxItems":3,"uniqueItems":true},"output_format":{"enum":["files","patches"]},"max_bytes":{"const":200000},"expires_at":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$"}},"required":["id","revision","record_sha256","scope_sha256","authorization_sha256","source_corpus_sha256","write_paths","output_format","max_bytes","expires_at"],"additionalProperties":false},
    "SourceBinding": {"type":"object","properties":{"source_generation_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"source_manifest_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"git_head":{"type":"string","pattern":"^[a-f0-9]{40}$"},"git_tree":{"type":"string","pattern":"^[a-f0-9]{40}$"},"node_executable_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"node_version":{"type":"string","maxLength":64},"contract_A_manifest_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"contract_B_manifest_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"frozen_E3_component_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"codec_module_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["source_generation_sha256","source_manifest_sha256","git_head","git_tree","node_executable_sha256","node_version","contract_A_manifest_sha256","contract_B_manifest_sha256","frozen_E3_component_sha256","codec_module_sha256"],"additionalProperties":false},
    "ModelBinding": {"type":"object","properties":{"host":{"const":"codex"},"native_id_requested":{"const":null},"selection":{"type":"object","properties":{"mode":{"const":"explicit"},"model":{"const":"gpt-6.1-sol"},"effort":{"enum":["medium","high"]},"speed":{"const":"host_default"},"reason":{"type":"string","minLength":1,"maxLength":1000}},"required":["mode","model","effort","speed","reason"],"additionalProperties":false},"selection_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"cwd_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["host","native_id_requested","selection","selection_sha256","cwd_sha256"],"additionalProperties":false},
    "CallPolicy": {"type":"object","properties":{"configured_timeout_ms":{"const":300000},"call_timeout_ms":{"type":"integer","minimum":1000,"maximum":300000},"absolute_deadline_ms":{"type":"integer","minimum":1,"maximum":9007199254740991},"authority_expiry_ms":{"type":"integer","minimum":1,"maximum":9007199254740991},"overall_deadline_ms":{"oneOf":[{"type":"null"},{"type":"integer","minimum":1,"maximum":9007199254740991}]},"max_output_utf16_units":{"type":"integer","minimum":1,"maximum":2000000},"evidence_ceiling_bytes":{"type":"integer","minimum":1,"maximum":10000000},"cancellation_binding_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"policy_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["configured_timeout_ms","call_timeout_ms","absolute_deadline_ms","authority_expiry_ms","overall_deadline_ms","max_output_utf16_units","evidence_ceiling_bytes","cancellation_binding_id","policy_sha256"],"additionalProperties":false},
    "CallBinding": {"type":"object","properties":{"protocol":{"const":"issue18-call-binding-v1"},"profile_id":{"const":"soloco-issue18-literal-comparison-contract-v1"},"profile_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"run_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"arm_id":{"enum":["1-files","1-patches","3-files","3-patches"]},"phase":{"enum":["engineer","qa"]},"store":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/StoreBinding"},"job":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/JobBinding"},"plan":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/PlanBinding"},"invocation_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"source":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/SourceBinding"},"model":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/ModelBinding"},"call_policy":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/CallPolicy"},"codec_mode":{"enum":["full_file_chunks_v1","identity"]},"canonical_prompt_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"encoding_instruction_sha256":{"oneOf":[{"type":"null"},{"type":"string","pattern":"^[a-f0-9]{64}$"}]},"actual_prompt_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"fixture_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["protocol","profile_id","profile_sha256","run_id","arm_id","phase","store","job","plan","invocation_id","source","model","call_policy","codec_mode","canonical_prompt_sha256","encoding_instruction_sha256","actual_prompt_sha256","fixture_sha256"],"additionalProperties":false,"allOf":[{"if":{"properties":{"arm_id":{"const":"1-files"}}},"then":{"properties":{"plan":{"properties":{"write_paths":{"const":["module-0.mjs"]},"output_format":{"const":"files"}}}}}},{"if":{"properties":{"arm_id":{"const":"1-patches"}}},"then":{"properties":{"plan":{"properties":{"write_paths":{"const":["module-0.mjs"]},"output_format":{"const":"patches"}}}}}},{"if":{"properties":{"arm_id":{"const":"3-files"}}},"then":{"properties":{"plan":{"properties":{"write_paths":{"const":["module-0.mjs","module-1.mjs","module-2.mjs"]},"output_format":{"const":"files"}}}}}},{"if":{"properties":{"arm_id":{"const":"3-patches"}}},"then":{"properties":{"plan":{"properties":{"write_paths":{"const":["module-0.mjs","module-1.mjs","module-2.mjs"]},"output_format":{"const":"patches"}}}}}},{"if":{"properties":{"phase":{"const":"engineer"}}},"then":{"properties":{"job":{"properties":{"role":{"const":"engineer"},"development_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"review_of":{"const":null}}},"model":{"properties":{"selection":{"properties":{"effort":{"const":"medium"}}}}}}}},{"if":{"properties":{"phase":{"const":"qa"}}},"then":{"properties":{"job":{"properties":{"role":{"const":"qa"},"development_id":{"const":null},"review_of":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/RecordRef"}}},"model":{"properties":{"selection":{"properties":{"effort":{"const":"high"}}}}}}}},{"if":{"properties":{"phase":{"const":"engineer"},"arm_id":{"enum":["1-files","3-files"]}}},"then":{"properties":{"codec_mode":{"const":"full_file_chunks_v1"},"encoding_instruction_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"call_policy":{"properties":{"max_output_utf16_units":{"type":"integer","minimum":1,"maximum":200000}}}}},"else":{"properties":{"codec_mode":{"const":"identity"},"encoding_instruction_sha256":{"const":null}}}}]},
    "SlotCommit": {"type":"object","properties":{"profile_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"run_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"arm_id":{"enum":["1-files","1-patches","3-files","3-patches"]},"phase":{"enum":["engineer","qa"]},"binding_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"slot_record_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"slot_commit_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"committed_at":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$"},"ledger_identity_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["profile_sha256","run_id","arm_id","phase","binding_sha256","slot_record_sha256","slot_commit_id","committed_at","ledger_identity_sha256"],"additionalProperties":false},
  },
  evidence: {
    "BlobRef": {"type":"object","properties":{"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"bytes":{"type":"integer","minimum":0,"maximum":9975424},"encoding":{"enum":["utf8-scalar-text-v1","js-utf16le-code-units-v1","closed-json-utf8-v1"]},"object_name":{"type":"string","pattern":"^objects/[a-f0-9]{64}\\.blob$"}},"required":["sha256","bytes","encoding","object_name"],"additionalProperties":false},
    "PromptRef": {"type":"object","properties":{"blob":{"allOf":[{"$ref":"#/$defs/BlobRef"},{"properties":{"encoding":{"const":"utf8-scalar-text-v1"},"bytes":{"type":"integer","minimum":0,"maximum":2000000}}}]},"utf16_units":{"type":"integer","minimum":0,"maximum":2000000},"utf8_bytes":{"type":"integer","minimum":0,"maximum":2000000},"unicode_well_formed":{"const":true},"contains_nul":{"const":false}},"required":["blob","utf16_units","utf8_bytes","unicode_well_formed","contains_nul"],"additionalProperties":false},
    "Request": {"type":"object","properties":{"canonical":{"$ref":"#/$defs/PromptRef"},"encoding_instruction":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/PromptRef"}]},"actual":{"$ref":"#/$defs/PromptRef"},"requested_at":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$"},"effective_policy_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"B_slot":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/SlotCommit"},"retention_expires_at":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$"},"A_capacity_reserved_bytes":{"type":"integer","minimum":1,"maximum":9975424},"capture_protocol":{"const":"adapter-decoded-js-text-v1"},"genuine_catalog_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["canonical","encoding_instruction","actual","requested_at","effective_policy_sha256","B_slot","retention_expires_at","A_capacity_reserved_bytes","capture_protocol","genuine_catalog_sha256"],"additionalProperties":false},
    "Utf8Measurement": {"type":"object","properties":{"bytes":{"type":"integer","minimum":0,"maximum":6000000},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"encoding_semantics":{"enum":["exact_scalar_utf8","replacement_encoding_not_original_wire"]}},"required":["bytes","sha256","encoding_semantics"],"additionalProperties":false},
    "RawCapture": {"type":"object","properties":{"state":{"enum":["complete","partial","unavailable"]},"original_units_observed":{"oneOf":[{"type":"null"},{"type":"integer","minimum":0,"maximum":9007199254740991}]},"retained_units":{"type":"integer","minimum":0,"maximum":2000000},"lossless_blob":{"oneOf":[{"type":"null"},{"allOf":[{"$ref":"#/$defs/BlobRef"},{"properties":{"encoding":{"const":"js-utf16le-code-units-v1"},"bytes":{"type":"integer","minimum":0,"maximum":4000000}}}]}]},"utf8_measurement":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/Utf8Measurement"}]},"unicode_well_formed":{"oneOf":[{"type":"null"},{"type":"boolean"}]},"contains_nul":{"oneOf":[{"type":"null"},{"type":"boolean"}]},"reason":{"enum":["whole_returned_value","adapter_supplied_partial_text","durable_prefix_only","no_text_available","persistence_failed"]},"provider_answer_completeness":{"const":"not_established"},"lower_cli_transport":{"type":"object","properties":{"status":{"const":"not_captured"},"bytes":{"const":null},"sha256":{"const":null}},"required":["status","bytes","sha256"],"additionalProperties":false}},"required":["state","original_units_observed","retained_units","lossless_blob","utf8_measurement","unicode_well_formed","contains_nul","reason","provider_answer_completeness","lower_cli_transport"],"additionalProperties":false,"allOf":[{"if":{"properties":{"state":{"const":"complete"}}},"then":{"properties":{"original_units_observed":{"type":"integer","minimum":0,"maximum":2000000},"lossless_blob":{"allOf":[{"$ref":"#/$defs/BlobRef"},{"properties":{"encoding":{"const":"js-utf16le-code-units-v1"},"bytes":{"type":"integer","minimum":0,"maximum":4000000}}}]},"utf8_measurement":{"$ref":"#/$defs/Utf8Measurement"},"unicode_well_formed":{"type":"boolean"},"contains_nul":{"type":"boolean"},"reason":{"const":"whole_returned_value"}}}},{"if":{"properties":{"state":{"const":"unavailable"}}},"then":{"properties":{"retained_units":{"const":0},"lossless_blob":{"const":null},"utf8_measurement":{"const":null}}}}]},
    "SafeDiagnostic": {"type":"object","properties":{"status":{"enum":["not_inspected","source_owned_data","truncated_source_owned_data"]},"text":{"oneOf":[{"type":"null"},{"type":"string","maxLength":2048}]},"original_utf16_units":{"oneOf":[{"type":"null"},{"type":"integer","minimum":0,"maximum":9007199254740991}]},"truncated":{"type":"boolean"}},"required":["status","text","original_utf16_units","truncated"],"additionalProperties":false,"allOf":[{"if":{"properties":{"status":{"const":"not_inspected"}}},"then":{"properties":{"text":{"const":null},"original_utf16_units":{"const":null},"truncated":{"const":false}}}}]},
    "ErrorReceipt": {"type":"object","properties":{"receipt_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"origin":{"enum":["provider_or_adapter","evidence_io","deadline_or_cancel","binding_or_schema","not_entered_or_unknown"]},"thrown_kind":{"enum":["Error","object","primitive","unknown"]},"live_identity":{"const":"original_value_and_cause_preserved_privately_not_reconstructable"},"diagnostic":{"$ref":"#/$defs/SafeDiagnostic"},"cold_identity_claim":{"const":false}},"required":["receipt_id","origin","thrown_kind","live_identity","diagnostic","cold_identity_claim"],"additionalProperties":false},
    "IOStatus": {"type":"object","properties":{"stage":{"enum":["request_stage","B_admission","arm_commit","response_write","response_fsync","response_publish","header_commit","derived_write","retention","none"]},"status":{"enum":["durable_complete","partial_uncommitted","failed_no_durable_bytes","unknown"]},"expected_bytes":{"oneOf":[{"type":"null"},{"type":"integer","minimum":0,"maximum":9007199254740991}]},"durable_prefix_bytes":{"type":"integer","minimum":0,"maximum":9007199254740991},"error_ref":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/ErrorReceipt"}]}},"required":["stage","status","expected_bytes","durable_prefix_bytes","error_ref"],"additionalProperties":false},
    "Outcome": {"type":"object","properties":{"adapter_state":{"enum":["returned","threw","not_entered_or_unknown"]},"raw":{"$ref":"#/$defs/RawCapture"},"primary_error":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/ErrorReceipt"}]},"capture_error":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/ErrorReceipt"}]},"io":{"$ref":"#/$defs/IOStatus"},"native_id_observed":{"oneOf":[{"type":"null"},{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"}]},"native_id_relation":{"enum":["fresh_observed","different_from_expected","unavailable"]},"physical_birth":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/ProcessObservationRef"}]},"physical_close":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/ProcessObservationRef"}]},"private_outcome_custody_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"outcome_observed_at":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$"}},"required":["adapter_state","raw","primary_error","capture_error","io","native_id_observed","native_id_relation","physical_birth","physical_close","private_outcome_custody_id","outcome_observed_at"],"additionalProperties":false},
    "Derived": {"type":"object","properties":{"codec_outcome":{"enum":["normalized","blocked","rejected"]},"raw_lossless_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"normalization_source_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"normalized_artifact":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/BlobRef"}]},"generated_format":{"enum":["files","patches","none"]},"generated_files_or_patches_utf8_bytes":{"oneOf":[{"type":"null"},{"type":"integer","minimum":0,"maximum":200000}]},"generated_files_or_patches_sha256":{"oneOf":[{"type":"null"},{"type":"string","pattern":"^[a-f0-9]{64}$"}]},"emitted_body_utf8_bytes":{"oneOf":[{"type":"null"},{"type":"integer","minimum":0,"maximum":200000}]},"complete_candidate_utf8_bytes":{"oneOf":[{"type":"null"},{"type":"integer","minimum":0,"maximum":200000}]},"complete_candidate_sha256":{"oneOf":[{"type":"null"},{"type":"string","pattern":"^[a-f0-9]{64}$"}]},"reason_code":{"enum":["NORMALIZED_PENDING_EXISTING_CONSUMER","PRODUCER_BLOCKED","MALFORMED_JSON","DUPLICATE_KEY","INVALID_UNICODE","NUL","FRAME_SEQUENCE","MISSING_OR_WRONG_PATH","WIRE_LIMIT","CANDIDATE_LIMIT","NATIVE_IDENTITY","DEADLINE","CANCELLED","EXISTING_CONSUMER_REJECTED"]},"native_fidelity_or_acceptance_claim":{"const":false},"normalization_kind":{"enum":["codec_json","identity_exact_text"]}},"required":["codec_outcome","raw_lossless_sha256","normalization_source_sha256","normalized_artifact","generated_format","generated_files_or_patches_utf8_bytes","generated_files_or_patches_sha256","emitted_body_utf8_bytes","complete_candidate_utf8_bytes","complete_candidate_sha256","reason_code","native_fidelity_or_acceptance_claim","normalization_kind"],"additionalProperties":false},
    "Counters": {"type":"object","properties":{"A_charged_evidence_bytes":{"type":"integer","minimum":0,"maximum":9975424},"B_slot_reserved_bytes":{"const":16384},"manifest_share_reserved_bytes":{"const":8192},"per_call_ceiling_bytes":{"type":"integer","minimum":1,"maximum":10000000}},"required":["A_charged_evidence_bytes","B_slot_reserved_bytes","manifest_share_reserved_bytes","per_call_ceiling_bytes"],"additionalProperties":false},
    "Evidence": {"type":"object","properties":{"protocol":{"const":"issue18-runtime-wire-evidence-v1"},"binding":{"$ref":"urn:soloco:issue18:contract-A:v1:shared#/$defs/CallBinding"},"binding_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"request":{"$ref":"#/$defs/Request"},"state":{"enum":["requested","response_retained","error_retained","derived"]},"outcome":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/Outcome"}]},"derived":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/Derived"}]},"prior_record_sha256":{"oneOf":[{"type":"null"},{"type":"string","pattern":"^[a-f0-9]{64}$"}]},"revision":{"type":"integer","minimum":1,"maximum":3},"counters":{"$ref":"#/$defs/Counters"}},"required":["protocol","binding","binding_sha256","request","state","outcome","derived","prior_record_sha256","revision","counters"],"additionalProperties":false,"allOf":[{"if":{"properties":{"state":{"const":"requested"}}},"then":{"properties":{"outcome":{"const":null},"derived":{"const":null},"prior_record_sha256":{"const":null},"revision":{"const":1}}}},{"if":{"properties":{"state":{"enum":["response_retained","error_retained"]}}},"then":{"properties":{"outcome":{"$ref":"#/$defs/Outcome"},"derived":{"const":null},"prior_record_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"revision":{"const":2}}}},{"if":{"properties":{"state":{"const":"derived"}}},"then":{"properties":{"outcome":{"$ref":"#/$defs/Outcome"},"derived":{"$ref":"#/$defs/Derived"},"prior_record_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"revision":{"const":3}}}},{"if":{"properties":{"state":{"const":"response_retained"}}},"then":{"properties":{"outcome":{"properties":{"adapter_state":{"const":"returned"},"raw":{"properties":{"state":{"const":"complete"}}},"primary_error":{"const":null},"capture_error":{"const":null},"io":{"properties":{"status":{"const":"durable_complete"}}},"physical_birth":{"$ref":"#/$defs/ProcessObservationRef"},"physical_close":{"$ref":"#/$defs/ProcessObservationRef"}}}}}},{"if":{"properties":{"state":{"const":"derived"}}},"then":{"properties":{"outcome":{"properties":{"adapter_state":{"const":"returned"},"raw":{"properties":{"state":{"const":"complete"}}},"primary_error":{"const":null},"capture_error":{"const":null},"io":{"properties":{"status":{"const":"durable_complete"}}},"physical_birth":{"$ref":"#/$defs/ProcessObservationRef"},"physical_close":{"$ref":"#/$defs/ProcessObservationRef"}}}}}},{"if":{"properties":{"state":{"const":"error_retained"}}},"then":{"properties":{"outcome":{"anyOf":[{"properties":{"primary_error":{"$ref":"#/$defs/ErrorReceipt"}}},{"properties":{"capture_error":{"$ref":"#/$defs/ErrorReceipt"}}}]}}}},{"if":{"properties":{"binding":{"properties":{"codec_mode":{"const":"full_file_chunks_v1"}}}}},"then":{"properties":{"request":{"properties":{"encoding_instruction":{"$ref":"#/$defs/PromptRef"}}}}},"else":{"properties":{"request":{"properties":{"encoding_instruction":{"const":null}}}}}}]},
    "EvidenceRecord": {"type":"object","properties":{"id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"kind":{"const":"artifact"},"author_role":{"const":"runner"},"author_instance":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"revision":{"type":"integer","minimum":1,"maximum":3},"status":{"const":"Recorded"},"created_at":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z$"},"content":{"const":"Host-retained issue18 invocation evidence; no acceptance or authority."},"job_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"inputs":{"const":[]},"runtime_wire_evidence":{"$ref":"#/$defs/Evidence"}},"required":["id","kind","author_role","author_instance","revision","status","created_at","content","job_id","inputs","runtime_wire_evidence"],"additionalProperties":false},
    "ProcessObservationRef": {"type":"object","properties":{"job_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"invocation_id":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$"},"event_seq":{"type":"integer","minimum":1,"maximum":9007199254740991},"event_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"tracking_entry_sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["job_id","invocation_id","event_seq","event_sha256","tracking_entry_sha256"],"additionalProperties":false},
  }
};

function resolve(reference){
  const split=reference.split('#/$defs/');
  const group=split[0]===''?'evidence':split[0]==='urn:soloco:issue18:contract-A:v1:shared'?'shared':null;
  need(group&&SHAPES[group]?.[split[1]],'SCHEMA_REF');return SHAPES[group][split[1]];
}
function matches(schema,value){try{shape(schema,value);return true;}catch(e){if(e?.code?.startsWith('ISSUE18_CAPTURE_'))return false;throw e;}}
function shape(s,v){
  if(s.$ref)shape(resolve(s.$ref),v);
  if(has(s,'const'))need(canonical(v)===canonical(s.const),'FIELD_VALUE');
  if(s.enum)need(s.enum.some(x=>canonical(x)===canonical(v)),'FIELD_VALUE');
  if(s.type){
    const ok=s.type==='object'?v!==null&&typeof v==='object'&&!Array.isArray(v):s.type==='array'?Array.isArray(v):s.type==='integer'?Number.isSafeInteger(v):s.type==='null'?v===null:typeof v===s.type;
    need(ok,'FIELD_TYPE');
  }
  if(s.oneOf)need(s.oneOf.filter(x=>matches(x,v)).length===1,'ONE_OF');
  if(s.anyOf)need(s.anyOf.some(x=>matches(x,v)),'ANY_OF');
  if(s.allOf)for(const sub of s.allOf)shape(sub,v);
  if(s.if){const branch=matches(s.if,v)?s.then:s.else;if(branch)shape(branch,v);}
  if(typeof v==='number'){if(has(s,'minimum'))need(v>=s.minimum,'MINIMUM');if(has(s,'maximum'))need(v<=s.maximum,'MAXIMUM');}
  if(typeof v==='string'){
    if(has(s,'minLength'))need([...v].length>=s.minLength,'MIN_LENGTH');
    if(has(s,'maxLength'))need([...v].length<=s.maxLength,'MAX_LENGTH');
    if(s.pattern)need(new RegExp(s.pattern).test(v),'PATTERN');
  }
  if(Array.isArray(v)){
    if(has(s,'minItems'))need(v.length>=s.minItems,'MIN_ITEMS');if(has(s,'maxItems'))need(v.length<=s.maxItems,'MAX_ITEMS');
    if(s.uniqueItems)need(new Set(v.map(canonical)).size===v.length,'UNIQUE_ITEMS');if(s.items)for(const x of v)shape(s.items,x);
  }else if(v!==null&&typeof v==='object'){
    if(s.required)need(s.required.every(k=>has(v,k)),'REQUIRED');
    if(s.additionalProperties===false)need(Object.keys(v).every(k=>has(s.properties??{},k)),'UNKNOWN_FIELD');
    for(const [k,sub] of Object.entries(s.properties??{}))if(has(v,k))shape(sub,v[k]);
  }
}
const POLICY_KEYS=['configured_timeout_ms','call_timeout_ms','absolute_deadline_ms','authority_expiry_ms','overall_deadline_ms','max_output_utf16_units','evidence_ceiling_bytes','cancellation_binding_id'];
export function callPolicyBytes(serialized){
  const p=parseData(serialized,32768);
  shape(SHAPES.shared.CallPolicy,p&&typeof p==='object'&&!has(p,'policy_sha256')?{...p,policy_sha256:'0'.repeat(64)}:p);
  const projection=Object.fromEntries(POLICY_KEYS.map(k=>[k,p[k]]));return Buffer.from(JSON.stringify(projection),'utf8');
}
export function callPolicyHash(serialized){return hash(callPolicyBytes(serialized));}
export function captureBinding(serialized){
  const b=parseData(serialized,16384);shape(SHAPES.shared.CallBinding,b);
  need(b.profile_sha256===CONTRACT.profile_sha256&&b.source.contract_A_manifest_sha256===CONTRACT.manifest_sha256,'PROFILE');
  need(b.model.selection_sha256===hash(Buffer.from(JSON.stringify(b.model.selection),'utf8')),'MODEL_HASH');
  const blob=ownBlob(Buffer.from(serialized,'utf8'),JSON_BYTES);
  return freeze({blob,binding:b,scope:'PREPARED_DATA_ONLY'});
}

function sum(a,b){need(integer(a)&&integer(b)&&Number.isSafeInteger(a+b),'ACCOUNT_OVERFLOW');return a+b;}
export function accountEvidence(serializedInventory,configuration){
  const o=options(configuration,['max_a_bytes','per_call_ceiling_bytes']);
  const cap=limit(o.max_a_bytes,9975424,9975424),ceiling=limit(o.per_call_ceiling_bytes,10000000,10000000);
  const rows=parseData(serializedInventory,32768);need(Array.isArray(rows)&&rows.length<=128,'INVENTORY');
  let total=0;const counts={blob:0,header:0,event:0,backup:0,other:0};
  for(const row of rows){
    const r=options(row,['kind','bytes','copies']);need(Object.keys(r).length===3&&typeof r.kind==='string'&&has(counts,r.kind),'INVENTORY');
    need(integer(r.bytes,0,9975424)&&integer(r.copies,1,128),'INVENTORY');
    if(r.kind==='header')need(r.bytes<=32768,'HEADER_LIMIT');if(r.kind==='event')need(r.bytes<=65536,'EVENT_LIMIT');
    const charge=r.bytes*r.copies;need(Number.isSafeInteger(charge),'ACCOUNT_OVERFLOW');total=sum(total,charge);counts[r.kind]=sum(counts[r.kind],charge);
  }
  const includingB=sum(total,24576);need(total<=cap&&includingB<=ceiling,'EVIDENCE_LIMIT');
  return freeze({a_bytes:total,including_B_and_manifest_bytes:includingB,by_kind:counts,scope:'DECLARED_INVENTORY_ONLY'});
}

function handleList(value){
  need(value&&!types.isProxy(value)&&Array.isArray(value),'BLOB_LIST');
  const d=Object.getOwnPropertyDescriptors(value),n=d.length.value;
  need(integer(n,0,128)&&Reflect.ownKeys(d).every(k=>k==='length'||typeof k==='string'&&/^(0|[1-9][0-9]*)$/.test(k)),'BLOB_LIST');
  const list=[];for(let i=0;i<n;i++){need(d[i]&&has(d[i],'value'),'BLOB_LIST');list.push(owned(d[i].value));}return list;
}
function blobIndex(list){
  const map=new Map();for(const b of list){const key=b.ref.encoding+':'+b.ref.sha256;const prior=map.get(key);if(prior)need(prior.bytes.equals(b.bytes),'BLOB_COLLISION');map.set(key,b);}return map;
}
function resolveBlob(ref,index){
  shape(SHAPES.evidence.BlobRef,ref);const b=index.get(ref.encoding+':'+ref.sha256);
  need(b&&canonical(b.ref)===canonical(ref),'MISSING_BLOB');return b;
}
function utf8Text(bytes){
  const text=bytes.toString('utf8');need(Buffer.from(text,'utf8').equals(bytes),'UTF8_BYTES');return text;
}
function utf16Text(bytes){
  need(bytes.length%2===0,'UTF16_BYTES');const text=bytes.toString('utf16le');need(text.length*2===bytes.length,'UTF16_BYTES');
  for(let i=0;i<text.length;i++)need(text.charCodeAt(i)===bytes.readUInt16LE(i*2),'UTF16_BYTES');return text;
}
function checkDomain(bytes,encoding){
  need(ENCODINGS.has(encoding),'ENCODING');
  if(encoding===UTF16)utf16Text(bytes);
  else if(encoding===UTF8)utf8Text(bytes);
  else parseData(utf8Text(bytes),9975424);
}
function promptText(ref,index){
  const b=resolveBlob(ref.blob,index);need(b.ref.encoding===UTF8,'PROMPT_DOMAIN');
  const text=utf8Text(b.bytes);scalarText(text,2000000);
  need(ref.utf16_units===text.length&&ref.utf8_bytes===b.bytes.length,'PROMPT_MEASUREMENT');return text;
}
function rawText(raw,index,maximum){
  if(raw.lossless_blob===null){need(raw.retained_units===0&&raw.utf8_measurement===null,'RAW_MISSING');return null;}
  const b=resolveBlob(raw.lossless_blob,index);need(b.ref.encoding===UTF16&&b.bytes.length===raw.retained_units*2,'RAW_DOMAIN');
  need(raw.retained_units<=maximum,'RAW_LIMIT');
  const text=utf16Text(b.bytes),f=textFacts(text),utf8=Buffer.from(text,'utf8');
  need(text.length===raw.retained_units&&raw.unicode_well_formed===f.wellFormed&&raw.contains_nul===f.nul,'RAW_MEASUREMENT');
  need(raw.utf8_measurement!==null&&raw.utf8_measurement.bytes===utf8.length&&raw.utf8_measurement.sha256===hash(utf8),'RAW_UTF8');
  need(raw.utf8_measurement.encoding_semantics===(f.wellFormed?'exact_scalar_utf8':'replacement_encoding_not_original_wire'),'RAW_UTF8_DOMAIN');
  if(raw.state==='complete')need(raw.original_units_observed===text.length&&raw.reason==='whole_returned_value','RAW_COMPLETENESS');
  else need(raw.state==='partial'&&['adapter_supplied_partial_text','durable_prefix_only'].includes(raw.reason)&&(raw.original_units_observed===null||raw.original_units_observed>=text.length),'RAW_COMPLETENESS');
  return text;
}
function observation(ref,binding){if(ref)need(ref.job_id===binding.job.id&&ref.invocation_id===binding.invocation_id,'PROCESS_JOIN');}
function date(value){const ms=Date.parse(value);need(Number.isFinite(ms),'TIME');return ms;}
function same(a,b,code){need(canonical(a)===canonical(b),code);}
function validateJoins(record,binding,bindingHash,index,candidate){
  const e=record.runtime_wire_evidence,r=e.request,p=binding.call_policy;
  same(e.binding,binding,'BINDING_JOIN');need(e.binding_sha256===bindingHash,'BINDING_BYTES');
  need(record.revision===e.revision&&record.job_id===binding.job.id&&record.author_instance===binding.job.instance_id,'RECORD_JOIN');
  need(binding.profile_sha256===CONTRACT.profile_sha256&&binding.source.contract_A_manifest_sha256===CONTRACT.manifest_sha256,'PROFILE');
  need(p.policy_sha256===callPolicyHash(JSON.stringify(p))&&r.effective_policy_sha256===p.policy_sha256,'POLICY_HASH');
  need(p.absolute_deadline_ms<=p.authority_expiry_ms&&(p.overall_deadline_ms===null||p.absolute_deadline_ms<=p.overall_deadline_ms),'POLICY_LIMIT');
  need(p.call_timeout_ms<=p.configured_timeout_ms,'POLICY_LIMIT');
  const canonicalPrompt=promptText(r.canonical,index),actual=promptText(r.actual,index);
  const encoding=r.encoding_instruction===null?'':promptText(r.encoding_instruction,index);
  need(actual===canonicalPrompt+encoding,'ACTUAL_PROMPT');
  need(r.canonical.blob.sha256===binding.canonical_prompt_sha256&&r.actual.blob.sha256===binding.actual_prompt_sha256,'PROMPT_JOIN');
  need((r.encoding_instruction?.blob.sha256??null)===binding.encoding_instruction_sha256,'ENCODING_JOIN');
  need((binding.codec_mode==='identity')===(r.encoding_instruction===null),'ENCODING_JOIN');
  if(binding.phase==='engineer')need(binding.job.development_id===binding.plan.id,'PLAN_JOIN');
  for(const k of ['profile_sha256','run_id','arm_id','phase'])need(r.B_slot[k]===binding[k],'SLOT_JOIN');
  need(r.B_slot.binding_sha256===bindingHash,'SLOT_BINDING');
  need(date(r.retention_expires_at)>Math.max(date(record.created_at),date(r.requested_at)),'RETENTION_TIME');
  const o=e.outcome;
  if(o){
    if(o.adapter_state==='threw')need(o.primary_error!==null,'MISSING_PRIMARY_ERROR');
    if(o.adapter_state==='returned'&&o.primary_error)need(o.primary_error.origin!=='provider_or_adapter','ERROR_ORIGIN');
    if(o.capture_error)need(o.capture_error.origin!=='provider_or_adapter','CAPTURE_ERROR_ORIGIN');
    observation(o.physical_birth,binding);observation(o.physical_close,binding);
    if(o.physical_birth&&o.physical_close)need(o.physical_birth.event_seq<o.physical_close.event_seq,'PROCESS_ORDER');
    need(date(o.outcome_observed_at)>=date(r.requested_at),'OUTCOME_TIME');
    rawText(o.raw,index,p.max_output_utf16_units);
    if(o.native_id_relation==='unavailable')need(o.native_id_observed===null,'NATIVE_JOIN');
    if(o.native_id_relation==='fresh_observed')need(o.native_id_observed!==null,'NATIVE_JOIN');
    if(o.io.expected_bytes!==null)need(o.io.durable_prefix_bytes<=o.io.expected_bytes,'IO_BYTES');
    if(o.io.status==='failed_no_durable_bytes')need(o.io.durable_prefix_bytes===0,'IO_BYTES');
    if(o.io.status==='durable_complete')need(o.io.expected_bytes!==null&&o.io.durable_prefix_bytes===o.io.expected_bytes,'IO_BYTES');
  }
  if(e.derived){
    const d=e.derived,raw=o.raw;need(raw.lossless_blob!==null&&d.raw_lossless_sha256===raw.lossless_blob.sha256,'DERIVED_RAW');
    need(d.normalization_source_sha256===binding.source.codec_module_sha256,'DERIVED_SOURCE');
    need(d.normalization_kind===(binding.codec_mode==='identity'?'identity_exact_text':'codec_json'),'DERIVED_KIND');
    if(d.codec_outcome!=='normalized'){
      need(d.normalized_artifact===null&&d.generated_format==='none','DERIVED_REJECTION');
      for(const k of ['generated_files_or_patches_utf8_bytes','generated_files_or_patches_sha256','emitted_body_utf8_bytes','complete_candidate_utf8_bytes','complete_candidate_sha256'])need(d[k]===null,'DERIVED_REJECTION');
      need(d.codec_outcome==='blocked'?d.reason_code==='PRODUCER_BLOCKED':!['NORMALIZED_PENDING_EXISTING_CONSUMER','PRODUCER_BLOCKED'].includes(d.reason_code),'DERIVED_REJECTION');
    }else{
      need(raw.unicode_well_formed===true&&raw.contains_nul===false&&d.normalized_artifact!==null&&d.reason_code==='NORMALIZED_PENDING_EXISTING_CONSUMER','DERIVED_NORMALIZED');
      need(o.native_id_observed!==null&&o.native_id_relation==='fresh_observed','DERIVED_NATIVE');
      const source=rawText(raw,index,p.max_output_utf16_units),normalized=resolveBlob(d.normalized_artifact,index);
      const text=normalized.ref.encoding===UTF16?utf16Text(normalized.bytes):utf8Text(normalized.bytes);
      if(binding.codec_mode==='identity')need(text===source,'IDENTITY_OUTPUT');
      else need(raw.utf8_measurement.bytes<=binding.plan.max_bytes,'WIRE_LIMIT');
      const artifact=parseData(text,9975424);
      if(binding.phase==='qa')need(d.generated_format==='none'&&d.generated_files_or_patches_utf8_bytes===null&&d.generated_files_or_patches_sha256===null&&d.emitted_body_utf8_bytes===null,'QA_GENERATION');
      else{
        need(artifact!==null&&typeof artifact==='object'&&!Array.isArray(artifact),'GENERATED_ARTIFACT');
        const format=binding.plan.output_format,files=artifact[format];
        need(d.generated_format===format&&Array.isArray(files)&&files.length===binding.plan.write_paths.length,'GENERATED_FORMAT');
        same(files.map(f=>f?.path).sort(),binding.plan.write_paths,'GENERATED_PATHS');
        const bytes=Buffer.from(JSON.stringify(files),'utf8');need(bytes.length<=binding.plan.max_bytes,'CANDIDATE_LIMIT');
        need(d.generated_files_or_patches_utf8_bytes===bytes.length&&d.generated_files_or_patches_sha256===hash(bytes),'GENERATED_HASH');
        if(format==='files'){
          let body=0;for(const f of files){need(f&&Object.keys(f).sort().join(',')==='content,path','GENERATED_FILE');scalarText(f.content,p.max_output_utf16_units);body=sum(body,Buffer.byteLength(f.content,'utf8'));}
          need(d.emitted_body_utf8_bytes===body,'BODY_BYTES');
        }else need(d.emitted_body_utf8_bytes===null,'BODY_BYTES');
      }
      if(d.complete_candidate_sha256===null)need(d.complete_candidate_utf8_bytes===null,'CANDIDATE_JOIN');
      else{
        need(candidate,'CANDIDATE_JOIN');const bytes=owned(candidate).bytes;
        need(bytes.length<=binding.plan.max_bytes&&d.complete_candidate_utf8_bytes===bytes.length&&d.complete_candidate_sha256===hash(bytes),'CANDIDATE_JOIN');
      }
    }
  }
}

/** Check serialized DATA and explicit byte relationships, NEVER physical truth. */
export function validateEvidenceData(serializedRecord,configuration){
  const o=options(configuration,['binding_blob','blobs','inventory','history','candidate_blob']);
  const record=parseData(serializedRecord,32768);shape(SHAPES.evidence.EvidenceRecord,record);
  const bound=owned(o.binding_blob);need(bound.ref.encoding===JSON_BYTES,'BINDING_DOMAIN');
  const bindingText=utf8Text(bound.bytes),binding=parseData(bindingText,16384);shape(SHAPES.shared.CallBinding,binding);
  need(binding.model.selection_sha256===hash(Buffer.from(JSON.stringify(binding.model.selection),'utf8')),'MODEL_HASH');
  const list=handleList(o.blobs),index=blobIndex(list),e=record.runtime_wire_evidence;
  const history=o.history===undefined?[]:parseData(o.history,262144);
  need(Array.isArray(history)&&history.length===e.revision-1&&history.length<=2&&history.every(x=>typeof x==='string'),'HISTORY');
  const texts=[...history,serializedRecord],chain=texts.map(text=>parseData(text,32768));
  for(let i=0;i<chain.length;i++){
    const current=chain[i];shape(SHAPES.evidence.EvidenceRecord,current);validateJoins(current,binding,bound.ref.sha256,index,o.candidate_blob);
    const after=current.runtime_wire_evidence;need(current.revision===i+1,'HISTORY_REVISION');
    const effective=Math.min(after.counters.per_call_ceiling_bytes,binding.call_policy.evidence_ceiling_bytes,10000000);
    need(sum(after.request.A_capacity_reserved_bytes,24576)<=effective,'RESERVATION_LIMIT');
    need(after.counters.A_charged_evidence_bytes<=after.request.A_capacity_reserved_bytes&&sum(after.counters.A_charged_evidence_bytes,24576)<=effective,'HISTORY_ACCOUNT');
    if(i===0){need(after.state==='requested'&&after.prior_record_sha256===null,'HISTORY_START');continue;}
    const prior=chain[i-1],before=prior.runtime_wire_evidence;
    need(after.prior_record_sha256===hash(Buffer.from(texts[i-1],'utf8')),'PRIOR_BYTES');
    for(const k of ['id','kind','author_role','author_instance','status','created_at','content','job_id','inputs'])same(current[k],prior[k],'IMMUTABLE_RECORD');
    for(const k of ['protocol','binding','binding_sha256','request'])same(after[k],before[k],'IMMUTABLE_REQUEST');
    need(after.counters.per_call_ceiling_bytes===before.counters.per_call_ceiling_bytes,'IMMUTABLE_CEILING');
    need(after.counters.A_charged_evidence_bytes>=before.counters.A_charged_evidence_bytes,'ACCOUNT_MONOTONE');
    if(i===1)need(before.state==='requested'&&['response_retained','error_retained'].includes(after.state),'TRANSITION');
    else{need(before.state==='response_retained'&&after.state==='derived','TRANSITION');same(after.outcome,before.outcome,'IMMUTABLE_OUTCOME');}
  }
  const c=e.counters,cap=Math.min(c.per_call_ceiling_bytes,binding.call_policy.evidence_ceiling_bytes,10000000);
  const accounting=accountEvidence(o.inventory,{max_a_bytes:e.request.A_capacity_reserved_bytes,per_call_ceiling_bytes:cap});
  need(c.A_charged_evidence_bytes===accounting.a_bytes,'ACCOUNT_JOIN');
  let byteCopies=0;for(const b of list)byteCopies=sum(byteCopies,b.bytes.length);
  need(accounting.by_kind.blob>=byteCopies,'ACCOUNT_BLOBS');
  let headers=0;for(const text of texts)headers=sum(headers,Buffer.byteLength(text,'utf8'));
  need(accounting.by_kind.header>=headers,'ACCOUNT_HEADERS');
  return freeze({record,record_sha256:hash(Buffer.from(serializedRecord,'utf8')),accounting,
    scope:'DATA_CONSISTENCY_ONLY',not_verified:['adapter_or_error_custody','actual_Store_or_COMMIT','B_admission','physical_IO_or_inventory','currentness_or_expiry','codec_normalization','candidate_consumer_or_fixture_semantics','test_or_QA_or_acceptance','execution_authority']});
}
