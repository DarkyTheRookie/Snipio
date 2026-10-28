// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(function (root) {
  "use strict";
  const core = typeof module !== "undefined" && module.exports ? require("../lib/core.js") : root.QuickPhrase;
  const library = typeof module !== "undefined" && module.exports ? require("../lib/example-library.js") : root.ExampleLibrary;
  const DRAFT_KEYS = ["snipioEditorDraft", "snipioEditorDraftBackups", "snipioQuickDraft"];
  const RESET_KEY = "snipioLibraryResetAt";
  function resetLibrary(storage, makeId) {
    return core.withLibraryLock(async () => {
      const previous = await storage.get(["quickPhrase", ...DRAFT_KEYS, RESET_KEY]);
      const result = library.resetTemplates(core.normalize(previous.quickPhrase), makeId);
      const resetAt = Math.max(Date.now(), Number.isSafeInteger(previous[RESET_KEY]) ? previous[RESET_KEY] + 1 : 0);
      const retainedIds = new Set(result.settings.shortcuts.map(item => item.id));
      const keepDraft = draft => draft && (!draft.editingId || retainedIds.has(draft.editingId));
      const drafts = {};
      for (const key of DRAFT_KEYS) {
        const value = previous[key];
        if (Array.isArray(value)) drafts[key] = value.filter(keepDraft).map(draft => ({ ...draft, libraryResetAt: resetAt }));
        else drafts[key] = keepDraft(value) ? { ...value, libraryResetAt: resetAt } : null;
      }
      await storage.set({ quickPhrase: result.settings, ...drafts, [RESET_KEY]: resetAt });
      await storage.remove("snipioLibraryResetBackup");
      return result;
    });
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { resetLibrary, DRAFT_KEYS, RESET_KEY };
    return;
  }
  const resetButton = document.getElementById("reset-library");
  const status = document.getElementById("reset-status");
  const openButton = document.getElementById("open-snipio");
  resetButton.addEventListener("click", async () => {
    resetButton.disabled = true;
    status.textContent = "Resetting your templates…";
    try {
      const result = await resetLibrary(chrome.storage.local);
      resetButton.hidden = true;
      status.textContent = `Restored ${result.added} starter templates in Getting started. Your own snippets and usage history are kept.${result.skipped.length ? " Some templates were skipped to protect existing snippets: " + result.skipped.join("; ") : ""}`;
      openButton.hidden = false;
    } catch (_) {
      status.textContent = "The reset could not finish. Try again.";
      resetButton.disabled = false;
    }
  });
  openButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
})(globalThis);
