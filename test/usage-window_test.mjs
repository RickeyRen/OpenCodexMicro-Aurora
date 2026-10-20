import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { normalizeUsageWindow } from "../src/bridge/usage-window.mjs";
import { CodexCdpClient } from "../src/bridge/codex-cdp.mjs";

const raw = { used_percent: 13, limit_window_seconds: 604800, reset_at: 1793082739 };

test("normalizes supplied windows without assuming the primary role is five hours", () => {
  assert.deepEqual(normalizeUsageWindow(raw, "primary"), {
    id: "weekly", kind: "weekly", usedPercent: 13, remainingPercent: 87, resetsAt: raw.reset_at
  });
  assert.equal(normalizeUsageWindow({ ...raw, limit_window_seconds: 18000 }, "secondary").kind, "five-hour");
  assert.deepEqual(normalizeUsageWindow({ used_percent: 0 }, "primary"), {
    id: "primary", kind: "other", usedPercent: 0, remainingPercent: 100, resetsAt: null
  });
  assert.equal(normalizeUsageWindow({ ...raw, used_percent: 100 }, "primary").remainingPercent, 0);
  assert.equal(normalizeUsageWindow({ ...raw, used_percent: "13.5" }, "primary").remainingPercent, 86.5);
});

test("absent, malformed and out-of-range usage never becomes a fabricated full balance", () => {
  for (const value of [null, undefined, false, true, "", " ", "NaN", "Infinity", "0x0", "13%", [], {}, NaN, Infinity, -1, 101]) {
    assert.equal(normalizeUsageWindow({ ...raw, used_percent: value }, "primary"), null, String(value));
  }
  for (const value of [null, undefined, false, [], "window"]) assert.equal(normalizeUsageWindow(value, "primary"), null);
});

test("invalid reset fields stay unavailable and unknown durations do not imply a quota kind", () => {
  for (const value of [null, undefined, false, true, "", " ", "bad", [], {}, NaN, Infinity, -1, 0, 1.5, 8_640_000_000_001]) {
    assert.equal(normalizeUsageWindow({ ...raw, reset_at: value }, "primary").resetsAt, null, String(value));
  }
  assert.equal(normalizeUsageWindow({ ...raw, reset_at: String(raw.reset_at) }, "primary").resetsAt, raw.reset_at);
  for (const value of [null, undefined, false, true, "", " ", [], {}, -1, 0, NaN, Infinity, 18000.5, 3600]) {
    assert.equal(normalizeUsageWindow({ ...raw, limit_window_seconds: value }, "primary").kind, "other", String(value));
  }
});

test("the exact normalizer runs without module dependencies in the CDP renderer", () => {
  const input = { ...raw, used_percent: null };
  assert.equal(vm.runInNewContext(`(${normalizeUsageWindow.toString()})(window, 'primary')`, { window: input }), null);
  const result = vm.runInNewContext(`(${normalizeUsageWindow.toString()})(window, 'primary')`, { window: raw });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), normalizeUsageWindow(raw, "primary"));
});

test("the actual CDP snapshot applies strict normalization before exposing allowance", async () => {
  const root = { __reactContainer$test: {} };
  const slots = Array.from({ length: 6 }, (_, id) => ({ id, status: "idle" }));
  const query = { queryKey: ["rate-limit-status"], state: { dataUpdatedAt: Date.now(), data: { rate_limit: {} } } };
  const source = {
    root, node: { store: { get: () => slots } }, resolver: { resolve() {} },
    queryClients: [{ getQueryCache: () => ({ getAll: () => [query] }) }]
  };
  const context = {
    [Symbol.for("codex-keyboard-micro-snapshot-source")]: source,
    document: { getElementById: () => root, querySelector: () => null, querySelectorAll: () => [] },
    performance: { now: () => 0, getEntriesByType: () => [] }
  };
  const client = new CodexCdpClient();
  client.connect = async () => {};
  client.evaluate = expression => vm.runInNewContext(expression, context);
  query.state.data.rate_limit.primary_window = { ...raw, used_percent: false };
  query.state.data.rate_limit.secondary_window = { ...raw, used_percent: 25, reset_at: "" };
  const snapshot = await client.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.usage.windows)), [{
    id: "weekly", kind: "weekly", usedPercent: 25, remainingPercent: 75, resetsAt: null
  }]);
});
