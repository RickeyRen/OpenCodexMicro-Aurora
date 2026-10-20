import WebSocket from "ws";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createBridgeInstaller } from "./bridge-installer.js";
import { formatTaskLabel, untitledTaskLabel } from "./key-title.js";
import { createConversationLabels } from "./conversation-labels.js";
import { actionVisual, DEFAULT_KEY_THEME, taskVisual, usageVisual } from "./key-art.js";
import { createTaskArtwork } from "./task-artwork.js";
import { createTaskDisplay } from "./task-display.js";
import { createOverviewDisplay } from "./overview-display.js";
import { resolveNativeOverviewTarget } from "./native-overview-target.js";

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.codexmicro";
const BRIDGE_URL = process.env.CODEX_BRIDGE_URL || "http://127.0.0.1:17373";
const [address = "127.0.0.1", port = "3906", language = "en-US", studioVersion = ""] = process.argv.slice(2);
const UNTITLED = untitledTaskLabel(language);
const HOST_URL = `ws://${address}:${port}`;
const instances = new Map();
const PLUGIN_ROOT = resolve(dirname(resolve(process.argv[1])), "..");
const MANIFEST = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, "manifest.json"), "utf8"));
const taskArtwork = createTaskArtwork({ pluginRoot: PLUGIN_ROOT, theme: DEFAULT_KEY_THEME });
const conversationLabels = createConversationLabels({ filePath: process.env.CODEX_MICRO_LABELS_FILE });
const setTaskDisplay = createTaskDisplay({ theme: DEFAULT_KEY_THEME, artwork: taskArtwork, send,
  isCurrent: instance => instances.get(contextOf(instance)) === instance });
const bridgeSetup = createBridgeInstaller({
  pluginRoot: PLUGIN_ROOT,
  bridgeUrl: BRIDGE_URL,
  version: MANIFEST.Version
});
const ACTION_LABELS = Object.freeze({
  fast: "FAST",
  usage: "USAGE",
  pin: "PIN",
  new: "NEW",
  navigate: "LATEST",
  fork: "FORK",
  steer: "STEER",
  mic: "MIC",
  submit: "SUBMIT"
});

let socket;
let reconnectTimer;
let pollTimer;
let pollInFlight = false;
let latestState = null;
let setupOperation = null;
let labelStorageError = null;
let overviewDisplay = null;
let overviewTargetKey = null;
let overviewCheckedAt = -Infinity;
let overviewSetupError = null;
let overviewRuntimeError = null;

function contextOf(message) {
  return String(message.actionid || `${message.uuid}___${message.key}`);
}

function taskSlot(uuid) {
  const match = String(uuid || "").match(/\.task([1-9]|1[0-3])$/);
  return match ? Number(match[1]) - 1 : null;
}

function actionName(uuid) {
  const name = String(uuid || "").split(".").at(-1);
  return Object.hasOwn(ACTION_LABELS, name) ? name : null;
}

