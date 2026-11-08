import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {normalizeSelection} from '../plugins/soloco/runtime/selection.mjs';
import {mutationView,publicPage} from '../plugins/soloco/runtime/public-response.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const job=(id,role,status,task_summary,extra={})=>({id,role,status,task_summary,instance_id:'instance-'+id,native_id:null,...extra});
const receipt=value=>mutationView(value,'job:'+value.id,'jobs');
const page=jobs=>publicPage({id:'fictional-visibility-company',jobs:Object.fromEntries(jobs.map(j=>[j.id,j])),records:{},notices:[],messages:[],sessions:{}},{collection:'jobs',limit:10});

// These are fictional tool observations, generated through production public
// projections. They neither dispatch agents nor establish company authority.
export const visibilityCases=[
  {id:'queued-and-planned',request:'Write the next progress response after this dispatch; include the planned handoff.',observations:{dispatch:receipt(job('alpha','engineer','queued','Repair the ALPHA parser')),planned_handoff:{role:'qa',status:'planned / not summoned',task:'Review the ALPHA candidate after Engineering returns it'}},expected:{agents:[{role:'engineering',marker:'ALPHA',states:['queued']}],planned_qa:true}},
  {id:'resumed-and-reviewer',request:'Write the next update after Engineering resumed and independent QA was summoned.',observations:{jobs:page([job('beta','engineer','running','Repair the BETA parser',{native_id:'native-beta-resumed'}),job('beta-review','qa','queued','Independently review the BETA candidate',{review_of:{id:'candidate-beta',revision:1}})]),continuity:'Engineering resumed its observed native-beta-resumed session; QA is a separate instance.'},expected:{agents:[{role:'engineering',marker:'BETA',states:['running']},{role:'qa',marker:'BETA',states:['queued']}]}},
  {id:'distinct-researchers',request:'Write a compact progress update distinguishing the two Research specialists.',observations:{jobs:page([job('red','research','running','Assess the RED competitor',{native_id:'native-red'}),job('blue','research','completed','Assess the BLUE competitor',{native_id:'native-blue',artifact_id:'artifact-blue'})]),review:'The BLUE artifact was returned; it has no independent QA or receiver acceptance.'},expected:{agents:[{role:'research',marker:'RED',states:['running']},{role:'research',marker:'BLUE',states:['returned']}],no_acceptance:true}},
  {id:'failed-summon',request:'Write the next response after the attempted specialist launch failed.',observations:{dispatch:receipt(job('delta','engineer','failed','Repair the DELTA parser',{error:'DELTA launch held: supported capability unavailable'}))},expected:{agents:[{role:'engineering',marker:'DELTA',states:['failed']}],no_acceptance:true}},
  {id:'durable-observation',request:'The earlier task submission was planned only. This is the first founder-facing response after the durable runtime actually queued these jobs. Write that update.',observations:{jobs:page([job('gamma-engineer','engineer','running','Repair the GAMMA parser',{native_id:'native-gamma'}),job('gamma-review','qa','queued','Independently assess the GAMMA proposal')])},expected:{agents:[{role:'engineering',marker:'GAMMA',states:['running']},{role:'qa',marker:'GAMMA',states:['queued']}]}},
  {id:'result-attribution',request:'Write the result response, attributing the specialist work and separating the Chief of Staff recommendation.',observations:{jobs:page([job('epsilon-engineer','engineer','completed','Implement the EPSILON parsing fix',{native_id:'native-epsilon-engineer',artifact_id:'artifact-epsilon'}),job('epsilon-review','qa','completed','Review the EPSILON parsing fix',{native_id:'native-epsilon-review',artifact_id:'review-epsilon',review_of:{id:'artifact-epsilon',revision:1}})]),artifacts:[{id:'artifact-epsilon',author_role:'engineer',content:'EPSILON parsing fix returned.'},{id:'review-epsilon',author_role:'qa',review_of:'artifact-epsilon',review:{verdict:'Pass',reason:'The exact EPSILON fixture meets its criteria.'}}],cos_recommendation:'Chief of Staff recommends retaining the reviewed EPSILON candidate for the next scoped decision.'},expected:{agents:[{role:'engineering',marker:'EPSILON',states:['returned']},{role:'qa',marker:'EPSILON',states:['pass']},{role:'cos',marker:'EPSILON',states:[]}]}},
  {id:'no-summon',request:'Summarize the accepted OMEGA plan in one sentence: collect a draft, review it, and publish after approval. No specialist was summoned and no roster was requested.',observations:{jobs:[],accepted_plan:'OMEGA: collect a draft, review it, publish after approval.'},expected:{no_roster:true,marker:'OMEGA'}}
];

export function buildVisibilityPrompt(policy) {
  return `Write actual founder-facing responses for these independent fictional SoloCo situations using the supplied policy and tool observations. Do not explain how you would comply: provide the response the founder would read. No tools, dispatch, writes, company actions or new spending. Each case is independent; do not carry activity from another case. Keep the supplied short task labels recognizable so separate assignments remain attributable.\nPolicy:\n${policy}\nCases:\n${JSON.stringify(visibilityCases.map(({expected,...value})=>value))}\nReturn one JSON object only: {"responses":[{"id":"case id","markdown":"the actual founder-facing Markdown response"}]}. Include every case exactly once. Do not return self-assessment flags or a generic communication checklist.`;
}

