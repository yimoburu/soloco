// Distinct bootstrap-only mechanical codec. No company meaning, native identity,
// admission, purpose, launch or qualification is supplied by these DATA helpers.
// Keep the ordinary five-tool resource and peer-delivery-frame.mjs unchanged.
import {createHash} from 'node:crypto';

export const BOOTSTRAP_PROFILE='soloco-bootstrap-membership-readonly3-v1';
export const BOOTSTRAP_CONTEXT_SELECTION=Object.freeze({protocol:'soloco-bootstrap-membership-context-contract-v1',contract_id:'bootstrap-membership-readonly3-whole-assignment-v1',resource_sha256:'cd1ce3adaad300721e47238292ce15dc41f7007b6e415b76c005e93419656ed4',context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:BOOTSTRAP_PROFILE});
const FRAME='soloco-peer-context-frame-v2',ASSIGNMENT='peer-bootstrap-membership-assignment-v1',CONTEXT='peer-bootstrap-membership-context-v1',BASIS='peer-checked-input-current-meaning-v1';
const MAX_PAYLOAD=65536,MAX_FRAME=100000;
const description='Private bootstrap membership context protocol; identity and authority are supplied only by the original protected composition.';
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const tools=freeze([
 {type:'function',name:'soloco_context_header',description,inputSchema:{type:'object',properties:{},required:[],additionalProperties:false}},
 {type:'function',name:'soloco_context_read',description,inputSchema:{type:'object',properties:{sha256:{type:'string'},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:4096}},required:['sha256','offset','length'],additionalProperties:false}},
 {type:'function',name:'soloco_context_submit',description,inputSchema:{type:'object',properties:{sha256:{type:'string'},content:{type:'string'}},required:['sha256','content'],additionalProperties:false}}
]);
// No argument can select a subset or substitute an ordinary five-tool schema.
export function bootstrapReadonly3Tools(...args){if(args.length)fail('DELIVERY_FRAME_ARGUMENT');return tools;}
const errors=new WeakSet();
const fail=code=>{const e=Object.assign(Error(code),{code});errors.add(e);throw e;};
export const isBootstrapMembershipDeliveryFrameError=e=>Boolean(e&&typeof e==='object'&&errors.has(e));
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const sha=text=>typeof text==='string'&&/^[a-f0-9]{64}$/.test(text);
const validText=text=>typeof text==='string'&&Buffer.from(text,'utf8').toString('utf8')===text;
function own(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('DELIVERY_FRAME_ARGUMENT');
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))fail('DELIVERY_FRAME_ARGUMENT');
 const result={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('DELIVERY_FRAME_ARGUMENT');result[k]=d.value;}return result;
}
// Select exact JSON RawValue spans without reserializing business content.
// Duplicate decoded selector keys reject, including escaped-key aliases.
function objectSpans(text){
 let parsed;try{parsed=JSON.parse(text);}catch{fail('DELIVERY_FRAME_JSON');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('DELIVERY_FRAME_JSON');
 const skip=i=>{while(i<text.length&&/[\x20\t\r\n]/.test(text[i]))i++;return i;};
 const stringEnd=start=>{let i=start+1;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i]==='"')return i+1;i++;}fail('DELIVERY_FRAME_JSON');};
 const endValue=start=>{let depth=0;for(let i=start;i<text.length;i++){const c=text[i];if(c==='"'){i=stringEnd(i)-1;continue;}if(c==='{'||c==='['){depth++;continue;}if(c==='}'||c===']'){if(depth===0)return i;depth--;continue;}if(c===','&&depth===0)return i;}fail('DELIVERY_FRAME_JSON');};
 let i=skip(0);if(text[i++]!=='{')fail('DELIVERY_FRAME_JSON');const spans=new Map();i=skip(i);if(text[i]==='}')return spans;
 for(;;){
  if(text[i]!=='"')fail('DELIVERY_FRAME_JSON');const end=stringEnd(i);let key;try{key=JSON.parse(text.slice(i,end));}catch{fail('DELIVERY_FRAME_JSON');}
  if(spans.has(key))fail('DELIVERY_FRAME_DUPLICATE');i=skip(end);if(text[i++]!==':')fail('DELIVERY_FRAME_JSON');i=skip(i);
  const start=i,finish=endValue(start);spans.set(key,text.slice(start,finish).trimEnd());i=skip(finish);if(text[i]==='}')return spans;if(text[i++]!==',')fail('DELIVERY_FRAME_JSON');i=skip(i);
 }
}
const selector=(spans,key)=>{if(!spans.has(key))fail('DELIVERY_FRAME_SELECTOR');try{return JSON.parse(spans.get(key));}catch{fail('DELIVERY_FRAME_SELECTOR');}};
export function bootstrapAssignmentSourceCut(text){
 if(typeof text!=='string'||text.length>MAX_PAYLOAD||Buffer.byteLength(text)>MAX_PAYLOAD||!validText(text))fail('DELIVERY_FRAME_PAYLOAD_CHANGED');
 const outer=objectSpans(text);if(selector(outer,'protocol')!==ASSIGNMENT)fail('DELIVERY_FRAME_SELECTOR');
 const raw=outer.get('source_cut'),expected=selector(outer,'source_cut_sha256');if(typeof raw!=='string'||!sha(expected)||hash(raw)!==expected)fail('DELIVERY_FRAME_SOURCE_CUT_CHANGED');
 const inner=objectSpans(raw);if(selector(inner,'protocol')!==CONTEXT)fail('DELIVERY_FRAME_SELECTOR');
 const meaning=inner.get('current_meaning');if(typeof meaning!=='string'||selector(objectSpans(meaning),'protocol')!==BASIS)fail('DELIVERY_FRAME_SELECTOR');
 return Object.freeze({value:JSON.parse(raw),raw,sha256:expected,utf8_bytes:Buffer.byteLength(raw)});
}
const fields=['contract_sha256','delivery_kind','payload_protocol','payload_sha256','payload_utf8_bytes','source_cut_protocol','source_cut_sha256','source_cut_utf8_bytes','maximum_frame_bytes'];
function binding(a){
 if(a.contract_sha256!==BOOTSTRAP_CONTEXT_SELECTION.resource_sha256||!sha(a.payload_sha256)||!Number.isSafeInteger(a.payload_utf8_bytes)||a.payload_utf8_bytes<1||a.payload_utf8_bytes>MAX_PAYLOAD||!Number.isSafeInteger(a.maximum_frame_bytes)||a.maximum_frame_bytes<1||a.maximum_frame_bytes>MAX_FRAME)fail('DELIVERY_FRAME_ARGUMENT');
 if(a.delivery_kind!=='bootstrap-membership-assignment'||a.payload_protocol!==ASSIGNMENT||a.source_cut_protocol!==CONTEXT||!sha(a.source_cut_sha256)||!Number.isSafeInteger(a.source_cut_utf8_bytes)||a.source_cut_utf8_bytes<1||a.source_cut_utf8_bytes>a.payload_utf8_bytes)fail('DELIVERY_FRAME_SELECTOR');
}
function payload(text,a){
 if(typeof text!=='string'||text.length>a.payload_utf8_bytes||Buffer.byteLength(text)!==a.payload_utf8_bytes||!validText(text)||hash(text)!==a.payload_sha256)fail('DELIVERY_FRAME_PAYLOAD_CHANGED');
 const source=bootstrapAssignmentSourceCut(text);if(source.sha256!==a.source_cut_sha256||source.utf8_bytes!==a.source_cut_utf8_bytes)fail('DELIVERY_FRAME_SOURCE_CUT_CHANGED');return text;
}
function prefix(a){return '{"protocol":"'+FRAME+'","contract_sha256":"'+a.contract_sha256+'","delivery_kind":"'+a.delivery_kind+'","payload_protocol":"'+a.payload_protocol+'","payload_sha256":"'+a.payload_sha256+'","payload_utf8_bytes":'+a.payload_utf8_bytes+',"source_cut_protocol":"'+a.source_cut_protocol+'","source_cut_sha256":"'+a.source_cut_sha256+'","source_cut_utf8_bytes":'+a.source_cut_utf8_bytes+',"payload":';}
export function encodeBootstrapMembershipDeliveryFrame(input){
 const a=own(input,[...fields,'payload_text']);binding(a);const text=prefix(a)+payload(a.payload_text,a)+'}',utf8_bytes=Buffer.byteLength(text);if(utf8_bytes>a.maximum_frame_bytes)fail('DELIVERY_FRAME_CAPACITY');
 return Object.freeze({text,sha256:hash(text),utf8_bytes,payload_sha256:a.payload_sha256,payload_utf8_bytes:a.payload_utf8_bytes});
}
export function decodeBootstrapMembershipDeliveryFrame(text,expected){
 const a=own(expected,fields);binding(a);if(typeof text!=='string'||text.length>a.maximum_frame_bytes||Buffer.byteLength(text)>a.maximum_frame_bytes||!validText(text))fail('DELIVERY_FRAME_CAPACITY');
 // Compare the complete fixed prefix, including every selector and byte/hash
 // field. Reordered/duplicate/extra frame keys cannot become aliases.
 const start=prefix(a);if(!text.startsWith(start)||!text.endsWith('}'))fail('DELIVERY_FRAME_BINDING');const raw=text.slice(start.length,-1);payload(raw,a);
 return Object.freeze({protocol:FRAME,contract_sha256:a.contract_sha256,delivery_kind:a.delivery_kind,payload_protocol:a.payload_protocol,payload_sha256:a.payload_sha256,payload_utf8_bytes:a.payload_utf8_bytes,source_cut_protocol:a.source_cut_protocol,source_cut_sha256:a.source_cut_sha256,source_cut_utf8_bytes:a.source_cut_utf8_bytes,payload_text:raw,frame_sha256:hash(text),frame_utf8_bytes:Buffer.byteLength(text)});
}
