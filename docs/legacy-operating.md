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

## Coherent extraction planner (prospective, executable planning only)

`legacy-coherent-extraction-v1` is an additional contract in the **same module**. It leaves manifest-v1, old evidence and old scoped proof contracts intact. It avoids constructing a complete baseline for every source. It is usable for public/fictional planning now; it is **not a connected operating provider or a completed migration**.

```js
const p = buildLegacyCoherentPlan(state); // default and maximum 48,000 bytes
const session = openLegacyCoherentPlan(p); // validates once; owns an isolated plan
const packet = session.materialize(p.occurrences[0].id);
// p.measurements is computed without constructing every packet.
```

New exports are `LEGACY_COHERENT_PROTOCOL`, `buildLegacyCoherentPlan`, `decodeLegacyCoherentPlan`, `openLegacyCoherentPlan`, `validateLegacyCoherentPlan`, `captureLegacyCanonicalSource`, and `legacyCanonicalCoverage`.

The builder shares the existing lossless typed codec, isolated vault closure and exact snapshot APIs. Raw originals remain reconstructable byte for byte, including ordered object keys, arrays and canonical JSON text's STRING type. State and every unique original are separate physical documents. Repeated references become exact inbound edges, not recursively expanded checkpoint trees. These edges, root identities, ordered collection membership, parent-root chains, JSON pointers and canonical-text transitions preserve all occurrence contexts. `decodeLegacyCoherentPlan` reconstructs state and originals, then deterministically rebuilds the plan; resealing a truncated index or altered measurement does not make it valid. The input must still be a complete authorized state snapshot; this API cannot detect upstream omissions.

Every complete ID-bearing body/version is a candidate logical section. Recognized document collections (`records`, `jobs`, `messages`, `notices`, `upgrade_history`) have exact ordered structural indexes; every member is still required extraction work, even without an ID. A collection index is not a reviewed snapshot container. Nested complete bodies are explicit section cuts, with exact target roots. All other local fields, including late exceptions, unknown keys, code, logs and negative judgments, remain in the section. A body with nested version cuts is labelled `complete-local-section`, not an unchanged full original record. The unchanged complete original remains reconstructable from the typed graph. Canonical JSON text is a typed, reversible view, never executable instructions or evidence of applicability.

A packet contains one physical occurrence, its section and the complete local sections of its enclosing candidate bodies. Collection links avoid repeating every sibling body or the collection's membership list per packet. Unknown/distant coupling, linked sections and every inbound snapshot context require subsequent independent reconciliation. In particular, a snapshot original's intrinsic packet does **not** claim to have reviewed every incoming historical context. Equality groups storage and section work; it never transfers acceptance across those contexts. Root envelopes still include their noncollection fields in full. Large unknown envelopes, indivisible text, or large ancestor qualifiers may therefore Hold; this implementation does not invent semantic subdivisions to force fit.

Each reusable section is serialized once for measurement. Complete packet sizes are sums of those section sizes plus exact JSON framing and occurrence metadata. `total_packet_bytes` is the sum for the proposed **physical occurrence intrinsic packets only**, including Held ones; it is not a forecast of all native calls, applicability, interface work, response evidence, or same-session accumulated input. `openLegacyCoherentPlan` constructs only a requested packet and rejects an oversized packet before construction. Its owned validated plan prevents caller mutation from bypassing these checks. Full plan validation/reconstruction is corpus work once per opened session, not once per materialized packet. The planner retains the graph and sections in memory; it is not a bounded-memory streaming implementation. It never raises native input/output, timeout or model limits.

### Canonical adapter boundary and exact blocker

The new packet is **not** `scoped-context-v1` and must not be sent as if it had a canonical receipt grammar. `plan.adapter` gives the prospective source-plan contract and stays Held. Integration would require these specific existing scoped machinery branches to support a NEW explicit partitioner:

