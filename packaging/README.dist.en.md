# dev-workflow — English distribution bundle

This **language-specific, standalone Agent Skills / Plugin bundle** is not the full source repository. It contains eight English `dw-*` skills, their playbooks, seven optional English templates under `templates/`, `plugin.json`, and release metadata. It does **not** include `bin/`, `lib/`, or `docs/`. Do not execute source-repository CLI commands inside this ZIP.

## Install from this bundle

Choose **one language per destination**. Check for existing `dw-*` directories and do not overwrite user-customized skills.

1. **Codex or Grok Build (project skills):** Extract the ZIP, then copy the eight directories within `skills/` to `<project>/.agents/skills/`, preserving `dw-start/references/`.
2. **Pi Coding Agent (project skills):** Copy those eight directories to `<project>/.pi/skills/`.
3. **Google Antigravity (project plugin):** Copy the *contents* of the extracted bundle to `<project>/.agents/plugins/dev-workflow/`, placing `plugin.json` and `skills/` directly below that directory.
4. **Grok Build native plugin (optional):** If your installed CLI supports it, run `grok plugin validate <extracted-bundle>`. Only after trusting the source, use `grok plugin install <extracted-bundle> --trust`.

Refresh or restart your coding agent and verify that all eight `dw-*` skills appear in discovery. For managed installation, language prompts, upgrades and safe uninstall, clone the **full repository** and run its Node CLI; it is intentionally not bundled here.

The seven files under `templates/` are optional reference templates. Copy them into your project manually when needed; installing the skills does not automatically copy templates.

Full repository: https://github.com/HiAsh02/dev-workflow  
Compatibility and test scope: https://github.com/HiAsh02/dev-workflow/blob/main/docs/COMPATIBILITY.md  
Source installation guide: https://github.com/HiAsh02/dev-workflow/blob/main/README.md

Status: **Beta / Partial**. Filesystem installation does not prove live LLM invocation on every host.
