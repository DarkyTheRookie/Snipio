// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(function (root) {
  "use strict";
  const DEMOS_VERSION = 1;
  const builtins = typeof module !== "undefined" && module.exports ? require("./examples.js") : root.RainExamples;
  function randomId() {
    return root.crypto?.randomUUID?.() || `snipio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function load(settings, examples, makeId) {
    const shortcuts = [...settings.shortcuts];
    const folders = [...settings.folders];
    const skipped = [];
    let added = 0;
    for (const example of examples) {
      const reason = shortcuts.some(item => item.exampleKey === example.key) ? "already loaded"
        : shortcuts.some(item => item.name?.toLocaleLowerCase() === example.name.toLocaleLowerCase()) ? "name already exists"
        : shortcuts.some(item => item.triggers.some(trigger => example.triggers.some(alias => alias.startsWith(trigger) || trigger.startsWith(alias)))) ? "trigger conflicts with an existing snippet"
        : null;
      if (reason) { skipped.push(`${example.name}: ${reason}`); continue; }
      let folder = folders.find(item => item.name === example.folder);
      if (!folder) { folder = { id: makeId(), name: example.folder }; folders.push(folder); }
      shortcuts.push({ id: makeId(), trigger: example.triggers[0], triggers: [...example.triggers],
        name: example.name, description: example.description, tags: [...example.tags],
        replacement: example.replacement, format: example.format || "text", folderId: folder.id,
        favorite: false, exampleKey: example.key, isExample: true });
      added++;
    }
    return { settings: { ...settings, shortcuts, folders }, added, skipped };
  }
  function remove(settings) {
    // Labels are explicit membership: clearing one protects that customized
    // snippet from bulk removal. Never delete folders or unrelated content.
    return { ...settings, shortcuts: settings.shortcuts.filter(item => item.isExample !== true) };
  }
  function ensureDemos(settings, examples = builtins, makeId = randomId) {
    settings = migrateFolders(withoutRetiredTemplates(settings), makeId);
    if (settings.snipioDemosVersion >= DEMOS_VERSION) return { settings, added: 0, skipped: [] };
    const result = load(settings, examples, makeId);
    result.settings.snipioDemosVersion = DEMOS_VERSION;
    return result;
  }
  function resetTemplates(settings, makeId = randomId) {
    settings = migrateFolders(withoutRetiredTemplates(settings), makeId);
    const keys = new Set(builtins.map(example => example.key));
    const shortcuts = settings.shortcuts.filter(item => !(item.isExample === true && keys.has(item.exampleKey)));
    const result = load({ ...settings, shortcuts }, builtins, makeId);
    result.settings.snipioDemosVersion = DEMOS_VERSION;
    return result;
  }
  function withoutRetiredTemplates(settings) {
    const shortcuts = settings.shortcuts.flatMap(item => {
      if (item.id === "welcome" && item.trigger === "hi" && item.replacement === "Hello, how are you?" && !item.name && !item.favorite && !item.folderId) return [];
      if (item.isExample && item.exampleKey === "clipboard") return [];
      const triggers = item.triggers.filter(trigger => !/^\/x[dmbcfrtaunswp]$/u.test(trigger));
      if (!triggers.length) return [];
      return [{ ...item, triggers, trigger: triggers[0] }];
    });
    return { ...settings, shortcuts };
  }
  function migrateFolders(settings, makeId) {
    if (settings.snipioFoldersVersion === 1) return settings;
    const folder = settings.folders.find(item => item.name === "New folder") || { id: makeId(), name: "New folder" };
    return { ...settings, snipioFoldersVersion: 1,
      folders: settings.folders.some(item => item.id === folder.id) ? settings.folders : [...settings.folders, folder],
      shortcuts: settings.shortcuts.map(item => item.folderId ? item : { ...item, folderId: folder.id }) };
  }
  const api = { load, remove, ensureDemos, resetTemplates, DEMOS_VERSION };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExampleLibrary = api;
})(globalThis);
