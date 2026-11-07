import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {id,withStore} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {submitTask} from '../plugins/soloco/runtime/tasks.mjs';
import {setRuntimeControl} from '../plugins/soloco/runtime/task-runtime-authority.mjs';
import {taskAssignmentContext,taskDefinitionBinding} from '../plugins/soloco/runtime/task-context.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-spec-invariants-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
function fixture(){
  const a={root:fs.mkdtempSync(path.join(base,'company-')),session_id:id('founder'),epoch:1,idea:'Fictional SPEC boundary checks'};
  engine.bind(a.root,a.session_id,'codex');engine.open(a,'codex');return a;
}
const read=a=>withStore(a.root,db=>db.read());
const dispatch=(a,args)=>engine.dispatch({...a,task:'Review supplied fictional evidence within preparation scope',...args},'codex',{
  check:()=>({available:true,authenticated:true,version:'fictional'}),launch:()=>Object.assign(new EventEmitter(),{unref(){}})
});
const response=(native_id,body)=>async(_host,_native,_prompt,_root,limit,_selection,options)=>{
  options.onSpawn(executionTiming(Date.now(),{timeout_ms:limit}));
  return {native_id,text:JSON.stringify({content:'Fictional findings',messages:[],notices:[],...body})};
};

for(const identity of ['producer','coordinator','distinct'])test(`ordinary review checks actual ${identity} native identity before publication`,async()=>{
  const a=fixture(),producer=dispatch(a,{role:'engineer'}),producerNative=id('native');
  await work(a.root,producer.id,response(producerNative,{}));
  const target=read(a).jobs[producer.id].artifact_id;
  const reviewer=dispatch(a,{role:'qa',review_of:target});
  const native=identity==='producer'?producerNative:identity==='coordinator'?a.session_id:id('review-native');
  await work(a.root,reviewer.id,response(native,{review:{verdict:'Pass',reason:'Fictional exact criteria checked'}}));
  const s=read(a),job=s.jobs[reviewer.id];
  assert.notEqual(job.instance_id,s.jobs[producer.id].instance_id);
  if(identity==='distinct'){
    assert.equal(job.status,'completed',job.error);assert.equal(s.records[job.artifact_id].review.verdict,'Pass');
  }else{
    assert.equal(job.status,'failed');assert.match(job.error,/independent native identity/);
    assert.equal(job.artifact_id,undefined);assert.equal(job.native_id,native);
    assert.match(job.rejected_output.text,/Fictional exact criteria checked/);
    assert.ok(s.notices.some(n=>n.reference===job.id));
  }
});

test('CoS-authored work cannot be reviewed by the same native session',async()=>{
  const a=fixture(),target=engine.save({...a,kind:'plan',content:'Fictional CoS proposal'},'codex');
  const reviewer=dispatch(a,{role:'qa',review_of:target.id});
  await work(a.root,reviewer.id,response(a.session_id,{review:{verdict:'Pass',reason:'Self-assessment cannot be independent'}}));
  assert.equal(read(a).jobs[reviewer.id].status,'failed');
});

for(const normalized of [false,true])test(`notice authorship and immutable dispositions survive replay and handover (${normalized?'normalized':'legacy'} storage)`,()=>{
  const a=fixture();if(normalized)withStore(a.root,db=>db.migrate());
  const n=engine.notify({...a,kind:'decision_required',summary:'Fictional launch remains blocked'},'codex');
  assert.equal(n.author_instance,a.session_id);assert.equal(n.author_role,'runner');assert.equal(n.author_epoch,1);
  const resolution={...a,notice_id:n.id,seen:true,resolution:'Keep launch blocked pending evidence',source_reference:'Fictional founder instruction 1'};
  engine.acknowledge(resolution,'codex');const original=read(a).notices.find(v=>v.id===n.id);
  assert.equal(original.resolution.recorded_by,a.session_id);
  engine.acknowledge(resolution,'codex');assert.deepEqual(read(a).notices.find(v=>v.id===n.id),original);
  assert.throws(()=>engine.acknowledge({...resolution,resolution:'Launch immediately'},'codex'),/resolution is immutable/);
  assert.throws(()=>engine.acknowledge({...resolution,source_reference:'different instruction'},'codex'),/resolution is immutable/);
  assert.deepEqual(read(a).notices.find(v=>v.id===n.id),original);
  // A correction preserves the original and becomes new unresolved evidence.
  const correction=engine.notify({...a,kind:'must_know',summary:'Fictional correction: evidence is still missing',reference:n.id},'codex');
  assert.equal(correction.resolution,null);assert.equal(correction.reference,n.id);
  if(!normalized)withStore(a.root,db=>db.migrate());
  const successor={...a,session_id:id('successor')};engine.bind(a.root,successor.session_id,'codex');
  engine.control({...successor,action:'handover',expected_epoch:1,source_instruction:'Fictional checked replacement; retain unresolved launch restrictions'},'codex');
  const after=read(a);assert.equal(after.paused,true);
  assert.deepEqual(after.notices.find(v=>v.id===n.id),original);
  assert.equal(after.notices.find(v=>v.id===correction.id).resolution,null);
  assert.throws(()=>engine.acknowledge({...resolution,session_id:successor.session_id,epoch:2,resolution:'Erase prior decision'},'codex'),/resolution is immutable/);
});

