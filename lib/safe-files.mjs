import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let tmpCounter = 0;

/**
 * Normalize a relative path to POSIX forward slashes and reject traversal or
 * absolute-path indicators across POSIX and Windows conventions.
 */
export function normalizeRelativePath(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) {
    return { ok: false, error: "Relative path must be a non-empty string" };
  }
  if (relPath.includes("\0")) {
    return { ok: false, error: "Relative path contains null byte" };
  }
  if (
    path.isAbsolute(relPath) ||
    relPath.startsWith("/") ||
    relPath.startsWith("\\") ||
    /^[a-zA-Z]:/.test(relPath)
  ) {
    return { ok: false, error: `Absolute path not allowed: ${relPath}` };
  }
  const slashNorm = relPath.replaceAll("\\", "/");
  const segments = slashNorm.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return { ok: false, error: `Empty relative path: ${relPath}` };
  }
  for (const seg of segments) {
    if (seg === "." || seg === "..") {
      return {
        ok: false,
        error: `Path segment '${seg}' not allowed in: ${relPath}`,
      };
    }
  }
  return { ok: true, relativePosix: segments.join("/"), segments };
}

function isWithinRoot(candidatePath, canonicalRoot) {
  if (candidatePath === canonicalRoot) return true;
  const rel = path.relative(canonicalRoot, candidatePath);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Verify that `relPath` stays strictly inside `rootDir` when resolved on disk,
 * rejecting `..`, absolute paths, and symlink/junction escapes along any existing prefix.
 */
export function ensureContainedPath(rootDir, relPath, { allowRoot = false } = {}) {
  if (allowRoot && (relPath === "." || relPath === "")) {
    const canonicalRoot = fs.realpathSync(rootDir);
    return { ok: true, resolvedPath: canonicalRoot, canonicalRoot, relativePosix: "." };
  }

  const norm = normalizeRelativePath(relPath);
  if (!norm.ok) return norm;

  if (!fs.existsSync(rootDir)) {
    return { ok: false, error: `Root directory does not exist: ${rootDir}` };
  }
  const canonicalRoot = fs.realpathSync(rootDir);

  let current = canonicalRoot;
  for (const seg of norm.segments) {
    current = path.join(current, seg);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        let linkTargetReal;
        try {
          linkTargetReal = fs.realpathSync(current);
        } catch {
          return {
            ok: false,
            error: `Broken or unresolvable symlink at '${current}'`,
          };
        }
        if (!isWithinRoot(linkTargetReal, canonicalRoot)) {
          return {
            ok: false,
            error: `Symlink '${current}' escapes root '${canonicalRoot}' -> '${linkTargetReal}'`,
          };
        }
        current = linkTargetReal;
      } else {
        const real = fs.realpathSync(current);
        if (!isWithinRoot(real, canonicalRoot)) {
          return {
            ok: false,
            error: `Path '${current}' resolves outside root '${canonicalRoot}'`,
          };
        }
      }
    }
  }

  return {
    ok: true,
    resolvedPath: path.join(canonicalRoot, ...norm.segments),
    canonicalRoot,
    relativePosix: norm.relativePosix,
  };
}

/**
 * Detect case-folding collisions across relative paths so builds/installs
 * never break on Windows or case-insensitive macOS filesystems.
 */
export function findCaseCollisions(relativePaths) {
  const seen = new Map();
  const collisions = [];
  for (const rel of relativePaths) {
    const folded = rel.replaceAll("\\", "/").toLowerCase();
    const existing = seen.get(folded);
    if (existing && existing !== rel) {
      collisions.push({ existing, duplicate: rel });
    } else {
      seen.set(folded, rel);
    }
  }
  return collisions;
}

/**
 * Recursively list regular files under `rootDir` while enforcing containment
 * and rejecting symlink escapes.
 */
export function walkContainedFiles(rootDir) {
  const canonicalRoot = fs.realpathSync(rootDir);
  const files = [];

  function visit(currentDir, prefixSegments) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const nextSegments = [...prefixSegments, entry.name];
      const relPosix = nextSegments.join("/");
      const check = ensureContainedPath(canonicalRoot, relPosix);
      if (!check.ok) {
        throw new Error(check.error);
      }
      const stat = fs.lstatSync(path.join(currentDir, entry.name));
      if (stat.isSymbolicLink()) {
        const targetStat = fs.statSync(check.resolvedPath);
        if (targetStat.isDirectory()) {
          visit(check.resolvedPath, nextSegments);
        } else if (targetStat.isFile()) {
          files.push(relPosix);
        }
      } else if (entry.isDirectory()) {
        visit(path.join(currentDir, entry.name), nextSegments);
      } else if (entry.isFile()) {
        files.push(relPosix);
      }
    }
  }

  visit(canonicalRoot, []);
  return files;
}

/**
 * Atomically write UTF-8 text or Buffer to `targetPath` using a temp file in the
 * same directory, fsync, and atomic rename.
 */
export function atomicWriteFile(targetPath, data) {
  const parent = path.dirname(targetPath);
  fs.mkdirSync(parent, { recursive: true });
  tmpCounter += 1;
  const tmpPath = path.join(
    parent,
    `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${tmpCounter}`
  );
  const fd = fs.openSync(tmpPath, "w", 0o644);
  try {
    if (typeof data === "string") {
      fs.writeFileSync(fd, data, "utf8");
    } else {
      fs.writeFileSync(fd, data);
    }
    try {
      fs.fsyncSync(fd);
    } catch {
      // Some virtual filesystems do not support fsync on regular files
    }
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

export function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}
