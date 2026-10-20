import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";

const packageRootUrl = new URL("..", import.meta.url);
const runtimeRootUrl = process.env.PLUGIN_RUNTIME_ROOT
  ? pathToFileURL(`${process.env.PLUGIN_RUNTIME_ROOT.replace(/\/$/, "")}/`)
  : packageRootUrl;
const manifest = JSON.parse(await readFile(new URL("manifest.json", packageRootUrl)));
const navigateAction = manifest.Actions.find(action =>
  action.UUID === "com.ulanzi.ulanzistudio.codexmicro.navigate"
);
assert.deepEqual(navigateAction?.Controllers, ["Encoder"]);
assert.equal(navigateAction?.Encoder?.layout, "$UA1");
assert.equal(manifest.Version, "0.5.0");
assert.equal(manifest.Name, "Codex Micro · Aurora");
assert.equal(manifest.Author, "RickeyRen + upstream contributors");
assert.equal(manifest.UUID, "com.ulanzi.ulanzistudio.codexmicro");
assert.match(manifest.Description, /Aurora Silk/);
assert.match(manifest.Description, /remaining allowance/);
assert.match(manifest.Description, /Apple Silicon/);
assert.match(manifest.Description, /npm run setup:overview -- --enable/);
assert.deepEqual(
  manifest.Actions.map(action => action.UUID.split(".").at(-1)),
  ["task1", "task2", "task3", "task4", "task5", "fast", "usage", "pin", "new", "navigate", "fork", "steer", "mic", "submit", "task6", "task7", "task8", "task9", "task10", "task11", "task12", "task13"],
  "tasks 7–13 must be appended without changing the existing 15 action UUIDs or order"
);
assert.equal(manifest.Actions.length, 22);
for (const action of manifest.Actions.slice(14)) assert.deepEqual(action.Controllers, ["Keypad"]);
assert.equal(manifest.Software?.MinVersion, "3.4.4");
assert.equal(manifest.OS?.find(item => item.Platform === "mac")?.MinimumVersion, "13.0");
assert.ok(
  manifest.Actions.every(action => action.PropertyInspectorPath === "property-inspector/setup.html"),
  "every action must expose the shared Bridge setup inspector"
);
const setupInspector = await readFile(new URL("property-inspector/setup.html", packageRootUrl), "utf8");
assert.match(setupInspector, /Codex Bridge Setup/);
assert.match(setupInspector, /Install \/ Repair/);
assert.match(setupInspector, /bridgeSetup/);
const setupScript = setupInspector.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(setupScript, "setup inspector must contain its client script");
assert.doesNotThrow(() => new Function(setupScript), "setup inspector script must parse");
for (const asset of [
  "installer/bridge.mjs",
  "installer/CodexBridge.png",
  "installer/LICENSE",
  "installer/NOTICE.md",
  "installer/THIRD_PARTY_NOTICES.md"
]) {
  assert.ok((await readFile(new URL(asset, packageRootUrl))).length > 0, `${asset} must be bundled`);
}
assert.match(manifest.Overview, /Ulanzi D200H/);
assert.match(manifest.Description, /INSTALLATION ENVIRONMENT/);
assert.match(manifest.Description, /LLM \/ AGENT INSTALLATION/);
assert.match(manifest.Description, /MANUAL INSTALLATION/);
assert.match(manifest.Description, /Latest Task & Scroll Encoder/);
assert.match(
  manifest.Description,
  /Install the Ulanzi Studio plugin for me: https:\/\/github\.com\/RickeyRen\/OpenCodexMicro-Aurora#1-llm--agent-installation/
);
assert.match(manifest.Description, /always launch Codex through ~\/Applications\/Codex Bridge\.app/i);
assert.match(manifest.Description, /open ~\/Applications\/Codex\\ Bridge\.app$/);

