import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEVELOPMENT_FILE_BODIES_PROTOCOL, shareDevelopmentFileBodies, restoreDevelopmentFileBodies, renderDevelopmentReviewContext } from '../plugins/soloco/runtime/development-file-bodies.mjs';
import fs from 'node:fs';
import { compileFunction } from 'node:vm';

const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const assignmentHash = digest('Synthetic unchanged assignment context hash');
const source = (path, content) => ({path, content, sha256:digest(content)});
const plan = sources => ({id:'fixture-plan', kind:'artifact', revision:2, status:'Draft', content:'Synthetic scope', development:{type:'plan', scope:{sources, read_paths:sources.map(file => file.path), write_paths:['changed.mjs'], max_bytes:600000, test:{paths:['test.mjs'], timeout_ms:120000}}, scope_sha256:'synthetic-scope-binding', attempts:['retained-failure']}});
const candidate = files => ({id:'fixture-candidate', kind:'artifact', revision:1, status:'Submitted', content:'Synthetic candidate', development:{type:'candidate', plan_id:'fixture-plan', files, candidate_sha256:digest(JSON.stringify(files)), generation:{format:'files'}, changes:[{path:'changed.mjs', before_sha256:'before', after_sha256:'after'}]}});
const pack = records => ({company_id:'synthetic-company', name:'Synthetic fixture', governance:{rule:'Preserve all evidence'}, charter:{name:'Engineer'}, records, notices:[{summary:'Keep the prior failure'}], messages:[], assignment:{task:'Inspect every scoped source and candidate', model_selection:{mode:'default'}}, supplemental_evidence:{protocol:'record-reads-v1', sources:[]}});
const identity = (record_index, record, collection, file_index, path) => ({record_index, record_id:record.id, record_revision:record.revision, collection, file_index, path});
const roundtrip = value => {
  const original = JSON.stringify(value), shared = shareDevelopmentFileBodies(original, assignmentHash);
  assert.equal(shared.original_sha256, digest(original));
  assert.equal(restoreDevelopmentFileBodies(shared.text, digest(original), assignmentHash), original);
  assert.deepEqual(JSON.parse(restoreDevelopmentFileBodies(shared.text, digest(original), assignmentHash)), value);
  return shared;
};
const tamper = (shared, change) => {
  const wire = JSON.parse(shared.text);
  change(wire);
  assert.throws(() => restoreDevelopmentFileBodies(JSON.stringify(wire), shared.original_sha256, assignmentHash));
};

test('generation and adoption keep complete independent scope/candidate memberships and metadata', () => {
  const frozen = 'export const frozen = 1;\r\n';
  const value = pack([plan([source('frozen.mjs', frozen), source('changed.mjs', 'old\n')]), candidate([{path:'changed.mjs', content:'new\n'}, {path:'frozen.mjs', content:frozen}])]);
  const before = JSON.stringify(value), shared = roundtrip(value), wire = JSON.parse(shared.text);
  assert.equal(JSON.stringify(value), before);
  assert.equal(shared.geometry.shared_body_count, 1);
  assert.equal(shared.geometry.alias_count, 1);
  assert.deepEqual(wire.file_body_aliases, [{alias_id:0, occurrence:identity(1, value.records[1], 'candidate-file', 1, 'frozen.mjs'), target:identity(0, value.records[0], 'scope-source', 0, 'frozen.mjs'), sha256:digest(frozen), utf8_bytes:Buffer.byteLength(frozen), utf16_characters:frozen.length}]);
  assert.equal(wire.context.records[0].development.scope.sources[0].content, frozen);
  assert.deepEqual(wire.context.records[1].development.files[1].content, {file_body_alias_v1:0});
  assert.deepEqual(wire.context.records[0].development.scope.sources.map(file => file.path), ['frozen.mjs', 'changed.mjs']);
  assert.deepEqual(wire.context.records[1].development.files.map(file => file.path), ['changed.mjs', 'frozen.mjs']);
  assert.equal(wire.context.records[0].development.scope.sources[0].sha256, digest(frozen));
  assert.deepEqual(wire.context.records[0].development.attempts, ['retained-failure']);
  assert.deepEqual(wire.context.records[1].development.changes, value.records[1].development.changes);
  assert.equal(wire.context.records[1].development.candidate_sha256, value.records[1].development.candidate_sha256);
  assert.equal(shareDevelopmentFileBodies(before, assignmentHash).text, shared.text);
});

