# Pinned SoloCo companion source dependency

This directory delivers the source recipe for the separate
`codex-soloco-protected-host` executable. It does not replace an installed Codex
CLI, install a toolchain, change configuration, authenticate, start a company or
launch a native/model session. The source-owned qualified executable slot remains
empty. A successful compile is not native qualification.

`source-package.json` pins official OpenAI Codex commit
`c40729ea5cf8e947481b130c59807273eda2f8e9`, tree
`078c14cecf94b522a2eff48b30996bf3f4d1bf7a`, the complete regular Rust source
inventory, the exact 41-file companion overlay, the accepted Cargo lock and the
official Rust 1.95.0 macOS arm64 toolchain. The patch is a review artifact; the
preparer copies hash-checked complete overlay files, avoiding patch fuzz or
partial application. All input files are verified before output creation.

The corrected source cut is `5a43acb8…`, retaining the old E0599 compiler failure
and its repair. The accepted lock `bc987be4…` preserves all 1,308 original external
package entries. Neither input is a build or independent native acceptance
receipt. The full source/build and native qualification status must be reported
from their separately observed receipts.

## Source preparation

Use Python 3.11 or newer. Supply the already obtained exact upstream commit
archive and a **new** output directory whose parent exists. This tool performs
no download. It verifies the entire archive hash before reading the 9,264 pinned
regular `codex-rs/` files; Git metadata and unlisted files are never copied. The upstream archive's special
`codex-rs/vendor/bubblewrap/LICENSE` member was not part of that regular-source
cut and is not dereferenced. Do not reinterpret this inventory as every upstream
repository file or an independently checked Git checkout.

The source tool pins its package-manifest hash in code and has no caller-selected
manifest option. A changed source cut requires a reviewed source change. Exact
upstream `LICENSE` and `NOTICE` texts are retained alongside the patch and overlay.

```sh
python3 native/codex/tools/protected_native.py verify
python3 native/codex/tools/protected_native.py prepare \
  --archive /absolute/c407-commit.tar.gz \
  --output /absolute/new-companion-source
```

All copied source files become read-only, retaining the source inventory's
executable distinctions. The output contains `source/codex-rs/` and an exact
`prepared-source.json`. Existing outputs are refused. Changed bytes, symlink
inputs, traversal, duplicate JSON keys, unknown manifest fields, unsupported
targets and pending packages hold; they do not select substitutes.

## Explicit offline build

The following command executes Cargo, build scripts, proc macros and the pinned
compiler. Run it only within the independently reviewed source-build authority.
The tool always uses the fixed root-owned macOS Seatbelt executor with a
source-generated deny-default domain: network is denied; source/toolchain and
explicit cache/system inputs are read-only; writes are confined to the new
output and six exact Cargo metadata files. Missing/unsupported executor or profile
failure never falls back to direct Cargo. A completed preparation does not
authorize this command.

Supply an existing private toolchain matching the pinned 153-file inventory and
an already populated private Cargo cache without credentials/config files. No
toolchain or dependency installation is performed. Child `HOME` and `CODEX_HOME`
are omitted; ambient credential/configuration variables are not forwarded. Git
system/global configuration, credential helpers/prompts, hooks, fsmonitor,
network protocols and automatic maintenance are disabled. No home/configuration
file is created or changed.
The exact upstream workspace `.cargo` files remain pinned; additional ancestor
Cargo configuration is refused. System linker/SDK differences remain a build
environment qualification requirement, not a byte-for-byte reproducibility
claim.

```sh
python3 native/codex/tools/protected_native.py build \
  --prepared /absolute/new-companion-source \
  --toolchain /absolute/verified-rust-1.95-prefix \
  --cargo-home /absolute/approved-offline-cargo-cache \
  --output /absolute/new-companion-build
```

The fixed command uses `--locked --offline --release`, target
`aarch64-apple-darwin`, two compilation jobs and
`SOLOCO_PROTECTED_HOST_BUILD=1`. The original fixed build timeout defaults to
1,200 seconds and may only be shortened. Output logs, exact command and selected
environment, return status and actual binary hash/size are retained in the new
build directory. There is no retry, installation, slot update or native launch.
Source and toolchain files are checked again before the receipt can report a
compiled output. Timeout, failed compilation and changed inputs remain failures.
The receipt does not establish descendant, backend or remote closure.

## Joining and qualification

The companion's 105-file Node graph in the source author's bindings is a component
input, not the final SoloCo runtime. Reconcile its concrete new modules/changes
with the current SDK and joined peer runtime under a new exact source manifest;
do not overwrite the SDK with the component's older copies. Preserve the normal
plugin packaging checks and all earlier failures.

After genuine source build/tests, independently review the actual compiler,
upstream/overlay/lock/toolchain, linker/SDK/environment, output and complete
runtime association. Only then may a separately reviewed source change bind an
exact executable in `protected-source-build-slot.mjs`. Runtime flags, JSON or
user-supplied callbacks cannot qualify a build. This source package never fills
that slot.

