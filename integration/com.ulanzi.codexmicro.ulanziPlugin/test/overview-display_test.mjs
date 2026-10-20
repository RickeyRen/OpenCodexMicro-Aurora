import assert from "node:assert/strict";
import test from "node:test";
import { createOverviewDisplay } from "../plugin/overview-display.js";

const TARGET = Object.freeze({ uuid: "com.ulanzi.ulanzistudio.codexmicro", actionid: "native-window", key: "3_2" });
const START = 1_800_000_000_000;

function state(remaining = 87, status = "working") {
  return { connected: true, usage: { observedAt: START, windows: [
    { kind: "weekly", remainingPercent: remaining, resetsAt: (START + 3_600_000) / 1000 }
  ] }, slots: [{ threadKey: "example-1", status }] };
}

async function settle() {
  for (let index = 0; index < 16; index++) await Promise.resolve();
}

function fixture(options = {}) {
  let instant = START;
  let active = true;
  let nextTimer = 0;
  const timers = new Map();
  const messages = [];
  const errors = [];
  const target = { ...TARGET };
  const display = createOverviewDisplay({
    send: message => messages.push(message), target, language: "zh_CN", now: () => instant,
    isCurrent: () => active, onError: error => errors.push(error),
    setTimer(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, due: instant + delay }); return id; },
    clearTimer(id) { timers.delete(id); }, ...options
  });
  async function advance(milliseconds) {
    instant += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.due <= instant) { timers.delete(id); timer.callback(); }
    }
    await settle();
  }
  const text = index => Buffer.from(messages[index].param.statelist[0].data.split(",")[1], "base64").toString("utf8")
    .replace(/<\/?tspan\b[^>]*>/g, "");
  return { display, messages, errors, timers, target, advance, text, setActive: value => { active = value; } };
}

test("native overview addresses only its copied window target and deduplicates nonvisual polling changes", async () => {
  const f = fixture();
  f.target.key = "1_1";
  f.display.update(state());
  await settle();
  const image = f.messages[0].param.statelist[0];
  assert.deepEqual({ uuid: image.uuid, actionid: image.actionid, key: image.key }, TARGET);
  assert.equal(image.type, 1);
  assert.equal(image.showtext, false);
  assert.match(f.text(0), /width="460" height="200"/);
  assert.match(f.text(0), /87%/);
  const same = state();
  same.usage.observedAt += 500;
  same.slots[0].title = "A renamed conversation";
  same.slots.push({ ...same.slots[0] });
  f.display.update(same);
  await f.advance(5000);
  assert.equal(f.messages.length, 1, "poll timestamps, titles and duplicate slots must not reset an unchanged display");
  assert.equal(f.timers.size, 0);
  f.display.dispose();
});

test("bursty changes coalesce to the latest values at no more than one update per second", async () => {
  const f = fixture({ minUpdateMs: 20 });
  f.display.update(state());
  await settle();
  await f.advance(100);
  f.display.update(state(86));
  f.display.update(state(85, "attention"));
  f.display.update(state(84, "error"));
  await f.advance(899);
  assert.equal(f.messages.length, 1);
  await f.advance(1);
  assert.equal(f.messages.length, 2);
  assert.match(f.text(1), /84%/);
  assert.doesNotMatch(f.text(1), /8[56]%/);
  assert.equal(f.timers.size, 0);
  f.display.dispose();
});

test("refresh updates reset minutes and removes stale quota without needing new Bridge data", async () => {
  const f = fixture();
  f.display.update(state());
  await settle();
  assert.match(f.text(0), /重置 1h0m/);
  await f.advance(60_000);
  f.display.refresh();
  await settle();
  assert.match(f.text(1), /重置 59m/);
  await f.advance(15 * 60_000);
  f.display.refresh();
  await settle();
  assert.match(f.text(2), /等待更新/);
  assert.doesNotMatch(f.text(2), /87%/);
  f.display.update({ ...state(), connected: false });
  await f.advance(1000);
  assert.match(f.text(3), /未连接/);
  assert.doesNotMatch(f.text(3), /87%/);
  f.display.dispose();
});

test("renders serialize and an obsolete asynchronous result never overwrites the latest state", async () => {
  const jobs = [];
  const f = fixture({ renderImage(svg) { return new Promise(resolve => jobs.push({ svg, resolve })); } });
  f.display.update(state(87));
  await settle();
  f.display.update(state(86));
  f.display.update(state(85));
  await settle();
  assert.equal(jobs.length, 1);
  jobs[0].resolve({ type: 2, path: "old.png", key: "1_1" });
  await settle();
  assert.equal(f.messages.length, 0);
  await f.advance(1000);
  assert.equal(jobs.length, 2);
  assert.match(jobs[1].svg.replace(/<\/?tspan\b[^>]*>/g, ""), /85%/);
  jobs[1].resolve({ type: 2, path: "latest.png", key: "1_1" });
  await settle();
  assert.deepEqual(f.messages[0].param.statelist, [{ type: 2, path: "latest.png", ...TARGET, showtext: false, textdata: "" }]);
  f.display.dispose();
});

