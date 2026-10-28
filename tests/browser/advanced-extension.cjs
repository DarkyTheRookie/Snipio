// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeUrl, extensionRoot } = require("../helpers.cjs");
// Real MV3 worker regression: serialized stats writes and offscreen clipboard.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const context = await chromium.launchPersistentContext("", {
    headless: true, executablePath: process.argv[3], ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
  });
  try {
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage(); await page.goto(runtimeUrl("manager.html", extensionId));
    await page.waitForFunction(() => !document.getElementById("add").disabled);
    const clipboard = await page.evaluate(async () => {
      const result = await chrome.runtime.sendMessage({ type: "rain:clipboard" });
      return { ok: result?.ok, isText: typeof result?.text === "string" };
    });
    assert.deepEqual(clipboard, { ok: true, isText: true }, "offscreen clipboard read works without modifying or exposing clipboard contents");
    const stats = await page.evaluate(async () => {
      await chrome.storage.local.set({ rainStats: { entries: [] } });
      await Promise.all(Array.from({ length: 20 }, () => chrome.runtime.sendMessage({ type: "rain:expanded", id: "concurrent", expansionLength: 20, triggerLength: 2 })));
      return (await chrome.storage.local.get("rainStats")).rainStats;
    });
    assert.deepEqual(stats.entries, [{ id: "concurrent", count: 20, saved: 360 }]);
    await page.goto(runtimeUrl("stats.html", extensionId));
    await page.waitForFunction(() => document.getElementById("total-uses").textContent === "20");
    page.once("dialog", dialog => dialog.accept()); await page.locator("#reset-stats").click();
    await page.waitForFunction(() => document.getElementById("total-uses").textContent === "0");
    console.log("PASS actual worker: offscreen clipboard read, concurrent local stats writes, stats page and serialized reset");
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
