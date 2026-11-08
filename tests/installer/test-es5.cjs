/**
 * ES5 check of every script that CMU Opera runs.
 *
 * Modern Node accepts code that the strict parser of CMU Opera rejects, for example a function declaration
 * inside a block. This test parses every script as ES5 and rejects such declarations, before any browser or
 * DOM mock runs. It checks the grammar only, not whether the browser has a built-in function.
 *
 * Which files: every .js file and every non-empty inline <script> of an .html page in usb/ and
 * development/examples/, in all subfolders. Each folder is a test, each file (each inline script) a subtest,
 * so one bad file does not hide the others.
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-es5.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

// The Acorn parser that Node.js bundles internally (the project has no npm dependencies).
const key = Object.keys(process.binding("natives")).find((k) =>
  k.endsWith("acorn/dist/acorn")
);
assert(key, "This check requires the Acorn parser bundled with Node.js.");
const parserModule = new Module("cmu-es5-parser");
parserModule._compile(process.binding("natives")[key], "cmu-es5-parser.js");

// Parse as ES5 and refuse a function declaration anywhere but at the top or directly in a function body.
function check(source, name) {
  const tree = parserModule.exports.parse(source, {
    ecmaVersion: 5,
    locations: true
  });

  function walk(node, parent, grandparent) {
    if (node.type === "FunctionDeclaration") {
      const body =
        parent &&
        parent.type === "BlockStatement" &&
        grandparent &&
        /^(FunctionDeclaration|FunctionExpression)$/.test(grandparent.type) &&
        grandparent.body === parent;
      assert(
        parent && (parent.type === "Program" || body),
        name +
          ":" +
          node.loc.start.line +
          ": FunctionDeclaration in Statement context (CMU Opera strict mode)"
      );
    }
    for (const field of Object.keys(node)) {
      const value = node[field];
      if (Array.isArray(value)) {
        for (const child of value)
          if (child && child.type) walk(child, node, parent);
      } else if (value && typeof value === "object" && value.type)
        walk(value, node, parent);
    }
  }

  walk(tree, null, null);
}

const ROOT = path.join(__dirname, "../..");
const BASES = ["usb", "development/examples"];
// Files under BASES that CMU Opera never loads, relative to the repository root. Empty: all of them are run.
const EXCLUDE = new Set([]);

// The scripts of a folder: [name, source] for every .js file and every non-empty inline script of an .html page.
function scriptsOf(folder) {
  const scripts = [];
  for (const name of fs.readdirSync(path.join(ROOT, folder)).sort()) {
    const file = path.join(ROOT, folder, name);
    if (EXCLUDE.has(folder + "/" + name) || !fs.statSync(file).isFile())
      continue;
    const source = fs.readFileSync(file, "utf8");
    if (name.endsWith(".js")) scripts.push([name, source]);
    if (name.endsWith(".html")) {
      const inline = [
        ...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)
      ].filter((s) => s[1].trim());
      for (const [number, script] of inline.entries())
        scripts.push([name + " <script> " + (number + 1), script[1]]);
    }
  }
  return scripts;
}

// Every folder under the bases, depth first in name order.
function foldersOf(folder) {
  const folders = [folder];
  for (const entry of fs
    .readdirSync(path.join(ROOT, folder), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.isDirectory())
      folders.push(...foldersOf(folder + "/" + entry.name));
  }
  return folders;
}

test("the check itself", async (t) => {
  await t.test("refuses a function declaration in a block", () => {
    assert.throws(
      () =>
        check('"use strict"; if (true) { function update() {} }', "regression"),
      /Statement context/
    );
  });

  await t.test("accepts a function expression in a block", () => {
    check(
      '"use strict"; if (true) { var update=function() {}; update(); }',
      "fixed"
    );
  });
});

let found = 0;
for (const base of BASES) {
  for (const folder of foldersOf(base)) {
    const scripts = scriptsOf(folder);
    if (!scripts.length) continue;
    found += scripts.length;
    test(folder, async (t) => {
      for (const [name, source] of scripts) {
        await t.test(name, () => check(source, folder + "/" + name));
      }
    });
  }
}

test("the rule finds the scripts", () => {
  assert(found > 0, "no scripts found under " + BASES.join(" and "));
});
