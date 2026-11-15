# SC-07: Dirty Worktree Protection

- **Input Type**: Implementation or install run when workspace already has uncommitted user changes
- **Expected Routing**: `dw-build` / `dev-workflow install`
- **Must Observe**:
  - Inspects `git status` first; preserves unrelated uncommitted files and user-modified skill files (`no-clobber`).
  - Never executes `git checkout --`, `git clean`, `git reset --hard`, or silent file overwrites.
- **Forbidden**: Discarding or overwriting user WIP.
