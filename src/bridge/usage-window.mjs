/**
 * Normalize Codex's raw rate-limit window without inventing values for absent
 * fields. This self-contained function is also evaluated inside the renderer.
 */
export function normalizeUsageWindow(window, role) {
  if (!window || typeof window !== "object" || Array.isArray(window)) return null;
  function numeric(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string" || !/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  const usedPercent = numeric(window.used_percent);
  if (usedPercent === null || usedPercent < 0 || usedPercent > 100) return null;
  const seconds = numeric(window.limit_window_seconds);
  const minutes = Number.isInteger(seconds) && seconds > 0 ? seconds / 60 : null;
  const kind = minutes !== null && Math.abs(minutes - 300) <= 1 ? "five-hour"
    : minutes !== null && Math.abs(minutes - 10080) <= 1 ? "weekly" : "other";
  const reset = numeric(window.reset_at);
  // Date uses milliseconds and has a finite range. Do not forward booleans,
  // absent values, negative epochs or values that cannot represent a date.
  const resetsAt = Number.isInteger(reset) && reset > 0 && reset <= 8_640_000_000_000 ? reset : null;
  return {
    id: kind === "other" ? role : kind,
    kind,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetsAt
  };
}
