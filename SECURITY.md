# Security

Aurora is a local desktop integration. The Bridge API listens on `127.0.0.1:17373`; the official desktop app's debugger listens on `127.0.0.1:9222` when launched through Codex Bridge.app.

## Trust boundary

CDP can inspect and control the desktop application, including its authenticated UI. The Bridge can select chats and invoke actions such as submit or approval. Treat both endpoints as privileged local interfaces.

Loopback prevents ordinary LAN access, but it is **not authentication against local software or other users able to reach the same host**. Do not forward these ports, publish them through a tunnel, bind them to all interfaces, disable the request guards or run an untrusted page inside an environment with debugger access.

The HTTP Bridge requires its exact bound loopback Host and rejects any Origin header or browser Fetch Metadata headers (a lone `Sec-Fetch-Mode: cors` from Node fetch is allowed) before executing a route. This reduces browser cross-site and DNS rebinding attacks; it is not a substitute for a secure local machine. It is intended for the Node-based plugin, not direct browser clients.

The project adds no hosted backend or API-key requirement. Titles, aliases, cached artwork, logs and local profile paths remain local in normal operation. The official ChatGPT/Codex application retains its own networking and service behavior. Review dependencies and changes before running a fork.

## Turn it off

1. Save work and quit ChatGPT/Codex normally, then launch the official app directly to omit the debugger arguments.
2. To stop the sidecar, use `launchctl bootout "gui/$(id -u)/io.opencodexmicro.bridge"`. It starts again at next login unless uninstalled.
3. To remove this integration, follow `npm run uninstall` in [operations](docs/setup-and-operations.md). The uninstaller does not delete your conversations or the official app.

## Report a vulnerability

Use GitHub's **Security → Report a vulnerability** on [RickeyRen/OpenCodexMicro-Aurora](https://github.com/RickeyRen/OpenCodexMicro-Aurora/security) when private reporting is available. If it is unavailable, open a public issue containing only a request for a private contact, with no exploit, logs or personal data. Do not send credentials or conversation content.

This is a volunteer project with no guaranteed response time. Current compatibility and important changes are documented in the README and changelog.
