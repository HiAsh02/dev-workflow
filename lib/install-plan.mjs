import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  atomicWriteExclusive,
  atomicWriteFile,
  ensureContainedPath,
  findCaseCollisions,
  sha256Buffer,
  sha256File,
  walkContainedFiles,
  withFileLock,
} from "./safe-files.mjs";
import { discoverTargets, selectMode } from "./host-probes.mjs";

const PLUGIN_TOP_FILES = ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"];
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;
const OWNERSHIP_RECORD_NAME_REGEX = /^([a-z0-9-]+)-(project|user)-(plugin|skills)\.json$/;

function toPosix(relPath) {
  return String(relPath ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
}

function collectSourceFiles(sourceRoot, mode) {
  const files = [];
  const skillsDir = path.join(sourceRoot, "skills");
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Source skills/ directory missing at ${skillsDir}`);
  }

  if (mode === "plugin") {
    for (const rel of PLUGIN_TOP_FILES) {
      const abs = path.join(sourceRoot, rel);
      if (fs.existsSync(abs)) {
        const buf = fs.readFileSync(abs);
        files.push({ rel, data: buf, sha256: sha256Buffer(buf) });
      }
    }
    const skillFiles = walkContainedFiles(skillsDir);
    for (const relSkillFile of skillFiles) {
      const abs = path.join(skillsDir, relSkillFile);
      const buf = fs.readFileSync(abs);
      files.push({
        rel: `skills/${relSkillFile}`,
        data: buf,
        sha256: sha256Buffer(buf),
      });
    }
  } else if (mode === "skills") {
    const skillFiles = walkContainedFiles(skillsDir);
    for (const relSkillFile of skillFiles) {
      const abs = path.join(skillsDir, relSkillFile);
      const buf = fs.readFileSync(abs);
      files.push({
        rel: relSkillFile,
        data: buf,
        sha256: sha256Buffer(buf),
      });
    }
  } else {
    throw new Error(`Unsupported install mode '${mode}'`);
  }

  return files.sort((a, b) => a.rel.localeCompare(b.rel, "en"));
}

function checkLedgerDirectoryContainment(scopeRoot) {
  if (!fs.existsSync(scopeRoot)) {
    return { ok: true };
  }
  const devWorkflowCheck = ensureContainedPath(scopeRoot, ".dev-workflow");
  if (!devWorkflowCheck.ok) return devWorkflowCheck;
  const installsCheck = ensureContainedPath(scopeRoot, ".dev-workflow/installs");
  if (!installsCheck.ok) return installsCheck;
  return { ok: true, installsCheck };
}

function getSafeLedgerFileCheck(scopeRoot, relativeName) {
  const dirCheck = checkLedgerDirectoryContainment(scopeRoot);
  if (!dirCheck.ok) {
    throw new Error(`Unsafe ownership ledger path: ${dirCheck.error}`);
  }
  const fileCheck = ensureContainedPath(scopeRoot, `.dev-workflow/installs/${relativeName}`);
  if (!fileCheck.ok) {
    throw new Error(`Unsafe ownership ledger path: ${fileCheck.error}`);
  }
  return fileCheck;
}

function getSafeOwnershipCheck(scopeRoot, host, scope, mode) {
  return getSafeLedgerFileCheck(scopeRoot, `${host}-${scope}-${mode}.json`);
}

function getExpectedTargetRoot(host, scope, mode, hostsDir) {
  if (!hostsDir) return null;
  const targets = discoverTargets(host, scope, {
    hostsDir,
    projectRoot: ".",
    homeDir: ".",
  });
  if (!targets.supported) return null;
  const rel = mode === "plugin" ? targets.relativePluginDir : targets.relativeSkillsDir;
  return rel ? toPosix(rel) : null;
}

function isPlainObject(val) {
  return Boolean(val) && typeof val === "object" && !Array.isArray(val);
}

function assertValidOwnershipHeader(data, { host, scope, mode, hostsDir }) {
  if (!isPlainObject(data)) {
    throw new Error("Invalid ownership manifest: expected JSON object");
  }
  if (data.schema_version !== 1 && data.schema_version !== 2) {
    throw new Error(`Invalid ownership manifest: unsupported schema_version '${data.schema_version}'`);
  }
  if (data.host !== host) {
    throw new Error(`Invalid ownership manifest host mismatch: expected '${host}', got '${data.host}'`);
  }
  if (data.scope !== scope) {
    throw new Error(`Invalid ownership manifest scope mismatch: expected '${scope}', got '${data.scope}'`);
  }
  if (data.mode !== mode) {
    throw new Error(`Invalid ownership manifest mode mismatch: expected '${mode}', got '${data.mode}'`);
  }
  const expectedTargetRoot = getExpectedTargetRoot(host, scope, mode, hostsDir);
  if (expectedTargetRoot && data.target_root !== undefined) {
    if (toPosix(data.target_root) !== expectedTargetRoot) {
      throw new Error(
        `Invalid ownership manifest target_root mismatch: expected '${expectedTargetRoot}', got '${data.target_root}'`
      );
    }
  }
  if (!isPlainObject(data.files)) {
    throw new Error("Invalid ownership manifest: 'files' must be an object map");
  }
  return expectedTargetRoot || (data.target_root ? toPosix(data.target_root) : null);
}

export function readOwnership({ scopeRoot, host, scope, mode, hostsDir = null }) {
  const fileCheck = getSafeOwnershipCheck(scopeRoot, host, scope, mode);
  if (!fs.existsSync(fileCheck.resolvedPath)) {
    return null;
  }
  const stat = fs.lstatSync(fileCheck.resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Unsafe ownership ledger entry is not a regular file: ${fileCheck.resolvedPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(fileCheck.resolvedPath, "utf8"));
  assertValidOwnershipHeader(parsed, { host, scope, mode, hostsDir });
  return { path: fileCheck.resolvedPath, data: parsed };
}

function readAllOwnershipRecords({ scopeRoot, hostsDir = null }) {
  const dirCheck = checkLedgerDirectoryContainment(scopeRoot);
  if (!dirCheck.ok) {
    throw new Error(`Unsafe ownership ledger directory: ${dirCheck.error}`);
  }
  const installsDir = dirCheck.installsCheck?.resolvedPath;
  if (!installsDir || !fs.existsSync(installsDir)) {
    return [];
  }
  const entries = fs
    .readdirSync(installsDir)
    .filter((name) => OWNERSHIP_RECORD_NAME_REGEX.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));

  const records = [];
  for (const file of entries) {
    const match = file.match(OWNERSHIP_RECORD_NAME_REGEX);
    const [, fileHost, fileScope, fileMode] = match;
    const fileCheck = getSafeLedgerFileCheck(scopeRoot, file);
    if (!fs.existsSync(fileCheck.resolvedPath)) continue;
    const stat = fs.lstatSync(fileCheck.resolvedPath);
    if (!stat.isFile()) {
      throw new Error(`Unsafe ownership ledger file: ${fileCheck.resolvedPath}`);
    }
    const parsed = JSON.parse(fs.readFileSync(fileCheck.resolvedPath, "utf8"));
    assertValidOwnershipHeader(parsed, {
      host: fileHost,
      scope: fileScope,
      mode: fileMode,
      hostsDir,
    });
    records.push({
      recordFile: file,
      path: fileCheck.resolvedPath,
      host: fileHost,
      scope: fileScope,
      mode: fileMode,
      data: parsed,
    });
  }
  return records;
}

function collectOwnedEntriesMap(records, excludeRecordFile = null) {
  const map = new Map();
  for (const rec of records) {
    if (excludeRecordFile && rec.recordFile === excludeRecordFile) continue;
    for (const [relPath, meta] of Object.entries(rec.data.files ?? {})) {
      if (!isPlainObject(meta) || !SHA256_HEX_REGEX.test(String(meta.sha256 ?? ""))) {
        continue;
      }
      if (meta.provenance === "preexisting_unowned") continue;
      if (!map.has(relPath)) {
        map.set(relPath, { sha256: meta.sha256, hosts: [] });
      }
      map.get(relPath).hosts.push(rec.host);
    }
  }
  return map;
}

function isPathWithinPrefix(relativePosix, prefixPosix) {
  if (!prefixPosix) return true;
  return relativePosix === prefixPosix || relativePosix.startsWith(`${prefixPosix}/`);
}

function resolveModeWithInstalled({ host, scope, requestedMode, hostsDir, scopeRoot, preferInstalled }) {
  if (requestedMode !== "auto" || !preferInstalled) {
    return selectMode(host, requestedMode, { scope, hostsDir });
  }
  const all = readAllOwnershipRecords({ scopeRoot, hostsDir });
  const matches = all.filter((r) => r.host === host && r.scope === scope);
  if (matches.length === 1) {
    return {
      mode: matches[0].mode,
      supported: true,
      reason: `Matched existing '${matches[0].mode}' installation for ${host} (${scope} scope).`,
    };
  }
  if (matches.length > 1) {
    return {
      mode: "auto",
      supported: false,
      reason: `Multiple installed modes found for ${host} (${scope} scope): ${matches
        .map((m) => m.mode)
        .join(", ")}. Re-run with explicit --mode.`,
    };
  }
  return selectMode(host, requestedMode, { scope, hostsDir });
}

/**
 * Pure computation of install/update plan. Performs ZERO disk writes.
 */
export function buildInstallPlan({
  sourceRoot,
  projectRoot = process.cwd(),
  homeDir = os.homedir(),
  hostsDir,
  host,
  scope = "project",
  mode = "auto",
  sourceRef = null,
  confirmUser = false,
  adopt = false,
  preferInstalledMode = false,
}) {
  const targets = discoverTargets(host, scope, { hostsDir, projectRoot, homeDir });
  if (!targets.supported) {
    return {
      supported: false,
      host,
      scope,
      mode,
      reason: targets.reason,
      actions: [],
      conflicts: [],
      requires_confirmation: scope === "user",
    };
  }

  const scopeRoot = targets.baseRoot;
  if (!fs.existsSync(scopeRoot)) {
    return {
      supported: false,
      host,
      scope,
      mode,
      reason: `Scope root directory does not exist: ${scopeRoot}`,
      actions: [],
      conflicts: [],
      requires_confirmation: scope === "user",
    };
  }

  const ledgerCheck = checkLedgerDirectoryContainment(scopeRoot);
  if (!ledgerCheck.ok) {
    return {
      supported: false,
      host,
      scope,
      mode,
      reason: `Unsafe ownership path: ${ledgerCheck.error}`,
      actions: [],
      conflicts: [],
      requires_confirmation: scope === "user",
    };
  }

  const modeSel = resolveModeWithInstalled({
    host,
    scope,
    requestedMode: mode,
    hostsDir,
    scopeRoot,
    preferInstalled: preferInstalledMode,
  });
  if (!modeSel.supported) {
    return {
      supported: false,
      host,
      scope,
      mode: modeSel.mode,
      reason: modeSel.reason,
      actions: [],
      conflicts: [],
      requires_confirmation: scope === "user",
    };
  }

  const resolvedMode = modeSel.mode;
  const relTargetRoot =
    resolvedMode === "plugin" ? targets.relativePluginDir : targets.relativeSkillsDir;
  if (!relTargetRoot) {
    return {
      supported: false,
      host,
      scope,
      mode: resolvedMode,
      reason: `No target directory defined for ${host} in '${resolvedMode}' mode (${scope} scope).`,
      actions: [],
      conflicts: [],
      requires_confirmation: scope === "user",
    };
  }

  const versionPath = path.join(sourceRoot, "VERSION");
  const sourceVersion = fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, "utf8").trim()
    : "0.0.0";

  const sourceFiles = collectSourceFiles(sourceRoot, resolvedMode);
  const collisions = findCaseCollisions(sourceFiles.map((f) => `${relTargetRoot}/${f.rel}`));
  if (collisions.length > 0) {
    throw new Error(`Case collision in planned paths: ${JSON.stringify(collisions)}`);
  }

  const currentRecordKey = `${host}-${scope}-${resolvedMode}.json`;
  const allRecords = readAllOwnershipRecords({ scopeRoot, hostsDir });
  const ownership = allRecords.find((r) => r.recordFile === currentRecordKey) ?? null;
  const priorFiles = ownership?.data?.files ?? {};
  const siblingOwners = collectOwnedEntriesMap(allRecords, currentRecordKey);

  const actions = [];
  const conflicts = [];
  const plannedRelPaths = new Set();

  for (const src of sourceFiles) {
    const destRel = `${relTargetRoot}/${src.rel}`.replaceAll("\\", "/");
    plannedRelPaths.add(destRel);

    const check = ensureContainedPath(scopeRoot, destRel);
    if (!check.ok) {
      conflicts.push({
        relative_path: destRel,
        reason: `Unsafe target path: ${check.error}`,
      });
      continue;
    }

    if (!fs.existsSync(check.resolvedPath)) {
      actions.push({
        kind: "create",
        relative_path: check.relativePosix,
        source_rel: src.rel,
        sha256: src.sha256,
        expected_before: { exists: false },
      });
      continue;
    }

    const stat = fs.lstatSync(check.resolvedPath);
    if (!stat.isFile()) {
      conflicts.push({
        relative_path: check.relativePosix,
        reason: "Existing target is not a regular file",
      });
      continue;
    }

    const destSha = sha256File(check.resolvedPath);
    const priorMeta = priorFiles[check.relativePosix];
    const isOwnedHere = Boolean(
      isPlainObject(priorMeta) &&
        SHA256_HEX_REGEX.test(String(priorMeta.sha256 ?? "")) &&
        priorMeta.provenance !== "preexisting_unowned"
    );
    const siblingOwner = siblingOwners.get(check.relativePosix);

    if (destSha === src.sha256) {
      if (isOwnedHere) {
        actions.push({
          kind: "unchanged",
          relative_path: check.relativePosix,
          source_rel: src.rel,
          sha256: src.sha256,
          expected_before: { exists: true, sha256: destSha },
        });
      } else if (siblingOwner) {
        actions.push({
          kind: "shared_unchanged",
          relative_path: check.relativePosix,
          source_rel: src.rel,
          sha256: src.sha256,
          shared_with: siblingOwner.hosts,
          expected_before: { exists: true, sha256: destSha },
        });
      } else if (adopt) {
        actions.push({
          kind: "adopt",
          relative_path: check.relativePosix,
          source_rel: src.rel,
          sha256: src.sha256,
          expected_before: { exists: true, sha256: destSha },
        });
      } else {
        actions.push({
          kind: "preexisting_identical_unowned",
          relative_path: check.relativePosix,
          source_rel: src.rel,
          sha256: src.sha256,
          expected_before: { exists: true, sha256: destSha },
        });
      }
      continue;
    }

    const recordedHash = isOwnedHere ? priorMeta.sha256 : siblingOwner?.sha256;
    if (!recordedHash) {
      conflicts.push({
        relative_path: check.relativePosix,
        reason: "Existing file has no dev-workflow ownership record (no-clobber)",
      });
    } else if (recordedHash !== destSha) {
      conflicts.push({
        relative_path: check.relativePosix,
        reason: "Target file was modified locally since installation (no-clobber)",
      });
    } else {
      actions.push({
        kind: "update",
        relative_path: check.relativePosix,
        source_rel: src.rel,
        sha256: src.sha256,
        expected_before: { exists: true, sha256: destSha },
      });
    }
  }

  for (const [oldRel, meta] of Object.entries(priorFiles)) {
    if (plannedRelPaths.has(oldRel)) continue;
    const check = ensureContainedPath(scopeRoot, oldRel);
    if (!check.ok || !fs.existsSync(check.resolvedPath)) continue;
    const stat = fs.lstatSync(check.resolvedPath);
    if (!stat.isFile()) continue;
    const destSha = sha256File(check.resolvedPath);
    if (siblingOwners.has(check.relativePosix)) {
      actions.push({
        kind: "release_shared_stale",
        relative_path: check.relativePosix,
        sha256: destSha,
        expected_before: { exists: true, sha256: destSha },
      });
    } else if (destSha === meta.sha256) {
      actions.push({
        kind: "delete_stale",
        relative_path: check.relativePosix,
        sha256: destSha,
        expected_before: { exists: true, sha256: destSha },
      });
    } else {
      conflicts.push({
        relative_path: check.relativePosix,
        reason: "Stale owned file was locally modified; refusing automatic removal",
      });
    }
  }

  return {
    supported: true,
    host,
    scope,
    mode: resolvedMode,
    hostsDir: hostsDir ? path.resolve(hostsDir) : null,
    scopeRoot: fs.realpathSync(scopeRoot),
    sourceRoot: path.resolve(sourceRoot),
    source_version: sourceVersion,
    source_ref: sourceRef,
    target_root: toPosix(relTargetRoot),
    actions,
    conflicts,
    requires_confirmation: scope === "user",
    confirmed: scope !== "user" || confirmUser === true,
  };
}

function verifyActionPrecondition(scopeRoot, action) {
  const check = ensureContainedPath(scopeRoot, action.relative_path);
  if (!check.ok) {
    throw new Error(`Containment violation during apply: ${check.error}`);
  }
  const exp = action.expected_before;
  if (!exp) return check;

  if (exp.exists === false) {
    if (fs.existsSync(check.resolvedPath)) {
      throw new Error(
        `TOCTOU verification failed: '${action.relative_path}' changed on disk (already exists)`
      );
    }
    return check;
  }

  if (!fs.existsSync(check.resolvedPath)) {
    throw new Error(
      `TOCTOU verification failed: '${action.relative_path}' changed on disk (missing)`
    );
  }
  const stat = fs.lstatSync(check.resolvedPath);
  if (!stat.isFile()) {
    throw new Error(
      `TOCTOU verification failed: '${action.relative_path}' is no longer a regular file`
    );
  }
  const actualSha = sha256File(check.resolvedPath);
  if (actualSha !== exp.sha256) {
    throw new Error(
      `TOCTOU verification failed: '${action.relative_path}' changed on disk since plan`
    );
  }
  return check;
}

function pruneEmptyDirsUpward(startDir, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);
  while (current.startsWith(stop + path.sep) && current !== stop) {
    if (!fs.existsSync(current)) break;
    const entries = fs.readdirSync(current);
    if (entries.length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function rollbackUndoLog(scopeRoot, undoLog) {
  const rollbackErrors = [];
  for (let i = undoLog.length - 1; i >= 0; i -= 1) {
    const entry = undoLog[i];
    try {
      if (entry.type === "created") {
        if (fs.existsSync(entry.targetPath)) {
          fs.unlinkSync(entry.targetPath);
          pruneEmptyDirsUpward(path.dirname(entry.targetPath), scopeRoot);
        }
      } else if (entry.type === "restore") {
        atomicWriteFile(entry.targetPath, fs.readFileSync(entry.backupPath));
      }
    } catch (err) {
      rollbackErrors.push(`${entry.relative_path}: ${err.message}`);
    }
  }
  return rollbackErrors;
}

function updateSiblingSharedHashes(scopeRoot, currentRecordFile, updatedHashes, hostsDir) {
  if (updatedHashes.size === 0) return;
  const records = readAllOwnershipRecords({ scopeRoot, hostsDir });
  for (const rec of records) {
    if (rec.recordFile === currentRecordFile) continue;
    let touched = false;
    for (const [relPath, nextSha] of updatedHashes.entries()) {
      if (rec.data.files?.[relPath]) {
        rec.data.files[relPath] = {
          ...rec.data.files[relPath],
          sha256: nextSha,
        };
        touched = true;
      }
    }
    if (touched) {
      atomicWriteFile(rec.path, `${JSON.stringify(rec.data, null, 2)}\n`);
    }
  }
}

/**
 * Execute a previously computed install/update plan inside a scoped file lock
 * with full TOCTOU pre-checks, backup journal, and automatic rollback on failure.
 */
export function applyInstallPlan(plan, { confirmUser = false, onBeforeAction = null } = {}) {
  if (!plan.supported) {
    throw new Error(plan.reason || "Unsupported install plan");
  }
  if (plan.requires_confirmation && !confirmUser) {
    throw new Error(
      "User-scope installation requires explicit confirmation (--confirm-user)."
    );
  }
  if (plan.conflicts.length > 0) {
    const details = plan.conflicts
      .map((c) => `${c.relative_path}: ${c.reason}`)
      .join("; ");
    throw new Error(`Aborting due to conflicts (no-clobber): ${details}`);
  }

  const lockCheck = getSafeLedgerFileCheck(plan.scopeRoot, ".apply.lock");
  return withFileLock(
    lockCheck.resolvedPath,
    () => {
      // Phase 1: Stage source bytes in memory & re-verify all preconditions before any write
      const stagedSources = new Map();
      for (const action of plan.actions) {
        verifyActionPrecondition(plan.scopeRoot, action);
        if (action.kind === "create" || action.kind === "update") {
          const srcSubdir = plan.mode === "plugin" ? "" : "skills";
          const srcAbs = path.join(plan.sourceRoot, srcSubdir, action.source_rel);
          stagedSources.set(action.relative_path, fs.readFileSync(srcAbs));
        }
      }

      const backupDirCheck = getSafeLedgerFileCheck(
        plan.scopeRoot,
        `.txn-backup-${process.pid}-${Date.now()}`
      );
      const journalCheck = getSafeLedgerFileCheck(plan.scopeRoot, ".txn-journal.json");
      fs.mkdirSync(backupDirCheck.resolvedPath, { recursive: true });
      atomicWriteFile(
        journalCheck.resolvedPath,
        `${JSON.stringify(
          {
            operation: "install",
            host: plan.host,
            scope: plan.scope,
            mode: plan.mode,
            started_at: new Date().toISOString(),
            status: "in_progress",
          },
          null,
          2
        )}\n`
      );

      const ownershipFiles = {};
      const written = [];
      const removed = [];
      const unchanged = [];
      const preserved = [];
      const updatedSharedHashes = new Map();
      const undoLog = [];
      let backupIdx = 0;

      try {
        for (let idx = 0; idx < plan.actions.length; idx += 1) {
          const action = plan.actions[idx];
          if (onBeforeAction) onBeforeAction(action, idx);

          const check = verifyActionPrecondition(plan.scopeRoot, action);
          if (action.kind === "create") {
            atomicWriteExclusive(check.resolvedPath, stagedSources.get(action.relative_path));
            undoLog.push({
              type: "created",
              relative_path: action.relative_path,
              targetPath: check.resolvedPath,
            });
            ownershipFiles[action.relative_path] = {
              sha256: action.sha256,
              provenance: "created",
            };
            written.push(action.relative_path);
          } else if (action.kind === "update") {
            backupIdx += 1;
            const backupPath = path.join(backupDirCheck.resolvedPath, `bak-${backupIdx}`);
            fs.copyFileSync(check.resolvedPath, backupPath);
            undoLog.push({
              type: "restore",
              relative_path: action.relative_path,
              targetPath: check.resolvedPath,
              backupPath,
            });
            atomicWriteFile(check.resolvedPath, stagedSources.get(action.relative_path));
            ownershipFiles[action.relative_path] = {
              sha256: action.sha256,
              provenance: "created",
            };
            written.push(action.relative_path);
            updatedSharedHashes.set(action.relative_path, action.sha256);
          } else if (action.kind === "unchanged" || action.kind === "shared_unchanged") {
            ownershipFiles[action.relative_path] = {
              sha256: action.sha256,
              provenance: action.kind === "shared_unchanged" ? "shared" : "created",
            };
            unchanged.push(action.relative_path);
          } else if (action.kind === "adopt") {
            ownershipFiles[action.relative_path] = {
              sha256: action.sha256,
              provenance: "adopted",
            };
            unchanged.push(action.relative_path);
          } else if (action.kind === "preexisting_identical_unowned") {
            // Preserve without recording ownership
            preserved.push(action.relative_path);
          } else if (action.kind === "delete_stale") {
            backupIdx += 1;
            const backupPath = path.join(backupDirCheck.resolvedPath, `bak-${backupIdx}`);
            fs.copyFileSync(check.resolvedPath, backupPath);
            undoLog.push({
              type: "restore",
              relative_path: action.relative_path,
              targetPath: check.resolvedPath,
              backupPath,
            });
            fs.unlinkSync(check.resolvedPath);
            pruneEmptyDirsUpward(path.dirname(check.resolvedPath), plan.scopeRoot);
            removed.push(action.relative_path);
          } else if (action.kind === "release_shared_stale") {
            // Dropped from current host ownership without deleting shared file
            preserved.push(action.relative_path);
          }
        }

        const recordFile = `${plan.host}-${plan.scope}-${plan.mode}.json`;
        const ownershipCheck = getSafeOwnershipCheck(
          plan.scopeRoot,
          plan.host,
          plan.scope,
          plan.mode
        );
        const manifestData = {
          schema_version: 2,
          host: plan.host,
          scope: plan.scope,
          mode: plan.mode,
          source_version: plan.source_version,
          source_ref: plan.source_ref,
          target_root: plan.target_root,
          installed_at: new Date().toISOString(),
          files: ownershipFiles,
        };
        atomicWriteFile(
          ownershipCheck.resolvedPath,
          `${JSON.stringify(manifestData, null, 2)}\n`
        );
        updateSiblingSharedHashes(
          plan.scopeRoot,
          recordFile,
          updatedSharedHashes,
          plan.hostsDir
        );

        fs.rmSync(backupDirCheck.resolvedPath, { recursive: true, force: true });
        if (fs.existsSync(journalCheck.resolvedPath)) fs.unlinkSync(journalCheck.resolvedPath);

        return {
          applied: true,
          host: plan.host,
          scope: plan.scope,
          mode: plan.mode,
          ownership_file: path
            .relative(plan.scopeRoot, ownershipCheck.resolvedPath)
            .replaceAll("\\", "/"),
          written,
          unchanged,
          preserved,
          removed,
        };
      } catch (err) {
        const rbErrors = rollbackUndoLog(plan.scopeRoot, undoLog);
        if (rbErrors.length === 0) {
          fs.rmSync(backupDirCheck.resolvedPath, { recursive: true, force: true });
          if (fs.existsSync(journalCheck.resolvedPath)) fs.unlinkSync(journalCheck.resolvedPath);
        } else {
          atomicWriteFile(
            journalCheck.resolvedPath,
            `${JSON.stringify(
              {
                operation: "install",
                status: "rollback_incomplete",
                error: err.message,
                rollbackErrors: rbErrors,
                backupDir: backupDirCheck.relativePosix,
              },
              null,
              2
            )}\n`
          );
        }
        throw err;
      }
    },
    `Concurrent installer lock active at ${lockCheck.resolvedPath}`
  );
}

/**
 * Pure computation of uninstall plan. Only unmodified files recorded in the
 * verified ownership manifest (within allowed target_root) with zero remaining
 * sibling host references are eligible for deletion.
 */
export function buildUninstallPlan({
  projectRoot = process.cwd(),
  homeDir = os.homedir(),
  hostsDir,
  host,
  scope = "project",
  mode = "auto",
  confirmUser = false,
}) {
  const targets = discoverTargets(host, scope, { hostsDir, projectRoot, homeDir });
  if (!targets.supported) {
    return {
      supported: false,
      host,
      scope,
      mode,
      reason: targets.reason,
      actions: [],
      preserved: [],
      requires_confirmation: scope === "user",
    };
  }
  const scopeRoot = targets.baseRoot;
  if (fs.existsSync(scopeRoot)) {
    const ledgerCheck = checkLedgerDirectoryContainment(scopeRoot);
    if (!ledgerCheck.ok) {
      return {
        supported: false,
        host,
        scope,
        mode,
        reason: `Unsafe ownership path: ${ledgerCheck.error}`,
        actions: [],
        preserved: [],
        requires_confirmation: scope === "user",
      };
    }
  }

  const modeSel = resolveModeWithInstalled({
    host,
    scope,
    requestedMode: mode,
    hostsDir,
    scopeRoot,
    preferInstalled: fs.existsSync(scopeRoot),
  });
  if (!modeSel.supported) {
    return {
      supported: false,
      host,
      scope,
      mode: modeSel.mode,
      reason: modeSel.reason,
      actions: [],
      preserved: [],
      requires_confirmation: scope === "user",
    };
  }
  const resolvedMode = modeSel.mode;

  const ownership = fs.existsSync(scopeRoot)
    ? readOwnership({ scopeRoot, host, scope, mode: resolvedMode, hostsDir })
    : null;
  if (!ownership) {
    return {
      supported: true,
      hasOwnership: false,
      host,
      scope,
      mode: resolvedMode,
      scopeRoot: fs.existsSync(scopeRoot) ? fs.realpathSync(scopeRoot) : scopeRoot,
      actions: [],
      preserved: [],
      requires_confirmation: scope === "user",
      confirmed: scope !== "user" || confirmUser === true,
      reason: "No ownership manifest found; refusing to delete untracked files.",
    };
  }

  const canonicalScopeRoot = fs.realpathSync(scopeRoot);
  const currentRecordKey = `${host}-${scope}-${resolvedMode}.json`;
  const allRecords = readAllOwnershipRecords({ scopeRoot: canonicalScopeRoot, hostsDir });
  const siblingOwners = collectOwnedEntriesMap(allRecords, currentRecordKey);
  const expectedTargetRoot =
    getExpectedTargetRoot(host, scope, resolvedMode, hostsDir) ??
    toPosix(ownership.data.target_root);

  const actions = [];
  const preserved = [];

  for (const [relPath, meta] of Object.entries(ownership.data.files ?? {})) {
    if (!isPlainObject(meta) || !SHA256_HEX_REGEX.test(String(meta.sha256 ?? ""))) {
      throw new Error(`Invalid ownership entry hash for '${relPath}'`);
    }
    if (meta.provenance === "preexisting_unowned") {
      preserved.push({
        relative_path: relPath,
        reason: "Preexisting unowned provenance; preserved",
      });
      continue;
    }

    const check = ensureContainedPath(canonicalScopeRoot, relPath);
    if (!check.ok) {
      preserved.push({
        relative_path: relPath,
        reason: `Unsafe path skipped: ${check.error}`,
      });
      continue;
    }

    if (expectedTargetRoot && !isPathWithinPrefix(check.relativePosix, expectedTargetRoot)) {
      throw new Error(
        `Invalid ownership entry '${relPath}' outside allowed target_root '${expectedTargetRoot}'`
      );
    }

    if (!fs.existsSync(check.resolvedPath)) {
      actions.push({ kind: "already_missing", relative_path: check.relativePosix });
      continue;
    }
    const stat = fs.lstatSync(check.resolvedPath);
    if (!stat.isFile()) {
      preserved.push({
        relative_path: check.relativePosix,
        reason: "Not a regular file; preserved",
      });
      continue;
    }
    const currentSha = sha256File(check.resolvedPath);
    if (currentSha !== meta.sha256) {
      preserved.push({
        relative_path: check.relativePosix,
        reason: "Checksum mismatch (modified by user); preserved",
      });
      continue;
    }

    const sibling = siblingOwners.get(check.relativePosix);
    if (sibling) {
      actions.push({
        kind: "retained_shared",
        relative_path: check.relativePosix,
        shared_with: sibling.hosts,
        expected_before: { exists: true, sha256: currentSha },
      });
    } else {
      actions.push({
        kind: "delete",
        relative_path: check.relativePosix,
        expected_before: { exists: true, sha256: currentSha },
      });
    }
  }

  return {
    supported: true,
    hasOwnership: true,
    host,
    scope,
    mode: resolvedMode,
    hostsDir: hostsDir ? path.resolve(hostsDir) : null,
    scopeRoot: canonicalScopeRoot,
    ownershipPath: ownership.path,
    target_root: toPosix(ownership.data.target_root ?? expectedTargetRoot),
    actions,
    preserved,
    requires_confirmation: scope === "user",
    confirmed: scope !== "user" || confirmUser === true,
  };
}

export function applyUninstallPlan(plan, { confirmUser = false, onBeforeAction = null } = {}) {
  if (!plan.supported) {
    throw new Error(plan.reason || "Unsupported uninstall plan");
  }
  if (!plan.hasOwnership) {
    throw new Error(plan.reason || "No ownership manifest found");
  }
  if (plan.requires_confirmation && !confirmUser) {
    throw new Error(
      "User-scope uninstall requires explicit confirmation (--confirm-user)."
    );
  }

  const lockCheck = getSafeLedgerFileCheck(plan.scopeRoot, ".apply.lock");
  return withFileLock(
    lockCheck.resolvedPath,
    () => {
      const currentRecordKey = `${plan.host}-${plan.scope}-${plan.mode}.json`;
      const allRecords = readAllOwnershipRecords({
        scopeRoot: plan.scopeRoot,
        hostsDir: plan.hostsDir ?? null,
      });
      const liveSiblings = collectOwnedEntriesMap(allRecords, currentRecordKey);

      for (const action of plan.actions) {
        if (action.kind === "already_missing") continue;
        verifyActionPrecondition(plan.scopeRoot, action);
      }

      const backupDirCheck = getSafeLedgerFileCheck(
        plan.scopeRoot,
        `.txn-backup-uninst-${process.pid}-${Date.now()}`
      );
      fs.mkdirSync(backupDirCheck.resolvedPath, { recursive: true });

      const deleted = [];
      const retainedShared = [];
      const undoLog = [];
      let backupIdx = 0;

      try {
        for (let idx = 0; idx < plan.actions.length; idx += 1) {
          const action = plan.actions[idx];
          if (action.kind === "already_missing") continue;
          if (onBeforeAction) onBeforeAction(action, idx);

          const check = verifyActionPrecondition(plan.scopeRoot, action);
          if (action.kind === "retained_shared" || liveSiblings.has(action.relative_path)) {
            retainedShared.push(action.relative_path);
            continue;
          }
          if (action.kind === "delete") {
            backupIdx += 1;
            const backupPath = path.join(backupDirCheck.resolvedPath, `bak-${backupIdx}`);
            fs.copyFileSync(check.resolvedPath, backupPath);
            undoLog.push({
              type: "restore",
              relative_path: action.relative_path,
              targetPath: check.resolvedPath,
              backupPath,
            });
            fs.unlinkSync(check.resolvedPath);
            pruneEmptyDirsUpward(path.dirname(check.resolvedPath), plan.scopeRoot);
            deleted.push(action.relative_path);
          }
        }

        const ownershipCheck = getSafeOwnershipCheck(
          plan.scopeRoot,
          plan.host,
          plan.scope,
          plan.mode
        );
        if (plan.preserved.length === 0 && fs.existsSync(ownershipCheck.resolvedPath)) {
          fs.unlinkSync(ownershipCheck.resolvedPath);
          pruneEmptyDirsUpward(path.dirname(ownershipCheck.resolvedPath), plan.scopeRoot);
        } else if (fs.existsSync(ownershipCheck.resolvedPath)) {
          const current = JSON.parse(fs.readFileSync(ownershipCheck.resolvedPath, "utf8"));
          const nextFiles = {};
          for (const p of plan.preserved) {
            if (current.files?.[p.relative_path]) {
              nextFiles[p.relative_path] = current.files[p.relative_path];
            }
          }
          current.files = nextFiles;
          atomicWriteFile(
            ownershipCheck.resolvedPath,
            `${JSON.stringify(current, null, 2)}\n`
          );
        }

        fs.rmSync(backupDirCheck.resolvedPath, { recursive: true, force: true });
        return {
          uninstalled: true,
          host: plan.host,
          scope: plan.scope,
          mode: plan.mode,
          deleted,
          retained_shared: retainedShared,
          preserved: plan.preserved,
        };
      } catch (err) {
        rollbackUndoLog(plan.scopeRoot, undoLog);
        fs.rmSync(backupDirCheck.resolvedPath, { recursive: true, force: true });
        throw err;
      }
    },
    `Concurrent uninstaller lock active at ${lockCheck.resolvedPath}`
  );
}

export function listInstalledPackages({ scopeRoot, hostsDir = null }) {
  const dirCheck = checkLedgerDirectoryContainment(scopeRoot);
  if (!dirCheck.ok) {
    throw new Error(`Unsafe ownership ledger path: ${dirCheck.error}`);
  }
  const records = readAllOwnershipRecords({ scopeRoot, hostsDir });
  return records.map((rec) => ({
    record_file: rec.recordFile,
    host: rec.data.host,
    scope: rec.data.scope,
    mode: rec.data.mode,
    source_version: rec.data.source_version,
    source_ref: rec.data.source_ref,
    target_root: rec.data.target_root,
    file_count: Object.keys(rec.data.files ?? {}).length,
    installed_at: rec.data.installed_at,
  }));
}
