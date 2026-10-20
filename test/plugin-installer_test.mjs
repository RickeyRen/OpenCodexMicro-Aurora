import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const root = new URL("../", import.meta.url);

test("local plugin installation includes native animation assets, not only icons", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-micro-install-"));
  try {
    await exec(process.execPath, ["scripts/install-plugin.mjs"], {
      cwd: root,
      env: { ...process.env, HOME: home },
      timeout: 10000
    });
    const installed = join(home, "Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.ulanzi.codexmicro.ulanziPlugin");
    assert.ok((await stat(join(installed, "runtime/key-glyph-renderer"))).mode & 0o111,
      "the prebuilt glyph compositor must retain its executable permission");
    for (const status of ["working", "attention", "error"]) {
      const name = `assets/neon/task-${status}.gif`;
      const source = await readFile(new URL(`integration/com.ulanzi.codexmicro.ulanziPlugin/${name}`, root));
      assert.deepEqual(await readFile(join(installed, name)), source);
    }
    for (const status of ["idle", "complete", "offline", "empty", "unknown"]) {
      const png = await readFile(join(installed, `assets/neon/task-${status}.png`));
      assert.equal(png.subarray(1, 4).toString(), "PNG");
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
