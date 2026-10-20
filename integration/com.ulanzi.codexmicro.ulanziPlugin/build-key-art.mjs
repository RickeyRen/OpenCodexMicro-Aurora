import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ANIMATION_FRAMES, taskVisualSvg } from "./plugin/key-art.js";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const assetRoot = resolve(packageRoot, "assets/neon");
const size = 196;
const frameDelay = 80;
const animatedStates = ["working", "attention", "error"];
const staticStates = ["idle", "complete", "offline", "empty", "unknown"];
const maxGifBytes = 200 * 1024;

async function renderFrame(status, phase) {
  // CoreText composites each conversation label onto this shared background.
  return sharp(Buffer.from(taskVisualSvg(status, "", phase)))
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer();
}

export async function buildKeyArt() {
  await mkdir(assetRoot, { recursive: true });
  const generated = [];

  for (const status of animatedStates) {
    const frames = [];
    for (let frame = 0; frame < ANIMATION_FRAMES; frame += 1) {
      frames.push(await renderFrame(status, frame));
    }
    const buffer = await sharp(Buffer.concat(frames), {
      raw: { width: size, height: size * ANIMATION_FRAMES, channels: 4, pageHeight: size }
    }).gif({
      loop: 0,
      delay: Array(ANIMATION_FRAMES).fill(frameDelay),
      colours: 64,
      dither: 0,
      effort: 9,
      interFrameMaxError: 8,
      keepDuplicateFrames: true
    }).toBuffer();
    const metadata = await sharp(buffer, { animated: true }).metadata();
    if (metadata.pages !== ANIMATION_FRAMES || metadata.loop !== 0
      || metadata.width !== size || metadata.pageHeight !== size
      || metadata.delay?.length !== ANIMATION_FRAMES
      || metadata.delay.some((delay) => delay !== frameDelay)) {
      throw new Error(`Invalid native GIF animation for ${status}`);
    }
    if (buffer.length > maxGifBytes) {
      throw new Error(`${status} GIF exceeds the ${maxGifBytes / 1024} KiB budget`);
    }
    const name = `task-${status}.gif`;
    await writeFile(resolve(assetRoot, name), buffer);
    generated.push({ name, bytes: buffer.length, frames: metadata.pages });
  }

  for (const status of staticStates) {
    const buffer = await sharp(await renderFrame(status, 0), {
      raw: { width: size, height: size, channels: 4 }
    }).png({ compressionLevel: 9, palette: true, colours: 64, dither: 0 }).toBuffer();
    const name = `task-${status}.png`;
    await writeFile(resolve(assetRoot, name), buffer);
    generated.push({ name, bytes: buffer.length, frames: 1 });
  }

  for (const asset of generated) {
    console.log(`Built assets/neon/${asset.name}: ${asset.frames} frame(s), ${(asset.bytes / 1024).toFixed(1)} KiB`);
  }
  return generated;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildKeyArt();
}
