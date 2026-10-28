// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, artifactFile } = require("../helpers.cjs");
// Engine regressions in the real popup practice field and a local rich fixture.
// No production sites, messages or user profiles are opened.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 600 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const listeners = [];
      if (!localStorage.quickPhrase) localStorage.quickPhrase = JSON.stringify({ shortcuts: [], snipioDemosVersion: 1 });
      window.clipboardResult = { ok: true, text: "copied {date}" };
      window.chrome = {
        runtime: { openOptionsPage() {}, async sendMessage(message) {
          if (message.type === "rain:clipboard") {
            window.clipboardPending = true;
            if (window.delayClipboard) await new Promise(resolve => { window.finishClipboard = resolve; });
            window.clipboardPending = false;
            return window.clipboardResult;
          }
          if (message.type === "rain:reset-stats") await chrome.storage.local.set({ rainStats: { entries: [] } });
          return { ok: true };
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
    await page.waitForFunction(() => !document.getElementById("add").disabled && window.__quickPhraseInstance);
    const field = page.locator("#playground");
    async function snippets(shortcuts) {
      await page.evaluate(async shortcuts => {
        await chrome.storage.local.set({ quickPhrase: QuickPhrase.normalize({ shortcuts, snipioDemosVersion: 1 }) });
        await window.__quickPhraseInstance.refresh();
      }, shortcuts);
    }
    async function type(trigger, target = field) { await target.fill(""); await target.pressSequentially(trigger); }
    async function value(expected) { await page.waitForFunction(expected => document.getElementById("playground").value === expected, expected); }
    async function richText(expected) { await page.waitForFunction(expected => document.getElementById("rich").textContent === expected, expected); }

    await snippets([{ trigger: "/v", replacement: "{date} {time} {cursor}{clipboard}!" }]);
    await type("/v");
    await page.waitForFunction(() => document.getElementById("playground").value.endsWith("copied {date}!"));
    assert.ok((await field.inputValue()).startsWith(await page.evaluate(() => new Date().toLocaleDateString())));
    assert.equal(await field.evaluate(el => el.selectionStart), (await field.inputValue()).indexOf("copied"));
    await page.evaluate(() => { window.delayClipboard = true; });
    await type("/v");
    await page.waitForFunction(() => typeof window.finishClipboard === "function");
    await field.pressSequentially("x");
    await page.evaluate(() => { window.finishClipboard(); window.delayClipboard = false; });
    await page.waitForFunction(() => !window.clipboardPending);
    assert.equal(await field.inputValue(), "/vx", "stale clipboard reads must not change a draft");
    await page.evaluate(() => { window.clipboardResult = { ok: false }; });
    await type("/v");
    const clipboardError = page.getByRole("alert").filter({ hasText: "Clipboard unavailable" });
    await clipboardError.waitFor();
    assert.equal(await field.inputValue(), "/v");
    await clipboardError.evaluate(el => el.remove());
    await page.evaluate(() => {
      const rich = document.createElement("div"); rich.id = "rich"; rich.contentEditable = "true";
      rich.setAttribute("aria-label", "Local rich text fixture");
      rich.style.cssText = "min-height:60px;flex-shrink:0;padding:8px;background:white;border:1px solid #ddd";
      document.querySelector("main").append(rich);
    });
    const rich = page.locator("#rich");
    await snippets([{ trigger: "/v", replacement: "A{cursor}👩‍💻é" }]);
    await type("/v", rich); await richText("A👩‍💻é");
    await rich.pressSequentially("!"); assert.equal(await rich.textContent(), "A!👩‍💻é");
    console.log("PASS variables: date/time, literal clipboard, stale/failure handling and Unicode caret");

    await snippets([{ trigger: "/f", replacement: "Hi {form: name} at {form: company}, {form:name}!{cursor}" }]);
    await type("/f");
    const form = page.getByRole("dialog", { name: "Fill in snippet" });
    await form.waitFor(); assert.equal(await form.locator("input").count(), 2);
    assert.equal(await field.inputValue(), "/f");
    await form.getByLabel("name", { exact: true }).click();
    await page.keyboard.type("Ada");
    assert.equal(await form.getByLabel("name", { exact: true }).inputValue(), "Ada");
    await form.getByLabel("company").click();
    await page.keyboard.type("Snipio");
    await form.getByLabel("company").press("Enter"); await value("Hi Ada at Snipio, Ada!");
    await type("/f"); await form.getByLabel("name", { exact: true }).press("Escape");
    await form.waitFor({ state: "hidden" }); assert.equal(await field.inputValue(), "/f");
    console.log("PASS forms: deduplicated fields, Enter submission and Escape preservation");

    // Site-wide shortcut handlers often ignore native inputs. Events from a
    // shadow input reach those handlers with the host as their target instead.
    await page.evaluate(() => {
      window.siteShortcuts = event => {
        if (!event.target.matches('input, textarea, [contenteditable="true"]')) event.preventDefault();
      };
      document.addEventListener("keydown", window.siteShortcuts);
      window.siteFocus = event => {
        if (!event.target.matches("input, textarea, button")) document.getElementById("playground").focus();
      };
      document.addEventListener("click", window.siteFocus);
    });
    await type("/f");
    await form.getByLabel("name", { exact: true }).click();
    await page.keyboard.type("Ada");
    assert.equal(await form.getByLabel("name", { exact: true }).inputValue(), "Ada", "site keyboard shortcuts must not block fill-in typing");
    await page.keyboard.press("Tab"); await page.keyboard.type("Snipio");
    await form.getByRole("button", { name: "Insert", exact: true }).click();
    await value("Hi Ada at Snipio, Ada!");
    await page.evaluate(() => {
      document.removeEventListener("keydown", window.siteShortcuts);
      document.removeEventListener("click", window.siteFocus);
    });
    console.log("PASS fill-in typing: native clicks, keyboard input, Tab and Insert with site shortcut/focus handlers");

    const source = '<b>Hello {cursor}</b><i>friend</i> <a href="https://example.com" onclick="alert(1)">link</a><script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">bad</a>';
    await snippets([{ trigger: "/h", format: "html", replacement: source }]);
    await type("/h"); await value("Hello friend linkbad");
    assert.equal(await field.evaluate(el => el.selectionStart), 6);
    await type("/h", rich); await richText("Hello friend linkbad");
    assert.equal(await rich.locator("b, strong").count(), 1);
    assert.equal(await rich.locator("i, em").count(), 1);
    assert.equal(await rich.locator('a[href="https://example.com/"]').count(), 1);
    assert.equal(await rich.locator("script, img, [onclick], [onerror], a[href^='javascript:']").count(), 0);
    await rich.pressSequentially("!"); assert.equal(await rich.textContent(), "Hello !friend linkbad");
    await snippets([{ trigger: "/h", format: "html", replacement: "<ul><li>One</li><li>Two</li></ul>" }]);
    await type("/h"); await value("One\nTwo");
    await snippets([{ trigger: "/h", format: "html", replacement: "<b>{form: name}</b>" }]);
    await type("/h", rich);
    const literal = '<img src=x onerror="alert(1)">';
    await form.getByLabel("name", { exact: true }).fill(literal);
    await form.getByLabel("name", { exact: true }).press("Enter"); await richText(literal);
    assert.equal(await rich.locator("img").count(), 0, "form values stay literal text");
    console.log("PASS rich text: safe formatting, links, list fallback, cursor and literal form values");

    await snippets([{ trigger: "/u", replacement: "Before {cursor}after" }]);
    await type("/u"); await value("Before after"); await field.press("Backspace"); await value("/u");
    await type("/u"); await value("Before after");
    await field.pressSequentially("x"); await field.press("Backspace"); await value("Before after");
    await snippets([{ trigger: "/u", format: "html", replacement: "<b>Bold</b><i>Italic</i>" }]);
    // Reset formatting left by the previous rich fixture, so the original
    // shortcut has no formatting to restore.
    await rich.evaluate(el => { el.replaceChildren(); el.focus(); });
    await type("/u", rich); await richText("BoldItalic");
    await rich.press("Backspace"); await richText("/u");
    assert.equal(await rich.locator("b,i").count(), 0);
    console.log("PASS undo: exact shortcut restoration, rich formatting and typing cancellation");

    await snippets([{ trigger: "/logic", replacement: '{if: form.company == "Snipio"}Hello team {form: name}{else}Welcome {form: name}{endif}' }]);
    await type("/logic");
    await form.getByLabel("company").fill("Snipio"); await form.getByLabel("name", { exact: true }).fill("Ada");
    await form.getByLabel("name", { exact: true }).press("Enter"); await value("Hello team Ada");
    await snippets([{ trigger: "/logic", format: "html", replacement: '{if: time &lt; 24}<b>Today</b>{else}<i>Never</i>{endif}' }]);
    await type("/logic", rich); await richText("Today"); assert.equal(await rich.locator("b").textContent(), "Today");
    await snippets([{ trigger: "/bad", replacement: "{if: time < 12}Missing end" }]);
    await type("/bad");
    await page.getByRole("alert").filter({ hasText: /Missing.*endif/u }).waitFor();
    assert.equal(await field.inputValue(), "/bad", "invalid externally changed templates preserve the shortcut");
    console.log("PASS logic: form comparisons, rich branches and invalid-template preservation");

    await page.evaluate(() => chrome.storage.local.set({ rainStats: { entries: [{ id: "old", count: 7, saved: 100 }, { id: "other", count: 2, saved: 3 }] } }));
    await page.goto(pathToFileURL(runtimeFile("stats.html")).href);
    await page.waitForFunction(() => document.getElementById("total-uses").textContent === "9");
    assert.equal(await page.locator("#total-saved").textContent(), "103");
    assert.equal(await page.locator("#stats-list tr").count(), 2);
    assert.equal(await page.locator("#stats-list tr").first().locator("td").nth(1).textContent(), "7");
    assert.equal(await page.locator("#stats-list tr").first().locator("td").first().textContent(), "Deleted snippet");
    await page.screenshot({ path: artifactFile("snipio-stats.png"), fullPage: true });
    page.once("dialog", dialog => dialog.accept()); await page.locator("#reset-stats").click();
    await page.waitForFunction(() => document.getElementById("total-uses").textContent === "0");
    assert.equal(await page.locator("#stats-empty").isVisible(), true);
    assert.deepEqual(errors, []);
    console.log("PASS stats: totals, sorting, deleted history and reset");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
