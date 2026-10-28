// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(function (root) {
  "use strict";
  const core = typeof module !== "undefined" && module.exports ? require("./core.js") : root.QuickPhrase;
  const MAX_BYTES = 20 * 1024 * 1024;
  const KEYS = ["quickPhrase", "rainStats", "snipioEditorDraft", "snipioEditorDraftBackups", "snipioQuickDraft", "snipioLibraryResetAt"];
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const string = (value, max = MAX_BYTES) => typeof value === "string" && value.length <= max;
  function check(condition, message) {
    if (!condition) throw new Error(message || "This backup contains invalid data. Your current data has not been changed.");
  }
  function uniqueId(value, seen) {
    check(string(value) && value.length > 0 && !seen.has(value));
    seen.add(value);
  }
  function settings(value) {
    check(object(value) && typeof value.enabled === "boolean" && value.mode === "immediate" && Array.isArray(value.shortcuts) && Array.isArray(value.folders));
    const folders = new Set(), ids = new Set(), triggers = new Set();
    for (const folder of value.folders) {
      check(object(folder)); uniqueId(folder.id, folders);
      check(string(folder.name, 100) && folder.name.trim().length > 0 && folder.name === folder.name.trim());
      check(folder.favorite === undefined || typeof folder.favorite === "boolean");
    }
    for (const item of value.shortcuts) {
      check(object(item)); uniqueId(item.id, ids);
      check(string(item.replacement) && item.replacement.length > 0 && string(item.name, 100) && typeof item.favorite === "boolean");
      check(item.format === "text" || item.format === "html");
      check(item.folderId === null || folders.has(item.folderId));
      check(item.description === undefined || string(item.description, 500));
      check(Array.isArray(item.tags) && item.tags.length <= 30 && item.tags.every(tag => string(tag, 50) && tag.trim() === tag && tag.length > 0) && new Set(item.tags).size === item.tags.length);
      check(Array.isArray(item.triggers) && item.triggers.length > 0 && item.trigger === item.triggers[0]);
      for (const trigger of item.triggers) {
        check(string(trigger) && !/\s/u.test(trigger)); uniqueId(trigger, triggers);
      }
      check(item.exampleKey === undefined || string(item.exampleKey));
      check(item.isExample === undefined || typeof item.isExample === "boolean");
    }
    // A restored empty library must stay empty when the editor next opens.
    return core.normalize({ ...value, snipioDemosVersion: Math.max(1, Number.isSafeInteger(value.snipioDemosVersion) ? value.snipioDemosVersion : 1), snipioFoldersVersion: 1 });
  }
  function stats(value) {
    check(object(value) && Array.isArray(value.entries));
    const ids = new Set();
    for (const entry of value.entries) {
      check(object(entry)); uniqueId(entry.id, ids);
      check(integer(entry.count) && integer(entry.saved));
    }
    return core.normalizeStats(value);
  }
  function draftValues(value) {
    check(object(value) && string(value.triggers) && string(value.replacement));
    for (const key of ["name", "description", "tags"]) check(value[key] === undefined || string(value[key]));
    check(value.format === undefined || value.format === "text" || value.format === "html");
    check(value.folderId === undefined || value.folderId === null || string(value.folderId));
    check(value.favorite === undefined || typeof value.favorite === "boolean");
    return Object.fromEntries(["name", "description", "triggers", "replacement", "format", "folderId", "tags", "favorite"].filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  }
  function draft(value) {
    if (value === null) return null;
    check(object(value) && string(value.token) && value.token.length > 0 && integer(value.updatedAt));
    for (const key of ["editingId", "pendingSnippetId"]) check(value[key] === undefined || value[key] === null || string(value[key]));
    check(value.libraryResetAt === undefined || value.libraryResetAt === null || integer(value.libraryResetAt));
    return {
      editingId: value.editingId ?? null, pendingSnippetId: value.pendingSnippetId ?? null,
      baselineValues: value.baselineValues == null ? null : draftValues(value.baselineValues),
      libraryResetAt: value.libraryResetAt ?? null, values: draftValues(value.values),
      token: value.token, updatedAt: value.updatedAt
    };
  }
  function validateBackup(value) {
    check(object(value) && value.format === "snipio-backup", "Choose a Snipio JSON backup file.");
    check(value.version === 1, "This backup version is not supported. Update Snipio and try again.");
    check(string(value.exportedAt, 100) && Number.isFinite(Date.parse(value.exportedAt)) && object(value.data));
    const data = value.data;
    check(Array.isArray(data.snipioEditorDraftBackups));
    check(data.snipioLibraryResetAt === null || integer(data.snipioLibraryResetAt));
    return { format: "snipio-backup", version: 1, exportedAt: value.exportedAt, data: {
      quickPhrase: settings(data.quickPhrase), rainStats: stats(data.rainStats),
      snipioEditorDraft: draft(data.snipioEditorDraft),
      snipioEditorDraftBackups: data.snipioEditorDraftBackups.map(draft).filter(Boolean),
      snipioQuickDraft: draft(data.snipioQuickDraft), snipioLibraryResetAt: data.snipioLibraryResetAt
    } };
  }
  function createBackup(stored, now = new Date()) {
    return validateBackup({ format: "snipio-backup", version: 1, exportedAt: now.toISOString(), data: {
      quickPhrase: core.normalize(stored.quickPhrase ?? { shortcuts: [], folders: [] }),
      rainStats: core.normalizeStats(stored.rainStats),
      snipioEditorDraft: stored.snipioEditorDraft ?? null,
      snipioEditorDraftBackups: stored.snipioEditorDraftBackups ?? [],
      snipioQuickDraft: stored.snipioQuickDraft ?? null,
      snipioLibraryResetAt: stored.snipioLibraryResetAt ?? null
    } });
  }
  function parseBackup(text) {
    check(typeof text === "string" && new TextEncoder().encode(text).length <= MAX_BYTES, "Backup files must be 20 MB or smaller.");
    let value;
    try { value = JSON.parse(text); }
    catch { throw new Error("This file is not valid JSON. Choose a Snipio backup file."); }
    return validateBackup(value);
  }
  function exportBackup(storage) {
    return core.withLibraryLock(async () => createBackup(await storage.get(KEYS)));
  }
  function restoreBackup(storage, value) {
    const backup = validateBackup(value);
    return core.withLibraryLock(async () => {
      const previous = await storage.get("snipioLibraryResetAt");
      const previousEpoch = previous.snipioLibraryResetAt;
      const epoch = Math.max(Date.now(), integer(previousEpoch) && previousEpoch < Number.MAX_SAFE_INTEGER ? previousEpoch + 1 : 0);
      const rebase = value => value ? { ...value, libraryResetAt: epoch } : null;
      // One write replaces only Snipio's keys. The new epoch invalidates pending
      // autosaves in open editors so they cannot overwrite the imported library.
      await storage.set({ ...backup.data, snipioLibraryResetAt: epoch,
        snipioEditorDraft: rebase(backup.data.snipioEditorDraft),
        snipioQuickDraft: rebase(backup.data.snipioQuickDraft),
        snipioEditorDraftBackups: backup.data.snipioEditorDraftBackups.map(rebase)
      });
      return backup;
    });
  }
  function summary(data) {
    return { snippets: data.quickPhrase.shortcuts.length, folders: data.quickPhrase.folders.length,
      uses: data.rainStats.entries.reduce((total, entry) => total + entry.count, 0),
      drafts: data.snipioEditorDraftBackups.length + Number(!!data.snipioEditorDraft) + Number(!!data.snipioQuickDraft) };
  }
  const api = { MAX_BYTES, KEYS, createBackup, parseBackup, validateBackup, exportBackup, restoreBackup, summary };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SnipioBackup = api;
})(globalThis);
