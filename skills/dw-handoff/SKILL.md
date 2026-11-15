---
name: dw-handoff
description: >-
  Recovers or hands off engineering tasks across sessions or agents by
  reconciling disk task ledgers (run-state.json, worklog.md) against actual Git
  status, HEAD SHA, and evidence files. Never treats historical approvals as
  standing permission for commits or remote writes.
license: MIT
---

# dw-handoff

## Purpose

Enable accurate, non-duplicative session resumption and cross-agent handoff grounded in verified disk and Git state rather than stale chat summaries.

## When to use

- Resuming an interrupted task after context compaction, session restart, or switching coding agents.
- Writing a final checkpoint/retrospective handoff before ending an incomplete session.

## Do not use

- For brand-new `quick` single-turn tasks that require no cross-session state.
- To fabricate missing test evidence or infer remote shipping approval from previous turns.

## Inputs

- Existing `.dev-workflow/tasks/<task-id>/run-state.json`, `worklog.md`, and `spec.md` (if present).
- Live read-only Git state (`git status`, `git rev-parse HEAD`, `git diff`).
- Current user instruction and current-turn authorization tier.

## Capabilities

- Works cleanly across any agent without scanning unrelated projects or private session histories.
- Validates `run-state.json` strictly and treats filesystem + Git ground truth as higher authority than chat notes.

## Procedure

1. **Locate and validate ledger**:
   - Read `.dev-workflow/tasks/<task-id>/run-state.json` and `worklog.md` if present.
   - If `run-state.json` is malformed or fails schema validation, **stop**, mark state `blocked`, preserve the file intact for forensics, and report the exact parse/schema error.
2. **Reconcile with live repository state**:
   - Run read-only `git status --short --branch` and `git rev-parse HEAD`.
   - For every step marked `done`, verify its output artifacts and `evidence` paths still exist inside the project.
   - If `HEAD` SHA or dirty files changed since `head_commit` was recorded, mark affected verifications as stale (`reverify_required`).
3. **Re-check current authorization**:
   - Treat `approval_reference` inside `run-state.json` strictly as historical audit metadata, **never** as active permission to edit, commit, push, or deploy.
4. **Never auto-execute stored commands blindly**: Treat `checks[].command` strings as recorded metadata to review before running, never `eval` blindly.
5. **Determine next safe action**: Select the earliest incomplete/unblocked step (or re-verify stale checks) and produce a concise handoff/resume summary.
6. **Persist checkpoint atomically (when authorized to write)**: Update `worklog.md` and `run-state.json` via atomic rename without overwriting unrelated user work.

## Outputs

A concise Handoff / Resume Summary containing:
- `task_id`, `mode`, and reconciled `status`
- Verified `HEAD` SHA & dirty-worktree summary
- Completed steps with verified evidence vs. stale/unverified steps
- Active blockers and current-turn authorization boundaries
- Next single safe step and minimal resume prompt

## Failure and fallback

- If no `.dev-workflow/tasks/` ledger exists, reconstruct current state strictly from `git status`, `git log -n 5`, and existing files, clearly noting no prior task ledger was found.

## Authorization

- Inspecting task state and Git status is **READ-ONLY**.
- Updating `.dev-workflow/tasks/<task-id>/` requires `LOCAL_EDIT` authorization in the project workspace.
- Never scan other repositories or user home session transcripts outside the current project.

## Verification

- Confirm any step retained as `done` has existing disk artifacts and matches current `HEAD` (or was re-verified after resume).
- Confirm corrupt `run-state.json` was not silently overwritten.
