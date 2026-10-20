import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_KEY_THEME, isAnimatedStatus, normalizeStatus } from "./key-art.js";

const runFile = promisify(execFile);
const ARTWORK_VERSION = "state-coretext-v3-short-label";
const FILE_PREFIX = "task-v2-";
const OWN_ARTIFACT = /^task-v[12]-[a-f0-9]{64}\.(gif|png)$/;
const MAX_MEMORY_ENTRIES = 64;
const MAX_DISK_ARTIFACTS = 96;
const MAX_ARTIFACT_BYTES = 512 * 1024;
function shortLabel(value) {
  const text = String(value ?? "").slice(0, 512).replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, "").normalize("NFC");
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean).slice(0, 2);
  const label = lines.join("\n");
  return Buffer.byteLength(label, "utf8") <= 256 ? label : "";
}

function conversationIdentifier(value) {
  const identifier = String(value ?? "").trim();
  return /^\d{1,4}$/.test(identifier) && Number(identifier) <= 4096 ? identifier : "";
}

/**
 * Bake the compact title and stable conversation number into every image frame. Studio's text
 * layer adds a thick black stroke; sending this artwork with showtext:false
 * preserves clean CoreText glyphs and the GIF's continuous ribbon motion.
 *
 * Only a hash is persisted in filenames. Work is serialized and equal pending
 * requests share one job; bridge polling never re-encodes an existing artwork.
 */
export function createTaskArtwork({ pluginRoot, theme = DEFAULT_KEY_THEME } = {}) {
  if (!pluginRoot) throw new TypeError("Task artwork requires a plugin root");
  if (theme !== DEFAULT_KEY_THEME) throw new TypeError(`Only the installed ${DEFAULT_KEY_THEME} artwork theme is available`);
  const root = resolve(pluginRoot);
  const cacheRoot = resolve(root, ".key-cache");
  const helper = resolve(root, "runtime", "key-glyph-renderer");
  const memory = new Map();
  const pending = new Map();
  const sourceFingerprints = new Map();
  let queue = Promise.resolve();
  let initialized;
  let temporarySequence = 0;

  async function initialize() {
    await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
    const info = await lstat(cacheRoot);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Task artwork cache must be a directory");
    await chmod(cacheRoot, 0o700);
  }

  function remember(key, artwork) {
    memory.delete(key);
    memory.set(key, artwork);
    while (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value);
    return artwork;
  }

  async function cachedFileExists(file) {
    try {
      const info = await lstat(file);
      return info.isFile() && info.size > 0 && info.size <= MAX_ARTIFACT_BYTES;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async function prune() {
    // This directory belongs to the plugin; unrelated files are never removed.
    const entries = (await readdir(cacheRoot, { withFileTypes: true }))
      .filter(entry => entry.isFile() && OWN_ARTIFACT.test(entry.name));
    if (entries.length <= MAX_DISK_ARTIFACTS) return;
    const protectedFiles = new Set([...memory.values()].map(value => basename(value.gifpath ?? value.path)));
    const artifacts = [];
    for (const entry of entries) {
      if (protectedFiles.has(entry.name)) continue;
      try {
        const info = await stat(resolve(cacheRoot, entry.name));
        artifacts.push({ name: entry.name, modified: info.mtimeMs });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    artifacts.sort((left, right) => left.modified - right.modified || left.name.localeCompare(right.name));
    for (const artifact of artifacts.slice(0, entries.length - MAX_DISK_ARTIFACTS)) {
      await rm(resolve(cacheRoot, artifact.name), { force: true });
    }
  }

  async function renderOne(key, status, label, identifier) {
    initialized ??= initialize().catch(error => { initialized = undefined; throw error; });
    await initialized;
    const animated = isAnimatedStatus(status);
    const extension = animated ? "gif" : "png";
    const background = resolve(root, "assets", "neon", `task-${status}.${extension}`);
    if (!sourceFingerprints.has(background)) {
      const fingerprint = readFile(background).then(bytes => createHash("sha256").update(bytes).digest("hex"));
      sourceFingerprints.set(background, fingerprint);
      fingerprint.catch(() => sourceFingerprints.delete(background));
    }
    // A rebuilt palette gets new cache files even when status and title stay
    // the same. Each source is read once per plugin process, never per poll.
    const fileKey = createHash("sha256").update(key).update(await sourceFingerprints.get(background)).digest("hex");
    const filename = `${FILE_PREFIX}${fileKey}.${extension}`;
    const relative = `.key-cache/${filename}`;
    const artwork = Object.freeze(animated ? { type: 4, gifpath: relative } : { type: 2, path: relative });
    const destination = resolve(cacheRoot, filename);
    if (!await cachedFileExists(destination)) {
      const temporary = resolve(cacheRoot, `${filename}.${process.pid}.${temporarySequence++}.tmp`);
      try {
        await runFile(helper, [background, temporary, label, identifier], {
          timeout: 5_000,
          maxBuffer: 4096,
          windowsHide: true
        });
        if (!await cachedFileExists(temporary)) throw new Error("Task artwork renderer produced an invalid image");
        await chmod(temporary, 0o600);
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    remember(key, artwork);
    await prune();
    return artwork;
  }

  function render(statusValue, labelValue = "", identifierValue = "") {
    const status = normalizeStatus(statusValue);
    const label = shortLabel(labelValue);
    const identifier = conversationIdentifier(identifierValue);
    const key = createHash("sha256").update(JSON.stringify([ARTWORK_VERSION, theme, status, label, identifier])).digest("hex");
    if (memory.has(key)) return Promise.resolve(remember(key, memory.get(key)));
    if (pending.has(key)) return pending.get(key);
    const operation = queue.then(() => renderOne(key, status, label, identifier));
    queue = operation.catch(() => {});
    pending.set(key, operation);
    operation.then(() => pending.delete(key), () => pending.delete(key));
    return operation;
  }
  return Object.freeze({ render });
}
