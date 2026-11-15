import fs from "node:fs";
import path from "node:path";
import { sha256File, walkContainedFiles } from "./safe-files.mjs";

const FORBIDDEN_PATH_PATTERNS = [
  /(?:^|\/)\.env(?:\..+)?$/i,
  /(?:^|\/)\.git(?:\/|$)/i,
  /(?:^|\/)node_modules(?:\/|$)/i,
  /(?:^|\/)\.dev-workflow(?:\/|$)/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /\.log$/i,
];

const SECRET_TOKEN_PATTERNS = [
  { label: "GitHub token", regex: /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/ },
  { label: "GitHub PAT", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: "Private key block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { label: "xAI/OpenAI-style key", regex: /\b(?:sk|xai)-[A-Za-z0-9_-]{20,}\b/ },
];

/**
 * Compute sorted `{ relativePosixPath: sha256 }` map for all files under `dir`.
 */
export function hashDirectoryFiles(dir) {
  const relFiles = walkContainedFiles(dir);
  const hashes = {};
  for (const rel of relFiles) {
    hashes[rel] = sha256File(path.join(dir, rel));
  }
  return hashes;
}

/**
 * Scan a list of relative file paths and file contents inside `rootDir` for
 * forbidden artifacts or credential leaks (`VAL-05`).
 */
export function scanSensitiveArtifacts(rootDir, relFiles = walkContainedFiles(rootDir)) {
  const findings = [];
  for (const rel of relFiles) {
    for (const pat of FORBIDDEN_PATH_PATTERNS) {
      if (pat.test(rel)) {
        findings.push(`Forbidden file path in bundle: '${rel}'`);
        break;
      }
    }
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.size > 5 * 1024 * 1024) {
      findings.push(`Oversized file (>5MB) in bundle: '${rel}' (${stat.size} bytes)`);
      continue;
    }
    const text = fs.readFileSync(abs, "utf8");
    for (const { label, regex } of SECRET_TOKEN_PATTERNS) {
      if (regex.test(text)) {
        findings.push(`Potential ${label} leaked in '${rel}'`);
      }
    }
  }
  return findings;
}
