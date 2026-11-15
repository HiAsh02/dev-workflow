import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackage } from "../../scripts/package.mjs";
import { verifySourceSync } from "../../scripts/check-source-sync.mjs";
import { scanSensitiveArtifacts } from "../../lib/integrity.mjs";

import crypto from "node:crypto";
import { buildDeterministicZip } from "../../lib/zip.mjs";

import { validatePluginManifest } from "../../lib/manifest.mjs";
import { validateSkillsCollection } from "../../lib/skills.mjs";
import { readZipEntries } from "../../lib/zip.mjs";
import { CORE_SKILLS } from "../../scripts/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("buildPackage produces reproducible dual-language zips and passes source sync verification", () => {
  const outA = fs.mkdtempSync(path.join(os.tmpdir(), "dw-pack-a-"));
  const outB = fs.mkdtempSync(path.join(os.tmpdir(), "dw-pack-b-"));

  try {
    const resA = buildPackage(repoRoot, { outRoot: outA });
    const resB = buildPackage(repoRoot, { outRoot: outB });

    assert.equal(resA.zipSha256, resB.zipSha256);
    assert.deepEqual(resA.bundleHashes, resB.bundleHashes);
    assert.equal(resA.bundles["zh-CN"].zipSha256, resB.bundles["zh-CN"].zipSha256);
    assert.deepEqual(resA.bundles["zh-CN"].bundleHashes, resB.bundles["zh-CN"].bundleHashes);

    const syncOk = verifySourceSync(repoRoot, { outRoot: outA });
    assert.equal(syncOk.valid, true, syncOk.errors.join("; "));

    // Tampering or deleting a file in dist must fail sync verification
    fs.rmSync(path.join(resA.bundleDir, "skills/dw-start/SKILL.md"));
    const syncBroken = verifySourceSync(repoRoot, { outRoot: outA });
    assert.equal(syncBroken.valid, false);
    assert.ok(syncBroken.errors.some((e) => e.includes("Missing file in dist bundle")));
  } finally {
    fs.rmSync(outA, { recursive: true, force: true });
    fs.rmSync(outB, { recursive: true, force: true });
  }
});

test("L-08: language-specific zips unpack to unique canonical 8-skill layouts, pass schema validation, and reject zh-CN tamper", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "dw-l08-"));
  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dw-l08-extract-"));
  const schemaPath = path.join(repoRoot, "schemas/plugin-v1.0.0.schema.json");
  try {
    const built = buildPackage(repoRoot, { outRoot: out });
    for (const locale of ["en", "zh-CN"]) {
      const b = built.bundles[locale];
      assert.equal(b.bundleName, `dev-workflow-${built.version}-${locale}`);
      const entries = readZipEntries(fs.readFileSync(b.zipPath));
      const dest = path.join(extractRoot, locale);
      for (const entry of entries) {
        const target = path.join(dest, entry.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, entry.data);
      }
      const rootBundle = path.join(dest, b.bundleName);
      assert.equal(fs.existsSync(path.join(rootBundle, "locales")), false);
      assert.equal(
        fs.existsSync(path.join(rootBundle, "README.zh-CN.md")),
        locale === "zh-CN"
      );
      const templateNames = fs.readdirSync(path.join(rootBundle, "templates")).sort();
      assert.deepEqual(templateNames, [
        "compatibility-report.md", "design.md", "review.md", "run-state.json",
        "spec.md", "task.md", "worklog.md",
      ]);
      const design = fs.readFileSync(path.join(rootBundle, "templates/design.md"), "utf8");
      if (locale === "zh-CN") {
        assert.match(design, /[\u4e00-\u9fff]/);
      } else {
        assert.match(design, /Design Brief/);
      }
      const standaloneReadme = fs.readFileSync(path.join(rootBundle, "README.md"), "utf8");
      assert.match(standaloneReadme, /distribution bundle/i);
      assert.match(standaloneReadme, /\.agents\/skills/);
      assert.doesNotMatch(standaloneReadme, /\]\(\.\/docs\//);
      assert.doesNotMatch(standaloneReadme, /^node bin\/dev-workflow\.mjs/m);
      if (locale === "zh-CN") {
        const localizedReadme = fs.readFileSync(path.join(rootBundle, "README.zh-CN.md"), "utf8");
        assert.match(localizedReadme, /精简发布包/);
        assert.doesNotMatch(localizedReadme, /\]\(\.\/docs\//);
        assert.doesNotMatch(localizedReadme, /^node bin\/dev-workflow\.mjs/m);
      }
      const manifest = JSON.parse(fs.readFileSync(path.join(rootBundle, "plugin.json"), "utf8"));
      const mRes = validatePluginManifest(manifest, schemaPath);
      assert.equal(mRes.valid, true, mRes.errors.join("; "));
      const sRes = validateSkillsCollection(path.join(rootBundle, "skills"), {
        expectedSkills: CORE_SKILLS,
        requireStandardSections: true,
        locale,
      });
      assert.equal(sRes.valid, true, `[${locale}] ${sRes.errors.join("; ")}`);
    }

    // Tampering zh-CN bundle must fail verifySourceSync
    fs.appendFileSync(
      path.join(built.bundles["zh-CN"].bundleDir, "skills/dw-start/SKILL.md"),
      "\n<!-- tampered -->\n"
    );
    const tamperedSync = verifySourceSync(repoRoot, { outRoot: out });
    assert.equal(tamperedSync.valid, false);
    assert.ok(tamperedSync.errors.some((e) => e.includes("[zh-CN]") && e.includes("Hash mismatch")));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
    fs.rmSync(extractRoot, { recursive: true, force: true });
  }
});

test("scanSensitiveArtifacts rejects .env files and token strings", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dw-secret-scan-"));
  try {
    fs.writeFileSync(path.join(tmp, ".env"), "SECRET=1\n", "utf8");
    fs.writeFileSync(
      path.join(tmp, "note.md"),
      "token: gho_1234567890abcdefghij1234567890\n",
      "utf8"
    );
    const findings = scanSensitiveArtifacts(tmp);
    assert.ok(findings.some((f) => f.includes(".env")));
    assert.ok(findings.some((f) => f.includes("GitHub token")));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("REG-ZIP-01: verifySourceSync rejects tampered zip entries even if SHA256SUMS.txt is rewritten", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "dw-zip-reg-"));
  try {
    const built = buildPackage(repoRoot, { outRoot: out });
    const bundleName = built.bundleName;
    const tamperedZip = buildDeterministicZip([
      {
        path: `${bundleName}/plugin.json`,
        data: Buffer.from(JSON.stringify({ name: "tampered-zip" }), "utf8"),
      },
      {
        path: `${bundleName}/VERSION`,
        data: Buffer.from(built.version, "utf8"),
      },
    ]);
    fs.writeFileSync(built.zipPath, tamperedZip);
    const fakeHash = crypto.createHash("sha256").update(tamperedZip).digest("hex");
    const sumsPath = path.join(out, "SHA256SUMS.txt");
    const oldSums = fs.readFileSync(sumsPath, "utf8").split("\n");
    oldSums[0] = `${fakeHash}  ${bundleName}.zip`;
    fs.writeFileSync(sumsPath, oldSums.join("\n"), "utf8");

    const res = verifySourceSync(repoRoot, { outRoot: out });
    assert.equal(res.valid, false);
    assert.ok(
      res.errors.some((e) => /zip/i.test(e)),
      `Expected zip content verification error, got: ${res.errors.join("; ")}`
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
