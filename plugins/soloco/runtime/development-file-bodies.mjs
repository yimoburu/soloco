import { createHash } from 'node:crypto';

export const DEVELOPMENT_FILE_BODIES_PROTOCOL = 'development-review-file-aliases-v1';
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = reason => { throw new Error(`Invalid development file body sharing: ${reason}`); };
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const validBody = value => typeof value === 'string' && !value.includes('\0') && Buffer.from(value, 'utf8').toString('utf8') === value;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const coordinate = ({record_index, collection, file_index}) => `${record_index}:${collection}:${file_index}`;
const identityKeys = ['record_index', 'record_id', 'record_revision', 'collection', 'file_index', 'path'];
const descriptor = slot => Object.fromEntries(identityKeys.map(key => [key, slot[key]]));
const sameIdentity = (value, slot) => exact(value, identityKeys) && identityKeys.every(key => value[key] === slot[key]);

function compact(text) {
  if (typeof text !== 'string') fail('expected compact JSON text');
  let value;
  try { value = JSON.parse(text); } catch { fail('invalid JSON'); }
  // assignmentContext serializes with JSON.stringify. Requiring that spelling
  // also rejects duplicate keys and other representations that cannot round-trip.
  if (JSON.stringify(value) !== text) fail('expected exact JSON.stringify spelling');
  return value;
}

function reviewReference(value) {
  if (value === null) return null;
  if (!exact(value, ['id', 'revision']) || typeof value.id !== 'string' || !value.id.length || !Number.isSafeInteger(value.revision) || value.revision < 1) fail('invalid review identity');
  return {id:value.id, revision:value.revision};
}

function recordById(context, id) {
  const matches = context.records.filter(record => object(record) && record.id === id);
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].revision) || matches[0].revision < 1) fail('missing or ambiguous record identity');
  return matches[0];
}

function reviewPair(context, reviewOf) {
  const receipt = recordById(context, reviewOf.id), test = receipt.development;
  if (receipt.kind !== 'artifact' || receipt.revision !== reviewOf.revision || test?.type !== 'test' || typeof test.candidate_id !== 'string' || typeof test.plan_id !== 'string') fail('invalid development review target');
  const candidate = recordById(context, test.candidate_id), plan = recordById(context, test.plan_id);
  if (candidate.kind !== 'artifact' || candidate.development?.type !== 'candidate' || candidate.development.plan_id !== plan.id || plan.kind !== 'artifact' || plan.development?.type !== 'plan' || !sha(candidate.development.candidate_sha256) || candidate.development.candidate_sha256 !== test.candidate_sha256 || !sha(plan.development.scope_sha256) || candidate.development.scope_sha256 !== plan.development.scope_sha256) fail('development test/candidate/plan binding mismatch');
  // Receipt outcome, authority and eligibility remain the existing runtime's
  // responsibility. Negative receipts are preserved, never reclassified here.
  return new Set([plan.id, candidate.id]);
}

function fileSlots(context, reviewOf = null, references = false) {
  if (!object(context) || !Array.isArray(context.records)) fail('context records are missing');
  const selected = reviewOf === null ? null : reviewPair(context, reviewOf);
  const slots = [];
  context.records.forEach((record, record_index) => {
    // Unknown records and nested user objects are data, even when they resemble
    // a reference. Only these two runtime-owned, typed memberships are visited.
    if (!object(record) || record.kind !== 'artifact' || !object(record.development)) return;
    if (selected && !selected.has(record.id)) return;
    const development = record.development;
    let files, collection;
    if (development.type === 'plan') {
      if (!object(development.scope)) fail('plan scope is missing');
      files = development.scope.sources;
      collection = 'scope-source';
    } else if (development.type === 'candidate') {
      files = development.files;
      collection = 'candidate-file';
    } else return;
    recordById(context, record.id);
    if (typeof record.id !== 'string' || !record.id.length) fail('invalid record identity');
    if (!Array.isArray(files)) fail('typed file membership is missing');
    const paths = new Set();
    files.forEach((file, file_index) => {
      if (!exact(file, collection === 'scope-source' ? ['path', 'content', 'sha256'] : ['path', 'content']) || typeof file.path !== 'string' || !file.path.length || paths.has(file.path)) fail('invalid or duplicate typed file');
      paths.add(file.path);
      if (collection === 'scope-source' && !sha(file.sha256)) fail('invalid source SHA256');
      if (typeof file.content === 'string') {
        if (!validBody(file.content)) fail('invalid UTF-8 file body');
        if (collection === 'scope-source' && digest(file.content) !== file.sha256) fail('source body SHA256 mismatch');
      } else if (!references || !exact(file.content, ['file_body_alias_v1']) || !Number.isSafeInteger(file.content.file_body_alias_v1) || file.content.file_body_alias_v1 < 0) fail('invalid file body alias');
      slots.push({record_index, record_id:record.id, record_revision:record.revision, collection, file_index, path:file.path, file, literal:typeof file.content === 'string', ordinal:slots.length});
    });
  });
  return slots;
}

