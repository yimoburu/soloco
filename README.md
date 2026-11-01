# AI-operated startup

A reusable system for a human founder to turn an idea into an early-stage startup with AI agents filling conventional startup roles.

The team progresses toward **public launch** or **funding readiness** through explicit authority, short shared specs, independent review, and evidence-based gates.

This repository contains the design and its review history. It does not contain an implemented agent runtime.

## Start here

- [Latest proposal: v0.3 draft](specs/v0.3-draft.md)
- [Agreed baseline: v0.1](specs/v0.1.md)
- [Original requirements](docs/original-brief.md)

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

## Reviewing the current draft

Read `specs/v0.3-draft.md` against `docs/original-brief.md`. Report material contradictions, missing authority, unclear gate conditions, and unnecessary complexity. For each finding, give a concrete failure scenario and the smallest correction. Separate required fixes from preferences. Keep review findings separate from the versioned spec.

## Maintaining the design

Preserve earlier versions and review provenance. Make substantive revisions in a new version, record which review findings were accepted or modified, and label proposals as drafts until explicitly adopted. Add rules only when they change a meaningful decision or behavior.
