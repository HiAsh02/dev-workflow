# 宿主兼容性报告：<宿主名称>

- **宿主 ID**：`<codex | antigravity | grok-build | pi>`
- **已测程序／版本**：`<准确版本或 NOT_TESTED>`
- **操作系统／架构**：`<os / arch>`
- **测试日期**：`<YYYY-MM-DD>`
- **总体状态**：`PASS | PARTIAL | FAIL | BLOCKED | NOT_TESTED`

## 八维兼容性矩阵

证据类型：
- `STATIC`：Schema、契约或文件内容 Fixture 验证。
- `NODE_INTEGRATION`：Node 安装器（`bin/dev-workflow.mjs`）及测试 Harness 验证。
- `NATIVE_HOST`：宿主原生 CLI 命令（`codex`、`grok plugin`、`pi` 或 Antigravity Language Server RPC）。
- `LIVE_LLM`：带工作区差异断言的端到端非交互 LLM 调用。

| 维度 | 状态 | 证据类型 | 命令／方法 | 已观察证据 |
|---|---|---|---|---|
| `version` | `NOT_TESTED` | `NATIVE_HOST` | … | … |
| `install` | `NOT_TESTED` | `NATIVE_HOST` / `NODE_INTEGRATION` | … | … |
| `discover` | `NOT_TESTED` | `NATIVE_HOST` | … | … |
| `invoke` | `NOT_TESTED` | `LIVE_LLM` | … | … |
| `update` | `NOT_TESTED` | `NODE_INTEGRATION` / `NATIVE_HOST` | … | … |
| `uninstall` | `NOT_TESTED` | `NATIVE_HOST` / `NODE_INTEGRATION` | … | … |
| `conflict` | `NOT_TESTED` | `NODE_INTEGRATION` / `NATIVE_HOST` | … | … |
| `permissions` | `NOT_TESTED` | `NATIVE_HOST` / `NODE_INTEGRATION` | … | … |

## 已知限制与降级方式

- <记录宿主特定限制或备选路径。>
