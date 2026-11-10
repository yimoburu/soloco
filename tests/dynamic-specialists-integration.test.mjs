import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call as publicCall} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest} from '../plugins/soloco/runtime/store.mjs';
import {reference} from '../plugins/soloco/runtime/specialists.mjs';
import {assignmentContext,contextMatches} from '../plugins/soloco/runtime/context.mjs';
import {taskAssignmentContext,taskContextMatches} from '../plugins/soloco/runtime/task-context.mjs';
import {setRuntimeControl} from '../plugins/soloco/runtime/task-runtime-authority.mjs';
import {submitTask,taskDefinitionHash} from '../plugins/soloco/runtime/tasks.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {sessionTitle} from '../plugins/soloco/runtime/session-naming.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';
import {operatingContext} from '../plugins/soloco/runtime/operating-state.mjs';
import {resolveSnapshot} from '../plugins/soloco/runtime/snapshot.mjs';

// Only the engine, store, worker, context and validation paths are real. Native
// outputs and judgments below are explicit injected fixtures, never models or
// evidence of specialist competence, host qualification or company adoption.
const launch={check:()=>({available:true,authenticated:true,version:'fictional-specialist-adapter'}),launch:()=>({on(){return this;},unref(){}})};
const instruction='Founder authorizes only this bounded fictional preparation; no execution, spending, publication or new tools.';
const future=(milliseconds=86400000)=>new Date(Date.now()+milliseconds).toISOString();

async function fixture(host,fn){
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-dynamic-specialist-integration-')));
  const previous=process.env.COMPANY_PLUGIN_DATA;
  process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
  const args={root:path.join(base,'company'),session_id:'fictional-founder',epoch:1};
  fs.mkdirSync(args.root);
  const f={args,host,sequence:0,read:()=>withStore(args.root,db=>db.read())};
  f.change=change=>withStore(args.root,db=>{let result;db.transaction('fictional.dynamic-specialist.integration',s=>{result=change(s);return s;});return result;});
  f.action=(action,extra={})=>engine.specialists({...args,action,...(action==='inspect'?{}:{source_instruction:instruction,operation_id:'fictional-specialist-'+(++f.sequence)}),...extra},host);
  try{
    engine.bind(args.root,args.session_id,host);engine.open({...args,idea:'Fictional temporary expertise integration'},host);
    withStore(args.root,db=>db.migrate());
    engine.save({...args,id:'domain-input',kind:'artifact',content:'Fictional SQLite observation: unresolved writer contention; no measured throughput.'},host);
    await fn(f);
  }finally{
    if(previous===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=previous;
    fs.rmSync(base,{recursive:true,force:true});
  }
}
function authorize(f,overrides={}){
  const receipt=f.action('authorize',{policy:{base_roles:['engineer','qa'],input_ids:['domain-input'],scope:'*',expires_at:future(),max_profiles:10,max_assignments:10,...overrides}});
  return f.read().records[receipt.id];
}
function create(f,policy,{name='SQLite Contention Specialist',...overrides}={}){
  const definition={base_role:'engineer',charter:{name,mission:'Assess the supplied SQLite contention evidence.',inputs:'Only exact supplied observations.',outputs:'One bounded evidence-linked assessment.',block:'Missing source data or unsupported execution.',success:'Distinguish observation from uncertainty.',failure:'Invent throughput or waive unresolved failures.',phase:'Only this concrete preparation gap.'},task:'Assess fictional SQLite contention without executing anything.',acceptance:'Keep the unresolved contention and unmeasured throughput explicit.',input_ids:['domain-input'],expires_at:future(3600000),max_assignments:3,...overrides};
  const receipt=f.action('create',{policy_ref:reference(policy),definition});
  return {record:f.read().records[receipt.id],definition};
}
function queue(f,profile,extra={}){
  return engine.dispatch({...f.args,role:profile.definition.base_role,task:profile.definition.task,input_ids:profile.definition.input_ids,specialist_ref:reference(profile.record),...extra},f.host,launch);
}
async function finish(f,queued,{native_id='fictional-native-'+queued.id,content='FICTIONAL observed contention remains unresolved; throughput is unknown.',review,invoke}={}){
  await work(f.args.root,queued.id,async(host,native,prompt,directory,timeout,selection,options)=>{
    options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
    await invoke?.({host,native,prompt,directory,timeout,selection,options});
    return {native_id,text:JSON.stringify({content,messages:[],notices:[],...(review?{review}:{})})};
  });
  return f.read().jobs[queued.id];
}
function exactInputs(f,job,ids){
  const state=f.read();
  for(const id of ids)assert(job.inputs.some(input=>input.id===id&&input.revision===state.records[id].revision),'missing exact input '+id);
}

for(const host of ['codex','claude'])test(`${host}: temporary expertise reaches the native prompt, exact context and visible session title without changing the pinned team`,()=>fixture(host,async f=>{
  const original=f.read(),policy=authorize(f),profile=create(f,policy),queued=queue(f,profile);
  const before=f.read(),job=before.jobs[queued.id],context=assignmentContext(before,job);
  assert.equal(job.role,'engineer');
  assert.deepEqual(job.specialist,{version:1,profile:reference(profile.record),policy:reference(policy)});
  exactInputs(f,job,['domain-input',policy.id,profile.record.id]);
  for(const value of [profile.definition.charter.name,profile.definition.charter.failure,profile.definition.acceptance,instruction,'unresolved writer contention'])assert(context.text.includes(value),value);
  assert(context.text.includes(before.roles.engineer.mission),'base charter remains present');
  const completed=await finish(f,queued,{invoke:({host:actualHost,native,prompt,options})=>{
    assert.equal(actualHost,host);assert.equal(native,null);assert(prompt.includes(profile.definition.charter.name));
    assert.equal(options.sessionTitle,sessionTitle(profile.definition.charter.name,queued.instance_id));
    assert.match(prompt,/Do not call tools|Do not invoke tools/);
  }});
  assert.equal(completed.status,'completed',completed.error);
  assert.equal(f.read().records[completed.artifact_id].author_role,'engineer');
  const final=f.read();
  for(const key of ['roles','team_sha256','governance','governance_sha256','cos_instructions'])assert.deepEqual(final[key],original[key],key);
}));

for(const mode of ['ordinary','durable'])for(const supplied of ['omitted','empty'])test(`${mode}/${supplied}: every frozen profile data source remains mandatory`,()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy);let queued;
  const inputArgs=supplied==='empty'?{input_ids:[]}:{};
  if(mode==='durable'){
    f.change(s=>setRuntimeControl(s,{...f.args,action:'start',source_instruction:instruction},f.host));
    const task=f.change(s=>submitTask(s,{...f.args,operation_id:'mandatory-profile-inputs',source_instruction:instruction,spec:{role:'engineer',task:profile.definition.task,acceptance:profile.definition.acceptance,expected_deliverable:'Exact supplied-source assessment.',specialist_ref:reference(profile.record),...inputArgs}},f.host));
    assert(task.runtime_task.spec.input_ids.includes('domain-input'),'canonical task definition retains mandatory profile data');
    assert(task.runtime_task.input_bindings.some(input=>input.id==='domain-input'),'submission freezes its exact data reference');
    const admitted=engine.queueRuntimeTask(f.args.root,task.id,launch);queued=f.read().jobs[admitted.job_id];
  }else queued=engine.dispatch({...f.args,role:profile.definition.base_role,task:profile.definition.task,specialist_ref:reference(profile.record),...inputArgs},f.host,launch);
  const state=f.read(),job=state.jobs[queued.id],context=assignmentContext(state,job);
  exactInputs(f,job,['domain-input',policy.id,profile.record.id]);
  assert(context.text.includes(state.records['domain-input'].content),'native context contains the complete frozen data body, beyond its hash');
  const completed=await finish(f,queued);
  assert.equal(completed.status,'completed',completed.error);
}));

