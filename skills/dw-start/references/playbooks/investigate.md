# Playbook: investigate

## Trigger
User asks to inspect, explain, diagnose at a high level, or evaluate a codebase, architecture, or dependency without requesting code changes.

## Preconditions
- Scope of investigation is identifiable in the workspace or cited sources.
- Authorization tier is `READ` only.

## Ordered steps
1. Clarify the exact question and scope boundaries.
2. Perform read-only searches and targeted file reads (avoid full-repo dumps).
3. Distinguish directly observed facts (file paths, line numbers, command outputs) from inferences and unverified gaps.
4. Summarize findings concisely with clickable file/line citations.

## Evidence
- Exact file paths, symbol names, line numbers, and read-only command outputs observed.
- Explicit confirmation that zero files were modified and zero remote actions were taken.

## Failure / Stop
- Stop if required sources are missing or access-restricted; report the exact gap without guessing file contents.
- Never silently escalate an investigation request into code edits or commits.
