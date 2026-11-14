// Fictional local function calls only. No model, Store, filesystem or process IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createObservedOutcome,partialTextResult} from '../tools/issue18/observed-outcome.mjs';
import {copyBlobBytes,readThrownValue} from '../tools/issue18/typed-capture.mjs';

async function caught(promise){
  let present=false,value;
  try{await promise;}catch(reason){present=true;value=reason;}
  assert.equal(present,true,'expected a rejection, including undefined');return value;
}
const used=observer=>assert.throws(()=>observer.run(),e=>e.code==='ISSUE18_OBSERVER_USED');
const localError=(value,code)=>assert.equal(value.code,'ISSUE18_OBSERVER_'+code);

test('real invocation, raw capture, recording and consumer parsing have exact order',async()=>{
  const order=[];let calls=0;
  const observer=createObservedOutcome(()=>{calls++;order.push('invoke');return '{"value":1}';},{record:snapshot=>{
    order.push('record');assert.equal(snapshot.phase,'recording');assert.equal(snapshot.capture_state,'complete_local');
    assert.equal(copyBlobBytes(snapshot.capture.blob).toString('utf16le'),'{"value":1}');
  }});
  const text=await observer.run();order.push('parse');assert.deepEqual(JSON.parse(text),{value:1});
  assert.deepEqual(order,['invoke','record','parse']);assert.equal(calls,1);used(observer);assert.equal(calls,1);
  assert.equal(observer.snapshot().phase,'succeeded');assert.equal(observer.snapshot().scope,'LOCAL_OBSERVATION_ONLY');
});
test('BOM, lone surrogate, NUL and line endings are retained before return',async()=>{
  const text='\ufeff\ud800\0\r\n',observer=createObservedOutcome(()=>text);
  assert.equal(await observer.run(),text);
  const captured=observer.snapshot().capture;
  assert.equal(copyBlobBytes(captured.blob).toString('hex'),'fffe00d800000d000a00');
  assert.equal(captured.raw_capture.unicode_well_formed,false);assert.equal(captured.raw_capture.contains_nul,true);
  assert.equal(captured.raw_capture.provider_answer_completeness,'not_established');
});
test('an empty returned string is a complete local capture, not a falsey throw',async()=>{
  const observer=createObservedOutcome(()=>'');assert.equal(await observer.run(),'');
  assert.equal(observer.snapshot().capture_state,'complete_local');assert.equal(observer.snapshot().primary_error,null);
  assert.equal(copyBlobBytes(observer.snapshot().capture.blob).length,0);
});
test('native async settlement stays spent while pending and captures once',async()=>{
  let resolve,calls=0,records=0;const pending=new Promise(done=>{resolve=done;});
  const observer=createObservedOutcome(()=>{calls++;return pending;},{record:()=>{records++;}});
  const result=observer.run();assert.equal(observer.snapshot().phase,'settling');used(observer);assert.equal(calls,1);
  resolve('settled');assert.equal(await result,'settled');assert.equal(records,1);used(observer);
  assert.equal(observer.snapshot().settlement,'native_promise_fulfilled');
});
test('reentrant invocation is denied synchronously before a second function call',async()=>{
  let observer,calls=0;
  observer=createObservedOutcome(()=>{calls++;used(observer);return 'one';});
  assert.equal(await observer.run(),'one');assert.equal(calls,1);
});
test('recorder reentry cannot invoke again or replace the captured value',async()=>{
  let observer,calls=0;
  observer=createObservedOutcome(()=>{calls++;return 'first';},{record:()=>used(observer)});
  assert.equal(await observer.run(),'first');assert.equal(calls,1);
  assert.equal(copyBlobBytes(observer.snapshot().capture.blob).toString('utf16le'),'first');
});
for(const [name,value] of [['undefined',undefined],['null',null],['false',false],['zero',0],['empty',''],['symbol',Symbol('original')]]){
  test('original '+name+' throw wins over a separate recorder failure',async()=>{
    let calls=0;const recordingFailure=Object.freeze({recording:'failed'});
    const observer=createObservedOutcome(()=>{calls++;throw value;},{record:()=>{throw recordingFailure;}});
    assert.equal(await caught(observer.run()),value);assert.equal(calls,1);used(observer);
    const snapshot=observer.snapshot();assert.equal(snapshot.call_outcome,'threw');assert.equal(snapshot.primary_error_stage,'invoke');
    assert.equal(readThrownValue(snapshot.primary_error),value);assert.equal(readThrownValue(snapshot.record_error),recordingFailure);
    assert.equal(snapshot.capture,null);assert.equal(snapshot.capture_state,'unavailable');
  });
}
test('Proxy and getter-bearing thrown values are not inspected',async()=>{
  let reads=0;const value=new Proxy({}, {get(){reads++;throw Error('unexpected get');},getPrototypeOf(){reads++;throw Error('unexpected prototype');}});
  const observer=createObservedOutcome(()=>{throw value;});
  assert.equal(await caught(observer.run()),value);assert.equal(readThrownValue(observer.snapshot().primary_error),value);assert.equal(reads,0);
});
test('an original getter throw inside the function keeps its exact identity',async()=>{
  const value=Object.freeze({failure:1}),input={get text(){throw value;}};
  const observer=createObservedOutcome(()=>input.text);assert.equal(await caught(observer.run()),value);
  assert.equal(observer.snapshot().primary_error_stage,'invoke');
});
test('native Promise rejection reason remains opaque even after recording failure',async()=>{
  let reads=0,calls=0;const value=new Proxy({}, {get(){reads++;throw Error('unexpected');}});
  const observer=createObservedOutcome(()=>{calls++;return Promise.reject(value);},{record:async()=>{throw undefined;}});
  assert.equal(await caught(observer.run()),value);assert.equal(calls,1);assert.equal(reads,0);
  const snapshot=observer.snapshot();assert.equal(snapshot.call_outcome,'returned');assert.equal(snapshot.primary_error_stage,'native_promise');
  assert.equal(readThrownValue(snapshot.record_error),undefined);
});
test('native Promise observation uses ordinary JS settlement, not provider attribution',async()=>{
  const reason=Object.freeze({constructor_getter:'failed'}),promise=Promise.resolve('unobserved');
  Object.defineProperty(promise,'constructor',{get(){throw reason;}});
  const observer=createObservedOutcome(()=>promise);assert.equal(await caught(observer.run()),reason);
  assert.equal(observer.snapshot().call_outcome,'returned');assert.equal(observer.snapshot().settlement,'native_promise_rejected');
});
test('ordinary returned thenables remain nonstrings without reading then',async()=>{
  let reads=0,calls=0;const value={get then(){reads++;throw Error('must not read');},toString(){reads++;return 'coerced';}};
  const observer=createObservedOutcome(()=>{calls++;return value;});localError(await caught(observer.run()),'NON_STRING');
  assert.equal(reads,0);assert.equal(calls,1);assert.equal(readThrownValue(observer.snapshot().non_string_value),value);used(observer);
});
test('returned Proxy values are opaque and are never fulfilled to consumers',async()=>{
  let reads=0;const value=new Proxy({}, {get(){reads++;throw Error('unexpected');}}),observer=createObservedOutcome(()=>value);
  localError(await caught(observer.run()),'NON_STRING');assert.equal(reads,0);assert.equal(observer.snapshot().call_outcome,'returned');
});
test('returned undefined is nonstring success-of-call, distinct from throw undefined',async()=>{
  const observer=createObservedOutcome(()=>undefined);localError(await caught(observer.run()),'NON_STRING');
  const snapshot=observer.snapshot();assert.equal(snapshot.call_outcome,'returned');assert.equal(snapshot.primary_error,null);
  assert.equal(readThrownValue(snapshot.non_string_value),undefined);
});
test('capture failure never clips, records unavailable and never reinvokes',async()=>{
  let calls=0,recorded;
  const observer=createObservedOutcome(()=>{calls++;return 'AB';},{max_utf16_units:1,record:snapshot=>{recorded=snapshot;}});
  const failure=await caught(observer.run());assert.equal(failure,readThrownValue(observer.snapshot().capture_error));
  assert.equal(recorded.capture,null);assert.equal(recorded.capture_state,'unavailable');assert.equal(calls,1);used(observer);
});
test('snapshotted limits cannot be raised by invocation or recorder mutation',async()=>{
  const configuration={max_utf16_units:1},observer=createObservedOutcome(()=>{configuration.max_utf16_units=100;return 'AB';},configuration);
  await caught(observer.run());assert.equal(observer.snapshot().limits.max_utf16_units,1);assert.equal(observer.snapshot().capture,null);
});
test('recording failure preserves bytes and prevents consumer parsing',async()=>{
  let parsed=0;const reason=Object.freeze({record:'failed'}),observer=createObservedOutcome(()=>'{"saved":true}',{record:()=>{throw reason;}});
  const result=observer.run().then(text=>{parsed++;return JSON.parse(text);});assert.equal(await caught(result),reason);
  const snapshot=observer.snapshot();assert.equal(snapshot.phase,'failed');assert.equal(snapshot.record_state,'failed');
  assert.equal(snapshot.capture_state,'complete_local');assert.equal(copyBlobBytes(snapshot.capture.blob).toString('utf16le'),'{"saved":true}');assert.equal(parsed,0);
});
test('recorder copies and frozen metadata cannot mutate retained bytes',async()=>{
  let seen;
  const observer=createObservedOutcome(()=>'retained',{record:snapshot=>{
    seen=snapshot;const bytes=copyBlobBytes(snapshot.capture.blob);bytes.fill(0);
    assert.throws(()=>{snapshot.capture.blob.ref.bytes=0;},TypeError);
  }});
  assert.equal(await observer.run(),'retained');assert.ok(Object.isFrozen(seen)&&Object.isFrozen(seen.limits));
  assert.equal(copyBlobBytes(observer.snapshot().capture.blob).toString('utf16le'),'retained');
});
test('an asynchronous recorder must finish before the text can be consumed',async()=>{
  let release,consumed=false;const pending=new Promise(done=>{release=done;});
  const observer=createObservedOutcome(()=>'text',{record:()=>pending}),run=observer.run().then(text=>{consumed=true;return text;});
  assert.equal(observer.snapshot().record_state,'running');assert.equal(observer.snapshot().capture_state,'complete_local');assert.equal(consumed,false);used(observer);
  release(undefined);assert.equal(await run,'text');assert.equal(consumed,true);
});
test('a falsey recorder rejection is retained without being mistaken for completion',async()=>{
  const observer=createObservedOutcome(()=>'text',{record:()=>Promise.reject(undefined)});
  assert.equal(await caught(observer.run()),undefined);assert.notEqual(observer.snapshot().record_error,null);
  assert.equal(readThrownValue(observer.snapshot().record_error),undefined);assert.equal(observer.snapshot().record_state,'failed');
});
test('recorder return flags or unsupported thenables do not assert completion',async()=>{
  let reads=0;const thenable={get then(){reads++;throw Error('unexpected');}},observer=createObservedOutcome(()=>'text',{record:()=>thenable});
  localError(await caught(observer.run()),'RECORDER_RESULT');assert.equal(reads,0);assert.equal(observer.snapshot().record_state,'failed');
  const flagged=createObservedOutcome(()=>'text',{record:()=>({durable:true})});
  localError(await caught(flagged.run()),'RECORDER_RESULT');assert.equal(flagged.snapshot().record_state,'failed');
});
test('capture failure stays primary over a simultaneous recorder failure',async()=>{
  const recordFailure=Object.freeze({record:'failed'}),observer=createObservedOutcome(()=>'AB',{max_evidence_bytes:3,record:()=>{throw recordFailure;}});
  const primary=await caught(observer.run()),snapshot=observer.snapshot();assert.equal(primary,readThrownValue(snapshot.capture_error));
  assert.equal(readThrownValue(snapshot.record_error),recordFailure);assert.equal(snapshot.primary_error,null);assert.equal(snapshot.capture,null);used(observer);
});
test('explicit prefix capture is useful but never returns a complete response',async()=>{
  let calls=0,recorded;const observer=createObservedOutcome(()=>{calls++;return partialTextResult('A\ud800',20);},{record:snapshot=>{recorded=snapshot;}});
  localError(await caught(observer.run()),'INCOMPLETE');assert.equal(calls,1);used(observer);
  assert.equal(recorded.capture_state,'partial_local');assert.equal(recorded.capture.raw_capture.state,'partial');
  assert.equal(recorded.capture.raw_capture.original_units_observed,20);assert.equal(copyBlobBytes(recorded.capture.blob).toString('hex'),'410000d8');
});
test('prefix limit failure cannot claim even a partial retained capture',async()=>{
  const observer=createObservedOutcome(()=>partialTextResult('AB',100),{max_utf16_units:1});await caught(observer.run());
  assert.equal(observer.snapshot().value_kind,'partial_text');assert.equal(observer.snapshot().capture_state,'unavailable');assert.equal(observer.snapshot().capture,null);
});
test('malformed JSON parsing stays outside local observation and cannot relabel it',async()=>{
  const observer=createObservedOutcome(()=>'{"unfinished":');const text=await observer.run();assert.throws(()=>JSON.parse(text),SyntaxError);
  assert.equal(observer.snapshot().phase,'succeeded');assert.equal(observer.snapshot().primary_error,null);
  assert.equal(copyBlobBytes(observer.snapshot().capture.blob).toString('utf16le'),text);
});
test('limits and option accessors are rejected before any function invocation',()=>{
  let calls=0,reads=0;const invoke=()=>{calls++;return 'text';};
  assert.throws(()=>createObservedOutcome(invoke,{max_utf16_units:-1}),TypeError);
  assert.throws(()=>createObservedOutcome(invoke,{get record(){reads++;return ()=>{};}}),TypeError);
  assert.throws(()=>createObservedOutcome(invoke,new Proxy({}, {ownKeys(){reads++;throw Error('trap');}})),TypeError);
  assert.equal(calls,0);assert.equal(reads,0);
});
test('function arguments pass by identity and separate local observers are not allowances',async()=>{
  let calls=0;const input={fictional:true},invoke=function(value){calls++;assert.equal(this,undefined);assert.equal(value,input);return 'result';};
  const first=createObservedOutcome(invoke),second=createObservedOutcome(invoke);
  assert.equal(await first.run(input),'result');assert.equal(await second.run(input),'result');assert.equal(calls,2);
});
test('native Promise repeated settlement cannot duplicate capture or recording',async()=>{
  let calls=0,records=0;const observer=createObservedOutcome(()=>{calls++;return new Promise((resolve,reject)=>{resolve('first');resolve('second');reject('ignored');});},{record:()=>{records++;}});
  assert.equal(await observer.run(),'first');assert.equal(calls,1);assert.equal(records,1);used(observer);
});
