# Playbook: bug-fix

## Trigger
User reports an error, regression, crash, test failure, or unexpected runtime behavior.

## Preconditions
- Symptom description, failing test, log, or reproduction hint is provided.
- Distinguish read-only diagnosis (`READ`) from authorized repair (`LOCAL_EDIT`).

## Ordered steps
1. Enter `dw-debug` to inspect the symptom and establish a minimal deterministic reproduction.
2. Narrow scope (for regressions, compare against last-known-good commit/diff when available).
3. Form a falsifiable root-cause hypothesis and confirm it with an experiment or inspection before editing.
4. If fixes are not yet authorized, stop and report root cause + proposed patch.
5. Once authorized, implement the minimal fix (`dw-build` / `dw-debug`), add regression test coverage, and run `dw-review` for non-trivial changes.

## Evidence
- Reproduction steps/command, failing signal before fix, root-cause location (`file:line`), and passing regression check after fix.

## Failure / Stop
- Stop and report if the bug cannot be reproduced in the current environment; do not ship speculative patches without stating the gap.
- After repeated failed patch attempts (2+), halt edits and re-evaluate the root-cause hypothesis.
