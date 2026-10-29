// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const QuickPhrase = require(runtimeFile("core.js"));

async function harness(config = {}, deferInitialRead = false, configureChrome = () => {}, namespace = "chrome") {
  const handlers = {};
  const listenerCounts = {};
  const messages = [];
  let changed;
  let saved = { ...QuickPhrase.defaults, ...config };
  let resolveInitialRead;
  let firstRead = true;
  class Element {
    closest() { return this.optOut || this.type === "password" ? this : null; }
    matches(selector) { return selector === "input, textarea" || selector === "input"; }
  }
  class HTMLInputElement extends Element {
    constructor(value = "hi", type = "text") {
      super(); this.value = value; this.type = type; this.selectionStart = value.length; this.selectionEnd = value.length;
      this.ownerDocument = { execCommand: () => false }; this.events = [];
    }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + text.length;
    }
    dispatchEvent(event) { this.events.push(event); }
  }
  class HTMLTextAreaElement extends HTMLInputElement {}
  const chrome = { runtime: { sendMessage: message => { messages.push(message); return Promise.resolve({ ok: true }); } }, storage: {
    local: { get: () => {
      if (firstRead && deferInitialRead) {
        firstRead = false;
        return new Promise(resolve => { resolveInitialRead = resolve; });
      }
      firstRead = false;
      return Promise.resolve({ quickPhrase: saved });
    } },
    onChanged: { addListener: fn => { changed = fn; } }
  } };
  configureChrome(chrome);
  const source = fs.readFileSync(require.resolve(runtimeFile("content.js")), "utf8");
  const context = vm.createContext({
    QuickPhrase, ...(namespace === "browser" ? { browser: chrome, chrome: new Proxy({}, { get() { throw new Error("Legacy chrome API accessed"); } }) } : { chrome }), Element, HTMLInputElement, HTMLTextAreaElement,
    InputEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    document: { addEventListener: (name, fn) => {
      handlers[name] = fn; listenerCounts[name] = (listenerCounts[name] || 0) + 1;
    } }
  });
  const initialized = vm.runInContext(source, context);
  if (!deferInitialRead) await initialized;
  function emit(type, target, extra = {}) {
    const event = { key: " ", inputType: "insertText", data: "i", composedPath: () => [target],
      preventDefault() { this.defaultPrevented = true; }, ...extra };
    handlers[type](event);
    return event;
  }
  return {
    emit, HTMLInputElement, HTMLTextAreaElement, listenerCounts, initialized, messages, chrome,
    hasInstance: () => !!context.__quickPhraseInstance,
    focus: () => handlers.focusin(),
    update: value => { saved = value; changed({ quickPhrase: { newValue: value } }, "local"); },
    setStored: value => { saved = value; },
    reinject: () => vm.runInContext(source, context),
    finishInitialRead: value => resolveInitialRead({ quickPhrase: value })
  };
}

test("typing expands immediately once and preserves text after the caret", async () => {
  const h = await harness();
  const field = new h.HTMLInputElement("say hi tail"); field.selectionStart = field.selectionEnd = 6;
  const event = h.emit("input", field);
  assert.equal(field.value, "say Hello, how are you? tail");
  assert.equal(field.selectionStart, "say Hello, how are you?".length);
  assert.equal(field.events[0].type, "input");
  assert.equal(event.defaultPrevented, undefined);
  assert.equal(h.messages.filter(message => message.type === "rain:expanded").length, 1);
});

test("Space and Enter keep their native behavior even with saved delimiter settings", async () => {
  const h = await harness({ mode: "delimiter" });
  for (const key of [" ", "Enter"]) {
    const field = new h.HTMLTextAreaElement();
    assert.equal(h.emit("keydown", field, { key }).defaultPrevented, undefined);
    assert.equal(field.value, "hi");
    h.emit("input", field);
    assert.equal(field.value, "Hello, how are you?");
  }
});

test("cursor marker positions the caret and preserves the rest of the input", async () => {
  const h = await harness({ shortcuts: [{ trigger: "hi", replacement: "Dear {cursor}, hello!" }] });
  const field = new h.HTMLInputElement("hi tail"); field.selectionStart = field.selectionEnd = 2;
  h.emit("input", field);
  assert.equal(field.value, "Dear , hello! tail");
  assert.equal(field.selectionStart, 5);
});

test("immediate Backspace restores the exact alias and later typing cancels restoration", async () => {
  const h = await harness({ shortcuts: [{ triggers: ["hi", "Hi"], replacement: "Dear {cursor}friend" }] });
  const field = new h.HTMLInputElement("Hi tail"); field.selectionStart = field.selectionEnd = 2;
  h.emit("input", field);
  assert.equal(h.emit("keydown", field, { key: "Backspace" }).defaultPrevented, true);
  assert.equal(field.value, "Hi tail");
  h.emit("input", field);
  h.emit("keydown", field, { key: "x" });
  assert.equal(h.emit("keydown", field, { key: "Backspace" }).defaultPrevented, undefined);
});

