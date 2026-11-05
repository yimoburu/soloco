import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildEvidence, resolveBodyAlias, readEvidence, validateCitations, createDeliveryLedger, recordDelivery,
  admitPrompt, recordResponse, REQUEST_LIMIT, RESPONSE_RESERVE, RANGE_LIMIT, CITATION_LIMIT
} from '../plugins/soloco/runtime/upgrade-evidence.mjs';

const sha = (text, encoding = 'utf8') => createHash('sha256').update(text, encoding).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const ref = source => ({ source_id: source.source_id, sha256: source.sha256,
  ...(Object.hasOwn(source, 'revision') ? { revision: source.revision } : {}) });
const field = (subject, key) => subject.handover.checkpoint.find(item => item.key === key);
const entry = (subject, key) => field(subject, 'records').entries.find(item => item.key === key);
const request = (source, offset = 0, length = source.length) => ({ source_id: source.source_id, sha256: source.sha256, offset, length });
function sourceWhere(subject, predicate) {
  const descriptor = subject.inventory.entries.find(predicate);
  assert.ok(descriptor, 'expected inventoried source');
  return subject.sources[descriptor.source_id];
}
const payload = subject => sourceWhere(subject, item => item.reason === 'typed-file-body');
const state = (records = {}) => ({ id: 'company-test', governance: 'Pinned old rules.', records, jobs: {}, notices: [], messages: [] });
const artifact = (content, revision = 4) => ({ id: 'artifact-id', kind: 'artifact', revision,
  author_role: 'engineer', author_instance: 'author-1', content: typeof content === 'string' ? content : JSON.stringify(content), previous: [] });
const fileState = (body = 'A😀Bsecret') => state({ source: artifact({ files: [{ path: 'x.mjs', content: body }] }) });
const team = () => ({ plugin_version: '0.6.1', governance: 'Pinned governance', governance_sha256: sha('Pinned governance'),
  roles: { engineer: { mission: 'Preserve boundaries' } }, cos_instructions: 'Recover constraints before action.' });
const catalog = { source: 'host_catalog', model: { id: 'model-x', supported_efforts: ['medium'] },
  speed_support: { host_default: true, evidence: 'host_default' } };

