# Original task late evidence

`peers/task-late-evidence.mjs` retains a failed original task's later raw
observations as required, globally applicable notices. Its fixed source entry is
`recordOriginalPeerTaskLateEvidence(ledger, originalAdmissionRef, diagnostic)`.
This is an internal software API, never a model tool or a JSON proof issuer.

The original protected host must supply its opaque diagnostic token for kind
`task`. The consumer checks that token against the same ledger, immutable
`task/admit` command and complete original context. It verifies the admission's
creation event, task and principal history, then checks any recorded original
process identity. A copied object, another admission, another ledger, an owner
maintenance observation or a changed native/process cannot substitute.

One deterministic notice contains the complete observation. Identical facts
deduplicate even after an authorized notice disposition; the immutable original
notice remains their source. A changed observation creates another attributable
fact. All provenance reads precede writes, and the physical commit rechecks the
captured current heads after sealing public writes.

The path can run after pause, expiry, grant revocation or owner replacement. It
can also retain a failed launch's evidence before the scheduler records its first
result. It changes no task result, review, slot, effect, grant, usage or owner.
The notice expressly grants no acceptance, closure, retry or reservation release.
The separate original process/closure producer retains its existing contract.

Each complete notice must fit the ledger's existing 1,000,000-byte row limit.
Oversized input Holds without clipping or a partial record. The original host
must retain that failed opaque observation for inspection; it must not mark
delivery successful after a failed write or manufacture another observation.
This module does not solve retention beyond that limit.

Source integration remains required: the fixed protected-host publisher must
select this consumer for a failed original task and retain unsuccessful
deliveries. It must not use an owner-maintenance capability, publish diagnostics
from a healthy ordinary run or introduce a caller-selected callback. Current
main without the new original diagnostic producer Holds before any write.
Source fixtures substitute only a labeled synthetic native WeakMap; they prove
neither installed runtime support nor actual native qualification.
