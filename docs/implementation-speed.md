# Faster implementation with the same acceptance requirements

This workflow reduces repeated preparation and handoff waits. It does not change
company authority, native reviewer independence, test coverage, process-closure
requirements, or acceptance. Packet fit is a delivery measurement, not evidence
that a model understood or retained the material.

## Reconciled ownership

The founder requested implementation on 2026-11-10 and explicitly directed
coordination with **Qualify SoloCo storage and continuity**. The work is split
into disjoint repository lanes:

| Owner | Deliverable | Boundary |
|---|---|---|
| Qualify SoloCo storage and continuity | Future-CoS auto-merge guidance, `Merge readiness`, and repository enforcement | Owns `AGENTS.md`, `docs/ci.md`, and the merge-readiness workflow and tests |
| Reconcile SPEC and enforce reviewer independence | Review packet preflight and delivery audit, isolated CI execution, qualification requests, and timing reports | Uses a separate checkout; does not change the active PR #68 candidate or live acceptance scripts |
| Registered company owner | Required company scopes, native review, and exact acceptance | Repository preparation and software checks cannot supply company authority |
| Assigned repository integrator | Reviewed candidate through required checks and merge | Follows the current repository `AGENTS.md`; acceptance and merge remain separate |

After the auto-merge policy merged in PR #70, the two owners coordinated a narrow
follow-up to `docs/ci.md` for sharding and qualification. Its auto-merge guidance
is preserved verbatim; this is the only shared documentation path.

The frozen-input CLI tools below do not write company records, consume a review
ticket, invoke a model, install a plugin, or adopt governance. The runtime
follow-ups use existing guarded transactions as described below. Keep frozen exports
and raw company evidence outside the Git checkout. Publish only reviewed source,
tests, and appropriately scoped evidence summaries.

## Six runtime follow-ups

The source implementation adds the following paths to the existing workflows.
Component fixtures use controlled specialist outputs and do not establish
native understanding, actual-company acceptance, adoption or measured speedup.

| Follow-up | Implemented behavior | Evidence boundary |
|---|---|---|
| Admission preflight | Retention-review dispatch measures complete initial/history/final geometry before committing a queued job, session or one-use attempt. A hold rolls the transaction back. | Fresh current source, owner, authority, ticket, deadline, capacity and process guards remain mandatory. Ordinary and continuation review protocols retain their existing guards. |
| Canonical acceptance | Guarded local acceptance creates one hash-bound report in its actual test receipt or new continuation acceptance home, retaining complete exact inputs, adverse history and clearing evidence. | The report records the successful existing gate; it cannot supply a verdict, authenticate a repository head or backfill a historical missing report. |
| Frozen contracts | Optional complete development contracts bind interfaces, dependency snapshots, authorized test roots, independent-QA requirement and declared receivers/observer. | Source and dependency changes need the applicable new scope; declared contacts are not authenticated operators. |
| Accountable handoffs | Compare-and-swap transitions reference that report and retain attributed evidence, with one current receiver and observer. | External outcomes remain operator-reported. Unknown/failed outcomes do not advance the receiver or authorize action. |
| Exact structural reuse | Bounded process-local caching reuses only retention-review geometry for identical complete inputs, package dependencies, renderer policy and Node toolchain. | It never caches QA judgment, permission, current eligibility or process closure. |
| Automatic observations | Read-only progress derives lifecycle timing and quality observations from complete canonical job/record snapshots. | Missing founder time, escaped defects, costs and unobserved phases stay unknown; recorded acceptance is not authenticated native quality. |

The storage/continuity qualification chat owns its existing evidence and native
qualification lane. These additions do not change the peer model, reader/layout,
or the frozen D13 qualification oracle. The registered owner retains live company
operations. See [delivery contracts and reports](development-delivery.md) and
[the source architecture](architecture-current.md).

## Prepare once, then overlap independent work

1. Select a complete, independently testable slice and identify its dependency
   closure, changed interfaces, tests, reviewer, and next receiver. When complete
   required evidence will not fit, change the slice before authoring; do not trim
   required evidence or increase limits to force admission.
2. Freeze the candidate and complete source/evidence manifest. Record its exact
   head, subject hashes, authority references, and qualification requirements.
   Keep routine progress drafts outside governing review inputs while QA runs.
   Founder corrections, source changes, new adverse evidence, revocation, pause,
   and ownership changes still require the applicable currentness checks.
