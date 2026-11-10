# Prepared GitHub publication with two guarded refs

This is an unpublished source-preparation component. Its ordinary tests use isolated real SQLite ledgers and mocked GitHub responses. They do not qualify a native worker, live GitHub credentials, an App, repository policy or publication authority.

The current atomic component supports only an explicitly qualified `controlled-test` mode with injected transport and scope `synthetic-mocked-transport-only`. The ordinary default network transport and all production/App modes remain held. A matching hostname alone never activates publication.

The additive atomic path publishes one already prepared merge commit `M` with exact tree `T` and ordered parents `[B,H]`. The current base ref must still point to `B`; the actual same-repository PR head ref must still point to `H`. The proposal retains its existing `github_publication` binding and an independently reviewed `github_atomic_publication` contract:

```js
{
  protocol: 'github-atomic-refs-v1',
  api_host: 'api.github.com',
  repository_node_id: 'R_fixture',
  base_ref: 'refs/heads/main',
  head_ref: 'refs/heads/topic',
  before_base_oid: B,
  before_head_oid: H,
  after_oid: M,
  prepared_merge_oid: M,
  prepared_tree_oid: T,
  prepared_parents: [B, H]
}
```

`M` must already exist in the selected repository. This path does not construct or upload it, create/delete a ref, force an update, update the PR head, retarget a lease or fall back to the older merge API. The original publication path remains separate.

## Request and observation

`GitHubClient.observeAtomicRefs(contract)` reads the repository by its node ID, both fully qualified refs and the prepared commit object. It requires Commit objects, a complete two-parent connection and exact ref/repository identities. Querying three parents while checking the count, returned nodes and continuation flag prevents a third parent from hiding behind a two-node prefix.

Publication must validate the required trusted CI and publication gate on the exact prepared commit `M`, with atomic-specific IDs bound to `M`, `T`, ordered parents `[B,H]`, reviewed inputs and protected harness/policy. Successful checks on `H` alone do not test the object that will be published. A stale merge-check identity or changed prepared geometry holds the candidate before mutation.

`GitHubClient.inspectAtomic(binding,checkName,atomic)` fetches check runs from `M`, while PR head and native-review identity remain bound to `H`. It returns `checked_commit_sha:M` and the protected qualification digest. `atomicPublicationCheckId({binding,atomic,qualification,subject_ref,review_refs})` and `atomicCICheckId({binding,atomic,qualification,name})` use separate atomic prefixes and bind the qualified mode as well as prepared geometry. Older head-only check IDs do not satisfy these gates.

The client sends one `updateRefs` mutation containing:

```js
{
  repositoryId,
  clientMutationId: requestDigest,
  refUpdates: [
    {name: base_ref, beforeOid: B, afterOid: M, force: false},
    {name: head_ref, beforeOid: H, afterOid: H, force: false}
  ]
}
```

