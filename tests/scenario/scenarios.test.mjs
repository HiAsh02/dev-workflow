import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractRelativeLinks } from "../../lib/skills.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("SC-01..SC-12 scenario specifications exist and reference valid skills/playbooks", () => {
  const casesDir = path.join(repoRoot, "tests/scenario/cases");
  const files = fs.readdirSync(casesDir).filter((f) => /^SC-\d{2}-.+\.md$/.test(f));
  assert.equal(files.length, 12, `Expected 12 SC cases, got ${files.join(", ")}`);

  for (let i = 1; i <= 12; i += 1) {
    const prefix = `SC-${String(i).padStart(2, "0")}-`;
    assert.ok(
      files.some((f) => f.startsWith(prefix)),
      `Missing scenario case ${prefix}`
    );
  }
});

test("dw-start routing table covers all 7 canonical playbooks with zero circular references", () => {
  const routingMd = fs.readFileSync(
    path.join(repoRoot, "skills/dw-start/references/routing.md"),
    "utf8"
  );
  const playbooksDir = path.join(repoRoot, "skills/dw-start/references/playbooks");
  const expectedPlaybooks = [
    "investigate",
    "feature",
    "bug-fix",
    "refactor",
    "review",
    "ship",
    "resume",
  ];

  const links = extractRelativeLinks(routingMd);
  for (const pb of expectedPlaybooks) {
    assert.ok(
      links.includes(`./playbooks/${pb}.md`),
      `routing.md must link to ./playbooks/${pb}.md`
    );
    const pbPath = path.join(playbooksDir, `${pb}.md`);
    assert.ok(fs.existsSync(pbPath), `Missing playbook ${pb}.md`);
    const pbText = fs.readFileSync(pbPath, "utf8");
    for (const heading of ["Trigger", "Preconditions", "Ordered steps", "Evidence", "Failure / Stop"]) {
      assert.ok(pbText.includes(`## ${heading}`), `${pb}.md missing ## ${heading}`);
    }
    // Playbooks must not recursively point back to dw-start
    assert.equal(pbText.includes("SKILL.md"), false, `${pb}.md should not recurse into SKILL.md`);
  }
});

test("SC-04 fixture bug-regression reproduces deterministic failure and SC fixture sample-app passes", () => {
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;

  const bugTest = spawnSync(
    process.execPath,
    [path.join(repoRoot, "tests/fixtures/bug-regression/paginate.test.mjs")],
    { encoding: "utf8", env: cleanEnv }
  );
  assert.notEqual(bugTest.status, 0, "Intentional bug-regression fixture should fail as reproducer");

  const sampleTest = spawnSync(
    process.execPath,
    [path.join(repoRoot, "tests/fixtures/sample-app/hello.test.mjs")],
    { encoding: "utf8", env: cleanEnv }
  );
  assert.equal(sampleTest.status, 0, sampleTest.stderr);
});

test("SC-08 prompt-injection invariant is explicitly enforced in core skills", () => {
  const start = fs.readFileSync(path.join(repoRoot, "skills/dw-start/SKILL.md"), "utf8");
  const review = fs.readFileSync(path.join(repoRoot, "skills/dw-review/SKILL.md"), "utf8");
  assert.match(start, /untrusted data/i);
  assert.match(review, /directly observed/i);
});

test("SC-09 and SC-10 fallback contracts exist in dw-plan, dw-build, and dw-review", () => {
  const plan = fs.readFileSync(path.join(repoRoot, "skills/dw-plan/SKILL.md"), "utf8");
  const build = fs.readFileSync(path.join(repoRoot, "skills/dw-build/SKILL.md"), "utf8");
  const review = fs.readFileSync(path.join(repoRoot, "skills/dw-review/SKILL.md"), "utf8");

  assert.match(plan, /no test runner exists/i);
  assert.match(build, /sequential single-agent/i);
  assert.match(build, /TDD: not applicable/i);
  assert.match(review, /Never claim an "independent reviewer" ran if only one agent/i);
});
