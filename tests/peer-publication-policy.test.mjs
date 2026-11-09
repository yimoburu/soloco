// Real temporary P1/P2 commands and protected observer mechanics. All source,
// process and native identities are synthetic; no native qualification is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical, peerDigest} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {execute, createRuntimeObserver, publicationPolicyEvidence, digest} from '../plugins/soloco/runtime/peers/model.mjs';
import {peerFixture} from './peer-fixture.mjs';

const actor = principal_id => ({principal_id});
const ref = (family, row) => ({family, id:row.id, revision:row.revision, sha256:row.sha256});
const oid = char => char.repeat(40);
const copy = value => JSON.parse(canonical(value));
const hasCode = expected => error => error.code === expected;
const atomicMetadata = () => ({protocol:'github-atomic-refs-v1', api_host:'api.github.com', repository_node_id:'R_synthetic', base_ref:'refs/heads/main', head_ref:'refs/heads/topic', before_base_oid:oid('b'), before_head_oid:oid('a'), after_oid:oid('d'), prepared_merge_oid:oid('d'), prepared_tree_oid:oid('c'), prepared_parents:[oid('b'), oid('a')], unknown:{retained:'Complete opaque future metadata', unicode:'雪😀'}});
const githubMetadata = () => ({owner:'owner', repo:'repo', number:1, head_sha:oid('a'), base_sha:oid('b'), tree_sha:oid('c'), base_branch:'main', merge_method:'merge', scope_sha256:peerDigest('fixture scope'), harness_sha256:peerDigest('fixture harness'), policy_sha256:peerDigest('fixture policy'), author_principal_id:'cos-a', expected_app_id:42, check_name:'fixture-gate', required_native_approvals:0, native_reviews:[]});

function sqlState(f) {
  const tables = f.ledger.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return tables.map(({name, sql}) => ({name, sql, rows:f.ledger.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map(row => JSON.stringify(row)).sort()}));
}
function fixture(t, {policy = {}, grantMax = 100, legacy = false, grantExpirations = {}} = {}) {
  const f = peerFixture({control:{policy:{worker_cap:3, queue_limit:1000, principal_queue_limit:100, max_context_bytes:65536, max_model_calls:100, ...policy}}});
  t.after(() => f.close()); let operation = 0;
  f.get = (family, id) => f.ledger.read(tx => tx.get(family, id));
  // Raw mutations below create corruption counterexamples or legacy INPUT DATA.
  // They never manufacture a positive task, review, observation or proof seal.
  f.corrupt = (family, id, value) => f.ledger.write('fixture.counterexample', 'founder', tx => tx.put(family, id, value, tx.get(family, id)?.revision ?? 0));
  f.run = (who, action, args = {}) => execute(f.ledger, actor(who), action, {operation_id:`policy-${++operation}`, ...args});
  f.observer = createRuntimeObserver(f.ledger);
  f.observe = (action, args) => f.observer.record(action, {operation_id:`policy-observer-${++operation}`, ...args});
  for (const who of ['cos-a', 'cos-b', 'reviewer', 'publisher']) f.run('founder', 'grant/create', {grant_id:`g-${who}`, to_principal_id:who, scope:'*', actions:['task/*', 'home/*', 'github/*', 'conflict/*', 'message/*'], resources:['repo:owner/repo', 'home:fact', 'home:other', 'home:dependency'], max_model_calls:grantMax, expires_at:grantExpirations[who] ?? new Date(Date.now() + 3600000).toISOString(), source_instruction:'Synthetic bounded policy fixture authority.'});
  if (legacy) {
    const bytes = canonical({content:'Synthetic imported legacy source data.'}), sha256 = digest(bytes);
    f.ledger.db.prepare('INSERT INTO immutable_values(sha256,bytes) VALUES(?,?)').run(sha256, bytes);
    f.corrupt('homes', 'legacy-input', {status:'current', scope:'alpha', principal_id:'founder', content:'Unqualified legacy INPUT retained in full.', dependencies:[], source:{kind:'legacy', sha256}});
  }
  f.start = (who = 'cos-a', args = {}) => {
    const task = f.run(who, 'task/submit', {grant_id:`g-${who}`, scope:'alpha', role:'engineer', instructions:'Work from complete synthetic inputs.', acceptance:'Return exact attributable evidence.', ...args});
    f.run(who, 'task/claim', {task_id:task.id});
    const admitted = f.run('scheduler', 'task/admit', {task_id:task.id});
    assert.equal(admitted.admitted, true); return admitted;
  };
  f.finish = (admitted, args = {}) => f.observe('task/finish', {task_id:admitted.task.id, attempt_id:admitted.task.value.attempt.id, output:'Synthetic observed output.', native_id:`synthetic-${admitted.task.id}`, termination_confirmed:true, observed_process:{pid:123, started_at:admitted.task.value.attempt.admitted_at, close_observed:true}, ...args});
  f.propose = (args = {}) => f.run('cos-a', 'home/propose', {grant_id:'g-cos-a', scope:'alpha', home_id:'fact', expected_revision:0, content:'Synthetic prepared publication subject.', github_publication:githubMetadata(), github_atomic_publication:atomicMetadata(), ...args});
  f.review = (proposal, verdict = 'Pass', who = 'cos-b') => {
    const admitted = f.start(who, {role:'qa', stage:'review', scope:proposal.value.scope, review_of:ref('proposals', proposal)});
    const output = canonical({review:{subject:ref('proposals', proposal), verdict, reason:'Synthetic independently produced policy review.', blockers:verdict === 'Pass' ? [] : ['Retained synthetic counterevidence.']}});
    const finished = f.finish(admitted, {output});
    assert.equal(finished.accepted, true); assert.ok(finished.review); return {admitted, output, finished};
  };
  f.proposal = f.propose(); f.produced = f.review(f.proposal);
  f.args = {subject_ref:ref('proposals', f.proposal), review_refs:[ref('reviews', f.produced.finished.review)], grant_id:'g-cos-a', action:'github/atomic-publish'};
  f.evidence = (args = {}, who = 'cos-a', wrap = tx => tx) => f.ledger.read(tx => publicationPolicyEvidence(wrap(tx), actor(who), {...f.args, ...args}));
  return f;
}
function unchangedReject(f, operation, check) {
  const before = sqlState(f); assert.throws(operation, check); assert.deepEqual(sqlState(f), before);
}

