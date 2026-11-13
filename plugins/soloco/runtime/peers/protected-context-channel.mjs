// INTERNAL mechanical transcript helper for the original Rust private-FD wire.
// Supplied transcript DATA can be synthetic. These functions establish no child
// identity, deployment, authentication, interpreter capability or native result.
// The source-owned domain alone owns the real pipes, writes and deadlines.
import {createHash} from 'node:crypto';
import {TextDecoder,types} from 'node:util';
import path from 'node:path';
import {BOOTSTRAP_CONTEXT_SELECTION} from './bootstrap-membership-delivery-frame.mjs';

// Exact source constant: codex-api/src/protected_peer.rs, not the old v1 wire.
const PROTOCOL='soloco-protected-backend-permit-v2';
const MAX_FRAME=100_000;
const SELECTION=Object.freeze({
  protocol:'soloco-peer-context-contract-v2',
  contract_id:'peer-task-and-whole-membership-context-v2-delivery-frame-v3',
  resource_sha256:'832fdd1c965fa0e834c030f7c1e5636e2f32636b0df899ba8aa0fa940e9032fc',
  context_encoding:'soloco-peer-context-frame-v2',
  scope_profile_id:'protected_scoped_explicit_nonincremental_rlite_v1',
});
const INPUT_FRONTIER_SELECTION=Object.freeze({protocol:'soloco-input-frontier-context-contract-v1',contract_id:'input-frontier-readonly3-whole-assignment-v1',resource_sha256:'b15ae178857196eac75123652817c1673a2e4941b409f6d5cbb72225800f7863',context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:'soloco-input-frontier-readonly-v1'});
const ORIGIN_MAINTENANCE_SELECTION=Object.freeze({protocol:'soloco-origin-maintenance-context-contract-v1',contract_id:'origin-maintenance-readonly3-whole-assignment-v1',resource_sha256:'a7f744362c1404a1ae67ca6e5c3bf1b63c3c0fab99b9ad996db0f1265757c824',context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:'soloco-origin-maintenance-readonly-v1'});
const ORIGIN_FINAL_REVIEW_SELECTION=Object.freeze({protocol:'soloco-origin-final-review-context-contract-v1',contract_id:'origin-final-review-readonly3-whole-assignment-v1',resource_sha256:'d7939b68fb44e4dee524ec7774e080b0d6f4b40c1493f37737eb67b1f1efa3fd',context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:'soloco-origin-final-review-readonly-v1'});
const EVIDENCE='source-resource-and-whole-payload-source-cut-wire-compatibility-only';
const EXPECTED=['nonce','pid','slot_id','executable_sha256','source_manifest_sha256','original_home_sha256','state_root','cwd','upstream_url'];
const BOOTSTRAP=['protocol','kind','nonce','pid','slot_id','executable_sha256','source_manifest_sha256','original_home_sha256','state_root','cwd','host_instance_id','sources'];
const SCOPED=['protocol','kind','nonce','pid','slot_id','executable_sha256','source_manifest_sha256','host_instance_id','scope_instance_id','context_contract_protocol','context_contract_id','context_contract_sha256','context_encoding','scope_profile_id','evidence_scope'];
const fail=code=>{throw Object.assign(Error(code),{code});};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const pid=value=>Number.isSafeInteger(value)&&value>0&&value<=0xffffffff;
const plain=value=>value!==null&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype;
function closed(value,keys){
  if(!plain(value))return false;
  const found=Reflect.ownKeys(value);
  return found.length===keys.length&&found.every(key=>typeof key==='string'&&keys.includes(key)&&Object.getOwnPropertyDescriptor(value,key)?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
}
const freeze=value=>{
  if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
};
const copy=value=>JSON.parse(JSON.stringify(value));
const absolute=value=>typeof value==='string'&&value.length<=4096&&!value.includes('\0')&&path.isAbsolute(value)&&path.resolve(value)===value;
const slot=value=>typeof value==='string'&&Buffer.byteLength(value)>0&&Buffer.byteLength(value)<=200&&!value.includes('\0');

// Validate JSON syntax and duplicate decoded keys before JSON.parse can discard
// them. Root value spans retain original UTF-8 bytes, including escaping/order.
function strictJSON(bytes){
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{fail('PROTECTED_CONTEXT_FRAME_INVALID');}
  let offset=0;const spans=new Map();
  const invalid=()=>fail('PROTECTED_CONTEXT_FRAME_INVALID');
  const whitespace=()=>{while(/[ \t\r\n]/.test(text[offset]??'')&&offset<text.length)offset++;};
  const digit=char=>char!==undefined&&char>='0'&&char<='9';
  function string(){
    if(text[offset++]!=='"')invalid();const start=offset-1;
    while(offset<text.length){
      const char=text[offset++];
      if(char==='"'){
        let decoded;try{decoded=JSON.parse(text.slice(start,offset));}catch{invalid();}
        for(let i=0;i<decoded.length;i++){
          const unit=decoded.charCodeAt(i);
          if(unit>=0xd800&&unit<=0xdbff){const next=decoded.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))invalid();}
          else if(unit>=0xdc00&&unit<=0xdfff)invalid();
        }
        return decoded;
      }
      if(char.charCodeAt(0)<32)invalid();
      if(char==='\\'){
        const escape=text[offset++];
        if(escape==='u'){if(!/^[a-fA-F0-9]{4}$/.test(text.slice(offset,offset+4)))invalid();offset+=4;}
        else if(!['"','\\','/','b','f','n','r','t'].includes(escape))invalid();
      }
    }
    invalid();
  }
  function number(){
    const start=offset;if(text[offset]==='-')offset++;
    if(text[offset]==='0')offset++;
    else{if(!digit(text[offset])||text[offset]==='0')invalid();while(digit(text[offset]))offset++;}
    if(text[offset]==='.') {offset++;if(!digit(text[offset]))invalid();while(digit(text[offset]))offset++;}
    if(text[offset]==='e'||text[offset]==='E'){offset++;if(text[offset]==='+'||text[offset]==='-')offset++;if(!digit(text[offset]))invalid();while(digit(text[offset]))offset++;}
    if(!Number.isFinite(Number(text.slice(start,offset))))invalid();
  }
  function value(depth){
    if(depth>32)invalid();whitespace();const char=text[offset];
    if(char==='"'){string();return;}
    if(char==='{'||char==='['){
      const object=char==='{',end=object?'}':']',keys=new Set();offset++;whitespace();
      if(text[offset]===end){offset++;return;}
      while(offset<text.length){
        let key;
        if(object){key=string();if(keys.has(key))invalid();keys.add(key);whitespace();if(text[offset++]!==':')invalid();whitespace();}
        const start=offset;value(depth+1);const finish=offset;
        if(object&&depth===0)spans.set(key,{start,finish});
        whitespace();if(text[offset]===end){offset++;return;}
        if(text[offset++]!==',')invalid();whitespace();
      }
      invalid();
    }
    for(const literal of ['true','false','null'])if(text.startsWith(literal,offset)){offset+=literal.length;return;}
    if(char==='-'||digit(char)){number();return;}
    invalid();
  }
  value(0);whitespace();if(offset!==text.length)invalid();
  let parsed;try{parsed=JSON.parse(text);}catch{invalid();}
  return {parsed,span:key=>{const span=spans.get(key);if(!span)return null;return bytes.subarray(Buffer.byteLength(text.slice(0,span.start)),Buffer.byteLength(text.slice(0,span.finish)));}};
}

