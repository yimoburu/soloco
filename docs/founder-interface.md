# One founder conversation

**Requirement:** The founder interacts with the venture through one conversation. Separate role sessions are an internal execution detail. The founder does not relay messages, paste handoffs, select the next worker, or open each role's chat to keep work moving.

**Implementation status:** The workspace generator exists. The automatic runner and unified founder conversation described here are not implemented yet. Manual role sessions are a development/testing workflow, not the intended founder experience.

**Immediate entry point:** With this framework available in the project, the founder initiates once in their existing Codex or Claude Code conversation: "Start a virtual company for this idea." That conversation remains the founder interface. The first implementation uses the current environment; managed platform selection and mixed-platform teams are deferred. See [US-02 and the founder user stories](user-stories.md).

## Responsibilities

| Component | Responsibility |
|---|---|
| Governance spec | Defines role authority, evidence gates, founder-reserved decisions, and accountability |
| Converter | Prepares a venture workspace, pins governance, and creates platform instructions and role startup briefs |
| Shared board | Holds canonical specs, artifacts, versions, decisions, blocks, and accepted handoffs |
| Runner — software | Routes eligible work, starts/resumes role sessions, detects stalls, and applies recorded authorizations |
| Role sessions | Exercise judgment within their charters and publish attributable work and review verdicts |
| Founder conversation | Receives direction and reserved decisions; presents concise status and decision packets |

The runner is deterministic coordination software. It does not invent a domain verdict, waive a block, or become another agent seat.

## Founder experience

1. The founder initiates once with an idea in the current Codex or Claude Code conversation. Necessary constraints and the initial authority envelope are clarified there.
2. The team prepares its intent, charters, and first experiment. Necessary founder decisions return in that conversation.
3. Accepted board transitions route work to the next eligible role automatically. The founder never supplies a "continue as QA" or "tell Engineering to fix this" message.
4. A genuine reserved decision returns as a packet containing the decision, options, recommendation, evidence, and cost of waiting.
5. The founder's answer becomes an attributable decision. The runner resumes only the work that decision authorizes.

Routine work stays on the board. The founder can request status or opt into a digest. Pause, override, replacement, and direction changes are available through the same conversation, subject to the governance rules.

## Preserve domain independence

PM handles ordinary product clarification and synthesis. It does not acquire universal authority or control access to the founder. Any qualifying packet can reach the founder conversation with its author, recommendation, evidence, and dissent intact. PM may add context but cannot suppress or rewrite another role's packet.

The runner derives eligibility from accepted artifacts, pinned versions, reviewer assignments, and active authorizations. It preserves failed checks and blocks, routes repairs to their owners, and requests founder intervention only for founder-owned decisions.

## Acceptance checks for the next implementation

- After initial authorization, a Research → Product → Engineering → QA sequence advances without founder message forwarding or per-role prompting.
- A failed QA check returns to Engineering and receives independent re-review without routine founder interruption.
- A scope or exposure decision reaches the one founder conversation with the original role's packet and any dissent.
- A stalled role is recovered or replaced from its charter and shared records; its block never disappears because the session ended.
- Pausing stops new dispatch; resumption respects current permissions and versions.
- In the first implementation, one initiation in either supported environment prepares the venture and manages role sessions there, without a separate platform-selection step or repeated role setup.

Manual session startup may remain a debugging option. The intended product starts a venture once and manages role sessions as needed. Current generated prompts alone cannot deliver this behavior; a board service and runner are required.

Later mixed-platform support must retain one authoritative board and must not require the founder to transfer context between environments.
