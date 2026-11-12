# Task-bound peer actions

This source interface composes an original protected principal connection, a
source-issued executor incarnation and the actual scheduler admission. It adds
useful ledger actions with an owning SQLite transaction. Its source tests do
not qualify a real native host, authenticate an operator, adopt peer mode or
clear any earlier failed attempt, notice or unknown process reservation.

The trusted host calls:

```js
const client = bindPeerTaskEffects(originalPrincipalConnection, {task_id}, executor);
client.inspect('task/get', {task_id});
client.execute('message/send', {operation_id, to_principal_id, content});
```

Models receive only the returned `execute` and `inspect` methods. The ledger,
original connection, executor issuer/observer, selector factory and commit
guard are internal host capabilities. Cloning or serializing a handle does
not reproduce it. An arbitrary process with raw database or internal-module
access remains outside this trusted-host boundary.

## Authority producers

The actual `task/admit` mutation produces a durable `authority_epoch` and an
`attempt.effect_authority` record. The latter binds the epoch, original issue
time and finite expiry. The lease lasts at most 120,000 milliseconds and is
clamped to the task grant's expiry. Binding, reading, command replay and process
observations do not extend it. Transfer, cancellation and terminal observations
advance the task epoch; recording the original process does not.
Each new authority epoch also records its immediate immutable task predecessor
and actual P1 event sequence. For an already accepted review, lawful later
transfer/cancellation preserves its immutable historical proof. The history
validator follows the bounded exact predecessor chain and verifies every step's
typed source event and immutable command result. A counter-only mutation cannot
hide behind an earlier lawful transition. Current task authority is still revoked.

The client derives the admission producer from the native effect's creation
sequence, the original scheduler `task/admit` event and its exact immutable
command version. That receipt must contain the same task, attempt, original
native request, authority and complete context. The derived producer reference
is sealed in the private client closure. Producer-shaped task fields or an
`admitted: true` object cannot replace this history.

`executor-incarnation.mjs` independently checks an original opaque handle and
its source observer. The association includes the exact ledger/company,
principal/native identity, task, attempt, context, original process, turn and
finite runtime deadline. The issuer generation and boot nonce identify that
source instance; they are not durable cross-process revocation. Ledger task,
principal and control generations still fence replaced or revoked authority.
The production host must invalidate its original observer on stop, error,
exit, close, yield or replacement. Fictional observers in tests establish
source mechanics only.

## Transaction and replay boundary

Every inspection, action and replay takes its own `BEGIN IMMEDIATE` transaction.
Before looking up a task command or planning any mutation, the client checks:

- Current principal and immutable task-purpose/resource aliases.
- Running status, intact attempt, no result/closure, current authority epoch
  and the original finite lease.
- Current pause/policy/governance and exact task grant semantics.
- Complete current admitted context and original active slot/effect reservation.
- Sealed admission provenance and the original executor association.

Task command receipts and business-row identities have a source-bound task,
attempt, authority and executor namespace. A generic pre-task receipt or a
receipt belonging to another admission cannot serve as this task's result.
Receipts and produced rows retain top-level task/attempt attribution as well
as their complete source authority metadata.

`PeerLedger.guardedWrite` performs a second, uncached authority check after
the planner, row flush, review maintenance, event, outbox and metadata staging.
Its private final view exposes only current-row reads. After all final SQL and
executor-observer work, P1 samples the clock directly before its owning
`COMMIT`. The deadline is the minimum of the task lease, current grant expiry
and source runtime deadline. A failed or expired guard rolls back all staged
rows, receipts, history, events and outbox work. Provider errors retain their
original identity; cleanup failures keep the existing aggregate/quarantine
semantics. A caller-owned transaction/savepoint is rejected because releasing
a savepoint does not establish a physical commit boundary.

## Implemented action scope

The task client supports its own `task/get` and `task/context` inspections and
these ledger actions:

- `message/send`: a scoped message to an active principal.
- `notice/create`: an attributable required notice.
- `home/propose`: a proposal for a resource declared by the admitted task.

Action scope/grant comes from the task. Caller-provided mismatches, identity,
authority, lease and unsupported action fields are rejected. A home proposal
retains all admitted explicit contributors, review and parent references even
when the model omits them. Additional proposal references/dependencies must
already be present in the admitted context.