function bootstrapShape(frame){
  const routed=plain(frame)&&Object.hasOwn(frame,'loopback_proxy_port');
  return closed(frame,routed?[...BOOTSTRAP,'loopback_proxy_port']:BOOTSTRAP)&&(!routed||Number.isSafeInteger(frame.loopback_proxy_port)&&frame.loopback_proxy_port>0&&frame.loopback_proxy_port<=65535)&&frame.protocol===PROTOCOL&&frame.kind==='host_bootstrap'&&hash(frame.nonce)&&pid(frame.pid)&&slot(frame.slot_id)
    &&['executable_sha256','source_manifest_sha256','original_home_sha256'].every(key=>hash(frame[key]))
    &&absolute(frame.state_root)&&absolute(frame.cwd)&&uuid(frame.host_instance_id)
    &&closed(frame.sources,['config_layers','auth_owner_generation','auth_revision'])&&Array.isArray(frame.sources.config_layers)
    &&Number.isSafeInteger(frame.sources.auth_owner_generation)&&frame.sources.auth_owner_generation>=0
    &&Number.isSafeInteger(frame.sources.auth_revision)&&frame.sources.auth_revision>=0;
}
function scopedShape(frame,selection){
  if(!selection)return scopedShape(frame,SELECTION)||scopedShape(frame,INPUT_FRONTIER_SELECTION)||scopedShape(frame,ORIGIN_MAINTENANCE_SELECTION)||scopedShape(frame,ORIGIN_FINAL_REVIEW_SELECTION);
  return closed(frame,SCOPED)&&frame.protocol===PROTOCOL&&frame.kind==='scoped_context_contract'&&hash(frame.nonce)&&pid(frame.pid)&&slot(frame.slot_id)
    &&hash(frame.executable_sha256)&&hash(frame.source_manifest_sha256)&&uuid(frame.host_instance_id)&&uuid(frame.scope_instance_id)
    &&frame.context_contract_protocol===selection.protocol&&frame.context_contract_id===selection.contract_id
    &&frame.context_contract_sha256===selection.resource_sha256&&frame.context_encoding===selection.context_encoding
    &&frame.scope_profile_id===selection.scope_profile_id&&frame.evidence_scope===EVIDENCE;
}

