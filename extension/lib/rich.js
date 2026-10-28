// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(function (root) {
  "use strict";
  const allowed = new Set(["B", "STRONG", "I", "EM", "A", "UL", "OL", "LI", "P", "DIV", "BR"]);
  const discard = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "INPUT", "TEXTAREA", "BUTTON", "SELECT", "TEMPLATE", "IMG", "VIDEO", "AUDIO", "LINK", "META", "BASE"]);
  function safeLink(value) {
    if (/[{}]/u.test(value)) return null;
    try { const url = new URL(value); return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }
  function sanitize(html, doc = document) {
    const template = doc.createElement("template"); template.innerHTML = html;
    function clean(node) {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 8) { child.remove(); continue; }
        if (child.nodeType !== 1) continue;
        if (discard.has(child.tagName)) { child.remove(); continue; }
        clean(child);
        if (!allowed.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
        const href = child.tagName === "A" ? safeLink(child.getAttribute("href")) : null;
        for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
        if (href) { child.setAttribute("href", href); child.setAttribute("rel", "noopener noreferrer"); }
      }
    }
    clean(template.content);
    return template.innerHTML;
  }
  function text(html, doc = document) {
    const template = doc.createElement("template"); template.innerHTML = sanitize(html, doc);
    let output = "";
    let boundary = false;
    function append(value) {
      if (!value) return;
      if (boundary && output && !output.endsWith("\n")) output += "\n";
      output += value; boundary = false;
    }
    function read(node) {
      if (node.nodeType === 3) { append(node.data); return; }
      if (node.nodeName === "BR") { append("\n"); return; }
      const block = /^(P|DIV|LI|UL|OL)$/u.test(node.nodeName);
      if (block) boundary = true;
      for (const child of node.childNodes) read(child);
      if (block) boundary = true;
    }
    read(template.content);
    return output;
  }
  function escape(value) { return String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;"); }
  function expand(html, values) {
    // Only text nodes are templates; variables never modify links or attributes.
    const template = document.createElement("template"); template.innerHTML = QuickPhrase.renderLogic(logicSource(html), values);
    const marker = `rain-cursor-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;
    let foundCursor = false;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const source = node.data.replace(/\{cursor\}/gu, () => {
        if (foundCursor) return "";
        foundCursor = true; return marker;
      });
      node.data = QuickPhrase.expandVariables(source, values).replacement;
    }
    const plain = text(template.innerHTML);
    const cursor = plain.indexOf(marker);
    return { html: template.innerHTML.replace(marker, ""), replacement: plain.replace(marker, ""), cursor: cursor < 0 ? null : cursor };
  }
  function logicSource(html) {
    return sanitize(html).replace(/\{[^{}]*\}/gu, token => {
      const template = document.createElement("template"); template.innerHTML = token;
      return template.content.textContent;
    });
  }
  root.RichSnippet = { sanitize, text, escape, expand, safeLink, logicSource };
})(globalThis);
