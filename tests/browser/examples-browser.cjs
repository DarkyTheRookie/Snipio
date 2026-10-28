// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, artifactFile } = require("../helpers.cjs");
// Automatic demo seeding and ordinary snippet behavior in the real popup.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const demos = require(runtimeFile("examples.js"));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 600 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const listeners = [];
      window.chrome = {
        runtime: { openOptionsPage() {}, async sendMessage(message) {
          return message.type === "rain:clipboard" ? { ok: true, text: "copied {date}" } : { ok: true };
        } },
        storage: { onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
          async get(key) { return Object.fromEntries((Array.isArray(key) ? key : [key]).map(name => [name, JSON.parse(localStorage.getItem(name) || "null")])); },
          async set(values) { for (const [key, newValue] of Object.entries(values)) {
            const oldValue = JSON.parse(localStorage.getItem(key) || "null");
            localStorage.setItem(key, JSON.stringify(newValue));
            listeners.forEach(fn => fn({ [key]: { oldValue, newValue } }, "local"));
          } }
        } }
      };
    });
    await page.goto(pathToFileURL(runtimeFile("manager.html")).href);
    async function ready() {
      await page.waitForFunction(() => !document.getElementById("add").disabled && window.__quickPhraseInstance);
      await page.evaluate(() => window.__quickPhraseInstance.refresh());
    }
    await ready();
    const read = () => page.evaluate(() => JSON.parse(localStorage.quickPhrase));
    const first = await read();
    assert.equal(first.snipioDemosVersion, 1);
    assert.equal(first.shortcuts.length, demos.length, "one snippet is seeded for each demo");
    assert.equal(new Set(demos.map(item => item.key)).size, demos.length);
    assert.deepEqual(demos.map(item => item.key), ["plain", "date", "time", "cursor", "form", "rich", "time-logic", "aliases", "undo"]);
    for (const demo of demos) {
      const saved = first.shortcuts.find(item => item.triggers.includes(demo.triggers[0]));
      assert.ok(saved, `auto-seeded ${demo.key}`);
      assert.equal(saved.replacement, demo.replacement);
    }
    assert.equal(await page.locator("#load-examples, #remove-examples, .example-badge, #snippet-example").count(), 0);
    await page.reload(); await ready();
    assert.deepEqual((await read()).shortcuts, first.shortcuts, "reload does not duplicate or replace demos");

    const field = page.locator("#playground");
    async function type(trigger) { await field.fill(""); await field.pressSequentially(trigger); }
    async function value(expected) { await page.waitForFunction(expected => document.getElementById("playground").value === expected, expected); }
    await type(".hello"); await value("Hello, how are you?");
    await type(".date"); await value(await page.evaluate(() => new Date().toLocaleDateString()));
    await type(".time"); await page.waitForFunction(() => document.getElementById("playground").value !== ".time");
    assert.ok((await field.inputValue()).length > 0);
    await type(".cursor"); await value("[]");
    assert.equal(await field.evaluate(el => el.selectionStart), 1);
    await field.pressSequentially("!"); await value("[!]");
    await type(".greet");
    const form = page.getByRole("dialog", { name: "Fill in snippet" });
    await form.waitFor();
    assert.equal(await form.locator("input").count(), 1);
    await form.getByLabel("name", { exact: true }).fill("Ada");
    await form.getByLabel("name", { exact: true }).press("Enter"); await value("Hi Ada, thank you for getting in touch!");
    await type(".format"); await page.waitForFunction(() => document.getElementById("playground").value.startsWith("Welcome to Snipio!"));
    await type(".daygreeting"); await value(await page.evaluate(() => new Date().getHours() < 12 ? "Good morning!" : "Good afternoon!"));
    for (const alias of [".thanks", ".welcome"]) { await type(alias); await value("Thanks for stopping by!"); }
    await type(".undo"); await value("Press Backspace now to bring back what you typed.");
    await field.press("Backspace"); await value(".undo");
    for (const query of ["date", ".time", "formatted"]) {
      await page.locator("#search").fill(query); assert.equal(await page.locator(".shortcut").count(), 1);
    }
    await page.locator("#search").fill("");
    console.log("PASS demos: automatic seed, one focused feature each, no labels/loader, expansion and search");

    await page.getByRole("button", { name: "Edit .undo", exact: true }).click();
    await page.locator("#snippet-name").fill("My own reply"); await page.locator("#replacement").fill("Keep this text");
    await page.getByRole("button", { name: "Save snippet", exact: true }).click();
    await page.locator("#editor").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Favorite .undo", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.quickPhrase).shortcuts.find(item => item.trigger === ".undo").favorite);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete .date", exact: true }).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.quickPhrase).shortcuts.some(item => item.trigger === ".date"));
    await page.reload(); await ready();
    const updated = await read();
    assert.equal(updated.shortcuts.length, first.shortcuts.length - 1);
    assert.equal(updated.shortcuts.some(item => item.trigger === ".date"), false, "deleted demos stay deleted");
    const customized = updated.shortcuts.find(item => item.trigger === ".undo");
    assert.equal(customized.name, "My own reply"); assert.equal(customized.replacement, "Keep this text"); assert.equal(customized.favorite, true);
    await page.locator("#favorites").click(); assert.equal(await page.locator(".shortcut").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Unfavorite .undo", exact: true }).count(), 1);
    await page.screenshot({ path: artifactFile("snipio-demos.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS demos: customization, favorites and deletion survive reload without reseeding");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
