# Prospective bounded qualification repair

Unpublished source patch only. No company state, installation, release metadata,
team/governance compatibility, producer version or prospective handover window
changed. Existing failed jobs and v1 receipts remain failed or v1.

`company_context action=plan source_id=… profile=large-v2` selects a fresh version-2
plan within the existing tree protocol. Omitting profile preserves exact v1 plan
and packet generation. Profile is rejected outside fresh source-plan creation.
The returned plan receipt and manifest inspection expose profile, partitioner,
fixed limits, leaf/node counts and total independent sessions (including aggregate).
There are no caller-settable limits.

| Bound | Retained v1 | large-v2 |
|---|---:|---:|
| Complete framed unit UTF-8 bytes | 10000 | 32000 |
| Complete native input UTF-8 bytes | 48000 | 224000 |
| Compact complete output envelope UTF-8 bytes | 12000 | 48000 |
| Raw output UTF-8 bytes, including whitespace | 48000 | 128000 |
| Merge fanout | 2 | 4 |
| UTF-16 overlap | 128 | 128 |

The 48000-byte output cap couples with fanout four: four complete child results
consume at most 192000 bytes before packet framing; every actual packet is checked
against 224000 before launch. Unusually large identities/framing deterministically
hold rather than truncating. Before launching a fresh reconciliation, a conservative complete child-union
carrier must also fit the output envelope without assuming equivalence. Excess
known density holds before launch. Additional cross-child findings may still
require a hold on return. No semantic equivalence is inferred by this preflight. Unit partitioning, topology, limits and profile are hashed in the plan;
target references, assignments and the existing immutable derivation capsule bind
that exact plan. Canonical apply rechecks output against its own plan's fixed cap.

Input plus compact output budgets total 272000 bytes, deliberately conservative
relative to the supplied host advertisement of 500000 context tokens with 475000
effective tokens. Bytes do not establish exact tokenizer consumption, host overhead,
entitlement or semantic completion. No 872000-token setting is assumed or enabled.

## Measured fictional workload

Same complete typed audit payload: 196800 UTF-16 code units; exact original JSON
216263 UTF-8 bytes, six mandatory current homes, an unknown conditional field,
prior-failure wording and exhausted allowance. All original/raw payload bytes were
retrieved and compared exactly; contract doubles exercised every canonical node.

| Observed | v1 | large-v2 |
|---|---:|---:|
| Units | 44 | 14 |
| Merge nodes | 42 | 6 |
| Aggregate | 1 | 1 |
| Independent sessions | 87 | 21 |
| Max complete input bytes | 14577 | 36737 |
| Total input bytes | 861118 | 448791 |

This is 4.14x fewer sessions on the same fixture. It is not a measurement of the
private 213-session pilot and not independent native semantic QA. Synthetic dense
24-item outputs above 12000 bytes pass only with the new profile, including actual
worker persistence, canonical aggregate apply and immutable capsule lookup.

## Sibling failure and remaining holds

A regression starts one synthetic worker, fails its queued sibling, and waits for
the real worker monitor. The retained failure notice changes the mandatory current
subject and the running worker aborts with ASSIGNMENT_INELIGIBLE. The established cancellation outcome and adapter failure code remain unchanged.
Qualification failures additionally record abort_kind=eligibility_loss and surface
the actual eligibility cause in the notice, retaining the original abort evidence. Notices, failed jobs,
negative outputs, and freshness fences remain intact. This reproduces a mechanism
consistent with the anonymized observation; it does not prove that private event's
cause without its evidence.

Historical-only successful extraction reuse and shared current-root reuse are
explicitly deferred: safely separating applicability, negative closure, ownership
controls and frozen subjects needs a larger protocol change. A failure notice can
still fence siblings and previously successful nodes under the exact original
subject. No failed/cancelled job is recycled; fresh current applicability and final
aggregate remain mandatory. Real continuity remains blocked on root's independent
native QA, runtime matrices, review/publication decision and independent complete
resume_handover QA. No release or company execution occurred here.

## Executed checks

Successful Node built-in test invocations:

```sh
node --test --test-name-pattern='^(fresh |same complete negative|four maximum|actual sibling)' tests/context-qualification.test.mjs
node --test --test-name-pattern='^(complete extraction|exact source|exclude only|notice deliveries|deterministic coverage|every unique|no current applicability|new exact-plan negatives|independent fresh|canonical native|wire-size accounting|worker delivers|worker retains|worker requires|closed node|actual paused engine|public |actual in-flight|new tree|supported paused|immutable qualification)' tests/context-qualification.test.mjs tests/public-qualification-workflow.test.mjs tests/qualification-unit-storage.test.mjs
node --test --test-name-pattern='^public fresh profile' tests/public-qualification-workflow.test.mjs
```

Those runs passed 5, 23 and 1 tests respectively. Coverage includes exact input,
compact output and raw output max/max+1, four maximal child envelopes with a prelaunch density hold, fitting four-child merge,
missing support/coverage, contradictions, unknown outputs, retained negatives,
source/counterpart/owner freshness, pause/revoke/cancel fences and the real handover
gate. An initial broad negative-pattern run was stopped at 110 seconds; its context
test file was cancelled, while seven public/storage tests passed. It is not claimed
as a passing suite. Two development runs exposed fixture mistakes (missing import,
then untyped payload selection), corrected before the successful measured run.
The costly multi-million benchmark was not intentionally rerun. Syntax checks and
`git diff --check` were also executed. A final full run of
`node --test tests/public-qualification-workflow.test.mjs tests/qualification-unit-storage.test.mjs`
passed all 8 tests; the five focused profile regressions and public fresh-profile
test were rerun after adding the density preflight. No background work remains.

Root seam corrections after Engineering return: native JSONL transport has a separate bounded quoting allowance (six times raw-response bytes plus 16384 characters), while parsed raw128000/compact48000 UTF-8 guards remain exact. A full newline-padded raw response is persisted and canonically revalidated. The public workflow now creates a genuine replacement, submits its reconstruction and verifies that supported resume still rejects missing independent handover QA. These corrections need fresh focused receipts before source acceptance.

Full matrices on the first freeze2ff4f04 each ran566tests and found one real cancellation-contract regression (565pass/1fail). That failure is retained. The correction preserves existing outcome/code/termination fields, adding only qualification-specific cause attribution. The previously completed multi-million fixture passed and its pure workflow dependencies are unchanged by this correction; final validation must disclose any exact reuse instead of claiming another full run.
