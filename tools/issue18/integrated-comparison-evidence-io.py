"""Fixed optional Darwin evidence worker; no selection or execution authority.

Only the Source owner supplies this program by value. FD3 is the original
selected parent. Publication receives original root/objects FDs as 4/5.
Creation and publication effects use only these inherited directory FDs.
No pathname, /dev/fd, recovery, overwrite or adoption fallback exists. Publication
uses Darwin's atomic exclusive rename; failures retain every remaining name.
"""
import base64
import ctypes
import errno
import fcntl
import hashlib
import json
import os
import re
import stat
import sys
import time

PROTOCOL = "issue18-comparison-evidence-io-v1"
PARENT, DIRECTORY, OBJECTS, INIT = 3, 4, 5, 6
MAX_BODY, MAX_REQUEST, MAX_REPLY = 9975424, 14 * 1024 * 1024, 8192
burn_attempted = False
mkdir_attempted = False
publication_attempted = False

# Apple XNU bsd/sys/stdio.h defines RENAME_EXCL as 0x00000004 and declares
# renameatx_np(int, const char *, int, const char *, unsigned int).
# https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/stdio.h
RENAME_EXCL = 0x00000004


def exclusive_rename_backend():
    need(sys.platform == "darwin", "ATOMIC_PUBLICATION_UNSUPPORTED")
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        rename = libc.renameatx_np
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                           ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        return rename
    except (AttributeError, OSError):
        raise Held("ATOMIC_PUBLICATION_UNSUPPORTED")