test('actual proposal producer preserves complete atomic metadata before exact subject hashing', t => {
  const f = fixture(t), metadata = atomicMetadata();
  assert.deepEqual(f.proposal.value.github_atomic_publication, metadata);
  assert.deepEqual(f.get('proposals', f.proposal.id).value.github_atomic_publication, metadata);
  assert.equal(f.proposal.sha256, peerDigest(f.proposal.value));
  assert.deepEqual(f.produced.finished.review.value.subject, ref('proposals', f.proposal));
  assert.equal(f.produced.finished.review.value.proof.protocol, 'peer-runtime-observation-v1');
  assert.deepEqual(f.produced.finished.review.value.proof.task, ref('tasks', f.produced.finished.task));
  assert.equal(f.produced.finished.task.value.result.output, f.produced.output);
  assert.equal(f.produced.finished.task.value.result.output_sha256, digest(f.produced.output));
});

test('real protected observer proof returns typed exact facts without any SQLite write', t => {
  const f = fixture(t), before = sqlState(f), facts = f.evidence();
  assert.equal(facts.protocol, 'peer-publication-policy-v1');
  assert.deepEqual(facts.subject_ref, f.args.subject_ref); assert.deepEqual(facts.review_refs, f.args.review_refs);
  assert.deepEqual(facts.metadata.github_publication, f.proposal.value.github_publication);
  assert.deepEqual(facts.metadata.github_atomic_publication, f.proposal.value.github_atomic_publication);
  assert.equal(facts.reviews.length, 1);
  const proof = f.produced.finished.review.value, review = facts.reviews[0];
  assert.deepEqual(review.review_ref, f.args.review_refs[0]); assert.deepEqual(review.task_ref, proof.proof.task);
  assert.deepEqual(review.current_task_ref, ref('tasks', f.get('tasks', f.produced.finished.task.id)));
  assert.deepEqual(review.observation_ref, proof.proof.observation);
  assert.equal(review.reviewer_principal_id, 'cos-b'); assert.equal(review.native_id, proof.native_id);
  assert.equal(review.context_sha256, proof.context_sha256); assert.equal(review.output_sha256, digest(f.produced.output));
  assert.ok(facts.contributors.principals.includes('cos-a'));
  assert.match(facts.authority_sha256, /^[a-f0-9]{64}$/); assert.equal(facts.authority_sha256, peerDigest(facts.authority_binding));
  assert.ok(facts.capacity.remaining_model_calls > 0); assert.equal(facts.capacity.global.used, 1);
  assert.equal(facts.capacity.principal.principal_id, 'cos-a'); assert.equal(facts.capacity.grant.grant_id, 'g-cos-a');
  assert.equal(typeof facts.current_sources, 'object'); assert.deepEqual(sqlState(f), before);
});

test('owning transaction needs only read providers and never invokes put/event or nested ledger operations', t => {
  const f = fixture(t); let attemptedWrites = 0;
  const before = sqlState(f), facts = f.evidence({}, 'cos-a', tx => ({...tx, put() { attemptedWrites++; throw Error('Policy must remain read-only'); }, event() { attemptedWrites++; throw Error('Policy must remain read-only'); }}));
  assert.equal(facts.protocol, 'peer-publication-policy-v1'); assert.equal(attemptedWrites, 0); assert.deepEqual(sqlState(f), before);
});

