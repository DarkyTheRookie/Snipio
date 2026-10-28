// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, runtimeUrl, extensionRoot, artifactFile } = require("../helpers.cjs");
// Real extension storage and downloaded files in a disposable browser profile.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const core = require(runtimeFile("core.js"));
const backupCore = require(runtimeFile("backup-core.js"));

(async () => {
  const extensionPath = extensionRoot;
  const context = await chromium.launchPersistentContext("", {
    headless: true, executablePath: process.argv[3], acceptDownloads: true,
    viewport: { width: 1200, height: 1000 }, ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    const url = file => runtimeUrl(file, extensionId);
    const errors = [], external = [];
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    context.on("request", request => { if (/^https?:/u.test(request.url())) external.push(request.url()); });
    const original = {
      quickPhrase: core.normalize({ enabled: false, snipioDemosVersion: 1, snipioFoldersVersion: 1,
        folders: [{ id: "work", name: "Work", favorite: true }], shortcuts: [
          { id: "greeting", name: "Привет ♥", triggers: [".hello", ".Hello"], replacement: "Hello, 世界!", folderId: "work", favorite: true, tags: ["personal"], description: "Keep my note" },
          { id: "rich", name: "Signature", trigger: ".sig", replacement: '<b>Kind regards</b><a href="https://example.com/">Website</a>', format: "html" }
        ] }),
      rainStats: { entries: [{ id: "greeting", count: 7, saved: 70 }, { id: "deleted", count: 3, saved: 30 }] },
      snipioLibraryResetAt: 123
    };
    const values = { name: "Unfinished", triggers: ".draft", replacement: "Dear {form:", format: "text", folderId: "work", tags: "personal", description: "Draft note", favorite: false };
    const draft = { editingId: null, pendingSnippetId: "pending", baselineValues: { ...values, replacement: "" }, values, token: "saved-draft", updatedAt: 1000, libraryResetAt: 123 };
    Object.assign(original, { snipioEditorDraft: draft, snipioQuickDraft: null, snipioEditorDraftBackups: [{ ...structuredClone(draft), token: "archived-draft" }] });
    await worker.evaluate(data => chrome.storage.local.set(data), { ...original, unrelated: "keep me" });
    const page = await context.newPage();
    await page.goto(url("backup.html"));
    await page.waitForFunction(() => !document.getElementById("export-backup").disabled);
    assert.match(await page.locator("#current-summary").textContent(), /2 snippets.*1 folder.*10 uses.*2 drafts/u);
    const downloading = page.waitForEvent("download");
    await page.locator("#export-backup").click();
    const download = await downloading;
    assert.match(download.suggestedFilename(), /^snipio-backup-.*\.json$/u);
    const downloaded = fs.readFileSync(await download.path(), "utf8");
    const exported = backupCore.parseBackup(downloaded);
    assert.deepEqual(exported.data, original);
    assert.equal(downloaded.includes("keep me"), false);
    console.log("PASS real file download: full Unicode/rich library, metadata, drafts, settings, history, no unrelated keys");

    const upload = text => page.locator("#backup-file").setInputFiles({ name: "snipio-backup.json", mimeType: "application/json", buffer: Buffer.from(text) });
    await upload("{");
    await page.waitForFunction(() => !document.getElementById("backup-error").hidden);
    assert.equal(await page.locator("#import-backup").isDisabled(), true);
    assert.deepEqual(await worker.evaluate(() => chrome.storage.local.get(["quickPhrase", "rainStats"])), { quickPhrase: original.quickPhrase, rainStats: original.rainStats });
    await upload(JSON.stringify({ ...exported, version: 2 }));
    await page.waitForFunction(() => document.getElementById("backup-error").textContent.includes("version"));
    const malformed = structuredClone(exported); malformed.data.quickPhrase.shortcuts[1].triggers = [".hello"]; malformed.data.quickPhrase.shortcuts[1].trigger = ".hello";
    await upload(JSON.stringify(malformed));
    await page.waitForFunction(() => document.getElementById("backup-error").textContent.includes("invalid data"));
    assert.equal(await page.locator("#import-backup").isDisabled(), true);
    await upload(downloaded);
    await page.waitForFunction(() => !document.getElementById("import-backup").disabled);
    assert.match(await page.locator("#import-summary").textContent(), /2 snippets.*10 uses/u);
    page.once("dialog", dialog => dialog.dismiss());
    await page.locator("#import-backup").click();
    assert.equal(await page.locator("#backup-preview").isVisible(), true);
    assert.equal((await worker.evaluate(() => chrome.storage.local.get("snipioLibraryResetAt"))).snipioLibraryResetAt, 123);
    console.log("PASS invalid/truncated/future files and cancelled import leave existing data intact");

    // Leave both editor surfaces holding an invalid unsaved draft. A restore
    // must cancel their pending old autosaves before replacing the library.
    await worker.evaluate(() => chrome.storage.local.set({ quickPhrase: {
      enabled: true, mode: "immediate", snipioDemosVersion: 1, snipioFoldersVersion: 1, folders: [],
      shortcuts: [{ id: "current", name: "Current", trigger: ".current", triggers: [".current"], replacement: "Current text", format: "text", favorite: false, tags: [], folderId: null }]
    }, rainStats: { entries: [] }, snipioEditorDraft: null, snipioEditorDraftBackups: [], snipioQuickDraft: null, snipioLibraryResetAt: 456 }));
    const popup = await context.newPage(); await popup.setViewportSize({ width: 384, height: 600 });
    await popup.goto(url("manager.html")); await popup.waitForFunction(() => !document.getElementById("add").disabled);
    assert.equal(await popup.locator(".backup-page-link").getAttribute("href"), "backup.html");
    await popup.locator("#add").click(); await popup.locator("#snippet-name").fill("Unfinished popup");
    const editor = await context.newPage(); await editor.goto(url("editor.html"));
    await editor.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    assert.equal(await editor.locator(".backup-page-link").getAttribute("href"), "backup.html");
    await editor.locator("#add-shortcut").click(); await editor.locator("#snippet-name").fill("Unfinished editor");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#import-backup").click();
    await page.waitForFunction(() => document.getElementById("backup-status").textContent.startsWith("Backup imported"));
    await popup.waitForFunction(() => !document.getElementById("editor").open);
    await editor.waitForFunction(() => document.getElementById("replacement").value === "Dear {form:");
    await popup.waitForFunction(() => document.getElementById("usage-count").textContent === "10");
    await popup.close(); await editor.close();
    const restored = await worker.evaluate(() => chrome.storage.local.get(null));
    assert.deepEqual(restored.quickPhrase, original.quickPhrase);
    assert.deepEqual(restored.rainStats, original.rainStats);
    assert.equal(restored.unrelated, "keep me");
    assert.notEqual(restored.snipioLibraryResetAt, 123);
    for (const item of [restored.snipioEditorDraft, ...restored.snipioEditorDraftBackups]) {
      assert.equal(item.libraryResetAt, restored.snipioLibraryResetAt);
      assert.equal(item.values.replacement, "Dear {form:");
    }
    assert.equal(JSON.stringify(restored).includes("Unfinished popup"), false);
    assert.equal(JSON.stringify(restored).includes("Unfinished editor"), false);
    console.log("PASS real extension import: library and usage restored, draft epochs rebased, open editors cannot overwrite imported data");

    await page.reload(); await page.waitForFunction(() => !document.getElementById("export-backup").disabled);
    await upload(downloaded); await page.waitForFunction(() => !document.getElementById("import-backup").disabled);
    for (const width of [360, 768, 1200]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: artifactFile(`snipio-backup-${width}.png`), fullPage: true, animations: "disabled" });
    }
    const empty = backupCore.createBackup({ quickPhrase: core.normalize({ shortcuts: [], folders: [] }) });
    await upload(JSON.stringify(empty)); await page.waitForFunction(() => !document.getElementById("import-backup").disabled);
    page.once("dialog", dialog => dialog.accept()); await page.locator("#import-backup").click();
    await page.waitForFunction(() => document.getElementById("backup-status").textContent.startsWith("Backup imported"));
    const reopened = await context.newPage(); await reopened.setViewportSize({ width: 384, height: 600 }); await reopened.goto(url("manager.html"));
    await reopened.waitForFunction(() => !document.getElementById("add").disabled);
    assert.equal(await reopened.locator("#count").textContent(), "0");
    assert.equal(await reopened.locator("#usage-count").textContent(), "0");
    assert.equal(await reopened.evaluate(() => document.querySelector("footer").getBoundingClientRect().bottom <= 600), true);
    await reopened.screenshot({ path: artifactFile("snipio-backup-popup.png"), animations: "disabled" });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log("PASS empty restore persists, popup/footer and backup layouts fit, no page errors or outbound HTTP requests");
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