test('the complete 100-source caller bound still permits the two mandatory trusted profile records',()=>fixture('codex',async f=>{
  const ids=['domain-input',...Array.from({length:99},(_,index)=>'bounded-source-'+index)];
  f.change(s=>{
    for(const id of ids.slice(1))s.records[id]={id,kind:'artifact',content:'FICTIONAL bounded source '+id,author_role:'runner',author_instance:s.owner.session_id,revision:1,status:'Draft'};
  });
  const policy=authorize(f,{input_ids:ids}),profile=create(f,policy,{input_ids:ids}),queued=queue(f,profile);
  const canonical=[...ids,policy.id,profile.record.id],job=f.read().jobs[queued.id];
  assert.equal(job.inputs.length,102);exactInputs(f,job,canonical);
  const context=assignmentContext(f.read(),job);
  assert(context.text.includes(f.read().records[ids.at(-1)].content));
  f.change(s=>setRuntimeControl(s,{...f.args,action:'start',source_instruction:instruction},f.host));
  const task=f.change(s=>submitTask(s,{...f.args,operation_id:'hundred-source-profile',source_instruction:instruction,spec:{role:'engineer',task:profile.definition.task,acceptance:profile.definition.acceptance,expected_deliverable:'Complete bounded-source assessment.',input_ids:ids,specialist_ref:reference(profile.record)}},f.host));
  assert.equal(task.runtime_task.spec.input_ids.length,102);
  assert.equal(task.runtime_task.input_bindings.length,102);
  assert.deepEqual(new Set(task.runtime_task.spec.input_ids),new Set(canonical));
}));

