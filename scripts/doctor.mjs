import { execFile } from "node:child_process";
import { open, readdir, realpath, stat } from "node:fs/promises";
import { get } from "node:http";
import { homedir, release } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PLUGIN_UUID = "com.ulanzi.ulanzistudio.codexmicro";
const MAX_FILE_BYTES = 256 * 1024;
const PROBE_PATHS = new Set(["/state", "/json/version", "/json/list"]);

function problem(code) {
  return Object.assign(new Error(code), { code });
}

// The whitelist deliberately excludes /health: this Bridge refreshes its CDP
// connection there and may inject its Micro feature override into the renderer.
export function requestLocalJson(url, { timeoutMs = 1200, maxBytes = 128 * 1024 } = {}) {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" ||
      target.username || target.password || target.search || target.hash ||
      !PROBE_PATHS.has(target.pathname)) {
    return Promise.reject(problem("endpoint_not_allowed"));
  }
  return new Promise((resolveRequest, reject) => {
    let finished = false;
    let request;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolveRequest(value);
    };
    const timer = setTimeout(() => {
      finish(problem("timeout"));
      request?.destroy();
    }, timeoutMs);
    request = get(target, {
      agent: false,
      headers: { Accept: "application/json", Connection: "close" }
    }, (response) => {
      if (response.statusCode !== 200) {
        finish(problem("http_error"));
        response.destroy();
        return;
      }
      if (Number(response.headers["content-length"]) > maxBytes) {
        finish(problem("response_too_large"));
        response.destroy();
        return;
      }
      let bytes = 0;
      const chunks = [];
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          finish(problem("response_too_large"));
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (finished) return;
        try { finish(null, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { finish(problem("invalid_json")); }
      });
      response.on("error", () => finish(problem("connection_error")));
      response.on("aborted", () => finish(problem("connection_error")));
    });
    request.on("error", (error) => finish(problem(
      error.code === "ECONNREFUSED" ? "not_listening" : "connection_error"
    )));
  });
}

export function projectBridgeState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.connected !== "boolean" || !Array.isArray(value.slots)) {
    throw problem("unexpected_bridge_state");
  }
  return {
    connected: value.connected,
    updatedAt: Number.isSafeInteger(value.updatedAt) && value.updatedAt > 0
      ? value.updatedAt : null,
    slotCount: value.slots.length
  };
}

export function projectDebugVersion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw problem("unexpected_debug_version");
  }
  const browser = value.Browser;
  const protocol = value["Protocol-Version"];
  return {
    browserVersion: typeof browser === "string" && /^[\w.-]+\/[\d.]{1,40}$/.test(browser)
      ? browser : null,
    protocolVersion: typeof protocol === "string" && /^\d+(\.\d+){0,3}$/.test(protocol)
      ? protocol : null,
    webSocketAvailable: typeof value.webSocketDebuggerUrl === "string"
  };
}

export function projectDebugTargets(value) {
  if (!Array.isArray(value)) throw problem("unexpected_debug_targets");
  const pages = value.filter((target) => target && target.type === "page");
  const appPages = pages.filter((target) => {
    try { return new URL(target.url).protocol === "app:"; }
    catch { return false; }
  });
  return {
    targetCount: value.length,
    pageCount: pages.length,
    appPageCount: appPages.length,
    appPageWithWebSocketCount: appPages.filter(
      (target) => typeof target.webSocketDebuggerUrl === "string"
    ).length
  };
}

async function boundedText(path, maxBytes = MAX_FILE_BYTES) {
  const handle = await open(path, "r");
  try {
    if ((await handle.stat()).size > maxBytes) throw problem("file_too_large");
    const bytes = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > maxBytes) throw problem("file_too_large");
    return bytes.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function safeVersion(value) {
  return typeof value === "string" && /^[\w.+()-]{1,64}$/.test(value) ? value : null;
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path !== "" && path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(path);
}

export async function inspectPlugins(root) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    return { directoryPresent: false, error: error.code === "ENOENT" ? "not_installed" : "unreadable", matches: [] };
  }
  let checked = 0;
  let invalidManifestCount = 0;
  const matches = [];
  for (const entry of entries.slice(0, 1000)) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const directory = join(root, entry.name);
    let manifest;
    try {
      manifest = JSON.parse(await boundedText(join(directory, "manifest.json")));
      checked += 1;
    } catch (error) {
      if (error.code !== "ENOENT") invalidManifestCount += 1;
      continue;
    }
    if (manifest?.UUID !== PLUGIN_UUID) continue;
    let codePathExists = false;
    let codePathInPlugin = false;
    const codePath = manifest.CodePath;
    if (typeof codePath === "string" && codePath.length > 0 && !isAbsolute(codePath)) {
      const target = resolve(directory, codePath);
      if (inside(directory, target)) {
        try {
          const [realDirectory, realTarget] = await Promise.all([realpath(directory), realpath(target)]);
          codePathInPlugin = inside(realDirectory, realTarget);
          codePathExists = codePathInPlugin && (await stat(realTarget)).isFile();
        } catch { /* A missing CodePath is an installation issue, not an exception. */ }
      }
    }
    matches.push({ uuid: PLUGIN_UUID, version: safeVersion(manifest.Version), codePathExists, codePathInPlugin });
  }
  return {
    directoryPresent: true,
    manifestsChecked: checked,
    invalidManifestCount,
    scanLimitReached: entries.length > 1000,
    installed: matches.some((plugin) => plugin.codePathExists),
    matches
  };
}

