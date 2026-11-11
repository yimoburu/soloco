// Temporary real Stores and controlled specialist outputs. Native model QA,
// external integration and deployment are never qualified by these fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {id,digest,withStore} from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import {developmentAssignment} from '../plugins/soloco/runtime/develop.mjs';
import {assignmentContext} from '../plugins/soloco/runtime/context.mjs';
import {work} from '../plugins/soloco/runtime/worker.mjs';
import * as historicalStorage from './fixtures/record-storage-v0610.mjs';
import {DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL,DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL,developmentDeliverySnapshotValue} from '../plugins/soloco/runtime/development-delivery.mjs';

const hash=value=>digest(JSON.stringify(value));
const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-development-delivery-'))),oldData=process.env.COMPANY_PLUGIN_DATA;
process.env.COMPANY_PLUGIN_DATA=path.join(home,'isolated-registry');
test.after(()=>{if(oldData===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=oldData;fs.rmSync(home,{recursive:true,force:true});});
const read=a=>withStore(a.root,db=>db.read());
const change=(a,fn)=>withStore(a.root,db=>db.transaction('controlled.delivery-fixture',s=>{fn(s);return s;}));
const ref=value=>({id:value.id,revision:value.revision??null,sha256:hash(value)});
const contact=name=>({host:'codex',session_id:'controlled-'+name,name});
function setup({normalized=false,layoutVersion}={}){
 const root=fs.mkdtempSync(path.join(home,'company-')),a={root,session_id:id('owner'),epoch:1};engine.bind(root,a.session_id,'codex');engine.open({...a,idea:'Controlled delivery evidence fixture'},'codex');
 fs.writeFileSync(path.join(root,'value.mjs'),'export const value=0;\n');
 fs.writeFileSync(path.join(root,'value.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {value} from './value.mjs';test('value',()=>assert.equal(value,42));\n");
 change(a,s=>{s.records.dependency={id:'dependency',kind:'artifact',revision:1,status:'Submitted',content:'Complete dependency body 🌍 and interface contract.'};});
 if(normalized)withStore(root,db=>db.migrate());
 if(layoutVersion)withStore(root,db=>{historicalStorage.migrateNormalized(db.db,db.dir);if(layoutVersion>=3)db.db.exec("ALTER TABLE state_entries ADD COLUMN encoding TEXT NOT NULL DEFAULT 'json'");db.db.prepare('UPDATE company_layout SET version=? WHERE id=1').run(layoutVersion);});return a;
}
function contract(a,extra={}){return {protocol:DEVELOPMENT_DELIVERY_CONTRACT_PROTOCOL,interfaces:[{id:'value-interface',description:'Export value=42; preserve the complete test.\nNo external effects.',paths:['value.mjs','value.test.mjs']}],dependency_refs:[ref(read(a).records.dependency)],required_test_roots:['value.test.mjs'],integrator:contact('integrator'),observer:contact('observer'),installer:contact('installer'),...extra};}
function plan(a,extra={}){return engine.develop({...a,action:'plan',model_data_approved:true,read_paths:['value.mjs','value.test.mjs'],write_paths:['value.mjs'],test_paths:['value.test.mjs'],max_attempts:2,timeout_ms:3000,max_output_bytes:10000,max_bytes:20000,expires_at:new Date(Date.now()+3600000).toISOString(),acceptance:'Complete local candidate exports42.',stop_conditions:'No network, installs, integration or unspecified files.',data_policy:'Only selected source and declared complete dependencies.',source_instruction:'Prepare bounded local source and retained delivery evidence.',delivery_contract:contract(a),...extra},'codex');}
const authorize=(a,p)=>engine.develop({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,model_data_approved:true,source_instruction:'Authorize exact local scope, source and complete delivery contract.'},'codex');
function queue(a,{role='engineer',plan_id,review_id}={}){const key=id('controlled-job'),instance=id(role);change(a,s=>{const target=s.records[review_id],j={id:key,role,instance_id:instance,session_key:instance,host:'codex',epoch:a.epoch,status:'queued',native_id:null,created_at:new Date().toISOString(),context_format:3,task:'Controlled complete source delivery and independent judgement.',inputs:[],review_of:target?{id:target.id,revision:target.revision}:null,...(plan_id?{development_id:plan_id}:{})};developmentAssignment(s,j,true,a.root);const context=assignmentContext(s,j);s.jobs[key]={...j,inputs:context.inputs,context_sha256:context.hash};s.sessions[instance]={instance_id:instance,role,host:'codex',native_id:null};});return key;}
async function candidate(a,p){const key=queue(a,{plan_id:p.id});await work(a.root,key,async(_h,_n,prompt)=>{assert.match(prompt,/development-delivery-contract-v1/);assert.match(prompt,/Complete dependency body/);return {native_id:'controlled-engineer-'+key,text:JSON.stringify({content:'Controlled specialist candidate; no actual native execution.',files:[{path:'value.mjs',content:'export const value=42;\n'}],messages:[],notices:[]})};});const s=read(a);assert.equal(s.jobs[key].status,'completed',JSON.stringify(s.jobs[key]));return s.records[s.jobs[key].artifact_id];}
async function receipt(a,p,c){const queued=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex');const deadline=Date.now()+20000;while(Date.now()<deadline){const s=read(a),j=s.jobs[queued.id];if(!['queued','running'].includes(j.status)){assert.equal(j.status,'completed',JSON.stringify(j));const result=s.records[j.artifact_id];assert.equal(result.development.result.status,'passed',JSON.stringify(result.development.result));return result;}await new Promise(r=>setTimeout(r,20));}throw Error('Controlled test worker did not complete');}
async function review(a,t,{verdict='Pass',native}={}){const key=queue(a,{role:'qa',review_id:t.id});await work(a.root,key,async(_h,_n,prompt)=>{assert.match(prompt,/actual runtime test receipt/);assert.match(prompt,/development-delivery-contract-v1/);return {native_id:native??'controlled-qa-'+key,text:JSON.stringify({content:'Controlled independent judgement; not actual native QA qualification.',messages:[],notices:[],review:{verdict,reason:'Controlled exact-source and canonical local test assessment.',permitted_action:verdict==='Pass'?'accept_local_development':'hold',candidate_sha256:t.development.candidate_sha256,receipt_sha256:t.development.receipt_sha256,blockers:verdict==='Pass'?[]:['Retained actual blocker.']}})};});const s=read(a);return s.records[s.jobs[key].artifact_id]??s.jobs[key];}
const accept=(a,p,t,r)=>engine.develop({...a,action:'accept',plan_id:p.id,receipt_id:t.id,review_id:r.id,receipt_sha256:t.development.receipt_sha256},'codex');
const inspect=(a,p,t,action='delivery_inspect')=>engine.develop({...a,action,plan_id:p.id,receipt_id:t.id},'codex');
async function ready(options){const a=setup(options),p=await plan(a,options?.planExtra??{});await authorize(a,p);const c=await candidate(a,p),t=await receipt(a,p,c),r=await review(a,t);return {a,p,c,t,r};}
async function accepted(options){const f=await ready(options),before=read(f.a),acceptance=await accept(f.a,f.p,f.t,f.r);return {...f,before,acceptance};}
function transition(a,p,t,inspection,extra={}){return {...a,action:'delivery_transition',plan_id:p.id,receipt_id:t.id,report_sha256:inspection.report_sha256,expected_handoff_sha256:inspection.handoff_sha256,transition_id:id('controlled-transition'),to_stage:'integrator',reported_outcome:'completed',evidence_refs:[ref(read(a).records.dependency)],source_instruction:'Record an attributable operator handoff observation only; no external action authority.',...extra};}

test('optional complete contract is frozen into scope and binds exact dependencies/source/candidate policy',async()=>{
 const a=setup(),input=contract(a),p=await plan(a),s=read(a),c=p.development.scope.delivery_contract;
 assert.equal(p.development.scope_sha256,hash(p.development.scope));assert.equal(c.source_snapshot_sha256,hash(p.development.scope.sources));assert.equal(c.candidate_snapshot.candidate_sha256,null);assert.deepEqual(c.candidate_snapshot.paths,['value.mjs','value.test.mjs']);assert.equal(c.independent_qa.required,true);assert.equal(c.source_integration,false);
 assert.deepEqual(c.dependency_snapshots[0].record,s.records.dependency);assert.equal(c.dependency_snapshots[0].reference.sha256,hash(s.records.dependency));
 input.interfaces[0].description='caller mutation';assert.notEqual(read(a).records[p.id].development.scope.delivery_contract.interfaces[0].description,input.interfaces[0].description);
 await assert.rejects(engine.develop({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,delivery_contract:contract(a)},'codex'),/only when creating/);
 for(const patch of [{required_test_roots:['value.mjs']},{interfaces:[{id:'outside',description:'outside',paths:['private.txt']}]},{dependency_refs:[{...ref(s.records.dependency),sha256:digest('wrong')}]},{source_integration:true}])await assert.rejects(plan(a,{delivery_contract:contract(a,patch)}));
});

test('dependency mutation or deletion holds authorization and reserved work without expanding scope',async()=>{
 for(const remove of [false,true]){const a=setup(),p=await plan(a);change(a,s=>{if(remove)delete s.records.dependency;else s.records.dependency.content+=' changed';});await assert.rejects(authorize(a,p),/missing or changed/);assert.equal(read(a).records[p.id].development.authorization,undefined);}
 const a=setup(),p=await plan(a);await authorize(a,p);change(a,s=>{s.records.dependency.revision++;});assert.throws(()=>queue(a,{plan_id:p.id}),/missing or changed/);assert.deepEqual(read(a).records[p.id].development.attempts,[]);
});

test('missing versus explicit-null dependency revision remains in exact frozen JSON',async()=>{
 for(const present of [false,true]){const a=setup();change(a,s=>{delete s.records.dependency.revision;if(present)s.records.dependency.revision=null;});const p=await plan(a),binding=p.development.scope.delivery_contract.dependency_snapshots[0];assert.equal(binding.reference.revision,null);assert.equal(binding.reference.revision_present,present);assert.equal(Object.hasOwn(binding.record,'revision'),present);change(a,s=>{if(present)delete s.records.dependency.revision;else s.records.dependency.revision=null;});await assert.rejects(authorize(a,p),/missing or changed/);}
});

test('actual guarded local acceptance alone creates one immutable preimage-bound report',async()=>{
 const {a,p,c,t,r,before,acceptance}=await accepted(),s=read(a),report=acceptance.report;
 assert.equal(report.protocol,DEVELOPMENT_ACCEPTANCE_REPORT_PROTOCOL);assert.equal(acceptance.report_sha256,hash(report));assert.equal(report.receipt_before_acceptance.sha256,hash(before.records[t.id]));
 assert.deepEqual(developmentDeliverySnapshotValue(s,report.receipt_before_acceptance),before.records[t.id]);assert.equal(developmentDeliverySnapshotValue(s,report.receipt_before_acceptance).development.acceptance,undefined);assert.equal(report.candidate_snapshot_sha256,c.development.candidate_sha256);assert.equal(report.qa_record.sha256,hash(before.records[r.id]));
 assert.deepEqual(developmentDeliverySnapshotValue(s,report.test_evidence.validation_manifest),before.records[t.id].development.validation_manifest);assert.equal(report.native_identities.qa.native_id,before.jobs[r.job_id].native_id);assert.notEqual(report.native_identities.qa.native_id,report.native_identities.candidate.native_id);
 assert.equal(report.qa_evidence.original_process_journal,'held','controlled legacy model output has only a requested journal; it supplies no actual CLI birth/closure proof');assert.equal(report.source_integration,false);assert.equal(report.external_actions_authorized,false);assert.equal(s.records[t.id].development.delivery,undefined);
 const observed=await inspect(a,p,t,'acceptance_report');assert.equal(observed.status,'observed');assert.equal(observed.report_sha256,acceptance.report_sha256);assert.equal(observed.current_receiver.stage,'owner');assert.equal(observed.contacts_authenticated,false);
 const prior=read(a);await assert.rejects(accept(a,p,t,r));assert.deepEqual(read(a),prior,'replayed acceptance cannot append a report');
});

test('normalized acceptance retains native immutable snapshot handles without changing evidence',async()=>{
 const {a,t,before,acceptance,p}=await accepted({normalized:true}),s=read(a),captured=acceptance.report.receipt_before_acceptance;
 assert.ok(captured.snapshot.immutable_snapshot);assert.deepEqual(developmentDeliverySnapshotValue(s,captured),before.records[t.id]);assert.equal((await inspect(a,p,t,'acceptance_report')).report_sha256,acceptance.report_sha256);
});

test('genuine historical normalized layouts preserve acceptance without requiring migration',async()=>{
 for(const layoutVersion of [1,2,3]){const {a,p,t,acceptance,before}=await accepted({layoutVersion}),s=read(a),capture=acceptance.report.receipt_before_acceptance;
  assert.equal(withStore(a.root,db=>db.storageInfo().format),'normalized-v'+layoutVersion);assert.deepEqual(developmentDeliverySnapshotValue(s,capture),before.records[t.id]);assert.equal(Boolean(capture.snapshot.immutable_snapshot),layoutVersion>=2);assert.equal((await inspect(a,p,t,'acceptance_report')).report_sha256,acceptance.report_sha256);assert.equal(withStore(a.root,db=>db.storageInfo().format),'normalized-v'+layoutVersion);
 }
});

test('rehashed outer reports cannot hide tampered inline or immutable-vault preimage bindings',async()=>{
 for(const normalized of [false,true]){const {a,p,t}=await accepted({normalized});change(a,s=>{const d=s.records[t.id].development.acceptance;d.report.qa_record.sha256=digest('wrong preimage');d.report_sha256=hash(d.report);});await assert.rejects(inspect(a,p,t,'acceptance_report'),/captured acceptance input changed/);}
});

test('individually valid capture swaps cannot rewrite accepted QA or candidate lineage',async()=>{
 for(const normalized of [false,true]){const f=await ready({normalized}),other=await review(f.a,f.t);await accept(f.a,f.p,f.t,other);change(f.a,s=>{const d=s.records[f.t.id].development.acceptance;d.report.qa_record=structuredClone(d.report.retained_history.records.find(v=>v.id===f.r.id));d.report.qa_job=structuredClone(d.report.retained_history.jobs.find(v=>v.id===f.r.job_id));d.report_sha256=hash(d.report);});await assert.rejects(inspect(f.a,f.p,f.t,'acceptance_report'),/QA record\/job\/subject/);}
});

test('large complete reports return bounded exact receipt handles instead of truncated source',async()=>{
 const a=setup(),spec=contract(a,{interfaces:Array.from({length:5},(_,i)=>({id:'complete-interface-'+i,description:'z'.repeat(10000),paths:['value.mjs']}))}),p=await plan(a,{delivery_contract:spec});await authorize(a,p);const c=await candidate(a,p),t=await receipt(a,p,c),r=await review(a,t),acceptance=await accept(a,p,t,r),result=await inspect(a,p,t,'acceptance_report');
 assert.equal(result.report,null);assert.equal(result.report_inline,false);assert.equal(result.report_source.sha256,acceptance.report_sha256);assert.deepEqual(result.report_source.path_in_record,['development','acceptance','report']);assert.equal(result.report_source.record.sha256,hash(read(a).records[t.id]));assert.ok(Buffer.byteLength(JSON.stringify(result))<30000);assert.equal(developmentDeliverySnapshotValue(read(a),acceptance.report.plan_preimage).development.scope.delivery_contract.interfaces[4].description.length,10000);
});

test('held/unaccepted and legacy accepted receipts do not acquire fabricated reports',async()=>{
 const {a,p,t,r}=await ready(),before=read(a);assert.equal((await inspect(a,p,t,'acceptance_report')).reason,'not_locally_accepted');assert.deepEqual(read(a),before);
 await assert.rejects(engine.develop({...a,action:'accept',plan_id:p.id,receipt_id:t.id,review_id:r.id,receipt_sha256:digest('wrong')},'codex'),/mismatch/);assert.equal(read(a).records[t.id].development.acceptance,undefined);
 change(a,s=>{s.records[t.id].development.acceptance={at:new Date().toISOString(),review_id:r.id,candidate_sha256:t.development.candidate_sha256,receipt_sha256:t.development.receipt_sha256,directory:'controlled-historical',source_integrated:false};});
 const legacyBefore=read(a),legacy=await inspect(a,p,t,'acceptance_report');assert.equal(legacy.reason,'legacy_acceptance_report_unavailable');assert.deepEqual(read(a),legacyBefore);await assert.rejects(engine.develop(transition(a,p,t,{report_sha256:digest('invented'),handoff_sha256:digest('invented')}),'codex'),/unavailable/);assert.deepEqual(read(a),legacyBefore);
});

test('changed declared dependency holds actual acceptance without discarding executed tests or QA',async()=>{
 const {a,p,t,r}=await ready();change(a,s=>{s.records.dependency.content+=' changed after QA';});await assert.rejects(accept(a,p,t,r),/missing or changed/);const s=read(a);assert.equal(s.records[t.id].development.acceptance,undefined);assert.equal(s.records[t.id].development.result.status,'passed');assert.equal(s.records[r.id].review.verdict,'Pass');
});

test('negative QA and reviewer reuse remain holds and cannot create acceptance reports',async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);const c=await candidate(a,p),t=await receipt(a,p,c),bad=await review(a,t,{verdict:'Fail'});await assert.rejects(accept(a,p,t,bad),/QA Pass/);assert.equal(read(a).records[t.id].development.acceptance,undefined);
 const later=await review(a,t);await assert.rejects(accept(a,p,t,later),/failed\/blocked/);assert.equal(read(a).records[bad.id].review.verdict,'Fail');assert.equal(read(a).records[t.id].development.acceptance,undefined);
 const b=await ready();change(b.a,s=>{s.jobs[b.r.job_id].native_id=s.jobs[b.c.job_id].native_id;});await assert.rejects(accept(b.a,b.p,b.t,b.r),/QA Pass/);assert.equal(read(b.a).records[b.t.id].development.acceptance,undefined);
});

test('handoff CAS/order/evidence/owner checks hold and exact replay appends nothing',async()=>{
 const {a,p,t,acceptance}=await accepted(),initial=await inspect(a,p,t),request=transition(a,p,t,initial);
 for(const extra of [{to_stage:'installer'},{expected_handoff_sha256:digest('stale')},{report_sha256:digest('wrong')},{evidence_refs:[]},{evidence_refs:[{...request.evidence_refs[0],sha256:digest('wrong')}]},{epoch:a.epoch+1},{session_id:'not-owner'},{source_integration:true}]){const before=read(a);await assert.rejects(async()=>engine.develop({...request,...extra},'codex'));assert.deepEqual(read(a),before);}
 const result=await engine.develop(request,'codex');assert.equal(result.status,'observed');assert.equal(result.current_receiver.stage,'integrator');assert.equal(result.transition.attribution,'operator-reported');assert.equal(result.transition.authenticated_external_producer,false);assert.equal(result.source_integration,false);assert.deepEqual(read(a).records[t.id].development.acceptance,acceptance,'progress never mutates immutable acceptance');
 const before=read(a),replay=await engine.develop(request,'codex');assert.equal(replay.replayed,true);assert.deepEqual(read(a),before);await assert.rejects(engine.develop({...request,source_instruction:'Changed same-id request'},'codex'),/replay changed/);assert.deepEqual(read(a),before);
 const next=transition(a,p,t,result,{to_stage:'installer'}),installer=await engine.develop(next,'codex');assert.equal(installer.current_receiver.stage,'installer');assert.equal(installer.transition.from.stage,'integrator');assert.equal(installer.handoff.transitions.length,2);assert.equal(installer.handoff.transitions[1].previous_handoff_sha256,result.handoff_sha256);assert.equal(installer.external_actions_authorized,false);
});

test('failed/unknown observations preserve receiver, expiry and uncertain claims',async()=>{
 const {a,p,t}=await accepted();change(a,s=>{s.records[p.id].development.scope.expires_at='2000-01-01T00:00:00.000Z';s.jobs.uncertain={id:'uncertain',status:'failed',started_at:'2000-01-01T00:00:00.000Z',coordination:{resources:['exclusive-test']}};});
 for(const [reported_outcome,status] of [['unknown','unobserved'],['failed','held']]){const before=read(a),current=await inspect(a,p,t),result=await engine.develop(transition(a,p,t,current,{reported_outcome,evidence_refs:[]}), 'codex');assert.equal(result.status,status);assert.equal(result.current_receiver.stage,'owner');assert.deepEqual(read(a).jobs.uncertain,before.jobs.uncertain);assert.equal(read(a).records[p.id].development.scope.expires_at,'2000-01-01T00:00:00.000Z');assert.equal(result.external_actions_authorized,false);const request=transition(a,p,t,result,{reported_outcome,evidence_refs:[]});await engine.develop(request,'codex');const replayBefore=read(a),replay=await engine.develop(request,'codex');assert.equal(replay.status,status);assert.deepEqual(read(a),replayBefore);}
});

test('report inspection is historical while changed acceptance inputs and transition chains are rejected',async()=>{
 const {a,p,t,acceptance}=await accepted();change(a,s=>{s.records[p.id].content+=' Later progress is outside the retained acceptance preimage.';});assert.equal((await inspect(a,p,t,'acceptance_report')).report_sha256,acceptance.report_sha256);
 const request=transition(a,p,t,await inspect(a,p,t));await engine.develop(request,'codex');change(a,s=>{s.records[t.id].development.delivery.transitions[0].to.stage='installer';});await assert.rejects(inspect(a,p,t),/transition|progress/);
 const b=await accepted();change(b.a,s=>{s.records[b.t.id].development.result.stdout+=' altered old receipt';});await assert.rejects(inspect(b.a,b.p,b.t,'acceptance_report'),/pre-acceptance/);
});
