# dev-workflow

Portable, evidence-driven software engineering workflows packaged as **Agent Skills** (`skills/dw-*/SKILL.md`) inside an **Agent Plugins v1.0.0** manifest (`plugin.json`).

Repository: `https://github.com/HiAsh02/dev-workflow` (Private)  
Current release status: `0.1.0` (`Beta / Partial` cross-host verification — see [COMPATIBILITY.md](./docs/COMPATIBILITY.md))  
Languages: English (`en`, canonical `skills/`) and Simplified Chinese (`zh-CN`, mirrored `locales/zh-CN/skills/` + [README.zh-CN.md](./README.zh-CN.md))

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

- **OpenAI Codex (`codex-cli 0.144.5`)**: `PASS` (8/8 lifecycle dimensions) — project-local `.agents/skills/` install/adopt/conflict/shared-root uninstall, live 8-skill auto-discovery, and 6/8 skills live-invoked across isolated behavioral evals (`dw-start`, `dw-build`, `dw-debug`, `dw-review`, `dw-handoff`, `dw-ship`; `dw-design`/`dw-plan` discovered & static-checked only).
- **Pi Coding Agent (`pi 1.5.2`)**: `PASS` (8/8 lifecycle dimensions) — `.pi/skills/` install, local Pi package (`pi install <path> -l --approve` / `pi list --approve` / `pi remove`), live 8-skill auto-discovery, and 6/8 skills live-invoked across isolated behavioral evals (`dw-start`, `dw-build`, `dw-debug`, `dw-review`, `dw-handoff`, `dw-ship`; `dw-design`/`dw-plan` discovered & static-checked only).
- **xAI Grok Build CLI (`grok 1.0.52`)**: `PARTIAL` — `grok plugin validate`, `grok plugin install --trust`, and `grok inspect --json` discovery of all 8 `dw-*` skills verified (note: untrusted project directories skip project skills until trusted); live LLM `invoke` is `BLOCKED` (`You are not authenticated.`). Distinct from `grok-bot`.
- **Google Antigravity (`44.9.1`)**: `PARTIAL` — passive version probe, `.agents/plugins/dev-workflow/` plugin install, and live Antigravity Language Server `GetAllPlugins` 8-skill discovery verified; live GUI/IDE `invoke` `NOT_TESTED`.

Full evidence matrices live in [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md). Cross-platform CI ([`.github/workflows/validate.yml`](./.github/workflows/validate.yml)) runs the full validation and packaging suite on `ubuntu-latest` and `windows-latest`.

## Installation (Private Repository Stage)

Clone your authorized copy of `HiAsh02/dev-workflow` locally, inspect the changes, and preview before installing into a target project:

```bash
# 1. Inspect local host binaries (never edits target files; runs `--version` for codex/grok/pi)
node bin/dev-workflow.mjs doctor --host all

# 2. Preview target file changes without writing to disk (explicit `--language <en|zh-CN>` required in non-TTY; interactive TTY prompts 1/2)
node bin/dev-workflow.mjs install --host codex --language en --target /path/to/your-project --dry-run

# 3. Install or update into project scope (no-clobber default; `update` preserves the installed language unless `--language` is changed explicitly)
node bin/dev-workflow.mjs install --host codex --language en --target /path/to/your-project
node bin/dev-workflow.mjs update --host codex --target /path/to/your-project

# 4. List (shows active `language`), recover interrupted transactions, or safely uninstall unmodified owned files
node bin/dev-workflow.mjs list --target /path/to/your-project
node bin/dev-workflow.mjs recover --target /path/to/your-project --dry-run
node bin/dev-workflow.mjs uninstall --host codex --target /path/to/your-project
```

**Bilingual & Hardening Guarantees:**
- **Single enabled language per target**: Installing `en` or `zh-CN` populates the host's canonical `skills/dw-*/SKILL.md` path without duplicate skill directories. Cross-host shared targets (e.g., `codex` + `grok-build` on `.agents/skills/`) refuse mixing languages (`CONFLICT` even with `--upgrade-shared`); uninstall existing consumers before reinstalling another language.
- **Plan-to-Apply CAS (`PLAN_STALE`)**: `apply` re-verifies primary and sibling ownership ledger snapshots inside `.apply.lock` before creating any WAL journal or writing target files.
- **Fail-closed WAL recovery & partial-uninstall reporting**: WAL v2 records transaction ID, `language`, `package_digest`, verified `source_manifest` (for custom/legacy sources), and before/after SHA-256 checksums. Ambiguous `pending` mutations, post-crash user edits, unoriginated journals, or WAL/ledger language mismatches refuse automatic overwrite and retain backups/journal for manual inspection. Legacy ledgers without `source_manifest` report `partial_uninstall`, `remaining_owned_files`, and `manual_remediation`. Do not pass `--force-unlock` while a known writer is active.

Installing into `--scope user` requires explicit `--confirm-user`. Preexisting byte-identical unowned files are skipped for ownership (`preexisting_identical_unowned`) and preserved on `uninstall` unless `--adopt` is passed explicitly; shared directories retain files still referenced by sibling install ledgers during single-host uninstall. Native host commands verified in isolated sandboxes:
- Grok Build CLI: `grok plugin validate /path/to/dev-workflow` (or `dist/dev-workflow-<version>-<en|zh-CN>`) and `grok plugin install /path/to/bundle --trust`
- Pi Agent: `pi install /path/to/dev-workflow -l` reads root `package.json`'s `pi.skills` (`./skills`, English). Use `node bin/dev-workflow.mjs install --host pi --language zh-CN --target <repo>` to install Simplified Chinese into `.pi/skills/`.

## Maintainer Checks & Packaging

Tests are organized by verification tier (`contract-static`, `installer-integration`, and `agent-behavior-eval`):

```bash
npm ci
npm run validate          # contract-static: manifests, schemas, skills, links, fixed-pattern secret guard
npm test                  # contract-static + installer-integration (contract + install + ownership safety)
npm run test:safety       # installer-integration + recovery/permission/containment boundaries
npm run test:scenario     # contract-static: SC-01..SC-12 specs & fixture smoke tests
npm run test:eval         # agent-behavior-eval (offline deterministic sandbox & REG-EVAL-01 harness)
npm run pack              # build deterministic en & zh-CN bundles + ZIPs in dist/
npm run verify:dist       # verify extracted trees, ZIP entries, skills, and SHA-256 sync for en & zh-CN
```

For interactive live LLM behavioral evals (`codex`, `pi`), maintainers can run `npm run eval:live` (`scripts/run-live-evals.mjs`). Note that `validate`'s `scanSensitiveArtifacts` check is a deterministic regex/size pre-flight guard rather than semantic DLP; see [Security & Supply Chain](./docs/SECURITY.md) for the complete trust model.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Compatibility Overview](./docs/COMPATIBILITY.md)
- [Security & Supply Chain](./docs/SECURITY.md)
- [Provenance & Upstream Attribution](./docs/PROVENANCE.md)
- [Release Checklist](./docs/release-checklist.md)
