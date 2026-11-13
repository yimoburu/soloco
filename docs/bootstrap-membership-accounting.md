# Paused bootstrap accounting and context

The original quarantine selection may contain the closed
`peer-origin-paused-bootstrap-purpose-v1` purpose. This increment joins that
existing selection to membership accounting and qualified context. It creates
no grant, cohort, refund, renewed expiry or actual company operation.

The units are existing enrollment and phase invocations, not backend HTTP
requests. Each successful command changes the following counters atomically:

| Command | Nested bootstrap counters | Origin maintenance counters | Existing counters |
| --- | --- | --- | --- |
| Enroll, including a recovery with a new enrollment ID | Enrollments +1 | None | Existing enrollment authority |
| Admit reconstruction | Model calls +1 | Model calls +1 | Global, personal and enrollment model calls +1 |
| Admit review | Model calls +1; review calls +1 | Model calls +1; review calls +1 | Global, personal and enrollment model calls +1 |
| Repeat the exact same operation | None | None | None |

The existing maxima, original deadline and retained unspent recovery lineage
still apply. Failure, cancellation and UNKNOWN do not refund a committed spend
or release a reservation. A failure before the first physical put rolls back
the complete buffered command. The shared worker cap and all preflight/context
limits retain their existing checks.

Every bootstrap command retains its literal input and action in a closed
`peer-origin-paused-bootstrap-command-v1` witness. Historical replay verifies
that witness, its command ID and request hash, original producer event, exact
row versions/results, and paired origin/company updates. The selected
maintenance reader also requires this replay before accepting changed nested
counters. Equality of a descriptive normalized hash alone is insufficient.
Unknown counter names and changes to authority, limits, policy or pause state
are not exempted.

The authority baseline is the literal historical company and origin before the
first authenticated bootstrap charge. An enrollment pins that exact company
reference as `bootstrap_authority_ref`. Admission uses the same reference as
its `control_ref`. All later changes must be authenticated typed transitions;
no synthetic company value is created by removing fields from current JSON.

The bootstrap checkpoint reader preserves the original frontier-seal grammar.
It checks the complete current namespace and committed event interval, reverses
exact typed transitions to the authenticated baseline, then invokes the
original seal/checkpoint reader on that literal historical view. Unsupported,
negative, late and UNKNOWN changes remain Holds. Positive activation requires
the full original reconstruction, independent Pass and exact activation
transition. Historical lineage checks do not renew a current purpose.

The context assembler includes the complete original pinned-team bodies,
qualified current meaning, mandatory uncertainty and exact input references.
The stable source cut retains literal authenticated baseline rows. The outer
assignment separately carries `bootstrap_accounting`: full current company and
origin observations, typed spending history, namespace replay and the planned
phase delta. This preserves the same semantic source cut across reconstruction
and review while retaining the actual current costs. The complete assignment
and whole first RPC must fit their existing limits; nothing is truncated.

Source controls use temporary ledgers and explicitly labelled predecessors.
Counter and namespace controls do not create a Native issuer. Older lifecycle
fixtures retain their explicitly synthetic accounting/native predecessors and
do not establish actual qualification. Authored cases require a separately
selected test run before reporting a result.

The fresh bootstrap-only runner and original creation/drain/closure producers
remain absent and Held. This Source increment selects no provider call,
enrollment, pause, installation, reservation release or production acceptance.
