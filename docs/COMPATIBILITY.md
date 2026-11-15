# Cross-Agent Compatibility

`dev-workflow` targets four primary coding agent hosts:

1. **OpenAI Codex (CLI / App)**
2. **Google Antigravity (App / CLI / IDE)**
3. **xAI Grok Build CLI (`grok`)** — explicitly distinct from `grok-bot` and unrelated third-party `grok-cli` packages
4. **Pi Coding Agent (`pi`)**

## Current Compatibility Summary (2026-11-15 — Beta / Partial Verification)

> **Honesty notice**: Cross-platform CI (`ubuntu-latest` + `windows-latest` via [`.github/workflows/validate.yml`](../.github/workflows/validate.yml)), passive probes, packaging, installer/uninstaller behavior, and live isolated read-only LLM smoke runs (`dw-start`, `dw-debug`, `dw-review`) on **Codex** (`codex-cli 0.144.5`) and **Pi** (`pi 1.5.2`) all passed. Live LLM `invoke` is `BLOCKED` on **Grok Build** (unauthenticated in test environment) and `NOT_TESTED` in the **Antigravity** desktop Electron GUI runtime, so overall release status remains `Beta / Partial` rather than full 4-host live certification.

| Host | Binary / Version | Preferred Mode | CLI / Install / Uninstall | Discovery | Live LLM Invoke | Report |
|---|---|---|---|---|---|---|
| `codex` | `codex-cli 0.144.5` | `skills` (`.agents/skills`) | `PASS` | `PASS` (`.agents/skills/` live prompt listing) | `PASS` (`codex exec --ephemeral -s read-only`: `dw-start`, `dw-debug`, `dw-review`) | [codex.md](./compatibility/codex.md) |
| `antigravity` | `agy 44.9.1` | `plugin` (`.agents/plugins/dev-workflow`) | `PASS` | `NOT_TESTED` | `NOT_TESTED` | [antigravity.md](./compatibility/antigravity.md) |
| `grok-build` | `grok 1.0.52` | `skills` (`.agents/skills` / `~/.grok/skills`) or `grok plugin install` | `PASS` | `PASS` (`grok inspect --json` via plugin & user-scope `.grok/skills`) | `BLOCKED` (`grok models`: `You are not authenticated.`) | [grok-build.md](./compatibility/grok-build.md) |
| `pi` | `pi 1.5.2` | `skills` (`.pi/skills`) or `pi install <path> -l` | `PASS` | `PASS` (`pi list --approve` + `.pi/skills/` live prompt listing) | `PASS` (`pi -p --no-session --approve`: `dw-start`, `dw-debug`, `dw-review`) | [pi.md](./compatibility/pi.md) |

## Verification Standard

Compatibility claims follow strict evidence codes:

- `PASS`: Verified directly against an installed binary/runtime with recorded version, command, exit code, and observed output.
- `FAIL`: Reproducible defect observed during test execution.
- `BLOCKED`: Host binary or runtime environment unavailable, unauthenticated, or restricted by sandbox/network in the test environment.
- `NOT_TESTED`: Not yet executed on the target host.

## Detailed Reports & Sources

- Authoritative specification & documentation snapshots: [compatibility/sources.md](./compatibility/sources.md)
- Host probe definitions: [`hosts/`](../hosts/)
- Host report template: [`templates/compatibility-report.md`](../templates/compatibility-report.md)
