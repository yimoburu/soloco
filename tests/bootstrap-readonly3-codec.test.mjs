import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';

// Independently authored fictional codec DATA only. No selected deployment,
// original interpreter, admitted bootstrap, finite purpose, qualified context,
// native thread or authority is manufactured by this file.
const peers=new URL('../plugins/soloco/runtime/peers/',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
const RESOURCE_SHA='cd1ce3adaad300721e47238292ce15dc41f7007b6e415b76c005e93419656ed4';
const OLD_RESOURCE_SHA='832fdd1c965fa0e834c030f7c1e5636e2f32636b0df899ba8aa0fa940e9032fc';
const PROFILE='soloco-bootstrap-membership-readonly3-v1';
const ASSIGNMENT='peer-bootstrap-membership-assignment-v1',CONTEXT='peer-bootstrap-membership-context-v1';
const hold=error=>typeof error?.code==='string'&&/^(BOOTSTRAP_|DELIVERY_FRAME_|CONTEXT_|COMPONENT_|PROTECTED_)/.test(error.code);
const clone=value=>JSON.parse(JSON.stringify(value));

function denyExternal(){
  const restores=[],calls=[];
  const replace=(object,key)=>{const old=object[key];object[key]=()=>{calls.push(key);throw Error('Source codec fixture forbids external '+key);};restores.push(()=>{object[key]=old;});};
  for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])replace(childProcess,key);
  replace(childProcess.ChildProcess.prototype,'spawn');replace(net.Socket.prototype,'connect');replace(net.Server.prototype,'listen');
  for(const [object,keys] of [[net,['connect','createConnection','createServer']],[tls,['connect','createServer']],[http,['request','get','createServer']],[https,['request','get','createServer']],[dgram,['createSocket']]])for(const key of keys)replace(object,key);
  for(const key of ['bind','connect','send'])replace(dgram.Socket.prototype,key);
  replace(process,'kill');replace(globalThis,'fetch');syncBuiltinESMExports();
  return {calls,restore(){for(const restore of restores.reverse())restore();syncBuiltinESMExports();}};
}
async function source(t,body){
  const external=denyExternal();
  try{
    const codec=await import(new URL('bootstrap-membership-delivery-frame.mjs',peers));
    const legacy=await import(new URL('peer-delivery-frame.mjs',peers));
    const host=await import(new URL('host-protocol.mjs',peers));
    const contract=await import(new URL('bootstrap-membership-contract.mjs',peers));
    const interpreter=await import(new URL('peer-context-interpreter.mjs',peers));
    const deployment=await import(new URL('context-component-deployment.mjs',peers));
    const slot=await import(new URL('protected-source-build-slot.mjs',peers));
    const preflight=await import(new URL('bootstrap-membership-preflight.mjs',peers));
    await body({codec,legacy,host,contract,interpreter,deployment,slot,preflight});
    assert.deepEqual(external.calls,[]);
  }finally{external.restore();}
}

function fictional(phase='reconstruction',padding=''){
  // Whitespace, exponent spelling, escaped Unicode and unknown data must stay
  // verbatim. The pure codec does not qualify this independently authored basis.
  const cut='{"protocol":"'+CONTEXT+'","control":{"value":{"policy":{"max_context_bytes":65536}}},"current_meaning":{"protocol":"peer-checked-input-current-meaning-v1"},"unknown":{"lexical":1e+21,"escaped":"\\u96ea","literal":"雪😀","padding":"'+padding+'"}}';
  const payload_text='{"protocol":"'+ASSIGNMENT+'","phase":"'+phase+'","role":"reviewer","source_cut":'+cut+',"source_cut_sha256":"'+sha(cut)+'","unknown":["line\\nquote\\\"slash\\\\",1e-7]}';
  return {cut,payload_text,contract_sha256:RESOURCE_SHA,delivery_kind:'bootstrap-membership-assignment',payload_protocol:ASSIGNMENT,payload_sha256:sha(payload_text),payload_utf8_bytes:Buffer.byteLength(payload_text),source_cut_protocol:CONTEXT,source_cut_sha256:sha(cut),source_cut_utf8_bytes:Buffer.byteLength(cut),maximum_frame_bytes:100000};
}
const args=value=>{const {cut,...input}=value;return input;};
const expected=value=>{const {cut,payload_text,...binding}=value;return binding;};
const retarget=(value,payload_text)=>({...value,payload_text,payload_sha256:sha(payload_text),payload_utf8_bytes:Buffer.byteLength(payload_text)});
const replaceCut=(value,cut)=>({...retarget(value,value.payload_text.replace(value.cut,cut).replace(value.source_cut_sha256,sha(cut))),cut,source_cut_sha256:sha(cut),source_cut_utf8_bytes:Buffer.byteLength(cut)});
// Independent literal grammar for the existing recursively sorted RPC. Do not
// use its canonicalizer to manufacture this fixture's expected bytes.
const literalFirstRpc=input=>'{"id":"soloco-peer-3","method":"turn/start","params":{"input":['+input.map(item=>'{"text":'+JSON.stringify(item.text)+',"type":"text"}').join(',')+'],"threadId":"ffffffff-ffff-7fff-bfff-ffffffffffff"}}\n';

