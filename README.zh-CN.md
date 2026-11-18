# dev-workflow（简体中文）

可移植、以证据为基础的软件工程工作流。工作流以 **Agent Skills**（`skills/dw-*/SKILL.md`）形式定义，并使用符合 **Agent Plugins v1.0.0** 的 `plugin.json` 封装。

仓库：`https://github.com/HiAsh02/dev-workflow`（公开）。  
当前发布状态：`0.1.0`（跨宿主验证为 `Beta / Partial`；源码已公开不代表已经发布 GitHub Release；参见 [兼容性说明](./docs/COMPATIBILITY.md)）  
支持语言：`zh-CN`（简体中文镜像 `locales/zh-CN/`）与 `en`（原英文 canonical `skills/`，见 [README.md](./README.md)）

## 核心原则

- **单一真实来源**：8 个核心 Skill（`dw-start`、`dw-design`、`dw-plan`、`dw-build`、`dw-debug`、`dw-review`、`dw-ship`、`dw-handoff`）及位于 `skills/dw-start/references/playbooks/` 的 7 个内部 Playbook。
- **三档工作流强度**：`quick`、`standard`（默认）及 `rigorous`。流程强度与风险升级相互独立，小型但高风险的改动也必须执行严格验证。
- **明确授权关口**：只读调查不得修改文件；实现不等于允许提交或推送。`dw-ship` 区分 `LOCAL_COMMIT`、`REMOTE_WRITE` 和 `DESTRUCTIVE` 权限。
- **消费 Skill 不依赖 Node 运行时**：Skill 是标准 Markdown。只有维护者执行 `npm run ...` 校验/打包或选择使用安全 CLI 安装器（`bin/dev-workflow.mjs`）时，才需要 Node.js `>=22`。

## 核心 Skill

| Skill | 职责 |
|---|---|
| `dw-start` | 统一入口：识别意图，选择一个 Playbook、流程模式（`quick`/`standard`/`rigorous`）、风险级别与下游 Skill |
| `dw-design` | 澄清需求、比较方案、整理术语/ADR，在高影响编辑前确保设计得到批准 |
| `dw-plan` | 生成 `spec.md`、垂直任务切片、无环依赖（`blocked_by`）、验证命令和回滚说明 |
| `dw-build` | 安全实现任务切片，保护脏工作区，适配 TDD/验证，支持单 Agent 降级 |
| `dw-debug` | 复现缺陷、缩小范围、验证根因，实施授权修复并回归验证 |
| `dw-review` | 依据源码和重跑证据进行双轴审查（`Spec` + `Standards`） |
| `dw-ship` | 对提交、推送、PR、合并、发布和远端核验执行明确授权关口 |
| `dw-handoff` | 根据已核验的磁盘任务账本（`run-state.json`、`worklog.md`）和 Git 状态跨会话/Agent 恢复 |

## 宿主兼容性（已验证范围）

- **OpenAI Codex（`codex-cli 0.144.5`）**：`PASS`（生命周期 8/8 维度）——已验证项目级 `.agents/skills/` 安装、接管/冲突处理、共享根卸载、8 个 Skill 的自动发现；隔离行为实验中对其中 6 个 Skill 完成真实调用（`dw-start`、`dw-build`、`dw-debug`、`dw-review`、`dw-handoff`、`dw-ship`）。`dw-design` 和 `dw-plan` 仅完成发现与静态检查。
- **Pi Coding Agent（`pi 1.5.2`）**：`PASS`（生命周期 8/8 维度）——已验证 `.pi/skills/` 安装、本地 Pi 包（`pi install <path> -l --approve`、`pi list --approve`、`pi remove`）、8 个 Skill 自动发现，以及上述 6 个 Skill 的隔离真实调用；`dw-design` 和 `dw-plan` 仅发现与静态检查。
- **xAI Grok Build CLI（`grok 1.0.52`）**：`PARTIAL`——已验证 `grok plugin validate`、`grok plugin install --trust` 和 `grok inspect --json` 对 8 个 `dw-*` Skill 的发现；未受信任的项目目录在获得信任之前会跳过项目 Skill。真实 LLM 调用因未认证（`You are not authenticated.`）而 `BLOCKED`。此工具不同于 `grok-bot`。
- **Google Antigravity（`44.9.1`）**：`PARTIAL`——已验证被动版本探测、`.agents/plugins/dev-workflow/` 安装，以及 Antigravity Language Server `GetAllPlugins` 发现 8 个 Skill；GUI/IDE 真实调用为 `NOT_TESTED`。

完整证据矩阵位于 [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md)。跨平台 CI（[`.github/workflows/validate.yml`](./.github/workflows/validate.yml)）在 `ubuntu-latest` 和 `windows-latest` 上执行完整验证与打包测试。

## 安装（公开源码仓库）

直接克隆公开源码仓库，检查安装内容，并在安装到目标工程前预览：