test('real keyed collections: 145 records, 57 jobs, source-heavy history fits and exact provenance survives', () => {
  const body = 'synthetic source body '.repeat(30000);
  const input = state();
  for (let index = 0; index < 145; index += 1) {
    input.records[`key/${index}~`] = index < 3 ? artifact({ files: { 'x.mjs': body }, claim: 'No acceptance permission.' })
      : { id: `record-${index}`, kind: 'decision', revision: 2, content: `Retain obligation ${index}`, previous: [] };
  }
  input.records['key/0~'].previous = [{ revision: 1, content: 'const old_rule = HOLD; unresolved old obligation.', status: 'Failed' }];
  input.records['key/0~'].extension = { authority: 'Unknown extension remains binding.' };
  for (let index = 0; index < 57; index += 1) {
    input.jobs[`job-${index}`] = { id: `job-id-${index}`, role: 'engineer', task: 'Exact bounded task', status: 'failed', error: 'Keep failed evidence.',
      inputs: [{ id: 'record-4', revision: 2 }], model_catalog: catalog };
  }
  input.notices.push({ id: 'n', summary: 'Unresolved notice', resolution: null, previous: [{ status: 'Failed', text: 'No silent clearing.' }] });
  input.messages.push({ id: 'm', content: 'Retain message' });
  input['unknown/~field'] = { obligation: 'Keep unknown top-level value.' };
  const history = [0, 1, 2].map(index => ({ id: `upgrade-${index}`, status: 'Failed', error: 'No completed artifact.',
    previous: team(), candidate: team(), checkpoint: clone(input), checkpoint_sha256: sha(JSON.stringify(input)),
    probe: { instance_id: `instance-${index}`, native_id: `native-${index}`, artifact: { content: 'Unresolved report', continuity: 'Unknown' }, completed_at: null },
    review: { verdict: 'Blocked', reason: 'Missing evidence' }, extension: 'Keep history extension.' }));
  const raw = JSON.stringify(input);
  const historyRaw = JSON.stringify(history);
  assert.ok(raw.length > 1000000 && historyRaw.length > 1000000);
  const subject = buildEvidence(input, history);
  const again = buildEvidence(clone(input), clone(history));
  const transport = JSON.stringify(subject.handover);
  assert.equal(subject.inventory.counts.records, 145);
  assert.equal(subject.inventory.counts.jobs, 57);
  assert.equal(subject.inventory.counts.notices, 1);
  assert.equal(subject.inventory.counts.messages, 1);
  assert.equal(subject.inventory.counts.history_attempts, 3);
  assert.equal(field(subject, 'records').collection_shape, 'object');
  assert.deepEqual(field(subject, 'records').entries.map(item => item.key), Object.keys(input.records));
  assert.deepEqual(subject.handover.checkpoint.map(item => item.key), Object.keys(input).sort());
  assert.equal(subject.checkpoint_sha256, sha(raw));
  assert.equal(subject.history_sha256, sha(historyRaw));
  assert.equal(subject.inventory_sha256, sha(JSON.stringify(subject.inventory)));
  assert.deepEqual(subject.handover, again.handover);
  assert.deepEqual(subject.inventory, again.inventory);
  assert.ok(transport.length < REQUEST_LIMIT);
  admitPrompt(JSON.stringify({ instructions: 'Pinned instructions', handover: subject.handover, author_output: 'a'.repeat(RESPONSE_RESERVE) }));
  for (const text of ['unresolved old obligation', 'Unknown extension remains binding.', 'No silent clearing.', 'Keep unknown top-level value.',
    'No completed artifact.', 'native-2', 'Missing evidence', 'Keep history extension.', 'Keep failed evidence.']) assert.ok(transport.includes(text));
  assert.ok(!transport.includes(body));
  const files = subject.inventory.entries.filter(item => item.reason === 'typed-file-body');
  assert.equal(files.length, 3);
  assert.equal(new Set(files.map(item => item.source_id)).size, 3);
  assert.equal(new Set(files.map(item => item.blob_id)).size, 1);
  const current = subject.sources[entry(subject, 'key/0~').source.source_id];
  assert.equal(current.path, '/records/key~10~0');
  assert.equal(current.collection_key, 'key/0~');
  assert.equal(current.entity_id, 'artifact-id');
  const old = sourceWhere(subject, item => item.kind === 'record' && item.revision === 1);
  assert.equal(old.parent_source_id, current.source_id);
  assert.equal(old.entity_id, 'artifact-id');
  const snapshots = subject.inventory.entries.filter(item => item.reason === 'prior-full-checkpoint-snapshot');
  const teams = subject.inventory.entries.filter(item => item.reason === 'prior-team-snapshot');
  assert.equal(snapshots.length, 3);
  assert.equal(teams.length, 6);
  assert.equal(new Set(snapshots.map(item => item.blob_id)).size, 1);
  assert.ok(!subject.inventory.entries.some(item => item.scope === 'history' && item.path.includes('/checkpoint/records/')));
  assert.deepEqual(JSON.parse(subject.sources[snapshots[0].source_id].raw), input);
  assert.deepEqual(JSON.parse(subject.sources[teams[0].source_id].raw), team());
  for (const descriptor of subject.inventory.entries) {
    const source = subject.sources[descriptor.source_id];
    assert.equal(source.raw.length, descriptor.length);
    assert.equal(sha(source.raw, descriptor.hash_encoding), descriptor.sha256);
    const { raw: ignored, ...stored } = source;
    assert.deepEqual(stored, descriptor);
  }
  input.records['key/0~'].content = 'Mutated live input';
  history[0].error = 'Mutated error';
  assert.equal(JSON.parse(current.raw).content, JSON.parse(raw).records['key/0~'].content);
  assert.notEqual(buildEvidence(input, history).history_sha256, subject.history_sha256);
  assert.throws(() => { current.raw = 'tamper'; }, TypeError);
  assert.throws(() => { subject.inventory.entries.pop(); }, TypeError);
});

test('formatted JSON preserves raw text and quoted spaces; duplicate keys and changed lexemes remain literal', () => {
  const body = '  source spaces\t\nquote " and slash \\ end  ';
  const value = { files: [{ path: 'x', content: body }], claim: '  retain prose spacing  ' };
  const canonical = JSON.stringify(value);
  const pretty = JSON.stringify(value, null, 2);
  const pythonStyle = canonical.replaceAll('},', '}, ');
  const literals = [
    '{ "instruction": "old rule", "instruction": "new summary" }',
    '{ "budget": 9007199254740993, "files": { "x": "keep" } }',
    '{ "number": -0 }', '{ "number": 1e0 }', '{ "number": 1.0 }',
    '{ "nested": {"x": 1, "x": 2} }', 'not JSON', '"plain JSON string"'
  ];
  const records = { canonical: artifact(canonical), pretty: artifact(` \r\n${pretty}\t `), spaced: artifact(pythonStyle) };
  literals.forEach((content, index) => { records[`literal-${index}`] = artifact(content); });
  const subject = buildEvidence(state(records));
  for (const key of ['canonical', 'pretty', 'spaced']) {
    const projected = entry(subject, key).value.content;
    assert.equal(projected.format, 'derived-json');
    assert.equal(projected.value.claim, value.claim);
    assert.equal(subject.sources[projected.raw.source_id].raw, records[key].content);
  }
  literals.forEach((raw, index) => assert.equal(entry(subject, `literal-${index}`).value.content, raw));
  const files = subject.inventory.entries.filter(item => item.reason === 'typed-file-body');
  assert.equal(files.length, 3);
  assert.equal(new Set(files.map(item => item.blob_id)).size, 1);
  assert.equal(subject.sources[files[0].source_id].raw, body);
});

