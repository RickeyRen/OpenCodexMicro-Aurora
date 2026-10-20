import { execFile } from "node:child_process";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const packageRoot = dirname(fileURLToPath(import.meta.url));

/** Build the small, self-authored renderer against macOS system frameworks. */
export async function buildRuntime() {
  if (process.platform !== "darwin") {
    throw new Error("The local task glyph renderer must be rebuilt on macOS");
  }
  const runtimeRoot = resolve(packageRoot, "runtime");
  const binary = resolve(runtimeRoot, "key-glyph-renderer");
  const temporary = `${binary}.${process.pid}.tmp`;
  await mkdir(runtimeRoot, { recursive: true });
  try {
    await runFile("/usr/bin/xcrun", [
      "clang", "-O2", "-fobjc-arc", "-Wall", "-Wextra", "-mmacosx-version-min=13.0",
      "-framework", "Foundation", "-framework", "CoreGraphics",
      "-framework", "CoreText", "-framework", "ImageIO",
      resolve(packageRoot, "plugin", "task-glyph-renderer.m"), "-o", temporary
    ], { timeout: 60_000, maxBuffer: 64 * 1024 });
    await chmod(temporary, 0o755);
    await rename(temporary, binary);
  } finally {
    await rm(temporary, { force: true });
  }
  await writeFile(resolve(runtimeRoot, "README.md"), [
    "# Local task glyph renderer", "",
    "This small helper is original OpenCodexMicro code covered by the repository MIT license.",
    "It uses only Apple's system Foundation, CoreGraphics, CoreText and ImageIO frameworks.",
    "No third-party rendering library or font is bundled.", "",
    `Prebuilt platform: ${process.platform}-${process.arch}.`,
    "Rebuild on macOS with: node build-runtime.mjs", "",
    "Source: ../plugin/task-glyph-renderer.m", ""
  ].join("\n"));
  return binary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built ${await buildRuntime()}`);
}
