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

Focused checks completed: all 15 prospective regressions in
`node --test tests/upgrade-incremental.test.mjs`, plus 25 distinct legacy upgrade
regressions selected with `--test-name-pattern` in `tests/upgrade.test.mjs`
(continuity/authority, recovery, independent sessions, deadlines/call caps,
negative/replay coverage, saved-checkpoint corruption and read-only inspection).
The legacy tests were not edited. Syntax checks for the three runtime modules
and `git diff --check` also passed. The full suite and native adapters were not run.
