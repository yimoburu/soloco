// Original host draft retained in lineage; independently revised P4 component candidate.
import { createHash } from 'node:crypto';
import { canonical as strictCanonical } from './ledger.mjs';

const API_VERSION = '2026-03-10';
const TERMINAL_CLAIMS = new Set(['released', 'completed', 'closed', 'cancelled', 'failed']);
const internalErrors = new WeakSet();
function fail(code) { const error = new Error(code); error.code = code; internalErrors.add(error); throw error; }
function need(value, code) { if (!value) fail(code); }
function reason(error, fallback) { return internalErrors.has(error) ? error.code : fallback; }
function canonical(value) { try { return strictCanonical(value); } catch { fail('INVALID_JSON_VALUE'); } }
function clone(value) { return JSON.parse(canonical(value)); }
export function publicationDigest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function oid(value) { need(typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value), 'INVALID_OID'); return value; }
function digest(value) { need(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'INVALID_DIGEST'); return value; }
function identifier(value) { need(typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value), 'INVALID_ID'); return value; }
function positive(value) { need(Number.isSafeInteger(value) && value > 0, 'INVALID_NUMBER'); return value; }
function slug(value) { need(typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/.test(value) && !['.', '..'].includes(value), 'INVALID_REPOSITORY'); return value.toLowerCase(); }
function target(value) { return { owner: slug(value.owner), repo: slug(value.repo), number: positive(value.number) }; }
function pathFor(value) { return `/repos/${slug(value.owner)}/${slug(value.repo)}`; }
function refPath(branch) {
  need(typeof branch === 'string' && branch.length > 0 && !/[\x00-\x20~^:?*\[\\]/.test(branch) && !branch.includes('..') && !branch.includes('@{') && !branch.startsWith('/') && !branch.endsWith('/') && !branch.endsWith('.') && !branch.split('/').some(p => !p || p.startsWith('.') || p.endsWith('.lock')), 'INVALID_BRANCH');
  return branch.split('/').map(encodeURIComponent).join('/');
}
function reviewSnapshot(input) {
  const review = clone(input);
  const value = {
    id: positive(review.id), user_id: positive(review.user_id ?? review.user?.id),
    login: identifier(review.login ?? review.user?.login), commit_id: oid(review.commit_id),
    state: identifier(review.state), body_sha256: publicationDigest(review.body ?? ''),
    submitted_at: review.submitted_at ?? '',
  };
  need(typeof value.submitted_at === 'string' && typeof (review.body ?? '') === 'string', 'INVALID_REVIEW');
  return { ...value, sha256: publicationDigest(value) };
}

/** Trusted internal adapter, NOT an authenticated public API.
 * Token provider, fetch, API base and issuer configuration must be protected by P8.
 * No candidate code, CI code or model-selected configuration executes here.
 * No physical credential isolation is established by this module.
 */
export class GitHubClient {
  #token; #fetch; #base; #version;
  constructor({ token, fetch = globalThis.fetch, apiBase = 'https://api.github.com', apiVersion = API_VERSION } = {}) {
    need((typeof token === 'string' && token.length > 0) || typeof token === 'function', 'GITHUB_TOKEN_REQUIRED');
    need(typeof fetch === 'function', 'FETCH_REQUIRED');
    let base;
    try { base = new URL(apiBase); } catch { fail('INVALID_API_BASE'); }
    need(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash, 'INVALID_API_BASE');
    need(typeof apiVersion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(apiVersion), 'INVALID_API_VERSION');
    this.#token = token; this.#fetch = fetch; this.#base = base.toString().replace(/\/$/, ''); this.#version = apiVersion;
  }
  static reviewSnapshot(value) { return reviewSnapshot(value); }
  async #request(path, { method = 'GET', body, statuses = [200] } = {}) {
    let token; let response;
    try {
      token = typeof this.#token === 'function' ? await this.#token() : this.#token;
      need(typeof token === 'string' && token.length > 0, 'GITHUB_TOKEN_REQUIRED');
      response = await this.#fetch(`${this.#base}${path}`, {
        method, redirect: 'error', headers: {
          Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': this.#version,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        }, ...(body === undefined ? {} : { body: canonical(body) }),
      });
    } catch { fail('GITHUB_TRANSPORT_UNKNOWN'); }
    let status;
    try { status = response.status; } catch { fail('GITHUB_INVALID_RESPONSE'); }
    need(Number.isInteger(status) && status >= 100 && status <= 599, 'GITHUB_INVALID_RESPONSE');
    // Never read response bodies for HTTP failures; never propagate foreign errors.
    need(statuses.includes(status), `GITHUB_HTTP_${status}`);
    if (status === 404) return { status, data: null };
    let data;
    try {
      data = clone(await response.json());
      // Reflected credentials must not escape even through otherwise valid fields.
      need(!canonical(data).includes(token), 'GITHUB_INVALID_RESPONSE');
    } catch { fail('GITHUB_INVALID_RESPONSE'); }
    need(data !== null && typeof data === 'object', 'GITHUB_INVALID_RESPONSE');
    return { status, data };
  }
  async #pages(path, key) {
    const values = [];
    for (let page = 1; page <= 10; page++) {
      const { data } = await this.#request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const items = key ? data[key] : data;
      need(Array.isArray(items), 'GITHUB_INVALID_RESPONSE'); values.push(...items);
      if (items.length < 100) return values;
    }
    fail('GITHUB_OBSERVATION_TOO_LARGE');
  }
  async observe(value) {
    const t = target(value); const path = pathFor(t);
    const { data: pr } = await this.#request(`${path}/pulls/${t.number}`);
    const branch = pr.base?.ref; refPath(branch);
    const { data: base } = await this.#request(`${path}/git/ref/heads/${refPath(branch)}`);
    need(typeof pr.head?.repo?.full_name === 'string' && typeof pr.base?.repo?.full_name === 'string', 'GITHUB_INVALID_RESPONSE');
    const result = {
      ...t, state: pr.state, draft: pr.draft === true, merged: pr.merged === true,
      author_id: positive(pr.user?.id), head_sha: oid(pr.head?.sha),
      head_repository: pr.head.repo.full_name.toLowerCase(), base_sha: oid(base.object?.sha),
      base_branch: branch, base_repository: pr.base.repo.full_name.toLowerCase(),
      merge_commit_sha: pr.merged === true ? oid(pr.merge_commit_sha) : null,
    };
    const { data: head } = await this.#request(`${path}/git/commits/${result.head_sha}`);
    result.tree_sha = oid(head.tree?.sha);
    need(Array.isArray(head.parents), 'GITHUB_INVALID_RESPONSE');
    result.head_parents = head.parents.map(parent => oid(parent.sha));
    if (result.merged) {
      const { data: merge } = await this.#request(`${path}/git/commits/${result.merge_commit_sha}`);
      const { data: ancestry } = await this.#request(`${path}/compare/${result.merge_commit_sha}...${result.base_sha}`);
      result.merged_tree_sha = oid(merge.tree?.sha);
      need(Array.isArray(merge.parents), 'GITHUB_INVALID_RESPONSE');
      result.merge_parents = merge.parents.map(parent => oid(parent.sha));
      result.merged_commit_reachable = ['ahead', 'identical'].includes(ancestry.status) && ancestry.merge_base_commit?.sha === result.merge_commit_sha;
    }
    return result;
  }
  async inspect(value, checkName) {
    identifier(checkName);
    const observation = await this.observe(value); const path = pathFor(value);
    const [repoReply, protectionReply, ancestryReply, checks, rawReviews] = await Promise.all([
      this.#request(path), this.#request(`${path}/branches/${encodeURIComponent(observation.base_branch)}/protection`),
      this.#request(`${path}/compare/${observation.base_sha}...${observation.head_sha}`),
      this.#pages(`${path}/commits/${observation.head_sha}/check-runs?filter=latest`, 'check_runs'),
      this.#pages(`${path}/pulls/${positive(value.number)}/reviews`),
    ]);
    const repo = repoReply.data; const protection = protectionReply.data; const ancestry = ancestryReply.data;
    const reviews = rawReviews.filter(review => review.state !== 'PENDING').map(reviewSnapshot);
    const permissions = Object.create(null);
    for (const review of reviews) {
      if (!Object.hasOwn(permissions, review.login)) {
        const { data } = await this.#request(`${path}/collaborators/${encodeURIComponent(review.login)}/permission`);
        permissions[review.login] = ['admin', 'maintain', 'write'].includes(data.permission);
      }
    }
    need(typeof repo.full_name === 'string', 'GITHUB_INVALID_RESPONSE');
    return {
      ...observation, allow_merge_commit: repo.allow_merge_commit === true,
      repository_owner_type: repo.owner?.type, repository_name: repo.full_name.toLowerCase(),
      protection: {
        strict: protection.required_status_checks?.strict === true,
        checks: (protection.required_status_checks?.checks ?? []).map(check => ({ context: check.context, app_id: check.app_id })),
        enforce_admins: protection.enforce_admins?.enabled === true,
        force_pushes: protection.allow_force_pushes?.enabled === true,
        linear_history: protection.required_linear_history?.enabled === true,
        locked: protection.lock_branch?.enabled === true,
        required_native_approvals: protection.required_pull_request_reviews?.required_approving_review_count ?? 0,
        review_bypass: Object.values(protection.required_pull_request_reviews?.bypass_pull_request_allowances ?? {}).some(list => Array.isArray(list) && list.length > 0),
      },
      contains_current_base: ['ahead', 'identical'].includes(ancestry.status) && ancestry.merge_base_commit?.sha === observation.base_sha,
      checks: checks.map(check => ({ id: check.id, name: check.name, app_id: check.app?.id, head_sha: check.head_sha, status: check.status, conclusion: check.conclusion, external_id: check.external_id ?? '', completed_at: check.completed_at ?? null })),
      reviews, review_permissions: permissions,
    };
  }
  async updateBranch(value) {
    const { status } = await this.#request(`${pathFor(value)}/pulls/${positive(value.number)}/update-branch`, {
      method: 'PUT', body: { expected_head_sha: oid(value.head_sha) }, statuses: [202],
    });
    return { status: 'accepted', http_status: status };
  }
  async createCheckRun(value) {
    const { data } = await this.#request(`${pathFor(value)}/check-runs`, {
      method: 'POST', statuses: [201], body: {
        name: identifier(value.name), head_sha: oid(value.head_sha), external_id: identifier(value.external_id),
        status: 'completed', conclusion: 'success',
        output: { title: 'SoloCo exact-subject publication gate', summary: 'Canonical independent review and operator-pinned CI evidence verified.' },
      },
    });
    return { id: positive(data.id), name: identifier(data.name), head_sha: oid(data.head_sha), status: data.status, conclusion: data.conclusion, external_id: identifier(data.external_id), app_id: positive(data.app?.id) };
  }
  async requestMerge(value) {
    const { status, data } = await this.#request(`${pathFor(value)}/pulls/${positive(value.number)}/merge-async`, {
      method: 'PUT', body: { sha: oid(value.head_sha), merge_method: 'merge', merge_action: 'direct_merge', bypass_rules: false }, statuses: [200, 202, 409],
    });
    if (status === 200 && data.status === 'merged') return { status: 'merged', merge_commit_sha: oid(data.details?.sha) };
    const details = data.details ?? data;
    if (status === 409) need(details.expected_head_sha === value.head_sha && details.merge_method === 'merge' && details.merge_action === 'direct_merge' && details.bypass_rules === false, 'GITHUB_EXISTING_REQUEST_MISMATCH');
    need(['pending', 'enqueued'].includes(data.status), 'GITHUB_INVALID_MERGE_RECEIPT');
    if (data.status === 'enqueued' && details.uuid === undefined) return { status: 'enqueued' };
    need(typeof details.uuid === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(details.uuid), 'GITHUB_INVALID_MERGE_RECEIPT');
    return { status: data.status, uuid: details.uuid };
  }
  async mergeResult(value) {
    need(typeof value.uuid === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value.uuid), 'INVALID_MERGE_UUID');
    const { status, data } = await this.#request(`${pathFor(value)}/pulls/${positive(value.number)}/merge-async/${encodeURIComponent(value.uuid)}`, { statuses: [200, 404] });
    if (status === 404) return { status: 'expired' };
    need(['pending', 'merged', 'failed', 'enqueued'].includes(data.status), 'GITHUB_INVALID_MERGE_RECEIPT');
    return { status: data.status, ...(data.status === 'merged' ? { merge_commit_sha: oid(data.details?.sha) } : {}) };
  }
}