const rolePatterns={engineering:/\bengineer(?:ing)?\b/i,qa:/\bqa\b|\bquality assurance\b/i,research:/\bresearch(?:er)?s?\b/i,cos:/\bchief of staff\b|\bcos\b/i};
const statePatterns={queued:/\bqueued\b/i,running:/\brunning\b|\bin progress\b|\bworking\b/i,returned:/\breturned\b|\bcomplete(?:d)?\b|\bfinished\b/i,failed:/\bfailed\b|\bheld\b|\bblocked\b|\bcould not\b/i,pass:/\bpass(?:ed)?\b/i};
const stripNegated=text=>text
  .replace(/\b(?:no\s+(?:results?|artifacts?|outputs?)\s+(?:have|has)\s+(?:yet\s+)?been\s+returned|nothing\s+has\s+(?:yet\s+)?been\s+returned)\b/gi,'')
  .replace(/\b(?:not|never|no|isn't|hasn't|without)\s+(?:(?:yet|been|currently|independently|independent|formally|a|an|qa|reviewed|or|and)\s+){0,5}(?:running|started|summoned|returned|completed|finished|accepted|approved|passed|pass|blocked|failed)\b/gi,'');
const stripPendingAcceptance=text=>text.replace(/\b(?:awaiting|pending|waiting\s+for|requires?|needs?)\s+(?:(?:a|an|the|independent|formal)\s+)*(?:qa\s+pass(?:ed)?|acceptance|approval)\b/gi,'');
function highlightedScopes(markdown) {
  const labels=[...markdown.matchAll(/\*\*([^*\n]+)\*\*/g)].filter(match=>Object.values(rolePatterns).some(pattern=>pattern.test(match[1])));
  return labels.map((match,index)=>{
    const text=markdown.slice(match.index,labels[index+1]?.index??markdown.length);
    const inTable=markdown.slice(0,match.index).split(/\r?\n/).at(-1).includes('|');
    // Later narrative may discuss other agents or pending work. Contradictions
    // must belong to this agent's own table row or labelled paragraph.
    const localText=inTable?text.split(/\r?\n/)[0]:text.split(/\r?\n\s*\r?\n/)[0];
    return {label:match[1],text,localText};
  });
}
function knownIdentityTokens(value) {
  const wire=JSON.stringify(value);
  return new Set((wire.match(/\b(?:native|instance|session)[-_][a-z0-9-]+\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)??[]).map(token=>token.toLowerCase()));
}
function gradeCase(fixture,markdown) {
  const errors=[];
  if(typeof markdown!=='string'||!markdown.trim())return ['Missing actual Markdown response'];
  if(markdown.length>4000)errors.push('Response is not compact');
  const {expected}=fixture,scopes=highlightedScopes(markdown),used=new Set();
  for(const agent of expected.agents??[]) {
    const match=scopes.findIndex((scope,index)=>!used.has(index)&&rolePatterns[agent.role].test(scope.label)&&scope.text.toUpperCase().includes(agent.marker)&&agent.states.every(state=>statePatterns[state].test(stripNegated(scope.text))));
    if(match<0)errors.push(`Missing highlighted ${agent.role} assignment/state for ${agent.marker}`);
    else {
      used.add(match);
      const scope=scopes[match],text=stripNegated(scope.localText);
      if(agent.states.includes('queued')&&/\brunning\b|\bcompleted\b|\breturned\b/i.test(text))errors.push(`Contradictory queued state for ${agent.marker}`);
      if(agent.states.includes('failed')&&/\brunning\b|\bcompleted\b|\breturned\b/i.test(text))errors.push(`Contradictory failed state for ${agent.marker}`);
      if(agent.states.includes('pass')&&(/\bblocked\b|\bfail(?:ed)?\b/i.test(stripNegated(scope.label))||/\b(?:review|qa|verdict|result)\b[^.;\n]{0,50}(?:\b(?:is|remains|has|now|currently)\b|:)\s*(?:still\s+)?(?:blocked|fail(?:ed)?)\b/i.test(text)))errors.push(`Contradictory Pass verdict for ${agent.marker}`);
    }
  }
  const affirmative=stripNegated(markdown);
  if(expected.planned_qa) {
    if(!/\bqa\b|quality assurance/i.test(markdown)||!/\bplanned\b|not summoned|not (?:yet )?started/i.test(markdown))errors.push('Missing planned QA handoff');
    if(/\b(?:qa|quality assurance)\b[^\n.]{0,80}\b(?:running|queued|started|summoned)\b/i.test(affirmative))errors.push('Planned QA portrayed as summoned');
  }
  if(expected.no_acceptance&&/\baccepted\b|\bapproved\b|\bqa\s+pass(?:ed)?\b/i.test(stripPendingAcceptance(affirmative)))errors.push('Unproved acceptance claimed');
  if(expected.no_roster) {
    if(['engineering','qa','research'].some(role=>rolePatterns[role].test(markdown)))errors.push('Unchanged or invented specialist roster');
    if(!markdown.toUpperCase().includes(expected.marker))errors.push('Missing requested plan summary');
  }
  const known=knownIdentityTokens(fixture.observations);
  for(const token of knownIdentityTokens(markdown))if(!known.has(token))errors.push('Unobserved identity: '+token);
  return errors;
}
export function gradeVisibility(value) {
  const responses=value?.responses;
  if(!Array.isArray(responses))return {passed:false,cases:[],errors:['Expected actual responses array']};
  const known=new Set(visibilityCases.map(c=>c.id)),errors=[];
  if(responses.some(r=>!known.has(r?.id)))errors.push('Unknown response case');
  const cases=visibilityCases.map(fixture=>{
    const matches=responses.filter(response=>response?.id===fixture.id);
    const failures=matches.length===1?gradeCase(fixture,matches[0].markdown):['Missing or duplicate response case'];
    return {id:fixture.id,passed:failures.length===0,errors:failures,markdown:matches[0]?.markdown??null};
  });
  return {passed:responses.length===visibilityCases.length&&errors.length===0&&cases.every(c=>c.passed),cases,errors,grading_scope:'Deterministic checks of actual fictional Markdown responses; independent semantic review remains required.'};
}