const localizedActionNames = {
  "en.json": ["Codex Task 1", "Latest Task & Scroll", "Submit to Codex"],
  "zh_CN.json": ["Codex 任务 1", "最新任务与滚动", "提交到 Codex"],
  "zh_HK.json": ["Codex 任務 1", "最新任務與捲動", "提交至 Codex"],
  "ja_JP.json": ["Codex タスク 1", "最新タスクとスクロール", "Codex に送信"],
  "de_DE.json": ["Codex-Aufgabe 1", "Letzte Aufgabe & Scrollen", "An Codex senden"],
  "ko_KR.json": ["Codex 작업 1", "최신 작업 및 스크롤", "Codex에 제출"],
  "pt_PT.json": ["Tarefa Codex 1", "Tarefa recente e deslocamento", "Enviar para o Codex"],
  "es_ES.json": ["Tarea Codex 1", "Tarea reciente y desplazamiento", "Enviar a Codex"]
};

const localizedInstallPrompts = {
  "en.json": "Install the Ulanzi Studio plugin for me:",
  "zh_CN.json": "替我安装一下UlanziStudio插件：",
  "zh_HK.json": "請替我安裝 Ulanzi Studio 外掛程式：",
  "ja_JP.json": "Ulanzi Studio プラグインをインストールしてください：",
  "de_DE.json": "Installiere bitte das Ulanzi-Studio-Plugin für mich:",
  "ko_KR.json": "Ulanzi Studio 플러그인을 설치해 주세요:",
  "pt_PT.json": "Instala o plugin do Ulanzi Studio por mim:",
  "es_ES.json": "Instálame el plugin de Ulanzi Studio:"
};

const llmInstallationLink =
  "https://github.com/RickeyRen/OpenCodexMicro-Aurora#1-llm--agent-installation";

for (const locale of [
  "en.json",
  "zh_CN.json",
  "zh_HK.json",
  "ja_JP.json",
  "de_DE.json",
  "ko_KR.json",
  "pt_PT.json",
  "es_ES.json"
]) {
  const messages = JSON.parse(await readFile(new URL(locale, packageRootUrl)));
  assert.equal(messages.Name, "Codex Micro · Aurora", `${locale} must localize Name`);
  assert.ok(messages.Overview?.length > 20, `${locale} must localize Overview`);
  assert.match(messages.Description, /https:\/\/github\.com\/RickeyRen\/OpenCodexMicro-Aurora/);
  assert.match(messages.Description, /npm run install:plugin/);
  assert.match(messages.Description, /npm run setup/);
  assert.match(messages.Description, /npm run setup:overview -- --enable/);
  assert.match(messages.Description, /Aurora Silk/);
  assert.match(messages.Description, /Studio 3\.4\.4/);
  assert.match(messages.Description, /Apple Silicon/);
  assert.match(messages.Overview, /D200H/);
  assert.match(messages.Description, /Latest Task & Scroll/);
  assert.ok(messages.Localization?.BridgeSetup?.length > 0, `${locale} must localize the setup page`);
  assert.ok(messages.Localization?.InstallRepair?.length > 0, `${locale} must localize Bridge installation`);
  assert.ok(messages.Localization?.UninstallBridge?.length > 0, `${locale} must localize Bridge uninstallation`);
  assert.ok(messages.Localization?.BridgeAppInfoTitle?.length > 0, `${locale} must explain Codex Bridge.app`);
  assert.ok(messages.Localization?.BackgroundActivityTitle?.length > 0, `${locale} must explain background activity`);
  assert.ok(messages.Localization?.NodeSelectionStrategy?.length > 0, `${locale} must explain Node selection`);
  assert.ok(messages.Localization?.UlanziNodeSignatureNotice?.length > 0, `${locale} must explain the Ulanzi Node signature`);
  assert.ok(
    messages.Description.includes(`${localizedInstallPrompts[locale]}${
      locale.startsWith("zh_") || locale === "ja_JP.json" ? "" : " "
    }${llmInstallationLink}`),
    `${locale} must localize the anchored LLM installation prompt`
  );
  assert.equal(messages.Actions?.length, manifest.Actions.length, `${locale} must localize every action`);
  assert.equal(messages.Actions?.length, 22, `${locale} must include all 13 task actions`);
  assert.ok(
    messages.Actions.every(action => action.Name?.length > 0 && action.Tooltip?.length > 0),
    `${locale} must localize every action name and tooltip`
  );
  assert.deepEqual(
    [messages.Actions[0].Name, messages.Actions[9].Name, messages.Actions[13].Name],
    localizedActionNames[locale],
    `${locale} action localization must follow manifest action order`
  );
  for (let task = 6; task <= 13; task += 1) {
    assert.equal(
      messages.Actions[14 + task - 6].Name,
      messages.Actions[4].Name.replace("5", String(task)),
      `${locale} must append the localized task ${task} action in the manifest order`
    );
  }
  assert.match(
    messages.Description.split("\n\n").at(-1),
    /open ~\/Applications\/Codex\\ Bridge\.app$/,
    `${locale} must end with the Bridge launch command`
  );
}

