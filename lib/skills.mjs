import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ensureContainedPath, findCaseCollisions, walkContainedFiles } from "./safe-files.mjs";

export const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const REQUIRED_SKILL_SECTIONS = [
  "Purpose",
  "When to use",
  "Do not use",
  "Inputs",
  "Capabilities",
  "Procedure",
  "Outputs",
  "Failure and fallback",
  "Authorization",
  "Verification",
];

/**
 * Parse YAML frontmatter and Markdown body from SKILL.md text.
 */
export function parseSkillMarkdown(rawContent) {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { ok: false, error: "SKILL.md must start with YAML frontmatter '---'" };
  }
  const endIdx = normalized.indexOf("\n---\n", 4);
  const eofEndIdx =
    endIdx === -1 && normalized.endsWith("\n---") ? normalized.length - 4 : endIdx;
  if (eofEndIdx === -1) {
    return { ok: false, error: "Unterminated YAML frontmatter closing '---'" };
  }

  const yamlText = normalized.slice(4, eofEndIdx);
  const body = normalized.slice(eofEndIdx + 4).replace(/^\n+/, "");

  let frontmatter;
  try {
    frontmatter = YAML.parse(yamlText, { strict: true });
  } catch (err) {
    return { ok: false, error: `Invalid YAML frontmatter: ${err.message}` };
  }

  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    return { ok: false, error: "YAML frontmatter must parse to a mapping object" };
  }

  return { ok: true, frontmatter, body };
}

/**
 * Extract Markdown links `[label](target)` outside fenced code blocks.
 */
export function extractRelativeLinks(markdownText) {
  const lines = markdownText.replace(/\r\n/g, "\n").split("\n");
  const links = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const regex = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const target = match[1];
      if (
        target.startsWith("http://") ||
        target.startsWith("https://") ||
        target.startsWith("mailto:") ||
        target.startsWith("#")
      ) {
        continue;
      }
      const cleanTarget = target.split("#")[0];
      if (cleanTarget.length > 0) {
        links.push(cleanTarget);
      }
    }
  }
  return links;
}

/**
 * Validate a single skill directory according to Agent Skills specification
 * and optional dev-workflow standard section contract.
 */
