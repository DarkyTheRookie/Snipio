// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    for (const dashboard of [true, false]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        const listeners = [];
        if (!localStorage.quickPhrase) localStorage.quickPhrase = JSON.stringify({ snipioDemosVersion: 1, shortcuts: [
          { id: "one", name: "Greeting", trigger: ".hello", replacement: "Hello" },
          { id: "two", name: "Other", trigger: ".other", replacement: "Other" }
        ] });
        window.chrome = { runtime: { async sendMessage() { return { ok: true }; } }, storage: {
          onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
            async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, JSON.parse(localStorage.getItem(key) || "null")])); },
            async set(values) {
              const changes = {};
              for (const [key, newValue] of Object.entries(values)) { localStorage.setItem(key, JSON.stringify(newValue)); changes[key] = { newValue }; }
              listeners.forEach(fn => fn(changes, "local"));
            }
          }
        } };
      });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(7000); page.on("pageerror", error => errors.push(error.message));
      await page.goto(pathToFileURL(runtimeFile(dashboard ? "editor.html" : "manager.html")).href);
      const add = page.locator(dashboard ? "#add-shortcut" : "#add");
      await page.waitForFunction(id => !document.getElementById(id).disabled, dashboard ? "add-shortcut" : "add");
      await add.click();
      const name = page.locator("#snippet-name"), warning = page.locator("#snippet-name-error");
      const save = page.locator(dashboard ? "#save-shortcut" : '#shortcut-form [type="submit"]');
      const body = page.locator(dashboard ? "#builder-editor" : "#replacement");
      const stored = () => page.evaluate(() => JSON.parse(localStorage.quickPhrase));
      const trigger = page.locator(dashboard ? "#triggers" : "#trigger");
      // A higher-priority duplicate must replace an earlier empty-body error,
      // and shortcut conflicts must be reported before asking for body text.
      await trigger.fill(".new");
      await page.waitForFunction(() => /Write the text|Enter the phrase/u.test(document.getElementById("form-error").textContent));
      await name.fill(" greeting ");
      assert.match(await warning.textContent(), /already exists/);
      assert.equal(await page.locator("#form-error").textContent(), "", "duplicate name takes priority over a previous empty-body message");
      await page.waitForTimeout(800);
      assert.equal(await page.locator("#form-error").textContent(), "", "empty-body validation cannot overwrite the duplicate-name warning");
      assert.equal((await stored()).shortcuts.length, 2);
      await name.fill("");
      await trigger.fill(".hello");
      await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("overlaps"));
      assert.equal(dashboard ? await body.textContent() : await body.inputValue(), "", "shortcut conflicts are detected while the snippet body is empty");
      await trigger.fill(".new");
      await name.fill(" greeting ");
      await page.locator(dashboard ? "#triggers" : "#trigger").fill(".new");
      await body.fill("New body");
      assert.match(await warning.textContent(), /already exists/);
      const nameErrorBox = await warning.boundingBox(), nameBox = await name.boundingBox();
      assert.ok(nameErrorBox.y + nameErrorBox.height <= nameBox.y, "duplicate-name warning appears above the name field");
      assert.equal(await name.getAttribute("aria-invalid"), "true");
      assert.equal(await save.isDisabled(), true);
      await page.waitForTimeout(850);
      assert.equal((await stored()).shortcuts.length, 2, "duplicate name cannot autosave");
      // Exercise the save guard even when invoked without clicking the button.
      await page.locator("#shortcut-form").evaluate(form => form.requestSubmit());
      if (dashboard) await name.press("Control+s");
      await page.waitForTimeout(150);
      assert.equal((await stored()).shortcuts.length, 2, "duplicate name cannot save manually");
      await name.fill("Unique");
      await page.waitForFunction(() => JSON.parse(localStorage.quickPhrase).shortcuts.some(item => item.name === "Unique"));
      assert.equal(await warning.textContent(), "");
      const newId = (await stored()).shortcuts.find(item => item.name === "Unique").id;
      await name.fill(" UNIQUE "); await body.fill("Updated own snippet");
      await page.waitForFunction(id => JSON.parse(localStorage.quickPhrase).shortcuts.find(item => item.id === id)?.replacement === "Updated own snippet", newId);
      assert.equal(await save.isDisabled(), false, "self edits remain saveable");
      await name.fill("Other"); await body.fill("Must stay unsaved");
      await page.waitForTimeout(850);
      assert.equal((await stored()).shortcuts.find(item => item.id === newId).replacement, "Updated own snippet", "duplicate rename cannot autosave other edits");
      // Simulate another window's write arriving before its storage notification.
      await name.fill("Race");
      await page.evaluate(() => {
        const data = JSON.parse(localStorage.quickPhrase);
        data.shortcuts.push({ id: "race", name: "Race", trigger: ".race", replacement: "External" });
        localStorage.quickPhrase = JSON.stringify(data);
      });
      await page.locator("#shortcut-form").evaluate(form => form.requestSubmit());
      await page.waitForFunction(() => document.getElementById("snippet-name-error").textContent.includes("already exists"));
      assert.equal((await stored()).shortcuts.filter(item => item.name === "Race").length, 1, "save rechecks names against latest storage");
      await name.fill("");
      await page.waitForFunction(id => JSON.parse(localStorage.quickPhrase).shortcuts.find(item => item.id === id)?.name === "", newId);
      assert.equal(await warning.textContent(), "", "optional empty names remain supported");
      await page.locator(dashboard ? "#triggers" : "#trigger").fill(".hello");
      await page.waitForFunction(() => document.getElementById("form-error").textContent.includes("overlaps"));
      const conflictBox = await page.locator("#form-error").boundingBox(), fieldBox = await name.boundingBox();
      assert.ok(conflictBox.y + conflictBox.height <= fieldBox.y, "shortcut-conflict warning appears at the top, above the name field");
      assert.equal((await stored()).shortcuts.find(item => item.id === newId).trigger, ".new", "conflicting shortcut stays unsaved");
      assert.deepEqual(errors, []);
      console.log(`PASS ${dashboard ? "dashboard" : "popup"}: duplicate-name and shortcut-conflict warnings at the top, save guards, self edits, correction, latest-storage conflicts and optional names`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
