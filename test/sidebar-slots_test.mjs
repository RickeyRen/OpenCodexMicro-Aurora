import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CodexCdpClient } from "../src/bridge/codex-cdp.mjs";
import { mergeDashboardSlots, readSidebarThreads } from "../src/bridge/sidebar-slots.mjs";

const SIGNALS_URL = "app://codex/assets/codex-micro-slot-signals-current.js";
// A minimal structural fixture; aliases intentionally differ from the installed
// app so tests catch accidental dependencies on minified export identifiers.
const MODULE_TEXT = [
  'import{Side as y,Desc as z,Title as re,Attention as ge,Status as me,Live as pe,Summary as de,Host as ee}from"./app-initial-current.js";',
  'let t=e(y,`codex`);',
  'let a=e(z,t);if(a==null)return[];switch(a.kind){}',
  'title:e(re,l),localStatus:{attention:e(ge,{conversationId:a.summary.conversationId,hostId:c}),status:e(me,{hostId:c,conversationId:a.summary.conversationId})}',
  'd=e(pe,l)?.summary??e(de,{hostId:c,conversationId:a.summary.conversationId});',
  'c=a.summary.hostId??e(ee,a.summary.conversationId)'
].join("");

function fixture(entries) {
  const byKey = new Map(entries.map((entry) => [entry.threadKey, entry]));
  const family = (read) => ({ resolve: (_node, _context, argument) => ({ resolve: () => ({ value: read(argument) }) }) });
  const find = (argument) => entries.find((entry) => entry.id === (argument.threadId ?? argument.conversationId));
  const namespace = {
    Side: family(() => ({ threadStateKeys: [...byKey.keys()] })),
    Desc: family((key) => byKey.get(key).descriptor ?? ({
      kind: "local", summary: { conversationId: byKey.get(key).id, hostId: "local", title: "实际对话", updatedAt: 20 }
    })),
    Title: family(() => assert.fail("Formatted display titles may contain a project-name fallback")),
    Attention: family((argument) => find(argument).attention ?? null),
    Status: family((argument) => find(argument).status),
    Live: family((argument) => ({ summary: find(argument).liveSummary ?? { hasUnreadTurn: !!find(argument).unread } })),
    Summary: family((argument) => find(argument).summary ?? null),
    Host: family(() => "local")
  };
  let reads = 0;
  const source = { node: { store: { get: (atom) => atom.value } }, contextMap: new Map() };
  const options = {
    urls: [SIGNALS_URL],
    importModule: async (url) => {
      assert.equal(url, "app://codex/assets/app-initial-current.js");
      return namespace;
    },
    readModuleText: async () => { reads += 1; return MODULE_TEXT; }
  };
  return { source, options, reads: () => reads };
}

test("reads real sidebar status metadata and keeps unknown states explicit", async () => {
  const input = [
    { id: "1", threadKey: "local:1", status: "loading" },
    { id: "2", threadKey: "local:2", status: "idle", unread: true },
    { id: "3", threadKey: "local:3", status: "idle", attention: { kind: "approval" } },
    { id: "4", threadKey: "local:4", status: "idle", attention: { kind: "input" } },
    { id: "5", threadKey: "local:5", status: "error" },
    { id: "6", threadKey: "local:6", status: "idle" },
    { id: "7", threadKey: "local:7", status: "unrecognized" }
  ];
  const f = fixture(input);
  const rows = await readSidebarThreads(f.source, f.options);
  assert.deepEqual(rows.map((row) => row.status), ["working", "unread", "awaiting-approval", "awaiting-response", "error", "idle", "unknown"]);
  assert.equal(rows[0].title, "实际对话");
  assert.equal(rows[0].hostId, "local");
  await readSidebarThreads(f.source, f.options);
  assert.equal(f.reads(), 1, "Module discovery is cached between refreshes");
  assert.deepEqual(Object.keys(rows[0]).sort(), ["hostId", "recencyAt", "source", "status", "threadKey", "title"]);
});

