// Copyright (C) 2026 DarkyTheRookie
// SPDX-License-Identifier: GPL-3.0-or-later
const { runtimeFile } = require("../helpers.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalize, match } = require(runtimeFile("core.js"));

test("snippet names ignore case and outer spaces while allowing self edits and empty names", () => {
  const { findNameConflict } = require(runtimeFile("core.js"));
  const shortcuts = [{ id: "one", name: "Greeting" }, { id: "two", name: "Other" }, { id: "empty", name: "" }];
  assert.equal(findNameConflict(shortcuts, " greeting ")?.id, "one");
  assert.equal(findNameConflict(shortcuts, "GREETING", "one"), null);
  assert.equal(findNameConflict(shortcuts, "Greeting", "two")?.id, "one");
  assert.equal(findNameConflict(shortcuts, "New"), null);
  assert.equal(findNameConflict(shortcuts, "  "), null);
});

test("library storage operations share one browser lock for their full asynchronous lifetime", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  let queue = Promise.resolve();
  const lockNames = [];
  const context = { module: { exports: {} }, navigator: { locks: { request(name, callback) {
    lockNames.push(name);
    const operation = queue.then(() => callback({ name }));
    queue = operation.catch(() => {});
    return operation;
  } } } };
  vm.runInNewContext(fs.readFileSync(require.resolve(runtimeFile("core.js")), "utf8"), context);
  const { withLibraryLock } = context.module.exports;
  const events = [];
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const first = withLibraryLock(async () => { events.push("first read"); await gate; events.push("first write"); return "one"; });
  const second = withLibraryLock(async () => { events.push("second read"); events.push("second write"); return "two"; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ["first read"], "another view cannot read while the first write is pending");
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["one", "two"]);
  assert.deepEqual(events, ["first read", "first write", "second read", "second write"]);
  assert.deepEqual(lockNames, ["snipio-library", "snipio-library"]);
});

test("library lock fallback keeps operation results and errors intact", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const context = { module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve(runtimeFile("core.js")), "utf8"), context);
  const { withLibraryLock } = context.module.exports;
  assert.equal(await withLibraryLock(async () => "saved"), "saved");
  await assert.rejects(withLibraryLock(async () => { throw new Error("Unavailable"); }), /Unavailable/);
});

test("variables use one clock, first cursor, and do not interpret clipboard data", () => {
  const { expandVariables } = require(runtimeFile("core.js"));
  const now = new Date(2026, 9, 19, 9, 4, 5);
  const result = expandVariables("{date} {time} {cursor}{clipboard}{cursor}!", { now, clipboard: "{date}<script>" });
  assert.equal(result.replacement, `${now.toLocaleDateString()} ${now.toLocaleTimeString()} {date}<script>!`);
  assert.equal(result.cursor, `${now.toLocaleDateString()} ${now.toLocaleTimeString()} `.length);
});

test("fill-in fields deduplicate and insert values literally", () => {
  const { formFields, expandVariables } = require(runtimeFile("core.js"));
  assert.deepEqual(formFields("{form: name} {form: company} {form:name}"), ["name", "company"]);
  assert.equal(expandVariables("{form: name} {form:name}", { fields: { name: "{cursor}" } }).replacement, "{cursor} {cursor}");
});

test("stats accumulate local counts, clamp negative savings and tolerate corrupt data", () => {
  const { recordUsage, normalizeStats } = require(runtimeFile("core.js"));
  let stats = recordUsage(null, "a", 20, 2);
  stats = recordUsage(stats, "a", 10, 2);
  stats = recordUsage(stats, "b", 1, 3);
  assert.deepEqual(stats.entries, [{ id: "a", count: 2, saved: 26 }, { id: "b", count: 1, saved: 0 }]);
  assert.deepEqual(normalizeStats({ entries: [{ id: "x", count: -1, saved: "bad" }] }).entries, [{ id: "x", count: 0, saved: 0 }]);
});

