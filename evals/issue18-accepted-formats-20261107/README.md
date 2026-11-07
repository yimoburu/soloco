# Bounded accepted-candidate format comparison

This qualification used the merged product runtime at `9c0cb8a9d40da42242787b1bbaacfa11ba37acdc` with the two evaluation-only modules frozen beside this report. It changed no actual company, installed package, adopted team, source checkout or business authority. All company bindings, grants, source files and tests were manually supplied fictional fixtures.

The original predeclared **all-four-cases Pass criterion failed**. The native process exited 1. Both full-file producers explicitly returned Blocked because they could not reliably reproduce every padding byte. Both patch producers returned exact repairs; actual macOS sandbox tests passed, fresh independent native QA passed the exact candidate/receipt, and the runtime receiver accepted. No failed or blocked arm was retried. This supports the patch path on these fixtures; it does not establish statistical quality noninferiority, production reliability or causal latency improvement.

| Fictional modules | Format | Outcome | Generated candidate payload bytes | Complete retained candidate bytes | Time to accepted result |
|---|---|---|---:|---:|---:|
| One × 32 KiB | Complete files | Producer Blocked after 45.21 s | No candidate | No candidate | Unavailable |
| One × 32 KiB | Exact-base patches | Independently accepted | 149 | 34,032 | 36.36 s |
| Three × 32 KiB | Complete files | Producer Blocked after 21.44 s | No candidate | No candidate | Unavailable |
| Three × 32 KiB | Exact-base patches | Independently accepted | 445 | 101,610 | 45.21 s |

The fixed test also checks complete expected module hashes, so shortened or changed padding cannot pass. Input-source serialization was 34,184 and 101,914 bytes including fixed tests and hashes; reconstructed candidates include the unchanged selected tests. Source modules were exactly 32,768 bytes each. Both cases deliberately selected a 200,000-byte scope and persistent ceiling. A compact patch did not bypass complete-candidate accounting.

The bounded run used four producer calls and two independent QA calls out of a maximum eight native calls, one generation/test/review attempt per case, no repairs and no retries. Requested controls were `gpt-6.1-sol`, medium for producers and high for QA, host-default speed. Applied/requested controls do not establish effective provider settings. Every observed native process was confirmed closed. The canonical validation found two explicit producer holds, zero malformed/incomplete outputs, zero exact-fixture mismatches and zero false acceptances. The original report incorrectly counted producer holds as invalid generations; its bytes remain preserved, and `native-canonical-validation.json` corrects that metric by reading retained canonical jobs and rejected output.

`native-original-report.json`, `native-predeclared-protocol.json`, `native-console.log` and the frozen driver/helper preserve the actual execution, including its failed all-four criterion. `native-first-derived-report.json` was captured before changing future evaluator code. `native-canonical-validation.json` independently checks exact case identity, settings, fixture/candidate/receipt/review/acceptance links, actual executed results, clean accepted lifecycle and process closure against the retained local databases. It performs no model call, test rerun or acceptance mutation. Raw native IDs remain local; public identity references are hashes.

The source manifest was captured after the first native call had begun, before changing any evaluator/runtime/helper bytes. That timing limitation is explicit in `native-source-identity.json`; it is not retroactively predeclared evidence. Its 48-file digest is `16674d20a290033dac756de89fdf34ddb6ab6132e45edfbd755a22b714390b36`, with Node 25.2.1 and CLI 0.167.0-alpha.3.2 executable identities. The first derivation verified the then-current bytes; the final derivation verifies archived frozen driver/helper plus unchanged runtime against the same manifest. Future evaluator code differs and was not natively rerun.

The corrected future driver captures a complete source/Node manifest before execution, records actual Git HEAD when available, distinguishes producer holds/invalid outputs/backend failure/exact-fixture mismatch, and rejects duplicate arms, negative reviews, held/error outcomes, mixed model/source identities and changed acceptance bindings. Its two focused regression tests passed **2/2 with zero skips** on Node 22.13.0 and Node 25.2.1. Those tests use explicit contract doubles with real runtime dispatch, actual sandbox execution and real acceptance checks; they are not additional native semantic trials.

Earlier synthetic harness timing and working-directory failures, plus the initial assessor negative-test failure, remain in this directory. They consumed no native calls and were not relabeled as passing. No further native comparison was performed after report fixes.

Reproduction uses a new evidence directory and existing host usage:

```sh
node tools/candidate-format-qualification.mjs --contract-double NEW_CONTRACT_DIRECTORY
node tools/candidate-format-qualification.mjs --native NEW_NATIVE_DIRECTORY
node tools/verify-candidate-format-qualification.mjs ORIGINAL_NATIVE_DIRECTORY NEW_DERIVED_REPORT.json
```

The original local canonical evidence is retained at `/private/tmp/soloco-format-native-20261107-1`; the public files here are selected sanitized evidence, not a portable full-company backup or a claim that an ephemeral path is permanent storage. Issue #18 remains open pending its remaining qualification disposition; the implemented patch/configuration paths and these observations must not be confused with installation or active-company adoption.

The original assessor failure TAP is wrapped in `initial-assessor-negative-test-failure.tap.json` as exact UTF-8 text plus its original byte hash. This preserves its whitespace without violating source diff whitespace checks. Decode `raw_text` as UTF-8 to verify `raw_sha256`.
