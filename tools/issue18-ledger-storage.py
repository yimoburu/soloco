"""Opt-in qualification filesystem worker. No issuer or execution authority.

FD 3 is the original selected private parent; FD 4 is its original run directory.
The Node owner supplies this fixed program by value, not by reopening a script.
This initial backend supports Darwin's extended ACL ABI only. No portability or
power-loss durability is inferred from successful fsync acknowledgements.
"""
import base64
import ctypes
import errno
import hashlib
import json
import os
import re
import stat
import sys
import time

PROTOCOL = "issue18-ledger-storage-io-v1"
ARMS = ("1-files", "1-patches", "3-files", "3-patches")
NAMES = ("RUN.json",) + tuple("slot-%s-%s.json" % (a, p) for a in ARMS for p in ("engineer", "qa"))
LIMITS = {name: (32768 if name == "RUN.json" else 16384) for name in NAMES}
MAX_REQUEST = 65536
MAX_REPLY = 65536
PARENT, DIRECTORY = 3, 4
burned = False


class Held(Exception):
    pass


def need(value, code):
    if not value:
        raise Held(code)


def closed(value, keys):
    need(type(value) is dict and set(value) == set(keys), "PROTOCOL")


def pairs(items):
    result = {}
    for key, value in items:
        need(key not in result, "DUPLICATE_KEY")
        result[key] = value
    return result


def forbidden(_):
    raise Held("NONFINITE_DATA")


def finite(value, depth=0):
    need(depth <= 32, "DATA_DEPTH")
    if value is None or type(value) is bool:
        return
    if type(value) is int:
        need(abs(value) <= 9007199254740991, "DATA_INTEGER")
        return
    if type(value) is str:
        value.encode("utf-8", "strict")
        return
    if type(value) is list:
        for item in value:
            finite(item, depth + 1)
        return
    need(type(value) is dict, "NONFINITE_DATA")
    for key, item in value.items():
        need(type(key) is str and re.fullmatch(r"[\x20-\x7e]{1,200}", key), "DATA_KEY")
        finite(item, depth + 1)


def canonical(body):
    text = body.decode("utf-8", "strict")
    need(not text.startswith("\ufeff"), "DATA_BOM")
    value = json.loads(text, object_pairs_hook=pairs, parse_float=forbidden, parse_constant=forbidden)
    finite(value)
    need(type(value) is dict, "DATA_OBJECT")
    encoded = (json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    need(encoded == body, "NONCANONICAL_DATA")
    return value


def identity(s):
    return {k: str(getattr(s, "st_" + k)) for k in ("dev", "ino", "mode", "uid", "gid")}


def version(s):
    return identity(s), s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns


def empty_acl(fd):
    # Apple Libc acl_get_fd returns the extended ACL. A missing FILESEC_ACL
    # property is ENOENT; an empty retrieved ACL has no first entry (EINVAL).
    # Every other error is unsupported/uncertain, never permission by omission.
    need(sys.platform == "darwin", "ACL_BACKEND_UNSUPPORTED")
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        get = libc.acl_get_fd
        get.argtypes, get.restype = [ctypes.c_int], ctypes.c_void_p
        entry = libc.acl_get_entry
        entry.argtypes, entry.restype = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)], ctypes.c_int
        free = libc.acl_free
        free.argtypes, free.restype = [ctypes.c_void_p], ctypes.c_int
    except (AttributeError, OSError):
        raise Held("ACL_BACKEND_UNSUPPORTED")
    ctypes.set_errno(0)
    acl = get(fd)
    if not acl:
        need(ctypes.get_errno() == errno.ENOENT, "ACL_UNCERTAIN")
        return
    try:
        item = ctypes.c_void_p()
        ctypes.set_errno(0)
        result = entry(acl, 0, ctypes.byref(item))  # Darwin ACL_FIRST_ENTRY = 0.
        if result == 0:
            raise Held("ACL_PRESENT")
        need(result == -1 and ctypes.get_errno() == errno.EINVAL, "ACL_UNCERTAIN")
    finally:
        need(free(acl) == 0, "ACL_CLEANUP")


