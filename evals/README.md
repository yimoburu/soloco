# Specialist selection policy evaluation

This evaluation checks whether a model following the repository CoS instructions makes task-appropriate **decisions**, rather than always requesting the strongest settings. It does not launch the selected specialists or benchmark their task performance.

The five fictional assignments cover exact extraction (including an inherited strong session), bounded coding, consequential independent review, evidence-based escalation, and a missing catalog. The fictional catalog includes explicit qualification and relative-cost evidence; these are not rankings of actual models. The scorer rejects strongest-for-everything, cheapest-for-everything, unsupported speed, missing rationale, and missing/duplicate decisions. Expected answers are withheld from the model's prompt.

Run the offline scorer tests:

```sh
node --no-warnings --test tests/selection-policy.test.mjs
```

To evaluate a separately supplied response without any model calls:

```sh
node tools/selection-eval.mjs --response decisions.json --output new-report.json
```

An opt-in live run uses the existing host CLI/account allowance and sends only the repository CoS skill and fictional fixtures. It disables model tools through the existing adapter, makes one fresh inference request, and writes a new receipt without overwriting prior results. Explicit evaluator choices must pass current catalog validation; model names below must be replaced with an available permitted identifier. No selected specialist, company handover, source integration or upgrade runs.

```sh
node tools/selection-eval.mjs --live codex --model MODEL_ID --effort low --output new-report.json
```

Claude is also supported with `--live claude`; omit explicit effort because alias-specific support is unverified. Omit `--model` to evaluate using a deliberately chosen host default. This opt-in call consumes existing host usage; no additional service or paid speed tier is enabled.

The receipt records policy/fixture hashes, decisions, verdicts, elapsed time, and requested/applied/observed evaluator controls separately. Native session IDs and account identifiers are not retained. Historical receipts do not establish that a changed policy passes: compare the hashes or run it again.

## Current v0.6.3 observed result

[selection-policy-v0.6.3-2026-11-05.json](selection-policy-v0.6.3-2026-11-05.json) records a completed decision-only evaluation on the current policy hash `295312da5bd5ad6567857ac3fa2a0a3c9b1f5c870661dc38365fcc698274d5ff`. One live Codex response passed all five fictional decisions using the existing host account allowance. The evaluator requested `gpt-6.1-sol` / low effort; launch arguments record those applied controls. Actual effective model, effort and speed remain unknown. Selected specialists were not executed, and this result establishes neither their performance nor cost savings.

## Historical observed result

`selection-policy-2026-11-04.json` records a pre-DAG skill hash and is preserved unchanged. It does not validate the changed v0.6.3 skill; the completed current-policy receipt above provides that decision-only evidence.

In that historical run, one live Codex response passed all five decisions. The evaluator requested `gpt-6.1-sol` / low effort; launch arguments confirm those controls were applied. Effective model/effort/speed remain unverified in Codex output. The decisions used small/low, balanced/medium, deep/high, deep/high after failure, and a reasoned host default when the catalog was unavailable.

This is a narrow behavioral regression baseline, not evidence of actual specialist quality, lower spending, provider entitlement, improved production distribution or behavior of already pinned company teams. Existing selection integration tests separately check real dispatch/worker/launch wiring using synthetic CLIs. The account screenshot cannot establish which specialist jobs produced its aggregate distribution.
