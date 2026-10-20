# Setup and Operations

OpenCodexMicro has two installed components:

```text
Codex Desktop <-> Codex Bridge sidecar <-> Ulanzi Studio plugin <-> D200
```

## Dependencies

- macOS 13+ on Apple Silicon;
- Codex Desktop;
- Ulanzi Studio 3.4.4 with a D200H;
- Node.js 20 or newer only for repository-based manual installation.

## 1. Set up Codex Bridge.app in Ulanzi Studio

Drag any Codex Micro action onto a key and select it. In the shared
**Codex Bridge Setup** page, choose **Install / Repair**. The plugin installs
its bundled Bridge runtime, wrapper app, and user LaunchAgent without requiring
a repository path, npm, or administrator access. Then choose
**Launch Codex Bridge** and wait for the CDP status to become connected.

## 2. Set up Codex Bridge.app from the repository

From the repository root:

```bash
npm ci
npm run setup
```

The installer builds the sidecar, writes and starts
`io.opencodexmicro.bridge`, and ad-hoc signs:

```text
~/Applications/Codex Bridge.app
```

To install without starting the sidecar LaunchAgent:

```bash
npm run setup -- --no-start
```

## 3. Install the Ulanzi Studio plugin

Quit Ulanzi Studio before replacing a plugin that is currently loaded, then
run:

```bash
npm run install:plugin
```

The repository ships the prebuilt `dist/app.js`. The command validates that
the manifest entry point exists and atomically replaces:

```text
~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.ulanzi.codexmicro.ulanziPlugin
```

Restart Ulanzi Studio and confirm the **Codex Micro · Aurora** category and actions are
visible.

Plugin development still uses `npm run build:plugin` and `npm run check`; commit
the updated `dist/app.js` and `dist/package.json` with source changes.

## Starting Codex

After saving work and explicitly choosing to restart Codex, quit the normally
launched instance, then open:

```text
~/Applications/Codex Bridge.app
```

The wrapper launches `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT` with:

```text
--remote-debugging-address=127.0.0.1
--remote-debugging-port=9222
--remote-allow-origins=http://127.0.0.1:9222
```

CDP binds to `127.0.0.1:9222` and the sidecar API to `127.0.0.1:17373`.
Both endpoints bind to loopback by default. Do not forward them; local processes can still reach them. See [security](../SECURITY.md).

The launcher refuses to start while the exact ChatGPT executable is already
running. It never sends quit, kill, or restart commands to ChatGPT. If process
detection fails, it stops and displays a message. A failed CDP startup produces
one message and leaves the app alone; it does not retry launching the app.
The LaunchAgent only keeps the Bridge sidecar alive, not ChatGPT.

## Installed files and service

```text
~/Applications/Codex Bridge.app
~/Library/Application Support/OpenCodexMicro/bridge.mjs
~/Library/Application Support/OpenCodexMicro/bridge.log
~/Library/Application Support/OpenCodexMicro/bridge-error.log
~/Library/LaunchAgents/io.opencodexmicro.bridge.plist
~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.ulanzi.codexmicro.ulanziPlugin
```

Inspect or restart the Bridge sidecar:

```bash
launchctl print "gui/$(id -u)/io.opencodexmicro.bridge"
launchctl kickstart -k "gui/$(id -u)/io.opencodexmicro.bridge"
```

## Diagnostics

```bash
npm run doctor -- --lang en
tail -n 60 "$HOME/Library/Application Support/OpenCodexMicro/bridge-error.log"
```

Use `--lang zh` for Chinese explanations. Doctor does not start or restart apps,
evaluate CDP code, or change settings. It reads bounded local responses and
only prints projected connection metadata; chat titles, URLs and content are
omitted. It intentionally skips `/health`, because that legacy endpoint forces
a refresh which can establish CDP and inject the Micro integration. Cached
`/state` and debugger metadata are sufficient for read-only connection checks.
Port availability alone does not prove renderer compatibility.

| Symptom | Check |
| --- | --- |
| Plugin category is missing | Confirm the installed plugin directory contains `manifest.json` and `dist/app.js`, then restart Ulanzi Studio |
| Plugin keys show offline | Start Codex with `Codex Bridge.app` and run `npm run doctor -- --lang en` |
| A task key does not switch | Check `bridge-error.log` and confirm `/state` contains the displayed thread |
| Steer does nothing | Confirm a running task exposes the visible composer Steer action |
| An action has no effect | Confirm the plugin can reach `127.0.0.1:17373` and inspect the Bridge log |

## Update

Export your Studio profile and quit Studio normally before replacing the plugin. Save work and explicitly choose when to quit and relaunch the official desktop app. The commands below update this integration; they do not patch ChatGPT.


```bash
git pull
npm ci
npm --prefix integration/com.ulanzi.codexmicro.ulanziPlugin ci
npm run check
npm run setup
npm run install:plugin
```

Restart Ulanzi Studio after updating the plugin.

## Uninstall

```bash
npm run uninstall
```

This stops and removes the Bridge LaunchAgent, Bridge runtime, wrapper app, and
installed Codex Micro plugin directory.

## Development

```bash
npm ci
npm --prefix integration/com.ulanzi.codexmicro.ulanziPlugin ci
npm run check
```

Main entry points:

- `src/bridge/`: Codex renderer bridge;
- `scripts/build-bridge.mjs`: bundle the loopback sidecar;
- `scripts/install.mjs`: install the sidecar and wrapper app;
- `scripts/install-plugin.mjs`: validate and install the prebuilt Ulanzi plugin;
- `integration/com.ulanzi.codexmicro.ulanziPlugin/`: Ulanzi Studio plugin;
- `scripts/uninstall.mjs`: remove both installed components.

## Usage polling

New installations set `CODEX_KEYBOARD_USAGE_REFRESH_SECONDS=30` in the Bridge LaunchAgent. Repair preserves existing string environment variables, including a custom interval. An explicit same-named installer process variable overrides it; intervals below 15 seconds are rejected. This requests fresh usage from the desktop app, whose caching can delay changes. The Bridge's standalone source default remains ten minutes when no installer environment is present.

## Native wide overview

After placing Task 1–13, choose Pure background with no image on the native wide window, then run `npm run setup:overview -- --enable`. The CLI is read-only without `--enable` or `--disable`. See [configuration](configuration.md#native-wide-overview). Its local configuration and aliases contain user-specific paths or identifiers and must not be committed or attached to public issues.
