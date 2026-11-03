# Developer guide

The [README](../README.md) covers installation and the current release boundary. [SPEC.md](../SPEC.md) is the target contract; the plugin is a preparation-and-review implementation, not a claim that every acceptance criterion passes.

## Plugin structure

`plugins/company/` is self-contained. The repository's `.agents/plugins/marketplace.json` and `.claude-plugin/marketplace.json` distribute the same package to Codex and Claude. The portable manifest and MCP configuration serve Codex; `.claude-plugin/plugin.json` and `.mcp.json` supply Claude's format. Host-specific hooks share the runtime.

| Component | Responsibility |
|---|---|
| `skills/company/` | Chief of Staff interview, coordination, reviewed proposals, and founder communication |
| `skills/setup/` | Readiness without creating a company |
| `scripts/run.sh` | Use compatible Node or install checksum-pinned Node 22.22.0 privately; no npm dependencies |
| `runtime/main.mjs` | Startup hooks and the stdio MCP tool interface |
| `runtime/store.mjs` | SQLite transactions and persistent company state |
| `runtime/engine.mjs` | Coordinator ownership, records, assignments, notices, pause, and handover |
| `runtime/adapters.mjs`, `worker.mjs` | Start/resume native standalone role processes and publish their results |
| `assets/` | Bundled canonical governance and proposed role catalog |

The Chief of Staff decides what to assign; software commits records and runs sessions. There is no second coordination agent or founder connection service. Role sessions use explicit native IDs, not `--continue`/`--last` or parent-owned subagents. Peer messages enter durable role inboxes and are included on the recipient's next assignment; a message does not wake a role independently of Chief of Staff scheduling.

## Records and authority

The attached folder contains `.company/company.sqlite` and SQLite's companion files while active. The database stores identity, pinned governance and role definitions, draft intent/plans/preferences, author-attributed artifacts and exact-version reviews, jobs, native session references, messages, notices, and an event index. Use Company tools to inspect or amend it. Keep `.company/` private; back up using SQLite's backup facilities or after all connections close, rather than copying a live database file alone.

Initialization preserves existing project files. A legacy `team/manifest.json` is detected and held for explicit migration; it is never silently imported or overwritten. Company records remain outside install/cache paths. A different plugin version holds mutation until compatible adoption is implemented; it does not silently upgrade existing companies.

Startup hooks bind the host's session ID and attached folder in private plugin data. Only the current coordinator may mutate ordinary records. A second chat can read status, pause, or perform an explicitly requested handover after active assignments are held. Handover increments the ownership epoch and retires old role instances; successors use company records. Pausing cancels eligibility, not an already-sent model request. Late, outdated, or revoked results are quarantined and cannot become acceptance.

All artifacts remain proposals or submissions. An independent review verdict applies to one draft version and supplies no gate Pass, role qualification, or external-action permission. Author identity and version checks are structural; reviewer expertise and evidentiary sufficiency still require evaluation. The founder host remains permissioned by its own app. Local filesystem access can bypass the record store; this is not hardened multi-user isolation.

Workers run without business execution tools: Claude's built-in tools/MCP servers are disabled; Codex uses a read-only sandbox, disabled shell/peer-agent/web tools, and isolated working directories. The runtime limits concurrent assignments to three, bounds each model call to three minutes, preserves failures, and never automatically retries uncertain results. Company tools expose no arbitrary shell or external-action endpoint. Native provider history lives with the host; it is not portable company memory.

Notices track presentation attempts, seen status, and resolution separately. Startup/prompt hooks present pending notices even if the Chief of Staff did not request them; chat-context presentation is not proof of human receipt. The literal founder message `pause` directly holds company work. Natural-language controls are recorded by the Chief of Staff and are not independent human-authentication proofs. No notice or control can grant venture execution in this release.

## Build and test

The spec and role catalog have one authoring source: `SPEC.md` and `tools/materialize.py`. Regenerate the package assets after changing either; the build check detects drift.

```sh
python3 tools/build_plugin.py
python3 tools/build_plugin.py --check
python3 -m unittest discover -s tests -v
node --no-warnings --test tests/plugin.test.mjs
claude plugin validate plugins/company --strict
claude plugin validate . --strict
```

Use the bundled launcher if Node is not already available:

```sh
sh plugins/company/scripts/run.sh doctor codex
sh plugins/company/scripts/run.sh doctor claude
```

Native local installation tests should use temporary host configuration directories; do not change a user's installed plugins merely to validate packaging. Real model tests use the user's normal host login and may consume their model allowance. The deterministic suite uses synthetic model outputs and exercises subprocess dispatch, not external services. The README records the separately observed live checks.

Implementation references: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins), [OpenAI hooks](https://learn.chatgpt.com/docs/hooks), [Claude manifest](https://code.claude.com/docs/en/plugins-reference), [Claude hooks](https://code.claude.com/docs/en/hooks), and [Claude programmatic sessions](https://code.claude.com/docs/en/headless). Local CLI help was also checked for the versions in the README. Host capability checks fail visibly rather than implying compatibility with every app/version.

## Legacy workspace generator

`tools/materialize.py` remains a manual developer preview, separate from plugin onboarding:

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target both
```

Configuration accepts `name`, `idea`, and optional `active_roles`, defaulting to `runner`, `pm`, `research`, and `qa`. Explicit lists require `runner` and `pm`. `codex`, `claude`, and `both` select instruction wrappers; `--spec` pins an explicit UTF-8 governance source without adapting templates to it.

Output includes `START.md`, the selected platform wrappers, and `team/` with pinned governance, manifest, proposed charters, role briefs, draft/dormant specs, Draft Frame, empty record locations, and unapproved templates. It starts no sessions and grants no authority. Follow its generated `START.md` only for manual trials; do not mix it with the plugin's `.company/` state.

Existing outputs and symlinks are refused. Generation stages files and cleans up ordinary failures, but publication is not crash-atomic; use only successfully completed output. All manual sessions must see the same filesystem, use one active environment, and serialize writes. A Git remote alone is not shared live state.