test('ordinary role sessions resume while distinct profiles never inherit ordinary or other-specialty sessions',()=>fixture('codex',async f=>{
  const ordinary=engine.dispatch({...f.args,role:'engineer',task:'Ordinary fictional preparation.'},f.host,launch);
  await finish(f,ordinary,{native_id:'fictional-ordinary-native'});
  const policy=authorize(f),one=create(f,policy),first=queue(f,one);
  assert.equal(first.native_id,null);assert.notEqual(first.instance_id,ordinary.instance_id);assert.notEqual(first.session_key,ordinary.session_key);
  await finish(f,first,{native_id:'fictional-specialist-one'});
  const two=create(f,policy,{name:'SQLite Durability Specialist'}),second=queue(f,two);
  assert.equal(second.native_id,null);assert.notEqual(second.instance_id,first.instance_id);assert.notEqual(second.session_key,first.session_key);
  await finish(f,second,{native_id:'fictional-specialist-two'});
  const resumed=engine.dispatch({...f.args,role:'engineer',task:'Ordinary fictional preparation continues.'},f.host,launch);
  assert.equal(resumed.instance_id,ordinary.instance_id);assert.equal(resumed.native_id,'fictional-ordinary-native');
  assert.equal(f.read().jobs[resumed.id].specialist,undefined);
  const packet=JSON.parse(assignmentContext(f.read(),f.read().jobs[resumed.id]).text);
  assert.equal(packet.specialist,undefined);
  assert.equal(packet.assignment.specialist,undefined);
}));

test('failed and queued attempts consume the original policy allowance, with no reset from failure',()=>fixture('codex',async f=>{
  const policy=authorize(f,{max_profiles:2,max_assignments:1}),one=create(f,policy,{max_assignments:1}),queued=queue(f,one);
  await work(f.args.root,queued.id,async()=>{throw Object.assign(Error('FICTIONAL missing evidence; no retry'),{termination_confirmed:true});});
  assert.equal(f.read().jobs[queued.id].status,'failed');
  assert.throws(()=>queue(f,one),/limit|allowance|assignment|capacity/i);
  const two=create(f,policy,{name:'Second bounded specialty',max_assignments:1});
  assert.throws(()=>queue(f,two),/limit|allowance|assignment|capacity/i);
  assert.equal(Object.keys(f.read().jobs).length,1);
  assert.throws(()=>create(f,policy,{name:'Third forbidden profile',max_assignments:1}),/limit|profile|capacity/i);
  const inspected=f.action('inspect');assert(JSON.stringify(inspected).includes(policy.id));
  assert.equal(inspected.observed.assignments,1);assert.equal(inspected.observed.failed,1);assert.equal(inspected.observed.completed,0);
}));

test('one bounded assignment may retain its existing exact supplemental-read continuation without renewing its allowance',()=>fixture('codex',async f=>{
  const policy=authorize(f,{max_assignments:1}),profile=create(f,policy,{max_assignments:1});
  const queued=queue(f,profile,{evidence_ids:['domain-input']}),source=f.read().records['domain-input'];
  let calls=0;
  await work(f.args.root,queued.id,async(_host,native,_prompt,_directory,timeout,_selection,options)=>{
    calls++;
    if(calls===1){
      assert.equal(native,null);options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
      return {native_id:'fictional-profile-retrieval',text:JSON.stringify({reads:[{id:source.id,sha256:reference(source).sha256,offset:0,length:JSON.stringify(source).length}]})};
    }
    assert.equal(native,'fictional-profile-retrieval');
    return {native_id:'fictional-profile-retrieval',text:JSON.stringify({content:'FICTIONAL exact supplemental source read; contention remains unresolved.',messages:[],notices:[]})};
  });
  const state=f.read(),completed=state.jobs[queued.id];
  assert.equal(completed.status,'completed',completed.error);assert.equal(calls,2);
  assert.equal(completed.retrieved_inputs[0].sha256,reference(source).sha256);
  assert.equal(Object.keys(state.jobs).length,1);assert.equal(f.action('inspect').observed.assignments,1);
  assert.throws(()=>queue(f,profile),/allowance|assignment|exhaust/i);
}));

test('specialization cannot change the base role, assignment objective, permitted data or scoped execution path',()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy);
  engine.save({...f.args,id:'outside-policy',kind:'artifact',content:'An existing source outside this creation policy.'},f.host);
  for(const extra of [{role:'qa'},{task:'A different standing objective.'},{input_ids:['domain-input','outside-policy']},{evidence_ids:['outside-policy']},{prototype_id:'absent-prototype'},{development_id:'absent-development'}]){
    assert.throws(()=>queue(f,profile,extra));
    assert.equal(Object.keys(f.read().jobs).length,0,JSON.stringify(extra));
  }
}));

test('completed dependency output cannot smuggle data beyond the profile frozen input set',()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy);
  const producer=await finish(f,engine.dispatch({...f.args,role:'research',task:'Prepare a separate fictional source outside the specialization policy.'},f.host,launch),{content:'OUTSIDE-PROFILE-INPUT: independent producer data was never granted to this profile.'});
  assert.equal(producer.status,'completed',producer.error);
  const before=f.read();
  assert(!profile.definition.input_ids.includes(producer.artifact_id));
  assert.throws(()=>queue(f,profile,{depends_on:[producer.id]}),/input|policy|specialist|data|allowed|bound/i);
  assert.deepEqual(f.read(),before,'failed dependency admission reserves no job, session, allowance or execution slot');
}));

