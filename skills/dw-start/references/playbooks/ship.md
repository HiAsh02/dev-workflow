# Playbook: ship

## Trigger
User requests local commit, branch push, pull request creation, merge, tag, release, or deployment.

## Preconditions
- Explicit user authorization naming the allowed operation tier (`LOCAL_COMMIT`, `REMOTE_WRITE`, or `DESTRUCTIVE`).
- Target repository, remote, and branch are verified.

## Ordered steps
1. Enter `dw-ship` and separate requested actions into distinct permission checks (`commit`, `push`, `pr`, `merge`, `release`, `deploy`, `delete`).
2. Verify preconditions: clean/expected `git status`, HEAD SHA, target remote/branch, and fresh passing checks after the final edit.
3. Refuse any unauthorized tier and stop at a pre-flight checklist if authorization or target is unclear.
4. Execute only the explicitly approved operations.
5. Verify actual remote state (commit SHA, PR URL, tag, or API status) after execution.

## Evidence
- Pre-flight check results, exact executed commands, resulting local/remote SHA or URL, and rollback instructions.

## Failure / Stop
- Stop immediately if target branch/repo mismatches approval, checks fail, or dirty files risk unintended inclusion.
- Never infer push/merge/release permission from a passing code review or prior session.
