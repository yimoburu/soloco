import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelection, selectionKey, activityFor } from '../plugins/soloco/runtime/selection.mjs';
import { commandArgs, parseOutput } from '../plugins/soloco/runtime/adapters.mjs';

const catalog={supported:true,source:'host_catalog',models:[
  {id:'test-small',supported_efforts:['low','medium'],default_effort:'low'},
  {id:'test-review',supported_efforts:['medium','high','ultra'],default_effort:'medium'},
]};
const explicit=(extra={})=>({mode:'explicit',model:'test-small',effort:'low',reason:'Clear scoped task with objective checks',...extra});

test('selection preserves the legacy default and admits only advertised model/effort choices',()=>{
  assert.deepEqual(normalizeSelection(undefined,'codex'),{mode:'default'});
  assert.deepEqual(normalizeSelection(null,'codex'),{mode:'default'});
  const choice=normalizeSelection(explicit(),'codex',catalog);
  assert.equal(choice.model,'test-small');assert.equal(choice.effort,'low');
  assert.equal(choice.reason,'Clear scoped task with objective checks');
  assert.equal(normalizeSelection(explicit({model:'test-review',effort:'ultra'}),'codex',catalog).effort,'ultra');
  assert.throws(()=>normalizeSelection(explicit({model:'invented-model'}),'codex',catalog));
  assert.throws(()=>normalizeSelection(explicit({effort:'high'}),'codex',catalog));
  assert.throws(()=>normalizeSelection(explicit(),'codex',{supported:false,models:[],error:'Catalog unavailable'}));
});

test('selection rejects malformed requests and reset cannot carry a stale explicit setting',()=>{
  for(const value of [[],true,'test-small',{},explicit({reason:''}),explicit({reason:'x'.repeat(301)}),explicit({model:''}),
    explicit({effort:4}),explicit({fallback:'test-review'}),{mode:'default',model:'test-small',reason:'Reset'},
    {mode:'default',effort:'low',reason:'Reset'},{mode:'surprise',reason:'Invalid'}]) {
    assert.throws(()=>normalizeSelection(value,'codex',catalog),JSON.stringify(value));
  }
  const reset=normalizeSelection({mode:'default',reason:'Return to host default'},'codex',catalog);
  assert.equal(reset.mode,'default');assert.equal(reset.model,undefined);assert.equal(reset.effort,undefined);
});

test('session selection keys change for model/effort/reset but not an explanation',()=>{
  const first=normalizeSelection(explicit(),'codex',catalog);
  assert.equal(selectionKey(first),selectionKey({...first,reason:'Equivalent task rationale'}));
  assert.notEqual(selectionKey(first),selectionKey({...first,effort:'medium'}));
  assert.notEqual(selectionKey(first),selectionKey({...first,model:'test-review'}));
  assert.notEqual(selectionKey(first),selectionKey({mode:'default'}));
  assert.equal(selectionKey(undefined),selectionKey({mode:'default'}));
});

test('explicit flags reach fresh and resumed host commands while isolation remains intact',()=>{
  const choice=explicit();
  for(const native of [undefined,'native-prior']) {
    const codex=commandArgs('codex',native,choice),claude=commandArgs('claude',native,{...choice,model:'haiku'});
    assert.equal(codex[codex.indexOf('--model')+1],'test-small');
    assert.ok(codex.includes('model_reasoning_effort="low"'));
    for(const required of ['--ignore-user-config','sandbox_mode="read-only"','approval_policy="never"','features.shell_tool=false','features.multi_agent=false','web_search="disabled"'])assert.ok(codex.includes(required),required);
    assert.equal(claude[claude.indexOf('--model')+1],'haiku');
    assert.equal(claude[claude.indexOf('--effort')+1],'low');
    assert.equal(claude[claude.indexOf('--tools')+1],'');assert.ok(claude.includes('--strict-mcp-config'));
    assert.equal(claude[claude.indexOf('--permission-mode')+1],'plan');
    assert.ok(!claude.includes('--fallback-model'));assert.ok(!JSON.stringify(codex).includes('dangerously'));
    if(native){assert.ok(codex.includes(native));assert.ok(claude.includes(native));}
  }
  for(const host of ['codex','claude']) {
    assert.ok(!commandArgs(host,null,{mode:'default'}).includes('--model'));
    assert.ok(!commandArgs(host,null,{mode:'default'}).includes('--effort'));
  }
});

