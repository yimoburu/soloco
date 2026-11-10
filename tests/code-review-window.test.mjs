// Actual dispatch/Store/worker; model timing/output are controlled. No native,
// tests, provider, company acceptance or renewed human authority is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {digest,withStore,id,Store} from '../plugins/soloco/runtime/store.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming,normalizeCodeReviewWindow} from '../plugins/soloco/runtime/timeout.mjs';
import {proofJobSafe} from '../plugins/soloco/runtime/current-state.mjs';

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-code-window-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'plugin-data');test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const reason='Controlled source fixture: complete independent review needs multiple bounded calls.';
function fixture(){
  const root=fs.mkdtempSync(path.join(base,'case-')),session_id=id('owner');engine.bind(root,session_id,'codex');engine.open({root,session_id,idea:'Controlled source-only review timing'},'codex');
  withStore(root,db=>db.transaction('fixture.runtime-lineage',s=>{
    const result={status:'passed',exit_code:0,tests_executed:true},files=[{path:'sample.test.mjs',content:'// Controlled source body; no test is executed by this fixture.\n'}],candidate_sha256=digest(JSON.stringify(files));
    const scope={expires_at:'2001-01-01T00:00:00.000Z',sources:files.map(f=>({...f,sha256:digest(f.content)})),test_paths:['sample.test.mjs']},scope_sha256=digest(JSON.stringify(scope));
    s.records.plan={id:'plan',revision:1,kind:'artifact',content:'Original scope, expiry and spent counters remain unchanged',development:{type:'plan',scope,scope_sha256,attempts:2}};
    s.records.candidate={id:'candidate',revision:1,kind:'artifact',status:'Submitted',author_role:'engineer',author_instance:'fixture-engineer',job_id:'engineer-job',content:'Controlled candidate',development:{type:'candidate',plan_id:'plan',scope_sha256,candidate_sha256,files,run:{job_id:'test-controller',receipt_id:'receipt',status:'passed'}}};
    s.records.receipt={id:'receipt',revision:1,kind:'artifact',status:'Submitted',author_role:'runtime',author_instance:'test-controller',content:JSON.stringify(result),development:{type:'test',plan_id:'plan',candidate_id:'candidate',candidate_sha256,result,receipt_sha256:digest(JSON.stringify(result))}};
    s.records.supplemental={id:'supplemental',revision:1,kind:'artifact',content:'Whole controlled evidence '+('x'.repeat(60000))};
    s.jobs['test-controller']={id:'test-controller',kind:'development_test',status:'completed',artifact_id:'receipt',candidate_id:'candidate',development_id:'plan'};
    s.jobs['engineer-job']={id:'engineer-job',status:'completed',native_id:'fixture-author-native',coordination_release:{termination_confirmed:true}};
    return s;
  }));return {root,session_id,epoch:1};
}
function dispatch(f,window=30,extra={}){
  return engine.dispatch({...f,role:'qa',task:'Read the complete exact supplemental source and independently review the runtime test receipt. This fixture does not authorize acceptance.',review_of:'receipt',evidence_ids:['supplemental'],timeout_ms:600000,timeout_reason:reason,...(window===null?{}:{code_review_window_minutes:window,code_review_reason:reason}),...extra},'codex',{launch:()=>({on(){},unref(){}}),check:()=>({available:true,authenticated:true,version:'controlled-source-host'})});
}
async function simulate(f,key,{tamper=false,longCall=false,expire=false,latePublication=false,latePersistence=false,failPending=false,inlineOnly=false}={}){
  const RealDate=Date,originalTransaction=Store.prototype.transaction;let now=RealDate.now()+1000,calls=0,crossedPublicationBoundary=false;const limits=[];
  globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
  if(latePublication)Store.prototype.transaction=function(type,fn,...rest){return originalTransaction.call(this,type,type==='job.completed'?s=>{s.records=new Proxy(s.records,{set(target,property,value){if(value?.job_id===key&&value?.author_role==='qa'){now=Date.parse(s.jobs[key].execution_deadline_at);crossedPublicationBoundary=true;}return Reflect.set(target,property,value);}});return fn(s);}:fn,...rest);};
  if(latePersistence)Store.prototype.transaction=function(type,fn,options={}){return originalTransaction.call(this,type,fn,type==='job.completed'?{...options,afterWrite(db,state){options.afterWrite?.(db,state);now=Date.parse(state.jobs[key].execution_deadline_at);crossedPublicationBoundary=true;}}:options);};
  try{
    const original=withStore(f.root,db=>db.read()),source=original.records.supplemental,text=JSON.stringify(source),sha256=digest(text);
    await work(f.root,key,async(host,native,prompt,cwd,limit,selection,options)=>{
      calls++;limits.push(limit);options.onSpawn?.(executionTiming(now,{timeout_ms:limit,timeout_reason:reason}));
      if(failPending&&calls===2)throw Object.assign(Error('Controlled missing transport response'),{code:'CONTROLLED_NO_RESPONSE',termination_confirmed:false});
      now+=longCall?600001:360000;
      if(tamper&&calls===1)withStore(f.root,db=>db.transaction('fixture.policy-tamper',s=>{s.jobs[key].code_review_window_minutes=45;return s;}));
      if(expire&&calls===3)now=Date.parse(withStore(f.root,db=>db.read().jobs[key]).execution_deadline_at);
      if(!inlineOnly&&calls<=2){const offset=calls===1?0:32768;return {native_id:'fixture-independent-reviewer',text:JSON.stringify({reads:[{id:source.id,sha256,offset,length:Math.min(32768,text.length-offset)}]})};}
      return {native_id:'fixture-independent-reviewer',text:JSON.stringify({content:'Controlled complete review; no actual native qualification or acceptance.',review:{verdict:'Pass',reason:'Both complete source ranges supplied in this controlled transport.',permitted_action:'accept_local_development',candidate_sha256:original.records.receipt.development.candidate_sha256,receipt_sha256:original.records.receipt.development.receipt_sha256,blockers:[]}})};
    });return {calls,limits,crossedPublicationBoundary,state:withStore(f.root,db=>db.read())};
  }finally{globalThis.Date=RealDate;Store.prototype.transaction=originalTransaction;}
}
test('a fixed fresh window permits complete multi-call QA past ten minutes, leaving old scope unchanged',async t=>{
  for(const window of [null,30]){const f=fixture(),before=withStore(f.root,db=>db.read().records.plan),queued=dispatch(f,window),r=await simulate(f,queued.id),j=r.state.jobs[queued.id];
    t.diagnostic(JSON.stringify({window,calls:r.calls,status:j.status,error:j.error??null}));
    assert(r.limits.every(v=>v<=600000));assert.deepEqual(r.state.records.plan,before);
    if(window===null){assert.notEqual(j.status,'completed');assert.equal(r.calls,2);}
    else{assert.equal(j.status,'completed');assert.equal(r.calls,3);assert.equal(Date.parse(j.execution_deadline_at)-Date.parse(j.execution_started_at),30*60000);assert.equal(r.state.records[j.artifact_id].review.verdict,'Pass');assert.equal(r.state.records.receipt.development.acceptance,undefined);assert.equal(j.delivered_record_reads.ranges.length,2);assert.equal(j.delivered_record_reads.initial_delivery.assignment_context_sha256,j.context_sha256);assert.equal(j.delivered_record_reads.ranges.reduce((n,x)=>n+x.length,0),JSON.stringify(r.state.records.supplemental).length);assert.equal(proofJobSafe(j),true);for(const change of [x=>x.code_review_subject.ready=true,x=>x.code_review_window_minutes=180,x=>x.delivered_record_reads.native_id='different-native']){const altered=structuredClone(j);change(altered);assert.equal(proofJobSafe(altered),false);}}
  }
});
test('tampering, overlong single calls and the exact overall deadline cannot publish Pass',async()=>{
  for(const options of [{tamper:true},{longCall:true},{expire:true}]){const f=fixture(),queued=dispatch(f),r=await simulate(f,queued.id,options);assert(r.calls>0,'The controlled model path must be reached');assert.notEqual(r.state.jobs[queued.id].status,'completed');assert.equal(r.state.records.receipt.development.acceptance,undefined);}
});
test('ordinary roles, forged runtime lineage and an existing uncertain review session are rejected before queueing',()=>{
  for(const variant of ['engineer','forged','uncertain']){const f=fixture();
    if(variant==='forged')withStore(f.root,db=>db.transaction('fixture.bad-receipt',s=>{s.jobs['test-controller'].artifact_id='some-other-artifact';return s;}));
    if(variant==='uncertain')withStore(f.root,db=>db.transaction('fixture.old-unknown',s=>{s.sessions['qa:review:receipt:1']={instance_id:'old-qa',role:'qa',host:'codex',native_id:'old-unknown-native'};s.jobs.old={id:'old',role:'qa',status:'failed',started_at:'2001-01-01T00:00:00Z',instance_id:'old-qa',execution_failure:{termination_confirmed:false}};return s;}));
    const before=withStore(f.root,db=>db.read());assert.throws(()=>dispatch(f,30,variant==='engineer'?{role:'engineer'}:{}));const after=withStore(f.root,db=>db.read());assert.deepEqual(after.jobs,before.jobs);assert.deepEqual(after.sessions,before.sessions);
  }
});
test('window selection is explicit and finite, with no change to a legacy job',()=>{
  assert.equal(normalizeCodeReviewWindow({}),null);for(const minutes of [0,10,60,null,'30'])assert.throws(()=>normalizeCodeReviewWindow({code_review_window_minutes:minutes,code_review_reason:reason}));
});
test('crossing the overall deadline during final publication cannot publish an eligible Pass',async()=>{
  const f=fixture(),queued=dispatch(f),r=await simulate(f,queued.id,{latePublication:true}),j=r.state.jobs[queued.id];assert.equal(r.calls,3);assert.equal(r.crossedPublicationBoundary,true);assert.notEqual(j.status,'completed');assert.equal(Object.values(r.state.records).some(x=>x.job_id===j.id&&x.status==='Submitted'&&x.review?.verdict==='Pass'),false);assert.equal(j.execution_failure.code,'ROLE_TIMEOUT');
});
test('retrieval before a failed invocation cannot become delivered evidence or release uncertainty',async()=>{
  const f=fixture(),queued=dispatch(f),r=await simulate(f,queued.id,{failPending:true}),j=r.state.jobs[queued.id];assert.equal(r.calls,2);assert.equal(j.status,'failed');assert.equal(j.retrieved_inputs.length,1);assert.equal(j.delivered_record_reads.ranges.length,0);assert.equal(j.coordination_release,undefined);assert.equal(j.execution_failure.termination_confirmed,false);
});
test('a closed all-inline response creates an empty-range initial delivery marker',async()=>{
  const f=fixture(),queued=dispatch(f,30,{evidence_ids:[]}),r=await simulate(f,queued.id,{inlineOnly:true}),j=r.state.jobs[queued.id];assert.equal(r.calls,1);assert.equal(j.status,'completed');assert.equal(j.delivered_record_reads.ranges.length,0);assert.equal(j.delivered_record_reads.native_id,'fixture-independent-reviewer');assert.equal(j.delivered_record_reads.initial_delivery.assignment_context_sha256,j.context_sha256);
});
test('a Pass that omits a declared non-inline supplemental source cannot publish',async()=>{
  const f=fixture(),queued=dispatch(f),r=await simulate(f,queued.id,{inlineOnly:true}),j=r.state.jobs[queued.id];assert.equal(r.calls,1);assert.notEqual(j.status,'completed');assert.match(j.error,/complete delivered supplemental/);assert.equal(r.state.records.receipt.development.acceptance,undefined);
});
test('deadline crossing after actual SQL writes rolls back eligible publication in either layout',async t=>{
  for(const normalized of [false,true])await t.test(normalized?'normalized-v4':'legacy-json',async()=>{const f=fixture();if(normalized)withStore(f.root,db=>db.migrate());const queued=dispatch(f),r=await simulate(f,queued.id,{latePersistence:true}),j=r.state.jobs[queued.id];assert.equal(r.calls,3);assert.equal(r.crossedPublicationBoundary,true);assert.notEqual(j.status,'completed');assert.equal(Object.values(r.state.records).some(x=>x.job_id===j.id&&x.status==='Submitted'&&x.review?.verdict==='Pass'),false);});
});
