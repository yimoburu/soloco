# Plugin delivery and workspace generation

The intended installable product is the Company plugin. The converter is an internal helper that currently generates a developer workspace for standalone Codex or Claude Code role sessions. It implements file preparation only; the [current spec](../SPEC.md) defines the intended once-initiated founder experience and automatic collaboration.

## Founder flow versus developer preview

The target flow is **create project → attach company folder → open a chat and talk**, after one-time Company plugin installation. The first message starts the Chief of Staff and its adaptive interview; company records and specialist sessions are prepared automatically. Existing companies resume without resetting records or creating a competing coordinator. No special startup prompt or configuration file is required from the founder.

The GitHub README is the new-user entry point: register the repository marketplace, install the Company plugin in the chosen app, complete dependencies/permissions, and verify readiness. The catalog, package, and automatic startup are not implemented; do not advertise install commands for this repo yet. The generator below is an internal building block exposed for manual development. It requires a config and a new output path; it cannot initialize an already-attached folder in place. A future initializer must preserve existing files and recover interrupted setup. Do not run the generator over an existing company or copy a generated candidate over its records.

## Planned plugin package and distribution

Ship one Company plugin through a small catalog in this GitHub repository. A separate marketplace service is unnecessary; private distribution requires repository access. Use shared governance, role templates, and engine logic, with host-specific packaging and adapters only where needed. The Chief of Staff skill guides the interview; the engine initializes records, provides standalone session tools, and enforces company actions. Coordination judgment stays with the Chief of Staff. The existing Python helper can remain internal. Installation must handle dependencies without asking founders to run Python or edit configuration files.

Keep installed code/templates separate from company folders. Package updates make candidate versions available; explicit company adoption and compatibility checks govern use. Uninstall must preserve company records, including notices and permissions. Package presence alone proves neither readiness nor successful authority enforcement.

