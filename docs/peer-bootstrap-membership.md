# Paused bootstrap membership

This SOURCE component implements a distinct membership controller and private
model/membership writer path. It does not enable a live company path by itself.
The ordinary unpaused membership factory and production scheduler interface
retain their existing checks. No Boolean enables a held scheduler or publisher.

The trusted host constructs `createPeerBootstrapMembership({ledger,actor})`
using its actual captured owner and original `PeerLedger`. The returned API is
limited to `enroll`, `activate`, `revoke` and bounded `inspect` operations.
`originalPeerBootstrapMembershipLedger(api)` returns the SAME original ledger
from a private WeakMap. Matching JSON does not create a service or capability.
There is no generic execute, grant writer, provider, launch callback,
native instruction selector or caller native identity in the phase API. Membership
activation does not mint an owner-QA grant.

The native helper joins these fixed core operations:

```js
prepareOriginalPeerBootstrapMembership(api, {
  operation_id, epoch, enrollment_id, phase,
  // reviewer_principal_id only when phase === 'review'
});
assertOriginalPeerBootstrapMembership(cap, {ledger, stage});
inspectOriginalPeerBootstrapMembership(cap);
originalPeerBootstrapMembershipPreflight(cap);
prepareOriginalPeerBootstrapMembershipContext(cap);
bindOriginalPeerBootstrapMembershipNative(cap, originalCreationToken);
originalPeerBootstrapMembershipChannel(cap);
completeOriginalPeerBootstrapMembership(cap, originalDrainToken);
holdOriginalPeerBootstrapMembership(cap, {error});
recordOriginalPeerBootstrapMembershipLateEvidence(cap, originalDiagnosticToken);
```

The strict reserved/execution assertion returns exactly `protocol`, `kind`,
`admission_ref`, `context_sha256`, `native_id` and `deadline_at_ms`, with protocol
`peer-bootstrap-membership-admission-v1`. Native identity is null before birth
and the actual original UUID afterwards. The context projection has exactly
`text`, `sha256`, `utf8_bytes`, `context_ref` and `review_subject`. The wire getter
returns the SAME original opaque preflight plan, not a reconstructed plan.

The private membership join creates a distinct bootstrap enrollment marker,
complete qualified assignment, immutable per-phase admission and existing
membership phase/reservation/usage rows. It retains existing membership IDs,
generation/replacement lineage, finite enrollment recovery and independent
activation checks. Admission performs the original whole-RPC preflight before
the first planned put and increments the original global, principal and
enrollment model usage exactly once. One attempt exists for each phase; a
negative review, failed delivery or uncertain execution does not buy another.

Each positive operation requires the actual owner/custody, paused state, held ordinary
runtime, ORIGINAL selected maintenance generation, genuine final origin seal,
current checkpoint, separately selected finite bootstrap purpose, complete
qualified current meaning/full pins, current contributor independence and
shared capacity. Later `company/pause` changes the original generation even
when the company was already paused; a constructor never renews or backfills
that selection. Native delivery and completion also recheck the original
enrollment, recovery and complete source-cut meaning. The physical writer
retains the original finite purpose/enrollment/phase deadlines, full current
read set, prewrite uncached original probe, write seal and terminal get-only
postimage checks. No historical read runs after the first actual put.

The native creation inspector receives EXACT expected `{ledger,admission_ref,
context_sha256,kind}` from the private cap. The fixed binder alone writes the
immutable `bootstrap_membership_creation` and running phase. It retains the
complete original `facts.original_runtime` assertion with the SINGLE exact
shape `scope_root, state_root, scratch_root, launch, directory_pins, protocol,
read_paths, native_permission_profile, creation_tools_sha256, context_binding`.
Old aliases are rejected. The actual native helper owns source, runtime,
directory, catalog, request/birth and SAME-plan correlation; JSON is not a
substitute for its original opaque creation token.

The native channel exposes only `header`, `read({sha256,offset,length})` and
`submit({sha256,content})`; no operation ID is forwarded into those callbacks.
Reads are at most 4096 characters with exact SHA/UTF-8 boundaries and complete
coverage before first submission. Reconstruction is nonempty UTF-8 text at
most 12,000 bytes. Review is canonical JSON with exactly `{content,review}` and
`review:{subject,context_sha256,verdict,reason,blockers}`. It binds the EXACT
completed reconstruction and admitted outer SHA. The first attributed
submission must equal the final original drain output byte for byte.

