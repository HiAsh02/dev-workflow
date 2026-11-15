import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashDirectoryFiles, scanSensitiveArtifacts } from "../lib/integrity.mjs";
import { sha256File } from "../lib/safe-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TOP_LEVEL_FILES = ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"];

export function verifySourceSync(
  rootDir = repoRoot,
  { outRoot = path.join(rootDir, "dist") } = {}
) {
  const errors = [];
  const versionPath = path.join(rootDir, "VERSION");
  if (!fs.existsSync(versionPath)) {
    return { valid: false, errors: ["Missing VERSION"] };
  }
  const version = fs.readFileSync(versionPath, "utf8").trim();
  const bundleName = `dev-workflow-${version}`;
  const bundleDir = path.join(outRoot, bundleName);
  const zipPath = path.join(outRoot, `${bundleName}.zip`);

  if (!fs.existsSync(bundleDir)) {
    return {
      valid: false,
      errors: [`Missing dist bundle directory '${bundleDir}'. Run 'npm run pack' first.`],
    };
  }
  if (!fs.existsSync(zipPath)) {
    errors.push(`Missing dist zip '${zipPath}'`);
  }

  const expectedHashes = {};
  for (const rel of TOP_LEVEL_FILES) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`Missing source file '${rel}'`);
    } else {
      expectedHashes[rel] = sha256File(abs);
    }
  }

  const sourceSkillsHashes = hashDirectoryFiles(path.join(rootDir, "skills"));
  for (const [rel, hash] of Object.entries(sourceSkillsHashes)) {
    expectedHashes[`skills/${rel}`] = hash;
  }

  const distHashes = hashDirectoryFiles(bundleDir);

  for (const [rel, expectedHash] of Object.entries(expectedHashes)) {
    if (!(rel in distHashes)) {
      errors.push(`Missing file in dist bundle: '${rel}'`);
    } else if (distHashes[rel] !== expectedHash) {
      errors.push(`Hash mismatch between source and dist for '${rel}'`);
    }
  }
  for (const rel of Object.keys(distHashes)) {
    if (!(rel in expectedHashes)) {
      errors.push(`Unexpected extra file in dist bundle: '${rel}'`);
    }
  }

  const sensitive = scanSensitiveArtifacts(bundleDir);
  errors.push(...sensitive);

  const checksumsPath = path.join(outRoot, "SHA256SUMS.txt");
  if (!fs.existsSync(checksumsPath)) {
    errors.push("Missing dist/SHA256SUMS.txt");
  } else if (fs.existsSync(zipPath)) {
    const actualZipHash = sha256File(zipPath);
    const sumsText = fs.readFileSync(checksumsPath, "utf8");
    if (!sumsText.includes(`${actualZipHash}  ${bundleName}.zip`)) {
      errors.push("dist/SHA256SUMS.txt does not match actual zip sha256");
    }
  }

  return {
    valid: errors.length === 0,
    version,
    bundleDir,
    fileCount: Object.keys(distHashes).length,
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = verifySourceSync(repoRoot);
  if (!res.valid) {
    for (const err of res.errors) console.error(`ERROR: ${err}`);
    process.exit(1);
  }
  console.log(`Source sync verified (${res.fileCount} files in ${res.bundleDir}).`);
}
