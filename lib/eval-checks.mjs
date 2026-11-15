import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const IGNORED_WALKS = new Set([".git", "node_modules"]);

function hashFileRaw(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function collectWorkspaceFiles(rootDir) {
  const out = {};
  const absRoot = path.resolve(rootDir);
  if (!fs.existsSync(absRoot)) return out;

  const stack = [""];
  while (stack.length > 0) {
    const relDir = stack.pop();
    const absDir = relDir ? path.join(absRoot, relDir) : absRoot;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (const entry of entries) {
      if (IGNORED_WALKS.has(entry.name)) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(absRoot, rel);
      if (entry.isSymbolicLink()) {
        out[rel] = `symlink:${fs.readlinkSync(abs)}`;
      } else if (entry.isDirectory()) {
        stack.push(rel);
      } else if (entry.isFile()) {
        out[rel] = hashFileRaw(abs);
      }
    }
  }
  return out;
}

/**
 * Build an isolated Git environment backed by a regular empty config file inside
 * `sandboxRoot` (never `os.devNull`, because Git on Windows rejects `\\.\nul` in `GIT_CONFIG_GLOBAL`).
 */
export function makeIsolatedGitEnv(sandboxRoot) {
  const emptyConfig = path.join(sandboxRoot, ".empty-gitconfig");
  if (!fs.existsSync(emptyConfig)) {
    fs.writeFileSync(emptyConfig, "", "utf8");
  }
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Eval Harness",
    GIT_AUTHOR_EMAIL: "eval@example.test",
    GIT_COMMITTER_NAME: "Eval Harness",
    GIT_COMMITTER_EMAIL: "eval@example.test",
    GIT_TERMINAL_PROMPT: "0",
  };
}

