import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {withStore,id} from '../plugins/soloco/runtime/store.mjs';
import {freshHandoverReviewEligible} from '../plugins/soloco/runtime/handover.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {normalizeTimeout,normalizeHandoverReviewWindow,executionTiming,jobExecutionTiming,jobTimeoutState} from '../plugins/soloco/runtime/timeout.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-handover-window-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'data');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const reason='Fictional fresh bounded review, not extension of an earlier job';
const settings={timeout_policy_version:1,timeout_ms:600000,timeout_reason:'Fictional ten-minute native invocation',handover_review_window_minutes:45,handover_review_reason:reason};

test('separate review window retains native cap and validates narrow explicit settings',()=>{
 assert.equal(normalizeHandoverReviewWindow({}),null);
 for(const minutes of [30,45])assert.equal(normalizeHandoverReviewWindow({handover_review_window_minutes:minutes,handover_review_reason:reason}).handover_review_window_minutes,minutes);
 for(const minutes of [0,10,46,60,null,'45'])assert.throws(()=>normalizeHandoverReviewWindow({handover_review_window_minutes:minutes,handover_review_reason:reason}));
 assert.throws(()=>normalizeHandoverReviewWindow({handover_review_window_minutes:45}));
 assert.throws(()=>normalizeHandoverReviewWindow({handover_review_reason:reason}));
 assert.throws(()=>normalizeTimeout({timeout_ms:600001,timeout_reason:reason}));
 const job={...settings,role:'qa',review_of:{id:'fictional-reconstruction'},status:'running'};
 const timing=jobExecutionTiming(1000000,job),full={...job,...timing};
 assert.equal(timing.timeout_ms,600000);
 assert.equal(Date.parse(timing.execution_deadline_at),1000000+45*60000);
 assert.equal(jobTimeoutState(full,1000000+11*60000).state,'executing');
 assert.equal(jobTimeoutState(full,1000000+45*60000).state,'terminating');
 assert.equal(jobTimeoutState({...full,handover_review_window_minutes:30},1000000+1000).state,'inspection');
 assert.equal(jobTimeoutState({...full,role:'engineer'},1000000+1000).state,'inspection');
 const ordinary={role:'engineer',status:'running',...executionTiming(1000000,{timeout_ms:600000,timeout_reason:reason})};
 assert.equal(jobTimeoutState(ordinary,1000000+600000).state,'terminating');
});

