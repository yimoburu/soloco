import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentContext } from '../plugins/soloco/runtime/context.mjs';
import { progressSnapshot } from '../plugins/soloco/runtime/progress-view.mjs';
import { progressFor } from '../plugins/soloco/runtime/progress.mjs';

const time = '2026-01-01T00:00:00.000Z';
const job = (id,extra = {}) => ({id,role:'engineer',instance_id:`instance-${id}`,status:'completed',task:`Complete exact task for ${id}`,created_at:time,inputs:[],...extra});
const record = (id,job_id,extra = {}) => ({id,job_id,revision:1,kind:'artifact',status:'Submitted',created_at:time,...extra});
const codes = p => p.diagnostics.map(d => d.code);
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
function scenario() {
  const jobs = [
    job('build',{artifact_id:'candidate',expected_deliverable:'Pure module and tests',task_summary:'Build projection'}),
    job('parallel',{status:'running',task:'Independent source assessment',next_handoff:'Wait for build'}),
    // Software job and receipt follow develop.mjs, not specialist publication.
    {id:'test',kind:'development_test',role:'engineer',development_id:'plan',candidate_id:'candidate',epoch:1,session_id:'fictional-owner',host:'codex',status:'completed',created_at:time,inputs:[],native_id:null,finished_at:time,artifact_id:'receipt'},
    job('qa',{role:'qa',artifact_id:'review',inputs:[{id:'candidate',revision:1}],review_of:{id:'receipt',revision:1}})
  ];
  const payload = {tests_executed:true,status:'passed',exit_code:0,candidate_sha256:'candidate-hash',test_paths:['tests/example.test.mjs'],timeout_ms:30000,max_output_bytes:20000,directory:'/fictional/candidate',finished_at:time};
  const records = [
    record('candidate','build',{development:{type:'candidate',plan_id:'plan',candidate_sha256:'candidate-hash',run:{job_id:'test',status:'completed',receipt_id:'receipt'}}}),
    {id:'receipt',kind:'artifact',author_role:'runtime',author_instance:'test',revision:1,status:'Submitted',created_at:time,content:JSON.stringify(payload),development:{type:'test',plan_id:'plan',candidate_id:'candidate',candidate_sha256:'candidate-hash',result:payload,receipt_sha256:'receipt-hash',acceptance:{at:'2026-01-01T00:01:00Z',review_id:'review',candidate_sha256:'candidate-hash',receipt_sha256:'receipt-hash',source_integrated:false}}},
    record('review','qa',{kind:'review',author_role:'qa',author_instance:'instance-qa',review_of:{id:'receipt',revision:1},review:{verdict:'Pass',permitted_action:'accept_local_development',candidate_sha256:'candidate-hash',receipt_sha256:'receipt-hash',blockers:[]}})
  ];
  return {jobs,records,notices:[]};
}

test('parallel tasks and dependent review preserve exact evidence distinctions',() => {
  const p = progressFor(scenario());
  assert.equal(p.graph.valid,true);
  assert.deepEqual(p.graph.edges.map(e => [e.from,e.to,e.type]).sort(),[['build','qa','input'],['build','test','candidate'],['test','qa','review']]);
  const build = p.nodes.find(n => n.id === 'build');
  assert.equal(build.task,'Complete exact task for build');
  assert.equal(build.summary,'Build projection');
  assert.equal(build.expected_deliverable,'Pure module and tests');
  assert.deepEqual(build.returned,{id:'candidate',revision:1});
  assert.equal(p.nodes.find(n => n.id === 'test').actor,'software');
  assert.equal(p.nodes.find(n => n.id === 'parallel').status,'running');
  assert.equal(p.graph.edges.some(e => e.from === 'parallel' || e.to === 'parallel'),false);
  assert.equal(Object.hasOwn(p.nodes.find(n => n.id === 'parallel'),'expected_deliverable'),false);
  const receipt = p.evidence.find(r => r.id === 'receipt');
  assert.equal(receipt.acceptance.bindings_match,true);
  assert.equal(receipt.acceptance.recorded.source_integrated,false);
  assert.equal(receipt.acceptance.current_applicability,'unknown');
  const review = p.evidence.find(r => r.id === 'review');
  assert.equal(review.review.recorded.verdict,'Pass');
  assert.equal(review.acceptance,null);
  assert.equal(review.review.current_applicability,'unknown');
});