test("conditionals support clock boundaries, weekdays, nested branches and form values", () => {
  const { renderLogic, formFields } = require(runtimeFile("core.js"));
  const morning = new Date(2026, 9, 19, 11, 59);
  const noon = new Date(2026, 9, 19, 12, 0);
  const greeting = "{if: time < 12}Morning{else}Afternoon{endif}";
  assert.equal(renderLogic(greeting, { now: morning }), "Morning");
  assert.equal(renderLogic(greeting, { now: noon }), "Afternoon");
  const nested = '{if: day == "Monday"}{if: form.company == "Rain"}Team{else}Guest{endif}{else}Other day{endif}';
  assert.equal(renderLogic(nested, { now: noon, fields: { company: "Rain" } }), "Team");
  assert.deepEqual(formFields(nested), ["company"]);
  assert.equal(renderLogic('{if: form: age >= 18}Adult{else}Child{endif}', { fields: { age: "21" } }), "Adult");
  assert.equal(renderLogic('{if: day != 0}Week{endif}', { now: noon }), "Week");
});

test("invalid logic produces actionable line errors and never executes code", () => {
  const { validateTemplate } = require(runtimeFile("core.js"));
  for (const source of ['{else}', '{endif}', '{if: time < 12}missing', '{if: time < 12}a{else}b{else}c{endif}',
    '{if: eval("bad") == 1}x{endif}', '{if: day == "Funday"}x{endif}', '{if: time < 12', '{form: }']) {
    assert.match(validateTemplate(source), /Line \d+:/u, source);
  }
});

test("sharing round trips Unicode folders and metadata without settings or usage", () => {
  const { encodeShare, decodeShare } = require(runtimeFile("core.js"));
  const settings = normalize({ enabled: false, folders: [{ id: "folder", name: "Жұмыс" }], shortcuts: [
    { id: "hello", trigger: "/s", replacement: "Сәлем 👋 {form: name}", name: "Greeting", folderId: "folder", tags: ["team"] }
  ] });
  const code = encodeShare(settings, settings.shortcuts);
  assert.ok(code.startsWith("RAIN1."));
  const result = decodeShare(code);
  assert.deepEqual(result.shortcuts, settings.shortcuts);
  assert.deepEqual(result.folders, settings.folders);
  assert.equal(result.enabled, true);
  for (const invalid of ["RAIN2.abc", "RAIN1.broken", "x".repeat(1333343)]) assert.throws(() => decodeShare(invalid));
  assert.throws(() => encodeShare(settings, []), /supported Snipio/);
});

test("legacy shortcuts keep their phrase and gain an editable alias list", () => {
  const saved = { shortcuts: [{ id: "mine", trigger: "hi", replacement: "My saved phrase" }] };
  assert.deepEqual(normalize(saved).shortcuts[0], {
    id: "mine", trigger: "hi", triggers: ["hi"], replacement: "My saved phrase", name: "", favorite: false, format: "text", tags: [], folderId: null
  });
});

test("several case-sensitive aliases share one phrase and return the matched length", () => {
  const items = normalize({ shortcuts: [{ id: "greeting", triggers: ["hi", "Hi", ";hello"], replacement: "Hello!" }] }).shortcuts;
  for (const alias of ["hi", "Hi", ";hello"]) {
    const result = match(`say ${alias}`, items);
    assert.equal(result.trigger, alias);
    assert.equal(result.replacement, "Hello!");
  }
  assert.equal(match("HI", items), null);
  assert.equal(match("this", items), null);
});

test("normalization removes alias collisions while preserving other aliases", () => {
  const result = normalize({ shortcuts: [
    { triggers: ["hi", "hi", "Hi"], replacement: "First" },
    { triggers: ["hi", ";hello"], replacement: "Second" }
  ] });
  assert.deepEqual(result.shortcuts.map(item => item.triggers), [["hi", "Hi"], [";hello"]]);
});

