# Repository CI

Routine pull requests, main pushes and manual Source CI runs require two checks:

- **Tests Node 22** runs the existing regression selection on macOS, including
  authorization, cancellation, storage integrity and sandbox tests.
- **Build and drift** checks generated package files and whitespace on Linux.

**CI gate** keeps its existing name and succeeds when both jobs succeed. It uses
GitHub's dependency results directly, without API calls, tokens, artifact checks
or source-provenance approval. Failed, cancelled or unexpectedly skipped required
jobs still fail the gate. Configure branch protection to require `CI gate` if
merge protection is desired.

Node 26 compatibility and the complete historical Node 22 suite are available in
**Full qualification**, started manually from Actions. They do not run on every
PR update or main push. The full suite remains unchanged. The regression selector
continues to include new test files automatically and explicitly excludes the
existing seventeen expensive historical qualification files in
`tools/ci/evidence.mjs`.

Ordinary checks use command exit codes. Passing checks succeed on edited local
source; missing provenance metadata, a missing artifact or an unavailable upload
service does not turn passing tests into a CI failure. Node's test runner reports
any skipped tests normally. Diagnostic logs upload on a best-effort basis. Bash
pipe failure handling preserves test/build failures when output passes through
`tee`. Source CI uses read-only repository permissions and invokes no model CLI.

## Local commands

No package installation is required. Use Node 22 for routine checks:

```sh
node tools/ci/check.mjs regression-22
node tools/ci/check.mjs build
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
