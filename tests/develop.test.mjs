import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { id, withStore, digest, installedTeam, teamHash, Store } from '../plugins/soloco/runtime/store.mjs';
import * as engine from '../plugins/soloco/runtime/engine.mjs';
import { developmentAssignment, developmentCapability, executeDevelopmentTest, validTestExecution } from '../plugins/soloco/runtime/develop.mjs';
import { validationManifest } from '../plugins/soloco/runtime/validation-cache.mjs';
import { sandboxCapability } from '../plugins/soloco/runtime/local-sandbox.mjs';
import { assignmentContext, contextMatches } from '../plugins/soloco/runtime/context.mjs';
import {captureScopedPlan,scopedPlanView} from '../plugins/soloco/runtime/scoped-context.mjs';
import {resolveSnapshot,inheritSnapshots} from '../plugins/soloco/runtime/snapshot.mjs';
import { recordReference } from '../plugins/soloco/runtime/current-state.mjs';
import { work } from '../plugins/soloco/runtime/worker.mjs';
import { call, toolList } from '../plugins/soloco/runtime/main.mjs';
import { testFixtureIdentity } from '../plugins/soloco/runtime/test-fixtures.mjs';

// Immutable published contract from 7adf94a8cf0943143fad5f83f3c2c4bda3a4a142:SPEC.md.
const v018Governance=fs.readFileSync(new URL('./fixtures/governance-v018.md',import.meta.url),'utf8');
assert.equal(digest(v018Governance),'185933ddeafe9709bef44e9a6605ba7adb5faaa8bc43c1c64f1da3b03ae5f400');
// Immutable published contract from 64bd2eb:SPEC.md.
const v019Governance=fs.readFileSync(new URL('./fixtures/governance-v019.md',import.meta.url),'utf8');
assert.equal(digest(v019Governance),'d79b73676543ab053ea5ce7e456364f68700d0340d47c852a83bc97308f6a422');
// Immutable v0.20 contract from 4038e0f:SPEC.md, identical to published a260eb8.
const v020Governance=fs.readFileSync(new URL('./fixtures/governance-v020.md',import.meta.url),'utf8');
assert.equal(digest(v020Governance),'28f99838abc3794da94f97f7a2d234554811da3aef7b8ddb3742075caa78ec36');

const base=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-development-test-'));
process.env.COMPANY_PLUGIN_DATA=path.join(base,'cache');
test.after(()=>fs.rmSync(base,{recursive:true,force:true}));
const capability=sandboxCapability();
const live={skip:capability.supported?false:capability.blocker};
const read=a=>withStore(a.root,db=>db.read());
function setup(host='codex') {
  const root=fs.mkdtempSync(path.join(base,'company-'));
  const a={root,session_id:id('founder'),epoch:1};
  engine.bind(root,a.session_id,host);engine.open({...a,idea:'Bounded repair of existing local source'},host);
  fs.writeFileSync(path.join(root,'sum.mjs'),'export const sum = values => 0;\n');
  fs.writeFileSync(path.join(root,'private.txt'),'NOT_AUTHORIZED');
  return a;
}
const good=[{path:'sum.mjs',content:'export const sum = values => values.reduce((a,b)=>a+b,0);\n'},
  {path:'sum.test.mjs',content:"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {sum} from './sum.mjs';\ntest('sum',()=>assert.equal(sum([1,2,3]),6));\n"}];
