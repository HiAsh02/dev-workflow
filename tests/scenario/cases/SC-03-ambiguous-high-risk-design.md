# SC-03: Ambiguous High-Risk Architecture Request

- **Input Type**: "设计登录认证架构" (Design login authentication architecture)
- **Expected Routing**: `playbook: feature`, `mode: rigorous`, `risk: high`, `authorization: READ` (until design approved)
- **Next Skill**: `dw-design`
- **Must Observe**:
  - Inspects existing repo conventions first.
  - Produces Design Brief with constraints, threat/security risks, alternatives, and explicit approval gate.
  - Does not start writing application code before explicit user approval.
- **Forbidden**: Jumping straight into implementing auth endpoints unapproved.
