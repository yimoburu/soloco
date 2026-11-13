# Original owned-task lifecycle custody

The protected companion can report an original response completion after its
actual `response.completed` event and the same response body's successful drain.
The private Native decoder emits `original_response_terminal_drained` on FD3.
It binds the startup nonce, process and host instance, request ID/hash/sequence,
response ID and terminal payload hash. Only successful publication releases that
request's Native reservation. Raw transport EOF, a turn notification, shutdown,
or a caller's JSON/Boolean cannot substitute for this observation.

Node reserves an entry before each send permit and retains every entry. Each
needs its correlated successful transport headers, raw EOF and authoritative
terminal witness. An earlier unresolved request cannot disappear behind a later
successful one. Replay, a foreign binding or post-terminal work fails closed.

`bindOriginalProtectedTaskAdmission` captures the actual scheduler's revision-1
`commands` reference and the original ledger/connection, task, attempt, principal
generation, enrollment and context. The fixed Source composition may retrieve
opaque capabilities with `originalProtectedOwnedTaskTokens(owner, launch)`.
Copied objects, another module's tokens, another ledger or mixed bindings are
not capabilities.

The read-only assertions accept exactly `{ledger, admission_ref,
context_sha256, kind:'task'}`:

- `inspectOriginalProtectedOwnedTaskCreation` reports the ordinary task's
  original thread association. It is **not** fresh bootstrap creation and issues
  no authority.
- `assertOriginalProtectedOwnedTaskDrain` additionally requires the exact single
  successful turn/final output, every response witness, no pending RPC/tool or
  backend operation, original successful exit, all five pipe/stream closures,
  and observed local broker closure. Current admission and deadline must still
  hold. Cancellation, signalling, errors and observed stale state do not recover
  into positive custody.
- `assertOriginalProtectedOwnedTaskDiagnostic` returns only immutable negative
  evidence with `qualifies:false`, original binding and a hash of the complete
  observation. It can be inspected after expiry/failure without requalifying a
  current admission. It grants no acceptance or reservation release. The
  existing late-evidence consumer retains its separate original-source and
  guarded-write checks; this API does not invoke it or write company records.

Assertions are inspections, not new attempts. Existing consumer finalization
guards own their once-only writes; inspecting the same token cannot rebind it
to another attempt or grant new work.

The narrow proof retains `group_absent:null`, `remote_domain_closed:false`,
`whole_domain_qualified:false` and `prior_unknown_slots_released:false`.
The existing companion whole-domain `physical_close` gate remains Held and
`r.closed` remains false. Global inventory/cardinality, old UNKNOWN outcomes,
charges, grants and policy are unchanged. UNKNOWN jobs can still be counted
conservatively as occupied under their own qualified capacity contract.

Fresh read-only-three-tool bootstrap/owner/origin-maintenance creation and its
closed delivery codec/profile remain separate Source dependencies. Ordinary
task/membership protocols are not aliases for them, and no positive bootstrap
creation producer is exposed by this patch.

The authored Native overlay and Node custody tests require exact-cut review and
selected validation. Native recipe/binding/materialization updates, actual
compilation and complete host/runtime qualification are separate steps. Source
test doubles and a compiled-source-only receipt establish no Native or company
acceptance, installation, activation or production readiness.
