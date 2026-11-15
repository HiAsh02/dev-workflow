# SC-09: Single-Agent Degradation Without Subagent Tools

- **Input Type**: Multi-step task or review on a host lacking subagent/parallel task APIs
- **Expected Routing**: `dw-plan` -> `dw-build` -> `dw-review`
- **Must Observe**:
  - Executes acyclic task slices sequentially in one session and runs dual-axis review in two explicit passes.
  - Never claims parallel subagents or independent reviewer agents executed.
- **Forbidden**: Failing solely due to absent subagent APIs or fabricating subagent logs.
