# Dev Workflow：四大开发 Agent Harness 调研与跨 Agent Plugin/Skill 架构决策（Review Draft v0.2）

> 状态：**待用户 Review；不得据此自动实施**  
> 调研快照：2026-11-15（以所列源仓库 `main` 提交为准）  
> 现有 GitHub 仓库：[`HiAsh02/dev--workflow`](https://github.com/HiAsh02/dev--workflow)（Private、`main`、空仓库；与规范内的 Plugin 名称不同）  
> Google Drive 归档目录：`dev- workflow`  
> 文档版本：`0.2.0-draft`（替代 v0.1，保留旧稿供追溯）。本文是**调研与方案**，不是已落地或验证通过的产品。

## 0. 执行摘要与决策

**最终建议：选择“Skill-first 的实现内核 + Agent Plugins v1.0 兼容的 Plugin-first 分发”，而不是在纯 Skill 与纯 Plugin 之间二选一。** 具体是**同一份标准 `SKILL.md`** 存放研发逻辑；根目录 `plugin.json` 提供规范化插件身份、版本与发现方式；宿主专属适配和独立 Skill 安装仅作分发投射。**不要将核心逻辑复制进四套宿主文件，也不要让各宿主分别改写流程规则。**

此推荐相较 v0.1 的变化：Agent Plugins 开放规范 v1.0.0 已发布，且 pstack 真实采用 Plugin + Skills + harness 适配的组合；因此**标准 Plugin Manifest 应从首版 P1 就存在，而不是 v2 才添加**。不过，Plugin 规范定义的是包格式/组件发现，而不是所有宿主都有“同一条安装命令”。**Pi 与 Grok Build CLI 的原生安装行为须单独测试并准备 Skill/Package 回退方案；Grok Bot 与 Grok Build CLI 不能混同。**

四个研究对象的明确分工：

- **tw93/Waza**：借鉴轻量触发、任务排除条件、结果/证据契约和低摩擦 Debug/Review。
- **mattpocock/skills**：借鉴需求追问、Glossary/ADR、Spec→垂直任务 DAG、双轴 Review。
- **obra/superpowers**：借鉴阶段纪律、明确的人类授权、TDD/根因调试、独立 Worktree 与验证前置。
- **Lauren Tan / pstack**：借鉴统一入口 `poteto-mode`、Playbook 路由、窄 PR/可验证单元、对抗式证据审查、`correct` 对重复错误的结构性修复，以及“真正可复制的 Plugin + 宿主适配”示范。**不照搬它的 58 Skill 全量、强耦合的 Cursor 操作、固定模型名、长时自主执行或自动合并习惯。**

拟议初版：**8 个公共核心 Skill + 3 档流程强度（quick/standard/rigorous）+ 6~8 个轻量 Playbook + 必要的确定性校验脚本**。核心功能不依赖额外 MCP server；涉及 API/外部 Tracker 的能力按需延伸。以 `dev-workflow` 作为 **Plugin 逻辑名称**（符合 v1.0 命名规则），以既有 GitHub 仓库 `HiAsh02/dev--workflow` 作为源码容器（双连字符在 GitHub URL 中允许，**但不得复制到 `plugin.json.name` 中**）。

**交付边界：当前仍仅研究与架构设计。** 不安装或运行新工作流、不改全局 Agent 配置、不发布 Release、不推送任何尚未审核的 Skill 代码。此次确认仓库存在且具有权限，不等于实施已获批准。

## 1. 调研依据、源快照与核验边界

| 项目 | 一手仓库 | 可复现的参考提交或版本 | 实测检查范围 | License |
|---|---|---|---|---|
| Waza | https://github.com/tw93/Waza | `355b9dc7e16a6cec2df519d26702a9400de988da`；VERSION 3.42.0 | 目录、README、RESOLVER、think/hunt/check、License | MIT |
| Matt Skills | https://github.com/mattpocock/skills | `5863806dd4e15c63174bee4e7515a4256792ecfa` | README、engineering 目录、to-spec/to-tickets/implement-spec/code-review 等 | MIT |
| Superpowers | https://github.com/obra/superpowers | `22f0b463e7a5e579904dd6211a520321035526f7`；当次主分支发布 v7.0.2 | README、skills 与多宿主目录、TDD/verification 等 | MIT |
| pstack | https://github.com/cursor/plugins/tree/main/pstack | pstack 最近日志 SHA `bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7`；`plugin.json` 0.15.42 | README、58 个 skills 子目录、23 个 playbooks 索引、2 个 agents、plugin.json、.cursor-plugin、Claude harness、License | MIT（Lauren Tan） |

**标准依据**：Agent Skills 规范（https://agentskills.io/specification）；Agent Plugins 1.0.0 正式规范（https://agent-plugins.org/specification）及其兼容客户端页面（https://agent-plugins.org/compatible-clients）。这里区分**开放格式支持**与**某宿主具体版本可真正直接安装**：后者没有在你的设备上运行，均为待验证事项。

pstack README 的“58 Skills = 34 个功能技能 + 24 个原则技能、23 Playbook、2 个子 Agent”与检索到的目录一致；**数量不能代表性能或代码质量**。媒体中“4 天约 1150 PR”等吞吐数字属于报道/作者相关自述，未复现统计口径与基准，不能作为选型优势的实测证据。此处优先引用官方源码而非中文解读转述。

仓库状态：GitHub 已认证账号 `HiAsh02`，[`HiAsh02/dev--workflow`](https://github.com/HiAsh02/dev--workflow) 为**私有、空仓库**，账号权限包含 admin/push；Google Drive `dev- workflow` 目录中的 v0.1 是本稿前版。两处是不同目的的存储，后续建议 GitHub 管源码/版本，Drive 存 Review 归档快照。

## 2. 四项目逐一剖析

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


### 2.4 Lauren Tan（poteto）/ pstack：Plugin + Skills + Playbook 的完整 Harness

**身份核验**：GitHub 一手来源是 [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/main/pstack)，作者在 README 自述为 poteto。它是工程工作流/Agent Harness，不是 Grok Bot 的官方 SDK；也不应把中文媒体称呼“Grok Bot 产品经理土豆姐”直接当作已核验职务。对本项目重要的是可检查的源码及机制，而非头衔。

**具体实现**：

1. **外层插件**：根目录 `pstack/plugin.json` 使用 Agent Plugins `1.0.0` 的 `$schema`，另有 Cursor 专属 `pstack/.cursor-plugin/plugin.json`；仓库还生成 `harness/pstack/` 给 Claude Code 读取。它证明“内容一份、宿主投射多份”的方案可行，但也显示投射层与更新同步的持续维护成本。
2. **单入口 + 23 Playbook**：用户从 `/poteto-mode` 发起非平凡任务，再按 investigation、bug-fix、feature、refactoring、perf、shipping、eval、multi-phase、session-pickup 等剧本路由。这里有明确“只读调查”与“提交/交付”差别。
3. **58 个 Skill 的分层**：其中 24 个 `principle-*` 承载简短工程约束，其他 Skill 为场景动作；还提供 `poteto-agent` 和 `comment-sicko` 两个 Agent 角色。原则与动作分层是有价值的，但一开始全量索引可能增加上下文及路由负担。
4. **并行由证据约束**：`feature` Playbook 先写阻塞步骤、独立工作流、共享状态、最小安全分解四项 throughput checkpoint；`interrogate` 通过不同评审尝试运行可复现故障，纯猜测结果不算发现。**并行不是默认目标，独立可验证才是条件。**
5. **把错误模式变成静态约束**：`correct` 明确先修改架构，其次类型/Lint/CI，再测试，最后才写文档或提示词；`reflect` 从会话中提炼真正可复用的规则，避免仅靠超长 AGENTS.md 纠错。
6. **透明能力限制**：Claude Code 适配文档将 Cursor 的 `Task`、`AskQuestion`、模型选择等转换为本地能力；明确 Cursor-only 特性应跳过并说明原因，而不是伪造“兼容”。

**独特优势**：现实的 Plugin 打包范式；多个任务的可审计路由；Spec 外的经验反馈闭环；用真实运行证据筛掉无根据的对抗评论；复杂项目可选择模型分工、原生控制工具和子 Agent。

**明显成本/风险**：

- `poteto-mode` 非平凡任务的组合规则较多；对普通修复而言可能比 Waza 更重，且有强制的专属附加 Skill，可能发生依赖缺失。
- 部分能力依赖 Cursor 的原生工具、插件、模型路由、自动化、另一套 `cursor-team-kit`；只复制 `pstack/skills/` 无法得到完整等价行为。
- 多模型 Arena/Swarm 增加花费，不能在 Codex、Antigravity、Grok、Pi 假定具备相同模型或 subagent API。
- 默认的较高自主执行和 PR 操作必须被当前用户授权矩阵覆盖；**不得把 pstack 原剧本中的发布/合并步骤自动转译为我们的默认授权。**
- 代码/测试/维护成本随 Skill 数量和剧本交叉引用增长；58 Skill 不是“更好”的天然指标。

**采纳裁决**：只采纳**入口路由、剧本化模式、可验证小单元、抗幻觉审查、结构性复盘、同一核心多宿主投射**六类机制；初版将 Playbook 压缩为 `investigate`、`feature`、`bug-fix`、`refactor`、`review`、`ship`、`resume` 和可选 `performance`，不照搬 23 剧本与可选长时自治。

## 3. 四项目交叉比较：能力、成本、冲突

| 维度 | Waza | Matt Skills | Superpowers | pstack | 建议吸收 |
|---|---|---|---|---|---|
| 优化目标 | 轻量工程习惯 | Spec/领域模型/复杂任务 | 过程可靠性 | 实战 Harness/可验证吞吐 | 分层设计 |
| 主入口 | 少量独立 Skill | 显式和模型路由并用 | Bootstrap 强触发 | 单 `poteto-mode` + Playbook | 单入口 + 直接 Skill |
| 规划 | `/think` 简洁、可扩展 | 访谈/词汇/ADR/Issue DAG | 强制脑暴、细粒度计划 | Goal→Playbook + Design/Architect/Arena | Quick 不强访谈，复杂走 Spec |
| 执行 | 宿主能力优先 | 并行任务图与子 Agent | TDD、worktree、逐项验证 | 窄单元、thruput checkpoint、子 Agent | 小步验证，按需并行 |
| Debug | 先根因再修复 | 实验/反馈回路 | 四阶段 Debug | 可复现、二分排查、实跑闭环 | 统一 Debug |
| Review | Diff/发布检查 | Spec/Standards 双轴 | 独立审核+完成验证 | 对抗式可运行发现 | 审查 + 可重跑证据 |
| 经验固化 | 行为约定和 health | ADR/Glossary/retro | 复用技能方法与诊断 | `correct` 架构→类型→Lint→测试→文档 | 结构性防回归（后续） |
| 包装 | Skill 安装+Host Plugin | Skill 和各宿主插件 | 广泛宿主适配+插件 | Agent Plugin + Cursor Plugin + Claude harness | 标准 Plugin 容器 + Skill 回退 |
| 相对上下文成本（设计推断） | 低 | 中 | 中高 | 中高、取决于 Playbook | 按风险与复杂度加载 |
| 最大风险 | 复杂流程深度不足 | Tracker/并发依赖 | 规则过强/重复批准 | 宿主耦合/组合依赖与花费 | 统一权限/验证契约 |

重要冲突不是“内容好坏”，而是同一请求会否被四种框架**重复规划或重复审核**：

- Waza 的轻量 `think`、Matt 的 grilling、Superpowers brainstorming、pstack architect/arena 都可能覆盖设计阶段。**只保留一个 `dw-design` 决策节点**；按场景选策略，不串联四轮问答。
- Matt `implement-spec` 的 DAG 并行与 pstack `swarm`/`arena` 并不等价：前者跨任务依赖，后者是**互相独立的工作分区**或**同题竞赛**。并行之前要证明无共享写冲突，避免盲目把“更多 Agent”当作吞吐提升。
- Matt 双轴 Review、Superpowers verification、pstack interrogate 有不同作用：**标准符合性、需求符合性、真实运行证据、对抗性反例**。可共享证据但不能互相替代；低风险可跳过对抗子 Agent，高风险引入。
- Superpowers 的强制“先调用 Skill”，pstack 的 `poteto-mode` 单入口、Matt 的用户显式调用、Waza 的按场景触发，若全量叠装会形成入口循环。统一由 `dw-start` 只路由一次，以“当前任务类型 + 风险 + 已有批准”判定。

**结论强度**：仓库结构、工作流要求、许可为高置信的一手事实；哪套框架实际上更高效、Token 更少、Bug 更少，尚无可复现的同任务基准，不应给出臆造的百分比分数。

## 4. Skill 还是 Plugin：标准、取舍与最终裁决

### 4.1 二者是不同层，不是互斥产品

- **Agent Skills** 定义能力如何表达：`skills/<name>/SKILL.md` 的 frontmatter、指令、脚本和参考资料；调用后仍依赖宿主的模型与工具。
- **Agent Plugins Specification v1.0.0** 定义一个可分发目录：根 `plugin.json`，固定位置 `skills/`，可选 `mcp.json`，以及受控的厂商扩展目录。v1 的**规范化可移植组件只有 Skills 和 MCP servers**；自定义 Hook、Agents、Commands 等不是通用的 v1 portable components。
- **Host-native Plugin** 例如 Cursor 的 `.cursor-plugin/plugin.json`、Claude 的 `.claude-plugin/plugin.json` 或 Pi Package，是实际宿主的安装/启动/更新机制。需要按宿主独立验证，不可把 `plugin.json` 存在等同于“四家 CLI 都原生一键安装”。

| 评估标准 | 只发布 Skills | 只发布 Host 原生 Plugins | **推荐：标准 Plugin + Skills fallback** |
|---|---|---|---|
| 通用行为内容 | 非常好 | 可能被各宿主分叉 | **一套 SKILL.md** |
| 单一 Git Repo/Tag | 支持 | 支持，产物需同步 | **支持，构建版本统一** |
| 自动升级 | 取决于安装器 | Host 支持时较强 | **有原生则原生，无则安装器** |
| 任意未列出的 Agent | 只要支持 Skill 可读 | 一般不可保证 | **保留手工 Skill 安装路径** |
| Hook / 自定义 Agent / MCP | 跨端能力不一 | 宿主专有能力更多 | **明确 Capability Gate** |
| 复杂度 | 最低 | 高（多厂商适配） | **适中，可渐进** |
| 私有 GitHub 仓库分发 | 常需鉴权克隆 | Marketplace/源安装权限取决于宿主 | **默认用用户已认证 Git，审查后安装** |

### 4.2 最终裁决与范围

**项目应被发布为一个“以 Skills 为内核的 Agent Plugin”，但绝不以 Plugin 作为运行时硬依赖。**

- 第一版就放符合 Agent Plugins v1 的根 `plugin.json`，并统一使用逻辑名称 `dev-workflow`。
- 8 个工作流 Skill 在**唯一源码目录 `skills/`** 维护；引用材料置于各 Skill 的 `references/`（打包后完整可用），复杂共用逻辑放可测试的脚本/静态规则。
- 针对真正支持 Agent Plugins v1 的具体客户端，用其原生导入；对于不支持或尚未验证的宿主，输出**同一版本**的标准 Skill 包或 Pi Package。
- 初版**不强制部署 MCP server、不注入全局 Hook、不启用自动模型路由、不在没有真实执行能力时声明支持并发**；必要时作为可选增强包。
- `plugin.json.name` **不能使用 `dev--workflow`**：规范禁止连续 `--`。仓库的 GitHub 名称可以仍是 `HiAsh02/dev--workflow`，两个名称相互独立。
- Agent Plugins v1.1 当前为工作草案；初版锁 `1.0.0`，只有稳定且宿主真支持后再考虑升级。

### 4.3 版本、安装与“开箱即用”的真实定义

**可承诺**：复制/安装后，至少能发现核心 Skill、完成只读分析/规划/本地修改与验证，不需要云端账号以外的附加服务（项目本身需要认证的不在此列）。

**不能承诺**：同一条 `plugin install` 命令适配所有 Agent；不同 Agent 都能自动触发相同技能、拥有同名子 Agent/Hook/工具、获得等价 Token 成本和完全相同输出。

私有仓库阶段优先**凭据保护的 Git Clone / 本地路径安装**；公开后的 `npx skills`、Plugin Marketplace、Grok/Antigravity/Codex 原生命令在每个目标版本做实际验证后才列为正式安装说明。安装前预览拟写路径、冲突和权限，支持 dry-run 与回滚；禁止下载即执行未知远程脚本。

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

### pstack Playbook 的选择性复用（不额外扩大公共 Skill 数量）

Playbook 是 `dw-start` 对任务的分类参考，不是 8 个 Skill 之外的另一套重复入口。首版建议纳入 `investigate`、`feature`、`bug-fix`、`refactor`、`review`、`ship`、`resume`，`performance` 可放到后续。任务已说明得很清楚时直接执行，不重复做“确认意图”仪式；风险高则先要求设计审批。

对 `ship` 明确禁止静默提交、推送、合并、部署；对 `resume` 从磁盘任务日志和 Git 状态恢复，不仅从聊天推断；对 `feature` 执行四项 checkpoint 仅在任务确需并行时触发。

## 6. 建议的 Skill 接口与职责

**第一版只设计、尚不实现** 8 个核心 Skill；均使用 `dw-` 前缀，避免与 Waza、Matt、Superpowers 和 pstack 原名冲突。

| Skill 名 | 唯一职责 | 核心输入 | 可核验产出 | 借鉴来源 |
|---|---|---|---|---|
| `dw-start` | 单入口意图/Playbook 路由、风险和授权判定 | 用户请求、项目状态 | 一次分类、模式、下一步；只读不写文件 | Waza RESOLVER、Matt ask-matt、pstack poteto-mode |
| `dw-design` | 需求歧义、备选设计、领域词汇与 ADR | 问题、已知约束、仓库设计 | 决策完整的 Design Brief；必要时 ADR/Glossary | Waza think、Matt grilling/domain-modeling、Super brainstorming |
| `dw-plan` | Spec、验收准则、纵向切片、依赖 DAG | 已批准设计、工程上下文 | `spec.md`、任务清单、阻塞边、验证计划 | Matt to-spec/to-tickets、Super writing-plans |
| `dw-build` | 按计划实现；TDD/测试、独立小单元、能力降级 | 已批准任务、可用工具 | 修改文件、测试证据、任务进度日志 | Matt implement/implement-spec、Super executing-plans、pstack feature |
| `dw-debug` | 重现症状、定位根因、回归保护 | 缺陷、日志、过去正确状态 | 有证据的根因、测试/修复建议；写入需授权 | Waza hunt、Matt diagnosing-bugs、Super systematic-debugging |
| `dw-review` | Spec/Standards 双轴 + 真实运行证据；高风险可选对抗评审 | Diff、标准、验收项、命令输出 | 有严重等级、复现步骤的发现与未解决项 | Matt code-review、Waza check、Super verification、pstack interrogate |
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

**可选后续增强**：`dw-correct`（从重复 Agent 失误中提炼可执行架构/类型/Lint/测试规则）和 `dw-eval`（在有限场景集回放提示/模型/宿主变动）。这两项最值得吸收 pstack，但第一版不增加用户必须记忆的入口。

**强制跨 Skill 不变量**：不伪造测试、不可泄露凭据、不得自动执行下载的未知脚本、不得清理用户未提交的改动、不得把网页/Issue 的提示注入当成控制指令、不能未经授权 Push/Release/Delete。

## 7. 技术架构：单一核心、标准 Plugin、薄宿主投射

```text
                      自然语言任务 /dw-start /dw-debug 等
                                   │
                  路由器（意图 + Playbook + 风险 + 当前授权）
                                   │
                       唯一真源 skills/*/SKILL.md
                                   │
           ┌───────────────────────┼───────────────────────┐
       轻量 Quick             标准 Standard            严格 Rigorous
           └───────────────────────┼───────────────────────┘
                                   │
                 能力探测（Shell、Git、Tests、MCP、Subagent）
                                   │
            结构性检查 + 授权门槛 + 可重跑证据 + 任务状态日志
                                   │
        ┌──────────────────────────┴───────────────────────┐
        │                                                  │
  portable Agent Plugin                             legacy / fallback
  root plugin.json + skills/                        同一 skills 源码导出
        │                                                  │
  宿主原生发现/安装（支持时）                       Pi Package / 项目级 Skills
        └──────────────────────────┬───────────────────────┘
                     Codex / Antigravity / Grok Build / Pi / ...
```

**建议目标目录（尚未实现）**：

```text
HiAsh02/dev--workflow/                  # GitHub repository（双连字符）
├── plugin.json                         # Agent Plugins 1.0.0；name=dev-workflow
├── README.md
├── LICENSE
├── CHANGELOG.md
├── skills/                              # 唯一可编辑流程真源
│   ├── dw-start/SKILL.md
│   ├── dw-design/SKILL.md
│   ├── dw-plan/SKILL.md
│   ├── dw-build/SKILL.md
│   ├── dw-debug/SKILL.md
│   ├── dw-review/SKILL.md
│   ├── dw-ship/SKILL.md
│   └── dw-handoff/SKILL.md
├── packages/                            # 生成/映射的宿主安装元数据
│   ├── claude-plugin/                  # 仅在通过该宿主测试后生成
│   ├── cursor-plugin/                  # 可选
│   └── pi/                             # Package metadata（可选）
├── scripts/                             # 安装/验证/版本同步（确定性代码）
├── tests/{contract,safety,scenario,integration}/
├── docs/
│   ├── architecture.md
│   ├── compatibility.md
│   ├── provenance.md
│   ├── decisions/
│   └── research/                        # 四框架研究快照
└── .github/workflows/                   # 实施批准后 CI
```

符合 v1 规范的**示意元数据**（非已创建的代码）：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "dev-workflow",
  "version": "0.1.0",
  "description": "Portable software engineering workflows for coding agents",
  "repository": "https://github.com/HiAsh02/dev--workflow"
}
```

**关键工程注意**：

1. Agent Plugins v1 严格限定 `plugin.json` 顶层字段：不能往根里写 `skills`、`agents`、`hooks` 等宿主专用字段。Skill 由固定 `skills/` 目录发现，MCP 的 portable 声明（未来如果需要）是根目录 `mcp.json`，而非内嵌在 `plugin.json`。
2. pstack 的 `.cursor-plugin/plugin.json` 含 `skills`、`agents` 等 Cursor 专用字段；**不可直接复制粘贴作为跨端标准 `plugin.json`**。这些应是明确受宿主支持的投射清单。
3. 不把 `shared/` 作为安装后 Skill 一定可见的全局路径；可引用资源置于每个 Skill 的 `references/`，需要共享时由版本化构建过程复制，配套 hash/同步检查。
4. 避免安装器默认覆盖用户改写过的 Skill 或规则；比较清单、备份/回滚、版本锁与 dry-run 必须是安装/升级器的设计验收。
5. 一般任务首选宿主自己的 Git/Shell/文件工具，不额外引入后台 MCP server。若后续增加远端 Issue Tracker、评测或任务协调，通过可选 `mcp.json` + 权限隔离实现。
6. 规范的目录内路径限制不等于完全沙箱：Skills 中的脚本以及 MCP 子进程仍按本机授予的实际权限运行，必须独立做供应链审核和安全测试。

## 8. 跨 Agent 分发与兼容性：真实可行性矩阵

“支持 Agent Plugins 标准”不等于“支持全部组件/支持统一命令”；以下区分**官方文档确认**与**本机尚未验证**。

| 目标宿主 | 现有标准支持/官方线索 | 首选交付 | 故障退路 | 本机状态 |
|---|---|---|---|---|
| **Codex (CLI/App)** | Agent Plugins 官方兼容客户端列表收录 ChatGPT & Codex，支持 Skills 与 stdio/Streamable HTTP MCP | `plugin.json` + `skills/` 的标准 Plugin；按实际 Codex 版本安装 | 直接用 `skills/` / `.agents/skills/` | **未安装测试** |
| **Google Antigravity (App/CLI)** | 兼容客户端列表收录 Google Antigravity，支持 Skills 与 MCP；Superpowers 给出 `agy plugin install` 案例 | 原生 Plugin（支持时） | 工程目录的标准 Agent Skills | **未安装测试** |
| **xAI Grok Build CLI** | Grok Build 官方文档明确支持 `.grok/skills`、`.agents/skills` 和来自 Plugin 的 Skills | 对目标 `grok` 版本实测 Plugin 后原生安装 | 单独投射到 `.grok/skills` 或受支持的 `.agents/skills` | **未安装测试** |
| **Pi coding agent** | Pi 原生 Skills 和 Package 模型；不是所有“Agent Plugins 官方兼容客户端”列表中的承诺对象 | 如果识别 v1 Manifest 则原生 Plugin；否则生成 Pi Package | `.pi/skills` 或 Pi 文档要求的其他发现目录 | **未安装测试** |
| **Grok Bot（额外扩展）** | Agent Plugins 兼容客户端列表单独列出 Grok Bot，支持 Skills 与 MCP；与 Grok Build CLI 不同产品 | 若未来用户要求 Grok Bot，单独测试其导入与权限 | 独立 Skill / MCP 方案 | **不纳入第一轮硬门槛** |
| **Claude Code / Cursor** | pstack、Superpowers 等证实两者有原生 Plugin 管理路径 | 标准 Plugin + 宿主投射元数据 | 直接 Skill 目录 | **次优先验证** |

**兼容性声明的最低标准**：对每一个明确的产品及版本，记录 `version`、`install`、`discover`、`invoke`、`upgrade`、`uninstall`、`conflict`、`permissions` 八项结果。只有跑过的标“验证通过”；资料支持但未测试的标“预计支持”。尤其不可把 Grok Bot 的 Plugin 兼容认证套用于 Grok Build CLI。

**分发顺序**：

- **P1 同时产出规范 Plugin + 完整 Skill 源码**：打包不依赖复杂安装器，使四宿主至少可通过手动路径被加载。
- **P2 实测目标 CLI 原生导入**：哪家支持规范 Plugin 就用原生安装；否则输出可审计的复制/链接安装方案，不能假装 native plugin 支持。
- **P3 才提供私有 Git 仓库的升级器**：采用固定 commit/tag、用户的 SSH/PAT 权限、更新 diff、回滚；审查后方可考虑公开 Marketplaces。

**私有仓库条件**：`HiAsh02/dev--workflow` 当前是 Private。某些公开的 Skills CLI 或 Marketplace 不能匿名安装 private repo；首版不能宣称用户可以无认证 `npx skills add HiAsh02/dev--workflow` 成功。优先 GitHub 私有授权下的本地检出 / 本地路径导入，之后再验证 Registry/市场发布。

## 9. 工作流状态、上下文与权限

**引入 pstack 的结构性记忆改进，但不拷贝隐私会话日志**：重复出现的错误先搜寻代码形状、TypeScript 类型、Lint、CI 和测试能否成为确定性防线；只把不能由工具表达的工程判断写进 Skill 文字。审计与复盘要脱敏并限定当前项目范围。

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
| 安装到 4 种宿主 | 每种宿主记录版本、发现、调用、更新、卸载、冲突、权限、基本工作流测试；分别评测 Plugin 和 Skill fallback |

**新增 Plugin 格式 Gate**：根 `plugin.json` 必须通过 Agent Plugins v1.0 Schema；`name=dev-workflow`，不能是 `dev--workflow`；仅在客户端明确支持时生成宿主专用 manifest。

**首版交付 Gate**：Skill 格式校验通过；上述安全场景无违规；四种目标宿主的真实冒烟结果逐一记录（未测试即标注未验证）；`install --dry-run` 的结果与实际变更相符；升级后不会意外覆盖用户修改过的文件；许可证与来源清单完整。

**证据保存原则**：测试日志只存可复核摘要与最小必要命令，不采集个人凭据、完整环境变量、私人仓库内容。敏感日志需先脱敏。

## 11. 版本管理、上游同步与供应链

- **GitHub 为版本事实源**：`main` + release tag + changelog；`VERSION` 统一表示打包版本。采用 SemVer：Major = 行为/流程契约变更；Minor = 增加兼容能力或可选 Skill；Patch = 修复或文字消歧且无破坏行为。对 Prompt 行为变化需用 Eval 判断是否实际上破坏兼容。
- **上游不做热更新**：记录采纳思想对应的 repo、SHA、来源文件、采纳原因、修改范围，定期比较但通过人工 Review 才升级；避免 `main` 上游变动直接污染已安装技能。
- **可溯源性**：如果直接复制实质性代码或文本，分别保留 Waza、Matt、Superpowers、pstack 对应 MIT 许可、版权声明和归属；如果仅借鉴设计模式，也在 `docs/provenance.md` 给出来源链接。不应把原作者原文标成自创。
- **CI**：校验格式、内部链接、版本一致、打包产物、权限案例和适配器快照。发布前把 Markdown、适配产物、校验和锁定同一 tag；提供回滚命令和可验证差异。
- **无强制遥测、无外部后台服务**：首版应可以完全离线读取 Skill，联网只发生在任务本身需要且宿主已允许时。

## 12. 执行路线与 Gate（全部待 Review，未实施）

| 阶段 | 内容 | 完成判定（尚未发生） |
|---|---|---|
| **P0：调研与决策（当前）** | 四项目源码剖析、规范、方案、实际仓库和 Google Drive 归档 | 本 v0.2 文档获得用户 Review；确认首版范围与名称 |
| **P1：最小可安装包** | 8 核心 Skill，根 `plugin.json`（Agent Plugins 1.0）、最少 Playbook 与手动 Skills fallback、静态安全约束 | Schema/Skills-ref 校验通过；无宿主专属硬依赖 |
| **P2：四宿主真实验证** | Codex、Antigravity、Grok Build CLI、Pi 的原生 Plugin/Skill fallback 发现、调用、更新、回滚、权限测试 | 每家各保留一份版本与安装证据；未通过则公开标注限制 |
| **P3：流程质量与打包发布** | 场景 Eval、可运行验收脚本、Git Tag、Release、可选 Pi Package/宿主适配、更新器 | 风险用例回放、版本一致、升级可回退；由用户批准发布 |
| **P4：学习闭环** | 采纳 pstack `correct`/`reflect` 的结构性纠错与对抗审查，按真实需求添加进阶能力 | 规则可重跑，重复 Bug 有阻断机制，不引入默认高成本依赖 |

**首轮优先级**：P1 到 P2 只验证“相同核心行为能否在 4 家可靠安装与使用”。强制对抗式多模型评审、自动 PR 合并、长时间自治运行、全自动 Hook 注入等不列为首版默认能力。

**安全例外**：一个原始请求仅授权调研/代码审查，不能让 `dw-ship` 自行推送；审查通过后本次仍不包含任何安装或修改 Agent 全局配置的授权。

## 13. 既有 GitHub 仓库核验与名称约束

经连接的 GitHub 工具读取，**仓库已存在**：

| 属性 | 实际状态 |
|---|---|
| 账号 | `HiAsh02` |
| GitHub 仓库 | [`HiAsh02/dev--workflow`](https://github.com/HiAsh02/dev--workflow) |
| Visibility | **private** |
| 默认分支 | `main`（仓库尚为空） |
| 连接权限 | `admin=true`, `push=true` |
| 已提交内容 | **尚无文件与提交**；本轮未写入 |
| Plugin 内部逻辑名 | **建议 `dev-workflow`（一个连字符）** |

**差异说明**：`dev--workflow` 是真实 GitHub Repo 名；规范 Agent Plugin `name` 禁止两个连续连字符，所以目录/仓库名称无需被强制改名，但 `plugin.json.name` 要用 `dev-workflow`。原先 v0.1 中“尚未建 Repo、需要去 GitHub/new 创建”的说明已作废，请勿再执行重复建仓。

**接下来**：评审确认后在这个**现有**仓库创建 root `plugin.json`、`skills/`、`README.md` 与研究/决策目录，而不是另建 `dev-workflow` 仓库。若将来用户希望 GitHub Repo 名和 Plugin 名统一，可单独计划 rename 及远端 URL 迁移，但**此刻没有必要**。

## 14. Review 时需要确认的四项决策

推荐默认值如下，除非你明确调整：

1. **产品形态**：保留 `SKILL.md` 唯一源码，并从第一版提供 Agent Plugins v1.0 规范 `plugin.json`；受限制的 Agent 提供手动 Skill / Package fallback。**不做四套独立流程实现**。
2. **复杂度**：维持 8 核心 Skill 和 `quick/standard/rigorous`；采纳 pstack Playbook 的路由思想，但初版最多 6~8 剧本，避免默认部署 58 个 Skill。
3. **权限/质量**：非平凡设计有批准 Gate；任何完成声明必须有可重跑证据；Push/Merge/Publish/Delete 均需当前请求有效授权；高风险变更可选独立对抗 Review，但不把子 Agent 当强制前置。
4. **分发范围**：第一轮重点 Codex、Antigravity、Grok Build CLI、Pi；Grok Bot 可留在第二轮；保持 GitHub 仓库 `HiAsh02/dev--workflow` 私有，先用受权 Git/本地路径分发，待真实运行测试通过再考虑公开插件市场。

**风险最高的假设**：这些宿主支持标准 Skill，并不意味着它们都支持 Agent Plugins v1 原生安装。如果实际调查中某个目标客户端不支持标准 Plugin，必须退回完整 Skills 包或 Pi Package；这并不推翻核心方案，只影响安装层和用户体验。

**停止条件**：若首版在任一目标 CLI 上必须依赖无法移植的工具或特定模型才能完成普通 `quick`/`standard` 任务，则说明内容与宿主没有充分解耦，应修改核心 Skill，而不是继续叠加适配器。

## 15. 原始资料索引（优先一手来源）

### 源仓库与实现

- Waza： https://github.com/tw93/Waza/tree/355b9dc7e16a6cec2df519d26702a9400de988da
- Waza Resolver： https://github.com/tw93/Waza/blob/355b9dc7e16a6cec2df519d26702a9400de988da/skills/RESOLVER.md
- Waza think/hunt/check： https://github.com/tw93/Waza/tree/355b9dc7e16a6cec2df519d26702a9400de988da/skills
- Matt Skills： https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa
- Matt to-spec / to-tickets / implement-spec / code-review： https://github.com/mattpocock/skills/tree/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/engineering
- Superpowers： https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7
- Superpowers testing / planning / agent implementation： https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7/skills
- **pstack 官方源**： https://github.com/cursor/plugins/tree/main/pstack
- pstack README（安装与模式表）： https://github.com/cursor/plugins/blob/main/pstack/README.md
- pstack 根 Plugin Manifest： https://github.com/cursor/plugins/blob/main/pstack/plugin.json
- pstack Cursor Plugin Manifest： https://github.com/cursor/plugins/blob/main/pstack/.cursor-plugin/plugin.json
- pstack 统一入口： https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md
- pstack Feature Playbook： https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/feature.md
- pstack Bug Fix Playbook： https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/bug-fix.md
- pstack Interrogate： https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/SKILL.md
- pstack Correct： https://github.com/cursor/plugins/blob/main/pstack/skills/correct/SKILL.md
- pstack Claude Code 适配： https://github.com/cursor/plugins/blob/main/pstack/docs/harness/claude-code.md
- pstack MIT License： https://github.com/cursor/plugins/blob/main/pstack/LICENSE

### 标准、宿主和已验证文档

- Agent Skills Specification（SKILL.md 与 progressive disclosure）： https://agentskills.io/specification
- Agent Plugins v1.0.0 Specification（plugin.json、components、extensions）： https://agent-plugins.org/specification
- Agent Plugins 支持客户端目录： https://agent-plugins.org/compatible-clients
- 标准示例仓库： https://github.com/agentplugins/agent-plugins-example
- Google Antigravity： https://antigravity.google/docs/skills
- Grok Build CLI： https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md
- Pi Agent Skills： https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md
- 现有私有 Repo： https://github.com/HiAsh02/dev--workflow

### 证据/限制声明

- **高置信度**：四个仓库本次已读取的目录、Skill 文本、Manifest、许可，Agent Skills 与 Agent Plugins v1.0.0 的规范事实。
- **中高置信度**：公开宿主文档的安装路径/可支持能力（会随软件版本变动，尚未经目标设备运行）。
- **尚未证明**：跨四个目标 Agent 的真实安装和交付体验、成本、性能优势、子 Agent 调度成功率、用户本地环境配置。
- **不纳入客观证据的数字**：中文媒体转述或作者自述的 Grok Bot/PR 吞吐数字，没有独立测得的共同基准，不能用于保证产品效果。

---

## 修订记录

| 版本 | 日期 | 变化 |
|---|---|---|
| `0.1.0-draft` | 2026-11-15 | 三项目调研；Skills 主导、Plugin 计划后置；仓库待创建 |
| `0.2.0-draft` | 2026-11-15 | 加入 Lauren Tan pstack；对比四项目；正式采用 Agent Plugins v1.0 为初版分发容器、Skills 为核心；确认真实私有仓库 `dev--workflow`；补充兼容性、权限、版本与 Review 决策 |

> **Review 状态：未获实施批准。此文仅限调研及技术设计，不代表任何具体宿主已通过测试。**