Platform evidence checked 2026-11-02:

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) supports repository marketplaces. Lifecycle hooks are documented for manually installed Codex desktop plugins, require trust, and currently exclude a plugin from the public directory. Validate the repository-install route and first-message behavior; do not promise public-directory availability or identical behavior across clients.
- [Claude plugin installation](https://code.claude.com/docs/en/discover-plugins) supports desktop installation and marketplace registration; [its catalog format](https://code.claude.com/docs/en/plugin-marketplaces) can be hosted in a Git repository. Installing components does not itself implement our session identity, takeover, or company authority rules.

The release readiness check must verify supported host/runtime versions, required dependencies, available company tools, and needed permissions without modifying an existing company. Exercise first-message initialization, resume, independent specialist sessions, and update preservation in integration tests before declaring the founder flow supported.

## Generate for development

Edit [the example](../examples/venture.json), then run from this repository:

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target codex
```

Use `--target claude` for Claude Code. `both` emits both instruction wrappers for the same company folder. You may open it in Codex and Claude; use one active environment at a time in this prototype. Opening both does not transfer authority or implement mixed-platform orchestration.

New workspaces pin `SPEC.md` by exact bytes and SHA-256 hash. For an explicit custom source, supply `--spec /path/to/spec.md`. This pins the source but does not adapt the current role templates to older designs; use the matching historical converter commit to reproduce an older design. Pinning a source neither approves it for a company nor proves that starter charters implement every rule. Review charters against the selected source at Frame. The converter never modifies an existing output, including symlinks.

Configuration fields are `name`, `idea`, and optional `active_roles` (default `runner`, `pm`, `research`, `qa`). Initial Frame preparation requires `runner` (Chief of Staff) for operations and `pm` for product scope. Explicit role lists missing either are rejected, not silently expanded. Other IDs: `designer`, `engineer`, `architect`, `frontend`, `backend`, `release`, `growth`, `support`, `legal`, `security`, `finance`. These are proposed seats, not approval to activate the whole roster.

## Output and authority

| Files | Purpose |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | Selected platform's project instructions; no implicit role assignment |
| `team/governance.md`, `manifest.json` | Exact pinned rules, source hash, converter version, configuration, prototype status |
| `team/roles/`, `team/sessions/` | Proposed charters and a distinct startup brief per selected role |
| `team/specs/`, `board/`, `artifacts/`, `decisions/` | Company spec skeletons, Draft Frame, and locations for durable working records |
| `team/founder-inbox/`, `founder-preferences.json` | Empty durable inbox and Draft profile with separate explicit/inferred entries |
| `team/PROTOCOL.md`, `templates/`, `START.md` | Manual development procedure and unapproved record starters |

Converter v0.7 aligns its generated guidance with the v0.9 plugin-delivery design: the Chief of Staff startup brief now includes the focused interview and resume-first behavior; automatic role assignment remains unimplemented. Chief of Staff naming retains role ID `runner`; Company Operations contains a proposed activation guide for all available roles; charters require independent qualification evidence. Record templates cover founder notices, source-attributed communication preferences, and role evaluations. A notice's delivery, seen status, resolution, and authorization are distinct; decision-required notices reference the existing founder packet. Place notice records in `team/founder-inbox/`, qualification evidence in `team/artifacts/`, and preference entries in the profile's `explicit` or `inferred` list. Use `must_know` or `decision_required` for notice kind, and `explicit` or `inferred` for preference basis. Keep superseded entries traceable.

Notification and professional-review policies each have one home in Founder Intent; Frame references their accepted versions. No preferences, notices, delivery receipts, successful evaluations, or approvals are invented at generation. These are empty locations and unapproved record starters, not automated learning, delivery, activation, or enforcement. Existing workspaces retain their files and pinned rules.

Frame permits preparation only. Missing constraints remain unknown; no approval, customer evidence, spending permission, or gate Pass is fabricated. Release owns Support Readiness until a Support seat is selected. Architect owns the whole Technical spec when selected; Engineering retains its implementation section.

For now, company records and team instructions are colocated under `team/`. There is no persistent company identity service, team-release registry, or live migration mechanism. That prototype layout is not a replacement boundary: never copy a candidate over company records.

## Manual developer preview — not founder onboarding

Open the generated company folder in the chosen desktop project, or work from it in the CLI. In the main conversation ask `Read team/sessions/runner.md and follow it.` The following CLI commands do the same preparation:

```sh
codex "Read team/sessions/runner.md and follow it."
```

```sh
claude "Read team/sessions/runner.md and follow it."
```

The Chief of Staff is the founder-facing agent; `runner` remains its stable role ID. Use each other role's brief in its own session. The intended founder workflow does not require these per-role steps. Session attribution here is self-reported, not authentication; changing the role label does not create independent approval.

Every participating session must see the same filesystem. A common Git remote is not live shared state. Manually serialize writes and route handoffs; prompts do not enforce ownership, review independence, atomic transitions, or limits. Generation stages files and cleans up ordinary failures, but publication is not crash-atomic: do not use an interrupted output as a ready workspace.

Platform instruction conventions: [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code memory](https://code.claude.com/docs/en/memory), and [Claude CLI](https://code.claude.com/docs/en/cli-reference). The generator emits role briefs rather than treating [Claude subagent definitions](https://code.claude.com/docs/en/sub-agents) as standalone role sessions.

## Next implementation boundary

Package the Company plugin and catalog, complete dependency setup and readiness checks, and implement first-message startup: recognize new versus existing company state, bind the founder chat to one Chief of Staff, preserve existing files and pinned governance, recover incomplete setup, and start necessary standalone specialists without founder setup. An ordinary project instruction file alone cannot identify the authorized founder chat or supervise a team.

The remaining runtime work is an authoritative board with identity and atomic state transitions, execution tools for session dispatch/recovery and external-action reconciliation, and connecting the Chief of Staff agent to those tools in the existing founder conversation. The Chief of Staff makes workflow judgments; software independently enforces permissions, prerequisites, and state changes. Direct founder pause and specialist decision packets must remain available if the Chief of Staff fails or disagrees. This requires no separate Founder connection agent or service. The durable founder inbox still needs delivery/retry tracking and enabled notification channels; profile updates need attribution and correction; qualification and mandatory review need execution gates. Preserve one authorized Chief of Staff across interfaces. Team replacement must satisfy the current spec's continuity checks before live use. Generating a separate candidate workspace is only preparation.

Platform adapters must verify standalone session lifecycle, peer messaging, UI visibility, and delivery in the selected client/version; native subagents or team panels alone do not prove these guarantees. A cross-product switch may require a new chat restored from company records.

Tests cover generator behavior. No live end-to-end agent team, automatic founder flow, or replacement has been verified. The generator itself launches no model processes and needs no API keys.
