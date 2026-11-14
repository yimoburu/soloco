# Comparison commit coupling

This optional Source path joins the comparison consumer to the existing Store
event producer and lexical physical-COMMIT witness. It adds no model attempt,
provider permission, company adoption or Native qualification.

The component starts from the frozen C7 cut `069ec2b`. That cut includes the
`c51df5e` producer, whose separate 170-case Source run passed independent QA.
The composed consumer and the coupling described here require their own checks.

## Event contribution

`originalStoreExecutionEventFrom` first constructs its normal payload, including
the Original journal or held-observation fields when present. The fixed
`comparisonEvidenceEventFrom(store, payload)` then contributes the comparison
and test evidence before the local final seal and return. The Legacy branch
also calls it before returning its payload.

This order makes each `existing_payload_without_*` hash describe the actual
envelope contributed to. The earlier Original preparation seal stays in place;
event decoration cannot reopen issuance. Without pending comparison or test
work, the decorator returns the same payload. Its normal Store custody and
attachment metadata checks still occur.

## Commit preparation and finalization

The existing Store sequence remains physical COMMIT, Original bookkeeping,
snapshot binding, then the fixed runtime commit hook with its lexical witness.
After that hook validates the witness, Store scope and root, it calls both:

- `prepareComparisonEvidenceCommitFrom(store, witness)`
- `prepareComparisonTestCommitFrom(store, witness)`

Both preparations finish before Legacy request confirmations are registered
and armed, or the new bound Original request is armed. Preparations may check
the actual committed event, allocate records and register private bookkeeping.
They use captured precommit identity and the witness; a precommit SQL custody
loan cannot be reacquired after COMMIT.

The fixed evidence and test finalizers then update the prepared private flags.
They perform no I/O, hashing, allocation, recorder callback or new validation.
The hook also runs when it has no launch tokens: an Original requested header
commits before the separate Original launch-request scope.

A failure during preparation or core confirmation registration leaves the new
permits unusable. Physically committed rows remain factual, and a spent slot
stays spent. A later passive snapshot can retain historical provenance without
recovering a live arm or authorizing another invocation.

Old unbound Original and upgrade tokens arm earlier in the existing Store
sequence. They are outside this selected proof; this change does not rewire
those paths or `appendUpgradeCall`.

## Fixed Source generation

The generation roster adds the eleven released comparison modules and their
three existing MJS dependencies. It contains 83 unique paths: 82 MJS files and
the existing JSON contract. The bounded byte reader is unchanged, and its
roster adds no Python or Native path.

Explicit comparison qualification fixtures still use their separately pinned
Python, Git and Node helpers. Their execution scope must describe those effects;
the earlier producer run's restricted profile does not cover them automatically.