test('canonical software receipt without job_id resolves returned output, input and review edges',() => {
  const s = scenario();
  assert.equal(Object.hasOwn(s.records[1],'job_id'),false);
  s.jobs[3].inputs.push({id:'receipt',revision:1});
  const p = progressFor(s);
  assert.equal(p.graph.valid,true);
  assert.deepEqual(p.nodes.find(n => n.id === 'test').returned,{id:'receipt',revision:1});
  assert.deepEqual(p.graph.edges.filter(e => e.from === 'test').map(e => [e.to,e.type]).sort(),[['qa','input'],['qa','review']]);
  assert.equal(codes(p).includes('returned_link_mismatch'),false);
  assert.equal(codes(p).includes('unresolved_producer'),false);
  s.jobs[3].review_of.revision = 2;
  const stale = progressFor(s);
  assert.equal(stale.graph.edges.some(e => e.type === 'review'),false);
  assert.ok(codes(stale).includes('unresolved_revision'));
});

test('incorrect software job and artifact bindings remain unresolved',() => {
  for (const alter of [
    s => { s.records[1].author_instance = 'missing'; },
    s => { s.records[1].author_instance = 'build'; },
    s => { s.jobs[2].kind = 'specialist'; },
    s => { s.jobs[2].artifact_id = 'other'; },
    s => { delete s.jobs[2].artifact_id; },
    s => { s.records[1].author_role = 'engineer'; },
    s => { s.records[1].development.type = 'candidate'; }
  ]) {
    const s = scenario(); alter(s);
    const p = progressFor(s);
    assert.equal(p.graph.valid,false);
    assert.ok(codes(p).includes('unresolved_producer'));
    assert.equal(p.graph.edges.some(e => e.reference?.id === 'receipt'),false);
    assert.equal(p.evidence.find(r => r.id === 'receipt').acceptance.bindings_match,false);
    if (s.jobs[2].artifact_id != null) assert.ok(codes(p).includes('returned_link_mismatch'));
  }
});

test('conflicting producer fields and competing returned-output claims cannot create links',() => {
  for (const alter of [
    s => { s.records[1].job_id = 'build'; },
    s => { s.jobs.push(job('impostor',{artifact_id:'receipt'})); },
    s => { s.jobs.push(job('impostor',{kind:'development_test',artifact_id:'receipt'})); },
    s => { s.jobs.push(job('impostor',{artifact_id:'candidate'})); }
  ]) {
    const s = scenario(); alter(s);
    const p = progressFor(s);
    const conflicts = p.diagnostics.filter(d => d.code === 'conflicting_producer');
    assert.ok(conflicts.length > 0);
    assert.equal(p.graph.valid,false);
    assert.ok(codes(p).includes('returned_link_mismatch'));
    assert.ok(codes(p).includes('unresolved_producer'));
    for (const d of conflicts) assert.equal(p.graph.edges.some(e => e.reference?.id === d.record.id),false);
  }
});

test('ordinary publications use job_id and never infer a producer from author_instance',() => {
  const s = {jobs:[job('producer',{artifact_id:'r'}),job('consumer',{inputs:[{id:'r',revision:1}]})],records:[record('r','producer',{author_role:'engineer',author_instance:'unrelated-instance'})]};
  assert.equal(progressFor(s).graph.valid,true);
  delete s.records[0].job_id;
  s.records[0].author_instance = 'producer';
  const p = progressFor(s);
  assert.equal(p.graph.valid,false);
  assert.deepEqual(p.graph.edges,[]);
  assert.ok(codes(p).includes('unresolved_producer'));
  assert.ok(codes(p).includes('returned_link_mismatch'));
});

