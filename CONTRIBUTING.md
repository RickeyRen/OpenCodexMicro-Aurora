# Contributing

Thanks for helping make Aurora easier to use on real desks.

## Run the checks

Use macOS, Node.js 20+ and Apple's Command Line Tools. Build the root and plugin dependencies separately:

```sh
npm ci
npm --prefix integration/com.ulanzi.codexmicro.ulanziPlugin ci
npm run check
```

Checks use fixtures and mock services. Do not restart ChatGPT or replace an installed Studio plugin just to run tests. Changes to source must include regenerated plugin `dist/`, the bundled installer Bridge and any affected artwork. Run `npm run build:media` when deliberately updating the public rendered demo.

## Good first contributions

- Installation failures with exact OS, chip, Studio and desktop app versions.
- Localized copy and short-title rendering across scripts and emoji.
- Small compatibility adapters with fixtures and safe failure behavior.
- Accessibility and readability improvements verified at device dimensions.

For a new hardware model or Studio version, open an issue with a sanitized layout description before removing a compatibility guard. Do not claim device verification based only on a rendered mock.

Keep pull requests focused. Explain the trigger, resulting behavior and relevant validation. Preserve upstream attribution, MIT notices, action UUIDs and the separation between the plugin and inherited Bridge.

## Keep reports private by default

Never attach real conversation content, unredacted logs, Studio profile exports, account identifiers, access tokens or debugger payloads. `npm run doctor -- --lang en` intentionally projects connection metadata; review even this output before sharing it. Public demo images must use synthetic chat titles and example usage.

Report security issues using [SECURITY.md](SECURITY.md), not a public issue containing exploit details or personal data.
