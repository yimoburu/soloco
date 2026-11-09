# Current capability map

This map describes merged source through main `4e9e434` (PR #56), including the
peer foundations (PR #49), bounded storage core (PR #51), executor and fixture
fixes (PR #52/#53), durable observation journal (PR #55), and storage transfer
qualification (PR #56). SPEC v0.21 retains the mission and 47 normative rows;
exact published v0.20 compatibility remains.
Source availability, execution evidence and company adoption are separate.
Historical reports retain their original source identities and verdicts.

| Capability | Source | Executable evidence | Present boundary |
|---|---|---|---|
| Durable preparation and independent dependency gates | `task-runtime.mjs`, `tasks.mjs` | `task-runtime-acceptance.test.mjs`, `task-runtime.test.mjs` | Existing native evidence in issue #30; full company/session replacement still requires its own trial |
| Explicit outcome hypotheses and cold reconstruction | `outcome.mjs`, `task-context.mjs` | `tasks.test.mjs`, `task-context.test.mjs`, real-source self-improvement trial | Task acceptance is not observed business impact |
| Typed scheduling/recovery causes | `recovery.mjs`, `coordination.mjs` | `task-runtime.test.mjs`, coordination suites | No automatic retry of an attempted/uncertain task |
| Opt-in operating proposal continuation | `operating-state.mjs`, `worker.mjs` | `operating-control.test.mjs`, final five-call native proposal evaluation | Only exact new read-only proposals; legacy and changed meaning remain conservative |
| Retained code changes, execution and acceptance | `develop.mjs`, `local-sandbox.mjs` | `develop.test.mjs`, accepted-workflow evaluator | No automatic integration or deployment |
| Review independence and continuing notice conditions | `worker.mjs`, `engine.mjs`, context and prototype modules | `spec-invariants.test.mjs`, context/prototype tests | Native identity and immutable dispositions are enforced; semantic adequacy and authority still require judgment |
| Complete compulsory catalog evidence | `upgrade-evidence.mjs` | `claude-catalog.test.mjs`, retained PR #37 before/after probes | Unknown model-speed values stay mandatory; delivery does not prove model understanding |
| Supplied local observation comparison | `tools/outcome-observations.mjs` | `outcome-observations.test.mjs` | Exact supplied inputs; independent measurement validity and causal impact unestablished |
| History qualification and operating publication | Scoped/context/operating modules | Historical qualification suites | Real accumulated-history bootstrap is separate from scripted proof validation |
| Peer coordination foundations | `peers/ledger.mjs`, `peers/model.mjs`, `peers/review-selection.mjs`, `peers/github.mjs` | `peer-ledger.test.mjs`, `peer-model.test.mjs`, `peer-github.test.mjs` | Library checks do not qualify the complete peer scheduler, protected host transport or production publication policy |
| Durable peer observation journal | `peers/observation-journal.mjs` | Complete 130-case `peer-observation-journal.test.mjs`, included in PR #55/#56 CI | Protected observation, immutable producer evidence and lost-acknowledgment recovery are library checks; scheduler integration and native-host replacement remain open |
| Storage leaf transfer and path checks | `storage-transfer.mjs`, `record-storage.mjs`, `snapshot.mjs` | Six storage test roots, 45 cases in PR #56's Node 22 source/full runs; 29 selected cases in Node 26 compatibility | Real-link rejection and staged-transfer checks are tested; no atomic filesystem swap guarantee or company continuity acceptance |

See `founder-outcome-implementation.md` for the historical founder candidate's pinned
executed validation, `spec-reconciliation.md` for the combined claim/evidence
map, and `founder-benefit-acceptance.md` for prospective human/outcome measures.
No row establishes installation, actual-company adoption, real customer benefit
or an elapsed-time guarantee. Native observations retain their exact evaluated
source; later source changes require affected revalidation.
