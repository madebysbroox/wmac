import {
  MEMBER_FIELD_ALIASES,
  PAYMENT_FIELD_ALIASES,
  addPayment,
  createEmptyStore,
  exportRosterRows,
  exportStoreRows,
  getMemberBalance,
  getLateFeeBalance,
  getDashboardSummary,
  getMemberStatus,
  getYearRevenue,
  guessColumnMap,
  importMembersFromRecords,
  importPaymentsFromRecords,
  parseCsv,
  removePayment,
  searchMembers,
  toCsv,
  upsertMember
} from "./data.js";
import {
  DEFAULT_EMAIL_TEMPLATE,
  FIELD_LABELS,
  MSG,
  ROSTER_TITLES,
  STATUS_LABELS,
  buildReminderEmail,
  formatMonthBi,
  formatMonthEn,
  formatMonthKo,
  ordinalEn
} from "./i18n.js";

const STORAGE_KEY = "master-lee-payment-tracker";
const EMAIL_TEMPLATE_KEY = "master-lee-payment-tracker-email-template";

// ---------------------------------------------------------------------------
// State and element lookup
// ---------------------------------------------------------------------------

const state = {
  store: loadStore(),
  selectedId: "",
  page: "home",
  view: "dashboard",
  statusFilter: "all",
  mapping: null,
  review: null
};

const elements = {};
[
  "saveStatus", "dashboardButton", "homeTab", "membersTab", "appLayout", "memberSidebar",
  "memberCsv", "paymentCsv", "exportButton",
  "searchInput", "addMemberButton", "paidCount", "watchCount", "lateCount",
  "memberList", "dashboardView", "dashboardPaid", "dashboardWatch", "dashboardLate",
  "dashboardMonthLabel", "dashboardDelinquentCount", "dashboardPastDue", "dashboardTenDaysLate",
  "dashboardDelinquentCurrent", "dashboardActiveCount", "dashboardPaidMonth", "dashboardPaidYear",
  "dashboardExpectedMonth", "fieldSnapshot", "highestBalanceList", "rosterView",
  "backToDashboard", "rosterTitle", "rosterHelp", "rosterMembers", "emptyState",
  "memberDetail", "detailInitials", "detailName", "detailContact", "detailDueDay", "statusBadge", "latestPaid",
  "quickPayButton", "monthStrip", "invoiceSummary", "invoiceButton", "emailButton",
  "paymentForm", "paymentMonth", "paymentAmount", "memberForm", "memberName",
  "memberPhone", "memberEmail", "memberParent", "memberAmount", "memberStart",
  "memberInactive", "mappingDialog", "mappingForm", "mappingTitle",
  "mappingHelp", "mappingReassure", "mappingFields", "cancelMapping", "toast",
  "yearReportButton", "nextYearCsvButton", "yearDialog",
  "yearLastButton", "yearThisButton", "cancelYearDialog", "paymentReviewDialog",
  "reviewTitle", "reviewHelp", "reviewMonthList", "reviewTotal", "emailSubjectInput",
  "emailBodyInput", "emailPreview", "saveEmailTemplateButton", "resetEmailTemplateButton",
  "generateSelectedInvoiceButton", "openSelectedEmailButton", "cancelPaymentReview",
  "updatePanel", "updateStatus", "checkUpdateButton", "installUpdateButton"
].forEach((id) => {
  elements[id] = document.querySelector(`#${id}`);
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

elements.dashboardButton.addEventListener("click", showDashboard);
elements.homeTab.addEventListener("click", showDashboard);
elements.membersTab.addEventListener("click", showMembers);
elements.memberCsv.addEventListener("change", () => prepareCsvImport(elements.memberCsv.files[0], "members"));
elements.paymentCsv.addEventListener("change", () => prepareCsvImport(elements.paymentCsv.files[0], "payments"));
elements.exportButton.addEventListener("click", exportBackup);
elements.searchInput.addEventListener("input", render);
elements.addMemberButton.addEventListener("click", addNewMember);
elements.paidCount.addEventListener("click", () => showRoster("paid"));
elements.watchCount.addEventListener("click", () => showRoster("watch"));
elements.lateCount.addEventListener("click", () => showRoster("late"));
elements.dashboardPaid.addEventListener("click", () => showRoster("paid"));
elements.dashboardWatch.addEventListener("click", () => showRoster("watch"));
elements.dashboardLate.addEventListener("click", () => showRoster("late"));
elements.backToDashboard.addEventListener("click", showDashboard);
elements.quickPayButton.addEventListener("click", quickPayCurrentMonth);
elements.invoiceButton.addEventListener("click", () => openPaymentReview("invoice"));
elements.emailButton.addEventListener("click", () => openPaymentReview("email"));
elements.paymentForm.addEventListener("submit", savePayment);
elements.memberForm.addEventListener("submit", saveMember);
elements.cancelMapping.addEventListener("click", () => elements.mappingDialog.close("cancel"));
elements.mappingForm.addEventListener("submit", finishMappingImport);
elements.yearReportButton.addEventListener("click", openYearDialog);
elements.yearLastButton.addEventListener("click", () => runYearReport(new Date().getFullYear() - 1));
elements.yearThisButton.addEventListener("click", () => runYearReport(new Date().getFullYear()));
elements.cancelYearDialog.addEventListener("click", () => elements.yearDialog.close());
elements.nextYearCsvButton.addEventListener("click", exportNextYearRoster);
elements.reviewMonthList.addEventListener("change", updatePaymentReview);
elements.emailSubjectInput.addEventListener("input", updatePaymentReview);
elements.emailBodyInput.addEventListener("input", updatePaymentReview);
elements.saveEmailTemplateButton.addEventListener("click", saveEmailTemplateFromReview);
elements.resetEmailTemplateButton.addEventListener("click", resetEmailTemplateInReview);
elements.generateSelectedInvoiceButton.addEventListener("click", generateSelectedInvoice);
elements.openSelectedEmailButton.addEventListener("click", openSelectedEmail);
elements.cancelPaymentReview.addEventListener("click", () => elements.paymentReviewDialog.close());
elements.checkUpdateButton.addEventListener("click", checkForAppUpdate);
elements.installUpdateButton.addEventListener("click", installAppUpdate);

initAppUpdates();
render();

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function loadStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.members && stored?.payments) {
      return stored;
    }
  } catch {
    return createEmptyStore();
  }
  return createEmptyStore();
}

