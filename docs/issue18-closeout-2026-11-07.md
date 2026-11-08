# Candidate-format closeout, 2026-11-07

Issue #18 remains open for its full-file native acceptance criterion. The
implementation supports exact-base patches, complete retained candidates and
persistent configurable size ceilings. Fresh execution must preserve the
historical failed controls and does not turn their holds into passes.

## Concrete repair

The qualification driver and canonical verifier previously hardcoded
`gpt-6.1-sol`. The current authenticated Codex CLI catalog advertises
`gpt-6-astra`, with explicit reasoning efforts. A historical model identifier is
not a permitted substitute for the current catalog. The driver now accepts an
explicit model and engineer/QA efforts, validates them against the inspected
catalog before any native call, and records the policy and its SHA-256 in the
predeclared protocol and every case. Report assessment checks every call against
that declaration; canonical validation also checks the actual producer and QA
jobs. The historical default policy remains available for old evidence.

The driver also archives every source-manifest file before starting. A later
read-only verifier can check the exact frozen files without relying on a mutable
checkout or Git revision alone.

## Fresh bounded qualification

A new disposable fictional company was created for each original arm: one and
three 32 KiB modules, each with full-file and exact-base patch output. All arms
use the same source/runtime fingerprint and `gpt-6-astra`, high effort for
engineering and high effort for independent QA, with host-default speed. The
current catalog supports those requests. Effective provider model, reasoning and
service tier remain unverified when the CLI does not report them.

The original fixture, exact complete-byte grading, 200,000-byte scope/ceiling,
one generation/test/QA attempt per case, eight total native-call bound and
zero-repair rule remain fixed. Native QA receives the complete retained candidate
and actual sandbox test receipt. Acceptance binds the candidate, executed
receipt and independent review. Original fixture sources remain unchanged.

The fresh four-arm criterion **failed**: both full-file producers explicitly
returned Blocked over unchanged-byte fidelity. Both patch arms reached real
tests, independent native QA and exact receiver acceptance. Read-only derivation
against all four retained canonical databases verifies both accepted bindings,
zero critical false acceptances and closure of all six native processes. The
exact source/Node fingerprint matched before and after every arm.

| Modules | Format | Native outcome | Generated payload | Complete candidate | Time to acceptance |
|---|---|---|---:|---:|---:|
| 1 × 32 KiB | Full files | Producer Blocked | No candidate | No candidate | Unavailable |
| 1 × 32 KiB | Patches | Accepted, canonical bindings verified | 149 bytes | 34,032 bytes | 40.11 s |
| 3 × 32 KiB | Full files | Producer Blocked | No candidate | No candidate | Unavailable |
| 3 × 32 KiB | Patches | Accepted, canonical bindings verified | 445 bytes | 101,610 bytes | 45.88 s |

Six native calls were used, with zero retries, zero repairs, zero malformed
outputs and no exact-fixture mismatch. The three-module patch demonstrates a
native complete retained candidate above 100,000 bytes through actual test,
review and acceptance; it does not establish the missing full-file baseline.
The native driver exits 1 for the retained four-arm failure. The read-only
canonical verifier exits 0 because both claimed acceptances are valid; that
exit status does not convert the failed comparison into a pass.

Results and source identities are recorded in
[`evals/issue18-closeout-20261107`](../evals/issue18-closeout-20261107/).
Raw native CLI diagnostics and local canonical company databases remain local;
public evidence contains sanitized hashes, controls, stage outcomes and metrics.
No actual company, installed runtime, startup hook, trust setting, owner or
allowance was changed.

## Software validation

The combined production development, patch and qualification checks pass
69/69 with zero failures and zero skips on Node 22.23.2 and the actual macOS
sandbox. They cover a complete retained candidate above 100,000 bytes through
executed tests and independent acceptance, UTF-8/JSON boundaries, stale and
malicious patches, partial materialization recovery, changed ceilings and exact
candidate/test/QA bindings. Synthetic model outputs in software tests establish
runtime contracts, not native model quality. The generated-file and whitespace
checks pass.

## Remaining criterion

The original native full-file producers held because they could not guarantee
byte-exact unchanged padding. Their original failed reports and exhausted arms
remain unchanged. A fresh model trial is separate evidence; it cannot relabel
those historical controls. A producer hold is neither malformed output nor an
accepted candidate and has no accepted-time baseline.

No statistical noninferiority, production reliability or causal latency claim
follows from one observation per arm. Further full-file qualification needs a
concrete producer-fidelity improvement and a separately declared bounded trial;
repeating unchanged controls or weakening full-byte preservation does not meet
this issue's completion rule.
