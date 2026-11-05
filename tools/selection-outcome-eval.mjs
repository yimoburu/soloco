import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeSelection } from '../plugins/soloco/runtime/selection.mjs';

export const outcomeCases=[
 {id:'extraction',task:'Extract the acceptance criteria verbatim from this fictional approved brief, preserving order. Return JSON {"criteria":[...]}, with no other text. Brief: Build a color picker. Acceptance criteria: (1) Keyboard users can reach every color. (2) The selected color has a visible label. (3) Cancel restores the prior selection. Notes: A future gradient editor is out of scope.'},
 {id:'coding',task:'Return JSON {"source":"complete ES module"} only. Implement export function parsePort(value). Accept only strings consisting of ASCII decimal digits with no whitespace or signs, whose numeric value is an integer from 1 through 65535 inclusive. Leading zeroes are allowed. Return the integer or null for invalid inputs, including nonstrings. No imports, I/O or tools. This is a fictional pure-function exercise.'},
 {id:'review',task:'Independently review this fictional acceptance function. Return JSON {"blockers":["category",...]} only, selecting exactly the actual missing protections from: candidate_binding,receipt_execution,reviewer_independence,live_authority,unrelated_ui. Code: function accept({candidateHash,receipt,review,grant,now,authorNative}) { if (receipt.status !== "passed" || review.verdict !== "Pass") return false; return true; }. Requirements: bind receipt and review to exact candidateHash; actual tests_executed must be true with exit_code 0; reviewer native ID must differ from authorNative; grant must be unwithdrawn and unexpired at now. There is no UI requirement. No tools or execution.'}
];
export function gradeStructured(id,answer) {
 if(id==='extraction')return {passed:JSON.stringify(answer?.criteria)===JSON.stringify(['Keyboard users can reach every color.','The selected color has a visible label.','Cancel restores the prior selection.']),grader:'exact_extraction'};
 if(id==='review')return {passed:Array.isArray(answer?.blockers)&&answer.blockers.length===4&&new Set(answer.blockers).size===4&&['candidate_binding','receipt_execution','reviewer_independence','live_authority'].every(k=>answer.blockers.includes(k)),grader:'seeded_blockers_exact_set'};
 throw new Error('Use executed Node tests to grade coding');
}
const hash=value=>createHash('sha256').update(value).digest('hex');
export function summarize(trials) {
 const quantile=(v,p)=>{const sorted=[...v].sort((a,b)=>a-b);return sorted.length?sorted[Math.ceil(p*sorted.length)-1]:null;};
 return outcomeCases.map(c=>{const rows=trials.filter(t=>t.case_id===c.id),times=rows.map(t=>t.elapsed_ms);
 return {case_id:c.id,trials:rows.length,passed:rows.filter(t=>t.passed).length,failures:rows.filter(t=>!t.passed).length,repairs:0,median_ms:quantile(times,.5),observed_p95_ms:quantile(times,.95)};});
}
const codingTests=`import test from 'node:test';import assert from 'node:assert/strict';import {parsePort} from './candidate.mjs';
test('valid ASCII ports and boundaries',()=>{for(const [v,n] of [['1',1],['65535',65535],['8080',8080],['00080',80]])assert.equal(parsePort(v),n);});
test('reject out-of-range and nondecimal values',()=>{for(const v of ['0','65536','-1','+80','1.0','1e2','0x50','', ' 80','80 ','80\\n','∞','８０'])assert.equal(parsePort(v),null);});
test('reject nonstrings',()=>{for(const v of [80,null,undefined,{},[],true])assert.equal(parsePort(v),null);});`;
export async function gradeCoding(answer,directory,runTests) {
 if(typeof answer?.source!=='string'||Buffer.byteLength(answer.source)>8192)return {passed:false,grader:'sandboxed_node_tests',error:'Expected a bounded complete source module'};
 fs.writeFileSync(path.join(directory,'candidate.mjs'),answer.source,{flag:'wx'});
 fs.writeFileSync(path.join(directory,'candidate.test.mjs'),codingTests,{flag:'wx'});
 const receipt=await runTests({directory,test_paths:['candidate.test.mjs'],timeout_ms:5000,max_output_bytes:20000});
 return {passed:receipt.status==='passed'&&receipt.exit_code===0&&receipt.tests_executed===true,grader:'sandboxed_node_tests',source_sha256:hash(answer.source),receipt:{status:receipt.status,exit_code:receipt.exit_code,tests_executed:receipt.tests_executed,duration_ms:receipt.duration_ms,stdout:receipt.stdout,stderr:receipt.stderr,...(receipt.blocker?{blocker:receipt.blocker}:{})}};
}
async function main(argv) {
 const options={};for(let i=0;i<argv.length;i+=2){if(!['--host','--plan','--trials','--output'].includes(argv[i])||!argv[i+1]||options[argv[i]])throw new Error('Use --host codex|claude --plan file --trials 1..5 --output new-report');options[argv[i]]=argv[i+1];}
 const host=options['--host'],count=Number(options['--trials']??3);
 if(!['codex','claude'].includes(host)||!options['--plan']||!options['--output']||!Number.isInteger(count)||count<1||count>5)throw new Error('Invalid outcome evaluation options');
 if(fs.existsSync(options['--output']))throw new Error('Preserve prior reports; choose a new output');
 const plan=JSON.parse(fs.readFileSync(options['--plan'],'utf8'));
 const {modelCatalog,runModel}=await import('../plugins/soloco/runtime/adapters.mjs');
 const {runLocalTests,sandboxCapability}=await import('../plugins/soloco/runtime/local-sandbox.mjs');
 const capability=sandboxCapability();if(!capability.supported)throw new Error(`Coding grader unavailable: ${capability.blocker}`);
 const catalog=modelCatalog(host),selections={};
 for(const c of outcomeCases)selections[c.id]=normalizeSelection(plan[c.id],host,catalog);
 const report={schema:1,kind:'actual_selection_task_outcomes',host,created_at:new Date().toISOString(),fixture_sha256:hash(JSON.stringify(outcomeCases)+codingTests),criteria:{trials_per_case:count,all_trials_must_pass:true,repair_allowance:0,critical_seeded_blockers_missed:0,noninferiority_established:false},trials:[],limitations:['Small fictional workload; not production competence or statistical non-inferiority','Observed p95 is a small-sample order statistic, not a reliable population-tail estimate','No effective provider setting or billing/savings claim; requested/applied/observed settings remain separate','No CoS/company mutation or selected-model comparisons against a prior baseline']};
 // Persist incrementally, including failed trials. No retries, source/private data
 // or native identifiers. Model output is data; generated code executes only in
 // the existing fail-closed OS test sandbox.
 const save=()=>{const temp=options['--output']+'.writing';fs.writeFileSync(temp,JSON.stringify({...report,summary:summarize(report.trials)},null,2)+'\n');fs.renameSync(temp,options['--output']);};
 fs.writeFileSync(options['--output'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 for(const c of outcomeCases)for(let trial=1;trial<=count;trial++) {
  const started=Date.now(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-outcome-'));
  const row={case_id:c.id,trial,requested:selections[c.id],passed:false};
  try{
   const result=await runModel(host,null,c.task,dir,180000,selections[c.id]);row.model_ms=Date.now()-started;row.evidence=result.model_evidence;
   const answer=JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));row.answer=answer;
   Object.assign(row,c.id==='coding'?await gradeCoding(answer,dir,runLocalTests):gradeStructured(c.id,answer));
  }catch(error){row.error=String(error.message).slice(0,2000);}
  finally {row.elapsed_ms=Date.now()-started;fs.rmSync(dir,{recursive:true,force:true});report.trials.push(row);save();}
 }
 report.passed=report.trials.length===outcomeCases.length*count&&report.trials.every(t=>t.passed);save();
 console.log(JSON.stringify({passed:report.passed,summary:summarize(report.trials),output:options['--output']}));if(!report.passed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
