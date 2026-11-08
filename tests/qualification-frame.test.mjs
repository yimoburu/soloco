import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQualificationReviewFrame} from '../plugins/soloco/runtime/qualification-frame.mjs';

function input(){return {
  plan:{id:'fictional-plan',revision:3,sha256:'a'.repeat(64)},
  required_semantics:{source_id:'semantic-source',sha256:'b'.repeat(64),length:65538},
  registry:{source_id:'optional-index',sha256:'c'.repeat(64),length:100},
  read_ranges:[{offset:0,length:32767},{offset:32767,length:32768},{offset:65535,length:3}],
  charter:{name:'Actual fixture QA',mission:'Compare exact preservation homes',block:'Uncertain preservation'},
  assignment:{task:'Review this exact fictional plan and retain its failed attempt.',instance_id:'fixture-instance'}
};}

test('wire frame preserves handles, authentic ranges, charter and exact task',()=>{
  const supplied=input(),frame=JSON.parse(JSON.stringify(buildQualificationReviewFrame(supplied)));
  assert.equal(frame.protocol,'context-qualification-review-v2');
  for(const key of ['plan','required_semantics','registry','assignment'])assert.deepEqual(frame[key],supplied[key]);
  assert.deepEqual(frame.role.charter,supplied.charter);
  assert.equal(frame.role.mode,'preparation');
  const wire=frame.evidence_protocol;
  assert.deepEqual(wire.request_keys,['reads']);
  assert.deepEqual(wire.read_keys,['source_id','sha256','offset','length']);
  assert.equal(wire.min_ranges,1);assert.equal(wire.max_ranges,4);
  assert.equal(wire.offset_units,'UTF-16');assert.equal(wire.range_limit,32768);
  assert.equal(frame.range_limit,32768);
  assert.deepEqual(wire.read_ranges,supplied.read_ranges);
  assert.deepEqual(wire.request_template,{reads:[{source_id:supplied.required_semantics.source_id,sha256:supplied.required_semantics.sha256,offset:0,length:32767}]});
  let end=0;
  for(const range of wire.read_ranges){assert.equal(range.offset,end);assert.ok(range.length>0&&range.length<=32768);end+=range.length;}
  assert.equal(end,frame.required_semantics.length);
  // The formatter neither reads evidence nor declares any of it delivered.
  assert.equal(frame.assessment.complete_stream_before_pass,true);
  assert.equal(Object.hasOwn(frame,'initial_delivery'),false);
  assert.equal(Object.hasOwn(frame,'context_qualification'),false);
  assert.equal(Object.hasOwn(frame,'review'),false);
});

test('final contract supplies an actionable Blocked envelope and separate Pass conditions',()=>{
  const supplied=input(),contract=buildQualificationReviewFrame(supplied).final_response;
  const blocked=JSON.parse(JSON.stringify(contract.blocked_example));
  assert.deepEqual(Object.keys(blocked),contract.required_keys);
  assert.deepEqual(Object.keys(blocked.review),contract.review_keys);
  assert.ok(blocked.content.trim());assert.ok(blocked.review.reason.trim());
  assert.deepEqual(blocked.messages,[]);assert.deepEqual(blocked.notices,[]);
  assert.equal(blocked.review.verdict,'Blocked');assert.equal(blocked.review.permitted_action,'hold');
  assert.equal(blocked.review.plan_sha256,supplied.plan.sha256);
  assert.equal(blocked.review.coverage_complete,false);assert.equal(blocked.review.obligations_preserved,false);
  assert.ok(blocked.review.blockers.every(v=>typeof v==='string'&&v.trim()));
  assert.deepEqual(contract.verdicts,['Pass','Fail','Blocked']);
  assert.deepEqual(contract.pass_requires,{plan_sha256:supplied.plan.sha256,coverage_complete:true,obligations_preserved:true,unique_findings:[],blockers:[],permitted_action:'apply_context_classification'});
});

test('range metadata is complete even above the external frame cap; source bodies stay absent',()=>{
  const supplied=input();
  supplied.read_ranges=Array.from({length:12000},(_,i)=>({offset:i*32768,length:32768,raw:'PRIVATE BODY MUST NOT BE COPIED'}));
  supplied.required_semantics.length=12000*32768;
  supplied.required_semantics.raw='PRIVATE BODY MUST NOT BE COPIED';
  // Production passes reference-only handles. Keep that boundary explicit here.
  const {raw,...handle}=supplied.required_semantics;supplied.required_semantics=handle;
  const frame=buildQualificationReviewFrame(supplied),text=JSON.stringify(frame);
  assert.equal(frame.evidence_protocol.read_ranges.length,12000);
  assert.deepEqual(frame.evidence_protocol.read_ranges.at(-1),{offset:11999*32768,length:32768});
  assert.ok(text.length>200000,'the caller, not a silent formatter truncation, enforces the existing cap');
  assert.equal(text.includes(raw),false);
  assert.equal(Object.hasOwn(frame,'accepted'),false);
  assert.equal(Object.hasOwn(frame,'semantic_delivery_complete'),false);
});
