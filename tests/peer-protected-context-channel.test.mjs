import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseOriginalControlFrame,createOriginalControlTranscript} from '../plugins/soloco/runtime/peers/protected-context-channel.mjs';

// Every identity and frame in this suite is SYNTHETIC transcript DATA. No child,
// pipe, compiler, provider, original bootstrap, runtime capability or native
// positive is created. Timeouts below are synthetic domain notifications.
const PROTOCOL='soloco-protected-backend-permit-v2';
const sha=value=>createHash('sha256').update(value).digest('hex');
const HOST='11111111-1111-4111-8111-111111111111';
const SCOPE='22222222-2222-4222-8222-222222222222';
const clone=value=>JSON.parse(JSON.stringify(value));
function bindings(){return {nonce:sha('synthetic nonce'),pid:12345,slot_id:'synthetic-slot-☃',executable_sha256:sha('synthetic binary'),source_manifest_sha256:sha('synthetic manifest'),original_home_sha256:sha('synthetic original-home path'),state_root:'/synthetic-private-state',cwd:'/synthetic-project',upstream_url:'https://example.invalid/backend/responses'};}
function bootstrap(expected=bindings()){
  const {upstream_url,...same}=expected;
  return {protocol:PROTOCOL,kind:'host_bootstrap',...same,host_instance_id:HOST,sources:{config_layers:[],auth_owner_generation:1,auth_revision:0}};
}
function scoped(expected=bindings()){
  const {nonce,pid,slot_id,executable_sha256,source_manifest_sha256}=expected;
  return {protocol:PROTOCOL,kind:'scoped_context_contract',nonce,pid,slot_id,executable_sha256,source_manifest_sha256,host_instance_id:HOST,scope_instance_id:SCOPE,
    context_contract_protocol:'soloco-peer-context-contract-v2',context_contract_id:'peer-task-and-whole-membership-context-v2-delivery-frame-v3',
    context_contract_sha256:'832fdd1c965fa0e834c030f7c1e5636e2f32636b0df899ba8aa0fa940e9032fc',context_encoding:'soloco-peer-context-frame-v2',
    scope_profile_id:'protected_scoped_explicit_nonincremental_rlite_v1',evidence_scope:'source-resource-and-whole-payload-source-cut-wire-compatibility-only'};
}
const line=value=>Buffer.from(JSON.stringify(value)+'\n');
function envelope(value,raw=JSON.stringify(value)){
  const original=Buffer.from(raw);
  return Buffer.concat([Buffer.from('{"binding_sha256":"'+sha(original)+'","observation":'),original,Buffer.from('}\n')]);
}
function initialized(expected=bindings()){
  const channel=createOriginalControlTranscript(expected);channel.challengeBytes();channel.noteInitializeSent();return channel;
}
function bootstrapped(expected=bindings()){
  const channel=initialized(expected);channel.acceptFrame(line(bootstrap(expected)));return channel;
}
const rejects=(operation,code)=>assert.throws(operation,error=>error?.code===code);

test('fixed proxy listener port is selected in the challenge and echoed by the same original bootstrap',()=>{
 const expected={...bindings(),loopback_proxy_port:23456},channel=createOriginalControlTranscript(expected);
 assert.equal(JSON.parse(channel.challengeBytes()).loopback_proxy_port,23456);channel.noteInitializeSent();
 assert.equal(channel.acceptFrame(line(bootstrap(expected))).kind,'bootstrap-data');
 const permit=channel.acceptFrame(envelope(scoped(expected)));assert.equal(permit.kind,'context-permit-data');
 channel.noteContextPermitSent();assert.equal(channel.inspect().phase,'CONTEXT_ACKNOWLEDGED');
});

test('missing changed unbound or invalid proxy ports cannot select an original managed route',()=>{
 const expected={...bindings(),loopback_proxy_port:23456};
 for(const changed of [undefined,23457,0,65536]){
  const c=initialized(expected),frame=bootstrap(expected);if(changed===undefined)delete frame.loopback_proxy_port;else frame.loopback_proxy_port=changed;
  assert.throws(()=>c.acceptFrame(line(frame)));assert.equal(c.inspect().phase,'POISONED');
 }
 const unbound=initialized();rejects(()=>unbound.acceptFrame(line(bootstrap(expected))),'PROTECTED_CONTEXT_BINDING_CHANGED');
 for(const port of [0,65536,'23456',null])rejects(()=>createOriginalControlTranscript({...bindings(),loopback_proxy_port:port}),'PROTECTED_CONTEXT_EXPECTED_INVALID');
});

