# SPEC v0.21 reconciliation

The historical assessment below covered main `94391ac` (PR #64, including PR #65
corrections) and compatible review-maintenance components on November 9, 2026 Pacific.
It retains the peer/storage, lossless transport, mechanical archive fence,
publication-policy, scheduler and test-preflight evidence with its original pins.
This includes the peer foundations, bounded storage core, executor/fixture fixes,
durable observation journal and storage transfer qualification described below.
The continuation composition in PR #78 is identified by its source graph and
validation receipts below. Those records retain their candidate scope separately
from the historical main pin.
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

The source follow-ups based on main through PR #74 add automatic retention-review
admission, exact deterministic geometry reuse, optional frozen delivery contracts,
one canonical local acceptance report, attributed receiver transitions and
read-only lifecycle observations. They support existing S014/S017/S028/S054,
S058/S068/S070/S072/S074/S084/S086 without changing a normative row or adopting
new company rules. Source/currentness and acceptance guards remain authoritative;
reports, caches, declarations and timing cannot grant authority or supply native
judgment. Their focused test roots are listed in
[current capabilities](current-capabilities.md). Existing native and historical
evidence below retains its original candidate and verdict. No new actual-company
continuity, founder-benefit, installation or adoption claim follows from these
source additions. See [implementation flow](implementation-speed.md) and
[acceptance/handoff interfaces](development-delivery.md).

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
| S070 / 70 | Honest Pass/Fail/Blocked; bounded repair and permitted next action | `worker.mjs`, `develop.mjs`, `tasks.mjs`; `spec-invariants`, `develop`, `test-preflight-recovery`, `tasks` tests | Software: Pass with explicit nonempty/malformed blockers rejected; omission remains legacy-compatible. Explicit preflight recovery retains the failed attempt and every generation charge; started or uncertain execution stays held. |
| S072 / 72 | Correct order of review, authorization, execution; exact candidate | `develop.mjs`, `prototype.mjs`, `handover.mjs`, `upgrade.mjs`; their lifecycle/negative tests | Software within declared workflows; no broader business grant implied. |
| S074 / 74 | Scoped reviewed artifacts; distinct generation/run/integration permissions | `develop.mjs`, `prototype.mjs`, `local-sandbox.mjs`; corresponding tests | Limited: retained local candidate and Node tests; source integration/deployment unsupported by company runtime. |
| S076 / 76 | Mandatory trust/professional review before exposure | legal/security roles; worker tools disabled; sandbox | Limited: professional advice/real external exposure not supported; no prompt substitutes for professional review. |
| S078 / 78 | Review value/economics/workload; maintain under current authority | skill/finance roles; `tools/outcome-observations.mjs`; [founder-benefit acceptance](founder-benefit-acceptance.md) | Limited/Judgment: supplied observations are attributable inputs; founder minutes, comparative costs, longitudinal value and business effect remain unmeasured. Live external business operations remain unavailable. |
| S082 / 82 | One authoritative home; consequential findings/dissent retained | `store.mjs`, `operating-state.mjs`, exact source APIs; operating/storage/invariant tests | Mixed: physical preservation tested; semantic home selection requires independent acceptance. |
| S084 / 84 | Complete usable current context; missing meaning holds | context/task/scoped/qualification modules, `worker.mjs`, `development-file-bodies.mjs`; invariant, task/scoped/qualification and file-body tests | Mixed: lossless file sharing preserves canonical context and all selected memberships; continuing notice conditions remain compulsory. Exact delivery checks do not establish native understanding or universal large-history fit. |
| S086 / 86 | Preserve lineage/failures/uncertainty; attributable correction | `engine.mjs`, `worker.mjs`, `snapshot.mjs`; notice, negative-retention and snapshot tests; supplied outcome comparison | Software/Judgment: original dispositions/failed attempts remain; repair and observation references cannot relabel them or manufacture a causal improvement. |
| S090 / 90 | Identity, assets, notices and history survive rename/update/uninstall | company-local store, `engine.mjs`, `storage-transfer.mjs`, `peers/migration.mjs`; rename/version/transfer and legacy-writer-fence tests | Mixed: tested source paths and mechanical archive protection; product/desktop uninstall behavior and actual-company adoption need separate acceptance. |
| S092 / 92 | State outside caches; pinned definitions; explicit migration | `store.mjs`, `upgrade.mjs`, `storage-transfer.mjs`, `peers/migration.mjs`; runtime-version/transfer/upgrade and legacy-writer-fence tests | Software within the scoped mechanical fence; production migration, protected identity and original obligation preservation remain unqualified. Unknown compatibility holds. |
| S094 / 94 | Independent reconstruction, explicit adoption, authority revocation | `handover.mjs`, `upgrade.mjs`; handover/upgrade/operating tests | Mixed: mechanical gates tested; actual-company large-history acceptance remains open. |
| S096 / 96 | Independently checked current meaning, applicable changes and selective history; no blind retry | tasks/supervisor, handover/operating/scoped context; task-runtime-crash, recovery, outcome and handover tests | Mixed: pending proposals/attempts and closure states survive; realistic bootstrap and actual CoS/worker model-session replacement remain separate native acceptance. Unknown obligations cannot be omitted. |
| S098 / 98 | Checked recoverable continuity, not universal uninterrupted sessions | checked handover/recovery APIs and documented host limits | Limited: no zero-downtime or universal-host promise. |
| S102 / 102 | Simplest sufficient implementation; narrower limits disclosed | existing record/runtime architecture; README and developer guide | Judgment/Limited: source review checks proportionality; no full-conformance inference from disclosure. |
| S104 / 104 | Observable failure/staleness/replacement checks; explicit rule adoption | full repository tests, native acceptance fixture, generated-governance check | Mixed: executed receipts and independent review below; open behavioral claims remain open. |

## Compatible review recovery maintenance

The new review-continuation path implements existing S014, S017, S028, S058,
S062, S068, S070, S072, S074, S084 and S086; it changes no normative row or
adopted company rule. A new current authorization binds one fresh independent
review and local acceptance to an unchanged historical candidate, actual test
receipt and retained failure evidence. The old scope remains expired, its
spent generations and consumed recovery remain charged, and its unclosed
review session retains its reservation. Historical execution is not relabeled
as execution under the new runtime. Generation, testing, recovery, integration
and business action require their own applicable authority.

