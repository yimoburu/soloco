import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {call,toolList} from '../plugins/soloco/runtime/main.mjs';
import {withStore,digest,teamHash} from '../plugins/soloco/runtime/store.mjs';
import {classificationFor,reviewedContext} from '../plugins/soloco/runtime/current-state.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import {executionTiming} from '../plugins/soloco/runtime/timeout.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'public-represented-v2-'));
process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'bindings');
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
const sha=v=>digest(JSON.stringify(v));
const read=f=>withStore(f.root,db=>db.read());
const mutate=(f,fn)=>withStore(f.root,db=>db.transaction('fictional.fixture',s=>{fn(s);return s;}));
const launch={check:()=>({available:true,authenticated:true,version:'FICTIONAL ADAPTER DOUBLE'}),launch:()=>({on(){},unref(){}})};
const api=(f,args)=>call('company_context',{...f,source_instruction:'Fictional preservation only; no authority or renewed allowance.',...args},'codex');
const coverage=[{source_id:'old',counterpart_ids:['home'],findings:'The finding remains open.',failures:'The attempt remains failed.',uncertain_effects:'Effects remain unknown.',exhausted_allowances:'No retries remain.'}];
function fixture(){
 const f={root:fs.mkdtempSync(path.join(tmp,'company-')),session_id:'fictional-coordinator',epoch:1};
 engine.bind(f.root,f.session_id,'codex');engine.open({...f,idea:'Fictional represented bridge contract'},'codex');
 mutate(f,s=>{s.roles={qa:{name:'QA'},engineer:{name:'Engineering'}};s.governance='Preparation only; no execution authority.';s.team_sha256=teamHash(s);});
 for(const id of ['old','home'])engine.save({...f,id,kind:'artifact',content:'Fictional: finding open; attempt failed; effects unknown; no retries remain.'},'codex');
 return f;
}
async function prepare(f,record_ids=['old']){
 const p=await api(f,{action:'plan',record_ids,disposition:'represented',counterpart_ids:['home'],coverage:record_ids.map(source_id=>({...coverage[0],source_id}))});
 const plan=read(f).records[p.id];assert.equal(plan.context_classification_plan.version,2);
 const q=engine.dispatch({...f,role:'qa',review_of:p.id,task:'Review every exact fictional original against the mandatory home.'},'codex',launch);
 assert.equal(read(f).jobs[q.id].context_format,4);
 return {p,q};
}
// Real public plan/apply, dispatch and worker; only the adapter's judgment is
// fictional. No private qualification helper seeds a review or classification.
async function review(f,{p,q},mode='complete'){
 const s=read(f),pack=assignmentContext(s,s.jobs[q.id]),e=pack.qualification_evidence;
 const sources=[e.sources[e.pages[0].source_id],...Object.values(e.sources).filter(v=>v.kind!=='semantic-stream'&&v.source_id!==e.pages[0].source_id)];
 const requests=sources.flatMap(v=>{const out=[];for(let offset=0;offset<v.length;){let length=Math.min(16000,v.length-offset);if(/[\uD800-\uDBFF]/.test(v.raw[offset+length-1]))length--;out.push({source_id:v.source_id,sha256:v.sha256,offset,length});offset+=length;}return out;});
 let calls=0,delivered=0;
 await work(f.root,q.id,async(_host,native,prompt,_dir,timeout,_selection,options)=>{
  options.onSpawn?.(executionTiming(Date.now(),{timeout_ms:timeout,timeout_reason:options.timeoutReason}));
  calls++;if(calls>1){assert.equal(native,'fictional-review-'+q.id);const packet=JSON.parse(prompt);delivered+=packet.reads.reduce((n,r)=>n+r.text.length,0);}
  if(mode==='complete'&&requests.length)return {native_id:'fictional-review-'+q.id,text:JSON.stringify({reads:requests.splice(0,4)})};
  return {native_id:mode==='nonindependent'?f.session_id:'fictional-review-'+q.id,text:JSON.stringify({content:'FICTIONAL ADAPTER DOUBLE: synthetic preservation judgment; no independent acceptance.',messages:[],notices:[],review:{verdict:'Pass',reason:'Fictional complete preservation',permitted_action:'apply_context_classification',plan_sha256:sha(read(f).records[p.id].context_classification_plan),coverage_complete:true,obligations_preserved:true,unique_findings:[],blockers:[]}})};
 });
 return {job:read(f).jobs[q.id],calls,delivered,total:sources.reduce((n,v)=>n+v.length,0)};
}
test('public represented v2 schema is strict and legacy/default protocols remain unchanged',async()=>{
 const f=fixture(),schema=toolList.find(t=>t.name==='company_context').inputSchema;
 assert.deepEqual(schema.properties.disposition.enum,['current','resolved','represented']);
 assert.equal(schema.properties.coverage.items.additionalProperties,false);
 await assert.rejects(api(f,{action:'plan',record_ids:['old'],disposition:'represented',counterpart_ids:['home'],coverage,unknown:true}),/Unknown argument/);
 for(const bad of [[],[{...coverage[0],invented:'authority'}],[{...coverage[0],failures:''}]])await assert.rejects(api(f,{action:'plan',record_ids:['old'],disposition:'represented',counterpart_ids:['home'],coverage:bad}),/coverage|Coverage/);
 for(const disposition of ['current','resolved']){const p=await api(f,{action:'plan',record_ids:['old'],disposition});assert.equal(read(f).records[p.id].context_classification_plan.version,1);}
 await assert.rejects(api(f,{action:'plan',record_ids:['old'],disposition:'current',coverage}),/Counterparts/);
 await assert.rejects(api(f,{action:'plan',protocol:'invented'}),/Invalid protocol/);
});
test('public plan, real worker complete format4 reads and public apply retain canonical current qualification and exact homes',async()=>{
 const f=fixture();
 mutate(f,s=>{s.records.old.content+=' Fictional unknown effects; no retries remain.'.repeat(14000);});
 const prepared=await prepare(f),out=await review(f,prepared);
 assert.equal(out.job.status,'completed',out.job.error);assert.equal(out.delivered,out.total);assert.ok(out.calls>16);
 const before=read(f),r=before.records[out.job.artifact_id];assert.equal(r.context_qualification.semantic_delivery_complete,true);assert.equal(out.job.coordination_release.termination_confirmed,true);
 assert.equal(classificationFor(before,before.records.old),null,'a Pass alone does not classify or grant authority');
 const apply=()=>api(f,{action:'apply',plan_id:prepared.p.id,review_id:r.id});
 // Exercise canonical apply rejection, restoring the original retained state each time.
 for(const [label,change,pattern] of [
  ['tampered receipt',s=>{s.records[r.id].context_qualification.semantic_delivery_complete=false;},/delivery receipt/],
  ['nonindependent',s=>{s.jobs[out.job.id].native_id=f.session_id;},/independent/],
  ['failed job',s=>{s.jobs[out.job.id].status='failed';},/independent/],
  ['stale home',s=>{s.records.home.content+=' changed';},/source changed/],
  ['negative review',s=>{s.records.negative={id:'negative',kind:'review',status:'Submitted',review_of:{id:prepared.p.id,revision:1},review:{verdict:'Fail'}};},/negative/],
 ]){mutate(f,change);await assert.rejects(apply(),pattern,label);assert.equal(read(f).context_classifications?.old,undefined);mutate(f,s=>Object.assign(s,structuredClone(before)));}
 assert.equal((await apply()).applied,true);
 const after=read(f),c=classificationFor(after,after.records.old);assert.equal(c.disposition,'represented');assert.equal(c.qualification.protocol,2);assert.equal(c.qualification.job_sha256,sha(after.jobs[out.job.id]));
 assert.equal(reviewedContext(after).mandatory.has('home'),true);assert.ok(reviewedContext(after).proofJobs.has(out.job.id),'canonical review bookkeeping must not become new unclassified execution');assert.equal(after.mode,'preparation');assert.equal(after.governance,before.governance);assert.equal(after.records.old.content,before.records.old.content);
 mutate(f,s=>{s.records.info={id:'info',kind:'artifact',content:'Informational append.'};});
 assert.deepEqual(classificationFor(read(f),read(f).records.old).qualification,c.qualification);
 const retained=read(f);
 mutate(f,s=>{s.jobs[out.job.id].coordination_release.termination_confirmed=false;});
 assert.throws(()=>classificationFor(read(f),read(f).records.old),/receipt changed/);
 mutate(f,s=>Object.assign(s,structuredClone(retained)));
 mutate(f,s=>{s.context_classifications.old.qualification.job_sha256='tampered';});
 assert.throws(()=>classificationFor(read(f),read(f).records.old),/receipt changed/);
});
test('real worker rejects incomplete semantic delivery and coordinator native identity',async()=>{
 for(const mode of ['incomplete','nonindependent']){
  const f=fixture(),prepared=await prepare(f),out=await review(f,prepared,mode);
  assert.equal(out.job.status,'failed');assert.match(out.job.error,mode==='incomplete'?/not completely delivered/:/independent native/);
  assert.equal(read(f).context_classifications?.old,undefined);
  await assert.rejects(api(f,{action:'apply',plan_id:prepared.p.id,review_id:out.job.artifact_id??'missing'}),/independent/);
 }
});

