---
name: dw-plan
description: >-
  Translates an approved design or unambiguous engineering request into a
  concise specification, acceptance criteria, and an acyclic dependency graph of
  vertical, verifiable task slices. Use for multi-step features or rigorous
  changes after design clarity is reached. Do not use for trivial 1-file edits
  or to repeat design interviews.
license: MIT
---

# dw-plan

## Purpose

Break approved goals into a testable specification and an acyclic sequence (DAG) of small vertical task slices with explicit dependencies, verification commands, and rollback notes.

## When to use

- After `dw-design` reaches approval/clarity for a multi-step feature, migration, or refactor.
- When an unambiguous request touches multiple modules or needs explicit task ordering and acceptance criteria.

## Do not use

- For `quick` low-risk single-step edits (use a brief 2-4 line inline checklist instead of full spec files).
- To re-run deep requirements interviews when design decisions are already settled.

## Inputs

- Approved Design Brief or clear, unambiguous user requirements.
- Current repository code, test runner, and dependency boundaries.

## Capabilities

- Works cleanly offline using local `.dev-workflow/tasks/<task-id>/` Markdown files (or inline output when read-only).
- Does not require external issue trackers (GitHub Issues, Linear, Jira); only syncs external trackers if explicitly configured and authorized.

## Procedure

1. **Confirm readiness**: Verify goals and critical decisions are resolved. If a critical ambiguity remains, return to `dw-design` once rather than inventing requirements silently.
2. **Produce `spec.md`** (`standard`/`rigorous` when workspace is writable):
   - Problem, In Scope, Out of Scope, Decisions, Interfaces/Contracts, Acceptance Criteria, Verification Plan, and Rollback.
3. **Slice vertically into tasks**:
   - Order cleanly: contracts/schemas first -> smallest executable slices -> security/edge verification -> integration.
   - Each task slice must specify: `id`, `title`, `blocked_by` (dependency IDs), `files`, `acceptance`, `commands` (real verification commands), and `rollback`.
4. **Validate acyclic DAG & shared-state safety**:
   - Verify `blocked_by` has zero cycles.
   - Mark slices touching the same file, lockfile, schema, or shared fixture as sequential (`blocked_by`), never concurrent.
5. **Select next frontier**: Identify tasks whose `blocked_by` set is satisfied before handing off to `dw-build`.

## Outputs

- For `quick`: 2-5 line inline execution plan + exact check command.
- For `standard`/`rigorous`: `spec.md` and task slice definitions (`steps/` or task list) with explicit `blocked_by` DAG, acceptance checks, and rollback notes.

## Failure and fallback

- If no test runner exists in the project, specify concrete deterministic verification steps (typecheck, build, CLI smoke script, or manual inspection checklist) instead of inventing `npm test`.
- Never fabricate external tracker issues or issue IDs when offline or unauthorized.

## Authorization

- Writing `spec.md` / task slices inside `.dev-workflow/tasks/` requires `LOCAL_EDIT` authorization in a writable workspace; otherwise present the plan inline as read-only output.
- Planning never authorizes application edits outside the plan unless the user already authorized implementation.

## Verification

- Confirm every task has non-empty `acceptance`, `commands`, and `rollback`.
- Confirm the `blocked_by` graph is acyclic and serializes shared files/fixtures.
- Confirm zero speculative external issue URLs or non-existent commands were written.
