# Materializing a team

The converter generates a developer workspace for standalone Codex or Claude Code role sessions. It implements file preparation only; the [current spec](../SPEC.md) defines the intended once-initiated founder experience and automatic collaboration.

## Generate

Edit [the example](../examples/venture.json), then run from this repository:

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target codex
```

Use `--target claude` for Claude Code. `both` emits both instruction wrappers for testing; it does not implement mixed-platform orchestration.

New workspaces pin `SPEC.md` by exact bytes and SHA-256 hash. For an explicit historical or custom source, supply `--spec`, for example `--spec history/specs/v0.1.md`. Pinning a source neither approves it for a company nor proves that starter charters implement every rule. Review charters against the selected source at Frame. The converter never modifies an existing output, including symlinks.

Configuration fields are `name`, `idea`, and optional `active_roles` (default `pm`, `research`, `qa`). Initial Frame preparation requires `pm`. Other IDs: `designer`, `engineer`, `architect`, `frontend`, `backend`, `release`, `growth`, `support`, `legal`, `security`, `finance`. These are proposed seats, not approval to activate the whole roster.

## Output and authority

| Files | Purpose |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | Selected platform's project instructions; no implicit role assignment |
| `team/governance.md`, `manifest.json` | Exact pinned rules, source hash, converter version, configuration, prototype status |
| `team/roles/`, `team/sessions/` | Proposed charters and a distinct startup brief per selected role |
| `team/specs/`, `board/`, `artifacts/`, `decisions/` | Company spec skeletons, Draft Frame, and locations for durable working records |
| `team/PROTOCOL.md`, `templates/`, `START.md` | Manual development procedure and unapproved record starters |

Frame permits preparation only. Missing constraints remain unknown; no approval, customer evidence, spending permission, or gate Pass is fabricated. Release owns Support Readiness until a Support seat is selected. Architect owns the whole Technical spec when selected; Engineering retains its implementation section.

For now, company records and team instructions are colocated under `team/`. There is no persistent company identity service, team-release registry, or live migration mechanism. That prototype layout is not a replacement boundary: never copy a candidate over company records.

## Manual developer preview

From the generated project root, start a separate session with one brief, using the relevant installed CLI:

```sh
codex "Read team/sessions/pm.md and follow it."
```

```sh
claude "Read team/sessions/pm.md and follow it."
```

Use each other role's brief in its own session. The intended founder workflow does not require these per-role steps. Session attribution here is self-reported, not authentication; changing the role label does not create independent approval.

Every participating session must see the same filesystem. A common Git remote is not live shared state. Manually serialize writes and route handoffs; prompts do not enforce ownership, review independence, atomic transitions, or limits. Generation stages files and cleans up ordinary failures, but publication is not crash-atomic: do not use an interrupted output as a ready workspace.

Platform instruction conventions: [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude Code memory](https://code.claude.com/docs/en/memory), and [Claude CLI](https://code.claude.com/docs/en/cli-reference). The generator emits role briefs rather than treating [Claude subagent definitions](https://code.claude.com/docs/en/sub-agents) as standalone role sessions.

## Next implementation boundary

The remaining work is an authoritative board with identity and atomic state transitions, a deterministic runner for session dispatch/recovery and external-action reconciliation, and integration with the existing founder conversation. Team replacement must satisfy the current spec's continuity checks before live use. Generating a separate candidate workspace is only preparation.

Tests cover generator behavior. No live end-to-end agent team, automatic founder flow, or replacement has been verified. The generator itself launches no model processes and needs no API keys.
