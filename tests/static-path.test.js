import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveStaticFilePath } from "../src/static-path.js";

test("serves index for the root URL", () => {
  const root = resolve("wmac-main");

  assert.equal(resolveStaticFilePath(root, "/"), resolve(root, "index.html"));
});

test("normalizes URL paths before resolving files", () => {
  const root = resolve("wmac-main");

  assert.equal(resolveStaticFilePath(root, "/src/app.js"), resolve(root, "src", "app.js"));
  assert.equal(resolveStaticFilePath(root, "/%5Csrc%5Capp.js"), resolve(root, "src", "app.js"));
  assert.equal(resolveStaticFilePath(root, "/..%2F..%2Fserver.mjs"), resolve(root, "server.mjs"));
});
