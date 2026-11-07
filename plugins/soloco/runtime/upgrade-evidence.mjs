import {reviewedContext,contextSource,currentExtensions,qualificationProducers,qualificationNegatives} from './current-state.mjs';
import {snapshotReference,snapshotBytes,snapshotEntryReference,retainSnapshotEntry,shallowSnapshotAttempt,shallowSnapshotRecord,legacyHandoverSource} from './snapshot.mjs';
import { createHash } from 'node:crypto';

export const REQUEST_LIMIT = 900000;
export const PAGE_TARGET = 120000;
// Finite request-planning allowance, not a response acceptance ceiling.
export const RESPONSE_RESERVE = 80000;
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
    'is_default', 'serviceTiers', 'additionalSpeedTiers', 'defaultServiceTier'];
  const speedKeys = ['host_default', 'fast_disabled', 'evidence', 'default_service_tier', 'default_speed', 'paid_tiers_enabled'];
  return exactKeys(value, ['source', 'model', 'speed_support'], ['source', 'model'])
    && value.source === 'host_catalog' && exactKeys(value.model, modelKeys, ['id'])
    && typeof value.model.id === 'string'
    && (!own(value, 'speed_support') || exactKeys(value.speed_support, speedKeys));
}
export {modelCatalog as knownModelCatalog};

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

function handoverSnapshot(value) {
  return object(value) && typeof value.company_id === 'string' && object(value.records) && object(value.jobs)
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

// Remove only the four JSON whitespace characters outside strings. Legacy
// record decoding normalizes string tokens after parsing; pair matching keeps
// every escape literal and proves syntax by equality with strict serialization.
function withoutJsonWhitespace(raw, normalizeStrings = true) {
  // Normalize string tokens only. Duplicate keys and lossy numeric lexemes
  // still differ from the parsed serialization and therefore stay semantic raw.
  return raw.replace(/"(?:[^"\\]|\\[\s\S])*"|[ \t\r\n]+/g, (token, offset) => {
    if (token.startsWith('"')) return normalizeStrings ? JSON.stringify(JSON.parse(token)) : token;
    // Whitespace inside a primitive token is malformed JSON, not formatting.
    if (!normalizeStrings && /[\w.+-]/.test(raw[offset - 1] ?? '')
        && /[\w.+-]/.test(raw[offset + token.length] ?? '')) return token;
    return '';
  });
}

function stateFor(subject) {
  const state = subjects.get(subject);
  if (!state) hold('subject was not built by buildEvidence');
  return state;
}

/** Frozen in-memory evidence only. Send handover, never the whole subject.
 * sources contain private retrieval data. No caller-owned object is retained.
 */
