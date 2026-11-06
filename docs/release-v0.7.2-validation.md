# SoloCo v0.7.2 source packaging validation — 2026-11-06

Candidate base: `e9299dc`; accepted architecture behavior: `8c71df9fa2cc66eca81174e0ec76d78f69cc2967`. This packaging delta is subject to independent native QA and root CoS release review. It is not installation, publication, company qualification, adoption or handover acceptance.

## Changes and compatibility

- Runtime VERSION, both host plugin manifests and the generated Codex MCP launcher now select 0.7.2. Both marketplace manifests have no version field and already resolve `plugins/soloco`; they remain unchanged.
- Published 0.7.1 remains explicit in runtime/team, dispatch model-selection, public model-selection, development and prototype allowlists after VERSION moves forward.
- The existing runtime-version-fence regression extracts the actual immutable published writer `1347f79c4249c8e4aba39ba372ad1376476f9a79` with local `git archive`. That writer creates a fictional company in its own process; 0.7.2 opens it without changing producer/state, then saves a semantic decision, stamps 0.7.2, and retains plugin version, governance/hash, roles, CoS instructions, team hash and owner. The actual old writer then rejects a semantic write and leaves the promoted state unchanged. Older writer regressions remain.
- Existing exact-governance capability regressions now include 0.7.1. The v0.18 development continuity case is added to the existing sandbox-dependent regression; it was skipped here, not accepted as executed. Exact published v0.18 digest remains `185933ddeafe9709bef44e9a6605ba7adb5faaa8bc43c1c64f1da3b03ae5f400`; exact v0.17 prototype support remains.
- SPEC, generated governance, roles, pinned CoS skill and both marketplace files are byte-identical to base. No protocol, authority or company governance change.

Changed source paths: `README.md`, `docs/development.md`, this report; `plugins/soloco/{.claude-plugin/plugin.json,.codex-plugin/plugin.json,.mcp.codex.json}`; runtime `{store,engine,public-response,develop,prototype}.mjs`; tests `{runtime-version-fence,develop,prototype,public-response}.test.mjs`. External handoff notes: `/private/tmp/soloco-v072-20261106/release-notes.md`.

## Executed release checks

Working directory for every command: `/private/tmp/soloco-v072-20261106/source`. Log prefix below is `/private/tmp/soloco-v072-20261106/`. Each process had an outer timeout of at most 360 seconds; fence reruns and package checks 60 seconds, strict validators 45 seconds. No timeout or test failure occurred.

The builder was first run as `node tools/build-plugin.mjs` using local default Node v25.2.1, then checked. Focused commands (360-second outer timeout each):

```sh
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --no-warnings --test tests/runtime-version-fence.test.mjs tests/develop.test.mjs tests/prototype.test.mjs tests/public-response.test.mjs tests/plugin.test.mjs tests/selection-wiring.test.mjs
/opt/homebrew/bin/node --no-warnings --test tests/runtime-version-fence.test.mjs tests/develop.test.mjs tests/prototype.test.mjs tests/public-response.test.mjs tests/plugin.test.mjs tests/selection-wiring.test.mjs
```

| Runtime | Log under prefix | Tests | Pass | Fail | Skip | Duration | Exit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Node 22.13.0 | `node22-focused.tap` | 168 | 121 | 0 | 47 | 31.252 s | 0 |
| Node 25.2.1 | `node25-focused.tap` | 168 | 121 | 0 | 47 | 36.751 s | 0 |

Node 25's default reporter produced text despite the `.tap` filename. All 47 skips on each runtime report `Constrained Node startup failed: sandbox-exec: sandbox_apply: Operation not permitted. No unsandboxed fallback.` The fail-closed path and exact governance capability checks ran; sandbox execution/development acceptance did not. A supported OS sandbox is still required to execute those skipped checks. No bypass was used.

After a test-name punctuation correction, reran the final fence file on both runtimes (60-second outer timeout each):

```sh
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node --no-warnings --test --test-reporter=tap tests/runtime-version-fence.test.mjs
/opt/homebrew/bin/node --no-warnings --test --test-reporter=tap tests/runtime-version-fence.test.mjs
```

Logs `node22-final-fence.tap` and `node25-final-fence.tap`: **6/6 each, zero skips/failures, exit 0**, 1.826 s / 3.887 s. One test loops over six actual immutable historical writers, including published 0.7.1. These counts overlap the focused run and must not be added as distinct coverage.

Package/invariant commands, each exit 0; **4/4 command checks**, exact output in `package-checks.log`:

