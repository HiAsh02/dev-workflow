# Dev Workflow：跨 Agent 软件研发工作流调研与架构建议（Review Draft）

> 状态：**待用户 Review；不得据此自动实施**  
> 调研快照：2026-11-15（以所列源仓库 `main` 提交为准）  
> 拟议 GitHub 仓库：`HiAsh02/dev-workflow`（**尚未创建；当前 GitHub 连接无新建仓库操作**）  
> Google Drive 归档目录：`dev- workflow`  
> 文档版本：`0.1.0-draft`。本文是**调研与方案**，不是已落地或验证通过的产品。

## 0. 执行摘要

**结论：选择“原生 Agent Skills 标准 + 轻量流程核心 + 可选严格模式 + 宿主适配层”的组合，而不是直接 Fork 或叠装三个仓库。**

- **Waza** 提供“高内聚、低开销、触发边界明确”的组织方式，可借鉴 `/think`、`/hunt`、`/check` 的结果契约，以及从当前工程环境提取约束的做法。
- **Matt Pocock Skills** 提供“需求澄清 → 领域术语/ADR → Spec → 垂直切片任务及依赖 DAG → TDD 实施 → 双轴审查”的工程深度。只在有必要时启用问询、Issue Tracker 和并行执行。
- **Superpowers** 提供“明确的人类批准边界、隔离工作区、可复核测试证据、故障根因分析”的执行纪律。不要把其“只要可能适用就必须调用 Skill”作为所有 Agent 的全局默认策略。

推荐以 **8 个面向开发者的核心 Skill** 作为公共产品界面，在不同宿主上优先使用相同的 `SKILL.md` 内容。高阶 Hook、子 Agent、插件自动触发、任务追踪器 API 都是可选适配，不得成为基础工作流的必要条件。

**强约束**：用户先 Review 此设计；此阶段不创建或安装 Skill、不修改任何 Agent 的全局配置、不向公共仓库发布；GitHub 仓库只作为拟建管理容器，不视为实现批准。

## 1. 核验边界与来源快照

三个一手仓库的默认分支已实际检查，且检查了 README、目录结构、代表性 `SKILL.md`、许可文件：

| 项目 | 直接来源 | 调研时 `main` SHA | 最近检查到的提交时间（UTC） | 许可证 |
|---|---|---|---|---|
| tw93 / Waza | https://github.com/tw93/Waza | `355b9dc7e16a6cec2df519d26702a9400de988da` | 2026-11-11 07:02:01 | MIT |
| Matt Pocock / skills | https://github.com/mattpocock/skills | `5863806dd4e15c63174bee4e7515a4256792ecfa` | 2026-11-12 08:42:38 | MIT |
| obra / Superpowers | https://github.com/obra/superpowers | `22f0b463e7a5e579904dd6211a520321035526f7` | 2026-11-03 22:17:07 | MIT |

- Waza 的 `VERSION` 为 `3.42.0`（以调研时仓库文件为准）；Superpowers 上述主分支提交信息为 v7.0.2 release；Matt 并非依赖单一公布的版本号来理解其功能。三者的版本节奏不可直接按数字比较。
- 一手资料可验证结构和设计意图，但**本次没有在用户的四种宿主上做真实安装/压测**。下述“跨 Agent 兼容性”指标准和文档支持，不是经运行证明的成功率。
- 独立参考标准：Agent Skills 规范 https://agentskills.io/specification ；Codex 文档 https://developers.openai.com/api/reference/cli ；Antigravity https://antigravity.google/docs/skills ；Grok Build https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md ；Pi https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md （Pi 此处为社区原始项目仓库目录资料，实施时需再次核实主线版本）。
- Waza `SKILL.md`、Matt `SKILL.md`、Superpowers `SKILL.md` 的正文均可能改变；后续引用必须锁定精确 commit，不能仅抄当日网页描述。

## 2. 三项目逐一剖析

### 2.1 tw93/Waza：工程习惯的轻量载体

**已观察结构**：`skills/think|ui|check|hunt|write|learn|read|health` 共 8 个技能；有 `skills/RESOLVER.md` 路由索引、`rules/`、`scripts/`、`tests/`、独立插件及 Pi 打包支持、版本校验。README 描述基于共享 Skills 目录以及宿主插件的安装方式。

