# dev-workflow：中英双语与安装选语言实施方案

> **文档性质**：可交给开发 Agent 的增量实施契约；附带已译简体中文资源，不代表 GitHub 仓库已完成集成。
>
> **基线仓库**：`HiAsh02/dev-workflow`（Private），`main` 固定 SHA `ae0343fa7271647168a41bf720410d1e14c29e98`，核验日期 2026-11-15。
>
> **本次提供的翻译资产**：8 个 `SKILL.md`、7 个 Playbook、1 个 `routing.md`、7 个模板（其中 `run-state.json` 保留所有机器字段/枚举）、1 个中文版 `README.zh-CN.md`。
>
> **授权边界**：当前交付仅为本地和 Drive 中的翻译/方案资料；**没有提交或推送 GitHub**。开发 Agent 的实际仓库修改、提交和远程推送按其收到的当前用户授权执行。

## 1. 实施目标与不变条件

1. 原有英文版完整保留，**不是中文替换英文**；简体中文只翻译自然语言说明，不重写业务流程或安全规则。
2. 源仓库两套资源同时存在，但**单个安装目标只启用选定语言的一套同名 `dw-*` Skills**。不可直接在同一个被宿主扫描的 `skills/` 下放两个同名 Skill。
3. **以后每次首次安装之前，由执行安装的 Agent 主动提示**：`请选择 Skill 语言：① 简体中文（zh-CN）② English（en）`。在用户选择前不得写入安装目标。
4. CLI 在交互式终端提供同样的语言选择（双语提示）；自动化/非交互环境必须显式传 `--language en` 或 `--language zh-CN`，不能静默猜测。
5. 已有安装执行 `update` 时，若没有要求切换语言，则沿用账本中的原语言；`list` 要显示语言；`uninstall` 和 `recover` 以账本/事务记录确定语言，不重复询问。**切换语言需要明确选择与改动预览**。
6. 保持 `name: dw-start` 等八个机器标识、`license: MIT`、`READ`/`LOCAL_EDIT`/`LOCAL_COMMIT`/`REMOTE_WRITE`/`DESTRUCTIVE`、状态名、命令、目录、链接目标和 JSON Schema 字段不变。
7. 不做运行时自动翻译；英文与中文两个版本均须可离线被宿主发现，安装后的 Skill 消费不要求 Node.js 运行时。
8. 已存在的 no-clobber、用户修改保护、事务恢复与跨宿主共享引用规则必须同等覆盖中文和英文安装。

## 2. 推荐仓库结构

```text
dev-workflow/
├── plugin.json                    # 既有标准 manifest
├── skills/                        # 既有英文 canonical Skills（保持不动）
│   ├── dw-start/SKILL.md
│   ├── dw-start/references/routing.md
│   ├── dw-start/references/playbooks/*.md
│   └── dw-{design,plan,build,debug,review,ship,handoff}/SKILL.md
├── locales/
│   └── zh-CN/
│       ├── skills/                # 同名 Skills 的直接中文译本
│       │   ├── dw-start/SKILL.md
│       │   ├── dw-start/references/routing.md
│       │   ├── dw-start/references/playbooks/*.md
│       │   └── dw-{design,plan,build,debug,review,ship,handoff}/SKILL.md
│       └── templates/             # 中文工作产物模板
├── templates/                     # 既有英文模板（保持不动）
├── README.md                      # 既有英文 README
├── README.zh-CN.md                # 中文 README
├── docs/
│   └── BILINGUAL_IMPLEMENTATION_PLAN.md
├── lib/                             # 既有安装器、状态和校验模块
└── tests/
```

**实现要点**：`skills/` 的英文数据结构保持不变，中文镜像放在不被宿主默认扫描的 `locales/zh-CN/skills/`。向 Codex、Grok Build、Pi、Antigravity 安装时，统一把选定语言映射成宿主期待的 `skills/dw-*/SKILL.md`，**目标目录不应出现 `dw-start-zh` 或两个 `dw-start`**。