export function buildEvidence(checkpoint, history = [], { wholeBodyAliases = true, currentState = false, checkpointContinuity = false, reviewContext, retainedHandoverRecords = {}, snapshotState, contextState, originalSources=[], operatingInput } = {}) {
  if (!object(checkpoint) || !Array.isArray(history)) hold('checkpoint must be an object and history an array');
  const checkpointRaw = serialize(checkpoint);
  const historyRaw = serialize(history);
  // Raw identity is never replaced by semantic acceptance. This prospective
  // packet is supplied only by the fresh-attempt capture/reader in upgrade.mjs.
  if(operatingInput && (operatingInput.protocol!=='accepted-operating-upgrade-v1'||!checkpointContinuity||!snapshotState||!currentState))hold('invalid operating upgrade input contract');
  const snapshot = operatingInput ? JSON.parse(serialize({accepted_operating_context:operatingInput.context,
    pinned:operatingInput.pinned,candidate:operatingInput.candidate,preparation_owner:operatingInput.preparation_owner,
    source_instruction:operatingInput.source_instruction})) : JSON.parse(checkpointRaw);
  const prior = operatingInput ? [] : JSON.parse(historyRaw);
  if(operatingInput)currentState=false;
  const checkpoint_sha256 = hash(checkpointRaw);
  const history_sha256 = hash(historyRaw);
  const sources = Object.create(null);
  const descriptors = [];
  const archivedSourceIds=new Set();
  const archivedRecords=[];
  const reviewState=contextState??{...snapshot,upgrade_history:prior};
  const projection=currentState?reviewedContext(reviewState):null;
  if(currentState&&snapshot.context_classifications!==undefined){
    if(!object(snapshot.context_classifications))hold('unknown context classification index');
    const state=reviewState;
    for(const id of Object.keys(snapshot.context_classifications)){
      const source=contextSource(state,id);
      if(!source)hold('context classification source is missing: '+id);
      // Validate all entries before replacing the index with an archive pointer,
      // including entries unrelated to records currently being projected.
      // The common projection above validates exact provenance and dependencies.
    }
  }
  const blobs = new Map();
  for(const source of originalSources){
    if(!exactKeys(source,['source_id','raw'],['source_id','raw'])||typeof source.source_id!=='string'||typeof source.raw!=='string')hold('invalid exact original source');
    register({scope:'qualification-original',path:pointer('',source.source_id)},'qualification-original',source.raw,'json','compulsory-exact-original',source.source_id);
  }
  // Ordinary handover keeps every distinct checkpoint obligation semantic.
  // Equality references only point back to an already compulsory projection.
  const continuityEntries = new Map();
  const snapshotEntries = new Map();
  const snapshotOriginals = new Map();
  const entryOriginals = new Map();
  function originalEntry(value) {
    const locator=snapshotEntryReference(value);if(!locator)return {value,raw:null};
    if(!snapshotState)hold('immutable entry resolver missing');
    const ref=locator.immutable_snapshot;
    let cached=entryOriginals.get(ref.sha256);
    if(!cached){const raw=snapshotBytes(snapshotState,locator);cached={value:JSON.parse(raw),raw,characters:ref.characters,shape:ref.shape};entryOriginals.set(ref.sha256,cached);}
    if(cached.characters!==ref.characters||cached.shape!==ref.shape||(cached.value.id!==undefined&&cached.value.id!==value.id)
      ||Object.hasOwn(cached.value,'revision')!==Object.hasOwn(value,'revision')||cached.value.revision!==value.revision)hold('immutable entry identity, revision or shape changed');
    return cached;
  }

  const bodyOccurrences = new Map();
  const generatedAliases = new Map();
  const sharing = { matched_bodies: 0, matched_occurrences: 0, aliased_occurrences: 0 };
  // Index only known call/artifact pairs within each attempt. String-keyed maps
  // and the explicit equality below prove all tokens, not just a digest.
  if (wholeBodyAliases) prior.forEach((value, index) => {
    let attempt=value;
    const locator=snapshotEntryReference(value);
    if(locator){
      if(!snapshotState)hold('immutable entry resolver missing');
      if(currentState&&projection.excluded('upgrade:'+value.id)&&projection.classifications.get('upgrade:'+value.id)?.source.sha256===locator.immutable_snapshot.sha256)return;
      attempt=originalEntry(value).value;
    }
    if (!object(attempt)) return;
    const groups = new Map();
    const identity = (enclosing, role, phase) => object(enclosing)
      && typeof enclosing.native_id === 'string' && enclosing.native_id.trim()
      && (!own(enclosing, 'role') || enclosing.role === role)
      && (!own(enclosing, 'phase') || enclosing.phase === phase)
      ? serialize([enclosing.native_id, role, phase]) : null;
    function artifact(enclosing, path, role, phase) {
      const key = identity(enclosing, role, phase);
      if (!key || !object(enclosing.artifact)) return;
      const tokens = serialize(enclosing.artifact);
      if (tokens.length < 4096) return;
      if (!groups.has(key)) groups.set(key, new Map());
      const bodies = groups.get(key);
      if (!bodies.has(tokens)) bodies.set(tokens, { tokens, occurrences: [], calls: 0 });
      bodies.get(tokens).occurrences.push({ path: `${path}/artifact`, representation: 'json-value' });
    }
    for (const [key, role] of [['cos_pages', 'cos'], ['qa_pages', 'qa']]) {
      if (Array.isArray(attempt[key])) attempt[key].forEach((value, i) => artifact(value, `/${index}/${key}/${i}`, role, 'page'));
    }
    artifact(attempt.probe, `/${index}/probe`, 'cos', 'synthesis');
    artifact(attempt.review, `/${index}/review`, 'qa', 'synthesis');
    if (Array.isArray(attempt.calls)) attempt.calls.forEach((call, i) => {
      if (!object(call) || !['cos', 'qa'].includes(call.role) || !['page', 'synthesis'].includes(call.phase)
          || typeof call.text !== 'string') return;
      const key = identity(call, call.role, call.phase);
      const bodies = groups.get(key);
      if (!bodies) return;
      const tokens = withoutJsonWhitespace(call.text, false);
      const group = bodies.get(tokens);
      if (!group || tokens !== group.tokens) return;
      group.calls++;
      group.occurrences.push({ path: `/${index}/calls/${i}/text`, representation: 'json-text' });
    });
    for (const bodies of groups.values()) for (const group of bodies.values()) {
      if (!group.calls) continue;
      sharing.matched_bodies++;
      sharing.matched_occurrences += group.occurrences.length;
      for (const occurrence of group.occurrences) bodyOccurrences.set(occurrence.path, { ...occurrence, group });
    }
  });

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
    const occurrence = location.scope === 'history' && bodyOccurrences.get(location.path);
    if (occurrence) {
      const { group, representation } = occurrence;
      const raw = representation === 'json-text' ? value : serialize(value);
      const source = register(location, 'body-occurrence', raw,
        representation === 'json-text' ? 'text' : 'json', 'whole-body-pair');
      Object.assign(source, { representation, body_sha256: hash(group.tokens), body_length: group.tokens.length });
      if (!group.first) {
        source.delivery = 'compulsory-inline';
        Object.assign(sources[source.source_id], source);
        group.first = source;
        // The entire first body stays in its original representation. Do not
        // recursively replace even otherwise optional payloads inside it.
        return value;
      }
      source.delivery = 'alias';
      source.target = reference(group.first);
      Object.assign(sources[source.source_id], source);
      sharing.aliased_occurrences++;
      const alias = { evidence_body_alias: reference(source), target: reference(group.first),
        representation, body_sha256: source.body_sha256 };
      generatedAliases.set(alias, { tokens: group.tokens, source, target: group.first });
      return alias;
    }
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
    for (const [key, originalItem] of Object.entries(value)) {
      let item=originalItem;
      const immutableSlot=(key==='checkpoint'&&policy.entityKind==='history-attempt')
        ||(key==='subject'&&typeof value.subject_sha256==='string'&&Array.isArray(value.input_refs));
      if(immutableSlot&&snapshotReference(item)){
        if(!snapshotState)hold('immutable snapshot resolver missing');
        const ref=snapshotReference(item);
        let cached=snapshotOriginals.get(ref.sha256);
        if(!cached){cached={raw:snapshotBytes(snapshotState,item),shape:ref.shape,characters:ref.characters};snapshotOriginals.set(ref.sha256,cached);}
        if(cached.shape!==ref.shape||cached.characters!==ref.characters)hold('immutable snapshot reference shape changed');
        const raw=cached.raw;
        if(key==='subject'&&value.subject_sha256!==ref.sha256)hold('immutable handover subject hash changed');
        if(key==='checkpoint'&&value.checkpoint_sha256&&value.checkpoint_sha256!==ref.sha256)hold('immutable checkpoint hash changed');
        const original=register(child(location,key),'payload',raw,'json','immutable-snapshot-original');
        if(!checkpointContinuity){result[key]={original:reference(original),immutable_snapshot:ref};continue;}
        const previous=snapshotEntries.get(ref.sha256);
        if(previous){result[key]={original:reference(original),same_as:previous};continue;}
        snapshotEntries.set(ref.sha256,reference(original));
        item=JSON.parse(raw);
      }
      if(checkpointContinuity&&key==='subject'&&exactKeys(item,['retained_handover_subject'],['retained_handover_subject'])) {
        const locator=item.retained_handover_subject;
        if(!exactKeys(locator,['record_id','sha256'],['record_id','sha256'])||typeof locator.record_id!=='string'
          ||!own(retainedHandoverRecords,locator.record_id))hold('retained handover source missing');
        const original=retainedHandoverRecords[locator.record_id],snapshot=original?.handover?.subject;
        if(!handoverSnapshot(snapshot)||hash(serialize(snapshot))!==locator.sha256
          ||original.handover.subject_sha256!==locator.sha256)hold('retained handover source changed');
        const raw=serialize(original),sourceId='retained-record:'+hash(raw);
        if(!own(sources,sourceId))register({scope:'retained-handover',path:pointer('/records',locator.record_id)},'original-handover-record',raw,'json','immutable-reconstruction-original',sourceId);
        item=snapshot;
      }
      const at = child(location, key);
      if (typedFile && key === 'content') {
        result[key] = externalize(item, at, 'typed-file-body');
      } else if (policy.entityKind === 'record' && key === 'previous' && Array.isArray(item)) {
        result[key] = item.map((revision, index) => entry(revision,
          { ...child(at, index), parent_source_id: location.owner_source_id }, 'record', policy.artifact));
      } else if (policy.entityKind === 'record' && policy.artifact && key === 'content' && typeof item === 'string') {
        result[key] = decodedContent(item, at);
      } else if ((policy.entityKind === 'history-attempt' && key === 'checkpoint' && checkpointSnapshot(item))
          || (checkpointContinuity && key === 'subject' && typeof value.id==='string'
            && typeof value.subject_sha256==='string' && object(value.incoming_owner)
            && Array.isArray(value.input_refs) && handoverSnapshot(item))) {
        if (!checkpointContinuity) result[key] = externalize(item, at, 'prior-full-checkpoint-snapshot', 'json');
        else {
          const original = register(at, 'payload', serialize(item), 'json', 'prior-full-checkpoint-snapshot');
          const fields = Object.entries(item).map(([field, value]) => {
            const location = child(at, field);
            const kind = own(collectionKinds, field) ? collectionKinds[field]
              : field === 'upgrade_history' && Array.isArray(value) ? 'history-attempt' : null;
            if (kind && (object(value) || Array.isArray(value))) {
              const entries=[], repeats=[];
              for(const [key,v] of Object.entries(value)) {
                const at=child(location,key);
                if(['records','jobs'].includes(field)&&object(value))at.collection_key=key;
                const projected={key,...entry(v,at,kind)};
                (projected.same_as?repeats:entries).push(projected);
              }
              // Repeated occurrence metadata is retrievable, not another copy
              // of obligations already compulsory elsewhere in this packet.
              const repeated=repeats.length?register(location,'checkpoint-equality-index',serialize(repeats),'json','exact-equality-with-compulsory-projections'):null;
              return {key:field, collection_shape:Array.isArray(value)?'array':'object', entries,
                ...(repeated?{repeated:{count:repeats.length,source:reference(repeated),length:repeated.length}}:{})};
            }
            return {key:field, ...entry(value, location,
              field === 'upgrade' && object(value) ? 'history-attempt' : 'checkpoint-field')};
          });
          result[key] = {original:reference(original), fields};
        }
      } else if (policy.entityKind === 'history-attempt' && ['previous', 'candidate'].includes(key) && teamSnapshot(item)) {
        result[key] = checkpointContinuity ? entry(item, at, 'team-snapshot') : externalize(item, at, 'prior-team-snapshot', 'json');
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
    const locator=['record','job','history-attempt'].includes(kind)&&snapshotEntryReference(value);
    let originalRaw=null;
    if(locator){
      const original=originalEntry(value);value=original.value;originalRaw=original.raw;
    }
    const at = { ...location };
    delete at.revision;
    if (object(value)) {
      if (own(value, 'id')) at.entity_id = value.id;
      if (own(value, 'revision')) at.revision = value.revision;
    }
    const raw = originalRaw??serialize(value);
    const source = register(at, kind, raw, 'json');
    if(kind==='record'&&value?.handover&&(locator||snapshotReference(value.handover.subject))){
      const original=retainedHandoverRecords[value.id];
      if(original){
        const raw=serialize(original);
        const id='retained-record:'+hash(raw);
        if(!own(sources,id))register({scope:'retained-handover',path:pointer('/records',value.id)},'original-handover-record',raw,'json','immutable-reconstruction-original',id);
      }
    }
    if(currentState&&object(value)&&typeof value.id==='string'){
      const key=location.collection_key??value.id;
      const id=kind==='record'?key:kind==='job'?'job:'+key:kind==='history-attempt'?'upgrade:'+value.id:null;
      const original=id&&contextSource(reviewState,id);
      const excluded=id&&(projection.excluded(id)||(kind==='job'&&projection.proofJobs.has(key)));
      const equivalent=excluded&&original&&(serialize(original)===raw||(snapshotState&&kind==='record'&&serialize(shallowSnapshotRecord(snapshotState,original))===raw)
        ||(snapshotState&&kind==='history-attempt'&&serialize(shallowSnapshotAttempt(snapshotState,original))===raw));
      if(equivalent){
        archivedSourceIds.add(source.source_id);
        archivedRecords.push({source:reference(source),key:id,classification:projection.classifications.get(id)??{proof_for_reviewed_disposition:true}});
        return {source:reference(source),reviewed_archive:true};
      }
    }
    const equalityKey = kind + ':' + hash(raw);
    if (checkpointContinuity && continuityEntries.get(equalityKey)?.raw === raw) {
      return {source:reference(source), same_as:continuityEntries.get(equalityKey).semantic};
    }
    const artifact = inheritedArtifact || (object(value) && value.kind === 'artifact');
    const projected = walk(value, { ...at, owner_source_id: source.source_id },
      { ...initialPolicy, entityKind: kind, artifact });
    const projectedRaw = serialize(projected);
    let semantic = source;
    if (projectedRaw !== raw) {
      semantic = register({ ...at, owner_source_id: source.source_id }, 'projection', projectedRaw, 'json',
        'exact-semantic-projection', `projection:${source.source_id}`);
    }
    if (checkpointContinuity) continuityEntries.set(equalityKey, {raw, semantic:reference(semantic)});
    return { source: reference(source), semantic: reference(semantic), value: projected };
  }

  let operatingArchive;
  if(operatingInput){
    const originals=[];
    for(const [name,raw] of [['checkpoint',checkpointRaw],['history',historyRaw]]){
      const source=register({scope:'operating-archive',path:'/'+name},'accepted-original',raw,'json');
      archivedSourceIds.add(source.source_id);originals.push(reference(source));
    }
    // Register each exact vault body once, including nested proof/producer and
    // failed-attempt envelopes. Retrieval follows the original locators.
    const todo=[checkpoint,history],seen=new Set();
    while(todo.length){const value=todo.pop();if(!value||typeof value!=='object')continue;
      const ref=snapshotReference(value);
      if(ref){if(seen.has(ref.sha256))continue;seen.add(ref.sha256);
        const raw=snapshotBytes(snapshotState,value),source=register({scope:'operating-archive',path:'/vault/'+ref.sha256},'accepted-original',raw,'json',undefined,'vault-'+ref.sha256);
        archivedSourceIds.add(source.source_id);todo.push(JSON.parse(raw));continue;}
      for(const child of Object.values(value))if(child&&typeof child==='object')todo.push(child);
    }
    operatingArchive={protocol:'accepted-operating-upgrade-v1',originals,vault_source_prefix:'vault-',
      rule:'Complete raw business checkpoint and history, including all failed attempts, remain exact retrievable originals. Accepted preservation never grants authority or renews current meaning.'};
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
        const excluded=currentState&&((key==='records'&&projection.excluded(entryKey))||(key==='jobs'&&(projection.proofJobs.has(entryKey)||projection.excluded('job:'+entryKey))));
        const original=excluded&&contextSource(reviewState,key==='jobs'?'job:'+entryKey:entryKey);
        const matches=original&&(serialize(original)===serialize(item)||(snapshotState&&serialize(key==='records'?shallowSnapshotRecord(snapshotState,original):retainSnapshotEntry(snapshotState,original,original.id??entryKey))===serialize(item)));
        if(matches){
          const source=register(at,'archived-record',serialize(original??item),'json');
          archivedSourceIds.add(source.source_id);archivedRecords.push({key:entryKey,source:reference(source),classification:reviewState.context_classifications[key==='jobs'?'job:'+entryKey:entryKey]??{proof_for_reviewed_disposition:true}});
          return null;
        }
        const projected = entry(item, at, collectionKinds[key]);
        return keyed ? { key: entryKey, ...projected } : projected;
      });
      fields.push({ key, source: reference(source), collection_shape: keyed ? 'object' : 'array', entries:entries.filter(Boolean) });
    } else {
      if(currentState&&key==='context_classifications'){const source=register(location,'classification-index',serialize(value),'json');archivedSourceIds.add(source.source_id);fields.push({key,verified_classifications:{count:Object.keys(value).length,source:reference(source)}});continue;}
      const policy = ['development', 'prototype'].includes(key) && runtimeContainer(value)
        ? { files: true, runtime: true } : {};
      fields.push({ key, ...entry(value, location, 'checkpoint-field', false, policy) });
    }
  }
  const historyEntries = prior.map((value,index)=>{
    if(currentState&&projection.excluded('upgrade:'+value.id)){
      const original=contextSource(reviewState,'upgrade:'+value.id),raw=serialize(value);
      if(original&&(serialize(original)===raw||(snapshotState&&serialize(shallowSnapshotAttempt(snapshotState,original))===raw))){
        const source=register({scope:'history',path:pointer('',index)},'archived-upgrade',serialize(original),'json');archivedSourceIds.add(source.source_id);archivedRecords.push({entity:'upgrade',key:value.id,source:reference(source),classification:reviewState.context_classifications['upgrade:'+value.id]});return null;
      }
    }
    return entry(value,{scope:'history',path:pointer('',index)},'history-attempt');
  }).filter(Boolean);
  let archiveIndex=null;
  if(archivedRecords.length){const source=register({scope:'archive',path:'/records'},'archive-index',serialize(archivedRecords),'json');archivedSourceIds.add(source.source_id);archiveIndex={count:archivedRecords.length,source:reference(source),rule:'Exact reviewed dispositions; originals and classification proofs remain retrievable. No archive item grants authority.'};}
  const reviewSource = reviewContext === undefined ? null : register({scope:'review',path:''}, 'review-context', serialize(reviewContext), 'json');
  descriptors.sort((left, right) => left.source_id < right.source_id ? -1 : left.source_id > right.source_id ? 1 : 0);
  counts.sources = descriptors.length;
  counts.payload_occurrences = descriptors.filter(item => item.kind === 'payload').length;
  counts.distinct_payload_bodies = new Set(descriptors.filter(item => item.kind === 'payload').map(item => item.blob_id)).size;
  if (wholeBodyAliases) Object.assign(counts, sharing);
  const inventory = { version: wholeBodyAliases ? 2 : 1, counts, entries: [...descriptors] };
  const inventory_sha256 = hash(serialize(inventory));
  const handover = { ...(reviewSource ? {review_context:{source:reference(reviewSource),value:JSON.parse(sources[reviewSource.source_id].raw)}} : {}), format: wholeBodyAliases ? 'soloco-upgrade-evidence-v2' : 'soloco-upgrade-evidence-v1', checkpoint_sha256, history_sha256, inventory_sha256,
    counts, checkpoint: fields, history: historyEntries,...(operatingArchive?{operating_archive:operatingArchive,review_mode:'accepted-operating-upgrade-v1'}:{}),...(archiveIndex?{archive:archiveIndex}:{}),...(currentState?{review_mode:'verified-current-state'}:{}) };
  const registryEntries=inventory.entries.filter(item=>!archivedSourceIds.has(item.source_id)).map(item=>({...item}));
  const registrySource=checkpointContinuity?register({scope:'inventory',path:''},'source-index',serialize(registryEntries),'json'):null;
  const stream = register({ scope: 'transport', path: '' }, 'semantic-stream',
    serialize({ handover, registry:registrySource?{source:reference(registrySource),length:registrySource.length,count:registryEntries.length}:registryEntries }), 'json');
  const pages = [];
  for (let offset = 0; offset < stream.length;) {
    let end = Math.min(offset + PAGE_TARGET, stream.length);
    if (splitSurrogate(sources[stream.source_id].raw, end)) end--;
    pages.push({ page_id: `page-${pages.length}`, source_id: stream.source_id, sha256: stream.sha256, offset, length: end - offset });
    offset = end;
  }
  const subject = freeze({ pages, checkpoint_sha256, history_sha256, inventory_sha256, inventory, sources, handover });
  subjects.set(subject, { sessionIds: new Set(), aliases: generatedAliases });
  return subject;
}


