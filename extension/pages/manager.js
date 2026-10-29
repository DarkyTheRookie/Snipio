// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(() => {
  "use strict";
  const extensionApi = globalThis.browser || globalThis.chrome;
  const $ = id => document.getElementById(id);
  const DRAFT_KEY = "snipioEditorDraft";
  const QUICK_DRAFT_KEY = "snipioQuickDraft";
  let settings, editingId = null, originalItem = null, previewItem = null;
  let busy = false, handingOff = false, favoritesOnly = false;
  let routingTimer = null;
  let autosaveTimer = null, draftTimer = null, quickDirty = false;
  let quickToken = null, pendingSnippetId = null, baselineValues = null;
  let mutationQueue = Promise.resolve(), quickSaveQueue = Promise.resolve();
  let libraryResetAt = null, libraryEpoch = 0;
  const heartIcon = '<svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 5.8a5.1 5.1 0 0 0-7.2 0L12 6.9l-1.1-1.1a5.1 5.1 0 0 0-7.2 7.2L12 21l8.2-8a5.1 5.1 0 0 0 0-7.2Z"/></svg>';
  function sameSavedValue(key, left, right) {
    if (key === "name") return (left || "").trim() === (right || "").trim();
    if (key === "triggers") {
      const aliases = value => [...new Set((value || "").split(/\r?\n/u).map(alias => alias.trim()).filter(Boolean))].join("\n");
      return aliases(left) === aliases(right);
    }
    return left === right;
  }

  function save(change) {
    const epoch = libraryEpoch;
    mutationQueue = mutationQueue.catch(() => false).then(() => QuickPhrase.withLibraryLock(() => mutate(change, epoch)));
    return mutationQueue;
  }
  function validateName() {
    const error = QuickPhrase.findNameConflict(settings?.shortcuts || [], $("snippet-name").value, editingId || pendingSnippetId) ? "A snippet with this name already exists." : "";
    $("snippet-name-error").textContent = error;
    if (error) $("form-error").textContent = "";
    $("snippet-name").setAttribute("aria-invalid", String(!!error));
    $("shortcut-form").querySelector('[type="submit"]').disabled = busy || !!error;
    return error;
  }
  async function mutate(change, epoch) {
    if (!settings || epoch !== libraryEpoch) return false;
    busy = true;
    try {
      const stored = await extensionApi.storage.local.get(["quickPhrase", "snipioLibraryResetAt"]);
      if (epoch !== libraryEpoch || (stored.snipioLibraryResetAt ?? null) !== libraryResetAt) return false;
      const latest = QuickPhrase.normalize(stored.quickPhrase);
      settings = latest;
      const next = QuickPhrase.normalize(typeof change === "function" ? change(latest) : change);
      await extensionApi.storage.local.set({ quickPhrase: next });
      try { await extensionApi.runtime.sendMessage?.({ type: "quickphrase:sync" }); } catch {}
      settings = next; render(); $("status").textContent = "Saved on this device.";
      return true;
    } catch (error) { $("form-error").textContent = error.message || "Could not save. Please try again."; $("status").textContent = "Could not save. Your draft is kept."; return false; }
    finally { busy = false; validateName(); }
  }
  function fillFolders(select, selected, all = false) {
    select.replaceChildren();
    const folders = [...settings.folders].sort((left, right) => Number(!!right.favorite) - Number(!!left.favorite));
    for (const folder of [...(all ? [{ id: "*", name: "All folders" }] : []), { id: "", name: "No folder" }, ...folders]) {
      const option = document.createElement("option"); option.value = folder.id; option.textContent = `${folder.favorite ? "♥ " : ""}${folder.name}`; select.append(option);
    }
    select.value = selected;
    if (select.selectedIndex < 0) select.value = all ? "*" : "";
  }
  function plain(item) { return item.format === "html" ? RichSnippet.text(item.replacement) : item.replacement; }
  function kind(item) {
    if (item.format === "html") return "Rich text";
    if (/\{if:/u.test(item.replacement)) return "Logic";
    if (/\{form:/u.test(item.replacement)) return "Form";
    if (/\{(?:date|time|clipboard|cursor)\}/u.test(item.replacement)) return "Dynamic";
    return QuickPhrase.isSimpleSnippet(item) ? "" : "Long text";
  }
  function button(label, className, accessibleName, handler) {
    const element = document.createElement("button"); element.type = "button"; element.className = className;
    element.textContent = label; element.setAttribute("aria-label", accessibleName); element.onclick = handler;
    return element;
  }
  function render() {
    $("enabled").checked = settings.enabled; $("count").textContent = settings.shortcuts.length;
    $("expansion-state").replaceChildren(); const dot = document.createElement("i");
    $("expansion-state").append(dot, document.createTextNode(settings.enabled ? "Expands instantly" : "Expansion paused"));
    const sample = settings.shortcuts.find(QuickPhrase.isSimpleSnippet);
    $("playground").placeholder = sample ? "Type " + sample.trigger + " here…" : "Type a snippet trigger here…";
    fillFolders($("folder-filter"), $("folder-filter").selectedIndex < 0 ? "*" : $("folder-filter").value, true);
    const selectedFolder = settings.folders.find(item => item.id === $("folder-filter").value);
    $("folder-rename").disabled = $("folder-delete").disabled = !selectedFolder;
    $("folder-favorite").disabled = !selectedFolder;
    $("folder-favorite").setAttribute("aria-pressed", String(!!selectedFolder?.favorite));
    $("folder-favorite").setAttribute("aria-label", selectedFolder?.favorite ? "Remove folder from favorites" : "Add folder to favorites");
    $("folder-favorite").title = !selectedFolder ? "Select a folder to add it to favorites" : selectedFolder.favorite ? "Remove folder from favorites" : "Add folder to favorites";
    $("favorites").setAttribute("aria-pressed", String(favoritesOnly));
    const filtered = QuickPhrase.filterSnippets(settings.shortcuts, $("search").value.toLocaleLowerCase(), $("folder-filter").value, plain)
      .filter(item => !favoritesOnly || item.favorite);
    $("list").replaceChildren();
    if (favoritesOnly) {
      for (const folder of settings.folders.filter(folder => folder.favorite && ($("folder-filter").value === "*" || $("folder-filter").value === folder.id) && folder.name.toLocaleLowerCase().includes($("search").value.toLocaleLowerCase()))) {
        const row = document.createElement("article"); row.className = "favorite-folder-row";
        const count = settings.shortcuts.filter(item => item.folderId === folder.id).length;
        const open = button("", "favorite-folder-open", `Open favorite folder ${folder.name}`, () => { $("folder-filter").value = folder.id; favoritesOnly = false; render(); });
        const symbol = document.createElement("span"); symbol.textContent = "▱"; symbol.setAttribute("aria-hidden", "true");
        const name = document.createElement("strong"); name.textContent = folder.name;
        const total = document.createElement("small"); total.textContent = `${count} ${count === 1 ? "snippet" : "snippets"}`;
        open.append(symbol, name, total);
        const star = button("", "favorite", `Unfavorite folder ${folder.name}`, () => save(latest => ({ ...latest, folders: latest.folders.map(entry => entry.id === folder.id ? { ...entry, favorite: false } : entry) })));
        star.innerHTML = heartIcon; star.setAttribute("aria-pressed", "true"); star.title = "Remove folder from favorites";
        row.append(open, star); $("list").append(row);
      }
    }
    for (const item of filtered) {
      const row = document.createElement("article"); row.className = "shortcut";
      const open = button("", "snippet-open", "Preview " + item.trigger, () => preview(item));
      const top = document.createElement("div"); top.className = "snippet-top";
      const name = document.createElement("span"); name.className = "snippet-name"; name.textContent = item.name || item.trigger; top.append(name);
      if (kind(item)) { const type = document.createElement("span"); type.className = "kind"; type.textContent = kind(item); top.append(type); }
      const text = document.createElement("span"); text.className = "snippet-text";
      SnippetBlocks.renderPreview(text, item.replacement, { format: item.format, compact: true });
      const bottom = document.createElement("div"); bottom.className = "snippet-bottom";
      for (const alias of item.triggers.slice(0, 2)) { const chip = document.createElement("span"); chip.className = "trigger"; chip.textContent = alias; bottom.append(chip); }
      if (item.triggers.length > 2) { const more = document.createElement("span"); more.className = "more-aliases"; more.textContent = "+" + (item.triggers.length - 2); bottom.append(more); }
      const folderName = settings.folders.find(folder => folder.id === item.folderId)?.name;
      if (folderName) { const folder = document.createElement("span"); folder.className = "snippet-folder"; folder.textContent = folderName; bottom.append(folder); }
      open.append(top, text, bottom);
      const actions = document.createElement("div"); actions.className = "row-actions";
      const favorite = button("", "favorite", (item.favorite ? "Unfavorite " : "Favorite ") + item.trigger, () => save(latest => ({ ...latest, shortcuts: latest.shortcuts.map(entry => entry.id === item.id ? { ...entry, favorite: !entry.favorite } : entry) })));
      favorite.innerHTML = heartIcon;
      favorite.setAttribute("aria-pressed", String(item.favorite)); favorite.title = item.favorite ? "Remove from favorites" : "Save to favorites";
      const small = document.createElement("div"); small.className = "small-actions";
      small.append(button("Edit", "", "Edit " + item.trigger, () => openEditor(item)), button("Delete", "delete", "Delete " + item.trigger, async () => {
        if (!confirm("Delete “" + (item.name || item.trigger) + "”?")) return;
        await save(latest => ({ ...latest, shortcuts: latest.shortcuts.filter(entry => entry.id !== item.id) }));
      }));
      actions.append(favorite, small); row.append(open, actions); $("list").append(row);
    }
    $("empty").hidden = $("list").childElementCount > 0;
    $("empty").textContent = $("search").value ? "No matching snippets." : favoritesOnly ? "Like a snippet to keep it here." : "No snippets here yet. Add one above.";
  }
  function preview(item) {
    previewItem = item; $("preview-title").textContent = item.name || item.trigger;
    $("preview-description").textContent = item.triggers.join(" · ");
    SnippetBlocks.renderPreview($("preview-content"), item.replacement, { format: item.format });
    $("preview-kind").textContent = QuickPhrase.isSimpleSnippet(item) ? "Plain text · Edit right here." : kind(item) + " · Opens in the full editor to edit.";
    $("preview-edit").textContent = QuickPhrase.isSimpleSnippet(item) ? "Edit snippet" : "Edit in full editor ↗";
    $("preview-dialog").showModal();
  }
  function valuesFor(item) {
    return { name: item?.name || "", description: item?.description || "", triggers: item?.triggers.join("\n") || "", replacement: item?.replacement || "", format: item?.format || "text", folderId: item?.folderId || null, tags: item?.tags.join(", ") || "", favorite: item?.favorite || false };
  }
  function formValues() {
    const latest = settings.shortcuts.find(item => item.id === editingId) || originalItem;
    return { ...valuesFor(latest), name: $("snippet-name").value, triggers: $("trigger").value, replacement: $("replacement").value, folderId: $("snippet-folder").value || null };
  }
  function quickStatus(message) { const element = $("quick-save-status"); if (element) element.textContent = message; }
  function quickDraft() { return { editingId, pendingSnippetId, baselineValues, libraryResetAt, token: quickToken, values: formValues(), updatedAt: Date.now() }; }
  async function persistQuickDraft() {
    clearTimeout(draftTimer);
    if (!quickDirty || !quickToken) return;
    const draft = quickDraft(), epoch = libraryEpoch;
    try { await QuickPhrase.withLibraryLock(async () => { const saved = await extensionApi.storage.local.get("snipioLibraryResetAt"); if (epoch === libraryEpoch && quickDirty && (saved.snipioLibraryResetAt ?? null) === draft.libraryResetAt) await extensionApi.storage.local.set({ [QUICK_DRAFT_KEY]: draft }); }); }
    catch { quickStatus("Could not save your draft. Keep this window open and try again."); }
  }
  function clearQuickDraft(token = quickToken) {
    const epoch = libraryEpoch;
    return QuickPhrase.withLibraryLock(async () => {
      const saved = await extensionApi.storage.local.get([QUICK_DRAFT_KEY, "snipioLibraryResetAt"]);
      if (epoch === libraryEpoch && (saved.snipioLibraryResetAt ?? null) === libraryResetAt && saved[QUICK_DRAFT_KEY]?.token === token && !quickDirty) await extensionApi.storage.local.set({ [QUICK_DRAFT_KEY]: null });
    });
  }
  function markChanged() {
    if (handingOff) return;
    quickDirty = true; $("form-error").textContent = ""; quickStatus("Saving…");
    clearTimeout(draftTimer); draftTimer = setTimeout(persistQuickDraft, 120);
    clearTimeout(autosaveTimer); autosaveTimer = null;
    if (validateName()) { quickStatus("Choose a different snippet name to save"); return; }
    autosaveTimer = setTimeout(() => { autosaveTimer = null; void commitQuick(); }, 650);
  }
  async function handoff(item = null, values = null) {
    if (handingOff) return;
    handingOff = true;
    clearTimeout(autosaveTimer); clearTimeout(draftTimer); clearTimeout(routingTimer);
    try {
      await quickSaveQueue;
      if (values && $("editor").open) values = formValues();
      if (values || item) {
        const epoch = libraryEpoch;
        await QuickPhrase.withLibraryLock(async () => {
          if (epoch !== libraryEpoch) throw new Error("The library was reset. Reopen the snippet to continue.");
          const persisted = { editingId: $("editor").open ? editingId : item?.id || null, pendingSnippetId: $("editor").open ? pendingSnippetId : item?.id || null, baselineValues: $("editor").open ? baselineValues : valuesFor(item), libraryResetAt, values: values || valuesFor(item), token: crypto.randomUUID(), updatedAt: Date.now() };
          await extensionApi.storage.local.set({ [DRAFT_KEY]: persisted });
        });
      }
      await extensionApi.runtime.openOptionsPage();
      quickDirty = false; await clearQuickDraft();
      if ($("editor").open) $("editor").close();
      if ($("preview-dialog").open) $("preview-dialog").close();
      $("status").textContent = values || item ? "Your draft is ready in the full editor." : "Full editor opened.";
    } catch { $("form-error").textContent = "Could not open the full editor. Your text is still here. Try again."; $("status").textContent = "Could not open the full editor. Try again."; }
    finally { handingOff = false; }
  }
  function openEditor(item = null, draft = null) {
    clearTimeout(routingTimer);
    if (item && !QuickPhrase.isSimpleSnippet(item)) { void handoff(item); return; }
    editingId = draft?.editingId || item?.id || null; originalItem = item;
    quickToken = draft?.token || crypto.randomUUID(); pendingSnippetId = draft?.pendingSnippetId || editingId || crypto.randomUUID();
    baselineValues = draft?.baselineValues || valuesFor(item);
    quickDirty = !!draft;
    const current = draft?.values || valuesFor(item);
    $("editor-title").textContent = item ? "Edit snippet" : "New snippet";
    $("snippet-name").value = current.name || ""; $("trigger").value = current.triggers || ""; $("replacement").value = current.replacement || "";
    fillFolders($("snippet-folder"), current.folderId || (settings.folders.some(folder => folder.id === $("folder-filter").value) ? $("folder-filter").value : ""));
    $("character-count").textContent = $("replacement").value.length + " / 280"; $("form-error").textContent = "";
    $("editor").showModal(); $("trigger").focus();
    validateName();
    quickStatus(draft ? "Draft restored · changes autosave" : "Changes autosave");
    if (draft) { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => commitQuick(), 650); }
  }
  $("replacement").oninput = () => {
    $("character-count").textContent = $("replacement").value.length + " / 280";
    clearTimeout(routingTimer);
    markChanged();
    // Paste and IME can deliver several input events. Capture the complete edit
    // once before handing it to the dashboard.
    routingTimer = setTimeout(() => {
      if ($("editor").open && !QuickPhrase.isSimpleSnippet({ format: "text", replacement: $("replacement").value })) void handoff(originalItem, formValues());
    }, 180);
  };
  function commitQuick({ close = false } = {}) {
    clearTimeout(autosaveTimer); autosaveTimer = null;
    quickSaveQueue = quickSaveQueue.catch(() => false).then(() => saveQuick({ close }));
    return quickSaveQueue;
  }
  async function saveQuick({ close }) {
    if (handingOff || !$("editor").open) return false;
    if (validateName()) { quickStatus("Choose a different snippet name to save"); await persistQuickDraft(); return false; }
    if (!quickDirty) { if (close) $("editor").close(); return true; }
    const values = formValues();
    if (!QuickPhrase.isSimpleSnippet(values)) { await persistQuickDraft(); return false; }
    const triggers = [...new Set(values.triggers.split(/\r?\n/u).map(value => value.trim()).filter(Boolean))];
    const conflict = QuickPhrase.findTriggerConflict(settings.shortcuts, triggers, editingId);
    let validation = "";
    if (!triggers.length || triggers.length > 100 || triggers.some(trigger => /\s/u.test(trigger) || trigger.length > 100)) validation = "Enter up to 100 triggers, one per line, without spaces (100 characters each).";
    else if (conflict) validation = "“" + conflict + "” overlaps another snippet. Use aliases that do not start with one another, so each can expand instantly.";
    else if (!values.replacement.trim()) validation = "Enter the phrase you want to insert.";
    if (validation) { $("form-error").textContent = validation; quickStatus("Draft saved · finish the snippet to autosave"); await persistQuickDraft(); return false; }
    const token = quickToken, signature = JSON.stringify(values);
    const existingId = editingId, savedId = editingId || pendingSnippetId, base = baselineValues;
    const fields = ["name", "triggers", "replacement", "folderId"];
    const changed = key => !existingId || values[key] !== base?.[key];
    let item;
    quickStatus("Saving…");
    const saved = await save(latest => {
      const previous = latest.shortcuts.find(entry => entry.id === existingId);
      if (existingId && !previous) throw new Error("This snippet was deleted in another window. Continue in the full editor to keep these edits.");
      if (previous && !QuickPhrase.isSimpleSnippet(previous)) throw new Error("This snippet now uses the full editor. Open it there to keep all of its content.");
      const current = valuesFor(previous);
      if (previous && fields.some(key => changed(key) && !sameSavedValue(key, current[key], base?.[key]) && !sameSavedValue(key, current[key], values[key]))) throw new Error("This snippet changed in another window. Your edits are kept as a draft; open the full editor to review them.");
      const merged = previous ? { ...current, ...Object.fromEntries(fields.filter(changed).map(key => [key, values[key]])) } : values;
      if (QuickPhrase.findNameConflict(latest.shortcuts, merged.name, existingId)) throw new Error("A snippet with this name already exists.");
      const aliases = [...new Set(merged.triggers.split(/\r?\n/u).map(value => value.trim()).filter(Boolean))];
      const conflict = QuickPhrase.findTriggerConflict(latest.shortcuts, aliases, existingId);
      if (conflict) throw new Error("“" + conflict + "” overlaps another snippet. Use aliases that do not start with one another, so each can expand instantly.");
      item = { ...previous, id: savedId, name: merged.name.trim(), triggers: aliases, trigger: aliases[0], replacement: merged.replacement, format: "text", folderId: latest.folders.some(folder => folder.id === merged.folderId) ? merged.folderId : null, tags: previous?.tags || [], favorite: previous?.favorite || false };
      return { ...latest, shortcuts: previous ? latest.shortcuts.map(entry => entry.id === existingId ? item : entry) : [...latest.shortcuts, item] };
    });
    if (!saved) { quickStatus("Draft saved · resolve the message above to autosave"); await persistQuickDraft(); return false; }
    if (token !== quickToken) return true;
    const unchanged = signature === JSON.stringify(formValues());
    editingId = savedId; pendingSnippetId = savedId; originalItem = item;
    const savedValues = valuesFor(item);
    baselineValues = { ...savedValues, ...Object.fromEntries(fields.filter(key => changed(key) || sameSavedValue(key, savedValues[key], values[key])).map(key => [key, values[key]])) };
    $("editor-title").textContent = "Edit snippet";
    if (unchanged) {
      quickDirty = false; clearTimeout(draftTimer);
      if (!changed("name") && $("snippet-name").value !== item.name) $("snippet-name").value = item.name;
      if (!changed("triggers") && !sameSavedValue("triggers", $("trigger").value, item.triggers.join("\n"))) $("trigger").value = item.triggers.join("\n");
      if (item.replacement !== values.replacement) $("replacement").value = item.replacement;
      fillFolders($("snippet-folder"), item.folderId || "");
      await clearQuickDraft(token);
      if (!quickDirty) { quickStatus("Saved"); if (close) $("editor").close(); }
    } else { await persistQuickDraft(); clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => commitQuick(), 650); }
    return true;
  }
  $("shortcut-form").onsubmit = async event => {
    event.preventDefault(); if (handingOff) return;
    if (!QuickPhrase.isSimpleSnippet(formValues())) { await handoff(originalItem, formValues()); return; }
    await commitQuick({ close: true });
  };
  async function closeQuickEditor() {
    clearTimeout(routingTimer); clearTimeout(autosaveTimer);
    await commitQuick();
    if (quickDirty) {
      await persistQuickDraft();
      const draft = quickDraft(), epoch = libraryEpoch;
      await QuickPhrase.withLibraryLock(async () => {
        const stored = await extensionApi.storage.local.get("snipioEditorDraftBackups");
        if (epoch !== libraryEpoch) return;
        const backups = Array.isArray(stored.snipioEditorDraftBackups) ? stored.snipioEditorDraftBackups : [];
        await extensionApi.storage.local.set({ snipioEditorDraftBackups: [draft, ...backups.filter(item => item.token !== draft.token)] });
      });
    }
    $("editor").close();
  }
  $("cancel").onclick = $("cancel-bottom").onclick = closeQuickEditor;
  $("editor").addEventListener("cancel", event => { event.preventDefault(); void closeQuickEditor(); });
  for (const id of ["snippet-name", "trigger", "snippet-folder"]) $(id).addEventListener(id === "snippet-folder" ? "change" : "input", markChanged);
  $("continue-editor").onclick = () => handoff(originalItem, formValues());
  $("preview-close").onclick = () => $("preview-dialog").close();
  $("preview-edit").onclick = () => { $("preview-dialog").close(); openEditor(previewItem); };
  $("add").onclick = () => openEditor();
  $("open-page").onclick = () => $("editor").open && quickDirty ? handoff(originalItem, formValues()) : handoff();
  $("search").oninput = () => { if (settings) render(); };
  $("folder-filter").onchange = () => { if (settings) render(); };
  $("favorites").onclick = () => { favoritesOnly = !favoritesOnly; if (favoritesOnly) $("folder-filter").value = "*"; if (settings) render(); };
  $("folder-favorite").onclick = () => {
    const id = $("folder-filter").value;
    if (settings?.folders.some(folder => folder.id === id)) void save(latest => ({ ...latest, folders: latest.folders.map(folder => folder.id === id ? { ...folder, favorite: !folder.favorite } : folder) }));
  };
  $("folder-add").onclick = async () => {
    const name = prompt("New folder name:")?.trim(); if (!name || !settings || busy) return;
    const id = crypto.randomUUID();
    if (await save(latest => ({ ...latest, folders: [...latest.folders, { id, name: name.slice(0, 100) }] }))) { $("folder-filter").value = id; render(); }
  };
  $("folder-rename").onclick = async () => {
    const folder = settings.folders.find(item => item.id === $("folder-filter").value); if (!folder) return;
    const name = prompt("Rename folder:", folder.name)?.trim();
    if (name) await save(latest => ({ ...latest, folders: latest.folders.map(item => item.id === folder.id ? { ...item, name: name.slice(0, 100) } : item) }));
  };
  $("folder-delete").onclick = async () => {
    const folder = settings.folders.find(item => item.id === $("folder-filter").value);
    if (!folder || !confirm("Delete folder “" + folder.name + "”? Its snippets will remain in All folders.")) return;
    await save(latest => ({ ...latest, folders: latest.folders.filter(item => item.id !== folder.id), shortcuts: latest.shortcuts.map(item => item.folderId === folder.id ? { ...item, folderId: null } : item) }));
  };
  $("enabled").onchange = async () => { const enabled = $("enabled").checked; await save(latest => ({ ...latest, enabled })); render(); };
  const engine = document.createElement("script"); engine.src = "../content.js"; document.body.append(engine);
  extensionApi.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.snipioLibraryResetAt) {
      libraryResetAt = changes.snipioLibraryResetAt.newValue ?? null; libraryEpoch++;
      clearTimeout(autosaveTimer); clearTimeout(draftTimer); clearTimeout(routingTimer);
      quickDirty = false; quickToken = null; editingId = null; originalItem = null;
      if ($("editor").open) $("editor").close();
      if ($("preview-dialog").open) $("preview-dialog").close();
    }
    if (changes.quickPhrase) {
      settings = QuickPhrase.normalize(changes.quickPhrase.newValue); render();
      if ($("editor").open && quickDirty && !validateName()) {
        clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => commitQuick(), 650);
      } else validateName();
    }
  });
  window.addEventListener("pagehide", () => {
    if (quickDirty && quickToken) { clearTimeout(draftTimer); clearTimeout(autosaveTimer); void extensionApi.storage.local.set({ [QUICK_DRAFT_KEY]: quickDraft() }); }
  });
  QuickPhrase.withLibraryLock(async () => {
    const result = await extensionApi.storage.local.get(["quickPhrase", QUICK_DRAFT_KEY, "snipioLibraryResetAt"]);
    await extensionApi.storage.local.remove?.("snipioLibraryResetBackup");
    settings = QuickPhrase.normalize(result.quickPhrase);
    const demos = ExampleLibrary.ensureDemos(settings);
    settings = demos.settings;
    if (JSON.stringify(settings) !== JSON.stringify(result.quickPhrase)) await extensionApi.storage.local.set({ quickPhrase: settings });
    return result;
  }).then(async result => {
    libraryResetAt = result.snipioLibraryResetAt ?? null;
    render(); $("enabled").disabled = $("add").disabled = false;
    const draft = result[QUICK_DRAFT_KEY];
    if ((draft?.libraryResetAt ?? null) === libraryResetAt && draft?.values && typeof draft.values.replacement === "string" && typeof draft.values.triggers === "string") {
      const item = settings.shortcuts.find(item => item.id === draft.editingId);
      if (QuickPhrase.isSimpleSnippet(draft.values)) openEditor(item || null, draft);
      else { editingId = draft.editingId || null; await handoff(item || null, draft.values); }
    }
  }).catch(() => { $("status").textContent = "Could not load your snippets. Close and reopen Snipio."; });
})();
