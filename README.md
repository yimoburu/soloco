# AI-operated startup

Give an idea to a team of AI agents and operate a company through **one founder conversation**. Each role works in its own standalone session. Shared company records let roles collaborate and let the founder replace the team while preserving the company.

The team progresses toward public launch or funding readiness through conventional startup roles, bounded authority, independent review, and evidence.

## Read only what you need

- [Current spec](SPEC.md): founder responsibilities, collaboration, evidence gates, learning, and company continuity.
- [Converter guide](docs/converter.md): what works today and how to generate a developer workspace.
- [History](history/README.md): original intent, previous versions, and review provenance; not competing current requirements.

## What works today

The Python workspace generator produces shared records, proposed charters, and role startup briefs for Codex or Claude Code. It does **not** launch sessions, route handoffs, enforce authority, or replace a live team. Manual session startup is a developer preview.

The target product makes the founder's existing Codex or Claude Code conversation the Chief of Staff agent's session (`runner`). It coordinates separate specialist sessions; software tools enforce permissions and record changes independently of its judgment. Agents collaborate directly and activate specialists as work requires. Company records retain founder notifications and communication preferences across replacement. Automated delivery, preference learning, qualification, and mixed-platform coordination remain unimplemented.

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target codex
python3 -m unittest discover -s tests -v
```

Use one persistent folder and, where available, one UI project per company. Codex and Claude may open the same folder; `--target both` supplies both instruction wrappers. In this prototype use one active environment at a time and serialize shared writes. Opening a folder creates neither a second company nor new authority.

New workspaces pin an exact copy and hash of `SPEC.md`. Existing workspaces are never overwritten or silently upgraded. Generation leaves Frame in Draft and grants no venture-execution authority.

## Evolve carefully

`SPEC.md` is the single current design; the converter guide describes implementation, not additional governance. Change a rule only when it changes a meaningful decision or behavior. Keep review findings separate, preserve historical evidence, and use versioned commits for revisions. Team adoption remains explicit per company.

For review, read the current spec against the original intent and review history. Report concrete failure scenarios, missing authority, contradictions, or unnecessary complexity, with the smallest correction. Distinguish design acceptance from tested implementation.
