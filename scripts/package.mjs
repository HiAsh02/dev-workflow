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
import { buildDeterministicZip } from "../lib/zip.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TOP_LEVEL_FILES = ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"];

export function buildPackage(rootDir = repoRoot, { outRoot = path.join(rootDir, "dist") } = {}) {
  const val = runValidation(rootDir);
  if (!val.valid) {
    throw new Error(`Validation failed before packaging:\n${val.errors.join("\n")}`);
  }

  const version = fs.readFileSync(path.join(rootDir, "VERSION"), "utf8").trim();
  const bundleName = `dev-workflow-${version}`;
  const bundleDir = path.join(outRoot, bundleName);
  const zipPath = path.join(outRoot, `${bundleName}.zip`);

  const filesToCopy = [];
  for (const rel of TOP_LEVEL_FILES) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing required package file: ${rel}`);
    }
    filesToCopy.push({ rel, abs });
  }

  const skillFiles = walkContainedFiles(path.join(rootDir, "skills")).map((rel) => ({
    rel: `skills/${rel}`,
    abs: path.join(rootDir, "skills", rel),
  }));
  filesToCopy.push(...skillFiles);
  filesToCopy.sort((a, b) => a.rel.localeCompare(b.rel, "en"));

  const collisions = findCaseCollisions(filesToCopy.map((f) => f.rel));
  if (collisions.length > 0) {
    throw new Error(`Case collisions detected: ${JSON.stringify(collisions)}`);
  }

  const secretFindings = scanSensitiveArtifacts(
    rootDir,
    filesToCopy.map((f) => f.rel)
  );
  if (secretFindings.length > 0) {
    throw new Error(`Sensitive artifact scan failed:\n${secretFindings.join("\n")}`);
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
  atomicWriteFile(path.join(outRoot, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`);

  return {
    version,
    bundleDir,
    zipPath,
    zipSha256,
    fileCount: filesToCopy.length,
    bundleHashes,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = buildPackage(repoRoot);
  console.log(
    `Packaged ${res.fileCount} files to ${res.bundleDir} and ${res.zipPath} (sha256: ${res.zipSha256})`
  );
}
