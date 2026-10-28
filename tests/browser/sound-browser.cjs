// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeUrl, extensionRoot } = require("../helpers.cjs");
// Actual extension audio, including a site that disallows page media.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const http = require("node:http");

(async () => {
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.setHeader("Content-Security-Policy", "default-src 'none'; media-src 'none'");
    response.end('<!doctype html><title>Sound fixture</title><textarea id="field"></textarea>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let context;
  try {
    context = await chromium.launchPersistentContext("", {
      headless: true, executablePath: process.argv[3],
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`]
    });
    context.setDefaultTimeout(10000);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() => {
      globalThis.expansions = 0;
      chrome.runtime.onMessage.addListener(message => {
        if (message?.type === "rain:expanded") globalThis.expansions++;
      });
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const manager = await context.newPage();
    await manager.goto(runtimeUrl("manager.html", extensionId));
    await manager.waitForFunction(() => !document.getElementById("add").disabled);
    await page.locator("#field").pressSequentially(".hello");
    await page.waitForFunction(() => document.getElementById("field").value === "Hello, how are you?");
    // The returned success comes from HTMLMediaElement.play(), not just message delivery.
    const first = await manager.evaluate(() => chrome.runtime.sendMessage({ type: "rain:expanded" }));
    assert.equal(first.ok, true, "bundled WAV playback starts");
    const repeats = await manager.evaluate(() => Promise.all(Array.from({ length: 3 }, () =>
      chrome.runtime.sendMessage({ type: "rain:expanded" }))));
    assert.ok(repeats.every(result => result.ok), "rapid repeated expansions replay the clip");
    assert.equal((await worker.evaluate(() => chrome.runtime.getContexts({contextTypes: ["OFFSCREEN_DOCUMENT"]}))).length, 1);
    await worker.evaluate(() => chrome.offscreen.closeDocument());
    const recreated = await manager.evaluate(() => chrome.runtime.sendMessage({ type: "rain:expanded" }));
    assert.equal(recreated.ok, true, "playback recovers when Chrome closes the idle document");
    const before = await worker.evaluate(() => globalThis.expansions);
    await manager.locator("#playground").pressSequentially(".hello");
    await manager.waitForFunction(() => document.getElementById("playground").value === "Hello, how are you?");
    assert.equal(await worker.evaluate(() => globalThis.expansions), before + 1, "one sound per practice expansion");
    await page.locator("#field").fill("");
    await page.locator("#field").pressSequentially("ordinary");
    assert.equal(await worker.evaluate(() => globalThis.expansions), before + 1, "ordinary typing stays silent");
    console.log("PASS sound: WAV playback, restricted-site expansion, rapid replay, one audio document, recreation, practice field, and silent ordinary typing.");
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
