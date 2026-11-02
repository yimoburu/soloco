# Founder user stories

The central story: **As a founder, I want to give the team a goal and receive evidence-backed results through one conversation, without managing individual agents.**

## Immediate experience

With the framework available in the project, the founder opens either Codex or Claude Code and initiates once:

> Start a virtual company for this idea: [idea].

That existing conversation becomes the founder interface. The first implementation works within the environment already in use; no platform-selection screen, mixed-platform team, or separate setup product is required. Necessary founder questions remain in that conversation. Automatic role-to-role coordination remains a core requirement.

US-01 and US-02 are parts of this same initial conversation, not separate onboarding flows.

| ID | User story | Done when |
|---|---|---|
| **US-01 — Start a venture** | As a founder, I want to describe my idea in plain language so the team can turn it into a clear, bounded undertaking. | The team drafts intent, identifies unknowns, proposes the first experiment, and asks me only for direction and necessary operating limits. |
| **US-02 — Initialize once** | As a founder, I want to initiate my virtual company once in the Codex or Claude Code conversation I am already using, so I can start from my idea without setting up individual agents. | The system prepares the workspace and necessary roles in the current environment. This conversation remains my founder interface; no per-role setup, message forwarding, or repeated initialization is required. Missing founder-owned inputs are requested here. |
| **US-03 — Delegate an outcome** | As a founder, I want to say "validate this idea" or "build the first feature" so the team handles the work and coordination. | Roles receive assignments, publish artifacts, accept handoffs, and perform independent reviews without me forwarding messages or prompting each next role. |
| **US-04 — Make only my decisions** | As a founder, I want interruptions limited to decisions that require my authority so I can focus on the venture. | Routine defects return to their owners. Material scope changes or overrides reach me with options, trade-offs, a recommendation, and the cost of waiting. My answer resumes the appropriate work. |
| **US-05 — Understand progress** | As a founder, I want to ask "Where are we?" so I can understand progress without reading every session. | One answer explains the current phase, demonstrated evidence, open blocks, and next milestone. Claims link to supporting records; uncertainty stays visible. |
| **US-06 — Steer and control** | As a founder, I want to change direction, adjust limits, or pause work so the team remains under my control. | Changes are recorded and affected work is reassessed. Pausing stops new assignments and shows work still in progress. Resuming follows current authority and spec versions. |
| **US-07 — Maintain continuity** | As a founder, I want the team to recover from stalled or replaced agents so I do not reconstruct their context. | Replacements continue from shared records. Blocks and permissions survive replacement. I am involved only when recovery requires a founder-owned decision. |
| **US-08 — Know when we are ready** | As a founder, I want an evidence-based recommendation about launching or raising funds so I can decide confidently. | Readiness follows independently reviewed gate results. Missing proof and risks are explicit. Readiness and authorization to proceed are recorded separately. |
| **US-09 — Improve the operating system** | As a founder, I want to adopt better versions of the team's rules without losing the venture's history. | Proposed changes and effects are reviewable. Approved upgrades preserve decisions, evidence, unfinished work, and valid blocks. Existing teams never change silently. |

## Deferred: managed environment selection

The earlier US-02—choosing Codex, Claude Code, or both through a managed team-setup experience—is a future requirement. Platform selection, switching, and mixed-platform teams should not delay the single-environment founder flow.

## First end-to-end acceptance

**One initiation with an idea → necessary founder decisions in the same conversation → team prepares and conducts an authorized experiment → independent review → one evidence-backed result.**

The founder never opens specialist chats or relays their work. A routine defect is repaired internally; a genuine reserved decision reaches the founder conversation as a packet.

**Current status:** The generator prepares workspace files and role briefs. The once-initiated, automatically coordinated experience is a requirement; the runner and founder-conversation integration remain to be implemented and tested.
