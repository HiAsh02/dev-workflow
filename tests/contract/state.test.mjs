import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canTransitionStatus,
  checkStepDag,
  validateRunStateObject,
} from "../../lib/state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const schemaPath = path.join(repoRoot, "schemas", "run-state.schema.json");

test("templates/run-state.json and locales/zh-CN/templates/run-state.json satisfy run-state.schema.json", () => {
  for (const rel of ["templates/run-state.json", "locales/zh-CN/templates/run-state.json"]) {
    const sample = JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
    const res = validateRunStateObject(sample, schemaPath);
    assert.equal(res.valid, true, `${rel}: ${res.errors.join("; ")}`);
  }
});

test("run-state rejects placeholder SHA strings and cyclic task DAGs", () => {
  const sample = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "templates", "run-state.json"), "utf8")
  );
  sample.head_commit = "<40-character-git-sha-or-null>";
  sample.steps = [
    { id: "A", status: "pending", depends_on: ["B"], evidence: [] },
    { id: "B", status: "pending", depends_on: ["A"], evidence: [] },
  ];

  const res = validateRunStateObject(sample, schemaPath);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("head_commit")));
  assert.ok(res.errors.some((e) => e.includes("Cycle detected")));

  const dag = checkStepDag(sample.steps);
  assert.equal(dag.valid, false);
});

test("state machine transitions disallow skipping from done or unauthorized edges", () => {
  assert.equal(canTransitionStatus("planned", "executing"), true);
  assert.equal(canTransitionStatus("reviewing", "done"), true);
  assert.equal(canTransitionStatus("done", "executing"), false);
  assert.equal(canTransitionStatus("intake", "done"), false);
});
