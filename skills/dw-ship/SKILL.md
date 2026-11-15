---
name: dw-ship
description: >-
  Enforces fine-grained authorization gates and pre-flight verification for
  local commits, remote pushes, pull requests, merges, tags, releases, and
  deletions. Never runs remote or destructive actions without explicit user
  approval for that exact tier and target.
license: MIT
---

# dw-ship

## Purpose

Prevent accidental commits, pushes, merges, releases, or deletions by enforcing separate explicit authorization checks, pre-flight verification, and post-action remote confirmation.

## When to use

- User explicitly asks to commit changes, push a branch, open/merge a PR, create a release tag, publish a package, or delete a branch/resource.
- Or when preparing a dry-run pre-ship checklist prior to requesting release authorization.

## Do not use

- Automatically at the end of `dw-build` or `dw-review` without an explicit shipping request.
- To silently infer remote publish permission from "code looks good", "review passed", or an earlier turn's local-edit approval.

## Inputs

- Explicit user shipping instruction specifying allowed actions (`commit`, `push`, `pr`, `merge`, `release`, `deploy`, `delete`) and target repo/branch.
- Current `git status`, `HEAD` SHA, remote URL (`git remote -v`), and latest verification results.

## Capabilities

- Operates via `git` / host VCS CLI (e.g., `gh`) when available and authorized.
- If network, credentials, or CLI tools are unavailable, prepares a pre-ship checklist and blocks safely without simulating remote success.

## Procedure

1. **Decompose requested permissions**:
   - Evaluate `LOCAL_COMMIT`, `REMOTE_WRITE` (`push`, `pr`, `merge`, `release`, `deploy`), and `DESTRUCTIVE` (`delete`, force-push, history rewrite) independently.
   - Check the current user request explicitly authorizes each action about to run.
2. **Run pre-flight checks**:
   - Inspect `git status --short --branch`, `git remote -v`, and `git rev-parse HEAD`.
   - Confirm no untracked secrets (`.env`, tokens, keys) or unintended dirty files will be staged/pushed.
   - Confirm all required verification checks (`validate`, tests, build) passed **after** the last edit and no blocking `critical`/`major` review findings remain open.
   - Verify target repository and branch match user intent (never guess destination branch or visibility).
3. **Gate on missing authorization**:
   - If any requested or implied action lacks explicit current authorization, **stop before executing it** and present a Pre-Ship Checklist detailing pending actions, exact target repo/branch, and rollback plan.
4. **Execute strictly authorized steps**: Run only the approved actions in safe order (e.g., stage specific files -> commit -> push verified branch).
5. **Verify actual remote outcome**: Read back the resulting commit SHA, remote ref, PR URL, or release state directly from tool output before reporting success.

## Outputs

- Authorization check summary (what was authorized vs. withheld).
- Pre-flight check evidence (`git status`, checks run, target repo/branch).
- For executed steps: exact commands, resulting commit SHA, remote ref/PR/release URL, and rollback command.
- For unauthorized/blocked steps: actionable Pre-Ship Checklist with zero mutations.

## Failure and fallback

- If push/PR fails due to auth, network, branch protection, or target mismatch, report the exact failure and leave local state clean and recoverable.
- Never force-push (`--force`) or delete branches without separate explicit `DESTRUCTIVE` approval.

## Authorization

- `LOCAL_COMMIT` != `REMOTE_WRITE` != `DESTRUCTIVE`.
- Ledger files (`.dev-workflow/tasks/*/run-state.json`) and passing reviews NEVER grant `dw-ship` authorization.

## Verification

- Verify `git status` and remote state after execution (e.g., `git ls-remote` or `gh pr view` / `gh repo view`).
- Confirm no unauthorized remotes, branches, tags, or public visibility changes occurred.
