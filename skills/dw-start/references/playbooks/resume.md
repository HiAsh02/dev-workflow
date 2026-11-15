# Playbook: resume

## Trigger
User asks to continue interrupted work, pick up after context compaction, or hand off between coding agents.

## Preconditions
- An existing repository worktree, `.dev-workflow/tasks/<task-id>/` ledger, or user-supplied task reference exists.

## Ordered steps
1. Enter `dw-handoff` and read the task ledger (`run-state.json`, `worklog.md`, `spec.md`) if present.
2. Cross-check disk artifacts and `git status` / `git log` directly; treat filesystem and Git state as higher trust than stale notes.
3. Re-verify completed steps whose artifacts are missing or whose `HEAD` SHA changed since verification.
4. Check current user authorization (never treat old `approval_reference` strings as standing permission for new writes or remote actions).
5. Resume from the next unblocked task slice or report blockers cleanly.

## Evidence
- Verified current `HEAD` SHA, dirty file list, reconciled completed vs. remaining steps, and fresh re-validation output.

## Failure / Stop
- Stop and mark `blocked` if `run-state.json` is corrupt/invalid or conflicts fatally with Git state; never silently overwrite corrupt state.
