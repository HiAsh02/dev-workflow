# Playbook: feature

## Trigger
User requests new functionality, new interfaces, or behavioral additions.

## Preconditions
- `LOCAL_EDIT` authorization is present (or the request starts at `dw-design` / `dw-plan` pending approval).

## Ordered steps
1. If requirements are ambiguous or architecture/public APIs change (`standard`/`rigorous`), run `dw-design` and obtain user approval on critical decisions.
2. If multi-step or cross-module, run `dw-plan` to create `spec.md` and acyclic vertical task slices; for `quick` mode, keep the plan to a few inline lines.
3. Implement slice-by-slice with `dw-build` (check dirty worktree first; keep parallelism strictly limited to disjoint files when subagents exist).
4. Verify with real test/build commands after the final edit.
5. Run `dw-review` proportional to mode and risk.

## Evidence
- Design approval record (when required), changed file paths, acceptance mapping, and exact verification commands with exit codes.

## Failure / Stop
- Stop before implementing unapproved high-impact design changes.
- Do not invoke `dw-ship` automatically when `dw-build` or `dw-review` finishes.
