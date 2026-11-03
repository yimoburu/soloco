---
name: setup
description: Check the SoloCo plugin's local runtime and selected Codex or Claude CLI after installation, without creating a company or modifying existing projects.
---

Call `company_doctor`. Report whether the SoloCo tools and selected host CLI are available, and the preparation/review-only scope of this release. Do not read credentials. A missing CLI or sign-in requires the host's normal setup, not copied secrets or bypassed permissions.

The bundled launcher uses an existing compatible Node runtime or downloads a checksum-pinned private runtime on macOS/Linux. No Python, npm packages, or manual config files are needed. If SoloCo tools fail to load, report the actual failure; do not claim setup succeeded.

Explain that startup hooks must be enabled/trusted in the host. After setup, the founder creates a project, attaches a company folder, and describes the idea in a chat. Do not initialize a company during installation. Native specialist sessions are resumable, but automatic sidebar placement and background founder notifications are not promised.
