import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  applyInstallPlan,
  applyPendingRecovery,
  applyUninstallPlan,
  buildInstallPlan,
  buildUninstallPlan,
  inspectPendingRecovery,
  readOwnership,
} from "../../lib/install-plan.mjs";
import { sha256File } from "../../lib/safe-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hostsDir = path.join(repoRoot, "hosts");
const startSkillText = fs.readFileSync(path.join(repoRoot, "skills/dw-start/SKILL.md"), "utf8");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeCustomSource(version = "1.0.0", extras = {}) {
  const dir = makeTempDir("dw-r4-src-");
  fs.mkdirSync(path.join(dir, "skills/dw-start"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "skills/dw-start/SKILL.md"),
    `${startSkillText}\n<!-- build ${version} -->\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "VERSION"), `${version}\n`, "utf8");
  for (const [rel, content] of Object.entries(extras)) {
    const abs = path.join(dir, "skills", rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
  return dir;
}

test("R4-REG-OWNER-RACE-01: rejects stale install/uninstall plans with PLAN_STALE when ownership ledger set or SHA changes before apply", () => {
  const project = makeTempDir("dw-r4-race-");
  const srcV1 = makeCustomSource("1.0.0");
  const srcV2 = makeCustomSource("2.0.0");
  // Differentiate v2 content so update actually modifies target bytes when authorized.
  fs.appendFileSync(path.join(srcV2, "skills/dw-start/SKILL.md"), "<!-- v2 delta -->\n", "utf8");

  try {
    // 1. Cross-host race: Codex v1 installed -> Codex builds v2 plan -> Grok v1 joins -> Codex apply MUST throw PLAN_STALE
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: srcV1,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "en",
      })
    );

    const staleCodexPlan = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "codex",
      language: "en",
    });
    assert.deepEqual(staleCodexPlan.conflicts, []);
    assert.equal(staleCodexPlan.upgrade_shared, false);

    // Competing host installs v1 in same shared .agents/skills before Codex applies staleCodexPlan.
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: srcV1,
        projectRoot: project,
        hostsDir,
        host: "grok-build",
        language: "en",
      })
    );

    const skillAbs = path.join(project, ".agents/skills/dw-start/SKILL.md");
    const grokLedgerBefore = readOwnership({
      scopeRoot: project,
      host: "grok-build",
      scope: "project",
      mode: "skills",
      hostsDir,
    });
    const skillBytesBefore = fs.readFileSync(skillAbs, "utf8");

    assert.throws(
      () => applyInstallPlan(staleCodexPlan),
      (err) => err && err.code === "PLAN_STALE" && /PLAN_STALE/.test(err.message)
    );
    assert.equal(fs.readFileSync(skillAbs, "utf8"), skillBytesBefore);
    assert.equal(fs.existsSync(path.join(project, ".dev-workflow/installs/.txn-journal.json")), false);

    const grokLedgerAfterReject = readOwnership({
      scopeRoot: project,
      host: "grok-build",
      scope: "project",
      mode: "skills",
      hostsDir,
    });
    assert.equal(grokLedgerAfterReject.data.source_version, grokLedgerBefore.data.source_version);

    // 2. Refreshing plan WITH --upgrade-shared now sees Grok and upgrades both cleanly.
    const coordinatedPlan = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "codex",
      language: "en",
      upgradeShared: true,
    });
    assert.deepEqual(coordinatedPlan.affected_shared_hosts, ["grok-build"]);
    applyInstallPlan(coordinatedPlan);
    assert.equal(
      readOwnership({ scopeRoot: project, host: "grok-build", scope: "project", mode: "skills", hostsDir })
        .data.source_version,
      "2.0.0"
    );

    // 3. Same-host metadata-only ledger change before apply also throws PLAN_STALE.
    const metaPlan = buildInstallPlan({
      sourceRoot: srcV2,
      projectRoot: project,
      hostsDir,
      host: "codex",
      language: "en",
      sourceRef: "meta-b",
      upgradeShared: true,
    });
    const codexLedgerPath = path.join(project, ".dev-workflow/installs/codex-project-skills.json");
    const codexLedgerJson = JSON.parse(fs.readFileSync(codexLedgerPath, "utf8"));
    codexLedgerJson.source_ref = "meta-external";
    fs.writeFileSync(codexLedgerPath, `${JSON.stringify(codexLedgerJson, null, 2)}\n`, "utf8");
    assert.throws(
      () => applyInstallPlan(metaPlan),
      (err) => err && err.code === "PLAN_STALE"
    );

    // 4. Uninstall plan becomes stale when sibling ledger changes between buildUninstallPlan and applyUninstallPlan.
    const grokUninstallPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "grok-build",
    });
    codexLedgerJson.source_ref = "meta-external-2";
    fs.writeFileSync(codexLedgerPath, `${JSON.stringify(codexLedgerJson, null, 2)}\n`, "utf8");
    assert.throws(
      () => applyUninstallPlan(grokUninstallPlan),
      (err) => err && err.code === "PLAN_STALE"
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(srcV1, { recursive: true, force: true });
    fs.rmSync(srcV2, { recursive: true, force: true });
  }
});

test("R4-REG-MANIFEST-DRIFT-01: crash recovery validates custom --source files via persisted journal source_manifest even when absent from default repo", () => {
  const project = makeTempDir("dw-r4-drift1-");
  const customSrc = makeCustomSource("1.0.0", {
    "dw-start/references/custom.md": "# Custom extension file\n",
  });
  fs.writeFileSync(path.join(project, "user-work.txt"), "keep me\n", "utf8");

  try {
    const plan = buildInstallPlan({
      sourceRoot: customSrc,
      projectRoot: project,
      hostsDir,
      host: "codex",
      language: "en",
    });
    assert.throws(
      () =>
        applyInstallPlan(plan, {
          onPhase: (phase) => {
            if (phase === "before_ledger_commit" || phase === "before_rollback_restore") {
              throw new Error("Simulated crash with custom source");
            }
          },
        }),
      /Simulated crash/
    );

    const customAbs = path.join(project, ".agents/skills/dw-start/references/custom.md");
    assert.equal(fs.existsSync(customAbs), true);

    // DEFAULT_PACKAGE_ROOT does NOT contain custom.md, yet recovery validates journal.source_manifest + package_digest!
    const probe = inspectPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(probe.ok, true, probe.journal?.error);
    assert.equal(probe.hasPendingRecovery, true);
    assert.equal(probe.action, "rollback_transaction");

    const rec = applyPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(rec.recovered, true);
    assert.equal(fs.existsSync(customAbs), false, "Rollback removes installer-created custom.md");
    assert.equal(fs.readFileSync(path.join(project, "user-work.txt"), "utf8"), "keep me\n");
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(customSrc, { recursive: true, force: true });
  }
});

test("R4-REG-MANIFEST-DRIFT-02: crash during update/uninstall retiring an older file recovers safely using prior_source_manifest/backup", () => {
  const project = makeTempDir("dw-r4-drift2-");
  const oldSrc = makeCustomSource("1.0.0", {
    "dw-start/references/removed.md": "# Legacy reference removed in v2\n",
  });
  const newSrc = makeCustomSource("2.0.0");

  try {
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: oldSrc,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "en",
      })
    );
    const removedAbs = path.join(project, ".agents/skills/dw-start/references/removed.md");
    assert.equal(fs.existsSync(removedAbs), true);

    // Crash right after deleting removed.md during update to v2 (neither v2 nor DEFAULT_PACKAGE_ROOT has removed.md)
    const upPlan = buildInstallPlan({
      sourceRoot: newSrc,
      projectRoot: project,
      hostsDir,
      host: "codex",
      language: "en",
    });
    assert.throws(
      () =>
        applyInstallPlan(upPlan, {
          onPhase: (phase) => {
            if (phase === "before_ledger_commit" || phase === "before_rollback_restore") {
              throw new Error("Simulated v2 update crash");
            }
          },
        }),
      /Simulated v2 update crash/
    );
    assert.equal(fs.existsSync(removedAbs), false);

    const probe = inspectPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(probe.ok, true, probe.journal?.error);
    const rec = applyPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(rec.recovered, true);
    assert.equal(fs.existsSync(removedAbs), true);
    assert.equal(fs.readFileSync(removedAbs, "utf8"), "# Legacy reference removed in v2\n");
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(oldSrc, { recursive: true, force: true });
    fs.rmSync(newSrc, { recursive: true, force: true });
  }
});

test("R4-REG-WAL-ORIGIN-01: forged WAL journals without genuine transaction origin/backupDir are rejected fail-closed even with --force-unlock", () => {
  const project = makeTempDir("dw-r4-wal-origin-");
  const src = makeCustomSource("1.0.0");
  try {
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: src,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "en",
      })
    );
    const skillAbs = path.join(project, ".agents/skills/dw-start/SKILL.md");
    const skillSha = sha256File(skillAbs);
    const installsDir = path.join(project, ".dev-workflow/installs");
    const journalPath = path.join(installsDir, ".txn-journal.json");
    const tid = crypto.randomUUID();
    const backupRel = `.dev-workflow/installs/.txn-backup-install-${tid}`;

    // Case A: Forged WAL with whitelisted path & matching SHA, but backupDir does not exist on disk
    const forgedMissingBackup = {
      schema_version: 2,
      transaction_id: tid,
      operation: "install",
      host: "codex",
      scope: "project",
      mode: "skills",
      language: "en",
      target_root: ".agents/skills",
      status: "in_progress",
      backupDir: backupRel,
      undoEntries: [
        {
          type: "delete_created",
          state: "applied",
          relative_path: ".agents/skills/dw-start/SKILL.md",
          before_sha: null,
          after_sha: skillSha,
        },
      ],
    };
    fs.writeFileSync(journalPath, `${JSON.stringify(forgedMissingBackup, null, 2)}\n`, "utf8");
    const probeA = inspectPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(probeA.ok, false);
    assert.equal(probeA.action, "manual_inspection_required");
    assert.throws(() => applyPendingRecovery({ projectRoot: project, hostsDir, forceUnlock: true }), /backup directory|Corrupt/);
    assert.equal(fs.existsSync(skillAbs), true);

    // Case B: Attacker also creates empty backupDir trying to trick delete_created on an already-owned file
    fs.mkdirSync(path.join(project, backupRel), { recursive: true });
    const probeB = inspectPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(probeB.ok, false);
    assert.throws(
      () => applyPendingRecovery({ projectRoot: project, hostsDir, forceUnlock: true }),
      /already-owned file/i
    );
    assert.equal(fs.existsSync(skillAbs), true);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(src, { recursive: true, force: true });
  }
});

test("R4-REG-UNINSTALL-HISTORY-01: uninstall uses verified installed source_manifest across source drift and flags partial_uninstall + remaining_owned_files accurately", () => {
  const project = makeTempDir("dw-r4-uninst-");
  const customSrc = makeCustomSource("1.0.0", {
    "dw-start/references/custom.md": "# Installed from custom build\n",
  });

  try {
    // 1. Complete uninstall using historical source_manifest even when uninstalling with DEFAULT_PACKAGE_ROOT
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: customSrc,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "en",
      })
    );
    const customAbs = path.join(project, ".agents/skills/dw-start/references/custom.md");
    assert.equal(fs.existsSync(customAbs), true);

    const cleanPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      sourceRoot: repoRoot, // repoRoot does NOT contain custom.md
    });
    assert.equal(cleanPlan.partial_uninstall, false);
    assert.equal(cleanPlan.complete_uninstall, true);
    assert.deepEqual(cleanPlan.remaining_owned_files, []);

    const cleanRes = applyUninstallPlan(cleanPlan);
    assert.equal(cleanRes.partial_uninstall, false);
    assert.equal(cleanRes.complete_uninstall, true);
    assert.equal(fs.existsSync(customAbs), false, "Historical source_manifest allows clean deletion of custom.md");
    assert.equal(fs.existsSync(path.join(project, ".dev-workflow/installs/codex-project-skills.json")), false);

    // 2. Partial uninstall: legacy ledger lacking source_manifest + extra unverified file + user edit -> fail-closed partial report
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: customSrc,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "en",
      })
    );
    const ledgerPath = path.join(project, ".dev-workflow/installs/codex-project-skills.json");
    const legacyLedger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    delete legacyLedger.source_manifest;
    delete legacyLedger.package_digest;
    fs.writeFileSync(ledgerPath, `${JSON.stringify(legacyLedger, null, 2)}\n`, "utf8");

    const partialPlan = buildUninstallPlan({
      projectRoot: project,
      hostsDir,
      host: "codex",
      sourceRoot: repoRoot,
    });
    assert.equal(partialPlan.partial_uninstall, true);
    assert.equal(partialPlan.complete_uninstall, false);
    assert.ok(partialPlan.remaining_owned_files.includes(".agents/skills/dw-start/references/custom.md"));
    assert.ok(partialPlan.manual_remediation.length > 0);

    const partialRes = applyUninstallPlan(partialPlan);
    assert.equal(partialRes.partial_uninstall, true);
    assert.equal(partialRes.complete_uninstall, false);
    assert.ok(partialRes.remaining_owned_files.includes(".agents/skills/dw-start/references/custom.md"));
    assert.equal(fs.existsSync(customAbs), true, "Legacy ledger without source_manifest preserves custom.md fail-closed");
    assert.equal(fs.existsSync(ledgerPath), true, "Retained ledger stays on disk when remaining_owned_files is non-empty");
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(customSrc, { recursive: true, force: true });
  }
});
