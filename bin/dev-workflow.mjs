#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { detectHost, SUPPORTED_HOSTS } from "../lib/host-probes.mjs";
import {
  applyInstallPlan,
  applyPendingRecovery,
  applyUninstallPlan,
  buildInstallPlan,
  buildUninstallPlan,
  inspectPendingRecovery,
  listInstalledPackages,
} from "../lib/install-plan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = path.resolve(__dirname, "..");
const defaultHostsDir = path.join(defaultPackageRoot, "hosts");

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (
        [
          "dry-run",
          "confirm-user",
          "adopt",
          "upgrade-shared",
          "apply",
          "force-unlock",
          "help",
          "h",
        ].includes(key)
      ) {
        flags[key] = true;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          throw new Error(`Missing value for --${key}`);
        }
        flags[key] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0] ?? "help", flags };
}

function getGitRef(sourceRoot) {
  try {
    return execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function printOutput(obj, format) {
  if (format === "json") {
    console.log(JSON.stringify(obj, null, 2));
    return;
  }
  if (Array.isArray(obj.hosts)) {
    for (const h of obj.hosts) {
      console.log(`${h.host}: ${h.status} (version=${h.version}) - ${h.evidence}`);
    }
    return;
  }
  if (Array.isArray(obj.installations)) {
    if (obj.installations.length === 0) {
      console.log("No dev-workflow installations recorded.");
      return;
    }
    for (const inst of obj.installations) {
      console.log(
        `${inst.host} [${inst.scope}/${inst.mode}] v${inst.source_version} -> ${inst.target_root} (${inst.file_count} files)`
      );
    }
    return;
  }
  if (Array.isArray(obj.actions)) {
    console.log(
      `Plan (${obj.host}, scope=${obj.scope}, mode=${obj.mode}, supported=${obj.supported}):`
    );
    if (obj.reason) console.log(`  Note: ${obj.reason}`);
    for (const a of obj.actions) {
      console.log(`  [${a.kind}] ${a.relative_path}`);
    }
    for (const c of obj.conflicts ?? []) {
      console.log(`  [CONFLICT] ${c.relative_path}: ${c.reason}`);
    }
    for (const p of obj.preserved ?? []) {
      console.log(`  [PRESERVED] ${p.relative_path}: ${p.reason}`);
    }
    return;
  }
  console.log(JSON.stringify(obj, null, 2));
}

function printUsage() {
  console.log(`dev-workflow CLI

Commands:
  doctor    --host <codex|antigravity|grok-build|pi|all> [--format json|text]
  install   --host <host> [--scope project|user] [--mode auto|plugin|skills] [--target dir] [--adopt] [--upgrade-shared] [--dry-run] [--confirm-user] [--format json|text]
  update    --host <host> [--scope project|user] [--mode auto|plugin|skills] [--target dir] [--adopt] [--upgrade-shared] [--dry-run] [--confirm-user] [--format json|text]
  list      [--scope project|user] [--target dir] [--host host] [--format json|text]
  uninstall --host <host> [--scope project|user] [--mode auto|plugin|skills] [--target dir] [--dry-run] [--confirm-user] [--format json|text]
  recover   [--scope project|user] [--target dir] [--dry-run|--apply] [--force-unlock] [--confirm-user] [--format json|text]
`);
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const format = flags.format ?? "text";

  if (command === "help" || flags.help) {
    printUsage();
    return;
  }

  const hostsDir = defaultHostsDir;
  const sourceRoot = flags.source ? path.resolve(flags.source) : defaultPackageRoot;
  const scope = flags.scope ?? "project";
  const targetDir = flags.target ? path.resolve(flags.target) : process.cwd();
  const homeDir = os.homedir();
  const scopeRoot = scope === "user" ? homeDir : targetDir;

  if (command === "doctor") {
    const reqHost = flags.host ?? "all";
    const hosts = reqHost === "all" ? SUPPORTED_HOSTS : [reqHost];
    const results = hosts.map((h) => detectHost(h, process.env, { hostsDir }));
    printOutput({ hosts: results }, format);
    if (results.some((r) => r.status === "unsupported")) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "list") {
    let installations = listInstalledPackages({ scopeRoot });
    if (flags.host && flags.host !== "all") {
      installations = installations.filter((i) => i.host === flags.host);
    }
    printOutput({ scope, scopeRoot, installations }, format);
    return;
  }

  if (command === "recover") {
    if (flags["dry-run"] && flags.apply) {
      throw new Error("--dry-run and --apply cannot be used together for recover");
    }
    if (flags.apply) {
      const recovered = applyPendingRecovery({
        projectRoot: targetDir,
        homeDir,
        scope,
        confirmUser: Boolean(flags["confirm-user"]),
        forceUnlock: Boolean(flags["force-unlock"]),
      });
      printOutput(recovered, format);
      return;
    }
    const probe = inspectPendingRecovery({
      projectRoot: targetDir,
      homeDir,
      scope,
    });
    printOutput(probe, format);
    if (!probe.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const host = flags.host;
  if (!host) {
    throw new Error("--host is required");
  }

  if (command === "install" || command === "update") {
    const plan = buildInstallPlan({
      sourceRoot,
      projectRoot: targetDir,
      homeDir,
      hostsDir,
      host,
      scope,
      mode: flags.mode ?? "auto",
      sourceRef: getGitRef(sourceRoot),
      confirmUser: Boolean(flags["confirm-user"]),
      adopt: Boolean(flags.adopt),
      preferInstalledMode: command === "update",
      upgradeShared: Boolean(flags["upgrade-shared"]),
    });

    if (flags["dry-run"]) {
      printOutput(plan, format);
      if (!plan.supported || plan.conflicts.length > 0) {
        process.exitCode = 1;
      }
      return;
    }

    const applied = applyInstallPlan(plan, {
      confirmUser: Boolean(flags["confirm-user"]),
    });
    printOutput({ plan, result: applied }, format);
    return;
  }

  if (command === "uninstall") {
    const plan = buildUninstallPlan({
      projectRoot: targetDir,
      homeDir,
      hostsDir,
      host,
      scope,
      mode: flags.mode ?? "auto",
      confirmUser: Boolean(flags["confirm-user"]),
      sourceRoot,
    });

    if (flags["dry-run"]) {
      printOutput(plan, format);
      if (!plan.supported) process.exitCode = 1;
      return;
    }

    const result = applyUninstallPlan(plan, {
      confirmUser: Boolean(flags["confirm-user"]),
    });
    printOutput(result, format);
    return;
  }

  throw new Error(`Unknown command '${command}'`);
}

try {
  main();
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
