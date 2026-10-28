// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const directory = path.join(root, "tests/browser");
const requested = process.argv.slice(2);
const tests = requested.length ? requested.map(name => name.endsWith(".cjs") ? name : name + ".cjs")
  : ["backup-browser.cjs", "organization-browser.cjs", "reset-library-browser.cjs", "sound-browser.cjs", "live-extension.cjs"];
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
let modulePath;
try { modulePath = require.resolve("playwright"); }
catch { console.error("Install optional browser tools first: npm install && npx playwright install chromium"); process.exit(1); }
for (const test of tests) {
  if (path.basename(test) !== test || !fs.existsSync(path.join(directory, test))) throw new Error("Unknown browser test: " + test);
  console.log("Running " + test);
  const args = [path.join(directory, test), modulePath];
  if (process.env.SNIPIO_BROWSER_EXECUTABLE) args.push(process.env.SNIPIO_BROWSER_EXECUTABLE);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