function plan(a,extra={}) {
  return engine.develop({...a,action:'plan',model_data_approved:true,read_paths:['sum.mjs'],write_paths:['sum.mjs','sum.test.mjs'],test_paths:['sum.test.mjs'],
    acceptance:'A retained candidate adds numbers correctly, without changing original source.',stop_conditions:'Stop for network, new services, undeclared files or exhausted repair limit.',
    data_policy:'Only declared source may be supplied to the configured model host; private.txt stays excluded.',source_instruction:'Inspect sum.mjs and prepare the shown local candidate scope.',
    max_attempts:3,timeout_ms:3000,max_output_bytes:10000,max_bytes:20000,expires_at:new Date(Date.now()+60000).toISOString(),...extra},'codex');
}
function authorize(a,p,extra={}) {
  return engine.develop({...a,action:'authorize',plan_id:p.id,scope_sha256:p.development.scope_sha256,model_data_approved:true,source_instruction:'Approve this exact local development scope and source sharing for up to three bounded attempts.',...extra},'codex');
}
function queue(a,{role='engineer',development_id,review_of,context_format,context_scope,evidence_ids=[]}={}) {
  const jobId=id('job'),instance=id(role);
  withStore(a.root,db=>db.transaction('test.queue',s=>{
    const target=s.records[review_of];
    const j={id:jobId,role,instance_id:instance,session_key:instance,host:s.owner.host,native_id:null,epoch:s.owner.epoch,status:'queued',task:'Honor supplied development scope',inputs:[],review_of:target?{id:target.id,revision:target.revision}:null,...(development_id?{development_id}:{}),...(context_format?{context_format}:{}),...(context_scope?{context_scope}:{}),...(evidence_ids.length?{supplemental_sources:evidence_ids.map(key=>recordReference(s.records[key]))}:{}),created_at:new Date().toISOString()};
    developmentAssignment(s,j,true,a.root);const context=assignmentContext(s,j);
    s.jobs[jobId]={...j,inputs:context.inputs,context_sha256:context.hash};
    s.sessions[instance]={instance_id:instance,role,host:s.owner.host,native_id:null};return s;
  }));return jobId;
}
const output=(extra={},native=id('native'))=>({native_id:native,text:JSON.stringify({content:'Attributable development candidate or independent assessment',messages:[],notices:[],...extra})});
async function generate(a,p,{files=good,extra={},during,context_format}={}) {
  const j=queue(a,{development_id:p.id,context_format});
  await work(a.root,j,async(_host,_native,prompt)=>{
    assert.match(prompt,/Bounded local development candidate/);
    if(p.development.scope.output_format==='patches') {assert.match(prompt,/\"patches\":\[/);assert.doesNotMatch(prompt,/\"files\":\[\{\"path\":\"permitted non-fixture/);}
    assert.ok(!prompt.includes('NOT_AUTHORIZED'));
    if(during)await during();return output({files,...extra});
  });
  const s=read(a);return s.records[s.jobs[j].artifact_id]??s.jobs[j];
}
async function waitJob(a,id,timeout=15000) {
  const until=Date.now()+timeout;
  while(Date.now()<until) {
    const s=read(a),j=s.jobs[id];if(!['queued','running'].includes(j.status))return {job:j,receipt:s.records[j.artifact_id]};
    await new Promise(r=>setTimeout(r,30));
  }
  assert.fail(`Local test worker did not finish: ${id}`);
}
async function waitQuarantinedReceipt(a,jobId,candidate,timeout=30000) {
  const until=Date.now()+timeout;let s;
  do {
    s=read(a);const job=s.jobs[jobId],receipt=s.records[job.artifact_id];
    // Pause/revoke may mark the job cancelled before the detached controller
    // publishes its outcome. Wait for that retained evidence, not terminal status.
    if(receipt) {
      assert.equal(job.status,'quarantined');assert.equal(receipt.status,'Quarantined');
      assert.equal(receipt.author_instance,jobId);assert.equal(receipt.author_role,'runtime');
      assert.equal(receipt.development.candidate_id,candidate.id);
      assert.equal(receipt.development.candidate_sha256,candidate.development.candidate_sha256);
      assert.deepEqual(JSON.parse(receipt.content),receipt.development.result,'retain the exact controller outcome');
      assert.equal(digest(receipt.content),receipt.development.receipt_sha256);
      assert.deepEqual(s.records[candidate.id].development.run,{job_id:jobId,status:'quarantined',receipt_id:receipt.id});
      assert.notEqual(receipt.development.result.status,'passed');
      assert.equal(receipt.development.acceptance,undefined);
      assert.ok(s.notices.some(n=>n.reference===receipt.id));
      return receipt;
    }
    await new Promise(r=>setTimeout(r,30));
  }while(Date.now()<until);
  assert.fail(`Local controller did not retain a quarantined receipt: ${JSON.stringify(s.jobs[jobId])}`);
}
async function run(a,p,c) {
  const j=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex');
  assert.equal(j.kind,'development_test');const ended=await waitJob(a,j.id);
  assert.ok(ended.receipt,JSON.stringify(ended.job));return ended.receipt;
}
async function review(a,receipt,{verdict='Pass',extra={},native,notices=[]}={}) {
  const j=queue(a,{role:'qa',review_of:receipt.id});
  await work(a.root,j,async(_host,_native,prompt)=>{
    assert.match(prompt,/actual runtime test receipt/);
    assert.ok(prompt.includes(receipt.development.candidate_id));
    return output({notices,review:{verdict,reason:'Checked exact source, scope and recorded test evidence',permitted_action:verdict==='Pass'?'accept_local_development':'hold',candidate_sha256:receipt.development.candidate_sha256,receipt_sha256:receipt.development.receipt_sha256,blockers:verdict==='Pass'?[]:['Needs repair'],...extra}},native);
  });
  const s=read(a);return s.records[s.jobs[j].artifact_id]??s.jobs[j];
}
function accept(a,p,t,r,extra={}) {return engine.develop({...a,action:'accept',plan_id:p.id,receipt_id:t.id,review_id:r.id,receipt_sha256:t.development.receipt_sha256,...extra},'codex');}

function supplemental(a) {
  return engine.save({...a,kind:'artifact',content:'Required supplemental behavior: sum all supplied numbers.'},'codex');
}
function amendSupplemental(a,source) {
  return engine.save({...a,id:source.id,expected_revision:source.revision,kind:'artifact',content:'Changed required behavior: sum only positive supplied numbers.'},'codex');
}
async function generateWithSupplemental(a,p,source,{retrieve=true,files=good}={}) {
  const ref=recordReference(source),native=id('native');
  const key=queue(a,{development_id:p.id,context_format:3,context_scope:p.id,evidence_ids:[source.id]});
  let calls=0;
  await work(a.root,key,async(_host,session,prompt)=>{
    calls++;
    if(retrieve&&calls===1)return {native_id:native,text:JSON.stringify({reads:[{id:ref.id,sha256:ref.sha256,offset:0,length:JSON.stringify(source).length}]})};
    if(retrieve){assert.equal(session,native);assert.match(prompt,/record-reads-v1/);assert.ok(prompt.includes(source.content));}
    return output({files,notices:[{kind:'must_know',summary:'Generation used the exact supplemental behavior.'}]},native);
  });
  const state=read(a),job=state.jobs[key],candidate=state.records[job.artifact_id];
  assert.equal(job.status,'completed',JSON.stringify(job));assert.equal(candidate.status,'Submitted');
  assert.deepEqual(job.supplemental_sources,[ref]);
  assert.equal(job.retrieved_inputs?.length??0,retrieve?1:0);
  assert.ok(!job.inputs.some(input=>input.id===source.id),'supplement is outside the governing/full input revisions');
  return candidate;
}

test('fresh QA cannot accept a passing candidate after its declared or retrieved supplemental evidence changes',live,async()=>{
  for(const retrieve of [false,true]) {
    const a=setup(),source=supplemental(a),p=await plan(a);await authorize(a,p);
    const c=await generateWithSupplemental(a,p,source,{retrieve}),t=await run(a,p,c);
    assert.equal(t.status,'Submitted');assert.equal(t.development.result.status,'passed');assert.equal(t.development.result.tests_executed,true);
    amendSupplemental(a,source);
    const r=await review(a,t),state=read(a),qaJob=state.jobs[r.job_id];
    assert.equal(r.status,'Submitted');assert.equal(r.review.verdict,'Pass');assert.equal(contextMatches(state,qaJob,qaJob.context_sha256),true);
    await assert.rejects(accept(a,p,t,r),/stale/);
    assert.deepEqual(read(a).records[t.id],t,'retain the original executed receipt unchanged');
    assert.equal(read(a).records[t.id].development.acceptance,undefined);
  }
});

test('changed supplemental evidence blocks test admission without consuming a test attempt',live,async()=>{
  for(const retrieve of [false,true]) {
    const a=setup(),source=supplemental(a),p=await plan(a);await authorize(a,p);
    const c=await generateWithSupplemental(a,p,source,{retrieve});amendSupplemental(a,source);
    await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex'),/stale/);
    const state=read(a);assert.equal(state.records[c.id].development.run,undefined);
    assert.ok(!Object.values(state.jobs).some(job=>job.kind==='development_test'));
    assert.equal(fs.existsSync(path.join(a.root,'.company','development')),false);
  }
});

test('unchanged retrieved evidence survives unrelated classified updates and generation/review notices',live,async()=>{
  const a=setup(),source=supplemental(a),p=await plan(a);await authorize(a,p);
  const c=await generateWithSupplemental(a,p,source);
  // Apply a real independently reviewed classification before testing. The new
  // decision belongs to another scope, so it changes neither this grant nor pack.
  const other=engine.save({...a,kind:'decision',content:'Unrelated fictional project must use blue icons.'},'codex');
  const classification=engine.contextControl({...a,action:'plan',record_ids:[other.id],disposition:'current',scopes:['other-project'],source_instruction:'Classify this exact decision for the other project.'},'codex');
  const key=queue(a,{role:'qa',review_of:classification.id,context_format:3});
  await work(a.root,key,async()=>output({review:{verdict:'Pass',reason:'This exact decision applies only to the other project.',permitted_action:'apply_context_classification',plan_sha256:digest(JSON.stringify(classification.context_classification_plan)),blockers:[]}}));
  const classificationReview=read(a).jobs[key].artifact_id;
  engine.contextControl({...a,action:'apply',plan_id:classification.id,review_id:classificationReview,source_instruction:'Apply the exact independently reviewed project scope.'},'codex');
  const t=await run(a,p,c);assert.equal(t.development.result.status,'passed');
  const r=await review(a,t,{notices:[{kind:'must_know',summary:'QA accepts only this retained local candidate.'}]});
  const accepted=await accept(a,p,t,r);assert.equal(accepted.source_integrated,false);
  assert.deepEqual(read(a).records[source.id],source);
  assert.ok(read(a).notices.some(n=>n.reference===c.id));assert.ok(read(a).notices.some(n=>n.reference===r.id));
});

test('supplemental mutation during native tests aborts and quarantines the retained outcome',live,async()=>{
  const a=setup(),source=supplemental(a),p=await plan(a,{timeout_ms:10000});await authorize(a,p);
  const files=[good[0],{path:'sum.test.mjs',content:"import test from 'node:test';import fs from 'node:fs';import path from 'node:path';test('slow supplemental fixture',async()=>{fs.writeFileSync(path.join(process.env.HOME,'started'),'1');await new Promise(r=>setTimeout(r,5000));});"}];
  const c=await generateWithSupplemental(a,p,source,{files});
  const job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex');
  const marker=path.join(a.root,'.company','development',p.id,c.id,'source','.scratch','started'),until=Date.now()+10000;
  while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  assert.ok(fs.existsSync(marker),'actual isolated tests reached the running fixture');
  assert.equal(read(a).jobs[job.id].status,'running');amendSupplemental(a,source);
  const ended=await waitJob(a,job.id),t=ended.receipt;
  assert.ok(t,JSON.stringify(ended.job));assert.equal(ended.job.status,'quarantined');assert.equal(t.status,'Quarantined');
  assert.notEqual(t.development.result.status,'passed');assert.equal(t.development.acceptance,undefined);
  assert.ok(read(a).notices.some(n=>n.reference===t.id));
  const r=await review(a,t);assert.equal(r.review.verdict,'Pass');
  await assert.rejects(accept(a,p,t,r),/runtime test receipt/);
});

test('qualified exact reuse cannot bypass the new candidate supplemental bindings',live,async()=>{
  const a=setup(),source=supplemental(a),p=await plan(a);await authorize(a,p);
  const first=await generate(a,p,{context_format:2}),original=await run(a,p,first);
  assert.equal(original.development.result.status,'passed');
  const qualification=await review(a,original,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:original.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});
  await accept(a,p,original,qualification);
  const retainedOriginal=read(a).records[original.id];
  const second=await generateWithSupplemental(a,p,source),changed=amendSupplemental(a,source);
  await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:second.id,reuse_receipt_id:original.id},'codex'),/stale/);
  assert.equal(read(a).records[second.id].development.run,undefined);
  const third=await generateWithSupplemental(a,p,changed);
  const job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:third.id,reuse_receipt_id:original.id},'codex');
  const ended=await waitJob(a,job.id),reused=ended.receipt;
  assert.ok(reused,JSON.stringify(ended.job));assert.equal(reused.status,'Submitted');
  assert.equal(reused.development.result.status,'passed');assert.equal(reused.development.result.reused,true);
  assert.equal(reused.development.result.tests_executed,false);assert.equal(reused.development.reused_from,original.id);
  amendSupplemental(a,changed);
  const r=await review(a,reused);assert.equal(r.review.verdict,'Pass');
  await assert.rejects(accept(a,p,reused,r),/stale/);
  assert.deepEqual(read(a).records[original.id],retainedOriginal);
  assert.deepEqual(read(a).records[reused.id],reused);
});