test('QA retains the full receipt, authority, failures, paths and hashes while sharing only exact bodies', () => {
  const body = 'export const value = "你好😀";\n';
  const p = plan([source('a.mjs', body)]);
  p.development.authorization = {authority_sha256:'retained-authority', source_instruction:'Synthetic permission'};
  const receipt = {id:'fixture-receipt', kind:'artifact', development:{type:'test', candidate_id:'fixture-candidate', result:{status:'passed', stdout:'Synthetic runtime receipt'}, validation_manifest:{files:[{path:'a.mjs', content:{body_ref:0}}]}}};
  const review = pack([p, receipt, candidate([{path:'a.mjs', content:body}])]);
  review.charter.name = 'Independent QA';
  const shared = roundtrip(review), wire = JSON.parse(shared.text);
  assert.deepEqual(wire.context.records[1], receipt);
  assert.deepEqual(wire.context.records[0].development.authorization, p.development.authorization);
  assert.equal(wire.file_body_aliases[0].occurrence.record_index, 2);
  assert.equal(wire.file_body_aliases[0].target.record_index, 0);
  assert.equal(wire.protocol, DEVELOPMENT_FILE_BODIES_PROTOCOL);
  assert.equal(wire.assignment_context_sha256, assignmentHash);
  assert.equal(wire.canonical_context_sha256, shared.original_sha256);
  // This raw text binding is separate from the runtime's canonical context hash.
  assert.notEqual(shared.original_sha256, digest(JSON.stringify({...review, name:undefined})));
});

test('only closed typed top-level artifact file slots can be references; lookalikes stay data', () => {
  const body = '{"file_body_alias_v1":0}\n';
  const lookalikes = [{file_body_alias_v1:0}, {protocol:DEVELOPMENT_FILE_BODIES_PROTOCOL, file_body_aliases:[]}, {kind:'artifact', development:{type:'candidate', files:[{path:'nested', content:{file_body_alias_v1:999}}]}}];
  const value = pack([plan([source('a.mjs', body)]), candidate([{path:'b.mjs', content:body}]), {kind:'decision', development:{type:'candidate', files:[{path:'user-data', content:{body_ref:123}}]}}]);
  value.notices.push({data:lookalikes});
  value.assignment.data = {development:{scope:{sources:[{content:{body_ref:0}}]}, files:[{content:{body_ref:1}}]}};
  value.records[0].development.scope.fixture_data = {body_ref:0};
  const shared = roundtrip(value), wire = JSON.parse(shared.text);
  assert.deepEqual(wire.context.notices[1].data, lookalikes);
  assert.deepEqual(wire.context.assignment.data, value.assignment.data);
  assert.deepEqual(wire.context.records[2], value.records[2]);
  assert.equal(wire.context.records[0].development.scope.sources[0].content, body);
  tamper(shared, w => { w.file_body_aliases[0].occurrence.record_index = 2; });
});

test('Unicode, UTF16 positions, escaping and empty bodies round-trip without normalization', () => {
  const bodies = ['', '😀你好\r\n"\\\t\u0001\u2028\u2029', 'é\n', 'e\u0301\n', 'a\r\n', 'a\n'];
  const value = pack([plan(bodies.map((body, i) => source(`a${i}.mjs`, body))), candidate(bodies.map((content, i) => ({path:`a${i}.mjs`, content})))]);
  const original = JSON.stringify(value), shared = roundtrip(value), wire = JSON.parse(shared.text);
  assert.equal(wire.file_body_aliases.length, bodies.length);
  assert.deepEqual(wire.context.records[0].development.scope.sources.map(file => file.content), bodies);
  assert.equal(shared.geometry.original_utf8_bytes, Buffer.byteLength(original));
  assert.equal(shared.geometry.original_utf16_characters, original.length);
  assert.equal(shared.geometry.wire_utf8_bytes, Buffer.byteLength(shared.text));
  assert.equal(shared.geometry.wire_utf16_characters, shared.text.length);
  assert.ok(shared.geometry.original_utf8_bytes > shared.geometry.original_utf16_characters);
  assert.equal(wire.file_body_aliases[1].utf16_characters, bodies[1].length);
  assert.equal(wire.file_body_aliases[1].utf8_bytes, Buffer.byteLength(bodies[1]));
  assert.notEqual(wire.file_body_aliases[2].sha256, wire.file_body_aliases[3].sha256);
});

test('preserves JSON property order, file order and duplicate bodies across differently named paths', () => {
  const first = {sha256:digest('same'), content:'same', path:'z.mjs'};
  const second = {content:'same', path:'a.mjs'};
  const value = {records:[plan([first]), candidate([second])], name:'last'};
  const shared = roundtrip(value), restored = JSON.parse(restoreDevelopmentFileBodies(shared.text, shared.original_sha256, assignmentHash));
  assert.deepEqual(Object.keys(restored), ['records', 'name']);
  assert.deepEqual(Object.keys(restored.records[0].development.scope.sources[0]), ['sha256', 'content', 'path']);
  assert.deepEqual(Object.keys(restored.records[1].development.files[0]), ['content', 'path']);
  assert.equal(JSON.parse(shared.text).file_body_aliases[0].target.path, 'z.mjs');
});

