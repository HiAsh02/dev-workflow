import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import {
  atomicWriteFile,
  ensureContainedPath,
  sha256File,
  withFileLock,
} from "./safe-files.mjs";

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

export const INITIAL_ALLOWED_STATUSES = new Set([
  "intake",
  "designing",
  "planned",
  "executing",
  "blocked",
]);

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

function assertDoneStepsHaveEvidence(state) {
  const checks = new Map((state.checks ?? []).map((check) => [check.id, check]));
  for (const step of state.steps ?? []) {
    if (step.status !== "done") continue;
    if (!Array.isArray(step.evidence) || !step.evidence.length) {
      throw new Error(`Done step '${step.id}' requires at least one evidence file path.`);
    }
    if (!step.verified_head || !step.worktree_fingerprint ||
        !Array.isArray(step.check_ids) || !step.check_ids.length) {
      throw new Error(`Done step '${step.id}' requires verified_head, worktree_fingerprint and passing check_ids.`);
    }
    for (const evidence of step.evidence) {
      const sha = step.evidence_hashes?.[evidence];
      if (!sha || !/^[a-f0-9]{64}$/i.test(sha)) {
        throw new Error(`Done step '${step.id}' requires a SHA-256 for evidence '${evidence}'.`);
      }
    }
    for (const id of step.check_ids) {
      const check = checks.get(id);
      if (!check || check.result !== "passed" || check.exit_code !== 0 ||
          check.head_commit !== step.verified_head) {
        throw new Error(`Done step '${step.id}' references an unverified check '${id}'.`);
      }
    }
  }
}

/**
 * Load `run-state.json` safely, validate schema, verify evidence containment
 * and content hashes, cross-check HEAD and worktree cleanliness, and isolate
 * non-idempotent side-effect steps from automatic re-execution.
 */
