# Coherent STRING literal boundary repair

Base: `7dfb23900d91bce63dec7d6b26fc69573bc1d84f`. Source-only repair; no commit.

The shared codec now checks a parsed JSON STRING for the reserved object keys `immutable_snapshot` or `immutable_entry` before promoting it into `json-text-string`. It traverses objects and arrays structurally, regardless of reference validity, and retains the entire raw STRING when a key is found. It never parses nested strings for detection; their own codec promotion applies the same gate. Genuine typed references, section/walk machinery, snapshot closure, receipt checks, packet limits, checkpoint and corpus semantics are unchanged.

The [pre-fix regression log](before-node22.log) reproduces the missing coherent original error and the incorrect second inbound edge, plus nested malformed-key promotion and absent opaque fallback. Four regressions failed before the repair; the genuine typed-reference rejection guard already passed.

Six added tests cover canonical and formatted literals; both reserved key families; valid-looking references and null/empty/string/boolean example values; root objects, nested objects and arrays; exact UTF-8 raw roundtrip; zero STRING inbound edges; exactly one typed inbound edge when an identical STRING example coexists; independent nested STRING promotion with ordinary outer JSON decomposition; genuine missing/corrupt/malformed typed references; the shared bootstrap codec; and a 60,000-character payload whose opaque fallback remains Held at the unchanged 48,000-byte cap. Existing non-reference canonical/formatted decomposition and closure/receipt regressions also pass.

The four requested suites passed **47/47 on Node v22.13.0 and 47/47 on Node v25.2.1**, with zero failures, skips or cancellations. Both test processes exited 0. `git diff --check` passed. Exact repair commands: [commands.sh](commands.sh). Complete logs: [Node 22](node22.log), [Node 25](node25.log). Reviewable source/test/docs diff: [source.patch](source.patch). Earlier evaluation logs were retained.

Edits are limited to `legacy-operating.mjs`, its two directly affected test files, one short addition to the existing legacy documentation, and these repair artifacts. Validation used synthetic fixtures and temporary stores only. No private/live company data, network, model calls, settings, release, installation, other worktrees or subagents were accessed. No native semantic acceptance, actual private-data fit or company resumption is claimed; Root owns the separate private-data measurement.
