# Claude Code parity

SoloCo provides the same company workflow in Codex and Claude Code: one founder conversation, the shared CoS instructions and MCP tools, persistent records, standalone specialists, independent QA, durable task dependencies, pause and checked handover. Host UI, model families and host-specific controls still differ. Browser-only Claude is not a local Claude Code plugin host.

The parity checks cover:

- Startup commands and matching hook/MCP data directories on both hosts. `company_doctor` and `company_hooks inspect` check the actual root/session binding. Claude's current hook discovery and trust remain unverified; use `/hooks` for those settings.
- Required native identity and completed text on Claude results, matching identity on resume, and retained returned evidence when a process exits unsuccessfully. Retained rejected evidence never becomes an accepted artifact.
- Claude's documented model aliases are recognized as mechanical catalog metadata. Previously, an explicitly selected Claude model could fail the durable task's context check before startup because only Codex's `host_catalog` source was recognized. Unknown aliases and unsupported effort claims still hold.
- The complete durable task runtime test suite on both hosts, including independent QA gates, peer messages, cancellation, recovery, resource claims and owner fencing.
- The same real-MCP native acceptance harness on either host. Its three finite native sessions exercise producer → independent QA → receiver, task-scoped peer messages and supervisor restart. The hook binding in this harness is synthetic; it does not prove live host hook invocation.

Run source checks:

```sh
node --no-warnings --test tests/claude-terminal-state.test.mjs tests/codex-terminal-state.test.mjs tests/hooks.test.mjs tests/host-acceptance.test.mjs tests/task-runtime.test.mjs tests/selection-adapter.test.mjs
node tools/build-plugin.mjs --check
claude plugin validate plugins/soloco --strict
claude plugin validate . --strict
```

Prepare a fictional fixture without model calls:

```sh
node tools/async-runtime-acceptance.mjs --prepare-only --host claude --output-dir /tmp/soloco-claude-prepared
```

On a clean source commit, with the selected CLI signed in, explicitly run the native check using a new output directory:

```sh
node tools/async-runtime-acceptance.mjs --run-native --host claude --model sonnet --output-dir /tmp/soloco-claude-native
```

Native execution consumes the existing host allowance. The report records source hashes, requested model, native IDs, exact protocol evidence and observed outcome. A failed run stays failed; inspect it without automatically retrying. Omitting `--host` preserves the Codex harness default. Claude omits explicit effort because alias-specific effort support remains unverified.

Claude's [hook contract](https://code.claude.com/docs/en/hooks) and [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference) define host loading behavior. Passing manifests and contract tests does not establish identical model answers, UI rendering, account entitlement or actual-company handover acceptance.

## Validation on November 7, 2026

Final runtime commit `f25d3c2` passed the repository's Node 22 regression selection on macOS: **713 tests passed, zero failures and zero skips**. The selected files came from `selectedTests('regression-22', inventory(...))`; the slower full qualification lane was not run. Build drift, whitespace checks and Claude CLI 2.1.319's strict plugin and marketplace validation passed.

A live Claude fixture at commit `c714790` passed producer → independent QA → receiver using three distinct native sessions. It verified the exact fictional output and restrictions, QA Pass, peer-message processing, supervisor restart during work without duplicate execution, no extra jobs while idle and confirmed native process closure. The subsequent `f25d3c2` change adds recognition of host-default fast-off catalog metadata and is covered by the final regression suite; the three-role native fixture was not repeated for that metadata-only extension.

A separate real Claude host launch with the source plugin loaded its SoloCo startup instructions in an empty temporary folder. The adapter then resumed that same native session and recalled the exact folder value. These establish live source-plugin startup and session continuity, not an actual-company handover or identical host UI.

Earlier failures remain retained: the first fixture exposed the catalog-source bug before a model call; an environment attempt could not load required organization settings; a later native response used an object where the artifact contract requires a string. Authentication was restored through the normal host flow, and the shared response instruction now explicitly requires serialized text. Fresh corrected fixtures passed; failed attempts were not rewritten or retried in place.

See the [validation receipt](../evals/claude-parity-20261107.json) for source identities and evidence hashes. The changes have not been merged or released as a new installed plugin version. Model choices, host UI and account entitlement remain host-specific.