def clock(request):
    need(time.time_ns() // 1000000 < request["deadline_at_ms"], "DEADLINE")


class DarwinStatFS(ctypes.Structure):
    # Apple's __DARWIN_STRUCT_STATFS64, not a portable POSIX struct layout.
    _fields_ = [("bsize", ctypes.c_uint32), ("iosize", ctypes.c_int32)] + [
        (name, ctypes.c_uint64) for name in ("blocks", "bfree", "bavail", "files", "ffree")
    ] + [("fsid", ctypes.c_int32 * 2)] + [
        (name, ctypes.c_uint32) for name in ("owner", "type", "flags", "subtype")
    ] + [("fstype", ctypes.c_char * 16), ("mount", ctypes.c_char * 1024),
         ("source", ctypes.c_char * 1024), ("reserved", ctypes.c_uint32 * 8)]


def local_filesystem(fd):
    need(sys.platform == "darwin" and ctypes.sizeof(ctypes.c_void_p) == 8, "FILESYSTEM_BACKEND_UNSUPPORTED")
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        check = libc.fstatfs64
        check.argtypes, check.restype = [ctypes.c_int, ctypes.POINTER(DarwinStatFS)], ctypes.c_int
    except (AttributeError, OSError):
        raise Held("FILESYSTEM_BACKEND_UNSUPPORTED")
    result = DarwinStatFS()
    need(check(fd, ctypes.byref(result)) == 0, "FILESYSTEM_UNCERTAIN")
    need(bytes(result.fstype) in (b"apfs", b"hfs") and result.flags & 0x1000 and not result.flags & 1, "FILESYSTEM_UNSUPPORTED")


def guard(request):
    clock(request)
    for fd, key in ((PARENT, "parent_identity"), (DIRECTORY, "directory_identity")):
        s = os.fstat(fd)
        need(stat.S_ISDIR(s.st_mode) and identity(s) == request[key], "DIRECTORY_CHANGED")
        need(stat.S_IMODE(s.st_mode) == 0o700 and s.st_uid == os.geteuid(), "DIRECTORY_OWNER_MODE")
        local_filesystem(fd)
        empty_acl(fd)
    named = os.stat(request["directory_name"], dir_fd=PARENT, follow_symlinks=False)
    need(identity(named) == request["directory_identity"] and stat.S_ISDIR(named.st_mode), "DIRECTORY_NAME_CHANGED")


def read_leaf(request, name):
    before = os.stat(name, dir_fd=DIRECTORY, follow_symlinks=False)
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o400, "LEAF_TYPE_LINK_MODE")
    need(before.st_uid == int(request["directory_identity"]["uid"]) and before.st_gid == int(request["directory_identity"]["gid"]), "LEAF_OWNER")
    need(0 < before.st_size <= LIMITS[name], "LEAF_SIZE")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=DIRECTORY)
    try:
        need(version(os.fstat(fd)) == version(before), "LEAF_CHANGED")
        empty_acl(fd)
        chunks, remaining = [], before.st_size
        while remaining:
            clock(request)
            chunk = os.read(fd, remaining)
            need(bool(chunk), "SHORT_READ")
            chunks.append(chunk)
            remaining -= len(chunk)
        body = b"".join(chunks)
        need(version(os.fstat(fd)) == version(before), "LEAF_CHANGED")
        need(version(os.stat(name, dir_fd=DIRECTORY, follow_symlinks=False)) == version(before), "LEAF_CHANGED")
        canonical(body)
        return body, {**identity(before), "nlink": str(before.st_nlink), "size": str(before.st_size), "mtime_ns": str(before.st_mtime_ns), "ctime_ns": str(before.st_ctime_ns)}
    finally:
        os.close(fd)


def census(request):
    guard(request)
    names = []
    # Inherited/duplicated directory FDs share an open-file-description offset.
    # Rewind the actual original FD; never reopen a directory pathname.
    os.lseek(DIRECTORY, 0, os.SEEK_SET)
    with os.scandir(DIRECTORY) as entries:
        for entry in entries:
            need(len(names) < 9 and entry.name in NAMES, "NAMESPACE_CHANGED")
            names.append(entry.name)
    need(not names or "RUN.json" in names, "MANIFEST_MISSING")
    rows = []
    for name in sorted(names):
        body, node = read_leaf(request, name)
        rows.append({"name": name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "identity": node})
    guard(request)
    return rows


