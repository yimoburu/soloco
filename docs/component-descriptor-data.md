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

The sealed native executable is a read-only component file. Inspection labels it
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
