export const DASHBOARD_SLOT_COUNT = 13;
export const NATIVE_SLOT_COUNT = 6;

// This function is serialized into the already connected renderer. It reads the
// same metadata signals used by Codex Micro, before Micro truncates them to six.
// It never reads turns, messages, credentials, or conversation contents.
export async function readSidebarThreads(source, options = {}) {
  const urls = options.urls ?? [];
  const importModule = options.importModule ?? ((url) => import(url));
  const readModuleText = options.readModuleText ?? (async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error("Codex Micro metadata module is unavailable");
    const text = await response.text();
    if (text.length > 262144) throw new Error("Codex Micro metadata module exceeds the read limit");
    return text;
  });
  const signalsUrl = urls.find((url) => /\/codex-micro-slot-signals-[^/]+\.js$/.test(url));
  if (!signalsUrl) throw new Error("Codex Micro metadata module was not found");
  let cached = source.sidebarMetadataSource;
  if (!cached || cached.signalsUrl !== signalsUrl) {
    const text = await readModuleText(signalsUrl);
    const imports = [...text.matchAll(/import\{([^}]+)\}from["']([^"']+)["']/g)]
      .find((match) => /\/app-initial-[^/]+\.js$/.test(match[2]));
    if (!imports) throw new Error("Codex sidebar metadata imports are unsupported");
    const imported = new Map(imports[1].split(",").map((entry) => {
      const [exported, alias = exported] = entry.trim().split(/\s+as\s+/);
      return [alias, exported];
    }));
    // Resolve aliases from the official Micro module rather than pinning its
    // changing, minified export names to one ChatGPT release.
    const aliases = {
      sidebar: text.match(/(?:let|const)\s+\w+=\w+\((\w+),[`"]codex[`"]\)/)?.[1],
      descriptor: text.match(/let\s+\w+=\w+\((\w+),\w+\);if\(\w+==null\)return\[\];switch\(\w+\.kind\)/)?.[1],
      attention: text.match(/attention:\w+\((\w+),\{conversationId:/)?.[1],
      status: text.match(/status:\w+\((\w+),\{hostId:[^}]+conversationId:/)?.[1],
      live: text.match(/\w+=\w+\((\w+),\w+\)\?\.summary\?\?\w+\((\w+),\{hostId:/)?.[1],
      summary: text.match(/\w+=\w+\((\w+),\w+\)\?\.summary\?\?\w+\((\w+),\{hostId:/)?.[2],
      host: text.match(/\.summary\.hostId\?\?\w+\((\w+),\w+\.summary\.conversationId\)/)?.[1]
    };
    const namespace = await importModule(new URL(imports[2], signalsUrl).href);
    const resolvers = {};
    for (const [role, alias] of Object.entries(aliases)) {
      const resolver = namespace[imported.get(alias)];
      if (!resolver || typeof resolver.resolve !== "function") {
        throw new Error(`Codex sidebar ${role} metadata signal is unsupported`);
      }
      resolvers[role] = resolver;
    }
    cached = { signalsUrl, resolvers };
    source.sidebarMetadataSource = cached;
  }
  const get = (resolver, argument) => {
    let atom = resolver.resolve(source.node, source.contextMap, argument);
    // Parameterized Maitai families first resolve to their member signal.
    if (atom && typeof atom.resolve === "function") {
      atom = atom.resolve(source.node, source.contextMap);
    }
    return source.node.store.get(atom);
  };
  const r = cached.resolvers;
  const sidebar = get(r.sidebar, "codex");
  const keys = sidebar?.threadStateKeys ?? sidebar?.threadKeys;
  if (!Array.isArray(keys)) throw new Error("Codex sidebar thread metadata is unavailable");
  const rows = [];
  for (const key of [...new Set(keys)].slice(0, 128)) {
    try {
      const descriptor = get(r.descriptor, key);
      if (descriptor?.kind === "local" && descriptor.summary) {
        const id = descriptor.summary.conversationId;
        const hostId = descriptor.summary.hostId ?? get(r.host, id);
        if (!id || !hostId) continue;
        const params = { hostId, conversationId: id };
        const localStatus = get(r.status, params);
        const attention = get(r.attention, params);
        const live = get(r.live, { hostId, threadId: id });
        const storedSummary = get(r.summary, params);
        const summary = live?.summary ?? storedSummary;
        // The sidebar display-title resolver may substitute a workspace path
        // or project label. Read only conversation metadata's own title. An
        // explicit null/empty title is authoritative, including after a rename.
        const summaryCandidates = [live?.summary, storedSummary, descriptor.summary];
        const titledSummary = summaryCandidates
          .find((value) => value && Object.hasOwn(value, "title"));
        let title = typeof titledSummary?.title === "string"
          ? titledSummary.title.trim() || null : null;
        // List summaries themselves can fill an untitled conversation's title
        // with its full cwd. Reject only that exact metadata-proven fallback;
        // another path or a name matching the directory basename can be a real
        // conversation title and must remain unchanged.
        if (title && summaryCandidates.some((value) => typeof value?.cwd === "string" && value.cwd.trim() === title)) {
          title = null;
        }
        let status = "unknown";
        if (localStatus === "error") status = "error";
        else if (attention?.kind === "approval") status = "awaiting-approval";
        else if (attention?.kind === "input") status = "awaiting-response";
        else if (localStatus === "loading") status = "working";
        else if (localStatus === "idle") status = summary?.hasUnreadTurn ? "unread" : "idle";
        rows.push({
          threadKey: key,
          hostId,
          title,
          status,
          recencyAt: Number(descriptor.summary.recencyAt ?? descriptor.summary.updatedAt) || 0,
          source: "sidebar"
        });
      } else if (descriptor?.kind === "remote" && descriptor.task) {
        const task = descriptor.task;
        const turnStatus = task.task_status_display?.latest_turn_status_display?.turn_status;
        const status = turnStatus === "failed" ? "error"
          : turnStatus === "pending" || turnStatus === "in_progress" ? "working"
            : task.has_unread_turn ? "unread"
              : turnStatus === "completed" ? "idle" : "unknown";
        rows.push({
          threadKey: key,
          hostId: null,
          title: task.title ?? null,
          status,
          recencyAt: (Number(task.updated_at ?? task.created_at) || 0) * 1000,
          source: "sidebar"
        });
      }
    } catch {
      // A partially unloaded row must not invent an idle or working status.
      rows.push({ threadKey: key, hostId: null, title: null, status: "unknown", recencyAt: 0, source: "sidebar" });
    }
  }
  return rows;
}

export function mergeDashboardSlots(nativeSlots, sidebarThreads, previousSlots = [], activeThreadKey = null) {
  const rows = new Map(sidebarThreads.map((row) => [row.threadKey, row]));
  const slots = nativeSlots.slice(0, NATIVE_SLOT_COUNT).map((slot) => ({
    ...slot,
    // Native Micro titles use the same formatted display-title resolver. Never
    // retain that project/path fallback when actual title metadata is missing.
    title: rows.get(slot.threadKey)?.title ?? null,
    hostId: rows.get(slot.threadKey)?.hostId ?? null,
    nativeSlot: slot.id,
    source: "micro"
  }));
  const seen = new Set(slots.map((slot) => slot.threadKey).filter(Boolean));
  const candidates = [...rows.values()].filter((row) => !seen.has(row.threadKey));
  const priority = (row) => ["working", "awaiting-approval", "awaiting-response", "error"].includes(row.status) ? 2
    : row.status === "unread" ? 1 : 0;
  const previousOrder = new Map(previousSlots.slice(NATIVE_SLOT_COUNT).map((slot, index) => [slot.threadKey, index]));
  candidates.sort((a, b) => priority(b) - priority(a)
    || (previousOrder.get(a.threadKey) ?? Infinity) - (previousOrder.get(b.threadKey) ?? Infinity)
    || b.recencyAt - a.recencyAt);
  for (const row of candidates) {
    if (slots.length === DASHBOARD_SLOT_COUNT) break;
    if (!row.threadKey || seen.has(row.threadKey)) continue;
    seen.add(row.threadKey);
    const normalize = (key) => String(key ?? "").replace(/^local:/, "");
    slots.push({ ...row, id: slots.length, nativeSlot: null, selected: Boolean(activeThreadKey) && normalize(row.threadKey) === normalize(activeThreadKey) });
  }
  while (slots.length < DASHBOARD_SLOT_COUNT) {
    slots.push({ id: slots.length, threadKey: null, title: null, status: "off", selected: false, nativeSlot: null, source: "empty" });
  }
  return slots;
}
