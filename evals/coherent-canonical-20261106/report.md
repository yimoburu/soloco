# Coherent canonical source slice — 2026-11-06

Base: `9b0ad656373810aedc18b1f25622ddb83eef6053`. Public source work only. No actual company access, network, settings, model/tier switch, installation, release, adoption, remote actions, or subagents. No version bump. No independent QA or live handover acceptance claim. Existing exact v0.18 governance, failures, unknowns and independent `resume_handover` gate remain unchanged.

## Deliverable and APIs

- `plugins/soloco/runtime/scoped-context.mjs`: explicit `COHERENT_PARTITIONER = "coherent-source-v1"`; new branch in existing `captureScopedPlan`, plan validation, unit/bundle construction, coverage, extraction semantic validation and bounded assignment. Reuses canonical `producerClosure`, independent native checks, worker receipts, negative closure and `validateScopedApply`.
- `plugins/soloco/runtime/main.mjs`: public `company_context` partitioner enum; coherent extraction can explicitly opt into existing `scoped-stream-v1`.
- `plugins/soloco/runtime/legacy-operating.mjs`: `captureLegacyCanonicalSource(..., {partitioner})` selects the new path explicitly. Omission retains old range behavior. Existing full planning adapter/frontier remain Held.
- `tests/scoped-coherent-runtime.test.mjs`: six focused tests using clearly labelled fictional adapters through real store/engine/worker/public APIs.
- `tests/legacy-coherent.test.mjs`: existing adapter test also verifies explicit coherent capture and distinct extraction identity.
- `docs/legacy-operating.md`: precise prospective source contract and unsupported boundaries.

No edits to operating-state guards/provenance or public control continuity components. Existing context/worker streaming interfaces already support complete same-native packets; only scoped admission needed the prospective extraction branch.

## Proof claim

This is a usable connected **complete selected source plus transitive immutable-original closure**, not complete-company migration. It freezes original source, typed STRING representation, local sections, exact cuts, ordered member coverage, physical occurrences/ancestry and original inbound contexts. Native bundles retain full local qualifier bodies. Canonical proof validation requires every occurrence, every item and independent global context interfaces before exclusion of that one source. Byte identity does not confer applicability. Identical bodies in different ancestors retain separate provenance and separate extraction/interface acceptance.

Exact same occurrence bundles may reuse an existing canonical worker receipt. No cross-occurrence intrinsic reuse optimization is implemented. No mechanical DAG node or 2,400-byte serialization subdivision becomes a coherent extraction task. Current rules are delivered by later applicability/interface/integration phases. Unknown/distant coupling remains explicit mandatory interface work; incomplete understanding must hold.

Runtime-test producers use existing `author_instance -> development_test`, candidate/run/receipt, result digest and deterministic-reuse QA closure. No fabricated `job_id`. Limits remain 48,000 bytes per native request, 12,000 parsed / 48,000 wire output bytes and existing 600-second execution policy. Streaming permits full coherent bundles only prospectively; cumulative native fit remains unproven.

## Remaining blocker and next patch

Full SoloDev resumption is **not established**. The supplied 52 MB / 238 originals / 335 source / 5.58 MB DAG metadata was not remeasured; no company/report bodies were read. Whole-company membership/occurrence reconciliation, operating-provider publication and live independent handover acceptance remain outstanding.

The next source patch should extend this same scoped capsule/coverage path to a shared frozen corpus: bind its source membership and retained named original dependencies, separate reusable intrinsic body claims from mandatory occurrence applicability/interfaces, and let exact per-source applications reference those accepted common receipts. It must not treat the planner's Held adapter or a source receipt as full-frontier completion. Current source-local captures can repeat originals across different source plans and do not yet deliver the intended corpus-wide “meaning once” optimization. External legacy named handover locators hold when their named record is outside the captured source closure. Oversized indivisible output and cumulative same-native capacity still hold; no arbitrary cap increase or full-baseline fallback was introduced.

## Focused validation

Raw logs retain the commands' complete output. Final focused suite: 14 tests (8 planner/adapter + 6 connected runtime tests) per runtime. Compatibility selection: 3 existing range/stream tests per runtime. All selected runs finish below 60 seconds; no full suite or compatibility matrix was run. CoS owns the broader matrix.

Commands:

```sh
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/scoped-coherent-runtime.test.mjs tests/legacy-coherent.test.mjs
/opt/homebrew/bin/node --test tests/scoped-coherent-runtime.test.mjs tests/legacy-coherent.test.mjs
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test --test-name-pattern='source-only extraction survives|canonical receipt rejects forged|recovery stream canonical current freshness' tests/scoped-context.test.mjs
/opt/homebrew/bin/node --test --test-name-pattern='source-only extraction survives|canonical receipt rejects forged|recovery stream canonical current freshness' tests/scoped-context.test.mjs
```

Final results: Node v22.13.0 focused **14/14**, 5.069 seconds; Node v25.2.1 focused **14/14**, 5.348 seconds. Selected compatibility tests **3/3** on each runtime (4.409 and 4.775 seconds). `git diff --check` passed.

Logs: `node22-focused.log`, `node25-focused.log`, `node22-compat.log`, `node25-compat.log`. The earlier `node25-initial.log` is retained as a failed run: 3 passed / 2 failed (test supplied extra public API arguments and expected only one of two valid hold reasons). Those fixture/assertion errors were corrected; that run is not claimed as passing. No discarded or timed-out prior run is claimed as accepted.

No git index write or commit attempted; changes and an exact patch are left for CoS. Patch: `source.patch` (includes source, tests, documentation and raw logs; excludes itself).
