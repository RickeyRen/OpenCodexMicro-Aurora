import assert from "node:assert/strict";
import test from "node:test";
import { createTaskDisplay } from "../plugin/task-display.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function fixture() {
  const instance = { uuid: "test.task1", actionid: "action-1", key: "1_1", active: true, lastDisplay: null };
  const jobs = [];
  const messages = [];
  let current = instance;
  const display = createTaskDisplay({
    theme: "orb",
    artwork: {
      render(...arguments_) {
        const job = { ...deferred(), arguments: arguments_ };
        jobs.push(job);
        return job.promise;
      }
    },
    send: message => messages.push(message),
    isCurrent: candidate => candidate === current
  });
  return { instance, jobs, messages, display, replace: value => { current = value; },
    states: () => messages.filter(message => message.cmd === "state").map(message => message.param.statelist[0]) };
}

test("unchanged key images encode once and keep the native animation running", async () => {
  const { display, instance, jobs, states } = fixture();
  const operation = display(instance, "running", "研发\n对话", "01");
  assert.equal(display(instance, "working", "研发\n对话", "01"), undefined);
  assert.equal(display(instance, "working", "研发\n对话", "01"), undefined);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].arguments, ["working", "研发\n对话", "01"]);
  jobs[0].resolve({ type: 4, gifpath: ".key-cache/working.gif" });
  await operation;
  assert.equal(instance.pendingDisplay, null);
  assert.deepEqual(states(), [{ uuid: instance.uuid, actionid: instance.actionid, key: instance.key,
    type: 4, gifpath: ".key-cache/working.gif", showtext: false, textdata: "研发\n对话" }]);
  display(instance, "working", "研发\n对话", "01");
  assert.equal(jobs.length, 1, "polling an unchanged state must not encode or restart its GIF");
  assert.equal(states().length, 1);
});

test("A displayed, B deferred, A requested never lets B overwrite A", async () => {
  const { display, instance, jobs, states } = fixture();
  const first = display(instance, "working", "研发", "01");
  jobs[0].resolve({ type: 4, gifpath: "A.gif" });
  await first;
  const digestA = instance.lastDisplay;
  const second = display(instance, "attention", "审批", "02");
  assert.equal(jobs.length, 2);
  assert.notEqual(instance.desiredDisplay, digestA);
  assert.equal(display(instance, "working", "研发", "01"), undefined);
  assert.equal(instance.desiredDisplay, digestA, "a cache hit must still update the latest requested image");
  jobs[1].resolve({ type: 4, gifpath: "B.gif" });
  await second;
  assert.equal(instance.lastDisplay, digestA);
  assert.deepEqual(states().map(state => state.gifpath), ["A.gif"]);
  assert.equal(jobs.length, 2, "returning to the displayed image needs no new encoder job");
});

test("late renders cannot replace a newer label, status or conversation identifier", async () => {
  const { display, instance, jobs, states } = fixture();
  const operations = [
    display(instance, "working", "研发", "01"),
    display(instance, "awaiting-approval", "研发", "01"),
    display(instance, "attention", "审核", "01"),
    display(instance, "attention", "审核", "02")
  ];
  assert.equal(jobs.length, 4);
  // Finish the newest image first, then deliberately complete older images in
  // a different order from the requests, as delayed native work might do.
  jobs[3].resolve({ type: 4, gifpath: "latest.gif" });
  await operations[3];
  for (const index of [1, 0, 2]) {
    jobs[index].resolve({ type: 4, gifpath: `old-${index}.gif` });
    await operations[index];
  }
  assert.deepEqual(states().map(state => [state.gifpath, state.textdata]), [["latest.gif", "审核"]]);
  assert.equal(instance.lastDisplay, instance.desiredDisplay);
});

test("deactivated, deleted and replaced keys suppress their unfinished images", async t => {
  for (const kind of ["deactivated", "deleted", "replaced"]) {
    await t.test(kind, async () => {
      const { display, instance, jobs, states, replace } = fixture();
      const operation = display(instance, "working", "研发", "01");
      if (kind === "deactivated") instance.active = false;
      else replace(kind === "deleted" ? null : { ...instance });
      jobs[0].resolve({ type: 4, gifpath: "stale.gif" });
      await operation;
      assert.deepEqual(states(), []);
      assert.equal(instance.lastDisplay, null);
    });
  }
});

test("native encoding errors keep a readable current-state fallback", async () => {
  const { display, instance, jobs, states, messages } = fixture();
  const operation = display(instance, "awaiting-approval", "审核\n代码", "09");
  jobs[0].reject(new Error("renderer unavailable"));
  await operation;
  const state = states()[0];
  assert.equal(state.type, 1);
  assert.equal(state.showtext, false);
  assert.equal(state.textdata, "审核\n代码");
  const svg = Buffer.from(state.data.split(",")[1], "base64").toString("utf8");
  assert.ok(svg.includes("审核") && svg.includes("代码") && svg.includes("09"));
  assert.equal(messages.find(message => message.cmd === "logMessage")?.level, "error");
});