**值得吸收**：
1. **Result/Outcome Contract**：每项 Skill 要说明完成状态、证据、输出、授权边界，不是泛泛的角色设定。
2. **轻装路由**：`think` 管决策，`hunt` 管有症状的故障，`check` 管审查与交付；明确“不适用”的情况，避免多个 Skill 争抢。
3. **零部署默认**：以 Markdown Skill 为核心，确定性脚本作为增强；项目上下文在调用时读取，而不是发布成用户个人隐私规则。
4. **可审计的工作区安全**：其 `check` 明确区分只读审查与可写操作，强调不篡改用户未提交的工作。

**不足或代价**：
- 对 Spec、领域建模、任务 DAG 和长期项目拆分的内建编排较浅，复杂系统需要另加约定。
- `/check` 覆盖审查、发布、Issue 处置等多模式，适合有经验的 Agent，但功能集中可能造成激活歧义；新系统可拆开 `review` 与 `ship`。
- `/ui`、`/write`、`/learn`、`/read` 对全面工程助手有价值，却不是所有软件研发流程的核心，全部纳入第一版会扩大维护范围。
- 一些功能仍有宿主差异（例如原生插件的更新命令、状态栏或配置规则），不能把原项目的安装脚本视为通用安装器。

### 2.2 mattpocock/skills：工程复杂度与领域知识的管理

**已观察结构**：`skills/engineering/` 与 `skills/productivity/` 中含需求访谈、领域建模、`to-spec`、`to-tickets`、`implement`、`implement-spec`、`tdd`、`code-review`、`retro`、handoff 等。部分入口明确声明 `disable-model-invocation: true`，依赖用户显式调用；仓库提供 Codex/Claude/Copilot/Gemini/其他 Agent 的安装说明。

**值得吸收**：
1. **共享领域语言**：用 `GLOSSARY.md` 和 ADR 记录复杂名词与架构决策，避免跨会话反复猜测；适合多个 Agent 协作。
2. **Spec 与任务不同层**：`to-spec` 给出问题、范围、用户故事、验证决策；`to-tickets` 拆成小的“纵向可验证切片”，并显式保留阻塞关系。
3. **依赖 DAG**：`implement-spec` 从可运行的任务前沿调度，适合跨模块的复杂交付；新系统需要有无并发能力时的降级执行。
4. **两轴代码审查**：把“是否符合仓库标准”和“是否实现规格”分开，避免只做风格检查或者只做功能检查。
5. **交接与复盘**：把知识保存在仓库而不完全依赖聊天上下文。

**不足或代价**：
- 对 Issue Tracker 配置、标签、分支、子 Agent、并发执行有较强依赖；对一次性小改动显著偏重。
- 若照搬 `implement-spec` 的并发 worktree 及合并策略，容易在无隔离能力、无独立审核能力或资源受限的宿主上失效。
- 过度访谈可能拖慢已明确的小任务；需求已决策完成时应支持直接从现有会话生成 Spec，避免再次询问。
- `grill-with-docs` 实际是一个很短的调用编排入口；它依赖其他 Skill 的能力。直接复制这个文件不等于移植了完整行为。

### 2.3 obra/superpowers：高纪律的开发执行框架

**已观察结构**：约 15 个 `skills/` 子目录，以及 Claude/Codex/Antigravity/Cursor/Pi 等多宿主插件与 Hook 文件；包括 `brainstorming`、`writing-plans`、`subagent-driven-development`、`executing-plans`、`test-driven-development`、`systematic-debugging`、`verification-before-completion`、`using-git-worktrees`、`requesting-code-review` 等。官方 README 明列 Grok Build CLI 和 Pi 的安装支持。

**值得吸收**：
1. **证据先于完成声明**：不能仅因为 Agent 口头说“测试通过”就报告成功；应保留命令、退出码、构建与测试输出。
2. **明确批准边界**：设计先获批准；涉及不可逆、敏感、对远端产生副作用的动作必须区分权限。
3. **独立工作区与阶段收束**：worktree 可减少共享工作区污染；规范的分支收尾过程避免遗漏。
4. **TDD 与根因调试**：在可测试代码中要求 Red → Green → Refactor，以及复现、假设、验证，再修改。
5. **双执行模式**：支持子 Agent 驱动与当前会话内执行；其 README 也明确两者存在明显上下文开销差异。

