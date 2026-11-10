// Synthetic P1 SQLite fixtures and mocked GitHub only. No live/native qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubClient, MergePublisher, publicationDigest, publicationCheckId, trustedCICheckId, atomicPublicationCheckId, atomicCICheckId} from '../plugins/soloco/runtime/peers/github.mjs';
import {PeerLedger} from '../plugins/soloco/runtime/peers/ledger.mjs';
import {peerFixture} from './peer-fixture.mjs';

const oid = char => char.repeat(40);
const hash = publicationDigest;
const copy = value => JSON.parse(JSON.stringify(value));
const ref = (family, row) => ({family, id:row.id, revision:row.revision, sha256:row.sha256});
const latch = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const atomicContract = () => ({protocol:'github-atomic-refs-v1', api_host:'api.github.com', repository_node_id:'R_fixture', base_ref:'refs/heads/main', head_ref:'refs/heads/topic', before_base_oid:oid('b'), before_head_oid:oid('a'), after_oid:oid('d'), prepared_merge_oid:oid('d'), prepared_tree_oid:oid('c'), prepared_parents:[oid('b'), oid('a')]});
// Controlled unit-fixture configuration only; this is not live host/App proof.
const qualifiedMode = (atomic = atomicContract(), issuer = {}) => ({protocol:'github-atomic-qualified-mode-v1', mode:'controlled-test', qualified:true, scope:'synthetic-mocked-transport-only', api_host:atomic.api_host, repository_node_id:atomic.repository_node_id, repository:'owner/repo', app_id:issuer.app_id ?? 42, check_name:issuer.check_name ?? 'trusted-publication', harness_sha256:issuer.harness_sha256 ?? hash('fixture operator harness'), policy_sha256:issuer.policy_sha256 ?? hash('fixture operator policy'), evidence_sha256:hash('Synthetic mocked atomic fixture qualification; not live proof')});

function fixture(t) {
  const storage = peerFixture(); t.after(() => storage.close());
  const ledger = storage.ledger;
  const get = (family, id) => ledger.read(tx => tx.get(family, id));
  const seed = (family, id, value) => ledger.write('atomic.fixture', 'scheduler', tx => tx.put(family, id, value, tx.get(family, id)?.revision ?? 0));
  seed('grants', 'grant', {status:'active', generation:1, remaining:1});
  const issuer = {app_id:42, check_name:'trusted-publication', harness_sha256:hash('fixture operator harness'), policy_sha256:hash('fixture operator policy'), required_checks:[{name:'trusted-ci', app_id:77}]};
  const binding = {owner:'owner', repo:'repo', number:1, head_sha:oid('a'), base_sha:oid('b'), tree_sha:oid('c'), base_branch:'main', merge_method:'merge', scope_sha256:hash('fixture scope'), harness_sha256:issuer.harness_sha256, policy_sha256:issuer.policy_sha256, author_principal_id:'cos-a', expected_app_id:42, check_name:issuer.check_name, required_native_approvals:0, native_reviews:[]};
  const contract = atomicContract();
  const qualification = qualifiedMode(contract, issuer); issuer.atomic_qualification = qualification;
  const subject_ref = ref('proposals', seed('proposals', 'proposal', {principal_id:'cos-a', github_publication:binding, github_atomic_publication:contract}));
  // These are unit-only canonical rows, not protected P2 producer/native proof.
  const review_refs = [ref('reviews', seed('reviews', 'review', {status:'accepted', subject:subject_ref, reviewer_principal_id:'reviewer', author_principal_id:'cos-a', native_id:'fixture-independent-review', verdict:'Pass', context_sha256:hash('fixture context'), output_sha256:hash('fixture output'), termination_confirmed:true, recorded_by:'scheduler', proof:{protocol:'peer-native-review-v1', blockers:[]}}))];
  const checkId = atomicPublicationCheckId({binding, atomic:contract, qualification, subject_ref, review_refs});
  const observation = {owner:'owner', repo:'repo', number:1, state:'open', draft:false, merged:false, author_id:10, head_sha:binding.head_sha, head_branch:'topic', base_sha:binding.base_sha, tree_sha:binding.tree_sha, base_branch:'main', head_repository:'owner/repo', base_repository:'owner/repo', repository_owner_type:'User', repository_name:'owner/repo', allow_merge_commit:true, contains_current_base:true,
    protection:{strict:true, enforce_admins:true, force_pushes:false, review_bypass:false, linear_history:false, locked:false, required_native_approvals:0, checks:[{context:issuer.check_name, app_id:42}]},
    checked_commit_sha:contract.prepared_merge_oid, atomic_qualification_sha256:hash(qualification),
    checks:[{id:100, name:issuer.check_name, app_id:42, head_sha:contract.prepared_merge_oid, status:'completed', conclusion:'success', external_id:checkId}, {id:101, name:'trusted-ci', app_id:77, head_sha:contract.prepared_merge_oid, status:'completed', conclusion:'success', external_id:atomicCICheckId({binding, atomic:contract, qualification, name:'trusted-ci'})}], reviews:[], review_permissions:{}};
  const remote = {api_host:contract.api_host, repository_node_id:contract.repository_node_id, repository:'owner/repo', base_ref:contract.base_ref, head_ref:contract.head_ref, base_oid:contract.before_base_oid, head_oid:contract.before_head_oid, prepared_merge_oid:contract.prepared_merge_oid, prepared_tree_oid:contract.prepared_tree_oid, prepared_parents:copy(contract.prepared_parents)};
  const counters = {inspections:0, reads:0, updates:0, legacy:0};
  const claim = () => get('claims', 'github-publication:repo:owner/repo')?.value;
  const client = {
    async inspect() { assert.equal(ledger.inTransaction, false); counters.inspections++; return copy(observation); },
    async inspectAtomic(_binding, _checkName, selected) { assert.deepEqual(selected, contract); return client.inspect(); },
    async observeAtomicRefs() { assert.equal(ledger.inTransaction, false); counters.reads++; return copy(remote); },
    async updateRefs(sent, requestDigest) {
      assert.equal(ledger.inTransaction, false); counters.updates++;
      const effect = get('effects', 'pub').value;
      assert.equal(effect.dispatched, true); assert.equal(effect.status, 'dispatch_admitted');
      assert.equal(claim().status, 'reserved'); assert.deepEqual(sent, contract);
      assert.match(requestDigest, /^[a-f0-9]{64}$/);
      remote.base_oid = contract.after_oid;
      return {status:'acknowledged', client_mutation_id:requestDigest};
    },
    async observe() { counters.legacy++; throw Error('Legacy observation forbidden in atomic fixture'); },
    async requestMerge() { counters.legacy++; throw Error('Legacy merge forbidden in atomic fixture'); },
    async mergeResult() { counters.legacy++; throw Error('Legacy merge polling forbidden in atomic fixture'); },
    async createCheckRun() { counters.legacy++; throw Error('No check creation authorized in atomic fixture'); }
  };
  let permitted = true;
  const options = {ledger, client, issuer, principal:'cos-a', authorize:(view, request) => {
    assert.equal(view.put, undefined);
    return permitted && view.get('grants', request.grant_id)?.value.status === 'active';
  }, resourceOverlap:(a, b) => a.key === b.key || a.kind === 'repo' && b.kind === 'repo' && a.repository === b.repository};
  const publisher = new MergePublisher(options);
  const enqueue = (id = 'pub', subject = subject_ref, reviews = review_refs) => publisher.enqueueAtomic({id, subject_ref:subject, review_refs:reviews, grant_id:'grant', task_id:'source-task'});
  return {...storage, get, seed, issuer, binding, contract, qualification, subject_ref, review_refs, observation, remote, counters, claim, client, options, publisher, enqueue, decline:() => { permitted = false; }};
}
function second(t, f) { const ledger = new PeerLedger(f.root); t.after(() => ledger.close()); return ledger; }
function reserved(f) { assert.equal(f.claim().status, 'reserved'); assert.equal(f.get('grants', 'grant').value.remaining, 1); }

