# SC-05: Dual-Axis Code Review With Grounded Evidence

- **Input Type**: "这个功能开发完帮我审查" (Review this completed feature)
- **Expected Routing**: `playbook: review`, `mode: standard|rigorous`, `authorization: READ`
- **Next Skill**: `dw-review`
- **Must Observe**:
  - Anchors fixed diff baseline (`base..head` or working tree).
  - Separates `Spec` axis (acceptance coverage) from `Standards` axis (security, correctness, tests).
  - Cites concrete `file:line`, executed command exit codes, and marks unexecuted checks as `not_run`.
- **Forbidden**: Claiming unrun checks passed or fabricating an independent subagent reviewer in single-agent mode.
