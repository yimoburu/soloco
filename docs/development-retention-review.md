# Repairing an evidence-retention block

A completed independent QA review can return `Blocked` because it lost primary
evidence during compaction. Passing tests still stand, but that review prevents
ordinary local acceptance. A later ordinary Pass does not erase the Blocked
review. Re-running tests to obtain another receipt is not a recovery method.

The retention-review workflow supports one prospective review of the **unchanged
candidate and original executed receipt**, under their still-live development
authorization. It preserves the original Blocked record, reviewer, failed
attempts, reservations, and deadlines. It does not apply to a code Fail, an
uncertain or unfinished reviewer, an expired grant, or another adverse review.
The separate expired-scope/unknown-session continuation keeps its own rules.

## Prepare and authorize

Call `company_develop` with `action: "prepare_retention_review"`, current owner
identity and epoch, and these exact subject fields:

- `plan_id`, `candidate_id`, and `receipt_id`;
- `receipt_sha256`: the internal test-result hash, not the public receipt hash;
- `prior_review_id` and `prior_job_id`;
- `code_review_window_minutes`: `30` or `45` within the original expiry.

Preparation is read-only and returns `proposal` and `proposal_sha256`. Inspect
the complete subject, adverse-review snapshot, source/evidence bindings, current
authority, and remaining time. Authorize that exact proposal using
`action: "authorize_retention_review"`, the same subject fields, its
`proposal_sha256`, `model_data_approved: true`, the actual applicable founder
`source_instruction`, and an attributable `approval_reference`.

Existing standing permission may cover this repair when its scope, data, model,
limits and expiry clearly apply. The software capability itself supplies no
permission. Authorization creates one immutable, one-use runtime ticket;
changing its subject or retrying a spent ticket is unsupported.

## Deliver the complete evidence

Dispatch ordinary independent `qa` with `review_of` set to the **original test
receipt**, `retention_repair_id` set to the authorized ticket, the exact review
window, and `timeout_ms: 600000`. Supply all required history through complete
inline inputs or explicitly declared supplementary sources. The ticket chooses
a fresh review session while retaining the original receipt lineage.

This mode explicitly defers whole primary bodies under an exact commitment.
Governing rules, authority and non-code controls remain available initially.
After the complete required history, the runtime sends one deterministic final
primary frame containing the original scope/source, candidate, canonical receipt
and the bound previous review evidence. Existing lossless file/receipt codecs
preserve complete logical values; deferral is not permission to trim evidence.
Before that final frame the reviewer returns bounded READ requests, then the
exact `{"ready_for_primary": true}` acknowledgement after complete history.
Early verdicts, malformed output and unknown control fields hold the attempt;
formatting fences cannot change their meaning.

Measure the actual complete initial frame, every READ packet, and final frame
before dispatch. Each must fit its supported limit. The final phase is reserved
inside the existing maximum of 17 native invocations, allowing at most 15 READ
rounds in this mode; generic limits remain 16 READ rounds and 64 ranges. A final
phase cannot add time or exceed the original grant expiry. Missing coverage or
insufficient remaining capacity holds the review.

## Independent judgment and acceptance

Every canonical repair verdict requires successful final-primary delivery to the
same native reviewer, verified invocation closure, unchanged current bindings,
and complete history delivery. Early or malformed adverse output remains
rejected job evidence; it cannot become a canonical review through a formatting
variant. The final frame supplies exact ticket/review/blocker hashes for the
structured clearing response. Hash delivery is not semantic retention.

The reviewer must independently classify the **whole** old judgment as evidence
retention only, explain how every exact blocker was cleared, and perform full
code acceptance. A blocker label alone grants no exception. Any unresolved code
finding or uncertainty requires Fail or Blocked, preserving the new evidence.

Use ordinary `company_develop action: "accept"` with the original `plan_id`,
`receipt_id`, internal `receipt_sha256`, and the actual new `review_id`.
Acceptance validates the ticket, independent clearing, passing executed receipt,
complete delivery, closure, current source/authority and final clock. Only the
exact independently cleared old review receives an attributable disposition;
its original Submitted Blocked verdict remains intact. Every other adverse or
uncertain review continues to hold acceptance.

This workflow grants no Engineering generation, test run, replacement of an
unknown worker, allowance reset, source integration, deployment, governance
adoption, or host/continuity qualification.