def exclusive_rename(rename, directory_fd, source, target):
    # Both names are fixed single components under the ORIGINAL objects FD.
    # Kernel RENAME_EXCL preserves a racing destination; there is no plain
    # rename/link/unlink fallback or later check-then-delete cleanup.
    ctypes.set_errno(0)
    result = rename(directory_fd, source.encode("ascii"), directory_fd,
                    target.encode("ascii"), RENAME_EXCL)
    if result != 0:
        code = ctypes.get_errno()
        raise OSError(code, "Exclusive evidence publication failed")


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
    value = json.loads(body.decode("utf-8", "strict"), object_pairs_hook=pairs,
                       parse_float=forbidden, parse_constant=forbidden)
    finite(value)
    need(type(value) is dict, "DATA_OBJECT")
    encoded = (json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    need(encoded == body, "NONCANONICAL_DATA")
    return value


def identity(s):
    return {key: str(getattr(s, "st_" + key)) for key in ("dev", "ino", "mode", "uid", "gid")}


def version(s):
    return {**identity(s), **{key: str(getattr(s, "st_" + key))
            for key in ("nlink", "size", "mtime_ns", "ctime_ns")}}


def clock(request):
    need(type(request["deadline_at_ms"]) is int and
         time.time_ns() // 1000000 < request["deadline_at_ms"], "DEADLINE")


def empty_acl(fd):
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
        result = entry(acl, 0, ctypes.byref(item))
        need(result != 0, "ACL_PRESENT")
        need(result == -1 and ctypes.get_errno() == errno.EINVAL, "ACL_UNCERTAIN")
    finally:
        need(free(acl) == 0, "ACL_CLEANUP")


class DarwinStatFS(ctypes.Structure):
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
    need(bytes(result.fstype) in (b"apfs", b"hfs") and result.flags & 0x1000 and not result.flags & 1,
         "FILESYSTEM_UNSUPPORTED")


DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK


def parent_guard(request):
    clock(request)
    selected = request["parent_path"]
    need(type(selected) is str and 1 < len(selected) <= 4096 and selected.startswith("/") and
         not selected.endswith("/") and "\x00" not in selected and
         all(part not in ("", ".", "..") for part in selected.split("/")[1:]), "PARENT_PATH")
    s = os.fstat(PARENT)
    need(stat.S_ISDIR(s.st_mode) and identity(s) == request["parent_identity"] and
         stat.S_IMODE(s.st_mode) == 0o700 and s.st_uid == os.geteuid(), "PARENT_CHANGED")
    local_filesystem(PARENT)
    empty_acl(PARENT)
    # Retain the bounded original chain until every name/FD pair is joined in
    # reverse. A same-UID ancestor rebound AFTER it was traversed cannot hide
    # behind an unchanged final directory. These are read-only verifier FDs.
    components = selected.split("/")[1:]
    need(len(components) <= 64, "PARENT_COMPONENT_LIMIT")
    descriptors = [os.open("/", DIR_FLAGS)]
    chain = []
    try:
        for component in components:
            clock(request)
            parent = descriptors[-1]
            child = os.open(component, DIR_FLAGS, dir_fd=parent)
            descriptors.append(child)
            chain.append((parent, component, child, identity(os.fstat(child))))
        need(identity(os.fstat(descriptors[-1])) == request["parent_identity"], "PARENT_NAME_CHANGED")
        for parent, component, child, expected in reversed(chain):
            clock(request)
            need(identity(os.fstat(child)) == expected and
                 identity(os.stat(component, dir_fd=parent, follow_symlinks=False)) == expected,
                 "PARENT_COMPONENT_CHANGED")
    finally:
        failed = False
        for fd in reversed(descriptors):
            try:
                os.close(fd)
            except OSError:
                failed = True
        need(not failed, "PARENT_FD_CLEANUP")
    clock(request)


def selected_name(request):
    name = request["directory_name"]
    need(type(name) is str and re.fullmatch(r"a-[a-f0-9]{64}", name), "DIRECTORY_NAME")
    return name


def decode_body(text, digest, maximum):
    need(type(text) is str and len(text) <= MAX_REQUEST, "BODY_LIMIT")
    body = base64.b64decode(text, validate=True)
    need(len(body) <= maximum and hashlib.sha256(body).hexdigest() == digest, "BODY_HASH_OR_LIMIT")
    return body


def read_original(request, fd, name, directory_fd, maximum, links=1):
    before = os.fstat(fd)
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == links and
         stat.S_IMODE(before.st_mode) == 0o400 and before.st_uid == os.geteuid() and
         before.st_gid == int(request["parent_identity"]["gid"]) and 0 <= before.st_size <= maximum, "OBJECT_FILE")
    empty_acl(fd)
    need(version(os.stat(name, dir_fd=directory_fd, follow_symlinks=False)) == version(before), "OBJECT_NAME_CHANGED")
    chunks, offset = [], 0
    while offset < before.st_size:
        clock(request)
        chunk = os.pread(fd, min(65536, before.st_size - offset), offset)
        need(bool(chunk), "SHORT_READ")
        chunks.append(chunk)
        offset += len(chunk)
    need(os.pread(fd, 1, offset) == b"" and version(os.fstat(fd)) == version(before) and
         version(os.stat(name, dir_fd=directory_fd, follow_symlinks=False)) == version(before), "OBJECT_CHANGED")
    body = b"".join(chunks)
    return body, {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "identity": version(before)}


def fresh_file(request, fd, name, directory_fd):
    before = os.fstat(fd)
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
         stat.S_IMODE(before.st_mode) == 0o600 and before.st_size == 0 and
         before.st_uid == os.geteuid() and
         before.st_gid == int(request["parent_identity"]["gid"]), "FRESH_FILE")
    need(version(os.stat(name, dir_fd=directory_fd, follow_symlinks=False)) == version(before), "FRESH_NAME_CHANGED")
    empty_acl(fd)  # BEFORE even the first sensitive byte.
    need(version(os.fstat(fd)) == version(before) and
         version(os.stat(name, dir_fd=directory_fd, follow_symlinks=False)) == version(before), "FRESH_FILE_CHANGED")
    clock(request)


