// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const extensionApi = globalThis.browser || globalThis.chrome;

const sound = document.getElementById("expansion-sound");
extensionApi.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== extensionApi.runtime.id || message?.target !== "audio") return;
  if (message.type === "rain:read-clipboard") {
    const field = document.createElement("textarea");
    document.body.append(field); field.focus();
    try {
      const ok = document.execCommand("paste");
      reply({ ok, text: ok ? field.value : "" });
    } catch { reply({ ok: false }); }
    finally { field.remove(); }
    return;
  }
  if (message.type !== "rain:play-sound") return;
  // Restart for each expansion instead of stacking multiple copies of the clip.
  try {
    sound.currentTime = 0;
    sound.play().then(() => reply({ ok: true }), () => reply({ ok: false }));
  } catch { reply({ ok: false }); }
  return true;
});
