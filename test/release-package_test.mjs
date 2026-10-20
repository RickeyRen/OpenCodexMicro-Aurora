import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { inspectReleaseBytes, isAllowedReleasePath, packageRelease, REQUIRED_RELEASE_FILES } from "../scripts/package-release.mjs";

const run = promisify(execFile);
const PLUGIN = "integration/com.ulanzi.codexmicro.ulanziPlugin";

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "opencodexmicro-package-test-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function write(path, value) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, value);
  }
  // All required inputs are public fixture bytes; no real app, profile,
  // repository, account, or installed plugin is inspected by these tests.
  for (const path of REQUIRED_RELEASE_FILES) await write(path, `Public source fixture: ${path}\n`);
  await write("package.json", JSON.stringify({ version: "0.5.0", type: "module" }));
  await write(`${PLUGIN}/package.json`, JSON.stringify({ version: "0.5.0" }));
  await write(`${PLUGIN}/manifest.json`, JSON.stringify({ Version: "0.5.0", UUID: "com.ulanzi.ulanzistudio.codexmicro" }));
  const helper = Buffer.alloc(32);
  helper.writeUInt32LE(0xfeedfacf, 0);
  helper.writeUInt32LE(0x0100000c, 4);
  await write(`${PLUGIN}/runtime/key-glyph-renderer`, helper);
  await chmod(join(root, PLUGIN, "runtime/key-glyph-renderer"), 0o755);
  await run("git", ["init", "--quiet"], { cwd: root });
  // Force only these synthetic fixtures into their temporary index so global
  // ignore settings cannot weaken the tracked-sensitive-file exclusion test.
  async function track(...paths) { await run("git", ["add", "-f", "--", ...paths], { cwd: root }); }
  await track(".");
  return { root, write, track };
}

test("the release allowlist rejects traversal, local state and credentials even if tracked", () => {
  for (const path of ["../README.md", "/README.md", "src/../README.md", "src\\bridge\\server.mjs", "docs/\nnotes.md", ".env",
    ".env.production", ".private/apple-signing/team.p12", "node_modules/package.json", "ProfilesV2/page/manifest.json",
    `${PLUGIN}/.key-cache/task-v2.png`, `${PLUGIN}/node_modules/runtime.js`, `${PLUGIN}/runtime/key-glyph-renderer.log`,
    "src/bridge/secrets.mjs", "src/bridge/credentials.mjs", "docs/personal.db", "poc/legacy-driver.c"]) {
    assert.equal(isAllowedReleasePath(path), false, path);
  }
  for (const path of ["README.md", "SECURITY.md", "scripts/setup-overview.mjs", "src/bridge/server.mjs",
    `${PLUGIN}/dist/app.js`, `${PLUGIN}/runtime/key-glyph-renderer`, "docs/images/aurora-demo.gif"]) {
    assert.equal(isAllowedReleasePath(path), true, path);
  }
});

test("real packaging sources pass their own scanner while every supported private-key header remains rejected", async () => {
  for (const path of ["scripts/package-release.mjs", "test/release-package_test.mjs"]) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.doesNotThrow(() => inspectReleaseBytes(path, bytes), path);
  }
  for (const kind of ["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY", "OPENSSH PRIVATE KEY", "ENCRYPTED PRIVATE KEY", "PGP PRIVATE KEY BLOCK"]) {
    const header = ["-----BEGIN ", kind, "-----"].join("");
    const bytes = Buffer.concat([Buffer.from([0, 255, 1]), Buffer.from(header)]);
    assert.throws(() => inspectReleaseBytes("assets/example.bin", bytes), /sensitive key\/token material/, kind);
  }
});

