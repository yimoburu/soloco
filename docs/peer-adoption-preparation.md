# Legacy adoption preparation

`peer-adoption-runtime.mjs` supplies a bounded, authenticated read-only entry for
an existing normalized-v4 company. It is separate from the normal layout-5 peer
runtime. The public `company_peer_adoption` tool registers its exact exported
schema and checks the existing startup-hook binding before entering the helper.
All four actions are read-only preparation, including `plan`.

The actions are `readiness`, `plan`, `inspect` and `read`. Every action checks the
exact current canonical owner host, chat identity and epoch before reading the
full current inventory. Model inputs cannot select code, a provider, native
identity, environment callback or permission issuer. There is no apply, start,
resume or migration action. The entry opens SQLite read-only and uses one read
snapshot; it does not open a writable `Store`, initialize tables, create a backup
or call the unpublished v1 `adoptPeers`. Ordinary SQLite reader sidecar behavior
is not claimed as a general no-filesystem-I/O guarantee.

Public capacity holds preserve the helper's typed code and exact bounded
retrieval pointer through MCP serialization. No page or range is delivered by a
hold, and it never becomes a mutation receipt. Follow the pointer through
`company_peer_adoption`; exact plan reads also repeat the original preparation
instruction. Registration adds no apply or execution route.

## Exact bounded evidence

Readiness reports the exact complete current-entry inventory hash, source and
issue counts, original owner, preparation limits and observed execution holds.
The cut includes every current normalized entry, ordering, encoding and unknown
extension. It does not imply complete archived-event/native provenance or
semantic qualification. Preparation admits at most 10,000 current entries,
64 MiB of current source plus classification snapshot dependencies, 16 MiB per
value and a 4 MiB inventory. Canonical bootstrap-home intake runs on the same
read-only connection and transaction. Its additional preparation admission is
10,000 archive values / 64 MiB, and 10,000 interval events / 64 MiB. These are materialization admission bounds, not
measured whole-process memory or physical-I/O limits. Failure or over-capacity
never returns a clean prefix.

`inspect` pages `sources` or `issues`; pages contain at most 100 rows and their
complete encoded MCP text envelope is at most 24,576 UTF-8 bytes. Pages shrink
inside the same snapshot while retaining exact offsets and continuations. A
single oversized item returns a typed read-only Hold with an exact bounded source
retrieval pointer; it never becomes an empty or falsely complete page. Source pages omit raw storage keys and supply stable
hash locators. A cursor binds the entire current preparation basis. A tail page
with `complete: true` is pagination metadata, not proof that a native reviewer
received earlier pages or understood their meaning.

`read` requires the exact basis and source hash. Source reads return original
stored JSON; journal descriptors remain descriptors and their child entries are
separate inventory members. Plan/projection reads return canonical JSON. Ranges
default to and admit at most 4,096 UTF-16 source units and preserve surrogate-pair boundaries.
Any current source, order, encoding, owner or pin change invalidates prior basis
handles. Follow all continuations for the selected complete value.

`plan` also requires an exact preparation instruction and future expiry within
seven days. Repeat that same instruction and expiry when reading the exact plan.
The expiry bounds preparation; it renews no execution permission. The plan is an
unaccepted current-source projection. Saving it or adding its review changes the
current inventory; the future original-provenance bridge must explicitly handle
those exact control producers rather than accepting arbitrary cut exclusions.

## Original obligations remain held

The plan also includes the exact company's pinned team bundle with protocol
`peer-pinned-team-bundle-v1`, selection `preserve-pinned-team`, plugin version,
original governance and hash, exact `roles_json`, CoS instructions and original
team hash. The source-cut/owner/runtime lineage and four-part content manifest
refer to actual original immutable values. The manifest describes instruction
content, not an inferred historical package/binary manifest. Missing bodies or
mismatched original hashes Hold; no installed-team fallback or implicit adoption
of a newer candidate exists. `roles_json` preserves legacy JSON property order so
the old team hash survives the peer ledger's canonical object serialization.

