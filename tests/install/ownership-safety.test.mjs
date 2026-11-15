import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyInstallPlan,
  applyUninstallPlan,
  buildInstallPlan,
  buildUninstallPlan,
  listInstalledPackages,
  readOwnership,
} from "../../lib/install-plan.mjs";
import { sha256File } from "../../lib/safe-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hostsDir = path.join(repoRoot, "hosts");
const cliPath = path.join(repoRoot, "bin", "dev-workflow.mjs");

function copySourceFixture() {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "dw-src-fix-"));
  for (const rel of ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"]) {
    fs.copyFileSync(path.join(repoRoot, rel), path.join(src, rel));
  }
  fs.cpSync(path.join(repoRoot, "skills"), path.join(src, "skills"), { recursive: true });
  return src;
}

test("REG-OWN-01: preexisting byte-identical unowned file is preserved, never claimed, and never overwritten on upgrade", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-own01-"));
  const srcV2 = copySourceFixture();
  try {
    const prePath = path.join(project, ".agents/skills/dw-start/SKILL.md");
    fs.mkdirSync(path.dirname(prePath), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, "skills/dw-start/SKILL.md"), prePath);
    const originalBytes = fs.readFileSync(prePath, "utf8");

    const plan = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    const startAction = plan.actions.find(
      (a) => a.relative_path === ".agents/skills/dw-start/SKILL.md"
    );
    assert.ok(startAction);
    assert.equal(startAction.kind, "preexisting_identical_unowned");

    applyInstallPlan(plan);
    const ownership = readOwnership({
      scopeRoot: project,
      host: "codex",
      scope: "project",
      mode: "skills",
    });
    assert.ok(ownership);
    assert.equal(
      ".agents/skills/dw-start/SKILL.md" in ownership.data.files,
      false,
      "Preexisting unowned file must not be recorded in ownership"
    );

    // Uninstall removes only owned files and preserves preexisting dw-start/SKILL.md
    const unPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    applyUninstallPlan(unPlan);
    assert.equal(fs.existsSync(prePath), true);
    assert.equal(fs.readFileSync(prePath, "utf8"), originalBytes);
    assert.equal(
      fs.existsSync(path.join(project, ".agents/skills/dw-build/SKILL.md")),
      false
    );

    // Re-install then simulate upstream update changing dw-start/SKILL.md: must refuse overwriting unowned file
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "codex",
        scope: "project",
      })
    );
    fs.appendFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), "\n<!-- v2 note -->\n");
    const upgradePlan = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    assert.ok(
      upgradePlan.conflicts.some(
        (c) => c.relative_path === ".agents/skills/dw-start/SKILL.md"
      )
    );
    assert.throws(() => applyInstallPlan(upgradePlan), /no-clobber/);
    assert.equal(fs.readFileSync(prePath, "utf8"), originalBytes);

    // Explicit --adopt takes ownership of byte-identical preexisting file
    const adoptPlan = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
      adopt: true,
    });
    const adoptAction = adoptPlan.actions.find(
      (a) => a.relative_path === ".agents/skills/dw-start/SKILL.md"
    );
    assert.equal(adoptAction.kind, "adopt");
    applyInstallPlan(adoptPlan);
    const adoptedOwnership = readOwnership({
      scopeRoot: project,
      host: "codex",
      scope: "project",
      mode: "skills",
    });
    assert.ok(".agents/skills/dw-start/SKILL.md" in adoptedOwnership.data.files);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("REG-OWN-02: shared .agents/skills installation across codex and grok-build preserves files until last owner uninstalls", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-own02-"));
  const srcV2 = copySourceFixture();
  try {
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "codex",
        scope: "project",
      })
    );
    const grokPlan = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "grok-build",
      scope: "project",
    });
    assert.equal(grokPlan.conflicts.length, 0);
    assert.ok(grokPlan.actions.every((a) => a.kind === "shared_unchanged"));
    applyInstallPlan(grokPlan);

    // Uninstall codex: shared files MUST remain intact on disk for grok-build
    const unCodexPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    assert.ok(
      unCodexPlan.actions.every((a) => a.kind === "retained_shared"),
      `Expected retained_shared actions, got: ${JSON.stringify(unCodexPlan.actions)}`
    );
    applyUninstallPlan(unCodexPlan);

    for (const skill of [
      "dw-start",
      "dw-design",
      "dw-plan",
      "dw-build",
      "dw-debug",
      "dw-review",
      "dw-ship",
      "dw-handoff",
    ]) {
      assert.equal(
        fs.existsSync(path.join(project, `.agents/skills/${skill}/SKILL.md`)),
        true,
        `${skill} must remain for grok-build`
      );
    }

    // Shared upgrade via grok-build when no local edits exist should succeed cleanly
    fs.appendFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), "\n<!-- shared v2 -->\n");
    const upGrok = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "grok-build",
      scope: "project",
    });
    assert.equal(upGrok.conflicts.length, 0);
    applyInstallPlan(upGrok);

    // Local user modification still triggers conflict for shared files
    const startFile = path.join(project, ".agents/skills/dw-start/SKILL.md");
    fs.writeFileSync(startFile, "# local user edit\n", "utf8");
    const conflictCheck = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "grok-build",
      scope: "project",
    });
    assert.ok(conflictCheck.conflicts.length > 0);

    // Restore original shared content and uninstall last owner (grok-build) -> files deleted
    fs.copyFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), startFile);
    const unGrok = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "grok-build",
      scope: "project",
    });
    assert.ok(unGrok.actions.some((a) => a.kind === "delete"));
    applyUninstallPlan(unGrok);
    assert.equal(
      fs.existsSync(path.join(project, ".agents/skills/dw-start/SKILL.md")),
      false
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("REG-RACE-01..03: apply rejects concurrent creates, updates, and uninstalls when disk state changes after plan", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-race-"));
  const srcV2 = copySourceFixture();
  try {
    // REG-RACE-01: file appears after create plan
    const createPlan = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    const raceTarget = path.join(project, ".agents/skills/dw-start/SKILL.md");
    fs.mkdirSync(path.dirname(raceTarget), { recursive: true });
    fs.writeFileSync(raceTarget, "# racing user sentinel\n", "utf8");
    assert.throws(() => applyInstallPlan(createPlan), /TOCTOU|changed on disk|already exists/i);
    assert.equal(fs.readFileSync(raceTarget, "utf8"), "# racing user sentinel\n");
    assert.equal(
      fs.existsSync(path.join(project, ".agents/skills/dw-build/SKILL.md")),
      false,
      "Failed preflight apply must leave target directory untouched"
    );

    // Clean sentinel and perform real v1 install
    fs.rmSync(path.join(project, ".agents"), { recursive: true, force: true });
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "codex",
        scope: "project",
      })
    );

    // REG-RACE-02: user modifies file after update plan
    fs.appendFileSync(path.join(srcV2, "skills/dw-build/SKILL.md"), "\n<!-- v2 -->\n");
    const updatePlan = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    const buildFile = path.join(project, ".agents/skills/dw-build/SKILL.md");
    fs.writeFileSync(buildFile, "# user modified after plan\n", "utf8");
    assert.throws(() => applyInstallPlan(updatePlan), /TOCTOU|changed on disk/i);
    assert.equal(fs.readFileSync(buildFile, "utf8"), "# user modified after plan\n");

    // Restore original v1 file, plan uninstall, then modify a file before applyUninstallPlan
    fs.copyFileSync(path.join(repoRoot, "skills/dw-build/SKILL.md"), buildFile);
    const uninstallPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    fs.writeFileSync(buildFile, "# edited before uninstall apply\n", "utf8");
    assert.throws(() => applyUninstallPlan(uninstallPlan), /TOCTOU|changed on disk/i);
    assert.equal(fs.readFileSync(buildFile, "utf8"), "# edited before uninstall apply\n");
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("REG-TXN-01: fault injection mid-install rolls back updates, deletes, and new files cleanly", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-txn01-"));
  const srcV2 = copySourceFixture();
  try {
    // Install v1 first so rollback must restore updated bytes AND preserve ownership
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "codex",
        scope: "project",
      })
    );
    const v1HashStart = sha256File(path.join(project, ".agents/skills/dw-start/SKILL.md"));
    const v1HashBuild = sha256File(path.join(project, ".agents/skills/dw-build/SKILL.md"));
    const v1OwnershipRaw = fs.readFileSync(
      path.join(project, ".dev-workflow/installs/codex-project-skills.json"),
      "utf8"
    );

    fs.appendFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), "\n<!-- v2 a -->\n");
    fs.appendFileSync(path.join(srcV2, "skills/dw-build/SKILL.md"), "\n<!-- v2 b -->\n");
    fs.writeFileSync(
      path.join(srcV2, "skills/dw-start/references/extra-v2.md"),
      "# new file\n",
      "utf8"
    );

    const v2Plan = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });

    assert.throws(
      () =>
        applyInstallPlan(v2Plan, {
          onBeforeAction: (action, idx) => {
            if (idx === 2) {
              throw new Error("Injected I/O failure on 3rd action");
            }
          },
        }),
      /Injected I\/O failure/
    );

    assert.equal(
      sha256File(path.join(project, ".agents/skills/dw-start/SKILL.md")),
      v1HashStart
    );
    assert.equal(
      sha256File(path.join(project, ".agents/skills/dw-build/SKILL.md")),
      v1HashBuild
    );
    assert.equal(
      fs.existsSync(path.join(project, ".agents/skills/dw-start/references/extra-v2.md")),
      false
    );
    assert.equal(
      fs.readFileSync(
        path.join(project, ".dev-workflow/installs/codex-project-skills.json"),
        "utf8"
      ),
      v1OwnershipRaw
    );
    assert.equal(listInstalledPackages({ scopeRoot: project }).length, 1);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("REG-MODE-01: uninstall --mode auto discovers non-default installed mode cleanly", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-mode01-"));
  try {
    const installRes = spawnSync(
      process.execPath,
      [cliPath, "install", "--host", "antigravity", "--mode", "skills", "--target", project],
      { encoding: "utf8" }
    );
    assert.equal(installRes.status, 0, installRes.stderr);
    assert.equal(
      fs.existsSync(path.join(project, ".agents/skills/dw-start/SKILL.md")),
      true
    );

    // Uninstall omitting --mode (defaults to auto) MUST resolve installed skills mode instead of guessing plugin
    const uninstallRes = spawnSync(
      process.execPath,
      [cliPath, "uninstall", "--host", "antigravity", "--target", project],
      { encoding: "utf8" }
    );
    assert.equal(uninstallRes.status, 0, uninstallRes.stderr);
    assert.equal(
      fs.existsSync(path.join(project, ".agents/skills/dw-start/SKILL.md")),
      false
    );

    // Installing BOTH modes without uninstalling first makes auto ambiguous -> must fail non-destructively
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "antigravity",
        mode: "plugin",
      })
    );
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "antigravity",
        mode: "skills",
      })
    );
    const ambiguous = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "antigravity",
      mode: "auto",
    });
    assert.equal(ambiguous.supported, false);
    assert.match(ambiguous.reason, /explicit --mode/i);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
