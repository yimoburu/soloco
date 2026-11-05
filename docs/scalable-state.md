# Scalable company state and exact evidence reuse

This repository implementation is opt-in where it changes storage or historical
inclusion. It does not migrate a real company, resolve a notice, install a package,
adopt instructions, transfer ownership, or prove a production latency improvement.
The public APIs preserve the legacy full-state/whole-history routes.

## Everyday context and reviewed applicability

New dispatches use context format 3; existing queued format-2 jobs retain their
original serialization. Every unclassified intent, decision, preference and failed
or blocked review remains mandatory. A `Resolved` status alone excludes nothing.

`company_context inspect` returns a paged exact source index. `read` retrieves an
exact SHA-256-bound range (maximum 32,768 UTF-16 characters). Record IDs use their
canonical IDs; `job:<id>` and `upgrade:<id>` address job and historical-attempt
sources when not shadowed by an actual record ID. A collision conservatively
requires a separate unambiguous source record; it never guesses a different hash.

To classify historical evidence, call `company_context plan` with 1–100
`record_ids`, `disposition: current|resolved`, optional `roles`/`scopes`, and the
actual `source_instruction`. The new plan is not a disposition. Dispatch separate
QA on that exact plan. The runtime supplies its record sources; large typed
sources can be requested through the bounded read protocol. QA must return a
Pass with `permitted_action: apply_context_classification`, the exact
`plan_sha256`, and empty blockers. Apply with `plan_id`, `review_id`, current
epoch and the actual source instruction. The runtime checks source versions,
canonical QA provenance, native/source independence, complete source delivery,
and retained same-plan negative reviews. A repaired plan retains old Fail/Blocked
evidence; the original failed work never becomes a Pass.

For scoped work, dispatch may set `context_scope`; absence remains conservative.
`evidence_ids` declares up to 100 supplemental source IDs. Their immutable hashes
are supplied to the specialist; other prior-session hashes grant no access. A
format-3 specialist may return only `{"reads":[{"id":"...","sha256":"...",
"offset":0,"length":16000}]}`. The runtime allows four ranges per round and at
most sixteen rounds in the same native session, within the original execution
and grant deadline. It records exact deliveries. Persisted retrieved dependencies
are revalidated after the worker returns and before candidate tests/acceptance;
changing a non-governing supplemental source cannot leave a stale accepted result.

Known pure runtime rename records are excluded from permission fingerprints;
compound or unfamiliar instructions, unknown fields and other producers stay
conservative. Unknown preferences/notices retain their existing binding behavior.
Scope expiry is checked even when the event token has not changed.

## Upgrade review

`company_upgrade inspect`/`prepare` may explicitly select `context_mode: current`.
Default `full` preserves the established full-history review. Current mode moves
ONLY exact independently reviewed resolved records, their known proof records/jobs,
and reviewed historical attempts behind a source-addressed archive index. Originals,
raw checkpoint/history hashes, inventory and bounded retrieval remain intact.
Unknown or changed history is still mandatory; conflicting or missing classification
proof holds. Current understanding is not a second authoritative database.

Both native roles still independently review all current semantic pages and can
retrieve the original archive and classification proofs. Guarded apply, separate
readback, epoch/pause/candidate integrity and recovery are unchanged. Inspect shows
measured projection size before a fresh attempt; it grants no adoption credit.
One-time legacy classification is deliberate work, not automatic compaction.

## Targeted SQLite storage and transfer

`company_storage inspect` reports the physical layout. Explicit `migrate` requires
the owning session/epoch, actual source instruction, a paused company, no active
jobs and no unfinished/uncertain cancelled workers. It takes a consistent SQLite
backup, migrates into individually addressable entries and immutable hashed values,
verifies complete logical readback (including unknown fields), then fences legacy
writers with triggers. Originals are not garbage collected. An interrupted migration
rolls back while retaining its backup. No actual company is migrated by installation.

Selected save/hook bookkeeping operations use targeted transactions. Idle worker
monitoring reads the small committed event token; relevant changes trigger full
eligibility checks, with clock-based expiry and final atomic validation retained.
Full-state status and generic transactions remain available and linear in history.
Normalized full reads can be slower than legacy JSON reads; see measured results.

`backup` inventories the consistent database, project-owned `.company` configuration
(including development byte settings), materialized candidates and explicitly chosen
external `artifacts: [{source, path}]`. Choose a new absolute real output directory
outside every copied source. Links, self-copy, special files and changed state hold.
`restore` verifies the file inventory and company-state digest into a new folder;
it preserves original ownership rather than transferring it. External references
embedded only in prose are not inferred complete: callers must explicitly inventory
required maintenance artifacts before treating a backup as a complete handoff.

