# SPEC v0.21 reconciliation

Current source baseline: merged main `4e9e434` (PR #56), November 9, 2026 UTC.
This includes the peer foundations, bounded storage core, executor/fixture fixes,
durable observation journal and storage transfer qualification described below.
Contract: [SPEC.md](../SPEC.md), SHA-256
`4bd0af7032d870195b2992e850b1dc9a50a9b9e59a3ec27267b7b0752cca57a9`.

v0.21 clarifies only existing paragraphs 30, 46 and 96: continuing notice
conditions, responsive authorized follow-through, and independently checked
current-meaning reconstruction. The 47 normative rows and line numbers remain
stable. Existing companies retain their adopted rules; exact published v0.20
(`28f99838abc3794da94f97f7a2d234554811da3aef7b8ddb3742075caa78ec36`)
remains explicitly supported for the existing local artifact workflows.
No installation, source update or passing test adopts v0.21 for a company.

The earlier combined source `4038e0f` incorporated main `79550fd` (including
PR #37), SPEC repairs `70ade7b`, and founder-outcome candidate `eeef357`.
Earlier reconciliation began at `7b6d6d5`; its integrated v0.20 implementation
pin was `46226dc`, and its full-suite pin was `9160c26`. Historical evidence
below retains those identities and verdicts. It does not attest to this later
contract or integration. A source or contract change requires affected-row review.

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
| S007 / 7 | Founder-defined success; launch/funding optional; continued operation | skill intent/review guidance; runner/finance roles; `runtime/outcome.mjs` and task outcome hypotheses | Judgment: expected effects and supplied observations are distinct; real customer value, economics and founder workload remain measured outcomes. |
| S009 / 9 | Enduring rules separated from implementation; preserve adopted rules | `tools/build-plugin.mjs`, `runtime/upgrade.mjs`; build check, `runtime-version-fence.test.mjs` | Software: governance is a byte copy; installation is not adoption. |
| S013 / 13 | Simplest sufficient design; preserve safeguards when simplifying | Existing store, context, worker and runtime reused; `docs/development.md` | Judgment: structural review; no new authority service or parallel fact store. |
| S014 / 14 | Founder direction and bounded delegation; no authority from silence | `engine.mjs`, `develop.mjs`, `prototype.mjs`, `task-runtime-authority.mjs`; `spec-invariants`, `develop`, `prototype`, `tasks` tests | Mixed: source instructions are attributed, not independent human authentication; external actions unavailable. |
| S015 / 15 | Roles own judgment with legitimate boundaries | roles; skill role activation; `coordination.test.mjs` | Judgment: role competence is not proved by a role label or prompt. |
| S016 / 16 | Attributable versioned shared records govern | `store.mjs`, `engine.mjs`, `current-state.mjs`; `plugin`, `spec-invariants`, `storage-intake` tests | Software: optimistic revisions, notice author and immutable dispositions. |
| S017 / 17 | Independent acceptance including CoS and QA | `worker.mjs`, `coordination.mjs`, `handover.mjs`; `spec-invariants`, `prototype`, `handover`, `task-runtime` tests | Mixed: native identity enforced before review publication; semantic qualification still requires judgment. |
| S018 / 18 | Evidence, review, authorization and capability distinct | `develop.mjs`, `prototype.mjs`, `tasks.mjs`; corresponding tests and `local-sandbox.test.mjs` | Software within supported local/preparation workflows. |
| S019 / 19 | Improve against expectations and retain failures | skill; `tools/coordination-eval.mjs`, `accepted-workflow-eval.mjs`, `outcome-observations.mjs`; evaluator/observation tests | Judgment: supplied feedback can describe completion and repairs; native fixtures and test counts do not establish causal business improvement. |
| S020 / 20 | Replacement retains truth, limits, obligations and control | `handover.mjs`, `upgrade.mjs`, `storage-transfer.mjs`; handover/upgrade/transfer tests | Mixed: safe failure is tested; realistic semantic replacement remains open. |
| S024 / 24 | Founder need not assemble agents or relay messages | skill; `engine.mjs`, `tasks.mjs`, `supervisor.mjs`; `task-runtime-acceptance.test.mjs` | Mixed: durable handoffs support bounded follow-through; supported host availability is required and actual founder effort remains open. |
| S026 / 26 | Intent measures/cadence/reserved decisions; routine work proceeds | skill intent and standing grants; `outcome.mjs`, task definitions and proposal inputs | Judgment: typed task hypotheses preserve objectives/observations; prose company intent and claimed effects are not independently measured business outcomes. |
| S028 / 28 | Inspect, correct, pause, replace; resume preserves uncertainty | `engine.mjs`, `hooks.mjs`, `handover.mjs`; `plugin`, `handover`, `cancellation-finalization` tests | Software; cancellation never proves remote/provider termination. |
| S030 / 30 | Notice authorship, dissent and disposition persist; continuing conditions remain binding | `engine.mjs`, `worker.mjs`, context/prototype modules; notice, `spec-invariants`, context and prototype tests | Mixed: immutable attributable dispositions and retained conditions are tested; semantic clearing authority still requires applicable judgment/review. Pending attention and continuing obligations are distinct. |
| S032 / 32 | Adapt communication; show actual state; retain notices | skill; `progress.mjs`, `progress-view.mjs`; progress tests, coordination evaluator | Mixed: projection is tested; actual CoS communication quality remains behavioral. |
| S036 / 36 | Standalone identities and one active coordinator | `adapters.mjs`, `engine.mjs`, `store.mjs`; `plugin`, `spec-invariants`, `selection-adapter`, `tasks` tests | Software; source/host integration is not proof of every desktop lifecycle. |
| S038 / 38 | Charters, minimal activation, explicit transfer, independent reviewers | roles and skill; `engine.mjs`, `worker.mjs`; `spec-invariants`, `coordination`, `upgrade` tests | Mixed: reviewer identity enforced; conflict-of-interest and competence need domain judgment. |
| S042 / 42 | Strong practical CoS within cost/responsiveness limits | skill model policy; host controls CoS model | Limited: plugin cannot select founder-chat model or impose hard billing caps. |
| S044 / 44 | Develop intent; distinguish assumptions and decisions | skill “Shape the idea”; runner/research roles | Judgment: native behavior/outcomes require representative evaluation. |
| S045 / 45 | Proactive useful work with owner, inputs, limits and receiver | skill; `engine.mjs`, `tasks.mjs`, `operating-state.mjs`; task and operating-control tests | Mixed: exact opt-in read-only proposals can feed subsequent work; proposals do not become accepted knowledge or new authority. |
| S046 / 46 | Responsive authorized follow-through and useful return within host availability | `coordination.mjs`, `tasks.mjs`, `supervisor.mjs`, `recovery.mjs`; task runtime/crash/operating-control checks | Mixed: durable dependencies, retained proposals and typed unstarted capacity waits are supported; real founder-return utility and interruption reduction require observation. Offline progress is not promised. |
| S047 / 47 | Protect attention; evidence/options/recommendations for reserved decisions | skill and runner role; coordination evaluator | Judgment: cost-of-waiting/choice quality and actual interruption reduction not established. |
| S048 / 48 | Accountable, independently reviewed, replaceable CoS | `engine.mjs`, `handover.mjs`; `spec-invariants`, `handover` tests | Mixed: review gate and record recovery tested; real reconstruction quality needs acceptance. |
| S050 / 50 | Supported task-fit models; qualification; no implied business competence | `selection.mjs`, `adapters.mjs`; selection tests and retained outcome trials | Mixed: requested/applied/observed controls separated; no demonstrated general business-execution competence. |
| S054 / 54 | Attributable exact handoffs; messages confer no authority | `worker.mjs`, `tasks.mjs`, `coordination.mjs`; `task-context`, `tasks`, `task-runtime-acceptance` tests | Software for supported producer/review/receiver workflows. |
| S056 / 56 | Mechanical enforcement at execution and record mutation | `store.mjs`, `engine.mjs`, `worker.mjs`, `local-sandbox.mjs`; invariant/sandbox/runtime tests | Limited: supported APIs and execution are guarded; arbitrary same-user filesystem writes are outside the security boundary. |
| S058 / 58 | Stale approvals/writes rejected; late output quarantined; scoped holds | `context.mjs`, `worker.mjs`, `tasks.mjs`; `spec-invariants`, `develop`, `task-context`, `task-runtime-acceptance` tests | Software; resolved notice conditions now remain input and stale affected work. |
| S060 / 60 | Evidence-based blocks; independent disputes; no false Pass | roles/skill; `worker.mjs`; `spec-invariants.test.mjs` | Mixed: contradictory Pass rejected; general dispute-resolution workflow is agent judgment, not a dedicated adjudication engine. |
| S062 / 62 | Detect stalls and recover/escalate within authority | `timeout.mjs`, `recovery.mjs`, worker/supervisor and notices; timeout/cancellation/task-runtime tests | Limited: only typed unstarted capacity/resource holds may wait automatically; attempted/uncertain or unknown failures need attention. No guaranteed out-of-band founder notification. |
| S066 / 66 | Bounded choose/assign/evidence/review/record/continue loop | task dependencies, optional outcome hypotheses, opt-in operating proposals and supplied-observation tool | Mixed: continuation stays within existing permission; an output, proposal, test or completed protocol is not observed founder/business benefit. |
| S068 / 68 | Agreed outcomes/evidence/limits and retained counterevidence | scope/task validation, `outcome.mjs`, `current-state.mjs`, `worker.mjs`; outcome/task/negative-retention tests | Mixed: objective, expected effect, observation and assessment period can be retained with exact inputs; sufficiency and measurement validity require independent judgment. |
| S070 / 70 | Honest Pass/Fail/Blocked; bounded repair and permitted next action | `worker.mjs`, `develop.mjs`, `tasks.mjs`; `spec-invariants`, `develop`, `tasks` tests | Software: Pass with explicit nonempty/malformed blockers rejected; omission remains legacy-compatible. |
| S072 / 72 | Correct order of review, authorization, execution; exact candidate | `develop.mjs`, `prototype.mjs`, `handover.mjs`, `upgrade.mjs`; their lifecycle/negative tests | Software within declared workflows; no broader business grant implied. |
| S074 / 74 | Scoped reviewed artifacts; distinct generation/run/integration permissions | `develop.mjs`, `prototype.mjs`, `local-sandbox.mjs`; corresponding tests | Limited: retained local candidate and Node tests; source integration/deployment unsupported by company runtime. |
| S076 / 76 | Mandatory trust/professional review before exposure | legal/security roles; worker tools disabled; sandbox | Limited: professional advice/real external exposure not supported; no prompt substitutes for professional review. |
| S078 / 78 | Review value/economics/workload; maintain under current authority | skill/finance roles; `tools/outcome-observations.mjs`; [founder-benefit acceptance](founder-benefit-acceptance.md) | Limited/Judgment: supplied observations are attributable inputs; founder minutes, comparative costs, longitudinal value and business effect remain unmeasured. Live external business operations remain unavailable. |
| S082 / 82 | One authoritative home; consequential findings/dissent retained | `store.mjs`, `operating-state.mjs`, exact source APIs; operating/storage/invariant tests | Mixed: physical preservation tested; semantic home selection requires independent acceptance. |
| S084 / 84 | Complete usable current context; missing meaning holds | context/task/scoped/qualification modules; `spec-invariants`, `claude-catalog`, task/scoped/qualification tests | Mixed: continuing notice conditions and unknown model-speed semantics stay compulsory; exact projection/delivery checks do not establish native understanding or large-history fit. |
| S086 / 86 | Preserve lineage/failures/uncertainty; attributable correction | `engine.mjs`, `worker.mjs`, `snapshot.mjs`; notice, negative-retention and snapshot tests; supplied outcome comparison | Software/Judgment: original dispositions/failed attempts remain; repair and observation references cannot relabel them or manufacture a causal improvement. |
| S090 / 90 | Identity, assets, notices and history survive rename/update/uninstall | company-local store, `engine.mjs`, `storage-transfer.mjs`; rename/version/transfer tests | Mixed: tested source paths; product/desktop uninstall behavior needs host-specific acceptance. |
| S092 / 92 | State outside caches; pinned definitions; explicit migration | `store.mjs`, `upgrade.mjs`, `storage-transfer.mjs`; runtime-version/transfer/upgrade tests | Software; unknown compatibility holds. |
| S094 / 94 | Independent reconstruction, explicit adoption, authority revocation | `handover.mjs`, `upgrade.mjs`; handover/upgrade/operating tests | Mixed: mechanical gates tested; actual-company large-history acceptance remains open. |
| S096 / 96 | Independently checked current meaning, applicable changes and selective history; no blind retry | tasks/supervisor, handover/operating/scoped context; task-runtime-crash, recovery, outcome and handover tests | Mixed: pending proposals/attempts and closure states survive; realistic bootstrap and actual CoS/worker model-session replacement remain separate native acceptance. Unknown obligations cannot be omitted. |
| S098 / 98 | Checked recoverable continuity, not universal uninterrupted sessions | checked handover/recovery APIs and documented host limits | Limited: no zero-downtime or universal-host promise. |
| S102 / 102 | Simplest sufficient implementation; narrower limits disclosed | existing record/runtime architecture; README and developer guide | Judgment/Limited: source review checks proportionality; no full-conformance inference from disclosure. |
| S104 / 104 | Observable failure/staleness/replacement checks; explicit rule adoption | full repository tests, native acceptance fixture, generated-governance check | Mixed: executed receipts and independent review below; open behavioral claims remain open. |

## Merged peer and storage evidence

The mission and enduring requirements remain unchanged. PR #49 added peer
ledger, authority/review and publication foundations; PR #51 added the bounded
storage core; PR #52/#53 corrected executor/fixture behavior. PR #55 added the
durable observation journal and its complete 130-case suite. PR #56 integrated
the storage transfer guard and real-link regression tests while retaining the
current version checks and portable path suite.

These are scoped source and executable checks, not complete peer-mode or
actual-company acceptance. The journal has no production scheduler caller in
this baseline. Scheduler composition, protected host enrollment and replacement,
production publication-policy qualification and durable continuity remain open.
The four acceptance gaps #13, #16, #18 and #30 below remain open. New successful
storage tests do not regrade the historical candidate-format comparison.

| Source | Completed checks | Exact scope |
|---|---|---|
| PR #55 head `d78c379` | [Source CI](https://github.com/yimoburu/soloco/actions/runs/42544202815): 1,348 Node 22 tests; [qualification](https://github.com/yimoburu/soloco/actions/runs/42544267521): 1,760 full Node 22 tests and 478 Node 26 compatibility tests | All 130 journal cases passed in each selected lane; zero failures, cancellations, skips or todos |
| PR #55 merge `aac2537` | [Post-merge Source CI](https://github.com/yimoburu/soloco/actions/runs/42545682958): 1,348 Node 22 tests, build/drift and gate | Actual merged checkout; full/compatibility counts above belong to the head with the identical tree |
| PR #56 head `a1e6294` | [Source CI](https://github.com/yimoburu/soloco/actions/runs/42547912998): 1,348 Node 22 tests; [qualification](https://github.com/yimoburu/soloco/actions/runs/42547915993): 1,760 full Node 22 tests and 478 Node 26 compatibility tests | All 45 storage cases passed in both Node 22 lanes; 29 selected storage cases passed in Node 26; zero failures, cancellations, skips or todos |
| PR #56 merge `4e9e434` | [Post-merge Source CI](https://github.com/yimoburu/soloco/actions/runs/42549433821): 1,348 Node 22 tests, build/drift and gate | Actual merged checkout; its tree equals the qualified head tree |

Counts across lanes overlap. These results do not establish installation,
company adoption, native-host behavior, human workload reduction or business
benefit. Historical failures, source pins and verdicts below remain retained.

## Earlier contradictions repaired

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

## Founder-benefit acceptance and closure rules

Use the existing [founder-benefit acceptance plan](founder-benefit-acceptance.md)
to predeclare task quality, time, cost and founder-effort targets before a trial.
Its rows distinguish software, native behavior, human observation and company
adoption. Unmeasured fields remain unknown and hold only the claim they support.

| Gap | Accountable work / evidence needed | Safe current boundary |
|---|---|---|
| Realistic context and successor understanding (#13) | Engineering prepares a scoped realistic-history fixture; independent QA must demonstrate preservation of distant constraints, negative evidence and next permitted action through full handover. | Unknown or oversized context remains held. Synthetic archive volume proves neither understanding nor native fit. |
| CoS judgment and founder effort (#16) | CoS/Research define representative paired/counterbalanced trials, including harmful parallelism and covered repairs; independent QA judges outcomes and recorded founder interventions. | Existing small evaluations are descriptive; no production workload/cost reduction claim. |
| Candidate-format comparison (#18) | Engineering/QA preserve the original blocked full-file controls; any newly authorized trial has fresh declared criteria and separate evidence. | No relabeling old Blocked trials or restored attempt allowance. |
| Native lifecycle and recovery (#30) | The bounded public-MCP producer → independent QA → receiver fixture passed at `19414e6`, including software-supervisor recovery. Claude parity also has separately pinned native evidence in `docs/claude-parity.md`; model-session replacement and actual company adoption still need separate evidence. | One attempt per task; failures/uncertainty retain evidence and prevent blind retry. |
| Host/external operations | Host-specific acceptance and a separately designed enforceable execution boundary before promising new capabilities. | Current company runtime exposes preparation and bounded local artifacts only. |

Software correction, native fixture acceptance and actual-company adoption are
separate outcomes. An open row cannot become Pass through a disclosure, test
count, or reviewer confidence. This candidate does not modify any actual company,
installed plugin, adopted rules, prior verdict, or attempt allowance.

## Historical validation and independent review

The retained [evidence package](../evals/spec-reconciliation-20261107/README.md)
records clean source pins, complete local test logs/counts, original failures,
sanitized native receipts and an independent source review. These are local
executed checks, not GitHub CI receipts or actual-company adoption.

- Final main integration at `46226dc`: Node 22 regression plus changed boundaries
  **814/814 passed**; Node 26 compatibility plus changed boundaries **459/459
  passed**. Both have zero failures/skips and unchanged clean source pins.
- Full Node 22.23.2: **1121/1121 passed**, zero failures/skips, on `9160c26`.
- Node 26.13.0 compatibility plus changed boundaries: **429/429 passed**, zero
  failures/skips, on `9160c26`.
- Integrated Node 22 regression plus changed boundaries: **780/780 passed**,
  zero failures/skips, on `c4fd3c5` before the final test-only correction.
- Build/governance drift, whitespace, and exact **47/47** SPEC-row coverage passed.
- Baseline regression evidence retains **13 failures and 1 pass**; the repaired
  invariant cases pass in the complete suite. Counts across suites overlap.

Final test receipts require unchanged clean before/after source pins. The final
passing TAPs also pass the repository's strict complete-plan/count parser. The historical
evidence/documentation commit at `70ade7b` changed no executable source after
`46226dc`. Its full suite was not repeated after merging Claude host parity;
its regression/compatibility checks cover that earlier integration. The later
v0.21 and combined-source validation must retain their own exact source pins.

The native fixture used three distinct Codex sessions requested as `gpt-6-astra`
(low effort for producer/receiver, medium for QA), as advertised by this host.
Effective provider settings remain unverified. Artifact generation, exact independent
review, receiver handoff and peer disposition passed; software-supervisor
interruption recovered without duplicate work, idle started no new jobs, and
native closure was confirmed. The successful fixture is pinned to `19414e6`;
the first integration to `9160c26` changed development receipt validation, its
format verifier, tests and documentation. The later Claude parity merge also
changed host handling and the worker prompt. No native rerun of `46226dc` is
claimed; the native result remains specific to `19414e6`.

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

## Current clarification and integration checks

The v0.21 change keeps the 47-row structure and the existing mission. It adds no
execution/spending authority, service, automatic adoption or release-time budget.
The generated governance must equal SPEC byte for byte. Frozen v0.20 fixture and
capability/grant checks preserve old pins instead of silently changing their rules.

PR #37's exact source `ff7225c` passed 1,128 full Node 22 tests and 74 affected
Node 26 checks, zero skips; its before/after probes demonstrate compulsory
retention of unknown speed metadata. Those results remain scoped to that source.
The founder-outcome source reports its original full-run failures and affected
reruns separately in [its implementation evidence](founder-outcome-implementation.md).
Neither historical package proves this combined contract's native understanding.

Final integration receipts must name the new clean source, completed checks and
remaining limits. Updating this ledger or publishing v0.21 cannot close the native
acceptance gaps or establish actual-company adoption.
