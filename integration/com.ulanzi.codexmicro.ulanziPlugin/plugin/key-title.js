const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function titleSource(value) {
  // The Bridge supplies the actual conversation title. A title that happens
  // to look like a path is still a title; directory fallbacks belong upstream.
  return String(value ?? "").trim();
}

const UNTITLED_LABELS = Object.freeze({
  en: "Untitled",
  zh: "未命名",
  ja: "無題",
  de: "Unbenannt",
  ko: "제목 없음",
  pt: "Sem título",
  es: "Sin título"
});

/** Assigned conversations without a title never borrow a project name. */
export function untitledTaskLabel(language = "en") {
  const languageCode = String(language ?? "en").trim().toLowerCase().split(/[-_]/u)[0];
  return UNTITLED_LABELS[languageCode] || UNTITLED_LABELS.en;
}

// Retained for single-character layouts and compatibility with older profiles.
export function formatTaskTitle(value) {
  return segmenter.segment(titleSource(value))[Symbol.iterator]().next().value?.segment || "?";
}

function widthOf(grapheme) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\p{Regional_Indicator}\uFF01-\uFF60]/u.test(grapheme) ? 2 : .75;
}

function fitAliasLine(value) {
  const graphemes = [...segmenter.segment(value.trim())].map(item => item.segment);
  const line = [];
  let used = 0;
  let end = 0;
  while (end < graphemes.length && used + widthOf(graphemes[end]) <= 6) {
    used += widthOf(graphemes[end]);
    line.push(graphemes[end++]);
  }
  if (end < graphemes.length) {
    while (line.length && used + .75 > 6) used -= widthOf(line.pop());
    line.push("…");
  }
  return line.join("");
}

/** Two readable lines: up to three CJK or eight Latin characters per line. */
export function formatTaskLabel(value, { preserveLines = false } = {}) {
  if (preserveLines && String(value ?? "").includes("\n")) {
    return String(value).split("\n").slice(0, 2).map(fitAliasLine).filter(Boolean).join("\n") || "?";
  }
  const text = titleSource(value).replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim();
  const remaining = [...segmenter.segment(text)].map(item => item.segment);
  if (!remaining.length) return "?";
  const lines = [];
  while (remaining.length && lines.length < 2) {
    let end = 0;
    let width = 0;
    while (end < remaining.length && width + widthOf(remaining[end]) <= 6) {
      width += widthOf(remaining[end++]);
    }
    if (end < remaining.length && lines.length === 0) {
      const space = remaining.slice(0, end + 1).lastIndexOf(" ");
      if (space >= 2) end = space;
      else if (!remaining.includes(" ")) {
        const totalWidth = remaining.reduce((sum, part) => sum + widthOf(part), 0);
        if (totalWidth <= 12) {
          end = 0;
          width = 0;
          while (width < totalWidth / 2) width += widthOf(remaining[end++]);
        }
      }
    }
    const line = remaining.splice(0, end);
    while (line.at(-1) === " ") line.pop();
    while (remaining[0] === " ") remaining.shift();
    if (lines.length === 1 && remaining.length) {
      const space = line.lastIndexOf(" ");
      if (space >= 2) line.splice(space);
      let used = line.reduce((sum, part) => sum + widthOf(part), 0);
      while (line.length && used + .75 > 6) used -= widthOf(line.pop());
      line.push("…");
    }
    lines.push(line.join(""));
  }
  return lines.join("\n");
}
