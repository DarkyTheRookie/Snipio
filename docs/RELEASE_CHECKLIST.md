# Before publishing Snipio

Nothing has been published or pushed as part of this preparation.

- [ ] Read [RELEASE_AUDIT.md](RELEASE_AUDIT.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- [ ] Keep the Copyright (C) 2026 DarkyTheRookie notices and GPL-3.0-or-later license information with the project's source.
- [ ] Review the name and email Git will put in your first commit. Use a GitHub noreply email if you prefer.
- [ ] Review every staged file with `git diff --cached --stat` and `git diff --cached`.
- [ ] Confirm no `.env`, private key, real backup, personal snippet, local archive, or test output is staged.
- [ ] Run `npm test`, `npm run check`, and `npm run test:browser`.
- [ ] Export a backup before switching an existing unpacked installation to the new `extension/` folder.
- [ ] Load `extension/` in Chrome and Edge. Try expansion, pause, folders, forms, rich text, sound, and backup export/import.
- [ ] Keep `LICENSE` and the license notices with redistributed source. Package only `extension/` plus these notices for a browser release.
- [ ] Create the GitHub repository when you are ready; publish only a reviewed branch. Do not upload `.git` or push internal snapshot refs with `--mirror`.
- [ ] Enable GitHub's available secret-scanning/push-protection features and choose how to receive private security reports.
- [ ] After publication, check the rendered README, license detection, and the first CI run.

The GitHub Actions workflow runs local unit and package checks. It does not deploy, publish, upload backups, or require project secrets. Browser-store submission and any store-specific privacy forms are separate release steps.
