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

function feeBalance(lines) {
  const baseDue = lines.reduce((sum, line) => sum + line.amount, 0);
  const feeDue = lines.reduce((sum, line) => sum + line.lateFee, 0);
  return { lines: lines.map((line) => ({ ...line, total: line.amount + line.lateFee })), baseDue, feeDue, totalDue: baseDue + feeDue };
}

test("builds an English-only payment reminder with late fees and phone number", () => {
  const member = { name: "Sam Park", email: "sam@example.com", parentName: "" };
  const balance = feeBalance([
    { month: "2026-05", amount: 120, lateFee: 6 },
    { month: "2026-06", amount: 120, lateFee: 0 }
  ]);
  const { subject, body } = buildReminderEmail(member, balance);

  assert.match(subject, /Payment Reminder/);
  assert.ok(!subject.includes("Tuition") && !body.includes("tuition"), "says payment, not tuition");
  assert.match(body, /Hello Sam Park,/);
  assert.match(body, /- May 2026: \$120\.00 \+ \$6\.00 late fee\* = \$126\.00/);
  assert.match(body, /- June 2026: \$120\.00/);
  assert.match(body, /Total due: \$246\.00/);
  assert.match(body, /\* A one-time late fee of 5% or \$5 \(whichever is greater\) is added to each payment that is 10 or more days past due\./);
  assert.match(body, /call Master Lee at \(540\) 347-7266/);
  assert.ok(body.includes("\r\n"), "uses CRLF line breaks for mail programs");
  assert.ok(!/[ㄱ-힝]/.test(subject + body), "email contains no Korean text");
});

test("reminder email includes the collection note only when 2 or more months are behind", () => {
  const member = { name: "Emma Chen", email: "emma@example.com", parentName: "David Chen" };
  const twoBehind = feeBalance([
    { month: "2026-04", amount: 120, lateFee: 6 },
    { month: "2026-05", amount: 120, lateFee: 6 }
  ]);
  const { body } = buildReminderEmail(member, twoBehind);
  assert.match(body, /Hello David Chen,/);
  assert.match(body, /3 or more months behind may be sent to a collection agency/);
  assert.match(body, /rather work something out together/);

  const oneBehind = feeBalance([{ month: "2026-06", amount: 120, lateFee: 0 }]);
  const single = buildReminderEmail(member, oneBehind).body;
  assert.ok(!single.includes("collection agency"), "no collection note for a single month");
  assert.ok(!single.includes("late fee*"), "no fee footnote when no fees apply");
  assert.match(single, /call Master Lee at \(540\) 347-7266/);
});

test("formats months in both languages", () => {
  assert.equal(formatMonthKo("2026-06"), "2026년 6월");
  assert.equal(formatMonthEn("2026-06"), "June 2026");
  assert.equal(formatMonthBi("2026-06"), "2026년 6월 (June 2026)");
  assert.equal(formatMonthKo(""), "");
  assert.equal(bi(STATUS_LABELS.paid), "완납 · Paid up");
});
