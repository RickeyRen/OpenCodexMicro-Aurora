import { premiumTaskSvg } from "./premium-art.js";

/**
 * Compact vector artwork for the Deck Dock's 196 px keys.
 *
 * Animation is frame based: Studio does not reliably animate SVG CSS / SMIL.
 * The raw SVG export also lets the build produce native looping GIF assets.
 * Keep all effects inexpensive: no filters, embedded images, or external fonts.
 */
export const ANIMATION_FRAMES = 24;
export const DEFAULT_KEY_THEME = "aurora";

const FONT = "'Source Han Sans SC','PingFang SC','Noto Sans CJK SC',Arial,sans-serif";
const PALETTE = Object.freeze({
  working: { color: "#00E8FF", secondary: "#246BFF", tint: "#04203A" },
  complete: { color: "#24FF91", secondary: "#00CB9D", tint: "#052A21" },
  attention: { color: "#FFBE00", secondary: "#FF691F", tint: "#302007" },
  error: { color: "#FF348B", secondary: "#FF364C", tint: "#310E26" },
  idle: { color: "#B784FF", secondary: "#7646FF", tint: "#1D1535" },
  offline: { color: "#718299", secondary: "#3D4D64", tint: "#141D2B" },
  empty: { color: "#42546D", secondary: "#293B54", tint: "#0D1726" }
});

const STATUS_ALIASES = Object.freeze({
  idle: ["idle"],
  unknown: ["unknown"],
  working: ["working", "thinking", "running", "in_progress", "in-progress"],
  complete: ["unread", "complete", "completed", "done", "success"],
  attention: ["attention", "notification", "input", "approval", "waiting_input", "needs_input", "awaiting-approval", "awaiting-response"],
  error: ["error", "failed", "failure"],
  offline: ["offline", "disconnected", "unavailable"],
  empty: ["empty", "off", "unassigned"]
});

export function normalizeStatus(status) {
  const value = String(status ?? "").toLowerCase().trim();
  for (const [normalized, aliases] of Object.entries(STATUS_ALIASES)) {
    if (aliases.includes(value)) return normalized;
  }
  return "unknown";
}

export function isAnimatedStatus(status) {
  return ["working", "attention", "error"].includes(normalizeStatus(status));
}

function point(radius, angle) {
  const radians = angle * Math.PI / 180;
  return [98 + radius * Math.cos(radians), 98 + radius * Math.sin(radians)];
}

function number(value) {
  return Number(value.toFixed(2));
}

function arc(radius, start, length, color, width, opacity = 1) {
  const a = point(radius, start);
  const b = point(radius, start + length);
  return `<path d="M${number(a[0])} ${number(a[1])} A${radius} ${radius} 0 ${length > 180 ? 1 : 0} 1 ${number(b[0])} ${number(b[1])}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${number(opacity)}"/>`;
}

function dot(radius, angle, size, color, opacity = 1) {
  const [x, y] = point(radius, angle);
  return `<circle cx="${number(x)}" cy="${number(y)}" r="${size}" fill="${color}" opacity="${number(opacity)}"/>`;
}

function document(palette, artwork) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="196" viewBox="0 0 196 196"><defs><radialGradient id="ambient" cx=".5" cy=".42" r=".72"><stop offset="0" stop-color="${palette.tint}"/><stop offset="1" stop-color="#060A13"/></radialGradient><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.color}"/><stop offset="1" stop-color="${palette.secondary}"/></linearGradient></defs><rect width="196" height="196" fill="#060A13"/><rect width="196" height="196" fill="url(#ambient)"/>${artwork}</svg>`;
}

function ringTrack(palette) {
  return `<circle cx="98" cy="98" r="83" fill="none" stroke="${palette.color}" stroke-width="2" opacity=".15"/><circle cx="98" cy="98" r="66" fill="${palette.color}" opacity=".045"/>`;
}

// The hardware layout uses one restrained material across all thirteen keys.
// Only the state palette and its ribbon motion change.
export function taskVisualSvg(status, firstGlyph = "", phase = 0, theme = DEFAULT_KEY_THEME, identifier = "") {
  return premiumTaskSvg(normalizeStatus(status), firstGlyph, phase, theme, identifier);
}

