#!/usr/bin/env node
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectApp, readStudioVersionFile } from "./doctor.mjs";
import {
  DEFAULT_OVERVIEW_CONFIG_PATH, DEFAULT_STUDIO_PROFILES_ROOT,
  OVERVIEW_PLUGIN_UUID, SUPPORTED_OVERVIEW_STUDIO_VERSION
} from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/native-overview-target.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW_ACTION = "com.ulanzi.ulanzideck.smallwindow.window";
const UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const TASK = new RegExp(`^${OVERVIEW_PLUGIN_UUID.replaceAll(".", "\\.")}\\.task([1-9]|1[0-3])$`);
const MAX_BYTES = 1024 * 1024;
const MAX_SCAN_ENTRIES = 10000;

const messages = {
  en: {
    unsupported_platform: "The native D200H overview is supported on macOS only.",
    unsupported_studio: "This compatibility route requires Ulanzi Studio 3.4.4. Other versions remain disabled until verified.",
    ambiguous_studio: "Multiple Studio versions were found. Select the installed app with --studio-app /absolute/path/Ulanzi.app.",
    invalid_arguments: "Invalid arguments. Run with --help for usage.",
    missing_profile: "No page with all thirteen distinct Codex Task actions and a native long window was found. Add Task 1–13 to the D200H page in Studio first.",
    ambiguous_profile: "Several Codex pages were found. Repeat --enable with --profile and one listed absolute manifest path.",
    invalid_profile: "The selected page must be a regular JSON file inside Studio ProfilesV2 with one Keypad controller and all thirteen distinct Codex Task actions.",
    clock_mode: "Select the bottom-right native window in Studio, choose Pure background, and leave its image blank. Then run --enable again. No profile was changed.",
    custom_background: "Clear the native window's custom image in Studio before enabling. Its image and relative image path must both be empty. No profile was changed.",
    scan_incomplete: "Profile discovery was incomplete. Select a known page explicitly with --profile before enabling.",
    invalid_config: "The existing overview configuration is not a regular, valid JSON object. Repair or remove it manually before enabling.",
    config_in_repository: "The overview configuration contains local paths and must be stored outside the source repository.",
    config_write: "Could not atomically save the local overview configuration. Its prior contents were preserved.",
    enabled: "Native overview enabled. Studio profiles and all thirteen conversation keys were left unchanged. The running plugin rechecks this file within five seconds.",
    disabled: "Native overview disabled. In Studio, select a Clock mode on the native long window to restore the clock.",
    dry_run: "Dry run: validation passed; no files were changed.",
    status: "Read-only overview status. No apps were launched or stopped, and no files were changed.",
    setup_failed: "Overview setup failed. No Studio profile was modified."
  },
  zh: {
    unsupported_platform: "原生 D200H 长条概览仅支持 macOS。",
    unsupported_studio: "此兼容通道要求 Ulanzi Studio 3.4.4，其他版本在重新验证前保持停用。",
    ambiguous_studio: "发现多个 Studio 版本。请用 --studio-app /绝对路径/Ulanzi.app 指定实际安装的应用。",
    invalid_arguments: "参数无效，请使用 --help 查看用法。",
    missing_profile: "未找到包含全部 13 个不同 Codex Task 动作及原生长条的页面。请先在 D200H 页面添加 Task 1–13。",
    ambiguous_profile: "发现多个 Codex 页面。请用 --profile 指定下方某个 manifest 的绝对路径，再执行 --enable。",
    invalid_profile: "所选页面必须是 Studio ProfilesV2 内的普通 JSON 文件，含一个 Keypad 控制器及全部 13 个不同 Codex Task 动作。",
    clock_mode: "请在 Studio 中选中右下角原生窗口，切换为“纯背景”并保持图片为空，再执行 --enable。未修改任何页面。",
    custom_background: "请先在 Studio 中清除原生窗口的自定义图片，图片及相对图片路径都必须为空。未修改任何页面。",
    scan_incomplete: "页面扫描未完整完成。启用前请用 --profile 显式指定已知页面。",
    invalid_config: "现有概览配置不是有效的普通 JSON 对象文件。请手动修复或移除后再启用。",
    config_in_repository: "概览配置包含本机路径，必须保存在源码仓库之外。",
    config_write: "无法原子保存本机概览配置，原配置内容已保留。",
    enabled: "原生长条概览已启用。未修改 Studio 页面及 13 个对话按键，运行中的插件将在五秒内重新检查配置。",
    disabled: "原生长条概览已停用。请在 Studio 中将原生长条切换回“时钟”模式以恢复时钟。",
    dry_run: "预演验证通过，未修改任何文件。",
    status: "只读概览状态：未启动或停止应用，未修改任何文件。",
    setup_failed: "概览设置失败，未修改任何 Studio 页面。"
  }
};

function problem(code) { return Object.assign(new Error(code), { code }); }
function inside(root, path) {
  const location = relative(root, path);
  return location !== "" && location !== ".." && !location.startsWith(`..${sep}`) && !isAbsolute(location);
}

