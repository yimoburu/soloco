# SoloCo

Run a virtual company through **one founder conversation**. Your Chief of Staff coordinates specialist AI agents in separate, resumable sessions. Company records persist in your folder when a session or environment changes.

The target is a company you can operate and improve over time, including a sustainably profitable one-person business with manageable founder workload. You define success; public launch and fundraising are optional milestones.

v0.7.9 gives the current runtime a distinct installation and MCP launch path, including frozen context intake, worker monitoring repairs and bounded development-budget controls. Compatible runtime updates retain existing pinned teams, governance and grants. Install the published package and reload the host as described below; package delivery alone does not establish activation, native qualification or company continuity.

**Prior source validation (v0.7.8)**: merged main [`b0097c3`](https://github.com/yimoburu/soloco/commit/b0097c3b86e7f500e35b70e391aa2beeb8f4b4cf) includes original [frontier checkpoints](docs/peer-input-frontier-checkpoint.md) and [final seals](docs/peer-origin-frontier-seal.md) (PR #104), [public pre-quarantine mechanical QA](docs/peer-origin-mechanical-qa-public.md) and storage/catalog guards (PR #106), [lossless mechanical context](docs/origin-mechanical-qa-lossless-wire.md) (PR #107), and [three-shard routine CI](docs/ci.md) (PR #108). At that exact main commit, [Source CI](https://github.com/yimoburu/soloco/actions/runs/43326025667) passed all six jobs and 3,759 tests, with no failures, cancellations or skips. These are source-delivery checks, not activation of an installed v0.7.8 server, native qualification, company adoption or continuity. They do not clear the three previously held notices or their continuing conditions.

**Earlier v0.7.6 source checkpoint** added explicit task outcome hypotheses, typed recovery causes, and opt-in operating proposals that can feed subsequent read-only work without changing accepted knowledge. It retained pending proposals for handover and added a local supplied-observation comparison tool. See [current capabilities](docs/current-capabilities.md) and [implementation evidence](docs/founder-outcome-implementation.md). That checkpoint did not establish installation or company adoption.

**SoloCo v0.7.5** adds a prospective current operating checkpoint to the existing architecture: exact normalized storage intake, immutable accepted homes, independent publication, guarded handover/resume and a bounded ordinary specialist lane. Codex JSONL completion is checked against the current terminal turn, with rejected negative evidence retained. Prospective complete-group decomposition keeps whole physical sections while allowing smaller extraction targets; independent semantic acceptance and actual native fit remain separate requirements. A successor reviews complete current meaning and new semantic intake without replaying the accepted archive. Coherent corpus qualification uses complete physical provenance and separate independent extraction, domain, interface and integration judgments. Full canonical proof validation remains distinct from phase-specific native evidence delivery. See [operating state](docs/operating-state.md), [legacy bootstrap](docs/legacy-operating.md), [scoped qualification](docs/scoped-context.md) and [incremental upgrades](docs/upgrade-incremental.md).

These are source capabilities, not actual company acceptance. Public lifecycle tests use explicitly fictional semantic judgments. Actual SoloDev whole-corpus bootstrap, native fit, current independent handover acceptance and useful resumption remain unestablished. Original evidence, failures, notices, uncertainty and exhausted allowances remain binding. The fixed request/output/deadline limits are unchanged; an oversized or semantically incomplete review holds. Mechanical archive validation and retained baseline metadata can still grow with history. Historical [v0.7.3 validation](docs/release-v0.7.3-validation.md) and [v0.7.2 validation](docs/release-v0.7.2-validation.md) retain their original scope. Existing companies keep their pinned governance and teams until checked adoption; source release, installation, activation, semantic qualification and resumption are separate steps.

SoloCo supports planning, review, and a bounded local development loop: authorize selected source paths → generate candidate edits → execute constrained Node tests → inspect evidence → repair within limits → independent acceptance. Candidates are retained separately; the original checkout is unchanged. The older file-only prototype workflow remains available. Outreach, purchases, private-account access, source integration and production deployment are not supported. [SPEC.md](SPEC.md) is the canonical source contract. Each existing company continues under its explicitly pinned/adopted governance. Exact published v0.18 governance remains supported for local development with adopted supported v0.5.0, v0.6.0–v0.6.13 and v0.7.0–v0.7.9 teams; file-only prototypes additionally support adopted v0.4.0/v0.4.1 teams and retain exact v0.17 governance support. These are explicit version allowlists and exact governance digests, not general acceptance of older or modified contracts. Existing grants retain their original scope and authority checks; development still requires the supported sandbox. Authorization cannot enable an unsupported capability.

Source contract **v0.21** makes proactive strategy part of CoS responsibility. Bring a rough idea: CoS helps clarify whom it serves, reviews relevant alternatives with dated evidence, and develops company/product options and a recommended next learning step with you. It revisits positioning and direction as evidence changes, using existing roles and records. Direction changes remain yours. This is active-session support, not unattended competitor monitoring; existing companies retain their pinned rules until checked adoption.

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

Both hosts use the same CoS instructions, company tools, task pipeline, review gates and durable records. Setup checks the actual session's startup-hook receipt on both hosts. Claude Code's UI and model catalog are host-specific; see [Claude parity validation](docs/claude-parity.md) for coverage and remaining live checks.

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

The fourteen shipped specialist roles are starter charters, not an exhaustive
taxonomy of expertise. With the optional temporary-specialist capability, say:
“We need an inventory-risk analyst for this question. Define the expertise and
use our existing preparation limits.” Under an explicit bounded creation policy,
the CoS can create a task-specific specialist, give it a distinct session, and
retain its charter and results. The underlying approved role keeps its execution
permissions; a new title adds no tools, spending or business authority.

Temporary specialists expire or can be revoked. Creating one is not competence
certification: actual output still needs the required independent review and
receiver acceptance. Usage and observed results are inspectable; improvements in
cost, missed issues or founder workload require actual outcome evidence. See
[temporary specialists](docs/dynamic-specialists.md) for the supported ordinary
and durable preparation paths, limits and qualification boundaries. Existing
company instructions and policies are not replaced by installing source changes.

Before dispatch, the CoS chooses an adequate model, effort and speed, plus a separate timeout, based on task complexity, ambiguity, consequence of error, inputs and outputs, latency, and relevant prior outcomes. Use supported choices within existing limits and give a concise rationale; a justified choice may be reused for comparable work until demands, support or observed quality change. A reasoned host default is the fallback. Simple replies need no delegation. You choose the CoS chat model in the host UI.

Whenever a specialist is summoned or resumed, the next response prominently highlights its **role/name**, assignment, actual status and next handoff. Returned work is attributed to its specialist; Chief of Staff synthesis is labeled separately. Planned agents remain clearly marked as not summoned. At the start of substantive work, the CoS gives a compact update like this illustrative example:

| Agent | Task | Status |
|---|---|---|
| **Engineering** | Implement the agreed change | Running |
| **QA** | Review the result and test evidence | Planned / not summoned; waits for Engineering |

The CoS refreshes authoritative status after meaningful work or notice changes and normally gives a concise outcome, actual state and next handoff. It uses the detailed `company_progress` DAG/chronology when useful or requested, through inline HTML or equivalent literal text/Mermaid. The view shows actual instance/native identities, concrete task labels, expected and returned outputs, exact evidence links, separate QA and recorded runtime acceptance, and prominent unresolved founder notices. Selecting an event highlights current work. Each view reflects its fetched snapshot; refresh occurs when the CoS fetches again after an observed change, without uninterrupted background monitoring or historical playback.

The read-only endpoint defaults to the latest 20 jobs plus every active job and notice-associated work, with up to 100 prerequisite ancestors. It discloses omitted history and label truncation; unresolved notice identities, kinds, references and exact summaries are always retained. Source files, record bodies and rejected responses stay outside the view. Required attention can exceed the bounded history payload. `company_status`, open and wait return bounded current views with exact source handles and disclosed continuations. The Chief of Staff loads required instructions, notices and task evidence through those handles automatically; previews do not replace full inputs.

Updates use recorded runtime state. “Returned” means a result arrived; review and acceptance remain separate. Planned roles have not started. Show meaningful changes, failures and the next handoff without repeating an unchanged roster.

CoS decomposes outcomes and starts genuinely independent work concurrently within supported capacity. Optional dispatch `depends_on` binds completed producer outputs as supplied evidence; unfinished dependencies remain planned. Optional `resources` reserves consistent named exclusive resources, not filesystem isolation. Cancelled or uncertain processes retain claims until runtime closure evidence. These controls admit safe ready work; they do not provide unattended scheduling or confer acceptance.

The catalog exposes choices, not account entitlement. Claude uses documented `haiku`, `sonnet` and `opus` aliases where CLI controls are available; account availability and effort support for a particular alias remain unverified. Unsupported explicit requests are held visibly; SoloCo does not silently substitute. Speed choices are `host_default` or evidenced Claude `fast_disabled`. Codex fast-off and Standard reset are unsupported, and SoloCo does not enable additional paid tiers.

Specialist session names show their current role and a distinct instance suffix on fresh and resumed calls. Codex uses verified native metadata updates; supported Claude clients receive `--name`. Naming is cosmetic and does not affect task execution or acceptance. See [session naming](docs/session-naming.md) for support, diagnostics and validation.

Requests, applied controls and observations are distinct. Host default does not mean Standard. Codex output does not identify the answering model; Claude usage can include earlier turns and internal calls. Missing evidence stays unknown. Identical settings can resume a session with supported controls reapplied; changed settings retire the prior session reference while preserving history. A reason change alone does not rotate the session. Existing host billing applies; hard spending limits and cost savings are not established. These controls ship in v0.6.1; compatible runtime updates preserve existing pinned instructions. Existing companies must explicitly adopt a team supporting model selection; installation alone preserves pinned instructions and rules.

Inspect `company_status.selection_usage` for full-history specialist request counts, missing rationales and outcomes, separate from CoS chat usage. Counts are not tokens, cost, or proof of effective model settings. The [selection-policy evaluation](evals/README.md) checks task-fit decisions on fictional evidence. The completed [v0.6.3 receipt](evals/selection-policy-v0.6.3-2026-11-05.json) passed all five decisions on the current policy hash using the existing host account and a requested Codex Sol (`gpt-6.1-sol`) / low effort. Actual effective settings remain unknown; selected-specialist performance and cost savings are not established. The historical receipt is preserved unchanged.

The default execution timeout is 3 minutes. A custom timeout must be 1 second to 10 minutes with a reason. Queue and startup each have a separate 4-minute allowance. The execution timeout starts at real process spawn, allows 3 seconds for termination escalation, and cannot be extended. Tests have separate limits. Pause requests process cancellation through the worker, but provider completion, descendants or worker-death termination are not guaranteed. Late outputs are quarantined. Timeout changes do not reset attempt limits.

## Develop a local candidate

Tell the Chief of Staff what you want changed and which project files it may inspect:

> Prepare a scope to improve this feature. Show me the source and test paths, data sharing, acceptance criteria, expiry and attempt/time limits. Once authorized, have Engineering create the candidate, run its tests in the supported sandbox, repair within those limits, and obtain independent QA acceptance.

One authorization covers routine attempts in that scope. The company chooses its source/data policy; selected source is sent to your configured model host. Tests run separately with network denied, source files read-only and scratch-only writes. This first executor supports Node built-in tests on compatible macOS hosts with working `sandbox-exec`; Node 22 and newer compatible runtimes select a supported test-isolation flag; other platforms or unavailable isolation report a blocker. No shell-command or package-install endpoint is exposed.

The result is an accepted, retained candidate directory under `.company/development/`, with source hashes, changes, actual test output and QA attribution. **Acceptance does not merge the candidate into your repository or update the installed plugin.** Test success is evidence for the reviewed criteria, not proof of all behavior. Pause/revoke requests cancellation; partial or uncertain runs remain held for inspection. Tests must fit the disclosed time/output limits.

Local development requires a supported adopted team and exact source v0.21 or retained published v0.20/v0.19/v0.18 governance. Existing supported companies pinned to v0.20, v0.19 or v0.18 keep this capability without adopting new rules or instructions. Historically published v0.6.6 bundled v0.18; v0.19 added the reviewed N1/N2 amendments, and v0.20 introduced proactive CoS responsibility. Previously authorized file-only prototypes remain usable on supported v0.4.0/v0.4.1 pinned teams with exact v0.17 or v0.18 governance, subject to their original authority checks. Budget enforcement for external services and scheduled operations remain future work. See the [issue #1 follow-up](https://github.com/yimoburu/soloco/issues/1#issuecomment-6619395459) for the broader request.

The optional development patch format avoids regenerating unchanged file text while preserving complete candidate review. A project can configure its byte ceiling in `.company/development.json`; the default stays 100,000 bytes and each authorized scope keeps its explicit budget. See [candidate format and size policy](docs/development.md#efficient-retained-development-candidates).

## Create a local prototype

This opt-in implements [issue #1](https://github.com/yimoburu/soloco/issues/1).

Say to your Chief of Staff:

> Help me build a small offline prototype using fictional fixtures I supply. Show me the exact new files, acceptance criteria and limits before I authorize it. Have Engineering generate the code and tests, then QA review them before creating the files. Do not run code, use real data, install dependencies or deploy anything.

The CoS checks support, prepares a concrete scope and gets QA review. You confirm the fictional fixtures and authorize that scope once. Engineering produces the files in a standalone session; separate QA reviews the exact result. SoloCo then creates the reviewed files under a **new `prototypes/<name>/` folder**, with a durable receipt. The CoS handles the tool calls and handoffs.

This is intentionally **file generation only**: tests are included but not run, so a review Pass is not proof of a working product. If acceptance requires execution evidence, that remains blocked. There is no private-data access, live account access, network capture, external service use, new spending, outreach or deployment. Normal specialist calls consume your existing host model allowance. Existing files are never overwritten; expired, revoked, stale or partially written work holds for inspection.

Company mode remains **preparation**, including during supported local prototype work. Prototype eligibility requires an adopted supported team and exact supported governance: source v0.21, retained published v0.20/v0.19/v0.18, or retained v0.17. Existing supported teams with their pinned v0.17, v0.18, v0.19 or v0.20 rules keep prototype support without adopting the new contract. An unsupported team or contract holds the workflow; installation or an ordinary approval cannot enable it. Any change to company governance, including adoption of source v0.21, requires explicit direction through the checked upgrade below after the CoS shows the differences. Team adoption preserves records and does not itself authorize a prototype; the exact scope still needs your instruction. Handover or team replacement preserves prototype records/files but invalidates outstanding prototype grants.

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

Fresh authorized upgrades default to `workflow: "incremental-v2"`. Inspect reports the effective workflow, context source and any eligibility hold before launch. Current context automatically uses validated accepted operating state when available; a validation failure holds without fallback. Explicit `context_mode: "full"` selects full-history review. Explicit `workflow: "incremental-v1"` or `"legacy"` selects a prior protocol for a fresh attempt; existing stored attempts keep their original contracts. Completed valid steps remain reusable only within the same interrupted nonfailed attempt. A failed or ambiguous native call cannot resume; recovery preserves all facts and negative evidence. See [upgrade selection and continuation limits](docs/upgrade-incremental.md).

`company_upgrade` accepts optional `model_selection` on `prepare` only, using the same schema and advertised choices as dispatch: `{mode: "explicit", model, effort?, speed?, reason}` or `{mode: "default", reason}`. One validated request is saved with the attempt and used unchanged for both fresh CoS and independent QA, including retrieval, replay and synthesis. Omission keeps the existing host-default behavior. Changing selection requires recovery and a fresh authorized attempt; it cannot modify an expired attempt or reuse old review coverage. Requested settings, adapter-applied controls and host observations are separate evidence. Timeout failures retain the request but leave unavailable execution observations unknown. These controls neither guarantee review completion within the deadline nor verify effective provider settings; no paid speed tier is added.

`company_upgrade prepare` accepts optional `call_timeout_minutes`: exactly integer `10` (default) or `30`. The selection is persisted once on a fresh attempt and bound to its evidence. Both CoS and independent QA use that ceiling for all page, retrieval, replay and synthesis calls, capped by the remaining finite overall window. With no overall deadline, each call still has the finite selected ceiling. Null, strings, fractions, booleans and other values are rejected, as is any presence on a non-prepare action, before binding, catalog, readiness or launch. Legacy attempts without this setting retain 10 minutes. Changing the stored selection holds the attempt; no active call or existing attempt is extended or restarted. For example, add `"call_timeout_minutes": 30` to a fresh authorized prepare request. The internal adapter upgrade-call context supports this duration; ordinary dispatch keeps its 3-minute default and 10-minute maximum. Startup remains 4 minutes and termination grace remains 3 seconds.

`company_upgrade prepare` also accepts optional `review_window_minutes`: exactly integer `45` (the default), `90`, or explicit `null` for no overall deadline. Omission preserves 45 minutes; strings, fractions, booleans and other values are rejected. This field is rejected on every other action before binding, readiness, catalog lookup or launch. Record the exact existing founder grant in `source_instruction`; the window adds review time only, with no change to authority, independent full-page review, pause or hash guards. For a fresh request after inspection, the exact tool arguments are:

```json
{
  "root": "/absolute/company/folder",
  "session_id": "current-founder-session-id",
  "action": "prepare",
  "expected_epoch": 1,
  "candidate_hash": "hash-returned-by-inspect",
  "source_instruction": "ignore the time limit",
  "review_window_minutes": null
}
```

Use the current epoch and inspected candidate hash. Preparation fixes `review_deadline_policy` (`finite` or `none`) once, computes the finite `deadline_ms` once, and persists `review_window_minutes` for audit. Explicit none stores a literal `deadline_ms: null`, schedules no overall abort timer, and still caps every native call at the selected 600,000 or 1,800,000 ms ceiling. The policy, selection and deadline appear in upgrade/status summaries. Worker, apply and verify honor the immutable stored policy and deadline; none permits completion after 45/90 minutes only with every required independent review and preservation guard satisfied. No active, expired or historical attempt is extended or rewritten. Older attempts retain their original stored deadline, or the existing seven-minute fallback from `created_at` for a missing/null deadline without an explicit none policy. An incomplete or corrupted explicit policy cannot remove the deadline. Recovery preserves failures; a fresh authorized attempt needs fresh independent review coverage. Release source validation is recorded in [v0.7.0 validation](docs/structural-scalability-validation.md); company adoption retains its own independent checks.

This release supports checked upgrades from v0.1.0 preparation companies and operates existing schema-2 companies from the explicit source allowlist: v0.2.0/v0.2.1/v0.2.2/v0.3.0/v0.3.1/v0.4.0/v0.4.1/v0.5.0, v0.6.0–v0.6.13 and v0.7.0–v0.7.9, without a forced team upgrade. Explicit team adoption validates both live state and the saved checkpoint against the pinned checkpoint hash, retains the full checkpoint and prior upgrade history, and reviews deterministic bounded history pages in one resumed native session per role. CoS findings and independent QA page reviews persist; page Pass permits only continued review. Findings replay in bounded batches, retaining every blocker. Only final synthesis can permit adoption after every page passes; unresolved page blockers prevent adoption. Recognized source bodies remain exactly retrievable through bounded JSON read requests. Each complete request, including the actual author report sent to QA, plus a finite 80,000-character planning reserve must fit 900,000 UTF-16 units before dispatch. The reserve is not a response acceptance ceiling: there is no arbitrary whole-report character cap. Concise synthesis content targets 20,000 characters; structured continuity, citations, review and JSON escaping add to the whole report. Existing bounds remain: content at most 100,000 characters, continuity explanations 20–12,000 each, citation/read/session and authority checks, and the adapter’s 2,000,000-character full output stream guard. Oversize complete requests hold without truncation, fallback or automatic retry. These character bounds do not guarantee model token fit. New rehearsals default to a fixed 45-minute deadline, or explicitly select 90 minutes or no overall deadline at prepare time; each native call uses the immutable selected 10- or 30-minute ceiling, capped by remaining time when the overall deadline is finite. Timeouts hold the failed attempt for inspection; recovery does not authorize reusing its review. Compatible runtime installation still preserves the existing team and records. Governance remains pinned by default; adopting the source v0.21 contract requires explicit direction after reviewing its differences; historically published v0.6.6 bundled v0.18. Older governance may block a preparation upgrade on execution-level qualification requirements; the CoS must show that hold and ask before adopting the new, limited preparation-upgrade contract. Failed or stale checks hold the upgrade. Ask the CoS to recover the previous team if needed: recovery retains later company facts and uses the new runtime with the prior definitions, not the old plugin binary. After migration, v0.1.0 cannot resume the schema-2 company. Upgrade checks make multiple model calls using your normal host account, without automatic retries or native-session restarts.

v0.6.6 added evidence transport v2 whole-body aliases for historical native-call/artifact pairs of at least 4,096 characters. Matching requires the same nonempty native identity, role, phase and every JSON token in the entire artifact; only outside-string formatting whitespace may differ. The first complete body stays inline, and later occurrences refer directly to it with registry provenance. Raw originals and checkpoint/history hashes are preserved. An alias establishes body equality only; it grants no agreement, resolution, authority or citation delivery. Both independent roles still receive every page and must retain each distinct constraint, blocker and uncertainty in page-specific findings and complete final reconstruction.

`company_upgrade inspect` includes a compact current-state projection preview comparing baseline and candidate on identical checkpoint/history inputs, including the current attempt as next-attempt history. It reports exact stream character/page differences, hashes and matched/aliased counts. Preparation adds a decision record, so this preview is neither an exact reservation nor a completion-time forecast. Inspection makes no authoritative-state transaction or model/readiness/catalog call. It uses the existing store opener, which may initialize SQLite/WAL files; this is not a claim of zero filesystem access or writes. Fictional fixture savings do not establish actual company benefit. These projection features shipped in v0.6.6; installing them does not establish successful company adoption.

## Repair stale Codex hooks

v0.3.1 fixes [issue #2](https://github.com/yimoburu/soloco/issues/2). Codex `0.166.0-alpha.5.1` loads both hooks from the compatibility manifest; the former portable manifest yielded zero hooks on that client. Updating team instructions does not update project-level hook commands.

After updating the package and restarting, say in your existing founder chat:

> Check SoloCo's startup hooks for this folder. Remove the recognized old Company/SoloCo project hooks using the supported migration, preserve unrelated hooks and company records, and verify the current chat's binding after I review the plugin hooks.

Setup uses `company_hooks` to inspect discovery and preview exactly which entries will be removed. Migration backs up `.codex/hooks.json`, removes only recognized launchers and leaves the two plugin hooks as the source of startup behavior. It never writes a replacement versioned cache path, copies a binding, grants trust, or changes `.company/`. Unknown custom commands and duplicate legacy plugins hold migration for review.

Review and trust the two **SoloCo plugin** hooks in the host Hooks UI, reopen the founder chat, then send a prompt. `company_doctor` with the folder and actual chat ID checks that the lifecycle created a current-runtime binding in the MCP data directory. No binding means invocation is still unverified. The diagnostics distinguish missing discovery, disabled hooks, untrusted/modified definitions, stale commands and mismatched data directories. The read-only configuration probe cannot see unsaved live-chat overrides; compare with the host UI if needed.

Subsequent upgrades use the bundled hooks and a release-generated MCP launcher, with a stable shared data directory. The native test verifies both resolve the new package without project edits. The host may still require renewed hook trust; installation does not bypass that requirement.

## What is verified

- v0.6.7: synthetic lifecycle checks cover the unchanged 45-minute default, explicit 90-minute or no-overall-deadline preparation, strict input/action validation, stored-policy audit, immutable finite/none policies, legacy attempts, remaining-time call caps and apply/verify gates. These tests do not establish actual-company adoption or completion time.
- v0.6.6: synthetic preservation and lifecycle checks cover whole-body matching, distinct failures and unknown fields, exact originals, independent page delivery, citation boundaries, and transaction-free projection preview. A fictional 24-report fixture falls from 688,352 to 387,068 characters and from 6 to 4 pages. Actual-company reduction must be measured with inspect; fixture savings and tests do not prove adoption or completion within the deadline.
- v0.6.5: published and installed after independent native QA and 294 passing tests on each tested Node 22 and Node 25 runtime, with zero skips. The selected-model actual-company rehearsal was deliberately stopped and recovered with 10 of 31 CoS pages retained and QA not started. This was not an observed timeout or QA failure; adoption did not complete.
- v0.6.4: published and installed after independent native QA and 281 passing tests on each tested Node 22 and Node 25 runtime, with zero skips. The actual-company attempt completed CoS review of all 23 pages but QA only 8 of 23 before the immutable 45-minute deadline. Recovery preserved the prior v0.6.2 team, records and failed checks; adoption did not complete.
- v0.6.3: published and installed in the reported founder-approved sequence. Actual-company continuity rehearsal failed at call 11 after 10 of 20 pages under the old 180,000 ms per-call cap. The prior v0.6.2 team was safely recovered through public tools, preserving failure/history without silent retry; company adoption was not completed.
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

[SPEC reconciliation](docs/spec-reconciliation.md) maps all 47 normative
paragraphs of v0.21 to implementation, checks and remaining acceptance gaps.
It distinguishes software safeguards, agent judgment and disclosed release limits.
[Founder-benefit acceptance](docs/founder-benefit-acceptance.md) defines prospective
quality, time, cost and founder-effort comparisons; those benefits remain unmeasured.
The v0.21 clarifications preserve exact published v0.20 local-workflow compatibility
and never update an existing company's adopted rules automatically.

[Developer guide](docs/development.md) explains the runtime, compatibility and tests. [SPEC.md](SPEC.md) contains only enduring rules and constitutions. It is the implementation target, not a claim of full conformance; [optional playbooks](docs/playbooks.md) illustrate its operating loop. The legacy generator is retired; its source remains in Git history. Earlier designs and Claude reviews remain in the [archived snapshot](https://github.com/yimoburu/soloco/tree/ee3f302f47e82539ca0a40e0268a1e762c47929a/history).

Ordinary coordinator replacement remains paused until the incoming CoS submits current understanding through `company_handover` and independent exact-state QA permits resumption. Same-owner pause/resume does not require a full team-upgrade rehearsal. See [handover assurance](docs/development.md#ordinary-coordinator-handover-assurance-23).