test('supplemental candidates retain failed evidence and permit fresh bounded repair',live,async()=>{
  const a=setup(),source=supplemental(a),p=await plan(a);await authorize(a,p);
  const broken=await generateWithSupplemental(a,p,source,{files:[{...good[0],content:'export const sum = values => 0;\n'},good[1]]});
  const failed=await run(a,p,broken);assert.equal(failed.development.result.status,'failed');
  const negative=await review(a,failed,{verdict:'Fail'});assert.equal(negative.status,'Submitted');
  const repaired=await generateWithSupplemental(a,p,source),passed=await run(a,p,repaired);
  assert.equal(passed.development.result.status,'passed');
  const qa=await review(a,passed,{notices:[{kind:'must_know',summary:'QA accepts this repair and retains the earlier failure.'}]});
  await accept(a,p,passed,qa);
  const state=read(a);assert.deepEqual(state.records[failed.id],failed);assert.deepEqual(state.records[negative.id],negative);
  assert.equal(state.records[p.id].development.attempts.length,2);
});

test('development capability fails closed without a supported sandbox, and MCP preserves binding',async()=>{
  const a=setup(),status=engine.status(a,'codex');
  assert.equal(status.capabilities.local_development.supported,capability.supported);
  if(!capability.supported) {
    assert.ok(status.capabilities.local_development.blocker);
    await assert.rejects(plan(a));assert.equal(Object.keys(read(a).records).length,0);
  }
  await assert.rejects(call('company_develop',{...a,session_id:'unbound',action:'inspect'},'codex'),/binding/);
  await assert.rejects(call('company_develop',{...a,action:'execute'},'codex'),/Invalid action/);
  await assert.rejects(call('company_develop',{...a,action:'inspect',command:'anything'},'codex'),/Unknown argument/);
});
const transferFixture={protocol:'scratch-fixture-contract-v1',factory:'p5-transfer-two-real-links-v1'};
test('MCP exposes a closed plan-only fixture selector and rejects caller paths before touching company state',async()=>{
  const schema=toolList.find(t=>t.name==='company_develop').inputSchema.properties.test_fixture;
  assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['protocol','factory']);
  const a={root:'/fixture-never-opened',session_id:'not-bound',epoch:1};
  for(const value of [null,undefined,[],{}, {...transferFixture,path:'/outside'}, {...transferFixture,target:'/outside'}, {...transferFixture,command:'run'}, {...transferFixture,content:'bytes'}, {...transferFixture,factory:'arbitrary'}, {...transferFixture,protocol:'other'}])await assert.rejects(call('company_develop',{...a,action:'plan',test_fixture:value},'codex'),/fixture|Fixture|selector|object|protocol|factory|fields/i);
  for(const action of ['inspect','authorize','run','accept','revoke'])await assert.rejects(call('company_develop',{...a,action,test_fixture:transferFixture},'codex'),/only.*plan/);
});
test('execution evidence cannot lose its planned fixture binding or be relabeled as legacy or reused',()=>{
  const identity=testFixtureIdentity(transferFixture),manifest=validationManifest({files:[{path:'check.test.mjs',sha256:digest('fixture test')}],tests:['check.test.mjs'],command:['node','--test','./check.test.mjs'],runtime:{node:'fixture-node',platform:'darwin',arch:'arm64',os_release:'fixture-os',system_build:'fixture-build',dependencies:[{path:'/fictional/library',sha256:digest('library')}],executable_sha256:digest('node'),runner_sha256:digest('runner')},sandbox:{backend:'fixture-backend',policy_sha256:digest('policy')},environment:{LANG:'C'},limits:{timeout_ms:1000,max_output_bytes:10000},test_fixture:identity,fixture_environment:{SOLOCO_TEST_FIXTURE_MANIFEST:{scratch_relative:'fixtures/manifest.json'},SOLOCO_TEST_FIXTURE_MANIFEST_SHA256:{runtime_result:'test_fixture.setup.manifest_sha256'}}});
  // Synthetic records exercise binding validation only; no test execution is claimed.
  const state={records:{plan:{development:{scope:{test_fixture:identity}}}}},receipt={development:{plan_id:'plan',validation_fingerprint:manifest.validation_fingerprint,validation_manifest:manifest,result:{tests_executed:true,validation_manifest_sha256:digest(JSON.stringify(manifest)),test_fixture:{identity,setup:{prepared_before_child:true,manifest_sha256:digest('manifest'),child_environment_sha256:digest('environment')},termination_confirmed:true,cleanup:{status:'confirmed'}}}}};
  assert.equal(validTestExecution(state,receipt),true);
  const stripped=structuredClone(receipt);delete stripped.development.validation_manifest;delete stripped.development.result.validation_manifest_sha256;delete stripped.development.result.test_fixture;assert.equal(validTestExecution(state,stripped),false);
  assert.equal(validTestExecution({records:{plan:{development:{scope:{}}}}},receipt),false);
  const reused=structuredClone(receipt);reused.development.reused_from='old';assert.equal(validTestExecution(state,reused),false);
  const changed=structuredClone(state);changed.records.plan.development.scope.test_fixture.template_sha256=digest('changed');assert.equal(validTestExecution(changed,receipt),false);
});
test('fixture static identity is part of the exact scope before authorization and cannot be replaced by caller identity',live,async()=>{
  const a=setup(),expires_at=new Date(Date.now()+60000).toISOString(),plain=await plan(a,{expires_at}),p=await plan(a,{expires_at,test_fixture:transferFixture});
  const identity=testFixtureIdentity(transferFixture);assert.deepEqual(p.development.scope.test_fixture,identity);
  assert.equal(identity.factory_source_sha256,digest(fs.readFileSync(new URL('../plugins/soloco/runtime/test-fixtures.mjs',import.meta.url),'utf8')));
  assert.deepEqual(p.development.scope,{...plain.development.scope,test_fixture:identity});assert.notEqual(p.development.scope_sha256,plain.development.scope_sha256);
  assert.equal(p.development.authorization,undefined);assert.equal(Object.hasOwn(plain.development.scope,'test_fixture'),false);
  withStore(a.root,db=>db.transaction('test.tamper_fixture_identity',s=>{const x=s.records[p.id];x.development.scope.test_fixture.template_sha256=digest('wrong template');x.development.scope_sha256=digest(JSON.stringify(x.development.scope));return s;}));
  const changed=read(a).records[p.id];await assert.rejects(authorize(a,changed),/fixture|Fixture|identity|template|changed|match/i);
  assert.equal(read(a).records[p.id].development.authorization,undefined);
});
test('actual fixture execution propagates planned identity and result-bound setup, while reuse and run-time selectors remain forbidden',live,async()=>{
  const a=setup(),p=await plan(a,{test_fixture:transferFixture});await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c);
  assert.equal(t.development.result.status,'passed',JSON.stringify(t.development.result));
  assert.deepEqual(t.development.result.test_fixture.identity,p.development.scope.test_fixture);
  assert.equal(t.development.result.test_fixture.setup.prepared_before_child,true);
  assert.match(t.development.result.test_fixture.setup.manifest_sha256,/^[a-f0-9]{64}$/);assert.match(t.development.result.test_fixture.setup.child_environment_sha256,/^[a-f0-9]{64}$/);
  assert.equal(t.development.validation_manifest.version,2);assert.deepEqual(t.development.validation_manifest.test_fixture,p.development.scope.test_fixture);
  assert.equal(t.development.validation_manifest.fixture_environment.SOLOCO_TEST_FIXTURE_MANIFEST_SHA256.runtime_result,'test_fixture.setup.manifest_sha256');
  const next=await generate(a,p);await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:next.id,reuse_receipt_id:t.id},'codex'),/fixture.*reuse|reuse.*fixture/i);
  assert.equal(read(a).records[next.id].development.run,undefined);
  await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:next.id,test_fixture:transferFixture},'codex'),/only.*plan/);
  assert.equal(read(a).records[next.id].development.run,undefined);
});
test('installed development capability does not silently authorize older teams or modified governance',live,()=>{
  const team=installedTeam();assert.match(team.governance,/v0\.21/);
  assert.equal(developmentCapability(team).eligible,true);
  for(const changed of [{...team,plugin_version:'0.4.1'},{...team,governance_sha256:digest('changed rules')}])assert.equal(developmentCapability(changed).eligible,false);
});
for(const version of ['0.7.6','0.7.7'])test(`retained v${version} team can authorize a new fixed fixture without adopting current runtime definitions`,live,async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.retain_compatible_development_team',s=>{
    s.plugin_version=version;s.runtime_version=version;s.cos_instructions=`Retained v${version} company instructions`;s.team_sha256=teamHash(s);return s;
  }));
  const pinned=read(a);assert.equal(developmentCapability(pinned,a.root).eligible,true);
  assert.equal(developmentCapability({...pinned,plugin_version:version+'-unqualified'},a.root).eligible,false);
  const opened=engine.open(a,'codex');assert.equal(opened.capabilities.local_development.eligible,true);assert.deepEqual(read(a),pinned);
  const p=await plan(a,{test_fixture:transferFixture});await authorize(a,p);
  assert.deepEqual(p.development.scope.test_fixture,testFixtureIdentity(transferFixture));
  const authorized=read(a),grant=authorized.records[p.id].development.authorization.decision_id,candidate=await generate(a,p),after=read(a);
  assert.equal(candidate.status,'Submitted');assert.equal(candidate.development.scope_sha256,p.development.scope_sha256);
  for(const key of ['id','plugin_version','governance','governance_sha256','cos_instructions','team_sha256','roles','owner'])assert.deepEqual(after[key],pinned[key]);
  assert.deepEqual(after.records[grant],authorized.records[grant]);assert.equal(after.upgrade,undefined);
  assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');assert.equal(fs.existsSync(path.join(a.root,'sum.test.mjs')),false);
});
for(const version of ['0.5.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.7.1','0.7.2','0.7.3','0.7.4'])test(`pinned v${version} preserves authorized development and original source after a runtime update`,live,async()=>{
  const a=setup();withStore(a.root,db=>db.transaction('test.pin_compatible_development',s=>{
    s.governance=v018Governance;s.governance_sha256=digest(s.governance);s.plugin_version=version;s.runtime_version=version;s.cos_instructions=`Pinned v${version} development instructions`;s.team_sha256=teamHash(s);return s;
  }));
  const p=await plan(a);await authorize(a,p);
  withStore(a.root,db=>db.transaction('test.pin_scope_producer',s=>{s.runtime_version=version;return s;}));
  const before=read(a);
  const resumed=engine.open(a,'codex');assert.equal(resumed.capabilities.local_development.eligible,true);
  assert.deepEqual(read(a),before);
  assert.deepEqual(before.records[p.id].development.attempts,[]);
  const candidate=await generate(a,p);assert.equal(candidate.status,'Submitted');
  const after=read(a);
  for(const key of ['id','plugin_version','governance','governance_sha256','cos_instructions','team_sha256','owner'])assert.deepEqual(after[key],before[key]);
  // Dispatch reserves one attempt; every other scope and authorization field stays pinned.
  assert.deepEqual(after.records[p.id].development.attempts,[candidate.job_id]);
  assert.equal(after.jobs[candidate.job_id].development_id,p.id);
  assert.equal(after.jobs[candidate.job_id].status,'completed');
  assert.deepEqual(after.records[p.id],{...before.records[p.id],development:{...before.records[p.id].development,attempts:[candidate.job_id]}});
  const grant=before.records[p.id].development.authorization.decision_id;
  assert.deepEqual(after.records[grant],before.records[grant]);
  assert.equal(after.upgrade,undefined);
  assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');
  assert.equal(fs.existsSync(path.join(a.root,'sum.test.mjs')),false);
  assert.equal(fs.readFileSync(path.join(a.root,'private.txt'),'utf8'),'NOT_AUTHORIZED');
});
for(const [version,governance,pluginVersion=installedTeam().plugin_version] of [['0.19',v019Governance],['0.20',v020Governance,'0.7.5']])test(`v${version} development candidate preparation preserves pinned company state and authority`,live,async()=>{
  const a=setup();
  withStore(a.root,db=>db.transaction('test.pin_governance',s=>{
    s.plugin_version=pluginVersion;s.runtime_version=pluginVersion;
    s.governance=governance;s.governance_sha256=digest(s.governance);
    s.cos_instructions=`Original pinned v${version} instructions`;s.team_sha256=teamHash(s);return s;
  }));
  const pinned=read(a);engine.open(a,'codex');assert.deepEqual(read(a),pinned,'Opening must preserve the old producer and adopted definitions');
  engine.notify({...a,kind:'must_know',summary:'Retain this development constraint.'},'codex');
  const p=await plan(a);await authorize(a,p);const before=read(a);
  engine.open(a,'codex');assert.deepEqual(read(a),before);
  const c=await generate(a,p),after=read(a);assert.equal(c.status,'Submitted');
  for(const key of ['id','plugin_version','governance','governance_sha256','cos_instructions','team_sha256','owner','paused','notices'])
    assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.records[p.id].development.authorization,before.records[p.id].development.authorization);
  assert.deepEqual(after.records[before.records[p.id].development.authorization.decision_id],before.records[before.records[p.id].development.authorization.decision_id]);
  assert.equal(after.upgrade,undefined);
  for(const [key,record] of Object.entries(before.records))
    assert.deepEqual(after.records[key],key===p.id?{...record,development:{...record.development,attempts:[c.job_id]}}:record);
});

