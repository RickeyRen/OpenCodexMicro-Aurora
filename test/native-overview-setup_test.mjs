import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { configureOverview, discoverOverviewProfiles, inspectOverviewProfile, parseOverviewArgs } from "../scripts/setup-overview.mjs";
import { resolveNativeOverviewTarget } from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/native-overview-target.js";

const ACTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TASK = "com.ulanzi.ulanzistudio.codexmicro.task";
function profile() {
  const actions = Object.fromEntries(Array.from({ length: 13 }, (_, index) => [
    `key-${index}`, { Action: `${TASK}${index + 1}`, ActionID: `conversation-${index}` }
  ]));
  actions["3_2"] = { Action: "com.ulanzi.ulanzideck.smallwindow.window", ActionID: ACTION_ID,
    ActionParam: { SmallViewMode: 2 }, ViewParam: [{ Icon: "", IconRel: "" }] };
  return { Controllers: [{ Type: "Encoder", Actions: {} }, { Type: "Keypad", Actions: actions }] };
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "codex-overview-setup-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profilesRoot = join(root, "ProfilesV2");
  const profilePath = join(profilesRoot, "arbitrary-name/Profiles/unrelated-name/manifest.json");
  const configPath = join(root, "local-only/deck-overview.json");
  await mkdir(dirname(profilePath), { recursive: true });
  const value = profile();
  const save = () => writeFile(profilePath, JSON.stringify(value));
  await save();
  const options = { profilesRoot, configPath, studioVersion: "3.4.4", platform: "darwin" };
  return { root, profilesRoot, profilePath, configPath, value, save,
    run: extra => configureOverview({ ...options, ...extra }) };
}

const absent = async path => assert.rejects(access(path), { code: "ENOENT" });

test("default discovery uses action content and is completely read-only", async t => {
  const f = await fixture(t);
  const before = await readFile(f.profilePath);
  const report = await f.run();
  assert.equal(report.mode, "status");
  assert.equal(report.enabled, false);
  assert.equal(report.supported, true);
  assert.deepEqual(report.profiles, [{ profilePath: f.profilePath, actionid: ACTION_ID, taskCount: 13, ready: true, reason: null }]);
  assert.deepEqual(await readFile(f.profilePath), before);
  await absent(dirname(f.configPath));
});

test("explicit enable writes a private compatible opt-in without changing any profile bindings", async t => {
  const f = await fixture(t);
  const before = await readFile(f.profilePath);
  const report = await f.run({ mode: "enable" });
  assert.equal(report.message, "enabled");
  assert.deepEqual(JSON.parse(await readFile(f.configPath, "utf8")), {
    enabled: true, studioVersion: "3.4.4", profilePath: f.profilePath, actionid: ACTION_ID
  });
  assert.equal((await stat(f.configPath)).mode & 0o777, 0o600);
  assert.deepEqual(await readFile(f.profilePath), before);
  assert.deepEqual(await resolveNativeOverviewTarget({ configPath: f.configPath, profilesRoot: f.profilesRoot, studioVersion: "3.4.4" }), {
    uuid: "com.ulanzi.ulanzistudio.codexmicro", actionid: ACTION_ID, key: "3_2"
  });
});

test("dry run validates but creates neither config nor directories; disable leaves the long window untouched", async t => {
  const f = await fixture(t);
  const before = await readFile(f.profilePath);
  assert.equal((await f.run({ mode: "enable", dryRun: true })).message, "dry_run");
  await absent(dirname(f.configPath));
  await f.run({ mode: "enable" });
  assert.equal((await f.run({ mode: "disable", dryRun: true })).message, "dry_run");
  assert.equal(JSON.parse(await readFile(f.configPath)).enabled, true);
  assert.equal((await f.run({ mode: "disable", studioVersion: "9.9.9" })).message, "disabled");
  assert.deepEqual(JSON.parse(await readFile(f.configPath)), { enabled: false });
  assert.deepEqual(await readFile(f.profilePath), before);
});

test("clock modes and imported user backgrounds fail with actionable codes and preserve all files", async t => {
  const mutations = [
    ["clock_mode", window => { window.ActionParam.SmallViewMode = 1; }],
    ["clock_mode", window => { window.ActionParam.SmallViewMode = "2"; }],
    ["custom_background", window => { window.ViewParam[0].Icon = "private-user-image"; }],
    ["custom_background", window => { window.ViewParam[0].IconRel = "Images/custom.gif"; }],
    ["custom_background", window => { window.ViewParam = []; }]
  ];
  for (const [code, mutate] of mutations) await t.test(code, async t => {
    const f = await fixture(t);
    mutate(f.value.Controllers[1].Actions["3_2"]);
    await f.save();
    const before = await readFile(f.profilePath);
    await assert.rejects(f.run({ mode: "enable" }), { code });
    assert.deepEqual(await readFile(f.profilePath), before);
    await absent(f.configPath);
  });
});

