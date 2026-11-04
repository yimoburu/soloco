import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionUsage } from '../plugins/soloco/runtime/selection.mjs';
import { cases,buildPrompt,gradeDecisions } from '../tools/selection-eval.mjs';

function decisions() {
  return {decisions:cases.map(c=>({id:c.id,model_selection:c.unavailable?
    {mode:'default',reason:'Catalog unavailable; brief noncritical proposal permits host default'}:
    {mode:'explicit',model:c.allowed[0][0],effort:c.allowed[0][1],speed:'host_default',reason:`Fit task evidence for ${c.id}`}}))};
}
test('decision evaluator distinguishes task fit, escalation and unavailable catalog',()=>{
  assert.equal(gradeDecisions(decisions()).passed,true);
  const strongest=decisions();
  for(const d of strongest.decisions)if(d.id!=='catalog-unavailable')Object.assign(d.model_selection,{model:'fixture-deep',effort:'high'});
  const graded=gradeDecisions(strongest);
  assert.equal(graded.passed,false);
  assert.deepEqual(graded.cases.filter(c=>!c.passed).map(c=>c.id),['simple','routine']);
  const cheapest=decisions();cheapest.decisions[2].model_selection={mode:'explicit',model:'fixture-small',effort:'low',reason:'Cheapest'};
  assert.equal(gradeDecisions(cheapest).cases[2].passed,false);
});
test('decision evaluator rejects missing/duplicate/unknown cases and invalid or unexplained settings',()=>{
  for(const mutate of [
    v=>v.decisions.pop(),v=>v.decisions.push(v.decisions[0]),v=>v.decisions[0].id='unknown',
    v=>delete v.decisions[0].model_selection.reason,
    v=>v.decisions[0].model_selection.speed='priority',
    v=>v.decisions[4].model_selection={mode:'explicit',model:'fixture-small',reason:'Invent support'}
  ]) {const value=decisions();mutate(value);assert.equal(gradeDecisions(value).passed,false);}
  assert.equal(gradeDecisions(null).passed,false);
});
test('evaluation prompt loads supplied policy and hides scoring answer keys',()=>{
  const prompt=buildPrompt('POLICY_SENTINEL');
  assert.match(prompt,/POLICY_SENTINEL/);assert.match(prompt,/fictional/);
  assert.doesNotMatch(prompt,/"allowed"/);
});
test('usage audit counts full assignment history, separates requests and omits software jobs',()=>{
  const jobs=Object.fromEntries(Array.from({length:12},(_,i)=>[i,{status:i===0?'failed':'completed',host:'codex',
    model_selection:{mode:'explicit',model:'fixture-small',effort:'low',reason:'Exact extraction'},
    ...(i===0?{model_evidence:{applied_controls:{model:'fixture-small'},reported_models:['other']}}:{})}]));
  jobs.legacy={status:'quarantined',host:'codex'};
  jobs.test={kind:'development_test',model_selection:{mode:'explicit',model:'should-not-count'}};
  jobs.oldtest={type:'development_test'};
  const usage=selectionUsage({jobs});
  assert.equal(usage.assignments,13);assert.equal(usage.missing_reasons,1);
  assert.equal(usage.with_applied_controls,1);assert.equal(usage.with_host_reported_models,1);
  assert.equal(usage.groups.find(g=>g.model==='fixture-small').assignments,12);
  assert.equal(usage.groups.find(g=>g.model==='fixture-small').statuses.failed,1);
  assert.equal(usage.groups.find(g=>g.mode==='default').model,null);
  assert.equal(usage.unit,'assignment_count');assert.match(usage.coordinator_usage,/not_collected/);
  assert.ok(!JSON.stringify(usage.groups).includes('other'));
  assert.equal(selectionUsage({}).assignments,0);
});
