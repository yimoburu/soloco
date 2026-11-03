# AI-operated startup

Give an idea to a team of AI agents and operate a company through **one founder conversation**. Each role works in its own standalone session. Shared company records let roles collaborate and let the founder replace the team while preserving the company.

The team progresses toward public launch or funding readiness through conventional startup roles, bounded authority, independent review, and evidence.

## Getting started

**The three-step founder experience below is specified, but not available yet.** This repo currently contains the design and a workspace generator. The Company plugin, marketplace catalog, and runtime are not implemented; cloning the repo or attaching a folder does not install automatic company startup.

The planned release path is **add this repo as a marketplace → install the Company plugin in Codex or Claude → complete setup and verify readiness**. It starts with one plugin in a small repository catalog, not a separate marketplace website. Repository access is required. Platform-specific instructions will ship when tested; there is no working install command for this repo yet.

For a **manual developer trial today**, download or clone this repo, open it in Codex or Claude Code, and follow the [converter guide](docs/converter.md). Generate into a new folder before attaching that folder as the company project. The trial still requires explicit role startup and manual coordination; it is not the product onboarding.

## Read only what you need

- [Current spec](SPEC.md): founder responsibilities, collaboration, evidence gates, learning, and company continuity.
- [Plugin delivery and converter guide](docs/converter.md): the packaging plan, implementation gaps, and manual developer trial.
- [History](history/README.md): original intent, previous versions, and review provenance; not competing current requirements.

## Founder experience — target

After installing the Company plugin once in the chosen app:

1. Create a project.
2. Attach a company folder.
3. Open a chat and talk about your idea.

Your Chief of Staff starts on the first message, asks focused questions, challenges assumptions, and assembles the necessary specialist sessions. It initializes a new company or resumes an existing one, then brings you a reviewed first experiment to authorize. You do not configure roles, run commands, or forward messages. Company records preserve decisions, obligations, communication preferences, and unresolved notices across agent replacement.

## What works today

The internal Python workspace generator produces shared records, proposed charters, and role startup briefs for Codex or Claude Code. It does **not** launch sessions, route handoffs, enforce authority, or replace a live team. Plugin packaging, dependency setup, and automatic first-chat startup are also unimplemented. The commands below and manual session startup are a developer preview, not the intended founder onboarding.

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target codex
python3 -m unittest discover -s tests -v
```

Use one persistent folder and, where available, one UI project per company. Codex and Claude may open the same folder; `--target both` supplies both instruction wrappers. In this prototype use one active environment at a time and serialize shared writes. Opening a folder creates neither a second company nor new authority.

New workspaces pin an exact copy and hash of `SPEC.md`. Existing workspaces are never overwritten or silently upgraded. Company records belong outside the plugin cache; plugin updates must not silently change a company’s pinned rules. Generation leaves Frame in Draft and grants no venture-execution authority.

## Evolve carefully

`SPEC.md` is the single current design; the converter guide describes implementation, not additional governance. Change a rule only when it changes a meaningful decision or behavior. Keep review findings separate, preserve historical evidence, and use versioned commits for revisions. Team adoption remains explicit per company.

For review, read the current spec against the original intent and review history. Report concrete failure scenarios, missing authority, contradictions, or unnecessary complexity, with the smallest correction. Distinguish design acceptance from tested implementation.