test('actual artifact/runtime payload shapes extract only named bodies and retain review, receipt and authority metadata', () => {
  const input = state({
    source: artifact({ sources: [{ path: 'x', content: 'source body', sha256: sha('source body') }], diff: 'diff body',
      test_output: 'test body', native_hooks_output: 'hooks body', status: 'Failed', error: 'Unresolved failure', source: 'Unknown source prose', log: 'Unknown log prose' }),
    reviewed: artifact({ runtime_and_docs_diff: 'reviewed diff', changed_file_sha256: { 'x.mjs': sha('x') },
      verification: { tests: 'Maintainer reported only', review: 'Failed' }, limits: 'No live evidence' }),
    release: artifact({ release_delta: 'release diff', generated_files: { 'generated.mjs': 'generated body' },
      tests: { status: 'passed', stdout: 'release stdout', stderr: '', error: 'Retain error' }, claim: 'No adoption' }),
    explicit: artifact({ type: 'source-evidence', source: 'explicit source', diff: 'explicit diff', log: 'explicit log',
      authority: 'Preparation only', unknown: { source: 'Nested semantic source' } }),
    plan: { ...artifact('Bounded scope'), development: { type: 'plan', scope: {
      sources: [{ path: 'input.mjs', content: 'input body', sha256: sha('input body') }],
      acceptance: 'Independent QA required', stop_conditions: 'Hold uncertainty', read_paths: ['input.mjs'] } } },
    result: { ...artifact('Runtime receipt'), development: { type: 'test', candidate_id: 'candidate-1', receipt_sha256: sha('receipt'),
      result: { status: 'failed', stdout: 'runtime stdout', stderr: 'runtime stderr', error: 'Keep runtime error', exit_code: 1 } } }
  });
  input.jobs.j = { id: 'j', development: { type: 'candidate', files: [{ path: 'candidate.mjs', content: 'candidate body' }] } };
  const subject = buildEvidence(input);
  const view = JSON.stringify(subject.handover);
  for (const text of ['source body', 'diff body', 'test body', 'hooks body', 'reviewed diff', 'release diff', 'generated body',
    'release stdout', 'explicit source', 'explicit diff', 'explicit log', 'input body', 'runtime stdout', 'runtime stderr', 'candidate body']) {
    assert.ok(Object.values(subject.sources).some(source => source.kind === 'payload' && source.raw === text), text);
    assert.ok(!view.includes(text), text);
  }
  for (const text of ['Unresolved failure', 'Unknown source prose', 'Unknown log prose', 'Maintainer reported only', 'No live evidence',
    'Retain error', 'No adoption', 'Preparation only', 'Nested semantic source', 'Independent QA required', 'Hold uncertainty',
    'Keep runtime error', 'candidate-1', sha('receipt'), sha('input body')]) assert.ok(view.includes(text), text);
});

test('unknown shapes, old obligations and semantic context are not inferred inert', () => {
  const text = 'const obligation = HOLD; do not publish without review.';
  const input = state({
    plain: { id: 'plain', kind: 'decision', revision: 2, content: text, source: text, log: text,
      files: [{ path: 'looks.mjs', content: text }], previous: [{ revision: 1, content: 'Earlier unresolved rule' }] },
    unknown: artifact({ source: text, log: text, diff: text, files: [], test_output: text,
      runtime_and_docs_diff: text, changed_file_sha256: { x: 'not a hash' }, verification: 'Unknown verification',
      release_delta: text, generated_files: ['x'], tests: { reason: 'Unknown tests' }, nested: { files: { x: text } } })
  });
  input.jobs.j = { id: 'j', task: 'Semantic task', inputs: [{ id: 'x', instruction: 'Keep instruction' }],
    context: { inputs: [{ id: 'x', revision: 1 }], task: 'Keep context task' },
    model_catalog: { ...catalog, authority: 'Unknown authority' },
    development: { type: 'unknown', files: [{ path: 'x', content: text }] },
    result: { status: 'failed', stdout: text, stderr: text } };
  const history = [{ status: 'Failed', checkpoint: { company_id: 'legacy', records: {}, jobs: {}, notices: [], messages: [], rule: text },
    previous: { plugin_version: '0.6.1', governance: 'Missing other team fields', instruction: text },
    candidate: { version: 'unknown', instructions: text }, report: 'Still failed' }];
  const subject = buildEvidence(input, history);
  const view = JSON.stringify(subject.handover);
  assert.equal(subject.inventory.counts.payload_occurrences, 0);
  for (const token of [text, 'Earlier unresolved rule', 'Keep instruction', 'Keep context task', 'Unknown authority', 'Still failed']) assert.ok(view.includes(token));
});

