// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let revision = 0;
  async function render() {
    const read = ++revision;
    try {
      // Keep the original keys so updates preserve existing shortcuts and usage.
      const result = await chrome.storage.local.get(["rainStats", "quickPhrase"]);
      if (read !== revision) return;
      const entries = QuickPhrase.normalizeStats(result.rainStats).entries;
      const shortcuts = QuickPhrase.normalize(result.quickPhrase).shortcuts;
      $("total-uses").textContent = entries.reduce((sum, entry) => sum + entry.count, 0).toLocaleString();
      $("total-saved").textContent = entries.reduce((sum, entry) => sum + entry.saved, 0).toLocaleString();
      $("stats-list").replaceChildren();
      for (const entry of entries.sort((a, b) => b.count - a.count || b.saved - a.saved)) {
        const item = shortcuts.find(item => item.id === entry.id);
        const row = document.createElement("tr");
        for (const value of [item ? item.name || item.trigger : "Deleted snippet", entry.count.toLocaleString(), entry.saved.toLocaleString()]) {
          const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
        }
        $("stats-list").append(row);
      }
      $("stats-empty").hidden = entries.length > 0;
    } catch { $("status").textContent = "Could not load stats. Reopen this page to try again."; }
  }
  $("reset-stats").onclick = async () => {
    if (!confirm("Reset all usage stats on this device? Your snippets will be kept.")) return;
    $("reset-stats").disabled = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "rain:reset-stats" });
      if (!result?.ok) throw new Error();
      await render(); $("status").textContent = "Stats reset.";
    } catch { $("status").textContent = "Could not reset stats. Please try again."; }
    finally { $("reset-stats").disabled = false; }
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && (changes.rainStats || changes.quickPhrase)) render(); });
  render();
})();