New opt-in code-QA windows retain one fixed absolute deadline across all READ
continuations and judgment, with bounded individual calls and a grant cutoff.
Publication checks the QA cutoff immediately before SQLite COMMIT, after
storage/event writes. Later acceptance checks timely historical review,
confirmed closure, exact provenance, current authority and the separate grant;
it does not revive the earlier attempt. No hard real-time COMMIT completion or
provider-termination guarantee follows from a software cutoff.

The delivery ledger distinguishes retrieval from a valid response by the same
native session. A Pass requires whole inline evidence or a hash-checked whole
READ interval union. A continuation-aware outer transport keeps the new
review target distinct from its historical receipt and restores the exact
original canonical context. Physical native delivery needs its own audit;
transport roundtrip and response bookkeeping do not prove understanding or
retention after compaction.

Within an explicit code-QA window, frozen references to initially supplied
records permit optional re-reading. The original ID, revision and full-record
hash must still match the current source. Native identity, four-range requests,
sixteen rounds and 32,768-character ranges remain enforced. Availability of
these reads does not establish that recovery after compaction fits those bounds.

Private original-ChildProcess observers retain late close evidence after a
timeout. Typed, attributable storage history permits separate idempotent
closure reconciliation without changing the failed result or reviving output.
This proves the direct CLI child's closure only. Missing historical birth/close
evidence, descendant closure, actual peer-host enrollment, company adoption
and the complete peer architecture remain unqualified by these components.

The frozen source preparation covers 204 nonoverlapping controlled conditions
across three recorded executions: twelve whole roots with 185 passes, the
corrected whole 15-case timeout VM root, and the new whole four-case grant
regression root. This is not one final all-green aggregate or full-repository
qualification. The VM correction imports its real module dependency; original
assertions remain. Earlier failed/incomplete runs and their uncertainty remain
retained. Final integration and hosted checks are reported separately.

The later inline re-read component has 115 passing controlled conditions across
seven whole roots on its frozen tuple. The combined worker and fixture batching
tuple passes the whole 35-case operating-state root. These are separate runs;
complete hosted qualification must cover the final committed integration.

See `development-review-continuation.md` and `ordinary-model-process-closure.md`
for supported calls and limits. These source changes enabled the separate P4
review and local acceptance described below. Actual managed-CoS adoption,
SPEC v0.22 and the proposed peer architecture still require their separate
reconciliation and acceptance.

## Review after loss of primary evidence

A separate one-use retention-review ticket binds a live original grant, exact
unchanged candidate, genuine non-reused passing receipt and a closed independent
Blocked review. It preserves the original review and adverse history. Ordinary
acceptance remains blocked without the exact separately checked clearing
judgment; other adverse candidate evidence continues to hold the work.

The worker completes the required historical reads, then supplies the whole
current governing controls, original sources, candidate, runtime receipt and
prior review together in one deterministic primary frame. Lossless aliases must
restore the exact canonical values. The runtime checks currentness before
sending and after the call closes, records actual same-native delivery, and
requires a verdict-only response afterward. Missing, changed, oversized or
uncertain evidence holds; a model-supplied acknowledgment grants no permission.
Ambiguous model JSON, including duplicate object keys, is rejected before
normalization. A review's own published notices and messages remain recorded
without invalidating its input snapshot; other jobs' changes remain current.

Controlled source tests exercise lifecycle, parser, transport, expiry and commit
boundaries. They do not establish a real native semantic Pass. Actual review and
owner acceptance remain necessary for the named candidate. The ticket grants no
new generation, test, recovery, validation reuse, refund, source integration or
expiry extension. SPEC, governing pins and company adoption remain unchanged.
See `development-retention-review.md` for the exact supported workflow.

## Portable protected companion source dependency

The repository now contains the separate `native/codex/` source recipe. It pins
upstream Codex commit `c40729ea5cf8e947481b130c59807273eda2f8e9`, the complete
9,264-file regular Rust source inventory, 41 exact companion overlay files, the
accepted offline Cargo lock and the official Rust 1.95.0 macOS arm64 toolchain.
The source-owned manifest hash is checked before copying inputs or creating an
output. Upstream attribution is retained. CI verifies the actual payload and
runs the 47 pure temporary-data checks as required build checks.

This is source delivery for existing S009, S018, S058, S062, S068, S070, S084,
S092 and S104 boundaries. It changes no normative row, company governance pin,
accepted operating state or installed runtime. The V5 build policy adds only a literal read of the fixed root-owned system
OpenSSL config, with exact bytes/metadata checked before output and after build.
Its pinned Cargo/Rustc version checks passed; original V4 Cargo startup denial
remains a retained failure. The V6 build recipe derives the compiler association
from a deterministic manifest of all validated Rust source inputs. The plan
and receipt retain its exact artifact; a caller hash cannot select the identity.
This closes a source-producer gap without qualifying or running a binary. The V7 recipe separately pins the
observed selected Xcode/SDK tools and metadata, preserves their user-owned
input boundary, and holds on mismatched selection or pins. Its one std-only
compile/link/execute control passed; that is separate from a Codex build or
native qualification. The earlier SDK-denial failure remains recorded. Source preparation and an
explicit confined offline build are distinct operations; neither installs or
qualifies the companion. The qualified binary slot remains empty. Full runtime
composition, actual build receipts, independent native host/account acceptance,
continuity and the peer acceptance matrix remain separate requirements.

The delivered V4 policy passed controlled startup and 19-case file, loopback and
owned-child checks on the observed macOS host. Baseline, confined and Data-volume
alias runs overlap; they are not 57 distinct cases or proof of Cargo/native
compatibility. Earlier pre-main aborts remain failures. The complete pinned
source recipe and its supported limits are documented in
[`native/codex/README.md`](../native/codex/README.md).

## Original session and instruction source provenance

The original-provenance source component extends the mechanical checks for
S014, S018, S028, S058, S068, S070, S072, S074, S084 and S086. Actual Core
admission owns typed user input and its materialization. Private Session and
ModelClient ownership bind supported original instruction renderers, live
history occurrences and the exact final wire transformation. Runtime-only
witnesses do not survive serialization or acquire authority from matching text.

The explicit protected scoped profile selects nonincremental tools and checks
the actual effective feature set, including after configuration reload. It
supports the genuine fresh RLite prefix encoder with the complete fixed
five-tool inventory; immutable model catalog fields and original managed auth
remain separate. See [the source profile](native-peer-source-profile.md) for
producer boundaries and exact unsupported histories.

