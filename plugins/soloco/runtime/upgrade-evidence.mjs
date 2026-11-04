import { createHash } from 'node:crypto';

export const REQUEST_LIMIT = 900000;
export const PAGE_TARGET = 120000;
export const RESPONSE_LIMIT = 40000;
export const RANGE_LIMIT = 32768;
export const CITATION_LIMIT = 128;

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const subjects = new WeakMap();
const issuedReads = new WeakMap();
const deliveryLedgers = new WeakMap();
const collectionKinds = { records: 'record', jobs: 'job', notices: 'notice', messages: 'message' };
const runtimeTypes = new Set(['plan', 'candidate', 'result', 'development', 'prototype', 'test']);

function hold(message) {
  throw new Error(`Evidence hold: ${message}`);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Accept plain JSON data without silently omitting values or calling getters.
function serialize(value) {
  const active = new Set();
  function encode(item, depth) {
    if (depth > 256) hold('JSON nesting exceeds the supported depth of 256');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) hold('non-finite number is not supported JSON evidence');
      return JSON.stringify(item);
    }
    if (!Array.isArray(item) && !object(item)) hold('evidence must contain only plain JSON data');
    if (active.has(item)) hold('cyclic evidence is not supported');
    const keys = Reflect.ownKeys(item);
    for (const key of keys) {
      if (typeof key !== 'string') hold('symbol properties are not supported JSON evidence');
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor.enumerable || !own(descriptor, 'value')) hold('accessors or hidden properties are not supported');
    }
    active.add(item);
    let result;
    if (Array.isArray(item)) {
      if (keys.length !== item.length + 1) hold('sparse arrays or extra array properties are not supported');
      const parts = [];
      for (let index = 0; index < item.length; index += 1) {
        if (!own(item, index)) hold('sparse arrays are not supported');
        parts.push(encode(item[index], depth + 1));
      }
      result = `[${parts.join(',')}]`;
    } else {
      result = `{${Object.keys(item).map(key => `${JSON.stringify(key)}:${encode(item[key], depth + 1)}`).join(',')}}`;
    }
    active.delete(item);
    return result;
  }
  return encode(value, 0);
}

function hasUnpairedSurrogate(text) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function hash(text, encoding = 'utf8') {
  return createHash('sha256').update(text, encoding).digest('hex');
}

function textHash(text) {
  const hash_encoding = hasUnpairedSurrogate(text) ? 'utf16le' : 'utf8';
  return { sha256: hash(text, hash_encoding), hash_encoding };
}

