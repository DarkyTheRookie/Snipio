# Snipio Privacy Policy

Last updated: 28 October 2026

This policy describes the Snipio browser extension, currently version 1.4.1, maintained by DarkyTheRookie. Snipio expands text shortcuts into snippets and provides local tools for editing, organizing, and backing up your library.

## Data processed on your device

Snipio processes the following information to provide its features:

- Snippet text, rich-text formatting, names, triggers, descriptions, tags, folders, and favorites.
- Extension settings, editor drafts, and saved draft backups.
- Local usage statistics, including snippet identifiers, expansion counts, and estimated characters saved.
- Text in editable website fields, as needed to recognize a shortcut and insert its replacement.
- Values you enter into snippet fill-in forms and clipboard text when a triggered snippet uses the clipboard variable.

Your library, settings, drafts, and usage statistics are stored in the browser's local extension storage (`chrome.storage.local`). Snipio does not use browser storage sync or provide a cloud account or cloud synchronization service.

## How data is used and shared

Snipio uses this information only to provide its text-expansion, editing, organization, statistics, and backup features. The extension does not send your snippets, settings, drafts, clipboard contents, website text, or usage statistics to the developer or to an analytics service. It contains no advertising, analytics, tracking, or automatic upload functionality and does not record a browsing-history log.

The developer does not sell your extension data, use it for advertising, or use it to determine creditworthiness or lending eligibility. Data accessed through browser permissions is used only for the extension's stated features, consistent with the Chrome Web Store User Data Policy, including its Limited Use requirements.

When you expand a snippet into a website, that website can read the inserted text and may save or transmit it under its own privacy practices. This also applies to clipboard text and fill-in values included in the expansion. Links that you choose to open from snippets can take you to external websites.

## Clipboard and website permissions

Snipio reads clipboard text when an expansion uses the `{clipboard}` variable. It does not continuously monitor the clipboard or maintain a separate clipboard history. Clipboard text is processed locally to construct the expansion.

Access to HTTP and HTTPS pages allows text expansion in editable fields, including supported embedded editors. Snipio can query open HTTP/HTTPS tabs to attach its local content scripts after installation, updates, or settings changes. It does not send the tab information to the developer. You can manage the extension's site access and permissions in your browser; restricting access may prevent expansion on those sites.

The `storage` permission supports local data storage. The `scripting` permission attaches the local expansion scripts to open pages. The `offscreen` permission supports local sound playback and the clipboard feature. The `clipboardRead` permission supports the triggered clipboard variable. All executable extension scripts are included in the extension package.

## Backups and security

Backup export happens when you select the export action. It downloads a JSON file containing your library, settings, drafts, and usage history. Import reads a file you select and, after confirmation, replaces the corresponding local extension data. Snipio does not upload these files.

Exported backups are readable and are not encrypted by Snipio. Snipio also does not add its own encryption layer to browser-managed local storage. Protect your device and backup files, and share backups only when you intend to disclose their contents. If you place a backup in a cloud-synchronized folder, the synchronization is performed by that service, not by Snipio.

## Retention and deletion

Local extension data remains in your browser until you change or remove it or uninstall the extension. You can edit or delete snippets and folders and reset usage statistics using Snipio's interface. Deleting a snippet does not necessarily erase related usage entries or saved drafts. Uninstalling Snipio removes its browser-managed local extension storage.

Exported backup files are separate from extension storage. Uninstalling Snipio does not delete those files; delete them yourself if you no longer want to retain them. Browser, operating-system, or device backups are managed separately by those systems. The developer cannot remotely retrieve or delete your local Snipio data.

## External services and support

The optional support link opens [Ko-fi](https://ko-fi.com/snipiosupport) only when you select it. GitHub hosts the project, this policy, and issue discussions. These services handle visits, messages, and any donations under their own privacy policies. Snipio does not automatically attach your library, drafts, clipboard contents, or usage statistics to these visits.

If you voluntarily send information to the developer through a support message or GitHub issue, that information is used to respond to the request or investigate the reported problem. Public GitHub issues are visible to others. Do not post private snippets, clipboard contents, backups, passwords, or other sensitive information in an issue.

## Changes and contact

This policy will be updated when Snipio's data practices change. The revision date appears at the top. New data practices must also be disclosed through the extension and store listing where required; this policy does not authorize undisclosed future collection.

For questions about this policy, contact DarkyTheRookie through the [Snipio GitHub issue tracker](https://github.com/DarkyTheRookie/Snipio/issues).