test('acceptance counterexamples remain recorded but cannot pass structural binding checks',() => {
  for (const alter of [
    s => { s.records[1].development.acceptance.candidate_sha256 = 'wrong'; },
    s => { s.records[0].development.run.receipt_id = 'other'; },
    s => { s.records[2].review_of.revision = 2; },
    s => { s.records[1].status = 'Quarantined'; },
    s => { s.records[0].status = 'Quarantined'; },
    s => { s.records[1].development.result.tests_executed = false; },
    s => { s.jobs[2].status = 'failed'; }
  ]) {
    const s = scenario(); alter(s);
    const p = progressFor(s), a = p.evidence.find(r => r.id === 'receipt').acceptance;
    assert.ok(a.recorded);
    assert.equal(a.bindings_match,false);
    assert.ok(codes(p).includes('acceptance_binding_mismatch'));
  }
});

test('exact revisions only; old content snapshots cannot identify their producer',() => {
  const s = {jobs:[job('producer',{artifact_id:'r'}),job('consumer',{inputs:[{id:'r',revision:1},{id:'missing',revision:1}]})],records:[record('r','producer',{revision:2,previous:[{revision:1,content:'old'}]})]};
  const p = progressFor(s);
  assert.equal(p.graph.edges.length,0);
  assert.equal(p.graph.valid,false);
  assert.equal(p.diagnostics.filter(d => d.code === 'unresolved_revision').length,2);
  s.jobs[1].inputs = [{id:'r',revision:2}];
  assert.equal(progressFor(s).graph.edges.length,1);
  s.jobs[0].artifact_id = 'different';
  assert.ok(codes(progressFor(s)).includes('unresolved_producer'));
});

test('quarantined and rejected outputs stay inspectable without acceptance',() => {
  const s = {jobs:[job('late',{status:'quarantined',artifact_id:'q'}),job('failed',{status:'failed',rejected_output:{text:'retained rejected response',truncated:false,reason:'invalid peer message'}})],records:[record('q','late',{status:'Quarantined',quarantined_files:[{path:'example.mjs',content:'partial'}]})]};
  const p = progressFor(s);
  assert.equal(p.nodes[0].rejected_output.reason,'invalid peer message');
  assert.deepEqual(p.nodes.find(n => n.id === 'late').returned,{id:'q',revision:1});
  assert.equal(p.evidence[0].status,'Quarantined');
  assert.equal(p.evidence[0].quarantined_files[0].content,'partial');
  assert.equal(p.evidence[0].acceptance,null);
});

test('explicit dependency, input and review types stay separate; cycles are excluded',() => {
  const s = {jobs:[job('a',{depends_on:['b','missing','a'],artifact_id:'r'}),job('b',{inputs:[{id:'r',revision:1}]}),job('c',{depends_on:['b']})],records:[record('r','a')]};
  const p = progressFor(s);
  assert.equal(p.graph.valid,false);
  assert.deepEqual(p.graph.edges,[{from:'b',to:'c',type:'dependency',reference:null}]);
  for (const code of ['self_relation','unknown_job_relation','cyclic_relation']) assert.ok(codes(p).includes(code));
  assert.equal(p.diagnostics.filter(d => d.code === 'cyclic_relation').length,2);
});

test('duplicate identities and absent producers are unresolved rather than guessed',() => {
  const p = progressFor({jobs:[job('same'),job('same'),job('consumer',{inputs:[{id:'r',revision:1}]})],records:[record('r','same')]});
  assert.equal(p.nodes.some(n => n.id === 'same'),false);
  assert.equal(p.graph.valid,false);
  assert.ok(codes(p).includes('ambiguous_identity'));
  assert.ok(codes(p).includes('unresolved_producer'));
  assert.deepEqual(p.graph.edges,[]);
});

