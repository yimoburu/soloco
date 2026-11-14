// Controlled source regressions: real engine/Store/worker/adapter paths, fake
// clock and EventEmitter review children. Fixture authorization may run the
// supported fixed sandbox readiness probe; no model CLI or provider is invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {proofJobSafe} from '../plugins/soloco/runtime/current-state.mjs';
import {reviewContinuationRequiredEvidence} from '../plugins/soloco/runtime/development-review-continuation.mjs';
import {fixture,authorized,read,hash,base} from './review-continuation-central-fixture.mjs';
import {runOriginalAdapterWithMock,stageOriginalWorker} from './original-adapter-process-fixture.mjs';

const priorData=process.env.COMPANY_PLUGIN_DATA;
process.env.COMPANY_PLUGIN_DATA=path.join(base,'grant-window-plugin-data');
test.after(()=>{if(priorData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=priorData;});
const reason='CONTROLLED fixed grant-window regression; no actual native/model.';

async function withClock(fn){
  const RealDate=Date;let clock=RealDate.now()+1000;
  globalThis.Date=class extends RealDate{constructor(...v){super(...(v.length?v:[clock]));}static now(){return clock;}};
  try{return await fn({now:()=>clock,advance:ms=>{clock+=ms;}});}finally{globalThis.Date=RealDate;}
}
async function prepare(clock,{grantMs=3600000}={}){
  const args=await fixture();clock.advance(args.reviewStart-clock.now());args.expires_at=new Date(clock.now()+grantMs).toISOString();
  const target=authorized(args),before=read(args);
  const required=reviewContinuationRequiredEvidence(before,target,{root:args.root});
  engine.bind(args.root,args.session_id,'codex');
  return {args,target,before,dispatchArgs:{...args,role:'qa',task:'Read every whole required source; return an independent exact continuation verdict.',review_of:target.id,input_ids:required.filter(x=>x.id!=='contract').map(x=>x.id),evidence_ids:['contract'],timeout_ms:600000,timeout_reason:reason,code_review_window_minutes:30,code_review_reason:reason}};
}
function queue(state){
  let launches=0;
  const job=engine.dispatch(state.dispatchArgs,'codex',{check:()=>({available:true,authenticated:true,version:'controlled-no-CLI'}),launch:()=>{launches++;const child=new EventEmitter();child.unref=()=>child;return child;}});
  stageOriginalWorker(state.args.root,job.id);
  assert.equal(launches,1);return job;
}
function preserved(state,after){
  assert.deepEqual(after.jobs['prior-unknown'],state.before.jobs['prior-unknown']);
  const oldKey=state.before.jobs['prior-unknown'].session_key;
  assert.deepEqual(after.sessions[oldKey],state.before.sessions[oldKey]);
  assert.deepEqual(after.records.plan,state.before.records.plan);
  assert.deepEqual(after.records.recovery,state.before.records.recovery);
}
function noPass(after,id){assert.equal(Object.values(after.records).some(r=>r.job_id===id&&r.status==='Submitted'&&r.review?.verdict==='Pass'),false);}
function verdict(target,pass){return {content:'Controlled fixture judgment; not real model evidence.',messages:[],notices:[],review:{verdict:pass?'Pass':'Fail',reason:'Controlled complete-source fixture response.',permitted_action:pass?'accept_local_development':'hold',candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:target.development.proposal.subject.receipt_sha256,continuation_target_sha256:hash(target),continuation_grant_sha256:target.development.authorization.decision.sha256,continuation_authorization_sha256:target.development.authorization.authority_sha256,blockers:pass?[]:['Controlled negative cleanup, never acceptance.']}};}
function controlledModel(state,clock,{lateSpawnMs=0,positive=false}={}){
  const observed={calls:0,spawns:0,closes:0,signals:[],children:[]};
  const model=(host,native,prompt,cwd,limit,selection,options)=>{
    const call=++observed.calls,child=new EventEmitter();child.pid=92000+call;
    for(const key of ['stdout','stderr','stdin']){child[key]=new EventEmitter();child[key].resume=()=>{};}
    let closed=false,stopping=false;
    const close=(code=0,signal=null)=>{if(closed)return;closed=true;observed.closes++;child.emit('close',code,signal);};
    child.kill=signal=>{stopping=true;observed.signals.push(signal);queueMicrotask(()=>close(null,signal));return true;};
    child.stdin.end=()=>queueMicrotask(()=>{
      clock.advance(call===1?lateSpawnMs:0);observed.spawns++;child.emit('spawn');
      if(stopping||options.signal.aborted)return;
      clock.advance(1000);
      const record=read(state.args).records.contract,body=JSON.stringify(record);
      const artifact=positive&&call===1?{reads:[{id:record.id,sha256:hash(record),offset:0,length:body.length}]}:verdict(state.target,positive);
      child.stdout.emit('data',JSON.stringify({type:'thread.started',thread_id:'controlled-grant-window-independent'})+'\n'+JSON.stringify({type:'turn.started'})+'\n'+JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(artifact)}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');close();
    });
    observed.children.push(child);
    const {spawn:oldSpawn,...incoming}=options;
    return runOriginalAdapterWithMock(host,native,prompt,cwd,limit,selection,{...incoming,sessionTitle:undefined,resolveExecutable:()=>'/controlled/codex',now:clock.now},{child});
  };
  return {observed,model};
}
function closedChildren(observed){
  assert.equal(observed.closes,observed.calls);
  for(const child of observed.children)for(const emitter of [child,child.stdout,child.stderr,child.stdin])assert.equal(emitter.eventNames().length,0);
}

test('continuation rejects a fresh 60-second grant before launching its fixed 30-minute review',()=>withClock(async clock=>{
  const state=await prepare(clock,{grantMs:60000});let launches=0;
  assert.throws(()=>engine.dispatch(state.dispatchArgs,'codex',{check:()=>({available:true,authenticated:true,version:'controlled-no-CLI'}),launch:()=>{launches++;throw Error('Review worker must not launch');}}),error=>error.code==='SCOPE_WINDOW_UNAVAILABLE');
  assert.equal(launches,0);
  const after=read(state.args);assert.equal(Object.values(after.jobs).some(j=>j.review_of?.id===state.target.id),false);preserved(state,after);
}));

test('continuation queued with enough time rejects a delayed start before any model invocation',()=>withClock(async clock=>{
  const state=await prepare(clock,{grantMs:31*60000}),queued=queue(state);clock.advance(2*60000);let calls=0;
  await work(state.args.root,queued.id,()=>{calls++;throw Object.assign(Error('Model must not be invoked after the complete window no longer fits'),{termination_confirmed:true});});
  const after=read(state.args),job=after.jobs[queued.id];assert.equal(calls,0);assert.equal(job.status,'failed');assert.equal(job.execution_failure.code,'SCOPE_WINDOW_UNAVAILABLE');
  assert.equal(job.execution_started_at,undefined);assert.equal(job.execution_deadline_at,undefined);assert.equal(job.model_process_tracking,undefined);noPass(after,job.id);preserved(state,after);
}));

test('continuation rejects a late actual spawn before persisting an execution window beyond its grant',()=>withClock(async clock=>{
  const state=await prepare(clock,{grantMs:31*60000}),queued=queue(state),fake=controlledModel(state,clock,{lateSpawnMs:2*60000});
  await work(state.args.root,queued.id,fake.model);
  const after=read(state.args),job=after.jobs[queued.id];assert.equal(fake.observed.calls,1);assert.equal(fake.observed.spawns,1);assert.deepEqual(fake.observed.signals,['SIGTERM']);closedChildren(fake.observed);
  assert.equal(job.status,'failed');assert.match(job.error,/Insufficient authorized time for the complete fixed code review window|Complete code review window exceeds its new authorization deadline/);
  assert.equal(job.execution_started_at,undefined);assert.equal(job.execution_deadline_at,undefined);assert.equal(job.model_process_tracking.invocations.length,1);assert(job.model_process_tracking.invocations.every(x=>x.birth&&x.closure));noPass(after,job.id);preserved(state,after);
}));

test('actual closed two-invocation one-READ continuation metadata is accepted while four altered clones are rejected',()=>withClock(async clock=>{
  const state=await prepare(clock),queued=queue(state),fake=controlledModel(state,clock,{positive:true});
  await work(state.args.root,queued.id,fake.model);
  const after=read(state.args),job=after.jobs[queued.id],review=after.records[job.artifact_id];
  assert.equal(job.status,'completed',JSON.stringify({status:job.status,error:job.error,execution_failure:job.execution_failure}));assert.equal(review.review.verdict,'Pass');
  assert.equal(fake.observed.calls,2);assert.equal(job.delivered_record_reads.ranges.length,1);assert.equal(job.model_process_tracking.invocations.length,2);assert(job.model_process_tracking.invocations.every(x=>x.birth&&x.closure));assert.deepEqual(fake.observed.signals,[]);closedChildren(fake.observed);
  assert.equal(proofJobSafe(job,after),true);
  const variants=[['unknown top-level metadata',j=>j.unknown_metadata={restriction:'Retain unknown evidence'}],['extra nested subject field',j=>j.code_review_subject.unknown='Retain unknown evidence'],['delivery-native mismatch',j=>j.delivered_record_reads.native_id='different-controlled-native'],['initial-context mismatch',j=>j.delivered_record_reads.initial_delivery.assignment_context_sha256='0'.repeat(64)]];
  for(const [name,mutate] of variants){const clone=structuredClone(job);mutate(clone);assert.equal(proofJobSafe(clone,after),false,name);}
  preserved(state,after);
}));
