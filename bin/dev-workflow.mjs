#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
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
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
} from "../lib/install-plan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = path.resolve(__dirname, "..");
const defaultHostsDir = path.join(defaultPackageRoot, "hosts");

export const BILINGUAL_LANGUAGE_PROMPT = [
  "准备安装 dev-workflow。请选择使用语言 (Choose Skill Language):",
  "",
  "1. 简体中文 (zh-CN)：Skill 指令和执行手册为中文；中文模板可从源码仓库或语言发布包获取。",
  "2. English (en)：使用英文 Skills 和 playbooks；英文模板可从源码仓库或语言发布包获取。",
  "",
  "两个版本能力和安全规则保持一致。安装目标只会启用其中一种语言。请输入 1 或 2: ",
].join("\n");

export function parseLanguageSelection(answer) {
  const trimmed = String(answer ?? "").trim();
  if (trimmed === "1" || trimmed === "zh-CN") return "zh-CN";
  if (trimmed === "2" || trimmed === "en") return "en";
  throw new Error(
    `Invalid language selection '${trimmed}'. Enter 1 (zh-CN) or 2 (en), or pass --language <en|zh-CN>.`
  );
}

async function promptLanguageInteractive(format) {
  const promptOut = format === "json" ? process.stderr : process.stdout;
  const rl = readline.createInterface({
    input: process.stdin,
    output: promptOut,
    terminal: true,
  });
  try {
    const answer = await rl.question(BILINGUAL_LANGUAGE_PROMPT);
    return parseLanguageSelection(answer);
  } finally {
    rl.close();
  }
}

function findInstalledLanguage({ scopeRoot, host, scope, mode, hostsDir }) {
  if (!fs.existsSync(scopeRoot)) return null;
  const all = listInstalledPackages({ scopeRoot, hostsDir });
  const matches = all.filter(
    (inst) =>
      inst.host === host &&
      inst.scope === scope &&
      (mode === "auto" || inst.mode === mode)
  );
  if (matches.length === 1) {
    return matches[0].language ?? "en";
  }
  return null;
}

async function resolveCommandLanguage({
  command,
  requestedLanguage,
  host,
  scope,
  mode,
  scopeRoot,
  hostsDir,
  format,
}) {
  if (requestedLanguage !== undefined) {
    return normalizeLanguage(requestedLanguage);
  }
  if (command === "update") {
    const existingLang = findInstalledLanguage({ scopeRoot, host, scope, mode, hostsDir });
    if (existingLang) {
      return existingLang;
    }
  }
  const interactive = Boolean(process.stdin.isTTY && (process.stdout.isTTY || process.stderr.isTTY));
  if (!interactive) {
    throw new Error(
      `Missing required '--language <${SUPPORTED_LANGUAGES.join("|")}>' option in non-interactive mode. Ask the user to choose 'zh-CN' or 'en' first, then re-run with '--language <en|zh-CN>'.`
    );
  }
  return promptLanguageInteractive(format);
}

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
        `${inst.host} [${inst.scope}/${inst.mode}, lang=${inst.language ?? "en"}] v${inst.source_version} -> ${inst.target_root} (${inst.file_count} files)`
      );
    }
    return;
  }
  if (Array.isArray(obj.actions)) {
    const langInfo = obj.language ? `, language=${obj.language}` : "";
    console.log(
      `Plan (${obj.host}, scope=${obj.scope}, mode=${obj.mode}${langInfo}, supported=${obj.supported}):`
    );
    if (obj.language_change) {
      console.log(
        `  [LANGUAGE CHANGE] ${obj.language_change.from} -> ${obj.language_change.to}`
      );
    }
    if (obj.partial_uninstall) {
      console.log(
        `  [PARTIAL UNINSTALL] ${(obj.remaining_owned_files ?? []).length} file(s) would remain retained`
      );
    }
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
    for (const step of obj.manual_remediation ?? []) {
      console.log(`  [MANUAL ACTION] ${step}`);
    }
    return;
  }
  console.log(JSON.stringify(obj, null, 2));
}

function printUsage() {
  console.log(`dev-workflow CLI

Commands:
  doctor    --host <codex|antigravity|grok-build|pi|all> [--format json|text]
  install   --host <host> --language <en|zh-CN> [--scope project|user] [--mode auto|plugin|skills] [--target dir] [--adopt] [--upgrade-shared] [--dry-run] [--confirm-user] [--format json|text]
  update    --host <host> [--language <en|zh-CN>] [--scope project|user] [--mode auto|plugin|skills] [--target dir] [--adopt] [--upgrade-shared] [--dry-run] [--confirm-user] [--format json|text]
  list      [--scope project|user] [--target dir] [--host host] [--format json|text]
  uninstall --host <host> [--scope project|user] [--mode auto|plugin|skills] [--target dir] [--dry-run] [--confirm-user] [--format json|text]
  recover   [--scope project|user] [--target dir] [--dry-run|--apply] [--force-unlock] [--confirm-user] [--format json|text]
`);
}

async function main() {
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
    const requestedMode = flags.mode ?? "auto";
    const resolvedLanguage = await resolveCommandLanguage({
      command,
      requestedLanguage: flags.language,
      host,
      scope,
      mode: requestedMode,
      scopeRoot,
      hostsDir,
      format,
    });
    const plan = buildInstallPlan({
      sourceRoot,
      projectRoot: targetDir,
      homeDir,
      hostsDir,
      host,
      scope,
      mode: requestedMode,
      language: resolvedLanguage,
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  });
}
