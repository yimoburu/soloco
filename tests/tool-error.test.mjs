import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {toolError} from '../plugins/soloco/runtime/tool-error.mjs';

test('ordinary tool errors preserve the existing bounded error response',()=>{
  assert.deepEqual(toolError(new Error('Actual refusal')),{isError:true,content:[{type:'text',text:'Actual refusal'}]});
  assert.equal(toolError(new Error('x'.repeat(3000))).content[0].text.length,2000);
});

test('a structured admission hold retains complete bounded diagnostics without inventing a source',()=>{
  const preflight={protocol:'controlled-preflight',status:'held',hold_reasons:[{code:'frame_overflow',message:'Complete evidence exceeds the frame limit.'}],frames:{final:{UTF16_characters:1048577}}};
  const error=Object.assign(new Error('Review held before dispatch'),{code:'REVIEW_PREFLIGHT_HELD',preflight});
  const result=toolError(error),body=JSON.parse(result.content[0].text);
  assert.equal(result.isError,true);assert.deepEqual(body.preflight,preflight);
  assert.equal(body.execution_authorized,false);
  assert.equal(body.preflight_reference.sha256,createHash('sha256').update(JSON.stringify(preflight)).digest('hex'));
  assert.equal(body.preflight_reference.total_characters,JSON.stringify(preflight).length);
  assert.equal(body.preflight_reference.read,undefined);
});

test('oversized diagnostics disclose omission and keep authentic refusal reasons and commitment',()=>{
  const preflight={status:'held',source_diagnostic:'x'.repeat(100000),hold_reasons:[{code:'capacity',message:'The complete source does not fit.'}]};
  const error=Object.assign(new Error('Held'),{code:'REVIEW_PREFLIGHT_HELD',preflight});
  const result=toolError(error),body=JSON.parse(result.content[0].text);
  assert(Buffer.byteLength(result.content[0].text)<=24000);
  assert.equal(body.preflight,undefined);assert.equal(body.preflight_not_inlined,true);
  assert.deepEqual(body.hold_reasons,preflight.hold_reasons);
  assert.equal(body.preflight_reference.UTF8_bytes,Buffer.byteLength(JSON.stringify(preflight)));
  assert.match(body.retrieval,/No complete report was delivered/);
});

test('malformed or cyclic diagnostic values cannot turn an error into a successful response',()=>{
  for(const preflight of [null,[],{status:'measured'}]){
    const result=toolError(Object.assign(new Error('Held'),{code:'REVIEW_PREFLIGHT_HELD',preflight}));
    assert.deepEqual(result,{isError:true,content:[{type:'text',text:'Held'}]});
  }
  const preflight={status:'held'};preflight.self=preflight;
  assert.deepEqual(toolError(Object.assign(new Error('Held'),{code:'REVIEW_PREFLIGHT_HELD',preflight})),{isError:true,content:[{type:'text',text:'Held'}]});
});