**不足或代价**：
- `using-superpowers` 对几乎任何任务都强制检查和调用技能，若原样并入，会与 Waza 的轻量路由和 Matt 的用户显式调用发生冲突。
- 强制 TDD 对生成物、基础配置、探索原型和不可自动化环境不一定最适合；应保持“验证不可豁免，测试方式按风险与任务适配”。
- 子 Agent 对每任务执行、每任务评审会增加上下文、等待与工具调用开销；无法提供稳定子 Agent 机制时，应退化为单 Agent 执行，而非伪造并行。
- Host Hook / 插件注入属于宿主专属能力，不能以一个同名 Markdown Skill 保证所有 Agent 的启动语义完全一致。
- README 说明可选可视化附带有限版本信息请求，原则上应核验外部资源与遥测开关；新的系统默认不主动发送遥测。

## 3. 横向对比（基于源码设计，不是假想跑分）

| 维度 | Waza | Matt Skills | Superpowers | 对新方案的决策 |
|---|---|---|---|---|
| 主要优化目标 | 低摩擦工程习惯 | 复杂需求与设计质量 | 执行一致性及过程纪律 | 分层组合，不追求单一流派 |
| 任务入口 | 少量明确 Skill | 用户入口 + 模型入口 | Bootstrap + 强制 Skill 检查 | 显式入口 + 有条件的自动发现 |
| 需求澄清 | `/think`，可轻量模式 | 深度访谈、领域术语/ADR | `brainstorming`、审批 Gate | 小任务轻量、大任务可访谈 |
| 规格与任务 | 可执行计划 | Spec → tickets → DAG | 设计 → 细粒度实施计划 | 引入 Spec 和 DAG，但按需 |
| 实施 | 保持宿主原生能力 | TDD、任务图及并行子 Agent | Inline 或子 Agent 驱动 | 可运行能力检测，降级保障 |
| Debug | 证据导向的根因诊断 | 故障最小化/反馈回路 | 系统调试四阶段 | 单个核心 Debug Skill |
| Review | Diff + 项目上下文 + 发布模式 | 标准轴/规格轴分离 | 阶段审核 + 完成验证 | 两轴审查 + 证据门槛 |
| 交付/发布 | `/check` 包含 Ship | PR 及 Ticket 闭环 | 完成分支与可选 PR | Release 单独管控权限 |
| 上下文与 Token | 较节制 | 中高，按功能而定 | 严格模式偏高 | 默认轻量；严格模式可选 |
| 宿主可移植性 | 共享 Skills + 插件 | Skills + 多宿主安装 | 多宿主专属插件 | 内容可移植、Hook 按宿主隔离 |
| 初期配置成本 | 较低 | 复杂场景较高 | 插件安装后启动纪律强 | 默认只需复制/安装 Skill |
| 重要风险 | 深度不够、能力集中 | 编排与 Tracker 绑定 | 规则过强、执行开销 | 自主设计统一协议 |

**冲突实例**：
- Waza `think` 对小改动可给 2–3 句建议；Superpowers `brainstorming` 要先通过设计批准：不宜在所有任务上叠加两次规划。
- Matt `implement-spec` 最大化并发；Superpowers 子 Agent 驱动更强调每任务的独立评审：应按任务耦合、风险、宿主能力、预算决定，而非两套并发一起运行。
- Matt 和 Waza 的 Code Review、Superpowers 的完成验证不能互相替代：Review 找风险，Verification 证明具体运行事实。应整合为同一审查阶段的不同步骤，而非生成三份重复报告。

## 4. 方案选择：为什么不直接 Fork / 全量合并

| 备选方案 | 收益 | 主要代价 | 裁决 |
|---|---|---|---|
| A. 三项目全量复制并在宿主安装 | 最快获得大量功能 | 路由冲突、重复 Skill、版本漂移、Hook 不一致、维护困难 | **不采用** |
| B. Fork Superpowers 再塞入 Waza/Matt | 已有多 Agent 插件基础 | 被上游强制流程设计锁定、修改成本与回归测试面大 | **不采用** |
| C. 自有简洁核心 + 上游概念借鉴 + 薄适配器 | 统一操作语义、可测试、可分层更新、避免宿主锁定 | 起步要设计文档、安装器与跨平台测试 | **推荐** |

**不建议称作“单一通用 Plugin”**。更准确的产品形态是一个**Skill Pack（平台无关的内容）**，按需要生成宿主 Plugin Manifest、Pi Package、Claude/Codex 插件包等。这使宿主差异限制在最薄的一层。

