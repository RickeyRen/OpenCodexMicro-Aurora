import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { DESIGN_VARIANTS, designVariantSvg } from "../plugin/design-variants.js";

const ids = DESIGN_VARIANTS.map(variant => variant.id);
const statuses = ["working", "attention", "complete", "error", "idle", "unknown", "offline", "empty"];

async function pixels(svg) {
  return sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer();
}

test("all four device designs rasterize at native size without runtime content", async () => {
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4);
  for (const variant of DESIGN_VARIANTS) {
    assert.ok(variant.labelZh && variant.labelEn && variant.descriptionZh);
    for (const status of statuses) {
      const svg = designVariantSvg(variant.id, status, 7);
      assert.doesNotMatch(svg, /<(?:text|script|image|animate|filter)\b|<style\b|url\(["']?https?:|NaN|Infinity/);
      const metadata = await sharp(Buffer.from(svg)).metadata();
      assert.equal(metadata.width, 196);
      assert.equal(metadata.height, 196);
    }
  }
});

test("motion is periodic in 24 frames and settled states stay pixel-identical", () => {
  for (const id of ids) {
    for (const status of statuses) {
      assert.equal(designVariantSvg(id, status, 0), designVariantSvg(id, status, 24));
      assert.equal(designVariantSvg(id, status, 23), designVariantSvg(id, status, -1));
      if (["working", "attention", "error"].includes(status)) {
        assert.notEqual(designVariantSvg(id, status, 0), designVariantSvg(id, status, 6));
      } else {
        assert.equal(designVariantSvg(id, status, 0), designVariantSvg(id, status, 6));
      }
    }
  }
});

test("status is the colour source across all designs with a neutral fallback", () => {
  const expected = {
    working: "#13E8FF", attention: "#FFD31D", complete: "#4DFFAD", error: "#FF6D64",
    idle: "#778C98", unknown: "#A1B6BF", offline: "#819AA8"
  };
  for (const id of ids) {
    for (const [status, color] of Object.entries(expected)) {
      assert.ok(designVariantSvg(id, status).includes(color));
    }
    assert.equal(designVariantSvg(id, "new-native-status"), designVariantSvg(id, "unknown"));
    assert.equal(designVariantSvg(id, "working", Number.NaN), designVariantSvg(id, "working", 0));
  }
  assert.equal(designVariantSvg("nonexistent", "working"), designVariantSvg("aurora", "working"));
});

test("four options look different and keep the main label area dark", async () => {
  const rendered = [];
  for (const id of ids) {
    const data = await pixels(designVariantSvg(id, "working", 6));
    let brightness = 0;
    let samples = 0;
    for (let y = 72; y < 142; y += 1) {
      for (let x = 38; x < 158; x += 1) {
        const offset = (y * 196 + x) * 3;
        brightness += (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
        samples += 1;
      }
    }
    assert.ok(brightness / samples < 60, `${id} has insufficient text contrast`);
    for (const previous of rendered) {
      let difference = 0;
      for (let index = 0; index < data.length; index += 1) difference += Math.abs(data[index] - previous[index]);
      assert.ok(difference / data.length > 10, `${id} is too close to another design`);
    }
    rendered.push(data);
  }
});

test("native motion assets retain 24 frames at 80 ms within the device budget", async () => {
  for (const id of ids) {
    const frames = [];
    for (let frame = 0; frame < 24; frame += 1) {
      frames.push(await sharp(Buffer.from(designVariantSvg(id, "working", frame))).ensureAlpha().raw().toBuffer());
    }
    const gif = await sharp(Buffer.concat(frames), {
      raw: { width: 196, height: 196 * 24, channels: 4, pageHeight: 196 }
    }).gif({
      loop: 0, delay: Array(24).fill(80), colours: 64, dither: 0,
      effort: 9, interFrameMaxError: 8, keepDuplicateFrames: true
    }).toBuffer();
    const metadata = await sharp(gif, { animated: true }).metadata();
    assert.equal(metadata.pages, 24, id);
    assert.equal(metadata.loop, 0, id);
    assert.equal(metadata.pageHeight, 196, id);
    assert.deepEqual(metadata.delay, Array(24).fill(80), id);
    assert.ok(gif.length <= 200 * 1024, `${id} exceeds the native GIF budget: ${gif.length} bytes`);
  }
});
