import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {encodePeerOwnerSubject,decodePeerOwnerSubject,PEER_OWNER_CONTEXT_POOL_INSTRUCTION} from '../plugins/soloco/runtime/peers/owner-context-pool.mjs';

// Pure source representation tests. No ledger, native issuer, process, policy
// change or company is created by this codec.
const REF='$peerOwnerTaskContext',LITERAL='$peerOwnerLiteralObject';
const copy=value=>JSON.parse(canonical(value));
const invalid=error=>error?.code==='OWNER_SUBJECT_ENCODING_INVALID';
const capacity=error=>error?.code==='OWNER_SUBJECT_ENCODING_CAPACITY';
function context(instructions='Inspect the complete fictional evidence. '.repeat(35),extra={}){
  const body={protocol:'peer-task-context-v1',task:{id:'source-task',definition:{instructions,acceptance:'Preserve all uncertainty.'}},sources:[],...extra};
  const text=canonical(body),sha256=peerDigest(body);
  return {...body,text,sha256,hash:sha256,utf8_bytes:Buffer.byteLength(text)};
}
function row(id,value,{family='tasks',revision=1,legacy_value}={}){
  return {family,id,revision,sha256:peerDigest(value),value,...(legacy_value===undefined?{}:{legacy_value})};
}
function source({ctx=context(),current=null,historical=null,incoming=null}={}){
  return {protocol:'peer-owner-subject-v1',company_id:'fictional-codec-company',root_sha256:peerDigest('fictional-root'),incoming:incoming??{host:'codex',session_id:'incoming-source',native_id:'incoming-native'},
    current:current??[row('task-current',{status:'quarantined',attempt:{context:ctx},result:{output:'Original UNKNOWN output remains.',termination_confirmed:false},closure:{termination_confirmed:true}}),row('original-admission',{result:{context:ctx,task:{attempt:{context:ctx}}}},{family:'commands'})],
    historical:historical??[row('task-current',{status:'unknown',attempt:{context:ctx},result:{output:'Original UNKNOWN output remains.',termination_confirmed:false}},{revision:2})]};
}
function firstContext(packet){const id=Object.keys(packet.encoding.task_contexts)[0];assert(id);return {id,entry:packet.encoding.task_contexts[id]};}

test('one complete context serves repeated source rows with exact source and row hashes',()=>{
  const original=source(),before=canonical(original),encoded=encodePeerOwnerSubject(original),decoded=decodePeerOwnerSubject(encoded);
  assert.equal(encoded.protocol,'peer-owner-subject-context-pool-v1');
  assert.equal(Object.keys(encoded.encoding.task_contexts).length,1);
  assert.equal(canonical(decoded),before);assert.equal(canonical(original),before);
  assert.equal(encoded.encoding.source_sha256,peerDigest(original));
  assert.equal(encoded.encoding.source_characters,before.length);assert.equal(encoded.encoding.source_utf8_bytes,Buffer.byteLength(before));
  for(const group of ['current','historical'])for(let i=0;i<original[group].length;i++){
    const actual=encoded[group][i],expected=original[group][i];
    for(const key of ['family','id','revision','sha256'])assert.equal(actual[key],expected[key]);
    assert.equal(peerDigest(decoded[group][i].value),expected.sha256);
  }
  assert(Buffer.byteLength(canonical(encoded))<Buffer.byteLength(before));
  assert.deepEqual(decoded.current[0].value.result,original.current[0].value.result);
  assert.equal(decoded.current[0].value.closure.termination_confirmed,true);
});

test('Unicode character and UTF-8 accounting and nested distinct contexts roundtrip exactly',()=>{
  const inner=context('中文🙂é\n'),outer=context('Inspect retained nested evidence.',{sources:[{value:inner}]});
  const original=source({ctx:outer}),encoded=encodePeerOwnerSubject(original),decoded=decodePeerOwnerSubject(encoded);
  assert.equal(Object.keys(encoded.encoding.task_contexts).length,2);
  assert.equal(canonical(decoded),canonical(original));
  assert(encoded.encoding.source_utf8_bytes>encoded.encoding.source_characters);
  assert.equal(decoded.current[0].value.attempt.context.sources[0].value.text,inner.text);
});

