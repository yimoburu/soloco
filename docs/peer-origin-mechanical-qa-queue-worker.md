# Original mechanical QA queue and worker SOURCE joins

The fixed `company_origin mechanical_review` join dispatches only the original
selected pre-quarantine review packet. Public input is exactly `plan_id` and
`grant_ref`; the actual current HOST/managed-hook/owner/epoch checks precede
`engine.dispatchPeerOriginMechanicalReview({root,session_id,epoch,input},host)`.
The source function returns the existing bounded job mutation receipt. No
caller chooses a job template, context, model, provider, identity or launch.

The dispatcher reads the backend's complete original template/context in an
owning snapshot before CLI/catalog probes. It validates the actual available,
authenticated CLI and advertised model/effort controls, then reselects the SAME
original packet/grant inside the actual `job.queued` writer. It reserves exactly
that job with `reservePeerOriginMechanicalQaFrom` and preserves the opaque
receipt only in the SAME Store closure. The LAST `beforeCommit` fence calls
`assertOriginalPeerOriginMechanicalQaReservationCommitFrom`, after every other
provider read. A failed final read, changed owner/epoch/selection, UNKNOWN
inventory or expiry rolls back the queue, new session and one-attempt charge;
the worker is launched only after commit. There is no job-count fallback or
second capacity pool. Worker spawn failure retains the spent original job and
never selects another grant or attempt.

Ordinary `company_dispatch` rejects an ACTUAL `origin_quarantine_plan` target
before CLI probes and again inside its owning queue writer. A paused eligibility
predicate or request flag cannot bypass the fixed original receipt path.

`worker.work` routes actual plan targets, and original admission hints, to the
fixed mechanical worker. Hints only select stricter validation; they confer no
authority. A second fence inside the ordinary claim writer prevents a
classification race from falling through to ordinary context/admission logic.
The fixed helper requires the actual backend job assertion before claim, then
uncached during EVERY monitor cycle, before the original model-process request,
before the model adapter and at publication. It reads the original packet with
`prepareOriginalPeerOriginMechanicalQaContextFrom`; ordinary changed-state
`assignmentContext` and `contextMatches` are never used for this target.

The complete fixed instruction, exact source-selected task and FULL original
context must fit the selected `max_context_utf8_bytes`; no source or instruction
is truncated. ONE complete review invocation is selected. The backend's
`max_native_calls` (1..17) is a ceiling, not an instruction to use every call.
No supplemental-read, automatic retry or resumed-native loop exists. The full
original timeout window must still fit the original deadline before a request
or actual spawn; a late start cannot renew it or mutate the packet timeout.
The existing adapter's minimum finite output bound is 100000 characters; the
worker also requires the complete returned UTF8 review wire to fit 100000 bytes.

The original request journal increments BEFORE the adapter is called. After
that append, the original backend job assertion and private invocation identity
bind the pending request; calling the backend *next* invocation predicate again
would incorrectly ask for an additional call. The adapter's existing PRIVATE
`spawn` seam places the fixed original guard after executable/provider
resolution and BEFORE the real child is created. Its public `onSpawn` callback
occurs after creation and is used only for actual execution-timing accounting.
No caller supplies this guard, callback or capability as JSON.

Original runtime `requestModelProcess`, birth and child-close producers remain
unchanged. The fixed private original callbacks retain observed birth/closure
even after a positive permission barrier, without using that negative custody
to authorize a call. An original late close is persisted before the unchanged
canonical reconciler records local closure for ONLY that new failed unit; its
spent attempt and failed status remain, and old UNKNOWNs remain untouched.
Successful return needs the original birth, close, timing,
zero exit/signal and fresh independent native identity; old coordinator,
original job/session/retired native aliases cannot become this reviewer.

The review envelope has only `content,messages,notices,review`, with empty
messages/notices. The complete original task/plan/cut and mechanical permission
markers must match exactly. Pass has no blockers; Fail/Blocked remain original
adverse results. The result is a review record with full raw response/SHA and
context lineage, not quarantine execution or a native/global capacity proof.
Only the original existing guarded quarantine validator can consume it.

Positive publication uses the original owning writer and reasserts the actual
backend job/context/selection, exact postimage and original deadline after the
LAST provider read. Source/provider failures preserve their original exception.
After an admitted failure, only that original worker's job receives complete raw
negative output and observed process lineage. An unclaimed worker adds no row
or charge. Failed/unknown work never resets its one attempt or alters old
UNKNOWN reservations, expired grants or historical accounting.

This is SOURCE implementation, not genuine execution qualification. The actual
complete per-execution inventory producer is absent, so positive production
reservation/invocation remains Held. The original dba backend native-history
deletion counter remains FAILED at its original head. This composition uses
the exact independently reviewed 808 repair, with dependency hashes recorded
separately; queue/worker tests cannot relabel the old defect as accepted.
Disposable tests may supply an
explicitly SYNTHETIC inventory and native observations to exercise the real
state machine and SQLite rollback, without attesting global cardinality, actual
human producer authenticity, native isolation or live acceptance.