test('durable dependency readiness cannot widen the specialization frozen input set',()=>fixture('codex',async f=>{
  f.change(s=>setRuntimeControl(s,{...f.args,action:'start',source_instruction:instruction},f.host));
  const policy=authorize(f),profile=create(f,policy);
  const sourceTask=f.change(s=>submitTask(s,{...f.args,operation_id:'outside-producer',source_instruction:instruction,spec:{role:'research',task:'Prepare a separate fictional source.',acceptance:'Attributable supplied evidence.',expected_deliverable:'Outside source.'}},f.host));
  const sourceAdmission=engine.queueRuntimeTask(f.args.root,sourceTask.id,launch);
  const producer=await finish(f,f.read().jobs[sourceAdmission.job_id],{content:'OUTSIDE-PROFILE-INPUT: this separate task output is not an allowed data source.'});
  assert.equal(producer.status,'completed',producer.error);
  const jobsBefore=Object.keys(f.read().jobs);
  let submitted;
  try{
    submitted=f.change(s=>submitTask(s,{...f.args,operation_id:'smuggled-dependency',source_instruction:instruction,spec:{role:'engineer',task:profile.definition.task,acceptance:profile.definition.acceptance,expected_deliverable:'Bounded assessment.',input_ids:['domain-input'],specialist_ref:reference(profile.record),depends_on:[{task_id:sourceTask.id,gate:'output'}]}},f.host));
  }catch(error){assert.match(error.message,/input|policy|specialist|data|allowed|bound/i);}
  if(submitted)assert.throws(()=>engine.queueRuntimeTask(f.args.root,submitted.id,launch),/input|policy|specialist|data|allowed|bound|context|changed/i);
  assert.deepEqual(Object.keys(f.read().jobs),jobsBefore,'a dependency edge is not permission to admit its output as profile data');
}));

test('generic saves cannot overwrite protected definitions or mint their reserved identity namespace',()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy),before=f.read();
  for(const record of [policy,profile.record]){
    assert.throws(()=>engine.save({...f.args,id:record.id,expected_revision:record.revision,kind:'artifact',content:'Attempted canonical specialist overwrite.'},f.host),/specialist|protected|immutable|reserved/i);
    assert.throws(()=>engine.save({...f.args,id:'specialist-'+'f'.repeat(32),kind:'artifact',content:'Attempted reserved specialist identity.'},f.host),/specialist|protected|immutable|reserved/i);
  }
  assert.deepEqual(f.read().records[policy.id],before.records[policy.id]);
  assert.deepEqual(f.read().records[profile.record.id],before.records[profile.record.id]);
}));

test('ordinary legacy specialist-prefixed prose remains writable and cannot become a profile',()=>fixture('codex',async f=>{
  engine.save({...f.args,id:'specialist-report',kind:'artifact',content:'Legacy specialist research prose.'},f.host);
  const original=f.read().records['specialist-report'];
  engine.save({...f.args,id:original.id,expected_revision:original.revision,kind:'artifact',content:'Amended legacy specialist prose.'},f.host);
  const amended=f.read().records[original.id];
  assert.equal(amended.revision,original.revision+1);
  assert.equal(amended.content,'Amended legacy specialist prose.');
  assert.equal(amended.specialist,undefined);
  assert.throws(()=>engine.dispatch({...f.args,role:'engineer',task:'Treat ordinary prose as authority.',specialist_ref:reference(amended)},f.host,launch),/specialist|profile|canonical|invalid/i);
  assert.equal(Object.keys(f.read().jobs).length,0);
}));

for(const target of ['profile','policy'])test(`${target} revocation during a native invocation retains the result as quarantined evidence`,()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy),queued=queue(f,profile);
  const completed=await finish(f,queued,{invoke:()=>f.action('revoke',{target_ref:reference(target==='profile'?profile.record:policy)})});
  assert.equal(completed.status,'quarantined',completed.error);
  assert.equal(f.read().records[completed.artifact_id].status,'Quarantined');
  assert.equal(completed.coordination_release.termination_confirmed,true);
  assert.throws(()=>queue(f,profile),/revok|inactive|held/i);
}));

test('actual expiry during a native invocation quarantines output without erasing the definition',()=>fixture('codex',async f=>{
  const policy=authorize(f),expires_at=future(5000),profile=create(f,policy,{expires_at}),queued=queue(f,profile);
  const completed=await finish(f,queued,{invoke:async()=>{
    await new Promise(resolve=>setTimeout(resolve,Math.max(1,Date.parse(expires_at)-Date.now()+30)));
  }});
  assert.equal(completed.status,'quarantined',completed.error);
  assert.equal(f.read().records[completed.artifact_id].status,'Quarantined');
  assert.deepEqual(f.read().records[profile.record.id],profile.record);
  assert.throws(()=>queue(f,profile),/expir|inactive|held/i);
}));

