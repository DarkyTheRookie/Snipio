// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
// Uses the real Lexical library, rather than emulating its DOM handling.
// node tests/browser/lexical-browser.cjs <playwright module> <browser executable> <fixture directory>
const { chromium } = require(process.argv[2] || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fixture = path.resolve(process.argv[4] || path.join(__dirname, "../fixtures/lexical"));
const esbuild = require(path.join(fixture, "node_modules/esbuild"));

(async () => {
  const bundle = await esbuild.build({
    stdin: {
      contents: `import { createEditor, $getRoot, $createParagraphNode } from 'lexical';
        import { registerPlainText } from '@lexical/plain-text';
        const editor = createEditor({namespace:'test', onError: error => { throw error; }});
        editor.setRootElement(document.getElementById('editor'));
        registerPlainText(editor);
        window.resetEditor = () => editor.update(() => { $getRoot().clear().append($createParagraphNode()); $getRoot().selectEnd(); }, {discrete: true});
        window.modelText = () => editor.getEditorState().read(() => $getRoot().getTextContent());
        window.resetEditor();`,
      resolveDir: fixture
    },
    bundle: true, write: false, format: "iife", define: { "process.env.NODE_ENV": '"development"' }
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<div id="editor" contenteditable="true" role="textbox"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => {
      let saved = { mode: "immediate", shortcuts: [
          { triggers: ["hi", "Hi"], replacement: "Hello, how are you?" },
          { trigger: "i", replacement: "I will get back to you." },
          { trigger: "what", replacement: "What can I help you with?" }
        ] };
      window.chrome = { storage: {
        local: { get: async () => ({ quickPhrase: saved }) },
        onChanged: { addListener(fn) { window.changeSettings = next => { saved = next; fn({ quickPhrase: { newValue: next } }, "local"); }; } }
      } };
    });
    await page.addScriptTag({ path: runtimeFile("core.js") });
    await page.addScriptTag({ path: runtimeFile("rich.js") });
    await page.addScriptTag({ path: runtimeFile("content.js") });
    const editor = page.locator("#editor");
    const results = [];
    for (const [trigger, expected] of [["hi", "Hello, how are you?"], ["Hi", "Hello, how are you?"], ["i", "I will get back to you."], ["what", "What can I help you with?"]]) {
      await page.evaluate(() => window.resetEditor());
      await editor.click();
      await editor.pressSequentially(trigger, { delay: 40 });
      await page.waitForTimeout(350);
      const observed = await page.evaluate(() => ({
        text: document.getElementById("editor").textContent,
        model: window.modelText(),
        caret: getSelection().anchorOffset,
        anchorText: getSelection().anchorNode?.textContent
      }));
      console.log(trigger, JSON.stringify(observed));
      results.push({ trigger, expected, ...observed });
      await editor.pressSequentially("!");
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => window.modelText()), `${expected}!`, `${trigger}: continued typing at the end`);
    }
    assert.deepEqual(errors, [], "no editor errors");
    for (const result of results) {
      assert.equal(result.text, result.expected, `${result.trigger}: visible phrase`);
      assert.equal(result.model, result.expected, `${result.trigger}: editor model`);
    }
    await page.evaluate(() => window.changeSettings({ mode: "immediate", shortcuts: [{ trigger: ";sig", replacement: "Best wishes,\nAlex" }] }));
    await page.evaluate(() => window.resetEditor());
    await editor.click(); await editor.pressSequentially(";sig", { delay: 30 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.modelText()), "Best wishes,\nAlex", "multiline replacement survives in the model");
    await page.evaluate(() => window.changeSettings({ mode: "delimiter", shortcuts: [{ trigger: "hi", replacement: "Hello, how are you?" }] }));
    await page.evaluate(() => window.resetEditor());
    await editor.click(); await editor.pressSequentially("hi");
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.modelText()), "Hello, how are you?", "legacy delimiter preference expands immediately without an extra key");
    await editor.press("Backspace");
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.modelText()), "hi", "immediate undo updates the managed model");
    await page.evaluate(() => window.resetEditor());
    await editor.click(); await editor.pressSequentially("hi");
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.modelText()), "Hello, how are you?", "legacy settings still expand immediately after undo");
    await editor.press("Space");
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.modelText()), "Hello, how are you? ", "Space inserts a native space after the expansion");
    await editor.press("Backspace");
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.modelText()), "Hello, how are you?", "later Backspace removes only the typed space");
    await editor.press("Enter");
    await page.waitForTimeout(50);
    const afterEnter = await page.evaluate(() => window.modelText());
    assert.equal(afterEnter.slice(0, "Hello, how are you?".length), "Hello, how are you?", "Enter retains the expanded phrase");
    assert.match(afterEnter.slice("Hello, how are you?".length), /^\n+$/u, "Enter inserts a native line break into the managed model");
    await page.evaluate(() => window.changeSettings({ mode: "immediate", shortcuts: [{ trigger: "/cursor", replacement: "Hello {cursor}world" }] }));
    await page.evaluate(() => window.resetEditor());
    await editor.click(); await editor.pressSequentially("/cursor", { delay: 30 });
    await page.waitForTimeout(100); await editor.pressSequentially("!");
    assert.equal(await page.evaluate(() => window.modelText()), "Hello !world", "cursor placement updates the managed model");
    await page.evaluate(() => window.changeSettings({ mode: "immediate", shortcuts: [{ trigger: "/form", replacement: "Hi {form: name}" }] }));
    await page.evaluate(() => window.resetEditor());
    await editor.click(); await editor.pressSequentially("/form", { delay: 30 });
    const form = page.getByRole("dialog", { name: "Fill in snippet" });
    await form.getByLabel("name").fill("Ada"); await form.getByLabel("name").press("Escape");
    assert.equal(await page.evaluate(() => window.modelText()), "/form", "form cancellation preserves the managed model");
    await editor.press("Backspace");
    assert.equal(await page.evaluate(() => window.modelText()), "/for", "cancel returns caret to the end of the original shortcut");
    await editor.pressSequentially("m");
    await form.getByLabel("name").fill("Ada"); await form.getByLabel("name").press("Enter");
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.modelText()), "Hi Ada", "form submission updates the managed model");
    await page.evaluate(() => window.changeSettings({ mode: "immediate", shortcuts: [{ trigger: "/html", format: "html", replacement: "<b>Bold {cursor}</b><i>text</i>" }] }));
    await page.evaluate(() => window.resetEditor());
    await editor.click(); await editor.pressSequentially("/html", { delay: 30 });
    assert.deepEqual(errors, [], "rich expansion has no browser errors");
    await page.waitForTimeout(100); await editor.pressSequentially("!");
    assert.equal(await page.evaluate(() => window.modelText()), "Bold !text", "plain managed editor accepts the rich snippet's text fallback");
    assert.deepEqual(errors, [], "no editor errors after advanced features");
    console.log("All real Lexical editor checks passed.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
