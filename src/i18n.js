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
  allClear: "미납 없음 · All clear",
  mapMembersTitle: "회원 명단 항목 맞추기 · Match Member Columns",
  mapPaymentsTitle: "결제 내역 항목 맞추기 · Match Payment Columns",
  mapMembersHelp: "이름은 꼭 필요합니다. 나머지는 비워 두어도 됩니다. · Name is required. The other fields can be left blank.",
  mapPaymentsHelp: "회원 번호, 이메일, 전화번호, 이름으로 자동으로 맞춥니다. · The app will match payments by ID, email, phone, or name.",
  noPaymentsForYear: (year) => `${year}년 납부 기록이 없습니다. · No payments recorded for ${year}.`,
  noActiveMembers: "활동 회원이 없습니다. · There are no active members to export.",
  rosterSaved: (year, count) =>
    `${year}년 회원 명단을 저장했습니다 (회원 ${count}명). · Saved the ${year} member roster (${count} members).`,
  importedMembers: (count, skipped) =>
    `회원 ${count}명을 가져왔습니다 (${skipped}줄 건너뜀). · Imported ${count} members, ${skipped} rows skipped.`,
  importedPayments: (count, unmatched) =>
    `결제 ${count}건을 가져왔습니다 (${unmatched}건 확인 필요). · Imported ${count} payments, ${unmatched} rows need checking.`,
  paymentSavedFor: (name, month) => `${name} — ${month} 회비를 저장했습니다. · Payment saved.`
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

// "2026년 6월 (June 2026)"
export function formatMonthBi(month) {
  if (!month) {
    return "";
  }
  return `${formatMonthKo(month)} (${formatMonthEn(month)})`;
}

export const MASTER_LEE_PHONE = "(540) 347-7266";

// A polite reminder email in plain English, ready to drop into a mailto: link
// so the computer's own mail program (Outlook) opens it pre-filled.
// Takes the late-fee balance from getLateFeeBalance in data.js.
export function buildReminderEmail(member, balance) {
  const money = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const monthLines = balance.lines.map((line) =>
    line.lateFee > 0
      ? `- ${formatMonthEn(line.month)}: ${money(line.amount)} + ${money(line.lateFee)} late fee* = ${money(line.total)}`
      : `- ${formatMonthEn(line.month)}: ${money(line.amount)}`
  );

  const subject = `World Martial Arts Center Payment Reminder — ${member.name}`;
  const body = [
    `Hello ${member.parentName || member.name},`,
    "",
    "This is a friendly payment reminder from World Martial Arts Center.",
    "",
    `Unpaid months for ${member.name}:`,
    ...monthLines,
    "",
    `Total due: ${money(balance.totalDue)}`,
    ...(balance.feeDue > 0
      ? [
          "",
          `* A one-time late fee of 5% or $5 (whichever is greater) is added to each payment that is ${LATE_FEE_GRACE_DAYS} or more days past due.`
        ]
      : []),
    ...(balance.lines.length >= 2
      ? [
          "",
          "Please note: accounts that fall 3 or more months behind may be sent to a collection agency. We would much rather work something out together, so please reach out before it ever comes to that."
        ]
      : []),
    "",
    `The best next step is a quick phone call: please call Master Lee at ${MASTER_LEE_PHONE}. Keeping an open line of communication means we can always find a solution together.`,
    "",
    "Thank you!",
    "",
    "World Martial Arts Center"
  ].join("\r\n");

  return { subject, body };
}