function saveStore(message = MSG.savedOnComputer) {
  state.store.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  elements.saveStatus.textContent = message;
}

// ---------------------------------------------------------------------------
// Desktop app updates
// ---------------------------------------------------------------------------

function initAppUpdates() {
  if (!window.paymentTrackerUpdates) {
    return;
  }

  elements.updatePanel.classList.remove("hidden");
  window.paymentTrackerUpdates.onStatus(renderUpdateStatus);
  window.paymentTrackerUpdates.getStatus().then(renderUpdateStatus).catch(() => {
    renderUpdateStatus({
      status: "error",
      message: "Could not read update status."
    });
  });
}

function checkForAppUpdate() {
  if (!window.paymentTrackerUpdates) {
    return;
  }

  elements.checkUpdateButton.disabled = true;
  renderUpdateStatus({
    status: "checking",
    message: "Checking GitHub for updates..."
  });
  window.paymentTrackerUpdates.check().catch((error) => {
    renderUpdateStatus({
      status: "error",
      message: `Update check failed: ${error.message}`
    });
  });
}

function installAppUpdate() {
  if (!window.paymentTrackerUpdates) {
    return;
  }

  elements.installUpdateButton.disabled = true;
  renderUpdateStatus({
    status: "installing",
    message: "Restarting to install the update..."
  });
  window.paymentTrackerUpdates.install();
}

function renderUpdateStatus(updateStatus) {
  if (!updateStatus) {
    return;
  }

  const message = updateStatus.message || "Ready to check for updates.";
  elements.updateStatus.textContent = message;
  elements.checkUpdateButton.disabled = ["checking", "available", "downloading", "installing"].includes(updateStatus.status);
  elements.installUpdateButton.classList.toggle("hidden", updateStatus.status !== "ready");
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  renderPageShell();
  renderSummary();
  renderDashboard();
  renderRoster();
  renderMemberList();
  renderDetail();
}

function renderPageShell() {
  const isHome = state.page === "home";
  elements.appLayout.classList.toggle("home-layout", isHome);
  elements.appLayout.classList.toggle("members-layout", !isHome);
  elements.memberSidebar.classList.toggle("hidden", isHome);
  elements.homeTab.classList.toggle("active", isHome);
  elements.membersTab.classList.toggle("active", !isHome);
  elements.homeTab.setAttribute("aria-current", isHome ? "page" : "false");
  elements.membersTab.setAttribute("aria-current", isHome ? "false" : "page");
}

function renderSummary() {
  const counts = statusCounts();
  elements.paidCount.innerHTML = `완납 ${counts.paid}명 <small lang="en">paid</small>`;
  elements.watchCount.innerHTML = `확인 필요 ${counts.watch}명 <small lang="en">attention</small>`;
  elements.lateCount.innerHTML = `미납 ${counts.late}명 <small lang="en">behind</small>`;
}