const bridgeRequests = [];
let connected = true;
const slots = [
  { id: 0, threadKey: "11111111-1111-1111-1111-111111111111", title: "Working task", status: "thinking" },
  { id: 1, threadKey: "22222222-2222-2222-2222-222222222222", title: "Unread task", status: "unread" },
  { id: 2, threadKey: "33333333-3333-3333-3333-333333333333", title: "Approval task", status: "awaiting-approval" },
  { id: 3, threadKey: "44444444-4444-4444-4444-444444444444", title: "Failed task", status: "error" },
  { id: 4, threadKey: "55555555-5555-5555-5555-555555555555", title: "Idle task", status: "idle" },
  { id: 5, threadKey: "66666666-6666-6666-6666-666666666666", title: "第六个中文会话的状态 👩🏽‍💻", status: "awaiting-response" },
  { id: 6, threadKey: "77777777-7777-7777-7777-777777777777", title: "七号会话正在运行", status: "working" },
  { id: 7, threadKey: "88888888-8888-8888-8888-888888888888", title: "八号空闲会话", status: "idle" },
  { id: 8, threadKey: "99999999-9999-9999-9999-999999999999", title: "九号完成会话", status: "unread" },
  { id: 9, threadKey: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title: "十号待审批会话", status: "awaiting-approval" },
  { id: 10, threadKey: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title: "构建失败会话", status: "failed" },
  { id: 11, threadKey: "cccccccc-cccc-cccc-cccc-cccccccccccc", title: "桥接服务会话", status: "idle" },
  { id: 12, threadKey: "dddddddd-dddd-dddd-dddd-dddddddddddd", title: "终端十三号会话", status: "thinking" }
];
const bridge = createServer((request, response) => {
  bridgeRequests.push(`${request.method} ${request.url}`);
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/health") {
    response.end(JSON.stringify({ ok: true, codexConnected: true, updatedAt: Date.now() }));
    return;
  }
  if (request.url === "/state") {
    response.end(JSON.stringify({
      connected,
      slots,
      usage: { windows: [{ kind: "weekly", remainingPercent: 23 }] }
    }));
    return;
  }
  response.end(JSON.stringify({ ok: true, bridge: true }));
});
await new Promise(resolve => bridge.listen(0, "127.0.0.1", resolve));
const bridgePort = bridge.address().port;

const host = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise(resolve => host.once("listening", resolve));
const hostPort = host.address().port;
const messages = [];
const displayItems = uuid => messages
  .filter(message => message.cmd === "state")
  .flatMap(message => message.param?.statelist || [])
  .filter(item => item.uuid === uuid);