```bash
git clone https://github.com/HiAsh02/dev-workflow.git
cd dev-workflow

# 1. 查看本机宿主程序（不修改目标文件；检查 codex/grok/pi 的 --version）
node bin/dev-workflow.mjs doctor --host all

# 2. 预览目标改动，不执行写入（非交互环境必须显式传入 `--language zh-CN|en`；TTY 会双语询问 1/2）
node bin/dev-workflow.mjs install --host codex --language zh-CN --target /path/to/your-project --dry-run

# 3. 安装或升级到项目范围；默认为 no-clobber，`update` 默认沿用账本中已安装语言
node bin/dev-workflow.mjs install --host codex --language zh-CN --target /path/to/your-project
node bin/dev-workflow.mjs update --host codex --target /path/to/your-project

# 4. 列出安装（显示 `language`）、检查中断事务，或安全卸载未被修改的受管文件
node bin/dev-workflow.mjs list --target /path/to/your-project
node bin/dev-workflow.mjs recover --target /path/to/your-project --dry-run
node bin/dev-workflow.mjs uninstall --host codex --target /path/to/your-project
```

**双语安装与事务硬化保证**：
- **单目录单语言**：选定 `zh-CN` 或 `en` 后，安装器只会把对应语言映射到宿主标准的 `skills/dw-*/SKILL.md`，不会混入重复副本；`--language zh-CN` 在插件模式下同时包含 `README.zh-CN.md`。跨宿主共享目录（如 `codex` 与 `grok-build` 共用 `.agents/skills/`）禁止混用语言或就地切换（即使传入 `--upgrade-shared` 也会冲突），须先卸载已有消费者再重新安装目标语言。
- **计划-执行一致性校验（`PLAN_STALE`）**：`apply` 在 `.apply.lock` 锁内先核对主归属账本及共享目录同级账本快照，任何竞态插入或账本变化都会在写入前被拒绝，避免跳过 `--upgrade-shared` 审批或造成账本漂移。
- **Fail-closed WAL 恢复与部分卸载可见性**：恢复 WAL v2 记录事务 ID、`language`、经 `package_digest` 校验的 `source_manifest` 及每条操作前后 SHA-256。对于模糊 `pending` 操作、崩溃后用户编辑、未关联有效来源的 WAL 或账本与 WAL 语言冲突，`recover` 会保守拒绝自动覆盖并保留现场。历史账本缺少 `source_manifest` 时卸载会保留未验证文件并显式返回 `partial_uninstall`、`remaining_owned_files` 与人工清理指引。写入进程确认仍在运行时，切勿使用 `--force-unlock`。

安装到 `--scope user` 必须显式传入 `--confirm-user`。与包内容完全相同但没有归属记录的预存文件会分类为 `preexisting_identical_unowned`，卸载时保留；只有显式传入 `--adopt` 才能接管。共享目录会在卸载其中一个宿主时保留仍由其他宿主引用的文件。原生命令说明：

- Grok Build CLI：可通过 `grok plugin validate /path/to/bundle` 验证根目录（英文）或打包后的 `dist/dev-workflow-<version>-<en|zh-CN>`；在独立临时 `HOME` 下已验证 `grok inspect --json` 可发现英文和中文各 8 个 Skill。
- Pi Agent：直接在仓库根目录执行 `pi install /path/to/dev-workflow -l` 会按根 `package.json` 的 `pi.skills` 安装 `./skills`（英文版）。如需在项目启用简体中文版，请运行 `node bin/dev-workflow.mjs install --host pi --language zh-CN --target /path/to/your-project` 写入 `.pi/skills/`。

## 维护者检查与打包

测试按 `contract-static`、`installer-integration` 和 `agent-behavior-eval` 分层：

```bash
npm ci
npm run validate          # 静态契约：manifest、schema、skills、链接、固定规则的敏感信息检查
npm test                  # 静态契约 + 安装器集成测试
npm run test:safety       # 安装器安全、恢复、权限与路径限制
npm run test:scenario     # SC-01..SC-12 场景契约和 fixture 冒烟测试
npm run test:eval         # Agent 行为评估（离线、确定性沙盒）
npm run pack              # 生成 en 与 zh-CN 双语发布目录和 ZIP（dist/）
npm run verify:dist       # 校验双语目录与 ZIP 条目、Skill 结构及 SHA-256 一致性
```

交互式真实 LLM 行为验证（`codex`、`pi`）可由维护者执行 `npm run eval:live`（`scripts/run-live-evals.mjs`）。`scanSensitiveArtifacts` 只是确定性的正则/文件大小预检查，不是具有完整语义理解的 DLP；信任模型详见 [安全与供应链](./docs/SECURITY.md)。

## 文档

- [架构](./docs/ARCHITECTURE.md)
- [兼容性概览](./docs/COMPATIBILITY.md)
- [安全与供应链](./docs/SECURITY.md)
- [来源与上游归属](./docs/PROVENANCE.md)
- [发布检查清单](./docs/release-checklist.md)