## 5. 拟议用户体验：三档运行模式

| 模式 | 默认触发 | 行为 | 非必要项 |
|---|---|---|---|
| `quick` | 明确且低风险的小改动、局部修复 | 直接读取上下文、最少必要修改、相关验证、简短完成记录 | 不强制建 Spec、Ticket、子 Agent、Worktree |
| `standard`（默认） | 普通功能、单模块维护、较清晰的需求 | 轻量设计/验收条件、分步骤实现、相关测试、Diff Review | 不强制外部 Tracker；无需每步建独立会话 |
| `rigorous` | 架构变更、跨模块迁移、安全/计费/认证、长链路重构 | 用户确认设计 → Spec/ADR → DAG → 隔离分支/工作区 → TDD/变更验证 → 双轴独立 Review → 完成证明 | 仅在宿主具备能力时启用并行；否则顺序执行 |

**风险等级与流程强度分开**：高风险却很小的变更（例如密钥处理、权限判断）可要求强验证，但不一定需要 30 页 Spec。大规模只读研究需要深入报告，但不得隐含授权修改代码。

### 五条常见路径

```text
普通功能：dw-start -> dw-design(按需) -> dw-plan -> [用户批准] -> dw-build -> dw-review
小改动：用户请求 -> 必要上下文 -> 修改 -> 相关测试 -> dw-review(简化)
缺陷：dw-debug(重现与根因) -> [用户授权修改] -> dw-build -> dw-review
大型项目：dw-design -> dw-plan(Spec + DAG + ADR) -> [批准] -> dw-build(rigorous) -> dw-review
发布：dw-review -> [明确发布授权] -> dw-ship -> 远端状态复核
```

其中 `[用户批准]` 是人类权限关口，而不是 Skill 自动串联时可以绕过的中间步骤。用户原始请求本身明确授权的修改不要求同一动作反复批准，但新增加的高风险副作用必须另行确认。

## 6. 建议的 Skill 接口与职责

**第一版只设计、尚不实现** 8 个核心 Skill；均使用 `dw-` 前缀，避免与 Waza、Matt 和 Superpowers 原名冲突。

| Skill 名 | 唯一职责 | 核心输入 | 可核验产出 | 借鉴来源 |
|---|---|---|---|---|
| `dw-start` | 意图路由、成本与风险分级、检查权限 | 用户请求、项目状态 | 任务类型/模式/下一步；只读请求不写文件 | Waza RESOLVER、Matt ask-matt |
| `dw-design` | 需求歧义、备选设计、领域词汇与 ADR | 问题、已知约束、仓库设计 | 决策完整的 Design Brief；必要时 ADR/Glossary | Waza think、Matt grilling/domain-modeling、Super brainstorming |
| `dw-plan` | Spec、验收准则、纵向切片、依赖 DAG | 已批准设计、工程上下文 | `spec.md`、任务清单、阻塞边、验证计划 | Matt to-spec/to-tickets、Super writing-plans |
| `dw-build` | 按计划实现；TDD/测试与能力降级 | 已批准任务、可用工具 | 修改文件、测试证据、任务进度日志 | Matt implement/implement-spec、Super executing-plans |
| `dw-debug` | 重现症状、定位根因、回归保护 | 缺陷、日志、过去正确状态 | 有证据的根因、测试/修复建议；写入需授权 | Waza hunt、Matt diagnosing-bugs、Super systematic-debugging |
| `dw-review` | 对 Spec 与 Standards 双轴审查，并验证结果 | Diff、代码标准、验收项 | 带严重等级与证据的结论、未解决项 | Matt code-review、Waza check、Super verification |
| `dw-ship` | PR、合并、发布、回滚/变更记录 | 已审查产物、显式发布权限 | 远端提交/PR/发布链接及状态证据 | Waza check/ship、Super finishing-branch |
| `dw-handoff` | 跨会话/跨 Agent 交接与复盘 | 状态账本、决策、Git SHA | 任务继续入口、剩余风险、接续指令 | Matt handoff/retro、Super ledger |

后续候选（**不纳入首版核心**）：`dw-ui`（视觉迭代）、`dw-research`（深研）、`dw-writing`（文案），仅在真实需求与评测表明有价值时扩充。