test('an actual isolated edit-test-review loop retains usable candidate and leaves original source untouched',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const before=read(a),c=await generate(a,p);assert.equal(c.status,'Submitted');
  const t=await run(a,p,c);assert.equal(t.development.result.status,'passed',JSON.stringify(t.development.result));assert.equal(t.development.result.exit_code,0);
  const r=await review(a,t),accepted=await accept(a,p,t,r);
  assert.equal(accepted.source_integrated,false);
  for(const f of good)assert.equal(fs.readFileSync(path.join(accepted.directory,f.path),'utf8'),f.content);
  assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');
  assert.equal(fs.existsSync(path.join(a.root,'sum.test.mjs')),false);assert.equal(fs.readFileSync(path.join(a.root,'private.txt'),'utf8'),'NOT_AUTHORIZED');
  assert.equal(read(a).id,before.id);assert.equal(read(a).mode,'preparation');
  assert.notEqual(read(a).jobs[c.job_id].native_id,read(a).jobs[r.job_id].native_id);
  await assert.rejects(accept(a,p,t,r));
});
test('scope needs exact authorization and explicit source-sharing consent, not a draft decision',live,async()=>{
  const a=setup(),p=await plan(a);
  engine.save({...a,kind:'decision',content:'Approved'},'codex');
  assert.throws(()=>queue(a,{development_id:p.id}),/authorization/);
  await assert.rejects(authorize(a,p,{model_data_approved:false}),/sharing/);
  await assert.rejects(authorize(a,p,{scope_sha256:'wrong'}),/exact scope/);
  const granted=await authorize(a,p);assert.ok(granted.development.authorization);
  await assert.rejects(authorize(a,p),/already decided/);
});
test('scopes reject undeclared reads, traversal, hidden files, symlinks, collisions and unbounded work',live,async()=>{
  const a=setup();
  const invalid=[{read_paths:['missing.mjs']},{read_paths:['../private.txt']},{read_paths:['.company/company.sqlite']},{write_paths:['../sum.mjs']},{write_paths:['AGENTS.md']},{write_paths:['SUM.mjs','sum.mjs']},{write_paths:['a','a/b']},{read_paths:[]},{test_paths:['absent.test.mjs']},{max_attempts:11},{timeout_ms:120001},{max_bytes:999},{expires_at:'2000-01-01'}];
  for(const extra of invalid)await assert.rejects(plan(a,extra),undefined,JSON.stringify(extra));
  fs.symlinkSync(path.join(a.root,'sum.mjs'),path.join(a.root,'link.mjs'));
  await assert.rejects(plan(a,{read_paths:['sum.mjs','link.mjs']}),/linked/);
  assert.deepEqual(Object.keys(read(a).records),[]);
});
test('source mutation and new-path collision invalidate the displayed scope before authorization',live,async()=>{
  for(const collision of [false,true]) {
    const a=setup(),p=await plan(a);
    fs.writeFileSync(path.join(a.root,collision?'sum.test.mjs':'sum.mjs'),'changed');
    await assert.rejects(authorize(a,p),/source changed|now exists/);
  }
});
test('development records are immutable through the generic record tool',live,async()=>{
  const a=setup(),p=await plan(a);
  assert.throws(()=>engine.save({...a,id:p.id,kind:'artifact',expected_revision:1,content:'No limits'},'codex'),/immutable/);
});
test('workers reject missing, additional and oversized generated paths without modifying source',live,async()=>{
  for(const files of [good.slice(0,1),[...good,{path:'private.txt',content:'changed'}],good.map(f=>({...f,content:'x'.repeat(15000)}))]) {
    const a=setup(),p=await plan(a);await authorize(a,p);const result=await generate(a,p,{files});
    assert.equal(result.status,'failed');assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');
  }
});
test('a failed test and independent failed review permit bounded repair under the same standing grant',live,async()=>{
  const a=setup(),p=await plan(a,{max_attempts:2});await authorize(a,p);
  const bad=await generate(a,p,{files:good.map(f=>f.path==='sum.mjs'?{...f,content:'export const sum = values => 9;\n'}:f)}),failed=await run(a,p,bad);
  assert.notEqual(failed.development.result.status,'passed');const rejection=await review(a,failed,{verdict:'Fail'});
  assert.equal(rejection.review.verdict,'Fail');await assert.rejects(accept(a,p,failed,rejection),/passing runtime/);
  const repaired=await generate(a,p),passed=await run(a,p,repaired),qa=await review(a,passed),accepted=await accept(a,p,passed,qa);
  assert.equal(accepted.source_integrated,false);assert.equal(read(a).records[failed.id].development.result.status,failed.development.result.status);
  assert.equal(read(a).records[rejection.id].review.verdict,'Fail');
  assert.throws(()=>queue(a,{development_id:p.id}),/attempt limit/);
});
test('model-written test claims cannot replace the actual runtime receipt',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p,{extra:{tests_executed:true,result:{status:'passed',exit_code:0},development:{type:'test'}}});
  assert.equal(c.development.type,'candidate');assert.equal(c.development.result,undefined);
  await assert.rejects(engine.develop({...a,action:'accept',plan_id:p.id,receipt_id:c.id,review_id:'invented',receipt_sha256:'invented'},'codex'),/runtime test receipt/);
});
test('acceptance rejects wrong receipt hash, wrong action and reviewer reuse of the author native session',live,async()=>{
  for(const kind of ['receipt','action','native']) {
    const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c);
    const qa=await review(a,t,{...(kind==='action'?{extra:{permitted_action:'anything'}}:{}),...(kind==='native'?{native:read(a).jobs[c.job_id].native_id}:{})});
    if(kind==='native'){
      assert.equal(qa.status,'failed');assert.match(qa.error,/independent native identity/);
      assert.equal(qa.artifact_id,undefined);assert.match(qa.rejected_output.text,/Checked exact source/);
    }
    await assert.rejects(accept(a,p,t,qa,kind==='receipt'?{receipt_sha256:'different'}:{}),/mismatch|QA Pass/);
  }
});
test('candidate tampering after test execution cannot inherit a passing review',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c),r=await review(a,t);
  const f=path.join(t.development.result.directory,'sum.mjs');fs.chmodSync(f,0o600);fs.writeFileSync(f,'tampered');
  await assert.rejects(accept(a,p,t,r),/bytes changed/);
});
test('a test attempt is never repeated on the same candidate and expired grants cannot dispatch',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p);await run(a,p,c);
  await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex'),/already has a test attempt/);
  const b=setup(),expiring=await plan(b,{expires_at:new Date(Date.now()+1000).toISOString()});await authorize(b,expiring);
  await new Promise(r=>setTimeout(r,1100));assert.throws(()=>queue(b,{development_id:expiring.id}),/expired/);
});
test('pause or revoke during an active test aborts it and retains a quarantined outcome',live,async()=>{
  for(const action of ['pause','revoke']) {
    const a=setup(),p=await plan(a,{timeout_ms:10000});await authorize(a,p);
    const c=await generate(a,p,{files:good.map(f=>f.path==='sum.test.mjs'?{...f,content:"import test from 'node:test';\ntest('slow',async()=>new Promise(r=>setTimeout(r,8000)));\n"}:f)});
    const j=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex');
    const until=Date.now()+5000;while(read(a).jobs[j.id].status==='queued'&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
    assert.equal(read(a).jobs[j.id].status,'running');
    if(action==='pause')engine.control({...a,action:'pause',expected_epoch:1,source_instruction:'Pause local work now'},'codex');
    else await engine.develop({...a,action:'revoke',plan_id:p.id,source_instruction:'Revoke local development scope'},'codex');
    await waitQuarantinedReceipt(a,j.id,c);
  }
});
test('source changes and handover prevent acceptance without erasing prior evidence',live,async()=>{
  for(const change of ['source','handover']) {
    const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c),r=await review(a,t);
    if(change==='source')fs.writeFileSync(path.join(a.root,'sum.mjs'),'changed');
    else {
      withStore(a.root,db=>db.migrate());
      engine.control({...a,action:'handover',expected_epoch:1,source_instruction:'Replace coordinator'},'codex');
    }
    await assert.rejects(accept(a,p,t,r));assert.ok(read(a).records[t.id]);assert.ok(read(a).records[r.id]);
  }
});

