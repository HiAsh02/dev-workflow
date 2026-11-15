# Cross-Agent Compatibility

`dev-workflow` targets four primary coding agent hosts:

1. **OpenAI Codex (CLI / App)**
2. **Google Antigravity (App / CLI / IDE)**
3. **xAI Grok Build CLI (`grok`)** — explicitly distinct from `grok-bot` and unrelated third-party `grok-cli` packages
4. **Pi Coding Agent (`pi`)**

## Current Compatibility Summary (2026-11-15 — Beta / Partial Verification)

> **Honesty notice**: Passive probes, packaging, installer/uninstaller behavior, and host CLI manifest/discovery checks (where non-LLM CLI commands exist) were executed in isolated sandboxes on `linux / x64`. **Live LLM prompt invocation (`invoke`) across the four hosts is `NOT_TESTED`**, so overall status is `Beta / Partial` rather than full end-to-end runtime certification.

| Host | Binary / Version | Preferred Mode | CLI / Install / Uninstall | Discovery | Live LLM Invoke | Report |
|---|---|---|---|---|---|---|
| `codex` | `codex-cli 0.144.5` | `skills` (`.agents/skills`) | `PASS` | `NOT_TESTED` | `NOT_TESTED` | [codex.md](./compatibility/codex.md) |
| `antigravity` | `agy 44.9.1` | `plugin` (`.agents/plugins/dev-workflow`) | `PASS` | `NOT_TESTED` | `NOT_TESTED` | [antigravity.md](./compatibility/antigravity.md) |
| `grok-build` | `grok 1.0.52` | `skills` (`.agents/skills` / `~/.grok/skills`) or `grok plugin install` | `PASS` | `PASS` (`grok inspect --json` via plugin & user-scope `.grok/skills`) | `NOT_TESTED` | [grok-build.md](./compatibility/grok-build.md) |
| `pi` | `pi 1.5.2` | `skills` (`.pi/skills`) or `pi install <path> -l` | `PASS` | `PASS` (`pi list --approve` for Pi package) | `NOT_TESTED` | [pi.md](./compatibility/pi.md) |

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
