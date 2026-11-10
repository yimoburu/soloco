// Presentation only. Synthetic target labels grant no current authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../plugins/soloco/runtime/store.mjs';
import {renderDevelopmentReviewContext} from '../plugins/soloco/runtime/development-receipt-json.mjs';
import {renderContinuationAwareReviewContext,restoreContinuationReviewContext,CONTINUATION_REVIEW_TRANSPORT} from '../plugins/soloco/runtime/continuation-review-transport.mjs';
const hash=v=>digest(JSON.stringify(v));
function fixture(){
  const content='// Whole Unicode 🌍 source body.\r\n'.repeat(1000),files=[{path:'sample.mjs',content}],scope={sources:[{...files[0],sha256:digest(content)}]},scope_sha256=hash(scope),candidate_sha256=hash(files);
  const result={status:'passed',stdout:'Actual runtime result is synthetic in this presentation fixture.\n'.repeat(1000),tests_executed:true};
  const plan={id:'plan',kind:'artifact',revision:1,development:{type:'plan',scope,scope_sha256}},candidate={id:'candidate',kind:'artifact',revision:1,development:{type:'candidate',plan_id:'plan',scope_sha256,candidate_sha256,files}};
  const receipt={id:'receipt',kind:'artifact',revision:1,author_role:'runtime',content:JSON.stringify(result),development:{type:'test',plan_id:'plan',candidate_id:'candidate',candidate_sha256,result,receipt_sha256:hash(result)}};
  const target={id:'current-target',kind:'artifact',revision:1,status:'Submitted',author_role:'runtime',development:{type:'review_continuation',protocol:'development-review-local-acceptance-continuation-v1',plan_id:'plan',candidate_id:'candidate',receipt_id:'receipt',authorization:{current:'Unapproved synthetic data only'}}};
  const context={text:JSON.stringify({company_id:'fictional',name:'Presentation fixture',governance:'Whole governance',charter:{name:'QA'},records:[plan,candidate,receipt,target,{id:'prior-negative',kind:'review',review:{verdict:'Fail'},content:'Original negative remains.'}],notices:[{summary:'Unknown prior closure remains unknown.'}],messages:[],unknown_user_value:{receipt_result_json_alias_v1:0}}),hash:digest('unchanged semantic assignment hash')};
  return {context,job:{role:'qa',context_format:3,review_of:{id:target.id,revision:1}},target: {id:target.id,revision:1,sha256:hash(target)}};
}
test('new authoritative target is separately bound while whole historical test/file presentation roundtrips exactly',()=>{
  const f=fixture(),before=f.context.text,wire=renderContinuationAwareReviewContext(f.context,f.job),p=JSON.parse(wire);
  assert.equal(p.protocol,CONTINUATION_REVIEW_TRANSPORT);assert.deepEqual(p.review_target,f.target);assert.equal(p.receipt_dependency.id,'receipt');assert.equal(p.presentation.review_of.id,'receipt');assert.equal(p.presentation.protocol,'development-review-receipt-json-aliases-v1');
  assert.equal(restoreContinuationReviewContext(wire,digest(before),f.context.hash,f.target),before);assert.equal(f.context.text,before);assert(wire.length<before.length);assert(Buffer.byteLength(wire)<Buffer.byteLength(before));
  const restored=JSON.parse(restoreContinuationReviewContext(wire,digest(before),f.context.hash,f.target));assert.deepEqual(restored.unknown_user_value,{receipt_result_json_alias_v1:0});assert.equal(restored.records.at(-1).review.verdict,'Fail');assert.equal(restored.records[3].development.type,'review_continuation');
});
for(const label of ['current target','historical receipt','whole context','extra authority field'])test('substitution rejects '+label,()=>{
  const f=fixture(),wire=JSON.parse(renderContinuationAwareReviewContext(f.context,f.job));
  if(label==='current target')wire.review_target.sha256=digest('other');
  if(label==='historical receipt')wire.receipt_dependency.id='some-other-receipt';
  if(label==='whole context')wire.presentation.context.notices=[];
  if(label==='extra authority field')wire.ready=true;
  assert.throws(()=>restoreContinuationReviewContext(JSON.stringify(wire),digest(f.context.text),f.context.hash,f.target));
});
test('ordinary test and unrelated target rendering remain exactly on the existing codec/fallback',()=>{
  const f=fixture();for(const id of ['receipt','prior-negative']){const job={...f.job,review_of:{id,revision:1}};assert.equal(renderContinuationAwareReviewContext(f.context,job),renderDevelopmentReviewContext(f.context,job));}
});

for(const [label,text] of [['malformed JSON','not JSON'],['JSON null','null'],['null record','{"records":[null]}'],['ordinary noncanonical',' {"records":[]} ']])test('ordinary fallback preserves exact old renderer for '+label,()=>{
 const context={text,hash:digest(text)},job={role:'qa',context_format:3,review_of:{id:'unrelated',revision:1}};assert.equal(renderContinuationAwareReviewContext(context,job),renderDevelopmentReviewContext(context,job));
});
for(const context of [null,undefined])test('absent ordinary context preserves exact existing fallback '+String(context),()=>{const job={role:'qa',context_format:3,review_of:{id:'unrelated',revision:1}};assert.equal(renderContinuationAwareReviewContext(context,job),renderDevelopmentReviewContext(context,job));});
test('activated typed noncanonical source remains fail closed',()=>{const f=fixture();f.context.text=' '+f.context.text;assert.throws(()=>renderContinuationAwareReviewContext(f.context,f.job));});
