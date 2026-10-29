# Firefox desktop release

Snipio uses one shared source tree and creates separate Manifest V3 packages for Chrome/Edge and Firefox. Do not maintain a second manual copy of the project or edit generated files in `dist/`.

## Current release verification

On 29 October 2026, the publisher reported that the Firefox development version was working. This is a user-reported manual smoke check, not an automated native-Firefox test or a Mozilla validation/signing result. The exact Firefox version and operating system were not recorded. Version 1.4.2 keeps the same Firefox runtime and shared soft expansion sound, with an updated package version. See [release notes](RELEASE_1.4.2.md) for the verification scope and submission steps.

## Build

From the repository root, using Node.js 22 or newer:

```sh
node scripts/build.cjs firefox
node scripts/check-extension.cjs dist/firefox
npm test
```

The loadable extension is `dist/firefox/`. The upload archive for version 1.4.2 is `dist/snipio-firefox-1.4.2.zip`; later versions use the manifest version in the file name. The archive has `manifest.json` at its root. Keep the included GPL license, privacy policy, and asset/license notices with the release.

The Firefox manifest uses:

- `manifest_version: 3`.
- A non-persistent background event page rather than a service worker.
- Stable add-on ID `snipio@darkytherookie.github.io`. This is an extension identifier, not a contact email; keep it stable for updates.
- Minimum Firefox version 140.0; Android is not a tested release target.
- No `offscreen` permission. Local background-page media supports sound and triggered clipboard access.
- `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]`, because Snipio does not transmit data outside the add-on or local browser. Local processing remains disclosed in [PRIVACY.md](../PRIVACY.md).

Mozilla requires new add-ons to declare data-collection permissions. Its definition concerns handling outside the add-on or local browser; do not copy Chrome disclosure checkboxes into the Firefox manifest. See [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) and [Manifest V3 background compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).

## Install a temporary development copy

1. Use Firefox desktop 140 or newer and a disposable profile with synthetic test data.
2. Open `about:debugging` and select **This Firefox**.
3. Select **Load Temporary Add-on**, then `dist/firefox/manifest.json`.
4. Grant the requested website access, open an ordinary HTTP/HTTPS page, and refresh it before testing. Firefox's protected pages cannot run extension content scripts.
5. Test expansion, popup/full-editor saves, rich text, fill-in forms, conditions, clipboard, sound, statistics, and backup export/import. Follow [the Firefox test procedure](../tests/README.md#firefox-desktop-checks).
6. Rebuild after source changes, select **Reload** for the temporary extension, and refresh test pages.

Temporary installation is for development and is removed when Firefox restarts. Export a backup before removing or replacing any installation that holds data you want to keep. An unsigned ZIP is not a normal end-user installation.

## Submit to Mozilla Add-ons

1. Sign in to the [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/) and choose **Submit a New Add-on**.
2. Choose **On this site** to publish a public listing on addons.mozilla.org.
3. Upload `dist/snipio-firefox-1.4.2.zip`. Resolve validation errors and review warnings before continuing.
4. Select desktop platforms that were actually tested; do not claim Android support.
5. Answer source-code questions accurately. Snipio's package contains readable first-party code and uses no minification or transpilation; provide the repository/build instructions or `dist/snipio-firefox-source-1.4.2.zip` if Mozilla requests a source archive. The source archive is not an installable extension package.
6. Add the name, description, screenshots using fictional data, GPL-3.0-or-later license information, support link, and public privacy-policy URL. Confirm the privacy URL opens without signing in.
7. Explain that no account is needed and provide a simple test: create `.test` with replacement `Hello from Snipio`, then type it into an editable field on an ordinary HTTPS page.
8. Complete the submission and follow Mozilla's validation/signing/review status. Regular distribution requires Mozilla signing; do not advertise an unsigned temporary build as an approved store release.

See Mozilla's [submission instructions](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/). Do not assume that passing local tests guarantees store approval. Nothing in these instructions publishes or uploads a package automatically.