for (const [name, change] of [
  ['null', args => { args.github_atomic_publication = null; }], ['array', args => { args.github_atomic_publication = []; }],
  ['scalar', args => { args.github_atomic_publication = 'not an object'; }],
  ['missing counterpart', args => { delete args.github_publication; }],
  ['oversized complete metadata', args => { args.github_atomic_publication.extra = 'x'.repeat(17000); }]
]) test(`actual proposal command rejects ${name} atomic metadata without partial writes`, t => {
  const f = fixture(t), args = {grant_id:'g-cos-a', scope:'alpha', home_id:'other', expected_revision:0, content:'Synthetic second proposal.', github_publication:githubMetadata(), github_atomic_publication:atomicMetadata()};
  change(args); unchangedReject(f, () => f.run('cos-a', 'home/propose', args));
});

test('counter-only model usage changes preserve authority while returning fresh remaining capacity', t => {
  const f = fixture(t), first = f.evidence();
  assert.equal(f.finish(f.start('cos-a')).accepted, true);
  const next = f.evidence({expected_authority_sha256:first.authority_sha256});
  assert.equal(next.authority_sha256, first.authority_sha256); assert.deepEqual(next.authority_binding, first.authority_binding);
  assert.equal(next.capacity.global.used, first.capacity.global.used + 1);
  assert.equal(next.capacity.principal.used, first.capacity.principal.used + 1);
  assert.equal(next.capacity.grant.used, first.capacity.grant.used + 1);
  assert.equal(next.capacity.remaining_model_calls, first.capacity.remaining_model_calls - 1);
});

test('unknown usage metadata remains authority even though the actual model_calls counter is excluded', t => {
  const f = fixture(t), first = f.evidence(), usage = f.get('control', 'usage');
  f.corrupt('control', usage.id, {...usage.value, retained_boundary:'This unknown obligation cannot disappear as mechanical usage.'});
  const next = f.evidence();
  assert.notEqual(next.authority_sha256, first.authority_sha256);
  assert.deepEqual(next.capacity, first.capacity);
  unchangedReject(f, () => f.evidence({expected_authority_sha256:first.authority_sha256}), hasCode('AUTHORITY_CHANGED'));
});

test('a genuinely published unrelated qualified scope does not stale the pending alpha proof', t => {
  const f = fixture(t), first = f.evidence();
  const proposal = f.propose({home_id:'dependency', scope:'beta', content:'Independently qualified unrelated beta meaning.'});
  const reviewed = f.review(proposal, 'Pass', 'reviewer');
  const home = f.run('cos-a', 'home/publish', {grant_id:'g-cos-a', proposal_id:proposal.id, review_id:reviewed.finished.review.id});
  assert.equal(home.value.status, 'current'); assert.equal(home.value.scope_qualification.protocol, 'peer-home-scope-v1');
  const next = f.evidence({expected_authority_sha256:first.authority_sha256});
  assert.equal(next.authority_sha256, first.authority_sha256);
  assert.deepEqual(f.get('reviews', f.produced.finished.review.id), f.produced.finished.review);
});

test('publisher authority expiring during genuine proof reads is rechecked before returning facts', t => {
  const f = fixture(t), realNow = Date.now, start = realNow(), grant = f.get('grants', 'g-cos-a');
  f.corrupt('grants', grant.id, {...grant.value, expires_at:new Date(start + 60000).toISOString()});
  let clock = start, reads = 0;
  Date.now = () => clock;
  try {
    unchangedReject(f, () => f.evidence({}, 'cos-a', tx => ({...tx, getVersion(...args) { const row = tx.getVersion(...args); reads++; clock = start + 60001; return row; }})), hasCode('GRANT_INVALID'));
    assert.ok(reads > 0);
  } finally { Date.now = realNow; }
});

