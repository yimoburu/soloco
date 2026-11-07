# Prospective incremental upgrade rehearsal

For a **new** authorized attempt, inspect the candidate and prepare with
`workflow: "incremental-v1"`. Omission deliberately retains the existing workflow;
existing attempts never acquire incremental acceptance rules. This source repair
does not change the package version, pinned teams, governance or SPEC.

The workflow sends every exact raw semantic page to fresh CoS and independent QA
native identities. QA page input contains that page and its corresponding CoS
finding. It does not contain the entire proposed handover. Final QA always gets
the complete exact proposed handover, the page coverage manifest and all required
CoS/QA findings. When the complete findings fit the measured serialized request
plus response reserve, the final call carries them directly. Otherwise bounded
replay carries every finding (including corresponding CoS findings for QA), before
final synthesis. No finding is trimmed to fit. An oversized complete proposal or
single replay item holds. All raw semantic pages must have been delivered to each
role's own native session. Hashes establish identity and delivery integrity; they
do not establish understanding, semantic correctness or native context fit.

The best-case native-call count is `2P + 2` for P pages, rather than the legacy
`2P + 4`. Retrieval and replay add calls when required. Unclassified historical
attempts, failed/malformed outputs, notices, limits and negatives remain in the
existing evidence projection. This change does not implement scoped qualification
or decide that an old negative is resolved.

## Explicit interrupted continuation

Use `company_upgrade` with `action: "resume"`, the original `upgrade_id`, exact
current `expected_epoch`, exact `candidate_hash`, the same owning host/session,
and an explicit `source_instruction`. The command checks the original candidate,
checkpoint, history, workflow/rules fingerprint, owner and immutable deadline and
model/call policies against the current state. The continuation instruction is
retained separately and does not rewrite the original review authority. A changed
owner, candidate, company fact, history or workflow rule holds the attempt.

Only a queued or interrupted checking attempt is resumable. It must have no
unclosed native call, and the previous local worker must be proved stopped. A
local PID that is still present, inaccessible or reused remains held. An atomic
worker reservation and token fence prevent two resumes or a duplicate rehearsal
worker from entering the attempt. This is a local process proof, not a distributed
worker lease. A launcher reservation whose process remains alive also holds; it
is not automatically timed out or stolen.

Each native call is journaled **before** invocation with stable step/round ID,
exact input hash, requested native identity, traffic accounting and worker token.
The existing append-only call journal retains the exact output or error before
validation, including late and malformed returns. A separate completion receipt
links the exact output hash, native identity and canonical delivery receipts.
Accepted page findings must come from that exact page's role/task step; final
probe and review must come from their role's synthesis step. Retrieval rounds
must start at zero, remain consecutive and follow reads-only requests until the
terminal artifact. Each final QA round also records the exact proposed handover
hash in its step and canonical call receipt; reuse and apply compare it with the
accepted CoS proposal.
The interval between call start and committed completion is deliberately
ambiguous after process loss, even if an output journal entry exists. There is
no automatic retry or operator-supplied model claim that can close it.

Continuation traverses completed steps locally, regenerates their exact prompts
and authentic evidence ranges, validates canonical receipts, reconstructs each
role's own delivery ledger and cumulative traffic, and revalidates retained
artifacts. It does not call the model again for valid completed steps or allocate
new native identities. Missing steps alone invoke the model. The original
16-read-round allowance per task, call ceiling and overall deadline are retained;
resuming never extends or resets them. An explicitly prepared no-overall-deadline
attempt retains that policy and its original per-call ceiling.

A semantic Fail/Blocked, malformed response, timeout or other failed attempt
cannot resume. QA negatives are saved before validation and halt the prospective
workflow. Recover restores prior definitions while preserving all later company
facts, outputs, notices and attempt evidence. During a prospective native call,
a 100 ms eligibility poll requests abort on pause, ownership/revocation, candidate,
state or rule loss. The existing adapter remains responsible for native process
termination. A call without a durable valid return remains ambiguous; this repair
does not implement a cancellation worker or infer termination from an abort signal.

## Work inspection and validation

`inspect.projection_preview.workflow_forecast` compares minimum call counts and
proposal-copy counts on the same preview inputs. Prepare adds its decision record,
so this is a forecast, not an exact reservation. `inspect.upgrade.work` exposes
known remaining page/final counts, a lower bound on remaining calls, blocked
reason, observed starts/returns, exact UTF-16 input/output character traffic and
estimated tokens. Remaining retrieval/replay depends on future outputs; those
calls cannot be forecast exactly. The existing exact upgrade source contains all
page, step, output, delivery and replay identities. Estimates and traffic are
explicitly separate from QA acceptance, elapsed-time forecasts and model token fit.