test("uses raw conversation titles instead of formatted project or path labels", async () => {
  const input = [
    { id: "1", threadKey: "local:1", status: "loading", title: "/Users/example/DEMO", liveSummary: { title: "修复登录问题" } },
    { id: "2", threadKey: "local:2", status: "idle", title: "DEMO", summary: { title: "更新账户设置" } },
    { id: "3", threadKey: "local:3", status: "idle", title: "DEMO", descriptor: {
      kind: "local", summary: { conversationId: "3", hostId: "local", title: "构建搜索页面" }
    } }
  ];
  const f = fixture(input);
  const rows = await readSidebarThreads(f.source, f.options);
  assert.deepEqual(rows.map((row) => row.title), ["修复登录问题", "更新账户设置", "构建搜索页面"]);
  input[0].liveSummary.title = "修复会话重命名刷新";
  assert.equal((await readSidebarThreads(f.source, f.options))[0].title, "修复会话重命名刷新", "Title metadata is refreshed rather than cached with the module");
});

test("keeps untitled chats null even when older metadata or display labels have names", async () => {
  const f = fixture([
    { id: "1", threadKey: "local:1", status: "idle", title: "DEMO", liveSummary: { title: null }, summary: { title: "旧标题" } },
    { id: "2", threadKey: "local:2", status: "idle", title: "/Users/example/DEMO", liveSummary: { title: "   " } },
    { id: "3", threadKey: "local:3", status: "idle", title: "DEMO", descriptor: {
      kind: "local", summary: { conversationId: "3", hostId: "local", cwd: "/Users/example/DEMO" }
    } }
  ]);
  const rows = await readSidebarThreads(f.source, f.options);
  assert.deepEqual(rows.map((row) => row.title), [null, null, null]);
  assert.ok(rows.every((row) => row.status === "idle"), "Untitled metadata does not change conversation state");
});

test("rejects cwd-filled list-summary titles without rejecting genuine path-shaped conversation names", async () => {
  const cwd = "/Users/example/代码仓库/DEMO";
  const descriptor = (id, title = cwd) => ({
    kind: "local", summary: { conversationId: id, hostId: "local", title, cwd }
  });
  const f = fixture([
    // Matches the official listState projection: live.summary is metadata, with
    // a full cwd substituted for an untitled chat and no top-level live.title.
    { id: "1", threadKey: "local:1", status: "idle", descriptor: descriptor("1"), liveSummary: { title: cwd, cwd, hasUnreadTurn: false } },
    { id: "2", threadKey: "local:2", status: "idle", descriptor: descriptor("2") },
    { id: "3", threadKey: "local:3", status: "idle", descriptor: descriptor("3"), summary: { title: cwd, cwd } },
    { id: "4", threadKey: "local:4", status: "loading", descriptor: descriptor("4"), liveSummary: { title: cwd } },
    { id: "5", threadKey: "local:5", status: "idle", descriptor: descriptor("5", "/Users/example/另一个真实对话名") },
    { id: "6", threadKey: "local:6", status: "idle", descriptor: descriptor("6", "DEMO") },
    { id: "7", threadKey: "local:7", status: "idle", descriptor: descriptor("7", "修复 DEMO 登录") }
  ]);
  const rows = await readSidebarThreads(f.source, f.options);
  assert.deepEqual(rows.map((row) => row.title), [null, null, null, null, "/Users/example/另一个真实对话名", "DEMO", "修复 DEMO 登录"]);
  assert.equal(rows[3].status, "working", "Rejecting a cwd fallback must not affect runtime state");
});

test("remote tasks retain their actual task titles", async () => {
  const f = fixture([{ threadKey: "remote:task", descriptor: { kind: "remote", task: {
    title: "审核 API 变更", task_status_display: { latest_turn_status_display: { turn_status: "in_progress" } }
  } } }]);
  const [row] = await readSidebarThreads(f.source, f.options);
  assert.equal(row.title, "审核 API 变更");
  assert.equal(row.status, "working");
});

test("fails closed when an official module no longer exposes the required metadata signals", async () => {
  const f = fixture([]);
  await assert.rejects(readSidebarThreads(f.source, { ...f.options, readModuleText: async () => "unrecognized" }), /unsupported/);
});

