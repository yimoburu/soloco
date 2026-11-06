# Public represented v2 classification bridge

Source base: `5e13d7b6434f60cf194765aa427f6fdfb9adc622`.

`company_context` now exposes the existing `represented` disposition and strict
per-source `coverage` schema. Omit `protocol`, use `action: plan`, `record_ids`,
`counterpart_ids`, and `coverage`. Each coverage entry requires exactly
`source_id`, `counterpart_ids`, `findings`, `failures`, `uncertain_effects`, and
`exhausted_allowances`. The four semantic dimensions are nonempty strings of at
most 20,000 characters. Existing runtime validation remains authoritative;
unknown public arguments and unknown coverage fields still fail.

Dispatch QA against the returned plan record. Version 2 classification reviews
select existing context format 4. The worker uses existing `readEvidence`,
`createDeliveryLedger`, `recordDelivery`, and `qualificationDeliveryReceipt` APIs.
Request exact `{source_id, sha256, offset, length}` ranges in a `reads` envelope;
the same native must receive the entire required semantic stream before Pass.
Supplementary exact originals and registry sources use the same read interface.
Existing per-request bounds and execution deadlines apply, without a fixed
16-round limit. The worker retains its canonical runtime-issued
`context_qualification` receipt; model-authored coverage claims cannot replace it.

Apply through `company_context` with `action: apply`, `plan_id`, and `review_id`.
The engine delegates v2 validation and classification creation to existing
`applyContextQualification`, including its canonical `qualification` receipt.
Current/resolved v1 apply remains on its existing branch. No validator, legacy
graph, partitioner, version, settings, installation, release, adoption or authority
semantics were changed. The worker file is necessary because format 4 context
and receipt APIs existed but were not connected to its read loop/publication.

Changed implementation files:

- `plugins/soloco/runtime/main.mjs`: public disposition and coverage schema.
- `plugins/soloco/runtime/engine.mjs`: format 4 selection and canonical v2 apply.
- `plugins/soloco/runtime/worker.mjs`: frozen qualification delivery and receipt.
- `tests/public-represented-v2.test.mjs`: four public contract regressions.

The new regression constructs plans and applies through `main.call`, dispatches
QA and runs the real worker with an explicitly fictional adapter. It delivers
all semantic and supplementary source ranges, exceeds 16 read rounds, verifies
canonical receipts through `classificationFor` and `reviewedContext`, and checks
exact mandatory homes. It rejects incomplete delivery, coordinator identity,
failed jobs, stale homes, negative reviews, tampered runtime receipts, tampered
stored qualification receipts, and changed retained closure. A separate source
fixture uses canonical runtime test `author_instance` attribution without an
invented `job_id`, explicitly declaring its development/candidate/producer
sources in the plan. This exercises explicit existing coverage, and does not
claim automatic discovery or redesign of a producer graph. Classification
preserves source bytes, preparation mode and governance; it grants no authority.

## Focused validation and limits

Commands use Node 22.13.0 at
`/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node` and
Node 25.2.1 at `/opt/homebrew/bin/node`.

On each runtime:

```
node --test tests/public-represented-v2.test.mjs tests/integration-context.test.mjs tests/structural-scalability.test.mjs tests/operating-control.test.mjs
```

24 tests: **24 passed, 0 failed, 0 skipped**, including all four new tests.
Raw final logs: `evals/public-represented-v2/node22.tap` and `node25.tap`.

An additional affected-file check on each runtime:

```
node --test tests/operating-state.test.mjs
```

22 tests: **15 passed, 7 failed, 0 skipped**. These are compatibility failures
introduced by selecting the required format 4 path: existing fixture adapters
at tests 15, 16, 17, 21, 22 return Pass without reading the semantic stream;
tests 19 and 20 issue legacy `id` reads instead of exact `source_id` reads.
They fail at fixture qualification setup before the later operating-provenance
assertions. Their private-helper apply seeding remains unchanged. The public
regression supplies the required complete delivery instead of relaxing the gate.
These seven failures remain unresolved and are not claimed as passing or as
pre-existing failures. Raw logs: `operating-state-node22.tap` and
`operating-state-node25.tap` in the same eval directory. Existing tests were not
edited to hide or bypass these failures.

No broad suite, independent native QA, live-company acceptance, or live-company
Pass was performed. This is an uncommitted maintainer candidate with passing
focused public coverage and the seven disclosed fixture compatibility failures.
The patch artifact is `evals/public-represented-v2/repair.patch`.

## Root integration follow-up

The seven fixture failures above remain retained in their original logs. The
operating test adapter now reads every frozen format-4 source through exact
source_id ranges before its synthetic verdict; the production delivery gate was
not weakened. The merged check includes a canonical-proof bookkeeping assertion
and an exclusive publication-deadline regression for format4 receipt validation.
Root ran both exact Node paths with `--test
tests/public-represented-v2.test.mjs tests/operating-state.test.mjs
tests/operating-control.test.mjs tests/timeout-wiring.test.mjs`:44/44 passed on
each runtime, no failures, skips or cancellations. The raw merged logs are
`evals/public-represented-v2/node22-integrated.log` and `node25-integrated.log`.
The original patch is retained in the native assignment checkout; its source
changes are now part of the integrated Git diff. No independent native QA or
actual-company acceptance is claimed.
