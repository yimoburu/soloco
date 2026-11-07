import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runCase,contractModel,assess,sourceIdentity} from '../tools/candidate-format-qualification.mjs';
import {verifyCase} from '../tools/verify-candidate-format-qualification.mjs';
import {read} from '../tools/workflow-runtime.mjs';
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
    const copy=structuredClone(cases[0]);copy.review.verdict='Blocked';assert.equal(verifyCase(copy,read(copy.root)).acceptance_verified,false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
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
