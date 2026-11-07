# Source-only coherent planner checks

Baseline: `c5333356790f0d84b3728d71538bdab521364bbf`.

The `node22.log` and `node25.log` files are the final combined test outputs from:

```sh
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --test tests/legacy-operating.test.mjs tests/legacy-coherent.test.mjs tests/scoped-context.test.mjs tests/upgrade-evidence.test.mjs
/opt/homebrew/bin/node --test tests/legacy-operating.test.mjs tests/legacy-coherent.test.mjs tests/scoped-context.test.mjs tests/upgrade-evidence.test.mjs
```

`coherent-node22.log` and `coherent-node25.log` additionally retain the final eight planner tests in isolation. Binaries report Node v22.13.0 and v25.2.1. Tests exercise fictional SQLite/vault and existing scoped worker contract doubles. They are not independent QA, native acceptance, actual-company measurement, or proof of same-session context fit. No network, installation, release, company authority or host changes were performed.

The implementation is a coherent extraction planner and unchanged canonical source adapter. The prospective coherent partitioner/receipt coverage boundary remains Held; no provider or publication gate was changed. Prior manifest-v1 behavior and all prior evidence stay retained.
