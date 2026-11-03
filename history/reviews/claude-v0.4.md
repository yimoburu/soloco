## Verdict

**Coherent enough to trial, with six required fixes first.** Most of the v0.2 gaps are closed: gate contracts are approved by a non-author and then frozen, Blocked has a deadline and converts to Fail, block-validity disputes go to a non-party arbiter, PM and QA are walled off from their own permissions, the public envelope is separate from the pilot envelope, and Legal findings carry provenance labels. The remaining problems are mostly routing and ownership gaps. I reviewed only the pasted v0.4. The linked converter and history files were not provided.

## Required fixes

**1. A failed evidence gate has no route.** §5, §2
- **Scenario:** Problem fails (three of eight show the workaround). Nothing says who decides to persevere, pivot or stop. The team can use the Blocked clause's "independently approved replacement contract" to reset the bar and pass on a second attempt. The v0.2 table's founder-involvement column was dropped, and with it the founder's gate decisions.
- **Fix:** A measured Fail at Problem, Solution or Pilot opens a direction packet (revise and retry, pivot, or stop), unless the failure is a repairable defect. A replacement contract after a measured Fail needs founder authorization, and the packet shows the original contract and result. State that the replacement-contract exception covers missing delivery only, not measured failure.

**2. The founder conversation has no owner for recording direction.** §2, §3 (Founder Intent failure mode)
- **Scenario:** The founder says in chat, "actually target agencies." Nobody is chartered to write it into Intent, so the team works from the old Intent, or the interface session records its own interpretation.
- **Fix:** Charter the founder-facing session narrowly. Its only authority is to transcribe founder statements into proposed Intent amendments, echoed back for one-line confirmation, and to present status and packets. It holds no domain authority and is not a coordinator seat.

**3. Packet qualification has no check in either direction.** §2 vs §1, §6
- **Scenario:** "Any role can submit a qualifying packet," PM cannot suppress, and "cannot escalate merely to avoid responsibility" has no enforcement. An agent escalates an in-charter call and the founder's inbox fills.
- **Fix:** The packet cites its reserved class and software checks the fields. Outcome review also asks whether each packet was truly reserved, and repeated unreserved packets contract that role's delegation for the decision type.

**4. "Professional review required" is decided by the agent being checked.** §3, §8 step 2
- **Scenario:** Legal labels T1 agent-assessed. The paid, third-party-data pilot launches without a lawyer, and "founder's risk policy" is an undefined term. The example avoids the question with "gaps would hold collection."
- **Fix:** The charter lists default triggers: binding third-party terms, payments, personal data beyond ordinary contact data, regulated domains, and investor communications. Legal may add triggers, but downgrading one needs the non-party arbiter. Define the risk policy in Frame's ceilings. The example must state T1's status: reviewed (via a money packet) or the envelope narrowed.

**5. Funding can pass on a thin case.** §5 funding branch
- **Scenario:** The contract marks demand as a permitted assumption, a non-Finance reviewer approves it, and the pack passes. The reviewer has no stage reference to judge whether that bar is reasonable.
- **Options:** (A) fixed stage presets, (B) a short non-binding reference of what a pre-seed or seed case typically evidences, plus a **disclosed-gaps list** in the pack for anything below it. **Recommend B.** Presets age quickly. Pass means "outreach may begin with these disclosed gaps," not "claims verified," and no claim the case relies on to argue investability may be a permitted assumption.

**6. Worked example: three inconsistencies.** §8, §5
- **Hidden founder decision:** In step 1, PM narrows to solo freelancers. In step 2, the founder packet decides the focus. Make step 1 a recommendation.
- **Exposure ordering:** The Solution result counts two payments, yet the Legal/Security review and the envelope packet appear only after the Solution Pass, though §5 requires review before paid commitments. Move the Solution-stage envelope into Frame, or show it authorized before collection.
- **Self-review:** Research records the pilot data and "checks usage." Finance reconciles costs and checks economics. Growth links claims and reviews launch. The gate table names roles as reviewers, which invites this. Rename the column "independent reviewer (not the author)" and name who verifies in the example, using linked live records for the data.

## Preferences and optional items

- **Unnecessary complexity, §7 (recommended):** The five-step whole-team replacement is heavy for a design whose converter only generates files. Keep a paragraph stating the contract (checkpoint, takeover verdict, authority revocation before grant) and move steps 3–5 into the converter document.
- **Runner trust, §4 (preference):** Software holds the authority to dispatch and to revoke or grant it. Have it check structural independence (reviewer is not the author and is listed in the charter), refuse any external action or spend without a decision ID, and treat its own rule changes as charter-level amendments.
- **Independence, §5 (open choice):** (A) Fresh session from records only, (B) also a different model family where available. **Recommend B for QA and Security reviews** when a second family exists, since same-family reviewers share blind spots.
- **PM reviewing Research at Problem, §5 (preference):** PM is an interested consumer. Use QA or an independent Research instance, with PM as consumer.
- **Budgets, §6 (preference):** Use tokens, not minutes, and define "decision" as an active clause. Define demonstrated miscalibration as, for example, at least three comparable reviewed decisions.
- **QA concentration, §3, §5 (optional):** QA approves contracts, checks completeness, prepares cold-start tests and authors acceptance. Watch for a bottleneck, and split contract approval to another reviewer if one appears.
- **Example coverage, §8 (preference):** It never exercises an outcome review (judgment versus luck) or a cold-start failure, and it omits the funding contract's approval. Add one line for each.

## Three changes for v0.5

1. **Route evidence failures to a founder direction decision** and block bar-resetting after a measured Fail (finding 1).
2. **Give founder direction an owner and put a check on packets,** so the inbox holds only reserved decisions (findings 2 and 3).
3. **Close the integrity gaps:** Legal trigger list, the funding disclosed-gaps floor, and the example's ordering and self-review (findings 4, 5 and 6).