export function inspectTaskRecovery({
  projectRoot,
  taskDir,
  schemaPath,
  currentHead = null,
  isDirty = false,
  dirtyFiles = [],
  currentWorktreeFingerprint = null,
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

  const globalHeadChanged =
    currentHead !== null &&
    parsed.head_commit !== null &&
    currentHead !== parsed.head_commit;
  const worktreeDirty = Boolean(
    isDirty || (Array.isArray(dirtyFiles) && dirtyFiles.length > 0)
  );
  const checksById = new Map((parsed.checks ?? []).map((c) => [c.id, c]));

  const missingEvidence = [];
  const stepSummary = [];
  const doneSteps = new Set();
  const manualConfirmationRequiredSteps = [];
  const migrationHints = [];

  for (const step of parsed.steps) {
    const validEvidence = [];
    const staleReasons = [];
    let stepMissing = false;
    const recordedDone = step.status === "done";

    if (recordedDone && step.evidence.length === 0) {
      staleReasons.push("no_evidence_recorded");
    }

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
        const expectedSha =
          step.evidence_hashes?.[evPath] ?? step.evidence_hashes?.[evCheck.relativePosix];
        if (!expectedSha) {
          if (recordedDone) {
            staleReasons.push(`missing_evidence_hash:${evCheck.relativePosix}`);
            migrationHints.push(
              `Step '${step.id}' lacks evidence_hashes['${evCheck.relativePosix}']; re-verify and record SHA-256.`
            );
          } else {
            validEvidence.push(evCheck.relativePosix);
          }
        } else if (sha256File(evCheck.resolvedPath) !== expectedSha) {
          staleReasons.push(`evidence_hash_mismatch:${evCheck.relativePosix}`);
        } else {
          validEvidence.push(evCheck.relativePosix);
        }
      }
    }

    const checkIds = Array.isArray(step.check_ids) ? step.check_ids : [];
    if (recordedDone && checkIds.length === 0) {
      staleReasons.push("missing_check_ids");
      migrationHints.push(
        `Step '${step.id}' lacks check_ids referencing passed checks[]; re-run verification checks.`
      );
    }
    for (const checkId of checkIds) {
      const chk = checksById.get(checkId);
      if (!chk || chk.result !== "passed") {
        staleReasons.push(`check_not_passed:${checkId}`);
      } else if (chk.exit_code !== 0) {
        staleReasons.push(`check_nonzero_exit:${checkId}`);
      } else if (currentHead !== null && chk.head_commit !== currentHead) {
        staleReasons.push(`check_head_mismatch:${checkId}`);
      }
    }

    if (recordedDone) {
      if (currentHead === null) {
        staleReasons.push("current_head_unavailable");
      }
      if (!step.verified_head) {
        staleReasons.push("missing_verified_head");
        migrationHints.push(
          `Step '${step.id}' lacks verified_head; re-verify under current Git HEAD.`
        );
      } else if (
        globalHeadChanged ||
        (currentHead !== null && step.verified_head !== currentHead)
      ) {
        staleReasons.push("head_changed");
      }

      if (worktreeDirty) {
        staleReasons.push("dirty_worktree");
      }
      if (!step.worktree_fingerprint) {
        staleReasons.push("missing_worktree_fingerprint");
        migrationHints.push(
          `Step '${step.id}' lacks worktree_fingerprint; capture clean/dirty fingerprint at verification.`
        );
      } else if (currentWorktreeFingerprint === null) {
        staleReasons.push("current_worktree_fingerprint_unavailable");
      } else if (step.worktree_fingerprint !== currentWorktreeFingerprint) {
        staleReasons.push("worktree_fingerprint_mismatch");
      }
    }

    const needsReverification = recordedDone && (stepMissing || staleReasons.length > 0);
    const verifiedDone = recordedDone && !needsReverification;
    if (verifiedDone) doneSteps.add(step.id);

    const isSideEffect = step.side_effect === true;
    if (isSideEffect && !verifiedDone) {
      manualConfirmationRequiredSteps.push(step.id);
    }

    stepSummary.push({
      id: step.id,
      recordedStatus: step.status,
      recordedDone,
      verifiedDone,
      needsReverification,
      staleReasons,
      sideEffect: isSideEffect,
      validEvidence,
    });
  }

  const nextReadySteps = parsed.steps
    .filter((s) => {
      if (doneSteps.has(s.id)) return false;
      if (s.status === "blocked" || s.status === "skipped") return false;
      if (s.side_effect === true) return false;
      return (s.depends_on ?? []).every((dep) => doneSteps.has(dep));
    })
    .map((s) => s.id);

  const anyReverify =
    globalHeadChanged ||
    worktreeDirty ||
    missingEvidence.length > 0 ||
    stepSummary.some((s) => s.needsReverification);

  return {
    ok: missingEvidence.length === 0,
    status: missingEvidence.length > 0 ? "blocked" : parsed.status,
    state: parsed,
    headChanged: globalHeadChanged,
    worktreeDirty,
    reverifyRequired: anyReverify,
    missingEvidence,
    migrationHints,
    stepSummary,
    nextReadySteps,
    manualConfirmationRequiredSteps,
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
 * Atomically write validated run-state.json under lock, enforcing state machine
 * transitions against the existing ledger and refusing to clobber corrupt files.
 */
export function writeTaskStateAtomic({ taskDir, state, schemaPath }) {
  const schemaRes = validateRunStateObject(state, schemaPath);
  if (!schemaRes.valid) {
    throw new Error(`Refusing to write invalid run-state: ${schemaRes.errors.join("; ")}`);
  }
  assertDoneStepsHaveEvidence(state);

  fs.mkdirSync(taskDir, { recursive: true });
  const targetCheck = ensureContainedPath(taskDir, "run-state.json");
  if (!targetCheck.ok) {
    throw new Error(targetCheck.error);
  }
  const lockCheck = ensureContainedPath(taskDir, ".run-state.lock");
  if (!lockCheck.ok) {
    throw new Error(lockCheck.error);
  }

  withFileLock(
    lockCheck.resolvedPath,
    () => {
      if (fs.existsSync(targetCheck.resolvedPath)) {
        let existing;
        try {
          existing = JSON.parse(fs.readFileSync(targetCheck.resolvedPath, "utf8"));
        } catch (err) {
          throw new Error(
            `Refusing to overwrite corrupt run-state.json (preserved intact): ${err.message}`
          );
        }
        const existingRes = validateRunStateObject(existing, schemaPath);
        if (!existingRes.valid) {
          throw new Error(
            `Refusing to overwrite corrupt run-state.json: ${existingRes.errors.join("; ")}`
          );
        }
        if (existing.task_id !== state.task_id) {
          throw new Error(
            `Task ID mismatch for existing run-state.json: expected '${existing.task_id}', got '${state.task_id}'`
          );
        }
        if (!canTransitionStatus(existing.status, state.status)) {
          throw new Error(
            `Invalid status transition: '${existing.status}' -> '${state.status}'`
          );
        }
      } else if (!INITIAL_ALLOWED_STATUSES.has(state.status)) {
        throw new Error(`Invalid initial status for new run-state.json: '${state.status}'`);
      }

      atomicWriteFile(targetCheck.resolvedPath, `${JSON.stringify(state, null, 2)}\n`);
    },
    `Concurrent ledger writer lock active: ${lockCheck.resolvedPath}`
  );
}
