// Fictional accepted-P1 SQLite fixtures and mocked REST only. No live qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClient, MergePublisher, publicationDigest, publicationCheckId, trustedCICheckId } from '../plugins/soloco/runtime/peers/github.mjs';
import { PeerLedger } from '../plugins/soloco/runtime/peers/ledger.mjs';
import { peerFixture } from './peer-fixture.mjs';

const sha = char => char.repeat(40);
const hash = publicationDigest;
const copy = value => JSON.parse(JSON.stringify(value));
const ref = (family, row) => ({ family, id: row.id, revision: row.revision, sha256: row.sha256 });
function latch() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture(t, { native = false, gate = true } = {}) {
  const storage = peerFixture(); t.after(() => storage.close()); const ledger = storage.ledger;
  const get = (family, id) => ledger.read(tx => tx.get(family, id));
  const seed = (family, id, value) => ledger.write('fixture.seed', 'scheduler', tx => tx.put(family, id, value, tx.get(family, id)?.revision ?? 0));
  seed('grants', 'grant', { status: 'active', generation: 1 });
  const issuer = { app_id: 42, check_name: 'trusted-publication', harness_sha256: hash('operator harness'), policy_sha256: hash('operator policy'), required_checks: [{ name: 'trusted-ci', app_id: 77 }] };
  const review = GitHubClient.reviewSnapshot({ id: 50, user: { id: 20, login: 'review-user' }, commit_id: sha('a'), state: 'APPROVED', body: 'Exact subject', submitted_at: '2026-11-07T00:00:00Z' });
  const binding = { owner: 'owner', repo: 'repo', number: 1, head_sha: sha('a'), base_sha: sha('b'), tree_sha: sha('c'), base_branch: 'main', merge_method: 'merge', scope_sha256: hash('scope'), harness_sha256: issuer.harness_sha256, policy_sha256: issuer.policy_sha256, author_principal_id: 'cos-a', expected_app_id: 42, check_name: issuer.check_name, required_native_approvals: native ? 1 : 0, native_reviews: native ? [{ id: review.id, sha256: review.sha256 }] : [] };
  const subject_ref = ref('proposals', seed('proposals', 'proposal', { principal_id: 'cos-a', github_publication: binding }));
  const review_refs = [ref('reviews', seed('reviews', 'review', { status: 'accepted', subject: subject_ref, reviewer_principal_id: 'reviewer', author_principal_id: 'cos-a', native_id: 'independent-review-session', verdict: 'Pass', context_sha256: hash('context'), output_sha256: hash('output'), termination_confirmed: true, recorded_by: 'scheduler', proof: { protocol: 'peer-native-review-v1', blockers: [] } }))];
  const external_id = publicationCheckId({ binding, subject_ref, review_refs });
  const check = { id: 100, name: issuer.check_name, app_id: 42, head_sha: binding.head_sha, status: 'completed', conclusion: 'success', external_id };
  const ci = { id: 101, name: 'trusted-ci', app_id: 77, head_sha: binding.head_sha, status: 'completed', conclusion: 'success', external_id: trustedCICheckId({ binding, name: 'trusted-ci' }) };
  const observation = { owner: 'owner', repo: 'repo', number: 1, state: 'open', draft: false, merged: false, author_id: 10, head_sha: binding.head_sha, base_sha: binding.base_sha, tree_sha: binding.tree_sha, base_branch: 'main', head_repository: 'owner/repo', base_repository: 'owner/repo', repository_owner_type: 'User', repository_name: 'owner/repo', allow_merge_commit: true, contains_current_base: true, protection: { strict: true, enforce_admins: true, force_pushes: false, review_bypass: false, linear_history: false, locked: false, required_native_approvals: native ? 1 : 0, checks: [{ context: issuer.check_name, app_id: 42 }] }, checks: gate ? [check, ci] : [ci], reviews: native ? [review] : [], review_permissions: { 'review-user': true } };
  const counters = { checks: 0, merges: 0, updates: 0, inspections: 0 }; let permitted = true;
  const claim = () => get('claims', 'github-publication:repo:owner/repo')?.value;
  const client = {
    async inspect() { assert.equal(ledger.inTransaction, false); counters.inspections++; return copy(observation); },
    async observe() { assert.equal(ledger.inTransaction, false); return copy(observation); },
    async requestMerge() { assert.equal(ledger.inTransaction, false); counters.merges++; assert.equal(claim().status, 'reserved'); return { status: 'pending', uuid: 'uuid-1' }; },
    async mergeResult() { assert.equal(ledger.inTransaction, false); return { status: 'pending' }; },
    async createCheckRun(request) {
      assert.equal(ledger.inTransaction, false); counters.checks++;
      const admitted = get('effects', `github-check:${request.publication_id}`).value;
      assert.equal(admitted.status, 'dispatch_admitted'); assert.equal(admitted.send_claimed, true);
      const reply = { id: 200, name: request.name, app_id: 42, head_sha: request.head_sha, external_id: request.external_id, status: 'completed', conclusion: 'success' };
      observation.checks = observation.checks.filter(item => item.name !== request.name).concat(reply); return reply;
    },
  };
  const options = { ledger, client, issuer, principal: 'cos-a', authorize: (view, request) => { assert.equal(view.put, undefined); return permitted && view.get('grants', request.grant_id)?.value.status === 'active'; }, resourceOverlap: (a, b) => a.key === b.key || a.kind === 'repo' && b.kind === 'repo' && a.repository === b.repository, updateBranch: async () => { assert.equal(ledger.inTransaction, false); counters.updates++; } };
  const publisher = new MergePublisher(options);
  const enqueue = (id = 'pub') => publisher.enqueue({ id, subject_ref, review_refs, grant_id: 'grant', task_id: 'source-task' });
  const merged = () => Object.assign(observation, { merged: true, state: 'closed', merge_commit_sha: sha('d'), merged_tree_sha: binding.tree_sha, merge_parents: [binding.base_sha, binding.head_sha], merged_commit_reachable: true });
  return { ...storage, get, seed, issuer, binding, subject_ref, review_refs, observation, external_id, counters, claim, client, options, publisher, enqueue, merged, decline: () => { permitted = false; } };
}
function secondConnection(t, f) { const ledger = new PeerLedger(f.root); t.after(() => ledger.close()); assert.notEqual(ledger.db, f.ledger.db); return ledger; }
function gate(f, values) { f.observation.checks = f.observation.checks.filter(item => item.name !== f.issuer.check_name).concat(values); }
function check(f, patch = {}) { return { id: 200, name: f.issuer.check_name, app_id: 42, head_sha: f.binding.head_sha, external_id: f.external_id, status: 'completed', conclusion: 'failure', completed_at: '2020-01-01T00:00:00Z', ...patch }; }
async function pendingCheck(f) {
  f.enqueue();
  f.client.createCheckRun = async request => { f.counters.checks++; return { id: 200, name: request.name, app_id: 42, head_sha: request.head_sha, external_id: request.external_id, status: 'completed', conclusion: 'success' }; };
  assert.equal((await f.publisher.attest('pub')).status, 'unknown');
  const value = f.get('effects', 'github-check:pub').value;
  assert.equal(value.status, 'pending'); assert.equal(value.check_id, 200);
}
function deciding(f, id, state) { return GitHubClient.reviewSnapshot({ id, user: { id: 20, login: 'review-user' }, commit_id: f.binding.head_sha, state, body: state, submitted_at: '2026-11-07T00:00:00Z' }); }
function nestedEvents(f) { const page = f.ledger.events({ limit: 100 }); assert.equal(page.complete, true); return page.items.flatMap(item => item.payload.events); }