test('malformed original JSON and malformed typed files fail rather than clip, coerce or reinterpret', () => {
  const good = JSON.stringify(pack([plan([source('a', 'text')])]));
  for (const input of [null, {}, '', '{', ' ' + good, good + '\n', '{"records":[],"records":[]}', '{"records":[],"number":-0}']) assert.throws(() => shareDevelopmentFileBodies(input, assignmentHash));
  const malformed = [
    {}, {records:null}, {records:[{kind:'artifact', development:{type:'plan'}}]},
    pack([candidate(null)]), pack([candidate([{path:'a', content:{body_ref:0}}])]),
    pack([candidate([{path:'a', content:'x', extra:true}])]),
    pack([candidate([{path:'a', content:'x'}, {path:'a', content:'y'}])]),
    pack([plan([{path:'a', content:'x', sha256:digest('y')}])]),
    pack([plan([{path:'a', content:'x'}])]),
    ...['\ud800', '\udc00', 'a\0b'].map(content => pack([candidate([{path:'a', content}])]))
  ];
  for (const value of malformed) assert.throws(() => shareDevelopmentFileBodies(JSON.stringify(value), assignmentHash));
});

test('no duplicate bodies remain inline and never confuse unsupported development types with aliases', () => {
  const value = pack([plan([source('a', 'unique')]), candidate([{path:'a', content:'different'}]), {kind:'artifact', development:{type:'user-data', files:[{content:{body_ref:0}}]}}]);
  const shared = roundtrip(value), wire = JSON.parse(shared.text);
  assert.deepEqual(wire.file_body_aliases, []);
  assert.deepEqual(wire.context, value);
  // Small or unique contexts may grow; this leaf makes no fit/admission choice.
  assert.ok(shared.geometry.wire_utf16_characters > shared.geometry.original_utf16_characters);
});

test('rejects dangling, duplicate, ambiguous, fractional and noncanonical references', () => {
  const shared = roundtrip(pack([plan([source('a', 'same'), source('b', 'same')]), candidate([{path:'a', content:'same'}])]));
  const cases = [
    w => { w.file_body_aliases.pop(); },
    w => { w.file_body_aliases.push({...w.file_body_aliases[0]}); },
    w => { w.file_body_aliases[0].occurrence.record_index = 999; },
    w => { w.file_body_aliases[0].occurrence.file_index = 0.5; },
    w => { w.file_body_aliases[0].alias_id = 1; },
    w => { w.file_body_aliases[0].extra = true; },
    w => { w.context.records[0].development.scope.sources[1].content = {file_body_alias_v1:0, content:'same'}; },
    ...[-1, 0.5, '0', 999].map(value => w => { w.context.records[0].development.scope.sources[1].content.file_body_alias_v1 = value; }),
    w => { w.file_body_aliases.reverse(); },
    w => { w.context.records[0].development.scope.sources[1].content = 'same'; w.file_body_aliases.shift(); w.file_body_aliases[0].alias_id = 0; w.context.records[1].development.files[0].content.file_body_alias_v1 = 0; }
  ];
  for (const change of cases) tamper(shared, change);
});

test('requires external original/assignment bindings and rejects body, metadata and envelope tampering', () => {
  const shared = roundtrip(pack([plan([source('a', 'same')]), candidate([{path:'a', content:'same'}])]));
  for (const expected of [undefined, '', 'x'.repeat(64), '0'.repeat(64)]) assert.throws(() => restoreDevelopmentFileBodies(shared.text, expected, assignmentHash));
  for (const expected of [undefined, '', shared.original_sha256]) assert.throws(() => restoreDevelopmentFileBodies(shared.text, shared.original_sha256, expected));
  assert.throws(() => shareDevelopmentFileBodies(JSON.stringify({records:[]})));
  const cases = [
    w => { w.canonical_context_sha256 = '0'.repeat(64); },
    w => { w.assignment_context_sha256 = '0'.repeat(64); },
    w => { w.canonical_context_utf8_bytes++; },
    w => { w.canonical_context_utf16_characters++; },
    w => { w.protocol = 'unknown'; },
    w => { w.extra = true; },
    w => { w.context.records[0].development.scope.sources[0].content = 'changed'; },
    w => { w.file_body_aliases[0].sha256 = '0'.repeat(64); },
    w => { w.file_body_aliases[0].utf8_bytes++; },
    w => { w.file_body_aliases[0].utf16_characters++; },
    w => { w.context.records[0].development.scope.sources[0].path = 'other'; },
    w => { w.context.records[0].development.scope.sources[0].sha256 = digest('changed'); },
    w => { w.context.records[0].development.attempts = []; },
    w => { w.context.records.reverse(); },
    w => { w.context.governance.rule = 'weakened'; }
  ];
  for (const change of cases) tamper(shared, change);
  assert.throws(() => restoreDevelopmentFileBodies(' ' + shared.text, shared.original_sha256, assignmentHash));
});