async function readJson(path, { optional = false, code = "invalid_profile" } = {}) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size <= 0 || info.size > MAX_BYTES) throw problem(code);
    const bytes = Buffer.alloc(info.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await handle.read(bytes, count, bytes.length - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count !== info.size) throw problem(code);
    const value = JSON.parse(bytes.subarray(0, count).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw problem(code);
    return value;
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw problem(code);
  } finally { await handle?.close(); }
}

/** Inspect contents, never names, and never alter the user's Studio profile. */
export async function inspectOverviewProfile({ profilePath, profilesRoot = DEFAULT_STUDIO_PROFILES_ROOT }) {
  if (!isAbsolute(profilePath) || !profilePath.endsWith(".json")) throw problem("invalid_profile");
  let root;
  let canonical;
  try {
    [root, canonical] = await Promise.all([realpath(profilesRoot), realpath(profilePath)]);
    if (!inside(root, canonical) || (await lstat(profilePath)).isSymbolicLink()) throw problem("invalid_profile");
  } catch { throw problem("invalid_profile"); }
  const value = await readJson(canonical);
  const keypads = Array.isArray(value.Controllers) ? value.Controllers.filter(item => item?.Type === "Keypad") : [];
  if (keypads.length !== 1 || !keypads[0].Actions || typeof keypads[0].Actions !== "object") return null;
  const actions = keypads[0].Actions;
  const taskSlots = Object.entries(actions).filter(([key, item]) => key !== "3_2" && TASK.test(item?.Action));
  const taskNumbers = new Set(taskSlots.map(([, item]) => Number(TASK.exec(item.Action)[1])));
  if (taskSlots.length !== 13 || taskNumbers.size !== 13) return null;
  const window = actions["3_2"];
  if (window?.Action !== WINDOW_ACTION || typeof window.ActionID !== "string" || !UUID.test(window.ActionID)) return null;
  const reason = window.ActionParam?.SmallViewMode !== 2 ? "clock_mode"
    : !Array.isArray(window.ViewParam) || window.ViewParam.length !== 1
      || window.ViewParam[0]?.Icon !== "" || window.ViewParam[0]?.IconRel !== "" ? "custom_background" : null;
  return { profilePath: canonical, actionid: window.ActionID, taskCount: 13, ready: reason === null, reason };
}

/** Bounded scan; symlinked entries are never followed. */
export async function discoverOverviewProfiles({ profilesRoot = DEFAULT_STUDIO_PROFILES_ROOT } = {}) {
  const profiles = [];
  let entriesScanned = 0;
  let incomplete = false;
  async function walk(path, depth) {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) { if (error.code !== "ENOENT") incomplete = true; return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++entriesScanned > MAX_SCAN_ENTRIES) { incomplete = true; return; }
      const child = join(path, entry.name);
      if (entry.isDirectory() && depth < 3) await walk(child, depth + 1);
      else if (entry.isFile() && entry.name === "manifest.json") {
        try {
          const profile = await inspectOverviewProfile({ profilePath: child, profilesRoot });
          if (profile) profiles.push(profile);
        } catch { incomplete = true; }
      }
      if (entriesScanned > MAX_SCAN_ENTRIES) return;
    }
  }
  await walk(resolve(profilesRoot), 0);
  return { profiles, incomplete };
}

export async function detectOverviewStudioVersion({ home = homedir(), studioApp } = {}) {
  const appPaths = [];
  if (studioApp) appPaths.push(studioApp);
  else {
    for (const root of ["/Applications", join(home, "Applications")]) {
      let names;
      try { names = await readdir(root); } catch { continue; }
      for (const name of names.slice(0, 2000)) if (/ulanzi.*\.app$/i.test(name)) appPaths.push(join(root, name));
    }
  }
  const apps = await Promise.all(appPaths.map(inspectApp));
  const present = apps.filter(app => app.present === true);
  let fallback;
  if (present.some(app => !app.version)) fallback = await readStudioVersionFile(join(home,
    "Library/Application Support/Ulanzi/UlanziDeck/version.txt"));
  const versions = [...new Set(present.map(app => app.version || fallback).filter(Boolean))];
  return { studioVersion: versions.length === 1 ? versions[0] : null, ambiguous: versions.length > 1 };
}

