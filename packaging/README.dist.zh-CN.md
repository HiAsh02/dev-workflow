# dev-workflow — 简体中文精简发布包

本包是**中英文双语项目中的简体中文独立分发包**，不是完整源码仓库。包含 8 个中文 `dw-*` Skill、Playbook、`templates/` 下的 7 个中文参考模板、`plugin.json` 和发布元数据。**不包含** `bin/`、`lib/`、`docs/`，因此不能直接在本 ZIP 内执行源码仓库的 Node 安装命令。

## 通过解压包安装

**同一个安装目标只使用一种语言。** 复制前检查目标是否已有 `dw-*` 目录；不要覆盖自己修改过的 Skill。

1. **Codex 或 Grok Build（项目级 Skill）**：解压后，将 `skills/` 内的 8 个 `dw-*` 目录复制到项目的 `.agents/skills/`，保留 `dw-start/references/`。
2. **Pi Coding Agent（项目级 Skill）**：将这 8 个目录复制到项目的 `.pi/skills/`。
3. **Google Antigravity（项目级 Plugin）**：将解压包的**全部内容**复制到 `<项目>/.agents/plugins/dev-workflow/`，确保 `plugin.json` 和 `skills/` 直接位于该目录下。
4. **Grok Build 原生插件（可选）**：若 CLI 支持，先运行 `grok plugin validate <解压包路径>`；确认来源可信后，才使用 `grok plugin install <解压包路径> --trust`。

安装后刷新宿主的 Skill 列表或重启 Agent，确认可以发现全部 8 个 `dw-*` Skill。**如需自动询问语言、受管升级和卸载，应克隆完整 GitHub 源码仓库并使用其 CLI**；本精简包没有携带安装器。

`templates/` 中的七份文件是**可选的中文工作模板**，使用时自行复制到目标项目；只安装 Skill 不会自动部署模板。

完整源码与 CLI：https://github.com/HiAsh02/dev-workflow  
兼容性验证：https://github.com/HiAsh02/dev-workflow/blob/main/docs/COMPATIBILITY.md  
中文源码安装指南：https://github.com/HiAsh02/dev-workflow/blob/main/README.zh-CN.md

当前状态仍为 **Beta / Partial**；文件安装成功并不等于四种宿主的实时 LLM 调用都已验证。
