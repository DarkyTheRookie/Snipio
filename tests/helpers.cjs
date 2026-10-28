// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repositoryRoot, "extension");
const artifactsDir = path.join(repositoryRoot, "artifacts");
const sharedFiles = new Set(["core.js", "rich.js", "snippet-blocks.js", "examples.js", "example-library.js", "backup-core.js"]);

function runtimeRelative(name) {
  if (sharedFiles.has(name)) return `lib/${name}`;
  if (["manifest.json", "background.js", "content.js"].includes(name)) return name;
  if (name === "theme.css") return "styles/theme.css";
  if (name.startsWith("icons/")) return `assets/${name}`;
  if (name.startsWith("sounds/")) return "assets/sounds/expansion.wav";
  if (/^[a-z-]+\.(?:html|css|js)$/u.test(name)) return `pages/${name}`;
  throw new Error(`Unknown extension fixture: ${name}`);
}
function runtimeFile(name) { return path.join(extensionRoot, runtimeRelative(name)); }
function runtimeUrl(name, extensionId) { return `chrome-extension://${extensionId}/${runtimeRelative(name)}`; }
function artifactFile(name) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  return path.join(artifactsDir, name);
}

module.exports = { repositoryRoot, extensionRoot, artifactsDir, runtimeRelative, runtimeFile, runtimeUrl, artifactFile };
