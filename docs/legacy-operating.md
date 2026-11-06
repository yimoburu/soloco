# Prospective lossless legacy bootstrap

`plugins/soloco/runtime/legacy-operating.mjs` implements `legacy-bootstrap-manifest-v1`. This is a planning and byte-preservation contract. It does not classify history, adopt a runtime, issue a grant, clear a failure, accept a handover, or reinterpret existing scoped plans, IDs or receipts. No existing runtime path imports this module in this component checkout. Root integration and independent QA remain required.

The builder takes the complete logical state and exact source IDs. It uses the existing canonical `handoverSubject` and existing reference, classification and snapshot APIs. It clones the input into a disposable snapshot lineage before canonical construction, so canonical shallow snapshots never enter the caller's pending vault. Existing referenced originals are read through the caller's bound vault resolver. There is no independent filesystem/database reader, company lookup, persistent cache or parallel archive.

```js
import {
  buildLegacyBootstrap, inspectLegacyBootstrap, materializeLegacyGroup,
  validateLegacyBootstrap, captureLegacyBootstrap, readLegacyBootstrap,
  legacyOperatingFrontier
} from '../plugins/soloco/runtime/legacy-operating.mjs';

// Inside an authorized existing read snapshot; returns no retained capsule.
const manifest = buildLegacyBootstrap(state, {
  source_ids: ['exact-record-id', 'upgrade:exact-upgrade-id'],
  canonical_json_text: true,
  max_group_bytes: 48000
});
const metadata = inspectLegacyBootstrap(manifest);
const completeUnreviewedPacket = materializeLegacyGroup(manifest, 'record-group-0');

// Only inside an existing Store transaction callback, before changing the baseline.
const descriptor = captureLegacyBootstrap(state, manifest, {transaction: store});
// Caller chooses a prospective logical home for descriptor in the same transaction.
// Existing Store commit/rollback and immutable-vault flushing own persistence.
```

Exports:

| Export | Result |
|---|---|
| `LEGACY_BOOTSTRAP_PROTOCOL` | Separate prospective protocol string |
| `buildLegacyBootstrap(state, options)` | Self-contained manifest; no caller state writes or retained snapshots |
| `decodeLegacyBootstrap(manifest)` | Exact state, canonical subject, selected originals and raw vault bodies; no original-vault fallback |
| `inspectLegacyBootstrap(manifest)` | Metadata: counts, sizes, frontier, record groups, unsupported coupling and existing proof references |
| `materializeLegacyGroup(manifest, group_id)` | Complete record, occurrence context and full supporting baseline/originals; validates exact delivered JSON size |
| `validateLegacyBootstrap(state, manifest)` | Exact reconstruction and current baseline/producer/membership equality; never semantic acceptance |
| `captureLegacyBootstrap(state, manifest, {transaction})` | Immutable capsule through existing `retainSnapshot`; requires a live Store transaction |
| `readLegacyBootstrap(state, descriptor)` | Existing-vault resolution and self-contained validation; historical capture may remain readable after state advances |
| `legacyOperatingFrontier(state)` | Peer A's `soloco-operating-legacy-provider-v1`; all occurrences dirty/global, `complete:false`, `interaction_complete:false` |

The caller must supply the complete state, not a selected database projection. No function can detect records omitted before input. The complete input is included alongside the canonical handover subject, so canonical exclusions, unknown extensions, negative results, current ownership, dates, scope, producer fields and old communication requirements survive unchanged. Full input identity conservatively invalidates on any state change, including archive append membership. This bootstrap module does not implement steady-state dependency-local invalidation.

The manifest contains typed definitions with ordered object edges and array positions. Hash-index hits compare exact signatures; a collision holds. Unknown types, sparse arrays, accessors, hidden fields, nonfinite numbers, negative zero, cycles, missing definitions, invalid locators and corrupt originals hold rather than undergo lossy JSON normalization. Optional `json-text-string` factoring is an explicit STRING-preserving encoding and requires byte-exact `JSON.stringify` reconstruction. Noncanonical strings remain opaque. Factoring does not give parsed text authority or supply a semantic boundary.

Every object with a string ID has an explicit coherent-body occurrence address and complete ancestor-root chain. This is a mechanical candidate index, not a claim that an arbitrary ID identifies an operating instruction. Every snapshot reference occurrence has a separate inbound edge to the exact original's typed root. Those edges preserve repeated checkpoint/retained-subject contexts without expanding an exponential tree; all typed edges remain available. Each original also retains its exact raw string, shape and length. Decoding rebuilds the complete deterministic manifest from embedded state and originals, catching even resealed omissions of frontier entries, occurrences or measurements. External raw originals are never needed for decoding.

Groups propose whole selected records, not serialization ranges. Their occurrence context binds the exact whole source, full baseline and every snapshot occurrence. Supporting context includes the entire input state, canonical subject and all embedded raw originals. Body, occurrence context, supporting context, framing and complete JSON sizes are measured separately. `materializeLegacyGroup` produces the very packet those sizes describe. An exceeded byte capacity sets `fit:Held`; a smaller packet remains `unreviewed`. No value is a model-call estimate or evidence of global fit. All unrelated-looking records remain compulsory because smaller governing/interface boundaries have no independent preservation judgment.

Immediate canonical producer job edges are mechanically checked and exposed. Complete producer/candidate/reuse evidence remains bound by the full baseline. This component does not independently certify every development/reuse dependency edge as canonical native QA closure. Existing classification references are exposed only if the existing validator accepts them; they are explicitly ineligible for bootstrap proof reuse. Invalid old proof data remains exact in the baseline and never grants an omission.

Capture checks the existing `Store` instance and transaction flag. Existing APIs use that flag for both read and write transactions; the caller must invoke capture only from its existing mutating transaction callback. Calling from a read snapshot cannot durably retain the capsule because that path never flushes pending snapshots. This module supplies no new transaction/authorization mechanism.

Validation uses targeted fictional storage/codec tests on Node 22.13 and Node 25. Tests cover hidden prohibitions, distant exceptions, revoked/exhausted grants, failed evidence, unknown fields, attribution, producer mutation, archive membership, repeated checkpoints/previous versions/retained handovers, Unicode and STRING preservation, missing/corrupt references, cycles, forced hash collisions and real SQLite-vault commit/rollback. No native semantic acceptance was run. Actual-company source bodies were unavailable under this task's scope; the provided reports were metadata only. Root must measure the actual state and integrate the provider before any candidate installation or migration. Until independently accepted coherent boundaries and current meaning exist, the whole legacy frontier is Held.
