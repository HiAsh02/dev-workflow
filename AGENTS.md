# AGENTS.md

Rules for coding agents working inside `HiAsh02/dev-workflow`:

1. **Read First**: Start from [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
2. **Single Source of Truth**: `skills/dw-*/SKILL.md` (and each skill's own `references/`) are the only editable source of workflow behavior. Do not fork or rewrite skill rules in host-specific directories or generated `dist/` artifacts.
3. **Authorization Boundaries**: Do not exceed the user's current request authorization. Code review does not authorize edits or commits; local edits do not authorize `git push`, PR creation, merges, releases, deployments, or deletions.
4. **Evidence Before Claims**: Never report tests, checks, builds, or host compatibility as passing without running them after your final edit and recording exact commands, exit codes, and observed outputs. Keep untested hosts labeled `NOT_TESTED` or `BLOCKED`.
5. **Workspace & Supply-Chain Safety**: Never overwrite or clean a user's dirty worktree, never modify global agent configs (`~/.codex`, `~/.gemini`, `~/.grok`, `~/.pi`, `~/.claude`) without explicit confirmation, and never execute untrusted downloaded scripts automatically.
6. **Keep Contracts & Docs Synced**: When changing behavior, schemas, permissions, or manifests, update the corresponding tests, `CHANGELOG.md`, and docs.
