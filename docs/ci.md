# Repository source CI

Source CI checks public repository source. It does not authorize work, clear notices, create development/runtime receipts, validate semantic handover, adopt governance, publish a package or establish company recovery. Native CLI smoke and actual host trust are separate acceptance requirements. No native model CLI is invoked by this workflow.

## Required checks

`.github/workflows/ci.yml` runs for pull requests, pushes to `main`, and manual dispatch. The required display names remain **Tests Node 22**, **Compatibility Node 26**, **Build and drift**, and **CI gate**. Node 22 now runs the `regression-22` selection, with coverage explicitly recorded as `regression`. Node 26 retains its exact 19-file compatibility selection. Both test lanes must establish actual `macos-seatbelt-node` capability. The build/generated-drift lane runs on Linux. Unsupported Seatbelt, failing commands, skips, cancelled/todo/zero execution or incomplete TAP fail the selected lane. Preflight failures print the actual blocker to the workflow console and remain in the receipt; zero executed tests never become a passing test result.

The regression lane includes every test file except the following explicit `qualificationTests` list in `tools/ci/evidence.mjs`. These were the measured slow complete-history workflows; the files and their tests are unchanged. Newly added files enter regression automatically unless this policy is deliberately amended.

```text
bootstrap-home-repair.test.mjs       complete-group-extraction.test.mjs
context-qualification.test.mjs       corpus-fit-delivery.test.mjs
corpus-phased-delivery.test.mjs      corpus-preservation-storage.test.mjs
develop.test.mjs                    handover.test.mjs
initial-home-publication.test.mjs   initial-proposed-homes.test.mjs
operating-control.test.mjs          operating-state.test.mjs
public-response.test.mjs            scoped-context.test.mjs
scoped-corpus-runtime.test.mjs      upgrade.test.mjs
upgrade-incremental.test.mjs
```

Fast coverage still includes task authority/cancellation/staleness, reviewer identity, storage/intake corruption and restore, sandbox permissions, development patches and size policy, small operating checkpoint/negative/tree-publication contracts, corpus proof/route checks, coherent runtime and public qualification workflows. The complete large historical scenarios are not represented as a regression Pass.

`.github/workflows/qualification.yml` runs **Full qualification Node 22** on pushes to `main` and explicit manual dispatch. It executes `tests-22`: every `tests/*.test.mjs` file, including all seventeen files above. Its coverage is `full`, its selected inventory must equal the complete repository inventory, and its omitted inventory must be empty. This separate run does not block every pull-request update through `CI gate`. Full qualification remains available locally through the unchanged command below. Neither workflow invokes a model CLI.

Checkout uses `fetch-depth: 0`: historical-writer compatibility tests archive published commits with `git archive`. A shallow checkout is insufficient. Checkout does not persist credentials. Actions use full commit pins; integration QA must independently verify those pins and current runner availability. Only read permissions are granted; the final gate additionally reads Actions job conclusions with the automatic repository token. There are no model/account secrets, `pull_request_target`, publication or adoption steps.

`CI gate` runs even when dependencies fail or are skipped. It checks aggregate results and independently retrieves the current run attempt's jobs, requiring exactly one successful completed `Tests Node 22`, `Compatibility Node 26` and `Build and drift`. A cancelled matrix member cannot hide behind a successful aggregate. Artifact upload is an ordinary required step with `if: always()` and missing-file failure; upload failure fails its lane and therefore the gate. Configure branch protection to require `CI gate` after parent integration.

## Local commands and receipts

Use Node 22 for the fast regression selection or the complete suite, and Node 26 for targeted compatibility. No installation or npm dependencies are needed. The full suite has a fixed 15-minute command ceiling and four-file concurrency, inside a 20-minute workflow job. Existing qualification tests include a case with a ten-minute ceiling. A ceiling is not an expected runtime. The runner streams test output while retaining exact bounded stdout/stderr logs; deadline, output overflow or interrupt kills the command's process group and waits for child closure. Superseded pull-request runs are cancelled by PR number; main and manual runs retain their existing execution. Build/diff commands retain a 120-second ceiling. Each stream has a 64 MiB bound. Exceeding either fails; available bytes and the error remain retained.

```sh
node --no-warnings --test --test-reporter=tap tests/ci-evidence.test.mjs
node tools/build-plugin.mjs --check
git diff --check
# Evidence directories must be outside the checkout, including symlink resolution.
node tools/ci/run.mjs build /tmp/source-ci-local-build
# Requires actual macOS Seatbelt and the matching Node major:
node tools/ci/run.mjs regression-22 /tmp/source-ci-local-regression22
node tools/ci/run.mjs tests-22 /tmp/source-ci-local-node22
node tools/ci/run.mjs compatibility-26 /tmp/source-ci-local-node26
```