for (const target of ['original reviewer', 'transferred owner']) test(`final-cutoff expiry of ${target} after its initial authorization cannot return usable facts`, t => {
  const realNow = Date.now, start = realNow(); let clock = start;
  Date.now = () => clock;
  try {
    const who = target === 'original reviewer' ? 'cos-b' : 'reviewer';
    // Pin expiry in the real grant BEFORE producing the proof. Changing an
    // admitted reviewer's grant afterward would test earlier context staleness.
    const f = fixture(t, {grantExpirations:{[who]:new Date(start + 60000).toISOString()}});
    let moved;
    if (target === 'transferred owner') moved = f.run('cos-b', 'task/transfer', {task_id:f.produced.finished.task.id, to_principal_id:'reviewer', to_grant_id:'g-reviewer'});
    const usable = f.evidence();
    assert.equal(usable.reviews[0].reviewer_principal_id, 'cos-b');
    if (moved) assert.deepEqual(usable.reviews[0].current_task_ref, ref('tasks', moved));
    assert.ok(usable.capacity.remaining_model_calls > 0);
    let publisherReads = 0, targetReads = 0, advanced = false;
    unchangedReject(f, () => f.evidence({}, 'cos-a', tx => ({...tx, get(...args) {
      const row = tx.get(...args); // Always complete the actual SQLite read.
      if (args[0] === 'grants' && args[1] === `g-${who}`) targetReads++;
      if (args[0] === 'grants' && args[1] === 'g-cos-a' && ++publisherReads === 2) {
        // The second publisher grant read belongs to the final publisher check,
        // after per-review original/current-owner authorizations and adverse
        // proof reads. Only the earlier review authority now expires.
        assert.ok(targetReads > 0); clock = start + 60001; advanced = true;
        assert.ok(Date.parse(row.value.expires_at) > clock, 'publisher remains authorized');
      }
      return row;
    }})), hasCode('GRANT_INVALID'));
    assert.equal(advanced, true);
  } finally { Date.now = realNow; }
});

for (const kind of ['global', 'principal', 'grant']) test(`actual admitted calls exhausting ${kind} allowance remain denied despite stable evidence`, t => {
  const f = fixture(t, kind === 'global' ? {policy:{max_model_calls:3}} : kind === 'principal' ? {policy:{principal_model_calls:2}} : {grantMax:2});
  const before = f.evidence();
  for (let i = 0; i < 2; i++) assert.equal(f.finish(f.start('cos-a')).accepted, true);
  assert.equal(f.get('control', 'usage').value.model_calls, 3);
  unchangedReject(f, () => f.evidence({expected_authority_sha256:before.authority_sha256}), hasCode('MODEL_BUDGET'));
});

test('meaningful grant semantics change authority even when the grant remains usable', t => {
  const f = fixture(t), first = f.evidence(), grant = f.get('grants', 'g-cos-a');
  f.corrupt('grants', grant.id, {...grant.value, source_instruction:'Changed actual bounded authority semantics.'});
  assert.notEqual(f.evidence().authority_sha256, first.authority_sha256);
  unchangedReject(f, () => f.evidence({expected_authority_sha256:first.authority_sha256}), hasCode('AUTHORITY_CHANGED'));
});

test('review transfer preserves original protected production while checking the current accountable owner', t => {
  const f = fixture(t), original = f.produced.finished.review;
  const moved = f.run('cos-b', 'task/transfer', {task_id:f.produced.finished.task.id, to_principal_id:'reviewer', to_grant_id:'g-reviewer'});
  const facts = f.evidence();
  assert.equal(facts.reviews[0].reviewer_principal_id, 'cos-b');
  assert.deepEqual(facts.reviews[0].task_ref, original.value.proof.task);
  assert.deepEqual(facts.reviews[0].current_task_ref, ref('tasks', moved));
  assert.deepEqual(f.get('reviews', original.id), original);
  f.run('founder', 'grant/revoke', {grant_id:'g-reviewer'});
  unchangedReject(f, () => f.evidence());
});

for (const defect of ['legacy label', 'subject alias', 'proof task alias', 'context alias', 'native alias', 'raw output', 'admitted context', 'observation head', 'reservation binding']) test(`${defect} cannot substitute for the genuine exact protected production`, t => {
  const f = fixture(t), review = f.get('reviews', f.produced.finished.review.id);
  let refs = f.args.review_refs;
  if (['legacy label', 'subject alias', 'proof task alias', 'context alias', 'native alias'].includes(defect)) {
    const value = copy(review.value);
    if (defect === 'legacy label') value.proof = {protocol:'peer-native-review-v1', blockers:[]};
    if (defect === 'subject alias') value.subject.sha256 = '0'.repeat(64);
    if (defect === 'proof task alias') value.proof.task.sha256 = '0'.repeat(64);
    if (defect === 'context alias') value.context_sha256 = '0'.repeat(64);
    if (defect === 'native alias') value.native_id = 'different-synthetic-native';
    refs = [ref('reviews', f.corrupt('reviews', review.id, value))];
  } else if (defect === 'raw output' || defect === 'admitted context') {
    const task = f.get('tasks', f.produced.finished.task.id), value = copy(task.value);
    if (defect === 'raw output') value.result.output = canonical({review:{subject:f.args.subject_ref, verdict:'Pass', reason:'Rewritten text', blockers:[]}});
    else value.attempt.context.sha256 = '0'.repeat(64);
    f.corrupt('tasks', task.id, value);
  } else if (defect === 'observation head') {
    const observation = f.get('effects', review.value.proof.observation.id);
    f.corrupt('effects', observation.id, {...observation.value, unexpected_mutation:'Changed protected observation head'});
  } else {
    const reservation = f.get('effects', f.produced.admitted.task.value.attempt.effect_id);
    f.corrupt('effects', reservation.id, {...reservation.value, grant_generation:999});
  }
  unchangedReject(f, () => f.evidence({review_refs:refs}));
});