test('sanitized eleven-body frozen geometry preserves every byte and measures wire chars separately', () => {
  // Synthetic source strings, not company exports. The repeated raw body total
  // models the measured geometry; it does not predict an actual future prompt.
  const total = 383837, base = Math.floor(total / 11), remainder = total % 11;
  const bodies = Array.from({length:11}, (_, i) => {
    const prefix = `// Synthetic frozen source ${i}\nexport const frozen = "`, suffix = '";\n';
    return prefix + 'x'.repeat(base + (i < remainder ? 1 : 0) - prefix.length - suffix.length) + suffix;
  });
  assert.equal(bodies.reduce((n, body) => n + Buffer.byteLength(body), 0), total);
  const value = pack([plan(bodies.map((body, i) => source(`frozen-${i}.mjs`, body))), candidate(bodies.map((content, i) => ({path:`frozen-${i}.mjs`, content})))]);
  const original = JSON.stringify(value), shared = roundtrip(value), wire = JSON.parse(shared.text);
  assert.equal(shared.geometry.shared_body_count, 11);
  assert.equal(shared.geometry.alias_count, 11);
  assert.equal(shared.geometry.eliminated_body_utf8_bytes, total);
  assert.ok(original.length - shared.text.length > 375000);
  assert.deepEqual(wire.context.records[0].development.scope.sources.map(file => file.content), bodies);
  const restored = JSON.parse(restoreDevelopmentFileBodies(shared.text, shared.original_sha256, assignmentHash));
  assert.deepEqual(restored.records[0].development.scope.sources.map(file => file.sha256), bodies.map(digest));
  assert.deepEqual(restored.records[1].development.files.map(file => file.content), bodies);
});

test('later repeats directly target the first literal; chains, cycles and forward targets reject', () => {
  const p = plan([source('first', 'same'), source('second', 'same'), source('unique', 'unique')]);
  const c = candidate([{path:'third', content:'same'}, {path:'fourth', content:'same'}]);
  const shared = roundtrip(pack([p, c])), wire = JSON.parse(shared.text);
  assert.equal(wire.context.records[0].development.scope.sources[0].content, 'same');
  assert.equal(wire.context.records[0].development.scope.sources[2].content, 'unique');
  for (const alias of wire.file_body_aliases) assert.deepEqual(alias.target, identity(0, p, 'scope-source', 0, 'first'));
  tamper(shared, w => { w.file_body_aliases[1].target = {...w.file_body_aliases[0].occurrence}; });
  tamper(shared, w => { w.file_body_aliases[0].target = {...w.file_body_aliases[1].occurrence}; });
  tamper(shared, w => { w.file_body_aliases[0].target = {...w.file_body_aliases[0].occurrence}; });
  tamper(shared, w => { w.file_body_aliases[1].target = {...w.file_body_aliases[2].occurrence}; w.file_body_aliases[2].target = {...w.file_body_aliases[1].occurrence}; });
});

test('record/revision, collection, index and path bindings are closed and exact; prototype-like data stays inert', () => {
  const value = pack([plan([source('a', 'same')]), candidate([{path:'b', content:'same'}])]);
  value.assignment.data = JSON.parse('{"__proto__":{"file_body_alias_v1":0},"constructor":{"prototype":{"file_body_alias_v1":1}}}');
  const shared = roundtrip(value);
  for (const endpoint of ['occurrence', 'target']) {
    for (const [field, replacement] of [['record_id', 'wrong'], ['record_revision', 999], ['collection', 'files'], ['file_index', 999], ['path', 'wrong']]) tamper(shared, w => { w.file_body_aliases[0][endpoint][field] = replacement; });
    tamper(shared, w => { w.file_body_aliases[0][endpoint].extra = true; });
  }
  const duplicate = pack([plan([source('a', 'same')]), candidate([{path:'a', content:'same'}])]);
  duplicate.records.push({...duplicate.records[0]});
  assert.throws(() => shareDevelopmentFileBodies(JSON.stringify(duplicate), assignmentHash));
  for (const field of ['id', 'revision']) {
    const malformed = pack([plan([source('a', 'same')])]);
    delete malformed.records[0][field];
    assert.throws(() => shareDevelopmentFileBodies(JSON.stringify(malformed), assignmentHash));
  }
});

const qaFixture = (body = 'export const body = "frozen";\n'.repeat(1000)) => {
  const p = plan([source('a.mjs', body)]), c = candidate([{path:'a.mjs', content:body}]);
  p.development.scope_sha256 = digest(JSON.stringify(p.development.scope));
  c.development.scope_sha256 = p.development.scope_sha256;
  const result = {status:'failed', tests_executed:false, synthetic_fixture_only:true, stdout:'Keep this complete negative receipt'};
  const receipt = {id:'fixture-receipt', kind:'artifact', author_role:'runtime', author_instance:'fixture-controller', revision:1, content:JSON.stringify(result), development:{type:'test', plan_id:p.id, candidate_id:c.id, candidate_sha256:c.development.candidate_sha256, result, receipt_sha256:digest(JSON.stringify(result)), validation_manifest:{files:[{path:'a.mjs', content:{file_body_alias_v1:0}}]}}};
  const value = pack([p, receipt, c]), reviewOf = {id:receipt.id, revision:receipt.revision};
  return {value, p, c, receipt, reviewOf, job:{role:'qa', context_format:3, review_of:reviewOf}};
};

