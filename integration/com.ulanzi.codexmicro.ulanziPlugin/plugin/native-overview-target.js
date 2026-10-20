import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export const DEFAULT_OVERVIEW_CONFIG_PATH = resolve(homedir(), "Library/Application Support/OpenCodexMicro/deck-overview.json");
export const DEFAULT_STUDIO_PROFILES_ROOT = resolve(homedir(), "Library/Application Support/Ulanzi/UlanziDeck/ProfilesV2");
export const SUPPORTED_OVERVIEW_STUDIO_VERSION = "3.4.4";
export const OVERVIEW_PLUGIN_UUID = "com.ulanzi.ulanzistudio.codexmicro";
const NATIVE_WINDOW_ACTION = "com.ulanzi.ulanzideck.smallwindow.window";
const MAX_JSON_BYTES = 1024 * 1024;
const UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

function invalid(message, code = "NATIVE_OVERVIEW_CONFIG") {
  return Object.assign(new Error(`Native overview: ${message}`), { code });
}

async function readBoundedJson(path, kind, { optional = false } = {}) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw invalid(`${kind} cannot be opened`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size <= 0 || info.size > MAX_JSON_BYTES) {
      throw invalid(`${kind} must be a nonempty JSON file of at most 1 MiB`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
    }
    // One extra byte detects growth while reading without allocating from a
    // changing file size or allowing readFile to consume an unbounded stream.
    const bytes = Buffer.alloc(info.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await file.read(bytes, count, bytes.length - count, null);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    if (count !== info.size) throw invalid(`${kind} changed while being read`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
    let value;
    try { value = JSON.parse(bytes.subarray(0, count).toString("utf8")); }
    catch { throw invalid(`${kind} is not valid JSON`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`); }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw invalid(`${kind} must contain a JSON object`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
    }
    return value;
  } finally {
    await file.close();
  }
}

/**
 * Resolve only an explicitly opted-in, previously verified Studio native
 * window. This never edits a profile or replaces any of the 13 plugin actions.
 * Unsupported hosts and user-selected backgrounds fail closed.
 */
export async function resolveNativeOverviewTarget({
  configPath = process.env.CODEX_MICRO_OVERVIEW_FILE || DEFAULT_OVERVIEW_CONFIG_PATH,
  profilesRoot = DEFAULT_STUDIO_PROFILES_ROOT,
  studioVersion
} = {}) {
  const config = await readBoundedJson(configPath, "config", { optional: true });
  if (config === null || config.enabled === false) return null;
  if (config.enabled !== true) throw invalid("enabled must be a boolean");
  if (config.studioVersion !== SUPPORTED_OVERVIEW_STUDIO_VERSION || studioVersion !== config.studioVersion) {
    throw invalid("Studio version is not the explicitly supported version", "NATIVE_OVERVIEW_VERSION");
  }
  if (typeof config.actionid !== "string" || !UUID.test(config.actionid)) throw invalid("actionid must be a UUID");
  if (typeof config.profilePath !== "string" || !isAbsolute(config.profilePath)
    || extname(config.profilePath).toLowerCase() !== ".json") {
    throw invalid("profilePath must be an absolute JSON path");
  }
  let root;
  let profilePath;
  try {
    [root, profilePath] = await Promise.all([realpath(profilesRoot), realpath(config.profilePath)]);
  } catch {
    throw invalid("profile or ProfilesV2 directory is unavailable", "NATIVE_OVERVIEW_PROFILE");
  }
  const location = relative(root, profilePath);
  if (!location || location === ".." || location.startsWith(`..${sep}`) || isAbsolute(location)
    || extname(profilePath).toLowerCase() !== ".json") {
    throw invalid("profile must remain inside Studio ProfilesV2", "NATIVE_OVERVIEW_PROFILE");
  }
  const profile = await readBoundedJson(profilePath, "profile");
  const controllers = Array.isArray(profile.Controllers)
    ? profile.Controllers.filter(controller => controller?.Type === "Keypad") : [];
  if (controllers.length !== 1) throw invalid("profile must have one Keypad controller", "NATIVE_OVERVIEW_PROFILE");
  const window = controllers[0].Actions?.["3_2"];
  if (window?.Action !== NATIVE_WINDOW_ACTION || window.ActionID !== config.actionid) {
    throw invalid("native window assignment no longer matches", "NATIVE_OVERVIEW_PROFILE");
  }
  if (window.ActionParam?.SmallViewMode !== 2) {
    throw invalid("native window is not in background-only mode", "NATIVE_OVERVIEW_PROFILE");
  }
  if (!Array.isArray(window.ViewParam) || window.ViewParam.length !== 1
    || window.ViewParam[0]?.Icon !== "" || window.ViewParam[0]?.IconRel !== "") {
    throw invalid("native window has a user-selected background", "NATIVE_OVERVIEW_PROFILE");
  }
  return Object.freeze({ uuid: OVERVIEW_PLUGIN_UUID, actionid: window.ActionID, key: "3_2" });
}
