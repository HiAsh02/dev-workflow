# Changelog

All notable changes to `dev-workflow` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] (bilingual `en`/`zh-CN`, installer hardening, and distribution improvements; not tagged/released)

### Added

- **Bilingual (`en` / `zh-CN`) Support**:
  - Mirrored all 8 `SKILL.md` files, 7 playbooks, `routing.md`, and 7 templates under `locales/zh-CN/`, plus `README.zh-CN.md` (with English canonical `skills/` and `templates/` left unmodified).
  - Locale-aware skill validation in `lib/skills.mjs` (`SUPPORTED_LOCALES`, `REQUIRED_SKILL_SECTIONS_BY_LOCALE`) and `scripts/validate.mjs` (relative parity, relative links, template parity, and bilingual `run-state.json` schema validation).
  - Language selection in `bin/dev-workflow.mjs` (`--language en|zh-CN`, TTY bilingual prompt, fail-fast in non-TTY, automatic language preservation on `update`, `language` column in `list`), explicit `language_change` previews/switching honoring no-clobber, and cross-host shared-directory language conflict enforcement (`CONFLICT` even with `--upgrade-shared`).
  - Dual-language deterministic packaging and ZIP verification (`dist/dev-workflow-<version>-en.zip` and `dist/dev-workflow-<version>-zh-CN.zip`, each mapping the selected locale into `skills/`).
  - Regression suites `tests/install/r4-regressions.test.mjs` (`R4-REG-*`) and `tests/install/bilingual.test.mjs` (`L-01`..`L-10`).

### Fixed

- **R4-01 (Owner-Ledger CAS / `PLAN_STALE`)**: `buildInstallPlan` and `buildUninstallPlan` now snapshot primary and relevant sibling ownership ledgers (`ownership_preconditions`); `applyInstallPlan` and `applyUninstallPlan` re-verify them inside `.apply.lock` before starting a WAL transaction and fail with `PLAN_STALE` on any concurrent owner drift or sibling join. `updateSiblingSharedLedgers` also fails closed on uncoordinated sibling mutations or cross-language mismatches.
- **R4-02 & R4-04 (Historical / Custom Source Manifests & Partial Uninstall)**: Ownership ledgers and WAL v2 journals persist digest-verified `source_manifest` (restricted to `PLUGIN_TOP_FILES`/`README.zh-CN.md` and `dw-*` paths), `prior_source_manifest`, and `language`. Crash recovery (`validateRecoveryJournal`) and `uninstall` validate historical custom/prior files without trusting unverified `ledger.files` entries (`R2-REG-LEDGER-SPOOF-01`), while legacy ledgers lacking `source_manifest` fail closed and explicitly report `partial_uninstall`, `remaining_owned_files`, and `manual_remediation`.
- **R4-03 (WAL Origin & Workspace Trust Boundary)**: Uncommitted journals (`status !== "committed"`) require an existing `backupDir` on disk, refuse `delete_created` entries targeting already-owned untouched ledgers, enforce WAL/ledger language consistency, never bypass validation on `--force-unlock`, and document the workspace trust boundary in [docs/SECURITY.md](./docs/SECURITY.md).
- **R3 Hardening (previously landed on `main` `22346417` / `ae0343fa`)**: Recovery WAL v2 identity/path/backup checks, `pending`/`applied`/`rolled_back` undo states, shared-root file addition/removal coordination, prerelease SemVer ordering, strict `done` evidence metadata on state writes, and R3 regression tests.

### Maintenance

- Removed superseded research drafts and implementation handoff plans from the current source tree. Updated `AGENTS.md`, architecture docs and README navigation to reference active Skills, schemas and compatibility evidence.
- Bilingual release archives include language-matched templates and standalone installation guides; source-repository installer commands remain in the full repository.

### Limitations

- Crash recovery remains fail-closed rather than guaranteed repair across sudden power loss on every filesystem: ambiguous `pending` mutations, post-crash user edits, tampered/unoriginated WALs, or WAL/ledger language mismatches preserve target files, journal, and backups for manual inspection.
- Bilingual `LIVE_LLM` behavioral evals (`codex`/`pi`) and isolated offline `pi`/`codex` discovery for `zh-CN` wait on dedicated live runs (`grok-build` offline `NATIVE_HOST` discovery verified for both `en` and `zh-CN`; `grok` live LLM remains `BLOCKED` without auth; `antigravity` IDE invocation remains `NOT_TESTED`). Release tag has not been created.

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