test('atomic admission precedes one send; ACK and exact readback never establish semantic acceptance', async t => {
  const f = fixture(t); const queued = f.enqueue(); assert.deepEqual(f.enqueue(), queued);
  const pending = await f.publisher.publishAtomic('pub');
  assert.equal(pending.status, 'pending'); assert.equal(pending.semantic_acceptance, false); reserved(f);
  const successor = new MergePublisher({...f.options, ledger:second(t, f)});
  const observed = await successor.reconcileAtomic('pub');
  assert.equal(observed.status, 'observed'); assert.equal(observed.semantic_acceptance, false); reserved(f);
  assert.equal(f.get('tasks', 'github-atomic-publication:pub').value.status === 'completed', false);
  assert.deepEqual(await successor.reconcileAtomic('pub'), observed);
  await successor.publishAtomic('pub'); assert.equal(f.counters.updates, 1); assert.equal(f.counters.legacy, 0);
});

test('lost ACK is reconciled on a cold connection without replaying or refunding the mutation', async t => {
  const f = fixture(t); f.enqueue();
  f.client.updateRefs = async () => { f.counters.updates++; f.remote.base_oid = f.contract.after_oid; throw Error('Lost response after server update'); };
  assert.equal((await f.publisher.publishAtomic('pub')).status, 'unknown'); reserved(f);
  const successor = new MergePublisher({...f.options, ledger:second(t, f)});
  const observed = await successor.publishAtomic('pub');
  assert.equal(observed.status, 'observed'); assert.equal(observed.semantic_acceptance, false); reserved(f);
  assert.equal(f.counters.updates, 1); assert.equal(f.counters.legacy, 0);
});

test('unknown send with refs still at before values stays reserved and cannot be retried', async t => {
  const f = fixture(t); f.enqueue();
  f.client.updateRefs = async () => { f.counters.updates++; throw Error('Unknown send outcome'); };
  assert.equal((await f.publisher.publishAtomic('pub')).status, 'unknown');
  for (let i = 0; i < 3; i++) assert.equal((await new MergePublisher({...f.options, ledger:second(t, f)}).publishAtomic('pub')).status, 'unknown');
  assert.equal(f.counters.updates, 1); reserved(f);
});

test('two independent SQLite connections cannot both send the admitted mutation', async t => {
  const f = fixture(t); f.enqueue(); const entered = latch(), release = latch();
  const original = f.client.updateRefs;
  f.client.updateRefs = async (...args) => { const receipt = await original(...args); entered.resolve(); await release.promise; return receipt; };
  const sending = f.publisher.publishAtomic('pub'); await entered.promise;
  const successor = new MergePublisher({...f.options, ledger:second(t, f)});
  let observed;
  try { observed = await successor.publishAtomic('pub'); assert.equal(observed.status, 'observed'); assert.equal(observed.semantic_acceptance, false); reserved(f); }
  finally { release.resolve(); }
  assert.deepEqual(await sending, observed); assert.equal(f.counters.updates, 1);
  assert.equal((await successor.reconcileAtomic('pub')).status, 'observed'); reserved(f);
});

test('concurrent cold preflights on separate connections produce at most one durable send', async t => {
  const f = fixture(t); f.enqueue();
  const other = new MergePublisher({...f.options, ledger:second(t, f)});
  const results = await Promise.allSettled([f.publisher.publishAtomic('pub'), other.publishAtomic('pub')]);
  assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.equal(f.counters.updates, 1); reserved(f);
  assert.equal((await other.reconcileAtomic('pub')).status, 'observed'); reserved(f);
});

test('a local ACK-persistence failure leaves a durable admitted send that a cold reader never repeats', async t => {
  const f = fixture(t); f.enqueue(); const write = f.ledger.write.bind(f.ledger), update = f.client.updateRefs;
  let armed = false;
  f.ledger.write = (...args) => { if (armed) { armed = false; throw Error('Synthetic local ACK write failure'); } return write(...args); };
  f.client.updateRefs = async (...args) => { const result = await update(...args); armed = true; return result; };
  try { await Promise.allSettled([f.publisher.publishAtomic('pub')]); } finally { f.ledger.write = write; }
  assert.equal(f.get('effects', 'pub').value.dispatched, true); reserved(f);
  assert.equal((await new MergePublisher({...f.options, ledger:second(t, f)}).publishAtomic('pub')).status, 'observed');
  assert.equal(f.counters.updates, 1); reserved(f);
});