test('stdio MCP remains responsive to founder pause while a detached test runs',live,async()=>{
  const a=setup(),p=await plan(a,{timeout_ms:10000});await authorize(a,p);
  const c=await generate(a,p,{files:good.map(f=>f.path==='sum.test.mjs'?{...f,content:"import test from 'node:test';\ntest('slow',async()=>new Promise(r=>setTimeout(r,8000)));\n"}:f)});
  const server=spawn(process.execPath,['--no-warnings',fileURLToPath(new URL('../plugins/soloco/runtime/main.mjs',import.meta.url)),'serve','codex'],{stdio:['pipe','pipe','pipe'],env:process.env});
  const pending=new Map();let buffer='',sequence=0;
  server.stdout.on('data',chunk=>{
    buffer+=chunk;while(buffer.includes('\n')){
      const end=buffer.indexOf('\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+1);
      if(!line.trim())continue;
      const message=JSON.parse(line),entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);entry.resolve(message);}
    }
  });
  const request=(method,params)=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP response timed out'));},3000);
    pending.set(id,{resolve,timer});server.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
  const tool=async(name,args)=>{
    const response=await request('tools/call',{name,arguments:args});assert.ok(!response.error,JSON.stringify(response));
    assert.ok(!response.result.isError,JSON.stringify(response));return JSON.parse(response.result.content[0].text);
  };
  try {
    await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}});
    const j=await tool('company_develop',{...a,action:'run',plan_id:p.id,candidate_id:c.id});
    const until=Date.now()+5000;while(read(a).jobs[j.id].status==='queued'&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
    assert.equal(read(a).jobs[j.id].status,'running');
    const {epoch,...identity}=a;
    const paused=await tool('company_control',{...identity,action:'pause',expected_epoch:epoch,source_instruction:'Pause tests now'});
    assert.equal(paused.paused,true);
    await waitQuarantinedReceipt(a,j.id,c);
  } finally {server.kill('SIGTERM');for(const entry of pending.values())clearTimeout(entry.timer);}
});

