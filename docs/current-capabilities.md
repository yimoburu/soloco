# Current capability map

This map describes the source candidate on `codex/founder-outcome-loop`, based on
`7b6d6d5`. Source availability, execution evidence and company adoption are separate.
Historical reports retain their original source identities and verdicts.

| Capability | Source | Executable evidence | Present boundary |
|---|---|---|---|
| Durable preparation and independent dependency gates | `task-runtime.mjs`, `tasks.mjs` | `task-runtime-acceptance.test.mjs`, `task-runtime.test.mjs` | Existing native evidence in issue #30; full company/session replacement still requires its own trial |
| Explicit outcome hypotheses and cold reconstruction | `outcome.mjs`, `task-context.mjs` | `tasks.test.mjs`, `task-context.test.mjs` | Task acceptance is not observed business impact |
| Typed scheduling/recovery causes | `recovery.mjs`, `coordination.mjs` | `task-runtime.test.mjs`, coordination suites | No automatic retry of an attempted/uncertain task |
| Opt-in operating proposal continuation | `operating-state.mjs`, `worker.mjs` | `operating-control.test.mjs`, `tools/operating-proposal-eval.mjs` | Only exact new read-only proposals; legacy and changed meaning remain conservative |
| Retained code changes, execution and acceptance | `develop.mjs`, `local-sandbox.mjs` | `develop.test.mjs`, accepted-workflow evaluator | No automatic integration or deployment |
| Supplied local observation comparison | `tools/outcome-observations.mjs` | `outcome-observations.test.mjs` | Exact supplied inputs; independent measurement validity and causal impact unestablished |
| History qualification and operating publication | Scoped/context/operating modules | Historical qualification suites | Real accumulated-history bootstrap is separate from scripted proof validation |

See `founder-outcome-implementation.md` for this candidate's executed validation.
No row establishes installation, actual-company adoption, real customer benefit
or an elapsed-time guarantee. Native observations retain their exact evaluated
source; later source changes require affected revalidation.
