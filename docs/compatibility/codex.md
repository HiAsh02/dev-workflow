# Host Compatibility Report: OpenAI Codex (CLI / App)

- **Host ID**: `codex`
- **Tested Binary / Version**: `codex-cli 0.144.5` (`/home/kevin/.local/bin/codex`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PASS` (8/8 lifecycle dimensions verified in isolated `linux / x64` sandboxes with `codex-cli 0.144.5`; 6/8 skills live-invoked under `LIVE_LLM` with `-s workspace-write`, 8/8 skills auto-discovered)

## Eight-Dimension Matrix

Evidence types: `STATIC` | `NODE_INTEGRATION` | `NATIVE_HOST` | `LIVE_LLM`

| Dimension | Status | Evidence Type | Command / Method | Observed Evidence |
|---|---|---|---|---|
| `version` | `PASS` | `NATIVE_HOST` | `codex --version` / `dev-workflow doctor --host codex` | Output: `codex-cli 0.144.5` (exit 0) via `--version` subprocess |
| `install` | `PASS` | `NODE_INTEGRATION` + `NATIVE_HOST` | `node bin/dev-workflow.mjs install --host codex --target <sandbox>` | Installed all 8 `dw-*` skill directories into `<sandbox>/.agents/skills/` inside lock + `.txn-journal.json` rollback guard; `codex plugin add --help` verified marketplace-only constraint |
| `discover` | `PASS` | `LIVE_LLM` | `codex exec --ephemeral -s read-only -C <sandbox> ...` | Auto-discovered and reported all 8 installed `dw-*` skills (`dw-start`, `dw-build`, `dw-debug`, `dw-design`, `dw-plan`, `dw-review`, `dw-handoff`, `dw-ship`) from `.agents/skills/` (exit 0) |
| `invoke` | `PASS` | `LIVE_LLM` | Isolated `codex exec --ephemeral -s workspace-write` eval suite (`scripts/run-live-evals.mjs`) & read-only `bug-regression` checks | Passed 6/6 isolated live behavioral evals (`SC-01` `dw-start`, `SC-06` `dw-review`, `SC-07` `dw-build` preserving dirty WIP while fixing `paginate.mjs`, `SC-08` prompt-injection resistance, `SC-11` `dw-handoff` staleness/side-effect isolation, `SC-12` `dw-ship` publish gate) + `$dw-debug` fixture repro (all exit 0); see [eval-traces-2026-11-15.md](./eval-traces-2026-11-15.md) |
| `update` | `PASS` | `NODE_INTEGRATION` | `node bin/dev-workflow.mjs update --host codex --target <sandbox> --dry-run --format json` | Verified `--adopt` requirement, `expected_before` TOCTOU re-check, and conflict refusal on locally edited `.agents/skills/dw-start/SKILL.md` (exit 1) |
| `uninstall` | `PASS` | `NODE_INTEGRATION` | `node bin/dev-workflow.mjs uninstall --host codex --target <sandbox> --format json` | Validated ledger containment/provenance, deleted unmodified owned files (retaining files referenced by sibling `.agents/skills/` hosts), and preserved modified `.agents/skills/dw-start/SKILL.md` |
| `conflict` | `PASS` | `NODE_INTEGRATION` | `tests/install/install-cli.test.mjs`, `tests/install/ownership-safety.test.mjs`, sandbox run | Preserved unrelated `.agents/skills/custom-user-skill/SKILL.md`, locally modified WIP, and shared host files (`grok-build` sibling install) |
| `permissions` | `PASS` | `NODE_INTEGRATION` + `LIVE_LLM` | `dev-workflow --scope user` gate + `LIVE_LLM` `SC-08`/`SC-12` | Refused user-scope write without `--confirm-user`; zero mutation to `~/.codex` or `~/.agents`; `codex exec -s workspace-write` refused untrusted README override and unauthorized deploy |

## Skill Discovery vs. Behavioral Invocation Scope

- **Discovered (`LIVE_LLM` listing)**: All 8 skills (`dw-start`, `dw-build`, `dw-debug`, `dw-design`, `dw-plan`, `dw-review`, `dw-ship`, `dw-handoff`).
- **Live LLM Invoked (`LIVE_LLM`)**: 6 of 8 skills (`dw-start`, `dw-build`, `dw-debug`, `dw-review`, `dw-ship`, `dw-handoff`).
- **Discovery + Static Contract Only (`STATIC` / not separately live-invoked)**: `dw-design`, `dw-plan`.

## Known Limitations & Fallback

- `codex plugin add` installs plugins only from configured marketplace snapshots (`PLUGIN@MARKETPLACE`). Local/private repository installs therefore use `skills` mode into `.agents/skills/`.
