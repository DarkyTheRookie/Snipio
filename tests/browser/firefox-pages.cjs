// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
// DOM regression for the Firefox package using only the Promise-based browser API.
// Runs in Chromium with API mocks; this does not replace a real Firefox test.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { repositoryRoot, artifactFile } = require("../helpers.cjs");
const packageRoot = path.join(repositoryRoot, "dist/firefox");

(async () => {
  assert(fs.existsSync(path.join(packageRoot, "manifest.json")), "Build the Firefox package first: node scripts/build.cjs firefox");
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const stored = {}, errors = [], external = [];
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    await context.exposeBinding("readTestStorage", (_source, keys) => {
      const requested = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(stored);
      return structuredClone(Object.fromEntries(requested.filter(key => Object.hasOwn(stored, key)).map(key => [key, stored[key]])));
    });
    await context.exposeBinding("writeTestStorage", (_source, values) => {
      const changes = {};
      for (const [key, newValue] of Object.entries(values)) {
        changes[key] = { oldValue: structuredClone(stored[key]), newValue };
        stored[key] = structuredClone(newValue);
      }
      return changes;
    });
    await context.exposeBinding("removeTestStorage", (_source, keys) => {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) { changes[key] = { oldValue: stored[key] }; delete stored[key]; }
      return changes;
    });
    await context.addInitScript(() => {
      if (location.protocol !== "file:") return;
      const listeners = [];
      const changed = changes => listeners.forEach(listener => listener(changes, "local"));
      window.chrome = new Proxy({}, { get() { throw new Error("Firefox package used legacy chrome API instead of browser API"); } });
      window.browser = {
        runtime: {
          async openOptionsPage() { window.optionsOpened = true; },
          async sendMessage(message) {
            if (message.type === "rain:clipboard") return { ok: true, text: "Synthetic clipboard" };
            if (message.type === "rain:reset-stats") await browser.storage.local.set({ rainStats: { entries: [] } });
            return { ok: true };
          }
        },
        storage: {
          onChanged: { addListener(listener) { listeners.push(listener); } },
          local: {
            get: keys => window.readTestStorage(keys),
            async set(values) { changed(await window.writeTestStorage(values)); },
            async remove(keys) { changed(await window.removeTestStorage(keys)); }
          }
        }
      };
    });
    context.on("page", page => page.on("pageerror", error => errors.push(error.stack || error.message)));
    context.on("request", request => { if (/^https?:/u.test(request.url())) external.push(request.url()); });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const url = name => pathToFileURL(path.join(packageRoot, "pages", name + ".html")).href;
    await page.goto(url("manager"));
    await page.waitForFunction(() => !document.getElementById("add").disabled);
    const practice = page.locator("#playground"); await practice.pressSequentially(".hello");
    assert.equal(await practice.inputValue(), "Hello, how are you?");
    await page.locator("#add").click();
    await page.locator("#snippet-name").fill("Firefox namespace test");
    await page.locator("#trigger").fill(";firefox");
    await page.locator("#replacement").fill("Works with the native browser API");
    await page.getByRole("button", { name: "Save snippet", exact: true }).click();
    await page.waitForFunction(() => !document.getElementById("editor").open);
    assert(stored.quickPhrase.shortcuts.some(item => item.trigger === ";firefox"));
    await page.reload(); await page.waitForFunction(() => !document.getElementById("add").disabled);
    await practice.pressSequentially(";firefox");
    assert.equal(await practice.inputValue(), "Works with the native browser API");
    await page.goto(url("editor"));
    await page.waitForFunction(() => document.getElementById("total-count").textContent !== "0");
    await page.locator("#search").fill("Firefox namespace test");
    assert.match(await page.locator("#snippet-list").textContent(), /Firefox namespace test/u);
    stored.rainStats = { entries: [{ id: "sample", count: 7, saved: 70 }] };
    await page.goto(url("stats"));
    await page.waitForFunction(() => document.getElementById("total-uses").textContent === "7");
    page.once("dialog", dialog => dialog.accept()); await page.locator("#reset-stats").click();
    await page.waitForFunction(() => document.getElementById("total-uses").textContent === "0");
    await page.goto(url("backup"));
    await page.waitForFunction(() => !document.getElementById("export-backup").disabled);
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-backup").click()]);
    const backupPath = await download.path();
    const exported = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    assert(exported.data.quickPhrase.shortcuts.some(item => item.trigger === ";firefox"));
    await page.locator("#backup-file").setInputFiles({ name: "synthetic-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
    await page.waitForFunction(() => !document.getElementById("import-backup").disabled);
    page.once("dialog", dialog => dialog.accept()); await page.locator("#import-backup").click();
    await page.waitForFunction(() => document.getElementById("backup-status").textContent.includes("Backup imported"));
    await page.goto(url("reset-library"));
    page.once("dialog", dialog => dialog.accept()); await page.locator("#reset-library").click();
    await page.waitForFunction(() => !document.getElementById("open-snipio").hidden);
    assert(stored.quickPhrase.shortcuts.some(item => item.trigger === ";firefox"), "Reset must preserve personal snippets");
    await page.screenshot({ path: artifactFile("firefox-api-pages.png") });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log("PASS Firefox-package DOM with browser-only APIs: popup expansion/CRUD/persistence, editor, stats reset, backup export/import, template reset; no page errors or outbound HTTP. Native Firefox is a separate required check.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
