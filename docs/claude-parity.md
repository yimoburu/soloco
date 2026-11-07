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

Source commit `39f3794` passed the repository's Node 22 regression selection on macOS: **711 tests passed, zero failures and zero skips**. The selected files came from `selectedTests('regression-22', inventory(...))`; the slower full qualification lane was not run. Build drift, whitespace checks and Claude CLI 2.1.319's strict plugin and marketplace validation passed.

The first real-MCP Claude fixture exposed the catalog-source bug before any native model invocation. That failure was retained, the bug was fixed, and explicit model selection now passes through queue, worker startup and reconciliation in regression tests on both hosts.

The corrected native fixture and a separate real-host startup probe remain **blocked**. Claude reports that organization-required remote managed settings could not load, and its readiness check reports unauthenticated. No successful native specialist completion, live startup-hook delivery or native resume is claimed. Complete the normal Claude sign-in/settings recovery, then use a fresh fixture directory for the native acceptance command above; preserve both earlier failed fixtures. The changes are source work and have not been released as a new installed plugin version.