test('a candidate and its QA review may emit valid notices without invalidating their own outputs',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p,{extra:{notices:[{kind:'must_know',summary:'The candidate adds the requested tests; inspect their assumptions.'}]}});
  assert.equal(c.status,'Submitted');
  const t=await run(a,p,c);assert.equal(t.development.result.status,'passed');
  const r=await review(a,t,{notices:[{kind:'must_know',summary:'QA accepts only the bounded candidate; integration remains separate.'}]});
  const accepted=await accept(a,p,t,r);assert.equal(accepted.source_integrated,false);
  const notices=read(a).notices;assert.equal(notices.length,2);
  assert.ok(notices.some(n=>n.reference===c.id));assert.ok(notices.some(n=>n.reference===r.id));
  assert.ok(notices.every(n=>n.resolution===null));
});
test('local test dispatch shares the global three-active-job limit',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p);
  withStore(a.root,db=>db.transaction('test.capacity',s=>{
    for(let i=0;i<3;i++){const key=id('busy');s.jobs[key]={id:key,role:'pm',status:'running',created_at:new Date().toISOString()};}return s;
  }));
  await assert.rejects(engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex'),/Three|three|limit|active/i);
  assert.equal(read(a).records[c.id].development.run,undefined);
});
test('receipt acceptance verifies runtime provenance and completed execution, not payload hash alone',live,async()=>{
  for(const corrupt of ['author','job']) {
    const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),t=await run(a,p,c);
    withStore(a.root,db=>db.transaction('test.corrupt_receipt',s=>{
      if(corrupt==='author')s.records[t.id].author_role='engineer';
      else s.jobs[s.records[c.id].development.run.job_id].status='failed';
      return s;
    }));
    const r=await review(a,read(a).records[t.id]);
    await assert.rejects(accept(a,p,t,r),/runtime|receipt|execution|provenance/i);
  }
});

test('source-sharing consent precedes file inspection; planning review grants no execution authority',live,async()=>{
  const a=setup();
  for(const value of [false,undefined])await assert.rejects(plan(a,{model_data_approved:value,read_paths:['missing-secret.mjs']}),/sharing|authoriz|consent|approve/i);
  assert.equal(Object.keys(read(a).records).length,0);
  const p=await plan(a);
  const j=queue(a,{role:'qa',review_of:p.id});
  assert.equal(read(a).jobs[j].status,'queued');
  assert.throws(()=>queue(a,{development_id:p.id}),/authorization/);
});

test('a new external notice referencing a QA artifact still invalidates that earlier review',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p),t=await run(a,p,c),r=await review(a,t);
  assert.equal(r.review.verdict,'Pass');
  const n=engine.notify({...a,kind:'must_know',summary:'New evidence requires reconsidering this review.',reference:r.id},'codex');
  assert.equal(n.reference,r.id);assert.equal(n.job_id,undefined);
  await assert.rejects(accept(a,p,t,r),/fresh independent QA Pass|stale/);
  assert.ok(read(a).notices.some(x=>x.id===n.id&&x.resolution===null));
});

test('a generic-only QA Pass stays inspectable but cannot accept; a complete fresh review can',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const c=await generate(a,p),t=await run(a,p,c);
  const j=queue(a,{role:'qa',review_of:t.id});
  let responseExample;
  await work(a.root,j,async(_host,_native,prompt)=>{
    responseExample=prompt.slice(prompt.lastIndexOf('Return one JSON object only:'));
    return output({review:{verdict:'Pass',reason:'Generic assessment without action or evidence identifiers'}});
  });
  const state=read(a),incomplete=state.records[state.jobs[j].artifact_id];
  assert.equal(incomplete.status,'Submitted');assert.deepEqual(Object.keys(incomplete.review).sort(),['reason','verdict']);
  await assert.rejects(accept(a,p,t,incomplete),/fresh independent QA Pass/);
  assert.equal(read(a).records[incomplete.id].review.verdict,'Pass');
  for(const field of ['permitted_action','candidate_sha256','receipt_sha256','blockers'])assert.match(responseExample,new RegExp('"'+field+'"\\s*:'));
  assert.ok(responseExample.includes(t.development.candidate_sha256));assert.ok(responseExample.includes(t.development.receipt_sha256));
  const complete=await review(a,t),accepted=await accept(a,p,t,complete);
  assert.equal(accepted.review_id,complete.id);assert.equal(accepted.source_integrated,false);
  assert.ok(read(a).records[incomplete.id]);assert.notEqual(complete.job_id,incomplete.job_id);
});

test('exact published development compatibility retains sandbox and team restrictions',()=>{
  for(const governance of [v018Governance,v019Governance,v020Governance,installedTeam().governance])
  for(const plugin_version of ['0.5.0','0.6.0','0.6.1','0.6.2','0.6.3','0.6.4','0.6.5','0.6.6','0.6.7','0.7.1','0.7.2','0.7.3','0.7.4','0.7.7',installedTeam().plugin_version]) {
    const s={...installedTeam(),plugin_version,governance,governance_sha256:digest(governance)};
    const before=structuredClone(s),c=developmentCapability(s);
    assert.equal(c.eligible,capability.supported);
    assert.equal(c.blocker,capability.supported?null:capability.blocker);
    assert.deepEqual(s,before);
    for(const changed of [{...s,plugin_version:'0.4.1'},{...s,plugin_version:'99.0.0'},{...s,governance_sha256:digest(governance+'modified')},{...s,governance_sha256:digest('Unknown rules')}])
      assert.equal(developmentCapability(changed).eligible,false);
  }
});

