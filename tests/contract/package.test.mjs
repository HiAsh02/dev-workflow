import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackage } from "../../scripts/package.mjs";
import { verifySourceSync } from "../../scripts/check-source-sync.mjs";
import { scanSensitiveArtifacts } from "../../lib/integrity.mjs";

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
