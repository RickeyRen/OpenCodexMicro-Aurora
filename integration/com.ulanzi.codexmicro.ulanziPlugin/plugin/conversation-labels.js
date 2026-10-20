import { chmod, lstat, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const MAX_ALIAS_GRAPHEMES = 16;
const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function invalid(message, code = "INVALID_CONVERSATION_LABEL") {
  return Object.assign(new Error(message), { code });
}

function validThreadKey(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 512 || /[\p{Cc}\u2028\u2029]/u.test(value)) {
    throw invalid("Invalid conversation identifier.");
  }
  return value;
}

export function normalizeConversationAlias(value) {
  if (typeof value !== "string") throw invalid("The short name must be text.");
  const alias = value.replace(/\r\n?/g, "\n").trim();
  if (/[\p{Cc}\u2028\u2029]/u.test(alias.replace(/\n/g, ""))) {
    throw invalid("The short name cannot contain control characters.");
  }
  if (alias.split("\n").length > 2) throw invalid("Use at most two lines for the short name.");
  if ([...segmenter.segment(alias)].length > MAX_ALIAS_GRAPHEMES) {
    throw invalid(`Use at most ${MAX_ALIAS_GRAPHEMES} characters for the short name.`);
  }
  return alias;
}

function metadata(entry) {
  return { identifier: String(entry.number).padStart(2, "0"), alias: entry.alias };
}

/** Persistent identifiers belong to conversations, never to their current key positions. */
export function createConversationLabels({
  filePath = path.join(os.homedir(), "Library/Application Support/OpenCodexMicro/conversation-labels.json"),
  maxEntries = 4096
} = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096) {
    throw invalid("Invalid conversation label capacity.");
  }
  const resolvedPath = path.resolve(filePath);
  let entries = new Map();
  let nextNumber = 1;
  let loadPromise;
  let queue = Promise.resolve();

  async function load() {
    if (!loadPromise) loadPromise = (async () => {
      let source;
      try {
        if ((await stat(resolvedPath)).size > MAX_REGISTRY_BYTES) throw invalid("Conversation label file is too large.", "INVALID_LABEL_REGISTRY");
        source = await readFile(resolvedPath, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
      }
      let data;
      try { data = JSON.parse(source); } catch { throw invalid("Conversation label file is invalid.", "INVALID_LABEL_REGISTRY"); }
      if (data?.version !== 1 || !Array.isArray(data.entries) || data.entries.length > maxEntries || !Number.isSafeInteger(data.nextNumber) || data.nextNumber < 1 || data.nextNumber > maxEntries + 1) {
        throw invalid("Conversation label file has an unsupported format.", "INVALID_LABEL_REGISTRY");
      }
      const loaded = new Map();
      const numbers = new Set();
      for (const entry of data.entries) {
        const key = validThreadKey(entry?.threadKey);
        const alias = normalizeConversationAlias(entry.alias ?? "");
        if (!Number.isSafeInteger(entry.number) || entry.number < 1 || entry.number >= data.nextNumber || loaded.has(key) || numbers.has(entry.number)) {
          throw invalid("Conversation label file contains conflicting identifiers.", "INVALID_LABEL_REGISTRY");
        }
        loaded.set(key, { number: entry.number, alias });
        numbers.add(entry.number);
      }
      entries = loaded;
      nextNumber = data.nextNumber;
    })();
    return loadPromise;
  }

  async function persist(updated, next) {
    const directory = path.dirname(resolvedPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw invalid("Conversation labels need a local directory.");
    await chmod(directory, 0o700);
    const temporary = `${resolvedPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    let handle;
    try {
      handle = await open(temporary, "wx", 0o600);
      const source = JSON.stringify({ version: 1, nextNumber: next, entries: [...updated].map(([threadKey, entry]) => ({ threadKey, number: entry.number, ...(entry.alias ? { alias: entry.alias } : {}) })) }, null, 2);
      if (Buffer.byteLength(source) > MAX_REGISTRY_BYTES) throw invalid("Conversation label file is too large.", "LABEL_CAPACITY_REACHED");
      await handle.writeFile(`${source}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, resolvedPath);
    } finally {
      await handle?.close();
      await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }

  function serialize(operation) {
    const pending = queue.then(async () => { await load(); return operation(); });
    queue = pending.catch(() => {});
    return pending;
  }

  function addMissing(updated, keys) {
    const missing = keys.filter(key => !updated.has(key));
    if (updated.size + missing.length > maxEntries || nextNumber + missing.length > Number.MAX_SAFE_INTEGER) {
      throw invalid("Conversation label capacity was reached; existing identifiers were kept.", "LABEL_CAPACITY_REACHED");
    }
    let next = nextNumber;
    for (const key of missing) updated.set(key, { number: next++, alias: "" });
    return next;
  }

  return {
    filePath: resolvedPath,
    get(threadKey) {
      const entry = entries.get(validThreadKey(threadKey));
      return entry ? metadata(entry) : null;
    },
    async ensure(threadKeys) {
      if (!Array.isArray(threadKeys)) throw invalid("Conversation identifiers must be an array.");
      const keys = [...new Set(threadKeys.map(validThreadKey))];
      return serialize(async () => {
        const updated = new Map(entries);
        const next = addMissing(updated, keys);
        if (next !== nextNumber) {
          await persist(updated, next);
          entries = updated;
          nextNumber = next;
        }
        return new Map(keys.map(key => [key, metadata(entries.get(key))]));
      });
    },
    async setAlias(threadKey, value) {
      const key = validThreadKey(threadKey);
      const alias = normalizeConversationAlias(value);
      return serialize(async () => {
        const updated = new Map(entries);
        const next = addMissing(updated, [key]);
        const previous = updated.get(key);
        if (next !== nextNumber || previous.alias !== alias) {
          updated.set(key, { ...previous, alias });
          await persist(updated, next);
          entries = updated;
          nextNumber = next;
        }
        return metadata(entries.get(key));
      });
    }
  };
}
