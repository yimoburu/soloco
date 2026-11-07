# SPEC v0.20 reconciliation

Review baseline: `7b6d6d53f37c6923399284d51e5b9f96dd255545`, November 7, 2026.
Contract: [SPEC.md](../SPEC.md), SHA-256
`28f99838abc3794da94f97f7a2d234554811da3aef7b8ddb3742075caa78ec36`.
Integrated implementation pin: `9160c2655cc14a5e5f1ff1690d5358e8c08b4f92`,
including main through `b6ea56bc845f9e8f82f25d88da96950f35cde46f`.
The contract is unchanged. This ledger covers every non-heading normative
paragraph/bullet by its original line number; grouped prose retains the full
requirement in SPEC. A source or contract change requires an affected-row review.

## Meaning of the assessments

- **Software**: a supported software invariant with executable checks; this does
  not assert that a model understood the evidence or made a sound business judgment.
- **Judgment**: implemented in the CoS instructions/role charters, with mechanical
  support and limited evaluations; representative outcome acceptance remains open.
- **Limited**: a disclosed capability boundary permitted by SPEC §8. Unsupported
  work must remain unavailable or held; a disclosure alone cannot excuse a broken
  invariant inside a supported workflow.
- **Mixed**: software checks exist, while the stated behavioral/continuity outcome
  still needs native or actual-company evidence.

Paths below are relative to the repository. `runtime/` means
`plugins/soloco/runtime/`; `skill` means `plugins/soloco/skills/soloco/SKILL.md`;
`roles` means `plugins/soloco/assets/roles.json`. Test entries refer to `tests/`.
Evidence is scoped to the test scenario, not universal conformance. Pending
attention and retained semantic evidence are distinct: resolving a notice removes
it from attention views but does not discard its conditions from assignment input.

## Requirement-to-evidence map

