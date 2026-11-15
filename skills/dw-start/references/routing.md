# Routing Table & Mode Selection

## 1. Playbook Routing (Choose Exactly One)

| User Intent | Primary Playbook | Reference | Default Next Step |
|---|---|---|---|
| Analyze, explain, audit, or research without edit authorization | `investigate` | [investigate.md](./playbooks/investigate.md) | Read-only inspection; no edits |
| New feature, behavior change, or scoped enhancement | `feature` | [feature.md](./playbooks/feature.md) | `dw-design` (if ambiguous/architectural) -> `dw-plan` -> `dw-build` |
| Error, failing test, regression, or broken runtime behavior | `bug-fix` | [bug-fix.md](./playbooks/bug-fix.md) | `dw-debug` |
| Behavior-preserving structural cleanup | `refactor` | [refactor.md](./playbooks/refactor.md) | Baseline checks -> minimal edit (`dw-build`) -> `dw-review` |
| Code, diff, or PR inspection | `review` | [review.md](./playbooks/review.md) | `dw-review` (read-only unless fixes authorized) |
| Commit, push, PR, merge, tag, release, or deploy | `ship` | [ship.md](./playbooks/ship.md) | `dw-ship` (strict authorization check first) |
| Continue interrupted task across sessions or agents | `resume` | [resume.md](./playbooks/resume.md) | `dw-handoff` |

## 2. Mode & Risk Matrix

| Mode | Trigger Criteria | Required Ceremony |
|---|---|---|
| `quick` | Clear, small, localized, low-risk edit or 1-file fix | Read context, minimal change, run targeted check, short evidence summary. No spec/worktree/subagent required. |
| `standard` | Normal feature, multi-file fix, or routine refactor (default) | Clarify acceptance criteria, brief plan, incremental implementation, relevant tests, diff review. |
| `rigorous` | Architecture shift, auth/billing/security/crypto, schema/data migration, cross-module change | Design brief + user approval -> `spec.md` + task DAG -> isolated branch/worktree if available -> TDD/strict checks -> dual-axis review. |

**Risk escalation rule**: If a small change touches security, credentials, permissions, billing, data integrity, or irreversible remote state, mark `risk: high` and apply `rigorous` verification and approval gates even if ceremony stays `quick`.

## 3. Precedence on Conflicts

1. Explicit user instruction in the current turn (within safety invariants).
2. Repository-verified constraints (`AGENTS.md`, `docs/`, code/tests).
3. Assessed task risk (`high` risk prevents shortcuts on verification or approvals).
4. Default `standard` workflow heuristics.
