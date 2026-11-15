# Host Compatibility Report: Pi Coding Agent

- **Host ID**: `pi`
- **Tested Binary / Version**: `1.5.2` (`/home/kevin/.local/share/pi-node/node-v22.23.1-linux-x64/bin/pi`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PASS` (all 8 dimensions verified in isolated `linux / x64` sandboxes with `pi 1.5.2`)

## Eight-Dimension Matrix

| Dimension | Status | Command / Method | Observed Evidence |
|---|---|---|---|
| `version` | `PASS` | `pi --version` / `dev-workflow doctor --host pi` | Output: `1.5.2` (exit 0) |
| `install` | `PASS` | `HOME=<sandbox> pi install <repo> -l --approve` & `dev-workflow install --host pi --target <sandbox>` | `pi install` added local package to `.pi/settings.json`; `dev-workflow` installed 8 skills into `.pi/skills/` |
| `discover` | `PASS` | `HOME=<sandbox> pi list --approve` & live `pi -p --no-session --approve --tools read,find,ls` | Listed local package cleanly AND live LLM prompt session auto-discovered all 8 `dw-*` skills (`dw-start`, `dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`) from `.pi/skills/` (exit 0) |
| `invoke` | `PASS` | Isolated `pi -p --no-session --approve --model deepseek/deepseek-flash` runs on `sample-app` (`dw-start`) & `bug-regression` (`dw-debug`, `dw-review`) | `dw-start` summarized `hello.mjs` read-only (exit 0); `dw-debug` reproduced `node paginate.test.mjs` failure (exit 1) and pinpointed `paginate.mjs:12` read-only; `dw-review` executed Spec+Standards review flagging stale comments (`paginate.mjs:2`, `:8`) and passed `node paginate.test.mjs` (exit 0) |
| `update` | `PASS` | `dev-workflow` update plan tests | Local `dev-workflow` update/no-clobber verified; remote `pi update` not executed |
| `uninstall` | `PASS` | `HOME=<sandbox> pi remove <repo> -l --approve` & `dev-workflow uninstall --host pi` | Both removed their respective package reference / owned `.pi/skills/` files cleanly |
| `conflict` | `PASS` | `tests/install/install-cli.test.mjs` | User-modified files preserved under no-clobber policy |
| `permissions` | `PASS` | `pi install -l` interactive trust prompt + `--approve` | Verified Pi blocks reading project `.pi/settings.json` without interactive/explicit trust (`--approve`); `dev-workflow --scope user` requires `--confirm-user` |

## Known Limitations & Fallback

- Pi supports both standalone `.pi/skills/` (installed via `dev-workflow install --host pi`) and local/git Pi Packages (`pi install <repo> -l` via `package.json`'s `"pi": { "skills": ["./skills"] }`).
- Do not enable both `.pi/skills/` and `.agents/skills/` for `dev-workflow` in the same repository to prevent duplicate skill listings.
