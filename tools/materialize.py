#!/usr/bin/env python3
"""Materialize portable team workspaces without starting agent sessions."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile


ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.6"

# These are role starters, not extracted or approved interpretations of governance.
# The pinned spec governs; Frame must review the charters and authority map.
ROLES = {
    "runner": {
        "name": "Chief of Staff", "spec": "company-operations",
        "mission": "Coordinate the company through one founder conversation; judge sequencing, dependencies, and recovery within approved limits.",
        "inputs": "Founder instructions, approved charters, PM priorities, accepted work, blocks and session status.",
        "outputs": "Operating plan, role activation, assignments, recovery decisions, founder notices and communication preferences, and Intent updates attributed to the founder's source instruction.",
        "block": "Execution lacking required prerequisites or carrying conflicting assignments; never erase another role's block.",
        "success": "Accepted work reaches the right owner within limits without founder message forwarding.",
        "failure": "Overruling domain judgment or suppressing dissent to appear productive.",
        "phase": "Frame preparation onward; active when coordination judgment is needed.",
    },
    "pm": {
        "name": "Product Manager", "spec": "product",
        "mission": "Choose the smallest coherent scope that delivers value or resolves uncertainty.",
        "inputs": "Founder Intent, customer evidence, accepted constraints.",
        "outputs": "Product spec, priorities, feature acceptance criteria, decision packets.",
        "block": "Scope drift or work without accepted product requirements.",
        "success": "Accepted scope delivers the intended outcome or decision-quality learning.",
        "failure": "Confusing delivery with value.", "phase": "Frame onward, as needed.",
    },
    "research": {
        "name": "Discovery / Research", "spec": "evidence-market",
        "mission": "Distinguish customer evidence from assumptions and interpretations.",
        "inputs": "Research questions, intended population, source observations.",
        "outputs": "Evidence records, counterevidence, supported claims and limitations.",
        "block": "Unsupported claims being used as proof at a gate.",
        "success": "Claims trace to evidence, and uncertainty changes decisions.",
        "failure": "Treating stated interest as demand.", "phase": "Problem, Solution, new evidence questions.",
    },
    "designer": {
        "name": "Designer", "spec": "experience",
        "mission": "Make the intended outcome understandable and usable.",
        "inputs": "Product scope, research, technical and trust constraints.",
        "outputs": "Critical journeys, prototypes, usability and recovery requirements.",
        "block": "Failure of an accepted critical-journey requirement.",
        "success": "Intended users complete the agreed task.",
        "failure": "Attractive interfaces that fail the task.", "phase": "Solution and material experience changes.",
    },
    "engineer": {
        "name": "Software Engineer", "spec": "technical",
        "mission": "Implement a correct, feasible, operable system.",
        "inputs": "Product, Experience, quality and trust requirements.",
        "outputs": "Technical spec, implementation, feasibility and invariant evidence.",
        "block": "Infeasible work or broken technical contracts.",
        "success": "Accepted contracts hold under specified conditions.",
        "failure": "Happy-path correctness.", "phase": "Light at Solution, full at Build, maintenance.",
    },
    "qa": {
        "name": "QA & Eval", "spec": "quality-evaluation",
        "mission": "Independently judge acceptance and evaluation validity.",
        "inputs": "Accepted criteria, candidate artifacts, raw evidence and counterevidence.",
        "outputs": "Evaluation plan, reproducible results, independent verdicts.",
        "block": "Failed mandatory checks or invalid evaluations.",
        "success": "Acceptance verdicts are independently reproducible.",
        "failure": "Rubber-stamping the author's assumptions.", "phase": "Brief Frame/Problem reviews; Solution planning; Build onward.",
    },
    "architect": {
        "name": "Tech Lead / Architect", "spec": "technical",
        "mission": "Resolve consequential system-wide technical trade-offs.",
        "inputs": "System constraints, feasibility evidence, component contracts.",
        "outputs": "Architecture decisions and integration requirements.",
        "block": "System-wide incompatibility or infeasibility.",
        "success": "Components form a coherent, feasible system.",
        "failure": "Premature complexity.", "phase": "Only when a distinct architecture seat is justified.",
    },
    "frontend": {
        "name": "Frontend Engineer", "spec": "client-contract",
        "mission": "Own client behavior, compatibility, and recovery.",
        "inputs": "Experience, Technical, and service contracts.",
        "outputs": "Client contract section, implementation, compatibility evidence.",
        "block": "Integration violating the accepted client contract.",
        "success": "Accepted journeys work across supported clients and failures.",
        "failure": "Broken edge-case recovery.", "phase": "Only after Engineering earns separate seats.",
    },
    "backend": {
        "name": "Backend Engineer", "spec": "service-data-contract",
        "mission": "Preserve service semantics and data invariants.",
        "inputs": "Technical, data boundaries, and client obligations.",
        "outputs": "Service/data contract section, implementation, migration evidence.",
        "block": "Unsafe migrations, invalid data behavior, incompatible services.",
        "success": "Invariants survive specified failures and migrations.",
        "failure": "Silent corruption.", "phase": "Only after Engineering earns separate seats.",
    },
    "release": {
        "name": "Release / DevOps", "spec": "release-operations",
        "mission": "Make deployment and operations observable and recoverable.",
        "inputs": "Pinned candidates, quality and trust verdicts, operating envelope.",
        "outputs": "Release plan, recovery procedures, monitoring and incident ownership.",
        "block": "Unobservable or unrecoverable external release.",
        "success": "Accepted candidates operate within the approved envelope.",
        "failure": "Equating deployment with readiness.", "phase": "Before external exposure; releases and incidents.",
    },
    "growth": {
        "name": "Growth / Marketing", "spec": "launch",
        "mission": "Reach the intended audience with defensible promises.",
        "inputs": "Market evidence, product limits, permitted claims.",
        "outputs": "Positioning, launch experiment, qualified channel evidence.",
        "block": "Unsupported public promises or unmet launch prerequisites.",
        "success": "Qualified demand and learning meet the declared objective.",
        "failure": "Vanity metrics.", "phase": "Demand experiments and Launch.",
    },
    "support": {
        "name": "Customer Support", "spec": "support-readiness",
        "mission": "Own customer-problem handling and service recovery.",
        "inputs": "Service promises, failures, customer feedback, operating limits.",
        "outputs": "Triage, recovery paths, feedback synthesis.",
        "block": "External exposure without required handling of material failures.",
        "success": "Customers have an effective path to resolution.",
        "failure": "Unfulfillable service promises.", "phase": "When distinct support judgment earns a seat.",
    },
    "legal": {
        "name": "Legal / Compliance", "spec": "legal-compliance",
        "mission": "Identify conditions and limits on proposed conduct.",
        "inputs": "Proposed conduct, jurisdictions, terms, claims, rights and records.",
        "outputs": "Scoped findings, sources, uncertainty, professional-review requirements.",
        "block": "Unresolved material obligations or impermissible conduct.",
        "success": "Legal conditions are resolved or visibly block dependent action.",
        "failure": "Unsupported certainty or implying unperformed professional review.",
        "phase": "Initial screen and relevant exposure changes.",
    },
    "security": {
        "name": "Security / Privacy", "spec": "security-privacy",
        "mission": "Judge adversarial risk and data exposure.",
        "inputs": "Data map, architecture, threats, proposed exposure.",
        "outputs": "Controls, verification, findings and residual risks.",
        "block": "Uncontrolled material security or privacy exposure.",
        "success": "Material threats have verified controls or permissible acceptance.",
        "failure": "Checklist completion without threat testing.",
        "phase": "Initial screen, architecture/data changes, release and incidents.",
    },
    "finance": {
        "name": "Finance / Fundraising Operations", "spec": "business-funding",
        "mission": "Test affordability, economics, and financing credibility.",
        "inputs": "Costs, commitments, traction, records, financing objective.",
        "outputs": "Reconciled models, claim register, funding case and diligence index.",
        "block": "Unauthorized spending or unsupported financing claims.",
        "success": "Resources stay bounded and financing claims reconcile to evidence.",
        "failure": "Precise forecasts built on unsupported assumptions.",
        "phase": "Economic decisions and Funding preparation.",
    },
}

PROTOCOL = """# Shared session protocol

