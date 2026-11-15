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
- Contract, security, install, and scenario test suites plus CI workflow template (`docs/ci/validate.yml`, ready to move to `.github/workflows/validate.yml` once `workflow` token scope is granted).