Completed turn/request/SAMEEOF and original child/FD/broker observations do not
claim whole-domain closure. In particular `group_absent:null` and
`remote_domain_closed:false` do not release old UNKNOWN slots or renew units.
Releasing a NEW local phase reservation additionally requires the fixed
`assertOriginalProtectedBootstrapMembershipClosure` original-token assertion:
`peer-bootstrap-membership-owned-unit-closure-v1`, scope
`original-owned-admitted-bootstrap-unit`, exact native/admission/context/turn,
output/drain hashes and explicit no whole-domain or prior-UNKNOWN release.
Its separately frozen native component is joined by name; if its export is
absent on this base, preparation Holds before charging. Hold and late-evidence records preserve
spent usage and reservations, retain attributable raw facts and required
notices, and confer neither acceptance nor reservation-release authority.
Genuine owned diagnostics use a separate narrow source-observer writer after
expiry or a later pause. It rechecks SAMEledger, immutable original admission,
context, birth/native facts and the genuine opaque nonqualifying diagnostic;
it does not reuse current positive permission. The writer can append negative
evidence/notice/phase lineage and move unfinished work to UNKNOWN, but cannot
release slots, charge/refund, create an attempt or rewrite an accepted result.
Current physical legacy/sidecar fences, a final uncached prewrite probe, write
seal and get-only postimage checks remain. Raw error-only Hold is not a way to
bypass positive permission; later native failures require the genuine diagnostic.

`assertOriginalPeerBootstrapReviewerProfile(ledger,{reviewer_principal_ref,
native_id})` is a cold historical DATA prerequisite. It validates the actual
active reviewer and immutable original enrollment, both phase admissions,
contexts, original births, full delivery/first submission, raw result/drain,
independent exact Pass, original control/source bindings and deadlines. It
commits to the COMPLETE original runtime and creation facts. It does NOT reuse
current bootstrap run permission, require an old current pause generation or
erase historical qualification after a later genuine pause/owner transition.
Old positive execution caps remain fenced. Later owner QA separately requires
actual current owner/grant/purpose/capacity and native runtime/catalog/directory
validation against the exact original typed birth; these DATA issue no live
capability or new grant.

## Current source checkpoint and remaining Native boundary

At merged source
[`62928101`](https://github.com/yimoburu/soloco/commit/62928101c9b78dd91be2ce4699d46580a0dfef98)
([PR #117](https://github.com/yimoburu/soloco/pull/117)), the selected-maintenance,
finite-purpose, final-seal/checkpoint and qualified source-cut joins are
implemented. `bootstrap-membership-context.mjs` validates the actual paused
owner/custody, original purpose, sealed origin and complete checked checkpoint.
Missing or stale evidence still Holds; the presence of those validators does
not supply qualified meaning or permission for a live company.

Enrollment spends one nested enrollment unit. Each admitted phase spends one
nested model unit and the corresponding outer maintenance, global, principal
and enrollment model units; review also spends one nested and outer review
unit. Those writes belong to the same membership command. Exact duplicate
operations do not spend again. Typed command
and event replay authenticates each charge, the historical authority baseline
and every supported namespace transition. Reconstruction and review retain the
same checked semantic source cut; complete current observations and spending
travel separately in the assignment's `bootstrap_accounting`. Limits, original
expiry, pause selection, failures and UNKNOWN reservations remain binding.
See [paused-bootstrap accounting](bootstrap-membership-accounting.md) and the
[three-tool context codec](bootstrap-readonly3-context.md).

The real missing boundary is fresh bootstrap Native creation and closure.
`prepareOriginalPeerBootstrapMembership` checks for the original
`inspectOriginalPeerBootstrapMembershipCreation` and
`assertOriginalProtectedBootstrapMembershipClosure` exports before phase
admission or charging. `protected-codex-domain.mjs` does not export them at this
checkpoint. Its ordinary owned-task creation token explicitly records
`fresh_bootstrap_creation:false`; neither it nor matching JSON can fill that
gap. Missing fixed exports Hold; errors from a present module, its transitive
imports or actual provider propagate unchanged. No installed-source fallback
supplies an issuer.

Bootstrap qualification, selected qualified owner begin and the historical
reviewer profile remain distinct end-path requirements. Raw owner begin or a
synthetic selected begin cannot substitute for the required original producer.
Source integration does not establish actual Native creation, maintenance
launch qualification, membership activation, company adoption or production
readiness, and it releases no old UNKNOWN reservation.

The earlier controller fixtures exercise the real controller and
model/membership joins on temporary SQLite with explicitly synthetic
accounting/native/preflight/selected-unit closure predecessors. Their birth,
coverage, result, review and activation rows come from that writer, not seeded
positive historical native claims. The later accounting and codec fixtures
exercise the actual typed source joins with their own labelled predecessors;
they do not create a Native issuer. These cases cover source state-machine
behavior, not real founder approval, full-pin/native semantics, host adoption,
company action or a completed operational end-path. This documentation update
reports no new test execution.