test('mechanical whitelist references only exact known metadata shapes', () => {
  const input = state({ r: { id: 'r', inputs: [{ id: 'prior', revision: 1 }], model_catalog: catalog,
    task: 'Read unresolved notice', reason: 'No qualification' } });
  input.jobs.j = { id: 'j', context: { inputs: [{ id: 'r', revision: 1 }], model_catalog: catalog }, error: 'Earlier failure' };
  const subject = buildEvidence(input);
  assert.equal(subject.inventory.counts.payload_occurrences, 3);
  const source = sourceWhere(subject, item => item.reason === 'machine-input-references');
  assert.deepEqual(JSON.parse(source.raw), [{ id: 'prior', revision: 1 }]);
  assert.equal(source.entity_id, 'r');
  for (const text of ['Read unresolved notice', 'No qualification', 'Earlier failure']) assert.ok(JSON.stringify(subject.handover).includes(text));
});

test('map keys, duplicate IDs and prototype-looking keys remain distinct and immutable', () => {
  const records = JSON.parse('{"__proto__":{"id":"same","revision":1,"content":"same"},"a/b~c":{"id":"same","revision":1,"content":"same"}}');
  const input = state(records);
  input.extension = JSON.parse('{"__proto__":{"obligation":"retain"}}');
  const subject = buildEvidence(input);
  const entries = field(subject, 'records').entries;
  assert.deepEqual(entries.map(item => item.key), ['__proto__', 'a/b~c']);
  assert.notEqual(entries[0].source.source_id, entries[1].source.source_id);
  assert.equal(entries[0].source.sha256, entries[1].source.sha256);
  assert.equal(subject.sources[entries[1].source.source_id].path, '/records/a~1b~0c');
  assert.ok(JSON.stringify(subject.handover).includes('retain'));
  assert.equal({}.obligation, undefined);
  assert.equal(new Set(subject.inventory.entries.map(item => item.source_id)).size, subject.inventory.counts.sources);
  assert.throws(() => { subject.sources[entries[0].source.source_id].raw = 'changed'; }, TypeError);
});

test('frozen retrieval rejects forged identities, hashes, fields and unsafe UTF-16 ranges', () => {
  const input = fileState();
  const subject = buildEvidence(input);
  const source = payload(subject);
  input.records.source.content = 'Changed live data';
  const whole = readEvidence(subject, request(source));
  assert.equal(whole.text, 'A😀Bsecret');
  assert.equal(whole.range_sha256, sha(whole.text));
  assert.equal(readEvidence(subject, request(source, 1, 2)).text, '😀');
  assert.throws(() => readEvidence(subject, request(source, 1, 1)), /surrogate/);
  assert.throws(() => readEvidence(subject, request(source, 2, 1)), /surrogate/);
  assert.throws(() => readEvidence(subject, { ...request(source), sha256: 'bad' }), /hash/);
  assert.throws(() => readEvidence(subject, { ...request(source), source_id: '/live/path' }), /unknown/);
  assert.throws(() => readEvidence(subject, { ...request(source), path: '/live' }), /exactly/);
  for (const value of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => readEvidence(subject, request(source, value, 1)), /safe integer/);
    assert.throws(() => readEvidence(subject, request(source, 0, value)), /safe integer/);
  }
  assert.throws(() => readEvidence(subject, request(source, 0, RANGE_LIMIT + 1)), /32768/);
  assert.throws(() => readEvidence(subject, request(source, source.length, 1)), /bounds/);
  assert.throws(() => readEvidence(subject, request(source, 0, 0)), /empty/);
  assert.throws(() => readEvidence(clone(subject), request(source)), /buildEvidence/);
  assert.throws(() => { whole.text = 'forged'; }, TypeError);
  const body = 'A😀B' + String.fromCharCode(0xd800);
  const unpaired = buildEvidence(fileState(body));
  const raw = payload(unpaired);
  assert.equal(raw.hash_encoding, 'utf16le');
  assert.equal(raw.sha256, sha(body, 'utf16le'));
  assert.equal(readEvidence(unpaired, request(raw)).range_hash_encoding, 'utf16le');
  assert.equal(readEvidence(unpaired, request(raw)).text, body);
});