Source preparation does not establish end-to-end operation. Default incremental
tool history, model responses, tool results, restored/compacted ancestry, media
and unresolved instruction producers remain held. Original normal-host account
and OS mode, a qualified binary, actual peer reconstruction and company adoption
still require their applicable source implementation and acceptance. A source
profile or a fresh-request test cannot close S005, S020, S024, S094 or S096.

The earlier component typecheck failed because a flattened rollout line did not
implement the requested deserialization trait. Its failed result is retained.
The joined source reuses the original complete rollout decoder for both the
reader and provenance validator; it does not substitute a reduced history
shape. A later typecheck reached the original reader and found a borrowed-path
lifetime error in its blocking callback. The repair retains an owned copy of the
same path; both failed runs remain recorded. The new source tuple requires its
own compilation and affected tests.

A subsequent ordinary Core typecheck reported E0603 because the renderer
referenced `ResponseItemId` through a private module import. The source repair
uses the existing public crate-root export in production and in the matching
test import. Separately, source review—not a failed execution—identified witness
cleanup changing ordinary envelopes from absent metadata to an empty metadata
value. Cleanup now clears only existing metadata; a new plain-envelope
regression covers both history routes without supplying a renderer capsule.

The ordinary check of all nine affected libraries passed on source vector
`f48b1619d8bf858c20583dacb718433955a2ebe3ae95977bb04cd1cde0538dd4`.
Both original processes closed, and complete source/toolchain integrity checks
passed. The following eight-library test compilation with `--no-run` failed
with eleven test-code errors: five ambiguous macro uses, two uses of an
unsupported envelope serialization interface, and four project-document fixture
initializers missing new provenance fields. The extension target did not start,
and no Rust test executed.

The repair changes only three test files. It explicitly imports the existing
assertion macro, uses the real durable `RolloutItem` adapter, and derives fixture
metadata from declared original and consumed bytes. Prior assertions and all
110 authored definitions remain; the invalid-UTF-8 check is strengthened.
Production source bytes remain unchanged. The complete input graph nevertheless
has a new source vector, `59398124268e7be3f4dd32a1a18eb1878ffc922029e29ddc37d15fc01c3c5149`,
and requires its own package and compiled-input manifest identities.

That package passed 49 pure Python checks and source verification. Its next
ordinary test build linked six library test executables, then failed with two
envelope serialization errors in a history fixture. The extension target did
not start, and no test executed. All original processes closed and source,
toolchain and platform checks passed; the failed run remains recorded.

The additional repair changes only that history test to use the same durable
`RolloutItem` adapter. Private-witness replay and value-equality assertions remain
intact. Production bytes and all 110 definitions are unchanged. The new complete
source vector is
`009d905360ddd1a900947dcf12fdfa656e2a64e1fed14f7aa51780aff92f77e5`.
Its package passed 49 unchanged pure Python checks and source verification.
The eight ordinary library harnesses and whole extension harness then compiled,
and the three required local helper executables built successfully. The same
nine test harnesses also compiled under the protected build environment and its
original compiled-input association. These are compilation results, with no test
execution or qualified executable implied. The ordinary harness receipt is
`ae63816e54008144fc99930ea250a98f1920771844a6205635dacf2a02bb15e9`, helper receipt
`21b4c51e5d05667041a5f5b942dad9944c91e841bcad057b3088a426679fbdd4`, and protected
test-build receipt
`51046670fe42b76e8239444bd3f5b69c96c3a23624ca9fb50e09c20506a108ee`.

The first ordinary whole-nine-root execution (V5) aborted in the app-server
harness with a stack overflow. V6 used the pinned upstream 8 MiB test-stack
baseline: app-server completed with 432 passed and six failed, API with 231 passed
and one failed, and config with 414 passed. Core subsequently aborted with another
stack overflow before its whole-root summary. Its fourteen world-state snapshots
and a guardian snapshot also failed to read their baked-in earlier source paths
under the test domain. Those denied reads did not compare snapshot contents.
Both executions remain failures; the remaining roots did not run and no complete
110-case authored or whole-nine-root pass is claimed. The retained V5 and V6
receipts are `d7ad8eb4947eeb26d32fc35a8c5641a97170907a2b7e8bf58353967254f65a2d` and
`42733b94285d310f378d29666b0b63fecd4c86f7634ae3eb81c7b863df941947`.
Protected positive execution, a qualified executable and native CoS acceptance
remain pending. The continuation below is a different source graph. No normative
SPEC row or adopted company rule changes.

## Controlled P4 code acceptance

The exact retained P4 candidate passed its canonical 326-case execution and a
distinct native independent code review under a new bounded review-only
authorization. The physical-delivery audit verified the 71 whole inline
records and complete 88-source required manifest, with 62 requested ranges
matched to successful delivery and actual USER frames. All 17 CLI invocations
closed before the fixed review deadline; the owner then accepted that exact
candidate and historical receipt once.

The integrated component consumes typed P2 publication evidence and checks the
current task, grant, policy, source subject, reviews and atomic candidate.
Its three whole roots are GitHub98, atomic132 and policy96. Ordinary repository
integration checks and hosted CI remain distinct from the historical canonical
execution and native judgment. No original generation, recovery, expiry,
failed review or unknown reservation was reset.

This is controlled library/source evidence. It does not establish a genuine
account or protected host publisher, full peer routing, company adoption,
durable continuity or observed founder benefit.

## Controlled P8a pending-membership component

A distinct standalone Engineering session adopted four scoped, externally
prepared source changes. Its nine-file candidate passed a fresh confined run
of the four complete membership, legacy-readiness, publication-policy and
provider-error roots: 179 cases, comprising all 177 original cases and two
added regression families. No failures, cancellations, skips or output
truncation occurred. Independent native QA and owner acceptance must bind this
exact candidate and runtime receipt before integration. Their outcomes are
retained separately from the test run.

The library separates pending reconstruction and provisional review from active
business membership. It retains shared allowance, attempts, reservations,
attributable outputs, independence and currentness checks, and atomic activation
or replacement. An own imported legacy marker, including standalone
`legacy_ready`, holds fresh admission without treating nested opaque user data
as an import marker. Provider-origin errors propagate unchanged instead of
being committed as ordinary completion quarantine; genuine local expiry keeps
its existing raw-output and closure handling.

