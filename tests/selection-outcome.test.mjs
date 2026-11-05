import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {gradeStructured,gradeCoding,summarize} from '../tools/selection-outcome-eval.mjs';
test('outcome graders require exact preserved extraction and all seeded review blockers',()=>{
 assert.equal(gradeStructured('extraction',{criteria:['Keyboard users can reach every color.','The selected color has a visible label.','Cancel restores the prior selection.']}).passed,true);
 assert.equal(gradeStructured('extraction',{criteria:['Meaning approximately preserved']}).passed,false);
 const blockers=['candidate_binding','receipt_execution','reviewer_independence','live_authority'];
 assert.equal(gradeStructured('review',{blockers}).passed,true);
 for(const value of [blockers.slice(0,3),[...blockers,'unrelated_ui'],Array(4).fill('live_authority')])assert.equal(gradeStructured('review',{blockers:value}).passed,false);
});
test('coding outcomes require executed passing runtime receipt, not generated confidence',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outcome-grader-'));
 try {
  const grade=await gradeCoding({source:'export const parsePort=()=>null;'},dir,async args=>{assert.deepEqual(args.test_paths,['candidate.test.mjs']);return {status:'passed',exit_code:0,tests_executed:false};});
  assert.equal(grade.passed,false);assert.equal(grade.grader,'sandboxed_node_tests');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('outcome summary retains failed trials, repairs and observed latency without claiming quality equivalence',()=>{
 const summary=summarize([{case_id:'coding',passed:true,elapsed_ms:10},{case_id:'coding',passed:false,elapsed_ms:30},{case_id:'coding',passed:true,elapsed_ms:20}]);
 assert.deepEqual(summary.find(x=>x.case_id==='coding'),{case_id:'coding',trials:3,passed:2,failures:1,repairs:0,median_ms:20,observed_p95_ms:30});
});
