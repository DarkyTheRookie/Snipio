// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("fixture-created")) {
        localStorage.setItem("fixture-created", "yes");
        localStorage.setItem("quickPhrase", JSON.stringify({ enabled: false, shortcuts: [{ id: "own", trigger: ";own", replacement: "My library" }], folders: [] }));
        localStorage.setItem("rainStats", JSON.stringify({ entries: [{ id: "own", count: 9, saved: 90 }] }));
        localStorage.setItem("snipioQuickDraft", JSON.stringify({ values: { replacement: "My draft" } }));
        localStorage.setItem("unrelated", "true");
      }
      window.openedEditor = 0;
      window.chrome = { runtime: { async openOptionsPage() { window.openedEditor++; } }, storage: { local: {
        async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => localStorage.getItem(key) !== null).map(key => [key, JSON.parse(localStorage.getItem(key))])); },
        async set(values) { Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value))); },
        async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(key => localStorage.removeItem(key)); }
      } } };
    });
    await page.goto(pathToFileURL(runtimeFile("reset-library.html")).href);
    const read = key => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const original = await read("quickPhrase");
    assert.equal(original.shortcuts[0].id, "own", "merely opening this page never resets data");
    await page.getByRole("button", { name: "Reset initial templates", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("reset-status").textContent.includes("9 starter templates"));
    assert.equal((await read("quickPhrase")).shortcuts.length, 10);
    assert.equal((await read("snipioQuickDraft")).values.replacement, "My draft");
    assert.equal(await read("unrelated"), true);
    assert.equal(await page.locator("#restore-library").count(), 0);
    assert.equal(await read("snipioLibraryResetBackup"), null);
    assert.equal((await read("quickPhrase")).shortcuts[0].replacement, original.shortcuts[0].replacement);
    assert.equal((await read("rainStats")).entries[0].count, 9);
    assert.equal((await read("snipioQuickDraft")).values.replacement, "My draft");
    await page.getByRole("button", { name: "Open Snipio", exact: true }).click();
    assert.equal(await page.evaluate(() => window.openedEditor), 1);
    assert.deepEqual(errors, []);
    console.log("PASS template reset: personal data preserved, no restore feature, open editor");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
