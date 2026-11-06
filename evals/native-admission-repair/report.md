Source repair complete; source integration remains withheld pending independent fresh QA.

Base: `bb9921c120f770c42e39076d2f144adef22ddb92` (unchanged HEAD, v0.7.3). Started 2026-11-06 18:13:58 UTC;
report prepared 2026-11-06T18:20:38.538222+00:00.
No commit, merge, version bump, publish, installation, settings, network, agents,
other-worktree edits or actual-company access occurred.

The invariant is temporal: at the FIRST validated native admission, under the
same store transaction that persists `job.native_id` and its delivery, the native
must be independent and absent from every already committed rejected observation.
Both legacy `rejected_native_id` and accumulated `rejected_native_ids` are read.
Missing timing or an aborted first response retains rejected evidence and binds
nothing. This uses existing job native/delivery/lifecycle fields; no timestamp
comparison or persistent approval cache is introduced.

A job already bound to its approved native can continue with that exact native.
Changed native holds; its observed ID is retained separately. Forward rejection
history is not rerun on that binding and is NEVER consulted by canonical receipt
revalidation. `independent()` retains its existing historical checks and the
identity collector excludes rejected observations by default. The admission scan
opts in using only the rejected fields, avoiding traversal of unrelated future
job history. Later failed observations cannot poison an older valid extraction.
Existing current-scope, negative, timing/closure and publication gates still apply.

Actual public engine/store/worker and real scoped source validators are exercised
by three added regressions (8 origin/destination/timing combinations plus single
packet receipt preservation and changed later-page identities in both destination
protocols). They prove failed N -> explicit new job N rejected without accepted
artifact/session binding -> future fresh M completes; accepted A remains exactly
unchanged and canonically reusable after later rejected A. Existing multi-page
and >16-page cases continue with their own same approved native.
All model responses are CONTRACT DOUBLES. These are source/control-flow checks,
not native semantic acceptance, adoption or a live resume_handover Pass.

Actual checks, exit 0 on each Node version, zero failures/cancellations/skips:

| Check | Node 22.13.0 | Node 25.2.1 |
| --- | --- | --- |
| Scoped + timeout/wiring | 55/55 | 55/55 |
| Shared timeout/cancellation/handover/window/evidence | 84/84 | 84/84 |
| Targeted legacy/current context worker compatibility | 18/18 | 18/18 |

Exact invocations/results: `commands.json`. Raw final TAP/log output is retained
without whitespace normalization. No full 634-suite run or whole-evidence
whitespace Pass is claimed. `source-diff-check.log` is the empty successful
source-only diff check. The patch contains only the two allowed runtime files,
the scoped regression file and narrow identity documentation.

Source patch SHA256: `13248d2ac44baf86d24b9ae9f9d0b7a363feb3915353c83e004e8f281b4126ba`.
Per-file base/current hashes and unchanged-path assertions: `source-identity.json`.
The request/frame builders, successful stream transport, timeout, handover,
context, engine, store/version, governance v0.20, roles, manifests, SPEC and pinned
v0.18 fixture are byte-identical to the base. Existing pinned v0.18 and actual
company resume_handover acceptance are unchanged; no company read or new native
acceptance occurred. Shared fixture handover/resume compatibility passed.

Retained failure evidence:

- `precheck-reproduced-node22.tap`: before runtime edits, subsequent explicit
  single-packet job N incorrectly completed after an earlier missing-timing N.
  Exit 1 is the expected reproduction of the QA blocker.
- `precheck-fixture-one-page-node22.tap`: expanded changed-native test initially
  assumed a second page in a small fixture. Exit 1 is retained. The fixture was
  corrected to supply an explicit large dependency, reaching real page two;
  final tests pass. This was a test setup failure, not a new source failure.
- Original Engineering timeout and prior QA fail remain in unchanged historical
  recovery-delivery/recovery-delivery-fix evidence. The new supplied independent
  QA Fail on bb9921c remains the reason source integration is withheld; this
  report does not relabel either prior Fail or the historical native fixture.

Independent fresh QA and later integration with isolated operating components
remain separate stages. No retry, allowance extension, live handover acceptance,
old-writer publication fence or release permission is inferred.