These controls are source and component evidence. The synthetic host observations
and trusted constructor boundaries do not prove operator authentication, actual
protected host enrollment, company migration, durable replacement continuity or
the complete peer architecture. The original two held Engineering generations
remain spent; their failures and notices survive. The third generation consumed
the remaining allowance. No new generation, recovery, expiry or unknown-session
reset follows from passing tests. SPEC and governance adoption remain separate.

## Merged peer and storage evidence

The mission and enduring requirements remain unchanged. PR #49 added peer
ledger, authority/review and publication foundations; PR #51 added the bounded
storage core; PR #52/#53 corrected executor/fixture behavior. PR #55 added the
durable observation journal and its complete 130-case suite. PR #56 integrated
the storage transfer guard and real-link regression tests while retaining the
current version checks and portable path suite.

These are scoped source and executable checks, not complete peer-mode or
actual-company acceptance. The scheduler library consumes the journal and
current model. The later source-level `company_peers` route is described in
[peer production routing](peer-production-runtime.md). Actual protected host
enrollment and replacement, native publication-policy qualification and durable
company continuity remain open.
The four acceptance gaps #13, #16, #18 and #30 below remain open. New successful
storage tests do not regrade the historical candidate-format comparison.

The mechanical legacy-writer fence adds persistent SQL archive guards before
schema/layout work, checked layout transition, backup retention and rollback.
Its complete 49-case suite exercises the exact historical writer, already-open
handles, prepared statements and preexisting input-schema triggers. A native
Engineer adopted the external source unchanged; a fresh confined 49-case run,
independent native QA and receiver acceptance qualify that retained component.
The original writer fixture remains an exact test asset. No production company
migration or resume, protected host enrollment, allowance conversion or new
spending is authorized by this component. Current company rules stay pinned.

The peer model now exposes protected, read-only publication-policy evidence with
fresh authority, capacity and historical participant identities, a final uncached
owning-snapshot check and a common expiry cutoff. Provider-origin admission
errors retain their original Error/cause/AggregateError identities before any
semantic-denial classification; genuine semantic denials remain durable.
An external source candidate was adopted unchanged by a native Engineer and
passed the complete policy91 and provider15 roots in a fresh 106-case confined
run, independent native QA and receiver acceptance. The original model98 root
remains unchanged and passed in the whole ordinary 204-case regression run.
These overlapping counts qualify the local library component. Production
publisher consumption needs separate acceptance; the earlier scheduler QA Fail
retains its verdict.

The corrected scheduler component preserves all 130 journal and 69 scheduler
cases and adds three recovery cases against the actual admission provider path.
A native Engineer adopted the external source unchanged. A fresh confined run
passed all 202 cases; a distinct native QA returned Pass, followed by owner
acceptance. Complete source and assessment delivery to that review is evidenced.
The host recorded one compaction before the verdict. The accepted scope has no
zero-compaction condition; acceptance claims neither guaranteed final-turn
retention nor semantic loss from that event. This bounded component result does
not qualify the host transport generally. The original failed scheduler review
and historical held attempts remain unchanged. Protected enrollment, qualified
production operation, actual-company adoption and durable continuity require their own
acceptance. The component guide retains its original preparation framing;
this section records the later native qualification.

The compatible test-controller extension adds explicit diagnostics and one-use
recovery for a canonically proven pre-execution fingerprint failure. A protected
legacy target supplies the complete historical runtime and installation evidence
for a distinct native qualification review. That review can qualify the failure
stage; it cannot accept candidate code. Recovery preserves the original valid
grant, source bytes, expiry, failed receipt and spent generations. A fresh
canonical test result and separate independent code QA still precede acceptance.
Currentness and uncertainty are rechecked throughout the run. Directory reads
precede the final pure expiry checks at receipt publication and acceptance.

All eight affected test roots passed in a complete 230-case ordinary SDK run
on the initial source. Later privacy and software-job corrections have separate
focused checks; final-tree hosted results are recorded with the pull request.
Two causal expiry failures and earlier failed/incomplete runs remain recorded.
Diagnostics retain typed/hash-only errors and remain software in usage and
progress views. These are controlled source regressions, separate from a native legacy
qualification, live worker diagnostic, recovered candidate execution or company
acceptance. The historical fingerprint subcause remains unknown. SPEC v0.21,
the adopted team and runtime release version are unchanged; see
`test-preflight-recovery.md` for the supported protocol and limits.

| Source | Completed checks | Exact scope |
|---|---|---|
| PR #55 head `d78c379` | [Source CI](https://github.com/yimoburu/soloco/actions/runs/42544202815): 1,348 Node 22 tests; [qualification](https://github.com/yimoburu/soloco/actions/runs/42544267521): 1,760 full Node 22 tests and 478 Node 26 compatibility tests | All 130 journal cases passed in each selected lane; zero failures, cancellations, skips or todos |
| PR #55 merge `aac2537` | [Post-merge Source CI](https://github.com/yimoburu/soloco/actions/runs/42545682958): 1,348 Node 22 tests, build/drift and gate | Actual merged checkout; full/compatibility counts above belong to the head with the identical tree |
| PR #56 head `a1e6294` | [Source CI](https://github.com/yimoburu/soloco/actions/runs/42547912998): 1,348 Node 22 tests; [qualification](https://github.com/yimoburu/soloco/actions/runs/42547915993): 1,760 full Node 22 tests and 478 Node 26 compatibility tests | All 45 storage cases passed in both Node 22 lanes; 29 selected storage cases passed in Node 26; zero failures, cancellations, skips or todos |
| PR #56 merge `4e9e434` | [Post-merge Source CI](https://github.com/yimoburu/soloco/actions/runs/42549433821): 1,348 Node 22 tests, build/drift and gate | Actual merged checkout; its tree equals the qualified head tree |
| PR #61 head `2cc37e0` | [Source CI](https://github.com/yimoburu/soloco/actions/runs/42693268997): 1,606 Node 22 tests; [qualification](https://github.com/yimoburu/soloco/actions/runs/42693323026): 2,018 full Node 22 tests and 736 Node 26 compatibility tests | All 202 journal/scheduler cases passed in each selected lane; zero failures, cancellations, skips or todos |
| PR #61 merge `3d65268` | [Post-merge Source CI](https://github.com/yimoburu/soloco/actions/runs/42695347401): 1,606 Node 22 tests, build/drift and gate | Actual merged checkout with the identical qualified head tree; native 202-case qualification remains separate |
| PR #62 head `d46cf4d` | [Source CI](https://github.com/yimoburu/soloco/actions/runs/42716095177): 1,715 Node 22 tests; [qualification](https://github.com/yimoburu/soloco/actions/runs/42716104684): 2,127 full Node 22 tests and 845 Node 26 compatibility tests | Exact reviewed recovery source; zero failures, cancellations, skips or todos |
| PR #62 merge `c8c317c` | [Post-merge Source CI](https://github.com/yimoburu/soloco/actions/runs/42718592217): 1,715 Node 22 tests, build/drift and gate | Actual merged checkout with the identical qualified head tree; live operations require their own evidence |
| PR #64 head `ec468e6` | [Source CI](https://github.com/yimoburu/soloco/actions/runs/42731657838): 1,811 Node 22 tests; [qualification](https://github.com/yimoburu/soloco/actions/runs/42731706910): 2,223 full Node 22 tests and 941 Node 26 compatibility tests | Exact combined receipt-sharing and specialist-correction head; zero failures, cancellations, skips or todos |
| PR #64 merge `94391ac` | [Post-merge Source CI](https://github.com/yimoburu/soloco/actions/runs/42734123287): 1,811 Node 22 tests, build/drift and gate | Actual merged checkout with the identical qualified tree; this does not establish native code acceptance or peer operation |