test("instant expansion conflicts include exact aliases and prefixes in either direction", () => {
  const { findTriggerConflict } = require(runtimeFile("core.js"));
  const settings = normalize({ shortcuts: [
    { id: "greeting", triggers: ["hi", ";hello"], replacement: "Hello!" },
    { id: "date", trigger: "/date", replacement: "Today" }
  ] });
  const before = JSON.stringify(settings);
  assert.equal(findTriggerConflict(settings.shortcuts, [";new", "hi"]), "hi");
  assert.equal(findTriggerConflict(settings.shortcuts, ["high"]), "high", "an existing shorter alias would expand first");
  assert.equal(findTriggerConflict(settings.shortcuts, ["/d"]), "/d", "a new shorter alias would make the existing alias unreachable");
  assert.equal(findTriggerConflict(settings.shortcuts, [";helloworld"]), ";helloworld", "all aliases of existing snippets are checked");
  assert.equal(findTriggerConflict(settings.shortcuts, [";new"]), null);
  assert.equal(JSON.stringify(settings), before, "validation never changes saved snippets");
});

test("aliases within the same requested snippet cannot prefix each other", () => {
  const { findTriggerConflict } = require(runtimeFile("core.js"));
  assert.equal(findTriggerConflict([], ["/x", "/xd"]), "/x");
  assert.equal(findTriggerConflict([], ["/xd", "/x"]), "/xd");
  assert.equal(findTriggerConflict([], ["same", "same"]), "same");
  assert.equal(findTriggerConflict([], ["/x", ";x"]), null);
  assert.equal(findTriggerConflict([], []), null);
});

test("conflict checks ignore the item being edited and respect case", () => {
  const { findTriggerConflict } = require(runtimeFile("core.js"));
  const settings = normalize({ shortcuts: [
    { id: "mine", triggers: ["hi", ";hello"], replacement: "Hello!" },
    { id: "other", trigger: "/date", replacement: "Today" }
  ] });
  assert.equal(findTriggerConflict(settings.shortcuts, ["hi", ";hello"], "mine"), null);
  assert.equal(findTriggerConflict(settings.shortcuts, ["high"], "mine"), null);
  assert.equal(findTriggerConflict(settings.shortcuts, ["hi", "high"], "mine"), "hi", "editing still checks the replacement alias list against itself");
  assert.equal(findTriggerConflict(settings.shortcuts, ["/d"], "mine"), "/d", "other snippets remain protected during an edit");
  assert.equal(findTriggerConflict(settings.shortcuts, ["Hi", ";Hello"]), null);
  assert.equal(findTriggerConflict([], ["hi", "Hi", "HI"]), null);
});

test("legacy prefix conflicts are preserved during normalization", () => {
  const settings = normalize({ shortcuts: [
    { id: "short", trigger: "hi", replacement: "Short phrase" },
    { id: "long", triggers: ["high", "High"], replacement: "Long phrase" }
  ] });
  assert.deepEqual(settings.shortcuts.map(item => item.triggers), [["hi"], ["high", "High"]]);
});

test("new installations get the requested example and immediate mode", () => {
  const settings = normalize();
  assert.equal(settings.mode, "immediate");
  assert.equal(match("hi", settings.shortcuts).replacement, "Hello, how are you?");
});

test("matches only at whitespace boundaries, with exact case", () => {
  const items = normalize().shortcuts;
  for (const text of ["hi", "say hi", "\nhi", "\thi"]) assert.ok(match(text, items), text);
  for (const text of ["this", "high", "Hi", "(hi", "ahi", ""]) assert.equal(match(text, items), null, text);
});

test("longest shortcut wins, including non-ASCII and punctuation triggers", () => {
  const items = [
    { trigger: "hi", replacement: "short" },
    { trigger: ";hi", replacement: "prefixed" },
    { trigger: "сәлем", replacement: "Сәлеметсіз бе!" }
  ];
  assert.equal(match(";hi", items).replacement, "prefixed");
  assert.equal(match(" сәлем", items).replacement, "Сәлеметсіз бе!");
});

test("deleted shortcuts stay deleted and settings survive normalization", () => {
  assert.deepEqual(normalize({ enabled: false, mode: "immediate", shortcuts: [] }), {
    enabled: false, mode: "immediate", shortcuts: [], folders: []
  });
});

test("all legacy expansion settings migrate to immediate typing", () => {
  for (const mode of ["delimiter", "immediate", "unknown", null, undefined]) {
    const settings = normalize({ mode, shortcuts: [{ trigger: "hello", replacement: "My phrase" }] });
    assert.equal(settings.mode, "immediate");
    assert.equal(settings.shortcuts[0].replacement, "My phrase");
  }
});

