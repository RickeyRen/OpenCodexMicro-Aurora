import { renderOverviewSvg } from "./overview-art.js";

function svgImage(svg) {
  return { type: 1, data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

function imagePayload(image) {
  const field = ({ 1: "data", 2: "path", 4: "gifpath" })[image?.type];
  if (!field || typeof image[field] !== "string" || !image[field]) {
    throw new TypeError("Overview renderer must return an SVG, PNG or GIF state image");
  }
  return { type: image.type, [field]: image[field] };
}

/**
 * Keep one explicitly selected native window current without creating a plugin
 * action or changing any conversation key. The caller supplies the verified
 * native window address and calls update with its normal Bridge state poll.
 *
 * Compare rendered content rather than Bridge timestamps: repeated polls do not
 * resend an unchanged image, but a reset countdown or stale quota does update.
 */
export function createOverviewDisplay({ send, target, renderImage = svgImage, language = "en",
  now = Date.now, minUpdateMs = 1000, isCurrent = () => true, onError = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (typeof send !== "function" || typeof renderImage !== "function") {
    throw new TypeError("Overview display requires send and renderImage functions");
  }
  if (!["uuid", "actionid", "key"].every(field => typeof target?.[field] === "string" && target[field])) {
    throw new TypeError("Overview display requires a verified native window target");
  }
  const destination = Object.freeze({ uuid: target.uuid, actionid: target.actionid, key: target.key });
  const displayLanguage = typeof language === "string" ? language.slice(0, 64) : "en";
  const interval = Math.max(1000, Number.isFinite(Number(minUpdateMs)) ? Number(minUpdateMs) : 1000);
  let latestState;
  let desiredSvg;
  let displayedSvg;
  let lastActivityAt = -Infinity;
  let generation = 0;
  let timer = null;
  let inFlight = false;
  let disposed = false;
  let reportedError = null;
  let invalidStateReported = false;

  function clock() {
    try {
      const value = Number(now());
      if (Number.isFinite(value)) return value;
    } catch { /* An invalid clock must not interrupt the Bridge poll. */ }
    return Date.now();
  }

  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function pump() {
    if (disposed || !isCurrent() || inFlight || desiredSvg === undefined || desiredSvg === displayedSvg) return;
    const instant = clock();
    // A wall-clock correction must not freeze the panel until the old time.
    if (instant < lastActivityAt) lastActivityAt = instant - interval;
    const delay = Math.max(0, lastActivityAt + interval - instant);
    if (delay > 0) {
      if (timer === null) {
        timer = setTimer(() => { timer = null; pump(); }, delay);
        timer?.unref?.();
      }
      return;
    }
    cancelTimer();
    const svg = desiredSvg;
    const ticket = generation;
    inFlight = true;
    lastActivityAt = instant;
    Promise.resolve().then(() => renderImage(svg)).then(imagePayload).then(async image => {
      if (disposed || !isCurrent() || ticket !== generation || desiredSvg !== svg || displayedSvg === svg) return;
      await send({ cmd: "state", param: { statelist: [{ ...image, ...destination, showtext: false, textdata: "" }] } });
      displayedSvg = svg;
      lastActivityAt = clock();
      reportedError = null;
    }).catch(error => {
      const message = String(error?.message ?? error);
      if (!disposed && ticket === generation && message !== reportedError) {
        reportedError = message;
        try { onError(error); } catch { /* Reporting must not break the state poll. */ }
      }
    }).finally(() => {
      inFlight = false;
      // Coalesce every state received during rendering into the newest image.
      // A failure of that same image waits for a later update before retrying.
      if (!disposed && (desiredSvg !== svg || ticket !== generation)) pump();
    });
  }

  function refresh() {
    if (disposed || latestState === undefined) return;
    try {
      desiredSvg = renderOverviewSvg(latestState, { now: clock(), language: displayLanguage });
      invalidStateReported = false;
    } catch {
      // Bridge JSON can contain objects where a numeric or status value was
      // expected. Never let their primitive conversions abort the normal poll
      // or leave a previously valid percentage looking current.
      desiredSvg = renderOverviewSvg({ connected: false }, { now: clock(), language: displayLanguage });
      if (!invalidStateReported) {
        invalidStateReported = true;
        const error = Object.assign(new Error("Overview display: Bridge state could not be rendered"), {
          code: "OVERVIEW_INVALID_STATE"
        });
        try { onError(error); } catch { /* Reporting must not interrupt the state poll. */ }
      }
    }
    // Even a return to the displayed image invalidates an older pending render.
    if (desiredSvg === displayedSvg) cancelTimer();
    pump();
  }

  return Object.freeze({
    update(state) {
      if (disposed) return;
      latestState = state ?? {};
      refresh();
    },
    refresh,
    invalidate() {
      if (disposed) return;
      generation += 1;
      displayedSvg = undefined;
      cancelTimer();
      refresh();
    },
    dispose() {
      disposed = true;
      generation += 1;
      latestState = undefined;
      desiredSvg = undefined;
      cancelTimer();
    }
  });
}
