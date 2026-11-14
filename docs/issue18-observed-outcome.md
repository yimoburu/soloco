# Local returned-string and thrown-value observation

`tools/issue18/observed-outcome.mjs` actually calls a supplied Source-owned
function once per observer. It uses the existing typed-capture module to retain
the exact returned primitive string before recording or returning it. Parsing
and normalization belong to the caller, after successful `run()` completion.
This ordering covers this observer's recorder and fulfillment; it cannot prove
what the supplied function or unrelated Promise handlers did before the value
arrived.

```js
const observer = createObservedOutcome(sourceFunction, {
  max_utf16_units: 200000,
  max_evidence_bytes: 1000000,
  record: snapshot => retainSelectedLocalData(snapshot)
});
const text = await observer.run();
const artifact = JSON.parse(text);
```

The local call is consumed synchronously before invoking the supplied function.
Concurrent, reentrant and later calls throw `ISSUE18_OBSERVER_USED` without
another invocation. Failure, pending settlement and recorder failure never
reset this state. Limits and the recorder reference are copied before invocation;
option getters and Proxy options are rejected without running their hooks.
A pending invocation or recorder may remain pending indefinitely and remains
spent. Deadline and cancellation control belong to the selected outer caller;
this primitive reads no clock and supplies no timeout authority.

Primitive strings are captured as exact JavaScript UTF-16 code units, including
BOM, NUL and lone surrogates. Original bytes stay private in typed capture;
`copyBlobBytes(snapshot.capture.blob)` returns a fresh copy. A recorder receives
an immutable snapshot only after that local capture is available. Recorder
failure prevents `run()` fulfillment but does not erase captured bytes.

The recorder must return `undefined` or a native Promise that fulfills with
`undefined`. It is awaited explicitly. Returned completion flags and custom
thenables do not assert completion. A recorder throw/rejection is retained
separately. An original invocation throw or native Promise rejection remains
the exact primary rejection value even if recording also fails. No error
property, `cause`, Proxy trap, `toString` or diagnostic getter is inspected.
Throwing `undefined`, null or another falsey value is still a failure.

Native Promise return values use ordinary JavaScript settlement semantics.
Promise assimilation/constructor access can itself fail; the snapshot records
that stage as `native_promise`, while the direct function call remains
`returned`. This does not attribute the reason to a provider. A native producer
may already assimilate a returned value before observation sees it. Other
non-string values, including custom thenables and Promise Proxies, are held
opaquely without reading `then` or coercing them, and `run()` rejects with
`ISSUE18_OBSERVER_NON_STRING`.

An explicit `partialTextResult(prefix, observedTotal)` is available for a
Source-supplied primitive prefix. It is never inferred from an exception or
response object. The prefix is retained through typed capture as prefix-only;
`run()` rejects `ISSUE18_OBSERVER_INCOMPLETE`, so consumers cannot mistake it
for a complete string. A limit failure retains no clipped capture and remains
unavailable. Capture/observation failure takes precedence over a secondary
recorder failure; both opaque error handles remain available in `snapshot()`.

`capture_state: complete_local` means the whole supplied string is held locally.
It is separate from `record_state`, overall failure, provider completeness and
durability. `snapshot()` is local observation data, not authenticated adapter
custody, a global call allowance, B admission, currentness, a test/QA grant or
an actual Store/COMMIT witness. Creating another observer creates another local
cell and grants no execution authority. No callback identity is authorization.

The module performs no filesystem, clock, process or caller inspection. It has
no worker/default/version/manifest/company wiring. Integrating a genuine adapter
and the actual Store/issuer/COMMIT boundaries remains separate work against the
frozen backend interfaces. The controlled tests use only fictional functions;
Source review and a selected actual test run are separate requirements.
