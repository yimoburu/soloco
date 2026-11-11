# SoloCo source architecture

This diagram covers the source follow-ups based on main through PR #74. It is a
source map, not evidence of installation, hook activation or company adoption.
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
    H[Trusted host hooks and stdio MCP]
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
  I --> GH --> IN --> AD
  subgraph Pending[Source libraries with production qualification still pending]
    PE[Peer model, scheduler, membership and protected observation journal]
    BR[Protected host identity, broker, routing and migration]
  end
  PE -. pending production composition .-> BR
  BR -. checked activation required .-> G
```

Preflight measures delivery geometry before an attempt; it cannot establish
understanding. Cache reuse never substitutes for fresh authority or independent
judgment. Acceptance reports preserve the actual local gate and failed history.
External handoff observations do not themselves authenticate GitHub, installation
or adoption. Unknown process closure keeps its reservation. Current compulsory
notices, including earlier continuity, timeout and retention failures, retain
their own repair requirements.

See [current capabilities](current-capabilities.md),
[SPEC evidence](spec-reconciliation.md), [implementation flow](implementation-speed.md)
and [handoff interfaces](development-delivery.md) for exact boundaries.