3. Measure the actual review packet before dispatch. Run deterministic CI and
   prepare integration in parallel with eligible native QA against the same
   frozen candidate. Respect existing capacity and uncertain-process claims.
   Integration preparation grants no permission to install, merge, or accept.
4. Audit complete closed delivery and retain every prior failed attempt. The
   responsible owner still validates independent judgment, current authority,
   exact source, and the supported acceptance action.
5. Keep the PR draft until its exact head has the required review and acceptance.
   The assigned integrator then follows `AGENTS.md` to mark ready, enable native
   auto-merge immediately, and verify the actual request or completed merge.
   A changed head needs applicable fresh evidence; an earlier head's passing
   result is not a current-head qualification.

Component acceptance does not qualify the composition. The final integrated
path still needs its applicable integration, host, account, migration, and
native qualification. Source merge, installation, connected runtime behavior,
and checked company adoption remain distinct.

## Review preflight

Runtime retention-review admission now invokes the same pure geometry measurement
used by the CLI. Complete frames must fit before the job and session become
durable or the launch hook runs. Typed `REVIEW_PREFLIGHT_HELD` errors contain a
bounded measured diagnostic. Its hash is an ephemeral commitment, with no
persisted retrieval handle promised. Earlier canonical authority/deadline errors
retain their original identities. No frame is shortened to obtain admission.

Cache hits require an identical complete input hash and a manifest of the entire
installed package, Node version/platform/architecture and execution options.
Every lookup revalidates current sources and eligibility; the final commit guard
checks the exact job/context, remaining window and loaded-package identity again.
Changed on-disk package bytes require a runtime reload. No old loaded module can
claim to have executed newly installed source. This cache covers deterministic
geometry only; existing acceptance and semantic delivery validators still run.

Use the read-only source utility on an explicitly supplied frozen JSON input:

```sh
node tools/review-preflight.mjs /absolute/path/to/frozen-review-input.json
```

The input commits the complete frozen state and prospective job with SHA-256
hashes and an explicit observation time. The tool reuses the runtime's DATA-only
snapshot and presentation builders, measures exact initial/history/final frames,
and plans bounded whole-source reads. UTF-16 characters, UTF-8 bytes, cumulative
traffic, and the required number of invocations are separate measurements.

The immutable retention ticket must already exist; measuring it does not spend
its attempt. A complete measurement does not reserve capacity or authorize
dispatch. The actual runtime must revalidate the current source, owner, authority,
ticket, deadlines, and process state. An oversized or unmeasurable frame holds;
the tool must never substitute a shortened frame or an invented size.

The prospective input has protocol `retention-review-preflight-input-v1`, an
`observed_at` UTC timestamp, the complete frozen `state`, a prospective queued
QA `job`, and `expected.state_sha256` / `expected.job_sha256`. Hash the exact
`JSON.stringify` values with SHA-256; do not rewrite missing fields as null or
reorder the frozen source before comparing its commitment.

For a published review, use protocol `retention-review-delivery-audit-input-v1`
with `observed_at`, frozen `state`, `job_id`, `review_id`, and exact
`expected.state_sha256`, `expected.job_sha256`, and `expected.review_sha256`.
The same CLI composes the canonical ledger and final-primary validators. A
structurally consistent report does not authenticate the supplied process
observations, assess QA's judgment, establish current eligibility, or grant
acceptance. A valid negative judgment stays negative.

The CLI returns JSON on stdout. Exit 0 means a complete measurement or a
structurally consistent audit; exit 2 means held or invalid input. Preserve the
report and original failed inputs. These meanings never imply permission to
dispatch or accept.

Retention repair, expired-scope continuation, uncertain process closure, input
overflow, and substantive code failures have different supported next actions.
Use their actual eligibility rules rather than treating this tool as a generic
retry or reset mechanism. See [retention repair](development-retention-review.md),
[review continuation](development-review-continuation.md), and
[original process closure](ordinary-model-process-closure.md).

## CI and qualification

Routine regression keeps its existing selection, including newly added test
files. Whole-file sharding partitions that complete selection across separate
macOS jobs; every shard requires the real Seatbelt backend. Preserve the stable
aggregate check names and require every shard and build to succeed. Failed,
cancelled, missing, or unexpectedly skipped work cannot clear the aggregate gate.

