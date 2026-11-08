import test from 'node:test';
import assert from 'node:assert/strict';
import {visibilityCases,buildVisibilityPrompt,gradeVisibility} from '../tools/specialist-visibility-eval.mjs';

const samples={
  'queued-and-planned':'**Engineering — queued:** Repair the ALPHA parser.\n\n**QA — planned / not summoned:** Review ALPHA after Engineering returns it.',
  'resumed-and-reviewer':'**Engineering — running:** Resumed the BETA parser work in native-beta-resumed.\n\n**Independent QA — queued:** Review the BETA candidate.',
  'distinct-researchers':'**Research (RED) — running:** Assess the RED competitor.\n\n**Research (BLUE) — returned:** The BLUE competitor assessment is complete; it is not yet accepted.',
  'failed-summon':'**Engineering — held:** DELTA could not launch because the required capability is unavailable.',
  'durable-observation':'**Engineering — running:** Repair the GAMMA parser.\n\n**QA — queued:** Independently assess the GAMMA proposal.',
  'result-attribution':'**Engineering — returned:** Implemented the EPSILON parsing fix.\n\n**QA — Pass:** The exact EPSILON candidate meets the fixture criteria.\n\n**Chief of Staff:** I recommend retaining the reviewed EPSILON candidate for the next scoped decision.',
  'no-summon':'The OMEGA plan is to collect a draft, review it, and publish after approval.'
};
const answer=()=>({responses:visibilityCases.map(c=>({id:c.id,markdown:samples[c.id]}))});
const change=(id,markdown)=>{const value=answer();value.responses.find(r=>r.id===id).markdown=markdown;return value;};

