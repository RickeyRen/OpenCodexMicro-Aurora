import assert from "node:assert/strict";
import test from "node:test";
import { ANIMATION_FRAMES, DEFAULT_KEY_THEME, normalizeStatus, isAnimatedStatus, taskVisual, taskVisualSvg, actionVisual, usageVisual } from "../plugin/key-art.js";
import { designVariantSvg } from "../plugin/design-variants.js";

function decode(data) {
  assert.ok(data.startsWith("data:image/svg+xml;base64,"));
  return Buffer.from(data.split(",")[1], "base64").toString();
}

test("the shipped task background matches the selected Aurora Silk preview", () => {
  assert.equal(DEFAULT_KEY_THEME, "aurora");
  for (const status of ["working", "attention", "complete", "error", "idle", "unknown", "offline", "empty"]) {
    for (const phase of [0, 6, 23]) {
      assert.equal(taskVisualSvg(status, "", phase), designVariantSvg("aurora", status, phase));
    }
  }
  assert.equal(taskVisualSvg("thinking"), designVariantSvg("aurora", "working"));
});

test("native Bridge status aliases share consistent colors and animation policy", () => {
  for (const alias of ["working", "thinking", "running", "in_progress"]) assert.equal(normalizeStatus(alias), "working");
  for (const alias of ["unread", "completed", "success"]) assert.equal(normalizeStatus(alias), "complete");
  for (const alias of ["awaiting-approval", "awaiting-response", "needs_input"]) assert.equal(normalizeStatus(alias), "attention");
  assert.equal(normalizeStatus("disconnected"), "offline");
  assert.equal(normalizeStatus("unassigned"), "empty");
  assert.equal(normalizeStatus("new-status"), "unknown");
  assert.equal(normalizeStatus("idle"), "idle");
  assert.ok(isAnimatedStatus("awaiting-approval"));
  assert.ok(isAnimatedStatus("failed"));
  assert.ok(!isAnimatedStatus("unread"));
});

test("motion is explicit in the frame SVG and wraps without external animation", () => {
  for (const status of ["working", "attention", "error"]) {
    const frames = Array.from({ length: ANIMATION_FRAMES }, (_, phase) => taskVisualSvg(status, "修", phase));
    assert.ok(new Set(frames).size >= 12, `${status} must visibly change over its loop`);
    assert.equal(taskVisualSvg(status, "修", 0), taskVisualSvg(status, "修", ANIMATION_FRAMES));
    assert.equal(taskVisualSvg(status, "修", ANIMATION_FRAMES - 1), taskVisualSvg(status, "修", -1));
    assert.ok(frames.every(svg => !/<(?:animate|filter|image)\b|<style\b/.test(svg)));
  }
});

test("fallback text stays escaped, supports short labels, and keeps legacy glyphs large", () => {
  const svg = decode(taskVisual("working", "<&\"'"));
  assert.ok(svg.includes("&lt;&amp;&quot;&apos;"));
  assert.ok(decode(taskVisual("working", "修")).includes('font-size="88"'));
  const compact = decode(taskVisual("working", "状态\n面板", 0, "07"));
  assert.ok(compact.includes(">07</text>"));
  assert.ok(compact.includes(">状态</text>") && compact.includes(">面板</text>"));
  assert.ok(compact.includes('font-size="52"'));
  assert.ok(!taskVisualSvg("working", "").includes("<text"));
  assert.ok(!taskVisualSvg("working").includes("<text"));
});

test("usage safely clamps values and every action is a self-contained SVG", () => {
  for (const action of ["fast", "new", "pin", "navigate", "fork", "steer", "mic", "submit", "usage"]) {
    const svg = decode(actionVisual(action));
    assert.ok(svg.includes('viewBox="0 0 196 196"'));
    assert.ok(!svg.includes("<image"));
  }
  assert.ok(decode(usageVisual(400)).includes(">100</text>"));
  assert.ok(decode(usageVisual(-5)).includes(">0</text>"));
  assert.ok(decode(usageVisual(null)).includes(">—</text>"));
  assert.ok(decode(usageVisual("not-a-number")).includes(">—</text>"));
});
