import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const PLUGIN = "integration/com.ulanzi.codexmicro.ulanziPlugin";
const ROOT_FILES = new Set([".gitignore", "AGENTS.md", "README.md", "README_zh.md", "LICENSE", "NOTICE.md",
  "THIRD_PARTY_NOTICES.md", "SECURITY.md", "CONTRIBUTING.md", "CHANGELOG.md", "package.json", "package-lock.json"]);
const LOCALES = ["en", "zh_CN", "zh_HK", "ja_JP", "de_DE", "ko_KR", "pt_PT", "es_ES"];
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const FIXED_TIME = new Date("2000-01-01T00:00:00.000Z");
// Assemble the marker so this source remains scannable without containing a
// complete private-key header itself. Detection is identical for real inputs.
const PRIVATE_KEY_HEADER = new RegExp("-----BEGIN " + "(?:(?:[A-Z ]+ )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----");

export const REQUIRED_RELEASE_FILES = Object.freeze([
  "README.md", "README_zh.md", "LICENSE", "NOTICE.md", "THIRD_PARTY_NOTICES.md", "package.json", "package-lock.json",
  "bridge/CodexBridge.png", "scripts/install.mjs", "scripts/install-plugin.mjs", "scripts/uninstall.mjs",
  "scripts/build-bridge.mjs", "scripts/doctor.mjs", "scripts/setup-overview.mjs", "scripts/package-release.mjs",
  "src/bridge/server.mjs", "src/bridge/codex-cdp.mjs", "src/bridge/sidebar-slots.mjs", "src/bridge/thread-key.mjs", "src/bridge/usage-window.mjs",
  ...["manifest.json", "package.json", "package-lock.json", "build.mjs", "build-key-art.mjs", "build-runtime.mjs",
    "dist/app.js", "dist/package.json", "property-inspector/setup.html", "runtime/key-glyph-renderer",
    "installer/bridge.mjs", "installer/CodexBridge.png", "installer/LICENSE", "installer/NOTICE.md", "installer/THIRD_PARTY_NOTICES.md",
    ...LOCALES.map(locale => `${locale}.json`),
    ...["working.gif", "attention.gif", "error.gif", "idle.png", "complete.png", "offline.png", "empty.png", "unknown.png"]
      .map(name => `assets/neon/task-${name}`)].map(name => `${PLUGIN}/${name}`)
]);

/** Only audited source/resource locations can enter a release, even if Git tracks more. */
export function isAllowedReleasePath(path) {
  if (typeof path !== "string" || isAbsolute(path) || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)
    || path.split("/").some(part => part === ".." || part === "." || !part)) return false;
  if (/(?:^|\/)(?:node_modules|\.git|\.private|\.key-cache|DerivedData|profiles?|backups?|cache|release)(?:\/|$)/i.test(path)
    || /(?:^|\/)\.env(?:\.|$)/i.test(path)
    || /\.(?:p12|pfx|pem|key|keychain-db|sqlite3?|db|log|xcresult|mobileprovision|provisionprofile|cer)$/i.test(path)
    || /(?:^|\/)[^/]*(?:secret|credential|private-key)[^/]*$/i.test(path)) return false;
  if (ROOT_FILES.has(path) || path === "bridge/CodexBridge.png" || path === "design/deck-motion-options.fragment.html") return true;
  if (/^src\/bridge\/[a-z0-9_-]+\.mjs$/i.test(path) || /^test\/[a-z0-9_-]+_test\.mjs$/i.test(path)) return true;
  if (/^scripts\/(?:build-bridge|build-design-preview|build-launch-media|doctor|install-plugin|install|uninstall|setup-overview|package-release)\.mjs$/.test(path)) return true;
  if (/^docs\/[a-z0-9_-]+\.md$/i.test(path) || /^docs\/images\/[a-z0-9_.-]+\.(?:png|jpe?g|gif|webp|svg|mp4)$/i.test(path)) return true;
  if (/^skills\/(?:install-ulanzi-studio-plugin|setup-codex-bridge)\/(?:SKILL\.md|agents\/openai\.yaml)$/.test(path)) return true;
  if (!path.startsWith(`${PLUGIN}/`)) return false;
  const item = path.slice(PLUGIN.length + 1);
  return [
    /^(?:manifest|package|package-lock)\.json$/,
    /^(?:en|zh_CN|zh_HK|ja_JP|de_DE|ko_KR|pt_PT|es_ES)\.json$/,
    /^build(?:-key-art|-runtime)?\.mjs$/,
    /^assets\/(?:icons|neon|banners)\/[a-z0-9_.-]+\.(?:png|gif|svg)$/i,
    /^dist\/(?:app\.js|package\.json)$/,
    /^installer\/(?:bridge\.mjs|CodexBridge\.png|LICENSE|NOTICE\.md|THIRD_PARTY_NOTICES\.md)$/,
    /^runtime\/(?:README\.md|key-glyph-renderer)$/,
    /^plugin\/[a-z0-9_-]+\.(?:js|m)$/i,
    /^property-inspector\/setup\.html$/,
    /^test\/(?:[a-z0-9_-]+_test|smoke)\.mjs$/i
  ].some(pattern => pattern.test(item));
}

