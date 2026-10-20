import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyStudioVersionFallback, inspectApp, inspectPlugins, projectBridgeState,
  projectDebugTargets, projectDebugVersion, readStudioVersionFile, requestLocalJson
} from "../scripts/doctor.mjs";

test("doctor projects metadata without exposing titles, URLs, errors or conversations", () => {
  const secret = "private conversation title";
  const state = projectBridgeState({
    connected: true, updatedAt: 123, error: secret,
    slots: [{ title: secret, threadKey: secret, status: secret }]
  });
  const version = projectDebugVersion({
    Browser: "Chrome/155.0.0.0", "Protocol-Version": "1.3",
    webSocketDebuggerUrl: `ws://127.0.0.1/${secret}`, title: secret
  });
  const targets = projectDebugTargets([
    { type: "page", url: "app://codex/index.html", title: secret, webSocketDebuggerUrl: secret },
    { type: "page", url: "https://private.example/", title: secret },
    { type: "worker", url: secret }, null
  ]);
  assert.deepEqual(state, { connected: true, updatedAt: 123, slotCount: 1 });
  assert.equal(version.webSocketAvailable, true);
  assert.deepEqual(targets, { targetCount: 4, pageCount: 2, appPageCount: 1, appPageWithWebSocketCount: 1 });
  assert.ok(!JSON.stringify({ state, version, targets }).includes(secret));
  assert.equal(projectDebugVersion({ Browser: secret }).browserVersion, null);
  assert.throws(() => projectBridgeState({ connected: true }), /unexpected_bridge_state/);
});

test("doctor only probes whitelisted loopback GET endpoints and rejects redirects", async (t) => {
  const paths = [];
  const server = createServer((request, response) => {
    paths.push(request.url);
    if (request.url === "/state") {
      response.writeHead(302, { Location: "http://private.example/" });
      response.end();
    } else {
      response.end('{"Browser":"Chrome/155.0"}');
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await requestLocalJson(`${base}/json/version`)).Browser, "Chrome/155.0");
  await assert.rejects(requestLocalJson(`${base}/state`), { code: "http_error" });
  for (const url of [`${base}/health`, `${base}/state?refresh=true`, "http://example.com/state"]) {
    await assert.rejects(requestLocalJson(url), { code: "endpoint_not_allowed" });
  }
  assert.deepEqual(paths, ["/json/version", "/state"]);
});

test("doctor bounds chunked responses and total probe time", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/state") {
      response.writeHead(200);
      response.end("x".repeat(2048));
    }
    // /json/list deliberately never responds; the doctor's total timer closes it.
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(requestLocalJson(`${base}/state`, { maxBytes: 512 }), { code: "response_too_large" });
  await assert.rejects(requestLocalJson(`${base}/json/list`, { timeoutMs: 30 }), { code: "timeout" });
});

test("plugin detection requires the exact UUID and a CodePath inside its plugin", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ulanzi-doctor-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const plugins = join(root, "Plugins");
  await mkdir(plugins);
  const put = async (name, manifest) => {
    const directory = join(plugins, name);
    await mkdir(directory);
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
    return directory;
  };
  const uuid = "com.ulanzi.ulanzistudio.codexmicro";
  const valid = await put("renamed-plugin", { UUID: uuid, Version: "0.4.1", CodePath: "app.js" });
  await writeFile(join(valid, "app.js"), "");
  await put("same-name-wrong-id", { UUID: "another-plugin", CodePath: "app.js" });
  await put("missing-code", { UUID: uuid, CodePath: "missing.js" });
  await writeFile(join(root, "outside.js"), "");
  await put("traversal", { UUID: uuid, CodePath: "../../outside.js" });
  const linked = await put("symlink", { UUID: uuid, CodePath: "app.js" });
  await symlink(join(root, "outside.js"), join(linked, "app.js"));
  const result = await inspectPlugins(plugins);
  assert.equal(result.installed, true);
  assert.equal(result.matches.length, 4);
  assert.equal(result.matches.filter((plugin) => plugin.codePathExists).length, 1);
  assert.equal(result.matches.filter((plugin) => plugin.codePathInPlugin).length, 1);
});

test("Studio fallback accepts only a bounded, complete version entry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ulanzi-doctor-version-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "version.txt");
  for (const text of ["version=3.4.4", "version=3.4.4\n", "version=3.4.4\r\n"]) {
    await writeFile(path, text);
    assert.equal(await readStudioVersionFile(path), "3.4.4");
  }
  for (const text of [
    "version=3.4.4\nsetting=private", "setting=private\nversion=3.4.4",
    "other_version=3.4.4", "version=v3.4.4", "version=3.4.4\n\n",
    "version=3.4.4 " , `version=3.4.4\n${"x".repeat(4096)}`
  ]) {
    await writeFile(path, text);
    assert.equal(await readStudioVersionFile(path), null);
  }
  assert.equal(await readStudioVersionFile(join(root, "missing.txt")), null);
});

test("Studio version provenance preserves bundle priority and app presence", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ulanzi-doctor-app-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "Ulanzi Studio.app");
  await mkdir(path);
  const app = await inspectApp(path);
  assert.equal(app.present, true); // A missing plist does not mean a missing app.
  assert.equal(app.version, null);
  assert.deepEqual(applyStudioVersionFallback(app, "3.4.4"), {
    ...app, version: "3.4.4", versionSource: "ulanzi_deck_version_file"
  });
  const bundle = { ...app, version: "3.5.0", versionSource: "bundle_info_plist" };
  assert.deepEqual(applyStudioVersionFallback(bundle, "3.4.4"), bundle);
  const missing = await inspectApp(join(root, "Missing.app"));
  assert.equal(missing.present, false);
  assert.deepEqual(applyStudioVersionFallback(missing, "3.4.4"), missing);
});
