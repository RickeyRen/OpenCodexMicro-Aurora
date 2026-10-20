import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { createTaskArtwork } from "../plugin/task-artwork.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "codex-micro-key-art-"));
  await mkdir(resolve(root, "assets"));
  await symlink(resolve(packageRoot, "assets", "neon"), resolve(root, "assets", "neon"));
  await symlink(resolve(packageRoot, "runtime"), resolve(root, "runtime"));
  return root;
}

test("task artwork bakes thirteen distinct first glyphs into native state images", { timeout: 30_000 }, async () => {
  const root = await fixture();
  try {
    const { render } = createTaskArtwork({ pluginRoot: root });
    const glyphs = [..."云开智创码语光流星河微风塔"];
    const states = ["working", "attention", "error", "idle", "complete", "unknown", "offline", "empty"];
    const outputs = await Promise.all(glyphs.map((glyph, index) => render(states[index % states.length], glyph)));
    assert.equal(outputs.length, 13);
    assert.equal(new Set(outputs.map(value => value.gifpath ?? value.path)).size, 13);
    for (const [index, artwork] of outputs.entries()) {
      const relative = artwork.gifpath ?? artwork.path;
      assert.match(relative, /^\.key-cache\/task-v2-[a-f0-9]{64}\.(gif|png)$/);
      const file = resolve(root, relative);
      const bytes = await readFile(file);
      assert.ok(bytes.length < 512 * 1024);
      const metadata = await sharp(bytes, { animated: true }).metadata();
      assert.equal(metadata.width, 196);
      if (artwork.type === 4) {
        assert.equal(metadata.format, "gif");
        assert.equal(metadata.pages, 24);
        assert.equal(metadata.pageHeight, 196);
        assert.equal(metadata.loop, 0);
        assert.equal(metadata.delay.length, 24);
        assert.ok(metadata.delay.every(value => value === 80));
        const pixels = await sharp(bytes, { animated: true }).ensureAlpha().raw().toBuffer();
        const frameBytes = 196 * 196 * 4;
        assert.notDeepEqual(pixels.subarray(0, frameBytes), pixels.subarray(frameBytes * 12, frameBytes * 13));
      } else {
        assert.equal(artwork.type, 2);
        assert.equal(metadata.format, "png");
        assert.equal(metadata.height, 196);
      }
      // The title is present in the pixels, rather than delegated to Studio's
      // outlined text layer: the same state without a glyph must be different.
      if (index < states.length) {
        const blank = await render(states[index], "");
        assert.notDeepEqual(bytes, await readFile(resolve(root, blank.gifpath ?? blank.path)));
      }
    }
    assert.equal((await stat(resolve(root, ".key-cache"))).mode & 0o777, 0o700);
    assert.equal((await stat(resolve(root, outputs[0].gifpath))).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("equal pending requests share one render and disk cache survives renderer restart", { timeout: 10_000 }, async () => {
  const root = await fixture();
  try {
    const { render } = createTaskArtwork({ pluginRoot: root });
    const pending = render("running", "研发\r\n对话", "01");
    assert.strictEqual(render("working", " 研发\n对话 ", "01"), pending);
    const artwork = await pending;
    const file = resolve(root, artwork.gifpath);
    const before = await stat(file);
    const restarted = createTaskArtwork({ pluginRoot: root });
    assert.deepEqual(await restarted.render("working", "研发\n对话", "01"), artwork);
    assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
    assert.equal((await readdir(resolve(root, ".key-cache"))).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the disk budget prunes only the renderer's own older artifacts", { timeout: 10_000 }, async () => {
  const root = await fixture();
  try {
    const cacheRoot = resolve(root, ".key-cache");
    await mkdir(cacheRoot);
    for (let index = 0; index < 100; index += 1) {
      const hash = createHash("sha256").update(`old:${index}`).digest("hex");
      await writeFile(resolve(cacheRoot, `task-v1-${hash}.png`), "old task artifact");
    }
    await writeFile(resolve(cacheRoot, "keep-user-file.txt"), "preserve this");
    const { render } = createTaskArtwork({ pluginRoot: root });
    const current = await render("idle", "新");
    const names = await readdir(cacheRoot);
    assert.equal(names.filter(name => /^task-v[12]-[a-f0-9]{64}\.(gif|png)$/.test(name)).length, 96);
    assert.ok(names.includes("keep-user-file.txt"));
    assert.ok(names.includes(current.path.split("/").at(-1)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a rebuilt background palette invalidates persistent glyph artwork", { timeout: 10_000 }, async () => {
  const root = await fixture();
  try {
    const initial = createTaskArtwork({ pluginRoot: root });
    const oldArtwork = await initial.render("idle", "色");
    await rm(resolve(root, "assets", "neon"));
    await mkdir(resolve(root, "assets", "neon"));
    const newBackground = await sharp({
      create: { width: 196, height: 196, channels: 4, background: "#1234FF" }
    }).png().toBuffer();
    await writeFile(resolve(root, "assets", "neon", "task-idle.png"), newBackground);
    const restarted = createTaskArtwork({ pluginRoot: root });
    const newArtwork = await restarted.render("idle", "色");
    assert.notEqual(newArtwork.path, oldArtwork.path);
    assert.notDeepEqual(await readFile(resolve(root, oldArtwork.path)), await readFile(resolve(root, newArtwork.path)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("compact labels preserve two lines and identify conversations independently of state", { timeout: 15_000 }, async () => {
  const root = await fixture();
  try {
    const { render } = createTaskArtwork({ pluginRoot: root });
    const first = await render("working", "研究运行\n状态", "01");
    const second = await render("working", "研究运行\n状态", "02");
    const oneLine = await render("working", "研究运行状态", "01");
    assert.notEqual(first.gifpath, second.gifpath);
    assert.notEqual(first.gifpath, oneLine.gifpath);
    const bytes = await readFile(resolve(root, first.gifpath));
    const metadata = await sharp(bytes, { animated: true }).metadata();
    assert.equal(metadata.pages, 24);
    assert.equal(metadata.loop, 0);
    assert.ok(metadata.delay.every(delay => delay === 80));
    const firstFrame = await sharp(bytes, { page: 0 }).raw().toBuffer();
    const secondFrame = await sharp(await readFile(resolve(root, second.gifpath)), { page: 0 }).raw().toBuffer();
    assert.notDeepEqual(firstFrame, secondFrame, "stable numbers must be baked into image pixels");
    assert.deepEqual(await render("working", "研究运行\n状态\nignored", "01"), first);
    assert.notEqual((await render("working", "研发", "4096")).gifpath,
      (await render("working", "研发")).gifpath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native short-label typography fits CJK, Latin and emoji within the key margins", { timeout: 15_000 }, async () => {
  const root = await fixture();
  try {
    await rm(resolve(root, "assets", "neon"));
    await mkdir(resolve(root, "assets", "neon"));
    await sharp({ create: { width: 196, height: 196, channels: 4, background: "#000000" } })
      .png().toFile(resolve(root, "assets", "neon", "task-idle.png"));
    const { render } = createTaskArtwork({ pluginRoot: root });
    for (const label of ["研究中\n状态", "DEMO", "WWWWWWWW\n😀emoji"]) {
      const artwork = await render("idle", label, "4096");
      const { data, info } = await sharp(resolve(root, artwork.path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixels = [];
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const offset = (y * info.width + x) * 4;
          // Black fixture isolates visible text and the quiet number. Emoji
          // colors also count, because none of the text may clip at the edges.
          if (Math.max(data[offset], data[offset + 1], data[offset + 2]) > 80) pixels.push({ x, y });
        }
      }
      assert.ok(pixels.some(pixel => pixel.x < 70 && pixel.y >= 20 && pixel.y < 50), `${label}: visible identifier`);
      assert.ok(pixels.some(pixel => pixel.x > 70 && pixel.y > 65), `${label}: visible title`);
      assert.ok(Math.min(...pixels.map(pixel => pixel.x)) >= 19, `${label}: left margin`);
      assert.ok(Math.max(...pixels.map(pixel => pixel.x)) <= 177, `${label}: right margin`);
      assert.ok(Math.min(...pixels.map(pixel => pixel.y)) >= 20, `${label}: top margin`);
      assert.ok(Math.max(...pixels.map(pixel => pixel.y)) <= 175, `${label}: bottom margin`);
      if (label.includes("\n")) {
        assert.ok(pixels.some(pixel => pixel.y > 65 && pixel.y < 100), `${label}: first line`);
        assert.ok(pixels.some(pixel => pixel.y > 120 && pixel.y < 165), `${label}: second line`);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