| ID / SPEC line | Requirement | Implementation and observable checks | Assessment / remaining evidence |
|---|---|---|---|
| S005 / 5 | One founder conversation, standalone agents, lasting company | `runtime/engine.mjs`, `adapters.mjs`, `store.mjs`; `plugin.test.mjs`, `runtime-version-fence.test.mjs` | Mixed: native session and company continuity need workflow-specific acceptance. |
| S007 / 7 | Founder-defined success; launch/funding optional; continued operation | skill intent/review guidance; runner/finance roles | Judgment: real customer value, economics and founder workload remain measured outcomes. |
| S009 / 9 | Enduring rules separated from implementation; preserve adopted rules | `tools/build-plugin.mjs`, `runtime/upgrade.mjs`; build check, `runtime-version-fence.test.mjs` | Software: governance is a byte copy; installation is not adoption. |
| S013 / 13 | Simplest sufficient design; preserve safeguards when simplifying | Existing store, context, worker and runtime reused; `docs/development.md` | Judgment: structural review; no new authority service or parallel fact store. |
| S014 / 14 | Founder direction and bounded delegation; no authority from silence | `engine.mjs`, `develop.mjs`, `prototype.mjs`, `task-runtime-authority.mjs`; `spec-invariants`, `develop`, `prototype`, `tasks` tests | Mixed: source instructions are attributed, not independent human authentication; external actions unavailable. |
| S015 / 15 | Roles own judgment with legitimate boundaries | roles; skill role activation; `coordination.test.mjs` | Judgment: role competence is not proved by a role label or prompt. |
| S016 / 16 | Attributable versioned shared records govern | `store.mjs`, `engine.mjs`, `current-state.mjs`; `plugin`, `spec-invariants`, `storage-intake` tests | Software: optimistic revisions, notice author and immutable dispositions. |
| S017 / 17 | Independent acceptance including CoS and QA | `worker.mjs`, `coordination.mjs`, `handover.mjs`; `spec-invariants`, `prototype`, `handover`, `task-runtime` tests | Mixed: native identity enforced before review publication; semantic qualification still requires judgment. |
| S018 / 18 | Evidence, review, authorization and capability distinct | `develop.mjs`, `prototype.mjs`, `tasks.mjs`; corresponding tests and `local-sandbox.test.mjs` | Software within supported local/preparation workflows. |
| S019 / 19 | Improve against expectations and retain failures | skill; `tools/coordination-eval.mjs`, `accepted-workflow-eval.mjs`; evaluator tests | Judgment: narrow fixture outcomes do not establish production improvement. |
| S020 / 20 | Replacement retains truth, limits, obligations and control | `handover.mjs`, `upgrade.mjs`, `storage-transfer.mjs`; handover/upgrade/transfer tests | Mixed: safe failure is tested; realistic semantic replacement remains open. |
| S024 / 24 | Founder need not assemble agents or relay messages | skill; `engine.mjs`, `tasks.mjs`, `supervisor.mjs`; `task-runtime-acceptance.test.mjs` | Mixed: software handoff supported; observed founder effort remains open. |
| S026 / 26 | Intent measures/cadence/reserved decisions; routine work proceeds | skill intent and standing grant guidance; local grants and task definitions | Judgment: prose intent is not schema-enforced business outcome measurement. |
| S028 / 28 | Inspect, correct, pause, replace; resume preserves uncertainty | `engine.mjs`, `hooks.mjs`, `handover.mjs`; `plugin`, `handover`, `cancellation-finalization` tests | Software; cancellation never proves remote/provider termination. |
| S030 / 30 | Notice kinds, authorship, dissent, persistence; delivery ≠ authority | `engine.mjs`, `worker.mjs`, `main.mjs`, `public-response.mjs`; `spec-invariants`, `plugin`, `public-response` tests | Software: first disposition immutable; corrections create linked new notices. Background push delivery unavailable. |
| S032 / 32 | Adapt communication; show actual state; retain notices | skill; `progress.mjs`, `progress-view.mjs`; progress tests, coordination evaluator | Mixed: projection is tested; actual CoS communication quality remains behavioral. |
| S036 / 36 | Standalone identities and one active coordinator | `adapters.mjs`, `engine.mjs`, `store.mjs`; `plugin`, `spec-invariants`, `selection-adapter`, `tasks` tests | Software; source/host integration is not proof of every desktop lifecycle. |
| S038 / 38 | Charters, minimal activation, explicit transfer, independent reviewers | roles and skill; `engine.mjs`, `worker.mjs`; `spec-invariants`, `coordination`, `upgrade` tests | Mixed: reviewer identity enforced; conflict-of-interest and competence need domain judgment. |
| S042 / 42 | Strong practical CoS within cost/responsiveness limits | skill model policy; host controls CoS model | Limited: plugin cannot select founder-chat model or impose hard billing caps. |
| S044 / 44 | Develop intent; distinguish assumptions and decisions | skill “Shape the idea”; runner/research roles | Judgment: native behavior/outcomes require representative evaluation. |
| S045 / 45 | Proactive useful work with owner, inputs, limits and receiver | skill; `engine.mjs`, `tasks.mjs`; `coordination`, `tasks`, `task-context` tests | Mixed: task admission supported; strategic quality not mechanically guaranteed. |
| S046 / 46 | Convergent dependencies/recovery respecting blocks | `coordination.mjs`, `tasks.mjs`, `supervisor.mjs`; coordination/task runtime/crash tests | Mixed: mechanical dependency and resource gates tested; cross-domain dispute judgment remains open. |
| S047 / 47 | Protect attention; evidence/options/recommendations for reserved decisions | skill and runner role; coordination evaluator | Judgment: cost-of-waiting/choice quality and actual interruption reduction not established. |
| S048 / 48 | Accountable, independently reviewed, replaceable CoS | `engine.mjs`, `handover.mjs`; `spec-invariants`, `handover` tests | Mixed: review gate and record recovery tested; real reconstruction quality needs acceptance. |
| S050 / 50 | Supported task-fit models; qualification; no implied business competence | `selection.mjs`, `adapters.mjs`; selection tests and retained outcome trials | Mixed: requested/applied/observed controls separated; no demonstrated general business-execution competence. |
| S054 / 54 | Attributable exact handoffs; messages confer no authority | `worker.mjs`, `tasks.mjs`, `coordination.mjs`; `task-context`, `tasks`, `task-runtime-acceptance` tests | Software for supported producer/review/receiver workflows. |
| S056 / 56 | Mechanical enforcement at execution and record mutation | `store.mjs`, `engine.mjs`, `worker.mjs`, `local-sandbox.mjs`; invariant/sandbox/runtime tests | Limited: supported APIs and execution are guarded; arbitrary same-user filesystem writes are outside the security boundary. |
| S058 / 58 | Stale approvals/writes rejected; late output quarantined; scoped holds | `context.mjs`, `worker.mjs`, `tasks.mjs`; `spec-invariants`, `develop`, `task-context`, `task-runtime-acceptance` tests | Software; resolved notice conditions now remain input and stale affected work. |
| S060 / 60 | Evidence-based blocks; independent disputes; no false Pass | roles/skill; `worker.mjs`; `spec-invariants.test.mjs` | Mixed: contradictory Pass rejected; general dispute-resolution workflow is agent judgment, not a dedicated adjudication engine. |
| S062 / 62 | Detect stalls and recover/escalate within authority | `timeout.mjs`, `worker.mjs`, `supervisor.mjs`, notices; timeout/cancellation/task-runtime tests | Limited: durable notices plus next-open-chat delivery; no guaranteed out-of-band founder notification. |
| S066 / 66 | Bounded evidence/review loop without mandatory stages | skill; prototype/development/task APIs; lifecycle tests | Software plus CoS workflow judgment; legacy `phase:Frame` is not execution authority. |
| S068 / 68 | Criteria/limits/reviews before consequential work; counterevidence | scope/task validation, `current-state.mjs`, `worker.mjs`; develop/task/negative-retention tests | Mixed: evidence binding enforced; substantive sufficiency requires independent judgment. |
| S070 / 70 | Honest Pass/Fail/Blocked; bounded repair and permitted next action | `worker.mjs`, `develop.mjs`, `tasks.mjs`; `spec-invariants`, `develop`, `tasks` tests | Software: Pass with explicit nonempty/malformed blockers rejected; omission remains legacy-compatible. |
| S072 / 72 | Correct order of review, authorization, execution; exact candidate | `develop.mjs`, `prototype.mjs`, `handover.mjs`, `upgrade.mjs`; their lifecycle/negative tests | Software within declared workflows; no broader business grant implied. |
| S074 / 74 | Scoped reviewed artifacts; distinct generation/run/integration permissions | `develop.mjs`, `prototype.mjs`, `local-sandbox.mjs`; corresponding tests | Limited: retained local candidate and Node tests; source integration/deployment unsupported by company runtime. |
| S076 / 76 | Mandatory trust/professional review before exposure | legal/security roles; worker tools disabled; sandbox | Limited: professional advice/real external exposure not supported; no prompt substitutes for professional review. |
| S078 / 78 | Review value/economics/workload; maintain under current authority | skill and finance/release roles | Limited/Judgment: plans/reviews of supplied evidence supported; live business operations and unattended reviews unavailable. |
| S082 / 82 | One authoritative home; consequential findings/dissent retained | `store.mjs`, `operating-state.mjs`, exact source APIs; operating/storage/invariant tests | Mixed: physical preservation tested; semantic home selection requires independent acceptance. |
| S084 / 84 | Complete usable current context; missing context holds | `context.mjs`, `task-context.mjs`, `scoped-context.mjs`; `spec-invariants`, `task-context`, scoped/qualification tests | Mixed: resolved notice qualifiers retained; oversized contexts hold; native semantic fit remains open. |
| S086 / 86 | Preserve lineage/failures/uncertainty; attributable correction | `engine.mjs`, `worker.mjs`, `snapshot.mjs`; `spec-invariants`, negative-retention, snapshot tests | Software; repeated notice disposition cannot erase history. |
| S090 / 90 | Identity, assets, notices and history survive rename/update/uninstall | company-local store, `engine.mjs`, `storage-transfer.mjs`; rename/version/transfer tests | Mixed: tested source paths; product/desktop uninstall behavior needs host-specific acceptance. |
| S092 / 92 | State outside caches; pinned definitions; explicit migration | `store.mjs`, `upgrade.mjs`, `storage-transfer.mjs`; runtime-version/transfer/upgrade tests | Software; unknown compatibility holds. |
| S094 / 94 | Independent reconstruction, explicit adoption, authority revocation | `handover.mjs`, `upgrade.mjs`; handover/upgrade/operating tests | Mixed: mechanical gates tested; actual-company large-history acceptance remains open. |
| S096 / 96 | Preserve pending/unknown outcomes; no blind retry; successor continuity | `tasks.mjs`, `supervisor.mjs`, `handover.mjs`; task-runtime-crash/recovery/handover tests | Mixed: crash cuts use fictional adapters; real model-session replacement remains a separate claim. |
| S098 / 98 | Checked recoverable continuity, not universal uninterrupted sessions | checked handover/recovery APIs and documented host limits | Limited: no zero-downtime or universal-host promise. |
| S102 / 102 | Simplest sufficient implementation; narrower limits disclosed | existing record/runtime architecture; README and developer guide | Judgment/Limited: source review checks proportionality; no full-conformance inference from disclosure. |
| S104 / 104 | Observable failure/staleness/replacement checks; explicit rule adoption | full repository tests, native acceptance fixture, generated-governance check | Mixed: executed receipts and independent review below; open behavioral claims remain open. |