for (const first of ['atomic', 'legacy']) test(`shared repository FIFO prevents ${first === 'atomic' ? 'legacy' : 'atomic'} from overtaking queued ${first}`, async t => {
  const f = fixture(t), enqueueLegacy = () => f.publisher.enqueue({id:'legacy', subject_ref:f.subject_ref, review_refs:f.review_refs, grant_id:'grant', task_id:'source-task'});
  if (first === 'atomic') { f.enqueue(); enqueueLegacy(); await assert.rejects(f.publisher.publish('legacy'), /NOT_NEXT_PUBLICATION_CANDIDATE/); }
  else { enqueueLegacy(); f.enqueue(); await assert.rejects(f.publisher.publishAtomic('pub'), /NOT_NEXT_PUBLICATION_CANDIDATE/); }
  assert.equal(f.get('effects', first === 'atomic' ? 'legacy' : 'pub'), null);
  assert.equal(f.claim(), undefined); assert.equal(f.counters.updates, 0); assert.equal(f.counters.legacy, 0);
});

test('an existing overlapping reservation prevents atomic preparation before any remote I/O', async t => {
  const f = fixture(t); f.enqueue();
  f.seed('claims', 'existing-task-claim', {status:'active', resources:[{kind:'repo', repository:'owner/repo'}]});
  await assert.rejects(f.publisher.publishAtomic('pub'), /PUBLICATION_RESOURCE_RESERVED/);
  assert.equal(f.get('effects', 'pub'), null); assert.equal(f.counters.inspections, 0); assert.equal(f.counters.updates, 0);
  assert.equal(f.get('claims', 'existing-task-claim').value.status, 'active');
});

for (const [name, change] of [
  ['base', f => { f.remote.base_oid = oid('e'); }], ['head', f => { f.remote.head_oid = oid('e'); }],
  ['tree', f => { f.remote.prepared_tree_oid = oid('e'); }], ['merge', f => { f.remote.prepared_merge_oid = oid('e'); }],
  ['parent order', f => { f.remote.prepared_parents.reverse(); }], ['extra parent', f => { f.remote.prepared_parents.push(oid('e')); }],
  ['repository node', f => { f.remote.repository_node_id = 'R_other'; }], ['repository name', f => { f.remote.repository = 'owner/other'; }],
  ['API host', f => { f.remote.api_host = 'elsewhere.example'; }], ['base ref', f => { f.remote.base_ref = 'refs/heads/other'; }],
  ['head ref', f => { f.remote.head_ref = 'refs/heads/other'; }], ['actual PR head branch', f => { f.observation.head_branch = 'different-topic'; }]
]) test(`atomic preflight rejects changed ${name} and retains a held reservation`, async t => {
  const f = fixture(t); f.enqueue(); change(f);
  const held = await f.publisher.publishAtomic('pub');
  assert.equal(held.status, 'held'); assert.equal(f.counters.updates, 0); reserved(f);
  assert.deepEqual(await f.publisher.publishAtomic('pub'), held); assert.equal(f.counters.updates, 0);
});

for (const [name, change] of [
  ['App', f => { f.observation.checks[0].app_id = 999; }], ['trusted CI', f => { f.observation.checks[1].conclusion = 'skipped'; }],
  ['harness', f => { f.observation.checks[1].external_id = 'wrong'; }], ['strict protection', f => { f.observation.protection.strict = false; }],
  ['draft PR', f => { f.observation.draft = true; }], ['fork head', f => { f.observation.head_repository = 'fork/repo'; }],
  ['native veto', f => { f.observation.reviews = [GitHubClient.reviewSnapshot({id:50, user:{id:20, login:'reviewer'}, commit_id:f.binding.head_sha, state:'CHANGES_REQUESTED', body:'Stop', submitted_at:'2026-11-07T00:00:00Z'})]; f.observation.review_permissions.reviewer = true; }]
]) test(`atomic publication preserves the existing ${name} gate`, async t => {
  const f = fixture(t); f.enqueue(); change(f);
  assert.equal((await f.publisher.publishAtomic('pub')).status, 'held'); assert.equal(f.counters.updates, 0); reserved(f);
});

test('exact prepared M checks and controlled fixture qualification are bound before the one mutation', async t => {
  const f = fixture(t), queued = f.enqueue().value;
  assert.deepEqual(queued.qualification, f.qualification);
  assert.equal(queued.qualification.mode, 'controlled-test');
  assert.equal(queued.qualification.scope, 'synthetic-mocked-transport-only');
  assert.equal(f.observation.checked_commit_sha, f.contract.prepared_merge_oid);
  assert.ok(f.observation.checks.every(check => check.head_sha === f.contract.prepared_merge_oid));
  assert.match(f.observation.checks[0].external_id, /^soloco-peer-atomic-v1:/);
  assert.match(f.observation.checks[1].external_id, /^soloco-ci-atomic-v1:/);
  assert.notEqual(f.observation.checks[0].external_id, publicationCheckId({binding:f.binding, subject_ref:f.subject_ref, review_refs:f.review_refs}));
  assert.notEqual(f.observation.checks[1].external_id, trustedCICheckId({binding:f.binding, name:'trusted-ci'}));
  assert.equal((await f.publisher.publishAtomic('pub')).status, 'pending');
  assert.equal(f.counters.updates, 1); reserved(f);
});

