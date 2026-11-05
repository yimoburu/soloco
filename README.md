# SoloCo

Run a virtual company through **one founder conversation**. Your Chief of Staff coordinates specialist AI agents in separate, resumable sessions. Company records persist in your folder when a session or environment changes.

The target is a company you can operate and improve over time, including a sustainably profitable one-person business with manageable founder workload. You define success; public launch and fundraising are optional milestones.

**SoloCo v0.6.3** adds compatible Node 22 sandbox launch, a compact read-only `company_progress` DAG/timeline with concrete tasks, outputs and founder attention, and merged task-selection decision evidence. This is a product-maintainer release; business authority and the v0.18 governance contract are unchanged. Installing the package and adopting its team instructions are separate steps.

SoloCo supports planning, review, and a bounded local development loop: authorize selected source paths → generate candidate edits → execute constrained Node tests → inspect evidence → repair within limits → independent acceptance. Candidates are retained separately; the original checkout is unchanged. The older file-only prototype workflow remains available. Outreach, purchases, private-account access, source integration and production deployment are not supported. [SPEC.md](SPEC.md) remains the high-level contract.

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

## See who is working, with the right model for the task

Before dispatch, the CoS chooses an adequate model, effort and speed, plus a separate timeout, based on task complexity, ambiguity, consequence of error, inputs and outputs, latency, and relevant prior outcomes. Use supported choices within existing limits and give a concise rationale. A reasoned host default is the fallback. Simple replies need no delegation. You choose the CoS chat model in the host UI.

At the start of substantive work, the CoS gives a compact update like this illustrative example:

| Agent | Task | Status |
|---|---|---|
| Engineering | Implement the agreed change | Running |
| QA | Review the result and test evidence | Planned; waits for Engineering |

The CoS fetches `company_progress` after meaningful work or notice changes. It presents a primary DAG beside recorded event chronology through host inline HTML when available, or equivalent literal text/Mermaid otherwise. The view shows actual instance/native identities, concrete task labels, expected and returned outputs, exact evidence links, separate QA and recorded runtime acceptance, and prominent unresolved founder notices. Selecting an event highlights current work. Each view reflects its fetched snapshot; refresh occurs when the CoS fetches again after an observed change, without uninterrupted background monitoring or historical playback.

The read-only endpoint defaults to the latest 20 jobs plus every active job and notice-associated work, with up to 100 prerequisite ancestors. It discloses omitted history and label truncation; unresolved notice identities, kinds, references and exact summaries are always retained. Source files, record bodies and rejected responses stay outside the view. Required attention can exceed the bounded history payload. `company_status` retains its existing behavior.

Updates use recorded runtime state. “Returned” means a result arrived; review and acceptance remain separate. Planned roles have not started. Show meaningful changes, failures and the next handoff without repeating an unchanged roster.

The catalog exposes choices, not account entitlement. Claude uses documented `haiku`, `sonnet` and `opus` aliases where CLI controls are available; account availability and effort support for a particular alias remain unverified. Unsupported explicit requests are held visibly; SoloCo does not silently substitute. Speed choices are `host_default` or evidenced Claude `fast_disabled`. Codex fast-off and Standard reset are unsupported, and SoloCo does not enable additional paid tiers.

Requests, applied controls and observations are distinct. Host default does not mean Standard. Codex output does not identify the answering model; Claude usage can include earlier turns and internal calls. Missing evidence stays unknown. Identical settings can resume a session with supported controls reapplied; changed settings retire the prior session reference while preserving history. A reason change alone does not rotate the session. Existing host billing applies; hard spending limits and cost savings are not established. These controls ship in v0.6.1; compatible runtime updates preserve existing pinned instructions. Existing companies must explicitly adopt a team supporting model selection; installation alone preserves pinned instructions and rules.

