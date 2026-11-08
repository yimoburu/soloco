# Peer integration work in progress

This branch preserves unfinished integration work on top of the independently reviewed peer foundations in PR #49. It is a source snapshot, not a release candidate or evidence of live adoption.

The scheduler, migration path and v0.8.0/v0.22 packaging and contract changes remain unfinished. In particular:

- The scheduler still calls public `execute` for process/finish/closure recording; the accepted authority model requires the protected runtime observer. Its closure metadata also needs the required process-start binding and `close_observed` evidence.
- Migration still activates supplied native/session identities. Protected lifecycle binding, reconstruction-only access and independently reviewed activation must be completed before it can be used.
- Release/version, compatibility, governance and default routing need qualification together with the completed implementation. Passing foundation tests does not qualify these release changes.

Keep this branch in draft until integration repairs, executed regression checks and independent review cover the exact candidate. The snapshot contains source and documentation only; local company databases, credentials, candidate payloads and execution evidence remain outside this branch.
