# Durable preparation tasks

This describes the prospective source capability for [#30](https://github.com/yimoburu/soloco/issues/30). It is not evidence of release, installation, team adoption, native semantic acceptance or an active company runtime.

The minimum is CoS, one software runtime/SQLite store, and finite specialist/reviewer sessions. The supervisor makes no idle model calls. Context assembly, guarded commits and portfolio views are runtime functions.

## Start and submit

1. Load pinned instructions through `company_open` with the actual trusted host binding. Inspect `company_storage`. Async tasks require **normalized-v4**; use the existing authorized backup/migration path if needed. Startup never migrates, adopts a team or unpauses work.
2. The current owner calls `company_runtime start` with current `epoch` and actual `source_instruction`. This records lifecycle authority and rebuilds the disposable task index, without authorizing arbitrary work.
3. Use `company_tasks submit` with `operation_id`, `epoch`, `source_instruction` and `spec`. Required spec fields: `role`, `task`, `expected_deliverable`, `acceptance`. Declare relevant `input_ids`, `context_scope`, exclusive `resources`, model selection and timeout. Each task permits **one attempt** in a fresh specialist session.
4. Persist the workflow, then return control. The runtime advances eligible work while CoS remains available; inspect current state on the next interaction.

Use the same `operation_id` only to retrieve the result of the identical command. Reusing it for changed content fails. `amend` and `cancel` require the current `expected_definition_revision`. An amendment fences old work; it does not reset the consumed attempt.

A message replay retains its original receiver definition even if that task has since been amended. It retrieves the existing envelope, including any durable disposition; it does not create a second message or retarget old evidence. Disposition against a changed receiver definition still requires explicit reconciliation.

## Dependencies and communication

- `spec.depends_on` names existing task IDs with explicit gates. `output` requires an attributable completed output; `accepted` requires a current independent exact-subject Pass. A test gate requires a canonical passing runtime test receipt, never a model-written "passed" flag. Async task submission introduces no new generation or software-test execution capability.
- For A → QA → B, give QA `review_task_id: A.id` and B `depends_on: [{task_id: QA.id, gate: "accepted"}]`. A remains a returned proposal; QA acceptance grants no general permission. Planned tasks have no native identity.
- Cancelling a prerequisite revokes downstream eligibility even after its job completed. Required negative counterevidence remains evidence; receiving it does not turn it into a passing prerequisite. Late responses to interrupted attempts retain exact observed output and native attribution without acceptance or another attempt.
- CoS can `message` an exact `to_task_id`. Declare a worker's permitted existing receivers in `spec.peer_task_ids` (at most16). Its packet exposes `peer_targets` with receiver IDs, definition bindings, roles and scopes. Worker `messages` must match a declared receiver's `to` role and `to_task_id`; a receiver definition/owner change invalidates the sender, while ordinary receiver lifecycle updates do not. Peers cannot create grants or reset attempts.
- `inbox` returns previews. Retrieve each exact source before an owner `dispose` action. Workers may return `message_dispositions` naming exact delivered message IDs and describing their disposition. Delivery, processing, completion and receiver acceptance remain different facts.
- A proven receiver acknowledgment preserves its original delivered message body. A material same-task message arriving later causes a **Hold**, without silent injection, retry or renewed allowance. Retain the pending message/attempt for applicable recovery. Disjoint worker handoffs stay scoped. Verbatim founder qualifiers on cancellation, owner messages and dispositions remain required semantic evidence until canonically qualified; delivery or cancellation alone never classifies them.

## Read current state and recover

`company_tasks inspect` exposes bounded task briefs; `context` adds source-linked portfolio metadata and explicit coverage; `checkpoint` reconstructs objective, acceptance, blockers and next action. Follow `next_cursor` and inspect `complete`/omission fields. Display previews and a summary-only portfolio are not complete decision evidence.

The bounded replies do not promise constant storage work. Task/message index-integrity checks and inventory hashes scan metadata; semantic portfolio and dispatch assembly conservatively read canonical state. Use compact `inspect`/runtime `status` for routine control. Scope-filtered `context` uses its own complete membership and cursor. Growing task/message history remains a measured storage cost in the existing context workstream.

Context binds task definition, owner/epoch, runtime grant, exact sources and applicable rule membership. Reviews and dependents receive producer objectives/acceptance, the exact candidate/review and producer evidence. A proven original message delivery is labeled retained provenance; review inputs bind the current canonical message and disposition. Only exact current source hashes of already delivered bodies can be reread, alongside declared evidence IDs.

The **64KiB cumulative visible wire budget** counts the complete source-generated prompt, every retrieval prompt and all returned text. Provider-added framing and hidden reasoning are not measured; a fitting initial packet alone does not establish native fit or semantic adequacy. Oversized or unqualified material stays Held; nothing required is silently truncated. Only exactly validated prospective job/proposal bookkeeping may be omitted. Legacy execution bodies, failures and unknown qualifiers remain compulsory until qualified. Native conversation memory is not current authority.

`company_runtime status` distinguishes enabled/running/stopped, required host wakeup and uncertainty. `stop` fences scheduling and acceptance; cancellation is not proof of process closure. `reconcile` inspects durable task state without granting another attempt. Retain resource claims while execution is uncertain. No timeout, expired lease or lost connection proves that a process stopped.

The supported local MCP host supervises recovery; no OS daemon is installed. Offline progress, founder push notifications and automatic sidebar delivery are not promised. Closing a chat does not prove detached children stopped. Hook discovery, trust and real session binding remain required.

## Acceptance evidence map

These are source test mappings, not a final-candidate acceptance receipt. Scripted model adapters are explicit fictional contract judgments.

| Requirement | Mechanical coverage | Remaining verification |
|---|---|---|
| New commands/status during slow workers; public pagination and related resource visibility; no CoS polling; A → independent QA → B | `tests/task-runtime.test.mjs`, `tests/task-runtime-acceptance.test.mjs` | Real supported-host lifecycle, observed native identities and exact output/review links |
| Idempotent commands, one-shot attempts, cancellation, source/owner fences, durable peer messages and dispositions | `tests/tasks.test.mjs` | Independent review of final code and crash/recovery evidence |
| Process SIGKILL before persistence, after uncommitted writes and after commit/lost reply; dispatch uncertainty; atomic output/message action/ack; next-event recovery and duplicate suppression | `tests/task-runtime-crash.test.mjs`, `tests/fixtures/task-runtime-crash-child.mjs` | Fictional model adapters exercise real SQLite/process cuts; this does not establish native-session replacement or external exactly-once execution |
| 1x/10x/100x classified archive, exact context sources, late-message Hold, bounded portfolio/checkpoint, stale sources | `tests/task-context.test.mjs` | Actual native context/output fit and semantic adequacy; packet size alone is insufficient |
| Task index, backup/restore and stale-writer compatibility | `tests/task-index.test.mjs` | Exact-final-pin results and supported restore/migration evidence |
| Late returns after amend/pause/owner/stop; Fail/Blocked QA; software restart after result commit with a durable peer handoff | `tests/task-runtime-acceptance.test.mjs` | Actual host/native lifecycle is separate from these scripted model adapters |
| Full release compatibility | Existing relevant suites, build and generated-file checks | Exact-final-pin Node 22/25 results, required native review and host integration receipts |

Known conservative boundary: a scoped-current classification does not automatically classify its new plan/review bodies. Those bodies remain required until canonically qualified. This task runtime does not introduce a shape-based operating-checkpoint intake exemption or silently clear legacy unknown obligations.

Keep [#13](https://github.com/yimoburu/soloco/issues/13)'s context/storage and [#16](https://github.com/yimoburu/soloco/issues/16)'s CoS judgment contracts. Separate services, vector databases, recursive agent managers and additional business/spending powers are outside this minimum.

`node tools/async-runtime-acceptance.mjs --prepare-only --output-dir /absolute/new/directory` prepares a fictional project through a real MCP process without starting native jobs. Explicit `--run-native` on a clean frozen source commit starts its three one-attempt native assignments, retains receipts and checks the exact producer/review/dependent links. Recovery restarts only the identified software supervisor while its detached native worker is in flight, preserving that job/attempt without duplication; it never kills the native worker. Missing that boundary is an unmet check. The fixture's hook binding is synthetic; it does not establish trusted Codex Hooks UI invocation or actual-company adoption. Inspect any failed receipt before taking another action; the harness never automatically retries.

Optional `--model <id>` explicitly selects a model for that fresh fixture (default
`gpt-6.1-sol`). The live host catalog must advertise the exact model and required
low/medium efforts before any native job starts; an unavailable choice holds
without substitution. This changes neither task scope nor attempt limits.

## Prospective founder outcome and recovery contracts

New tasks may supply `spec.outcome` with `objective`, `expected_effect`,
`observation`, `assessment_period` and `evidence_ids`. Every outcome evidence ID
must also be an explicit task input. The complete hypothesis travels with the
immutable task definition, dependent evidence and cold checkpoint. An outcome is
never marked achieved merely because its task or review completed. Amending it
changes the definition hash and retains the existing consumed-attempt boundary.

Task inspection exposes a typed readiness/recovery explanation. Only runtime
capacity, a live resource claim or a pending prerequisite permits automatic
rechecking of an unstarted task. An uncertain process, changed authority or
context, rejected review, and unknown failure require the indicated owner and
next action. Scheduling never interprets error-message wording as permission.
No recovery descriptor restarts an execution or replenishes attempts.

Use `tools/outcome-observations.mjs BEFORE.json AFTER.json NEW_REPORT.json` for
explicitly supplied local measurements. Each input contains `metric`, `period`,
`numerator`, `denominator`, and `source_reference`. The report retains exact file
hashes and normalized rates, and makes no causal, customer-value or founder-time
claim. Supply it through the existing artifact/input route for outcome review.
