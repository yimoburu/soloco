# Full-file output chunks: optional producer encoding

This is an isolated source component for issue #18. It provides pure prompt
preparation/normalization and an opt-in trusted model factory around the
existing `work(root, jobId, model)` seam. The normal
worker, `runModel`, public tool schema, scope `output_format: files`, patch mode,
authority, attempt limits and installed package are unchanged. No route selects
this factory from model-provided arguments.

The current issue remains open. Both historical full-file producer holds, the
failed all-four-arms comparison and exhausted allowances remain retained. This
proposal supplies a changed producer hypothesis and controlled software tests,
not native full-file fidelity or a successful accepted-time baseline.

## Pure prompt codec

`prepareFullFileInput({canonical_prompt,binding,limits})` returns deeply frozen
plain DATA. It clones and validates the existing job/instance/plan/scope binding,
sorts exact write paths, resolves the existing codec limits, and appends the
unchanged fixed instruction to the complete literal canonical prompt. Separate
`canonical_prompt_metrics`, `encoding_instruction_metrics` and
`actual_prompt_metrics` contain each string's UTF-8 SHA256, UTF-8 bytes and
UTF-16 units. `actual_prompt` is exactly the canonical string plus that fixed
instruction; prompt admission measures this complete string without clipping.

The DATA includes the output protocol and `codec.id: full-file-input-codec-v1`.
`codec.instruction_builder_sha256` commits the exact fixed instruction function's
source text. It is not the physical module's hash or a claim about loaded code,
storage custody or authority. Exact module/Git/runtime identities still need
independent external binding. Preparation accepts ordinary plain DATA and
rejects function values, accessors, class instances, cycles and unsupported
shapes. JavaScript reflection cannot authenticate an arbitrary Proxy.

`normalizePreparedFullFileResult(prepared,originalOutputText)` recomputes the
fixed prompt, limits and metric joins before applying the unchanged strict
JSON, duplicate-key, Unicode, path, sequence, frame and byte checks. The result
is deeply frozen DATA: either `status: PRODUCER_BLOCKED` with the original raw
text/envelope, or `status: ASSEMBLED` with the existing files artifact and
assembly accounting. A correct frame ending establishes syntax, not unchanged
source-byte fidelity. Syntactically valid corrupted bytes remain literal
corrupted bytes for the existing tests and independent reviewer to reject.

Neither pure function has a clock, Store, source/base reader, recorder,
invocation, capability, call allowance or callback parameter. Consistent
caller-provided job/scope labels remain untrusted metadata. A later owning
worker must recompute preparation from its actual eligible subject and fixed
policy; prepared DATA, a frozen object or matching digest is not a token and
cannot authorize storage, launch, review, acceptance or a retry.

The opt-in `createFullFileProducer` composes these helpers. It retains its
clock-first configuration capture, one-use consumption, original callback and
error behavior, observer/cancellation forwarding and deadline checks. It keeps
the complete original response in the response record before normalization.
The pure helpers add no worker/driver wiring, profile selector, public tool,
configuration option, issuer, evidence ledger or durable-capture integration.

## One invocation, complete emitted postimages

The model receives the complete canonical source/task prompt, followed in that
same invocation by explicit host-selected output-encoding instructions. The
request record retains both presentations and measures each one's UTF-8 bytes,
UTF-16 characters and SHA256. Added instructions are real prompt overhead; the
whole native prompt is not described as unchanged.

The response is one JSON object with the normal content/messages/notices and
`full_file_output: {protocol: "full-file-output-chunks-v1", frames: [...]}`.
Frames have small consecutive `seq` values starting at zero. In exact sorted
write-path order, use `file_start`, then `chunk` frames containing the literal
postimage text, then `file_end`; one final `output_end` closes the encoding.
An empty postimage has a start/end pair without a chunk.

Every byte of each write-path postimage, including unchanged padding, BOM and
newlines, must be emitted by the model. The assembler concatenates only those
literal strings. It has no source/base-content input and accepts no patch,
copy/reference instruction, model hash or model byte-offset declaration. The
runtime computes UTF-8/UTF-16 offsets, lengths and hashes. Existing selected
read-only files, such as the fixed tests, still follow the unchanged retained
candidate consumer; the model does not need to regenerate those read-only inputs.

Sequence gaps/replays, repeated or missing write paths, out-of-order file
boundaries, mixed formats, duplicate JSON keys, malformed/truncated JSON,
invalid Unicode/NUL, frame or aggregate overflow, changed native identity,
missing/repeated spawn timing, expiry and cancellation hold without a candidate.
Limits never clip or fill data. A producer may return the existing honest
Blocked envelope, which remains Blocked and retains its original response.

An end marker proves only syntactic completion of the declared frame sequence.
The runtime cannot infer that an apparently well-formed body contains all
intended unchanged bytes. Full task criteria, byte-exact fixture checks, actual
tests and independent review remain necessary. A model can still hold or emit
an incorrect postimage; this encoding is not a promise of improved quality.

## Runtime and evidence boundary

`createFullFileProducer` receives a trusted exact job/instance/plan/scope binding,
write paths and existing byte budget, plus a synchronous evidence recorder.
Factory accessibility and caller-supplied bindings are not authentication or
authority. The actual worker/development consumer still enforces current scope,
owner, pause, expiry, attempt and candidate/review checks.

The recorder receives the full actual request and ORIGINAL raw model response,
native identity, model observations, spawn timing, call count and wire lengths
before parsing or transformation into the existing `files` artifact. The raw
response is also retained in returned model evidence. Recorder errors hold;
the source component does not claim that a callback by itself proves durable
storage or authentic native execution. Injected invocation/lifecycle seams are
explicitly marked controlled and do not become native proof.