function optionsFor(argv) {
  const options={};
  for(let i=0;i<argv.length;i+=2) {
    if(!['--host','--output','--model','--effort','--timeout-ms'].includes(argv[i])||!argv[i+1]||Object.hasOwn(options,argv[i]))throw Error('Use --host codex|claude --output NEW_REPORT [--model MODEL] [--effort EFFORT] [--timeout-ms 1000..600000]');
    options[argv[i]]=argv[i+1];
  }
  if(!['codex','claude'].includes(options['--host'])||!options['--output'])throw Error('Host and new output report are required');
  if(options['--effort']&&!options['--model'])throw Error('Effort requires an explicit model');
  if(options['--host']==='claude'&&options['--effort'])throw Error('Claude alias-specific effort support is unverified; omit --effort');
  const timeout=Number(options['--timeout-ms']??180000);
  if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>600000)throw Error('Timeout must be 1000..600000 ms');
  return {...options,timeout};
}
export async function runVisibilityEvaluation(argv) {
  const options=optionsFor(argv),host=options['--host'],output=path.resolve(options['--output']);
  if(fs.existsSync(output))throw Error('Preserve prior evaluation; choose a new output report');
  const {modelCatalog,runModel}=await import('../plugins/soloco/runtime/adapters.mjs');
  const selection=normalizeSelection(options['--model']?{mode:'explicit',model:options['--model'],...(options['--effort']?{effort:options['--effort']}:{}),reason:'Evaluate visible specialist attribution on small fictional response cases.'}:{mode:'default',reason:'Use the supported host default for a small fictional response-compliance evaluation.'},host,options['--model']?modelCatalog(host):undefined);
  const policy=fs.readFileSync(new URL('../plugins/soloco/skills/soloco/SKILL.md',import.meta.url),'utf8'),prompt=buildVisibilityPrompt(policy);
  const report={schema:1,kind:'specialist_visibility_actual_responses',host,status:'running',created_at:new Date().toISOString(),policy_sha256:hash(policy),fixture_sha256:hash(JSON.stringify(visibilityCases)),grader_source_sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),prompt_sha256:hash(prompt),fixtures:visibilityCases.map(({expected,...value})=>value),requested:selection,timeout_ms:options.timeout,passed:false,limitations:['Finite fictional response compliance, not proof of all future replies or actual company execution','Production public projections supply the fixture receipts; no actual specialist is summoned by this evaluation','Automated checks require independent semantic review of the retained actual Markdown responses','Requested/applied settings and host usage do not establish effective model settings or billing']};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'soloco-visibility-eval-')),started=Date.now();
  try {
    const response=await runModel(host,null,prompt,directory,options.timeout,selection,{timeoutReason:'Bounded fictional specialist visibility response evaluation.'});
    report.native_id=response.native_id;report.model_evidence=response.model_evidence;report.raw_response=response.text;
    const answer=JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
    report.answer=answer;Object.assign(report,gradeVisibility(answer));report.status=report.passed?'passed_automated_checks':'failed_automated_checks';
  } catch(error) {
    report.status='failed';report.error=String(error.message).slice(0,2000);
    if(error.rejected_output)report.rejected_output=error.rejected_output;
  } finally {
    report.elapsed_ms=Date.now()-started;report.finished_at=new Date().toISOString();
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.rmSync(directory,{recursive:true,force:true});
  }
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runVisibilityEvaluation(process.argv.slice(2)).then(report=>{
  console.log(JSON.stringify({passed:report.passed,status:report.status,cases:report.cases?.length??0,output:path.resolve(process.argv[process.argv.indexOf('--output')+1])}));if(!report.passed)process.exitCode=1;
}).catch(error=>{console.error(error.message);process.exitCode=1;});