## Deterministic validation reuse

By default tests execute normally. A future reuse source must be an original
completed runtime test receipt that was independently accepted, with QA explicitly
qualifying `review.deterministic_validation`:

```json
{"permitted_action":"reuse_exact_validation","fingerprint":"exact fingerprint",
 "dependencies_complete":true,"external_state":false}
```

Omit this qualification if tests depend on randomness, clocks, untracked environment
or outside state. Reuse is a judgment backed by the inspected tests/dependency
manifest, not an automatic inference from passing tests.

A new `company_develop run` may explicitly name `reuse_receipt_id`. Runtime checks
canonical original-job/candidate/QA bindings and absence of unresolved negative
reviews. It verifies candidate bytes and a fingerprint of complete source/test
manifests, actual command/environment/absolute execution paths, Node binary,
discovered non-system dynamic-library bytes, OS build/release, runner, sandbox
policy and output/time limits. Missing or changed identity holds reuse. Raw
inherited environment and credentials are never retained.
Runtime load commands are rediscovered and bytes rehashed before and after the
execution or reuse interval. A changed/unknown post-run identity produces a
failed result while preserving whether tests actually ran and their output;
it cannot publish a reusable Pass.

The new receipt says `tests_executed:false`, `reused:true`, and identifies the
original executed receipt. It cannot chain reuse or inherit acceptance. Fresh
independent QA and exact new receipt/candidate acceptance remain required. The
project-relative materialization pointer cannot follow an old absolute project
path after restore; path-sensitive reuse becomes inapplicable and a new candidate
must be materialized/tested normally. No old attempt allowance is reset.

## Acceptance evidence and remaining limits

Final isolated branch verification (2026-11-04): Node 25.2.1 full suite passed
344/344 with zero skips using actual macOS sandbox execution. The subsequently
added deterministic second-writer snapshot regressions passed 4/4 separately
on both Node 25.2.1 and minimum Node 22.13.0. Plugin build consistency and
`git diff --check` passed. Full minimum-Node and merged-branch verification
remain integration checks; this report does not claim they ran on this branch.

| Original scope | Implementation and executed evidence | Limits |
|---|---|---|
| #17 | Reviewed plan/apply protocol; scope-aware format-3 context; bounded versioned reads; durable stale-source checks; conservative unknowns and negative reviews; supported pure-rename grant regressions | One-time classification requires real review; fixture decisions are not proof of actual historical understanding |
| #14 | Explicit normalized migration with backup/readback/fences; targeted saves/notices; token polling with expiry; manifest restore/config/artifact checks; rollback/corruption/self-copy tests | Full reads/generic transactions remain linear; external prose references need explicit inventory |
| #13 | Opt-in reviewed current projection; original archive retrieval and original hashes preserved; fixed current upgrade page count over growing reviewed archive | Unclassified legacy history stays full/held; no real-company adoption or model-quality improvement is claimed |
| #19 | Actual isolated original tests → explicit independent determinism qualification → acceptance → qualified reuse → fresh QA/acceptance regression; strict fingerprint and negative/stale/tamper boundaries | No reuse when dependencies/determinism are unproven; no measured production accepted-outcome speedup |

[Reproducible benchmark](scalable-state-benchmark.md) records 1x/10x/100x fictional
history measurements, preservation/recall assertions and explicit CPU/storage
trade-offs. It makes no model-quality, token, billing or production noninferiority
claim. Full live task-quality/latency comparisons remain a release/operating
qualification step; do not close the broad issue solely on these fixture results.

Ordinary coordinator handover now freezes the same complete subject and exact
SHA256 as before, while new reconstructions use `ordinary-handover-review-v2`.
The 200000-character initial review budget is unchanged. The initial pack contains
bounded current objective, pinned rule, authority and notice previews, plus exact source/length entry points. Large pinned definitions
continue in frozen ranges. The complete semantic stream is referenced, never
embedded in the initial pack. Assignment/charter/prior-review framing and source
indexes are pageable too. The review reuses the upgrade evidence registry and
typed payload projection: exact archival checkpoint repeats point to earlier compulsory semantic projections. Source and
repeated-occurrence indexes are themselves frozen, bounded-readable sources,
so archive registry growth does not fill the initial packet. Every
distinct checkpoint field, legacy team restriction, current record, job, notice,
message, failed review and unknown obligation remains compulsory. Neither age,
status nor context classification automatically clears handover evidence. Exact
originals remain retrievable; the preservation inventory is not proof that QA
understood them. Distinct mandatory semantics exceeding the initial budget
are delivered through bounded frozen reads without truncation.

