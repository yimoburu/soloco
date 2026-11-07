# Claude Code parity

SoloCo provides the same company workflow in Codex and Claude Code: one founder conversation, the shared CoS instructions and MCP tools, persistent records, standalone specialists, independent QA, durable task dependencies, pause and checked handover. Host UI, model families and host-specific controls still differ. Browser-only Claude is not a local Claude Code plugin host.

The parity checks cover:

- Startup commands and matching hook/MCP data directories on both hosts. `company_doctor` and `company_hooks inspect` check the actual root/session binding. Claude's current hook discovery and trust remain unverified; use `/hooks` for those settings.
- Required native identity and completed text on Claude results, matching identity on resume, and retained returned evidence when a process exits unsuccessfully. Retained rejected evidence never becomes an accepted artifact.
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