function pendingFixture(){
 const old=fixture(),f={...old,session_id:'fictional-incoming-maintenance',epoch:2};
 engine.control({root:old.root,session_id:old.session_id,expected_epoch:1,action:'pause',source_instruction:'pause'},'codex');engine.storageControl({...old,action:'migrate',source_instruction:'Migrate this fictional storage fixture only.'},'codex');
 engine.bind(f.root,f.session_id,'codex');engine.control({root:f.root,session_id:f.session_id,expected_epoch:1,action:'handover',source_instruction:'handover'},'codex');
 assert.equal(read(f).paused,true);assert.equal(read(f).handover.status,'pending');return f;
}
const maintenancePlan=(f,maintenance=true)=>api(f,{action:'plan',record_ids:['old'],disposition:'represented',counterpart_ids:['home'],coverage,maintenance,source_instruction:'Explicit fictional read-only preservation review for this exact source and current owner; no ordinary work or execution authority.'});
test('pending paused handover permits only explicitly scoped owner-bound represented preservation QA',async()=>{
 const f=pendingFixture(),without=await maintenancePlan(f,false),dispatch=(id,extra={})=>engine.dispatch({...f,role:'qa',review_of:id,task:'Read-only exact preservation',...extra},'codex',launch);
 assert.throws(()=>dispatch(without.id),/paused/);const p=await maintenancePlan(f);
 assert.throws(()=>dispatch(p.id,{role:'engineer'}),/paused/);assert.throws(()=>dispatch(p.id,{input_ids:['old']}),/paused/);assert.throws(()=>dispatch(p.id,{evidence_ids:['old']}),/paused/);
 const q=dispatch(p.id),out=await review(f,{p,q});assert.equal(out.job.status,'completed',out.job.error);
 assert.equal((await api(f,{action:'apply',plan_id:p.id,review_id:out.job.artifact_id})).applied,true);
 const s=read(f);assert.equal(s.paused,true);assert.equal(s.handover.status,'pending');assert.equal(s.owner.epoch,2);assert.equal(classificationFor(s,s.records.old).disposition,'represented');
 assert.throws(()=>engine.dispatch({...f,role:'engineer',task:'Ordinary work is still paused'},'codex',launch),/paused/);
});
test('represented maintenance is fenced by subsequent pause, revocation, changed source and owner transfer',async()=>{
 for(const mode of ['pause','revoke','source','owner']){
  let f=pendingFixture();const p=await maintenancePlan(f);
  if(mode==='pause')engine.control({root:f.root,session_id:f.session_id,expected_epoch:2,action:'pause',source_instruction:'pause'},'codex');
  if(mode==='revoke')assert.equal((await api(f,{action:'revoke',plan_id:p.id,source_instruction:'Revoke this exact fictional maintenance.'})).revoked,true);
  // Adversarial fixture mutation: the normal save API already prevents a new
  // coordinator from rewriting the previous author's immutable proposal.
  if(mode==='source')mutate(f,s=>{s.records.old.content='Changed unresolved restriction.';s.records.old.revision++;});
  if(mode==='owner'){const next={...f,session_id:'fictional-next-maintenance',epoch:3};engine.bind(next.root,next.session_id,'codex');engine.control({root:next.root,session_id:next.session_id,expected_epoch:2,action:'handover',source_instruction:'handover'},'codex');f=next;}
  assert.throws(()=>engine.dispatch({...f,role:'qa',review_of:p.id,task:'Stale preservation grant'},'codex',launch),/paused|source changed/);assert.equal(read(f).paused,true);
 }
});