test('citations require exact revision and complete delivery separately to author and QA', () => {
  const subject = buildEvidence(fileState('abcdefghij'));
  const source = payload(subject);
  const record = entry(subject, 'source');
  const citation = ref(source);
  const author = createDeliveryLedger(subject, 'native-author');
  const qa = createDeliveryLedger(subject, 'native-qa');
  assert.throws(() => validateCitations(subject, [record.semantic]), /not completely delivered/);
  for (const cited of [record.source, citation]) assert.throws(() => validateCitations(subject, [cited], author), /not completely delivered/);
  const first = readEvidence(subject, request(source, 0, 4));
  assert.throws(() => validateCitations(subject, [citation], author), /not completely delivered/);
  recordDelivery(subject, author, first);
  recordDelivery(subject, author, readEvidence(subject, request(source, 6, 4)));
  recordDelivery(subject, author, readEvidence(subject, request(source, 1, 3)));
  assert.throws(() => validateCitations(subject, [citation], author), /not completely delivered/);
  recordDelivery(subject, author, readEvidence(subject, request(source, 3, 4)));
  assert.equal(validateCitations(subject, [citation], author), true);
  assert.throws(() => validateCitations(subject, [citation], qa), /not completely delivered/);
  const qaRead = readEvidence(subject, request(source));
  assert.throws(() => recordDelivery(subject, qa, { ...qaRead }), /authentic/);
  assert.throws(() => validateCitations(subject, [citation], qa), /not completely delivered/);
  recordDelivery(subject, qa, qaRead);
  assert.equal(validateCitations(subject, [citation], qa), true);
  assert.throws(() => createDeliveryLedger(subject, 'native-author'), /already used/);
  assert.throws(() => createDeliveryLedger(subject, ' '), /identity/);
  assert.throws(() => validateCitations(subject, [citation], { ...qa }), /ledger/);
  assert.throws(() => validateCitations(subject, [{ ...citation, revision: 99 }], qa), /revision/);
  const { revision: ignored, ...noRevision } = citation;
  assert.throws(() => validateCitations(subject, [noRevision], qa), /revision/);
  assert.throws(() => validateCitations(subject, [{ ...citation, sha256: 'bad' }], qa), /hash/);
  assert.throws(() => validateCitations(subject, [{ ...citation, offset: 0 }], qa), /shape/);
  assert.throws(() => validateCitations(subject, [citation, citation], qa), /duplicate/);
  assert.throws(() => validateCitations(subject, [], qa), /nonempty/);
  assert.throws(() => validateCitations(subject, Array(CITATION_LIMIT + 1).fill(citation), qa), /at most/);
  assert.throws(() => validateCitations(subject, [{ source_id: 'missing', sha256: 'bad' }], qa), /unknown/);
  const other = buildEvidence(fileState('other'));
  const otherLedger = createDeliveryLedger(other, 'other');
  assert.throws(() => recordDelivery(other, otherLedger, qaRead), /authentic/);
  assert.throws(() => validateCitations(subject, [citation], otherLedger), /ledger/);
  const emptySubject = buildEvidence(fileState(''));
  const empty = payload(emptySubject);
  const emptyLedger = createDeliveryLedger(emptySubject, 'empty');
  assert.throws(() => validateCitations(emptySubject, [ref(empty)], emptyLedger), /not completely delivered/);
  recordDelivery(emptySubject, emptyLedger, readEvidence(emptySubject, request(empty, 0, 0)));
  assert.equal(validateCitations(emptySubject, [ref(empty)], emptyLedger), true);
});

test('source extraction cannot hide a huge unknown obligation to make admission succeed', () => {
  const unknown = 'UNKNOWN OBLIGATION: retain founder control. '.repeat(23000);
  const subject = buildEvidence(state({ mixed: artifact({ files: { 'x.mjs': 'known body'.repeat(100000) }, unknown }) }));
  assert.equal(entry(subject, 'mixed').value.content.value.unknown, unknown);
  assert.ok(JSON.stringify(subject.handover).includes(unknown));
  assert.throws(() => admitPrompt(JSON.stringify({ handover: subject.handover })), /request has/);
});