Tool-free QA can return only `{"reads":[{"source_id":"...","sha256":"...",
"offset":0,"length":16000}]}`. The worker supplies up to four exact frozen ranges
per request, each at most 32768 UTF-16 units, without splitting surrogate pairs,
and resumes the same independent native session. Every serialized packet stays
within 200000 characters; escaping may defer whole requested ranges, explicitly
listed for re-request. Pass requires complete delivery of the compulsory semantic
stream to that native session, separately from citation validation. A single
generic citation cannot bypass missing ranges. Blocked may report incomplete
delivery. There is no handover read-round ceiling; the recorded execution deadline still applies. The final artifact must
cite delivered evidence using `source_id`, `sha256`, optional supplied `revision`,
`offset`, `length`, and `range_sha256`. The worker validates delivery and retains
source/range/native-session receipts bound to the subject and reconstruction.
Canonical changes invalidate publication or resume; review/read bookkeeping does
not change the frozen subject. Existing retained v1 reconstructions keep their
original contract. Ordinary, development and prototype supplemental reads retain
their existing protocol. No projection, citation, or Pass grants business authority.

These are character transport bounds, not verified model token fit or proof of
semantic understanding. QA must report Blocked for missing understanding. Evidence
construction still examines the full preserved JSON in memory; this is not an
archive storage migration or a streaming storage implementation.

Fictional regression coverage includes the 25.7M archive and 227 varied current
records with three upgrade snapshots, unique mandatory prose, a source index and
pinned rules each exceeding 200k. Injected reviewers retrieve every required range
before resume; early Pass, delivery gaps, forged/mutated evidence, identity changes,
stale acceptance and escaped packet overflow remain held. The 20 handover tests
and 76 related evidence/paging/coordination/timeout tests passed (full runs plus
final targeted checks). The original validation included a memory-only actual-company packet diagnostic; it was not a live handover, model-fit measurement or understanding test. Final v0.6.12 evidence is recorded separately.


### v0.6.12 control and founder inspection

`company_control handover` constructs the prospective owner, epoch and exact founder decision inside its transaction, then preflights the actual independent-QA envelope with maximum allowed reconstruction escaping and a 20,000-character worker reserve. Failed evidence/admission leaves the outgoing owner, epoch, sessions and pause state unchanged. Successful transfer still pauses company work until current independent QA explicitly permits `resume_handover`. Admission proves packet construction, not that all historical semantics will fit a model or finish before its deadline.

`company_handover inspect` returns bounded source descriptors, a current subject hash and disclosed whole-entry notice/job metadata windows. `read` requires that hash plus `source_id`, source `sha256`, `offset` and `length` (at most32,768UTF-16units). A changed subject rejects stale reads. The complete reconstruction snapshot remains retained in company records, while `submit` returns a bounded receipt with its ID/revision, subject hash/size and source count. The inspector caches one immutable projection by the complete current subject hash; each request still checks current truth. QA has its own independent delivery ledger. The cache neither establishes delivery nor authorizes acceptance.

Resume revalidates the exact review context as well as the subject and reconstruction. Editing an earlier handover finding, assignment or supplemental source cannot leave an old Pass acceptable. Existing same-owner pause/resume, late-result quarantine, current native identity checks and explicit version fences remain. Compatible code does not adopt a company’s team, governance or permissions.

This repair keeps all unknown/unclassified legacy semantics compulsory. It does not classify old audits, add a new evidence database, or claim constant total-history review work. One-time reviewed applicability work and broader scalable company-memory design remain separate, visible obligations.

Earlier reconstruction records are immutable through `company_save`; a repair uses a new reconstruction. Later subjects keep their full content, metadata, reviews and execution evidence while referencing each original embedded snapshot by record ID and exact hash. The lossless reader resolves only matching retained originals, registers their exact bytes, and includes every distinct semantic field through proven checkpoint equality. This prevents recursive full-snapshot duplication across repaired submissions without adding another evidence store or marking a finding resolved. Missing or corrupted originals hold. Legacy encoding remains supported, but changed freshness dependencies may require a new independently reviewed reconstruction; an old Pass is never promoted across changed evidence. Founder range replies count the full escaped response and hold with a smaller-range bound when text or source metadata cannot fit.
