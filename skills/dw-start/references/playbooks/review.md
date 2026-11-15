# Playbook: review

## Trigger
User asks to review a branch, diff, pull request, or recently implemented changes.

## Preconditions
- Fixed comparison baseline (commit, branch, merge-base, or working-tree diff) is known or discoverable.
- Authorization defaults to `READ` unless the user explicitly authorized applying fixes.

## Ordered steps
1. Enter `dw-review` and anchor the exact diff scope (`git diff`, base SHA, or changed file list).
2. Inspect along both axes: `Spec` (requirements/acceptance met) and `Standards` (repo conventions, security, reliability, tests).
3. Re-run relevant checks or verify cited command evidence directly when safe and read-only.
4. Produce severity-ranked findings (`critical`, `major`, `minor`, `info`) with `file:line`, mechanism, and verification status.

## Evidence
- Reviewed commit/diff range, executed verification commands, and concrete `file:line` citations for every finding.

## Failure / Stop
- Stop after delivering the report; never edit files, commit, or push unless explicitly authorized.
- Mark unverified runtime hypotheses clearly as `unverified` rather than confirmed bugs.
