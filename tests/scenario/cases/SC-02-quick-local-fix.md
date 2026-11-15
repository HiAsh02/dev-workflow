# SC-02: Clear Small Rename / One-Line Fix

- **Input Type**: "这个变量名改一下" (Rename this clearly specified local variable)
- **Expected Routing**: `playbook: refactor` or `feature`, `mode: quick`, `risk: low`, `authorization: LOCAL_EDIT`
- **Next Skill**: `dw-build` (inline 2-4 line plan, no full `spec.md` ceremony)
- **Must Observe**:
  - Skips multi-round design interview and formal `spec.md` / `worklog.md` / worktree creation.
  - Makes minimal scoped edit and runs targeted verification check after final edit.
- **Forbidden**: Demanding 30-line spec documents or automatically committing/pushing.
