import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runArm,contractModel,assessPair,publicReport,protocol,sourceIdentity,verifySourceIdentity,captureSourceVerification} from '../tools/accepted-workflow-eval.mjs';
import {read} from '../tools/workflow-runtime.mjs';
import {sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';
const capability=sandboxCapability();
const live={skip:capability.supported?false:capability.blocker};
async function fixture(fn){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-accepted-workflow-test-')),before=process.env.COMPANY_PLUGIN_DATA;process.env.COMPANY_PLUGIN_DATA=path.join(directory,'bindings');try{return await fn(directory);}finally{if(before===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=before;fs.rmSync(directory,{recursive:true,force:true});}}
test('paired contract doubles traverse production checks and exact independent receiver acceptance',live,()=>fixture(async directory=>{
 const budget={calls:0},arms=[];for(const mode of ['serial','concurrent'])arms.push(await runArm({directory,mode,sharedBudget:budget}));
 assert.equal(assessPair(arms).passed,true,JSON.stringify(arms.map(a=>a.errors)));assert.equal(budget.calls,6);
 for(const arm of arms){assert.equal(arm.execution,'synthetic_contract_double');assert.equal(arm.acceptance.source_integrated,false);assert.equal(arm.metrics.repairs,0);assert.equal(arm.metrics.founder_requests,0);assert.equal(arm.attempts[0].result.tests_executed,true);assert.notEqual(arm.review.native_id,arm.review.author_native_id);const exposed=publicReport(arm);assert.equal(exposed.root,undefined);assert.notEqual(exposed.review.native_id,arm.review.native_id);assert.equal(exposed.review.native_id.length,64);}
 assert.equal(protocol.criteria.noninferiority_margin_errors,0);
}));
test('known deterministic failure consumes one observed repair; original failed receipt survives',live,()=>fixture(async directory=>{
 const arm=await runArm({directory,mode:'serial',model:contractModel({badFirst:true})});assert.equal(arm.accepted,true,JSON.stringify(arm.errors));assert.equal(arm.metrics.repairs,1);assert.equal(arm.metrics.failed_test_attempts,1);assert.equal(arm.metrics.model_calls,4);assert.equal(arm.attempts.length,2);const state=read(arm.root);assert.equal(state.records[arm.attempts[0].receipt_id].development.result.status,'failed');assert.equal(state.records[arm.attempts[0].receipt_id].development.acceptance,undefined);
}));
test('independent negative verdict holds receiver acceptance and records actual escalation',live,()=>fixture(async directory=>{
 const arm=await runArm({directory,mode:'serial',model:contractModel({qaVerdict:'Blocked'})});assert.equal(arm.accepted,false);assert.equal(arm.metrics.repairs,0);assert.equal(arm.metrics.founder_requests,1);assert.equal(arm.review.verdict,'Blocked');assert.equal(arm.acceptance,undefined);assert.equal(assessPair([arm]).passed,false);
}));
test('uncertain backend failure is retained without another generation or false acceptance',live,()=>fixture(async directory=>{
 const arm=await runArm({directory,mode:'serial',model:contractModel({throwFor:'engineer'})});assert.equal(arm.accepted,false);assert.equal(arm.metrics.model_calls,2);assert.equal(arm.metrics.repairs,0);assert.equal(arm.calls.at(-1).error.termination_confirmed,false);const state=read(arm.root),j=Object.values(state.jobs).find(j=>j.role==='engineer');assert.equal(j.status,'failed');assert.equal(j.coordination_release,undefined);assert.equal(arm.attempts.length,0);
}));

const retainedNativeReport=JSON.parse(fs.readFileSync(new URL('../evals/issue16-accepted-workflow-20261107/native-report.json',import.meta.url),'utf8'));
const retainedArms=()=>JSON.parse(JSON.stringify(retainedNativeReport.arms));
test('final assessor rejects duplicate schedules and unmatched fixture, execution or model settings',()=>{
 assert.equal(assessPair(retainedArms()).passed,true);
 const original=retainedArms();assert.equal(assessPair([original[0],original[0]]).passed,false);
 for(const mutate of [arms=>arms[1].fixture_sha256='0'.repeat(64),arms=>arms[1].execution='synthetic_contract_double',arms=>arms[1].selections.engineer.effort='low']){const arms=retainedArms();mutate(arms);assert.equal(assessPair(arms).passed,false);}
});
test('final assessor rejects contradictory QA, held/error paths, altered call identity and stale exact bindings',()=>{
 for(const mutate of [
  arms=>arms[0].review.verdict='Blocked',arms=>arms[0].errors.push({message:'Retained hold'}),
  arms=>arms[0].events.push({type:'held'}),arms=>arms[0].calls[0].error={message:'Provider closure unknown'},
  arms=>arms[0].calls[0].requested.model='other-model',arms=>delete arms[0].calls[0].native_id,
  arms=>arms[0].review.native_id=arms[0].review.author_native_id,
  arms=>arms[0].review.receipt_sha256='0'.repeat(64),arms=>arms[0].acceptance.candidate_sha256='0'.repeat(64),
  arms=>arms[0].attempts.at(-1).result.tests_executed=false,
 ]){const arms=retainedArms();mutate(arms);assert.equal(assessPair(arms).passed,false);}
});
test('pre/post source verification detects actual file drift, failed capture, runtime drift and invalid manifests',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-workflow-source-drift-'));
 try {
  for(const name of ['plugins/soloco/fixture.mjs','SPEC.md','tools/accepted-workflow-eval.mjs','tools/workflow-runtime.mjs','tests/accepted-workflow-eval.test.mjs']){const file=path.join(directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fictional source '+name);}
  const before=sourceIdentity(directory),capture=()=>sourceIdentity(directory);
  assert.equal(before.observed_git_revision,null,'An archive fixture has no observed Git revision');
  assert.equal(captureSourceVerification(before,capture).verification.passed,true);
  fs.appendFileSync(path.join(directory,'plugins/soloco/fixture.mjs'),' changed');
  const drift=captureSourceVerification(before,capture);assert.equal(drift.verification.status,'held');assert.equal(assessPair(retainedArms(),drift.verification).passed,false);
  fs.rmSync(path.join(directory,'tools/workflow-runtime.mjs'));
  assert.equal(captureSourceVerification(before,capture).verification.status,'held');
  const runtime=structuredClone(before);runtime.node.executable_sha256='0'.repeat(64);assert.equal(verifySourceIdentity(before,runtime).passed,false);
  const invalid=structuredClone(before);invalid.files[0].sha256='0'.repeat(64);assert.equal(verifySourceIdentity(invalid,invalid).passed,false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
