# Backlog integration — November 7, 2026

The review covered the four open issues (#13, #16, #18, #30), the four open pull
requests (#26, #29, #32, #33), their complete issue bodies and comments, and PR
reviews/inline threads. All comment and review collections were empty at retrieval.
The checkout starts from `70e3a144aec0c55991589e9fa2cf29b15d7dfd81`.

## Source changes

The local integration combines these exact existing PR heads:

| PR | Head | Disposition |
| --- | --- | --- |
| #29 | `0d0e4457602eb90d12749e84ce5f8d9d85968a3d` | Integrated negative-result retention and complete-group extraction; resolved conflicts with durable task APIs and failed-output retention. |
| #32 | `0483d1eae5a5f24f58b67f9558898adb8389b163` | Integrated the audit, concurrent storage benchmark and attributable accepted-workflow/format evidence without changing prior verdicts. |
| #33 | `15630560b9a5032c846fa7626861603d0a5fd4a9` | Integrated full Node 22 plus targeted Node 26 CI, immutable JSON encoding/hash reuse and live layout statement reads. |
| #26 | `ef4899388c5a48d8a340196cde6081d5b7b96f8e` | Preserved its explicit deferral; ARM runner selection stays in place. |

Additional repairs in candidate `8b8e2567e5c66a1a8183afece3bf7fde05b0a163`:

- Preserve both per-validation historical-negative reuse and the bounded
  cross-call cache, with current snapshot dependency validation.
- Keep rejected adapter output for durable format-7 tasks as well as scoped and
  operating reviews; adapter failures cannot bypass negative retention.
- Avoid reconstructing every public presentation row for selected writes whose
  exact index inputs did not change. Only revision/updated_at root changes have
  an explicit non-catalog classification; unknown root changes stay conservative.
  Catalog restoration occurs inside the writer transaction after checking its
  original integrity. Exact before/after storage intake remains enabled.
- Use one timestamp for the synthetic corpus-proof adapter's spawn receipt.
  Two Date reads could disagree by a millisecond and fail the strict production
  timing validator. Production timing limits and validation are unchanged.
- Exercise backup/restore with exact accepted producer/reviewer links, a queued
  task retaining its resource claim, and an unprocessed peer message. This is a
  fictional contract test, not observed native session replacement.

## Acceptance status

| Issue | Progress in this candidate | Remaining requirements |
| --- | --- | --- |
| #13 | Concurrent 10/100/1,000-record trials pass with intake checks enabled: 72 exact receipts, nine confirmed child exits, unchanged archive bytes, no archive-body/full-state child reads, no commits after pause. The observation-disabled diagnostic also completes. | Native semantic bootstrap, broad accepted-outcome comparisons and the full consolidated acceptance remain open. Metadata hashing still scales with archive entries. |
| #16 | Retains the accepted-workflow evaluator, selection controls and historical native evidence from #32; existing source contracts are preserved. | Repeated/counterbalanced representative native comparisons, harmful-parallelism cases and actual founder-involvement evidence are not supplied by mechanical tests. |
| #18 | Retains exact-base patches, size policy, original native format results and failed full-file controls. | Both original full-file producers returned Blocked. They remain Blocked; fresh successful full-file qualification and comparative acceptance have not been established. |
| #30 | Adds restore coverage with accepted evidence and in-flight obligations while preserving durable task integration. | Integrated real model-session replacement, matched before/after outcomes and the complete crash/replay matrix remain open. |

No issue is closed by this integration alone. Prior failed/held native trials are
not rerun or reclassified. No actual company migration, installation, adoption,
ownership or pause-state change is part of this source work.

## Validation

Validation targets the clean runtime/test candidate `8b8e2567e5c66a1a8183afece3bf7fde05b0a163`.
Documentation added after that candidate does not change its runtime or tests.

- Node 26.13.0 compatibility selection: 257/257 pass, zero failures/cancellations/
  skips/todos, actual `macos-seatbelt-node` capability. The temporary runtime was
  checked against the official distribution SHA-256 manifest.
- Focused storage/intake/index/atomicity checks: 42/42 pass, zero skips.
- Focused task/recovery/transfer/corpus-proof checks: 39/39 pass, zero skips.
- Build generation and whitespace commands both exit zero.
- Full Node 22.23.2 suite: 1,057/1,057 pass, zero failures/cancellations/skips/todos,
  actual `macos-seatbelt-node` capability, 349.69 seconds.
- Both runtime receipts bind unchanged clean source before/after execution to the
  exact candidate above; retained stdout/stderr hashes were independently checked.

The earlier integrated full run was stopped after exposing the clock-sampling
fixture failure. Its original failed output remains retained. Local runner
receipts identify `mode: unverified-local`; their hosted-evidence validator
correctly refuses to label them GitHub CI acceptance. Actual command exits,
complete TAP accounting and sandbox capability remain inspectable separately.

Repository publication was blocked by automatic approval review pending explicit
permission to publish the local branch to the public repository. No remote branch,
PR, issue state, review or comment was changed.
