# Materializing a team

The converter generates a developer workspace for standalone Codex or Claude Code role sessions. It implements file preparation only; the [current spec](../SPEC.md) defines the intended once-initiated founder experience and automatic collaboration.

## Generate

Edit [the example](../examples/venture.json), then run from this repository:

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target codex
```

Use `--target claude` for Claude Code. `both` emits both instruction wrappers for testing; it does not implement mixed-platform orchestration.

New workspaces pin `SPEC.md` by exact bytes and SHA-256 hash. For an explicit custom source, supply `--spec /path/to/spec.md`. This pins the source but does not adapt the current role templates to older designs; use the matching historical converter commit to reproduce an older design. Pinning a source neither approves it for a company nor proves that starter charters implement every rule. Review charters against the selected source at Frame. The converter never modifies an existing output, including symlinks.

Configuration fields are `name`, `idea`, and optional `active_roles` (default `runner`, `pm`, `research`, `qa`). Initial Frame preparation requires `runner` for operations and `pm` for product scope. Explicit role lists missing either are rejected, not silently expanded. Other IDs: `designer`, `engineer`, `architect`, `frontend`, `backend`, `release`, `growth`, `support`, `legal`, `security`, `finance`. These are proposed seats, not approval to activate the whole roster.

## Output and authority

| Files | Purpose |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | Selected platform's project instructions; no implicit role assignment |
| `team/governance.md`, `manifest.json` | Exact pinned rules, source hash, converter version, configuration, prototype status |
| `team/roles/`, `team/sessions/` | Proposed charters and a distinct startup brief per selected role |
| `team/specs/`, `board/`, `artifacts/`, `decisions/` | Company spec skeletons, Draft Frame, and locations for durable working records |
| `team/PROTOCOL.md`, `templates/`, `START.md` | Manual development procedure and unapproved record starters |

Converter v0.4 adds the proposed Team Runner / Operations Lead charter, session brief, and Company Operations spec. Runner prepares Frame and records source-attributed founder instructions; PM retains Product ownership. Startup instructions select Runner regardless of role-list order. Founder-packet authority references, gate failure disposition, prior-result references, and approval rationale remain in the record templates. The professional-review policy has one home in Founder Intent; Frame references its accepted version. These are blank record starters, not routing or approval enforcement. Existing workspaces retain their generated files and pinned rules.

Frame permits preparation only. Missing constraints remain unknown; no approval, customer evidence, spending permission, or gate Pass is fabricated. Release owns Support Readiness until a Support seat is selected. Architect owns the whole Technical spec when selected; Engineering retains its implementation section.

For now, company records and team instructions are colocated under `team/`. There is no persistent company identity service, team-release registry, or live migration mechanism. That prototype layout is not a replacement boundary: never copy a candidate over company records.

## Manual developer preview

From the generated project root, start a separate session with one brief, using the relevant installed CLI:

```sh
codex "Read team/sessions/runner.md and follow it."
```

```sh
claude "Read team/sessions/runner.md and follow it."
```

Runner is the intended founder-facing agent, closest to a Chief of Staff in a human company. Use each other role's brief in its own session. The intended founder workflow does not require these per-role steps. Session attribution here is self-reported, not authentication; changing the role label does not create independent approval.

Every participating session must see the same filesystem. A common Git remote is not live shared state. Manually serialize writes and route handoffs; prompts do not enforce ownership, review independence, atomic transitions, or limits. Generation stages files and cleans up ordinary failures, but publication is not crash-atomic: do not use an interrupted output as a ready workspace.

Platform instruction conventions: [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code memory](https://code.claude.com/docs/en/memory), and [Claude CLI](https://code.claude.com/docs/en/cli-reference). The generator emits role briefs rather than treating [Claude subagent definitions](https://code.claude.com/docs/en/sub-agents) as standalone role sessions.

## Next implementation boundary

The remaining work is an authoritative board with identity and atomic state transitions, execution tools for session dispatch/recovery and external-action reconciliation, and connecting the Runner agent to those tools in the existing founder conversation. Runner makes workflow judgments; software independently enforces permissions, prerequisites, and state changes. Direct founder pause and specialist decision packets must remain available if Runner fails or disagrees. This requires no separate Founder connection agent or service. Team replacement must satisfy the current spec's continuity checks before live use. Generating a separate candidate workspace is only preparation.

Tests cover generator behavior. No live end-to-end agent team, automatic founder flow, or replacement has been verified. The generator itself launches no model processes and needs no API keys.