test('a manually inserted Pass/protocol label supplies no protected producing task or observation', t => {
  const f = fixture(t), manual = f.corrupt('reviews', 'manual-fake', {status:'accepted', scope:'alpha', subject:f.args.subject_ref, verdict:'Pass', blockers:[], reviewer_principal_id:'cos-b', termination_confirmed:true, proof:{protocol:'peer-native-review-v1'}});
  unchangedReject(f, () => f.evidence({review_refs:[ref('reviews', manual)]}));
});

for (const name of ['author alias', 'reviewer alias']) test(`current ${name} overlap cannot bypass contributor independence`, t => {
  const f = fixture(t), key = name === 'author alias' ? 'cos-a' : 'cos-b', principal = f.get('principals', key);
  f.corrupt('principals', key, {...principal.value, native_id:name === 'author alias' ? f.produced.finished.review.value.native_id : f.get('principals', 'cos-a').value.native_id});
  unchangedReject(f, () => f.evidence());
});

test('genuine producer rejects self-review before any positive review proof exists', t => {
  const f = fixture(t), proposal = f.propose({home_id:'other'});
  const admitted = f.start('cos-a', {role:'qa', stage:'review', review_of:ref('proposals', proposal)});
  const output = canonical({review:{subject:ref('proposals', proposal), verdict:'Pass', reason:'Synthetic prohibited self-review', blockers:[]}});
  unchangedReject(f, () => f.finish(admitted, {output}), hasCode('REVIEW_INDEPENDENCE'));
});

for (const scope of ['alpha', '*', 'unknown']) test(`new ${scope} membership after review blocks pending publication without a write`, t => {
  const f = fixture(t); f.run('publisher', 'notice/create', {scope, content:'New material current restriction.'});
  unchangedReject(f, () => f.evidence());
});

test('changed exact input revision cannot be hidden by unchanged source membership', t => {
  const f = fixture(t), notice = f.run('publisher', 'notice/create', {scope:'alpha', content:'Original current condition.'});
  const proposal = f.propose({home_id:'other'}), review = f.review(proposal);
  f.run('founder', 'notice/resolve', {notice_id:notice.id, source_instruction:'Synthetic founder disposition changes the exact source.'});
  unchangedReject(f, () => f.evidence({subject_ref:ref('proposals', proposal), review_refs:[ref('reviews', review.finished.review)]}));
});

test('genuine applicable negative review remains a veto after an earlier genuine Pass', t => {
  const f = fixture(t), negative = f.review(f.proposal, 'Fail', 'reviewer');
  assert.equal(negative.finished.review.value.verdict, 'Fail');
  unchangedReject(f, () => f.evidence());
});

for (const defect of ['pause', 'revoke publisher', 'revoke reviewer', 'expired publisher', 'expired reviewer', 'inactive reviewer', 'cancel review']) test(`${defect} fences current policy while retaining original proof`, t => {
  const f = fixture(t), original = copy(f.produced.finished.review);
  if (defect === 'pause') f.run('founder', 'company/pause', {source_instruction:'Synthetic pause before publication.'});
  if (defect === 'revoke publisher' || defect === 'revoke reviewer') f.run('founder', 'grant/revoke', {grant_id:defect === 'revoke publisher' ? 'g-cos-a' : 'g-cos-b'});
  if (defect.startsWith('expired')) { const key = defect === 'expired publisher' ? 'g-cos-a' : 'g-cos-b', grant = f.get('grants', key); f.corrupt('grants', key, {...grant.value, expires_at:'2000-01-01T00:00:00.000Z'}); }
  if (defect === 'inactive reviewer') { const p = f.get('principals', 'cos-b'); f.corrupt('principals', p.id, {...p.value, status:'inactive'}); }
  if (defect === 'cancel review') f.run('cos-b', 'task/cancel', {task_id:f.produced.finished.task.id, reason:'Synthetic cancellation before current publication.'});
  unchangedReject(f, () => f.evidence()); assert.deepEqual(f.get('reviews', original.id), original);
});

for (const field of ['scope', 'resources', 'task_id', 'native_id', 'proof']) test(`caller-controlled ${field} cannot replace derived semantic policy inputs`, t => {
  const f = fixture(t); unchangedReject(f, () => f.evidence({[field]:field === 'resources' ? ['repo:other/repo'] : 'forged'}));
});