test("returning to the displayed image cancels a pending different image", async () => {
  const jobs = [];
  const f = fixture({ renderImage(svg) { return new Promise(resolve => jobs.push({ svg, resolve })); } });
  f.display.update(state(87));
  await settle();
  jobs[0].resolve({ type: 2, path: "A.png" });
  await settle();
  await f.advance(1000);
  f.display.update(state(86));
  await settle();
  f.display.update(state(87));
  jobs[1].resolve({ type: 2, path: "B.png" });
  await settle();
  await f.advance(1000);
  assert.equal(f.messages.length, 1);
  assert.equal(jobs.length, 2);
  f.display.dispose();
});

test("reconnect invalidates cached output and old in-flight work; dispose suppresses every later send", async () => {
  const f = fixture();
  f.display.update(state());
  await settle();
  f.display.invalidate();
  await f.advance(1000);
  assert.equal(f.messages.length, 2, "a new host connection needs its image resent once");
  f.setActive(false);
  f.display.update(state(86));
  await f.advance(1000);
  assert.equal(f.messages.length, 2);
  f.setActive(true);
  f.display.refresh();
  await settle();
  assert.equal(f.messages.length, 3);
  f.display.update(state(85));
  f.display.dispose();
  await f.advance(1000);
  assert.equal(f.messages.length, 3);
  assert.equal(f.timers.size, 0);

  const jobs = [];
  const g = fixture({ renderImage(svg) { return new Promise(resolve => jobs.push({ svg, resolve })); } });
  g.display.update(state());
  await settle();
  g.display.invalidate();
  jobs[0].resolve({ type: 2, path: "old-connection.png" });
  await settle();
  await g.advance(1000);
  assert.equal(g.messages.length, 0);
  assert.equal(jobs.length, 2);
  g.display.dispose();
  jobs[1].resolve({ type: 2, path: "disposed.png" });
  await settle();
  assert.equal(g.messages.length, 0);
});

test("failed encodes are bounded, reported once, and can recover on a later poll", async () => {
  let attempts = 0;
  const f = fixture({ renderImage() {
    attempts += 1;
    if (attempts < 3) throw new Error("encoder unavailable");
    return { type: 2, path: "recovered.png" };
  } });
  f.display.update(state());
  await settle();
  assert.equal(attempts, 1);
  assert.equal(f.timers.size, 0, "a failure alone must not create an endless retry timer");
  f.display.update(state());
  await f.advance(1000);
  assert.equal(attempts, 2);
  assert.equal(f.errors.length, 1);
  f.display.update(state());
  await f.advance(1000);
  assert.equal(f.messages.length, 1);
  f.display.dispose();
});

test("malformed Bridge values cannot throw into the state poll or preserve a falsely current quota", async () => {
  const f = fixture();
  f.display.update(state());
  await settle();
  const malformedQuota = state();
  malformedQuota.usage.windows[0].remainingPercent = { toString: null, valueOf: null };
  assert.doesNotThrow(() => f.display.update(malformedQuota));
  await f.advance(1000);
  assert.equal(f.messages.length, 2);
  assert.match(f.text(1), /未连接/);
  assert.doesNotMatch(f.text(1), /87%/);
  assert.equal(f.errors[0].code, "OVERVIEW_INVALID_STATE");
  assert.ok(f.errors[0].message.length < 160);
  assert.doesNotThrow(() => f.display.refresh());
  const malformedStatus = state();
  malformedStatus.slots[0].status = { toString: null, valueOf: null };
  assert.doesNotThrow(() => f.display.update(malformedStatus));
  await f.advance(1000);
  assert.equal(f.errors.length, 1, "repeated malformed data must not flood the host log");
  assert.equal(f.messages.length, 2);
  f.display.update(state(86));
  await settle();
  assert.equal(f.messages.length, 3);
  assert.match(f.text(2), /86%/);
  assert.doesNotMatch(f.text(2), /未连接/);
  f.display.dispose();
});

test("unverified native targets fail before creating timers or sending images", () => {
  for (const target of [undefined, {}, { ...TARGET, actionid: "" }, { ...TARGET, key: 3 }]) {
    assert.throws(() => createOverviewDisplay({ target, send() {} }), /verified native window target/);
  }
});