function rows(tx, family, filter = {}) {
  const items = []; let cursor;
  for (let i = 0; i < 10; i++) {
    const page = tx.list(family, { ...filter, limit: 100, ...(cursor ? { cursor } : {}) });
    need(Array.isArray(page.items), 'INVALID_LEDGER_PAGE'); items.push(...page.items);
    if (page.complete) return items;
    need(page.next_cursor && page.next_cursor !== cursor, 'INCOMPLETE_LEDGER_PAGE'); cursor = page.next_cursor;
  }
  fail('PUBLICATION_QUEUE_TOO_LARGE');
}
function exactRow(tx, ref) {
  need(ref && typeof ref.family === 'string', 'SUBJECT_REFERENCE_REQUIRED');
  const row = tx.get(ref.family, identifier(ref.id));
  need(row && row.revision === ref.revision && row.sha256 === ref.sha256, 'STALE_CANONICAL_SUBJECT'); return row;
}
function normalizeBinding(input) {
  const value = clone(input); const t = target(value);
  const binding = {
    ...t, head_sha: oid(value.head_sha), base_sha: oid(value.base_sha), tree_sha: oid(value.tree_sha),
    base_branch: value.base_branch, merge_method: value.merge_method,
    scope_sha256: digest(value.scope_sha256), harness_sha256: digest(value.harness_sha256), policy_sha256: digest(value.policy_sha256),
    author_principal_id: identifier(value.author_principal_id), expected_app_id: positive(value.expected_app_id), check_name: identifier(value.check_name),
    required_native_approvals: value.required_native_approvals ?? 0, native_reviews: value.native_reviews ?? [],
  };
  refPath(binding.base_branch); need(binding.merge_method === 'merge', 'MERGE_METHOD_NOT_SUPPORTED');
  need(Number.isSafeInteger(binding.required_native_approvals) && binding.required_native_approvals >= 0 && Array.isArray(binding.native_reviews), 'INVALID_NATIVE_REVIEW_POLICY');
  const ids = new Set();
  for (const review of binding.native_reviews) { positive(review.id); digest(review.sha256); need(!ids.has(review.id), 'DUPLICATE_NATIVE_REVIEW'); ids.add(review.id); }
  return binding;
}
function validateCanonicalReviews(tx, value, binding) {
  const subject = exactRow(tx, value.subject_ref);
  need(value.subject_ref.family === 'proposals' && publicationDigest(normalizeBinding(subject.value.github_publication)) === publicationDigest(binding), 'SUBJECT_BINDING_MISMATCH');
  need(Array.isArray(value.review_refs) && value.review_refs.length > 0, 'INDEPENDENT_REVIEW_REQUIRED');
  const principals = new Set([binding.author_principal_id, value.principal_id]); const seen = new Set();
  for (const ref of value.review_refs) {
    need(ref.family === 'reviews', 'INVALID_REVIEW_REFERENCE'); const review = exactRow(tx, ref).value;
    need(review.status === 'accepted' && review.verdict === 'Pass' && review.termination_confirmed === true && review.proof?.protocol === 'peer-native-review-v1' && Array.isArray(review.proof.blockers) && review.proof.blockers.length === 0, 'UNQUALIFIED_CANONICAL_REVIEW');
    need(canonical(review.subject) === canonical(value.subject_ref), 'REVIEW_SUBJECT_MISMATCH');
    need(review.author_principal_id === binding.author_principal_id && typeof review.reviewer_principal_id === 'string' && review.reviewer_principal_id !== binding.author_principal_id && !seen.has(review.reviewer_principal_id), 'REVIEWER_NOT_INDEPENDENT');
    identifier(review.native_id); digest(review.context_sha256); digest(review.output_sha256);
    const recorder = tx.get('principals', review.recorded_by); const principal = tx.get('principals', review.reviewer_principal_id); const author = tx.get('principals', binding.author_principal_id);
    need(recorder?.value.kind === 'scheduler' && recorder.value.status === 'active', 'REVIEW_TRUSTED_RECORDER_REQUIRED');
    need(principal?.value.status === 'active' && author?.value.status === 'active', 'REVIEWER_NOT_ELIGIBLE');
    need(!(principal.value.native_id && principal.value.native_id === author.value.native_id), 'REVIEWER_NOT_INDEPENDENT');
    seen.add(review.reviewer_principal_id); principals.add(review.recorded_by); principals.add(review.reviewer_principal_id);
  }
  return [...principals].sort().map(id => {
    const row = tx.get('principals', identifier(id)); need(row?.value.status === 'active', 'PRINCIPAL_NOT_ACTIVE'); return row;
  });
}
export function publicationCheckId({ binding, subject_ref, review_refs }) {
  canonical({ binding, subject_ref, review_refs });
  return `soloco-peer-v1:${publicationDigest({ binding: normalizeBinding(binding), subject_ref, review_refs })}`;
}
export function trustedCICheckId({ binding, name }) {
  return `soloco-ci-v1:${publicationDigest({ head_sha: oid(binding.head_sha), tree_sha: oid(binding.tree_sha), harness_sha256: digest(binding.harness_sha256), policy_sha256: digest(binding.policy_sha256), name: identifier(name) })}`;
}
function normalizeIssuer(input) {
  const issuer = clone(input);
  need(issuer && Array.isArray(issuer.required_checks) && issuer.required_checks.length > 0, 'OPERATOR_TRUSTED_CI_REQUIRED');
  const result = { app_id: positive(issuer.app_id), check_name: identifier(issuer.check_name), harness_sha256: digest(issuer.harness_sha256), policy_sha256: digest(issuer.policy_sha256), required_checks: issuer.required_checks.map(check => ({ name: identifier(check.name), app_id: positive(check.app_id) })) };
  need(new Set([result.check_name, ...result.required_checks.map(check => check.name)]).size === result.required_checks.length + 1, 'UNIQUE_CHECK_NAMES_REQUIRED'); return result;
}
function matchIssuer(binding, issuer) {
  need(binding.expected_app_id === issuer.app_id && binding.check_name === issuer.check_name && binding.harness_sha256 === issuer.harness_sha256 && binding.policy_sha256 === issuer.policy_sha256, 'OPERATOR_POLICY_MISMATCH');
}
function validatePolicy(binding, observation, issuer, checkId, gate = true) {
  matchIssuer(binding, issuer); const repository = `${binding.owner}/${binding.repo}`;
  need(observation.owner === binding.owner && observation.repo === binding.repo && observation.number === binding.number && observation.repository_owner_type === 'User' && observation.repository_name === repository, 'PERSONAL_REPOSITORY_REQUIRED');
  need(observation.head_repository === repository && observation.base_repository === repository, 'SAME_REPOSITORY_HEAD_REQUIRED');
  need(observation.head_sha === binding.head_sha && observation.tree_sha === binding.tree_sha && observation.base_branch === binding.base_branch, 'SOURCE_CHANGED_REVALIDATE');
  const p = observation.protection;
  need(p && p.strict === true && p.enforce_admins === true && p.force_pushes === false && p.review_bypass === false && p.locked === false, 'INCOMPATIBLE_BRANCH_PROTECTION');
  need(observation.allow_merge_commit === true && p.linear_history === false, 'INCOMPATIBLE_MERGE_METHOD');
  need(Array.isArray(p.checks) && Array.isArray(observation.checks) && Array.isArray(observation.reviews) && observation.review_permissions && typeof observation.review_permissions === 'object', 'INVALID_INSPECTION');
  const required = p.checks.filter(check => check.context === binding.check_name);
  need(required.length === 1 && required[0].app_id === binding.expected_app_id, 'EXPECTED_APP_NOT_REQUIRED');
  const checks = observation.checks.filter(check => check.name === binding.check_name);
  need(!checks.some(check => check.app_id !== binding.expected_app_id), 'TRUSTED_CHECK_WRONG_APP');
  if (gate) need(checks.length === 1 && checks[0].app_id === binding.expected_app_id && checks[0].head_sha === binding.head_sha && checks[0].status === 'completed' && checks[0].conclusion === 'success' && checks[0].external_id === checkId, 'TRUSTED_CHECK_NOT_SUCCESSFUL');
  for (const requiredCheck of issuer.required_checks) {
    const ci = observation.checks.filter(check => check.name === requiredCheck.name);
    need(ci.length === 1 && ci[0].app_id === requiredCheck.app_id && ci[0].head_sha === binding.head_sha && ci[0].status === 'completed' && ci[0].conclusion === 'success' && ci[0].external_id === trustedCICheckId({ binding, name: requiredCheck.name }), 'TRUSTED_CI_NOT_SUCCESSFUL');
  }
  need(Number.isSafeInteger(p.required_native_approvals) && p.required_native_approvals >= 0, 'INVALID_NATIVE_REVIEW_POLICY');
  const latest = new Map(); const reviewIds = new Set();
  for (const review of observation.reviews) {
    positive(review.id); positive(review.user_id);
    need(!reviewIds.has(review.id), 'INVALID_INSPECTION'); reviewIds.add(review.id);
    need(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'COMMENTED', 'PENDING'].includes(review.state), 'INVALID_NATIVE_REVIEW_STATE');
    if (review.state === 'COMMENTED' || review.state === 'PENDING') continue;
    const prior = latest.get(review.user_id);
    if (!prior || review.id > prior.id) latest.set(review.user_id, review);
  }
  need(![...latest.values()].some(review => review.state === 'CHANGES_REQUESTED' && observation.review_permissions[review.login] === true), 'NATIVE_CHANGES_REQUESTED');
  const eligible = new Set();
  for (const snapshot of binding.native_reviews) {
    const matches = observation.reviews.filter(item => item.id === snapshot.id); const review = matches[0];
    need(matches.length === 1 && review.sha256 === snapshot.sha256 && review.sha256 === publicationDigest(Object.fromEntries(Object.entries(review).filter(([key]) => key !== 'sha256'))) && review.commit_id === binding.head_sha && review.state === 'APPROVED' && latest.get(review.user_id)?.id === review.id && review.user_id !== observation.author_id && observation.review_permissions[review.login] === true, 'NATIVE_REVIEW_NOT_ELIGIBLE');
    eligible.add(review.user_id);
  }
  need(eligible.size >= Math.max(binding.required_native_approvals, p.required_native_approvals), 'NATIVE_REVIEW_REQUIRED');
}
function validateOpen(binding, observation, issuer, checkId, gate = true) {
  validatePolicy(binding, observation, issuer, checkId, gate);
  need(observation.state === 'open' && observation.draft === false && observation.merged === false, 'PR_NOT_OPEN');
  need(observation.base_sha === binding.base_sha, 'SOURCE_CHANGED_REVALIDATE');
  need(observation.contains_current_base === true, 'BRANCH_UPDATE_REQUIRED');
}
function mergedExactly(binding, observation, expectedCommit) {
  return observation.merged === true && observation.state === 'closed' && observation.head_sha === binding.head_sha && observation.tree_sha === binding.tree_sha && observation.merged_tree_sha === binding.tree_sha && observation.merged_commit_reachable === true && observation.merge_parents?.length === 2 && observation.merge_parents[0] === binding.base_sha && observation.merge_parents[1] === binding.head_sha && typeof observation.merge_commit_sha === 'string' && (!expectedCommit || expectedCommit === observation.merge_commit_sha);
}

