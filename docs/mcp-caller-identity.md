# MCP caller context

The fixed `main.serve` boundary captures `tools/call` `params._meta` in a private
request scope. Tool arguments, a top-level JSON-RPC `_meta`, a binding file, a
principal row and returned diagnostics cannot substitute for that context. The
context expires when the complete awaited invocation returns or throws; detached
asynchronous work cannot reuse it. Capturing metadata grants no authority.

The reviewed Codex source contract supplies concrete `threadId` and root
`sessionId` strings outside tool arguments. A descendant has its own thread ID
while retaining the root session ID. New peer operations require a supported
Codex context whose two UUIDs are equal and whose session exactly matches the
requested `session_id`. The actor's `native_id` comes only from the observed
thread ID. Generic UUID forms are accepted without changing their bytes or
inventing a version-seven-only restriction.

The source audit uses the upstream commit pinned in
[the companion source package](../native/codex/README.md). Codex overwrites stale
identity keys in object metadata, but non-object metadata remains unchanged and
must be rejected. A host metadata extension runs after insertion, so the reviewed
fixed host/stdio composition is a necessary trust assumption. JSON shape and a
static executable version do not attest an installed host. Synthetic stdin tests
establish these source mechanics, not connected-host or native qualification.

## New peer access

Every Codex `company_peers` operation, including status and persisted reads,
requires this root caller context. Claude has the explicit weaker read-only
exception below; every other peer action retains the Codex-root requirement.
Neither tier admits an unqualified legacy route to production authority.
The current managed hook record must also match the actor, canonical folder,
plugin version/root and MCP data directory. Its bounded no-follow descriptor read
checks actual file and directory identity and file stability. Binding-file
existence alone is not identity proof.

The peer runtime still checks the actual canonical founder, owner epoch and
operation-specific grants, policy, qualification and physical commit fences.
Caller identity does not create a grant, start a provider, qualify an executor or
release a reservation. Unsupported clients and malformed, missing or mismatched
selectors Hold before peer access. Codex descendants and missing or malformed
Codex HOST metadata also Hold. Claude has no reviewed equivalent native identity
contract; its permitted read-only tier below does not attest a root caller.

### Claude hook-bound tier (weaker, read-only)

Claude supplies no host-observed thread/session identity. A separate
`requireClaudeHookBoundActor` admits only `company_peers` `status`, `inspect` and
`read` on Claude when all of these hold: an active fixed `main.serve` Claude
invocation, selector host `claude`, a well-formed `session_id`, and a current
managed hook record matching root, host, session, plugin version/root and data
directory. The actor is `{host:'claude',native_id:null,tier:'HOOK_BOUND'}`.

This tier is **not** native identity. It cannot tell a root chat from a subagent
or descendant that knows the session ID, because Claude exposes no descendant
marker. It never satisfies `requireCodexRootActor`, `native_identity_proof` and
`native_qualification` stay false, and the canonical founder, owner epoch and
operator checks inside the peer runtime still apply. Every mutating or
provider-starting peer action and the owner and origin lifecycle routes remain
Codex-root only. This opt-in does not change any other route's caller requirement.
`company_doctor.caller_identity` reports `hook_bound_tier_eligible` as data only.

`company_doctor.caller_identity` reports bounded observations without exposing
thread/session IDs. `authority_granted` and `native_qualification` remain false.
These diagnostics are not tokens and cannot be submitted to obtain authority.

## Legacy preparation and storage

Legacy logical preparation, including layout-4 adoption preparation, retains its
existing contract. The hook and missing/unsupported caller diagnostics explicitly
use `LEGACY_UNQUALIFIED`; this does not qualify a new peer owner or production
operation. This change does not claim that every legacy MCP mutation has been
hardened to actual host identity.

Legacy `Store` sets its connection-local lock timeout, then validates an existing
storage layout and peer-schema markers before persistent PRAGMAs or table setup.
Opening peer storage through the legacy
supervisor or another incompatible legacy route therefore cannot create legacy
`company`/`events` tables. Unsupported initialization closes its connection.
Ordinary SQLite sidecar behavior is not a general zero-filesystem-I/O promise.

Public owner handover, its narrow pending-owner lanes, layout-5 instruction
loading, native maintenance and task-bound receiver profiles require their own
reviewed producers and integration. They are not registered by this caller
context change. Native qualification, original obligations, expired permissions
and unknown closures remain separate gates.