test('QA renderer selects only the exact test/candidate/plan pair and preserves failed receipt and context objects', () => {
  const {value, p, receipt, reviewOf, job} = qaFixture();
  const unrelated = candidate([{path:'unrelated', content:p.development.scope.sources[0].content}]);
  unrelated.id = 'unrelated-candidate';
  value.records.unshift(unrelated);
  const context = {text:JSON.stringify(value), hash:assignmentHash, inputs:value.records.map(r => ({id:r.id, revision:r.revision}))};
  const before = JSON.stringify({context, job}), rendered = renderDevelopmentReviewContext(context, job), wire = JSON.parse(rendered);
  assert.notEqual(rendered, context.text);
  assert.equal(wire.file_body_aliases.length, 1);
  assert.equal(wire.file_body_aliases[0].target.record_id, p.id);
  assert.equal(wire.context.records[0].development.files[0].content, unrelated.development.files[0].content);
  assert.deepEqual(wire.context.records[2], receipt);
  assert.equal(restoreDevelopmentFileBodies(rendered, digest(context.text), context.hash, reviewOf), context.text);
  assert.equal(JSON.stringify({context, job}), before);
});

test('QA rendering respects record order when the candidate literal precedes its original source', () => {
  const {value, c, reviewOf, job} = qaFixture();
  value.records = [value.records[2], value.records[1], value.records[0]];
  const context = {text:JSON.stringify(value), hash:assignmentHash}, rendered = renderDevelopmentReviewContext(context, job), wire = JSON.parse(rendered);
  assert.equal(wire.file_body_aliases[0].target.record_id, c.id);
  assert.equal(wire.file_body_aliases[0].target.record_index, 0);
  assert.equal(wire.file_body_aliases[0].occurrence.record_index, 2);
  assert.equal(restoreDevelopmentFileBodies(rendered, digest(context.text), context.hash, reviewOf), context.text);
});

test('non-development/non-QA and special paths stay byte-identical; unique or tiny QA bodies stay canonical', () => {
  const fixture = qaFixture(), context = {text:JSON.stringify(fixture.value), hash:assignmentHash};
  for (const job of [{role:'engineer'}, {role:'qa'}, {...fixture.job, development_id:'generation'}, {...fixture.job, prototype_id:'prototype'}, ...[4, 6, 7].map(context_format => ({...fixture.job, context_format}))]) assert.equal(renderDevelopmentReviewContext(context, job), context.text);
  for (const field of ['qualification', 'qualification_evidence', 'operating_evidence', 'handover_evidence', 'stream']) assert.equal(renderDevelopmentReviewContext({...context, [field]:true}, fixture.job), context.text);
  assert.equal(renderDevelopmentReviewContext({text:'opaque special text', qualification:true}, fixture.job), 'opaque special text');
  assert.equal(renderDevelopmentReviewContext(context, {...fixture.job, review_of:{id:'fixture-plan', revision:2}}), context.text);
  const unique = qaFixture();
  unique.c.development.files[0].content = 'different body';
  unique.c.development.candidate_sha256 = digest(JSON.stringify(unique.c.development.files));
  unique.receipt.development.candidate_sha256 = unique.c.development.candidate_sha256;
  const uniqueText = JSON.stringify(unique.value);
  assert.equal(renderDevelopmentReviewContext({text:uniqueText, hash:assignmentHash}, unique.job), uniqueText);
  const tiny = qaFixture(''), tinyText = JSON.stringify(tiny.value);
  assert.equal(renderDevelopmentReviewContext({text:tinyText, hash:assignmentHash}, tiny.job), tinyText);
});

