# Release Readiness Checklist (`v0.1.0`)

- **Candidate Version**: `0.1.0` (`VERSION`, `plugin.json`, `package.json`, `CHANGELOG.md` synchronized)
- **Repository**: `https://github.com/HiAsh02/dev-workflow` (Private)
- **License**: `MIT` (`LICENSE` present, copyright `2026 HiAsh02`)
- **Compatibility Tier**: `Beta / Partial` (`codex` & `pi` 8-dimension English `LIVE_LLM` evals passed prior to R4/bilingual changes; offline `grok-build` `NATIVE_HOST` discovery verified for both `en` & `zh-CN` with `invoke` `BLOCKED`; `antigravity` `invoke` `NOT_TESTED`; CI on R4 + bilingual commits pending user authorization to commit/push)

## Gate Summary

1. **Format & Contract (`VAL-01..05`, `L-01`, `L-08`)**:
   - `npm run validate` (validates `en` + `zh-CN` skills, playbooks, `routing.md`, templates, and `run-state.json` schema parity)
   - `npm test` (`contract-static` + `installer-integration`, including `R2-*`, `R3-*`, `R4-REG-*` CAS/manifest-drift/WAL-origin/partial-uninstall tests, and `L-01..L-10` bilingual tests)
   - `npm run pack && npm run verify:dist` (builds and verifies both `dev-workflow-0.1.0-en(.zip)` and `dev-workflow-0.1.0-zh-CN(.zip)` + `dist/SHA256SUMS.txt`)
2. **Safety, Installer & Behavioral Evals (`VAL-06..10`, `REG-*`, `R2/R3/R4-REG-*`)**:
   - `npm run test:safety`
   - `npm run test:scenario` (`contract-static` specs & bilingual `routing.md` / playbook checks)
   - `npm run test:eval` (`agent-behavior-eval` offline harness & `REG-EVAL-01`)
   - `npm run eval:live` (`LIVE_LLM` behavioral suite on `codex` & `pi` -> historical traces in [eval-traces-2026-11-15.md](./compatibility/eval-traces-2026-11-15.md); rerun for `zh-CN` & post-patch HEAD before tagging)
   - Deterministic path/size and regex token-prefix scan on `dist/dev-workflow-0.1.0-<en|zh-CN>/` and ZIP archives.
3. **Host Compatibility Evidence**:
   - `codex` (`codex-cli 0.144.5`): `PASS` — 8/8 lifecycle dimensions (`6/8` skills live-invoked, `8/8` discovered; see `docs/compatibility/codex.md`)
   - `pi` (`1.5.2`): `PASS` — 8/8 lifecycle dimensions (`6/8` skills live-invoked, `8/8` discovered; see `docs/compatibility/pi.md`)
   - `grok-build` (`grok 1.0.52`): `PARTIAL` — `NATIVE_HOST` discovery & plugin install pass; `LIVE_LLM` `invoke` `BLOCKED` (`You are not authenticated.`) (see `docs/compatibility/grok-build.md`)
   - `antigravity` (`44.9.1`): `PARTIAL` — 7/8 dimensions verified (including `NATIVE_HOST` `GetAllPlugins` 8-skill discovery); `LIVE_LLM` `invoke` `NOT_TESTED` (see `docs/compatibility/antigravity.md`)
4. **Remaining Gaps Before Public `v1.0.0` or Marketplace Publishing**:
   - Run authenticated live LLM `invoke` smoke runs on `grok-build` (`grok login` required) and verify interactive IDE/agent invocation on `antigravity` (plus live behavioral eval runs specifically targeting `dw-design` & `dw-plan`).
   - Re-verify `.github/workflows/validate.yml` (`ubuntu-latest` & `windows-latest`) on CI after committing updated tests/fixes with explicit user approval.
   - Obtain explicit user approval before committing/pushing, changing repository visibility from `private` to `public`, or creating a public release tag.
