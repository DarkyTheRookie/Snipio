// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(() => {
  "use strict";
  function storageAvailable() {
    try {
      const storage = globalThis.chrome?.storage;
      return typeof storage?.local?.get === "function" && typeof storage?.onChanged?.addListener === "function";
    } catch { return false; }
  }
  // Reloaded or unavailable extension contexts cannot use the storage API.
  // Leave no partial instance behind so a later injection can start normally.
  if (!storageAvailable()) return;
  // Re-injection updates the existing instance instead of doubling its handlers.
  const instanceKey = "__quickPhraseInstance";
  if (globalThis[instanceKey]) return globalThis[instanceKey].refresh();
  let settings = QuickPhrase.normalize({});
  let ready = false;
  let replacing = false;
  let pending = null;
  let composing = false;
  let typingSequence = 0;
  let expandedSequence = -1;
  let settingsRevision = 0;
  let expansionWork = null;
  let formSession = null;
  let lastExpansion = null;

  function textOffset(root, node, offset) {
    const range = root.ownerDocument.createRange(); range.selectNodeContents(root); range.setEnd(node, offset);
    return range.toString().length;
  }
  function textPosition(root, offset) {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (offset <= node.data.length) return [node, offset];
      offset -= node.data.length;
    }
    return [root, root.childNodes.length];
  }
  function undoExpansion(event, target) {
    const saved = lastExpansion; lastExpansion = null;
    if (!saved || !target || (plainInput(target) ? target : editableRoot(target)) !== saved.target || !unchanged(saved.ctx, saved.after)) return false;
    event.preventDefault(); event.stopImmediatePropagation?.();
    const ctx = context(saved.target);
    replacing = true;
    try {
      // Native rich-text undo restores the exact original formatting as well.
      if (!ctx.input && saved.native && ctx.target.ownerDocument.execCommand("undo")) {
        if (ctx.target.innerHTML === saved.before.value) return true;
        ctx.target.ownerDocument.execCommand("redo");
        if (ctx.target.innerHTML !== saved.after.value) return true;
      }
      let range;
      if (ctx.input) range = { start: saved.start, end: saved.end };
      else {
        range = ctx.target.ownerDocument.createRange();
        range.setStart(...textPosition(ctx.target, saved.start));
        range.setEnd(...textPosition(ctx.target, saved.end));
      }
      replace(ctx, { trigger: "", replacement: saved.trigger }, "", { range, undo: true });
    } finally { replacing = false; }
    return true;
  }

  function formEvent(event) { return formSession && event.composedPath().includes(formSession.host); }

  function askFields(ctx, names) {
    return new Promise(resolve => {
      const savedRange = ctx.range?.cloneRange();
      const start = ctx.target.selectionStart;
      const host = document.createElement("div"); host.dataset.quickphrase = "off";
      const shadow = host.attachShadow({ mode: "open" });
      // Outside the shadow root, these events are retargeted to the host. Site
      // keyboard/editor handlers can then mistake field typing for shortcuts.
      for (const type of ["keydown", "keypress", "keyup", "beforeinput", "input", "change", "compositionstart", "compositionupdate", "compositionend", "focusin", "focusout", "pointerdown", "pointerup", "mousedown", "mouseup", "click"]) {
        shadow.addEventListener(type, event => event.stopPropagation());
      }
      const style = document.createElement("style");
      style.textContent = ":host{all:initial}dialog{position:fixed;width:min(340px,80vw);max-height:80vh;overflow:auto;border:1px solid #ccd9ef;border-radius:16px;padding:22px;background:#f3f8ff;color:#273963;font:14px system-ui}dialog::backdrop{background:#26395b55}h2{font-size:18px;margin:0 0 16px}label{display:block;margin:12px 0}input{box-sizing:border-box;display:block;width:100%;margin-top:5px;padding:9px;border:1px solid #bacbe4;border-radius:8px;font:inherit}button{padding:9px 14px;margin:8px 6px 0 0;border:1px solid #bacbe4;border-radius:8px;background:#fff;color:#273963;font:inherit;cursor:pointer}";
      const dialog = document.createElement("dialog"); dialog.setAttribute("aria-label", "Fill in snippet");
      const form = document.createElement("form");
      const heading = document.createElement("h2"); heading.textContent = "Fill in snippet"; form.append(heading);
      const inputs = names.map(name => {
        const label = document.createElement("label"); label.textContent = name;
        const input = document.createElement("input"); input.type = "text"; input.maxLength = 10000;
        label.append(input); form.append(label); return input;
      });
      const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Insert";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
      form.append(submit, cancel); dialog.append(form); shadow.append(style, dialog);
      const session = { host, cancel: () => close(null, false) }; formSession = session;
      function close(values, restore = true) {
        if (formSession !== session) return;
        dialog.close(); host.remove(); formSession = null;
        if (restore && ctx.target.isConnected) {
          ctx.target.focus({ preventScroll: true });
          if (ctx.input) ctx.target.setSelectionRange(start, start);
          else if (savedRange?.startContainer.isConnected) { ctx.selection.removeAllRanges(); ctx.selection.addRange(savedRange); }
        }
        resolve(values);
      }
      form.onsubmit = event => {
        event.preventDefault();
        close(Object.fromEntries(names.map((name, index) => [name, inputs[index].value])));
      };
      cancel.onclick = () => close(null);
      dialog.addEventListener("cancel", event => { event.preventDefault(); close(null); });
      dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(null); }
        else if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
      });
      document.documentElement.append(host); dialog.showModal(); inputs[0].focus();
    });
  }

  function expansionError(message) {
    const note = document.createElement("div");
    note.setAttribute("role", "alert"); note.textContent = `Snipio: ${message}`;
    note.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;padding:12px;max-width:320px;background:#fff;color:#943954;border:1px solid #b85b74;border-radius:12px;font:14px system-ui";
    document.documentElement.append(note);
    setTimeout(() => note.remove(), 5000);
  }

  function snapshot(ctx) {
    return ctx.input ? { value: ctx.target.value, start: ctx.target.selectionStart, end: ctx.target.selectionEnd }
      : { value: ctx.target.innerHTML, node: ctx.range.endContainer, offset: ctx.range.endOffset };
  }

  function unchanged(ctx, saved) {
    const current = context(ctx.target);
    if (!current) return false;
    return ctx.input ? ctx.target.value === saved.value && ctx.target.selectionStart === saved.start && ctx.target.selectionEnd === saved.end
      : ctx.target.innerHTML === saved.value && current.range.endContainer === saved.node && current.range.endOffset === saved.offset;
  }

  function startExpansion(ctx, item, suffix) {
    if (expansionWork) return false;
    let now = new Date();
    const source = item.format === "html" ? RichSnippet.logicSource(item.replacement) : item.replacement;
    const error = QuickPhrase.validateTemplate(source);
    if (error) { expansionError(`Snippet could not expand. ${error} Edit it in Snipio to fix the template.`); return true; }
    const finish = (clipboard, fields = {}) => replace(context(ctx.target), { ...item,
      ...(item.format === "html" ? RichSnippet.expand(item.replacement, { now, clipboard, fields }) : QuickPhrase.expandVariables(QuickPhrase.renderLogic(source, { now, fields }), { now, clipboard, fields })) }, suffix);
    const names = QuickPhrase.formFields(source);
    if (!names.length && !source.includes("{clipboard}")) return finish("");
    const work = { sequence: typingSequence, saved: snapshot(ctx) };
    expansionWork = work;
    (async () => {
      const fields = names.length ? await askFields(ctx, names) : {};
      if (fields === null || expansionWork !== work) return;
      now = new Date();
      const active = QuickPhrase.renderLogic(source, { now, fields });
      const result = active.includes("{clipboard}") ? await chrome.runtime.sendMessage({ type: "rain:clipboard" }) : { ok: true, text: "" };
      if (expansionWork !== work || work.sequence !== typingSequence || !unchanged(ctx, work.saved)) return;
      if (!result?.ok || typeof result.text !== "string") throw new Error("Clipboard unavailable. Your typed trigger was kept; check Snipio's clipboard permission and try again.");
      finish(result.text, fields);
    })().catch(error => { if (expansionWork === work) expansionError(error.message); })
      .finally(() => { if (expansionWork === work) expansionWork = null; });
    return true;
  }

  function placeCursor(ctx, inserted, cursor, start) {
    if (cursor === null || cursor === undefined) return;
    if (ctx.input) ctx.target.setSelectionRange(start + cursor, start + cursor);
    else {
      const tail = inserted.slice(cursor);
      if (!tail.includes("\n")) {
        const end = ctx.selection.getRangeAt(0);
        const offset = textOffset(ctx.target, end.endContainer, end.endOffset) - tail.length;
        const range = ctx.target.ownerDocument.createRange();
        range.setStart(...textPosition(ctx.target, Math.max(0, offset))); range.collapse(true);
        ctx.selection.removeAllRanges(); ctx.selection.addRange(range);
        return;
      }
      // Chrome's selection movement handles line breaks created by insertText.
      const count = typeof Intl.Segmenter === "function" ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(tail)].length : Array.from(tail).length;
      for (let index = 0; index < count; index++) ctx.selection.modify("move", "backward", "character");
    }
  }
  async function refreshSettings() {
    const revision = ++settingsRevision;
    try {
      const result = await chrome.storage.local.get("quickPhrase");
      // A change event or later refresh must win over an older storage read.
      if (revision !== settingsRevision) return;
      settings = QuickPhrase.normalize(result.quickPhrase);
      ready = true;
    } catch {
      // An old script can outlive its extension connection in an open tab.
      if (revision !== settingsRevision) return;
      ready = false;
      cancelPending();
      lastExpansion = null; expansionWork = null; formSession?.cancel();
    }
  }
  function storageChanged(changes, area) {
    if (area === "local" && changes.quickPhrase) {
      settingsRevision++;
      cancelPending();
      lastExpansion = null; expansionWork = null; formSession?.cancel();
      settings = QuickPhrase.normalize(changes.quickPhrase.newValue);
      ready = true;
    }
  }
  try { chrome.storage.onChanged.addListener(storageChanged); }
  catch { return; }
  document.addEventListener("focusin", refreshSettings, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSettings();
  });

  function targetOf(event) {
    return event.composedPath().find(node => node instanceof Element &&
      (node.matches("input, textarea") || node.isContentEditable));
  }

  function plainInput(target) {
    return target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement && ["text", "search", "url", "tel"].includes(target.type));
  }

  function allowed(target) {
    if (!target || target.disabled || target.readOnly) return false;
    // Never expand in password fields, including fields inside editable containers.
    if (target.closest('input[type="password"], [autocomplete="current-password"], [autocomplete="new-password"], [data-quickphrase="off"]')) return false;
    return plainInput(target) || (target.isContentEditable && !target.matches("input"));
  }

  function editableRoot(target) {
    let root = target;
    while (root.parentElement?.isContentEditable) root = root.parentElement;
    return root;
  }

  function context(target) {
    if (plainInput(target)) {
      if (target.selectionStart === null || target.selectionStart !== target.selectionEnd) return null;
      return { text: target.value.slice(0, target.selectionStart), target, input: true };
    }
    const root = editableRoot(target);
    const selection = root.ownerDocument.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.endContainer)) return null;
    // Keep DOM positions for every text segment. Editors can split one word over
    // spans, or leave the caret on an element rather than inside a text node.
    const parts = [];
    const block = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DIV|H[1-6]|LI|OL|P|PRE|SECTION|UL)$/;
    let reachedCaret = false;
    function visit(node) {
      if (reachedCaret) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const end = node === range.endContainer ? range.endOffset : node.data.length;
        parts.push({ text: node.data.slice(0, end), node });
        if (node === range.endContainer) reachedCaret = true;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node !== root && node.getAttribute("contenteditable") === "false") {
        parts.push({ text: "\ufffc" });
        return;
      }
      const separator = node !== root && (node.tagName === "BR" || block.test(node.tagName));
      if (separator) parts.push({ text: "\n" });
      const limit = node === range.endContainer ? range.endOffset : node.childNodes.length;
      for (let index = 0; index < limit && !reachedCaret; index++) visit(node.childNodes[index]);
      if (node === range.endContainer) reachedCaret = true;
      if (separator && !reachedCaret && node.tagName !== "BR") parts.push({ text: "\n", blockEnd: true });
    }
    visit(root);
    if (!reachedCaret) return null;
    // A caret after the last paragraph element is still at the end of its text.
    // Keep real BRs and empty-paragraph starts as boundaries.
    while (parts.at(-1)?.blockEnd) parts.pop();
    return { text: parts.map(part => part.text).join(""), parts, target: root, input: false, range, selection };
  }

  function replacementRange(ctx, length) {
    const range = ctx.range.cloneRange();
    for (let index = ctx.parts.length - 1; index >= 0; index--) {
      const part = ctx.parts[index];
      if (!part.text.length) continue;
      // Never remove paragraph breaks or non-editable mentions/emoji nodes.
      if (!part.node) return null;
      if (length <= part.text.length) {
        range.setStart(part.node, part.text.length - length);
        return range;
      }
      length -= part.text.length;
    }
    return null;
  }

  const expansionAnimations = new WeakMap();
  function expansionFeedback(target, item) {
    animateExpansion(target);
    // Playback runs in an extension page so website media policies cannot block it.
    try {
      chrome.runtime.sendMessage({ type: "rain:expanded", id: item.id,
        expansionLength: Array.from(item.replacement).length, triggerLength: Array.from(item.trigger).length }).catch(() => {});
    } catch { /* Reloading the extension must not interrupt typing. */ }
  }
  function animateExpansion(target) {
    // Animate the field without touching the editor's text or selection.
    if (typeof target.animate !== "function" ||
        target.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      expansionAnimations.get(target)?.cancel();
      const animation = target.animate([
        { boxShadow: "0 0 0 0 rgba(59, 130, 246, 0)" },
        { boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.55)", offset: 0.25 },
        { boxShadow: "0 0 0 7px rgba(59, 130, 246, 0)" }
      ], { duration: 480, easing: "ease-out" });
      expansionAnimations.set(target, animation);
      animation.onfinish = () => {
        if (expansionAnimations.get(target) === animation) expansionAnimations.delete(target);
      };
    } catch { /* Visual feedback must never interrupt text expansion. */ }
  }

  function replace(ctx, item, suffix, options = {}) {
    if (!ctx) return false;
    const inserted = item.replacement + suffix;
    const doc = ctx.target.ownerDocument;
    const before = snapshot(ctx);
    const startOffset = ctx.input ? (options.range?.start ?? ctx.target.selectionStart - item.trigger.length)
      : textOffset(ctx.target, ctx.range.endContainer, ctx.range.endOffset) - item.trigger.length;
    const beforeLength = ctx.input ? ctx.target.value.length : ctx.target.textContent.length;
    let native = false;
    function completed() {
      if (options.undo) return;
      const after = snapshot(context(ctx.target) || ctx);
      const afterLength = ctx.input ? ctx.target.value.length : ctx.target.textContent.length;
      lastExpansion = { ctx, target: ctx.target, before, after, start: startOffset,
        end: startOffset + afterLength - beforeLength + item.trigger.length, trigger: item.trigger, native };
      expansionFeedback(ctx.target, item);
    }
    replacing = true;
    try {
      if (ctx.input) {
        const end = options.range?.end ?? ctx.target.selectionStart;
        const start = options.range?.start ?? end - item.trigger.length;
        ctx.target.setSelectionRange(start, end);
        // Native editing retains undo history and integrates with many web editors.
        const success = doc.execCommand("insertText", false, inserted);
        if (!success) {
          ctx.target.setRangeText(inserted, start, end, "end");
          ctx.target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertReplacementText", data: inserted }));
        }
        placeCursor(ctx, inserted, item.cursor, start);
      } else {
        const html = item.html && ctx.target.getAttribute("contenteditable") !== "plaintext-only" ? RichSnippet.sanitize(item.html) + RichSnippet.escape(suffix) : null;
        const range = options.range || replacementRange(ctx, item.trigger.length);
        if (!range) return false;
        ctx.selection.removeAllRanges();
        ctx.selection.addRange(range);
        // Give model-backed editors a normal replacement transaction. A native
        // execCommand changes their DOM without first updating their selection
        // model, so they can reject the text or restore an obsolete caret.
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", inserted);
        if (html) dataTransfer.setData("text/html", html);
        const beforeInput = new InputEvent("beforeinput", {
          bubbles: true, composed: true, cancelable: true,
          inputType: html ? "insertFromPaste" : "insertReplacementText", data: inserted, dataTransfer,
          targetRanges: [new StaticRange({
            startContainer: range.startContainer, startOffset: range.startOffset,
            endContainer: range.endContainer, endOffset: range.endOffset
          })]
        });
        // Some managed editors reuse a ClipboardEvent handler for this input type.
        // Supply its clipboardData alias as well as the standard dataTransfer.
        if (html) Object.defineProperty(beforeInput, "clipboardData", { value: dataTransfer });
        if (!ctx.target.dispatchEvent(beforeInput)) {
          // Model-backed editors commit their DOM after the input handler returns.
          // Capture undo state and move the caret only after that transaction.
          const sequence = typingSequence;
          queueMicrotask(() => {
            if (sequence !== typingSequence || !ctx.target.isConnected) return;
            replacing = true;
            try { placeCursor(ctx, inserted, item.cursor); completed(); }
            finally { replacing = false; }
          });
          return true;
        }
        native = doc.execCommand(html ? "insertHTML" : "insertText", false, html || inserted);
        if (!native) {
          range.deleteContents();
          const fragment = html ? range.createContextualFragment(html) : doc.createTextNode(inserted);
          const last = fragment.lastChild || fragment;
          range.insertNode(fragment);
          range.setStartAfter(last);
          range.collapse(true);
          ctx.selection.removeAllRanges();
          ctx.selection.addRange(range);
          ctx.target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertReplacementText", data: inserted }));
        }
        placeCursor(ctx, inserted, item.cursor);
      }
    } finally {
      replacing = false;
    }
    completed();
    return true;
  }

  document.addEventListener("keydown", event => {
    if (formEvent(event)) return;
    if (!replacing && event.key === "Backspace" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !event.defaultPrevented && undoExpansion(event, targetOf(event))) return;
    if (!replacing) lastExpansion = null;
    if (!replacing) {
      cancelPending();
      expansionWork = null;
      typingSequence++;
    }
  }, true);

  function expandImmediately(target) {
    if (!ready || !settings.enabled || replacing || composing ||
        expandedSequence === typingSequence || !allowed(target)) return false;
    const ctx = context(target);
    if (!ctx) return false;
    const item = QuickPhrase.match(ctx.text, settings.shortcuts);
    if (!item || !startExpansion(ctx, item, "")) return false;
    expandedSequence = typingSequence;
    return true;
  }

  function cancelPending() {
    if (pending !== null) clearTimeout(pending.timer);
    pending = null;
  }

  function scheduleExpansion(target) {
    if (expandedSequence === typingSequence) return;
    cancelPending();
    const root = plainInput(target) ? target : editableRoot(target);
    const work = { sequence: typingSequence, timer: null, attempt: 0 };
    pending = work;
    // Some editors restore text/selection after input AND keyup. Re-read it over
    // the next quarter second, stopping after one expansion or a new user action.
    const delays = [0, 16, 32, 64, 128];
    function check() {
      if (pending !== work || work.sequence !== typingSequence) return;
      const active = root.getRootNode().activeElement;
      if (!root.isConnected || (active !== root && !root.contains(active)) ||
          !ready || !settings.enabled || composing || !allowed(root)) {
        cancelPending();
        return;
      }
      if (expandImmediately(root) || ++work.attempt === delays.length) {
        cancelPending();
        return;
      }
      work.timer = setTimeout(check, delays[work.attempt]);
    }
    work.timer = setTimeout(check, delays[0]);
  }

  document.addEventListener("pointerdown", event => { if (formEvent(event)) return; lastExpansion = null; cancelPending(); expansionWork = null; formSession?.cancel(); }, true);
  document.addEventListener("focusout", () => { lastExpansion = null; cancelPending(); if (!formSession) expansionWork = null; }, true);
  document.addEventListener("compositionstart", event => { if (formEvent(event)) return; lastExpansion = null; composing = true; cancelPending(); }, true);
  document.addEventListener("compositionend", event => { if (formEvent(event)) return; composing = false; }, true);
  document.addEventListener("beforeinput", event => {
    if (formEvent(event)) return;
    if (!replacing && event.inputType === "deleteContentBackward" && !event.isComposing && undoExpansion(event, targetOf(event))) return;
    if (!replacing) lastExpansion = null;
    if (!replacing && ((event.inputType && event.inputType !== "insertText") || event.isComposing)) cancelPending();
  }, true);

  document.addEventListener("input", event => {
    if (formEvent(event)) return;
    if (replacing) return;
    lastExpansion = null;
    expansionWork = null;
    if (event.isComposing || (event.inputType && event.inputType !== "insertText")) cancelPending();
    if (!ready || !settings.enabled || event.isComposing ||
        event.inputType !== "insertText" || !event.data) return;
    cancelPending();
    const target = targetOf(event);
    if (!allowed(target)) return;
    typingSequence++;
    if (plainInput(target)) expandImmediately(target);
    else scheduleExpansion(target);
  }, true);

  // Some managed editors consume native input events or emit an InputEvent with
  // no data/inputType. Keyup is a fallback for actual typing, never paste/delete.
  document.addEventListener("keyup", event => {
    if (formEvent(event)) return;
    if (!ready || !settings.enabled || replacing || composing ||
        event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        event.key.length !== 1 || /\s/u.test(event.key)) return;
    const target = targetOf(event);
    if (allowed(target) && !plainInput(target)) scheduleExpansion(target);
  }, true);
  globalThis[instanceKey] = { refresh: refreshSettings };
  return refreshSettings();
})();
