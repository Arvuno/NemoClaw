<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
# Workspace Files

OpenClaw stores its personality, user context, and behavioral configuration in a set of Markdown files inside the sandbox.
These files live at `/sandbox/.openclaw/workspace/` and are collectively called **workspace files**.

## File Reference

| File | Purpose |
|---|---|
| `SOUL.md` | Defines the agent's persona, tone, and communication style. |
| `USER.md` | Stores information about the human the agent assists. |
| `IDENTITY.md` | Short identity card — name, language, emoji, creature type. |
| `AGENTS.md` | Behavioral rules, memory conventions, safety guidelines, and session workflow. |
| `MEMORY.md` | Curated long-term memory distilled from daily notes. |
| `memory/` | Directory of daily note files (`YYYY-MM-DD.md`) for session continuity. |

## Where They Live

All workspace files reside inside the sandbox filesystem:

```text
/sandbox/.openclaw/workspace/
├── AGENTS.md
├── IDENTITY.md
├── MEMORY.md
├── SOUL.md
├── USER.md
└── memory/
    ├── 2026-03-18.md
    └── 2026-03-19.md
```

## Multi-Agent Deployments

A single NemoClaw sandbox can host more than one OpenClaw agent.
When OpenClaw is configured with multiple named agents (e.g., a shared `main` agent
plus per-user agents for a Teams-integrated deployment), each agent gets its own
workspace directory alongside the default `workspace/`:

```text
/sandbox/.openclaw/
├── workspace/           # default agent (single-agent deployments)
├── workspace-main/      # named agent "main"
├── workspace-support/   # named agent "support"
└── workspace-ops/       # named agent "ops"
```

Each per-agent workspace contains the same Markdown file structure as the default
(`SOUL.md`, `USER.md`, `IDENTITY.md`, `AGENTS.md`, `MEMORY.md`, `memory/`).
Files are per-agent — changes in `workspace-main/AGENTS.md` are not visible to
`workspace-support/`.

Persistence and snapshots are handled automatically for per-agent workspaces:
the sandbox entrypoint provisions each `workspace-<name>/` directly under the
writable `.openclaw/` tree so state survives sandbox restart, and
`nemoclaw <name> snapshot create` discovers every `workspace-<name>/` directory
and includes it in the snapshot bundle alongside the default `workspace/`.

> **Note:** Files that operators typically want consistent across every agent workspace
> (`AGENTS.md`, shared skills, common templates) are not synced automatically.
> Each workspace is independent; changes in one don't propagate. Tracking
> shared-file tooling (shared mount, `workspaces list` command) in
> [#1260](https://github.com/NVIDIA/NemoClaw/issues/1260).

## Persistence Behavior

Workspace files live in the sandbox's persistent state volume, not in the container image.
This means they survive normal container restarts, but they are deleted when you destroy the sandbox.

### Preserved During Restart, Rebuild, and Upgrade

Sandbox restarts preserve workspace files because the persistent state volume outlives individual container restarts.

The `nemoclaw <name> rebuild` command and the sandbox upgrade flow also preserve workspace state.
Before replacing the container, NemoClaw snapshots the workspace state directories and restores them into the rebuilt sandbox.
If some files are unreadable, NemoClaw can continue with a partial backup when at least one requested state directory or file was saved.
It reports the skipped paths and restores only verified backup entries.
If no state can be backed up, it stops before replacing the sandbox.

### Deleted During Sandbox Destroy

Running `nemoclaw <name> destroy` deletes the sandbox and its persistent state volume.
Workspace files are removed from the sandbox unless you created a snapshot or backup first.

> **Warning:** Back up your workspace files before running `nemoclaw <name> destroy`.
> See Backup and Restore (use the `nemoclaw-user-manage-sandboxes` skill) for instructions.

## Editing Workspace Files

The agent reads these files at the start of every session.
You can edit them in two ways:

1. Ask your agent to update its persona, memory, or user context.
2. Use `nemoclaw <name> connect` to open a terminal inside the sandbox and edit files directly, or use `openshell sandbox upload` to push edited files from your host.

## Next Steps

- Set Up Task-Specific Sub-Agents (use the `nemoclaw-user-configure-inference` skill)
- Backup and Restore workspace files (use the `nemoclaw-user-manage-sandboxes` skill)
- Commands reference (use the `nemoclaw-user-reference` skill)
