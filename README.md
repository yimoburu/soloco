# SoloCo

Run a virtual company through **one founder conversation**. Your Chief of Staff coordinates specialist AI agents in separate, resumable sessions. Company records persist in your folder when a session or environment changes.

The target is a company you can operate and improve over time, including a sustainably profitable one-person business with manageable founder workload. You define success; public launch and fundraising are optional milestones.

**SoloCo v0.3.0 is an early preparation-and-review release.** It interviews you, saves company intent, runs specialist planning sessions, and requests independent reviews. It does not execute customer outreach, spending, deployment, or other business actions. The [spec](SPEC.md) describes the complete target.

## Install once

You need access to this private repository and the chosen app's CLI installed and signed in. Current local clients with plugin and hook support are required. The launcher handles its Node dependency automatically on macOS/Linux ARM64 or x64; no Python, npm install, or manual configuration is needed.

**Codex** — run in Terminal:

```sh
codex plugin marketplace add yimoburu/soloco
codex plugin add soloco@soloco
```

Restart the app. Review and trust SoloCo’s hooks in **Settings → Hooks** or the composer’s **Review hooks** prompt; the CLI also supports `/hooks`. Hook trust is a host requirement for automatic startup. See [OpenAI’s hook instructions](https://learn.chatgpt.com/docs/hooks).

**Claude Code** — run in a Claude chat:

```text
/plugin install soloco --marketplace yimoburu/soloco
```

Or in Terminal:

```sh
claude plugin install soloco --marketplace yimoburu/soloco
```

Restart the session and keep SoloCo’s hooks enabled. This uses Claude’s [repository marketplace installation](https://code.claude.com/docs/en/plugin-marketplaces). Desktop installation uses the same catalog where supported; the standalone workers still require a signed-in Claude CLI.

Run the plugin’s **setup** skill once to check readiness. It creates no company. If dependency setup is interrupted, rerun setup before starting work.

## Start a company

1. Create a project in your chosen app.
2. Attach a new company folder.
3. Open a chat and describe your idea.

Give your company any working name, such as **BriefLink**. If you have not chosen one, CoS uses **Untitled Venture** and continues. Later, say “Rename my company to BriefLink.” Its identity, history and records stay intact; the project and folder labels do not change automatically. SoloCo is the tool, not your company’s name.

The startup hook supplies the Chief of Staff instructions automatically in an empty folder or an existing company. In a populated folder without company records, explicitly say you want to start a company so unrelated coding projects are left alone.

The Chief of Staff asks focused questions, saves your intent, starts the needed specialist sessions, and brings back reviewed proposals. You do not open each role’s chat or relay messages. A specialist may reject a draft; that does not require a founder decision. Real-world evidence and execution permission remain separate from a planning review.

The [CoS meta rules](SPEC.md#chief-of-staff-meta-rules) define its judgment, delegation, founder communication, accountability, and replaceability.

Updates explain who is doing what, each assignment's verified status, and what happens next. Short tables, examples, or handoff diagrams make the work easy to follow; planned work is clearly distinguished from agents already running.

Use **one active environment at a time**. To switch, pause the company in the old chat, open the same folder in the other app, and ask to continue. The Chief of Staff performs the recorded handover; you do not rebrief the team. Records stay in `.company/`, outside the plugin cache. Uninstalling the plugin does not remove them.

## Move from the old Company plugin

If you already installed `company@ai-operated-startup`, first ask its CoS to pause and reconcile assignments. Then replace that installation once; do not run both plugins together.

**Codex**, in Terminal:

```sh
codex plugin remove company@ai-operated-startup
codex plugin marketplace add yimoburu/soloco
codex plugin add soloco@soloco
```

**Claude Code**, in Terminal (use the original installation scope if it was project/local):

```sh
claude plugin uninstall company@ai-operated-startup --keep-data
claude plugin install soloco --marketplace yimoburu/soloco
```

Restart the app/session, trust SoloCo hooks, and reopen the **same company folder and founder chat**. Ask to verify SoloCo v0.3.0, open the existing company and resume preparation with its pinned team. Hook bindings are recreated; company records remain in `.company/`. A different chat needs an explicit handover. Schema-1 v0.1.0 companies still require the checked upgrade below; pending upgrades must be verified or recovered before resuming. Do not initialize another company or move records into plugin directories.

## Upgrade an existing company

A compatible runtime update keeps your existing team and rules. Adopting new CoS/role instructions or governance is a separate checked team upgrade; installation alone does not adopt them. In your existing founder chat, ask the CoS to pause and reconcile active assignments before updating.

For Codex, refresh and install the published package in Terminal:

```sh
codex plugin marketplace upgrade soloco
codex plugin add soloco@soloco
```

Then restart the desktop app and reopen the same founder chat. If `codex` is not on your PATH, use your installed Codex executable. Keep SoloCo hooks enabled/trusted. Ask the CoS to check `company_doctor` reports v0.3.0 and that `company_upgrade` is available before proceeding.

For a compatible company, ask to resume preparation with its existing pinned team and rules. No adoption rehearsal is needed. To adopt the new team instructions instead, tell your Chief of Staff:

> Upgrade this company's team, keep its existing rules and records, and resume after the checks pass.

The CoS inspects compatibility, pauses/reconciles assignments, and starts a fresh CoS rehearsal and independent QA review. After they pass, it adopts the candidate, verifies preserved records, reloads its instructions, and resumes preparation. Specialist sessions restart on demand from company records; you do not rebrief them. If you use a new chat, explicitly ask it to take over this company as part of the upgrade.

This release supports checked upgrades from v0.1.0 preparation companies and operates existing schema-2 companies from v0.2.0/v0.2.1/v0.2.2 without a forced team upgrade. Explicit team adoption still runs the checks, with full checkpoints up to 300,000 characters. Governance remains pinned by default; adopting the v0.16 contract requires explicit direction after reviewing its differences. Older governance may block a preparation upgrade on execution-level qualification requirements; the CoS must show that hold and ask before adopting the new, limited preparation-upgrade contract. Failed or stale checks hold the upgrade. Ask the CoS to recover the previous team if needed: recovery retains later company facts and uses the new runtime with the prior definitions, not the old plugin binary. After migration, v0.1.0 cannot resume the schema-2 company. Upgrade checks make two model calls using your normal host account.

## What is verified

- SoloCo v0.3.0: 58 automated tests pass. Isolated native Codex and Claude CLI tests installed the old Company v0.2.2 package, created a disposable company, replaced the plugin with SoloCo, rebound the same founder chat, resumed with its pinned rules and native session IDs, and renamed the company without losing history. These are runtime/installation checks, not desktop UI or live model acceptance.

- The v0.1.0 package was installed through both native CLIs using isolated marketplaces. Published v0.2.1 installation was checked through the Codex CLI in an isolated configuration; desktop update acceptance remains outstanding. v0.2.2 installed through the Codex CLI from a local catalog in an isolated configuration; its Claude manifest validated.
- Live v0.1.0 Codex: standalone PM draft, separate QA review, and a second assignment resumed the same PM session.
- Live v0.2.0 Codex upgrade in a disposable company: preserved older governance correctly held adoption; explicit adoption of the v0.13 preparation-only contract passed a fresh CoS rehearsal, separate QA review, guarded apply, and post-commit verification. Earlier failed/blocked attempts were retained. This was a CLI runtime check, not a desktop update test.
- Compatibility smoke test used the actual v0.1.0 source: migration preserved founder intent, and the old runtime rejected writes and controls even with a refreshed epoch.
- v0.2.2 compatibility smoke tests created disposable companies using the actual v0.2.0/v0.2.1 source and resumed them with the current runtime, preserving pinned definitions, ownership, records and pending notices without adoption.
- Automated tests cover bounded context, compatible runtime patches, hooks, records, independent review, concurrent updates, pause, stale-result quarantine, handover, notices, and actual subprocess dispatch. Upgrade tests use synthetic Codex/Claude CLIs to exercise separate rehearsal/reviewer processes, adoption, verification, and recovery; they do not prove live model judgments.
- Automatic private Node setup was tested on macOS ARM64.

Tested CLIs: Codex `0.166.0-alpha.5.1`, Claude Code `2.1.301`. Claude’s live model test was blocked by its CLI being signed out. Desktop installation/first-chat behavior and other operating systems still need live acceptance; package validation and hook tests do not prove those UI flows.

Required notices are stored durably and presented on an open chat’s next turn. Background delivery, external-action enforcement, per-assignment model selection, arbitrary future-version migration, and automatic placement of specialists in the desktop sidebar are not implemented. Host permissions still apply; the local record store is not a security boundary against software running as you.

## Development

[Developer guide](docs/development.md) explains the runtime, compatibility and tests. [SPEC.md](SPEC.md) is the enduring company contract; [optional playbooks](docs/playbooks.md) illustrate its operating loop. The legacy generator is retired; its source remains in Git history. Earlier designs and Claude reviews remain in the [archived snapshot](https://github.com/yimoburu/soloco/tree/ee3f302f47e82539ca0a40e0268a1e762c47929a/history).