## Contradictions repaired in this candidate

1. Ordinary reviews could publish a Pass under the producer's actual native
   session despite distinct role-instance IDs. All review publication now checks
   author and coordinator native identity. Rejected output stays retained.
2. A generic Pass could carry explicit blockers. Publication rejects nonempty or
   malformed `blockers` on Pass, retaining the original output. The historical
   ordinary format may still omit `blockers`; omission is not proof of competence.
3. A second notice-resolution call could overwrite the first disposition.
   The first resolution is now immutable and attributed; exact replay is allowed.
   Corrections use a new notice with `reference` set to the original notice ID.
   Original authorship/disposition and the new pending correction survive handover.
4. A truthy notice resolution discarded its continuing conditions from ordinary,
   async and qualification context. Semantic inputs and prototype authorization
   fingerprints now retain notices and their dispositions. Pending attention
   views still list only unresolved notices. Growth can cause an explicit context
   hold; this repair introduces no unreviewed notice-retirement shortcut.
5. The actual Codex CLI emitted completed diagnostic error items alongside a
   successful turn, which the adapter rejected as an unsupported sequence.
   Well-formed diagnostics are now retained as warnings; acceptance still needs
   a valid terminal turn. Missing completion, terminal failure, malformed or
   replayed diagnostic IDs, and conflicting negative evidence remain rejected.
   The acceptance harness accepts an explicit catalog-verified model ID without
   changing the default or silently substituting a model.

