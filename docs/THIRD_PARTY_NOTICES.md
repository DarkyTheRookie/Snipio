# Assets and third-party notices

Reviewed on 26 October 2026. This records the packages and assets inspected for this release; it is not a legal certification of every possible future dependency.

## Extension assets

The extension ships no third-party JavaScript packages, bundled font files, or remote fonts. Its original code and non-branding assets are covered by the repository's [GPL-3.0-or-later license](../LICENSE), Copyright (C) 2026 DarkyTheRookie. The project name and logo are not covered by this license.

The Chrome/Edge and Firefox packages are generated from shared first-party source. Browser-specific manifests and compatibility code add no third-party runtime dependency or remotely hosted executable code. The build scripts use Node.js built-in modules; Node.js itself and development/browser tools are not bundled in either extension package.

| Item | Source and license |
| --- | --- |
| Snipio logo and toolbar icons displaying the logo | Original project branding. The project name and logo are not covered by the GPL license. |
| Interface icons | Original project assets included under the project's GPL-3.0-or-later license. |
| Expansion sound, `extension/assets/sounds/expansion.wav` | Original soft four-voice chord produced mathematically by [scripts/generate-sound.cjs](../scripts/generate-sound.cjs), with no recorded samples. The generator and generated sound are included under the project's GPL-3.0-or-later license. |
| Font names in CSS | Fonts such as Segoe UI, Arial, Consolas, Cascadia Code, and Inter are requested only when already installed on the user's device. No font software is copied into the extension. |

The earlier `ps2-sound.mp3` had no documented source or redistribution license. It has been replaced and is excluded from the public project. Do not add it back without establishing redistribution rights.

Microsoft permits naming Windows fonts in a CSS font stack, while redistribution of the font files requires separate rights. See its [font redistribution FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq#web). If Inter font files are added later, they must retain their own [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt); the project's GPL-3.0-or-later license does not replace it.

## Development and test packages

These packages are used by development tools or optional test fixtures. They are not shipped in the extension directory or release package.

| Package | Audited version | License | Upstream source |
| --- | --- | --- | --- |
| `playwright`, `playwright-core` | 1.62.1 | Apache-2.0 | [License](https://github.com/microsoft/playwright/blob/v1.62.1/LICENSE), [NOTICE](https://github.com/microsoft/playwright/blob/v1.62.1/NOTICE) |
| `fsevents` (Playwright's optional macOS dependency) | 2.3.2 | MIT | [License](https://github.com/fsevents/fsevents/blob/v2.3.2/LICENSE), [package metadata](https://github.com/fsevents/fsevents/blob/v2.3.2/package.json) |
| `lexical` | 0.22.0 | MIT | [Lexical repository](https://github.com/facebook/lexical), [license](https://github.com/facebook/lexical/blob/v0.22.0/LICENSE) |
| `@lexical/plain-text`, `@lexical/clipboard`, `@lexical/html`, `@lexical/list`, `@lexical/selection`, `@lexical/table`, `@lexical/utils` | 0.22.0 | MIT | [Lexical repository](https://github.com/facebook/lexical), [license](https://github.com/facebook/lexical/blob/v0.22.0/LICENSE) |
| `esbuild`, its `@esbuild/*` platform packages | 0.25.12 | MIT | [esbuild license](https://github.com/evanw/esbuild/blob/v0.25.12/LICENSE.md) |

The installed Lexical 0.22.0 packages' `package.json` and `LICENSE` files were checked directly. All eight listed Lexical packages include the same MIT license, copyright Meta Platforms, Inc. and affiliates. esbuild 0.25.12 includes the MIT license, copyright (c) 2020 Evan Wallace; its installed Windows binary package also declares MIT. Other esbuild platform packages belong to the same pinned upstream release and are selected by the package manager for the developer's platform.

The installed Playwright 1.62.1 license and notice were checked directly. Its notice credits Microsoft Corporation and identifies code derived from Puppeteer under Apache-2.0. Browser executables downloaded or selected for tests have their own licenses and are not part of this repository's extension release.

Playwright declares `fsevents` 2.3.2 as an optional dependency for macOS. Its exact upstream release metadata and MIT license were checked; the copyright notice names Philipp Dunkel, Ben Noordhuis, Elan Shankar, and Paul Miller (2010-2020). It is not installed on the audited Windows platform and is not shipped with the extension.

These permissive development licenses do not require changing Snipio's original code to a different license. Third-party packages keep their own licenses.

The CI workflow references GitHub's hosted [`actions/checkout`](https://github.com/actions/checkout/blob/main/LICENSE) and [`actions/setup-node`](https://github.com/actions/setup-node/blob/main/LICENSE), both MIT-licensed. Their code is not vendored or shipped in the extension.

## Notice requirements

- Keep the project's GPL-3.0-or-later license and Copyright (C) 2026 DarkyTheRookie notice with copies of Snipio.
- Keep `node_modules`, downloaded browsers, generated test bundles, and test reports out of the extension release.
- If third-party code or binary packages are ever vendored or redistributed, retain their complete copyright, license, and applicable NOTICE files. A link in this document alone is not a substitute for those files in a redistributed package.
- Keep Playwright and Puppeteer notices with any redistributed Playwright code. Do not relabel Apache-2.0 code as MIT.
- Check licenses again when dependencies or assets change, including transitive packages and any newly bundled fonts, audio, or icons.