test('distinct readonly3 resource pins exact tools, 4096 read range and sha256/content submission',{concurrency:false},t=>source(t,({codec})=>{
  const bytes=fs.readFileSync(new URL('bootstrap-membership-readonly3-contract-v1.json',peers));
  assert.equal(bytes.length,2427);assert.equal(sha(bytes),RESOURCE_SHA);
  const description='Private bootstrap membership context protocol; identity and authority are supplied only by the original protected composition.';
  const tools=[
    {type:'function',name:'soloco_context_header',description,inputSchema:{type:'object',properties:{},required:[],additionalProperties:false}},
    {type:'function',name:'soloco_context_read',description,inputSchema:{type:'object',properties:{sha256:{type:'string'},offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:4096}},required:['sha256','offset','length'],additionalProperties:false}},
    {type:'function',name:'soloco_context_submit',description,inputSchema:{type:'object',properties:{sha256:{type:'string'},content:{type:'string'}},required:['sha256','content'],additionalProperties:false}},
  ];
  assert.deepEqual(codec.bootstrapReadonly3Tools(),tools);assert.deepEqual(JSON.parse(bytes).tools,tools);
  assert.equal(codec.BOOTSTRAP_PROFILE,PROFILE);
  assert.deepEqual(codec.BOOTSTRAP_CONTEXT_SELECTION,{protocol:'soloco-bootstrap-membership-context-contract-v1',contract_id:'bootstrap-membership-readonly3-whole-assignment-v1',resource_sha256:RESOURCE_SHA,context_encoding:'soloco-peer-context-frame-v2',scope_profile_id:PROFILE});
  const selected=codec.bootstrapReadonly3Tools();assert(Object.isFrozen(selected));
  assert.throws(()=>{selected[1].inputSchema.properties.length.maximum=8192;},TypeError);
  assert.throws(()=>selected.push({name:'soloco_peer_execute'}),TypeError);
  for(const altered of [tools.slice(0,2),[...tools,{name:'soloco_peer_execute'}],tools.map(tool=>tool.name==='soloco_context_read'?{...tool,inputSchema:{...tool.inputSchema,properties:{...tool.inputSchema.properties,length:{type:'integer',maximum:8192}}}}:tool),tools.map(tool=>tool.name==='soloco_context_submit'?{...tool,inputSchema:{...tool.inputSchema,required:['operation_id','sha256','content']}}:tool)])assert.throws(()=>codec.bootstrapReadonly3Tools(altered),hold);
  assert.deepEqual(codec.bootstrapReadonly3Tools(),tools,'caller DATA cannot change fixed constructor selection');
}));

test('old five-tool catalogue, frame bytes and resource identity remain unchanged',{concurrency:false},t=>source(t,({legacy,host,slot})=>{
  const oldResource=fs.readFileSync(new URL('peer-context-contract-v2.json',peers));assert.equal(sha(oldResource),OLD_RESOURCE_SHA);
  assert.deepEqual(fs.readFileSync(new URL('../../../../native/codex/overlay/codex-rs/codex-api/src/protected_peer/peer_context_contract_v2.json',peers)),oldResource,'old native and Node resource bytes retain their exact existing identity');
  assert.equal(slot.ORIGINAL_CONTEXT_SELECTION.resource_sha256,OLD_RESOURCE_SHA);
  const oldCodec=fs.readFileSync(new URL('peer-delivery-frame.mjs',peers));assert.equal(oldCodec.length,7660);assert.equal(sha(oldCodec),'e174dee61f38567b3c01ae4a2593612a664b8434a775478c091aae532ef30746');
  const tools=host.stableTaskHostTools();assert.deepEqual(tools.map(tool=>tool.name),['soloco_context_header','soloco_context_read','soloco_context_submit','soloco_peer_execute','soloco_peer_inspect']);
  assert.equal(tools[1].inputSchema.properties.length.maximum,8192);assert.deepEqual(tools[2].inputSchema.required,['operation_id','sha256','content']);
  const payload_text='{"protocol":"peer-task-context-v1","unknown":{"literal":"雪😀","escaped":"\\u96ea","number":1e+21}}';
  const input={contract_sha256:OLD_RESOURCE_SHA,delivery_kind:'task-context',payload_protocol:'peer-task-context-v1',payload_sha256:sha(payload_text),payload_utf8_bytes:Buffer.byteLength(payload_text),source_cut_protocol:null,source_cut_sha256:null,source_cut_utf8_bytes:null,maximum_frame_bytes:100000,payload_text};
  const literal='{"protocol":"soloco-peer-context-frame-v2","contract_sha256":"'+OLD_RESOURCE_SHA+'","delivery_kind":"task-context","payload_protocol":"peer-task-context-v1","payload_sha256":"'+sha(payload_text)+'","payload_utf8_bytes":'+Buffer.byteLength(payload_text)+',"source_cut_protocol":null,"source_cut_sha256":null,"source_cut_utf8_bytes":null,"payload":'+payload_text+'}';
  const frame=legacy.encodePeerDeliveryFrame(input);assert.equal(frame.text,literal);assert.equal(frame.sha256,sha(literal));
  const {payload_text:_,...binding}=input;assert.equal(legacy.decodePeerDeliveryFrame(literal,binding).payload_text,payload_text);
}));

