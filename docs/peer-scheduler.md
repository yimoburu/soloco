# Peer scheduler and native execution

`plugins/soloco/runtime/peers/scheduler.mjs` is deterministic software. It does
not ask an idle model what to do. The peer ledger/model owns grants, task
coordination, fair selection, bounded queue policy, claims, budget and context
checks, one-attempt admission, native review provenance, and result acceptance.
The scheduler starts only canonically admitted work.

This module implements a new peer-mode path. It does not initialize a company,
adopt governance, install a runtime, migrate old attempts, or replace the legacy
worker. Opening a ledger must already be authorized by the separate checked
adoption path. These tests use isolated fixtures and simulated execution; they
are not a native-company trial or formal independent SoloCo QA.

## Software API

```js
import {PeerScheduler, createNativeExecutor} from
  './plugins/soloco/runtime/peers/scheduler.mjs';

const executor = createNativeExecutor({
  cwd: absoluteAuthorizedRoot,
  evidence_dir: absoluteEvidenceDirectory,
});
const scheduler = new PeerScheduler({
  ledger,                       // an already-adopted PeerLedger
  principal_id: schedulerId,     // active admin-created scheduler principal
  executor,
});
await scheduler.tick();          // admit up to remaining global capacity
const status = await scheduler.status(); // no model or CLI probe
scheduler.start();               // bounded periodic software reconciliation
scheduler.wake();                // optional event-driven wakeup
scheduler.stop();                // immediate stop/abort request, not closure proof
await scheduler.drain();         // await locally settled executions/persistence
```

`tick()` is single-flight within one scheduler instance. Concurrent instances
still compete through atomic model admission; a task's original attempt is
never reset. `tick()` returns after admission, not after model completion.
`status()` returns canonical runtime counts, the bounded local attempt registry,
event cursor and any scheduler error. `detached_slots` means occupied canonical
slots without a local handle; it does not prove another scheduler or native
process died.

Constructor timing options are `poll_ms` (default 500), `reconcile_ms` (5000),
`readiness_ms` (30000), and `event_limit` (100, maximum 100). `now` and `model`
are trusted local test dependencies. An executor implements:

```js
{
  async probe({host, task}) { /* bounded CLI metadata readiness, no model call */ },
  async execute({task, context, signal, onProcess, onClosure}) {
    // Return native_id, output, termination_confirmed, and optional bounded
    // model_evidence/result_evidence/observed_process/error/rejected_output.
  }
}
```

Injection is for trusted construction and tests. No task field or MCP request
may select an executor, runner, spawn function, readiness override, fake model,
or closure proof. The authenticated transport must never expose those options.

## Admission, fairness and capacity

The scheduler first calls `inspect(..., 'runtime/status')`. An empty, paused or
saturated runtime returns before full context construction and CLI probes.
`task/peek` supplies the next fair pending row and owner host without consuming
an attempt. The model applies principal rotation and review aging, with bounded
company/principal queues. Temporarily unavailable hosts are excluded from the
current bounded candidate pass so another ready host can proceed. Per-task
admission holds are cached in a bounded local set until a substantive ledger
change. Command-receipt-only changes do not repeatedly rebuild an unchanged
blocked context. This cache can defer work, never authorize it.

Only after readiness does `execute(..., 'task/admit')` atomically recheck the
current grant, pause/policy generation, scoped resources, context, fair choice,
budget and capacity. The receipt binds one attempt, exact context and native
effect reservation. A competing change can hold admission without consuming an
attempt. Long reasoning, CLI probes and model execution never run in a ledger
transaction.

The cap is three active **plus uncertain** native workers across the company,
not three per CoS or scheduler process. The scheduler's local registry is also
bounded by three. Host-side founder CoS calls require separate aggregate budget
and concurrency enforcement by their transport; this worker module does not
pretend to meter calls it cannot observe.

After events or the bounded reconciliation interval, the scheduler revalidates
only its at-most-three local running contexts and task attempts. A stale grant,
pause, cancellation or changed required source requests an abort. It does not
claim the native process stopped. Fairness cannot promise bounded service time
when native workers or required resources remain uncertain indefinitely.

## Native process and output evidence