GitHub documents the all-or-nothing update and the pre-update `beforeOid` condition. Applying that condition to the head no-op is the intended guard; the documentation does not separately demonstrate that no-op case on a live server. `afterOid` is the `RefUpdate` field; `oid` belongs to the different single-ref mutation. The payload contains `clientMutationId`, which supplies correlation rather than documented idempotency. [GitHub updateRefs and input schema](https://docs.github.com/en/graphql/reference/git#updaterefs)

Repository/ref lookup and prepared-object lookup use the official GraphQL schema. Parent observations use the ordered returned connection and require complete coverage. These schema checks are not live policy qualification. [Repository schema](https://docs.github.com/en/graphql/reference/repos#repository), [Commit schema](https://docs.github.com/en/graphql/reference/commits#commit)

## Durable publication API

`MergePublisher.enqueueAtomic({id,subject_ref,review_refs,grant_id,task_id})` retains an exact proposal/review binding and the full normalized protected issuer configuration. Changed or reduced required checks cannot reuse that request merely by retaining the same policy hash string. `publishAtomic(id)` checks the existing repository, policy, trusted check, CI and independent-review gates, then commits the send admission before external I/O. SQLite transactions never span remote awaits. The fixed request and repository reservation survive process replacement. Atomic and older publications share one repository FIFO and reservation.

The atomic path also requires a protected host-supplied qualified-mode binding in that immutable request. Matching an API hostname establishes target consistency only. Missing, unqualified, changed or mismatched mode evidence holds the mutation; neither a proposal field nor a model claim can qualify the host. Positive ordinary tests supply an explicitly synthetic controlled-fixture qualification, which is not live GitHub/App/policy proof.

Protected configuration supplies `issuer.atomic_qualification` to the publisher and `atomicQualification` to `GitHubClient`, alongside an injected controlled transport. The closed binding contains protocol `github-atomic-qualified-mode-v1`, mode `controlled-test`, `qualified:true`, synthetic-only scope, API host, repository node ID/name, App/check identity, harness/policy digests and an evidence digest. It is copied, stored as `qualification` in the immutable request and included in check identities. Missing or mismatched configuration fails before the mutation; a production-mode label or synthetic evidence digest cannot unlock default network transport.

A successful mutation acknowledgement produces `pending` with `semantic_acceptance:false`. `reconcileAtomic(id)` reads without sending. Exact base `M`, unchanged head `H`, prepared tree `T` and ordered parents `[B,H]` produce a retained `observed` fact, also with `semantic_acceptance:false`. An observation is not proof that this process caused the update or that a PR was semantically accepted. `observed` stays retained as the fact established at its recorded cut.

A preflight failure leaves the candidate `held` and its claim reserved. A transport failure, GraphQL error, partial/null/malformed payload, mismatched correlation value or missing acknowledgement leaves an uncertain effect. A changed or unavailable readback also remains uncertain. Cold replay and reconciliation never resend an admitted request, release its reservation or refund an allowance. A different/new candidate does not bypass that retained reservation. There is no atomic-path release or automatic repair operation.

## Protected integration still required

This remains a trusted internal API. Principal labels and fixture review rows do not authenticate a human, native session or reviewer. P2/P8 must supply a protected caller boundary, current principal/grant/task/scope binding, and the accepted protected review producer with complete immutable lineage and contributor independence. P4 currently checks the older `peer-native-review-v1` row shape. Accepted P2 produces `peer-runtime-observation-v1` reviews with protected task and observation references, exact attempt/context/output commitments and complete immutable production history. Those shapes are not interchangeable, and the existing P4 checks do not establish the P2 producer relationship.

The authorizer is a protected synchronous function receiving a read-only ledger view and returning the Boolean `true`. P2 `authorize` returns a typed `{control,principal,grant}` result; it cannot be passed through as a truthy object. A protected adapter must perform and preserve the exact P2 checks; this component does not invent that integration. P4 publication claims use `status:'reserved'`, while P2 resource admission currently scans claims with `status:'held'`. Atomic transport therefore does not establish symmetric resource exclusion between P2 and P4. An effect becoming `held` does not translate or release either claim representation.

Actual App identity, token isolation, permissions, rulesets and branch-protection behavior, required checks on the prepared merge, webhook/readback semantics, no-op guard behavior and GitHub error/lost-response behavior require separate live qualification. The reviewed API host must exactly match the protected client configuration; atomic calls require an origin root, and non-root API paths are unsupported. A configured hostname does not qualify GHES schema or policy behavior. Organization/fork modes and policy bypass remain outside this component's supported scope. Native adoption, confined tests and independent fresh QA remain separate from ordinary source preparation.

## Controlled P2 policy consumer (Option A)

`PolicyAtomicPublisher({ledger,client,principal,issuer,clock?})` is a separate trusted internal consumer. Its `enqueueAtomic({id,subject_ref,review_refs,grant_id})`, `publishAtomic(id)` and `reconcileAtomic(id)` methods call the actual frozen P2 `publicationPolicyEvidence` implementation, with the same `github/atomic-publish` action at every gate. The software publisher must have the actual `publisher` role and remain distinct from the proposal producer, protected reviewers, transferred current review owners and their known native identities. Metadata author identity must match the actual proposal principal. Caller-supplied policy callbacks, Boolean approval, native/proof assertions and `task_id` are rejected.

The real P2 producer must retain both complete metadata objects before proposal hashing and review. The consumer stores the full original metadata and P2 semantic authority binding/SHA in the immutable request. Unsupported atomic fields are rejected without removing them. Fresh usage counters, capacity and raw current-source row references are observed through P2 at each gate; mechanical usage does not change otherwise unchanged authority, while exhaustion or changed semantic authority holds the request.

All six owning read methods are forwarded. Static replay, FIFO, sequence, check and claim planning reads precede the final P2 policy call; only pure checks and planned P1 puts/events follow. No transaction spans external I/O, and no policy call nests an `execute` or another ledger transaction. Provider/index failures propagate by identity and cannot create an admission or claim.

Option A provides mutual exclusion only. The publisher creates its own exact repository claim with `status:'held'`, controlled mode, principal, effect, reviewed subject, request/authority identities and generations. The claim has **no `task_id`**. It rejects every overlapping P2 held or P4 held/reserved claim through actual P2 canonical resources and overlap rules; P2's existing held-claim scan also blocks overlapping task claims/admission. It never adopts, steals or ignores a P2 task claim. P2 task cancellation or closure cannot release the task-less publisher claim. The separate private `github-atomic-publication:<id>` tracker leaves original P2 producer/reviewer tasks unchanged.

The same M-bound checks, prepared-object geometry and one dual-CAS mutation apply. After dispatch, cold authoritative readback can record physical truth even after revocation, pause or exhaustion, without another send. ACK and exact M readback retain `semantic_acceptance:false` and the held claim. This component supplies no release/refund/semantic acceptance capability.

Concurrent callers can complete preflight in a different order from dispatch. The owning record transaction rereads the effect and preserves an already dispatched outcome when a stale caller requests `held` after a preflight or admission failure. It returns the current outcome without changing the effect, tracker or event log. A failure before any dispatch still records a sticky hold. Delayed ACK and lost ACK retain the sole durable admission; cold readback after pause or revocation can observe the exact refs without another mutation, semantic acceptance or claim release.

Actual P2/P3 accountable software-task handoff/admission, a protected prepared-M producer and CI issuer, native adoption/independent QA, P8 authentication/credential isolation and real App/server/ruleset qualification remain unproved. They are outside this explicitly controlled fixture lane; production/App modes remain held.

The v2 consumer requires fresh P2 `identity_facts` at every semantic gate. The actual P2 policy seals current and historical known native identities for the publisher and all interested contributors, original reviewers and current transferred review owners. Protected observations, admitted-principal history and transferred-away task heads remain visible even when each principal's current `native_id` differs. The consumer intersects all fresh publisher aliases with every fresh interested identity set; it does not interpret raw task proofs or accept caller alias lists.

These identity facts remain outside the stable request authority hash. A genuine unrelated task with a different native identity can therefore leave queued work valid with freshly checked remaining capacity. A newly overlapping protected alias rejects queued work or holds an already prepared candidate before dispatch. The original 311 passing cases remain historical evidence; the actual historical-alias counterexample and applicable v2 regression results are retained separately. This change supplies neither principal-membership/P8 authentication nor native/production qualification.

The v3 upstream policy ends its provider reads with a direct, uncached owning P1 `getVersion(subject)` guard, then applies the common expiry cutoff. A modifying read hook cannot leave previously collected identity facts usable: the same owning transaction rejects and rolls back before dispatch. Read-only hooks and successful exact no-op puts remain valid. The consumer forwards the genuine P1 method and adds no raw-proof interpretation. This snapshot guard does not establish P8 host trust or native adoption.
