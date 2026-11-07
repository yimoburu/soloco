# Node 22 CI feedback and qualification

PR #34's original required Node 22 job combined routine regression with long
whole-history qualification. The complete local suite took 349.69 seconds.
The replacement PR regression tier passed 679 tests in 39.02 seconds on Node
22.23.4, with zero failures, cancellations, skips or todos. This is a smaller,
explicit coverage scope, not a claim that the full suite became nine times faster.
The exact selected and omitted file inventories are in schema-3 receipts.

`Tests Node 22` remains the required PR job name. It runs every test file except
the 17 measured expensive files listed in `tools/ci/evidence.mjs` and
[CI documentation](ci.md). Newly added files enter regression automatically.
Task authorization, corruption, restore, sandbox, API and integration regressions
remain in the PR tier. Node 26 compatibility and build/drift remain required.
The separate `Full qualification` workflow runs every test on pushes to `main`
and manual dispatch. Local full execution remains `node tools/ci/run.mjs tests-22
/absolute/output`. Omitted tests are not reported as skipped or passing.

## Actual failed job

[Run 42390174231](https://github.com/yimoburu/soloco/actions/runs/42390174231)
failed before any test command started. Its exact-head artifact for `2912c93`
records Node 22.23.4, zero checks and `Cannot establish Node runtime library
allowlist`. The former implementation discarded the `otool` diagnostic, so the
exact underlying error is unknown. The short duration is consistent with the
old two-second probe timeout; that is an inference, not a reproduced cause.

Trusted runtime inspection now permits a five-second tool launch, retries only
one ETIMEDOUT within a shared 15-second discovery allowance, and prints the
specific tool failure. Permission errors, invalid libraries and unsupported
isolation still fail. Actual Seatbelt startup passes locally on the exact Node
22.23.4 patch. Test execution deadlines and sandbox policy remain unchanged.

## Runtime work eliminated

- Qualification reuses exact UTF-8 counts and marker scans only for already
  validated immutable JSON. Reviewer identity membership is indexed once per
  synchronous validation; subsequent calls rebuild it from live state.
- Operating intake validates its current cut once instead of reading the entire
  same cut twice. Exact captured fields remain checked. Already validated row
  bytes may be reused within that one read snapshot, capped at 8 MiB; oversized
  values retain the original path and later calls always revalidate.
- Stream binary-search probes use a fixed-width digest placeholder for size
  accounting, then hash the selected range. Structural encoding no longer
  serializes non-dictionary candidates for a discarded lookup key. Final wire
  bytes and complete dictionaries are unchanged.

| Exact fixture | Before | After | Evidence |
| --- | --- | --- | --- |
| 3.36M-character, 857-session qualification | 20.89s | 10.79s | [Receipt](../evals/performance-qualification-20261107/receipt.json); all non-time metrics equal |
| Seven-group mixed-negative corpus bootstrap | 124.06s | 102.01s | [Receipt](../evals/node22-corpus-speed-20261107/receipt.json); exact wire/dictionary goldens |
| Large operating publication | 31.90s | 28.06s | [Receipt](../evals/performance-intake-2026-11-07/summary.json) |

These are single local comparisons on a shared host, with profiling disclosed in
the receipts. They do not promise hosted latency or native semantic acceptance.
Focused qualifications, source/cut corruption checks, reviewer-independence
regressions, UTF-8/depth/proxy safeguards, stream goldens and actual sandbox tests
pass. Independent reviews found and repaired a post-probe deadline gap and two
CI evidence-reporting errors before integration. Original failures remain failed.

Integrated runtime/CI candidate `8f6c740` passed Node 22.23.4 regression 679/679
and Node 26.13.0 compatibility 266/266, zero skips, with actual Seatbelt; packaging
and whitespace commands exit zero. Before/after source manifests are identical.
Local receipts remain explicitly local and do not establish hosted CI success.
