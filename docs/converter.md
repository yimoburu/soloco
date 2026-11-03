# Materializing a team

The converter generates a developer workspace for standalone Codex or Claude Code role sessions. It implements file preparation only; the [current spec](../SPEC.md) defines the intended once-initiated founder experience and automatic collaboration.

## Founder flow versus developer preview

The target flow is **create project → attach company folder → open a chat and talk**, after one-time framework installation. The first message starts the Chief of Staff and its adaptive interview; company records and specialist sessions are prepared automatically. Existing companies resume without resetting records or creating a competing coordinator. No special startup prompt or configuration file is required from the founder.

The GitHub README is the new-user entry point and must eventually provide a versioned installation path and readiness check for the chosen app. That installer and startup automation are not implemented. The generator below is an internal building block exposed for manual development. It requires a config and a new output path; it cannot initialize an already-attached folder in place. A future initializer must preserve existing files and recover interrupted setup. Do not run the generator over an existing company or copy a generated candidate over its records.

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

Converter v0.6 reconciles the v0.8 design: the Chief of Staff startup brief now includes the focused interview and resume-first behavior; automatic role assignment remains unimplemented. Chief of Staff naming retains role ID `runner`; Company Operations contains a proposed activation guide for all available roles; charters require independent qualification evidence. New templates cover founder notices, source-attributed communication preferences, and role evaluations. A notice's delivery, seen status, resolution, and authorization are distinct; decision-required notices reference the existing founder packet. Place notice records in `team/founder-inbox/`, qualification evidence in `team/artifacts/`, and preference entries in the profile's `explicit` or `inferred` list. Use `must_know` or `decision_required` for notice kind, and `explicit` or `inferred` for preference basis. Keep superseded entries traceable.

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

Implement the installer and first-message startup first: recognize new versus existing company state, bind the founder chat to one Chief of Staff, preserve existing files and pinned governance, recover incomplete setup, and start necessary standalone specialists without founder setup. An ordinary project instruction file alone cannot identify the authorized founder chat or supervise a team.

The remaining runtime work is an authoritative board with identity and atomic state transitions, execution tools for session dispatch/recovery and external-action reconciliation, and connecting the Chief of Staff agent to those tools in the existing founder conversation. The Chief of Staff makes workflow judgments; software independently enforces permissions, prerequisites, and state changes. Direct founder pause and specialist decision packets must remain available if the Chief of Staff fails or disagrees. This requires no separate Founder connection agent or service. The durable founder inbox still needs delivery/retry tracking and enabled notification channels; profile updates need attribution and correction; qualification and mandatory review need execution gates. Preserve one authorized Chief of Staff across interfaces. Team replacement must satisfy the current spec's continuity checks before live use. Generating a separate candidate workspace is only preparation.

Platform adapters must verify standalone session lifecycle, peer messaging, UI visibility, and delivery in the selected client/version; native subagents or team panels alone do not prove these guarantees. A cross-product switch may require a new chat restored from company records.

Tests cover generator behavior. No live end-to-end agent team, automatic founder flow, or replacement has been verified. The generator itself launches no model processes and needs no API keys.
