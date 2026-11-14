# Optional issue18 ledger storage tooling

`tools/issue18-ledger-storage.mjs` and its fixed Python worker implement storage
mechanics for the proposed issue18 ledger. They are **unwired qualification
tools**, not installed plugin runtime dependencies. No model, live profile,
storage/retention policy, grant or global-run issuer is selected by these files.
The accepted original 175 source assets and the read-only sidecar helper are
unchanged. No E3 candidate is imported or joined.

The constructor accepts a closed Source-only policy containing original open
parent/run directory FDs, the fixed child's name, an explicitly pinned
`/usr/bin/python3` executable SHA256 and an absolute deadline. The caller keeps
those original FDs open. The parent is the trusted selected anchor; verification
of its ancestry, selected path and authority belongs to the future supported
issuer. A handle here is private **storage session state only**. It is never a
Native capability, global run loan, arm admission or Store COMMIT witness.

The worker receives only inherited original FDs. All ledger-name operations use
`dir_fd`; the directory's name is checked against its original parent. The
worker's pinned Source is passed by value, not loaded from a late script path.
The nine fixed leaves are `RUN.json` and the four original arms times
`engineer|qa`. Initialization and each publication create the final leaf with
`O_EXCL|O_NOFOLLOW`, write the complete canonical bytes, set0400, fsync, close,
read back from the original directory, and fsync both retained directories.
There are no temporary files, rename replacement, delete, repair or automatic
retry paths. Partial files and uncertain outcomes remain in place. Live
publishers retain each previous leaf's identity/hash/version. Each bounded census
uses an independent directory description opened through fixed `.` relative to
the original FD, avoiding shared-directory-offset interference across processes.
Cold readers return DATA
only and cannot adopt the original publishing session.

This initial host adapter is deliberately limited to Darwin64, local writable
APFS/HFS and an empty extended ACL. It checks owner/mode/link/type, retained
directory/name identity, the Darwin `fstatfs64` ABI and libc ACL retrieval.
Python support, the exact ABI, binary pin, filesystem behavior and actual fsync
acknowledgements must be qualified on the selected host. A missing symbol,
unsupported host/filesystem/ACL retrieval or uncertain IO Holds; no pathname or
durability fallback exists. fsync acknowledgement does not prove stronger
device/power-loss durability. Failed or timed-out helper calls preserve
uncertainty; their direct child result does not establish descendant closure.

The storage layer validates bounded canonical finite JSON and the closed helper
protocol. **It does not validate the full A/B business schema or authenticate
record claims.** The future supported issuer must validate the exact A2/B
schema/Source/profile, actual current subject and preparation before calling
storage. No fake issuer is supplied. The existing original Store witness cannot
be relabeled as filesystem, PeerLedger or global-run authority.

Bounds remain RUN32768, each of eight slots16384, and reserved issuer metadata
32768: total B196608. The returned accounting includes the issuer reservation;
it does not claim to observe or implement that external issuer store. All of
its new versions/events/copies/tombstones must fit the original reserved pool.
Actual issuer grammar, physical capacity and retention support remain required
before real initialization. A's9975424/call plus B16384 and shared8192 remains
10M/call and80M/run; no borrowing or new call allowance is created. Full A/B
business validation, actual one-test/QA guards and E3 integration remain absent.

## Dependency and validation boundary

The new tests use disposable synthetic metadata and real temporary files;
they confer no selected profile or Native authority. All tests are authored
**UNRUN**. Darwin positives explicitly require the optional Python/libc/APFS
backend; other hosts retain the pure tests and truthful platform exclusions.
There is no syntax/import/probe/build execution in the authoring evidence.
The actual two-process contention case has a fixed Source program, a shared
ready/release barrier, finite child/output bounds and retained original child
handles. It requires one successful O_EXCL publication and one held contender,
with one exact immutable payload. Unexpected failures retain their fixture and
child logs; only completed expected cases remove disposable data. Direct-child
cleanup is recorded without claiming exhaustive descendant closure.

Primary ABI references used for the unrun Darwin adapter are Apple's
[ACL getter](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/acl_get_fd.3.html),
[Libc ACL getter implementation](https://github.com/apple-oss-distributions/Libc/blob/main/posix1e/acl_file.c),
[ACL entry implementation](https://github.com/apple-oss-distributions/Libc/blob/main/posix1e/acl_entry.c),
[ACL constants/types](https://github.com/apple-oss-distributions/Libc/blob/main/include/sys/acl.h)
and [XNU statfs64 layout](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/mount.h).
These are Source references, not proof of the selected host ABI or filesystem.

Default setup still promises Node-only operation: README23 and
`plugins/soloco/skills/setup/SKILL.md`8 say no Python is needed;
`plugins/soloco/scripts/run.sh` launches Node; `docs/development.md`44 and
`docs/architecture-current.md`109 separate Python preparation from runtime.
Those files and the installed package/launchers are unchanged. If production
wiring is selected later, it must explicitly reconcile:

- README and setup/development prerequisite claims;
- `.mcp.codex.json`, `.mcp.json`, `scripts/run.sh` and host lifecycle/dependency
  diagnostics, as applicable to the chosen actual runtime route;
- plugin package/source inventories and integrity/packaging checks;
- SPEC only if an enduring platform/dependency/authority rule changes;
- architecture documentation and exact issuer/A2/E3/runtime/API qualification.

Existing `protected_native.py` is a build-recipe dependency, not evidence that
the installed ordinary runtime already supports Python. This opt-in source
adds no silent installed prerequisite and makes no SDK/Native support claim.
