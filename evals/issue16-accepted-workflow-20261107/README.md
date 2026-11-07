# Matched accepted-workflow slice for #16

Base source: remote main `9c0cb8a9d40da42242787b1bbaacfa11ba37acdc`.
This change adds evaluation tools; production runtime source is unchanged.

The paired fixture compares serial extraction then parser repair with concurrent
extraction and parser repair. Both use the same fictional brief, faulty original
source, immutable acceptance tests, model controls, independent native QA and
runtime acceptance gate. Each arm first executes the faulty original in the OS
sandbox, then queues work through production `engine.dispatch`, invokes the
production worker from the software harness, executes the production retained
candidate test worker, and calls `engine.develop accept` only after exact
independent QA. The evaluation launch hook keeps scheduling inside the harness;
the model calls are real separate CLI processes. This does not qualify a detached
supervisor or trusted startup hook.

Predeclared criteria were persisted before calls: zero quality errors/false
acceptance, zero error margin on deterministic grading, two generations per arm
at most, eight calls total at most, and no required latency improvement. Backend
or uncertain outcomes stop their branch without retry. Only a known deterministic
test failure may consume one bounded generation repair. Initial grants and setup
are explicitly fictional test data; no actual company ownership or records change.

## Observed native result

| Schedule | Accepted | Native calls | Generated candidates | Additional repairs | Through receiver acceptance |
|---|---:|---:|---:|---:|---:|
| Serial | yes | 3 | 1 | 0 | 32.171 s |
| Concurrent | yes | 3 | 1 | 0 | 26.797 s |

Both exact extraction checks and actual sandbox Node tests passed. Each QA native
identity differs from its author and its result binds the final candidate/receipt
hashes. The report cross-checks review target, candidate, receipt and recorded
receiver acceptance. Original source is unchanged. Raw native IDs and canonical
scratch databases remain local; public native identifiers are hashes.

`founder_requests` counts software-harness needs-attention events (zero in this
successful pair). It does not measure natural founder behavior or establish lower
founder workload. Prompt/output bytes, observed calls, dispatch latency, full
stage events, failed tests and actual repair counts are retained. Both arms use
gpt-6.1-sol with task-specific low/medium/high requested effort and host-default
speed; no paid tier is enabled. CLI applied controls do not prove effective
provider settings or billing.

This is one serial-first pair on a tiny fictional workload. Provider/order and
host-load variation remain uncontrolled; no causal speedup, population-tail,
production competence, cost savings or statistical non-inferiority is established.
Repeated counterbalanced trials, harmful-parallelism cases and broader workflow/
model comparisons remain necessary before closing consolidated #16.

## Validation and retained failures

Four new regression cases pass with actual OS sandbox execution: both schedules
accept through the real lifecycle, a deterministic failed candidate consumes one
repair while preserving its receipt, independent Blocked QA prevents acceptance,
and an uncertain backend failure is retained without another generation.
Node 25.2.1: 4/4, zero failures/skips. Independent Node 22 execution is recorded by
the integrating reviewer separately.

The first local contract command was blocked by the outer sandbox preventing
`sandbox_apply`; no unsandboxed fallback ran. An unchanged command with permission
to create the existing OS sandbox then exposed a synthetic-adapter timing callback
that omitted the explicit timeout reason. Production rejected it. The fixture
callback was corrected and the regression suite passed before native evaluation.
These two failed fixture attempts remain locally at
`/private/tmp/soloco-issue16-contract-01` and
`/private/tmp/soloco-issue16-contract-02`; they are not native model failures or
passing results.

Reproduce with a new output directory (the tool refuses overwrites):

```
node --test tests/accepted-workflow-eval.test.mjs
node --no-warnings tools/accepted-workflow-eval.mjs --contract-double NEW_OUTPUT_DIRECTORY
node --no-warnings tools/accepted-workflow-eval.mjs --native NEW_OUTPUT_DIRECTORY
```

Native execution requires the supported authenticated CLI, advertised model
controls and actual macOS sandbox availability. `source-identity.json` pins the
exact source manifest and Node executable hash used by this native run.

## Assessor repair after independent source review

Independent source review found that the initial report assessor could accept two
copies of the serial arm and could ignore a contradictory negative review/error.
This was a report-validation defect; production acceptance still enforced its
own exact gates. The repaired assessor requires exactly one serial and one
concurrent arm, matching fixture/execution/model settings, explicit independent
QA Pass, consistent native call lineage, no held/error/attention path, actual
passing execution and exact final bindings. Corruption regressions retain these
counterexamples.

The original native run used the files now preserved under `executed-source/`;
their hashes are checked against the original manifest. Its `native-report.json`
is unchanged. `assessor-recheck.json` is a later deterministic assessment of that
existing report, with separate assessor identity. No native calls used the newer
assessor. The original driver did not record a post-execution fingerprint, so no
later check can establish contemporaneous absence of source drift for that run.

Future driver runs capture full source and Node fingerprints before execution,
recheck after every arm before producing a passing report, and hold further work
and final qualification on drift or capture failure. `design_base_revision` names
the implementation's design reference; `observed_git_revision` is obtained only
when the evaluated directory is the actual Git repository root, and is null for
archives. Exact file hashes remain available in either case.

Sanitized earlier failed fixture evidence is now retained in `retained-failures/`:
the OS sandbox startup diagnostic and the synthetic adapter timing rejection are
separate from native outcomes. The new source-drift regression modifies an actual
fixture file, then deletes a required source; both fingerprints hold. It also
rejects runtime executable drift and an internally inconsistent manifest.