/** P4 trusted internal state machine; P2/P8 must authenticate the caller and bind
 * principal/grant/task/context before exposing it. authorize and resourceOverlap
 * are protected synchronous policy functions, not model-supplied tool arguments.
 * authorize gets a read-only transaction view and must perform no external I/O.
 * Ledger principal strings supply attribution only. No candidate code executes.
 * Lists precede writes. No transaction spans await. Admission is the local
 * linearization point: later revocation cannot unsend an already admitted request.
 * GitHub supplies head CAS only; changed merged base/tree is a retained violation.
 */
export class MergePublisher {
  #ledger; #client; #principal; #authorize; #update; #overlap; #clock; #issuer;
  constructor({ ledger, client, principal, authorize, updateBranch, resourceOverlap, issuer, clock = () => new Date().toISOString() } = {}) {
    need(ledger && typeof ledger.read === 'function' && typeof ledger.write === 'function', 'LEDGER_REQUIRED');
    need(client && ['inspect', 'observe', 'requestMerge', 'mergeResult', 'createCheckRun'].every(key => typeof client[key] === 'function'), 'GITHUB_CLIENT_REQUIRED');
    need(typeof authorize === 'function' && typeof resourceOverlap === 'function' && typeof clock === 'function', 'AUTHORIZATION_AND_RESOURCE_POLICY_REQUIRED');
    this.#ledger = ledger; this.#client = client; this.#principal = identifier(principal); this.#authorize = authorize; this.#update = updateBranch; this.#overlap = resourceOverlap; this.#clock = clock; this.#issuer = normalizeIssuer(issuer);
  }
  #write(type, fn) { return this.#ledger.write(type, this.#principal, fn); }
  #now() { const value = this.#clock(); need(typeof value === 'string' && Number.isFinite(Date.parse(value)), 'INVALID_CLOCK'); return value; }
  #context(tx, value, action) {
    const control = tx.get('control', 'company'); const grant = tx.get('grants', value.grant_id);
    need(control?.value.protocol === 'peer-cos-v1' && control.value.paused === false, 'PUBLICATION_PAUSED_OR_NOT_ADOPTED');
    need(grant && Number.isSafeInteger(grant.value.generation) && grant.value.generation > 0 && Number.isSafeInteger(control.value.policy_generation) && Number.isSafeInteger(control.value.pause_generation), 'PUBLICATION_FENCE_REQUIRED');
    const principals = value.kind === 'github-publication' ? validateCanonicalReviews(tx, value, value.binding) : [tx.get('principals', value.principal_id)];
    need(principals.every(row => row?.value.status === 'active'), 'PRINCIPAL_NOT_ACTIVE');
    const view = Object.freeze({ get: (family, id) => tx.get(family, id), list: (family, options) => tx.list(family, options), count: (family, options) => tx.count(family, options) });
    let permitted;
    try { permitted = this.#authorize(view, clone({ principal_id: this.#principal, action, grant_id: value.grant_id, task_id: value.task_id, scope: value.authorization_scope ?? value.resource, resources: [{ kind: 'repo', repository: value.resource.slice(5) }], ...(value.subject_ref ? { subject_ref: value.subject_ref } : {}) })); } catch { fail('PUBLICATION_NOT_AUTHORIZED'); }
    need(permitted === true, 'PUBLICATION_NOT_AUTHORIZED');
    const fingerprint = publicationDigest({ control, grant, principals });
    if (value.context_sha256) need(value.context_sha256 === fingerprint, 'PUBLICATION_CONTEXT_CHANGED');
    return fingerprint;
  }
  #claim(tx, id, resource) {
    const claimId = `github-publication:${resource}`; const claimedResource = { key: resource, kind: 'repo', repository: resource.slice(5) };
    // Enumerate before any pending write: accepted P1 forbids list after put.
    for (const row of rows(tx, 'claims')) {
      if (TERMINAL_CLAIMS.has(row.value.status ?? row.value.state)) continue;
      if (row.id === claimId && row.value.effect_id === id && row.value.status === 'reserved') continue;
      const resources = row.value.resources ?? (row.value.resource ? [row.value.resource] : []);
      need(Array.isArray(resources) && resources.length > 0, 'UNCLASSIFIED_RESOURCE_CLAIM');
      for (const other of resources) {
        let overlap; try { overlap = this.#overlap(clone(claimedResource), clone(other)); } catch { fail('RESOURCE_POLICY_FAILED'); }
        need(typeof overlap === 'boolean', 'RESOURCE_POLICY_FAILED'); need(!overlap, 'PUBLICATION_RESOURCE_RESERVED');
      }
    }
    const prior = tx.get('claims', claimId);
    tx.put('claims', claimId, { kind: 'github-publication', status: 'reserved', resource: claimedResource, resources: [claimedResource], effect_id: id, principal_id: this.#principal }, prior?.revision ?? 0);
    return claimId;
  }
  #reserved(tx, effect) {
    const row = tx.get('claims', effect.claim_id);
    need(row?.value.effect_id === effect.id && row.value.status === 'reserved', 'PUBLICATION_RESERVATION_LOST'); return row;
  }
  #release(tx, effect) {
    const row = this.#reserved(tx, effect); tx.put('claims', row.id, { ...row.value, status: 'released' }, row.revision);
  }
  enqueue(input) {
    const { id, subject_ref, review_refs, grant_id, task_id } = clone(input);
    identifier(id); identifier(grant_id); identifier(task_id);
    return this.#write('github.publication.queued', tx => {
      const subject = exactRow(tx, subject_ref); const binding = normalizeBinding(subject.value.github_publication); matchIssuer(binding, this.#issuer);
      const value = { kind: 'github-publication', id, principal_id: this.#principal, authorization_scope: subject.value.scope ?? `repo:${binding.owner}/${binding.repo}`, scope: `repo:${binding.owner}/${binding.repo}`, subject_ref, review_refs, grant_id, task_id, binding, resource: `repo:${binding.owner}/${binding.repo}` };
      value.context_sha256 = this.#context(tx, value, 'github/prepare');
      const request_sha256 = publicationDigest(value); const prior = tx.get('tasks', `github-publication:${id}`);
      if (prior) { need(prior.value.request_sha256 === request_sha256, 'EFFECT_ID_PAYLOAD_MISMATCH'); return prior; }
      const sequence = tx.get('control', 'github-publication-sequence'); const next = (sequence?.value.next ?? 0) + 1; positive(next);
      tx.put('control', 'github-publication-sequence', { next }, sequence?.revision ?? 0);
      return tx.put('tasks', `github-publication:${id}`, { ...value, request_sha256, sequence: next, status: 'queued' }, 0);
    });
  }
  #admit(id) {
    return this.#write('github.publication.prepared', tx => {
      const task = tx.get('tasks', `github-publication:${identifier(id)}`); need(task, 'PUBLICATION_NOT_QUEUED');
      const value = task.value; matchIssuer(value.binding, this.#issuer); const existing = tx.get('effects', id);
      if (existing) {
        need(existing.value.request_sha256 === value.request_sha256, 'EFFECT_ID_PAYLOAD_MISMATCH');
        if (existing.value.dispatched || existing.value.status === 'succeeded') return existing.value;
        need(['prepared', 'waiting_check'].includes(existing.value.status), 'PUBLICATION_HELD_NEW_CANDIDATE_REQUIRED');
        this.#context(tx, existing.value, 'github/prepare'); this.#reserved(tx, existing.value); return existing.value;
      }
      const queue = rows(tx, 'tasks', { status: 'queued', scope: value.resource }).filter(row => row.value.kind === 'github-publication').sort((a, b) => a.value.sequence - b.value.sequence);
      need(queue[0]?.id === task.id, 'NOT_NEXT_PUBLICATION_CANDIDATE'); this.#context(tx, value, 'github/prepare');
      const claim_id = this.#claim(tx, id, value.resource);
      const effect = { ...value, claim_id, status: 'prepared', dispatched: false, prepared_at: this.#now() };
      tx.put('effects', id, effect, 0); tx.event('github.publication.prepared', { id, request_sha256: value.request_sha256 }); return effect;
    });
  }
  #record(id, patch, { release = false, taskStatus } = {}) {
    return this.#write('github.publication.observed', tx => {
      const row = tx.get('effects', id); need(row, 'EFFECT_NOT_FOUND');
      if (['succeeded', 'violation', 'failed'].includes(row.value.status)) return row.value;
      const value = { ...row.value, ...clone(patch), observed_at: this.#now() };
      if (release) this.#release(tx, value);
      tx.put('effects', id, value, row.revision);
      const task = tx.get('tasks', `github-publication:${id}`);
      if (task && taskStatus) tx.put('tasks', task.id, { ...task.value, status: taskStatus }, task.revision);
      tx.event('github.publication.observed', { id, status: value.status, reason: value.reason ?? null }); return value;
    });
  }
  #hold(id, error, fallback) {
    return this.#write('github.publication.observed', tx => {
      const row = tx.get('effects', id); need(row, 'EFFECT_NOT_FOUND');
      if (row.value.dispatched || !['prepared', 'waiting_check'].includes(row.value.status)) return row.value;
      const check = tx.get('effects', `github-check:${id}`);
      const task = tx.get('tasks', `github-publication:${id}`);
      const uncertainCheck = check?.value.dispatched && check.value.status !== 'succeeded';
      const value = { ...row.value, status: uncertainCheck ? 'waiting_check' : 'held', reason: reason(error, fallback), observed_at: this.#now() };
      if (!uncertainCheck) this.#release(tx, value);
      tx.put('effects', id, value, row.revision);
      if (task && !uncertainCheck) tx.put('tasks', task.id, { ...task.value, status: 'held' }, task.revision);
      tx.event('github.publication.observed', { id, status: value.status, reason: value.reason });
      return value;
    });
  }
  #checkRequest(effect) {
    return { kind: 'github-check', publication_id: effect.id, owner: effect.binding.owner, repo: effect.binding.repo, number: effect.binding.number, name: effect.binding.check_name, head_sha: effect.binding.head_sha, external_id: publicationCheckId(effect), issuer_sha256: publicationDigest(this.#issuer) };
  }
  #checkContract(tx, effect, observation = null) {
    const row = tx.get('effects', `github-check:${effect.id}`);
    if (!row) return; // No outstanding creation request; a subject gate may pre-exist.
    const check = row.value; const request = this.#checkRequest(effect);
    need(check.id === row.id && check.request_sha256 === publicationDigest(request) && Object.entries(request).every(([key, value]) => check[key] === value), 'CHECK_REQUEST_BINDING_MISMATCH');
    need(!['failed', 'closed'].includes(check.status), 'CHECK_TERMINALLY_CLOSED');
    need(check.status === 'succeeded' && Number.isSafeInteger(check.check_id) && check.check_id > 0, 'CHECK_CREATION_UNRESOLVED');
    if (observation) {
      const matches = observation.checks.filter(item => item.name === request.name);
      need(matches.length === 1 && matches[0].id === check.check_id && matches[0].app_id === this.#issuer.app_id && matches[0].head_sha === request.head_sha && matches[0].external_id === request.external_id && matches[0].status === 'completed' && matches[0].conclusion === 'success', 'CHECK_REMOTE_ID_MISMATCH');
    }
  }
  #guard(effect, action) {
    this.#ledger.read(tx => {
      this.#context(tx, effect, action); this.#reserved(tx, effect);
      if (action === 'github/publish' || action === 'github/accept') this.#checkContract(tx, effect);
    });
  }
  async #preflight(effect, gate, action) {
    this.#guard(effect, action);
    // Re-observe after awaited remote inspection; context is checked between reads.
    let inspection = clone(await this.#client.inspect(effect.binding, effect.binding.check_name));
    validateOpen(effect.binding, inspection, this.#issuer, publicationCheckId(effect), gate); this.#guard(effect, action);
    inspection = clone(await this.#client.inspect(effect.binding, effect.binding.check_name));
    validateOpen(effect.binding, inspection, this.#issuer, publicationCheckId(effect), gate); this.#guard(effect, action);
    return inspection;
  }
  async publish(id) {
    const effect = this.#admit(id);
    if (effect.dispatched || effect.status === 'succeeded') return this.reconcile(id);
    const checkEffect = this.#ledger.read(tx => tx.get('effects', `github-check:${id}`)?.value ?? null);
    if (checkEffect?.dispatched && checkEffect.status !== 'succeeded') {
      const check = await this.attest(id); if (check.status !== 'attested') return check;
    }
    let inspection;
    try { inspection = await this.#preflight(effect, true, 'github/publish'); }
    catch (error) { return this.#hold(id, error, 'PREPUBLICATION_VALIDATION_FAILED'); }
    const admitted = this.#write('github.publication.dispatch_admitted', tx => {
      const row = tx.get('effects', id); need(row && !row.value.dispatched && ['prepared', 'waiting_check'].includes(row.value.status), 'EFFECT_ALREADY_DISPATCHED');
      this.#context(tx, row.value, 'github/publish'); this.#reserved(tx, row.value);
      this.#checkContract(tx, row.value, inspection);
      const value = { ...row.value, status: 'dispatch_admitted', dispatched: true, dispatch_admitted_at: this.#now(), native_review_snapshots: inspection.reviews };
      tx.put('effects', id, value, row.revision); tx.event('github.publication.dispatch_admitted', { id, request_sha256: value.request_sha256 }); return value;
    });
    let receipt;
    try {
      receipt = clone(await this.#client.requestMerge(admitted.binding));
      need(['pending', 'merged', 'enqueued'].includes(receipt.status), 'GITHUB_INVALID_MERGE_RECEIPT');
      if (receipt.status === 'pending') need(typeof receipt.uuid === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(receipt.uuid), 'GITHUB_INVALID_MERGE_RECEIPT');
      if (receipt.status === 'merged') oid(receipt.merge_commit_sha);
    } catch { return this.#record(id, { status: 'unknown', reason: 'MERGE_RECEIPT_UNKNOWN' }, { taskStatus: 'waiting' }); }
    this.#record(id, {
      status: receipt.status === 'enqueued' ? 'unknown' : 'pending', reason: receipt.status === 'enqueued' ? 'UNEXPECTED_QUEUE_NO_RETRY' : null,
      ...(receipt.uuid ? { uuid: receipt.uuid } : {}), ...(receipt.merge_commit_sha ? { merge_commit_sha: receipt.merge_commit_sha } : {}),
    }, { taskStatus: 'waiting' });
    if (receipt.status === 'merged') return this.reconcile(id);
    return this.#ledger.read(tx => tx.get('effects', id).value);
  }
  async attest(id) {
    const effect = this.#admit(id); need(!effect.dispatched, 'PUBLICATION_ALREADY_DISPATCHED');
    let inspection;
    try { inspection = await this.#preflight(effect, false, 'github/attest'); }
    catch (error) { return this.#hold(id, error, 'ATTESTATION_VALIDATION_FAILED'); }
    const request = this.#checkRequest(effect); const external_id = request.external_id;
    const checkEffectId = `github-check:${id}`; const request_sha256 = publicationDigest(request);
    const exactChecks = inspection.checks.filter(check => check.name === request.name && check.app_id === this.#issuer.app_id && check.head_sha === request.head_sha && check.external_id === external_id);
    const terminal = new Set(['action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'timed_out']);
    const resultFor = value => {
      if (value.status === 'succeeded') return { status: 'attested', publication_id: id, check_id: value.check_id, external_id };
      if (value.status === 'failed' && value.closure_evidence && value.closure_sha256 === publicationDigest(value.closure_evidence)) return { status: 'failed', publication_id: id, reason: 'CHECK_TERMINALLY_FAILED', check_id: value.check_id, closure_sha256: value.closure_sha256, external_id };
      return { status: 'unknown', publication_id: id, reason: 'CHECK_RECEIPT_UNKNOWN_NO_RETRY', external_id };
    };
    const admission = this.#write('github.check.admitted', tx => {
      const parent = tx.get('effects', id);
      need(parent && parent.value.request_sha256 === effect.request_sha256 && canonical(this.#checkRequest(parent.value)) === canonical(request), 'EFFECT_ID_PAYLOAD_MISMATCH');
      this.#context(tx, parent.value, 'github/attest'); this.#reserved(tx, parent.value);
      const prior = tx.get('effects', checkEffectId);
      if (prior) need(prior.value.id === checkEffectId && prior.value.request_sha256 === request_sha256 && Object.entries(request).every(([key, value]) => prior.value[key] === value), 'EFFECT_ID_PAYLOAD_MISMATCH');
      if (['failed', 'closed'].includes(prior?.value.status)) return { send: false, value: prior.value };
      // external_id binds the reviewed subject, not this POST. A lost or still
      // outstanding create response supplies no remote ownership, even when a
      // matching observation is positive, unique, or recently completed.
      if (prior?.value.dispatched && prior.value.check_id === undefined) return { send: false, value: { status: 'unknown' } };
      if (exactChecks.length > 1) return { send: false, value: { status: 'unknown' } };
      const observed = exactChecks[0];
      if (prior?.value.check_id !== undefined) {
        positive(prior.value.check_id);
        if (observed && observed.id !== prior.value.check_id) return { send: false, value: { status: 'unknown' } };
      }
      const completed = observed?.completed_at;
      const completionMs = typeof completed === 'string' ? Date.parse(completed) : NaN;
      const completionISO = Number.isFinite(completionMs) ? new Date(completionMs).toISOString() : null;
      const validCompletion = completionISO !== null && (completed === completionISO || completed === completionISO.replace('.000Z', 'Z')) && completionMs <= Date.parse(this.#now());
      const owned = prior?.value.dispatched === true && Number.isSafeInteger(prior.value.check_id) && prior.value.check_id > 0 && observed?.id === prior.value.check_id;
      if (owned && observed.status === 'completed' && terminal.has(observed.conclusion) && validCompletion) {
        const repository = `${request.owner}/${request.repo}`;
        const unresolved = rows(tx, 'effects').some(row => row.id !== id && row.id !== checkEffectId && row.value.dispatched === true && row.value.status !== 'succeeded' && (row.value.resource === parent.value.resource || `${row.value.owner}/${row.value.repo}` === repository || `${row.value.binding?.owner}/${row.value.binding?.repo}` === repository));
        const task = tx.get('tasks', `github-publication:${id}`); const observed_at = this.#now();
        const closure_evidence = { protocol: 'github-check-terminal-v2', ownership: 'validated-create-response-remote-id', request_sha256, publication_request_sha256: parent.value.request_sha256, issuer_sha256: request.issuer_sha256, check: clone(observed), observed_at };
        const value = { ...prior.value, status: 'failed', closure_evidence, closure_sha256: publicationDigest(closure_evidence), observed_at };
        const mayHold = !parent.value.dispatched && ['prepared', 'waiting_check'].includes(parent.value.status);
        if (mayHold) {
          if (!unresolved) this.#release(tx, parent.value);
          tx.put('effects', id, { ...parent.value, status: 'held', reason: unresolved ? 'CHECK_FAILED_OTHER_EFFECT_UNRESOLVED' : 'CHECK_TERMINALLY_FAILED', observed_at }, parent.revision);
          if (task) tx.put('tasks', task.id, { ...task.value, status: 'held' }, task.revision);
        }
        tx.put('effects', checkEffectId, value, prior.revision);
        tx.event('github.check.failed', { id: checkEffectId, request_sha256, closure_sha256: value.closure_sha256, publication_dispatched: parent.value.dispatched === true, reservation_released: mayHold && !unresolved });
        return { send: false, value };
      }
      need(!parent.value.dispatched && ['prepared', 'waiting_check'].includes(parent.value.status), 'PUBLICATION_ALREADY_DISPATCHED');
      if (observed?.status === 'completed' && observed.conclusion === 'success') {
        const value = { ...(prior?.value ?? request), id: checkEffectId, request_sha256, status: 'succeeded', dispatched: prior?.value.dispatched ?? false, check_id: positive(observed.id) };
        tx.put('effects', checkEffectId, value, prior?.revision ?? 0); return { send: false, value };
      }
      if (prior?.value.dispatched || observed) return { send: false, value: { status: 'unknown' } };
      const value = { ...request, id: checkEffectId, request_sha256, status: 'dispatch_admitted', dispatched: true, send_claimed: true, dispatch_admitted_at: this.#now() };
      tx.put('effects', checkEffectId, value, prior?.revision ?? 0); tx.event('github.check.dispatch_admitted', { id: checkEffectId, request_sha256 }); return { send: true, value };
    });
    if (!admission.send) return resultFor(admission.value);
    let reply;
    try {
      reply = clone(await this.#client.createCheckRun(request));
      need(reply.app_id === this.#issuer.app_id && reply.name === request.name && reply.head_sha === request.head_sha && reply.external_id === external_id && reply.status === 'completed' && reply.conclusion === 'success', 'CHECK_ISSUER_REPLY_MISMATCH'); positive(reply.id);
    } catch {
      const current = this.#write('github.check.unknown', tx => {
        const row = tx.get('effects', checkEffectId); need(row && row.value.request_sha256 === request_sha256, 'EFFECT_ID_PAYLOAD_MISMATCH');
        if (['succeeded', 'failed', 'closed'].includes(row.value.status)) return row.value;
        return tx.put('effects', checkEffectId, { ...row.value, status: 'unknown' }, row.revision).value;
      });
      return resultFor(current);
    }
    const current = this.#write('github.check.received', tx => {
      const row = tx.get('effects', checkEffectId); need(row && row.value.request_sha256 === request_sha256, 'EFFECT_ID_PAYLOAD_MISMATCH');
      if (['failed', 'closed'].includes(row.value.status)) return row.value;
      if (row.value.check_id !== undefined) need(row.value.check_id === reply.id, 'CHECK_REMOTE_ID_MISMATCH');
      if (row.value.status === 'succeeded') return row.value;
      return tx.put('effects', checkEffectId, { ...row.value, status: 'pending', check_id: reply.id }, row.revision).value;
    });
    if (['failed', 'closed'].includes(current.status)) return resultFor(current);
    return this.attest(id);
  }
  async reconcile(id) {
    const effect = this.#ledger.read(tx => tx.get('effects', identifier(id))?.value ?? null); need(effect?.kind === 'github-publication', 'EFFECT_NOT_FOUND');
    if (['succeeded', 'failed', 'violation'].includes(effect.status)) return effect;
    need(effect.dispatched === true, 'EFFECT_NOT_DISPATCHED');
    let result = null;
    if (effect.uuid) {
      try { result = clone(await this.#client.mergeResult({ ...effect.binding, uuid: effect.uuid })); }
      catch { result = null; }
    }
    let observation;
    try { observation = clone(await this.#client.observe(effect.binding)); }
    catch { return this.#record(id, { status: 'unknown', reason: 'MERGE_READBACK_UNKNOWN' }); }
    const repository = `${effect.binding.owner}/${effect.binding.repo}`;
    if (observation.owner !== effect.binding.owner || observation.repo !== effect.binding.repo || observation.number !== effect.binding.number || observation.head_repository !== repository || observation.base_repository !== repository) return this.#record(id, { status: 'violation', reason: 'PUBLISHED_TARGET_MISMATCH' });
    if (observation.merged === true) {
      if (!mergedExactly(effect.binding, observation, result?.merge_commit_sha ?? effect.merge_commit_sha)) return this.#record(id, { status: 'violation', reason: 'PUBLISHED_SUBJECT_MISMATCH' });
      let final;
      try {
        this.#guard(effect, 'github/accept');
        final = clone(await this.#client.inspect(effect.binding, effect.binding.check_name));
        validatePolicy(effect.binding, final, this.#issuer, publicationCheckId(effect));
        need(mergedExactly(effect.binding, final, observation.merge_commit_sha), 'PUBLISHED_SUBJECT_MISMATCH'); oid(final.merge_commit_sha);
        this.#guard(effect, 'github/accept');
      } catch (error) { return this.#record(id, { status: 'unknown', reason: reason(error, 'FINAL_ACCEPTANCE_BLOCKED'), merged_observed: true }); }
      const receipt = {
        repository, number: effect.binding.number, head_sha: effect.binding.head_sha, base_sha: effect.binding.base_sha,
        tree_sha: effect.binding.tree_sha, merge_commit_sha: final.merge_commit_sha, merge_method: 'merge',
        request_sha256: effect.request_sha256, subject_ref: effect.subject_ref, review_refs: effect.review_refs,
        harness_sha256: effect.binding.harness_sha256, policy_sha256: effect.binding.policy_sha256,
      };
      return this.#write('github.publication.accepted', tx => {
        const row = tx.get('effects', id); need(row, 'EFFECT_NOT_FOUND');
        if (['succeeded', 'failed', 'violation'].includes(row.value.status)) return row.value;
        need(row.value.dispatched === true && row.value.request_sha256 === effect.request_sha256, 'EFFECT_ID_PAYLOAD_MISMATCH');
        this.#context(tx, row.value, 'github/accept'); this.#reserved(tx, row.value);
        const task = tx.get('tasks', `github-publication:${id}`); need(task, 'PUBLICATION_NOT_QUEUED');
        // This check is inside BEGIN IMMEDIATE, before any release or success
        // write. A different connection's closure after the read guard wins.
        try { this.#checkContract(tx, row.value, final); }
        catch (error) {
          const value = { ...row.value, status: 'unknown', reason: reason(error, 'FINAL_ACCEPTANCE_BLOCKED'), merged_observed: true, observed_at: this.#now() };
          tx.put('effects', id, value, row.revision);
          tx.event('github.publication.acceptance_blocked', { id, reason: value.reason });
          return value;
        }
        const value = { ...row.value, status: 'succeeded', reason: null, receipt, receipt_sha256: publicationDigest(receipt), observed_at: this.#now() };
        this.#release(tx, value); tx.put('effects', id, value, row.revision);
        tx.put('tasks', task.id, { ...task.value, status: 'completed' }, task.revision);
        tx.event('github.publication.accepted', { id, receipt_sha256: value.receipt_sha256 }); return value;
      });
    }
    if (result?.status === 'failed' && observation.merged === false && observation.state === 'open') return this.#record(id, { status: 'failed', reason: 'REMOTE_MERGE_FAILED' }, { release: true, taskStatus: 'held' });
    const changed = observation.head_sha !== effect.binding.head_sha || observation.base_sha !== effect.binding.base_sha || observation.tree_sha !== effect.binding.tree_sha;
    const pending = result?.status === 'pending' && !changed;
    return this.#record(id, { status: pending ? 'pending' : 'unknown', reason: changed ? 'SOURCE_CHANGED_IN_FLIGHT' : result?.status === 'expired' ? 'MERGE_UUID_EXPIRED_NO_RETRY' : result?.status === 'enqueued' ? 'UNEXPECTED_QUEUE_NO_RETRY' : pending ? null : 'RECEIPT_UNKNOWN_NO_RETRY' });
  }
  async requestBranchUpdate(input) {
    const { id, owner, repo, number, head_sha, base_sha, base_branch, grant_id, task_id } = clone(input);
    need(typeof this.#update === 'function', 'AUTHORIZED_BRANCH_UPDATE_ADAPTER_REQUIRED');
    const binding = { ...target({ owner, repo, number }), head_sha: oid(head_sha), base_sha: oid(base_sha), base_branch }; refPath(base_branch);
    const request = { kind: 'github-branch-update', id: identifier(id), principal_id: this.#principal, binding, grant_id: identifier(grant_id), task_id: identifier(task_id), resource: `repo:${binding.owner}/${binding.repo}` };
    const request_sha256 = publicationDigest(request);
    const effect = this.#write('github.branch-update.prepared', tx => {
      const prior = tx.get('effects', id);
      if (prior) { need(prior.value.request_sha256 === request_sha256, 'EFFECT_ID_PAYLOAD_MISMATCH'); return prior.value; }
      const context_sha256 = this.#context(tx, request, 'github/update-branch'); const claim_id = this.#claim(tx, id, request.resource);
      const value = { ...request, request_sha256, claim_id, context_sha256, status: 'prepared', dispatched: false }; tx.put('effects', id, value, 0); return value;
    });
    if (effect.dispatched) return this.reconcileBranchUpdate(id);
    need(effect.status === 'prepared', 'PUBLICATION_HELD_NEW_CANDIDATE_REQUIRED');
    try {
      this.#guard(effect, 'github/update-branch');
      const before = clone(await this.#client.observe(binding));
      need(before.owner === binding.owner && before.repo === binding.repo && before.number === binding.number && before.head_sha === binding.head_sha && before.base_sha === binding.base_sha && before.base_branch === binding.base_branch && before.merged === false && before.state === 'open' && before.head_repository === `${binding.owner}/${binding.repo}` && before.base_repository === `${binding.owner}/${binding.repo}`, 'SOURCE_CHANGED_REVALIDATE');
      this.#guard(effect, 'github/update-branch');
    } catch (error) { return this.#hold(id, error, 'BRANCH_UPDATE_OBSERVATION_UNKNOWN'); }
    this.#write('github.branch-update.dispatch_admitted', tx => {
      const row = tx.get('effects', id); need(row && row.value.status === 'prepared' && !row.value.dispatched, 'EFFECT_ALREADY_DISPATCHED');
      this.#context(tx, row.value, 'github/update-branch'); this.#reserved(tx, row.value);
      tx.put('effects', id, { ...row.value, status: 'dispatch_admitted', dispatched: true }, row.revision); tx.event('github.branch-update.dispatch_admitted', { id, request_sha256 });
    });
    try { await this.#update(clone(binding)); }
    catch { return this.#record(id, { status: 'unknown', reason: 'BRANCH_UPDATE_RECEIPT_UNKNOWN' }); }
    return this.#record(id, { status: 'pending', reason: 'BRANCH_UPDATE_REQUIRES_NEW_REVIEW' });
  }
  async reconcileBranchUpdate(id) {
    const effect = this.#ledger.read(tx => tx.get('effects', identifier(id))?.value ?? null); need(effect?.kind === 'github-branch-update' && effect.dispatched, 'BRANCH_UPDATE_NOT_DISPATCHED');
    if (effect.status === 'succeeded') return effect;
    let observation;
    try { observation = clone(await this.#client.observe(effect.binding)); } catch { return this.#record(id, { status: 'unknown', reason: 'BRANCH_UPDATE_READBACK_UNKNOWN' }); }
    const b = effect.binding; const repository = `${b.owner}/${b.repo}`;
    const valid = observation.owner === b.owner && observation.repo === b.repo && observation.number === b.number && observation.head_repository === repository && observation.base_repository === repository && observation.head_sha !== b.head_sha && observation.base_sha === b.base_sha && observation.base_branch === b.base_branch && observation.state === 'open' && observation.merged === false && observation.head_parents?.length === 2 && observation.head_parents[0] === b.head_sha && observation.head_parents[1] === b.base_sha;
    if (!valid) return this.#record(id, { status: 'unknown', reason: 'BRANCH_UPDATE_NOT_CONFIRMED_NO_RETRY' });
    try {
      oid(observation.head_sha); oid(observation.tree_sha);
      return this.#write('github.branch-update.accepted', tx => {
        const row = tx.get('effects', id); if (row.value.status === 'succeeded') return row.value;
        this.#context(tx, row.value, 'github/update-branch'); this.#reserved(tx, row.value);
        const value = { ...row.value, status: 'succeeded', reason: 'NEW_HEAD_REQUIRES_NEW_SUBJECT_REVIEW_AND_TESTS', updated_head_sha: observation.head_sha, updated_tree_sha: observation.tree_sha };
        this.#release(tx, value); tx.put('effects', id, value, row.revision); return value;
      });
    } catch (error) { return this.#record(id, { status: 'unknown', reason: reason(error, 'BRANCH_UPDATE_ACCEPTANCE_BLOCKED') }); }
  }
}
