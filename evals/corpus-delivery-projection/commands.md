# Commands and retained evidence

All commands ran in the isolated source worktree. No network/install/release or actual company access.

```sh
git rev-parse HEAD
git status --short
/opt/homebrew/bin/node --version
/opt/homebrew/opt/node@22/bin/node --test tests/scoped-context.test.mjs tests/scoped-corpus-runtime.test.mjs tests/scoped-coherent-runtime.test.mjs > evals/corpus-delivery-projection/node22.log 2>&1
/opt/homebrew/bin/node --test tests/scoped-corpus-runtime.test.mjs tests/scoped-coherent-runtime.test.mjs > evals/corpus-delivery-projection/initial-node25.log 2>&1
/opt/homebrew/bin/node --test --test-name-pattern='phase delivery|unmarked corpus' tests/scoped-corpus-runtime.test.mjs
/opt/homebrew/bin/node --test tests/scoped-context.test.mjs tests/scoped-corpus-runtime.test.mjs tests/scoped-coherent-runtime.test.mjs tests/legacy-coherent.test.mjs > evals/corpus-delivery-projection/final-node25.log 2>&1
/opt/homebrew/bin/node --check plugins/soloco/runtime/scoped-context.mjs > evals/corpus-delivery-projection/syntax-node25.log 2>&1
git diff --check > evals/corpus-delivery-projection/diff-check.txt
git diff -- plugins/soloco/runtime/scoped-context.mjs tests/scoped-corpus-runtime.test.mjs docs/scoped-context.md > evals/corpus-delivery-projection/source.patch
```

Focused fixture revisions are retained as focused-initial, second, third, fourth, fifth, sixth and seventh-node25.log. The first six failed at the unchanged 12 KB output guard; the seventh passed. Final-node25.log covers the final dependency-body and unknown-schema assertions too. These are fictional scripted judgments, not semantic/native acceptance.

Legacy byte comparison: obtain the exact baseline runtime with `git show b7a186ade659972f3007dc973a8e520c68200fe6:plugins/soloco/runtime/scoped-context.mjs`; write it into a temporary directory, replacing relative ESM module specifiers (`'./`) with absolute file URLs to this worktree's runtime dependencies. No baseline runtime logic is modified. Set CORPUS_BASELINE_MODULE to that file URL, then run:

```sh
CORPUS_BASELINE_MODULE="$(cat evals/corpus-delivery-projection/baseline-module.txt)" /opt/homebrew/bin/node --test --test-name-pattern='unmarked corpus' tests/scoped-corpus-runtime.test.mjs > evals/corpus-delivery-projection/legacy-byte-comparison-node25.log 2>&1
```

The test compares complete assignment objects, including rendered packets, qualification bindings and stream bytes, for unmarked domain/interface/final targets against the pinned renderer. The temporary module path is retained in baseline-module.txt. Tests create only disposable fictional fixture stores with scripted worker adapters; no real native/model execution occurs.
