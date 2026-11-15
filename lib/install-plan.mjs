import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  atomicWriteFile,
  ensureContainedPath,
  findCaseCollisions,
  sha256Buffer,
  sha256File,
  walkContainedFiles,
} from "./safe-files.mjs";
import { discoverTargets, selectMode } from "./host-probes.mjs";

const PLUGIN_TOP_FILES = ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"];

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

function getOwnershipPath(scopeRoot, host, scope, mode) {
  return path.join(scopeRoot, ".dev-workflow", "installs", `${host}-${scope}-${mode}.json`);
}

export function readOwnership({ scopeRoot, host, scope, mode }) {
  const ownershipPath = getOwnershipPath(scopeRoot, host, scope, mode);
  if (!fs.existsSync(ownershipPath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(ownershipPath, "utf8"));
  return { path: ownershipPath, data: parsed };
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
}) {
  const modeSel = selectMode(host, mode, { scope, hostsDir });
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

  const targets = discoverTargets(host, scope, { hostsDir, projectRoot, homeDir });
  if (!targets.supported) {
    return {
      supported: false,
      host,
      scope,
      mode: modeSel.mode,
      reason: targets.reason,
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

  const scopeRoot = targets.baseRoot;
  if (!fs.existsSync(scopeRoot)) {
    return {
      supported: false,
      host,
      scope,
      mode: resolvedMode,
      reason: `Scope root directory does not exist: ${scopeRoot}`,
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

  const ownership = readOwnership({ scopeRoot, host, scope, mode: resolvedMode });
  const priorFiles = ownership?.data?.files ?? {};

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
    if (destSha === src.sha256) {
      actions.push({
        kind: "unchanged",
        relative_path: check.relativePosix,
        source_rel: src.rel,
        sha256: src.sha256,
      });
      continue;
    }

    const recordedHash = priorFiles[check.relativePosix]?.sha256;
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
      });
    }
  }

  // Handle stale files from prior versions
  for (const [oldRel, meta] of Object.entries(priorFiles)) {
    if (plannedRelPaths.has(oldRel)) continue;
    const check = ensureContainedPath(scopeRoot, oldRel);
    if (!check.ok || !fs.existsSync(check.resolvedPath)) continue;
    const destSha = sha256File(check.resolvedPath);
    if (destSha === meta.sha256) {
      actions.push({
        kind: "delete_stale",
        relative_path: check.relativePosix,
        sha256: destSha,
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
    scopeRoot: fs.realpathSync(scopeRoot),
    sourceRoot: path.resolve(sourceRoot),
    source_version: sourceVersion,
    source_ref: sourceRef,
    target_root: relTargetRoot,
    actions,
    conflicts,
    requires_confirmation: scope === "user",
    confirmed: scope !== "user" || confirmUser === true,
  };
}

/**
 * Execute a previously computed install/update plan atomically.
 */
export function applyInstallPlan(plan, { confirmUser = false } = {}) {
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

  const ownershipFiles = {};
  const written = [];
  const removed = [];
  const unchanged = [];

  for (const action of plan.actions) {
    const check = ensureContainedPath(plan.scopeRoot, action.relative_path);
    if (!check.ok) {
      throw new Error(`Containment violation during apply: ${check.error}`);
    }

    if (action.kind === "create" || action.kind === "update") {
      const srcSubdir = plan.mode === "plugin" ? "" : "skills";
      const srcAbs = path.join(plan.sourceRoot, srcSubdir, action.source_rel);
      const data = fs.readFileSync(srcAbs);
      atomicWriteFile(check.resolvedPath, data);
      ownershipFiles[action.relative_path] = { sha256: action.sha256 };
      written.push(action.relative_path);
    } else if (action.kind === "unchanged") {
      ownershipFiles[action.relative_path] = { sha256: action.sha256 };
      unchanged.push(action.relative_path);
    } else if (action.kind === "delete_stale") {
      fs.unlinkSync(check.resolvedPath);
      removed.push(action.relative_path);
    }
  }

  const ownershipPath = getOwnershipPath(
    plan.scopeRoot,
    plan.host,
    plan.scope,
    plan.mode
  );
  const manifestData = {
    schema_version: 1,
    host: plan.host,
    scope: plan.scope,
    mode: plan.mode,
    source_version: plan.source_version,
    source_ref: plan.source_ref,
    target_root: plan.target_root,
    installed_at: new Date().toISOString(),
    files: ownershipFiles,
  };
  atomicWriteFile(ownershipPath, `${JSON.stringify(manifestData, null, 2)}\n`);

  return {
    applied: true,
    host: plan.host,
    scope: plan.scope,
    mode: plan.mode,
    ownership_file: path.relative(plan.scopeRoot, ownershipPath).replaceAll("\\", "/"),
    written,
    unchanged,
    removed,
  };
}

/**
 * Pure computation of uninstall plan. Only unmodified files recorded in the
 * ownership manifest are eligible for deletion.
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
  const modeSel = selectMode(host, mode, { scope, hostsDir });
  const resolvedMode = modeSel.supported ? modeSel.mode : mode;

  const ownership = readOwnership({ scopeRoot, host, scope, mode: resolvedMode });
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
  const actions = [];
  const preserved = [];

  for (const [relPath, meta] of Object.entries(ownership.data.files ?? {})) {
    const check = ensureContainedPath(canonicalScopeRoot, relPath);
    if (!check.ok) {
      preserved.push({
        relative_path: relPath,
        reason: `Unsafe path skipped: ${check.error}`,
      });
      continue;
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
    if (currentSha === meta.sha256) {
      actions.push({ kind: "delete", relative_path: check.relativePosix });
    } else {
      preserved.push({
        relative_path: check.relativePosix,
        reason: "Checksum mismatch (modified by user); preserved",
      });
    }
  }

  return {
    supported: true,
    hasOwnership: true,
    host,
    scope,
    mode: resolvedMode,
    scopeRoot: canonicalScopeRoot,
    ownershipPath: ownership.path,
    target_root: ownership.data.target_root,
    actions,
    preserved,
    requires_confirmation: scope === "user",
    confirmed: scope !== "user" || confirmUser === true,
  };
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

export function applyUninstallPlan(plan, { confirmUser = false } = {}) {
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

  const deleted = [];
  for (const action of plan.actions) {
    if (action.kind !== "delete") continue;
    const check = ensureContainedPath(plan.scopeRoot, action.relative_path);
    if (!check.ok) throw new Error(check.error);
    if (fs.existsSync(check.resolvedPath)) {
      fs.unlinkSync(check.resolvedPath);
      deleted.push(action.relative_path);
      pruneEmptyDirsUpward(path.dirname(check.resolvedPath), plan.scopeRoot);
    }
  }

  if (plan.preserved.length === 0 && fs.existsSync(plan.ownershipPath)) {
    fs.unlinkSync(plan.ownershipPath);
    pruneEmptyDirsUpward(path.dirname(plan.ownershipPath), plan.scopeRoot);
  } else if (fs.existsSync(plan.ownershipPath)) {
    // Keep remaining ownership record only for preserved files
    const current = JSON.parse(fs.readFileSync(plan.ownershipPath, "utf8"));
    const nextFiles = {};
    for (const p of plan.preserved) {
      if (current.files?.[p.relative_path]) {
        nextFiles[p.relative_path] = current.files[p.relative_path];
      }
    }
    current.files = nextFiles;
    atomicWriteFile(plan.ownershipPath, `${JSON.stringify(current, null, 2)}\n`);
  }

  return {
    uninstalled: true,
    host: plan.host,
    scope: plan.scope,
    mode: plan.mode,
    deleted,
    preserved: plan.preserved,
  };
}

export function listInstalledPackages({ scopeRoot }) {
  const installsDir = path.join(scopeRoot, ".dev-workflow", "installs");
  if (!fs.existsSync(installsDir)) {
    return [];
  }
  const files = fs
    .readdirSync(installsDir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "en"));

  return files.map((file) => {
    const abs = path.join(installsDir, file);
    const data = JSON.parse(fs.readFileSync(abs, "utf8"));
    return {
      record_file: file,
      host: data.host,
      scope: data.scope,
      mode: data.mode,
      source_version: data.source_version,
      source_ref: data.source_ref,
      target_root: data.target_root,
      file_count: Object.keys(data.files ?? {}).length,
      installed_at: data.installed_at,
    };
  });
}
