# Operating negative retention source QA

Base: `34b4650f9618dad5b0e74918d85c69fc54209869` (verified exact). No commit.

Only runtime change: `plugins/soloco/runtime/worker.mjs`. New focused test: `tests/operating-negative-retention.test.mjs`. All remaining additions are in this evidence directory. Existing operating, scoped, snapshot and other tests are unchanged.

## Repair

Failure retention now recognizes frozen operating evidence and inline operating-plan reviews, including exceptions before `artifact` assignment. It parses the complete observed envelope solely for negative retention, preserves a genuine Fail/Blocked verdict and its complete reason separately from the runtime failure reason, and keeps malformed JSON unknown. Original fence/whitespace/body bytes are unchanged in retained raw text. A clipped preview now points to the existing immutable snapshot vault (`rejected_output.original`), staged before slicing. No parallel archive exists. Fail precedence over Blocked remains compatible with qualification behavior.

No parser, delivery, independence, timeout, cancellation, publication, owner, or governance gate was loosened. Observed native IDs retain the existing failure-path treatment; failed responses do not populate accepted resumable sessions. Scope includes inline operating reviews because they have the same pre-assignment failure. Shared retention adds complete originals for clipped qualification/artifact failures as required to prevent loss; successful non-operating completion logic is untouched.

## Focused verification

11/11 passed on Node 25 and 11/11 on Node 22.13.0. Actual normalized disposable Stores, public `company_context` plan/apply/inspect/read, actual worker claim/spawn/return/failure transactions. All adapter judgments/native identifiers are explicitly FICTIONAL contract doubles. These results are not native semantic acceptance.

Cases: early empty-body Blocked; oversized body with Fail after the preview boundary; fenced oversized Blocked; malformed JSON with no inferred negative; oversized invalid raw with exact retrieval; invalid-body Pass grants no approval; canceled late Blocked; changed-native late Blocked after a genuine frozen read round; legacy represented-v2 qualification Fail; oversized complete negative reason; small inline operating negative. Rejected operating responses create no artifact, cannot publish, and inspection remains Held. Clipped cases reopen the Store, verify exact vault JSON, page public snapshot reads following actual returned lengths, check range hashes, and reconstruct the exact original. Full negative reasons include multiline fenced counterevidence.

## Initial failures retained

`initial-node25.log`: fixture lacked required source_instruction (9 setup failures).
`reproduction-node25.log`: fixture lacked required explicit timeout reason (9 setup failures).
`base-reproduction-node25.log`: fixtures were still inline/v1 and did not enter frozen evidence paths (9 setup failures).
`defect-reproduction-node25.log`: eight operating cases reached the original defect and lost rejected_output; qualification fixture still lacked required coverage (9 failures total).
`repair-node25.log`: three passed; five retrieval assertions incorrectly advanced by requested rather than returned bounded range length, and qualification fixture lacked coverage (6 failures). Corrected the test client to honor the existing public bounded response contract. No production snapshot/API change.
No automatic unchanged retry. Every subsequent run followed a concrete fixture/source adjustment or used a different runtime/scope. All failed logs remain intact.

## Regression verification

Published worker + cancellation: per runtime, 61 tests, 60 passed, 0 failed, 1 skipped. The existing constrained-process progress test skipped because sandbox-exec could not apply the host sandbox; no fallback was used. Both Node versions have receipts.

Selected adjacent regressions: 13 passed, 0 failed on each runtime (includes existing nested subtests). Selection covers omitted qualification output channels, malformed raw qualification, unknown-key negative retention, frozen operating unread/native/membership rejection, rejected publication-native exclusion, older scoped canonical identity preservation, and changed stream-native observation. See `selected-adjacent-node25.log` and `selected-adjacent-node22.log`.

The broad five-file adjacent runs were interrupted with Ctrl-C around elapsed 390 seconds to preserve the user's cutoff. They are incomplete and are not claimed as passes. The Node 25 runner emitted three file-level pending-promise errors during interruption; Node 22 retained partial TAP output. No unchanged retry occurred: the follow-up selected only seven named cases (13 including nested cases) and completed in about six seconds per runtime. The broad stress suites remain unverified.

Final focused tests reran after making temporary-directory setup self-contained: 11/11 passed on each runtime. The Node 25 command also demonstrates that no pre-created temporary parent is required. Final complete-scope totals per runtime: **85 tests, 84 passed, 0 failed, 1 host-sandbox skip** (11 focused + 13 selected adjacent + 61 published-worker/cancellation). Earlier passes/reproductions are not double-counted.

`git diff --check` passed. All testing completed by 23:02:32 UTC, 451 seconds after the recorded start, before the 480-second cutoff.

## Limits and evidence

No actual company data, external network, installation, external publication, adoption/governance/owner changes, additional agents, or commits. All test temporary paths are inside this checkout. Adjacent runs set TMPDIR explicitly; the new suite explicitly creates its disposable company/data roots inside this evidence directory, including its final standalone Node 25 run. The separate environment `ps` inspection was denied and was not retried; its output is retained. SQLite experimental warnings are runtime warnings, not test failures. This narrow repair retains failed evidence; it supplies no semantic review acceptance or authority.

Exact validation commands: `commands.sh`. Runtime/base metadata: `environment.json`. Runtime + new-test patch: `source.diff`. Every run has its own immutable log filename in `rawlogs/`.

## Exact changed-file inventory

- `plugins/soloco/runtime/worker.mjs`
- `tests/operating-negative-retention.test.mjs`
- `evals/operating-negative-retention/commands.sh`
- `evals/operating-negative-retention/environment.json`
- `evals/operating-negative-retention/rawlogs/adjacent-node22.log`
- `evals/operating-negative-retention/rawlogs/adjacent-node25.log`
- `evals/operating-negative-retention/rawlogs/base-reproduction-node25.log`
- `evals/operating-negative-retention/rawlogs/defect-reproduction-node25.log`
- `evals/operating-negative-retention/rawlogs/discovery-initial.log`
- `evals/operating-negative-retention/rawlogs/environment-inspection-failure.log`
- `evals/operating-negative-retention/rawlogs/final-focused-node22.log`
- `evals/operating-negative-retention/rawlogs/final-focused-node25.log`
- `evals/operating-negative-retention/rawlogs/final-source-check.log`
- `evals/operating-negative-retention/rawlogs/focused-node22.log`
- `evals/operating-negative-retention/rawlogs/focused-node25.log`
- `evals/operating-negative-retention/rawlogs/initial-node25.log`
- `evals/operating-negative-retention/rawlogs/published-worker-node22.log`
- `evals/operating-negative-retention/rawlogs/published-worker-node25.log`
- `evals/operating-negative-retention/rawlogs/repair-node25.log`
- `evals/operating-negative-retention/rawlogs/reproduction-node25.log`
- `evals/operating-negative-retention/rawlogs/selected-adjacent-node22.log`
- `evals/operating-negative-retention/rawlogs/selected-adjacent-node25.log`
- `evals/operating-negative-retention/report.md`
- `evals/operating-negative-retention/source-sha256.json`
- `evals/operating-negative-retention/source.diff`

Report finalized UTC: 2026-11-06T23:02:57.988198+00:00. No runtime/test edits or test processes remain.
