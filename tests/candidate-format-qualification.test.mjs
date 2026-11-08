import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runCase,contractModel,assess,sourceIdentity,verifySourceIdentity,captureSourceVerification,modelSelections,validateModelSelections} from '../tools/candidate-format-qualification.mjs';
import {verifyCase} from '../tools/verify-candidate-format-qualification.mjs';
import {read} from '../tools/workflow-runtime.mjs';
import {digest} from '../plugins/soloco/runtime/store.mjs';
import {sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';

const capability=sandboxCapability();
test('actual contract-double candidates accept; duplicated arms, negative reviews, call failures and changed bindings cannot pass assessment',{skip:capability.supported?false:capability.blocker},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-format-eval-test-'));process.env.COMPANY_PLUGIN_DATA=path.join(directory,'bindings');
  try{
    const cases=[],sharedBudget={calls:0},sourceManifest=sourceIdentity();
    for(const count of [1,3])for(const format of ['files','patches'])cases.push(await runCase({directory,count,format,sharedBudget,sourceManifest}));
    assert.equal(assess(cases).passed,true);assert.equal(sharedBudget.calls,8);
    for(const report of cases)assert.equal(verifyCase(report,read(report.root)).acceptance_verified,true);
    const mutations=[x=>x.splice(1,1,structuredClone(x[0])),x=>x[0].review.verdict='Blocked',x=>x[0].errors.push({message:'held'}),x=>x[0].calls[0].error={message:'uncertain'},x=>x[0].events.push({type:'held'}),x=>x[0].attempts[0].result.exit_code=1,x=>x[0].acceptance.receipt_sha256='wrong',x=>x[0].source_manifest_sha256='other',x=>x[0].fixture_sha256='other',x=>x[0].calls[0].requested.model='other'];
    for(const mutate of mutations){const copy=structuredClone(cases);mutate(copy);assert.equal(assess(copy).passed,false);}
    for(const mutate of [
      r=>r.review.verdict='Blocked',r=>r.generation.candidate_id='other',r=>r.generation.native_id='other',r=>r.calls[0].native_id='other',r=>r.calls[1].native_id='other',
      r=>r.scope_sha256='other',r=>r.format='patches',r=>r.attempts[0].receipt_id='other',r=>r.attempts[0].result.candidate_sha256='other',
      r=>r.attempts[0].result.tests_executed=false,r=>r.precheck.tests_executed=false,r=>r.acceptance.source_integrated=true
    ]){const copy=structuredClone(cases[0]);mutate(copy);assert.equal(verifyCase(copy,read(copy.root)).acceptance_verified,false);}
    const original=cases[0],canonical=read(original.root);
    for(const mutate of [
      s=>s.records[original.generation.candidate_id].author_instance='other',
      s=>s.records[original.attempts[0].receipt_id].author_instance='other',
      s=>s.records[original.review.id].author_instance='other',
      s=>s.records[original.attempts[0].receipt_id].development.acceptance.candidate_sha256='other',
      s=>s.jobs[original.calls[1].job_id].artifact_id='other'
    ]){const copy=structuredClone(canonical);mutate(copy);assert.equal(verifyCase(original,copy).acceptance_verified,false);}
    const planId=canonical.records[original.generation.candidate_id].development.plan_id,testJobId=original.attempts[0].test_job_id,reviewJobId=canonical.records[original.review.id].job_id;
    for(const [name,check,mutate] of [
      ['changed test scope','scope_integrity',s=>s.records[planId].development.scope.test_paths=['different.test.mjs']],
      ['test job candidate mismatch','runtime_test_provenance',s=>s.jobs[testJobId].candidate_id='another-candidate'],
      ['test job plan mismatch','runtime_test_provenance',s=>s.jobs[testJobId].development_id='another-plan'],
      ['review job receipt mismatch','review_job_binding',s=>s.jobs[reviewJobId].review_of.id='another-receipt'],
      ['review job receipt revision mismatch','review_job_binding',s=>s.jobs[reviewJobId].review_of.revision++],
      ['review job model mismatch','canonical_model_settings',s=>s.jobs[reviewJobId].model_selection.model='different'],
    ]){const copy=structuredClone(canonical);mutate(copy);const verified=verifyCase(original,copy);assert.equal(verified.acceptance_verified,false,name);assert.equal(verified.checks[check],false,name);}
    const contradictory=structuredClone(canonical),reported=structuredClone(original),receipt=contradictory.records[original.attempts[0].receipt_id];
    receipt.content=JSON.stringify({...receipt.development.result,status:'failed',exit_code:9});
    const changedHash=digest(receipt.content);receipt.development.receipt_sha256=changedHash;receipt.development.acceptance.receipt_sha256=changedHash;
    contradictory.records[original.review.id].review.receipt_sha256=changedHash;
    reported.attempts[0].receipt_sha256=changedHash;reported.review.receipt_sha256=changedHash;reported.acceptance.receipt_sha256=changedHash;
    const rejected=verifyCase(reported,contradictory);assert.equal(rejected.acceptance_verified,false,'Receipt text must match its executed result even when all downstream hashes agree');assert.equal(rejected.checks.receipt_hash,false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

// Historical contract-double outputs provide fixed report data for assessor
// regressions; this supplied synthetic manifest is not native source evidence.
const retainedCases=()=>JSON.parse(fs.readFileSync(new URL('../evals/issue18-accepted-formats-20261107/contract-original-report.json',import.meta.url),'utf8')).cases.map(c=>({...c,source_manifest_sha256:'1'.repeat(64)}));
test('assessor rejects missing identities, contradictory tests, unexecuted originals and repairs beyond the fixed protocol',()=>{
  assert.equal(assess(retainedCases()).passed,true);
  for(const mutate of [
    r=>delete r.calls[0].native_id,r=>r.calls[0].native_id='other',r=>delete r.review.native_id,r=>r.generation.native_id='other',r=>r.generation.candidate_id='other',r=>r.review.id='other',
    r=>r.attempts[0].result.candidate_sha256='0'.repeat(64),r=>r.precheck.tests_executed=false,r=>r.precheck.exit_code=null,r=>r.repairs=1,
    r=>r.generation.byte_accounting.format='patches',r=>r.acceptance.source_integrated=true,r=>r.elapsed_ms=0
  ]){const rows=retainedCases();mutate(rows[0]);const result=assess(rows);assert.equal(result.passed,false);assert.equal(result.critical_false_acceptances,1);}
  assert.equal(assess(null).passed,false);
});

test('candidate comparison holds source/runtime drift and failed fingerprint capture',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-format-source-drift-'));
  try{
    for(const name of ['plugins/soloco/fixture.mjs','SPEC.md','tools/candidate-format-qualification.mjs','tools/workflow-runtime.mjs','tools/verify-candidate-format-qualification.mjs','tests/candidate-format-qualification.test.mjs']){const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fictional source '+name);}
    const before=sourceIdentity(directory),capture=()=>sourceIdentity(directory),rows=retainedCases().map(c=>({...c,source_manifest_sha256:before.manifest_sha256}));
    const matched=captureSourceVerification(before,capture).verification;assert.equal(assess(rows,matched).passed,true);
    fs.appendFileSync(path.join(directory,'plugins/soloco/fixture.mjs'),' changed');
    const drift=captureSourceVerification(before,capture);assert.equal(drift.verification.status,'held');assert.equal(assess(rows,drift.verification).passed,false);
    fs.rmSync(path.join(directory,'tools/workflow-runtime.mjs'));assert.equal(captureSourceVerification(before,capture).verification.passed,false);
    const runtime=structuredClone(before);runtime.node.executable_sha256='0'.repeat(64);assert.equal(verifySourceIdentity(before,runtime).passed,false);
    const invalid=structuredClone(before);invalid.files[0].sha256='0'.repeat(64);assert.equal(verifySourceIdentity(invalid,invalid).passed,false);
    const unrelated=structuredClone(matched);unrelated.before_manifest_sha256='0'.repeat(64);assert.equal(assess(rows,unrelated).passed,false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('CLI stops the entire matrix after its first case when source changes in flight',{skip:capability.supported?false:capability.blocker},async()=>{
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'soloco-format-cli-drift-'))),source=fileURLToPath(new URL('../',import.meta.url)),output=path.join(directory,'result');
  let child,closed=false,ended;
  try{
    fs.cpSync(path.join(source,'plugins/soloco'),path.join(directory,'plugins/soloco'),{recursive:true});
    for(const name of ['SPEC.md','tools/candidate-format-qualification.mjs','tools/workflow-runtime.mjs','tools/verify-candidate-format-qualification.mjs','tests/candidate-format-qualification.test.mjs']){const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(source,name),file);}
    child=spawn(process.execPath,[path.join(directory,'tools/candidate-format-qualification.mjs'),'--contract-double',output],{cwd:directory,stdio:['ignore','pipe','pipe']});
    let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
    ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{closed=true;resolve(code);});});
    const declared=path.join(output,'predeclared-protocol.json'),until=Date.now()+5000;
    while(!fs.existsSync(declared)&&!closed&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(fs.existsSync(declared),true,logs);
    fs.appendFileSync(path.join(directory,'SPEC.md'),'\nInjected fictional source drift.\n');
    assert.equal(await ended,1,logs);
    const report=JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8'));
    assert.equal(report.cases.length,1,'No later file-count or format may start after source drift');
    assert.equal(report.source_verification.status,'held');assert.equal(report.assessment.passed,false);
  }finally{if(child&&!closed){child.kill('SIGTERM');await ended;}fs.rmSync(directory,{recursive:true,force:true});}
});

test('exact fixture mismatch and independent QA hold retain output without acceptance or retry',{skip:capability.supported?false:capability.blocker},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-format-holds-test-'));process.env.COMPANY_PLUGIN_DATA=path.join(directory,'bindings');
  try{
    const bad=await runCase({directory:path.join(directory,'bad'),count:1,format:'patches',model:contractModel({count:1,format:'patches',badCandidate:true})});
    assert.equal(bad.accepted,false);assert.equal(bad.metrics.exact_fixture_mismatches,1);assert.equal(bad.calls.length,1);assert.equal(bad.attempts.length,0);
    const held=await runCase({directory:path.join(directory,'held'),count:1,format:'patches',model:contractModel({count:1,format:'patches',qaVerdict:'Blocked'})});
    assert.equal(held.accepted,false);assert.equal(held.review.verdict,'Blocked');assert.equal(held.calls.length,2);assert.equal(held.repairs,0);assert.equal(held.errors.length,1);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});


test('fresh comparison binds supported predeclared model controls instead of silently substituting the historical model',()=>{
  const selections=modelSelections('fixture-current-model','high','high'),catalog={supported:true,models:[{id:'fixture-current-model',supported_efforts:['medium','high']}]};
  assert.equal(validateModelSelections(selections,catalog),true);
  assert.throws(()=>validateModelSelections(modelSelections('unadvertised'),catalog),/not supported/);
  assert.throws(()=>validateModelSelections(modelSelections('fixture-current-model','ultra'),catalog),/not supported/);
  assert.throws(()=>validateModelSelections(selections,{supported:false}),/supported current host catalog/);
  const rows=retainedCases();
  for(const r of rows){r.model_selection_policy=structuredClone(selections);r.model_selection_policy_sha256=digest(JSON.stringify(selections));for(const c of r.calls)c.requested=structuredClone(selections[c.role]);}
  assert.equal(assess(rows,null,selections).passed,true);
  assert.equal(assess(rows).passed,false,'a fresh model policy must be declared by the run, never inferred from its result');
  const changed=structuredClone(rows);changed[0].model_selection_policy.engineer.effort='medium';
  assert.equal(assess(changed,null,selections).passed,false);
  const changedCall=structuredClone(rows);changedCall[0].calls[0].requested.effort='medium';
  assert.equal(assess(changedCall,null,selections).passed,false);
});