export async function inspectApp(path) {
  const app = { path, present: true, version: null, build: null, versionSource: null };
  try {
    if (!(await stat(path)).isDirectory()) {
      return { ...app, present: false, error: "not_app_directory" };
    }
  } catch (error) {
    return { ...app, present: error.code === "ENOENT" ? false : null, error: error.code === "ENOENT" ? "not_found" : "unreadable" };
  }
  try {
    // plutil reads the existing plist and writes JSON only to stdout.
    const { stdout } = await execFileAsync("/usr/bin/plutil", [
      "-convert", "json", "-o", "-", join(path, "Contents", "Info.plist")
    ], { timeout: 1200, maxBuffer: 64 * 1024 });
    const info = JSON.parse(stdout);
    const version = safeVersion(info.CFBundleShortVersionString);
    return { ...app, version, build: safeVersion(info.CFBundleVersion), versionSource: version ? "bundle_info_plist" : null };
  } catch {
    return { ...app, metadataError: "info_plist_unreadable" };
  }
}

export async function readStudioVersionFile(path) {
  try {
    // This known file is a single version entry, not a settings source. Never
    // extract a version from a larger document or print its other contents.
    const text = await boundedText(path, 4 * 1024);
    return /^version=(\d{1,5}(?:\.\d{1,5}){1,3})(?:\r?\n)?$/.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function applyStudioVersionFallback(app, version) {
  if (app.present !== true || app.version || !version) return app;
  // This shared installation metadata is distinct from the app bundle's own
  // version; the source remains visible so it cannot be mistaken for plist data.
  return { ...app, version, versionSource: "ulanzi_deck_version_file" };
}

async function studioApps(home) {
  const paths = new Set();
  for (const root of ["/Applications", join(home, "Applications")]) {
    let names;
    try { names = await readdir(root); }
    catch { continue; }
    for (const name of names.slice(0, 2000)) {
      if (/ulanzi.*\.app$/i.test(name)) paths.add(join(root, name));
    }
  }
  const apps = await Promise.all([...paths].map(inspectApp));
  if (!apps.some((app) => app.present === true && !app.version)) return apps;
  const version = await readStudioVersionFile(join(
    home, "Library", "Application Support", "Ulanzi", "UlanziDeck", "version.txt"
  ));
  return apps.map((app) => applyStudioVersionFallback(app, version));
}

async function probe(url, project) {
  try { return { reachable: true, ...project(await requestLocalJson(url)) }; }
  catch (error) { return { reachable: false, error: error.code || "probe_failed" }; }
}

export async function collectDoctorReport({ chatgptApp = "/Applications/ChatGPT.app" } = {}) {
  const report = {
    readOnly: true,
    platform: process.platform,
    kernelVersion: release(),
    nodeVersion: process.versions.node,
    supportedPlatform: process.platform === "darwin"
  };
  if (!report.supportedPlatform) return report;
  const home = homedir();
  const [studio, plugins, chatgpt, bridge, debugVersion, debugTargets] = await Promise.all([
    studioApps(home),
    inspectPlugins(join(home, "Library", "Application Support", "Ulanzi", "UlanziDeck", "Plugins")),
    inspectApp(resolve(chatgptApp)),
    probe("http://127.0.0.1:17373/state", projectBridgeState),
    probe("http://127.0.0.1:9222/json/version", projectDebugVersion),
    probe("http://127.0.0.1:9222/json/list", projectDebugTargets)
  ]);
  return {
    ...report, studio, plugins, chatgpt,
    bridge: { ...bridge, healthProbe: "skipped_refresh_may_inject" },
    cdp: { port: 9222, version: debugVersion, targets: debugTargets }
  };
}

const notices = {
  en: "Read-only diagnostics: no app launch, restart, CDP evaluation, or changes. /health is skipped because it can refresh the Bridge and inject into Codex. /state and debugger metadata are projected; titles, URLs and conversation content are omitted. CDP availability does not establish runtime compatibility.",
  zh: "只读诊断：不启动或重启应用，不执行 CDP 代码，不修改配置。跳过 /health，因为它会刷新 Bridge，并可能向 Codex 注入代码。/state 与调试元数据仅输出固定字段，不显示标题、URL 或对话正文。端口可用不代表运行时兼容。"
};

export async function main(args = process.argv.slice(2)) {
  const options = {};
  let language = (process.env.LANG || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--help") {
      console.log("npm run doctor -- [--lang en|zh] [--chatgpt-app /Applications/ChatGPT.app]");
      return;
    }
    if (args[i] === "--lang" && ["en", "zh"].includes(args[i + 1])) {
      language = args[++i];
    } else if (args[i] === "--chatgpt-app" && args[i + 1] && isAbsolute(args[i + 1])) {
      options.chatgptApp = args[++i];
    } else {
      throw problem("invalid_arguments");
    }
  }
  console.log(notices[language]);
  console.log(JSON.stringify(await collectDoctorReport(options), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Doctor failed: ${error.code || "diagnostic_failed"}`);
    process.exitCode = 1;
  });
}