```sh
/private/tmp/soloco-node22-validation/node-v22.13.0-darwin-arm64/bin/node tools/build-plugin.mjs --check
/opt/homebrew/bin/node tools/build-plugin.mjs --check
git diff --check
git diff --exit-code e9299dc -- SPEC.md plugins/soloco/assets/governance.md plugins/soloco/assets/roles.json plugins/soloco/skills/soloco/SKILL.md .agents/plugins/marketplace.json .claude-plugin/marketplace.json
```

Documented strict validation, **2/2 commands exit 0**:

```sh
claude plugin validate plugins/soloco --strict
claude plugin validate . --strict
```

Logs: `strict-plugin.log`, `strict-marketplace.log`. Both end `Validation passed`. The plugin validator separately reports directory-submission license missing and icon warning; its output explicitly says these directory checks do not change this validation result. No directory-profile validation or directory publication readiness is claimed. No license or branding policy was invented to clear them.

## Reused architecture acceptance, not a final-tree full run

Read and retain [architecture evidence](../evals/architecture-repair/README.md) and [exact independent QA](../evals/architecture-repair/final-qa-report.md). No old evidence was rewritten. Composite evidence: full **634/634** on Node 22.13.0 and 25.2.1 at `56db5ca`, zero skips; subsequent scoped reviewer/harness checks **28/28** on both; interface delta scoped **28/28** on Node 25; exact final interface/OPEN-wording checks **3/3** on each. Referenced retained logs are `../node22-combined-full.tap`, `../node25-combined-full.tap`, `../scoped-peer-node22.tap`, `../scoped-peer-evidence.tap`, `../scoped-interface-reference.tap`, `../interface-final-node22.tap`, `../interface-final-node25.tap` relative to the original architecture evidence checkout, as documented by its QA report. Scoped contract-double runs are not native semantic acceptance. There was **no full 634-test rerun of this release tree**.

Independent native acceptance at `8c71df9` covers the isolated fictional public dispatch/worker qualification: seven accepted native receipts, reused immutable extraction, independent domain/interface/integration review, canonical apply, persisted delivery and confirmed closure. Read-only post-apply ordinary format-3 packets measured 3,887–3,889 bytes. Original OPEN invoice uncertainty, exhausted allowance, failed outputs and unresolved notices survive; no sending/charging/refund authority appears. No ordinary business worker was launched in that paused fixture.

The continuation report remains **Held** because optional strict format 5 still encounters four historical unqualified referenced proof sources. It is not a passed overall continuation or strict-format qualification. Large-company/native scaling and actual SoloDev archive qualification remain unestablished. Effective model/effort/service settings remain unverified.

## Handoff and limits

No actual company, installed plugin, settings or host configuration was changed. No publication, installation, adoption, company resumption, network operation, new dependency, agent delegation, commit or push occurred in this assignment. All runtime state created by checks was disposable fictional test state; local immutable Git objects supplied historical writers. Release notes and test logs are retained outside source for handoff.

Next: independent native QA of the frozen exact candidate, then CoS release handling. Installation/readback, bounded actual SoloDev qualification, an exact independent handover Pass and authorized resume remain separate downstream work. Main blockers/risks: this sandbox cannot execute the 47 development-dependent checks; strict format 5 remains Held; no large/live-company qualification; directory submission metadata issues if that publication route is later chosen. No new source defect was observed by the executed focused checks.

## CoS supplemental checks and actual-company preflight

The original 47 skipped sandbox cases above remain skipped evidence. CoS separately executed the new `pinned v0.7.1 preserves` development continuity case using the supported OS sandbox on each supported runtime: `node --no-warnings --test --test-name-pattern='pinned v0.7.1 preserves' tests/develop.test.mjs`. Both runs exited 0, **1/1 passed, zero skips**. Logs: `/private/tmp/soloco-v072-20261106/node22-live-v071-development.tap` and `node25-live-v071-development.tap`. This verifies that specific added continuity case; it does not relabel the earlier focused run or claim all skipped cases ran.

A separate read-only software preflight against the actual paused company at revision 1034 found a current lower bound of **104,077 UTF-8 bytes** for global core evidence before governing record bodies, homes, extraction results or review instructions. The supported scoped input ceiling is **48,000 bytes**. Sixty-seven unclassified governing record values total another 157,027 bytes. Nine historical source manifests initially contain **27,063 extraction units**, before possible later subdivision or reuse; this is not a final dispatched-call count. The diagnostic used read-only/query-only SQLite plus pure source projection functions, preserved the logical state and event sequence, and dispatched no model calls. No source bodies were exported. Detailed evidence remains local outside this repository.

This is an observed live-recovery applicability limit, stronger than merely saying production convergence is unverified. Release/source acceptance must not be presented as a workable SoloDev handover path. The company remains paused until a supported complete-evidence path and a current independent exact-state Pass exist; no limit, notice or failed grant is waived by publication or installation. The optional strict format-5 hold also remains.
