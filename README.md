# Snipio

A little snippet. A lot less typing.

Version 1.4.2 adds Firefox desktop packaging and uses the same soft, synthesized expansion sound in Chrome, Edge, and Firefox. See [release notes](docs/RELEASE_1.4.2.md).

Snipio is a **free, open-source browser extension** that expands short triggers into text as you type. **No account, no registration, no cloud service. Your library stays on your device.**

## Features

- Instant text expansion with multiple triggers per snippet.
- A small toolbar popup and a full editor.
- Folders, favorites, search, and previews.
- Rich text, dates, times, clipboard variables, forms, and conditions.
- Local usage statistics and JSON backup export/import.

## Install from source

The source and release packages target desktop Chrome, Edge, and Firefox. Firefox requires version 140 or newer. Store listings are published separately; the instructions below install a local development copy.

### Chrome and Edge

1. Download this repository as a ZIP and extract it, or clone it.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**, then choose **Load unpacked**.
4. Select the **`extension/`** folder inside this project.
5. Pin Snipio and refresh any website tabs that were already open.

You can load `extension/` directly in Chrome or Edge without a build. After changing the source, reload Snipio on the extensions page and refresh the website you are testing.

### Firefox

1. Install Node.js 22 or newer and open a terminal in this repository.
2. Run `node scripts/build.cjs firefox` to create the Firefox package.
3. In Firefox, open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on**.
4. Select **`dist/firefox/manifest.json`**. Grant the requested website access, and refresh website tabs before testing expansion.
5. Reload the temporary extension after rebuilding changed source.

A temporary Firefox installation is removed when the browser restarts. Regular distribution requires a Mozilla-signed release. See [Firefox release instructions](docs/FIREFOX_RELEASE.md) before submitting a package.

If you already use an unpacked copy, export a backup before switching installation folders. Keep the old installation until you have imported your backup into the new one.

## Your data

Snippets, settings, drafts, and usage history use local extension storage (`browser.storage.local` / `chrome.storage.local`). Snipio has no accounts, analytics, automatic uploads, or cloud sync. Text expanded into a website is visible to that website. The optional support link opens Ko-fi when clicked.

**Before uninstalling, export a backup.** Choose **Backup** in the popup or **Backup & restore** in the editor. Uninstalling deletes local extension data. Importing a backup replaces the current data after confirmation. Backup files contain readable text and are not encrypted.

Read the [Privacy Policy](PRIVACY.md) for details about local data, clipboard and website access, backups, retention, and external services.

## Development

Use Node.js 22 or newer. Runtime code has no third-party dependencies.

```sh
npm test
npm run check
node scripts/build.cjs
```

Optional browser tests:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

See [tests/README.md](tests/README.md) for individual tests and the optional Lexical fixture.

The build uses Node.js built-in modules and does not need installed development dependencies. It creates loadable folders at `dist/chrome-edge/` and `dist/firefox/`, plus `dist/snipio-chrome-edge-1.4.2.zip` and `dist/snipio-firefox-1.4.2.zip`. The version comes from the extension manifest. Both targets use Manifest V3 and package all executable scripts locally. Build output is ignored by Git; change the shared source rather than editing `dist/`.

```text
extension/    Shared source; load directly in Chrome or Edge
  lib/        Shared snippet, template, and backup logic
  pages/      Popup, editor, backup, stats, and local audio pages
  styles/     Shared theme
  assets/     Icons and original expansion sound
tests/        Unit tests, browser tests, and optional fixtures
scripts/      Checks and asset-generation tools
dist/         Generated browser-specific folders and ZIPs (ignored)
docs/         Release audit, license notices, and release checklist
```

## Contribute

Bug reports and pull requests are welcome. Use sample data in reports, keep changes focused, and run the relevant tests. Help keep Snipio simple, free, and usable without an account. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

Snipio is free to use. If it helps you, you can [support the project on Ko-fi ♥](https://ko-fi.com/snipiosupport).

## License

Copyright (C) 2026 DarkyTheRookie. The current version is open source under GPL-3.0. Future versions may include proprietary components and paid services. The project name and logo are not covered by this license.

See [LICENSE](LICENSE) for the GPL-3.0 text. Source files use `GPL-3.0-or-later`. See [third-party notices](docs/THIRD_PARTY_NOTICES.md) and the [release checklist](docs/RELEASE_CHECKLIST.md).
