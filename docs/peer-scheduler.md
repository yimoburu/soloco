# Peer scheduler and native execution

`plugins/soloco/runtime/peers/scheduler.mjs` is a software consumer of the peer
ledger, authority model and observation journal. Those components decide grants,
fair selection, admission, budgets, context currentness and result acceptance.
The scheduler launches only work with an exact committed admission receipt and
delivers its observed process, result and closure through the real journal.

This guide describes source preparation and ordinary regression coverage. It
does not establish native-company adoption, independent native QA, owner
acceptance, installed-runtime activation or complete SPEC compliance. It does
not initialize a company, migrate old attempts or replace the legacy worker.
Original failures and held outcomes retain their original status.

## Trusted construction and limits

```js
import {createRuntimeObserver} from
  './plugins/soloco/runtime/peers/model.mjs';
import {PeerScheduler, createNativeExecutor} from
  './plugins/soloco/runtime/peers/scheduler.mjs';

// Provision the ledger and scheduler principal through the authorized host path.
const observer = createRuntimeObserver(ledger, {principal_id: schedulerId});
const scheduler = new PeerScheduler({
  ledger,
  principal_id: schedulerId,
  observer,
  executor: createNativeExecutor({
    cwd: absoluteAuthorizedRoot,
    evidence_dir: absoluteRawEvidenceDirectory,
  }),
  evidence_dir: absoluteSchedulerEvidenceDirectory,
});

await scheduler.tick();             // admission/reconciliation, not job completion
const status = await scheduler.status();
scheduler.start();                  // immediate tick and periodic reconciliation
scheduler.wake();                   // schedules a tick on a started instance
scheduler.stop();                   // requests abort; does not prove process close
const drained = await scheduler.drain();
```

The protected `observer` is mandatory. Construct it from the same actual ledger
object and scheduler principal used by the scheduler. The constructor creates
`createObservationJournal(...)`; there is no interchangeable journal argument.
The existing active scheduler principal must be valid under the authority model.
Reaching a constructor is trusted software composition, not authentication,
host enrollment or authority to open/adopt a ledger.

`executor`, `model`, `now` and executor dependencies are host-owned construction
or test inputs. Task fields, model output and MCP arguments must not select an
observer, executor, runner, spawn function, readiness override or fake model.
This library does not implement that transport boundary.

| Setting | Default | Accepted bound |
| --- | ---: | --- |
| Global active or unknown native slots | 3 | Canonical model policy; also at most 3 local handles |
| `poll_ms` | 500 | Integer 10–60,000 ms |
| `reconcile_ms` | 5,000 | Integer 10–60,000 ms |
| `readiness_ms` | 30,000 | Integer 0–300,000 ms |
| `event_limit` | 100 | Integer 1–100 events per step |
| Journal `entry_bytes` | 400,000 | Journal ceiling 1,000,000 bytes, including its envelope reserve |
| Journal `attempt_bytes` | 1,200,000 | Journal ceiling 3,000,000 bytes |
| Journal `attempt_count` | 3 | At most process, first finish and later closure |
| Journal `pending_count` | 10,000 | Journal ceiling 10,000 rows |
| Journal `pending_bytes` | 16,000,000 | Journal ceiling 16,000,000 bytes |
| Native `max_result_bytes` | 49,152 | Integer 1,024–49,152 UTF-8 bytes |
| One retained evidence file | 1,000,000 | Complete serialized UTF-8 bytes; no truncation |

`journal_limits` can configure the journal within its immutable validation and
ceilings. These scheduler defaults do not change the journal module's own
defaults. A larger software setting does not enlarge a task grant, a native
session allowance or a canonical confined-test limit. Evidence-file limits are
per file, not an aggregate history, preparation-memory or total disk quota.
The local error registry retains at most 64 distinct errors; exceeding that
bound holds new admission and exposes `error_capacity_held`.

## Admission, scope and stop barriers

`tick()` is single-flight within an instance. It reads canonical status,
reconciles existing work, then reads fresh status before considering admission.
An empty, paused or saturated runtime does not construct new admission contexts
or perform new CLI probes. Existing work can still need recovery/currentness
checks. Long CLI/model operations do not run inside a ledger transaction.

The candidate loop visits up to 10,000 pending candidates, yielding after each
100 inspected candidates. Unavailable or unauthenticated hosts are excluded for
that pass without consuming an attempt. Readiness is cached for its configured
interval. Task-specific structured admission holds use a bounded local cache;
substantive ledger changes invalidate that optimization. It cannot authorize
work. P2 owns fair choice, review aging and all admission checks.

