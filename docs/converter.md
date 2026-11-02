# Materializing a team

The converter turns a venture configuration and a pinned governance spec into a workspace for independent Codex or Claude Code sessions. It prepares the foundation for [one founder conversation with automatic role handoffs](founder-interface.md). The automatic runner is not implemented yet.

## Generate a workspace

From this repository:

```sh
python3 tools/materialize.py \
  --config examples/venture.json \
  --output /tmp/my-venture \
  --target both
```

The default governance source is `specs/v0.1.md`, the agreed baseline. To experiment with the latest draft, select it explicitly:

```sh
python3 tools/materialize.py \
  --config examples/venture.json \
  --output /tmp/my-venture-v03 \
  --target both \
  --spec specs/v0.3-draft.md
```

Selecting a draft does not promote it to the baseline. Use a fresh output directory; the converter does not overwrite an existing team's files. The example configuration is a starting template, not evidence of founder authorization or customer demand.

The configuration accepts `name`, `idea`, and `active_roles`. Roles default to `pm`, `research`, and `qa`; initial Frame preparation requires `pm`. Other supported IDs are `designer`, `engineer`, `architect`, `frontend`, `backend`, `release`, `growth`, `support`, `legal`, `security`, and `finance`. Select only the roles the current phase needs. Charters are proposed starters that Frame must review against the pinned spec, not automatic interpretations of every future spec revision.

## Generated artifacts

- Root `AGENTS.md` and `CLAUDE.md` wrappers for the selected platforms.
- `team/governance.md`: an exact copy of the pinned source spec.
- A manifest recording the configuration, selected roles, and governance source.
- `team/roles/<role>.md`: each configured active role's charter.
- `team/sessions/<role>.md`: a startup brief identifying the role and its governing material.
- `team/board/frame.json`, the shared protocol, spec skeletons, and templates for work and review records.

The initial Frame record requires actual completion and review. Generation does not pass a gate, authorize spending, or resolve unknowns.

## Developer testing: one session per role

To test the generated role briefs, open separate sessions from the same workspace. This manual procedure is for development; the intended founder workflow does not involve talking to each role. For example, after changing your working directory to `/tmp/my-venture`:

```sh
codex "Read team/sessions/pm.md and follow it."
```

Or:

```sh
claude "Read team/sessions/pm.md and follow it."
```

Use another session and its corresponding startup brief for another role. The brief assigns an instructional role identity; it is not authenticated permission enforcement. Do not use the author's conversation to provide its own independent acceptance.

The platforms read project instructions through their supported conventions: [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [Claude Code CLAUDE.md](https://code.claude.com/docs/en/memory). Claude supports [an initial prompt on the command line](https://code.claude.com/docs/en/cli-reference). Its `.claude/agents` definitions describe [subagents within a parent session](https://code.claude.com/docs/en/sub-agents), so the converter does not treat them as standalone role sessions.

## How the sessions cooperate

Every role reads the same canonical specs, board, artifacts, and decision records. It submits a handoff artifact; the designated receiver or independent reviewer records acceptance or rejection. Conversation and private session memory do not synchronize automatically and do not replace those records.

This prototype requires a shared filesystem visible to every participating session. Separate cloud checkouts need an explicit synchronization or board service; a common Git remote alone does not provide live shared state.

Serialize shared writes and reviews manually for now. Prompts do not enforce ownership, atomic transitions, independence, spending limits, or concurrent-write safety. The converter does not launch or supervise sessions, wake sleeping roles, or require API keys. No live end-to-end team session has been verified.

## Evolution

The current converter can prepare a separate candidate workspace for comparison. It cannot replace a live team safely. Do not point both workspaces at live company state or copy a candidate over running records. The target architecture keeps the company independent of team versions and uses the [checked handover and recovery protocol](company-continuity.md). Existing evidence, decisions, obligations, and open work remain company-owned.

Next milestones are an authoritative board service with identity checks and atomic transitions, a runner with platform adapters for session start/resume and recovery, and the single founder conversation. The runner routes work from accepted board transitions; founder attention is reserved for direction and decision packets. Keep those mechanics separate from domain judgment and the evolving governance spec.