const latestDisplay = uuid => displayItems(uuid).at(-1);
async function waitFor(predicate, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `Timed out: ${description}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
async function waitForPolls(count = 2) {
  const initial = bridgeRequests.filter(request => request === "GET /state").length;
  await waitFor(
    () => bridgeRequests.filter(request => request === "GET /state").length >= initial + count,
    `${count} Bridge polls`
  );
  // A request is recorded before its response is processed by the plugin.
  await new Promise(resolve => setTimeout(resolve, 50));
}
function decodeArtwork(item) {
  assert.equal(item?.type, 1);
  assert.equal(item?.showtext, false, "SVG controls must not add small native text");
  assert.equal(item?.textdata, "");
  assert.match(item?.data || "", /^data:image\/svg\+xml;base64,/);
  return Buffer.from(item.data.split(",")[1], "base64").toString();
}
function cachedTask(item, type, glyph) {
  const artwork = type === 4 ? item?.gifpath : item?.path;
  return item?.type === type && item?.showtext === false && item?.textdata === glyph && typeof artwork === "string" && /(?:^|[\\/])\.key-cache[\\/]/.test(artwork);
}
async function assertTaskArtwork(item, type, glyph) {
  assert.equal(item?.type, type);
  assert.equal(item?.showtext, false, "baked-in white glyphs must not receive Studio's outlined text overlay");
  assert.equal(item?.textdata, glyph, "the readable short label must remain available as semantic text");
  assert.equal(Object.hasOwn(item || {}, "state"), false, "task artwork must not send a state index");
  const asset = type === 4 ? item?.gifpath : item?.path;
  assert.equal(typeof asset, "string");
  const path = resolve(fileURLToPath(runtimeRootUrl), asset);
  assert.equal(dirname(path), resolve(fileURLToPath(runtimeRootUrl), ".key-cache"), "each final task image must come from this plugin's glyph cache");
  assert.match(basename(path), new RegExp(`^(?:task-v[0-9]+-)?[a-f0-9]+\\.${type === 4 ? "gif" : "png"}$`), "cache filenames must use a content hash instead of chat titles");
  const data = await readFile(path);
  if (type === 4) {
    assert.match(data.subarray(0, 6).toString("ascii"), /^GIF8[79]a$/, `${asset} must be a generated native GIF`);
  } else {
    assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${asset} must be a generated PNG`);
  }
  return asset;
}

const nodeBinary = process.env.PLUGIN_NODE_BINARY || process.execPath;
const pluginRoot = process.env.PLUGIN_RUNTIME_ROOT || new URL("..", import.meta.url);
const pluginEntrypoint = process.env.PLUGIN_ENTRYPOINT || "dist/app.js";
const labelTestRoot = await mkdtemp(resolve(tmpdir(), "codex-micro-smoke-labels-"));
const child = spawn(nodeBinary, [pluginEntrypoint, "127.0.0.1", String(hostPort), "en-US", "3.4.4"], {
  cwd: pluginRoot,
  env: { ...process.env, CODEX_BRIDGE_URL: `http://127.0.0.1:${bridgePort}`, CODEX_MICRO_LABELS_FILE: resolve(labelTestRoot, "labels.json"), CODEX_MICRO_OVERVIEW_FILE: resolve(labelTestRoot, "overview-disabled.json") },
  stdio: ["ignore", "pipe", "pipe"]
});
const childStopped = new Promise(resolve => child.once("close", resolve));

