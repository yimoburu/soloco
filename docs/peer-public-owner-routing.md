# Public owner routing

This source adapter exposes the existing owner lifecycle for an already adopted
layout-5 company. It creates no company, migrates no database and grants no
ownership, native qualification or execution permission. Installing these files
does not establish that a live host has loaded them.

## Entry and identity

`company_open` and `company_status` discover the existing storage layout before
constructing a legacy `Store`. Recognized legacy storage retains its existing
route. Unknown, incomplete or inconsistent peer storage holds instead of
initializing legacy tables. Discovery reads schema and protocol metadata only;
canonical peer records are read after authentication.

`company_owner` requires the actual Codex root `tools/call` metadata, matching
session identity and the current managed startup-hook binding. Caller JSON
cannot supply an actor, native proof, provider, callback or readiness flag.
Descendant calls, missing metadata and stale hook bindings hold. The request is
validated and copied as closed JSON data before storage access. Claude has no
equivalent qualified ingress in this adapter and holds at the actual caller
gate.

Existing peer files are opened without creating or migrating storage. The
adapter checks canonical paths, links, layout and original-file stability;
unsafe or ambiguous storage holds. These checks provide source-level storage
guards, not host or native qualification.

## Cold start and exact reads

An unqualified startup hook emits only a routing hint. It does not deliver
instructions, establish custody, read private canonical records, acknowledge
notices or apply a pause. An exact pause prompt is reported as requested until
the actual root caller applies `company_owner` action `pause`.

An authenticated caller can retrieve status and all four original pinned parts
through `pinned_inspect` and `pinned_read`: plugin version, governance, roles and
CoS instructions. Follow every exact reference/hash and range until complete;
the installed team is never a substitute for the original bundle. Preserve roles
ordering and the original part byte hashes.

Private `context_inspect` and `context_read` require the actual canonical owner
or the typed pending custodian, the current epoch and valid custody lineage in
the owning snapshot. They cover all 17 canonical peer families. Pages contain
metadata and exact source handles; reads return complete canonical current row
values in bounded ranges. Unknown fields remain available. Changed revisions or
hashes hold; immutable history is not served as a current-row alias. This
canonical-value representation is not a raw legacy archive producer or proof
of archive meaning.

Replies are bounded to 24,576 encoded bytes. Context and pinned ranges are at
most 4,096 characters; credited owner subject/recovery ranges are at most 1,024.
Follow the returned offsets, including reduced ranges, without splitting
Unicode characters. Complete reading is not acceptance or permission.

## Transfer and maintenance

The outgoing owner first records the exact primary founder instruction as
evidence and issues an intent bound to one target, independent reviewer, finite
existing grant and expiry. Recording a quoted message does not mechanically
authenticate human approval. Before a real issuance, the responsible CoS and
independent review must verify the actual primary human record and its scope.
Synthetic test messages establish no real authorization.

The incoming target's `begin` consumes that original intent in the owning
transaction before revoking the outgoing owner or writing the pending
successor. A self-selected target or an ordinary artifact is insufficient.
Pending custody remains paused. Reconstruction, independent review, activation
and dedicated resume retain the existing currentness, authority, accounting,
history and uncertainty checks. Public ordinary peer operations also check the
typed custody and operating-state gates before starting providers or work.

Public review uses only the fixed source entry
`peers/maintenance-launch.mjs` export
`runOriginalPeerOwnerMaintenanceReview(lifecycle, {operation_id, epoch})`.
Missing support holds before admission or charge. The public tool accepts no
launch options or native handle. The helper must retain the original lifecycle,
ledger and protected native capabilities in the same source module namespace.
Provider failures propagate; a missing direct entry is distinct from a failing
transitive dependency.

The adapter never retrieves an oversized successful owner receipt through the
legacy `Store`. A bounded presentation hold points to persisted owner state;
inspect that state instead of repeating a mutation or review.

## Remaining composition gates

The raw owner protocol is not a qualified semantic-frontier controller. A
qualified begin, qualified refresh/currentness and late-dependency traversal
require their separately reviewed source producers and consumers. Complete
archive coverage, the typed origin seal, bounded bootstrap membership, shared
qualified local occupancy, fixed native launch/preflight and actual whole-wire
fit must all qualify in the final composition. Missing producers hold.

Source fixtures, source review, hosted CI, installed files, connected host
behavior, independent native acceptance and company adoption are distinct.
Nothing here resolves prior UNKNOWN effects, releases old reservations,
converts old allowance, extends deadlines or permits an unchanged retry.