/** Parse one domain-framed JSON body, optionally with its single final LF.
 * Wrapped final observations remain DATA for the domain's separate final-send
 * validator; this parser never authorizes them or produces a send permit. */
export function parseOriginalControlFrame(raw){
  return parseSelectedControlFrame(raw);
}
export function parseOriginalBootstrapControlFrame(raw){if(arguments.length!==1)fail('PROTECTED_CONTEXT_EXPECTED_INVALID');return parseSelectedControlFrame(raw,BOOTSTRAP_CONTEXT_SELECTION);}
function parseSelectedControlFrame(raw,selection){
  if(types.isProxy(raw)||!(Buffer.isBuffer(raw)||raw instanceof Uint8Array))fail('PROTECTED_CONTEXT_FRAME_INVALID');
  let bytes=Buffer.from(raw);
  if(bytes.at(-1)===10)bytes=bytes.subarray(0,-1);
  if(!bytes.length||bytes.length>MAX_FRAME||bytes.includes(10)||bytes.includes(13))fail('PROTECTED_CONTEXT_FRAME_INVALID');
  const document=strictJSON(bytes),frame=document.parsed;
  if(bootstrapShape(frame))return Object.freeze({kind:'host_bootstrap',observation:freeze(frame),binding_sha256:null,rawObservation:null,rawFrame:Buffer.from(bytes)});
  if(!closed(frame,['binding_sha256','observation'])||!hash(frame.binding_sha256)||!plain(frame.observation)||frame.observation.protocol!==PROTOCOL
    ||!['scoped_context_contract','final_request'].includes(frame.observation.kind))fail('PROTECTED_CONTEXT_FRAME_INVALID');
  const observed=document.span('observation');
  if(!observed||observed[0]!==123||digest(observed)!==frame.binding_sha256)fail('PROTECTED_CONTEXT_BINDING_MISMATCH');
  if(frame.observation.kind==='scoped_context_contract'&&!scopedShape(frame.observation,selection))fail('PROTECTED_CONTEXT_FRAME_INVALID');
  return Object.freeze({kind:'observation',observation:freeze(frame.observation),binding_sha256:frame.binding_sha256,rawObservation:Buffer.from(observed),rawFrame:Buffer.from(bytes)});
}

function expectedBindings(input){
  const routed=plain(input)&&Object.hasOwn(input,'loopback_proxy_port');
  if(!closed(input,routed?[...EXPECTED,'loopback_proxy_port']:EXPECTED)||routed&&(!Number.isSafeInteger(input.loopback_proxy_port)||input.loopback_proxy_port<1||input.loopback_proxy_port>65535)||!['nonce','executable_sha256','source_manifest_sha256','original_home_sha256'].every(key=>hash(input[key]))
    ||!pid(input.pid)||!slot(input.slot_id)||!absolute(input.state_root)||input.state_root===path.parse(input.state_root).root||!absolute(input.cwd)||typeof input.upstream_url!=='string')fail('PROTECTED_CONTEXT_EXPECTED_INVALID');
  let upstream;try{upstream=new URL(input.upstream_url);}catch{fail('PROTECTED_CONTEXT_EXPECTED_INVALID');}
  if(upstream.protocol!=='https:'||!upstream.hostname||upstream.username||upstream.password||upstream.search||upstream.hash||!upstream.pathname.endsWith('/responses'))fail('PROTECTED_CONTEXT_EXPECTED_INVALID');
  return freeze(copy(input));
}

/** Internal finite-state bookkeeping, not an original-runtime handle.
 * Calls marking writes describe domain observations; only the actual domain can
 * establish that bytes reached its owned child. No timer or I/O runs here. */
