All commands ran from the isolated source worktree at b7a186a. No network, installation, release, commit, connected company tools/data, other worktree writes, host/config changes, or other sessions were used. Tests create and remove fictional temporary Stores.

Initial source check:
```sh
git rev-parse --short HEAD
git status --short
```
Output: `b7a186a`; initial status empty.

Runtime availability:
```sh
/opt/homebrew/bin/node --version
/opt/homebrew/opt/node@22/bin/node --version > evals/operating-intake-dependencies/node22.log 2>&1
```
Node 25: `v25.2.1`. Node 22 command exited 127 (executable absent).

Baseline checkpoint command (before runtime edits), exit 0, 6/6:
```sh
/opt/homebrew/bin/node --test tests/operating-checkpoint.test.mjs > evals/operating-intake-dependencies/baseline-node25.log 2>&1
```

The following focused commands were run in order. Each log is retained, including failures:
```sh
/opt/homebrew/bin/node --test tests/operating-checkpoint.test.mjs > evals/operating-intake-dependencies/first-candidate-node25.log 2>&1
/opt/homebrew/bin/node --test tests/operating-checkpoint.test.mjs > evals/operating-intake-dependencies/regressions-node25-attempt1.log 2>&1
/opt/homebrew/bin/node --test tests/operating-checkpoint.test.mjs > evals/operating-intake-dependencies/regressions-node25-attempt2.log 2>&1
/opt/homebrew/bin/node --test tests/operating-checkpoint.test.mjs > evals/operating-intake-dependencies/regressions-node25-attempt3.log 2>&1
/opt/homebrew/bin/node --test tests/operating-checkpoint.test.mjs > evals/operating-intake-dependencies/checkpoint-node25-final.log 2>&1
```
Exits: 0, 1, 0, 1, 0 respectively. The final focused command was also rerun after extending the real normalized fixture from immutable-only to immutable-entry/legacy historical maps; exit 0, 13/13, final log retained. Earlier successful final-log runs were overwritten; all failure logs remain.

Affected operating suites, exit 0, 71/71 (runtime candidate final; checkpoint file then had 12 tests):
```sh
/opt/homebrew/bin/node --test tests/operating-checkpoint.test.mjs tests/operating-state.test.mjs tests/operating-control.test.mjs tests/operating-tree-publication.test.mjs tests/operating-upgrade.test.mjs tests/legacy-operating.test.mjs > evals/operating-intake-dependencies/operating-node25-attempt1.log 2>&1
```
The final focused command above covers the subsequently added thirteenth checkpoint test. No runtime edits followed the affected suite run.

Requested Node 22 affected suite command, exit 127:
```sh
/opt/homebrew/opt/node@22/bin/node --test tests/operating-checkpoint.test.mjs tests/operating-state.test.mjs tests/operating-control.test.mjs tests/operating-tree-publication.test.mjs tests/operating-upgrade.test.mjs tests/legacy-operating.test.mjs > evals/operating-intake-dependencies/operating-node22.log 2>&1
```

Counterfactual (copies runtime and focused tests into a temporary directory, replaces only the two changed runtime modules with `git show HEAD:<path>`, runs Node 25, removes temporary directory):
```sh
python3 evals/operating-intake-dependencies/counterfactual.py
```
Wrapper exits 0 after recording child exit 1. Final baseline child: 7 pass, 6 fail. Full exact reproducible implementation is in `counterfactual.py`; output is `counterfactual-final-base-node25.log`. The earlier equivalent inline Python run, before the real normalized test was added, produced `counterfactual-base-node25.log` (7 pass, 5 fail); that failure log is also retained.

Packaging/check commands (captured with Python subprocess to record exit codes):
```sh
git diff -- plugins/soloco/runtime/operating-state.mjs plugins/soloco/runtime/snapshot.mjs tests/operating-checkpoint.test.mjs
git diff --check
git status --short
```
Outputs: `source.patch`, `diff-check.log`, `status.log` in this directory. No whole-repository suite was run.
