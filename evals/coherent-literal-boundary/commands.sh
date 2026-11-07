#!/bin/sh
# Run from the isolated source checkout at 7dfb23900d91bce63dec7d6b26fc69573bc1d84f.
# Historical reproduction, run after adding coherent regressions BEFORE the
# runtime repair; exit 1 expected (4 failures, 1 passing typed-reference guard):
# /private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test --test-name-pattern='reference examples|identical real|nested STRING promotion|oversized reserved-key|genuine typed' tests/legacy-coherent.test.mjs > evals/coherent-literal-boundary/before-node22.log 2>&1
# Final validation (both commands exited 0; existing earlier logs retained):
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --version
/opt/homebrew/bin/node --version
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/legacy-coherent.test.mjs tests/scoped-coherent-runtime.test.mjs tests/scoped-corpus-runtime.test.mjs tests/legacy-operating.test.mjs > evals/coherent-literal-boundary/node22.log 2>&1
/opt/homebrew/bin/node --test tests/legacy-coherent.test.mjs tests/scoped-coherent-runtime.test.mjs tests/scoped-corpus-runtime.test.mjs tests/legacy-operating.test.mjs > evals/coherent-literal-boundary/node25.log 2>&1
git diff --check > evals/coherent-literal-boundary/diff-check.log 2>&1
git diff -- plugins/soloco/runtime/legacy-operating.mjs tests/legacy-coherent.test.mjs tests/legacy-operating.test.mjs docs/legacy-operating.md > evals/coherent-literal-boundary/source.patch