This workspace is a generated starting point. The pinned governance is in
`team/governance.md`; read applicable sections before acting. If a role starter
or this protocol conflicts with it, record the conflict and follow governance.
These files guide agents; they do not enforce permissions or gate transitions.

## Target founder startup — not implemented

After one-time framework installation, the founder creates a project, attaches
a company folder, and starts talking in a chat. The framework starts the Chief
of Staff on that first message, recovers existing company state or initializes
missing records without overwriting files, and binds one authorized coordinator.
Specialists keep their assigned roles; later chats do not become competing
Chiefs of Staff. The installer, chat binding, and automatic session startup are
not provided by these files. The explicit briefs below are developer preview.

## Initial authority

Frame is Draft. Only preparation of intent, charters, reviewer assignments,
limits, and a first gate contract is permitted. Proposed roles and template
records are not approved authority. Unknown ceilings remain unknown. No customer
outreach, payments, deployment, binding commitments, or discovery experiments
are authorized by generating this workspace. Obtain actual Frame acceptance and
founder authorization under the pinned spec before those actions.

## Shared truth and cooperation

- Read `team/manifest.json`, your role charter, current board items, and relevant
  governing specs at session start and before accepting new work.
- Each session has one role and a distinct instance ID. Do not switch roles to
  review your own work. Attributions are self-reported here, not authentication.