for(const mode of ['ordinary','durable'])test(`${mode}: final publication fence catches expiry introduced after the earlier eligibility check`,()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy,{expires_at:future(60000)});
  let queued,task;
  if(mode==='durable'){
    f.change(s=>setRuntimeControl(s,{...f.args,action:'start',source_instruction:instruction},f.host));
    task=f.change(s=>submitTask(s,{...f.args,operation_id:'late-expiry',source_instruction:instruction,spec:{role:'engineer',task:profile.definition.task,acceptance:profile.definition.acceptance,expected_deliverable:'Exact fictional late-expiry finding.',input_ids:['domain-input'],specialist_ref:reference(profile.record)}},f.host));
    const admitted=engine.queueRuntimeTask(f.args.root,task.id,launch);queued=f.read().jobs[admitted.job_id];
  }else queued=queue(f,profile);
  const originalNow=Date.now;let observedCut=false;
  try{
    await work(f.args.root,queued.id,async(_host,_native,_prompt,_directory,timeout,_selection,options)=>{
      options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
      return {native_id:'fictional-late-publication-'+queued.id,text:JSON.stringify({content:'FICTIONAL result prepared before final expiry cut.',messages:[],notices:[]}),get model_evidence(){
        observedCut=true;Date.now=()=>Date.parse(profile.definition.expires_at)+1;
        return {source:'fictional-late-expiry-getter',verification:'unverified'};
      }};
    });
  }finally{Date.now=originalNow;}
  const state=f.read(),completed=state.jobs[queued.id];
  assert.equal(observedCut,true,'the cut occurs while constructing final model evidence');
  assert.equal(completed.status,'quarantined',completed.error);
  assert.equal(completed.execution_failure.outcome,'specialist_eligibility_lost');
  assert.equal(state.records[completed.artifact_id].status,'Quarantined');
  assert.equal(completed.coordination_release.termination_confirmed,true);
  assert.equal(completed.instance_id,queued.instance_id);assert(completed.execution_started_at);
  assert.equal(Object.values(state.records).filter(record=>record.job_id===queued.id&&record.status==='Submitted').length,0);
  if(task)assert.equal(state.records[task.id].runtime_task.attempts[0].job_id,queued.id);
}));

for(const target of ['domain-input','profile'])test(`${target}: source tampering before invocation blocks the native call`,()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy),queued=queue(f,profile),job=f.read().jobs[queued.id],before=assignmentContext(f.read(),job);
  f.change(s=>{s.records[target==='profile'?profile.record.id:target].content+=' TAMPERED without a revision.';});
  assert.equal(contextMatches(f.read(),f.read().jobs[queued.id],before.hash),false);
  let invoked=false;
  await work(f.args.root,queued.id,async()=>{invoked=true;throw Error('Must never invoke after tampering');});
  const stopped=f.read().jobs[queued.id];assert.equal(invoked,false);assert.notEqual(stopped.status,'completed');assert.equal(stopped.artifact_id,undefined);
}));

test('source changes during invocation retain the original negative and block usable output',()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy),queued=queue(f,profile);
  const completed=await finish(f,queued,{content:'FICTIONAL failure: evidence remains insufficient.',invoke:()=>f.change(s=>{s.records['domain-input'].content+=' A new unresolved restriction.';})});
  assert.equal(completed.status,'quarantined',completed.error);
  assert.match(f.read().records[completed.artifact_id].content,/failure.*insufficient/);
}));

async function independentReview(f,profile,output,{verdict='Pass',native_id='fictional-independent-qa',permitted_action=verdict==='Pass'?'accept_specialist_output':'hold'}={}){
  const queued=engine.dispatch({...f.args,role:'qa',review_of:output.id,task:'Independently judge the exact temporary-specialist preparation result against its charter, source evidence and acceptance criteria.'},f.host,launch);
  const review={verdict,reason:'FICTIONAL exact-source judgment only; no competence or business-benefit claim.',permitted_action,blockers:verdict==='Pass'?[]:['The fictional observation cannot establish throughput.']};
  const completed=await finish(f,queued,{native_id,review});
  return {job:completed,record:f.read().records[completed.artifact_id]};
}

for(const verdict of ['Pass','Fail','Blocked'])test(`${verdict}: assessments require actual independently attributed output review and retain the exact judgment`,()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy);
  assert.throws(()=>f.action('assess',{profile_ref:reference(profile.record),output_ref:reference(f.read().records['domain-input']),review_ref:reference(f.read().records['domain-input'])}),/output|review|native|producer|assessment|held/i);
  const producer=await finish(f,queue(f,profile),{native_id:'fictional-profile-producer'});
  assert.equal(producer.status,'completed',producer.error);
  const output=f.read().records[producer.artifact_id],qa=await independentReview(f,profile,output,{verdict});
  assert.equal(qa.job.status,'completed',qa.job.error);assert.notEqual(qa.job.native_id,producer.native_id);
  const outputBefore=structuredClone(output),reviewBefore=structuredClone(qa.record);
  const receipt=f.action('assess',{profile_ref:reference(profile.record),output_ref:reference(output),review_ref:reference(qa.record)});
  const assessment=f.read().records[receipt.id];
  assert(assessment,'assessment is a retained canonical record');
  assert.equal(assessment.specialist.disposition,{Pass:'accepted_preparation',Fail:'rejected',Blocked:'held'}[verdict]);
  assert.deepEqual(assessment.specialist.output,reference(output));assert.deepEqual(assessment.specialist.review,reference(qa.record));
  assert.deepEqual(f.read().records[output.id],outputBefore);
  assert.deepEqual(f.read().records[qa.record.id],reviewBefore);
  assert.equal(f.read().records[qa.record.id].review.verdict,verdict);
  if(verdict!=='Pass'){
    const later=await independentReview(f,profile,output);
    assert.equal(later.job.status,'completed',later.job.error);
    assert.throws(()=>f.action('assess',{profile_ref:reference(profile.record),output_ref:reference(output),review_ref:reference(later.record)}),/negative|unresolved|held/i,'a later Pass cannot erase the earlier negative judgment');
    assert.deepEqual(f.read().records[qa.record.id],reviewBefore);
    assert.deepEqual(f.read().records[assessment.id],assessment);
  }
}));

