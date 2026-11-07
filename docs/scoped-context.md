# Scoped reusable context qualification

`scoped-context-v1` is an opt-in protocol for new qualifications. It replaces the
binary semantic union with immutable extraction, current domain applicability,
and independent interface/integration reviews. Existing tree v1, classification
v1/v2, and their native proof contracts are unchanged. Installing this source
changes no company's pinned instructions, governance, or adoption state.

All operations use `company_context`, the existing worker/jobs/records, shared
snapshot vault, and `context_classifications`. Supply `root`, `session_id`, the
actual current `epoch`, and the existing explicit `source_instruction` for
mutations. This protocol grants no venture execution or renewed allowance.

1. Save current homes using ordinary `company_save` artifact records. An optional
   `context_obligations: {version: 1, scope: "billing"}` proposes their scope;
   unknown fields remain semantic. Scope declarations alone authorize no exclusion.
   Record revisions bind the entire record, including obligations and prior values.
2. `plan` with `protocol: "scoped-context-v1"` and exact `source_id`. The runtime
   freezes the exact original, v0.7 lossless projection, reachable provenance,
   producer, and deterministic unit manifest in the existing vault. Ordinary
   artifacts resolve their producer through `job_id`; canonical development test
   receipts resolve their controller through `author_instance`, without requiring
   a new receipt field. The exact test job, candidate/run, development plan,
   generating native job, and any validation-reuse origin/QA closure are bound.
   Broken edges hold; changed producer outcomes or closure require fresh extraction.
   Its extraction
   identity contains no current company state, owner, notice, or current home.
   Page `inspect` with `plan_id`, `offset`, `limit` (1–16). Retrieve a unit with
   `read`, `plan_id`, `unit_id`; read the returned original/projection snapshot
   handles through existing exact snapshot range reads. Retrieval is not QA.
3. Inspect/read the manifest and exact units before choosing an extraction scope.
   `target` with `phase: "extract"`, `plan_id`, `unit_id` accepts optional
   `context_unit_ids: ["u1", "u2/0"]`: exact other frozen units or valid binary
   subdivisions, unique and in the requested order, with no primary duplicate.
   Omission means an empty supporting set. Choose adjacent or full logical
   context sufficient to finish a clipped qualifier or semantic boundary.
   Dispatch fresh `qa` with `review_of` the returned target and no extra inputs.
   The worker delivers `reviewed_unit_bundle` with `primary`, ordered `supporting`
   units, and `provenance`: exact source reference, projection hash, and primary
   and supporting unit IDs, unit hashes, paths and primary/delivered ranges.
   Every returned item must cite `provenance_sha256`, the exact complete descriptor retained in that bundle; the result
   also binds its primary ID/hash and `reviewed_unit_bundle_sha256`. Extract effects
   belonging to the primary with complete conditions/interfaces from the full
   delivered context. Supporting evidence never counts as completed primary coverage.
   The canonical extraction artifact retains the entire reviewed bundle, items,
   output wire and job proof; applicability receives those full validated bundles.
   For every phase, `target_sha256` equals `packet.target.sha256`: the SHA-256 of
   the complete target record, not just its inner target payload.
   A target may instead return `reused: true`, `review_id`, `job_id`: an existing
   validated completed worker receipt, with no dispatch or new model claim.
   Reuse requires the exact requested primary and ordered context bundle, even
   after unrelated current changes or replacement plans. A changed support request
   creates a new target; a less-informed receipt cannot satisfy it.
   Missing distant qualifiers or clipped/uncertain boundaries must hold. Retain the
   original held target/result verbatim, inspect/read more frozen evidence, and
   request a newly explicit expanded target within the existing authority for new
   independent judgment. This never relabels the original failure or autostarts a
   review/retry. A context set that still cannot fit holds for decomposition.
4. `target` with `phase: "applicability"`, bounded `extraction_review_ids`,
   `counterpart_ids`, `dependency_ids`, and `context_scope` (unknown/global: `*`).
   Optional `item_keys` select exact `review-id/local-item-id` keys; by default all
   items in the supplied extractions are selected. Complete extraction artifacts
   and reviewed-unit bundles are delivered, alongside complete current homes,
   dependencies,
   global rules, authority, notices, messages, unknown governing records and state
   extensions. Scoped governing declarations still arrive in full until their
   boundaries have canonical independent review. Independent QA must preserve every selected item in an exact home,
   including all of its local effect, conditions, OPEN state, authority, failures
   and exhausted allowances. Supply peer records needed by its interfaces as
   exact dependencies; peer-side interface semantics are preserved collectively,
   without duplicating them into every local home. Missing local or peer meaning
   holds. Domain `interfaces_complete` attests complete carried evidence, not the
   independent interface review in step 5; `reviewed_interfaces` remains empty.
   When combining targets, put each record in homes or dependencies once.
   `scope_complete`
   attests exhaustive home applicability: uncertain scope requires `*`.
5. Every extraction interface has a stable `review/item/interface` key, complete
   condition text and `with_scope` (unknown/global: `*`). Request separate
   applicability targets with `interface_keys`, all involved extractions/items,
   and full homes for both scopes. Unknown/global interfaces require `context_scope:
   "*"`. A different native reviewer must judge these interactions. Empty interface
   sets require substantive independent completeness judgments at every stage.
   Interface reviewers still receive every complete incident item/home/dependency,
   return full item mappings and an independent substantive judgment. They name
   the exact `reviewed_interfaces` keys and return `interfaces: []`; original
   interface text remains in the extraction and domain receipts, and reaches
   final QA once through the domains. This removes repeated output, not evidence
   or independent semantic checks.
