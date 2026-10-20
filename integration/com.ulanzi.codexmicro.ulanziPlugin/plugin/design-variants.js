/**
 * Original device artwork studies. These render background frames only; the
 * native label compositor owns typography and conversation identifiers.
 *
 * `phase` is a frame index in a 24-frame / 80 ms native GIF loop. The SVG never
 * runs animation code. Status is the only source of colour in every design.
 */
export const DESIGN_VARIANTS = Object.freeze([
  Object.freeze({
    id: "aurora", labelZh: "极光丝带", labelEn: "Aurora Silk",
    descriptionZh: "宽幅光绸沿边缘舒展，明暗折面缓慢流动，中央留给对话标题。"
  }),
  Object.freeze({
    id: "plasma", labelZh: "等离子潮汐", labelEn: "Plasma Tide",
    descriptionZh: "细密能量曲线交织成潮汐，电流持续穿行，动感更强。"
  }),
  Object.freeze({
    id: "prism", labelZh: "折射晶面", labelEn: "Prism Glass",
    descriptionZh: "清晰的切割晶面与移动反光，像一块有深度的彩色光学玻璃。"
  }),
  Object.freeze({
    id: "circuit", labelZh: "光轨扫描", labelEn: "Circuit Scan",
    descriptionZh: "简洁的发光轨道和流动扫描光点，优先保证标题清晰。"
  })
]);

const SIZE = 196;
const FRAMES = 24;
const TAU = Math.PI * 2;
const ANIMATED = new Set(["working", "attention", "error"]);
const PALETTE = Object.freeze({
  working: { deep: "#051D58", base: "#0754FF", bright: "#13E8FF", white: "#CEFCFF" },
  attention: { deep: "#4B1804", base: "#FF7106", bright: "#FFD31D", white: "#FFF2B7" },
  complete: { deep: "#053424", base: "#00BC74", bright: "#4DFFAD", white: "#C8FFE4" },
  error: { deep: "#420D16", base: "#F42D49", bright: "#FF6D64", white: "#FFE1DB" },
  idle: { deep: "#101B25", base: "#354A5B", bright: "#778C98", white: "#B8C9D0" },
  unknown: { deep: "#14212B", base: "#4C6575", bright: "#A1B6BF", white: "#D5E2E6" },
  offline: { deep: "#111B24", base: "#3A4E5D", bright: "#819AA8", white: "#B6CBD3" },
  empty: { deep: "#0E1820", base: "#263B49", bright: "#536D7A", white: "#8DA4AE" }
});

function n(value) {
  return Number(value.toFixed(2));
}

function frameAngle(status, phase) {
  if (!ANIMATED.has(status)) return 0;
  const value = Number(phase);
  const frame = Number.isFinite(value) ? ((Math.floor(value) % FRAMES) + FRAMES) % FRAMES : 0;
  return frame * TAU / FRAMES;
}

function motionStrength(status) {
  return status === "working" ? 1 : status === "attention" ? .3 : status === "error" ? .16 : 0;
}

function brightness(status, angle) {
  if (status === "attention") return .73 + .27 * (.5 + .5 * Math.sin(angle));
  if (status === "error") return .72 + .28 * (.5 + .5 * Math.cos(angle));
  return 1;
}

function sharedDefinitions(p) {
  return `<radialGradient id="ambience" cx=".85" cy=".97" r="1"><stop stop-color="${p.base}" stop-opacity=".2"/><stop offset="1" stop-color="${p.deep}" stop-opacity="0"/></radialGradient>
    <radialGradient id="title-shade" cx=".5" cy=".52" r=".61"><stop stop-color="#060B12" stop-opacity=".97"/><stop offset=".54" stop-color="#060B12" stop-opacity=".82"/><stop offset="1" stop-color="#060B12" stop-opacity="0"/></radialGradient>`;
}

function field() {
  return '<rect width="196" height="196" fill="#060B12"/><rect width="196" height="196" fill="url(#ambience)"/>';
}

