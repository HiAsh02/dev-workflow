# Release Readiness Checklist (`v0.1.0`)

- **Candidate Version**: `0.1.0` (`VERSION`, `plugin.json`, `package.json`, `CHANGELOG.md` synchronized)
- **Repository**: `https://github.com/HiAsh02/dev-workflow` (Private)
- **License**: `MIT` (`LICENSE` present, copyright `2026 HiAsh02`)
- **Compatibility Tier**: `Beta / Partial` (local deterministic checks and CLI install/discovery verified on Linux x64; live LLM `invoke` across the 4 hosts remains `NOT_TESTED`)

## Gate Summary

1. **Format & Contract (`VAL-01..05`)**:
   - `npm run validate`
   - `npm test`
   - `npm run pack && npm run verify:dist`
2. **Safety & Installer (`VAL-06..10`)**:
   - `npm run test:safety`
   - `npm run test:scenario`
   - Zero secret/token/private-file leaks in `dist/dev-workflow-0.1.0/` and `dist/dev-workflow-0.1.0.zip`.
3. **Host Compatibility Evidence**:
   - `codex` (`codex-cli 0.144.5`): `PARTIAL` (see `docs/compatibility/codex.md`)
   - `antigravity` (`44.9.1`): `PARTIAL` (see `docs/compatibility/antigravity.md`)
   - `grok-build` (`grok 1.0.52`): `PARTIAL` (see `docs/compatibility/grok-build.md`)
   - `pi` (`1.5.2`): `PARTIAL` (see `docs/compatibility/pi.md`)
4. **Remaining Gaps Before Public `v1.0.0` or Marketplace Publishing**:
   - Execute live LLM `invoke` smoke runs (`dw-start` read-only, `dw-debug` fixture, `dw-review` diff) on all 4 hosts.
   - Move `docs/ci/validate.yml` to `.github/workflows/validate.yml` (requires GitHub token `workflow` scope) and verify CI execution on `ubuntu-latest` and `windows-latest`.
   - Obtain explicit user approval before changing repository visibility from `private` to `public` or creating a public release tag.
