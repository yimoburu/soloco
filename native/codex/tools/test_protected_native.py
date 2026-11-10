"""Pure temporary-data checks. No upstream checkout, compiler or native action."""
import argparse
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


class TemporaryDataChecks(unittest.TestCase):
    def setUp(self):
        # Pure CI never consults the runner's real system crypto configuration.
        self.config_guard = self.enterContext(patch.object(TOOL, "validate_openssl_config", return_value=TOOL.OPENSSL_CONFIG))

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
        self.assertEqual((len(upstream), len(toolchain), len(composed)), (9264, 153, 9274))

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
            with patch.dict(TOOL.os.environ, {"HOME": "/fixture-home", "CODEX_HOME": "/fixture-codex", "AWS_ACCESS_KEY_ID": "fixture-only"}):
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
            self.assertIn('(allow file-map-executable (subpath "'+str(prefix)+'") (subpath "'+str(output)+'") (subpath "/usr/lib"))', profile)
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
        self.assertEqual(value["files_count"], 9274)
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
            with patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=(base / "package", {}, [], [tr], [sr])), patch.object(TOOL.subprocess, "Popen", side_effect=AssertionError("must not spawn")):
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
            with patch.dict(TOOL.os.environ, {"SOLOCO_SOURCE_MANIFEST_SHA256": "f" * 64}), patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=(base / "package", {}, [], [tr], [sr])), patch.object(TOOL.subprocess, "Popen", side_effect=fake_spawn) as spawn, contextlib.redirect_stdout(io.StringIO()):
                result = TOOL.build(args)
            self.assertEqual(result, 0)
            self.assertEqual(spawn.call_count, 1)
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
                with patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=(base / "package", {}, [], [tr], [sr])), patch.object(TOOL.subprocess, "Popen", side_effect=fake_spawn), contextlib.redirect_stdout(io.StringIO()):
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
            with patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=(base / "package", {}, [], [tr], [sr])), patch.object(TOOL.subprocess, "Popen", side_effect=fake_spawn), contextlib.redirect_stdout(io.StringIO()):
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
            with patch.object(TOOL, "require_build_domain", return_value=TOOL.SANDBOX), patch.object(TOOL, "package", return_value=(base / "package", {}, [], [tr], [sr])), patch.object(TOOL.subprocess, "Popen", return_value=SimpleNamespace(wait=lambda timeout: 1)) as spawn, contextlib.redirect_stdout(io.StringIO()):
                result = TOOL.build(args)
            self.assertEqual(result, 1)
            self.assertEqual(spawn.call_count, 1)
            self.assertEqual(spawn.call_args.args[0][:2], ["/usr/bin/sandbox-exec", "-p"])
            self.assertEqual(spawn.call_args.kwargs["stdin"], TOOL.subprocess.DEVNULL)
            self.assertTrue({"HOME", "CODEX_HOME"}.isdisjoint(spawn.call_args.kwargs["env"]))
            receipt = json.loads((args.output / "receipt.json").read_text())
            self.assertEqual(receipt["status"], "failed")
            self.assertFalse(receipt["native_qualified"])
            self.assertIsNone(receipt["binary"])


if __name__ == "__main__":
    unittest.main()
