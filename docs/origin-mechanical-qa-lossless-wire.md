# Lossless mechanical review context

New pre-quarantine mechanical review preparations use packet protocol
`peer-origin-mechanical-qa-packet-v2` and context protocol
`peer-origin-mechanical-qa-lossless-context-v1`. This changes DATA representation;
it supplies no founder permission, execution inventory, native acceptance, new
allowance, retry or resolution of an old UNKNOWN.

The ordinary assignment builder retains its existing behavior, JSON property
order, hashes and 200000-character overflow check. A fixed mechanical builder
shares its private pack composition and encodes exactly one existing duplicate:
the selected original plan record’s `content`, which must equal the existing
`canonical(record.origin_quarantine_plan)`. There are no caller-selected paths,
aliases, exclusions or budget flags. The complete structured plan and every
other original assignment field remain literal, including unknown semantic
fields, complete pinned team bodies, original owner/actor, notices, old expired
grants and original record/source/archive representations. Existing references
are preserved as they were; the codec does not claim unqualified archived raw
values were inline or semantically accepted.

The wire has closed keys, in this order:

```text
protocol: peer-origin-mechanical-qa-lossless-context-v1
raw_assignment: { characters, utf8_bytes, sha256 }
target_plan: { id, revision, record_sha256, plan_sha256, cut_sha256 }
body: original assignment with the single fixed marker
```

The 69-byte marker is exactly:

```json
{"protocol":"peer-origin-quarantine-plan-canonical-content-alias-v1"}
```

It always means the existing canonical JSON rendering of that same record’s
inline structured plan. Exactly one selected target must exist. The original
record ref uses SHA-256 of its original `JSON.stringify(record)` bytes; the plan
hash uses `peerDigest(plan)`. These conventions remain distinct.

The persisted v2 context has exact keys
`protocol,text,sha256,utf8_bytes,characters,raw_assignment,target_plan`. Its
`sha256` commits the delivered wire text; `raw_assignment.sha256` separately
commits the original raw assignment. The wire SHA is outside its own text.
The inverse overwrites the original `content` property slot with the existing
canonical plan string, then uses `JSON.stringify` and proves the complete raw
assignment’s exact SHA, UTF-8 bytes and UTF-16 character count. It never
canonicalizes the whole assignment or reorders its properties. Creation checks
direct equality to the original raw text too. No matching DATA becomes a
capability.

Both raw/wire reconstruction and all original producer, source-prefix,
owner/epoch, purpose, grant, expiry, private reservation, global execution
inventory and native accounting checks remain required. Packet reconstruction
uses the SAME original pre-packet storage prefix. Administrative journal
validation recognizes each explicit packet version and rechecks its original
context. The original grant/admission schemas retain exact immutable packet refs
and the delivered context SHA; an old grant/job is never rehashed, upgraded,
regranted or reset.

New preparations always choose v2. Existing packet-v1 retains its original
closed context `{text,sha256,utf8_bytes}`, original job/context hash and exact
original prompt frame. Replay returns that original packet or Holds; it does
not convert it. Unknown or mixed version shapes Hold. Historical packet-v1
handles and readback keep their v1 shape. V2 handles/readback identify their new
version and expose separate raw commitments; bounded range reads return the
exact delivered wire, not an expanded larger raw prompt. Historical reads assert
original custody only, with current eligibility and execution authority
explicitly unasserted.

The internal raw context has a 64 MiB safety bound. The original source
namespace’s 64 MiB budget is unchanged. The delivered context stays within
200000 characters and the selected UTF-8 limit, whose maximum is 200000 bytes.
The exact fixed full prompt, including instruction, original task, explicit wire
definition and framing, must also fit those unchanged bounds. It is checked
before a new packet is stored, on positive reconstruction before grant/queue,
and again by the worker before send. No guessed framing allowance or metadata
estimate substitutes for counting the actual prompt. The model receives the
smaller explicit representation; the larger raw duplicate is not expanded back
into its prompt. Larger unique contexts still Hold before packet/grant/charge.

Pure/source tests establish exact reconstruction and measured fictional fit.
They do not establish that a native model correctly interprets the new format,
that an actual company fits, or that native/host capacity is sufficient. Native
acceptance and actual owner authorization remain separate. The genuine default
execution inventory producer remains required; this codec does not fill or
bypass a missing producer.