The current consumer admits only stages `produce` and `review` with roles
`research`, `engineer`, `qa`, `worker`, `pm`, `design`, `growth`, `finance`, `legal`
or `security`. Unsupported roles/stages remain unadmitted. P2 has no separate
task-kind discriminator: this whitelist is limited routing, not a complete
authenticated distinction between software, native and publication effects.

Each admission uses a unique operation ID. Exact command readback checks its
original revision-one row, digest, actor, operation, action, request digest and
committed result. Its original producer event must bind the same historical
command and task revision, newly created slot/effect reservations and matching
`dispatch_admitted` event. The returned context must equal the admitted attempt's
context, with exact task identity, text digest and UTF-8 byte count. A revised
command, substituted context or missing original producer holds execution.
An ambiguous thrown admission may replay the same command once before this live
invocation's one launch decision. A familiar error code alone never turns an
exception into a structured, harmless admission rejection.

Immediately before launch, a synchronous canonical read rechecks the original
task revision/hash, running state, active exact-attempt slot and P2 context
currentness. A pause, revoked grant or applicable context change after admission
prevents launch while keeping every committed charge/reservation. A genuinely
qualified unrelated home update can remain compatible under P2; a raw scope
label is not that qualification. This fence does not create a transaction
spanning the ledger and OS process creation.

The stop generation is checked after asynchronous probes/admission and loop
yields. If stop wins after committed admission, the attempt, budget charge and
reservation remain occupied; no process is launched or fictitious closure
written. A cold scheduler never launches from a historical admission receipt.
An admission receipt is not durable proof of an OS launch decision. Loss of
memory, absent PID, elapsed time and a terminal task label do not authorize a
respawn, refund or release.

A successful admission pass reports `admitted` and `launched` separately. A
top-level failure reports `admission_count_unverified:true`, rather than claiming
that zero attempts committed. Inspect the canonical state and original failure.

Currentness checks use the canonical model's scoped context validation for the
at-most-three local running attempts. An applicable context change requests
abort for the affected attempt. Thrown provider/storage/validation failures keep
their original error and remain conservative; the scheduler does not relabel
them as harmless scoped changes. This does not repair legacy global-notice
cancellation or prove producer-side notice locality. Separate founder/CoS host
calls need their own aggregate budget and concurrency enforcement.

## Exact process, result and diagnostic evidence

An executor implements these trusted callbacks:

```js
{
  async probe({host, task}) { /* readiness metadata; no paid model turn */ },
  async execute({task, context, signal, onProcess, onClosure}) {
    // Return native_id, exact output, termination_confirmed and observed_process,
    // or the original failure and available evidence. Callbacks report facts.
  },
}
```

`createNativeExecutor` supports `codex` and `claude`, reusing `adapters.mjs`.
Its default metadata readiness probe runs in a Worker thread with a bounded
35-second wait. Every model execution passes `nativeId=null`; the observed CLI
session ID is retained rather than synthesized or resumed. Existing adapter
authentication, tool restrictions, task timeout/reason and termination behavior
still apply. The default executor timeout is 180,000 ms; readiness and ordinary
source tests are not native-host or throughput qualification.

The journal/P2 boundary receives only an actual positive PID, a valid observed
`started_at` or `execution_started_at`, and the explicit close flag when needed.
If both start aliases exist they must be identical. Extra timings and host
metadata remain diagnostics, outside the narrow protected process packet. The
first PID/start binding is immutable; a conflict aborts/holds that attempt.

No real PID/start means no valid P2 finish, even if the executor says it never
started a child. The scheduler records a visible `no_process_held` condition and
retains the attempt/slot charge. There is no invented PID, no-process settlement
API or automatic replacement. Supporting a positively proved no-child release
would require a separate authority-model contract.

Executor outcome data is frozen before asynchronous evidence persistence.
The original unknown-termination finish stays unknown even when close arrives
before its persistence completes. Later actual close is a separate
`task/closure`; it cannot rewrite the original finish or retroactively accept
its output. `onProcess`, finish and closure persistence share one serialized
chain per attempt. Every operation retains its original ID, arguments and exact
predecessor; retry cannot replace a held observation with a new payload.
Callback metadata is retained before narrow validation and journal delivery;
retention failure leaves the original queued metadata available for retry.

Raw output is retained byte-for-byte in a SHA-256-named file. The native
executor defaults to `cwd/.peer-evidence`; scheduler diagnostic envelopes default
to `ledger.directory/evidence/peer-runtime`. These are separate configurable
locations. Existing directory prefixes and created directories must have their
native, nonlinked spelling. New files are exclusively created, completely
written and closed, then read back. Every resulting path, including reuse, must
be a regular non-symlink file with one link and the exact SHA-256 of the complete
body. References include path, digest, UTF-8 byte count and explicit `persistence`
observations:

