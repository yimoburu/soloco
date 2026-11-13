# Inspecting prepared component data

The component library separates an inspectable build artifact from an executable
deployment or active interpreter. It is not routed through company tools, and
does not enable peer operation or supply execution permission.

This developer library requires a complete repository checkout, including
`tools/build-peer-context.mjs` and `native/codex`; importing it from an installed
plugin alone is unsupported. The fixed original producer targets macOS arm64
with Node 22 and requires its exact prepared source, pinned toolchain and Cargo
cache under `work/peer-context-component`. Missing prerequisites produce a Hold;
inspection does not provision them or start a build.

`context-build-component.mjs` retains the original source-owned build operation,
durable intent and selected capsule. `lookupOriginalSelectedContextComponentData()`
accepts no arguments and returns an opaque, module-local DATA handle only after
checking the current source, owner, original journal selection, capsule, receipt
and complete copy map. `inspectOriginalSelectedContextComponentData(handle)`
rechecks those facts and returns a detached, deeply frozen view. Serialized data,
cloned handles and caller-selected roots cannot replace the original handle.
Read-only lookup neither creates a missing journal nor starts or retries a build.

## Three compatibility boundaries

The source package and Python build receipt retain their original pretty JSON.
Their reader checks exact raw bytes, size and SHA, then performs strict UTF-8 and
JSON decoding before the existing schema and association checks. It does not
normalize or rewrite them. The recipe, compiled-source manifest and Node input
manifest retain their canonical-serialization checks.

`inspectOriginalSelectedContextComponentDescriptorData()` is a separate,
zero-argument DATA inspection. It obtains the genuine selected handle internally
and projects the verified original-to-sealed copy map. Each native reference
retains its original path, sealed relative path, read path, byte count and hash.
The original receipt still names the original build output; those paths are not
required to equal the later sealed-copy paths. Missing, duplicate, escaping or
inconsistent mappings are rejected.

The sealed native executable and `native/origin-sidecar-capture` helper are
read-only component files. The helper must have positive size at most 16 MiB and
the same sealed pin in the recipe and capsule, with logical mode `100644`.
Inspection labels both
`READ_ONLY_COMPONENT_BYTES`, with `executable:false` and
`deployment_required:true`. It does not add execute permission or turn the
component into a runnable slot. An executable deployment needs its own explicit
copy, identity, permission and lifecycle evidence.

## Scope and validation

The returned protocol is `soloco-context-component-descriptor-data-v1`, distinct
from an active interpreter recipe. Results retain `COMPILED_COMPONENT`,
`domain_closure:unestablished`, `qualified_interpreter:HELD`,
`native_qualified:false` and `claims_released:false`. The legacy source-owned
runtime slots remain empty. Filesystem hashes and an inventory graph do not prove
the actually executed Node closure.

The focused regressions cover original JSON formats, copy-map projection,
read-only executable classification, malformed inputs and retained Holds.
Synthetic projection fixtures exercise DATA transformations only. They do not
manufacture an original build selection or runtime capability. A genuine positive
lookup still needs the original producer to select a capsule using the exact
current source and runtime. Historical debug artifacts are not substituted.

Actual Node deployment, private-FD bootstrap, provider/account continuation,
process-domain closure and company adoption require their separate evidence and
authority. Existing UNKNOWN outcomes, reservations and spent or expired grants
remain unchanged. SPEC v0.21 and its single active company-owner rule are unchanged.


## Fixed packaged original service (SOURCE implementation)

The separate no-argument `buildOriginalPackagedContextComponent` and packaged
lookup/descriptor/deployment operations use the actual package's one runtime
module realm. Logical `plugins/soloco/...` Node keys map only to that package;
Native recipe keys map only to its closed `producer-inputs/native/codex` tree.
The unchanged pure input/intent schemas bind raw layout facts through the Node
profile. Packaged recipes/capsules and selected DATA label that exact layout;
developer records keep their original repository mapping. Neither service
accepts a caller layout, root, provider or factory, and one loaded bridge cannot
switch between the two services. The service is latched before the first await;
a failed first load retains its Hold, and an active module cannot renew a
different first selection. Sealed Node copies are evidence, never imports.

The packaged workspace is the fixed managed data child
`peer-context-component/v1`, outside the package. Lookup requires it and its
original journal/anchor; lookup never creates directories, initializes a journal,
provisions Native prerequisites or starts a build. Only the explicit Source
workspace/build operation can create its private children. The existing managed
data directory is never created, relocated or chmodded by that operation.

A new workspace publication alone writes `workspace-origin.json`, binding its
managed parent and original directory identities independently of package
versions. After all prerequisites pass, `journal-init.claim` is published with
exclusive creation and durable fsync **before** the first journal/anchor pair.
Both witnesses are immutable and never reset. Existing B without its origin,
missing claims for a retained pair, partial initialization, or a retained claim
with both journal and anchor missing remain Holds. A workspace-only prerequisite
Hold can continue on cold restart through the same original origin record.
This is not same-UID anti-rollback attestation or proof of old process closure.

Across package/source generations the same journal, history and selection
sequence remain. The winning reserve transaction checks retained unresolved
reservations from every generation before its CAS. Changed roots/hashes cannot
waive UNKNOWN. Owner identity is raw source/physical P/B facts; complete inputs
then derive input/intent keys, with no edge back from either key to the owner.
The fixed Python request gets B from the original Node service, without adding
home/data environment selectors. Original compiler/SDK/offline/timeout guards
and the developer Source entry remain separate and unchanged in meaning.

This source cut is not a selected compiled artifact, installation, original
loaded host, executed-module closure or native qualification. Synthetic source
fixtures and packaging checks cannot supply any of those facts or release
company notices, UNKNOWN reservations, expired/spent scopes or owner Holds.
