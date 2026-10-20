import { normalizeStatus } from "./key-art.js";

// Ulanzi Studio 3.4.4's SystemSmallWindowsEditor::gifRectSize is 460 × 200.
// Studio 3.4.4 accepts this image on its native pure-background window through
// the registered plugin's legacy runtime-state route. Placement is explicit opt-in.
export const OVERVIEW_SIZE = Object.freeze({ width: 460, height: 200 });
export const OVERVIEW_MAX_USAGE_AGE_MS = 15 * 60 * 1000;
export const OVERVIEW_WINDOW_PAGE_MS = 6000;

const FONT = "'PingFang SC','Source Han Sans SC','Noto Sans CJK SC',Arial,sans-serif";
const INK = "#F7FBFF";
const MUTED = "#A7B5C6";
const COLORS = Object.freeze({ good: "#50FFA5", medium: "#FFBB32", low: "#FF4A64", unknown: MUTED,
  working: "#20DEFF", attention: "#FFBB32", error: "#FF4A64" });

const WORDS = Object.freeze({
  en: { allowance: "ALLOWANCE", weekly: "WEEK LEFT", fiveHour: "5H LEFT", scope: "ON SCREEN", reset: "RESET", run: "RUN", wait: "WAIT", error: "ERR", live: "LIVE", offline: "OFFLINE", stale: "UPDATE NEEDED", unavailable: "UNAVAILABLE", now: "DUE" },
  zh: { allowance: "剩余额度", weekly: "本周剩余", fiveHour: "5小时剩余", scope: "屏上会话", reset: "重置", run: "运行", wait: "等待", error: "异常", live: "已连接", offline: "未连接", stale: "等待更新", unavailable: "暂无数据", now: "待刷新" },
  zh_HK: { allowance: "剩餘額度", weekly: "本週剩餘", fiveHour: "5小時剩餘", scope: "螢幕對話", reset: "重設", run: "運行", wait: "等待", error: "異常", live: "已連接", offline: "未連接", stale: "等待更新", unavailable: "暫無資料", now: "待更新" },
  ja: { allowance: "使用可能量", weekly: "週間残量", fiveHour: "5時間残量", scope: "画面の会話", reset: "リセット", run: "実行", wait: "待機", error: "異常", live: "接続中", offline: "未接続", stale: "要更新", unavailable: "データなし", now: "要更新" },
  de: { allowance: "KONTINGENT", weekly: "WOCHE ÜBRIG", fiveHour: "5H ÜBRIG", scope: "AM BILDSCHIRM", reset: "RESET", run: "AKT", wait: "WART", error: "FEHL", live: "LIVE", offline: "OFFLINE", stale: "UPDATE NÖTIG", unavailable: "KEINE DATEN", now: "FÄLLIG" },
  es: { allowance: "DISPONIBLE", weekly: "SEM. LIBRE", fiveHour: "5H LIBRES", scope: "EN PANTALLA", reset: "REIN.", run: "ACT", wait: "ESP", error: "ERR", live: "EN LÍNEA", offline: "SIN RED", stale: "ACTUALIZAR", unavailable: "SIN DATOS", now: "PEND" },
  ko: { allowance: "잔여 한도", weekly: "주간 잔여", fiveHour: "5시간 잔여", scope: "화면 대화", reset: "초기화", run: "실행", wait: "대기", error: "오류", live: "연결됨", offline: "연결 안 됨", stale: "업데이트 필요", unavailable: "데이터 없음", now: "갱신 필요" },
  pt: { allowance: "DISPONÍVEL", weekly: "SEM. LIVRE", fiveHour: "5H LIVRES", scope: "NA TELA", reset: "RENOVA", run: "ATIV", wait: "ESP", error: "ERR", live: "ONLINE", offline: "OFFLINE", stale: "ATUALIZAR", unavailable: "SEM DADOS", now: "AGORA" }
});

function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function numeric(value) {
  return value !== null && value !== undefined && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value)) ? Number(value) : null;
}

function observedMillis(value) {
  const result = numeric(value);
  if (result === null || result <= 0) return null;
  return result < 1e11 ? result * 1000 : result;
}

function remaining(window, usage, connected, now) {
  const value = numeric(window?.remainingPercent);
  const observed = observedMillis(window?.observedAt ?? usage?.observedAt);
  const stale = observed === null || now - observed > OVERVIEW_MAX_USAGE_AGE_MS || observed > now + 60_000;
  return { value: connected && !stale && value !== null ? Math.round(Math.max(0, Math.min(100, value))) : null, stale };
}

function resetDuration(window, now, words) {
  const resetsAt = numeric(window?.resetsAt);
  if (resetsAt === null || resetsAt <= 0) return "—";
  const minutes = Math.ceil((resetsAt * 1000 - now) / 60_000);
  if (minutes <= 0) return words.now;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const remainingMinutes = minutes % 60;
  return days ? `${days}d${hours}h` : hours ? `${hours}h${remainingMinutes}m` : `${remainingMinutes}m`;
}