## 3. 翻译范围与术语规则

| 文件类别 | 英文来源 | 中文镜像 | 翻译范围 |
|---|---|---|---|
| 核心 Skills（8） | `skills/dw-*/SKILL.md` | `locales/zh-CN/skills/dw-*/SKILL.md` | YAML `description`、正文标题及说明；不改 `name`/`license` |
| Playbooks（7） | `skills/dw-start/references/playbooks/*.md` | 对应中文镜像目录 | 全部自然语言；保留 Playbook key 和链接 |
| 路由规则（1） | `skills/dw-start/references/routing.md` | 同目录中文镜像 | 意图、模式、风险说明；保留机器值与链接 |
| 模板（7） | `templates/*` | `locales/zh-CN/templates/*` | 自然语言文字；`run-state.json` 键、枚举和 Schema 保持不变 |
| 项目 README | `README.md` | `README.zh-CN.md` | 中文化用户指引；版本、兼容性状态须与事实同步 |

**不翻译机器关键字**：例如 `dw-build`、`SKILL.md`、`mode`、`blocked_by`、`file:line`、`not_run`、`PASS`、`CHANGES_REQUESTED`、`BLOCKED`、`STATIC`、`LIVE_LLM`、`README.md`、CLI 命令及权限等级。翻译正文时可以在中文术语后保留英文括注。

**兼容性适配**：现有 `lib/skills.mjs` 的验证器强制英文段落标题（`Purpose`、`When to use` 等）。必须改为按 locale 检查对应结构；中文标题使用 `目的`、`适用场景`、`不适用场景`、`输入`、`能力要求`、`执行步骤`、`输出`、`失败处理与降级策略`、`授权`、`验证`。不要简单关闭标题校验；两个版本都需要结构和本地链接验证。

## 4. 安装时语言选择契约

### 4.1 Agent 主动提示

以下提问属于**每次首次安装必需的用户选择**，不是安装器根据系统语言自动猜测：

> 准备安装 dev-workflow。请选择使用语言：
>
> 1. **简体中文（zh-CN）**：Skill 指令、执行手册和模板使用中文。
> 2. **English（en）**：使用原英文版本。
>
> 两个版本能力和安全规则应保持一致。安装目标只会启用其中一种语言。请回复 1 或 2。

选择得到确认后，Agent 才能运行 `install --language zh-CN|en`（先执行 `--dry-run`）。安装 Agent 不应以用户在聊天中使用中文、系统 locale 或历史偏好代替**本次明确选择**。

### 4.2 CLI 接口

```bash
node bin/dev-workflow.mjs install --host codex --target /work/repo --language zh-CN --dry-run
node bin/dev-workflow.mjs install --host codex --target /work/repo --language zh-CN
node bin/dev-workflow.mjs update --host codex --target /work/repo
node bin/dev-workflow.mjs list --target /work/repo --format json
```

- `install`：`--language` 的允许值严格为 `en`、`zh-CN`。交互式 TTY 且未传入该参数时先询问；非 TTY 必须失败，返回明确错误和可用选项。
- `install --dry-run`：允许用户先选择语言，然后只计算计划，不产生文件或账本变更。
- `update`：默认沿用已安装语言；没有账本时当作新安装并遵守选语言规则。显式切换语言时显示完整预览、差异及共享消费者。
- `list`：每条记录输出 `language`，旧账本缺省解释为 `en`，不得默认解释为中文。
- `uninstall` / `recover`：根据历史账本及 WAL 选择语言，无需重新选择；遇到未知语言或缺少所需历史资源时保守拒绝写入并保留现场。
- `doctor`：不需要语言选择。

### 4.3 非交互执行与原生安装限制

