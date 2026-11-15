# Host Compatibility Report: Pi Coding Agent

- **Host ID**: `pi`
- **Tested Binary / Version**: `1.5.2` (`/home/kevin/.local/share/pi-node/node-v22.23.1-linux-x64/bin/pi`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PARTIAL` (version, Pi package install/list/remove, `.pi/skills` fallback install/uninstall `PASS`; live LLM prompt invocation `NOT_TESTED`)

## Eight-Dimension Matrix

| Dimension | Status | Command / Method | Observed Evidence |
|---|---|---|---|
| `version` | `PASS` | `pi --version` / `dev-workflow doctor --host pi` | Output: `1.5.2` (exit 0) |
| `install` | `PASS` | `HOME=<sandbox> pi install <repo> -l --approve` & `dev-workflow install --host pi --target <sandbox>` | `pi install` added local package to `.pi/settings.json`; `dev-workflow` installed 8 skills into `.pi/skills/` |
| `discover` | `PASS` | `HOME=<sandbox> pi list --approve` | Listed installed local package path referencing repo root (`package.json` includes `"pi": { "skills": ["./skills"] }`); live agent startup system-prompt dump not executed |
| `invoke` | `NOT_TESTED` | — | Live Pi LLM prompt session (`pi -p`) not executed |
| `update` | `PASS` | `dev-workflow` update plan tests | Local `dev-workflow` update/no-clobber verified; remote `pi update` not executed |
| `uninstall` | `PASS` | `HOME=<sandbox> pi remove <repo> -l --approve` & `dev-workflow uninstall --host pi` | Both removed their respective package reference / owned `.pi/skills/` files cleanly |
| `conflict` | `PASS` | `tests/install/install-cli.test.mjs` | User-modified files preserved under no-clobber policy |
| `permissions` | `PASS` | `pi install -l` interactive trust prompt + `--approve` | Verified Pi blocks reading project `.pi/settings.json` without interactive/explicit trust (`--approve`); `dev-workflow --scope user` requires `--confirm-user` |

## Known Limitations & Fallback

- Pi supports both standalone `.pi/skills/` (installed via `dev-workflow install --host pi`) and local/git Pi Packages (`pi install <repo> -l` via `package.json`'s `"pi": { "skills": ["./skills"] }`).
- Do not enable both `.pi/skills/` and `.agents/skills/` for `dev-workflow` in the same repository to prevent duplicate skill listings.
