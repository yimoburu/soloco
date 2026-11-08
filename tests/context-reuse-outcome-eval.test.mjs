import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gradeSummary,expected,assess,runScale,contractModel} from '../tools/context-reuse-outcome-eval.mjs';
import {sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-context-reuse-eval-test-'));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
test('frozen semantic grader rejects omitted, permissive and malformed reconstruction',()=>{
 assert.equal(gradeSummary(JSON.stringify(expected)).passed,true);
 for(const change of [v=>v.blocked_action_ids.pop(),v=>v.unresolved_source_ids.pop(),v=>v.allowed_action_ids.push('refund_charge')]){const value=structuredClone(expected);change(value);assert.equal(gradeSummary(JSON.stringify(value)).passed,false);}
 assert.equal(gradeSummary('not JSON').passed,false);
});
test('assessment cannot promote missing scales, changed source or unexecuted counterfeit reuse',()=>{
 assert.equal(assess([],{passed:true}).passed,false);
 const scales=[1,10,100].map(scale=>({scale,accepted:true,errors:[],decision_required_notices:0,original_source_unchanged:true,arms:['unclassified_executed','classified_executed','classified_reused'].map(mode=>({mode,accepted:true,errors:[],author_summary:{passed:true},qa_summary:{passed:true},review:{native_id:'qa',author_native_id:'author'},acceptance:{source_integrated:false},receipt:{reused:mode==='classified_reused',tests_executed:mode!=='classified_reused'},metrics:{prompt_bytes:100}}))}));
 assert.equal(assess(scales,{passed:true}).passed,true);
 assert.equal(assess(scales,{passed:false}).passed,false);
 scales[2].arms[2].receipt.tests_executed=true;assert.equal(assess(scales,{passed:true}).passed,false);
});
test('real worker, sandbox, native provenance contracts and fresh receiving QA accept executed and reused outcomes',{skip:sandboxCapability().supported?false:sandboxCapability().blocker},async()=>{
 process.env.COMPANY_PLUGIN_DATA=path.join(tmp,'plugin-data');
 const r=await runScale({directory:tmp,scale:1,model:contractModel()});
 assert.equal(r.accepted,true,JSON.stringify(r.errors));assert.equal(r.arms.length,3);
 assert.deepEqual(r.arms.map(a=>a.receipt.tests_executed),[true,true,false]);
 assert.deepEqual(r.arms.map(a=>a.receipt.reused),[false,false,true]);
 assert.equal(r.arms[2].receipt.reused_from,r.arms[0].receipt.id);
 assert.equal(r.calls.length,8);assert.equal(r.classified_source_ids.length,1);
 assert.equal(r.reuse_dependency_tamper_rejections,7);
 assert.equal(r.bootstrap.retrieved_ranges.length,1);const range=r.bootstrap.retrieved_ranges[0];assert(range.total_characters<16000);assert.equal(range.length,range.total_characters);assert.equal(range.offset,0);
 assert.equal(r.original_source_unchanged,true);
});
