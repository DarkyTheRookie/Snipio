// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, artifactFile } = require("../helpers.cjs");
// Isolated dashboard regressions with mock extension storage; no user data.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const listeners = [];
      if (!localStorage.getItem("quickPhrase")) localStorage.setItem("quickPhrase", JSON.stringify({ enabled: true, snipioDemosVersion: 1, mode: "immediate", folders: [{ id: "work", name: "Work" }], shortcuts: [{ id: "greeting", trigger: "/hello", triggers: ["/hello"], name: "Quick hello", replacement: "Hello there!", tags: ["hello"], folderId: "work" }] }));
      window.chrome = {
        runtime: { async sendMessage() { return { ok: true }; } },
        storage: {
          onChanged: { addListener(fn) { listeners.push(fn); } },
          local: {
            async get(key) { return Object.fromEntries((Array.isArray(key) ? key : [key]).map(name => [name, JSON.parse(localStorage.getItem(name) || "null")])); },
            async set(values) {
              for (const [key, newValue] of Object.entries(values)) {
                localStorage.setItem(key, JSON.stringify(newValue));
                listeners.forEach(fn => fn({ [key]: { newValue } }, "local"));
              }
            }
          }
        }
      };
    });
    const url = pathToFileURL(runtimeFile("editor.html")).href;
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById("save-shortcut").disabled);
    assert.equal(await page.locator("#editor-empty").isVisible(), true);
    await page.locator(".snippet-open").filter({ hasText: "Quick hello" }).click();
    assert.equal(await page.locator("#snippet-name").inputValue(), "Quick hello");
    assert.equal(await page.locator(".brand img").evaluate(el => el.complete && el.naturalWidth > 0), true);
    assert.equal(await page.locator("#preview-output").textContent(), "Hello there!");
    assert.equal(await page.locator("#snippet-tags, #snippet-description").count(), 0);
    await page.locator("#add-shortcut").click();
    await page.locator("#snippet-name").fill("Welcome form");
    await page.locator("#triggers").fill("/welcome\n;welcome");
    await page.locator("#builder-editor").fill("Hi , welcome!");
    await page.locator("#builder-editor").evaluate(el => { const r=document.createRange();r.setStart(el.firstChild,3);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event("selectionchange")); });
    await page.locator("#field-name").fill("first name");
    await page.locator("#add-field").click();
    assert.equal(await page.locator("#replacement").inputValue(), "Hi {form: first name}, welcome!");
    await page.locator('[data-field="first name"]').fill("Ada");
    assert.equal(await page.locator("#preview-output").textContent(), "Hi Ada, welcome!");
    // The preview must use current content after reusing the same field name.
    await page.locator("#builder-editor").fill("Dear {form: first name}!");
    await page.locator('[data-field="first name"]').fill("Grace");
    assert.equal(await page.locator("#preview-output").textContent(), "Dear Grace!");
    await page.locator("#favorite-toggle").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("snipioEditorDraft"))?.values.favorite === true);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById("save-shortcut").disabled);
    await page.locator("#recovered-drafts").click();
    await page.locator(".draft-recovery-row").filter({ hasText: "Welcome form" }).first().getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await page.locator("#replacement").inputValue(), "Dear {form: first name}!");
    assert.equal(await page.locator("#favorite-toggle").getAttribute("aria-pressed"), "true");
    await page.locator("#save-shortcut").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.name === "Welcome form"));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("snipioEditorDraft")) === null);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.name === "Welcome form"));
    assert.equal(saved.favorite, true); assert.deepEqual(saved.triggers, ["/welcome", ";welcome"]);
    // A clean selected shortcut reflects popup changes without reloading.
    await page.evaluate(async () => {
      const settings = JSON.parse(localStorage.getItem("quickPhrase"));
      const item = settings.shortcuts.find(item => item.name === "Welcome form");
      Object.assign(item, { description: "Updated in popup", tags: ["customer"], folderId: "work", replacement: "Dear {form: first name}, welcome!" });
      await chrome.storage.local.set({ quickPhrase: settings });
    });
    await page.waitForFunction(() => document.getElementById("replacement").value === "Dear {form: first name}, welcome!");
    assert.equal(await page.locator("#snippet-folder").inputValue(), "work");
    assert.equal(await page.locator("#replacement").inputValue(), "Dear {form: first name}, welcome!");
    await page.locator("#favorites-filter").click();
    assert.equal(await page.locator(".snippet-row").count(), 1);
    await page.locator("#all-filter").click();
    await page.locator("#search").fill("hello");
    assert.equal(await page.locator(".snippet-row").count(), 1);
    await page.locator("#search").fill("");
    // Folder management keeps snippets, metadata, and the open editor in sync.
    await page.locator("#add-folder").click();
    await page.locator("#folder-name").fill("Projects");
    await page.locator("#folder-form").getByRole("button", { name: "Save folder" }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).folders.some(folder => folder.name === "Projects"));
    const folderId = await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).folders.find(folder => folder.name === "Projects").id);
    await page.locator("#snippet-folder").selectOption(folderId);
    await page.locator("#save-shortcut").click();
    await page.waitForFunction(id => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.name === "Welcome form").folderId === id, folderId);
    await page.locator(".folder-row").filter({ hasText: "Projects" }).hover();
    await page.getByRole("button", { name: "Rename folder Projects", exact: true }).click();
    await page.locator("#folder-name").fill("Client projects");
    await page.locator("#folder-form").getByRole("button", { name: "Save folder" }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).folders.some(folder => folder.name === "Client projects"));
    await page.locator(".folder-row").filter({ hasText: "Client projects" }).hover();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete folder Client projects", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.name === "Welcome form").folderId === null);
    assert.equal(await page.locator("#snippet-folder").inputValue(), "");
    assert.equal(await page.locator("#snippet-name").inputValue(), "Welcome form");
    await page.locator("#triggers").fill("/hello");
    await page.locator("#save-shortcut").click();
    await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("overlaps"));
    await page.locator("#triggers").fill("/hello-there");
    await page.locator("#save-shortcut").click();
    await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("overlaps"));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.trigger === "/hello-there")), false);
    await page.locator("#triggers").fill("/welcome\n;welcome");
    // Build a conditional with controls and verify the safe parser agrees.
    await page.locator("#builder-editor").fill("");
    await page.locator("#condition-source").selectOption("form");
    await page.locator("#condition-field").fill("company");
    await page.locator("#condition-value").fill("Snipio");
    await page.locator("#condition-yes").fill("Hello team");
    await page.locator("#condition-no").fill("Hello friend");
    await page.locator("#add-condition").click();
    assert.equal(await page.locator("#replacement").inputValue(), '{if: form.company == "Snipio"}Hello team{else}Hello friend{endif}');
    await page.locator('[data-field="company"]').fill("Snipio");
    assert.equal(await page.locator("#preview-output").textContent(), "Hello team");
    await page.locator('[data-field="company"]').fill("Elsewhere");
    assert.equal(await page.locator("#preview-output").textContent(), "Hello friend");
    // A new handoff preserves an existing unsaved dashboard draft in recovery.
    // Keep it incomplete so autosave cannot clear it before the handoff arrives.
    await page.locator("#builder-editor").fill('{if: form.company == "Snipio"}Hello team{else}Hello friend{endif} {form:');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("snipioEditorDraft"))?.values.replacement.includes("form.company"));
    await page.evaluate(async () => chrome.storage.local.set({ snipioEditorDraft: { editingId: null, values: { name: "From popup", description: "kept", triggers: "/popup", replacement: "Long text from popup ".repeat(30), format: "text", tags: "popup", folderId: "work", favorite: false }, token: "popup-new-token", updatedAt: Date.now() } }));
    await page.locator("#handoff-notice").waitFor({ state: "visible" });
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraftBackups")).some(draft => draft.token === "popup-new-token")), "incoming handoff must survive an older queued autosave and reload");
    await page.locator("#open-handoff").click();
    assert.equal(await page.locator("#snippet-name").inputValue(), "From popup");
    assert.equal(await page.locator("#snippet-description").count(), 0);
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraftBackups")).some(draft => draft.values.replacement.includes("form.company"))));
    await page.locator("#discard").click();
    await page.locator("#add-shortcut").click();
    await page.locator("#snippet-name").fill("Rich card"); await page.locator("#triggers").fill("/richcard");
    await page.locator("#rich-mode").click();
    await page.locator("#builder-editor").fill("Nice to meet you ");
    await page.locator("#builder-editor").press("End");
    await page.locator("#tool-cursor").click();
    assert.equal(await page.locator('#builder-editor .snippet-block[data-type="cursor"]').count(), 1);
    assert.doesNotMatch(await page.locator("#builder-editor").textContent(), /\{cursor\}/);
    await page.locator("#builder-editor").evaluate(el => { el.innerHTML = '<p><b>Welcome</b> {form: name}</p><script>alert(1)</script><img src=x onerror=alert(2)>'; el.dispatchEvent(new InputEvent("input", { bubbles: true })); });
    await page.locator("#save-shortcut").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.name === "Rich card"));
    const rich = await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.name === "Rich card"));
    assert.equal(rich.format, "html"); assert.equal(rich.replacement, "<p><b>Welcome</b> {form: name}</p>");
    // Exercise actual drop coordinates on the text surface.
    await page.locator("#add-shortcut").click();
    await page.locator("#builder-editor").fill("hello world");
    const point = await page.locator("#builder-editor").evaluate(el => {const r=document.createRange();r.setStart(el.firstChild,6);r.collapse(true);const b=r.getBoundingClientRect();return {x:b.x,y:b.y+b.height/2};});
    await page.locator("#builder-editor").dispatchEvent("drop", { clientX: point.x, clientY: point.y, dataTransfer: await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData("application/x-snipio-tool", "{date}"); return data; }) });
    assert.equal(await page.locator("#replacement").inputValue(), "hello {date}world");
    await page.locator("#discard").click();
    await page.locator("#search").fill("");
    await page.locator('.snippet-open').filter({ hasText: "Welcome form" }).click();
    await page.evaluate(() => { document.querySelector(".tools-sidebar").scrollTop = 0; window.scrollTo(0, 0); });
    await page.screenshot({ path: artifactFile("snipio-dashboard.png"), fullPage: true, animations: "disabled" });
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `dashboard overflow at ${width}px`);
    }
    await page.screenshot({ path: artifactFile("snipio-dashboard-mobile.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS dashboard: draft reload and handoff recovery, duplicate/prefix validation, clean external field sync, favorites/search, folder create/rename/move/delete, form preview, safe condition builder, rich sanitization, cursor tool, drop position, responsive layout; no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