test('raw observation binding uses the exact UTF-8 slice rather than JSON reserialization',()=>{
  const value=scoped(),raw=JSON.stringify(value).replace('"slot_id":','"slot_id" : ');
  const frame=envelope(value,raw),parsed=parseOriginalControlFrame(frame);
  assert.equal(parsed.kind,'observation');assert.deepEqual(parsed.observation,value);
  assert.equal(parsed.binding_sha256,sha(Buffer.from(raw)));
  assert.notEqual(parsed.binding_sha256,sha(Buffer.from(JSON.stringify(parsed.observation))));
  assert.deepEqual(parsed.rawObservation,Buffer.from(raw));
  assert.deepEqual(parseOriginalControlFrame(frame.subarray(0,-1)).rawObservation,Buffer.from(raw));
  frame.fill(0);assert.deepEqual(parsed.rawObservation,Buffer.from(raw),'returned raw DATA owns its copied bytes');
});

test('raw parser rejects changed bindings, duplicate decoded keys and extra envelope fields',()=>{
  const raw=JSON.stringify(scoped());
  rejects(()=>parseOriginalControlFrame(Buffer.from('{"binding_sha256":"'+sha('other')+'","observation":'+raw+'}\n')),'PROTECTED_CONTEXT_BINDING_MISMATCH');
  for(const text of [
    '{"binding_sha256":"'+sha(raw)+'","binding_sha256":"'+sha(raw)+'","observation":'+raw+'}\n',
    '{"binding_sha256":"'+sha(raw)+'","observation":'+raw+',"extra":true}\n',
    JSON.stringify(bootstrap()).replace('"auth_revision":0','"auth_revision":0,"auth_\\u0072evision":1')+'\n',
  ])rejects(()=>parseOriginalControlFrame(Buffer.from(text)),'PROTECTED_CONTEXT_FRAME_INVALID');
});

test('raw parser rejects malformed UTF-8/JSON, multiple lines, excessive depth and native frame overflow',()=>{
  const bad=[Buffer.from([0xc3,0x28]),Buffer.from('\ufeff'+JSON.stringify(bootstrap())),Buffer.from('{"kind":'),line(bootstrap()).subarray(0,-1).subarray(0,-2),Buffer.concat([line(bootstrap()),line(bootstrap())]),Buffer.from(JSON.stringify(bootstrap())+'\r\n'),Buffer.from(' '.repeat(100001)),Buffer.from('{"x":'+ '['.repeat(34)+'0'+']'.repeat(34)+'}'),Buffer.from('{"x":"\\ud800"}'),Buffer.from('{"x":1e999}')];
  for(const bytes of bad)rejects(()=>parseOriginalControlFrame(bytes),'PROTECTED_CONTEXT_FRAME_INVALID');
});

test('native witness limit counts original UTF-8 body bytes separately from its terminal LF',()=>{
  const value=bootstrap();value.sources.config_layers=[{synthetic_padding:''}];
  const base=Buffer.byteLength(JSON.stringify(value));
  value.sources.config_layers[0].synthetic_padding='x'.repeat(100000-base);
  const atLimit=line(value);assert.equal(atLimit.length,100001);
  assert.equal(parseOriginalControlFrame(atLimit).observation.kind,'host_bootstrap');
  value.sources.config_layers[0].synthetic_padding+='x';
  rejects(()=>parseOriginalControlFrame(line(value)),'PROTECTED_CONTEXT_FRAME_INVALID');
});

