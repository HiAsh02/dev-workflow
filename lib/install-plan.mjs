import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(__dirname, "..");

const PLUGIN_TOP_FILES = ["plugin.json", "VERSION", "LICENSE", "README.md", "CHANGELOG.md"];
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;
const OWNERSHIP_RECORD_NAME_REGEX = /^([a-z0-9-]+)-(project|user)-(plugin|skills)\.json$/;
const ALLOWED_PROVENANCE = new Set(["created", "shared", "adopted", "preexisting_unowned"]);
const TXN_JOURNAL_FILE = ".txn-journal.json";
const APPLY_LOCK_FILE = ".apply.lock";
const RECOVER_LOCK_FILE = ".recover.lock";
const BACKUP_DIR_NAME_RE = /^\.txn-backup-(install|uninstall)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BACKUP_FILE_NAME_RE = /^bak-[1-9][0-9]*$/;
const JOURNAL_STATUS = new Set(["in_progress", "rollback_incomplete", "committed"]);
const JOURNAL_ENTRY_TYPES = new Set(["delete_created", "restore_file"]);

function toPosix(relPath) {
  return String(relPath ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
}

function readSourceVersion(sourceRoot) {
  const versionPath = path.join(sourceRoot, "VERSION");
  return fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, "utf8").trim()
    : "0.0.0";
}

function parseSemver(versionStr) {
  const value = String(versionStr ?? "").trim();
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match) return null;
  return { major: BigInt(match[1]), minor: BigInt(match[2]), patch: BigInt(match[3]), prerelease: match[4] ? match[4].split(".") : [] };
}

