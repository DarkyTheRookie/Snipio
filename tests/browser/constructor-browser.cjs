// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile, artifactFile } = require("../helpers.cjs");
// Visual constructor checks run against isolated mock extension storage.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(7000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      const listeners = [];
      if (!localStorage.getItem("quickPhrase")) localStorage.setItem("quickPhrase", JSON.stringify({ enabled: true, mode: "immediate", snipioDemosVersion: 1, folders: [], shortcuts: [{ id: "schedule", trigger: "/schedule", triggers: ["/schedule"], name: "Schedule", replacement: 'Hello {form: name}, today is {date}. {if: time < 12}Morning{else}Afternoon{endif} {cursor}', format: "text", tags: ["legacy"], description: "Keep this old note" }] }));
      window.chrome = { runtime: { async sendMessage() { return { ok: true }; } }, storage: { onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
        async get(key) { return Object.fromEntries((Array.isArray(key) ? key : [key]).map(name => [name, JSON.parse(localStorage.getItem(name) || "null")])); },
        async set(values) { for (const [key, newValue] of Object.entries(values)) { localStorage.setItem(key, JSON.stringify(newValue)); listeners.forEach(fn => fn({ [key]: { newValue } }, "local")); } }
      } } };
    });
    await page.goto(pathToFileURL(runtimeFile("editor.html")).href);
    await page.waitForFunction(() => !document.getElementById("save-shortcut").disabled);
    await page.locator(".snippet-open").filter({ hasText: "Schedule" }).click();
    const builder = page.locator("#builder-editor");
    assert.equal(await page.locator("#snippet-tags, #snippet-description").count(), 0);
    assert.equal(await page.locator("#replacement").isVisible(), false);
    assert.equal(await builder.locator(".snippet-block").count(), 6);
    assert.ok(!(await builder.innerText()).includes("{date}"));
    assert.ok((await builder.innerText()).includes("If Time before noon"));
    assert.equal(await builder.locator('[data-type="date"] svg').innerHTML(), await page.locator("#tool-date .tool-icon svg").innerHTML());
    // Existing fields edit in a small dialog, with repeated names staying semantic.
    await builder.locator('[data-type="form"] .block-label').click();
    await page.locator("#block-field-name").fill("first name");
    await page.locator("#block-form").getByRole("button", { name: "Update block" }).click();
    assert.ok((await page.locator("#replacement").inputValue()).includes("{form: first name}"));
    await page.locator('[data-field="first name"]').fill("Ada");
    assert.ok((await page.locator("#preview-output").textContent()).startsWith("Hello Ada"));
    await builder.locator('[data-type="cursor"] .block-remove').click();
    assert.ok(!(await page.locator("#replacement").inputValue()).includes("{cursor}"));
    // Native Enter produces one line break in plain mode, including blank lines.
    await builder.fill("hello"); await builder.press("End"); await builder.press("Enter");
    assert.equal(await page.locator("#replacement").inputValue(), "hello\n", await builder.innerHTML());
    await builder.pressSequentially("world");
    assert.equal(await page.locator("#replacement").inputValue(), "hello\nworld", await builder.innerHTML());
    await builder.fill("helloworld");
    await builder.evaluate(el => { el.focus(); const range = document.createRange(); range.setStart(el.firstChild, 5); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); });
    await builder.press("Enter");
    assert.equal(await page.locator("#replacement").inputValue(), "hello\nworld", await builder.innerHTML());
    await builder.fill("hello"); await builder.press("End"); await builder.press("Enter"); await builder.press("Enter");
    assert.equal(await page.locator("#replacement").inputValue(), "hello\n\n", await builder.innerHTML());
    // Completed typed templates turn into blocks without moving the caret.
    await builder.fill("Hi {date}!");
    await builder.pressSequentially(" More");
    assert.equal(await page.locator("#replacement").inputValue(), "Hi {date}! More");
    assert.equal(await builder.locator('[data-type="date"]').count(), 1);
    assert.ok(!(await builder.innerText()).includes("{date}"));
    // Tools insert a block at the remembered text caret.
    await builder.evaluate(el => { const range = document.createRange(); range.setStart(el.firstChild, 3); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); el.focus(); });
    await page.locator("#tool-time").click();
    assert.equal(await page.locator("#replacement").inputValue(), "Hi {time}{date}! More");
    // Copy/paste preserves logical tokens instead of copying the visual button labels.
    const copied = await builder.evaluate(el => {
      const range = document.createRange(); range.selectNodeContents(el); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const clipboardData = new DataTransfer(); el.dispatchEvent(new ClipboardEvent("copy", { clipboardData, bubbles: true, cancelable: true }));
      return { text: clipboardData.getData("text/plain"), custom: clipboardData.getData("application/x-snipio-fragment") };
    });
    assert.equal(copied.text, "Hi {time}{date}! More");
    await builder.fill("");
    await builder.evaluate((el, copied) => { const data = new DataTransfer(); data.setData("text/plain", copied.text); data.setData("application/x-snipio-fragment", copied.custom); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); }, copied);
    assert.equal(await builder.locator(".snippet-block").count(), 2);
    assert.equal(await page.locator("#replacement").inputValue(), copied.text);
    // Dragging any condition marker moves the balanced section, including its text.
    await builder.fill('Start {if: time < 12}Morning{else}Afternoon{endif} End {date}');
    await builder.locator('[data-type="condition"]').dragTo(builder, { targetPosition: { x: 350, y: 190 } });
    const moved = await page.locator("#replacement").inputValue();
    assert.equal(await page.evaluate(value => QuickPhrase.validateTemplate(value), moved), "");
    assert.ok(moved.indexOf("{date}") < moved.indexOf("{if:"), moved);
    // A condition edits without changing its branches.
    await builder.locator('[data-type="condition"] .block-label').click();
    await page.locator("#block-condition-value").fill("16");
    await page.locator("#block-form").getByRole("button", { name: "Update block" }).click();
    assert.ok((await page.locator("#replacement").inputValue()).includes("{if: time < 16}Morning{else}Afternoon{endif}"));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("snipioEditorDraft"))?.values.replacement.includes("time < 16"));
    await page.reload(); await page.waitForFunction(() => !document.getElementById("save-shortcut").disabled);
    await page.locator("#recovered-drafts").click();
    await page.locator(".draft-recovery-row").filter({ hasText: "Schedule" }).first().getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await builder.locator('[data-type="condition"]').count(), 1);
    assert.ok(!(await builder.innerText()).includes("{if:"));
    // Removing a condition retains the user's prose and removes its matching markers.
    await builder.locator('[data-type="otherwise"] .block-remove').click();
    assert.equal(await builder.locator('[data-type="condition"], [data-type="otherwise"], [data-type="end"]').count(), 0);
    assert.ok((await page.locator("#replacement").inputValue()).includes("MorningAfternoon"));
    // Hidden legacy metadata changed elsewhere must survive saving a local draft.
    const draftText = await page.locator("#replacement").inputValue();
    await page.evaluate(async () => { const settings = JSON.parse(localStorage.getItem("quickPhrase")); settings.shortcuts[0].tags = ["updated elsewhere"]; settings.shortcuts[0].description = "Latest external note"; await chrome.storage.local.set({ quickPhrase: settings }); });
    assert.equal(await page.locator("#replacement").inputValue(), draftText);
    await page.locator("#save-shortcut").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("snipioEditorDraft")) === null);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts[0]);
    assert.deepEqual(saved.tags, ["updated elsewhere"]); assert.equal(saved.description, "Latest external note");
    assert.ok(saved.replacement.includes("{date}")); assert.ok(!saved.replacement.includes("snippet-block"));
    // Rich markup survives the same constructor, while pasted active HTML is sanitized.
    await page.locator("#rich-mode").click();
    await builder.evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); const data = new DataTransfer(); data.setData("text/html", '<p><b>Hello</b> {form: name}</p><script>alert(1)</script><img src=x onerror=alert(2)>'); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); });
    assert.equal(await builder.locator("b").textContent(), "Hello"); assert.equal(await builder.locator('[data-type="form"]').count(), 1);
    assert.equal(await builder.locator("script,img").count(), 0);
    await page.locator("#save-shortcut").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts[0].format === "html");
    const rich = await page.evaluate(() => JSON.parse(localStorage.getItem("quickPhrase")).shortcuts[0]);
    assert.equal(rich.replacement, "<p><b>Hello</b> {form: name}</p>");
    await page.screenshot({ path: artifactFile("snipio-constructor.png"), fullPage: true });
    for (const width of [1024, 768, 390]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `constructor overflow at ${width}px`); }
    assert.deepEqual(errors, []);
    console.log("PASS constructor: friendly icon blocks, edit/remove, native Enter lines/caret, typed template caret, tool insertion, copy/paste, balanced condition drag/edit/remove, draft recovery, compatible save with latest hidden metadata, rich sanitization, responsive layout.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