// V2 deliberately changes the old renderer throw expectation for a missing,
// ambiguous or wrong-revision target. Strict leaf rejection remains required;
// an applicable target with broken candidate/plan evidence still fails closed.
test('nonapplicable reviewed targets retain exact original presentation without activating aliases', () => {
  const changes = [
    f => { f.value.records.push({...f.receipt}); },
    f => { f.value.records = f.value.records.filter(r => r !== f.receipt); },
    f => { f.job.review_of = {...f.reviewOf, revision:2}; },
    f => { f.receipt.kind = 'decision'; },
    f => { f.receipt.author_role = 'engineer'; },
    f => { delete f.receipt.author_role; },
    f => { f.receipt.development.type = 'other'; },
    f => { f.job.review_of = {...f.reviewOf, extra:true}; },
    f => { f.job.review_of = {...f.reviewOf, revision:0}; },
    f => { f.job.review_of = {id:f.p.id, revision:f.p.revision}; }
  ];
  for (const [index, change] of changes.entries()) {
    const fixture = qaFixture();
    change(fixture);
    const text = JSON.stringify(fixture.value), before = JSON.stringify({value:fixture.value, job:fixture.job});
    assert.equal(renderDevelopmentReviewContext({text, hash:assignmentHash}, fixture.job), text);
    assert.equal(JSON.stringify({value:fixture.value, job:fixture.job}), before);
    // Preserve the original first three negative purposes at the strict codec
    // boundary; optional renderer fallback does not make these valid frames.
    if (index < 3) assert.throws(() => shareDevelopmentFileBodies(text, assignmentHash, fixture.job.review_of));
  }
  const fixture = qaFixture(), good = JSON.stringify(fixture.value);
  for (const text of [
    'opaque noncanonical context', ' ' + good, JSON.stringify([]),
    JSON.stringify({records:fixture.value.records}),
    JSON.stringify({protocol:'other-context', ...fixture.value}),
    JSON.stringify({...fixture.value, charter:null}),
    JSON.stringify({...fixture.value, notices:null}),
    JSON.stringify({...fixture.value, messages:null})
  ]) assert.equal(renderDevelopmentReviewContext({text, hash:assignmentHash}, fixture.job), text);
});

test('applicable QA targets reject missing, duplicate, malformed or changed candidate and plan evidence', () => {
  const changes = [
    f => { f.value.records = f.value.records.filter(r => r !== f.c); },
    f => { f.value.records = f.value.records.filter(r => r !== f.p); },
    f => { f.c.development.plan_id = 'wrong'; },
    f => { f.receipt.development.candidate_sha256 = '0'.repeat(64); },
    f => { f.c.development.scope_sha256 = '0'.repeat(64); },
    f => { f.value.records.push({...f.c}); },
    f => { f.value.records.push({...f.p}); },
    f => { f.c.kind = 'decision'; },
    f => { f.p.development.type = 'other'; },
    f => { delete f.receipt.development.candidate_id; },
    f => { delete f.receipt.development.plan_id; },
    f => { f.c.development.files[0].content = 'substituted candidate body'; },
    f => { f.c.development.files[0].path = 'substituted-path'; },
    f => { f.p.development.scope.max_bytes++; },
    f => { f.p.development.scope.sources[0].sha256 = '0'.repeat(64); },
    f => { f.c.development.files[0].content = {file_body_alias_v1:0}; }
  ];
  for (const change of changes) {
    const fixture = qaFixture();
    change(fixture);
    const context = {text:JSON.stringify(fixture.value), hash:assignmentHash};
    const before = JSON.stringify({context, job:fixture.job, value:fixture.value});
    assert.throws(() => renderDevelopmentReviewContext(context, fixture.job));
    assert.equal(JSON.stringify({context, job:fixture.job, value:fixture.value}), before);
  }
});

test('review-bound leaf transport still rejects absent, changed and nonclosed review bindings', () => {
  const fixture = qaFixture(), text = JSON.stringify(fixture.value);
  const shared = shareDevelopmentFileBodies(text, assignmentHash, fixture.reviewOf);
  assert.throws(() => restoreDevelopmentFileBodies(shared.text, shared.original_sha256, assignmentHash));
  const changed = JSON.parse(shared.text);
  changed.review_of.revision++;
  assert.throws(() => restoreDevelopmentFileBodies(JSON.stringify(changed), shared.original_sha256, assignmentHash, fixture.reviewOf));
  assert.throws(() => shareDevelopmentFileBodies(text, assignmentHash, {...fixture.reviewOf, extra:true}));
  assert.equal(restoreDevelopmentFileBodies(shared.text, shared.original_sha256, assignmentHash, fixture.reviewOf), text);
});

// Execute the actual candidate worker's prompt-assembly statements, read directly
// from its declared source file. Only unrelated prompt helpers are inert inputs.
// This neither imports the worker graph nor exercises Store, model invocation,
// process lifecycle, currentness enforcement, publication or acceptance.
const workerPromptAssembly = (() => {
  const url = new URL('../plugins/soloco/runtime/worker.mjs', import.meta.url);
  const sourceText = fs.readFileSync(url, 'utf8');
  const startMarker = '    const charter=state.roles[job.role];';
  const endMarker = "    const dir=path.join(dataDir(),'sessions',job.instance_id);";
  const start = sourceText.indexOf(startMarker), end = sourceText.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'the actual worker prompt seam must exist');
  assert.equal(sourceText.indexOf(startMarker, start + startMarker.length), -1);
  assert.equal(sourceText.indexOf(endMarker, end + endMarker.length), -1);
  const fragment = sourceText.slice(start, end);
  assert.ok(fragment.includes('const assignmentPromptText=renderDevelopmentReviewContext(context,job);'));
  assert.ok(fragment.indexOf('const assignmentPromptText=') < fragment.indexOf('const prompt='));
  assert.ok(sourceText.indexOf('      output=await model(', end) > end, 'this source seam precedes the existing model call');
  return compileFunction(fragment + '\nreturn {prompt, assignmentPromptText, fileBodySharingInstruction, reviewShape};\n',
    ['state', 'job', 'context', 'renderDevelopmentReviewContext', 'digest', 'prototypePrompt', 'developmentPrompt'],
    {filename:url.href + '#focused-prompt-assembly'});
})();

