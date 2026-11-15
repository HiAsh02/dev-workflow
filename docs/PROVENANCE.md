# Provenance & Attribution

`dev-workflow` is an independent, clean-room implementation of portable Agent Skills and Agent Plugins v1.0.0 workflows. No source files or verbatim skill texts were copied from upstream projects; instead, specific architectural patterns were synthesized and re-implemented under MIT License.

## Upstream Architectural Inspirations

| Project | Source URL | Reference Commit / Version | License | Patterns Adapted |
|---|---|---|---|---|
| **tw93/Waza** | https://github.com/tw93/Waza | `355b9dc7e16a6cec2df519d26702a9400de988da` (`VERSION` 3.42.0) | MIT | Explicit trigger/non-trigger boundaries, outcome contracts, read-only vs. write safety checks, lightweight routing |
| **mattpocock/skills** | https://github.com/mattpocock/skills | `5863806dd4e15c63174bee4e7515a4256792ecfa` | MIT | Glossary/ADR domain modeling, Spec vs. vertical-slice tasks separation, dependency DAGs, dual-axis (`Spec` + `Standards`) review |
| **obra/superpowers** | https://github.com/obra/superpowers | `22f0b463e7a5e579904dd6211a520321035526f7` (`v7.0.2`) | MIT | Design approval gates, evidence-before-completion discipline, adaptive TDD, systematic 4-phase debugging, isolated worktree guidance |
| **Lauren Tan (poteto) / pstack** | https://github.com/cursor/plugins/tree/main/pstack | `bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7` (`0.15.42`) | MIT | Single-entry intent router, internal playbook routing, narrow verifiable units, evidence-backed review findings, Agent Plugins v1.0.0 packaging |

## Standards & Schemas

| Artifact | Source | Retrieved | Notes |
|---|---|---|---|
| `schemas/plugin-v1.0.0.schema.json` | https://agent-plugins.org/schemas/1.0.0/plugin.schema.json | 2026-11-15 | Locked verbatim offline copy of Agent Plugins v1.0.0 JSON Schema |
| Agent Skills Specification | https://agentskills.io/specification | 2026-11-15 | Normative `SKILL.md` frontmatter and directory rules |
| Agent Plugins v1.0.0 Specification | https://agent-plugins.org/specification | 2026-11-15 | Normative `plugin.json`, `skills/`, and containment rules |