test('timeline retains instants, discloses ties and missing or invalid dates',() => {
  const p = progressFor({jobs:[job('b'),job('a',{created_at:'2025-12-31T16:00:00-08:00',finished_at:'invalid'}),{id:'undated',inputs:[]}]});
  assert.deepEqual(p.events.map(e => e.id),['a','b']);
  assert.ok(p.events.every(e => e.tied));
  assert.ok(codes(p).includes('missing_date'));
  assert.ok(codes(p).includes('invalid_date'));
  assert.equal(p.coverage.historical_states,'unavailable');
  assert.equal(p.coverage.window,null);
  assert.equal(p.nodes.length,3);
});

test('all unresolved notices preserve kind, reference, provenance, seen and delivery facts',() => {
  const notices = [
    {id:'n1',kind:'decision_required',summary:'Decision needed',reference:'build',created_at:time,seen_at:time,deliveries:[{channel:'chat',at:time}],resolution:null,author_instance:'origin'},
    {id:'n2',kind:'must_know',summary:'Unknown original job',reference:'absent',created_at:time,resolution:null},
    {id:'n3',kind:'must_know',reference:'candidate',created_at:time,resolution:null},
    {id:'resolved',kind:'must_know',created_at:time,resolution:{at:time,text:'Closed'}}
  ];
  const s = scenario(); s.notices = notices;
  const p = progressFor(s);
  assert.deepEqual(p.attention.map(a => a.notice),notices.slice(0,3));
  assert.deepEqual(p.attention[0].link,{entity:'job',id:'build'});
  assert.equal(p.attention[1].link,null);
  assert.deepEqual(p.attention[2].link,{entity:'record',id:'candidate'});
  assert.equal(p.attention[0].notice.resolution,null);
  assert.ok(codes(p).includes('unresolved_notice_reference'));
});

test('array/map snapshots and insertion permutations are deterministic and detached',() => {
  const s = scenario();
  s.notices = [{id:'n',kind:'must_know',reference:'build',created_at:time,resolution:null}];
  const before = JSON.stringify(s);
  freeze(s);
  const p = progressFor(s);
  assert.equal(JSON.stringify(s),before);
  const mapped = Object.fromEntries(['jobs','records','notices'].map(k => [k,Object.fromEntries([...s[k]].reverse().map(r => [r.id,r]))]));
  assert.deepEqual(progressFor(mapped),p);
  assert.deepEqual(progressFor({...s,jobs:[...s.jobs].reverse(),records:[...s.records].reverse()}),p);
  p.nodes.find(n => n.id === 'qa').inputs[0].id = 'changed';
  p.attention[0].notice.summary = 'changed';
  p.evidence.find(r => r.id === 'receipt').acceptance.recorded.review_id = 'changed';
  assert.equal(JSON.stringify(s),before);
  assert.deepEqual(progressFor({}).nodes,[]);
  assert.equal(progressFor({}).coverage.resolved_notice_history,'not guaranteed by supplied snapshot');
});


test('founder context is non-job evidence; claimed specialist outputs still need producers',()=>{
  const s={jobs:[job('consumer',{inputs:[{id:'intent',revision:1}]})],records:[record('intent',null,{kind:'intent',author_role:'runner'})]};
  const p=progressFor(s);
  assert.equal(p.graph.valid,true);
  assert.deepEqual(p.nodes[0].context_inputs,[{id:'intent',revision:1}]);
  assert.equal(p.evidence[0].context,true);
  s.records[0].kind='artifact';
  assert.equal(progressFor(s).evidence[0].context,true);
  s.records[0].author_role='engineer';
  assert.ok(codes(progressFor(s)).includes('unresolved_producer'));
});