Validation uses temporary fictional companies and an injected local JSON-contract
model only. `tests/upgrade-incremental.test.mjs` covers actual prepare, inspect,
resume, rehearse, apply, verify and recover; accepted-page process loss, ambiguous
call-start process loss, concurrent workers/resumes, immutable deadline/policies,
changed owner/candidate/checkpoint/history/rules, canonical receipt/native proof
tampering, negative/malformed/late output retention, eligibility abort and bounded
replay fallback. The five-page synthetic comparison measured 14 legacy versus 12
incremental calls and roughly 1.876 million versus 1.692 million input UTF-16
characters (about 9.8% less); fixture identities can change exact totals. This
establishes neither native model fit nor actual company adoption. Legacy protocol
regressions run unchanged with the legacy default.

Receipt-binding repair checks completed on Node v25.2.1: all 21 prospective
regressions in `node --test tests/upgrade-incremental.test.mjs`, including page
substitution for probe/final QA, swapped page identities, proposal changes after
QA, skipped rounds and reads-only retrieval transitions. The new adversarial
tests were run before the repair to reproduce missing task/proposal checks.
Another 97 tests passed with
`node --test --test-skip-pattern='MCP upgrade completes through detached native processes' tests/upgrade.test.mjs tests/upgrade-evidence.test.mjs tests/upgrade-paging.test.mjs`.
The detached native integration test was excluded; the legacy suites and existing
failed fixtures were not edited. Syntax checks for the changed runtime/test
modules and `git diff --check` passed. The full suite, native adapters and live
company adoption were not run.

## Prospective accepted operating input

A **fresh** explicit `prepare` with `workflow: "incremental-v1"` and
`context_mode: "current"` selects `accepted-operating-upgrade-v1` only when a
real accepted `operating_state` exists. The existing public `operatingContext()`
must validate the complete accepted set before prepare changes ownership,
controls, current upgrade, or history. Capture failure rolls back preparation.
Omission, full mode, companies without operating publication, and every existing
attempt retain their prior input and validators. Failed/exhausted attempts cannot
select this mode through resume. This prospective mode requires ten-minute calls
and the original 45-minute overall ceiling; it never resets an attempt deadline.

The complete accepted context, pinned and candidate instructions, exact founder
instruction, and preparation owner are retained in the existing immutable vault.
The attempt's `operating_input` locator is bound into its workflow contract and
every new step binds that envelope hash. Later upgrade reads validate the frozen
vault graph and exact raw business checkpoint/history invariants, current owner,
paused state, candidate, authority expiry and original deadlines. They do not call
live historical applicability/classification or ordinary `operatingContext()`
again after preparation has changed controls. No operating-module helper or
cross-owner source edit is required.

The semantic stream contains **all** accepted homes, controls, communication and
conditions/exceptions (including typed unresolved outcomes and spent/revoked
permissions), plus complete pinned/candidate definitions and preparation authority.
The raw checkpoint and complete history retain their original hashes. Their exact
JSON and every nested immutable body are independently retrievable as archive
sources; vault bodies use `vault-<sha256>` source IDs. Preservation is not renewed
permission or fresh semantic acceptance. CoS reconstructs accepted S and candidate
instructions; the existing independent QA, complete exact proposal delivery,
continuity checks and step validators still judge the proposed handover.

Explicit current inspection measures this selected path. Meaning UTF-16 characters,
UTF-8 bytes and pages are separate from raw archive retrieval bytes/characters.
A fresh preview measures the current capture; its future prepared size is unknown
until the exact founder instruction and decision have been recorded. Pending
attempt inspection measures the actual frozen attempt and rejects changed raw
business state. Counts describe retrievable source bodies, not unique stored bytes,
native token fit, model understanding or forecast elapsed time.

Apply preserves company identity, governance (under preserve policy), business
records, historical attempts, notices and accepted publication receipts. Prospective
readback additionally rejects any extra/changed business intake. Changed definitions
and ownership leave ordinary operation **Held**. Upgrade QA never republishes current
operating meaning, renews a grant, resumes business, or proves compatibility under
the new instructions. A fresh independent operating delta publication is a separate
required boundary owned by the operating workflow.

Public fictional regression: `tests/operating-upgrade.test.mjs` uses normalized
intake, public represented qualification and real publication workers before the
existing upgrade controller and distinct scripted CoS/QA roles. Scripted judgments
are fictional contract doubles, not independent native source QA or company adoption.
