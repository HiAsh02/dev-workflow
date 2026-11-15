import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function collectTests(dirs) {
  const files = [];
  for (const dirArg of dirs) {
    const absDir = path.resolve(repoRoot, dirArg);
    if (!fs.existsSync(absDir)) continue;
    const stack = [absDir];
    while (stack.length > 0) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile() && entry.name.endsWith(".test.mjs")) {
          files.push(full);
        }
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b, "en"));
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("Usage: node scripts/run-tests.mjs <dir> [<dir>...]");
  process.exit(1);
}

const testFiles = collectTests(dirs);
if (testFiles.length === 0) {
  console.error(`No *.test.mjs files found under: ${dirs.join(", ")}`);
  process.exit(1);
}

const res = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