test('synthetic transcript emits one precisely bound context permit after the original startup order',()=>{
  const expected=bindings(),channel=createOriginalControlTranscript(expected);
  const challenge=JSON.parse(channel.challengeBytes());
  assert.equal(challenge.protocol,PROTOCOL);assert.equal(challenge.kind,'challenge');
  for(const [key,value] of Object.entries(expected))assert.deepEqual(challenge[key],value);
  assert.equal(challenge.context_contract.resource_sha256,scoped().context_contract_sha256);
  assert.equal(channel.noteInitializeSent().phase,'INITIALIZE_SENT');
  assert.equal(channel.acceptFrame(line(bootstrap())).kind,'bootstrap-data');
  const accepted=channel.acceptFrame(envelope(scoped())),permit=JSON.parse(accepted.permitBytes);
  assert.equal(accepted.kind,'context-permit-data');assert.equal(channel.inspect().phase,'CONTEXT_PERMIT_PENDING');
  assert.equal(permit.kind,'context_contract_permit');assert.equal(permit.binding_sha256,sha(accepted.rawObservation));
  for(const key of ['nonce','pid','slot_id','source_manifest_sha256','host_instance_id','scope_instance_id','context_contract_protocol','context_contract_id','context_contract_sha256','context_encoding','scope_profile_id','evidence_scope'])assert.deepEqual(permit[key],scoped()[key]);
  assert.deepEqual(Object.keys(permit).sort(),['protocol','kind','nonce','pid','slot_id','source_manifest_sha256','host_instance_id','scope_instance_id','binding_sha256','context_contract_protocol','context_contract_id','context_contract_sha256','context_encoding','scope_profile_id','evidence_scope'].sort());
  assert.equal(channel.noteContextPermitSent().phase,'CONTEXT_ACKNOWLEDGED');
  assert.equal(channel.inspect().context_permits_generated,1);
  for(const key of ['native_qualified','authenticated','deployment','interpreter'])assert.equal(Object.hasOwn(channel.inspect(),key),false);
});

test('synthetic initial AuthManager generation zero remains valid bootstrap DATA',()=>{
  const channel=initialized(),initial=bootstrap();
  initial.sources.auth_owner_generation=0;initial.sources.auth_revision=0;
  assert.equal(channel.acceptFrame(line(initial)).observation.sources.auth_owner_generation,0);
  assert.equal(channel.acceptFrame(envelope(scoped())).kind,'context-permit-data');
  const negative=bootstrap();negative.sources.auth_owner_generation=-1;
  rejects(()=>parseOriginalControlFrame(line(negative)),'PROTECTED_CONTEXT_FRAME_INVALID');
});

test('bootstrap changes to every expected identity or scope poison the transcript',()=>{
  for(const key of ['nonce','pid','slot_id','executable_sha256','source_manifest_sha256','original_home_sha256','state_root','cwd']){
    const channel=initialized(),changed=bootstrap();changed[key]=key==='pid'?54321:key==='slot_id'?'other-slot':key==='state_root'||key==='cwd'?'/other-synthetic-scope':sha('changed');
    rejects(()=>channel.acceptFrame(line(changed)),'PROTECTED_CONTEXT_BINDING_CHANGED');
    assert.equal(channel.inspect().phase,'POISONED');assert.equal(channel.inspect().context_permits_generated,0);
    rejects(()=>channel.acceptFrame(line(bootstrap())),'PROTECTED_CONTEXT_CLOSED');
  }
});

test('scoped context rejects changed native, owner, contract, profile and evidence bindings',()=>{
  for(const key of ['nonce','pid','slot_id','executable_sha256','source_manifest_sha256','host_instance_id','scope_instance_id','context_contract_protocol','context_contract_id','context_contract_sha256','context_encoding','scope_profile_id','evidence_scope']){
    const channel=bootstrapped(),changed=scoped();
    changed[key]=key==='pid'?54321:key==='host_instance_id'?'33333333-3333-4333-8333-333333333333':key==='scope_instance_id'?'not-an-original-v4-UUID':key==='slot_id'?'other-slot':key.endsWith('sha256')||key==='nonce'?sha('changed'):'changed';
    assert.throws(()=>channel.acceptFrame(envelope(changed)),error=>['PROTECTED_CONTEXT_BINDING_CHANGED','PROTECTED_CONTEXT_FRAME_INVALID'].includes(error?.code),key);
    assert.equal(channel.inspect().phase,'POISONED');assert.equal(channel.inspect().context_permits_generated,0);
  }
});

test('out-of-order initialization, bootstrap or scoped frames and acknowledgements fail closed',()=>{
  for(const operation of [
    channel=>channel.noteInitializeSent(),
    channel=>channel.acceptFrame(line(bootstrap())),
    channel=>channel.noteContextPermitSent(),
    channel=>{channel.challengeBytes();channel.challengeBytes();},
    channel=>{channel.challengeBytes();channel.noteInitializeSent();channel.acceptFrame(envelope(scoped()));},
    channel=>{channel.challengeBytes();channel.noteInitializeSent();channel.acceptFrame(line(bootstrap()));channel.acceptFrame(line(bootstrap()));},
  ]){
    const channel=createOriginalControlTranscript(bindings());rejects(()=>operation(channel),'PROTECTED_CONTEXT_SEQUENCE');
    assert.equal(channel.inspect().phase,'POISONED');rejects(()=>channel.challengeBytes(),'PROTECTED_CONTEXT_CLOSED');
  }
});