def directory_guard(request):
    parent_guard(request)
    for fd, key in ((DIRECTORY, "directory_identity"), (OBJECTS, "objects_identity")):
        s = os.fstat(fd)
        need(stat.S_ISDIR(s.st_mode) and identity(s) == request[key] and
             stat.S_IMODE(s.st_mode) == 0o700 and s.st_uid == os.geteuid(), "DIRECTORY_CHANGED")
        local_filesystem(fd)
        empty_acl(fd)
    need(identity(os.stat(request["directory_name"], dir_fd=PARENT, follow_symlinks=False)) == request["directory_identity"], "DIRECTORY_NAME_CHANGED")
    need(identity(os.stat("objects", dir_fd=DIRECTORY, follow_symlinks=False)) == request["objects_identity"], "OBJECTS_NAME_CHANGED")
    _, init = read_original(request, INIT, request["directory_name"] + ".init.json", PARENT, 4096)
    need(init == request["init"], "INIT_CHANGED")


def census(request):
    expected = request["expected_objects"]
    need(type(expected) is list and len(expected) <= 32, "OBJECT_QUOTA")
    names = set()
    for row in expected:
        closed(row, ("name", "bytes", "sha256", "identity"))
        need(re.fullmatch(r"[a-f0-9]{64}\.blob", row["name"]) and row["name"] not in names, "OBJECT_NAME")
        names.add(row["name"])
    scan = os.open(".", DIR_FLAGS, dir_fd=OBJECTS)
    try:
        with os.scandir(scan) as entries:
            actual = set()
            for entry in entries:
                need(len(actual) < 32 and entry.name in names, "OBJECT_NAMESPACE_CHANGED")
                actual.add(entry.name)
        need(actual == names, "OBJECT_NAMESPACE_CHANGED")
    finally:
        os.close(scan)
    for row in expected:
        fd = os.open(row["name"], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=OBJECTS)
        try:
            _, observed = read_original(request, fd, row["name"], OBJECTS, MAX_BODY)
            need({**observed, "name": row["name"]} == row, "OBJECT_CHANGED")
        finally:
            os.close(fd)


