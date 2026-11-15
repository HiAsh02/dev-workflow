# dev-workflow

Portable, evidence-driven software engineering workflows packaged as **Agent Skills** (`skills/dw-*/SKILL.md`) inside an **Agent Plugins v1.0.0** manifest (`plugin.json`).

Repository: `https://github.com/HiAsh02/dev-workflow` (Private)  
Current release status: `0.1.0` (`Beta / Partial` cross-host verification — see [COMPATIBILITY.md](./docs/COMPATIBILITY.md))

## Key Principles

- **Single source of truth**: 8 core skills (`dw-start`, `dw-design`, `dw-plan`, `dw-build`, `dw-debug`, `dw-review`, `dw-ship`, `dw-handoff`) + 7 internal playbooks under `skills/dw-start/references/playbooks/`.
- **Three workflow intensities**: `quick`, `standard` (default), and `rigorous`, decoupled from risk escalation so small high-risk changes still enforce strict verification.
- **Explicit authorization gates**: Read-only investigation makes zero edits; implementation does not imply commit/push; `dw-ship` separates `LOCAL_COMMIT`, `REMOTE_WRITE`, and `DESTRUCTIVE` approvals.
- **Zero runtime Node requirement for skill consumers**: Skills are standard Markdown. Node.js `>=22` is required only for maintainer validation/packaging (`npm run ...`) and the optional safe installer CLI (`bin/dev-workflow.mjs`, pure Node built-ins).

## Core Skills

| Skill | Responsibility |
|---|---|
| `dw-start` | Single entry router: classifies intent, selects one playbook, mode (`quick`/`standard`/`rigorous`), risk level, and next skill |
| `dw-design` | Clarifies requirements, alternatives, glossary/ADR, and secures design approval before high-impact edits |
| `dw-plan` | Produces `spec.md`, vertical task slices, acyclic dependencies (`blocked_by`), verification commands, and rollback notes |
| `dw-build` | Implements slices safely with dirty-worktree protection, adaptive TDD/verification, and single-agent fallback |
| `dw-debug` | Reproduces bugs, narrows scope, runs root-cause experiments, and applies authorized fixes with regression checks |
| `dw-review` | Dual-axis (`Spec` + `Standards`) review backed by file/line citations and rerun evidence |
| `dw-ship` | Enforces explicit authorization gates for commit, push, PR, merge, release, and remote verification |
| `dw-handoff` | Resumes across sessions/agents from verified disk ledger (`run-state.json`, `worklog.md`) and Git state |

## Host Compatibility (Verified Scope)

- **OpenAI Codex (`codex-cli 0.144.5`)**: `PASS` (8/8 dimensions) — project-local `.agents/skills/` install/conflict/uninstall, live 8-skill auto-discovery, and isolated read-only `codex exec` runs (`dw-start`, `$dw-debug`, `$dw-review`) verified.
- **Pi Coding Agent (`pi 1.5.2`)**: `PASS` (8/8 dimensions) — `.pi/skills/` install, local Pi package (`pi install <path> -l --approve` / `pi list --approve` / `pi remove`), live 8-skill auto-discovery, and isolated read-only `pi -p --no-session` runs (`dw-start`, `dw-debug`, `dw-review`) verified.
- **xAI Grok Build CLI (`grok 1.0.52`)**: `PARTIAL` — `grok plugin validate`, `grok plugin install --trust`, and `grok inspect --json` discovery of all 8 `dw-*` skills verified (note: untrusted project directories skip project skills until trusted); live LLM `invoke` is `BLOCKED` (`You are not authenticated.`). Distinct from `grok-bot`.
- **Google Antigravity (`44.9.1`)**: `PARTIAL` — passive version probe, `.agents/plugins/dev-workflow/` plugin install, and live Antigravity Language Server `GetAllPlugins` 8-skill discovery verified; live GUI/IDE `invoke` `NOT_TESTED`.

Full evidence matrices live in [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md). Cross-platform CI ([`.github/workflows/validate.yml`](./.github/workflows/validate.yml)) runs the full validation and packaging suite on `ubuntu-latest` and `windows-latest`.

## Installation (Private Repository Stage)

Clone your authorized copy of `HiAsh02/dev-workflow` locally, inspect the changes, and preview before installing into a target project:

```bash
# 1. Inspect local host binaries passively (read-only)
node bin/dev-workflow.mjs doctor --host all

# 2. Preview target file changes without writing to disk
node bin/dev-workflow.mjs install --host codex --target /path/to/your-project --dry-run

# 3. Install into project scope (default; never modifies user global configs)
node bin/dev-workflow.mjs install --host codex --target /path/to/your-project

# 4. List or cleanly uninstall unmodified owned files
node bin/dev-workflow.mjs list --target /path/to/your-project
node bin/dev-workflow.mjs uninstall --host codex --target /path/to/your-project
```

Installing into `--scope user` requires explicit `--confirm-user`. Native host commands verified in isolated sandboxes:
- Grok Build CLI: `grok plugin validate /path/to/dev-workflow` and `grok plugin install /path/to/dev-workflow --trust`
- Pi Agent: `pi install /path/to/dev-workflow -l`

## Maintainer Checks & Packaging

```bash
npm ci
npm run validate
npm test
npm run test:safety
npm run test:scenario
npm run pack
npm run verify:dist
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)
- [Compatibility Overview](./docs/COMPATIBILITY.md)
- [Security & Supply Chain](./docs/SECURITY.md)
- [Provenance & Upstream Attribution](./docs/PROVENANCE.md)
- [Release Checklist](./docs/release-checklist.md)