GitHub Actions、IDE Agent 的工具调用、子进程或无 TTY 的安装往往无法弹出 CLI 提问。**Agent 必须先在对话中询问，再传 `--language`**。如果用户跳过本仓库 CLI，直接执行 `grok plugin install <path>`、`pi install <path>` 或其他宿主原生安装命令，原生命令本身不会自动实现项目定义的问答：应由 Agent 先询问，再构建/选择相应语言的标准 Plugin/Package 目录，随后调用原生命令。不可声称能控制所有第三方 Agent 或 CLI 的提示行为。

## 5. 数据结构与安全要求

1. `buildInstallPlan` / `applyInstallPlan` 增加 `language` 维度，来源固定：`en` → `skills/`；`zh-CN` → `locales/zh-CN/skills/`。`plan.source_file_set`、`package_digest`、每个 SHA 均针对所选语言。
2. Ownership ledger 持久记录 `language`；对原有 `schema_version: 1/2` 无语言字段的记录，以**英文**兼容读取，写入新字段/新版本时完成明确迁移。
3. WAL 保存 `language` 和准确源包身份；恢复不能依赖猜测当前仓库的语言，也不能因切换语言而失去旧备份的验证基础。
4. **跨宿主共享目录不能静默混用语言**。Codex 与 Grok Build 同时使用 `.agents/skills/` 时，首次第二宿主安装若所选语言与既有安装不一致，应 `CONFLICT`，不得因 `--upgrade-shared` 一项标志就将所有消费者语言改写。至少要求用户明确授权“切换所有受影响宿主为 zh-CN/en”，展示受影响消费者，且在原子事务中更新全部文件集合与账本。首版更简单的保守方案：**不支持共享目录的跨语言就地切换，只支持卸载所有受影响消费者后重新安装**。
5. 预存完全同内容但没有归属的文件仍然不得自动认领；存在用户修改时必须保护。切换语言时如目标有不同内容，须以明确语言迁移语义处理，不得绕过原来的 no-clobber 规则。
6. CLI 计划-执行间必须复核归属记录的版本/摘要，尤其不能在计划生成后其他宿主加入时继续执行旧的语言/共享判断。此项同时关闭上一轮 Review 的 R4-01。
7. `readOwnership` 与 `listInstalledPackages` 应向用户公开当前语言，但不得将该字段当作权限证明。

## 6. 打包与宿主分发

- **源码**：英文和中文的并存不会改变宿主直接读取 `skills/` 时使用英文这一事实。
- **从本项目 CLI 安装**：根据选择只复制一个语言的 8 个 Skill/7 个 Playbook 到宿主既定的 `skills` 目录，`mode=plugin` 同理产生标准 `plugin.json + skills/` 布局。
- **从原生插件/包命令安装**：维护者必须能生成两个标准的、互不冲突的**语言特定产物**，内部目录都仍是标准 `skills/`，而不是在同一插件内暴露重复的同名 Skill。建议输出：

```text
dist/dev-workflow-<version>-en.zip
dist/dev-workflow-<version>-zh-CN.zip
```

- 使用同一规范的 Plugin ID `dev-workflow`，若需要同一宿主同时安装两种语言则属于**另一个需求**，当前不支持。
- `scripts/package.mjs`、`scripts/check-source-sync.mjs` 应对两个语言产物分别计算 SHA-256，验证 ZIP 解包内容及严格白名单；不要仅验证英文。
- `package.json` 中 `pi.skills` 目前指向 `./skills`，直接通过根仓库运行原生 Pi Package 命令会拿到英文版。必须在两种语言的分发包中把各自所选资源映射到包内 `skills/`，并在 README 明确标注。

## 7. 增量开发任务 DAG