- Board items live in `team/board/`; specs in `team/specs/`; evidence and outputs
  in `team/artifacts/`; consequential decisions in `team/decisions/`.
- Any role may contact another directly; the Chief of Staff is not a message
  relay. Communication transfers no authority. Tools support all agents and
  enforce checks at execution and record changes in the target system.
- Session history and scratch notes are disposable. Publish findings, material
  uncertainty, unfinished obligations, and next steps needed by others into
  company records during work and before stopping; do not archive private chats.
- Use one file per object with a unique ID, owner, author instance, status, and
  version. Cite governing spec versions and a decision ID. Never overwrite
  another role's artifact or mutate its verdict.
- The author submits an artifact and a handoff; the designated receiver records
  acceptance or rejection in a separate record. Private chat has no authority.
- A block names its chartered condition, evidence, owner, affected action, and
  clearing condition. Apply the pinned conflict ladder; never bypass a block.
- Record uncertainty, stalls, stale evidence, and adverse results. Consequential
  decisions include rationale, expected outcome, and an outcome review date.
- The Chief of Staff records founder direction in Intent with its source and attribution before
  dependent work resumes. Recordkeeping transfers no founder authority.
  Confirm ambiguity or inferred authority beyond the explicit
  instruction; clear instructions need no repeated confirmation.
- Frame must establish the professional-review policy in Founder Intent,
  including triggers, independent assessor, and change authority. Unknown
  policy is not permission; no agent may waive the policy or legally required review.
- Gate contracts name a failure owner, safe hold, and bounded retry authority.
  Retain failed results. Revised tests need prospective independent approval;
  unknown retry authority permits no retry. Escalate only reserved changes,
  not every failed experiment.
- Founder packets cite a reserved category and authority reference; each option
  states its trade-offs. Preserve dissent and review escalation quality through
  the existing outcome process. Do not add a veto over genuine reserved decisions
  or automatically shrink delegation for unnecessary escalation.
