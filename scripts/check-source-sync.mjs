import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashDirectoryFiles, scanSensitiveArtifacts } from "../lib/integrity.mjs";
import { normalizeRelativePath, sha256Buffer, sha256File } from "../lib/safe-files.mjs";
import { readZipEntries } from "../lib/zip.mjs";

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
    const zipBuf = fs.readFileSync(zipPath);
    const actualZipHash = sha256Buffer(zipBuf);
    const sumsText = fs.readFileSync(checksumsPath, "utf8");
    if (!sumsText.includes(`${actualZipHash}  ${bundleName}.zip`)) {
      errors.push("dist/SHA256SUMS.txt does not match actual zip sha256");
    }

    try {
      const zipEntries = readZipEntries(zipBuf);
      const prefix = `${bundleName}/`;
      const zipHashes = {};
      for (const entry of zipEntries) {
        if (!entry.path.startsWith(prefix)) {
          errors.push(`Zip entry outside expected prefix '${prefix}': '${entry.path}'`);
          continue;
        }
        const rel = entry.path.slice(prefix.length);
        const norm = normalizeRelativePath(rel);
        if (!norm.ok) {
          errors.push(`Unsafe zip entry path '${entry.path}': ${norm.error}`);
          continue;
        }
        zipHashes[norm.relativePosix] = sha256Buffer(entry.data);
      }
      for (const [rel, expectedHash] of Object.entries(expectedHashes)) {
        if (!(rel in zipHashes)) {
          errors.push(`Missing file in zip archive: '${rel}'`);
        } else if (zipHashes[rel] !== expectedHash) {
          errors.push(`Zip entry hash mismatch vs source for '${rel}'`);
        }
      }
      for (const rel of Object.keys(zipHashes)) {
        if (!(rel in expectedHashes)) {
          errors.push(`Unexpected extra file in zip archive: '${rel}'`);
        }
      }
    } catch (err) {
      errors.push(`Failed to verify zip archive contents: ${err.message}`);
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
