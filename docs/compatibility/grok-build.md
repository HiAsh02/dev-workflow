# Host Compatibility Report: xAI Grok Build CLI

- **Host ID**: `grok-build` (explicitly distinct from `grok-bot`)
- **Tested Binary / Version**: `grok 1.0.52 (0920c8169e27)` (`/home/kevin/.local/bin/grok`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PARTIAL` (version, plugin validate/install/uninstall, skills install/discover/uninstall `PASS`; live LLM `invoke` is `BLOCKED` by missing Grok authentication)

## Eight-Dimension Matrix

| Dimension | Status | Command / Method | Observed Evidence |
|---|---|---|---|
| `version` | `PASS` | `grok --version` / `dev-workflow doctor --host grok-build` | Output: `grok 1.0.52 (0920c8169e27)` (exit 0) |
| `install` | `PASS` | `grok plugin validate <repo>` + `HOME=<sandbox> grok plugin install <repo> --trust` + `dev-workflow install --host grok-build` | `grok plugin validate` passed (`name: dev-workflow, version: 0.1.0, components: 1 skill dir(s)`); `grok plugin install` installed `dev-workflow-872ac978`; `dev-workflow` installed `.agents/skills/` (project) and `.grok/skills/` (user) |
| `discover` | `PASS` | `HOME=<sandbox> grok inspect --json` | Discovered all 8 `dw-*` skills (`dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`, `dw-start`) via native `grok plugin install` AND via isolated user-scope `.grok/skills/` |
| `invoke` | `BLOCKED` | `grok models` | Reported `You are not authenticated.` — live Grok Build LLM turn cannot execute until authenticated (`grok login`) |
| `update` | `PASS` | `dev-workflow` installer + `tests/install/install-cli.test.mjs` | Native `grok plugin update` against remote not run; local `dev-workflow update` no-clobber verified |
| `uninstall` | `PASS` | `HOME=<sandbox> grok plugin uninstall dev-workflow` & `dev-workflow uninstall --host grok-build --scope user --confirm-user` | Removed `dev-workflow` cleanly (`Uninstalled 1 plugin(s): dev-workflow` and deleted owned `.grok/skills/` files) |
| `conflict` | `PASS` | `grok inspect --json` in untrusted project dir + `dev-workflow` tests | Untrusted sandbox project directory reported `projectTrusted: false`, `skills: []` (expected trust gate); `grok-bot` rejected by `detectHost` / `selectMode` |
| `permissions` | `PASS` | `grok plugin install` without `--trust` & `dev-workflow` `--confirm-user` | `grok plugin install` refused without `--trust`; `dev-workflow` refused user-scope writes without `--confirm-user` |

## Known Limitations & Fallback

- **Project trust requirement**: Observed in `grok 1.0.52` that untrusted project directories report `projectTrusted: false` in `grok inspect --json` and skip project-level `.agents/skills/` / `.grok/skills/` until the folder is trusted by the user. Native `grok plugin install <path> --trust` or user-scope `.grok/skills/` was confirmed to discover all 8 skills immediately.
- **Product distinction**: `grok-bot` is an unrelated product listed on Agent Plugins' compatible-clients catalog and is explicitly rejected by `dev-workflow` host probes.
