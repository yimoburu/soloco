# Independent code review after an expired development scope

A failed, unclosed QA session can leave a tested candidate without a usable
verdict after its original development scope expires. Preserve that failure,
its occupied reservation, spent generations, consumed recovery and original
expiry. A review continuation permits one separately authorized independent
read-only judgment and local acceptance of the unchanged candidate and receipt.
It does not renew the original scope.

Use `company_develop` in this order:

1. `prepare_review_continuation` reads the exact retained plan, candidate,
   receipt, prior failed job and whole failure-evidence home. Supply their
   identifiers and hashes, a proposed future `expires_at`, and
   `code_review_window_minutes` of 30 or 45. Its proposal grants no authority.
2. `authorize_review_continuation` requires the exact current proposal hash,
   a new founder `source_instruction` and `approval_reference`, and explicit
   `model_data_approved` and `unknown_prior_replacement_approved` values.
   It records a separate decision and immutable review target. The original
   unknown session remains occupied. An existing target cannot be reminted.
3. Dispatch independent `qa` for the new target with the matching
   `code_review_window_minutes`, a concrete `code_review_reason`, and a
   per-invocation timeout of 600 seconds. The fixed 30 or 45 minute
   window starts at the first actual spawn and does not reset for evidence
   reads. It must end within the new authorization deadline. The complete
   retained evidence manifest must be inline or declared for whole reads.
4. A returned verdict binds the new target, new grant and current authority,
   unchanged candidate, and actual historical test receipt. A usable Pass
   needs complete delivered evidence, independent native provenance, confirmed
   closure and no blockers. Failed and Blocked verdicts remain counterevidence.
5. `accept_review_continuation` requires that exact timely Pass and a still
   current new authorization. Later local acceptance may occur after the QA
   execution window, provided the review itself finished strictly within that
   window. The separate acceptance record reports `source_integrated: false`.

The original development acceptance and testing paths remain unchanged.
Continuation does not permit generation, test execution, validation reuse,
recovery, allowance resets, source integration, release of the old reservation,
or claims about production, host replacement or durable continuity.

## Evidence delivery and persistence

The runtime records initial delivery only after a valid closed response. It
records later whole-source ranges only after a matching closed response from
the same native session. Retrieved ranges are distinct from delivered ranges.
A Pass requires each declared supplemental value to be complete inline or have
a contiguous, hash-checked whole delivery union. Delivery does not establish
semantic understanding or retention after compaction.

The continuation transport keeps the new review target separate from the
historical receipt used for lossless file and receipt aliases. Restoring the
presentation reconstructs the exact original assignment, including unchanged
negative evidence and source/candidate memberships.

Publication rechecks the QA execution cutoff immediately before SQLite COMMIT,
after snapshot and event writes. Authorization and later acceptance recheck the
new authorization cutoff and owner at that same boundary. Crossing a cutoff
rolls back that transaction. This is a pre-COMMIT check, not a promise about
COMMIT completion latency.