def run(request):
    global burned
    closed(request, ("protocol", "operation", "name", "directory_name", "parent_identity", "directory_identity", "deadline_at_ms", "body_base64", "body_sha256", "manifest_sha256", "expected_rows"))
    need(request["protocol"] == PROTOCOL and request["operation"] in ("initialize", "publish", "inspect", "read"), "PROTOCOL")
    need(type(request["deadline_at_ms"]) is int and 0 < request["deadline_at_ms"] <= 9007199254740991, "DEADLINE")
    need(type(request["directory_name"]) is str and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", request["directory_name"]), "DIRECTORY_NAME")
    for key in ("parent_identity", "directory_identity"):
        closed(request[key], ("dev", "ino", "mode", "uid", "gid"))
        need(all(type(v) is str and re.fullmatch(r"0|[1-9][0-9]{0,19}", v) for v in request[key].values()), "IDENTITY")
    need(all(hasattr(os, n) for n in ("O_DIRECTORY", "O_NOFOLLOW", "O_NONBLOCK")), "FD_BACKEND_UNSUPPORTED")
    need(all(fn in os.supports_dir_fd for fn in (os.open, os.stat)), "FD_BACKEND_UNSUPPORTED")
    rows = census(request)
    if request["expected_rows"] is not None:
        need(type(request["expected_rows"]) is list and rows == request["expected_rows"], "RETAINED_LEAF_CHANGED")
    operation, name = request["operation"], request["name"]
    if operation == "inspect":
        need(name is None and request["body_base64"] is None and request["body_sha256"] is None, "PROTOCOL")
        return {"status": "observed", "rows": rows, "body_base64": None}
    need(name in NAMES, "LEAF_NAME")
    if operation == "read":
        need(request["body_base64"] is None and request["body_sha256"] is None, "PROTOCOL")
        body, _ = read_leaf(request, name)
        prior = next((r for r in rows if r["name"] == name), None)
        need(prior and prior["bytes"] == len(body) and prior["sha256"] == hashlib.sha256(body).hexdigest(), "READBACK_CHANGED")
        guard(request)
        return {"status": "observed", "rows": rows, "body_base64": base64.b64encode(body).decode("ascii")}
    need(operation != "initialize" or (name == "RUN.json" and not rows), "EXISTING_NAMESPACE")
    if operation == "publish":
        need(name != "RUN.json" and bool(rows), "MANIFEST_REQUIRED")
        manifest = next(r for r in rows if r["name"] == "RUN.json")
        need(manifest["sha256"] == request["manifest_sha256"], "MANIFEST_CHANGED")
    need(not any(r["name"] == name for r in rows), "SLOT_SPENT")
    body = base64.b64decode(request["body_base64"], validate=True)
    need(base64.b64encode(body).decode("ascii") == request["body_base64"], "BODY_ENCODING")
    need(0 < len(body) <= LIMITS[name] and hashlib.sha256(body).hexdigest() == request["body_sha256"], "BODY_LIMIT_OR_HASH")
    canonical(body)
    need(sum(r["bytes"] for r in rows) + len(body) <= 163840, "PERSISTENT_CAPACITY")
    guard(request)
    # The possibility of O_EXCL success burns this attempt. No error cleanup
    # removes, rewrites or repairs the final leaf; partial records stay visible.
    burned = True
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=DIRECTORY)
    created = os.fstat(fd)
    try:
        need(stat.S_ISREG(created.st_mode) and created.st_nlink == 1 and stat.S_IMODE(created.st_mode) == 0o600, "CREATE_TYPE_LINK_MODE")
        need(created.st_uid == int(request["directory_identity"]["uid"]) and created.st_gid == int(request["directory_identity"]["gid"]), "CREATE_OWNER")
        empty_acl(fd)
        offset = 0
        while offset < len(body):
            clock(request)
            written = os.write(fd, body[offset:])
            need(written > 0, "SHORT_WRITE")
            offset += written
        os.fchmod(fd, 0o400)
        os.fsync(fd)
    finally:
        os.close(fd)
    observed, node = read_leaf(request, name)
    need(observed == body and node["dev"] == str(created.st_dev) and node["ino"] == str(created.st_ino), "READBACK_CHANGED")
    os.fsync(DIRECTORY)
    os.fsync(PARENT)
    after = census(request)
    expected = sorted([r["name"] for r in rows] + [name])
    need(sorted(r["name"] for r in after) == expected, "NAMESPACE_CHANGED")
    for old in rows:
        need(next(r for r in after if r["name"] == old["name"]) == old, "PRIOR_LEAF_CHANGED")
    guard(request)
    return {"status": "committed", "rows": after, "body_base64": None}


try:
    raw = sys.stdin.buffer.read(MAX_REQUEST + 1)
    need(len(raw) <= MAX_REQUEST, "REQUEST_LIMIT")
    request = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs, parse_float=forbidden, parse_constant=forbidden)
    value = run(request)
    reply = {"protocol": PROTOCOL, "burn_may_have_occurred": burned, "authority_claim": False, **value}
    encoded = (json.dumps(reply, separators=(",", ":"), sort_keys=True) + "\n").encode()
    need(len(encoded) <= MAX_REPLY, "REPLY_LIMIT")
    sys.stdout.buffer.write(encoded)
except Exception as error:
    code = str(error) if type(error) is Held else "OS_IO_OR_PROTOCOL"
    err = error.errno if isinstance(error, OSError) else None
    reply = {"protocol": PROTOCOL, "status": "held", "code": code, "errno": err, "burn_may_have_occurred": burned, "authority_claim": False}
    sys.stdout.write(json.dumps(reply, separators=(",", ":"), sort_keys=True) + "\n")
    sys.exit(2)
