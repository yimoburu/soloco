# Issue 13: actual concurrent storage growth evidence

Issue #13 remains **open**. Its four consolidated workstreams have substantial
implemented contracts, but the default branch still fails the new concurrent
storage growth fixture. Existing branch improvements pass this fixture separately;
their compatibility with the default branch's newer intake evidence is not proved
by that comparison. Native semantic bootstrap, quality and time to accepted outcome
also remain unqualified. This report closes no company notice or failed review.

## Exact sources and execution

- Default branch: `9c0cb8a9d40da42242787b1bbaacfa11ba37acdc`.
- Existing scalability branch: `0baab91454970f4965537edf87e3b1f52a241be0`.
- Every report contains all runtime `.mjs` SHA256 values, the benchmark SHA256,
  Node executable SHA256, Node version, OS release and architecture. Source
  manifests are checked again after successful trials.
- Disposable fictional folders only. No actual company, checkout source, company
  ownership, paused state, installed package or adopted team was changed.
- All runs use the same declared scales (10/100/1,000 archived records), three real
  child processes and eight committed receipts per child. No model call occurs.
  Each child performs actual selected reads and writes, then observes a committed
  pause and attempts a receipt that must be rejected inside the writer transaction.
- SQL-result observation counts returned bytes/rows and any returned archive body.
  The observer itself adds overhead. A separate default-branch diagnostic disables
  SQL observation; it still reproduces the lock failure. Unknown measurements in
  that run are `null`, not zero. The two diagnostics were independent runs; their
  timing distributions are not statistical production comparisons.

## Predeclared correctness requirements

The protocol is defined before trials in
[`benchmark-storage-hot-paths.mjs`](../tools/benchmark-storage-hot-paths.mjs).
It requires all 24 distinct receipts exactly once at each scale, no changed archive
bytes, no child full-state or archive-body reads, no committed receipt after pause,
and confirmed child-process exit before successful completion. The five-second
pause and 30-second trial bounds detect nontermination. Timing distributions have
no performance Pass threshold and provide no provider cancellation guarantee.
SQLite's existing five-second busy timeout is unchanged. The benchmark adds no
application retry or larger runtime allowance.

| Source/runtime | 10 records | 100 records | 1,000 records |
|---|---|---|---|
| Default branch, Node 25.2.1, SQL observation | 24 receipts; all checks pass | 24 receipts; all checks pass | **Fail: database is locked** |
| Default branch, Node 25.2.1, minimal observation | 24 receipts; measured checks pass | 24 receipts; measured checks pass | **Fail: database is locked** |
| Existing scalability branch, Node 25.2.1 | 24 receipts; all checks pass | 24 receipts; all checks pass | 24 receipts; all checks pass |
| Existing scalability branch, Node 22.13.0 | 24 receipts; all checks pass | 24 receipts; all checks pass | 24 receipts; all checks pass |

For the final protocol-v2 branch runs, every scale confirms three closed children, zero child
full-state/archive-body reads, zero changed archive bytes, and zero commits after
pause. The parent records pause COMMIT start/end times: exact visibility time is
unknown inside that interval. Final observation intervals have minimum bounds of
1–7ms and maximum bounds of 3–10ms on Node 25, and minimum bounds of 2–7ms and
maximum bounds of 5–10ms on Node 22. These are host observations for this fixture,
not cancellation SLAs. The benchmark
does not execute ordinary native specialists or establish descendant termination.

The instrumented default-branch run's per-writer median held-lock samples grow
from approximately 7–14ms at 10 archives to 118–137ms at 100. The existing branch's
held-lock medians span approximately 3–9ms across all scales. Different canonical
contracts and observer overhead prevent assigning this whole difference to one
implementation change.

## Failure path and integration boundary

The default-branch child fails at `BEGIN IMMEDIATE` in
`Store.selectedTransaction`, after waiting for another writer. No failed trial is
reported as a successful row. Both original failures, their complete error stacks,
partial successful rows, source manifests and environment identities are retained.
The first run's exact original benchmark source is also retained and its SHA256
matches that run's receipt.