for (const [name, change] of [
  ['H-only success', f => {
    f.observation.checked_commit_sha = f.binding.head_sha;
    f.observation.checks[0] = {...f.observation.checks[0], head_sha:f.binding.head_sha, external_id:publicationCheckId({binding:f.binding, subject_ref:f.subject_ref, review_refs:f.review_refs})};
    f.observation.checks[1] = {...f.observation.checks[1], head_sha:f.binding.head_sha, external_id:trustedCICheckId({binding:f.binding, name:'trusted-ci'})};
  }],
  ['H gate on an M query', f => { f.observation.checks[0].head_sha = f.binding.head_sha; }],
  ['stale CI commit', f => { f.observation.checks[1].head_sha = oid('e'); }],
  ['old publication ID', f => { f.observation.checks[0].external_id = publicationCheckId({binding:f.binding, subject_ref:f.subject_ref, review_refs:f.review_refs}); }],
  ['old CI ID', f => { f.observation.checks[1].external_id = trustedCICheckId({binding:f.binding, name:'trusted-ci'}); }],
  ['stale prepared M ID', f => { f.observation.checks[0].external_id = atomicPublicationCheckId({binding:f.binding, atomic:{...f.contract, after_oid:oid('e'), prepared_merge_oid:oid('e')}, qualification:f.qualification, subject_ref:f.subject_ref, review_refs:f.review_refs}); }],
  ['stale qualification identity', f => { f.observation.checks[1].external_id = atomicCICheckId({binding:f.binding, atomic:f.contract, qualification:{...f.qualification, evidence_sha256:hash('different mocked qualification')}, name:'trusted-ci'}); }],
  ['inspection qualification mismatch', f => { f.observation.atomic_qualification_sha256 = hash('different qualification'); }]
]) test(`prepared-commit gate rejects ${name} before mutation`, async t => {
  const f = fixture(t); f.enqueue(); change(f);
  assert.equal((await f.publisher.publishAtomic('pub')).status, 'held');
  assert.equal(f.counters.updates, 0); reserved(f);
});

for (const [name, change] of [
  ['missing', issuer => { delete issuer.atomic_qualification; }],
  ['unqualified', issuer => { issuer.atomic_qualification.qualified = false; }],
  ['unqualified production mode', issuer => { issuer.atomic_qualification.mode = 'production'; }],
  ['wrong protocol', issuer => { issuer.atomic_qualification.protocol = 'unknown'; }],
  ['wrong evidence scope', issuer => { issuer.atomic_qualification.scope = 'live-server'; }],
  ['wrong host', issuer => { issuer.atomic_qualification.api_host = 'elsewhere.example'; }],
  ['wrong repository node', issuer => { issuer.atomic_qualification.repository_node_id = 'R_other'; }],
  ['wrong repository', issuer => { issuer.atomic_qualification.repository = 'owner/other'; }],
  ['wrong App', issuer => { issuer.atomic_qualification.app_id = 999; }],
  ['wrong check', issuer => { issuer.atomic_qualification.check_name = 'other'; }],
  ['wrong harness', issuer => { issuer.atomic_qualification.harness_sha256 = hash('different harness'); }],
  ['wrong policy', issuer => { issuer.atomic_qualification.policy_sha256 = hash('different policy'); }],
  ['missing evidence hash', issuer => { delete issuer.atomic_qualification.evidence_sha256; }],
  ['extra field', issuer => { issuer.atomic_qualification.model_claimed = true; }]
]) test(`${name} protected qualified-mode binding cannot enqueue an atomic effect`, t => {
  const f = fixture(t), issuer = copy(f.issuer); change(issuer);
  assert.throws(() => {
    const publisher = new MergePublisher({...f.options, issuer});
    publisher.enqueueAtomic({id:'pub', subject_ref:f.subject_ref, review_refs:f.review_refs, grant_id:'grant', task_id:'source-task'});
  });
  assert.equal(f.get('tasks', 'github-atomic-publication:pub'), null);
  assert.equal(f.counters.inspections, 0); assert.equal(f.counters.updates, 0); assert.equal(f.claim(), undefined);
});

test('cold qualified-mode evidence drift cannot reuse an otherwise identical queued request', async t => {
  const f = fixture(t); f.enqueue();
  const issuer = copy(f.issuer); issuer.atomic_qualification.evidence_sha256 = hash('different controlled fixture qualification');
  const cold = new MergePublisher({...f.options, ledger:second(t, f), issuer});
  await assert.rejects(cold.publishAtomic('pub'), /QUALIFICATION|ISSUER|CONFIGURATION/);
  assert.equal(f.counters.inspections, 0); assert.equal(f.counters.updates, 0);
});

test('a qualification assertion inside the proposal cannot replace protected host configuration', t => {
  const f = fixture(t), row = f.get('proposals', 'proposal');
  const proposal = f.seed('proposals', row.id, {...row.value, atomic_qualification:f.qualification});
  const subject = ref('proposals', proposal), review = f.get('reviews', 'review');
  const reviewed = f.seed('reviews', review.id, {...review.value, subject});
  const issuer = copy(f.issuer); delete issuer.atomic_qualification;
  assert.throws(() => new MergePublisher({...f.options, issuer}).enqueueAtomic({id:'pub', subject_ref:subject, review_refs:[ref('reviews', reviewed)], grant_id:'grant', task_id:'source-task'}));
  assert.equal(f.get('tasks', 'github-atomic-publication:pub'), null); assert.equal(f.counters.updates, 0);
});

for (const kind of ['pause', 'grant', 'review', 'decline']) test(`${kind} during awaited inspection blocks the atomic send`, async t => {
  const f = fixture(t); f.enqueue(); const inspect = f.client.inspect;
  f.client.inspect = async (...args) => {
    const result = await inspect(...args);
    if (kind === 'pause') { const row = f.get('control', 'company'); f.seed('control', 'company', {...row.value, paused:true, pause_generation:2}); }
    if (kind === 'grant') f.seed('grants', 'grant', {status:'revoked', generation:2, remaining:1});
    if (kind === 'review') { const row = f.get('reviews', 'review'); f.seed('reviews', 'review', {...row.value, verdict:'Fail'}); }
    if (kind === 'decline') f.decline();
    return result;
  };
  assert.equal((await f.publisher.publishAtomic('pub')).status, 'held'); assert.equal(f.counters.updates, 0); reserved(f);
});

