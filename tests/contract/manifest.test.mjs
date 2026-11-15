import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePluginManifest, validateVersionSync } from "../../lib/manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const schemaPath = path.join(repoRoot, "schemas", "plugin-v1.0.0.schema.json");

test("root plugin.json satisfies locked Agent Plugins v1.0.0 schema", () => {
  const pluginJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "plugin.json"), "utf8")
  );
  const res = validatePluginManifest(pluginJson, schemaPath);
  assert.equal(res.valid, true, res.errors.join("; "));
  assert.equal(pluginJson.name, "dev-workflow");
  assert.equal(
    pluginJson.$schema,
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
  );
});

test("plugin manifest rejects unknown top-level keys and consecutive hyphens", () => {
  const badKeys = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "dev-workflow",
    skills: ["./skills"],
  };
  const r1 = validatePluginManifest(badKeys, schemaPath);
  assert.equal(r1.valid, false);

  const badName = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "dev--workflow",
  };
  const r2 = validatePluginManifest(badName, schemaPath);
  assert.equal(r2.valid, false);
});

test("VERSION, plugin.json, package.json, and CHANGELOG.md versions stay synchronized", () => {
  const res = validateVersionSync(repoRoot);
  assert.equal(res.valid, true, res.errors.join("; "));
  assert.equal(res.version, "0.1.0");
});
