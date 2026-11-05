# Main merge review

Reviewed the combined #13/#16/#18/#23 candidate against main `37e82eb`.
Three reproduced blockers were fixed before the requested merge:

- Stock 0.6.8 could resume a pending new handover without reconstruction or QA.
  The candidate is now coherently versioned 0.6.9, and successful semantic
  mutations atomically stamp that producer version. An actual archived 0.6.8
  runtime now refuses resume/save against the new handover state. Existing pinned
  0.6.8 teams remain compatible with the new runtime; emergency pause preserves
  unknown future producer versions. See `tests/runtime-version-fence.test.mjs`.
- Backup sources could change between restore verification and copying, while
  database-only readback still matched. Restore now verifies the complete copied
  destination inventory before reporting success and retains failures for
  inspection. See `tests/storage-transfer-integrity.test.mjs`.
- Literal company names such as “Research and Development” incorrectly revoked
  grants on a pure rename. Complete supported rename instructions now match the
  actual names; added constraints, unknown producers and unknown fields remain
  conservative. Actual development/prototype grant regressions are covered by
  `tests/rename-grant-applicability.test.mjs`.

The final runtime candidate at `9173eae` passed **402/402 tests on Node 22.13.0
and 402/402 on Node 25.2.1**, with zero failures, cancellations or skips and
actual macOS sandbox execution. Package consistency and diff checks passed.
The [validation receipt](../evals/main-merge-review-validation-2026-11-04.json)
binds the exact tested commit/tree, commands, complete logs and their hashes.

No blocking finding remained from the reviewed storage/reuse, runtime coordination,
context/patch/handover, and compatibility scopes after these fixes. This review
does not establish production latency or model-quality noninferiority. The
ordinary handover's explicit 200,000-character admission hold and the live
qualification limits in [the integration report](parallel-integration.md) remain.
This is a repository merge candidate; publication, installation and company
adoption are separate actions.
