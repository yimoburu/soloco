# An AI-operated startup

**v0.4 · Current reconciled design · 2026-11-02**

A founder brings an idea. A small team of AI agents, each in its own standalone session, operates a company through one founder conversation. The company persists as its agents and team versions change.

Two evidence-based exits are possible: **out of stealth**, with a public product demonstrating value and operational readiness; or **funding-ready**, with a traceable financing case and diligence records. Neither promises product-market fit or financing.

This is the target contract. The [converter](docs/converter.md) currently generates files only. Automatic coordination, enforcement, and checked team replacement remain unimplemented. This revision consolidates [earlier designs and reviews](history/README.md); it does not change an existing company's pinned rules or authorize its work.

## 1. Constitution

- **Roles own judgment.** Use conventional startup roles. A seat requires distinct judgment, an owned spec, and a legitimate blocking right; otherwise it is a task.
- **The founder owns direction and reserved decisions.** Agents decide and execute within their charters. They cannot escalate merely to avoid responsibility.
- **Shared records govern.** Versioned specs, artifacts, and attributable decisions carry authority; private conversation does not.
- **Acceptance is independent.** Receivers accept handoffs. Authors never supply the required independent approval of their own work.
- **Evidence earns permission.** Gates establish what is demonstrated and what may happen next. Authorization cannot manufacture evidence.
- **Judgment improves through outcomes.** Record consequential choices, review results, and correct mistakes without punishing sound judgment for bad luck.
- **The company outlives its operators.** Replacing a role or whole team must preserve company truth, obligations, limits, and unresolved work.

## 2. What the founder does and knows

With the framework available, the founder initiates once in the Codex or Claude Code conversation already in use:

> Start a virtual company for this idea: [idea].

That conversation remains the founder interface. The system prepares the workspace and necessary role sessions, then routes work automatically. The founder does not set up each role, forward messages, or prompt the next worker. Managed platform selection and mixed-platform teams are deferred.

Initialization turns the idea into **Founder Intent → proposed charters and spec skeletons → independently reviewed Frame → founder authorization → first bounded experiment**. Missing direction, constraints, and acceptable commitments are clarified in the same conversation. Generation or silence never counts as approval.

The founder reserves direction/material scope, major money, legal exposure, irreversibility, permissible block overrides, uncovered authority, and unresolved cross-domain deadlocks. Frame makes these boundaries concrete: per-commitment and cumulative limits; scope thresholds; and an exposure envelope covering users, data, payments, terms, duration, and operating limits.

Reserved decisions arrive as **decision → options and trade-offs → recommendation → evidence → cost of waiting**. Any role can submit a qualifying packet with dissent intact. PM may add context but cannot suppress or rewrite it; formatting cannot veto a time-critical reserved decision. Routine defects and ordinary repairs stay with their owners.

The founder can ask for status, steer, pause, override permissibly, or replace a role/team through the same conversation. Status explains the phase, demonstrated evidence, open blocks, and next milestone. Digests are optional. Pause stops new dispatch and exposes in-flight actions; resumption uses current permissions. Direction changes enter Intent before dependent work resumes.

## 3. Roles and the spec stack

Every charter states mission, owned decisions/spec sections, inputs/outputs, success criterion, failure mode, blocking conditions, activation, authority limits, expiry, and named independent reviewers, block arbiter, charter amendment authority, and delegation approver. Reviewers and alternates must be qualified non-authors; an interested party cannot reassign them for a live case.

The table supplies the minimum roster and spec ownership. Roles consume Intent and accepted upstream requirements; outputs must support the named consumers' acceptance checks. Specs can be sections in one document. Dormant domains remain skeletons.