function fixture(){
 const root=fs.mkdtempSync(path.join(base,'fixture-')),old=id('old'),session_id=id('incoming');
 engine.bind(root,old,'codex');engine.open({root,session_id:old,idea:'Fictional continuation window'},'codex');withStore(root,db=>db.migrate());
 engine.bind(root,session_id,'codex');engine.control({root,session_id,expected_epoch:1,action:'handover',source_instruction:'Continue fictional company here'},'codex');
 const b={root,session_id,epoch:2};
 const receipt=engine.handover({...b,action:'submit',content:'Recover fictional objectives, exact rules, held work and uncertainty. No external execution. Fresh independent exact-state QA is required before preparation resume.'},'codex');
 return {...b,target:receipt.id};
}
function queue(b,window=45){
 const key=id('job');withStore(b.root,db=>db.transaction('fixture.queue',s=>{
  const instance=id('qa');s.sessions[instance]={instance_id:instance,role:'qa',host:'codex',native_id:null};
  const j={id:key,role:'qa',instance_id:instance,session_key:instance,host:'codex',epoch:2,status:'queued',task:'Independently review the complete fictional reconstruction',inputs:[],review_of:{id:b.target,revision:1},created_at:new Date(Date.now()).toISOString(),...settings};
  if(window===null){delete j.handover_review_window_minutes;delete j.handover_review_reason;}else j.handover_review_window_minutes=window;
  const ctx=assignmentContext(s,j);s.jobs[key]={...j,inputs:ctx.inputs,context_sha256:ctx.hash};return s;
 }));return key;
}
async function simulated(b,key,{expire=false,tamper=false,fastBlocked=false,progressive=false,badTiming,publicationTickBudget}={}){
 const RealDate=Date;let now=RealDate.now()+10000,calls=0,publicationClock=false;globalThis.Date=class extends RealDate {constructor(...args){if(!args.length&&publicationClock)now++;super(...(args.length?args:[now]));}static now(){return fastBlocked?now++:now;}};
 const reportSpawn=(options,limit)=>{
  const timing=executionTiming(now,{timeout_ms:limit,timeout_reason:settings.timeout_reason});
  if(badTiming&&calls===badTiming.call){
   if(badTiming.field==='future-start')Object.assign(timing,executionTiming(now+1000,{timeout_ms:limit,timeout_reason:settings.timeout_reason}));
   else if(badTiming.field==='past-start')Object.assign(timing,executionTiming(now-360001,{timeout_ms:limit,timeout_reason:settings.timeout_reason}));
   else if(badTiming.missing)delete timing[badTiming.field];
   else timing[badTiming.field]=badTiming.field==='timeout_reason'?'Contradictory fictional reason':new RealDate(RealDate.parse(timing[badTiming.field])+1).toISOString();
  }
  options.onSpawn?.(timing);
 };
 try{
  const s=withStore(b.root,db=>db.read()),ctx=assignmentContext(s,s.jobs[key]),e=ctx.handover_evidence,stream=e.sources[e.pages[0].source_id];
  const citations=JSON.parse(ctx.text).evidence_protocol.citations.slice(0,1),target=s.records[b.target];
  const limits=[];let offset=0;
  await work(b.root,key,async(host,session,request,dir,limit,selection,options)=>{
   assert.ok(limit<=600000,'Each actual native invocation stays bounded at ten minutes');
   limits.push(limit);
   if(progressive){
    calls++;reportSpawn(options,limit);now+=progressive==='exact'?450000:440000;
    if(offset<stream.length){let length=Math.min(Math.ceil(stream.length/5),stream.length-offset);const c=stream.raw.charCodeAt(offset+length-1);if(c>=0xd800&&c<=0xdbff)length--;const read={source_id:stream.source_id,sha256:stream.sha256,offset,length};offset+=length;return {native_id:'fictional-independent',text:JSON.stringify({reads:[read]})};}
    if(publicationTickBudget!==undefined){now=Date.parse(withStore(b.root,db=>db.read().jobs[key]).execution_deadline_at)-publicationTickBudget;publicationClock=true;}
    return {native_id:'fictional-independent',text:JSON.stringify({content:'Independent complete fictional review.',citations,messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional full coverage',permitted_action:'resume_handover',subject_sha256:target.handover.subject_sha256,blockers:[]}})};
   }
   if(calls++===0){
    reportSpawn(options,limit);
    if(fastBlocked){assert.ok(limit<600000);return {native_id:'fictional-independent',text:JSON.stringify({content:'Fictional missing evidence.',citations,messages:[],notices:[],review:{verdict:'Blocked',reason:'Incomplete fictional evidence',permitted_action:'hold',subject_sha256:target.handover.subject_sha256,blockers:['Incomplete']}})};}
    now+=360000;
    if(tamper)withStore(b.root,db=>db.transaction('fixture.tamper',v=>{v.jobs[key].handover_review_window_minutes=30;return v;}));
    const reads=[];for(let offset=0;offset<stream.length;){let length=Math.min(32768,stream.length-offset);const c=stream.raw.charCodeAt(offset+length-1);if(c>=0xd800&&c<=0xdbff)length--;reads.push({source_id:stream.source_id,sha256:stream.sha256,offset,length});offset+=length;}
    assert.ok(reads.length<=4);return {native_id:'fictional-independent',text:JSON.stringify({reads})};
   }
   reportSpawn(options,limit);
   now=expire?Date.parse(withStore(b.root,db=>db.read().jobs[key]).execution_deadline_at):now+360000;
   if(publicationTickBudget!==undefined){now=Date.parse(withStore(b.root,db=>db.read().jobs[key]).execution_deadline_at)-publicationTickBudget;publicationClock=true;}
   return {native_id:'fictional-independent',text:JSON.stringify({content:'Independent fictional understanding established.',citations,messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional complete frozen review',permitted_action:'resume_handover',subject_sha256:target.handover.subject_sha256,blockers:[]}})};
  });
  return {calls,limits,state:withStore(b.root,db=>db.read())};
 }finally{globalThis.Date=RealDate;}
}

test('streamed review may complete after ten minutes only with a fresh explicit window',async()=>{
 for(const window of [null,45]){
  const b=fixture(),key=queue(b,window),result=await simulated(b,key),j=result.state.jobs[key];
  assert.equal(result.calls,2);
  if(window===null){assert.notEqual(j.status,'completed');assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'));}
  else{
   assert.equal(j.status,'completed');assert.equal(result.state.records[j.artifact_id].handover_evidence.semantic_delivery_complete,true);
   const accepted=engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'Resume after current independent Pass'},'codex');
   assert.equal(accepted.paused,false);assert.equal(accepted.handover.status,'completed');
  }
 }
});

test('window changes or completion exactly at the review deadline cannot publish an accepted Pass',async()=>{
 for(const options of [{tamper:true},{expire:true}]){
  const b=fixture(),key=queue(b),{state}=await simulated(b,key,options),j=state.jobs[key];
  assert.notEqual(j.status,'completed');assert.equal(state.paused,true);
  assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'));
 }
});

test('ordinary dispatch rejects handover-window controls before creating a job or session',()=>{
 const root=fs.mkdtempSync(path.join(base,'ordinary-')),session_id=id('owner');engine.bind(root,session_id,'codex');engine.open({root,session_id,idea:'Fictional ordinary task'},'codex');
 const before=withStore(root,db=>db.read());
 assert.throws(()=>engine.dispatch({root,session_id,epoch:1,role:'qa',task:'Ordinary review',handover_review_window_minutes:45,handover_review_reason:reason},'codex'),/only for a fresh current paused/);
 const after=withStore(root,db=>db.read());assert.deepEqual(after.jobs,before.jobs);assert.deepEqual(after.sessions,before.sessions);assert.equal(after.revision,before.revision);
});

test('window admission requires an unused target and fresh native-session reference',()=>{
 const b=fixture(),s=withStore(b.root,db=>db.read()),args={role:'qa',review_of:b.target};
 assert.equal(freshHandoverReviewEligible(s,args),true);
 s.jobs.old={status:'failed',review_of:{id:b.target,revision:1}};
 assert.equal(freshHandoverReviewEligible(s,args),false);
 delete s.jobs.old;s.sessions[`qa:review:${b.target}:1`]={native_id:'earlier-session'};
 assert.equal(freshHandoverReviewEligible(s,args),false);
 delete s.sessions[`qa:review:${b.target}:1`];s.paused=false;
 assert.equal(freshHandoverReviewEligible(s,args),false);
});

test('terminal review receipts outside the fixed window cannot permit resume',async()=>{
 const b=fixture(),key=queue(b),result=await simulated(b,key);assert.equal(result.state.jobs[key].status,'completed');
 withStore(b.root,db=>db.transaction('fixture.late-receipt',s=>{s.jobs[key].finished_at=s.jobs[key].execution_deadline_at;return s;}));
 assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'),/QA/);
});

test('first-call timing validates the actual shortened invocation without extending the job policy',async()=>{
 const b=fixture(),key=queue(b,null),{state,calls}=await simulated(b,key,{fastBlocked:true}),j=state.jobs[key];
 assert.equal(calls,1);assert.equal(j.status,'completed');assert.equal(state.records[j.artifact_id].review.verdict,'Blocked');
 assert.equal(Date.parse(j.execution_deadline_at)-Date.parse(j.execution_started_at),600000);
 assert.equal(state.paused,true);
});

test('a fixed review window shrinks later call limits and rejects completion exactly at its end',async()=>{
 for(const progressive of [true,'exact']){
  const b=fixture(),key=queue(b),r=await simulated(b,key,{progressive}),j=r.state.jobs[key];
  assert.equal(r.calls,6);assert.ok(r.limits.at(-1)<600000);
  if(progressive===true){assert.equal(j.status,'completed');assert.equal(Date.parse(j.finished_at)-Date.parse(j.execution_started_at),44*60000);}
  else{assert.notEqual(j.status,'completed');assert.throws(()=>engine.control({...b,action:'resume',expected_epoch:2,source_instruction:'resume'},'codex'));}
 }
});


test('every native invocation requires complete consistent timing evidence before publication',async()=>{
 const malformed=[
  {field:'termination_deadline_at',missing:true},{field:'termination_deadline_at'},
  {field:'timeout_reason',missing:true},{field:'timeout_reason'}
 ];
 for(const call of [1,2])for(const bad of malformed){
  const b=fixture(),key=queue(b),{state,calls}=await simulated(b,key,{badTiming:{...bad,call}}),j=state.jobs[key];
  assert.equal(calls,call,'Malformed timing stops the affected invocation');
  assert.notEqual(j.status,'completed',JSON.stringify({call,...bad}));
  assert.notEqual(state.records[j.artifact_id]?.status,'Submitted');
  assert.equal(state.paused,true);
 }
 for(const field of ['future-start','past-start']){
  const b=fixture(),key=queue(b),{state}=await simulated(b,key,{badTiming:{field,call:2}}),j=state.jobs[key];
  assert.notEqual(j.status,'completed',field);
  assert.notEqual(state.records[j.artifact_id]?.status,'Submitted');
  assert.equal(state.paused,true);
 }
});

test('clock movement during publication never publishes a completed receipt at or beyond expiry',async()=>{
 // Advance the wall clock as timestamps are acquired, across several offsets.
 // This exercises boundary crossing during durable publication, not only a
 // model result that was already late when the worker first checked it.
 let lateObserved=false;
 for(const publicationTickBudget of [1,2,3,4,5,6,7,8]){
  const b=fixture(),key=queue(b),{state}=await simulated(b,key,{progressive:true,publicationTickBudget}),j=state.jobs[key],r=state.records[j.artifact_id];
  const deadline=Date.parse(j.execution_deadline_at);
  const late=Date.parse(j.finished_at)>=deadline||Date.parse(r?.created_at)>=deadline;
  if(late){
   lateObserved=true;
   assert.notEqual(j.status,'completed','Late publication must fail closed at offset '+publicationTickBudget);
   assert.notEqual(r?.status,'Submitted','Late artifact must remain unaccepted at offset '+publicationTickBudget);
  }
  if(j.status==='completed'){
   assert.ok(Date.parse(j.finished_at)<deadline);
   assert.ok(Date.parse(r.created_at)<deadline);
  }
  assert.equal(state.paused,true);
 }
 assert.equal(lateObserved,true,'Fixture must cross the publication deadline');
});
