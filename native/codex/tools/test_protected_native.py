"""Pure temporary-data checks. No upstream checkout, compiler or native action."""
import argparse
import copy
import importlib.util
import contextlib
import io
import json
import stat
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("delivery_tool", Path(__file__).with_name("protected_native.py"))
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)
VALIDATE_OPENSSL_CONFIG = TOOL.validate_openssl_config
COHERENT_SOURCE_FILES = 9310
VALIDATE_SELECTED_SDK = TOOL.validate_selected_sdk


def pure_build_fixture(tmp):
    """Small synthetic bytes, never an accepted source or actual executable."""
    base = Path(tmp).resolve()
    prepared, prefix, cache = [base / x for x in ("prepared", "prefix", "cache")]
    source = prepared / "source"
    (source / "codex-rs").mkdir(parents=True)
    (prefix / "bin").mkdir(parents=True)
    (cache / "registry").mkdir(parents=True)
    (source / "codex-rs/Cargo.lock").write_bytes(b"lock")
    (prefix / "bin/cargo").write_bytes(b"cargo!")
    (prefix / "bin/cargo").chmod(0o755)
    sr = {"path": "codex-rs/Cargo.lock", "bytes": 4, "sha256": TOOL.sha(b"lock"), "mode": "100644"}
    tr = {"path": "bin/cargo", "bytes": 6, "sha256": TOOL.sha(b"cargo!"), "mode": "100755"}
    (prepared / "prepared-source.json").write_text(json.dumps({"schema": "soloco-prepared-native-source-v1", "manifest_sha256": TOOL.MANIFEST_SHA256, "files": [sr], "source_compiled": False, "native_qualified": False}))
    args = argparse.Namespace(manifest=TOOL.MANIFEST, prepared=prepared, toolchain=prefix, cargo_home=cache, output=base / "output", timeout=5)
    return base, args, sr, tr


def pure_build_package(base, sr, tr):
    """Closed fictional helper source at the canonical path; no SDK or compile."""
    root = base / "native/codex"
    root.mkdir(parents=True)
    source = base / TOOL.SIDECAR_SOURCE
    source.parent.mkdir(parents=True)
    data = b"/* PURE FIXTURE C, NEVER COMPILED */\n"
    source.write_bytes(data)
    manifest = {"sidecar_capture": {
        "protocol": "soloco-origin-sidecar-source-build-v1",
        "source": {"path": TOOL.SIDECAR_SOURCE, "bytes": len(data), "sha256": TOOL.sha(data)},
        "binary": "origin-sidecar-capture", "arguments": ["origin-sidecar-capture-v1"],
        "target": "arm64-apple-macos11.0", "flags": list(TOOL.SIDECAR_FLAGS)}}
    return root, manifest, [], [tr], [sr]


