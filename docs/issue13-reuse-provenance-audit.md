# Issue 13 follow-up: validation reuse provenance

The merged source at `38d95fd6463fedef68e61737bdb2d4af4b05c756` integrates the
concurrent storage repair. Its retained storage benchmark passes 10/100/1,000
archives with 72 exact commits, nine closed children, preserved archive bytes,
no child archive-body/full-state reads and no writes after pause. The original
storage failures in `docs/issue13-hot-path-audit.md` remain historical evidence.

This independent follow-up reproduced two additional defects in the original
deterministic-reuse workstream with actual macOS sandbox test execution:

- Changing the original qualification job's artifact pointer to a different
  review still produced a completed reuse receipt.
- Changing that job's native identity after reuse still allowed a new independent
  review and acceptance of the reused result.

The original failing TAP and its exact regression test source are retained in
`evals/issue13-reuse-provenance-20261107`. They remain failures. The test adapters
produce fictional model judgments; the runtime, storage, candidate execution,
reuse and acceptance paths are real. No model CLI was invoked.

Independent review also reproduced lost original-author closure and a source
receipt mutation at the publication writer fence. The latter emitted a Submitted
reuse receipt on the intermediate candidate even though acceptance later held.
Those original probe outputs remain retained. Publication now revalidates the
current source receipt's successful result, exact body/hash and canonical links,
as well as qualification and producer identity.

## Repair

Reuse admission now verifies the original runtime controller's exact ID,
candidate and plan links, and the complete candidate-generation/QA ownership and
review-target links. Both model producers require confirmed process closure.
Every native/instance identity combination must remain independent.

New receipts retain hash-bound references to the entire original QA and
candidate-generation jobs, separately from the existing exact qualification
record reference. Publication rechecks these references inside the writer
transaction. Acceptance rechecks them and the canonical qualification, original
executed receipt, relevant fingerprints and negative reviews. A later producer
change cannot become a reusable Pass merely because the qualification record
itself is unchanged. Missing producer bindings hold older pending reuse receipts;
existing accepted records and judgments are not rewritten or promoted.

Unrelated current task context is not a dependency of the historical deterministic
qualification. Existing environment/source invalidation, negative-review vetoes,
original execution attribution, non-chained reuse and fresh independent new
candidate review remain required.

Final affected validation passed **86/86** on Node 22.23.2 with zero failures,
cancellations or skips and actual `macos-seatbelt-node` execution. It covers all
development, validation-cache, transfer-integrity, scoped coherent-runtime and
public represented-v2 tests, including 20 producer/source/identity mutations and
the publication race. Syntax and whitespace checks pass. `validation.json`
records exact final source/runtime/log hashes; earlier passing logs are
intermediate observations, not final-source acceptance.

## Consolidated acceptance disposition

| Original scope | Delivered evidence | Remaining acceptance |
| --- | --- | --- |
| Ordinary context (#17) | Source-linked reviewed applicability, bounded retrieval, fixed-active-work growth fixtures and stale/disjoint-work regressions. | Matched native accepted-task quality, retries, missed blockers, interruptions and total latency at the declared archive scales. |
| Storage (#14) | Targeted operations, explicit migration/restore and integrity checks; integrated concurrent growth fixture now passes. | Current metadata hashing still depends on archive size; no constant total CPU/storage or production speedup claim is established. |
| Upgrade understanding (#13) | Current reviewed projection, retained originals, independent retrieval, incremental steps, guarded apply/readback and historical small native qualification evidence. | First-bootstrap capacity for the intended large corpus, native semantic omission/continuity evidence, and matched total review-work/accepted-outcome growth measurements. |
| Deterministic reuse (#19) | Exact fingerprints, attributed original execution, independent determinism qualification and fresh acceptance; this follow-up repairs producer lineage and identity revalidation. | Matched ordinary-task/release accepted-outcome evaluation, including incorrect reuse, failures caught and recovery. |

The issue was automatically closed as completed when PR #34 merged, although its
body and completion rule retain the unevaluated requirements above. This follow-up
does not establish all consolidated acceptance. Keep that distinction explicit:
completed engineering fixes do not turn unexecuted native qualification or
comparative research into passing evidence. Reopening the residual acceptance
work is consistent with the original completion rule; ending that research would
need an explicit `not_planned` disposition rather than a completion claim.

No actual company, installation, pinned governance, migration, adoption, ownership,
pause state, historical verdict or notice was changed by this source audit.
