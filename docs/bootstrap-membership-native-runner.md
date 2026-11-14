# Fresh paused-bootstrap runner

`runOriginalPeerBootstrapMembership(cap, options)` is a trusted Source
composition. It consumes an already original admitted bootstrap cap and its
opaque preflight exactly once. It accepts existing scope directories and an
optional cancellation signal. It accepts no enrollment request, operation ID,
phase selection, model, profile, native ID, spawn hook or replacement transport.
It does not call admission again or charge another unit.

The loaded-component entry is
`createOriginalLoadedBootstrapMembershipRuntime(options)` in
`context-component-deployment.mjs`. Its closed options contain the original
`ledger` and `actor`, plus fixed `scope_root`, `cwd`, `read_paths`, `state_root`
and `scratch_root` directories. The selected loader verifies and imports the
original membership and runner modules from the same component source realm.
The returned frozen facade exposes `enroll`, `inspect`, `activate`, `revoke`
and `run(phaseArgs)`. Each call rechecks the original loaded component. `run`
prepares the admission through that membership service, rechecks the component,
then passes the original opaque cap directly to the existing runner. It exposes
no cap, replacement namespace, callback, transport, spawn hook or profile.
Factory creation does not enroll, admit, activate or launch work. This internal
composition supplies no new founder authority or Native qualification.

The protected operator consumer is the existing `company_origin` tool. Its
closed `bootstrap_enroll`, `bootstrap_inspect`, `bootstrap_run`,
`bootstrap_activate` and `bootstrap_revoke` actions pass through actual HOST,
current-owner and custody checks in `peer-origin-runtime.mjs`. The fixed
`runOriginalPeerBootstrapMembershipOperation` helper in `maintenance-launch.mjs`
checks the existing paused bootstrap purpose, seal and checkpoint, loads the
selected packaged component, derives private directories, creates the loaded
facade and invokes its corresponding method. `bootstrap_run` reaches the
original runner through `facade.run`; public input selects no actor, ledger,
path, namespace, capability, transport, spawn hook or profile. See
[public origin routing](peer-public-origin-routing.md#paused-bootstrap-operator).

Before claiming/loading the runner and at each current capability check, the
fixed synchronous maintenance-capacity assertion must accept this exact
existing `work_items` bootstrap admission, including its already charged
reservation. A missing original assertion remains a Hold. This join does not
grandfather an old census, implement another global
inventory, omit legacy coverage or charge another unit. The independent
inventory producer and its applicable owning scope must be supplied separately.
After the original bootstrap binding and before spawning, the runner calls the
central domain's synchronous execution-launch binder with that exact ledger
and admission reference. A missing binder remains a Hold. The independent
producer owns its one-launch witness and actual spawn hook; the runner does
not claim, burn or charge another invocation itself.

The original interpreter, selected component, full Node/Native inventories,
compiled executable, original managed host, private observer/control FDs and
fixed loopback policy remain required. Inspection DATA cannot replace any
original handle. A fixed bootstrap control-transcript constructor selects the
complete readonly3 descriptor before startup; ordinary descriptors and arbitrary
tool subsets cannot select this route.

The context descriptor `soloco-bootstrap-membership-readonly3-v1` identifies
the fixed bootstrap catalogue and codec. The actual AppServer permission
profile is the separate built-in `:read-only`. The runner requires its genuine
correlated `thread/start` effective metadata, the actual cwd/workspace roots,
never approval, expected instruction sources, a fresh UUIDv7 thread/session,
empty turns, no parent/fork, and no ephemeral/resume path. It preserves the
complete actual permission metadata in the original creation facts. The final
model-request body projection is not permission-profile proof.

The original domain issues a private creation token after that fresh response
and the actual scoped-context acknowledgement. Membership binds this token
before the first turn. The only model callbacks are context header, context
read with at most 4096 characters, and context submit with `sha256/content`.
Every admitted range must be read through the channel; the final answer must
equal the first attributed submission byte for byte. Unknown actions, extra
tools, foreign identities, duplicate/replayed lifecycle messages, incomplete
reads, replacement submissions and wire overflow remain Holds.

The fixed host grammar accounts for the pinned SDK's normal status-before-turn,
reasoning/plan progress, token usage, raw response usage/item metadata, owned
server-request resolution, name/read-state and rate-limit notifications. Their
closed envelopes, known shapes, thread/turn correlations and common byte/message
bounds are checked. Raw response items and opaque usage metadata are retained
only as non-authorizing DATA; they cannot establish a callback or final answer.
Unknown methods, external raw tool kinds, waiting/system-error status and new
activity after terminal remain Holds. A bounded inactive status/usage tail does
not alter the original terminal evidence or reopen stdin.

The advertised source resource retains its complete numeric bounds and original
hash. The pinned c407 SDK materializes Responses parameters through its typed
`JsonSchema`, which omits numeric minimum/maximum. The Native comparator uses
only the separate closed materialized projection. The actual channel still
enforces its original range and response bounds; the ordinary catalogue is
unchanged. Authored Native tests include an actual SDK handler conversion with
independently literal expected schemas.

The domain's existing task drain protocol now has a disjoint bootstrap branch
for authentic `work_items` admissions and bootstrap kinds. It cannot accept an
ordinary command admission or another phase. Successful completion requires
the original successful terminal, exact final output, all original response
body EOF/terminal witnesses, no outstanding requests or replies, clean original
exit, all local stdio/control closure and the original broker's observed local
closure. A separate bootstrap owned-unit closure assertion binds the exact
drain. This releases only that admitted unit; group/remote/whole-domain closure
remain unproved and prior UNKNOWN reservations remain unchanged.

One original deadline, captured before the first synchronous capacity read,
covers preparation, execution and cleanup without renewal. Both admission and
execution deadlines are checked after synchronous currentness providers. Any
signal, error, expiry, drift, cancellation, incomplete capture or missing
original producer prevents positive completion. Genuine negative diagnostic
tokens may be retained through the existing late-evidence path. A missing or
failed recording guard leaves the reservation uncertain; it is not a refund,
retry or release.

This Source increment selects no company operation, enrollment, native launch,
model call, installation or production acceptance. Tests are authored and
unrun. Typed accounting, complete qualified context, current capacity evidence
and actual owning-host/Native qualification remain independent prerequisites.