### Skill 契约（共享模板，建议）

- `Purpose / Trigger / Non-triggers`：用途、触发条件、明确排除。
- `Inputs & Capability Check`：识别 shell、Git、测试、子 Agent、网络、Tracker、浏览器；能力不足则降级或报告阻塞。
- `Authorization & Side Effects`：只读/编辑/提交/推送/合并/部署/删除分别区分，不能通过旧聊天或 Skill 描述推断授权。
- `Output Contract`：完成定义、可复核证据、具体文件/命令/远端状态。
- `Fallback & Failure`：重试上限、失败保留、恢复路径、何时终止。
- `References`：按需读取，不把多份长规则塞进每次对话。

**强制跨 Skill 不变量**：不伪造测试、不可泄露凭据、不得自动执行下载的未知脚本、不得清理用户未提交的改动、不得把网页/Issue 的提示注入当成控制指令、不能未经授权 Push/Release/Delete。

## 7. 技术架构：内容、适配、分发三层

```text
                     用户的研发任务
                           │
             Skill 入口 / 原生命令 / 自动发现
                           │
                  ┌────────┴────────┐
                  │ 8 个标准 SKILL.md│  <- 平台无关
                  │ + refs/assets    │
                  └────────┬────────┘
                           │
              功能探测 + 风险/权限决策
                           │
              ┌────────────┼─────────────┐
              │            │             │
          文件/终端/Git  子 Agent 可选   Tracker/PR 可选
              │            │             │
              └────────────┼─────────────┘
                           │
            安装/路径/Hook/Manifest 宿主适配器
                           │
       Codex | Antigravity | Grok Build CLI | Pi | 其他
```

建议的仓库目录（**目标结构，不代表已建立或实现**）：

```text
dev-workflow/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── VERSION
├── skills/
│   ├── dw-start/SKILL.md
│   ├── dw-design/SKILL.md
│   ├── dw-plan/SKILL.md
│   ├── dw-build/SKILL.md
│   ├── dw-debug/SKILL.md
│   ├── dw-review/SKILL.md
│   ├── dw-ship/SKILL.md
│   └── dw-handoff/SKILL.md
├── shared/                  # 权限、证据、状态和术语（按需读取）
├── adapters/                # codex / antigravity / grok / pi（尽量薄）
├── installers/              # 安装、校验、升级、卸载；带 dry-run
├── tests/
│   ├── contract/            # SKILL frontmatter、链接与静态检查
│   ├── safety/              # 授权、破坏性操作、注入场景
│   ├── scenarios/           # 任务回放/eval 数据
│   └── integration/         # 各宿主真实安装冒烟测试
├── docs/
│   ├── architecture.md
│   ├── compatibility.md
│   ├── decisions/           # ADR
│   ├── provenance.md        # 采纳上游思想/拷贝的来源归属
│   └── research/            # 调研快照
└── .github/workflows/       # 等用户批准后添加 CI
```

**实现注意**：共享 `shared/` 并非自动传递给安装后单个 Skill。打包器需要拷入需要的 references，或在仓库内通过可靠相对路径引用；不得留下指向外部仓库的失效链接。Symlink 对 Windows、打包器和跨文件系统可能不稳定；以文件复制/硬链接/安装器管理的软链接为可选策略，并做好冲突检测与回滚。

## 8. 跨 Agent 兼容性（以实际产品能力为准）

| Agent | 已确认的 Skill 机制 | 建议第一版入口 | 需要独立验证的事项 |
|---|---|---|---|
| **Codex (CLI/App)** | 开放 Agent Skills，工程/用户可使用 `.agents/skills/` | 标准技能目录；可考虑技能安装工具 | 插件市场打包格式、启动 Hook、自动调用的准确性 |
| **Antigravity (App/CLI/IDE)** | `.agents/skills/`；用户级以 `~/.gemini/config/skills/` 为主（部分旧目录兼容）；CLI 支持 Plugin | 工作区级标准 Skill；必要时 `agy plugin` | App/IDE/CLI 的版本和全局目录差异、Slash 刷新 |
| **Grok Build CLI（`grok`）** | 官方文档列 `.grok/skills/` 和 `.agents/skills/`，带名称优先级 | 工作区 `.agents/skills/` 或用户级 `.grok/skills/` | 宿主具体版本、权限和 Plugin Manifest；注意与非官方同名 `grok-cli` 区分 |
| **Pi coding agent** | 原生 Agent Skills；全局 `~/.pi/agent/skills/`、项目 `.pi/skills/`，并支持 package `skills/` | `.pi/skills/` 或 Pi Package 适配 | Package 元数据、安装更新、Compaction 后恢复 |
| **Claude Code** | 项目/用户 Skill 目录和原生插件能力 | 仅作扩展兼容目标 | Hook 注入与 Plugin Marketplace 元数据 |
| **其他 Agents** | 依其是否实现 Agent Skills，不能一概保证 | 标准 `SKILL.md` + 一页适配说明 | 目录发现、命令调用、shell/子 Agent 等能力 |