test('a shared native identity or a Pass missing explicit acceptance cannot establish specialist acceptance',()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy),producer=await finish(f,queue(f,profile),{native_id:'fictional-shared-native'});
  const output=f.read().records[producer.artifact_id],reused=await independentReview(f,profile,output,{native_id:producer.native_id});
  assert.notEqual(reused.job.status,'completed');assert.equal(reused.record,undefined);
  const qa=await independentReview(f,profile,output,{native_id:'fictional-distinct-qa',permitted_action:'publish_everything'});
  assert.equal(qa.job.status,'completed',qa.job.error);
  assert.throws(()=>f.action('assess',{profile_ref:reference(profile.record),output_ref:reference(output),review_ref:reference(qa.record)}),/accept_specialist_output|permitted|action|acceptance|held/i);
}));

test('an observed exact-subject negative in a rejected native QA envelope cannot be waived by a later Pass',()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy),producer=await finish(f,queue(f,profile));
  const output=f.read().records[producer.artifact_id];
  const rejected=engine.dispatch({...f.args,role:'qa',review_of:output.id,task:'Independently review the exact profile output; preserve every negative finding.'},f.host,launch);
  const raw=JSON.stringify({content:'FICTIONAL original negative: the claimed throughput has no measured source.',review:{verdict:'Fail',reason:'UNRESOLVED-ORIGINAL-NEGATIVE: measured throughput is missing.',permitted_action:'hold',blockers:['No measured throughput source.']},messages:[{to:'not-a-real-role',content:'A separate routing typo must not erase this negative judgment.'}],notices:[]});
  await work(f.args.root,rejected.id,async(_host,_native,_prompt,_directory,timeout,_selection,options)=>{
    options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
    return {native_id:'fictional-rejected-negative-qa',text:raw};
  });
  const failed=f.read().jobs[rejected.id];
  assert.equal(failed.status,'failed');assert.equal(failed.artifact_id,undefined);
  assert.match(failed.rejected_output.text,/UNRESOLVED-ORIGINAL-NEGATIVE/);
  const before=structuredClone(failed.rejected_output),later=await independentReview(f,profile,output,{native_id:'fictional-later-independent-qa'});
  assert.equal(later.job.status,'completed',later.job.error);
  assert.throws(()=>f.action('assess',{profile_ref:reference(profile.record),output_ref:reference(output),review_ref:reference(later.record)}),/negative|unresolved|held/i);
  assert.deepEqual(f.read().jobs[rejected.id].rejected_output,before);
}));

for(const oversized of [false,true])test(`unreadable ${oversized?'oversized':'inline'} profile QA wire remains evidence and holds a later Pass`,()=>fixture('codex',async f=>{
  const policy=authorize(f),profile=create(f,policy),producer=await finish(f,queue(f,profile));
  const output=f.read().records[producer.artifact_id];
  const rejected=engine.dispatch({...f.args,role:'qa',review_of:output.id,task:'Review the exact specialist output; malformed wire must remain inspectable.'},f.host,launch);
  const raw='{"content":"'+(oversized?'x'.repeat(110000):'Incomplete native wire')+'","review":{"verdict":"Fail","reason":"UNREADABLE-NEGATIVE-TAIL';
  await work(f.args.root,rejected.id,async(_host,_native,_prompt,_directory,timeout,_selection,options)=>{
    options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
    return {native_id:'fictional-unreadable-profile-qa',text:raw};
  });
  const failed=f.read().jobs[rejected.id];
  assert.equal(failed.status,'failed');assert.equal(failed.artifact_id,undefined);
  assert(failed.rejected_output,'even a pre-parse failure retains observed wire');
  assert.equal(failed.rejected_output.truncated,oversized);
  assert.equal(oversized?resolveSnapshot(f.read(),failed.rejected_output.original):failed.rejected_output.text,raw);
  const before=structuredClone(failed.rejected_output),later=await independentReview(f,profile,output,{native_id:'fictional-later-readable-profile-qa'});
  assert.equal(later.job.status,'completed',later.job.error);
  assert.throws(()=>f.action('assess',{profile_ref:reference(profile.record),output_ref:reference(output),review_ref:reference(later.record)}),/negative|uninspectable|unresolved|held/i);
  assert.deepEqual(f.read().jobs[rejected.id].rejected_output,before);
}));

