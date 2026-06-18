// All user-facing words live here, in Korean first and English second,
// so the whole app stays bilingual and the wording is easy to adjust in one place.

import { LATE_FEE_GRACE_DAYS } from "./data.js";

export const STATUS_LABELS = {
  paid: { ko: "완납", en: "Paid up" },
  watch: { ko: "확인 필요", en: "Needs attention" },
  late: { ko: "미납", en: "Behind" }
};

export const ROSTER_TITLES = {
  all: { ko: "전체 회원", en: "All Members" },
  paid: { ko: "완납 회원", en: "Paid Up Members" },
  watch: { ko: "확인 필요 회원", en: "Needs Attention" },
  late: { ko: "미납 회원", en: "Behind on Payments" }
};

export const FIELD_LABELS = {
  name: { ko: "이름", en: "Member name" },
  startDate: { ko: "등록일", en: "Contract start date" },
  monthlyAmount: { ko: "월 회비", en: "Monthly amount" },
  email: { ko: "이메일", en: "Email" },
  phone: { ko: "전화번호", en: "Phone" },
  parentName: { ko: "부모/보호자", en: "Parent or guardian" },
  externalId: { ko: "회원 번호", en: "Member ID" },
  amount: { ko: "결제 금액", en: "Payment amount" },
  paidAt: { ko: "결제 날짜", en: "Payment date" },
  month: { ko: "납부 월", en: "Payment month" }
};

export const MSG = {
  savedOnComputer: "이 컴퓨터에 저장됨 · Saved on this computer",
  newMemberAdded: "새 회원이 추가되었습니다 · New member added",
  paymentSaved: "회비 저장됨 · Payment saved",
  memberSaved: "회원 정보 저장됨 · Member info saved",
  memberSavedToast: "회원 정보가 저장되었습니다. · Member information saved.",
  csvEmpty: "가져올 내용이 없는 파일입니다. · That CSV did not have any rows to import.",
  nothingToExport: "아직 저장할 자료가 없습니다. · There is no data to export yet.",
  noBalanceToInvoice: "이 회원은 미납 금액이 없습니다. · This member has no balance to invoice.",
  noEmailOnFile: "이메일 주소가 없습니다. 오른쪽 회원 정보에 이메일을 입력하세요. · No email address on file. Add one in Member Information first.",
  noBalanceToRemind: "이 회원은 미납 금액이 없어서 알림이 필요 없습니다. · This member has no unpaid balance to remind about.",
  popupBlocked: "팝업이 차단되었습니다. 팝업을 허용하고 다시 누르세요. · The browser blocked the invoice window. Allow pop-ups and try again.",
  noMatchingMembers: "찾는 회원이 없습니다. · No matching members.",
  noMembersInGroup: "이 그룹에는 회원이 없습니다. · This group is empty right now.",
  noPaymentsYet: "납부 기록이 없습니다 · No payments recorded yet",
  noUnpaidBalance: "미납 금액이 없습니다. · No unpaid balance for this member.",
  paymentRemoved: "납부 기록 삭제됨 · Payment marked unpaid",
  allClear: "미납 없음 · All clear",
  mapMembersTitle: "회원 명단 항목 맞추기 · Match Member Columns",
  mapPaymentsTitle: "결제 내역 항목 맞추기 · Match Payment Columns",
  mapMembersHelp: "이름은 꼭 필요합니다. 나머지는 비워 두어도 됩니다. · Name is required. The other fields can be left blank.",
  mapPaymentsHelp: "회원 번호, 이메일, 전화번호, 이름으로 자동으로 맞춥니다. · The app will match payments by ID, email, phone, or name.",
  membersImportSafe:
    "안심하세요 — 지워지는 것은 없습니다. 이미 있는 회원은 회원 번호, 이메일, 전화번호, 이름으로 자동으로 찾아서 빈칸만 채우고, 새 회원만 추가됩니다. 납부 기록은 그대로 유지됩니다. · Nothing will be erased. Members already in the app are matched by ID, email, phone, or name — new details fill in the blanks, new people are added, and payment history is never touched.",
  paymentsImportSafe:
    "안심하세요 — 이미 기록된 납부는 건너뜁니다. 같은 파일을 두 번 가져와도 중복되지 않습니다. · Nothing will be doubled. Payments already recorded are skipped, so importing the same file twice is safe.",
  noPaymentsForYear: (year) => `${year}년 납부 기록이 없습니다. · No payments recorded for ${year}.`,
  noActiveMembers: "활동 회원이 없습니다. · There are no active members to export.",
  rosterSaved: (year, count) =>
    `${year}년 회원 명단을 저장했습니다 (회원 ${count}명). · Saved the ${year} member roster (${count} members).`,
  importedMembers: (addedCount, updatedCount, skipped) =>
    `새 회원 ${addedCount}명 추가, 기존 회원 ${updatedCount}명 정보 채움 (${skipped}줄 건너뜀). 납부 기록은 그대로입니다. · Added ${addedCount} new members and filled in details for ${updatedCount} existing members (${skipped} rows skipped). Payment history untouched.`,
  importedPayments: (addedCount, duplicateCount, unmatched) =>
    `결제 ${addedCount}건 추가, 이미 기록된 ${duplicateCount}건 건너뜀 (${unmatched}건 확인 필요). · Added ${addedCount} payments, skipped ${duplicateCount} already recorded, ${unmatched} rows need checking.`,
  paymentSavedFor: (name, month) => `${name} — ${month} 회비를 저장했습니다. · Payment saved.`,
  paymentRemovedFor: (name, month) => `${name} — ${month} 납부 기록을 삭제했습니다. · Marked unpaid.`
};