**关键判断**：标准确保 `SKILL.md` 的可读性和可复用性，**不**保证每个 Agent 都有同名命令、相同权限、同等工具调用结果或可用的子 Agent。可携带的应是“流程语义 + 输入输出 + 验证契约”，不是硬编码在某个宿主上的工具指令。

### 分发方案

**v1 优先**：Git 仓库作为单一事实源。提供可审阅的 `install --agent ... --scope project|user --ref <tag> --dry-run`，按平台复制完整 Skill 文件夹；支持列出将覆盖的文件、备份/卸载、拒绝未授权覆盖。对于能识别项目级 `.agents/skills/` 的宿主，直接安装到此目录；Pi 单独投射到 `.pi/skills/`。保留人工复制的零工具备选。

**v1.1 可选**：支持 `npx skills add <owner>/<repo> -a <agent>`（须在目标仓库实际建好、发布、经受支持的 agent ID 验证后写入正式说明）。私有仓库需要凭据和分发授权，不得假设匿名 `npx` 可读取。

**v2 可选**：分别生成 Codex/Claude/Antigravity Plugin 元数据与 Pi package。它们是**同一技能内容的衍生包**，不能让每个 Host Fork 自己的一份技能实现。

## 9. 工作流状态、上下文与权限

**任务状态机（概念）**：`intake -> design? -> approved? -> planned? -> executing -> verifying -> reviewed -> completed`，任一阶段可为 `blocked`；发布动作是从 `reviewed` 出发的独立授权转换，不能因 `completed` 自动发生。

**持久状态**：建议每个重要任务存一份 `worklog.md`，字段为 `task_id`、模式、当前阶段、批准范围、基线 SHA、已验收任务、验证命令及结果摘要、未解决问题、下一步。不要把不可撤销的授权仅凭口头回忆写入跨 Agent 可无限复用的配置；每次涉及高风险动作须读取当前用户授权和项目真实状态。

**Tracker 可选**：默认把 Spec、任务 DAG 存在 Git 仓库本地 `docs/tasks/` 或 `.dev-workflow/tasks/`；只有用户启用 GitHub Issues/Linear 等后，才同步任务。没有联网权限不能阻止本地实施计划；不能虚构“已创建 Issue”。

**并发**：任务 DAG 的可运行前沿可以用来并发，但是先检查冲突文件、测试夹具、数据库迁移、版本锁等共享资源；高耦合任务顺序执行。无子 Agent 能力时，等价地逐任务执行；不在日志中声称调用过并不存在的子 Agent。

**权限矩阵（建议）**：

| 动作 | 默认行为 | 升级条件 |
|---|---|---|
| 阅读仓库、Diff、公共文档 | 允许按请求范围 | 访问受限信息时按宿主权限处理 |
| 修改用户请求范围内的代码 | 明确修改/实现请求才可进行 | 超出范围需再确认 |
| 执行测试、构建 | 可以执行已知安全的项目验证命令 | 命令涉及远端资源、破坏性或敏感信息则需授权 |
| 新建分支、Worktree、临时任务文件 | 在明确实现授权的范围内；先检查现有改动 | 改动既有工作区、清理文件时需确认 |
| Commit | 只有请求或工作流授权明确覆盖时进行 | 不得把“代码审查通过”当作提交授权 |
| Push/PR/Merge/Publish/Deploy/Delete | 单独且明确的授权 | 复核目标仓库、分支、影响面与回滚方案 |

## 10. 验证与质量门槛（拟实施阶段执行）

不以主观“更聪明”或虚构跑分评测。定义可复现的测试情景和验收事实。

