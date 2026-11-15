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
} from "../../lib/install-plan.mjs";
import { hashDirectoryFiles } from "../../lib/integrity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hostsDir = path.join(repoRoot, "hosts");
const cliPath = path.join(repoRoot, "bin", "dev-workflow.mjs");

function snapshotTree(root) {
  if (!fs.existsSync(root)) return {};
  return hashDirectoryFiles(root);
}

test("install --dry-run is idempotent and writes zero files to disk", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-dryrun-"));
  try {
    const before = snapshotTree(project);
    const res = spawnSync(
      process.execPath,
      [
        cliPath,
        "install",
        "--host",
        "codex",
        "--language",
        "en",
        "--target",
        project,
        "--dry-run",
        "--format",
        "json",
      ],
      { encoding: "utf8" }
    );
    assert.equal(res.status, 0, res.stderr);
    const plan = JSON.parse(res.stdout);
    assert.equal(plan.mode, "skills");
    assert.ok(plan.actions.length > 0);
    assert.ok(plan.actions.every((a) => a.kind === "create"));
    assert.deepEqual(snapshotTree(project), before);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("install, repeat idempotency, conflict preservation, and clean uninstall", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-install-"));
  try {
    // User unrelated file in .agents/skills should never be touched
    const userSkillDir = path.join(project, ".agents/skills/custom-user-skill");
    fs.mkdirSync(userSkillDir, { recursive: true });
    fs.writeFileSync(path.join(userSkillDir, "SKILL.md"), "# User custom skill\n", "utf8");

    const plan1 = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
      mode: "auto",
    });
    const res1 = applyInstallPlan(plan1);
    assert.ok(res1.written.length >= 15);

    // Repeat install must be completely unchanged
    const plan2 = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
      mode: "auto",
    });
    assert.equal(plan2.conflicts.length, 0);
    assert.ok(plan2.actions.every((a) => a.kind === "unchanged"));

    // Modify one installed file locally -> update/install must detect conflict and refuse overwrite
    const targetSkill = path.join(project, ".agents/skills/dw-start/SKILL.md");
    const modifiedContent = "# Locally customized dw-start\n";
    fs.writeFileSync(targetSkill, modifiedContent, "utf8");

    const plan3 = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
      mode: "auto",
    });
    assert.equal(plan3.conflicts.length, 1);
    assert.match(plan3.conflicts[0].reason, /modified locally/i);
    assert.throws(() => applyInstallPlan(plan3), /no-clobber/);
    assert.equal(fs.readFileSync(targetSkill, "utf8"), modifiedContent);

    // Uninstall deletes unmodified owned files, preserves user-modified file and unrelated files
    const unPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
      mode: "auto",
    });
    assert.equal(unPlan.preserved.length, 1);
    assert.equal(unPlan.preserved[0].relative_path, ".agents/skills/dw-start/SKILL.md");

    const unRes = applyUninstallPlan(unPlan);
    assert.ok(unRes.deleted.includes(".agents/skills/dw-build/SKILL.md"));
    assert.equal(fs.existsSync(path.join(project, ".agents/skills/dw-build/SKILL.md")), false);
    assert.equal(fs.readFileSync(targetSkill, "utf8"), modifiedContent);
    assert.equal(
      fs.readFileSync(path.join(userSkillDir, "SKILL.md"), "utf8"),
      "# User custom skill\n"
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("plugin mode and skills mode install identical skill file contents (VAL-10)", () => {
  const projA = fs.mkdtempSync(path.join(os.tmpdir(), "dw-mode-plugin-"));
  const projB = fs.mkdtempSync(path.join(os.tmpdir(), "dw-mode-skills-"));

  try {
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: projA,
        hostsDir,
        host: "antigravity",
        scope: "project",
        mode: "plugin",
      })
    );
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: projB,
        hostsDir,
        host: "codex",
        scope: "project",
        mode: "skills",
      })
    );

    const pluginSkillsHashes = hashDirectoryFiles(
      path.join(projA, ".agents/plugins/dev-workflow/skills")
    );
    const directSkillsHashes = hashDirectoryFiles(path.join(projB, ".agents/skills"));
    assert.deepEqual(pluginSkillsHashes, directSkillsHashes);
  } finally {
    fs.rmSync(projA, { recursive: true, force: true });
    fs.rmSync(projB, { recursive: true, force: true });
  }
});

test("user-scope install requires --confirm-user before writing", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-user-gate-"));
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "dw-fake-home-"));
  try {
    const plan = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      homeDir: fakeHome,
      hostsDir,
      host: "pi",
      scope: "user",
      mode: "skills",
    });
    assert.equal(plan.requires_confirmation, true);
    assert.throws(() => applyInstallPlan(plan, { confirmUser: false }), /--confirm-user/);

    const ok = applyInstallPlan(plan, { confirmUser: true });
    assert.equal(ok.applied, true);
    assert.ok(fs.existsSync(path.join(fakeHome, ".pi/agent/skills/dw-start/SKILL.md")));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});
