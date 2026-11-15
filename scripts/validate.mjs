import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePluginManifest, validateVersionSync } from "../lib/manifest.mjs";
import { validateSkillsCollection } from "../lib/skills.mjs";
import { validateRunStateObject } from "../lib/state.mjs";
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

function checkRelativeParity(baseDir, localizedDir, label, errors) {
  const baseFiles = new Set(walkContainedFiles(baseDir));
  const locFiles = new Set(walkContainedFiles(localizedDir));
  for (const rel of baseFiles) {
    if (!locFiles.has(rel)) {
      errors.push(`Localized ${label} missing mirror file '${rel}'`);
    }
  }
  for (const rel of locFiles) {
    if (!baseFiles.has(rel)) {
      errors.push(`Localized ${label} has extra unmirrored file '${rel}'`);
    }
  }
}

function checkStaleRepoNames(rootDir) {
  const errors = [];
  const checkFiles = [
    "README.md",
    "README.zh-CN.md",
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
      locale: "en",
    });
    if (!sRes.valid) errors.push(...sRes.errors);
  }

  const zhSkillsDir = path.join(rootDir, "locales", "zh-CN", "skills");
  if (!fs.existsSync(zhSkillsDir)) {
    if (allowPendingSkills) {
      warnings.push("locales/zh-CN/skills/ directory not present");
    } else {
      errors.push("Missing locales/zh-CN/skills/ directory");
    }
  } else {
    const zhRes = validateSkillsCollection(zhSkillsDir, {
      expectedSkills: CORE_SKILLS,
      requireStandardSections: true,
      locale: "zh-CN",
    });
    if (!zhRes.valid) {
      errors.push(...zhRes.errors.map((e) => `[zh-CN] ${e}`));
    }
    if (fs.existsSync(skillsDir)) {
      checkRelativeParity(skillsDir, zhSkillsDir, "skills (zh-CN)", errors);
    }
  }

  const templatesDir = path.join(rootDir, "templates");
  const zhTemplatesDir = path.join(rootDir, "locales", "zh-CN", "templates");
  if (!allowPendingSkills) {
    if (!fs.existsSync(zhTemplatesDir)) {
      errors.push("Missing locales/zh-CN/templates/ directory");
    } else if (fs.existsSync(templatesDir)) {
      checkRelativeParity(templatesDir, zhTemplatesDir, "templates (zh-CN)", errors);
    }
    if (!fs.existsSync(path.join(rootDir, "README.zh-CN.md"))) {
      errors.push("Missing README.zh-CN.md");
    }
  }

  const runStateSchema = path.join(rootDir, "schemas", "run-state.schema.json");
  if (fs.existsSync(runStateSchema)) {
    for (const relState of ["templates/run-state.json", "locales/zh-CN/templates/run-state.json"]) {
      const absState = path.join(rootDir, relState);
      if (!fs.existsSync(absState)) continue;
      try {
        const parsedState = JSON.parse(fs.readFileSync(absState, "utf8"));
        const rsRes = validateRunStateObject(parsedState, runStateSchema);
        if (!rsRes.valid) {
          errors.push(...rsRes.errors.map((e) => `${relState}: ${e}`));
        }
      } catch (err) {
        errors.push(`${relState}: invalid JSON (${err.message})`);
      }
    }
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