test('both reserved marker keys, arrays and prototype-looking keys remain literal source data',()=>{
  const ctx=context(),id=peerDigest(ctx),literal=JSON.parse('{"__proto__":{"polluted":true},"$peerOwnerTaskContext":"literal","$peerOwnerLiteralObject":[["constructor",{"prototype":"data"}]],"nested":[{"$peerOwnerTaskContext":"another literal"}]}');
  literal[REF]=id;
  const original=source({current:[row('literal',{ctx,literal,arrays:[[REF,id],[LITERAL,[]]],constructor:{prototype:{data:true}}})],historical:[]});
  const encoded=encodePeerOwnerSubject(original),decoded=decodePeerOwnerSubject(encoded);
  assert.equal(canonical(decoded),canonical(original));assert.equal({}.polluted,undefined);
  assert.equal(decoded.current[0].value.literal[REF],id);
  assert.equal(Object.hasOwn(decoded.current[0].value.literal,'__proto__'),true);
  assert.deepEqual(decoded.current[0].value.literal.__proto__,{polluted:true});
});

test('legacy inline evidence and unrecognized context-shaped facts are preserved without pooling them',()=>{
  const malformed={protocol:'peer-task-context-v1',text:'This is retained evidence, not a valid canonical context.',sha256:'a'.repeat(64),hash:'a'.repeat(64),utf8_bytes:1};
  const original=source({current:[row('legacy',{source:{kind:'legacy',sha256:'b'.repeat(64)},fact:malformed},{family:'work_items',legacy_value:{raw:malformed,marker:{[REF]:'literal'}}})],historical:[]});
  const encoded=encodePeerOwnerSubject(original);assert.equal(Object.keys(encoded.encoding.task_contexts).length,0);
  assert.equal(canonical(decodePeerOwnerSubject(encoded)),canonical(original));
});

test('arbitrary header JSON is retained as data and a pool encoding is deterministic',()=>{
  const original=source({incoming:{host:'codex',session_id:'source',native_id:'native',additional:{[REF]:'literal-header-data'}}});
  const first=encodePeerOwnerSubject(original),second=encodePeerOwnerSubject(copy(original));
  assert.equal(canonical(first),canonical(second));assert.deepEqual(first.incoming,original.incoming);
  assert.deepEqual(decodePeerOwnerSubject(first).incoming,original.incoming);
});

for(const change of [
  packet=>{packet.current[0].value.status='invented';},
  packet=>{packet.current[0].sha256='0'.repeat(64);},
  packet=>{packet.encoding.source_sha256='0'.repeat(64);},
  packet=>{packet.encoding.source_characters++;},
  packet=>{packet.encoding.source_utf8_bytes++;},
  packet=>{packet.incoming.native_id='replacement';},
  packet=>{firstContext(packet).entry.value.task.definition.instructions='changed';},
  packet=>{firstContext(packet).entry.text_encoding.characters++;},
  packet=>{firstContext(packet).entry.text_encoding.utf8_bytes++;},
  packet=>{firstContext(packet).entry.value.text='An extra text field cannot override restoration.';}
])test('tampered source or context cannot pass exact reconstruction: '+change.toString(),()=>{
  const packet=encodePeerOwnerSubject(source());change(packet);assert.throws(()=>decodePeerOwnerSubject(packet),invalid);
});

test('missing, extra and unused pool entries are rejected rather than normalized away',()=>{
  const encoded=encodePeerOwnerSubject(source()),missing=copy(encoded),extra=copy(encoded),unused=copy(encoded),badRef=copy(encoded),{id}=firstContext(encoded);
  delete missing.encoding.task_contexts[id];assert.throws(()=>decodePeerOwnerSubject(missing),invalid);
  firstContext(extra).entry.authority=true;assert.throws(()=>decodePeerOwnerSubject(extra),invalid);
  unused.encoding.task_contexts['0'.repeat(64)]=copy(firstContext(unused).entry);assert.throws(()=>decodePeerOwnerSubject(unused),invalid);
  badRef.current[0].value.attempt.context.extra=true;assert.throws(()=>decodePeerOwnerSubject(badRef),invalid);
});

