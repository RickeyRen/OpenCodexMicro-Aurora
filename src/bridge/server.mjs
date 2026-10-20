import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CodexCdpClient } from "./codex-cdp.mjs";
import { decodeThreadPathSegment } from "./thread-key.mjs";
import { DASHBOARD_SLOT_COUNT } from "./sidebar-slots.mjs";

const execFileAsync = promisify(execFile);
const HOST = "127.0.0.1";
const PORT = Number(process.env.CODEX_KEYBOARD_PORT || 17373);
const configuredRefreshMs = Number(process.env.CODEX_KEYBOARD_REFRESH_MS || 500);
const REFRESH_MS = Number.isFinite(configuredRefreshMs)
  ? Math.max(250, configuredRefreshMs)
  : 500;
async function focusCodex() {
  await execFileAsync("/usr/bin/open", ["-b", "com.openai.codex"], {
    timeout: 3000
  });
}

/** Create an inert, testable HTTP server; only startBridge starts polling. */
export function createBridgeServer({ client = new CodexCdpClient(), focus = focusCodex, now = Date.now } = {}) {
  let cached = {
    connected: false,
    slots: Array.from({ length: DASHBOARD_SLOT_COUNT }, (_, id) => ({
      id, threadKey: null, title: null, status: "off", selected: false
    })),
    error: "Waiting for Codex",
    updatedAt: now()
  };
  let refreshPromise = null;
  let nextReconnectAt = 0;

  async function refresh(force = false) {
    if (refreshPromise) return refreshPromise;
    if (!force && now() < nextReconnectAt) return;
    refreshPromise = (async () => {
      try {
        const snapshot = await client.snapshot();
        cached = { connected: true, ...snapshot, error: null, updatedAt: now() };
        nextReconnectAt = 0;
      } catch (error) {
        cached = { ...cached, connected: false, error: error.message, updatedAt: now() };
        nextReconnectAt = now() + 2000;
      }
    })();
    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  function json(response, status, body) {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(`${JSON.stringify(body)}\n`);
  }

  const server = createServer(async (request, response) => {
    // CORS alone cannot prevent a browser from sending a simple POST. Node's
    // built-in fetch sends only Sec-Fetch-Mode: cors, without an Origin. Allow
    // that exact combination while rejecting the metadata browsers supply.
    const headers = request.headers;
    const fetchHeaders = Object.keys(headers).filter(name => name.startsWith("sec-fetch-"));
    const nodeFetch = fetchHeaders.length === 1 && fetchHeaders[0] === "sec-fetch-mode" && headers["sec-fetch-mode"] === "cors";
    if (headers.origin !== undefined || (fetchHeaders.length > 0 && !nodeFetch)) {
      return json(response, 403, { ok: false, error: "Browser requests are not allowed" });
    }
    const port = server.address()?.port;
    const hosts = request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index].toLowerCase() === "host");
    if (hosts.length !== 1 || headers.host !== `${HOST}:${port}`) {
      return json(response, 403, { ok: false, error: "A loopback Host is required" });
    }
    let url;
    try {
      const target = request.url || "";
      if (!target.startsWith("/") || target.startsWith("//") || /[\\#\s\u0000-\u001f\u007f]/.test(target)
        || /%(?![a-f\d]{2})/i.test(target)) throw new Error("Invalid request target");
      // Reject invalid UTF-8 and encoded controls as well as URL normalization
      // that would turn a malformed path into an executable action route.
      if (/[\\\u0000-\u001f\u007f]/.test(decodeURI(target))) throw new Error("Invalid request target");
      url = new URL(target, `http://${HOST}:${port}`);
      if (url.pathname !== target.split("?")[0]) throw new Error("Invalid request target");
    } catch {
      return json(response, 400, { ok: false, error: "Invalid request target" });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      await refresh(true);
      return json(response, 200, { ok: true, codexConnected: cached.connected, updatedAt: cached.updatedAt });
    }
    if (request.method === "GET" && url.pathname === "/state") {
      return json(response, 200, cached);
    }
    if (request.method === "POST" && url.pathname === "/focus") {
      try {
        await focus();
        return json(response, 200, { ok: true });
      } catch (error) {
        return json(response, 503, { ok: false, error: error.message });
      }
    }
    const match = request.method === "POST" && url.pathname.match(/^\/agent\/(\d{1,2})\/click$/);
    if (match) {
      try {
        if (Number(match[1]) >= DASHBOARD_SLOT_COUNT) throw new Error("Invalid Codex dashboard slot");
        await Promise.all([
          client.clickAgent(Number(match[1])),
          focus()
        ]);
        return json(response, 200, { ok: true });
      } catch (error) {
        return json(response, 503, { ok: false, error: error.message });
      }
    }
    const threadMatch = request.method === "POST" && url.pathname.match(
      /^\/thread\/([^/]+)\/click$/
    );
    if (threadMatch) {
      try {
        const threadId = decodeThreadPathSegment(threadMatch[1]);
        const slot = Number(url.searchParams.get("slot") || 0);
        if (!Number.isInteger(slot) || slot < 0 || slot >= DASHBOARD_SLOT_COUNT) {
          throw new Error("Invalid Codex dashboard slot");
        }
        await Promise.all([
          client.clickThread(threadId, slot),
          focus()
        ]);
        return json(response, 200, { ok: true, bridge: true });
      } catch (error) {
        return json(response, 503, {
          ok: false,
          bridge: false,
          error: error.message
        });
      }
    }
    const action = request.method === "POST" && url.pathname.match(
      /^\/action\/(fast|approve|reject|pin|new|fork|mic|steer|submit)\/(down|up)$/
    );
    if (action) {
      try {
        if (action[1] === "steer") {
          if (action[2] === "down") {
            await focus();
            await client.dispatchComposerSteer();
          }
          return json(response, 200, { ok: true });
        }
        await client.dispatchNamedAction(action[1], action[2] === "down");
        return json(response, 200, { ok: true, bridge: true });
      } catch (error) {
        return json(response, 503, { ok: false, error: error.message });
      }
    }
    const joystick = request.method === "POST" && url.pathname.match(
      /^\/joystick\/(up|right|down|left)\/(down|up)$/
    );
    if (joystick) {
      try {
        await client.dispatchJoystick(joystick[1], joystick[2] === "down" ? 1 : 0);
        return json(response, 200, { ok: true });
      } catch (error) {
        return json(response, 503, { ok: false, error: error.message });
      }
    }
    return json(response, 404, { ok: false, error: "Not found" });
  });

  return { server, refresh };
}

export function startBridge() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("Invalid Bridge port");
  const client = new CodexCdpClient();
  const { server, refresh } = createBridgeServer({ client });
  server.listen(PORT, HOST, () => {
    console.log(`Codex Keyboard bridge listening on http://${HOST}:${PORT}`);
    void refresh();
  });
  const timer = setInterval(() => void refresh(), REFRESH_MS);
  timer.unref();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      clearInterval(timer);
      client.disconnect();
      server.close(() => process.exit(0));
    });
  }
  return server;
}

// Importing this module for diagnostics/tests never connects to Codex. Bundled
// Bridge entry points keep the same direct-execution behavior as the source.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startBridge();
}
