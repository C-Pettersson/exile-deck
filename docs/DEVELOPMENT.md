# Development

Node 20 or later. The plugin runs on the Node 20 runtime that ships with Stream Deck and has no npm dependencies.

| Path | Contents |
| --- | --- |
| `plugin/com.poehow.exile-deck.sdPlugin/bin/plugin.js` | Entry: Stream Deck WebSocket, actions, key presses |
| `.../bin/api.js` | Cached client for the public `poe.how/api/deck/v1` data |
| `.../bin/itemtext.js` | Parses copied item text and finds the matching price |
| `.../bin/regex.js` | Rules for saved search strings |
| `.../bin/render.js` | Key images as SVG |
| `.../bin/input.js`, `helper.ps1` | Input helper, limited to the active game window |
| `.../pi/index.html` | Property inspector |
| `tools/` | Fake Stream Deck, sample data and image tools |
| `test/` | Tests (`node:test`) |

## Commands

- `npm test`: unit tests and an end-to-end run against a fake Stream Deck with sample data.
- `npm run render -- gem`: writes both deck pages to `tools/out/`. Needs Edge or Chrome (`BROWSER_PATH` overrides).
- `npm run assets` and `npm run listing`: regenerate plugin icons and Marketplace images.
- `npm run validate` and `npm run pack`: Elgato's CLI. The package lands in `dist/`.

## Install a development build

Copy the `.sdPlugin` folder to `%APPDATA%\Elgato\StreamDeck\Plugins\` and restart Stream Deck.

## Release

1. Set the version in `bin/version.js`, `package.json`, `manifest.json` (four parts) and `CHANGELOG.md`.
2. Push a tag such as `v1.0.0`. The release workflow tests, validates, packs and drafts a GitHub release.
3. Upload the same package in Elgato Maker Console. Never change the plugin or action UUIDs after publishing.