test('a reserved context permit cannot be emitted again or acknowledged twice',()=>{
  const replay=bootstrapped();replay.acceptFrame(envelope(scoped()));
  rejects(()=>replay.acceptFrame(envelope(scoped())),'PROTECTED_CONTEXT_SEQUENCE');
  assert.equal(replay.inspect().context_permits_generated,1);assert.equal(replay.inspect().phase,'POISONED');
  const ack=bootstrapped();ack.acceptFrame(envelope(scoped()));ack.noteContextPermitSent();
  rejects(()=>ack.noteContextPermitSent(),'PROTECTED_CONTEXT_SEQUENCE');
  assert.equal(ack.inspect().context_permits_generated,1);assert.equal(ack.inspect().phase,'POISONED');
});

test('synthetic domain timeout or write failure permanently retains UNKNOWN without retry',()=>{
  for(const why of ['timeout','io-error','eof','cancelled','closed']){
    const channel=bootstrapped();channel.acceptFrame(envelope(scoped()));
    assert.equal(channel.closeUnknown(why).phase,'UNKNOWN');assert.equal(channel.inspect().terminal_reason,why);
    assert.equal(channel.inspect().context_permits_generated,1);
    rejects(()=>channel.noteContextPermitSent(),'PROTECTED_CONTEXT_CLOSED');
    rejects(()=>channel.challengeBytes(),'PROTECTED_CONTEXT_CLOSED');
    assert.equal(channel.closeUnknown('timeout').terminal_reason,why,'later notifications do not replace the first unknown');
  }
});

test('expected bindings and source objects cannot be changed through caller aliases',()=>{
  const expected=bindings(),channel=createOriginalControlTranscript(expected);expected.pid=8;expected.slot_id='changed';
  assert.equal(JSON.parse(channel.challengeBytes()).pid,bindings().pid);
  channel.noteInitializeSent();const source=bootstrap(),accepted=channel.acceptFrame(line(source));source.pid=9;
  assert.equal(accepted.observation.pid,bindings().pid);assert.ok(Object.isFrozen(accepted.observation.sources.config_layers));
  assert.throws(()=>{channel.inspect().phase='CONTEXT_ACKNOWLEDGED';},TypeError);
  const bad=bindings();Object.defineProperty(bad,'nonce',{get(){throw Error('must not execute');},enumerable:true});
  rejects(()=>createOriginalControlTranscript(bad),'PROTECTED_CONTEXT_EXPECTED_INVALID');
  let coerced=false;
  const upstream_url={toString(){coerced=true;return bindings().upstream_url;}};
  rejects(()=>createOriginalControlTranscript({...bindings(),upstream_url}),'PROTECTED_CONTEXT_EXPECTED_INVALID');
  assert.equal(coerced,false,'invalid URL DATA must be rejected before user coercion hooks run');
});

test('strict bootstrap and expected field schemas reject extra or unsupported inputs',()=>{
  const extra={...bindings(),authenticated:true};rejects(()=>createOriginalControlTranscript(extra),'PROTECTED_CONTEXT_EXPECTED_INVALID');
  for(const mutate of [value=>{value.sources.extra=true;},value=>{value.sources.auth_revision=-1;},value=>{value.host_instance_id='not-v4';},value=>{value.protocol='soloco-protected-backend-permit-v1';}]){
    const value=bootstrap();mutate(value);rejects(()=>parseOriginalControlFrame(line(value)),'PROTECTED_CONTEXT_FRAME_INVALID');
  }
  for(const upstream_url of ['http://example.invalid/responses','https://user@example.invalid/responses','https://example.invalid/responses?x=1','https://example.invalid/other'])rejects(()=>createOriginalControlTranscript({...bindings(),upstream_url}),'PROTECTED_CONTEXT_EXPECTED_INVALID');
});

test('wrapped final-request parsing remains DATA for the separate domain validator',()=>{
  const value={protocol:PROTOCOL,kind:'final_request',synthetic_marker:'not a complete original final request'};
  const parsed=parseOriginalControlFrame(envelope(value));assert.deepEqual(parsed.observation,value);
  const channel=bootstrapped();rejects(()=>channel.acceptFrame(envelope(value)),'PROTECTED_CONTEXT_SEQUENCE');
  assert.equal(channel.inspect().context_permits_generated,0);
});