test('scope/repository authorization derives from the actual proposal rather than caller aliases', t => {
  const f = fixture(t);
  f.run('founder', 'grant/create', {grant_id:'wrong-resource', to_principal_id:'cos-a', scope:'alpha', actions:['github/*'], resources:['repo:other/repo'], expires_at:new Date(Date.now()+3600000).toISOString(), source_instruction:'Synthetic unrelated repository grant.'});
  unchangedReject(f, () => f.evidence({grant_id:'wrong-resource'}), hasCode('RESOURCE_AUTHORITY'));
  f.run('founder', 'grant/create', {grant_id:'wrong-scope', to_principal_id:'cos-a', scope:'beta', actions:['github/*'], resources:['repo:owner/repo'], expires_at:new Date(Date.now()+3600000).toISOString(), source_instruction:'Synthetic unrelated scope grant.'});
  unchangedReject(f, () => f.evidence({grant_id:'wrong-scope'}), hasCode('GRANT_INVALID'));
  unchangedReject(f, () => f.evidence({grant_generation:999}), hasCode('GRANT_CHANGED'));
});

for (const [field, value] of [
  ['subject_ref', {family:'proposals', id:'missing', revision:1, sha256:'0'.repeat(64)}],
  ['review_refs', []], ['review_refs', [{family:'reviews', id:'missing', revision:1, sha256:'0'.repeat(64)}]],
  ['action', 'home/publish'], ['expected_authority_sha256', '0'.repeat(64)]
]) test(`invalid ${field} is a read-only hold rather than false permission`, t => {
  const f = fixture(t); unchangedReject(f, () => f.evidence({[field]:value}));
});

for (const method of ['get', 'getVersion', 'list', 'queryCurrentReviews', 'resolveLegacy']) test(`real ${method} provider failure propagates by identity and changes no persistent state`, t => {
  const f = fixture(t, {legacy:method === 'resolveLegacy'}); f.evidence();
  const error = Object.assign(Error('Synthetic real provider failure'), {code:'CONTEXT_CAPACITY'}); let hits = 0;
  unchangedReject(f, () => f.evidence({}, 'cos-a', tx => ({...tx, [method](...args) { const result = tx[method](...args); hits++; throw error; }})), observed => observed === error);
  assert.ok(hits > 0);
});

for (const method of ['get', 'getVersion', 'list', 'count', 'queryCurrentReviews', 'resolveLegacy']) test(`missing ${method} read-provider capability never becomes evidence or permission`, t => {
  const f = fixture(t);
  unchangedReject(f, () => f.evidence({}, 'cos-a', tx => { const wrapper = {...tx}; delete wrapper[method]; return wrapper; }));
});