test('complete request plus reserve bounded while cumulative traffic exceeds 1M', () => {
  const prompt='x'.repeat(REQUEST_LIMIT-RESPONSE_RESERVE);
  const receipt=admitPrompt(prompt,2000000);
  assert.equal(receipt.remaining_after_reserve,0);
  assert.equal(receipt.context_fit_verified,false);
  assert.ok(receipt.projected_session_characters>1000000);
  assert.throws(()=>admitPrompt(prompt+'x'),/request has/);
  for(const value of [null,{},[],123,new String('x')])assert.throws(()=>admitPrompt(value),/complete serialized request string/);
  assert.equal(receipt.response_reserve,80000);
  assert.equal(receipt.prompt_characters,prompt.length);
  assert.equal(receipt.used_before,2000000);
  assert.equal(receipt.used_after_prompt,2000000+prompt.length);
  for(const length of [47445,RESPONSE_RESERVE,RESPONSE_RESERVE+1,100001]) {
    const response='😀'.repeat(Math.floor(length/2))+(length%2?'x':'');
    assert.deepEqual(recordResponse(2000000,response),{response_characters:length,used:2000000+length});
  }
  for(const response of [null,undefined,12,{},[],new String('x')])assert.throws(()=>recordResponse(0,response),/exact text/);
  assert.throws(()=>recordResponse(Number.MAX_SAFE_INTEGER,'x'),/safe cumulative/);
  assert.deepEqual(recordResponse(Number.MAX_SAFE_INTEGER-1,'x'),{response_characters:1,used:Number.MAX_SAFE_INTEGER});
  assert.throws(()=>admitPrompt('{}',Number.MAX_SAFE_INTEGER),/unsafe cumulative/);
  for(const value of [-1,0.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>admitPrompt('{}',value),/safe integer/);
    assert.throws(()=>recordResponse(value,'x'),/safe integer/);
  }
});