function dataURI(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function taskVisual(status, firstGlyph = "", phase = 0, identifier = "") {
  return dataURI(taskVisualSvg(status, firstGlyph, phase, DEFAULT_KEY_THEME, identifier));
}

const ACTIONS = Object.freeze({
  fast: { color: "#FFCF00", secondary: "#FF801A", tint: "#2E2107", path: '<path d="m108 47-45 59h31l-6 43 45-62h-31z" fill="currentColor" stroke="none"/>' },
  new: { color: "#00E8FF", secondary: "#246BFF", tint: "#07243A", path: '<path d="M98 61v74M61 98h74"/>' },
  pin: { color: "#BB7AFF", secondary: "#8144FF", tint: "#201332", path: '<path d="m82 54 43 16-11 14-3 26 9 10-54-20 13-3 13-22zM90 111l-13 33"/>' },
  navigate: { color: "#65A0FF", secondary: "#486BFF", tint: "#0E1E36", path: '<path d="m66 98 31-31M66 98l31 31M69 98h46c16 0 24-11 24-27"/>' },
  fork: { color: "#00F3C1", secondary: "#00A4C7", tint: "#052A2B", path: '<path d="M75 132V66M77 109c31 0 47-16 47-43"/><circle cx="75" cy="60" r="10" fill="#071A22"/><circle cx="124" cy="60" r="10" fill="#071A22"/><circle cx="75" cy="138" r="10" fill="#071A22"/>' },
  steer: { color: "#FF9A26", secondary: "#FF582B", tint: "#2A1A0F", path: '<path d="M72 143V92c0-18 15-30 36-30h22m-18-18 18 18-18 18M101 143v-24c0-17 9-28 29-28"/>' },
  mic: { color: "#FF55CE", secondary: "#B942FF", tint: "#2E1230", path: '<rect x="82" y="48" width="32" height="66" rx="16"/><path d="M66 96v4a32 32 0 0 0 64 0v-4M98 132v17M81 149h34"/>' },
  submit: { color: "#A98AFF", secondary: "#566FFF", tint: "#191D3A", path: '<path d="M98 143V56m-30 30 30-30 30 30"/>' },
  usage: { color: "#24FF91", secondary: "#00CB9D", tint: "#052A21", path: '<path d="M98 54v44h44M81 57a44 44 0 1 0 58 58"/>' }
});

export function actionVisual(action, phase = 0) {
  // Actions intentionally stay still; motion is reserved for conversation state.
  void phase;
  const palette = ACTIONS[String(action ?? "").toLowerCase()] ?? ACTIONS.new;
  return dataURI(document(palette, `${ringTrack(palette)}${arc(83, -70, 142, palette.color, 5, .8)}${arc(83, 112, 142, palette.secondary, 5, .65)}<g fill="none" color="${palette.color}" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${palette.path}</g>`));
}

export function usageVisual(remainingPercent, phase = 0) {
  void phase;
  const value = remainingPercent === null || remainingPercent === undefined || remainingPercent === "" ? NaN : Number(remainingPercent);
  const remaining = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
  const palette = remaining === null ? PALETTE.offline : remaining >= 50 ? PALETTE.complete : remaining >= 20 ? PALETTE.attention : PALETTE.error;
  const text = remaining === null ? "—" : String(remaining);
  let artwork = `<circle cx="98" cy="98" r="80" fill="none" stroke="${palette.color}" stroke-width="10" opacity=".14"/>`;
  if (remaining > 0) artwork += arc(80, -90, Math.min(359.9, remaining * 3.6), palette.color, 10);
  artwork += `<text x="98" y="115" fill="#F5FCFF" font-family="${FONT}" font-size="${text.length > 2 ? 65 : 76}" font-weight="700" text-anchor="middle">${text}</text>`;
  if (remaining !== null) artwork += `<text x="98" y="145" fill="${palette.color}" font-family="${FONT}" font-size="24" font-weight="700" text-anchor="middle">%</text>`;
  return dataURI(document(palette, artwork));
}