for(const phase of ['reconstruction','review'])test('whole bootstrap '+phase+' preserves raw assignment and inner lexical bytes',{concurrency:false},t=>source(t,({codec})=>{
  const data=fictional(phase),frame=codec.encodeBootstrapMembershipDeliveryFrame(args(data)),decoded=codec.decodeBootstrapMembershipDeliveryFrame(frame.text,expected(data));
  assert.equal(decoded.payload_text,data.payload_text);assert.equal(decoded.payload_sha256,data.payload_sha256);assert.equal(decoded.source_cut_sha256,sha(data.cut));
  assert.equal(frame.sha256,sha(frame.text));assert.equal(frame.utf8_bytes,Buffer.byteLength(frame.text));
  const source=codec.bootstrapAssignmentSourceCut(data.payload_text);assert(Object.isFrozen(source));
  assert.deepEqual(Object.keys(source).sort(),['value','raw','sha256','utf8_bytes'].sort());assert.equal(source.raw,data.cut);assert.equal(source.sha256,sha(data.cut));assert.equal(source.utf8_bytes,Buffer.byteLength(data.cut));assert.deepEqual(source.value,JSON.parse(data.cut));
  assert(frame.text.endsWith(data.payload_text+'}'));assert.notEqual(data.payload_sha256,data.source_cut_sha256);
  assert.notEqual(data.cut,JSON.stringify(JSON.parse(data.cut)),'raw Unicode/exponent spelling must not be recanonicalized');
}));

test('old5 and new3 selectors reject cross-profile payloads rather than reclassifying history',{concurrency:false},t=>source(t,({codec,legacy})=>{
  const data=fictional();assert.throws(()=>legacy.encodePeerDeliveryFrame(args(data)),hold);
  const old={...args(data),delivery_kind:'membership-assignment',payload_protocol:'peer-membership-assignment-v1',source_cut_protocol:'peer-membership-context-v2'};
  assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame(old),hold);
  for(const change of [{delivery_kind:'task-context'},{payload_protocol:'peer-membership-assignment-v1'},{source_cut_protocol:'peer-membership-context-v2'},{contract_sha256:OLD_RESOURCE_SHA}])assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame({...args(data),...change}),hold);
  const frame=codec.encodeBootstrapMembershipDeliveryFrame(args(data));
  assert.throws(()=>legacy.decodePeerDeliveryFrame(frame.text,expected(data)),hold);
}));

test('wrong whole/inner hashes, resource and selected protocols reject complete raw frames',{concurrency:false},t=>source(t,({codec})=>{
  const data=fictional(),frame=codec.encodeBootstrapMembershipDeliveryFrame(args(data));
  for(const change of [{payload_sha256:'f'.repeat(64)},{payload_utf8_bytes:data.payload_utf8_bytes+1},{source_cut_sha256:data.payload_sha256},{source_cut_utf8_bytes:data.source_cut_utf8_bytes+1},{contract_sha256:'f'.repeat(64)},{payload_protocol:'invented-v1'},{source_cut_protocol:'invented-v1'}]){
    assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame({...args(data),...change}),hold);
    assert.throws(()=>codec.decodeBootstrapMembershipDeliveryFrame(frame.text,{...expected(data),...change}),hold);
  }
  const changed=retarget(data,data.payload_text.replace('1e+21','1e21'));
  assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame(args(changed)),hold,'outer rehash cannot excuse changed inner lexical bytes');
}));