function usageRemaining(usage) {
  const windows = Array.isArray(usage?.windows) ? usage.windows : [];
  const window = windows.find((item) => item?.kind === "weekly") ?? windows[0];
  const remaining = Number(window?.remainingPercent);
  return Number.isFinite(remaining)
    ? Math.max(0, Math.min(100, Math.round(remaining)))
    : null;
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function ack(message) {
  send({
    code: 0,
    cmd: message.cmd,
    uuid: message.uuid,
    actionid: message.actionid,
    key: message.key,
    active: message.active,
    param: message.param || {}
  });
}

function sendToInspector(message, payload) {
  send({
    cmd: "sendToPropertyInspector",
    uuid: message.uuid,
    actionid: message.actionid,
    key: message.key,
    payload
  });
}

function inspectorTask(message) {
  const slot = taskSlot(message.uuid) ?? (actionName(message.uuid) === "navigate" ? 0 : null);
  return slot === null ? null : latestState?.slots?.[slot];
}

async function syncConversationLabels(state) {
  try {
    await conversationLabels.ensure((state?.slots || []).map(task => task?.threadKey).filter(Boolean));
    labelStorageError = null;
  } catch (error) {
    if (labelStorageError !== error.message) send({ cmd: "logMessage", uuid: PLUGIN_UUID,
      level: "error", message: `Conversation labels: ${error.message}` });
    labelStorageError = error.message;
  }
}

async function handleConversationLabelMessage(message) {
  let error = null;
  let errorCode = null;
  try {
    const action = message.payload?.action || "status";
    if (!["status", "save", "reset"].includes(action)) throw new Error("Unknown label action");
    if (action !== "status") {
      const task = inspectorTask(message);
      if (!task?.threadKey || message.payload?.threadKey !== task.threadKey) {
        throw Object.assign(new Error("The conversation on this key changed. Check its name and try again."), { code: "STALE_CONVERSATION" });
      }
      await conversationLabels.setAlias(task.threadKey, action === "reset" ? "" : message.payload.alias);
      renderAll();
    }
  } catch (failure) {
    error = failure.message;
    errorCode = ["STALE_CONVERSATION", "INVALID_CONVERSATION_LABEL", "LABEL_CAPACITY_REACHED"].includes(failure.code)
      ? failure.code : "LABEL_STORAGE_ERROR";
  }
  const task = inspectorTask(message);
  const label = task?.threadKey ? conversationLabels.get(task.threadKey) : null;
  sendToInspector(message, { type: "conversationLabelStatus", threadKey: task?.threadKey || null,
    title: task?.threadKey ? task.title || UNTITLED : "", identifier: label?.identifier || "", alias: label?.alias || "",
    error: error || labelStorageError, errorCode: errorCode || (labelStorageError ? "LABEL_STORAGE_ERROR" : null) });
}

async function sendBridgeSetupStatus(message, extra = {}) {
  const status = await bridgeSetup.status();
  sendToInspector(message, {
    type: "bridgeSetupStatus",
    status,
    busy: Boolean(setupOperation),
    operation: setupOperation,
    ...extra
  });
}

async function handleBridgeSetupMessage(message) {
  const action = message.payload?.action;
  if (action === "openGuide") {
    send({
      cmd: "openurl",
      url: "https://github.com/RickeyRen/OpenCodexMicro-Aurora#1-llm--agent-installation",
      local: false
    });
    await sendBridgeSetupStatus(message);
    return;
  }
  if (action === "status" || !action) {
    await sendBridgeSetupStatus(message);
    return;
  }
  if (!["install", "launch", "uninstall"].includes(action)) {
    await sendBridgeSetupStatus(message, { error: `Unknown setup action: ${action}` });
    return;
  }
  if (setupOperation) {
    await sendBridgeSetupStatus(message);
    return;
  }

  setupOperation = action;
  await sendBridgeSetupStatus(message);
  let result = null;
  let failure = null;
  try {
    if (action === "install") await bridgeSetup.install();
    if (action === "launch") await bridgeSetup.launch();
    if (action === "uninstall") await bridgeSetup.uninstall();
    result = action;
  } catch (error) {
    failure = error.message;
    send({
      cmd: "logMessage",
      uuid: message.uuid,
      actionid: message.actionid,
      key: message.key,
      level: "error",
      message: `Codex Bridge ${action} failed: ${error.message}`
    });
  } finally {
    setupOperation = null;
  }
  await sendBridgeSetupStatus(message, { result, error: failure });
}

function setArtworkDisplay(instance, data, digest) {
  if (!instance.active || instance.lastDisplay === digest) return;
  instance.lastDisplay = digest;
  send({
    cmd: "state",
    param: {
      statelist: [{
        uuid: instance.uuid,
        actionid: instance.actionid,
        key: instance.key,
        type: 1,
        data,
        showtext: false,
        textdata: ""
      }]
    }
  });
}

function shortTaskLabel(task, label) {
  if (label?.alias) return formatTaskLabel(label.alias, { preserveLines: true });
  return formatTaskLabel(task.title || UNTITLED);
}

function renderInstance(instance) {
  const slot = taskSlot(instance.uuid);
  if (slot === null) {
    const action = actionName(instance.uuid);
    if (!latestState?.connected) {
      setArtworkDisplay(instance, taskVisual("offline", "×"), "offline");
      return;
    }
    if (action === "usage") {
      const remaining = usageRemaining(latestState.usage);
      setArtworkDisplay(instance, usageVisual(remaining), `usage:${remaining ?? "unknown"}`);
      return;
    }
    if (action === "navigate") {
      const task = latestState.slots?.[0];
      const label = task?.threadKey ? conversationLabels.get(task.threadKey) : null;
      setTaskDisplay(instance, task?.threadKey ? task.status : "empty",
        task?.threadKey ? shortTaskLabel(task, label) : "·", label?.identifier || "");
      return;
    }
    setArtworkDisplay(instance, actionVisual(action), `action:${action}`);
    return;
  }
  if (!latestState?.connected) {
    setTaskDisplay(instance, "offline", "×");
    return;
  }
  const task = latestState.slots?.[slot];
  if (!task?.threadKey) {
    setTaskDisplay(instance, "empty", "·");
    return;
  }
  const label = conversationLabels.get(task.threadKey);
  setTaskDisplay(instance, task.status, shortTaskLabel(task, label), label?.identifier || "");
}

function renderAll() {
  for (const instance of instances.values()) renderInstance(instance);
}

async function syncOverview() {
  const now = Date.now();
  if (now < overviewCheckedAt || now - overviewCheckedAt >= 5000) {
    overviewCheckedAt = now;
    try {
      const target = await resolveNativeOverviewTarget({ studioVersion });
      const targetKey = target ? JSON.stringify(target) : null;
      if (targetKey !== overviewTargetKey) {
        overviewDisplay?.dispose();
        overviewDisplay = null;
        overviewTargetKey = targetKey;
        if (target) {
          const display = createOverviewDisplay({
            send, target, language,
            isCurrent: () => overviewDisplay === display && socket?.readyState === WebSocket.OPEN,
            onError: error => send({ cmd: "logMessage", uuid: PLUGIN_UUID,
              level: "error", message: `Native overview: ${error.message}` })
          });
          overviewDisplay = display;
        }
      }
      overviewSetupError = null;
    } catch (error) {
      overviewDisplay?.dispose();
      overviewDisplay = null;
      overviewTargetKey = null;
      if (overviewSetupError !== error.message) send({ cmd: "logMessage", uuid: PLUGIN_UUID,
        level: "error", message: `Native overview setup: ${error.message}` });
      overviewSetupError = error.message;
    }
  }
  overviewDisplay?.update(latestState);
}

async function bridgeRequest(path, method = "GET") {
  const response = await fetch(`${BRIDGE_URL}${path}`, {
    method,
    signal: AbortSignal.timeout(1200)
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Bridge HTTP ${response.status}`);
  }
  return payload;
}

async function openTaskSlot(slot) {
  if (!latestState?.connected) throw new Error("Codex Bridge is offline");
  const task = latestState?.slots?.[slot];
  if (!task?.threadKey) throw new Error(`Codex task slot ${slot + 1} is empty`);
  await bridgeRequest(`/thread/${encodeURIComponent(task.threadKey)}/click?slot=${slot}`, "POST");
}

async function pollBridge() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    latestState = await bridgeRequest("/state");
    await syncConversationLabels(latestState);
  } catch (error) {
    latestState = { connected: false, error: error.message, slots: [] };
  } finally {
    renderAll();
    try {
      await syncOverview();
      overviewRuntimeError = null;
    } catch (error) {
      if (overviewRuntimeError !== error.message) send({ cmd: "logMessage", uuid: PLUGIN_UUID,
        level: "error", message: `Native overview refresh: ${error.message}` });
      overviewRuntimeError = error.message;
    } finally {
      // An optional panel must never stall the thirteen conversation keys.
      pollInFlight = false;
    }
  }
}

async function invoke(instance, pressed) {
  const slot = taskSlot(instance.uuid);
  try {
    if (slot !== null) {
      if (!pressed) return;
      await openTaskSlot(slot);
      return;
    }
    const action = actionName(instance.uuid);
    if (!action) throw new Error(`Unknown Codex action: ${instance.uuid}`);
    if (action === "usage") {
      if (pressed) await bridgeRequest("/focus", "POST");
      return;
    }
    await bridgeRequest(`/action/${action}/${pressed ? "down" : "up"}`, "POST");
  } catch (error) {
    send({ cmd: "logMessage", uuid: instance.uuid, actionid: instance.actionid, key: instance.key, level: "error", message: error.message });
    send({ cmd: "showAlert", uuid: instance.uuid, actionid: instance.actionid, key: instance.key });
  }
}

async function invokeEncoder(instance, message) {
  try {
    if (message.cmd === "dialdown") {
      await openTaskSlot(0);
      return;
    }
    if (message.cmd !== "dialrotate") return;
    const keylist = {
      left: "SCROLL UP",
      "hold-left": "SCROLL UP",
      right: "SCROLL DOWN",
      "hold-right": "SCROLL DOWN"
    }[message.rotateEvent];
    if (keylist) send({ cmd: "hotkey", keylist });
  } catch (error) {
    send({ cmd: "logMessage", uuid: instance.uuid, actionid: instance.actionid, key: instance.key, level: "error", message: error.message });
    send({ cmd: "showAlert", uuid: instance.uuid, actionid: instance.actionid, key: instance.key });
  }
}

function addInstance(message) {
  const context = contextOf(message);
  const existing = instances.get(context);
  const instance = existing || {
    uuid: message.uuid,
    actionid: message.actionid,
    key: message.key,
    active: true,
    lastDisplay: null
  };
  instance.active = true;
  instances.set(context, instance);
  renderInstance(instance);
  return instance;
}

function handleMessage(raw) {
  let message;
  try {
    message = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (message.cmd === "add" || message.cmd === "paramfromapp") {
    addInstance(message);
    ack(message);
    return;
  }
  if (message.cmd === "setactive") {
    const instance = instances.get(contextOf(message)) || addInstance(message);
    instance.active = Boolean(message.active);
    if (instance.active) {
      instance.lastDisplay = null;
      instance.pendingDisplay = null;
      renderInstance(instance);
    }
    ack(message);
    return;
  }
  if (message.cmd === "clear") {
    for (const item of message.param || []) instances.delete(contextOf(item));
    ack(message);
    return;
  }
  if (message.cmd === "sendToPlugin") {
    ack(message);
    if (message.payload?.type === "bridgeSetup") {
      void handleBridgeSetupMessage(message);
    }
    if (message.payload?.type === "conversationLabel") {
      void handleConversationLabelMessage(message);
    }
    return;
  }
  if (message.cmd === "run") {
    ack(message);
    return;
  }
  if (["dialdown", "dialup", "dialrotate"].includes(message.cmd)) {
    const instance = instances.get(contextOf(message)) || addInstance(message);
    if (actionName(instance.uuid) === "navigate") void invokeEncoder(instance, message);
    ack(message);
    return;
  }
  if (["keydown", "keyup"].includes(message.cmd)) {
    const instance = instances.get(contextOf(message)) || addInstance(message);
    void invoke(instance, message.cmd !== "keyup");
    ack(message);
  }
}

function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(HOST_URL);
  socket.on("open", () => {
    send({ code: 0, cmd: "connected", uuid: PLUGIN_UUID });
    overviewDisplay?.invalidate();
    for (const instance of instances.values()) {
      instance.lastDisplay = null;
      instance.pendingDisplay = null;
    }
    clearInterval(pollTimer);
    pollTimer = setInterval(() => void pollBridge(), 500);
    pollTimer.unref();
    void pollBridge();
  });
  socket.on("message", handleMessage);
  socket.on("close", () => {
    clearInterval(pollTimer);
    reconnectTimer = setTimeout(connect, 1000);
    reconnectTimer.unref();
  });
  socket.on("error", () => socket.close());
}

connect();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    overviewDisplay?.dispose();
    socket?.close();
    process.exit(0);
  });
}
