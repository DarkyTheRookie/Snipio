// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
// Each stable key introduces one feature. These are ordinary editable snippets;
// the library seeds them once and remembers that choice even after deletion.
(function (root) {
  "use strict";
  const examples = [
    {
      key: "plain", folder: "Getting started", name: "A quick hello", triggers: [".hello"], tags: ["text"],
      description: "Type .hello to insert a short greeting immediately.",
      replacement: "Hello, how are you?"
    },
    {
      key: "date", folder: "Getting started", name: "Today's date", triggers: [".date"], tags: ["date"],
      description: "Type .date to insert today's date in your device's format.",
      replacement: "{date}"
    },
    {
      key: "time", folder: "Getting started", name: "Current time", triggers: [".time"], tags: ["time"],
      description: "Type .time to insert the current time in your device's format.",
      replacement: "{time}"
    },
    {
      key: "cursor", folder: "Getting started", name: "Place the cursor", triggers: [".cursor"], tags: ["cursor"],
      description: "Type .cursor to insert brackets and place your cursor between them.",
      replacement: "[{cursor}]"
    },
    {
      key: "form", folder: "Getting started", name: "Personal greeting", triggers: [".greet"], tags: ["form"],
      description: "Type .greet and fill in a name. Enter inserts the greeting; Escape cancels.",
      replacement: "Hi {form: name}, thank you for getting in touch!"
    },
    {
      key: "rich", folder: "Getting started", name: "Formatted message", triggers: [".format"], tags: ["rich-text"], format: "html",
      description: "Type .format in a rich text field to insert a formatted message.",
      replacement: "<p><b>Welcome to Snipio!</b></p><p>Make this message your own.</p>"
    },
    {
      key: "time-logic", folder: "Getting started", name: "Morning or afternoon", triggers: [".daygreeting"], tags: ["condition"],
      description: "Type .daygreeting to choose a greeting automatically based on the time of day.",
      replacement: "{if: time < 12}Good morning{else}Good afternoon{endif}!"
    },
    {
      key: "aliases", folder: "Getting started", name: "Two triggers, one message", triggers: [".thanks", ".welcome"], tags: ["aliases"],
      description: "Type .thanks or .welcome to insert the same message.",
      replacement: "Thanks for stopping by!"
    },
    {
      key: "undo", folder: "Getting started", name: "Instant undo", triggers: [".undo"], tags: ["undo"],
      description: "Type .undo, then immediately press Backspace to restore what you typed.",
      replacement: "Press Backspace now to bring back what you typed."
    }
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = examples;
  else root.RainExamples = examples;
})(globalThis);