function renderDashboard() {
  elements.dashboardView.classList.toggle("hidden", state.view !== "dashboard");
  if (state.view !== "dashboard") {
    return;
  }

  const rows = memberRows();
  const counts = statusCounts(rows);
  const summary = getDashboardSummary(state.store);
  const activeTotal = summary.activeMembers;
  const currentRate = activeTotal ? Math.round((counts.paid / activeTotal) * 100) : 0;

  elements.dashboardPaid.querySelector("strong").textContent = counts.paid;
  elements.dashboardWatch.querySelector("strong").textContent = counts.watch;
  elements.dashboardLate.querySelector("strong").textContent = counts.late;
  elements.dashboardMonthLabel.textContent = `${formatMonthBi(summary.currentMonth)} · ${activeTotal} active member${activeTotal === 1 ? "" : "s"}`;
  setAnimatedText(elements.dashboardDelinquentCount, `${summary.delinquentMembers}명`);
  setAnimatedText(elements.dashboardPastDue, formatMoney(summary.pastDue));
  setAnimatedText(elements.dashboardTenDaysLate, formatMoney(summary.tenDaysLate));
  setAnimatedText(elements.dashboardDelinquentCurrent, formatMoney(summary.delinquentCurrentMonthRisk));
  setAnimatedText(elements.dashboardActiveCount, `${activeTotal}명`);
  setAnimatedText(elements.dashboardPaidMonth, formatMoney(summary.paidThisMonth));
  setAnimatedText(elements.dashboardPaidYear, formatMoney(summary.paidThisYear));
  setAnimatedText(elements.dashboardExpectedMonth, formatMoney(summary.expectedCurrentMonthFromUpToDate));

  elements.fieldSnapshot.innerHTML = `
    <div><span>활동 회원 <small lang="en">Active members</small></span><strong>${activeTotal}</strong></div>
    <div><span>이번 달 완납 <small lang="en">Paid this month</small></span><strong>${currentRate}%</strong></div>
    <div><span>이번 달 아직 예상 <small lang="en">Expected from up-to-date</small></span><strong>${formatMoney(summary.expectedCurrentMonthFromUpToDate)}</strong></div>
    <div><span>쉬는 회원 <small lang="en">Inactive members</small></span><strong>${summary.inactiveMembers}</strong></div>
  `;

  const highest = rows
    .filter((row) => row.balance.totalDue > 0)
    .sort((a, b) => b.balance.totalDue - a.balance.totalDue || a.member.name.localeCompare(b.member.name))
    .slice(0, 6);

  elements.highestBalanceList.innerHTML = highest.length
    ? highest.map((row) => rosterSummaryMarkup(row)).join("")
    : `<div><span>${MSG.allClear}</span><strong>✓</strong></div>`;

  elements.highestBalanceList.querySelectorAll("[data-member-id]").forEach((button) => {
    button.addEventListener("click", () => selectMember(button.dataset.memberId));
  });
}

function renderRoster() {
  elements.rosterView.classList.toggle("hidden", state.view !== "roster");
  if (state.view !== "roster") {
    return;
  }

  const title = ROSTER_TITLES[state.statusFilter] || ROSTER_TITLES.all;
  const rows = memberRows().filter((row) => state.statusFilter === "all" || row.status.level === state.statusFilter);
  elements.rosterTitle.innerHTML = `${title.ko} <small lang="en">${title.en}</small>`;
  elements.rosterHelp.textContent = `${rows.length}명 · ${rows.length} member${rows.length === 1 ? "" : "s"}`;
  elements.rosterMembers.innerHTML = rows.length
    ? rows.map((row) => rosterMemberMarkup(row)).join("")
    : `<div class="empty-state compact"><p>${MSG.noMembersInGroup}</p></div>`;

  elements.rosterMembers.querySelectorAll("[data-member-id]").forEach((button) => {
    button.addEventListener("click", () => selectMember(button.dataset.memberId));
  });
}

function renderMemberList() {
  const members = searchMembers(state.store.members, elements.searchInput.value);
  elements.memberList.innerHTML = "";

  if (members.length === 0) {
    elements.memberList.innerHTML = `<div class="empty-state"><p>${MSG.noMatchingMembers}</p></div>`;
    return;
  }

  members.forEach((member) => {
    const status = getMemberStatus(member, state.store.payments);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `member-item ${member.id === state.selectedId ? "active" : ""}`;
    button.innerHTML = `
      <strong><span class="dot ${status.level}"></span>${escapeHtml(member.name)}</strong>
      <span>${STATUS_LABELS[status.level].ko}${status.lastPaidMonth ? ` · ${formatMonthKo(status.lastPaidMonth)}` : ""}</span>
    `;
    button.addEventListener("click", () => selectMember(member.id));
    elements.memberList.append(button);
  });
}

function renderDetail() {
  const member = selectedMember();
  elements.emptyState.classList.toggle("hidden", state.view !== "member" || Boolean(member));
  elements.memberDetail.classList.toggle("hidden", state.view !== "member" || !member);
  if (state.view !== "member" || !member) {
    return;
  }

  const status = getMemberStatus(member, state.store.payments);
  const balance = getMemberBalance(member, state.store.payments);
  elements.detailInitials.textContent = initialsFor(member.name);
  elements.detailName.textContent = member.name;
  elements.detailContact.textContent = [formatPhone(member.phone), member.email, member.parentName && `보호자 ${member.parentName}`]
    .filter(Boolean)
    .join("  ");
  const dueDay = Number(member.startDate?.split("-")[2]) || 1;
  elements.detailDueDay.textContent = `납부일: 매월 ${dueDay}일 · Payment due the ${ordinalEn(dueDay)} of each month`;
  elements.statusBadge.innerHTML = `${STATUS_LABELS[status.level].ko}<small lang="en">${STATUS_LABELS[status.level].en}</small>`;
  elements.statusBadge.className = `status-badge status-${status.level}`;
  elements.latestPaid.textContent = status.lastPaidMonth
    ? `마지막 납부: ${formatMonthBi(status.lastPaidMonth)}`
    : MSG.noPaymentsYet;
  elements.latestPaid.className = `latest-paid ${status.lastPaidMonth ? "has-payment" : "no-payment"}`;

  renderQuickPay(member, status);

  elements.monthStrip.innerHTML = "";
  status.recentMonths.forEach((month) => {
    const item = document.createElement("div");
    item.className = `month-box ${month.paid ? "paid" : "unpaid"}`;
    item.innerHTML = `
      <strong>${formatMonthKo(month.month)}</strong>
      <small lang="en">${formatMonthEn(month.month)}</small>
      <span>${month.paid ? "납부함 · Paid" : "미납 · Not paid"}</span>
      ${month.paid ? `<button class="text-button mark-unpaid-button" type="button" data-month="${month.month}">미납으로 변경 · Mark unpaid</button>` : ""}
    `;
    elements.monthStrip.append(item);
  });
  elements.monthStrip.querySelectorAll("[data-month]").forEach((button) => {
    button.addEventListener("click", () => markMonthUnpaid(button.dataset.month));
  });

  elements.invoiceSummary.textContent = balance.unpaidMonths.length
    ? `미납 ${balance.unpaidMonths.length}개월 · ${formatMoney(balance.totalDue)} (${balance.unpaidMonths.length} unpaid month${balance.unpaidMonths.length === 1 ? "" : "s"})`
    : MSG.noUnpaidBalance;
  elements.invoiceButton.disabled = balance.totalDue <= 0;
  renderEmailButton(member, balance);

  elements.paymentMonth.value = status.currentMonth;
  elements.paymentAmount.value = Number(member.monthlyAmount || 0).toFixed(2);
  elements.memberName.value = member.name;
  elements.memberPhone.value = formatPhone(member.phone);
  elements.memberEmail.value = member.email || "";
  elements.memberParent.value = member.parentName || "";
  elements.memberAmount.value = member.monthlyAmount || "";
  elements.memberStart.value = member.startDate || "";
  elements.memberInactive.checked = Boolean(member.inactive);
}