- The Chief of Staff owns workflow judgment; PM owns product scope/priorities. It may
  propose assignments and recovery but cannot replace domain verdicts, approve
  its own work or permissions, or suppress any role's founder packet. Its plans
  need charter-named non-author review. The target execution software checks
  every action independently, including the Chief of Staff's, and applies founder
  pauses without waiting for it. These controls are not installed in this prototype.
- Use Company Operations' activation guide for ownership and exposure triggers.
  Before granting execution authority, record a representative role evaluation
  and boundary check with qualified non-author review. Prepare/evaluate only
  until approved; no role, including the Chief of Staff, qualifies itself.
- Founder notification rules live in Intent; notice records live in
  `team/founder-inbox/`. Use the founder-notice template and link decision requests
  to founder packets instead of duplicating them. Any role may submit; distinguish
  must-know from decision-required notices. Delivery, seen, and resolution are
  separate; silence never approves. Hold affected actions pending authority.
  The target system retries delivery and handles detectable triggers independently
  of the Chief of Staff. Agree deadlines, reminders, and enabled channels at Frame.
- `team/founder-preferences.json` holds only useful communication preferences,
  with source/date and explicit versus inferred basis. The Chief of Staff records
  feedback; all roles use relevant entries. Explicit direction wins; inferred
  preferences remain tentative and correctable. Never suppress required notices,
  exceed notification deadlines, or change authority based on personalization.

## Prototype operation

The session operator starts each independent session and manually routes ready
handoffs. No session waking or supervision is installed. There is no atomic
board service: serialize shared writes, and pause if ownership or concurrent
updates are unclear. A shared Git remote alone is not live shared state.
Acceptance and gate records require real review; never prefill a Pass.
Use `team/templates/` as record starters, not as proof of compliance.
Company records are co-located under `team/` in this prototype. They belong to
the company and must not be replaced with team instructions. Live team
replacement and transfer of authority are not implemented.
One company uses one persistent folder. Both platform UIs may open that folder;
opening it grants no authority and creates no second company. Use one active
environment at a time in this prototype; overlapping writes and competing Chiefs
of Staff are unsafe. The `both` target supplies wrappers, not mixed-harness routing.
Notification delivery, preference learning, and role evaluation are manual here;
record templates do not perform or certify them. Preserve records when switching
interfaces; a different product may require a new chat, not a founder rebrief.

