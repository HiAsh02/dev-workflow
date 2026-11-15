import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureContainedPath,
  findCaseCollisions,
  normalizeRelativePath,
} from "../../lib/safe-files.mjs";
import { buildInstallPlan, buildUninstallPlan } from "../../lib/install-plan.mjs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hostsDir = path.join(repoRoot, "hosts");

test("normalizeRelativePath rejects traversal, absolute paths, Windows drives, and null bytes", () => {
  for (const bad of [
    "",
    "../secret",
    "a/../../b",
    "/etc/passwd",
    "\\Windows\\System32",
    "C:\\Users\\test",
    "a/b\0c",
  ]) {
    assert.equal(normalizeRelativePath(bad).ok, false, `Should reject: ${bad}`);
  }
});

test("ensureContainedPath rejects symlink escapes inside install target", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-escape-proj-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "dw-escape-out-"));
  try {
    fs.mkdirSync(path.join(project, ".agents"), { recursive: true });
    fs.symlinkSync(
      outside,
      path.join(project, ".agents/skills"),
      process.platform === "win32" ? "junction" : undefined
    );

    const check = ensureContainedPath(project, ".agents/skills/dw-start/SKILL.md");
    assert.equal(check.ok, false);
    assert.match(check.error, /escapes root/);

    const plan = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    assert.ok(plan.conflicts.length > 0);
    assert.match(plan.conflicts[0].reason, /Unsafe target path/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("findCaseCollisions flags case-only path collisions for Windows/macOS safety", () => {
  const cols = findCaseCollisions([
    "skills/dw-start/SKILL.md",
    "skills/dw-start/skill.md",
  ]);
  assert.equal(cols.length, 1);
  assert.equal(cols[0].existing, "skills/dw-start/SKILL.md");
  assert.equal(cols[0].duplicate, "skills/dw-start/skill.md");
});

test("uninstall skips tampered ownership entry pointing outside target root", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-tamper-uninst-"));
  const outsideFile = path.join(os.tmpdir(), `dw-outside-${Date.now()}.txt`);
  fs.writeFileSync(outsideFile, "important", "utf8");

  try {
    const installsDir = path.join(project, ".dev-workflow/installs");
    fs.mkdirSync(installsDir, { recursive: true });
    fs.writeFileSync(
      path.join(installsDir, "codex-project-skills.json"),
      JSON.stringify({
        schema_version: 1,
        host: "codex",
        scope: "project",
        mode: "skills",
        files: {
          "../outside.txt": { sha256: "0".repeat(64) },
        },
      }),
      "utf8"
    );

    const plan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    assert.equal(plan.actions.length, 0);
    assert.equal(plan.preserved.length, 1);
    assert.match(plan.preserved[0].reason, /Unsafe path skipped/);
    assert.equal(fs.existsSync(outsideFile), true);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outsideFile, { force: true });
  }
});
