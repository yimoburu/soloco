import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {FRONTIER_CONTEXT,FRONTIER_INSTRUCTION} from '../plugins/soloco/runtime/peers/input-frontier.mjs';
import * as wire from '../plugins/soloco/runtime/peers/input-frontier-wire.mjs';
import {assertOriginalInputFrontierInterpreterFinal} from '../plugins/soloco/runtime/peers/protected-source-build-slot.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex'),held=()=>true;
// Mechanical assignment DATA only: no real ledger, selected maintenance,
// source frontier, independent result, admission, native or qualified meaning.
const assignment=(unit='SYNTHETIC café 🧭')=>canonical({protocol:FRONTIER_CONTEXT,connection:{company_id:'SYNTHETIC'},subject:{stage:'produce'},instruction:FRONTIER_INSTRUCTION,authority:{peer_policy:{max_context_bytes:65536}},unit,children:[],producer:null,final_node:false,response_protocol:'peer-input-frontier-result-v1',response_contract:{synthetic:true}});
const binding=text=>({contract_sha256:wire.INPUT_FRONTIER_CONTEXT_SELECTION.resource_sha256,delivery_kind:'input-frontier-assignment',payload_protocol:FRONTIER_CONTEXT,payload_sha256:sha(text),payload_utf8_bytes:Buffer.byteLength(text),source_cut_protocol:null,source_cut_sha256:null,source_cut_utf8_bytes:null,maximum_frame_bytes:100000});
const encode=text=>wire.encodeInputFrontierDeliveryFrame({...binding(text),payload_text:text});

