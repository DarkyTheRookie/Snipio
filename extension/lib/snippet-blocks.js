// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(function (root) {
  "use strict";
  const labels = { date: "Today's date", time: "Current time", clipboard: "Clipboard", cursor: "Cursor position", form: "Fill-in field", condition: "If", otherwise: "Otherwise", end: "End condition" };
  const drawings = {
    date: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4m8-4v4M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    time: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    clipboard: '<path d="M9 5H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 18 5h-3"/><rect x="8" y="2.5" width="8" height="5" rx="1.5"/><path d="M8.5 12h7m-7 4h5"/>',
    cursor: '<path d="m5 3 14 10-7 1.5L8.5 21 5 3Z"/>',
    form: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 12h5m4-3v6m-1.5-6h3m-3 6h3"/>',
    condition: '<rect x="2" y="9.5" width="5" height="5" rx="1"/><rect x="17" y="2.5" width="5" height="5" rx="1"/><rect x="17" y="16.5" width="5" height="5" rx="1"/><path d="M7 12h5m0-7v14m0-14h5m-5 14h5"/>',
    otherwise: '<path d="M5 4v10a4 4 0 0 0 4 4h10m-4-4 4 4-4 4"/>',
    end: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'
  };
  function icon(type) { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[type] || drawings.form}</svg>`; }
  function conditionDetails(token) {
    const match = token.match(/^\{if:\s*(time|day|weekday|dayOfWeek|form\.[\w -]+?|form:\s*[^<>=!{}]+?)\s*(==|!=|<=|>=|<|>)\s*(.*?)\s*\}$/u);
    if (!match) return null;
    const left = match[1].trim();
    let value = match[3];
    if (/^"/u.test(value)) { try { value = JSON.parse(value); } catch {} }
    else if (/^'.*'$/u.test(value)) value = value.slice(1, -1).replace(/\\(['\\])/gu, "$1");
    return { source: left.startsWith("form") ? "form" : left === "time" ? "time" : "day", field: left.startsWith("form") ? left.slice(5).trim() : "", operator: match[2], value: String(value) };
  }
  function conditionLabel(token) {
    const value = conditionDetails(token);
    if (!value) return "If condition";
    const operators = { "==": "is", "!=": "is not", "<": "before", ">": "after", "<=": "at or before", ">=": "at or after" };
    const subject = value.source === "form" ? value.field : value.source === "time" ? "Time" : "Day";
    const expected = value.source === "time" && value.value === "12" ? "noon" : value.source === "time" && value.value === "0" ? "midnight" : value.value;
    return `If ${subject} ${operators[value.operator]} ${expected}`;
  }
  function tokenize(text) {
    const result = []; let end = 0;
    const pattern = /\{(?:date|time|clipboard|cursor)\}|\{form:\s*[^{}]+?\s*\}|\{if:\s*[^{}]+?\s*\}|\{else\}|\{endif\}/gu;
    for (const match of String(text).matchAll(pattern)) {
      if (match.index > end) result.push({ text: text.slice(end, match.index) });
      const token = match[0];
      const type = token.startsWith("{form:") ? "form" : token.startsWith("{if:") ? "condition" : token === "{else}" ? "otherwise" : token === "{endif}" ? "end" : token.slice(1, -1);
      const field = type === "form" ? token.slice(6, -1).trim() : null;
      result.push({ token, type, label: field ? `Fill in: ${field}` : type === "condition" ? conditionLabel(token) : labels[type], field });
      end = match.index + token.length;
    }
    if (end < text.length) result.push({ text: text.slice(end) });
    return result;
  }
  function createBlock(token, { editable = true } = {}) {
    const parsed = tokenize(token).find(item => item.token);
    if (!parsed) return document.createTextNode(token);
    const block = document.createElement("span");
    block.className = "snippet-block";
    block.dataset.token = parsed.token; block.dataset.type = parsed.type;
    block.contentEditable = "false";
    if (editable) { block.draggable = true; block.tabIndex = 0; block.setAttribute("role", "group"); }
    block.setAttribute("aria-label", parsed.label);
    const graphic = document.createElement("span"); graphic.className = "block-icon"; graphic.innerHTML = icon(parsed.type);
    const title = document.createElement("span"); title.className = "block-label"; title.textContent = parsed.label;
    block.append(graphic, title);
    if (editable) {
      if (["form", "condition"].includes(parsed.type)) {
        const edit = document.createElement("button"); edit.className = "block-edit"; edit.type = "button"; edit.textContent = "✎"; edit.setAttribute("aria-label", `Edit ${parsed.label}`); edit.tabIndex = -1; block.append(edit);
      }
      const remove = document.createElement("button"); remove.className = "block-remove"; remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Remove ${parsed.label}`); remove.tabIndex = -1; block.append(remove);
    }
    return block;
  }
  function fragment(text, { editable = true } = {}) {
    const result = document.createDocumentFragment();
    for (const item of tokenize(text)) result.append(item.token ? createBlock(item.token, { editable }) : document.createTextNode(item.text));
    return result;
  }
  function hydrate(container, { editable = true, preserveSelection = false } = {}) {
    const selection = preserveSelection ? window.getSelection() : null;
    const endpoints = selection?.rangeCount ? { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset } : null;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (!walker.currentNode.parentElement?.closest(".snippet-block")) nodes.push(walker.currentNode);
    function position(children, offset) {
      for (const child of children) {
        const length = child.nodeType === 3 ? child.length : child.dataset.token.length;
        if (offset < length || (offset === length && child.nodeType === 3)) return child.nodeType === 3 ? [child, offset] : [child.parentNode, [...child.parentNode.childNodes].indexOf(child) + 1];
        offset -= length;
      }
      const last = children.at(-1);
      return last ? [last.parentNode, [...last.parentNode.childNodes].indexOf(last) + 1] : null;
    }
    for (const node of nodes) {
      if (!tokenize(node.data).some(item => item.token)) continue;
      const contents = fragment(node.data, { editable });
      const children = [...contents.childNodes];
      node.replaceWith(contents);
      if (endpoints?.anchor === node) [endpoints.anchor, endpoints.anchorOffset] = position(children, endpoints.anchorOffset);
      if (endpoints?.focus === node) [endpoints.focus, endpoints.focusOffset] = position(children, endpoints.focusOffset);
    }
    if (endpoints && container.contains(endpoints.anchor) && container.contains(endpoints.focus)) {
      try { selection.setBaseAndExtent(endpoints.anchor, endpoints.anchorOffset, endpoints.focus, endpoints.focusOffset); } catch {}
    }
    return container;
  }
  function renderEditor(container, source, { format = "text", editable = true } = {}) {
    if (format === "html") { container.innerHTML = RichSnippet.sanitize(source); hydrate(container, { editable }); }
    else container.replaceChildren(fragment(source, { editable }));
    return container;
  }
  function serialize(container, { format = "text" } = {}) {
    const copy = container.cloneNode(true);
    if (["<br>", "<div><br></div>"].includes(copy.innerHTML)) return "";
    for (const block of copy.querySelectorAll(".snippet-block[data-token]")) block.replaceWith(document.createTextNode(block.dataset.token));
    for (const marker of copy.querySelectorAll("[data-builder-marker]")) marker.remove();
    return format === "html" ? RichSnippet.sanitize(copy.innerHTML) : RichSnippet.text(copy.innerHTML);
  }
  function renderPreview(container, source, { format = "text", compact = false } = {}) {
    container.classList.add("snippet-blocks-preview");
    container.classList.toggle("compact", compact);
    return renderEditor(container, source, { format, editable: false });
  }
  root.SnippetBlocks = { icon, labels, tokenize, conditionDetails, createBlock, fragment, hydrate, renderEditor, serialize, renderPreview };
})(globalThis);
