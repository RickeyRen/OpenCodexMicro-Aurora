#!/usr/bin/env node
/**
 * Rebuild public launch media from the shipped device artwork. No Bridge,
 * account, profile, conversation database, or network access is used.
 *
 * Run on macOS (the bundled CoreText helper preserves actual device labels):
 *   node scripts/build-launch-media.mjs
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { designVariantSvg } from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/design-variants.js";
import { renderOverviewSvg } from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/overview-art.js";
import { formatTaskLabel } from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/key-title.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = join(root, "integration/com.ulanzi.codexmicro.ulanziPlugin");
const require = createRequire(join(plugin, "package.json"));
const sharp = require("sharp");
const runFile = promisify(execFile);
const out = join(root, "docs/images");
const helper = join(plugin, "runtime/key-glyph-renderer");
const FRAME_COUNT = 24;
const DELAY_MS = 80;
const NOW = Date.UTC(2026, 9, 20, 12);
const SAMPLES = Object.freeze([
  ["Build release", "working"], ["Review PR", "attention"],
  ["Ship website", "working"], ["Fix build", "error"],
  ["Write docs", "complete"], ["Design UI", "working"],
  ["Add tests", "working"], ["Refactor API", "idle"],
  ["Debug logs", "attention"], ["Plan v1.0", "complete"],
  ["Update SDK", "idle"], ["Code review", "complete"],
  ["Profile app", "idle"]
].map(([title, status], index) => Object.freeze({ title, status,
  threadKey: `sample-${index + 1}`, identifier: String(index + 1).padStart(2, "0") })));
const state = Object.freeze({ connected: true, slots: SAMPLES,
  usage: { observedAt: NOW, windows: [{ kind: "weekly", remainingPercent: 73,
    observedAt: NOW, resetsAt: NOW / 1000 + (3 * 24 + 8) * 3600 }] } });
const BOARD = Object.freeze({ width: 1116, height: 684, padding: 28, key: 196, step: 216 });
const HERO = Object.freeze({ width: 1600, height: 1160 });
const GIF = Object.freeze({ width: 1200, height: 870 });
const DEMO_LABEL = "Rendered demo · sample conversations";
const INK = "#F6F8FD";
const MUTED = "#8795AA";

function escape(value) {
  return String(value).replace(/[&<>"']/gu, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}
function text(x, y, value, size, { fill = INK, weight = 400, spacing = 0, anchor = "start" } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${spacing}" text-anchor="${anchor}">${escape(value)}</text>`;
}
function data(type, value) {
  return `data:${type};base64,${Buffer.from(value).toString("base64")}`;
}
function image(x, y, width, height, href, extra = "") {
  return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${href}" ${extra}/>`;
}
function svg(width, height, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Arial,Helvetica,sans-serif">${art}</g></svg>`;
}
function statusLegend(x, y, scale = 1) {
  const items = [["#20DEFF", "Working"], ["#FFBB32", "Needs you"], ["#50FFA5", "Unread"], ["#FF4A64", "Error"], ["#8795AA", "Idle"]];
  return `<g transform="translate(${x} ${y}) scale(${scale})">${items.map(([color, label], i) => {
    const left = i * 185;
    return `<circle cx="${left}" cy="-6" r="5" fill="${color}"/>${text(left + 16, 0, label, 19, { fill: "#BBC5D3", weight: 500 })}`;
  }).join("")}</g>`;
}
function backdrop(width, height) {
  return `<defs><radialGradient id="ambient" cx=".84" cy=".38" r=".8"><stop stop-color="#102241" stop-opacity=".58"/><stop offset="1" stop-color="#060911" stop-opacity="0"/></radialGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3A485F"/><stop offset=".45" stop-color="#1D2738"/><stop offset="1" stop-color="#2D3A50"/></linearGradient></defs><rect width="${width}" height="${height}" fill="#080C14"/><rect width="${width}" height="${height}" fill="url(#ambient)"/>`;
}
function boardSvg(frame, labels) {
  let art = '<defs><linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#273346"/><stop offset=".5" stop-color="#111823"/><stop offset="1" stop-color="#263346"/></linearGradient></defs>';
  art += `<rect x=".5" y=".5" width="1115" height="683" rx="35" fill="#101720" stroke="url(#frame)"/><rect x="12" y="12" width="1092" height="660" rx="27" fill="#04070D" stroke="#263244" stroke-opacity=".4"/>`;
  for (const [index, sample] of SAMPLES.entries()) {
    const x = BOARD.padding + index % 5 * BOARD.step;
    const y = BOARD.padding + Math.floor(index / 5) * BOARD.step;
    art += `<defs><clipPath id="key-${index}"><rect x="${x}" y="${y}" width="196" height="196" rx="14"/></clipPath></defs>`;
    art += `<g clip-path="url(#key-${index})">`;
    art += image(x, y, 196, 196, data("image/svg+xml", designVariantSvg("aurora", sample.status, frame)));
    art += image(x, y, 196, 196, labels[index]);
    art += '</g>';
    art += `<rect x="${x + .5}" y="${y + .5}" width="195" height="195" rx="14" fill="none" stroke="#CFDDF1" stroke-opacity=".12"/>`;
  }
  const wideX = BOARD.padding + 3 * BOARD.step;
  const wideY = BOARD.padding + 2 * BOARD.step;
  const wideWidth = 2 * BOARD.key + BOARD.step - BOARD.key;
  art += `<rect x="${wideX}" y="${wideY}" width="${wideWidth}" height="196" rx="14" fill="#070B10" stroke="#CFDDF1" stroke-opacity=".12"/>`;
  // Keep the native 460 × 200 image's aspect ratio inside its two-key cell.
  art += image(wideX + 4, wideY + 4, wideWidth - 8, 188, data("image/svg+xml", renderOverviewSvg(state, { now: NOW, language: "en" })));
  return svg(BOARD.width, BOARD.height, art);
}
function heroSvg(board) {
  let art = backdrop(HERO.width, HERO.height);
  art += '<rect x="80" y="58" width="5" height="24" rx="2.5" fill="#20DEFF"/>';
  art += text(101, 78, "OpenCodexMicro · Aurora", 25, { weight: 600, spacing: .3 });
  art += text(80, 157, "A live Codex dashboard for your desk.", 64, { weight: 700, spacing: -1.5 });
  art += text(82, 205, "13 conversations. State-driven Aurora motion. Live usage at a glance.", 25, { fill: "#9EACBF" });
  art += '<rect x="258" y="285" width="1084" height="670" rx="44" fill="#00030A" opacity=".5"/>';
  art += image(242, 261, BOARD.width, BOARD.height, data("image/svg+xml", board));
  art += statusLegend(392, 1002);
  art += '<path d="M80 1054 H1520" stroke="#243044"/>';
  art += text(80, 1102, "macOS / Ulanzi D200H / MIT open source", 20, { fill: "#A4B1C2", weight: 500 });
  art += text(1520, 1102, DEMO_LABEL, 20, { fill: MUTED, anchor: "end" });
  return svg(HERO.width, HERO.height, art);
}
function socialSvg(board) {
  let art = backdrop(1200, 675);
  art += '<rect x="48" y="45" width="4" height="20" rx="2" fill="#20DEFF"/>';
  art += text(66, 62, "OpenCodexMicro · Aurora", 22, { weight: 600 });
  art += text(48, 163, "A LIVE CODEX DASHBOARD", 14, { fill: "#20DEFF", weight: 600, spacing: 1.7 });
  art += text(44, 242, "Your Codex.", 57, { weight: 700, spacing: -1.6 });
  art += text(44, 309, "On your desk.", 57, { weight: 700, spacing: -1.6 });
  art += text(48, 370, "13 conversation keys.", 22, { fill: "#AAB7C9" });
  art += text(48, 405, "State-driven Aurora motion.", 22, { fill: "#AAB7C9" });
  art += text(48, 440, "Remaining usage. At a glance.", 22, { fill: "#AAB7C9" });
  art += text(48, 517, "macOS  /  Ulanzi D200H", 16, { fill: "#C1CBD9", weight: 600, spacing: .4 });
  art += text(48, 544, "MIT open source", 16, { fill: MUTED });
  art += image(453, 162, 700, 700 * BOARD.height / BOARD.width, data("image/svg+xml", board));
  art += '<path d="M48 606 H1152" stroke="#243044"/>';
  art += text(48, 642, "A live Codex dashboard for your desk.", 16, { fill: "#ABB8CB" });
  art += text(1152, 642, DEMO_LABEL, 16, { fill: MUTED, anchor: "end" });
  return svg(1200, 675, art);
}

if (process.platform !== "darwin") throw new Error("Build launch media on macOS to use the shipped CoreText label compositor.");
await access(helper);
assert.equal(SAMPLES.length, 13);
assert.equal(new Set(SAMPLES.map(sample => sample.threadKey)).size, 13);
assert.deepEqual(Object.fromEntries(["working", "attention", "error"].map(status => [status, SAMPLES.filter(sample => sample.status === status).length])), { working: 4, attention: 2, error: 1 });
const temp = await mkdtemp(join(tmpdir(), "opencodexmicro-launch-media-"));
try {
  await mkdir(out, { recursive: true });
  const blank = join(temp, "transparent.png");
  await sharp({ create: { width: 196, height: 196, channels: 4, background: "#00000000" } }).png().toFile(blank);
  const labels = [];
  for (const [index, sample] of SAMPLES.entries()) {
    const target = join(temp, `label-${index}.png`);
    await runFile(helper, [blank, target, formatTaskLabel(sample.title), sample.identifier], { timeout: 5000, maxBuffer: 4096 });
    const label = await readFile(target);
    const meta = await sharp(label).metadata();
    assert.equal(meta.width, 196);
    assert.equal(meta.height, 196);
    assert.ok(meta.hasAlpha);
    labels.push(data("image/png", label));
  }
  const still = boardSvg(6, labels);
  await sharp(Buffer.from(heroSvg(still))).png({ compressionLevel: 9 }).toFile(join(out, "aurora-hero.png"));
  await sharp(Buffer.from(socialSvg(still))).png({ compressionLevel: 9 }).toFile(join(out, "aurora-social.png"));
  const frames = [];
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const source = heroSvg(boardSvg(frame, labels));
    frames.push(await sharp(Buffer.from(source)).resize(GIF.width, GIF.height).ensureAlpha().raw().toBuffer());
    if ((frame + 1) % 6 === 0) process.stdout.write(`Rendered ${frame + 1}/${FRAME_COUNT} motion frames\n`);
  }
  const bytes = await sharp(Buffer.concat(frames), { raw: {
    width: GIF.width, height: GIF.height * FRAME_COUNT, channels: 4, pageHeight: GIF.height
  } }).gif({ loop: 0, delay: Array(FRAME_COUNT).fill(DELAY_MS), colours: 128,
    dither: 0, effort: 7, interFrameMaxError: 4, keepDuplicateFrames: true }).toBuffer();
  assert.ok(bytes.length < 5 * 1024 * 1024, `GIF exceeds the 5 MiB publishing budget: ${bytes.length}`);
  const metadata = await sharp(bytes, { animated: true }).metadata();
  assert.equal(metadata.width, GIF.width);
  assert.equal(metadata.pageHeight, GIF.height);
  assert.equal(metadata.pages, FRAME_COUNT);
  assert.equal(metadata.loop, 0);
  assert.deepEqual(metadata.delay, Array(FRAME_COUNT).fill(DELAY_MS));
  assert.notDeepEqual(frames[0], frames[6], "Motion must be visible between frames.");
  await writeFile(join(out, "aurora-demo.gif"), bytes);
  for (const [name, width, height] of [["aurora-hero.png", HERO.width, HERO.height], ["aurora-social.png", 1200, 675]]) {
    const file = await readFile(join(out, name));
    const info = await sharp(file).metadata();
    assert.equal(info.width, width);
    assert.equal(info.height, height);
    assert.equal(info.exif, undefined, "Public media must not contain source EXIF.");
    process.stdout.write(`${name}: ${width} × ${height}, ${(file.length / 1024).toFixed(1)} KiB\n`);
  }
  process.stdout.write(`aurora-demo.gif: ${GIF.width} × ${GIF.height}, ${FRAME_COUNT} × ${DELAY_MS} ms, ${(bytes.length / 1024 / 1024).toFixed(2)} MiB\n`);
  process.stdout.write("All artwork uses synthetic sample titles and sample usage. No live user data was read.\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}