Counts across lanes overlap. These results do not establish installation,
company adoption, native-host behavior, human workload reduction or business
benefit. Historical failures, source pins and verdicts below remain retained.

The bounded lossless development-review component passed 31 canonical confined
tests and fresh independent native QA. Its exact changed source also passed 112
ordinary tests across five whole roots and 11 controlled worker fixtures;
these counts overlap. The worker shares only identical complete file strings
for applicable development QA, validates them before fallback and verifies
exact restoration. Both complete-prompt UTF-16 and UTF-8 sizes must strictly
decrease after including the actual explanation. Canonical selection, records, assignment
hashes, currentness and limits remain unchanged. This does not establish active
package installation, full native worker lifecycle, provider capacity, peer-mode
or durable continuity qualification.

The compatible receipt extension removes one duplicate serialized value from
the current runtime test receipt when its content is exactly the JSON spelling
of its complete literal result. A closed registry binds the record identity,
serialization and commitments. Restoration checks the original canonical
context through the existing file-body codec. Prior failures, other records and
unequal content retain their full representations. The worker references the
whole task already in context only when it exactly matches the outer task;
the original complete-template fallback and both size checks remain.

Complete file-body31, receipt10 and timeout-wiring15 roots passed 56 ordinary
source checks with exact before/after source bindings. The timeout harness uses
the new renderer and retains its existing purposes. Canonical context hashing,
authority, expiry, attempts, validation providers and acceptance checks are
unchanged. Source checks and saved-frame measurements remain separate from
fresh installed packet fit, native semantic review and company acceptance.

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

## Continuation source evidence

The historical A558 continuation subject implements source mechanics for live response
and fixed-tool history, and context acknowledgement by the same scoped owner.
It preserves private origin checks, exact supported wire mappings, fresh send
fences and uncertain outcomes. That package contains 152 overlays and
9,307 logical Rust files, totaling 92,049,762 bytes, with source vector
`a558137845eb0e49259ffc67408e3ac4edbeb273d57a37fe687fbd7b1294f56f` and package digest
`cd43a6ff2b6564bfc2c1c2d8eec76f1d4498375696578970b533343c5f65e351`.

The preceding continuation graph, vector
`ae174eeb450a3ceafafe4a6ebadf59b0eb71477098afaedfa1a27078fb92c693` with package
`4453e55b86e607fecc2383fe2643b281a01e482df5872564ea3294f29edd680e`, failed its
first ordinary test-compilation group with one E0061 error: a legacy plan-mode
test supplied seven arguments after its callee gained an eighth optional original
response argument. The extension and companion-bin harness phases did not start,
and no Rust tests executed. All original processes closed; source, toolchain and
platform postchecks passed. The retained failed receipt is
`38bffa3a96bb4462b15a50ec9d716c9475e2390eebd208c5302592eb9daf9aaf`.

Its three test-fixture changes carry the existing managed-config isolation
override through initial configuration and reload, use that helper for the
provider fixture, and retain the positive API fixture's real caller owner.
Production source, all assertions and all 163 authored definitions remain intact.
The additional legacy plan-mode fixture now passes `None` for that optional
argument: it has no original response receipt. Actual production calls already
pass their captured original output; production provenance guards are unchanged.
This same a558 graph subsequently exposed a stale ordinary compilation-cache
variant. The first 13 library harnesses compiled, but the extension phase failed
with E0432/E0433 after Cargo reused an older normal `codex-protocol` variant whose
relative dep-info omitted `original_exchange`; the companion-bin phase did not
start. The failed receipt
`2e3c6398a769401cf1270331baf79b02749eb52057c041297b87c707430b1164` and separate
cache readback `450ed3a3b5b2b3264d8c8533562aac09eff36afa19559f0bc120bb3720543f64`
retain that partial result and its completed process/input postchecks.

The repair changed only timestamps in the mutable source copy, leaving every
source byte, mode, inode and link count intact. The original builder verified all
9,307 source bodies and membership once afterward. Barrier receipt
`cd069879d2223066fb55e3ac3c8a202494412e709ca2d290cf3c061bcea9c415` and physical proof
`7b58a6f271d42787c6944e8c5dbcf3db1063f389dad771d92ab7f3e15892cb94` retain that
metadata-only change. The logical a558 graph, CD43 package and canonical compiled-input
manifest `3e97a06e5f5ab9f3b2273aa1626726b527f0cdbabfed3f4374afdf608d2ad0ee` are unchanged.
No source repair, feature change, cache deletion or governance adoption follows
from that timestamp operation.

