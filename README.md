# AI-operated startup

A reusable system for a human founder to turn an idea into an early-stage startup with AI agents filling conventional startup roles.

The team progresses toward **public launch** or **funding readiness** through explicit authority, short shared specs, independent review, and evidence-based gates.

The intended founder experience is **one initiation in an existing Codex or Claude Code conversation**, followed by automatic handoffs between standalone role sessions. That conversation stays the founder's interface. Managed platform selection and mixed-platform teams are future requirements. This repository currently contains the evolving design, review history, and workspace-generator prototype; automatic coordination remains to be implemented.

## Start here

- [Latest proposal: v0.3 draft](specs/v0.3-draft.md)
- [Agreed baseline: v0.1](specs/v0.1.md)
- [Original requirements](docs/original-brief.md)
- [One founder conversation: interaction requirement](docs/founder-interface.md)
- [Founder user stories and immediate scope](docs/user-stories.md)
- [Generate a Codex or Claude Code workspace](docs/converter.md)

v0.2 and v0.3 remain drafts. Their inclusion does not promote them to the agreed baseline.

## Core principles

- Roles earn seats through distinct judgment, an owned spec, and a legitimate blocking right.
- Agents own execution; the founder handles consequential reserved decisions.
- A shared spec board carries authority. Conversation alone does not.
- Independent acceptance and evidence determine progress.
- Decisions are checked against outcomes, and agents remain replaceable.

## Versions and reviews

| Version | Status | Review and response |
|---|---|---|
| [v0.1](specs/v0.1.md) | Agreed design baseline | [Claude review](reviews/claude-v0.1.md) · [Response in v0.2](reviews/v0.2-disposition.md) |
| [v0.2](specs/v0.2-draft.md) | Draft | [Claude review](reviews/claude-v0.2.md) · [Response in v0.3](reviews/v0.3-disposition.md) |
| [v0.3](specs/v0.3-draft.md) | Latest draft | Review pending |

The [original review brief](reviews/review-brief-v0.1.md) records the scope of the first review.

## Generate a team workspace

Edit [the venture configuration](examples/venture.json), then run:

```sh
python3 tools/materialize.py --config examples/venture.json --output /tmp/my-venture --target both
```

The converter creates shared specs and board records, project instructions for the selected platforms, and one startup brief per role. Developers can test those briefs in separate Codex or Claude Code sessions. That manual workflow does not yet provide the intended founder experience: a runner must route accepted handoffs and manage sessions automatically. See [the interaction requirement and acceptance checks](docs/founder-interface.md).

The default pins the agreed v0.1 spec. Select a draft deliberately with `--spec specs/v0.3-draft.md`. Generation grants no venture-execution permission and refuses to overwrite an existing workspace. See [converter usage and limitations](docs/converter.md).

Run the focused checks with `python3 -m unittest discover -s tests -v`.

## Reviewing the current draft

Read `specs/v0.3-draft.md` against `docs/original-brief.md`. Report material contradictions, missing authority, unclear gate conditions, and unnecessary complexity. For each finding, give a concrete failure scenario and the smallest correction. Separate required fixes from preferences. Keep review findings separate from the versioned spec.

## Maintaining the design

Preserve earlier versions and review provenance. Make substantive revisions in a new version, record which review findings were accepted or modified, and label proposals as drafts until explicitly adopted. Add rules only when they change a meaningful decision or behavior.
