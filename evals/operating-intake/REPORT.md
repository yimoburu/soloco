# Normalized storage intake — source patch

Base: `1890827`. Only `runtime/store.mjs`, `runtime/record-storage.mjs`, a new focused storage test, and these evaluation artifacts changed. No commit, company access, network, settings, installation, release, adoption, model calls, or subagents. Tests use disposable synthetic companies. This is implementation verification, not independent QA or live company resumption. No semantic acceptance or action authority is granted.

## Integration API

```js
const baseline = store.captureIntakeBaseline();
// Bind this complete runtime-produced baseline and its sha256 into the
// independently reviewed proposal before using it as the checkpoint origin.
const intake = store.readIntake(baseline);          // exact old/new references
const withBytes = store.readIntake(baseline, {values: true});
```

Both Store methods execute inside the existing read snapshot. Baseline capture is read-only and body-free: it returns the normalized metadata inventory (`family`, exact logical `key`, `position`, `sha256`, `encoding`), canonical layout identity, metadata root, current event sequence, tail-event hash, and a checksum of the baseline. Its checksum is mechanical integrity evidence; the caller must bind the actual runtime-produced baseline into the independently reviewed proposal. A caller-supplied or freshly substituted baseline does not establish continuity with an earlier review.

`readIntake` returns `baseline_sha256`, an exact current `cut` (layout, sequence, tail-event hash and metadata root), and consecutive events. Each event preserves its payload, including revision/owner, and provides metadata `changes` with `before`/`after` references; `null` denotes absence. No field or event type is semantically exempted. `{values:true}` adds complete exact JSON `raw` bytes to each changed old/new reference. References can also be read with the existing `readImmutable(store.db, reference.sha256)` hash-checked reader. Shape and journal descriptors remain their exact stored values; the API does not manufacture reconstructed journal snapshots.

Every exception is a hold. The reader checks the bound baseline checksum/root, baseline tail anchor, consecutive/complete event coverage, event bytes/checksum and predecessor hash, layout identity, before/after identities and chain, each metadata root, and exact current metadata. It hash-checks and JSON-parses every directly referenced immutable entry across baseline, intermediate states and current state, including deleted old values and unchanged entries. Shape/journal encodings and journal child coverage are checked. Pre-baseline event bodies are not replayed; their historical bytes remain unchanged.

For a successor proposal, capture its new baseline and read the previous intake inside the same `store.readSnapshot(...)` if they must share one cut. Binding/reviewing that successor baseline and semantic transition classification belong to the integrating consumer. A later write requires a new intake read; a returned cut never authorizes later action automatically.

## Storage changes and limits

The existing transaction, selectedTransaction and appendUpgradeCall paths capture metadata before/after writes and add `storage_delta` to their existing event row, in the same SQLite transaction. Existing revision/owner fields remain. The delta stores only changed entry metadata, roots, layout identity and hash-chain information. No old event is rewritten, and immutable_values remains the only value store. Rollback removes writes and event together.

Exact intake supports normalized v4 only. Legacy JSON and v1–v3 intake hold for explicit migration; capture/read never migrate. Existing legacy JSON event payloads and ordinary new-company behavior remain unchanged; normalized older-layout writes still produce deltas. No existing test fixture/assertion was modified.

Layout identity includes canonical table/index/trigger definitions and company_layout rows. Discardable `public_read_*` derived machinery is excluded. Metadata capture scans the entry inventory, never joins historical bodies, and event size follows the actual delta. Selected writes and native-return appends retain their existing selected-body behavior. Explicit intake verification deliberately reads referenced immutable bodies, retaining only a hash set for repeated validation, and replays metadata inventories; it is not a paging/performance framework.

Coverage concerns normalized entries and their directly referenced immutable values. It does not walk arbitrary nested application references, cover filesystem artifacts, classify transitions, prove semantic completeness/acceptance, or introduce an adoption path. Rollback below the externally bound baseline holds; detection of a rollback wholly after that baseline requires the caller to retain/bind its later reviewed cut/baseline. Checksums are not signatures or protection against coordinated database-and-evidence forgery.

## Focused validation

Final runs: **24/24 pass on Node v22.13.0; 24/24 pass on Node v25.2.1**, exit 0 for both. Exact commands are in `commands.txt`; full output is in `node22-storage.log` and `node25-storage.log`.

The eight new tests cover full/selected writes, selected/full deletion, array reorder, position-only object reorder, shape changes, exact unsafe keys, unknown fields, old/new byte retrieval, upgrade append without prior journal-body reads, selected writes without unrelated historical-body reads, gaps, changed event envelopes/payloads/bytes, uncovered writers, changed/unlogged end state, absent/corrupt old/intermediate/new/unchanged values, schema/version/index/fence incompatibility, ambiguous encoding, rollback below baseline, failed-write atomicity, and inconsistent roots/chains even with a recomputed event checksum. Existing layout/transfer tests cover legacy behavior, explicit migrations, identity retention and restore integrity.

The initial Node22 diagnostic had 18 passes and one failed corruption injection because SQLite foreign keys correctly prevented deletion. The test now disables foreign keys only to simulate missing immutable data; production code was not changed for that failure. That initial log is retained as `node22-initial.log`.
