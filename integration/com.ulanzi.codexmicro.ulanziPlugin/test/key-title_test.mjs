import assert from "node:assert/strict";
import test from "node:test";
import { formatTaskTitle, formatTaskLabel, untitledTaskLabel } from "../plugin/key-title.js";

test("only the first visible character reaches a task key", () => {
  assert.equal(formatTaskTitle("修复应用启动窗口"), "修");
  assert.equal(formatTaskTitle("  Read usage limits"), "R");
  assert.equal(formatTaskTitle(" \n\t 调整 UI"), "调");
  assert.equal(formatTaskTitle("修复 /api/login"), "修");
  assert.equal(formatTaskTitle("https://example.com/project"), "h");
});

test("authoritative titles are formatted literally even when they resemble paths", () => {
  for (const [title, expected] of [
    ["/Users/example/Documents/ChatGPT/Sample Workspace", "/"],
    ["~/代码仓库/工具", "~"],
    ["C:\\代码\\工具\\", "C"],
    ["D:/Projects/工具", "D"],
    ["\\\\server\\share\\项目", "\\"],
    ['"/Users/test/👩🏽‍💻 tools"', '"'],
    ["'/Users/test/e\u0301 project'", "'"]
  ]) assert.equal(formatTaskTitle(title), expected, title);
});

test("path-looking chat titles retain their leading text in compact labels", () => {
  assert.equal(formatTaskLabel("/DEMO"), "/DEMO");
  assert.equal(formatTaskLabel("~/工具"), "~/工具");
  assert.equal(formatTaskLabel("/"), "/");
  assert.equal(formatTaskLabel("C:\\工具"), "C:\\工\n具");
  assert.ok(formatTaskLabel("/Users/test/DEMO").startsWith("/Users/"));
});

test("blank or missing titles use a single-character fallback", () => {
  assert.equal(formatTaskTitle(" \n "), "?");
  assert.equal(formatTaskTitle(null), "?");
  assert.equal(formatTaskTitle(undefined), "?");
});

test("first character keeps complete emoji and combining accents", () => {
  for (const grapheme of ["👨‍👩‍👧‍👦", "👩🏽‍💻", "🇨🇳", "1️⃣", "e\u0301"]) {
    assert.equal(formatTaskTitle(`${grapheme} a long task title`), grapheme);
  }
});

test("compact labels keep useful names in two readable lines", () => {
  assert.equal(formatTaskLabel("DEMO"), "DEMO");
  assert.equal(formatTaskLabel("workspace"), "works\npace");
  assert.equal(formatTaskLabel("状态屏"), "状态屏");
  assert.equal(formatTaskLabel("修复应用启动窗口"), "修复应\n用启…");
  assert.equal(formatTaskLabel("Working task"), "Working\ntask");
  assert.equal(formatTaskLabel("Read usage limits"), "Read\nusage…");
  assert.equal(formatTaskLabel("👩🏽‍💻 编程"), "👩🏽‍💻 编\n程");
  assert.equal(formatTaskLabel("e\u0301clair"), "e\u0301clair");
  assert.equal(formatTaskLabel("\u0000\n"), "?");
});

test("untitled conversations have a localized label in all supported locales", () => {
  for (const [language, expected] of [
    ["en", "Untitled"], ["zh_CN", "未命名"], ["zh_HK", "未命名"],
    ["ja_JP", "無題"], ["de_DE", "Unbenannt"], ["ko_KR", "제목 없음"],
    ["pt_PT", "Sem título"], ["es_ES", "Sin título"]
  ]) assert.equal(untitledTaskLabel(language), expected, language);
  assert.equal(untitledTaskLabel("zh-CN"), "未命名");
  assert.equal(untitledTaskLabel("JA-jp"), "無題");
  assert.equal(untitledTaskLabel("es"), "Sin título");
  assert.equal(untitledTaskLabel("en-US"), "Untitled");
  assert.equal(untitledTaskLabel("fr_FR"), "Untitled");
  assert.equal(untitledTaskLabel(null), "Untitled");
  assert.equal(untitledTaskLabel(), "Untitled");
});

test("explicit alias line breaks retain readable type even when the names are too long", () => {
  assert.equal(formatTaskLabel("状态\n面板", { preserveLines: true }), "状态\n面板");
  assert.equal(formatTaskLabel("研究运行状态\n多个会话界面", { preserveLines: true }), "研究…\n多个…");
  assert.equal(formatTaskLabel("ABCDEFGHIJK\n短名", { preserveLines: true }), "ABCDEFG…\n短名");
});