6. `target` with `phase: "integration"`, `domain_review_ids`,
   `interface_review_ids`, and the exact union of reviewed `counterpart_ids` and
   `dependency_ids`. Software checks gap-free, nonoverlapping coverage of every
   unit, exactly one domain mapping for every item, complete declared interface
   coverage, exact current homes, and acyclic home dependencies. Independent QA
   receives bounded accepted domain/interface artifact references, substantive
   summaries, complete interfaces and global authority; it must independently
   judge completeness, conflicts, current applicability and permission. The
   final packet does not repeat the global item union. Missing or uncertain
   cross-domain interactions hold with a specific interface to review.
7. `apply` with `integration_review_id` consumes only the canonical accepted
   integration receipt. The versioned `scoped_qualification` lives in the existing
   classification index. The original remains compulsory until this succeeds.

Every request is at most 48,000 UTF-8 bytes; complete parsed review envelopes at
most 12,000 bytes (wire independently at most 48,000). These are supported bounds,
not host/model context-fit guarantees. Per-item provenance references the complete retained bundle without repeating its
metadata. Dense semantic output can still require subdivision. Overflow
retains the failed output and unit. Request `unit_id: "u3/0"` and `"u3/1"` to
subdivide a deterministic primary range, recursively if necessary. Overlap
preserves boundary evidence; it does
not establish semantic completeness or independence. Supporting context uses the
same fixed input/output ceilings; never clip it. Integration accepts only exact
primary range coverage from the initial gap-free manifest and does not discard
accepted work elsewhere. Partition applicability selections and interfaces when
needed. If complete global rules, coupled interfaces, or the
final review cannot fit, hold truthfully; never truncate or substitute hashes for
semantic review. A false or incomplete accepted extraction requires fresh source
repair/requalification, not a coordinator assertion that it is complete.

New applicability, interface and integration targets may explicitly opt into
`delivery_protocol: "scoped-stream-v1"`. Omission preserves the published single
packet contract and its oversized-input hold. Extraction targets cannot opt in;
their immutable bundle identities and reuse rules are unchanged. This delivery
protocol creates a new versioned delivery/proof record; it never reinterprets an
old receipt or upgrades an existing target.

The runtime streams the exact complete JSON assignment in ordered, surrogate-safe
UTF-16 ranges of at most 32,768 code units. Admission measures the **complete
serialized UTF-8 request**, including metadata, escaping and instructions, against
48,000 bytes. The body contains all frozen global rules, exact current homes and
dependencies, extraction bundles, and complete recursively referenced canonical
review artifacts. Streamed integration also carries the full current home bodies
and extraction artifacts behind its domain/interface references. Hashes identify
these bodies; every body range still reaches the same fresh independent native.

Each nonfinal response must be exactly
`{"scoped_stream_ack":{"body_sha256":"delivered body hash","sequence":0,"range_sha256":"delivered range hash"}}`
with that request's sequence and hashes. The final response uses the original
scoped result/envelope grammar. Acknowledgement is transport progress, never a
semantic judgment. Runtime-owned range receipts bind target, plan, full body,
request and range hashes, native identity, actual per-call spawn/deadline and
process closure. Missing, reordered or substituted delivery cannot qualify.
Canonical validation reconstructs every bounded request from frozen evidence
and rechecks the complete receipt plus ordinary current freshness/independence.
Failures and rejected outputs remain retained. There is no separate global
semantic certificate, automatic retry or renewed allowance.

Fresh native admission is separate from canonical receipt revalidation. For both
single-packet and streamed scoped jobs, the worker checks timing, eligibility and
independence before atomically storing the first native binding and delivery.
At that transaction, a native previously retained in any job's
`rejected_native_id` or `rejected_native_ids` cannot be newly bound. Failed
observations remain data; missing-timing or aborted first responses bind nothing.
An admitted stream continues under its own unchanged native; a changed native
holds and is retained separately. Later failed observations cannot retroactively
invalidate an earlier valid receipt or its immutable extraction reuse. Canonical
validation retains its existing independence checks without this forward history
scan. The temporal boundary is committed admission order, not timestamp ordering.

Every invocation remains capped at 600 seconds; the existing total job execution
deadline also remains binding, with no new window or extension. There is no fixed
16-page cutoff for this opt-in stream. Transport completion does not establish
cumulative native context fit or semantic acceptance. A native unable to review
all carried evidence must return Blocked. Fictional contract doubles exercise
this protocol in the recovery tests; independent native fixture qualification is
a separate next stage. This repair grants no `resume_handover` permission.

Current-state consumers validate the entire canonical receipt closure, exact
source/projection/home/dependency bytes, native identity, delivery, actual spawn
timing, terminal closure, output grammar and provenance. New global governing
evidence invalidates affected applicability/integration; it does not invalidate
immutable extraction. New targets retain the exact governing packet in the vault
and replay that same native delivery when validating receipts. Current authority,
notices, unknown outcomes and extensions must still match, and every new/changed
relevant governing record must have been delivered in full. Deletion or relabeling
without canonical classification cannot erase a governing obligation.

Governing selection uses existing reviewed classifications and exact reviewed home
scopes. Scope certificates validate original delivery, native independence, source,
homes, test/producer closure, outcomes and semantic attestations separately from
current global freshness. This lets two separately qualified ordinary scopes prove
unrelatedness without requiring each other's current applicability as a premise.
Current global/unknown rules are then checked on each use; the scope certificate
never grants current permission. Already qualified unrelated governing archives
and homes neither grow new domain/final packets nor force old receipts to replay.
A genuinely new unclassified record, an unreviewed proposed scope, `*`, unknown
scope, unresolved notice or negative interaction remains compulsory. A changed
home loses its scope certificate until independently requalified; unrelated
receipts can then be reused. No hashes stand in for that semantic judgment.
All non-extraction scoped targets require their frozen governing packet.
Existing ordinary producer identities remain compatible;
unsafe runtime-test plans that omitted their controller cannot be reused.
Exact source or producer mutation holds.
No model-provided native ID, coverage assertion, citation or termination claim can
replace the worker's persisted edges.