function resetText(window, now, words) {
  return `${words.reset} ${resetDuration(window, now, words)}`;
}

function text(x, y, value, size, color = INK, weight = 600, anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`;
}

function allowanceColor(value) {
  return value === null ? COLORS.unknown : value < 20 ? COLORS.low : value < 50 ? COLORS.medium : COLORS.good;
}

/** Render only observed account allowance and real displayed-conversation counts. */
export function renderOverviewSvg(state = {}, { now = Date.now(), language = "en" } = {}) {
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const languageTag = String(language).toLowerCase().replaceAll("_", "-");
  const languageKey = ["zh-hk", "zh-tw", "zh-hant"].some(tag => languageTag.startsWith(tag)) ? "zh_HK" : languageTag.split("-")[0];
  const words = WORDS[languageKey] ?? WORDS.en;
  const connected = state?.connected === true;
  const usage = state?.usage;
  const windows = Array.isArray(usage?.windows) ? usage.windows : [];
  const weekly = windows.find(window => window?.kind === "weekly");
  const fiveHour = windows.find(window => ["five_hour", "five-hour", "fiveHour", "5h"].includes(window?.kind));
  const shown = [{ window: fiveHour, label: words.fiveHour }, { window: weekly, label: words.weekly }].filter(item => item.window);
  if (shown.length === 0) shown.push({ window: null, label: words.allowance });
  const counts = { working: 0, attention: 0, error: 0 };
  const seen = new Set();
  for (const slot of Array.isArray(state?.slots) ? state.slots : []) {
    if (!slot?.threadKey || seen.has(slot.threadKey)) continue;
    seen.add(slot.threadKey);
    const status = normalizeStatus(slot.status);
    if (Object.hasOwn(counts, status)) counts[status] += 1;
  }

  // The physical panel is small: keep one large allowance in view, with all
  // three state counts always present. Two real allowance windows rotate only
  // the left half instead of shrinking both into an unreadable table.
  const page = Math.floor(Math.max(0, nowMs) / OVERVIEW_WINDOW_PAGE_MS) % shown.length;
  const item = shown[page];
  const { value, stale } = remaining(item.window, usage, connected, nowMs);
  const color = allowanceColor(value);
  const detail = !connected ? words.offline : !item.window ? words.unavailable : stale ? words.stale : resetText(item.window, nowMs, words);
  let art = `<title>${escape(words.scope)}</title><rect width="460" height="200" fill="#070B10"/>`;
  art += text(20, 39, item.label, 28, INK, 600);
  const digits = value === null ? "—" : String(value);
  art += `<text x="18" y="143" fill="${color}" font-family="Arial,sans-serif" font-size="${digits.length > 2 ? 98 : 128}" font-weight="700" font-variant-numeric="tabular-nums">${digits}${value === null ? "" : '<tspan dx="5" font-size="42" font-weight="600">%</tspan>'}</text>`;
  art += text(20, 184, detail, 28, MUTED, 500);
  art += '<rect x="20" y="193" width="206" height="5" rx="2.5" fill="#24303D"/>';
  if (value !== null && value > 0) art += `<rect x="20" y="193" width="${(206 * value / 100).toFixed(2)}" height="5" rx="2.5" fill="${color}"/>`;
  if (shown.length > 1) {
    for (let index = 0; index < shown.length; index++) {
      art += `<rect x="${181 + index * 24}" y="12" width="17" height="4" rx="2" fill="${index === page ? INK : "#364454"}"/>`;
    }
  }
  for (const [index, [key, label]] of [["working", words.run], ["attention", words.wait], ["error", words.error]].entries()) {
    const x = 240 + index * 72;
    const center = x + 34;
    const count = connected ? String(counts[key]) : "—";
    const active = connected && counts[key] > 0;
    const accent = connected ? COLORS[key] : MUTED;
    art += `<rect x="${x}" y="16" width="68" height="172" rx="13" fill="${accent}" fill-opacity="${active ? ".13" : ".055"}"/>`;
    art += text(center, 56, label, 26, INK, 600, "middle");
    art += `<text x="${center}" y="143" fill="${active || !connected ? accent : MUTED}" font-family="Arial,sans-serif" font-size="${count === "—" ? 54 : count.length > 1 ? 58 : 76}" font-weight="700" font-variant-numeric="tabular-nums" text-anchor="middle">${count}</text>`;
    art += `<rect x="${center - 18}" y="164" width="36" height="4" rx="2" fill="${accent}" opacity="${active ? ".9" : ".3"}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="200" viewBox="0 0 460 200"><g font-family="${FONT}">${art}</g></svg>`;
}