test('host output never turns a requested model or successful exit into observed model/effort',()=>{
  const codex=parseOutput('codex','{"type":"thread.started","thread_id":"native"}\n{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}');
  assert.deepEqual(codex.model_evidence.reported_models,[]);
  assert.equal(codex.model_evidence.reported_effort,null);
  assert.equal(codex.model_evidence.verification,'unverified');
  const withoutUsage=parseOutput('claude',JSON.stringify({subtype:'success',session_id:'native',result:'ok'}));
  assert.deepEqual(withoutUsage.model_evidence.reported_models,[]);
  assert.equal(withoutUsage.model_evidence.verification,'unverified');
  const withUsage=parseOutput('claude',JSON.stringify({subtype:'success',session_id:'native',result:'ok',modelUsage:{
    'claude-test-old':{inputTokens:10,outputTokens:2,costUSD:0.01,private_field:'must not retain'},
    'claude-test-new':{inputTokens:20,outputTokens:3,costUSD:0.02},
  }}));
  assert.deepEqual(withUsage.model_evidence.reported_models.sort(),['claude-test-new','claude-test-old']);
  assert.match(withUsage.model_evidence.scope,/session/);
  assert.equal(withUsage.model_evidence.reported_effort,null);
  assert.equal(withUsage.model_evidence.verification,'host_reported');
  assert.ok(!JSON.stringify(withUsage).includes('must not retain'));
});

function stateWithJobs(jobs,records={}) {
  return {roles:{pm:{name:'Product Manager'},qa:{name:'QA & Eval'},engineer:{name:'Software Engineer'}},
    jobs:Object.fromEntries(jobs.map((j,i)=>[j.id,{role:'pm',instance_id:'pm-instance',task:'Detailed private implementation instructions',task_summary:'Define the next useful change',created_at:new Date(1000+i).toISOString(),...j}])),records};
}

test('activity shows observed lifecycle, review and handoff separately without inventing acceptance',()=>{
  const s=stateWithJobs([
    {id:'queued',status:'queued',next_handoff:'Engineering checks feasibility',model_selection:explicit()},
    {id:'returned',status:'completed'},
    {id:'reviewed',role:'qa',instance_id:'qa-instance',status:'completed',artifact_id:'qa-pass'},
    {id:'quarantined',role:'qa',status:'quarantined',artifact_id:'qa-quarantined'},
    {id:'failed',status:'failed',error:'Model unavailable'},
    {id:'interrupted',status:'interrupted'},
    {id:'cancelled',status:'cancelled'},
  ],{
    'qa-pass':{id:'qa-pass',kind:'review',status:'Submitted',review_of:{id:'work',revision:1},review:{verdict:'Pass'}},
    'qa-quarantined':{id:'qa-quarantined',kind:'review',status:'Quarantined',review_of:{id:'work',revision:1},review:{verdict:'Pass'}},
  });
  const rows=activityFor(s),byId=Object.fromEntries(rows.map(r=>[r.job_id,r]));
  assert.equal(byId.queued.agent,'Product Manager');assert.equal(byId.queued.instance_id,'pm-instance');
  assert.equal(byId.queued.task,'Define the next useful change');assert.equal(byId.queued.status,'queued');
  assert.equal(byId.returned.status,'returned');assert.equal(byId.reviewed.status,'returned');
  assert.equal(byId.reviewed.review.verdict,'Pass');assert.ok(!byId.quarantined.review);
  for(const status of ['failed','interrupted','cancelled','quarantined'])assert.equal(byId[status].status,status);
  assert.equal(byId.queued.next_handoff.status,'planned');
  assert.match(byId.queued.next_handoff.description,/Engineering/);
  assert.ok(!JSON.stringify(rows).includes('Detailed private implementation instructions'));
  assert.ok(rows.every(r=>r.status!=='accepted' && r.accepted!==true && r.percent===undefined));
});

test('activity retains active jobs even when newer terminal history is bounded',()=>{
  const jobs=[{id:'active-old',status:'running',created_at:new Date(1).toISOString()}];
  for(let i=0;i<25;i++)jobs.push({id:`old-${i}`,status:'completed'});
  const rows=activityFor(stateWithJobs(jobs));
  assert.ok(rows.some(r=>r.job_id==='active-old' && r.status==='running'));
  assert.ok(rows.length<jobs.length);
  const software=activityFor(stateWithJobs([{id:'test',kind:'development_test',role:'engineer',status:'running'}]))[0];
  assert.match(software.agent,/software|test runner/i);
  assert.notEqual(software.agent,'Software Engineer');
  assert.equal(software.requested_model,null);
  assert.equal(software.requested_effort,null);
  assert.equal(software.model_evidence.verification,'not_applicable');
});