After apply, only declared reviewed homes/dependencies become mandatory through
this proof. With an explicit ordinary `context_scope`, independently qualified
homes in other scopes may be omitted. Homes without a versioned scope declaration, dependencies, cross-domain interface
homes, global/unknown homes, unclassified governing
records, explicit task inputs, and homes required by legacy proofs remain
mandatory. Without explicit task scope, all reviewed homes remain mandatory.
Default handover/upgrade current-evidence construction uses the same validated
classification index and exact retrievable archive. Historical facts never grant
current permission; representing OPEN does not resolve it.

Paused maintenance uses `maintenance: true` only with the existing explicit
read-only source instruction, actual owner/epoch and current control-record hash.
A later pause, owner change or `revoke` fences new dispatch and returns. Regain
eligibility through the existing ownership/resume/authorization checks; no new
pause bypass exists. Adopted preservation may survive mechanical pause/ownership
changes, while new work still requires current eligibility.

Format 5 also keeps superseded, unclassified proof artifacts and jobs as exact
current evidence. Replacing a qualification after a home/source update does not
implicitly qualify its retired proof bodies. These can still hold format 5 until
separately reviewed; governing-only format 3 and unchanged unrelated scoped
receipts remain reusable. This implementation does not silently archive them.

Synthetic scoped checks: `node --test tests/scoped-context.test.mjs`. Reviewers
in that file are explicitly labeled contract doubles. They exercise a tiny
obligation language, a clipped natural-language qualifier requiring exact delivered
text and explicit supporting evidence, and the real public engine/store/worker
lifecycle with bounded proof checks. They are not native/model semantic acceptance
or evidence of production performance. `tests/develop.test.mjs` also contains a
regression using the actual sandbox/controller
receipt, candidate and native producer. It skips when the supported sandbox is
unavailable; a skip is not runtime execution evidence.

Current governing evidence carries exact typed source references and complete values,
including applicable artifact homes and job/upgrade dependencies. A target does not
repeat its exact explicitly delivered homes in that governing packet. A globally
delivered rule does not need to be misrepresented as a mapping home for another
source. Every non-extraction target requires its frozen governing packet; no
compatibility branch is retained for unreleased scoped prototypes. Published
legacy/tree proof grammars remain unchanged.

A new or changed global/unknown rule, notice, outcome or root authority can expand
previous applicability. Fresh review therefore receives the complete current homes
with a widened scope until independently requalified; an old scope certificate
cannot hide those bodies. Already qualified unrelated archives remain omittable.
Legacy current classifications are conservative global evidence for this new
protocol; their published ordinary-task behavior is unchanged.

Per-item provenance is a checked reference to `reviewed_unit_bundle.provenance_sha256`.
The canonical delivered bundle retains the complete original source, projection,
unit hashes and all primary/supporting ranges once. Every item inherits that
exact immutable evidence through the enclosing review; copying the same descriptor
into every item adds no evidence. Wrong references or changed bundle data hold.
This avoids forcing extra subdivisions merely to repeat metadata.

### Unreleased corpus vector preservation

`coherent-corpus-body-v1` remains an explicit prospective branch behind `company_context` / `scoped-context-v1`. Published `lossless-ranges-v1`, `coherent-source-v1` and issued receipts retain their exact contracts. First capture requires `source_id` and ordered unique `selected_source_ids`; the first vector member is the storage anchor. `corpus_plan_id` reuses that same complete vector, never another source claim. The capsule binds the entire captured baseline, exact source locations and duplicates, producer/candidate/runtime-reuse closures, physical occurrences, ancestors, snapshot inbound edges and ordered collections. Unselected sources remain evidence, never omitted by a writer label.

Complete intrinsic body batches share only extraction. No mechanical string subdivision or semantic passivity is introduced. Explicit `scoped-stream-v1` can deliver whole logical units and complete canonical evidence to the same native in bounded ordered requests. Existing input/output limits, native identity, fixed job deadline, final output and confirmed process closure remain required; streaming neither renews the deadline nor demonstrates cumulative native fit. Oversized output or session closure Holds.

An optional `semantic_partition` exhaustively partitions physical occurrences with symmetric declared incidents. Domain targets require exact `selection_ids`, all required extracted bodies, ancestors, recursively required inbound context and every global/unknown selection. Partition labels grant no omission. Contextual results bind `claim_protocol`, the exact ordered `selected_source_ids`, `corpus_claim_sha256`, and `mapping_context_sha256`. Each mapping explicitly enumerates `source_ids` and `occurrence_ids` for one intrinsic item, exact typed homes, complete conditions and unresolved outcomes. New plans internally bind `corpus-provenance-incidence-v1` in the capsule, extraction identity and targets. Their claim delivers exact physical containment regions, transitive original/source reference paths, complete producer closure and an explicit unowned occurrence vector. A mapping row (including compact set/range selectors) asserts its intersection with that required relation. Every required item/source/occurrence cell is covered exactly once; empty, missing, duplicate and substituted incidence Holds. Whole-batch item support remains conservative. Unowned/global census occurrences retain coverage for every selected source; an unresolved reference conservatively widens its source to the complete census. Different contextual judgments require separate rows. Issued plans without this marker retain Cartesian interpretation, identity and native instructions; a mismatched plan/target marker Holds. Intrinsic equality supplies no contextual judgment.

