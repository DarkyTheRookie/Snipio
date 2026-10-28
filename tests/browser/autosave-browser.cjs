// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
// Autosave regressions run against disposable mocked extension storage.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      const listeners = [];
      if (!localStorage.getItem("quickPhrase")) localStorage.setItem("quickPhrase", JSON.stringify({ enabled: true, snipioDemosVersion: 1, mode: "immediate", folders: [{ id: "work", name: "Work" }], shortcuts: [{ id: "hello", trigger: "/hello", triggers: ["/hello"], name: "Hello", replacement: "Hello there", tags: ["keep"], description: "hidden metadata", favorite: false }] }));
      window.openedEditor = 0;
      window.chrome = {
        runtime: { async sendMessage() { return { ok: true }; }, async openOptionsPage() { window.openedEditor++; } },
        storage: { onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
          async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, JSON.parse(localStorage.getItem(key) || "null")])); },
          async set(values) {
            // A delayed write exercises edits arriving during an in-flight save.
            if (values.quickPhrase && window.slowSave) await new Promise(resolve => setTimeout(resolve, 250));
            const changes = {};
            for (const [key, value] of Object.entries(values)) { const oldValue = JSON.parse(localStorage.getItem(key) || "null"); localStorage.setItem(key, JSON.stringify(value)); changes[key] = { oldValue, newValue: value }; }
            listeners.forEach(fn => fn(changes, "local"));
          }
        } }
      };
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(8000); page.on("pageerror", error => errors.push(error.message));
    const url = name => pathToFileURL(runtimeFile(name)).href;
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")));
    await page.goto(url("editor.html"));
    await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    await page.locator(".snippet-open").filter({ hasText: "Hello" }).click();
    await page.locator("#builder-editor").fill("Autosaved hello");
    await page.locator("#builder-editor").press("End");
    await page.locator("#builder-editor").press("ArrowLeft");
    const caret = await page.evaluate(() => getSelection().anchorOffset);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.id === "hello").replacement === "Autosaved hello");
    await page.waitForFunction(() => document.getElementById("draft-status").textContent === "Saved");
    assert.equal(await page.evaluate(() => document.activeElement.id), "builder-editor");
    assert.equal(await page.evaluate(() => getSelection().anchorOffset), caret, "autosave keeps the caret");
    await page.locator("#snippet-name").fill("Hello "); await page.locator("#snippet-name").press("Home"); await page.locator("#snippet-name").press("ArrowRight");
    await page.waitForFunction(() => document.getElementById("draft-status").textContent === "Saved");
    assert.equal(await page.locator("#snippet-name").inputValue(), "Hello ", "autosave preserves a space while a name is being typed");
    assert.equal(await page.locator("#snippet-name").evaluate(el => el.selectionStart), 1);
    await page.locator("#triggers").fill("/hello\n");
    await page.waitForFunction(() => document.getElementById("draft-status").textContent === "Saved");
    assert.equal(await page.locator("#triggers").inputValue(), "/hello\n", "autosave keeps an unfinished next trigger line");
    await page.reload();
    await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    await page.locator(".snippet-open").filter({ hasText: "Hello" }).click();
    await page.waitForFunction(() => document.getElementById("replacement").value === "Autosaved hello");
    await page.locator("#add-shortcut").click();
    await page.locator("#snippet-name").fill("Automatic form");
    await page.locator("#triggers").fill("/formauto");
    await page.locator("#builder-editor").fill("Hi {form: name}");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.name === "Automatic form"));
    const newId = (await stored()).shortcuts.find(item => item.name === "Automatic form").id;
    await page.evaluate(() => { window.slowSave = true; });
    await page.locator("#builder-editor").fill("Hi {form: name}!");
    await page.waitForFunction(() => document.getElementById("save-shortcut").disabled);
    await page.locator("#builder-editor").fill("Hi {form: name}!!");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.name === "Automatic form").replacement.endsWith("!!"));
    assert.equal((await stored()).shortcuts.filter(item => item.name === "Automatic form").length, 1, "in-flight edits cannot duplicate a snippet");
    assert.equal((await stored()).shortcuts.find(item => item.name === "Automatic form").id, newId);
    await page.locator("#triggers").fill("/hello");
    await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("overlaps"));
    assert.equal((await stored()).shortcuts.find(item => item.id === newId).trigger, "/formauto", "invalid conflicts do not replace saved snippets");
    await page.reload();
    await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    await page.locator("#recovered-drafts").click();
    await page.locator(".draft-recovery-row").filter({ hasText: "Automatic form" }).first().getByRole("button", { name: "Open", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("triggers").value === "/hello");
    assert.match(await page.locator("#replacement").inputValue(), /name\}!!/);
    await page.locator("#triggers").fill("/formauto");
    await page.locator("#builder-editor").fill("Incomplete {if: time < 12}");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("snipioEditorDraft"))?.values.replacement.includes("Incomplete"));
    await page.locator("#add-shortcut").click();
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraftBackups")).some(draft => draft.values.replacement.includes("Incomplete"))), "switching preserves incomplete drafts");
    await page.locator("#snippet-name").fill("Navigation save"); await page.locator("#triggers").fill("/navsave"); await page.locator("#builder-editor").fill("Saved before switching");
    await page.locator(".snippet-open").filter({ hasText: "Hello" }).click();
    assert.equal((await stored()).shortcuts.find(item => item.name === "Navigation save").replacement, "Saved before switching");
    await page.locator("#builder-editor").fill("Local text edit");
    await page.evaluate(async () => { const data = JSON.parse(localStorage.getItem("quickPhrase")); const item = data.shortcuts.find(item => item.id === "hello"); item.favorite = true; item.tags = ["external"]; await chrome.storage.local.set({ quickPhrase: data }); });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.id === "hello").replacement === "Local text edit");
    assert.equal((await stored()).shortcuts.find(item => item.id === "hello").favorite, true); assert.deepEqual((await stored()).shortcuts.find(item => item.id === "hello").tags, ["external"]);
    await page.locator("#builder-editor").fill("Uncommitted concurrent edit");
    await page.evaluate(async () => { const data = JSON.parse(localStorage.getItem("quickPhrase")); data.shortcuts.find(item => item.id === "hello").replacement = "External text edit"; await chrome.storage.local.set({ quickPhrase: data }); });
    await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("changed in another window"));
    assert.equal((await stored()).shortcuts.find(item => item.id === "hello").replacement, "External text edit");
    assert.equal(await page.locator("#replacement").inputValue(), "Uncommitted concurrent edit");
    await page.reload();
    await page.waitForFunction(() => !document.getElementById("add-shortcut").disabled);
    await page.locator("#recovered-drafts").click();
    await page.locator(".draft-recovery-row").filter({ hasText: "Hello" }).first().getByRole("button", { name: "Open", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("changed in another window"));
    assert.equal((await stored()).shortcuts.find(item => item.id === "hello").replacement, "External text edit", "reloading a stale draft cannot erase the concurrent saved edit");
    // Explicit developer reset cancels a pending NEW snippet and its drafts.
    await page.locator("#add-shortcut").click();
    await page.locator("#triggers").fill("/oldbeforeReset"); await page.locator("#builder-editor").fill("Old text must stay deleted");
    await page.evaluate(async () => { await QuickPhrase.withLibraryLock(async () => { await chrome.storage.local.set({ quickPhrase: { enabled: true, snipioDemosVersion: 1, mode: "immediate", folders: [], shortcuts: [{ id: "fresh", trigger: "/fresh", replacement: "Fresh library" }] }, snipioLibraryResetAt: 1, snipioEditorDraft: null, snipioEditorDraftBackups: [], snipioQuickDraft: null }); }); });
    await page.waitForTimeout(900);
    assert.equal((await stored()).shortcuts.length, 1);
    assert.equal((await stored()).shortcuts[0].id, "fresh");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft"))), null);
    await page.evaluate(async () => { await chrome.storage.local.set({ snipioEditorDraft: null }); });
    await page.goto(url("manager.html"));
    await page.waitForFunction(() => !document.getElementById("add").disabled);
    await page.locator("#add").click(); await page.locator("#snippet-name").fill("Popup automatic"); await page.locator("#trigger").fill("/popupauto"); await page.locator("#replacement").fill("Saved by popup");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.name === "Popup automatic"));
    await page.waitForFunction(() => document.getElementById("quick-save-status").textContent === "Saved");
    assert.equal(await page.locator("#editor").evaluate(el => el.open), true, "autosave keeps the popup form open");
    await page.reload(); await page.waitForFunction(() => !document.getElementById("add").disabled);
    await page.getByRole("button", { name: "Edit /popupauto", exact: true }).click();
    await page.locator("#trigger").fill("/fresh");
    await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("overlaps"));
    await page.reload(); await page.waitForFunction(() => document.getElementById("editor").open);
    assert.equal(await page.locator("#trigger").inputValue(), "/fresh");
    assert.equal(await page.locator("#replacement").inputValue(), "Saved by popup");
    // A popup already open when the library resets must not recreate its draft.
    await page.evaluate(async () => { await QuickPhrase.withLibraryLock(() => chrome.storage.local.set({ quickPhrase: { enabled: true, snipioDemosVersion: 1, mode: "immediate", folders: [], shortcuts: [{ id: "fresh", trigger: "/fresh", replacement: "Fresh library" }] }, snipioLibraryResetAt: 2, snipioEditorDraft: null, snipioEditorDraftBackups: [], snipioQuickDraft: null })); });
    await page.waitForTimeout(900);
    assert.equal((await stored()).shortcuts.length, 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("snipioQuickDraft"))), null);
    await page.locator("#add").click(); await page.locator("#snippet-name").fill("Popup automatic"); await page.locator("#trigger").fill("/popupauto"); await page.locator("#replacement").fill("Saved by popup");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.name === "Popup automatic"));
    await page.locator("#trigger").fill("/popupauto"); await page.locator("#replacement").fill("Advanced {date}");
    await page.waitForFunction(() => window.openedEditor > 0);
    const handoff = await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft")));
    assert.equal(handoff.values.replacement, "Advanced {date}");
    assert.equal(handoff.editingId, (await stored()).shortcuts.find(item => item.name === "Popup automatic").id);
    assert.deepEqual(errors, []);
    console.log("Dashboard and popup autosave passed: persistence, caret, stable IDs, invalid drafts, navigation, metadata merging, concurrent conflicts, and advanced handoff.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