test("the ZIP contains installable sources and audited runtime files, excludes local data, and verifies its checksum", async t => {
  const { root, write, track } = await fixture(t);
  const forbidden = [".env", ".private/apple-signing/team.p12", "ProfilesV2/page/manifest.json", "local/profile.db",
    `${PLUGIN}/.key-cache/task-v2.png`, `${PLUGIN}/node_modules/runtime.js`, "logs/session.log"];
  for (const path of forbidden) await write(path, "PRIVATE SENTINEL");
  await write("docs/images/aurora-demo.gif", "Public animated demo fixture");
  await track(...forbidden, "docs/images/aurora-demo.gif");
  await write("docs/images/untracked-local.png", "UNTRACKED SENTINEL");
  const result = await packageRelease({ repositoryRoot: root });
  assert.equal(result.archivePath, join(root, "release/OpenCodexMicro-Aurora-0.5.0-macos-arm64.zip"));
  const prefix = "OpenCodexMicro-Aurora-0.5.0-macos-arm64/";
  const { stdout: listing } = await run("/usr/bin/unzip", ["-Z1", result.archivePath]);
  const entries = listing.trim().split("\n");
  for (const path of ["README.md", "scripts/install.mjs", "scripts/setup-overview.mjs", "docs/images/aurora-demo.gif",
    `${PLUGIN}/dist/app.js`, `${PLUGIN}/runtime/key-glyph-renderer`, "RELEASE_MANIFEST.json"]) {
    assert.ok(entries.includes(`${prefix}${path}`), path);
  }
  assert.ok(entries.every(path => path.startsWith(prefix) && !path.split("/").includes("..")));
  for (const path of [...forbidden, "docs/images/untracked-local.png", ".git/config"]) {
    assert.ok(!entries.includes(`${prefix}${path}`), path);
  }
  const { stdout } = await run("/usr/bin/unzip", ["-p", result.archivePath, `${prefix}RELEASE_MANIFEST.json`]);
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.version, "0.5.0");
  assert.equal(manifest.architecture, "arm64");
  const readme = manifest.files.find(file => file.path === "README.md");
  assert.equal(readme.sha256, createHash("sha256").update(await readFile(join(root, "README.md"))).digest("hex"));
  assert.ok(manifest.files.every(file => typeof file.path === "string" && !file.path.startsWith("/")));
  await run("/usr/bin/shasum", ["-a", "256", "-c", "SHA256SUMS"], { cwd: join(root, "release") });
  assert.equal(await readFile(join(root, forbidden[0]), "utf8"), "PRIVATE SENTINEL", "packaging must not edit local inputs");
});

test("packaging rejects a tracked symlink before reading its outside target", async t => {
  const { root, track } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), "opencodexmicro-outside-test-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, "local-data"), "OUTSIDE SENTINEL");
  await symlink(join(outside, "local-data"), join(root, "src/bridge/additional.mjs"));
  await track("src/bridge/additional.mjs");
  await assert.rejects(packageRelease({ repositoryRoot: root }), /non-regular tracked entry rejected/);
});

test("sensitive content in otherwise allowed files fails closed without printing its value", async t => {
  const { root, write } = await fixture(t);
  const secrets = [
    ["-----BEGIN ", "RSA PRIVATE KEY", "-----\nfixture\n-----END ", "RSA PRIVATE KEY", "-----"].join(""),
    ["ghp", "a".repeat(40)].join("_"),
    "/" + ["Users", "local-person", "private-project"].join("/")
  ];
  for (const secret of secrets) {
    await write("README.md", secret);
    await assert.rejects(packageRelease({ repositoryRoot: root }), error => {
      assert.match(error.message, /sensitive key\/token material|personal home path/);
      assert.ok(!error.message.includes(secret));
      return true;
    });
  }
});

test("missing tracked resources, inconsistent versions and wrong architectures cannot be packaged", async t => {
  const { root, write } = await fixture(t);
  await write(`${PLUGIN}/manifest.json`, JSON.stringify({ Version: "0.4.2", UUID: "com.ulanzi.ulanzistudio.codexmicro" }));
  await assert.rejects(packageRelease({ repositoryRoot: root }), /version mismatch/);
  await write(`${PLUGIN}/manifest.json`, JSON.stringify({ Version: "0.5.0", UUID: "com.ulanzi.ulanzistudio.codexmicro" }));
  await write(`${PLUGIN}/runtime/key-glyph-renderer`, Buffer.alloc(32));
  await assert.rejects(packageRelease({ repositoryRoot: root }), /requires an arm64 Mach-O/);
  await run("git", ["rm", "--cached", "--quiet", "--", `${PLUGIN}/dist/app.js`], { cwd: root });
  await assert.rejects(packageRelease({ repositoryRoot: root }), /required tracked file is missing/);
});

test("a repeated packaging command cannot silently replace an existing release", async t => {
  const { root } = await fixture(t);
  const first = await packageRelease({ repositoryRoot: root });
  const archive = await readFile(first.archivePath);
  const sums = await readFile(first.checksumsPath);
  await assert.rejects(packageRelease({ repositoryRoot: root }), /output already exists/);
  assert.deepEqual(await readFile(first.archivePath), archive);
  assert.deepEqual(await readFile(first.checksumsPath), sums);
});