| Route | `write_closed` | `readback_verified` | `file_fsync` |
| --- | --- | --- | --- |
| Newly written ordinary file | `true` | `true` | `performed` |
| Newly written file when `process.permission` is present | `true` | `true` | `unavailable_node_permission_model` |
| Matching existing file | `false` | `true` | `not_observed_existing_file` |

The Node Permission Model route records its unavailable fsync capability rather
than claiming a flush occurred. The ordinary route still calls `fsyncSync`;
write, flush, close and readback errors propagate instead of being treated as
this known restriction. Reusing an existing file establishes neither a current
write/close nor an earlier fsync. Output above the row budget is retained when
it fits the unchanged file limit and fails closed; it is never shortened into
success. Retention/capacity failures remain visible holds. These observations
do not relax path checks, complete-body hashes, row/file caps or test limits.

Scheduler diagnostic envelopes preserve original errors, rejected outcomes,
process metadata and delivery failures. Auxiliary `work_items` entries under
`p3:runtime-evidence:v1:` associate their immutable retained file references with
the exact principal/task/attempt/kind. The first recorded persistence observation
stays unchanged across duplicate callbacks, delivery retries and cold recovery.
Each later lookup verifies the complete file and every stable association field;
its new reuse observation cannot rewrite or conflict with the original one.
Legacy references without a persistence observation remain without that proof.
This is a diagnostic index, never an
admission receipt, delivery ACK, closure proof, review verdict or alternative
authority/state store. The complete canonical error envelope, including its
evidence reference and JSON escaping, must fit 3,500 encoded bytes. Oversized
errors use a bounded code/message plus protocol/hash/byte reference to the full
retained diagnostic. Original code/message fields are included only when the
final encoded envelope still fits; no raw-string-length shortcut is used.
The diagnostic index supplies the file path. Retention failure cannot be waived.

Successful close/readback is content evidence, not crash or power-loss durability.
Even a performed file fsync establishes neither directory fsync nor crash-atomic
publication across the filesystem and ledger. Durable P1/P2/journal commits and
their delivery ACKs are separate facts; they do not add an unobserved flush to
an auxiliary file. Protection against hostile concurrent same-user filesystem
mutation, access policy, total retention and cleanup remain host responsibilities.
Direct CLI close proves neither arbitrary descendant closure nor reversal of
external effects. The executor does not provide general process tree ownership,
host credential isolation or P8 security qualification.

## Review evidence and ordered delivery

The native prompt requests a JSON artifact with nonempty content and, for a
`review_of` task, an exact-subject review. It explicitly requests compact,
recursively sorted canonical JSON and supplies an exact subject/context-bound
wire example. The example's judgment must be replaced with the reviewer's actual
judgment; formatting is never a reason to change a negative verdict.

The scheduler uses the same accepted `parseReviewOutput` function as P2. It
checks the exact subject, verdict `Pass`/`Fail`/`Blocked`, nonempty string blockers
and an empty blocker array for Pass. The reason must be nonempty, at most 12,000
UTF-16 code units and contain no NUL; the canonical blocker array must fit 16,000
bytes. P3 additionally requires the exact delivered `context_sha256`. The whole
raw artifact must equal `canonical(JSON.parse(output))`, including key order and
whitespace. Pretty-printed or otherwise rewritten JSON fails this boundary;
the receiver never repairs raw output to manufacture a match. Malformed review
output is retained as a failure and cannot create a canonical review; actual
confirmed process closure can still release its physical slot.

The narrow `review_evidence` fields are `native_id`, `subject`,
`context_sha256`, `output_sha256`, `verdict`, `reason` and `blockers`. They are
derived from actual output and context; there is no legacy
`peer-native-review-v1` wrapper. The protected P2 observer independently binds
the actual observation and checks subject, output/context identity, reviewer
independence and confirmed closure. A supplied Pass is not provenance or new
execution/publication authority. Broader P2/P4 claim, review-protocol and producer
interoperability obligations remain separate.

The real journal durably enqueues `task/process`, `task/finish` and, when needed,
`task/closure` with exact predecessor relationships. It delivers only under its
existing ordered, immutable command/recovery rules. Returned delivery errors and
original outcomes stay inspectable. An ACK means exact committed P2 delivery;
it does not turn `accepted:false`, quarantine, unknown, Fail or Blocked into
business acceptance. Actual closure and semantic result acceptance are separate.
If the protected observer commits a finish and its return is lost, journal
recovery reads/reuses the exact committed command and result. It retains the
original transport failure without another native execution or budget charge.

