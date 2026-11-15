import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

/**
 * Load and compile the locked offline Agent Plugins v1.0.0 schema.
 */
export function loadPluginSchemaValidator(schemaPath) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(schema);
}

/**
 * Validate a plugin.json object or file against the locked v1.0.0 schema.
 */
export function validatePluginManifest(manifestObj, schemaPath) {
  const errors = [];
  if (!manifestObj || typeof manifestObj !== "object" || Array.isArray(manifestObj)) {
    return { valid: false, errors: ["Manifest must be a JSON object"] };
  }

  const validate = loadPluginSchemaValidator(schemaPath);
  const ok = validate(manifestObj);
  if (!ok && validate.errors) {
    for (const err of validate.errors) {
      const loc = err.instancePath || "(root)";
      errors.push(`${loc}: ${err.message}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verify that VERSION, plugin.json, package.json, and CHANGELOG.md agree on version.
 */
export function validateVersionSync(repoRoot) {
  const errors = [];
  const versionPath = path.join(repoRoot, "VERSION");
  const pluginPath = path.join(repoRoot, "plugin.json");
  const pkgPath = path.join(repoRoot, "package.json");
  const changelogPath = path.join(repoRoot, "CHANGELOG.md");

  if (!fs.existsSync(versionPath)) {
    return { valid: false, version: null, errors: ["Missing VERSION file"] };
  }
  const version = fs.readFileSync(versionPath, "utf8").trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    errors.push(`VERSION '${version}' is not valid SemVer`);
  }

  if (fs.existsSync(pluginPath)) {
    const pluginJson = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
    if (pluginJson.version !== version) {
      errors.push(
        `plugin.json version '${pluginJson.version}' does not match VERSION '${version}'`
      );
    }
  } else {
    errors.push("Missing plugin.json");
  }

  if (fs.existsSync(pkgPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkgJson.version !== version) {
      errors.push(
        `package.json version '${pkgJson.version}' does not match VERSION '${version}'`
      );
    }
  }

  if (fs.existsSync(changelogPath)) {
    const changelog = fs.readFileSync(changelogPath, "utf8");
    const headingRegex = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\]`, "m");
    if (!headingRegex.test(changelog)) {
      errors.push(`CHANGELOG.md missing release heading for [${version}]`);
    }
  }

  return { valid: errors.length === 0, version, errors };
}
