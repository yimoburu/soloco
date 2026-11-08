# Specialist session names

SoloCo names specialist native sessions using the current role display name and a stable instance suffix, for example `SoloCo — Software Engineer · 2e9b513c-921aed3a`. The suffix distinguishes separate instances of the same role; titles do not replace native identities or establish authority.

Worker assignments supply the current pinned role name on fresh and resumed calls. Ordinary, durable, development, prototype, qualification and handover-review jobs share that worker path. Upgrade rehearsal sessions use `Upgrade CoS` and `Upgrade QA` so the rehearsal does not imply active company ownership. Existing founder-facing chats can be renamed through the host's chat tools.

## Host behavior

- Codex: after observing a matching native `thread.started` identity, launch a bounded metadata-only app-server request to `thread/name/set`, then verify the exact native/name using `thread/read` without turns. An unexpected resumed identity is never renamed. Naming is asynchronous and does not delay the model result or acceptance.
- Claude Code: check whether the installed CLI advertises `--name`, then apply the flag on fresh and resumed launches. Unsupported clients keep their existing execution path. The runtime records this as `requested` with `launch_argv_only` verification; the launch flag alone is not proof that the host retained the name.

Names and diagnostics stay outside canonical jobs, sessions and model evidence. The private per-instance session directory receives a bounded `session-name.json` sidecar. A naming error never retries model work, rotates a session, changes limits or grants authority. Synchronous capability checks are followed by a deadline check before any provider process may start.

## Validation

The naming tests cover title bounds and distinct instances, metadata RPC success/errors/readback mismatch/timeout, unsupported Claude clients, fresh/resumed launches, unexpected native IDs, changing role names, cosmetic failures and deadline fencing. Worker tests on both hosts verify actual role/instance options and absence of naming fields from canonical evidence.

The [retained native observations](../evals/session-naming-20261107/) use fictional probe sessions. Claude fresh/resume calls both retained their requested names, verified by reading only those probe transcripts' title metadata. Codex fresh naming was verified during the probe; after its second independent CLI readback timed out, a later read-only Codex app check and the runtime's verified sidecar confirmed the resumed title. The original failed probe status is preserved; no provider call was repeated to obtain a pass. Published observations contain display metadata only; raw provider diagnostics remain local.

Run an explicit native check with a new absolute report path:

```sh
node tools/session-naming-smoke.mjs --run-native codex /tmp/soloco-codex-names.json
node tools/session-naming-smoke.mjs --run-native claude /tmp/soloco-claude-names.json
```

The retained native probes exercised runtime revision `3e5c5d0`. A subsequent caller-only change explicitly forwards the finite upgrade deadline into the adapter guard; the selected upgrade lifecycle test checks that binding and both role titles across fresh, retrieval, replay and synthesis calls. The naming adapter and metadata backend used by the probes are unchanged.

Each check uses two short calls from the existing signed-in host allowance and a disposable fictional working folder. Display-name verification is distinct from model competence, company acceptance and installed release adoption.