function pointer(path, key) {
  return `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function child(location, key) {
  return { ...location, path: pointer(location.path, key) };
}

function reference(source) {
  return { source_id: source.source_id, sha256: source.sha256,
    ...(own(source, 'revision') ? { revision: source.revision } : {}) };
}

function exactKeys(value, allowed, required = []) {
  return object(value) && Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key))
    && required.every(key => own(value, key));
}

function inputReferences(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item =>
    exactKeys(item, ['id', 'revision'], ['id']) && typeof item.id === 'string'
    && (!own(item, 'revision') || (Number.isSafeInteger(item.revision) && item.revision >= 0)));
}

function modelCatalog(value) {
  const modelKeys = ['id', 'name', 'description', 'supported_efforts', 'effort_support', 'default_effort',
    'is_default', 'serviceTiers', 'additionalSpeedTiers'];
  const speedKeys = ['host_default', 'fast_disabled', 'evidence', 'default_service_tier', 'default_speed', 'paid_tiers_enabled'];
  return exactKeys(value, ['source', 'model', 'speed_support'], ['source', 'model'])
    && value.source === 'host_catalog' && exactKeys(value.model, modelKeys, ['id'])
    && typeof value.model.id === 'string'
    && (!own(value, 'speed_support') || exactKeys(value.speed_support, speedKeys));
}

function mechanicalContext(value) {
  return exactKeys(value, ['inputs', 'model_catalog']) && Object.keys(value).length > 0
    && (!own(value, 'inputs') || inputReferences(value.inputs))
    && (!own(value, 'model_catalog') || modelCatalog(value.model_catalog));
}

function fileObject(value) {
  return object(value) && typeof value.path === 'string' && value.path.length > 0 && typeof value.content === 'string';
}

function recognizablePath(value) {
  // Untyped string maps need recognizable file paths, not just punctuation.
  // Ambiguous names stay semantic; explicit {path, content} files need no guess.
  if (typeof value !== 'string' || !/^(?:\.\/)?[A-Za-z0-9_@+-][A-Za-z0-9_.@+\/-]*$/.test(value)) return false;
  const parts = value.replace(/^\.\//, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.endsWith('.'))) return false;
  return parts.length > 1 || /\.(?:[cm]?js|jsx|tsx?|json|html|css|scss|md|txt|py|rb|go|rs|java|[ch]|cpp|sh|ya?ml|toml|xml|sql|svg)$/i.test(parts[0])
    || /^(?:Dockerfile|Makefile|LICENSE)$/.test(parts[0]);
}

function fileCollection(value) {
  if (Array.isArray(value)) return value.every(fileObject);
  return object(value) && Object.entries(value).every(([path, item]) =>
    typeof item === 'string' ? recognizablePath(path) : fileObject(item));
}

function nonemptyFiles(value) {
  return fileCollection(value) && Object.keys(value).length > 0;
}

function testResult(value) {
  return object(value) && typeof value.status === 'string';
}

function runtimeContainer(value) {
  return object(value) && runtimeTypes.has(value.type)
    && (object(value.scope) || fileCollection(value.files) || fileCollection(value.sources)
      || (value.type === 'test' && testResult(value.result)));
}

function checkpointSnapshot(value) {
  return object(value) && typeof value.id === 'string' && object(value.records) && object(value.jobs)
    && Array.isArray(value.notices) && Array.isArray(value.messages);
}

function teamSnapshot(value) {
  return object(value) && typeof value.plugin_version === 'string' && typeof value.governance === 'string'
    && typeof value.governance_sha256 === 'string' && (object(value.roles) || Array.isArray(value.roles))
    && typeof value.cos_instructions === 'string';
}

function hashMap(value) {
  return object(value) && Object.keys(value).length > 0
    && Object.values(value).every(item => typeof item === 'string' && /^[a-f0-9]{64}$/i.test(item));
}

// These companions identify known artifact payload shapes; their surrounding
// verification, claims, limits, errors and unknown fields remain semantic.
function sourceBundle(value) {
  return (nonemptyFiles(value.files) || nonemptyFiles(value.sources))
    && ['diff', 'test_output', 'native_hooks_output'].some(key => typeof value[key] === 'string'
      || (['test_output', 'native_hooks_output'].includes(key) && testResult(value[key])));
}

function reviewedDiff(value) {
  return typeof value.runtime_and_docs_diff === 'string' && hashMap(value.changed_file_sha256)
    && (object(value.verification) || typeof value.verification === 'string');
}

function releaseBundle(value) {
  const generated = nonemptyFiles(value.generated_files)
    || (Array.isArray(value.generated_files) && value.generated_files.length > 0
      && value.generated_files.every(item => typeof item === 'string' && item.length > 0));
  return typeof value.release_delta === 'string' && generated
    && (typeof value.tests === 'string' || testResult(value.tests));
}

// JSON.parse already checked syntax. Remove only the four JSON whitespace
// characters outside strings; preserve quoted whitespace and all escapes.
function withoutJsonWhitespace(raw) {
  // Normalize string tokens only. Duplicate keys and lossy numeric lexemes
  // still differ from the parsed serialization and therefore stay semantic raw.
  return raw.replace(/"(?:[^"\\]|\\[\s\S])*"|[ \t\r\n]+/g, token =>
    token.startsWith('"') ? JSON.stringify(JSON.parse(token)) : '');
}

function stateFor(subject) {
  const state = subjects.get(subject);
  if (!state) hold('subject was not built by buildEvidence');
  return state;
}

/** Frozen in-memory evidence only. Send handover, never the whole subject.
 * sources contain private retrieval data. No caller-owned object is retained.
 */
export function buildEvidence(checkpoint, history = []) {
  if (!object(checkpoint) || !Array.isArray(history)) hold('checkpoint must be an object and history an array');
  const checkpointRaw = serialize(checkpoint);
  const historyRaw = serialize(history);
  const snapshot = JSON.parse(checkpointRaw);
  const prior = JSON.parse(historyRaw);
  const checkpoint_sha256 = hash(checkpointRaw);
  const history_sha256 = hash(historyRaw);
  const sources = Object.create(null);
  const descriptors = [];
  const blobs = new Map();

  function register(location, kind, raw, encoding, reason, explicitId) {
    const source_id = explicitId ?? `s${descriptors.length}`;
    if (own(sources, source_id)) hold(`duplicate generated source identity ${source_id}`);
    const hashing = textHash(raw);
    const blob_id = `${hashing.hash_encoding}:${hashing.sha256}`;
    if (blobs.has(blob_id) && blobs.get(blob_id) !== raw) hold('content hash collision');
    if (!blobs.has(blob_id)) blobs.set(blob_id, raw);
    const descriptor = { source_id, scope: location.scope, path: location.path, kind, encoding,
      ...hashing, length: raw.length, blob_id };
    for (const key of ['entity_id', 'revision', 'parent_source_id', 'owner_source_id', 'collection_key']) {
      if (own(location, key)) descriptor[key] = location[key];
    }
    if (reason) descriptor.reason = reason;
    descriptors.push(descriptor);
    sources[source_id] = { ...descriptor, raw: blobs.get(blob_id) };
    return descriptor;
  }

  function externalize(value, location, reason, encoding = 'text') {
    const raw = encoding === 'json' ? serialize(value) : value;
    const source = register(location, 'payload', raw, encoding, reason);
    return { evidence_ref: reference(source), encoding, length: source.length, blob_id: source.blob_id, reason };
  }

  function projectFiles(value, location) {
    if (Array.isArray(value)) return value.map((item, index) => walk(item, child(location, index), { files: true }));
    const result = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      result[key] = typeof item === 'string'
        ? externalize(item, child(location, key), 'typed-file-body')
        : walk(item, child(location, key), { files: true });
    }
    return result;
  }

  function decodedContent(raw, location) {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return raw; }
    if ((!object(parsed) && !Array.isArray(parsed)) || withoutJsonWhitespace(raw) !== serialize(parsed)) return raw;
    // Comparing complete token text retains duplicate keys, precision-changing
    // numbers and noncanonical lexemes as literal raw evidence instead.
    const source = register(location, 'json-content', raw, 'text', 'original-json-content');
    const decodedLocation = { ...location, scope: `decoded:${JSON.stringify([location.scope, location.path])}`, path: '' };
    return { format: 'derived-json', raw: reference(source), value: walk(parsed, decodedLocation, { files: true }) };
  }

  function walk(value, location, policy = {}) {
    if (Array.isArray(value)) {
      return value.map((item, index) => walk(item, child(location, index), { files: Boolean(policy.files) }));
    }
    if (!object(value)) return value;
    const result = Object.create(null);
    const typedFile = policy.files && fileObject(value);
    const explicitEvidence = value.type === 'source-evidence' || value.kind === 'source-evidence';
    const bundle = policy.files && sourceBundle(value);
    const reviewed = policy.files && reviewedDiff(value);
    const release = policy.files && releaseBundle(value);
    for (const [key, item] of Object.entries(value)) {
      const at = child(location, key);
      if (typedFile && key === 'content') {
        result[key] = externalize(item, at, 'typed-file-body');
      } else if (policy.entityKind === 'record' && key === 'previous' && Array.isArray(item)) {
        result[key] = item.map((revision, index) => entry(revision,
          { ...child(at, index), parent_source_id: location.owner_source_id }, 'record', policy.artifact));
      } else if (policy.entityKind === 'record' && policy.artifact && key === 'content' && typeof item === 'string') {
        result[key] = decodedContent(item, at);
      } else if (policy.entityKind === 'history-attempt' && key === 'checkpoint' && checkpointSnapshot(item)) {
        result[key] = externalize(item, at, 'prior-full-checkpoint-snapshot', 'json');
      } else if (policy.entityKind === 'history-attempt' && ['previous', 'candidate'].includes(key) && teamSnapshot(item)) {
        result[key] = externalize(item, at, 'prior-team-snapshot', 'json');
      } else if (policy.entityKind && key === 'inputs' && inputReferences(item)) {
        result[key] = externalize(item, at, 'machine-input-references', 'json');
      } else if (policy.entityKind && key === 'model_catalog' && modelCatalog(item)) {
        result[key] = externalize(item, at, 'machine-model-catalog', 'json');
      } else if (policy.entityKind && key === 'context' && mechanicalContext(item)) {
        result[key] = externalize(item, at, 'machine-context', 'json');
      } else if (policy.files && key === 'file' && fileObject(item)) {
        result[key] = walk(item, at, { files: true });
      } else if (policy.files && (['files', 'sources'].includes(key) || (release && key === 'generated_files')) && fileCollection(item)) {
        result[key] = projectFiles(item, at);
      } else if (typeof item === 'string' && ((explicitEvidence && ['source', 'diff', 'log'].includes(key))
          || (bundle && ['diff', 'test_output', 'native_hooks_output'].includes(key))
          || (reviewed && key === 'runtime_and_docs_diff') || (release && ['release_delta', 'tests'].includes(key)))) {
        result[key] = externalize(item, at, 'typed-source-evidence-payload');
      } else if (policy.testResult && ['stdout', 'stderr'].includes(key) && typeof item === 'string') {
        result[key] = externalize(item, at, 'typed-test-output');
      } else if ((policy.runtime && value.type === 'test' && key === 'result' && testResult(item))
          || (bundle && ['test_output', 'native_hooks_output'].includes(key) && testResult(item))
          || (release && key === 'tests' && testResult(item))) {
        result[key] = walk(item, at, { testResult: true });
      } else if (['development', 'prototype'].includes(key) && runtimeContainer(item)) {
        result[key] = walk(item, at, { files: true, runtime: true });
      } else if (policy.runtime && key === 'scope' && object(item)) {
        result[key] = walk(item, at, { files: true });
      } else {
        result[key] = walk(item, at);
      }
    }
    return result;
  }

  function entry(value, location, kind, inheritedArtifact = false, initialPolicy = {}) {
    const at = { ...location };
    delete at.revision;
    if (object(value)) {
      if (own(value, 'id')) at.entity_id = value.id;
      if (own(value, 'revision')) at.revision = value.revision;
    }
    const raw = serialize(value);
    const source = register(at, kind, raw, 'json');
    const artifact = inheritedArtifact || (object(value) && value.kind === 'artifact');
    const projected = walk(value, { ...at, owner_source_id: source.source_id },
      { ...initialPolicy, entityKind: kind, artifact });
    const projectedRaw = serialize(projected);
    let semantic = source;
    if (projectedRaw !== raw) {
      semantic = register({ ...at, owner_source_id: source.source_id }, 'projection', projectedRaw, 'json',
        'exact-semantic-projection', `projection:${source.source_id}`);
    }
    return { source: reference(source), semantic: reference(semantic), value: projected };
  }

  const fields = [];
  const counts = { checkpoint_fields: Object.keys(snapshot).length, records: 0, jobs: 0, notices: 0, messages: 0, history_attempts: prior.length };
  for (const key of Object.keys(snapshot).sort()) {
    const location = { scope: 'checkpoint', path: pointer('', key) };
    const value = snapshot[key];
    const keyed = ['records', 'jobs'].includes(key) && object(value);
    if (own(collectionKinds, key) && (keyed || Array.isArray(value))) {
      counts[key] = Object.keys(value).length;
      const source = register(location, 'collection', serialize(value), 'json');
      // Entries remain an array for the existing handover API. Map keys and
      // original container shape are explicit; paths use keys, never IDs.
      const entries = Object.entries(value).map(([entryKey, item]) => {
        const at = keyed ? { ...child(location, entryKey), collection_key: entryKey } : child(location, entryKey);
        const projected = entry(item, at, collectionKinds[key]);
        return keyed ? { key: entryKey, ...projected } : projected;
      });
      fields.push({ key, source: reference(source), collection_shape: keyed ? 'object' : 'array', entries });
    } else {
      const policy = ['development', 'prototype'].includes(key) && runtimeContainer(value)
        ? { files: true, runtime: true } : {};
      fields.push({ key, ...entry(value, location, 'checkpoint-field', false, policy) });
    }
  }
  const historyEntries = prior.map((value, index) => entry(value,
    { scope: 'history', path: pointer('', index) }, 'history-attempt'));
  descriptors.sort((left, right) => left.source_id < right.source_id ? -1 : left.source_id > right.source_id ? 1 : 0);
  counts.sources = descriptors.length;
  counts.payload_occurrences = descriptors.filter(item => item.kind === 'payload').length;
  counts.distinct_payload_bodies = new Set(descriptors.filter(item => item.kind === 'payload').map(item => item.blob_id)).size;
  const inventory = { version: 1, counts, entries: [...descriptors] };
  const inventory_sha256 = hash(serialize(inventory));
  const handover = { format: 'soloco-upgrade-evidence-v1', checkpoint_sha256, history_sha256, inventory_sha256,
    counts, checkpoint: fields, history: historyEntries };
  const stream = register({ scope: 'transport', path: '' }, 'semantic-stream',
    serialize({ handover, registry: inventory.entries.map(item => ({ ...item })) }), 'json');
  const pages = [];
  for (let offset = 0; offset < stream.length;) {
    let end = Math.min(offset + PAGE_TARGET, stream.length);
    if (splitSurrogate(sources[stream.source_id].raw, end)) end--;
    pages.push({ page_id: `page-${pages.length}`, source_id: stream.source_id, sha256: stream.sha256, offset, length: end - offset });
    offset = end;
  }
  const subject = freeze({ pages, checkpoint_sha256, history_sha256, inventory_sha256, inventory, sources, handover });
  subjects.set(subject, { sessionIds: new Set() });
  return subject;
}


/** A page is authentic frozen transport, but is eligible only after delivery. */
export function evidencePage(subject, page) {
  stateFor(subject);
  if (!subject.pages.includes(page)) hold('unknown page');
  const source = subject.sources[page.source_id];
  const text = source.raw.slice(page.offset, page.offset + page.length);
  const citation_ranges = [];
  for (let offset=page.offset;offset<page.offset+page.length;) {
    let end=Math.min(offset+RANGE_LIMIT,page.offset+page.length);
    if (splitSurrogate(source.raw,end)) end--;
    citation_ranges.push({offset,length:end-offset,range_sha256:textHash(source.raw.slice(offset,end)).sha256});
    offset=end;
  }
  const result = freeze({ ...page, end: page.offset + page.length, total: source.length,
    text, range_sha256: textHash(text).sha256, citation_ranges });
  issuedReads.set(result, { subject, source_id: source.source_id });
  return result;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) hold(`${label} must be a nonnegative safe integer`);
}

function splitSurrogate(text, index) {
  if (index <= 0 || index >= text.length) return false;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** Half-open UTF-16 ranges. Reading does not attest delivery to any session. */
export function readEvidence(subject, request) {
  stateFor(subject);
  if (!exactKeys(request, ['source_id', 'sha256', 'offset', 'length'], ['source_id', 'sha256', 'offset', 'length'])) {
    hold('retrieval requires exactly source_id, sha256, offset and length');
  }
  if (typeof request.source_id !== 'string' || !own(subject.sources, request.source_id)) hold('unknown frozen source ID');
  const source = subject.sources[request.source_id];
  if (request.sha256 !== source.sha256) hold('source hash mismatch');
  integer(request.offset, 'offset');
  integer(request.length, 'length');
  if (request.length > RANGE_LIMIT) hold(`range exceeds ${RANGE_LIMIT} UTF-16 code units`);
  const end = request.offset + request.length;
  if (!Number.isSafeInteger(end) || request.offset > source.length || end > source.length
      || (request.length === 0 && source.length !== 0)) hold('range is outside source bounds or empty');
  if (splitSurrogate(source.raw, request.offset) || splitSurrogate(source.raw, end)) hold('range splits a surrogate pair');
  const text = source.raw.slice(request.offset, end);
  const rangeHash = textHash(text);
  const result = freeze({ ...reference(source), scope: source.scope, path: source.path, encoding: source.encoding,
    hash_encoding: source.hash_encoding, offset: request.offset, end, length: request.length,
    total: source.length, text, range_sha256: rangeHash.sha256, range_hash_encoding: rangeHash.hash_encoding });
  issuedReads.set(result, { subject, source_id: source.source_id });
  return result;
}

/** Runtime-owned per-native-session token. Never expose or reuse the token.
 * The runtime, not this module, attests native identity and handover delivery.
 */
export function createDeliveryLedger(subject, sessionId) {
  const state = stateFor(subject);
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0 || sessionId.length > 256) hold('invalid delivery session identity');
  if (state.sessionIds.has(sessionId)) hold('delivery session identity already used for this subject');
  state.sessionIds.add(sessionId);
  const ledger = freeze({ session_id: sessionId, checkpoint_sha256: subject.checkpoint_sha256,
    history_sha256: subject.history_sha256, inventory_sha256: subject.inventory_sha256 });
  deliveryLedgers.set(ledger, { subject, ranges: new Map() });
  return ledger;
}

function ledgerFor(subject, ledger) {
  const state = deliveryLedgers.get(ledger);
  if (!state || state.subject !== subject) hold('delivery ledger does not belong to this subject');
  return state;
}

/** Call only AFTER successful delivery of this exact read to this session. */
export function recordDelivery(subject, ledger, response) {
  stateFor(subject);
  const state = ledgerFor(subject, ledger);
  const issued = issuedReads.get(response);
  if (!issued || issued.subject !== subject) hold('delivery requires an authentic read result from this subject');
  const ranges = state.ranges.get(issued.source_id) ?? [];
  ranges.push([response.offset, response.end]);
  state.ranges.set(issued.source_id, ranges);
  return freeze({ session_id: ledger.session_id, source_id: response.source_id,
    sha256: response.sha256, offset: response.offset, end: response.end, total: response.total });
}

function fullyDelivered(source, ranges) {
  if (!ranges || ranges.length === 0) return false;
  let end = 0;
  for (const [start, next] of [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1])) {
    if (start > end) return false;
    end = Math.max(end, next);
    if (end >= source.length) return true;
  }
  return false;
}

/** Exact source eligibility only, not understanding or semantic correctness.
 * Every citation requires delivery to the specified native session.
 */
export function validateCitations(subject, citations, ledger) {
  stateFor(subject);
  const deliveries = ledger === undefined ? null : ledgerFor(subject, ledger);
  if (!Array.isArray(citations) || citations.length === 0 || citations.length > CITATION_LIMIT) {
    hold(`citations must be a nonempty array of at most ${CITATION_LIMIT} refs`);
  }
  const seen = new Set();
  for (const citation of citations) {
    if (!exactKeys(citation, ['source_id', 'sha256', 'revision', 'offset', 'length', 'range_sha256'], ['source_id', 'sha256'])) hold('invalid citation shape');
    if (typeof citation.source_id !== 'string' || !own(subject.sources, citation.source_id)) hold('unknown citation source');
    const citationKey = JSON.stringify([citation.source_id,citation.offset??null,citation.length??null]);
    if (seen.has(citationKey)) hold('duplicate citation source');
    seen.add(citationKey);
    const source = subject.sources[citation.source_id];
    if (citation.sha256 !== source.sha256) hold('citation hash mismatch');
    if (own(citation, 'revision') !== own(source, 'revision')
        || (own(source, 'revision') && serialize(citation.revision) !== serialize(source.revision))) hold('citation revision mismatch');
    if (own(citation, 'offset') || own(citation, 'length') || own(citation, 'range_sha256')) {
      if (!['offset','length','range_sha256'].every(key=>own(citation,key))) hold('invalid citation range shape');
      const read = readEvidence(subject, { source_id: source.source_id, sha256: source.sha256,
        offset: citation.offset, length: citation.length });
      if (read.range_sha256 !== citation.range_sha256) hold('citation range hash mismatch');
      const ranges = deliveries?.ranges.get(source.source_id);
      if (!fullyDelivered({ length: read.end - read.offset }, ranges?.map(([a,b]) => [Math.max(0,a-read.offset), b-read.offset]))) {
        hold('citation range not completely delivered to this session');
      }
    } else if (!fullyDelivered(source, deliveries?.ranges.get(source.source_id))) {
      hold(`citation source not completely delivered to this session: ${source.source_id}`);
    }
  }
  return true;
}

/** Count the exact serialized host request including envelopes, escaping and
 * QA's author output. UTF-16 character limits do not guarantee native token fit.
 */
export function admitPrompt(prompt, used = 0, responseReserve = RESPONSE_LIMIT) {
  if (typeof prompt !== 'string') hold('prompt must be the complete serialized request string');
  integer(used, 'used');
  integer(responseReserve, 'response reserve');
  if (responseReserve > RESPONSE_LIMIT) hold(`response reserve exceeds ${RESPONSE_LIMIT}`);
  if (prompt.length + responseReserve > REQUEST_LIMIT) hold(`request has ${prompt.length} characters; limit ${REQUEST_LIMIT}`);
  const used_after_prompt = used + prompt.length;
  const projected_session_characters = used_after_prompt + responseReserve;
  if (!Number.isSafeInteger(projected_session_characters)) {
    hold(`session needs ${projected_session_characters} characters including reserve; unsafe cumulative count`);
  }
  return freeze({ prompt_characters: prompt.length, used_before: used, used_after_prompt,
    response_reserve: responseReserve, projected_session_characters,
    remaining_after_reserve: REQUEST_LIMIT - prompt.length - responseReserve,
    estimated_prompt_tokens: Math.ceil(prompt.length / 4), estimate_only: true, context_fit_verified: false });
}

/** Pack complete findings without trimming or reordering. The callback must use
 * the exact envelope that will be sent, including authority and batch metadata.
 * Constructing a batch is not a delivery receipt.
 */
export function* boundedReplayBatches(findings, promptForBatch) {
  if (!Array.isArray(findings) || typeof promptForBatch !== 'function') hold('invalid replay batch input');
  let batch = [], index = 0;
  for (const finding of findings) {
    const next = [...batch, finding];
    const prompt = promptForBatch(next, index);
    if (typeof prompt !== 'string') hold('replay requires the complete serialized prompt');
    if (prompt.length + RESPONSE_LIMIT > REQUEST_LIMIT && batch.length) {
      yield batch;
      index++;
      batch = [finding];
      admitPrompt(promptForBatch(batch, index));
    } else {
      admitPrompt(prompt);
      batch = next;
    }
  }
  if (batch.length) yield batch;
}

/** used includes the preceding prompt. Runtime must retain observed output
 * before validation, including malformed or oversized responses that throw.
 */
export function recordResponse(used, response) {
  integer(used, 'used');
  if (typeof response !== 'string') hold('observed response must be exact text');
  if (response.length > RESPONSE_LIMIT) hold(`observed response exceeds ${RESPONSE_LIMIT} characters`);
  const next = used + response.length;
  if (!Number.isSafeInteger(next)) hold(`observed response exceeds safe cumulative count`);
  return freeze({ response_characters: response.length, used: next });
}
