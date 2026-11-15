# Local Tasking & DAG Conventions

`dev-workflow` keeps task specs, slices, and ledgers local to the repository by default under `.dev-workflow/tasks/<task-id>/` so workflows work offline and across any coding agent.

## Task Slice Rules

1. **Vertical & Verifiable**: Each task delivers an end-to-end testable slice, not an unverified horizontal layer.
2. **Acyclic Dependencies (`blocked_by`)**: Every dependency edge must point to a strictly earlier task ID with zero cycles.
3. **Shared-State Serialization**: Tasks editing the same file, lockfile, migration, or test fixture must declare a dependency edge so they never run concurrently.
4. **No Fake Trackers**: Do not reference external GitHub/Linear/Jira ticket IDs unless an integration actually created or verified them.
