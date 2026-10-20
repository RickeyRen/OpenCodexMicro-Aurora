import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { createBridgeServer } from "../src/bridge/server.mjs";

const THREAD = "f6805b8a-332a-43a0-a118-52d3e59542f6";

async function fixture(t) {
  const calls = [];
  const requests = [];
  const client = Object.fromEntries(["snapshot", "clickAgent", "clickThread", "dispatchNamedAction", "dispatchComposerSteer", "dispatchJoystick"]
    .map(name => [name, async (...args) => {
      calls.push([name, ...args]);
      return name === "snapshot" ? { slots: [{ threadKey: THREAD, title: "Private conversation", status: "working" }] } : undefined;
    }]));
  const { server } = createBridgeServer({ client, focus: async () => calls.push(["focus"]), now: () => 123456 });
  server.on("request", request => requests.push({ ...request.headers }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const port = server.address().port;
  function send(path, { method = "GET", headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const outgoing = request({ hostname: "127.0.0.1", port, path, method, headers, agent: false }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
      });
      outgoing.setTimeout(2000, () => outgoing.destroy(new Error("Test request timed out")));
      outgoing.on("error", reject);
      outgoing.end();
    });
  }
  return { send, calls, port, requests };
}

test("the Node plugin can read cached state and explicitly refresh health without browser headers", async t => {
  const { send, calls } = await fixture(t);
  const state = await send("/state");
  assert.equal(state.status, 200);
  assert.equal(JSON.parse(state.body).connected, false);
  assert.deepEqual(calls, [], "constructing/importing the server and reading cached state must not invoke CDP");
  const health = await send("/health");
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).codexConnected, true);
  assert.deepEqual(calls, [["snapshot"]]);
  assert.equal(state.headers["access-control-allow-origin"], undefined);
  assert.equal(state.headers["cache-control"], "no-store");
});

test("normal local plugin requests preserve thread, button, focus and joystick actions", async t => {
  const { send, calls } = await fixture(t);
  for (const path of ["/focus", "/agent/0/click", `/thread/${THREAD}/click?slot=6`, "/action/submit/down", "/action/submit/up",
    "/action/steer/down", "/action/steer/up", "/joystick/right/down"]) {
    assert.equal((await send(path, { method: "POST" })).status, 200, path);
  }
  assert.deepEqual(calls, [
    ["focus"], ["clickAgent", 0], ["focus"], ["clickThread", THREAD, 6], ["focus"],
    ["dispatchNamedAction", "submit", true], ["dispatchNamedAction", "submit", false],
    ["focus"], ["dispatchComposerSteer"], ["dispatchJoystick", "right", 1]
  ]);
});

test("real Node fetch used by the plugin, installer and doctor can read and execute local routes", async t => {
  const { calls, port, requests } = await fixture(t);
  const base = `http://127.0.0.1:${port}`;
  const state = await fetch(`${base}/state`);
  assert.equal(state.status, 200);
  assert.equal((await state.json()).connected, false);
  assert.deepEqual(calls, [], "cached state reads must not invoke CDP");
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  await health.json();
  const action = await fetch(`${base}/action/submit/down`, { method: "POST" });
  assert.equal(action.status, 200);
  assert.equal((await action.json()).ok, true);
  assert.deepEqual(calls, [["snapshot"], ["dispatchNamedAction", "submit", true]]);
  for (const headers of requests) {
    assert.equal(headers.origin, undefined);
    assert.equal(headers["sec-fetch-mode"], "cors", "exercise the actual undici default that the production plugin sends");
    assert.deepEqual(Object.keys(headers).filter(name => name.startsWith("sec-fetch-")), ["sec-fetch-mode"]);
  }
});

test("browser Origins are rejected before cached state, refresh or any application side effect", async t => {
  const { send, calls, port } = await fixture(t);
  const routes = [
    ["GET", "/state"], ["GET", "/health"], ["POST", "/focus"], ["POST", "/agent/0/click"],
    ["POST", `/thread/${THREAD}/click?slot=6`], ["POST", "/action/approve/down"],
    ["POST", "/action/reject/down"], ["POST", "/action/submit/down"], ["POST", "/action/steer/down"],
    ["POST", "/joystick/right/down"]
  ];
  for (const origin of ["https://malicious.example", "null", "", `http://127.0.0.1:${port}`]) {
    for (const [method, path] of routes) {
      const response = await send(path, { method, headers: { Origin: origin } });
      assert.equal(response.status, 403, `${origin}: ${method} ${path}`);
      assert.doesNotMatch(response.body, /Private conversation/);
    }
  }
  assert.deepEqual(calls, []);
});

test("Fetch Metadata blocks browser requests even when no Origin was supplied", async t => {
  const { send, calls } = await fixture(t);
  for (const headers of [{ "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "none" },
    { "Sec-Fetch-Mode": "no-cors" }, { "Sec-Fetch-Mode": "navigate" }, { "Sec-Fetch-Mode": "same-origin" },
    { "Sec-Fetch-Mode": "cors, cors" }, { "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin" },
    { "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" }, { "Sec-Fetch-Dest": "document" }, { "Sec-Fetch-User": "?1" }]) {
    for (const [method, path] of [["GET", "/state"], ["GET", "/health"], ["POST", "/action/approve/down"]]) {
      assert.equal((await send(path, { method, headers })).status, 403);
    }
  }
  assert.deepEqual(calls, []);
});

test("DNS rebinding and noncanonical or duplicate Host headers cannot access the Bridge", async t => {
  const { send, calls, port } = await fixture(t);
  for (const host of [`malicious.example:${port}`, `localhost:${port}`, "127.0.0.1", `127.1:${port}`,
    `2130706433:${port}`, `127.0.0.1:${port + 1}`, `127.0.0.1:${port}, malicious.example`]) {
    assert.equal((await send("/action/approve/down", { method: "POST", headers: { Host: host } })).status, 403, host);
  }
  const duplicate = await send("/health", { headers: ["Host", `127.0.0.1:${port}`, "Host", `127.0.0.1:${port}`] });
  assert.ok([400, 403].includes(duplicate.status), "duplicate Host must be rejected by Node or the request guard");
  assert.deepEqual(calls, []);
});

test("malformed request targets cannot throw out of the server or normalize into action routes", async t => {
  const { send, calls, port } = await fixture(t);
  for (const path of [`http://127.0.0.1:${port}/action/approve/down`, "//malicious.example/action/approve/down",
    "/foo/../action/approve/down", "/%2e%2e/action/approve/down", "/action/%ZZ/down", "/focus#fragment",
    "/focus\\extra", "/focus?value=%00", "/focus?value=%FF"]) {
    assert.equal((await send(path, { method: "POST" })).status, 400, path);
  }
  assert.deepEqual(calls, []);
  assert.equal((await send("/state")).status, 200, "a bad request must not terminate the server");
});
