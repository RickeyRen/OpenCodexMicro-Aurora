import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { OVERVIEW_PLUGIN_UUID, resolveNativeOverviewTarget } from "../plugin/native-overview-target.js";

const ACTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
function nativeWindow() {
  return { Action: "com.ulanzi.ulanzideck.smallwindow.window", ActionID: ACTION_ID,
    ActionParam: { SmallViewMode: 2 }, ViewParam: [{ Icon: "", IconRel: "" }] };
}

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "codex-native-overview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profilesRoot = resolve(root, "ProfilesV2");
  const profilePath = resolve(profilesRoot, "sample.ulanziProfile/Profiles/page/manifest.json");
  const configPath = resolve(root, "deck-overview.json");
  await mkdir(resolve(profilePath, ".."), { recursive: true });
  const config = { enabled: true, profilePath, actionid: ACTION_ID, studioVersion: "3.4.4" };
  const profile = { Controllers: [{ Type: "Encoder", Actions: {} }, { Type: "Keypad", Actions: { "3_2": nativeWindow() } }] };
  const saveConfig = () => writeFile(configPath, JSON.stringify(config));
  const saveProfile = () => writeFile(profilePath, JSON.stringify(profile));
  await saveConfig();
  await saveProfile();
  return { root, configPath, profilePath, profilesRoot, config, profile, saveConfig, saveProfile,
    run: (extra = {}) => resolveNativeOverviewTarget({ configPath, profilesRoot, studioVersion: "3.4.4", ...extra }) };
}

test("explicit opt-in resolves only the existing native window under the plugin's own UUID", async t => {
  const f = await fixture(t);
  const target = await f.run();
  assert.deepEqual(target, { uuid: OVERVIEW_PLUGIN_UUID, actionid: ACTION_ID, key: "3_2" });
  assert.equal(Object.isFrozen(target), true);
  // The resolver does not require or alter any ordinary conversation bindings.
  f.profile.Controllers[1].Actions["0_0"] = { Action: "com.ulanzi.ulanzistudio.codexmicro.task1" };
  await f.saveProfile();
  assert.deepEqual(await f.run(), target);
});

test("missing or disabled configuration stays inert and does not require an installed profile", async t => {
  const f = await fixture(t);
  await rm(f.configPath);
  assert.equal(await f.run(), null);
  await writeFile(f.configPath, JSON.stringify({ enabled: false, profilePath: "/missing/profile.json" }));
  assert.equal(await f.run(), null);
  await writeFile(f.configPath, "{}");
  await assert.rejects(f.run(), { code: "NATIVE_OVERVIEW_CONFIG" });
});

test("unrecognized or changed Studio versions stop before targeting the window", async t => {
  const f = await fixture(t);
  for (const studioVersion of [undefined, "3.4.5", "3.4.4.0", "3.4.3"]) {
    await assert.rejects(f.run({ studioVersion }), { code: "NATIVE_OVERVIEW_VERSION" });
  }
  f.config.studioVersion = "3.4.5";
  await f.saveConfig();
  await assert.rejects(f.run({ studioVersion: "3.4.5" }), { code: "NATIVE_OVERVIEW_VERSION" });
});

test("profile traversal, sibling paths and symlinks outside ProfilesV2 are rejected", async t => {
  const f = await fixture(t);
  const outside = resolve(f.root, "outside.json");
  await writeFile(outside, JSON.stringify(f.profile));
  const sibling = resolve(f.root, "ProfilesV2-extra/manifest.json");
  await mkdir(resolve(sibling, ".."), { recursive: true });
  await writeFile(sibling, JSON.stringify(f.profile));
  for (const profilePath of [outside, sibling, resolve(f.profilesRoot, "..", "outside.json")]) {
    f.config.profilePath = profilePath;
    await f.saveConfig();
    await assert.rejects(f.run(), { code: "NATIVE_OVERVIEW_PROFILE" });
  }
  const link = resolve(f.profilesRoot, "linked.json");
  await symlink(outside, link);
  f.config.profilePath = link;
  await f.saveConfig();
  await assert.rejects(f.run(), { code: "NATIVE_OVERVIEW_PROFILE" });
});

test("a changed action, action ID, clock mode or custom background is never overridden", async t => {
  const mutations = [
    window => { window.Action = "com.ulanzi.ulanzistudio.codexmicro.task1"; },
    window => { window.ActionID = "00000000-0000-0000-0000-000000000000"; },
    window => { window.ActionParam.SmallViewMode = 1; },
    window => { window.ActionParam.SmallViewMode = "2"; },
    window => { window.ViewParam[0].Icon = "data:image/png;base64,user-image"; },
    window => { window.ViewParam[0].IconRel = "Images/custom.gif"; },
    window => { window.ViewParam.push({ Icon: "", IconRel: "" }); },
    window => { delete window.ViewParam; }
  ];
  for (let index = 0; index < mutations.length; index++) {
    await t.test(`changed native setting ${index + 1}`, async t => {
      const f = await fixture(t);
      mutations[index](f.profile.Controllers[1].Actions["3_2"]);
      await f.saveProfile();
      await assert.rejects(f.run(), { code: "NATIVE_OVERVIEW_PROFILE" });
    });
  }
});

test("malformed or oversized JSON produces bounded diagnostics without file contents", async t => {
  const f = await fixture(t);
  for (const content of ["not JSON: private-token", "[]", "null", " ".repeat(1024 * 1024 + 1)]) {
    await writeFile(f.configPath, content);
    await assert.rejects(f.run(), error => {
      assert.equal(error.code, "NATIVE_OVERVIEW_CONFIG");
      assert.ok(error.message.length < 160);
      assert.doesNotMatch(error.message, /private-token|codex-native-overview-/);
      return true;
    });
  }
  await f.saveConfig();
  await writeFile(f.profilePath, " ".repeat(1024 * 1024 + 1));
  await assert.rejects(f.run(), { code: "NATIVE_OVERVIEW_PROFILE" });
});

test("opt-in schema and ambiguous or missing Keypad windows fail closed", async t => {
  const f = await fixture(t);
  for (const changes of [{ enabled: "true" }, { actionid: "not-a-uuid" }, { profilePath: "manifest.json" },
    { profilePath: resolve(f.profilesRoot, "manifest.txt") }]) {
    await writeFile(f.configPath, JSON.stringify({ ...f.config, ...changes }));
    await assert.rejects(f.run(), { code: "NATIVE_OVERVIEW_CONFIG" });
  }
  await f.saveConfig();
  for (const Controllers of [[], [{ Type: "Keypad", Actions: {} }],
    [f.profile.Controllers[1], f.profile.Controllers[1]]]) {
    await writeFile(f.profilePath, JSON.stringify({ Controllers }));
    await assert.rejects(f.run(), { code: "NATIVE_OVERVIEW_PROFILE" });
  }
});

test("environment config override selects an explicit configuration file", async t => {
  const f = await fixture(t);
  const previous = process.env.CODEX_MICRO_OVERVIEW_FILE;
  process.env.CODEX_MICRO_OVERVIEW_FILE = f.configPath;
  try {
    assert.deepEqual(await resolveNativeOverviewTarget({ profilesRoot: f.profilesRoot, studioVersion: "3.4.4" }),
      { uuid: OVERVIEW_PLUGIN_UUID, actionid: ACTION_ID, key: "3_2" });
  } finally {
    if (previous === undefined) delete process.env.CODEX_MICRO_OVERVIEW_FILE;
    else process.env.CODEX_MICRO_OVERVIEW_FILE = previous;
  }
});