test('duplicate escaped selectors and unknown/reordered envelope fields reject without normalization',{concurrency:false},t=>source(t,({codec})=>{
  const data=fictional(),frame=codec.encodeBootstrapMembershipDeliveryFrame(args(data));
  for(const payload_text of [data.payload_text.replace('"phase":','"source_\\u0063ut_sha256":"'+data.source_cut_sha256+'","phase":'),data.payload_text.replace('"phase":','"protocol":"'+ASSIGNMENT+'","phase":')])assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame(args(retarget(data,payload_text))),hold);
  for(const text of [frame.text+' ',frame.text.replace('"payload":','"unknown":true,"payload":'),frame.text.replace('"payload":','"payload_sha256":"'+data.payload_sha256+'","payload":'),frame.text.replace('"protocol":"soloco-peer-context-frame-v2","contract_sha256":"'+RESOURCE_SHA+'"','"contract_sha256":"'+RESOURCE_SHA+'","protocol":"soloco-peer-context-frame-v2"')])assert.throws(()=>codec.decodeBootstrapMembershipDeliveryFrame(text,expected(data)),hold);
}));

test('literal invalid Unicode and accessors cannot silently substitute UTF8 or invoke caller code',{concurrency:false},t=>source(t,({codec})=>{
  const data=fictional(),payload_text=data.payload_text.replace('雪😀',String.fromCharCode(0xd800));
  assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame(args(retarget(data,payload_text))),hold);
  let reads=0;const input=args(data);Object.defineProperty(input,'payload_text',{enumerable:true,get(){reads++;throw Error('must never evaluate');}});
  assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame(input),hold);assert.equal(reads,0);
}));

test('changed or duplicate current-meaning selectors remain Held even with consistent outer hashes',{concurrency:false},t=>source(t,({codec})=>{
  const data=fictional();
  for(const cut of [data.cut.replace('peer-checked-input-current-meaning-v1','invented-basis-v1'),data.cut.replace('"current_meaning":','"protocol":"'+CONTEXT+'","current_meaning":'),data.cut.replace('"protocol":"peer-checked-input-current-meaning-v1"','"protocol":"peer-checked-input-current-meaning-v1","prot\\u006fcol":"peer-checked-input-current-meaning-v1"')]){
    const changed=replaceCut(data,cut);assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame(args(changed)),hold);assert.throws(()=>codec.bootstrapAssignmentSourceCut(changed.payload_text),hold);
  }
}));

test('complete envelope overhead and selected frame bound Hold without truncation or cap increase',{concurrency:false},t=>source(t,({codec})=>{
  const data=fictional(),frame=codec.encodeBootstrapMembershipDeliveryFrame(args(data));assert(frame.utf8_bytes>data.payload_utf8_bytes);
  assert.equal(codec.encodeBootstrapMembershipDeliveryFrame({...args(data),maximum_frame_bytes:frame.utf8_bytes}).text,frame.text);
  assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame({...args(data),maximum_frame_bytes:frame.utf8_bytes-1}),hold);
  const huge=fictional('review','x'.repeat(200000));assert.throws(()=>codec.encodeBootstrapMembershipDeliveryFrame(args(huge)),hold);
}));

test('whole first-RPC geometry counts original Unicode, JSON escaping, instruction and terminal newline',{concurrency:false},t=>source(t,({codec,preflight})=>{
  const data=fictional(),value=preflight.formatBootstrapMembershipFirstRpcGeometry(data.payload_text);
  const frame=codec.encodeBootstrapMembershipDeliveryFrame(args(data));
  const input=[{type:'text',text:'Work instruction:\n'+preflight.BOOTSTRAP_MEMBERSHIP_INSTRUCTION},{type:'text',text:frame.text}];
  const wire=literalFirstRpc(input);
  assert.deepEqual(value.input,input);assert.deepEqual(value.frame,frame);assert.equal(value.first_rpc.text,wire);assert.equal(value.first_rpc.sha256,sha(wire));
  assert.equal(value.context_utf8_bytes,Buffer.byteLength(data.payload_text));assert(value.context_utf8_bytes>data.payload_text.length);
  assert.equal(value.input_utf8_bytes,Buffer.byteLength(JSON.stringify(input)));assert.equal(value.whole_rpc_utf8_bytes,Buffer.byteLength(wire));assert.equal(value.whole_rpc_utf8_bytes,Buffer.byteLength(wire.slice(0,-1))+1);
  assert.equal(value.policy_maximum_context_bytes,65536);assert(Object.isFrozen(value));
  assert.throws(()=>preflight.formatBootstrapMembershipFirstRpcGeometry(data.payload_text,{native_id:'SYNTHETIC-old-thread'}),hold,'caller cannot provide a thread or reinterpret geometry as a resume');
}));

