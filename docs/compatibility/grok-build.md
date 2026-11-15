# Host Compatibility Report: xAI Grok Build CLI

- **Host ID**: `grok-build` (explicitly distinct from `grok-bot`)
- **Tested Binary / Version**: `grok 1.0.52 (0920c8169e27)` (`/home/kevin/.local/bin/grok`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PARTIAL` (version, plugin validate/install/uninstall, skills install/discover/uninstall `PASS`; live LLM `invoke` is `BLOCKED` by missing Grok authentication)

## Eight-Dimension Matrix

Evidence types: `STATIC` | `NODE_INTEGRATION` | `NATIVE_HOST` | `LIVE_LLM`

| Dimension | Status | Evidence Type | Command / Method | Observed Evidence |
|---|---|---|---|---|
| `version` | `PASS` | `NATIVE_HOST` | `grok --version` / `dev-workflow doctor --host grok-build` | Output: `grok 1.0.52 (0920c8169e27)` (exit 0) via `--version` subprocess |
| `install` | `PASS` | `NATIVE_HOST` + `NODE_INTEGRATION` | `grok plugin validate <repo>` + `HOME=<sandbox> grok plugin install <repo> --trust` + `dev-workflow install --host grok-build` | `grok plugin validate` passed (`name: dev-workflow, version: 0.1.0, components: 1 skill dir(s)`); `grok plugin install` installed `dev-workflow-872ac978`; Node installer installed `.agents/skills/` (project) and `.grok/skills/` (user) with shared-file ownership ledgers |
| `discover` | `PASS` | `NATIVE_HOST` | `HOME=<sandbox> grok inspect --json` | Discovered all 8 `dw-*` skills (`dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`, `dw-start`) via native `grok plugin install` AND via isolated user-scope `.grok/skills/` |
| `invoke` | `BLOCKED` | `LIVE_LLM` | `grok models` | Reported `You are not authenticated.` — live Grok Build LLM behavioral invocation cannot execute until authenticated (`grok login`) |
| `update` | `PASS` | `NODE_INTEGRATION` | `dev-workflow update` + `tests/install/install-cli.test.mjs` + `tests/install/ownership-safety.test.mjs` | Native `grok plugin update` against remote not run; Node installer enforces lockfile, `expected_before` TOCTOU re-check, and `--adopt` policy |
| `uninstall` | `PASS` | `NATIVE_HOST` + `NODE_INTEGRATION` | `HOME=<sandbox> grok plugin uninstall dev-workflow` & `dev-workflow uninstall --host grok-build` | Both native `grok plugin uninstall` (`Uninstalled 1 plugin(s): dev-workflow`) and Node installer cleanly removed unshared owned files while respecting sibling host installs (`codex` / `grok-build` sharing `.agents/skills/`) |
| `conflict` | `PASS` | `NATIVE_HOST` + `NODE_INTEGRATION` | `grok inspect --json` in untrusted project dir + `tests/install/ownership-safety.test.mjs` | Untrusted sandbox project directory reported `projectTrusted: false`, `skills: []`; `grok-bot` rejected by `detectHost` / `selectMode`; sibling host installs retain shared files on single-host uninstall |
| `permissions` | `PASS` | `NATIVE_HOST` + `NODE_INTEGRATION` | `grok plugin install` without `--trust` & `dev-workflow` `--confirm-user` | `grok plugin install` refused without `--trust`; `dev-workflow` refused user-scope writes without `--confirm-user` |

## Skill Discovery vs. Behavioral Invocation Scope

- **Discovered (`NATIVE_HOST` `grok inspect --json`)**: All 8 skills (`dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`, `dw-start`).
- **Live LLM Invoked (`LIVE_LLM`)**: None (`BLOCKED`: missing Grok authentication).

## Known Limitations & Fallback

- **Project trust requirement**: Observed in `grok 1.0.52` that untrusted project directories report `projectTrusted: false` in `grok inspect --json` and skip project-level `.agents/skills/` / `.grok/skills/` until the folder is trusted by the user. Native `grok plugin install <path> --trust` or user-scope `.grok/skills/` was confirmed to discover all 8 skills immediately.
- **Product distinction**: `grok-bot` is an unrelated product listed on Agent Plugins' compatible-clients catalog and is explicitly rejected by `dev-workflow` host probes.
