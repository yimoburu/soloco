# Protected peer executable bridge

This internal source composition joins the original selected component, a separate
executable deployment, the fixed Node interpreter/TaskHost and the Rust private-FD
startup. It is not connected to company MCP dispatch or adopted company state.
No native acceptance follows from constructing a handle or passing source tests.

## Original source and deployment

`prepareOriginalSelectedContextDeployment()` accepts no arguments. It obtains the
original selected build handle, checks the current source/owner/journal/capsule,
and copies its read-only native bytes to a distinct executable deployment. The
recipe retains the original receipt paths and exact raw-byte commitments. It
never changes the sealed component's mode, imports a caller binary or overwrites
an incomplete deployment after a crash.

`loadOriginalSelectedPeerBridge()` loads the fixed original TaskHost/interpreter
module namespaces. The original producer revalidates the complete current Node
inventory before and after loading, the original Node executable/profile and the
same selection. The trusted source/runtime assumption is explicit: this is not
an attestation against an arbitrary source editor or hostile Node module cache.
A genuine run must use its qualified original Node entry and loader environment.
Caller namespaces, serialized handles and readiness flags cannot enroll support.

The derived source association is separate from the empty legacy static slot
list. It requires the genuine selected component, completed executable deployment
and actual fixed module load. It does not mark a binary native-qualified.

## Managed startup and transport

The original managed account home stays distinct from the private runtime state
and scratch directories. Rust reads its original config/auth files in place;
Node does not copy credentials, terminate TLS or receive authentication headers.
The companion-only policy permits the selected executable, literal reads and
scoped writes. Child network access is confined to one owned IPv4 loopback port.

`prepareOriginalProtectedPeerLaunch()` creates that listener before compiling its
exact port into the private policy. Listener preparation checks source support;
CONNECT admission and every subsequent write check the actual current task or
membership reservation, authority, expiry and context. The broker accepts only
`CONNECT chatgpt.com:443`, with a transient per-launch token, and forwards opaque
TLS bytes. It applies finite connection, stream and absolute lifetime bounds.
Other account endpoints or credential refresh paths need separate support.

The original Rust bootstrap claim carries the exact loopback port into its HTTP
factory before the first managed/auth client. Fixed routing takes precedence
over environment and system discovery and has no fallback. Scoped and provider
clients retain the same AuthManager, route, cookies and destination policy.

```mermaid
sequenceDiagram
    participant N as Original Node domain
    participant R as Source-associated Rust child
    participant B as Owned CONNECT broker
    N->>R: FD4 challenge: PID, binary, manifest, nonce, owned port, contract
    N->>R: stdin initialize
    R->>N: FD3 original host bootstrap, including port
    R->>N: FD3 scoped contract and original raw-byte binding
    N->>R: FD4 one matching context permit
    R->>N: actual initialize result after decoder installation
    N->>R: initialized, thread/start or resume, turn/start
    R->>N: FD3 final request observation
    N->>R: FD4 one current send permit
    R->>B: authenticated CONNECT; original Rust TLS and auth remain intact
```

Node sends `initialize` before waiting for bootstrap and consumes FD3 concurrently;
the reverse order deadlocks. It hashes the original Rust observation bytes rather
than a Node reserialization. The port must match the real listener, compiled
policy, challenge and returned bootstrap. Missing, changed or replayed bindings
hold. A write failure, deadline or uncertain close cannot renew a permit.

## Admission and callback boundaries

Main P2 supplies complete v1 contexts. The source-owned wire restriction checks
the complete instruction/frame/JSON-RPC overhead before the first reservation,
reviewer creation or model charge. Membership delivery rechecks the current
phase, authority and source cut. Task admission retains its original command,
slot, effect and context; runtime checks additionally bind the actual native
thread, turn and private process birth. Frame-v2 formatting of prospective v2
business data does not supply the separate missing semantic producer/adoption.

The fixed five-tool declarations remain exact. This candidate confines active
task callbacks to the existing read-only foundation facade. General active-task
effects still need an independently reviewed task/attempt/context fence inside
the same P2 write transaction, including replay. Membership channel writes keep
their existing transaction-local phase/currentness guards. These source changes
do not grant an operation, account route, model call or additional attempt.

## Bounds, closure and qualification

The native ingress limit is 100,000 bytes including complete JSON-RPC framing,
with four million aggregate bytes, 256 frames and four concurrent requests. The
Rust lifetime is 120 seconds from before startup, with five seconds reserved for
cleanup; the context acknowledgement has its own five-second deadline. Larger
generic codec limits cannot override the actual native limits.

Shutdown retains the original ChildProcess and latches its exit. It issues no
numeric process-group query or signal after exit or reap. Exit, stream EOF and
owned TCP closure remain separate observations. Group absence and remote model
domain closure remain unknown. The companion's stronger physical-close gate and
whole-domain/native acceptance therefore remain held; source tests cannot turn
those unknowns into `termination_confirmed` or release retained reservations.

Ordinary tests cover exact frames, raw observation hashing, port negotiation,
precharge holds, immutable deployment mechanics, broker rejection/backpressure,
actual launch-preparation control flow and safe child-lifecycle handling.
Synthetic predecessors and children in these tests establish mechanics only.
For this source cut, 1,100 ordinary Node tests across 26 roots, twelve separate
loopback broker/launch-preparation tests and 49 Python producer tests passed.
Offline Rust checks covered the five affected libraries and companion entry-point
metadata; two library harnesses compiled and all eleven new pure tests passed.
That network-denied run took 459.7 seconds, retained complete logs and observed
original leaders plus stdout/stderr EOF, with unchanged source/toolchain/SDK
postchecks. Its receipt is
`27e502b9f9edb5debafdb58b2ac7c24effa01b690c6e0c547ae4faa9a58d6bc6`.
It did not link or launch the production companion or establish descendant closure.

Actual selected deployment/startup, account access, native continuation, realistic
replacement/continuity and company adoption require separate evidence and bounds.
SPEC v0.21 and existing company ownership/authority remain unchanged.