Full qualification retains its complete historical Node 22 suite and Node 26
compatibility lane. Request it on a frozen draft candidate so it can overlap
native review. It remains distinct from routine regression. If the candidate
changes, request qualification for the new exact head and retain the old result
under its original subject. Do not make an optional old-head result stand in for
a required current-head qualification.

After publishing the workflow, adding the `qualification-ready` label to a draft
PR runs both full-qualification lanes against the event's exact head SHA:

```sh
gh pr edit PR_NUMBER --add-label qualification-ready
```

The repository must contain that label. A later push does not trigger another
full run just because the label remains attached. On a new frozen head, remove
and reapply the label, or use the manual exact-commit input:

```sh
gh workflow run qualification.yml --ref BRANCH --field commit=EXACT_40_CHARACTER_SHA
```

Verify the actual checked-out commit and completed jobs. Keep the PR draft until
every qualification required for that candidate is complete; an armed auto-merge
request does not wait for optional checks automatically. The qualification event
does not itself grant review, readiness, or company authority.

Local whole-file shard checks use the same complete regression selection:

```sh
node tools/ci/check.mjs regression-22 --shard 1/2
node tools/ci/check.mjs regression-22 --shard 2/2
```

Optional historical strict receipt verification remains scoped to its original
receipt-producing workflows. A Linux aggregate job or sharded diagnostic log
cannot be presented as a historical whole-suite macOS receipt.

## Measure elapsed time and rework

Use `company_progress format: "observations"` with `root`, `session_id` and
`recent_jobs: 1..50` to derive observations from the complete canonical read
snapshot. Follow `next_cursor` until `complete`; changed source invalidates the
cursor. This read does not reconcile jobs, stale reviews or modify company state.
It includes separate notice retrieval. Observation pages are bounded to 25,000
UTF-8 bytes before the small attention envelope and disclose omitted rows.

For an explicit frozen export, without opening a live Store:

```sh
node tools/implementation-observations.mjs /absolute/path/to/frozen-observations.json
```

Use protocol `implementation-observations-input-v1`, complete `state.jobs` and
`state.records`, and `origin` containing `observed_at`, exact
`state_sha256: SHA256(JSON.stringify(state))`, and an explicit
`collections_complete` declaration. Optional `options` contains `limit`,
`offset` or `cursor`, `include_events` and explicit external observations.
The CLI always labels origin `frozen-export`; hashes do not authenticate exporters.
Canonical job/record timestamps automatically derive queue, preparation,
execution, test, QA, acceptance and handoff windows. They are recorded wall-clock
observations, not invented monotonic measurements. Software test launch through
job completion includes controller overhead. No duration is advanced for an open
span. External merge/install/defect/intervention observations need their own
explicit source; an empty observation set is not a measured zero.

The lower-level timing utility remains available for explicit phase observations:

Use the timing report on explicit, attributable observations:

```sh
node tools/implementation-timing.mjs /absolute/path/to/observed-events.json
```

The input protocol is `implementation-timing-events-v1`. Choose explicit
`measurement_kind: "observed"` or `"synthetic"`. Supply `attempts` with
`task_id`, `attempt_id`, `comparison_key`, `outcome`, an attributable `source`,
and optional `rework_of` naming a retained adverse attempt of the same task.
Supply `events` with unique `id`, the same task/attempt IDs, `span_id`, `phase`,
`event: "start"` or `"finish"`, UTC `at`, `clock_id`, `source`, and optional
same-clock `monotonic_ms`. Each source identifies its `id`, `sha256`, and exact
`field`; references are declarations, not independent source authentication.

Retain task and attempt identity, failures, and the source for each observation.
Separate queue/preparation, execution, test, QA, acceptance, merge, installation,
and adoption. Missing observations remain unknown. Monotonic spans must share
their original clock; cross-process wall timestamps do not become monotonic
measurements. Sum of overlapping work is different from elapsed wall time.
`queued_work_ms` sums queued spans; `queued_occupied_ms` is their same-clock
union and remains unknown across clocks. `wall_elapsed_ms` is only the window
between the first supplied start and last supplied finish on one declared clock,
not proof that the full lifecycle was observed. Reported P50/P95 use the
nearest-rank estimator and disclose the completed sample count.

Compare like-for-like work and report sample counts before claiming faster
implementation. Synthetic tests establish tool behavior, not production speed,
model quality, founder time saved, cost savings, or customer outcomes.