// "완납 · Paid up" — for places that need plain text in both languages.
export function bi(pair) {
  return `${pair.ko} · ${pair.en}`;
}

// "2026년 6월"
export function formatMonthKo(month) {
  if (!month) {
    return "";
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

// "June 2026"
export function formatMonthEn(month) {
  if (!month) {
    return "";
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// 15 -> "15th", 1 -> "1st", 22 -> "22nd"
export function ordinalEn(day) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) {
    return `${day}th`;
  }
  return `${day}${{ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th"}`;
}

// "2026년 6월 (June 2026)"
export function formatMonthBi(month) {
  if (!month) {
    return "";
  }
  return `${formatMonthKo(month)} (${formatMonthEn(month)})`;
}

export const MASTER_LEE_PHONE = "(540) 347-7266";

export const DEFAULT_EMAIL_TEMPLATE = {
  subject: "World Martial Arts Center Payment Reminder — {{memberName}}",
  body: [
    "Hello {{recipientName}},",
    "",
    "This is a friendly payment reminder from World Martial Arts Center.",
    "",
    "Unpaid months for {{memberName}}:",
    "{{paymentLines}}",
    "",
    "Total due: {{totalDue}}",
    "{{lateFeeNote}}",
    "{{collectionNote}}",
    "",
    `The best next step is a quick phone call: please call Master Lee at ${MASTER_LEE_PHONE}. Keeping an open line of communication means we can always find a solution together.`,
    "",
    "Thank you!",
    "",
    "World Martial Arts Center"
  ].join("\r\n")
};

// A polite reminder email in plain English, ready to drop into a mailto: link
// so the computer's own mail program (Outlook) opens it pre-filled.
// Takes the late-fee balance from getLateFeeBalance in data.js.
export function buildReminderEmail(member, balance, template = DEFAULT_EMAIL_TEMPLATE) {
  const money = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const dueText = (isoDate) => {
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  };
  const monthLines = balance.lines.map((line) => {
    const label = `- ${formatMonthEn(line.month)} (due ${dueText(line.dueDate)})`;
    return line.lateFee > 0
      ? `${label}: ${money(line.amount)} + ${money(line.lateFee)} late fee* = ${money(line.total)}`
      : `${label}: ${money(line.amount)}`;
  });
  const lateFeeNote = balance.feeDue > 0
    ? `\r\n* Payments are due each month on the same day of the month as the signing date. A one-time late fee of 5% or $5 (whichever is greater) is added to each payment that is ${LATE_FEE_GRACE_DAYS} or more days past due.`
    : "";
  const collectionNote = balance.lines.length >= 2
    ? "\r\nPlease note: accounts that fall 3 or more months behind may be sent to a collection agency. We would much rather work something out together, so please reach out before it ever comes to that."
    : "";

  const values = {
    memberName: member.name,
    recipientName: member.parentName || member.name,
    paymentLines: monthLines.join("\r\n"),
    totalDue: money(balance.totalDue),
    lateFeeNote,
    collectionNote,
    phone: MASTER_LEE_PHONE
  };
  const subject = fillTemplate(template.subject || DEFAULT_EMAIL_TEMPLATE.subject, values);
  const body = fillTemplate(template.body || DEFAULT_EMAIL_TEMPLATE.body, values)
    .replace(/\n/g, "\r\n")
    .replace(/\r\r\n/g, "\r\n")
    .replace(/\r\n{3,}/g, "\r\n\r\n");

  return { subject, body };
}

function fillTemplate(template, values) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}
