# Operating integration guards — local maintainer repair

Base: c5333356790f0d84b3728d71538bdab521364bbf. No version bump, network, remote actions, install, release, adoption, company-state access or subagents. All model responses are fictional contract doubles. No independent QA, live native acceptance or full migration acceptance is claimed.

## Behavior and scope

* Consumption globally holds every new/changed typed record, even a falsely unrelated proposed scope; proposal/review still includes those candidate homes. Exact unchanged unrelated accepted homes retain reviewed membership/dependency selection.
* Bookkeeping uses the existing proofJobSafe grammar, exact target/revision, canonical producing artifact/identity, Pass and closure. Failed/quarantined/uncertain/unknown-extension/additional proof siblings stay DIRTY. One current review execution can exclude itself. Re-publication retains exact prior proof triples without rewriting canonical sources.
* currentExtensions validates the closed prospective mechanical operating index before omitting it. Existing scoped classification bytes remain unchanged across first publication. Unknown state fields remain consequential; malformed/tampered indices hold. Frozen legacy receipts without operating_state retain their existing extension projection.
* Ordinary format 6 exposes exact explicit supplemental evidence handles and reuses bounded allowlisted record reads, source currentness and same-native checks. No operating-publication retrieval branch or stream/fresh-native admission change.

The separate publication provenance body/canonical producer-closure seam and legacy bootstrap/resumption remain outside this patch. The conservative provider still does not establish complete migration coverage. Historical proof references grow with publications and remain subject to the existing coherent context bound.

## Exact commands and evidence

Node22 = /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node (v22.13.0).
Node25 = /opt/homebrew/bin/node (v25.2.1).
Commands ran from the repository root. Each raw log below was produced by redirecting stdout/stderr with `> evals/operating-integration-guards/NAME.tap 2>&1`.

Final focused command, run with each exact Node path:

```
NODE --test tests/operating-state.test.mjs tests/scalable-state.test.mjs tests/integration-context.test.mjs tests/coordination-integration.test.mjs tests/legacy-operating.test.mjs
```

`verified-node22.tap` and `verified-node25.tap`: exit 0, 42 passed each, 0 failed, 0 skipped/cancelled. Covers all four seams, falsely scoped late changes and re-publication, v4 valid self-currentness and sibling retention, index tampering, explicit non-home evidence dispatch/context/read, changed/unauthorized reads, allowlist mutation and wrong native. `focused-node22.tap`/`focused-node25.tap` were earlier 42/42 passes before the final additional test assertions.

Scoped compatibility command, run with each exact Node path:

```
NODE --test --test-name-pattern='operating publication reuses|unknown source fields|source-only extraction survives|forward native admission|single-packet rejected identities|later changed stream identity' tests/scoped-context.test.mjs
```

`scoped-compat-node22.tap` and `scoped-compat-node25.tap`: exit 0, 6 passed each, 0 failed, 0 skipped/cancelled. Name-filtered runs intentionally do not execute other scoped tests.

Bounded legacy handover command, run with each exact Node path:

```
NODE --test --test-name-pattern='same-owner pause/resume|exact independent QA allows|incomplete, non-independent|state changes invalidate acceptance' tests/handover.test.mjs
```

`handover-compat-node22.tap` and `handover-compat-node25.tap`: exit 0, 4 passed each, 0 failed, 0 skipped/cancelled. Other handover tests were excluded by name filter.

## Preserved earlier evidence and failures

* `baseline-node22.tap`: Node22 `--test tests/operating-state.test.mjs`, original source, exit 0, 9/9 passed.
* `initial-node22.tap`: same command after first patch, exit 1, 6 passed/3 failed. Old expectations allowed unrelated changed home bytes, expected a later exact-source diagnostic, and expected QA rather than an earlier DIRTY closure hold. Updated expectations to the requested conservative behavior.
* `regressions-node22.tap`: same command after regressions, exit 1, 12 passed/1 failed. Re-publication exposed three orphaned prior proof objects becoming DIRTY; fixed by retaining exact validated prior proof triples in prospective snapshots.
* `republish-node22.tap`: Node22 `--test tests/operating-state.test.mjs --test-name-pattern='.'`, exit 0, 13/13 passed.
* `scoped-reuse-node22.tap`: Node22 `--test --test-name-pattern='operating publication reuses' tests/scoped-context.test.mjs`, exit 1, 0 passed/1 failed. The new tamper fixture used structuredClone without inheriting immutable snapshot bindings. Corrected with inheritSnapshots; no production workaround.
* `scoped-reuse-fixed-node22.tap`: same scoped command, exit 0, 1/1 passed.
* `final-node22.tap`/`final-node25.tap`: expanded command appended `tests/handover.test.mjs` to the final focused command. Node22 exit 1: 68 passed/1 failed; Node25 exit 1: 41 passed/1 failed/1 cancelled (handover pending promise/event-loop resolution). After about a minute, Ctrl-C was submitted to both sessions; the logs are retained exactly. The v4 regression incorrectly expected acceptance after resume had added a new consequential control record. Corrected its baseline to the exact pre-resume proof state; final focused reruns pass. The entire expanded run was not repeated; only the four bounded legacy handover checks above passed on both runtimes. No full-suite pass is claimed.
* A process diagnostic command `ps -Ao pid,ppid,etime,args | rg '[n]ode --test tests/operating-state.test.mjs tests/scalable-state.test.mjs tests/integration-context.test.mjs tests/coordination-integration.test.mjs tests/legacy-operating.test.mjs tests/handover.test.mjs'` returned exit 1, `zsh:1: operation not permitted: ps`. No escalation or process discovery followed.

`git diff --check > evals/operating-integration-guards/diff-check.log 2>&1`: exit 0, empty output. All pre-existing failed evidence remains in place; no evidence files were removed.

## Commit storage limitation

Normal `git add docs/operating-state.md plugins/soloco/runtime/context.mjs plugins/soloco/runtime/current-state.mjs plugins/soloco/runtime/operating-state.mjs plugins/soloco/runtime/worker.mjs tests/operating-state.test.mjs tests/scoped-context.test.mjs evals/operating-integration-guards` returned exit 128: `fatal: Unable to create /Users/xiaoweili/work/soloco/.git/worktrees/source17/index.lock: Operation not permitted`. The managed sandbox does not permit changing that worktree metadata. No escalation, host configuration change or external ref update was attempted.

A detached local commit object and index are therefore stored entirely inside this evidence directory, using Git plumbing and an alternate read-only object source for the existing public base. `repair.patch` is the portable source/tests/docs/evidence commit artifact with the exact c533335 parent. The attached worktree HEAD remains c533335. This does not claim a normal worktree commit/ref update.

Final source/docs/tests commit diff check (`git diff --check HEAD COMMIT -- docs plugins tests`) exits 0; `source-diff-check.log` retains that result. Whole-commit `git diff-tree --check COMMIT` exits 2 solely for six whitespace-only lines in the preserved original failed TAP output (`initial-node22.tap` and `scoped-reuse-node22.tap`). `commit-diff-check.log` retains the diagnostics; raw failed evidence was intentionally not rewritten. The first plumbing wrapper raised CalledProcessError on that expected whole-commit whitespace diagnostic after successfully creating the detached commit/patch; both checks were then captured explicitly. Normal checkout status remains modified because its external index/ref cannot be updated.