const publisherFacts=f=>f.evidence({grant_id:'g-publisher'},'publisher');
test('fresh publisher identity facts use actual protected unrelated production without writing SQLite',t=>{
  const f=fixture(t),first=publisherFacts(f),before=sqlState(f);
  assert.equal(first.identity_facts.publisher.protocol,'peer-principal-native-aliases-v1');
  assert.deepEqual(first.identity_facts.publisher.principal_ref,ref('principals',f.get('principals','publisher')));
  assert.deepEqual(first.identity_facts.publisher.native_ids,['publisher-native']);
  assert.deepEqual(first.identity_facts.publisher.proofs,[]);assert.deepEqual(sqlState(f),before);
  const closed=f.finish(f.start('publisher'),{native_id:'synthetic-independent-publisher-production'});assert.equal(closed.accepted,true);
  const after=publisherFacts(f);assert.equal(after.authority_sha256,first.authority_sha256);
  assert.deepEqual(after.authority_binding,first.authority_binding);
  assert.ok(after.identity_facts.publisher.native_ids.includes('synthetic-independent-publisher-production'));
  const proof=after.identity_facts.publisher.proofs.find(p=>p.task_ref.id===closed.task.id);
  assert.deepEqual(proof.task_ref,ref('tasks',closed.task));assert.deepEqual(proof.observation_ref,closed.task.value.result.observation);
  assert.deepEqual(proof.admitted_principal_ref,closed.task.value.attempt.context.principal);
  assert.equal(after.capacity.grant.remaining,first.capacity.grant.remaining-1);
});
for(const native of ['synthetic-safe-unrelated-native','actual-reviewer-alias'])test(`fresh ${native} evidence does not masquerade as counter-sensitive authority`,t=>{
  const f=fixture(t),first=publisherFacts(f),observed=native==='actual-reviewer-alias'?f.produced.finished.review.value.native_id:native;
  const closed=f.finish(f.start('publisher'),{native_id:observed});assert.equal(closed.accepted,true);
  const before=sqlState(f),after=f.evidence({grant_id:'g-publisher',expected_authority_sha256:first.authority_sha256},'publisher');
  assert.equal(after.authority_sha256,first.authority_sha256);assert.ok(after.identity_facts.publisher.native_ids.includes(observed));
  assert.notEqual(f.get('principals','publisher').value.native_id,observed);assert.deepEqual(sqlState(f),before);
});
test('transferred-away protected publisher production remains a known native alias',t=>{
  const f=fixture(t),closed=f.finish(f.start('publisher'),{native_id:'synthetic-transferred-publisher-native'});assert.equal(closed.accepted,true);
  const moved=f.run('publisher','task/transfer',{task_id:closed.task.id,to_principal_id:'reviewer',to_grant_id:'g-reviewer'});
  assert.equal(moved.value.principal_id,'reviewer');const facts=publisherFacts(f);
  assert.ok(facts.identity_facts.publisher.native_ids.includes('synthetic-transferred-publisher-native'));
  const proof=facts.identity_facts.publisher.proofs.find(p=>p.task_ref.id===closed.task.id);
  assert.deepEqual(proof.task_ref,ref('tasks',moved));assert.ok(proof.owner_principal_ids.includes('publisher'));
  assert.equal(proof.producer_principal_id,'publisher');
});
test('changed current registry native cannot erase the genuine admitted historical native',t=>{
  const f=fixture(t),closed=f.finish(f.start('publisher'),{native_id:'synthetic-observed-native'});assert.equal(closed.accepted,true);
  // Negative current-alias rewrite input; the positive native proof is actual.
  const principal=f.get('principals','publisher');f.corrupt('principals',principal.id,{...principal.value,native_id:'synthetic-new-current-native'});
  const facts=publisherFacts(f);for(const native of ['publisher-native','synthetic-new-current-native','synthetic-observed-native'])assert.ok(facts.identity_facts.publisher.native_ids.includes(native));
});
for(const defect of ['result','observation','reservation','definition'])test(`publisher ${defect} corruption cannot become an empty alias set`,t=>{
  const f=fixture(t),closed=f.finish(f.start('publisher'),{native_id:'synthetic-known-native'});assert.equal(closed.accepted,true);
  if(defect==='result'){const row=f.get('tasks',closed.task.id),value=copy(row.value);value.result.native_id='fabricated';f.corrupt('tasks',row.id,value);}
  if(defect==='observation'){const row=f.get('effects',closed.task.value.result.observation.id);f.corrupt('effects',row.id,{...row.value,native_id:'fabricated'});}
  if(defect==='reservation'){const row=f.get('effects',closed.task.value.attempt.effect_id);f.corrupt('effects',row.id,{...row.value,request_sha256:digest('fabricated')});}
  if(defect==='definition'){const row=f.get('tasks',closed.task.id),value=copy(row.value);value.definition.instructions='fabricated';f.corrupt('tasks',row.id,value);}
  unchangedReject(f,()=>publisherFacts(f));
});
test('full task-head pagination retains a protected alias beyond the first sixteen rows',t=>{
  const f=fixture(t),natives=[];for(let i=0;i<18;i++){const native=`synthetic-publisher-page-${i}`;natives.push(native);assert.equal(f.finish(f.start('publisher'),{native_id:native}).accepted,true);}
  const facts=publisherFacts(f);assert.equal(facts.identity_facts.publisher.proofs.length,18);
  for(const native of natives)assert.ok(facts.identity_facts.publisher.native_ids.includes(native));
});
test('nonprogressing identity task lookup is held without returning a partial prefix',t=>{
  const f=fixture(t);unchangedReject(f,()=>f.evidence({grant_id:'g-publisher'},'publisher',tx=>({...tx,list(family,options){if(family==='tasks'&&options.principal_id===undefined){const {cursor,...first}=options;return {...tx.list(family,first),complete:false,next_cursor:'stuck'};}return tx.list(family,options);}})),codeOrLookup);
  function codeOrLookup(error){return error.code==='LOOKUP_INCOMPLETE';}
});
test('a private software coordination record is opaque data, never protected native proof',t=>{
  const f=fixture(t);f.corrupt('tasks','github-atomic-publication:input-data',{kind:'github-atomic-publication',principal_id:'publisher',status:'queued',native_id:'untrusted-lookalike',data:{result:{native_id:'also-untrusted'}}});
  const facts=publisherFacts(f);assert.deepEqual(facts.identity_facts.publisher.native_ids,['publisher-native']);assert.deepEqual(facts.identity_facts.publisher.proofs,[]);
});
test('exact protected publisher history provider failure propagates without an alias omission',t=>{
  const f=fixture(t),closed=f.finish(f.start('publisher'),{native_id:'synthetic-known-native'}),error=Error('Exact identity history failure');assert.equal(closed.accepted,true);
  unchangedReject(f,()=>f.evidence({grant_id:'g-publisher'},'publisher',tx=>({...tx,getVersion(reference){if(reference.family==='principals'&&reference.id==='publisher')throw error;return tx.getVersion(reference);}})),e=>e===error);
});
for(const who of ['cos-a','cos-b','reviewer'])for(const overlap of [false,true])test(`fresh protected ${who} ${overlap?'overlapping':'different'} native is retained as interested identity`,t=>{
  const f=fixture(t);if(who==='reviewer')f.run('cos-b','task/transfer',{task_id:f.produced.finished.task.id,to_principal_id:'reviewer',to_grant_id:'g-reviewer'});
  const first=publisherFacts(f),native=overlap?'publisher-native':`synthetic-safe-${who}-native`;
  const closed=f.finish(f.start(who),{native_id:native});assert.equal(closed.accepted,true);
  const facts=f.evidence({grant_id:'g-publisher',expected_authority_sha256:first.authority_sha256},'publisher');
  assert.equal(facts.authority_sha256,first.authority_sha256);
  const identity=facts.identity_facts.interested.find(i=>i.principal_ref.id===who);assert.ok(identity);
  assert.ok(identity.native_ids.includes(native));assert.deepEqual(identity.proofs.find(p=>p.task_ref.id===closed.task.id).observation_ref,closed.task.value.result.observation);
  assert.ok(facts.identity_facts.publisher.native_ids.includes('publisher-native'));
});
test('complete task inventory is read once while resolving publisher and all interested identities',t=>{
  const f=fixture(t);let inventories=0;
  const facts=f.evidence({grant_id:'g-publisher'},'publisher',tx=>({...tx,list(family,options){if(family==='tasks'&&options.principal_id===undefined&&!options.cursor)inventories++;return tx.list(family,options);}}));
  assert.equal(inventories,1);assert.equal(facts.identity_facts.protocol,'peer-publication-native-identities-v1');
  assert.deepEqual(facts.identity_facts.interested.map(i=>i.principal_ref.id),['cos-a','cos-b']);
});

