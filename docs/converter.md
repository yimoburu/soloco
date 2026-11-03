# Developer guide

The [README](../README.md) covers installation and the current release boundary. [SPEC.md](../SPEC.md) is the target contract; the plugin is a preparation-and-review implementation, not a claim that every acceptance criterion passes.

The target covers ongoing operation against founder-defined objectives, including profitability and founder workload where relevant. Launch and financing are optional milestones. The current plugin can prepare objectives, operating plans, and reviews from supplied evidence; it does not run business operations, collect live business metrics, or schedule unattended operating reviews. Existing companies keep their pinned governance until explicit adoption through the upgrade flow.

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
| `runtime/upgrade.mjs` | Candidate inspection, native CoS/QA continuity checks, explicit adoption, verification, and definition recovery |
| `runtime/adapters.mjs`, `worker.mjs` | Start/resume native standalone role processes and publish their results |
| `assets/` | Bundled canonical governance and proposed role catalog |

The Chief of Staff decides what to assign; software commits records and runs sessions. There is no second coordination agent or founder connection service. Role sessions use explicit native IDs, not `--continue`/`--last` or parent-owned subagents. Peer messages enter durable role inboxes and are included on the recipient's next assignment; a message does not wake a role independently of Chief of Staff scheduling.

## Records and authority

The attached folder contains `.company/company.sqlite` and SQLite's companion files while active. The database stores identity, pinned governance and role definitions, draft intent/plans/preferences, author-attributed artifacts and exact-version reviews, jobs, native session references, messages, notices, and an event index. Use Company tools to inspect or amend it. Keep `.company/` private; back up using SQLite's backup facilities or after all connections close, rather than copying a live database file alone.

Initialization preserves existing project files. A legacy `team/manifest.json` is detected and held for explicit migration; it is never silently imported or overwritten. Company records remain outside install/cache paths. An unsupported runtime version holds ordinary mutation. The explicit upgrade flow supports schema-1 v0.1.0 preparation records and schema-2 records on runtime v0.2.0; it does not silently adopt definitions or migrate arbitrary formats.

Startup hooks bind the host's session ID and attached folder in private plugin data. Only the current coordinator may mutate ordinary records. A second chat can read status, pause, or perform an explicitly requested handover after active assignments are held. Handover increments the ownership epoch and retires old role instances; successors use company records. Pausing cancels eligibility, not an already-sent model request. Late, outdated, or revoked results are quarantined and cannot become acceptance.

All artifacts remain proposals or submissions. An independent review verdict applies to one draft version and supplies no gate Pass, role qualification, or external-action permission. Author identity and version checks are structural; reviewer expertise and evidentiary sufficiency still require evaluation. The founder host remains permissioned by its own app. Local filesystem access can bypass the record store; this is not hardened multi-user isolation.

Workers run without business execution tools: Claude's built-in tools/MCP servers are disabled; Codex uses a read-only sandbox, disabled shell/peer-agent/web tools, and isolated working directories. The runtime limits concurrent assignments to three, bounds each model call to three minutes, preserves failures, and never automatically retries uncertain results. Company tools expose no arbitrary shell or external-action endpoint. Native provider history lives with the host; it is not portable company memory.

Notices track presentation attempts, seen status, and resolution separately. Startup/prompt hooks present pending notices even if the Chief of Staff did not request them; chat-context presentation is not proof of human receipt. The literal founder message `pause` directly holds company work. Natural-language controls are recorded by the Chief of Staff and are not independent human-authentication proofs. No notice or control can grant venture execution in this release.

## Checked team upgrades

`company_upgrade` exposes `inspect`, `prepare`, `apply`, `verify`, and `recover`. `inspect` is read-only and returns the candidate hash plus instruction/governance differences. `prepare` requires that hash, the current ownership epoch, and the exact founder instruction; changed governance also requires a separate source instruction. A different founder chat requires explicit takeover and a paused company; the same mechanism allows recovery when the previous coordinator disappeared during an upgrade. CLI readiness/authentication must pass. Active assignments must finish or be cancelled before preparation.

Preparation snapshots business state, preserves previous definitions, pins the candidate, increments ownership, and moves to schema 2. Old v0.1.0 coordinators reject schema 2, even if they refresh their epochs. Compatible v0.2.0 coordinators reject ordinary mutations during the upgrade. Both coordinator instructions and specialist charters are pinned in state; startup hooks provide only upgrade guidance until adoption/recovery permits normal work. `compat/company-0.1.0.md` is the immutable CoS skill from commit `a5590b6`, used to recover the shipped legacy definition that v0.1.0 did not persist.

A detached worker runs two fresh native sessions: candidate CoS reconstruction and independent QA review. Both must identify the checkpoint and cover all record/job/notice/message IDs; QA must also judge the substantive recovery and instruction compatibility. A Pass must explicitly permit `apply_preparation_team` with no unresolved blockers; a qualified Pass that withholds adoption is rejected and retained. These structural checks do not establish professional qualification or guarantee model judgment. The current spec explicitly scopes this path to preparation-only migration; preserving older governance can correctly block adoption on its stricter requirements. The CoS must obtain explicit governance adoption rather than silently waive them. Rehearsal size is bounded without truncation. `company_wait`/`company_status` expose progress; interrupted checks fail closed after seven minutes, without automatic retry. New business facts invalidate review; delivery-attempt bookkeeping does not.

`apply` requires a passing exact-checkpoint review and unchanged installed candidate. It atomically pins the adopted definitions, retires specialist references, and revokes the previous ownership epoch. `verify` is a separate post-commit readback of company identity, preserved records, obligations, notices, and other checkpoint fields. Normal work and resume remain held until it passes. The CoS reloads its pinned brief; specialists cold-start on their next assignment. The two probe sessions test preparation continuity; they are not the founder's chat or a claim that every future specialist has been live-tested.

`recover` restores prior definitions under runtime v0.2.0, retires sessions again, and retains later evidence, messages, notices, and upgrade history. It leaves the company paused for a checked resume. No database rollback occurs, and the old v0.1.0 binary cannot operate the migrated schema. Natural-language upgrade/takeover instructions use the same source-attribution boundary as existing controls; they are not independent human authentication or external-action approval. Same-user filesystem access remains outside the security boundary.

## Build and test

The spec and role catalog have one authoring source: `SPEC.md` and `tools/materialize.py`. The CoS meta rules live in the spec; skills and generated role briefs apply them, and existing outcome reviews assess them. Regenerate the package assets after changing either source; the build check detects drift.

```sh
python3 tools/build_plugin.py
python3 tools/build_plugin.py --check
python3 -m unittest discover -s tests -v
node --no-warnings --test tests/*.test.mjs
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
