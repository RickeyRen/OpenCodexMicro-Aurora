import { DESIGN_VARIANTS, designVariantSvg } from "./design-variants.js";

/**
 * Original compact artwork for the Deck Dock's 196 px task keys.
 *
 * The renderer is dependency-free SVG: no filters, scripts, external images,
 * CSS animation, rings or status badges. Native 24-frame GIFs can be built from
 * the same function, while an empty glyph leaves room for Studio's title layer.
 */
export const THEMES = Object.freeze(["solid", "orb", ...DESIGN_VARIANTS.map(variant => variant.id)]);

const SIZE = 196;
const FRAMES = 24;
const FONT = "'Source Han Sans SC','PingFang SC','Heiti SC','Noto Sans CJK SC',Arial,sans-serif";
const ANIMATED = new Set(["working", "attention", "error"]);
const COLORS = Object.freeze({
  working: { dark: "#06164F", base: "#0445FF", light: "#12EFFF", flat: "#1BDDFF" },
  attention: { dark: "#580E00", base: "#FF5B00", light: "#FFE112", flat: "#FFBD0C" },
  error: { dark: "#4F0B12", base: "#F72E35", light: "#FF7660", flat: "#FF5F57" },
  complete: { dark: "#043725", base: "#00BA66", light: "#5AFF9D", flat: "#5AFF9D" },
  idle: { dark: "#111923", base: "#36434F", light: "#85939B", flat: "#85939B" },
  unknown: { dark: "#18232D", base: "#6D8190", light: "#BECFD6", flat: "#A2B0B9" },
  offline: { dark: "#111A23", base: "#4B5C6B", light: "#8BA1AE", flat: "#798D9C" },
  empty: { dark: "#0B121B", base: "#344959", light: "#647C86", flat: "#8F9EA8" }
});

function number(value) {
  return Number(value.toFixed(2));
}

function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[character]));
}

function phaseAngle(status, phase) {
  if (!ANIMATED.has(status)) return 0;
  const value = Number(phase);
  const frame = Number.isFinite(value) ? ((Math.floor(value) % FRAMES) + FRAMES) % FRAMES : 0;
  return frame * Math.PI * 2 / FRAMES;
}

