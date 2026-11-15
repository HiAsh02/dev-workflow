---
name: dw-design
description: >-
  Clarifies ambiguous requirements, explores existing codebase conventions,
  evaluates architectural alternatives, maintains domain glossary or ADRs when
  warranted, and secures explicit user approval before high-impact changes.
  Use for ambiguous features, API/schema changes, or design reviews. Do not use
  for unambiguous small edits or read-only bug triage.
license: MIT
---

# dw-design

## Purpose

Resolve design ambiguity and surface tradeoffs before implementation so high-impact, irreversible, or cross-module work starts from an approved, conflict-free specification.

## When to use

- Requirements have unresolved product or technical ambiguity.
- Public interfaces, persistence formats, security boundaries, or system architecture will change.
- User explicitly asks to evaluate or propose a design.

## Do not use

- Clear, low-risk local edits (`quick` mode) where constraints are already settled.
- When the user already approved a complete design in the current conversation (skip redundant re-questioning and proceed to `dw-plan` or `dw-build`).
- Pure bug diagnosis without architectural change (`dw-debug` first).

## Inputs

- User goal, constraints, and already-stated preferences (never re-ask settled decisions).
- Existing repository files: `README.md`, `AGENTS.md`, relevant source modules, existing ADRs, and domain glossary if present.

## Capabilities

- Works in read-only mode with repository search/file reading.
- Optionally emits a Design Brief, ADR, or glossary update only when the workspace is writable and task scope warrants persistent artifacts (`standard`/`rigorous`).

## Procedure

1. **Read existing context first**: Inspect codebase patterns, existing interfaces, ADRs, and terminology before asking the user anything.
2. **Reuse before inventing**: Prefer existing project frameworks, helpers, and conventions over adding new abstractions or dependencies.
3. **Clarify only real blockers**: Ask focused questions only when a material product decision, security tradeoff, or conflicting constraint cannot be resolved from the codebase.
4. **Evaluate options**: Present the recommended option alongside rejected alternatives, explicit non-goals, affected invariants, risks, and high-level verification strategy.
5. **Approval gate**: For `rigorous` tasks or irreversible/public-API/security changes, pause and request user approval on the Design Brief before any code edits begin.

## Outputs

A Design Brief (inline in response for small/medium tasks; persisted under `.dev-workflow/tasks/<task-id>/` or `docs/` when authorized for larger work) containing:
- Goal, Scope, and Non-goals
- Key Constraints & Existing Precedents
- Recommended Design vs. Alternatives Considered
- Risks, Security/Migration Impact, and Acceptance Strategy
- Open Decisions requiring user approval (if any)

For complex multi-term domains or architectural pivots, also update/create concise ADR or glossary entries.

## Failure and fallback

- If requirements remain contradictory after one clarification pass, mark the conflicting constraints explicitly and pause rather than inventing silent defaults for critical behavior.
- Do not write speculative prototype code when the user only requested design exploration.

## Authorization

- Default is **READ-ONLY** until the user authorizes writing design docs or starting implementation.
- Never treat design exploration as permission to modify application code, commit, or push.

## Verification

- Verify every cited file path, symbol, or existing constraint in the Design Brief was actually observed.
- Confirm no settled user constraint was ignored or contradicted.
- Confirm high-impact implementation does not begin prior to explicit approval.
