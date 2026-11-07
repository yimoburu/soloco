Candidate based on 64bd2eb; source repair only, pending independent native fixture QA.

Opt-in: on a NEW scoped applicability/interface/integration target, supply
`delivery_protocol: "scoped-stream-v1"`. Omission retains the published single
packet contract, including its oversized-input hold. Extraction is unchanged.
No version bump, commit, installation, publication, actual-company access or
account/business authority change was performed. This grants no resume_handover.

The new runtime/scoped-stream.mjs follows the existing frozen-stream/range-ledger
worker pattern. It emits ordered UTF-16 ranges without splitting surrogate pairs,
with complete serialized request admission at 48,000 UTF-8 bytes (metadata,
escaping and instructions included). Range length remains <=32,768 UTF-16 units.
Final review and acknowledgement bounds remain 12,000 parsed / 48,000 wire UTF-8
bytes. The existing total execution deadline remains in force, with each call
<=600 seconds and no new window. No global semantic certificate is introduced.

All global values come from the existing frozen governing snapshot. Exact current
home/dependency bodies and complete recursively referenced review artifacts,
including extraction bundles, reach the same independent native. Integration
streams these complete bodies as well. The manifest binds the exact target,
plan, full body hash/length and each complete request/range. Runtime-owned receipts
attest actual per-call timing, native identity and process closure. Canonical
validation reconstructs every request and rejects missing, reordered, corrupted,
substituted or unclosed delivery. Existing current freshness/negative/independence
checks remain compulsory. An invalid attempted native reuse is retained separately
as rejected_native_id, without poisoning a prior immutable extraction receipt.

Validation uses FICTIONAL CONTRACT DOUBLES, not independent native semantic QA.
The pre-patch test reproduced the oversized global hold before dispatch without
state mutation. The scoped suite passed 33/33 before the final added tests and
first-call native-identity hardening. Final focused recovery runs cover complete
UTF-8 delivery, >16 pages, oversized homes/dependencies, full integration reference
closure, missing/reordered/substituted ranges, corrupt frozen bodies, identity and
closure failures, premature Pass, wrong acknowledgement, current notice/authority/
outcome/governing/home freshness, retained negative evidence, legacy opt-in fences
and immutable extraction reuse. See final Node 22/25 logs and receipt.json for
observed final counts. Four focused legacy context tests also passed.

A broader context-qualification suite was started alongside handover/evidence
compatibility tests; its large core-vault fixture had not finished when narrower
checks were selected. Its partial log is retained without a Pass claim. Local
process inspection/termination was denied by the sandbox. No full 634-test run
was attempted. Dedicated handover/evidence compatibility results are recorded
separately when complete.

Next stage: independent QA of this exact candidate and an explicitly bounded
native fictional fixture qualification. Neither transport completion nor these
contract doubles establish cumulative native context fit, actual-company semantic
acceptance, 27k-extraction feasibility or large-company convergence. CoS owns any
coherent later release; company remains paused pending exact independent handover
Pass. Prior failures and exhausted grants remain unchanged.

CoS post-timeout inspection: Engineering reached its fixed600seconddeadline before publishing its final report. Source and actual test evidence were retained. CoS independently ran the complete final affected scoped suite:35/35pass,0skip on bothNode22.13 and25.2.1; see final-scoped logs. This verifies the candidate after final edits without relabeling the timed-out turn as completed. Native source/fixture acceptance remains pending.