test('a specialist notice retains its actual author and native identity',async()=>{
  const a=fixture(),job=dispatch(a,{role:'research'}),native=id('native');
  await work(a.root,job.id,response(native,{notices:[{kind:'must_know',summary:'Fictional evidence contradicts the proposal'}]}));
  const n=read(a).notices.find(v=>v.summary==='Fictional evidence contradicts the proposal');
  assert.equal(n.author_role,'research');assert.equal(n.author_instance,job.instance_id);
  assert.equal(n.native_id,native);assert.equal(n.job_id,job.id);assert.equal(n.resolution,null);
});

for(const blockers of [['Unmet mandatory condition'],'not an array',null])test(`ordinary Pass rejects explicit blockers ${JSON.stringify(blockers)}`,async()=>{
  const a=fixture(),target=engine.save({...a,kind:'plan',content:'Fictional proposal'},'codex');
  const reviewer=dispatch(a,{role:'qa',review_of:target.id});
  await work(a.root,reviewer.id,response(id('review-native'),{review:{verdict:'Pass',reason:'Contradictory evidence',blockers}}));
  const job=read(a).jobs[reviewer.id];assert.equal(job.status,'failed');
  assert.match(job.error,/Pass cannot contain/);assert.match(job.rejected_output.text,/Contradictory evidence/);
});

for(const format of [1,3,5,7])test(`resolved notice conditions remain in format ${format} context and stale an in-flight assignment`,()=>{
  const a=fixture(),n=engine.notify({...a,kind:'must_know',summary:'Do not export personal data'},'codex');
  let job={id:'fictional-assignment',role:'engineer',task:'Inspect fictional evidence',inputs:[],review_of:null,context_format:format};
  if(format===7){
    withStore(a.root,db=>db.migrate());
    const source_instruction='One fictional read-only task; no external effects';
    withStore(a.root,db=>db.transaction('fixture.runtime',s=>{
      setRuntimeControl(s,{...a,action:'start',source_instruction},'codex');
      const record=submitTask(s,{...a,operation_id:'fixture-task',source_instruction,spec:{role:'engineer',task:job.task,acceptance:'Preserve all conditions',expected_deliverable:'Fictional findings',context_scope:'fixture'}},'codex');
      job={...job,epoch:1,context_scope:'fixture',runtime_task:{version:1,...taskDefinitionBinding(record)}};return s;
    }));
  }
  const before=assignmentContext(read(a),job);
  engine.acknowledge({...a,notice_id:n.id,resolution:'Resolved for planning only; never export personal data',source_reference:'Fictional founder disposition'},'codex');
  const s=read(a),after=assignmentContext(s,job),packet=JSON.parse(after.text);
  assert.match(after.text,/Resolved for planning only; never export personal data/);
  assert.equal(packet.notices.find(v=>v.id===n.id).summary,'Do not export personal data');
  assert.equal(contextMatches(s,job,before.hash),false);
  engine.acknowledge({...a,notice_id:n.id,seen:true},'codex');
  assert.equal(assignmentContext(read(a),job).hash,after.hash,'delivery bookkeeping is not a new constraint');
});