test('candidate linkage requires canonical job, plan, hash and receipt bindings',()=>{
  for(const alter of [
    s=>{s.records[0].development.run.job_id='other';},
    s=>{s.jobs[2].candidate_id='other';},
    s=>{s.records[1].development.candidate_sha256='other';},
    s=>{s.records[0].development.plan_id='other';},
    s=>{s.records[0].status='Quarantined';},
  ]) {
    const s=scenario();alter(s);
    const p=progressFor(s);
    assert.equal(p.graph.edges.some(e=>e.type==='candidate'),false);
    assert.ok(codes(p).includes('unresolved_candidate'));
  }
  const s=scenario();delete s.jobs[2].artifact_id;delete s.records[0].development.run.receipt_id;
  s.jobs[2].status='running';s.records.splice(1,1);
  assert.equal(progressFor(s).graph.edges.some(e=>e.type==='candidate'),true);
});

// Shapes follow engine.save/control and develop/prototype plan/authorize. No
// bodies, action, recorded_by or prototype discriminator survive the public view.
function contextScenario() {
  const records = [
    {id:'intent',kind:'intent',author_role:'runner',author_instance:'cos',revision:2,status:'Draft',created_at:time},
    ...['plan','artifact','decision','preference'].map(kind => ({id:`saved-${kind}`,kind,author_role:'runner',author_instance:'cos',revision:1,status:'Draft',created_at:time})),
    {id:'development',kind:'artifact',author_role:'runner',author_instance:'cos',revision:1,status:'Draft',created_at:time,development:{type:'plan',scope:{},attempts:[]}},
    {id:'prototype',kind:'artifact',author_role:'runner',author_instance:'cos',revision:1,status:'Draft',created_at:time,prototype:{type:'plan',scope:{},attempts:[]}},
    ...['development','prototype'].map(plan_id => ({id:`authorize-${plan_id}`,kind:'decision',author_role:'human_founder',recorded_by:'founder',revision:1,status:'Recorded',plan_id,created_at:time})),
    {id:'control',kind:'decision',author_role:'human_founder',recorded_by:'founder',status:'Recorded',action:'pause',created_at:time}
  ];
  const consumer = job('consumer',{development_id:'development',prototype_id:'prototype',inputs:records.filter(r=>r.author_role==='runner').map(r=>({id:r.id,revision:r.revision}))});
  const state = {records:Object.fromEntries(records.map(r=>[r.id,r])),jobs:{consumer},roles:{engineer:{}},notices:[],messages:[]};
  consumer.inputs = assignmentContext(state,consumer).inputs;
  return state;
}

test('canonical assignment context survives pure and public projection without job edges',()=>{
  const s=contextScenario();
  assert.equal(s.jobs.consumer.inputs.length,Object.keys(s.records).length);
  for(const p of [progressFor(s),progressSnapshot(s),progressSnapshot(JSON.parse(JSON.stringify(s)))]) {
    assert.equal(p.graph.valid,true);
    assert.deepEqual(p.graph.edges,[]);
    assert.deepEqual(JSON.parse(JSON.stringify(p.nodes[0].context_inputs)),JSON.parse(JSON.stringify(s.jobs.consumer.inputs)));
    assert.ok(p.evidence.every(r=>r.context));
    assert.equal(codes(p).includes('unresolved_producer'),false);
    assert.equal(codes(p).includes('unresolved_revision'),false);
  }
});

