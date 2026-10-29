// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { inflateRawSync } = require("node:zlib");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPackages, packageFiles } = require("../../scripts/build.cjs");
const repositoryRoot = path.resolve(__dirname, "../..");
function unpack(buffer) {
  const entries = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 6), 0x800);
    assert.equal(buffer.readUInt16LE(offset + 8), 8);
    const packed = buffer.readUInt32LE(offset + 18), size = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26), extra = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extra;
    const contents = inflateRawSync(buffer.subarray(start, start + packed));
    assert.equal(contents.length, size);
    entries.set(name, contents);
    offset = start + packed;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  assert.equal(buffer.readUInt16LE(buffer.length - 12), entries.size);
  return entries;
}
test("release ZIPs are reproducible, loadable, target-specific and leave source intact", () => {
  const scratch = path.join(repositoryRoot, ".local");
  fs.mkdirSync(scratch, { recursive: true });
  const outputRoot = fs.mkdtempSync(path.join(scratch, "build-test-"));
  const sourceManifest = fs.readFileSync(path.join(repositoryRoot, "extension/manifest.json"));
  const outputs = buildPackages({ repositoryRoot, outputRoot });
  const hashes = outputs.map(output => createHash("sha256").update(fs.readFileSync(output.archive)).digest("hex"));
  // A stray file from an older build must not survive in the loadable directory.
  fs.writeFileSync(path.join(outputs[1].directory, "obsolete.js"), "throw new Error('old build');");
  buildPackages({ repositoryRoot, outputRoot });
  assert(!fs.existsSync(path.join(outputs[1].directory, "obsolete.js")));
  for (let index = 0; index < outputs.length; index++) {
    const output = outputs[index], archive = fs.readFileSync(output.archive), files = unpack(archive);
    assert.equal(createHash("sha256").update(archive).digest("hex"), hashes[index]);
    assert(files.has("manifest.json"));
    assert(files.get("LICENSE").equals(fs.readFileSync(path.join(repositoryRoot, "LICENSE"))));
    assert(files.has("PRIVACY.md") && files.has("docs/THIRD_PARTY_NOTICES.md") && files.has("scripts/generate-sound.cjs"));
    assert(![...files.keys()].some(name => /(?:^|\/)(?:\.local|node_modules|artifacts|tests|\.env)|\.(?:mp3|zip|pem|key)$/u.test(name)));
    for (const [name, data] of files) assert(data.equals(fs.readFileSync(path.join(output.directory, name))), name);
    const manifest = JSON.parse(files.get("manifest.json"));
    assert.equal(manifest.manifest_version, 3);
    if (output.target === "firefox") {
      assert.deepEqual(manifest.background.scripts, ["lib/core.js", "background.js"]);
      assert(!manifest.background.service_worker && !manifest.permissions.includes("offscreen"));
      assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "140.0");
      assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
    } else assert(files.get("manifest.json").equals(sourceManifest));
    const check = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/check-extension.cjs"), output.directory], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stderr || check.stdout);
  }
  assert(sourceManifest.equals(fs.readFileSync(path.join(repositoryRoot, "extension/manifest.json"))));
});
test("release builder rejects unknown targets and output outside repository", () => {
  assert.throws(() => packageFiles(repositoryRoot, "../private"), /Unknown build target/u);
  assert.throws(() => buildPackages({ repositoryRoot, outputRoot: path.dirname(repositoryRoot) }), /inside the repository/u);
});
test("release builder rejects junction output without writing through it", t => {
  const scratch = path.join(repositoryRoot, ".local");
  fs.mkdirSync(scratch, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(scratch, "build-link-test-"));
  const privateDirectory = path.join(fixture, "private"), outputRoot = path.join(fixture, "output");
  fs.mkdirSync(privateDirectory);
  fs.writeFileSync(path.join(privateDirectory, "keep.txt"), "must remain untouched");
  try { fs.symlinkSync(privateDirectory, outputRoot, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Filesystem does not permit link creation."); return; }
    throw error;
  }
  assert.throws(() => buildPackages({ repositoryRoot, outputRoot }), /Symlinks and junctions/u);
  assert.deepEqual(fs.readdirSync(privateDirectory), ["keep.txt"]);
  assert.equal(fs.readFileSync(path.join(privateDirectory, "keep.txt"), "utf8"), "must remain untouched");
});
test("release builder rejects mismatched source versions before writing a package", () => {
  const scratch = path.join(repositoryRoot, ".local");
  fs.mkdirSync(scratch, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(scratch, "build-version-test-"));
  fs.mkdirSync(path.join(fixture, "extension"));
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ version: "2.0.0" }));
  fs.writeFileSync(path.join(fixture, "extension/manifest.json"), JSON.stringify({ version: "1.4.1" }));
  assert.throws(() => buildPackages({ repositoryRoot: fixture }), /versions must match/u);
  assert(!fs.existsSync(path.join(fixture, "dist")));
});