Corpus independent interface targets also require `domain_review_ids` naming every canonical domain conclusion. Dispatch domains first, then independent interfaces. For new targets marked `delivery_schema: corpus-phase-delivery-v1`, interfaces receive ALL complete validated domain result objects (including every mapping, condition, unresolved outcome, original interface and interaction judgment), exact bound targets/selections/scopes and mapping occurrence vectors, complete local/incident/global raw occurrence context and extraction bundles/results, exact current homes/dependencies and corpus census. They compose independently accepted domain meaning to assess distant and undeclared effects; they do not recursively replay unrelated extraction leaves merely because those domains are canonical dependencies. Domain extraction bundles and results each appear once, in `extractions` (`result.items` contains the items). Unmarked issued targets retain the original recursive evidence delivery bytes and contracts. Unknown delivery markers Hold. Independent `interaction_completeness` accepts declared, undeclared/distant and global completeness against the exact census with a substantive reason. Missing evidence or uncertainty requires Blocked. Software coverage proves no meaning. A generic Pass, digest, producer boundary or completeness flag is insufficient. Reviewers must Block on missing/uncertain boundary meaning, a missing original or suspected distant interaction, name exact missing selection/group/source IDs and request explicit widening (including symmetric incidents or global scope) in a NEW bound target. The projection neither assesses meaning automatically nor grants scope or current authority.

A marked independent final aggregate receives the complete census/frontier, complete domain AND interface result objects with exact targets/selections and mapping vectors, source mappings, full current home/dependency bodies, raw global authority and global/unknown occurrence context with its inbound closure. It does not automatically replay unrelated raw extraction leaves. The runtime still recursively verifies the entire canonical extraction/domain/interface proof graph; native semantic evidence delivery is a separate phase-specific projection. Assignment reconstruction, stream delivery and canonical acceptance bind the exact same marked representation. All originals remain retrievable through exact review/target/plan references. Its `source_mappings` binds each exact source to all accepted contextual mappings; source membership cannot be appended to a generic Pass. Every canonical receipt still validates independent identity, current producer/home/dependency/membership evidence, negatives/rejected outputs, authentic native delivery, deadlines and termination. Corpus governing checks use raw current governing records rather than recursively classifying the corpus's own boundary. Homes conservatively remain global.

`validateScopedApply` returns a distinct `coherent-corpus-preservation-v1` vector result for this branch. Existing public apply stores that single result atomically at the first source; it does not manufacture published single-source receipts. `validateCorpusPreservation(state, {integration_review_id})` is the narrow full-validator integration interface. `validateCorpusExclusion` checks the adopted vector and recomputes it before deriving a member mapping. `classificationFor` / `reviewedContext` recognize those validated mappings, validate once per vector within a read, and keep every home global. Invalid vectors, conflicting classifications or changed members fail closed. Operating publication separately requires the canonical accepted scoped proof and independent operating-state QA. Corpus apply alone grants no publication or resume permission.

`inspectCorpusWorkload` reports the whole-vector lower bound **E + D + I + 1**, or **E + 2P + 1** for one domain and interface job per proposed selection. With no partition the conservative proposal is one whole-corpus domain and one interface. No source multiplier remains. Complete request framing and complete native fit remain null/unmeasured; proposals, extraction completion and synthetic adapters establish no native acceptance. Actual corpus E/D/I, capacity and final aggregate fit require the owner's bounded trials.

The public corpus tests use a clearly fictional adapter through real public/store/worker delivery. Unpublished fixtures now assert one vector result, complete domain conclusions before independent interfaces, exact contextual mappings, and an explicit operating integration Hold. The previous per-source experimental fixtures and corpus-as-single-source operating fixture were incompatible with this new unreleased contract. Their published range/coherent-source counterparts are retained unchanged.

The unpublished corpus planner groups complete sections toward96KB intrinsic bodies; a larger indivisible section stays whole. This changes batching, not the48KB bounded request or12KB parsed-output limits. Explicit streaming is required when framing exceeds one request. Fit of a full native session and faithful complete output remain unproven until measured. Intrinsic extraction receives a bound corpus manifest; domain/interface reviewers receive the full source vector. Results bind deterministic source/mapping vectors by exact digest and count rather than echoing every identifier. Mapping set references select the same identifiers as explicit arrays and assert their intersection with required incidence for new plans; unmarked plans retain expansion to every original cell. The same coverage/condition/independence checks apply; mismatched references Hold. Marked final integration receives complete domain and interface conditions and current homes, with exact census accounting and retrievable originals; unmarked targets still replay the legacy raw closure. Missing meaning or a required original requires Blocked and a new exact target.

Provenance incidence establishes evidence ownership only. A prohibition from A can affect B: all-domain semantic composition, complete local/incident/global raw delivery, distant/unknown interaction completeness and independent domain/interface/final judgments remain compulsory. This change does not infer semantic scope, permission or locality, change current homes, or establish native session fit. The complete relation is rederived from the validated coherent graph and frozen producer closures during canonical validation.

Decoded JSON STRING views retain full extraction and physical own-region coverage. They never create typed source-reference ownership edges, including nested strings or definitions also reached through genuine typed paths. Structural mappings cover exactly the required incidence; separate complete cross-source/global semantic review remains compulsory. Unmarked plans retain their original Cartesian instructions and claims.
Prospective corpus fit delivery is explicitly selected on a **new** target with
`delivery_schema: "corpus-incidence-conclusions-v2"`. All domain, interface and
final targets in that chain must use this marker; mixed or unknown schemas Hold.
Unmarked and `corpus-phase-delivery-v1` assignments retain their issued bytes and
interpretation. Extraction identities, the incidence capsule marker, canonical
receipt validation and the 48,000-byte request / 12,000-byte parsed output /
600-second shared deadline are unchanged. Existing extraction receipts are reused
only after exact canonical validation.

