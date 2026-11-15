# Host Compatibility Report: OpenAI Codex (CLI / App)

- **Host ID**: `codex`
- **Tested Binary / Version**: `codex-cli 0.144.5` (`/home/kevin/.local/bin/codex`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PARTIAL` (installer, conflict, uninstall, and CLI probe `PASS`; live Codex LLM discovery/invocation `NOT_TESTED`)

## Eight-Dimension Matrix

| Dimension | Status | Command / Method | Observed Evidence |
|---|---|---|---|
| `version` | `PASS` | `codex --version` / `dev-workflow doctor --host codex` | Output: `codex-cli 0.144.5` (exit 0) |
| `install` | `PASS` | `node bin/dev-workflow.mjs install --host codex --target <sandbox>` | Installed all 8 `dw-*` skill directories into `<sandbox>/.agents/skills/`; `codex plugin add --help` verified marketplace-only constraint |
| `discover` | `NOT_TESTED` | — | No offline non-LLM skill-listing flag observed in `codex-cli 0.144.5`; target path `.agents/skills/` matches verified Codex documentation (`https://learn.chatgpt.com/docs/build-skills.md`) |
| `invoke` | `NOT_TESTED` | — | Live `codex exec` LLM session not executed in this test pass |
| `update` | `PASS` | `node bin/dev-workflow.mjs update --host codex --target <sandbox> --dry-run --format json` | Detected local edit conflict on `.agents/skills/dw-start/SKILL.md` and refused overwrite (exit 1) |
| `uninstall` | `PASS` | `node bin/dev-workflow.mjs uninstall --host codex --target <sandbox> --format json` | Deleted 15 unmodified owned files; preserved locally modified `.agents/skills/dw-start/SKILL.md` |
| `conflict` | `PASS` | `tests/install/install-cli.test.mjs` + sandbox run | Preserved unrelated `.agents/skills/custom-user-skill/SKILL.md` and locally modified `dw-start/SKILL.md` |
| `permissions` | `PASS` | `dev-workflow` CLI `--scope user` without `--confirm-user` | Refused user-scope write; zero mutation to `~/.codex` or `~/.agents` |

## Known Limitations & Fallback

- `codex plugin add` installs plugins only from configured marketplace snapshots (`PLUGIN@MARKETPLACE`). Local/private repository installs therefore use `skills` mode into `.agents/skills/`.
