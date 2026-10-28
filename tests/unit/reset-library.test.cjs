// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resetLibrary, RESET_KEY } = require(runtimeFile("reset-library.js"));
const core = require(runtimeFile("core.js"));
const library = require(runtimeFile("example-library.js"));
const demos = require(runtimeFile("examples.js"));
function storageFor(data) {
  return {
    async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(data[key])])); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(key) { delete data[key]; }
  };
}
test("reset restores templates while preserving personal snippets, statistics and unrelated drafts", async () => {
  const settings = library.ensureDemos(core.normalize()).settings;
  settings.shortcuts.find(item => item.exampleKey === "time").replacement = "Changed";
  settings.shortcuts = settings.shortcuts.filter(item => item.exampleKey !== "date");
  settings.shortcuts.push(core.normalize({ shortcuts: [{ id: "personal", trigger: ".mine", replacement: "Keep me" }] }).shortcuts[0]);
  const data = { quickPhrase: settings, rainStats: { entries: [{ id: "personal", count: 2 }] },
    snipioLibraryResetBackup: { values: { quickPhrase: "old library" } },
    snipioEditorDraft: { editingId: "personal", values: { replacement: "Draft" } } };
  const original = structuredClone(data);
  const result = await resetLibrary(storageFor(data));
  assert.equal(result.added, demos.length);
  assert.equal(data.quickPhrase.shortcuts.find(item => item.exampleKey === "time").replacement, "{time}");
  assert.equal(data.quickPhrase.shortcuts.find(item => item.exampleKey === "date").trigger, ".date");
  assert.deepEqual(data.quickPhrase.shortcuts.find(item => item.id === "personal"), original.quickPhrase.shortcuts.find(item => item.id === "personal"));
  assert.deepEqual(data.rainStats, original.rainStats);
  assert.equal(data.snipioLibraryResetBackup, undefined);
  assert.equal(data.snipioEditorDraft.libraryResetAt, data[RESET_KEY]);
  assert.deepEqual(data.snipioEditorDraft.values, original.snipioEditorDraft.values);
  assert.equal(require(runtimeFile("reset-library.js")).restoreLibrary, undefined);
});
test("starter shortcuts use dots and reset protects conflicting personal snippets", () => {
  for (const demo of demos) for (const trigger of demo.triggers) assert.match(trigger, /^\.[a-z]+$/);
  const settings = core.normalize({ snipioFoldersVersion: 1, shortcuts: [{ id: "mine", trigger: ".time", replacement: "My time" }] });
  const result = library.resetTemplates(settings);
  assert.equal(result.skipped.length, 1);
  assert.deepEqual(result.settings.shortcuts[0], settings.shortcuts[0]);
});
test("new folder migrates once, can be renamed or deleted, and stays deleted", () => {
  let settings = library.ensureDemos(core.normalize({ snipioDemosVersion: 1, shortcuts: [{ id: "mine", trigger: ".mine", replacement: "Mine" }] })).settings;
  const folder = settings.folders.find(item => item.name === "New folder");
  assert.equal(settings.shortcuts[0].folderId, folder.id);
  folder.name = "Personal";
  settings = library.ensureDemos(core.normalize(settings)).settings;
  assert.equal(settings.folders[0].name, "Personal");
  settings.folders = [];
  settings = library.ensureDemos(core.normalize(settings)).settings;
  assert.deepEqual(settings.folders, []);
  assert.equal(settings.shortcuts[0].folderId, null);
});
test("old aliases and clipboard examples are removed from already seeded libraries", () => {
  const settings = core.normalize({ snipioDemosVersion: 1, shortcuts: [
    { id: "old", trigger: "/xd", replacement: "Edited" },
    { id: "aliases", triggers: ["/xm", ".time"], replacement: "Keep dot alias" },
    { id: "clipboard", trigger: ".paste", replacement: "{clipboard}", exampleKey: "clipboard", isExample: true }
  ] });
  const result = library.ensureDemos(settings).settings;
  assert.deepEqual(result.shortcuts.map(item => item.trigger), [".time"]);
});
