---
name: setup
description: Check the SoloCo plugin's local runtime and selected Codex or Claude CLI after installation, and diagnose or migrate stale Codex startup hooks without creating a company.
---

Call `company_doctor`; include the attached `root` and the actual host `session_id` when available (never invent one). Report whether the SoloCo tools and selected host CLI are available. Report file-only prototype support separately from local-development support. The latter edits a retained copy of selected files and runs constrained Node tests only when its OS sandbox is available; it never integrates changes into the original project or performs external business actions. Unsupported isolation is a capability blocker, not a request for more approval. Installed capability does not adopt it for an existing company: `company_status` reports pinned-team/governance eligibility. Do not read credentials. A missing CLI or sign-in requires the host's normal setup, not copied secrets or bypassed permissions.

The bundled launcher uses an existing compatible Node runtime or downloads a checksum-pinned private runtime on macOS/Linux. No Python, npm packages, or manual config files are needed. If SoloCo tools fail to load, report the actual failure; do not claim setup succeeded.

Explain that startup hooks must be enabled/trusted in the host. After setup, the founder creates a project, attaches a company folder, and describes the idea in a chat. Do not initialize a company during installation. Native specialist sessions are resumable, but automatic sidebar placement and background founder notifications are not promised.

For a Codex hook failure, `company_hooks` with `action: inspect` reports discovery, trust, stale commands, expected data directory and binding evidence independently. Missing discovery is not a trust problem. The supported Codex package uses `.codex-plugin/plugin.json` and a generated compatibility MCP launcher; do not create replacement project hooks pointing into a versioned cache. Live-chat overrides may differ from the installed-configuration probe; check the host Hooks UI if they disagree.

If recognized old Company/SoloCo project hooks remain, show the removal preview. When the founder has requested the repair, call `company_hooks` with `action: migrate`, the inspected `expected_file_sha256`, and their `source_instruction`. It backs up the file and removes only recognized launchers after checking the replacement plugin hooks are discovered. Unrelated hooks and `.company/` records stay intact. Unknown custom commands or a second enabled legacy plugin require resolution before migration. Do not copy bindings, run the hook manually to bypass host trust, or mark hooks trusted.

After migration/reinstallation, the founder reviews and trusts the two SoloCo plugin hooks through the host UI, reopens the chat and sends a prompt. Call `company_doctor` with the actual chat ID again; a current-runtime binding in the MCP data directory is the lifecycle check. Package discovery alone does not prove invocation. Updating the package does not adopt new team rules or change company ownership.
