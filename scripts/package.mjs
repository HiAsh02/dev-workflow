import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runValidation } from "./validate.mjs";
import { hashDirectoryFiles, scanSensitiveArtifacts } from "../lib/integrity.mjs";
import {
  atomicWriteFile,
  findCaseCollisions,
  sha256Buffer,
  walkContainedFiles,
} from "../lib/safe-files.mjs";
import { SUPPORTED_LOCALES } from "../lib/skills.mjs";
import { buildDeterministicZip } from "../lib/zip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TOP_LEVEL_FILES = ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"];

// Standalone releases use packaging guides, not source-only CLI documentation.
function bundleTopSource(rootDir, rel) {
  if (rel === "README.md") return path.join(rootDir, "packaging", "README.dist.en.md");
  if (rel === "README.zh-CN.md") return path.join(rootDir, "packaging", "README.dist.zh-CN.md");
  return path.join(rootDir, rel);
}

function collectBundleFiles(rootDir, locale) {
  const topFiles = locale === "zh-CN" ? [...TOP_LEVEL_FILES, "README.zh-CN.md"] : TOP_LEVEL_FILES;
  const filesToCopy = [];
  for (const rel of topFiles) {
    const abs = bundleTopSource(rootDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing required package file: ${rel}`);
    }
    filesToCopy.push({ rel, abs });
  }

  const skillsSrcDir =
    locale === "zh-CN"
      ? path.join(rootDir, "locales", "zh-CN", "skills")
      : path.join(rootDir, "skills");
  const skillFiles = walkContainedFiles(skillsSrcDir).map((rel) => ({
    rel: `skills/${rel}`,
    abs: path.join(skillsSrcDir, rel),
  }));
  filesToCopy.push(...skillFiles);

  const templatesSrcDir = locale === "zh-CN"
    ? path.join(rootDir, "locales", "zh-CN", "templates")
    : path.join(rootDir, "templates");
  filesToCopy.push(...walkContainedFiles(templatesSrcDir).map((rel) => ({
    rel: `templates/${rel}`,
    abs: path.join(templatesSrcDir, rel),
  })));
  filesToCopy.sort((a, b) => a.rel.localeCompare(b.rel, "en"));
  return filesToCopy;
}

function buildSingleLocaleBundle({ rootDir, outRoot, version, locale }) {
  const bundleName = `dev-workflow-${version}-${locale}`;
  const bundleDir = path.join(outRoot, bundleName);
  const zipPath = path.join(outRoot, `${bundleName}.zip`);
  const filesToCopy = collectBundleFiles(rootDir, locale);

  const collisions = findCaseCollisions(filesToCopy.map((f) => f.rel));
  if (collisions.length > 0) {
    throw new Error(`Case collisions detected (${locale}): ${JSON.stringify(collisions)}`);
  }

  const secretFindings = scanSensitiveArtifacts(
    rootDir,
    filesToCopy.map((f) => path.relative(rootDir, f.abs).replaceAll("\\", "/"))
  );
  if (secretFindings.length > 0) {
    throw new Error(`Sensitive artifact scan failed (${locale}):\n${secretFindings.join("\n")}`);
  }

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });

  const zipEntries = [];
  for (const item of filesToCopy) {
    const data = fs.readFileSync(item.abs);
    const dest = path.join(bundleDir, item.rel);
    atomicWriteFile(dest, data);
    zipEntries.push({ path: `${bundleName}/${item.rel}`, data });
  }

  const zipBuf = buildDeterministicZip(zipEntries);
  atomicWriteFile(zipPath, zipBuf);

  const bundleHashes = hashDirectoryFiles(bundleDir);
  const zipSha256 = sha256Buffer(zipBuf);
  const checksumLines = [
    `${zipSha256}  ${bundleName}.zip`,
    ...Object.entries(bundleHashes).map(([rel, hash]) => `${hash}  ${bundleName}/${rel}`),
  ];

  return {
    locale,
    bundleName,
    bundleDir,
    zipPath,
    zipSha256,
    fileCount: filesToCopy.length,
    bundleHashes,
    checksumLines,
  };
}

export function buildPackage(rootDir = repoRoot, { outRoot = path.join(rootDir, "dist") } = {}) {
  const val = runValidation(rootDir);
  if (!val.valid) {
    throw new Error(`Validation failed before packaging:\n${val.errors.join("\n")}`);
  }

  const version = fs.readFileSync(path.join(rootDir, "VERSION"), "utf8").trim();

  // Remove legacy unsuffixed dist artifacts if present from earlier versions.
  fs.rmSync(path.join(outRoot, `dev-workflow-${version}`), { recursive: true, force: true });
  fs.rmSync(path.join(outRoot, `dev-workflow-${version}.zip`), { force: true });

  const bundles = {};
  const allChecksumLines = [];
  for (const locale of SUPPORTED_LOCALES) {
    const built = buildSingleLocaleBundle({ rootDir, outRoot, version, locale });
    bundles[locale] = built;
    allChecksumLines.push(...built.checksumLines);
  }
  atomicWriteFile(path.join(outRoot, "SHA256SUMS.txt"), `${allChecksumLines.join("\n")}\n`);

  const primary = bundles.en;
  return {
    version,
    bundleName: primary.bundleName,
    bundleDir: primary.bundleDir,
    zipPath: primary.zipPath,
    zipSha256: primary.zipSha256,
    fileCount: primary.fileCount,
    bundleHashes: primary.bundleHashes,
    bundles,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = buildPackage(repoRoot);
  for (const b of Object.values(res.bundles)) {
    console.log(
      `Packaged [${b.locale}] ${b.fileCount} files to ${b.bundleDir} and ${b.zipPath} (sha256: ${b.zipSha256})`
    );
  }
}