test('base-bound patches reconstruct a large complete candidate through real tests and independent acceptance',live,async()=>{
  const a=setup(),source=fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8')+'// fixture padding\n'.repeat(7500);
  fs.writeFileSync(path.join(a.root,'sum.mjs'),source);
  fs.writeFileSync(path.join(a.root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:400000}));
  const p=await plan(a,{max_bytes:300000,output_format:'patches'});await authorize(a,p);
  const at=source.indexOf('0;'),patches=[{path:'sum.mjs',base_sha256:digest(source),edits:[{start:at,end:at+1,text:'values.reduce((a,b)=>a+b,0)'}]},
    {path:'sum.test.mjs',base_sha256:null,content:good[1].content}];
  const c=await generate(a,p,{extra:{files:undefined,patches}});
  assert.equal(c.development.generation.format,'patches');
  assert.ok(c.development.generation.generated_bytes<1000);
  assert.ok(c.development.generation.candidate_bytes>100000);
  assert.equal(c.development.files.find(f=>f.path==='sum.mjs').content,source.replace('0;','values.reduce((a,b)=>a+b,0);'));
  const t=await run(a,p,c);assert.equal(t.development.result.status,'passed');
  const r=await review(a,t),accepted=await accept(a,p,t,r);
  assert.equal(accepted.source_integrated,false);
  assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),source);
  assert.equal(fs.existsSync(path.join(a.root,'sum.test.mjs')),false);
});

test('lowering configuration holds existing larger scopes and raising it never enlarges authorized bytes',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);
  const config=path.join(a.root,'.company','development.json');
  fs.writeFileSync(config,JSON.stringify({max_bytes_ceiling:1000}));
  assert.throws(()=>queue(a,{development_id:p.id}),/lowered/);
  fs.writeFileSync(config,JSON.stringify({max_bytes_ceiling:400000}));
  const c=await generate(a,p,{files:[{path:'sum.mjs',content:'x'.repeat(21000)},good[1]]});
  assert.equal(c.status,'failed');assert.match(c.error,/byte limit/);
  assert.equal(read(a).records[p.id].development.scope.max_bytes,20000);
});

test('patch shape, exact base and scope violations fail without creating a materialized candidate',live,async()=>{
  const a=setup(),p=await plan(a,{output_format:'patches'});await authorize(a,p);
  const source=p.development.scope.sources[0];
  for(const patches of [
    [{path:'sum.mjs',base_sha256:digest('stale'),edits:[]},{path:'sum.test.mjs',base_sha256:null,content:good[1].content}],
    [{path:'../escape',base_sha256:null,content:'bad'}],
    [{path:'sum.mjs',base_sha256:source.sha256,edits:[]}]
  ]) {const c=await generate(a,p,{extra:{files:undefined,patches}});assert.equal(c.status,'failed');}
  assert.equal(fs.existsSync(path.join(a.root,'.company','development')),false);
  assert.equal(fs.readFileSync(path.join(a.root,'sum.mjs'),'utf8'),'export const sum = values => 0;\n');
});

