# Original local worker inventory

The original worker inventory is a Source-owned capacity check. It does not
grant an attempt, change a budget, authenticate a human instruction, release an
old reservation, or prove isolation from other processes running as the same
user.

The two synchronous entry points are in
`runtime/peers/prospective-local-worker-inventory-producer.mjs`:

- `inspectOriginalLocalExecutionInventoryFrom(actualDb)` inspects the original
  physical database in its owning snapshot. Pre-quarantine mechanical QA uses
  this entry before reservation and again in the actual queue transaction.
- `assertOriginalPeerMaintenanceExecutionCapacityFrom(ledger, options)` checks
  the original frozen history together with the current peer reservations. The
  same function is exported through `origin-maintenance.mjs` for fixed launch
  composition. `reserve` requires room for one additional maintenance
  invocation. `existing` requires the exact retained admission and includes its
  own reservation once; it does not reserve another unit.

An internal transaction reader serves the actual admission and terminal commit
guards. It uses the already-owned physical connection. A detached pre-read,
nested `ledger.read`, second SQLite connection, caller validator, copied DATA
object, or mutable readiness flag cannot replace that boundary.

## Coverage and units

Retaining all current job rows is different from retaining all original
execution history. Positive capacity requires authenticated membership of the
retained inventory, applicable Source generation, and the original admission
and actual launch joins. Missing prefixes and unbound generations remain
explicit Holds, including when the visible inventory is empty.

The original engine admits at most three standalone assignments. A mechanical
QA grant spends one original assignment; its model-call bound is a separate
limit. Peer maintenance reserves
`new-origin-maintenance-model-invocation` units. Counts and receipts preserve
these meanings. An assignment is not converted into an arbitrary number of
maintenance invocations or raw process IDs.

A known unit whose closure is UNKNOWN remains occupied. Unknown closure does
not by itself make that unit's cardinality unknown. A malformed or unjoinable
unit, incomplete membership, or absent launch coverage makes capacity
unqualified and prevents new work.

Actual child birth and closure are distinct from launch intent, a terminal job
label, `finished_at`, a native ID, or a release Boolean. An error after spawn
cannot establish that the child never started. The development watchdog and its
sandbox child have separate launch boundaries. Original CLI-child closure
proves neither successful work nor descendant or whole-domain closure.

## Writer checks

Original queue and runtime-task reservation, worker claim, model invocation,
mechanical QA, and development execution use their actual Source writer and
launch boundaries. The peer inventory includes all reservation families; it
does not skip an unfamiliar slot merely because that slot belongs to another
workflow. Admission checks occur before spending, and terminal checks use the
physical transaction after the complete staged journal exists.

Fixed native launch, context callbacks, final send and successful completion
recheck their original admission. Negative observations, UNKNOWN records and
diagnostic custody remain evidence; they cannot create free capacity or renew
authority.

The actual new admission and its reservation also identify the one allowed
peer launch. The owning transaction prepares a private token after its rows
exist. Only successful physical COMMIT arms it; rollback leaves it unusable.
The central protected-domain binding claims that token, and the producer
consumes it before creating the actual child. Stored refs and cold reopen do
not recreate tokens. A failed claim or spawn retains the original spend and
reservation. Repeated capacity inspection is read-only and does not consume the
launch token.

Fresh original companies receive a Source-owned execution origin at their first
real `company.created` write. Existing databases are not enrolled by copying
that DATA. Source-owned job bookkeeping can be projected out of task meaning
only through the original Store's active snapshot and authenticated event
replay. An unfamiliar field or an unbound copy cannot obtain that projection.

The earlier scheduler and upgrade paths lacked these original launch tokens.
The current Source authors their token joins in the scheduler and upgrade
adapters; qualification of the final composition remains separate. Updating
test fixtures alone does not qualify those product paths. Existing role-reuse
checks can also remain conservative after a genuinely never-started child until
supported reconciliation recognizes that evidence; an error alone frees
nothing.

## Validation boundary

The cutoff correction retains the earliest genuine admission, execution and
adapter deadline in private Source custody. Full history and integrity checks
still run after mutable guards; the actual Popen, FD4 permit and Store COMMIT
then check the retained clock without another provider read. Re-entering the
same binding never starts a new budget. Guarded ordinary queue, completion and
development acceptance writes retain their own fixed producer's cutoff in the
same actual Store write scope.

If a real child was created before a later write or COMMIT failed, its original
producer retains that exact child for one cleanup schedule. The original
failure stays failed, and absence of a real close stays UNKNOWN. The protected
domain does not add a second escalation schedule or infer native creation
acceptance from this cleanup handle.

The follow-up correction ignores public closure flags on a privately retained
failed-launch error, including frozen errors. Worker release requires original
close observation and the existing canonical proof for every ordinary
invocation. A mechanical QA carrier also retains its exact admission/grant
binding across the queue and launch transactions, with current policy and full
history checked before the final spawn clock. The frontier's quarantine
dependency uses a static canonical import to avoid awaiting its own unfinished
module cycle.

The mechanical-review journal recognizes the four authenticated Original
assignment metadata events without treating them as model-result events.
An actual carrier close may append that metadata after job completion while
the completed semantic state remains closed.

This increment is authored Source with authored regression cases. No test,
project import, generator, compiler, provider, model, Native operation or actual
company-data inspection is performed by this Source authoring selection.
Temporary fresh Original fixtures can exercise the production writer grammar;
they do not establish that an existing company's history has complete coverage.
Independent review and the exact integration head's CI remain required.
