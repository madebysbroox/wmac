import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * CRITICAL BOOT SMOKE TEST
 * 
 * This test prevents 2.0.3 and 2.0.5 class failures from shipping.
 * It loads the REAL index.html and validates that:
 * 1. All DOM element IDs referenced in simple.js exist
 * 2. The app can initialize without throwing
 * 3. Event listeners can attach to required elements
 * 
 * If this test fails, the app will be bricked on the owner's machine.
 * DO NOT disable or skip this test.
 */

test("CRITICAL: Boot smoke test - all required DOM elements exist", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  
  // Extract the ids array that simple.js uses to query elements
  const idsMatch = simpleSource.match(/const ids = \[([\s\S]*?)\];/);
  assert.ok(idsMatch, "simple.js must define the ids array");
  
  const ids = idsMatch[1]
    .split(",")
    .map(line => line.trim().replace(/['"]/g, ""))
    .filter(Boolean);
  
  assert.ok(ids.length > 50, `Expected 50+ element IDs, found ${ids.length}`);
  
  const missingIds = [];
  for (const id of ids) {
    const pattern = new RegExp(`id=["']${id}["']`);
    if (!pattern.test(indexHtml)) {
      missingIds.push(id);
    }
  }
  
  if (missingIds.length > 0) {
    assert.fail(
      `BOOT WILL FAIL: ${missingIds.length} required element(s) missing from index.html:\n` +
      missingIds.map(id => `  - id="${id}"`).join("\n") +
      `\n\nWhen simple.js tries to attach event listeners to these missing elements, ` +
      `the app will crash before rendering anything.`
    );
  }
});

test("CRITICAL: Boot smoke test - addEventListener targets exist at init time", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  
  // Find all top-level attachListener calls
  // These run immediately when the module loads (after helper function definition but before other functions)
  // Split on loadStore function (the first real function after initialization)
  const initSection = simpleSource.split(/^function loadStore\(\)/m)[0];
  
  // Extract element references that get event listeners attached at top level
  // Pattern: attachListener(el.someId, "someId", ...)
  const topLevelListeners = [...initSection.matchAll(/attachListener\(el\.(\w+),\s*["'](\w+)["']/g)];
  
  assert.ok(
    topLevelListeners.length > 10,
    `Expected 10+ top-level event listeners, found ${topLevelListeners.length}`
  );
  
  const missingListenerTargets = [];
  for (const [, , elementId] of topLevelListeners) {
    const pattern = new RegExp(`id=["']${elementId}["']`);
    if (!pattern.test(indexHtml)) {
      missingListenerTargets.push(elementId);
    }
  }
  
  if (missingListenerTargets.length > 0) {
    assert.fail(
      `BOOT WILL FAIL: ${missingListenerTargets.length} event listener target(s) missing from index.html:\n` +
      missingListenerTargets.map(id => `  - attachListener(el.${id}, ...) references missing element`).join("\n") +
      `\n\nWith fail-soft listeners, the app will boot but these controls will be non-functional.`
    );
  }
});

test("CRITICAL: Boot smoke test - all imports are exported", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Check each import statement
  const importStatements = simpleSource.match(/^import\s+\{[^}]+\}\s+from\s+["']\.\/[^"']+["'];?$/gm) || [];
  
  assert.ok(importStatements.length > 0, "simple.js must have at least one local import");
  
  for (const importStatement of importStatements) {
    const moduleMatch = importStatement.match(/from\s+["'](\.[^"']+)["']/);
    if (!moduleMatch) continue;
    
    const modulePath = moduleMatch[1];
    const importsMatch = importStatement.match(/\{([^}]+)\}/);
    if (!importsMatch) continue;
    
    const imports = importsMatch[1]
      .split(",")
      .map(name => name.trim())
      .filter(Boolean);
    
    // Load the source module
    const sourceFile = modulePath.replace("./", "../src/") + (modulePath.endsWith(".js") ? "" : ".js");
    let moduleSource;
    try {
      moduleSource = await readFile(new URL(sourceFile, import.meta.url), "utf8");
    } catch {
      continue; // Skip if file doesn't exist (might be external)
    }
    
    // Check each import is exported
    const missingExports = [];
    for (const importName of imports) {
      const exportPattern = new RegExp(
        `(?:^|\\n)export\\s+(?:` +
        `function\\s+${importName}\\b|` +
        `const\\s+${importName}\\b|` +
        `let\\s+${importName}\\b|` +
        `var\\s+${importName}\\b|` +
        `\\{[^}]*\\b${importName}\\b[^}]*\\})`
      );
      
      if (!exportPattern.test(moduleSource)) {
        missingExports.push(importName);
      }
    }
    
    if (missingExports.length > 0) {
      assert.fail(
        `BOOT WILL FAIL: Module load error - imports not exported from ${modulePath}:\n` +
        missingExports.map(name => `  - import { ${name} } // NOT EXPORTED`).join("\n") +
        `\n\nJavaScript will throw during module parse, preventing ANY code from running.` +
        `\n\nThis is the EXACT bug that bricked 2.0.5.`
      );
    }
  }
});

test("CRITICAL: Boot smoke test - state initialization will not throw", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify state object initialization uses safe patterns
  const stateMatch = simpleSource.match(/const state = \{[\s\S]*?\n\};/);
  assert.ok(stateMatch, "simple.js must define state object");
  
  const stateInit = stateMatch[0];
  
  // Check that store initialization calls a function (loadStore)
  assert.match(
    stateInit,
    /store:\s*loadStore\(\)/,
    "state.store should call loadStore() function"
  );
  
  // Verify loadStore exists (function hoisting makes order irrelevant in JS)
  const loadStoreIndex = simpleSource.indexOf("function loadStore()");
  
  if (loadStoreIndex === -1) {
    assert.fail("loadStore function must exist for state initialization");
  }
});

test("CRITICAL: Boot smoke test - no data-destroying operations at module load", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Get everything before the first function definition (top-level code)
  const moduleTopLevel = simpleSource.split(/^(?:function |const \w+ = (?:function|async))/m)[0];
  
  // Dangerous patterns that could wipe localStorage at boot
  const dangerousPatterns = [
    { pattern: /localStorage\.clear\(\)/, desc: "localStorage.clear()" },
    { pattern: /localStorage\.removeItem\(['"]\w*payment\w*['"]\)/, desc: "localStorage.removeItem(payment-related)" },
    { pattern: /localStorage\.setItem\([^)]*\{\s*members:\s*\[\s*\]/, desc: "Setting empty members array" }
  ];
  
  for (const { pattern, desc } of dangerousPatterns) {
    if (pattern.test(moduleTopLevel)) {
      assert.fail(
        `DANGEROUS: Top-level code contains ${desc}\n` +
        `This will destroy user data when the module loads.\n` +
        `Data operations must only occur in response to explicit user actions.`
      );
    }
  }
});

test("Boot smoke test validates complete initialization flow", async () => {
  const simpleSource = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify the initialization sequence makes sense
  
  // 1. Imports come first
  const firstImport = simpleSource.indexOf("import");
  assert.ok(firstImport < 100, "Imports should be at the top of the file");
  
  // 2. Constants are defined
  assert.match(simpleSource, /const STORAGE_KEY = "master-lee-payment-tracker"/, 
    "Storage key must be defined");
  
  // 3. State is initialized
  assert.match(simpleSource, /const state = \{/, "State object must be defined");
  
  // 4. Element IDs are collected
  assert.match(simpleSource, /const ids = \[/, "IDs array must be defined");
  
  // 5. Elements are queried
  assert.match(simpleSource, /const el = Object\.fromEntries\(ids\.map/, 
    "Elements must be queried from IDs");
  
  // 6. Fail-soft event listeners are attached
  assert.match(simpleSource, /function attachListener\(element, elementId, eventType, handler\)/, 
    "Fail-soft attachListener helper must be defined");
  assert.match(simpleSource, /attachListener\(el\.\w+,/, 
    "Event listeners must be attached using fail-soft helper");
});