Future checked apply must persist `control/pinned-team` as
`{protocol:'peer-pinned-team-record-v1',bundle,bundle_sha256}` and bind its exact
`{family:'control',id:'pinned-team',revision,sha256}` from
`control/company.value.pinned_team`. Company control retains the matching original
team/governance hashes and legacy source-cut hash. This cut defines and tests
that record protocol but does not perform adoption or persist it in a company.

`inspectPeerPinnedTeamFrom(tx,{company_id})` validates these same current canonical
bindings inside the caller's existing owning snapshot, resolves each original
immutable pin, and returns the complete exact bundle, its hash, parsed roles and
source handles without writes or a nested transaction. Owner reconstruction can
bind and recheck that evidence. `inspectPeerPinnedTeam(ledger)` returns compact
headers; `readPeerPinnedTeam(ledger,{part,reference,sha256,offset,length})` serves
bounded original JSON values for `plugin_version`, `governance`, `roles` and
`cos_instructions` after cold restart. Each read rechecks the canonical bundle and
reference. Caller authentication and eventual public hook/open registration are
separate integration work; these helpers issue no ownership or execution grant.
`readPeerPinnedTeamFrom(tx,args,{company_id})` applies the identical validation and
range logic inside an already owning snapshot, so a transport can authenticate
and read atomically. Internal source headers deliberately advertise no presumed
public route for a restricted pending successor. The transport must add only its
actual supported retrieval handle. Full-bundle inspection is internal evidence;
compact headers and all exact range responses enforce the 24 KiB encoded budget.

Readiness and plan replies enforce the same encoded budget and return a typed
read-only Hold with exact retrieval guidance if exceeded. No over-budget read is
converted into a mutation receipt. Encoding admission measures the complete
`{content:[{type:'text',text:JSON.stringify(value)}]}` envelope, including escaping.

Existing `reviewedContext`/classification validators derive the legacy frontier.
Missing, stale or invalid classifications Hold. Unclassified sources remain
compulsory with unknown/global applicability. This frontier is neither a new
summary nor an ordinary peer-home proposal/review seal. Archived originals stay
retrievable and original authority is not translated into a new grant.

Readiness explicitly reports active jobs and uncertain terminal invocations,
including jobs without declared resources. A legacy release flag or a valid
shaped model-process journal describes original child closure only; original
producer provenance and whole-domain closure remain distinct. No usage unit is
converted, refunded or reset. Notices, expired/spent grants, failures and unknown
outcomes remain original data and constraints.

An uncertain original effect does not automatically prohibit every unrelated
future preparation task. A future independently reviewed origin transition can
carry each UNKNOWN as a typed occupied reservation, retain its exact original
grant/expiry/attempt obligations, and permit genuinely disjoint newly authorized
work within remaining capacity. Unknown applicability defaults global. Unknown
capacity or overlapping authority holds the affected admission; no such mapping,
capacity translation, release or disjoint-work issuer exists in this source cut.

At this cut, the fixed original adoption environment capability, independently
reviewed original-obligation transition and native-review provenance bridge are
missing software producers. They are not merely unrun qualifications. The
internal v2 apply preflight recomputes the exact plan and always Holds on these
missing producers before any write or backup. It cannot mint an origin seal from
caller booleans or fall back to v1 migration. The existing model origin gate is
unchanged.

A later source implementation must bind the genuine drain/environment producer,
canonical independent native review, full exact source/proof/current-scope and
expiry, then implement an obligation-preserving owning-transaction origin seal
and apply. That transition must preserve markers, verified backup, archive
fences, retired legacy authority and explicit paused state. Changed or unknown
proof remains held. Actual company adoption requires its own current authority,
independent review and genuine qualification; temporary SQLite tests prove none
of those facts.
