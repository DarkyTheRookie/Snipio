// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
// Browser regressions for rich editor shapes and event handling.
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent(`<!doctype html><input id="other"><div id="editor" role="textbox" contenteditable="true"></div>`);
    await page.evaluate(() => {
      const settings = { mode: "immediate", shortcuts: [{ trigger: "hi", replacement: "Hello, how are you?" }] };
      window.chrome = { storage: {
        local: { get: async () => ({ quickPhrase: settings }) },
        onChanged: { addListener(fn) { window.changeSettings = next => fn({ quickPhrase: { newValue: next } }, "local"); } }
      } };
    });
    await page.addScriptTag({ path: runtimeFile("core.js") });
    await page.addScriptTag({ path: runtimeFile("content.js") });
    const editor = page.locator("#editor");
    const phrase = "Hello, how are you?";
    async function assertText(text) {
      await page.waitForFunction(expected => document.getElementById("editor").innerText.replace(/\u00a0/g, " ") === expected, text);
    }
    async function reset(html = "") {
      await editor.evaluate((el, html) => {
        el.innerHTML = html; el.focus();
        const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      }, html);
    }
    async function signalTyping(key = "i") {
      await editor.dispatchEvent("keydown", { key });
      await editor.dispatchEvent("keyup", { key });
    }
    await reset(); await editor.pressSequentially("hi"); await assertText(phrase);

    // The original engine ignored element-anchored selections and split words.
    await reset("<span>h</span><span>i</span>");
    await signalTyping(); await assertText(phrase);
    console.log("PASS split spans and element-anchored caret");

    await reset("<div>previous line</div><div>hi</div>");
    await signalTyping(); await assertText(`previous line\n${phrase}`);
    await reset("previous line<br>hi");
    await signalTyping(); await assertText(`previous line\n${phrase}`);
    console.log("PASS paragraph and BR boundaries");

    // A controlled editor rebuilds its spans in a microtask after each input.
    await page.evaluate(() => {
      const el = document.getElementById("editor");
      el.addEventListener("input", event => {
        if (!window.controlled || !event.isTrusted) return;
        const text = el.textContent;
        queueMicrotask(() => {
          el.replaceChildren(...[...text].map(char => {
            const span = document.createElement("span"); span.textContent = char; return span;
          }));
          const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
          getSelection().removeAllRanges(); getSelection().addRange(range);
          window.editorState = text;
        });
      });
      window.controlled = true;
    });
    await reset(); await editor.pressSequentially("hi"); await assertText(phrase);
    await page.waitForFunction(expected => window.editorState === expected, phrase);
    await editor.pressSequentially("!"); await assertText(`${phrase}!`);
    await page.evaluate(() => { window.controlled = false; });
    console.log("PASS managed editor rerender and retained model state");

    // Editors can consume input at the target, leaving keyup as the signal.
    await page.evaluate(() => {
      document.getElementById("editor").addEventListener("beforeinput", event => {
        if (!window.consumeTyping || event.inputType !== "insertText") return;
        event.preventDefault();
        const selection = getSelection(); const range = selection.getRangeAt(0);
        const text = document.createTextNode(event.data); range.insertNode(text);
        range.setStartAfter(text); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
      });
      window.consumeTyping = true;
    });
    await reset(); await editor.pressSequentially("hi"); await assertText(phrase);
    await page.evaluate(() => { window.consumeTyping = false; });
    console.log("PASS intercepted native input / missing InputEvent metadata");

    // Reproduce an editor that restores its caret after the input and keyup
    // handlers have run. No further keystroke should be needed for expansion.
    await page.evaluate(() => {
      const el = document.getElementById("editor");
      el.addEventListener("input", event => {
        if (!window.delayCaret || event.data !== "i") return;
        const selection = getSelection();
        const end = selection.getRangeAt(0).cloneRange();
        const behind = end.cloneRange();
        behind.setStart(behind.startContainer, Math.max(0, behind.startOffset - 1));
        behind.collapse(true); selection.removeAllRanges(); selection.addRange(behind);
        if (window.leaveFieldOnInput) queueMicrotask(() => document.getElementById("other").focus());
        setTimeout(() => {
          selection.removeAllRanges(); selection.addRange(end);
          // Managed editors may also emit an event without InputEvent metadata.
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }, 60);
      });
      window.delayCaret = true;
    });
    await reset(); await editor.pressSequentially("hi", { delay: 25 });
    await page.waitForTimeout(300);
    assert.equal(await editor.innerText(), phrase, "delayed caret must expand hi without a third keystroke");
    await page.evaluate(() => { window.delayCaret = false; });
    await editor.pressSequentially("!"); await assertText(`${phrase}!`);
    console.log("PASS delayed caret expands without an extra letter");

    await page.evaluate(() => { window.delayCaret = true; });
    await reset(); await editor.pressSequentially("hi", { delay: 25 });
    await editor.press("ArrowLeft");
    await page.waitForTimeout(300);
    assert.equal(await editor.innerText(), "hi", "cursor navigation cancels delayed expansion");
    await page.evaluate(() => { window.leaveFieldOnInput = true; });
    await reset(); await editor.pressSequentially("hi", { delay: 25 });
    await page.waitForTimeout(300);
    assert.equal(await editor.innerText(), "hi", "leaving the field cancels delayed expansion");
    await page.evaluate(() => { window.delayCaret = false; window.leaveFieldOnInput = false; });
    console.log("PASS delayed expansion cancels on navigation and focus change");

    await page.evaluate(() => window.changeSettings({ mode: "immediate", shortcuts: [{ trigger: "hi", replacement: "say hi" }] }));
    await reset(); await editor.pressSequentially("hi");
    await page.waitForTimeout(300);
    assert.equal(await editor.innerText(), "say hi", "input, keyup, and retries must expand only once per keystroke");
    await page.evaluate(() => window.changeSettings({ mode: "immediate", shortcuts: [{ trigger: "hi", replacement: "Hello, how are you?" }] }));
    console.log("PASS no duplicate expansion when a phrase ends with its shortcut");

    // Never combine the tail of a previous word with the current node.
    await reset("<span>t</span><span>hi</span>");
    await signalTyping();
    await page.waitForTimeout(30); assert.equal(await editor.innerText(), "thi");
    await reset('<span contenteditable="false">mention</span>hi');
    await signalTyping();
    await page.waitForTimeout(30); assert.equal(await editor.innerText(), "mentionhi");

    // Saved delimiter preferences migrate to immediate expansion, including
    // split nodes. Space and Enter then keep their ordinary editing behavior.
    await page.evaluate(() => window.changeSettings({ mode: "delimiter", shortcuts: [{ trigger: "hi", replacement: "Hello, how are you?" }] }));
    await reset("<span>h</span><span>i</span>"); await signalTyping(); await assertText(phrase);
    await editor.evaluate(el => {
      window.nativeKeys = [];
      window.nativeInputs = [];
      el.addEventListener("keydown", event => {
        if ([" ", "Enter"].includes(event.key)) window.nativeKeys.push({ key: event.key, prevented: event.defaultPrevented });
      });
      el.addEventListener("beforeinput", event => window.nativeInputs.push(event.inputType));
    });
    await editor.press("Space"); await assertText(`${phrase} `);
    await editor.press("Enter");
    await page.waitForFunction(() => window.nativeInputs.includes("insertParagraph"));
    assert.deepEqual(await page.evaluate(() => window.nativeKeys), [
      { key: " ", prevented: false }, { key: "Enter", prevented: false }
    ]);
    const afterEnter = (await editor.innerText()).replace(/\u00a0/gu, " ");
    assert.equal(afterEnter.slice(0, phrase.length + 1), `${phrase} `, "Enter retains the expanded text and native space");
    assert.match(afterEnter.slice(phrase.length + 1), /^\n+$/u, "Enter inserts a native paragraph after the expanded text");
    console.log("PASS legacy delimiter settings expand immediately and preserve native Space/Enter");

    assert.deepEqual(errors, []);
    console.log("All rich editor regressions passed.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
