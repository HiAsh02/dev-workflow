# 路由表与流程强度选择

## 1. Playbook 路由（恰好选择一个）

| 用户意图 | 主要 Playbook | 参考文件 | 默认下一步 |
|---|---|---|---|
| 无编辑授权的分析、解释、审计或研究 | `investigate` | [investigate.md](./playbooks/investigate.md) | 只读检查，不修改文件 |
| 新功能、行为变更或限定范围的功能增强 | `feature` | [feature.md](./playbooks/feature.md) | 需求或架构不明确时 `dw-design` → `dw-plan` → `dw-build` |
| 错误、测试失败、回归或运行异常 | `bug-fix` | [bug-fix.md](./playbooks/bug-fix.md) | `dw-debug` |
| 保持行为不变的结构整理 | `refactor` | [refactor.md](./playbooks/refactor.md) | 基线检查 → 最小编辑（`dw-build`）→ `dw-review` |
| 代码、差异或 PR 审查 | `review` | [review.md](./playbooks/review.md) | `dw-review`（未授权修复时只读） |
| 提交、推送、PR、合并、标签、发布或部署 | `ship` | [ship.md](./playbooks/ship.md) | `dw-ship`（先核对严格授权） |
| 跨会话或 Agent 继续中断任务 | `resume` | [resume.md](./playbooks/resume.md) | `dw-handoff` |

## 2. 流程强度与风险矩阵

| 模式 | 触发条件 | 必需步骤 |
|---|---|---|
| `quick` | 明确、小型、局部且低风险的修改或单文件修复 | 阅读上下文、最小修改、执行针对性检查、简短记录证据；不要求规格、Worktree 或子 Agent |
| `standard` | 普通功能、多文件修复或日常重构（默认） | 澄清验收标准、简短计划、增量实现、相关测试、差异审查 |
| `rigorous` | 架构变更、认证/账单/安全/密码学、Schema 或数据迁移、跨模块变更 | 设计摘要与用户批准 → `spec.md` 与任务 DAG → 条件允许时隔离分支/Worktree → TDD/严格检查 → 双轴 Review |

**风险升级规则**：即使改动很小，只要涉及安全、凭据、权限、账单、数据完整性或不可逆远程状态，就应标记 `risk: high`，并执行 `rigorous` 级别的验证与批准关口；流程形式仍可以是 `quick`。

## 3. 约束冲突时的优先顺序

1. 本轮用户的明确指令（在安全不变量范围内）。
2. 经仓库验证的约束（`AGENTS.md`、`docs/`、代码或测试）。
3. 评估后的任务风险（`high` 风险不能省略验证或授权）。
4. 默认 `standard` 工作流启发式规则。
