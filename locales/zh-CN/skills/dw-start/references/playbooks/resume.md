# Playbook：resume（继续与交接）

## 触发条件

用户要求继续中断的工作、在上下文压缩后接续，或在编码 Agent 之间交接。

## 前置条件

- 已存在仓库工作区、`.dev-workflow/tasks/<task-id>/` 账本或用户提供的任务引用。

## 顺序步骤

1. 进入 `dw-handoff`，读取存在时的任务账本（`run-state.json`、`worklog.md`、`spec.md`）。
2. 直接交叉核对磁盘产物和 `git status`/`git log`，认为文件系统与 Git 的可信度高于过期笔记。
3. 对产物缺失或自验证以来 HEAD SHA 已变化的已完成步骤重新验证。
4. 检查用户当前授权；不得把历史 `approval_reference` 字符串视为新的写入或远程操作许可。
5. 从下一个未阻塞任务切片继续，或明确报告阻塞原因。

## 证据

- 已验证的当前 HEAD SHA、脏文件列表、核对后的已完成与待完成步骤，以及最新重验输出。

## 失败与停止条件

- `run-state.json` 损坏、无效或与 Git 状态存在致命冲突时，停止并标记 `blocked`；不得悄悄覆盖损坏的账本。