function aurora(p, angle, status) {
  const strength = motionStrength(status);
  const sway = 19 * Math.sin(angle) * strength;
  const lift = 14 * Math.cos(angle) * strength;
  const fold = 12 * Math.sin(angle + .8) * strength;
  const ribbon = `M-28 ${n(125 + lift)} C${n(29 + sway)} ${n(206 + lift)} ${n(104 - fold)} ${n(67 - lift)} 224 109 L224 168 C${n(115 + sway)} ${n(115 + fold)} ${n(58 - sway)} 244 -28 172 Z`;
  const top = `M100 -24 C${n(120 - sway)} ${n(27 + lift)} ${n(162 + sway)} ${n(69 - fold)} 221 73 L224 19 C165 22 ${n(142 + fold)} -2 139 -24 Z`;
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="silk" x1=".11" y1=".13" x2=".65" y2="1"><stop stop-color="${p.deep}"/><stop offset=".36" stop-color="${p.base}"/><stop offset=".62" stop-color="${p.bright}"/><stop offset=".73" stop-color="${p.white}"/><stop offset=".8" stop-color="${p.base}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
    <linearGradient id="silk-top" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.base}" stop-opacity=".1"/><stop offset=".64" stop-color="${p.bright}"/><stop offset=".78" stop-color="${p.white}" stop-opacity=".9"/><stop offset="1" stop-color="${p.base}"/></linearGradient>
    <linearGradient id="silk-rim" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${p.white}" stop-opacity="0"/><stop offset=".45" stop-color="${p.white}" stop-opacity=".9"/><stop offset="1" stop-color="${p.bright}" stop-opacity="0"/></linearGradient>
  </defs>${field()}
  <g opacity="${n(brightness(status, angle))}">
    <path d="${ribbon}" fill="url(#silk)"/>
    <path d="${top}" fill="url(#silk-top)"/>
    <path d="M-28 ${n(125 + lift)} C${n(29 + sway)} ${n(206 + lift)} ${n(104 - fold)} ${n(67 - lift)} 224 109" fill="none" stroke="url(#silk-rim)" stroke-width="1.5"/>
    <path d="M-12 ${n(153 + lift * .6)} C${n(49 + sway)} 203 ${n(130 - fold)} ${n(104 - lift * .3)} 217 136" fill="none" stroke="${p.deep}" stroke-opacity=".42" stroke-width="3"/>
  </g><rect width="196" height="196" fill="url(#title-shade)" opacity=".4"/>`;
}

function plasma(p, angle, status) {
  const strength = motionStrength(status);
  const sway = 17 * Math.sin(angle) * strength;
  const turn = 12 * Math.cos(angle) * strength;
  const currents = [];
  for (let line = 0; line < 11; line += 1) {
    const u = line / 10;
    const tilt = 10 * Math.sin(angle + line * .32) * strength;
    const path = `M${n(-37 + line * 3.6)} ${n(31 + line * 9.6)} C${n(45 + sway + line * 1.9)} ${n(-46 + turn + line * 2.4)} ${n(79 + tilt)} ${n(216 - line * 2)} ${n(232 - line * 2.4)} ${n(161 - line * 7.2)}`;
    currents.push(`<path d="${path}" fill="none" stroke="url(#current)" stroke-width="${line % 4 === 0 ? 2.5 : 1.15}" opacity="${n(.35 + .58 * Math.sin(u * Math.PI))}"/>`);
  }
  const returnCurrents = [];
  for (let line = 0; line < 5; line += 1) {
    returnCurrents.push(`<path d="M${n(149 + line * 12)} -18 C${n(238 - line * 7)} ${n(28 + turn)} ${n(102 + sway)} ${n(162 - line * 6)} ${n(45 - line * 14)} 218" fill="none" stroke="url(#return)" stroke-width="${line === 2 ? 2.3 : 1}" opacity="${n(.3 + (line % 3) * .16)}"/>`);
  }
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="current" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.base}" stop-opacity="0"/><stop offset=".18" stop-color="${p.base}"/><stop offset=".42" stop-color="${p.bright}"/><stop offset=".56" stop-color="${p.white}"/><stop offset=".78" stop-color="${p.base}"/><stop offset="1" stop-color="${p.bright}" stop-opacity="0"/></linearGradient>
    <linearGradient id="return" x1="1" y1="0" x2="0" y2="1"><stop stop-color="${p.bright}" stop-opacity="0"/><stop offset=".28" stop-color="${p.bright}"/><stop offset=".51" stop-color="${p.white}"/><stop offset=".84" stop-color="${p.base}"/><stop offset="1" stop-color="${p.base}" stop-opacity="0"/></linearGradient>
    <radialGradient id="pool" cx=".14" cy=".24" r=".73"><stop stop-color="${p.base}" stop-opacity=".35"/><stop offset="1" stop-color="${p.base}" stop-opacity="0"/></radialGradient>
  </defs>${field()}<rect width="196" height="196" fill="url(#pool)"/>
  <g opacity="${n(brightness(status, angle))}">${currents.join("")}${returnCurrents.join("")}</g>
  <rect width="196" height="196" fill="url(#title-shade)" opacity=".91"/>`;
}

