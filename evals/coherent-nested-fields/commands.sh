#!/bin/sh
# Run from the isolated source checkout. No installation or network required.
# Additional directly affected coverage: shared legacy codec/bootstrap guards.
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/legacy-coherent.test.mjs tests/scoped-coherent-runtime.test.mjs tests/scoped-corpus-runtime.test.mjs tests/legacy-operating.test.mjs > evals/coherent-nested-fields/node22.log 2>&1
/opt/homebrew/bin/node --test tests/legacy-coherent.test.mjs tests/scoped-coherent-runtime.test.mjs tests/scoped-corpus-runtime.test.mjs tests/legacy-operating.test.mjs > evals/coherent-nested-fields/node25.log 2>&1
git diff --check
