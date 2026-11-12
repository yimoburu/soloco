# Original local-worker recipe test fixture

The legacy local-worker observer deliberately pins complete engine and process
closure source hashes. The public recovery integration changes the current
engine, so that current source correctly Holds with
`LEGACY_WORKER_POLICY_UNAVAILABLE`. Tests must preserve this production guard.

`tests/fixtures/legacy-worker-recipe-91e5609.json` preserves the complete public
source leaves from commit `91e5609fe881ef1cd2b46bdcba0400c21bf0db07`:

| Leaf | Bytes | SHA-256 |
| --- | ---: | --- |
| engine.mjs | 75,952 | f3cc2d3e6b217cb786d02658fa55341402dcac36e07c3a7bc203303f24364bcd |
| model-process-closure.mjs | 10,126 | 6572e0bf415988edba857dead658e17ab2e0c2ce55a4a8f57acda317ea58e72a |

The archive uses deterministic gzip with zero timestamp and base64. The test
helper checks the fixed source commit, both full sizes and hashes, then restores
only those two leaves into a disposable copy of the current runtime. Tests use
storage, ledger, observer and original WeakMaps from that same copied namespace.
Runtime tests need neither Git nor private validation artifacts.

The existing worker and plan assertions exercise their original fixed SOURCE
recipe against fictional SQLite and synthetic worker facts. A separate counter
calls the actual current production observer and requires its changed-engine
Hold with every SQL row unchanged. No production recipe or pin is relaxed.

These source bytes do not establish which code ran any historical job, select a
policy, admit a worker, release old UNKNOWN reservations, qualify native closure
or renew an expired/spent allowance. Historical policy association stays
UNPROVED and the current production Hold remains in force.
