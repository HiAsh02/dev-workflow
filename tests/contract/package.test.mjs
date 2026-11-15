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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("buildPackage produces reproducible zip and passes source sync verification", () => {
  const outA = fs.mkdtempSync(path.join(os.tmpdir(), "dw-pack-a-"));
  const outB = fs.mkdtempSync(path.join(os.tmpdir(), "dw-pack-b-"));

  try {
    const resA = buildPackage(repoRoot, { outRoot: outA });
    const resB = buildPackage(repoRoot, { outRoot: outB });

    assert.equal(resA.zipSha256, resB.zipSha256);
    assert.deepEqual(resA.bundleHashes, resB.bundleHashes);

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
    const bundleName = `dev-workflow-${built.version}`;
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
