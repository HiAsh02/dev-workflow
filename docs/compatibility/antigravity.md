# Host Compatibility Report: Google Antigravity

- **Host ID**: `antigravity`
- **Tested Binary / Version**: `44.9.1` (`/home/kevin/.local/bin/agy`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PARTIAL` (passive probe, plugin-mode install, live Language Server `GetAllPlugins` discovery, conflict, and uninstall `PASS`; live Antigravity GUI/agent `invoke` session `NOT_TESTED`)

## Eight-Dimension Matrix

| Dimension | Status | Command / Method | Observed Evidence |
|---|---|---|---|
| `version` | `PASS` | `node bin/dev-workflow.mjs doctor --host antigravity --format json` | Passively read `version` (`44.9.1`) from `/home/kevin/Applications/Antigravity-44.9.1/version` without spawning the GUI launcher |
| `install` | `PASS` | `node bin/dev-workflow.mjs install --host antigravity --target <sandbox> --format json` | Installed `plugin.json`, `VERSION`, `LICENSE`, `README.md`, `CHANGELOG.md`, and all 8 `skills/dw-*` directories into `<sandbox>/.agents/plugins/dev-workflow/` |
| `discover` | `PASS` | Antigravity Language Server `GetAllPlugins` RPC against isolated `file://<sandbox>` | Live runtime returned plugin `name: "dev-workflow"` (`disabled: null`) with all 8 skills (`dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`, `dw-start`) from `.agents/plugins/dev-workflow/` |
| `invoke` | `NOT_TESTED` | — | `/home/kevin/.local/bin/agy` wraps the desktop Electron binary (`/home/kevin/Applications/Antigravity-44.9.1/antigravity`) with no headless single-turn CLI prompt runner like `codex exec` / `pi -p`; live IDE prompt invocation was not triggered in automated shell checks |
| `update` | `PASS` | `tests/install/install-cli.test.mjs` + `lib/install-plan.mjs` | Ownership manifest tracks file SHA-256 hashes and blocks overwriting modified files |
| `uninstall` | `PASS` | `lib/install-plan.mjs` + `tests/install/install-cli.test.mjs` | Removes unmodified owned plugin files and preserves user modifications |
| `conflict` | `PASS` | `tests/install/install-cli.test.mjs` (`VAL-10`) | Verified `plugin` mode and `skills` mode produce byte-identical hashes under `skills/` |
| `permissions` | `PASS` | `doctor` + `--scope user` gate | `doctor` never launches GUI or edits `~/.gemini/config/config.json`; `--scope user` requires `--confirm-user` |

## Known Limitations & Fallback

- Do not install both `.agents/plugins/dev-workflow/` (`plugin` mode) and `.agents/skills/dw-*` (`skills` mode) in the same project simultaneously to avoid duplicate skill registration.
- If a workspace-local plugin directory is not desired or an older client ignores `.agents/plugins/`, fall back to `--mode skills` (`.agents/skills/`).
