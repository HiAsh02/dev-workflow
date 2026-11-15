# Architecture Overview

> Source repository: `https://github.com/HiAsh02/dev-workflow`  
> Current implementation is defined by [English Skills](../skills/dw-start/SKILL.md), [Simplified Chinese Skills](../locales/zh-CN/skills/dw-start/SKILL.md), [schemas](../schemas/run-state.schema.json), [installer source](../lib/install-plan.mjs), and [cross-host verification](./COMPATIBILITY.md).

## Architectural Pillars

1. **Skill-First Core + Agent Plugins v1.0.0 Distribution (`ADR-001`, `ADR-002`)**
   - All workflow behavior lives exclusively in `skills/dw-*/SKILL.md` and skill-local `references/`.
   - Root `plugin.json` conforms strictly to Agent Plugins v1.0.0 (`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`) with logical name `dev-workflow` and zero non-standard top-level keys.
   - Hosts that do not natively install Agent Plugins v1.0.0 packages receive the exact same `skills/` directory via project-local Skill fallback or Pi package support.

2. **Single Entry Router + 7 Internal Playbooks**
   - `dw-start` routes each request once to a single primary playbook (`investigate`, `feature`, `bug-fix`, `refactor`, `review`, `ship`, `resume`) rather than stacking competing framework planners.
   - Playbooks live inside `skills/dw-start/references/playbooks/` so they do not compete as 7 extra top-level skills.

3. **Three Intensity Modes (`quick`, `standard`, `rigorous`) + Independent Risk Gate (`ADR-004`)**
   - `quick`: Minimal overhead for clear, low-risk local edits.
   - `standard`: Default balanced workflow with lightweight design/acceptance, incremental implementation, and diff review.
   - `rigorous`: Design approval, spec/ADR, acyclic task DAG, strict TDD/verification, and dual-axis review.
   - High-risk small changes keep lightweight ceremony while enforcing `rigorous` verification and authorization checks.

4. **Progressive Capability Degradation (`ADR-005`, `ADR-006`)**
   - Workflows default to single-agent sequential execution on local files and local `.dev-workflow/tasks/<task-id>/` ledgers.
   - Subagents, git worktrees, external issue trackers, and browsers are optional accelerators checked at runtime and never assumed.

5. **Non-Destructive, Reproducible Tooling (`ADR-003`, `ADR-007`, `ADR-010`)**
   - Consumers need zero Node dependencies to read/use Markdown skills.
   - Maintainer validation, packaging, and safe install CLI require Node.js `>=22`, use pure-computed install plans, `--dry-run`, realpath containment, SHA-256 ownership tracking, and no-clobber upgrade/uninstall behavior.