function glyph(value, theme, identifier = "") {
  if (!value) return "";
  // Deep ink also minimizes Studio's unavoidable black title outline when the
  // native title layer is used over the solid version of this artwork.
  const color = theme === "solid" ? "#071D2E" : "#FFFFFF";
  const lines = String(value).split("\n").slice(0, 2);
  const legacy = !identifier && [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length === 1;
  const size = legacy ? 88 : 52;
  const firstBaseline = lines.length === 2 ? 106 : 132;
  const number = identifier ? `<text x="20" y="39" fill="${color}" opacity=".85" font-family="${FONT}" font-size="24" font-weight="600">${xml(identifier)}</text>` : "";
  return number + lines.map((line, index) => {
    const width = [...line].reduce((sum, character) => sum + (/[^\x00-\x7f]/u.test(character) ? size : size * .6), 0);
    const fit = width > 156 ? ' textLength="156" lengthAdjust="spacingAndGlyphs"' : "";
    return `<text x="98" y="${legacy ? 128 : firstBaseline + index * 54}" fill="${color}" font-family="${FONT}" font-size="${size}" font-weight="600" text-anchor="middle"${fit}>${xml(line)}</text>`;
  }).join("");
}

function outline(phase, scale = 1) {
  const points = [];
  for (let step = 0; step < 120; step += 1) {
    const angle = step * Math.PI * 2 / 120;
    const radius = 77 * scale * (1 + .065 * Math.sin(angle * 3 + phase)
      + .052 * Math.cos(angle * 2 - phase) + .018 * Math.sin(angle * 5 + phase));
    points.push(`${step ? "L" : "M"}${number(98 + radius * Math.cos(angle))} ${number(96 + radius * Math.sin(angle))}`);
  }
  return `${points.join(" ")} Z`;
}

function orb(palette, phase, status) {
  const breathe = status === "attention" ? 1 + .035 * Math.sin(phase) : 1;
  const shape = outline(phase, breathe);
  const bend = number(22 * Math.sin(phase));
  const lift = number(14 * Math.cos(phase));
  const shimmer = status === "error" ? .6 + .4 * Math.cos(phase * 2) ** 2 : 1;
  return `<defs>
    <radialGradient id="surface" cx=".32" cy=".24" r=".88"><stop stop-color="${palette.light}"/><stop offset=".36" stop-color="${palette.base}"/><stop offset="1" stop-color="${palette.dark}"/></radialGradient>
    <radialGradient id="fold"><stop stop-color="${palette.light}" stop-opacity=".96"/><stop offset=".48" stop-color="${palette.light}" stop-opacity=".66"/><stop offset="1" stop-color="${palette.light}" stop-opacity="0"/></radialGradient>
    <radialGradient id="gloss"><stop stop-color="#F4FFFF" stop-opacity=".76"/><stop offset="1" stop-color="#F4FFFF" stop-opacity="0"/></radialGradient>
    <clipPath id="silhouette"><path d="${shape}"/></clipPath>
  </defs>
  <rect width="196" height="196" fill="#04070F"/>
  <g><path d="${shape}" fill="url(#surface)"/>
    <g clip-path="url(#silhouette)" opacity="${number(shimmer)}">
      <ellipse cx="${number(108 + bend)}" cy="${number(117 + lift)}" rx="96" ry="36" fill="url(#fold)" transform="rotate(${number(-28 + bend * .45)} 98 98)"/>
      <ellipse cx="${number(74 + bend * .4)}" cy="${number(57 + lift * .35)}" rx="30" ry="18" fill="url(#gloss)" transform="rotate(-26 74 57)"/>
    </g>
  </g>`;
}

function solid(palette, phase, status) {
  const bend = number(24 * Math.sin(phase));
  const lift = number(15 * Math.cos(phase));
  const pulse = status === "error" ? .72 + .28 * Math.cos(phase * 2) ** 2 : 1;
  return `<defs>
    <linearGradient id="surface" x1="0" y1="0" x2=".28" y2="1"><stop stop-color="${palette.flat}"/><stop offset=".55" stop-color="${palette.flat}"/><stop offset="1" stop-color="${palette.base}" stop-opacity=".2"/></linearGradient>
    <linearGradient id="refraction" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="${palette.light}" stop-opacity="0"/><stop offset=".48" stop-color="${palette.light}" stop-opacity=".08"/><stop offset=".63" stop-color="#F4FFFF" stop-opacity=".22"/><stop offset="1" stop-color="#F4FFFF" stop-opacity="0"/></linearGradient>
    <linearGradient id="depth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.base}" stop-opacity="0"/><stop offset="1" stop-color="${palette.base}" stop-opacity=".14"/></linearGradient>
  </defs>
  <rect width="196" height="196" fill="${palette.flat}"/>
  <rect width="196" height="196" fill="url(#surface)" opacity="${number(pulse)}"/>
  <path d="M-40 ${number(118 + lift)} C${number(37 + bend)} ${number(178 - lift)} ${number(93 - bend)} ${number(27 + lift)} 236 66 L236 143 C${number(104 + bend)} 90 68 219 -40 170Z" fill="url(#refraction)"/>
  <path d="M-30 240 C12 ${number(118 - lift)} ${number(114 + bend)} ${number(158 + lift)} 224 72 L224 230Z" fill="url(#depth)"/>`;
}

/**
 * Accepts canonical status names. Normalize aliases in the caller; unfamiliar
 * values deliberately receive the neutral unknown palette, never idle purple.
 */
export function premiumTaskSvg(status, firstGlyph = "", phase = 0, theme = "solid", identifier = "") {
  const state = Object.hasOwn(COLORS, status) ? status : "unknown";
  const variant = THEMES.includes(theme) ? theme : "solid";
  if (DESIGN_VARIANTS.some(design => design.id === variant)) {
    return designVariantSvg(variant, state, phase)
      .replace("</svg>", `${glyph(firstGlyph, variant, identifier)}</svg>`);
  }
  const angle = phaseAngle(state, phase);
  const art = variant === "orb" ? orb(COLORS[state], angle, state) : solid(COLORS[state], angle, state);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${art}${glyph(firstGlyph, variant, identifier)}</svg>`;
}
