import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { atomicWriteFile, ensureContainedPath } from "./safe-files.mjs";

export const ALLOWED_TRANSITIONS = Object.freeze({
  intake: new Set(["designing", "planned", "executing", "blocked", "cancelled"]),
  designing: new Set(["awaiting_approval", "planned", "blocked", "cancelled"]),
  awaiting_approval: new Set(["planned", "designing", "blocked", "cancelled"]),
  planned: new Set(["executing", "blocked", "cancelled"]),
  executing: new Set(["verifying", "blocked", "cancelled"]),
  verifying: new Set(["reviewing", "executing", "done", "blocked", "cancelled"]),
  reviewing: new Set(["done", "executing", "blocked", "cancelled"]),
  blocked: new Set([
    "intake",
    "designing",
    "awaiting_approval",
    "planned",
    "executing",
    "verifying",
    "reviewing",
    "cancelled",
  ]),
  done: new Set([]),
  cancelled: new Set([]),
});

let cachedValidator = null;

function getValidator(schemaPath) {
  if (!cachedValidator || cachedValidator.schemaPath !== schemaPath) {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    cachedValidator = { schemaPath, fn: ajv.compile(schema) };
  }
  return cachedValidator.fn;
}

export function validateRunStateObject(state, schemaPath) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { valid: false, errors: ["run-state.json must be a JSON object"] };
  }
  const validate = getValidator(schemaPath);
  const ok = validate(state);
  const errors = [];
  if (!ok && validate.errors) {
    for (const err of validate.errors) {
      errors.push(`${err.instancePath || "(root)"}: ${err.message}`);
    }
  }
  const dagCheck = checkStepDag(state.steps ?? []);
  if (!dagCheck.valid) {
    errors.push(...dagCheck.errors);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Verify step IDs are unique and `depends_on` forms an acyclic DAG.
 */
export function checkStepDag(steps) {
  const errors = [];
  const byId = new Map();
  for (const step of steps) {
    if (byId.has(step.id)) {
      errors.push(`Duplicate step id '${step.id}'`);
    } else {
      byId.set(step.id, step);
    }
  }
  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      if (!byId.has(dep)) {
        errors.push(`Step '${step.id}' depends on unknown step '${dep}'`);
      }
    }
  }

  const state = new Map(); // 0=unvisited, 1=visiting, 2=done
  function visit(id) {
    const cur = state.get(id) ?? 0;
    if (cur === 1) {
      errors.push(`Cycle detected in step DAG involving '${id}'`);
      return false;
    }
    if (cur === 2) return true;
    state.set(id, 1);
    const step = byId.get(id);
    for (const dep of step?.depends_on ?? []) {
      if (!visit(dep)) return false;
    }
    state.set(id, 2);
    return true;
  }

  for (const id of byId.keys()) {
    visit(id);
  }

  return { valid: errors.length === 0, errors };
}

export function canTransitionStatus(fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  return Boolean(allowed && allowed.has(toStatus));
}

/**
 * Load `run-state.json` safely, validate schema, verify evidence containment,
 * and cross-check HEAD commit without ever modifying corrupt files or granting
 * implicit remote authorization from historical approval strings.
 */
