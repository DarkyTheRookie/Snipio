// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function fixture({ clipboard, paste = true, audioFailure = false, worker = false } = {}) {
  const data = {}, calls = { reads: 0, pasted: 0, removed: 0, audio: [], sent: [], contexts: 0, documents: 0 };
  let listener;
  const event = { addListener() {} };
  const api = {
    runtime: {
      id: "snipio-test", getURL: path => "moz-extension://snipio-test/" + path,
      onInstalled: event, onStartup: event, onMessage: { addListener(value) { listener = value; } },
      async getContexts() { calls.contexts++; await Promise.resolve(); return []; },
      async sendMessage(value) { calls.sent.push(value); return { ok: true, text: "Synthetic clipboard" }; }
    },
    offscreen: { async createDocument() { calls.documents++; } },
    tabs: { async query() { return []; } }, scripting: { async executeScript() {} },
    storage: { onChanged: event, local: {
      async get(key) { return structuredClone({ [key]: data[key] }); },
      async set(values) { Object.assign(data, structuredClone(values)); }
    } }
  };
  const document = {
    body: { append() {} },
    createElement() { return { value: "Synthetic legacy clipboard", focus() {}, remove() { calls.removed++; } }; },
    execCommand(command) { assert.equal(command, "paste"); calls.pasted++; if (paste instanceof Error) throw paste; return paste; }
  };
  class Audio {
    constructor(url) { this.url = url; this.currentTime = 5; calls.audio.push(this); this.plays = 0; }
    async play() { this.plays++; if (audioFailure) throw new Error("Audio unavailable"); }
  }
  const context = vm.createContext({ navigator: { ...(clipboard ? { clipboard: { async readText() { calls.reads++; return clipboard(); } } } : {}) }, Audio,
    ...(worker ? { chrome: api } : { browser: api, chrome: { storage: { local: { get() { throw new Error("Wrong API namespace"); } } } }, document })
  });
  vm.runInContext(fs.readFileSync(runtimeFile("core.js"), "utf8"), context);
  if (worker) context.importScripts = () => {};
  vm.runInContext(fs.readFileSync(runtimeFile("background.js"), "utf8"), context);
  function dispatch(message, sender = { id: api.runtime.id }) {
    return new Promise(resolve => {
      const result = listener(message, sender, value => resolve(JSON.parse(JSON.stringify(value))));
      if (result !== true) resolve(undefined);
    });
  }
  return { data, calls, dispatch, api };
}

test("Firefox event page starts with preloaded core and reads clipboard only on its own request", async () => {
  const { calls, dispatch } = fixture({ clipboard: () => "Hello {date} from a synthetic fixture" });
  assert.equal(calls.reads, 0);
  assert.equal(await dispatch({ type: "rain:clipboard" }, { id: "other-extension" }), undefined);
  assert.equal(calls.reads, 0);
  assert.deepEqual(await dispatch({ type: "rain:clipboard" }), { ok: true, text: "Hello {date} from a synthetic fixture" });
  assert.equal(calls.reads, 1);
  assert.equal(calls.contexts, 0);
  assert.equal(calls.documents, 0);
  assert.equal(calls.sent.length, 0);
});

test("Firefox clipboard permission failure returns an error without retrying through paste", async () => {
  const { calls, dispatch } = fixture({ clipboard: () => { throw new Error("Permission denied"); } });
  assert.deepEqual(await dispatch({ type: "rain:clipboard" }), { ok: false });
  assert.equal(calls.pasted, 0);
});

test("Firefox legacy clipboard fallback cleans its temporary field on success and failure", async () => {
  for (const paste of [true, false, new Error("Paste unavailable")]) {
    const { calls, dispatch } = fixture({ paste });
    const result = await dispatch({ type: "rain:clipboard" });
    assert.equal(result.ok, paste === true);
    if (paste === true) assert.equal(result.text, "Synthetic legacy clipboard");
    assert.equal(calls.removed, 1);
    assert.equal(calls.documents, 0);
  }
});

test("Firefox expansions share a local sound and serialize concurrent statistics without offscreen APIs", async () => {
  const { calls, dispatch, data } = fixture();
  const message = { type: "rain:expanded", id: "hello", expansionLength: 20, triggerLength: 6 };
  const results = await Promise.all([dispatch(message), dispatch(message)]);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.deepEqual(data.rainStats.entries, [{ id: "hello", count: 2, saved: 28 }]);
  assert.equal(calls.audio.length, 1);
  assert.equal(calls.audio[0].url, "moz-extension://snipio-test/assets/sounds/expansion.wav");
  assert.equal(calls.audio[0].currentTime, 0);
  assert.equal(calls.audio[0].plays, 2);
  assert.equal(calls.contexts, 0);
  assert.equal(calls.documents, 0);
});

test("Firefox sound failure does not prevent recording usage and reset requires the stats page", async () => {
  const { data, dispatch, api } = fixture({ audioFailure: true });
  assert.deepEqual(await dispatch({ type: "rain:expanded", id: "hello", expansionLength: 20, triggerLength: 6 }), { ok: false });
  assert.equal(data.rainStats.entries[0].count, 1);
  assert.equal(await dispatch({ type: "rain:reset-stats" }), undefined);
  assert.equal(data.rainStats.entries[0].count, 1);
  assert.deepEqual(await dispatch({ type: "rain:reset-stats" }, { id: api.runtime.id, url: api.runtime.getURL("pages/stats.html") }), { ok: true });
  assert.deepEqual(data.rainStats.entries, []);
});

test("Chromium service worker still shares one offscreen document for concurrent media requests", async () => {
  const { calls, dispatch } = fixture({ worker: true });
  const results = await Promise.all([dispatch({ type: "rain:clipboard" }), dispatch({ type: "rain:expanded", id: "hello", expansionLength: 20, triggerLength: 6 })]);
  assert.deepEqual(results, [{ ok: true, text: "Synthetic clipboard" }, { ok: true }]);
  assert.equal(calls.contexts, 1);
  assert.equal(calls.documents, 1);
  assert.equal(calls.audio.length, 0);
  assert.deepEqual(calls.sent.map(message => message.type).sort(), ["rain:play-sound", "rain:read-clipboard"]);
});
