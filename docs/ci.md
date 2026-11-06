# Repository source CI

Source CI checks public repository source. It does not authorize work, clear notices, create development/runtime receipts, validate semantic handover, adopt governance, publish a package or establish company recovery. Native CLI smoke and actual host trust are separate acceptance requirements. No native model CLI is invoked by this workflow.

## Required checks

`.github/workflows/ci.yml` runs for pull requests, pushes to `main`, and manual dispatch. The Node 22/25 full-test matrix uses GitHub-hosted `macos-15`. Each lane must demonstrate actual `macos-seatbelt-node` capability through the existing runtime probe before running the full suite. Unsupported Seatbelt, skips, cancellation, todo, zero execution, malformed/incomplete TAP or any failing command fails the lane. The label is explicit because [GitHub retired macOS 14 on November 2, 2026](https://github.com/actions/runner-images/issues/13518); [the current standard runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) lists `macos-15` as supported. This intentionally exposes capability and fixture gaps instead of accepting a reduced suite. Linux runs the independent build/generated-drift and whitespace checks, without duplicating the full suite.

Checkout uses `fetch-depth: 0`: historical-writer compatibility tests archive published commits with `git archive`. A shallow checkout is insufficient. Checkout does not persist credentials. Actions use full commit pins; integration QA must independently verify those pins and current runner availability. Only read permissions are granted; the final gate additionally reads Actions job conclusions with the automatic repository token. There are no model/account secrets, `pull_request_target`, publication or adoption steps.

`CI gate` runs even when dependencies fail or are skipped. It checks aggregate results and independently retrieves the current run attempt's jobs, requiring exactly one successful completed `Tests Node 22`, `Tests Node 25` and `Build and drift`. A cancelled matrix member cannot hide behind a successful aggregate. Artifact upload is an ordinary required step with `if: always()` and missing-file failure; upload failure fails its lane and therefore the gate. Configure branch protection to require `CI gate` after parent integration.

## Local commands and receipts

Use Node 22 or 25. No installation or npm dependencies are needed. The full suite has a fixed 15-minute command ceiling and four-file concurrency, inside a 20-minute workflow job. Existing qualification tests include a ten-minute case; the retained historical passing matrix took about four minutes. Build/diff commands retain a 120-second ceiling. Each stream has a 64 MiB bound. Exceeding either fails; available bytes and the error remain retained.

```sh
node --no-warnings --test --test-reporter=tap tests/ci-evidence.test.mjs
node tools/build-plugin.mjs --check
git diff --check
# Evidence directories must be outside the checkout, including symlink resolution.
node tools/ci/run.mjs build /tmp/source-ci-local-build
# Requires actual macOS Seatbelt and the matching Node major:
node tools/ci/run.mjs tests-22 /tmp/source-ci-local-node22
node tools/ci/run.mjs tests-25 /tmp/source-ci-local-node25
```

The fixed CLI runs only the build/diff or full-test commands; it never executes commands read from JSON. `receipt.json` records start/end times, exit/signal/error, exact command arguments and stdout/stderr file hashes, OS release, hosted image metadata where observed, platform/architecture/Node, sandbox capability, sorted test inventory, TAP executed/pass/fail/cancelled/skipped/todo counts, commit/tree and source-manifest identities before and after commands. The manifest hashes tracked and unignored untracked public source, modes and symlink targets; it does not recursively traverse links, Git metadata, private company state or dependency caches. Output is outside the source manifest. Source changes, dirty source, missing checks or logs, and conflicting/incomplete TAP are rejected by the same validator exercised in the tests.

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
    {"lane":"tests-22","job":"Tests Node 22","labels":["macos-15"]},
    {"lane":"tests-25","job":"Tests Node 25","labels":["macos-15"]}
  ]
}
```

On an independently authorized network-enabled host:

```sh
node tools/ci/verify.mjs /path/to/expected.json /tmp/empty-source-ci-verification
```

The output directory must be empty. Public repositories can use unauthenticated API access where GitHub permits it. An optional `GH_TOKEN` grants API access only; it is never retained. GitHub may require authenticated read access for artifacts/logs. Inaccessibility, rate limiting, absent digests, expired evidence or unsupported formats produce a visible nonzero `source_ci_evidence HOLD`. Nothing becomes verified on an unavailable path.

The verifier retrieves the attempt-specific run and paginated jobs, checks exact required conclusions and approved hosted labels, checks source tree and test-file inventory, and hashes the approved workflow plus the separately approved runner, validator, gate and verifier bytes. It requires attempt-named artifacts (`source-ci-RUN-ATTEMPT-LANE`) with matching GitHub run/source metadata. It checks the GitHub-reported SHA-256 of each downloaded archive, safely reads flat ZIP contents, validates retained command-log digests and receipts, and retains actual GitHub job logs with hashes and links. Other attempts' artifacts cannot satisfy a missing current-attempt artifact. GitHub API metadata, archives and logs are retained alongside the compact `verified.json` claim/coverage/count summary. Successful consistency validation alone never grants provenance.

The minimum remote path supports completed successful `push` and `workflow_dispatch` runs where the tested commit is the workflow execution commit. Pull-request workflows still execute all CI checks, but remote verification currently holds PR runs: head source alone cannot establish the executed merge workflow identity. Verify a subsequent approved main/manual run, or independently extend PR workflow identity verification before claiming PR provenance. Runner identity means GitHub-reported hosted runner name/labels plus the approved workflow, not machine attestation or source signing.

GitHub artifacts are retained for 30 days; GitHub job logs follow repository retention settings. Download verification evidence before expiry and retain it with the independent QA record. The verifier fails after required evidence expires. Failed attempts remain failed and are not combined with successful reruns.

Live GitHub CI is unexecuted until this candidate is integrated and pushed. The deterministic API doubles exercise successful and adversarial verification paths without a network call; passing fixtures do not establish a real GitHub run, native host acceptance or live company recovery.
