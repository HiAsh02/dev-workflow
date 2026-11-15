# Host Compatibility Report: Google Antigravity

- **Host ID**: `antigravity`
- **Tested Binary / Version**: `44.9.1` (`~/.local/bin/agy`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PARTIAL` (passive probe, plugin-mode install, live Language Server `GetAllPlugins` discovery, conflict, and uninstall `PASS`; live Antigravity GUI/agent `invoke` session `NOT_TESTED`)

## Eight-Dimension Matrix

Evidence types: `STATIC` | `NODE_INTEGRATION` | `NATIVE_HOST` | `LIVE_LLM`

| Dimension | Status | Evidence Type | Command / Method | Observed Evidence |
|---|---|---|---|---|
| `version` | `PASS` | `NATIVE_HOST` | `node bin/dev-workflow.mjs doctor --host antigravity --format json` | Passively read `version` (`44.9.1`) from `~/Applications/Antigravity-44.9.1/version` without spawning the Electron GUI launcher |
| `install` | `PASS` | `NODE_INTEGRATION` | `node bin/dev-workflow.mjs install --host antigravity --target <sandbox> --format json` | Installed `plugin.json`, `VERSION`, `LICENSE`, `README.md`, `CHANGELOG.md`, and all 8 `skills/dw-*` directories into `<sandbox>/.agents/plugins/dev-workflow/` inside target lock + `.txn-journal.json` rollback protection |
| `discover` | `PASS` | `NATIVE_HOST` | Antigravity Language Server `GetAllPlugins` RPC against isolated `file://<sandbox>` | Live runtime returned plugin `name: "dev-workflow"` (`disabled: null`) with all 8 `dw-*` skills (`dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`, `dw-start`) from `.agents/plugins/dev-workflow/` |
| `invoke` | `NOT_TESTED` | `LIVE_LLM` | — | `~/.local/bin/agy` wraps the desktop Electron binary (`~/Applications/Antigravity-44.9.1/antigravity`) with no headless single-turn CLI prompt runner like `codex exec` / `pi -p`; live IDE skill invocation across the 8 skills was not executed in automated checks |
| `update` | `PASS` | `NODE_INTEGRATION` | `tests/install/install-cli.test.mjs`, `tests/install/ownership-safety.test.mjs` | Locked ownership manifest verifies `expected_before` hashes, preserves unowned identical files unless `--adopt` is passed, and blocks overwriting modified files |
| `uninstall` | `PASS` | `NODE_INTEGRATION` | `lib/install-plan.mjs`, `tests/install/install-cli.test.mjs` | Validates ownership header/provenance/`target_root` containment and removes only unmodified owned plugin files not referenced by sibling installs |
| `conflict` | `PASS` | `NODE_INTEGRATION` | `tests/install/install-cli.test.mjs`, `tests/install/ownership-safety.test.mjs` | Preserves modified WIP and unowned files (`preexisting_identical_unowned` kept out of ownership ledger unless `--adopt` is passed) |
| `permissions` | `PASS` | `NODE_INTEGRATION` | `doctor` + `--scope user` gate | `doctor` never launches Electron GUI or edits `~/.gemini/config/config.json`; `--scope user` requires `--confirm-user` |

## Skill Discovery vs. Behavioral Invocation Scope

- **Discovered (`NATIVE_HOST` `GetAllPlugins`)**: All 8 skills (`dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`, `dw-start`).
- **Live LLM Invoked (`LIVE_LLM`)**: None (`NOT_TESTED` in desktop Electron runtime).

## Known Limitations & Fallback

- Do not install both `.agents/plugins/dev-workflow/` (`plugin` mode) and `.agents/skills/dw-*` (`skills` mode) in the same project simultaneously to avoid duplicate skill registration.
- If a workspace-local plugin directory is not desired or an older client ignores `.agents/plugins/`, fall back to `--mode skills` (`.agents/skills/`).
