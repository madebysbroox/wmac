import test from "node:test";
import assert from "node:assert/strict";
import { MEMBER_FIELD_ALIASES, PAYMENT_FIELD_ALIASES } from "../src/data.js";
import {
  FIELD_LABELS,
  ROSTER_TITLES,
  STATUS_LABELS,
  bi,
  buildReminderEmail,
  formatMonthBi,
  formatMonthEn,
  formatMonthKo
} from "../src/i18n.js";

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

test("builds an English-only reminder email with unpaid months and total", () => {
  const member = { name: "Sam Park", email: "sam@example.com", parentName: "" };
  const balance = { unpaidMonths: ["2026-05", "2026-06"], monthlyAmount: 120, totalDue: 240 };
  const { subject, body } = buildReminderEmail(member, balance);

  assert.match(subject, /Sam Park/);
  assert.match(subject, /Tuition Reminder/);
  assert.match(body, /Hello Sam Park,/);
  assert.match(body, /- May 2026: \$120\.00/);
  assert.match(body, /- June 2026: \$120\.00/);
  assert.match(body, /Total due: \$240\.00/);
  assert.ok(body.includes("\r\n"), "uses CRLF line breaks for mail programs");
  assert.ok(!/[ㄱ-힝]/.test(subject + body), "email contains no Korean text");
});

test("reminder email greets the parent or guardian when there is one", () => {
  const member = { name: "Emma Chen", email: "emma@example.com", parentName: "David Chen" };
  const balance = { unpaidMonths: ["2026-06"], monthlyAmount: 120, totalDue: 120 };
  const { body } = buildReminderEmail(member, balance);
  assert.match(body, /Hello David Chen,/);
  assert.match(body, /Unpaid months for Emma Chen:/);
});

test("formats months in both languages", () => {
  assert.equal(formatMonthKo("2026-06"), "2026년 6월");
  assert.equal(formatMonthEn("2026-06"), "June 2026");
  assert.equal(formatMonthBi("2026-06"), "2026년 6월 (June 2026)");
  assert.equal(formatMonthKo(""), "");
  assert.equal(bi(STATUS_LABELS.paid), "완납 · Paid up");
});
