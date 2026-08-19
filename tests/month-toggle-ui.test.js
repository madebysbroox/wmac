import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);

test("every element id the desk binds exists in the page", async () => {
  const [html, renderer] = await Promise.all([
    readFile(new URL("index.html", projectRoot), "utf8"),
    readFile(new URL("src/simple.js", projectRoot), "utf8")
  ]);
  const idsBlock = renderer.match(/const ids = \[([\s\S]*?)\];/)?.[1] || "";
  const ids = [...idsBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  assert.ok(ids.includes("syncSquareButton"), "Square sync button is still in the desk bindings");
  ids.forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}`);
  });
});

test("member calendar and payment landscape click a month to mark it paid or unpaid", async () => {
  const renderer = await readFile(new URL("src/simple.js", projectRoot), "utf8");

  assert.match(renderer, /toggleMemberMonthPayment/);
  assert.match(renderer, /data-calendar-month=/);
  assert.match(renderer, /data-toggle-month=/);
  assert.match(renderer, /data-toggle-member=/);
  assert.match(renderer, /toggleCalendarMonth\(button\.dataset\.calendarMonth\)/);
  assert.match(renderer, /toggleLandscapeMonth\(/);
});