// This is a worker-visible representation only. The caller retains the original
// assignmentContext text/hash/currentness and every stored record unchanged.
export function shareDevelopmentFileBodies(contextText, assignmentContextSha256, reviewOf = null) {
  if (!sha(assignmentContextSha256)) fail('unchanged assignment context SHA256 is required');
  reviewOf = reviewReference(reviewOf);
  const context = compact(contextText), slots = fileSlots(context, reviewOf);
  const first = new Map(), hashes = new Map(), targets = new Set(), aliases = [];
  let eliminated_body_utf8_bytes = 0;
  for (const slot of slots) {
    const content = slot.file.content, hash = digest(content);
    if (hashes.has(hash) && hashes.get(hash) !== content) fail('unequal bodies have the same hash');
    hashes.set(hash, content);
    if (!first.has(content)) {
      first.set(content, slot);
      continue; // First and unique whole bodies stay in their original slots.
    }
    const target = first.get(content), alias_id = aliases.length;
    aliases.push({alias_id, occurrence:descriptor(slot), target:descriptor(target), sha256:hash, utf8_bytes:Buffer.byteLength(content, 'utf8'), utf16_characters:content.length});
    targets.add(target.ordinal);
    eliminated_body_utf8_bytes += Buffer.byteLength(content, 'utf8');
    // Replacing the existing value preserves its position in the object's order.
    slot.file.content = {file_body_alias_v1:alias_id};
  }
  const original_sha256 = digest(contextText), original_utf8_bytes = Buffer.byteLength(contextText, 'utf8');
  const text = JSON.stringify({protocol:DEVELOPMENT_FILE_BODIES_PROTOCOL, canonical_context_sha256:original_sha256, assignment_context_sha256:assignmentContextSha256, canonical_context_utf8_bytes:original_utf8_bytes, canonical_context_utf16_characters:contextText.length, review_of:reviewOf, file_body_aliases:aliases, context});
  return {text, original_sha256, geometry:{
    original_utf8_bytes, original_utf16_characters:contextText.length,
    wire_utf8_bytes:Buffer.byteLength(text, 'utf8'), wire_utf16_characters:text.length,
    shared_body_count:targets.size, alias_count:aliases.length, eliminated_body_utf8_bytes
  }};
}