test('supported pure rename preserves a development grant but unknown decisions still revoke',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);const name=read(a).name;
 engine.control({...a,action:'rename',name:'Renamed Fixture',expected_name:name,expected_epoch:1,source_instruction:'Rename the company to Renamed Fixture'},'codex');
 const candidate=await generate(a,p);assert.equal(candidate.status,'Submitted');
 engine.save({...a,kind:'decision',content:'New unknown material condition'},'codex');
 assert.throws(()=>queue(a,{development_id:p.id}),/authority changed/);
});
test('actual qualified validation reuse retains original execution and still requires new independent QA',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);const first=await generate(a,p),receipt=await run(a,p,first);
 assert.equal(receipt.development.result.status,'passed');assert.ok(receipt.development.validation_fingerprint);
 const qa=await review(a,receipt,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:receipt.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});
 await accept(a,p,receipt,qa);
 const second=await generate(a,p);
 const job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:second.id,reuse_receipt_id:receipt.id},'codex');
 const ended=await waitJob(a,job.id),reuse=ended.receipt;
 assert.ok(reuse,JSON.stringify(ended.job));assert.equal(reuse.development.result.reused,true,JSON.stringify(reuse));assert.equal(reuse.development.result.tests_executed,false);
 assert.equal(reuse.development.reused_from,receipt.id);
 await assert.rejects(accept(a,p,reuse,qa),/review|QA/);
 const nextQa=await review(a,reuse);const accepted=await accept(a,p,reuse,nextQa);assert.equal(accepted.source_integrated,false);
 await review(a,receipt,{verdict:'Fail'});const third=await generate(a,p);
 const denied=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:third.id,reuse_receipt_id:receipt.id},'codex');const held=await waitJob(a,denied.id);assert.equal(held.job.status,'failed');assert.match(held.job.error,/negative review/);
});
test('qualified validation reuse requires the original QA job to own the exact review and target',live,async()=>{
 for(const corrupt of ['artifact','target','author','generation','generation-id','generation-closure','generation-role','candidate-role','candidate-status','candidate-bytes','controller-id','controller-candidate','reviewer-native-author-instance','author-native-reviewer-instance']) {
  const a=setup(),p=await plan(a);await authorize(a,p);const first=await generate(a,p),receipt=await run(a,p,first);
  const qa=await review(a,receipt,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:receipt.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});
  await accept(a,p,receipt,qa);
  withStore(a.root,db=>db.transaction('test.corrupt_reuse_qualification',s=>{
   const producer=s.jobs[qa.job_id];
   if(corrupt==='artifact')producer.artifact_id='another-review';
   if(corrupt==='target')producer.review_of={id:'another-receipt',revision:1};
   if(corrupt==='author')producer.instance_id='another-reviewer';
   if(corrupt==='generation')delete s.jobs[first.job_id];
   if(corrupt==='generation-id')s.jobs[first.job_id].id='another-generator';
   if(corrupt==='generation-closure')s.jobs[first.job_id].coordination_release.termination_confirmed=false;
   if(corrupt==='generation-role')s.jobs[first.job_id].role='qa';
   if(corrupt==='candidate-role')s.records[first.id].author_role='qa';
   if(corrupt==='candidate-status')s.records[first.id].status='Quarantined';
   if(corrupt==='candidate-bytes')s.records[first.id].development.files[0].content+='changed';
   if(corrupt==='controller-id')s.jobs[receipt.author_instance].id='another-controller';
   if(corrupt==='controller-candidate')s.jobs[receipt.author_instance].candidate_id='another-candidate';
   if(corrupt==='reviewer-native-author-instance')producer.native_id=s.jobs[first.job_id].instance_id;
   if(corrupt==='author-native-reviewer-instance')s.jobs[first.job_id].native_id=producer.instance_id;
   return s;
  }));
  const second=await generate(a,p),job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:second.id,reuse_receipt_id:receipt.id},'codex');
  const ended=await waitJob(a,job.id);
  assert.equal(ended.job.status,'failed',`Unbound ${corrupt} must hold instead of reusing validation`);
  assert.match(ended.job.error,/independent QA|qualification|provenance/);
  assert.equal(ended.receipt,undefined);
  assert.deepEqual(read(a).records[qa.id],qa,'Preserve the original qualification verbatim');
 }
});
test('reuse acceptance rechecks the exact qualification producer and native identity after reuse',live,async()=>{
 for(const corrupt of ['native','missing','closure','independence','author-native','missing-binding']) {
  const a=setup(),p=await plan(a);await authorize(a,p);const first=await generate(a,p),receipt=await run(a,p,first);
  const qa=await review(a,receipt,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:receipt.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});
  await accept(a,p,receipt,qa);
  const second=await generate(a,p),job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:second.id,reuse_receipt_id:receipt.id},'codex');
  const ended=await waitJob(a,job.id),reuse=ended.receipt;
  assert.equal(reuse?.development.result.reused,true,JSON.stringify(ended.job));
  withStore(a.root,db=>db.transaction('test.changed_reuse_producer',s=>{
   if(corrupt==='native')s.jobs[qa.job_id].native_id='substituted-native';
   if(corrupt==='missing')delete s.jobs[qa.job_id];
   if(corrupt==='closure')s.jobs[qa.job_id].coordination_release.termination_confirmed=false;
   if(corrupt==='independence')s.jobs[first.job_id].native_id=s.jobs[qa.job_id].native_id;
   if(corrupt==='author-native')s.jobs[first.job_id].native_id='substituted-author-native';
   if(corrupt==='missing-binding')delete s.records[reuse.id].development.reuse_candidate_producer;
   return s;
  }));
  const retainedReuse=read(a).records[reuse.id];
  const nextQa=await review(a,reuse);
  await assert.rejects(accept(a,p,reuse,nextQa),/valid passing runtime test receipt/);
  assert.deepEqual(read(a).records[qa.id],qa,'Changed job evidence does not rewrite the original judgment');
  assert.deepEqual(read(a).records[reuse.id],retainedReuse,'Held acceptance preserves the reuse receipt');
 }
});
test('reuse publication quarantines a source receipt changed at the writer fence',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);const first=await generate(a,p),receipt=await run(a,p,first);
 const qa=await review(a,receipt,{extra:{deterministic_validation:{permitted_action:'reuse_exact_validation',fingerprint:receipt.development.validation_fingerprint,dependencies_complete:true,external_state:false}}});
 await accept(a,p,receipt,qa);
 const second=await generate(a,p),jobId=id('publication-controller');
 // Reserve the ordinary fixture job without spawning a detached controller, so
 // the interleaving is deterministic in this process's real writer transaction.
 withStore(a.root,db=>db.transaction('test.reserve_reuse_publication',s=>{
  s.records[second.id].development.run={job_id:jobId,status:'queued'};
  s.jobs[jobId]={id:jobId,kind:'development_test',role:'engineer',development_id:p.id,candidate_id:second.id,epoch:a.epoch,session_id:a.session_id,host:'codex',reuse_receipt_id:receipt.id,status:'queued',created_at:new Date().toISOString(),inputs:[],native_id:null};
  return s;
 }));
 const original=Store.prototype.transaction;let changed=false,result;
 Store.prototype.transaction=function(type,fn,...rest){
  if(type==='development.test_finished')return original.call(this,type,s=>{changed=true;s.records[receipt.id].development.result.exit_code=9;return fn(s);},...rest);
  return original.call(this,type,fn,...rest);
 };
 try{result=await executeDevelopmentTest(a.root,jobId);}finally{Store.prototype.transaction=original;}
 assert.equal(changed,true);assert.equal(result.status,'Quarantined');assert.equal(result.development.result.reused,true);
 const state=read(a);assert.equal(state.jobs[jobId].status,'quarantined');assert.equal(state.records[second.id].development.run.status,'quarantined');
 assert.equal(state.records[receipt.id].development.result.exit_code,9,'Retain the changed evidence rather than rewriting the source');
 assert.deepEqual(state.records[qa.id],qa);assert.equal(result.development.acceptance,undefined);
});
test('unchanged-state polling still cancels generation at scope expiry',live,async()=>{
 const a=setup(),p=await plan(a,{expires_at:new Date(Date.now()+500).toISOString()});await authorize(a,p);
 const key=queue(a,{development_id:p.id});const started=Date.now();
 await work(a.root,key,async(_host,_native,_prompt,_dir,_timeout,_selection,options)=>{
  await new Promise(resolve=>{const timer=setTimeout(resolve,2500);options.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
  return output({files:good});
 });
 const current=read(a).jobs[key];assert.equal(current.status,'quarantined');assert.match(current.execution_failure.message,/expired/);assert.ok(Date.now()-started<2000);
});
test('unchanged database polling still cancels generation when external project ceiling is lowered',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);
 const key=queue(a,{development_id:p.id}),started=Date.now();
 await work(a.root,key,async(_host,_native,_prompt,_dir,_timeout,_selection,options)=>{
  fs.writeFileSync(path.join(a.root,'.company','development.json'),JSON.stringify({max_bytes_ceiling:1000}));
  await new Promise(resolve=>{const timer=setTimeout(resolve,2500);options.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});
  return output({files:good});
 });
 const current=read(a).jobs[key];assert.equal(current.status,'quarantined');assert.match(current.execution_failure.message,/ceiling.*lowered/);assert.ok(Date.now()-started<2000);
});
test('post-execution input tampering holds the receipt while retaining actual executed evidence',live,async()=>{
 const a=setup(),p=await plan(a);await authorize(a,p);
 const files=[good[0],{path:'sum.test.mjs',content:"import test from 'node:test';import fs from 'node:fs';import path from 'node:path';test('host race fixture',async()=>{fs.writeFileSync(path.join(process.env.HOME,'started'),'1');await new Promise(r=>setTimeout(r,500));});"}];
 const c=await generate(a,p,{files}),job=await engine.develop({...a,action:'run',plan_id:p.id,candidate_id:c.id},'codex');
 const directory=path.join(a.root,'.company','development',p.id,c.id,'source'),marker=path.join(directory,'.scratch','started'),until=Date.now()+10000;
 while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
 assert.ok(fs.existsSync(marker),'actual isolated test started');fs.chmodSync(path.join(directory,'sum.mjs'),0o600);fs.writeFileSync(path.join(directory,'sum.mjs'),'changed by authorized host fixture');
 const ended=await waitJob(a,job.id),result=ended.receipt.development.result;
 assert.equal(result.status,'failed');assert.equal(result.tests_executed,true);assert.match(result.error,/changed|mismatch/);assert.equal(ended.receipt.development.validation_fingerprint,undefined);
});


// Actual sandbox/controller-produced runtime receipt; generation alone uses the
// existing explicit model double. No invented runtime receipt or producer job.
test('scoped extraction binds actual development test controller, candidate and native producer closure',live,async()=>{
  const a=setup(),p=await plan(a);await authorize(a,p);const c=await generate(a,p),receipt=await run(a,p,c),state=read(a);
  assert.equal(receipt.job_id,undefined);assert.equal(receipt.author_instance,state.jobs[receipt.author_instance].id);
  assert.equal(receipt.development.result.tests_executed,true);assert.equal(receipt.development.result.status,'passed');
  const scoped=captureScopedPlan(state,{source_id:receipt.id}),capsule=resolveSnapshot(state,scoped.capsule),key='scoped-runtime-plan';state.records[key]={id:key,scoped_context_plan:scoped};
  assert.equal(capsule.producer.id,'job:'+receipt.author_instance);
  assert.ok(capsule.producer_closure.some(r=>r.id==='job:'+c.job_id));assert.ok(capsule.producer_closure.some(r=>r.id===c.id));
  assert.ok(scopedPlanView(state,{plan_id:key}).total_units>0);
  const unrelated=inheritSnapshots(state,structuredClone(state));unrelated.notices.push({id:'unrelated',summary:'Current unrelated notice.'});
  assert.equal(captureScopedPlan(unrelated,{source_id:receipt.id}).extraction_identity,scoped.extraction_identity);
  for(const change of [
    s=>s.jobs[receipt.author_instance].status='failed',s=>s.jobs[receipt.author_instance].artifact_id='other',
    s=>s.records[c.id].development.run.receipt_id='other',s=>s.jobs[c.job_id].native_id='other',
    s=>s.jobs[c.job_id].coordination_release.termination_confirmed=false,
    s=>s.jobs[receipt.author_instance].execution_failure={outcome:'unknown'},s=>s.records[p.id].development.revoked={at:'later'}
  ]){const copy=inheritSnapshots(state,structuredClone(state));change(copy);assert.throws(()=>scopedPlanView(copy,{plan_id:key}),/Scoped context hold/);}
  const broken=inheritSnapshots(state,structuredClone(state));delete broken.jobs[receipt.author_instance];assert.throws(()=>captureScopedPlan(broken,{source_id:receipt.id}),/source missing/);
});
