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

test("REG-REC-01..02: done without evidence, modified evidence hash, dirty worktree, and side-effect steps never falsely pass verification", () => {
  const dir = makeWorkspace();
  const taskDir = path.join(dir, ".dev-workflow/tasks/t1");
  const evFile = path.join(dir, ".dev-workflow/tasks/t1/proof.txt");
  fs.writeFileSync(evFile, "test pass output v1\n", "utf8");
  const evHash = "f80157e1"; // computed below dynamically using node crypto via write? Better import sha256File!

  try {
    // REG-REC-01: done + empty evidence[] must NEVER yield verifiedDone=true
    const emptyDone = {
      schema_version: 1,
      task_id: "t1",
      intent: "feature",
      mode: "standard",
      status: "executing",
      project_root: ".",
      base_commit: "a".repeat(40),
      head_commit: "a".repeat(40),
      scope_summary: "Empty evidence test",
      approval_reference: "Audit note only",
      steps: [
        { id: "S1", status: "done", depends_on: [], evidence: [] },
        { id: "S2", status: "pending", depends_on: ["S1"], evidence: [] },
      ],
      checks: [],
      blockers: [],
      updated_at: "2026-11-15T00:00:00Z",
    };
    fs.writeFileSync(path.join(taskDir, "run-state.json"), JSON.stringify(emptyDone), "utf8");
    const recEmpty = inspectTaskRecovery({
      projectRoot: dir,
      taskDir,
      schemaPath,
      currentHead: "a".repeat(40),
    });
    assert.equal(recEmpty.reverifyRequired, true);
    assert.equal(recEmpty.stepSummary[0].recordedDone, true);
    assert.equal(recEmpty.stepSummary[0].verifiedDone, false);
    assert.equal(recEmpty.stepSummary[0].needsReverification, true);
    assert.deepEqual(recEmpty.nextReadySteps, ["S1"]);

    // writeTaskStateAtomic also refuses writing a done step with empty evidence
    assert.throws(
      () => writeTaskStateAtomic({ taskDir: path.join(dir, ".dev-workflow/tasks/t2"), state: emptyDone, schemaPath }),
      /requires at least one evidence/i
    );

    // REG-REC-02a: evidence path still exists, but file content hash changed on disk -> stale
    const hashedState = {
      ...emptyDone,
      steps: [
        {
          id: "S1",
          status: "done",
          depends_on: [],
          evidence: [".dev-workflow/tasks/t1/proof.txt"],
          evidence_hashes: {
            ".dev-workflow/tasks/t1/proof.txt": "0".repeat(64),
          },
          side_effect: false,
        },
        {
          id: "S_SHIP",
          status: "failed",
          depends_on: ["S1"],
          evidence: [],
          side_effect: true,
        },
      ].map((s) => (s.id === "S_SHIP" ? { ...s, status: "blocked" } : s)),
    };
    // Update S_SHIP test below cleanly with valid schema status: "pending" + side_effect: true that became stale or failed check
    fs.writeFileSync(path.join(taskDir, "run-state.json"), JSON.stringify(hashedState), "utf8");
    const recHashMismatch = inspectTaskRecovery({
      projectRoot: dir,
      taskDir,
      schemaPath,
      currentHead: "a".repeat(40),
    });
    assert.equal(recHashMismatch.reverifyRequired, true);
    assert.equal(recHashMismatch.stepSummary[0].verifiedDone, false);
    assert.equal(recHashMismatch.stepSummary[0].needsReverification, true);

    // REG-REC-02b: HEAD unchanged, evidence hash matches, but dirty worktree -> must mark stale
    const validProofState = {
      ...emptyDone,
      steps: [
        {
          id: "S1",
          status: "done",
          depends_on: [],
          evidence: [".dev-workflow/tasks/t1/proof.txt"],
        },
        {
          id: "S_PUSH",
          status: "in_progress",
          depends_on: [],
          evidence: [],
          side_effect: true,
        },
      ],
    };
    fs.writeFileSync(
      path.join(taskDir, "run-state.json"),
      JSON.stringify(validProofState),
      "utf8"
    );
    const recDirty = inspectTaskRecovery({
      projectRoot: dir,
      taskDir,
      schemaPath,
      currentHead: "a".repeat(40),
      isDirty: true,
    });
    assert.equal(recDirty.reverifyRequired, true);
    assert.equal(recDirty.stepSummary[0].verifiedDone, false);
    assert.equal(recDirty.stepSummary[0].needsReverification, true);

    // Side-effect step must NEVER be placed into nextReadySteps for automatic replay
    assert.equal(recDirty.nextReadySteps.includes("S_PUSH"), false);
    assert.ok(recDirty.manualConfirmationRequiredSteps.includes("S_PUSH"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("REG-STATE-01: writeTaskStateAtomic enforces state machine transitions and preserves old ledger on invalid transition", () => {
  const dir = makeWorkspace();
  const taskDir = path.join(dir, ".dev-workflow/tasks/t1");
  const initialState = {
    schema_version: 1,
    task_id: "t1",
    intent: "feature",
    mode: "standard",
    status: "intake",
    project_root: ".",
    base_commit: "a".repeat(40),
    head_commit: "a".repeat(40),
    scope_summary: "State transition test",
    approval_reference: "Audit note only",
    steps: [{ id: "S1", status: "pending", depends_on: [], evidence: [] }],
    checks: [],
    blockers: [],
    updated_at: "2026-11-15T00:00:00Z",
  };

  try {
    writeTaskStateAtomic({ taskDir, state: initialState, schemaPath });

    // Illegal jump intake -> done must fail and preserve intake
    const illegalDone = { ...initialState, status: "done" };
    assert.throws(
      () => writeTaskStateAtomic({ taskDir, state: illegalDone, schemaPath }),
      /Invalid status transition/i
    );
    const persisted = JSON.parse(
      fs.readFileSync(path.join(taskDir, "run-state.json"), "utf8")
    );
    assert.equal(persisted.status, "intake");

    // Corrupt existing ledger on disk must NOT be overwritten
    const broken = "{ invalid json";
    fs.writeFileSync(path.join(taskDir, "run-state.json"), broken, "utf8");
    assert.throws(
      () =>
        writeTaskStateAtomic({
          taskDir,
          state: { ...initialState, status: "executing" },
          schemaPath,
        }),
      /corrupt run-state\.json/i
    );
    assert.equal(fs.readFileSync(path.join(taskDir, "run-state.json"), "utf8"), broken);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