for (const [name, change] of [
  ['head moved', f => { f.remote.head_oid = oid('e'); }], ['different base', f => { f.remote.base_oid = oid('e'); }],
  ['tree changed', f => { f.remote.prepared_tree_oid = oid('e'); }], ['parents reversed', f => { f.remote.prepared_parents.reverse(); }],
  ['read unavailable', f => { f.client.observeAtomicRefs = async () => { throw Error('Unavailable'); }; }]
]) test(`post-send ${name} remains unknown without release or resend`, async t => {
  const f = fixture(t); f.enqueue(); await f.publisher.publishAtomic('pub'); change(f);
  assert.equal((await f.publisher.reconcileAtomic('pub')).status, 'unknown'); reserved(f);
  await new MergePublisher({...f.options, ledger:second(t, f)}).publishAtomic('pub');
  assert.equal(f.counters.updates, 1); reserved(f);
});

test('queued subject/review revisions and effect IDs cannot be silently rebound', async t => {
  const f = fixture(t); f.enqueue();
  const proposal = f.get('proposals', 'proposal'); f.seed('proposals', 'proposal', {...proposal.value, github_atomic_publication:{...f.contract, repository_node_id:'R_other'}});
  assert.throws(() => f.enqueue(), /STALE|MISMATCH/);
  const changed = ref('proposals', f.get('proposals', 'proposal'));
  assert.throws(() => f.enqueue('pub', changed), /STALE|MISMATCH/);
  assert.equal(f.counters.updates, 0);
});

for (const target of ['task', 'effect']) test(`changed durable atomic ${target} payload fails its original request digest`, async t => {
  const f = fixture(t); f.enqueue();
  if (target === 'effect') await f.publisher.publishAtomic('pub');
  const family = target === 'task' ? 'tasks' : 'effects', id = target === 'task' ? 'github-atomic-publication:pub' : 'pub';
  const row = f.get(family, id);
  f.seed(family, id, {...row.value, atomic:{...row.value.atomic, head_ref:'refs/heads/other'}});
  await assert.rejects(target === 'task' ? f.publisher.publishAtomic('pub') : f.publisher.reconcileAtomic('pub'), /ATOMIC_REQUEST_BINDING_MISMATCH/);
  assert.equal(f.counters.updates, target === 'task' ? 0 : 1);
  if (target === 'effect') reserved(f);
});

for (const [name, patch] of [
  ['repository node', {repository_node_id:'R_other'}], ['API host', {api_host:'configured.example'}],
  ['head ref', {head_ref:'refs/heads/other-topic'}], ['prepared merge tuple', {after_oid:oid('e'), prepared_merge_oid:oid('e')}]
]) test(`a newly reviewed ${name} remains present in the immutable normalized request`, t => {
  const original = fixture(t), baseline = original.enqueue().value;
  const f = fixture(t), proposal = f.get('proposals', 'proposal'), expected = {...f.contract, ...patch};
  const changed = f.seed('proposals', proposal.id, {...proposal.value, github_atomic_publication:expected});
  const subject = ref('proposals', changed), review = f.get('reviews', 'review');
  const reviewed = f.seed('reviews', review.id, {...review.value, subject});
  const nextIssuer = {...f.issuer, atomic_qualification:qualifiedMode(expected, f.issuer)};
  const publisher = new MergePublisher({...f.options, issuer:nextIssuer});
  const queued = publisher.enqueueAtomic({id:'pub', subject_ref:subject, review_refs:[ref('reviews', reviewed)], grant_id:'grant', task_id:'source-task'}).value;
  assert.deepEqual(queued.atomic, expected);
  assert.notEqual(queued.request_sha256, baseline.request_sha256);
  assert.deepEqual(queued.issuer, nextIssuer);
  assert.deepEqual(queued.qualification, nextIssuer.atomic_qualification);
  const envelope = Object.fromEntries(['kind', 'id', 'principal_id', 'authorization_scope', 'scope', 'subject_ref', 'review_refs', 'grant_id', 'task_id', 'binding', 'atomic', 'qualification', 'issuer', 'resource', 'context_sha256'].map(key => [key, queued[key]]));
  assert.equal(queued.request_sha256, hash(envelope));
  assert.equal(f.counters.updates, 0);
});

for (const kind of ['missing', 'wrong echo', 'extra field']) test(`malformed ${kind} mutation acknowledgement remains unknown and cannot cause a resend`, async t => {
  const f = fixture(t); f.enqueue();
  f.client.updateRefs = async (_contract, requestDigest) => {
    f.counters.updates++; f.remote.base_oid = f.contract.after_oid;
    if (kind === 'missing') return null;
    return {status:'acknowledged', client_mutation_id:kind === 'wrong echo' ? 'other' : requestDigest, ...(kind === 'extra field' ? {force:true} : {})};
  };
  assert.equal((await f.publisher.publishAtomic('pub')).status, 'unknown'); reserved(f);
  assert.equal((await new MergePublisher({...f.options, ledger:second(t, f)}).publishAtomic('pub')).status, 'observed');
  assert.equal(f.counters.updates, 1); reserved(f);
});

test('typed authorization objects cannot masquerade as the protected Boolean authorizer', t => {
  const f = fixture(t), publisher = new MergePublisher({...f.options, authorize:() => ({authorized:true})});
  assert.throws(() => publisher.enqueueAtomic({id:'pub', subject_ref:f.subject_ref, review_refs:f.review_refs, grant_id:'grant', task_id:'source-task'}));
  assert.equal(f.get('tasks', 'github-atomic-publication:pub'), null); assert.equal(f.counters.updates, 0);
});

