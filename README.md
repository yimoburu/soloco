# AI-operated startup

Run a virtual company through **one founder conversation**. Your Chief of Staff coordinates specialist AI agents in separate, resumable sessions. Company records persist in your folder when a session or environment changes.

**Company plugin v0.1.0 is an early preparation-and-review release.** It interviews you, saves company intent, runs specialist planning sessions, and requests independent reviews. It does not execute customer outreach, spending, deployment, or other business actions. The [spec](SPEC.md) describes the complete target.

## Install once

You need access to this private repository and the chosen app's CLI installed and signed in. Current local clients with plugin and hook support are required. The launcher handles its Node dependency automatically on macOS/Linux ARM64 or x64; no Python, npm install, or manual configuration is needed.

**Codex** — run in Terminal:

```sh
codex plugin marketplace add yimoburu/ai-operated-startup
codex plugin add company@ai-operated-startup
```

Restart the app. Review and trust Company’s hooks in **Settings → Hooks** or the composer’s **Review hooks** prompt; the CLI also supports `/hooks`. Hook trust is a host requirement for automatic startup. See [OpenAI’s hook instructions](https://learn.chatgpt.com/docs/hooks).

**Claude Code** — run in a Claude chat:

```text
/plugin install company --marketplace yimoburu/ai-operated-startup
```

Or in Terminal:

```sh
claude plugin install company --marketplace yimoburu/ai-operated-startup
```

Restart the session and keep Company’s hooks enabled. This uses Claude’s [repository marketplace installation](https://code.claude.com/docs/en/plugin-marketplaces). Desktop installation uses the same catalog where supported; the standalone workers still require a signed-in Claude CLI.

Run the plugin’s **setup** skill once to check readiness. It creates no company. If dependency setup is interrupted, rerun setup before starting work.

## Start a company

1. Create a project in your chosen app.
2. Attach a new company folder.
3. Open a chat and describe your idea.

The startup hook supplies the Chief of Staff instructions automatically in an empty folder or an existing company. In a populated folder without company records, explicitly say you want to start a company so unrelated coding projects are left alone.

The Chief of Staff asks focused questions, saves your intent, starts the needed specialist sessions, and brings back reviewed proposals. You do not open each role’s chat or relay messages. A specialist may reject a draft; that does not require a founder decision. Real-world evidence and execution permission remain separate from a planning review.

Use **one active environment at a time**. To switch, pause the company in the old chat, open the same folder in the other app, and ask to continue. The Chief of Staff performs the recorded handover; you do not rebrief the team. Records stay in `.company/`, outside the plugin cache. Uninstalling the plugin does not remove them.

## What is verified

- Both native CLIs installed the plugin from an isolated local marketplace.
- Live Codex: standalone PM draft, separate QA review, and a second assignment resumed the same PM session.
- Automated tests cover hooks, records, independent review, concurrent updates, pause, stale-result quarantine, handover, notices, and actual subprocess dispatch.
- Automatic private Node setup was tested on macOS ARM64.

Tested CLIs: Codex `0.166.0-alpha.5.1`, Claude Code `2.1.301`. Claude’s live model test was blocked by its CLI being signed out. Desktop installation/first-chat behavior and other operating systems still need live acceptance; package validation and hook tests do not prove those UI flows.

Required notices are stored durably and presented on an open chat’s next turn. Background delivery, external-action enforcement, arbitrary team-version migration, and automatic placement of specialists in the desktop sidebar are not implemented. Host permissions still apply; the local record store is not a security boundary against software running as you.

## Development

[Developer guide](docs/converter.md) explains the runtime, tests, and legacy generator. [SPEC.md](SPEC.md) is the single current design. Earlier designs and Claude reviews remain in the [archived snapshot](https://github.com/yimoburu/ai-operated-startup/tree/ee3f302f47e82539ca0a40e0268a1e762c47929a/history).
