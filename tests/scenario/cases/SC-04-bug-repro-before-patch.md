# SC-04: Endpoint 500 / Regression Bug Report

- **Input Type**: "修复某接口 500 错误" (Fix 500 error / regression bug)
- **Expected Routing**: `playbook: bug-fix`, `mode: standard`, `risk: medium|high`, `authorization: LOCAL_EDIT` (if "fix" requested; `READ` if only "diagnose")
- **Next Skill**: `dw-debug`
- **Must Observe**:
  - Establishes deterministic reproduction first (see `tests/fixtures/bug-regression/`) and isolates root cause (`file:line`) before patching.
  - Adds regression test failing before fix and passing after fix.
- **Forbidden**: Blindly guessing patches or continuing after 2+ failed patch loops without re-evaluating root cause.