test('actual response grading accepts prominent attribution, state and concise no-summon synthesis',()=>{
  assert.equal(gradeVisibility(answer()).passed,true);
  const table=change('resumed-and-reviewer','| Agent | State | Assignment |\n|---|---|---|\n| **Engineering** | running | BETA repair resumed |\n| **QA** | queued | BETA candidate review |');
  assert.equal(gradeVisibility(table).passed,true);
  const honest=change('distinct-researchers','**Research RED — running:** Assess RED.\n\n**Research BLUE — complete:** BLUE assessment returned; no independent QA Pass or receiver acceptance is recorded. It is not reviewed or accepted.');
  assert.equal(gradeVisibility(honest).passed,true);
  assert.equal(gradeVisibility(change('no-summon','**Chief of Staff:** '+samples['no-summon'])).passed,true);
});
test('grading rejects declarations of compliance without actual founder-facing responses',()=>{
  for(const value of [null,{passed:true},{responses:[]},{responses:visibilityCases.map(c=>({id:c.id,compliant:true}))}])assert.equal(gradeVisibility(value).passed,false);
});
test('each agent requires its own highlighted attribution associated with its task and state',()=>{
  for(const value of [
    change('resumed-and-reviewer','Engineering is running on BETA. QA is queued to review BETA.'),
    change('resumed-and-reviewer','**Engineering — running:** BETA repair. QA queued to review BETA.'),
    change('resumed-and-reviewer','**Engineering — queued:** BETA repair.\n\n**QA — running:** BETA review.'),
    change('distinct-researchers','**Research — running:** Assess RED and BLUE competitors.'),
    change('durable-observation','**Engineering — running:** GAMMA repair.\n\n**QA — queued:** An unrelated task.'),
  ])assert.equal(gradeVisibility(value).passed,false);
});
test('planned, failed and returned work cannot be promoted to running or accepted',()=>{
  for(const value of [
    change('queued-and-planned','**Engineering — queued:** ALPHA repair.\n\n**QA — running:** ALPHA review was planned and is now summoned.'),
    change('queued-and-planned','**Engineering — queued and running:** ALPHA repair. QA planned / not summoned.'),
    change('failed-summon','**Engineering — failed but running:** DELTA repair.'),
    change('distinct-researchers',samples['distinct-researchers']+' The BLUE work is accepted.'),
    change('result-attribution','**Engineering — returned:** EPSILON fix.\n\n**QA — Pass:** EPSILON candidate meets criteria.'),
  ])assert.equal(gradeVisibility(value).passed,false);
});
test('unobserved identities and unchanged rosters do not pass',()=>{
  assert.equal(gradeVisibility(change('failed-summon',samples['failed-summon']+' Native ID: native-invented.')).passed,false);
  assert.equal(gradeVisibility(change('failed-summon',samples['failed-summon']+' Native session ID: 12345678-1234-4234-8234-123456789012.')).passed,false);
  assert.equal(gradeVisibility(change('no-summon',samples['no-summon']+' **Engineering:** no change.')).passed,false);
});
test('a highlighted Pass cannot hide a contradictory current QA verdict',()=>{
  for(const verdict of ['The EPSILON review is blocked and failed.','The EPSILON verdict: Fail.','QA currently blocked.']) {
    const response=samples['result-attribution'].replace('The exact EPSILON candidate meets the fixture criteria.',verdict);
    assert.equal(gradeVisibility(change('result-attribution',response)).passed,false,verdict);
  }
  const conflictingLabel=samples['result-attribution'].replace('**QA — Pass:**','**QA — Pass / Blocked:**');
  assert.equal(gradeVisibility(change('result-attribution',conflictingLabel)).passed,false);
  const history=samples['result-attribution'].replace('The exact EPSILON candidate meets the fixture criteria.','The EPSILON candidate meets the fixture criteria; the earlier failed attempt remains retained.');
  assert.equal(gradeVisibility(change('result-attribution',history)).passed,true);
});
test('pending QA is not acceptance, and pending language cannot erase a separate acceptance claim',()=>{
  const pending=samples['distinct-researchers'].replace('it is not yet accepted.','it is awaiting QA Pass and receiver acceptance.');
  assert.equal(gradeVisibility(change('distinct-researchers',pending)).passed,true);
  assert.equal(gradeVisibility(change('distinct-researchers',pending+' The BLUE work is already accepted.')).passed,false);
});
test('queued state checks stay in the labelled row or paragraph rather than later narrative',()=>{
  const laterNarrative=samples['resumed-and-reviewer']+'\n\nNo results have been returned. Engineering is still running, and QA has no verdict.';
  assert.equal(gradeVisibility(change('resumed-and-reviewer',laterNarrative)).passed,true);
  const table='| Specialist | State | Assignment |\n|---|---|---|\n| **Engineering** | Running | BETA repair resumed |\n| **QA** | Queued, not yet running | BETA candidate review |\n\nNothing has been returned, so there is no QA verdict.';
  assert.equal(gradeVisibility(change('resumed-and-reviewer',table)).passed,true);
  assert.equal(gradeVisibility(change('resumed-and-reviewer',samples['resumed-and-reviewer'].replace('**Independent QA — queued:**','**Independent QA — queued and running:**'))).passed,false);
});
test('missing, duplicate and unknown cases cannot manufacture overall acceptance',()=>{
  const missing=answer();missing.responses.pop();assert.equal(gradeVisibility(missing).passed,false);
  const duplicate=answer();duplicate.responses[0]=duplicate.responses[1];assert.equal(gradeVisibility(duplicate).passed,false);
  const unknown=answer();unknown.responses.push({id:'invented',markdown:'**Engineering** queued.'});assert.equal(gradeVisibility(unknown).passed,false);
});
test('prompt loads actual policy and production presentation cues without exposing grading keys',()=>{
  const prompt=buildVisibilityPrompt('POLICY_SENTINEL');
  assert.match(prompt,/POLICY_SENTINEL/);assert.match(prompt,/fictional/);assert.match(prompt,/actual founder-facing/);
  assert.doesNotMatch(prompt,/"expected"|"no_acceptance"|"planned_qa"/);
  assert.ok(visibilityCases[0].observations.dispatch.founder_response);
  assert.ok(visibilityCases[4].observations.jobs.founder_response);
});