`createNativeExecutor` reuses `adapters.mjs` `runModel` and `readiness` behavior.
Readiness probes run in a Worker thread because the existing metadata probe
uses synchronous child-process calls; they do not block the control event loop.
Results are cached for a bounded interval. No readiness probe launches a paid
model turn.

Every execution passes `nativeId=null` to `runModel`. The native CLI's observed
session identity is retained; the scheduler never mints a native identity or
resumes a prior worker to impersonate a fresh standalone role. Existing adapter
read-only/tool restrictions, CLI authentication, timeout and termination logic
remain applicable. Custom task timeouts still need their existing explicit
reason. Successful `runModel` resolution follows an observed native CLI close.

The native executor records observed PID/timing through `task/process`. A
separate close listener remains available after an adapter timeout reports
uncertain termination. Initial output, failure and uncertainty are recorded by
`task/finish`. Later observed close uses `task/closure`: it can release a native
slot and eligible claims, but cannot retroactively accept the old output.
Direct CLI close does not establish that an arbitrary external side effect was
undone or that unrelated descendants have terminated.

Exact output is stored in a content-addressed, exclusively created file under
`evidence_dir`. Existing files must match their SHA-256 and be regular files;
linked evidence directories/files are rejected. The default directory is
`cwd/.peer-evidence`; operators should provide a governed retained location.
File references contain the exact path, digest and UTF-8 byte count. Ledger
output is bounded at 48 KiB. Oversized output is retained and failed closed,
never truncated into accepted success. Retention/access policy belongs to the
operator; an output-file digest is identity evidence, not a semantic review.

## Independent review

A prebound `review_of` task receives the exact review subject and context hash.
Its observed JSON artifact must contain:

```json
{
  "content": "Evidence-grounded review",
  "review": {
    "subject": {"family": "proposals", "id": "exact-id", "revision": 1, "sha256": "exact-hash"},
    "context_sha256": "exact-delivered-context-hash",
    "verdict": "Pass",
    "reason": "Specific evidence and limits",
    "blockers": []
  }
}
```

The scheduler constructs `peer-native-review-v1` evidence from that actual
output, the observed native ID, and raw-output SHA-256. The model independently
checks the subject, output/context hashes, reviewer principal/native
independence and confirmed closure before creating a canonical review. Missing
or mismatched review bindings fail closed. A caller's arbitrary submitted Pass
is not native review provenance.

An author job finishes and confirms process closure before its slot is
released for downstream review. A task coordinator can wait on review without
retaining an author model process. The scheduler never implements a parent
worker waiting inside its own execution slot for a queued reviewer.

## Uncertainty and restart

An unknown external effect with a confirmed-closed native worker may retain its
conflicting resource reservation without consuming a native worker slot. A
possibly live worker independently retains its global slot. Neither reservation
is released by TTL, a successful signal request, PID reuse/absence, or the
terminal label on a task. Three uncertain native workers can block all specialist
admission; deterministic receipt/status/pause processing remains separate.

After scheduler restart, already-admitted tasks are not relaunched. A replacement
reports detached slots and leaves them occupied. A missing local handle is not
evidence that another scheduler is dead. Explicit supervised takeover and
independent closure reconciliation belong to the operator/control path.

Startup reads indexed current state and initializes its cursor to the current
event tail instead of replaying unused history. Thereafter the event cursor
processes at most 100 events per step. Periodic bounded
reconciliation covers expiry and missed wakeups without scanning attempt
history. Persistence errors hold local evidence and capacity; safe idempotent
result/closure persistence retries reuse the original operation IDs and never
repeat a model call.

## Verification

Run `node --test --experimental-test-isolation=none tests/peer-scheduler.test.mjs`
on the supported Node 22 environment. The suite uses the actual typed ledger and
authority model with injected simulated execution. It covers equal-budget
1/2/4/8 simulated CoSes, shared capacity, duplicate admission, uncertain
saturation and late closure, replacement, idle behavior, review fairness/native
provenance, stale grant/context/pause, host readiness and exact output retention.
It performs no paid/native execution. Simulation does not establish native CLI
reliability, live throughput or the useful operational number of CoSes.