| 任务 | 需修改或新增文件 | 依赖 | 验收门槛 |
|---|---|---|---|
| **L0：对齐基线** | `AGENTS.md`（若需要记录新约束）、`docs/BILINGUAL_IMPLEMENTATION_PLAN.md` | 无 | 核对最新 SHA 与现有测试；不得套用过期行号 |
| **L1：加入语言资源** | `locales/zh-CN/skills/`、`locales/zh-CN/templates/`、`README.zh-CN.md` | L0 | 8/7/1/7/1 文件齐全；英文源码原封不动 |
| **L2：校验两语言** | `lib/skills.mjs`、`scripts/validate.mjs` | L1 | 前置 YAML、名称、章节、相对链接、Skill 集合及可移植性双语验证通过 |
| **L3：安装器语言选择** | `bin/dev-workflow.mjs`、`lib/install-plan.mjs` | L2 | 提示、非 TTY 拒绝、显式语言、安装/更新/卸载列表、无写入 dry-run |
| **L4：存储与共享安全** | `lib/install-plan.mjs`、相关 Schema、`tests/install/*` | L3 | 记录语言，旧版默认为 en，跨宿主语言冲突拒绝、计划账本 TOCTOU 检测 |
| **L5：语言特定打包** | `scripts/package.mjs`、`scripts/check-source-sync.mjs`、相关 Manifest/Package 配置 | L2、L4 | 两种语言独立包均符合标准宿主目录布局和内容哈希校验 |
| **L6：文档、真实运行验证** | `README.md`、`README.zh-CN.md`、`docs/COMPATIBILITY.md`、测试、CI | L3、L4、L5 | GitHub Actions 双系统验证、实际安装发现、语言切换/共享测试，未测宿主仍标 `NOT_TESTED` |

最小回归测试必须覆盖：

1. **L-01** 两语言各有 8 个有效同名 Skill、7 Playbook；链接不越界；英文源码 SHA 未变。
2. **L-02** 安装 `--language zh-CN` 后，目标 `dw-start/SKILL.md` 是中文且没有英文重复副本；`en` 同理。
3. **L-03** 无 TTY、未指定语言时 `install` 明确报错，且没有写入；TTY 时双语提示并可通过 1/2 选择。
4. **L-04** `--dry-run` 无任何目标文件、账本、Git index 或配置变动。
5. **L-05** 旧英文安装 update 保持英文，无需重复询问；`list` 显示 `en`。
6. **L-06** 切换语言须显式请求，发现本地修改时拒绝覆盖，且可以正确卸载所选版本。
7. **L-07** Codex 已装英文时，Grok 选择中文安装到共享根必须冲突；不得静默改写现有宿主 Skill。
8. **L-08** 生成两语言 ZIP，解包后分别包含唯一的 8 个 Skill，语言正确、`plugin.json` 校验通过，ZIP 和 source-sync 哈希通过。
9. **L-09** 强制中断后恢复不改变语言、不会删除用户文件；账本与 WAL 语言不一致时 fail-closed。
10. **L-10** 英文、中文安装在当前可测宿主中均可发现；无法在真实 LLM 环境调用时标记 `NOT_TESTED`，不能虚报。

至少运行（以开发 Agent 的实际输出和退出码为准）：

```bash
npm ci
npm run validate
npm test
npm run test:safety
npm run test:scenario
npm run test:eval
npm run pack
npm run verify:dist
```

在 CI 中至少包括 Linux 和 Windows；所有破坏性、SIGKILL、跨宿主互相安装/卸载只在临时沙盒内完成。

## 8. 关于第四轮 Review 的风险判断：避免无必要的过度工程化

上一轮 R4 Review 中影响真实工程的 4 个技术问题不能一概叫“过度防御”：

