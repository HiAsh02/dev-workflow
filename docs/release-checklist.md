# Release Readiness Checklist (`v0.1.0`)

- **Candidate Version**: `0.1.0` (`VERSION`, `plugin.json`, `package.json`, `CHANGELOG.md` synchronized)
- **Repository**: `https://github.com/HiAsh02/dev-workflow` (Private)
- **License**: `MIT` (`LICENSE` present, copyright `2026 HiAsh02`)
- **Compatibility Tier**: `Beta / Partial` (GitHub Actions CI on `ubuntu-latest` & `windows-latest` verified `PASS`; full 8-dimension live verification `PASS` on `codex` & `pi`; `antigravity` 7/8 dimensions including `GetAllPlugins` discovery `PASS`, `invoke` `NOT_TESTED`; `grok-build` 7/8 dimensions `PASS`, `invoke` `BLOCKED` pending login)

## Gate Summary

1. **Format & Contract (`VAL-01..05`)**:
   - `npm run validate`
   - `npm test`
   - `npm run pack && npm run verify:dist`
   - `.github/workflows/validate.yml` (`ubuntu-latest` & `windows-latest`): verified `PASS` on GitHub Actions CI (`main`).
2. **Safety & Installer (`VAL-06..10`)**:
   - `npm run test:safety`
   - `npm run test:scenario`
   - Zero secret/token/private-file leaks in `dist/dev-workflow-0.1.0/` and `dist/dev-workflow-0.1.0.zip`.
3. **Host Compatibility Evidence**:
   - `codex` (`codex-cli 0.144.5`): `PASS` — 8/8 dimensions verified (see `docs/compatibility/codex.md`)
   - `pi` (`1.5.2`): `PASS` — 8/8 dimensions verified (see `docs/compatibility/pi.md`)
   - `grok-build` (`grok 1.0.52`): `PARTIAL` — `invoke` `BLOCKED` (`You are not authenticated.`) (see `docs/compatibility/grok-build.md`)
   - `antigravity` (`44.9.1`): `PARTIAL` — 7/8 dimensions verified (including `GetAllPlugins` 8-skill discovery); live `invoke` `NOT_TESTED` (see `docs/compatibility/antigravity.md`)
4. **Remaining Gaps Before Public `v1.0.0` or Marketplace Publishing**:
   - Run authenticated live LLM `invoke` smoke runs on `grok-build` (`grok login` required) and verify interactive IDE/agent invocation on `antigravity`.
   - Obtain explicit user approval before changing repository visibility from `private` to `public` or creating a public release tag.
