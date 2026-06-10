import test from "node:test";
import assert from "node:assert/strict";
import { MEMBER_FIELD_ALIASES, PAYMENT_FIELD_ALIASES } from "../src/data.js";
import { FIELD_LABELS, ROSTER_TITLES, STATUS_LABELS, bi, formatMonthBi, formatMonthEn, formatMonthKo } from "../src/i18n.js";

test("every status level has Korean and English labels", () => {
  ["paid", "watch", "late"].forEach((level) => {
    assert.ok(STATUS_LABELS[level]?.ko, `missing Korean label for ${level}`);
    assert.ok(STATUS_LABELS[level]?.en, `missing English label for ${level}`);
    assert.ok(ROSTER_TITLES[level]?.ko && ROSTER_TITLES[level]?.en);
  });
  assert.ok(ROSTER_TITLES.all?.ko && ROSTER_TITLES.all?.en);
});

test("every importable CSV field has a bilingual label", () => {
  const fields = new Set([...Object.keys(MEMBER_FIELD_ALIASES), ...Object.keys(PAYMENT_FIELD_ALIASES)]);
  fields.forEach((field) => {
    assert.ok(FIELD_LABELS[field]?.ko, `missing Korean label for field ${field}`);
    assert.ok(FIELD_LABELS[field]?.en, `missing English label for field ${field}`);
  });
});

test("formats months in both languages", () => {
  assert.equal(formatMonthKo("2026-06"), "2026년 6월");
  assert.equal(formatMonthEn("2026-06"), "June 2026");
  assert.equal(formatMonthBi("2026-06"), "2026년 6월 (June 2026)");
  assert.equal(formatMonthKo(""), "");
  assert.equal(bi(STATUS_LABELS.paid), "완납 · Paid up");
});