async function writeConfig(configPath, value, { repositoryRoot = REPOSITORY_ROOT } = {}) {
  const parent = dirname(resolve(configPath));
  let temporary;
  try {
    // Check before mkdir too: dry or rejected setup must not create repo data.
    if (inside(resolve(repositoryRoot), resolve(configPath))) throw problem("config_in_repository");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const canonicalParent = await realpath(parent);
    const canonicalRepository = await realpath(repositoryRoot);
    if (canonicalParent === canonicalRepository || inside(canonicalRepository, canonicalParent)) throw problem("config_in_repository");
    try {
      const existing = await lstat(configPath);
      if (!existing.isFile() || existing.isSymbolicLink()) throw problem("invalid_config");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    temporary = join(canonicalParent, `.deck-overview-${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, configPath);
    temporary = undefined;
  } catch (error) {
    if (["config_in_repository", "invalid_config"].includes(error.code)) throw error;
    throw problem("config_write");
  } finally { if (temporary) await rm(temporary, { force: true }); }
}

/** Dependency paths are injectable for fixtures; no launch, CDP, or profile writes. */
export async function configureOverview({ mode = "status", dryRun = false, profilePath, studioApp,
  profilesRoot = DEFAULT_STUDIO_PROFILES_ROOT,
  configPath = process.env.CODEX_MICRO_OVERVIEW_FILE || DEFAULT_OVERVIEW_CONFIG_PATH,
  platform = process.platform, studioVersion, home = homedir(), repositoryRoot = REPOSITORY_ROOT
} = {}) {
  if (!["status", "enable", "disable"].includes(mode)) throw problem("invalid_arguments");
  if (platform !== "darwin") throw problem("unsupported_platform");
  const existing = await readJson(configPath, { optional: true, code: "invalid_config" });
  if (mode === "disable") {
    if (!dryRun) await writeConfig(configPath, { enabled: false }, { repositoryRoot });
    return { mode, dryRun, enabled: false, configPath, message: dryRun ? "dry_run" : "disabled" };
  }
  const version = studioVersion === undefined ? await detectOverviewStudioVersion({ home, studioApp })
    : { studioVersion, ambiguous: false };
  const discovery = profilePath
    ? { profiles: [await inspectOverviewProfile({ profilePath, profilesRoot })].filter(Boolean), incomplete: false }
    : await discoverOverviewProfiles({ profilesRoot });
  const result = { mode, dryRun, enabled: existing?.enabled === true, configPath,
    studioVersion: version.studioVersion, supported: version.studioVersion === SUPPORTED_OVERVIEW_STUDIO_VERSION,
    ...discovery, message: "status" };
  if (mode === "status") return result;
  if (version.ambiguous) throw problem("ambiguous_studio");
  if (!result.supported) throw problem("unsupported_studio");
  if (discovery.incomplete) throw problem("scan_incomplete");
  if (!discovery.profiles.length) throw problem(profilePath ? "invalid_profile" : "missing_profile");
  if (discovery.profiles.length !== 1) throw Object.assign(problem("ambiguous_profile"), { profiles: discovery.profiles });
  // Re-read immediately before opting in so a stale discovery cannot silently
  // approve a newly selected custom image or clock mode.
  const target = await inspectOverviewProfile({ profilePath: discovery.profiles[0].profilePath, profilesRoot });
  if (!target) throw problem("invalid_profile");
  if (!target.ready) throw problem(target.reason);
  const configuration = { enabled: true, studioVersion: version.studioVersion,
    profilePath: target.profilePath, actionid: target.actionid };
  if (!dryRun) await writeConfig(configPath, configuration, { repositoryRoot });
  return { ...result, enabled: true, message: dryRun ? "dry_run" : "enabled" };
}

export function parseOverviewArgs(args) {
  const options = { mode: "status", dryRun: false, json: false,
    language: (process.env.LANG || "").toLowerCase().startsWith("zh") ? "zh" : "en" };
  let mutation = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--enable", "--disable"].includes(arg)) {
      if (mutation) throw problem("invalid_arguments");
      options.mode = arg.slice(2); mutation = true;
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--lang" && ["en", "zh"].includes(args[index + 1])) options.language = args[++index];
    else if (["--profile", "--studio-app"].includes(arg) && args[index + 1] && isAbsolute(args[index + 1])) {
      options[arg === "--profile" ? "profilePath" : "studioApp"] = args[++index];
    } else throw problem("invalid_arguments");
  }
  return options;
}

export async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseOverviewArgs(args);
    if (options.help) {
      console.log("node scripts/setup-overview.mjs [--enable | --disable] [--profile /absolute/manifest.json] [--studio-app /absolute/Ulanzi.app] [--dry-run] [--lang en|zh] [--json]");
      console.log(messages[options.language].status);
      return;
    }
    const report = await configureOverview(options);
    const message = messages[options.language][report.message];
    if (options.json) console.log(JSON.stringify({ ...report, message }, null, 2));
    else {
      console.log(message);
      console.log(`Studio: ${report.studioVersion || "—"} | ${report.enabled ? "enabled" : "disabled"}`);
      for (const profile of report.profiles || []) console.log(`${profile.ready ? "✓" : "!"} ${profile.profilePath}${profile.reason ? `\n  ${messages[options.language][profile.reason]}` : ""}`);
      if (report.incomplete) console.log(messages[options.language].scan_incomplete);
    }
    return report;
  } catch (error) {
    const language = options?.language || (["en", "zh"].includes(args[args.indexOf("--lang") + 1]) ? args[args.indexOf("--lang") + 1] : "en");
    const code = messages[language][error.code] ? error.code : "setup_failed";
    const report = { error: code, message: messages[language][code] };
    if (options?.json || args.includes("--json")) console.error(JSON.stringify(report));
    else {
      console.error(report.message);
      for (const profile of error.profiles || []) console.error(profile.profilePath);
    }
    process.exitCode = 1;
    return report;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