test('expiry fences future assignment while a valid completed result remains independently reviewable',()=>fixture('codex',async f=>{
  const policy=authorize(f),expires_at=future(5000),profile=create(f,policy,{expires_at}),producer=await finish(f,queue(f,profile));
  assert.equal(producer.status,'completed',producer.error);
  const output=f.read().records[producer.artifact_id],source=reference(output),contextHash=producer.context_sha256;
  await new Promise(resolve=>setTimeout(resolve,Math.max(1,Date.parse(expires_at)-Date.now()+30)));
  assert.equal(contextMatches(f.read(),f.read().jobs[producer.id],contextHash),true,'wall-clock expiry does not rewrite delivered history');
  assert.throws(()=>queue(f,profile),/expir|inactive|held/i);
  const qa=await independentReview(f,profile,output);
  assert.equal(qa.job.status,'completed',qa.job.error);
  const assessment=f.action('assess',{profile_ref:reference(profile.record),output_ref:source,review_ref:reference(qa.record)});
  assert(f.read().records[assessment.id]);assert.deepEqual(reference(f.read().records[output.id]),source);
}));

for(const host of ['codex','claude'])test(`${host}: durable task definition, admission and packet bind the exact specialization`,()=>fixture(host,async f=>{
  const policy=authorize(f),profile=create(f,policy);
  f.change(s=>setRuntimeControl(s,{...f.args,action:'start',source_instruction:instruction},host));
  const task=f.change(s=>submitTask(s,{...f.args,operation_id:'durable-profile',source_instruction:instruction,spec:{role:'engineer',task:profile.definition.task,acceptance:profile.definition.acceptance,expected_deliverable:'One source-linked contention assessment.',input_ids:['domain-input'],specialist_ref:reference(profile.record)}},host));
  const stored=f.read().records[task.id];
  assert.deepEqual(stored.runtime_task.spec.specialist_ref,reference(profile.record));
  assert.equal(stored.runtime_task.definition_sha256,taskDefinitionHash(stored.runtime_task.spec));
  const admitted=engine.queueRuntimeTask(f.args.root,task.id,launch),job=f.read().jobs[admitted.job_id];
  assert.equal(job.context_format,7);assert.equal(job.native_id,null);
  assert.deepEqual(job.specialist,{version:1,profile:reference(profile.record),policy:reference(policy)});
  exactInputs(f,job,['domain-input',policy.id,profile.record.id]);
  const context=taskAssignmentContext(f.read(),job),packet=JSON.parse(context.text);
  assert.deepEqual(packet.task.spec.specialist_ref,reference(profile.record));
  assert(context.text.includes(profile.definition.charter.name));assert(context.context_bytes<=context.context_budget_bytes);
  assert.equal(taskContextMatches(f.read(),job,context.hash),true);
  const completed=await finish(f,job,{invoke:({prompt,options})=>{
    assert(prompt.includes(profile.definition.charter.failure));
    assert.equal(options.sessionTitle,sessionTitle(profile.definition.charter.name,job.instance_id));
  }});
  assert.equal(completed.status,'completed',completed.error);
  assert.equal(f.read().records[completed.artifact_id].runtime_output.definition_sha256,stored.runtime_task.definition_sha256);
}));

test('durable task tampering cannot swap an admitted specialization or evade its coherent context budget',()=>fixture('codex',async f=>{
  const policy=authorize(f),one=create(f,policy),two=create(f,policy,{name:'Different specialty'});
  f.change(s=>setRuntimeControl(s,{...f.args,action:'start',source_instruction:instruction},f.host));
  const task=f.change(s=>submitTask(s,{...f.args,operation_id:'durable-tamper',source_instruction:instruction,spec:{role:'engineer',task:one.definition.task,acceptance:one.definition.acceptance,expected_deliverable:'Bounded assessment.',input_ids:['domain-input'],specialist_ref:reference(one.record)}},f.host));
  const admitted=engine.queueRuntimeTask(f.args.root,task.id,launch),job=f.read().jobs[admitted.job_id],context=taskAssignmentContext(f.read(),job);
  assert.equal(context.context_bytes,Buffer.byteLength(context.text));
  assert.equal(taskAssignmentContext(f.read(),job,{budget:context.context_bytes}).text,context.text);
  assert.throws(()=>taskAssignmentContext(f.read(),job,{budget:context.context_bytes-1}),/context|capacity|budget|Held/i,'the complete specialization is counted; no body is silently trimmed to fit');
  f.change(s=>{s.jobs[job.id].specialist.profile=reference(two.record);});
  assert.equal(taskContextMatches(f.read(),f.read().jobs[job.id],context.hash),false);
  let invoked=false;await work(f.args.root,job.id,async()=>{invoked=true;throw Error('Must not invoke a substituted specialty');});
  assert.equal(invoked,false);assert.notEqual(f.read().jobs[job.id].status,'completed');
}));

