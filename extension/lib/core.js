// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(function (root) {
  "use strict";
  const defaults = {
    enabled: true,
    mode: "immediate",
    shortcuts: [{ id: "welcome", trigger: "hi", replacement: "Hello, how are you?" }]
  };
  const SIMPLE_TEXT_LIMIT = 280;
  const SIMPLE_LINE_LIMIT = 4;

  // Every extension view shares this origin-scoped lock. Keep each complete
  // storage read/modify/write operation inside it, including resets.
  function withLibraryLock(operation) {
    if (root.navigator?.locks?.request) return root.navigator.locks.request("snipio-library", operation);
    return operation();
  }

  function isSimpleSnippet(item) {
    if (!item || (item.format && item.format !== "text") || typeof item.replacement !== "string") return false;
    return item.replacement.length <= SIMPLE_TEXT_LIMIT &&
      item.replacement.split(/\r\n|\r|\n/u).length <= SIMPLE_LINE_LIMIT &&
      // Incomplete directives also belong in the full editor, so a draft can be
      // handed over as soon as someone starts building a dynamic snippet.
      !/\{\s*(?:date|time|clipboard|cursor|form|if|else|endif)(?=\b|:|\}|$)/iu.test(item.replacement);
  }

  function triggersFor(item) {
    return Array.isArray(item.triggers) ? item.triggers : [item.trigger];
  }

  function findTriggerConflict(shortcuts, triggers, editingId = null) {
    const valid = trigger => typeof trigger === "string" && trigger.length > 0;
    const existing = shortcuts.filter(item => editingId === null || item.id !== editingId)
      .flatMap(triggersFor).filter(valid);
    const overlaps = (first, second) => first.startsWith(second) || second.startsWith(first);
    return triggers.find((trigger, index) => valid(trigger) && (
      existing.some(alias => overlaps(trigger, alias)) ||
      triggers.some((alias, otherIndex) => otherIndex !== index && valid(alias) && overlaps(trigger, alias))
    )) || null;
  }

  function findNameConflict(shortcuts, name, editingId = null) {
    const key = (name || "").trim().toLowerCase();
    return key ? shortcuts.find(item => item.id !== editingId && (item.name || "").trim().toLowerCase() === key) || null : null;
  }

  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    const used = new Set();
    const folderIds = new Set();
    const folders = (Array.isArray(source.folders) ? source.folders : []).filter(folder => {
      if (!folder || typeof folder.id !== "string" || !folder.id || folderIds.has(folder.id) || typeof folder.name !== "string" || !folder.name.trim()) return false;
      folderIds.add(folder.id); return true;
    }).map(folder => ({ id: folder.id, name: folder.name.trim().slice(0, 100), ...(folder.favorite === true ? { favorite: true } : {}) }));
    const shortcuts = [];
    (Array.isArray(source.shortcuts) ? source.shortcuts : defaults.shortcuts).forEach((item, index) => {
      if (!item || typeof item.replacement !== "string" || !item.replacement.length) return;
      const triggers = triggersFor(item).filter(trigger => {
        if (typeof trigger !== "string" || !trigger.length || /\s/u.test(trigger) || used.has(trigger)) return false;
        used.add(trigger);
        return true;
      });
      if (triggers.length) shortcuts.push({
        id: String(item.id || `shortcut-${index}`), trigger: triggers[0], triggers, replacement: item.replacement,
        name: typeof item.name === "string" ? item.name.slice(0, 100) : "",
        favorite: item.favorite === true,
        ...(typeof item.description === "string" ? { description: item.description.slice(0, 500) } : {}),
        ...(typeof item.exampleKey === "string" ? { exampleKey: item.exampleKey, isExample: item.isExample === true } : {}),
        format: item.format === "html" ? "html" : "text",
        tags: [...new Set((Array.isArray(item.tags) ? item.tags : []).filter(tag => typeof tag === "string").map(tag => tag.trim().slice(0, 50)).filter(Boolean))].slice(0, 30),
        folderId: folderIds.has(item.folderId) ? item.folderId : null
      });
    });
    return {
      enabled: source.enabled !== false,
      mode: defaults.mode,
      shortcuts, folders,
      ...(source.snipioFoldersVersion === 1 ? { snipioFoldersVersion: 1 } : {}),
      ...(Number.isSafeInteger(source.snipioDemosVersion) && source.snipioDemosVersion >= 1 ? { snipioDemosVersion: source.snipioDemosVersion } : {})
    };
  }

  function match(text, shortcuts) {
    return shortcuts.flatMap(item => triggersFor(item).map(trigger => ({ ...item, trigger })))
      .sort((a, b) => b.trigger.length - a.trigger.length).find(item => {
      if (!text.endsWith(item.trigger)) return false;
      const before = text.slice(0, text.length - item.trigger.length);
      return before.length === 0 || /\s$/u.test(before);
    }) || null;
  }

  function formFields(text) {
    return parseTemplate(text).fields;
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  function condition(source) {
    const match = source.match(/^\s*(time|day|weekday|dayOfWeek|form\.[\w -]+?|form:\s*[^<>=!{}]+?)\s*(==|!=|<=|>=|<|>)\s*(.*?)\s*$/u);
    if (!match || !match[3]) throw new Error('Expected a comparison such as time < 12, day == "Monday", or form.name == "Ada".');
    const left = match[1].trim();
    const field = left.startsWith("form.") || left.startsWith("form:") ? left.slice(5).trim() : null;
    if (field !== null && (!field || field.length > 100)) throw new Error("Form field names must contain 1–100 characters.");
    const literal = match[3];
    let value;
    if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(literal)) value = Number(literal);
    else if (/^"(?:[^"\\]|\\["\\])*"$/u.test(literal)) value = JSON.parse(literal);
    else if (/^'(?:[^'\\]|\\['\\])*'$/u.test(literal)) value = literal.slice(1, -1).replace(/\\(['\\])/gu, "$1");
    else if (weekdays.includes(literal.toLowerCase())) value = literal;
    else throw new Error('Use a number or quoted text on the right of a comparison.');
    if (["day", "weekday", "dayOfWeek"].includes(left)) {
      if (typeof value === "string") value = weekdays.indexOf(value.toLowerCase());
      if (!Number.isInteger(value) || value < 0 || value > 6) throw new Error('Day must be 0–6 (Sunday–Saturday) or a weekday name.');
    }
    if (left === "time" && (typeof value !== "number" || value < 0 || value > 24)) throw new Error("Time comparisons use hours from 0 to 24, for example time < 12.");
    return { left, field, operator: match[2], value };
  }
  function parseTemplate(text) {
    const root = [];
    const stack = [];
    const fields = new Set();
    let nodes = root;
    let end = 0;
    function fail(message, offset) {
      throw new Error(`Line ${text.slice(0, offset).split("\n").length}: ${message}`);
    }
    function addField(name, offset) {
      if (!name || name.length > 100) fail("Form field names must contain 1–100 characters.", offset);
      fields.add(name);
      if (fields.size > 30) fail("Use at most 30 fill-in fields per snippet.", offset);
    }
    function literal(value, offset) {
      if (/\{(?:if\b|else\b|endif\b|form\s*:)/u.test(value)) fail("Unclosed or malformed template directive. Check its braces.", offset);
      if (value) nodes.push(value);
    }
    for (const token of text.matchAll(/\{([^{}]*)\}/gu)) {
      literal(text.slice(end, token.index), end);
      const body = token[1].trim();
      if (/^if\b/u.test(body)) {
        if (!body.startsWith("if:")) fail("Write {if: comparison}.", token.index);
        let test;
        try { test = condition(body.slice(3)); } catch (error) { fail(error.message, token.index); }
        if (test.field !== null) addField(test.field, token.index);
        if (stack.length >= 20) fail("Conditionals may nest at most 20 levels deep.", token.index);
        const branch = { test, yes: [], no: [], offset: token.index };
        nodes.push(branch); stack.push({ branch, parent: nodes, hasElse: false }); nodes = branch.yes;
      } else if (body === "else") {
        const frame = stack.at(-1);
        if (!frame || frame.hasElse) fail("{else} needs one matching {if: ...} and may appear only once.", token.index);
        frame.hasElse = true; nodes = frame.branch.no;
      } else if (body === "endif") {
        const frame = stack.pop();
        if (!frame) fail("{endif} has no matching {if: ...}.", token.index);
        nodes = frame.parent;
      } else {
        if (/^(else|endif)\b/u.test(body)) fail("Use {else} or {endif} without extra text.", token.index);
        if (/^form\b/u.test(body)) {
          if (!body.startsWith("form:")) fail("Write a fill-in field as {form: name}.", token.index);
          addField(body.slice(5).trim(), token.index);
        }
        nodes.push(token[0]);
      }
      end = token.index + token[0].length;
    }
    literal(text.slice(end), end);
    if (stack.length) fail("Missing {endif} for this {if: ...}.", stack.at(-1).branch.offset);
    return { nodes: root, fields: [...fields] };
  }
  function validateTemplate(text) {
    try { parseTemplate(text); return ""; } catch (error) { return error.message; }
  }
  function renderLogic(text, { now = new Date(), fields = {} } = {}) {
    function evaluate(test) {
      let left = test.field !== null ? (Object.hasOwn(fields, test.field) ? fields[test.field] : "")
        : test.left === "time" ? now.getHours() + now.getMinutes() / 60 : now.getDay();
      if (typeof test.value === "number" && typeof left === "string") {
        if (!left.trim() || !Number.isFinite(Number(left))) return test.operator === "!=";
        left = Number(left);
      }
      switch (test.operator) {
        case "==": return left === test.value;
        case "!=": return left !== test.value;
        case "<": return left < test.value;
        case ">": return left > test.value;
        case "<=": return left <= test.value;
        case ">=": return left >= test.value;
      }
    }
    function render(nodes) { return nodes.map(node => typeof node === "string" ? node : render(evaluate(node.test) ? node.yes : node.no)).join(""); }
    return render(parseTemplate(text).nodes);
  }

  function expandVariables(text, { now = new Date(), clipboard = "", fields = {} } = {}) {
    let cursor = null;
    let output = "";
    // One pass: clipboard text is data, never another template to evaluate.
    const pattern = /\{(date|time|clipboard|cursor)\}|\{form:\s*([^{}]+?)\s*\}/gu;
    let end = 0;
    for (const token of text.matchAll(pattern)) {
      output += text.slice(end, token.index);
      if (token[1] === "cursor") { if (cursor === null) cursor = output.length; }
      else output += token[2] ? (Object.hasOwn(fields, token[2].trim()) ? fields[token[2].trim()] : "")
        : token[1] === "date" ? now.toLocaleDateString()
        : token[1] === "time" ? now.toLocaleTimeString() : clipboard;
      end = token.index + token[0].length;
    }
    return { replacement: output + text.slice(end), cursor };
  }

  function filterSnippets(items, search, folder = "*", content = item => item.replacement) {
    const query = search.trim().toLocaleLowerCase();
    return items.filter(item => (folder === "*" || (item.folderId || "") === folder) &&
      [item.name, ...triggersFor(item), content(item), ...(item.tags || [])].join(" ").toLocaleLowerCase().includes(query));
  }

  function normalizeStats(value) {
    const seen = new Set();
    return { entries: (Array.isArray(value?.entries) ? value.entries : []).filter(entry => {
      if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) return false;
      seen.add(entry.id); return true;
    }).map(entry => ({ id: entry.id,
      count: Number.isSafeInteger(entry.count) && entry.count > 0 ? entry.count : 0,
      saved: Number.isSafeInteger(entry.saved) && entry.saved > 0 ? entry.saved : 0 })) };
  }
  function recordUsage(stats, id, expansionLength, triggerLength) {
    const next = normalizeStats(stats);
    let entry = next.entries.find(item => item.id === id);
    if (!entry) { entry = { id, count: 0, saved: 0 }; next.entries.push(entry); }
    entry.count = Math.min(Number.MAX_SAFE_INTEGER, entry.count + 1);
    entry.saved = Math.min(Number.MAX_SAFE_INTEGER, entry.saved + Math.max(0, expansionLength - triggerLength));
    return next;
  }

  function sharePayload(value) {
    if (!value || value.type !== "rain-snippets" || value.version !== 1 ||
        !Array.isArray(value.shortcuts) || !value.shortcuts.length || value.shortcuts.length > 100 ||
        !Array.isArray(value.folders) || value.folders.length > 100) throw new Error("This is not a supported Snipio sharing code (version 1, up to 100 snippets).");
    const ids = new Set();
    for (const folder of value.folders) {
      if (!folder || typeof folder.id !== "string" || !folder.id || folder.id.length > 100 || ids.has(folder.id) ||
          typeof folder.name !== "string" || !folder.name.trim() || folder.name.length > 100) throw new Error("The sharing code contains an invalid folder.");
      ids.add(folder.id);
    }
    const snippetIds = new Set();
    const triggers = new Set();
    for (const item of value.shortcuts) {
      if (!item || typeof item.id !== "string" || !item.id || item.id.length > 100 || snippetIds.has(item.id) ||
          typeof item.replacement !== "string" || !item.replacement.trim() || item.replacement.length > 20000 ||
          !["text", "html"].includes(item.format) || typeof item.name !== "string" || item.name.length > 100 ||
          (item.description !== undefined && (typeof item.description !== "string" || item.description.length > 500)) ||
          !Array.isArray(item.tags) || item.tags.length > 30 || item.tags.some(tag => typeof tag !== "string" || tag.length > 50) ||
          (item.folderId !== null && !ids.has(item.folderId)) || !Array.isArray(item.triggers) || !item.triggers.length || item.triggers.length > 100) throw new Error("The sharing code contains an invalid snippet.");
      snippetIds.add(item.id);
      for (const trigger of item.triggers) {
        if (typeof trigger !== "string" || !trigger || trigger.length > 100 || /\s/u.test(trigger) || triggers.has(trigger)) throw new Error("The sharing code has invalid or duplicate triggers.");
        triggers.add(trigger);
      }
    }
    return normalize(value);
  }
  function encodeShare(settings, shortcuts) {
    const folderIds = new Set(shortcuts.map(item => item.folderId));
    const payload = { type: "rain-snippets", version: 1,
      folders: settings.folders.filter(folder => folderIds.has(folder.id)),
      shortcuts: shortcuts.map(item => ({ id: item.id, trigger: item.trigger, triggers: [...item.triggers],
        ...(item.description ? { description: item.description } : {}),
        replacement: item.replacement, name: item.name, favorite: item.favorite === true, tags: [...item.tags], folderId: item.folderId, format: item.format })) };
    sharePayload(payload);
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (bytes.length > 1000000) throw new Error("This selection is too large to share. Export fewer snippets (maximum 1 MB).");
    let binary = "";
    for (let index = 0; index < bytes.length; index += 32000) binary += String.fromCharCode(...bytes.subarray(index, index + 32000));
    return "RAIN1." + btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
  }
  function decodeShare(code) {
    const source = code.trim();
    if (source.length > 1333342) throw new Error("Sharing code is too large (maximum 1 MB decoded).");
    if (!/^RAIN1\.[A-Za-z0-9_-]+$/u.test(source)) throw new Error("Paste a complete Snipio sharing code beginning with RAIN1.");
    let value;
    try {
      const bytes = Uint8Array.from(atob(source.slice(6).replace(/-/gu, "+").replace(/_/gu, "/")), char => char.charCodeAt(0));
      if (bytes.length > 1000000) throw new Error();
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch { throw new Error("This sharing code is damaged or incomplete. Ask for a fresh copy."); }
    return sharePayload(value);
  }

  const api = { defaults, SIMPLE_TEXT_LIMIT, SIMPLE_LINE_LIMIT, withLibraryLock, isSimpleSnippet, findTriggerConflict, findNameConflict, normalize, match, triggersFor, expandVariables, filterSnippets, formFields, normalizeStats, recordUsage, parseTemplate, validateTemplate, renderLogic, encodeShare, decodeShare };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QuickPhrase = api;
})(globalThis);
