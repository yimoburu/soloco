// Real engine/Store/worker/adapter, with explicitly fictional ChildProcess,
// clock and reviewer output. This tests optional exact re-delivery, never
// native compaction, semantic retention, acceptance or product execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {proofJobSafe} from '../plugins/soloco/runtime/current-state.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {reviewContinuationRequiredEvidence} from '../plugins/soloco/runtime/development-review-continuation.mjs';
import {restoreContinuationReviewContext,CONTINUATION_REVIEW_TRANSPORT} from '../plugins/soloco/runtime/continuation-review-transport.mjs';
import {fixture,authorized,read,change,hash,base} from './review-continuation-central-fixture.mjs';
import {runOriginalAdapterWithMock,stageOriginalWorker} from './original-adapter-process-fixture.mjs';

const priorData=process.env.COMPANY_PLUGIN_DATA;
process.env.COMPANY_PLUGIN_DATA=path.join(base,'inline-reread-controlled-data');
test.after(()=>{if(priorData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=priorData;});
const reason='Controlled optional re-delivery of exact initial code-review inputs.';

async function exercise({inlineID='candidate',mode='success'}={}){
  const RealDate=Date;let clock=RealDate.now()+1000,calls=0,sawInitial=false;
  const children=[],delivered=[],limits=[];
  globalThis.Date=class extends RealDate{constructor(...v){super(...(v.length?v:[clock]));}static now(){return clock;}};
  try{
  const a=await fixture();clock=a.reviewStart;
  assert(Date.now()>Date.parse(read(a).records.plan.development.scope.expires_at));
  change(a,s=>{s.records['not-supplied']={id:'not-supplied',revision:1,kind:'artifact',content:'This unrelated controlled record is not assignment evidence.'};});
  const target=authorized(a),before=read(a),required=reviewContinuationRequiredEvidence(before,target,{root:a.root});
  engine.bind(a.root,a.session_id,'codex');
  const q=engine.dispatch({...a,role:'qa',task:'Independently review every supplied whole source. Optional exact reread does not renew any allowance.',review_of:target.id,input_ids:required.filter(r=>r.id!=='contract').map(r=>r.id),evidence_ids:['contract'],timeout_ms:600000,timeout_reason:reason,code_review_window_minutes:30,code_review_reason:reason},'codex',{check:()=>({available:true,authenticated:true,version:'controlled-no-CLI'}),launch:()=>({on(){},unref(){}})});
  stageOriginalWorker(a.root,q.id);
  const inline=before.records[inlineID],inlineText=JSON.stringify(inline);
  const source=mode==='unlisted'?before.records['not-supplied']:inline;
  const request={id:source.id,sha256:mode==='wrong-hash'?'0'.repeat(64):hash(source),offset:0,length:mode==='oversize-range'?32769:JSON.stringify(source).length};
    await work(a.root,q.id,(host,native,prompt,cwd,limit,selection,options)=>{
      calls++;limits.push(limit);
      if(calls===1){
        const start=prompt.indexOf('{"protocol":"'+CONTINUATION_REVIEW_TRANSPORT+'"'),end=prompt.indexOf('\nThe pack contains pinned governance',start);
        assert(start>=0&&end>start);
        const wire=prompt.slice(start,end),envelope=JSON.parse(wire),job=read(a).jobs[q.id];
        const pack=JSON.parse(restoreContinuationReviewContext(wire,envelope.canonical_context_sha256,job.context_sha256,{id:target.id,revision:1,sha256:hash(target)}));
        assert.equal(JSON.stringify(pack.records.find(r=>r.id===inline.id)),inlineText);
        assert.equal(pack.supplemental_evidence.sources.some(r=>r.id===inline.id),false);
        assert.equal(pack.records.some(r=>r.id==='not-supplied'),false);
        const subject=pack.records.find(r=>r.id===target.id).development.proposal.subject;
        assert.deepEqual(subject[inlineID],{id:inline.id,revision:inline.revision,sha256:hash(inline)});
        sawInitial=true;
      }else{
        assert.equal(native,'controlled-inline-reviewer');
        const packet=JSON.parse(prompt);assert.equal(packet.protocol,'record-reads-v1');
        for(const value of packet.reads)delivered.push(value);
        if(calls===2){assert.equal(packet.reads[0].id,inline.id);assert.equal(packet.reads[0].text,inlineText);}
      }
      if(calls===1&&mode==='changed-inline')change(a,s=>{s.records[inlineID].content+=' changed while the first controlled invocation was running';});
      if(calls===1&&mode==='changed-revision')change(a,s=>{s.records[inlineID].revision++;});
      let artifact;
      if(calls===1||mode==='round-cap')artifact={reads:mode==='too-many-ranges'?Array.from({length:5},()=>({...request})):[request]};
      else if(calls===2){const contract=before.records.contract;artifact={reads:[{id:contract.id,sha256:hash(contract),offset:0,length:JSON.stringify(contract).length}]};}
      else artifact={content:'Controlled optional reread and complete required delivery; no native retention claim.',review:{verdict:'Pass',reason:'All controlled initial and required supplementary inputs were delivered.',permitted_action:'accept_local_development',candidate_sha256:target.development.proposal.subject.candidate_sha256,receipt_sha256:target.development.proposal.subject.receipt_sha256,continuation_target_sha256:hash(target),continuation_grant_sha256:target.development.authorization.decision.sha256,continuation_authorization_sha256:target.development.authorization.authority_sha256,blockers:[]}};
      const child=new EventEmitter();child.pid=81000+calls;
      for(const key of ['stdout','stderr','stdin']){child[key]=new EventEmitter();child[key].resume=()=>{};}
      child.kill=()=>{throw Error('Controlled closed child must not require a real signal');};
      child.stdin.end=()=>queueMicrotask(()=>{
        child.emit('spawn');clock+=1000;
        if(mode==='failed-reply'&&calls===2){child.stderr.emit('data','Controlled closed failure after retrieval, before reply delivery.');child.emit('close',1,null);return;}
        const nativeID=mode==='changed-native'&&calls===2?'different-controlled-reviewer':'controlled-inline-reviewer';
        child.stdout.emit('data',JSON.stringify({type:'thread.started',thread_id:nativeID})+'\n'+JSON.stringify({type:'turn.started'})+'\n'+JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(artifact)}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n');
        child.emit('close',0,null);
      });children.push(child);
      const {spawn:oldSpawn,...incoming}=options;
      return runOriginalAdapterWithMock(host,native,prompt,cwd,limit,selection,{...incoming,sessionTitle:undefined,resolveExecutable:()=>'/controlled/codex',now:()=>clock},{child});
    });
    const after=read(a),job=after.jobs[q.id];
    assert.equal(sawInitial,true);assert(limits.every(v=>v<=600000));
    assert.deepEqual(after.jobs['prior-unknown'],before.jobs['prior-unknown']);
    assert.deepEqual(after.records.plan.development.attempts,before.records.plan.development.attempts);
    assert.equal(after.records.recovery.development.status,'consumed');
    assert.equal(after.records.receipt.development.acceptance,undefined);
    assert.equal(after.records.candidate.development.run.receipt_id,'receipt');
    for(const child of children)for(const emitter of [child,child.stdout,child.stderr,child.stdin])assert.equal(emitter.eventNames().length,0);
    return {calls,delivered,job,after,before};
  }finally{globalThis.Date=RealDate;}
}

for(const inlineID of ['candidate','plan','receipt'])test('exact initial '+inlineID+' can be optionally reread in the same bounded reviewer',async()=>{
  const r=await exercise({inlineID});
  assert.equal(r.job.status,'completed',JSON.stringify({error:r.job.error,calls:r.calls}));
  assert.equal(r.calls,3);assert.equal(r.delivered.length,2);assert.equal(r.job.retrieved_inputs.length,2);
  assert.equal(r.job.delivered_record_reads.ranges.length,2);assert.equal(r.job.delivered_record_reads.ranges[0].id,inlineID);
  assert.equal(r.job.delivered_record_reads.initial_delivery.assignment_context_sha256,r.job.context_sha256);
  assert.equal(r.job.model_process_tracking.invocations.length,3);assert(r.job.model_process_tracking.invocations.every(x=>x.birth&&x.closure));
  assert.equal(Date.parse(r.job.execution_deadline_at)-Date.parse(r.job.execution_started_at),30*60000);
  assert.equal(proofJobSafe(r.job,r.after),true);
});
for(const mode of ['wrong-hash','unlisted','changed-inline','changed-revision','changed-native','too-many-ranges','oversize-range'])test('optional inline reread holds '+mode,async()=>{
  const r=await exercise({mode});assert.notEqual(r.job.status,'completed');
  assert.equal(Object.values(r.after.records).some(v=>v.job_id===r.job.id&&v.status==='Submitted'&&v.review?.verdict==='Pass'),false);
  if(['wrong-hash','unlisted'].includes(mode))assert.match(r.job.error,/outside the assignment evidence allowlist/);
  if(['changed-inline','changed-revision'].includes(mode))assert.match(r.job.error,/eligible|lineage|changed/i);
  if(mode==='changed-native')assert.match(r.job.error,/native|identity/i);
  if(mode==='too-many-ranges')assert.match(r.job.error,/Invalid bounded supplemental read/);
  if(mode==='oversize-range')assert.match(r.job.error,/range|length|32768/i);
});
test('an inline reread does not increase the original sixteen request rounds',async()=>{
  const r=await exercise({mode:'round-cap'});assert.equal(r.calls,17);assert.notEqual(r.job.status,'completed');assert.match(r.job.error,/Invalid bounded supplemental read/);assert.equal(r.job.delivered_record_reads.ranges.length,16);
});
test('retrieved inline evidence is not delivered when its resumed invocation fails',async()=>{
  const r=await exercise({mode:'failed-reply'});assert.equal(r.calls,2);assert.notEqual(r.job.status,'completed');assert.equal(r.job.retrieved_inputs.length,1);assert.equal(r.job.delivered_record_reads.ranges.length,0);assert.equal(r.job.delivered_record_reads.initial_delivery.assignment_context_sha256,r.job.context_sha256);
});
