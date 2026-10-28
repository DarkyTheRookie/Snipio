// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeUrl, extensionRoot, artifactFile } = require("../helpers.cjs");
// Real extension storage, service worker, popup, tabs, and frames (no API mocks).
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const http = require("node:http");

(async () => {
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><title>Shortcut fixture</title><textarea id="field"></textarea>' +
      (request.url === "/frame" ? "" : '<iframe src="/frame"></iframe>'));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let context;
  try {
    const extensionPath = extensionRoot;
    context = await chromium.launchPersistentContext("", {
      headless: true, executablePath: process.argv[3],
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    assert.equal(await worker.evaluate(() => chrome.action.getPopup({})), runtimeUrl("manager.html", extensionId));
    const url = `http://127.0.0.1:${server.address().port}`;
    const pages = await Promise.all([context.newPage(), context.newPage()]);
    for (const page of pages) await page.goto(url);
    const manager = await context.newPage();
    await manager.goto(runtimeUrl("manager.html", extensionId));
    await manager.waitForFunction(() => !document.getElementById("add").disabled);
    const startingCount = await manager.locator("#count").textContent();
    await manager.locator("#add").click();
    await manager.locator("#trigger").fill(";live\n;Live");
    await manager.locator("#replacement").fill("Available immediately");
    await manager.getByRole("button", { name: "Save snippet" }).click();
    await manager.waitForFunction(() => !document.getElementById("editor").open);
    async function verifyEverywhere(expected) {
      for (const page of pages) {
        const fields = [page.locator("#field"), page.frameLocator("iframe").locator("#field")];
        for (const field of fields) {
          for (const alias of [";live", ";Live"]) {
            await field.fill(""); await field.pressSequentially(alias);
            assert.equal(await field.inputValue(), expected === ";live" ? alias : expected);
            if (expected !== ";live") {
              assert.ok(await field.evaluate(el => el.getAnimations().some(animation =>
                animation.effect.getKeyframes().some(frame => frame.boxShadow?.includes("59, 130, 246"))
              )), "blue expansion feedback is visible");
            }
          }
        }
      }
    }
    await verifyEverywhere("Available immediately");
    await manager.getByRole("button", { name: "Edit ;live", exact: true }).click();
    await manager.locator("#replacement").fill("Updated immediately");
    await manager.getByRole("button", { name: "Save snippet" }).click();
    await manager.waitForFunction(() => !document.getElementById("editor").open);
    await verifyEverywhere("Updated immediately");
    manager.once("dialog", dialog => dialog.accept());
    await manager.getByRole("button", { name: "Delete ;live", exact: true }).click();
    await manager.waitForFunction(count => document.getElementById("count").textContent === count, startingCount);
    await verifyEverywhere(";live");
    const editorOpened = context.waitForEvent("page");
    await manager.locator("#add").click();
    await manager.locator("#snippet-name").fill("An advanced draft");
    await manager.locator("#trigger").fill(";advanced\n;Advanced");
    const longText = "Keep all the words from this popup draft. ".repeat(10);
    await manager.locator("#replacement").fill(longText);
    const editor = await editorOpened;
    await editor.waitForURL(runtimeUrl("editor.html", extensionId));
    await editor.waitForFunction(() => !document.getElementById("save-shortcut").disabled);
    await editor.locator("#recovered-drafts").click();
    await editor.locator(".draft-recovery-row").filter({ hasText: "An advanced draft" }).first().getByRole("button", { name: "Open", exact: true }).click();
    assert.equal(await editor.locator("#replacement").inputValue(), longText);
    assert.equal(await editor.locator("#triggers").inputValue(), ";advanced\n;Advanced");
    assert.equal(await editor.locator("#snippet-name").inputValue(), "An advanced draft");
    await editor.locator("#builder-editor").fill("Hello ");
    await editor.locator("#builder-editor").evaluate(el => {const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);});
    await editor.locator("#field-name").fill("name");
    await editor.locator("#add-field").click();
    assert.equal(await editor.locator("#replacement").inputValue(), "Hello {form: name}");
    await editor.locator("#save-shortcut").click();
    await editor.waitForFunction(() => document.getElementById("draft-status").textContent === "Saved");
    await pages[0].bringToFront();
    const siteField = pages[0].locator("#field");
    await siteField.fill(""); await siteField.pressSequentially(";advanced");
    const form = pages[0].getByRole("dialog", {name:"Fill in snippet"});
    await form.getByLabel("name", {exact:true}).fill("Ada");
    await form.getByLabel("name", {exact:true}).press("Enter");
    assert.equal(await siteField.inputValue(), "Hello Ada");
    await editor.screenshot({path:artifactFile("snipio-dashboard-extension.png")});

    // Both views must retain their changes when autosaves become due together.
    await worker.evaluate(async () => {
      let entered;
      const started = new Promise(resolve => { entered = resolve; });
      globalThis.testHeldLock = navigator.locks.request("snipio-library", () => new Promise(resolve => { globalThis.releaseTestLock = resolve; entered(); }));
      await started;
    });
    await editor.locator("#add-shortcut").click();
    await manager.locator("#add").click();
    await Promise.all([
      (async () => { await editor.locator("#snippet-name").fill("Dashboard concurrent"); await editor.locator("#triggers").fill(";dashconcurrent"); await editor.locator("#builder-editor").fill("From dashboard"); })(),
      (async () => { await manager.locator("#snippet-name").fill("Popup concurrent"); await manager.locator("#trigger").fill(";popupconcurrent"); await manager.locator("#replacement").fill("From popup"); })()
    ]);
    await editor.waitForFunction(async () => (await navigator.locks.query()).pending.filter(lock => lock.name === "snipio-library").length >= 4);
    await worker.evaluate(async () => { globalThis.releaseTestLock(); await globalThis.testHeldLock; });
    await editor.waitForFunction(() => document.getElementById("draft-status").textContent === "Saved");
    await manager.waitForFunction(() => document.getElementById("quick-save-status").textContent === "Saved");
    const concurrent = await worker.evaluate(() => chrome.storage.local.get("quickPhrase"));
    assert.equal(concurrent.quickPhrase.shortcuts.find(item => item.name === "Dashboard concurrent").replacement, "From dashboard");
    assert.equal(concurrent.quickPhrase.shortcuts.find(item => item.name === "Popup concurrent").replacement, "From popup");
    console.log("PASS actual extension: attached popup, live tabs/frames, lossless handoff, form expansion, and simultaneous dashboard/popup autosaves without lost writes.");
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
