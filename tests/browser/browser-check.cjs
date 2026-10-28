// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, artifactFile } = require("../helpers.cjs");
// Local UI checks. Pass a Playwright module path and Chromium executable path.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage({ viewport: { width: 384, height: 260 } });
    page.setDefaultTimeout(8000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const listeners = []; window.openedEditor = 0;
      window.chrome = {
        runtime: { async openOptionsPage() { window.openedEditor++; }, async sendMessage() { return { ok: true }; } },
        storage: { onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
          async get(keys) {
            if (typeof keys === "string") return { [keys]: JSON.parse(localStorage.getItem(keys) || "null") };
            return Object.fromEntries((keys || Object.keys(localStorage)).map(key => [key, JSON.parse(localStorage.getItem(key) || "null")]));
          },
          async set(values) {
            const changes = {};
            for (const [key, newValue] of Object.entries(values)) {
              const oldValue = JSON.parse(localStorage.getItem(key) || "null");
              localStorage.setItem(key, JSON.stringify(newValue)); changes[key] = { newValue, oldValue };
            }
            listeners.forEach(fn => fn(changes, "local"));
          },
          async remove(key) { const oldValue = JSON.parse(localStorage.getItem(key) || "null"); localStorage.removeItem(key); listeners.forEach(fn => fn({[key]: {oldValue}}, "local")); }
        }}
      };
    });
    const popupUrl = pathToFileURL(runtimeFile("manager.html")).href;
    await page.goto(popupUrl);
    await page.waitForFunction(() => !document.getElementById("add").disabled);
    // The popup must request its full height even when the browser starts it small.
    assert.equal(await page.locator("main").evaluate(el => el.getBoundingClientRect().height), 600);
    await page.setViewportSize({ width: 384, height: 600 });
    assert.deepEqual(errors, []);
    assert.equal(await page.locator("#mode, #load-examples, #remove-examples, #share-folder, #import-open, #rich-playground, .example-badge").count(), 0);
    const seeded = await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")));
    assert.equal(seeded.mode, "immediate"); assert.equal(seeded.snipioDemosVersion, 1);
    assert.equal(seeded.shortcuts.length, require(runtimeFile("examples.js")).length);
    const dateRow = page.locator(".shortcut").filter({has:page.getByRole("button", {name:"Preview .date",exact:true})});
    assert.equal(await dateRow.locator('.snippet-block[data-type="date"] .block-icon svg').count(), 1);
    assert.doesNotMatch(await dateRow.locator(".snippet-text").textContent(), /\{date\}/);
    const practice = page.locator("#playground"); await practice.pressSequentially(".hello");
    assert.equal(await practice.inputValue(), "Hello, how are you?");
    await page.getByRole("button", { name: "Favorite .hello", exact: true }).click();
    await page.locator("#favorites").click();
    assert.equal(await page.locator(".shortcut").count(), 1);
    await page.reload(); await page.waitForFunction(() => !document.getElementById("add").disabled);
    assert.equal(await page.getByRole("button", { name: "Unfavorite .hello", exact: true }).getAttribute("aria-pressed"), "true");

    await page.locator("#add").click();
    await page.locator("#trigger").fill(".hellothere");
    await page.locator("#replacement").fill("Unreachable behind .hello");
    await page.getByRole("button", { name: "Save snippet", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("overlaps"));
    assert.match(await page.locator("#form-error").textContent(), /overlaps/);
    await page.locator("#cancel").click();
    await page.getByRole("button", {name:"Edit .hello",exact:true}).click();
    await page.evaluate(async () => {
      const settings = JSON.parse(localStorage.getItem("quickPhrase"));
      settings.shortcuts.find(item => item.trigger === ".hello").tags = ["updated elsewhere"];
      settings.shortcuts.find(item => item.trigger === ".hello").description = "Updated in dashboard";
      settings.shortcuts.find(item => item.trigger === ".hello").favorite = false;
      await chrome.storage.local.set({quickPhrase: settings});
    });
    await page.locator("#replacement").fill("Hello, how are you?");
    await page.getByRole("button", {name:"Save snippet",exact:true}).click();
    await page.waitForFunction(() => !document.getElementById("editor").open);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.trigger === ".hello").tags), ["updated elsewhere"]);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.find(item => item.trigger === ".hello").favorite), false);

    page.once("dialog", dialog => dialog.accept("Work"));
    await page.locator("#folder-add").click();
    await page.waitForFunction(() => document.getElementById("folder-filter").selectedOptions[0].textContent === "Work");
    await page.locator("#add").click();
    await page.locator("#snippet-name").fill("Quick signature");
    await page.locator("#trigger").fill(";sig\n;Sig");
    await page.locator("#replacement").fill("Kind regards,\nAlex");
    await page.getByRole("button", { name: "Save snippet", exact: true }).click();
    await page.waitForFunction(() => !document.getElementById("editor").open);
    await practice.fill(""); await practice.pressSequentially(";sig");
    assert.equal(await practice.inputValue(), "Kind regards,\nAlex");
    await page.getByRole("button", { name: "Edit ;sig", exact: true }).click();
    await page.locator("#replacement").fill("Best wishes,\nAlex");
    await page.getByRole("button", { name: "Save snippet", exact: true }).click();
    await page.waitForFunction(() => !document.getElementById("editor").open);
    await page.getByRole("button", { name: "Preview ;sig", exact: true }).click();
    assert.equal(await page.locator("#preview-content").textContent(), "Best wishes,\nAlex");
    await page.locator("#preview-close").click();
    await page.locator("#search").fill("signature");
    assert.equal(await page.locator(".shortcut").count(), 1);
    await page.locator("#search").fill("");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete ;sig", exact: true }).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.trigger === ";sig"));

    await page.locator("#folder-filter").selectOption("*");
    await page.getByRole("button", { name: "Preview .greet", exact: true }).click();
    assert.equal(await page.locator('#preview-content .snippet-block[data-type="form"]').count(), 1);
    assert.doesNotMatch(await page.locator("#preview-content").textContent(), /\{form:/);
    await page.locator("#preview-edit").click();
    await page.waitForFunction(() => window.openedEditor === 1);
    let draft = await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft")));
    assert.equal(draft.values.replacement, "Hi {form: name}, thank you for getting in touch!");
    assert.ok(draft.editingId);
    assert.equal(await page.locator("#editor").evaluate(el => el.open), false);

    await page.locator("#add").click();
    await page.locator("#snippet-name").fill("My long draft");
    await page.locator("#trigger").fill(";long\n;Long");
    const longText = "A long draft with all of its text intact. ".repeat(9);
    await page.locator("#replacement").fill(longText);
    await page.waitForFunction(() => window.openedEditor === 2);
    draft = await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft")));
    assert.equal(draft.editingId, null); assert.equal(draft.values.replacement, longText);
    assert.equal(draft.values.name, "My long draft"); assert.equal(draft.values.triggers, ";long\n;Long");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts.some(item => item.trigger === ";long")), false);

    await page.locator("#add").click();
    await page.locator("#trigger").fill(";form");
    await page.locator("#replacement").fill("Hello {form: person}");
    await page.waitForFunction(() => window.openedEditor === 3);
    draft = await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft")));
    assert.equal(draft.values.replacement, "Hello {form: person}");

    await page.locator("#add").click();
    await page.locator("#trigger").fill(";lines");
    await page.locator("#replacement").fill("1\n2\n3\n4\n5");
    await page.waitForFunction(() => window.openedEditor === 4);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft")))).values.replacement, "1\n2\n3\n4\n5");
    await page.locator("#open-page").click();
    assert.equal(await page.evaluate(() => window.openedEditor), 5);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem("snipioEditorDraft")))).values.replacement, "1\n2\n3\n4\n5", "opening dashboard preserves existing draft");

    await page.reload(); await page.waitForFunction(() => !document.getElementById("add").disabled);
    await page.screenshot({path: artifactFile("snipio-popup-short.png"), animations:"disabled"});
    const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.querySelector("main").getBoundingClientRect().height, footer: document.querySelector("footer").getBoundingClientRect().bottom }));
    assert.ok(layout.width <= 384 && layout.height === 600 && layout.footer <= 600, JSON.stringify(layout));
    await page.screenshot({path:artifactFile("snipio-popup.png"),animations:"disabled"});
    await page.emulateMedia({reducedMotion:"reduce"});
    assert.equal(await page.locator(".logo").evaluate(el=>getComputedStyle(el).animationName),"none");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.locator("#add").click(); await page.screenshot({path:artifactFile("snipio-quick-editor.png")}); await page.locator("#cancel").click();
    assert.deepEqual(errors, []);
    console.log("PASS popup: immediate expansion, seeding once, simple create/edit/delete, search, folders, favorite persistence, preview, and lossless advanced/long/multiline draft handoff.");
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
