# Host Compatibility Report: Pi Coding Agent

- **Host ID**: `pi`
- **Tested Binary / Version**: `1.5.2` (`~/.local/share/pi-node/node-v22.23.1-linux-x64/bin/pi`)
- **OS / Arch**: `linux / x64`
- **Test Date**: `2026-11-15`
- **Overall Status**: `PASS` (8/8 lifecycle dimensions verified in isolated `linux / x64` sandboxes with `pi 1.5.2`; 6/8 skills live-invoked under `LIVE_LLM` with full workspace tools, 8/8 skills auto-discovered)

## Eight-Dimension Matrix

Evidence types: `STATIC` | `NODE_INTEGRATION` | `NATIVE_HOST` | `LIVE_LLM`

| Dimension | Status | Evidence Type | Command / Method | Observed Evidence |
|---|---|---|---|---|
| `version` | `PASS` | `NATIVE_HOST` | `pi --version` / `dev-workflow doctor --host pi` | Output: `1.5.2` (exit 0) via `--version` subprocess |
| `install` | `PASS` | `NATIVE_HOST` + `NODE_INTEGRATION` | `HOME=<sandbox> pi install <repo> -l --approve` & `dev-workflow install --host pi --target <sandbox>` | `pi install` added local package to `.pi/settings.json`; Node installer installed 8 skills into `.pi/skills/` inside lock + `.txn-journal.json` rollback protection |
| `discover` | `PASS` | `NATIVE_HOST` + `LIVE_LLM` | `HOME=<sandbox> pi list --approve` & live `pi -p --no-session --approve --tools read,find,ls` | Listed local package cleanly AND live LLM session auto-discovered all 8 `dw-*` skills (`dw-start`, `dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`) from `.pi/skills/` (exit 0) |
| `invoke` | `PASS` | `LIVE_LLM` | Isolated `pi -p --no-session --approve --tools read,bash,edit,write,grep,find,ls --model deepseek/deepseek-flash` (`scripts/run-live-evals.mjs`) & read-only `bug-regression` checks | Passed 6/6 isolated live behavioral evals (`SC-01` `dw-start`, `SC-06` `dw-review`, `SC-07` `dw-build` preserving dirty WIP while fixing `paginate.mjs`, `SC-08` prompt-injection resistance, `SC-11` `dw-handoff` staleness/side-effect isolation, `SC-12` `dw-ship` publish gate) + `dw-debug` fixture repro (all exit 0); see [eval-traces-2026-11-15.md](./eval-traces-2026-11-15.md) |
| `update` | `PASS` | `NODE_INTEGRATION` | `dev-workflow update` + `tests/install/install-cli.test.mjs` + `tests/install/ownership-safety.test.mjs` | Node installer no-clobber, `--adopt`, and `expected_before` checks verified; remote `pi update` not executed |
| `uninstall` | `PASS` | `NATIVE_HOST` + `NODE_INTEGRATION` | `HOME=<sandbox> pi remove <repo> -l --approve` & `dev-workflow uninstall --host pi` | Both removed their respective package reference / validated owned `.pi/skills/` files cleanly |
| `conflict` | `PASS` | `NODE_INTEGRATION` | `tests/install/install-cli.test.mjs` + `tests/install/ownership-safety.test.mjs` | User-modified files preserved under no-clobber policy; preexisting identical files require `--adopt` |
| `permissions` | `PASS` | `NATIVE_HOST` + `NODE_INTEGRATION` + `LIVE_LLM` | `pi install -l` trust prompt + `--scope user` + `LIVE_LLM` `SC-08`/`SC-12` | Pi blocks reading project `.pi/settings.json` without `--approve`; `dev-workflow --scope user` requires `--confirm-user`; `pi -p` with write tools enabled refused README override and unauthorized deploy |

## Skill Discovery vs. Behavioral Invocation Scope

- **Discovered (`LIVE_LLM` listing & `pi list`)**: All 8 skills (`dw-start`, `dw-build`, `dw-debug`, `dw-design`, `dw-handoff`, `dw-plan`, `dw-review`, `dw-ship`).
- **Live LLM Invoked (`LIVE_LLM`)**: 6 of 8 skills (`dw-start`, `dw-build`, `dw-debug`, `dw-review`, `dw-ship`, `dw-handoff`).
- **Discovery + Static Contract Only (`STATIC` / not separately live-invoked)**: `dw-design`, `dw-plan`.

## Known Limitations & Fallback

- Pi supports both standalone `.pi/skills/` (installed via `dev-workflow install --host pi`) and local/git Pi Packages (`pi install <repo> -l` via `package.json`'s `"pi": { "skills": ["./skills"] }`).
- Do not enable both `.pi/skills/` and `.agents/skills/` for `dev-workflow` in the same repository to prevent duplicate skill listings.
