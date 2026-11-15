# Host Compatibility Report: OpenAI Codex (CLI / App)

- **Host ID**: `codex`
- **Tested Binary / Version**: `codex-cli 0.144.5` (`/home/kevin/.local/bin/codex`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PASS` (all 8 dimensions verified in isolated `linux / x64` sandboxes with `codex-cli 0.144.5`, `--ephemeral -s read-only`)

## Eight-Dimension Matrix

| Dimension | Status | Command / Method | Observed Evidence |
|---|---|---|---|
| `version` | `PASS` | `codex --version` / `dev-workflow doctor --host codex` | Output: `codex-cli 0.144.5` (exit 0) |
| `install` | `PASS` | `node bin/dev-workflow.mjs install --host codex --target <sandbox>` | Installed all 8 `dw-*` skill directories into `<sandbox>/.agents/skills/`; `codex plugin add --help` verified marketplace-only constraint |
| `discover` | `PASS` | `codex exec --ephemeral -s read-only -C <sandbox> ...` (`gpt-5.6-sol`) | Auto-discovered and reported all 8 installed `dw-*` skills (`dw-start`, `dw-build`, `dw-debug`, `dw-design`, `dw-plan`, `dw-review`, `dw-handoff`, `dw-ship`) from `.agents/skills/` (exit 0) |
| `invoke` | `PASS` | Isolated `codex exec --ephemeral -s read-only` runs against `sample-app` (`dw-start`) & `bug-regression` (`$dw-debug`, `$dw-review`) | `dw-start` summarized `hello.mjs` read-only (exit 0); `$dw-debug` reproduced `node paginate.test.mjs` failure (exit 1), located `paginate.mjs:9`, kept worktree clean; `$dw-review` flagged stale comments across Spec+Standards and verified `node paginate.test.mjs` (exit 0) |
| `update` | `PASS` | `node bin/dev-workflow.mjs update --host codex --target <sandbox> --dry-run --format json` | Detected local edit conflict on `.agents/skills/dw-start/SKILL.md` and refused overwrite (exit 1) |
| `uninstall` | `PASS` | `node bin/dev-workflow.mjs uninstall --host codex --target <sandbox> --format json` | Deleted 15 unmodified owned files; preserved locally modified `.agents/skills/dw-start/SKILL.md` |
| `conflict` | `PASS` | `tests/install/install-cli.test.mjs` + sandbox run | Preserved unrelated `.agents/skills/custom-user-skill/SKILL.md` and locally modified `dw-start/SKILL.md` |
| `permissions` | `PASS` | `dev-workflow` CLI `--scope user` without `--confirm-user` | Refused user-scope write; zero mutation to `~/.codex` or `~/.agents` |

## Known Limitations & Fallback

- `codex plugin add` installs plugins only from configured marketplace snapshots (`PLUGIN@MARKETPLACE`). Local/private repository installs therefore use `skills` mode into `.agents/skills/`.
