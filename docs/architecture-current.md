# SoloCo source architecture

This diagram covers merged main `050d9b8a248314ffc02f371708fa69902f138d85`
(through PR #94, November 12, 2026). It maps implemented source composition;
installation, hook activation, native qualification and company adoption need
their own evidence.
The founder works with CoS agents; the supervisor, guard and storage boxes are
software. CoS peers are intended equals with per-task accountability. The current
production company route retains one registered owner; observer chats do not gain
that authority by reading a repository or receiving a message.

```mermaid
flowchart TB
  F[Founder: intent, corrections, reserved decisions]
  subgraph Agents[Agents and declared collaborators]
    C1[CoS A]
    C2[CoS B]
    C3[CoS C]
    W[Standalone specialists]
    QA[Independent native QA]
    I[Assigned integrator]
    O[Declared handoff observer]
  end
  F <--> C1
  F <--> C2
  F <--> C3
  C1 <-. intended peer coordination .-> C2
  C2 <-. intended peer coordination .-> C3
  subgraph Runtime[Software: current company route]
    H[Request-scoped root caller metadata, managed hooks and stdio MCP]
    G[Registered owner, scope, source, expiry and capacity guards]
    T[Frozen tasks and optional delivery contract]
    S[Task supervisor and execution adapters]
    P[Automatic retention-review geometry preflight]
    K[Exact structural cache: geometry only]
    A[Existing test, independent review and owner acceptance gates]
    R[Canonical immutable acceptance report]
    D[Attributed handoff chain and current receiver]
    M[Read-only lifecycle observations and exact pages]
    DB[(Company SQLite and immutable evidence)]
  end
  C1 & C2 & C3 --> H
  H --> G
  G --> T --> S
  S <--> W
  G --> P <--> K
  P --> QA
  W & QA --> A
  A --> R --> D
  D --> I
  D --> O
  G & T & S & A & R & D <--> DB
  DB --> M --> H
  subgraph Delivery[Separate delivery evidence]
    GH[Draft PR, independent source review, required CI and auto-merge]
    IN[Installation and host reload]
    AD[Checked company rule adoption and continuity]
  end
  I --> GH --> IN
  IN -->|when definitions or ownership change| AD
  subgraph Peer[Implemented peer source route: native operation remains held]
    OP[company_peers: canonical founder and checked layout-5 adoption]
    BR[Fixed original provider, protected bridge and membership lifecycle]
    PE[Peer model, scheduler, membership and protected observation journal]
    RD[Bounded persisted inspect and read: no provider start]
  end
  H --> OP
  OP --> RD
  RD --> DB
  OP -->|explicit start and qualified original recipe| BR
  BR --> PE
  PE <--> DB
  OP -. current operator and final commit fences .-> G
```

Preflight measures delivery geometry before an attempt; it cannot establish
understanding. Cache reuse never substitutes for fresh authority or independent
judgment. Acceptance reports preserve the actual local gate and failed history.
External handoff observations do not themselves authenticate GitHub, installation
or adoption. Unknown process closure keeps its reservation. Current compulsory
notices, including earlier continuity, timeout and retention failures, retain
their own repair requirements.

The public peer route requires the actual canonical founder and current owner
epoch. Caller metadata alone grants no authority. Its source composition cannot
initialize or adopt legacy storage, qualify a native host, or clear the existing
legacy-origin execution hold. Public owner transfer, cold layout-5 instruction
loading and native maintenance still require their separate reviewed producers
and integration. See [peer production routing](peer-production-runtime.md) and
[MCP caller context](mcp-caller-identity.md).

See [current capabilities](current-capabilities.md),
[SPEC evidence](spec-reconciliation.md), [implementation flow](implementation-speed.md)
and [handoff interfaces](development-delivery.md) for exact boundaries.
