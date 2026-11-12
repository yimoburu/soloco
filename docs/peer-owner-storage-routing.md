# Layout routing during concurrent legacy work

Legacy open/status and the unqualified startup hook need only a storage-kind
hint before choosing their existing path. They use a separate routing helper
that can discard and reopen at most three failed readonly classification probes.
Only storage-change errors constructed by the original module qualify, through
private object identity. A provider error with the same code, name or message,
including an AggregateError and its causes, is propagated unchanged.

Each probe retains the original descriptor, file-version, root-version, path
and layout checks. Schema discovery applies only the connection-local SQLite
`busy_timeout=5000`, matching the existing legacy Store. It changes no journal,
schema or company data. An exhausted wait remains an error.

The routing result grants no identity, context or operation authority. Actual
peer access opens and validates the original source again after its HOST and
managed-hook gates. The strict `peerOwnerStorageKind`, private peer opener and
ABA guards do not retry an operation or relax a source check. An ambiguous
private open still Holds; a successful routing retry cannot serve the wrong
database or silently classify a failed probe as legacy.