1. `captureScopedPlan`/`plan`: freeze the coherent plan through the existing snapshot vault and bind its exact state/document/collection/section/occurrence/inbound identities. Retain the existing producer closure (including runtime test `author_instance`, candidate, plan, result digest, deterministic reuse and reuse QA).
2. `getUnit`/`reviewedUnitBundle`: dispatch only when the prospective partitioner is selected. A primary must identify `{plan_sha256, group_id, body_root, occurrence_id}` and an immutable bundle must contain the complete section, cuts, local qualifier sections, physical root/path/ancestry and inbound-context obligations. Supporting context cannot be accepted by hash alone. Range units keep their current grammar.
3. `coverage`: require every physical occurrence and each linked section's intrinsic coverage; reconcile every snapshot inbound edge without expanding repeated trees. Require all extracted items exactly once in applicability, including zero-item completeness judgments, all negatives and every declared interface. No ID/equality shortcut closes an occurrence.
4. Native extraction/applicability/interface/integration targets must retain the existing owner/control/membership freshness, independent native identities, completed job/artifact, exact delivered bundle, timing, response, receipt and negative-verdict closure. Applicability may differ per context. Independent interface review must assess missing/undeclared coupling, contradictions and current governing sets before publication/exclusion; unknown coupling cannot be auto-cleared.
5. Only after that prospective contract validates may canonical integration produce an exclusion proof and a provider mark the corresponding frontier entries accepted. Atomic operating publication and final provider wiring belong to the other components. This module supplies neither a fabricated receipt nor a permissive provider.

There is also an **implemented unchanged canonical fallback**:

```js
// Inside an existing authorized mutating Store transaction, before baseline changes:
const scopedDescriptor = captureLegacyCanonicalSource(state, p, {
  source_id: 'exact-original-source-id', transaction: store
});
// Caller saves the descriptor in the ordinary scoped plan record using its
// existing authorized engine path. Existing createScopedTarget and native worker
// then run extract -> applicability -> interface review -> integration.
// Existing validateScopedApply validates the completed canonical receipts.
```

This function checks exact baseline/membership and calls the existing `captureScopedPlan`; it does not convert coherent packets to range proofs or reduce that old path's costs. `legacyCanonicalCoverage(state, p, {integration_review_ids})` invokes existing `validateScopedApply` for every supplied integration. That validator enforces canonical delivery/producer/negative/receipt closure; arbitrary Pass-shaped data cannot count. It reports exact original-source proofs and missing sources, but **always holds coherent occurrence/context/cross-group completion**. Proof records added after capture change the frozen baseline; recapture the planning report against the resulting read snapshot before using this reporting helper. No old manifest, classification or failed evidence is rewritten. There is no claim that this fallback alone enables coherent resumption.

### Evidence and limits

The new fictional tests exercise repeated snapshots, old versions, late qualifiers, contradictory incoming contexts, retained unknown code/logs and negatives, canonical text, resealed coverage corruption, exact packet accounting, unchanged caps, mutable-caller isolation, and valid/invalid runtime-test producer links through existing SQLite/scoped capture. Runtime-test fixtures use canonical `author_instance`; no `job_id` is invented for valid test artifacts. Native reviews are not run by these tests.

For 10 versus 100 fictional repeated snapshot references, unique section bytes are 7,293 versus 48,098; largest intrinsic packet is 2,686 versus 2,692 bytes. This only demonstrates the fixture's factoring and accounting. It proves no actual-company fit. Complete native request bytes and same-session fit remain unknown, as do semantic acceptance, complete firstpass/interface proofs and live resumption.

The founder-provided query-only revision-1049 measurements remain external evidence: 9 sources, 335 top-level frontier occurrences, 16,066 unique typed nodes, 238 originals, 29,967,217 manifest bytes, 5,580,202 definition bytes and 52,185,029 baseline bytes. The old proposed groups each repeated 81,178,733 supporting bytes, yielding approximately 81–85 MB packets. A separate prior canonical-text experiment reduced 45,946,825 projection bytes to 5,712,151 exact typed-definition bytes with nine exact roundtrips. These observations are retained here as supplied measurements, **not rerun or independently verified results**. Neither exact encoding nor any hash establishes semantic acceptance. No actual company, network, installation, authority, host or release operation was accessed for this work.

Raw focused validation logs are [Node 22](../evals/legacy-coherent-20261106/node22.log) and [Node 25](../evals/legacy-coherent-20261106/node25.log). Commands use the explicitly requested binaries:

```sh
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/legacy-operating.test.mjs tests/legacy-coherent.test.mjs tests/scoped-context.test.mjs tests/upgrade-evidence.test.mjs
/opt/homebrew/bin/node --test tests/legacy-operating.test.mjs tests/legacy-coherent.test.mjs tests/scoped-context.test.mjs tests/upgrade-evidence.test.mjs
```