Domains receive complete validated extraction result objects, exact review,
target, plan and whole-batch provenance descriptors, and physical occurrence
structure with section-to-review membership. Raw section bodies are replaced by
semantic composition for historical evidence in domains, interfaces and final
integration. This is **not lossless meaning
proof**: missing conditions, inadequate conclusions or suspected undeclared
interactions require Blocked, exact missing IDs and an explicit wider **new**
target. `raw_review_ids` binds complete original extraction bundles already in
the canonical closure to that new target. Originals outside the closure require
wider extraction evidence. Earlier failures and spent allowance remain binding.
Interfaces receive every complete domain conclusion; final integration receives
every complete domain and interface conclusion. Historical local, incident and
global/unknown sections are composed from complete canonical extraction RESULTS,
with all physical occurrence structure, qualifier vectors, cuts and inbound routes.
Every replaced section lists `primary_review_ids` and `canonical_review_ids`;
at least one validated primary extraction must cover it, and every referenced
complete result is delivered in `extractions`. Supporting context cannot substitute
for primary coverage. These links prove complete reviewed batch support, never
item-specific semantic support or adequacy. Missing support Holds with the exact
section and requires Blocked and an explicitly wider new target; inadequate
meaning/conditions require an independent Blocked judgment and explicit widening.
Current complete homes/dependencies and **raw CURRENT** global authority, rules,
notices, unknown outcomes and extensions in `global_rules` remain compulsory.
Historical global/unknown scope requires complete meaning, not automatic raw
history replay. Without an explicit global partition the complete historical
census still receives section/result support; scope never narrows automatically.
Only explicit `raw_review_ids` restore complete unchanged original bundles.
No source label, structural sharing or incidence establishes semantic locality,
identical applicability or current permission.

The same packet carries `corpus-readable-structure-v1`: `logical_packet` plus
ordered `tables`, a raw JSON-pointer prefix trie `paths`, and ordered object
field templates `fields`. Exactly `{"$r":N}` references an earlier table entry.
`{"$path":N}` reconstructs a path from `paths[0] = null` (empty pointer) and
subsequent `[earlierParent,rawSegment]` entries. Segments are appended with `/`
without decoding/re-encoding escapes, normalizing or discarding empty keys.
`{"$row":[fieldTemplate,values]}` reconstructs a metadata object with exactly
the template's ordered keys. Unknown fields and distinct field order remain exact.
`{"$ids":[prefix,[[start,end],...]]}` reconstructs literal decimal ordinal IDs
in half-open ranges, concatenated in supplied order, including duplicates and
backwards runs. It is selected only for structurally named vectors where the
literal sequence is exact and the encoding is smaller; leading zeroes and unsafe
integers remain literal. `{"$literal":[[key,value],...]}` escapes objects containing
ANY reserved marker. Other JSON remains literal. Repeated complete physical
edge/reference metadata can share table entries even across differently ordered
source reference arrays; sources, every route and physical occurrence stay exact.
Qualifier/ancestry vectors, selection indexes and mapping vectors share structures
without changing meaning. All dictionaries are complete in the same packet. Semantic
text remains readable JSON. There is no external dictionary, archive or code
execution. `factorCorpusStructure`, `expandCorpusStructure` and
`validateCorpusStructure(packet, expectedLogicalPacket)` are pure functions;
validation checks exact deterministic reconstruction against the expected packet.
A self-sealed hash alone cannot detect an omission with a recomputed hash.
Factoring occurs **before** streaming; native delivery contains the complete
tables and reference grammar. Canonical revalidation still traverses the full
proof DAG and checks original delivery, producer/native independence,
currentness, negative results, execution timing/closure and exact mappings.

The focused public fixtures in `tests/corpus-fit-delivery.test.mjs` use FICTIONAL
scripted judgments. Structural equality, transport bounds and fixture success
establish no authentic semantic acceptance or actual native context fit. Small
packets can grow from table overhead; semantic growth remains visible. Actual
complete result/home sizes, token counts and fit require an authentic trial.
This source representation grants no acceptance or action authority; SoloDev
remains paused.

FITv2 proof delivery now separates the runtime's full canonical incidence from
semantic review input. The capsule `c.incidence`, extraction identity, target
incidence marker, mapping-context hashes and complete source/item/occurrence
coverage validator are unchanged. Runtime plan validation still decodes/rebuilds
the coherent graph and recomputes the full incidence; canonical receipt validation
still checks the entire proof graph, independence (including all frozen corpus
contributors), currentness, negatives, authority, native delivery and timing.
Unmarked and v1 delivery retain their exact entry implementation bytes.

Only FITv2 non-extraction packets project `corpus_claim.incidence` to explicit
ordered source `seed_regions`, `conservative` flags, `unowned_occurrence_ids` and
`direct_references`. Seeds preserve each source's own physical region and initial
producer regions, including duplicates. Direct edges appear once per complete
physical typed route across the whole corpus, including unselected/unowned
sources and snapshot-original documents. Each retains document, exact escaped
path, reference id/revision/optional hash and either exact target document/path
plus `target_source` id/revision/hash, or explicit `unknown:true`. Stale, missing
and ambiguous endpoints remain unknown. Parsed JSON STRINGs never create typed
edges. Physical qualifiers, ancestry, occurrences, cuts and ordered collections
remain in their existing contexts; complete conclusions remain readable evidence.
The complete snapshot inbound structure is retained in the existing
`global_occurrence_context.snapshot_inbound`, including routes outside a local
selection. Producer associations remain in the complete
`corpus_claim.producer_closures`, with exact endpoints in `source_census`.
No computed per-source transitive regions or repeated route traces are replayed.