function sourceProbe(fixture, contextOverrides = {}, jobOverrides = {}) {
  const context = {text:JSON.stringify(fixture.value), hash:assignmentHash, inputs:fixture.value.records.map(r => ({id:r.id, revision:r.revision})), ...contextOverrides};
  const job = {...fixture.job, instance_id:'fixture-source-seam-instance', task:'Exact source-bound prompt assignment', ...jobOverrides};
  const state = {roles:{qa:{name:'Independent QA'}, engineer:{name:'Software Engineer'}}, records:Object.fromEntries(fixture.value.records.map(r => [r.id, r]))};
  const calls = [], before = JSON.stringify({context, job, state});
  const invoke = () => workerPromptAssembly(state, job, context, renderDevelopmentReviewContext, digest,
    (...args) => { calls.push({name:'prototype', args}); return 'INERT_PROTOTYPE_PROMPT'; },
    (...args) => { calls.push({name:'development', args}); return 'INERT_DEVELOPMENT_PROMPT'; });
  return {context, job, state, calls, before, invoke};
}
const assertProbeUnchanged = probe => assert.equal(JSON.stringify({context:probe.context, job:probe.job, state:probe.state}), probe.before);

test('actual worker assembly explains distinct hashes and delivers the exact complete failed-evidence pack', () => {
  const fixture = qaFixture();
  const priorNegative = {id:'fixture-prior-negative', kind:'review', revision:1, content:'Preserve the earlier failure', review:{verdict:'Fail', reason:'Synthetic retained negative evidence', blockers:['Retained fixture limitation']}};
  fixture.value.records.push(priorNegative);
  // This synthetic bounded assignment uses the existing name-omission formula;
  // it supplies no claim that a real company assignment was constructed here.
  const semanticHash = digest(JSON.stringify({...fixture.value, name:undefined}));
  const probe = sourceProbe(fixture, {hash:semanticHash}), rendered = probe.invoke();
  const wire = JSON.parse(rendered.assignmentPromptText), rawHash = digest(probe.context.text);
  assert.notEqual(rawHash, semanticHash);
  assert.equal(wire.protocol, DEVELOPMENT_FILE_BODIES_PROTOCOL);
  assert.equal(wire.canonical_context_sha256, rawHash);
  assert.equal(wire.assignment_context_sha256, semanticHash);
  assert.equal(wire.context.records[0].development.scope.sources[0].content, fixture.p.development.scope.sources[0].content);
  assert.deepEqual(wire.context.records[2].development.files[0].content, {file_body_alias_v1:0});
  const restored = restoreDevelopmentFileBodies(rendered.assignmentPromptText, rawHash, semanticHash, fixture.reviewOf);
  assert.equal(restored, probe.context.text);
  assert.deepEqual(JSON.parse(restored), fixture.value);
  assert.deepEqual(wire.context.records.find(r => r.id === fixture.receipt.id), fixture.receipt);
  assert.deepEqual(wire.context.records.find(r => r.id === priorNegative.id), priorNegative);
  assert.equal(wire.context.records.find(r => r.id === fixture.receipt.id).development.result.status, 'failed');
  assert.equal(wire.context.records.find(r => r.id === fixture.receipt.id).development.result.tests_executed, false);
  assert.match(rendered.fileBodySharingInstruction, /canonical_context_sha256 is the SHA256 digest of the EXACT original JSON\.stringify text/);
  assert.match(rendered.fileBodySharingInstruction, /assignment_context_sha256 is the unchanged semantic assignment hash, which may omit name/);
  assert.match(rendered.fileBodySharingInstruction, /These are distinct supplied commitments, not model-performed recomputation/);
  assert.match(rendered.fileBodySharingInstruction, /Review every unique whole body, every source and candidate membership, and the complete receipt and evidence/);
  assert.ok(rendered.prompt.includes('Assignment context: ' + rendered.fileBodySharingInstruction + rendered.assignmentPromptText + '\nThe pack contains pinned governance'));
  assert.ok(rendered.prompt.includes(probe.job.task));
  assert.match(rendered.prompt, /Never invent customer evidence, authorization, qualifications, test execution, or a gate Pass/);
  assert.match(rendered.prompt, /never to company execution authority/);
  assert.equal(rendered.reviewShape.candidate_sha256, fixture.c.development.candidate_sha256);
  assert.equal(rendered.reviewShape.receipt_sha256, fixture.receipt.development.receipt_sha256);
  assert.deepEqual(probe.calls.map(call => call.name), ['prototype', 'development']);
  for (const {args} of probe.calls) {
    assert.equal(args[0], probe.state);
    assert.equal(args[1], probe.job);
    assert.equal(args[2], fixture.receipt);
  }
  assert.throws(() => restoreDevelopmentFileBodies(rendered.assignmentPromptText, semanticHash, semanticHash, fixture.reviewOf));
  assert.throws(() => restoreDevelopmentFileBodies(rendered.assignmentPromptText, rawHash, rawHash, fixture.reviewOf));
  assertProbeUnchanged(probe);
});

