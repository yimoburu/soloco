# Founder publication and receiver intake: source acceptance criteria

Base: `496b534971590b5188c283609755c9cfec13b4db`. This is a bounded source
implementation, not runtime activation, company adoption or native qualification.

The founder should recover returned work, reviewed proposals and pending handoffs
without relaying messages or mistaking software completion for a receiver decision.
Independent review, logical-home publication and receiver acceptance remain separate.

## Publication

- The retained production facade admits `home/publish` only for the actual current
  founder, checked before replay and through the physical commit boundary.
- Requests name exact proposal and review references and the founder instruction.
  Reuse all existing home publication checks: base/readset, dependency/current
  membership, protected independent Pass, conflict and adverse-review vetoes.
- Capture every current source actually checked, honor current authorizing grant
  expiry, and seal public writes after planning. Any late write attempt or stale
  authority rolls back all home, receipt, history, event and outbox changes.
- Record the publication instruction and exact published home separately from
  receiver disposition. Preserve original contributor/reviewer lineage. Publication
  charges no model and never releases uncertain reservations.
- Exact replay returns the original receipt without a new publication, while
  retaining the current founder and production-owner checks.

## Handoffs and intake

- `handoff/send` records a closed typed handoff in existing `work_items`: actual
  sender, intended receiver incarnation, exact subject, governing/evidence
  references, scope and limitations. Ordinary messages remain informational.
- `handoff/accept` and `handoff/reject` record an immutable explicit decision by
  that actual bound receiver. They preserve the original handoff and do not
  publish, provide QA, authorize execution, resolve notices or alter task closure.
- A changed receiver incarnation leaves the original pending handoff visible and
  held until a separately supported explicit succession/transfer applies.
- Bounded `handoff/pending` pages distinguish explicit handoffs from informational
  returned work, unpublished proposals and incoming messages. Pages expose exact
  source/range/hash references, scanned counts and continuation without claiming
  a false total of pending decisions.
- Reading, sending, native return, QA and publication never imply acceptance.
  New source revisions require fresh applicability; historical decisions remain.
- The public operator may act only as the actual founder receiver. It cannot
  impersonate a named peer. The foundation component leaves task clients unchanged.

## Task-bound receiver producer

The follow-up receiver path uses source-derived `handoff_ref` and a complete
`handoff_envelope` inside the existing `context.task.definition`. It adds no
siblings to `context.task` and admits no arbitrary `work_items` semantic inputs.
The source verifies the original handoff, actual intended receiver, scope and
current supporting versions, and expands legitimate semantic references into
the existing bounded input list. Definition hashes and context budgets remain.

Only `handoff/accept` and `handoff/reject` are added to a task-bound client, and
only for its exact admitted handoff. The original attempt, context, executor,
recipient grant, lease and physical commit checks still apply. Sending handoffs,
publication and company control remain outside the task client. Its own decision
preserves the original envelope; this is not a general exemption for mutations.

Returned tasks and task-produced proposals retain the handoff sender and original
input contributors for independent review. Proposal attribution follows verified
immutable admission history, so finishing the producing task does not create a
new live dependency or let its sender review its own contribution.

A new admission cannot consume a handoff already decided elsewhere. Exact
governing references that admission itself would change must hold before model
charge, rather than create an immediately stale attempt. Generic historical
receipt replay and a live task-effect replay retain their different authority
checks.

The protected callback transport must compose those two source verbs with the
actual current-turn task client. Its tool-schema hash changes require a new
qualified source profile. Old profiles retain their Hold; installation, fixtures
or relabeling cannot supply that qualification.

## Verification and limits

Use real temporary SQLite and actual source commands with explicitly synthetic
native/process observations. Verify the positive chain and exact-reference,
identity, veto, currentness, replay, pagination, expiry and full rollback failures.
Provider failures retain their original identity. Preserve old failures, negative
reviews, legacy-origin holds, spent allowances and UNKNOWN reservations.

Public transport belongs to the routing CoS and follows its exact-current reader
contract. Source review, tests, native evidence, owner acceptance and actual merge
remain distinct. The owning CoS is the final integrator.