The next ordinary build completed all 13 library harnesses, the whole extension
harness and the companion-bin unit-test harness, with receipt
`85777abc2f82578b204d5925ec6f13018cafaf285b471a5dc8f3eab313fc32fd`.
Separate Root readback
`fc60ab9836da02d9729169b17d49da19e0d2b7440e6d39f9e81863bcd3ec2f7a` confirmed that the
normal protocol variant was rebuilt (`fresh:false`) and its actual dep-info
included `original_exchange`; freshness was not inferred from the timestamp.
The three fresh normal helpers then compiled with receipt
`99870a67aa1be206eee7399197f72e83567d7a944d1cd50e04b28e0eb2899d67` and separate Root
closed-input readback
`15ded8203fa1dae67e6313bfb379cbf6ffcbf58b13ff68238f9ee32301420785`.
All original compiler processes closed and source, toolchain and platform
postchecks passed. These are compilation results, not Rust test results.

All 18 ordinary executables were staged read-only outside the mutable compiler
target. Parent-held descriptor verification bound the copies, totaling
2,981,329,672 bytes, in checkpoint
`b33d90f4be7488d71f5dcf193a91618ee843001da413ae28a18b64d4d9859098`.
The ordinary run passed three complete roots (application server 438, API 275,
configuration 414), then Core aborted in the guardian retry fixture. Its explicit
4 MiB inner thread overrode the declared 32 MiB environment setting. Receipt
`8323b0e6a1b31b022842731ef58b49f3f7c6fc57335bb48a5e9cd75a0aba0a5f` retains the
abort, missing Core summary and eleven unrun roots. Source, toolchain, platform,
snapshot, staged-file and original-process closure checks passed.

Protected compilation completed 15 test harnesses and the separate normal
production companion binary, receipt
`c5d423b8ffa46fa0ea5bcc15f154bec8346b6711bb73e92769044de5b6247efa`.
Root readback `9c0094e1211b770c177c947f2e6f4d972f142088ec8700ffbc8885ca04a78058`
retains the eight logs and actual API unit/normal-library compile flags.
All 25 whole-module/extension selections then executed 179 cases: 161 passed and
18 failed in the model-catalog and model-provider paths. Receipt
`9c911c0e0577574a58f072999a4da028f6b02c7ff5481ea5baaceac6e21d57fe` retains this
failed result; all process, source, platform and staged-file postchecks passed.
Root rehashed all 58 logs across both executions in
`a05af0ad8289a121fc86e2635c33342141d2551d99cc32656b87abeef8108978`.

The intended private original-catalogue producer was blocked by the generic
protected non-Responses guard. That failure and the guardian stack overflow led
to the separate coherent candidate described below. The A558 results retain
their original scope and do not qualify the successor.

Earlier graph hashes and receipts retain their historical scope and do not
qualify later graphs. The source-only verifier for the A558 package exited
successfully; the 49-case Python evidence is parent-scoped, with no new run
claimed for this tuple. Source-pinned authoring metadata retains its original meaning.

### Parent 45a continuation evidence

The retained PR #78 parent has 153 overlays and 166 portable payloads composing
9,307 logical Rust files and 92,058,140 bytes. Its source vector is
`45a95bd839ffbc662a318f94c490f4c6ae548dc8ae1c734b7655657b6bf77a54`, package digest
`965f08805e6d71a7df9030a02906d181da871f7e83682df3604eddfebb42f703`, and original builder digest
`c180a867995bebfe75e494ec527d395d6b3d451fbda625da4598f1677b598ad1`.
The separate canonical and portable source reviews cleared this composition;
the source-only package verifier exited successfully once, with no new 49-case run.

Three source paths differ from A558. The guardian test's inner thread now reads
valid `RUST_MIN_STACK` as `usize`, retaining its original 4 MiB fallback and minimum.
The private Session models GET path requires a bodyless GET and checks the actual
post-auth method, exact URL, body and response limit before transport. ModelsClient
uses that path and adds six regression definitions. All previous 163 authored
definitions and assertions, including the model-provider/default-catalogue auth,
cache and ownership checks, are preserved; that parent total is 169.

Generic protected non-Responses execution still Holds. Catalogue GET admission
permits transport only; it does not confer original instruction or catalogue
authority. The private default-catalogue bindings and current auth checks remain
required, and the provider-base/renderer qualification boundary remains Held.

The actual three-file source application exited successfully. Full-source proof
`ea4c84f5b614ec31e8cf7ea39650c3863f10081b81f2c224d77bdffb99d881a8` records the
verified graph and preserved metadata for the other 9,304 files. The original
builder produced Rust-only compiled-input manifest DATA
`a8c72c5c43e4865a6468b4d6d01ff25be57e5b35a6d817562f0f9665d1c32ce6`.
That manifest is input data, not a compiled binary or runtime capability.

Ordinary compilation closed successfully for all 15 test harnesses, each with
`profile.test=true`. Its 65,077-byte receipt is
`b203c235d5495cc7e4eab154e75d9a21fec7a22ed9fb908c263ae198e5ed30e0`, retained at
`root-bound-coherent45a-ordinary-fifteen-no-run-v1/parent-evidence/ordinary-typechecks/ACTUAL.DATA.json`.
That build executed no Rust tests. The three fresh normal helpers then compiled
successfully with `profile.test=false`; their 20,045-byte receipt is
`7e4617e7c957091503504c475a7ceffbb31165abd2e3703d9f758369cdb4a2ba`, retained at
`root-bound-coherent45a-three-helper-build-v1/helper-build-v1/parent-evidence/ordinary-local-helpers/ACTUAL.DATA.json`.
Both exact receipt bodies were verified against these hashes and the parent
45a source vector. All original processes, output streams and groups closed;
source, toolchain and platform postchecks passed.

Protected compilation then passed for 15 test harnesses and one normal production
binary, with 76,547-byte receipt
`9db95ef79ffd896d9abee04e338cbc36df0da3152fa87816ca1063b746ea1a33` at
`root-bound-coherent45a-protected-build-v1/parent-evidence/protected-builds/ACTUAL.DATA.json`.
All 25 protected whole-module/extension selections passed: 185 cases, including
all 169 authored definitions once and 16 preserved baseline cases, with zero
failures. The 168,369-byte execution receipt is
`6c18b5700ff631e0585c8816d17ffbbadb23a65a949cbffe5da6268e825d51d8` at
`root-bound-coherent45a-protected-module-execution-v1/actual-protected-modules-v1/evidence/ACTUAL.DATA.json`.
Original process/stream/group closure and source, toolchain, platform, historical
snapshot and sealed-file postchecks passed. The separate normal production
binary was sealed as an unqualified component and was not executed.

