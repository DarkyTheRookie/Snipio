// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");
const { deflateRawSync } = require("node:zlib");

// Release inputs are explicit: adding scratch files to extension/ cannot ship them.
const SOURCE_FILES = [
  "background.js", "content.js", "manifest.json",
  ...["backup-core", "core", "example-library", "examples", "rich", "snippet-blocks"].map(name => `lib/${name}.js`),
  ...["audio", "backup", "editor", "manager", "reset-library", "stats"].flatMap(name => [`pages/${name}.html`, `pages/${name}.js`]),
  ...["backup", "editor", "manager", "reset-library"].map(name => `pages/${name}.css`),
  "pages/usage.js", "styles/theme.css", "assets/icons/snipio-logo.svg",
  ...[16, 32, 48, 128].map(size => `assets/icons/snipio-${size}.png`),
  "assets/sounds/expansion.wav"
];
const NOTICE_FILES = ["LICENSE", "PRIVACY.md", "docs/THIRD_PARTY_NOTICES.md", "scripts/generate-sound.cjs"];
const TARGETS = ["chrome-edge", "firefox"];
function assertNoLinks(repositoryRoot, target) {
  const relative = path.relative(repositoryRoot, target);
  if (!relative || relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) throw new Error("Release path must stay inside the repository: " + target);
  let current = repositoryRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Symlinks and junctions are not allowed in release paths: " + current);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
function readReleaseFile(repositoryRoot, relative) {
  const target = path.join(repositoryRoot, relative);
  assertNoLinks(repositoryRoot, target);
  return fs.readFileSync(target);
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function zipFiles(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, data] of [...files].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) throw new Error("Unsafe archive path: " + name);
    const filename = Buffer.from(name, "utf8"), compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); // 1980-01-01, no source timestamps.
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(8, 10); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, filename); offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function packageFiles(repositoryRoot, target) {
  if (!TARGETS.includes(target)) throw new Error("Unknown build target: " + target);
  const files = new Map(SOURCE_FILES.map(name => [name, readReleaseFile(repositoryRoot, path.join("extension", name))]));
  for (const name of NOTICE_FILES) files.set(name, readReleaseFile(repositoryRoot, name));
  if (target === "firefox") {
    const manifest = JSON.parse(files.get("manifest.json"));
    const overrides = JSON.parse(readReleaseFile(repositoryRoot, "config/manifest.firefox.json"));
    delete manifest.minimum_chrome_version;
    manifest.permissions = manifest.permissions.filter(permission => permission !== "offscreen");
    Object.assign(manifest, overrides);
    files.set("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  }
  return files;
}
function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error("Symlinks and junctions are not allowed in release paths: " + path.join(directory, entry.name));
    return entry.isDirectory() ? walkFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)];
  });
}
function buildPackages({ repositoryRoot = path.resolve(__dirname, ".."), outputRoot = path.join(repositoryRoot, "dist"), targets = TARGETS } = {}) {
  repositoryRoot = path.resolve(repositoryRoot); outputRoot = path.resolve(outputRoot);
  if (!outputRoot.startsWith(repositoryRoot + path.sep)) throw new Error("Build output must stay inside the repository.");
  assertNoLinks(repositoryRoot, outputRoot);
  const version = JSON.parse(readReleaseFile(repositoryRoot, "package.json")).version;
  if (!/^\d+(?:\.\d+){0,3}$/u.test(version)) throw new Error("Invalid package version.");
  if (JSON.parse(readReleaseFile(repositoryRoot, "extension/manifest.json")).version !== version) throw new Error("package.json and extension/manifest.json versions must match.");
  const outputs = [];
  for (const target of targets) {
    const files = packageFiles(repositoryRoot, target), directory = path.join(outputRoot, target);
    if (JSON.parse(files.get("manifest.json")).version !== version) throw new Error("Target manifest version must match package.json.");
    assertNoLinks(repositoryRoot, directory);
    fs.mkdirSync(directory, { recursive: true });
    // Remove stale files only inside this resolved, generated target directory.
    for (const file of walkFiles(directory)) {
      if (!file.startsWith(directory + path.sep)) throw new Error("Unsafe stale build path.");
      const relative = path.relative(directory, file).split(path.sep).join("/");
      if (!files.has(relative)) fs.unlinkSync(file);
    }
    for (const [name, data] of files) {
      const destination = path.join(directory, name);
      assertNoLinks(repositoryRoot, destination);
      fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, data);
    }
    const archive = path.join(outputRoot, `snipio-${target}-${version}.zip`);
    assertNoLinks(repositoryRoot, archive);
    fs.writeFileSync(archive, zipFiles(files));
    outputs.push({ target, directory, archive, files: files.size });
  }
  return outputs;
}
if (require.main === module) {
  const requested = process.argv[2] || "all";
  const targets = requested === "all" ? TARGETS : requested === "chromium" ? ["chrome-edge"] : requested === "firefox" ? ["firefox"] : null;
  if (!targets) { console.error("Usage: node scripts/build.cjs [all|chromium|firefox]"); process.exitCode = 1; }
  else for (const output of buildPackages({ targets })) console.log(`Built ${output.target}: ${output.archive} (${output.files} files)`);
}
module.exports = { buildPackages, packageFiles, zipFiles, SOURCE_FILES, NOTICE_FILES };