// The reminder button opens a review step first, so Master Lee can choose the
// months and adjust the message before the computer's mail program opens.
function renderEmailButton(member, balance) {
  const ready = balance.totalDue > 0;
  elements.emailButton.classList.toggle("disabled", !ready);
  elements.emailButton.setAttribute("aria-disabled", String(!ready));
}

function renderQuickPay(member, status) {
  const button = elements.quickPayButton;
  const amount = Number(member.monthlyAmount || 0);
  const paidThisMonth = status.paidMonths.has(status.currentMonth);

  button.classList.toggle("done", paidThisMonth);
  button.classList.toggle("undo", paidThisMonth);
  if (paidThisMonth) {
    button.disabled = false;
    button.innerHTML = `<span lang="ko">이번 달 미납으로 변경</span><small lang="en">Mark this month unpaid</small>`;
  } else if (amount <= 0) {
    button.disabled = true;
    button.innerHTML = `<span lang="ko">월 회비를 먼저 입력하세요 →</span><small lang="en">Set the monthly amount first (right side)</small>`;
  } else {
    button.disabled = false;
    button.innerHTML = `
      <span lang="ko">이번 달 납부 완료 — ${formatMoney(amount)}</span>
      <small lang="en">Mark ${formatMonthEn(status.currentMonth)} Paid</small>
    `;
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function showDashboard() {
  state.page = "home";
  state.view = "dashboard";
  state.statusFilter = "all";
  render();
}

function showMembers() {
  state.page = "members";
  if (state.view === "dashboard") {
    state.view = state.selectedId ? "member" : "roster";
  }
  render();
  elements.searchInput.focus();
}

function showRoster(statusFilter) {
  state.page = "members";
  state.view = "roster";
  state.statusFilter = statusFilter;
  render();
}

function selectMember(memberId) {
  state.selectedId = memberId;
  state.page = "members";
  state.view = "member";
  render();
}

function initialsFor(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "ML";
}

// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------

function memberRows() {
  return state.store.members
    .filter((member) => !member.inactive)
    .map((member) => ({
      member,
      status: getMemberStatus(member, state.store.payments),
      balance: getMemberBalance(member, state.store.payments)
    }))
    .sort((a, b) => a.member.name.localeCompare(b.member.name));
}

function statusCounts(rows = memberRows()) {
  return rows.reduce(
    (counts, row) => {
      counts[row.status.level] += 1;
      return counts;
    },
    { paid: 0, watch: 0, late: 0 }
  );
}

function rosterSummaryMarkup(row) {
  return `
    <button class="snapshot-member" type="button" data-member-id="${escapeHtml(row.member.id)}">
      <span>${escapeHtml(row.member.name)}</span>
      <strong>${formatMoney(row.balance.totalDue)}</strong>
    </button>
  `;
}

function rosterMemberMarkup(row) {
  const lastPaid = row.status.lastPaidMonth
    ? `마지막 납부 ${formatMonthKo(row.status.lastPaidMonth)}`
    : "납부 기록 없음";
  const dueText = row.balance.totalDue > 0
    ? `${formatMoney(row.balance.totalDue)} · 미납 ${row.balance.unpaidMonths.length}개월`
    : "미납 없음";
  return `
    <button class="roster-member" type="button" data-member-id="${escapeHtml(row.member.id)}">
      <span class="status-badge status-${row.status.level}">${STATUS_LABELS[row.status.level].ko}<small lang="en">${STATUS_LABELS[row.status.level].en}</small></span>
      <strong>${escapeHtml(row.member.name)}</strong>
      <span>${escapeHtml(lastPaid)}</span>
      <span>${escapeHtml(dueText)}</span>
    </button>
  `;
}

// ---------------------------------------------------------------------------
// CSV import and export
// ---------------------------------------------------------------------------

async function prepareCsvImport(file, kind) {
  if (!file) {
    return;
  }
  const parsed = parseCsv(await file.text());
  if (parsed.records.length === 0) {
    showToast(MSG.csvEmpty);
    return;
  }

  const aliases = kind === "members" ? MEMBER_FIELD_ALIASES : PAYMENT_FIELD_ALIASES;
  const guessed = guessColumnMap(parsed.headers, aliases);
  state.mapping = { kind, parsed, aliases, map: guessed };
  elements.mappingTitle.textContent = kind === "members" ? MSG.mapMembersTitle : MSG.mapPaymentsTitle;
  elements.mappingReassure.textContent = kind === "members" ? MSG.membersImportSafe : MSG.paymentsImportSafe;
  elements.mappingHelp.textContent = kind === "members" ? MSG.mapMembersHelp : MSG.mapPaymentsHelp;
  renderMappingFields();
  elements.mappingDialog.showModal();
}

function renderMappingFields() {
  const required = state.mapping.kind === "members" ? ["name"] : ["amount"];

  elements.mappingFields.innerHTML = "";
  Object.keys(state.mapping.aliases).forEach((field) => {
    const label = FIELD_LABELS[field];
    const wrapper = document.createElement("div");
    wrapper.className = "form-row";
    const select = document.createElement("select");
    select.name = field;
    select.required = required.includes(field);
    select.innerHTML = `<option value="">이 파일에 없음 · Not in this CSV</option>${state.mapping.parsed.headers
      .map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`)
      .join("")}`;
    select.value = state.mapping.map[field] || "";
    wrapper.innerHTML = `<label>${label.ko} <small lang="en">${label.en}</small>${required.includes(field) ? " (필수 · needed)" : ""}</label>`;
    wrapper.append(select);
    elements.mappingFields.append(wrapper);
  });
}

function finishMappingImport(event) {
  event.preventDefault();
  const formData = new FormData(elements.mappingForm);
  const columnMap = Object.fromEntries(formData.entries());

  if (state.mapping.kind === "members") {
    const result = importMembersFromRecords(state.mapping.parsed.records, columnMap, state.store);
    state.store = result.store;
    state.selectedId = result.imported[0]?.id || state.selectedId;
    const message = MSG.importedMembers(result.added.length, result.updated.length, result.skipped.length);
    saveStore(message);
    showToast(message);
  } else {
    const result = importPaymentsFromRecords(state.mapping.parsed.records, columnMap, state.store);
    state.store = result.store;
    const message = MSG.importedPayments(result.matches.length, result.duplicates.length, result.unmatched.length);
    saveStore(message);
    showToast(message);
  }

  state.mapping = null;
  elements.mappingDialog.close();
  elements.memberCsv.value = "";
  elements.paymentCsv.value = "";
  render();
}

function exportBackup() {
  const csv = toCsv(exportStoreRows(state.store));
  if (!csv) {
    showToast(MSG.nothingToExport);
    return;
  }
  downloadCsv(csv, `master-lee-payment-backup-${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportNextYearRoster() {
  const rows = exportRosterRows(state.store);
  if (rows.length === 0) {
    showToast(MSG.noActiveMembers);
    return;
  }
  const nextYear = new Date().getFullYear() + 1;
  downloadCsv(toCsv(rows), `wmac-members-${nextYear}.csv`);
  showToast(MSG.rosterSaved(nextYear, rows.length));
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Member and payment actions
// ---------------------------------------------------------------------------

function addNewMember() {
  const member = {
    id: makeId("mem"),
    name: "New Member",
    startDate: new Date().toISOString().slice(0, 10),
    monthlyAmount: 0,
    email: "",
    phone: "",
    parentName: "",
    externalId: "",
    inactive: false
  };
  state.store = upsertMember(state.store, member);
  saveStore(MSG.newMemberAdded);
  selectMember(member.id);
  elements.memberName.focus();
  elements.memberName.select();
}

function quickPayCurrentMonth() {
  const member = selectedMember();
  if (!member) {
    return;
  }
  const status = getMemberStatus(member, state.store.payments);
  const amount = Number(member.monthlyAmount || 0);
  if (status.paidMonths.has(status.currentMonth)) {
    markMonthUnpaid(status.currentMonth);
    return;
  }
  if (amount <= 0) {
    return;
  }
  state.store = addPayment(state.store, {
    memberId: member.id,
    month: status.currentMonth,
    amount
  });
  saveStore(MSG.paymentSaved);
  showToast(MSG.paymentSavedFor(member.name, formatMonthBi(status.currentMonth)));
  render();
}

function savePayment(event) {
  event.preventDefault();
  const member = selectedMember();
  if (!member) {
    return;
  }
  state.store = addPayment(state.store, {
    memberId: member.id,
    month: elements.paymentMonth.value,
    amount: elements.paymentAmount.value
  });
  saveStore(MSG.paymentSaved);
  showToast(MSG.paymentSavedFor(member.name, formatMonthBi(elements.paymentMonth.value)));
  render();
}

function markMonthUnpaid(month) {
  const member = selectedMember();
  if (!member || !month) {
    return;
  }

  state.store = removePayment(state.store, member.id, month);
  saveStore(MSG.paymentRemoved);
  showToast(MSG.paymentRemovedFor(member.name, formatMonthBi(month)));
  render();
}

function saveMember(event) {
  event.preventDefault();
  const member = selectedMember();
  if (!member) {
    return;
  }
  state.store = upsertMember(state.store, {
    ...member,
    name: elements.memberName.value,
    phone: elements.memberPhone.value,
    email: elements.memberEmail.value,
    parentName: elements.memberParent.value,
    monthlyAmount: elements.memberAmount.value,
    startDate: elements.memberStart.value,
    inactive: elements.memberInactive.checked
  });
  saveStore(MSG.memberSaved);
  showToast(MSG.memberSavedToast);
  render();
}

// ---------------------------------------------------------------------------
// Year-end report
// ---------------------------------------------------------------------------

function openYearDialog() {
  const thisYear = new Date().getFullYear();
  elements.yearLastButton.innerHTML = `<span lang="ko">${thisYear - 1}년 보고서</span><small lang="en">${thisYear - 1} Report (last year)</small>`;
  elements.yearThisButton.innerHTML = `<span lang="ko">${thisYear}년 보고서</span><small lang="en">${thisYear} Report (this year)</small>`;
  elements.yearDialog.showModal();
}

function runYearReport(year) {
  elements.yearDialog.close();
  const report = getYearRevenue(state.store, year);
  if (report.paymentCount === 0) {
    showToast(MSG.noPaymentsForYear(year));
    return;
  }

  const monthRows = report.monthly
    .map((row) => {
      const monthNumber = Number(row.month.split("-")[1]);
      const englishMonth = new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long" });
      return `
        <tr>
          <td>${monthNumber}월 <span class="en">${englishMonth}</span></td>
          <td class="num">${row.count}</td>
          <td class="money">${formatMoney(row.total)}</td>
        </tr>
      `;
    })
    .join("");

  const memberRows = report.byMember
    .map((entry) => `
      <tr>
        <td>${escapeHtml(entry.name)}</td>
        <td class="num">${entry.count}</td>
        <td class="money">${formatMoney(entry.total)}</td>
      </tr>
    `)
    .join("");

  const reportHtml = `<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <title>${year}년 연말 보고서 · Year-End Report</title>
        <style>
          body { margin: 0; background: #eef1f4; color: #1f2933; font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", Arial, sans-serif; }
          .page { width: min(820px, calc(100vw - 32px)); margin: 24px auto; padding: 46px; background: #fff; box-shadow: 0 18px 42px rgba(31, 41, 51, .14); }
          header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-start; border-bottom: 3px solid #22577a; padding-bottom: 24px; }
          img { width: 92px; height: 92px; object-fit: contain; }
          h1 { margin: 0 0 8px; font-size: 34px; }
          h2 { margin: 32px 0 8px; font-size: 22px; }
          p { margin: 0; color: #637083; }
          .meta { text-align: right; color: #637083; line-height: 1.45; }
          .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 26px; }
          .totals div { padding: 18px; border: 1px solid #d9ded6; border-radius: 8px; background: #f7f4ef; }
          .totals span { display: block; color: #637083; font-size: 15px; }
          .totals strong { font-size: 32px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th, td { padding: 12px 10px; border-bottom: 1px solid #d9ded6; text-align: left; }
          th { color: #637083; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
          td .en { color: #637083; font-size: 14px; }
          .num, .money { text-align: right; }
          tfoot td { border-top: 3px solid #22577a; border-bottom: 0; font-weight: 800; font-size: 20px; }
          .note { margin-top: 34px; padding: 18px; background: #f7f4ef; color: #1f2933; }
          .actions { width: min(820px, calc(100vw - 32px)); margin: 0 auto 24px; text-align: right; }
          button { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 8px; background: #22577a; color: white; font-weight: 700; cursor: pointer; }
          @media print {
            body { background: #fff; }
            .page { width: auto; margin: 0; box-shadow: none; }
            .actions { display: none; }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <header>
            <div>
              <h1>World Martial Arts Center</h1>
              <p>${year}년 연말 결산 보고서 · ${year} Year-End Revenue Report</p>
            </div>
            <div class="meta">
              <img src="${new URL("assets/wmac-logo.jpeg", import.meta.url).href}" alt="World Martial Arts Center logo">
              <div>작성일 Generated: ${new Date().toLocaleDateString()}</div>
            </div>
          </header>

          <div class="totals">
            <div><span>총 수입 · Total Revenue</span><strong>${formatMoney(report.totalRevenue)}</strong></div>
            <div><span>납부 건수 · Payments Received</span><strong>${report.paymentCount}</strong></div>
          </div>

          <h2>월별 수입 · Revenue by Month</h2>
          <table>
            <thead>
              <tr><th>월 Month</th><th class="num">건수 Payments</th><th class="money">금액 Amount</th></tr>
            </thead>
            <tbody>${monthRows}</tbody>
            <tfoot>
              <tr><td>합계 Total</td><td class="num">${report.paymentCount}</td><td class="money">${formatMoney(report.totalRevenue)}</td></tr>
            </tfoot>
          </table>

          <h2>회원별 수입 · Revenue by Member</h2>
          <table>
            <thead>
              <tr><th>회원 Member</th><th class="num">건수 Payments</th><th class="money">금액 Amount</th></tr>
            </thead>
            <tbody>${memberRows}</tbody>
          </table>

          <div class="note">납부 월 기준으로 계산했습니다. 세무 자료로 보관하세요.<br>Totals are grouped by the month each payment was for. Keep this report for tax records.</div>
        </main>
        <div class="actions"><button type="button" onclick="window.print()">인쇄 · Print or Save PDF</button></div>
      </body>
    </html>`;

  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    showToast(MSG.popupBlocked);
    return;
  }
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

function openPaymentReview(mode) {
  const member = selectedMember();
  if (!member) {
    return;
  }

  const balance = getLateFeeBalance(member, state.store.payments);
  if (balance.lines.length === 0 || balance.totalDue <= 0) {
    showToast(mode === "email" ? MSG.noBalanceToRemind : MSG.noBalanceToInvoice);
    return;
  }

  state.review = {
    mode,
    memberId: member.id,
    balance,
    selectedMonths: new Set(balance.lines.map((line) => line.month))
  };
  const title = mode === "email"
    ? "알림 이메일 확인 · Review Reminder Email"
    : "청구서 확인 · Review Invoice";
  elements.reviewTitle.textContent = title;
  elements.reviewHelp.textContent =
    "청구서나 이메일에 넣을 미납 월을 선택하세요. 이메일 문구는 아래에서 바로 수정할 수 있습니다.";
  elements.reviewMonthList.innerHTML = balance.lines.map((line) => monthChoiceMarkup(line)).join("");
  const template = loadEmailTemplate();
  elements.emailSubjectInput.value = template.subject;
  elements.emailBodyInput.value = template.body.replace(/\r\n/g, "\n");
  updatePaymentReview();
  elements.paymentReviewDialog.showModal();
}

function updatePaymentReview() {
  if (!state.review) {
    return;
  }
  const member = state.store.members.find((item) => item.id === state.review.memberId);
  if (!member) {
    return;
  }

  state.review.selectedMonths = new Set(
    Array.from(elements.reviewMonthList.querySelectorAll("input[type='checkbox']:checked")).map((input) => input.value)
  );
  const selectedBalance = selectedReviewBalance();
  const selectedCount = selectedBalance.lines.length;
  elements.reviewTotal.textContent = selectedCount
    ? `${selectedCount}개월 선택 · ${formatMoney(selectedBalance.totalDue)} selected`
    : "선택된 월이 없습니다 · No months selected";
  elements.generateSelectedInvoiceButton.disabled = selectedCount === 0;
  elements.openSelectedEmailButton.disabled = selectedCount === 0 || !member.email;

  const template = {
    subject: elements.emailSubjectInput.value,
    body: elements.emailBodyInput.value
  };
  const { subject, body } = buildReminderEmail(member, selectedBalance, template);
  elements.emailPreview.textContent = `Subject: ${subject}\n\n${body.replace(/\r\n/g, "\n")}`;
}

function selectedReviewBalance() {
  const selected = state.review?.selectedMonths || new Set();
  const lines = (state.review?.balance.lines || []).filter((line) => selected.has(line.month));
  const baseDue = lines.reduce((sum, line) => sum + line.amount, 0);
  const feeDue = lines.reduce((sum, line) => sum + line.lateFee, 0);
  return {
    monthlyAmount: state.review?.balance.monthlyAmount || 0,
    lines,
    baseDue,
    feeDue,
    totalDue: baseDue + feeDue
  };
}

function saveEmailTemplateFromReview() {
  const template = {
    subject: elements.emailSubjectInput.value,
    body: elements.emailBodyInput.value.replace(/\n/g, "\r\n")
  };
  localStorage.setItem(EMAIL_TEMPLATE_KEY, JSON.stringify(template));
  showToast("이메일 문구가 저장되었습니다. · Email wording saved.");
  updatePaymentReview();
}

function resetEmailTemplateInReview() {
  localStorage.removeItem(EMAIL_TEMPLATE_KEY);
  elements.emailSubjectInput.value = DEFAULT_EMAIL_TEMPLATE.subject;
  elements.emailBodyInput.value = DEFAULT_EMAIL_TEMPLATE.body.replace(/\r\n/g, "\n");
  showToast("기본 이메일 문구로 되돌렸습니다. · Restored the default email wording.");
  updatePaymentReview();
}

function generateSelectedInvoice() {
  const member = selectedMember();
  if (!member || !state.review) {
    return;
  }
  const balance = selectedReviewBalance();
  if (balance.lines.length === 0) {
    showToast("미납 월을 하나 이상 선택하세요. · Select at least one unpaid month.");
    return;
  }
  elements.paymentReviewDialog.close();
  generateInvoice(member, balance);
}

function openSelectedEmail() {
  const member = selectedMember();
  if (!member || !state.review) {
    return;
  }
  if (!member.email) {
    showToast(MSG.noEmailOnFile);
    return;
  }
  const balance = selectedReviewBalance();
  if (balance.lines.length === 0) {
    showToast("미납 월을 하나 이상 선택하세요. · Select at least one unpaid month.");
    return;
  }
  const template = {
    subject: elements.emailSubjectInput.value,
    body: elements.emailBodyInput.value
  };
  const { subject, body } = buildReminderEmail(member, balance, template);
  window.location.href = `mailto:${member.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function loadEmailTemplate() {
  try {
    const saved = JSON.parse(localStorage.getItem(EMAIL_TEMPLATE_KEY));
    if (saved?.subject && saved?.body) {
      return saved;
    }
  } catch {
    return DEFAULT_EMAIL_TEMPLATE;
  }
  return DEFAULT_EMAIL_TEMPLATE;
}

function monthChoiceMarkup(line) {
  const fee = line.lateFee > 0 ? ` + ${formatMoney(line.lateFee)} late fee` : "";
  return `
    <label class="month-choice">
      <input type="checkbox" value="${escapeHtml(line.month)}" checked>
      <span>
        <strong>${formatMonthBi(line.month)}</strong>
        <small>${formatMoney(line.amount)}${fee} = ${formatMoney(line.total)}</small>
      </span>
    </label>
  `;
}

function generateInvoice(member, balance) {
  const invoiceDate = new Date();
  const rows = balance.lines
    .map((line) => `
      <tr>
        <td>${formatMonthBi(line.month)}</td>
        <td>월 회비 · Monthly training tuition</td>
        <td class="money">${formatMoney(line.amount)}</td>
        <td class="money">${line.lateFee > 0 ? formatMoney(line.lateFee) : "-"}</td>
        <td class="money">${formatMoney(line.total)}</td>
      </tr>
    `)
    .join("");
  const contactLines = [member.parentName && `보호자 Parent/guardian: ${member.parentName}`, formatPhone(member.phone), member.email]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  const invoiceHtml = `<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8">
        <title>청구서 Invoice - ${escapeHtml(member.name)}</title>
        <style>
          body { margin: 0; background: #eef1f4; color: #1f2933; font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", Arial, sans-serif; }
          .page { width: min(820px, calc(100vw - 32px)); margin: 24px auto; padding: 46px; background: #fff; box-shadow: 0 18px 42px rgba(31, 41, 51, .14); }
          header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-start; border-bottom: 3px solid #22577a; padding-bottom: 24px; }
          img { width: 92px; height: 92px; object-fit: contain; }
          h1 { margin: 0 0 8px; font-size: 34px; }
          h2 { margin: 28px 0 8px; font-size: 20px; }
          p { margin: 0; color: #637083; }
          .meta { text-align: right; color: #637083; line-height: 1.45; }
          .billto { line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 22px; }
          th, td { padding: 14px 10px; border-bottom: 1px solid #d9ded6; text-align: left; }
          th { color: #637083; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
          .money { text-align: right; }
          .total { display: flex; justify-content: flex-end; margin-top: 24px; font-size: 24px; font-weight: 800; }
          .note { margin-top: 34px; padding: 18px; background: #f7f4ef; color: #1f2933; }
          .actions { width: min(820px, calc(100vw - 32px)); margin: 0 auto 24px; text-align: right; }
          button { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 8px; background: #22577a; color: white; font-weight: 700; cursor: pointer; }
          @media print {
            body { background: #fff; }
            .page { width: auto; margin: 0; box-shadow: none; }
            .actions { display: none; }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <header>
            <div>
              <h1>World Martial Arts Center</h1>
              <p>회비 청구서 · Member tuition invoice</p>
            </div>
            <div class="meta">
              <img src="${new URL("assets/wmac-logo.jpeg", import.meta.url).href}" alt="World Martial Arts Center logo">
              <div>청구 날짜 Invoice date: ${invoiceDate.toLocaleDateString()}</div>
            </div>
          </header>

          <section class="billto">
            <h2>받는 분 · Bill To</h2>
            <strong>${escapeHtml(member.name)}</strong>
            ${contactLines}
          </section>

          <section>
            <h2>청구 내역 · Amount Due</h2>
            <table>
              <thead>
                <tr><th>월 Month</th><th>내용 Description</th><th class="money">회비 Payment</th><th class="money">연체료 Late Fee</th><th class="money">금액 Amount</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="total">합계 Total due: ${formatMoney(balance.totalDue)}</div>
          </section>

          <div class="note">다음 수업 시간에 회비를 정리해 주시거나, 이미 납부하셨다면 데스크에 알려 주세요.<br>Please bring this account current at your next class or contact the front desk if a payment was already made.</div>
        </main>
        <div class="actions"><button type="button" onclick="window.print()">인쇄 · Print or Save PDF</button></div>
      </body>
    </html>`;

  const invoiceWindow = window.open("", "_blank");
  if (!invoiceWindow) {
    showToast(MSG.popupBlocked);
    return;
  }
  invoiceWindow.document.write(invoiceHtml);
  invoiceWindow.document.close();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function selectedMember() {
  return state.store.members.find((member) => member.id === state.selectedId);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function setAnimatedText(element, nextText) {
  if (!element || element.textContent === nextText) {
    return;
  }
  const hadValue = element.textContent.trim() !== "";
  element.textContent = nextText;
  if (!hadValue) {
    return;
  }
  element.classList.remove("value-updated");
  void element.offsetWidth;
  element.classList.add("value-updated");
}

function formatPhone(phone) {
  if (!phone) {
    return "";
  }
  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.add("hidden"), 5000);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
