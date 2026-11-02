# A durable company, operated by a replaceable team

**Requirement:** A founder initiates a virtual company for an idea once. A versioned team of AI agents operates it, with each role in a standalone session. The founder can replace one role or the entire team while the same company, founder interface, obligations, and working history continue.

**Promise:** Preserve company continuity through a checked, recoverable handover. Zero risk is not a defensible promise; external actions and incompatible changes may require a hold or explicit migration decision.

**Seamless** means the same company, records, and founder conversation, with no founder rebriefing. It does not require uninterrupted agent execution during transfer.

**Status:** Design requirement. The current workspace generator does not implement team replacement, access revocation, migration, or rollback.

## Three separate lifecycles

| Layer | Contains | Lifecycle |
|---|---|---|
| **Company** | Stable identity; founder intent; approved constraints; specs; evidence; decisions; product/code/data; resource references; open work, blocks, obligations, and pending external actions | Survives every team and session replacement |
| **Team version** | Role definitions, collaboration protocol, evaluations, platform adapters, and declared compatibility with company records and governance | Evolves through reviewed releases; adopted explicitly per company |
| **Role sessions** | Instances of individual roles, each with an attributable identity and bounded authority | Start, stop, resume, or are replaced as needed |

Company truth belongs in durable records, not in agent conversation histories. A small current-state checkpoint links the necessary evidence and history so successors do not have to replay everything.

Each company adopts a team version independently. Publishing a better team does not silently upgrade every company. A team release also cannot redefine founder intent, clear blocks, rewrite evidence, or expand authority merely by being installed.

## Replacement protocol

1. **Prepare.** Pin the candidate team version and compare its required record formats, capabilities, and governance assumptions with the company. Identify any changes to authority or behavior that need founder approval.
2. **Prove continuity.** Give candidate role sessions read-only access to a checkpoint. The charter-named qualified non-author reviewers verify current objectives, constraints, open blocks, pending reviews, and next permitted actions, then record a takeover verdict. Candidates may propose results; they cannot self-approve, alter company state, or act externally during this check.
3. **Reach a safe boundary.** Stop new dispatch to the outgoing team. Finish, cancel, or reconcile in-flight work and external actions. Record outcomes that remain unknown; do not retry them blindly. Capture a final checkpoint and refresh candidate checks against changes since the earlier snapshot.
4. **Transfer authority.** The control layer revokes outgoing write/action authority before enabling the incoming team. Only one team has write authority for a given company work scope. Late results from old sessions are quarantined for review, never applied automatically.
5. **Resume and observe.** Start the incoming standalone sessions with the same company records and unresolved obligations. Verify the first bounded work against accepted criteria. Preserve the checkpoint and a declared recovery route.

This is workflow software and existing review responsibility, not a new coordinator agent seat. The founder requests or authorizes the replacement through the same conversation and receives additional packets only for reserved changes or unresolved risk.

## Limits that matter

- **No double execution.** Stable action identifiers and durable status records must prevent a restarted or replacement session from repeating an already-completed external action. Unknown outcomes require reconciliation.
- **No hidden authority expansion.** Founder ceilings and legal/exposure boundaries remain in force. Prior performance stays attributed to the team that earned it; additional delegation transfers only when the review supports it.
- **No destructive upgrade.** Migrations preserve source records and lineage. The first implementation should support compatible replacements; an incompatible record format or governance change needs a separate migration plan.
- **Rollback is conditional.** Resume an earlier team only if it can safely interpret the current records and permissions. Preserve post-switch facts. Switching back cannot undo money spent, messages sent, customer commitments, or other external effects. Otherwise use a safe hold and a forward repair.
- **Continuity does not require uninterrupted dispatch.** A short pause may be necessary to establish the boundary. The operating product may continue where its existing controls permit it.

## Acceptance checks

- Replace the whole team after an artifact is submitted but before review; the incoming team completes the correct review without founder rebriefing.
- Preserve a failed check, a founder-imposed limit, and a due outcome review across replacement; none disappears or becomes approved.
- Submit a late write from an old session after transfer; reject it even if the old process is still running.
- Interrupt an external action with an uncertain outcome; prevent duplicate execution until reconciled.
- Reject a candidate that cannot pass the cold-start or compatibility checks while keeping the outgoing team or safe hold available.
- Exercise the declared recovery route without erasing post-switch evidence or pretending irreversible actions were undone.

See [the founder user stories](user-stories.md) and [the single founder conversation](founder-interface.md). The next runtime must make these properties enforceable; prompt instructions alone are insufficient.
