# Pre-integration handover window validation

The unpublished 0.6.14 repair candidate was qualified before integration with published v0.7.0. Fresh protocol-v2 handover QA may select a fixed 30/45-minute total review window while every native call remains capped at ten minutes. Omission preserves existing behavior. Existing targets, sessions and jobs cannot be renewed.

Frozen behavioral source: `78a83870363c53464fc89bff89c7f2449fef8bcc`. Both Node 22.13.0 and 25.2.1 passed all 444 tests with zero failures, cancellations or skips, including actual macOS isolation checks. Build and diff checks passed. Complete compressed logs, 116-file manifest and SHA-bound receipts are in `evals/handover-review-window/validation.json`. Later additions contain documentation/evidence only.

Independent native QA `01a1af34-8d30-78f3-a4e6-714ee9e0c3a2` first returned Fail for actual-spawn clamping, complete timing receipts and late publication. Those failures and RED regressions remain retained. The same reviewer returned repair Pass after the exact fixes, holding integration/publication for final receipts. Root verified every stated receipt condition against unchanged source and both complete matrices before integration. Advisory QA had tools disabled; root and the separate verifying coordinator executed checks.

The first Node 25 rerun used the outer sandbox and skipped 51 isolation checks; its log is retained and it is not the final matrix. The final run executed all 444. An earlier detached-pause missing-receipt cause remains unknown; unchanged later targeted and complete runs passed. Synthetic clock tests are not a live 44-minute review.

No installed-runtime or real-company continuity claim follows from this source qualification. Current-runtime host activation and a separate fresh independent exact-state Pass permitting `resume_handover` remain necessary. Old failures, permission boundaries, termination uncertainty and company governance remain intact.
