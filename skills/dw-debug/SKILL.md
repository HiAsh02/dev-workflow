---
name: dw-debug
description: >-
  Diagnoses bugs, regressions, and failing tests using deterministic
  reproduction, scope narrowing, falsifiable root-cause hypotheses, and verified
  regression checks. Defaults to read-only investigation unless repair is
  explicitly authorized. Do not use for speculative patching without evidence.
license: MIT
---

# dw-debug

## Purpose

Find the true root cause of a failure through reproducible evidence before changing code, and ensure any authorized fix includes regression protection.

## When to use

- A test fails, an API/CLI throws an unexpected error, or a previously working behavior regressed.
- Root cause is unknown or prior patches failed.

## Do not use

- For clearly specified new feature development (`dw-design` / `dw-plan` / `dw-build`).
- To blindly guess and apply unverified patches before confirming the failure mechanism.

## Inputs

- Reported symptom, error message, stack trace, or logs.
- Reproduction hint, environment context, and last-known-good commit/version (if a regression).
- Explicit authorization level (`READ` diagnosis only vs. `LOCAL_EDIT` fix authorized).

## Capabilities

- Works read-only with file inspection, log analysis, and read-only reproduction commands.
- Uses `git diff` or isolated git worktree `bisect` when diagnosing regressions and git/worktree capabilities exist; otherwise narrows manually by reading diffs and running targeted checks.

## Procedure

1. **Preflight read-only**: Check `git status` and preserve any existing dirty worktree edits. Do not modify source files during diagnosis.
2. **Reproduce deterministically**: Run the smallest safe command or trace that exhibits the reported symptom. If unreproducible, gather exact environmental gaps and stop rather than guessing.
3. **Narrow the fault**:
   - For regressions with a known last-good SHA/version, inspect `git diff <good>..HEAD` first; use isolated `git bisect` only when safe and authorized.
   - Trace the failing data/control path to the exact `file:line` invariant violation.
4. **Test a falsifiable hypothesis**: State why the observed state causes the failure and verify that hypothesis against code/logs before proposing or editing.
5. **Gate on edit authorization**:
   - If the user asked only to diagnose/investigate (`READ`), report root cause, evidence, and proposed minimal fix without modifying files.
   - If `LOCAL_EDIT` fix is authorized, apply the minimal root-cause fix (not a symptom-masking catch/retry), add a regression test proving failure-before / pass-after, and re-run full affected checks.
6. **Circuit breaker**: If two consecutive fix attempts fail to resolve the issue, halt editing, revert or isolate failed experiments safely without touching user WIP, and re-examine assumptions.

## Outputs

- Reproduction command/steps and observed failing output (or explicit explanation of why it could not reproduce).
- Confirmed root cause (`file:line` and mechanism).
- If authorized to fix: minimal diff, regression test added/updated, and post-fix passing command output + exit codes.

## Failure and fallback

- If the environment lacks runtime dependencies, credentials, or test runners to reproduce, report `BLOCKED` with the exact missing prerequisite instead of claiming root cause was verified.

## Authorization

- Default is **READ-ONLY** diagnosis.
- Applying fixes requires explicit `LOCAL_EDIT` authorization (e.g., "fix this bug").
- Fixing a bug never implies `LOCAL_COMMIT`, `git push`, PR creation, or deployment (`dw-ship`).

## Verification

- Verify the root-cause explanation accounts for every observed symptom.
- For applied fixes, run the regression test and affected suite **after** the final edit and confirm exit code `0`.
