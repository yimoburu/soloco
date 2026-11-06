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
   producer, and deterministic unit manifest in the existing vault. Its extraction
   identity contains no current company state, owner, notice, or current home.
   Page `inspect` with `plan_id`, `offset`, `limit` (1–16). Retrieve a unit with
   `read`, `plan_id`, `unit_id`; read the returned original/projection snapshot
   handles through existing exact snapshot range reads. Retrieval is not QA.
3. `target` with `phase: "extract"`, `plan_id`, `unit_id`. Dispatch fresh `qa`
   with `review_of` the returned target and no extra inputs. The worker delivers
   the whole bounded unit, then retains exact structured items, conditions,
   uncertainty, source ranges, interfaces, output wire and canonical job receipt.
   A target may instead return `reused: true`, `review_id`, `job_id`: this is an
   existing validated completed worker receipt, with no dispatch or new model
   claim. Unchanged qualifications and replacement plans reuse those receipts.
4. `target` with `phase: "applicability"`, bounded `extraction_review_ids`,
   `counterpart_ids`, `dependency_ids`, and `context_scope` (unknown/global: `*`).
   Optional `item_keys` select exact `review-id/local-item-id` keys; by default all
   items in the supplied extractions are selected. Complete extraction artifacts
   and source units are delivered, alongside complete current homes, dependencies,
   global rules, authority, notices, messages, unknown governing records and state
   extensions. Independent QA must preserve every selected item in an exact home,
   including OPEN effects, failures and exhausted allowances. `scope_complete`
   attests exhaustive home applicability: uncertain scope requires `*`.
5. Every extraction interface has a stable `review/item/interface` key, complete
   condition text and `with_scope` (unknown/global: `*`). Request separate
   applicability targets with `interface_keys`, all involved extractions/items,
   and full homes for both scopes. Unknown/global interfaces require `context_scope:
   "*"`. A different native reviewer must judge these interactions. Empty interface
   sets require substantive independent completeness judgments at every stage.
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
not host/model context-fit guarantees. Overflow retains the failed output and
unit. Request `unit_id: "u3/0"` and `"u3/1"` to subdivide a deterministic primary
range, recursively if necessary. Overlap preserves boundary evidence; it does
not establish independence. Integration accepts only exact primary range coverage
and does not discard accepted work elsewhere. Partition applicability selections
and interfaces when needed. If complete global rules, coupled interfaces, or the
final review cannot fit, hold truthfully; never truncate or substitute hashes for
semantic review. A false or incomplete accepted extraction requires fresh source
repair/requalification, not a coordinator assertion that it is complete.

Current-state consumers validate the entire canonical receipt closure, exact
source/projection/home/dependency bytes, native identity, delivery, actual spawn
timing, terminal closure, output grammar and provenance. New global governing
identity invalidates applicability/integration; it does not invalidate immutable
extraction. This version conservatively rechecks all applicability affected by
that global identity, including notices. Exact source or producer mutation holds.
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

Validation: `node --test tests/scoped-context.test.mjs`. Reviewers in that file
are explicitly labeled contract doubles exercising a tiny obligation language,
the real public engine/store/worker lifecycle and bounded proof checks. They are
not native/model semantic acceptance or evidence of production performance.
