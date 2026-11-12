# Canonical owner controls and handover

`peers/owner-handover.mjs` is trusted source composition for layout5. It does
not add a founder role to ordinary peer membership. Its constructor receives
the actual host startup/normal-prompt identity from the fixed host, never an
identity, factory or validation callback supplied by a model tool request.

The lifecycle has explicit pause, begin, exact subject read, reconstruction,
independent review, activation and resume steps. `begin` requires a paused
safe boundary, a distinct incoming chat/native identity, a finite existing
independent reviewer grant, available existing budget/capacity and the complete
bounded subject. It must also require the canonical pinned-team bundle and
the distinct original owner-maintenance native context association. Missing
source capability or oversized evidence holds before revoking the old owner.

The subject is the complete current P1 namespace plus every recursively
referenced immutable peer body and the original pinned-team legacy bytes.
It does not enumerate arbitrary unreferenced obsolete ledger versions/events.
That distinction must remain explicit in whole-company continuity acceptance;
a broader archive obligation needs an additional bounded producer/preflight.

The atomic transition records an immutable outgoing revoked revision, then a
pending incoming canonical founder at the next epoch. It preserves all tasks,
attempts, grants, original usage, claims, failed evidence and UNKNOWN slots.
The incoming owner initially has only bounded inspection and reconstruction
operations. A successful independent original review can activate the owner;
the company remains paused until an explicit guarded resume. Failure never
restores outgoing authority. Pending state and retained evidence remain
inspectable, including after expiry or a source-change hold.

Every write uses an owning P1 guarded transaction. Complete current-row
enumeration and immutable history resolution occur before the first real put.
An original snapshot probe rejects a late earlier mutation. P1 rejects and
poisons reentrant writes during the flush. Public writes are then sealed;
all exact current dependencies are checked after sealing and at the physical
terminal boundary, with the original deadline as the commit cutoff. Replays
also check the current canonical owner. No public callback can reopen writes.

The fixed native bridge uses these internal capabilities:

- `prepareOriginalPeerOwnerMaintenance(lifecycle, {operation_id, epoch})`
  charges one existing global, reviewer and grant call before launch and
  returns an opaque original capability. Its immutable `admission_ref` never
  changes when a native process/thread is associated.
- `assertOriginalPeerOwnerMaintenance(capability, {ledger})` checks that exact
  pending owner, subject, reconstruction, reviewer, grant, phase and deadline.
  Inspecting a capability returns DATA and cannot reconstruct one.
- `originalPeerOwnerMaintenanceChannel(capability)` supplies bounded exact
  context reads and a first immutable output submission. The complete context
  must be read before submission. The channel is private to the original
  admitted reviewer; the public owning-chat API cannot manufacture one.
- `completeOriginalPeerOwnerMaintenance(capability, originalDrainToken)`
  consumes the fixed original owned-task-drain assertion. It compares the exact
  actual native/thread and terminal output with the private submission. Matching
  process, output or closure DATA cannot replace the original token.
- `holdOriginalPeerOwnerMaintenance(capability, {error})` records uncertainty
  and retains the consumed call and occupied slot. It grants no cancellation,
  closure, retry or acceptance authority, including after expiry.

The new context form is `peer-owner-maintenance-assignment-v1`, containing the
full subject, incoming reconstruction, exact reviewer and authority plus all
prior reconstructions/review attempts. It must have its own reviewed native
compiled association and callbacks; relabeling it as a task or membership
assignment is invalid. Reviews bind its exact SHA and the exact subject and
reconstruction. A negative judgment on the same reconstruction cannot be
erased by a later Pass. A changed reconstruction must retain prior evidence.

Owned-task drain preserves `group_absent: null`, `remote_domain_closed: false`
and no whole-domain claim. It does not clear any original UNKNOWN reservation
or qualify old failures. Native execution, independent actual owner acceptance
and runtime activation remain separate gates. Positive source tests use real
disposable SQLite fixtures with explicitly synthetic native/drain dependencies;
they are not native qualification or human/host authentication.

Integration still requires the canonical pinned-team producer from checked
adoption, the fixed distinct-context native bridge/drain producer, actual hook
identity capture and layout5 successor instruction loading, and the shared
model fence on ordinary grants/admission/publication while the incoming owner
is pending or activated-but-paused. No installed-team fallback is permitted.
