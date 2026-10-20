# OpenCodexMicro · Aurora

### A live Codex dashboard for your desk.

Thirteen conversations. State-driven Aurora animation. Remaining usage and AI activity on the wide display. Turn your **Ulanzi Deck Dock D200H** into a glanceable companion for Codex Desktop.

[中文](README_zh.md) · [Get started](#get-started) · [Releases](https://github.com/RickeyRen/OpenCodexMicro-Aurora/releases) · [Report a problem](https://github.com/RickeyRen/OpenCodexMicro-Aurora/issues)

![Aurora dashboard with thirteen conversation keys and a wide usage display](docs/images/aurora-hero.png)

*Rendered demo with sample conversations and example usage. The artwork uses the same renderers as the device.*

## See what needs you

Keep working without repeatedly checking thirteen chats. A flowing blue key means work is running. Amber needs your attention. Green marks a finished, unread response. Press a key to open that exact conversation.

![Aurora status animations, rendered with sample conversations](docs/images/aurora-demo.gif)

| On your desk | What you get |
| --- | --- |
| **13 independent conversation keys** | Actual chat titles, two readable lines, persistent conversation numbers and optional local short names |
| **Aurora Silk motion** | Original animated light ribbons; the same state always uses the same color |
| **A separate wide overview** | Large remaining-usage percentage, reset countdown and running / waiting / error counts, without using a conversation key |
| **Exact conversation switching** | Native Micro routing for slots 1–6 and a verified sidebar adapter for slots 7–13 |
| **Optional extra controls** | Fast, Usage, Pin, New, Fork, Steer, Mic, Submit and encoder scrolling on another page |
| **Local connection** | Ulanzi Studio owns the device; a loopback Bridge connects the official desktop app |

| Blue | Amber | Green | Red | Dim neutral |
| --- | --- | --- | --- | --- |
| Running | Waiting for input / approval | Completed, unread | Error | Idle |

This is **RickeyRen's independent MIT-licensed fork** of [UlanziTechnology/OpenCodexMicro](https://github.com/UlanziTechnology/OpenCodexMicro), originally created by [Nian Liu](https://github.com/He11oLiu). It is unofficial and is not endorsed or supported by OpenAI or Ulanzi. [Attribution and responsibility](NOTICE.md).

## Compatibility

| Component | First Aurora release |
| --- | --- |
| Computer | macOS 13+ on **Apple Silicon**; bundled glyph helper is arm64 |
| Hardware | **Ulanzi Deck Dock D200H**, tested on a physical device |
| Ulanzi Studio | **3.4.4**; the native wide-panel route deliberately disables itself on other versions |
| Desktop app | Official ChatGPT/Codex desktop app exposing Micro state; verified with 26.1013.40934 |
| Manual install / development | Node.js 20+; Node 22 recommended |

The desktop adapter uses internal interfaces, so app updates can require changes here. Intel Macs, other devices, Windows and Linux are not validated by this release. The wide panel is an opt-in compatibility feature. [Details and limitations](docs/configuration.md).

## Get started

### Install the plugin and Bridge

Save your work and **quit Ulanzi Studio normally** before replacing its plugin. Clone this repository, or extract the macOS arm64 ZIP from [Releases](https://github.com/RickeyRen/OpenCodexMicro-Aurora/releases), then run from its folder:

```bash
git clone https://github.com/RickeyRen/OpenCodexMicro-Aurora.git
cd OpenCodexMicro-Aurora
npm ci
npm run install:plugin
npm run setup
```

The repository includes the prebuilt plugin. Installation needs no `sudo`. It installs `~/Applications/Codex Bridge.app`, its own sidecar LaunchAgent and the Studio plugin. The plugin keeps the upstream UUID, so Aurora **replaces an existing Codex Micro plugin** rather than installing beside it. Export your Studio profile before switching editions.

Reopen Studio. Save work and **quit the normally launched ChatGPT/Codex app**, then open:

```bash
open "$HOME/Applications/Codex Bridge.app"
npm run doctor -- --lang en
```

**Why a launcher?** It starts the official installed app with a loopback-only debugger connection. It does not patch the official app, replace its updater, or supply a modified ChatGPT build. It refuses to interrupt an already-running instance. Launch through the Bridge when you want the dashboard; normal app launch does not enable the connection.

### Fill the thirteen small keys

In Studio, find **Codex Micro · Aurora**. Drag **Codex Task 1–13** onto the thirteen small keys of one D200H page. Leave the bottom-right native wide window in place. Open existing conversations in the desktop app; unused slots stay empty.

Select a key to edit its **short name** if the automatic title is hard to tell apart. This changes only the local device label. Its small number follows the conversation when the key order changes.

### Enable the wide overview

Select the native bottom-right window in Studio. Choose **Pure background** (纯背景) and clear its image, then run:

```bash
npm run setup:overview -- --enable --lang en
```

The command discovers your page and validates its thirteen task bindings, native window and Studio version. It writes only a local opt-in file; it never edits your Studio profile. Multiple matching pages require an explicit `--profile` path. See [wide-panel setup](docs/configuration.md#native-wide-overview) for troubleshooting and disabling.

Status updates follow the Bridge; usage refresh defaults to **30 seconds**, subject to the desktop app's own caching. Only usage windows actually returned by the app are shown. Missing, stale or disconnected usage is clearly marked instead of becoming a fabricated balance.

### 1. LLM / Agent installation

You can also ask a coding agent to install this repository. The agent must read [AGENTS.md](AGENTS.md), inspect installed plugin manifests, then use [install-ulanzi-studio-plugin](skills/install-ulanzi-studio-plugin/SKILL.md) if needed and [setup-codex-bridge](skills/setup-codex-bridge/SKILL.md). Report plugin and Bridge verification separately. Never stop or change the launch mode of ChatGPT without the user's explicit authorization.

## Privacy and safety

No API key or hosted backend is required. The Bridge binds to `127.0.0.1`; this project does not add a cloud data-upload service. Your existing ChatGPT/Codex network behavior still applies.

CDP can inspect and control the desktop app. **Loopback is not an authentication boundary against other local processes.** Do not expose either port through a tunnel, reverse proxy or LAN binding. Browser-origin requests and browser Fetch Metadata are rejected before routes execute; the Node fetch default is supported. Read [SECURITY.md](SECURITY.md) before deployment or redistributing a modified Bridge.

## Develop and contribute

```bash
npm ci
npm --prefix integration/com.ulanzi.codexmicro.ulanziPlugin ci
npm run check
npm run build:media
npm run package:release
```

`check` builds and tests the Bridge, native helper, artwork and plugin using isolated test fixtures. It does not install anything or restart your running apps. Building the native glyph helper needs Apple's Command Line Tools on macOS. The release bundle targets arm64; Intel source builds are experimental.

Useful links: [configuration](docs/configuration.md), [operations / updates / uninstall](docs/setup-and-operations.md), [architecture](docs/architecture.md), [changelog](CHANGELOG.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md).

If Aurora earns a place on your desk, a star helps other Codex users find it. Hardware reports and focused pull requests help make it easier for the next person to install.

## License and credits

[MIT](LICENSE). Original OpenCodexMicro copyright 2026 Nian Liu; inherited Ulanzi Studio integration and Aurora modifications retain their attribution in [NOTICE.md](NOTICE.md). [Third-party notices](THIRD_PARTY_NOTICES.md). Codex, ChatGPT and Ulanzi product names belong to their respective owners.
