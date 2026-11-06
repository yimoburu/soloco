# Scalable company state and exact evidence reuse

v0.7.0 separates current task context from retrievable historical evidence.
Incompatible storage changes require explicit migration. Source tests do not migrate
a real company, resolve a notice, install a package, adopt instructions, transfer
ownership, or establish native semantic acceptance.
Public current views are bounded; exact history remains available through explicit
collection pages, hash-checked reads and verified storage backups.

## Everyday context and reviewed applicability

New dispatches use context format 3; existing queued format-2 jobs retain their
original serialization. Every unclassified intent, decision, preference and failed
or blocked review remains mandatory. A `Resolved` status alone excludes nothing.
The pack also includes exact task inputs, required dependency artifacts, every
valid mapped home required by the reviewed task scope (including artifact-kind homes), current unknown authority
extensions, open notices and the role inbox. Unrelated unknown archives remain
unclassified and exactly retrievable; ordinary work does not globally replay them.
Formats 4/5 remain internal compatibility code and are not selected by new public
dispatch. Old frozen handover and upgrade attempts retain their original contracts.

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

For new oversized historical containers, prefer the explicit
[`scoped-context-v1` workflow](scoped-context.md): immutable extraction, bounded
current applicability and interface checks, then independent integration. OPEN
uncertainty can remain faithfully OPEN; preservation does not resolve it or renew
authority. Independent reviewed scopes keep unrelated current homes out of a
task, while global/unknown obligations remain mandatory. Original bytes, failed
results and canonical receipt provenance remain available.

Existing tree qualifications retain the following protocol and proof rules.
Use the existing `company_context` tool
with `action: plan`, `source_id`, `counterpart_ids`, `dependency_ids`, current epoch
and the exact source instruction. This uses `soloco-context-tree-v1`, separately
from legacy classification. The transaction pins the exact original, as-of subject
and referenced current inputs in the shared immutable snapshot vault. Legacy/v1
capture holds until explicit storage migration; capture never migrates. The initial
receipt contains counts, root IDs and immutable read handles. Inspect `plan_id`,
`section: units|nodes`, `offset` and `limit` (at most 16), following `next_offset`;
read `plan_id`/`unit_id` for exact extraction input. The ordinary exact plan source
remains available for audit. Read a `snapshot` handle to retrieve immutable JSON
by SHA/length, following returned `next_offset`.

Create each leaf with `action: target`, `plan_id` and `unit_id`; each bottom-up
reconciliation with `node_id` and ordered `child_review_ids`; and the final target
with two ordered `root_review_ids`. Dispatch QA with empty inputs and `review_of`
the target ID. Every node has a fresh instance and native session, independent of
source, plan, current producers, CoS and all other reviewers. The canonical worker
sends only the bounded tree assignment. It records actual spawn timing, complete
wire, observed native identity, closure and terminal artifact/job bindings. Model
claims cannot supply these receipts. Qualification output is closed JSON: only the
shown envelope, review and node-specific result/item/mapping/resolution/provenance
keys are accepted. `messages` and `notices` must be empty; `content` must exactly
equal `qualification_result.reason`. Put all consequential findings in structured
items/mappings/blockers. Unknown source input fields still require review. The
exact response is retained, and canonical proof/apply rechecks the same contract;
malformed output stays in rejected evidence with its plan and target provenance.
Apply with `aggregate_review_id`;
transactional validation checks the entire canonical DAG, exact ranges, topology,
provenance, negatives and surviving homes. Stored `partition_qualification` lives
in the existing classification index and is revalidated by ordinary context,
current handover and current upgrade. Represented-by never means resolved.

Paused or handover-held companies can explicitly authorize this read-only tree
with `maintenance: true` on plan creation and the exact founder instruction. It
permits only that plan's bounded QA; ordinary work stays paused. `revoke` with
`plan_id`, a later founder pause, cancellation or owner change fences fresh work
and return. Existing owning-session/epoch authority is required; installation and
an arbitrary QA target grant no maintenance permission.

Applied complete preservation uses its exact as-of proof and present sources,
homes, dependencies and current authority. Pure complete representation can
survive owner/epoch replacement, supported boolean pause changes and additive
current rules. An exact scoped unrelated negative stays mandatory and unresolved
without revoking independent preservation. The negative veto covers the entire
source/plan/proof/current-input/dependency closure; unscoped, unknown and global
negatives remain conservative. Non-applicability and global resolutions retain
exact subject freshness. Fresh apply and in-flight work retain strict fences.

Each extraction frame is at most 10,000 UTF-8 bytes, entire application input
48,000 bytes and the complete parsed response envelope serialized as compact JSON
12,000 bytes. Exact raw response transport has an independent 48,000 UTF-8 byte
cap including whitespace; it is retained unchanged, without charging JSON string
escaping a second time. Reviewers are instructed to return compact JSON.
These bounds do not prove native
context fit or semantic completeness. Reconciliation preserves every distinct
finding and its complete conditions; a distinct union that cannot fit holds with
its exact children and decomposition requirement. Bounded pages do not bound
total semantic work. Run the fictional driver with
`node tools/qualify-fictional.mjs --contract`; contract doubles establish software
wiring only. After freeze, root may explicitly choose the real adapter with
`--native --model <catalog-id> --effort high`, using host-default speed. Component
tests claim neither real-model acceptance nor live adoption.

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

