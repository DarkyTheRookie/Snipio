# Tests

The extension has no runtime dependencies. Test tools stay outside `extension/` and are not shipped with it.

## Unit tests

Run from the repository root with Node.js 22 or newer:

```sh
npm test
```

These tests cover expansion rules, templates, migration, concurrent storage operations, usage statistics, and backup validation/restore. They use synthetic data and do not read the installed extension's data.

## Browser tests

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

Tests use isolated mock storage or disposable browser profiles, rather than your normal browser profile. The mock storage in some UI fixtures uses `localStorage`; the shipped extension uses `chrome.storage.local`.

Useful groups:

- Popup and editor: `browser-check.cjs`, `editor-browser.cjs`, `editor-navigation.cjs`, `organization-browser.cjs`, `name-validation-browser.cjs`.
- Persistence: `autosave-browser.cjs`, `backup-browser.cjs`, `reset-library-browser.cjs`.
- Templates and rich editors: `blocks-browser.cjs`, `constructor-browser.cjs`, `examples-browser.cjs`, `features-browser.cjs`, `rich-editors.cjs`.
- Real extension behavior: `live-extension.cjs`, `advanced-extension.cjs`, `sound-browser.cjs`. The advanced check reads clipboard availability without logging its contents. Local HTTP fixtures bind only to `127.0.0.1`.

Generated screenshots go into ignored `artifacts/`. `helpers.cjs` resolves extension files independently of the current working directory and creates artifact directories when needed.

## Optional Lexical regression

The real Lexical fixture has separate, test-only dependencies:

```sh
npm install --prefix tests/fixtures/lexical --ignore-scripts
node tests/browser/lexical-browser.cjs
```

`lexical-browser.cjs` also accepts a fixture directory as its third optional argument. The fixture and its dependencies are never part of the unpacked extension or release package.
