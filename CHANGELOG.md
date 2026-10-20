# Changelog

## 0.5.0 — Aurora · 2026-10-20

First independently published Aurora release, based on OpenCodexMicro.

- Thirteen independent conversation keys with actual chat titles, readable two-line names, persistent identifiers and editable local aliases.
- Original Aurora Silk animations with shared status colors and native GIF playback; unchanged state does not restart the animation.
- Optional D200H native wide overview with large remaining-usage percentage, reset countdown and running / waiting / error counts.
- Portable overview setup that discovers and validates the user's own profile without editing it; Studio 3.4.4 compatibility guard.
- Thirty-second default usage refresh, preserving custom LaunchAgent environment on repair.
- Strict usage normalization and explicit missing / stale / offline states.
- Bridge request guards against browser-origin requests, Fetch Metadata, invalid Host headers and malformed URLs.
- Read-only diagnostics and launchers that refuse to interrupt an existing desktop app.
- English / Chinese onboarding, sanitized animated demo, macOS CI and a whitelisted release package with SHA-256 checksums.

Tested on Apple Silicon macOS with Ulanzi D200H and Studio 3.4.4. Desktop internal interfaces remain version-sensitive.