test("password, opt-out, read-only, disabled, selection, and composing inputs are unchanged", async () => {
  const h = await harness();
  for (const property of ["password", "optOut", "readOnly", "disabled", "selection", "composition"]) {
    const field = new h.HTMLInputElement();
    if (property === "password") field.type = "password";
    else if (property === "selection") field.selectionStart = 0;
    else if (property !== "composition") field[property] = true;
    const event = h.emit("input", field, { isComposing: property === "composition" });
    assert.equal(field.value, "hi", property);
    assert.equal(event.defaultPrevented, undefined, property);
  }
  assert.equal(h.messages.length, 0);
});

test("live settings pause, change phrase, and enable immediate expansion", async () => {
  const h = await harness(); const field = new h.HTMLInputElement();
  h.update({ ...QuickPhrase.defaults, enabled: false }); h.emit("keydown", field);
  assert.equal(field.value, "hi");
  h.update({ enabled: true, mode: "immediate", shortcuts: [{ trigger: "hi", replacement: "Updated" }] });
  h.emit("keydown", field); assert.equal(field.value, "hi");
  h.emit("input", field); assert.equal(field.value, "Updated");
});

test("immediate mode ignores paste, deletion, and IME composition", async () => {
  const h = await harness({ mode: "immediate" });
  for (const extra of [{ inputType: "insertFromPaste" }, { inputType: "deleteContentBackward" }, { isComposing: true }]) {
    const field = new h.HTMLInputElement(); h.emit("input", field, extra); assert.equal(field.value, "hi");
  }
});

test("re-injection refreshes saved shortcuts without duplicating keyboard handlers", async () => {
  const h = await harness();
  h.setStored({ mode: "immediate", shortcuts: [{ trigger: "new", replacement: "New phrase" }] });
  await h.reinject();
  const field = new h.HTMLInputElement("new");
  h.emit("input", field);
  assert.equal(field.value, "New phrase");
  assert.equal(h.listenerCounts.input, 1);
  assert.equal(h.listenerCounts.keydown, 1);
});

test("unavailable storage skips startup and a later injection can initialize normally", async () => {
  let storage;
  const h = await harness({}, false, chrome => { storage = chrome.storage; delete chrome.storage; });
  assert.equal(h.hasInstance(), false);
  assert.deepEqual(h.listenerCounts, {});
  h.chrome.storage = storage;
  await h.reinject();
  const field = new h.HTMLInputElement();
  h.emit("input", field);
  assert.equal(field.value, "Hello, how are you?");
  assert.equal(h.listenerCounts.input, 1);
});

test("unavailable change events and invalidated API getters do not install a partial script", async () => {
  for (const configure of [
    chrome => { delete chrome.storage.onChanged; },
    chrome => { Object.defineProperty(chrome, "storage", { get() { throw new Error("Extension context invalidated."); } }); },
    chrome => { chrome.storage.onChanged.addListener = () => { throw new Error("Extension context invalidated."); }; }
  ]) {
    const h = await harness({}, false, configure);
    assert.equal(h.hasInstance(), false);
    assert.deepEqual(h.listenerCounts, {});
  }
});

test("losing storage pauses cached expansion and recovering storage resumes it", async () => {
  const h = await harness();
  const storage = h.chrome.storage;
  delete h.chrome.storage;
  await h.focus();
  const field = new h.HTMLInputElement();
  h.emit("input", field);
  assert.equal(field.value, "hi", "a disconnected script does not expand cached snippets");
  h.chrome.storage = storage;
  await h.focus();
  h.emit("input", field);
  assert.equal(field.value, "Hello, how are you?");
});

test("returning to an input resynchronizes storage if its change event was missed", async () => {
  const h = await harness();
  h.setStored({ mode: "immediate", shortcuts: [{ trigger: "hi", replacement: "Current phrase" }] });
  const field = new h.HTMLInputElement();
  await h.focus();
  h.emit("input", field);
  assert.equal(field.value, "Current phrase");
});

test("an older initial storage read cannot overwrite a newly saved shortcut", async () => {
  const h = await harness({}, true);
  h.update({ mode: "immediate", shortcuts: [{ trigger: "hi", replacement: "Newest phrase" }] });
  h.finishInitialRead(QuickPhrase.defaults);
  await h.initialized;
  const field = new h.HTMLInputElement();
  h.emit("input", field);
  assert.equal(field.value, "Newest phrase");
});

test("native browser API initializes expansion even when the chrome namespace is unusable", async () => {
  const h = await harness({}, false, () => {}, "browser");
  assert.equal(h.hasInstance(), true);
  const field = new h.HTMLInputElement();
  h.emit("input", field);
  assert.equal(field.value, "Hello, how are you?");
  assert.equal(h.messages.length, 1);
  h.setStored({ enabled: true, mode: "immediate", shortcuts: [{ trigger: "next", replacement: "Native browser API" }] });
  await h.reinject();
  const next = new h.HTMLInputElement("next");
  h.emit("input", next);
  assert.equal(next.value, "Native browser API");
  assert.equal(h.listenerCounts.input, 1);
});