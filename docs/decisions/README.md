# Architecture Decision Records (ADRs)

ADRs capture significant architectural, security, or contract changes (`ADR-XXXX`).

## When to Create an ADR

- Changing public interfaces, persistence schemas, or cross-module boundaries.
- Modifying workflow authorization tiers or supported host commitments.
- Correcting a flawed assumption discovered during implementation.

Small implementation details and localized bug fixes do **not** need an ADR.

## Required ADR Sections

1. **Context & Evidence**: Observed problem or requirement driving the change.
2. **Decision**: Selected option and scope.
3. **Alternatives Considered**: Rejected approaches and tradeoffs.
4. **Consequences & Migration**: Affected tasks, compatibility impact, tests to update, and rollback path.
5. **Status & Approval**: `proposed | accepted | superseded` and who approved.
