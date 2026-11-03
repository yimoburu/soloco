#!/usr/bin/env python3
"""Materialize portable team workspaces without starting agent sessions."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile


ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.3"

# These are role starters, not extracted or approved interpretations of governance.
# The pinned spec governs; Frame must review the charters and authority map.
ROLES = {
    "pm": {
        "name": "Product Manager", "spec": "product",
        "mission": "Choose the smallest coherent scope that delivers value or resolves uncertainty.",
        "inputs": "Founder Intent, customer evidence, accepted constraints.",
        "outputs": "Product spec, priorities, feature acceptance criteria, decision packets; recorded Intent changes attributed to the founder's source instruction.",
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
- Use one file per object with a unique ID, owner, author instance, status, and
  version. Cite governing spec versions and a decision ID. Never overwrite
  another role's artifact or mutate its verdict.
- The author submits an artifact and a handoff; the designated receiver records
  acceptance or rejection in a separate record. Private chat has no authority.
- A block names its chartered condition, evidence, owner, affected action, and
  clearing condition. Apply the pinned conflict ladder; never bypass a block.
- Record uncertainty, stalls, stale evidence, and adverse results. Consequential
  decisions include rationale, expected outcome, and an outcome review date.
- PM records founder direction in Intent with its source and attribution before
  dependent work resumes. The interface captures the instruction; it gains no
  domain authority. Confirm ambiguity or inferred authority beyond the explicit
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
    roles = config.get("active_roles", ["pm", "research", "qa"])
    if (not isinstance(roles, list) or not roles
            or any(not isinstance(role, str) or role not in ROLES for role in roles)):
        raise ValueError("active_roles must be a non-empty list of supported role IDs")
    if len(roles) != len(set(roles)):
        raise ValueError("active_roles must not contain duplicates")
    if "pm" not in roles:
        raise ValueError("Initial Frame preparation requires an active pm owner")
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
        for folder in ("roles", "sessions", "board", "specs", "artifacts", "decisions", "templates"):
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
        if "codex" in targets:
            (stage / "AGENTS.md").write_text(
                "# Team workspace\n\nRead `team/PROTOCOL.md` and the startup brief named in your initial prompt.\n"
                "No role is assigned by this file. Do not infer one or impersonate the founder.\n",
                encoding="utf-8")
        if "claude" in targets:
            (stage / "CLAUDE.md").write_text(
                "# Team workspace\n\n@team/PROTOCOL.md\n\n"
                "Read the startup brief named in your initial prompt. This file does not assign a role.\n",
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
                "governance's override rules. This starter grants no spending or external-action permission.\n",
                encoding="utf-8")
            (team / "sessions" / f"{role}.md").write_text(
                f"# Start an independent {charter['name']} session\n\n"
                f"Your role ID is `{role}`. Keep it fixed for this session.\n\n"
                f"Read `team/PROTOCOL.md`, `team/roles/{role}.md`, `team/manifest.json`,\n"
                "the current `team/board/` records, and applicable pinned governance sections.\n"
                "Use a distinct instance ID in every output attribution. Read source artifacts\n"
                "instead of relying on other sessions' conversation summaries.\n\n"
                "First state your owned decisions, current permission, blocking conditions,\n"
                "and next permitted assignment. If Frame remains Draft, prepare only Frame\n"
                "artifacts in your domain. Do not manufacture approvals or evidence.\n\n"
                "On completion, publish an artifact and decision reference plus a handoff\n"
                "to the named receiver. Leave uncertainty and open blocks visible.\n",
                encoding="utf-8")
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
        (team / "specs/founder-intent.md").write_text(
            f"# Founder Intent: {config['name']}\n\nOwner: Human founder. Version: 0.0. Status: Draft.\n\n"
            "Recorder: PM, under founder authority. Preserve the original instruction\n"
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
            "Generation is not founder approval. Preserve unknowns until explicitly resolved.\n",
            encoding="utf-8")
        write_json(team / "board/frame.json", {
            "id": "FRAME", "owner": "pm", "author_instance": None,
            "status": "Draft", "version": 0,
            "permission": "prepare_frame_only", "decision_id": None,
            "contract_approver": None, "founder_authorization": None,
            "professional_review_policy": None,
            "missing": ["accepted intent and limits", "approved charters and reviewers",
                        "accepted professional-review policy with independent assessor and change authority",
                        "risk/exposure screen", "approved first evidence contract", "cold-start acceptance"],
            "next": "Prepare a founder decision packet and independent Frame review.",
        })
        templates = {
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
            "The intended founder experience starts once and routes work automatically;\n"
            "that runner is not implemented. This manual procedure is for development.\n\n"
            "Start separate sessions from this project root; give each its own startup brief.\n"
            "For the first configured role, use a selected platform command below; substitute another role\n"
            "ID for a different session. Every session must see this same shared filesystem.\n\n"
            + "\n\n".join(f'```sh\n{platform} "Read team/sessions/{roles[0]}.md and follow it."\n```'
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
