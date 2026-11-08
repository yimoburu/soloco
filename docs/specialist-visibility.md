# Visible specialist updates

Whenever a specialist is summoned or resumed, the next founder-facing response prominently labels its **role/name**, concrete assignment, actual status and next handoff. Several agents use a compact list or table, with separate instances distinguished by observed identities. Results attribute specialist findings separately from Chief of Staff synthesis.

This applies to ordinary dispatch, fresh and resumed sessions, independent reviewers and durable-runtime jobs. A submitted task remains planned until a job is dispatched. Failed or held assignments stay visible. Software test jobs are software work, and returned artifacts remain distinct from QA Pass and receiver acceptance. Unrelated replies do not repeat an unchanged roster.

Example using fictional observations:

- **Engineering — queued:** Repair the parser. Next handoff: independent QA.
- **QA — planned / not summoned:** Review the exact candidate after Engineering returns it.

## Implementation

The shared CoS skill defines the behavior for Codex and Claude Code. Public job mutation receipts and job collection pages carry a `founder_response` reminder so actual dispatch and observation evidence prompts the update. It is added only to the public projection; canonical job/task records, exact source hashes and context proofs are unchanged. `company_progress` continues to use shared guidance and its existing renderers.

The reminder neither displays a message itself nor records delivery, acknowledgment or authority. Existing companies retain their pinned team instructions until their normal checked adoption; merging source does not rewrite company pins or install a release.

## Validation

`tests/specialist-reporting.test.mjs` exercises real engine/worker seams on both hosts: queued dispatch, observed resume, fresh sessions, independent review, failed workers, durable task admission and oversized failed-job projections. It verifies that the cue stays outside canonical evidence.

`tools/specialist-visibility-eval.mjs` asks each native host to produce the actual Markdown response for seven independent fictional situations. It uses production receipt projections and retains the policy, fixture, prompt and grader hashes, raw answers and native model evidence. The cases cover queued/planned work, resumed work with an independent reviewer, multiple Research instances, failure, durable-runtime observations, final attribution and direct synthesis without a roster.

Both hosts' seven sampled responses passed the revised automated checks and independent review for issue #42. The [retained evaluation](../evals/specialist-visibility-20261107/independent-semantic-review.json) identifies the exact original reports. Original automated results remain unchanged: the first grader incorrectly treated later narrative about other jobs or absent results as a queued-state contradiction. The repaired grader was tested against those false failures and adversarial false passes, then separately reapplied to the same saved answers. Fixtures and prompts remained byte-identical; no native response was rerun to obtain a passing grade.

These are finite response samples using fictional tool observations, supported by separate engine integration tests. They do not establish all future response behavior or live-company execution. Independent review also retains two broader unsupported claims in Claude's sample prose; neither is accepted as evidence of session information boundaries or source-file state. Requested settings and usage observations do not establish effective model settings or billing.

Run the evaluator with a new report path:

```sh
node tools/specialist-visibility-eval.mjs --host codex --output /tmp/visibility-codex.json
node tools/specialist-visibility-eval.mjs --host claude --model sonnet --output /tmp/visibility-claude.json
```

Native evaluation uses the existing signed-in host allowance. Preserve failed reports and independently inspect actual text; the tool does not summon company specialists or change company state.
