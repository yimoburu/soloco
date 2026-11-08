import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runSeries,summarizeSeries,orders} from '../tools/repeated-workflow-eval.mjs';
import {workflowSelections,contractModel} from '../tools/accepted-workflow-eval.mjs';
import {sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';
test('exact model override does not silently substitute an unavailable name',()=>{
 const choices=workflowSelections('gpt-6-astra');assert.deepEqual(Object.values(choices).map(c=>c.model),['gpt-6-astra','gpt-6-astra','gpt-6-astra']);assert.deepEqual(Object.values(choices).map(c=>c.effort),['low','medium','high']);assert.throws(()=>workflowSelections(''));
});
test('counterbalanced suite accepts only complete matched outcomes and preserves failures',{skip:!sandboxCapability().supported},async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-repeated-test-')),directory=path.join(parent,'new-series');
 try{
  const report=await runSeries({directory});assert.equal(report.assessment.passed,true);assert.equal(report.assessment.model_calls,24);assert.deepEqual(report.pairs.map(p=>p.order),orders);
  for(const mode of ['serial','concurrent']){assert.equal(report.assessment.by_mode[mode].accepted,4);assert.equal(report.assessment.by_mode[mode].human_interruptions,null);}
  const clone=()=>structuredClone(report.pairs),verify=report.source_verification;
  for(const mutate of [p=>p.pop(),p=>p[1].order.reverse(),p=>p[1].arms[0].selections.engineer.model='different',p=>p[0].arms[0].review.verdict='Blocked',p=>p[0].arms[0].errors.push({message:'retained failure'}),p=>p.forEach(pair=>pair.arms.forEach(arm=>{arm.selections.engineer.effort='low';for(const call of arm.calls.filter(c=>c.role==='engineer'))call.requested.effort='low';}))]){const pairs=clone();mutate(pairs);assert.equal(summarizeSeries(pairs,verify,report.protocol.selections).passed,false);}
  assert.equal(summarizeSeries(clone(),verify).passed,false,'A matching set of arms cannot invent its own selection baseline');
  await assert.rejects(runSeries({directory}),/prior attempts/);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
test('a held synthetic acceptance stops all later arms without retry',{skip:!sandboxCapability().supported},async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-repeated-hold-'));
 try{
  const report=await runSeries({directory:path.join(parent,'held'),model:contractModel({qaVerdict:'Blocked'})});
  assert.equal(report.assessment.passed,false);assert.equal(report.pairs.length,1);assert.equal(report.pairs[0].arms.length,1);assert.equal(report.assessment.model_calls,3);assert.equal(report.pairs[0].arms[0].review.verdict,'Blocked');
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
test('unsupported exact native model fails before fixture creation or inference',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-repeated-catalog-')),directory=path.join(parent,'not-created');
 try{
  await assert.rejects(runSeries({directory,native:true,modelId:'unadvertised',runtimeReady:{available:true},runtimeCatalog:{supported:true,models:[{id:'gpt-6-astra',supported_efforts:['low','medium','high']}],speed_support:{host_default:true}}}));assert.equal(fs.existsSync(directory),false);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