function fail(message) { throw new Error(`Release package: ${message}`); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export function inspectReleaseBytes(path, bytes) {
  // Inspect binary resources too: an accidentally embedded credential or build
  // machine path must not be hidden by a filename extension.
  const text = bytes.toString("utf8");
  if (PRIVATE_KEY_HEADER.test(text)
    || /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})/.test(text)) {
    fail(`sensitive key/token material detected in ${path}`);
  }
  const publicExamples = new Set(["example", "test", "user", "username", "you", "runner", "yourname", "YOUR_USER"]);
  for (const match of text.matchAll(/\/Users\/([^/\s"'<>]+)/g)) {
    if (!publicExamples.has(match[1])) fail(`personal home path detected in ${path}`);
  }
}

async function readTrackedFile(root, path, gitMode) {
  if (!["100644", "100755"].includes(gitMode)) fail(`non-regular tracked entry rejected: ${path}`);
  const absolute = join(root, path);
  // realpath containment also rejects a symlinked parent directory. The final
  // O_NOFOLLOW open and fstat prevent a symlink/file replacement at the leaf.
  const actual = await realpath(absolute);
  if (actual !== absolute) fail(`symlinked release input rejected: ${path}`);
  const file = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > MAX_FILE_BYTES) fail(`invalid or oversized release input: ${path}`);
    const bytes = Buffer.alloc(info.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await file.read(bytes, count, bytes.length - count, null);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    if (count !== info.size) fail(`release input changed while reading: ${path}`);
    const content = bytes.subarray(0, count);
    inspectReleaseBytes(path, content);
    return content;
  } finally { await file.close(); }
}

/** Build a source + prebuilt-plugin ZIP. Never installs or starts software. */
export async function packageRelease({ repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  const root = await realpath(repositoryRoot);
  const gitEnvironment = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const variable of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete gitEnvironment[variable];
  const options = { cwd: root, timeout: 30_000, maxBuffer: 8 * 1024 * 1024, env: gitEnvironment };
  const { stdout: top } = await run("git", ["rev-parse", "--show-toplevel"], options);
  if (await realpath(top.trim()) !== root) fail("run from the intended repository root");
  const { stdout } = await run("git", ["ls-files", "--stage", "-z"], options);
  const files = [];
  let total = 0;
  for (const entry of stdout.split("\0").filter(Boolean)) {
    const match = entry.match(/^(\d+) ([a-f\d]+) (\d)\t([\s\S]+)$/);
    if (!match) fail("unrecognized Git index entry");
    const [, mode, , stage, path] = match;
    if (!isAllowedReleasePath(path)) continue;
    if (stage !== "0") fail(`unmerged release input: ${path}`);
    const bytes = await readTrackedFile(root, path, mode);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) fail("release inputs exceed 64 MiB");
    files.push({ path, bytes, mode });
  }
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const byPath = new Map(files.map(file => [file.path, file]));
  for (const path of REQUIRED_RELEASE_FILES) if (!byPath.has(path)) fail(`required tracked file is missing: ${path}`);
  const metadata = JSON.parse(byPath.get("package.json").bytes.toString("utf8"));
  const version = metadata.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[a-z\d.-]+)?$/i.test(version)) fail("invalid release version");
  for (const path of [`${PLUGIN}/manifest.json`, `${PLUGIN}/package.json`]) {
    const item = JSON.parse(byPath.get(path).bytes.toString("utf8"));
    if ((item.Version ?? item.version) !== version) fail(`version mismatch in ${path}`);
    if (path.endsWith("/manifest.json") && item.UUID !== "com.ulanzi.ulanzistudio.codexmicro") fail("unexpected plugin UUID");
  }
  const helper = byPath.get(`${PLUGIN}/runtime/key-glyph-renderer`).bytes;
  if (helper.length < 32 || helper.readUInt32LE(0) !== 0xfeedfacf || helper.readUInt32LE(4) !== 0x0100000c) {
    fail("the macos-arm64 release requires an arm64 Mach-O glyph renderer");
  }
  const name = `OpenCodexMicro-Aurora-${version}-macos-arm64`;
  const output = join(root, "release");
  await mkdir(output, { recursive: true });
  if (!(await lstat(output)).isDirectory() || (await lstat(output)).isSymbolicLink()) fail("release output must be a regular directory");
  const archivePath = join(output, `${name}.zip`);
  const checksumsPath = join(output, "SHA256SUMS");
  // Avoid silently replacing an already published package/checksum pair.
  for (const path of [archivePath, checksumsPath]) {
    try { await lstat(path); fail(`output already exists: ${basename(path)}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const temporary = await mkdtemp(join(tmpdir(), "opencodexmicro-release-"));
  let copied = false;
  try {
    const stage = join(temporary, name);
    await mkdir(stage);
    for (const file of files) {
      const destination = join(stage, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, file.bytes, { mode: file.mode === "100755" ? 0o755 : 0o644 });
      await utimes(destination, FIXED_TIME, FIXED_TIME);
    }
    const manifest = { schemaVersion: 1, project: "OpenCodexMicro Aurora", version, platform: "macos", architecture: "arm64",
      files: files.map(({ path, bytes }) => ({ path, bytes: bytes.length, sha256: digest(bytes) })) };
    const manifestPath = join(stage, "RELEASE_MANIFEST.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await utimes(manifestPath, FIXED_TIME, FIXED_TIME);
    const temporaryArchive = join(temporary, `${name}.zip`);
    await run("/usr/bin/zip", ["-X", "-q", "-r", temporaryArchive, name], { cwd: temporary, timeout: 60_000, maxBuffer: 1024 * 1024 });
    await run("/usr/bin/unzip", ["-tq", temporaryArchive], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const checksum = digest(await readFile(temporaryArchive));
    await copyFile(temporaryArchive, archivePath, constants.COPYFILE_EXCL);
    copied = true;
    await chmod(archivePath, 0o644);
    await writeFile(checksumsPath, `${checksum}  ${basename(archivePath)}\n`, { flag: "wx", mode: 0o644 });
    return { archivePath, checksumsPath, fileCount: files.length, checksum, version };
  } catch (error) {
    if (copied) await rm(archivePath, { force: true });
    throw error;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error("Usage: node scripts/package-release.mjs");
  const result = await packageRelease();
  console.log(`Packaged ${relative(process.cwd(), result.archivePath)} (${result.fileCount} audited files)`);
  console.log(`Checksums: ${relative(process.cwd(), result.checksumsPath)}`);
}
