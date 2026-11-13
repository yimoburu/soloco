# Legacy project development ceiling control

This SOURCE backend supports only existing normalized layout-4 companies. It
does not register a public tool. The fixed future router must first obtain the
actual supported root HOST actor and current managed-hook binding through
`engine.peerCallerActor`. Every backend entry independently requires the same
active `requireCodexRootActor` observation before opening storage. Matching
caller JSON, an old actor object or a startup file alone cannot replace it.
This is source identity, not native qualification or business permission.

The five awaited source exports in `runtime/development-budget.mjs` are
`inspectLegacyDevelopmentBudget`, `proposeLegacyDevelopmentBudget`,
`applyLegacyDevelopmentBudget`, `restoreLegacyDevelopmentBudget`, and
`reconcileLegacyDevelopmentBudget`. Each takes `(root, actor, input)` and uses
one complete `withLegacyPublicStore` lifetime, its original writable connection
and the Store's physical entry/final-precommit fences. A fresh `owner()` check
occurs in each owning read/write and again at final precommit. Layout 5, unknown
storage and changed storage Hold; they never retry through a legacy fallback.
The source actor argument has exactly `host`, `session_id`, and `native_id`;
Codex root session and native IDs must be the same actual observed UUID.

## Closed operations

All inputs require a positive current `epoch`. Mutation instructions are
nonempty valid UTF-8 without NUL, at most 1,000 UTF-16 characters. These source
functions accept no caller callback, provider, filename, layout, proof or actor
field in their operation payloads.

| Operation | Other input fields | Effect |
| --- | --- | --- |
| inspect | Optional exact `ref`; exact range adds `canonical_sha256`, `offset`, `length` (1..4096); or list `cursor`/`limit` (1..20) | Read-only configuration and bounded persisted audit, no delivery write |
| propose | `max_bytes_ceiling`, `expected_config`, `source_instruction`, `restoration_policy` | Persist a proposal; do not change the file |
| apply | `proposal_ref`, `source_instruction` | Apply that exact current-owner proposal once |
| restore | `applied_ref`, `expected_config`, `source_instruction` | A new explicit operation targeting only the retained original bytes/absence |
| reconcile | `intent_ref`, `source_instruction` | Observe interrupted facts; never repeat a file action |

Ceilings are safe integers from 1,000 through 1,000,000. The sole restoration
policy is `retain-original-explicit-cas-restore`. Inspect supplies the exact
config reference; references are not authority. A proposal binds the actual
company, creator/epoch, complete file preimage or absence, explicit finite
target, instruction and restoration policy. A changed config (including a
same-byte replacement inode), stale record reference or owner change refuses
apply. Current owner/epoch is checked independently of these references.

This control may be inspected or used while paused; it does not resume work.
It does not mutate governing intent/decision/preference records, existing
development scopes or grants, attempts, expiry, timeout, output allowance,
prototype limits, native calls, or independent acceptance. A larger project
ceiling never enlarges a frozen grant. Existing worker, test, review and
acceptance checks still Hold/cancel when the project ceiling is lowered below
the original selected scope. Source bytes, transport/model context, test
output, time and execution permission remain separate bounds.

## Durable intent and interrupted outcomes

The operational audit is the fixed `development_budget_control` root value.
It uses existing layout-4 normalized storage, ordinary Store events and exact
revision/hash references; it creates no new SQL table or hidden database.
There are at most 64 retained operations and one unresolved intent. Capacity
Holds preserve history rather than deleting it. Unknown root extensions remain
compulsory context under the existing context implementation: budget audit
changes can change an in-flight context hash or cause a context-size Hold.
There is no silent audit exemption. Governing/grant authority hashes and the
grant bodies themselves stay unchanged.

The complete namespace is capped at 1,100,000 encoded UTF-8 bytes. Preparation
and conflict observations reserve 20,000 bytes plus the last phase slot for a
terminal factual reconciliation, so bounded observation history does not consume
the capacity required to release only the administrative intent.

SQLite and `.company/development.json` are separate storage systems. There is
**no atomic SQL-plus-JSON commit**. The protocol is:

1. Commit PREPARED intent with exact original bytes/absence before any external
   preparation. Original owner, storage and config CAS must match.
