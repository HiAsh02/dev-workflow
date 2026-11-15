---
name: dw-review
description: >-
  Performs dual-axis code review (Spec compliance and Standards/security
  quality) grounded strictly in observed diffs, source citations, and re-run
  verification commands. Defaults to read-only reporting. Do not fabricate
  independent subagent reviews or claim unexecuted checks passed.
license: MIT
---

# dw-review

## Purpose

Verify completed changes against both specification requirements (`Spec`) and engineering/security standards (`Standards`) using reproducible evidence.

## When to use

- After `dw-build` completes a slice or feature.
- When the user asks to review a branch, PR, commit range, or uncommitted diff.

## Do not use

- To perform open-ended architecture design from scratch (`dw-design`).
- To push, merge, or release changes (`dw-ship`).

## Inputs

- Fixed comparison baseline (commit range, branch merge-base, PR diff, or working-tree diff).
- Relevant spec, acceptance criteria, `AGENTS.md`, and repo standards (if available).
- Safe read-only test/lint/build commands.

## Capabilities

- Operates **READ-ONLY** by default.
- Can run in a single agent (performing two explicit passes: `Spec` pass then `Standards` pass) or delegate an adversarial check on high-risk diffs when subagent tools actually exist. Never claim an "independent reviewer" ran if only one agent session inspected the diff.

## Procedure

1. **Lock the review baseline**: Identify exact base commit/branch and inspect the full diff (`git diff`, `git status`).
2. **Axis 1 — Spec Compliance**:
   - Compare implemented behavior against stated goals, `spec.md`, and acceptance criteria.
   - Note missing requirements, unapproved scope creep, or missing spec baseline (explicitly mark if no formal spec exists).
3. **Axis 2 — Standards & Risk**:
   - Inspect correctness, edge cases, error handling, security/injection risks, path/permission safety, backwards compatibility, and test quality.
   - For high-risk diffs, trace concrete failure or exploit paths (`file:line` + mechanism).
4. **Verify claims empirically**: Run safe, read-only checks (`validate`, tests, build) yourself where possible rather than trusting earlier prose summaries.
5. **Separate facts from hypotheses**:
   - Only report issues grounded in directly observed code/outputs.
   - Label any unexecuted runtime scenario explicitly as `unverified` / `not_run`.
6. **Classify severity**: `critical`, `major`, `minor`, `info`. Any unresolved `critical` or `major` blocks release readiness (`dw-ship`).

## Outputs

A structured review report containing:
- Scope & Diff Baseline (`base..head` or working tree)
- Spec Axis Assessment
- Standards Axis Assessment
- Severity-ranked Findings (`severity`, `file:line`, `evidence`, `impact`, `suggested fix`, `blocking: yes|no`)
- Executed Verification Commands + Exit Codes + Unverified Gaps
- Release Gate Verdict (`PASS` | `CHANGES_REQUESTED` | `BLOCKED`)

## Failure and fallback

- If tests cannot run in the environment, record `not_run` with the exact blocker instead of reporting a clean pass.
- If the diff is empty or baseline is ambiguous, ask for the intended target range before concluding.

## Authorization

- Strictly **READ-ONLY**: reviewing code NEVER authorizes applying fixes, committing, pushing, or merging.
- Only edit code after receiving explicit fix authorization from the user.

## Verification

- Confirm every cited `file:line` and command output was directly observed in this session.
- Confirm zero files were modified during a read-only review.
