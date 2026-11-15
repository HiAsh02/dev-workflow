import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

export const SUPPORTED_HOSTS = ["codex", "antigravity", "grok-build", "pi"];

/**
 * Load host specification JSON from `hosts/<host>.json`.
 */
export function loadHostSpec(host, hostsDir) {
  if (!SUPPORTED_HOSTS.includes(host)) {
    return null;
  }
  const specPath = path.join(hostsDir, `${host}.json`);
  if (!fs.existsSync(specPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(specPath, "utf8"));
}

function findExecutableOnPath(binary, env = process.env) {
  const pathEnv = env.PATH || env.Path || "";
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, `${binary}${ext}`);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          if (process.platform !== "win32") {
            fs.accessSync(candidate, fs.constants.X_OK);
          }
          return candidate;
        }
      } catch {
        // continue searching PATH
      }
    }
  }
  return null;
}

function defaultExec(binaryPath, args) {
  const isWinBatch = process.platform === "win32" && /\.(cmd|bat)$/i.test(binaryPath);
  const res = isWinBatch
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/c", binaryPath, ...args], {
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
      })
    : spawnSync(binaryPath, args, {
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
      });
  return {
    status: res.status ?? 1,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    error: res.error ? res.error.message : null,
  };
}

function probeAntigravityVersion(binaryPath) {
  try {
    const content = fs.readFileSync(binaryPath, "utf8");
    const match = content.match(/DIR=([^\s\n]+)/);
    if (match) {
      const versionFile = path.join(match[1], "version");
      if (fs.existsSync(versionFile)) {
        const ver = fs.readFileSync(versionFile, "utf8").trim();
        if (ver) {
          return { version: ver, evidence: `Read launcher version file ${versionFile}` };
        }
      }
    }
  } catch {
    // binary may not be a shell wrapper on other platforms
  }
  return {
    version: "unknown",
    evidence: `Found executable at ${binaryPath} (GUI launcher not executed)`,
  };
}

/**
 * Probe host availability and version without mutating any system or user files.
 */
export function detectHost(host, env = process.env, { hostsDir, execFn = defaultExec } = {}) {
  if (host === "grok-bot") {
    return {
      host,
      found: false,
      status: "unsupported",
      version: "unknown",
      evidence: "Grok Bot is distinct from xAI Grok Build CLI and is out of MVP scope.",
    };
  }

  const spec = loadHostSpec(host, hostsDir);
  if (!spec) {
    return {
      host,
      found: false,
      status: "unsupported",
      version: "unknown",
      evidence: `Unknown host '${host}'. Supported hosts: ${SUPPORTED_HOSTS.join(", ")}`,
    };
  }

  const binaryPath = findExecutableOnPath(spec.binary, env);
  if (!binaryPath) {
    return {
      host,
      found: false,
      status: "not_detected",
      binary: spec.binary,
      version: "unknown",
      evidence: `Executable '${spec.binary}' not found on PATH`,
    };
  }

  if (host === "antigravity") {
    const agyInfo = probeAntigravityVersion(binaryPath);
    return {
      host,
      found: true,
      status: "detected",
      binary: spec.binary,
      binaryPath,
      version: agyInfo.version,
      evidence: agyInfo.evidence,
    };
  }

  const out = execFn(binaryPath, spec.versionArgs ?? ["--version"]);
  const combined = `${out.stdout}\n${out.stderr}`.trim();
  if (out.error || out.status !== 0) {
    return {
      host,
      found: false,
      status: "not_detected",
      binary: spec.binary,
      binaryPath,
      version: "unknown",
      evidence: out.error || `Command exited ${out.status}: ${combined}`,
    };
  }

  if (spec.versionPattern) {
    const regex = new RegExp(spec.versionPattern, "m");
    const match = combined.match(regex);
    if (!match) {
      return {
        host,
        found: false,
        status: "identity_mismatch",
        binary: spec.binary,
        binaryPath,
        version: "unknown",
        evidence: `Output from '${binaryPath} --version' did not match expected ${host} signature: ${combined}`,
      };
    }
    return {
      host,
      found: true,
      status: "detected",
      binary: spec.binary,
      binaryPath,
      version: match[1],
      evidence: combined.split("\n")[0],
    };
  }

  return {
    host,
    found: true,
    status: "detected",
    binary: spec.binary,
    binaryPath,
    version: combined || "unknown",
    evidence: combined || binaryPath,
  };
}