test("favorites and the demo seed marker survive settings edits", () => {
  const settings = normalize({ snipioDemosVersion: 1, shortcuts: [
    { trigger: "yes", replacement: "Favorite", favorite: true },
    { trigger: "no", replacement: "Ordinary", favorite: "true" }
  ] });
  assert.deepEqual(settings.shortcuts.map(item => item.favorite), [true, false]);
  assert.equal(normalize(settings).snipioDemosVersion, 1);
  assert.equal(normalize({ snipioDemosVersion: "1" }).snipioDemosVersion, undefined);
  assert.deepEqual(normalize({ ...settings, shortcuts: [] }).shortcuts, []);
});

test("folder favorites survive normalization and sharing without changing snippet favorites", () => {
  const { encodeShare, decodeShare } = require(runtimeFile("core.js"));
  const settings = normalize({ folders: [{ id: "work", name: "Work", favorite: true }, { id: "other", name: "Other", favorite: "true" }], shortcuts: [
    { id: "note", trigger: ".note", replacement: "Note", folderId: "work" }
  ] });
  assert.equal(settings.folders[0].favorite, true);
  assert.equal(!!settings.folders[1].favorite, false);
  assert.equal(settings.shortcuts[0].favorite, false);
  assert.deepEqual(normalize(settings).folders, settings.folders);
  assert.equal(decodeShare(encodeShare(settings, settings.shortcuts)).folders[0].favorite, true);
  settings.folders[0].favorite = false;
  assert.equal(!!normalize(settings).folders[0].favorite, false);
});

test("popup eligibility routes long, rich, dynamic and incomplete drafts to the full editor", () => {
  const { isSimpleSnippet, SIMPLE_TEXT_LIMIT } = require(runtimeFile("core.js"));
  const text = replacement => ({ format: "text", replacement });
  for (const replacement of ["", "Hello!", "a\nb\nc\nd", "a".repeat(SIMPLE_TEXT_LIMIT), "Use {ordinary} braces"]) {
    assert.equal(isSimpleSnippet(text(replacement)), true, replacement);
  }
  for (const replacement of ["a".repeat(SIMPLE_TEXT_LIMIT + 1), "a\nb\nc\nd\ne", "a\rb\rc\rd\re",
    "{date}", "{time}", "{clipboard}", "{cursor}", "{form: name}", "{form:", "{if: time <",
    "{else}", "{endif}", "{date", "{cursor", "{form"]) {
    assert.equal(isSimpleSnippet(text(replacement)), false, replacement);
  }
  assert.equal(isSimpleSnippet({ format: "html", replacement: "Short" }), false);
  assert.equal(isSimpleSnippet(null), false);
});

test("folder migration and search cover names, aliases, content and tags", () => {
  const { filterSnippets } = require(runtimeFile("core.js"));
  const settings = normalize({ folders: [{ id: "work", name: "Work" }], shortcuts: [
    { trigger: "/s", replacement: "Hello", name: "Greeting", tags: ["client"], folderId: "work" },
    { trigger: "/x", replacement: "Other", folderId: "deleted" }
  ] });
  for (const query of ["greet", "/s", "hello", "CLIENT"]) assert.equal(filterSnippets(settings.shortcuts, query).length, 1);
  assert.equal(filterSnippets(settings.shortcuts, "", "work").length, 1);
  assert.equal(filterSnippets(settings.shortcuts, "", "")[0].trigger, "/x");
});

test("invalid and duplicate entries are ignored without losing valid multiline phrases", () => {
  const settings = normalize({ shortcuts: [
    null, { trigger: "bad word", replacement: "x" }, { trigger: "", replacement: "x" },
    { trigger: "ok", replacement: "first\nsecond" }, { trigger: "ok", replacement: "duplicate" },
    { trigger: "empty", replacement: "" }, { trigger: 3, replacement: "x" }
  ] });
  assert.equal(settings.shortcuts.length, 1);
  assert.equal(settings.shortcuts[0].replacement, "first\nsecond");
});
