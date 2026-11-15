import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyInstallPlan,
  applyUninstallPlan,
  buildInstallPlan,
  buildUninstallPlan,
  readOwnership,
} from "../../lib/install-plan.mjs";
import { sha256File } from "../../lib/safe-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hostsDir = path.join(repoRoot, "hosts");
const cliPath = path.join(repoRoot, "bin", "dev-workflow.mjs");

function makeSourceCopy(version = "0.1.0", pluginExtraDesc = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-r2-src-"));
  for (const rel of ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"]) {
    fs.copyFileSync(path.join(repoRoot, rel), path.join(dir, rel));
  }
  fs.cpSync(path.join(repoRoot, "skills"), path.join(dir, "skills"), { recursive: true });
  fs.writeFileSync(path.join(dir, "VERSION"), `${version}\n`, "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf8"));
  manifest.version = version;
  if (pluginExtraDesc) {
    manifest.description = `${manifest.description} ${pluginExtraDesc}`;
  }
  fs.writeFileSync(path.join(dir, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return dir;
}

test("R2-REG-SOURCE-01: applyInstallPlan rejects source modifications occurring after buildInstallPlan (skills and plugin top-level files)", () => {
  const projSkills = fs.mkdtempSync(path.join(os.tmpdir(), "dw-r2-src01-sk-"));
  const projPlugin = fs.mkdtempSync(path.join(os.tmpdir(), "dw-r2-src01-pl-"));
  const srcA = makeSourceCopy("0.1.0");
  const srcB = makeSourceCopy("0.1.0");

  try {
    // 1. Skills mode: modify skill file between buildInstallPlan and applyInstallPlan
    const planSkills = buildInstallPlan({
      sourceRoot: srcA,
      projectRoot: projSkills,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    fs.appendFileSync(path.join(srcA, "skills/dw-start/SKILL.md"), "\n<!-- source tampered -->\n");

    assert.throws(
      () => applyInstallPlan(planSkills),
      /Source.*TOCTOU|hash mismatch|changed since plan/i
    );
    assert.equal(
      fs.existsSync(path.join(projSkills, ".agents/skills/dw-start/SKILL.md")),
      false,
      "Aborted install must not write target skill files"
    );
    assert.equal(
      readOwnership({ scopeRoot: projSkills, host: "codex", scope: "project", mode: "skills" }),
      null
    );

    // 2. Plugin mode: modify plugin.json between buildInstallPlan and applyInstallPlan
    const planPlugin = buildInstallPlan({
      sourceRoot: srcB,
      projectRoot: projPlugin,
      hostsDir,
      host: "antigravity",
      scope: "project",
      mode: "plugin",
    });
    const edited = JSON.parse(fs.readFileSync(path.join(srcB, "plugin.json"), "utf8"));
    edited.description = "tampered after buildInstallPlan";
    fs.writeFileSync(path.join(srcB, "plugin.json"), `${JSON.stringify(edited, null, 2)}\n`, "utf8");

    assert.throws(
      () => applyInstallPlan(planPlugin),
      /Source.*TOCTOU|hash mismatch|changed since plan/i
    );
    assert.equal(
      fs.existsSync(path.join(projPlugin, ".agents/plugins/dev-workflow/plugin.json")),
      false,
      "Aborted install must not write top-level plugin files"
    );
  } finally {
    fs.rmSync(projSkills, { recursive: true, force: true });
    fs.rmSync(projPlugin, { recursive: true, force: true });
    fs.rmSync(srcA, { recursive: true, force: true });
    fs.rmSync(srcB, { recursive: true, force: true });
  }
});

test("R2-REG-SHARED-VERSION-01: shared .agents/skills blocks silent cross-host overwrite and prevents v2->v1 downgrade unless explicitly coordinated", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-r2-shared-ver-"));
  const srcV1 = makeSourceCopy("1.0.0");
  const srcV2 = makeSourceCopy("2.0.0");
  fs.appendFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), "\n<!-- shared v2 content -->\n");

  try {
    // 1. Install v1 under Codex
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: srcV1,
        projectRoot: project,
        hostsDir,
        host: "codex",
        scope: "project",
      })
    );

    // 2. Grok Build install from v2 WITHOUT upgradeShared -> must report conflict & block silent overwrite
    const uncoordinated = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "grok-build",
      scope: "project",
    });
    assert.ok(uncoordinated.conflicts.length > 0, "Uncoordinated cross-version install on shared path must conflict");
    assert.throws(() => applyInstallPlan(uncoordinated), /no-clobber|shared/i);

    // 3. Coordinated Grok Build install WITH upgradeShared=true -> preview lists affected sibling host 'codex', apply updates both ledgers synchronously
    const coordinated = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "grok-build",
      scope: "project",
      upgradeShared: true,
    });
    assert.equal(coordinated.conflicts.length, 0, JSON.stringify(coordinated.conflicts));
    assert.deepEqual(coordinated.affected_shared_hosts, ["codex"]);
    applyInstallPlan(coordinated);

    const diskSha = sha256File(path.join(project, ".agents/skills/dw-start/SKILL.md"));
    const codexAfter = readOwnership({ scopeRoot: project, host: "codex", scope: "project", mode: "skills" });
    const grokAfter = readOwnership({ scopeRoot: project, host: "grok-build", scope: "project", mode: "skills" });
    assert.equal(codexAfter.data.source_version, "2.0.0");
    assert.equal(grokAfter.data.source_version, "2.0.0");
    assert.equal(codexAfter.data.files[".agents/skills/dw-start/SKILL.md"].sha256, diskSha);
    assert.equal(grokAfter.data.files[".agents/skills/dw-start/SKILL.md"].sha256, diskSha);

    // 4. Subsequent Codex update from v1 -> MUST reject silent v2 -> v1 downgrade (with or without upgradeShared)
    const staleWithoutFlag = buildInstallPlan({
      sourceRoot: srcV1,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
      preferInstalledMode: true,
    });
    assert.ok(staleWithoutFlag.conflicts.length > 0);
    assert.throws(() => applyInstallPlan(staleWithoutFlag), /no-clobber|shared|downgrade/i);

    const staleWithUpgradeFlag = buildInstallPlan({
      sourceRoot: srcV1,
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
      preferInstalledMode: true,
      upgradeShared: true,
    });
    assert.ok(staleWithUpgradeFlag.conflicts.length > 0, "Shared upgrade must still refuse v2 -> v1 downgrade");
    assert.equal(sha256File(path.join(project, ".agents/skills/dw-start/SKILL.md")), diskSha);
    assert.equal(
      readOwnership({ scopeRoot: project, host: "grok-build", scope: "project", mode: "skills" }).data.source_version,
      "2.0.0"
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV1, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("R2-REG-TXN-LEDGER-01: rolls back target files AND primary + sibling ledgers on sibling metadata error, preserves recovery evidence if rollback fails, and does not rollback after commit", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-r2-txn-"));
  const srcV1 = makeSourceCopy("1.0.0");
  const srcV2 = makeSourceCopy("2.0.0");
  fs.appendFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), "\n<!-- txn v2 -->\n");

  try {
    // Baseline: Codex v1 + Grok v1 installed
    applyInstallPlan(buildInstallPlan({ sourceRoot: srcV1, projectRoot: project, hostsDir, host: "codex" }));
    applyInstallPlan(buildInstallPlan({ sourceRoot: srcV1, projectRoot: project, hostsDir, host: "grok-build" }));

    const startPath = path.join(project, ".agents/skills/dw-start/SKILL.md");
    const v1StartBytes = fs.readFileSync(startPath);
    const codexLedgerPath = path.join(project, ".dev-workflow/installs/codex-project-skills.json");
    const grokLedgerPath = path.join(project, ".dev-workflow/installs/grok-build-project-skills.json");
    const v1CodexRaw = fs.readFileSync(codexLedgerPath, "utf8");
    const v1GrokRaw = fs.readFileSync(grokLedgerPath, "utf8");

    // Part A: Fault injected right before sibling ledger commit (after target files and primary ledger wrote!)
    const v2Plan = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "grok-build",
      upgradeShared: true,
    });

    assert.throws(
      () =>
        applyInstallPlan(v2Plan, {
          onPhase: (phase) => {
            if (phase === "before_sibling_ledger_commit") {
              throw new Error("Simulated sibling ledger write failure");
            }
          },
        }),
      /Simulated sibling ledger write failure/
    );

    assert.deepEqual(fs.readFileSync(startPath), v1StartBytes, "Target file must roll back to v1 bytes");
    assert.equal(fs.readFileSync(grokLedgerPath, "utf8"), v1GrokRaw, "Primary ledger must roll back to v1 bytes");
    assert.equal(fs.readFileSync(codexLedgerPath, "utf8"), v1CodexRaw, "Sibling ledger must stay at v1 bytes");

    // Part B: If rollback itself encounters an error, backup directory and incomplete journal MUST be preserved
    assert.throws(
      () =>
        applyInstallPlan(
          buildInstallPlan({
            sourceRoot: srcV2,
            projectRoot: project,
            hostsDir,
            host: "grok-build",
            upgradeShared: true,
          }),
          {
            onPhase: (phase) => {
              if (phase === "before_sibling_ledger_commit") {
                throw new Error("Trigger rollback");
              }
              if (phase === "before_rollback_restore") {
                throw new Error("Simulated rollback disk fault");
              }
            },
          }
        ),
      /Trigger rollback/
    );
    const installsDir = path.join(project, ".dev-workflow/installs");
    assert.equal(fs.existsSync(path.join(installsDir, ".txn-journal.json")), true, "Incomplete rollback must retain .txn-journal.json");
    const backupDirs = fs.readdirSync(installsDir).filter((n) => n.startsWith(".txn-backup-"));
    assert.ok(backupDirs.length >= 1, "Incomplete rollback must retain backup directory");
    const incompleteJournal = JSON.parse(fs.readFileSync(path.join(installsDir, ".txn-journal.json"), "utf8"));
    assert.equal(incompleteJournal.status, "rollback_incomplete");

    // Clean recovery evidence manually only for Part C test setup on fresh clean dir
    fs.rmSync(path.join(installsDir, ".txn-journal.json"), { force: true });
    for (const d of backupDirs) fs.rmSync(path.join(installsDir, d), { recursive: true, force: true });

    // Part C: Post-commit cleanup fault must NOT rollback already committed v2 files/ledgers
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: srcV2,
        projectRoot: project,
        hostsDir,
        host: "grok-build",
        upgradeShared: true,
      }),
      {
        onPhase: (phase) => {
          if (phase === "before_cleanup") {
            throw new Error("Simulated non-fatal cleanup fault");
          }
        },
      }
    );
    assert.match(fs.readFileSync(startPath, "utf8"), /txn v2/);
    assert.equal(
      readOwnership({ scopeRoot: project, host: "codex", scope: "project", mode: "skills" }).data.source_version,
      "2.0.0"
    );
    assert.equal(
      readOwnership({ scopeRoot: project, host: "grok-build", scope: "project", mode: "skills" }).data.source_version,
      "2.0.0"
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV1, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("R2-REG-CRASH-01/02: SIGKILL mid-install and mid-uninstall persist recoverable journal, block unsafe overwrite, and recover idempotently via recover CLI", async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-r2-crash-"));
  const srcV1 = makeSourceCopy("1.0.0");
  const srcV2 = makeSourceCopy("2.0.0");
  fs.appendFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), "\n<!-- v2 crash -->\n");
  fs.appendFileSync(path.join(srcV2, "skills/dw-build/SKILL.md"), "\n<!-- v2 crash -->\n");
  fs.writeFileSync(path.join(project, "user-note.txt"), "keep user note\n", "utf8");

  async function spawnAndSigkillMidFlight(helperScript) {
    const child = spawn(process.execPath, ["--input-type=module", "-e", helperScript], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    await new Promise((resolve, reject) => {
      let buf = "";
      child.stdout.on("data", (chunk) => {
        buf += chunk.toString();
        if (buf.includes("READY_TO_KILL")) {
          child.kill("SIGKILL");
          resolve();
        }
      });
      child.on("exit", (code) => {
        reject(new Error(`Child exited prematurely (${code}): ${stderr}`));
      });
    });
    await new Promise((resolve) => child.on("exit", resolve));
  }

  try {
    // Baseline v1 install
    applyInstallPlan(buildInstallPlan({ sourceRoot: srcV1, projectRoot: project, hostsDir, host: "codex" }));
    const startPath = path.join(project, ".agents/skills/dw-start/SKILL.md");
    const v1StartContent = fs.readFileSync(startPath, "utf8");

    // R2-REG-CRASH-01: SIGKILL child mid-update (after updating 2nd action)
    const installCrashScript = `
      import fs from "node:fs";
      import { buildInstallPlan, applyInstallPlan } from ${JSON.stringify(new URL("../../lib/install-plan.mjs", import.meta.url).href)};
      const plan = buildInstallPlan({
        sourceRoot: ${JSON.stringify(srcV2)},
        projectRoot: ${JSON.stringify(project)},
        hostsDir: ${JSON.stringify(hostsDir)},
        host: "codex",
      });
      const buf = new SharedArrayBuffer(4);
      const arr = new Int32Array(buf);
      let seenUpdates = 0;
      applyInstallPlan(plan, {
        onBeforeAction: (action) => {
          if (action.kind === "update") {
            seenUpdates += 1;
            if (seenUpdates === 2) {
              fs.writeSync(1, "READY_TO_KILL\\n");
              Atomics.wait(arr, 0, 0, 30000);
            }
          }
        }
      });
    `;
    await spawnAndSigkillMidFlight(installCrashScript);

    const installsDir = path.join(project, ".dev-workflow/installs");
    assert.equal(fs.existsSync(path.join(installsDir, ".apply.lock")), true);
    assert.equal(fs.existsSync(path.join(installsDir, ".txn-journal.json")), true);

    // Subsequent normal install MUST fail-closed and NOT wipe journal
    const blockedInstall = spawnSync(
      process.execPath,
      [cliPath, "install", "--host", "codex", "--language", "en", "--target", project, "--format", "json"],
      { encoding: "utf8" }
    );
    assert.notEqual(blockedInstall.status, 0);
    assert.equal(fs.existsSync(path.join(installsDir, ".txn-journal.json")), true);

    // Dry-run recover leaves state intact and reports pending recovery
    const dryRecover = spawnSync(
      process.execPath,
      [cliPath, "recover", "--target", project, "--dry-run", "--format", "json"],
      { encoding: "utf8" }
    );
    assert.equal(dryRecover.status, 0, dryRecover.stderr);
    const dryInfo = JSON.parse(dryRecover.stdout);
    assert.equal(dryInfo.hasPendingRecovery, true);

    // Real recover rolls back crashed update cleanly & releases stale lock
    const doRecover = spawnSync(
      process.execPath,
      [cliPath, "recover", "--target", project, "--apply", "--format", "json"],
      { encoding: "utf8" }
    );
    assert.equal(doRecover.status, 0, doRecover.stderr);
    assert.equal(fs.readFileSync(startPath, "utf8"), v1StartContent);
    assert.equal(fs.existsSync(path.join(installsDir, ".txn-journal.json")), false);
    assert.equal(fs.existsSync(path.join(installsDir, ".apply.lock")), false);
    assert.equal(fs.readFileSync(path.join(project, "user-note.txt"), "utf8"), "keep user note\n");

    // R2-REG-CRASH-02: SIGKILL child mid-uninstall (after deleting 1st file)
    const uninstallCrashScript = `
      import fs from "node:fs";
      import { buildUninstallPlan, applyUninstallPlan } from ${JSON.stringify(new URL("../../lib/install-plan.mjs", import.meta.url).href)};
      const plan = buildUninstallPlan({
        projectRoot: ${JSON.stringify(project)},
        hostsDir: ${JSON.stringify(hostsDir)},
        host: "codex",
      });
      const buf = new SharedArrayBuffer(4);
      const arr = new Int32Array(buf);
      let seenDeletes = 0;
      applyUninstallPlan(plan, {
        onBeforeAction: (action) => {
          if (action.kind === "delete") {
            seenDeletes += 1;
            if (seenDeletes === 2) {
              fs.writeSync(1, "READY_TO_KILL\\n");
              Atomics.wait(arr, 0, 0, 30000);
            }
          }
        }
      });
    `;
    await spawnAndSigkillMidFlight(uninstallCrashScript);

    assert.equal(fs.existsSync(path.join(installsDir, ".txn-journal.json")), true);
    const recoverUninst = spawnSync(
      process.execPath,
      [cliPath, "recover", "--target", project, "--apply", "--format", "json"],
      { encoding: "utf8" }
    );
    assert.equal(recoverUninst.status, 0, recoverUninst.stderr);
    assert.equal(fs.readFileSync(startPath, "utf8"), v1StartContent, "Restored after crashed uninstall");
    assert.equal(fs.existsSync(path.join(installsDir, ".txn-journal.json")), false);
    assert.equal(fs.existsSync(path.join(installsDir, ".apply.lock")), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV1, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("R2-REG-LEDGER-SPOOF-01: spoofed ledger entry inside target prefix outside package manifest is preserved and never deleted on uninstall", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "dw-r2-spoof-"));
  try {
    applyInstallPlan(buildInstallPlan({ sourceRoot: repoRoot, projectRoot: project, hostsDir, host: "codex" }));

    const customUserFile = path.join(project, ".agents/skills/dw-start/references/custom-user.md");
    fs.writeFileSync(customUserFile, "# User private reference inside skills prefix\n", "utf8");
    const customSha = sha256File(customUserFile);

    const ledgerPath = path.join(project, ".dev-workflow/installs/codex-project-skills.json");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    ledger.files[".agents/skills/dw-start/references/custom-user.md"] = {
      sha256: customSha,
      provenance: "created",
    };
    fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

    const unPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      scope: "project",
    });
    assert.ok(
      unPlan.preserved.some(
        (p) => p.relative_path === ".agents/skills/dw-start/references/custom-user.md"
      )
    );
    assert.equal(
      unPlan.actions.some(
        (a) => a.relative_path === ".agents/skills/dw-start/references/custom-user.md" && a.kind === "delete"
      ),
      false
    );

    applyUninstallPlan(unPlan);
    assert.equal(
      fs.existsSync(customUserFile),
      true,
      "User file inside .agents/skills/ must NEVER be deleted via spoofed ledger entry"
    );
    assert.equal(
      fs.readFileSync(customUserFile, "utf8"),
      "# User private reference inside skills prefix\n"
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});
