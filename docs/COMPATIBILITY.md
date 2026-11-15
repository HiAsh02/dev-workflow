# Cross-Agent Compatibility

`dev-workflow` targets four primary coding agent hosts:

1. **OpenAI Codex (CLI / App)**
2. **Google Antigravity (App / CLI / IDE)**
3. **xAI Grok Build CLI (`grok`)** — explicitly distinct from `grok-bot` and unrelated third-party `grok-cli` packages
4. **Pi Coding Agent (`pi`)**

## Current Compatibility Summary (2026-11-15 — Beta / Partial Verification)

> **Honesty notice**: Cross-platform CI (`ubuntu-latest` + `windows-latest` via [`.github/workflows/validate.yml`](../.github/workflows/validate.yml)) passed on baseline `ae0343fa` and must be re-run after committing R4 + bilingual updates. On the current working tree, passive/CLI probes, deterministic `en`/`zh-CN` packaging + ZIP entry verification, shared-root/R4 CAS/WAL tests, bilingual installer contract checks, and isolated-`HOME` `NATIVE_HOST` discovery (`grok inspect --json` for both `en` and `zh-CN`, all 8 skills) pass locally. Earlier `LIVE_LLM` behavioral evals (12 runs across `SC-01`, `SC-06`, `SC-07`, `SC-08/REG-EVAL-01`, `SC-11`, `SC-12` on `codex` `0.144.5` and `pi` `1.5.2`) passed on English skills prior to the R4/bilingual patch and have NOT been re-run for `zh-CN` or post-patch `main`; `dw-design`/`dw-plan` remain `discover` + `STATIC` only; **Grok Build** `LIVE_LLM` remains `BLOCKED` (unauthenticated); **Antigravity** IDE runtime `invoke` remains `NOT_TESTED`. Overall release status remains `Beta / Partial`.

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