The first 45a ordinary whole-root run used runtime helper DAA4 and closed Held at
the original 3,590-second operation cutoff. Three complete roots passed
(application server 438, API 281, configuration 414); Core supplied no final
summary and eleven later roots did not run. The 251,197-byte receipt is
`c733ac777047e63be6fcb188106f2d90f1ecee3808dcb968a2b83a678c062a53` at
`root-bound-coherent45a-ordinary15-execution-v1/actual-ordinary-v1/evidence/ACTUAL.DATA.json`.
The original controller sent one SIGKILL while its Core child remained unreaped;
exit -9, complete output EOF, reaping and group absence were observed within the
original final deadline. Read-only postchecks finished at 12:02:21 UTC on
November 11, 2026: source, toolchain, SDK, historical snapshots and sealed files
were unchanged. This remains a failed ordinary attempt, not a 169-check Pass.

A separate Python-only paired fixture then compared unchanged DAA4 with reviewed
runtime helper BB6D. The 10,239-byte receipt is
`ef478332d4327b0708c3fa1377d261ccd5f87b936984d26e76ae832dc2a236b2` at
`root-coherent45a-python-hook-paired-probe-preparation-v1/actual-paired/evidence/ACTUAL.DATA.json`.
DAA4's actual dyld diagnostic reported a sandbox-blocked open of the selected
Xcode `Python3.framework/Versions/3.9/Python3`. BB6D produced the original fixture's
expected allow JSON and exact input log. Both owned processes closed completely;
the pair took 2.5976 seconds. The policy change adds only read/map access to the
selected Xcode Python alias/framework and literal ancestor traversal. Product
source, compiler inputs, binaries, network/write rules and native authority did
not change.

