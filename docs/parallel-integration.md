# Parallel branch compatibility

This branch combines separately reviewed repository candidates without changing main, publishing, installation or actual company changes.

## Resolution rationale

- Dispatch/worker retain #16 exact dependency admission, resource claims and confirmed-closure release together with #18 project-root-specific development budgets and complete reconstructed patch candidates.
- Worker publication retains both quarantined complete files and quarantined patches; no stale output receives acceptance.
- The pending ordinary-handover exception permits only exact reconstruction QA while paused; coordination checks and all ordinary-job pause checks remain enforced. Resource/dependency metadata is also included in immutable handover-review assignment context without repeating the frozen subject.
- The handover moderate-history regression uses the actual 200000-character transport ceiling rather than a metadata-dependent 160000-character test threshold. The exact single-copy assertion and deliberate oversized-state hold remain. The runtime ceiling is unchanged.
- Authoritative context classifications and their disposition/review provenance enter the frozen handover subject/hash. A classification-only change invalidates previous reconstruction/QA, even when canonical records and jobs did not change.
- Dynamic schema/configuration reporting remains tied to the selected company root, alongside the handover endpoint and optional dependency/resource fields.
- Format-3 bounded contexts retain immutable coordination metadata and explicit prerequisite artifact inputs. Legacy format-2 metadata order remains compatible. Exact handover QA takes the special single-subject path before everyday current-state projection.
- Validation reuse retains exact original execution/qualification/negative-review checks and the portable project-relative directory pointer; new candidate creation still stages complete files and publishes by atomic rename.
- Database-token polling retains time-based scope expiry checks and separately reads the external development ceiling on every poll. Changing `.company/development.json` cannot preserve an obsolete generation budget merely because SQLite did not change.
- Each supplemental model invocation clears the prior output before launch. An earlier successful read round cannot establish closure of a later uncertain invocation or release its exclusive resources.
- Latest main `37e82eb` is merged into this review branch with its 0.6.8 metadata and immutable upgrade call ceilings: 10 minutes by default, explicit prepare-only 30 minutes, and the remaining finite overall window. Ordinary specialist dispatch keeps its separate 10-minute maximum.

Focused integration tests cover all four candidates together, including handover, resource conflicts/closure, exact prerequisite lineage, scope-aware budgets, patch reconstruction, current-state context/storage, qualified validation reuse and schema wiring. Original branch acceptance limits and fictional/live evidence distinctions remain applicable.

## Executed integration validation

Both full suites ran the frozen runtime commit `65b00e4` with actual macOS isolation and fictional scratch companies. The committed [validation receipt](../evals/parallel-integration-validation-2026-11-04.json) identifies the original feature commits and exact log hashes.

| Runtime | Passed | Failures / cancellations / skips | Duration | Complete receipt |
|---|---:|---|---:|---|
| Node 25.2.1 | 392/392 | 0 / 0 / 0 | 65.27 s | [Full log](../evals/parallel-integration-node25-tests.log) |
| Minimum supported Node 22.13.0 | 392/392 | 0 / 0 / 0 | 71.02 s | [Full log](../evals/parallel-integration-node22-tests.log) |

The focused merged suite passed 89/89 with zero skips. Its first unprivileged run passed 51 and skipped 38 sandbox cases; that run did not qualify isolation and was repeated with actual sandbox access. Package generation check and `git diff --check` passed. A separate agent reviewed the merged development, context, worker and schema seams and found no concrete remaining merge regression.

Node 22.13.0 used a checksum-verified official temporary darwin-arm64 runtime; no machine installation or persistent PATH change occurred. These tests validate the combined runtime boundaries and deterministic fixture outcomes. They do not establish effective model identity, production latency, billing savings, business outcomes or quality noninferiority.

Ordinary handover deliberately retains a single complete frozen subject under its 200000-character admission ceiling. Adding bounded format-3 everyday retrieval does not make that special initial handover context archive-bounded. Oversized handovers still hold without truncation, including any additional classification provenance. This remaining delivery limit must be disclosed; enabling safe paged handover reconstruction needs its own complete frozen-source retrieval proof. No archive-size or live-handover success claim follows from these integration checks.

Release prerequisite: the integration branch retains the latest main version metadata solely for compatibility and packaging checks. Before operational use, publish a coherent new runtime version so prior runtimes reject company state produced with the new handover requirements. Normalized storage fences legacy writers; that protection alone does not make an older runtime enforce new handover gates on legacy JSON storage. Stock installed 0.6.8 does not contain these branch changes. No release, installation or company adoption is performed here.
