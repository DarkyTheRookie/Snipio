# Before publishing Snipio

This checklist does not publish or upload anything. Record the scope of each check and do not treat a user-reported smoke test as an automated store validation.

Current release: **1.4.2**. Use [RELEASE_1.4.2.md](RELEASE_1.4.2.md) for release notes, package names, and the publisher's Firefox smoke-check record.

- [ ] Read [RELEASE_AUDIT.md](RELEASE_AUDIT.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- [ ] Keep the Copyright (C) 2026 DarkyTheRookie notices and GPL-3.0-or-later license information with the project's source.
- [ ] Review the public name and email Git will put in release commits. Use a GitHub noreply email if you prefer.
- [ ] Review every staged file with `git diff --cached --stat` and `git diff --cached`.
- [ ] Confirm no `.env`, private key, real backup, personal snippet, local archive, or test output is staged.
- [ ] Run `npm test`, `npm run check`, and `npm run test:browser`.
- [ ] Build both targets with `node scripts/build.cjs` and check each generated folder with `node scripts/check-extension.cjs dist/chrome-edge` and `node scripts/check-extension.cjs dist/firefox`.
- [ ] Export a backup before switching an existing unpacked installation to the new `extension/` folder.
- [ ] Load `extension/` or `dist/chrome-edge/` in Chrome and Edge. Try expansion, pause, folders, forms, rich text, sound, and backup export/import.
- [ ] Load `dist/firefox/manifest.json` through Firefox's `about:debugging`. Complete the Firefox checks in [tests/README.md](../tests/README.md) and record any skipped checks.
- [ ] Confirm the new soft expansion sound is present in both generated packages; reload local installations before comparing playback.
- [ ] Review [FIREFOX_RELEASE.md](FIREFOX_RELEASE.md), the stable Firefox add-on ID, minimum version, and data-collection declaration before submitting to Mozilla.
- [ ] Keep `LICENSE`, `PRIVACY.md`, and license notices with redistributed packages. Use the generated browser-specific ZIPs; exclude local archives, dependencies, tests, screenshots, and credentials.
- [ ] Confirm the intended GitHub remote and publish only reviewed source changes. Do not upload `.git` or push internal snapshot refs with `--mirror`.
- [ ] Publish the updated privacy policy and confirm its public URL opens without signing in before store submission.
- [ ] Enable GitHub's available secret-scanning/push-protection features and choose how to receive private security reports.
- [ ] After publication, check the rendered README, license detection, and the first CI run.

The GitHub Actions workflow runs local unit and package checks. It does not deploy, publish, upload backups, or require project secrets. Browser-store submission and any store-specific privacy forms are separate release steps.
