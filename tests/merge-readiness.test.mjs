import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const workflow = fs.readFileSync(new URL('../.github/workflows/merge-readiness.yml', import.meta.url), 'utf8');
// Execute the actual shipped inline script; the test supplies only I/O boundaries.
const script = workflow.match(/node <<'NODE'\n([\s\S]+?)\n          NODE/)[1].replace(/^          /gm, '');
const sha = 'a'.repeat(40);
const ready = {number: 12, state: 'open', draft: false, base: {ref: 'main'}, head: {sha}, auto_merge: {merge_method: 'merge'}};

async function run({pr = ready, action = 'auto_merge_enabled', eventSha = sha, eventNumber = 12, status = 200, failure} = {}) {
  const calls = [], messages = [], env = {
    GITHUB_EVENT_PATH: '/event.json', GITHUB_API_URL: 'https://api.github.com',
    GITHUB_REPOSITORY: 'fictional/repository', GITHUB_TOKEN: 'fictional-read-only-token'
  };
  const process = {env, exitCode: 0};
  const event = {action, pull_request: {number: eventNumber, head: {sha: eventSha}}};
  await vm.runInNewContext(script, {
    process, AbortSignal,
    require(name) {
      assert.equal(name, 'node:fs');
      return {readFileSync(file) {assert.equal(file, env.GITHUB_EVENT_PATH); return JSON.stringify(event);}};
    },
    console: {log: text => messages.push(text), error: text => messages.push(text)},
    async fetch(url, options) {
      calls.push({url, options});
      if (failure) throw Error(failure);
      return {ok: status === 200, status, json: async () => structuredClone(pr)};
    }
  });
  return {code: process.exitCode, messages: messages.join('\n'), calls};
}

test('ready current head with auto-merge passes using only a metadata GET', async () => {
  const result = await run();
  assert.equal(result.code, 0);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].url, 'https://api.github.com/repos/fictional/repository/pulls/12');
  assert.equal(result.calls[0].options.method, undefined); // fetch defaults to GET.
  assert.match(result.messages, /Native auto-merge is enabled/);
});

test('draft stays non-success even if auto-merge metadata persists', async () => {
  const result = await run({pr: {...ready, draft: true}, action: 'converted_to_draft'});
  assert.equal(result.code, 1);
  assert.match(result.messages, /Draft hold/);
});

test('ready PR without auto-merge is held; disabling it holds the same head again', async () => {
  for (const action of ['ready_for_review', 'auto_merge_disabled']) {
    const result = await run({pr: {...ready, auto_merge: null}, action});
    assert.equal(result.code, 1);
    assert.match(result.messages, /Enable auto-merge/);
  }
});

test('a pushed head needs renewed readiness even if GitHub retains auto-merge', async () => {
  const result = await run({action: 'synchronize'});
  assert.equal(result.code, 1);
  assert.match(result.messages, /New head/);
});

test('stale event cannot approve a newer head', async () => {
  const result = await run({pr: {...ready, head: {sha: 'b'.repeat(40)}}});
  assert.equal(result.code, 1);
  assert.match(result.messages, /Stale event/);
});

test('API denial and network failure hold readiness', async () => {
  for (const options of [{status: 403}, {status: 500}, {failure: 'network unavailable'}]) {
    const result = await run(options);
    assert.equal(result.code, 1);
    assert.match(result.messages, /Cannot verify|network unavailable/);
  }
});

test('wrong subject and unexpected open state cannot satisfy the gate', async () => {
  for (const pr of [{...ready, number: 13}, {...ready, state: 'unknown'}, {...ready, base: {ref: 'release'}}, {...ready, draft: undefined}]) {
    assert.equal((await run({pr})).code, 1);
  }
});

test('a late event for a closed PR cannot leave reusable green readiness', async () => {
  const result = await run({pr: {...ready, state: 'closed'}});
  assert.equal(result.code, 1);
  assert.match(result.messages, /open pull request/);
});

test('missing identity holds before any API request', async () => {
  for (const options of [{eventSha: null}, {eventNumber: null}, {eventNumber: 0}]) {
    const result = await run(options);
    assert.equal(result.code, 1);
    assert.match(result.messages, /Missing pull request identity/);
    assert.equal(result.calls.length, 0);
  }
});

test('other event actions cannot clear a hold with a persisted auto-merge flag', async () => {
  for (const action of ['opened', 'reopened', 'converted_to_draft', 'auto_merge_disabled', 'edited', 'closed', undefined]) {
    const result = await run({action: action ?? 'unknown'});
    assert.equal(result.code, 1);
    assert.match(result.messages, /Readiness hold/);
  }
});

test('synchronize and metadata edits stay held until a new explicit readiness declaration', async () => {
  const currentHead = {...ready, head: {sha: 'b'.repeat(40)}};
  for (const [action, expectedCode] of [['synchronize', 1], ['edited', 1], ['ready_for_review', 0]]) {
    const result = await run({pr: currentHead, eventSha: currentHead.head.sha, action});
    assert.equal(result.code, expectedCode, action);
  }
});
