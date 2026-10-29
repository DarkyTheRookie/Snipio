// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Firefox's MV3 event page preloads core.js; Chromium uses a service worker.
if (typeof importScripts === "function") importScripts("lib/core.js");
const backgroundApi = typeof browser !== "undefined" ? browser : chrome;

// The background context is the only stats writer. Queue read/modify/write operations
// so simultaneous expansions in tabs cannot overwrite one another.
let statsQueue = Promise.resolve();
function updateStats(message) {
  const operation = statsQueue.then(() => QuickPhrase.withLibraryLock(async () => {
    if (message.type === "rain:reset-stats") return backgroundApi.storage.local.set({ rainStats: { entries: [] } });
    if (typeof message.id !== "string" || !message.id ||
        !Number.isSafeInteger(message.expansionLength) || message.expansionLength < 0 ||
        !Number.isSafeInteger(message.triggerLength) || message.triggerLength < 1) return;
    const result = await backgroundApi.storage.local.get("rainStats");
    await backgroundApi.storage.local.set({ rainStats: QuickPhrase.recordUsage(result.rainStats, message.id, message.expansionLength, message.triggerLength) });
  }));
  statsQueue = operation.catch(() => {});
  return operation;
}

// A page may predate installation, or lose its content-script connection after
// an extension update. Reattach without navigating or disturbing its draft.
let syncing = null;
let syncAgain = false;
function syncOpenTabs() {
  syncAgain = true;
  if (syncing) return syncing;
  syncing = (async () => {
    do {
      syncAgain = false;
      const tabs = await backgroundApi.tabs.query({ url: ["http://*/*", "https://*/*"] });
      await Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id)).map(tab =>
        backgroundApi.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["lib/core.js", "lib/rich.js", "content.js"]
        })
      ));
      // Restricted pages, closed tabs, and sites where access was withheld can
      // reject injection. Other tabs still receive the saved shortcuts.
    } while (syncAgain);
  })().finally(() => { syncing = null; });
  return syncing;
}

backgroundApi.runtime.onInstalled.addListener(() => { syncOpenTabs().catch(() => {}); });
backgroundApi.runtime.onStartup.addListener(() => { syncOpenTabs().catch(() => {}); });
backgroundApi.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.quickPhrase) syncOpenTabs().catch(() => {});
});
// Chromium shares an offscreen document. Firefox already has a document-based
// background context and uses it directly, without an offscreen API permission.
const hasBackgroundDocument = typeof document !== "undefined";
let backgroundSound = null;
let preparingAudio = null;
async function prepareOffscreen() {
  if (!preparingAudio) {
    preparingAudio = (async () => {
      const contexts = await backgroundApi.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [backgroundApi.runtime.getURL("pages/audio.html")]
      });
      if (!contexts.length) await backgroundApi.offscreen.createDocument({
        url: "pages/audio.html",
        reasons: ["AUDIO_PLAYBACK", "CLIPBOARD"],
        justification: "Play expansion feedback and read the clipboard only for a triggered clipboard variable."
      });
    })().finally(() => { preparingAudio = null; });
  }
  await preparingAudio;
}
async function playExpansionSound() {
  if (hasBackgroundDocument) {
    if (!backgroundSound) backgroundSound = new Audio(backgroundApi.runtime.getURL("assets/sounds/expansion.wav"));
    backgroundSound.currentTime = 0;
    await backgroundSound.play();
    return { ok: true };
  }
  await prepareOffscreen();
  return backgroundApi.runtime.sendMessage({ type: "rain:play-sound", target: "audio" });
}
async function readClipboard() {
  if (!hasBackgroundDocument) {
    await prepareOffscreen();
    return backgroundApi.runtime.sendMessage({ type: "rain:read-clipboard", target: "audio" });
  }
  if (typeof navigator.clipboard?.readText === "function") {
    return { ok: true, text: await navigator.clipboard.readText() };
  }
  // Compatibility fallback for a document context without the Clipboard API.
  // Do not retry a denied readText() call through the legacy paste API.
  const field = document.createElement("textarea");
  document.body.append(field);
  field.focus();
  try {
    const ok = document.execCommand("paste");
    return { ok, text: ok ? field.value : "" };
  } finally { field.remove(); }
}

backgroundApi.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== backgroundApi.runtime.id) return;
  if (message?.type === "rain:clipboard") {
    readClipboard().then(reply, () => reply({ ok: false }));
    return true;
  }
  if (message?.type === "rain:expanded") {
    Promise.allSettled([playExpansionSound(), updateStats(message)]).then(results => reply({ ok: results.every(result => result.status === "fulfilled") }));
    return true;
  }
  if (message?.type === "rain:reset-stats" && sender.url === backgroundApi.runtime.getURL("pages/stats.html")) {
    updateStats(message).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }
  if (message?.type !== "quickphrase:sync") return;
  syncOpenTabs().then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});