/**
 * Resolve verified target paths for `project` or `user` scope without guessing
 * unverified locations.
 */
export function discoverTargets(
  host,
  scope = "project",
  { hostsDir, projectRoot = process.cwd(), homeDir = os.homedir() } = {}
) {
  if (scope !== "project" && scope !== "user") {
    return {
      host,
      scope,
      supported: false,
      pluginTargets: [],
      skillTargets: [],
      confidence: "none",
      source: null,
      reason: `Invalid scope '${scope}'. Expected 'project' or 'user'.`,
    };
  }

  const spec = loadHostSpec(host, hostsDir);
  if (!spec) {
    return {
      host,
      scope,
      supported: false,
      pluginTargets: [],
      skillTargets: [],
      confidence: "none",
      source: null,
      reason:
        host === "grok-bot"
          ? "Grok Bot is distinct from Grok Build CLI and is not supported by this installer."
          : `Unsupported host '${host}'.`,
    };
  }

  const targetCfg = spec.targets?.[scope];
  if (!targetCfg) {
    return {
      host,
      scope,
      supported: false,
      pluginTargets: [],
      skillTargets: [],
      confidence: "none",
      source: null,
      reason: `Host '${host}' has no target mapping for scope '${scope}'.`,
    };
  }

  const baseRoot = scope === "project" ? path.resolve(projectRoot) : path.resolve(homeDir);
  const pluginTargets = targetCfg.pluginDir
    ? [path.join(baseRoot, targetCfg.pluginDir)]
    : [];
  const skillTargets = targetCfg.skillsDir
    ? [path.join(baseRoot, targetCfg.skillsDir)]
    : [];

  return {
    host,
    scope,
    supported: true,
    baseRoot,
    pluginTargets,
    skillTargets,
    relativePluginDir: targetCfg.pluginDir,
    relativeSkillsDir: targetCfg.skillsDir,
    confidence: targetCfg.confidence,
    source: targetCfg.source,
  };
}

/**
 * Choose installation mode (`plugin` | `skills` | `unsupported`) strictly from
 * verified host support rather than assuming every host installs Agent Plugins natively.
 */
export function selectMode(host, requestedMode = "auto", { scope = "project", hostsDir } = {}) {
  if (!["auto", "plugin", "skills"].includes(requestedMode)) {
    return {
      mode: "unsupported",
      supported: false,
      reason: `Invalid mode '${requestedMode}'. Expected auto, plugin, or skills.`,
    };
  }

  const spec = loadHostSpec(host, hostsDir);
  if (!spec) {
    return {
      mode: "unsupported",
      supported: false,
      reason:
        host === "grok-bot"
          ? "Grok Bot is not Grok Build CLI and is unsupported in MVP."
          : `Unknown host '${host}'.`,
    };
  }

  if (requestedMode === "auto") {
    const preferred = spec.defaultMode?.[scope] ?? spec.supportedModes[0];
    return {
      mode: preferred,
      supported: true,
      reason: `Selected default '${preferred}' mode for ${host} (${scope} scope).`,
    };
  }

  if (!spec.supportedModes.includes(requestedMode)) {
    return {
      mode: "unsupported",
      supported: false,
      reason: `Host '${host}' does not support direct '${requestedMode}' directory install; use fallback mode '${spec.supportedModes[0]}'.`,
    };
  }

  return {
    mode: requestedMode,
    supported: true,
    reason: `Using requested '${requestedMode}' mode for ${host}.`,
  };
}
