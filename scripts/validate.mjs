import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePluginManifest, validateVersionSync } from "../lib/manifest.mjs";
import { validateSkillsCollection } from "../lib/skills.mjs";
import { findCaseCollisions, walkContainedFiles } from "../lib/safe-files.mjs";

export const CORE_SKILLS = [
  "dw-start",
  "dw-design",
  "dw-plan",
  "dw-build",
  "dw-debug",
  "dw-review",
  "dw-ship",
  "dw-handoff",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function checkStaleRepoNames(rootDir) {
  const errors = [];
  const checkFiles = [
    "README.md",
    "AGENTS.md",
    "plugin.json",
    "package.json",
    "CHANGELOG.md",
    "docs/ARCHITECTURE.md",
    "docs/IMPLEMENTATION_PLAN.md",
    "docs/COMPATIBILITY.md",
    "docs/SECURITY.md",
    "docs/PROVENANCE.md",
  ];

  for (const rel of checkFiles) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, "utf8");
    if (rel !== "docs/ARCHITECTURE.md" && text.includes("HiAsh02/dev--workflow")) {
      errors.push(`${rel} contains stale double-hyphen repo URL 'HiAsh02/dev--workflow'`);
    }
  }
  return errors;
}

export function runValidation(rootDir = repoRoot, { allowPendingSkills = false } = {}) {
  const errors = [];
  const warnings = [];

  const schemaPath = path.join(rootDir, "schemas", "plugin-v1.0.0.schema.json");
  const pluginPath = path.join(rootDir, "plugin.json");

  if (!fs.existsSync(schemaPath)) {
    errors.push("Missing locked schema schemas/plugin-v1.0.0.schema.json");
  } else if (!fs.existsSync(pluginPath)) {
    errors.push("Missing plugin.json");
  } else {
    const manifestObj = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
    const mRes = validatePluginManifest(manifestObj, schemaPath);
    if (!mRes.valid) errors.push(...mRes.errors.map((e) => `plugin.json: ${e}`));
  }

  const vRes = validateVersionSync(rootDir);
  if (!vRes.valid) errors.push(...vRes.errors);

  const skillsDir = path.join(rootDir, "skills");
  if (!fs.existsSync(skillsDir)) {
    if (allowPendingSkills) {
      warnings.push("skills/ directory not yet created (pending M1 tasks T03-T10)");
    } else {
      errors.push("Missing skills/ directory");
    }
  } else {
    const sRes = validateSkillsCollection(skillsDir, {
      expectedSkills: CORE_SKILLS,
      requireStandardSections: true,
    });
    if (!sRes.valid) errors.push(...sRes.errors);
  }

  const allRepoFiles = walkContainedFiles(rootDir).filter(
    (f) => !f.startsWith("node_modules/") && !f.startsWith(".git/") && !f.startsWith("dist/")
  );
  const collisions = findCaseCollisions(allRepoFiles);
  for (const c of collisions) {
    errors.push(`Case collision in repository: '${c.existing}' vs '${c.duplicate}'`);
  }

  errors.push(...checkStaleRepoNames(rootDir));

  return { valid: errors.length === 0, errors, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allowPending = process.argv.includes("--allow-pending-skills");
  const res = runValidation(repoRoot, { allowPendingSkills: allowPending });
  for (const w of res.warnings) {
    console.warn(`WARN: ${w}`);
  }
  if (!res.valid) {
    for (const err of res.errors) {
      console.error(`ERROR: ${err}`);
    }
    process.exit(1);
  }
  console.log("Validation passed.");
}
