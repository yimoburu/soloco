# Design history

These files preserve original intent and review evidence. They are historical snapshots, not additional current rules. [SPEC.md](../SPEC.md) is the reconciled design; company workspaces retain whatever governance they explicitly pinned.

| Record | Meaning at the time |
|---|---|
| [Original brief](original-brief.md) | Founder intent and requested design coverage |
| [v0.1](specs/v0.1.md) | Agreed initial design baseline |
| [Claude v0.1 review](reviews/claude-v0.1.md), [disposition](reviews/v0.2-disposition.md), [v0.2 draft](specs/v0.2-draft.md) | First review and proposed corrections |
| [Claude v0.2 review](reviews/claude-v0.2.md), [disposition](reviews/v0.3-disposition.md), [v0.3 draft](specs/v0.3-draft.md) | Second review and proposed corrections |
| [Review brief](reviews/review-brief-v0.1.md) | Scope of the original review |
| [Founder interface](docs/founder-interface.md), [user stories](docs/user-stories.md), [company continuity](docs/company-continuity.md) | Subsequent intent clarifications, now consolidated into the current spec |
| [v0.4 snapshot](https://github.com/yimoburu/ai-operated-startup/blob/c32a20d95f794df0cc435b15d08a758c61dfbacd/SPEC.md), [Claude review](reviews/claude-v0.4.md), [v0.5 disposition](reviews/v0.5-disposition.md) | Reconciled design, external review, and narrowly adopted corrections |

## v0.9 plugin distribution — 2026-11-02

At the founder's request, installation is now specified as one Company plugin distributed through a small GitHub marketplace catalog for the existing app plugin mechanisms. The package combines shared guidance, templates, company engine, and host adapters; the Python materializer remains an internal helper. Installation owns dependencies and readiness verification. No new marketplace website is required, and no catalog, plugin, runtime, or working installation command is claimed to exist yet.

Company records remain outside plugin installation/cache directories. Updates make candidates available without silently adopting new company rules; uninstall preserves company records. The converter guide records current platform constraints and source links separately from the durable spec. Converter v0.7 updates generated guidance only. The [v0.8 snapshot](https://github.com/yimoburu/ai-operated-startup/blob/6b05ad1/SPEC.md) preserves the prior design; the constitution, evidence gates, and authority-transfer procedure are unchanged.

## v0.8 conversational startup — 2026-11-02

The founder rejected manual initialization prompts and per-role startup as the product experience. The GitHub README must first provide versioned installation and a readiness check; until then it labels the developer trial honestly. After one-time framework installation, the required flow is now create project, attach company folder, open a chat, and talk. The first message starts the Chief of Staff, which interviews adaptively, challenges assumptions, preserves unknowns, prepares records, and activates specialists. Startup resumes existing companies and recovers partial state without overwriting records or creating a competing Chief of Staff. The founder authorizes the bounded experiment; starting a chat grants no execution permission.

The [v0.7 snapshot](https://github.com/yimoburu/ai-operated-startup/blob/6b694e3/SPEC.md) preserves the prior design. Converter v0.6 updates the Chief of Staff brief and labels all manual setup as developer preview; it implements neither the installer nor automatic startup. The constitution, evidence gates, and five-step handover procedure remain unchanged. Existing companies retain their pinned rules.

## v0.7 founder and collaboration reconciliation — 2026-11-02

The founder accepted the subsequent architecture discussion and requested reconciliation. The coordinator is now named Chief of Staff while retaining technical role ID `runner`. Direct peer communication, software as supporting infrastructure, work/exposure-based activation, independent role qualification, disposable agent memory, and one persistent company folder are explicit. Both interfaces may open the same folder; concurrent execution requires common authority and write controls, and remains outside the manual prototype.

A durable founder inbox separates must-know notices from decision requests and delivery from authorization. A shared communication profile distinguishes explicit preferences from tentative inferences; personalization cannot suppress required notices or alter authority. These records survive replacement. Cross-product continuity preserves the company without promising an identical chat window. The constitution and five-step authority-transfer procedure remain unchanged.

Converter v0.5 emits matching Draft records, instructions, and an activation guide; it still launches no sessions and implements no automatic delivery, learning, or enforcement. The [v0.6 snapshot](https://github.com/yimoburu/ai-operated-startup/blob/f398775/SPEC.md) preserves the previous design. Existing companies are not silently upgraded.

## v0.6 coordination decision — 2026-11-02

At the founder's direction, Team Runner is now a standalone Operations Lead agent in the existing founder conversation. It owns sequencing, dependencies, Frame preparation, and recovery judgment; PM keeps product priorities and specialists keep domain verdicts. This replaces the earlier software-only coordinator choice, not the constitutional limits on authority. Software still enforces execution checks, direct founder pause, and delivery of specialist decision packets. Runner cannot approve itself or suppress dissent and must be replaceable from company records.

The seven constitutional articles and company-replacement protocol are unchanged. Converter v0.4 emits the new proposed role and Operations spec but implements no live orchestration. Existing companies are not upgraded. The [v0.5 snapshot](https://github.com/yimoburu/ai-operated-startup/blob/4eb2727e7fcc16fc131077fc93e04710785f802b/SPEC.md) preserves the previous design; historical documents remain evidence rather than current rules.

## v0.5 clarification — 2026-11-02

The seven constitutional articles and company-replacement protocol are unchanged. The revision assigns failed-gate disposition and founder-instruction recording, qualifies founder packets, makes the Frame professional-review policy explicit, and strengthens funding approval rationale. The example now shows authorization before payments and distinct author/reviewer instances. [The disposition](reviews/v0.5-disposition.md) records accepted findings, narrower remedies, and deferred preferences.

Converter v0.3 mirrors those requirements in proposed charters and blank record starters. It still prepares files only; existing workspaces are not upgraded. v0.4 remains available at the immutable commit above rather than as another current spec.

## v0.4 reconciliation — 2026-11-02

The user's request was to reconcile the whole repository around the essentials. The current spec combines v0.3's review corrections with one founder conversation, standalone role sessions, and a company that survives whole-team replacement. The role roster and spec stack now share one table; acceptance and one concise simulation live with the requirements. Repeated interface, continuity, and user-story documents move here unchanged.

Preserved safeguards include independent contract approval before evidence collection; candidate-specific permission and exposure limits; bounded Blocked states; non-party reviewers/arbiters; direct founder packets; legal-review provenance; outcome-based delegation; compact-spec lifecycle checks; and checked team handover with stale-write rejection and external-action reconciliation.

The generator now defaults to the reconciled spec for **new** workspaces, retaining byte/hash pinning and Draft authority. Release/Support ownership is aligned with that contract. Company records remain colocated with team files in the manual prototype; automatic coordination, durable authority enforcement, and team replacement are still requirements rather than implemented capabilities.

This consolidation does not retroactively label the earlier drafts approved or upgrade existing companies. Further edits should update the current spec, preserve review provenance, and keep claims of implementation tied to actual checks. The reading budgets and PM/QA process split remain trial choices; adding a new rule or role needs a concrete reason.
