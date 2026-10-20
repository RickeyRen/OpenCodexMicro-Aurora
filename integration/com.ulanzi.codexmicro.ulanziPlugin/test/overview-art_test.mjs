import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { OVERVIEW_MAX_USAGE_AGE_MS, OVERVIEW_WINDOW_PAGE_MS, renderOverviewSvg } from "../plugin/overview-art.js";

const inlineText = svg => svg.replace(/<\/?tspan\b[^>]*>/g, "");

const now = Date.UTC(2026, 9, 20, 10);
const usage = { observedAt: now, windows: [{ kind: "weekly", remainingPercent: 87, resetsAt: now / 1000 + 90000 }] };
const slots = [
  { threadKey: "a", status: "working" }, { threadKey: "a", status: "working" },
  { threadKey: "b", status: "awaiting-approval" }, { threadKey: "c", status: "error" },
  { threadKey: "d", status: "unread" }, { status: "working" }, { threadKey: "e", status: "mystery" }
];

test("overview uses only provided weekly allowance and unique live conversation counts", async () => {
  const svg = renderOverviewSvg({ connected: true, usage, slots }, { now });
  assert.match(inlineText(svg), />87%<\/text>/);
  assert.match(svg, />RESET 1d1h<\/text>/);
  assert.ok(!svg.includes("5H"));
  assert.match(svg, />ON SCREEN<\/title>/);
  assert.equal((svg.match(/>1<\/text>/g) || []).length, 3);
  const raster = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
  assert.equal(raster.info.width, 460);
  assert.equal(raster.info.height, 200);
});

test("unknown primary windows never stand in for 5h and a lone 5h window has no invented weekly panel", () => {
  const primary = renderOverviewSvg({ connected: true, usage: { ...usage, windows: [{ kind: "primary", remainingPercent: 64 }] } }, { now });
  assert.ok(!primary.includes("5H") && !primary.includes("WEEK") && !primary.includes("64%"));
  assert.match(primary, />ALLOWANCE<\/text>/);
  assert.match(primary, />UNAVAILABLE<\/text>/);
  const onlyFiveHour = renderOverviewSvg({ connected: true, usage: { ...usage, windows: [{ kind: "five_hour", remainingPercent: 32 }] } }, { now, language: "zh_CN" });
  assert.match(onlyFiveHour, />5小时剩余<\/text>/);
  assert.match(inlineText(onlyFiveHour), />32%<\/text>/);
  assert.match(onlyFiveHour, />屏上会话<\/title>/);
  assert.ok(!onlyFiveHour.includes("本周") && !onlyFiveHour.includes("暂无数据"));
});

test("unknown, stale, null, malformed and disconnected allowance never becomes a fabricated zero", () => {
  for (const override of [
    { usage: null }, { usage: { ...usage, observedAt: now - OVERVIEW_MAX_USAGE_AGE_MS - 1 } },
    { usage: { ...usage, observedAt: now + 120000 } },
    { usage: { ...usage, windows: [{ kind: "weekly", remainingPercent: null }] } },
    { usage: { ...usage, windows: [{ kind: "weekly", remainingPercent: false }] } },
    { connected: false }
  ]) {
    const svg = renderOverviewSvg({ connected: true, usage, slots, ...override }, { now });
    assert.match(svg, />—<\/text>/);
    assert.ok(!inlineText(svg).includes("87%") && !inlineText(svg).includes("0%"));
  }
  const disconnected = renderOverviewSvg({ connected: false, usage, slots }, { now });
  assert.equal((disconnected.match(/>—<\/text>/g) || []).length, 4);
});

test("reset time is bounded and an elapsed reset is not silently interpreted as 100 percent", () => {
  for (const resetsAt of [null, 0, "", "invalid"]) {
    assert.match(renderOverviewSvg({ connected: true, usage: { ...usage, windows: [{ ...usage.windows[0], resetsAt }] } }, { now }), />RESET —<\/text>/);
  }
  const expired = renderOverviewSvg({ connected: true, usage: { ...usage, windows: [{ ...usage.windows[0], resetsAt: now / 1000 - 1 }] } }, { now });
  assert.match(expired, />RESET DUE<\/text>/);
  assert.match(inlineText(expired), />87%<\/text>/);
});

test("two real allowances rotate in large type while all state counts stay visible", async () => {
  const state = { connected: true, usage: { ...usage, windows: [{ kind: "five_hour", remainingPercent: 12, resetsAt: now / 1000 + 3600 }, ...usage.windows] }, slots };
  const pages = [now, now + OVERVIEW_WINDOW_PAGE_MS].map(instant => renderOverviewSvg(state, { now: instant }));
  assert.ok(pages.some(svg => />12%<\/text>/.test(inlineText(svg))));
  assert.ok(pages.some(svg => />87%<\/text>/.test(inlineText(svg))));
  assert.ok(pages.some(svg => />5H LEFT<\/text>/.test(svg)));
  for (const svg of pages) {
    assert.equal((inlineText(svg).match(/>\d+%<\/text>/g) || []).length, 1, "one readable allowance per frame");
    assert.equal((svg.match(/>1<\/text>/g) || []).length, 3, "all three counts stay on every page");
  }
  assert.equal(renderOverviewSvg({ connected: true, usage, slots }, { now }),
    renderOverviewSvg({ connected: true, usage, slots }, { now: now + OVERVIEW_WINDOW_PAGE_MS }), "a lone allowance never rotates");
  for (const language of ["zh_CN", "zh_HK", "en", "ja_JP", "de_DE", "es_ES", "pt_PT", "ko_KR"]) {
    for (const instant of [now, now + OVERVIEW_WINDOW_PAGE_MS]) {
      const localized = renderOverviewSvg(state, { now: instant, language });
      assert.ok(!localized.includes("NaN") && !localized.includes("undefined"));
      await sharp(Buffer.from(localized)).png().toBuffer();
    }
  }
});
