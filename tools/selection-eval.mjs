import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeSelection } from '../plugins/soloco/runtime/selection.mjs';

// Fictional capability/qualification evidence, never a real model ranking.
export const catalog={supported:true,source:'fictional_eval',speed_support:{host_default:true,fast_disabled:false},models:[
  {id:'fixture-small',supported_efforts:['low','medium'],qualification:'Passed exact extraction/formatting checks; no coding/review evidence',relative_cost:1},
  {id:'fixture-balanced',supported_efforts:['low','medium','high'],qualification:'Passed bounded coding at medium; failed cross-component invariant review at medium',relative_cost:2},
  {id:'fixture-deep',supported_efforts:['medium','high'],qualification:'Passed cross-component invariant review at high; higher latency',relative_cost:4}
]};
export const cases=[
  {id:'simple',task:'A PM specialist must extract the three acceptance criteria from a supplied approved paragraph, preserving wording. Exact-match validation, low consequence and no ambiguity. Existing session used fixture-deep/high.',allowed:[['fixture-small','low']]},
  {id:'routine',task:'Engineering must fix a bounded pure string parser using a complete small source snapshot and six specified edge cases. Medium effort on fixture-balanced has passed comparable cases. No architecture or permission change.',allowed:[['fixture-balanced','medium']]},
  {id:'consequential',task:'Independent QA must evaluate cancellation, stale-result quarantine and acceptance invariants across four components. Errors could accept stale work. Supplied qualification evidence establishes fixture-deep/high for this class; fixture-balanced/medium failed it. Preserve independent reviewer identity.',allowed:[['fixture-deep','high']]},
  {id:'escalation',task:'A bounded parser repair failed on fixture-balanced/medium twice with the same multi-component state inconsistency. One authorized repair remains; new evidence resembles the cross-component review class. Decide settings without resetting the repair allowance.',allowed:[['fixture-deep','high']]},
  {id:'catalog-unavailable',task:'The explicit model catalog is unavailable. A brief specialist feasibility proposal is permitted using host defaults; no safety-critical decision depends on it. Do not invent a supported identifier.',unavailable:true,allowed:[['default',null]]}
];
export function buildPrompt(policy) {
  return `Evaluate the supplied Chief of Staff selection policy on fictional assignments. No tools, commands, external actions, company changes or specialist dispatch. The supplied catalog is a fixture, not real account entitlement. Choose settings only; do not perform the assignments.\nPolicy:\n${policy}\nFictional Codex catalog and qualification evidence:\n${JSON.stringify(catalog)}\nAssignments:\n${JSON.stringify(cases.map(({allowed,...c})=>c))}\nReturn only JSON {"decisions":[{"id":"case id","model_selection":{"mode":"explicit or default","model":"omit for default","effort":"omit for default","speed":"host_default","reason":"task-specific reason, max 300 characters"}}]}. Include exactly one decision per case. Speed controls other than host_default are unsupported. Do not assume the default speed is Standard. No current role or CoS settings establish the appropriate choice.`;
}
export function gradeDecisions(value) {
  const failures=[];
  const decisions=value?.decisions;
  if(!Array.isArray(decisions))return {passed:false,failures:['Expected decisions array'],cases:[]};
  if(decisions.length!==cases.length)failures.push('Expected exactly one decision per case');
  const results=cases.map(c=>{
    const matches=decisions.filter(d=>d?.id===c.id),errors=[];
    if(matches.length!==1)errors.push('Missing or duplicate decision');
    let selection=null;
    if(matches.length===1)try {
      selection=normalizeSelection(matches[0].model_selection,'codex',c.unavailable?{supported:false}:catalog);
      if(!selection.reason)errors.push('Missing explicit decision rationale');
      const model=selection.mode==='default'?'default':selection.model,effort=selection.effort??null;
      if(!c.allowed.some(([m,e])=>m===model&&e===effort))errors.push('Choice does not fit supplied task and qualification evidence');
    }catch(error){errors.push(error.message);}
    return {id:c.id,passed:errors.length===0,selection,errors};
  });
  for(const d of decisions)if(!cases.some(c=>c.id===d?.id))failures.push('Unknown case ID');
  return {passed:failures.length===0&&results.every(r=>r.passed),failures,cases:results};
}
const hash=text=>createHash('sha256').update(text).digest('hex');
async function main(argv) {
  const options={};
  for(let i=0;i<argv.length;i+=2) {
    if(!['--live','--response','--output','--model','--effort'].includes(argv[i])||!argv[i+1]||argv[i+1].startsWith('--')||options[argv[i]])throw new Error('Use --response file OR --live codex|claude [--model id] [--effort value], plus --output new-file');
    options[argv[i]]=argv[i+1];
  }
  if(!options['--output'] || Boolean(options['--live'])===Boolean(options['--response']))throw new Error('Choose exactly one response source and an output path');
  if(options['--response']&&(options['--model']||options['--effort']))throw new Error('Model/effort options require --live');
  if(fs.existsSync(options['--output']))throw new Error('Output exists; preserve previous evaluation receipts');
  const policy=fs.readFileSync(new URL('../plugins/soloco/skills/soloco/SKILL.md',import.meta.url),'utf8');
  let response,evidence=null,requested=null;
  const started=Date.now();
  if(options['--live']) {
    const host=options['--live'];
    if(!['codex','claude'].includes(host))throw new Error('Unsupported live host');
    if(options['--effort']&&!options['--model'])throw new Error('Effort requires explicit evaluator model');
    const {modelCatalog,runModel}=await import('../plugins/soloco/runtime/adapters.mjs');
    requested=normalizeSelection(options['--model']?{mode:'explicit',model:options['--model'],...(options['--effort']?{effort:options['--effort']}:{}),reason:'Bounded fictional CoS selection-policy evaluation'}:{mode:'default',reason:'Evaluate selection policy using authorized host default'},host,options['--model']?modelCatalog(host):null);
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-selection-eval-'));
    try {
      const result=await runModel(host,null,buildPrompt(policy),dir,180000,requested);
      response=JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
      evidence=result.model_evidence;
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  } else response=JSON.parse(fs.readFileSync(options['--response'],'utf8'));
  const report={schema:1,kind:'selection_policy_decision_eval',source:options['--live']?'live_host_response':'supplied_response',host:options['--live']??null,
    policy_sha256:hash(policy),cases_sha256:hash(JSON.stringify({catalog,cases})),requested_evaluator:requested,evaluator_evidence:evidence,
    created_at:new Date().toISOString(),duration_ms:Date.now()-started,...gradeDecisions(response),
    limitations:['Fictional qualification and relative-cost evidence; not real model benchmarks','Evaluates CoS choices only; selected specialist models were not executed','No effective provider settings, billing, savings or production behavior established','Founder-facing chat usage is not measured']};
  fs.writeFileSync(options['--output'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,output:options['--output']}));
  if(!report.passed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
