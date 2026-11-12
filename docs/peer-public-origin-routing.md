# Public origin routing source component

`peer-origin-runtime.mjs` defines the proposed closed `company_origin` tool,
`validatePeerOriginRequest`, `peerOriginRuntimeAction` and the internal
`preparePeerOriginMechanicalReviewRequest` request builder. Tool registration
and the current managed-hook wrapper belong to the engine integration. This
component alone does not register a tool, activate a package, initialize a
company, qualify a native runtime or authorize quarantine.

The engine must call this adapter only after its actual root HOST/current
managed-hook check. The adapter independently derives the Codex root actor
from the active HOST metadata and requires the session selector to match.
Neither an actor object nor a native proof can be passed in JSON. Descriptor
checks and a bounded deep copy precede filesystem access. Unknown keys,
accessors, proxies, unpaired Unicode and unsupported ranges are rejected.

Every request includes an absolute `root`, `session_id`, current positive
`epoch`, `action` and an action-specific closed `input`. Mutations additionally
require `source_instruction`. Inputs cannot choose a callback, provider,
ledger, module, launch recipe, authority, qualification or readiness flag.

## Storage and ownership

The trusted internal `withPeerPublicStorage(root, readOnly, invoke)` export
reuses the owner adapter's original strict filesystem preflight, directory and
file descriptor pins, file/root versions and actual SQLite binding checks.
Layout 5 delegates to the unchanged `withLedger` implementation. Layout 4
opens only an existing read-only database; it cannot use the legacy writable
Store or create/migrate a database. This callback is trusted source code,
never public JSON and never a permission token.

Legacy private reads authenticate the stored owner hash and exact current
epoch, then check compatible runtime, original pinned team integrity and
unresolved handover. Layout-5 private operations check the actual canonical
founder principal, current owner epoch and original typed transfer custody.
A stale selector or protocol-shaped handover record grants nothing.

An existing unsupported, malformed or linked `.company` remains held. Read
tests compare every SQL schema definition and table row before and after;
they do not claim that SQLite never creates its own read bookkeeping files.

## Legacy plan, review and quarantine

| Action | Source behavior |
| --- | --- |
| `status` | Bounded layout/owner/paused status, without initializing storage. |
| `plan` | Fixed checked-epoch plan producer, original owning actor, current paused company and original full cut. Requires `recordPeerOriginQuarantinePlanAtEpoch` to check the expected epoch inside its actual writer. |
| `plan_inspect`, `plan_read` | Canonical complete decoded plan record with its separately labelled original storage reference, content hash and exact ranges. |
| `mechanical_review` | Fixed dedicated engine dispatcher, through an internal request builder. Missing genuine dispatcher Holds before queueing. |
| `mechanical_preflight` | Actual original mechanical validator in a legacy snapshot; checks genuine job, native/context/closure evidence, full journal and unchanged original cut. No mutation and no acceptance issued. |
| `quarantine` | Actual checked original quarantine producer, including its verified backup and fences. Then strict layout-5 reopen, canonical owner/epoch/custody and exact persisted origin reference. |

The request builder returns `planned_not_dispatched: true` and a fixed legacy
dispatch request with `role: qa` and a STRING `review_of`. It does not enqueue
a job, attest a producer or mint native evidence. The dedicated engine entry
must revalidate the original plan producer, owner, epoch, paused mechanical
eligibility, fixed request and maximum one attempt in the actual queue writer.
Scheduler and worker paused gates must explicitly join the genuine original
mechanical predicate. A caller-supplied Pass cannot replace any of these.

The checked-epoch producer and dedicated dispatcher are integration
dependencies. When absent, the respective actions return named Holds before
plan creation or job admission. Other existing backend operations remain
usable; the adapter does not replace them with placeholder success or Holds.

After successful apply, the response is a small persisted receipt containing
the exact origin row reference, backup manifest hashes/count and the
`company_owner context_read` handle for the complete original origin record.
It does not inline a potentially large backup list or reopen a legacy Store
after the layout fence. Quarantine leaves execution paused and preserves old
UNKNOWN, spent grants, archive entries, limits and deadlines.

## Exact layout-5 retrieval

`status` exposes the current origin reference, manifest section counts and
page counts, late obligation count and seal reference. It is observational
data; it does not grant execution or declare native qualification.

