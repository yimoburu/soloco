# Peer production routing

`company_peers` connects the public operator entry point to the fixed original
peer provider, the membership lifecycle and the peer scheduler. It accepts only
bounded JSON data. A request cannot choose an implementation, issuer, bound
principal connection, native proof, readiness result or launch callback.

The public operator is the existing adopted canonical founder. Every MCP call
requires actual Codex root tool-call metadata matching the session selector and
a current managed hook record, then the exact founder's adopted `legacy_owner`
host, session and epoch. A binding file or caller-selected session alone cannot
supply identity. The founder principal comes from `control/company`, never from a
selected recipient. See the [caller context contract](mcp-caller-identity.md) for
the fixed host/stdio trust assumption and unsupported-host behavior; source
metadata checks are not installed-host or native qualification. Native peer
callbacks use the original TaskHost connection and its source-correlated executor
incarnation.

The runtime retains the exact canonical founder reference that started it.
Its private scheduler binding checks that reference inside production admission
and again before the owning SQLite commit. The admission carries the original
production authority into task callbacks, inspection and replay. Changing the
founder or its owning-session epoch fences those effects even when the peer's
own task grant and executor remain current. The router and provider also stop
their retained runtimes on detected authority drift. Recording exit and closure
evidence remains possible; stopping alone supplies no physical closure proof.

## Entry points

All calls supply `root`, `session_id`, `epoch` and `action`. Operational calls
also supply the exact bounded `source_instruction`. Action data belongs in the
closed `input` object.

| Action | Behavior |
| --- | --- |
| `status` | Reads existing checked peer storage through a read-only connection. Does not load a bridge or start a provider. |
| `inspect` | Pages compact metadata and exact current source references from fixed peer record families, without returning task contexts. |
| `read` | Reads canonical current value or task-result ranges by exact parent revision/hash; no historical fallback. |
| `start` | Loads the fixed original bridge and adoption-bound launch recipe, then starts the software scheduler in this MCP process. |
| `enroll` | Creates a bounded pending enrollment through the canonical operator lifecycle. |
| `stage` | Runs one fresh reconstruction or independent review phase through the same original provider. |
| `activate` | Requires the exact completed independent qualification and observed closure retained by membership. |
| `revoke` | Revokes a pending enrollment while retaining unknown effects and reservations. |
| `grant_create` | Uses the actual founder to grant an existing active recipient an explicit scope, action set, expiry and finite model allowance under current policy. |
| `grant_revoke` | Uses the actual founder to revoke an existing grant and advance its generation. |
| `assign` | Assigns a task using the recipient's current grant and qualification, retaining founder attribution. |
| `tick` | Requests one scheduler pass; the same grants, limits and admission checks apply. |
| `stop` | Stops this process's scheduler and retained runtime handles. Reports physical closure as unknown. |

After activation, `grant_create` takes `operation_id`, `grant_id`,
`to_principal_id`, explicit `actions` and `expires_at`; optional `scope`,
`resources` and `max_model_calls` retain the model's existing defaults and
policy limits. At most 100 bounded action strings and 32 existing resource
selectors are accepted. `grant_revoke` takes only `operation_id` and `grant_id`.
Both routes execute as the canonical founder; the recipient is the grant's
subject and gains only its scoped actions, resources, expiry and remaining
allowance. A task-bound peer callback cannot invoke either operator route.
Task assignment and grant changes use the original source-owned operator model
binding captured at start. Its same-transaction and final commit checks reject
an operator transition between the public precheck and the durable write.

`inspect` and `read` need no `source_instruction`, runtime start or retained
service. They authenticate the current canonical operator in the same read-only
snapshot as the selected records and work after a host restart. Allowed families
are `tasks`, `notices`, `messages`, `proposals`, `reviews`, `homes`, `deliveries`,
`work_items`, `grants` and `conflicts`. Inspection accepts bounded `status`,
`principal_id`, `task_id` and `scope` filters, a P1 cursor and a limit of 1–50
(default 20). It may return a smaller same-snapshot page to keep metadata within
24 KB; always follow its actual `next_cursor`. A changed collection makes an old
cursor stale and requires a fresh inspection.

Each source reference includes the full parent `{family,id,revision,sha256}`,
static `part`, selected `content_sha256`, `total_characters` and `utf8_bytes`.
`part` defaults to `value`; `result` selects only a task's persisted result and
avoids streaming its attempt context. A task without a result reports that part
unavailable. `read` takes the parent reference plus optional `part`, `offset` and
`length`. Its default and maximum length are 4096 UTF-16 units; boundaries never
split a surrogate pair. Concatenate ordered `text` fragments using the returned
`next_offset` until `complete`, then verify the selected canonical content hash.
Any current parent revision/hash drift fails closed even when old history exists.

These readers expose persisted evidence only. Public receiver acknowledgement,
acceptance and publication routes remain unavailable; a proposal's existence or
retrieval does not make it accepted, published or authorized for a business
effect. This change adds no business write permission.

Operational actions require an explicitly started runtime. Stopping while its
bridge is loading cancels that pending start. Closing the MCP input stops its
retained local runtimes. A current authenticated canonical successor can stop a
stale local service; the stop audit identifies that current operator. Other
mutations reject the stale service. A replacement start stays held until the
previous local drain settles. That local drain does not erase earlier unknown
slots, effects, processes or charged attempts, or prove physical closure.
Status reports the router's actual stopped or held state. Repeating `start`
on a held local router preserves that hold and reports `started: false`;
retaining its service record does not mean its scheduler is running.

## Checked adoption and remaining holds

This entry point opens only an existing layout-5 peer company. A read-only
preflight runs before a write connection is constructed, preserving a legacy
database's schema and journal mode. It cannot initialize a company, adopt legacy
state, register a qualified peer, fabricate native acceptance or bypass a
membership reconstruction/review.

The fixed launch recipe must already be part of the checked adoption's exact
native-reviewed environment. Its `peer_runtime` field has protocol
`peer-production-host-v1`, an exact `bridge_sha256`, and a closed `launch`
containing `profile_id`, `instruction_sources`, `base_instructions` and
`developer_instructions`. Missing or changed original source support stays
held. JSON agreement alone is not native qualification.

The existing model's `legacyOriginHold` also remains in force. Current
`adoptPeers` outputs retain `legacy_source_cut_sha256` and `legacy_backup`, so
those adoptions remain held for an original qualified transition before task
execution. A valid recipe does not clear this hold. The protected companion's
whole-domain physical closure remains unproved; these source changes do not
make a real native enrollment or task accepted or runnable by themselves.

Source tests use isolated fictional SQLite state and controlled transports.
They establish source routing and transaction behavior only. They grant no
fresh model invocation, retry, allowance, continuity acceptance or permission
to clear a notice. Real native qualification, exact-head QA, company owner
acceptance and integration remain separate requirements.