`incidence.canonical_relation.sha256` binds ONLY the full runtime-computed
incidence. `corpus_claim.canonical_claim_sha256` binds the exact original canonical
claim; response `corpus_claim_sha256` still names that full claim, not the delivery
projection. Repeated `complete_corpus_context.claim` uses the same projection.
These proof digests replace no semantic evidence. Membership for structural
mapping is computed and mechanically enforced by runtime intersections with the
full relation; reviewers do not claim to have hand-calculated it. Conservative
sources and unowned occurrences retain full required coverage. Source ownership
never narrows semantic cross-source/global interaction duties or grants authority.
Complete extraction/domain/interface conclusions, raw CURRENT global rules,
notices and unknown outcomes, exact homes/dependencies, and independent semantic
adequacy judgments remain compulsory. Missing meaning or unusable fit requires
Blocked and an explicitly wider new target, preserving failures and spent limits.

`projectCorpusProofDelivery(material, canonicalClaim)` is a pure numeric-preflight
seam: it validates the coherent graph, checks exact source census/membership and
recomputes the full incidence before returning the projection.
`validateCorpusProofDelivery(projected, material, canonicalClaim)` compares every
projected field against that deterministic reconstruction. A resealed transport
hash cannot authorize a removed/substituted edge, endpoint, flag, source or seed.
The seam is not state-backed authentication or semantic acceptance; normal runtime
validation remains required. Its inputs must be the exact canonical material and
claim from the owner's validated plan. Whole-packet native size also includes
complete semantic results, current controls and structural contexts. Synthetic
size reduction and fictional worker tests establish no actual native context fit,
QA acceptance, adoption or resume permission; SoloDev remains paused.

### Prospective incidence storage

Fresh `coherent-corpus-body-v1` capsules retain `incidence` as a closed
`corpus-incidence-derivation-v1` descriptor: `protocol`, `relation_protocol`,
`basis_sha256`, `relation_sha256`, `source_count`, and `occurrence_count`.
The basis binds the immutable projection reference and complete projection hash,
ordered selected sources, complete producer closures, exact units, and semantic
partition (or explicit null). The relation hash binds the exact ordered canonical
`corpus-provenance-incidence-v1` relation. The descriptor is itself part of the
existing extraction identity. Fresh identities therefore change prospectively.

Plan validation decodes and validates the frozen material, validates current
sources/producers/membership and exact extraction coverage, reconstructs the full
canonical relation and requires exact descriptor equality. Unknown, mixed,
missing or inconsistent descriptors Hold. The full relation is returned separately
from the stored capsule; corpus claims, mappings and full validation still use
that relation. Reusing `corpus_plan_id` retains the exact stored representation
and identity, without persisting the reconstructed closure. A two-entry immutable
derivation cache binds all immutable inputs; it never caches live authorization,
membership, producer or native independence checks.

Issued inline-incidence and no-incidence capsules retain their original identity,
claim and delivery contracts. Inline objects are validated as inline relations;
they are never reinterpreted as descriptors. Raw originals remain exact in the
existing snapshot vault. This is storage of mechanically recomputable proof,
not semantic acceptance, corpus qualification, native fit, publication, renewed
allowance, or permission to resume a paused company. Failed evidence remains.

### Prospective physical context and phase contract (source only)

`batching_policy: "intrinsic-body-96k-v1"` on a fresh corpus plan batches complete
intrinsic sections independently of its physical partition. The capsule, compact
incidence derivation and extraction identity bind that policy and the complete
partition. Reusing `corpus_plan_id` preserves its original policy; an absent
marker retains the exact previous partition-dependent batching and identities.

A prospective partition may explicitly name
`context_policy: "physical-shared-v1"` and `shared_selection_ids`. Its closed
contract still assigns every physical occurrence exactly once. Selection context
contains the selected selections, their explicit incidents and explicit shared
selections, with full qualifier sections, ordered cuts and genuine inbound
closure. `scope: "*"` remains unresolved semantic applicability. Neither an
ordinal partition label nor absence from the shared seed proves locality.

Changed phase judgments require the distinct delivery schema
`corpus-context-conclusions-v3`, this physical partition and intrinsic batching.
The entire domain/interface/integration chain must use that marker. Older v1/v2
and unmarked deliveries keep their existing behavior. Extraction bundles retain
their exact grammar. Both conclusion markers support explicit `raw_review_ids`
on a new target; a wider target never renews allowance or clears failed evidence.

Domain interaction completeness is closed to `assessment_scope:
"selected-context"`, exact `census_sha256`, substantive
`contextual_preservation_complete`, `outward_conditions_complete` and `reason`.
Domain review preserves complete batch items, verbatim interfaces, qualifiers,
negative/exhausted/unknown/OPEN outcomes and outward conditions in complete
conclusions and current homes. Missing peer evidence needed for preservation
requires Blocked and explicit widening. Domain `continue` permits the next
independent review only. It does not attest whole unseen corpus completeness.
Context and homes remain global. Every interface receives **all complete canonical
domain result objects** and required current homes/dependencies and authority;
final receives all complete domain and interface results, exact mappings and
current homes/dependencies and authority for independent whole-vector judgment.

The new shared physical projection contains only explicitly shared selections
and their closure. Historical global meaning travels through its originating
domain's complete conclusions and all-domain reconciliation. Relevant physical
qualifiers and all genuine incoming routes remain evidence; full-relation hashes
never replace material uncertainty. Direct typed routes are deterministically
projected from concrete delivered sections and their cuts: a state-root cut
collection does not import every child reference. The pure proof preflight takes
a closed policy/partition/phase/selection descriptor and reconstructs membership
from frozen material, rather than trusting caller-supplied context arrays. The
full canonical incidence relation, source claims and coverage remain unchanged
and software-owned. Legacy v2 retains its full direct-route projection.