`manifest_inspect` describes one exact original manifest page. Its hash covers
the complete canonical response representation, including the original page,
current origin reference and pagination metadata. `manifest_read` requires
that current hash and returns Unicode-safe exact ranges. A manifest descriptor
hash or a truncated prefix is not presented as complete content.

`source_read` uses the original backend source reader, exact original source
ID and original content hash. If that backend cannot reproduce original raw
bytes, its original encoding Hold is preserved; the public route does not
silently substitute a new encoding. A future genuine raw archive reader is
consumed through its fixed source export when available.

Replies are at most **24,576 encoded bytes** using the same double-escaped MCP
envelope calculation as the legacy source. Exact ranges are at most 4,096
UTF-16 code units, preserve surrogate boundaries, state the actual returned
length and next offset, and require the current full source hash. Escaping can
reduce the delivered range below the requested length. Reads earn no semantic
qualification or reconstruction coverage credit.

## Origin maintenance, input frontier and final seal

Existing source actions include `maintenance_status`, `maintenance_operation`,
`maintenance_run`, `range_seal` and `observe_sidecars`. The last creates an
original unresolved late obligation only; it grants no closure or release.
The range seal is the original range seal, not the final checked frontier seal.

The optional fixed input-frontier module supports `frontier_capture`,
`frontier_inspect`, `frontier_sources`, `frontier_source_read`,
`frontier_archive_read` and `frontier_run`. The optional fixed final-seal
module supports `final_seal_review` and `final_seal_apply`. Missing actual
exports remain named Holds. Original selected purpose, finite maintenance,
current generations, full source obligations, independent review and original
physical drain remain the backend's mandatory gates. An old positive does not
become current by reading it or by retaining the same paused Boolean.

Before positive maintenance run/range seal, frontier capture/run or final seal
review/apply, the adapter imports the fixed
`peers/origin-maintenance-authority.mjs` entry and calls its original
`assertPeerOriginSelectedMaintenanceFrom(tx, {company_id})`. A missing entry or
export Holds before the original factory/prepare; original provider exceptions
propagate unchanged. This outer read is not a substitute for the original
backend's per-use generation/capability guards. It cannot select, renew or
backfill an old origin. Reads and late UNKNOWN observation do not confer
selected maintenance.

Native launch is source-owned through exactly these high-level exports:

| Fixed facade | Fixed original API getter owned by the backend/helper |
| --- | --- |
| `runOriginalPeerOriginMaintenance(api, {operation_id, kind, segments, reconstruction_ref?})` | `originalPeerOriginMaintenanceLedger(api)` |
| `runOriginalPeerInputFrontier(api, {operation_id, frontier_id, node_id, stage})` | `originalPeerInputFrontierMaintenanceLedger(api)` |
| `runOriginalPeerOriginFrontierSealReview(api, {operation_id, frontier_ref, root_result_ref})` | `originalPeerOriginFrontierSealLedger(api)` |

The native helper must validate the original API, actual ledger, source,
runtime/profile and original preflight before prepare/admission/charge, then
retain the original callback, send permit and physical drain chain. This
adapter imports no low-level launch/Symbol and reconstructs no capability from
persisted JSON. If a direct fixed entry is absent, it Holds. If it exists,
import/transitive/provider exceptions propagate with their original identity,
including `AggregateError`, cause and members, even when they use a
missing-module-looking code or matching URL.

An oversized successful backend result is not retried. The adapter returns a
bounded operation-returned receipt and original inspection pointer; original
persisted state remains the authority for inspection. Such a receipt is not
acceptance, a complete native result or a permission grant.

## Validation boundary

`tests/peer-origin-runtime.test.mjs` uses disposable fictional SQLite databases
and the actual source validators, journal, backup/fence producers and strict
storage opener. Its original sidecar C helper is compiled from repository
source under a SYNTHETIC test selection. Its context witness and process facts
are explicitly SYNTHETIC. These tests do not run a model/native provider,
change a real company, select production policy or grant, review host hooks,
install a package or establish native/company acceptance.

The source suite covers closed input and HOST gates before filesystem access,
legacy/peer state and schema preservation, canonical owner/epoch/custody,
original plan and mechanical journal validation, bounded exact Unicode reads,
post-layout persisted receipts, retained UNKNOWN and limits, missing producer
holds and unchanged original present-entry exception identity. Integrator QA,
actual engine registration/current-hook checks, native qualification and owner
acceptance remain separate evidence.