2. Under a new owning writer, retain an exclusive original-byte evidence file
   and create a private exclusive stage, complete write/fsync/readback through
   its original FD, then commit STAGED with the stage identity and hash.
3. Under a new owning writer, recheck owner, storage, stage and config, perform
   one fixed rename, fsync and exact readback, then commit APPLIED. A final
   synchronous guard rereads current owner/config before SQL COMMIT.

All supported budget writers serialize their checked filesystem action through
the same actual SQLite writer. This is checked filesystem CAS, **not atomic CAS
against an uncoordinated external writer** between check and rename. Sequential
manual changes are detected. Concurrent manual/other unsynchronized config
writers are unsupported and may race that gap; no never-clobber guarantee is
claimed. Root/company/config FDs and names are checked; links, hardlinks,
nonregular files, invalid UTF-8/JSON/ranges and observable drift Hold.

After a failure, PREPARED/STAGED and any surviving files remain. A held response
with `DEVELOPMENT_BUDGET_OUTCOME_UNCERTAIN` includes the internally selected
`operation_id`, an optional `last_confirmed_ref` explicitly marked as possibly
stale, and a current-owner inspect-list lookup. The preparation might not have
committed. A successful native SQL COMMIT followed by acknowledgement loss can
leave a later persisted phase than that last confirmed reference, even APPLIED
with no active intent. First inspect `active_intent` and the complete paged
operation list, find that ID, then read its current exact ref. Reconcile only
when the current record is the active interrupted intent. A terminal APPLIED
record is observed persisted fact, never a regrading of the original failed
RPC as success. No unchanged apply/restore is automatically retried. Original
failure code and message SHA256 are retained without raw error paths. Failures
before all preparation owner/source/config checks still propagate the original
provider error; no synthetic recovery reference is minted for them.

Reconcile can record NOT_APPLIED or an exact original
stage observed at the target as RECONCILED_APPLIED. The latter does not turn
the original failed call into success. A different current config stays a
CONFLICT with its intent retained. A current new owner can record old-owner
facts but cannot apply the stale old-owner proposal.

PREPARED plus partial stage without a committed stage identity can still be
reconciled: exact observed original preimage/absence permits NOT_APPLIED and
releases only this administrative intent. It does not assert that staging or
execution historically never happened. Surviving partial files remain. No job,
QA, old UNKNOWN reservation or allowance is released. A reconciled target with
the durable stage identity becomes the latest effect and is eligible for a
separate explicit CAS restore. For interrupted restore-to-absence, reconciliation
requires both observed config absence and the selected original inode/bytes at
the fixed retained `.removed` location; absence alone proves no such effect.
Each record has at most 40 retained phases. Repeated observations cannot grow
history indefinitely; reaching capacity Holds without deleting evidence.

Restore requires the exact latest applied generation and current file CAS. It
never overwrites a later supported configuration or an observed sequential
manual change. Original bytes are restored in a new private 0600 file, not the
original inode, timestamps or mode. Original absence is restored by moving the
exact selected current file to a unique retained evidence name. No automatic
restoration, deletion or cleanup occurs on return, failure or later commands.

Complete public-facing result DATA is bounded to 24,000 encoded UTF-8 bytes.
Lists disclose totals and hash-bound cursors. Exact record retrieval is separate
and bounded. An oversized exact record returns its canonical SHA256, total
length and an exact chunk request. Ranges use UTF-16 offsets in the complete
canonical JSON, preserve surrogate boundaries and return the actual next offset.
Concatenating all chunks must reproduce the complete canonical hash. Bodies and
records are never clipped into a claimed complete result. A failed or oversized
presentation cannot authorize retry of an uncertain mutation.

Tests use temporary real SQLite/layout-4 and filesystem fixtures with synthetic
HOST identity/owner/grant records and controlled fault seams. They establish
source mechanics, not actual company changes, native process qualification,
model capacity, installed host trust or issue #18 acceptance.

The over-100-KB complete generation/test/independent-review SOURCE fixture must
actually execute on a supported Seatbelt host before claiming that integration
requirement. Its explicit unsupported-platform skip is a remaining evidence gap,
not a positive result, and there is no unsandboxed fallback. A future hosted
macOS source run must verify that case passed without a skip.