Workload inspection reports prospective primary/support occurrence counts,
section/inbound/direct-route/collection counts, shared raw context size and schema
ceilings. Complete result floors, tokenizer counts, authentic elapsed execution
and native fit remain unknown until authentic artifacts exist. Synthetic adapter
tests establish source mechanics only. No actual incidence/FIT adoption,
publication, QA Pass, retry, release or company resume is established here.

### Ephemeral direct-route indices (source performance correction)

`corpusDirectReferences` builds document/path indices within each invocation.
Each document object is serialized once to preserve exact JSON equality,
including descriptor field order. Occurrence buckets retain every occurrence at
an exact escaped pointer path. Context lookup visits only physical ancestor
paths, then applies the original identity/qualifier predicate. Incoming lookup
also retains every original occurrence matching the original hash and target
group, including non-root paths and equivalent separately allocated documents.
The resulting location IDs still filter the original occurrence order.

Route filtering visits only selected sections at a route's exact ancestor paths.
Relative cut paths are indexed without decoding or rewriting pointers; root cuts,
empty keys, escaped slashes and physical qualifiers retain their prior behavior.
Private route dedup keys use cached document strings while delivered evidence
keeps the original descriptors and exact ordered route objects. Typed discovery,
source revision/hash matching, ambiguity/unknown flags and STRING opacity retain
the incoming helper's output. No index, cached authority or manifest survives a
call. The new route-index tests retain the incoming helper verbatim as an ordered
JSON oracle and count document serializations, occurrence/section candidates,
linear index/membership passes and cut probes. Bounded synthetic comparisons
establish exact mechanics and operation counts, not actual native CPU or fit.

### Optional exact v3 output selectors (source-only prospective repair)

Only `corpus-context-conclusions-v3` accepts a mapping row with `item_set`
instead of `item`. Exactly one is required. `item_set` is either the exact
`{count,sha256}` supplied in `mapping_sets.item_set`, binding the complete
ordered `item_keys`, or `{basis_sha256,ranges}` over that complete vector.
Ranges use the existing ordered, disjoint, nonempty, half-open index grammar.
Every expanded item/source/occurrence cell asserts the row's **entire** same
conditions, unresolved outcomes, exact typed homes and preservation judgment.
All varied and opposite qualifiers must appear in full; inability to make this
shared judgment requires Blocked. Labels and selector hashes prove no meaning.
Whole-batch support and incidence remain unchanged. Coverage expands only item
references, never allocates the item × source × occurrence product, and still
rejects missing/duplicate/out-of-basis cells and empty incidence intersections.

A nonempty DOMAIN `interfaces` value may alternatively be the closed
`{count,sha256}` from `interface_set`. It selects the complete ordered canonical
`interfaceList(selected)` already delivered in the extraction results. Partial
ranges, empty selectors and mixed array/selector objects are rejected. Explicit
complete arrays remain valid, and independent `interfaces_complete` is still
required. The runtime-owned coherent-occurrence interface remains compulsory in
every extraction. Every actual semantic interface, original qualifier and
unknown/negative/exhausted outcome remains compulsory too.

Interface and final packets include `interface_catalog.interfaces`: full literal
canonical values, each keyed once. `interface_catalog.domains` carries each exact
domain review, its canonical extraction review references, and its complete
ordered `interface_keys`. The runtime resolves selectors only through validated
canonical proof children, not through response counts or caller dictionaries.
Complete canonical DOMAIN/INTERFACE result objects remain unchanged alongside
this catalog. Same-packet full values supply semantic input; a digest-only result
alone does not. Original native delivery, identity, independence and timing still
validate recursively. Reconstructing the exact assignment binds the catalog,
ordering, membership and provenance, including against resealed forged delivery.

The existing source-mapping hash binds the exact compact rows through canonical
review references and their exact target/context identities. Those targets bind
the complete item basis; source and occurrence selectors bind their delivered
bases. Thus expanded meaning is fixed without globally duplicating conditions.
No v1/v2/unmarked target gains selector interpretation. Their forward packets
retain exact bytes; explicit v3 rows/arrays retain their interpretation. The
12,000-byte parsed output, 48,000-byte transport and 600-second timeout remain
unchanged. Irreducible complete meaning can still overflow and must Hold.

Validation uses FICTIONAL scripted semantics through the public engine/store/
worker pipeline, not actual native semantic acceptance. One 11,727-byte complete
extraction supplies 31 interfaces; explicit domain output is 41,531 bytes and
compact output is 2,641 bytes (38,890 bytes less). The supplied actual-domain
schema floor alone falls from 4,690/22,925/22,404/18,757 interface bytes to
87/88/88/88 selector bytes: reductions of 4,603/22,837/22,316/18,669 bytes.
These are structural output reductions only. Full semantic input, remaining
irreducible conclusions, actual real-data output fit and authentic native
cumulative fit are still unknown; no company QA, application or adoption occurs.

### Prospective stored corpus preservation claims

Applying a descriptor-backed corpus plan stores a closed
`corpus-preservation-claim-reference-v1` claim in the preservation proof. It binds
`canonical_claim_sha256`, the exact immutable `capsule`, `incidence_derivation`,
`selected_sources_sha256`, `source_mappings_sha256`, `domain_mappings_sha256`, and
`receipts_sha256`. These are bindings to the complete validated claim, source
vector, semantic mappings, and canonical proof closure; they are not substitutes
for those inputs or for independent semantic review.