Original authentication/egress permissions, complete provenance, the cold
scheduler handoff, later path-only VFS containment and whole-domain closure
remain separate native qualification requirements. The acceptance matrix stays
unchanged; this package marks no MC row passed and grants no extra attempt,
provider use, allowance reset or expiry extension.

The source-generated build domain permits only fixed system compiler roots and
the system logger Mach service. Signals are restricted to the same sandbox;
process-info and additional startup Mach/mac-syscall grants are omitted.
Unsupported SDK locations/services hold and need
a reviewed source change. No domain or compiler run is implied by pure profile
checks. This bounded build policy is not general hostile-code or native
qualification; descendant, backend and remote closure remain unproved.

The first V3 deny-default profile aborted before C main on the observed host;
those attempts provide no denial proof. The V4 repair allows reading/testing the
literal root directory, following the pinned platform getcwd/startup rule,
without granting its subtree. It permits executable maps only in the pinned
toolchain, new output and `/usr/lib`, narrows system reads to explicit library
roots and uses the exact pinned hardware/OS sysctl-name set instead of global
sysctl read. Broad `/System` and its Data-volume aliases are excluded.

The exact V4 profile passed system `true` and the existing controlled C file,
loopback and owned-child cases on this host. Baseline, confined and Data-alias
runs are separate overlapping evidence. They do not establish Cargo build
compatibility, every credential interface, other hosts or native qualification.
The exact source/evidence cut and original failures must accompany integration.


The V5 system-dependency repair permits only a read of the literal
`/private/etc/ssl/openssl.cnf`. Pinned Cargo's LibreSSL startup attempted that
system configuration before `--version` and V4 correctly denied it; the original
failure remains retained. The tool validates symlink-free root-owned ancestors,
a root-owned single regular0644 file and the exact reviewed745 bytes/SHA-256
`025f5e31cd7b2248a0a661d8d346452c31d98e280f3420c3f6017c74c829ae73`
before output creation or spawn, then rechecks after a build. These reviewed
bytes contain only request/subject/attribute definitions, with no include,
provider or module directive. Any changed policy or dependency holds for review.
The tool neither selects a user configuration nor sets `OPENSSL_CONF`, disables
crypto policy, broadens `/private/etc` reads or grants system-config writes.

The original V4 C controls remain exact historical evidence; V5 adds only this
fixed, validated read. Separate pinned Cargo/Rustc `--version` observations test
startup only and do not qualify compilation, provider/account use, general
credential containment or native operation. This host system-config commitment
is a build-environment qualification boundary; other OS configuration bytes
require a reviewed source change. Pure fixture checks use temporary bytes and
mock ownership separately from strict metadata checks, never the CI host's real
crypto configuration. There are 32 pure checks after these six additions. Both pinned 1.95.0 version
commands exited successfully under V5 on the observed host with empty stderr;
all owned process groups were observed absent.


## Compiled source association (V6)

Before compilation the tool verifies every actual prepared source byte and
logical Git executable distinction. It derives a source-owned
`compiled-source-manifest.json` in the new build output, with schema
`soloco-compiled-native-inputs-v1`, the pinned upstream commit/tree, source-package
manifest SHA-256 and the complete source inventory (9,274 rows for package6f5).
Each row retains path, bytes, SHA-256 and logical Git mode. Serialization is
Python JSON with sorted object keys, compact separators, `ensure_ascii=True`,
UTF-8 encoding and exactly one terminal newline. The artifact is bounded to
16MiB and made read-only. It contains no output binary hash or self-hash.

The tool hashes the exact written bytes and sets the child build environment's
`SOLOCO_SOURCE_MANIFEST_SHA256` to that digest, satisfying the companion's
compile-time `option_env!` association. No CLI argument or inherited environment
can select that value. The plan and final receipt retain artifact schema, path,
byte count and SHA-256; the tool rechecks those exact bytes and complete source
and toolchain inputs before reporting a compiled output. Changed or missing
association artifacts hold even after a zero compiler return.

A future independently reviewed source-owned executable slot must map its
`source_manifest_path` and `source_manifest_sha256` to this retained artifact,
and separately bind the actual output binary, lock, toolchain and build receipt.
The artifact describes source inputs, so no binary/self-hash fixed point occurs.
It is an input association, not independent review, execution authority, native
qualification or evidence that a build happened. This source-preparation cut
runs no compiler/version/OS child; the slot remains empty and qualified binary
remains null.


V6 adds seven pure checks, bringing the suite to 39. They cover deterministic
complete-inventory generation, changed inputs/artifacts, retained final binding
and caller environment/CLI rejection. Successful compiler returns and output
bytes in these tests are explicit temporary mocks; no compiler or OS child is
executed and no genuine compilation receipt is produced.
