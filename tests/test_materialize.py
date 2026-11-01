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

    def test_default_workspace_pins_the_agreed_spec_without_approving_a_gate(self):
        output = self.generate()
        manifest = json.loads((output / "team/manifest.json").read_text())
        source = (ROOT / "specs/v0.1.md").read_bytes()

        self.assertEqual((output / "team/governance.md").read_bytes(), source)
        self.assertEqual(manifest["schema_version"], "1")
        self.assertEqual(manifest["converter_version"], "0.1")
        self.assertEqual(manifest["name"], self.config["name"])
        self.assertEqual(manifest["governance"]["file"], "team/governance.md")
        self.assertEqual(
            manifest["governance"]["sha256"], hashlib.sha256(source).hexdigest()
        )
        self.assertEqual(manifest["active_roles"], ["pm", "research", "qa"])
        self.assertEqual(manifest["targets"], ["codex", "claude"])

        frame = json.loads((output / "team/board/frame.json").read_text())
        self.assertEqual(frame["status"], "Draft")
        self.assertEqual(frame["permission"], "prepare_frame_only")
        intent = (output / "team/specs/founder-intent.md").read_text()
        self.assertIn(self.config["idea"], intent)
        self.assertIn("unknown", intent.lower())

    def test_independent_role_prompts_share_the_same_durable_protocol(self):
        output = self.generate()
        prompts = []
        for role in ["pm", "research", "qa"]:
            charter = output / f"team/roles/{role}.md"
            prompt = (output / f"team/sessions/{role}.md").read_text()
            self.assertTrue(charter.is_file())
            self.assertIn(f"team/roles/{role}.md", prompt)
            self.assertIn("team/PROTOCOL.md", prompt)
            prompts.append(prompt)
        self.assertEqual(len(set(prompts)), 3)
        self.assertFalse((output / ".claude/agents").exists())
        for template in ["decision", "handoff", "gate"]:
            self.assertIsInstance(
                json.loads((output / f"team/templates/{template}.json").read_text()),
                dict,
            )

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

    def test_initial_frame_requires_an_active_pm_owner(self):
        output = self.base / "no-pm"
        config = {**self.config, "active_roles": ["research", "qa"]}
        with self.assertRaises(ValueError):
            materializer.materialize(config, output)
        self.assertFalse(output.exists())

    def test_architect_owns_technical_while_engineer_owns_implementation_section(self):
        self.config["active_roles"] = ["pm", "engineer", "architect", "qa"]
        output = self.generate()
        engineer = (output / "team/roles/engineer.md").read_text()
        architect = (output / "team/roles/architect.md").read_text()
        technical = (output / "team/specs/technical.md").read_text()
        self.assertIn("Implementation section", engineer)
        self.assertIn("team/specs/technical.md", engineer)
        self.assertNotIn("Owned spec: `team/specs/technical.md`.", engineer)
        self.assertIn("Owned spec: `team/specs/technical.md`.", architect)
        self.assertIn("Owner: architect.", technical)


if __name__ == "__main__":
    unittest.main()