export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`Invalid SemVer version: '${a}' or '${b}'`);
  for (const k of ["major", "minor", "patch"]) {
    if (pa[k] !== pb[k]) return pa[k] > pb[k] ? 1 : -1;
  }
  if (!pa.prerelease.length && !pb.prerelease.length) return 0;
  if (!pa.prerelease.length) return 1;
  if (!pb.prerelease.length) return -1;
  for (let i = 0; i < Math.max(pa.prerelease.length, pb.prerelease.length); i += 1) {
    const x = pa.prerelease[i]; const y = pb.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^[0-9]+$/.test(x), yn = /^[0-9]+$/.test(y);
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

function computePackageDigest(sourceFiles) {
  const hash = crypto.createHash("sha256");
  for (const f of sourceFiles) {
    hash.update(`${f.rel}\0${f.sha256}\n`, "utf8");
  }
  return hash.digest("hex");
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
  if (data.package_digest !== undefined && data.package_digest !== null) {
    if (!SHA256_HEX_REGEX.test(String(data.package_digest))) {
      throw new Error("Invalid ownership manifest: malformed package_digest");
    }
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
    const recVersion = rec.data.source_version ?? null;
    for (const [relPath, meta] of Object.entries(rec.data.files ?? {})) {
      if (!isPlainObject(meta) || !SHA256_HEX_REGEX.test(String(meta.sha256 ?? ""))) {
        continue;
      }
      if (meta.provenance === "preexisting_unowned") continue;
      if (!map.has(relPath)) {
        map.set(relPath, {
          sha256: meta.sha256,
          hosts: [],
          maxVersion: recVersion,
          hasChecksumConflict: false,
        });
      }
      const entry = map.get(relPath);
      if (entry.sha256 !== meta.sha256) {
        entry.hasChecksumConflict = true;
      }
      if (!entry.hosts.includes(rec.host)) {
        entry.hosts.push(rec.host);
      }
      if (recVersion && (!entry.maxVersion || compareSemver(recVersion, entry.maxVersion) > 0)) {
        entry.maxVersion = recVersion;
      }
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
  upgradeShared = false,
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

  const sourceVersion = readSourceVersion(sourceRoot);
  const sourceFiles = collectSourceFiles(sourceRoot, resolvedMode);
  const packageDigest = computePackageDigest(sourceFiles);
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
  const affectedSharedHostsSet = new Set();

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
      if (siblingOwner && upgradeShared) {
        for (const h of siblingOwner.hosts) {
          affectedSharedHostsSet.add(h);
        }
      }
      continue;
    }

    if (siblingOwner?.hasChecksumConflict) {
      conflicts.push({
        relative_path: check.relativePosix,
        reason: `Sibling hosts [${siblingOwner.hosts.join(", ")}] disagree on checksum for shared path`,
      });
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
      const ownVer = isOwnedHere ? ownership?.data?.source_version : null;
      const maxExistingVersion = [ownVer, siblingOwner?.maxVersion]
        .filter(Boolean)
        .reduce((best, v) => (!best || compareSemver(v, best) > 0 ? v : best), null);

      if (
        siblingOwner &&
        maxExistingVersion &&
        compareSemver(sourceVersion, maxExistingVersion) < 0
      ) {
        conflicts.push({
          relative_path: check.relativePosix,
          reason: `Refusing silent downgrade on shared path from v${maxExistingVersion} to v${sourceVersion} (downgrade blocked, no-clobber)`,
        });
      } else if (siblingOwner && !upgradeShared) {
        conflicts.push({
          relative_path: check.relativePosix,
          reason: `Shared file is also owned by sibling host(s) [${siblingOwner.hosts.join(", ")}] at v${siblingOwner.maxVersion ?? "unknown"}; re-run with --upgrade-shared to coordinate upgrade (no-clobber)`,
        });
      } else {
        if (siblingOwner && upgradeShared) {
          for (const h of siblingOwner.hosts) {
            affectedSharedHostsSet.add(h);
          }
        }
        actions.push({
          kind: "update",
          relative_path: check.relativePosix,
          source_rel: src.rel,
          sha256: src.sha256,
          ...(siblingOwner ? { shared_with: siblingOwner.hosts } : {}),
          expected_before: { exists: true, sha256: destSha },
        });
      }
    }
  }

  for (const [oldRel, meta] of Object.entries(priorFiles)) {
    if (plannedRelPaths.has(oldRel)) continue;
    const check = ensureContainedPath(scopeRoot, oldRel);
    if (!check.ok || !fs.existsSync(check.resolvedPath)) continue;
    const stat = fs.lstatSync(check.resolvedPath);
    if (!stat.isFile()) continue;
    const destSha = sha256File(check.resolvedPath);
    const sibling = siblingOwners.get(check.relativePosix);
    if (sibling && upgradeShared) {
      if (destSha !== meta.sha256 || sibling.hasChecksumConflict || sibling.sha256 !== destSha) {
        conflicts.push({ relative_path: check.relativePosix, reason: "Shared stale file was modified or has conflicting owners" });
        continue;
      }
      for (const h of sibling.hosts) affectedSharedHostsSet.add(h);
      actions.push({
        kind: "delete_shared_stale",
        relative_path: check.relativePosix,
        sha256: destSha,
        expected_before: { exists: true, sha256: destSha },
      });
    } else if (sibling) {
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

  // A new host may coordinate an upgrade of a shared directory without owning the
  // previous version's files. Retire only unchanged files with verified sibling ownership.
  if (upgradeShared) {
    for (const [oldRel, sibling] of siblingOwners) {
      if (plannedRelPaths.has(oldRel) || Object.prototype.hasOwnProperty.call(priorFiles, oldRel) ||
          !isPathWithinPrefix(oldRel, toPosix(relTargetRoot))) continue;
      const check = ensureContainedPath(scopeRoot, oldRel);
      if (!check.ok || !fs.existsSync(check.resolvedPath) || !fs.lstatSync(check.resolvedPath).isFile()) {
        conflicts.push({ relative_path: oldRel, reason: "Shared stale target is unavailable or unsafe" });
        continue;
      }
      const actualSha = sha256File(check.resolvedPath);
      if (sibling.hasChecksumConflict || sibling.sha256 !== actualSha) {
        conflicts.push({ relative_path: oldRel, reason: "Shared stale file has diverged from ownership record" });
        continue;
      }
      for (const h of sibling.hosts) affectedSharedHostsSet.add(h);
      actions.push({ kind: "delete_shared_stale", relative_path: check.relativePosix,
        sha256: actualSha, expected_before: { exists: true, sha256: actualSha } });
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
    package_digest: packageDigest,
    source_file_set: sourceFiles.map((f) => f.rel),
    upgrade_shared: Boolean(upgradeShared),
    affected_shared_hosts: [...affectedSharedHostsSet].sort((a, b) => a.localeCompare(b, "en")),
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

function checkPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === "ESRCH") return false;
    if (err && err.code === "EPERM") return true;
    return null;
  }
}

function parseLockMetadata(rawText) {
  const trimmed = String(rawText ?? "").trim();
  if (!trimmed) return { parseable: false };
  if (/^\d+$/.test(trimmed)) {
    return {
      parseable: true,
      pid: Number.parseInt(trimmed, 10),
      hostname: null,
      started_at: null,
    };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (isPlainObject(parsed)) {
      return {
        parseable: true,
        pid: Number.isInteger(parsed.pid) ? parsed.pid : null,
        hostname: typeof parsed.hostname === "string" ? parsed.hostname : null,
        started_at: typeof parsed.started_at === "string" ? parsed.started_at : null,
        operation: typeof parsed.operation === "string" ? parsed.operation : null,
      };
    }
  } catch {
    // fall through to unparseable
  }
  return { parseable: false };
}

function isSafeTxnBackupDir(scopeRoot, rel, operation) {
  if (typeof rel !== "string") throw new Error("Journal backupDir must be a string");
  const prefix = ".dev-workflow/installs/";
  if (!rel.startsWith(prefix) || rel.slice(prefix.length).includes("/") ||
      !BACKUP_DIR_NAME_RE.test(rel.slice(prefix.length)) ||
      !rel.slice(prefix.length).startsWith(`.txn-backup-${operation}-`)) {
    throw new Error(`Unsafe transaction backup directory '${rel}'`);
  }
  const ck = ensureContainedPath(scopeRoot, rel);
  if (!ck.ok) throw new Error(`Unsafe backup path: ${ck.error}`);
  return ck.resolvedPath;
}

function validateRecoveryJournal(scopeRoot, journal, { hostsDir = path.join(DEFAULT_PACKAGE_ROOT, "hosts") } = {}) {
  if (!isPlainObject(journal) || journal.schema_version !== 2 ||
      !["install", "uninstall"].includes(journal.operation) ||
      !["project", "user"].includes(journal.scope) ||
      !["plugin", "skills"].includes(journal.mode) ||
      !JOURNAL_STATUS.has(journal.status) ||
      !Array.isArray(journal.undoEntries) ||
      typeof journal.transaction_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(journal.transaction_id)) {
    throw new Error("Untrusted or legacy transaction journal: manual inspection required");
  }
  const targetRoot = getExpectedTargetRoot(journal.host, journal.scope, journal.mode, hostsDir);
  if (!targetRoot || journal.target_root !== targetRoot) {
    throw new Error("Journal host/target root mismatch");
  }
  const backup = isSafeTxnBackupDir(scopeRoot, journal.backupDir, journal.operation);
  if (journal.backupDir !== `.dev-workflow/installs/.txn-backup-${journal.operation}-${journal.transaction_id}`) {
    throw new Error("Transaction ID and backup directory identity mismatch");
  }
  const canonicalSources = new Set(collectSourceFiles(DEFAULT_PACKAGE_ROOT, journal.mode)
    .map(f => `${targetRoot}/${f.rel}`));
  const seen = new Set();
  for (const entry of journal.undoEntries) {
    if (!isPlainObject(entry) || !JOURNAL_ENTRY_TYPES.has(entry.type) ||
        !["pending", "applied", "rolled_back"].includes(entry.state) ||
        ![null, undefined].includes(entry.after_sha) && !SHA256_HEX_REGEX.test(String(entry.after_sha)) ||
        ![null, undefined].includes(entry.before_sha) && !SHA256_HEX_REGEX.test(String(entry.before_sha))) {
      throw new Error("Untrusted journal undo entry type, state, or SHA");
    }
    const ck = ensureContainedPath(scopeRoot, entry.relative_path);
    if (!ck.ok) throw new Error(`Unsafe journal undo path: ${ck.error}`);
    const isLedger = ck.relativePosix.startsWith(".dev-workflow/installs/") &&
      OWNERSHIP_RECORD_NAME_REGEX.test(ck.relativePosix.split("/").at(-1));
    const sourcePath = canonicalSources.has(ck.relativePosix);
    if (!sourcePath && !isLedger) {
      throw new Error(`Journal entry targets a non-package file: '${entry.relative_path}'`);
    }
    if (isLedger) {
      const match = ck.relativePosix.split("/").at(-1).match(OWNERSHIP_RECORD_NAME_REGEX);
      if (match[2] !== journal.scope || match[3] !== journal.mode ||
          (match[1] !== journal.host && !["codex", "grok-build", "antigravity", "pi"].includes(match[1]))) {
        throw new Error("Journal ledger identity does not match transaction");
      }
    }
    if (seen.has(ck.relativePosix)) {
      // Same file can legitimately be recorded once only per transaction.
      throw new Error(`Duplicate journal undo path: ${ck.relativePosix}`);
    }
    seen.add(ck.relativePosix);
    if (entry.type === "delete_created") {
      if (entry.before_sha != null || !SHA256_HEX_REGEX.test(String(entry.after_sha))) {
        throw new Error("Created-file journal entry lacks valid expected SHA");
      }
    } else {
      if (!SHA256_HEX_REGEX.test(String(entry.before_sha))) {
        throw new Error("Restore entry lacks expected original file SHA");
      }
      if (typeof entry.backup_rel !== "string" ||
          !entry.backup_rel.startsWith(`${journal.backupDir}/`) ||
          !BACKUP_FILE_NAME_RE.test(entry.backup_rel.slice(journal.backupDir.length + 1))) {
        throw new Error("Journal backup_rel escapes transaction backup directory");
      }
      const bakCheck = ensureContainedPath(scopeRoot, entry.backup_rel);
      if (!bakCheck.ok || !bakCheck.resolvedPath.startsWith(backup + path.sep)) {
        throw new Error(`Unsafe journal backup file: '${entry.backup_rel}'`);
      }
    }
  }
  return { backup, targetRoot };
}

function rollbackJournalEntries(scopeRoot, journal, onPhase = null, persist = null) {
  const rollbackErrors = [];
  if (onPhase) {
    try { onPhase("before_rollback_restore"); }
    catch (err) { return [err.message]; }
  }
  for (let i = journal.undoEntries.length - 1; i >= 0; i -= 1) {
    const entry = journal.undoEntries[i];
    if (entry.state === "rolled_back") continue;
    try {
      const check = ensureContainedPath(scopeRoot, entry.relative_path);
      if (!check.ok) throw new Error(check.error);
      const target = check.resolvedPath;
      const exists = fs.existsSync(target);
      if (exists && !fs.lstatSync(target).isFile()) throw new Error("Recovery target no longer a regular file");
      const currentSha = exists ? sha256File(target) : null;
      if (entry.state === "pending") {
        // A crash between applying a mutation and recording its completion is ambiguous.
        // Preserve the current file and WAL rather than claiming ownership or deleting it.
        if ((entry.type === "delete_created" && !exists) ||
            (entry.type === "restore_file" && currentSha === entry.before_sha)) {
          entry.state = "rolled_back";
          if (persist) persist();
          continue;
        }
        throw new Error("Ambiguous pending WAL mutation; manual recovery required");
      }
      if (entry.type === "delete_created") {
        if (exists) {
          if (currentSha !== entry.after_sha) throw new Error("Created file changed after crash; preserving user data");
          fs.unlinkSync(target);
          pruneEmptyDirsUpward(path.dirname(target), scopeRoot);
        }
      } else {
        const backupCheck = ensureContainedPath(scopeRoot, entry.backup_rel);
        if (!backupCheck.ok || !fs.existsSync(backupCheck.resolvedPath) ||
            !fs.lstatSync(backupCheck.resolvedPath).isFile()) {
          throw new Error("Required transaction backup is absent or unsafe");
        }
        const backupData = fs.readFileSync(backupCheck.resolvedPath);
        if (sha256Buffer(backupData) !== entry.before_sha) throw new Error("Transaction backup checksum mismatch");
        if (currentSha !== entry.before_sha) {
          if (currentSha !== (entry.after_sha ?? null)) {
            throw new Error("Recovery target changed since crash; preserving user data");
          }
          atomicWriteFile(target, backupData);
        }
      }
      entry.state = "rolled_back";
      if (persist) persist();
    } catch (err) { rollbackErrors.push(`${entry.relative_path}: ${err.message}`); }
  }
  return rollbackErrors;
}

function beginFileTransaction({ scopeRoot, operation, host, scope, mode, targetRoot }) {
  const journalCheck = getSafeLedgerFileCheck(scopeRoot, TXN_JOURNAL_FILE);
  if (fs.existsSync(journalCheck.resolvedPath)) {
    throw new Error(`Refusing ${operation}: existing transaction journal requires manual recovery`);
  }
  const transactionId = crypto.randomUUID();
  const backupDirName = `.txn-backup-${operation}-${transactionId}`;
  const backupDirCheck = getSafeLedgerFileCheck(scopeRoot, backupDirName);
  fs.mkdirSync(backupDirCheck.resolvedPath, { recursive: true });
  const journal = {
    schema_version: 2,
    transaction_id: transactionId,
    operation, host, scope, mode,
    target_root: targetRoot,
    pid: process.pid, hostname: os.hostname(),
    started_at: new Date().toISOString(), status: "in_progress",
    backupDir: backupDirCheck.relativePosix, undoEntries: [],
  };
  let backupIdx = 0;
  function persistJournal() {
    atomicWriteFile(journalCheck.resolvedPath, `${JSON.stringify(journal, null, 2)}\n`);
  }
  persistJournal();
  function addEntry(entry) {
    journal.undoEntries.push({ ...entry, state: "pending" });
    persistJournal();
    return journal.undoEntries.length - 1;
  }
  return {
    recordCreated(relativePosix, afterSha) {
      return addEntry({ type: "delete_created", relative_path: relativePosix, before_sha: null, after_sha: afterSha });
    },
    backupAndRecordRestore(relativePosix, resolvedTargetPath, afterSha = null) {
      backupIdx += 1;
      const bakFileName = `bak-${backupIdx}`;
      const bakAbs = path.join(backupDirCheck.resolvedPath, bakFileName);
      const data = fs.readFileSync(resolvedTargetPath);
      fs.writeFileSync(bakAbs, data, { flag: "wx" });
      return addEntry({ type: "restore_file", relative_path: relativePosix,
        before_sha: sha256Buffer(data), after_sha: afterSha,
        backup_rel: `${backupDirCheck.relativePosix}/${bakFileName}` });
    },
    recordLedgerMutation(ledgerRelPosix, ledgerAbsPath, nextData = null) {
      const afterSha = nextData == null ? null : sha256Buffer(Buffer.isBuffer(nextData) ? nextData : Buffer.from(nextData));
      return fs.existsSync(ledgerAbsPath)
        ? this.backupAndRecordRestore(ledgerRelPosix, ledgerAbsPath, afterSha)
        : this.recordCreated(ledgerRelPosix, afterSha);
    },
    markApplied(index) { journal.undoEntries[index].state = "applied"; persistJournal(); },
    markCommitted() { journal.status = "committed"; journal.completed_at = new Date().toISOString(); persistJournal(); },
    cleanupAfterCommit(onPhase = null) {
      try {
        if (onPhase) onPhase("before_cleanup");
        fs.rmSync(backupDirCheck.resolvedPath, { recursive: true, force: true });
        if (fs.existsSync(journalCheck.resolvedPath)) fs.unlinkSync(journalCheck.resolvedPath);
        return null;
      } catch (err) { return err.message; }
    },
    rollbackOnError(originalErr, onPhase = null) {
      const errors = rollbackJournalEntries(scopeRoot, journal, onPhase, persistJournal);
      if (!errors.length) {
        fs.rmSync(backupDirCheck.resolvedPath, { recursive: true, force: true });
        if (fs.existsSync(journalCheck.resolvedPath)) fs.unlinkSync(journalCheck.resolvedPath);
      } else {
        journal.status = "rollback_incomplete";
        journal.error = originalErr.message;
        journal.rollbackErrors = errors;
        journal.failed_at = new Date().toISOString();
        persistJournal();
      }
      return errors;
    },
  };
}

function updateSiblingSharedLedgers({
  scopeRoot,
  currentRecordFile,
  updatedHashes,
  plannedShaByRelPath,
  hostsDir,
  plan,
  installedAt,
  txn,
}) {
  const affectedHosts = new Set(plan.affected_shared_hosts ?? []);
  if (updatedHashes.size === 0 && (!plan.upgrade_shared || affectedHosts.size === 0)) {
    return;
  }
  const records = readAllOwnershipRecords({ scopeRoot, hostsDir });
  for (const rec of records) {
    if (rec.recordFile === currentRecordFile) continue;
    let touched = false;
    const isCoordinatedSibling = Boolean(plan.upgrade_shared && affectedHosts.has(rec.host) &&
      rec.scope === plan.scope && rec.mode === plan.mode &&
      toPosix(rec.data.target_root) === toPosix(plan.target_root));
    const hashMapToApply = isCoordinatedSibling ? plannedShaByRelPath : updatedHashes;
    for (const [relPath, nextSha] of hashMapToApply.entries()) {
      if (rec.data.files?.[relPath] && rec.data.files[relPath].provenance !== "preexisting_unowned") {
        if (rec.data.files[relPath].sha256 !== nextSha) {
          rec.data.files[relPath] = { ...rec.data.files[relPath], sha256: nextSha };
          touched = true;
        }
      } else if (isCoordinatedSibling && isPathWithinPrefix(relPath, plan.target_root) &&
                 !rec.data.files?.[relPath]) {
        // Shared consumers need the complete new file set, not only updated hashes.
        rec.data.files[relPath] = { sha256: nextSha, provenance: "shared" };
        touched = true;
      }
    }
    if (isCoordinatedSibling && toPosix(rec.data.target_root) === toPosix(plan.target_root)) {
      for (const relPath of Object.keys(rec.data.files)) {
        if (isPathWithinPrefix(relPath, plan.target_root) && !plannedShaByRelPath.has(relPath) &&
            rec.data.files[relPath].provenance !== "preexisting_unowned") {
          delete rec.data.files[relPath];
          touched = true;
        }
      }
    }
    if (isCoordinatedSibling) {
      rec.data.source_version = plan.source_version;
      rec.data.source_ref = plan.source_ref;
      if (plan.package_digest) {
        rec.data.package_digest = plan.package_digest;
      }
      rec.data.installed_at = installedAt;
      touched = true;
    }
    if (touched) {
      const nextLedger = `${JSON.stringify(rec.data, null, 2)}\n`;
      const token = txn.recordLedgerMutation(`.dev-workflow/installs/${rec.recordFile}`, rec.path, nextLedger);
      atomicWriteFile(rec.path, nextLedger);
      txn.markApplied(token);
    }
  }
}

/**
 * Execute a previously computed install/update plan inside a scoped file lock
 * with full source/target TOCTOU pre-checks, WAL journal, sibling ledger
 * synchronization, and automatic rollback on failure.
 */
export function applyInstallPlan(
  plan,
  { confirmUser = false, onBeforeAction = null, onPhase = null } = {}
) {
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

  const lockCheck = getSafeLedgerFileCheck(plan.scopeRoot, APPLY_LOCK_FILE);
  return withFileLock(
    lockCheck.resolvedPath,
    () => {
      // Phase 1: Re-verify source VERSION & file SHA-256 digests + target preconditions before any write
      if (plan.source_version !== undefined) {
        const liveVersion = readSourceVersion(plan.sourceRoot);
        if (liveVersion !== plan.source_version) {
          throw new Error(
            `Source TOCTOU hash mismatch: VERSION changed since plan (expected '${plan.source_version}', got '${liveVersion}')`
          );
        }
      }

      if (Array.isArray(plan.source_file_set)) {
        const live = collectSourceFiles(plan.sourceRoot, plan.mode);
        const liveNames = live.map((f) => f.rel);
        if (JSON.stringify(liveNames) !== JSON.stringify(plan.source_file_set) ||
            computePackageDigest(live) !== plan.package_digest) {
          throw new Error("Source TOCTOU: package file set or digest changed since plan");
        }
      }
      const stagedSources = new Map();
      for (const action of plan.actions) {
        verifyActionPrecondition(plan.scopeRoot, action);
        if (action.source_rel) {
          const srcSubdir = plan.mode === "plugin" ? "" : "skills";
          const srcRelPath = srcSubdir ? `${srcSubdir}/${action.source_rel}` : action.source_rel;
          const srcCheck = ensureContainedPath(plan.sourceRoot, srcRelPath);
          if (!srcCheck.ok || !fs.existsSync(srcCheck.resolvedPath)) {
            throw new Error(
              `Source TOCTOU error: source file '${action.source_rel}' missing or outside package root`
            );
          }
          const srcBuf = fs.readFileSync(srcCheck.resolvedPath);
          const actualSrcSha = sha256Buffer(srcBuf);
          if (actualSrcSha !== action.sha256) {
            throw new Error(
              `Source TOCTOU hash mismatch for '${action.source_rel}': changed since plan (expected ${action.sha256}, got ${actualSrcSha})`
            );
          }
          if (action.kind === "create" || action.kind === "update") {
            stagedSources.set(action.relative_path, srcBuf);
          }
        }
      }

      const txn = beginFileTransaction({
        scopeRoot: plan.scopeRoot,
        operation: "install",
        host: plan.host,
        scope: plan.scope,
        mode: plan.mode,
        targetRoot: plan.target_root,
      });

      const ownershipFiles = {};
      const written = [];
      const removed = [];
      const unchanged = [];
      const preserved = [];
      const updatedSharedHashes = new Map();
      const installedAt = new Date().toISOString();
      let ownershipCheck;

      try {
        for (let idx = 0; idx < plan.actions.length; idx += 1) {
          const action = plan.actions[idx];
          if (onBeforeAction) onBeforeAction(action, idx);

          const check = verifyActionPrecondition(plan.scopeRoot, action);
          if (action.kind === "create") {
            const token = txn.recordCreated(check.relativePosix, action.sha256);
            atomicWriteExclusive(check.resolvedPath, stagedSources.get(action.relative_path));
            txn.markApplied(token);
            ownershipFiles[action.relative_path] = {
              sha256: action.sha256,
              provenance: "created",
            };
            written.push(action.relative_path);
          } else if (action.kind === "update") {
            const token = txn.backupAndRecordRestore(check.relativePosix, check.resolvedPath, action.sha256);
            atomicWriteFile(check.resolvedPath, stagedSources.get(action.relative_path));
            txn.markApplied(token);
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
            preserved.push(action.relative_path);
          } else if (action.kind === "delete_stale" || action.kind === "delete_shared_stale") {
            const token = txn.backupAndRecordRestore(check.relativePosix, check.resolvedPath, null);
            fs.unlinkSync(check.resolvedPath);
            txn.markApplied(token);
            pruneEmptyDirsUpward(path.dirname(check.resolvedPath), plan.scopeRoot);
            removed.push(action.relative_path);
          } else if (action.kind === "release_shared_stale") {
            preserved.push(action.relative_path);
          }
        }

        const recordFile = `${plan.host}-${plan.scope}-${plan.mode}.json`;
        ownershipCheck = getSafeOwnershipCheck(
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
          package_digest: plan.package_digest ?? null,
          target_root: plan.target_root,
          installed_at: installedAt,
          files: ownershipFiles,
        };

        if (onPhase) onPhase("before_ledger_commit");
        const manifestBytes = `${JSON.stringify(manifestData, null, 2)}\n`;
        const mainToken = txn.recordLedgerMutation(ownershipCheck.relativePosix, ownershipCheck.resolvedPath, manifestBytes);
        atomicWriteFile(ownershipCheck.resolvedPath, manifestBytes);
        txn.markApplied(mainToken);

        if (onPhase) onPhase("before_sibling_ledger_commit");
        const plannedShaByRelPath = new Map(
          plan.actions
            .filter((a) => a.sha256 && !["delete_stale", "delete_shared_stale", "release_shared_stale", "preexisting_identical_unowned"].includes(a.kind))
            .map((a) => [a.relative_path, a.sha256])
        );
        updateSiblingSharedLedgers({
          scopeRoot: plan.scopeRoot,
          currentRecordFile: recordFile,
          updatedHashes: updatedSharedHashes,
          plannedShaByRelPath,
          hostsDir: plan.hostsDir,
          plan,
          installedAt,
          txn,
        });

        txn.markCommitted();
      } catch (err) {
        txn.rollbackOnError(err, onPhase);
        throw err;
      }

      const cleanupWarning = txn.cleanupAfterCommit(onPhase);
      return {
        applied: true,
        host: plan.host,
        scope: plan.scope,
        mode: plan.mode,
        ownership_file: ownershipCheck.relativePosix,
        written,
        unchanged,
        preserved,
        removed,
        ...(cleanupWarning ? { cleanup_warning: cleanupWarning } : {}),
      };
    },
    `Concurrent installer lock active at ${lockCheck.resolvedPath}`,
    { operation: "install", host: plan.host, scope: plan.scope, mode: plan.mode }
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
  sourceRoot = DEFAULT_PACKAGE_ROOT,
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

  const manifestSourceRoot = sourceRoot ?? DEFAULT_PACKAGE_ROOT;
  let allowedManifestPaths = null;
  if (fs.existsSync(path.join(manifestSourceRoot, "skills"))) {
    const canonicalFiles = collectSourceFiles(manifestSourceRoot, resolvedMode);
    allowedManifestPaths = new Set(
      canonicalFiles.map((f) => `${expectedTargetRoot}/${f.rel}`.replaceAll("\\", "/"))
    );
  }

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

    if (!ALLOWED_PROVENANCE.has(meta.provenance)) {
      preserved.push({
        relative_path: check.relativePosix,
        reason: `Unrecognized provenance '${meta.provenance ?? "missing"}'; preserved`,
      });
      continue;
    }

    if (!allowedManifestPaths || !allowedManifestPaths.has(check.relativePosix)) {
      preserved.push({
        relative_path: check.relativePosix,
        reason: "Outside canonical dev-workflow package manifest; preserved",
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

export function applyUninstallPlan(
  plan,
  { confirmUser = false, onBeforeAction = null, onPhase = null } = {}
) {
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

  const lockCheck = getSafeLedgerFileCheck(plan.scopeRoot, APPLY_LOCK_FILE);
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

      const txn = beginFileTransaction({
        scopeRoot: plan.scopeRoot,
        operation: "uninstall",
        host: plan.host,
        scope: plan.scope,
        mode: plan.mode,
        targetRoot: plan.target_root,
      });

      const deleted = [];
      const retainedShared = [];

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
            const token = txn.backupAndRecordRestore(check.relativePosix, check.resolvedPath, null);
            fs.unlinkSync(check.resolvedPath);
            txn.markApplied(token);
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
        if (onPhase) onPhase("before_ledger_commit");
        if (plan.preserved.length === 0 && fs.existsSync(ownershipCheck.resolvedPath)) {
          const ledgerToken = txn.recordLedgerMutation(ownershipCheck.relativePosix, ownershipCheck.resolvedPath, null);
          fs.unlinkSync(ownershipCheck.resolvedPath);
          txn.markApplied(ledgerToken);
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
          const ledgerBytes = `${JSON.stringify(current, null, 2)}\n`;
          const ledgerToken = txn.recordLedgerMutation(ownershipCheck.relativePosix, ownershipCheck.resolvedPath, ledgerBytes);
          atomicWriteFile(ownershipCheck.resolvedPath, ledgerBytes);
          txn.markApplied(ledgerToken);
        }

        txn.markCommitted();
      } catch (err) {
        txn.rollbackOnError(err, onPhase);
        throw err;
      }

      const cleanupWarning = txn.cleanupAfterCommit(onPhase);
      return {
        uninstalled: true,
        host: plan.host,
        scope: plan.scope,
        mode: plan.mode,
        deleted,
        retained_shared: retainedShared,
        preserved: plan.preserved,
        ...(cleanupWarning ? { cleanup_warning: cleanupWarning } : {}),
      };
    },
    `Concurrent uninstaller lock active at ${lockCheck.resolvedPath}`,
    { operation: "uninstall", host: plan.host, scope: plan.scope, mode: plan.mode }
  );
}

/**
 * Inspect whether `.apply.lock` or `.txn-journal.json` indicates an interrupted
 * install/uninstall transaction requiring recovery.
 */
function inspectPendingRecoveryInternal({
  projectRoot = process.cwd(),
  homeDir = os.homedir(),
  scope = "project",
  scopeRoot: explicitScopeRoot = null,
} = {}) {
  const rawScopeRoot = explicitScopeRoot
    ? path.resolve(explicitScopeRoot)
    : scope === "user"
      ? path.resolve(homeDir)
      : path.resolve(projectRoot);
  const scopeRoot = fs.existsSync(rawScopeRoot) ? fs.realpathSync(rawScopeRoot) : rawScopeRoot;

  const dirCheck = checkLedgerDirectoryContainment(scopeRoot);
  if (!dirCheck.ok) {
    return {
      ok: false,
      scope,
      scopeRoot,
      hasPendingRecovery: false,
      error: `Unsafe ownership path: ${dirCheck.error}`,
    };
  }

  const lockCheck = getSafeLedgerFileCheck(scopeRoot, APPLY_LOCK_FILE);
  const journalCheck = getSafeLedgerFileCheck(scopeRoot, TXN_JOURNAL_FILE);

  let lockStatus = { exists: false };
  if (fs.existsSync(lockCheck.resolvedPath)) {
    const stat = fs.lstatSync(lockCheck.resolvedPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        scope,
        scopeRoot,
        hasPendingRecovery: true,
        error: `Unsafe lock entry is not a regular file: ${lockCheck.resolvedPath}`,
      };
    }
    const meta = parseLockMetadata(fs.readFileSync(lockCheck.resolvedPath, "utf8"));
    const sameHost = Boolean(meta.hostname ? meta.hostname === os.hostname() : true);
    const pidAlive = meta.pid ? checkPidAlive(meta.pid) : null;
    const stale = Boolean(sameHost && pidAlive === false);
    lockStatus = {
      exists: true,
      path: lockCheck.relativePosix,
      parseable: meta.parseable,
      pid: meta.pid ?? null,
      hostname: meta.hostname ?? null,
      started_at: meta.started_at ?? null,
      operation: meta.operation ?? null,
      sameHost,
      pidAlive,
      stale,
    };
  }

  let journalInfo = { exists: false };
  let journalData = null;
  if (fs.existsSync(journalCheck.resolvedPath)) {
    const stat = fs.lstatSync(journalCheck.resolvedPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        scope,
        scopeRoot,
        hasPendingRecovery: true,
        error: `Unsafe journal entry is not a regular file: ${journalCheck.resolvedPath}`,
      };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(journalCheck.resolvedPath, "utf8"));
      if (!isPlainObject(parsed)) {
        throw new Error("Expected JSON object");
      }
      validateRecoveryJournal(scopeRoot, parsed);
      journalData = parsed;
      journalInfo = {
        exists: true,
        corrupt: false,
        path: journalCheck.relativePosix,
        operation: parsed.operation ?? null,
        host: parsed.host ?? null,
        scope: parsed.scope ?? null,
        mode: parsed.mode ?? null,
        status: parsed.status ?? "unknown",
        backupDir: parsed.backupDir ?? null,
        undoEntriesCount: Array.isArray(parsed.undoEntries) ? parsed.undoEntries.length : 0,
      };
    } catch (err) {
      journalInfo = {
        exists: true,
        corrupt: true,
        path: journalCheck.relativePosix,
        error: `Corrupt transaction journal (preserved intact): ${err.message}`,
      };
    }
  }

  const hasPendingRecovery = Boolean(lockStatus.exists || journalInfo.exists);
  let action = "none";
  if (journalInfo.exists) {
    if (journalInfo.corrupt) action = "manual_inspection_required";
    else if (journalInfo.status === "committed") action = "finalize_cleanup";
    else action = "rollback_transaction";
  } else if (lockStatus.exists) {
    action = lockStatus.stale ? "clear_stale_lock" : "blocked_active_lock";
  }

  return {
    publicResult: {
      ok: !journalInfo.corrupt,
      scope,
      scopeRoot,
      hasPendingRecovery,
      action,
      requiresForceUnlock: Boolean(lockStatus.exists && !lockStatus.stale),
      lock: lockStatus,
      journal: journalInfo,
    },
    lockPath: lockCheck.resolvedPath,
    journalPath: journalCheck.resolvedPath,
    journalData,
  };
}

/**
 * Inspect whether `.apply.lock` or `.txn-journal.json` indicates an interrupted
 * install/uninstall transaction requiring recovery.
 */
export function inspectPendingRecovery(options = {}) {
  const internal = inspectPendingRecoveryInternal(options);
  return internal.publicResult ?? internal;
}

/**
 * Recover an interrupted install/uninstall transaction idempotently, verifying
 * lock PID state (unless `--force-unlock`) before replaying undo entries or finalizing cleanup.
 */
export function applyPendingRecovery({
  projectRoot = process.cwd(),
  homeDir = os.homedir(),
  scope = "project",
  scopeRoot: explicitScopeRoot = null,
  confirmUser = false,
  forceUnlock = false,
} = {}) {
  if (scope === "user" && !confirmUser) {
    throw new Error("User-scope recovery requires explicit confirmation (--confirm-user).");
  }

  const probe = inspectPendingRecovery({
    projectRoot,
    homeDir,
    scope,
    scopeRoot: explicitScopeRoot,
  });
  if (!probe.ok && probe.error) {
    throw new Error(probe.error);
  }
  if (!probe.hasPendingRecovery) {
    return {
      recovered: false,
      nothingToRecover: true,
      scope: probe.scope,
      scopeRoot: probe.scopeRoot,
      action: "none",
    };
  }

  const recoverLockCheck = getSafeLedgerFileCheck(probe.scopeRoot, RECOVER_LOCK_FILE);
  return withFileLock(
    recoverLockCheck.resolvedPath,
    () => {
      const freshInternal = inspectPendingRecoveryInternal({
        projectRoot,
        homeDir,
        scope,
        scopeRoot: probe.scopeRoot,
      });
      const fresh = freshInternal.publicResult ?? freshInternal;
      if (!fresh.ok && fresh.error) {
        throw new Error(fresh.error);
      }
      if (!fresh.hasPendingRecovery) {
        return {
          recovered: false,
          nothingToRecover: true,
          scope: fresh.scope,
          scopeRoot: fresh.scopeRoot,
          action: "none",
        };
      }

      if (fresh.lock.exists) {
        if (fresh.lock.sameHost && fresh.lock.pidAlive === true) {
          throw new Error(
            `Refusing recovery: active writer PID ${fresh.lock.pid} is still alive. Wait for completion or pass --force-unlock.`
          );
        }
        if ((!fresh.lock.sameHost || fresh.lock.pidAlive === null) && !forceUnlock) {
          throw new Error(
            `Refusing recovery: lock holder cannot be verified locally (host=${fresh.lock.hostname ?? "unknown"}, pid=${fresh.lock.pid ?? "unknown"}). Pass --force-unlock to override.`
          );
        }
      }

      if (fresh.journal.exists && fresh.journal.corrupt) {
        throw new Error(fresh.journal.error);
      }

      const journalData = freshInternal.journalData;
      let restoredEntries = 0;

      if (journalData) {
        if (journalData.status !== "committed") {
          const undoEntries = journalData.undoEntries;
          const persistRecovery = () => atomicWriteFile(
            freshInternal.journalPath, `${JSON.stringify(journalData, null, 2)}\n`
          );
          const rbErrors = rollbackJournalEntries(fresh.scopeRoot, journalData, null, persistRecovery);
          if (rbErrors.length > 0) {
            atomicWriteFile(
              freshInternal.journalPath,
              `${JSON.stringify(
                {
                  ...journalData,
                  status: "rollback_incomplete",
                  rollbackErrors: rbErrors,
                  recovery_failed_at: new Date().toISOString(),
                },
                null,
                2
              )}\n`
            );
            throw new Error(`Recovery encountered rollback errors: ${rbErrors.join("; ")}`);
          }
          restoredEntries = undoEntries.length;
        }

        if (journalData.backupDir) {
          const backupAbs = isSafeTxnBackupDir(fresh.scopeRoot, journalData.backupDir, journalData.operation);
          fs.rmSync(backupAbs, { recursive: true, force: true });
        }
        if (fs.existsSync(freshInternal.journalPath)) {
          fs.unlinkSync(freshInternal.journalPath);
        }
      }

      if (fresh.lock.exists && fs.existsSync(freshInternal.lockPath)) {
        fs.unlinkSync(freshInternal.lockPath);
      }

      return {
        recovered: true,
        nothingToRecover: false,
        scope: fresh.scope,
        scopeRoot: fresh.scopeRoot,
        action: fresh.action,
        restored_entries: restoredEntries,
        removed_lock: Boolean(fresh.lock.exists),
      };
    },
    `Concurrent recovery lock active at ${recoverLockCheck.resolvedPath}`,
    { operation: "recover", scope }
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
