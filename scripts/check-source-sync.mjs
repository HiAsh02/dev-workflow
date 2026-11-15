import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashDirectoryFiles, scanSensitiveArtifacts } from "../lib/integrity.mjs";
import { validatePluginManifest } from "../lib/manifest.mjs";
import { normalizeRelativePath, sha256Buffer, sha256File } from "../lib/safe-files.mjs";
import { SUPPORTED_LOCALES, validateSkillsCollection } from "../lib/skills.mjs";
import { readZipEntries } from "../lib/zip.mjs";
import { CORE_SKILLS } from "./validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TOP_LEVEL_FILES = ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"];

function verifySingleLocaleBundle({ rootDir, outRoot, version, locale, sumsText, schemaPath }) {
  const errors = [];
  const bundleName = `dev-workflow-${version}-${locale}`;
  const bundleDir = path.join(outRoot, bundleName);
  const zipPath = path.join(outRoot, `${bundleName}.zip`);

  if (!fs.existsSync(bundleDir)) {
    return {
      bundleDir,
      fileCount: 0,
      errors: [`Missing dist bundle directory '${bundleDir}'. Run 'npm run pack' first.`],
    };
  }
  if (!fs.existsSync(zipPath)) {
    errors.push(`Missing dist zip '${zipPath}'`);
  }

  const expectedHashes = {};
  const topFiles = locale === "zh-CN" ? [...TOP_LEVEL_FILES, "README.zh-CN.md"] : TOP_LEVEL_FILES;
  for (const rel of topFiles) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) {
      errors.push(`[${locale}] Missing source file '${rel}'`);
    } else {
      expectedHashes[rel] = sha256File(abs);
    }
  }

  const skillsSrcDir =
    locale === "zh-CN"
      ? path.join(rootDir, "locales", "zh-CN", "skills")
      : path.join(rootDir, "skills");
  const sourceSkillsHashes = hashDirectoryFiles(skillsSrcDir);
  for (const [rel, hash] of Object.entries(sourceSkillsHashes)) {
    expectedHashes[`skills/${rel}`] = hash;
  }

  const distHashes = hashDirectoryFiles(bundleDir);

  for (const [rel, expectedHash] of Object.entries(expectedHashes)) {
    if (!(rel in distHashes)) {
      errors.push(`[${locale}] Missing file in dist bundle: '${rel}'`);
    } else if (distHashes[rel] !== expectedHash) {
      errors.push(`[${locale}] Hash mismatch between source and dist for '${rel}'`);
    }
  }
  for (const rel of Object.keys(distHashes)) {
    if (!(rel in expectedHashes)) {
      errors.push(`[${locale}] Unexpected extra file in dist bundle: '${rel}'`);
    }
  }

  const distPluginPath = path.join(bundleDir, "plugin.json");
  if (fs.existsSync(schemaPath) && fs.existsSync(distPluginPath)) {
    try {
      const mRes = validatePluginManifest(JSON.parse(fs.readFileSync(distPluginPath, "utf8")), schemaPath);
      if (!mRes.valid) {
        errors.push(...mRes.errors.map((e) => `[${locale}] dist plugin.json: ${e}`));
      }
    } catch (err) {
      errors.push(`[${locale}] Failed to validate dist plugin.json: ${err.message}`);
    }
  }
  const distSkillsDir = path.join(bundleDir, "skills");
  if (fs.existsSync(distSkillsDir)) {
    const sRes = validateSkillsCollection(distSkillsDir, {
      expectedSkills: CORE_SKILLS,
      requireStandardSections: true,
      locale,
    });
    if (!sRes.valid) {
      errors.push(...sRes.errors.map((e) => `[${locale}] dist skills: ${e}`));
    }
  }

  errors.push(...scanSensitiveArtifacts(bundleDir));

  if (sumsText !== null && fs.existsSync(zipPath)) {
    const zipBuf = fs.readFileSync(zipPath);
    const actualZipHash = sha256Buffer(zipBuf);
    if (!sumsText.includes(`${actualZipHash}  ${bundleName}.zip`)) {
      errors.push(`dist/SHA256SUMS.txt does not match actual zip sha256 for ${bundleName}.zip`);
    }
    for (const [rel, hash] of Object.entries(distHashes)) {
      if (!sumsText.includes(`${hash}  ${bundleName}/${rel}`)) {
        errors.push(`dist/SHA256SUMS.txt missing or mismatched hash for ${bundleName}/${rel}`);
      }
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
          errors.push(`[${locale}] Missing file in zip archive: '${rel}'`);
        } else if (zipHashes[rel] !== expectedHash) {
          errors.push(`[${locale}] Zip entry hash mismatch vs source for '${rel}'`);
        }
      }
      for (const rel of Object.keys(zipHashes)) {
        if (!(rel in expectedHashes)) {
          errors.push(`[${locale}] Unexpected extra file in zip archive: '${rel}'`);
        }
      }
    } catch (err) {
      errors.push(`[${locale}] Failed to verify zip archive contents: ${err.message}`);
    }
  }

  return {
    locale,
    bundleName,
    bundleDir,
    fileCount: Object.keys(distHashes).length,
    errors,
  };
}

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
  const checksumsPath = path.join(outRoot, "SHA256SUMS.txt");
  const sumsText = fs.existsSync(checksumsPath) ? fs.readFileSync(checksumsPath, "utf8") : null;
  if (sumsText === null) {
    errors.push("Missing dist/SHA256SUMS.txt");
  }
  const schemaPath = path.join(rootDir, "schemas", "plugin-v1.0.0.schema.json");

  const bundles = {};
  for (const locale of SUPPORTED_LOCALES) {
    const res = verifySingleLocaleBundle({
      rootDir,
      outRoot,
      version,
      locale,
      sumsText,
      schemaPath,
    });
    bundles[locale] = res;
    errors.push(...res.errors);
  }

  return {
    valid: errors.length === 0,
    version,
    bundleDir: bundles.en.bundleDir,
    fileCount: Object.values(bundles).reduce((sum, b) => sum + b.fileCount, 0),
    bundles,
    errors,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = verifySourceSync(repoRoot);
  if (!res.valid) {
    for (const err of res.errors) console.error(`ERROR: ${err}`);
    process.exit(1);
  }
  console.log(`Source sync verified (${res.fileCount} files across ${Object.keys(res.bundles).join(", ")}).`);
}