def run(request):
    global burn_attempted, mkdir_attempted, publication_attempted
    common = ("protocol", "operation", "parent_path", "parent_identity", "directory_name", "deadline_at_ms")
    need(type(request) is dict and request.get("protocol") == PROTOCOL, "PROTOCOL")
    rename = exclusive_rename_backend()  # Availability BEFORE any init burn.
    name = selected_name(request)
    if request.get("operation") == "create":
        closed(request, common + ("init_base64", "init_sha256"))
        init = decode_body(request["init_base64"], request["init_sha256"], 4096)
        canonical(init)
        parent_guard(request)
        burn_attempted = True
        fd = os.open(name + ".init.json", os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=PARENT)
        try:
            fresh_file(request, fd, name + ".init.json", PARENT)
            need(os.write(fd, init) == len(init), "PARTIAL_INIT_WRITE")
            os.fchmod(fd, 0o400)
            os.fsync(fd)
            retained, init_row = read_original(request, fd, name + ".init.json", PARENT, 4096)
            need(retained == init, "INIT_READBACK")
            os.fsync(PARENT)
            parent_guard(request)
            mkdir_attempted = True
            os.mkdir(name, 0o700, dir_fd=PARENT)
            root_fd = os.open(name, DIR_FLAGS, dir_fd=PARENT)
            try:
                root = os.fstat(root_fd)
                need(stat.S_IMODE(root.st_mode) == 0o700 and root.st_uid == os.geteuid(), "DIRECTORY_OWNER_MODE")
                empty_acl(root_fd)
                local_filesystem(root_fd)
                os.mkdir("objects", 0o700, dir_fd=root_fd)
                objects_fd = os.open("objects", DIR_FLAGS, dir_fd=root_fd)
                try:
                    objects = os.fstat(objects_fd)
                    need(stat.S_IMODE(objects.st_mode) == 0o700 and objects.st_uid == os.geteuid(), "OBJECTS_OWNER_MODE")
                    empty_acl(objects_fd)
                    local_filesystem(objects_fd)
                    need(identity(os.stat("objects", dir_fd=root_fd, follow_symlinks=False)) == identity(objects), "OBJECTS_NAME_CHANGED")
                    need(identity(os.stat(name, dir_fd=PARENT, follow_symlinks=False)) == identity(root), "DIRECTORY_NAME_CHANGED")
                    with os.scandir(objects_fd) as entries:
                        need(next(entries, None) is None, "OBJECT_NAMESPACE_CHANGED")
                    os.fsync(objects_fd)
                    os.fsync(root_fd)
                    os.fsync(PARENT)
                    parent_guard(request)
                    retained, final_init = read_original(request, fd, name + ".init.json", PARENT, 4096)
                    need(final_init == init_row and retained == init, "INIT_CHANGED")
                    need(identity(os.stat(name, dir_fd=PARENT, follow_symlinks=False)) == identity(root) and
                         identity(os.stat("objects", dir_fd=root_fd, follow_symlinks=False)) == identity(objects), "DIRECTORY_NAME_CHANGED")
                    return {"protocol": PROTOCOL, "status": "created", "directory_identity": identity(root),
                            "objects_identity": identity(objects), "init": init_row, "authority_claim": False}
                finally:
                    os.close(objects_fd)
            finally:
                os.close(root_fd)
        finally:
            os.close(fd)
    extra = ("directory_identity", "objects_identity", "init", "expected_objects")
    need(request["operation"] in ("publish", "verify"), "PROTOCOL")
    closed(request, common + extra + (() if request["operation"] == "verify" else ("body_base64", "body_sha256")))
    directory_guard(request)
    census(request)
    if request["operation"] == "verify":
        directory_guard(request)
        return {"protocol": PROTOCOL, "status": "verified", "authority_claim": False}
    body = decode_body(request["body_base64"], request["body_sha256"], MAX_BODY)
    need(len(request["expected_objects"]) < 32, "OBJECT_QUOTA")
    target = request["body_sha256"] + ".blob"
    pending = ".pending-" + target
    publication_attempted = True
    fd = os.open(pending, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=OBJECTS)
    try:
        fresh_file(request, fd, pending, OBJECTS)
        clock(request)
        if body:
            need(os.write(fd, body) == len(body), "PARTIAL_BLOB_WRITE")
        os.fchmod(fd, 0o400)
        os.fsync(fd)
        retained, _ = read_original(request, fd, pending, OBJECTS, MAX_BODY)
        need(retained == body, "BLOB_READBACK")
        directory_guard(request)
        clock(request)
        need(version(os.stat(pending, dir_fd=OBJECTS, follow_symlinks=False)) == version(os.fstat(fd)), "TEMP_NAME_CHANGED")
        clock(request)
        exclusive_rename(rename, OBJECTS, pending, target)
        os.fsync(fd)
        os.fsync(OBJECTS)
        retained, row = read_original(request, fd, target, OBJECTS, MAX_BODY)
        need(retained == body, "BLOB_READBACK")
        directory_guard(request)
        return {"protocol": PROTOCOL, "status": "published", "object": {**row, "name": target}, "authority_claim": False}
    finally:
        os.close(fd)


try:
    raw = sys.stdin.buffer.read(MAX_REQUEST + 1)
    need(len(raw) <= MAX_REQUEST, "REQUEST_LIMIT")
    request = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs, parse_float=forbidden, parse_constant=forbidden)
    result = run(request)
    encoded = json.dumps(result, separators=(",", ":"), allow_nan=False).encode("utf-8")
    need(len(encoded) <= MAX_REPLY, "REPLY_LIMIT")
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()
except Exception as error:
    sys.stdout.write(json.dumps({"protocol": PROTOCOL, "status": "held", "code": str(error) if isinstance(error, Held) else "OS_IO_OR_PROTOCOL",
        "errno": error.errno if isinstance(error, OSError) else None, "burn_attempted": burn_attempted,
        "mkdir_attempted": mkdir_attempted, "publication_attempted": publication_attempted, "authority_claim": False}, separators=(",", ":")))
    sys.stdout.flush()
    sys.exit(2)