export function inspectTaskRecovery({
  projectRoot,
  taskDir,
  schemaPath,
  currentHead = null,
}) {
  const stateCheck = ensureContainedPath(taskDir, "run-state.json");
  if (!stateCheck.ok) {
    return { ok: false, status: "blocked", error: stateCheck.error };
  }
  if (!fs.existsSync(stateCheck.resolvedPath)) {
    return { ok: false, status: "blocked", error: "Missing run-state.json" };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(stateCheck.resolvedPath, "utf8"));
  } catch (err) {
    return {
      ok: false,
      status: "blocked",
      error: `Corrupt run-state.json (preserved intact): ${err.message}`,
    };
  }

  const schemaRes = validateRunStateObject(parsed, schemaPath);
  if (!schemaRes.valid) {
    return {
      ok: false,
      status: "blocked",
      error: `Invalid run-state.json schema: ${schemaRes.errors.join("; ")}`,
    };
  }

  const headChanged =
    currentHead !== null &&
    parsed.head_commit !== null &&
    currentHead !== parsed.head_commit;

  const missingEvidence = [];
  const stepSummary = [];
  const doneSteps = new Set();

  for (const step of parsed.steps) {
    const validEvidence = [];
    let stepMissing = false;
    for (const evPath of step.evidence) {
      const evCheck = ensureContainedPath(projectRoot, evPath);
      if (!evCheck.ok) {
        missingEvidence.push({ stepId: step.id, path: evPath, reason: evCheck.error });
        stepMissing = true;
      } else if (!fs.existsSync(evCheck.resolvedPath)) {
        missingEvidence.push({
          stepId: step.id,
          path: evPath,
          reason: "Evidence file missing on disk",
        });
        stepMissing = true;
      } else {
        validEvidence.push(evCheck.relativePosix);
      }
    }

    const effectiveDone = step.status === "done" && !stepMissing && !headChanged;
    if (effectiveDone) doneSteps.add(step.id);

    stepSummary.push({
      id: step.id,
      recordedStatus: step.status,
      verifiedDone: effectiveDone,
      needsReverification: step.status === "done" && (stepMissing || headChanged),
      validEvidence,
    });
  }

  const nextReadySteps = parsed.steps
    .filter((s) => {
      if (doneSteps.has(s.id)) return false;
      if (s.status === "blocked" || s.status === "skipped") return false;
      return (s.depends_on ?? []).every((dep) => doneSteps.has(dep));
    })
    .map((s) => s.id);

  return {
    ok: missingEvidence.length === 0,
    status: missingEvidence.length > 0 ? "blocked" : parsed.status,
    state: parsed,
    headChanged,
    reverifyRequired: headChanged || missingEvidence.length > 0,
    missingEvidence,
    stepSummary,
    nextReadySteps,
    // Security invariant: historical ledger metadata NEVER authorizes remote writes or commits.
    standingAuthorization: {
      localCommit: false,
      remoteWrite: false,
      destructive: false,
      requiresCurrentTurnApproval: true,
    },
  };
}

/**
 * Atomically write validated run-state.json while rejecting concurrent writers
 * via an exclusive lock file inside taskDir.
 */
export function writeTaskStateAtomic({ taskDir, state, schemaPath }) {
  const schemaRes = validateRunStateObject(state, schemaPath);
  if (!schemaRes.valid) {
    throw new Error(`Refusing to write invalid run-state: ${schemaRes.errors.join("; ")}`);
  }

  fs.mkdirSync(taskDir, { recursive: true });
  const targetCheck = ensureContainedPath(taskDir, "run-state.json");
  if (!targetCheck.ok) {
    throw new Error(targetCheck.error);
  }
  const lockCheck = ensureContainedPath(taskDir, ".run-state.lock");
  if (!lockCheck.ok) {
    throw new Error(lockCheck.error);
  }

  let lockFd;
  try {
    lockFd = fs.openSync(lockCheck.resolvedPath, "wx", 0o600);
    fs.writeFileSync(lockFd, `${process.pid}\n`, "utf8");
  } catch (err) {
    if (err && err.code === "EEXIST") {
      throw new Error(`Concurrent ledger writer lock active: ${lockCheck.resolvedPath}`);
    }
    throw err;
  }

  try {
    atomicWriteFile(targetCheck.resolvedPath, `${JSON.stringify(state, null, 2)}\n`);
  } finally {
    if (lockFd !== undefined) fs.closeSync(lockFd);
    try {
      fs.unlinkSync(lockCheck.resolvedPath);
    } catch {
      // ignore unlock cleanup failure
    }
  }
}
