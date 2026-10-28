// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, artifactFile } = require("../helpers.cjs");
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      const listeners = [];
      if (!localStorage.quickPhrase) localStorage.quickPhrase = JSON.stringify({ snipioDemosVersion: 1, snipioFoldersVersion: 1,
        folders: [{ id: "work", name: "Work" }, { id: "home", name: "Personal" }, { id: "empty", name: "Empty folder" }],
        shortcuts: [
          { id: "work-note", name: "Work note", trigger: ".work", replacement: "Work text", folderId: "work" },
          { id: "other", name: "Other note", trigger: ".other", replacement: "Other text", folderId: "home" },
          { id: "slow", name: "Slow note", trigger: ".slow", replacement: "Slow text", folderId: "work" }
        ] });
      window.chrome = { runtime: { async sendMessage() { return { ok: true }; } }, storage: {
        onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
          async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, JSON.parse(localStorage.getItem(key) || "null")])); },
          async set(values) {
            if (values.quickPhrase && window.delayNextSave) {
              window.delayNextSave = false;
              await new Promise(resolve => { window.releaseSave = resolve; });
            }
            const changes = {};
            for (const [key, newValue] of Object.entries(values)) { localStorage.setItem(key, JSON.stringify(newValue)); changes[key] = { newValue }; }
            listeners.forEach(fn => fn(changes, "local"));
          }
        }
      } };
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(8000); page.on("pageerror", error => errors.push(error.message));
    const url = file => pathToFileURL(runtimeFile(file)).href;
    const stored = () => page.evaluate(() => JSON.parse(localStorage.quickPhrase));
    await page.goto(url("editor.html"));
    await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    assert.equal(await page.locator(".reset-templates-button").isVisible(), true);
    assert.equal(await page.locator(".snippet-delete").count(), 3);
    await page.getByRole("button", { name: "Favorite folder Work", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.quickPhrase).folders.find(folder => folder.id === "work").favorite === true);
    await page.locator("#favorites-filter").click();
    assert.deepEqual(await page.locator("#folders .folder-name").allTextContents(), ["Work"]);
    assert.equal(await page.locator("#favorites-count").textContent(), "1");
    await page.locator("#folders .folder-button").click();
    assert.deepEqual(await page.locator(".snippet-title").allTextContents(), ["Work note", "Slow note"]);
    await page.reload(); await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    assert.equal(await page.getByRole("button", { name: "Unfavorite folder Work", exact: true }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Favorite folder Empty folder", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.quickPhrase).folders.find(folder => folder.id === "empty").favorite === true);
    await page.locator("#favorites-filter").click();
    assert.deepEqual(await page.locator("#folders .folder-name").allTextContents(), ["Work", "Empty folder"]);
    await page.getByRole("button", { name: "Unfavorite folder Empty folder", exact: true }).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.quickPhrase).folders.find(folder => folder.id === "empty").favorite);
    assert.deepEqual(await page.locator("#folders .folder-name").allTextContents(), ["Work"]);
    await page.locator("#all-filter").click();
    await page.screenshot({ path: artifactFile("organization-editor.png"), fullPage: true });
    for (const width of [768, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}px`);
    }
    // Deleting another entry must not navigate away from an unfinished draft.
    await page.getByRole("button", { name: "Edit Work note", exact: true }).click();
    await page.locator("#triggers").fill("");
    await page.locator("#builder-editor").fill("My unfinished draft");
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Delete snippet Other note", exact: true }).click();
    assert.ok((await stored()).shortcuts.some(item => item.id === "other"));
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete snippet Other note", exact: true }).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.quickPhrase).shortcuts.some(item => item.id === "other"));
    assert.equal(await page.locator("#builder-editor").textContent(), "My unfinished draft");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete snippet Work note", exact: true }).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.quickPhrase).shortcuts.some(item => item.id === "work-note"));
    await page.waitForFunction(() => !document.getElementById("editor-empty").hidden);
    await page.waitForTimeout(850);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft"))), null);
    // A delete waits for an already-running autosave, then removes its result.
    await page.getByRole("button", { name: "Edit Slow note", exact: true }).click();
    await page.evaluate(() => { window.delayNextSave = true; });
    await page.locator("#builder-editor").fill("Already saving");
    await page.waitForFunction(() => typeof window.releaseSave === "function");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete snippet Slow note", exact: true }).click();
    await page.evaluate(() => window.releaseSave());
    await page.waitForFunction(() => !JSON.parse(localStorage.quickPhrase).shortcuts.some(item => item.id === "slow"));
    await page.waitForTimeout(850);
    assert.equal((await stored()).shortcuts.length, 0, "autosave cannot resurrect deleted snippets");
    assert.deepEqual(errors, []);
    console.log("PASS dashboard: prominent reset, persistent folder favorites, favorite-folder navigation, responsive layout, row deletion, cancellation, unrelated drafts and in-flight autosave");

    await page.setViewportSize({ width: 384, height: 600 });
    await page.goto(url("manager.html"));
    await page.waitForFunction(() => !document.getElementById("add").disabled);
    assert.equal(await page.locator(".reset-templates-button").isVisible(), true);
    const resetBox = await page.locator(".reset-templates-button").boundingBox();
    assert.ok(resetBox.y + resetBox.height <= 600, "reset stays visible within the attached popup height");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "popup controls fit without horizontal overflow");
    await page.locator("#favorites").click();
    assert.equal(await page.getByRole("button", { name: "Open favorite folder Work", exact: true }).isVisible(), true, "favorite folders are accessible even when empty");
    await page.getByRole("button", { name: "Open favorite folder Work", exact: true }).click();
    assert.equal(await page.locator("#folder-filter").inputValue(), "work");
    assert.equal(await page.locator("#folder-favorite").getAttribute("aria-pressed"), "true");
    await page.locator("#folder-favorite").click();
    await page.waitForFunction(() => !JSON.parse(localStorage.quickPhrase).folders.find(folder => folder.id === "work").favorite);
    await page.locator("#folder-favorite").click();
    await page.waitForFunction(() => JSON.parse(localStorage.quickPhrase).folders.find(folder => folder.id === "work").favorite);
    await page.reload(); await page.waitForFunction(() => !document.getElementById("add").disabled);
    await page.locator("#favorites").click();
    assert.equal(await page.getByRole("button", { name: "Open favorite folder Work", exact: true }).isVisible(), true);
    await page.screenshot({ path: artifactFile("organization-popup.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS popup: prominent reset, shared folder favorites, toggle persistence and empty-folder navigation");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
