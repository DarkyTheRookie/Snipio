// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("Only Manifest V3 packages are supported.");
if (Object.hasOwn(manifest, "key")) throw new Error("A public package must not contain a manifest key.");
if (!manifest.name || !manifest.version || !manifest.description) throw new Error("Missing public manifest metadata.");
const background = manifest.background || {};
const backgroundFiles = background.service_worker ? [background.service_worker] : background.scripts;
if (!Array.isArray(backgroundFiles) || !backgroundFiles.length) throw new Error("Missing local background script.");
if (manifest.browser_specific_settings?.gecko) {
  const gecko = manifest.browser_specific_settings.gecko;
  if (!gecko.id || !gecko.strict_min_version || !Array.isArray(gecko.data_collection_permissions?.required)) throw new Error("Incomplete Firefox publication metadata.");
  if (background.service_worker || manifest.permissions.includes("offscreen") || manifest.minimum_chrome_version) throw new Error("Chrome-only manifest settings in Firefox package.");
}
function localFile(relative, base = root) {
  if (typeof relative !== "string" || !relative || /^(?:[a-z]+:|\/\/)/iu.test(relative)) throw new Error("Non-local packaged resource: " + relative);
  const target = path.resolve(base, relative.split(/[?#]/u)[0]);
  if (!target.startsWith(root + path.sep) || !fs.statSync(target).isFile()) throw new Error("Invalid packaged resource: " + relative);
  return target;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const resources = [...backgroundFiles, manifest.options_page, manifest.action.default_popup,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])])];
resources.forEach(relative => localFile(relative));
let scripts = 0, pages = 0;
for (const file of walk(root)) {
  if (/\.(?:js|cjs)$/u.test(file)) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "Invalid JavaScript: " + file);
    scripts++;
  }
  if (file.endsWith(".html")) {
    const html = fs.readFileSync(file, "utf8");
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
      const source = /\bsrc="([^"]+)"/iu.exec(script[1]);
      if (!source || script[2].trim()) throw new Error("Inline or missing script source: " + file);
      localFile(source[1], path.dirname(file));
    }
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/gu)) {
      if (/^(?:https?:|mailto:|#)/u.test(match[1])) continue;
      localFile(match[1], path.dirname(file));
    }
    pages++;
  }
  if (/(?:^|[\\/])(?:\.env(?:\.|$)|\.local|node_modules|artifacts|test-results)|(?:\.pem$|\.key$|\.mp3$|\.zip$|\.crx$|snipio-backup-.*\.json$|ps2-sound|\.test\.cjs$)/iu.test(path.relative(root, file))) throw new Error("Unexpected release file: " + file);
}
console.log(`PASS ${path.relative(process.cwd(), root) || root}: ${scripts} JavaScript files, ${pages} HTML pages, MV3 and all local packaged resources resolve.`);
