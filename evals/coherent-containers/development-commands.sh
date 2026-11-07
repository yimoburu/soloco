#!/bin/sh
# Preliminary tests, before the final four-file runs in commands.sh.
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/legacy-coherent.test.mjs > evals/coherent-containers/development-node22.log 2>&1
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/legacy-coherent.test.mjs tests/legacy-operating.test.mjs > evals/coherent-containers/development-codec-node22.log 2>&1