/** Only runtime-generated occurrences are aliases. This returns the complete
 * compulsory token body in the requested representation, not original spacing
 * and not a delivery receipt. Exact originals use readEvidence as before.
 */
export function resolveBodyAlias(subject, alias) {
  const issued = stateFor(subject).aliases.get(alias);
  if (!issued || issued.target.delivery !== 'compulsory-inline'
      || issued.source.target.source_id !== issued.target.source_id
      || alias.target.sha256 !== issued.target.sha256
      || alias.body_sha256 !== hash(issued.tokens)) hold('invalid generated body alias or target');
  return alias.representation === 'json-text' ? issued.tokens : freeze(JSON.parse(issued.tokens));
}

/** Compare identical current inputs, including terminal current attempts as
 * next-attempt history. Prepare adds a decision, so this is only a preview.
 */
export function projectionPreview(checkpoint, history = [], currentUpgrade = null, {currentState=false,checkpointContinuity=false,snapshotState,contextState,operatingInput}={}) {
  const projectedHistory = currentUpgrade ? [...history, currentUpgrade] : history;
  if(operatingInput){
    const subject=buildEvidence(checkpoint,projectedHistory,{currentState:true,checkpointContinuity:true,snapshotState,contextState,operatingInput});
    const stream=subject.sources[subject.pages[0].source_id],raw=Object.values(subject.sources).filter(s=>s.kind==='accepted-original');
    return {kind:'accepted-operating-upgrade-preview',workflow:'incremental-v1',context_mode:'current',exact_reservation:false,
      acceptance:false,context_fit_verified:false,time_forecast:false,prepare_adds_decision_record:true,
      meaning_measurement:operatingInput.attempt_id?'frozen-attempt':'current-capture',
      projected_attempt:operatingInput.attempt_id?'Measured frozen attempt; no new preparation':null,
      current_upgrade_included:Boolean(currentUpgrade),meaning:{stream_characters:stream.length,stream_bytes:Buffer.byteLength(stream.raw,'utf8'),pages:subject.pages.length},
      raw_archive_retrieval:{sources:raw.length,characters:raw.reduce((n,s)=>n+s.length,0),bytes:raw.reduce((n,s)=>n+Buffer.byteLength(s.raw,'utf8'),0),mandatory_replay:false},
      boundary:'Preview is the current capture, not reserved future bytes. Preparation adds its exact founder instruction and control record. Ordinary operation remains Held after changed owner or definitions until fresh independent operating delta publication.'};
  }
  const baseline = buildEvidence(checkpoint, projectedHistory, { wholeBodyAliases: false,snapshotState,contextState });
  const candidate = buildEvidence(checkpoint, projectedHistory,{currentState,checkpointContinuity,snapshotState,contextState});
  const metrics = subject => {
    const stream = subject.sources[subject.pages[0].source_id];
    return { format: subject.handover.format, checkpoint_sha256: subject.checkpoint_sha256,
      history_sha256: subject.history_sha256, stream_sha256: stream.sha256,
      stream_characters: stream.length, pages: subject.pages.length };
  };
  const before = metrics(baseline), after = metrics(candidate);
  return { kind: 'current-state-preview', exact_reservation: false, time_forecast: false,
    prepare_adds_decision_record: true, current_upgrade_included: Boolean(currentUpgrade),
    baseline: before, candidate: after,
    workflow_forecast: {acceptance:false,context_fit_verified:false,estimate_only:true,
      legacy:{minimum_calls:2*after.pages+4,qa_page_proposal_copies:after.pages},
      'incremental-v1':{minimum_calls:2*after.pages+2,qa_page_proposal_copies:0,
        final_qa_complete_proposal_copies:1,additional_calls:'Retrieval and bounded replay when complete final findings do not fit the exact request envelope.'}},
    matched_bodies: candidate.inventory.counts.matched_bodies,
    matched_occurrences: candidate.inventory.counts.matched_occurrences,
    aliased_occurrences: candidate.inventory.counts.aliased_occurrences,
    net_characters_saved: before.stream_characters - after.stream_characters,
    pages_saved: before.pages - after.pages };
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

/** Pass requires every compulsory semantic token, independently of citation count.
 * The source registry and exact originals remain optional lookup evidence.
 */
export function validateSemanticDelivery(subject, ledger) {
  const deliveries = ledgerFor(subject, ledger);
  const stream = subject.sources[subject.pages[0].source_id];
  if (!fullyDelivered(stream, deliveries.ranges.get(stream.source_id))) {
    hold('required semantic stream not completely delivered to this session');
  }
  return true;
}

// Explicit v2 qualification driver. Unlike legacy record-reads-v1 this stream
// may take arbitrarily many bounded calls; every compulsory range must reach
// the same independent native session. Worker integration must retain the
// runtime-issued receipt, never a model-authored claim of complete delivery.
export function buildQualificationEvidence(state,plan,job) {
  const p=plan?.context_classification_plan;
  if(p?.version!==2||job.review_of?.id!==plan.id||job.review_of.revision!==plan.revision)hold('exact v2 qualification target required');
  const originals=[],bodies=new Map(),snapshots=new Set(),legacyDependencies=new Map();
  const retain=(raw)=>{
    const sha256=hash(raw),previous=bodies.get(sha256);
    if(previous&&previous.raw!==raw)hold('qualification original hash collision');
    if(!previous)bodies.set(sha256,{source_id:'qualification-original:'+sha256,raw});
    return {source_id:'qualification-original:'+sha256,sha256};
  };
  const dependencies=value=>{
    const todo=[value];
    while(todo.length){
      const item=todo.pop();if(!item||typeof item!=='object')continue;
      const legacy=legacyHandoverSource(state,item);
      if(legacy){const id=item.retained_handover_subject.record_id,key='legacy:'+id+':'+item.retained_handover_subject.sha256;if(!snapshots.has(key)){snapshots.add(key);const raw=serialize(legacy);retain(raw);legacyDependencies.set(id,{id,revision:legacy.revision??null,sha256:hash(raw)});todo.push(legacy);}continue;}
      const ref=snapshotReference(item);
      if(ref){if(!snapshots.has(ref.sha256)){snapshots.add(ref.sha256);const raw=snapshotBytes(state,item);retain(raw);todo.push(JSON.parse(raw));}continue;}
      for(const child of Object.values(item))if(child&&typeof child==='object')todo.push(child);
    }
  };
  const producer_dependencies=qualificationProducers(state,p),prior_negative_reviews=qualificationNegatives(state,plan);
  for(const ref of [...new Map([...p.sources,...p.counterparts,...producer_dependencies].map(ref=>[ref.id,ref])).values()]){
    const value=contextSource(state,ref.id);
    if(!value||hash(serialize(value))!==ref.sha256||(value.revision??null)!==ref.revision)hold('qualification source changed');
    originals.push({source:ref,body:retain(serialize(value))});dependencies(value);
  }
  // Raw strings are intentional: qualification cannot omit a typed log/file
  // body that might contain its only negative finding. Every exact original and
  // referenced snapshot is compulsory once, with separate byte-exact retrieval.
  return buildEvidence({company_id:state.id,governance:state.governance,cos_instructions:state.cos_instructions,roles:state.roles,owner:state.owner,state_extensions:currentExtensions(state),qualification_plan:plan,...(prior_negative_reviews.length?{prior_negative_reviews}:{}),originals,original_bodies:[...bodies.values()]},[],{wholeBodyAliases:false,checkpointContinuity:true,snapshotState:state,originalSources:[...bodies.values()],
    retainedHandoverRecords:state.records,reviewContext:{protocol:'context-qualification-v2',plan_sha256:hash(serialize(p)),...(producer_dependencies.length?{producer_dependencies}:{}),legacy_dependencies:[...legacyDependencies.values()].sort((a,b)=>a.id.localeCompare(b.id)),
      charter:state.roles[job.role],assignment:{task:job.task,task_summary:job.task_summary??null,next_handoff:job.next_handoff??null,
        ...(job.coordination?{coordination:job.coordination}:{}),...(job.requester?{requester:job.requester}:{}),...(job.expected_deliverable!==undefined?{expected_deliverable:job.expected_deliverable}:{}),model_selection:job.model_selection??{mode:'default'}},
      rule:'Compare every original finding, failure, uncertain effect and exhausted allowance with the exact mandatory counterparts. Represented does not mean resolved. Return Blocked for any omission, conflict or unique finding. No authority or renewed allowance is granted.'+(producer_dependencies.length?' Producer dependencies are compulsory provenance evidence for the selected sources and counterparts; only qualification_plan sources are being classified.':'')}});
}
export function qualificationDeliveryReceipt(subject,ledger,{plan_sha256,context_sha256}) {
  validateSemanticDelivery(subject,ledger);
  const stream=subject.sources[subject.pages[0].source_id];
  const context=subject.handover.review_context?.value;
  if(context?.protocol!=='context-qualification-v2'||context.plan_sha256!==plan_sha256)hold('qualification receipt plan changed');
  return freeze({protocol:2,semantic_delivery_complete:true,native_id:ledger.session_id,stream_sha256:stream.sha256,plan_sha256,context_sha256,legacy_dependencies:context.legacy_dependencies,...(context.producer_dependencies?{producer_dependencies:context.producer_dependencies}:{})});
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
export function admitPrompt(prompt, used = 0) {
  const responseReserve = RESPONSE_RESERVE;
  if (typeof prompt !== 'string') hold('prompt must be the complete serialized request string');
  integer(used, 'used');
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
    if (prompt.length + RESPONSE_RESERVE > REQUEST_LIMIT && batch.length) {
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
 * before validation, including responses that fail JSON or semantic checks.
 * The planning reserve is not an output cap; count actual UTF-16 units.
 */
export function recordResponse(used, response) {
  integer(used, 'used');
  if (typeof response !== 'string') hold('observed response must be exact text');
  const next = used + response.length;
  if (!Number.isSafeInteger(next)) hold(`observed response exceeds safe cumulative count`);
  return freeze({ response_characters: response.length, used: next });
}