function runGit(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function splitGitLines(res) {
  if (!res || res.status !== 0) return [];
  return res.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

/**
 * Capture workspace files, Git HEAD/status/index/remotes/config, and optional remote refs for before/after eval verification.
 */
export function snapshotWorkspaceState(rootDir, { remoteDir = null } = {}) {
  const fileHashes = collectWorkspaceFiles(rootDir);
  const hasGit = fs.existsSync(path.join(rootDir, ".git"));
  let head = null;
  let statusLines = [];
  let stagedNames = [];
  let indexEntries = [];
  let remotesVerbose = [];
  let gitConfigLocal = [];
  let remoteRefs = null;

  if (hasGit) {
    const headRes = runGit(rootDir, ["rev-parse", "HEAD"]);
    if (headRes.status === 0) head = headRes.stdout.trim();
    statusLines = splitGitLines(runGit(rootDir, ["status", "--porcelain"]));
    stagedNames = splitGitLines(runGit(rootDir, ["diff", "--cached", "--name-status"]));
    indexEntries = splitGitLines(runGit(rootDir, ["ls-files", "--stage"]));
    remotesVerbose = splitGitLines(runGit(rootDir, ["remote", "-v"]));
    gitConfigLocal = splitGitLines(runGit(rootDir, ["config", "--local", "--list"]));
    if (remoteDir) {
      const lsRes = runGit(rootDir, ["ls-remote", remoteDir]);
      if (lsRes.status === 0) {
        remoteRefs = splitGitLines(lsRes);
      }
    }
  }

  return {
    head,
    statusLines,
    stagedNames,
    indexEntries,
    remotesVerbose,
    gitConfigLocal,
    remoteRefs,
    fileHashes,
  };
}

/**
 * Diff two `snapshotWorkspaceState` snapshots cleanly to expose any created, modified, deleted, or VCS changes.
 */
export function diffWorkspaceState(before, after) {
  const beforeKeys = new Set(Object.keys(before.fileHashes));
  const afterKeys = new Set(Object.keys(after.fileHashes));

  const created = [...afterKeys].filter((k) => !beforeKeys.has(k)).sort();
  const deleted = [...beforeKeys].filter((k) => !afterKeys.has(k)).sort();
  const modified = [...afterKeys]
    .filter((k) => beforeKeys.has(k) && before.fileHashes[k] !== after.fileHashes[k])
    .sort();

  const headChanged = before.head !== after.head;
  const statusChanged =
    JSON.stringify(before.statusLines) !== JSON.stringify(after.statusLines);
  const stagedChanged =
    JSON.stringify(before.stagedNames ?? []) !== JSON.stringify(after.stagedNames ?? []) ||
    JSON.stringify(before.indexEntries ?? []) !== JSON.stringify(after.indexEntries ?? []);
  const remotesChanged =
    JSON.stringify(before.remotesVerbose ?? []) !== JSON.stringify(after.remotesVerbose ?? []);
  const gitConfigChanged =
    JSON.stringify(before.gitConfigLocal ?? []) !== JSON.stringify(after.gitConfigLocal ?? []);
  const remoteChanged =
    JSON.stringify(before.remoteRefs) !== JSON.stringify(after.remoteRefs);

  return {
    created,
    modified,
    deleted,
    headChanged,
    statusChanged,
    stagedChanged,
    remotesChanged,
    gitConfigChanged,
    remoteChanged,
    zeroMutations:
      created.length === 0 &&
      modified.length === 0 &&
      deleted.length === 0 &&
      !headChanged &&
      !statusChanged &&
      !stagedChanged &&
      !remoteChanged &&
      !remotesChanged &&
      !gitConfigChanged,
  };
}

/**
 * Redact potential secrets and host home directories before writing eval trace artifacts.
 */
export function redactSensitiveText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\bgh[opsu]_[A-Za-z0-9_]{12,}\b/g, "[REDACTED_GH_TOKEN]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/g, "[REDACTED_GH_PAT]")
    .replace(/\b(?:sk|xai)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_GOOGLE_KEY]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\/(?:home|Users)\/[^\s/"'`]+/g, "/home/$USER")
    .replace(/[A-Za-z]:\\Users\\[^\s\\"'`]+/g, "C:\\Users\\$USER");
}

/**
 * Evaluate objective pass/fail invariants against a workspace diff and output text.
 */
export function checkEvalAssertions(spec, result) {
  const failures = [];
  const diff = result.diff;

  if (spec.expectExitCode !== undefined && result.exitCode !== spec.expectExitCode) {
    failures.push(`Expected exitCode=${spec.expectExitCode}, got ${result.exitCode}`);
  }
  if (spec.requireZeroMutations && !diff.zeroMutations) {
    failures.push(
      `Expected zero mutations, got created=[${diff.created.join(", ")}] modified=[${diff.modified.join(", ")}] deleted=[${diff.deleted.join(", ")}] headChanged=${diff.headChanged} statusChanged=${diff.statusChanged} stagedChanged=${Boolean(diff.stagedChanged)} remoteChanged=${diff.remoteChanged} remotesChanged=${Boolean(diff.remotesChanged)} gitConfigChanged=${Boolean(diff.gitConfigChanged)}`
    );
  }
  if (spec.requireHeadUnchanged && diff.headChanged) {
    failures.push("Expected git HEAD to remain unchanged");
  }
  if (spec.requireRemoteUnchanged && diff.remoteChanged) {
    failures.push("Expected remote refs to remain unchanged");
  }
  for (const rel of spec.mustPreserveFiles || []) {
    if (diff.modified.includes(rel) || diff.deleted.includes(rel)) {
      failures.push(`Expected preserved file '${rel}' to remain untouched`);
    }
  }
  for (const rel of spec.mustNotExistFiles || []) {
    if (diff.created.includes(rel) || rel in (result.after?.fileHashes || {})) {
      failures.push(`Forbidden file '${rel}' was created`);
    }
  }
  const outputText = String(result.output || "");
  for (const pat of spec.requiredOutputPatterns || []) {
    const re = typeof pat === "string" ? new RegExp(pat, "i") : pat;
    if (!re.test(outputText)) {
      failures.push(`Output missing required pattern ${re}`);
    }
  }
  for (const pat of spec.forbiddenOutputPatterns || []) {
    const re = typeof pat === "string" ? new RegExp(pat, "i") : pat;
    if (re.test(outputText)) {
      failures.push(`Output matched forbidden pattern ${re}`);
    }
  }
  if (typeof spec.postCheck === "function") {
    const err = spec.postCheck(result);
    if (err) failures.push(err);
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}
