import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {compileFunction} from 'node:vm';
import {renderDevelopmentReviewContext as renderFiles,restoreDevelopmentFileBodies} from '../plugins/soloco/runtime/development-file-bodies.mjs';
import {DEVELOPMENT_RECEIPT_JSON_PROTOCOL,renderDevelopmentReviewContext,restoreDevelopmentReceiptJSON} from '../plugins/soloco/runtime/development-receipt-json.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
const assignmentHash=digest('unchanged synthetic assignment');
function fixture(){
  const body='export const synthetic=true;\n'.repeat(200);
  const scope={sources:[{path:'frozen.mjs',content:body,sha256:digest(body)}]};
  const p={id:'plan',kind:'artifact',revision:1,development:{type:'plan',scope,scope_sha256:digest(JSON.stringify(scope))}};
  const files=[{path:'frozen.mjs',content:body}],c={id:'candidate',kind:'artifact',revision:1,development:{type:'candidate',plan_id:p.id,scope_sha256:p.development.scope_sha256,files,candidate_sha256:digest(JSON.stringify(files))}};
  const result={status:'passed',stdout:'synthetic output 😀\r\n'.repeat(500),stderr:'',tests_executed:true,unknown:{failure:'retained'}},r={id:'receipt',kind:'artifact',author_role:'runtime',revision:1,content:JSON.stringify(result),development:{type:'test',plan_id:p.id,candidate_id:c.id,candidate_sha256:c.development.candidate_sha256,result,receipt_sha256:digest(JSON.stringify(result))}};
  const previous={...structuredClone(r),id:'previous',content:'Historical failure MUST remain complete',development:{...structuredClone(r.development),result:{status:'failed',tests_executed:false,error:'retained'}}};
  const task='Complete exact synthetic task\n'.repeat(150),value={company_id:'synthetic',name:'Synthetic',governance:'no authority',charter:{name:'QA'},records:[p,c,previous,r],notices:[],messages:[],assignment:{task}};
  const job={role:'qa',review_of:{id:r.id,revision:r.revision},task,instance_id:'synthetic-instance'};
  return {value,job,context:{text:JSON.stringify(value),hash:assignmentHash},r,previous};
}
function rendered(f){return renderDevelopmentReviewContext(f.context,f.job);}
function restore(f,text){return restoreDevelopmentReceiptJSON(text,digest(f.context.text),f.context.hash,f.job.review_of);}
function mutate(f,change){const w=JSON.parse(rendered(f));change(w);assert.throws(()=>restore(f,JSON.stringify(w)));}