for (const change of ['changed', 'reduced']) test(`cold ${change} protected CI configuration cannot reuse the queued request with the same policy hash`, async t => {
  const f = fixture(t), firstIssuer = copy(f.issuer);
  if (change === 'reduced') firstIssuer.required_checks.push({name:'additional-ci', app_id:88});
  const first = new MergePublisher({...f.options, issuer:firstIssuer});
  first.enqueueAtomic({id:'pub', subject_ref:f.subject_ref, review_refs:f.review_refs, grant_id:'grant', task_id:'source-task'});
  const nextIssuer = copy(f.issuer);
  if (change === 'changed') nextIssuer.required_checks[0].app_id = 999;
  assert.equal(nextIssuer.policy_sha256, firstIssuer.policy_sha256);
  const cold = new MergePublisher({...f.options, ledger:second(t, f), issuer:nextIssuer});
  await assert.rejects(cold.publishAtomic('pub'), /ATOMIC_ISSUER_CONFIGURATION_CHANGED/);
  assert.equal(f.counters.inspections, 0); assert.equal(f.counters.updates, 0); assert.equal(f.claim(), undefined);
});

for (const [field, value] of [
  ['protocol', 'unknown'], ['api_host', 'elsewhere.example/path'], ['repository_node_id', ''], ['base_ref', 'main'],
  ['head_ref', 'refs/tags/topic'], ['before_base_oid', oid('e')], ['before_head_oid', oid('e')],
  ['after_oid', oid('b')], ['prepared_merge_oid', oid('e')], ['prepared_tree_oid', oid('e')],
  ['prepared_parents', [oid('a'), oid('b')]], ['force', true], ['before_base_oid', oid('0')], ['after_oid', oid('0')]
]) test(`closed atomic proposal rejects invalid ${field}=${JSON.stringify(value)}`, t => {
  const f = fixture(t), row = f.get('proposals', 'proposal');
  const proposal = f.seed('proposals', row.id, {...row.value, github_atomic_publication:{...f.contract, [field]:value}});
  const subject = ref('proposals', proposal), review = f.get('reviews', 'review');
  const reviewed = f.seed('reviews', review.id, {...review.value, subject});
  assert.throws(() => f.enqueue('pub', subject, [ref('reviews', reviewed)]));
  assert.equal(f.get('tasks', 'github-atomic-publication:pub'), null); assert.equal(f.counters.updates, 0);
});

function graphNode(contract = atomicContract()) {
  return {__typename:'Repository', id:contract.repository_node_id, nameWithOwner:'owner/repo',
    base:{name:'main', prefix:'refs/heads/', target:{__typename:'Commit', oid:contract.before_base_oid}},
    head:{name:'topic', prefix:'refs/heads/', target:{__typename:'Commit', oid:contract.before_head_oid}},
    prepared:{__typename:'Commit', oid:contract.prepared_merge_oid, tree:{oid:contract.prepared_tree_oid}, parents:{totalCount:2, nodes:contract.prepared_parents.map(oid => ({oid})), pageInfo:{hasNextPage:false}}}};
}
function httpClient(handler, options = {}) {
  const requests = [];
  const client = new GitHubClient({token:'fixture-only-token', atomicQualification:qualifiedMode(), fetch:async (url, init) => {
    const body = init.body === undefined ? null : JSON.parse(init.body); requests.push({url, init, body});
    const result = await handler(body, requests.length, {url, init});
    return {status:200, async json() { return result; }};
  }, ...options});
  return {client, requests};
}

test('GraphQL read binds repository node, full ref names, prepared Commit tree and complete ordered parents', async () => {
  const contract = atomicContract(), {client, requests} = httpClient(() => ({data:{node:graphNode(contract)}}));
  const observed = await client.observeAtomicRefs(contract);
  assert.deepEqual(observed, {api_host:'api.github.com', repository_node_id:'R_fixture', repository:'owner/repo', base_ref:contract.base_ref, head_ref:contract.head_ref, base_oid:contract.before_base_oid, head_oid:contract.before_head_oid, prepared_merge_oid:contract.prepared_merge_oid, prepared_tree_oid:contract.prepared_tree_oid, prepared_parents:contract.prepared_parents});
  assert.equal(requests.length, 1); assert.equal(requests[0].url, 'https://api.github.com/graphql');
  assert.equal(requests[0].init.method, 'POST'); assert.match(requests[0].body.query, /parents\(first:\s*3\)/);
  assert.deepEqual(requests[0].body.variables, {repositoryId:'R_fixture', baseRef:contract.base_ref, headRef:contract.head_ref, mergeOid:contract.prepared_merge_oid});
});

test('actual client fetches check runs for prepared M while PR head and native-review identity remain H', async t => {
  const f = fixture(t);
  const {client, requests} = httpClient((_body, _count, {url}) => {
    const endpoint = new URL(url), path = endpoint.pathname;
    if (path === '/repos/owner/repo/pulls/1') return {state:'open', draft:false, merged:false, user:{id:10}, head:{sha:f.binding.head_sha, ref:'topic', repo:{full_name:'owner/repo'}}, base:{ref:'main', repo:{full_name:'owner/repo'}}};
    if (path === '/repos/owner/repo/git/ref/heads/main') return {object:{sha:f.binding.base_sha}};
    if (path === `/repos/owner/repo/git/commits/${f.binding.head_sha}`) return {tree:{sha:f.binding.tree_sha}, parents:[{sha:f.binding.base_sha}]};
    if (path === '/repos/owner/repo') return {full_name:'owner/repo', owner:{type:'User'}, allow_merge_commit:true};
    if (path === '/repos/owner/repo/branches/main/protection') return {required_status_checks:{strict:true, checks:[{context:f.issuer.check_name, app_id:f.issuer.app_id}]}, enforce_admins:{enabled:true}, allow_force_pushes:{enabled:false}, required_linear_history:{enabled:false}, lock_branch:{enabled:false}};
    if (path === `/repos/owner/repo/compare/${f.binding.base_sha}...${f.binding.head_sha}`) return {status:'ahead', merge_base_commit:{sha:f.binding.base_sha}};
    if (path === `/repos/owner/repo/commits/${f.contract.prepared_merge_oid}/check-runs`) return {check_runs:f.observation.checks.map(check => ({...check, app:{id:check.app_id}}))};
    if (path === '/repos/owner/repo/pulls/1/reviews') return [];
    throw Error('Unexpected synthetic endpoint');
  });
  const observed = await client.inspectAtomic(f.binding, f.issuer.check_name, f.contract);
  assert.equal(observed.head_sha, f.binding.head_sha);
  assert.equal(observed.head_branch, 'topic');
  assert.equal(observed.checked_commit_sha, f.contract.prepared_merge_oid);
  assert.equal(observed.atomic_qualification_sha256, hash(f.qualification));
  assert.ok(observed.checks.every(check => check.head_sha === f.contract.prepared_merge_oid));
  const checkPaths = requests.map(request => new URL(request.url).pathname).filter(path => path.endsWith('/check-runs'));
  assert.deepEqual(checkPaths, [`/repos/owner/repo/commits/${f.contract.prepared_merge_oid}/check-runs`]);
  assert.ok(requests.every(request => request.init.method === 'GET'));
});

