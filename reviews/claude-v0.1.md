## Verdict

**Coherent enough to trial, with required fixes before it is relied on past Build.** The seat discipline, the three-way separation of deciding, accepting and reviewing, the "requirement is not weakened" example, and the rule that software never invents a verdict are all worth keeping. The gaps below are mostly missing owners and missing definitions, not wrong structure. Findings are cited by v0.1 section.

## Required fixes

**1. Process judgment has no owner.** §2 (“Coordination… is software”), §3 (cold-start test), §4, §6
- **Scenario:** At a gate, software confirms the records exist. Nobody judges whether the pack is complete, writes the cold-start questions, assigns the “independent reviewer,” or decides whether a founder packet is decision-grade. Nobody changes a role’s autonomy either. In practice authors pick their own reviewers, or the founder becomes the default. Founder redirections spoken in chat never reach Founder Intent, which is the founder’s own listed failure mode with no countermeasure.
- **Options:** (A) A **Steward review seat**. It owns charters in force, ceilings, reviewer assignments and the delegation ledger, and may block a gate or reject a malformed packet. It has no domain authority and is active only at gates, packets and delegation changes. (B) Give these duties to QA & Eval.
- **Recommend A.** B overloads QA and has QA verifying gate artifacts that include its own. A passes the author’s own seat test, and it covers judgment, not the mechanics §2 correctly leaves to software.

**2. Gates are not yet decidable.** §5, §7
- **Scenario:** §5 says to declare “permission gained,” but the table has no such column, so a reviewer cannot tell what Pilot or Public launch authorizes. Fail and Blocked are undefined, so a Fail can be relabeled Blocked to avoid a return. No reviewers are named, so Research’s own evidence is effectively self-graded. The Launch row says “Passed after public-exposure authorization,” which blurs whether evidence or founder consent opened the gate. A founder exception also has no expiry and could stack into a pass.
- **Fix:** Add **Permits** and **Independent reviewers** columns. Define Pass as declared conditions met with no open Hard block, Fail as evidence that contradicts or falls short, and Blocked as a stated block or missing review. Founder authorization follows Pass and never substitutes for it. An exception names one action and an expiry, and a second exception on the same gate forces re-declaration.

**3. Pilot is external exposure with no founder envelope.** §5 (Build and Pilot rows), §2, §7
- **Scenario:** Build’s founder involvement is “exceptions only.” Agents then onboard real freelancers, handle their clients’ brief data and take payment, since the example has “two paying users.” Legal and Security first appear before public launch. §1 reserves legal exposure and money to the founder, yet this decision never surfaces. It is the hidden founder decision in the example.
- **Fix:** Frame or Solution authorizes a bounded **exposure envelope** in Founder Intent: maximum users, data types, money collected, and terms. Pilot entry requires Legal and Security review of that envelope, and anything outside it is a packet.

**4. The funding route can disguise missing evidence.** Intro, §5 (last row and branch note)
- **Scenario:** “Stage-appropriate” is circular, and “missing proof stays labeled” can be read as permitting a pass. An agent labels E1 market claims as assumptions and declares an early raise ready. A reviewer cannot say that is wrong.
- **Options:** (A) Fixed stage presets with minimum grades per claim class. (B) Declare the target stage when the gate is declared, and for each claim class in the financing case (problem, market, traction, economics, ownership/IP) state the minimum evidence grade it will assert. A claim below its minimum may appear only as a labeled assumption, and the pass condition lists which classes may be assumptions at that stage.
- **Recommend B** with a short non-binding default table, since presets age quickly. Also state that investor representations, signatures, filings and binding instruments are performed by the founder or licensed humans.

**5. Conflict ladder: three ambiguities.** §4, §2 (Override rule)
- **Scenario:** (a) “Founder if a genuine block remains” sends every unmet QA check to the founder, which is exactly the escalation inflation §1 forbids. (b) When Security blocks a design, “domain authority” is Security itself, and “second review” has no defined reviewer. (c) A PM-versus-Designer dispute spans two charters with no precedence rule.
- **Fix:** A block stands until cured or overridden. Only an override request, or a dispute over whether the block is within charter, reaches the founder. For non-block disputes, the owner of the spec the decision would change decides, and if it spans several or none, it is uncovered and goes to the founder. “Second review” means a different reviewer than the first.

**6. A block held by a stalled agent.** §4 (heartbeats)
- **Scenario:** “Silence never means approval,” so a disappeared blocker’s block holds forever, and nothing says who replaces the agent.
- **Fix:** A replacement instance inherits the block and must reaffirm it within one cycle. Otherwise it becomes a founder packet. Software opens the replacement from the charter and notifies the founder without asking.

**7. “Major” and “material” are unparameterized, and the founder list is incomplete.** §1, §2
- **Scenario:** One agent treats a $400 tool as a major commitment and another does not, and a role over-escalates to shed responsibility. §1 also omits block overrides and the founder’s right to pause or replace any agent, which v0.1 assumes but never states.
- **Fix:** Founder Intent carries the thresholds set at Frame: money per commitment and cumulative, exposure categories, an irreversibility list, and a definition of scope change. Below threshold, the agent decides and logs. Add overrides and pause/replace to the §1 list.

**8. Activation contradicts the phases.** §2 table vs §5
- **Scenario:** “QA core from validation” names no phase. If QA starts at Pilot, Build’s independent acceptance has no independent party, or QA writes criteria after seeing the implementation. The Engineer is “core during build,” yet Solution requires “bounded feasibility.”
- **Fix:** Map activations to the seven gate names. The Engineer is light at Solution and full at Build. QA starts at Solution, declares acceptance criteria before build, and is full at Build.

**9. Accountability can be evaded.** §6
- **Scenario:** “Consequential” is undefined, so roles classify decisions as routine and nothing detects the omission. “No role expands its own permissions” never says who does. A single unlucky outcome could contract autonomy.
- **Fix:** Define consequential with four triggers: changes a spec clause, exceeds the role’s ceiling, creates external exposure, or accepts risk or overrides a block. Add a software invariant that every spec version change and gate record cites a decision ID, with unmatched changes flagged. The outcome reviewer proposes delegation changes and the Steward approves them within founder ceilings. Autonomy contracts only for process violations or repeated miscalibration across comparable decisions, never for one sound-but-unlucky result.

## Preferences and optional items

- **Spec numbers (preference).** §3 requires “explicit” budgets but sets none, and says nothing about what expiry does. Ship tunable defaults (for example a 10-minute read and 15 active decisions per spec). Define expired as “unconfirmed,” so a dependent gate cannot pass until reaffirmed.
- **Support seat (optional).** §2 passes the seat test weakly: it can only block exposure lacking failure handling, and it overlaps Release and Growth. Keep Support Readiness as a section of Release & Operations until paying users or volume trigger a separate seat.
- **Worked example (§7).**
  - *Required for consistency:* the Launch row has no declared numeric conditions, which contradicts §5.
  - *Preferences:*
    - The packets lack evidence links and quantified cost of waiting, and “build immediately” is not a real option under the gates.
    - The access-leak near miss never enters the mistake loop, and the stale first-candidate approval is not shown.
    - The funding route is never exercised, so add a short run with claim grades.

## Three most valuable changes for v0.2

1. **Make gates decidable.** Add Permits and Reviewers columns, define Fail vs Blocked and exception expiry, add the pilot exposure envelope, and add per-claim minimum grades for the funding gate (findings 2, 3, 4).
2. **Name the owner of process judgment and delegation changes** (findings 1 and 9).
3. **Parameterize founder escalation and fix the ladder** (findings 5, 6 and 7).