Inspect `company_status.selection_usage` for full-history specialist request counts, missing rationales and outcomes, separate from CoS chat usage. Counts are not tokens, cost, or proof of effective model settings. The [selection-policy evaluation](evals/README.md) checks task-fit decisions on fictional evidence. The completed [v0.6.3 receipt](evals/selection-policy-v0.6.3-2026-11-05.json) passed all five decisions on the current policy hash using the existing host account and a requested Codex Sol (`gpt-6.1-sol`) / low effort. Actual effective settings remain unknown; selected-specialist performance and cost savings are not established. The historical receipt is preserved unchanged.

The default execution timeout is 3 minutes. A custom timeout must be 1 second to 10 minutes with a reason. Queue and startup each have a separate 4-minute allowance. The execution timeout starts at real process spawn, allows 3 seconds for termination escalation, and cannot be extended. Tests have separate limits. Pause requests process cancellation through the worker, but provider completion, descendants or worker-death termination are not guaranteed. Late outputs are quarantined. Timeout changes do not reset attempt limits.

## Develop a local candidate

Tell the Chief of Staff what you want changed and which project files it may inspect:

> Prepare a scope to improve this feature. Show me the source and test paths, data sharing, acceptance criteria, expiry and attempt/time limits. Once authorized, have Engineering create the candidate, run its tests in the supported sandbox, repair within those limits, and obtain independent QA acceptance.

One authorization covers routine attempts in that scope. The company chooses its source/data policy; selected source is sent to your configured model host. Tests run separately with network denied, source files read-only and scratch-only writes. This first executor supports Node built-in tests on compatible macOS hosts with working `sandbox-exec`; Node 22 and newer compatible runtimes select a supported test-isolation flag; other platforms or unavailable isolation report a blocker. No shell-command or package-install endpoint is exposed.

The result is an accepted, retained candidate directory under `.company/development/`, with source hashes, changes, actual test output and QA attribution. **Acceptance does not merge the candidate into your repository or update the installed plugin.** Test success is evidence for the reviewed criteria, not proof of all behavior. Pause/revoke requests cancellation; partial or uncertain runs remain held for inspection. Tests must fit the disclosed time/output limits.