// expectedOriginalSha256 pins the exact raw context text, independently of this
// envelope. It is distinct from canonical context.hash, which may omit name.
export function restoreDevelopmentFileBodies(wireText, expectedOriginalSha256, expectedAssignmentContextSha256, expectedReviewOf = null) {
  if (!sha(expectedOriginalSha256) || !sha(expectedAssignmentContextSha256)) fail('expected original and assignment context SHA256 are required');
  expectedReviewOf = reviewReference(expectedReviewOf);
  const wire = compact(wireText);
  if (!exact(wire, ['protocol', 'canonical_context_sha256', 'assignment_context_sha256', 'canonical_context_utf8_bytes', 'canonical_context_utf16_characters', 'review_of', 'file_body_aliases', 'context']) || wire.protocol !== DEVELOPMENT_FILE_BODIES_PROTOCOL || wire.canonical_context_sha256 !== expectedOriginalSha256 || wire.assignment_context_sha256 !== expectedAssignmentContextSha256 || JSON.stringify(wire.review_of) !== JSON.stringify(expectedReviewOf) || !Array.isArray(wire.file_body_aliases)) fail('invalid envelope or context/review binding');
  const slots = fileSlots(wire.context, expectedReviewOf, true), byCoordinate = new Map(slots.map(slot => [coordinate(slot), slot]));
  const resolutions = [];
  let previous = -1;
  for (const [index, alias] of wire.file_body_aliases.entries()) {
    if (!exact(alias, ['alias_id', 'occurrence', 'target', 'sha256', 'utf8_bytes', 'utf16_characters']) || alias.alias_id !== index || !exact(alias.occurrence, identityKeys) || !exact(alias.target, identityKeys)) fail('invalid or duplicate alias identity');
    const occurrence = byCoordinate.get(coordinate(alias.occurrence)), target = byCoordinate.get(coordinate(alias.target));
    if (!occurrence || !target || !sameIdentity(alias.occurrence, occurrence) || !sameIdentity(alias.target, target) || occurrence.ordinal <= previous || target.ordinal >= occurrence.ordinal || !target.literal || !exact(occurrence.file.content, ['file_body_alias_v1']) || occurrence.file.content.file_body_alias_v1 !== index) fail('invalid, forward, chained or ambiguous alias');
    const body = target.file.content;
    if (alias.sha256 !== digest(body) || alias.utf8_bytes !== Buffer.byteLength(body, 'utf8') || alias.utf16_characters !== body.length) fail('alias body commitment mismatch');
    previous = occurrence.ordinal;
    resolutions.push({file:occurrence.file, body});
  }
  // Validate every target against the unchanged wire before resolving any alias;
  // a previously resolved placeholder can never become a permitted chain target.
  for (const {file, body} of resolutions) file.content = body;
  fileSlots(wire.context, expectedReviewOf); // Reject unresolved aliases/source mismatch.
  const text = JSON.stringify(wire.context);
  if (digest(text) !== expectedOriginalSha256 || Buffer.byteLength(text, 'utf8') !== wire.canonical_context_utf8_bytes || text.length !== wire.canonical_context_utf16_characters) fail('reconstructed text integrity mismatch');
  if (shareDevelopmentFileBodies(text, expectedAssignmentContextSha256, expectedReviewOf).text !== wireText) fail('noncanonical body aliases');
  return text;
}

// Only ordinary development QA is applicable. All other/special prompt paths
// return the exact existing text. This function changes no context/job object.
export function renderDevelopmentReviewContext(context, job) {
  if (!object(context) || !object(job)) return context?.text;
  if (job.role !== 'qa' || !job.review_of || job.development_id || job.prototype_id || ![undefined, 1, 2, 3, 5].includes(job.context_format) || context.qualification || context.qualification_evidence || context.operating_evidence || context.handover_evidence || context.stream) return context.text;
  // Optional presentation activates only on a normal canonical record pack and
  // one exact runtime-attributed test target. Fallback changes no eligibility.
  let pack, reviewOf;
  try {
    pack = compact(context.text);
    reviewOf = reviewReference(job.review_of);
  } catch { return context.text; }
  if (!object(pack) || typeof pack.company_id !== 'string' || !pack.company_id.length || !Object.hasOwn(pack, 'governance') || !object(pack.charter) || !Array.isArray(pack.records) || !Array.isArray(pack.notices) || !Array.isArray(pack.messages) || Object.hasOwn(pack, 'protocol')) return context.text;
  const targets = pack.records.filter(record => object(record) && record.id === reviewOf.id);
  if (targets.length !== 1) return context.text;
  const receipt = targets[0];
  if (receipt.kind !== 'artifact' || receipt.author_role !== 'runtime' || receipt.revision !== reviewOf.revision || !object(receipt.development) || receipt.development.type !== 'test') return context.text;
  // After activation, malformed or substituted memberships must fail closed.
  // These are representation checks, not receipt acceptance or authentication.
  reviewPair(pack, reviewOf);
  const candidate = recordById(pack, receipt.development.candidate_id);
  const plan = recordById(pack, receipt.development.plan_id);
  if (digest(JSON.stringify(candidate.development.files)) !== candidate.development.candidate_sha256 || digest(JSON.stringify(plan.development.scope)) !== plan.development.scope_sha256) fail('review file or scope commitment mismatch');
  const shared = shareDevelopmentFileBodies(context.text, context.hash, reviewOf);
  if (restoreDevelopmentFileBodies(shared.text, shared.original_sha256, context.hash, reviewOf) !== context.text) fail('exact render roundtrip failed');
  // Compatibility callers receive only a validated context candidate; the
  // worker still compares the complete original and alternate prompts.
  return shared.geometry.alias_count === 0 || shared.text.length >= context.text.length || Buffer.byteLength(shared.text, 'utf8') >= Buffer.byteLength(context.text, 'utf8') ? context.text : shared.text;
}