test('one GraphQL mutation carries both beforeOid guards with afterOid and force:false', async () => {
  const contract = atomicContract(), requestDigest = hash('one immutable admitted request');
  const {client, requests} = httpClient(body => ({data:{updateRefs:{clientMutationId:body.variables.input.clientMutationId}}}));
  assert.deepEqual(await client.updateRefs(contract, requestDigest), {status:'acknowledged', client_mutation_id:requestDigest});
  assert.equal(requests.length, 1); assert.match(requests[0].body.query, /updateRefs\(input:\s*\$input\)/);
  assert.deepEqual(requests[0].body.variables.input, {repositoryId:'R_fixture', clientMutationId:requestDigest, refUpdates:[
    {name:contract.base_ref, beforeOid:contract.before_base_oid, afterOid:contract.after_oid, force:false},
    {name:contract.head_ref, beforeOid:contract.before_head_oid, afterOid:contract.before_head_oid, force:false}
  ]});
});

test('atomic host must match protected client configuration and use its origin root before any I/O', async () => {
  for (const apiBase of ['https://elsewhere.example', 'https://api.github.com/api/v3']) {
    const {client, requests} = httpClient(() => { throw Error('Unexpected request'); }, {apiBase});
    await assert.rejects(client.observeAtomicRefs(atomicContract()));
    await assert.rejects(client.updateRefs(atomicContract(), hash('request')));
    assert.equal(requests.length, 0);
  }
  // A reviewed configured-host binding is supported syntactically. This mock
  // establishes no GHES endpoint/schema, permission or policy qualification.
  const contract = {...atomicContract(), api_host:'configured.example'};
  const {client, requests} = httpClient(() => ({data:{node:graphNode(contract)}}), {apiBase:'https://configured.example'});
  assert.equal((await client.observeAtomicRefs(contract)).api_host, 'configured.example');
  assert.equal(requests[0].url, 'https://configured.example/graphql');
});

for (const [name, qualification] of [
  ['missing', undefined], ['unqualified', {...qualifiedMode(), qualified:false}],
  ['unsupported live mode', {...qualifiedMode(), mode:'production'}],
  ['host mismatch', {...qualifiedMode(), api_host:'elsewhere.example'}],
  ['repository mismatch', {...qualifiedMode(), repository_node_id:'R_other'}]
]) test(`actual mutation client refuses ${name} protected mode before fetching`, async () => {
  const {client, requests} = httpClient(() => { throw Error('Unexpected remote mutation'); }, {atomicQualification:qualification});
  await assert.rejects(client.updateRefs(atomicContract(), hash('request')));
  assert.equal(requests.length, 0);
});

test('synthetic controlled qualification cannot enable the ordinary default transport', async () => {
  const previous = globalThis.fetch; let sent = 0;
  // Replace the default with a non-network sentinel so even a regression cannot
  // contact a real provider. The constructor receives no injected fetch option.
  globalThis.fetch = async () => { sent++; throw Error('Default transport must remain disabled'); };
  try {
    const client = new GitHubClient({token:'fixture-only-token', atomicQualification:qualifiedMode()});
    await assert.rejects(client.updateRefs(atomicContract(), hash('request')), /ATOMIC_CONTROLLED_TRANSPORT_REQUIRED/);
    assert.equal(sent, 0);
  } finally { globalThis.fetch = previous; }
});

test('protected client qualification is copied rather than mutable through the caller object', async () => {
  const qualification = qualifiedMode();
  const {client, requests} = httpClient(body => ({data:{updateRefs:{clientMutationId:body.variables.input.clientMutationId}}}), {atomicQualification:qualification});
  qualification.qualified = false;
  assert.equal((await client.updateRefs(atomicContract(), hash('request'))).status, 'acknowledged');
  assert.equal(requests.length, 1);
});

for (const race of ['none', 'base', 'head']) test(`mock server atomic CAS ${race === 'none' ? 'positive control' : 'rejects raced ' + race} through the actual client and ledger`, async t => {
  const f = fixture(t); f.enqueue();
  let refs = {base:f.contract.before_base_oid, head:f.contract.before_head_oid};
  const {client, requests} = httpClient(body => {
    assert.equal(f.ledger.inTransaction, false);
    if (!body.query.includes('updateRefs(')) {
      const node = graphNode(f.contract); node.base.target.oid = refs.base; node.head.target.oid = refs.head;
      return {data:{node}};
    }
    f.counters.updates++;
    assert.equal(f.get('effects', 'pub').value.dispatched, true); reserved(f);
    const input = body.variables.input;
    assert.equal(input.refUpdates.length, 2);
    assert.deepEqual(input.refUpdates.map(update => update.name), [f.contract.base_ref, f.contract.head_ref]);
    // Mock-only server semantics: race AFTER all client preflight reads, then
    // validate every beforeOid before applying any member of the one list.
    if (race !== 'none') refs[race] = oid('e');
    const before = copy(refs), current = {[f.contract.base_ref]:refs.base, [f.contract.head_ref]:refs.head};
    const accepted = input.refUpdates.every(update => update.force === false && current[update.name] === update.beforeOid);
    if (!accepted) { assert.deepEqual(refs, before); return {errors:[{message:'Mock atomic compare-and-swap rejected'}]}; }
    const after = {...current}; for (const update of input.refUpdates) after[update.name] = update.afterOid;
    refs = {base:after[f.contract.base_ref], head:after[f.contract.head_ref]};
    return {data:{updateRefs:{clientMutationId:input.clientMutationId}}};
  });
  const integrated = {...f.options, client:{...f.client, observeAtomicRefs:client.observeAtomicRefs.bind(client), updateRefs:client.updateRefs.bind(client)}};
  const publisher = new MergePublisher(integrated), first = await publisher.publishAtomic('pub');
  assert.equal(first.status, race === 'none' ? 'pending' : 'unknown'); reserved(f);
  assert.deepEqual(refs, race === 'none' ? {base:f.contract.after_oid, head:f.contract.before_head_oid} : {base:race === 'base' ? oid('e') : f.contract.before_base_oid, head:race === 'head' ? oid('e') : f.contract.before_head_oid});
  const result = await new MergePublisher({...integrated, ledger:second(t, f)}).publishAtomic('pub');
  assert.equal(result.status, race === 'none' ? 'observed' : 'unknown'); assert.equal(result.semantic_acceptance, false); reserved(f);
  assert.equal(f.counters.updates, 1);
  assert.equal(requests.filter(request => request.body.query.includes('updateRefs(')).length, 1);
});