export function validateSkillDir(
  skillDir,
  { expectedDirName = path.basename(skillDir), requireStandardSections = true } = {}
) {
  const errors = [];
  const skillMdPath = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    return {
      valid: false,
      name: expectedDirName,
      errors: [`Missing SKILL.md in ${skillDir}`],
    };
  }

  const raw = fs.readFileSync(skillMdPath, "utf8");
  const parsed = parseSkillMarkdown(raw);
  if (!parsed.ok) {
    return { valid: false, name: expectedDirName, errors: [parsed.error] };
  }

  const { frontmatter, body } = parsed;

  if (typeof frontmatter.name !== "string" || frontmatter.name.length === 0) {
    errors.push("Frontmatter 'name' is required and must be a non-empty string");
  } else {
    if (frontmatter.name.length > 64) {
      errors.push(`Frontmatter 'name' exceeds 64 chars (${frontmatter.name.length})`);
    }
    if (!SKILL_NAME_REGEX.test(frontmatter.name)) {
      errors.push(
        `Frontmatter 'name' '${frontmatter.name}' must use lowercase letters, numbers, and single hyphens`
      );
    }
    if (frontmatter.name !== expectedDirName) {
      errors.push(
        `Frontmatter 'name' '${frontmatter.name}' must match directory name '${expectedDirName}'`
      );
    }
  }

  if (
    typeof frontmatter.description !== "string" ||
    frontmatter.description.trim().length === 0
  ) {
    errors.push("Frontmatter 'description' is required and must be non-empty");
  } else if (frontmatter.description.length > 1024) {
    errors.push(
      `Frontmatter 'description' exceeds 1024 chars (${frontmatter.description.length})`
    );
  }

  if (frontmatter.compatibility !== undefined) {
    if (
      typeof frontmatter.compatibility !== "string" ||
      frontmatter.compatibility.trim().length === 0 ||
      frontmatter.compatibility.length > 500
    ) {
      errors.push("Frontmatter 'compatibility' must be a 1-500 char string");
    }
  }

  if (frontmatter.metadata !== undefined) {
    if (
      !frontmatter.metadata ||
      typeof frontmatter.metadata !== "object" ||
      Array.isArray(frontmatter.metadata)
    ) {
      errors.push("Frontmatter 'metadata' must be a string-to-string map");
    } else {
      for (const [k, v] of Object.entries(frontmatter.metadata)) {
        if (typeof v !== "string") {
          errors.push(`Frontmatter 'metadata.${k}' must be a string`);
        }
      }
    }
  }

  if (requireStandardSections) {
    for (const section of REQUIRED_SKILL_SECTIONS) {
      const headingPattern = new RegExp(
        `^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
        "m"
      );
      if (!headingPattern.test(body)) {
        errors.push(`Missing required section '## ${section}'`);
      }
    }
  }

  let containedFiles = [];
  try {
    containedFiles = walkContainedFiles(skillDir);
  } catch (err) {
    errors.push(`Containment failure in ${skillDir}: ${err.message}`);
    return { valid: false, name: frontmatter.name ?? expectedDirName, errors };
  }

  const caseCollisions = findCaseCollisions(containedFiles);
  for (const col of caseCollisions) {
    errors.push(`Case collision in skill dir: '${col.existing}' vs '${col.duplicate}'`);
  }

  const mdFiles = containedFiles.filter((rel) => rel.endsWith(".md"));
  for (const relMd of mdFiles) {
    const absMd = path.join(skillDir, relMd);
    const mdText = fs.readFileSync(absMd, "utf8");
    const mdDirRel = path.posix.dirname(relMd);
    const links = extractRelativeLinks(mdText);

    for (const link of links) {
      const joinedRel = path.posix.normalize(
        mdDirRel === "." ? link : path.posix.join(mdDirRel, link)
      );
      if (
        joinedRel === "." ||
        joinedRel === ".." ||
        joinedRel.startsWith("../") ||
        path.posix.isAbsolute(joinedRel)
      ) {
        errors.push(
          `Relative link '${link}' in '${relMd}' escapes skill directory '${expectedDirName}'`
        );
        continue;
      }
      const check = ensureContainedPath(skillDir, joinedRel);
      if (!check.ok) {
        errors.push(`Containment error for link '${link}' in '${relMd}': ${check.error}`);
      } else if (!fs.existsSync(check.resolvedPath)) {
        errors.push(`Broken relative link '${link}' in '${relMd}' (resolved '${joinedRel}')`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    name: frontmatter.name ?? expectedDirName,
    description: frontmatter.description ?? "",
    files: containedFiles,
    errors,
  };
}

/**
 * Discover and validate all skills inside `skillsRoot`.
 */
export function validateSkillsCollection(
  skillsRoot,
  { expectedSkills = null, requireStandardSections = true } = {}
) {
  const errors = [];
  const skills = [];

  if (!fs.existsSync(skillsRoot)) {
    return {
      valid: false,
      skills: [],
      errors: [`Skills root does not exist: ${skillsRoot}`],
    };
  }

  const entries = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  const seenNames = new Map();
  for (const entry of entries) {
    const dirCheck = ensureContainedPath(skillsRoot, entry.name);
    if (!dirCheck.ok) {
      errors.push(dirCheck.error);
      continue;
    }
    const result = validateSkillDir(dirCheck.resolvedPath, {
      expectedDirName: entry.name,
      requireStandardSections,
    });
    skills.push(result);
    if (!result.valid) {
      for (const err of result.errors) {
        errors.push(`[${entry.name}] ${err}`);
      }
    }
    const lowerName = String(result.name).toLowerCase();
    if (seenNames.has(lowerName)) {
      errors.push(
        `Duplicate or case-colliding skill name '${result.name}' (conflicts with '${seenNames.get(lowerName)}')`
      );
    } else {
      seenNames.set(lowerName, entry.name);
    }
  }

  if (Array.isArray(expectedSkills)) {
    const found = new Set(skills.map((s) => s.name));
    for (const expected of expectedSkills) {
      if (!found.has(expected)) {
        errors.push(`Missing required core skill '${expected}'`);
      }
    }
    if (skills.length !== expectedSkills.length) {
      const extras = skills
        .map((s) => s.name)
        .filter((n) => !expectedSkills.includes(n));
      if (extras.length > 0) {
        errors.push(`Unexpected skill directories outside core set: ${extras.join(", ")}`);
      }
    }
  }

  return { valid: errors.length === 0, skills, errors };
}