test('durable admission precedes one merge and exact acceptance survives replacement', async t => {
  const f = fixture(t); f.enqueue(); assert.deepEqual(f.enqueue(), f.enqueue());
  assert.equal((await f.publisher.publish('pub')).status, 'pending');
  assert.equal(f.get('effects', 'pub').value.dispatched, true); assert.equal(f.claim().status, 'reserved');
  const successor = new MergePublisher({ ...f.options, ledger: secondConnection(t, f) });
  await successor.publish('pub'); assert.equal(f.counters.merges, 1);
  f.merged(); const result = await successor.reconcile('pub');
  assert.equal(result.status, 'succeeded'); assert.equal(result.receipt_sha256, hash(result.receipt));
  assert.equal(result.receipt.tree_sha, f.binding.tree_sha); assert.equal(f.claim().status, 'released');
  assert.equal(f.get('tasks', 'github-publication:pub').value.status, 'completed');
  await successor.publish('pub'); assert.equal(f.counters.merges, 1);
  assert.ok(nestedEvents(f).some(item => item.type === 'github.publication.accepted'));
});
for (const field of ['head_sha', 'base_sha', 'tree_sha']) test(`${field} changed in flight stays reserved without resend`, async t => {
  const f = fixture(t); f.enqueue(); await f.publisher.publish('pub'); f.observation[field] = sha('f');
  assert.equal((await f.publisher.reconcile('pub')).reason, 'SOURCE_CHANGED_IN_FLIGHT');
  await new MergePublisher(f.options).publish('pub'); assert.equal(f.counters.merges, 1); assert.equal(f.claim().status, 'reserved');
  f.client.mergeResult = async () => ({ status: 'failed' });
  assert.equal((await f.publisher.reconcile('pub')).status, 'failed'); assert.equal(f.claim().status, 'released');
});
for (const poll of ['expired', 'enqueued', 'merged', 'failed']) test(`${poll} polling alone cannot establish a merge`, async t => {
  const f = fixture(t); f.enqueue(); await f.publisher.publish('pub');
  f.client.mergeResult = async () => ({ status: poll, ...(poll === 'merged' ? { merge_commit_sha: sha('d') } : {}) });
  if (poll === 'failed') f.client.observe = async () => { throw Error('unavailable'); };
  assert.equal((await f.publisher.reconcile('pub')).status, 'unknown'); assert.equal(f.claim().status, 'reserved');
  await f.publisher.publish('pub'); assert.equal(f.counters.merges, 1);
});
for (const initial of ['lost', 'enqueued', 'merged']) test(`${initial} initial receipt requires independent readback`, async t => {
  const f = fixture(t); f.enqueue(); f.client.requestMerge = async () => { f.counters.merges++; if (initial === 'lost') throw Error('lost'); return initial === 'merged' ? { status: 'merged', merge_commit_sha: sha('d') } : { status: 'enqueued' }; };
  assert.equal((await f.publisher.publish('pub')).status, 'unknown');
  await new MergePublisher(f.options).publish('pub'); assert.equal(f.counters.merges, 1); assert.equal(f.claim().status, 'reserved');
  f.merged(); f.client.mergeResult = async () => { throw Error('expired'); };
  assert.equal((await f.publisher.reconcile('pub')).status, 'succeeded');
});
for (const field of ['merged_tree_sha', 'merge_parents', 'merged_commit_reachable', 'head_sha']) test(`wrong merged ${field} is a sticky violation`, async t => {
  const f = fixture(t); f.enqueue(); await f.publisher.publish('pub'); f.merged();
  f.observation[field] = field === 'merge_parents' ? [sha('e'), f.binding.head_sha] : field === 'merged_commit_reachable' ? false : sha('e');
  assert.equal((await f.publisher.reconcile('pub')).status, 'violation');
  f.merged(); assert.equal((await f.publisher.reconcile('pub')).status, 'violation'); assert.equal(f.claim().status, 'reserved');
});
test('FIFO, overlapping claims and rollback use actual SQLite', async t => {
  const f = fixture(t); f.enqueue('first'); f.enqueue('second');
  await assert.rejects(f.publisher.publish('second'), /NOT_NEXT_PUBLICATION_CANDIDATE/);
  f.seed('claims', 'other', { status: 'active', resources: [{ kind: 'repo', repository: 'owner/repo' }] });
  await assert.rejects(f.publisher.publish('first'), /PUBLICATION_RESOURCE_RESERVED/); assert.equal(f.get('effects', 'first'), null);
  f.seed('claims', 'other', { status: 'released' });
  const before = f.ledger.events({ limit: 100 }).total;
  await assert.rejects(new MergePublisher({ ...f.options, clock: () => 'invalid' }).publish('first'), /INVALID_CLOCK/);
  assert.equal(f.claim(), undefined); assert.equal(f.get('effects', 'first'), null); assert.equal(f.ledger.events({ limit: 100 }).total, before);
});
for (const patch of [{ reviewer_principal_id: 'cos-a' }, { recorded_by: 'cos-a' }, { termination_confirmed: false }, { proof: { protocol: 'peer-native-review-v1', blockers: ['open'] } }]) test(`unqualified canonical review ${JSON.stringify(patch)} cannot enqueue`, t => {
  const f = fixture(t); const row = f.get('reviews', 'review'); f.seed('reviews', row.id, { ...row.value, ...patch });
  assert.throws(() => f.publisher.enqueue({ id: 'pub', subject_ref: f.subject_ref, review_refs: [ref('reviews', f.get('reviews', row.id))], grant_id: 'grant', task_id: 'source-task' }));
  assert.equal(f.get('tasks', 'github-publication:pub'), null);
});
test('immutable review and subject revisions cannot be silently replaced', t => {
  const f = fixture(t); f.enqueue(); const row = f.get('reviews', 'review'); f.seed('reviews', row.id, { ...row.value, output_sha256: hash('changed') });
  assert.throws(() => f.enqueue(), /STALE_CANONICAL_SUBJECT/);
  assert.throws(() => f.publisher.enqueue({ id: 'pub', subject_ref: f.subject_ref, review_refs: [ref('reviews', f.get('reviews', row.id))], grant_id: 'grant', task_id: 'source-task' }), /EFFECT_ID_PAYLOAD_MISMATCH/);
});
for (const [name, change] of [
  ['head', f => { f.observation.head_sha = sha('e'); }], ['base', f => { f.observation.base_sha = sha('e'); }], ['tree', f => { f.observation.tree_sha = sha('e'); }],
  ['ancestry', f => { f.observation.contains_current_base = false; }], ['App', f => { f.observation.checks[0].app_id = 9; }],
  ['gate conclusion', f => { f.observation.checks[0].conclusion = 'neutral'; }], ['CI conclusion', f => { f.observation.checks[1].conclusion = 'skipped'; }],
  ['CI App', f => { f.observation.checks[1].app_id = 9; }], ['harness', f => { f.observation.checks[1].external_id = 'wrong'; }], ['policy', f => { f.observation.checks[0].external_id = 'wrong'; }],
  ['strict protection', f => { f.observation.protection.strict = false; }], ['admin protection', f => { f.observation.protection.enforce_admins = false; }],
  ['linear history', f => { f.observation.protection.linear_history = true; }], ['App requirement', f => { f.observation.protection.checks[0].app_id = null; }],
]) test(`${name} changing on second preflight prevents mutation`, async t => {
  const f = fixture(t); f.enqueue(); const inspect = f.client.inspect;
  f.client.inspect = async () => { if (f.counters.inspections === 1) change(f); return inspect(); };
  assert.equal((await f.publisher.publish('pub')).status, 'held'); assert.equal(f.counters.merges, 0); assert.equal(f.claim().status, 'released');
  await assert.rejects(f.publisher.publish('pub'), /PUBLICATION_HELD_NEW_CANDIDATE_REQUIRED/);
});
function revoke(f, kind) {
  if (kind === 'pause' || kind === 'policy') { const row = f.get('control', 'company'); f.seed('control', row.id, { ...row.value, ...(kind === 'pause' ? { paused: true, pause_generation: 2 } : { policy_generation: 2 }) }); }
  if (kind === 'grant') f.seed('grants', 'grant', { status: 'revoked', generation: 2 });
  if (kind === 'review') { const row = f.get('reviews', 'review'); f.seed('reviews', row.id, { ...row.value, verdict: 'Fail' }); }
  if (kind === 'principal') { const row = f.get('principals', 'reviewer'); f.seed('principals', row.id, { ...row.value, generation: 2 }); }
  if (kind === 'decline') f.decline();
}
for (const kind of ['pause', 'policy', 'grant', 'review', 'principal', 'decline']) test(`${kind} during I/O blocks dispatch and later acceptance`, async t => {
  const f = fixture(t); f.enqueue(); const inspect = f.client.inspect;
  f.client.inspect = async () => { const value = await inspect(); revoke(f, kind); return value; };
  assert.equal((await f.publisher.publish('pub')).status, 'held'); assert.equal(f.counters.merges, 0);
  const g = fixture(t); g.enqueue(); await g.publisher.publish('pub'); g.merged(); const finalInspect = g.client.inspect;
  g.client.inspect = async () => { const value = await finalInspect(); revoke(g, kind); return value; };
  const result = await g.publisher.reconcile('pub'); assert.equal(result.status, 'unknown'); assert.equal(result.merged_observed, true); assert.equal(g.claim().status, 'reserved');
});
for (const neutral of ['COMMENTED', 'PENDING']) test(`${neutral} neither erases a veto nor invalidates an exact approval`, async t => {
  const f = fixture(t); f.enqueue(); f.observation.reviews = [deciding(f, 51, neutral), deciding(f, 50, 'CHANGES_REQUESTED')];
  assert.equal((await f.publisher.publish('pub')).reason, 'NATIVE_CHANGES_REQUESTED'); assert.equal(f.counters.merges, 0);
  const g = fixture(t, { native: true }); g.enqueue(); g.observation.reviews.unshift(deciding(g, 51, neutral));
  assert.equal((await g.publisher.publish('pub')).status, 'pending');
});
for (const kind of ['dismissal', 'replacement-veto', 'head', 'hash', 'permission', 'author']) test(`neutral feedback preserves native ${kind} restriction`, async t => {
  const f = fixture(t, { native: true }); f.enqueue(); f.observation.reviews.push(deciding(f, 52, 'COMMENTED'));
  if (kind === 'dismissal') f.observation.reviews.unshift(deciding(f, 51, 'DISMISSED'));
  if (kind === 'replacement-veto') f.observation.reviews.unshift(deciding(f, 51, 'CHANGES_REQUESTED'));
  if (kind === 'head') f.observation.reviews[0].commit_id = sha('e');
  if (kind === 'hash') f.observation.reviews[0].sha256 = hash('changed');
  if (kind === 'permission') f.observation.review_permissions['review-user'] = false;
  if (kind === 'author') f.observation.author_id = 20;
  assert.equal((await f.publisher.publish('pub')).status, 'held'); assert.equal(f.counters.merges, 0);
});
test('operator CI configuration is copied and cannot be replaced by a trivial candidate', t => {
  const f = fixture(t); f.issuer.required_checks[0].app_id = 999; f.enqueue();
  assert.throws(() => new MergePublisher({ ...f.options, issuer: { ...f.issuer, required_checks: [] } }), /OPERATOR_TRUSTED_CI_REQUIRED/);
  const row = f.get('proposals', 'proposal'); f.seed('proposals', row.id, { ...row.value, github_publication: { ...f.binding, harness_sha256: hash('other') } });
  assert.throws(() => f.publisher.enqueue({ id: 'other', subject_ref: ref('proposals', f.get('proposals', row.id)), review_refs: f.review_refs, grant_id: 'grant', task_id: 'source-task' }), /OPERATOR_POLICY_MISMATCH/);
});
for (const outcome of ['pending', 'unknown']) test(`two connections: late failed preflight preserves ${outcome} merge`, async t => {
  const f = fixture(t); f.enqueue(); const other = secondConnection(t, f); const entered = latch(); const release = latch();
  const slow = new MergePublisher({ ...f.options, ledger: other, client: { ...f.client, async inspect() { assert.equal(other.inTransaction, false); entered.resolve(); await release.promise; return { ...copy(f.observation), contains_current_base: false }; } } });
  const delayed = slow.publish('pub'); await entered.promise;
  if (outcome === 'unknown') f.client.requestMerge = async () => { f.counters.merges++; throw Error('lost'); };
  let current; try { current = await f.publisher.publish('pub'); } finally { release.resolve(); }
  assert.equal(current.status, outcome); assert.deepEqual(await delayed, current);
  assert.deepEqual(f.get('effects', 'pub').value, current); assert.equal(f.claim().status, 'reserved'); assert.equal(f.counters.merges, 1);
  await new MergePublisher({ ...f.options, ledger: other }).publish('pub'); assert.equal(f.counters.merges, 1);
  f.merged(); assert.equal((await f.publisher.reconcile('pub')).status, 'succeeded');
});
test('one durable check send and exact receipt/readback permit publication', async t => {
  const f = fixture(t, { gate: false }); f.enqueue();
  const other = secondConnection(t, f);
  const results = await Promise.allSettled([f.publisher.attest('pub'), new MergePublisher({ ...f.options, ledger: other }).attest('pub')]);
  assert.ok(results.some(result => result.status === 'fulfilled' && result.value.status === 'attested'));
  assert.equal(f.counters.checks, 1); assert.equal(f.get('effects', 'github-check:pub').value.check_id, 200);
  const publications = await Promise.allSettled([f.publisher.publish('pub'), new MergePublisher({ ...f.options, ledger: other }).publish('pub')]);
  assert.ok(publications.some(result => result.status === 'fulfilled')); assert.equal(f.counters.merges, 1);
});
for (const conclusion of ['failure', 'success']) test(`two connections: old shared-subject ${conclusion} cannot resolve a different outstanding POST`, async t => {
  const f = fixture(t); const other = secondConnection(t, f);
  f.enqueue('old'); await f.publisher.publish('old'); f.client.mergeResult = async () => ({ status: 'failed' });
  assert.equal((await f.publisher.reconcile('old')).status, 'failed'); assert.equal(f.claim().status, 'released');
  gate(f, []); f.enqueue('pub');
  assert.equal(publicationCheckId(f.get('effects', 'old').value), publicationCheckId({ binding: f.binding, subject_ref: f.subject_ref, review_refs: f.review_refs }));
  const entered = latch(); const release = latch();
  f.client.createCheckRun = async () => { f.counters.checks++; entered.resolve(); await release.promise; throw Error('lost exact response'); };
  const outstanding = f.publisher.attest('pub'); await entered.promise;
  const admitted = f.get('effects', 'github-check:pub'); assert.equal(admitted.value.check_id, undefined);
  gate(f, [check(f, { id: 100, conclusion })]);
  const successor = new MergePublisher({ ...f.options, ledger: other });
  try {
    assert.equal((await successor.attest('pub')).status, 'unknown');
    assert.equal((await successor.publish('pub')).status, 'unknown');
    assert.equal(f.claim().effect_id, 'pub'); assert.equal(f.claim().status, 'reserved');
    assert.deepEqual(f.get('effects', 'github-check:pub'), admitted);
  } finally { release.resolve(); }
  assert.equal((await outstanding).status, 'unknown');
  assert.equal((await successor.attest('pub')).status, 'unknown');
  assert.equal(f.get('effects', 'github-check:pub').value.closure_evidence, undefined);
  assert.equal(f.claim().status, 'reserved'); assert.equal(f.counters.checks, 1); assert.equal(f.counters.merges, 1);
  assert.notEqual(f.get('effects', 'old').value.request_sha256, f.get('effects', 'pub').value.request_sha256);
});
for (const reply of ['success', 'lost']) test(`unidentified negative check cannot close before a late ${reply} response`, async t => {
  const f = fixture(t, { gate: false }); f.enqueue(); const other = secondConnection(t, f); const entered = latch(); const release = latch();
  f.client.createCheckRun = async request => { f.counters.checks++; entered.resolve(); await release.promise; if (reply === 'lost') throw Error('lost'); return { ...check(f, { conclusion: 'success' }), external_id: request.external_id }; };
  const outstanding = f.publisher.attest('pub'); await entered.promise; gate(f, [check(f)]);
  try { assert.equal((await new MergePublisher({ ...f.options, ledger: other }).attest('pub')).status, 'unknown'); assert.equal(f.claim().status, 'reserved'); }
  finally { release.resolve(); }
  const result = await outstanding;
  assert.equal(result.status, reply === 'success' ? 'failed' : 'unknown');
  assert.equal(f.claim().status, reply === 'success' ? 'released' : 'reserved');
  const value = f.get('effects', 'github-check:pub').value;
  assert.equal(value.check_id, reply === 'success' ? 200 : undefined);
  if (reply === 'success') assert.equal(value.closure_evidence.ownership, 'validated-create-response-remote-id');
  else assert.equal(value.closure_evidence, undefined);
  assert.equal(f.counters.checks, 1); assert.equal(f.counters.merges, 0);
});
for (const conclusion of ['action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'timed_out']) test(`known owned check ${conclusion} closes once with immutable evidence`, async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f); gate(f, [check(f, { conclusion })]);
  const other = secondConnection(t, f); const successor = new MergePublisher({ ...f.options, ledger: other });
  const results = await Promise.allSettled([f.publisher.attest('pub'), successor.attest('pub')]);
  assert.ok(results.some(result => result.status === 'fulfilled' && result.value.status === 'failed'));
  const row = f.get('effects', 'github-check:pub'); const value = row.value;
  assert.equal(value.status, 'failed'); assert.equal(value.closure_sha256, hash(value.closure_evidence));
  assert.equal(value.closure_evidence.request_sha256, value.request_sha256);
  assert.equal(value.closure_evidence.publication_request_sha256, f.get('effects', 'pub').value.request_sha256);
  assert.equal(value.closure_evidence.issuer_sha256, hash(f.issuer)); assert.equal(value.closure_evidence.check.id, 200);
  assert.equal(f.claim().status, 'released'); assert.equal(f.get('tasks', 'github-publication:pub').value.status, 'held');
  gate(f, [check(f, { conclusion: 'success' })]);
  await assert.rejects(successor.publish('pub'), /PUBLICATION_HELD_NEW_CANDIDATE_REQUIRED/);
  assert.deepEqual(f.get('effects', row.id), row); assert.equal(f.counters.checks, 1);
  assert.equal(nestedEvents(f).filter(item => item.type === 'github.check.failed').length, 1);
});
for (const kind of ['absent', 'wrong-id', 'wrong-app', 'wrong-name', 'wrong-head', 'wrong-external', 'duplicate', 'pending', 'no-completion', 'invalid-completion', 'future-completion', 'unsupported', 'transport', '404']) test(`${kind} cannot close a known check or authorize resend`, async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f); let values = [check(f)];
  if (kind === 'absent') values = [];
  if (kind === 'wrong-id') values[0].id = 201;
  if (kind === 'wrong-app') values[0].app_id = 999;
  if (kind === 'wrong-name') values[0].name = 'other';
  if (kind === 'wrong-head') values[0].head_sha = sha('e');
  if (kind === 'wrong-external') values[0].external_id = 'other';
  if (kind === 'duplicate') values.push(check(f, { id: 201 }));
  if (kind === 'pending') { values[0].status = 'in_progress'; values[0].conclusion = null; }
  if (kind === 'no-completion') delete values[0].completed_at;
  if (kind === 'invalid-completion') values[0].completed_at = 'not-a-date';
  if (kind === 'future-completion') values[0].completed_at = '9999-01-01T00:00:00Z';
  if (kind === 'unsupported') values[0].conclusion = 'closed';
  gate(f, values); if (kind === 'transport' || kind === '404') f.client.inspect = async () => { throw Error(kind); };
  for (let i = 0; i < 2; i++) assert.ok(['unknown', 'waiting_check'].includes((await new MergePublisher(f.options).attest('pub')).status));
  assert.equal(f.get('effects', 'github-check:pub').value.closure_evidence, undefined); assert.equal(f.claim().status, 'reserved'); assert.equal(f.counters.checks, 1);
});
for (const status of ['failed', 'closed']) test(`bare ${status} label retains reservation and cannot accept`, async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f); const row = f.get('effects', 'github-check:pub'); f.seed('effects', row.id, { ...row.value, status });
  gate(f, [check(f)]); assert.equal((await f.publisher.attest('pub')).status, 'unknown');
  gate(f, [check(f, { conclusion: 'success' })]); assert.equal((await f.publisher.attest('pub')).status, 'unknown');
  assert.equal(f.claim().status, 'reserved'); assert.equal(f.counters.checks, 1); assert.equal(f.get('effects', row.id).value.status, status);
});
test('unowned negative observation neither invents evidence nor sends', async t => {
  const f = fixture(t, { gate: false }); f.enqueue(); gate(f, [check(f)]);
  assert.equal((await f.publisher.attest('pub')).status, 'unknown'); assert.equal(f.get('effects', 'github-check:pub'), null); assert.equal(f.claim().status, 'reserved'); assert.equal(f.counters.checks, 0);
});
for (const status of ['unknown', 'failed']) test(`another dispatched ${status} effect prevents reservation release`, async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f);
  f.seed('effects', 'other-effect', { kind: 'github-branch-update', resource: 'repo:owner/repo', dispatched: true, status }); gate(f, [check(f)]);
  assert.equal((await f.publisher.attest('pub')).status, 'failed'); assert.equal(f.claim().status, 'reserved'); assert.equal(f.get('effects', 'pub').value.reason, 'CHECK_FAILED_OTHER_EFFECT_UNRESOLVED');
});
for (const kind of ['pause', 'grant', 'review', 'policy']) test(`${kind} during negative inspection prevents terminal disposition`, async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f); gate(f, [check(f)]); const inspect = f.client.inspect;
  f.client.inspect = async () => { const value = await inspect(); revoke(f, kind); return value; };
  assert.equal((await f.publisher.attest('pub')).status, 'waiting_check'); assert.equal(f.get('effects', 'github-check:pub').value.status, 'pending'); assert.equal(f.claim().status, 'reserved');
});
test('late successful observation cannot overwrite terminal evidence after exact identity exists', async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f); const other = secondConnection(t, f); const entered = latch(); const release = latch();
  const positive = copy(f.observation); positive.checks.push(check(f, { conclusion: 'success' }));
  const slow = new MergePublisher({ ...f.options, ledger: other, client: { ...f.client, async inspect() { entered.resolve(); await release.promise; return copy(positive); } } });
  const late = slow.attest('pub'); await entered.promise; gate(f, [check(f)]);
  let terminal; try { assert.equal((await f.publisher.attest('pub')).status, 'failed'); terminal = copy(f.get('effects', 'github-check:pub')); } finally { release.resolve(); }
  await late; assert.deepEqual(f.get('effects', 'github-check:pub'), terminal); assert.equal(f.claim().status, 'released'); assert.equal(f.counters.checks, 1);
});
test('two connections: terminal closure between final read guard and acceptance write prevents success', async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f); const other = secondConnection(t, f);
  const negative = copy(f.observation); negative.checks.push(check(f)); const entered = latch(); const release = latch();
  const closer = new MergePublisher({ ...f.options, ledger: other, client: { ...f.client, async inspect() { assert.equal(other.inTransaction, false); entered.resolve(); await release.promise; return copy(negative); } } });
  // Start before merge admission so this is a genuine in-flight attestation,
  // with the remote ID established by the earlier validated creation response.
  const closing = closer.attest('pub'); await entered.promise;
  gate(f, [check(f, { conclusion: 'success' })]);
  assert.equal((await f.publisher.publish('pub')).status, 'pending'); f.merged();
  const parent = copy(f.get('effects', 'pub')); const task = copy(f.get('tasks', 'github-publication:pub')); const claimBefore = copy(f.claim());
  let intercepted = false;
  const boundary = {
    read: fn => f.ledger.read(fn),
    write(type, principal, fn) {
      if (type !== 'github.publication.accepted') return f.ledger.write(type, principal, fn);
      intercepted = true; assert.equal(f.ledger.inTransaction, false); assert.equal(other.inTransaction, false);
      assert.equal(f.get('effects', 'github-check:pub').value.status, 'succeeded');
      // The final guard has returned. No transaction is open. Allow a real
      // second-connection producer to commit closure before BEGIN IMMEDIATE.
      release.resolve();
      return closing.then(result => {
        assert.equal(result.status, 'failed');
        assert.deepEqual(f.get('effects', 'pub'), parent); assert.deepEqual(f.get('tasks', 'github-publication:pub'), task); assert.deepEqual(f.claim(), claimBefore);
        return f.ledger.write(type, principal, fn);
      });
    },
  };
  let result;
  try { result = await new MergePublisher({ ...f.options, ledger: boundary }).reconcile('pub'); }
  finally { release.resolve(); await closing; }
  assert.equal(intercepted, true); assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'CHECK_TERMINALLY_CLOSED'); assert.equal(result.merged_observed, true);
  assert.equal(f.get('effects', 'github-check:pub').value.status, 'failed'); assert.equal(f.claim().status, 'reserved');
  assert.deepEqual(f.get('tasks', 'github-publication:pub'), task); assert.equal(result.receipt, undefined);
  assert.equal(nestedEvents(f).filter(item => item.type === 'github.publication.accepted').length, 0);
  await new MergePublisher({ ...f.options, ledger: other }).publish('pub'); assert.equal(f.counters.merges, 1); assert.equal(f.counters.checks, 1); assert.equal(f.claim().status, 'reserved');
});
test('atomic acceptance also validates the exact local request and final remote check ID', async t => {
  for (const kind of ['request', 'remote-id']) {
    const f = fixture(t, { gate: false }); await pendingCheck(f); gate(f, [check(f, { conclusion: 'success' })]); await f.publisher.publish('pub'); f.merged();
    if (kind === 'remote-id') gate(f, [check(f, { id: 201, conclusion: 'success' })]);
    else { const row = f.get('effects', 'github-check:pub'); f.seed('effects', row.id, { ...row.value, publication_id: 'other' }); }
    const result = await f.publisher.reconcile('pub'); assert.equal(result.status, 'unknown'); assert.equal(f.claim().status, 'reserved'); assert.notEqual(f.get('tasks', 'github-publication:pub').value.status, 'completed');
  }
});
test('pause after a valid creation response prevents readback acceptance without resending', async t => {
  const f = fixture(t, { gate: false }); f.enqueue(); const create = f.client.createCheckRun;
  f.client.createCheckRun = async request => { const reply = await create(request); revoke(f, 'pause'); return reply; };
  await assert.rejects(f.publisher.attest('pub'), /PUBLICATION_PAUSED_OR_NOT_ADOPTED/);
  assert.equal(f.get('effects', 'github-check:pub').value.status, 'pending'); assert.equal(f.claim().status, 'reserved'); assert.equal(f.counters.checks, 1);
});
test('branch updates are durable, never blindly resent, and require a new subject', async t => {
  const f = fixture(t); const input = { id: 'update', ...f.binding, grant_id: 'grant', task_id: 'source-task' };
  assert.equal((await f.publisher.requestBranchUpdate(input)).status, 'pending'); await f.publisher.requestBranchUpdate(input); assert.equal(f.counters.updates, 1);
  f.observation.head_sha = sha('e'); f.observation.head_parents = [f.binding.head_sha, f.binding.base_sha];
  assert.equal((await f.publisher.reconcileBranchUpdate('update')).status, 'succeeded'); assert.equal(f.claim().status, 'released');
  await assert.rejects(f.publisher.requestBranchUpdate({ ...input, head_sha: sha('e') }), /EFFECT_ID_PAYLOAD_MISMATCH/);
  const g = fixture(t); const publisher = new MergePublisher({ ...g.options, updateBranch: async () => { g.counters.updates++; throw Error('lost'); } });
  assert.equal((await publisher.requestBranchUpdate(input)).status, 'unknown'); await publisher.requestBranchUpdate(input); assert.equal(g.counters.updates, 1);
  g.observation.head_sha = sha('e'); g.observation.head_parents = [g.binding.head_sha, g.binding.base_sha]; g.decline();
  assert.equal((await publisher.reconcileBranchUpdate('update')).status, 'unknown'); assert.equal(g.claim().status, 'reserved');
});
test('strict canonical hashes reject lossy shapes without invoking accessors', () => {
  assert.equal(hash({ b: 2, a: 1 }), hash({ a: 1, b: 2 }));
  const cyclic = {}; cyclic.self = cyclic; let invoked = false;
  const accessor = Object.defineProperty({}, 'a', { enumerable: true, get() { invoked = true; return 1; } });
  for (const value of [undefined, NaN, Infinity, -0, 1n, () => {}, { a: undefined }, [, 1], new Date(), new Map(), Object.create({ a: 1 }), cyclic, accessor, Object.defineProperty({}, 'a', { value: 1 }), { [Symbol('x')]: 1 }]) assert.throws(() => hash(value), /INVALID_JSON_VALUE/);
  assert.equal(invoked, false);
});
const mergeInput = { owner: 'Owner', repo: 'Repo', number: 1, head_sha: sha('a') };
function rest({ status = 202, data = { status: 'pending', details: { uuid: 'uuid-1' } }, fetch } = {}) {
  const calls = []; const client = new GitHubClient({ token: 'installation-token-do-not-return', fetch: fetch ?? (async (url, options) => { calls.push({ url, options }); return { status, json: async () => data }; }) }); return { client, calls };
}
test('REST pins exact merge options, safe headers, and distinguishes queue/409/expiry', async () => {
  const f = rest(); assert.deepEqual(await f.client.requestMerge(mergeInput), { status: 'pending', uuid: 'uuid-1' });
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { sha: sha('a'), merge_method: 'merge', merge_action: 'direct_merge', bypass_rules: false });
  assert.equal(f.calls[0].options.redirect, 'error'); assert.equal(f.calls[0].options.headers['X-GitHub-Api-Version'], '2026-03-10'); assert.equal(JSON.stringify(f.client), '{}');
  assert.deepEqual(await rest({ status: 200, data: { status: 'enqueued', details: {} } }).client.requestMerge(mergeInput), { status: 'enqueued' });
  const details = { uuid: 'uuid-1', expected_head_sha: sha('a'), merge_method: 'merge', merge_action: 'direct_merge', bypass_rules: false };
  assert.equal((await rest({ status: 409, data: { status: 'pending', details } }).client.requestMerge(mergeInput)).status, 'pending');
  for (const patch of [{ expected_head_sha: sha('b') }, { merge_method: 'squash' }, { merge_action: 'enqueue' }, { bypass_rules: true }]) await assert.rejects(rest({ status: 409, data: { status: 'pending', details: { ...details, ...patch } } }).client.requestMerge(mergeInput), /GITHUB_EXISTING_REQUEST_MISMATCH/);
  const client = new GitHubClient({ token: 'secret', fetch: async () => ({ status: 404, json: async () => { throw Error('do not read'); } }) });
  assert.deepEqual(await client.mergeResult({ ...mergeInput, uuid: 'uuid-1' }), { status: 'expired' });
});
test('REST redacts reflected credentials and foreign failures', async () => {
  const secret = 'installation-token-do-not-return';
  for (const [options, expected] of [
    [{ status: 403, data: { message: secret } }, 'GITHUB_HTTP_403'],
    [{ fetch: async () => { throw Error(secret); } }, 'GITHUB_TRANSPORT_UNKNOWN'],
    [{ fetch: async () => ({ status: 202, json: async () => { throw Error(secret); } }) }, 'GITHUB_INVALID_RESPONSE'],
    [{ data: { status: 'pending', details: { uuid: secret } } }, 'GITHUB_INVALID_RESPONSE'],
    [{ fetch: async () => Object.defineProperty({}, 'status', { get() { throw Error(secret); } }) }, 'GITHUB_INVALID_RESPONSE'],
  ]) await assert.rejects(rest(options).client.requestMerge(mergeInput), error => error.message === expected && !JSON.stringify(error).includes(secret));
  assert.throws(() => new GitHubClient({ token: secret, apiBase: `https://${secret}@example.test` }), /INVALID_API_BASE/);
});
test('REST check creation binds head/name/external ID and reads App identity', async () => {
  let request; const client = new GitHubClient({ token: 'fictional-token', fetch: async (url, options) => { request = JSON.parse(options.body); return { status: 201, json: async () => ({ ...request, id: 5, app: { id: 42 } }) }; } });
  const value = await client.createCheckRun({ owner: 'owner', repo: 'repo', name: 'gate', head_sha: sha('a'), external_id: 'binding' });
  assert.equal(request.status, 'completed'); assert.equal(request.conclusion, 'success'); assert.equal(value.app_id, 42); assert.equal(value.external_id, 'binding');
});
test('REST merge readback verifies tree, both parents and reachability', async () => {
  const calls = []; const client = new GitHubClient({ token: 'fictional-token', fetch: async url => {
    calls.push(url); let data;
    if (url.endsWith('/pulls/1')) data = { state: 'closed', merged: true, merge_commit_sha: sha('d'), user: { id: 10 }, head: { sha: sha('a'), repo: { full_name: 'owner/repo' } }, base: { ref: 'main', repo: { full_name: 'owner/repo' } } };
    else if (url.endsWith('/git/ref/heads/main')) data = { object: { sha: sha('e') } };
    else if (url.endsWith(`/git/commits/${sha('a')}`)) data = { tree: { sha: sha('c') }, parents: [{ sha: sha('b') }] };
    else if (url.endsWith(`/git/commits/${sha('d')}`)) data = { tree: { sha: sha('c') }, parents: [{ sha: sha('b') }, { sha: sha('a') }] };
    else if (url.endsWith(`/compare/${sha('d')}...${sha('e')}`)) data = { status: 'ahead', merge_base_commit: { sha: sha('d') } };
    else throw Error('unexpected fictional route'); return { status: 200, json: async () => data };
  } });
  const value = await client.observe({ owner: 'owner', repo: 'repo', number: 1 }); assert.equal(value.merged_tree_sha, sha('c')); assert.deepEqual(value.merge_parents, [sha('b'), sha('a')]); assert.equal(value.merged_commit_reachable, true); assert.equal(calls.length, 5);
});
test('REST inspection retains terminal evidence and actual SQLite disposition requires the known response ID', async t => {
  const f = fixture(t, { gate: false }); await pendingCheck(f); const negative = check(f);
  const client = new GitHubClient({ token: 'fictional-installation-token', fetch: async url => {
    assert.equal(f.ledger.inTransaction, false); let data;
    if (url.endsWith('/pulls/1')) data = { state: 'open', draft: false, merged: false, user: { id: 10 }, head: { sha: f.binding.head_sha, repo: { full_name: 'owner/repo' } }, base: { ref: 'main', repo: { full_name: 'owner/repo' } } };
    else if (url.endsWith('/git/ref/heads/main')) data = { object: { sha: f.binding.base_sha } };
    else if (url.endsWith(`/git/commits/${f.binding.head_sha}`)) data = { tree: { sha: f.binding.tree_sha }, parents: [{ sha: f.binding.base_sha }] };
    else if (url.endsWith('/repos/owner/repo')) data = { full_name: 'owner/repo', owner: { type: 'User' }, allow_merge_commit: true };
    else if (url.endsWith('/branches/main/protection')) data = { required_status_checks: { strict: true, checks: [{ context: f.issuer.check_name, app_id: 42 }] }, enforce_admins: { enabled: true } };
    else if (url.includes('/compare/')) data = { status: 'ahead', merge_base_commit: { sha: f.binding.base_sha } };
    else if (url.includes('/check-runs?')) data = { check_runs: [negative, ...f.observation.checks].map(item => ({ ...item, app: { id: item.app_id } })) };
    else if (url.includes('/reviews?')) data = [];
    else throw Error('unexpected fictional route'); return { status: 200, json: async () => copy(data) };
  } });
  assert.deepEqual((await client.inspect(f.binding, f.issuer.check_name)).checks.find(item => item.id === 200), negative);
  assert.equal((await new MergePublisher({ ...f.options, client }).attest('pub')).status, 'failed');
  assert.equal(f.get('effects', 'github-check:pub').value.closure_evidence.check.completed_at, negative.completed_at); assert.equal(f.claim().status, 'released'); assert.equal(f.counters.checks, 1);
});