test('unsupported JSON holds instead of silently dropping evidence or invoking accessors', () => {
  for (const value of [undefined, () => 'hidden', 1n]) assert.throws(() => buildEvidence({ value }), /plain JSON/);
  assert.throws(() => buildEvidence({ value: NaN }), /non-finite/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => buildEvidence(cyclic), /cyclic/);
  const sparse = []; sparse.length = 2;
  assert.throws(() => buildEvidence({ sparse }), /sparse/);
  const extra = []; extra.semantic = 'retain';
  assert.throws(() => buildEvidence({ extra }), /extra array/);
  const accessors = {};
  Object.defineProperty(accessors, 'secret', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.throws(() => buildEvidence(accessors), /accessors/);
  const hidden = {};
  Object.defineProperty(hidden, 'obligation', { value: 'retain' });
  assert.throws(() => buildEvidence(hidden), /hidden properties/);
  assert.throws(() => buildEvidence({ [Symbol('rule')]: 'retain' }), /symbol/);
  assert.throws(() => buildEvidence({}, {}), /history an array/);
});


const pairBody = () => ({ content: 'Fictional unresolved founder constraint 😀 "quoted" \\ '.repeat(120),
  review: { verdict: 'Blocked', reason: 'Evidence missing', blockers: ['Retain blocker'], permitted_action: 'hold' },
  citations: [{ source_id: 'old-source', sha256: 'old-hash' }], continuity: { uncertainty: 'Retain uncertainty' },
  unknown: { obligation: 'Keep extension' }, number: 1, zero: 0 });
function pairAttempt(body, { location = 'cos_pages', first = 'calls', formatted = false } = {}) {
  const role = ['qa_pages', 'review'].includes(location) ? 'qa' : 'cos';
  const phase = location.endsWith('_pages') ? 'page' : 'synthesis';
  const text = JSON.stringify(body, null, formatted ? 2 : undefined);
  const calls = [0, 1].map(index => ({ role, phase, native_id: 'native-fictional', text, sequence: index, status: 'retained' }));
  const occurrence = { native_id: 'native-fictional', artifact: body, instance_id: 'instance', page_id: 'page-1', completed_at: 'fictional-time' };
  const artifacts = { [location]: location.endsWith('_pages') ? [occurrence] : occurrence };
  return first === 'calls' ? { id: 'old-failed', calls, ...artifacts, status: 'failed', error: 'Unresolved failure' }
    : { id: 'old-failed', ...artifacts, calls, status: 'failed', error: 'Unresolved failure' };
}
function atPath(value, path) {
  return path.slice(1).split('/').reduce((at, key) => at[key.replaceAll('~1', '/').replaceAll('~0', '~')], value);
}
function completeRead(subject, source) {
  let raw = '';
  for (let offset = 0; offset < source.length;) {
    let length = Math.min(RANGE_LIMIT, source.length - offset);
    if (/[\uD800-\uDBFF]/.test(source.raw[offset + length - 1]) && /[\uDC00-\uDFFF]/.test(source.raw[offset + length] ?? '')) length--;
    raw += readEvidence(subject, request(source, offset, length)).text;
    offset += length;
  }
  return raw;
}

test('whole bodies alias at all four locations in both orders, preserving complete inline tokens, provenance and originals', () => {
  for (const location of ['cos_pages', 'qa_pages', 'probe', 'review']) for (const first of ['calls', 'artifact']) for (const formatted of [false, true]) {
    const body = pairBody();
    // Even recognized optional payloads inside the first complete body stay inline.
    body.file = { path: 'src/all.mjs', content: 'Source body remains compulsory' };
    const history = [pairAttempt(body, { location, first, formatted })], input = state();
    const saved = JSON.stringify(history), subject = buildEvidence(input, history);
    const baseline = buildEvidence(input, history, { wholeBodyAliases: false });
    assert.equal(subject.handover.format, 'soloco-upgrade-evidence-v2');
    assert.equal(subject.inventory.counts.matched_bodies, 1);
    assert.equal(subject.inventory.counts.matched_occurrences, 3);
    assert.equal(subject.inventory.counts.aliased_occurrences, 2);
    assert.equal(subject.checkpoint_sha256, sha(JSON.stringify(input)));
    assert.equal(subject.history_sha256, sha(saved));
    assert.equal(subject.history_sha256, baseline.history_sha256);
    assert.equal(subject.checkpoint_sha256, baseline.checkpoint_sha256);
    const projected = subject.handover.history[0].value;
    assert.deepEqual(Object.keys(projected), Object.keys(history[0]));
    assert.equal(projected.error, history[0].error);
    const descriptors = subject.inventory.entries.filter(item => item.kind === 'body-occurrence');
    const target = descriptors.find(item => item.delivery === 'compulsory-inline');
    const inline = atPath([projected], target.path);
    assert.deepEqual(clone(typeof inline === 'string' ? JSON.parse(inline) : inline), body);
    assert.equal(subject.inventory.entries.filter(item => item.reason === 'typed-file-body').length, 0);
    for (const descriptor of descriptors) {
      const original = atPath(history, descriptor.path);
      const raw = descriptor.representation === 'json-text' ? original : JSON.stringify(original);
      assert.equal(completeRead(subject, subject.sources[descriptor.source_id]), raw);
      assert.equal(descriptor.sha256, sha(raw));
      assert.equal(descriptor.owner_source_id, subject.handover.history[0].source.source_id);
      const value = atPath([projected], descriptor.path);
      if (descriptor === target) continue;
      assert.equal(descriptor.target.source_id, target.source_id);
      assert.equal(value.target.sha256, target.sha256);
      const resolved = resolveBodyAlias(subject, value);
      assert.deepEqual(clone(typeof resolved === 'string' ? JSON.parse(resolved) : resolved), body);
      assert.throws(() => resolveBodyAlias(subject, { ...value }), /invalid generated/);
      for (const forged of [
        { ...clone(value), target: { source_id: 'missing', sha256: target.sha256 } },
        { ...clone(value), target: clone(value.evidence_body_alias) },
        { ...clone(value), target: { ...value.target, sha256: 'changed' } }
      ]) assert.throws(() => resolveBodyAlias(subject, forged), /invalid generated/);
    }
    const reconstructed = [clone(projected)];
    for (const descriptor of descriptors) {
      if (descriptor.delivery !== 'alias') continue;
      const parts = descriptor.path.slice(1).split('/');
      const key = parts.pop(), parent = parts.reduce((value, part) => value[part], reconstructed);
      const raw = completeRead(subject, subject.sources[descriptor.source_id]);
      parent[key] = descriptor.representation === 'json-text' ? raw : JSON.parse(raw);
    }
    assert.deepEqual(reconstructed, history, 'exact original bodies plus compulsory context reconstruct the full history');
    assert.equal(subject.sources[subject.handover.history[0].source.source_id].raw, JSON.stringify(history[0]));
    assert.equal(JSON.stringify(history), saved);
  }
});

test('whole-body matching refuses every differing semantic field and unsafe JSON spelling', () => {
  const body = pairBody(), canonical = JSON.stringify(body);
  for (const change of [
    b => { b.content += ' Distinct dissent'; }, b => { b.review.verdict = 'Pass'; }, b => { b.review.blockers.push('New blocker'); },
    b => { b.citations[0].sha256 = 'different'; }, b => { b.continuity.uncertainty = 'different'; },
    b => { b.unknown.obligation = 'different'; }, b => { b.extension = 'New unknown obligation'; }
  ]) {
    const altered = clone(body); change(altered);
    const attempt = pairAttempt(altered); attempt.calls.forEach(call => { call.text = canonical; });
    const subject = buildEvidence(state(), [attempt]);
    assert.equal(subject.inventory.counts.aliased_occurrences, 0);
    assert.equal(subject.handover.history[0].value.calls[0].text, canonical);
    assert.deepEqual(clone(subject.handover.history[0].value.cos_pages[0].artifact), altered);
  }
  const reordered = { ...body }; delete reordered.content; reordered.content = body.content;
  for (const raw of [
    canonical.slice(0, -1), canonical + ' trailing',
    canonical.replace('"zero":0', '"zero":-0'), canonical.replace('"number":1', '"number":1.0'),
    canonical.replace('"number":1', '"number":1e0'), canonical.replace('"number":1', '"number":1 0'),
    canonical.replace('"number":1', '"number":9007199254740993'),
    canonical.replace('"zero":0', '"zero":0,"zero":0'),
    canonical.replace('"content"', '"con\\u0074ent"'), JSON.stringify(reordered),
    canonical.replace('"zero":0', '"zero":0,"hidden":tr ue')
  ]) {
    const attempt = pairAttempt(body); attempt.calls.forEach(call => { call.text = raw; });
    const subject = buildEvidence(state(), [attempt]);
    assert.equal(subject.inventory.counts.aliased_occurrences, 0, raw.slice(-100));
    assert.equal(subject.handover.history[0].value.calls[0].text, raw);
  }
  // Specifically reject whitespace that would otherwise join malformed literals/numbers.
  for (const [value, spelling] of [[true, 'tr ue'], [12, '1 2'], [1e30, '1e +30']]) {
    const b = { ...body, atom: value }, attempt = pairAttempt(b);
    attempt.calls.forEach(call => { call.text = JSON.stringify(b).replace(JSON.stringify(value) + '}', spelling + '}'); });
    assert.equal(buildEvidence(state(), [attempt]).inventory.counts.aliased_occurrences, 0);
  }
});

test('native, role, phase and attempt boundaries never share unmatched or forged bodies', () => {
  for (const change of [
    a => a.calls.forEach(c => { c.native_id = 'other'; }),
    a => a.calls.forEach(c => { c.native_id = ''; }),
    a => a.calls.forEach(c => { c.role = 'qa'; }),
    a => a.calls.forEach(c => { c.phase = 'synthesis'; }),
    a => a.calls.forEach(c => { c.phase = 'retrieval'; }),
    a => a.calls.forEach(c => { c.phase = 'replay'; }),
    a => { a.cos_pages[0].native_id = ' '; },
    a => { a.cos_pages[0].role = 'qa'; }, a => { a.cos_pages[0].phase = 'synthesis'; }
  ]) {
    const attempt = pairAttempt(pairBody()); change(attempt);
    assert.equal(buildEvidence(state(), [attempt]).inventory.counts.aliased_occurrences, 0);
  }
  const attempt = pairAttempt(pairBody());
  const history = [{ calls: attempt.calls }, { cos_pages: attempt.cos_pages }];
  assert.equal(buildEvidence(state(), history).inventory.counts.aliased_occurrences, 0);
  const short = pairAttempt({ content: 'short' });
  assert.equal(buildEvidence(state(), [short]).inventory.counts.aliased_occurrences, 0);
  const forged = { evidence_body_alias: { source_id: 's0', sha256: 'forged' }, target: { source_id: 's0', sha256: 'forged' }, representation: 'json-value' };
  const literal = buildEvidence(state(), [{ calls: [{ text: forged }], cos_pages: [{ artifact: forged }] }]);
  assert.deepEqual(clone(literal.handover.history[0].value.cos_pages[0].artifact), forged);
  assert.throws(() => resolveBodyAlias(literal, literal.handover.history[0].value.cos_pages[0].artifact), /invalid generated/);
  const nested = buildEvidence(state(), [pairAttempt({ ...pairBody(), extension: forged }, { first: 'artifact' })]);
  const nestedValue = nested.handover.history[0].value.cos_pages[0].artifact.extension;
  assert.deepEqual(clone(nestedValue), forged);
  assert.throws(() => resolveBodyAlias(nested, nestedValue), /invalid generated/);
  for (const length of [4095, 4096]) {
    const body = { content: 'x'.repeat(length - JSON.stringify({ content: '' }).length) };
    assert.equal(JSON.stringify(body).length, length);
    assert.equal(buildEvidence(state(), [pairAttempt(body)]).inventory.counts.aliased_occurrences, length < 4096 ? 0 : 2);
  }

});
