import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../plugins/soloco/runtime/store.mjs';
import {buildScopedStream} from '../plugins/soloco/runtime/scoped-stream.mjs';
import {factorCorpusStructure,expandCorpusStructure} from '../plugins/soloco/runtime/corpus-structure.mjs';

const plan={id:'plan-fixture',revision:1,sha256:'a'.repeat(64)};
const packet=content=>({target:{id:'target-fixture',revision:2,sha256:'b'.repeat(64)},content,response_shape:{verdict:'Pass or Blocked',reason:'complete evidence only'}});
// Golden complete-stream digests from the pre-optimization producer at 3b9b4d1.
// Every manifest, page boundary, original/range/request hash and wire byte counts.
test('stream size probes retain exact legacy bytes for escaped, Unicode and boundary-sized evidence',()=>{
 const cases=[
  ['Keep every qualifier.','46ba2916feeaf4cbd01ac7915e08eff2eb1383d83b5f5f01801e647bb986d923',1],
  ['A'.repeat(96000),'fc226eca1d17c41a34787e28c6fd89edf7db1bab6a2f497543f7980f51b2564c',3],
  ['Quote" slash\\ newline\n tab\t astral😀 lone\ud800 中文'.repeat(3000),'619e16b9fa429d4401c8fdf5e2cc5bf351573453ebf03fd5de55b94ec9a7aded',5],
  ['😀漢"\n\\'.repeat(20000),'7170d63c9b42038a50ea1746257acf81a434714b2905d1b112be6a17dc50b926',8],
 ];
 for(const [content,expected,count] of cases){
  const original=packet(content),stream=buildScopedStream(original,plan);
  assert.equal(digest(JSON.stringify(stream)),expected);assert.equal(stream.pages.length,count);
  const raw=stream.pages.map(p=>{assert(Buffer.byteLength(p.wire)<=48000);const frame=JSON.parse(p.wire);assert.equal(digest(frame.text),p.range_sha256);assert.equal(digest(p.wire),p.request_sha256);return frame.text;}).join('');
  assert.deepEqual(JSON.parse(raw),original);assert.equal(digest(raw),stream.manifest.body_sha256);
 }
});

test('stream construction observes changed packet and plan identities on every call',()=>{
 const original=packet('Complete UNKNOWN qualifier. '.repeat(2000)),ref={...plan};
 const a=buildScopedStream(original,ref);original.content+=' New restriction.';
 const b=buildScopedStream(original,ref);assert.notEqual(a.manifest.body_sha256,b.manifest.body_sha256);
 ref.revision++;const c=buildScopedStream(original,ref);assert.notEqual(b.pages[0].wire,c.pages[0].wire);
 assert.equal(JSON.parse(c.pages[0].wire).plan.revision,2);
});

test('structural factoring preserves complete semantic subgraphs and remains live after mutation',()=>{
 const logical={target:{id:'target',revision:1,sha256:'b'.repeat(64)},sources:[{id:'source',revision:1},{id:'source',revision:1}],
  content:{text:'Unknown/exhausted conditions remain open.',body:{repeated:'Exact semantic body. '.repeat(100),literal:{$r:5,$row:'data'}},opposite:{allow:'after consent',deny:'even with consent'}},
  result:{conditions:['unknown','failed','zero allowance'],nested:{content:'Never infer equivalent applicability.'}}};
 const first=factorCorpusStructure(logical);assert.equal(digest(JSON.stringify(first)),'d2d66eb82aa9a98b008bd1919fa4a17f821f96d904a4265a52da62513aa5206e');assert.deepEqual(expandCorpusStructure(first),logical);
 logical.content.opposite.deny='Never allowed';const second=factorCorpusStructure(logical);
 assert.notEqual(first.logical_sha256,second.logical_sha256);assert.deepEqual(expandCorpusStructure(second),logical);
});