for (const [name, change] of [
  ['missing before guard', value => { delete value.before_head_oid; }], ['extra force flag', value => { value.force = true; }],
  ['caller ref update list', value => { value.refUpdates = []; }], ['create ref', value => { value.before_base_oid = oid('0'); }],
  ['delete ref', value => { value.after_oid = oid('0'); value.prepared_merge_oid = oid('0'); }]
]) test(`direct client rejects ${name} before fetching`, async () => {
  const contract = atomicContract(); change(contract);
  const {client, requests} = httpClient(() => { throw Error('Unexpected remote request'); });
  await assert.rejects(client.updateRefs(contract, hash('request'))); assert.equal(requests.length, 0);
});

for (const [name, change] of [
  ['missing repository', data => { data.node = null; }], ['wrong node', data => { data.node.id = 'R_other'; }],
  ['wrong typename', data => { data.node.__typename = 'User'; }], ['missing ref', data => { data.node.head = null; }],
  ['non-Commit target', data => { data.node.head.target.__typename = 'Tag'; }], ['wrong ref prefix', data => { data.node.base.prefix = 'refs/tags/'; }],
  ['non-Commit prepared object', data => { data.node.prepared.__typename = 'Tree'; }], ['prepared OID mismatch', data => { data.node.prepared.oid = oid('e'); }],
  ['truncated parent page', data => { data.node.prepared.parents.pageInfo.hasNextPage = true; }],
  ['extra parent count', data => { data.node.prepared.parents.totalCount = 3; }], ['missing parent node', data => { data.node.prepared.parents.nodes.pop(); }],
  ['null parent node', data => { data.node.prepared.parents.nodes[0] = null; }]
]) test(`GraphQL atomic read rejects ${name}`, async () => {
  const data = {node:graphNode()}; change(data); const {client} = httpClient(() => ({data}));
  await assert.rejects(client.observeAtomicRefs(atomicContract()));
});

for (const [name, response] of [
  ['errors only', {errors:[{message:'Denied'}]}], ['partial data with errors', {data:{updateRefs:{clientMutationId:hash('request')}}, errors:[{message:'Partial'}]}],
  ['null payload', {data:{updateRefs:null}}], ['missing payload', {data:{}}], ['wrong echo', {data:{updateRefs:{clientMutationId:'other'}}}],
  ['unknown payload field', {data:{updateRefs:{clientMutationId:hash('request'), force:true}}}], ['nonarray errors', {errors:{message:'Invalid'}, data:{updateRefs:{clientMutationId:hash('request')}}}]
]) test(`GraphQL mutation ${name} cannot become an ACK or trigger a retry`, async () => {
  const {client, requests} = httpClient(() => response);
  await assert.rejects(client.updateRefs(atomicContract(), hash('request'))); assert.equal(requests.length, 1);
});

test('GraphQL transport failure and reflected credentials remain sanitized unknown outcomes', async () => {
  const transport = new GitHubClient({token:'fixture-only-token', atomicQualification:qualifiedMode(), fetch:async () => { throw Error('fixture-only-token'); }});
  await assert.rejects(transport.updateRefs(atomicContract(), hash('request')), error => !error.message.includes('fixture-only-token'));
  const reflected = httpClient(() => ({data:{updateRefs:{clientMutationId:'fixture-only-token'}}}));
  await assert.rejects(reflected.client.updateRefs(atomicContract(), hash('request')), error => !error.message.includes('fixture-only-token'));
});

for (const status of [403, 503]) test(`HTTP${status} does not parse foreign response bodies or retry an atomic mutation`, async () => {
  let sent = 0, parsed = 0;
  const client = new GitHubClient({token:'fixture-only-token', atomicQualification:qualifiedMode(), fetch:async () => { sent++; return {status, async json() { parsed++; throw Error('fixture-only-token'); }}; }});
  await assert.rejects(client.updateRefs(atomicContract(), hash('request')), new RegExp(`GITHUB_HTTP_${status}`));
  assert.equal(sent, 1); assert.equal(parsed, 0);
});

for (const kind of ['bad JSON', 'foreign accessor']) test(`${kind} produces a sanitized unknown response without retry`, async () => {
  let sent = 0;
  const client = new GitHubClient({token:'fixture-only-token', atomicQualification:qualifiedMode(), fetch:async () => { sent++; return {status:200, async json() {
    if (kind === 'bad JSON') throw Error('fixture-only-token');
    return Object.defineProperty({}, 'data', {enumerable:true, get() { throw Error('fixture-only-token'); }});
  }}; }});
  await assert.rejects(client.updateRefs(atomicContract(), hash('request')), error => !error.message.includes('fixture-only-token'));
  assert.equal(sent, 1);
});
