# Changelog

All notable changes to `dev-workflow` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-15

### Added

- Agent Plugins v1.0.0 compliant `plugin.json` manifest (`name: "dev-workflow"`).
- Eight core Agent Skills under `skills/dw-*`: `dw-start`, `dw-design`, `dw-plan`, `dw-build`, `dw-debug`, `dw-review`, `dw-ship`, and `dw-handoff`.
- Seven internal routing playbooks (`investigate`, `feature`, `bug-fix`, `refactor`, `review`, `ship`, `resume`) under `skills/dw-start/references/playbooks/`.
- Project templates (`design.md`, `spec.md`, `task.md`, `worklog.md`, `run-state.json`, `review.md`, `compatibility-report.md`).
- Locked JSON Schemas (`schemas/plugin-v1.0.0.schema.json`, `schemas/run-state.schema.json`).
- Offline validation, deterministic packaging, source-sync verification, task-ledger state handling, host capability probing, and safe non-destructive CLI (`bin/dev-workflow.mjs`).
- Contract, security, install, offline behavioral-eval harness (`tests/eval/`), live eval runner (`scripts/run-live-evals.mjs`), and GitHub Actions CI workflow (`.github/workflows/validate.yml`).

### Fixed & Hardened

- **Ownership & Shared-Root Protection**: Preexisting identical unowned files now require explicit `--adopt`; sibling host installations sharing directories (e.g., `codex` and `grok-build` on `.agents/skills/`) refuse silent cross-host overwrites unless `--upgrade-shared` is supplied, block `v2 -> v1` silent downgrades, track `package_digest`, and retain shared files across ledgers on uninstall (`--mode auto` also aligns uninstall/update selection with installed artifacts).
- **Installer Atomicity, TOCTOU, Crash Recovery & Containment**: Added PID-bearing `.apply.lock` (`withFileLock` / `atomicWriteExclusive`), live source `VERSION` + file SHA-256 and target `expected_before` verification inside the lock, WAL `.txn-journal.json` undo logging across target files and primary/sibling ledgers, post-commit cleanup separation, `dev-workflow recover [--dry-run|--apply] [--force-unlock]`, and canonical package-manifest + provenance whitelisting on `uninstall`.
- **Recovery & Eval Harness Integrity**: Enforced strict `inspectTaskRecovery` evidence verification (`evidence_hashes`, non-null `currentHead === verified_head`, `worktree_fingerprint`, and passing `exit_code === 0` `check_ids` with migration hints), and extended `snapshotWorkspaceState`/`diffWorkspaceState` (`zeroMutations`) to catch Git index (`git add`/`git reset`), `git remote`, and local Git config mutations.
- **ZIP Payload & Eval Separation**: `npm run verify:dist` now parses central-directory headers, decompresses ZIP entries, and verifies SHA-256 digests against source files (`lib/zip.mjs` `readZipEntries`); test tiers clearly separate `contract-static`, `installer-integration`, and `agent-behavior-eval`.
