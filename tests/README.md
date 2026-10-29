# Tests

The extension has no runtime dependencies. Test tools stay outside `extension/` and are not shipped with it.

## Unit tests

Run from the repository root with Node.js 22 or newer:

```sh
npm test
```

These tests cover expansion rules, templates, migration, concurrent storage operations, usage statistics, backup validation/restore, and browser-specific runtime and packaging behavior. They use synthetic data and do not read the installed extension's data.

## Build and package checks

Build both browser targets with Node.js 22 or newer:

```sh
node scripts/build.cjs
```

Build only Firefox with `node scripts/build.cjs firefox`. Output goes to ignored `dist/`. Both packages use Manifest V3 and local scripts. Chrome/Edge uses a service worker and offscreen media document; Firefox uses an event-page background and local media access. Firefox's manifest declares its stable add-on ID, minimum Firefox 140, and no transmission outside the local browser.

Run the extension package checker against the source and both built folders:

```sh
node scripts/check-extension.cjs
node scripts/check-extension.cjs dist/chrome-edge
node scripts/check-extension.cjs dist/firefox
```

## Chromium browser tests

Browser tests require Playwright and a Chromium-based browser. Install the development tools and run the smoke suite:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

The smoke suite covers backups, library organization, template reset, sound, and live extension behavior. Choose additional scripts by name:

```sh
npm run test:browser -- browser-check editor-browser constructor-browser
```

Set `SNIPIO_BROWSER_EXECUTABLE` to use an existing compatible browser instead of Playwright's Chromium. Individual scripts also accept an optional Playwright module path and browser executable path:

```sh
node tests/browser/browser-check.cjs
node tests/browser/backup-browser.cjs playwright "/path/to/chromium"
```

The default module is `playwright`; omitting the executable uses its installed Chromium. Scripts that load the extension require a browser that supports unpacked extensions through launch flags.

These Chromium scripts do not establish Firefox compatibility. Firefox needs its own extension-installation and API checks; do not report a Chromium pass as a Firefox pass.

The additional `firefox-pages.cjs` regression loads the generated Firefox package in Chromium with only the Promise-based `browser` API available. It covers popup expansion and persistence, the editor, statistics, backup export/import, and template reset. Run it after building:

```sh
npm run build:firefox
npm run test:browser -- firefox-pages
```

This checks shared UI/API integration, not native Firefox behavior. It does not replace the Firefox desktop checks below.

Tests use isolated mock storage or disposable browser profiles, rather than your normal browser profile. The mock storage in some UI fixtures uses `localStorage`; the shipped extension uses `chrome.storage.local`.

Useful groups:

- Popup and editor: `browser-check.cjs`, `editor-browser.cjs`, `editor-navigation.cjs`, `organization-browser.cjs`, `name-validation-browser.cjs`.
- Persistence: `autosave-browser.cjs`, `backup-browser.cjs`, `reset-library-browser.cjs`.
- Templates and rich editors: `blocks-browser.cjs`, `constructor-browser.cjs`, `examples-browser.cjs`, `features-browser.cjs`, `rich-editors.cjs`.
- Real extension behavior: `live-extension.cjs`, `advanced-extension.cjs`, `sound-browser.cjs`. The advanced check reads clipboard availability without logging its contents. Local HTTP fixtures bind only to `127.0.0.1`.

Generated screenshots go into ignored `artifacts/`. `helpers.cjs` resolves extension files independently of the current working directory and creates artifact directories when needed.

## Firefox desktop checks

Use a separate temporary Firefox installation and synthetic snippets. Build the Firefox target, open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on** and select `dist/firefox/manifest.json`. Grant the requested site access. Temporary extensions disappear when Firefox restarts.

Check these behaviors in Firefox 140 or newer before release:

- The background page starts without service-worker, `importScripts`, or unsupported `offscreen` errors.
- Plain text expands immediately in a normal input, textarea, and supported rich editor; pause and undo work.
- Popup/full-editor saves, drafts, folders, favorites, and usage statistics survive closing and reopening the UI.
- A triggered clipboard variable either inserts the clipboard text or reports an actionable permission error without deleting the trigger.
- Expansion sound works without requiring a remote resource.
- Backup export/import preserves the library and drafts; an empty backup remains empty.
- Revoking website access prevents expansion there; granting access and reloading restores it.

Use [docs/FIREFOX_RELEASE.md](../docs/FIREFOX_RELEASE.md) for packaging, signing, and submission. This document is a test procedure, not a claim that a particular Firefox run has passed.

## Optional Lexical regression

The real Lexical fixture has separate, test-only dependencies:

```sh
npm install --prefix tests/fixtures/lexical --ignore-scripts
node tests/browser/lexical-browser.cjs
```

`lexical-browser.cjs` also accepts a fixture directory as its third optional argument. The fixture and its dependencies are never part of the unpacked extension or release package.
