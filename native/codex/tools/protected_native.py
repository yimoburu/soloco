#!/usr/bin/env python3
"""Prepare and build a pinned companion source package; never install or qualify it."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import stat
import subprocess
import sys
import tarfile
import time

SCHEMA = "soloco-protected-native-source-package-v1"
COMMIT = "c40729ea5cf8e947481b130c59807273eda2f8e9"
TREE = "078c14cecf94b522a2eff48b30996bf3f4d1bf7a"
TARGET = "aarch64-apple-darwin"
SANDBOX = Path("/usr/bin/sandbox-exec")
MANIFEST = Path(__file__).resolve().parents[1] / "source-package.json"
MANIFEST_SHA256 = "7ef650d4616dbc28f85b57f53399d96591f5b9db62af328513ac688111733780"
OPENSSL_CONFIG = Path("/private/etc/ssl/openssl.cnf")
OPENSSL_CONFIG_BYTES = 745
OPENSSL_CONFIG_SHA256 = "025f5e31cd7b2248a0a661d8d346452c31d98e280f3420c3f6017c74c829ae73"
OVERLAY_COUNT = 112
MAX_BYTES = 128 * 1024 * 1024
MAX_TOOLCHAIN_BYTES = 2 * 1024 * 1024 * 1024
COMPILED_SOURCE_SCHEMA = "soloco-compiled-native-inputs-v1"
MAX_COMPILED_MANIFEST_BYTES = 16 * 1024 * 1024
TOP = {"schema", "status", "upstream", "source_cut", "overlay", "cargo_lock", "toolchain", "build", "qualified_binary", "runtime_integration"}
CACHE_METADATA = (".package-cache", ".package-cache-mutate", ".global-cache", ".global-cache-shm", ".global-cache-wal", ".global-cache-journal")
SYSTEM_READ_ROOTS = ("/System/Library", "/System/iOSSupport/System/Library", "/usr/lib", "/usr/share", "/usr/bin", "/bin", "/sbin", "/private/var/db/dyld")

SELECTED_XCODE = Path('/Applications/Xcode-26.3.0.app/Contents/Developer')
SELECTED_TOOLCHAIN = SELECTED_XCODE / "Toolchains/XcodeDefault.xctoolchain"
SELECTED_SDK = SELECTED_XCODE / "Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"
SELECTED_CLANG = SELECTED_TOOLCHAIN / "usr/bin/clang"
SELECTED_LINK = Path("/private/var/db/xcode_select_link")
# Qualified user-owned build input, NOT root-owned OS trust. /Applications is
# the explicitly observed root:admin0775 ancestor, mutable by host administrators.
SELECTED_SDK_DIRS = [{'path': '/Applications', 'uid': 0, 'gid': 80, 'mode': '0o775'},
 {'path': '/Applications/Xcode-26.3.0.app', 'uid': 502, 'gid': 20, 'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents', 'uid': 502, 'gid': 20, 'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer', 'uid': 502, 'gid': 20, 'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/usr',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/usr/lib',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/usr/share',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'}]
SELECTED_SDK_PINS = [{'path': '/Applications/Xcode-26.3.0.app/Contents/Info.plist',
  'bytes': 32909,
  'sha256': 'efa845c252a042614fd125371903f6cace479d39cb0a6127d5598c8c2ff505bd',
  'uid': 502,
  'gid': 20,
  'mode': '0o644'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/version.plist',
  'bytes': 523,
  'sha256': '79504c54fc47124dbc5945b628d9c9071923a57c0cd109ff5afdd7884c1c889c',
  'uid': 502,
  'gid': 20,
  'mode': '0o644'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/ToolchainInfo.plist',
  'bytes': 95,
  'sha256': 'b2e3b746c87ddfd6d2145656d87569054807e2196d6f46ef09dec3923ed31541',
  'uid': 502,
  'gid': 20,
  'mode': '0o644'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang',
  'bytes': 132016384,
  'sha256': 'c9126cf1970fb63c344ecc7b2cde016d0d4c125e07d2d74d0c0b4edaf853e65a',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/ld',
  'bytes': 2192304,
  'sha256': '3f4c03061fd7d1e895413133794632131c962c3df56266913741eb0733335166',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/usr/lib/libxcrun.dylib',
  'bytes': 292080,
  'sha256': '99669d600d1b18e89e190a6e88283a9d5f468036c374b6ef270845a38066593d',
  'uid': 502,
  'gid': 20,
  'mode': '0o755'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Info.plist',
  'bytes': 1205,
  'sha256': '87e75a890876356f4f791b127cb784249508c7a7573a95b73423670cd3eb90e9',
  'uid': 502,
  'gid': 20,
  'mode': '0o644'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/version.plist',
  'bytes': 523,
  'sha256': 'a0f85b545ea6cc2b3c5af1ea2ad7450f3d6f3b110fafbebea87bd706fcb3ee5c',
  'uid': 502,
  'gid': 20,
  'mode': '0o644'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/SDKSettings.json',
  'bytes': 7627,
  'sha256': '95882a9cea02396e76f3e406a5728269b2a1a11bcd241430a84c9e63d09a6cd3',
  'uid': 502,
  'gid': 20,
  'mode': '0o644'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/SDKSettings.plist',
  'bytes': 5346,
  'sha256': '03cb7d21a91023f6dff9ea019a3710061e2eb570bdb260faf4daa74151abf15d',
  'uid': 502,
  'gid': 20,
  'mode': '0o644'},
 {'path': '/Applications/Xcode-26.3.0.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/System/Library/CoreServices/SystemVersion.plist',
  'bytes': 599,
  'sha256': 'bbee56e8dec30b911827919becab1004954b2fd415b0971cc1b126479b0d77a0',
  'uid': 502,
  'gid': 20,
  'mode': '0o444'}]
SELECTED_SDK_READ_ROOTS = (SELECTED_TOOLCHAIN, SELECTED_SDK, SELECTED_XCODE / "usr/lib", SELECTED_XCODE / "usr/share")
SELECTED_SDK_METADATA_READS = (SELECTED_XCODE.parent / "Info.plist", SELECTED_XCODE.parent / "version.plist", SELECTED_XCODE / "Platforms/MacOSX.platform/Info.plist", SELECTED_XCODE / "Platforms/MacOSX.platform/version.plist")

SYSCTL_READ_RULE = '(allow sysctl-read\n  (sysctl-name "hw.activecpu")\n  (sysctl-name "hw.busfrequency_compat")\n  (sysctl-name "hw.byteorder")\n  (sysctl-name "hw.cacheconfig")\n  (sysctl-name "hw.cachelinesize_compat")\n  (sysctl-name "hw.cpufamily")\n  (sysctl-name "hw.cpufrequency_compat")\n  (sysctl-name "hw.cputype")\n  (sysctl-name "hw.l1dcachesize_compat")\n  (sysctl-name "hw.l1icachesize_compat")\n  (sysctl-name "hw.l2cachesize_compat")\n  (sysctl-name "hw.l3cachesize_compat")\n  (sysctl-name "hw.logicalcpu_max")\n  (sysctl-name "hw.machine")\n  (sysctl-name "hw.model")\n  (sysctl-name "hw.memsize")\n  (sysctl-name "hw.ncpu")\n  (sysctl-name "hw.nperflevels")\n  ; Chrome locks these CPU feature detection down a bit more tightly,\n  ; but mostly for fingerprinting concerns which isn\'t an issue for codex.\n  (sysctl-name-prefix "hw.optional.arm.")\n  (sysctl-name-prefix "hw.optional.armv8_")\n  (sysctl-name "hw.packages")\n  (sysctl-name "hw.pagesize_compat")\n  (sysctl-name "hw.pagesize")\n  (sysctl-name "hw.physicalcpu")\n  (sysctl-name "hw.physicalcpu_max")\n  (sysctl-name "hw.logicalcpu")\n  (sysctl-name "hw.cpufrequency")\n  (sysctl-name "hw.tbfrequency_compat")\n  (sysctl-name "hw.vectorunit")\n  (sysctl-name "machdep.cpu.brand_string")\n  (sysctl-name "kern.argmax")\n  (sysctl-name "kern.hostname")\n  (sysctl-name "kern.maxfilesperproc")\n  (sysctl-name "kern.maxproc")\n  (sysctl-name "kern.osproductversion")\n  (sysctl-name "kern.osrelease")\n  (sysctl-name "kern.ostype")\n  (sysctl-name "kern.osvariant_status")\n  (sysctl-name "kern.osversion")\n  (sysctl-name "kern.secure_kernel")\n  ; Python\'s ProcessPoolExecutor queries this through sysconf(_SC_SEM_NSEMS_MAX).\n  (sysctl-name "kern.sysv.semmns")\n  (sysctl-name "kern.usrstack64")\n  (sysctl-name "kern.version")\n  (sysctl-name "sysctl.proc_cputype")\n  (sysctl-name "vm.loadavg")\n  (sysctl-name-prefix "hw.perflevel")\n  (sysctl-name-prefix "kern.proc.pgrp.")\n  (sysctl-name-prefix "kern.proc.pid.")\n  (sysctl-name-prefix "net.routetable.")\n)\n'

def need(ok, message):
    if not ok:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, "duplicate JSON key: " + key)
        result[key] = value
    return result


def load(path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)


def exact(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def relative(value):
    need(isinstance(value, str) and value and "\\" not in value and not any(ord(c) < 32 or ord(c) == 127 for c in value), "invalid relative path")
    p = PurePosixPath(value)
    need(p.parts and not p.is_absolute() and all(x not in (".", "..") for x in p.parts) and str(p) == value, "noncanonical relative path")
    return value


def no_links(path):
    path = Path(os.path.abspath(path))
    for item in [path, *path.parents]:
        if item.exists() or item.is_symlink():
            need(not item.is_symlink(), "symlink path refused: " + str(item))
    return path


def regular(path):
    p = no_links(path)
    st = p.lstat()
    need(stat.S_ISREG(st.st_mode), "regular file required: " + str(p))
    return p


def read_pin(root, pin):
    need(exact(pin, {"path", "bytes", "sha256"}), "closed artifact pin required")
    p = regular(root / relative(pin["path"]))
    need(isinstance(pin["bytes"], int) and 0 <= pin["bytes"] <= MAX_BYTES and p.stat().st_size == pin["bytes"], "artifact size changed")
    data = p.read_bytes()
    need(sha(data) == pin["sha256"], "artifact hash changed: " + pin["path"])
    return data


def rows(value, max_bytes=MAX_BYTES):
    need(isinstance(value, list) and 0 < len(value) <= 12000, "bounded complete file inventory required")
    seen = set()
    for row in value:
        need(exact(row, {"path", "bytes", "sha256", "mode"}), "closed file row required")
        key = relative(row["path"])
        need(key not in seen and isinstance(row["bytes"], int) and row["bytes"] >= 0 and isinstance(row["sha256"], str) and re.fullmatch("[0-9a-f]{64}", row["sha256"]), "invalid file row")
        need(row["mode"] in ("100644", "100755"), "unsupported source mode")
        seen.add(key)
    need([r["path"] for r in value] == sorted(seen), "inventory must be sorted and unique")
    need(sum(r["bytes"] for r in value) <= max_bytes, "source inventory exceeds bound")
    return value


def verify_files(root, inventory, max_bytes=MAX_BYTES):
    for row in rows(inventory, max_bytes=max_bytes):
        p = regular(root / row["path"])
        need(p.stat().st_size == row["bytes"] and sha(p.read_bytes()) == row["sha256"], "source changed: " + row["path"])


def verify_complete_files(root, inventory, max_bytes=MAX_BYTES):
    verify_files(root, inventory, max_bytes=max_bytes)
    found = set()
    for p in root.rglob("*"):
        need(not p.is_symlink(), "unlisted symlink refused")
        mode = p.lstat().st_mode
        need(stat.S_ISREG(mode) or stat.S_ISDIR(mode), "nonregular input refused")
        if stat.S_ISREG(mode):
            found.add(p.relative_to(root).as_posix())
    need(found == {r["path"] for r in inventory}, "unlisted or missing source/toolchain file")
    for row in inventory:
        actual = "100755" if (root / row["path"]).stat().st_mode & 0o111 else "100644"
        need(actual == row["mode"], "executable distinction changed: " + row["path"])


def package(manifest):
    root = regular(manifest).parent
    manifest_bytes = manifest.read_bytes()
    need(sha(manifest_bytes) == MANIFEST_SHA256, "source-owned manifest hash changed; runtime manifests cannot select source")
    m = json.loads(manifest_bytes, object_pairs_hook=unique_object)
    need(exact(m, TOP) and m["schema"] == SCHEMA, "unsupported source-package schema")
    need(m["status"] == "frozen-source-unqualified", "source package is pending or unsupported")
    need(m["qualified_binary"] is None, "this source tool cannot consume or mint native qualification")
    u = m["upstream"]
    need(exact(u, {"repository", "commit", "tree", "archive_sha256", "inventory", "attribution"}) and u["repository"] == "https://github.com/openai/codex" and u["commit"] == COMMIT and u["tree"] == TREE, "unsupported upstream revision")
    need(isinstance(u["attribution"], list) and u["attribution"], "upstream attribution required")
    for attribution in u["attribution"]:
        read_pin(root, attribution)
    upstream = rows(json.loads(read_pin(root, u["inventory"]), object_pairs_hook=unique_object))
    need(len(upstream) == 9264 and all(r["path"].startswith("codex-rs/") for r in upstream), "complete pinned Rust source inventory required")
    cut = m["source_cut"]
    need(exact(cut, {"handoff", "bindings", "patch", "review_state"}) and cut["review_state"] == "independent-review-required", "source cut must retain its review boundary")
    cut_artifacts = {key: read_pin(root, cut[key]) for key in ("handoff", "bindings", "patch")}
    original = {r["path"]: r for r in upstream}
    need(isinstance(m["overlay"], list) and OVERLAY_COUNT > 0 and len(m["overlay"]) == OVERLAY_COUNT,
         "exact reviewed overlay count required")
    expected = dict(original)
    seen = set()
    for change in m["overlay"]:
        need(exact(change, {"target", "before_sha256", "payload", "mode"}), "closed overlay row required")
        target = relative(change["target"])
        need(target.startswith("codex-rs/") and target != "codex-rs/Cargo.lock" and target not in seen, "unsupported or duplicate overlay target")
        need(change["before_sha256"] == original.get(target, {}).get("sha256") and change["mode"] in ("100644", "100755"), "overlay base or mode changed")
        data = read_pin(root, change["payload"])
        expected[target] = {"path": target, "bytes": len(data), "sha256": sha(data), "mode": change["mode"]}
        seen.add(target)
    lock = read_pin(root, m["cargo_lock"])
    expected["codex-rs/Cargo.lock"] = {"path": "codex-rs/Cargo.lock", "bytes": len(lock), "sha256": sha(lock), "mode": "100644"}
    # This source-owned portable list is generated from the independently frozen
    # coherent graph, not a runtime-supplied inventory. Pin equality must match
    # every reconstructed overlay/lock path, logical mode and byte commitment.
    declared = rows(json.loads(cut_artifacts["bindings"], object_pairs_hook=unique_object))
    need(declared == sorted(expected.values(), key=lambda row: row["path"]),
         "complete coherent source binding differs from reconstructed package")
    t = m["toolchain"]
    need(exact(t, {"release", "target", "inventory", "official_manifest", "archives"}) and t["release"] == "1.95.0" and t["target"] == TARGET, "unsupported toolchain")
    toolchain = rows(json.loads(read_pin(root, t["inventory"]), object_pairs_hook=unique_object), max_bytes=MAX_TOOLCHAIN_BYTES)
    need(len(toolchain) == 153, "complete pinned toolchain inventory required")
    read_pin(root, t["official_manifest"])
    need(isinstance(t["archives"], list) and len(t["archives"]) == 3, "three official component commitments required")
    need({a.get("component") for a in t["archives"] if isinstance(a, dict)} == {"rustc", "cargo", "rust-std"}, "complete unique component set required")
    for archive in t["archives"]:
        need(exact(archive, {"component", "url", "sha256"}) and archive["component"] in ("rustc", "cargo", "rust-std") and archive["url"].startswith("https://static.rust-lang.org/dist/") and re.fullmatch("[0-9a-f]{64}", archive["sha256"]), "unsupported component commitment")
    b = m["build"]
    need(b == {"package": "codex-app-server-client", "binary": "codex-soloco-protected-host", "target": TARGET, "profile": "release", "environment": {"SOLOCO_PROTECTED_HOST_BUILD": "1"}}, "unsupported build recipe")
    need(m["runtime_integration"] == "separate-joined-runtime-review-required", "runtime integration is not qualified by this package")
    return root, m, upstream, toolchain, sorted(expected.values(), key=lambda r: r["path"])


def paths_overlap(left, right):
    if left == right or left in right.parents or right in left.parents:
        return True
    # Case aliases and mount spellings cannot be decided by case-folding text.
    # Compare each existing root with actual ancestor device/inode identities.
    for root, candidate in ((left, right), (right, left)):
        if not root.exists():
            continue
        root_stat = root.stat()
        identity = (root_stat.st_dev, root_stat.st_ino)
        for ancestor in (candidate, *candidate.parents):
            if ancestor.exists():
                current = ancestor.stat()
                if identity == (current.st_dev, current.st_ino):
                    return True
    return False


def fresh_directory(path, exclusions=()):
    p = no_links(path)
    need(not p.exists() and p.parent.is_dir(), "explicit new output directory with existing parent required")
    for old in exclusions:
        old = no_links(old)
        need(not paths_overlap(p, old), "output overlaps a source or cache")
    return p


def write_json(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def install_bytes(root, row, data):
    need(len(data) == row["bytes"] and sha(data) == row["sha256"], "copy input changed")
    target = root / relative(row["path"])
    target.parent.mkdir(parents=True, exist_ok=True)
    # Only the newly created private output is mutable. No source is replaced.
    if target.exists():
        regular(target).chmod(0o600)
    with target.open("wb") as stream:
        stream.write(data)
    target.chmod(0o555 if row["mode"] == "100755" else 0o444)


def prepare(args):
    root, m, upstream, _, expected = package(args.manifest)
    archive_path = regular(args.archive)
    need(archive_path.stat().st_size <= MAX_BYTES, "upstream archive exceeds bound")
    archive_bytes = archive_path.read_bytes()
    need(sha(archive_bytes) == m["upstream"]["archive_sha256"], "exact upstream commit archive required")
    output = fresh_directory(args.output, (root, archive_path))
    archive = tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz")
    prefix = "codex-" + COMMIT + "/"
    members = {}
    for member in archive.getmembers():
        need(member.name not in members, "duplicate archive member")
        members[member.name] = member

    def original(row):
        member = members.get(prefix + row["path"])
        need(member is not None and member.isfile() and member.size == row["bytes"], "upstream archive member changed")
        mode = "100755" if member.mode & 0o111 else "100644"
        need(mode == row["mode"], "upstream archive executable distinction changed")
        with archive.extractfile(member) as stream:
            data = stream.read(MAX_BYTES + 1)
        need(len(data) == row["bytes"] and sha(data) == row["sha256"], "upstream archive source hash changed")
        return data

    for row in upstream:
        original(row)
    # All package and source inputs are verified before the first mutation.
    output.mkdir(mode=0o700)
    workspace = output / "source"
    workspace.mkdir()
    for row in upstream:
        install_bytes(workspace, row, original(row))
    archive.close()
    for change in m["overlay"]:
        row = next(r for r in expected if r["path"] == change["target"])
        install_bytes(workspace, row, read_pin(root, change["payload"]))
    install_bytes(workspace, next(r for r in expected if r["path"] == "codex-rs/Cargo.lock"), read_pin(root, m["cargo_lock"]))
    verify_complete_files(workspace, expected)
    write_json(output / "prepared-source.json", {"schema": "soloco-prepared-native-source-v1", "manifest_sha256": MANIFEST_SHA256, "files": expected, "source_compiled": False, "native_qualified": False})
    print(json.dumps({"status": "prepared-source-only", "files": len(expected), "native_qualified": False}))


def require_build_domain():
    need(sys.platform == "darwin" and os.uname().machine == "arm64", "only the pinned macOS arm64 source recipe is supported")
    executor = regular(SANDBOX)
    info = executor.stat()
    need(info.st_uid == 0 and info.st_mode & 0o111 and not info.st_mode & 0o022, "original root-owned macOS sandbox executor required")
    return executor


def sb_string(path):
    text = str(path)
    need(Path(text).is_absolute() and not any(ord(c) < 32 or ord(c) == 127 or c in '\\"' for c in text), "unsupported Seatbelt path spelling")
    return '"' + text + '"'


def validate_cache(cache):
    need(cache.is_dir(), "explicit prepopulated private Cargo cache required")
    entries = list(cache.iterdir())
    need(any(p.name in ("registry", "git") and p.is_dir() for p in entries), "prepopulated Cargo source cache required")
    for entry in entries:
        need(entry.name in {"registry", "git", *CACHE_METADATA}, "Cargo cache has unreviewed config, credential or executable entries")
        need(not entry.is_symlink(), "Cargo cache symlink refused")
        need(entry.is_dir() if entry.name in ("registry", "git") else entry.is_file(), "unexpected Cargo cache entry type")


def system_config_metadata(info, directory=False):
    kind = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    need(kind and info.st_uid == 0 and not info.st_mode & 0o022, "root-owned non-writable system configuration required")
    if not directory:
        need(info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o644, "system configuration must be a single regular0644 file")


def validate_openssl_config():
    # A source-owned OS dependency, never an environment-selected crypto policy.
    path = regular(OPENSSL_CONFIG)
    for ancestor in path.parents:
        system_config_metadata(ancestor.lstat(), directory=True)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        system_config_metadata(before)
        need(before.st_size == OPENSSL_CONFIG_BYTES, "system OpenSSL configuration size changed; review required")
        data = os.read(fd, OPENSSL_CONFIG_BYTES + 1)
        after = os.fstat(fd)
        current = path.lstat()
        need(all(getattr(before, key) == getattr(after, key) == getattr(current, key) for key in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_mode", "st_uid", "st_nlink")), "system OpenSSL configuration changed during verification")
        need(len(data) == OPENSSL_CONFIG_BYTES and sha(data) == OPENSSL_CONFIG_SHA256, "system OpenSSL configuration bytes changed; includes or policy changes require review")
    finally:
        os.close(fd)
    return path


def selected_sdk_metadata(info, expected, directory=False):
    kind = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    need(kind and info.st_uid == expected["uid"] and info.st_gid == expected["gid"] and stat.S_IMODE(info.st_mode) == int(expected["mode"], 8), "selected SDK ownership/type/mode changed")
    return {"uid": info.st_uid, "gid": info.st_gid, "mode": oct(stat.S_IMODE(info.st_mode)), "dev": info.st_dev, "ino": info.st_ino}


def selected_sdk_file_pin(expected):
    path = regular(Path(expected["path"]))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        metadata = selected_sdk_metadata(before, expected)
        need(before.st_nlink == 1 and before.st_size == expected["bytes"], "selected SDK file metadata changed")
        digest = hashlib.sha256()
        remaining = expected["bytes"]
        while remaining:
            data = os.read(fd, min(1024 * 1024, remaining))
            need(data, "selected SDK file shortened")
            digest.update(data)
            remaining -= len(data)
        need(not os.read(fd, 1), "selected SDK file grew")
        after, current = os.fstat(fd), path.lstat()
        need(all(getattr(before, key) == getattr(after, key) == getattr(current, key) for key in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_mode", "st_uid", "st_gid", "st_nlink")), "selected SDK file changed during verification")
        need(digest.hexdigest() == expected["sha256"], "selected SDK file hash changed; source review required")
    finally:
        os.close(fd)
    return {"path": str(path), "bytes": expected["bytes"], "sha256": expected["sha256"], **metadata}


def validate_selected_sdk():
    link = SELECTED_LINK.lstat()
    need(stat.S_ISLNK(link.st_mode) and link.st_uid == 0 and link.st_gid == 0 and os.readlink(SELECTED_LINK) == str(SELECTED_XCODE) and SELECTED_LINK.resolve() == SELECTED_XCODE, "unsupported selected Xcode; no SDK substitution permitted")
    directories = []
    for expected in SELECTED_SDK_DIRS:
        path = no_links(Path(expected["path"]))
        need(path.resolve() == path, "selected SDK path alias refused")
        directories.append({"path": str(path), **selected_sdk_metadata(path.lstat(), expected, directory=True)})
    files = [selected_sdk_file_pin(expected) for expected in SELECTED_SDK_PINS]
    return {"schema": "soloco-selected-private-Xcode-input-v1", "developer_dir": str(SELECTED_XCODE), "sdk_root": str(SELECTED_SDK), "compiler": str(SELECTED_CLANG), "Xcode_version": "26.3", "Xcode_build": "17C529", "macOS_SDK_version": "26.2", "macOS_SDK_build": "25C58", "selection_link": {"path": str(SELECTED_LINK), "target": str(SELECTED_XCODE), "uid": link.st_uid, "gid": link.st_gid, "dev": link.st_dev, "ino": link.st_ino}, "directories": directories, "files": files, "trust_boundary": "UID502 user-owned exact selected input; root:admin0775 Applications ancestor remains administrator-mutable. Full SDK headers/resources are not all byte-pinned. Not hostile-host atomicity or byte-identical reproducibility."}


def build_domain(source, prefix, cache, output):
    roots = [no_links(p) for p in (source, prefix, cache, output)]
    for index, left in enumerate(roots):
        need(left.parent != left, "filesystem root is not a private build input")
        for right in roots[index + 1:]:
            need(not paths_overlap(left, right), "build inputs/output must be disjoint")
    source, prefix, cache, output = roots
    for private in roots:
        need(not paths_overlap(private, SELECTED_XCODE.parent.parent), "private build input/output overlaps selected Xcode")
    openssl_config = validate_openssl_config()
    validate_selected_sdk()
    reads = [source, prefix, cache, output, *map(Path, SYSTEM_READ_ROOTS), *SELECTED_SDK_READ_ROOTS]
    # Source-generated positive read/write sets. No ambient home, arbitrary
    # profile text, credentials, caller ready flag or direct-Cargo fallback.
    profile = "(version 1)\n(deny default)\n(deny network*)\n"
    profile += "(allow process-exec process-fork)\n"
    profile += SYSCTL_READ_RULE
    profile += "(allow signal (target same-sandbox))\n"
    profile += "(allow file-read-metadata)\n"
    profile += "(allow file-read-data (literal " + sb_string(openssl_config) + "))\n"
    profile += "(allow file-read-data " + " ".join("(literal " + sb_string(p) + ")" for p in SELECTED_SDK_METADATA_READS) + ")\n"
    profile += '(allow file-read* file-test-existence (literal "/"))\n'
    profile += "(allow file-map-executable (subpath "+sb_string(prefix)+") (subpath "+sb_string(output)+') (subpath "/usr/lib") (subpath '+sb_string(SELECTED_TOOLCHAIN)+") (subpath "+sb_string(SELECTED_XCODE / "usr/lib")+"))\n"
    profile += "(allow file-read* file-test-existence " + " ".join("(subpath " + sb_string(p) + ")" for p in reads) + " (literal \"/dev/null\") (literal \"/dev/random\") (literal \"/dev/urandom\"))\n"
    profile += "(allow file-write* (subpath " + sb_string(output) + ") " + " ".join("(literal " + sb_string(cache / name) + ")" for name in CACHE_METADATA) + " (literal \"/dev/null\"))\n"
    profile += "(allow mach-lookup (global-name \"com.apple.system.logger\"))\n"
    env = {
        "PATH": str(prefix / "bin") + ":" + str(SELECTED_TOOLCHAIN / "usr/bin") + ":/usr/bin:/bin:/usr/sbin:/sbin", "LANG": "C", "LC_ALL": "C",
        "DEVELOPER_DIR": str(SELECTED_XCODE), "SDKROOT": str(SELECTED_SDK),
        "CC": str(SELECTED_CLANG), "CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER": str(SELECTED_CLANG),
        "CARGO_HOME": str(cache), "CARGO_TARGET_DIR": str(output / "target"),
        "RUSTC": str(prefix / "bin/rustc"), "RUSTDOC": str(prefix / "bin/rustdoc"),
        "TMPDIR": str(output / "tmp"), "TMP": str(output / "tmp"), "TEMP": str(output / "tmp"),
        "CLANG_MODULE_CACHE_PATH": str(output / "clang-module-cache"),
        "SOLOCO_PROTECTED_HOST_BUILD": "1", "CARGO_NET_OFFLINE": "true", "CARGO_NET_RETRY": "0",
        "CARGO_REGISTRY_GLOBAL_CREDENTIAL_PROVIDERS": "", "CARGO_HTTP_PROXY": "",
        "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_SYSTEM": "/dev/null", "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "/usr/bin/false", "SSH_ASKPASS": "/usr/bin/false", "GCM_INTERACTIVE": "Never",
    }
    settings = [("credential.helper", ""), ("credential.interactive", "false"), ("core.askPass", "/usr/bin/false"), ("core.sshCommand", "/usr/bin/false"), ("core.hooksPath", "/dev/null"), ("core.fsmonitor", "false"), ("protocol.allow", "never"), ("http.proxy", ""), ("gc.auto", "0"), ("maintenance.auto", "false")]
    env["GIT_CONFIG_COUNT"] = str(len(settings))
    for index, (key, value) in enumerate(settings):
        env["GIT_CONFIG_KEY_" + str(index)] = key
        env["GIT_CONFIG_VALUE_" + str(index)] = value
    cargo = [str(prefix / "bin/cargo"), "build", "--locked", "--offline", "--release", "--target", TARGET, "-p", "codex-app-server-client", "--bin", "codex-soloco-protected-host", "-j2", "--color", "never"]
    return [str(SANDBOX), "-p", profile, *cargo], env, profile


def compiled_source_manifest_bytes(expected):
    # expected is derived only by the source-owned package() producer, after the
    # actual complete source inventory has passed pre-build verification.
    files = rows(expected)
    need(all(row["path"].startswith("codex-rs/") for row in files), "compiled source must describe only the pinned Rust tree")
    value = {"schema": COMPILED_SOURCE_SCHEMA, "upstream": {"commit": COMMIT, "tree": TREE},
             "source_package_sha256": MANIFEST_SHA256, "files_count": len(files), "files": files}
    data = (json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":")) + "\n").encode("utf-8")
    need(len(data) <= MAX_COMPILED_MANIFEST_BYTES, "compiled-source manifest exceeds runtime association bound")
    return data


def verify_compiled_source_manifest(path, expected_bytes):
    artifact = regular(path)
    info = artifact.stat()
    need(info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o444 and info.st_size == len(expected_bytes), "compiled-source manifest metadata changed")
    data = artifact.read_bytes()
    need(data == expected_bytes, "compiled-source manifest bytes changed")
    return {"schema": COMPILED_SOURCE_SCHEMA, "path": str(artifact), "bytes": len(data), "sha256": sha(data)}


def build(args):
    require_build_domain()  # Missing/unsupported domain holds before any spawn.
    root, m, _, toolchain, expected = package(args.manifest)
    prepared = no_links(args.prepared)
    source = prepared / "source"
    record = load(regular(prepared / "prepared-source.json"))
    need(record == {"schema": "soloco-prepared-native-source-v1", "manifest_sha256": MANIFEST_SHA256, "files": expected, "source_compiled": False, "native_qualified": False}, "prepared source binding changed")
    prefix = no_links(args.toolchain)
    cache = no_links(args.cargo_home)
    validate_cache(cache)
    verify_complete_files(source, expected)
    verify_complete_files(prefix, toolchain, max_bytes=MAX_TOOLCHAIN_BYTES)
    for ancestor in [source / "codex-rs", source, prepared, *prepared.parents]:
        if ancestor == source / "codex-rs":
            continue  # The exact workspace .cargo files are pinned source.
        need(not (ancestor / ".cargo/config").exists() and not (ancestor / ".cargo/config.toml").exists(), "unreviewed ancestor Cargo config")
    output = fresh_directory(args.output, (root, prepared, prefix, cache))
    need(1 <= args.timeout <= 1200, "source build timeout must be 1..1200 seconds")
    argv, env, profile = build_domain(source, prefix, cache, output)
    selected_sdk = validate_selected_sdk()
    compiled_manifest_bytes = compiled_source_manifest_bytes(expected)
    output.mkdir(mode=0o700)
    (output / "tmp").mkdir()
    compiled_manifest_path = output / "compiled-source-manifest.json"
    with compiled_manifest_path.open("xb") as stream:
        stream.write(compiled_manifest_bytes)
    compiled_manifest_path.chmod(0o444)
    source_association = verify_compiled_source_manifest(compiled_manifest_path, compiled_manifest_bytes)
    # Never inherit a caller association, guessed input digest or output hash.
    env["SOLOCO_SOURCE_MANIFEST_SHA256"] = source_association["sha256"]
    (output / "build-domain.sb").write_text(profile)
    write_json(output / "plan.json", {"argv": argv, "environment": env, "manifest_sha256": MANIFEST_SHA256, "timeout_seconds": args.timeout, "build_domain_sha256": sha(profile.encode()), "network_containment": "required source-generated macOS Seatbelt network denial; source/toolchain read-only; exact output/cache-metadata writes", "system_openssl_config": {"path": str(OPENSSL_CONFIG), "bytes": OPENSSL_CONFIG_BYTES, "sha256": OPENSSL_CONFIG_SHA256}, "compiled_source_manifest": source_association, "selected_sdk": selected_sdk, "native_qualified": False})
    started = time.monotonic()
    state, result = "failed", None
    with (output / "stdout.log").open("xb") as stdout, (output / "stderr.log").open("xb") as stderr:
        process = subprocess.Popen(argv, cwd=source / "codex-rs", env=env, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
        try:
            result = process.wait(timeout=args.timeout)
            state = "compiled-source-only" if result == 0 else "failed"
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            result = process.wait(timeout=5)
            state = "timeout-held"
    receipt = {"schema": "soloco-native-source-build-receipt-v1", "status": state, "manifest_sha256": MANIFEST_SHA256, "exit_code": result, "elapsed_seconds": time.monotonic() - started, "compiled_source_manifest": source_association, "selected_sdk": selected_sdk, "binary": None, "native_qualified": False, "source_slot_populated": False, "descendant_or_remote_closure": "not established"}
    try:
        need(sha(regular(args.manifest).read_bytes()) == MANIFEST_SHA256, "source-owned manifest changed during build")
        need(verify_compiled_source_manifest(compiled_manifest_path, compiled_manifest_bytes) == source_association, "compiled-source association changed during build")
        validate_openssl_config()
        need(validate_selected_sdk() == selected_sdk, "selected SDK changed during build")
        verify_complete_files(source, expected)
        verify_complete_files(prefix, toolchain, max_bytes=MAX_TOOLCHAIN_BYTES)
        if state == "compiled-source-only":
            binary = regular(output / "target" / TARGET / "release/codex-soloco-protected-host")
            receipt["binary"] = {"path": str(binary), "bytes": binary.stat().st_size, "sha256": sha(binary.read_bytes())}
    except Exception as error:
        receipt["status"] = "changed-input-or-output-held"
        receipt["verification_error"] = str(error)
    write_json(output / "receipt.json", receipt)
    print(json.dumps(receipt))
    return 0 if receipt["status"] == "compiled-source-only" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("verify", help="verify the frozen source payload; no execution")
    p = sub.add_parser("prepare", help="copy exact pinned source into a new directory")
    p.add_argument("--archive", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    b = sub.add_parser("build", help="explicit offline source compilation; never install or launch")
    for name in ("prepared", "toolchain", "cargo-home", "output"):
        b.add_argument("--" + name, type=Path, required=True)
    b.add_argument("--timeout", type=int, default=1200)
    args = parser.parse_args()
    args.manifest = MANIFEST
    if args.action == "prepare":
        prepare(args)
    elif args.action == "build":
        return build(args)
    else:
        _, _, upstream, toolchain, composed = package(args.manifest)
        print(json.dumps({"status": "frozen-source-only", "upstream_files": len(upstream), "toolchain_files": len(toolchain), "composed_files": len(composed), "native_qualified": False}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print("Held: " + str(error), file=sys.stderr)
        sys.exit(2)
