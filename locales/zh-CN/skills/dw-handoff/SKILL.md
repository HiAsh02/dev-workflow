---
name: dw-handoff
description: >-
  跨会话或跨 Agent 恢复和交接工程任务，核对磁盘任务账本（run-state.json、worklog.md）
  与实际 Git 状态、HEAD SHA 和证据文件。绝不将历史批准视为长期有效的提交或远程写入权限。
license: MIT
---

# dw-handoff

## 目的

基于已验证的磁盘和 Git 状态，而非过期的聊天总结，准确恢复会话并跨 Agent 交接，避免重复执行工作。

## 适用场景

- 上下文压缩、会话重启或切换编码 Agent 后恢复中断任务。
- 在未完成的会话结束前编写检查点、复盘或交接说明。

## 不适用场景

- 不需要跨会话状态的全新 `quick` 单轮任务。
- 编造缺失的测试证据，或从前几轮推断远程发布批准。

## 输入

- 已存在的 `.dev-workflow/tasks/<task-id>/run-state.json`、`worklog.md` 和（存在时的）`spec.md`。
- 实时只读 Git 状态（`git status`、`git rev-parse HEAD`、`git diff`）。
- 当前用户指令与本轮授权级别。

## 能力要求

- 可在不同 Agent 之间工作，无须扫描无关项目或私有会话历史。
- 严格校验 `run-state.json`，将文件系统与 Git 的真实状态置于聊天笔记之上。

## 执行步骤

1. **定位并验证账本**：
   - 如果存在，读取 `.dev-workflow/tasks/<task-id>/run-state.json` 和 `worklog.md`。
   - 如果 `run-state.json` 格式错误或无法通过 Schema 校验，**立即停止**，将状态标记为 `blocked`，完整保留文件用于排查并报告确切解析或 Schema 错误。
2. **与实时仓库状态核对**：
   - 执行只读 `git status --short --branch` 和 `git rev-parse HEAD`。
   - 对每个标记为 `done` 的步骤，验证其输出产物及 `evidence` 路径仍存在且位于项目内。
   - 如果自记录 `head_commit` 以来 HEAD SHA 或脏文件发生变化，将受影响的验证标记 `reverify_required`。
3. **重新检查当前授权**：`run-state.json` 中的 `approval_reference` 仅作为历史审计信息，**绝不能**视为当前编辑、提交、推送或部署权限。
4. **不得盲目自动执行存储的命令**：`checks[].command` 是待审查的历史记录，不得直接 `eval`。
5. **确定下一个安全动作**：选择最早未完成且未阻塞的步骤（或重验失效检查），输出简洁的交接/恢复摘要。
6. **获写入授权时原子保存检查点**：通过原子重命名更新 `worklog.md` 和 `run-state.json`，不得覆盖无关的用户工作。

## 输出

简明的交接/恢复摘要，包含：

- `task_id`、`mode` 和经过核对的 `status`。
- 已验证的 HEAD SHA 及脏工作区摘要。
- 有有效证据的已完成步骤，与证据失效或未验证步骤。
- 活动阻塞项及当前授权边界。
- 下一个安全步骤及最小恢复提示词。

## 失败处理与降级策略

- 没有 `.dev-workflow/tasks/` 账本时，仅根据 `git status`、`git log -n 5` 和现有文件重建当前状态，并明确说明未找到历史任务账本。

## 授权

- 检查任务状态和 Git 状态是**只读（READ-ONLY）**操作。
- 更新项目工作区的 `.dev-workflow/tasks/<task-id>/` 需要 `LOCAL_EDIT` 授权。
- 不得扫描当前项目之外的仓库或用户主目录中的会话记录。

## 验证

- 确认保留为 `done` 的步骤仍有磁盘产物，且与当前 HEAD 一致（或在恢复后重新完成验证）。
- 确认损坏的 `run-state.json` 没有被默默覆盖。