class TemporaryDataChecks(unittest.TestCase):
    def setUp(self):
        # Pure CI never consults the runner's real system crypto configuration.
        self.config_guard = self.enterContext(patch.object(TOOL, "validate_openssl_config", return_value=TOOL.OPENSSL_CONFIG))
        self.sdk_guard = self.enterContext(patch.object(TOOL, "validate_selected_sdk", return_value={"schema": "PURE_MOCK_SELECTED_SDK_NO_HOST_READ"}))

    @contextlib.contextmanager
    def pure_mock_sidecar_build(self, args):
        """Only the helper compiler is mocked; real plan/source checks remain."""
        def helper(argv, env, output, record, deadline):
            source_copy = args.output / "origin-sidecar-capture.c"
            binary = args.output / "origin-sidecar-capture"
            self.assertEqual(output, args.output)
            self.assertEqual(argv[:2], [str(TOOL.SANDBOX), "-p"])
            self.assertEqual(record["compiler_argv"], [str(TOOL.SELECTED_CLANG), *TOOL.SIDECAR_FLAGS,
                             "-isysroot", str(TOOL.SELECTED_SDK), str(source_copy), "-o", str(binary)])
            self.assertEqual(argv[3:], record["compiler_argv"])
            self.assertEqual(record["source_copy"], str(source_copy))
            self.assertEqual(source_copy.read_bytes(), (args.output.parent / TOOL.SIDECAR_SOURCE).read_bytes())
            self.assertEqual(source_copy.stat().st_mode & 0o777, 0o444)
            self.assertEqual(record["arguments"], ["origin-sidecar-capture-v1"])
            self.assertIsNone(record["binary"])
            self.assertFalse(record["native_qualified"])
            data = b"PURE MOCK HELPER, NEVER EXECUTED"
            binary.write_bytes(data)
            binary.chmod(0o555)
            return {**record, "status": "compiled-source-only", "exit_code": 0,
                    "binary": {"path": str(binary), "bytes": len(data),
                               "sha256": TOOL.sha(data), "mode": "100555"}}
        with patch.object(TOOL, "build_sidecar", side_effect=helper) as build:
            yield build

    @contextlib.contextmanager
    def pure_packaged_fixture(self):
        """Fictional package and workspace only; no copied recipe or build."""
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            package = base / "fictional-package"
            driver = package / "producer-inputs/native/codex/tools/protected_native.py"
            driver.parent.mkdir(parents=True)
            driver.write_bytes(b"FICTIONAL ORIGINAL MODULE, NEVER EXECUTED")
            manifest = driver.parent.parent / "source-package.json"
            manifest.write_bytes(b"FICTIONAL MANIFEST, NOT A RECIPE")
            data = base / "managed-data"
            workspace = data / "peer-context-component/v1"
            workspace.mkdir(parents=True)
            workspace.chmod(0o700)
            workspace.parent.chmod(0o700)
            request = {"protocol": "soloco-packaged-context-build-request-v1",
                       "workspace": TOOL.packaged_directory_identity(workspace), "intent_key": "a" * 64}
            recipe = {"toolchain": {"inventory": {"sha256": "b" * 64}}, "cargo_lock": {"sha256": "c" * 64}}
            with patch.object(TOOL, "__file__", str(driver)), patch.object(TOOL, "MANIFEST", manifest), patch.object(TOOL, "package", return_value=(manifest.parent, recipe, [], [], [])) as package_read, patch.object(TOOL.subprocess, "Popen") as spawn:
                yield package, workspace, request, package_read, spawn
                spawn.assert_not_called()

    def test_packaged_request_derives_only_fixed_paths_and_timeout_without_environment(self):
        with self.pure_packaged_fixture() as (package, workspace, request, package_read, _):
            ambient = dict(vars(TOOL.os))
            ambient["environ"] = {"COMPANY_PLUGIN_DATA": "/wrong/data", "CODEX_HOME": "/wrong/home", "MANIFEST": "/wrong/manifest", "CC": "/wrong/compiler"}
            with patch.object(TOOL, "os", SimpleNamespace(**ambient)):
                args = TOOL.packaged_build_args(json.dumps(request))
            self.assertEqual(args.manifest, package / "producer-inputs/native/codex/source-package.json")
            self.assertEqual(args.prepared, workspace / "inputs" / TOOL.MANIFEST_SHA256 / "prepared")
            self.assertEqual(args.toolchain, workspace / "toolchain" / ("b" * 64))
            self.assertEqual(args.cargo_home, workspace / "cargo-home" / (TOOL.MANIFEST_SHA256 + "-" + "c" * 64))
            self.assertEqual(args.output, workspace / "operations" / ("a" * 64) / "compiler-output")
            self.assertEqual(args.timeout, 1200)
            TOOL.packaged_build_fence(args)
            self.assertFalse((workspace / "operations").exists())
            package_read.assert_called_once_with(args.manifest)

    def test_packaged_request_rejects_duplicate_unknown_and_source_selector_fields(self):
        with self.pure_packaged_fixture() as (_, _, request, package_read, _):
            invalid = [{**request, key: "/caller-selected"} for key in ("manifest", "source", "compiler", "prepared", "toolchain", "cargo_home", "output", "timeout", "mode")]
            invalid += [{**request, "workspace": {**request["workspace"], "home": "/caller-selected"}}]
            for value in invalid:
                with self.subTest(value=value), self.assertRaises(ValueError):
                    TOOL.packaged_build_args(json.dumps(value))
            with self.assertRaisesRegex(ValueError, "duplicate"):
                TOOL.packaged_build_args(json.dumps(request)[:-1] + ', "intent_key":"' + "d" * 64 + '"}')
            with self.assertRaisesRegex(ValueError, "bounded"):
                TOOL.packaged_build_args(" " * 8193)
            package_read.assert_not_called()

    def test_packaged_request_rejects_stale_noncanonical_and_nonprivate_workspace(self):
        with self.pure_packaged_fixture() as (_, workspace, request, package_read, _):
            for fields in ({"ino": str(int(request["workspace"]["ino"]) + 1)}, {"dev": "01"}, {"path": str(workspace) + "/"}, {"path": str(workspace.parent / ".." / "peer-context-component/v1")}, {"path": "relative/peer-context-component/v1"}):
                with self.subTest(fields=fields), self.assertRaises(ValueError):
                    TOOL.packaged_build_args(json.dumps({**request, "workspace": {**request["workspace"], **fields}}))
            workspace.chmod(0o755)
            with self.assertRaisesRegex(ValueError, "private"):
                TOOL.packaged_build_args(json.dumps(request))
            package_read.assert_not_called()

    def test_packaged_request_rejects_workspace_inside_package_and_linked_original(self):
        with self.pure_packaged_fixture() as (package, workspace, request, package_read, _):
            nested = package / "data/peer-context-component/v1"
            nested.mkdir(parents=True)
            nested.chmod(0o700)
            nested.parent.chmod(0o700)
            with self.assertRaisesRegex(ValueError, "outside"):
                TOOL.packaged_build_args(json.dumps({**request, "workspace": TOOL.packaged_directory_identity(nested)}))
            workspace.rename(workspace.with_name("retained"))
            workspace.symlink_to(workspace.with_name("retained"), target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                TOOL.packaged_build_args(json.dumps(request))
            package_read.assert_not_called()

    def test_packaged_command_holds_outside_the_fixed_original_module(self):
        with patch.object(TOOL.subprocess, "Popen") as spawn, self.assertRaisesRegex(ValueError, "original installed"):
            TOOL.packaged_original_root()
        spawn.assert_not_called()

    def test_packaged_fence_preserves_original_package_workspace_and_parent_identities(self):
        with self.pure_packaged_fixture() as (package, workspace, request, _, _):
            args = TOOL.packaged_build_args(json.dumps(request))
            for directory in (workspace, workspace.parent, workspace.parent.parent, package):
                with self.subTest(directory=directory):
                    retained = directory.with_name(directory.name + "-retained")
                    directory.rename(retained)
                    directory.mkdir(mode=0o700)
                    with self.assertRaises((ValueError, OSError)):
                        TOOL.packaged_build_fence(args)
                    directory.rmdir()
                    retained.rename(directory)
                    TOOL.packaged_build_fence(args)

    def test_packaged_request_holds_when_workspace_changes_during_original_recipe_read(self):
        with self.pure_packaged_fixture() as (_, workspace, request, package_read, _):
            recipe = package_read.return_value
            def changed(_manifest):
                workspace.rename(workspace.with_name("retained-before-recipe"))
                workspace.mkdir(mode=0o700)
                return recipe
            package_read.side_effect = changed
            with self.assertRaisesRegex(ValueError, "root replaced"):
                TOOL.packaged_build_args(json.dumps(request))
            self.assertFalse((workspace / "operations").exists())

    def test_packaged_fence_holds_same_inode_data_mode_changes_without_chmod_or_provisioning(self):
        with self.pure_packaged_fixture() as (_, workspace, request, _, _):
            data = workspace.parent.parent
            data.chmod(0o755)  # Existing supported D may be readable, never writable by others.
            args = TOOL.packaged_build_args(json.dumps(request))
            original = TOOL.packaged_directory_identity(data)
            for mode in (0o750, 0o775):
                data.chmod(mode)
                self.assertEqual(TOOL.packaged_directory_identity(data), original)
                with self.assertRaisesRegex(ValueError, "metadata changed"):
                    TOOL.packaged_build_fence(args)
                self.assertEqual(stat.S_IMODE(data.stat().st_mode), mode)
            with self.assertRaisesRegex(ValueError, "group/world writable"):
                TOOL.packaged_build_args(json.dumps(request))
            self.assertFalse((workspace / "operations").exists())

    def test_packaged_c_mapping_uses_only_canonical_package_helper(self):
        with self.pure_packaged_fixture() as (package, _, _, _, _):
            original = package / "helpers/origin-sidecar-capture.c"
            original.parent.mkdir()
            data = b"FICTIONAL C, NEVER COMPILED\n"
            original.write_bytes(data)
            manifest = {"sidecar_capture": {"protocol": "soloco-origin-sidecar-source-build-v1",
                "source": {"path": TOOL.SIDECAR_SOURCE, "bytes": len(data), "sha256": TOOL.sha(data)},
                "binary": "origin-sidecar-capture", "arguments": ["origin-sidecar-capture-v1"],
                "target": "arm64-apple-macos11.0", "flags": list(TOOL.SIDECAR_FLAGS)}}
            self.assertEqual(TOOL.sidecar_source(TOOL.MANIFEST.parent, manifest), data)
            original.unlink()
            with self.assertRaises(OSError):
                TOOL.sidecar_source(TOOL.MANIFEST.parent, manifest)
            with self.assertRaisesRegex(ValueError, "another recipe root"):
                TOOL.sidecar_source(package, manifest)

    def test_duplicate_json_keys_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            json.loads('{"status":"pending","status":"frozen-source-unqualified"}', object_pairs_hook=TOOL.unique_object)

    def test_noncanonical_paths_are_rejected(self):
        for name in ("/outside", "../outside", "a/../outside", "a//b", "a/./b", "a\\b", "", ".", "a\0b", "a\nb"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                TOOL.relative(name)

    def test_valid_relative_path_is_unchanged(self):
        self.assertEqual(TOOL.relative("codex-rs/core/src/lib.rs"), "codex-rs/core/src/lib.rs")

    def test_extra_inventory_fields_are_rejected(self):
        with self.assertRaises(ValueError):
            TOOL.rows([{"path": "source", "bytes": 1, "sha256": "a" * 64, "mode": "100644", "ready": True}])

    def test_duplicate_inventory_entries_are_rejected(self):
        row = {"path": "source", "bytes": 1, "sha256": "a" * 64, "mode": "100644"}
        with self.assertRaises(ValueError):
            TOOL.rows([row, row])

    def test_unlisted_source_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / "source").write_bytes(b"source")
            (root / "extra").write_bytes(b"config")
            row = {"path": "source", "bytes": 6, "sha256": TOOL.sha(b"source"), "mode": "100644"}
            with self.assertRaisesRegex(ValueError, "unlisted"):
                TOOL.verify_complete_files(root, [row])

    def test_executable_distinction_is_verified(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / "source").write_bytes(b"source")
            (root / "source").chmod(0o644)
            row = {"path": "source", "bytes": 6, "sha256": TOOL.sha(b"source"), "mode": "100755"}
            with self.assertRaisesRegex(ValueError, "executable"):
                TOOL.verify_complete_files(root, [row])

    def test_symbolic_input_is_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / "original").write_bytes(b"original")
            (root / "alias").symlink_to(root / "original")
            with self.assertRaisesRegex(ValueError, "symlink"):
                TOOL.regular(root / "alias")

    def test_changed_pinned_bytes_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            p = root / "source"
            p.write_bytes(b"before")
            pin = {"path": "source", "bytes": 6, "sha256": TOOL.sha(b"before")}
            p.write_bytes(b"after!")
            with self.assertRaisesRegex(ValueError, "hash"):
                TOOL.read_pin(root, pin)

    def test_new_output_must_not_overlap_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            with self.assertRaisesRegex(ValueError, "overlap"):
                TOOL.fresh_directory(root / "new", (root,))
            self.assertFalse((root / "new").exists())

    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / "keep").write_bytes(b"keep")
            with self.assertRaises(ValueError):
                TOOL.fresh_directory(root)
            self.assertEqual((root / "keep").read_bytes(), b"keep")

    def test_physical_aliases_are_detected_without_case_folding(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            source, alias = root / "source", root / "SOURCE"
            source.mkdir()
            if alias.exists():
                with self.assertRaisesRegex(ValueError, "overlap"):
                    TOOL.fresh_directory(alias / "output", (source,))
                with self.assertRaisesRegex(ValueError, "disjoint"):
                    TOOL.build_domain(source, root / "prefix", root / "cache", alias / "output")
                self.assertFalse((source / "output").exists())
            else:
                alias.mkdir()
                self.assertEqual(TOOL.fresh_directory(alias / "output", (source,)), alias / "output")
            first, second = root / "first", root / "second"
            first.write_bytes(b"fixture")
            second.hardlink_to(first)
            self.assertTrue(TOOL.paths_overlap(first, second))

    def test_copy_checks_before_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            row = {"path": "new/source", "bytes": 6, "sha256": TOOL.sha(b"before"), "mode": "100644"}
            with self.assertRaises(ValueError):
                TOOL.install_bytes(Path(tmp).resolve(), row, b"after!")
            self.assertFalse((Path(tmp) / "new").exists())

    def test_exact_copy_is_readonly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            row = {"path": "new/source", "bytes": 6, "sha256": TOOL.sha(b"before"), "mode": "100644"}
            TOOL.install_bytes(root, row, b"before")
            self.assertEqual((root / "new/source").read_bytes(), b"before")
            self.assertEqual((root / "new/source").stat().st_mode & 0o777, 0o444)

    def test_pending_manifest_does_not_create_output_or_start_cargo(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            manifest = {key: None for key in TOOL.TOP}
            manifest.update(schema=TOOL.SCHEMA, status="pending-corrected-source")
            p = root / "source-package.json"
            p.write_text(json.dumps(manifest))
            args = argparse.Namespace(manifest=p, archive=root / "absent.tar.gz", output=root / "not-created")
            with patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not execute")):
                with self.assertRaisesRegex(ValueError, "source-owned manifest"):
                    TOOL.prepare(args)
                with patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX):
                    with self.assertRaisesRegex(ValueError, "source-owned manifest"):
                        TOOL.build(args)
            self.assertFalse(args.output.exists())

    def test_unknown_manifest_fields_remain_held(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp).resolve() / "source-package.json"
            p.write_text(json.dumps({**{key: None for key in TOOL.TOP}, "schema": TOOL.SCHEMA, "ready_override": True}))
            with self.assertRaisesRegex(ValueError, "source-owned manifest"):
                TOOL.package(p)

    def test_source_manifest_is_parsed_from_the_hashed_bytes(self):
        original = Path.read_text

        def reject_reopen(path, *args, **kwargs):
            if path == TOOL.MANIFEST:
                raise AssertionError("manifest must not be reopened after hash validation")
            return original(path, *args, **kwargs)

        with patch.object(Path, "read_text", new=reject_reopen):
            _, manifest, upstream, toolchain, composed = TOOL.package(TOOL.MANIFEST)
        self.assertIsNone(manifest["qualified_binary"])
        self.assertEqual((len(upstream), len(toolchain), len(composed)), (9264, 153, COHERENT_SOURCE_FILES))

    @contextlib.contextmanager
    def source_owned_manifest_fixture(self, manifest, extra_bytes=None):
        """Pure mutation fixture; no runtime manifest-selection API exists."""
        encoded = (json.dumps(manifest, indent=2) + "\n").encode()
        original = Path.read_bytes
        replacements = {TOOL.MANIFEST: encoded, **(extra_bytes or {})}
        def read_bytes(path):
            return replacements[path] if path in replacements else original(path)
        with patch.object(Path, "read_bytes", new=read_bytes), patch.object(TOOL, "MANIFEST_SHA256", TOOL.sha(encoded)):
            yield

    def test_missing_or_excess_overlay_rejected_before_payload_or_spawn(self):
        manifest = json.loads(TOOL.MANIFEST.read_bytes())
        self.assertEqual(len(manifest["overlay"]), TOOL.OVERLAY_COUNT)
        original_read_pin = TOOL.read_pin
        def no_overlay_read(root, artifact):
            self.assertFalse(artifact["path"].startswith("overlay/"), "count guard must reject before reading overlay payloads")
            return original_read_pin(root, artifact)
        for change in ("missing", "excess"):
            with self.subTest(change=change):
                altered = copy.deepcopy(manifest)
                if change == "missing":
                    altered["overlay"].pop()
                else:
                    altered["overlay"].append(copy.deepcopy(altered["overlay"][0]))
                with self.source_owned_manifest_fixture(altered), patch.object(TOOL, "read_pin", side_effect=no_overlay_read), patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
                    with self.assertRaisesRegex(ValueError, "exact reviewed overlay count"):
                        TOOL.package(TOOL.MANIFEST)

    def test_complete_coherent_binding_cannot_disagree_with_reconstructed_source(self):
        manifest = json.loads(TOOL.MANIFEST.read_bytes())
        binding = manifest["source_cut"]["bindings"]
        path = TOOL.MANIFEST.parent / binding["path"]
        original = path.read_bytes()
        rows = json.loads(original)
        rows[0]["sha256"] = "0" * 64
        changed = (json.dumps(rows, indent=2) + "\n").encode()
        self.assertEqual(len(original), len(changed), "same-size original-pin fixture")
        altered = copy.deepcopy(manifest)
        altered["source_cut"]["bindings"]["sha256"] = TOOL.sha(changed)
        with self.source_owned_manifest_fixture(altered, {path:changed}), patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
            with self.assertRaisesRegex(ValueError, "complete coherent source binding"):
                TOOL.package(TOOL.MANIFEST)

    def test_archive_copy_uses_only_registered_members(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            payload = root / "package"
            payload.mkdir()
            (payload / "lock").write_bytes(b"new-lock")
            archive = root / "input.tar.gz"
            with tarfile.open(archive, "w:gz") as stream:
                for name, data in [("codex-" + TOOL.COMMIT + "/codex-rs/Cargo.lock", b"old-lock"), ("../../escaped", b"never-copy")]:
                    member = tarfile.TarInfo(name)
                    member.size, member.mode = len(data), 0o644
                    stream.addfile(member, io.BytesIO(data))
            old = {"path": "codex-rs/Cargo.lock", "bytes": 8, "sha256": TOOL.sha(b"old-lock"), "mode": "100644"}
            new = {**old, "sha256": TOOL.sha(b"new-lock")}
            m = {"upstream": {"archive_sha256": TOOL.sha(archive.read_bytes())}, "overlay": [], "cargo_lock": {"path": "lock", "bytes": 8, "sha256": TOOL.sha(b"new-lock")}}
            manifest = payload / "fixture.json"
            manifest.write_text("fixture, not production authority")
            args = argparse.Namespace(manifest=manifest, archive=archive, output=root / "output")
            # A private test double supplies DATA, never an accepted source cut.
            with patch.object(TOOL, "package", return_value=(payload, m, [old], [], [new])), contextlib.redirect_stdout(io.StringIO()):
                TOOL.prepare(args)
            self.assertEqual((args.output / "source/codex-rs/Cargo.lock").read_bytes(), b"new-lock")
            receipt = json.loads((args.output / "prepared-source.json").read_text())
            self.assertFalse(receipt["source_compiled"])
            self.assertFalse(receipt["native_qualified"])
            self.assertFalse((root / "escaped").exists())

    def test_wrong_archive_hash_creates_no_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            archive = root / "input.tar.gz"
            archive.write_bytes(b"unapproved")
            args = argparse.Namespace(manifest=root / "unused", archive=archive, output=root / "output")
            with patch.object(TOOL, "package", return_value=(root / "package", {"upstream": {"archive_sha256": "0" * 64}}, [], [], [])):
                with self.assertRaisesRegex(ValueError, "exact upstream"):
                    TOOL.prepare(args)
            self.assertFalse(args.output.exists())

    def test_required_source_generated_domain_and_environment(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            source, prefix, cache, output = [base / x for x in ("source", "prefix", "cache", "output")]
            ambient = {**vars(TOOL.os), "environ": {**TOOL.os.environ,
                       "HOME": "/fixture-home", "CODEX_HOME": "/fixture-codex", "AWS_ACCESS_KEY_ID": "fixture-only"}}
            # Adversarial DATA only; never change the process HOME/CODEX_HOME.
            with patch.object(TOOL, "os", SimpleNamespace(**ambient)):
                argv, env, profile = TOOL.build_domain(source, prefix, cache, output)
            self.assertEqual(argv[:3], ["/usr/bin/sandbox-exec", "-p", profile])
            self.assertEqual(argv[3], str(prefix / "bin/cargo"))
            self.assertIn("(deny default)", profile)
            self.assertIn("(deny network*)", profile)
            self.assertNotIn("(allow default)", profile)
            self.assertIn("(allow signal (target same-sandbox))", profile)
            self.assertNotIn("process-fork signal", profile)
            self.assertNotIn("fixture-home", profile)
            self.assertTrue({"HOME", "CODEX_HOME", "AWS_ACCESS_KEY_ID"}.isdisjoint(env))
            self.assertEqual(env["GIT_CONFIG_GLOBAL"], "/dev/null")
            self.assertEqual(env["GIT_CONFIG_SYSTEM"], "/dev/null")
            self.assertEqual(env["GIT_CONFIG_NOSYSTEM"], "1")
            self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")
            settings = {env["GIT_CONFIG_KEY_" + str(i)]: env["GIT_CONFIG_VALUE_" + str(i)] for i in range(int(env["GIT_CONFIG_COUNT"]))}
            self.assertEqual(settings["credential.helper"], "")
            self.assertEqual(settings["protocol.allow"], "never")
            writes = next(line for line in profile.splitlines() if line.startswith("(allow file-write*"))
            self.assertIn('(subpath "' + str(output) + '")', writes)
            self.assertNotIn('(subpath "' + str(cache) + '")', writes)
            self.assertNotIn(str(source), writes)
            self.assertNotIn(str(prefix), writes)
            for name in TOOL.CACHE_METADATA:
                self.assertIn('(literal "' + str(cache / name) + '")', writes)

    def test_missing_or_unsupported_build_domain_never_spawns(self):
        with patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
            with patch.object(TOOL.sys, "platform", "linux"):
                with self.assertRaisesRegex(ValueError, "macOS"):
                    TOOL.build(argparse.Namespace())
            with tempfile.TemporaryDirectory() as tmp:
                with patch.object(TOOL.sys, "platform", "darwin"), patch.object(TOOL.os, "uname", return_value=SimpleNamespace(machine="arm64")), patch.object(TOOL, "SANDBOX", Path(tmp).resolve() / "missing"):
                    with self.assertRaises(OSError):
                        TOOL.build(argparse.Namespace())

    def test_loader_minimum_keeps_root_read_literal_and_no_speculative_grants(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            source, prefix, cache, output = [base / x for x in ("source", "prefix", "cache", "output")]
            _, _, profile = TOOL.build_domain(source, prefix, cache, output)
            self.assertIn('(allow file-read* file-test-existence (literal "/"))', profile)
            self.assertNotIn('(subpath "/")', profile)
            mapping = next(line for line in profile.splitlines() if line.startswith("(allow file-map-executable"))
            for allowed in (prefix, output, Path("/usr/lib"), TOOL.SELECTED_TOOLCHAIN, TOOL.SELECTED_XCODE / "usr/lib"):
                self.assertIn('(subpath "'+str(allowed)+'")', mapping)
            self.assertNotIn('(allow process-info*', profile)
            self.assertNotIn('opendirectoryd.libinfo', profile)
            self.assertNotIn('(allow system-mac-syscall', profile)
            self.assertNotIn('(allow mach-lookup)', profile)

    def test_platform_reads_exclude_data_volume_and_process_arguments(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            _, _, profile = TOOL.build_domain(*(base / x for x in ("source", "prefix", "cache", "output")))
            self.assertNotIn('(subpath "/System")', profile)
            self.assertNotIn('/System/Volumes/Data', profile)
            self.assertNotIn('(subpath "/Library/Developer")', profile)
            self.assertIn('(subpath "/System/Library")', profile)
            self.assertIn('(sysctl-name "hw.ncpu")', profile)
            self.assertNotIn('(allow sysctl-read)', profile)
            self.assertNotIn('kern.procargs2', profile)

    def test_ambiguous_or_overlapping_build_roots_are_rejected(self):
        for text in ('/fixture/quote"', "/fixture/back\\slash", "/fixture/new\nline"):
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, "Seatbelt"):
                TOOL.sb_string(text)
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            with self.assertRaisesRegex(ValueError, "disjoint"):
                TOOL.build_domain(base / "source", base / "prefix", base / "prefix/cache", base / "output")

    def test_cache_config_and_credentials_remain_held(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp).resolve()
            (cache / "registry").mkdir()
            (cache / "credentials.toml").write_text("fixture-only")
            with self.assertRaisesRegex(ValueError, "unreviewed"):
                TOOL.validate_cache(cache)

    def test_system_config_metadata_rejects_owner_mode_links_and_type(self):
        good = dict(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_nlink=1)
        TOOL.system_config_metadata(SimpleNamespace(**good))
        TOOL.system_config_metadata(SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0), directory=True)
        for change in ({"st_uid": 501}, {"st_mode": stat.S_IFREG | 0o664}, {"st_mode": stat.S_IFREG | 0o755}, {"st_nlink": 2}, {"st_mode": stat.S_IFDIR | 0o644}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                TOOL.system_config_metadata(SimpleNamespace(**{**good, **change}))
        with self.assertRaises(ValueError):
            TOOL.system_config_metadata(SimpleNamespace(st_mode=stat.S_IFDIR | 0o777, st_uid=0), directory=True)

    def test_exact_system_config_fixture_is_readonly_and_verified(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / "openssl.cnf"
            data = b"[ req ]\n# pure fixture, not system policy\n"
            path.write_bytes(data)
            before = path.stat()
            with patch.object(TOOL, "OPENSSL_CONFIG", path), patch.object(TOOL, "OPENSSL_CONFIG_BYTES", len(data)), patch.object(TOOL, "OPENSSL_CONFIG_SHA256", TOOL.sha(data)), patch.object(TOOL, "system_config_metadata") as ownership:
                self.assertEqual(VALIDATE_OPENSSL_CONFIG(), path)
                self.assertEqual(ownership.call_count, len(path.parents) + 1)
            after = path.stat()
            self.assertEqual(path.read_bytes(), data)
            self.assertEqual((before.st_ino, before.st_mode, before.st_mtime_ns), (after.st_ino, after.st_mode, after.st_mtime_ns))

    def test_changed_system_config_or_include_requires_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp).resolve() / "openssl.cnf"
            original = b"[ req ]\n"
            for data in (b"[ bad ]\n", original + b".include /private/config\n"):
                path.write_bytes(data)
                with patch.object(TOOL, "OPENSSL_CONFIG", path), patch.object(TOOL, "OPENSSL_CONFIG_BYTES", len(original)), patch.object(TOOL, "OPENSSL_CONFIG_SHA256", TOOL.sha(original)), patch.object(TOOL, "system_config_metadata"):
                    with self.assertRaisesRegex(ValueError, "configuration (size|bytes) changed"):
                        VALIDATE_OPENSSL_CONFIG()

    def test_system_config_symlink_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            (base / "original").write_bytes(b"fixture")
            alias = base / "openssl.cnf"
            alias.symlink_to(base / "original")
            with patch.object(TOOL, "OPENSSL_CONFIG", alias), self.assertRaisesRegex(ValueError, "symlink"):
                VALIDATE_OPENSSL_CONFIG()

    def test_system_crypto_read_is_one_literal_without_policy_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            _, env, profile = TOOL.build_domain(*(base / x for x in ("source", "prefix", "cache", "output")))
            self.config_guard.assert_called_once_with()
            self.assertIn('(allow file-read-data (literal "/private/etc/ssl/openssl.cnf"))', profile)
            self.assertNotIn('(subpath "/private/etc', profile)
            self.assertNotIn('(subpath "/etc', profile)
            self.assertNotIn("OPENSSL_CONF", env)
            self.assertTrue({"HOME", "CODEX_HOME"}.isdisjoint(env))
            self.assertIn('(deny network*)', profile)
            self.assertNotIn('/private/etc/ssl/openssl.cnf', next(x for x in profile.splitlines() if x.startswith('(allow file-write*')))

    def test_unreviewed_system_config_holds_before_output_or_spawn(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            prepared, prefix, cache = [base / x for x in ("prepared", "prefix", "cache")]
            source = prepared / "source"
            (source / "codex-rs").mkdir(parents=True)
            (prefix / "bin").mkdir(parents=True)
            (cache / "registry").mkdir(parents=True)
            record = {"schema": "soloco-prepared-native-source-v1", "manifest_sha256": TOOL.MANIFEST_SHA256, "files": [], "source_compiled": False, "native_qualified": False}
            (prepared / "prepared-source.json").write_text(json.dumps(record))
            args = argparse.Namespace(manifest=TOOL.MANIFEST, prepared=prepared, toolchain=prefix, cargo_home=cache, output=base / "output", timeout=5)
            with patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=(base / "package", {}, [], [], [])), patch.object(TOOL, "verify_complete_files"), patch.object(TOOL, "validate_openssl_config", side_effect=ValueError("system configuration requires review")), patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
                with self.assertRaisesRegex(ValueError, "configuration requires review"):
                    TOOL.build(args)
            self.assertFalse(args.output.exists())

    def test_complete_manifest_generation_is_deterministic_and_not_self_referential(self):
        _, _, _, _, expected = TOOL.package(TOOL.MANIFEST)
        first = TOOL.compiled_source_manifest_bytes(expected)
        second = TOOL.compiled_source_manifest_bytes(expected)
        self.assertEqual(first, second)
        value = json.loads(first)
        self.assertEqual(value["files_count"], COHERENT_SOURCE_FILES)
        self.assertEqual(value["files"], expected)
        self.assertEqual(value["source_package_sha256"], TOOL.MANIFEST_SHA256)
        self.assertEqual(value["upstream"], {"commit": TOOL.COMMIT, "tree": TOOL.TREE})
        self.assertEqual(value["schema"], "soloco-compiled-native-inputs-v1")
        self.assertEqual(set(value), {"schema", "upstream", "source_package_sha256", "files_count", "files"})
        self.assertEqual(first, (json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":")) + "\n").encode("utf-8"))
        self.assertLessEqual(len(first), 16 * 1024 * 1024)

    def test_manifest_generation_rejects_invalid_modes_paths_and_capacity(self):
        row = {"path": "codex-rs/source", "bytes": 1, "sha256": "a" * 64, "mode": "100644"}
        for changed in ({**row, "mode": "100777"}, {**row, "path": "outside/source"}):
            with self.subTest(row=changed), self.assertRaises(ValueError):
                TOOL.compiled_source_manifest_bytes([changed])
        with patch.object(TOOL, "MAX_COMPILED_MANIFEST_BYTES", 1), self.assertRaisesRegex(ValueError, "runtime association bound"):
            TOOL.compiled_source_manifest_bytes([row])

    def test_changed_source_holds_before_manifest_output_or_spawn(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, args, sr, tr = pure_build_fixture(tmp)
            (args.prepared / "source/codex-rs/Cargo.lock").write_bytes(b"FAIL")
            with self.pure_mock_sidecar_build(args) as helper_build, patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
                with self.assertRaisesRegex(ValueError, "source changed"):
                    TOOL.build(args)
            self.assertFalse(args.output.exists())

    def test_pure_mock_success_binds_exact_artifact_and_ignores_caller_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, args, sr, tr = pure_build_fixture(tmp)
            observed = {}
            def fake_spawn(argv, **kwargs):
                data = (args.output / "compiled-source-manifest.json").read_bytes()
                observed["digest"] = TOOL.sha(data)
                self.assertEqual(kwargs["env"]["SOLOCO_SOURCE_MANIFEST_SHA256"], observed["digest"])
                self.assertNotEqual(observed["digest"], "f" * 64)
                self.assertEqual(set(json.loads(data)), {"schema", "upstream", "source_package_sha256", "files_count", "files"})
                binary = args.output / "target" / TOOL.TARGET / "release/codex-soloco-protected-host"
                binary.parent.mkdir(parents=True)
                binary.write_bytes(b"PURE TEST DATA, NEVER EXECUTED")
                return SimpleNamespace(wait=lambda timeout: 0)
            with self.pure_mock_sidecar_build(args) as helper_build, patch.dict(TOOL.os.environ, {"SOLOCO_SOURCE_MANIFEST_SHA256": "f" * 64}), patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL.subprocess, "Popen", side_effect=fake_spawn) as spawn, contextlib.redirect_stdout(io.StringIO()):
                result = TOOL.build(args)
            self.assertEqual(result, 0)
            self.assertEqual(spawn.call_count, 1)
            self.assertEqual(helper_build.call_count, 1)
            plan = json.loads((args.output / "plan.json").read_text())
            receipt = json.loads((args.output / "receipt.json").read_text())
            binding = receipt["compiled_source_manifest"]
            self.assertEqual(binding, plan["compiled_source_manifest"])
            self.assertEqual(binding["sha256"], observed["digest"])
            self.assertEqual(set(binding), {"schema", "path", "bytes", "sha256"})
            self.assertEqual(Path(binding["path"]).stat().st_mode & 0o777, 0o444)
            self.assertEqual(receipt["binary"]["sha256"], TOOL.sha(b"PURE TEST DATA, NEVER EXECUTED"))
            self.assertFalse(receipt["native_qualified"])
            self.assertFalse(receipt["source_slot_populated"])
            self.assertEqual(plan["environment"]["SOLOCO_SOURCE_MANIFEST_SHA256"], binding["sha256"])
            helper = receipt["sidecar_capture"]
            self.assertEqual(helper["status"], "compiled-source-only")
            self.assertEqual(helper["binary"]["sha256"], TOOL.sha(b"PURE MOCK HELPER, NEVER EXECUTED"))
            self.assertEqual(helper["binary"]["mode"], "100555")
            self.assertFalse(helper["native_qualified"])

    def test_pure_mock_zero_exit_cannot_accept_changed_manifest(self):
        for change in ("bytes", "missing", "mode", "symlink"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                base, args, sr, tr = pure_build_fixture(tmp)
                def fake_spawn(argv, **kwargs):
                    artifact = args.output / "compiled-source-manifest.json"
                    if change == "bytes":
                        data = artifact.read_bytes().replace(b'"files"', b'"FILES"', 1)
                        artifact.chmod(0o600);artifact.write_bytes(data);artifact.chmod(0o444)
                    elif change == "missing":
                        artifact.unlink()
                    elif change == "mode":
                        artifact.chmod(0o644)
                    else:
                        artifact.unlink();artifact.symlink_to(args.prepared / "prepared-source.json")
                    return SimpleNamespace(wait=lambda timeout: 0)
                with self.pure_mock_sidecar_build(args) as helper_build, patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL.subprocess, "Popen", side_effect=fake_spawn), contextlib.redirect_stdout(io.StringIO()):
                    result = TOOL.build(args)
                self.assertEqual(result, 1)
                receipt = json.loads((args.output / "receipt.json").read_text())
                self.assertEqual(receipt["status"], "changed-input-or-output-held")
                self.assertIsNone(receipt["binary"])
                self.assertFalse(receipt["native_qualified"])

    def test_pure_mock_zero_exit_cannot_accept_changed_actual_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, args, sr, tr = pure_build_fixture(tmp)
            def fake_spawn(argv, **kwargs):
                (args.prepared / "source/codex-rs/Cargo.lock").write_bytes(b"FAIL")
                return SimpleNamespace(wait=lambda timeout: 0)
            with self.pure_mock_sidecar_build(args) as helper_build, patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL.subprocess, "Popen", side_effect=fake_spawn), contextlib.redirect_stdout(io.StringIO()):
                result = TOOL.build(args)
            self.assertEqual(result, 1)
            receipt = json.loads((args.output / "receipt.json").read_text())
            self.assertEqual(receipt["status"], "changed-input-or-output-held")
            self.assertIn("source changed", receipt["verification_error"])
            self.assertIsNone(receipt["binary"])

    def test_cli_cannot_select_a_compiled_source_hash(self):
        values = ["tool", "build", "--prepared", "/fixture/prepared", "--toolchain", "/fixture/toolchain", "--cargo-home", "/fixture/cache", "--output", "/fixture/output", "--source-manifest-sha256", "f" * 64]
        errors = io.StringIO()
        with patch.object(TOOL.sys, "argv", values), patch.object(TOOL, "build", side_effect=AssertionError("must not build")), contextlib.redirect_stderr(errors), self.assertRaises(SystemExit) as result:
            TOOL.main()
        self.assertEqual(result.exception.code, 2)
        self.assertIn("unrecognized arguments", errors.getvalue())

    def test_selected_SDK_owner_modes_are_exact_and_not_falsely_root_trusted(self):
        expected = {"uid": 502, "gid": 20, "mode": "0o755"}
        good = dict(st_mode=stat.S_IFDIR | 0o755, st_uid=502, st_gid=20, st_dev=1, st_ino=2)
        result = TOOL.selected_sdk_metadata(SimpleNamespace(**good), expected, directory=True)
        self.assertEqual(result["uid"], 502)
        for change in ({"st_uid": 0}, {"st_gid": 80}, {"st_mode": stat.S_IFDIR | 0o777}, {"st_mode": stat.S_IFLNK | 0o755}):
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, "ownership/type/mode"):
                TOOL.selected_sdk_metadata(SimpleNamespace(**{**good, **change}), expected, directory=True)
        parent = SimpleNamespace(st_mode=stat.S_IFDIR | 0o775, st_uid=0, st_gid=80, st_dev=1, st_ino=1)
        TOOL.selected_sdk_metadata(parent, {"uid": 0, "gid": 80, "mode": "0o775"}, directory=True)

    def test_selected_SDK_file_fixture_pin_checks_actual_bytes_and_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp).resolve() / "clang-fixture"
            p.write_bytes(b"fixture compiler, not executable");p.chmod(0o644)
            info = p.stat()
            row = {"path": str(p), "bytes": info.st_size, "sha256": TOOL.sha(p.read_bytes()), "uid": info.st_uid, "gid": info.st_gid, "mode": "0o644"}
            self.assertEqual(TOOL.selected_sdk_file_pin(row)["sha256"], row["sha256"])
            p.write_bytes(b"X" * info.st_size)
            with self.assertRaisesRegex(ValueError, "hash changed"):
                TOOL.selected_sdk_file_pin(row)
            p.unlink();p.symlink_to(Path(tmp).resolve() / "elsewhere")
            with self.assertRaisesRegex(ValueError, "symlink"):
                TOOL.selected_sdk_file_pin(row)

    def test_selected_SDK_fixture_requires_original_selection_and_canonical_roots(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve();developer = base / "Developer";developer.mkdir()
            fixture = developer / "clang";fixture.write_bytes(b"pure fixture");fixture.chmod(0o644)
            link = base / "selected";link.symlink_to(developer)
            d = developer.stat();f = fixture.stat();original = Path.lstat
            def root_link(path, *args, **kwargs):
                actual = original(path, *args, **kwargs)
                if path == link:
                    return SimpleNamespace(st_mode=actual.st_mode, st_uid=0, st_gid=0, st_dev=actual.st_dev, st_ino=actual.st_ino)
                return actual
            directories = [{"path": str(developer), "uid": d.st_uid, "gid": d.st_gid, "mode": oct(d.st_mode & 0o777)}]
            pins = [{"path": str(fixture), "bytes": f.st_size, "sha256": TOOL.sha(fixture.read_bytes()), "uid": f.st_uid, "gid": f.st_gid, "mode": "0o644"}]
            with patch.object(TOOL, "SELECTED_LINK", link), patch.object(TOOL, "SELECTED_XCODE", developer), patch.object(TOOL, "SELECTED_SDK_DIRS", directories), patch.object(TOOL, "SELECTED_SDK_PINS", pins), patch.object(Path, "lstat", new=root_link):
                value = VALIDATE_SELECTED_SDK()
                self.assertEqual(value["selection_link"]["target"], str(developer))
                self.assertEqual(value["files"][0]["sha256"], pins[0]["sha256"])
                link.unlink();link.symlink_to(base / "unreviewed")
                with self.assertRaisesRegex(ValueError, "unsupported selected Xcode"):
                    VALIDATE_SELECTED_SDK()
                link.unlink();link.symlink_to(developer)
                alias = base / "alias";alias.symlink_to(developer)
                with patch.object(TOOL, "SELECTED_SDK_DIRS", [{**directories[0], "path": str(alias)}]), self.assertRaisesRegex(ValueError, "symlink"):
                    VALIDATE_SELECTED_SDK()

    def test_selected_SDK_read_map_and_environment_are_source_fixed(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            ambient = {"DEVELOPER_DIR": "/fixture/other-Xcode", "SDKROOT": "/fixture/other-SDK", "CC": "/fixture/cc", "CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER": "/fixture/ld"}
            with patch.dict(TOOL.os.environ, ambient):
                _, env, profile = TOOL.build_domain(*(base / x for x in ("source", "prefix", "cache", "output")))
            self.assertEqual(env["DEVELOPER_DIR"], str(TOOL.SELECTED_XCODE))
            self.assertEqual(env["SDKROOT"], str(TOOL.SELECTED_SDK))
            self.assertEqual(env["CC"], str(TOOL.SELECTED_CLANG))
            self.assertEqual(env["CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER"], str(TOOL.SELECTED_CLANG))
            for value in ambient.values():self.assertNotIn(value, json.dumps(env))
            for allowed in TOOL.SELECTED_SDK_READ_ROOTS:self.assertIn('(subpath "'+str(allowed)+'")', profile)
            mapping = next(x for x in profile.splitlines() if x.startswith('(allow file-map-executable'))
            self.assertIn(str(TOOL.SELECTED_TOOLCHAIN), mapping)
            self.assertIn(str(TOOL.SELECTED_XCODE / "usr/lib"), mapping)
            self.assertNotIn(str(TOOL.SELECTED_SDK), mapping)
            writes = next(x for x in profile.splitlines() if x.startswith('(allow file-write*'))
            self.assertNotIn('/Applications', writes)
            self.assertNotIn('(subpath "/Applications")', profile)
            self.assertNotIn('(subpath "/private")', profile)
            self.assertNotIn('/Library/Developer/CommandLineTools', profile)
            self.assertNotIn('/Applications/Xcode.app/', profile)
            self.assertIn('(deny network*)', profile)
            self.assertTrue({"HOME", "CODEX_HOME"}.isdisjoint(env))

    def test_private_build_roots_cannot_grant_writes_inside_selected_Xcode(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve();app = base / "Xcode.app";app.mkdir()
            developer = app / "Contents/Developer"
            output = app / "new-output"
            with patch.object(TOOL, "SELECTED_XCODE", developer), self.assertRaisesRegex(ValueError, "overlaps selected Xcode"):
                TOOL.build_domain(base / "source", base / "prefix", base / "cache", output)
            self.assertFalse(output.exists())
            with patch.object(TOOL, "SELECTED_XCODE", developer), self.assertRaisesRegex(ValueError, "overlaps selected Xcode"):
                TOOL.build_domain(base / "source", base / "prefix", app / "cache", base / "output")

    def test_unqualified_selected_SDK_holds_before_output_or_spawn(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, args, sr, tr = pure_build_fixture(tmp)
            with self.pure_mock_sidecar_build(args) as helper_build, patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL, "validate_selected_sdk", side_effect=ValueError("selected SDK changed")), patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
                with self.assertRaisesRegex(ValueError, "selected SDK changed"):
                    TOOL.build(args)
            self.assertFalse(args.output.exists())

    def test_pure_mock_success_retains_the_observed_selected_SDK_binding(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, args, sr, tr = pure_build_fixture(tmp)
            def fake_spawn(argv, **kwargs):
                binary = args.output / "target" / TOOL.TARGET / "release/codex-soloco-protected-host"
                binary.parent.mkdir(parents=True);binary.write_bytes(b"PURE MOCK SDK BUILD")
                return SimpleNamespace(wait=lambda timeout: 0)
            with self.pure_mock_sidecar_build(args) as helper_build, patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL.subprocess, "Popen", side_effect=fake_spawn), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(TOOL.build(args), 0)
            plan = json.loads((args.output / "plan.json").read_text());receipt = json.loads((args.output / "receipt.json").read_text())
            self.assertEqual(plan["selected_sdk"], receipt["selected_sdk"])
            self.assertEqual(receipt["selected_sdk"], {"schema": "PURE_MOCK_SELECTED_SDK_NO_HOST_READ"})
            self.assertFalse(receipt["native_qualified"])

    def test_pure_mock_zero_exit_holds_on_changed_selected_SDK(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, args, sr, tr = pure_build_fixture(tmp)
            before, after = {"observed": "fixture-before"}, {"observed": "fixture-after"}
            with self.pure_mock_sidecar_build(args) as helper_build, patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL, "validate_selected_sdk", side_effect=[before, before, after]), patch.object(TOOL.subprocess, "Popen", return_value=SimpleNamespace(wait=lambda timeout: 0)), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(TOOL.build(args), 1)
            receipt = json.loads((args.output / "receipt.json").read_text())
            self.assertEqual(receipt["status"], "changed-input-or-output-held")
            self.assertIn("selected SDK changed", receipt["verification_error"])
            self.assertIsNone(receipt["binary"])

    def test_failed_sandbox_never_falls_back_to_direct_cargo(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            prepared, prefix, cache = [base / x for x in ("prepared", "prefix", "cache")]
            source = prepared / "source"
            (source / "codex-rs").mkdir(parents=True)
            (prefix / "bin").mkdir(parents=True)
            (cache / "registry").mkdir(parents=True)
            (source / "codex-rs/Cargo.lock").write_bytes(b"lock")
            (prefix / "bin/cargo").write_bytes(b"cargo!")
            (prefix / "bin/cargo").chmod(0o755)
            sr = {"path": "codex-rs/Cargo.lock", "bytes": 4, "sha256": TOOL.sha(b"lock"), "mode": "100644"}
            tr = {"path": "bin/cargo", "bytes": 6, "sha256": TOOL.sha(b"cargo!"), "mode": "100755"}
            (prepared / "prepared-source.json").write_text(json.dumps({"schema": "soloco-prepared-native-source-v1", "manifest_sha256": TOOL.MANIFEST_SHA256, "files": [sr], "source_compiled": False, "native_qualified": False}))
            args = argparse.Namespace(manifest=TOOL.MANIFEST, prepared=prepared, toolchain=prefix, cargo_home=cache, output=base / "output", timeout=5)
            with self.pure_mock_sidecar_build(args) as helper_build, patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=pure_build_package(base, sr, tr)), patch.object(TOOL.subprocess, "Popen", return_value=SimpleNamespace(wait=lambda timeout: 1)) as spawn, contextlib.redirect_stdout(io.StringIO()):
                result = TOOL.build(args)
            self.assertEqual(result, 1)
            self.assertEqual(spawn.call_count, 1)
            self.assertEqual(helper_build.call_count, 1)
            self.assertEqual(spawn.call_args.args[0][:2], ["/usr/bin/sandbox-exec", "-p"])
            self.assertEqual(spawn.call_args.kwargs["stdin"], TOOL.subprocess.DEVNULL)
            self.assertTrue({"HOME", "CODEX_HOME"}.isdisjoint(spawn.call_args.kwargs["env"]))
            receipt = json.loads((args.output / "receipt.json").read_text())
            self.assertEqual(receipt["status"], "failed")
            self.assertFalse(receipt["native_qualified"])
            self.assertIsNone(receipt["binary"])


if __name__ == "__main__":
    unittest.main()