test('context references require exact positive revisions except genuinely unversioned founder decisions',()=>{
  for(const id of ['saved-artifact','saved-plan','development','prototype','authorize-development','control']) {
    for(const revision of [undefined,null,0,-1,1.5,'1',2]) {
      const s=contextScenario(), input=s.jobs.consumer.inputs.find(r=>r.id===id);
      input.revision=revision;
      const p=progressFor(s), valid=id==='control'?revision===undefined:revision===s.records[id].revision;
      assert.equal(p.graph.valid,valid,`${id} reference ${revision}`);
      assert.equal(p.nodes[0].context_inputs.some(r=>r.id===id),valid);
      assert.equal(p.diagnostics.some(d=>d.code==='unresolved_revision'&&d.reference?.id===id),!valid);
      assert.deepEqual(p.graph.edges,[]);
    }
  }
  for(const id of ['saved-artifact','saved-plan','authorize-development','control']) {
    for(const revision of [undefined,null,0,-1,1.5,'1']) {
      // Role/kind is the public discriminator for unversioned founder decisions.
      if(['authorize-development','control'].includes(id)&&revision===undefined)continue;
      const s=contextScenario();
      s.records[id].revision=revision;
      s.jobs.consumer.inputs.find(r=>r.id===id).revision=revision;
      const p=progressFor(s);
      assert.equal(p.graph.valid,false);
      assert.equal(p.evidence.find(r=>r.id===id).context,false);
      assert.equal(p.nodes[0].context_inputs.some(r=>r.id===id),false);
      assert.ok(codes(p).includes('unresolved_revision'));
    }
  }
  const s=contextScenario();delete s.records.control;
  const p=progressFor(s);
  assert.equal(p.graph.valid,false);
  assert.equal(p.nodes[0].context_inputs.some(r=>r.id==='control'),false);
  assert.ok(codes(p).includes('unresolved_revision'));
});

test('context roles cannot claim specialist producers or competing output bindings',()=>{
  for(const id of ['saved-artifact','authorize-development','control']) {
    for(const claim of ['job_id','output']) {
      const s=contextScenario();
      s.jobs.producer=job('producer',claim==='output'?{artifact_id:id}:{});
      if(claim==='job_id')s.records[id].job_id='producer';
      const p=progressFor(s);
      assert.equal(p.graph.valid,false);
      assert.equal(p.evidence.find(r=>r.id===id).context,false);
      assert.equal(p.nodes.find(n=>n.id==='consumer').context_inputs.some(r=>r.id===id),false);
      assert.equal(p.graph.edges.some(e=>e.reference?.id===id),false);
      assert.ok(codes(p).includes('conflicting_producer'));
    }
  }
});

test('unknown roles and noncanonical kinds never become non-job context',()=>{
  for(const [author_role,kind] of [['unknown','artifact'],['engineer','artifact'],['runtime','artifact'],['human_founder','artifact'],['runner','review']]) {
    const s={jobs:[job('consumer',{inputs:[{id:'r',revision:1}]})],records:[record('r',undefined,{author_role,kind})]};
    const p=progressFor(s);
    assert.equal(p.graph.valid,false);
    assert.deepEqual(p.nodes[0].context_inputs,[]);
    assert.equal(p.evidence[0].context,false);
    assert.ok(codes(p).includes('unresolved_producer'));
  }
});

test('specialist lineage stays versioned and rejects explicit unknown or mismatched author roles',()=>{
  for(const revision of [undefined,null,0,-1,1.5,'1',1,2]) {
    const s={jobs:[job('producer',{artifact_id:'r'}),job('consumer',{inputs:[{id:'r',revision}]})],records:[record('r','producer',{author_role:'engineer',revision})]};
    const p=progressFor(s),valid=Number.isInteger(revision)&&revision>0;
    assert.equal(p.graph.valid,valid);
    assert.equal(p.graph.edges.length,valid?1:0);
    assert.equal(p.evidence[0].context,false);
    assert.deepEqual(p.nodes.find(n=>n.id==='consumer').context_inputs,[]);
  }
  for(const author_role of ['unknown','qa']) {
    const p=progressFor({jobs:[job('producer',{artifact_id:'r'}),job('consumer',{inputs:[{id:'r',revision:1}]})],records:[record('r','producer',{author_role})]});
    assert.equal(p.graph.valid,false);
    assert.deepEqual(p.graph.edges,[]);
    assert.ok(codes(p).includes('unresolved_producer'));
  }
});
