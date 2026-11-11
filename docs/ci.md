# Repository CI

Routine pull requests, main pushes and manual Source CI runs require two checks:

- **Tests Node 22** aggregates two isolated macOS regression shards, including
  authorization, cancellation, storage integrity and sandbox tests. Each shard
  runs complete test files; their exact union is the existing regression selection.
- **Build and drift** checks generated package files and whitespace on Linux.

**CI gate** keeps its existing name and succeeds when both jobs succeed. It uses
GitHub's dependency results directly, without API calls, tokens, artifact checks
or source-provenance approval. Failed, cancelled or unexpectedly skipped required
jobs still fail the gate. Branch protection on `main` requires `CI gate` and
`Merge readiness`, including for administrators.

The two aggregate jobs use fail-closed shell checks without a checkout or Node
setup. Every actual test shard still requires the real macOS Seatbelt backend.

## Required auto-merge

Every CoS and replacement session follows [AGENTS.md](../AGENTS.md): keep a PR
draft until its exact head has the required review, QA and owner acceptance,
then mark it ready and enable native GitHub auto-merge. The assigned integrator
verifies the request and owns delivery through merge, without another routine
founder prompt.

**Merge readiness** is a separate read-only Ubuntu job. It reads the live PR
through GitHub's API; it does not check out or execute PR code, run a model,
change the PR, or rerun Source CI. It passes only for an open, non-draft PR into
`main`, with the event's exact current head and an enabled auto-merge request.
Drafts and ready PRs without auto-merge intentionally remain unsuccessful in
this check; their ordinary test/build results are independent.

The job runs on PR creation, reopening, head updates, draft/ready transitions and
auto-merge enable/disable events. Only an explicit ready or auto-merge-enable
event can pass it. A head update or reopening holds readiness even when GitHub
retains the previous auto-merge request; metadata edits cannot clear that hold.
Before another push, disable auto-merge and return the PR to draft; after the
required new-head review, repeat the ready/enable sequence. Superseded readiness
runs are cancelled.

Arm auto-merge using the authenticated CoS/integrator account, either in the UI
(**Enable auto-merge → Confirm auto-merge**) or with:

```sh
gh pr merge <PR> --auto --merge --match-head-commit <accepted-head-sha>
```

The workflow itself has read-only permissions. It does not merge using
`GITHUB_TOKEN`, so it does not suppress the normal main-push Source CI run.
GitHub state is a mechanical prerequisite; the check cannot certify native QA
or company acceptance. Keep those exact-head records and existing holds.

## Test selection

Node 26 compatibility and the complete historical Node 22 suite are available in
**Full qualification**. Adding `qualification-ready` to a frozen draft PR starts
both lanes against that event's exact head. Manual Actions dispatch also accepts
an optional exact 40-character commit SHA. Qualification does not run on every
PR update or main push. If a labeled candidate changes, remove/reapply the label
or dispatch the new exact SHA; the previous result stays scoped to the old head.
Keep the PR draft until qualification required for its head is complete, since
native auto-merge does not wait for optional checks automatically.

The full suite remains unchanged. The regression selector
continues to include new test files automatically and explicitly excludes the
existing seventeen expensive historical qualification files in
`tools/ci/evidence.mjs`.

Ordinary checks use command exit codes. Passing checks succeed on edited local
source; missing provenance metadata, a missing artifact or an unavailable upload
service does not turn passing tests into a CI failure. Every test lane first
requires successful startup of the actual macOS Seatbelt backend; unsupported
isolation fails before tests start, rather than passing with sandbox tests skipped.
Node's test runner reports other skipped tests normally. Diagnostic logs upload on
a best-effort basis. Bash
pipe failure handling preserves test/build failures when output passes through
`tee`. Source CI uses read-only repository permissions and invokes no model CLI.

## Local commands

No package installation is required. Use Node 22 for routine checks:

```sh
node tools/ci/check.mjs regression-22
node tools/ci/check.mjs build
```

To run the same whole-file partitions separately:

```sh
node tools/ci/check.mjs regression-22 --shard 1/2
node tools/ci/check.mjs regression-22 --shard 2/2
```

For explicit qualification, use Node 22 for the full suite or Node 26 for
compatibility:

```sh
node tools/ci/check.mjs tests-22
node tools/ci/check.mjs compatibility-26
```

Test jobs run on macOS because the sandbox tests exercise real Seatbelt isolation.
Their checkout retains Git history for historical compatibility fixtures.
Superseded PR runs are cancelled automatically. Job timeouts remain twenty minutes
for tests and five minutes for build.

The strict receipt runner and remote verifier remain optional tools for
[historical evidence verification](ci-evidence.md). Their receipt/provenance
requirements are separate from ordinary CI success.
They do not turn current sharded diagnostic logs or the Linux aggregate job into
a historical whole-suite macOS receipt. See [implementation workflow and timing](implementation-speed.md).

### Pinned companion source checks

The required Build and drift job also verifies the source-owned
`native/codex/` manifest and all pinned payload bytes, then runs its 47 pure
Python temporary-data checks. These checks do not download upstream source,
compile Rust, invoke the sandbox executor, install a toolchain or start a
native/model session. The explicit macOS offline build and native qualification
remain separate from this source-delivery check.
