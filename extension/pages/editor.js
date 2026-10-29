// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(() => {
  "use strict";
  const extensionApi = globalThis.browser || globalThis.chrome;
  const $ = id => document.getElementById(id);
  const DRAFT_KEY = "snipioEditorDraft";
  const BACKUP_KEY = "snipioEditorDraftBackups";
  let settings = QuickPhrase.normalize({});
  let editingId = null;
  let creatingSnippet = false;
  let format = "text";
  let favorite = false;
  let dirty = false;
  let ready = false;
  let busy = false;
  let folderFilter = "*";
  let favoritesOnly = false;
  let folderEditingId = null;
  let currentToken = crypto.randomUUID();
  let draftTimer = null;
  let draftGeneration = 0;
  let draftQueue = Promise.resolve();
  let autosaveTimer = null;
  let saveQueue = Promise.resolve();
  let baselineValues = null;
  let pendingSnippetId = null;
  let libraryResetAt = null;
  let libraryEpoch = 0;
  let pendingAction = null;
  let pendingHandoff = null;
  let richRange = null;
  let hiddenMetadata = { description: "", tags: "" };
  let selectedBlock = null;
  let editingBlock = null;
  let draggedBlock = null;
  let backupDrafts = [];
  const ownDraftTokens = new Set();
  const previewValues = Object.create(null);
  const heartIcon = '<svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 5.8a5.1 5.1 0 0 0-7.2 0L12 6.9l-1.1-1.1a5.1 5.1 0 0 0-7.2 7.2L12 21l8.2-8a5.1 5.1 0 0 0 0-7.2Z"/></svg>';
  const binIcon = '<svg class="bin-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7m4-7v7"/></svg>';
  function sameSavedValue(key, left, right) {
    if (key === "name") return (left || "").trim() === (right || "").trim();
    if (key === "triggers") {
      const aliases = value => [...new Set((value || "").split(/\r?\n/u).map(alias => alias.trim()).filter(Boolean))].join("\n");
      return aliases(left) === aliases(right);
    }
    return left === right;
  }

  function status(message, kind = "") {
    $("draft-status").textContent = message;
    $("draft-status").className = `draft-status ${kind}`;
  }
  function validateName(shortcuts = settings.shortcuts, name = $("snippet-name").value, id = editingId || pendingSnippetId) {
    const error = QuickPhrase.findNameConflict(shortcuts, name, id) ? "A snippet with this name already exists." : "";
    $("snippet-name-error").textContent = error;
    if (error) $("form-error").textContent = "";
    $("snippet-name").setAttribute("aria-invalid", String(!!error));
    $("save-shortcut").disabled = !ready || busy || !!error;
    return error;
  }
  function plain(item) { return item.format === "html" ? RichSnippet.text(item.replacement) : item.replacement; }
  function values() {
    return {
      name: $("snippet-name").value,
      description: hiddenMetadata.description,
      triggers: $("triggers").value,
      replacement: canonicalSource(),
      format, folderId: $("snippet-folder").value || null,
      tags: hiddenMetadata.tags, favorite
    };
  }
  function makeDraft() {
    return { editingId, pendingSnippetId, baselineValues, libraryResetAt, values: values(), token: currentToken, updatedAt: Date.now() };
  }
  function isDraft(value) {
    return value && typeof value === "object" && (value.libraryResetAt ?? null) === libraryResetAt && typeof value.token === "string" && value.values &&
      typeof value.values.replacement === "string" && typeof value.values.triggers === "string";
  }
  function queueDraft() {
    if (!ready || !dirty) return;
    clearTimeout(draftTimer);
    const generation = draftGeneration;
    const draft = makeDraft();
    ownDraftTokens.add(draft.token);
    draftQueue = draftQueue.catch(() => {}).then(() => QuickPhrase.withLibraryLock(async () => {
      if (generation !== draftGeneration) return;
      const marker = await extensionApi.storage.local.get("snipioLibraryResetAt");
      if (generation !== draftGeneration || (marker.snipioLibraryResetAt ?? null) !== draft.libraryResetAt) return;
      await extensionApi.storage.local.set({ [DRAFT_KEY]: draft });
      if (generation === draftGeneration && dirty && !autosaveTimer && !busy) status("Draft saved · finish the snippet to autosave", "dirty");
    })).catch(() => status("Draft could not be saved", "error"));
    return draftQueue;
  }
  function markChanged() {
    if (!ready) return;
    syncTailMarker();
    dirty = true;
    $("discard").hidden = false;
    $("form-error").textContent = "";
    status("Saving…", "dirty");
    // A short delay groups continuous typing; pagehide flushes the final edit.
    clearTimeout(draftTimer);
    draftTimer = setTimeout(queueDraft, 180);
    scheduleAutosave();
    updateFavorite();
    updatePreview();
  }
  function scheduleAutosave(delay = 650) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    if (validateName()) { status("Choose a different snippet name to save", "error"); return; }
    autosaveTimer = setTimeout(() => { autosaveTimer = null; void saveCurrent({ automatic: true }); }, delay);
  }
  function canonicalSource() {
    const source = SnippetBlocks.serialize($("builder-editor"), { format });
    $("replacement").value = format === "text" ? source : RichSnippet.text(source);
    $("rich-editor").innerHTML = format === "html" ? source : "";
    return source;
  }
  function syncTailMarker() {
    const editor = $("builder-editor");
    const markers = [...editor.querySelectorAll("[data-builder-marker]")];
    const needsTail = format === "text" && SnippetBlocks.serialize(editor, { format: "text" }).endsWith("\n");
    const last = markers.find(marker => marker === editor.lastChild);
    for (const marker of markers) if (!needsTail || marker !== last) marker.remove();
    if (needsTail && !last) { const marker = document.createElement("br"); marker.dataset.builderMarker = ""; editor.append(marker); }
  }
  function updateFavorite() {
    $("favorite-toggle").setAttribute("aria-pressed", String(favorite));
    $("favorite-toggle").setAttribute("aria-label", favorite ? "Remove from favorites" : "Add to favorites");
    $("favorite-toggle").firstElementChild.innerHTML = heartIcon;
  }
  function fillFolderSelect(selected = $("snippet-folder").value) {
    $("snippet-folder").replaceChildren();
    for (const folder of [{ id: "", name: "No folder" }, ...settings.folders]) {
      const option = document.createElement("option");
      option.value = folder.id; option.textContent = folder.name;
      $("snippet-folder").append(option);
    }
    $("snippet-folder").value = selected || "";
    if ($("snippet-folder").selectedIndex < 0) $("snippet-folder").value = "";
  }
  function switchFormat(nextFormat, convert = true) {
    if (nextFormat === format) return;
    const source = canonicalSource();
    const converted = nextFormat === "html" ? RichSnippet.escape(source).replace(/\n/gu, "<br>") : RichSnippet.text(source);
    format = nextFormat;
    SnippetBlocks.renderEditor($("builder-editor"), converted, { format });
    syncTailMarker();
    syncFormat();
    richRange = null;
    if (convert) markChanged();
  }
  function syncFormat() {
    const rich = format === "html";
    $("replacement").hidden = true;
    $("rich-editor").hidden = true;
    $("builder-editor").dataset.format = format;
    $("rich-toolbar").hidden = !rich;
    $("text-mode").classList.toggle("active", !rich);
    $("rich-mode").classList.toggle("active", rich);
    $("text-mode").setAttribute("aria-pressed", String(!rich));
    $("rich-mode").setAttribute("aria-pressed", String(rich));
  }
  function loadValues(next, id = null, recovered = false, token = null, recovery = null) {
    creatingSnippet = !id;
    setEditorVisible(true);
    draftGeneration++;
    clearTimeout(draftTimer);
    clearTimeout(autosaveTimer); autosaveTimer = null;
    editingId = id;
    pendingSnippetId = id || recovery?.pendingSnippetId || crypto.randomUUID();
    currentToken = token || crypto.randomUUID();
    ownDraftTokens.add(currentToken);
    $("snippet-name").value = typeof next.name === "string" ? next.name : "";
    hiddenMetadata = { description: typeof next.description === "string" ? next.description : "", tags: typeof next.tags === "string" ? next.tags : "" };
    $("triggers").value = typeof next.triggers === "string" ? next.triggers : "";
    format = next.format === "html" ? "html" : "text";
    SnippetBlocks.renderEditor($("builder-editor"), next.replacement || "", { format });
    syncTailMarker();
    selectedBlock = editingBlock = null;
    favorite = next.favorite === true;
    fillFolderSelect(next.folderId);
    syncFormat(); updateFavorite();
    richRange = null;
    dirty = recovered;
    baselineValues = recovery?.baselineValues || (id && settings.shortcuts.find(item => item.id === id)
      ? snippetValues(settings.shortcuts.find(item => item.id === id)) : values());
    $("delete-shortcut").hidden = !id;
    $("discard").hidden = !dirty;
    $("form-error").textContent = "";
    $("tool-status").textContent = "";
    validateName();
    status(recovered ? "Your draft is safe. Pick up where you left off." : id ? "Saved" : "Ready for a new snippet", recovered ? "dirty" : "");
    Object.keys(previewValues).forEach(key => delete previewValues[key]);
    updatePreview(); renderLibrary();
    document.title = `${next.name || (id ? "Snippet" : "New snippet")} · Snipio`;
    if (recovered) { queueDraft(); scheduleAutosave(); }
  }
  function snippetValues(item) { return { ...item, triggers: item.triggers.join("\n"), tags: (item.tags || []).join(", ") }; }
  function selectSnippet(item) {
    loadValues(snippetValues(item), item.id);
  }
  function newSnippet() {
    loadValues({ replacement: "", folderId: folderFilter === "*" ? null : folderFilter });
  }
  function switchLibraryFolder(folderId, favorites = false) {
    if (folderId === folderFilter && favorites === favoritesOnly) return;
    folderFilter = folderId; favoritesOnly = favorites;
    renderLibrary();
    if (dirty) void queueDraft();
  }
  function setEditorVisible(visible) {
    $("editor-empty").hidden = visible;
    $("shortcut-form").hidden = !visible;
    $("editor-preview").hidden = !visible;
    $("save-shortcut").hidden = !visible;
  }
  function showEmptyEditor() {
    loadValues({ replacement: "", folderId: folderFilter === "*" ? null : folderFilter });
    setEditorVisible(false);
    status("Create a new snippet or select one to edit");
    document.title = "My library · Snipio";
  }
  async function requestNavigation(action) {
    if (dirty) {
      clearTimeout(autosaveTimer); autosaveTimer = null;
      await saveCurrent();
      if (dirty) { await queueDraft(); await archiveDraft(makeDraft()); }
    }
    return action();
  }
  function clearCurrentDraft(token = currentToken, onlyIfClean = false) {
    const epoch = libraryEpoch;
    return QuickPhrase.withLibraryLock(() => removeCurrentDraft(token, onlyIfClean, epoch));
  }
  async function removeCurrentDraft(token, onlyIfClean, epoch) {
    const saved = await extensionApi.storage.local.get([DRAFT_KEY, BACKUP_KEY, "snipioLibraryResetAt"]);
    if (epoch !== libraryEpoch || (saved.snipioLibraryResetAt ?? null) !== libraryResetAt || (onlyIfClean && (dirty || token !== currentToken))) return;
    const next = {};
    if (saved[DRAFT_KEY]?.token === token) next[DRAFT_KEY] = null;
    backupDrafts = (Array.isArray(saved[BACKUP_KEY]) ? saved[BACKUP_KEY] : backupDrafts).filter(draft => draft.token !== token);
    next[BACKUP_KEY] = backupDrafts;
    await extensionApi.storage.local.set(next);
    $("recovered-drafts").hidden = !backupDrafts.length;
  }
  async function discardCurrent() {
    clearTimeout(draftTimer); clearTimeout(autosaveTimer); autosaveTimer = null; draftGeneration++;
    await saveQueue;
    await draftQueue;
    await clearCurrentDraft();
    const item = settings.shortcuts.find(item => item.id === editingId);
    if (item) selectSnippet(item); else newSnippet();
  }
  function kindFor(item) {
    const source = item.format === "html" ? RichSnippet.logicSource(item.replacement) : item.replacement;
    if (/\{if:/u.test(source)) return "Conditional";
    if (/\{form:/u.test(source)) return "Fill-in form";
    if (item.format === "html") return "Rich text";
    if (/\{(?:date|time|clipboard|cursor)\}/u.test(source)) return "Dynamic";
    return "Plain text";
  }
  function renderLibrary() {
    $("enabled").checked = settings.enabled;
    $("enabled-label").textContent = settings.enabled ? "Expansion on" : "Expansion paused";
    $("total-count").textContent = settings.shortcuts.length;
    $("all-count").textContent = settings.shortcuts.length;
    $("favorites-count").textContent = settings.shortcuts.filter(item => item.favorite).length + settings.folders.filter(folder => folder.favorite).length;
    $("all-filter").classList.toggle("active", folderFilter === "*" && !favoritesOnly);
    $("favorites-filter").classList.toggle("active", favoritesOnly);
    $("folders").replaceChildren();
    $("folders-heading").textContent = favoritesOnly ? "FAVORITE FOLDERS" : "FOLDERS";
    const folders = settings.folders.filter(folder => !favoritesOnly || folder.favorite)
      .sort((left, right) => Number(!!right.favorite) - Number(!!left.favorite));
    for (const folder of folders) {
      const row = document.createElement("div"); row.className = "folder-row";
      row.classList.toggle("active", folderFilter === folder.id && !favoritesOnly);
      const open = document.createElement("button"); open.type = "button"; open.className = "folder-button";
      const symbol = document.createElement("span"); symbol.className = "folder-symbol"; symbol.textContent = "▱"; symbol.setAttribute("aria-hidden", "true");
      const name = document.createElement("span"); name.className = "folder-name"; name.textContent = folder.name;
      const count = document.createElement("span"); count.className = "folder-count";
      count.textContent = settings.shortcuts.filter(item => (item.folderId || "") === folder.id).length;
      open.append(symbol, name, count);
      open.onclick = () => switchLibraryFolder(folder.id);
      row.append(open);
      if (folder.id) {
        const star = document.createElement("button"); star.type = "button"; star.className = "folder-favorite"; star.innerHTML = heartIcon;
        star.setAttribute("aria-pressed", String(!!folder.favorite));
        star.setAttribute("aria-label", `${folder.favorite ? "Unfavorite" : "Favorite"} folder ${folder.name}`);
        star.title = folder.favorite ? "Remove folder from favorites" : "Add folder to favorites";
        star.onclick = () => mutateSettings(latest => ({ ...latest, folders: latest.folders.map(entry => entry.id === folder.id ? { ...entry, favorite: !entry.favorite } : entry) }));
        row.append(star);
        const actions = document.createElement("div"); actions.className = "folder-actions";
        const rename = document.createElement("button"); rename.type = "button"; rename.className = "folder-rename"; rename.innerHTML = '<svg class="pencil-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 4 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/></svg>'; rename.title = `Rename ${folder.name}`; rename.setAttribute("aria-label", `Rename folder ${folder.name}`); rename.onclick = () => openFolderDialog(folder);
        const remove = document.createElement("button"); remove.type = "button"; remove.innerHTML = "<svg class=\"bin-icon\" viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7m4-7v7\"/></svg>"; remove.title = `Delete ${folder.name}`; remove.setAttribute("aria-label", `Delete folder ${folder.name}`); remove.onclick = () => deleteFolder(folder);
        actions.append(rename, remove); row.append(actions);
      }
      $("folders").append(row);
    }
    let items = QuickPhrase.filterSnippets(settings.shortcuts, $("search").value, favoritesOnly ? "*" : folderFilter, plain);
    if (favoritesOnly) items = items.filter(item => item.favorite);
    $("list-heading").textContent = favoritesOnly ? "FAVORITES" : folderFilter === "*" ? "ALL SNIPPETS" : (settings.folders.find(folder => folder.id === folderFilter)?.name || "NEW FOLDER").toLocaleUpperCase();
    $("filtered-count").textContent = items.length;
    $("snippet-list").replaceChildren();
    for (const item of items) {
      const row = document.createElement("div"); row.className = "snippet-row"; row.classList.toggle("active", editingId === item.id);
      const open = document.createElement("button"); open.type = "button"; open.className = "snippet-open"; open.setAttribute("aria-label", `Edit ${item.name || item.trigger}`);
      const title = document.createElement("span"); title.className = "snippet-title"; title.textContent = item.name || item.trigger;
      const bottom = document.createElement("span"); bottom.className = "snippet-bottom";
      const alias = document.createElement("span"); alias.className = "shortcut-alias"; alias.textContent = item.trigger;
      const kind = document.createElement("span"); kind.className = "snippet-kind"; kind.textContent = kindFor(item);
      bottom.append(alias, kind); open.append(title, bottom);
      open.onclick = () => requestNavigation(() => selectSnippet(item));
      const star = document.createElement("button"); star.type = "button"; star.className = "snippet-favorite"; star.innerHTML = heartIcon; star.setAttribute("aria-pressed", String(!!item.favorite)); star.setAttribute("aria-label", `${item.favorite ? "Unfavorite" : "Favorite"} ${item.name || item.trigger}`);
      star.onclick = async () => {
        if (await mutateSettings(latest => ({ ...latest, shortcuts: latest.shortcuts.map(entry => entry.id === item.id ? { ...entry, favorite: !item.favorite } : entry) }))) {
          if (editingId === item.id) { favorite = !item.favorite; updateFavorite(); if (dirty) queueDraft(); }
        }
      };
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "snippet-delete"; remove.innerHTML = binIcon;
      remove.setAttribute("aria-label", `Delete snippet ${item.name || item.trigger}`); remove.title = "Delete snippet";
      remove.onclick = () => deleteSnippet(item);
      row.append(open, star, remove); $("snippet-list").append(row);
    }
    $("library-empty").hidden = items.length !== 0;
  }
  async function deleteSnippet(item) {
    if (!item || !confirm(`Delete “${item.name || item.trigger}”?`)) return;
    const token = editingId === item.id ? currentToken : null;
    const stopAutosave = () => {
      clearTimeout(draftTimer); clearTimeout(autosaveTimer); autosaveTimer = null; draftGeneration++;
    };
    if (token) stopAutosave();
    await saveQueue;
    if (token === currentToken) { stopAutosave(); await draftQueue; }
    if (await mutateSettings(latest => ({ ...latest, shortcuts: latest.shortcuts.filter(entry => entry.id !== item.id) }))) {
      if (editingId === item.id) showEmptyEditor();
      if (token) await clearCurrentDraft(token);
      if (!dirty) status("Snippet deleted");
    } else if (token === currentToken && dirty) { queueDraft(); scheduleAutosave(); }
  }
  function mutateSettings(change) {
    const epoch = libraryEpoch;
    return QuickPhrase.withLibraryLock(() => performMutation(change, epoch));
  }
  async function performMutation(change, epoch) {
    if (epoch !== libraryEpoch) return false;
    if (busy) return false;
    busy = true; $("save-shortcut").disabled = true;
    try {
      const stored = await extensionApi.storage.local.get(["quickPhrase", "snipioLibraryResetAt"]);
      if (epoch !== libraryEpoch || (stored.snipioLibraryResetAt ?? null) !== libraryResetAt) return false;
      settings = QuickPhrase.normalize(stored.quickPhrase);
      const next = QuickPhrase.normalize(change(settings));
      next.mode = "immediate";
      await extensionApi.storage.local.set({ quickPhrase: next });
      settings = next;
      try { await extensionApi.runtime.sendMessage?.({ type: "quickphrase:sync" }); } catch {}
      renderLibrary(); fillFolderSelect();
      return true;
    } catch (error) {
      $("form-error").textContent = error.message || "Could not save. Please try again.";
      status("Could not save. Your draft is kept.", "error");
      return false;
    } finally { busy = false; validateName(); }
  }
  function saveCurrent(options = {}) {
    clearTimeout(autosaveTimer); autosaveTimer = null;
    saveQueue = saveQueue.catch(() => false).then(() => performSave(options));
    return saveQueue;
  }
  async function performSave({ automatic = false } = {}) {
    if (!ready || !dirty) return true;
    if (busy) { scheduleAutosave(150); return false; }
    if (validateName()) { status("Choose a different snippet name to save", "error"); await queueDraft(); return false; }
    const nextValues = values();
    const triggers = [...new Set(nextValues.triggers.split(/\r?\n/u).map(value => value.trim()).filter(Boolean))];
    const conflict = QuickPhrase.findTriggerConflict(settings.shortcuts, triggers, editingId);
    let error = "";
    if (!triggers.length || triggers.length > 100 || triggers.some(trigger => /\s/u.test(trigger) || trigger.length > 100)) error = "Add 1–100 triggers, one per line, without spaces. Each can be up to 100 characters.";
    else if (conflict) error = `“${conflict}” overlaps another snippet. Choose aliases that do not start with one another so each can expand immediately.`;
    else if (!(format === "html" ? RichSnippet.text(nextValues.replacement) : nextValues.replacement).trim()) error = "Write the text this snippet should insert.";
    else if (nextValues.replacement.length > 20000) error = "Keep your snippet within 20,000 characters.";
    else error = QuickPhrase.validateTemplate(format === "html" ? RichSnippet.logicSource(nextValues.replacement) : nextValues.replacement);
    if (error) { $("form-error").textContent = error; status("Draft saved · finish the snippet to autosave", "dirty"); await queueDraft(); return false; }
    const token = currentToken;
    const signature = JSON.stringify(nextValues);
    const savedId = editingId || pendingSnippetId;
    const base = baselineValues;
    const existingId = editingId;
    const fields = ["name", "triggers", "replacement", "format", "folderId", "favorite"];
    const changed = key => !existingId || nextValues[key] !== base?.[key];
    status("Saving…", "dirty");
    let item;
    const saved = await mutateSettings(latest => {
      const previous = latest.shortcuts.find(entry => entry.id === existingId);
      if (existingId && !previous) throw new Error("This snippet was deleted in another window. Your edits are kept as a draft.");
      const latestValues = previous ? snippetValues(previous) : null;
      if (previous && fields.some(key => changed(key) && !sameSavedValue(key, latestValues[key], base?.[key]) && !sameSavedValue(key, latestValues[key], nextValues[key]))) throw new Error("This snippet changed in another window. Your edits are kept as a draft; reload the saved snippet before applying them.");
      const merged = previous ? { ...latestValues, ...Object.fromEntries(fields.filter(changed).map(key => [key, nextValues[key]])) } : nextValues;
      if (QuickPhrase.findNameConflict(latest.shortcuts, merged.name, existingId)) throw new Error("A snippet with this name already exists.");
      const mergedTriggers = [...new Set(merged.triggers.split(/\r?\n/u).map(value => value.trim()).filter(Boolean))];
      const conflict = QuickPhrase.findTriggerConflict(latest.shortcuts, mergedTriggers, existingId);
      if (conflict) throw new Error(`“${conflict}” overlaps another snippet. Choose aliases that do not start with one another so each can expand immediately.`);
      item = {
        ...previous, id: savedId, trigger: mergedTriggers[0], triggers: mergedTriggers,
        replacement: merged.replacement, format: merged.format,
        name: merged.name.trim(), description: previous?.description ?? nextValues.description.trim(),
        folderId: latest.folders.some(folder => folder.id === merged.folderId) ? merged.folderId : null,
        tags: previous?.tags || [...new Set(nextValues.tags.split(",").map(tag => tag.trim().slice(0, 50)).filter(Boolean))].slice(0, 30),
        favorite: merged.favorite
      };
      return { ...latest, shortcuts: previous ? latest.shortcuts.map(entry => entry.id === savedId ? item : entry) : [...latest.shortcuts, item] };
    });
    if (!saved) { if (dirty) await queueDraft(); return false; }
    if (token === currentToken) {
      const unchanged = signature === JSON.stringify(values());
      editingId = savedId; pendingSnippetId = savedId;
      // Merge untouched fields from another view without rebuilding the editor
      // after normal typing; this keeps the active selection and undo history.
      if (unchanged) {
        if (!changed("name") && item.name !== nextValues.name) $("snippet-name").value = item.name;
        if (!changed("triggers") && !sameSavedValue("triggers", item.triggers.join("\n"), nextValues.triggers)) $("triggers").value = item.triggers.join("\n");
        if (item.replacement !== nextValues.replacement || item.format !== format) {
          format = item.format; SnippetBlocks.renderEditor($("builder-editor"), item.replacement, { format }); syncTailMarker(); syncFormat(); richRange = null;
        }
        favorite = item.favorite; updateFavorite();
        fillFolderSelect(item.folderId);
        updatePreview();
      }
      const savedValues = snippetValues(item);
      baselineValues = { ...savedValues, ...Object.fromEntries(fields.filter(key => changed(key) || sameSavedValue(key, savedValues[key], nextValues[key])).map(key => [key, nextValues[key]])) };
      $("delete-shortcut").hidden = false;
      document.title = `${nextValues.name || "Snippet"} · Snipio`;
      if (unchanged) {
        dirty = false; clearTimeout(draftTimer); draftGeneration++;
        $("discard").hidden = true;
        await draftQueue; await clearCurrentDraft(token, true);
        if (!dirty && token === currentToken) status("Saved");
      } else { dirty = true; queueDraft(); scheduleAutosave(); }
      renderLibrary();
    }
    return true;
  }
  function updatePreview() {
    const value = values();
    $("character-count").textContent = `${value.replacement.length.toLocaleString()} / 20,000`;
    const source = format === "html" ? RichSnippet.logicSource(value.replacement) : value.replacement;
    const error = QuickPhrase.validateTemplate(source);
    $("preview-error").hidden = !error;
    $("preview-error").textContent = error ? `Finish this block to preview: ${error}` : "";
    if (error) { $("preview-output").textContent = "Your preview will appear here when the block is complete."; $("preview-fields").replaceChildren(); $("preview-cursor-note").hidden = true; return; }
    const fields = QuickPhrase.formFields(source);
    const existing = [...$("preview-fields").querySelectorAll("input")].map(input => input.dataset.field);
    if (JSON.stringify(existing) !== JSON.stringify(fields)) {
      $("preview-fields").replaceChildren();
      for (const field of fields) {
        const label = document.createElement("label"); label.textContent = field;
        const input = document.createElement("input"); input.dataset.field = field; input.value = previewValues[field] || ""; input.placeholder = `Enter ${field}…`;
        input.oninput = () => { previewValues[field] = input.value; renderPreview(); };
        label.append(input); $("preview-fields").append(label);
      }
    }
    renderPreview(value);
  }
  function renderPreview(value = values()) {
    try {
      const fields = Object.create(null);
      const source = value.format === "html" ? RichSnippet.logicSource(value.replacement) : value.replacement;
      for (const field of QuickPhrase.formFields(source)) fields[field] = previewValues[field] || `[${field}]`;
      const context = { now: new Date(), clipboard: "[Your copied text]", fields };
      const rendered = value.format === "html" ? RichSnippet.expand(value.replacement, context) : QuickPhrase.expandVariables(QuickPhrase.renderLogic(value.replacement, context), context);
      $("preview-output").classList.toggle("empty", !rendered.replacement);
      if (!rendered.replacement) $("preview-output").textContent = "Your words will appear here. Start writing above.";
      else if (value.format === "html") $("preview-output").innerHTML = RichSnippet.sanitize(rendered.html);
      else $("preview-output").textContent = rendered.replacement;
      $("preview-cursor-note").hidden = rendered.cursor === null;
    } catch (error) {
      $("preview-output").textContent = "Complete your block to see a preview.";
      $("preview-error").textContent = error.message; $("preview-error").hidden = false;
    }
  }
  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && $("builder-editor").contains(selection.anchorNode) && $("builder-editor").contains(selection.focusNode)) richRange = selection.getRangeAt(0).cloneRange();
  }
  function restoreRichSelection() {
    const editor = $("builder-editor"), savedRange = richRange?.cloneRange(); editor.focus();
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) richRange = savedRange;
    const selection = window.getSelection();
    if (!richRange || !editor.contains(richRange.commonAncestorContainer)) {
      richRange = document.createRange(); richRange.selectNodeContents(editor); richRange.collapse(false);
    }
    selection.removeAllRanges(); selection.addRange(richRange);
    return selection;
  }
  function rangeAtPoint(point) {
    const editor = $("builder-editor");
    const position = document.caretPositionFromPoint?.(point.x, point.y);
    const range = position ? document.createRange() : document.caretRangeFromPoint?.(point.x, point.y);
    if (position) range.setStart(position.offsetNode, position.offset);
    if (range && editor.contains(range.startContainer)) {
      const element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const block = element.closest?.(".snippet-block");
      if (block) {
        const box = block.getBoundingClientRect();
        if (point.x < box.left + box.width / 2) range.setStartBefore(block); else range.setStartAfter(block);
      }
      range.collapse(true); return range;
    }
    const end = document.createRange(); end.selectNodeContents(editor); end.collapse(false); return end;
  }
  function insertFragment(fragment, point = null) {
    const editor = $("builder-editor");
    if (["<br>", "<div><br></div>"].includes(editor.innerHTML)) { editor.replaceChildren(); richRange = null; }
    if (point) richRange = rangeAtPoint(point);
    const selection = restoreRichSelection(), range = selection.getRangeAt(0);
    range.deleteContents();
    const last = fragment.lastChild;
    range.insertNode(fragment);
    syncTailMarker();
    if (last) range.setStartAfter(last);
    range.collapse(true); selection.removeAllRanges(); selection.addRange(range); richRange = range.cloneRange();
    selectedBlock?.classList.remove("is-selected"); selectedBlock = null;
    markChanged();
  }
  function insertText(text, point = null) {
    insertFragment(SnippetBlocks.fragment(text), point);
  }
  function conditionGroup(block) {
    const blocks = [...$("builder-editor").querySelectorAll(".snippet-block")];
    const stack = [];
    for (const item of blocks) {
      if (item.dataset.type === "condition") stack.push({ start: item, markers: [item], contains: item === block });
      else if (["otherwise", "end"].includes(item.dataset.type) && stack.length) {
        const group = stack.at(-1); group.markers.push(item); group.contains ||= item === block;
        if (item.dataset.type === "end") { stack.pop(); if (group.contains) return { ...group, end: item }; }
      }
    }
    return null;
  }
  function removeBlock(block) {
    const group = ["condition", "otherwise", "end"].includes(block.dataset.type) ? conditionGroup(block) : null;
    const range = document.createRange(); range.setStartBefore(group?.start || block); range.collapse(true);
    if (group) group.markers.forEach(marker => marker.remove()); else block.remove();
    selectedBlock = null; richRange = range; restoreRichSelection(); markChanged();
  }
  function editBlock(block) {
    if (!["form", "condition"].includes(block.dataset.type)) return;
    editingBlock = block;
    const isField = block.dataset.type === "form";
    $("block-dialog-title").textContent = isField ? "Edit fill-in field" : "Edit condition";
    $("block-field-controls").hidden = !isField; $("block-condition-controls").hidden = isField;
    if (isField) $("block-field-name").value = block.dataset.token.slice(6, -1).trim();
    else {
      const condition = SnippetBlocks.conditionDetails(block.dataset.token) || { source: "time", operator: "<", value: "12", field: "" };
      $("block-condition-source").value = condition.source;
      $("block-condition-field").value = condition.field;
      $("block-condition-operator").value = condition.operator;
      $("block-condition-value").value = condition.value;
      $("block-condition-source").dispatchEvent(new Event("change"));
    }
    $("block-error").textContent = ""; $("block-dialog").showModal();
    $(isField ? "block-field-name" : "block-condition-value").focus();
  }
  function toolText(type) {
    if (type === "form") {
      const name = $("field-name").value.trim();
      if (!name || name.length > 100 || /[{}]/u.test(name)) throw new Error("Give your field a name without braces.");
      return `{form: ${name}}`;
    }
    if (type === "condition") {
      const subject = $("condition-source").value;
      const field = $("condition-field").value.trim();
      if (subject === "form" && (!field || /[^\w -]/u.test(field))) throw new Error("Use a field name with letters, numbers, spaces, hyphens, or underscores.");
      let expected = $("condition-value").value.trim();
      if (subject === "form") expected = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(expected) ? expected : JSON.stringify(expected);
      else if (subject === "day") expected = /^\d$/u.test(expected) ? expected : JSON.stringify(expected);
      const left = subject === "form" ? `form.${field}` : subject;
      const yes = $("condition-yes").value, no = $("condition-no").value;
      const result = `{if: ${left} ${$("condition-operator").value} ${expected}}${yes}${no ? `{else}${no}` : ""}{endif}`;
      const error = QuickPhrase.validateTemplate(result);
      if (error) throw new Error(error);
      return result;
    }
    if (["cursor", "date", "time"].includes(type)) return `{${type}}`;
    throw new Error("Choose a tool to insert.");
  }
  function useTool(type) {
    if ($("shortcut-form").hidden) { $("tool-status").textContent = "Create or select a snippet to add a block."; return; }
    try { insertText(toolText(type)); $("tool-status").textContent = "Block added. Your preview is up to date."; }
    catch (error) { $("tool-status").textContent = error.message; }
  }
  function openFolderDialog(folder = null) {
    folderEditingId = folder?.id || null;
    $("folder-dialog-title").textContent = folder ? "Rename folder" : "New folder";
    $("folder-name").value = folder?.name || ""; $("folder-error").textContent = "";
    $("folder-dialog").showModal(); $("folder-name").focus();
  }
  async function deleteFolder(folder) {
    if (!confirm(`Delete “${folder.name}”? Its snippets will remain in All snippets.`)) return;
    if (await mutateSettings(latest => ({ ...latest, folders: latest.folders.filter(item => item.id !== folder.id), shortcuts: latest.shortcuts.map(item => item.folderId === folder.id ? { ...item, folderId: null } : item) }))) {
      if (folderFilter === folder.id) folderFilter = "*";
      renderLibrary(); fillFolderSelect();
      if (dirty) queueDraft();
    }
  }
  function archiveDraft(draft) { return QuickPhrase.withLibraryLock(() => persistArchivedDraft(draft)); }
  async function persistArchivedDraft(draft) {
    if (!isDraft(draft)) return;
    const saved = await extensionApi.storage.local.get([BACKUP_KEY, "snipioLibraryResetAt"]);
    if ((saved.snipioLibraryResetAt ?? null) !== (draft.libraryResetAt ?? null)) return;
    const previous = Array.isArray(saved[BACKUP_KEY]) ? saved[BACKUP_KEY].filter(isDraft) : [];
    backupDrafts = [draft, ...previous.filter(item => item.token !== draft.token)];
    await extensionApi.storage.local.set({ [BACKUP_KEY]: backupDrafts });
    $("recovered-drafts").hidden = false;
  }
  async function receiveDraft(draft) {
    if (!isDraft(draft) || draft.token === currentToken || ownDraftTokens.has(draft.token)) return;
    if (dirty) {
      await archiveDraft(makeDraft());
      // An already queued autosave can replace the shared handoff key. Keep
      // both drafts recoverable until the incoming shortcut is explicitly saved.
      await archiveDraft(draft);
      pendingHandoff = draft;
      $("handoff-notice").hidden = false;
    } else {
      loadValues(draft.values, typeof draft.editingId === "string" ? draft.editingId : null, true, draft.token, draft);
      $("snippet-name").focus();
    }
  }
  function renderDrafts() {
    $("drafts-list").replaceChildren();
    for (const draft of backupDrafts) {
      const row = document.createElement("div"); row.className = "draft-recovery-row";
      const info = document.createElement("span"), name = document.createElement("strong"), date = document.createElement("small");
      name.textContent = draft.values.name || draft.values.triggers.split("\n")[0] || "Untitled snippet";
      date.textContent = new Date(draft.updatedAt).toLocaleString(); info.append(name, date);
      const open = document.createElement("button"); open.type = "button"; open.textContent = "Open";
      open.onclick = () => { $("drafts-dialog").close(); requestNavigation(() => { loadValues(draft.values, draft.editingId || null, true, draft.token, draft); queueDraft(); }); };
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Discard recovered ${name.textContent}`);
      remove.onclick = async () => { await clearCurrentDraft(draft.token); renderDrafts(); };
      row.append(info, open, remove); $("drafts-list").append(row);
    }
    if (!backupDrafts.length) $("drafts-list").textContent = "No recovered drafts.";
  }

  $("shortcut-form").onsubmit = event => { event.preventDefault(); saveCurrent(); };
  $("search").oninput = renderLibrary;
  $("all-filter").onclick = () => switchLibraryFolder("*");
  $("favorites-filter").onclick = () => switchLibraryFolder("*", true);
  $("add-shortcut").onclick = () => requestNavigation(newSnippet);
  $("create-snippet").onclick = () => requestNavigation(newSnippet);
  $("favorite-toggle").onclick = () => { favorite = !favorite; markChanged(); };
  $("discard").onclick = () => discardCurrent();
  $("delete-shortcut").onclick = () => deleteSnippet(settings.shortcuts.find(item => item.id === editingId));
  $("text-mode").onclick = () => switchFormat("text");
  $("rich-mode").onclick = () => switchFormat("html");
  for (const id of ["snippet-name", "triggers", "snippet-folder"]) $(id).addEventListener(id === "snippet-folder" ? "change" : "input", markChanged);
  $("builder-editor").addEventListener("input", event => {
    if (!event.isComposing) SnippetBlocks.hydrate($("builder-editor"), { preserveSelection: true });
    rememberSelection(); markChanged();
  });
  $("builder-editor").addEventListener("compositionend", () => { SnippetBlocks.hydrate($("builder-editor"), { preserveSelection: true }); rememberSelection(); markChanged(); });
  $("builder-editor").addEventListener("beforeinput", event => {
    // Plain snippets store actual LF characters. Native editable paragraphs
    // otherwise create an extra placeholder BR at the end of a new line.
    if (format === "text" && !event.isComposing && ["insertParagraph", "insertLineBreak"].includes(event.inputType)) {
      event.preventDefault(); rememberSelection(); insertText("\n");
    }
  });
  // Retain a hidden canonical bridge for extension integrations and recovered drafts.
  $("replacement").addEventListener("input", () => { SnippetBlocks.renderEditor($("builder-editor"), $("replacement").value, { format: "text" }); markChanged(); });
  $("rich-editor").addEventListener("input", () => { SnippetBlocks.renderEditor($("builder-editor"), $("rich-editor").innerHTML, { format: "html" }); markChanged(); });
  $("enabled").onchange = async () => { const enabled = $("enabled").checked; await mutateSettings(latest => ({ ...latest, enabled })); };
  $("refresh-preview").onclick = updatePreview;
  document.addEventListener("selectionchange", rememberSelection);
  $("builder-editor").addEventListener("focusout", rememberSelection);
  document.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveCurrent(); } });
  for (const button of document.querySelectorAll("[data-tool]")) {
    button.querySelector(".tool-icon").innerHTML = SnippetBlocks.icon(button.dataset.tool);
    button.onclick = () => useTool(button.dataset.tool);
    button.ondragstart = event => {
      if ($("shortcut-form").hidden) { event.preventDefault(); $("tool-status").textContent = "Create or select a snippet to add a block."; return; }
      try {
        const text = toolText(button.dataset.tool);
        event.dataTransfer.setData("application/x-snipio-tool", text); event.dataTransfer.setData("text/plain", text); event.dataTransfer.effectAllowed = "copy";
        $("tool-status").textContent = "Drop your block where you want it in the editor.";
      } catch (error) { event.preventDefault(); $("tool-status").textContent = error.message; }
    };
  }
  $("add-field").onclick = () => useTool("form");
  $("add-condition").onclick = () => useTool("condition");
  $("condition-source").onchange = () => {
    const type = $("condition-source").value;
    $("condition-field").hidden = type !== "form";
    $("condition-value").value = type === "time" ? "12" : type === "day" ? "Monday" : "yes";
    $("condition-operator").value = type === "time" ? "<" : "==";
    $("condition-hint").textContent = type === "time" ? "24-hour time: 12 means noon." : type === "day" ? "Write a weekday, such as Monday." : "An existing or new fill-in field works here.";
    const timeLabels = { "<": "is before", ">=": "is at or after", "==": "equals", "!=": "does not equal", ">": "is after", "<=": "is at or before" };
    const otherLabels = { "<": "is less than", ">=": "is at least", "==": "equals", "!=": "does not equal", ">": "is greater than", "<=": "is at most" };
    for (const option of $("condition-operator").options) option.textContent = (type === "time" ? timeLabels : otherLabels)[option.value];
  };
  const writingArea = document.querySelector(".writing-area");
  $("builder-editor").ondragstart = event => {
    const block = event.target.closest(".snippet-block");
    if (!block) return;
    draggedBlock = block; block.classList.add("is-dragging");
    event.dataTransfer.setData("application/x-snipio-block", block.dataset.token);
    event.dataTransfer.setData("text/plain", block.dataset.token); event.dataTransfer.effectAllowed = "move";
  };
  $("builder-editor").ondragend = () => { draggedBlock?.classList.remove("is-dragging"); draggedBlock = null; writingArea.classList.remove("drag-over"); };
  writingArea.ondragover = event => { if ([...event.dataTransfer.types].some(type => ["application/x-snipio-tool", "application/x-snipio-block"].includes(type))) { event.preventDefault(); event.dataTransfer.dropEffect = draggedBlock ? "move" : "copy"; writingArea.classList.add("drag-over"); } };
  writingArea.ondragleave = event => { if (!writingArea.contains(event.relatedTarget)) writingArea.classList.remove("drag-over"); };
  writingArea.ondrop = event => {
    writingArea.classList.remove("drag-over");
    if (draggedBlock && event.dataTransfer.getData("application/x-snipio-block")) {
      event.preventDefault();
      const target = rangeAtPoint({ x: event.clientX, y: event.clientY });
      const group = ["condition", "otherwise", "end"].includes(draggedBlock.dataset.type) ? conditionGroup(draggedBlock) : null;
      const source = document.createRange(); source.setStartBefore(group?.start || draggedBlock); source.setEndAfter(group?.end || draggedBlock);
      if (source.comparePoint(target.startContainer, target.startOffset) !== 0) {
        const contents = source.extractContents(); richRange = target; insertFragment(contents);
      }
      draggedBlock?.classList.remove("is-dragging"); draggedBlock = null; return;
    }
    const text = event.dataTransfer.getData("application/x-snipio-tool");
    if (!text) return;
    event.preventDefault(); insertText(text, { x: event.clientX, y: event.clientY });
    $("tool-status").textContent = "Block added at your drop position.";
  };
  $("builder-editor").onpaste = event => {
    event.preventDefault();
    rememberSelection();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const holder = document.createElement("div");
    let custom;
    try { custom = JSON.parse(event.clipboardData.getData("application/x-snipio-fragment")); } catch {}
    if (custom && typeof custom.source === "string" && custom.source.length <= 20000) {
      const source = format === "text" && custom.format === "html" ? RichSnippet.text(custom.source) : format === "html" && custom.format === "text" ? RichSnippet.escape(custom.source).replace(/\n/gu, "<br>") : custom.source;
      SnippetBlocks.renderEditor(holder, source, { format });
    } else if (format === "html" && html) SnippetBlocks.renderEditor(holder, html, { format });
    else SnippetBlocks.renderEditor(holder, text, { format: "text" });
    const contents = document.createDocumentFragment(); contents.append(...holder.childNodes); insertFragment(contents);
  };
  function copySelection(event, cut = false) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !$("builder-editor").contains(selection.anchorNode) || !$("builder-editor").contains(selection.focusNode)) return;
    event.preventDefault();
    const range = selection.getRangeAt(0), holder = document.createElement("div"); holder.append(range.cloneContents());
    const source = SnippetBlocks.serialize(holder, { format });
    event.clipboardData.setData("application/x-snipio-fragment", JSON.stringify({ source, format }));
    event.clipboardData.setData("text/plain", format === "html" ? RichSnippet.text(source) : source);
    if (format === "html") event.clipboardData.setData("text/html", source);
    if (cut) { range.deleteContents(); richRange = range.cloneRange(); markChanged(); }
  }
  $("builder-editor").oncopy = event => copySelection(event);
  $("builder-editor").oncut = event => copySelection(event, true);
  $("builder-editor").onclick = event => {
    const block = event.target.closest(".snippet-block");
    selectedBlock?.classList.remove("is-selected"); selectedBlock = block;
    if (!block) return;
    block.classList.add("is-selected");
    if (event.target.closest(".block-remove")) { removeBlock(block); return; }
    if (["form", "condition"].includes(block.dataset.type)) editBlock(block);
    else { richRange = document.createRange(); richRange.setStartAfter(block); richRange.collapse(true); }
  };
  $("builder-editor").onkeydown = event => {
    const block = event.target.closest(".snippet-block") || selectedBlock;
    if (!block || !$("builder-editor").contains(block)) return;
    if (["Backspace", "Delete"].includes(event.key) && (event.target.closest(".snippet-block") || window.getSelection()?.isCollapsed)) { event.preventDefault(); removeBlock(block); }
    else if (event.key === "Enter" && event.target.closest(".snippet-block")) { event.preventDefault(); editBlock(block); }
    else if (!["Shift", "Control", "Meta", "Alt"].includes(event.key)) { block.classList.remove("is-selected"); selectedBlock = null; }
  };
  $("block-condition-source").onchange = () => {
    const field = $("block-condition-source").value === "form";
    $("block-condition-field").hidden = $("block-condition-field-label").hidden = !field;
  };
  $("block-cancel").onclick = () => { editingBlock = null; $("block-dialog").close(); };
  $("block-form").onsubmit = event => {
    event.preventDefault();
    if (!editingBlock?.isConnected) { $("block-dialog").close(); return; }
    try {
      let token;
      if (editingBlock.dataset.type === "form") {
        const name = $("block-field-name").value.trim();
        if (!name || /[{}]/u.test(name)) throw new Error("Give your field a name without braces.");
        token = `{form: ${name}}`;
      } else {
        const subject = $("block-condition-source").value, field = $("block-condition-field").value.trim();
        if (subject === "form" && (!field || /[^\w -]/u.test(field))) throw new Error("Give the condition a field name using letters, numbers, spaces, or hyphens.");
        let value = $("block-condition-value").value.trim();
        if (subject !== "time") value = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value) ? value : JSON.stringify(value);
        token = `{if: ${subject === "form" ? `form.${field}` : subject} ${$("block-condition-operator").value} ${value}}`;
        const error = QuickPhrase.validateTemplate(`${token}{endif}`); if (error) throw new Error(error);
      }
      const replacement = SnippetBlocks.createBlock(token); editingBlock.replaceWith(replacement); editingBlock = null; selectedBlock = null;
      $("block-dialog").close(); richRange = document.createRange(); richRange.setStartAfter(replacement); richRange.collapse(true); restoreRichSelection(); markChanged();
    } catch (error) { $("block-error").textContent = error.message; }
  };
  for (const button of document.querySelectorAll("[data-command]")) {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => { restoreRichSelection(); document.execCommand(button.dataset.command); rememberSelection(); markChanged(); };
  }
  $("insert-link").onclick = () => { $("link-url").value = ""; $("link-error").textContent = ""; $("link-dialog").showModal(); $("link-url").focus(); };
  $("link-cancel").onclick = () => $("link-dialog").close();
  $("link-form").onsubmit = event => {
    event.preventDefault();
    const url = RichSnippet.safeLink($("link-url").value.trim());
    if (!url) { $("link-error").textContent = "Use an http, https, or mailto address."; return; }
    $("link-dialog").close();
    const selection = restoreRichSelection();
    if (selection.isCollapsed) document.execCommand("insertHTML", false, `<a href="${RichSnippet.escape(url)}">${RichSnippet.escape(url)}</a>`);
    else document.execCommand("createLink", false, url);
    rememberSelection(); markChanged();
  };
  $("add-folder").onclick = () => openFolderDialog();
  $("folder-cancel").onclick = () => $("folder-dialog").close();
  $("folder-form").onsubmit = async event => {
    event.preventDefault();
    const name = $("folder-name").value.trim();
    if (!name) { $("folder-error").textContent = "Give your folder a name."; return; }
    let id = folderEditingId || crypto.randomUUID();
    if (await mutateSettings(latest => {
      if (latest.folders.some(folder => folder.id !== folderEditingId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("That folder name is already in use.");
      return { ...latest, folders: folderEditingId ? latest.folders.map(folder => folder.id === folderEditingId ? { ...folder, name } : folder) : [...latest.folders, { id, name }] };
    })) {
      $("folder-dialog").close(); folderFilter = id; favoritesOnly = false; renderLibrary(); fillFolderSelect();
    } else $("folder-error").textContent = $("form-error").textContent;
  };
  $("keep-editing").onclick = () => { pendingAction = null; $("unsaved-dialog").close(); };
  $("discard-switch").onclick = async () => { const action = pendingAction; pendingAction = null; await discardCurrent(); $("unsaved-dialog").close(); action?.(); };
  $("save-switch").onclick = async () => {
    const action = pendingAction;
    if (await saveCurrent()) { pendingAction = null; $("unsaved-dialog").close(); action?.(); }
    else { $("unsaved-dialog").close(); pendingAction = null; $("form-error").scrollIntoView({ block: "center" }); }
  };
  $("open-handoff").onclick = async () => {
    const draft = pendingHandoff;
    if (!draft) return;
    if (dirty) await archiveDraft(makeDraft());
    pendingHandoff = null; $("handoff-notice").hidden = true;
    loadValues(draft.values, draft.editingId || null, true, draft.token, draft); queueDraft();
  };
  $("recovered-drafts").onclick = () => { renderDrafts(); $("drafts-dialog").showModal(); };
  $("drafts-close").onclick = () => $("drafts-dialog").close();
  window.addEventListener("pagehide", () => {
    if (!dirty) return;
    clearTimeout(draftTimer); clearTimeout(autosaveTimer); draftGeneration++;
    // Start the storage API call synchronously while the document is alive.
    const draft = makeDraft(); ownDraftTokens.add(draft.token);
    void extensionApi.storage.local.set({ [DRAFT_KEY]: draft });
  });

  async function initialize() {
    $("save-shortcut").disabled = true; $("add-shortcut").disabled = true;
    try {
      const saved = await QuickPhrase.withLibraryLock(async () => {
        const stored = await extensionApi.storage.local.get(["quickPhrase", DRAFT_KEY, BACKUP_KEY, "snipioLibraryResetAt"]);
        await extensionApi.storage.local.remove?.("snipioLibraryResetBackup");
        const initial = QuickPhrase.normalize(stored.quickPhrase);
        const demos = typeof ExampleLibrary.ensureDemos === "function" ? ExampleLibrary.ensureDemos(initial) : initial;
        const normalized = QuickPhrase.normalize(demos.settings || demos);
        if (JSON.stringify(normalized) !== JSON.stringify(stored.quickPhrase)) await extensionApi.storage.local.set({ quickPhrase: normalized });
        return { ...stored, quickPhrase: normalized };
      });
      libraryResetAt = saved.snipioLibraryResetAt ?? null;
      settings = QuickPhrase.normalize(saved.quickPhrase);
      backupDrafts = Array.isArray(saved[BACKUP_KEY]) ? saved[BACKUP_KEY].filter(isDraft) : [];
      $("recovered-drafts").hidden = !backupDrafts.length;
      ready = true;
      if (isDraft(saved[DRAFT_KEY])) await archiveDraft(saved[DRAFT_KEY]);
      showEmptyEditor();
      extensionApi.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.snipioLibraryResetAt) {
          libraryResetAt = changes.snipioLibraryResetAt.newValue ?? null; libraryEpoch++;
          clearTimeout(autosaveTimer); clearTimeout(draftTimer); autosaveTimer = null; draftGeneration++;
          dirty = false; editingId = null; currentToken = crypto.randomUUID(); ownDraftTokens.clear(); backupDrafts = [];
          pendingHandoff = null; $("handoff-notice").hidden = true; $("recovered-drafts").hidden = true;
          settings = QuickPhrase.normalize(changes.quickPhrase?.newValue || {});
          showEmptyEditor();
        }
        if (changes.quickPhrase) {
          settings = QuickPhrase.normalize(changes.quickPhrase.newValue);
          if (folderFilter !== "*" && folderFilter !== "" && !settings.folders.some(folder => folder.id === folderFilter)) folderFilter = "*";
          renderLibrary(); fillFolderSelect();
          if (dirty) scheduleAutosave();
          else validateName();
          // A saved shortcut can change in the popup while its dashboard is
          // open. Refresh clean fields, while an active draft remains intact.
          if (!busy && !dirty && editingId) {
            const selected = settings.shortcuts.find(item => item.id === editingId);
            if (selected) { const wasCreating = creatingSnippet; selectSnippet(selected); creatingSnippet = wasCreating; }
            else showEmptyEditor();
          }
        }
        if (changes[DRAFT_KEY]?.newValue) receiveDraft(changes[DRAFT_KEY].newValue).catch(() => status("Could not recover the new draft", "error"));
        if (changes[BACKUP_KEY]) { backupDrafts = Array.isArray(changes[BACKUP_KEY].newValue) ? changes[BACKUP_KEY].newValue.filter(isDraft) : []; $("recovered-drafts").hidden = !backupDrafts.length; }
      });
    } catch (error) {
      status("Could not open your library", "error");
      $("form-error").textContent = error.message || "Reload this page to try again.";
    } finally { validateName(); $("add-shortcut").disabled = !ready; }
  }
  initialize();
})();
