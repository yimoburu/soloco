// Distinct INPUT FRONTIER SOURCE contract. Geometry and checksums confer no
// semantic qualification, authority, native identity or closure evidence.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {canonical} from './ledger.mjs';
import {parseGatewayJSON} from './gateway-wire.mjs';
import {FRONTIER_CONTEXT,FRONTIER_INSTRUCTION} from './input-frontier.mjs';
import {peerContextTurnInput,formatPeerContextFirstTurnWire} from './peer-context-interpreter.mjs';
import {resolveOriginalInputFrontierInterpreter,assertOriginalInputFrontierInterpreterFinal,inspectOriginalInputFrontierInterpreter} from './protected-source-build-slot.mjs';

export const INPUT_FRONTIER_PROFILE='soloco-input-frontier-readonly-v1';
export const INPUT_FRONTIER_CONTEXT_SELECTION=Object.freeze({protocol:'soloco-input-frontier-context-contract-v1',contract_id:'input-frontier-readonly3-whole-assignment-v1',resource_sha256:'b15ae178857196eac75123652817c1673a2e4941b409f6d5cbb72225800f7863',context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:INPUT_FRONTIER_PROFILE});
const FRAME=100000,MAX=65536,plans=new WeakMap(),GEOMETRY_NATIVE='ffffffff-ffff-7fff-bfff-ffffffffffff';
const fail=code=>{throw Object.assign(Error(code),{code});};
const digest=b=>createHash('sha256').update(b).digest('hex');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>canonical(a)===canonical(b);
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
function closed(v,keys){
 if(types.isProxy(v)||!v||Object.getPrototypeOf(v)!==Object.prototype)fail('FRONTIER_WIRE_INPUT');
 const ds=Object.getOwnPropertyDescriptors(v),found=Reflect.ownKeys(ds);
 if(found.length!==keys.length||found.some(k=>typeof k!=='string'||!keys.includes(k)||!ds[k].enumerable||!Object.hasOwn(ds[k],'value')))fail('FRONTIER_WIRE_INPUT');return v;
}
function resource(){
 const bytes=fs.readFileSync(new URL('./input-frontier-readonly3-contract-v1.json',import.meta.url));
 if(digest(bytes)!==INPUT_FRONTIER_CONTEXT_SELECTION.resource_sha256)fail('FRONTIER_WIRE_RESOURCE_CHANGED');
 const r=parseGatewayJSON(bytes,{max_bytes:16384,max_depth:16});
 if(r.protocol!==INPUT_FRONTIER_CONTEXT_SELECTION.protocol||r.contract_id!==INPUT_FRONTIER_CONTEXT_SELECTION.contract_id||r.scope_profile_id!==INPUT_FRONTIER_PROFILE||r.delivery?.delivery_kind!=='input-frontier-assignment'||r.delivery.payload_protocol!==FRONTIER_CONTEXT||r.delivery.source_cut_protocol!==null||!Array.isArray(r.tools)||r.tools.length!==3)fail('FRONTIER_WIRE_RESOURCE_CHANGED');
 return r;
}
export function inputFrontierReadonly3Tools(...args){if(args.length)fail('FRONTIER_WIRE_INPUT');return freeze(resource().tools);}
// Match the original SDK JsonSchema serialization, which omits numeric bounds.
// The channel still enforces the original 4096-character read bound.
export function inputFrontierResponsesTools(...args){
 if(args.length)fail('FRONTIER_WIRE_INPUT');const parameters=s=>{const out={type:s.type};if(s.enum!==undefined)out.enum=s.enum;if(s.type==='object')out.properties=Object.fromEntries(Object.entries(s.properties??{}).map(([k,v])=>[k,parameters(v)]));if(s.required!==undefined)out.required=s.required;if(s.additionalProperties!==undefined)out.additionalProperties=s.additionalProperties;return out;};
 return freeze(inputFrontierReadonly3Tools().map(t=>({type:'function',name:t.name,description:t.description,strict:false,parameters:parameters(t.inputSchema)})));
}
// JSON syntax and decoded-key uniqueness only. Business values are opaque raw
// spans: escaped lone UTF16 units and finite unsafe integers in original_units
// are legitimate ledger JSON. The stricter gateway CONTROL parser must never
// materialize or narrow this business domain. Only selectors below are decoded.
function objectSpans(text){
 if(typeof text!=='string')fail('FRONTIER_WIRE_JSON');
 let at=0;const invalid=()=>fail('FRONTIER_WIRE_JSON');
 const ws=()=>{while(at<text.length&&/[ \t\r\n]/.test(text[at]))at++;};
 function stringEnd(){
  if(text[at++]!=='"')invalid();
  while(at<text.length){const c=text[at++];if(c==='"')return at;if(c.charCodeAt(0)<32)invalid();if(c==='\\'){const e=text[at++];if(e==='u'){if(!/^[0-9a-fA-F]{4}$/.test(text.slice(at,at+4)))invalid();at+=4;}else if(!['"','\\','/','b','f','n','r','t'].includes(e))invalid();}}
  invalid();
 }
 // An iterative syntax walker is bounded by the original <=65536-byte input;
 // it does not add a gateway-specific depth or integer-domain restriction.
 function valueEnd(){
  const stack=[{kind:'root',state:'value'}];
  const start=()=>{
   ws();const c=text[at];
   if(c==='{'||c==='['){at++;stack.push({kind:c==='{'?'object':'array',state:c==='{'?'key-or-end':'value-or-end',keys:c==='{'?new Set():null});return;}
   if(c==='"'){stringEnd();return;}
   for(const literal of ['true','false','null'])if(text.startsWith(literal,at)){at+=literal.length;return;}
   const number=/-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;number.lastIndex=at;const found=number.exec(text);if(!found)invalid();at=number.lastIndex;
  };
  for(;;){
   const frame=stack[stack.length-1];ws();
   if(frame.kind==='root'){if(frame.state==='done')return at;frame.state='done';start();continue;}
   if(frame.kind==='object'){
    if(frame.state==='key-or-end'||frame.state==='key'){
     if(text[at]==='}'&&frame.state==='key-or-end'){at++;stack.pop();continue;}
     const begin=at;stringEnd();let key;try{key=JSON.parse(text.slice(begin,at));}catch{invalid();}if(frame.keys.has(key))fail('FRONTIER_WIRE_DUPLICATE');frame.keys.add(key);frame.state='colon';continue;
    }
    if(frame.state==='colon'){if(text[at++]!==':')invalid();frame.state='value';continue;}
    if(frame.state==='value'){frame.state='comma-or-end';start();continue;}
    if(text[at]==='}'){at++;stack.pop();continue;}if(text[at++]!==',')invalid();frame.state='key';continue;
   }
   if(frame.state==='value-or-end'){if(text[at]===']'){at++;stack.pop();continue;}frame.state='comma-or-end';start();continue;}
   if(frame.state==='value'){frame.state='comma-or-end';start();continue;}
   if(text[at]===']'){at++;stack.pop();continue;}if(text[at++]!==',')invalid();frame.state='value';
  }
 }
 ws();if(text[at]!=='{')invalid();valueEnd();ws();if(at!==text.length)invalid();
 // Retain exact outer spans after syntax/duplicate validation of every value.
 at=0;ws();at++;const spans=new Map();ws();if(text[at]==='}')return spans;
 for(;;){const begin=at;stringEnd();const key=JSON.parse(text.slice(begin,at));ws();if(text[at++]!==':')invalid();ws();const start=at,end=valueEnd();spans.set(key,text.slice(start,end).trimEnd());ws();if(text[at]==='}')return spans;if(text[at++]!==',')invalid();ws();}
}
function assignment(text){
 if(typeof text!=='string'||!text.length||text.length>MAX||Buffer.byteLength(text)>MAX||Buffer.from(text).toString('utf8')!==text)fail('FRONTIER_WIRE_PAYLOAD');
 const spans=objectSpans(text),fields=['protocol','connection','subject','instruction','authority','unit','children','producer','final_node','response_protocol','response_contract'];
 if(spans.size!==fields.length||fields.some(k=>!spans.has(k)))fail('FRONTIER_WIRE_PAYLOAD');
 const selector=(map,key)=>{if(!map.has(key))fail('FRONTIER_WIRE_PAYLOAD');try{return JSON.parse(map.get(key));}catch{fail('FRONTIER_WIRE_PAYLOAD');}};
 const authority=objectSpans(spans.get('authority')),policy=objectSpans(authority.get('peer_policy')),maximum=selector(policy,'max_context_bytes');
 if(selector(spans,'protocol')!==FRONTIER_CONTEXT||selector(spans,'instruction')!==FRONTIER_INSTRUCTION||!Number.isSafeInteger(maximum)||maximum<512||maximum>MAX||Buffer.byteLength(text)>maximum)fail('FRONTIER_WIRE_PAYLOAD');return {maximum};
}
const keys=['contract_sha256','delivery_kind','payload_protocol','payload_sha256','payload_utf8_bytes','source_cut_protocol','source_cut_sha256','source_cut_utf8_bytes','maximum_frame_bytes'];
function binding(a){
 if(a.contract_sha256!==INPUT_FRONTIER_CONTEXT_SELECTION.resource_sha256||a.delivery_kind!=='input-frontier-assignment'||a.payload_protocol!==FRONTIER_CONTEXT||!hash(a.payload_sha256)||!Number.isSafeInteger(a.payload_utf8_bytes)||a.payload_utf8_bytes<1||a.payload_utf8_bytes>MAX||a.source_cut_protocol!==null||a.source_cut_sha256!==null||a.source_cut_utf8_bytes!==null||!Number.isSafeInteger(a.maximum_frame_bytes)||a.maximum_frame_bytes<1||a.maximum_frame_bytes>FRAME)fail('FRONTIER_WIRE_BINDING');
}
const prefix=a=>'{"protocol":"soloco-peer-context-frame-v2","contract_sha256":"'+a.contract_sha256+'","delivery_kind":"input-frontier-assignment","payload_protocol":"'+FRONTIER_CONTEXT+'","payload_sha256":"'+a.payload_sha256+'","payload_utf8_bytes":'+a.payload_utf8_bytes+',"source_cut_protocol":null,"source_cut_sha256":null,"source_cut_utf8_bytes":null,"payload":';
export function encodeInputFrontierDeliveryFrame(input){
 const a=closed(input,[...keys,'payload_text']);binding(a);assignment(a.payload_text);
 if(Buffer.byteLength(a.payload_text)!==a.payload_utf8_bytes||digest(a.payload_text)!==a.payload_sha256)fail('FRONTIER_WIRE_PAYLOAD');
 const text=prefix(a)+a.payload_text+'}',utf8_bytes=Buffer.byteLength(text);if(utf8_bytes>a.maximum_frame_bytes)fail('FRONTIER_WIRE_CAPACITY');return freeze({text,sha256:digest(text),utf8_bytes,payload_sha256:a.payload_sha256,payload_utf8_bytes:a.payload_utf8_bytes});
}
export function decodeInputFrontierDeliveryFrame(text,expected){
 const a=closed(expected,keys);binding(a);
 if(typeof text!=='string'||text.length>a.maximum_frame_bytes||Buffer.byteLength(text)>a.maximum_frame_bytes||Buffer.from(text).toString('utf8')!==text||!text.startsWith(prefix(a))||!text.endsWith('}'))fail('FRONTIER_WIRE_BINDING');
 const payload=text.slice(prefix(a).length,-1);assignment(payload);if(Buffer.byteLength(payload)!==a.payload_utf8_bytes||digest(payload)!==a.payload_sha256)fail('FRONTIER_WIRE_PAYLOAD');return freeze({payload_text:payload,payload_sha256:a.payload_sha256,payload_utf8_bytes:a.payload_utf8_bytes,frame_sha256:digest(text),frame_utf8_bytes:Buffer.byteLength(text)});
}
export function formatInputFrontierFirstRpcGeometry(text,instruction){
 if(arguments.length!==2||instruction!==FRONTIER_INSTRUCTION)fail('FRONTIER_WIRE_INPUT');const {maximum}=assignment(text);
 const binding={contract_sha256:INPUT_FRONTIER_CONTEXT_SELECTION.resource_sha256,delivery_kind:'input-frontier-assignment',payload_protocol:FRONTIER_CONTEXT,payload_sha256:digest(text),payload_utf8_bytes:Buffer.byteLength(text),source_cut_protocol:null,source_cut_sha256:null,source_cut_utf8_bytes:null,maximum_frame_bytes:FRAME},frame=encodeInputFrontierDeliveryFrame({...binding,payload_text:text});decodeInputFrontierDeliveryFrame(frame.text,binding);
 const input=peerContextTurnInput(instruction,frame.text),rpc=formatPeerContextFirstTurnWire(instruction,frame.text,GEOMETRY_NATIVE,FRAME);
 if(Buffer.byteLength(JSON.stringify(input))>FRAME||rpc.utf8_bytes>FRAME)fail('FRONTIER_WIRE_CAPACITY');return freeze({frame,input,whole_rpc_utf8_bytes:rpc.utf8_bytes,context_utf8_bytes:Buffer.byteLength(text),policy_maximum_context_bytes:maximum});
}
function association(h){assertOriginalInputFrontierInterpreterFinal(h);const value=inspectOriginalInputFrontierInterpreter(h);if(!hash(value?.recipe_sha256)||!same(value.selection,INPUT_FRONTIER_CONTEXT_SELECTION))fail('FRONTIER_WIRE_INTERPRETER_CHANGED');return value;}
export function preflightOriginalInputFrontierContext(text,instruction){
 if(arguments.length!==2)fail('FRONTIER_WIRE_INPUT');const geometry=formatInputFrontierFirstRpcGeometry(text,instruction),interpreter=resolveOriginalInputFrontierInterpreter(),selected=association(interpreter),plan=Object.freeze(Object.create(null));
 const receipt=freeze({protocol:'peer-input-frontier-first-rpc-v1',payload_sha256:digest(text),instruction_sha256:digest(instruction),frame_sha256:geometry.frame.sha256,recipe_sha256:selected.recipe_sha256,whole_rpc_utf8_bytes:geometry.whole_rpc_utf8_bytes,frame_bytes:FRAME,context_utf8_bytes:geometry.context_utf8_bytes,policy_maximum_context_bytes:geometry.policy_maximum_context_bytes,native_identity:'UNOBSERVED_GEOMETRY_ONLY'});
 plans.set(plan,{interpreter,association:canonical(selected),geometry,receipt});return plan;
}
function original(plan){const r=plans.get(plan);if(!r||canonical(association(r.interpreter))!==r.association)fail('FRONTIER_WIRE_ORIGINAL_PLAN_REQUIRED');return r;}
export function inspectOriginalInputFrontierPreflight(plan){if(arguments.length!==1)fail('FRONTIER_WIRE_INPUT');return original(plan).receipt;}
export function originalInputFrontierPreflightInterpreter(plan){return original(plan).interpreter;}
export function originalInputFrontierPreflightInput(plan){return original(plan).geometry.input;}