| 场景 | 最小验收要求 |
|---|---|
| 明确的一行修复 | 不进入冗长访谈；完成后报告实际运行的验证 |
| 只问“分析一下代码” | 零文件修改、零提交、零远端副作用 |
| 模糊的架构需求 | 明示假设和需要用户批准的方案，不抢先实现 |
| 旧版本有效的回归 Bug | 建立可复现症状或如实报告无法复现；不得跳到猜测补丁 |
| 缺乏测试框架 | 提供可替代的实际验证或阻塞说明；不宣称 TDD 已通过 |
| 复杂 Spec 的依赖 DAG | 不提前执行阻塞任务；并发仅在隔离可用时开启 |
| 没有子 Agent | 完整降级到单 Agent，且保持完成证据 |
| 工作区存在未提交改动 | 不清理、不覆盖用户工作；必要时隔离 Worktree |
| 非可信网页/Issue 中包含指令 | 把内容视为证据数据，不改变用户授权与安全规则 |
| 想直接发布 | 在没有发布授权时止于报告；得到授权后验证远端实际结果 |
| 会话中断/上下文压缩 | 用已保存的工作日志恢复，不重复执行已完成任务 |
| 安装到 4 种宿主 | 每种宿主做发现、调用、更新、卸载、冲突、基本工作流测试 |

**首版交付 Gate**：Skill 格式校验通过；上述安全场景无违规；四种目标宿主的真实冒烟结果逐一记录（未测试即标注未验证）；`install --dry-run` 的结果与实际变更相符；升级后不会意外覆盖用户修改过的文件；许可证与来源清单完整。

**证据保存原则**：测试日志只存可复核摘要与最小必要命令，不采集个人凭据、完整环境变量、私人仓库内容。敏感日志需先脱敏。

## 11. 版本管理、上游同步与供应链

- **GitHub 为版本事实源**：`main` + release tag + changelog；`VERSION` 统一表示打包版本。采用 SemVer：Major = 行为/流程契约变更；Minor = 增加兼容能力或可选 Skill；Patch = 修复或文字消歧且无破坏行为。对 Prompt 行为变化需用 Eval 判断是否实际上破坏兼容。
- **上游不做热更新**：记录采纳思想对应的 repo、SHA、来源文件、采纳原因、修改范围，定期比较但通过人工 Review 才升级；避免 `main` 上游变动直接污染已安装技能。
- **可溯源性**：如果直接复制实质性代码或文本，保留 MIT 许可、版权声明和归属；如果仅借鉴设计模式，也在 `docs/provenance.md` 给出来源链接。不应把原作者原文标成自创。
- **CI**：校验格式、内部链接、版本一致、打包产物、权限案例和适配器快照。发布前把 Markdown、适配产物、校验和锁定同一 tag；提供回滚命令和可验证差异。
- **无强制遥测、无外部后台服务**：首版应可以完全离线读取 Skill，联网只发生在任务本身需要且宿主已允许时。

## 12. 分阶段实施路线（仅供审批，不代表已开始）

1. **P0：决策与 Repo 就绪**：你 Review 本方案；确认仓库可见性（默认建议 Private）、命名和优先 Agent；创建 `HiAsh02/dev-workflow`；添加本方案快照与初始 `README.md`、`LICENSE`、决策记录。
2. **P1：标准 Skill 最小集**：实现 `dw-start`、`dw-design`、`dw-plan`、`dw-build`、`dw-debug`、`dw-review`、`dw-ship`、`dw-handoff`；拒绝引入全局强制 Bootstrap；完成静态校验。
3. **P2：跨宿主适配**：实现 `Codex/Antigravity/Grok/Pi` 项目级安装与卸载；完整矩阵冒烟；修复 Windows/Unix 路径和名称冲突。
4. **P3：质量门槛与可重用发布**：scenario eval、安全/权限回归、tag、CI、变更日志、可回滚 Release；提供 `npx skills`/宿主插件的可选接入路线。
5. **P4：长期治理**：上游差异分析、版本锁定、采纳记录，加入由真实用户需求推动的可选 Skill；每次升级先回放基准评测。

**第一轮应只验收 P0–P2**：能在至少 Codex、Antigravity、Grok Build CLI、Pi 用同一语义执行“规划、修改、调试、审查”的示例任务，且保留权限与证据边界。发布/自动升级只在经过 Review 及验证后打开。

## 13. GitHub Repo 创建状态与处理办法

