# Cross-Agent Compatibility

`dev-workflow` targets four primary coding agent hosts:

1. **OpenAI Codex (CLI / App)**
2. **Google Antigravity (App / CLI / IDE)**
3. **xAI Grok Build CLI (`grok`)** — explicitly distinct from `grok-bot` and unrelated third-party `grok-cli` packages
4. **Pi Coding Agent (`pi`)**

## Current Compatibility Summary (2026-11-15 — Beta / Partial Verification)

> **Verification status (2026-11-15)**: The bilingual/R4 integration commit [`043434c`](https://github.com/HiAsh02/dev-workflow/commit/043434c44af8af9775103fb545a62d2bb630fd58) passed [Ubuntu + Windows CI run 43723300242](https://github.com/HiAsh02/dev-workflow/actions/runs/43723300242). Subsequent R5 distribution changes require their own CI run before release. Local verification before this patch covered bilingual packaging/ZIP checks, shared-root/R4 tests, and isolated-`HOME` `grok inspect --json` discovery for both languages. Earlier `LIVE_LLM` evaluations (12 English runs on Codex 0.144.5 and Pi 1.5.2) have not been rerun for `zh-CN` or after the bilingual integration; `dw-design`/`dw-plan` remain discover + static-checked only. Grok Build live invocation remains `BLOCKED` (unauthenticated), Antigravity GUI invocation remains `NOT_TESTED`, and the project is `Beta / Partial`.

## Bilingual Language Support

- **Languages**: `en` (canonical `skills/`, `templates/`, `README.md`) and `zh-CN` (`locales/zh-CN/skills/`, `locales/zh-CN/templates/`, `README.zh-CN.md`).
- **Dist bundles**: `npm run pack` emits separate canonical layouts `dist/dev-workflow-<version>-en(.zip)` and `dist/dev-workflow-<version>-zh-CN(.zip)`, each placing only its selected language under `skills/`.
- **Native Pi package note**: `package.json` `"pi": { "skills": ["./skills"] }` serves English when running `pi install <repo-root> -l` directly from the source repo; use `node bin/dev-workflow.mjs install --host pi --language zh-CN` to install Simplified Chinese into `.pi/skills/`.

| Host | Binary / Version | Preferred Mode | CLI / Install / Uninstall | Discovery | Live LLM Invoke (`LIVE_LLM`) | Report |
|---|---|---|---|---|---|---|
| `codex` | `codex-cli 0.144.5` | `skills` (`.agents/skills`) | `PASS` (`NODE_INTEGRATION` + `NATIVE_HOST` check) | `PASS` (`LIVE_LLM`: all 8 `dw-*` skills) | `PASS` (`codex exec -s workspace-write`: 6/8 skills invoked, 6/6 behavioral evals pass) | [codex.md](./compatibility/codex.md) |
| `antigravity` | `agy 44.9.1` | `plugin` (`.agents/plugins/dev-workflow`) | `PASS` (`NODE_INTEGRATION`) | `PASS` (`NATIVE_HOST`: `GetAllPlugins` RPC, all 8 `dw-*` skills) | `NOT_TESTED` (Electron GUI runtime only) | [antigravity.md](./compatibility/antigravity.md) |
| `grok-build` | `grok 1.0.52` | `skills` (`.agents/skills` / `~/.grok/skills`) or `grok plugin install` | `PASS` (`NATIVE_HOST` + `NODE_INTEGRATION`) | `PASS` (`NATIVE_HOST`: `grok inspect --json`, all 8 `dw-*` skills) | `BLOCKED` (`grok models`: `You are not authenticated.`) | [grok-build.md](./compatibility/grok-build.md) |
| `pi` | `pi 1.5.2` | `skills` (`.pi/skills`) or `pi install <path> -l` | `PASS` (`NATIVE_HOST` + `NODE_INTEGRATION`) | `PASS` (`NATIVE_HOST` `pi list` + `LIVE_LLM`: all 8 `dw-*` skills) | `PASS` (`pi -p --no-session --approve`: 6/8 skills invoked, 6/6 behavioral evals pass) | [pi.md](./compatibility/pi.md) |

## Verification Standard & Evidence Types

Compatibility claims distinguish both verdict and evidence level:

- **Status codes**: `PASS` (verified directly with recorded version, command, exit code, and output), `FAIL` (reproducible defect), `BLOCKED` (unauthenticated/unavailable runtime), `NOT_TESTED` (not executed).
- **Evidence types**:
  - `STATIC`: schema, frontmatter, link, or fixture contract tests (`npm run validate`, `npm run test:scenario`)
  - `NODE_INTEGRATION`: Node installer (`bin/dev-workflow.mjs`) and offline safety/recovery harness tests (`npm test`, `npm run test:safety`, `npm run test:eval`)
  - `NATIVE_HOST`: Native host CLI/RPC commands (`codex`, `grok plugin`, `pi install/list`, Antigravity Language Server RPC)
  - `LIVE_LLM`: Non-interactive authenticated LLM turns with workspace-diff & Git-ref verification (`scripts/run-live-evals.mjs`)

## Detailed Reports & Sources

- Live LLM behavioral eval trace log (`SC-01/06/07/08/11/12` on `codex` and `pi`): [eval-traces-2026-11-15.md](./compatibility/eval-traces-2026-11-15.md)
- Authoritative specification & documentation snapshots: [compatibility/sources.md](./compatibility/sources.md)
- Host probe definitions: [`hosts/`](../hosts/)
- Host report template: [`templates/compatibility-report.md`](../templates/compatibility-report.md)
