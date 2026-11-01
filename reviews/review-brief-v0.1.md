# Review brief: AI-operated startup v0.1

Read [v0.1](../specs/v0.1.md). Review it as an operating-system design, not as implemented software.

## Purpose

The system should let one human founder instantiate a conventional startup team of AI agents and progress from an idea to either public launch or funding readiness. The founder should not have to supervise execution details.

The author deliberately chose a middle level of detail: the first version was too elaborate; a shorter version removed too much operational substance. Preserve that balance. Prefer the smallest change that fixes a real problem.

## What to review

1. **Role necessity:** Does each seat genuinely have distinct judgment, an owned spec, and legitimate blocking authority? Are any ordinary tasks being promoted into unnecessary roles?
2. **Authority:** Can agents act decisively within their charters? Are ownership, handoff acceptance, independent review, domain resolution, and founder override consistent?
3. **Founder attention:** Do only direction, material scope, deadlocks, overrides, uncovered authority, major money, legal exposure, and irreversible actions reach the founder? Could the protocol accidentally create excessive escalation?
4. **Evidence gates:** Can a reviewer determine what passes, what fails, and what passing authorizes? Can the funding route support different financing stages without disguising missing evidence?
5. **Spec discipline:** Is load-bearing truth brief, canonical, versioned, and maintained? Do lifecycle rules prevent drift and unbounded growth?
6. **Accountability:** Are decisions checked against outcomes without punishing sound judgment merely for bad luck? Who can change delegation, and can a role evade responsibility?
7. **Failure and replacement:** Would missing agents, contested specs, stale approvals, and adverse outcomes become visible? Could a replacement continue without private context?
8. **Worked example:** Does it actually exercise the rules? Look for unsupported gate claims, missing artifacts, hidden founder decisions, or a requirement weakened to excuse a defect.

## Requested output

- Start with a short verdict: coherent enough to trial, or blocked by specific design gaps.
- Report only material contradictions, missing decisions, and unnecessary complexity. Cite the relevant section for each finding.
- For each finding, give the failure scenario and the smallest practical correction.
- Distinguish a required fix from a preference or an optional enhancement.
- Where a choice is genuinely open, give the options and recommend one.
- End with the three most valuable changes for v0.2, or fewer if fewer are warranted.

Do not rewrite the entire spec, implement software, or modify the v0.1 baseline. Put review findings in a separate response or review file.
