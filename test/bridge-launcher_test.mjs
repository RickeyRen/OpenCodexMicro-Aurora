import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { bridgeLauncher } from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/bridge-launcher.js";

const execute = promisify(execFile);
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

// Every command used by the generated wrapper is replaced before execution.
// These tests cannot inspect, start, quit, sign, or attach to the real app.
async function runIsolatedLauncher({ processStatus, endpointStatus = 0, binaryExists = true }) {
  const temporary = await mkdtemp(join(tmpdir(), "codex-bridge-launcher-"));
  const callsFile = join(temporary, "calls");
  const fixtureCommands = join(temporary, "fixture commands");
  await mkdir(fixtureCommands);
  let script = bridgeLauncher;
  const commands = {
    "/usr/bin/osascript": 0,
    "/usr/bin/pgrep": processStatus,
    "/usr/bin/nohup": 0,
    "/usr/bin/curl": endpointStatus,
    "/bin/sleep": 0
  };
  for (const [original, status] of Object.entries(commands)) {
    const name = original.split("/").at(-1);
    const fixture = join(fixtureCommands, name);
    // Model macOS where process-name matching misses the path-named app and
    // pgrep excludes ancestors unless -a is present. Both occur when this
    // launcher is invoked from the app's own terminal.
    const pgrepGuard = name === "pgrep"
      ? `if [ "$1" != '-a' ] || [ "$2" != '-f' ] || [ "$3" != ${shellQuote('^/Applications/ChatGPT\\.app/Contents/MacOS/ChatGPT([[:space:]]|$)')} ]; then exit 1; fi\n`
      : "";
    await writeFile(fixture, `#!/bin/sh
printf '%s\\t%s\\n' ${shellQuote(name)} "$*" >> ${shellQuote(callsFile)}
${pgrepGuard}exit ${status}
`, { mode: 0o755 });
    script = script.replaceAll(original, shellQuote(fixture));
  }
  const binary = join(temporary, "Fake ChatGPT");
  if (binaryExists) await writeFile(binary, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  script = script
    .replaceAll("/Applications/ChatGPT.app/Contents/MacOS/ChatGPT", binary)
    .replaceAll("$HOME/Library/Logs/OpenCodexMicro-codex-bridge.log", join(temporary, "bridge.log"));
  // Fixed absolute system commands must not survive fixture replacement.
  assert.doesNotMatch(script, /\/(?:usr\/bin|bin)\/(?:osascript|pgrep|nohup|curl|sleep)\b/);
  // The real nohup ignores a parent's hangup and keeps Codex running. Our
  // finite shell substitute must finish recording its call before zsh exits:
  // an instant-success curl can otherwise make zsh send SIGHUP first. Join all
  // fixture jobs at each test-only exit; preserve the production exit codes and
  // launch commands so duplicate launches and incorrect arguments still fail.
  const exitPattern = /^([ \t]*)exit ([0-9]+)$/gm;
  assert.ok([...script.matchAll(exitPattern)].length > 0);
  script = script.replace(exitPattern, "$1wait\n$1exit $2");
  const launcher = join(temporary, "launcher.zsh");
  await writeFile(launcher, script);
  try {
    let code = 0;
    try {
      await execute("/bin/zsh", ["-f", launcher], { timeout: 5000 });
    } catch (error) {
      assert.equal(typeof error.code, "number", error.message);
      code = error.code;
    }
    const calls = (await readFile(callsFile, "utf8").catch(() => ""))
      .trim().split("\n").filter(Boolean)
      .map(line => ({ command: line.split("\t")[0], arguments: line.slice(line.indexOf("\t") + 1) }));
    return { code, calls };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const macOnly = { skip: process.platform !== "darwin" };

test("running Codex is left untouched and requires a manual exit", macOnly, async () => {
  const { code, calls } = await runIsolatedLauncher({ processStatus: 0 });
  assert.equal(code, 1);
  assert.deepEqual(calls.map(call => call.command), ["pgrep", "osascript"]);
  assert.equal(calls[0].arguments, '-a -f ^/Applications/ChatGPT\\.app/Contents/MacOS/ChatGPT([[:space:]]|$)');
  assert.match(calls[1].arguments, /quit Codex yourself/);
  assert.match(calls[1].arguments, /手动退出 Codex/);
  assert.doesNotMatch(calls[1].arguments, /tell application|to quit/);
});

test("process discovery failure stops before any application launch", macOnly, async () => {
  const { code, calls } = await runIsolatedLauncher({ processStatus: 2 });
  assert.equal(code, 1);
  assert.deepEqual(calls.map(call => call.command), ["pgrep", "osascript"]);
  assert.match(calls[1].arguments, /could not be verified/);
});

test("missing Codex executable stops without probing or launching processes", macOnly, async () => {
  const { code, calls } = await runIsolatedLauncher({ processStatus: 1, binaryExists: false });
  assert.equal(code, 1);
  assert.deepEqual(calls.map(call => call.command), ["osascript"]);
});

test("closed Codex launches exactly once with loopback-only debugging", macOnly, async () => {
  const { code, calls } = await runIsolatedLauncher({ processStatus: 1 });
  assert.equal(code, 0);
  const launches = calls.filter(call => call.command === "nohup");
  assert.equal(launches.length, 1);
  assert.match(launches[0].arguments, /--remote-debugging-address=127\.0\.0\.1/);
  assert.match(launches[0].arguments, /--remote-debugging-port=9222/);
  assert.equal(calls.filter(call => call.command === "osascript").length, 0);
});

test("unavailable endpoint reports failure without restarting or relaunching", macOnly, async () => {
  const { code, calls } = await runIsolatedLauncher({ processStatus: 1, endpointStatus: 1 });
  assert.equal(code, 1);
  assert.equal(calls.filter(call => call.command === "nohup").length, 1);
  assert.equal(calls.filter(call => call.command === "curl").length, 1);
  assert.match(calls.find(call => call.command === "osascript").arguments, /No restart was attempted/);
});

test("shared launcher contains no application shutdown or signing commands", () => {
  assert.doesNotMatch(bridgeLauncher, /tell application|\b(?:kill|pkill|killall|codesign|security|launchctl)\b/);
});

test("repository installer uses the same safe launcher as the bundled installer", async () => {
  const source = await readFile(new URL("../scripts/install.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ bridgeLauncher \} from "[^"\n]+\/bridge-launcher\.js";/);
  assert.match(source, /writeFile\(bridgeExecutable, bridgeLauncher,/);
  assert.doesNotMatch(source, /tell application|\b(?:pkill|killall)\b/);
});
