import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConversationLabels, normalizeConversationAlias } from "../plugin/conversation-labels.js";

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-conversation-labels-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "conversation-labels.json");
  return { directory, filePath, labels: createConversationLabels({ filePath, ...options }) };
}

test("identifiers persist with conversations when their key positions change", async t => {
  const { labels, filePath } = await fixture(t);
  await labels.ensure(["chat-a", "chat-b", "chat-c"]);
  assert.deepEqual(labels.get("chat-a"), { identifier: "01", alias: "" });
  await labels.setAlias("chat-b", "网页\n改版");
  const reopened = createConversationLabels({ filePath });
  await reopened.ensure(["chat-c", "chat-b", "chat-d"]);
  assert.deepEqual(reopened.get("chat-b"), { identifier: "02", alias: "网页\n改版" });
  assert.equal(reopened.get("chat-c").identifier, "03");
  assert.equal(reopened.get("chat-d").identifier, "04");
  assert.equal(reopened.get("chat-a").identifier, "01");
  const stored = JSON.parse(await readFile(filePath, "utf8"));
  assert.deepEqual(Object.keys(stored.entries[0]).sort(), ["number", "threadKey"]);
  assert.equal(stored.nextNumber, 5);
});

test("duplicate and concurrent registrations produce unique sequential identifiers", async t => {
  const { labels } = await fixture(t);
  await Promise.all([
    labels.ensure(["a", "a", "b"]),
    labels.ensure(["b", "c"]),
    labels.setAlias("b", "API"),
    labels.ensure(Array.from({ length: 100 }, (_, index) => `extra-${index}`))
  ]);
  assert.deepEqual(labels.get("b"), { identifier: "02", alias: "API" });
  assert.equal(labels.get("extra-95").identifier, "99");
  assert.equal(labels.get("extra-96").identifier, "100");
  const copy = labels.get("b");
  copy.alias = "changed outside";
  assert.equal(labels.get("b").alias, "API");
});

test("aliases preserve complete graphemes, allow two lines, and reset without renumbering", async t => {
  const { labels } = await fixture(t);
  const emoji = "👩🏽‍💻";
  assert.equal(normalizeConversationAlias(emoji.repeat(16)), emoji.repeat(16));
  assert.throws(() => normalizeConversationAlias(emoji.repeat(17)), /16/);
  assert.equal(normalizeConversationAlias("  修复 API\r\n上线  "), "修复 API\n上线");
  for (const invalid of ["one\ntwo\nthree", "bad\u0000name", "bad\tname", "bad\u0085name", "bad\u2028name", 42]) {
    assert.throws(() => normalizeConversationAlias(invalid));
  }
  await labels.setAlias("a", "e\u0301\nAPI");
  assert.deepEqual(await labels.setAlias("a", "  "), { identifier: "01", alias: "" });
  await assert.rejects(labels.setAlias("b", "x".repeat(17)));
  assert.equal(labels.get("b"), null);
});

test("capacity and invalid keys fail without evicting or reassigning existing identifiers", async t => {
  const { labels, filePath } = await fixture(t, { maxEntries: 2 });
  await labels.ensure(["a", "b"]);
  const before = await readFile(filePath, "utf8");
  await assert.rejects(labels.ensure(["c"]), { code: "LABEL_CAPACITY_REACHED" });
  await assert.rejects(labels.ensure(["new", "bad\nkey"]));
  await assert.rejects(labels.setAlias("c", "new"), { code: "LABEL_CAPACITY_REACHED" });
  assert.equal(await readFile(filePath, "utf8"), before);
  assert.equal(labels.get("a").identifier, "01");
  assert.equal(labels.get("b").identifier, "02");
  assert.equal(labels.get("c"), null);
  await labels.setAlias("a", "existing");
  assert.equal(labels.get("a").alias, "existing");
});

test("invalid or conflicting stored data is never overwritten", async t => {
  const { filePath } = await fixture(t);
  const badData = JSON.stringify({ version: 1, nextNumber: 3, entries: [
    { threadKey: "a", number: 1 }, { threadKey: "b", number: 1 }
  ] });
  await writeFile(filePath, badData);
  const labels = createConversationLabels({ filePath });
  await assert.rejects(labels.ensure(["c"]), { code: "INVALID_LABEL_REGISTRY" });
  await assert.rejects(labels.setAlias("a", "change"));
  assert.equal(await readFile(filePath, "utf8"), badData);
});

test("atomic writes use private permissions and leave no temporary files", async t => {
  const { labels, directory, filePath } = await fixture(t);
  await chmod(directory, 0o755);
  await labels.ensure(["a"]);
  await labels.setAlias("a", "网站");
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), ["conversation-labels.json"]);
});