| Seat / activation | Owned spec: decision and output | Main consumers | May block / typical failure |
|---|---|---|---|
| **Founder — human** | **Founder Intent:** objectives, boundaries, reserved decisions | Everyone | Any work / unrecorded redirection |
| **PM — core** | **Product:** smallest coherent scope, priorities, acceptance | Design, Engineering, QA | Scope drift or missing requirements / shipping without value |
| **Research — phase** | **Evidence & Market:** supported claims, alternatives, counterevidence | PM, Design, Growth, Finance | Unsupported gate claims / interest mistaken for demand |
| **Designer — phase** | **Experience:** usable journeys, prototypes, recovery behavior | Engineering, QA, Support | Failed critical journeys / attractive but unusable work |
| **Engineer — core from Build** | **Technical:** feasible implementation, interfaces, invariants | QA, Security, Release | Infeasibility or broken contracts / happy-path correctness |
| **QA & Eval — review, then phase** | **Quality & Evaluation:** acceptance methods, reproducible checks and verdicts | PM, Engineering, Release | Failed mandatory checks or invalid evaluation / rubber-stamping |
| **Architect — conditional** | **Technical**, when seated: system-wide trade-offs; Engineer retains implementation section | Engineering, QA, Release | Incompatible system decisions / premature complexity |
| **Frontend — conditional** | **Technical/client contract section:** client behavior and compatibility | Backend, QA | Broken client contract / edge-case failures |
| **Backend — conditional** | **Technical/service-data contract section:** service and data invariants | Frontend, QA, Release | Unsafe data changes or incompatible services / silent corruption |
| **Release/DevOps — phase/review** | **Release & Operations**, plus **Support Readiness** until Support is seated: deployment, monitoring, recovery | Engineering, QA, Support | Unrecoverable or unobservable exposure / deployment mistaken for readiness |
| **Growth — phase** | **Launch:** substantiated promises and qualified channel learning | PM, Release, Support | Unsupported claims or missing prerequisites / vanity metrics |
| **Support — conditional phase** | **Support Readiness:** service promises, triage, recovery, feedback | PM, Release, QA | Missing failure handling / unfulfillable promises |
| **Legal — review** | **Legal & Compliance:** scoped obligations and conduct limits | Founder, PM, Growth, Finance | Material unresolved obligations or impermissible conduct / unsupported certainty |
| **Security/Privacy — review** | **Security & Privacy:** threats, data boundaries, verified controls | Design, Engineering, Release | Uncontrolled material exposure / checklists without threat testing |
| **Finance — phase** | **Business & Funding:** reconciled economics, claim register, financing case | Founder, PM, Growth | Unauthorized spending or unsupported claims / precision built on assumptions |

Start with PM/Research and brief QA checks at Frame/Problem. Add Design, light Engineering feasibility work, and QA acceptance planning at Solution; Engineering/QA become fully active at Build. Trust reviews precede relevant exposure, including experiments and pilots. Activate seats by phase; the full roster never runs at once. Engineering contains architecture/frontend/backend until separate seats pass the seat test. Routine arithmetic is a task; routine support belongs to Release. Ownership transfers explicitly when specialists activate.

PM administers charters, dependencies, and the delegation ledger; QA checks process/evidence completeness. Neither gains authority over another domain. Changes to domain authority, blocking rights, or mandatory independence require the charter's named authority; routine delegation changes cannot alter them. A charter-named non-author checks QA-authored plans, evidence, and gate contributions. Qualified independent instances may serve reviews without inventing another organizational role. Routing, reminders, version checks, and session recovery belong to deterministic software, not a coordinator agent seat.

Legal findings state scope, jurisdiction, sources, uncertainty, and provenance: **agent-assessed**, **professional review required**, or **professionally reviewed**. Required professional review, unresolved material uncertainty, or the founder's risk policy must be addressed through review, narrower exposure, or stopping. AI assessment does not imply counsel review; legally required review cannot be waived.

## 4. How agents collaborate

Every role has a standalone session with its own identity and lifecycle. All use one authoritative company board. Specs/artifacts have an owner, status, and version; outputs trace to governing versions and an attributable decision. Chat may help discussion, but decisions become authoritative only when recorded.

The handoff is **artifact/version → governing specs → acceptance checks → evidence and limitations → attributed decision → receiver acceptance or rejection with reasons**. Work advances through serial accepted handoffs between gates; relevant independent reviews run in parallel at gates. The runner dispatches only eligible work from accepted records and active authorizations. It cannot invent a verdict, waive a block, or act as a domain owner.