Factory clock injection is recorded separately as `factory_clock_injected`.
The factory captures a default `Date.now` reference, observable own/inherited
`now` presence and the configured clock once, before reading unrelated binding,
recorder or limit properties. `factory_clock_injected` is true if entry presence
was observed or the selected clock differs from that captured default. Thus
explicit `Date.now`/`undefined` and self-removing own/inherited clock getters are
disclosed; a Proxy hiding presence but returning a custom clock is also marked.
A later binding getter cannot replace the clock already captured. Host objects
can hide their declarations, so this diagnostic is not authentication or a claim
about arbitrary hostile Proxy internals. `injected_lifecycle_dependencies`
includes that factory clock and the adapter's lifecycle overrides. Request,
spawn, response and assembled records, and both assembled and Blocked returned
accounting, retain the applicable markers. These disclosures do not authenticate
a clock or turn controlled elapsed-time measurements into Native timing evidence.

The default underlying `runModel` resolves only after its owned child closes.
The wrapper makes exactly one invocation, forwards the selected controls and
original cancellation signal, and preserves the earlier absolute deadline.
It neither resumes a native conversation for more output nor creates another
generation attempt. The final deadline/cancellation fence also follows assembly
and final evidence retention. Provider Error/cause identities remain original.

Raw frame JSON bytes, emitted postimage bytes, existing `files` JSON bytes,
actual prompt overhead and retained evidence bytes are separate measurements.
The scope's existing `max_bytes` remains binding for both raw encoding and
the complete files array; no larger allowance is created. The existing worker's
`generation.generated_bytes` still describes its files array. A future native
comparison must additionally consume the retained raw-wire/actual-prompt
accounting and the outer invocation/acceptance timings rather than treating
that shorter normalized JSON as the original model output.

## Controlled validation and remaining acceptance

The source tests use explicit controlled model/CLI streams and disposable
fictional company state. They exercise BOM/CRLF/astral/empty/multifile fidelity,
malformed ordering and bounds, raw retention, cancellation/deadlines and the
unchanged actual `runModel` parser's physical-close boundary without executing
a real CLI. A complete production worker/development path uses three exact
32 KiB modules, actual isolated Node tests, a distinct controlled review and
guarded fixture acceptance. A paired case changes an otherwise unchanged byte:
its syntactically complete output is rejected by the actual fixed-byte tests.

The Source successor additionally carries the original evaluator's one- and
three-module fixture definition and its expected-postimage/fixed-test logic.
The preserved evaluator is SHA256
`f14c8356e3f364104f712548ef58c015aba4e9ec9674d54cd70989d96d2da0e2`.
These original modules use ASCII/LF, are exactly 32,768 bytes each, and change
only `= 0;` to `= 1;`. Independent retained whole-fixture and complete-candidate
hashes and candidate byte counts (34,032 and 101,610) pin the generated controls
before invocation. Separate original literal module/postimage files were not
retained in the searched archive; the preserved deterministic definition and
independently recorded hashes are the input provenance. The newer BOM/CRLF/
astral three-module fixture remains a distinct additional control.

Each original control passes complete literal output through its selected
worker and development consumer, retaining the original raw
frame JSON, one generation attempt, actual fixed-byte tests and guarded
controlled review/acceptance. Paired one- and three-module cases change an
otherwise unchanged padding byte and require failed fixed tests without
acceptance. A malformed response also consumes the wrapper: a second call must
return `FULL_FILE_ATTEMPT_CONSUMED`, without another invocation or evidence
request. The original 31 controlled results and earlier failures remain separate
historical records; the successor needs its own exact Source/actual review.

These checks establish software mechanics. They do not establish model fidelity,
native reviewer competence, deployment, real-company adoption, cost savings,
latency improvement or the original comparison's success. The two full-file
historical holds are not malformed candidates and gain no accepted-time value.

Before a fresh native claim, an owner must select and bind this changed producer,
retain its exact source/runtime and raw accounting, and predeclare the original
one/three-module files/patches comparison with the existing eight-call,
one-generation/test/QA-per-case and zero-repair limits. Complete candidates,
unchanged bytes, actual test receipts, independent exact-candidate QA and guarded
receiver acceptance remain required for all four arms. That native comparison
is unexecuted by this source work; no new grant, restored attempt or retry is
inferred.

The earlier isolated V3 proposal used 59 consumer files unchanged from
`3d652681e53a8e05019c42e6e6e230a3c38dd130`. A later literal adoption at local
Source component `4f84944adbd27c73c29ef1252f1db51e9c0a0a4e`, based on accepted
main `60493f5748f5a45f3076ba7e6c3ba1b92d080a87`, instead used current consumers;
32 of those 59 files differed. Its selected phased run passed all 36 points,
with unchanged complete Source/index/Node before and after. The preceding
combined audit/test run remained held with 29 completed points and no final
TAP result. Both records stay separate from the earlier controlled failures.

This pure factoring changes code and has not been executed. All 36 existing
test bodies, original byte oracles and assertions remain, with eight added
pure-codec controls planned for fresh review and a complete current-consumer
run. The previous 36-pass result does not transfer to the changed code. Fresh
execution remains subject to its separately declared bounds and unchanged inner
Seatbelt, followed by independent exact Source/actual QA.

Current-host selection, authenticated job/invocation binding, durable recorder
custody and original wire/prompt metrics remain separate integration
dependencies. No source pass here supplies those properties, improves the
historical two-of-four Native result, creates an accepted full-file timing
baseline, or renews an exhausted allowance. Proposed private host contracts are
not selected or implemented by this pure component.
