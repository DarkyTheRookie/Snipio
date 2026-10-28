// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, artifactFile } = require("../helpers.cjs");
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.addInitScript(() => {
      const listeners = [];
      if (!localStorage.getItem("quickPhrase")) localStorage.setItem("quickPhrase", JSON.stringify({ snipioDemosVersion: 1, folders: [{ id: "work", name: "Work" }], shortcuts: [
        { id: "own", trigger: ".hello", replacement: "Original text", name: "Greeting", folderId: "work" },
        { id: "old", trigger: "/xd", replacement: "Old date" }
      ] }));
      window.chrome = { runtime: { async sendMessage() {} }, storage: {
        onChanged: { addListener(fn) { listeners.push(fn); } },
        local: {
          async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, JSON.parse(localStorage.getItem(key) || "null")])); },
          async set(values) {
            const changes = {};
            for (const [key, value] of Object.entries(values)) { localStorage.setItem(key, JSON.stringify(value)); changes[key] = { newValue: value }; }
            listeners.forEach(fn => fn(changes, "local"));
          },
          async remove(key) { localStorage.removeItem(key); }
        }
      } };
    });
    await page.goto(pathToFileURL(runtimeFile("editor.html")).href);
    await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    assert.equal(await page.locator("#editor-empty").isVisible(), true);
    assert.equal(await page.locator("#shortcut-form").isVisible(), false);
    assert.equal(await page.locator("#tool-clipboard").count(), 0);
    assert.equal(await page.locator(".shortcut-alias").allTextContents().then(items => items.includes("/xd")), false);
    await page.getByRole("button", { name: "Edit Greeting", exact: true }).click();
    assert.equal(await page.locator("#builder-editor").innerText(), "Original text");
    await page.locator(".folder-button").filter({ hasText: "New folder" }).click();
    assert.equal(await page.locator("#builder-editor").innerText(), "Original text");
    await page.locator("#add-shortcut").click();
    assert.notEqual(await page.evaluate(() => document.activeElement.id), "snippet-name");
    assert.equal(await page.locator("#builder-editor").innerText(), "");
    assert.equal(await page.locator("#snippet-folder option:checked").innerText(), "New folder");
    await page.locator("#builder-editor").fill("Draft in progress");
    await page.locator(".folder-button").filter({ hasText: "Work" }).click();
    assert.equal(await page.locator("#shortcut-form").isVisible(), true);
    assert.equal(await page.locator("#builder-editor").innerText(), "Draft in progress");
    await page.locator(".folder-button").filter({ hasText: "New folder" }).click();
    assert.equal(await page.locator("#builder-editor").innerText(), "Draft in progress");
    await page.locator("#triggers").fill(".draft");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.trigger === ".draft"));
    await page.locator(".folder-button").filter({ hasText: "Work" }).click();
    assert.equal(await page.locator("#builder-editor").innerText(), "Draft in progress");
    await page.locator(".folder-button").filter({ hasText: "New folder" }).click();
    assert.equal(await page.locator("#shortcut-form").isVisible(), true);
    assert.equal(await page.locator("#builder-editor").innerText(), "Draft in progress");
    await page.locator(".folder-row").filter({ hasText: "New folder" }).hover();
    await page.getByRole("button", { name: "Rename folder New folder", exact: true }).click();
    await page.locator("#folder-name").fill("Personal");
    await page.getByRole("button", { name: "Save folder", exact: true }).click();
    await page.locator(".folder-row").filter({ hasText: "Personal" }).hover();
    await page.getByRole("button", { name: "Delete folder Personal", exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    assert.equal(await page.locator(".folder-name").allTextContents().then(items => items.includes("New folder") || items.includes("Personal")), false);
    assert.equal(await page.locator("#editor-empty").isVisible(), true);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.id === "own").replacement), "Original text");
    await page.screenshot({ path: artifactFile("editor-empty-preview.png") });
    assert.deepEqual(errors, []);
    console.log("PASS empty editor, explicit selection, folder switching, rename/delete persistence, retired tools and shortcuts");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