function prism(p, angle, status) {
  const strength = motionStrength(status);
  const shineX = .18 + .26 * (1 + Math.cos(angle)) * strength;
  const shineY = .12 + .23 * (1 + Math.sin(angle)) * strength;
  const facetOpacity = .72 + .2 * Math.sin(angle + .3) * strength;
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="glass-top" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="${p.base}"/><stop offset=".48" stop-color="${p.bright}"/><stop offset=".64" stop-color="${p.white}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
    <linearGradient id="glass-side" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${p.deep}"/><stop offset=".37" stop-color="${p.base}"/><stop offset=".73" stop-color="${p.bright}"/><stop offset="1" stop-color="${p.white}"/></linearGradient>
    <linearGradient id="glass-bottom" x1="0" y1="0" x2="1" y2=".6"><stop stop-color="${p.deep}"/><stop offset=".42" stop-color="${p.bright}"/><stop offset=".56" stop-color="${p.white}"/><stop offset=".7" stop-color="${p.base}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
    <radialGradient id="glass-sheen" cx="${n(shineX)}" cy="${n(shineY)}" r=".66"><stop stop-color="${p.white}" stop-opacity=".74"/><stop offset=".34" stop-color="${p.bright}" stop-opacity=".14"/><stop offset="1" stop-color="${p.white}" stop-opacity="0"/></radialGradient>
    <linearGradient id="glass-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.deep}"/><stop offset=".48" stop-color="#07121D"/><stop offset="1" stop-color="${p.deep}" stop-opacity=".45"/></linearGradient>
  </defs>${field()}
  <g opacity="${n(brightness(status, angle))}">
    <path d="M-12 4 L148 -12 L193 28 L145 55 L33 42 Z" fill="url(#glass-top)" opacity="${n(facetOpacity)}"/>
    <path d="M193 28 L213 78 L189 202 L157 157 L145 55 Z" fill="url(#glass-side)"/>
    <path d="M-12 139 L31 155 L157 157 L189 202 L45 211 Z" fill="url(#glass-bottom)"/>
    <path d="M-12 4 L33 42 L31 155 L-12 139 Z" fill="url(#glass-side)" opacity=".65"/>
    <path d="M33 42 L145 55 L157 157 L31 155 Z" fill="url(#glass-face)"/>
    <path d="M-12 4 L148 -12 L193 28 L213 78 L189 202 L45 211 L-12 139 Z" fill="url(#glass-sheen)"/>
    <path d="M-12 4 L33 42 L145 55 L193 28 M145 55 L157 157 L189 202 M157 157 L31 155 L-12 139" fill="none" stroke="${p.white}" stroke-opacity=".38" stroke-width="1"/>
    <path d="M35 44 L143 57 M159 158 L184 193" fill="none" stroke="${p.bright}" stroke-opacity=".8" stroke-width="1.7"/>
  </g><rect width="196" height="196" fill="url(#title-shade)" opacity=".54"/>`;
}

// A rounded rectangle represented as a real path gives a stable stroke-length
// coordinate for a scan that wraps seamlessly from frame 23 to frame zero.
const TRACK = "M32 15 H164 Q181 15 181 32 V164 Q181 181 164 181 H32 Q15 181 15 164 V32 Q15 15 32 15 Z";

function circuit(p, angle, status) {
  const strength = motionStrength(status);
  const progress = status === "working" ? angle / TAU : .17 + .04 * Math.sin(angle) * strength;
  const offset = n(-progress * 1000);
  const bars = Array.from({ length: 17 }, (_, index) => {
    const wave = .5 + .5 * Math.cos(angle - index * .45);
    const opacity = status === "working" ? .16 + .72 * wave : .25;
    const height = status === "working" ? 3 + wave * 9 : 4;
    return `<rect x="${38 + index * 7}" y="${n(166 - height)}" width="3" height="${n(height)}" rx="1.5" fill="${p.bright}" opacity="${n(opacity)}"/>`;
  }).join("");
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="track" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.bright}" stop-opacity=".52"/><stop offset=".45" stop-color="${p.base}" stop-opacity=".15"/><stop offset="1" stop-color="${p.bright}" stop-opacity=".48"/></linearGradient>
    <radialGradient id="scan-field" cx=".89" cy=".91" r=".73"><stop stop-color="${p.base}" stop-opacity=".18"/><stop offset="1" stop-color="${p.base}" stop-opacity="0"/></radialGradient>
  </defs>${field()}<rect width="196" height="196" fill="url(#scan-field)"/>
  <g opacity="${n(brightness(status, angle))}" fill="none" stroke-linecap="round">
    <path d="${TRACK}" stroke="url(#track)" stroke-width="1"/>
    <path d="${TRACK}" pathLength="1000" stroke="${p.base}" stroke-width="6" stroke-opacity=".24" stroke-dasharray="110 890" stroke-dashoffset="${offset}"/>
    <path d="${TRACK}" pathLength="1000" stroke="${p.bright}" stroke-width="2.1" stroke-dasharray="88 912" stroke-dashoffset="${offset}"/>
    <path d="${TRACK}" pathLength="1000" stroke="${p.white}" stroke-width="2.6" stroke-dasharray="3 997" stroke-dashoffset="${offset}"/>
    <path d="M24 48 V33 Q24 24 33 24 H48 M148 172 H163 Q172 172 172 163 V148" stroke="${p.bright}" stroke-width="1" stroke-opacity=".55"/>
  </g><g opacity="${n(brightness(status, angle))}">${bars}</g>`;
}

const RENDERERS = Object.freeze({ aurora, plasma, prism, circuit });

/**
 * Return an original 196 px background for a canonical status. Unknown designs
 * fall back to Aurora; unknown statuses remain neutral instead of looking idle.
 * Phase is intentionally ignored for settled states, making native still PNGs
 * pixel-identical no matter when the bridge asks for an update.
 */
export function designVariantSvg(id, status, phase = 0) {
  const state = Object.hasOwn(PALETTE, status) ? status : "unknown";
  const renderer = Object.hasOwn(RENDERERS, id) ? RENDERERS[id] : aurora;
  const art = renderer(PALETTE[state], frameAngle(state, phase), state);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${art}</svg>`;
}
