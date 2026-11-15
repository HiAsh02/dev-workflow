---
name: dw-build
description: >-
  Implements approved tasks or scoped code changes slice-by-slice while
  protecting uncommitted work, adapting verification/TDD to project tooling, and
  degrading cleanly to sequential single-agent execution when subagents or
  worktrees are unavailable. Do not auto-commit or push when implementation ends.
license: MIT
---

# dw-build

## Purpose

Deliver small, verified, scope-faithful code changes backed by real test/build execution evidence without damaging existing uncommitted work or overstepping authorization.

## When to use

- After `dw-start` / `dw-plan` (or `dw-design`) for authorized `feature`, `refactor`, or authorized `bug-fix` implementation.
- For clear, authorized `quick` edits within a known scope.

## Do not use

- When the user only requested read-only analysis, code review, or design evaluation.
- Before design approval on `rigorous` or high-impact architectural changes.
- To commit, push, open PRs, or release (`dw-ship`).

## Inputs

- User-authorized implementation scope (`LOCAL_EDIT`).
- Spec/task slices (`spec.md` / `steps/`) or concise inline plan (`quick`).
- Current `git status`, baseline HEAD SHA, and available tooling/test runner.

## Capabilities

- **Dirty worktree check**: Always inspect uncommitted edits first; never discard, stash, `git clean`, or `git checkout --` user work.
- **Test/TDD adaptation**:
  - In `rigorous` mode (or high-risk testable code) when an automated test runner exists: enforce Red -> Green -> Refactor and record both failing and passing runs.
  - When no automated test framework exists: run the strongest deterministic alternative (build, lint, typecheck, script smoke test) and explicitly state `TDD: not applicable (no test framework)` rather than claiming TDD passed.
- **Execution parallelism**:
  - Default to sequential single-agent execution slice-by-slice.
  - Only delegate independent slices to subagents/worktrees if the host actually provides subagent/worktree tools AND the slices touch strictly disjoint files and shared state. Never fabricate subagent usage when running single-agent.

## Procedure

1. **Inspect workspace state**: Check `git status` and read target files before editing.
2. **Select next unblocked slice**: In multi-step plans, verify all `blocked_by` dependencies are `done` with evidence.
3. **Implement minimally**: Keep edits focused on the slice, reusing existing project helpers and preserving unrelated comments/behavior.
4. **Verify after final edit**: Run the slice's targeted checks and broader affected checks; record exact commands, exit codes, and observed output. Unexecuted checks must be marked `not_run`.
5. **Update local progress**: If using `.dev-workflow/tasks/<task-id>/`, update `worklog.md` and `run-state.json` atomically.
6. **Stop at boundary**: Hand off to `dw-review` (when appropriate) or report completion. Never automatically run `dw-ship`.

## Outputs

- Exact list of modified/created files.
- Acceptance criteria status per slice.
- Exact verification commands run after the final edit, exit codes, and concise result summaries (explicitly marking any `not_run` or skipped checks).
- Updated Git working-tree state (`git status` summary).

## Failure and fallback

- If a check fails due to a preexisting repo failure unrelated to the change, separate baseline failures from newly introduced failures and report both accurately.
- If blocked by missing dependencies, permissions, or ambiguous requirements, stop editing, leave valid workspace state intact, and report `blocked`.

## Authorization

- Requires `LOCAL_EDIT` permission within the user's stated task scope.
- Never self-escalate into `LOCAL_COMMIT`, `REMOTE_WRITE`, or `DESTRUCTIVE` actions.

## Verification

- Every claimed passing check must have run **after** the last file edit with exit code `0`.
- Confirm zero unrelated uncommitted user edits were reverted or overwritten.
