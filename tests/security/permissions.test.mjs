import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function readSkill(name) {
  return fs.readFileSync(path.join(repoRoot, "skills", name, "SKILL.md"), "utf8");
}

test("read-only skills explicitly forbid implicit edits, commits, or pushes", () => {
  const start = readSkill("dw-start");
  const debug = readSkill("dw-debug");
  const review = readSkill("dw-review");

  assert.match(start, /READ-ONLY/i);
  assert.match(debug, /Default is \*\*READ-ONLY\*\* diagnosis/);
  assert.match(review, /Strictly \*\*READ-ONLY\*\*/);
  assert.match(review, /NEVER authorizes applying fixes, committing, pushing, or merging/);
});

test("dw-ship separates local commit, remote write, and destructive permission tiers", () => {
  const ship = readSkill("dw-ship");
  assert.match(ship, /LOCAL_COMMIT/);
  assert.match(ship, /REMOTE_WRITE/);
  assert.match(ship, /DESTRUCTIVE/);
  assert.match(ship, /Pre-Ship Checklist/);
  assert.match(ship, /NEVER grant `dw-ship` authorization/);
});

test("dw-build separates implementation from dw-ship and protects dirty worktrees", () => {
  const build = readSkill("dw-build");
  assert.match(build, /never discard, stash, `git clean`, or `git checkout --`/i);
  assert.match(build, /Never automatically run `dw-ship`/);
  assert.match(build, /not_run/);
});
