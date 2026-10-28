// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
(() => {
  "use strict";
  const count = document.getElementById("usage-count");
  const label = document.getElementById("usage-label");
  let revision = 0;

  function render(value) {
    const total = QuickPhrase.normalizeStats(value).entries.reduce((sum, entry) => sum + entry.count, 0);
    count.textContent = total.toLocaleString();
    label.textContent = total === 1 ? "snippet used" : "snippets used";
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rainStats) {
      revision++;
      render(changes.rainStats.newValue);
    }
  });

  const read = revision;
  chrome.storage.local.get("rainStats").then(result => {
    if (read === revision) render(result.rainStats);
  }).catch(() => {
    if (read === revision) count.closest("a").title = "Usage stats unavailable. Reopen Snipio to try again.";
  });
})();