- 已通过所连接的 GitHub 账号核实登录名为 `HiAsh02`；对 `HiAsh02/dev-workflow` 的读取返回 404（可能是未创建，也可能是当前连接不可见；不能单凭 404 判断所有权限状态）。
- **实际未创建仓库**：当前 GitHub 连接具备仓库内容、Issue、Branch、Commit 等操作，但**没有创建新 Repository 的动作**。没有进行未经授权的浏览器自动化或将内容提交到替代仓库。
- 你可以在 GitHub UI 打开 https://github.com/new 新建 `dev-workflow`；建议先设 **Private**，空仓库即可。或在已认证 GitHub CLI 的本机执行：

```bash
gh repo create HiAsh02/dev-workflow --private --description "Portable software engineering workflow skills for coding agents"
```

- 创建成功后应读取 GitHub 返回的仓库 ID/URL 验证，再进入下一步。**不要把上述命令误认为本次已经执行**。如果未来当前连接新增建仓接口，可以直接补完此待办，不须改变架构方案。

## 14. Review 时建议确认的决策

建议默认采用：`dev-workflow` / Private（评审期）/ Agent Skills 为核心 / `standard` 作为默认模式 / 不强制启动 Hook / 本地 Markdown Tracker 优先 / GitHub Release 统一版本 / 首版四个目标为 Codex、Antigravity、Grok Build CLI、Pi。

你的 Review 主要需要确认：

1. 是否接受 **8 核心 Skill + 三种强度模式**，或希望首版缩至 6 个。
2. 是否接受 **私有仓库先开发，待能公开分发时再决定公开**。
3. 首版是否需要**原生插件一键安装**作为硬性验收（成本更高），还是接受“标准 Skill 安装 + 明确宿主适配”优先。
4. `rigorous` 模式是否要求**默认强制 TDD 与独立 Review**；建议只在有可运行测试与足够工具能力时强制，否则要求同等级别的实际证据。

在你批准前，不应将本文当作安装、覆盖配置、发布或软件实施授权。

## 15. 一手参考索引

### 三个项目与关键实现

- Waza: https://github.com/tw93/Waza/tree/355b9dc7e16a6cec2df519d26702a9400de988da
- Waza 路由: https://github.com/tw93/Waza/blob/355b9dc7e16a6cec2df519d26702a9400de988da/skills/RESOLVER.md
- Waza `think`: https://github.com/tw93/Waza/blob/355b9dc7e16a6cec2df519d26702a9400de988da/skills/think/SKILL.md
- Waza `hunt`: https://github.com/tw93/Waza/blob/355b9dc7e16a6cec2df519d26702a9400de988da/skills/hunt/SKILL.md
- Waza `check`: https://github.com/tw93/Waza/blob/355b9dc7e16a6cec2df519d26702a9400de988da/skills/check/SKILL.md
- Matt Skills: https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa
- Matt `to-spec`: https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/to-spec/SKILL.md
- Matt `to-tickets`: https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/to-tickets/SKILL.md
- Matt `implement-spec`: https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/implement-spec/SKILL.md
- Matt `code-review`: https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering/code-review/SKILL.md
- Superpowers: https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7
- Super `using-superpowers`: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/using-superpowers/SKILL.md
- Super `brainstorming`: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/brainstorming/SKILL.md
- Super `test-driven-development`: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/test-driven-development/SKILL.md
- Super `verification-before-completion`: https://github.com/obra/superpowers/blob/22f0b463e7a5e579904dd6211a520321035526f7/skills/verification-before-completion/SKILL.md

### 开放标准和宿主文档

- Agent Skills Specification: https://agentskills.io/specification
- OpenAI Codex Skills: https://developers.openai.com/api/reference/cli
- Google Antigravity Skills: https://antigravity.google/docs/skills
- Google Antigravity Workflows Migration: https://antigravity.google/docs/migration/workflows-to-skills
- xAI Grok Build Skills: https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md
- xAI Grok Build CLI: https://github.com/xai-org/grok-build
- Pi Agent Skills: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md

---

**文档结论（置信度）：** 对三个仓库当期设计/许可证、开放格式、核心差异的结论为**高**（基于一手代码/README）；对当前四大宿主的目录与安装文档支持为**较高**（文档已核验）；对你未来目标版本与具体环境的安装效果为**待验证**（必须做实际兼容性测试）。
