// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

test("worker stats writes serialize with a library reset and cannot restore cleared history", async () => {
  const data = { rainStats: { entries: [{ id: "legacy", count: 50, saved: 500 }] } };
  let releaseRead, markReadStarted, lockQueue = Promise.resolve(), firstRead = true;
  const readStarted = new Promise(resolve => { markReadStarted = resolve; });
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  const lockNames = [];
  const ignoreEvent = { addListener() {} };
  const context = vm.createContext({
    navigator: { locks: { request(name, callback) {
      lockNames.push(name);
      const operation = lockQueue.then(() => callback({ name }));
      lockQueue = operation.catch(() => {});
      return operation;
    } } },
    chrome: {
      runtime: { onInstalled: ignoreEvent, onStartup: ignoreEvent, onMessage: ignoreEvent },
      storage: { onChanged: ignoreEvent, local: {
        async get(key) {
          const saved = structuredClone({ [key]: data[key] });
          if (firstRead) { firstRead = false; markReadStarted(); await readGate; }
          return saved;
        },
        async set(values) { Object.assign(data, structuredClone(values)); }
      } }
    }
  });
  context.importScripts = () => vm.runInContext(fs.readFileSync(require.resolve(runtimeFile("core.js")), "utf8"), context);
  vm.runInContext(fs.readFileSync(require.resolve(runtimeFile("background.js")), "utf8"), context);
  const beforeReset = vm.runInContext('updateStats({ type: "rain:expanded", id: "before-reset", expansionLength: 20, triggerLength: 2 })', context);
  await readStarted;
  const reset = vm.runInContext('QuickPhrase.withLibraryLock(() => chrome.storage.local.set({ rainStats: { entries: [] } }))', context);
  const afterReset = vm.runInContext('updateStats({ type: "rain:expanded", id: "after-reset", expansionLength: 20, triggerLength: 2 })', context);
  releaseRead();
  await Promise.all([beforeReset, reset, afterReset]);
  assert.deepEqual(data.rainStats.entries, [{ id: "after-reset", count: 1, saved: 18 }]);
  assert.deepEqual(lockNames, ["snipio-library", "snipio-library", "snipio-library"]);
});
