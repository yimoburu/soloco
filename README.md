# AI-operated startup

Turn an idea into an early-stage company through **one founder conversation**. A Chief of Staff coordinates specialist AI agents, each in its own standalone session. Shared company records preserve decisions, limits, and unfinished work when agents or the whole team change.

## Intended experience

Install the Company plugin once in Codex or Claude Code, then:

1. Create a project.
2. Attach a company folder.
3. Open a chat and describe your idea.

The Chief of Staff asks focused questions, brings in roles as needed, and presents a reviewed first experiment for authorization. You provide direction and reserved decisions; the team handles coordination. Use one active environment at a time. Switching apps resumes the same company from its records.

## Available today

**This is a design and workspace-generator prototype. The plugin and automatic team runtime are not implemented.** There is no working plugin installation command yet; attaching a folder alone does not start a company.

- [SPEC.md](SPEC.md) — the single current design: constitution, founder experience, roles, collaboration, evidence, and continuity.
- [Developer guide](docs/converter.md) — try the generator, understand its limits, and see what remains to build.

The planned distribution is one Company plugin in a small GitHub marketplace catalog. Installation handles dependencies and checks readiness; founders will not run Python or configure roles.

## Changes and review

Keep only rules that change a decision, behavior, or successor's action. Update the spec and affected generator guidance together; use concrete failure scenarios to review changes. Existing companies retain their pinned rules until explicit adoption.

Superseded designs, the original brief, and Claude reviews remain in the [archived snapshot](https://github.com/yimoburu/ai-operated-startup/tree/ee3f302f47e82539ca0a40e0268a1e762c47929a/history). They are provenance, not additional current requirements.
