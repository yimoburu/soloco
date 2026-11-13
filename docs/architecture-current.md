# SoloCo architecture

Source snapshot: [`b72f9c4`](https://github.com/yimoburu/soloco/commit/b72f9c4cb2ad0502f53f35ea06fd916bbf342c8b), November 12, 2026.
This map describes implemented repository interfaces. Installed packages,
connected MCP processes, qualified native execution and company adoption are
separate states; each requires its own evidence.

## CoS collaboration and task accountability

CoSes are peers. They communicate directly, select one accountable lead for each
task, and consult the affected peers. Leading a task is a responsibility, not a
permanent rank. Independent review can come from a qualified noncontributing CoS
or standalone agent. The receiver's acceptance is a separate decision.

```mermaid
flowchart TB
  F["Founder: intent, corrections and reserved decisions"]
  subgraph Peers["Equal CoS peers: direct reciprocal coordination"]
    direction LR
    A["CoS A"] <--> B["CoS B"]
    B <--> C["CoS C"]
    C <--> A
  end
  F <--> A
  F <--> B
  F <--> C
  A -. "lead selected per task" .-> L["One accountable task lead<br/>chosen from the peers"]
  B -. "lead selected per task" .-> L
  C -. "lead selected per task" .-> L
  L --> W["Scoped specialists or software work"]
  W --> E["Artifact and attributable source/test evidence"]
  E --> R["Independent review capability<br/>qualified noncontributing peer or standalone agent"]
  R -->|repairs| L
  R --> V["Receiver acceptance<br/>recorded approver for this scope"]
  V -->|Git changes| I["Assigned Git integrator<br/>draft, exact-head gates, native auto-merge,<br/>verify merge and main CI"]
  L -. "authorized company request" .-> G["Software guards<br/>caller, owner/epoch, scope, grants,<br/>context, expiry and transaction checks"]
  V -. "applicable company-write route" .-> G
  G --> S[("Canonical company records and evidence")]
```

The company still has one registered owner at a time. Communication permission
does not confer company-write authority or transfer ownership. Review, receiver
acceptance, Git integration and company mutation are distinct responsibilities.
The receiver-acceptance node is a decision/evidence boundary; it does not imply
that public peer readers expose an acknowledgement or publication endpoint.

## Software and language boundaries

All arrows below describe source wiring. The layout-5 peer routes require checked
adoption, original producers, current authority and the applicable qualified host
recipe. Drawing those routes does not establish that a company has adopted them.

```mermaid
flowchart TB
  H["Host chat or CLI"] --> MCP["Node.js MCP entry<br/>request scope and storage-layout routing"]
  ORIGIN["Node.js company_origin<br/>legacy QA, plan and quarantine<br/>peer-origin status, manifest, frontier and seal"]

  subgraph Existing["Existing company route"]
    CORE["Node.js engine and context/authority guards"]
    WORK["Node.js task supervisor and workers"]
    CLI["Bounded standalone Codex or Claude sessions"]
    STATE[("Company SQLite<br/>records and immutable evidence")]
    CORE <--> STATE
    CORE --> WORK --> CLI
  end
  MCP --> CORE

  subgraph Peer["Conditional layout-5 source routes"]
    OWNER["Node.js company_owner<br/>custody, pinned/context reads, handover gates"]
    PUBLIC["Node.js company_peers<br/>canonical founder operator and runtime router"]
    SCHED["Node.js membership lifecycle<br/>and peer scheduler"]
    TASK["Node.js TaskHost and context interpreter<br/>explicit supported callback profile"]
    FENCE["Node.js task-bound action client<br/>original executor and sealed admission checks"]
    LEDGER[("SQLite peer ledger<br/>tasks, grants, claims, effects and evidence<br/>owning transaction and final commit guard")]
    OWNER <--> LEDGER
    PUBLIC --> SCHED
    SCHED <--> LEDGER
    SCHED --> TASK
    TASK --> FENCE
    FENCE <--> LEDGER
  end
  MCP -. "root caller, hook and owner/epoch" .-> OWNER
  MCP -. "root caller, hook and origin-purpose gates" .-> ORIGIN
  MCP -. "root caller, hook and adopted founder" .-> PUBLIC
  ORIGIN <-->|"original owner and epoch gates"| STATE
  ORIGIN <-->|"checked quarantine and peer-origin controls"| LEDGER

  subgraph Native["Protected native source composition"]
    RUST["Rust Codex companion<br/>startup and original context/history/tool evidence<br/>final request checks, authentication and TLS"]
    BROKER["Node.js CONNECT broker<br/>current-authority checks and opaque TLS forwarding"]
    PROVIDER["Supported provider endpoint"]
    RUST --> BROKER --> PROVIDER
  end
  TASK <-->|"JSON-RPC and private FD3/FD4"| RUST

  subgraph Build["Separate source/build lane"]
    PY["Python preparation and verification tools"]
    CARGO["Pinned Rust toolchain and source manifests"]
    ART["Source-associated build/deployment artifacts"]
    PY --> CARGO --> ART
  end
  ART -. "original selection, deployment and loader checks" .-> TASK
```

Rust extends the existing Codex internals where original session, instruction,
model, response and tool-return evidence is produced and the final authenticated
request is sent. Authentication and TLS remain in Rust; the Node broker forwards
opaque TLS bytes. Node.js owns company APIs, scheduling, policy, persistence
coordination, the TaskHost and broker. Python prepares and verifies native source
and build inputs in a separate tooling lane.

`company_peer_adoption` provides read-only preparation. It does not migrate or
adopt a company. The owner and origin routes also retain their original producer,
custody, operating-state and qualification requirements. A current source
interface or matching package is not proof of installed-host activation,
historical launch coverage, global capacity, old-actor isolation or continuity.

## Task-bound inspection, replay and writes

Current source implements a useful task-bound client and a physical precommit
guard. The historical always-unavailable preparation drafts are not the current
implementation. See [task-bound peer actions](peer-task-effects.md).

```mermaid
flowchart TB
  P["Original executor incarnation<br/>and immutable admission producer"] --> G
  subgraph TX["One owning SQLite transaction"]
    G["Check principal, founder/owner, task/attempt,<br/>authority epoch, lease, grant and exact context"]
    OP["Task-namespaced replay<br/>or supported inspection/action"]
    STAGE["Stage authorized writes, if any<br/>rows, history, events and outbox"]
    FINAL["Uncached authority check<br/>and terminal expiry cutoff"]
    COMMIT["Physical COMMIT"]
    G --> OP --> STAGE --> FINAL --> COMMIT
  end
  G -->|stale or uncertain| HOLD["Hold or rollback<br/>retain original evidence and unknown reservations"]
  FINAL -->|changed or expired| HOLD
```

The explicit `task-bound-effects` profile supports its own `task/get` and
`task/context` inspections, scoped `message/send`, `notice/create` and
`home/propose`, and `handoff/accept` or `handoff/reject` for the exact admitted
typed handoff. It does not expose arbitrary execution, GitHub
publication, home publication or company/grant control. The read-only foundation
profile remains independently restricted. Protected process/result/closure
recording preserves its separate reconciliation path; stopping a runtime does
not prove descendant or remote-model closure or release unknown reservations.

## Source anchors and operational boundaries

| Area | Current source and explanation |
| --- | --- |
| MCP and ordinary company runtime | [`main.mjs`](../plugins/soloco/runtime/main.mjs), [`engine.mjs`](../plugins/soloco/runtime/engine.mjs), [durable tasks](async-runtime.md) |
| Peer operator, membership and scheduler wiring | [`peer-runtime.mjs`](../plugins/soloco/runtime/peer-runtime.mjs), [production routing](peer-production-runtime.md) |
| Owner and origin controls | [public owner routing](peer-public-owner-routing.md), [original-state mechanical QA](peer-origin-mechanical-qa-public.md), [frontier checkpoint](peer-input-frontier-checkpoint.md), [final seal](peer-origin-frontier-seal.md) |
| Task authority and physical commit checks | [`model.mjs`](../plugins/soloco/runtime/peers/model.mjs), [`ledger.mjs`](../plugins/soloco/runtime/peers/ledger.mjs), [task-bound actions](peer-task-effects.md) |
| Node host and network broker | [`codex-task-host.mjs`](../plugins/soloco/runtime/peers/codex-task-host.mjs), [`protected-connect-broker.mjs`](../plugins/soloco/runtime/peers/protected-connect-broker.mjs), [bridge topology](protected-peer-bridge.md) |
| Native Rust companion | [`soloco_protected_host.rs`](../native/codex/overlay/codex-rs/app-server-client/src/bin/soloco_protected_host.rs), [`protected_peer.rs`](../native/codex/overlay/codex-rs/codex-api/src/protected_peer.rs), [native source profile](native-peer-source-profile.md) |
| Native source/build tooling | [`protected_native.py`](../native/codex/tools/protected_native.py), [pinned source package](../native/codex/README.md) |

The earlier bridge-only diagram described a source composition before public peer
routing was added. The current public route is implemented, while actual
adoption/native qualification remains separate. Source/library tests, installed
bytes, connected hooks, genuine host/account operation and company acceptance
must retain their own exact evidence. Preflight measures context geometry;
complete delivery does not establish understanding or native fit. Existing
failed attempts, capacity and notice conditions keep their repair requirements.

See [current capabilities](current-capabilities.md), [SPEC evidence](spec-reconciliation.md),
[caller context](mcp-caller-identity.md), [lossless origin context](origin-mechanical-qa-lossless-wire.md)
and [CI delivery rules](ci.md) for the detailed boundaries.
