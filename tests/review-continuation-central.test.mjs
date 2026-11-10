// End to end through real engine, Store, worker AND adapter. Original
// ChildProcess/clock/native outputs are explicitly controlled, never a CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {Store,digest} from '../plugins/soloco/runtime/store.mjs';
import {runModel} from '../plugins/soloco/runtime/adapters.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {reviewContinuationRequiredEvidence} from '../plugins/soloco/runtime/development-review-continuation.mjs';
import {restoreContinuationReviewContext,CONTINUATION_REVIEW_TRANSPORT} from '../plugins/soloco/runtime/continuation-review-transport.mjs';
import {fixture,authorized,read,hash,base} from './review-continuation-central-fixture.mjs';
const priorData=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(base,'isolated-plugin-data');
test.after(()=>{if(priorData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=priorData;});
const reason='CONTROLLED source fixture: one exact new read-only independent judgment.';
async function central({latePersistence=false}={}){
  const a=fixture(),target=authorized(a),before=read(a),required=reviewContinuationRequiredEvidence(before,target,{root:a.root});engine.bind(a.root,a.session_id,'codex');
  const queued=engine.dispatch({...a,role:'qa',task:'Read every whole required source; return an independent exact continuation verdict.',review_of:target.id,input_ids:required.filter(x=>x.id!=='contract').map(x=>x.id),evidence_ids:['contract'],timeout_ms:600000,timeout_reason:reason,code_review_window_minutes:30,code_review_reason:reason},'codex',{check:()=>({available:true,authenticated:true,version:'controlled-no-CLI'}),launch:()=>({on(){},unref(){}})});
  const RealDate=Date,originalTransaction=Store.prototype.transaction;let clock=RealDate.now()+1000,calls=0,sawTransport=false,crossed=false;const children=[];
  globalThis.Date=class extends RealDate{constructor(...v){super(...(v.length?v:[clock]));}static now(){return clock;}};
  if(latePersistence)Store.prototype.transaction=function(type,fn,options={}){return originalTransaction.call(this,type,fn,type==='job.completed'?{...options,afterWrite(db,state){options.afterWrite?.(db,state);clock=Date.parse(state.jobs[queued.id].execution_deadline_at);crossed=true;}}:options);};
  try{
    await work(a.root,queued.id,(host,native,prompt,cwd,limit,selection,options)=>{
      calls++;
      if(calls===1){
        const start=prompt.indexOf('{"protocol":"'+CONTINUATION_REVIEW_TRANSPORT+'"'),end=prompt.indexOf('\nThe pack contains pinned governance',start);assert(start>=0&&end>start);const wire=prompt.slice(start,end),envelope=JSON.parse(wire),j=read(a).jobs[queued.id];
        const restored=JSON.parse(restoreContinuationReviewContext(wire,envelope.canonical_context_sha256,j.context_sha256,{id:target.id,revision:1,sha256:hash(target)}));assert.equal(restored.records.find(x=>x.id===target.id).development.type,'review_continuation');assert(prompt.includes('continuation_authorization_sha256'));assert(prompt.includes('Original scope is expired'));sawTransport=true;
      }
      const source=read(a).records.contract,body=JSON.stringify(source);
      const artifact=calls===1?{reads:[{id:source.id,sha256:hash(source),offset:0,length:body.length}]}:{content:'Controlled complete independent review, not native evidence.',review:{verdict:'Pass',reason:'All controlled sources were delivered through the actual worker.',permitted_action:'accept_local_development',candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:target.development.proposal.subject.receipt_sha256,continuation_target_sha256:hash(target),continuation_grant_sha256:target.development.authorization.decision.sha256,continuation_authorization_sha256:target.development.authorization.authority_sha256,blockers:[]}};
      const child=new EventEmitter();child.pid=70000+calls;for(const key of ['stdout','stderr','stdin']){child[key]=new EventEmitter();child[key].resume=()=>{};}child.kill=()=>{throw Error('No controlled process should require a signal');};
      child.stdin.end=()=>queueMicrotask(()=>{child.emit('spawn');clock+=1000;child.stdout.emit('data',JSON.stringify({type:'thread.started',thread_id:'controlled-central-independent'})+'\n'+JSON.stringify({type:'turn.started'})+'\n'+JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(artifact)}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');child.emit('close',0,null);});children.push(child);
      return runModel(host,native,prompt,cwd,limit,selection,{...options,sessionTitle:undefined,resolveExecutable:()=>'/controlled/codex',spawn:()=>child,now:()=>clock});
    });
    const state=read(a),j=state.jobs[queued.id];assert.equal(calls,2,JSON.stringify({status:j.status,error:j.error,execution_failure:j.execution_failure,tracking:j.model_process_tracking}));assert.equal(sawTransport,true);assert.deepEqual(state.jobs['prior-unknown'],before.jobs['prior-unknown']);assert.deepEqual(state.records.plan.development.attempts,before.records.plan.development.attempts);assert.equal(state.records.recovery.development.status,'consumed');assert.equal(j.delivered_record_reads.ranges.length,1);assert.equal(j.model_process_tracking.invocations.length,2);assert(j.model_process_tracking.invocations.every(x=>x.birth&&x.closure));
    if(latePersistence){assert.equal(crossed,true);assert.notEqual(j.status,'completed');assert.equal(Object.values(state.records).some(x=>x.job_id===j.id&&x.status==='Submitted'&&x.review?.verdict==='Pass'),false);assert.equal(j.execution_failure.code,'ROLE_TIMEOUT');}
    else{
      assert.equal(j.status,'completed');assert.equal(state.records[j.artifact_id].review.verdict,'Pass');clock=Date.parse(j.execution_started_at)+31*60000;
      const accepted=engine.develop({...a,action:'accept_review_continuation',target_id:target.id,target_sha256:hash(target),review_id:j.artifact_id,candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:a.receipt_sha256},'codex');assert.equal(accepted.development.type,'review_continuation_acceptance');assert.equal(accepted.development.source_integrated,false);assert.deepEqual(read(a).jobs['prior-unknown'],before.jobs['prior-unknown']);
    }
    for(const child of children)for(const emitter of [child,child.stdout,child.stderr,child.stdin])assert.equal(emitter.eventNames().length,0);
  }finally{globalThis.Date=RealDate;Store.prototype.transaction=originalTransaction;}
}
test('new typed target traverses dispatch/adapter/whole delivery/Pass and later current-grant-only local acceptance',()=>central());
test('timely typed QA whose actual SQL publication crosses its own end cannot commit while new grant stays live',()=>central({latePersistence:true}));
