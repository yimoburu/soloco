# Upgrade timing and comparison

Upgrade timing separates local preparation/evidence processing, actual model-call
waits and rehearsal wall time. Durations use a monotonic clock within each process.
Per-call `elapsed_ms` is retained for returned and failed calls. Reusing a completed
call does not invent another model duration. The attempt's `timings` reports
`preparation_ms`, `evidence_ms`, cumulative `worker_wall_ms`, `worker_runs` and
`last_run_wall_ms`. Unknown observations stay unknown; these are measurements,
not completion forecasts or evidence of effective provider settings.

Pipelined calls overlap. Adding their durations gives model work, which can exceed
the worker's elapsed time. Report the two separately. A deadline remains a limit,
not an expected duration. Timing never supplies adoption permission.

Run a disposable fictional comparison with no model CLI or actual company action:

```sh
node tools/upgrade-performance.mjs /absolute/path/to/a-new-comparison-directory
```

The tool compares explicit `legacy`, `incremental-v1` and `incremental-v2` workflows
for a small and a multi-page input. Each scenario copies the same frozen initial
company. It records exact baseline/input hashes, source and runtime versions,
per-call phases/durations, stage wall durations, call counts, input characters,
observed overlap, distinct synthetic role identities and apply/readback results.
Prepare-generated IDs differ between arms. Each arm has one attempt; a held arm
remains held and does not trigger an automatic retry. Outputs and failed evidence
are retained in the fresh output directory.

The supplied contract model uses a controlled 50 ms asynchronous delay. Its
judgments are fictional. The report labels every arm `synthetic_contract_double`;
it establishes neither live model quality nor actual-company upgrade speed.
The controlled delay helps reveal scheduling overlap without depending on a
provider. `model_work_ms` sums call durations; `model_occupied_ms` measures their
union, and `model_overlap_work_ms` exposes overlap. Positive overlap is not itself
a guaranteed end-to-end improvement: local CPU/storage overhead can dominate.

For a real upgrade, inspect `upgrade.work.observed.timing` and the exact attempt's
`timings` and retained call logs.
Compare the same company state, candidate and controls before claiming a speedup.
One run on a shared host supplies no reliable median, tail latency, token-fit,
cost or founder-effort conclusion. Package installation and hook trust remain
separate from company adoption.

## Recorded controlled comparison

The [six-arm report](../evals/upgrade-speed-20261107/comparison.json) uses one
copied baseline per scenario, the actual upgrade controller and fictional semantic
judgments, with a controlled 500 ms asynchronous delay per model call.

| Input | Legacy | Incremental v1 | Incremental v2 |
|---|---:|---:|---:|
| Small, one page | 6 calls / 4.423 s | 4 calls / 4.224 s | 2 calls / 2.031 s |
| Large, four pages | 12 calls / 9.485 s | 10 calls / 10.185 s | 10 calls / 5.240 s |

Every arm completed guarded apply/readback with distinct synthetic role identities;
source hashes remained unchanged. The large v1/v2 arms sent exactly 1,552,794 input
characters each. V2 reached two concurrent model waits and measured 1.372 s of
overlap work. The report includes per-stage local wall durations and source hashes.
Measurements were taken on the working tree; its recorded public source hashes
identify the tested implementation. No raw fixture databases are published.

These are single runs on a shared host. V1's large run was slower than legacy's
despite fewer calls, so call-count reductions alone do not prove elapsed speed.
The numbers demonstrate the implemented scheduling on this controlled fixture;
live provider latency and actual-company upgrade quality remain separate checks.
