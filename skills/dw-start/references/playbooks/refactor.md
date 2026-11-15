# Playbook: refactor

## Trigger
User requests structural cleanup, simplification, or module reorganization while preserving external behavior.

## Preconditions
- Existing behavior and invariants are identifiable.
- `LOCAL_EDIT` authorization is present.

## Ordered steps
1. Record external invariants and public interfaces that must remain unchanged.
2. Run existing baseline tests/checks before touching any code (or state explicitly if no tests exist).
3. Apply minimal, incremental structural edits via `dw-build` without changing unrelated code or user WIP.
4. Re-run the exact baseline checks plus any targeted regression checks.
5. Run `dw-review` to confirm no unintended behavioral drift.

## Evidence
- Baseline command results before refactor, diff summary, and re-run command results after final edit.

## Failure / Stop
- Stop if baseline tests already fail or cannot run; report baseline failures separately from refactor work.
- Abort and ask before changing public APIs, persistence schemas, or external contracts.
