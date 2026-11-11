import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonical} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {encodePeerDeliveryFrame} from '../plugins/soloco/runtime/peers/peer-delivery-frame.mjs';
import {ORIGINAL_CONTEXT_SELECTION,isOriginalContextInterpreterUnavailable} from '../plugins/soloco/runtime/peers/protected-source-build-slot.mjs';
import {peerContextTurnInput,formatPeerContextFirstTurnWire,validatePeerContextInstruction,prepareOriginalPeerContextDelivery,inspectOriginalPeerContextDelivery,originalPeerContextDeliveryInterpreter,createOriginalPeerMembershipRestriction,checkOriginalPeerMembershipRestriction,prepareOriginalProjectedTaskContext,prepareOriginalProjectedMembershipContext,isOriginalPeerContextDeliveryError} from '../plugins/soloco/runtime/peers/peer-context-interpreter.mjs';

// Valid encoded DATA fixtures do not manufacture an original interpreter,
// delivery capability, native identity or permission to execute.
const hash=text=>createHash('sha256').update(text).digest('hex');
const code=expected=>error=>error?.code===expected;
const native='00000000-0000-7000-8000-000000000001';
function data(){
  const payload_text=canonical({protocol:'peer-task-context-v1',control:{policy:{max_context_bytes:65536}},unknown:'雪😀'});
  const request={delivery_kind:'task-context',payload_protocol:'peer-task-context-v1',payload_text,payload_sha256:hash(payload_text),payload_utf8_bytes:Buffer.byteLength(payload_text),source_cut_protocol:null,source_cut_sha256:null,source_cut_utf8_bytes:null};
  return {request,frame:encodePeerDeliveryFrame({...request,contract_sha256:ORIGINAL_CONTEXT_SELECTION.resource_sha256,maximum_frame_bytes:100000})};
}

test('the complete instruction and exact encoded frame occupy separate immutable text items',()=>{
  const {frame}=data(),instruction='Preserve quotation and Unicode: "雪😀"\n'+frame.text;
  const input=peerContextTurnInput(instruction,frame.text);
  assert.equal(input.length,2);
  assert.deepEqual(input[0],{type:'text',text:'Work instruction:\n'+instruction});
  assert.deepEqual(input[1],{type:'text',text:frame.text});
  assert.ok(Object.isFrozen(input)&&input.every(Object.isFrozen));
  assert.throws(()=>{input[1].text='changed';},TypeError);
});

test('whole first-turn capacity counts JSON escaping, fixed headers and the final newline exactly',()=>{
  const {frame}=data(),instruction='Quotes " and slash \\ and Unicode 雪😀';
  const whole=formatPeerContextFirstTurnWire(instruction,frame.text,native,100000);
  assert.equal(whole.utf8_bytes,Buffer.byteLength(whole.text));assert.equal(whole.sha256,hash(whole.text));
  assert.ok(whole.text.endsWith('\n'));
  assert.deepEqual(JSON.parse(whole.text),{id:'soloco-peer-3',method:'turn/start',params:{threadId:native,input:peerContextTurnInput(instruction,frame.text)}});
  assert.equal(formatPeerContextFirstTurnWire(instruction,frame.text,native,whole.utf8_bytes).text,whole.text);
  assert.throws(()=>formatPeerContextFirstTurnWire(instruction,frame.text,native,whole.utf8_bytes-1),code('CONTEXT_DELIVERY_CAPACITY'));
});

test('invalid instruction bytes, non-prefix frames and unobserved native IDs cannot format a turn',()=>{
  const {frame}=data();
  for(const instruction of ['', '   ', 'x\0y', String.fromCharCode(0xd800),'x'.repeat(10001)])
    assert.throws(()=>validatePeerContextInstruction(instruction),code('CONTEXT_DELIVERY_ARGUMENT'));
  for(const text of [' '+frame.text,'quoted '+frame.text])
    assert.throws(()=>peerContextTurnInput('Valid instruction.',text),code('CONTEXT_DELIVERY_ARGUMENT'));
  for(const id of ['native-label','00000000-0000-4000-8000-000000000001'])
    assert.throws(()=>formatPeerContextFirstTurnWire('Valid instruction.',frame.text,id,100000),code('CONTEXT_DELIVERY_ARGUMENT'));
});

test('serialized delivery and membership-restriction DATA cannot replace private original handles',()=>{
  for(const handle of [{},Object.freeze({protocol:'original-peer-context-delivery-plan-v1'}),null]){
    assert.throws(()=>inspectOriginalPeerContextDelivery(handle),code('CONTEXT_DELIVERY_ORIGINAL_REQUIRED'));
    assert.throws(()=>originalPeerContextDeliveryInterpreter(handle),code('CONTEXT_DELIVERY_ORIGINAL_REQUIRED'));
    assert.throws(()=>checkOriginalPeerMembershipRestriction(handle,'{}',{}),code('CONTEXT_DELIVERY_ORIGINAL_REQUIRED'));
  }
  assert.equal(isOriginalPeerContextDeliveryError({code:'CONTEXT_DELIVERY_ORIGINAL_REQUIRED'}),false);
});

test('valid frame DATA with a forged interpreter holds at the original source boundary',()=>{
  const {request}=data(),forged=Object.freeze({protocol:'original-static-peer-context-profile-v1'});
  assert.throws(()=>prepareOriginalPeerContextDelivery(forged,request),isOriginalContextInterpreterUnavailable);
  assert.throws(()=>createOriginalPeerMembershipRestriction(forged,{instruction:'Bounded instruction.',frame_bytes:100000,wire_bytes:2000000}),isOriginalContextInterpreterUnavailable);
});

test('request accessors are rejected without evaluation and selectors cannot silently change',()=>{
  const {request}=data();let reads=0;
  Object.defineProperty(request,'payload_text',{enumerable:true,get(){reads++;return 'untrusted';}});
  assert.throws(()=>prepareOriginalPeerContextDelivery({},request),code('CONTEXT_DELIVERY_ARGUMENT'));assert.equal(reads,0);
  assert.throws(()=>prepareOriginalProjectedTaskContext({protocol:'invented-v3'},{}),code('CONTEXT_DELIVERY_SELECTOR'));
  assert.throws(()=>prepareOriginalProjectedMembershipContext('{}',{body:{protocol:'invented-v3'}}),code('CONTEXT_DELIVERY_SELECTOR'));
});

test('legacy v1 paths without a v3 creation seal remain unchanged and issue no original handle',()=>{
  let reads=0;
  assert.equal(prepareOriginalProjectedTaskContext({protocol:'peer-task-context-v1',principal:{id:'legacy'}},{get(){reads++;return null;}}),null);
  assert.equal(reads,1);
  assert.equal(prepareOriginalProjectedMembershipContext('{}',{body:{protocol:'peer-membership-context-v1'}}),null);
});
