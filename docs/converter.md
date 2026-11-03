# Developer guide

`tools/materialize.py` prepares files for a **manual developer trial**. It does not install a plugin, start agents, route messages, enforce permissions, or deliver notifications. The [spec](../SPEC.md) defines the product; this guide describes the prototype.

## Try it

From this repository, edit [the example configuration](../examples/venture.json), then run:

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target both
```

The output must be a new path. The generator refuses existing folders and symlinks; it cannot initialize an attached folder in place or upgrade a company. Use only an output whose generation completed successfully: staging cleans up ordinary failures, but publication is not crash-atomic.

Open the generated folder in Codex or Claude Code and ask: **Read team/sessions/runner.md and follow it.** This starts Chief of Staff preparation. Each specialist needs its own standalone session with its corresponding brief. All sessions must see the same filesystem; manually route handoffs and serialize writes. A shared Git remote alone is not shared live state. These manual steps are for development, not the intended founder onboarding.

Use one active environment at a time. `--target codex` or `--target claude` emits only that platform's instructions; `both` emits both for the same company. Role attribution is self-reported, not authenticated, and changing a role label does not create independent review. Project instructions and native subagent definitions alone do not establish standalone company roles.

## Configuration and records

Configuration accepts `name`, `idea`, and optional `active_roles`. Defaults are `runner` (Chief of Staff), `pm`, `research`, and `qa`. Explicit lists must include `runner` and `pm` for Frame preparation. Other IDs are `designer`, `engineer`, `architect`, `frontend`, `backend`, `release`, `growth`, `support`, `legal`, `security`, and `finance`. Selected roles are proposed, not authorized.

| Output | Purpose |
|---|---|
| `START.md`, `AGENTS.md` / `CLAUDE.md` | Manual startup and platform instructions; no automatic role assignment |
| `team/governance.md`, `manifest.json` | Exact pinned spec, SHA-256 hash, generator version, configuration, and prototype status |
| `team/PROTOCOL.md` | Shared file locations and manual operating procedure |
| `team/roles/`, `sessions/` | Proposed charters and distinct role startup briefs |
| `team/specs/`, `board/` | Draft or dormant spec skeletons and Draft Frame |
| `team/artifacts/`, `decisions/` | Evidence, outputs, and attributable decisions |
| `team/founder-inbox/`, `founder-preferences.json` | Initially empty notices and Draft explicit/inferred communication preferences |
| `team/templates/` | Unapproved starters for decisions, packets, handoffs, gates, notices, preferences, and role evaluations |

Frame permits preparation only. No approval, evidence, successful evaluation, delivery receipt, spending permission, or gate Pass is invented. Notification and professional-review policies belong in Founder Intent; Frame references their accepted versions. Release owns Support Readiness until Support is selected; Architect owns Technical when selected, with Engineering retaining implementation.

The default governance source is `SPEC.md`. `--spec /path/to/spec.md` pins another UTF-8 source exactly, but does not adapt the role templates to it; review compatibility at Frame. Use a matching historical generator to reproduce an earlier design. Pinning rules does not approve them.

Records and team instructions are colocated under `team/` in this prototype. Never copy a generated candidate over company records. Keep company folders outside plugin caches, preserve them when changing apps, and retain pinned rules until explicit adoption. Live migration and authority transfer are unimplemented.

## What remains to build

Ship one Company plugin through a small repository marketplace catalog, with shared guidance/templates and engine logic plus thin host adapters. A separate marketplace service is unnecessary; private distribution requires repository access. Installation must handle dependencies and verify supported host capabilities and permissions without altering companies.

The Chief of Staff makes coordination judgments. Supporting software must:

- Initialize or resume company records on the first founder message, recover partial setup, and bind one authorized Chief of Staff.
- Start, resume, replace, and connect standalone role sessions through the existing app UI, with direct peer communication.
- Enforce identity, independent review, versions, permissions, and atomic board changes at execution boundaries; prompts alone are insufficient.
- Deliver founder notices and pause controls independently of the Chief of Staff; preserve unresolved requests and attributed preferences.
- Preserve company state across app switches and explicit team adoption, revoke outgoing authority, reject stale writes, and reconcile uncertain external actions.

Verify these behaviors in each supported client/version, including installation, interrupted startup, resume, and replacement, before advertising automatic onboarding. Plugin updates make candidate versions available; they must not silently change a company's pinned rules. Uninstall preserves company records. Cross-product switching may require a new chat, recovered from the same records.

## Validation

```sh
python3 -m unittest discover -s tests -v
```

Tests cover file generation, authority-free starter records, ownership, and preservation of existing outputs. No live agent team, plugin installation, automatic founder flow, or replacement has been verified. The generator launches no model processes and needs no API keys.