The fixed CLI runs only build/diff, the fixed Node 22 regression selection, the complete Node 22 suite or fixed targeted Node 26 commands; it never executes commands read from JSON. Schema 3 `receipt.json` records start/end times, exit/signal/error, exact command arguments and stdout/stderr file hashes, OS release, hosted image metadata where observed, platform/architecture/Node, sandbox capability, complete repository test inventory, exact selected and omitted test inventories and explicit regression/full/compatibility/build coverage, TAP executed/pass/fail/cancelled/skipped/todo counts, commit/tree and source-manifest identities before and after commands. The manifest hashes tracked and unignored untracked public source, modes and symlink targets; it does not recursively traverse links, Git metadata, private company state or dependency caches. Output is outside the source manifest. Source changes, dirty source, missing checks or logs, and conflicting/incomplete TAP are rejected by the same validator exercised in the tests.

A local candidate is explicitly `unverified-local` and returns nonzero, even if its build/tests pass. Retain its logs for diagnosis. `mode: github` is a workflow environment assertion, not proof of provenance; forged environment variables or JSON cannot substitute for remote verification. No environment dump is serialized. Child commands receive only path/temp/system-root environment variables, avoiding inherited Node test context and account/model secrets.

## Remote verification and trust anchors

The remote verifier owns GitHub API retrieval using built-in `fetch`; it accepts no pre-fetched receipt or `trusted: true` shortcut. It does not use `validateReusableReceipt` or integrate with company runtime. An independent reviewer supplies one exact repository, run ID, attempt, tested commit/tree, approved workflow commit and SHA-256 of its exact bytes, approved runner/validator/gate/verifier file hashes, approved job names and runner labels. These cover the gate's transitive import of the verifier's request helper. Do not derive these anchors from the candidate receipt or automatically approve changed helpers just because the workflow YAML stayed unchanged. Example fictional `expected.json`:

```json
{
  "repository": "fictional/repository",
  "run": 123,
  "attempt": 2,
  "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "tree": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "workflow": ".github/workflows/ci.yml",
  "workflowSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "workflowSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "trustedFiles": {
    "tools/ci/evidence.mjs": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "tools/ci/gate.mjs": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "tools/ci/run.mjs": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    "tools/ci/verify.mjs": "1111111111111111111111111111111111111111111111111111111111111111"
  },
  "gate": "CI gate",
  "lanes": [
    {"lane":"build","job":"Build and drift","labels":["ubuntu-24.04"]},
    {"lane":"regression-22","job":"Tests Node 22","labels":["macos-15"]},
    {"lane":"compatibility-26","job":"Compatibility Node 26","labels":["macos-15"]}
  ]
}
```

On an independently authorized network-enabled host:

```sh
node tools/ci/verify.mjs /path/to/expected.json /tmp/empty-source-ci-verification
```

The output directory must be empty. Public repositories can use unauthenticated API access where GitHub permits it. An optional `GH_TOKEN` grants API access only; it is never retained. GitHub may require authenticated read access for artifacts/logs. Inaccessibility, rate limiting, absent digests, expired evidence or unsupported formats produce a visible nonzero `source_ci_evidence HOLD`. Nothing becomes verified on an unavailable path.

The verifier retrieves the attempt-specific run and paginated jobs, checks exact required conclusions and approved hosted labels, checks source tree and complete test-file inventory plus each lane's exact selected policy, and hashes the approved workflow plus the separately approved runner, validator, gate and verifier bytes. It requires attempt-named artifacts (`source-ci-RUN-ATTEMPT-LANE`) with matching GitHub run/source metadata. It checks the GitHub-reported SHA-256 of each downloaded archive, safely reads flat ZIP contents, validates retained command-log digests and receipts, and retains actual GitHub job logs with hashes and links. Other attempts' artifacts cannot satisfy a missing current-attempt artifact. For the separate full qualification workflow, use `workflow: .github/workflows/qualification.yml`, `gate: null`, and exactly one lane `{lane: tests-22, job: Full qualification Node 22, labels: [macos-15]}` with the independently approved qualification workflow hash. A full qualification receipt cannot be substituted for the PR regression gate or vice versa. GitHub API metadata, archives and logs are retained alongside the compact `verified.json` claim/coverage/count summary. Successful consistency validation alone never grants provenance.

The minimum remote path supports completed successful `push` and `workflow_dispatch` runs where the tested commit is the workflow execution commit. Pull-request workflows still execute all CI checks, but remote verification currently holds PR runs: head source alone cannot establish the executed merge workflow identity. Verify a subsequent approved main/manual run, or independently extend PR workflow identity verification before claiming PR provenance. Runner identity means GitHub-reported hosted runner name/labels plus the approved workflow, not machine attestation or source signing.

GitHub artifacts are retained for 30 days; GitHub job logs follow repository retention settings. Download verification evidence before expiry and retain it with the independent QA record. The verifier fails after required evidence expires. Failed attempts remain failed and are not combined with successful reruns.

Changes to this workflow remain locally validated until integrated and executed on GitHub. The deterministic API doubles exercise successful and adversarial verification paths without a network call; passing fixtures do not establish a real GitHub run, native host acceptance or live company recovery.