test("retains six native slots and adds seven distinct chats without duplicating a native assignment", () => {
  const native = Array.from({ length: 6 }, (_, id) => ({ id, threadKey: `local:${id}`, status: "idle" }));
  const rows = Array.from({ length: 20 }, (_, index) => ({ threadKey: `local:${index}`, status: index === 19 ? "working" : "idle", hostId: "local", recencyAt: 20 - index }));
  const slots = mergeDashboardSlots(native, rows);
  assert.equal(slots.length, 13);
  assert.deepEqual(slots.slice(0, 6).map((slot) => slot.threadKey), native.map((slot) => slot.threadKey));
  assert.equal(new Set(slots.map((slot) => slot.threadKey)).size, 13);
  assert.equal(slots[6].threadKey, "local:19", "A running extra chat takes precedence over idle history");
  assert.ok(slots.slice(6).every((slot) => slot.nativeSlot === null));
  const updated = mergeDashboardSlots(native, rows.map((row) => ({ ...row, recencyAt: 1 })), slots);
  assert.deepEqual(updated.map((slot) => slot.threadKey), slots.map((slot) => slot.threadKey));
  const empty = mergeDashboardSlots(native, []);
  assert.ok(empty.slice(6).every((slot) => slot.status === "off" && slot.threadKey === null));
});

test("native slots receive actual sidebar titles while keeping their positions, state and actions", () => {
  const native = [
    { id: 0, threadKey: "local:one", title: "/Users/example/DEMO", status: "working", selected: true },
    { id: 1, threadKey: "local:two", title: "DEMO", status: "idle", selected: false },
    { id: 2, threadKey: "local:three", title: "DEMO", status: "unread", selected: false }
  ];
  const rows = [
    { threadKey: "local:one", title: "修复登录", hostId: "local", status: "working" },
    { threadKey: "local:two", title: null, hostId: "local", status: "idle" }
  ];
  const slots = mergeDashboardSlots(native, rows);
  assert.deepEqual(slots.slice(0, 3).map((slot) => slot.title), ["修复登录", null, null]);
  for (let index = 0; index < native.length; index += 1) {
    assert.equal(slots[index].threadKey, native[index].threadKey);
    assert.equal(slots[index].nativeSlot, native[index].id);
    assert.equal(slots[index].status, native[index].status);
    assert.equal(slots[index].selected, native[index].selected);
  }
  assert.deepEqual(mergeDashboardSlots(native, []).slice(0, 3).map((slot) => slot.title), [null, null, null], "Unsupported sidebar metadata must not restore unverified native project labels");
});

test("extended slots navigate the verified chat directly and never emit an unsupported Micro key", async () => {
  const client = new CodexCdpClient();
  client.connect = async () => {};
  client.lastSnapshot = { slots: Array.from({ length: 13 }, (_, id) => ({ threadKey: `local:${id}`, hostId: "local" })) };
  const calls = [];
  client.activateThread = async (...args) => calls.push(args);
  client.dispatchAgent = async () => assert.fail("Extra slots must never dispatch native HID keys");
  await client.clickAgent(12);
  assert.deepEqual(calls, [["local:12", true]]);
  client.lastSnapshot.slots[12].hostId = "remote-host";
  await assert.rejects(client.clickAgent(12), /verified local chats/);
  await assert.rejects(client.clickAgent(13), /Invalid/);
});

test("stale extra-slot thread requests fail instead of opening a different chat", async () => {
  const client = new CodexCdpClient();
  client.connect = async () => {};
  client.lastSnapshot = { slots: Array.from({ length: 13 }, () => ({ threadKey: "local:another-chat", hostId: "local" })) };
  client.activateThread = async () => assert.fail("A stale slot must not navigate");
  await assert.rejects(client.clickThread("f6805b8a-332a-43a0-a118-52d3e59542f6", 6), /assignment changed/);
});

test("extra-slot navigation refuses duplicate or hidden sidebar rows", async () => {
  const client = new CodexCdpClient();
  let clicks = 0;
  const row = {
    offsetParent: {},
    getAttribute: () => "local:chat",
    matches: () => true,
    click: () => { clicks += 1; }
  };
  let rows = [row, row];
  client.evaluate = (expression) => vm.runInNewContext(expression, {
    document: { querySelector: () => null, querySelectorAll: () => rows }
  });
  await assert.rejects(client.activateThread("local:chat", true), /one visible sidebar/);
  rows = [{ ...row, offsetParent: null }];
  await assert.rejects(client.activateThread("local:chat", true), /visible in the sidebar/);
  assert.equal(clicks, 0);
});