test('full first-RPC escaping overflow Holds while the entire assignment and frame still fit',{concurrency:false},t=>source(t,({codec,preflight,deployment})=>{
  const data=fictional('review',JSON.stringify('"\\'.repeat(15000)).slice(1,-1));assert(data.payload_utf8_bytes<65536);
  const frame=codec.encodeBootstrapMembershipDeliveryFrame(args(data));assert(frame.utf8_bytes<100000);
  const input=[{type:'text',text:'Work instruction:\n'+preflight.BOOTSTRAP_MEMBERSHIP_INSTRUCTION},{type:'text',text:frame.text}];
  const wire=literalFirstRpc(input);assert(Buffer.byteLength(wire)>100000);
  const capacity=error=>['CONTEXT_DELIVERY_CAPACITY','BOOTSTRAP_PREFLIGHT_CAPACITY'].includes(error?.code);
  assert.throws(()=>preflight.formatBootstrapMembershipFirstRpcGeometry(data.payload_text),capacity);
  assert.throws(()=>deployment.preflightOriginalBootstrapMembershipContext(data.payload_text),capacity,'whole-wire overflow precedes original interpreter acquisition; no plan or charge is issued by preflight');
}));

test('receipt DATA checks retain the exact twelve fields and original policy/frame/wire bounds',{concurrency:false},t=>source(t,({preflight,contract})=>{
  const data=fictional(),geometry=preflight.formatBootstrapMembershipFirstRpcGeometry(data.payload_text);
  // This is independently authored metadata, not an original preflight token.
  const receipt={protocol:'peer-bootstrap-membership-first-rpc-v1',payload_sha256:sha(data.payload_text),instruction_sha256:sha(preflight.BOOTSTRAP_MEMBERSHIP_INSTRUCTION),frame_sha256:geometry.frame.sha256,recipe_sha256:'e'.repeat(64),input_utf8_bytes:geometry.input_utf8_bytes,whole_rpc_utf8_bytes:geometry.whole_rpc_utf8_bytes,frame_bytes:100000,wire_bytes:4000000,context_utf8_bytes:data.payload_utf8_bytes,policy_maximum_context_bytes:65536,native_identity:'UNOBSERVED_GEOMETRY_ONLY'};
  assert.equal(Object.keys(receipt).length,12);assert.deepEqual(contract.validateBootstrapMembershipFirstRpc(receipt,data.payload_text),receipt);
  for(const change of [{payload_sha256:data.source_cut_sha256},{context_utf8_bytes:data.payload_utf8_bytes+1},{policy_maximum_context_bytes:100000},{frame_bytes:100001},{wire_bytes:4000001},{whole_rpc_utf8_bytes:100001},{native_identity:'SYNTHETIC-old-thread'},{authority_issued:true}])assert.throws(()=>contract.validateBootstrapMembershipFirstRpc({...receipt,...change},data.payload_text),hold);
}));

test('serialized/foreign preflight and interpreter DATA cannot become original capabilities',{concurrency:false},t=>source(t,({codec,deployment,slot,preflight})=>{
  const geometry=preflight.formatBootstrapMembershipFirstRpcGeometry(fictional().payload_text);
  for(const plan of [{},null,Object.freeze({protocol:'peer-bootstrap-membership-first-rpc-v1',native_identity:'UNOBSERVED_GEOMETRY_ONLY'}),geometry,clone(geometry)])assert.throws(()=>deployment.inspectOriginalBootstrapMembershipPreflight(plan),hold);
  for(const descriptor of [{},clone(codec.BOOTSTRAP_CONTEXT_SELECTION),clone(slot.ORIGINAL_CONTEXT_SELECTION),{profile_id:PROFILE,native_id:'SYNTHETIC-old-thread'}]){
    assert.throws(()=>slot.assertOriginalBootstrapMembershipInterpreterFinal(descriptor),hold);
    assert.throws(()=>slot.inspectOriginalBootstrapMembershipInterpreter(descriptor),hold);
  }
  // A codec packet/profile/resource is DATA. It never manufactures the missing
  // associated bootstrap interpreter, finite purpose or qualified context.
  assert.throws(()=>deployment.preflightOriginalBootstrapMembershipContext(fictional().payload_text),hold);
  assert.equal(typeof slot.resolveOriginalBootstrapMembershipInterpreter,'function');
}));
