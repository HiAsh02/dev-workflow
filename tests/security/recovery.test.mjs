import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectTaskRecovery, writeTaskStateAtomic } from "../../lib/state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const schemaPath = path.join(repoRoot, "schemas", "run-state.schema.json");

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-recovery-"));
  fs.mkdirSync(path.join(dir, ".dev-workflow/tasks/t1"), { recursive: true });
  return dir;
}

test("corrupt run-state.json blocks recovery and is never silently overwritten", () => {
  const dir = makeWorkspace();
  const taskDir = path.join(dir, ".dev-workflow/tasks/t1");
  const rawCorrupt = "{ broken json";
  fs.writeFileSync(path.join(taskDir, "run-state.json"), rawCorrupt, "utf8");

  try {
    const res = inspectTaskRecovery({ projectRoot: dir, taskDir, schemaPath });
    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.match(res.error, /Corrupt run-state\.json/);
    assert.equal(fs.readFileSync(path.join(taskDir, "run-state.json"), "utf8"), rawCorrupt);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("recovery detects HEAD change and missing evidence and never grants remote auth", () => {
  const dir = makeWorkspace();
  const taskDir = path.join(dir, ".dev-workflow/tasks/t1");
  const evFile = path.join(dir, ".dev-workflow/tasks/t1/proof.txt");
  fs.writeFileSync(evFile, "ok\n", "utf8");

  const validState = {
    schema_version: 1,
    task_id: "t1",
    intent: "feature",
    mode: "standard",
    status: "executing",
    project_root: ".",
    base_commit: "a".repeat(40),
    head_commit: "a".repeat(40),
    scope_summary: "Slice 1",
    approval_reference: "User approved commit & push last week",
    steps: [
      { id: "S1", status: "done", depends_on: [], evidence: [".dev-workflow/tasks/t1/proof.txt"] },
      { id: "S2", status: "pending", depends_on: ["S1"], evidence: [] },
    ],
    checks: [],
    blockers: [],
    updated_at: "2026-11-15T00:00:00Z",
  };

  try {
    writeTaskStateAtomic({ taskDir, state: validState, schemaPath });

    // Same HEAD and existing evidence -> S1 remains verified done, S2 ready, remote auth still false
    const sameHead = inspectTaskRecovery({
      projectRoot: dir,
      taskDir,
      schemaPath,
      currentHead: "a".repeat(40),
    });
    assert.equal(sameHead.ok, true);
    assert.equal(sameHead.reverifyRequired, false);
    assert.deepEqual(sameHead.nextReadySteps, ["S2"]);
    assert.equal(sameHead.standingAuthorization.remoteWrite, false);
    assert.equal(sameHead.standingAuthorization.localCommit, false);
    assert.equal(sameHead.standingAuthorization.requiresCurrentTurnApproval, true);

    // Changed HEAD -> S1 must be re-verified, S2 not prematurely marked ready
    const movedHead = inspectTaskRecovery({
      projectRoot: dir,
      taskDir,
      schemaPath,
      currentHead: "b".repeat(40),
    });
    assert.equal(movedHead.reverifyRequired, true);
    assert.equal(movedHead.stepSummary[0].needsReverification, true);
    assert.deepEqual(movedHead.nextReadySteps, ["S1"]);

    // Escaping evidence path is blocked
    const escapedState = {
      ...validState,
      steps: [{ id: "S1", status: "done", evidence: ["../../etc/passwd"] }],
    };
    writeTaskStateAtomic({ taskDir, state: escapedState, schemaPath });
    const escaped = inspectTaskRecovery({ projectRoot: dir, taskDir, schemaPath });
    assert.equal(escaped.ok, false);
    assert.equal(escaped.status, "blocked");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeTaskStateAtomic rejects concurrent lock", () => {
  const dir = makeWorkspace();
  const taskDir = path.join(dir, ".dev-workflow/tasks/t1");
  fs.writeFileSync(path.join(taskDir, ".run-state.lock"), "99999\n", "utf8");
  const sample = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "templates", "run-state.json"), "utf8")
  );

  try {
    assert.throws(
      () => writeTaskStateAtomic({ taskDir, state: sample, schemaPath }),
      /Concurrent ledger writer lock active/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
