"""Fixed optional Darwin filesystem worker; no selection or execution authority.

Only the Source owner supplies this program by value. FD3 is the original
selected parent. Append additionally receives original journal/anchor/run FDs
as 4/5/6. All creation effects use FD3-relative single-component names. There
is no pathname, /dev/fd, recovery, deletion, rename or adoption fallback.
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

PROTOCOL = "issue18-comparison-bootstrap-io-v1"
PARENT, JOURNAL, ANCHOR, DIRECTORY = 3, 4, 5, 6
MAX_METADATA, MAX_EVENT, MAX_REQUEST, MAX_REPLY = 32768, 4096, 65536, 8192
burned = False
mkdir_attempted = False
directory_created = False
append_attempted = False


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


def publication_backend():
    # The selected profile also publishes A objects. Reject a missing fixed
    # Darwin primitive BEFORE writing even its initialization burn files.
    # Apple XNU bsd/sys/stdio.h: RENAME_EXCL=0x00000004, renameatx_np ABI.
    # https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/stdio.h
    need(sys.platform == "darwin", "ATOMIC_PUBLICATION_UNSUPPORTED")
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        rename = libc.renameatx_np
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                           ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
    except (AttributeError, OSError):
        raise Held("ATOMIC_PUBLICATION_UNSUPPORTED")


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


def names(request):
    name = request["directory_name"]
    need(type(name) is str and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}", name), "DIRECTORY_NAME")
    return name + ".selection.json", name + ".journal.jsonl"


def decode(text, expected, maximum, allow_empty=False):
    need(type(text) is str and len(text) <= MAX_REQUEST, "BODY_LIMIT")
    body = base64.b64decode(text, validate=True)
    need((allow_empty or body) and len(body) <= maximum and
         hashlib.sha256(body).hexdigest() == expected, "BODY_HASH_OR_LIMIT")
    if body:
        canonical(body)
    return body


def read_file(request, fd, name, mode, maximum, allow_empty=False):
    before = os.fstat(fd)
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
         stat.S_IMODE(before.st_mode) == mode and before.st_uid == os.geteuid() and
         before.st_gid == int(request["parent_identity"]["gid"]) and
         0 <= before.st_size <= maximum and (allow_empty or before.st_size > 0), "METADATA_FILE")
    need(version(os.stat(name, dir_fd=PARENT, follow_symlinks=False)) == version(before), "METADATA_NAME_CHANGED")
    empty_acl(fd)
    body = b""
    while len(body) < before.st_size:
        clock(request)
        chunk = os.pread(fd, before.st_size - len(body), len(body))
        need(bool(chunk), "SHORT_READ")
        body += chunk
    need(os.pread(fd, 1, len(body)) == b"", "FILE_GROWN")
    need(version(os.fstat(fd)) == version(before) and
         version(os.stat(name, dir_fd=PARENT, follow_symlinks=False)) == version(before), "METADATA_CHANGED")
    return body, {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "identity": version(before)}


def create_file(request, name, body, mode):
    global burned
    # Mark before the effect: an interrupted/uncertain O_EXCL acknowledgement
    # cannot prove that its name was never created.
    burned = True
    fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_NONBLOCK |
                 (os.O_APPEND if mode == 0o600 else 0), 0o600, dir_fd=PARENT)
    try:
        created = os.fstat(fd)
        need(stat.S_ISREG(created.st_mode) and created.st_nlink == 1 and
             stat.S_IMODE(created.st_mode) == 0o600 and created.st_size == 0 and
             created.st_uid == os.geteuid() and
             created.st_gid == int(request["parent_identity"]["gid"]), "FRESH_FILE")
        need(version(os.stat(name, dir_fd=PARENT, follow_symlinks=False)) == version(created), "FRESH_NAME_CHANGED")
        empty_acl(fd)  # BEFORE even the first sensitive byte.
        need(version(os.fstat(fd)) == version(created) and
             version(os.stat(name, dir_fd=PARENT, follow_symlinks=False)) == version(created), "FRESH_FILE_CHANGED")
        clock(request)
        if body:
            need(os.write(fd, body) == len(body), "PARTIAL_WRITE")
        os.fchmod(fd, mode)
        os.fsync(fd)
        retained, row = read_file(request, fd, name, mode, MAX_METADATA, allow_empty=not body)
        need(retained == body, "WRITE_READBACK")
        return row
    finally:
        os.close(fd)


def named_metadata(request, name, expected, mode, allow_empty=False):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=PARENT)
    try:
        _, row = read_file(request, fd, name, mode, MAX_METADATA, allow_empty)
        need(row == expected, "METADATA_CHANGED")
    finally:
        os.close(fd)


def directory_guard(request):
    parent_guard(request)
    s = os.fstat(DIRECTORY)
    need(stat.S_ISDIR(s.st_mode) and identity(s) == request["directory_identity"] and
         stat.S_IMODE(s.st_mode) == 0o700 and s.st_uid == os.geteuid(), "DIRECTORY_CHANGED")
    need(identity(os.stat(request["directory_name"], dir_fd=PARENT, follow_symlinks=False)) == identity(s),
         "DIRECTORY_NAME_CHANGED")
    local_filesystem(DIRECTORY)
    empty_acl(DIRECTORY)


def run(request):
    global mkdir_attempted, directory_created, append_attempted
    common = ("protocol", "operation", "parent_path", "parent_identity", "directory_name", "deadline_at_ms", "issuer_stored_bytes")
    need(type(request) is dict and request.get("protocol") == PROTOCOL, "PROTOCOL")
    publication_backend()
    need(type(request.get("issuer_stored_bytes")) is int and
         0 <= request["issuer_stored_bytes"] <= MAX_METADATA, "METADATA_CAPACITY")
    anchor_name, journal_name = names(request)
    if request.get("operation") == "create":
        closed(request, common + ("anchor_base64", "anchor_sha256", "journal_base64", "journal_sha256"))
        anchor = decode(request["anchor_base64"], request["anchor_sha256"], MAX_METADATA)
        journal = decode(request["journal_base64"], request["journal_sha256"], MAX_EVENT)
        need(request["issuer_stored_bytes"] + len(anchor) + len(journal) <= MAX_METADATA, "METADATA_CAPACITY")
        parent_guard(request)  # Host, filesystem, ACL and ancestry BEFORE effects.
        anchor_row = create_file(request, anchor_name, anchor, 0o400)
        journal_row = create_file(request, journal_name, journal, 0o600)
        os.fsync(PARENT)  # Both burn files are acknowledged before mkdir.
        parent_guard(request)
        named_metadata(request, anchor_name, anchor_row, 0o400)
        named_metadata(request, journal_name, journal_row, 0o600, allow_empty=True)
        # Exactly one attempt at exactly the selected name, relative to FD3.
        mkdir_attempted = True
        os.mkdir(request["directory_name"], 0o700, dir_fd=PARENT)
        directory_created = True
        fd = os.open(request["directory_name"], DIR_FLAGS, dir_fd=PARENT)
        try:
            child = os.fstat(fd)
            need(stat.S_IMODE(child.st_mode) == 0o700 and child.st_uid == os.geteuid(), "DIRECTORY_OWNER_MODE")
            local_filesystem(fd)
            empty_acl(fd)
            need(identity(os.stat(request["directory_name"], dir_fd=PARENT, follow_symlinks=False)) == identity(child),
                 "DIRECTORY_NAME_CHANGED")
            with os.scandir(fd) as entries:
                need(next(entries, None) is None, "DIRECTORY_NOT_EMPTY")
            os.fsync(fd)
            os.fsync(PARENT)
            parent_guard(request)
            need(identity(os.stat(request["directory_name"], dir_fd=PARENT, follow_symlinks=False)) == identity(child),
                 "DIRECTORY_NAME_CHANGED")
            return {"protocol": PROTOCOL, "status": "created", "directory_identity": identity(child),
                    "anchor": anchor_row, "journal": journal_row,
                    "issuer_stored_bytes": request["issuer_stored_bytes"], "external_metadata_bytes": len(anchor) + len(journal),
                    "actual_metadata_bytes": request["issuer_stored_bytes"] + len(anchor) + len(journal),
                    "authority_claim": False}
        finally:
            os.close(fd)
    need(request["operation"] in ("append", "verify"), "PROTOCOL")
    closed(request, common + ("directory_identity", "anchor", "journal") + (() if request["operation"] == "verify" else ("event_base64", "event_sha256")))
    directory_guard(request)
    anchor, anchor_row = read_file(request, ANCHOR, anchor_name, 0o400, MAX_METADATA)
    journal, journal_row = read_file(request, JOURNAL, journal_name, 0o600, MAX_METADATA, allow_empty=True)
    need(anchor_row == request["anchor"] and journal_row == request["journal"], "METADATA_CHANGED")
    if request["operation"] == "verify":
        directory_guard(request)
        return {"protocol": PROTOCOL, "status": "verified", "directory_identity": request["directory_identity"],
                "anchor": anchor_row, "journal": journal_row,
                "issuer_stored_bytes": request["issuer_stored_bytes"], "external_metadata_bytes": len(anchor) + len(journal),
                "actual_metadata_bytes": request["issuer_stored_bytes"] + len(anchor) + len(journal), "authority_claim": False}
    event = decode(request["event_base64"], request["event_sha256"], MAX_EVENT)
    need(request["issuer_stored_bytes"] + len(anchor) + len(journal) + len(event) <= MAX_METADATA, "METADATA_CAPACITY")
    parent_guard(request)
    clock(request)
    need(fcntl.fcntl(JOURNAL, fcntl.F_GETFL) & os.O_APPEND, "JOURNAL_APPEND_FLAG_REQUIRED")
    append_attempted = True
    need(os.write(JOURNAL, event) == len(event), "PARTIAL_APPEND")
    os.fsync(JOURNAL)
    retained, next_row = read_file(request, JOURNAL, journal_name, 0o600, MAX_METADATA)
    need(retained == journal + event, "APPEND_READBACK")
    directory_guard(request)
    _, final_anchor = read_file(request, ANCHOR, anchor_name, 0o400, MAX_METADATA)
    need(final_anchor == anchor_row, "ANCHOR_CHANGED")
    return {"protocol": PROTOCOL, "status": "appended", "directory_identity": request["directory_identity"],
            "anchor": anchor_row, "journal": next_row,
            "issuer_stored_bytes": request["issuer_stored_bytes"], "external_metadata_bytes": len(anchor) + len(retained),
            "actual_metadata_bytes": request["issuer_stored_bytes"] + len(anchor) + len(retained), "authority_claim": False}


try:
    raw = sys.stdin.buffer.read(MAX_REQUEST + 1)
    need(len(raw) <= MAX_REQUEST, "REQUEST_LIMIT")
    request = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=pairs,
                         parse_float=forbidden, parse_constant=forbidden)
    result = run(request)
    encoded = json.dumps(result, separators=(",", ":"), allow_nan=False).encode("utf-8")
    need(len(encoded) <= MAX_REPLY, "REPLY_LIMIT")
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()
except Exception as error:
    result = {"protocol": PROTOCOL, "status": "held", "code": str(error) if isinstance(error, Held) else "OS_IO_OR_PROTOCOL",
              "errno": error.errno if isinstance(error, OSError) else None,
              "burn_may_have_occurred": burned, "mkdir_attempted": mkdir_attempted,
              "directory_created": directory_created, "append_attempted": append_attempted,
              "authority_claim": False}
    sys.stdout.write(json.dumps(result, separators=(",", ":")))
    sys.stdout.flush()
    sys.exit(2)