test('public represented source includes canonical runtime test author_instance and exact producer homes',async()=>{
 const f=fixture();
 // Source fixture only: canonical executeDevelopmentTest attribution uses
 // author_instance for its runtime job; it does not invent a receipt job_id.
 mutate(f,s=>{
  s.records.development={id:'development',revision:1,kind:'plan',author_instance:'fictional-owner',content:'Fictional development plan'};
  s.records.candidate={id:'candidate',revision:1,kind:'artifact',author_instance:'generator-instance',job_id:'generate',content:'Fictional candidate',development:{type:'candidate',candidate_sha256:'fictional-source',run:{job_id:'run',status:'completed',receipt_id:'old'}}};
  s.jobs.generate={id:'generate',status:'completed',instance_id:'generator-instance',native_id:'generator-native',artifact_id:'candidate'};
  s.jobs.run={id:'run',kind:'development_test',status:'completed',candidate_id:'candidate',development_id:'development',artifact_id:'old'};
  const result={status:'passed',tests_executed:true,candidate_sha256:'fictional-source',test_paths:['fictional.test.mjs'],timeout_ms:1000,max_output_bytes:1000,directory:'/fictional/candidate',finished_at:'2026-11-06T00:00:00Z',output:'Fictional source evidence; effects unknown, no retries remain.'};
  s.records.old={id:'old',kind:'artifact',author_role:'runtime',author_instance:'run',revision:1,status:'Submitted',content:JSON.stringify(result),development:{type:'test',plan_id:'development',candidate_id:'candidate',candidate_sha256:'fictional-source',result,receipt_sha256:sha(result)}};
 });
 const prepared=await prepare(f,['old','candidate','development','job:run','job:generate']),out=await review(f,prepared);
 assert.equal(out.job.status,'completed',out.job.error);assert.equal(out.delivered,out.total);
 assert.equal((await api(f,{action:'apply',plan_id:prepared.p.id,review_id:out.job.artifact_id})).applied,true);
 const after=read(f);assert.equal(Object.hasOwn(after.records.old,'job_id'),false);
 for(const id of ['old','candidate','development','job:run','job:generate'])assert.equal(after.context_classifications[id].qualification.protocol,2);
 assert.equal(classificationFor(after,after.records.old).disposition,'represented');
 mutate(f,s=>{s.jobs.generate.native_id='changed';});
 assert.equal(classificationFor(read(f),read(f).records.old),null);
});
