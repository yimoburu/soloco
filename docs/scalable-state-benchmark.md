# Reproducible fictional scalability measurements

Run `node tools/benchmark-scalable-state.mjs`. Protocol and thresholds are fixed
before the trials in that source. The checked-in receipt is
`evals/scalable-state-runtime-2026-11-04.json` (Node 25.2.1, macOS arm64).
Only disposable fictional project folders are created; they are removed after
the run. Existing company data and installed plugins are untouched.

| Resolved decisions + historical attempts | 10 + 10 | 100 + 100 | 1,000 + 1,000 |
|---|---:|---:|---:|
| Serialized stored state bytes | 46,083 | 465,303 | 4,773,603 |
| Ordinary bounded context characters | 937 | 937 | 937 |
| Previous ordinary context characters | 11,845 | 117,415 | Explicit overflow hold |
| Current upgrade page characters | 11,515 | 11,565 | 11,616 |
| Previous upgrade page characters | 105,949 | 971,030 | 9,779,691 |
| Current / previous upgrade pages | 1 / 1 | 1 / 9 | 1 / 82 |
| Legacy full read median ms | 0.100 | 3.998 | 23.680 |
| Normalized full read median ms | 2.278 | 12.965 | 53.425 |
| Normalized selected read median ms | 0.155 | 0.089 | 0.071 |
| Idle event-token read median ms | 0.0052 | 0.0052 | 0.0048 |
| Selected notice write median ms | 1.007 | 0.355 | 0.250 |

All four fixed active obligations remained in ordinary context at every scale;
the selected historical source was retrieved exactly; mutation of that source
invalidated its dependent returned job. Migration retained exact logical state,
small notice writes retained the archive payload hash, and fresh-folder restore
matched the backup state digest. Three simulated token readers all observed the
next committed state change. This is not real-worker cancellation-latency proof;
worker cancellation and stale completion are separate regression tests.

These are structural and local storage measurements, with zero model calls.
The runtime fixture supplies exact retained classification plans and independent
review provenance; it does not execute the one-time model bootstrap or prove
that a real reviewer correctly resolved history. Two CoS/QA page visits per page
are a delivery count, not executed model-call or token telemetry. Reported model
tokens, generation output characters and model-quality outcomes are unavailable
in this benchmark, rather than inferred from characters. It therefore does not
establish time to an accepted company outcome or production noninferiority.

Full-state access remains linear and is slower with this normalized layout.
At the largest scale the current projection took 7,495 ms of mechanical CPU
work versus 653 ms for the previous projection, despite much smaller delivered
pages. This explicitly separates bounded model context from storage and CPU
cost; no constant-time archive processing or universal speedup is claimed.
Selected reads/writes and idle token checks are the measured high-frequency
improvement. Timing distributions and iteration counts remain in the receipt;
there is no hardware-capacity or statistical production-latency claim.
The initial run is retained in `evals/scalable-state-runtime-2026-11-04-initial.json`;
the final run adds the worker evidence allowlist to the bounded context and
records serialization, writer-lock samples, DB/WAL sizes and process memory
snapshots. Its normalized reads include the final atomic snapshot transaction;
current projection also validates every classification-index entry before archival. Memory snapshots include prior trials and garbage-collection effects;
they are not isolated per-company memory requirements. Other
tests ran concurrently, so wall-time comparisons are diagnostic only.

The backup inventory covers `.company` and explicitly selected external
artifacts. Completeness of artifact references written only in prose still
requires review. Restore preserves ownership metadata and transfers no business
authority. No real company migration, installation, team adoption, or live
continuity test was performed.
