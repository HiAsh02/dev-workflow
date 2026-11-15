import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateSkillDir, validateSkillsCollection } from "../../lib/skills.mjs";

function makeTempSkill(files) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "dw-skill-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(base, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
  return base;
}

const VALID_BODY = `
## Purpose
Test purpose.

## When to use
Use for tests.

## Do not use
Never in production.

## Inputs
Test input.

## Capabilities
Read-only.

## Procedure
1. Check.

## Outputs
Summary.

## Failure and fallback
Stop cleanly.

## Authorization
Read only.

## Verification
Check output.
`;

test("validateSkillDir accepts compliant skill with valid local reference", () => {
  const base = makeTempSkill({
    "my-skill/SKILL.md": `---\nname: my-skill\ndescription: Valid skill for testing.\n---\n${VALID_BODY}\nSee [ref](./references/note.md).\n`,
    "my-skill/references/note.md": "# Note\n",
  });
  try {
    const res = validateSkillDir(path.join(base, "my-skill"));
    assert.equal(res.valid, true, res.errors.join("; "));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("validateSkillDir rejects mismatched name, missing description, missing ref, and path escape", () => {
  const base = makeTempSkill({
    "good-name/SKILL.md": `---\nname: wrong--name\n---\n${VALID_BODY}\nSee [missing](./references/missing.md) and [escape](../outside.md).\n`,
    "outside.md": "secret",
  });
  try {
    const res = validateSkillDir(path.join(base, "good-name"));
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("single hyphens")));
    assert.ok(res.errors.some((e) => e.includes("match directory name")));
    assert.ok(res.errors.some((e) => e.includes("description")));
    assert.ok(res.errors.some((e) => e.includes("Broken relative link")));
    assert.ok(res.errors.some((e) => e.includes("escapes skill directory")));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("validateSkillDir rejects symlink escaping skill directory", () => {
  const base = makeTempSkill({
    "escape-skill/SKILL.md": `---\nname: escape-skill\ndescription: Symlink test.\n---\n${VALID_BODY}\nSee [ref](./references/leak.md).\n`,
    "secret.txt": "SECRET",
  });
  try {
    fs.mkdirSync(path.join(base, "escape-skill/references"), { recursive: true });
    fs.symlinkSync(
      path.join(base, "secret.txt"),
      path.join(base, "escape-skill/references/leak.md")
    );
    const res = validateSkillDir(path.join(base, "escape-skill"));
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("escapes root")));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("validateSkillsCollection detects duplicate skill names across case", () => {
  const base = makeTempSkill({
    "foo-skill/SKILL.md": `---\nname: foo-skill\ndescription: First.\n---\n${VALID_BODY}`,
    "bar-skill/SKILL.md": `---\nname: foo-skill\ndescription: Duplicate.\n---\n${VALID_BODY}`,
  });
  try {
    const res = validateSkillsCollection(base);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Duplicate")));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