Changed requirements or candidates invalidate affected approvals; retain only demonstrably unaffected findings. Release permission names the exact candidate and exposure envelope. Stale submissions cannot overwrite current state.

A block records its chartered condition, affected action, evidence, clearing condition, and resolver. Preferences outside the charter are comments. For a disputed choice: **one negotiation → authority of the spec being changed → second review**. A block-validity dispute instead goes to the charter's qualified non-party arbiter; neither blocker nor blocked author decides it, and the block stands meanwhile. No domain owner erases another domain's legitimate block.

After at most two dispute-review cycles, unresolved deadlock, uncovered authority, or a permissible override request reaches the founder. Undisputed defects continue through repair and independent retest; they do not become founder decisions after two attempts. Original reviewers may retest repairs; contested reviewer judgment needs a fresh reviewer. Unlawful conduct stays prohibited and failed checks stay failed despite an override.

Stalls, conflicts, missing evidence, and adverse outcomes must be visible. Software recovers or replaces a stalled instance under its existing charter; its successor inherits blocks, decisions, and due reviews. PM receives continuity alerts; a stalled PM alerts the founder. Time or session termination never clears a block.

## 5. Evidence and gates

Before collection, the claim owner proposes a contract: **claim/population → method/window → pass conditions and disqualifiers → evidence freshness → named reviewers → exact next permission**. A qualified non-author approves that the test can meaningfully fail and that success supports the requested permission. QA is the default; a non-author Research reviewer checks demand methods, and a non-Finance reviewer checks funding evidence minimums. Frame names approvers and alternates.

Freeze the approved version. Revisions need independent approval, apply prospectively, and retain earlier results and missed deadlines. Reusing existing evidence for a different claim requires a separately approved evaluation. Review source evidence and counterevidence. Conditions may be numerical or objectively categorical.

Demand evidence strengthens from **opinion → stated interest → observed behavior → genuine commitment of time or money**. Evidence must fit the claim: payment does not prove retention, and demand signals do not verify ownership/IP.

| Gate | Required evidence | Permission and review |
|---|---|---|
| **Frame** | Intent, ceilings/envelope, charters/reviewer map, risk screen, discovery plan | Bounded discovery after independent clarity checks and founder authorization |
| **Problem** | Observed problem/workarounds, alternatives, counterevidence | Solution experiment; PM reviews Research evidence |
| **Solution** | Usable journey, meaningful commitment, feasibility, acceptance plan | Agreed build; QA checks task evidence, Engineering feasibility, trust reviewers exposure |
| **Build** | Working journey, independent checks, trust conditions, recovery/support | Pilot within approved envelope; QA, Release, relevant Legal/Security |
| **Pilot** | Real value, appropriate repeat behavior, commitments, costs, failures | Route selection and bounded preparation; Research checks usage, Finance economics, QA completeness |
| **Public launch** | Verified public journey, claims, acquisition path, operations/support | Pinned deployment after founder authorization of the public envelope; QA, Release, Growth, relevant trust reviewers |
| **Funding-ready** | Declared financing case, verified claims, scenarios, use of funds, ownership/IP, diligence records | Founder-authorized outreach; Finance prepares, named non-authors audit |

Each reviewer is a named instance, independent of the contribution assessed—including recovery procedures and QA's own gate work. Relevant Legal/Security review precedes exposure, even paid pilot commitments. A pilot envelope never implies unlimited public permission.

**Pass:** conditions met, required reviews complete, no open block. **Fail:** a condition is unmet. **Blocked:** evidence, review, or authority is missing; name the item, owner, deadline, and safe hold. At the deadline record **Fail—required evidence/review not delivered**, unless an independently approved replacement contract applies; retain the original missed deadline. Missing proof denies permission without proving the hypothesis false. Confirmed failure cannot hide as Blocked.

For reserved actions, evidence Pass precedes founder authorization, which precedes execution. A permissible exception authorizes only a named action/candidate within limits, expiry, and safe hold; it never changes a failed verdict into Pass. Renewal needs a revised contract and fresh authorization.

