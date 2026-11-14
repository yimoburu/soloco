Public control continuity repair (base c533335)

`engine.control` previously checked the accepted operating context before writing
the resume audit. The first ordinary format 6 assignment then treated that new
founder decision as DIRTY, even for the literal command `resume`.

`mechanicalOperatingControl` recognizes only the exact eight-field runtime
pause/resume/handover decision shape, including UUID, timestamp, producer/status,
and a complete literal command matching its action. Accepted forms are the action
word, optionally prefixed by `please `, optionally followed by ` company` or
` the company`, with optional final `.` or `!` (case and surrounding whitespace
are ignored). It follows the strict whole-instruction rename precedent. Labels,
substrings, extra conditions, new fields, other producers and malformed fields
do not qualify. The original audit stays stored; there is no archival,
classification receipt, mutable trusted flag, or new execution authority.
Generic `engine.save` always writes runner/Draft/revision/author_instance fields
and cannot manufacture this producer shape through its public API.

Resume now checks a prospective view containing its own new audit before
unpausing. A condition-bearing resume is rejected atomically; no successful
resume is reported and no company mutation occurs. Record and independently
accept new conditions through the existing preservation/publication APIs before
issuing a literal resume. Conditional pause and handover audits remain durable,
visible DIRTY frontier entries until independently accepted. Public tool argument
validation continues to reject unknown request fields. Unknown legacy records
remain held on first pass.

Merge interface: one import and one predicate in `operatingFrontier`, a new
standalone `operating-control.mjs` predicate, and a prospective-view check in the
resume branch of `engine.control`. Frontier guards, proof bookkeeping, format 6
evidence, and publication provenance are unchanged and remain separate repairs.
Do not replace their checks with this predicate or use it to skip jobs/reviews.
Owner epoch transfer, old-owner fencing, paused dispatch restrictions, runtime
compatibility, exact independent current-subject handover Pass, complete subject
delivery and confirmed native closure remain required.

The added `tests/operating-control.test.mjs` uses actual public control handover,
explicit public storage migration, independent operating publication, actual
v4 reconstruction submission, and the real worker with an explicitly labelled
fictional adapter double. It reaches a completed first ordinary read-only
Engineering assignment using format 6. Negative checks cover pre-QA resume,
missing closure, wrong subject, reused identity, incomplete delivery, changed
current source, conditional resume rollback, conditional pause/handover,
modified/unknown audit fields, generic-save forgery, unknown public arguments,
and unclassified legacy. Fixture state mutation is used only for pinned test
roles/governance and adversarial evidence changes, never to fabricate handover
or a completed review.

Limits: this is source contract evidence using synthetic semantic judgments;
it is not independent QA, native semantic acceptance, or a live-company Pass.
The next assignment after an ordinary result still requires that result's
consequential content/outcome to satisfy the existing preservation contract.
No version change, installation, release, network operation or host change.

Frozen-intake handover continuity (exact 0.7.9 candidate base `65df29f`)

V4 inspection and QA use the exact independently accepted operating subject
after validating its current owner, immutable preservation, expiry and complete
producer intake. They do not rerun live legacy corpus classification against
the newly submitted reconstruction. Changed current meaning, forged producer
bookkeeping and unresolved new negatives still hold; failed v4 inspection never
falls back to the legacy projection. Legacy reconstruction contracts are retained.

Transfer with an accepted checkpoint requires the existing exact mechanical
handover command; a condition-bearing instruction holds atomically until its
conditions are independently accepted. It validates the genuine outgoing boundary
and bounds its evidence envelope plus the proposed transfer. It does not claim
that the incoming owner's publication or handover QA fits or is accepted. The
incoming owner is paused and receives a bounded publication-required response;
handover reads and all reconstruction protocols hold until existing operating
plan / independent QA / apply accepts the actual incoming delta. A marked
operating transfer then uses v4 reconstruction, including when the optional
protocol is omitted. Exact independent v4 QA and confirmed closure still precede
resume. Historical frozen-parent authority is not renewed for the new owner.

This reconciles the implementation with adopted SPEC v0.21 §§6–8: usable current
context, retained history and failures, checked replacement, and disclosed
capability limits. It changes no governing principle or public tool argument.
The focused synthetic regression covers frozen intake through successor
publication, independent handover and a useful preparation proposal. Its scripted
judgments establish mechanics only; native semantic acceptance and live-company
capacity remain unqualified. Original failing outcomes remain in the validation
handoff rather than being rewritten as successful attempts.
