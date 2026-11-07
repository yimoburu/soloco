Source-only incidence storage report — 2026-11-06

Changed source files (only):
- plugins/soloco/runtime/scoped-context.mjs
- tests/corpus-incidence-storage.test.mjs (new; eight fictional storage tests)
- docs/scoped-context.md (append only)

Fresh captures store a closed corpus-incidence-derivation-v1 descriptor in c.incidence, binding full validated projection/reference, ordered selected sources, producer closures, units and partition, plus exact relation hash and source/occurrence counts. Extraction identity binds that descriptor through the unchanged corpusIdentity formula. plan returns {v,c,material,incidence}, keeping c stored/exact and the full relation separate. corpusClaim/mapping/full validators still consume the full canonical relation. Unknown/mixed/inconsistent representations Hold. No generic codec, persistent store/index/schema/table or delivery projection changed. Two immutable derived cache entries contain no live authorization.

Preservation:
- Verbatim entry capture/plan/claim functions in new tests issue genuine incoming inline capsules; current validation preserves their full claims, packet/wire/stream/hash and identity. Genuine incoming no-incidence fixtures also preserve these contracts.
- Old and new corpus_plan_id reuse retain exact capsule reference/storage bytes and identity. Fresh descriptor identities intentionally differ.
- Ownership relation, incidence marker, coverage/STRING semantics, live corpus membership and native independence functions are byte-identical to entry. Existing identity formula unchanged.
- Current source/producer/membership/owner/native checks, full cell coverage, unknown conservative flags, frozen unselected/rejected contributor independence and exact raw original retrieval tested.

Validation on /opt/homebrew/bin/node (v25.2.1) and /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node (v22.13.0):
- Final new storage + existing construction: 12/12 pass on each (8 storage + 4 construction). Logs /private/tmp/incidence-storage-final-node{25,22}.log.
- Untouched tests/scoped-corpus-runtime.test.mjs: 12/14 pass on each. Two failures are direct c.incidence.sources reads at lines 490 and 522, assuming fresh capsules inline the closure; tests were not edited. Logs /private/tmp/incidence-storage-runtime-node{25,22}.log.
- Supplemental temporary copy preserves all behavioral assertions, resolving those two capsule-layout reads through validated plan().incidence: 14/14 pass on each. Logs /private/tmp/incidence-storage-reconstruction-corrected-node{25,22}.log. Initial temporary harness import-resolution failures are retained in separate earlier logs. Supplemental long runs preceded final missing-capsule-field guard ordering; final focused tests exercise that guard.
- Root FIT issued marked/unmarked equality check uses genuine entry capture on the exact frozen original, before extraction issuance, with saved entry implementation as byte baseline. Existing text/hash/stream pages/packet assertions unchanged: 1/1 pass on each. Logs /private/tmp/incidence-storage-issued-fit-corrected-node{25,22}.log. Temporary fixture and scripts remain in /private/tmp; root FIT source unchanged. Initial harness URL failures retained separately.
- Patch dry-run against exact runtime/docs entry and absent new test passes; no git repository created.

Synthetic measurements only (not actual corpus/native measurements):
Node 25:
{"sources":8,"occurrences":10,"descriptor_bytes":304,"capsule_bytes":962,"inline_capsule_bytes":39638,"relation_bytes":38980,"capture_ms":4.9082500000000024,"revalidate_ms":2.4391670000000047}
{"sources":32,"occurrences":34,"descriptor_bytes":305,"capsule_bytes":1655,"inline_capsule_bytes":610312,"relation_bytes":608962,"capture_ms":8.040666000000002,"revalidate_ms":5.226124999999996}
{"sources":64,"occurrences":66,"descriptor_bytes":305,"capsule_bytes":2585,"inline_capsule_bytes":2426378,"relation_bytes":2424098,"capture_ms":16.746499999999997,"revalidate_ms":9.207125000000005}
Node 22:
{"sources":8,"occurrences":10,"descriptor_bytes":304,"capsule_bytes":962,"inline_capsule_bytes":39638,"relation_bytes":38980,"capture_ms":4.752832999999995,"revalidate_ms":2.325540999999994}
{"sources":32,"occurrences":34,"descriptor_bytes":305,"capsule_bytes":1655,"inline_capsule_bytes":610312,"relation_bytes":608962,"capture_ms":8.301291999999997,"revalidate_ms":5.412791999999996}
{"sources":64,"occurrences":66,"descriptor_bytes":305,"capsule_bytes":2585,"inline_capsule_bytes":2426378,"relation_bytes":2424098,"capture_ms":19.197041999999996,"revalidate_ms":9.113124999999997}
Capture includes frozen corpus build, derivation/hash and retained capsule work; revalidation is warm derived-cache access plus live validation. At 64 fictional sources the full relation is 2,424,098 bytes, inline capsule 2,426,378 bytes, descriptor capsule 2,585 bytes, descriptor 305 bytes. No claim of byte reduction for raw originals.

Remaining actual measurements: full 336-source/78,453-occurrence descriptor/capsule/vault bytes, cold/warm CPU and peak memory on the actual frozen corpus, complete native delivery fit, independent semantic QA, full actual qualification. Incoming reported relation size 108,990,432 bytes and 107,654,911 repeated references were supplied defect evidence, not remeasured here. No actual plan was created or adopted. Existing native failures/blocked receipts remain evidence. No real-company .company writes, network/services/spending/adoption/release/resume occurred. Tests use temporary fictional companies and scripted adapters; no actual native acceptance.

Artifacts:
- /private/tmp/soloco-incidence-storage-20261106/source-only.patch
- runtime baseline /private/tmp/soloco-incidence-storage-20261106/entry-scoped-context.mjs
- docs baseline /private/tmp/soloco-incidence-storage-entry-docs.md
Patch SHA256: ad9d5d0b4349d3ed238b766ae46c1098e4491478b1087d65f4019b0afba8258b