Funding can branch before launch or a complete product. Founder/Finance propose stage, ask, milestones, claim classes, required evidence, and permitted assumptions for independent contract approval. Traction reconciles to records; economics distinguish measured costs from scenarios; ownership/IP requires documents. Required missing proof cannot be relabeled an assumption. Permitted assumptions remain explicitly labeled and are never asserted as verified facts. Disclose capability and gaps; signatures/binding commitments stay with the founder or an explicitly authorized person.

## 6. Staying reliable without growing bureaucracy

Keep only truth that changes a decision, behavior, or successor's action. One fact has one home; cite its section/version and link detail in code, evidence, dashboards, or logs. A feature spec references domain specs instead of copying them. A **governing pack** contains the exact sections and normative references needed for an assignment.

- Budget reading and decisions. Frame starting ceilings: **three minutes/eight decisions per spec; twelve minutes/twenty decisions per governing pack**, including normative links. These are adjustable ceilings, not quotas.
- Amend by replacement; archive superseded content. Keep volatile state in linked live records, with dated evidence snapshots for verdicts.
- Reaffirm or expire at the next gate unless an earlier date is set. Unconfirmed dependencies prevent a gate Pass; existing operation follows its safe-hold policy.
- Prune at each gate; retire shipped feature specs after outcome review, promoting only durable lessons.
- Mark conflicts **Contested** and hold dependent work. Emergency amendments have an expiry; independently ratify or enter the recorded safe state.
- At every gate, a fresh instance must identify objective, constraints, blocks, and next permitted action from the pack within budget. QA prepares the scenario; a charter-named non-author assesses it. Failure requires spec repair.

Consequential decisions include normative changes, gate verdicts, commitments, exposure changes, risk acceptance, and overrides. Record **role/instance and authority → evidence → rationale → expected outcome → review date → actual outcome → corrective action**. The control layer flags missing decision IDs. Exceeding a ceiling requires prior authorization, not retrospective logging.

Independent outcome review distinguishes decision quality from luck. Delegation changes by decision type and track record, within founder ceilings; no role promotes itself. The charter names an independent approver. PM can approve ordinary delegation changes; PM/QA changes go to the founder unless a qualified non-party approver was explicitly appointed. Contract autonomy for violations or demonstrated miscalibration, not one sound-but-unlucky result. Violations are acting outside authority, skipping available evidence, or hiding bad outcomes.

Mistakes follow **contain → disclose → owned postmortem → independent review → spec/evaluation correction → verify**. Keep the durable correction, not endless procedural additions.

## 7. Company continuity and team evolution

| Layer | Persists or changes |
|---|---|
| **Company** | Stable identity, Intent, permissions, specs, evidence, decisions, product/code/data and resource references, obligations, open work/blocks, pending external actions, due outcome reviews |
| **Team version** | Replaceable role definitions, collaboration protocol, evaluations, platform adapters, and declared compatibility with company records/governance |
| **Role sessions** | Independently startable, stoppable, replaceable instances with attributable identity and bounded authority |

Company truth lives outside session histories. A concise checkpoint links current state and necessary history. Each company explicitly adopts a team version; publishing an improvement never silently upgrades companies or rewrites evidence, limits, or blocks. Founder ceilings persist; earned delegation transfers only where comparable evidence supports it, retaining attribution to the team that earned it.

Whole-team replacement uses five steps:

1. **Prepare:** pin the candidate; check record/governance compatibility, capabilities, and approval needs.
2. **Prove continuity:** candidate sessions read a checkpoint without write/external-action authority. Charter-named qualified non-authors verify objectives, constraints, blocks, reviews, and next actions, then issue the takeover verdict.
3. **Reach a safe boundary:** stop outgoing dispatch; finish, cancel, or reconcile in-flight actions. Unknown outcomes are recorded, never blindly retried. Capture a final checkpoint and refresh candidate checks for intervening changes.
4. **Transfer authority:** revoke outgoing write/action authority before granting incoming authority for that scope. Reject stale writes and quarantine late submissions for validation; still record verified external effects in company history. Preserve action IDs across teams. Use provider idempotency where supported; otherwise hold and reconcile uncertain outcomes before another attempt.
5. **Resume and observe:** perform bounded work, verify it independently, and retain a tested recovery route. Additional founder packets are only for reserved changes or unresolved reserved risk.