for(const mode of ['read-only','exact no-op','modifying'])test(`final owning P1 history guard handles late ${mode} capacity hook`,t=>{
  const f=fixture(t),before=sqlState(f),original=f.get('principals','cos-a');let usageReads=0,fired=0,probes=0;
  const run=()=>f.ledger.write('policy.final-owning-guard','publisher',tx=>publicationPolicyEvidence({...tx,get(family,id){if(family==='control'&&id==='usage:publisher'&&++usageReads===2){fired++;const row=tx.get('principals','cos-a');if(mode==='exact no-op')tx.put('principals',row.id,copy(row.value),row.revision);if(mode==='modifying')tx.put('principals',row.id,{...row.value,native_id:'publisher-native'},row.revision);}return tx.get(family,id);},getVersion(reference){if(fired)probes++;return tx.getVersion(reference);}},actor('publisher'),{...f.args,grant_id:'g-publisher'}));
  if(mode==='modifying')assert.throws(run,e=>/owning snapshot before pending writes/.test(e.message));
  else{const result=run();assert.equal(result.protocol,'peer-publication-policy-v1');assert.ok(result.identity_facts.interested.find(i=>i.principal_ref.id==='cos-a').native_ids.includes('cos-a-native'));}
  assert.equal(fired,1);assert.equal(probes,1);assert.deepEqual(f.get('principals','cos-a'),original);assert.deepEqual(sqlState(f),before);
});
test('final uncached history provider error propagates by identity without a permission result',t=>{
  const f=fixture(t),before=sqlState(f),error=Error('Exact final history provider fault');let reads=0,late=false,probes=0;
  assert.throws(()=>f.ledger.write('policy.final-history-fault','publisher',tx=>publicationPolicyEvidence({...tx,get(family,id){if(family==='control'&&id==='usage:publisher'&&++reads===2)late=true;return tx.get(family,id);},getVersion(reference){if(late){probes++;throw error;}return tx.getVersion(reference);}},actor('publisher'),{...f.args,grant_id:'g-publisher'})),e=>e===error);
  assert.equal(probes,1);assert.deepEqual(sqlState(f),before);
});
test('common grant cutoff follows the final actual P1 history probe',t=>{
  const realNow=Date.now,start=realNow();let clock=start;Date.now=()=>clock;
  try{const f=fixture(t,{grantExpirations:{'cos-b':new Date(start+60000).toISOString()}});assert.ok(publisherFacts(f).capacity.remaining_model_calls>0);const before=sqlState(f);let reads=0,late=false,probes=0;
    assert.throws(()=>f.ledger.write('policy.final-history-expiry','publisher',tx=>publicationPolicyEvidence({...tx,get(family,id){if(family==='control'&&id==='usage:publisher'&&++reads===2)late=true;return tx.get(family,id);},getVersion(reference){const row=tx.getVersion(reference);if(late){probes++;clock=start+60001;}return row;}},actor('publisher'),{...f.args,grant_id:'g-publisher'})),hasCode('GRANT_INVALID'));
    assert.equal(probes,1);assert.deepEqual(sqlState(f),before);
  }finally{Date.now=realNow;}
});
