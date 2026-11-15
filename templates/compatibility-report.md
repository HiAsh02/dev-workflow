# Host Compatibility Report: <Host Name>

- **Host ID**: `<codex | antigravity | grok-build | pi>`
- **Tested Binary / Version**: `<exact version or NOT_TESTED>`
- **OS / Arch**: `<os / arch>`
- **Test Date**: `<YYYY-MM-DD>`
- **Overall Status**: `PASS | PARTIAL | FAIL | BLOCKED | NOT_TESTED`

## Eight-Dimension Matrix

Evidence types:
- `STATIC`: schema, contract, or file-content fixture verification
- `NODE_INTEGRATION`: Node installer (`bin/dev-workflow.mjs`) and test-harness verification
- `NATIVE_HOST`: Native host CLI command (`codex`, `grok plugin`, `pi`, or Antigravity Language Server RPC)
- `LIVE_LLM`: End-to-end non-interactive LLM invocation with workspace diff assertions

| Dimension | Status | Evidence Type | Command / Method | Observed Evidence |
|---|---|---|---|---|
| `version` | `NOT_TESTED` | `NATIVE_HOST` | ... | ... |
| `install` | `NOT_TESTED` | `NATIVE_HOST` / `NODE_INTEGRATION` | ... | ... |
| `discover` | `NOT_TESTED` | `NATIVE_HOST` | ... | ... |
| `invoke` | `NOT_TESTED` | `LIVE_LLM` | ... | ... |
| `update` | `NOT_TESTED` | `NODE_INTEGRATION` / `NATIVE_HOST` | ... | ... |
| `uninstall` | `NOT_TESTED` | `NATIVE_HOST` / `NODE_INTEGRATION` | ... | ... |
| `conflict` | `NOT_TESTED` | `NODE_INTEGRATION` / `NATIVE_HOST` | ... | ... |
| `permissions` | `NOT_TESTED` | `NATIVE_HOST` / `NODE_INTEGRATION` | ... | ... |

## Known Limitations & Fallback

- <Document any host-specific caveats or fallback paths.>
