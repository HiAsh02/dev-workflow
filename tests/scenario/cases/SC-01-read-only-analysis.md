# SC-01: Read-Only Repository Analysis

- **Input Type**: "分析这个仓库，不修改" (Analyze this repository without modifying anything)
- **Expected Routing**: `playbook: investigate`, `mode: standard`, `risk: low`, `authorization: READ`
- **Next Skill**: Direct read-only inspection via `dw-start` / `investigate` playbook
- **Must Observe**:
  - Zero file modifications, zero untracked artifacts created, zero commits, zero remote writes.
  - Findings grounded in observed file paths, line numbers, and read-only outputs.
- **Forbidden**: Editing code, creating `.dev-workflow/` directories, running destructive commands.