export function createOriginalControlTranscript(input){
  return createSelectedControlTranscript(input,SELECTION);
}
export function createOriginalBootstrapControlTranscript(input){if(arguments.length!==1)fail('PROTECTED_CONTEXT_EXPECTED_INVALID');return createSelectedControlTranscript(input,BOOTSTRAP_CONTEXT_SELECTION);}
// Fixed frontier DATA state machine only; the original domain independently
// binds this choice to its private interpreter and exact admission capability.
export function createOriginalInputFrontierControlTranscript(input){return createSelectedControlTranscript(input,INPUT_FRONTIER_SELECTION);}
export function createOriginalOriginMaintenanceControlTranscript(input){return createSelectedControlTranscript(input,ORIGIN_MAINTENANCE_SELECTION);}
export function createOriginalOriginFinalReviewControlTranscript(input){return createSelectedControlTranscript(input,ORIGIN_FINAL_REVIEW_SELECTION);}
function createSelectedControlTranscript(input,selection){
  const expected=expectedBindings(input);
  let phase='PREPARED',reason=null,host=null,scope=null,binding=null,permits=0;
  const inspect=()=>freeze({protocol:'soloco-protected-context-transcript-data-v1',phase,terminal_reason:reason,host_instance_id:host,scope_instance_id:scope,binding_sha256:binding,context_permits_generated:permits});
  const active=()=>{if(phase==='UNKNOWN'||phase==='POISONED')fail('PROTECTED_CONTEXT_CLOSED');};
  function transition(operation){
    active();try{return operation();}catch(error){phase='POISONED';reason=typeof error?.code==='string'?error.code:'PROTECTED_CONTEXT_TRANSCRIPT_INVALID';throw error;}
  }
  const requirePhase=wanted=>{if(phase!==wanted)fail('PROTECTED_CONTEXT_SEQUENCE');};
  return Object.freeze({
    challengeBytes(){return transition(()=>{
      requirePhase('PREPARED');
      const challenge={protocol:PROTOCOL,kind:'challenge',...expected,context_contract:selection};
      const bytes=Buffer.from(JSON.stringify(challenge)+'\n');if(bytes.length-1>MAX_FRAME)fail('PROTECTED_CONTEXT_FRAME_INVALID');
      phase='CHALLENGED';return bytes;
    });},
    noteInitializeSent(){return transition(()=>{requirePhase('CHALLENGED');phase='INITIALIZE_SENT';return inspect();});},
    acceptFrame(raw){return transition(()=>{
      if(!['INITIALIZE_SENT','HOST_BOOTSTRAPPED'].includes(phase))fail('PROTECTED_CONTEXT_SEQUENCE');
      const parsed=parseSelectedControlFrame(raw,selection),frame=parsed.observation;
      if(phase==='INITIALIZE_SENT'){
        if(parsed.kind!=='host_bootstrap')fail('PROTECTED_CONTEXT_SEQUENCE');
        for(const key of EXPECTED.filter(key=>key!=='upstream_url'))if(frame[key]!==expected[key])fail('PROTECTED_CONTEXT_BINDING_CHANGED');
        if(frame.loopback_proxy_port!==expected.loopback_proxy_port)fail('PROTECTED_CONTEXT_BINDING_CHANGED');
        host=frame.host_instance_id;phase='HOST_BOOTSTRAPPED';
        return Object.freeze({kind:'bootstrap-data',observation:frame});
      }
      if(parsed.kind!=='observation'||frame.kind!=='scoped_context_contract')fail('PROTECTED_CONTEXT_SEQUENCE');
      if(!scopedShape(frame,selection))fail('PROTECTED_CONTEXT_BINDING_CHANGED');
      for(const key of ['nonce','pid','slot_id','executable_sha256','source_manifest_sha256'])if(frame[key]!==expected[key])fail('PROTECTED_CONTEXT_BINDING_CHANGED');
      if(frame.host_instance_id!==host||permits!==0)fail('PROTECTED_CONTEXT_BINDING_CHANGED');
      scope=frame.scope_instance_id;binding=parsed.binding_sha256;permits=1;
      const permit={protocol:PROTOCOL,kind:'context_contract_permit',nonce:expected.nonce,pid:expected.pid,slot_id:expected.slot_id,
        source_manifest_sha256:expected.source_manifest_sha256,host_instance_id:host,scope_instance_id:scope,binding_sha256:binding,
        context_contract_protocol:frame.context_contract_protocol,context_contract_id:frame.context_contract_id,context_contract_sha256:frame.context_contract_sha256,
        context_encoding:frame.context_encoding,scope_profile_id:frame.scope_profile_id,evidence_scope:frame.evidence_scope};
      phase='CONTEXT_PERMIT_PENDING';
      return Object.freeze({kind:'context-permit-data',observation:frame,binding_sha256:binding,rawObservation:Buffer.from(parsed.rawObservation),permitBytes:Buffer.from(JSON.stringify(permit)+'\n')});
    });},
    noteContextPermitSent(){return transition(()=>{requirePhase('CONTEXT_PERMIT_PENDING');phase='CONTEXT_ACKNOWLEDGED';return inspect();});},
    closeUnknown(why){
      if(phase==='UNKNOWN'||phase==='POISONED')return inspect();
      return transition(()=>{if(!['timeout','io-error','eof','cancelled','closed'].includes(why))fail('PROTECTED_CONTEXT_UNKNOWN_REASON');phase='UNKNOWN';reason=why;return inspect();});
    },
    inspect,
  });
}