An author can close and release its physical slot before downstream review.
Review coordination does not retain an author model process waiting for a
queued reviewer. Unknown effects can retain conflicting resource reservations
after observed worker closure; an uncertain worker independently retains its
global slot. Signals, TTLs and PID absence release neither by themselves.

## Complete bounded recovery and observability

Cold recovery enumerates the complete pending/held journal snapshot in pages
of 100, up to 10,000 rows, before any delivery can invalidate that cursor. It
yields between pages. An explicit stale-cursor `restart_required` discards the
partial snapshot and restarts once; another failure is exposed and held.
Collected rows are delivered in task/ordinal order, yielding every 100 deliveries.
A held first page cannot hide an independent successor. This separate loop and
the 10,000-candidate admission loop both cover work beyond the first 100;
neither promises progress under perpetual mutation, unavailable storage or
unknown native processes.
Recovery retains each row's original delivery errors. An oversized diagnostic or
local diagnostic-file failure is recorded for that row without preventing later
independent delivery. It does not ACK the held row, discard its evidence or
authorize new native work.

Startup uses indexed current slots and initializes the event cursor at the
current tail. It does not replay attempt history. Subsequent bounded event reads
and periodic reconciliation recover journal deliveries and inspect active or
unknown slots, including reservations whose task has been cancelled. A cold
instance reports those reservations without restarting native work. Locally
settled evidence is retried from frozen data; operation replay never repeats a
model call. A canonically released slot with all observations durably enqueued
can leave the local registry even while journal ACK recovery remains pending.

`status()` performs no model/CLI probe. It adds local phases, promise settlement,
canonical retained-result presence (`local_attempts[].durable_result`), finish
delivery ACK (`delivery_acknowledged`), observed close and original errors to
canonical counts. `detached_slots` is the nonnegative difference between the
canonical occupied-slot count and local handles, not proof of a dead scheduler.

`stop({abort_running:true})` increments the generation and requests local abort;
`abort_running:false` stops new admission without that request. Observed-evidence
persistence can still complete. A stopped instance is not restarted by
`start()`; an explicit `tick()` may still reconcile without admitting work.
`drain()` waits for local promise/persistence chains for up to eight stabilization
rounds, then reads canonical reservations and journal pending state. `tick()` or
`start()` drives cold recovery; `drain()` alone does not scan/deliver that backlog.

Its result separates these facts:

| Field | Meaning |
| --- | --- |
| `promises_settled` | Every remaining local executor promise has settled |
| `durable_results` | Each current active/unknown reservation has a retained task result; vacuously true when none remain |
| `delivery_acknowledged` / `pending_delivery` | No journal pending/held rows / their count, or unknown count on read failure |
| `physical_closure` | No canonical active/unknown native slots remain |
| `company_active_or_unknown_slots` / `local_inflight` | Canonical occupied-slot count / local handle count |

Read failures retain the original error and return conservative false/null
values. None of these fields means every historical result passed, every
external effect is resolved or every descendant/resource is closed.

## Verification and remaining acceptance

For an ordinary source regression in the supported Node 22 environment:

```sh
node --test --test-concurrency=1 --experimental-test-isolation=none \
  tests/peer-observation-journal.test.mjs tests/peer-scheduler.test.mjs
```

The complete unchanged 130-case journal root and meaningful existing scheduler
purposes remain compatibility roots. Scheduler tests use the actual ledger,
authority model and journal with controlled executor/probe fixtures. They cover
admission ambiguity, recovery/ACK ordering, exact process/review bindings,
uncertain closure, stop barriers, scoped failure, starvation beyond 100 rows and
bounded output/evidence. Controls also exercise original admission producer
history, post-admission pause/revoke/applicable changes, an independently
qualified unrelated home, malformed canonical reviews, encoded Unicode errors,
producer prompt format, metadata/result retention faults, observer commit-return
loss and per-row diagnostic delivery fairness. Ordinary green source tests do
not prove actual native execution, confinement, host behavior or a useful
operational CoS count.

The exact final source, dependency identities and measured suite results need
their own evidence. Native adoption still requires disclosed external source
authorship, an actual authorized Engineer's adoption of the exact complete
packet, confined tests within the actual granted byte/time/input limits, fresh
independent native QA and owner acceptance. Source integration and its ordinary
CI qualification follow separately. No prepared layout grants those permissions
or proves its complete candidate and prompt fit.

Keep the historical P1/P2 suites and exact accepted evidence intact; ordinary
full CI and a later bounded composed native proof answer different questions.
Do not assume every historical full root must fit one 120-second native job,
filter meaningful cases to claim a pass, silently raise caps or regrade old
failures. Actual host enrollment, authenticated effects, P8 boundaries,
descendant/resource closure, legacy continuity and complete SPEC acceptance
remain explicit work outside this source module.
