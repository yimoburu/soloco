**Fail — withhold source integration for this pin.**

Candidate: `0c63d792c67e39923d272ba57a733dbdb3f9ac89`, based on `64bd2eb` (published `0.7.2`).

This is advisory static QA of the supplied source and evidence. I used no tools or agents, performed no mutations, and did not independently verify hashes or rerun tests. Engineering’s fixed-deadline turn remains timed out, with retained evidence.

1. **Blocking: rejected native identity can invalidate an earlier valid extraction receipt.**

   In [worker.mjs:168](/private/tmp/soloco-recovery-delivery-20261106/plugins/soloco/runtime/worker.mjs:168), a later response with a changed native ID throws before `validateScopedStreamNative` can set `scopedNativeRejected`. The failure handler at [worker.mjs:300](/private/tmp/soloco-recovery-delivery-20261106/plugins/soloco/runtime/worker.mjs:300) then assigns that unvalidated ID to `current.native_id`.

   Concrete static failure path: accept page zero under fresh native A; page one reports an earlier accepted extraction reviewer’s native B. The stream fails, but its failed job now claims B. The cross-job identity check in [scoped-context.mjs:177](/private/tmp/soloco-recovery-delivery-20261106/plugins/soloco/runtime/scoped-context.mjs:177) consequently rejects the earlier extraction receipt as native reuse.

   The supplied negative test at [scoped-context.test.mjs:622](/private/tmp/soloco-recovery-delivery-20261106/tests/scoped-context.test.mjs:622) uses a new substitute ID, so it misses this poisoning case. Aborted or missing-timing responses can also throw before identity validation.

   **Required repair:** distinguish validated reviewer identity from every rejected observed identity. Failure handling must not promote an unvalidated response ID into `native_id`. Retain it separately, preserve earlier valid receipts, and grant this failed attempt no acceptance.

2. **Blocking completion defect: validation can cross the deadline before publishing a completed Pass.**

   The monitor stops at [worker.mjs:218](/private/tmp/soloco-recovery-delivery-20261106/plugins/soloco/runtime/worker.mjs:218). During completion, eligibility checks precede another potentially expensive stream reconstruction/validation at [worker.mjs:246](/private/tmp/soloco-recovery-delivery-20261106/plugins/soloco/runtime/worker.mjs:246). The worker subsequently records `completed` and `finished_at` at [worker.mjs:252](/private/tmp/soloco-recovery-delivery-20261106/plugins/soloco/runtime/worker.mjs:252), without a final stream publication deadline check.

   A process can close within its deadline while subsequent validation crosses the total job deadline. The existing additional publication check applies only to handover-window jobs.

   **Important limit:** canonical validation at [scoped-context.mjs:302](/private/tmp/soloco-recovery-delivery-20261106/plugins/soloco/runtime/scoped-context.mjs:302) rejects that late receipt later. This finding demonstrates incorrect completed/Pass publication, not a demonstrated late `apply` authorization.

   **Required repair:** check the exclusive deadline immediately before publishing completion and session changes. Retain late output as quarantined evidence.

The supplied tests provide useful transport coverage, but the following checks are mandatory before reconsidering integration:

- Return an existing accepted extraction reviewer’s native ID on a later page and on an aborted first response. Assert rejection, separate rejected identity retention, and continued canonical extraction reuse.
- Exercise deadline crossings during final validation, closure exactly at the deadline, delayed timer callbacks, later-call spawn delays, and missing timing. Assert no renewed allowance or completed late Pass.
- Exercise streamed domain → independent interface → integration review with **nonempty interfaces**, complete peer homes/dependencies, and distinct reviewers. The new integration examples omit interface reviews.
- Repair the negative test at [scoped-context.test.mjs:588](/private/tmp/soloco-recovery-delivery-20261106/tests/scoped-context.test.mjs:588): it supplies an applicability receipt as `integration_review_id`, which is independently invalid. Use a valid integration closure so the intended defect determines rejection.
- Retain the existing Unicode/escaping and >16-page checks; add explicit surrogate-boundary assertions. Finish the affected compatibility checks currently marked partial/pending.

Several implementation choices support the intended contract: complete serialized UTF-8 request admission, bounded surrogate-safe ranges, prospective opt-in, extraction exclusion, recursive review-artifact delivery, integration home/dependency bodies, and reconstruction of request/range hashes and timing. These support transport integrity; they establish neither cumulative native context fit nor semantic acceptance.

Existing single-packet, extraction, legacy, and handover proof grammars appear structurally preserved. **Operational preservation is not established:** finding 1 can invalidate an older valid receipt. The reported final scoped results—35/35 on each supplied Node version—do not cover that case. Partial compatibility logs remain partial; the full 634-test suite remains unrun.

The candidate should remain retained and unreleased pending repair and fresh review. `VERSION=0.7.2` is intentional at this stage; later publication still requires coherent versioning and the actual published-`0.7.2` writer fence.

The 947,154-byte/26-request result remains a contract double. Native fictional qualification remains separate. The sole reported accepted company leaf remains 45,629 bytes/74 items, with no aggregate/exclusion, company Pass, adoption, or `resume_handover`. Prior failures and exhausted allowances remain retained. This patch proves neither 27k-extraction feasibility nor whole-history recovery. Effective model/effort/speed remains unverified.