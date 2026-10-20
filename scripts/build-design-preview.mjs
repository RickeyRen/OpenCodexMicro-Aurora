import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { normalizeStatus } from "../integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/key-art.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/build-design-preview.mjs /absolute/path/preview.html");
const target = resolve(output);
const template = await readFile(resolve(root, "design/deck-motion-options.fragment.html"), "utf8");
const marker = "/*__DECK_DESIGN_RUNTIME__*/";
if (!template.includes(marker)) throw new Error("Design preview template is missing its runtime marker");

let source = {};
try {
  const response = await fetch("http://127.0.0.1:17373/state", { signal: AbortSignal.timeout(2000), redirect: "error" });
  if (response.ok) source = await response.json();
} catch {
  // An unavailable local Bridge produces an honest unavailable-data preview.
}
const numeric = value => typeof value === "number" && Number.isFinite(value) ? value : null;
const anonymousKeys = new Map();
function anonymousKey(value) {
  if (!value) return null;
  if (!anonymousKeys.has(value)) anonymousKeys.set(value, `preview-${anonymousKeys.size}`);
  return anonymousKeys.get(value);
}
// Include only allowance metadata and anonymized status counts, never titles,
// host details, transcript content, or real conversation identifiers.
const snapshot = {
  connected: source.connected === true,
  usage: source.usage ? {
    observedAt: numeric(source.usage.observedAt),
    windows: (Array.isArray(source.usage.windows) ? source.usage.windows : []).map(window => ({
      kind: ["weekly", "five-hour"].includes(window.kind) ? window.kind : "other",
      remainingPercent: numeric(window.remainingPercent),
      resetsAt: numeric(window.resetsAt)
    }))
  } : null,
  slots: (Array.isArray(source.slots) ? source.slots : []).map(slot => ({
    threadKey: anonymousKey(slot.threadKey),
    status: normalizeStatus(slot.status)
  }))
};
const literal = JSON.stringify(snapshot).replace(/</g, "\\u003c");
const result = await build({
  stdin: {
    contents: `export { DESIGN_VARIANTS, designVariantSvg } from './integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/design-variants.js';\nexport { renderOverviewSvg } from './integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/overview-art.js';\nexport const PREVIEW_SNAPSHOT = ${literal};\nexport const PREVIEW_NOW = ${Date.now()};`,
    resolveDir: root,
    sourcefile: "deck-design-preview-entry.js"
  },
  bundle: true,
  write: false,
  platform: "browser",
  target: "es2022",
  format: "iife",
  globalName: "DeckDesigns"
});
const runtime = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const fragment = template.replace(marker, () => runtime);
if (Buffer.byteLength(fragment) > 1_000_000) throw new Error("Design preview exceeds 1 MB");
for (const script of fragment.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, fragment);
console.log(`Built four animated design options: ${target}`);
