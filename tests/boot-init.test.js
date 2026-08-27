import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("all imports from data.js in simple.js are exported", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  const dataSource = await readFile(new URL("../src/data.js", import.meta.url), "utf8");
  
  // Extract all imports from data.js in simple.js
  const importMatch = simpleSource.match(/import\s+\{([^}]+)\}\s+from\s+["']\.\/data\.js["']/);
  assert.ok(importMatch, "simple.js must import from data.js");
  
  const imports = importMatch[1]
    .split(",")
    .map(name => name.trim())
    .filter(Boolean);
  
  assert.ok(imports.length > 0, "simple.js must import at least one symbol from data.js");
  
  // Verify each import is exported in data.js
  for (const importName of imports) {
    const exportPattern = new RegExp(`export\\s+(function|const|let|var|\\{[^}]*\\b${importName}\\b)`);
    assert.match(
      dataSource,
      exportPattern,
      `${importName} must be exported from data.js but was not found. This causes a boot crash.`
    );
  }
});

test("all element IDs in simple.js ids array exist in index.html", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  
  // Extract the ids array from simple.js
  const idsMatch = simpleSource.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(idsMatch, "simple.js must define an ids array");
  
  const ids = idsMatch[1]
    .split(",")
    .map(line => line.trim().replace(/['"]/g, ""))
    .filter(Boolean);
  
  assert.ok(ids.length > 0, "ids array must contain at least one ID");
  
  // Verify each ID exists in index.html
  for (const id of ids) {
    assert.match(
      indexHtml,
      new RegExp(`id=["']${id}["']`),
      `Element with id="${id}" must exist in index.html. Missing elements cause boot crashes when addEventListener is called.`
    );
  }
});

test("simple.js imports can be statically analyzed", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify imports use static string literals (not dynamic)
  const importLines = simpleSource.match(/^import\s+.*from\s+["'][^"']+["'];?$/gm);
  assert.ok(importLines && importLines.length > 0, "simple.js must have at least one import");
  
  for (const importLine of importLines) {
    // Ensure no template literals or concatenation in import paths
    assert.doesNotMatch(
      importLine,
      /from\s+[`$]/,
      "Import paths must be static strings, not dynamic template literals"
    );
  }
});

test("simple.js does not have obvious syntax errors", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Basic syntax checks that would cause boot crashes
  const openBraces = (simpleSource.match(/\{/g) || []).length;
  const closeBraces = (simpleSource.match(/\}/g) || []).length;
  assert.equal(openBraces, closeBraces, "Braces must be balanced");
  
  const openParens = (simpleSource.match(/\(/g) || []).length;
  const closeParens = (simpleSource.match(/\)/g) || []).length;
  assert.equal(openParens, closeParens, "Parentheses must be balanced");
});

test("loadStore function exists for state initialization", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify loadStore is defined and called during state initialization
  assert.match(simpleSource, /function loadStore\(\)/, "loadStore function must exist");
  assert.match(simpleSource, /const state = \{[\s\S]*?store: loadStore\(\)/, "state must call loadStore()");
});