test('current exact JSON receipt is shared with complete literal result and byte-exact original reconstruction',()=>{
  const f=fixture(),before=JSON.stringify(f),text=rendered(f),w=JSON.parse(text);
  assert.equal(w.protocol,DEVELOPMENT_RECEIPT_JSON_PROTOCOL);assert.equal(w.receipt_json_aliases.length,1);
  assert.deepEqual(w.context.records[3].content,{receipt_result_json_alias_v1:0});
  assert.deepEqual(w.context.records[3].development.result,f.r.development.result);
  assert.deepEqual(w.context.records[2],f.previous);assert.equal(restore(f,text),f.context.text);
  assert.equal(JSON.stringify(f),before);assert.ok(text.length<renderFiles(f.context,f.job).length);
  assert.notEqual(w.receipt_json_aliases[0].utf8_bytes,w.receipt_json_aliases[0].utf16_characters);
});
test('other or extra receipt content is never discarded even when parsed JSON is equal',()=>{
  for(const convert of [r=>' '+r.content,r=>JSON.stringify(r.development.result,null,2),r=>r.content+'\n',r=>'independent explanation']){
    const f=fixture();f.r.content=convert(f.r);f.context.text=JSON.stringify(f.value);
    assert.equal(rendered(f),renderFiles(f.context,f.job));
  }
});
test('non-object result preserves the existing renderer presentation',()=>{
  for(const result of [null,[],false,'opaque']){const f=fixture();f.r.development.result=result;f.r.content=JSON.stringify(result);f.context.text=JSON.stringify(f.value);assert.equal(rendered(f),renderFiles(f.context,f.job));}
});
test('existing no-benefit and nondevelopment paths retain exact old presentation',()=>{
  const f=fixture();assert.equal(renderDevelopmentReviewContext(f.context,{...f.job,role:'engineer'}),f.context.text);
  f.r.content='{}';f.r.development.result={};f.context.text=JSON.stringify(f.value);
  const text=rendered(f);assert.equal(text,renderFiles(f.context,f.job));
});
test('receipt aliases reject retargeting, substituted bodies, unknown fields and changed commitments',()=>{
  const f=fixture();
  const changes=[w=>w.receipt_json_aliases[0].record_index--,w=>w.receipt_json_aliases[0].record_id='previous',w=>w.receipt_json_aliases[0].record_revision++,w=>w.receipt_json_aliases[0].serialization='parse',w=>w.receipt_json_aliases[0].sha256='0'.repeat(64),w=>w.receipt_json_aliases[0].utf8_bytes++,w=>w.receipt_json_aliases[0].utf16_characters++,w=>w.receipt_json_aliases[0].extra=true,w=>w.context.records[3].development.result.stdout+='changed',w=>w.context.records[3].content.receipt_result_json_alias_v1=1,w=>w.context.records[3].content.extra=true,w=>w.receipt_json_aliases.push(w.receipt_json_aliases[0]),w=>w.receipt_json_aliases=[],w=>w.protocol='other',w=>w.extra=true];
  for(const change of changes)mutate(f,change);
});
test('original, assignment and review identity remain independently pinned',()=>{
  const f=fixture(),text=rendered(f);
  assert.throws(()=>restoreDevelopmentReceiptJSON(text,'0'.repeat(64),f.context.hash,f.job.review_of));
  assert.throws(()=>restoreDevelopmentReceiptJSON(text,digest(f.context.text),'0'.repeat(64),f.job.review_of));
  assert.throws(()=>restoreDevelopmentReceiptJSON(text,digest(f.context.text),f.context.hash,{id:'previous',revision:1}));
  assert.throws(()=>restoreDevelopmentReceiptJSON(text,digest(f.context.text),f.context.hash));
});
test('lookalikes in result, notices, other records and assignment remain ordinary complete data',()=>{
  const f=fixture(),data={receipt_result_json_alias_v1:0};f.value.notices.push(data);f.value.assignment.data=data;f.r.development.result.data=data;f.r.content=JSON.stringify(f.r.development.result);f.context.text=JSON.stringify(f.value);
  assert.equal(restore(f,rendered(f)),f.context.text);assert.deepEqual(JSON.parse(rendered(f)).context.notices,[data]);
});
test('noncompact spelling and unresolved original file aliases cannot bypass existing checks',()=>{
  const f=fixture();assert.throws(()=>restore(f,JSON.stringify(JSON.parse(rendered(f)),null,2)));
  mutate(f,w=>{w.context.records[1].development.files[0].content={file_body_alias_v1:99};});
});
const workerText=fs.readFileSync(new URL('../plugins/soloco/runtime/worker.mjs',import.meta.url),'utf8');
const start=workerText.indexOf('    const charter=state.roles[job.role];'),end=workerText.indexOf("    const dir=path.join(dataDir(),'sessions',job.instance_id);",start);
assert.ok(start>=0&&end>start);
const assemble=compileFunction(workerText.slice(start,end)+'\nreturn {prompt,originalPrompt,sharedPrompt,assignmentPromptText,fileBodySharingInstruction};',['state','job','context','renderDevelopmentReviewContext','digest','prototypePrompt','developmentPrompt']);
function probe(f,job=f.job){return assemble({roles:{qa:{name:'QA'}},records:Object.fromEntries(f.value.records.map(r=>[r.id,r]))},job,f.context,renderDevelopmentReviewContext,digest,()=>'',()=>'EXISTING_DEVELOPMENT_HELPER');}
test('actual worker references whole task once only on exact match; complete template benefits in both units',()=>{
  const f=fixture(),r=probe(f);assert.ok(r.prompt.includes('Assignment: Read the exact complete task string at context.assignment.task'));
  assert.equal(r.prompt.split(JSON.stringify(f.job.task).slice(1,-1)).length,2);assert.ok(r.originalPrompt.includes('Assignment: '+f.job.task));
  assert.ok(r.prompt.length<r.originalPrompt.length);assert.ok(Buffer.byteLength(r.prompt)<Buffer.byteLength(r.originalPrompt));
  assert.equal(restore(f,r.assignmentPromptText),f.context.text);assert.ok(r.fileBodySharingInstruction.includes('receipt_result_json_alias_v1:0'));
});
test('actual worker preserves a distinct outer task with no implied task identity',()=>{
  const f=fixture(),job={...f.job,task:'Distinct outer instructions'},r=probe(f,job);
  assert.ok(r.prompt.includes('Assignment: '+job.task));assert.ok(r.prompt.includes(JSON.stringify(f.value.assignment.task).slice(1,-1)));
});
