import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runArm,workflowSelections,sourceIdentity,captureSourceVerification,assessPair,publicReport} from './accepted-workflow-eval.mjs';
import {digest} from '../plugins/soloco/runtime/store.mjs';
import {readiness,modelCatalog} from '../plugins/soloco/runtime/adapters.mjs';
import {normalizeSelection} from '../plugins/soloco/runtime/selection.mjs';
import {sandboxCapability} from '../plugins/soloco/runtime/local-sandbox.mjs';

export const orders=[['serial','concurrent'],['concurrent','serial'],['serial','concurrent'],['concurrent','serial']];
export const repeatedProtocol={version:1,kind:'counterbalanced_accepted_workflows',orders,
 criteria:{pairs:4,critical_false_acceptances:0,missed_required_results:0,noninferiority_margin_errors:0,max_generation_attempts_per_arm:2,max_native_calls_total:32,latency_improvement_required:false},
 comparison:'Same immutable extraction/coding/review workload and explicit task controls in both schedules; four fresh pairs with balanced schedule order. Only independent extraction and bounded coding overlap; QA waits for both and actual tests.',
 limitations:['Repeated small fictional task, not broad production competence or statistical non-inferiority','Eight arms do not support reliable population-tail or causal founder-benefit claims','Human active minutes and interruptions are unobserved; harness attention events are separately labeled','Provider effective settings, token usage, billing and savings remain unknown unless actually observed','Coupled-work decisions and harmful-splitting behavior require separate cases; this fixture must not be relabeled as coupled work']};
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;return n?(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2:null;};
export function summarizeSeries(pairs,verification,expectedSelections=null){
 const assessments=pairs.map(pair=>({pair:pair.pair,order:pair.order,...assessPair(pair.arms,verification)}));
 const errors=[];
 if(pairs.length!==orders.length||pairs.some((pair,i)=>pair.pair!==i+1||JSON.stringify(pair.order)!==JSON.stringify(orders[i])||JSON.stringify(pair.arms.map(a=>a.mode))!==JSON.stringify(orders[i])))errors.push('Missing, duplicated or reordered predeclared pairs');
 const arms=pairs.flatMap(p=>p.arms),first=arms[0];
 if(!expectedSelections||typeof expectedSelections!=='object'||arms.some(a=>JSON.stringify(a.selections)!==JSON.stringify(expectedSelections)))errors.push('Arm controls do not match the predeclared selections');
 if(arms.some(a=>a.fixture_sha256!==first.fixture_sha256||a.execution!==first.execution||JSON.stringify(a.selections)!==JSON.stringify(first.selections)))errors.push('Workload or controls changed between pairs');
 const model_calls=arms.reduce((n,a)=>n+a.calls.length,0);
 if(model_calls>repeatedProtocol.criteria.max_native_calls_total)errors.push('Aggregate call budget exceeded');
 if(verification?.passed!==true)errors.push('Source/runtime verification missing or held');
 const by_mode=Object.fromEntries(['serial','concurrent'].map(mode=>{
  const rows=arms.filter(a=>a.mode===mode),times=rows.map(a=>a.elapsed_ms);
  return [mode,{trials:rows.length,accepted:rows.filter(a=>a.accepted).length,median_ms:median(times),observed_max_ms:times.length?Math.max(...times):null,model_calls:rows.reduce((n,a)=>n+a.calls.length,0),repairs:rows.reduce((n,a)=>n+a.metrics.repairs,0),failed_test_attempts:rows.reduce((n,a)=>n+a.metrics.failed_test_attempts,0),software_attention_events:rows.reduce((n,a)=>n+a.metrics.founder_requests,0),human_active_minutes:null,human_interruptions:null}];
 }));
 return {passed:errors.length===0&&assessments.every(a=>a.passed),errors,pairs:assessments,model_calls,by_mode,descriptive_only:true,causal_speedup_established:false,population_tail_established:false,founder_effort_established:false};
}
export async function runSeries({directory,native=false,modelId='gpt-6.1-sol',model,runtimeReady,runtimeCatalog,onProgress=()=>{}}){
 if(fs.existsSync(directory))throw Error('Choose a new output directory; prior attempts must survive');
 if(native){if(!runtimeReady?.available||!runtimeCatalog?.supported)throw Error('Inspect actual runtime readiness and catalog first');for(const selection of Object.values(workflowSelections(modelId)))normalizeSelection(selection,'codex',runtimeCatalog);}
 fs.mkdirSync(directory,{recursive:true});
 const beforeBindings=process.env.COMPANY_PLUGIN_DATA;
 process.env.COMPANY_PLUGIN_DATA=path.join(directory,'fixture-bindings');
 const suiteFile=fileURLToPath(import.meta.url),suite_sha256=digest(fs.readFileSync(suiteFile)),source_identity=sourceIdentity();
 const protocol={...repeatedProtocol,selections:workflowSelections(modelId),suite_sha256,source_manifest_sha256:source_identity.manifest_sha256};
 fs.writeFileSync(path.join(directory,'predeclared-protocol.json'),JSON.stringify(protocol,null,2)+'\n',{flag:'wx'});
 const pairs=[],budget={calls:0};let report;
 const save=()=>{
  const {after,verification}=captureSourceVerification(source_identity);
  if(digest(fs.readFileSync(suiteFile))!==suite_sha256){verification.passed=false;verification.status='held';verification.errors.push('Suite source changed during evaluation');}
  report={protocol,source_identity,source_identity_after:after,source_verification:verification,execution:native?'native_cli':'synthetic_contract_double',pairs:pairs.map(publicReport),assessment:summarizeSeries(pairs,verification,protocol.selections)};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');return verification;
 };
 try{
  for(let i=0;i<orders.length;i++){
   const pair={pair:i+1,order:orders[i],arms:[]};pairs.push(pair);
   for(const mode of pair.order){
    const arm=await runArm({directory:path.join(directory,'pair-'+pair.pair),mode,native,modelId,...(model?{model}:{}),sharedBudget:budget,maxCalls:protocol.criteria.max_native_calls_total,runtimeReady,runtimeCatalog});
    pair.arms.push(arm);const verification=save();onProgress({pair:pair.pair,mode,accepted:arm.accepted,metrics:arm.metrics,errors:arm.errors});
    // A held outcome or source drift stops the series. Preserve the frozen arm;
    // another pair must never become an implicit retry of failed acceptance.
    if(!verification.passed||!arm.accepted||arm.calls.some(c=>c.error))return report;
   }
  }
  save();return report;
 }finally{if(beforeBindings===undefined)delete process.env.COMPANY_PLUGIN_DATA;else process.env.COMPANY_PLUGIN_DATA=beforeBindings;}
}
async function main(argv){
 if(argv.length!==4||!['--native','--contract-double'].includes(argv[0])||argv[2]!=='--model')throw Error('Use --native|--contract-double NEW_OUTPUT_DIRECTORY --model EXACT_CATALOG_MODEL');
 const native=argv[0]==='--native',capability=sandboxCapability();if(!capability.supported)throw Error(capability.blocker);
 const report=await runSeries({directory:path.resolve(argv[1]),native,modelId:argv[3],runtimeReady:native?readiness('codex'):null,runtimeCatalog:native?modelCatalog('codex'):null,onProgress:value=>console.log(JSON.stringify(value))});
 console.log(JSON.stringify(report.assessment));if(!report.assessment.passed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