New `company_upgrade inspect`/`prepare` use `context_mode: current` by default;
explicit `full` retains exhaustive historical review. Existing attempts retain
their frozen mode/protocol. Current mode moves
only exact independently reviewed classifications behind a source-addressed archive
index. This includes faithful represented-by classifications whose obligations
and OPEN uncertainties survive in current homes, plus known proof records/jobs
and reviewed historical attempts. Originals,
raw checkpoint/history hashes, inventory and bounded retrieval remain intact.
Unknown or changed history is still mandatory; conflicting or missing classification
proof holds. Current understanding is not a second authoritative database.

Both native roles still independently review all current semantic pages and can
retrieve the original archive and classification proofs. Guarded apply, separate
readback, epoch/pause/candidate integrity and recovery are unchanged. Inspect shows
measured projection size before a fresh attempt; it grants no adoption credit.
One-time legacy classification is deliberate work, not automatic compaction.

New upgrade attempts can explicitly choose [incremental-v1](upgrade-incremental.md).
Completed exact steps can be resumed after proven worker closure under the same
identity, inputs and limits. QA page reviews receive their page and matching CoS
findings; final QA receives the exact complete proposal and every required finding.
No ambiguous native call is retried. Legacy attempts keep their original workflow.

## Targeted SQLite storage and transfer

Current views, collection pages and idle status use a derived SQLite index and
hash-check selected records within one snapshot. Work stays bounded by the
requested page, selected-source size and active jobs rather than the entire
archive. Missing derived indexes use the canonical fallback and rebuild during
a full authorized normalized write; selected writes and native-return retention
repair missing schema but defer archive reconstruction. Reads never repair storage. Writes and consequential
authorization checks still validate canonical state. Confirmed cancelled workers
receive a terminal timestamp; unknown closure keeps resource claims and storage
maintenance held.

`company_storage inspect` reports the physical layout. Explicit `migrate` requires
the owning session/epoch, actual source instruction, a paused company, no active
jobs and no unfinished/uncertain cancelled workers. It takes a consistent SQLite
backup, migrates into individually addressable entries and immutable hashed values,
verifies complete logical readback (including unknown fields), then fences legacy
writers with triggers. Originals are not garbage collected. An interrupted migration
rolls back while retaining its backup. No actual company is migrated by installation.

Explicit migration reaches layout v4 from supported legacy/v1/v2/v3 layouts,
retaining the old monolith, backup and exact logical readback. Existing v2 capture
remains compatible and does not advance layout; v1/v2 journal appends retain
inline arrays. v3/v4 journals store complete entries individually, avoiding
repeated prefixes. v4 canonically escapes NUL/lone-surrogate/reserved-prefix keys
without changing identity, order or JSON. Unknown encodings and detectable old
identity loss hold; missing identities cannot be invented. Installation, reads,
status and ordinary writes never migrate or silently fence old writers. Explicit
storage migration is reachable for supported paused schema-1 upgrade maintenance.
Standing upgrade authorization can cover the explicit migration when applicable.

Snapshot references store exact JSON SHA, UTF-16 length and shape; originals are
immutable and shared across captures. Resolver inheritance is explicit at copied
state seams. Frozen handover caches retain at most two exact sequences and 128 Mi
UTF-16 units, with at most 64 Mi pinned raw units per inspection. Full state and
contract identity, vault lineage and fresh transitive integrity checks guard reuse.
Failed-successor previews have separate identities. Qualification projections use
a 32 MB cache with fresh source, legacy-reference and immutable-dependency checks.
Public plans also pin software-derived unit originals and their derivation capsule
in the shared vault: fresh exact sources, as-of inputs, legacy refs and transitive
originals are checked before a node reads its exact immutable unit. Manifest, node,
apply and applied-proof validation avoid rebuilding the whole projection. This is
a software byte/derivation receipt, never independent semantic QA. Oversized
initial projections and older internal plans without pinned units remain transient. Direct normalized record/job/classification
and root reads use verified stored raw JSON per current read snapshot, avoiding
reserialization. Assembled, aliased and legacy sources retain integrity-checked
fallbacks. Full-state reads/hashes, first builds, transitive checks and oversized
transient graphs remain material server costs; caches grant no acceptance.

Selected save/hook bookkeeping operations use targeted transactions. Idle worker
monitoring reads the small committed event token; relevant changes trigger full
eligibility checks, with clock-based expiry and final atomic validation retained.
Status returns a bounded public view; its integrity-checked storage read and generic
transactions still examine full logical state and remain linear in history.
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

### Retained historical component evidence

The following dated results describe earlier isolated components and frozen legacy
protocols. v0.7.0 behavior and limits are described above; these receipts
are not its final acceptance.

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

The retained ordinary-handover v2 protocol freezes the complete subject and exact
SHA256. v0.7.0 reconstructions use verified current protocol v3; retained
v1/v2 reconstructions keep their original all-source contracts.
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
status nor an unvalidated classification clears handover evidence. Exact
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


### v0.6.13 retained upgrade-history projection

Earlier handover subjects retain both `upgrade_history` and a possible current `upgrade`. Their attempts now use the existing history-attempt projection and exact-equality mechanism when those subjects are inspected again. A failed review no longer turns typed archival checkpoint payloads back into opaque compulsory strings. Equality still requires the same entity kind, hash and exact serialized value; every distinct error, finding, unknown field and checkpoint obligation remains compulsory. Originals remain exactly retrievable. No record classification, deadline, independence or resume-acceptance rule changes.

The regression includes nonempty history and a current upgrade across three repaired submissions, exact complete original retrieval, distinct unresolved restrictions/dissent and a held resume after each negative review. This repairs amplification; it does not prove bounded total historical review, model fit, semantic understanding or real-company acceptance. The separate unreleased latency candidate remains deferred until the actual continuity gate completes.

Release source validation and its limits: [v0.7.0 validation](structural-scalability-validation.md).
