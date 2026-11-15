import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyInstallPlan,
  applyPendingRecovery,
  applyUninstallPlan,
  buildInstallPlan,
  buildUninstallPlan,
  inspectPendingRecovery,
  listInstalledPackages,
  readOwnership,
} from "../../lib/install-plan.mjs";
import { validateSkillsCollection } from "../../lib/skills.mjs";
import { CORE_SKILLS } from "../../scripts/validate.mjs";
import { BILINGUAL_LANGUAGE_PROMPT, parseLanguageSelection } from "../../bin/dev-workflow.mjs";
import { hashDirectoryFiles } from "../../lib/integrity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hostsDir = path.join(repoRoot, "hosts");
const cliPath = path.join(repoRoot, "bin/dev-workflow.mjs");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runCli(args, { cwd = repoRoot, env = process.env, input } = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env,
    input,
    encoding: "utf8",
  });
}

test("L-01: English and zh-CN collections both validate with 8 canonical skills, 7 playbooks, and untouched English skills", () => {
  const enRes = validateSkillsCollection(path.join(repoRoot, "skills"), {
    expectedSkills: CORE_SKILLS,
    requireStandardSections: true,
    locale: "en",
  });
  assert.equal(enRes.valid, true, enRes.errors.join("; "));

  const zhRes = validateSkillsCollection(path.join(repoRoot, "locales/zh-CN/skills"), {
    expectedSkills: CORE_SKILLS,
    requireStandardSections: true,
    locale: "zh-CN",
  });
  assert.equal(zhRes.valid, true, zhRes.errors.join("; "));

  // Verify English skills retain ASCII English headings and were not replaced by Chinese text.
  const enStart = fs.readFileSync(path.join(repoRoot, "skills/dw-start/SKILL.md"), "utf8");
  const zhStart = fs.readFileSync(path.join(repoRoot, "locales/zh-CN/skills/dw-start/SKILL.md"), "utf8");
  assert.match(enStart, /^## Purpose$/m);
  assert.doesNotMatch(enStart, /^## 目的$/m);
  assert.match(zhStart, /^## 目的$/m);
  assert.equal(fs.readdirSync(path.join(repoRoot, "locales/zh-CN/templates")).length, 7);
});

test("L-02: install --language zh-CN and --language en install single canonical skill set with zero duplicate copies", () => {
  const projectZh = makeTempDir("dw-l02-zh-");
  const projectEn = makeTempDir("dw-l02-en-");
  const pluginZh = makeTempDir("dw-l02-plugzh-");

  try {
    const resZh = runCli([
      "install",
      "--host",
      "codex",
      "--language",
      "zh-CN",
      "--target",
      projectZh,
      "--format",
      "json",
    ]);
    assert.equal(resZh.status, 0, resZh.stderr);
    const skillDirsZh = fs.readdirSync(path.join(projectZh, ".agents/skills")).sort();
    assert.deepEqual(skillDirsZh, [...CORE_SKILLS].sort());
    assert.match(
      fs.readFileSync(path.join(projectZh, ".agents/skills/dw-start/SKILL.md"), "utf8"),
      /^## 目的$/m
    );

    const resEn = runCli([
      "install",
      "--host",
      "codex",
      "--language",
      "en",
      "--target",
      projectEn,
      "--format",
      "json",
    ]);
    assert.equal(resEn.status, 0, resEn.stderr);
    assert.match(
      fs.readFileSync(path.join(projectEn, ".agents/skills/dw-start/SKILL.md"), "utf8"),
      /^## Purpose$/m
    );

    const resPlugZh = runCli([
      "install",
      "--host",
      "antigravity",
      "--mode",
      "plugin",
      "--language",
      "zh-CN",
      "--target",
      pluginZh,
      "--format",
      "json",
    ]);
    assert.equal(resPlugZh.status, 0, resPlugZh.stderr);
    assert.equal(fs.existsSync(path.join(pluginZh, ".agents/plugins/dev-workflow/README.zh-CN.md")), true);
    assert.match(
      fs.readFileSync(
        path.join(pluginZh, ".agents/plugins/dev-workflow/skills/dw-start/SKILL.md"),
        "utf8"
      ),
      /^## 目的$/m
    );
  } finally {
    fs.rmSync(projectZh, { recursive: true, force: true });
    fs.rmSync(projectEn, { recursive: true, force: true });
    fs.rmSync(pluginZh, { recursive: true, force: true });
  }
});

test("L-03/L-04: non-TTY rejects omitted/invalid --language with zero writes; interactive prompt maps 1/2; --dry-run writes nothing", () => {
  assert.match(BILINGUAL_LANGUAGE_PROMPT, /简体中文/);
  assert.match(BILINGUAL_LANGUAGE_PROMPT, /English/);
  assert.equal(parseLanguageSelection("1"), "zh-CN");
  assert.equal(parseLanguageSelection("2"), "en");
  assert.equal(parseLanguageSelection("zh-CN"), "zh-CN");
  assert.equal(parseLanguageSelection("en"), "en");
  assert.throws(() => parseLanguageSelection("3"), /Invalid language selection/);

  const project = makeTempDir("dw-l03-nontty-");
  try {
    spawnSync("git", ["init", "-q"], { cwd: project });
    fs.writeFileSync(path.join(project, "tracked.txt"), "clean\n", "utf8");
    spawnSync("git", ["add", "tracked.txt"], { cwd: project });
    spawnSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-q", "-m", "init"],
      { cwd: project }
    );

    const beforeTree = hashDirectoryFiles(project);

    const missingLang = runCli(["install", "--host", "codex", "--target", project]);
    assert.notEqual(missingLang.status, 0);
    assert.match(missingLang.stderr, /--language/);
    assert.deepEqual(hashDirectoryFiles(project), beforeTree);

    const invalidLang = runCli(["install", "--host", "codex", "--language", "fr", "--target", project]);
    assert.notEqual(invalidLang.status, 0);
    assert.match(invalidLang.stderr, /Unsupported language/);
    assert.deepEqual(hashDirectoryFiles(project), beforeTree);

    // L-04: --dry-run --language zh-CN makes zero target, ledger, or git index writes
    const dryZh = runCli([
      "install",
      "--host",
      "codex",
      "--language",
      "zh-CN",
      "--target",
      project,
      "--dry-run",
      "--format",
      "json",
    ]);
    assert.equal(dryZh.status, 0, dryZh.stderr);
    const dryJson = JSON.parse(dryZh.stdout);
    assert.equal(dryJson.language, "zh-CN");
    assert.deepEqual(hashDirectoryFiles(project), beforeTree);
    const gitStatus = spawnSync("git", ["status", "--short"], { cwd: project, encoding: "utf8" });
    assert.equal(gitStatus.stdout.trim(), "");
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("L-03b (POSIX PTY): interactive TTY prompts in bilingual text and installs chosen option 1 (zh-CN)", { skip: process.platform === "win32" }, () => {
  const pyCheck = spawnSync("python3", ["-c", "import pty"], { encoding: "utf8" });
  if (pyCheck.status !== 0) return;

  const project = makeTempDir("dw-l03-pty-");
  try {
    const pyScript = [
      "import os, pty, select, subprocess, sys",
      "master, slave = pty.openpty()",
      "p = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave, close_fds=True)",
      "os.close(slave)",
      "out = b''",
      "sent = False",
      "while True:",
      "  r, _, _ = select.select([master], [], [], 10)",
      "  if not r:",
      "    break",
      "  try:",
      "    chunk = os.read(master, 4096)",
      "  except OSError:",
      "    break",
      "  if not chunk:",
      "    break",
      "  out += chunk",
      "  if not sent and b'zh-CN' in out and b'English' in out:",
      "    os.write(master, b'1\\n')",
      "    sent = True",
      "os.close(master)",
      "rc = p.wait(timeout=10)",
      "sys.stdout.buffer.write(out)",
      "sys.exit(rc)",
    ].join("\n");
    const res = spawnSync(
      "python3",
      ["-c", pyScript, process.execPath, cliPath, "install", "--host", "codex", "--target", project],
      { encoding: "utf8", timeout: 15000 }
    );
    assert.equal(res.status, 0, res.stderr || res.stdout);
    assert.match(res.stdout, /简体中文/);
    assert.match(
      fs.readFileSync(path.join(project, ".agents/skills/dw-start/SKILL.md"), "utf8"),
      /^## 目的$/m
    );
    const ledger = readOwnership({ scopeRoot: project, host: "codex", scope: "project", mode: "skills", hostsDir });
    assert.equal(ledger.data.language, "zh-CN");
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("L-05/L-06: update preserves legacy/recorded language automatically; explicit language switch honors no-clobber and uninstalls cleanly", () => {
  const project = makeTempDir("dw-l05-l06-");
  try {
    // Non-TTY update WITHOUT prior installation MUST fail requiring --language
    const freshUpdateMissing = runCli(["update", "--host", "codex", "--target", project]);
    assert.notEqual(freshUpdateMissing.status, 0);
    assert.match(freshUpdateMissing.stderr, /--language/);

    // Install English, then strip `language` field to simulate legacy v1/v2 ledger
    assert.equal(
      runCli(["install", "--host", "codex", "--language", "en", "--target", project]).status,
      0
    );
    const ledgerPath = path.join(project, ".dev-workflow/installs/codex-project-skills.json");
    const legacy = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    delete legacy.language;
    fs.writeFileSync(ledgerPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

    // `list` defaults legacy records to `en` (never zh-CN)
    const listRes = runCli(["list", "--target", project, "--format", "json"]);
    assert.equal(listRes.status, 0, listRes.stderr);
    const listed = JSON.parse(listRes.stdout);
    assert.equal(listed.installations[0].language, "en");

    // `update` without `--language` preserves `en` cleanly
    const upKeepEn = runCli(["update", "--host", "codex", "--target", project, "--format", "json"]);
    assert.equal(upKeepEn.status, 0, upKeepEn.stderr);
    const upKeepParsed = JSON.parse(upKeepEn.stdout);
    assert.equal(upKeepParsed.plan.language, "en");
    assert.match(
      fs.readFileSync(path.join(project, ".agents/skills/dw-start/SKILL.md"), "utf8"),
      /^## Purpose$/m
    );

    // Local user modification blocks language switch (no-clobber!)
    const targetBuild = path.join(project, ".agents/skills/dw-build/SKILL.md");
    const origBuild = fs.readFileSync(targetBuild, "utf8");
    fs.writeFileSync(targetBuild, "# User customized dw-build\n", "utf8");
    const blockedSwitch = runCli(["update", "--host", "codex", "--language", "zh-CN", "--target", project]);
    assert.notEqual(blockedSwitch.status, 0);
    assert.equal(fs.readFileSync(targetBuild, "utf8"), "# User customized dw-build\n");

    // Restore clean unmodified file -> explicit switch succeeds and records language_change + zh-CN
    fs.writeFileSync(targetBuild, origBuild, "utf8");
    const switchRes = runCli([
      "update",
      "--host",
      "codex",
      "--language",
      "zh-CN",
      "--target",
      project,
      "--format",
      "json",
    ]);
    assert.equal(switchRes.status, 0, switchRes.stderr);
    const switchJson = JSON.parse(switchRes.stdout);
    assert.deepEqual(switchJson.plan.language_change, { from: "en", to: "zh-CN" });
    assert.match(
      fs.readFileSync(path.join(project, ".agents/skills/dw-start/SKILL.md"), "utf8"),
      /^## 目的$/m
    );

    // Uninstall removes switched zh-CN version cleanly without prompting
    const unRes = runCli(["uninstall", "--host", "codex", "--target", project, "--format", "json"]);
    assert.equal(unRes.status, 0, unRes.stderr);
    const unJson = JSON.parse(unRes.stdout);
    assert.equal(unJson.language, "zh-CN");
    assert.equal(unJson.complete_uninstall, true);
    assert.equal(fs.existsSync(path.join(project, ".agents/skills/dw-start/SKILL.md")), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("L-07: cross-host shared directory refuses mixing en and zh-CN (even with --upgrade-shared) until existing consumers uninstall", () => {
  const project = makeTempDir("dw-l07-");
  try {
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "en",
      })
    );
    const startAbs = path.join(project, ".agents/skills/dw-start/SKILL.md");
    const enBytesBefore = fs.readFileSync(startAbs, "utf8");

    // Grok tries to install zh-CN without --upgrade-shared AND with --upgrade-shared: BOTH MUST conflict!
    for (const upgradeShared of [false, true]) {
      const conflictPlan = buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "grok-build",
        language: "zh-CN",
        upgradeShared,
      });
      assert.ok(
        conflictPlan.conflicts.some((c) => c.reason.includes("Cross-language mixing")),
        `Expected cross-language conflict (upgradeShared=${upgradeShared})`
      );
      assert.throws(() => applyInstallPlan(conflictPlan), /conflicts/i);
    }
    assert.equal(fs.readFileSync(startAbs, "utf8"), enBytesBefore);

    // Uninstall Codex first, then Grok + Codex can share zh-CN cleanly.
    applyUninstallPlan(buildUninstallPlan({ projectRoot: project, hostsDir, host: "codex" }));
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "grok-build",
        language: "zh-CN",
      })
    );
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "zh-CN",
      })
    );
    const listAll = listInstalledPackages({ scopeRoot: project, hostsDir });
    assert.equal(listAll.length, 2);
    assert.ok(listAll.every((i) => i.language === "zh-CN"));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("L-09: recovery after interrupted zh-CN switch preserves pre-crash language; WAL vs ledger language mismatch fails closed", () => {
  const project = makeTempDir("dw-l09-");
  try {
    applyInstallPlan(
      buildInstallPlan({
        sourceRoot: repoRoot,
        projectRoot: project,
        hostsDir,
        host: "codex",
        language: "zh-CN",
      })
    );
    fs.writeFileSync(path.join(project, "user-file.md"), "important\n", "utf8");

    // Fault mid explicit switch zh-CN -> en; rollback must restore zh-CN seamlessly via applyPendingRecovery.
    const switchPlan = buildInstallPlan({
      sourceRoot: repoRoot,
      projectRoot: project,
      hostsDir,
      host: "codex",
      language: "en",
    });
    assert.throws(
      () =>
        applyInstallPlan(switchPlan, {
          onPhase: (phase) => {
            if (phase === "before_ledger_commit" || phase === "before_rollback_restore") {
              throw new Error("Simulated switch crash");
            }
          },
        }),
      /Simulated switch crash/
    );
    const probe = inspectPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(probe.ok, true, probe.journal?.error);
    const rec = applyPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(rec.recovered, true);
    assert.match(
      fs.readFileSync(path.join(project, ".agents/skills/dw-start/SKILL.md"), "utf8"),
      /^## 目的$/m
    );
    assert.equal(fs.readFileSync(path.join(project, "user-file.md"), "utf8"), "important\n");

    // Simulate tampered WAL whose language disagrees with ledger language (with no language_change) -> MUST fail-closed!
    assert.throws(
      () =>
        applyInstallPlan(
          buildInstallPlan({
            sourceRoot: repoRoot,
            projectRoot: project,
            hostsDir,
            host: "codex",
            language: "zh-CN",
            sourceRef: "next",
          }),
          {
            onPhase: (phase) => {
              if (phase === "before_ledger_commit" || phase === "before_rollback_restore") {
                throw new Error("Crash for mismatch test");
              }
            },
          }
        ),
      /Crash for mismatch test/
    );
    const journalPath = path.join(project, ".dev-workflow/installs/.txn-journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    journal.language = "en";
    delete journal.language_change;
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");

    const mismatchProbe = inspectPendingRecovery({ projectRoot: project, hostsDir });
    assert.equal(mismatchProbe.ok, false);
    assert.equal(mismatchProbe.action, "manual_inspection_required");
    assert.match(mismatchProbe.journal.error, /conflicts with ownership ledger/i);
    assert.throws(
      () => applyPendingRecovery({ projectRoot: project, hostsDir, forceUnlock: true }),
      /conflicts with ownership ledger/i
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("L-10: isolated HOME discovery detects all 8 skills for both en and zh-CN when grok binary is installed", () => {
  const grokCheck = spawnSync("grok", ["--version"], { encoding: "utf8" });
  if (grokCheck.status !== 0) return;

  for (const language of ["en", "zh-CN"]) {
    const fakeHome = makeTempDir(`dw-l10-grok-${language}-`);
    try {
      const inst = runCli(
        [
          "install",
          "--host",
          "grok-build",
          "--scope",
          "user",
          "--language",
          language,
          "--confirm-user",
          "--format",
          "json",
        ],
        { env: { ...process.env, HOME: fakeHome } }
      );
      assert.equal(inst.status, 0, inst.stderr);

      const inspect = spawnSync("grok", ["inspect", "--json"], {
        cwd: fakeHome,
        env: { ...process.env, HOME: fakeHome },
        encoding: "utf8",
      });
      assert.equal(inspect.status, 0, inspect.stderr);
      const parsed = JSON.parse(inspect.stdout);
      const dwSkills = (parsed.skills ?? []).filter((s) => s.name.startsWith("dw-"));
      assert.deepEqual(dwSkills.map((s) => s.name).sort(), [...CORE_SKILLS].sort());
      const startSkill = dwSkills.find((s) => s.name === "dw-start");
      if (language === "zh-CN") {
        assert.match(startSkill.description, /统一入口/);
      } else {
        assert.match(startSkill.description, /Single entry point/);
      }
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  }
});