test('frontier fixed Node and Rust resources match and expose exactly the separate readonly3 grammar',()=>{
 const node=fs.readFileSync(new URL('../plugins/soloco/runtime/peers/input-frontier-readonly3-contract-v1.json',import.meta.url)),rust=fs.readFileSync(new URL('../native/codex/overlay/codex-rs/codex-api/src/protected_peer/input_frontier_readonly3_contract_v1.json',import.meta.url));
 assert.deepEqual(node,rust);assert.equal(node.length,2697);assert.equal(sha(node),wire.INPUT_FRONTIER_CONTEXT_SELECTION.resource_sha256);
 const tools=wire.inputFrontierReadonly3Tools();assert.deepEqual(tools.map(t=>t.name),['soloco_context_header','soloco_context_read','soloco_context_submit']);assert.equal(tools[1].inputSchema.properties.length.maximum,4096);assert.deepEqual(tools[2].inputSchema.required,['sha256','content']);assert.ok(!tools.some(t=>t.name==='soloco_peer_execute'));assert.throws(()=>wire.inputFrontierReadonly3Tools('caller-subset'));
});
test('frontier fixed Responses projection removes SDK numeric bounds but raw advertised schemas retain them',()=>{
 const raw=wire.inputFrontierReadonly3Tools(),offered=wire.inputFrontierResponsesTools();assert.deepEqual(offered[1].parameters.properties.length,{type:'integer'});assert.deepEqual(offered[1].parameters.properties.offset,{type:'integer'});assert.equal(offered[1].strict,false);assert.equal(raw[1].inputSchema.properties.length.maximum,4096);assert.equal(offered[1].parameters.additionalProperties,false);assert.deepEqual(offered[2].parameters.required,['sha256','content']);
});
test('frontier mechanical frame preserves the whole original UTF8 assignment including raw escaping',()=>{
 const text=assignment('SYNTHETIC "quotes" \\ backslash café 🧭\nline'),frame=encode(text),decoded=wire.decodeInputFrontierDeliveryFrame(frame.text,binding(text));assert.equal(decoded.payload_text,text);assert.equal(decoded.payload_sha256,sha(text));assert.equal(decoded.frame_utf8_bytes,Buffer.byteLength(frame.text));assert.ok(frame.text.includes(text));
});
test('frontier frame rejects task, membership and bootstrap selector aliases',()=>{
 const text=assignment();for(const [key,values] of Object.entries({delivery_kind:['task-context','membership-assignment','bootstrap-membership-assignment'],payload_protocol:['peer-task-context-v2','peer-bootstrap-membership-assignment-v1'],contract_sha256:['0'.repeat(64)]}))for(const value of values)assert.throws(()=>wire.encodeInputFrontierDeliveryFrame({...binding(text),[key]:value,payload_text:text}),held);
});
test('frontier frame rejects every embedded source-cut field instead of borrowing bootstrap qualification',()=>{
 const text=assignment();for(const [key,value]of Object.entries({source_cut_protocol:'peer-bootstrap-membership-context-v1',source_cut_sha256:'1'.repeat(64),source_cut_utf8_bytes:123}))assert.throws(()=>encodeWith(key,value));function encodeWith(key,value){return wire.encodeInputFrontierDeliveryFrame({...binding(text),[key]:value,payload_text:text});}
});
test('frontier frame requires exact payload bytes, hash and valid UTF8',()=>{
 const text=assignment();for(const changed of [{payload_sha256:'0'.repeat(64)},{payload_utf8_bytes:Buffer.byteLength(text)+1},{payload_text:text+' '},{payload_text:'\ud800'}])assert.throws(()=>wire.encodeInputFrontierDeliveryFrame({...binding(text),payload_text:text,...changed}),held);
});
test('frontier mechanical parser rejects duplicate decoded selectors including escaped aliases',()=>{
 for(const text of [assignment().replace('{','{"protocol":"other",'),assignment().replace('{','{"pro\\u0074ocol":"other",'),assignment().replace('"subject":{','"subject":{"duplicate":1,"dupli\\u0063ate":2,')])assert.throws(()=>encode(text),held);
});
test('frontier decoder requires the complete canonical envelope and rejects appended or extra records',()=>{
 const text=assignment(),frame=encode(text);for(const changed of [frame.text+'{}',frame.text.replace('"payload":','"extra":null,"payload":'),frame.text.replace('"protocol":','"proto":'),frame.text.slice(0,-1)])assert.throws(()=>wire.decodeInputFrontierDeliveryFrame(changed,binding(text)),held);
});
test('frontier whole first-RPC geometry includes the exact fixed request id, native width, JSON escaping and LF',()=>{
 const text=assignment(),g=wire.formatInputFrontierFirstRpcGeometry(text,FRONTIER_INSTRUCTION),rpc=canonical({id:'soloco-peer-3',method:'turn/start',params:{threadId:'ffffffff-ffff-7fff-bfff-ffffffffffff',input:g.input}})+'\n';assert.equal(g.whole_rpc_utf8_bytes,Buffer.byteLength(rpc));assert.equal(g.context_utf8_bytes,Buffer.byteLength(text));assert.equal(g.policy_maximum_context_bytes,65536);assert.equal(g.input[1].text,g.frame.text);
});
test('frontier wire rejects policy, payload and escaped whole-RPC overages without clipping',()=>{
 const body=JSON.parse(assignment());body.authority.peer_policy.max_context_bytes=512;assert.throws(()=>encode(canonical(body)),held);assert.throws(()=>encode(assignment('x'.repeat(65536))),held);assert.throws(()=>wire.formatInputFrontierFirstRpcGeometry(assignment('"'.repeat(30000)),FRONTIER_INSTRUCTION),held);assert.throws(()=>wire.formatInputFrontierFirstRpcGeometry(assignment(),'caller instruction'),held);
});
test('frontier original preflight and interpreter capabilities cannot be reconstructed from copied JSON',()=>{
 for(const fake of [{},Object.freeze(Object.create(null)),{protocol:'peer-input-frontier-first-rpc-v1',payload_sha256:sha(assignment())}]){assert.throws(()=>wire.inspectOriginalInputFrontierPreflight(fake),held);assert.throws(()=>wire.originalInputFrontierPreflightInterpreter(fake),held);assert.throws(()=>assertOriginalInputFrontierInterpreterFinal(fake),held);}
});
test('frontier frame refuses accessor and proxy binding inputs before invoking their getters',()=>{
 const text=assignment();let calls=0;const accessor={...binding(text),payload_text:text};Object.defineProperty(accessor,'payload_text',{enumerable:true,get(){calls++;return text;}});assert.throws(()=>wire.encodeInputFrontierDeliveryFrame(accessor),held);const proxy=new Proxy({...binding(text),payload_text:text},{ownKeys(){calls++;return [];}});assert.throws(()=>wire.encodeInputFrontierDeliveryFrame(proxy),held);assert.equal(calls,0);
});
test('frontier opaque business JSON preserves escaped lone UTF16 keys and values plus finite unsafe integers verbatim',()=>{
 const raw='{"original_units":[9007199254740992,1e+21,"\\ud800",{"\\udfff":"opaque lone key"}],"unknown":-0}',text=assignment('OPAQUE').replace('"OPAQUE"',raw),frame=encode(text),decoded=wire.decodeInputFrontierDeliveryFrame(frame.text,binding(text));assert.equal(decoded.payload_text,text);assert.ok(decoded.payload_text.includes(raw));assert.equal(decoded.payload_sha256,sha(text));assert.equal(decoded.payload_utf8_bytes,Buffer.byteLength(text));
});
test('frontier opaque syntax still rejects malformed JSON, duplicate escaped keys and unsafe control selectors',()=>{
 for(const raw of ['{"x":1,}','[1,,2]','{"x":01}','{"x":truefalse}','{"x":"\\u00zz"}','{"x":1,"\\u0078":2}'])assert.throws(()=>encode(assignment('OPAQUE').replace('"OPAQUE"',raw)));
 const body=JSON.parse(assignment());body.authority.peer_policy.max_context_bytes=9007199254740992;assert.throws(()=>encode(canonical(body)));
});