The paired result strongly supports the missing Python grant as the cause of the
old hook wait; it does not establish an actual Core `HookCompleted` event or a
passing whole Core root. At the November 11, 2026, 12:02 UTC checkpoint, a fresh
BB6D whole-15-root run was active (session 91300, preflight/staging); this checkpoint
claims no corrected whole-suite Pass. [PR #78](https://github.com/yimoburu/soloco/pull/78)
tracks the exact current-head ordinary-suite result and acceptance. The run uses verified read-only
ordinary execution copies; the 45a source and compiler receipts above are unchanged.
The shared mutable compiler target now contains protected outputs and supplies no
ordinary execution identity. The older A558 failures and this DAA4 Hold retain
their original scopes; source-pinned authoring metadata retains its as-created meaning.

Package checks, source review, compilation and staging do not change a SPEC
acceptance row to passed. Whole local test roots, protected positive cases, genuine
Core/native execution, Node integration, account and corpus qualification,
continuity and company adoption retain their separate evidence requirements.
This change does not add the Node TaskHost, matching frame interpreter or static
build-descriptor/private-FD adapter. A coherent adapter must bind the exact
resource, request profile, Rust source, compiled-input manifest and executable;
an original positive startup and continuation must then establish that join.
Separate controlled Node mechanics cannot substitute for those producers.
The qualified executable and runtime slots remain empty. Historical compilation
and failed test-build receipts retain their exact original source scope.


The later independent parent 45a ordinary assessment is
`9e4862a37fba77a522c2f9651cdda5cdd5da8c8d1382ec6469bb7ba3f984b8cc`
(7,185 bytes), retained at
`root-independent-current45a-source-recipe-readiness-assessment-v1/assessment.DATA.json`.
Its 107,360-byte ordinary observation union,
`26a22a540ec90dae7e72e610d8910350160417be949536348c91deab7b2a0ba3`, is retained at
`root-independent-current45a-source-recipe-readiness-assessment-v1/ordinary-authored169-union.DATA.json`.
It verifies 169 distinct authored observations once: 97 from the first three roots,
40 from Core, and 32 from the remaining eleven roots, with no missing/extra/overlap.
All 21 baseline failures remain recorded; this union is not a whole-15 Pass.
The independent protected readback is
`d614d2ac9a2cff75be10be69f67bb3916b4289a7d20e307ff930e8dc83981bb1`
(95,743 bytes) at
`root-independent-current45a-protected25-result-readback-v1/review.DATA.json`;
it verifies the parent's 25 selections, 185 cases and all 169 authored checks above.

The separate seven-case setup diagnostic completed within its original 300-second
whole limit. Every exact existing case passed, original processes/streams/groups
closed, and source/toolchain/SDK/sealed-input postchecks passed. Receipt
`d57c3ebb19039989d885abd289ad816ed6d25ef5c6ee8b09cf172fc4f55c0d1f`
(23,129 bytes) is at
`root-coherent45a-seven-setup-case-diagnostics-preparation-v1/actual-seven/evidence/ACTUAL.DATA.json`.
Those observations use parent 45a and retain the original failed baseline cases;
they do not imply a rerun or full-suite acceptance of the successor.

### Current coherent continuation candidate

This section retains the dated PR #78 parent checkpoint. The executable bridge
successor below supersedes its missing-adapter source assessment; all parent
failures, receipts and qualification limits keep their original meaning.

At the November 11, 2026 source checkpoint, PR #78 carries the 77ea fixture successor:
154 overlays, 167 portable payloads, 9,307 logical files and 92,058,144 bytes. Its vector is
`77ea459e7555e0ca7a7270fd9a42b805db52b2d1dacd8efbd9ac815ab783bb0b`, package digest
`f85caf3208b08049a13773e6cbe1d638f7e21bf648db376a1b3a4a2ccab7d11e`, and builder digest
`6bf1d04d011cf37486b564cabe0d517b7f72d05f32e83d5ac104a5b4be3377b6`.
The corrected canonical handoff is
`76f858c26b94155987c29805001311d03a927d59a906f4d910fd297234af0dd7` at
`root-native-rollout-schema-description-fixture-source-preparation-v2/handoff.DATA.json`;
the portable handoff is
`5c3db2f87748ef50b10ea56110e3b505bcc2c3966745d245c33022d004d2450f` at
`root-native-rollout-schema-description-fixture-package-preparation-v2/handoff.DATA.json`.

The closed parent diagnostic
`f714bd28367505ea7f8503b7ce77668ea70d09563410434e2d92069c9b15bfea`
(662,114 bytes), at
`root-coherent45a-remaining11-execution-preparation-v1/ACTUAL-closed-appserver-protocol-diagnostic.DATA.json`,
identified exactly one documentation mismatch in
`schema/precomputed/app-server-exports-stable.json.zst`.
Its inner `RolloutLine.json` description still named `codex_rollout` while the
current Rustdoc correctly names the canonical parser exported by `codex_history`.
Only that literal description substring changes; the decoded archive is otherwise
byte-identical, schema fields and runtime witness exclusions are unchanged, and
no schema regeneration occurs. The compressed archive grows by four bytes.
Every Rust body, the other 9,306 complete-source rows and all 169 authored names
are identical to 45a. The old failure remains part of the retained 21-case baseline.

The actual one-file application exited 0. Its 3,349-byte handoff,
`d590988f8076d3eb8d228dfb86577dafe5b073a3984a96aba281bd03d8679e8d`, is at
`root-schema-description-one-file-workingcopy-preparation-v1/handoff.DATA.json`.
The 4,718,610-byte complete-source proof,
`35b08440724e7c67444d3376d17632aa5c2a1bb77d78a1170b07c85d93a28f23`, is at
`root-schema-description-one-file-workingcopy-preparation-v1/ACTUAL-complete-schema-description-workingcopy.DATA.json`.
The original builder verified all 9,307 bodies/modes once; all other 9,306 physical
metadata rows were preserved. Its actual Rust-only compiled-input manifest DATA is
`bb61707d5201531b81b76adda738dba33ab6072c587d708a98005a4dddc3b1fe`
(1,674,491 bytes), at
`root-schema-description-one-file-workingcopy-preparation-v1/original-rust-source-manifest.json`.
The once-only source CLI verification exited 0 with 9,264 upstream/153 toolchain/
9,307 composed rows and native qualification false. Its 2,453-byte receipt is
`98485fada1568f94a6fb6bf9f624d8b7a056964d58f7192179bfc8184ed9cbfb` at
`root-native-rollout-schema-description-fixture-package-preparation-v2/ROOT-ACTUAL-source-CLI-once-v1/ACTUAL.DATA.json`.
Frozen as-created authoring metadata stays unchanged; the actual CLI receipt is separate.

This dated checkpoint has prepared affected validation as one fresh ordinary
app-server-protocol LIBtest no-run build followed by its whole 323-case root,
retaining the original ignored schema-write fixture. It claims no fresh result
for that sequence. [PR #78](https://github.com/yimoburu/soloco/pull/78) records the
exact current-head result and acceptance. Parent 45a compilation, protected 169 checks and
ordinary 169 observations remain evidence for its byte-identical Rust bodies;
they are not a new complete-source or binary qualification for 77ea.
No fresh 15-target/protected/production-companion build is claimed for 77ea.
The parent normal binary 5c65521c and manifest a8c72 retain their old association;
the new manifest bb617 is source DATA, not a native executable capability.
At this parent checkpoint the matching Node TaskHost/frame/static build-descriptor/
private-FD adapter was still missing. Original native startup/continuation, account/corpus acceptance,
continuity and company adoption remain unproved; qualified executable/runtime
slots stay NULL. Normative SPEC v0.21 and its governance commitment above, and adopted v0.20, remain unchanged.

### Paused-bootstrap operator composition

The existing `company_origin` ingress now has closed bootstrap operator actions
and exposes the existing finite paused-bootstrap plan purpose. Its protected
HOST/current-owner/custody path calls the fixed maintenance launcher, which
loads the original selected bootstrap module realm and calls the existing
runner through its private-cap facade. The ordinary provider's pause guard is
unchanged. The exact schema and call chain are documented in
[public origin routing](peer-public-origin-routing.md#paused-bootstrap-operator).

This implements the existing founder authority, enforcement and bounded
evidence requirements in SPEC sections 2, 4 and 5. SPEC remains the enduring
company contract; no company rules are adopted by editing this Source.
Packaging, original Native execution, independent review and receiver
acceptance remain distinct. Synthetic routing coverage is not Native proof,
and previously failed or timed-out checks retain their original results.

### Executable peer bridge source successor

The [executable bridge](protected-peer-bridge.md) joins the original selected
component to a separate executable deployment, fixed original Node namespaces,
source-owned interpreter association, private-FD startup acknowledgement and
exact five-tool declarations. Its owned CONNECT listener is bound into the
original Rust bootstrap and HTTP factory, preserving original authentication
and TLS with no proxy fallback. This remains source composition. The later
`company_peers` operator route can load it through the fixed provider and checked
original recipe; native deployment and actual-company adoption remain unproved.

The Rust successor has 9,309 logical files, 92,071,707 bytes and 158 overlays.
Its package is `11dce050e14c48ed20dac9052ec096f3fbd94717603035b22f56f7af851ce84c`,
builder `6edb4fb2eff2e84c2a3850dae6a15d3e270898e1a43615de98bc9d536d92acde`
and compiled-input DATA manifest
`af7c8cc78011e7775945ed757fe346c2feea2605f8dec0e663b5307ec8852a66`.
Eight Rust paths change, including eleven new pure test definitions; parent
builds and observations do not qualify these changed bytes.

Fresh ordinary evidence for this successor passed 1,100 Node cases across 26
roots, twelve separate loopback broker/launch-preparation cases and 49 Python
producer cases. A network-denied offline operation checked metadata for the five
affected libraries and companion entry point, compiled two library harnesses
and passed all eleven new pure Rust tests. Its receipt
`27e502b9f9edb5debafdb58b2ac7c24effa01b690c6e0c547ae4faa9a58d6bc6`
records 459.7 seconds, complete output, retained-leader/stdio observations and
unchanged source/toolchain/SDK postchecks. It supplies no production companion
link/launch or descendant/remote closure evidence.

The source guards support S018, S028, S056, S058, S084 and S086 without upgrading
their existing assessment. Complete wire-size checks precede reservations and
charges. The new active-task route is confined to read-only foundation callbacks;
general effects still need an independently reviewed task/attempt/context fence
inside the same P2 write transaction, including replay. Original child exit,
stream EOF and owned TCP closure remain separate from unknown group absence and
remote-domain closure. The stronger physical-close gate remains Held.

Actual selected deployment/startup, account access, native continuation, realistic
replacement/continuity and company adoption remain unproved. Source test/build
results are ordinary implementation evidence only. SPEC v0.21, adopted company
rules, prior failures, unknown reservations and unresolved notices are unchanged.
