// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require(runtimeFile("core.js"));
const examples = require(runtimeFile("example-library.js"));
const backup = require(runtimeFile("backup-core.js"));

function fixture() {
  const quickPhrase = core.normalize({ enabled: false, snipioDemosVersion: 1, snipioFoldersVersion: 1,
    folders: [{ id: "work", name: "Work", favorite: true }], shortcuts: [
      { id: "greeting", name: "Привет ♥", triggers: [".hello", ".Hello"], replacement: "Hello, 世界!", folderId: "work", favorite: true, description: "Keep my note", tags: ["personal"] },
      { id: "rich", name: "Signature", trigger: ".sig", replacement: '<b>Kind regards</b><a href="https://example.com/">Website</a>', format: "html" }
    ] });
  const values = { name: "Unfinished", triggers: ".draft", replacement: "Dear {form:", format: "text", folderId: "work", tags: "personal", description: "A note", favorite: false };
  const draft = { editingId: "greeting", pendingSnippetId: "greeting", baselineValues: { ...values, replacement: "Before" }, values,
    token: "editor-token", libraryResetAt: 123, updatedAt: 1000 };
  return { quickPhrase, rainStats: { entries: [{ id: "greeting", count: 7, saved: 70 }, { id: "deleted", count: 3, saved: 30 }] },
    snipioEditorDraft: draft, snipioEditorDraftBackups: [{ ...structuredClone(draft), token: "backup-token" }],
    snipioQuickDraft: { ...structuredClone(draft), token: "popup-token" }, snipioLibraryResetAt: 123,
    unrelated: { private: "not part of Snipio" }, snipioLibraryResetBackup: { old: "not exported" } };
}
function storageFor(data, fail = false) {
  const writes = [];
  return { writes,
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(data[key])])); },
    async set(values) { if (fail) throw new Error("Storage quota exceeded"); writes.push(structuredClone(values)); Object.assign(data, structuredClone(values)); }
  };
}

test("full backup round trips Unicode, rich snippets, aliases, folders, metadata, drafts and deleted usage", async () => {
  const original = fixture(), originalCopy = structuredClone(original);
  const exported = await backup.exportBackup(storageFor(original));
  const parsed = backup.parseBackup(JSON.stringify(exported));
  assert.deepEqual(parsed, exported);
  assert.deepEqual(parsed.data.quickPhrase, original.quickPhrase);
  assert.deepEqual(parsed.data.rainStats, original.rainStats);
  assert.deepEqual(parsed.data.snipioEditorDraft, original.snipioEditorDraft);
  assert.deepEqual(parsed.data.snipioQuickDraft, original.snipioQuickDraft);
  assert.deepEqual(parsed.data.snipioEditorDraftBackups, original.snipioEditorDraftBackups);
  assert.deepEqual(Object.keys(parsed.data).sort(), [...backup.KEYS].sort());
  assert.equal(JSON.stringify(parsed).includes("not part of Snipio"), false);
  assert.equal(JSON.stringify(parsed).includes("not exported"), false);
  assert.deepEqual(original, originalCopy);
  assert.deepEqual(backup.summary(parsed.data), { snippets: 2, folders: 1, uses: 10, drafts: 3 });
});

test("import replaces the library in one write, rebases every draft, and preserves unrelated storage", async () => {
  const imported = backup.createBackup(fixture());
  const original = structuredClone(imported);
  const data = { ...fixture(), quickPhrase: core.normalize({ shortcuts: [{ id: "old", trigger: ".old", replacement: "Old" }] }), snipioLibraryResetAt: Date.now() + 1000 };
  const storage = storageFor(data), previousEpoch = data.snipioLibraryResetAt;
  imported.data.injectedKey = "must not be stored";
  await backup.restoreBackup(storage, imported);
  assert.equal(storage.writes.length, 1);
  assert.deepEqual(data.quickPhrase, original.data.quickPhrase);
  assert.deepEqual(data.rainStats, original.data.rainStats);
  assert.ok(data.snipioLibraryResetAt > previousEpoch);
  for (const draft of [data.snipioEditorDraft, data.snipioQuickDraft, ...data.snipioEditorDraftBackups]) {
    assert.equal(draft.libraryResetAt, data.snipioLibraryResetAt);
    assert.equal(draft.values.replacement, "Dear {form:");
    assert.equal(draft.baselineValues.replacement, "Before");
  }
  assert.deepEqual(data.unrelated, { private: "not part of Snipio" });
  assert.equal(data.injectedKey, undefined);
  assert.equal(imported.data.snipioLibraryResetAt, 123);
  assert.equal(imported.data.snipioEditorDraft.libraryResetAt, 123);
});

