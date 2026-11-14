# Private model outcome custody

The opt-in model outcome API connects an actual prepared model request to the
primitive text returned by the adapter, or to its original thrown value. It
uses the same private launch and process observations as the ordinary runtime.
It supplies evidence to a trusted Source consumer; it grants no additional
invocation, test attempt, filesystem publication, Native or company authority.

## Prepare and confirm the request

For the legacy route, prepare the model token with
`prepareRuntimeModelRequestFrom(store, state, input)` in the actual
`job.model_process.requested` transaction. For the opt-in Original route,
`prepareOriginalModelRequestFrom(store, state, input)` uses the existing
`job.model_process.launch_requested` transaction. The latter is a distinct
stage after recording the model invocation. Consumers must preserve the actual
transaction type and scope when joining their own pending issuer state.

`inspectRuntimeModelRequestCommitFrom(token, issuingStore)` returns a frozen
request confirmation derived from the same actual Store, database, root and
write scope. Its fields include the lane, transaction type, job, instance,
invocation, prepared input binding and approved timeout policy. The input
binding includes the existing prompt hash plus `prompt_utf16_sha256` and
`prompt_utf16_units`. The UTF-16 hash covers the exact little-endian code units
without a BOM, so distinct lone surrogates remain distinct.

Only the fixed runtime commit hook retains this confirmation after checking
the Store's lexical physical-COMMIT witness and completing throwing snapshot
bindings. An exported inspector cannot mint that witness. The confirmation
records request issuance; successful child creation and physical closure need
their own private observations. Its Store and scope fields are actual object
identities. A reopened Store, copied object or serialized record cannot replace
the original identity check. Keep the Store and database references inside
trusted Source; an outcome's public metadata projection cannot carry those
private identities or become a generic backend witness.

Historical request confirmation remains factual after the issuer closes or a
later launch fails. It cannot rearm a token, make an old request current, refund
an attempt or prove that filesystem ledger publication committed. Existing
Original tokens without the opt-in prepared-input binding do not acquire this
new confirmation.

## Invoke and consume once

`runRuntimeModelWithOutcome(issuingStore, host, nativeId, prompt, cwd,
timeout = 180000, selection = null, options = {})` returns a frozen
`{call, completion}` pair. It invokes the fixed adapter once. The caller supplies
the genuine launch token through the existing runtime or Original option.
`call` is an opaque private handle; `completion` settles with the actual result
or the original rejection value.

The producer retains the returned primitive text before publishing the result,
and retains a thrown value without inspecting or coercing it. That includes
`undefined`, `null`, `false`, symbols and objects with hostile accessors. Its
own capture failure cannot replace a primary thrown value. Default model APIs
keep their existing result and error contracts.

After settlement, `consumeRuntimeModelOutcome(call, actualSettlementValue)`
spends one consumption attempt before validation. It compares the actual
settlement by identity and returns a frozen factual capture. A returned capture
contains the privately retained text; a thrown capture preserves the original
opaque value. It never rereads text from a caller-modified result object or
reinvokes the adapter. Incomplete capture or missing provenance remains held.
The captured `native_id` is the adapter's actual returned scalar, retained
before the public result can change. It is factual metadata and does not prove
Native admission or model support. Thrown outcomes do not inspect an error to
extract a native identity.

`inspectRuntimeModelOutcomeCaptureFrom(capture)` authenticates an already
consumed factual capture through the adapter's private map and returns that
identical frozen capture. It reads no caller properties, performs no Store
read or currentness check, and spends no eligibility attempt. Copies, proxies
and foreign objects remain held. Inspection remains available after issuer
closure or failed eligibility, so a consumer can retain genuine failure facts
before separately deciding whether a returned result is eligible. It grants no
new call, allowance or positive eligibility.
The three-argument form
`inspectRuntimeModelOutcomeCaptureFrom(capture, issuingStore, launch)` also
requires the exact original Store and launch-token identities. A reopened Store
at the same path and another genuine token cannot replace them. This remains a
factual identity join, including after closure; no private references are added
to the public capture. Only the one- and three-argument forms are supported.

The capture also preserves a bounded, deeply frozen snapshot of the parser's
`model_evidence`, including Source-applied launch controls, before the public
result escapes. Caller mutation of that result cannot change these facts.
Metadata beyond the snapshot's depth, node or character bounds holds capture
instead of silently dropping fields. `cli_version` is null unless the actual
Source result contains that scalar; the current adapters do not probe or return
a CLI version. The worker retains the version already recorded on its queued
job independently. An opaque rejection is never inspected for metadata.

`assertRuntimeModelOutcomeEligible(capture)` separately checks a genuine
returned capture against private process and canonical observations, the
opt-in current-job checks, and actual Source execution timing. The eligibility
check spends one attempt before validation, including a failed check. Keep the
issuing Store alive across invocation, consumption and these checks. A factual
failure or late-close receipt cannot establish eligibility.
The receiving Source issuer must also enforce its own current grant, slot,
budget, candidate, test and QA requirements.

The opt-in path derives active authority and any existing overall execution
deadline from the actual Store. A caller deadline can tighten those bounds.
Model operation lifetime remains separate from the queue/startup creation
cutoff. Dependency and clock overrides are unavailable in this entrypoint;
ordinary naming work and canonical-observation callbacks retain their fixed
Source roles and cannot authenticate an outcome.

A later request whose actual durable preimage contains a prior canonical model
birth must retain valid overall execution timing. If all three timing fields
disappear, preparation holds before issuing another model launch capability;
it cannot restore a startup window. A first request with no prior model birth
may still establish its timing at the first actual Source spawn.

The Source outcome fixtures mock only the exact private dummy `codex` path's
`X_OK` metadata check, validating its real nonlinked regular file, executable
permission bits and private directories. Other access checks delegate to the
native function. Their process boundary remains controlled EventEmitters;
these fixtures do not qualify a host executable or demonstrate OS isolation.

## Composition

Use one composed module graph. Importing Store, adapter or provenance modules
from different checkouts creates different classes and private WeakMaps.
The interface does not import the issue18 typed codec, local observer or Python
storage tools into the installed runtime. Those components retain their own
data, accounting, dependency and authority boundaries.
