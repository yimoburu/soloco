# Issue 23: independently checked coordinator replacement

Baseline: `95cc20e`. No SPEC, version, installed plugin or actual company was changed.

The verified gap was ordinary `company_control handover` followed by `resume` without independently checked reconstruction. Replacement now revokes outgoing authority, records a pending gate and remains paused. Incoming CoS uses public `company_handover inspect/submit`; only QA of the exact current reconstruction may run while paused. Resume requires an attributable native independent Pass, exact source hash and explicit `resume_handover` permission with no blockers. Negative reviews, stale evidence and late outputs remain held. Same-owner pause/resume remains proportionate.

## Evidence

- Disposable fresh-chat and cross-host fixtures exercise actual control, submit and worker paths with synthetic reviewer output.
- Regression cases cover old owner rejection, missing reconstruction, wrong reviewer, reused author identity, wrong subject hash, negative reviews, nonempty blockers, stale canonical facts, failed reconstruction replacement, notice-delivery bookkeeping, cancellation and quarantine.
- Independent parent/agent review found duplicated frozen evidence in the original prompt. A dedicated single-copy handover context fixed it. A 110k-character archive fixture now fits; oversized context explicitly holds without truncation.
- Existing prototype handover regression now expects the pending reconstruction gate and confirms the original prototype grant is not transferred.
- Packaging and `git diff --check` pass. Full suite before the single-copy change: 325 passed, zero skipped. Final run results are recorded below when completed.

## Boundaries

This verifies the runtime acceptance gate and state preservation on fixtures, not live reviewer competence. The existing 200k-character admission bound remains: universal large-history handover requires #13's bounded source delivery. General pending records, unknown external outcomes and failures are shown to QA, which must withhold Pass when they are not reconciled; this patch does not prove remote process cancellation. No live handover, governance adoption, business permission, host configuration or new spending occurred.

Final reviewed-source validation: **326 tests passed, zero failures/skips**, actual Node 25.2.1 on macOS with sandbox execution enabled; six focused handover tests passed. Packaging/diff checks passed. Node 22 and live cold-successor review remain unverified. Independent review by the candidate-development agent found no remaining actionable blocker after the single-copy context correction.