A new required notice changes compulsory context membership. Its own authorized
transaction may commit, but the old task context is then stale: subsequent
actions/inspections and output acceptance remain held until separately
reconciled. No implicit context update or retry is performed.

External filesystem/software execution, GitHub publication, home publication,
task/grant/company control, other-task inspection and arbitrary list access
have no task-effect path in this interface. Existing read-only foundation
restrictions remain independently enforced by the host. A usable source API
does not activate those actions or substitute for missing real native evidence.

## Founder assignment without impersonation

The separate `task/assign` model action belongs to the authenticated founder
operator path. Its request contains `to_principal_id`, the recipient's actual
`grant_id`/optional `grant_generation`, ordinary bounded task fields, an
`operation_id` and an attributable `source_instruction`. It is not available
through the task-effect client.

Assignment validates the current activated peer membership and its exact
reconstruction/independent qualification references. It applies the recipient's
current task-submission and claim permissions, scope, resources, queue and model budgets. Founder
status supplies no replacement recipient grant or spending allowance. The
founder remains the command/operator author; the selected peer is the task's
actual accountable owner. The immutable definition records `assignment` origin.
Assignment queues a pending task and acquires its declared resources in the
same transaction. A conflict rolls back the task and command receipt; no manual
recipient claim is needed. Ordinary `task/submit` still creates a planned task.
Assignment itself neither dispatches a native session nor charges a model call.
The normal scheduler still performs actual admission and its independent gates.

A raw actor string is not authentication. The production route must derive the
founder operator from its protected connection, and must never bind or impersonate
the requested recipient merely because a request named that principal.

## Starting-owner fence for the autonomous scheduler

`bindPeerProductionScheduler(ledger)` is a private source composition facade for
the existing scheduler. It captures the canonical founder's exact row reference
and adopted owner host/session/epoch itself. Callers cannot supply a matching
owner object or validator to mint it. Production admission checks that original
owner before replay/planning and again through `guardedWrite` after staging.
The source-produced `attempt.effect_authority.production_authority` contains the
company/root binding, founder reference and original adopted owner.

The task client checks that original seal at binding, every action/inspection,
replay and terminal commit. Global context validation retrieves the original
immutable admission command and compares its authority with the current attempt.
Removing a seal or substituting one shaped for a new owner cannot turn a
production admission into a generic admission. Genuine generic admissions keep
their original behavior. The production facade additionally requires a production
seal. The facade also
protects public founder assignment and grant mutations when the production host
uses its retained methods. `assertCurrent()` supplies a read-only preflight for
readiness/preparation; it is not a substitute for the atomic write guard.

An owner change before admission commit rolls back tentative bookkeeping. An
owner change after a successful admission does not refund the committed charge
or release its reservations. It fences subsequent startup/actions and requires
separate reconciliation. Source-only runtime status remains available for bounded
diagnostics. Genuine late process/result/closure observations stay recordable;
stale-owner output is quarantined rather than accepted as new work. No observation
or settled promise supplies missing whole-domain closure.

## Historical compatibility

Completed review proofs retain their original attempt and result after a lawful
transfer or cancellation. New authority transitions must name their immediate
immutable predecessor and exact producing event/command. Fieldless legacy
history is checked across every task revision, so deleting later producer fields
cannot hide an intervening modern authority transition.

The owning P1 reader `getTaskHistory(fromRef,throughRef)` returns complete,
contiguous exact task versions only. It rejects more than 10,000 revisions or
16 MiB of UTF-8 bodies before materializing them, invalid endpoints, missing
versions and noncanonical or mismatched hashes. Like other historical reads,
it requires an owning snapshot before writes. Policy evidence readers forward
this capability and event reads without granting write authority.

## Evidence still required

Temporary SQLite, synthetic source observers and induced provider/clock failures
can demonstrate successful ledger effects, currentness checks, replay isolation
and rollback after final staging. They do not demonstrate genuine selected
deployment/startup, authenticated native turn execution, provider/account or
whole-domain closure, durable replacement/continuity, company adoption or
founder benefit. Those remain separate owner-controlled qualification gates.