test('actual worker assembly preserves nonapplicable target and special-path presentation', () => {
  const changes = [
    f => { f.value.records = f.value.records.filter(r => r !== f.receipt); },
    f => { f.value.records.push({...f.receipt}); },
    f => { f.job.review_of = {...f.reviewOf, revision:2}; },
    f => { f.receipt.kind = 'decision'; },
    f => { f.receipt.author_role = 'engineer'; },
    f => { f.receipt.development.type = 'other'; },
    f => { f.job.review_of = {id:f.p.id, revision:f.p.revision}; },
    f => { f.job.role = 'engineer'; },
    f => { f.job.development_id = f.p.id; },
    f => { f.job.prototype_id = 'fixture-prototype'; },
    ...[4, 6, 7, 8].map(format => f => { f.job.context_format = format; })
  ];
  for (const change of changes) {
    const fixture = qaFixture();
    change(fixture);
    const probe = sourceProbe(fixture), rendered = probe.invoke();
    assert.equal(rendered.assignmentPromptText, probe.context.text);
    assert.equal(rendered.fileBodySharingInstruction, '');
    assert.ok(rendered.prompt.includes('Assignment context: ' + probe.context.text + '\nThe pack contains pinned governance'));
    assert.doesNotMatch(rendered.prompt, /Lossless development QA transport/);
    assertProbeUnchanged(probe);
  }
  for (const field of ['qualification', 'qualification_evidence', 'operating_evidence', 'handover_evidence', 'stream']) {
    const probe = sourceProbe(qaFixture(), {[field]:true, text:'Opaque special assignment text'}), rendered = probe.invoke();
    assert.equal(rendered.assignmentPromptText, probe.context.text);
    assert.equal(rendered.fileBodySharingInstruction, '');
    assert.doesNotMatch(rendered.prompt, /Lossless development QA transport/);
    if (['qualification', 'qualification_evidence', 'operating_evidence'].includes(field)) {
      assert.equal(rendered.prompt, probe.context.text);
      assert.equal(probe.calls.length, 0);
    } else assert.ok(rendered.prompt.includes('Assignment context: ' + probe.context.text + '\nThe pack contains pinned governance'));
    assertProbeUnchanged(probe);
  }
});

test('actual worker assembly propagates active transport failures before later prompt helpers', () => {
  const changes = [
    f => { f.value.records = f.value.records.filter(r => r !== f.c); },
    f => { f.value.records = f.value.records.filter(r => r !== f.p); },
    f => { f.value.records.push({...f.c}); },
    f => { f.c.development.files[0].content = 'substituted body'; },
    f => { f.p.development.scope.max_bytes++; },
    f => { f.receipt.development.candidate_sha256 = '0'.repeat(64); }
  ];
  for (const change of changes) {
    const fixture = qaFixture();
    change(fixture);
    const probe = sourceProbe(fixture);
    assert.throws(probe.invoke, /Invalid development file body sharing/);
    assert.equal(probe.calls.length, 0, 'the actual assembly stops at its renderer call');
    assertProbeUnchanged(probe);
  }
});

test('actual worker assembly adds no transport explanation when sharing has no presentation benefit', () => {
  const unique = qaFixture();
  unique.c.development.files[0].content = 'different complete candidate body';
  unique.c.development.candidate_sha256 = digest(JSON.stringify(unique.c.development.files));
  unique.receipt.development.candidate_sha256 = unique.c.development.candidate_sha256;
  for (const fixture of [unique, qaFixture('')]) {
    const probe = sourceProbe(fixture), rendered = probe.invoke();
    assert.equal(rendered.assignmentPromptText, probe.context.text);
    assert.equal(rendered.fileBodySharingInstruction, '');
    assert.ok(rendered.prompt.includes('Assignment context: ' + probe.context.text + '\nThe pack contains pinned governance'));
    assert.doesNotMatch(rendered.prompt, /Lossless development QA transport/);
    assertProbeUnchanged(probe);
  }
});
