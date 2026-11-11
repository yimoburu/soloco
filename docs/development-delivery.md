# Frozen development contracts, acceptance reports and handoffs

These additions use the existing local development workflow. Generation, actual
tests, independent native QA and current owner acceptance keep their existing
guards. They introduce no source integration, installation or business authority.

## Freeze the complete slice

`company_develop action: "plan"` accepts an optional `delivery_contract` with
protocol `development-delivery-contract-v1`. Its closed schema requires:

- `interfaces`: explicit IDs, complete descriptions and scoped source paths;
- `dependency_refs`: exact record IDs, revisions and SHA-256 commitments;
- `required_test_roots`: exactly the plan's existing authorized `test_paths`;
- `integrator`, `observer`, `installer`: each `{host, session_id, name}`.

Use empty interface/dependency arrays only when there are no such dependencies.
The runtime retains complete dependency snapshots and the complete scoped source
commitment in the hashed plan. It checks dependencies again during authorization,
assignment, execution and acceptance. A changed dependency requires a new plan.
The contract requires independent QA for `accept_local_development`; the actual
reviewer and native identity are bound when that independent review exists.
Candidate hashes remain unknown at planning and bind the generated files later.
Declared contacts are routing information; the runtime does not authenticate
those external sessions or grant them company ownership.

## Inspect one canonical acceptance report

Only a successful existing `company_develop action: "accept"` creates protocol
`development-acceptance-report-v1`, inside the accepted test receipt's immutable
`development.acceptance`. It records the existing acceptance facts, exact plan,
candidate, pre-acceptance receipt, QA and controller snapshots; actual test and
validation evidence; delivery and closure observations; retained adverse history;
and any exact retention clearing. It does not calculate a new QA verdict.

The separate `accept_review_continuation` path creates the same report at its
new `review_continuation_acceptance` artifact, under
`development.acceptance_report` and `acceptance_report_sha256`. It preserves the
original receipt byte for byte. Supply that artifact's `acceptance_id` in later
report inspection and transitions; their delivery chain stays at that home.
The old grant, original failures, spending and uncertain reservations remain
unchanged. Existing continuation acceptances are never backfilled either.

Normalized stores reuse immutable snapshot references. Legacy stores retain
complete inline snapshot wrappers with exact hashes in the same acceptance
record; no implicit storage migration occurs. Missing and explicit null revisions
remain distinguishable. Later source changes do not rewrite historical evidence.
Historical accepted receipts are never backfilled with invented reports.
Older supported normalized layouts retain their existing storage behavior;
layouts without the immutable vault use the same exact inline fallback.

Use `company_develop action: "acceptance_report"` or `"delivery_inspect"` with
`root`, `session_id`, current `epoch`, `plan_id` and `receipt_id`. Inspection is
read-only and requires the actual owner. No report returns `unobserved` and its
reason. Ordinary historical reviews without a delivery ledger or original process
journal retain `unobserved` for those facts. A report cannot turn them into native
delivery proof. Oversized results use exact receipt retrieval through
`company_context inspect/read`; verify the source hash before using nested data.
Captured hashes and their cross-record plan/candidate/test/review relationships
are checked together. A local source/candidate commitment is distinct from a
repository head: the report explicitly leaves the GitHub head unobserved. Actual
integration evidence must bind its own current head and acceptance report.

## Record an accountable handoff

Acceptance records QA to the registered owner. The declared next stages are
owner to integrator to installer, with one current receiver and the frozen
observer. Delivery observations live in the same receipt's sibling
`development.delivery`; they cannot change its immutable acceptance report.

`company_develop action: "delivery_transition"` requires the same exact plan
and receipt IDs, current owner/epoch, `source_instruction`, `report_sha256`,
`expected_handoff_sha256`, a unique `transition_id`, `to_stage`,
`reported_outcome` and exact `evidence_refs`. Inspect first to obtain the current
report and handoff hashes. Completed observations require retained evidence.
Only `completed` advances the current receiver. `unknown` and `failed` preserve
the receiver and record the unobserved or held outcome. Stale compare-and-swap
hashes, reordered stages, changed replay requests and paused mutations hold.
An exact replay returns the existing observation without another event/revision.

Every external transition is explicitly operator-reported, with
`authenticated_external_producer: false`, `source_integration: false` and
`external_actions_authorized: false`. Recording an observation sends no message,
pushes no commit and installs nothing. The integrator still follows
[AGENTS.md](../AGENTS.md) through actual required checks and merge. Repository
merge, installation, runtime activation and checked company adoption require
their respective evidence and authority.
