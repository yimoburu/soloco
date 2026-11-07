#!/bin/sh
# Run from the isolated source checkout, base a97929e10f11723a163cb49329cb4799cc1e4e17.
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --version > evals/coherent-containers/node22-version.log 2>&1
/opt/homebrew/bin/node --version > evals/coherent-containers/node25-version.log 2>&1
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/legacy-coherent.test.mjs tests/legacy-operating.test.mjs tests/scoped-coherent-runtime.test.mjs tests/scoped-corpus-runtime.test.mjs > evals/coherent-containers/node22.log 2>&1
/opt/homebrew/bin/node --test tests/legacy-coherent.test.mjs tests/legacy-operating.test.mjs tests/scoped-coherent-runtime.test.mjs tests/scoped-corpus-runtime.test.mjs > evals/coherent-containers/node25.log 2>&1
git diff --check > evals/coherent-containers/diff-check.log 2>&1
