// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const backup = SnipioBackup;
  let selected = null, selectionRevision = 0, busy = false, currentRevision = 0;
  const describe = summary => `${summary.snippets.toLocaleString()} ${summary.snippets === 1 ? "snippet" : "snippets"} · ${summary.folders.toLocaleString()} ${summary.folders === 1 ? "folder" : "folders"} · ${summary.uses.toLocaleString()} uses · ${summary.drafts.toLocaleString()} drafts`;
  function error(message = "") { $("backup-error").textContent = message; $("backup-error").hidden = !message; }
  function setBusy(value) {
    busy = value; $("export-backup").disabled = value; $("backup-file").disabled = value;
    $("import-backup").disabled = value || !selected;
  }
  async function refreshCurrent() {
    const revision = ++currentRevision;
    try {
      const stored = await chrome.storage.local.get(backup.KEYS);
      if (revision === currentRevision) $("current-summary").textContent = describe(backup.summary(backup.createBackup(stored).data));
    } catch { if (revision === currentRevision) $("current-summary").textContent = "Could not read your library. Try exporting again."; }
  }
  $("export-backup").onclick = async () => {
    if (busy) return;
    setBusy(true); error(); $("backup-status").textContent = "Preparing backup…";
    try {
      const value = await backup.exportBackup(chrome.storage.local);
      const text = JSON.stringify(value, null, 2);
      if (new TextEncoder().encode(text).length > backup.MAX_BYTES) throw new Error("This backup is larger than the 20 MB file limit.");
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `snipio-backup-${value.exportedAt.replace(/[:.]/gu, "-")}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $("backup-status").textContent = "Backup downloaded. Keep the JSON file to restore your data after reinstalling.";
    } catch (cause) { $("backup-status").textContent = ""; error(cause.message || "Could not export your backup. Please try again."); }
    finally { setBusy(false); }
  };
  $("backup-file").onchange = async () => {
    const revision = ++selectionRevision;
    selected = null; $("import-backup").disabled = true; $("backup-preview").hidden = true;
    $("backup-status").textContent = ""; error();
    const file = $("backup-file").files[0];
    if (!file) return;
    try {
      if (file.size > backup.MAX_BYTES) throw new Error("Backup files must be 20 MB or smaller.");
      const value = backup.parseBackup(await file.text());
      if (revision !== selectionRevision) return;
      selected = value;
      $("backup-filename").textContent = file.name;
      $("import-summary").textContent = describe(backup.summary(value.data));
      $("backup-date").textContent = `Exported ${new Date(value.exportedAt).toLocaleString()}`;
      $("backup-preview").hidden = false; $("import-backup").disabled = busy;
    } catch (cause) { if (revision === selectionRevision) error(cause.message || "Could not read this backup. Choose another file."); }
  };
  $("import-backup").onclick = async () => {
    if (busy || !selected) return;
    const value = selected, summary = backup.summary(value.data);
    if (!confirm(`Import ${summary.snippets.toLocaleString()} snippets from this backup?\n\nThis replaces your current snippets, folders, favorites, settings, drafts, and usage history. Export a backup first if you want to keep your current data.`)) return;
    setBusy(true); error(); $("backup-status").textContent = "Importing backup…";
    try {
      await backup.restoreBackup(chrome.storage.local, value);
      selected = null; selectionRevision++; $("backup-file").value = ""; $("backup-preview").hidden = true;
      $("backup-status").textContent = "Backup imported. Reopen Snipio to continue with your restored library and drafts.";
      await refreshCurrent();
    } catch (cause) { $("backup-status").textContent = ""; error(cause.message || "Could not import this backup. Please try again."); }
    finally { setBusy(false); }
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && backup.KEYS.some(key => changes[key])) void refreshCurrent();
  });
  refreshCurrent().finally(() => { if (!busy) $("export-backup").disabled = false; });
})();