| 问题 | 是否真实缺陷 / 使用条件 | 对日常开发的影响 | 建议处置 |
|---|---|---|---|
| **R4-01：计划与 ownership 账本的 TOCTOU** | **真实正确性风险**；计划生成后同一共享目标出现另一宿主安装或版本变更 | **间接但重要**：可能在并发/交错安装时绕过授权或破坏共享内容；单宿主单次安装通常不触发 | **P1 必修**，利用现有 `.apply.lock` 锁内复核账本摘要/版本和消费者集合；不必引入分布式锁 |
| **R4-02：恢复依赖当前仓库的 Canonical Manifest** | 恢复历史/自定义 `--source` 时可能找不到当初的文件；偏向恢复可用性 | **低频、异常路径**；不影响已安装 Skill 正常工作，但崩溃后可能需要人工修复 | **P2**：先确保 fail-closed + 备份不丢失；若承诺自动恢复旧包，再引入不可变历史包清单 |
| **R4-03：本地 WAL 被篡改的信任问题** | 攻击者已能改写 workspace 账本的前提下，恢复可受伪造状态影响 | 正常可信单人仓库场景**较低概率**，但执行 `recover` 涉及删改文件，后果可能严重 | **P2**：保持严格路径、允许操作清单、文件哈希和冲突拒绝；不建议为了本地篡改而无边界追加复杂签名或远端服务 |
| **R4-04：卸载依赖当前源码文件集合** | 新版本不再包含旧文件时，卸载可能保留旧版受管文件 | 一般**不会破坏代码开发**；更可能造成残留、升级冲突和清理成本 | **P2**：优先保留旧文件不误删；可加入按安装快照的保守卸载机制，暂不需要完整历史包管理系统 |

另有 **R4-05 文档、版本及兼容性证据滞后**：属于发布透明度/维护性问题，而非直接使 Agent 编码失败的运行缺陷。正式发布时应处理，内部 Beta 可如实标注限制。

**采用风险分层，不再无限叠加防御**：

- **必须守住的边界**：不越权、不覆盖已有用户数据、不静默混用共享 Skill、真实可验证的安装文件归属、不伪称已通过测试。该层属于正确性合同，值得保留。
- **允许按产品范围延后**：对任意旧版本、任意第三方篡改、任意断电时点的完全自动无损恢复；可先保留 journal/备份并阻止写入，明确提示人工处理。
- **不建议当前引入**：远程协调服务器、分布式锁、完整多版本数据库、签名基础设施或多个同名 Skill 的运行时动态切换；这些会明显增加复杂度，却未体现当前真实使用收益。

**优先级建议**：先解决 R4-01（与双语共享安装存在直接关联），随后交付双语资源、语言选择及两语言验证，再按照实际用户是否常用旧版本、自定义包和恢复能力判断 R4-02～04 的实现深度。

## 9. 可直接交给开发 Agent 的指令

```text
项目：HiAsh02/dev-workflow
资料：本文件 BILINGUAL_IMPLEMENTATION_PLAN.md + dev-workflow-zh-CN-overlay.zip
任务：在保留现有英文功能的前提下，新增简体中文版本，确保用户首次安装时明确选择 zh-CN 或 en。

在动手前先拉取最新 HEAD 并运行既有校验。合并 overlay 中 8 个中文 SKILL.md、7 个中文 Playbook、routing.md、7 个模板与 README.zh-CN.md。不得更改英文原文，除非修复一个已确认的英文原版错误且另获任务授权。

按 L0-L6 实现安装器 --language、Agent 安装前双语提示、非交互显式选择、ownership/WAL 语言记录、跨宿主不同语言冲突保护、两语言验证及分发包。Skill name、机器枚举和授权规则必须保持完全一致。请特别修复 R4-01 的共享账本计划-执行竞态。

使用隔离临时目录进行安装/卸载/故障注入测试，禁止碰触用户真实 Agent 的全局安装文件。给出具体改动清单、测试命令与退出码、当前 SHA、未验证的宿主和回滚路径。当前交接资料不独立授权 GitHub push/merge/release，以用户给你的当轮授权为准。
```

## 10. 验收与实施边界

- 本包已完成中文自然语言内容的人工翻译与文件归档；**不包含对既有 GitHub 安装器、验证器、打包器的源代码修改**。
- 译文需在集成后由 CI 与真实宿主再次验收；目前不能声称中文版本已在 Codex、Antigravity、Grok Build CLI、Pi 四端运行通过。
- 如果开发 Agent 执行时 HEAD 已改变，必须重新对照当前源码；不能机械按本文件的旧路径或旧测试状态覆盖新代码。
