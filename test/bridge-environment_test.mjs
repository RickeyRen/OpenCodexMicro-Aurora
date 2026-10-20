import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  bridgeAgentEnvironment, bridgeAgentEnvironmentXml, createBridgeInstaller
} from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/bridge-installer.js";

const execute = promisify(execFile);
async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), "codex-bridge-env-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const agentPath = join(home, "Library/LaunchAgents/io.opencodexmicro.bridge.plist");
  await mkdir(dirname(agentPath), { recursive: true });
  return { home, agentPath };
}

test("new installs default allowance refresh to 30 seconds without copying process secrets", async t => {
  const f = await fixture(t);
  const env = await bridgeAgentEnvironment({ ...f, environment: { PRIVATE_INSTALL_TOKEN: "private-install-only" },
    execute: async () => { throw new Error("missing plist must not invoke plutil"); } });
  assert.deepEqual(env, { CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: "30" });
  assert.doesNotMatch(bridgeAgentEnvironmentXml(env), /private-install-only/);
});

test("repairs preserve every saved string override and use explicit polling override only when supplied", async t => {
  const f = await fixture(t);
  await writeFile(f.agentPath, "fixture plist");
  const saved = { CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: "90", CODEX_KEYBOARD_REFRESH_MS: "750",
    PATH: "/some custom/bin:/usr/bin", CUSTOM_SETTING: '<>&"\'' };
  const calls = [];
  const readPlist = async (...args) => { calls.push(args); return { stdout: JSON.stringify({ EnvironmentVariables: saved }) }; };
  assert.deepEqual(await bridgeAgentEnvironment({ ...f, environment: {}, execute: readPlist }), saved);
  const updated = await bridgeAgentEnvironment({ ...f, environment: { CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: "45", PRIVATE_INSTALL_TOKEN: "omit" }, execute: readPlist });
  assert.deepEqual(updated, { ...saved, CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: "45" });
  assert.deepEqual(calls[0], ["/usr/bin/plutil", ["-convert", "json", "-o", "-", f.agentPath], { timeout: 1200, maxBuffer: 256 * 1024 }]);
  assert.match(bridgeAgentEnvironmentXml(updated), /&lt;&gt;&amp;&quot;&apos;/);
});

test("legacy plists without environment gain the default; invalid values stop rather than erase customization", async t => {
  const f = await fixture(t);
  await writeFile(f.agentPath, "fixture plist");
  const reader = plist => async () => ({ stdout: JSON.stringify(plist) });
  assert.deepEqual(await bridgeAgentEnvironment({ ...f, environment: {}, execute: reader({ Label: "existing" }) }), { CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: "30" });
  for (const EnvironmentVariables of [[], "wrong", { CUSTOM: 42 }, { CUSTOM: "control\u0000character" }]) {
    await assert.rejects(bridgeAgentEnvironment({ ...f, environment: {}, execute: reader({ EnvironmentVariables }) }), /environment is invalid/);
  }
  for (const value of ["", "0", "14", "NaN", "Infinity", "private-invalid-setting"]) {
    await assert.rejects(bridgeAgentEnvironment({ ...f, environment: { CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: value }, execute: reader({}) }), error => {
      assert.match(error.message, /at least 15/);
      assert.doesNotMatch(error.message, /private-invalid-setting/);
      return true;
    });
  }
});

test("malformed, oversized and symlinked prior plists fail before installer effects", async t => {
  const f = await fixture(t);
  await writeFile(f.agentPath, "malformed fixture");
  await assert.rejects(bridgeAgentEnvironment({ ...f, execute: async () => ({ stdout: "invalid private data" }) }), error => {
    assert.match(error.message, /is invalid/); assert.doesNotMatch(error.message, /private data/); return true;
  });
  await writeFile(f.agentPath, " ".repeat(256 * 1024 + 1));
  let called = false;
  await assert.rejects(bridgeAgentEnvironment({ ...f, execute: async () => { called = true; } }), /cannot be safely read/);
  assert.equal(called, false);
  await rm(f.agentPath);
  const outside = join(f.home, "outside.plist");
  await writeFile(outside, "existing private config");
  await symlink(outside, f.agentPath);
  await assert.rejects(bridgeAgentEnvironment({ ...f, execute: async () => { called = true; } }), /cannot be safely read/);
  assert.equal(called, false);
  assert.equal(await readFile(outside, "utf8"), "existing private config");
});

test("both install paths share environment generation and validate it before replacing app files", async () => {
  const repository = await readFile(new URL("../scripts/install.mjs", import.meta.url), "utf8");
  const bundled = await readFile(new URL("../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/bridge-installer.js", import.meta.url), "utf8");
  for (const source of [repository, bundled]) {
    assert.match(source, /const agentEnvironment = await bridgeAgentEnvironment\(/);
    assert.match(source, /\$\{bridgeAgentEnvironmentXml\(agentEnvironment\)\}/);
    assert.ok(source.indexOf("const agentEnvironment = await bridgeAgentEnvironment(") < source.indexOf("await rm(bridgeApp"));
  }
});

test("bundled installer writes the preserved environment into the actual isolated LaunchAgent", async t => {
  const f = await fixture(t);
  await writeFile(f.agentPath, "existing fixture plist");
  const saved = { CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: "120", CUSTOM_SETTING: "keep&me" };
  const commands = [];
  const health = createServer((_request, response) => response.end('{"ok":true,"codexConnected":false}'));
  await new Promise(resolve => health.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => health.close(resolve)));
  const installer = createBridgeInstaller({
    pluginRoot: fileURLToPath(new URL("../integration/com.ulanzi.codexmicro.ulanziPlugin/", import.meta.url)),
    bridgeUrl: `http://127.0.0.1:${health.address().port}`, version: "test",
    home: f.home, uid: 501, platform: "darwin", environmentPath: "", environment: {},
    execute: async (command, args) => {
      commands.push(command);
      if (command === "/usr/bin/plutil") return { stdout: JSON.stringify({ EnvironmentVariables: saved }) };
      if (args[0] === "--version") return { stdout: "v22.14.0\n" };
      return { stdout: "" };
    }
  });
  await installer.install();
  const generated = await readFile(f.agentPath, "utf8");
  assert.match(generated, /<key>CODEX_KEYBOARD_USAGE_REFRESH_SECONDS<\/key><string>120<\/string>/);
  assert.match(generated, /<key>CUSTOM_SETTING<\/key><string>keep&amp;me<\/string>/);
  assert.equal(commands[0], "/usr/bin/plutil");
  assert.ok(!commands.includes("/usr/bin/security"));
});

test("generated environment is a valid XML plist with original values", { skip: process.platform !== "darwin" }, async t => {
  const f = await fixture(t);
  const original = { CODEX_KEYBOARD_USAGE_REFRESH_SECONDS: "30", SPECIAL: "<&>\"'\n中文" };
  await writeFile(f.agentPath, `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${bridgeAgentEnvironmentXml(original)}</dict></plist>`);
  const { stdout } = await execute("/usr/bin/plutil", ["-convert", "json", "-o", "-", f.agentPath], { timeout: 1200 });
  assert.deepEqual(JSON.parse(stdout).EnvironmentVariables, original);
});