After each assignment, leave its artifact references, current status, unresolved
blocks, next receiver, and pending outcome reviews on the board. A fresh instance
must be able to continue from these records without your conversation.
"""


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def materialize(config, output, target="both", spec=None):
    """Generate a fresh workspace; never merge into or overwrite a live team."""
    if not isinstance(config, dict):
        raise ValueError("Configuration must be a JSON object")
    unknown = set(config) - {"name", "idea", "active_roles"}
    if unknown:
        raise ValueError("Unsupported configuration fields: " + ", ".join(sorted(unknown)))
    for key in ("name", "idea"):
        if not isinstance(config.get(key), str) or not config[key].strip():
            raise ValueError(f"Configuration requires a non-empty {key!r} string")
    roles = config.get("active_roles", ["runner", "pm", "research", "qa"])
    if (not isinstance(roles, list) or not roles
            or any(not isinstance(role, str) or role not in ROLES for role in roles)):
        raise ValueError("active_roles must be a non-empty list of supported role IDs")
    if len(roles) != len(set(roles)):
        raise ValueError("active_roles must not contain duplicates")
    if "pm" not in roles:
        raise ValueError("Initial Frame preparation requires a proposed pm role for product scope")
    if "runner" not in roles:
        raise ValueError("Initial Frame preparation requires a proposed runner owner; add runner to active_roles")
    if target not in ("codex", "claude", "both"):
        raise ValueError("target must be codex, claude, or both")
    spec = Path(spec) if spec is not None else ROOT / "SPEC.md"
    spec_bytes = spec.read_bytes()
    spec_bytes.decode("utf-8")
    if not spec_bytes.strip():
        raise ValueError("Governance spec must not be empty")
    output = Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise FileExistsError(f"Refusing existing output: {output}")
    targets = ["codex", "claude"] if target == "both" else [target]
    output.parent.mkdir(parents=True, exist_ok=True)
    # Stage outside the destination so validation and generation errors do not
    # leave a partly initialized team that could be mistaken for a usable one.
    stage = Path(tempfile.mkdtemp(prefix=".startup-stage-", dir=output.parent))
    try:
        team = stage / "team"
        for folder in ("roles", "sessions", "board", "specs", "artifacts", "decisions", "templates", "founder-inbox"):
            (team / folder).mkdir(parents=True)
        (team / "governance.md").write_bytes(spec_bytes)
        (team / "PROTOCOL.md").write_text(PROTOCOL, encoding="utf-8")
        write_json(team / "manifest.json", {
            "schema_version": "1", "converter_version": VERSION,
            "name": config["name"], "targets": targets, "active_roles": roles,
            "role_status": "proposed_until_frame_acceptance",
            "governance": {"file": "team/governance.md", "source_name": spec.name,
                           "sha256": hashlib.sha256(spec_bytes).hexdigest()},
            "mode": "manual_standalone_sessions", "runtime_enforcement": False,
        })
        write_json(team / "founder-preferences.json", {
            "owner": "human_founder", "recorder": "runner", "status": "Draft", "version": 0,
            "explicit": [], "inferred": [],
        })
        if "codex" in targets:
            (stage / "AGENTS.md").write_text(
                "# Team workspace\n\nRead `team/PROTOCOL.md` and the startup brief named in your initial prompt.\n"
                "Developer preview: this file does not automatically assign a role.\n"
                "Use the explicitly named brief; do not infer a role or impersonate the founder.\n",
                encoding="utf-8")
        if "claude" in targets:
            (stage / "CLAUDE.md").write_text(
                "# Team workspace\n\n@team/PROTOCOL.md\n\n"
                "Developer preview: read the startup brief named in your initial prompt.\n"
                "This file does not automatically assign a role.\n",
                encoding="utf-8")
        for role in roles:
            charter = ROLES[role]
            ownership = f"Owned spec: `team/specs/{charter['spec']}.md`."
            if role == "engineer" and "architect" in roles:
                ownership = (
                    "Owned scope: Implementation section of `team/specs/technical.md`; "
                    "Architect is the accountable owner of the full Technical spec."
                )
            elif role == "release" and "support" not in roles:
                ownership += (
                    " Also owns `team/specs/support-readiness.md` for routine support "
                    "until a separate Support seat is accepted."
                )
            (team / "roles" / f"{role}.md").write_text(
                f"# {charter['name']}\n\nStatus: Proposed; requires Frame acceptance.\n\n"
                f"Mission: {charter['mission']}\n\n"
                f"{ownership}\n\n"
                f"Inputs: {charter['inputs']}\n\nOutputs: {charter['outputs']}\n\n"
                f"Success: {charter['success']}\n\nMay block: {charter['block']}\n\n"
                f"Main failure mode: {charter['failure']}\n\nActivation: {charter['phase']}\n\n"
                "Block resolver, non-party arbiter, independent reviewer, charter amendment authority,\n"
                "delegation approver, authority envelope, and expiry: Unknown; define at Frame. Apply the pinned\n"
                "governance's override rules. This starter grants no spending or external-action permission.\n\n"
                "Qualification evidence: Unknown. Before execution authority, a qualified non-author\n"
                "must assess a representative role task and authority-boundary check; record evidence\n"
                "and verdict using the role-evaluation template. Compatible prior evidence needs a reuse rationale.\n",
                encoding="utf-8")
            if role == "runner":
                with (team / "roles/runner.md").open("a", encoding="utf-8") as charter_file:
                    charter_file.write(
                        "\nBoundaries: PM retains product priorities; specialists retain domain verdicts.\n"
                        "Do not approve your own work or permissions, suppress founder packets,\n"
                        "waive blocks, or bypass execution controls. Your reviewer and any permission\n"
                        "change approver must be qualified non-parties under the pinned governance.\n"
                    )
            (team / "sessions" / f"{role}.md").write_text(
                f"# Start an independent {charter['name']} session\n\n"
                f"Your role ID is `{role}`. Keep it fixed for this session.\n\n"
                f"Read `team/PROTOCOL.md`, `team/roles/{role}.md`, `team/manifest.json`,\n"
                "the current `team/board/` records, and applicable pinned governance sections.\n"
                "Use a distinct instance ID in every output attribution. Read source artifacts\n"
                "instead of relying on other sessions' conversation summaries.\n\n"
                "Before acting, establish your owned decisions, current permission, blocking conditions,\n"
                "qualification evidence, and next permitted assignment. Read relevant founder\n"
                "preferences and unresolved notices. If Frame remains Draft, prepare only Frame\n"
                "artifacts in your domain. Do not manufacture approvals or evidence.\n\n"
                "On completion, publish an artifact and decision reference plus a handoff\n"
                "to the named receiver. Leave uncertainty and open blocks visible.\n",
                encoding="utf-8")
            if role == "runner":
                with (team / "sessions/runner.md").open("a", encoding="utf-8") as brief:
                    brief.write(
                        "\n## Founder conversation\n\n"
                        "Recover existing company state first; never reset records or infer that a new\n"
                        "chat grants authority. Follow the pinned handover requirements when replacing\n"
                        "an instance. If Frame is Draft, guide preparation through a focused interview.\n"
                        "Ask one or a few questions at a time, reuse supplied answers, challenge\n"
                        "consequential assumptions, and summarize decisions. Unknown answers become\n"
                        "explicit unknowns or proposed research, not invented facts. Do not require\n"
                        "a complete business plan; ask what the next bounded decision needs.\n"
                        "Prepare what is permitted while dependent work awaits missing authority.\n"
                        "Bring the founder a reviewed experiment with success criteria, cost, exposure,\n"
                        "and necessary reserved decisions. Clear authorization needs no repeated approval.\n"
                        "In the target product you activate specialists through tools without founder\n"
                        "setup. This preview has no automatic startup: report that limit honestly and\n"
                        "never pretend to have started sessions or obtained independent reviews.\n"
                    )
        spec_owners = {charter["spec"]: role for role, charter in ROLES.items()}
        spec_owners["technical"] = "architect" if "architect" in roles else "engineer"
        spec_owners["support-readiness"] = "support" if "support" in roles else "release"
        for spec_id, owner in spec_owners.items():
            (team / "specs" / f"{spec_id}.md").write_text(
                f"# {spec_id}\n\nOwner: {owner}. Status: {'Draft' if owner in roles else 'Dormant'}. "
                "Version: 0.0.\n\n"
                "Governing reference: `team/governance.md`; identify exact sections before work.\n\n"
                "Load-bearing decisions: Unknown. Evidence: Not collected.\n\n"
                "Independent reviewer, reading/decision budget, and expiry: Unknown; set at Frame.\n",
                encoding="utf-8")
        with (team / "specs/company-operations.md").open("a", encoding="utf-8") as operations:
            operations.write(
                "\n## Proposed activation guide\n\n"
                "For each assignment identify output, owner, required reviews, and whether an active\n"
                "session suffices. Activate approved roles within limits; mandatory review precedes\n"
                "the affected exposure. Any role may flag a missing specialist. This catalog neither\n"
                "creates sessions nor approves dormant roles; prepare their charter and qualification\n"
                "before execution. Charters resolve shared-spec ownership. Record a handoff before stopping.\n\n"
                "| Role ID | Owned spec | Work or exposure trigger |\n|---|---|---|\n"
            )
            for role, charter in ROLES.items():
                operations.write(f"| {role} | {charter['spec']} | {charter['phase']} |\n")
        (team / "specs/founder-intent.md").write_text(
            f"# Founder Intent: {config['name']}\n\nOwner: Human founder. Version: 0.0. Status: Draft.\n\n"
            "Recorder: Chief of Staff, under founder authority. Preserve the original instruction\n"
            "and attribution in its decision record; clarify ambiguity or inferred\n"
            "authority beyond the explicit instruction before applying it.\n\n"
            "## Idea supplied at generation\n\n" + config["idea"] + "\n\n"
            "## Decisions requiring confirmation\n\n"
            "Target user, success, non-goals, budget per commitment and cumulative, legal\n"
            "exposure, data/payment/user/terms/duration envelope, irreversible actions,\n"
            "scope-change thresholds, reviewers, reading budget, expiry: Unknown.\n\n"
            "## Professional-review policy\n\n"
            "Triggers, independent assessor, and change authority: Unknown; establish at Frame.\n"
            "Record the accepted policy here; Frame references its version. No agent may\n"
            "waive the policy or legally required review.\n\n"
            "## Founder notification policy\n\n"
            "Must-know and decision-required triggers, delivery deadlines, enabled channels,\n"
            "reminder/fallback rules, and policy-change authority: Unknown; establish at Frame.\n"
            "Include reserved decisions, material incidents or broken commitments, significant\n"
            "adverse findings, and agreed milestones. Frame references this accepted policy;\n"
            "communication preferences never override it. No delivery service is installed.\n\n"
            "Generation is not founder approval. Preserve unknowns until explicitly resolved.\n",
            encoding="utf-8")
        write_json(team / "board/frame.json", {
            "id": "FRAME", "owner": "runner", "author_instance": None,
            "status": "Draft", "version": 0,
            "permission": "prepare_frame_only", "decision_id": None,
            "contract_approver": None, "founder_authorization": None,
            "professional_review_policy": None,
            "notification_policy": None, "role_evaluations": [],
            "missing": ["accepted intent and limits", "approved charters and reviewers",
                        "accepted professional-review policy with independent assessor and change authority",
                        "accepted notification policy and verified delivery path",
                        "independent qualification evidence for initial execution roles",
                        "risk/exposure screen", "approved first evidence contract", "cold-start acceptance"],
            "next": "Prepare a founder decision packet and independent Frame review.",
        })
        templates = {
            "founder-notice": {"id": None, "owner": None, "author_instance": None,
                               "status": "Draft", "version": 0, "governing_versions": [],
                               "kind": None, "trigger_reference": None, "summary": None,
                               "evidence": [], "dissent": [], "packet_reference": None,
                               "affected_actions": [], "safe_hold": None, "deliver_by": None,
                               "delivery": {"channel": None, "attempts": [], "delivered_at": None,
                                            "next_attempt_at": None},
                               "seen_at": None, "resolution": None,
                               "authorization_reference": None},
            "role-evaluation": {"id": None, "owner": None, "author_instance": None,
                                "status": "Draft", "version": 0, "governing_versions": [],
                                "role_id": None, "candidate_instance": None,
                                "role_model_harness_versions": None,
                                "representative_task": None, "boundary_check": None,
                                "evidence": [], "reviewer_instance": None, "verdict": None,
                                "reuse_rationale": None, "authority_grant_reference": None},
            "founder-preference": {"id": None, "owner": None, "author_instance": None,
                                   "status": "Draft", "version": 0, "governing_versions": [],
                                   "topic": None, "preference": None, "basis": None,
                                   "source_reference": None, "recorded_at": None,
                                   "supersedes": None},
            "decision": {"id": None, "owner": None, "author_instance": None,
                         "status": "Draft", "version": 0, "authority": None,
                         "governing_versions": [], "decision": None, "evidence": [], "rationale": None,
                         "source_instruction": {"reference": None, "attributed_to": None, "text": None},
                         "expected_outcome": None, "review_date": None, "reviewer": None, "outcome": None},
            "founder-packet": {"id": None, "owner": None, "author_instance": None,
                               "status": "Draft", "version": 0, "reserved_category": None,
                               "governing_versions": [], "decision_id": None,
                               "authority_reference": None, "decision": None, "options": [],
                               "recommendation": None, "evidence": [], "cost_of_waiting": None,
                               "dissent": [], "founder_decision": None},
            "handoff": {"id": None, "owner": None, "author_instance": None,
                        "status": "Draft", "version": 0, "receiver_instance": None,
                        "artifact_version": None, "governing_versions": [], "decision_id": None,
                        "acceptance_checks": [], "evidence": [], "limitations": [],
                        "receiver_verdict": None, "review_record": None},
            "gate": {"id": None, "owner": None, "author_instance": None,
                     "status": "Draft", "version": 0, "governing_versions": [], "claim": None,
                     "population": None, "method": None, "window": None, "pass_conditions": [],
                     "disqualifiers": [], "evidence_freshness": None, "permits": None,
                     "independent_reviewers": [], "contract_approval": None,
                     "contract_approval_rationale": None, "evidence": [], "prior_gate_records": [],
                     "verdict": None, "decision_id": None,
                     "on_fail": {"owner": None, "safe_hold": None,
                                 "retry_authority": None, "retry_limit": None},
                     "blocked": {"missing": [], "owner": None, "deadline": None, "safe_hold": None}},
        }
        for name, template in templates.items():
            write_json(team / "templates" / f"{name}.json", template)
        (stage / "START.md").write_text(
            "# Developer preview: manual role sessions\n\n"
            "This is a generated workspace, not a running company. Use it only after\n"
            "the generator reports success; an interrupted run may leave incomplete files.\n"
            "The target founder flow after one-time installation is: create a project, attach\n"
            "a folder, open a chat, and talk. The Chief of Staff starts on the first message,\n"
            "interviews the founder, and activates specialists. The installer and startup\n"
            "automation are not implemented. This manual procedure is for development.\n\n"
            "Start separate sessions from this project root; give each its own startup brief.\n"
            "Open this company folder in your chosen project UI, or use a CLI below.\n"
            "In the main conversation, ask: Read team/sessions/runner.md and follow it.\n"
            "This starts Chief of Staff preparation only; other sessions still need manual startup.\n"
            "Both UIs may open the same folder, but use only one active environment at a time.\n"
            "Use another role's brief for a specialist session. Every session must see this same filesystem.\n\n"
            + "\n\n".join(f'```sh\n{platform} "Read team/sessions/runner.md and follow it."\n```'
                           for platform in targets)
            + "\n\nFrame is Draft: prepare and review it before venture execution. Shared writes\n"
            "and handoff routing are manual. Read `team/PROTOCOL.md` for limits and continuity.\n",
            encoding="utf-8")
        # Exclusive creation avoids racing a second generator into the same path.
        output.mkdir()
        try:
            for child in stage.iterdir():
                shutil.move(str(child), output / child.name)
        except BaseException:
            shutil.rmtree(output)
            raise
    finally:
        shutil.rmtree(stage)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--target", choices=["codex", "claude", "both"], default="both")
    parser.add_argument("--spec", type=Path, help="Explicit governance source; defaults to the current SPEC.md")
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text(encoding="utf-8"))
        output = materialize(config, args.output, args.target, args.spec)
    except (OSError, ValueError, TypeError) as error:
        parser.exit(2, f"Cannot generate workspace: {error}\n")
    print(f"Generated {output}\nRead START.md. No sessions were started; Frame remains Draft.")


if __name__ == "__main__":
    main()