Local development requires an adopted v0.5.0, v0.6.0, v0.6.1, v0.6.2 or v0.6.3 team and v0.18 governance. Existing v0.5.0 companies keep this capability without adopting new instructions. The high-level v0.18 contract is unchanged. Previously authorized file-only prototypes remain usable on supported v0.4.x pinned teams. Budget enforcement for external services and scheduled operations remain future work. See the [issue #1 follow-up](https://github.com/yimoburu/soloco/issues/1#issuecomment-6619395459) for the broader request.

## Create a local prototype

This opt-in implements [issue #1](https://github.com/yimoburu/soloco/issues/1).

Say to your Chief of Staff:

> Help me build a small offline prototype using fictional fixtures I supply. Show me the exact new files, acceptance criteria and limits before I authorize it. Have Engineering generate the code and tests, then QA review them before creating the files. Do not run code, use real data, install dependencies or deploy anything.

The CoS checks support, prepares a concrete scope and gets QA review. You confirm the fictional fixtures and authorize that scope once. Engineering produces the files in a standalone session; separate QA reviews the exact result. SoloCo then creates the reviewed files under a **new `prototypes/<name>/` folder**, with a durable receipt. The CoS handles the tool calls and handoffs.

This is intentionally **file generation only**: tests are included but not run, so a review Pass is not proof of a working product. If acceptance requires execution evidence, that remains blocked. There is no private-data access, live account access, network capture, external service use, new spending, outreach or deployment. Normal specialist calls consume your existing host model allowance. Existing files are never overwritten; expired, revoked, stale or partially written work holds for inspection.

Preparation-only companies remain so until you explicitly adopt the new team **and v0.18 governance** through the checked upgrade below. Existing v0.4.0 teams with their adopted v0.17 rules keep prototype support; this update does not require replacing them. Ask the CoS to show differences before any new adoption. Installation or an ordinary approval cannot bypass this capability blocker. Team adoption preserves records and does not itself authorize a prototype; the exact scope still needs your instruction. Handover or team replacement preserves prototype records/files but invalidates outstanding prototype grants.

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

Restart the app/session, trust SoloCo hooks, and reopen the **same company folder and founder chat**. Ask to verify the installed SoloCo version, open the existing company and resume preparation with its pinned team. If old project hooks remain, use the hook repair below before resuming. Hook bindings are recreated by an actual trusted lifecycle event; company records remain in `.company/`. A different chat needs an explicit handover. Schema-1 v0.1.0 companies still require the checked upgrade below; pending upgrades must be verified or recovered before resuming. Do not initialize another company or move records into plugin directories.

## Upgrade an existing company

A compatible runtime update keeps your existing team and rules. Adopting new CoS/role instructions or governance is a separate checked team upgrade; installation alone does not adopt them. In your existing founder chat, ask the CoS to pause and reconcile active assignments before updating.

For Codex, refresh and install the published package in Terminal:

```sh
codex plugin marketplace upgrade soloco
codex plugin add soloco@soloco
```

Then restart the desktop app and reopen the same founder chat. If `codex` is not on your PATH, use your installed Codex executable. Keep SoloCo hooks enabled/trusted. Ask the CoS to check `company_doctor` reports the version you installed and that `company_upgrade` is available before proceeding.

For a compatible company, ask to resume preparation with its existing pinned team and rules. No adoption rehearsal is needed. To adopt the new team instructions instead, tell your Chief of Staff:

> Upgrade this company's team, keep its existing rules and records, and resume after the checks pass.

The CoS inspects compatibility, pauses/reconciles assignments, and starts a fresh CoS rehearsal and independent QA review. After they pass, it adopts the candidate, verifies preserved records, reloads its instructions, and resumes preparation. Specialist sessions restart on demand from company records; you do not rebrief them. If you use a new chat, explicitly ask it to take over this company as part of the upgrade.

This release supports checked upgrades from v0.1.0 preparation companies and operates existing schema-2 companies from v0.2.0/v0.2.1/v0.2.2/v0.3.0/v0.3.1/v0.4.0/v0.4.1/v0.5.0/v0.6.0/v0.6.1/v0.6.2 without a forced team upgrade. Explicit team adoption validates both live state and the saved checkpoint against the pinned checkpoint hash, retains the full checkpoint and prior upgrade history, and reviews deterministic bounded history pages in one resumed native session per role. CoS findings and independent QA page reviews persist; page Pass permits only continued review. Findings replay in bounded batches, retaining every blocker. Only final synthesis can permit adoption after every page passes; unresolved page blockers prevent adoption. Recognized source bodies remain exactly retrievable through bounded JSON read requests. Each complete request plus response reserve is capped at 900,000 characters; this is a character budget, not a guarantee of model token fit. New rehearsals have a fixed 45-minute deadline. Compatible runtime installation still preserves the existing team and records. Governance remains pinned by default; adopting the v0.18 contract requires explicit direction after reviewing its differences. Older governance may block a preparation upgrade on execution-level qualification requirements; the CoS must show that hold and ask before adopting the new, limited preparation-upgrade contract. Failed or stale checks hold the upgrade. Ask the CoS to recover the previous team if needed: recovery retains later company facts and uses the new runtime with the prior definitions, not the old plugin binary. After migration, v0.1.0 cannot resume the schema-2 company. Upgrade checks make multiple model calls using your normal host account, without automatic retries or native-session restarts.

## Repair stale Codex hooks

v0.3.1 fixes [issue #2](https://github.com/yimoburu/soloco/issues/2). Codex `0.166.0-alpha.5.1` loads both hooks from the compatibility manifest; the former portable manifest yielded zero hooks on that client. Updating team instructions does not update project-level hook commands.

After updating the package and restarting, say in your existing founder chat:

> Check SoloCo's startup hooks for this folder. Remove the recognized old Company/SoloCo project hooks using the supported migration, preserve unrelated hooks and company records, and verify the current chat's binding after I review the plugin hooks.

Setup uses `company_hooks` to inspect discovery and preview exactly which entries will be removed. Migration backs up `.codex/hooks.json`, removes only recognized launchers and leaves the two plugin hooks as the source of startup behavior. It never writes a replacement versioned cache path, copies a binding, grants trust, or changes `.company/`. Unknown custom commands and duplicate legacy plugins hold migration for review.

Review and trust the two **SoloCo plugin** hooks in the host Hooks UI, reopen the founder chat, then send a prompt. `company_doctor` with the folder and actual chat ID checks that the lifecycle created a current-runtime binding in the MCP data directory. No binding means invocation is still unverified. The diagnostics distinguish missing discovery, disabled hooks, untrusted/modified definitions, stale commands and mismatched data directories. The read-only configuration probe cannot see unsaved live-chat overrides; compare with the host UI if needed.

Subsequent upgrades use the bundled hooks and a release-generated MCP launcher, with a stable shared data directory. The native test verifies both resolve the new package without project edits. The host may still require renewed hook trust; installation does not bypass that requirement.

## What is verified

- v0.6.3: release preparation only; the final-policy decision-only evaluation passed all five fictional decisions ([receipt](evals/selection-policy-v0.6.3-2026-11-05.json)). Complete Node 22/25 testing, visual checks, native package/hook discovery and independent QA remain CoS release checks before publication, installation or guarded company upgrade.
- Historical v0.6.2: **217 automated tests pass, zero skips** on the tested macOS host. A real Codex trial reviewed a fictional 2.75-million-character checkpoint in ten pages per role, using separate resumed CoS and QA sessions. Final independent review, guarded apply and exact preservation readback passed. A separate local test preserved a copied actual company history with zero model calls and the original unchanged. Native package, hook and next-version discovery checks also pass. Actual company adoption, observed context compaction and live Claude validation remain unverified.
- Historical v0.6.1: **180 automated tests pass, zero skips** on the tested macOS host. Coverage includes task-specific timeout clocks and cancellation, supported speed controls, request/applied/observed evidence, and preservation of v0.6.0 capabilities and upgrade recovery. Native Codex package, hook and next-version MCP discovery checks pass. Effective provider settings and live upgrade of large company histories remain unverified.
- v0.6.0: **127 automated tests pass, zero skips** on the tested macOS host, including real sandbox isolation, model/effort/default session changes, preserved identities, stale assignment rejection and truthful activity. Selected-model execution tests use synthetic CLIs; live selected-model inference and desktop presentation remain unverified. Read-only discovery returned eight visible Codex model choices. Native Codex hook/version discovery, Claude local package/marketplace validation and CoS skill validation pass. Claude's separate public-directory checks report the repository's missing license and icon; directory submission is outside this update.
- Existing v0.6.0 Codex desktop, November 4, 2026: `company_doctor` in the founder chat reported both SoloCo hooks enabled/trusted, a `current_runtime` binding and no hook diagnostic problems on CLI `0.166.0-alpha.6`. This is observed configuration and binding evidence before the v0.6.1 installation; it does not establish a v0.6.1 lifecycle trial, fresh-company onboarding or other desktop builds.
- Historical v0.5.0: **114 automated tests pass, zero skips** on the tested macOS host. This includes actual sandbox execution and adversarial isolation checks, scoped repairs, pause/revoke, receipt provenance, stale-result rejection and independent acceptance. Specialist outputs in this suite are synthetic.
- Live v0.5.0 Codex: separate native Engineering and QA sessions completed candidate generation → sandboxed Node tests → exact-receipt acceptance in a disposable fixture; the original source stayed unchanged. An earlier incomplete QA response was correctly refused, then the prompt was corrected and a fresh trial passed. Native hook/version discovery and Claude package validation also pass. This does not verify desktop UI flows or live Claude development.

- Historical v0.4.1: **84 automated tests pass**, including deterministic prototype tests for exact authorization, isolated generation/review, path and fixture enforcement, bounded repairs, stale/expired/revoked work, handover, and partial-write recovery. Detached prototype/QA process tests pass on both host adapters using synthetic CLIs and model outputs; live model and desktop prototype acceptance remain unverified. That release did not execute generated tests.

- Historical v0.4.1 compatibility: the 19 prototype checks also pass on disposable companies initialized by the actual v0.4.0 source. A separate check completes file generation/review/materialization under a scope authorized by v0.4.0, retaining its pinned v0.17 governance. These checks use synthetic specialist outputs, not live model acceptance.

- Historical v0.3.1: 65 automated tests passed, including migration preservation, stale previews, missing/disabled hooks, data mismatch and subprocess hook-to-tool binding. Native Codex installation checks verify both plugin hooks are discovered untrusted, the MCP tools connect, and both follow a later package version without editing project paths. A real desktop lifecycle after human trust remains to be verified; the tests do not manufacture trust.
- Historical v0.3.0: 58 automated tests passed. Isolated native Codex and Claude CLI tests installed the old Company v0.2.2 package, created a disposable company, replaced the plugin with SoloCo, rebound the same founder chat, resumed with its pinned rules and native session IDs, and renamed the company without losing history. These are runtime/installation checks, not desktop UI or live model acceptance.

- The v0.1.0 package was installed through both native CLIs using isolated marketplaces. Published v0.2.1 installation was checked through the Codex CLI in an isolated configuration; desktop update acceptance remains outstanding. v0.2.2 installed through the Codex CLI from a local catalog in an isolated configuration; its Claude manifest validated.
- Live v0.1.0 Codex: standalone PM draft, separate QA review, and a second assignment resumed the same PM session.
- Live v0.2.0 Codex upgrade in a disposable company: preserved older governance correctly held adoption; explicit adoption of the v0.13 preparation-only contract passed a fresh CoS rehearsal, separate QA review, guarded apply, and post-commit verification. Earlier failed/blocked attempts were retained. This was a CLI runtime check, not a desktop update test.
- Compatibility smoke test used the actual v0.1.0 source: migration preserved founder intent, and the old runtime rejected writes and controls even with a refreshed epoch.
- v0.2.2 compatibility smoke tests created disposable companies using the actual v0.2.0/v0.2.1 source and resumed them with the current runtime, preserving pinned definitions, ownership, records and pending notices without adoption.
- Automated tests cover bounded context, compatible runtime patches, hooks, records, independent review, concurrent updates, pause, stale-result quarantine, handover, notices, and actual subprocess dispatch. Upgrade tests use synthetic Codex/Claude CLIs to exercise separate rehearsal/reviewer processes, adoption, verification, and recovery; they do not prove live model judgments.
- Automatic private Node setup was tested on macOS ARM64.

v0.6.0 metadata/package checks used Codex `0.166.0-alpha.5.1` and Claude Code `2.1.318`; the later existing-company desktop lifecycle check used Codex `0.166.0-alpha.6`. Earlier checks used Claude `2.1.301`, whose live model test was blocked by sign-in. The release tests did not run live selected-model inference. Fresh-company desktop installation/first-chat behavior, Claude UI and other operating systems still need live acceptance; package validation and hook tests do not prove those UI flows.

Required notices are stored durably and presented on an open chat’s next turn. Background delivery, external-action enforcement, hard model-spending limits, arbitrary future-version migration, and automatic placement of specialists in the desktop sidebar are not implemented. Host permissions still apply; the local record store is not a security boundary against software running as you.

## Development

[Developer guide](docs/development.md) explains the runtime, compatibility and tests. [SPEC.md](SPEC.md) contains only enduring rules and constitutions. The implementation follows it with the simplest sufficient design; [optional playbooks](docs/playbooks.md) illustrate its operating loop. The legacy generator is retired; its source remains in Git history. Earlier designs and Claude reviews remain in the [archived snapshot](https://github.com/yimoburu/soloco/tree/ee3f302f47e82539ca0a40e0268a1e762c47929a/history).