Retaining resolved notice meaning changes affected assignment, prototype-scope
and qualification hashes. Previously recorded grants/reviews remain retained,
but affected work may become stale and hold. No automatic retry, reauthorization,
reclassification or allowance reset is introduced. Reviewer independence also
covers the substantive candidate producer when the review target is a software
test receipt.

## Acceptance work and closure rules

| Gap | Accountable work / evidence needed | Safe current boundary |
|---|---|---|
| Realistic context and successor understanding (#13) | Engineering prepares a scoped realistic-history fixture; independent QA must demonstrate preservation of distant constraints, negative evidence and next permitted action through full handover. | Unknown or oversized context remains held. Synthetic archive volume proves neither understanding nor native fit. |
| CoS judgment and founder effort (#16) | CoS/Research define representative paired/counterbalanced trials, including harmful parallelism and covered repairs; independent QA judges outcomes and recorded founder interventions. | Existing small evaluations are descriptive; no production workload/cost reduction claim. |
| Candidate-format comparison (#18) | Engineering/QA preserve the original blocked full-file controls; any newly authorized trial has fresh declared criteria and separate evidence. | No relabeling old Blocked trials or restored attempt allowance. |
| Native lifecycle and recovery (#30) | The bounded public-MCP producer → independent QA → receiver fixture passed at `19414e6`, including software-supervisor recovery. Model-session replacement, other hosts and actual company adoption need separate evidence. | One attempt per task; failures/uncertainty retain evidence and prevent blind retry. |
| Host/external operations | Host-specific acceptance and a separately designed enforceable execution boundary before promising new capabilities. | Current company runtime exposes preparation and bounded local artifacts only. |

Software correction, native fixture acceptance and actual-company adoption are
separate outcomes. An open row cannot become Pass through a disclosure, test
count, or reviewer confidence. This candidate does not modify any actual company,
installed plugin, adopted rules, prior verdict, or attempt allowance.

## Validation and independent review

The retained [evidence package](../evals/spec-reconciliation-20261107/README.md)
records clean source pins, complete local test logs/counts, original failures,
sanitized native receipts and an independent source review. These are local
executed checks, not GitHub CI receipts or actual-company adoption.

- Full Node 22.23.2: **1121/1121 passed**, zero failures/skips, on `9160c26`.
- Node 26.13.0 compatibility plus changed boundaries: **429/429 passed**, zero
  failures/skips, on `9160c26`.
- Integrated Node 22 regression plus changed boundaries: **780/780 passed**,
  zero failures/skips, on `c4fd3c5` before the final test-only correction.
- Build/governance drift, whitespace, and exact **47/47** SPEC-row coverage passed.
- Baseline regression evidence retains **13 failures and 1 pass**; the repaired
  invariant cases pass in the complete suite. Counts across suites overlap.

Final test receipts require unchanged clean before/after source pins. The final
passing TAPs also pass the repository's strict complete-plan/count parser. The
following evidence/documentation commit changes no executable source.

The native fixture used three distinct Codex sessions requested as `gpt-6-astra`
(low effort for producer/receiver, medium for QA), as advertised by this host.
Effective provider settings remain unverified. Artifact generation, exact independent
review, receiver handoff and peer disposition passed; software-supervisor
interruption recovered without duplicate work, idle started no new jobs, and
native closure was confirmed. The successful fixture is pinned to `19414e6`;
subsequent integration changed development receipt validation, its format verifier,
tests and documentation, not the async adapter/task/worker path. It is not an
exact-commit native run of the integrated candidate.

The original native fixture at `cc0edb5` remains `needs_attention` after the
unsupported diagnostic sequence; its output is retained, with no published
artifact or QA/receiver attempt. The original full Node 22 run remains a failure
(1104/1105): its operating-state test expected a nonindependent review to reach a
later gate. The corrected test checks rejection at publication, retained output,
no artifact, and no accepted operating state. An earlier interrupted full run is
incomplete and contributes no passing-suite claim.

Independent reviewer `/root/spec_independent_review` gave the integrated source
pin a scoped **Pass** after inspecting the delta, original negative evidence,
native artifact/review/receiver bindings, and all 40 native runtime/harness hashes.
See the [review record](../evals/spec-reconciliation-20261107/independent-review.md).
That verdict does not close any acceptance gap above. Raw native diagnostics and
host configuration remain local; only sanitized projections and hashes are
published.
