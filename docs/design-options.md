# Motion design options and allowance overview

The four original studies in `plugin/design-variants.js` were prepared as
alternatives to the Orb theme. The user selected **Aurora Silk / 极光丝带**;
it is now the shipped default for all thirteen conversation keys. Preparing a
preview alone does not change the installed theme. Every design uses the same state mapping: cyan/blue for working, amber
for attention, green for unread completion, red for errors, and neutral idle.

- **Aurora Silk / 极光丝带:** broad, folded light ribbons.
- **Plasma Tide / 等离子潮汐:** intersecting energy contours.
- **Prism Glass / 折射晶面:** moving reflections across distinct glass facets.
- **Circuit Scan / 光轨扫描:** a quiet center with traveling edge highlights.

`designVariantSvg(id, status, phase)` renders a 196 × 196 background frame. The
native CoreText compositor supplies readable conversation labels and stable
numbers. Working, attention, and error studies wrap across 24 frames at 80 ms;
settled states remain still. Every tested native loop fits within 200 KiB.

## In-conversation comparison

The source fragment is `design/deck-motion-options.fragment.html`. Build a
self-contained comparison with:

```sh
node scripts/build-design-preview.mjs /absolute/output/deck-motion-options.html
```

The builder reads only the existing loopback `/state` snapshot. It embeds
allowance metadata and anonymized, deduplicated statuses; no real conversation
IDs, titles, transcripts, or host details are included. Browser-side previews
make no network requests. The quota image is a snapshot and a design concept.
Inline SVG definitions are namespaced per sample so colors cannot leak between
different status previews.

## Live allowance overview on the native window

`renderOverviewSvg(state, {now, language})` in `plugin/overview-art.js` prepares a
460 × 200 information panel. It uses only allowance windows actually supplied
by Codex: weekly and, when present, five-hour limits. It shows remaining
percentages, reset time, and running/attention/error counts for the conversations
shown on the keys. These are usage limits, not money, API credits, or token
balances. Missing, disconnected, malformed, or over-15-minute-old allowance
data produces an unavailable value instead of a fabricated percentage.

The D200H bottom-right panel remains the built-in
`com.ulanzi.ulanzideck.smallwindow.window`. Ordinary plugin actions cannot be
dragged onto it, and importing a background copies a snapshot into profile
assets. Those paths do not provide live allowance updates. However, a verified
Studio 3.4.4 compatibility path now updates its runtime image over the plugin's
existing registered WebSocket connection using legacy `cmd:state`. This preserves
the native ActionID and all thirteen conversation actions. No app patch, firmware
change, alternate device driver, or native-plugin identity is used.

Select the native window's **Pure background / 纯背景** mode in Studio. Its saved
`SmallViewMode` is **2**, and `ViewParam.Icon` / `IconRel` must remain empty.
Do not import a custom image: Studio protects user-selected backgrounds against
runtime updates. Enable this integration explicitly in
`~/Library/Application Support/OpenCodexMicro/deck-overview.json`:

```json
{
  "enabled": true,
  "studioVersion": "3.4.4",
  "profilePath": "/absolute/path/inside/UlanziDeck/ProfilesV2/.../manifest.json",
  "actionid": "the-existing-native-window-action-id"
}
```

The plugin validates the real profile path, native action, empty background,
mode, ActionID, and Studio version before sending images. It rechecks every
five seconds and stops if the user changes those settings. Runtime updates are
deduplicated, limited to one per second, and use SVG without adding a rendering
dependency. Reset countdowns update automatically. The existing Bridge polls
conversation state every 500 ms; account allowance follows Codex's supplied
observations. This installation configures the Bridge's supported
`CODEX_KEYBOARD_USAGE_REFRESH_SECONDS` environment setting to 30 seconds rather
than its default 600. Data older than fifteen minutes or a disconnected Bridge
shows an unavailable value, never a fabricated balance.

The physical-panel layout prioritizes distance readability: the allowance uses
128 px numerals (98 px for `100`) with a smaller percent sign, and three
horizontal status columns use 76 px counts (58 px for two digits). Labels are
26–28 px with high contrast; counts have no leading zeros. Two supplied
allowance windows rotate on the left every six seconds while all three status
counts remain visible. A single window stays fixed. The layout is checked at
460 × 200 and at a 245 × 107 preview size, including all eight locales,
`100%`, thirteen conversations, and disconnected values.

This legacy window route is a Studio 3.4.4 compatibility integration rather than
a documented Window controller. A different Studio version disables it until
reverified. To disable it, set `enabled:false` and select a clock mode in Studio.
The clock mode before enabling this feature was `SmallViewMode:1`.

Relevant upstream API references:

- [SDK manifest](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK/blob/main/manifest.md)
- [SDK commands](https://github.com/UlanziTechnology/plugin-common-node/blob/main/libs/ulanziApi.js)
