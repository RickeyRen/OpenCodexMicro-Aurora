# Configuration

The OpenCodexMicro layout is configured entirely in Ulanzi Studio. Open the
Codex Micro · Aurora category and drag any action onto a keypad position.

Select any configured action to open the shared **Codex Bridge Setup** page.
The page distinguishes the wrapper app installation, Bridge background
service, and Codex CDP connection. It can install or repair the Bridge from
resources bundled with the plugin, launch Codex Bridge, and recheck status.
No repository or npm working directory is required for this flow.

## Actions

| Action | Behavior |
| --- | --- |
| Codex Task 1–13 | Show a short name, stable conversation number, and live state; press to open it |
| Fast | Toggle Fast mode for the active task |
| Usage | Show remaining usage; press to focus Codex |
| Pin | Pin or unpin the active task |
| New | Create a new Codex task |
| Latest Task & Scroll (Encoder) | Press to open task 1; turn left/right to send mouse-wheel up/down through the Ulanzi hotkey protocol |
| Fork | Fork the active task |
| Steer | Send the visible composer text as steering input to a running task |
| Mic | Press and release the Codex Micro microphone action |
| Submit | Submit or queue the composer text |

Task keys use the selected Aurora Silk material with folded light ribbons. Color represents state, not
conversation identity: every working chat shares the cyan/blue palette; waiting
uses amber, completed/unread green, error red, and idle a dim neutral. Unknown
and offline remain neutral. A short name and stable number identify a conversation.
Working, attention, and error use native 24-frame looping GIFs. No circular
frames or badges are layered on the keys. The short name is
composited into each frame with macOS CoreText so Studio's outline never appears.
The original solid-color and Orb alternatives remain in `plugin/premium-art.js`;
the approved Aurora artwork comes from `plugin/design-variants.js`.

## Recommended layout

Use one conversation per small key. Existing Fast, Usage, Pin, New, and other
controls remain available in Studio for other layouts.

### Deck Dock / D200H

The D200H has thirteen small keys and one double-width information window.
This dashboard fills every small key in reading order:

| Row | Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
| --- | --- | --- | --- | --- | --- |
| Top | Task 1 | Task 2 | Task 3 | Task 4 | Task 5 |
| Middle | Task 6 | Task 7 | Task 8 | Task 9 | Task 10 |
| Bottom | Task 11 | Task 12 | Task 13 | System information window | System information window |

The system information window retains its native Studio binding. The optional
live overview uses its pure-background runtime image to show remaining account
allowance, reset time, and running/waiting/error counts without using a small
key. See [native overview setup](#native-wide-overview).
Task 1–6 retain
Codex's native Micro order. The other seven slots use real sidebar conversation
metadata, excluding duplicates; running/attention and unread conversations take
priority, with stable ordering within each priority. Missing metadata is shown
as unknown, never invented as idle. An unassigned slot stays empty. These keys
monitor existing conversations and do not start additional agent processes.

Task 7–13 are appended to the action manifest to preserve previous action UUIDs
and localization indexes. Extra-slot activation is limited to an explicitly
local host and a unique mounted sidebar conversation row; unsupported rows show
an alert instead of sending a native Micro command for the wrong key.

Task keys use up to two readable lines, with roughly three CJK or eight Latin
characters per line. Labels use the actual Codex conversation title, never the
project or working-directory name. An unnamed conversation shows a localized
**Untitled** label and its stable number until Codex assigns it a title. Actual
titles that resemble paths are still formatted as written. Chinese, emoji
sequences, flags, and combining accents remain whole. Each conversation also receives a
small stable number, retained when it moves to another key or Studio restarts.
Select a task key in Studio and edit **Conversation name** to give it a short
local alias; clearing the alias restores the conversation title. Aliases follow the
conversation and do not rename chats in Codex. Explicit two-line aliases retain
their line breaks; overly wide lines are abbreviated instead of shrinking the
type. Use up to three CJK or eight Latin characters per line for best readability.
Only conversation IDs, assigned
numbers, and optional aliases are persisted in
`~/Library/Application Support/OpenCodexMicro/conversation-labels.json`.
A small macOS helper composites clean white CoreText labels into every frame. Task keys
must turn off Studio's separate native title layer to prevent duplicate text
and its automatic black outline. Offline uses `×`; an unassigned slot uses `·`.

Native `working` is shown as working; `unread` as complete; both
`awaiting-approval` and `awaiting-response` as attention; and `error` as error.
Unread completion is distinct from an idle chat whose last turn completed.

## Runtime requirements

- Start Codex through `~/Applications/Codex Bridge.app`.
- Keep the Bridge sidecar running at `127.0.0.1:17373`.
- Allow Ulanzi Studio under macOS System Settings > Privacy & Security >
  Accessibility so the Encoder can emit mouse-wheel events.
- Restart Ulanzi Studio after installing a new plugin build.

The plugin does not require a separate device service, shortcut file, or theme
configuration. To change shipped artwork, edit the files under
`integration/com.ulanzi.codexmicro.ulanziPlugin/plugin/key-art.js`, rebuild, and
reinstall the plugin. Building generates the small native GIF/PNG assets under
`assets/neon/`; Sharp is a development dependency, not a device runtime dependency.

## Native wide overview

This opt-in compatibility route is verified for D200H and **Ulanzi Studio 3.4.4**. It retains Studio's native window action and sends a runtime background image using the normal plugin connection; it does not patch Studio or take over the device. A different Studio version, changed binding or custom background disables the route.

1. Place each of Codex Task 1–13 once on the thirteen small keys of one page.
2. Select the existing bottom-right native wide window. Choose **Pure background** (纯背景), and clear any selected image. Do not replace it with a Codex Task or Usage action.
3. Run `npm run setup:overview -- --enable --lang en` from the repository or extracted release.

The CLI discovers the local page and writes `~/Library/Application Support/OpenCodexMicro/deck-overview.json` atomically with mode 0600. It does not change Studio profiles or launch/restart apps. The plugin rechecks the file within five seconds. To inspect without writing:

```sh
npm run setup:overview
npm run setup:overview -- --enable --dry-run
```

Multiple matching pages require an explicit selection using a path reported by the CLI:

```sh
npm run setup:overview -- --enable --profile "/absolute/path/from/the/status/output/manifest.json"
```

Do not copy another person's profile path or ActionID. If several Studio installations are present, use `--studio-app /absolute/path/to/Ulanzi.app`. `--lang zh` provides Chinese instructions.

To disable, run `npm run setup:overview -- --disable`, then select Clock in Studio to restore its clock. Disabling stops runtime updates; it does not edit your window settings.

The wide display shows only allowance windows supplied by the desktop app. A weekly-only response stays weekly; no five-hour limit, token balance or credit estimate is invented. Two real windows rotate through the usage section; activity counts remain visible. Counts cover the displayed conversations, not every task on every machine. More than 15 minutes without a usage update is marked stale.

### Common setup problems

| Message / symptom | Fix |
| --- | --- |
| Still a clock | Select the native window, choose Pure background, clear the image, then enable |
| No matching page | Put all thirteen different Task actions on one D200H page |
| Multiple pages | Select one reported path with `--profile` |
| Unsupported Studio | Native overview stays disabled until that version is verified |
| Usage unavailable | Check the desktop connection with doctor; some accounts expose fewer windows |
| Duplicate-looking names | Set concise local aliases; conversation numbers remain distinct |