test('cyclic pool references reject before reconstructing unbounded contexts',()=>{
  const packet=encodePeerOwnerSubject(source()),{id,entry}=firstContext(packet);
  entry.value.sources=[{[REF]:id}];assert.throws(()=>decodePeerOwnerSubject(packet),invalid);
});

test('literal escape records reject duplicate keys, noncanonical order and unnecessary escaping',()=>{
  const packet=encodePeerOwnerSubject(source());
  for(const entries of [[[REF,'one'],[REF,'two']],[[REF,'one'],['a','two']],[['ordinary','not a reserved key']]]){
    const changed=copy(packet);changed.current[0].value={[LITERAL]:entries};assert.throws(()=>decodePeerOwnerSubject(changed),invalid);
  }
});

test('closed source, encoding, row and text-recipe schemas reject unknown or missing fields',()=>{
  const original=source();
  const wrongRow=copy(original);wrongRow.current[0].sha256='0'.repeat(64);assert.throws(()=>encodePeerOwnerSubject(wrongRow),invalid);
  const duplicate=copy(original);duplicate.historical.push(copy(duplicate.current[0]));assert.throws(()=>encodePeerOwnerSubject(duplicate),invalid);
  for(const mutate of [
    p=>{p.authority='new';},p=>{p.encoding.ready=true;},p=>{delete p.encoding.source_protocol;},p=>{p.current[0].created_seq=1;},p=>{firstContext(p).entry.text_encoding.extension=true;},p=>{p.protocol='peer-owner-subject-v2';}
  ]){const packet=encodePeerOwnerSubject(original);mutate(packet);assert.throws(()=>decodePeerOwnerSubject(packet),invalid);}
  assert.throws(()=>decodePeerOwnerSubject(original),invalid);
});

test('acyclic plain JSON validation does not invoke getters or silently lose values',()=>{
  let calls=0;const original=source();Object.defineProperty(original.incoming,'bad',{enumerable:true,get(){calls++;return 'never';}});
  assert.throws(()=>encodePeerOwnerSubject(original),invalid);assert.equal(calls,0);
  const cyclic=source();cyclic.incoming.self=cyclic;assert.throws(()=>encodePeerOwnerSubject(cyclic),invalid);
  for(const value of [undefined,NaN,-0,()=>{},Symbol('not-json')]){const input=source();input.current[0].value.bad=value;assert.throws(()=>encodePeerOwnerSubject(input),invalid);}
});

test('row, pool, depth and declared preparation bounds fail closed',()=>{
  const tooMany=source({current:Array.from({length:10001},(_,i)=>row('row-'+i,{})),historical:[]});assert.throws(()=>encodePeerOwnerSubject(tooMany),capacity);
  const manyPool=encodePeerOwnerSubject(source());manyPool.encoding.task_contexts=Object.fromEntries(Array.from({length:10001},(_,i)=>[i.toString(16).padStart(64,'0'),{}]));assert.throws(()=>decodePeerOwnerSubject(manyPool),capacity);
  const declared=encodePeerOwnerSubject(source());declared.encoding.source_utf8_bytes=16*1024*1024+1;assert.throws(()=>decodePeerOwnerSubject(declared),capacity);
  const deep=source();let cursor=deep.incoming;for(let i=0;i<140;i++){cursor.child={};cursor=cursor.child;}assert.throws(()=>encodePeerOwnerSubject(deep),capacity);
});

test('small encoded references cannot expand beyond the bounded original preparation size',()=>{
  const original=source({ctx:context('x'.repeat(10000))}),packet=encodePeerOwnerSubject(original),{id}=firstContext(packet);
  packet.current[0].value={copies:Array.from({length:1000},()=>({[REF]:id}))};packet.encoding.source_utf8_bytes=16*1024*1024;
  assert.throws(()=>decodePeerOwnerSubject(packet),capacity);
});

test('the fixed source instruction describes restoration and explicitly grants no authority',()=>{
  assert(PEER_OWNER_CONTEXT_POOL_INSTRUCTION.includes('peer-owner-subject-context-pool-v1'));
  for(const key of [REF,LITERAL,'canonical','UTF-8','DECODED','No facts are omitted','no execution'])assert(PEER_OWNER_CONTEXT_POOL_INSTRUCTION.includes(key));
  assert(PEER_OWNER_CONTEXT_POOL_INSTRUCTION.length<4000);
});
