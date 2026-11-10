# Temporary specialists

This optional preparation capability does not adopt a policy in an existing
company. Source availability, installation, policy authorization, native execution
and observed founder benefit remain separate facts.

The fourteen shipped specialist charters remain reusable starting points. An
owning CoS can define temporary expertise for a concrete gap under an explicit,
bounded founder-authorized creation policy. The unchanged base role still owns
execution permissions. A new name does not establish competence, add tools,
authorize spending, or waive independent review.

## Public interface

`company_specialists` supports `authorize`, `create`, `inspect`, `revoke` and
`assess`. Mutations require the real current owner/epoch, an exact
`source_instruction`, and replay-safe `operation_id`. Inspect is read-only.

- `authorize`: record an immutable preparation-only creation policy. It names
  permitted `base_roles`, `input_ids`, `scope`, `expires_at`, `max_profiles` and
  `max_assignments`. The authority source is explicit founder instruction.
- `create`: bind an exact `policy_ref` and immutable `definition`. Definition:
  `base_role`, full `charter` (`name`, `mission`, `inputs`, `outputs`, `block`,
  `success`, `failure`, `phase`), `task`, `acceptance`, `input_ids`,
  `expires_at`, `max_assignments`. This is one bounded assignment objective,
  not a standing department. Counts include failed/queued work and do not reset.
- `revoke`: append a revocation of an exact policy/profile reference; keep the
  original definition, jobs, outputs and uncertainty. New/active execution is
  fenced. Revocation does not rewrite previously completed evidence.
- `assess`: record an exact independent native QA review of an actual profile
  output, with its producer/native identity and current source bindings. A Pass
  must explicitly permit `accept_specialist_output`; Fail/Blocked remain
  evidence. This is scoped preparation-result acceptance, not publication or a
  general certificate of expertise. Ordinary output review supplies competence
  evidence; creating a profile does not require a second committee ceremony.
- `inspect`: bounded policies/profiles/assessments and observed assignment,
  completion, failure and review counts. Business benefit, cost, missed issues
  and founder workload stay unmeasured unless supplied with actual evidence.

An exact reference is `{id, revision, sha256}`. Existing `company_dispatch` and
durable task specs accept optional `specialist_ref`. `role` remains the pinned
base role. Jobs bind `specialist: {version: 1, profile: ref, policy: ref}` and
include exact policy/profile/data inputs. Their context contains both the base
charter and complete specialization. Separate profile session keys prevent
unrelated specialties inheriting one ordinary base-role conversation.

Creating a profile does not summon an agent. A successful dispatch reserves an
assignment; a native identity is observed only when the host returns it. Existing
QA assignments retain their own limits and are not counted as profile assignments.
The policy bounds temporary-profile assignments, not all workflow model calls.

Inspection returns bounded previews and exact `company_context` source handles.
Read those full definitions before using an exact reference. Inspection and exact
operation replay never extend expiry or replenish spent assignments.

## Invariants

- No mutation of pinned roles, team hashes or governance; no SQL migration.
- Closed schemas; no arbitrary tool/model/permission overrides in a charter.
- Preparation only. Existing limits, model choices, owner/epoch, pause,
  independent review and uncertain-execution rules remain.
- An assignment must match the profile's exact task, acceptance and allowed
  explicit input set, including dependency outputs. Every declared profile data
  record is delivered even when the caller omits inputs. The 100-data-record
  limit permits two additional trusted policy/profile records. Compulsory base
  governance/evidence are still delivered; the profile is not a data-isolation
  or filesystem sandbox mechanism.
- Policy lifetime is at most 30 days; profile lifetime at most 7 days and within
  policy expiry. Hard ceilings are 20 profiles and 20 assignments per policy,
  and 3 assignments per profile. Existing concurrent and execution limits stay.
- Profiles/policies/revocations/assessments use a reserved generated namespace
  and are protected canonical records; ordinary legacy names remain usable.
  Generic `company_save` cannot forge or overwrite them. Definitions are never
  edited. Expiry/revocation and authority are rechecked at queueing, before each
  native invocation, and before recording a usable output.
- Historical definition/context binding is separate from current permission.
  A valid completed output can still be reviewed after its author expires;
  expiration alone does not erase or invalidate already accepted history.
- Revocation captures exact already-completed output witnesses, so two commits
  in the same millisecond cannot erase earlier evidence or permit active work.
  Retained rejected/quarantined native negative reviews remain counterevidence
  to a later Pass; unreadable relevant evidence holds acceptance.
- Formats 3/5/6 and durable format 7 must bind the full specialization and count
  it against existing budgets. Unsupported prototype/development, handover,
  scoped qualification or specialized review combinations fail before queueing.
- Profile lifecycle and negative assessments remain semantic company evidence;
  they are never broadly exempted as inert bookkeeping. A company using accepted
  operating checkpoints must review/publish new policy/profile meaning before
  ordinary consumption; profile creation cannot silently amend that checkpoint.
- Peer-host enrollment, peer production routing and company adoption remain
  separately qualified work. This capability initially uses the existing
  owning-CoS preparation path and does not claim a deployed peer runtime.

## Evaluation

Compare matched tasks using the shipped templates and a temporary profile.
Record actual accepted outputs, missed domain issues, handoffs, elapsed work and
founder interventions where observed. Passing source tests demonstrates runtime
boundaries, not specialist competence or improved founder outcomes.
