// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
function localFile(relative, base = root) {
  const target = path.resolve(base, relative.split(/[?#]/u)[0]);
  if (!target.startsWith(root + path.sep) || !fs.statSync(target).isFile()) throw new Error("Invalid packaged resource: " + relative);
  return target;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const resources = [manifest.background.service_worker, manifest.options_page, manifest.action.default_popup,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])])];
resources.forEach(relative => localFile(relative));
let scripts = 0, pages = 0;
for (const file of walk(root)) {
  if (file.endsWith(".js")) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "Invalid JavaScript: " + file);
    scripts++;
  }
  if (file.endsWith(".html")) {
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/gu)) {
      if (/^(?:https?:|mailto:|#)/u.test(match[1])) continue;
      localFile(match[1], path.dirname(file));
    }
    pages++;
  }
  if (/(?:\.env(?:\.|$)|\.pem$|\.key$|snipio-backup-.*\.json$|ps2-sound|node_modules|\.test\.cjs$)/iu.test(path.relative(root, file))) throw new Error("Unexpected release file: " + file);
}
console.log(`PASS extension package: ${scripts} JavaScript files, ${pages} HTML pages, all packaged resources resolve.`);
