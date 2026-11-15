import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectHost,
  discoverTargets,
  selectMode,
  SUPPORTED_HOSTS,
} from "../../lib/host-probes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const hostsDir = path.join(repoRoot, "hosts");

test("all supported hosts have valid specs and target discovery", () => {
  for (const host of SUPPORTED_HOSTS) {
    const t = discoverTargets(host, "project", {
      hostsDir,
      projectRoot: "/tmp/example-project",
      homeDir: "/tmp/example-home",
    });
    assert.equal(t.supported, true, `${host} project targets should be supported`);
    assert.ok(t.skillTargets.length === 1);
  }
});

test("detectHost reports not_detected when binary is missing on PATH", () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-empty-path-"));
  try {
    const res = detectHost("codex", { PATH: emptyDir }, { hostsDir });
    assert.equal(res.found, false);
    assert.equal(res.status, "not_detected");
    assert.equal(res.version, "unknown");
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test("grok-bot is rejected explicitly and never confused with grok-build", () => {
  const det = detectHost("grok-bot", process.env, { hostsDir });
  assert.equal(det.found, false);
  assert.equal(det.status, "unsupported");

  const mode = selectMode("grok-bot", "auto", { hostsDir });
  assert.equal(mode.supported, false);
  assert.equal(mode.mode, "unsupported");
});

test("detectHost catches identity mismatch for grok-build binary", () => {
  const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "dw-fake-bin-"));
  const fakeGrok = path.join(fakeBinDir, "grok");
  fs.writeFileSync(fakeGrok, "#!/bin/sh\necho 'unrelated-tool 9.9.9'\n", "utf8");
  fs.chmodSync(fakeGrok, 0o755);

  try {
    const res = detectHost(
      "grok-build",
      { PATH: fakeBinDir },
      {
        hostsDir,
        execFn: () => ({ status: 0, stdout: "unrelated-tool 9.9.9\n", stderr: "", error: null }),
      }
    );
    assert.equal(res.found, false);
    assert.equal(res.status, "identity_mismatch");
  } finally {
    fs.rmSync(fakeBinDir, { recursive: true, force: true });
  }
});

test("selectMode prevents assuming native plugin support for skills-only hosts", () => {
  const codexPlugin = selectMode("codex", "plugin", { hostsDir });
  assert.equal(codexPlugin.supported, false);
  assert.equal(codexPlugin.mode, "unsupported");

  const codexAuto = selectMode("codex", "auto", { hostsDir });
  assert.equal(codexAuto.supported, true);
  assert.equal(codexAuto.mode, "skills");

  const agyAuto = selectMode("antigravity", "auto", { hostsDir });
  assert.equal(agyAuto.supported, true);
  assert.equal(agyAuto.mode, "plugin");
});