Use compatible replacements first. Incompatible formats/governance need a separate migration plan preserving source records and lineage. Returning to an earlier team is allowed only if it can handle current state and permissions. Preserve post-switch facts; rollback cannot undo external effects. Otherwise hold safely and repair forward.

**Seamless** means the same company and founder conversation, with no founder rebriefing. A brief controlled pause may be necessary. The promise is checked, recoverable continuity, not zero risk. Prompts alone cannot enforce this protocol.

## 8. Acceptance and one example

These are required behaviors to test, not claims that the prototype implements them:

| Founder story | Observable acceptance |
|---|---|
| Start once and delegate | Idea → necessary decisions in the same conversation → authorized experiment → independent result, without specialist setup or forwarding |
| Make only reserved decisions | QA rejection routes to its owner and independent retest; a scope/exposure packet reaches the founder with author and dissent intact |
| Understand and control progress | Status cites evidence/blocks; pause exposes in-flight work; resumed work respects updated Intent and permissions |
| Know readiness | Launch/funding evidence and authorization remain separate; missing proof stays visible |
| Recover a role or replace a team | A successor reviews a submitted artifact without rebriefing, preserving failed checks, limits, obligations, and due reviews |
| Survive replacement failures | Reject incompatible candidates and stale outgoing writes; reconcile unknown external outcomes before retry; exercise recovery without deleting post-switch facts |

**Illustrative simulation, not observed evidence:** BriefLink lets freelancers send a client-brief form and read answers. One Engineer suffices. All contracts are independently approved before collection.

1. **Frame/Problem:** the founder authorizes bounded discovery. Research records six of eight recent workarounds against a five-of-eight threshold; PM accepts the evidence and narrows Product to solo freelancers.
2. **Solution:** Design provides the prototype; four of five complete it unaided, three commit real projects, two pay against those predeclared conditions: Pass. Engineering records feasibility; QA prepares acceptance. Before paid collection, Legal/Security assess the envelope: twenty freelancers, ordinary contact/project-brief data excluding sensitive categories, $25/user and $100 total, terms T1, thirty days. Legal labels T1 agent-assessed with sources and uncertainty; required professional-review gaps would hold collection. The founder packet recommends this focused pilot over wider agency scope (estimated two extra weeks) or more discovery; recruitment waits for the decision. The founder authorizes the envelope; client data waits for Build Pass.
3. **Build:** Engineer submits C1. QA finds that a submission link reveals prior answers; Security records the invariant and blocks release. Engineering repairs C2; independent QA/Security retest it. Release owns recovery/routine support, independently verified by QA. C1 approvals cannot authorize C2. The repair needs no founder interruption; its postmortem adds a regression evaluation.
4. **Pilot/Launch:** Pilot requires three users, 80% unaided completion, two repeats/two paying, and no critical defect. Research records four users, 10/12 completions, three repeats, two paying, zero critical defects: Pass. Finance reconciles costs; Growth links claims. Launch requires a verified anonymous journey, delivered alert, demonstrated rollback, substantiated claims, and accepted mandatory reviews; independent checks demonstrate each: readiness Pass. Legal/Security first assess a separate public envelope of one hundred freelancers, the same data/T1, $25/user and $500 total, thirty days. A founder packet authorizes that envelope; software enforces its caps/expiry. Release deploys C2 and verifies the live journey. Funding remains unpassed because its contract requires channel evidence not yet collected.
5. **Replacement:** a new Engineer—or candidate team—must recover C2, the access invariant, current exposure limits, block/review state, and next action from company records. Missing a cap fails the cold-start check and requires spec repair. Whole-team transfer follows section 7; founder rebriefing does not patch missing company memory.

The founder receives discovery, paid-exposure, and public-launch decisions. Domain work and the security repair remain with the team. Exact thresholds, budgets, reviewer assignments, and envelopes are company-specific Frame decisions, not defaults borrowed from this example.