test("empty backup restores without resurrecting starter snippets or old drafts", async () => {
  const value = backup.createBackup({ quickPhrase: core.normalize({ shortcuts: [], folders: [] }) });
  const data = fixture();
  await backup.restoreBackup(storageFor(data), backup.parseBackup(JSON.stringify(value)));
  assert.deepEqual(data.quickPhrase.shortcuts, []);
  assert.deepEqual(data.quickPhrase.folders, []);
  assert.deepEqual(data.rainStats, { entries: [] });
  assert.equal(data.snipioEditorDraft, null);
  assert.equal(data.snipioQuickDraft, null);
  assert.deepEqual(data.snipioEditorDraftBackups, []);
  const reopened = examples.ensureDemos(data.quickPhrase).settings;
  assert.deepEqual(reopened.shortcuts, []);
  assert.deepEqual(reopened.folders, []);
});

test("backup format supports libraries larger than the old 100-snippet sharing limit", () => {
  const shortcuts = Array.from({ length: 150 }, (_, index) => ({ id: String(index), trigger: `.item${index};`, replacement: `Snippet ${index}` }));
  const value = backup.createBackup({ quickPhrase: core.normalize({ shortcuts }) });
  assert.equal(backup.parseBackup(JSON.stringify(value)).data.quickPhrase.shortcuts.length, 150);
});

test("invalid, truncated, unsupported and oversized files are rejected", () => {
  assert.throws(() => backup.parseBackup("{"), /valid JSON/);
  assert.throws(() => backup.parseBackup("null"), /Snipio JSON/);
  assert.throws(() => backup.parseBackup('{"format":"rain-snippets","version":1}'), /Snipio JSON/);
  const value = backup.createBackup(fixture()); value.version = 2;
  assert.throws(() => backup.parseBackup(JSON.stringify(value)), /version is not supported/);
  assert.throws(() => backup.parseBackup(" ".repeat(backup.MAX_BYTES + 1)), /20 MB/);
});

test("malformed schema cannot silently discard snippets or write storage", async () => {
  const mutations = [
    value => { delete value.data.quickPhrase; },
    value => { delete value.data.rainStats; },
    value => { value.data.quickPhrase.shortcuts = {}; },
    value => { value.data.quickPhrase.shortcuts.push(structuredClone(value.data.quickPhrase.shortcuts[0])); },
    value => { value.data.quickPhrase.shortcuts[1].triggers = [".hello"]; value.data.quickPhrase.shortcuts[1].trigger = ".hello"; },
    value => { value.data.quickPhrase.shortcuts[0].replacement = 123; },
    value => { value.data.quickPhrase.shortcuts[0].folderId = "missing"; },
    value => { value.data.quickPhrase.shortcuts[0].tags = ["x".repeat(51)]; },
    value => { value.data.quickPhrase.folders[0].name = " "; },
    value => { value.data.rainStats.entries[0].count = -1; },
    value => { value.data.rainStats.entries.push(structuredClone(value.data.rainStats.entries[0])); },
    value => { value.data.snipioEditorDraft.values.replacement = {}; },
    value => { value.data.snipioEditorDraftBackups = {}; },
    value => { value.data.snipioLibraryResetAt = "bad"; },
    value => { value.exportedAt = "not a date"; }
  ];
  for (const change of mutations) {
    const value = backup.createBackup(fixture()); change(value);
    const data = fixture(), before = structuredClone(data), storage = storageFor(data);
    assert.throws(() => backup.restoreBackup(storage, value), /invalid data/);
    assert.deepEqual(storage.writes, []);
    assert.deepEqual(data, before);
  }
});

test("storage failure leaves existing data intact and does not clear it first", async () => {
  const data = fixture(), before = structuredClone(data);
  const value = backup.createBackup({ quickPhrase: core.normalize({ shortcuts: [], folders: [] }) });
  await assert.rejects(backup.restoreBackup(storageFor(data, true), value), /quota/);
  assert.deepEqual(data, before);
});

test("export waits for an in-flight library mutation before taking its snapshot", async () => {
  const data = fixture();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const mutation = core.withLibraryLock(async () => { entered(); await gate; data.quickPhrase.shortcuts[0].replacement = "Latest saved text"; });
  await started;
  const exporting = backup.exportBackup(storageFor(data));
  release(); await mutation;
  assert.equal((await exporting).data.quickPhrase.shortcuts[0].replacement, "Latest saved text");
});