try {
  const client = await new Promise((resolve, reject) => {
    host.once("connection", resolve);
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`Plugin exited before connecting with code ${code}: ${child.stderr.read() || "no stderr"}`)));
  });
  client.on("message", raw => messages.push(JSON.parse(String(raw))));
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(messages[0]?.cmd, "connected");

  client.send(JSON.stringify({
    cmd: "sendToPlugin",
    uuid: "com.ulanzi.ulanzistudio.codexmicro.task1",
    actionid: "setup-action",
    key: "0_0",
    payload: { type: "bridgeSetup", action: "status" }
  }));
  await new Promise(resolve => setTimeout(resolve, 150));
  const setupStatus = messages.find(message =>
    message.cmd === "sendToPropertyInspector" &&
    message.actionid === "setup-action" &&
    message.payload?.type === "bridgeSetupStatus"
  );
  assert.equal(setupStatus?.payload?.status?.serviceOnline, true);
  assert.equal(setupStatus?.payload?.status?.cdpConnected, true);
  assert.equal(setupStatus?.payload?.status?.bundledVersion, "0.5.0");

  const taskTypes = [4, 2, 4, 4, 2, 4, 4, 2, 2, 4, 4, 2, 4];
  const taskGlyphs = ["Working\ntask", "Unread\ntask", "Approval\ntask", "Failed\ntask", "Idle\ntask", "第六个\n中文…", "七号会\n话正…", "八号空\n闲会话", "九号完\n成会话", "十号待\n审批…", "构建失\n败会话", "桥接服\n务会话", "终端十\n三号…"];
  for (let index = 0; index < taskTypes.length; index += 1) {
    client.send(JSON.stringify({
      cmd: "add",
      uuid: `com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`,
      actionid: `a${index + 1}`,
      key: `0_${index}`,
      param: {}
    }));
  }
  await waitFor(
    () => taskTypes.every((type, index) => cachedTask(latestDisplay(`com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`), type, taskGlyphs[index])),
    "all 13 short labels and identifiers are baked into their final native GIF / PNG files"
  );
  const initialTaskAssets = [];
  for (let index = 0; index < taskTypes.length; index += 1) {
    const taskUuid = `com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`;
    initialTaskAssets.push(await assertTaskArtwork(latestDisplay(taskUuid), taskTypes[index], taskGlyphs[index]));
  }
  assert.equal(new Set(initialTaskAssets).size, 13, "distinct conversation labels must receive distinct baked artwork even when their status color is the same");
  const initialTaskUpdates = taskTypes.map((_, index) => displayItems(`com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`).length);
  await waitForPolls();
  assert.deepEqual(
    taskTypes.map((_, index) => displayItems(`com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`).length),
    initialTaskUpdates,
    "unchanged Bridge polls must not resend artwork or restart native GIF playback"
  );

  // The seven extra keys are independent conversations, even where the old
  // six-slot profile placed Fast / Usage / other controls on the hardware.
  for (let index = 6; index < 13; index += 1) {
    const event = {
      uuid: `com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`,
      actionid: `a${index + 1}`,
      key: `0_${index}`,
      param: {}
    };
    client.send(JSON.stringify({ cmd: "keydown", ...event }));
    client.send(JSON.stringify({ cmd: "run", ...event }));
    client.send(JSON.stringify({ cmd: "keyup", ...event }));
  }
  await waitFor(
    () => bridgeRequests.filter(request => request.startsWith("POST /thread/")).length >= 7,
    "all seven additional task keys open their conversations"
  );
  await new Promise(resolve => setTimeout(resolve, 100));
  for (let index = 6; index < 13; index += 1) {
    assert.equal(
      bridgeRequests.filter(request => request === `POST /thread/${slots[index].threadKey}/click?slot=${index}`).length,
      1,
      `task ${index + 1} must open its exact thread once with zero-based slot ${index}, including keyup/run deduplication`
    );
  }
  assert.equal(bridgeRequests.filter(request => request.startsWith("POST /action/")).length, 0, "slots 7–13 must never invoke Fast or another control action");
  assert.equal(bridgeRequests.filter(request => request === "POST /focus").length, 0, "slots 7–13 must never invoke Usage");

  const task6Event = {
    uuid: "com.ulanzi.ulanzistudio.codexmicro.task6", actionid: "a6", key: "0_5", param: {}
  };
  const task6States = () => messages.filter(message =>
    message.cmd === "state" && message.param?.statelist?.[0]?.uuid === task6Event.uuid
  );
  assert.equal(task6States().at(-1)?.param?.statelist?.[0]?.textdata, "第六个\n中文…");
  client.send(JSON.stringify({ cmd: "keydown", ...task6Event }));
  client.send(JSON.stringify({ cmd: "run", ...task6Event }));
  client.send(JSON.stringify({ cmd: "keyup", ...task6Event }));
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(
    bridgeRequests.filter(item => item === "POST /thread/66666666-6666-6666-6666-666666666666/click?slot=5").length,
    1,
    "task 6 must open its exact thread once, with zero-based slot 5"
  );
  const attentionTask6Path = latestDisplay(task6Event.uuid)?.gifpath;
  slots[5].status = "failed";
  await waitFor(() => cachedTask(latestDisplay(task6Event.uuid), 4, "第六个\n中文…") && latestDisplay(task6Event.uuid)?.gifpath !== attentionTask6Path, "waiting GIF changes to an error GIF");
  const errorTask6Path = await assertTaskArtwork(latestDisplay(task6Event.uuid), 4, "第六个\n中文…");
  const unchangedTask6Updates = task6States().length;
  slots[5].title = "第六个中文会话的新标题";
  await waitForPolls();
  assert.equal(task6States().length, unchangedTask6Updates, "title changes after the same short label must not restart the GIF");
  slots[5].status = "idle";
  await waitFor(() => cachedTask(latestDisplay(task6Event.uuid), 2, "第六个\n中文…"), "error GIF changes to a static idle PNG");
  const idleTask6Path = await assertTaskArtwork(latestDisplay(task6Event.uuid), 2, "第六个\n中文…");
  assert.notEqual(idleTask6Path, errorTask6Path, "changing status must select a different cached artwork file");

  client.send(JSON.stringify({ cmd: "setactive", active: false, ...task6Event }));
  await waitFor(() => messages.some(message => message.cmd === "setactive" && message.actionid === task6Event.actionid && message.active === false), "task deactivation acknowledgement");
  const inactiveUpdates = task6States().length;
  slots[5].status = "working";
  slots[5].title = "👩🏽‍💻 编程中的会话";
  await waitForPolls();
  assert.equal(task6States().length, inactiveUpdates, "inactive keys must stop receiving display updates");
  client.send(JSON.stringify({ cmd: "setactive", active: true, ...task6Event }));
  await waitFor(() => cachedTask(latestDisplay(task6Event.uuid), 4, "👩🏽‍💻 编\n程中…"), "reactivated key receives current artwork");
  const emojiTask6Path = await assertTaskArtwork(latestDisplay(task6Event.uuid), 4, "👩🏽‍💻 编\n程中…");
  assert.notEqual(emojiTask6Path, initialTaskAssets[5], "changing glyph and status must select new baked artwork");
  assert.notEqual(emojiTask6Path, initialTaskAssets[0], "two running conversations must retain their own baked glyph");
  const resumedUpdates = task6States().length;
  await waitForPolls();
  assert.equal(task6States().length, resumedUpdates, "reactivated animation must also keep playing between unchanged polls");
  slots[5].title = "🇨🇳 同一运行状态的新首字";
  await waitFor(() => cachedTask(latestDisplay(task6Event.uuid), 4, "🇨🇳 同\n一运…"), "a changed first glyph selects a new running GIF");
  assert.notEqual(await assertTaskArtwork(latestDisplay(task6Event.uuid), 4, "🇨🇳 同\n一运…"), emojiTask6Path, "changing only the first glyph must also change the baked GIF");

  slots[5].title = null;
  await waitFor(() => cachedTask(latestDisplay(task6Event.uuid), 4, "Untitled"), "a missing actual conversation title shows Untitled instead of a project folder");
  await assertTaskArtwork(latestDisplay(task6Event.uuid), 4, "Untitled");
  const pathUpdates = task6States().length;
  slots[5].title = "";
  await waitForPolls();
  assert.equal(task6States().length, pathUpdates, "an unchanged missing title must not restart identical artwork");

  let labelRequest = 0;
  async function inspectLabel(index, action = "status", fields = {}) {
    const actionid = `label-test-${labelRequest++}`;
    client.send(JSON.stringify({ cmd: "sendToPlugin",
      uuid: `com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`, actionid, key: `0_${index}`,
      payload: { type: "conversationLabel", action, ...fields } }));
    await waitFor(() => messages.some(item => item.cmd === "sendToPropertyInspector" && item.actionid === actionid && item.payload?.type === "conversationLabelStatus"), "conversation label response");
    return messages.find(item => item.cmd === "sendToPropertyInspector" && item.actionid === actionid && item.payload?.type === "conversationLabelStatus").payload;
  }
  const originalLabel = await inspectLabel(5);
  assert.equal(originalLabel.identifier, "06");
  assert.equal(originalLabel.title, "Untitled");
  const savedLabel = await inspectLabel(5, "save", { threadKey: slots[5].threadKey, alias: "状态\n面板" });
  assert.equal(savedLabel.error, null);
  assert.equal(savedLabel.alias, "状态\n面板");
  await waitFor(() => cachedTask(latestDisplay(task6Event.uuid), 4, "状态\n面板"), "a saved alias updates native artwork with the explicit two-line layout");
  const staleLabel = await inspectLabel(5, "save", { threadKey: slots[4].threadKey, alias: "错误目标" });
  assert.match(staleLabel.error, /conversation on this key changed/);
  assert.equal(staleLabel.alias, "状态\n面板", "a stale inspector cannot rename a different conversation");
  const restoredLabel = await inspectLabel(5, "reset", { threadKey: slots[5].threadKey });
  assert.equal(restoredLabel.alias, "");
  assert.equal(restoredLabel.identifier, "06", "resetting a name must preserve its number");
  await waitFor(() => cachedTask(latestDisplay(task6Event.uuid), 4, "Untitled"), "reset restores the automatic name");

  slots[6].title = slots[7].title = null;
  slots[6].status = slots[7].status = "idle";
  const task7Uuid = "com.ulanzi.ulanzistudio.codexmicro.task7";
  const task8Uuid = "com.ulanzi.ulanzistudio.codexmicro.task8";
  await waitFor(() => [task7Uuid, task8Uuid].every(uuid => cachedTask(latestDisplay(uuid), 2, "Untitled")), "same-name conversations receive their numbered artwork");
  const numberedLeft = await assertTaskArtwork(latestDisplay(task7Uuid), 2, "Untitled");
  const numberedRight = await assertTaskArtwork(latestDisplay(task8Uuid), 2, "Untitled");
  assert.notEqual(numberedLeft, numberedRight, "identical names and status must remain visually distinct through their numbers");
  [slots[6], slots[7]] = [slots[7], slots[6]];
  await waitForPolls();
  assert.equal((await inspectLabel(6)).identifier, "08");
  assert.equal((await inspectLabel(7)).identifier, "07");
  assert.equal(latestDisplay(task7Uuid).path, numberedRight, "a number follows its conversation when key order changes");
  assert.equal(latestDisplay(task8Uuid).path, numberedLeft);

  client.send(JSON.stringify({ cmd: "keydown", uuid: "com.ulanzi.ulanzistudio.codexmicro.task1", actionid: "a1", key: "0_0", param: {} }));
  client.send(JSON.stringify({ cmd: "run", uuid: "com.ulanzi.ulanzistudio.codexmicro.task1", actionid: "a1", key: "0_0", param: {} }));
  client.send(JSON.stringify({ cmd: "keyup", uuid: "com.ulanzi.ulanzistudio.codexmicro.task1", actionid: "a1", key: "0_0", param: {} }));
  await new Promise(resolve => setTimeout(resolve, 150));
  const threadRequests = bridgeRequests.filter(item => item.includes("/thread/11111111-1111-1111-1111-111111111111/click?slot=0"));
  assert.equal(threadRequests.length, 1, "run must not duplicate a keydown task invocation");

  const navigateEvent = {
    uuid: "com.ulanzi.ulanzistudio.codexmicro.navigate",
    actionid: "action-navigate",
    key: "Encoder_0",
    param: {}
  };
  client.send(JSON.stringify({ cmd: "add", ...navigateEvent }));
  client.send(JSON.stringify({ cmd: "dialdown", ...navigateEvent }));
  client.send(JSON.stringify({ cmd: "dialup", ...navigateEvent }));
  client.send(JSON.stringify({ cmd: "dialrotate", rotateEvent: "left", ...navigateEvent }));
  client.send(JSON.stringify({ cmd: "dialrotate", rotateEvent: "right", ...navigateEvent }));
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(
    bridgeRequests.filter(item => item.includes("/thread/11111111-1111-1111-1111-111111111111/click?slot=0")).length,
    2,
    "Encoder press must open task slot 1"
  );
  assert.deepEqual(
    messages.filter(message => message.cmd === "hotkey").map(message => message.keylist),
    ["SCROLL UP", "SCROLL DOWN"]
  );
  await waitFor(() => cachedTask(latestDisplay(navigateEvent.uuid), 4, "Working\ntask"), "Encoder receives the latest task's baked artwork");
  assert.equal(await assertTaskArtwork(latestDisplay(navigateEvent.uuid), 4, "Working\ntask"), initialTaskAssets[0], "the same status and glyph must reuse their existing cached artwork");

  const actions = ["fast", "pin", "new", "fork", "steer", "mic", "submit"];
  for (const [index, action] of actions.entries()) {
    const uuid = `com.ulanzi.ulanzistudio.codexmicro.${action}`;
    const event = { uuid, actionid: `action-${action}`, key: `1_${index}`, param: {} };
    client.send(JSON.stringify({ cmd: "add", ...event }));
    client.send(JSON.stringify({ cmd: "keydown", ...event }));
    client.send(JSON.stringify({ cmd: "run", ...event }));
    client.send(JSON.stringify({ cmd: "keyup", ...event }));
  }
  const usageEvent = {
    uuid: "com.ulanzi.ulanzistudio.codexmicro.usage",
    actionid: "action-usage",
    key: "2_0",
    param: {}
  };
  client.send(JSON.stringify({ cmd: "add", ...usageEvent }));
  client.send(JSON.stringify({ cmd: "keydown", ...usageEvent }));
  client.send(JSON.stringify({ cmd: "run", ...usageEvent }));
  client.send(JSON.stringify({ cmd: "keyup", ...usageEvent }));
  await new Promise(resolve => setTimeout(resolve, 250));

  for (const action of actions) {
    assert.equal(
      bridgeRequests.filter(item => item === `POST /action/${action}/down`).length,
      1,
      `${action} must execute once on keydown`
    );
    assert.equal(
      bridgeRequests.filter(item => item === `POST /action/${action}/up`).length,
      1,
      `${action} must preserve keyup`
    );
    const svg = decodeArtwork(latestDisplay(`com.ulanzi.ulanzistudio.codexmicro.${action}`));
    assert.match(svg, /viewBox="0 0 196 196"/);
  }
  assert.equal(
    bridgeRequests.filter(item => item === "POST /focus").length,
    1,
    "Usage must focus Codex once on keydown"
  );
  const usageState = messages.find(message =>
    message.cmd === "state" &&
    message.param?.statelist?.[0]?.uuid === usageEvent.uuid
  );
  const usageItem = usageState?.param?.statelist?.[0];
  const usageSvg = decodeArtwork(usageItem);
  assert.match(usageSvg, />23<\/text>/);
  assert.match(usageSvg, /#FFBE00/);

  // The real Bridge retains its last slots when disconnected. An offline key
  // must not activate one of those now-hidden cached conversations.
  connected = false;
  await waitFor(
    () => taskTypes.every((_, index) => cachedTask(latestDisplay(`com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`), 2, "×")),
    "all task keys receive baked offline artwork"
  );
  const offlinePath = await assertTaskArtwork(latestDisplay("com.ulanzi.ulanzistudio.codexmicro.task1"), 2, "×");
  for (let index = 0; index < 13; index += 1) {
    const item = latestDisplay(`com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`);
    assert.equal(await assertTaskArtwork(item, 2, "×"), offlinePath, `offline task ${index + 1} must share the same connection status artwork`);
  }
  for (const suffix of [".navigate", ".usage", ...actions.map(action => `.${action}`)]) {
    const offlineControl = messages.filter(message =>
      message.cmd === "state" && message.param?.statelist?.[0]?.uuid.endsWith(suffix)
    ).at(-1);
    const svg = decodeArtwork(offlineControl?.param?.statelist?.[0]);
    assert.match(svg, />×<\/text>/, `${suffix} must clearly indicate disconnection`);
  }
  const priorThreadRequests = bridgeRequests.filter(item => item.startsWith("POST /thread/")).length;
  const priorAlerts = messages.filter(message => message.cmd === "showAlert").length;
  for (const index of [0, 6, 12]) {
    client.send(JSON.stringify({ cmd: "keydown", uuid: `com.ulanzi.ulanzistudio.codexmicro.task${index + 1}`, actionid: `a${index + 1}`, key: `0_${index}`, param: {} }));
  }
  client.send(JSON.stringify({ cmd: "dialdown", ...navigateEvent }));
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(bridgeRequests.filter(item => item.startsWith("POST /thread/")).length, priorThreadRequests);
  assert.equal(messages.filter(message => message.cmd === "showAlert").length, priorAlerts + 4);
  process.stdout.write("Codex Micro plugin smoke test passed.\n");
} finally {
  child.kill("SIGTERM");
  await childStopped;
  host.close();
  bridge.close();
  await rm(labelTestRoot, { recursive: true, force: true });
}