test("ambiguous pages require explicit selection instead of choosing the first or newest", async t => {
  const f = await fixture(t);
  const another = join(f.profilesRoot, "second/Profiles/page/manifest.json");
  await mkdir(dirname(another), { recursive: true });
  await writeFile(another, JSON.stringify(profile()));
  await assert.rejects(f.run({ mode: "enable" }), error => error.code === "ambiguous_profile" && error.profiles.length === 2);
  await absent(f.configPath);
  await f.run({ mode: "enable", profilePath: another });
  assert.equal(JSON.parse(await readFile(f.configPath)).profilePath, another);
});

test("all thirteen distinct task numbers and the existing native ActionID must be present", async t => {
  const changes = [
    value => { value.Controllers[1].Actions["key-12"].Action = `${TASK}1`; },
    value => { delete value.Controllers[1].Actions["key-5"]; },
    value => { value.Controllers[1].Actions["3_2"].ActionID = "not-a-uuid"; },
    value => { value.Controllers[1].Actions["3_2"].Action = `${TASK}13`; },
    value => { value.Controllers.push(value.Controllers[1]); }
  ];
  for (const change of changes) {
    const f = await fixture(t);
    change(f.value); await f.save();
    assert.equal(await inspectOverviewProfile(f), null);
    await assert.rejects(f.run({ mode: "enable" }), { code: "missing_profile" });
    await absent(f.configPath);
  }
});

test("unverified Studio and unsupported platforms do not create an opt-in", async t => {
  const f = await fixture(t);
  for (const studioVersion of [null, "3.4.5", "3.4.4.0", "3.0.1"]) {
    await assert.rejects(f.run({ mode: "enable", studioVersion }), { code: "unsupported_studio" });
  }
  await assert.rejects(f.run({ mode: "enable", platform: "linux" }), { code: "unsupported_platform" });
  await absent(f.configPath);
});

test("outside, symlinked, malformed and oversized profile inputs fail closed without leaking contents", async t => {
  const f = await fixture(t);
  const outside = join(f.root, "outside.json");
  await writeFile(outside, JSON.stringify(f.value));
  await assert.rejects(f.run({ mode: "enable", profilePath: outside }), { code: "invalid_profile" });
  const link = join(f.profilesRoot, "linked.json");
  await symlink(f.profilePath, link);
  await assert.rejects(f.run({ mode: "enable", profilePath: link }), { code: "invalid_profile" });
  for (const contents of ["private-secret-invalid-json", "null", "[]", " ".repeat(1024 * 1024 + 1)]) {
    await writeFile(f.profilePath, contents);
    await assert.rejects(f.run({ mode: "enable", profilePath: f.profilePath }), error => {
      assert.equal(error.code, "invalid_profile");
      assert.doesNotMatch(error.message, /private-secret/);
      return true;
    });
  }
  const discovered = await discoverOverviewProfiles(f);
  assert.equal(discovered.incomplete, true);
  await assert.rejects(f.run({ mode: "enable" }), { code: "scan_incomplete" });
  await absent(f.configPath);
});

test("malformed existing config is not overwritten; symlinks and repository config paths are rejected", async t => {
  const f = await fixture(t);
  await mkdir(dirname(f.configPath));
  await writeFile(f.configPath, "private-secret-invalid-json");
  await assert.rejects(f.run({ mode: "enable" }), { code: "invalid_config" });
  assert.equal(await readFile(f.configPath, "utf8"), "private-secret-invalid-json");
  await rm(f.configPath);
  const realConfig = join(f.root, "existing.json");
  await writeFile(realConfig, '{"enabled":false}');
  await symlink(realConfig, f.configPath);
  await assert.rejects(f.run({ mode: "enable" }), { code: "invalid_config" });
  assert.equal(await readFile(realConfig, "utf8"), '{"enabled":false}');
  await rm(f.configPath);
  await assert.rejects(f.run({ mode: "enable", repositoryRoot: f.root }), { code: "config_in_repository" });
  await absent(f.configPath);
});

test("CLI accepts bilingual read-only/status and explicit mutations while rejecting conflicting or relative flags", () => {
  assert.equal(parseOverviewArgs([]).mode, "status");
  const args = parseOverviewArgs(["--enable", "--dry-run", "--lang", "zh", "--json", "--profile", "/tmp/profile.json"]);
  assert.deepEqual({ mode: args.mode, dryRun: args.dryRun, language: args.language, json: args.json, profilePath: args.profilePath },
    { mode: "enable", dryRun: true, language: "zh", json: true, profilePath: "/tmp/profile.json" });
  for (const bad of [["--enable", "--disable"], ["--profile", "relative.json"], ["--lang", "fr"], ["--studio-app"], ["--unknown"]]) {
    assert.throws(() => parseOverviewArgs(bad), { code: "invalid_arguments" });
  }
});
