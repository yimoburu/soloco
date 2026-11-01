## Verdict

**Coherent enough to trial, with one design gap to close first (gate contracts have no independent approver).** v0.2 closes most of the earlier findings: the Permits column, Pass/Fail/Blocked and exception expiry, the exposure envelope, activation mapped to phases, founder thresholds set at Frame, stalled-agent block inheritance, the delegation approver, and the funding claim classes. Rejecting a Steward seat is defensible. It only works if PM's new process duties are walled off from PM's own interests (finding 3), and I'd now recommend that over adding a seat. The findings below are what remains or is newly introduced.

## Required fixes

**1. Nobody independently approves a gate contract.** §5 intro and Funding branch
- **Scenario:** The claim owner declares the thresholds, and a low bar ("three freelancers") or a permissive funding class ("assumptions permitted" for demand) is set before results, so a Fail can never occur. In the funding branch, Finance and the founder both declare and prepare.
- **Fix:** The claim owner drafts the contract. A named non-author approves it before data collection (QA by default, Research for demand claims, a non-Finance reviewer for funding class minimums). It is then frozen; any later change is a new contract, logged. A class marked assumption-permitted may appear only as a labeled assumption, never asserted as fact.

**2. Blocked has no exit.** §5 definitions
- **Scenario:** Evidence is never gathered, or is withheld, and the gate sits Blocked indefinitely. Nothing is visibly failing, and Fail is avoided.
- **Fix:** A Blocked verdict names the missing item, an owner and an expiry. At expiry it becomes Fail, or a packet to change the contract.

**3. PM's process authority conflicts with PM's own role.** §2 “Process judgment”, §4 packets, §6 delegation
- **Scenario:** PM, a party to a scope dispute, quality-checks and routes the packet about it, and can delay or soften it. PM also assigns reviewers for PM-authored artifacts and approves delegation for roles it depends on. QA checks gate completeness on gates that contain QA's own results. Art. 4's rule that authors cannot supply independent approval is violated in practice.
- **Fix:**
  - Software validates the packet template. PM may comment but cannot hold a packet, and any party may attach a one-line dissent.
  - Reviewers for PM- and QA-authored artifacts come from the charter, not from PM.
  - PM's and QA's own permissions go to the founder.
  - A named non-author checks completeness for gates that include QA evidence.
- **Open choice:** keep PM and add these walls (recommended, smallest), or add a Steward gate seat if the trial shows PM conflicts recurring.

**4. Block-validity disputes have no non-party arbiter.** §4 ladder
- **Scenario:** An Engineer says Security's block is outside charter. “Owner of the spec being changed” is the Engineer, so the blocked party rules. The alternative path, “charter dispute” to the founder, turns every contested block into a founder packet, which is the escalation inflation §1 forbids.
- **Fix:** The charter text decides whether a block is in scope, and a named non-party reviewer rules on ambiguity. The founder gets it only if the charter is silent or an override is requested.

**5. No licensed-human boundary for legal conclusions.** §2 Legal row, §5 envelope, §7 packet 2 (“reviewed terms T1”)
- **Scenario:** An agent “clears” terms and a privacy notice that bind real users and collect money, and the founder reads “reviewed” as lawyer-reviewed. “Unsupported certainty” is named as a failure mode, but nothing controls it.
- **Fix:** Legal labels every condition as agent-assessed or licensed-review-required. Terms binding third parties, payments, personal data beyond ordinary contact data, and regulated domains default to licensed review. Whether to pay for that review is a founder legal-exposure packet. State this beyond the funding branch's signature rule, and say in the example who reviewed T1.

**6. Worked example: public launch quietly exceeds the pilot envelope, and one author self-reviews.** §7
- Packet 3 recommends launching “within tested limits,” but the tested limits are twenty users, $100, terms T1 and thirty days. A public launch has none of those caps. No new envelope, Legal/Security review or founder approval of it is shown. **Fix:** the Launch contract declares the public envelope, trust reviewers assess it first, and packet 3 authorizes that envelope explicitly.
- Release owns recovery and support readiness, then “verifies C2 and recovery.” Name the non-author reviewer (QA or the Engineer).

## Preferences and optional items

- **Spec budgets (§3, preference).** Eight decisions per spec versus twenty per governing pack only works for a pack of two or three specs. Define “governing pack” and state the budgets in tokens, not minutes.
- **Instantiation steps (§6, preference).** They omit ceilings, envelope and reviewer map, which Frame sets. Add a pointer.
- **Stalled-instance alerts (§4, preference).** They go to PM, so route to the founder if PM is the stalled seat.
- **Example (§7).** Two preferences and one optional item:
  - Restore counts for the Solution and Launch results. “All met” is unsupported.
  - Show the independent reviewer classifying the failed recovery decision. Currently its author records the outcome.
  - Optional: one line showing the cold-start test failing or a spec expiring, since no spec-discipline rule is exercised.

## Three most valuable changes for v0.3

1. **Gate contracts:** independent approval before results, freezing, and Blocked with an owner and an expiry (findings 1 and 2).
2. **Process authority:** wall off PM and QA conflicts, and have a non-party rule on block validity (findings 3 and 4).
3. **Exposure integrity:** the licensed-review boundary, and a public-launch envelope in the contract and the example (findings 5 and 6).