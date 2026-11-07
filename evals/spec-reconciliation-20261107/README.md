# SPEC reconciliation evidence — November 7, 2026

This package supports the [47-row SPEC ledger](../../docs/spec-reconciliation.md).
It records local executed tests and a bounded native fixture. It is not a full
SPEC-conformance certificate, GitHub CI result, company acceptance, installation,
or adoption.

## Source and validation

Implementation: `9160c2655cc14a5e5f1ff1690d5358e8c08b4f92`.
Original audit baseline: `7b6d6d53f37c6923399284d51e5b9f96dd255545`.
Unchanged SPEC SHA-256:
`28f99838abc3794da94f97f7a2d234554811da3aef7b8ddb3742075caa78ec36`.
The evidence/documentation commit changes no executable source after this pin.

| Check | Source | Result |
|---|---|---|
| Full Node 22.23.2 suite | `9160c26` | 1121/1121, zero failures/skips |
| Node 26.13.0 compatibility + changed boundaries | `9160c26` | 429/429, zero failures/skips |
| Integrated Node 22 regression + changed boundaries | `c4fd3c5` | 780/780, zero failures/skips |
| Initial complete Node 22 run, retained failure | `cc0edb5` | 1104/1105; one stale expectation |
| Baseline invariant regression | `7b6d6d5` + new tests | 1 pass, 13 failures |
| Build/governance drift and whitespace | `9160c26` plus evidence/docs only | Passed |
| Native fixture before transport fix | `cc0edb5` | Failed/needs attention; closure confirmed |
| Fresh native fixture after transport fix | `19414e6` | Passed bounded native fixture |

The full-suite, regression and compatibility JSON receipts record before/after
commit and tree, clean status, selected files,
Node version, exit status, counts and SHA-256 of the corresponding decompressed
TAP. Gzip files preserve complete test output. Final passing logs are also checked
with the repository's strict `tapCounts` parser, including complete plans and
absence of skipped/TODO/cancelled assertions. Counts across lanes overlap and
must not be summed as distinct tests. The compatibility lane is deliberately a
subset plus the changed boundary tests; the full Node 22 lane covers all test files.
Tests use fictional model doubles except the separately identified native fixture.
The sandbox tests execute the real macOS isolation boundary.

The baseline invariant test run retains 13 failures and 1 pass across 14 tests.
It applies the new regression tests to the original baseline source archive.
The first complete Node 22 run at `cc0edb5` retains its one failure: an old test
expected a reused-native review to publish before rejection. The corrected test
verifies the earlier gate and retained evidence. A still earlier interrupted run
is incomplete, remains local, and supplies no passing claim.

## Native evidence

`spec-native-cc0edb5.json` preserves the failed outcome: one rejected producer,
no artifact, no QA/receiver attempt, and confirmed native closure.
`spec-native-19414e6.json` records the fresh, separate fixture after the transport
repair. It passed artifact generation, independent review, receiver handoff, peer-message
disposition, supervisor recovery without duplicate attempts, idle behavior, and
closure. Each task had one allowed attempt. The original fixture was not reset.
Native IDs are represented by SHA-256, preserving distinctness without publishing
raw session identifiers. Original full receipt hashes are included; those receipts
and raw CLI diagnostics remain local because they include host configuration.

The successful fixture source is **19414e6**, not the integrated implementation
pin. Subsequent changes from main affect development receipt provenance and the
candidate-format verifier; the test correction affects operating-state assertions.
The async adapter/worker/task implementation and harness are unchanged. Native
model-session replacement, actual company adoption, Hooks UI trust, effective
provider settings and realistic large-history semantic fit remain unverified.

[Independent source review](independent-review.md) inspected the original failures,
actual native artifact and peer bindings, and all 40 runtime/harness source hashes.
The source-review Pass remains scoped to that reviewed delta and evidence.

## Reproduction

At a clean checkout of the implementation pin, use supported Node 22 on macOS:

```sh
node tools/build-plugin.mjs --check
git diff --check
node --no-warnings --test --test-concurrency=4 --test-reporter=tap tests/*.test.mjs
```

For Node 26 use the exact `test_files` selection in `compatibility-node26.json`.
Native reproduction is a new inference-consuming fixture and requires a fresh
output directory and an explicitly supported catalog model:

```sh
node tools/async-runtime-acceptance.mjs --run-native --model MODEL_ID --output-dir NEW_DIRECTORY
```

Do not rerun into a retained fixture or reinterpret a prior failure as success.
