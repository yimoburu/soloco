# Issue 18 typed capture: pure prepared data

`tools/issue18/typed-capture.mjs` implements byte capture and closed evidence-data
checks for the frozen A-v2 contract. It imports only Node's `crypto` and `util`.
It performs no filesystem, network, process, clock or company operation.

This module is not connected to a worker, default model, Store or storage
backend. Its local handles prove byte ownership only. They do not establish
adapter provenance, a committed reservation, persistence, current authority,
test/QA success or acceptance. The contract's proposed profile/model/storage
and retention choices remain unselected.

## Byte capture

- `capturePrompt(text, limits)` accepts a primitive, scalar-valid string without
  NUL. It retains its exact UTF-8 bytes and returns a typed `PromptRef`.
- `captureRawText(text, limits)` retains every supplied JavaScript code unit as
  literal little-endian pairs. Original BOMs, NUL and lone surrogates remain
  data; no BOM is added. Complete means the whole supplied value, not a complete
  provider answer or a durable write.
- `captureRawPrefix(prefix, limits)` takes an explicit prefix and optional
  observed total. It never clips a whole response to fit. Its UTF-8/Unicode/NUL
  measurements describe that retained prefix, not unavailable original text.
- `captureBytes(bytes, encoding, limits)` copies supported byte domains;
  `copyBlobBytes(handle)` always returns a fresh copy. Retained bytes are private.
  `verifyBlob(bytes, ref)` verifies the exact length/hash/type/name relation.

Raw UTF-16 storage size is distinct from the scope's UTF-8 wire/candidate limit.
The replacement UTF-8 measurement of malformed strings is not original wire
identity. Different lone surrogates can share that replacement hash while their
lossless hashes differ. Lower CLI/provider transport bytes are not captured.

`keepThrownValue(value)` and `readThrownValue(handle)` hold arbitrary thrown
values opaquely, without probing getters, Proxy traps, `cause` or diagnostics.
This is local value identity, not the contract's authenticated outcome receipt.

## Hashes and evidence checks

Content hashes are SHA-256 of exact bytes, without a new domain prefix. Encoding
tags and ref positions retain the domains; empty UTF-8 and UTF-16 blobs may have
the same content hash. `captureBinding(serialized)` preserves the exact supplied
UTF-8 JSON bytes. Whitespace changes its commitment.

`callPolicyBytes`/`callPolicyHash` use A-v2's separate eight-field ordered
projection, excluding `policy_sha256` itself, without BOM or terminal newline.
The input may be the exact projection or the full policy with its digest.
`captureCanonicalData` sorts object keys for an explicitly different JSON-data
representation; it must not replace a provided binding or policy commitment.

`validateEvidenceData(serializedRecord, options)` accepts:

- `binding_blob`: the local owned blob holding the exact serialized binding;
- `blobs`: one local handle per explicitly accounted byte copy, including every
  referenced prompt, raw and normalized object;
- `history`: serialized JSON containing all earlier **whole serialized record
  strings**, in order: zero, one or two entries for revision one, two or three;
- `inventory`: serialized JSON rows `{kind, bytes, copies}`, charging blobs,
  all header/history/event/backup copies and other explicit costs;
- `candidate_blob`, when the derived data names a complete candidate hash.

It checks the frozen structural fields, exact byte/ref domains, prompt
concatenation, policy/slot/binding joins, every history edge, immutable fields,
raw measurements, derived references and numeric capacity relationships.
Duplicate JSON keys, unknown fields, truncated encodings and missing history
are rejected. A lower cap binds both declared consumption and reservation.
The copied structural definitions are private validation data, not a public
general-purpose schema engine or an authority mechanism.

The result is labelled `DATA_CONSISTENCY_ONLY` and lists the unchecked physical,
semantic and authority obligations. In particular it does not prove that raw
frames produced the declared normalized artifact, that a candidate preserves
the fixture, that inventory describes physical storage, or that caller-written
`durable_complete`/custody IDs are true. Those require the separately reviewed
codec, backend, currentness/issuer/Store and actual test/QA integrations.

The controlled unit-test source uses independent literal vectors and fictional
evidence. Its Source handoff requires separate selection before execution;
authoring these tests is not a test pass or Native qualification.