const operating=(f,extra)=>publicCall('company_context',{...f.args,source_instruction:instruction,protocol:'operating-state-v1',...extra},f.host);
function home(f,id,content,evidence_ids=[id]){
  const prior=f.read().records[id];
  return engine.save({...f.args,id,...(prior?{expected_revision:prior.revision}:{}),kind:'artifact',content,operating_record:{version:1,kind:'obligation',scope:'*',owner:'runner',conditions:'Retain all supplied evidence, bounds, failures and uncertainty; preparation only.',exceptions:'No tool, spending, publication or retry authority is inferred.',clearing:'Only exact independent reconciliation can clear an unresolved condition.',expires_at:null,dependencies:[],authority_refs:[],evidence_refs:evidence_ids}},f.host);
}
async function publishOperating(f,{onPrompt}={}){
  const proposal=await operating(f,{action:'plan'});
  assert.deepEqual(proposal.frontier,[],'every initial semantic source must already have a current typed home');
  const queued=engine.dispatch({...f.args,role:'qa',review_of:proposal.id,task:'Independently review the complete fictional operating meaning, preservation, authority boundaries and interactions.'},f.host,launch);
  const context=assignmentContext(f.read(),f.read().jobs[queued.id]),evidence=context.operating_evidence;
  const ranges=evidence?Object.values(evidence.sources).flatMap(source=>{
    const result=[];
    for(let offset=0;offset<source.length;){
      let length=Math.min(16000,source.length-offset);
      if(/[\uD800-\uDBFF]/u.test(source.raw[offset+length-1]))length--;
      result.push({source_id:source.source_id,sha256:source.sha256,offset,length});offset+=length;
    }
    return result;
  }):[];
  let first=true;
  await work(f.args.root,queued.id,async(_host,_native,prompt,_directory,timeout,_selection,options)=>{
    onPrompt?.(prompt);
    if(first){options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));first=false;}
    const native_id='fictional-operating-contract-qa-'+proposal.id;
    if(ranges.length)return {native_id,text:JSON.stringify({reads:ranges.splice(0,4)})};
    return {native_id,text:JSON.stringify({content:'FICTIONAL CONTRACT DOUBLE: complete supplied operating meaning checked; no native competence qualification.',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional complete preservation, conditions and interaction judgment.',permitted_action:'publish_operating_state',plan_sha256:digest(JSON.stringify(f.read().records[proposal.id].operating_plan)),preservation_complete:true,interaction_complete:true,authority_checked:true,blockers:[]}})};
  });
  const completed=f.read().jobs[queued.id];assert.equal(completed.status,'completed',completed.error);
  const applied=await operating(f,{action:'apply',plan_id:proposal.id,review_id:completed.artifact_id});
  assert.equal(applied.published,true);return proposal;
}

test('operating format6 requires acceptance of new profile semantics and then binds the full specialization',()=>fixture('codex',async f=>{
  home(f,'domain-input',f.read().records['domain-input'].content);
  const initial=await publishOperating(f),checkpoint=f.read().operating_state.plan;
  assert.equal(checkpoint.id,initial.id);assert(operatingContext(f.read()));
  const policy=authorize(f),profile=create(f,policy);
  assert.throws(()=>operatingContext(f.read()),/DIRTY|unaccepted|Held/i,'profile and policy creation change current semantic meaning');
  assert.throws(()=>queue(f,profile),/DIRTY|unaccepted|Held/i);
  assert.equal(Object.values(f.read().jobs).filter(job=>job.specialist).length,0);
  home(f,'temporary-expertise-home','Preparation-only current meaning. Retain every exact profile/policy input, role, objective, acceptance criterion, expiry, revocation and assignment bound. A temporary charter is no competence certificate and grants no tools or business authority. Exact original policy: '+JSON.stringify(policy)+' Exact original profile: '+JSON.stringify(profile.record),[policy.id,profile.record.id]);
  let delivered=false;
  await publishOperating(f,{onPrompt:prompt=>{if(prompt.includes(profile.definition.charter.name)&&prompt.includes(policy.id))delivered=true;}});
  assert.equal(delivered,true,'the independent contract double actually received the new semantic bodies');
  assert(operatingContext(f.read()));
  const queued=queue(f,profile),job=f.read().jobs[queued.id],packet=JSON.parse(assignmentContext(f.read(),job).text);
  assert.equal(job.context_format,6);assert.equal(packet.protocol,'operating-assignment-v1');
  assert.deepEqual(packet.charter,f.read().roles.engineer);
  assert(JSON.stringify(packet.specialist).includes(profile.definition.charter.name));
  assert(JSON.stringify(packet.specialist).includes(profile.definition.charter.failure));
  exactInputs(f,job,['domain-input',policy.id,profile.record.id]);
  const completed=await finish(f,queued,{invoke:({prompt})=>assert(prompt.includes(profile.definition.charter.name))});
  assert.equal(completed.status,'completed',completed.error);
  assert.deepEqual(f.read().operating_state.plan,packet.checkpoint.acceptance[0]);
}));