Protocol v2 repairs a benchmark timing oracle that recorded the parent's timestamp
only after COMMIT returned. A child can legitimately observe the commit before
that timestamp. The final oracle uses the enclosing interval and never rejects
such a valid observation. Earlier protocol-v1 reports and both exact earlier
benchmark sources remain retained; they are not relabeled as v2 runs. Protocol v2
also bounds child stderr at 64KiB and records failed scale, progress and actual
child exit/signal/termination-request details. A timing-only diagnostic is not a
full archive-read qualification.

The default-branch writer holds the transaction while it executes:

1. `captureStorageMetadata`: scans complete `state_entries` metadata and validates
   keys, including repeated layout/key queries.
2. `writeNormalizedSelection` → `finishPublicIndex`: reconstructs every projected
   collection, deletes/rebuilds public rows and rebuilds the catalog.
3. `insertStorageEvent` → a second `captureStorageMetadata`: derives and records
   the exact before/after intake delta.

The existing scalability branch uses incremental public index updates and other
validated-state improvements. That exact committed branch lacks the newer
default-branch `captureStorageMetadata`/`insertStorageEvent` intake contract. Its
passing benchmark is useful evidence for the existing implementation, but does
not prove an integrated fix preserves intake continuity. No duplicate runtime port
or timeout increase is included here. Run this benchmark on a reviewed combination
that preserves exact intake and all freshness/authority gates before closing the
storage portion of #13.

## Consolidated acceptance audit

| Original scope | Implemented evidence in default branch | Remaining material acceptance |
|---|---|---|
| #17 ordinary context | Explicit reviewed applicability; source/hash-bound retrieval; conservative unclassified obligations; disjoint/stale-source and rename regressions | Real semantic bootstrap and accepted-task quality/latency comparison; unknown history stays held |
| #14 storage/polling | Explicit normalized migration; immutable originals; selected reads/writes; backup/restore, corruption and stale-writer checks | Concurrent growth fixture fails as above; safe incremental index/intake integration remains |
| #13 upgrades | Reviewed current projection, incremental accepted operating input, exact frozen evidence and independent guarded apply/readback | First actual bootstrap feasibility and finite native fit remain unproved; deterministic page counts do not establish semantic quality or accepted outcome |
| #19 validation reuse | Exact source/test/runtime/environment/sandbox fingerprints; original successful receipts; independent determinism qualification and fresh candidate review | No production accepted-outcome speedup or model-quality claim; missing fingerprints remain non-reusable |

The repository-owned earlier growth benchmark explicitly records zero model calls.
Its fixture classifications cannot establish real historical understanding.
`docs/operating-state.md` likewise retains unproved first-bootstrap feasibility.
Neither a smaller packet nor this benchmark's passing branch run closes the whole
consolidated issue.

## Reproduction and retained receipts

Run from the chosen exact source tree after adding this benchmark:

```sh
node --no-warnings tools/benchmark-storage-hot-paths.mjs
node --no-warnings tools/benchmark-storage-hot-paths.mjs --minimal-observation
/path/to/node22 --no-warnings tools/benchmark-storage-hot-paths.mjs
```

The minimal-observation mode is diagnostic and reports `diagnostic_completed` only
if its measured checks finish; it cannot claim the omitted SQL/archive-read check.
Any failure exits nonzero and reports `failed`, not a cacheable success.

Receipts live in [`evals/issue13-hot-paths-20261107`](../evals/issue13-hot-paths-20261107):
`node25-initial.json`, `node25-main-minimal.json`, `node25-0baab91.json`,
`node22-0baab91.json`, final `node25-0baab91-final.json` and
`node22-0baab91-final.json`, accompanying stderr, `benchmark-initial-source.mjs`
and `benchmark-comparison-source.mjs`.
The final benchmark also passes Node 22.13 and Node 25.2 syntax checks. A separate
exact-default-branch targeted verification passed 26 tests, with one development
sandbox test skipped because nested `sandbox-exec` is unavailable in this session;
this skip is not execution evidence for that development path.
