# Original FD-relative sidecar capture

The Node runtime cannot bind pathname `opendir` to a separately held directory FD
on macOS. Repeated transient substitutions of a nonselected ancestor can make
every pathname enumeration see an external empty directory while the selected
original's metadata remains unchanged. A regular-to-FIFO race can also block a
plain read-only `open` before its next type check. Earlier source cuts are
preserved as failed or intermediate evidence; timestamp checks on unrelated
ancestors are not the repair.

`plugins/soloco/helpers/origin-sidecar-capture.c` is a small fixed POSIX reader.
It receives **only** argv `origin-sidecar-capture-v1` and original directory FD3.
No company root pathname, program pathname, environment selector, instruction or
permission is accepted by that program. All descendant operations are relative
to held original descriptors: `openat` uses `O_NOFOLLOW | O_NONBLOCK`, directory
enumeration uses `fdopendir(dup(fd))` and `readdir`, and name checks use `fstatat`
with `AT_SYMLINK_NOFOLLOW`. Ordinary files require link count one. Symlinks,
special files and changed names/inodes are denied.

The reader retains all file/directory descriptors, actual content and original
metadata until final checks. Device, inode, mode, uid/gid, link count, size and
nanosecond modification/change times must match. Complete directory enumerations
must match. Its bounds are 1,000 files, 1,000 directories including the selected
root, depth 24, 64 MiB of original file content, 10,000 names per enumeration and
4,096 bytes per relative pathname. A lower actual descriptor/resource limit
Holds the whole operation. The raw content limit is unchanged. It emits no
stdout until complete validation; any error emits only a bounded diagnostic to
stderr and a nonzero exit status.

The response is binary: eight bytes `SOCOFS1\n`, big-endian u32 file count, then
for each file a big-endian u32 pathname-byte count, big-endian u64 content-byte
count, exact relative pathname bytes and exact content bytes. The Node consumer
requires exit zero, the complete exact frame, all bounds, unique safe relative
UTF8 paths and no trailing data. Arbitrary content remains exact bytes, including
opaque non-UTF8 file content. Non-UTF8 filenames Hold instead of becoming
replacement-name records. It computes content hashes over the retained bytes.

Only exact root `company.sqlite`, `company.sqlite-wal` and `company.sqlite-shm`
ordinary files are excluded as declared database snapshot inputs. Other names
and directory trees, including `company.sqlite-journal`, are retained. Directory
enumerations and descriptors close the file inventory; no semantic-obsolescence
or complete-original-history judgment follows from a filename or this capture.

`origin-sidecar-capture.mjs` obtains an opaque handle itself from the fixed
deployment namespace's synchronous no-argument
`prepareOriginalOriginSidecarCaptureProgram()`. Inspection is only through
`inspectOriginalOriginSidecarCaptureProgram(handle)` and must yield:

```text
protocol: soloco-original-origin-sidecar-capture-program-v1
executable: {path, bytes, sha256, mode: 100555}
source_sha256, source_package_sha256, compiled_manifest_sha256
component_intent_key
argv: [origin-sidecar-capture-v1]
native_qualified: false
```

The selected actual build/deployment producer owns that handle and full source,
compiler/SDK, package, binary and receipt chain. The wrapper requires current
canonical C source/binary hashes, passes only its own validated directory FD,
uses fixed argv/environment, bounds output and execution to 30 seconds, and
reinspects the **same original** handle after child termination. It accepts no
caller descriptor, helper path, ready flag or JSON proof. The canonical source
must be compiled alone, without the test interposer/header. Deployment preparation
must be checked before a mutable Store/database open or any company write. A
missing producer/deployment is an explicit Hold; no pathname fallback exists.
This source cut does not package/select a production helper or qualify a native
model host. Those are separately reviewed joins.

The SOURCE tests build the actual C reader with the resolved absolute local
clang and explicit SDK, retaining source/binary/compiler/settings pins. The
selection namespace is explicitly synthetic. Test-only syscall interposition
performs actual disposable ancestor swaps, FIFO substitution, file growth and
selected-directory substitution; it fabricates no stat or returned source
content. Additional cases cover UTF8/opaque content, depth/byte bounds, links,
corrupt frames, unknown SQLite prefixes and source-provider SQL rollback. With
`SOLOCO_SOURCE_FIXTURE_ARTIFACTS`, the test harness retains its actual binaries,
source copies, interposer and metadata for inspection. None of this launches a
model/provider, reads a live company, grants future execution, releases UNKNOWN
reservations or establishes native qualification.
