"""Behavioral checks for the portable workspace generator."""

import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_SPEC = importlib.util.spec_from_file_location(
    "startup_materialize", ROOT / "tools" / "materialize.py"
)
materializer = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = materializer
MODULE_SPEC.loader.exec_module(materializer)


class MaterializeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.config = {
            "name": "BriefLink",
            "idea": "Help freelancers collect a client's project brief — reliably.",
        }

    def generate(self, name="venture", **kwargs):
        output = self.base / name
        materializer.materialize(self.config, output, **kwargs)
        return output

    def test_default_workspace_pins_the_current_spec_without_approving_a_gate(self):
        output = self.generate()
        manifest = json.loads((output / "team/manifest.json").read_text())
        source = (ROOT / "SPEC.md").read_bytes()

        self.assertEqual((output / "team/governance.md").read_bytes(), source)
        self.assertEqual(manifest["schema_version"], "1")
        self.assertEqual(manifest["converter_version"], "0.8")
        self.assertEqual(manifest["name"], self.config["name"])
        self.assertEqual(manifest["governance"]["file"], "team/governance.md")
        self.assertEqual(
            manifest["governance"]["sha256"], hashlib.sha256(source).hexdigest()
        )
        self.assertEqual(manifest["active_roles"], ["runner", "pm", "research", "qa"])
        self.assertEqual(manifest["targets"], ["codex", "claude"])

        frame = json.loads((output / "team/board/frame.json").read_text())
        self.assertEqual(frame["status"], "Draft")
        self.assertEqual(frame["permission"], "prepare_frame_only")
        self.assertIsNone(frame["author_instance"])
        self.assertIsNone(frame["founder_authorization"])
        intent = (output / "team/specs/founder-intent.md").read_text()
        self.assertIn(self.config["idea"], intent)
        self.assertIn("unknown", intent.lower())

    def test_independent_role_prompts_share_the_same_durable_protocol(self):
        output = self.generate()
        prompts = []
        for role in ["runner", "pm", "research", "qa"]:
            charter = output / f"team/roles/{role}.md"
            prompt = (output / f"team/sessions/{role}.md").read_text()
            self.assertTrue(charter.is_file())
            self.assertIn(f"team/roles/{role}.md", prompt)
            self.assertIn("team/PROTOCOL.md", prompt)
            prompts.append(prompt)
        self.assertEqual(len(set(prompts)), 4)
        self.assertFalse((output / ".claude/agents").exists())
        for template in ["decision", "founder-packet", "handoff", "gate",
                         "founder-notice", "founder-preference", "role-evaluation"]:
            record = json.loads((output / f"team/templates/{template}.json").read_text())
            self.assertEqual(record["status"], "Draft")
            self.assertEqual(record["version"], 0)
            self.assertEqual(record["governing_versions"], [])
            for field in ["id", "owner", "author_instance"]:
                self.assertIsNone(record[field])
        gate = json.loads((output / "team/templates/gate.json").read_text())
        self.assertIsNone(gate["contract_approval"])
        self.assertIsNone(gate["verdict"])

    def test_generation_does_not_invent_review_policy_retry_or_founder_authority(self):
        output = self.generate()
        frame = json.loads((output / "team/board/frame.json").read_text())
        self.assertIsNone(frame["professional_review_policy"])
        self.assertIsNone(frame["founder_authorization"])

        gate = json.loads((output / "team/templates/gate.json").read_text())
        self.assertEqual(gate["on_fail"], {
            "owner": None, "safe_hold": None, "retry_authority": None, "retry_limit": None,
        })
        self.assertIsNone(gate["contract_approval"])
        self.assertIsNone(gate["contract_approval_rationale"])
        self.assertEqual(gate["prior_gate_records"], [])

        packet = json.loads((output / "team/templates/founder-packet.json").read_text())
        for field in ["reserved_category", "authority_reference", "decision", "recommendation",
                      "cost_of_waiting", "founder_decision"]:
            self.assertIsNone(packet[field])
        self.assertEqual(packet["options"], [])
        self.assertEqual(packet["evidence"], [])
        self.assertEqual(packet["dissent"], [])

        decision = json.loads((output / "team/templates/decision.json").read_text())
        self.assertEqual(decision["source_instruction"], {
            "reference": None, "attributed_to": None, "text": None,
        })
        self.assertIsNone(decision["authority"])
        self.assertIsNone(decision["outcome"])

    def test_target_selection_does_not_mix_platform_instruction_files(self):
        for target in ["codex", "claude", "both"]:
            with self.subTest(target=target):
                output = self.generate(name=target, target=target)
                self.assertEqual(
                    (output / "AGENTS.md").exists(), target in ["codex", "both"]
                )
                self.assertEqual(
                    (output / "CLAUDE.md").exists(), target in ["claude", "both"]
                )

    def test_founder_records_start_empty_without_delivery_or_authorization(self):
        output = self.generate()
        self.assertEqual(list((output / "team/founder-inbox").iterdir()), [])
        profile = json.loads((output / "team/founder-preferences.json").read_text())
        self.assertEqual(profile["owner"], "human_founder")
        self.assertEqual(profile["explicit"], [])
        self.assertEqual(profile["inferred"], [])
        self.assertEqual(profile["status"], "Draft")
        notice = json.loads((output / "team/templates/founder-notice.json").read_text())
        self.assertIsNone(notice["kind"])
        self.assertIsNone(notice["packet_reference"])
        self.assertEqual(notice["delivery"]["attempts"], [])
        for value in (notice["delivery"]["delivered_at"], notice["seen_at"],
                      notice["resolution"], notice["authorization_reference"]):
            self.assertIsNone(value)
        frame = json.loads((output / "team/board/frame.json").read_text())
        self.assertIsNone(frame["notification_policy"])
        self.assertEqual(frame["permission"], "prepare_frame_only")

    def test_role_catalog_does_not_activate_or_qualify_dormant_roles(self):
        output = self.generate()
        operations = (output / "team/specs/company-operations.md").read_text()
        for role in ("legal", "security", "finance"):
            self.assertIn(f"| {role} |", operations)
            self.assertFalse((output / f"team/sessions/{role}.md").exists())
            self.assertFalse((output / f"team/roles/{role}.md").exists())
        evaluation = json.loads((output / "team/templates/role-evaluation.json").read_text())
        self.assertEqual(evaluation["evidence"], [])
        for field in ("candidate_instance", "reviewer_instance", "verdict", "authority_grant_reference"):
            self.assertIsNone(evaluation[field])
        frame = json.loads((output / "team/board/frame.json").read_text())
        self.assertEqual(frame["role_evaluations"], [])
        self.assertIsNone(frame["founder_authorization"])

    def test_switching_platform_does_not_reset_existing_company_records(self):
        output = self.generate(target="both")
        profile_path = output / "team/founder-preferences.json"
        profile = json.loads(profile_path.read_text())
        profile["explicit"] = [{"id": "P1", "preference": "Short updates", "basis": "explicit"}]
        profile_path.write_text(json.dumps(profile))
        (output / "team/founder-inbox/N1.json").write_text(
            '{"id": "N1", "kind": "decision_required", "resolution": null}'
        )
        before = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
        for target in ("codex", "claude"):
            with self.subTest(target=target):
                with self.assertRaises(FileExistsError):
                    materializer.materialize(self.config, output, target=target)
                after = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
                self.assertEqual(before, after)

    def test_explicit_spec_is_copied_exactly_including_unicode_and_line_endings(self):
        source = self.base / "candidate.md"
        content = "# Candidate\r\n\r\nA deliberate choice — 待审。\r\n".encode("utf-8")
        source.write_bytes(content)
        output = self.generate(spec=source)
        self.assertEqual((output / "team/governance.md").read_bytes(), content)
        manifest = json.loads((output / "team/manifest.json").read_text())
        self.assertEqual(
            manifest["governance"]["sha256"], hashlib.sha256(content).hexdigest()
        )

    def test_existing_workspace_is_refused_without_touching_its_contents(self):
        output = self.base / "existing"
        output.mkdir()
        sentinel = output / "decisions.json"
        sentinel.write_text('{"important": "preserve me"}')
        before = sentinel.read_bytes()
        with self.assertRaises((FileExistsError, ValueError)):
            materializer.materialize(self.config, output)
        self.assertEqual(sentinel.read_bytes(), before)
        self.assertEqual(list(output.iterdir()), [sentinel])

    def test_dangling_output_symlink_is_refused_without_touching_it(self):
        output = self.base / "existing-link"
        target = self.base / "missing-target"
        output.symlink_to(target, target_is_directory=True)
        with self.assertRaises(FileExistsError):
            materializer.materialize(self.config, output)
        self.assertTrue(output.is_symlink())
        self.assertEqual(output.readlink(), target)
        self.assertFalse(target.exists())

    def test_render_failure_removes_staging_and_leaves_no_workspace(self):
        output = self.base / "render-failure"
        with patch.object(materializer, "write_json", side_effect=OSError("write failed")):
            with self.assertRaises(OSError):
                materializer.materialize(self.config, output)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.base.glob(".startup-stage-*")), [])

    def test_publish_failure_removes_partial_output_and_staging(self):
        output = self.base / "publish-failure"
        original_move = materializer.shutil.move
        moved = []

        def fail_after_first_move(source, destination):
            if moved:
                raise OSError("move failed")
            moved.append(destination)
            return original_move(source, destination)

        with patch.object(materializer.shutil, "move", side_effect=fail_after_first_move):
            with self.assertRaises(OSError):
                materializer.materialize(self.config, output)
        self.assertEqual(len(moved), 1)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.base.glob(".startup-stage-*")), [])

    def test_destination_created_during_generation_is_preserved(self):
        output = self.base / "race"
        sentinel = output / "existing-decision.json"
        original_mkdtemp = materializer.tempfile.mkdtemp

        def competing_creator(*args, **kwargs):
            stage = original_mkdtemp(*args, **kwargs)
            output.mkdir()
            sentinel.write_text("preserve this decision")
            return stage

        with patch.object(materializer.tempfile, "mkdtemp", side_effect=competing_creator):
            with self.assertRaises(FileExistsError):
                materializer.materialize(self.config, output)
        self.assertEqual(sentinel.read_text(), "preserve this decision")
        self.assertEqual(list(output.iterdir()), [sentinel])
        self.assertEqual(list(self.base.glob(".startup-stage-*")), [])

    def test_invalid_inputs_do_not_create_a_partial_workspace(self):
        cases = [
            ({"name": "BriefLink"}, {}),
            ({"name": "", "idea": "An idea"}, {}),
            ({**self.config, "active_roles": ["not-a-role"]}, {}),
            ({**self.config, "active_roles": ["../pm"]}, {}),
            ({**self.config, "active_roles": "pm"}, {}),
            (self.config, {"target": "unrecognized"}),
            (self.config, {"spec": self.base / "missing.md"}),
        ]
        for index, (config, kwargs) in enumerate(cases):
            with self.subTest(case=index):
                output = self.base / f"invalid-{index}"
                with self.assertRaises((ValueError, TypeError, FileNotFoundError)):
                    materializer.materialize(config, output, **kwargs)
                self.assertFalse(output.exists())

    def test_materializing_does_not_launch_role_processes(self):
        with patch("subprocess.run", side_effect=AssertionError("process launched")):
            with patch("subprocess.Popen", side_effect=AssertionError("process launched")):
                output = self.generate()
        self.assertTrue((output / "team/manifest.json").is_file())

    def test_initial_frame_requires_a_pm_for_product_scope(self):
        output = self.base / "no-pm"
        config = {**self.config, "active_roles": ["runner", "research", "qa"]}
        with self.assertRaises(ValueError):
            materializer.materialize(config, output)
        self.assertFalse(output.exists())

    def test_initial_frame_requires_runner_without_silently_adding_a_seat(self):
        config = {**self.config, "active_roles": ["pm", "research", "qa"]}
        output = self.base / "no-runner"
        with self.assertRaisesRegex(ValueError, "runner"):
            materializer.materialize(config, output)
        self.assertFalse(output.exists())
        self.assertEqual(config["active_roles"], ["pm", "research", "qa"])

    def test_runner_owns_operations_and_frame_but_not_product_or_approval(self):
        # Input ordering must not change the founder-facing entry role.
        self.config["active_roles"] = ["pm", "qa", "runner", "research"]
        output = self.generate()
        frame = json.loads((output / "team/board/frame.json").read_text())
        self.assertEqual(frame["owner"], "runner")
        self.assertEqual(frame["permission"], "prepare_frame_only")
        self.assertIsNone(frame["contract_approver"])
        self.assertIsNone(frame["founder_authorization"])
        self.assertIn("Owner: runner. Status: Draft.", (output / "team/specs/company-operations.md").read_text())
        self.assertIn("Owner: pm.", (output / "team/specs/product.md").read_text())
        self.assertTrue((output / "team/roles/runner.md").is_file())
        self.assertTrue((output / "team/sessions/runner.md").is_file())
        start = (output / "START.md").read_text()
        for target in ("codex", "claude"):
            self.assertIn(f'{target} "Read team/sessions/runner.md and follow it."', start)
        manifest = json.loads((output / "team/manifest.json").read_text())
        self.assertFalse(manifest["runtime_enforcement"])

    def test_architect_owns_technical_while_engineer_owns_implementation_section(self):
        self.config["active_roles"] = ["runner", "pm", "engineer", "architect", "qa"]
        output = self.generate()
        engineer = (output / "team/roles/engineer.md").read_text()
        architect = (output / "team/roles/architect.md").read_text()
        technical = (output / "team/specs/technical.md").read_text()
        self.assertIn("Implementation section", engineer)
        self.assertIn("team/specs/technical.md", engineer)
        self.assertNotIn("Owned spec: `team/specs/technical.md`.", engineer)
        self.assertIn("Owned spec: `team/specs/technical.md`.", architect)
        self.assertIn("Owner: architect.", technical)

    def test_support_readiness_has_one_owner_with_or_without_a_support_seat(self):
        for support_seated in [False, True]:
            with self.subTest(support_seated=support_seated):
                self.config["active_roles"] = ["runner", "pm", "release", "qa"]
                if support_seated:
                    self.config["active_roles"].append("support")
                output = self.generate(name=f"support-{support_seated}")
                owner = "support" if support_seated else "release"
                spec = (output / "team/specs/support-readiness.md").read_text()
                release = (output / "team/roles/release.md").read_text()
                self.assertIn(f"Owner: {owner}. Status: Draft.", spec)
                self.assertEqual("team/specs/support-readiness.md" in release, not support_seated)
                if support_seated:
                    support = (output / "team/roles/support.md").read_text()
                    self.assertIn("Owned spec: `team/specs/support-readiness.md`.", support)


if __name__ == "__main__":
    unittest.main()
