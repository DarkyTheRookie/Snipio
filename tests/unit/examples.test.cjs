// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require(runtimeFile("core.js"));
const library = require(runtimeFile("example-library.js"));
const examples = require(runtimeFile("examples.js"));
let next = 0;
const id = () => `example-test-${++next}`;

test("the entire pack loads as ordinary editable snippets with descriptions", () => {
  const original = core.normalize({ shortcuts: [] });
  const result = library.load(original, examples, id);
  assert.equal(result.added, examples.length);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(original.shortcuts, []);
  const saved = core.normalize(result.settings);
  assert.equal(saved.folders.length, new Set(examples.map(item => item.folder)).size);
  for (const item of saved.shortcuts) {
    assert.ok(item.isExample && item.exampleKey && item.name && item.description);
    assert.ok(item.description.includes(item.trigger));
    assert.ok(item.tags.length);
    assert.equal(core.validateTemplate(item.replacement), "");
  }
});

test("loading skips names, exact triggers and immediate-mode prefix conflicts without changing existing data", () => {
  const original = core.normalize({ shortcuts: [
    { id: "own-a", name: examples[0].name.toUpperCase(), trigger: "/own", replacement: "My content" },
    { id: "own-b", trigger: ".greet", replacement: "My form" },
    { id: "own-c", trigger: ".formatted", replacement: "My longer shortcut" }
  ] });
  const before = JSON.stringify(original);
  const result = library.load(original, examples, id);
  assert.equal(result.added, examples.length - 3);
  assert.equal(result.skipped.length, 3);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(result.settings.shortcuts.slice(0, 3), original.shortcuts);
  const prefix = library.load(core.normalize({ shortcuts: [{ trigger: ".", replacement: "Keep me" }] }), examples, id);
  assert.equal(prefix.added, 0);
  assert.deepEqual(prefix.settings.shortcuts.map(item => item.trigger), ["."]);
});

test("reload preserves edits and removal only deletes labelled examples in any folder", () => {
  const settings = library.load(core.normalize(), examples, id).settings;
  const protectedItem = settings.shortcuts[1];
  protectedItem.name = "Mine now"; protectedItem.triggers = ["/mine"]; protectedItem.trigger = "/mine";
  protectedItem.replacement = "My edited content"; protectedItem.isExample = false;
  settings.shortcuts[2].folderId = null;
  settings.shortcuts.push({ id: "own", trigger: "/own", triggers: ["/own"], replacement: "Personal", folderId: settings.folders[0].id });
  const reloaded = library.load(core.normalize(settings), examples, id);
  assert.equal(reloaded.added, 0);
  const removed = library.remove(reloaded.settings);
  assert.deepEqual(removed.shortcuts.map(item => item.id), ["welcome", protectedItem.id, "own"]);
  assert.deepEqual(removed.folders, settings.folders);
  const restored = library.load(removed, examples, id);
  assert.equal(restored.added, examples.length - 1);
  assert.equal(restored.settings.shortcuts.find(item => item.id === protectedItem.id).replacement, "My edited content");
});

test("sharing preserves descriptions but does not mark imported snippets for example removal", () => {
  const settings = library.load(core.normalize(), examples, id).settings;
  const item = settings.shortcuts[1];
  const imported = core.decodeShare(core.encodeShare(settings, [item])).shortcuts[0];
  assert.equal(imported.description, item.description);
  assert.equal(imported.exampleKey, undefined);
  assert.equal(imported.isExample, undefined);
});

test("demo seeding runs once, preserves existing shortcuts, and never resurrects deletions", () => {
  const original = core.normalize({ shortcuts: [{ id: "mine", trigger: "/mine", replacement: "My shortcut", favorite: true }] });
  const before = JSON.stringify(original);
  const seeded = library.ensureDemos(original, examples, id);
  assert.equal(seeded.added, examples.length);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual({ ...seeded.settings.shortcuts[0], folderId: null }, original.shortcuts[0]);
  assert.equal(seeded.settings.snipioDemosVersion, 1);
  const saved = core.normalize(seeded.settings);
  saved.shortcuts = [saved.shortcuts[0]];
  assert.equal(library.ensureDemos(saved).added, 0);
  assert.deepEqual(library.ensureDemos(saved).settings.shortcuts, saved.shortcuts);
  saved.shortcuts = [];
  const empty = library.ensureDemos(core.normalize(saved));
  assert.equal(empty.added, 0);
  assert.deepEqual(empty.settings.shortcuts, []);
});

test("fresh installs have one hello and one distinct demo for each feature", () => {
  const seeded = library.ensureDemos(core.normalize(), examples, id);
  assert.equal(seeded.added, examples.length);
  assert.equal(seeded.settings.shortcuts.length, examples.length);
  assert.equal(seeded.settings.shortcuts.filter(item => item.replacement === "Hello, how are you?").length, 1);
  assert.equal(new Set(examples.map(item => item.key)).size, examples.length);
  assert.deepEqual(examples.filter(item => item.replacement.includes("{date}")).map(item => item.key), ["date"]);
  assert.deepEqual(examples.filter(item => item.replacement.includes("{time}")).map(item => item.key), ["time"]);
  assert.deepEqual(examples.filter(item => item.replacement.includes("{clipboard}")).map(item => item.key), []);
  assert.deepEqual(examples.filter(item => item.replacement.includes("{cursor}")).map(item => item.key), ["cursor"]);
  assert.equal(examples.some(item => /sharing|import|stats/iu.test(item.key)), false);
});

function legacyVariables(changes = {}) {
  return { id: "legacy-variables", trigger: "/xd", triggers: ["/xd"], exampleKey: "variables", isExample: true,
    name: "Date, time, clipboard and cursor", tags: ["variables", "clipboard"], format: "text", folderId: "old-demo-folder",
    description: "Copy some text, then type /xd; date, time and clipboard expand, with the caret between the brackets.",
    replacement: "Date: {date}\nTime: {time}\nClipboard: {clipboard}\nWrite here: [{cursor}]", ...changes };
}

test("upgrade replaces an untouched combined demo without duplicating its shortcuts", () => {
  const settings = core.normalize({ folders: [{ id: "old-demo-folder", name: "Examples" }], shortcuts: [legacyVariables()] });
  const before = JSON.stringify(settings);
  const upgraded = library.ensureDemos(settings, examples, id);
  assert.equal(JSON.stringify(settings), before);
  assert.equal(upgraded.settings.shortcuts.some(item => item.id === "legacy-variables"), false);
  assert.equal(upgraded.settings.shortcuts.filter(item => item.trigger === ".date").length, 1);
  assert.equal(upgraded.settings.shortcuts.find(item => item.trigger === ".date").replacement, "{date}");
  assert.equal(upgraded.settings.shortcuts.some(item => item.trigger.startsWith("/x")), false);
});

test("upgrade removes obsolete shortcuts even when their examples were edited", () => {
  for (const edit of [{ replacement: "My text" }, { name: "My name" }, { favorite: true },
    { description: "My instructions" }, { tags: ["mine"] }, { isExample: false }, { folderId: null }]) {
    const item = legacyVariables(edit);
    const settings = core.normalize({ folders: [{ id: "old-demo-folder", name: "Examples" }], shortcuts: [item] });
    const upgraded = library.ensureDemos(settings, examples, id).settings;
    assert.equal(upgraded.shortcuts.some(item => item.id === "legacy-variables"), false);
    assert.equal(upgraded.shortcuts.filter(shortcut => shortcut.trigger === "/xd").length, 0);
  }
});
