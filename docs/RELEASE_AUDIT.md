# Open-source release audit

Audit date: **26 October 2026**. Nothing was published, pushed, or committed during this audit. No Git remote was configured when inspected.

## Scope and result

The audit covered the working source, staged files, ignored verification artifacts, local Git references, and all Git objects present at inspection. It searched for credentials, API keys, access tokens, private keys, credential-bearing URLs, environment files, personal email addresses, names in fixtures, and machine-specific paths.

**No credentials, API keys, private keys, credential-bearing URLs, `.env` files, or personal email addresses were found in the inspected source, index, or Git objects.** Literal `token` values found in tests were synthetic draft identifiers, not authentication credentials. The public Ko-fi support URL is intentional.

An additional credential-signature pass covered **548 working files**, including the ignored Lexical dependency cache: 502 text files and 46 binary files. No credential signatures were found in the text files; binaries were counted separately. Vendored dependency code was not reviewed as application code. Generated screenshots are not approved release content and should remain in the ignored local archive. PNG textual-metadata inspection found no metadata chunks in the inspected PNG files.

## Git history and index

At the initial inspection, the repository contained:

- An unborn `master` branch and **zero commit objects**. There was no normal commit history or reflog history to review.
- **407 loose objects:** 328 blobs and 79 trees. All 328 blobs were examined: 295 were text and 33 were binary.
- Six `refs/codex/turn-diffs/*` references pointing to tree snapshots. These were inspected in addition to the current index.
- 187 unreachable blobs and 58 unreachable trees, included in the object scan.
- A populated index containing older versions of source files and assets. Cleaning the working tree does not automatically replace those staged versions.

The initial audit was read-only. It did not delete references, prune objects, rewrite history, change Git configuration, or alter the index. No credential-related history rewrite is required by the findings above.

As a later release-preparation step, the cleaned working tree was staged with `git add -A`. This refreshed the index so it contains the reorganized release files instead of the old root-level sources and assets. It did not create a commit or configure a remote.

A final read-only scan of the refreshed index covered **74 staged files: 69 text files and 5 binary files**. It found no credential signatures, personal email addresses, local user paths, or the original developer-name fixture. No ignored files, local archives, real backup files, environment files, private keys, old MP3 recording, or obsolete planning document were staged. `git diff --cached --check` passed. There were still zero commit objects and no configured remotes.

Publish only a reviewed branch after its first commit. Do not upload the `.git` directory or use a mirror push: local Codex references and unreachable objects are not release content.

## Original findings and remediation

Paths in the first column refer to the repository before release restructuring. They are recorded to explain what was found, not to recommend publishing those files.

| Original finding | Release remediation |
| --- | --- |
| The developer's first name appeared in a sample signature in the old `tests/browser-check.cjs`. It also existed in indexed blob `a937ad4…`, lines 65 and 69, and snapshot blob `6d14266…`, lines 60 and 64. | The maintained fixture now uses the fictional name **Alex** in `tests/browser/browser-check.cjs`. The refreshed index no longer contains the old fixture. Historical local objects were not rewritten or published. |
| Five scripts under ignored `artifacts/` contained absolute local user paths: `first-install-preview.cjs`, `preview-ui.cjs`, `review-blue.cjs`, `review-light.cjs`, and `verify-usage.cjs`. | Temporary verification scripts and screenshots are excluded from the staged release. The local archive is ignored under `.local/archive/`; portable tests are maintained under `tests/unit/` and `tests/browser/`. Do not publish local archives. |
| `artifacts/` included generated screenshots and a vendored Lexical fixture with `node_modules`. | Generated artifacts, browser profiles, dependency installations, and local caches are absent from the staged release. Only reproducible fixture source and dependency declarations are retained. |
| `TEAM_LIBRARIES.md` contained obsolete internal backend planning, including provider and pricing discussion. No backend credentials or active service configuration were found. | The document is excluded from the staged release and kept in the ignored local archive. Public documentation describes the implemented local-only product. |
| `sounds/ps2-sound.mp3` had no established redistribution provenance in the repository. | The original recording is absent from the staged release. It was replaced with the original generated `extension/assets/sounds/expansion.wav`; its reproducible generator and asset notices are included. |
| Global Git author name and email were configured; the configured email was not a GitHub noreply address. No author identity was committed because there were no commits. | Before the first public commit, choose the author name and email that may be public. A GitHub-provided noreply address is an option. No identity or configuration was changed by this audit. |
| Local tool metadata existed under `.git/`, including Codex snapshot references and editor metadata. | Keep `.git/` private. Publish the reviewed source through an ordinary branch push, not a folder upload containing repository metadata. |

`LICENSE` retains the canonical, unmodified GNU General Public License v3.0 text. The project's Copyright (C) 2026 DarkyTheRookie notice appears in the README and source headers. That copyright name and the Ko-fi project URL are intended public release information, separate from personal fixture data and local machine paths.

## Release validation

- **60 unit tests passed**, including backup export/import, storage coordination, expansion, and template reset cases.
- **17 browser-check scripts passed** during release preparation, covering the popup, editor, backup files, live extension behavior, sound, and rich-editor fixtures.
- The extension package check passed: **15 JavaScript files and 6 HTML pages**, with JavaScript syntax checks and all manifest/page resource paths resolving inside `extension/`.
- The refreshed index passed the credential, personal-data, ignored-file, release-file-name, and whitespace checks described above.

## Checks before the first public commit

- [x] Reorganize the maintained source and tests and exclude temporary files from the staged release.
- [x] Refresh the index with the intended restructured files. `.gitignore` alone would not have removed old staged paths.
- [x] Check `git diff --cached --name-status` and `git diff --cached --check` after staging the release files.
- [x] Confirm `.local/`, generated backups, environment files, browser profiles, dependency folders, and packaged build outputs are absent from the staged file list.
- [ ] Personally review every finalized staged change before making the first public commit.
- [ ] Verify the selected public Git author name/email before committing.
- [x] Confirm the original unlicensed sound is absent from the index and review the replacement asset and third-party license notices.
- [x] Run the unit, browser, and package checks described above.
- [ ] Repeat the credential and personal-data scan if any additional files or commits are added after this audit.
- [ ] Publish only the approved branch after a final staged-content review. This audit did not authorize or perform publication.

This report records the initial audit, the later cleanup and index refresh, and the final staged-content review. The Git object counts describe the initial audit snapshot; local development tooling may create additional snapshots afterward. Nothing has been published, pushed, or committed during this preparation.
