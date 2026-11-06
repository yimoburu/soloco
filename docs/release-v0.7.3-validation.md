# SoloCo v0.7.3 release validation — 2026-11-06

This patch packages the proactive CoS behavior and SPEC v0.20 accepted at `70ad982c09e50e722718b3dc9f868226481a8e8f`. The release delta is versioning, explicit v0.7.2 compatibility, generated packaging, corresponding regression coverage and release prose. SPEC, roles, CoS instructions and retained historical evidence are unchanged from that accepted source.

The CoS helps shape rough ideas, evaluates relevant alternatives using dated evidence, revisits company and product direction, and presents consequential options with a recommendation. Direction changes remain founder decisions. This is active-session assistance, not unattended monitoring.

## Fresh release checks

Standalone native Engineering: `01a1b1e5-29e6-7313-9008-b986dc5bd4f7`; requested gpt-6.1-sol, medium effort, host-default speed. Effective provider settings are unverified.

On the exact release code, the following affected suite passed **172/172 on Node 22.13.0 and 172/172 on Node 25.2.1**, zero failed/skipped/cancelled. Both outer runs used the supported OS sandbox; no nested skipped run is counted as passing execution.

```sh
node --no-warnings --test --test-reporter=tap tests/runtime-version-fence.test.mjs tests/develop.test.mjs tests/prototype.test.mjs tests/public-response.test.mjs tests/plugin.test.mjs tests/selection-wiring.test.mjs
```

Elapsed wall time: 39.834 s / 79.18 s. TAP log SHA-256:

- Node 22: `722fa4100acc7ed9de31351e9a19f47d759280268bf69364634a329aa58e7267`
- Node 25: `d8ecf15fa374cdece703625c2aa1ed192f9aacc5f19cd16cb9fcd39f6fd655f5`

The immutable published v0.7.2 writer `64bd2eb3ea3a047aba0eb284b6629414ae3ddbc6` creates a fictional company for the fence regression. Read-only v0.7.3 opening preserves its full state and pinned definitions; a semantic write promotes the producing runtime while preserving definitions; the old writer then rejects without mutation. Exact published v0.19/v0.18 compatibility and v0.17 prototype support remain.

Build freshness, SPEC/bundled-governance equality, diff whitespace, and both strict Claude plugin/marketplace validators pass. Claude's additional directory-submission checks still report the historical license/icon metadata issues; directory submission readiness is not claimed.

## Reused evidence and limits

The unchanged proactive source has independent native QA Pass from `01a1b1d1-d8aa-7081-aa8e-aacd802927f6` at `70ad982`, with 127/127 affected tests on each Node version. Release QA separately reviews this exact packaging candidate and the completed evidence. Logs, assignments, native identities and candidate hashes are retained with the release review artifacts.

Earlier architecture evidence and its limitations remain in [v0.7.2 validation](release-v0.7.2-validation.md) and [architecture evidence](../evals/architecture-repair/README.md). This is not a full-suite rerun. Optional strict format 5 remains held, and the observed large-company recovery limitation is not fixed by this patch.

Installation preserves company pins. Checked adoption of the new instructions/roles and SPEC v0.20, current trusted host invocation, complete company qualification and independent handover acceptance remain separate requirements. Do not switch a company's producing runtime while old workers remain active: old writers are deliberately fenced. No actual company state, failed attempt, notice or authority was changed by release validation.