Every revalidation still reconstructs the full canonical claim and validates the
archive, membership, producer/native independence, original delivery, negatives,
timing, closure, and complete source/occurrence mapping coverage. The expected
compact proof is compared exactly with the stored proof, rejecting unknown,
mixed or substituted representations. Member exclusions use the validated exact
source vector and source mappings. Operating evidence obtains selected source
references from those revalidated mappings, so neither public apply nor later
operating capture embeds the reconstructed incidence relation in classifications.
Raw originals remain exact and retrievable in the existing vault.

Issued inline-incidence and no-incidence plans retain their full preservation
claims and existing byte contracts; they are not reinterpreted as compact claims.
Native packets, response grammar, semantic conditions and canonical claim hashes
are unchanged. This source repair confers no source acceptance, actual native
fit, semantic qualification, operating publication, adoption or resume authority.


Initial current homes are prepared through an explicit prospective maintenance
policy, `home_intake_policy: "initial-proposed-homes-v1"`, on a fresh corpus plan
using `physical-shared-v1` and `intrinsic-body-96k-v1`. Capture requires zero typed
operating homes, a paused company, the current owner and existing read-only
maintenance authority, and normalized-v4 intake. This permission represents
existing evidence; it grants no execution, allowance renewal or governance change.

After canonical intrinsic extraction, `company_save` may prepare a new artifact
with `bootstrap_plan_id`, its complete `operating_record`, and globally mandatory
context. `operating_record.evidence_refs` contains plain literal source IDs, as in
ordinary operating publication. For frozen sources the runtime derives the exact
frozen revision/hash and verifies the resolved original; for canonical extraction
receipts it derives the exact current reference and validates the full receipt
within this extraction identity. JSON-looking IDs remain literal IDs, never parsed
provenance. The runtime records plan/owner provenance and verifies the immutable
intake chain. Revisions require the same explicit plan, retain prior contents, and
cannot delete/retype homes or replace their provenance. A permission home describes
an existing grant; it does not modify authoritative grants or remaining allowance.

Every non-extraction target derives the COMPLETE current home inventory and sends
every complete current home. A supplied inventory or counterpart list must match
that inventory. An addition or revision invalidates earlier non-extraction
bindings, while unchanged intrinsic extraction remains reusable. Unknown fields,
unsupported writes, changed frozen sources, jobs, upgrades, authority, owner,
pause or revocation continue to Hold. Current proposed homes remain compulsory
even to governing-only consumers; an artifact label is never qualification.

A materially corrected initial-bootstrap domain may request a NEW target with
`repair_of` naming exact canonical negative review IDs. Its review receives the
complete previous negative, immutable prior candidate/delivery, and corrected
current inventory. A fresh independent reviewer must supply an exact substantive
disposition for every named negative. Unchanged candidates, unrelated or
unaddressed negatives, rejected/ambiguous outputs and unsupported historical
boundaries remain Held. The original verdict and spent allowance remain intact.
An interface or final review can consume only canonically accepted repairs.

This is source capability, not actual SoloDev qualification. Complete semantic
results, homes, catalogs, counterevidence, framing, native context and runtime
limits still require a bounded authentic trial. Installation, operating
publication, the independent `resume_handover` gate and actual resumption remain
separate facts. The retained native component reports and independent Fail F1
remain under `evals/final-corpus-repairs-20261107`; they are historical evidence,
not a current acceptance verdict.

The initial-home publication lifecycle covers storage wrapping of an exact frozen original after extraction, with separate original and stored-envelope validation. An `immutable_entry` already present before coherent capture retains an explicit canonical-admission Hold: the derived coherent projection is not accepted as a raw storage wrapper. This retained limitation is tested; a passing post-extraction lifecycle does not qualify that earlier-capture shape. Actual-record applicability and native semantic fit must be checked separately.

Initial-home publication validates the exact runtime-bound home plan and its frozen extraction identity against the accepted corpus proof. Distinct plan records created through `corpus_plan_id` can share that identity; exact home, capsule, original, receipt and stored-envelope checks remain mandatory.

Prospective complete-group decomposition uses target marker
`unit_selection_schema: "complete-group-ranges-v1"` with intrinsic 96KB corpus
batching. It preserves the frozen capsule, extraction identity, incidence and
physical partition. `body-batch-N/gA-B` names a nonempty proper half-open interval
of the original batch's ordered groups. Integers have canonical decimal spelling;
whole intervals use the parent ID. Further splits use absolute original positions.
Sections, cuts and STRING evidence remain whole. An indivisible group's complete
result exceeding the unchanged 12KB limit remains Held. Requests remain bounded
at 48KB and the existing shared native deadline remains at most 600 seconds.

Every consumer of marked split evidence must bind the marker. Primary receipts
must cover each frozen group exactly once at whole-vector interface and final
validation; supporting context gives no primary credit. Gaps, overlaps and
parent-plus-child coverage Hold. Complete results from every contributing receipt
remain mandatory, including extra items from multi-group children. Context,
ancestors, incoming originals, unknown references and current homes still require
independent reconciliation. Reuse requires the exact primary and ordered context
bundle; no parent receipt becomes child evidence.

Marked decomposition uses existing `repair_of`, `repair_evidence` and
`repair_dispositions`. Exact prior extraction negatives remain retained with their
original target, bundle, native delivery and spent limits. Proper material child
splitting is required; unchanged parent retries Hold. Extraction and selected
context domain continuation carry pending parent counterevidence and cannot clear
it. Whole-vector interface and final reviewers each independently disposition the
actual blockers, with software additionally requiring exact replacement coverage.
Rejected failed or expired evidence requires its original output, delivery,
native/timing and termination evidence; missing wire or unknown outcomes Hold.
Unrelated negatives still Hold. No allowance, authorization or revoked plan is
renewed. Capsule reuse continues to validate current ordinary membership, homes,
authority, notices, producers and negatives. These source mechanics establish no
semantic acceptance or measured native fit.
