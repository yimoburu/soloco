# Issue 16: fresh bounded qualification

This work fixes an evaluation portability defect and extends the native evidence. It does not close the founder-benefit or harmful-splitting acceptance gaps. The founder confirmed that measured human active time, interruptions and rebriefing observations are unavailable; those fields remain unknown.

## Exact current-host selection

The inspected current Codex host advertises only `gpt-6-astra`, with `low`, `medium`, `high`, `xhigh`, `max` and `ultra` effort. The original accepted-workflow evaluator hardcoded `gpt-6.1-sol`, so it could not exercise this host without editing the fixture. The evaluator now accepts `--model EXACT_CATALOG_MODEL`; production dispatch still checks that exact model and effort against the inspected host catalog. No unavailable-model fallback or paid speed setting is introduced. Historical default behavior and receipts are preserved.

Extraction uses low effort, bounded parser repair medium and consequential independent acceptance high, all with `host_default` speed. The selection and rationale are identical between schedules. These are requested and launch-applied choices. Effective answering settings, token usage, billing and monetary savings remain unobserved. A one-model catalog cannot establish a comparison between different models.

## Frozen repeated comparison

`tools/repeated-workflow-eval.mjs` creates four fresh fictional pairs in predeclared serial/concurrent, concurrent/serial, serial/concurrent, concurrent/serial order. Each arm follows the same production dispatch/worker path: exact extraction, repair of an actually failing parser, actual immutable sandbox tests, a distinct native QA session, and exact receiver acceptance. Only independent extraction and coding can overlap. QA depends on both and on the actual test receipt.

The fixed criteria require every outcome correct and accepted, zero quality-error margin, zero critical false acceptance, at most two generation attempts per arm and at most 32 native calls for the entire series. Only an actual deterministic failing receipt can consume the one repair. A held arm, provider error or source drift stops the series; no later arm serves as a retry. Prior failures and the original single-pair evidence remain unchanged.

The report records per-arm timings through acceptance, calls, attempted repairs, failed tests, source/runtime hashes and software attention events. Human observations are separate nullable fields. Four samples per schedule support a descriptive median and observed maximum; they do not establish a reliable population tail or statistical non-inferiority. Provider/background variability and the small repeated workload also limit causal latency claims.

Run on an authorized host with an advertised exact model:

```sh
node tools/repeated-workflow-eval.mjs --native NEW_OUTPUT_DIRECTORY --model gpt-6-astra
```

Reports and raw host diagnostics belong in the new local output directory. Publish only sanitized numeric summaries and public-source hashes. The disposable fixture binding directory is separate from actual companies. No installation, ownership transfer, governing-instruction adoption, company pin change or business action is part of this evaluation.

## Observed matched outcomes

All eight native arms passed actual tests and distinct-session independent acceptance, with 24 calls total. The four pairs used the frozen order above; no arm was replaced or retried. Both schedules had zero subsequent repairs, failed candidate test attempts or software attention events. Human active minutes and interruptions remain unknown.

| Schedule | Accepted | Calls | Median through acceptance | Observed maximum |
|---|---:|---:|---:|---:|
| Serial | 4/4 | 12 | 51.479 s | 61.225 s |
| Concurrent independent work | 4/4 | 12 | 38.614 s | 39.533 s |

The source/runtime fingerprints matched before and after all eight arms. The original suite SHA is `89459a25eb70cab0e2607394901850a902c3801245df031f757a6b3b7a4551a7`. After this frozen run, independent review requested a stricter metadata check that every arm match the predeclared selections, including when all arms drift together. The strengthened assessor SHA is `ec18ba5f295c89106252c014a2b6d7ff85acef1207f4b746b3341cfdb0e252eb`; it also passes the unchanged retained results. This check made no model calls and did not replace any original result. The evaluator's source manifest includes uncommitted evaluation changes, so the parent Git revision alone is not its source identity.

Sanitized numeric evidence and exact public-source fingerprints are retained in `evals/issue16-qualification-20261107/`. Raw diagnostics, native identifiers and model outputs remain local; the generic `publicReport()` helper alone does not remove host diagnostic text and must not be treated as publication sanitization.

The [frozen code manifest](../evals/issue16-qualification-20261107/frozen-code-manifest.json) makes the exact executed evaluator code publicly reviewable. The original repeated harness was recovered after execution by reversing only the three known control-binding edits, then matching its bytes to the original predeclared SHA above. The accepted-workflow override and workflow driver snapshots match their executed source-manifest hashes directly. These code-only snapshots add no model calls and change no original result.

## Separate current-host task and policy qualification

A separate prospective protocol capped this qualification at twelve calls and allowed no repairs or retries; the first unsuccessful result would stop all remaining calls. It used three eight-case coordination trials and three trials each of exact extraction, parser generation with actual sandbox tests, and consequential review of four seeded acceptance defects. Outcome-case order rotated across repetitions. All twelve calls passed, with stable public-source/grader fingerprints; all original outputs remain locally retained.

| Task | Requested effort | Result | Median through grading | Observed maximum |
|---|---|---:|---:|---:|
| Coordination decisions | medium | 24/24 decisions | 15.755 s | 15.878 s |
| Exact extraction | low | 3/3 | 9.669 s | 10.188 s |
| Parser generation | medium | 3/3 actual test passes | 11.205 s | 11.794 s |
| Seeded acceptance review | high | 3/3; zero of twelve blocker observations missed | 8.816 s | 9.497 s |

These are current-host quality observations, not a model-versus-model or policy-before/after comparison. Task trial elapsed time includes actual deterministic grading; the matched-workflow table above separately includes production dispatch, generation, tests, independent review and receiver acceptance. Three samples do not establish a reliable slow tail. The two frozen qualifications used **36 native calls total**, below their combined maximum of 44, with no repairs or new grants.

Focused validation passed 32 checks: seven existing accepted-workflow checks, four repeated-workflow checks, ten coordination/integration checks and eleven model-selection checks. The strengthened assessor's four checks were rerun after its final change. Plugin build consistency and whitespace checks passed. These are focused evaluator/runtime checks; they are not a new full-suite or installed-company acceptance claim.

## Remaining acceptance

The repeated fixture covers independent work; it is not a real coupled-work or harmful-splitting comparison. Existing runtime regressions enforce shared-resource conflicts, exact dependency readiness and uncertain-cancellation retention. Fictional policy cases exercise keeping coupled work with one owner. Neither substitutes for an actual representative accepted-workflow comparison that measures duplicated context, integration conflicts, repair/review cost and latency when splitting is harmful.

The broader production workload, multi-model policy quality, actual human founder effort and causal business benefit remain unestablished. Issue 16 should remain open for those explicit requirements; software harness attention events must not be reported as observed human interruptions.
