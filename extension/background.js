// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
importScripts("lib/core.js");

// The service worker is the only stats writer. Queue read/modify/write operations
// so simultaneous expansions in tabs cannot overwrite one another.
let statsQueue = Promise.resolve();
function updateStats(message) {
  const operation = statsQueue.then(() => QuickPhrase.withLibraryLock(async () => {
    if (message.type === "rain:reset-stats") return chrome.storage.local.set({ rainStats: { entries: [] } });
    if (typeof message.id !== "string" || !message.id ||
        !Number.isSafeInteger(message.expansionLength) || message.expansionLength < 0 ||
        !Number.isSafeInteger(message.triggerLength) || message.triggerLength < 1) return;
    const result = await chrome.storage.local.get("rainStats");
    await chrome.storage.local.set({ rainStats: QuickPhrase.recordUsage(result.rainStats, message.id, message.expansionLength, message.triggerLength) });
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
      const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
      await Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id)).map(tab =>
        chrome.scripting.executeScript({
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

chrome.runtime.onInstalled.addListener(() => { syncOpenTabs().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { syncOpenTabs().catch(() => {}); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.quickPhrase) syncOpenTabs().catch(() => {});
});
// Share one audio document across tabs, including concurrent first expansions.
let preparingAudio = null;
async function prepareOffscreen() {
  if (!preparingAudio) {
    preparingAudio = (async () => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL("pages/audio.html")]
      });
      if (!contexts.length) await chrome.offscreen.createDocument({
        url: "pages/audio.html",
        reasons: ["AUDIO_PLAYBACK", "CLIPBOARD"],
        justification: "Play expansion feedback and read the clipboard only for a triggered clipboard variable."
      });
    })().finally(() => { preparingAudio = null; });
  }
  await preparingAudio;
}
async function playExpansionSound() {
  await prepareOffscreen();
  return chrome.runtime.sendMessage({ type: "rain:play-sound", target: "audio" });
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "rain:clipboard") {
    prepareOffscreen().then(() => chrome.runtime.sendMessage({ type: "rain:read-clipboard", target: "audio" }))
      .then(reply, () => reply({ ok: false }));
    return true;
  }
  if (message?.type === "rain:expanded") {
    Promise.allSettled([playExpansionSound(), updateStats(message)]).then(results => reply({ ok: results.every(result => result.status === "fulfilled") }));
    return true;
  }
  if (message?.type === "rain:reset-stats" && sender.url === chrome.runtime.getURL("pages/stats.html")) {
    updateStats(message).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }
  if (message?.type !== "quickphrase:sync") return;
  syncOpenTabs().then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});
