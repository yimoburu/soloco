// PURE mechanical whole-delivery framing only. No authority/meaning/profile
// qualification, FS, network, child, model, P1 mutation or native observation.
// Business JSON is hashed/counts EXACT original UTF8 RawValue bytes and is
// NEVER reserialized. All limits remain the original selected caller's limits.
import {createHash} from 'node:crypto';
export const PEER_DELIVERY_FRAME_PROTOCOL='soloco-peer-context-frame-v2';
const MAX_PAYLOAD_UTF8=200000,MAX_FRAME_UTF8=4000000;
const originalErrors=new WeakSet();
const fail=code=>{const error=Object.assign(Error(code),{code});originalErrors.add(error);throw error;};
export const isPeerDeliveryFrameError=error=>Boolean(error&&typeof error==='object'&&originalErrors.has(error));
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const sha=text=>typeof text==='string'&&/^[a-f0-9]{64}$/.test(text);
const own=(value,keys)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('DELIVERY_FRAME_ARGUMENT');
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))fail('DELIVERY_FRAME_ARGUMENT');
 const result={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('DELIVERY_FRAME_ARGUMENT');result[key]=d.value;}return result;
};
const fields=['contract_sha256','delivery_kind','payload_protocol','payload_sha256','payload_utf8_bytes','source_cut_protocol','source_cut_sha256','source_cut_utf8_bytes','maximum_frame_bytes'];
function binding(a){
 if(!sha(a.contract_sha256)||!sha(a.payload_sha256)||!Number.isSafeInteger(a.payload_utf8_bytes)||a.payload_utf8_bytes<1||a.payload_utf8_bytes>MAX_PAYLOAD_UTF8||!Number.isSafeInteger(a.maximum_frame_bytes)||a.maximum_frame_bytes<1||a.maximum_frame_bytes>MAX_FRAME_UTF8)fail('DELIVERY_FRAME_ARGUMENT');
 if(a.delivery_kind==='task-context'){
  if(!['peer-task-context-v1','peer-task-context-v2'].includes(a.payload_protocol)||a.source_cut_protocol!==null||a.source_cut_sha256!==null||a.source_cut_utf8_bytes!==null)fail('DELIVERY_FRAME_SELECTOR');
 }else if(a.delivery_kind==='membership-assignment'){
  if(a.payload_protocol!=='peer-membership-assignment-v1'||!['peer-membership-context-v1','peer-membership-context-v2'].includes(a.source_cut_protocol)||!sha(a.source_cut_sha256)||!Number.isSafeInteger(a.source_cut_utf8_bytes)||a.source_cut_utf8_bytes<1||a.source_cut_utf8_bytes>a.payload_utf8_bytes)fail('DELIVERY_FRAME_SELECTOR');
 }else fail('DELIVERY_FRAME_SELECTOR');
}
// Validate JSON without converting any business value back into text. This
// iterative lexical selector returns exact top-level RawValue spans. Root
// duplicate keys reject; nested unknown business data stays byte-for-byte.
function objectSpans(text){
 let parsed;try{parsed=JSON.parse(text);}catch{fail('DELIVERY_FRAME_JSON');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('DELIVERY_FRAME_JSON');
 const skip=i=>{while(i<text.length&&/[\x20\t\r\n]/.test(text[i]))i++;return i;};
 const stringEnd=start=>{let i=start+1;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i]==='"')return i+1;i++;}fail('DELIVERY_FRAME_JSON');};
 const endValue=start=>{
  let i=start,depth=0;
  for(;i<text.length;i++){
   const c=text[i];if(c==='"'){i=stringEnd(i)-1;continue;}
   if(c==='{'||c==='['){depth++;continue;}
   if(c==='}'||c===']'){if(depth===0)return i;depth--;continue;}
   if(c===','&&depth===0)return i;
  }
  fail('DELIVERY_FRAME_JSON');
 };
 let i=skip(0);if(text[i++]!=='{')fail('DELIVERY_FRAME_JSON');const spans=new Map();i=skip(i);
 if(text[i]==='}')return spans;
 for(;;){
  if(text[i]!=='"')fail('DELIVERY_FRAME_JSON');const end=stringEnd(i);let key;try{key=JSON.parse(text.slice(i,end));}catch{fail('DELIVERY_FRAME_JSON');}
  if(spans.has(key))fail('DELIVERY_FRAME_DUPLICATE');i=skip(end);if(text[i++]!==':')fail('DELIVERY_FRAME_JSON');i=skip(i);
  const start=i,finish=endValue(start);spans.set(key,text.slice(start,finish).trimEnd());i=skip(finish);
  if(text[i]==='}')return spans;if(text[i++]!==',')fail('DELIVERY_FRAME_JSON');i=skip(i);
 }
}
const selector=(spans,key)=>{if(!spans.has(key))fail('DELIVERY_FRAME_SELECTOR');try{return JSON.parse(spans.get(key));}catch{fail('DELIVERY_FRAME_SELECTOR');}};
function payload(text,a){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')!==a.payload_utf8_bytes||Buffer.from(text,'utf8').toString('utf8')!==text||hash(text)!==a.payload_sha256)fail('DELIVERY_FRAME_PAYLOAD_CHANGED');
 const outer=objectSpans(text);if(selector(outer,'protocol')!==a.payload_protocol)fail('DELIVERY_FRAME_SELECTOR');
 if(a.delivery_kind==='membership-assignment'){
  const inner=outer.get('source_cut');if(typeof inner!=='string'||selector(outer,'source_cut_sha256')!==a.source_cut_sha256||Buffer.byteLength(inner,'utf8')!==a.source_cut_utf8_bytes||hash(inner)!==a.source_cut_sha256)fail('DELIVERY_FRAME_SOURCE_CUT_CHANGED');
  if(selector(objectSpans(inner),'protocol')!==a.source_cut_protocol)fail('DELIVERY_FRAME_SELECTOR');
 }
 // NEVER stringify parsed business JSON: hashes and return values bind raw text.
 return text;
}
function prefix(a){return '{"protocol":"'+PEER_DELIVERY_FRAME_PROTOCOL+'","contract_sha256":"'+a.contract_sha256+'","delivery_kind":"'+a.delivery_kind+'","payload_protocol":"'+a.payload_protocol+'","payload_sha256":"'+a.payload_sha256+'","payload_utf8_bytes":'+a.payload_utf8_bytes+',"source_cut_protocol":'+JSON.stringify(a.source_cut_protocol)+',"source_cut_sha256":'+JSON.stringify(a.source_cut_sha256)+',"source_cut_utf8_bytes":'+a.source_cut_utf8_bytes+',"payload":';}
export function encodePeerDeliveryFrame(input){
 const a=own(input,[...fields,'payload_text']);binding(a);const raw=payload(a.payload_text,a),text=prefix(a)+raw+'}',utf8_bytes=Buffer.byteLength(text,'utf8');
 if(utf8_bytes>a.maximum_frame_bytes)fail('DELIVERY_FRAME_CAPACITY');
 return Object.freeze({text,sha256:hash(text),utf8_bytes,payload_sha256:a.payload_sha256,payload_utf8_bytes:a.payload_utf8_bytes});
}
export function decodePeerDeliveryFrame(text,expected){
 const a=own(expected,fields);binding(a);
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>a.maximum_frame_bytes||Buffer.from(text,'utf8').toString('utf8')!==text)fail('DELIVERY_FRAME_CAPACITY');
 // Exact fixed grammar; reordered/duplicate/extra keys or trailing formatting
 // reject rather than becoming aliases accepted by a generic object parser.
 const match=/^\{"protocol":"soloco-peer-context-frame-v2","contract_sha256":"([a-f0-9]{64})","delivery_kind":"(task-context|membership-assignment)","payload_protocol":"(peer-task-context-v[12]|peer-membership-assignment-v1)","payload_sha256":"([a-f0-9]{64})","payload_utf8_bytes":([1-9][0-9]{0,5}),"source_cut_protocol":(null|"peer-membership-context-v[12]"),"source_cut_sha256":(null|"[a-f0-9]{64}"),"source_cut_utf8_bytes":(null|[1-9][0-9]{0,5}),"payload":/.exec(text);
 if(!match||!text.endsWith('}'))fail('DELIVERY_FRAME_GRAMMAR');
 const observed={contract_sha256:match[1],delivery_kind:match[2],payload_protocol:match[3],payload_sha256:match[4],payload_utf8_bytes:Number(match[5]),source_cut_protocol:JSON.parse(match[6]),source_cut_sha256:JSON.parse(match[7]),source_cut_utf8_bytes:JSON.parse(match[8])};
 if(Object.keys(observed).some(key=>observed[key]!==a[key]))fail('DELIVERY_FRAME_BINDING');
 const raw=text.slice(match[0].length,-1);payload(raw,a);
 return Object.freeze({protocol:PEER_DELIVERY_FRAME_PROTOCOL,...observed,payload_text:raw,frame_sha256:hash(text),frame_utf8_bytes:Buffer.byteLength(text,'utf8')});
}
