import {
  MEMBER_FIELD_ALIASES,
  PAYMENT_FIELD_ALIASES,
  addPayment,
  defaultAgreementEndDate,
  exportStoreRows,
  getAgreementExpirationStatus,
  getContractDownPaymentRecord,
  clearContractDownPayment,
  exportDailyPaymentStatusRows,
  exportRosterRows,
  getLandscapeRows,
  getLateFeeBalance,
  getYearRevenue,
  isFullBackupCsv,
  restoreStoreFromBackupRows,
  getMemberBalance,
  getMemberPaymentState,
  getResponsibleParty,
  guessColumnMap,
  householdMembers,
  importMembersFromRecords,
  importPaymentsFromRecords,
  isActiveParticipant,
  nextUnpaidTuitionMonth,
  parseCsv,
  recordContractDownPayment,
  searchMembers,
  shiftMonth,
  stagedPaymentMonth,
  suggestedPaymentMember,
  toCsv,
  toggleMemberMonthPayment,
  upsertMember
} from "./data.js";
import { loadStoreWithMigrationBackup } from "./storage.js";
import { buildReminderEmail, formatMonthEn } from "./i18n.js";
import { buildRenewalEmail } from "./renewals.js";
import {
  buildCollectionPlacement,
  collectionInfoFromDraft,
  collectionPlacementFilename,
  createCollectionDraft,
  createFirstCreditServicesWorkbook,
  firstCreditServicesEmailDraft,
  getCollectionMissingFields
} from "./collections.js";
import { seedDemoData } from "./demo-seed.js";
import {
  CERTIFICATION_LEVELS,
  MUAY_THAI_LEVELS,
  nextMemberCertification,
  normalizeMemberCertifications
} from "./certification.js";
import { getDailyStatusEmail } from "./settings.js";

const CONTRACT_PDF_URL = new URL("./assets/WMAC-membership-agreement-with-contact-permission.pdf", import.meta.url).href;
const CONTRACT_PDF_FILENAME = "WMAC-membership-agreement-renewal.pdf";
const DAILY_STATUS_EMAIL = "world_martial_art_ct@msn.com";

const STORAGE_KEY = "master-lee-payment-tracker";
const RECENT_KEY = "master-lee-payment-tracker-recent";
const state = {
  store: loadStore(),
  selectedId: "",
  view: "home",
  rosterFilter: "all",
  memberViewMode: "list",
  editorMode: "",
  historyExpanded: false,
  calendarOpen: false,
  memberOrigin: "home",
  snapshotMonth: "",
  collectionMemberId: "",
  collectionDraft: null,
  squarePayments: [],
  squareSelectedId: "",
  squareConfigured: false,
  squareLoading: false,
  squareLoaded: false,
  squareError: ""
};
const memberTuitionSaveTimers = new Map();

const ids = [
  "homeLink", "homeNav", "membersNav", "snapshotNav", "squareNav", "squareNavBadge", "searchInput", "addMemberButton", "settingsButton", "saveStatus",
  "snapshotView", "snapshotEyebrow", "snapshotMonthLabel", "snapshotMonthName", "snapshotPrevButton", "snapshotNextButton",
  "snapshotReceived", "snapshotExpected", "snapshotChart", "snapshotLegend", "snapshotFootnote",
  "homeView", "attentionList", "seeAllMembersButton", "paidStat", "dueStat", "familyStat", "membersStat",
  "paidCount", "dueCount", "familyCount", "memberCount", "recentMembers",
  "rosterView", "rosterTitle", "rosterSummary", "rosterList", "memberListToggle", "memberLandscapeToggle",
  "memberLandscape", "memberLandscapeHead", "memberLandscapeBody",
  "memberView", "memberBackButton", "memberAvatar", "memberNameHeading", "memberStatusBadge", "memberSubtitle",
  "editProfileButton", "nextMemberButton", "paymentCard", "paymentHeadline", "paymentSubhead", "amountDue",
  "recordPaymentButton", "recordPaymentTitle", "recordPaymentLabel", "paymentMenuButton", "paymentMenu",
  "paymentCalendar", "paymentCalendarGrid", "customPaymentButton",
  "catchUpButton", "reminderButton", "invoiceButton", "squareRecurringButton", "showAllPaymentsButton", "paymentHistory",
  "editTrainingButton", "trainingPrograms", "trainingTkd", "trainingMt", "trainingNext",
  "familyCard", "editFamilyButton", "familyMembers", "editContractButton", "contractStart", "contractEnd",
  "contractAmount", "contractDownPayment", "contractType", "contractProgress", "contractNote", "downPaymentAction",
  "downPaymentActionTitle", "downPaymentActionHelp", "recordDownPaymentButton", "clearDownPaymentButton", "editBioButton", "bioPhone", "bioEmail",
  "bioDob", "bioAddress", "editorDialog", "editorForm", "editorEyebrow", "editorTitle", "editorHelp",
  "editorFields", "closeEditorButton", "cancelEditorButton", "paymentDialog", "paymentForm", "closePaymentButton",
  "cancelPaymentButton", "paymentMonth", "paymentAmount", "paymentDate", "paymentNote",
  "toolsDialog", "closeToolsButton", "memberCsv", "paymentCsv", "exportButton", "restoreCsv", "advancedToolsButton",
  "updatePanel", "updateStatus", "checkUpdateButton", "installUpdateButton", "toast",
  "advancedView", "advancedBackButton", "yearReportThisButton", "yearReportLastButton", "dailyStatusButton",
  "nextYearRosterButton", "openBlankContractButton", "renewalList", "collectionList",
  "collectionDialog", "collectionForm", "closeCollectionButton", "cancelCollectionButton", "collectionMemberLine",
  "collectionMissing", "collectionSummary", "collectionFinalized", "collectionSaveButton", "collectionSaveEmailButton",
  "groupEmailButton", "groupEmailCount", "groupEmailDialog", "groupEmailHelp", "closeGroupEmailButton",
  "groupEmailSubject", "selectAllGroupEmail", "clearAllGroupEmail", "groupEmailMembers",
  "cancelGroupEmailButton", "openGroupEmailButton",
  "squareView", "syncSquareButton", "syncSquareLabel", "squareEmptySyncButton", "squarePendingCount", "squareMatchCount", "squareApprovedCount",
  "squareConnectionStatus", "squareEmpty", "squareWorkspace", "squareQueue", "squareDetail", "squareRelayUrl",
  "squareRelayToken", "saveSquareSettingsButton", "squareSettingsStatus"
];
const el = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));

el.homeLink.addEventListener("click", (event) => { event.preventDefault(); showHome(); });
el.homeNav.addEventListener("click", showHome);
el.membersNav.addEventListener("click", () => showRoster("all"));
el.snapshotNav.addEventListener("click", showSnapshot);
el.snapshotPrevButton.addEventListener("click", () => shiftSnapshotMonth(-1));
el.snapshotNextButton.addEventListener("click", () => shiftSnapshotMonth(1));
el.squareNav.addEventListener("click", showSquare);
el.addMemberButton.addEventListener("click", addMember);
el.settingsButton.addEventListener("click", () => el.toolsDialog.showModal());
el.closeToolsButton.addEventListener("click", () => el.toolsDialog.close());
el.searchInput.addEventListener("input", handleSearch);
el.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const match = searchMembers(state.store.members, el.searchInput.value)[0];
    if (match) openMember(match.id);
  }
});
el.seeAllMembersButton.addEventListener("click", () => showRoster("all"));
el.paidStat.addEventListener("click", () => showRoster("paid"));
el.dueStat.addEventListener("click", () => showRoster("due"));
el.familyStat.addEventListener("click", () => showRoster("families"));
el.membersStat.addEventListener("click", () => showRoster("all"));
el.memberListToggle.addEventListener("click", () => setMemberViewMode("list"));
el.memberLandscapeToggle.addEventListener("click", () => setMemberViewMode("landscape"));
el.memberBackButton.addEventListener("click", () => {
  if (state.memberOrigin === "roster") return showRoster(state.rosterFilter);
  if (state.memberOrigin === "advanced") return showAdvanced();
  showHome();
});
el.nextMemberButton.addEventListener("click", openNextMember);
el.recordPaymentButton.addEventListener("click", toggleRecordPayments);
el.paymentMenuButton.addEventListener("click", () => el.paymentMenu.classList.toggle("hidden"));
// Clicking anywhere outside the payment dropdown collapses it.
document.addEventListener("click", (event) => {
  if (el.paymentMenu.classList.contains("hidden")) return;
  if (el.paymentMenu.contains(event.target) || el.paymentMenuButton.contains(event.target)) return;
  el.paymentMenu.classList.add("hidden");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") el.paymentMenu.classList.add("hidden");
});
el.customPaymentButton.addEventListener("click", openPaymentDialog);
el.catchUpButton.addEventListener("click", catchUpPayments);
el.reminderButton.addEventListener("click", sendReminder);
el.invoiceButton.addEventListener("click", generateInvoice);
el.squareRecurringButton.addEventListener("click", setUpSquareMonthlyInvoice);
el.editTrainingButton.addEventListener("click", () => openEditor("training"));
el.showAllPaymentsButton.addEventListener("click", () => { state.historyExpanded = !state.historyExpanded; renderMember(); });
el.editProfileButton.addEventListener("click", () => openEditor("profile"));
el.editBioButton.addEventListener("click", () => openEditor("bio"));
el.editContractButton.addEventListener("click", () => openEditor("contract"));
el.recordDownPaymentButton.addEventListener("click", recordSelectedDownPayment);
el.clearDownPaymentButton.addEventListener("click", clearSelectedDownPayment);
el.editFamilyButton.addEventListener("click", () => openEditor("family"));
el.closeEditorButton.addEventListener("click", closeEditor);
el.cancelEditorButton.addEventListener("click", closeEditor);
el.editorForm.addEventListener("submit", saveEditor);
el.closePaymentButton.addEventListener("click", () => el.paymentDialog.close());
el.cancelPaymentButton.addEventListener("click", () => el.paymentDialog.close());
el.paymentForm.addEventListener("submit", saveCustomPayment);
el.memberCsv.addEventListener("change", () => importCsv(el.memberCsv.files[0], "members"));
el.paymentCsv.addEventListener("change", () => importCsv(el.paymentCsv.files[0], "payments"));
el.restoreCsv.addEventListener("change", () => importCsv(el.restoreCsv.files[0], "backup"));
el.exportButton.addEventListener("click", exportBackup);
el.advancedToolsButton.addEventListener("click", () => { el.toolsDialog.close(); showAdvanced(); });
el.checkUpdateButton.addEventListener("click", checkForAppUpdate);
el.installUpdateButton.addEventListener("click", installAppUpdate);
el.advancedBackButton.addEventListener("click", showHome);
el.yearReportThisButton.addEventListener("click", () => runYearReport(new Date().getFullYear()));
el.yearReportLastButton.addEventListener("click", () => runYearReport(new Date().getFullYear() - 1));
el.dailyStatusButton.addEventListener("click", exportDailyStatusEmail);
el.nextYearRosterButton.addEventListener("click", exportNextYearRoster);
el.openBlankContractButton.addEventListener("click", openRenewalContract);
el.closeCollectionButton.addEventListener("click", () => el.collectionDialog.close());
el.cancelCollectionButton.addEventListener("click", () => el.collectionDialog.close());
el.collectionForm.addEventListener("input", updateCollectionPreview);
el.collectionForm.addEventListener("change", updateCollectionPreview);
el.collectionForm.addEventListener("submit", (event) => finalizeCollection(event, false));
el.collectionSaveEmailButton.addEventListener("click", (event) => finalizeCollection(event, true));
el.groupEmailButton.addEventListener("click", openGroupEmailDialog);
el.closeGroupEmailButton.addEventListener("click", () => el.groupEmailDialog.close());
el.cancelGroupEmailButton.addEventListener("click", () => el.groupEmailDialog.close());
el.selectAllGroupEmail.addEventListener("click", () => setAllGroupEmailMembers(true));
el.clearAllGroupEmail.addEventListener("click", () => setAllGroupEmailMembers(false));
el.groupEmailMembers.addEventListener("change", updateGroupEmailHelp);
el.openGroupEmailButton.addEventListener("click", openGroupEmail);
el.syncSquareButton.addEventListener("click", syncSquarePayments);
el.squareEmptySyncButton.addEventListener("click", syncSquarePayments);
el.saveSquareSettingsButton.addEventListener("click", saveSquareSettings);

function loadStore() {
  return loadStoreWithMigrationBackup(localStorage, { storageKey: STORAGE_KEY });
}

function initAppUpdates() {
  if (!window.paymentTrackerUpdates) return;

  el.updatePanel.classList.remove("hidden");
  window.paymentTrackerUpdates.onStatus(renderUpdateStatus);
  window.paymentTrackerUpdates.getStatus().then(renderUpdateStatus).catch(() => {
    renderUpdateStatus({ status: "error", message: "Could not read update status." });
  });
}

function checkForAppUpdate() {
  if (!window.paymentTrackerUpdates) return;

  renderUpdateStatus({ status: "checking", message: "Checking GitHub for updates..." });
  window.paymentTrackerUpdates.check().catch((error) => {
    renderUpdateStatus({ status: "error", message: `Update check failed: ${error.message}` });
  });
}

function installAppUpdate() {
  if (!window.paymentTrackerUpdates) return;

  renderUpdateStatus({ status: "installing", message: "Restarting to install the update..." });
  window.paymentTrackerUpdates.install().catch((error) => {
    renderUpdateStatus({ status: "error", message: `Could not install the update: ${error.message}` });
  });
}

function renderUpdateStatus(updateStatus) {
  if (!updateStatus) return;

  el.updateStatus.textContent = updateStatus.message || "Ready to check for updates.";
  el.checkUpdateButton.disabled = ["checking", "available", "downloading", "installing"].includes(updateStatus.status);
  el.installUpdateButton.disabled = updateStatus.status === "installing";
  el.installUpdateButton.classList.toggle("hidden", updateStatus.status !== "ready");
}

function saveStore(message = "Saved on this computer") {
  state.store.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  el.saveStatus.innerHTML = `<span></span> ${escapeHtml(message)}`;
}

function selectedMember() {
  return state.store.members.find((member) => member.id === state.selectedId);
}

function payerFor(member) {
  return getResponsibleParty(member, state.store.members) || member;
}

function accountPaymentState(member) {
  return getMemberPaymentState(payerFor(member), state.store.payments, new Date(), [], state.store.members);
}

function accountBalance(member) {
  return getMemberBalance(payerFor(member), state.store.payments, new Date(), state.store.members);
}

function accountStatus(member) {
  return accountPaymentState(member).level;
}

function isPayer(member) {
  return payerFor(member).id === member.id;
}

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dateLabel(value, fallback = "Not set") {
  if (!value) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return fallback;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function statusLabel(level) {
  return level === "paid" ? "Paid up" : level === "late" ? "Behind" : "Due now";
}

function memberSubtitle(member) {
  const people = householdMembers(state.store.members, member);
  const family = member.householdName || (people.length > 1 ? `${member.name.split(/\s+/).at(-1)} family` : "");
  const role = member.householdRole ? `${capitalize(member.householdRole)}` : "";
  return [role, family].filter(Boolean).join(" · ") || "Individual member";
}

function showHome() {
  state.view = "home";
  state.selectedId = "";
  el.searchInput.value = "";
  render();
}

function showRoster(filter = "all") {
  state.view = "roster";
  state.rosterFilter = filter;
  render();
}

function setMemberViewMode(mode) {
  state.memberViewMode = mode === "landscape" ? "landscape" : "list";
  if (state.view !== "roster") state.view = "roster";
  render();
}

function showSquare() {
  state.view = "square";
  state.selectedId = "";
  el.searchInput.value = "";
  render();
  if (!state.squareLoaded && !state.squareLoading) {
    loadSquarePayments();
  }
}

function showAdvanced() {
  state.view = "advanced";
  state.selectedId = "";
  el.searchInput.value = "";
  render();
}

function showSnapshot() {
  state.view = "snapshot";
  state.selectedId = "";
  state.snapshotMonth = currentMonthKey();
  el.searchInput.value = "";
  render();
}

function openMember(memberId) {
  if (!state.store.members.some((member) => member.id === memberId)) return;
  // Remember which page led here so Back returns there, even after
  // stepping through members with the next-member arrow.
  if (state.view !== "member") state.memberOrigin = state.view;
  state.view = "member";
  state.selectedId = memberId;
  state.historyExpanded = false;
  state.calendarOpen = false;
  el.searchInput.value = "";
  addRecent(memberId);
  render();
}

function render() {
  el.homeView.classList.toggle("hidden", state.view !== "home");
  el.rosterView.classList.toggle("hidden", state.view !== "roster");
  el.memberView.classList.toggle("hidden", state.view !== "member");
  el.squareView.classList.toggle("hidden", state.view !== "square");
  el.advancedView.classList.toggle("hidden", state.view !== "advanced");
  el.snapshotView.classList.toggle("hidden", state.view !== "snapshot");
  el.homeNav.classList.toggle("active", state.view === "home");
  el.membersNav.classList.toggle("active", state.view === "roster" || state.view === "member");
  el.snapshotNav.classList.toggle("active", state.view === "snapshot");
  el.squareNav.classList.toggle("active", state.view === "square");
  if (state.view === "home") renderHome();
  if (state.view === "roster") renderRoster();
  if (state.view === "member") renderMember();
  if (state.view === "square") renderSquare();
  if (state.view === "advanced") renderAdvanced();
  if (state.view === "snapshot") renderSnapshot();
  renderSquareNavBadge();
}

function billingPayers() {
  return state.store.members.filter((member) =>
    !member.inactive
    && isPayer(member)
    && state.store.members.some((candidate) => isActiveParticipant(candidate) && payerFor(candidate).id === member.id)
  );
}

function renderHome() {
  const payers = billingPayers();
  const due = payers
    .map((member) => ({ member, status: accountPaymentState(member), balance: accountBalance(member) }))
    .filter((row) => row.status.dueUnpaidMonths.length)
    .sort((a, b) => b.status.oldestDaysLate - a.status.oldestDaysLate || b.balance.dueNow - a.balance.dueNow);
  const active = state.store.members.filter(isActiveParticipant);
  const families = new Set(active.map((member) => member.householdId || member.householdName).filter(Boolean));
  el.paidCount.textContent = String(payers.filter((member) => accountStatus(member) === "paid").length);
  el.dueCount.textContent = String(due.length);
  el.familyCount.textContent = String(families.size);
  el.memberCount.textContent = String(active.length);

  if (!due.length) {
    el.attentionList.innerHTML = active.length
      ? `<div class="empty-message">Everyone is paid up. Nothing needs attention today.</div>`
      : `<div class="empty-message">No members yet. <button type="button" class="link-button" data-load-demo>Load sample data</button> to explore the full workflow, or use New member.</div>`;
    bindDemoLoaders();
  } else {
    el.attentionList.innerHTML = due.slice(0, 5).map(({ member, status, balance }) => `
      <div class="attention-row">
        <div class="person">
          <div class="avatar">${escapeHtml(initials(member.name))}</div>
          <div class="person-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(memberSubtitle(member))}</small></div>
        </div>
        <div class="attention-meta"><strong>${status.oldestDaysLate > 9 ? `${status.oldestDaysLate} days overdue` : "Payment due"}</strong><small>${status.dueUnpaidMonths.length} month${status.dueUnpaidMonths.length === 1 ? "" : "s"} unpaid</small></div>
        <div class="attention-amount">${money(balance.dueNow)}</div>
        <button class="attention-action" type="button" data-open-member="${member.id}">Review payment</button>
      </div>
    `).join("");
    el.attentionList.querySelectorAll("[data-open-member]").forEach((button) =>
      button.addEventListener("click", () => openMember(button.dataset.openMember))
    );
  }
  renderRecent();
}

function recentIds() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}

function addRecent(memberId) {
  const next = [memberId, ...recentIds().filter((id) => id !== memberId)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function renderRecent() {
  const saved = recentIds().map((id) => state.store.members.find((member) => member.id === id)).filter(Boolean);
  const fallback = state.store.members.filter((member) => !member.inactive).slice(0, 6);
  const members = saved.length ? saved : fallback;
  el.recentMembers.innerHTML = members.length ? members.map((member) => {
    const level = accountStatus(member);
    return `
      <button class="recent-member" type="button" data-open-member="${member.id}">
        <div class="avatar">${escapeHtml(initials(member.name))}</div>
        <span class="person-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(memberSubtitle(member))}</small><span class="mini-status ${level}">${statusLabel(level)}</span></span>
        <span aria-hidden="true">→</span>
      </button>`;
  }).join("") : `<div class="empty-message">No members yet.</div>`;
  el.recentMembers.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
  );
}

function filteredRoster() {
  const members = state.store.members.filter((member) => !member.inactive);
  if (state.rosterFilter === "paid") return members.filter((member) => isPayer(member) && accountStatus(member) === "paid");
  if (state.rosterFilter === "due") return members.filter((member) => isPayer(member) && accountPaymentState(member).dueUnpaidMonths.length);
  if (state.rosterFilter === "families") return members.filter((member) => member.householdName || member.householdId);
  return members;
}

function renderRoster() {
  const titles = { all: "All members", paid: "Paid up", due: "Payments due", families: "Families" };
  const members = filteredRoster();
  el.rosterTitle.textContent = titles[state.rosterFilter] || "All members";
  el.rosterSummary.textContent = `${members.length} record${members.length === 1 ? "" : "s"}`;
  el.memberListToggle.classList.toggle("active", state.memberViewMode === "list");
  el.memberLandscapeToggle.classList.toggle("active", state.memberViewMode === "landscape");
  el.rosterList.classList.toggle("hidden", state.memberViewMode !== "list");
  el.memberLandscape.classList.toggle("hidden", state.memberViewMode !== "landscape");
  if (state.memberViewMode === "landscape") {
    renderMemberLandscape();
    return;
  }
  el.rosterList.innerHTML = members.length ? members.map((member) => {
    const payer = payerFor(member);
    const level = accountStatus(member);
    const balance = accountBalance(member);
    return `
      <button class="roster-row" type="button" data-open-member="${member.id}">
        <div class="person">
          <div class="avatar">${escapeHtml(initials(member.name))}</div>
          <div class="person-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(memberSubtitle(member))}</small></div>
        </div>
        <span>${payer.id === member.id ? "Responsible payer" : `Paid by ${escapeHtml(payer.name)}`}</span>
        <span class="mini-status ${level}">${statusLabel(level)}</span>
        <strong>${balance.dueNow ? money(balance.dueNow) : "—"}</strong>
      </button>`;
  }).join("") : state.rosterFilter === "all"
    ? `<div class="empty-message">No members yet. <button type="button" class="link-button" data-load-demo>Load sample data</button> to explore the full workflow, or use New member.</div>`
    : `<div class="empty-message">No members in this group.</div>`;
  el.rosterList.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
  );
  bindDemoLoaders();
}

function renderMemberLandscape() {
  const landscape = getLandscapeRows(state.store, state.squarePayments, new Date(), 12);
  el.memberLandscapeHead.innerHTML = `
    <tr>
      <th class="landscape-member-name">Member</th>
      <th>Status</th>
      <th>Due</th>
      ${landscape.months.map((month) => `<th>${escapeHtml(shortMonth(month))}</th>`).join("")}
    </tr>`;
  el.memberLandscapeBody.innerHTML = landscape.rows.length ? landscape.rows.map((row) => `
    <tr>
      <th class="landscape-member-name"><button class="landscape-member-button" type="button" data-open-member="${row.member.id}">${escapeHtml(row.member.name)}</button></th>
      <td><span class="mini-status ${row.paymentState.level}">${statusLabel(row.paymentState.level)}</span></td>
      <td><strong>${row.balance.dueNow ? money(row.balance.dueNow) : "—"}</strong></td>
      ${row.cells.map((cell) => {
        const disabled = cell.state === "not_billable" || cell.prepaid || row.balance.monthlyAmount <= 0;
        const label = cell.prepaid
          ? "covered by down payment"
          : cell.paid
            ? "click to mark unpaid"
            : "click to record payment";
        return `<td class="simple-landscape-cell ${cell.state}${cell.prepaid ? " prepaid" : ""}">
          <button class="landscape-month-button" type="button" data-toggle-member="${escapeAttr(row.member.id)}" data-toggle-month="${escapeAttr(cell.month)}" ${disabled ? "disabled" : ""} title="${escapeAttr(`${formatMonthEn(cell.month)}: ${label}`)}" aria-label="${escapeAttr(`${row.member.name}, ${formatMonthEn(cell.month)}: ${label}`)}">${landscapeSymbol(cell.state)}</button>
        </td>`;
      }).join("")}
    </tr>`).join("") : `<tr><td colspan="15" class="empty-message">No active member accounts.</td></tr>`;
  el.memberLandscapeBody.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
  );
  el.memberLandscapeBody.querySelectorAll("[data-toggle-month]").forEach((button) =>
    button.addEventListener("click", () => toggleLandscapeMonth(button.dataset.toggleMember, button.dataset.toggleMonth))
  );
}

function shortMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function landscapeSymbol(status) {
  return { paid: "✓", attention: "!", behind: "!", pending: "…", upcoming: "○", not_billable: "—" }[status] || "—";
}

function renderMember() {
  const member = selectedMember();
  if (!member) return showHome();
  const payer = payerFor(member);
  const status = accountPaymentState(member);
  const balance = accountBalance(member);
  const level = status.level;
  const currentPaid = status.paidMonths.has(status.currentMonth);

  el.memberAvatar.textContent = initials(member.name);
  el.memberNameHeading.textContent = member.name || "Unnamed member";
  el.memberStatusBadge.className = `status-badge ${level}`;
  el.memberStatusBadge.textContent = statusLabel(level);
  el.memberSubtitle.textContent = memberSubtitle(member);

  el.amountDue.textContent = money(balance.dueNow);
  if (!isPayer(member)) {
    el.paymentHeadline.textContent = `Payments are managed by ${payer.name}`;
    el.paymentSubhead.textContent = "Open the responsible payer to record family payments.";
    el.recordPaymentButton.disabled = false;
    el.recordPaymentButton.classList.remove("done");
    el.recordPaymentButton.dataset.openPayer = payer.id;
    el.recordPaymentTitle.textContent = "Open payer account";
    el.recordPaymentLabel.textContent = `Record family payments on ${payer.name}'s page`;
  } else {
    if (currentPaid) {
      el.paymentHeadline.textContent = `${formatMonthEn(status.currentMonth)} is paid`;
      el.paymentSubhead.textContent = balance.dueUnpaidMonths.length ? `${balance.dueUnpaidMonths.length} earlier payment${balance.dueUnpaidMonths.length === 1 ? "" : "s"} still need attention.` : "This account is up to date.";
    } else {
      el.paymentHeadline.textContent = balance.dueUnpaidMonths.length > 1 ? `${balance.dueUnpaidMonths.length} payments need attention` : `${formatMonthEn(status.currentMonth)} payment`;
      el.paymentSubhead.textContent = balance.monthlyAmount > 0 ? `Normal tuition is ${money(balance.monthlyAmount)} per month.` : "Add the monthly tuition amount before recording payment.";
    }
    delete el.recordPaymentButton.dataset.openPayer;
    el.recordPaymentButton.disabled = balance.monthlyAmount <= 0;
    el.recordPaymentButton.classList.toggle("done", !balance.dueUnpaidMonths.length && balance.monthlyAmount > 0);
    el.recordPaymentTitle.textContent = "Record payments";
    el.recordPaymentLabel.textContent = balance.monthlyAmount <= 0
      ? "Monthly amount not set"
      : balance.dueUnpaidMonths.length
        ? `${balance.dueUnpaidMonths.length} month${balance.dueUnpaidMonths.length === 1 ? "" : "s"} due · ${money(balance.dueNow)}`
        : state.calendarOpen ? "Click a month below to adjust" : "All caught up · click to review months";
  }

  const showCalendar = isPayer(member) && state.calendarOpen;
  el.recordPaymentButton.setAttribute("aria-expanded", String(showCalendar));
  el.paymentCalendar.classList.toggle("hidden", !showCalendar);
  if (showCalendar) renderPaymentCalendar(member, status, balance);
  el.catchUpButton.disabled = !isPayer(member) || !balance.dueUnpaidMonths.length || balance.monthlyAmount <= 0;
  el.reminderButton.disabled = !payer.email || !balance.dueUnpaidMonths.length;
  el.invoiceButton.disabled = !isPayer(member) || !balance.dueUnpaidMonths.length;
  renderSquareRecurringItem(member, payer, balance);
  renderPaymentHistory(member);
  renderFamily(member);
  renderContract(member);
  renderBio(member);
  renderTraining(member);
}

function renderSquareRecurringItem(member, payer, balance) {
  const setup = payer.squareMonthlyInvoice || null;
  const active = ["ACTIVE", "PENDING"].includes(String(setup?.status || "").toUpperCase());
  const startDate = squareInvoiceStartDate(payer, new Date(), balance.monthlyAmount);
  const missing = [];
  if (!payer.email) missing.push("payer email");
  if (!payer.startDate) missing.push("contract date");
  if (balance.monthlyAmount <= 0) missing.push("monthly amount");
  const placed = payer.collectionPlacement?.status === "charged_off";
  if (active) {
    el.squareRecurringButton.textContent = `Square monthly invoice ${String(setup.status).toLowerCase()} · starts ${setup.startDate}`;
    el.squareRecurringButton.disabled = true;
    el.squareRecurringButton.title = "";
    return;
  }
  el.squareRecurringButton.textContent = "Set up monthly Square invoice";
  el.squareRecurringButton.disabled = !isPayer(member) || placed || missing.length > 0 || !startDate;
  el.squareRecurringButton.title = !isPayer(member)
    ? `Set this up on ${payer.name}'s payer account.`
    : missing.length
      ? `Before setup, save: ${missing.join(", ")}.`
      : "";
}

function renderTraining(member) {
  const certifications = normalizeMemberCertifications(member);
  const programs = [];
  if ((member.programs || []).includes("tae_kwon_do")) programs.push("Tae Kwon Do");
  if ((member.programs || []).includes("muay_thai")) programs.push("Muay Thai");
  el.trainingPrograms.textContent = programs.join(" · ") || "Not set";
  el.trainingTkd.textContent = certifications.tae_kwon_do || "Not set";
  el.trainingMt.textContent = certifications.muay_thai || "Not set";
  el.trainingNext.textContent = nextMemberCertification(member) || "—";
}

function renderPaymentHistory(member) {
  const payer = payerFor(member);
  const accountIds = new Set(state.store.members.filter((candidate) => payerFor(candidate).id === payer.id).map((candidate) => candidate.id));
  const payments = state.store.payments
    .filter((payment) => accountIds.has(payment.memberId))
    .sort((a, b) => `${b.paidAt || ""}${b.month || ""}`.localeCompare(`${a.paidAt || ""}${a.month || ""}`));
  const visible = state.historyExpanded ? payments : payments.slice(0, 4);
  el.showAllPaymentsButton.textContent = state.historyExpanded ? "Show less" : `Show all${payments.length ? ` (${payments.length})` : ""}`;
  el.paymentHistory.innerHTML = visible.length ? visible.map((payment) => `
    <div class="payment-row">
      <span class="payment-check">✓</span>
      <strong>${escapeHtml(formatMonthEn(payment.month))}</strong>
      <span>${dateLabel(payment.paidAt)}</span>
      <strong>${money(payment.amount)}</strong>
      ${isPayer(member) ? `<button type="button" data-remove-payment="${payment.id}" title="Remove payment">×</button>` : ""}
    </div>`).join("") : `<div class="empty-message">No payments recorded yet.</div>`;
  el.paymentHistory.querySelectorAll("[data-remove-payment]").forEach((button) =>
    button.addEventListener("click", () => removePaymentById(button.dataset.removePayment))
  );
}

function renderFamily(member) {
  const family = householdMembers(state.store.members, member);
  el.familyMembers.innerHTML = family.map((person) => {
    const personPayer = payerFor(person);
    const participationNote = person.participant === false
      ? "Contact only · not included in total"
      : person.id === personPayer.id
        ? "Responsible payer"
        : `Paid by ${personPayer.name}`;
    return `
    <div class="family-member ${person.id === member.id ? "current" : ""}">
      <div class="avatar">${escapeHtml(initials(person.name))}</div>
      <div class="family-member-copy"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(participationNote)}</small><span class="family-role">${escapeHtml(person.householdRole || "adult")}</span></div>
      <label class="family-tuition-field">
        <span>Monthly tuition</span>
        <span class="money-input"><b>$</b><input type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(Number(person.monthlyAmount || 0))}" data-member-tuition="${escapeAttr(person.id)}" aria-label="${escapeAttr(`${person.name} monthly tuition`)}"></span>
        <small data-member-tuition-status="${escapeAttr(person.id)}">Auto-saves</small>
      </label>
    </div>`;
  }).join("") + `
    <div class="family-account-total">
      <span>Account monthly total <small>Active students only</small></span>
      <strong data-family-account-total>${money(accountBalance(member).monthlyAmount)}</strong>
    </div>`;

  el.familyMembers.querySelectorAll("[data-member-tuition]").forEach((input) => {
    input.addEventListener("input", () => queueMemberTuitionSave(input));
    input.addEventListener("change", () => {
      saveMemberTuition(input);
      renderMember();
    });
  });
}

function queueMemberTuitionSave(input) {
  const memberId = input.dataset.memberTuition;
  clearTimeout(memberTuitionSaveTimers.get(memberId));
  const status = el.familyMembers.querySelector(`[data-member-tuition-status="${CSS.escape(memberId)}"]`);
  if (status) status.textContent = "Saving…";
  memberTuitionSaveTimers.set(memberId, setTimeout(() => saveMemberTuition(input), 450));
}

function saveMemberTuition(input) {
  const memberId = input.dataset.memberTuition;
  clearTimeout(memberTuitionSaveTimers.get(memberId));
  memberTuitionSaveTimers.delete(memberId);
  const member = state.store.members.find((candidate) => candidate.id === memberId);
  const amount = input.value === "" ? 0 : Number(input.value);
  const status = el.familyMembers.querySelector(`[data-member-tuition-status="${CSS.escape(memberId)}"]`);
  if (!member || !Number.isFinite(amount) || amount < 0) {
    if (status) status.textContent = "Enter a valid amount";
    return;
  }

  state.store = upsertMember(state.store, { ...member, monthlyAmount: Math.round(amount * 100) / 100 });
  saveStore(`${member.name}'s tuition saved`);
  if (status) status.textContent = "Saved";
  const selected = selectedMember();
  if (selected) {
    const accountTotal = accountBalance(selected).monthlyAmount;
    const total = el.familyMembers.querySelector("[data-family-account-total]");
    if (total) total.textContent = money(accountTotal);
    el.contractAmount.textContent = money(accountTotal);
  }
}

function renderContract(member) {
  const payer = payerFor(member);
  const expiration = getAgreementExpirationStatus(payer);
  const downPaymentRecord = getContractDownPaymentRecord(state.store, payer.id);
  const downPaymentAmount = Number(payer.downPayment || 0);
  el.contractStart.textContent = dateLabel(payer.startDate);
  el.contractEnd.textContent = payer.agreementType === "Month-to-Month" ? "Ongoing" : dateLabel(payer.agreementEndDate);
  el.contractAmount.textContent = money(accountBalance(member).monthlyAmount);
  el.contractDownPayment.textContent = downPaymentAmount > 0 ? money(downPaymentAmount) : "None";
  el.contractType.textContent = payer.agreementType || "Contract";
  const start = Date.parse(payer.startDate || "");
  const end = Date.parse(payer.agreementEndDate || "");
  const now = Date.now();
  const percent = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 0;
  el.contractProgress.querySelector("span").style.width = `${percent}%`;
  el.contractProgress.classList.toggle("hidden", payer.agreementType === "Month-to-Month" || !end);
  el.contractNote.textContent = expiration.level === "expired" ? "Contract renewal is due." : expiration.daysUntil != null ? `${Math.max(0, expiration.daysUntil)} days remaining` : "";
  const canRecord = isPayer(member) && downPaymentAmount > 0 && Boolean(payer.startDate);
  el.downPaymentAction.classList.toggle("hidden", !isPayer(member) || downPaymentAmount <= 0);
  // A recorded down payment can always be cleared, even when the current
  // contract amount would fail validation, so an amount entered in error is
  // never stuck. Clearing keeps the saved contract amount so a corrected
  // figure can be typed and re-recorded.
  el.clearDownPaymentButton.classList.toggle("hidden", !isPayer(member) || !downPaymentRecord);
  el.clearDownPaymentButton.disabled = !isPayer(member) || !downPaymentRecord;
  if (downPaymentRecord) {
    const matchesContract = Number(downPaymentRecord.amount || 0) === downPaymentAmount
      && downPaymentRecord.paidAt === payer.startDate;
    el.downPaymentActionTitle.textContent = matchesContract ? "Down payment recorded" : "Recorded payment needs updating";
    el.downPaymentActionHelp.textContent = matchesContract
      ? `${money(downPaymentRecord.amount)} recorded on ${dateLabel(downPaymentRecord.paidAt)}. Edit the contract or clear it to correct the amount.`
      : `${money(downPaymentRecord.amount)} recorded on ${dateLabel(downPaymentRecord.paidAt)}. Update it to match the saved amount, or clear it to start over.`;
    // Keep Record clickable so a corrected amount can overwrite the entry.
    el.recordDownPaymentButton.textContent = matchesContract ? "Re-record" : "Update recorded payment";
    el.recordDownPaymentButton.disabled = !canRecord;
  } else {
    el.downPaymentActionTitle.textContent = "Down payment not recorded";
    el.downPaymentActionHelp.textContent = "The contract value is saved, but no financial transaction has been created.";
    el.recordDownPaymentButton.textContent = "Record down payment";
    el.recordDownPaymentButton.disabled = !canRecord;
  }
}

function recordSelectedDownPayment() {
  const member = selectedMember();
  if (!member) return;
  try {
    const result = recordContractDownPayment(state.store, payerFor(member).id);
    if (!result.changed) {
      toast("The recorded amount already matches the contract.");
      return;
    }
    state.store = result.store;
    saveStore("Contract down payment recorded");
    toast(`${money(result.payment.amount)} down payment recorded.`);
    render();
  } catch (error) {
    toast(error.message || "Could not record the contract down payment.");
  }
}

function clearSelectedDownPayment() {
  const member = selectedMember();
  if (!member) return;
  try {
    const result = clearContractDownPayment(state.store, payerFor(member).id);
    if (!result.changed) {
      toast("There is no recorded down payment to clear.");
      return;
    }
    state.store = result.store;
    saveStore("Contract down payment cleared");
    toast("Cleared the recorded down payment. Enter the correct amount, then record it again.");
    render();
  } catch (error) {
    toast(error.message || "Could not clear the contract down payment.");
  }
}

function renderBio(member) {
  const address = [member.address, member.city, member.state, member.zip].filter(Boolean).join(", ");
  el.bioPhone.textContent = member.cellPhone || member.phone || "Not set";
  el.bioEmail.textContent = member.email || "Not set";
  el.bioDob.textContent = dateLabel(member.dob);
  el.bioAddress.textContent = address || "Not set";
}

// Validated palette (CVD-safe, chroma/lightness in band): green = paid,
// orange = overdue, lighter green = upcoming. The legend always shows
// labels and dollar values, so color is never the only signal.
const SNAPSHOT_SLICES = [
  { key: "paid", label: "Paid", color: "#157f56" },
  { key: "overdue", label: "Overdue", color: "#d97a1f" },
  { key: "upcoming", label: "Upcoming due", color: "#6fbf92" }
];

function snapshotData(monthKey) {
  const totals = {
    paid: { amount: 0, count: 0 },
    overdue: { amount: 0, count: 0 },
    upcoming: { amount: 0, count: 0 }
  };
  let earlierAmount = 0;
  let earlierMonths = 0;
  let earliestMonth = "";
  billingPayers().forEach((member) => {
    const status = accountPaymentState(member);
    const amount = accountBalance(member).monthlyAmount;
    if (amount <= 0) return;
    const firstMonth = status.months[0]?.month || "";
    if (firstMonth && (!earliestMonth || firstMonth < earliestMonth)) earliestMonth = firstMonth;
    const viewed = status.months.find((month) => month.month === monthKey);
    if (viewed) {
      const bucket = viewed.paid ? "paid" : viewed.pending || viewed.daysLate < 0 ? "upcoming" : "overdue";
      totals[bucket].amount += amount;
      totals[bucket].count += 1;
    }
    const earlier = status.dueUnpaidMonths.filter((month) => month.month < monthKey);
    earlierMonths += earlier.length;
    earlierAmount += earlier.length * amount;
  });
  const expected = totals.paid.amount + totals.overdue.amount + totals.upcoming.amount;
  return { totals, expected, earlierAmount, earlierMonths, earliestMonth };
}

function shiftSnapshotMonth(delta) {
  const [year, month] = (state.snapshotMonth || currentMonthKey()).split("-").map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  state.snapshotMonth = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
  render();
}

function donutSlicePath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const sweep = Math.min(endAngle - startAngle, 359.99);
  const point = (radius, angle) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return `${(cx + radius * Math.cos(radians)).toFixed(2)} ${(cy + radius * Math.sin(radians)).toFixed(2)}`;
  };
  const large = sweep > 180 ? 1 : 0;
  const end = startAngle + sweep;
  return `M ${point(outerRadius, startAngle)} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${point(outerRadius, end)} L ${point(innerRadius, end)} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${point(innerRadius, startAngle)} Z`;
}

function renderSnapshot() {
  const currentKey = currentMonthKey();
  if (!state.snapshotMonth) state.snapshotMonth = currentKey;
  if (state.snapshotMonth > currentKey) state.snapshotMonth = currentKey;
  let { totals, expected, earlierAmount, earlierMonths, earliestMonth } = snapshotData(state.snapshotMonth);
  const earliest = earliestMonth || currentKey;
  if (state.snapshotMonth < earliest) {
    state.snapshotMonth = earliest;
    ({ totals, expected, earlierAmount, earlierMonths } = snapshotData(state.snapshotMonth));
  }
  const monthKey = state.snapshotMonth;
  const monthName = formatMonthEn(monthKey);
  const isCurrent = monthKey === currentKey;
  el.snapshotPrevButton.disabled = monthKey <= earliest;
  el.snapshotNextButton.disabled = isCurrent;
  el.snapshotMonthName.textContent = monthName;
  el.snapshotEyebrow.textContent = isCurrent ? "This month · 이번 달" : "Earlier month · 지난 달";
  el.snapshotMonthLabel.textContent = `${monthName} tuition across all active accounts.`;
  el.snapshotReceived.textContent = money(totals.paid.amount);
  el.snapshotExpected.textContent = money(expected);
  if (expected <= 0) {
    el.snapshotChart.innerHTML = "";
    el.snapshotLegend.innerHTML = `<div class="empty-message">No accounts were billable in ${escapeHtml(monthName)}.</div>`;
    el.snapshotFootnote.textContent = "";
    return;
  }
  const percentPaid = Math.round((totals.paid.amount / expected) * 100);
  let angle = 0;
  const paths = SNAPSHOT_SLICES.filter((slice) => totals[slice.key].amount > 0).map((slice) => {
    const share = totals[slice.key].amount / expected;
    const start = angle;
    angle += share * 360;
    return `<path class="snapshot-slice" fill="${slice.color}" d="${donutSlicePath(100, 100, 52, 88, start, angle)}">
      <title>${escapeHtml(`${slice.label}: ${money(totals[slice.key].amount)} (${Math.round(share * 100)}%)`)}</title>
    </path>`;
  }).join("");
  const summary = SNAPSHOT_SLICES.map((slice) => `${slice.label} ${money(totals[slice.key].amount)}`).join(", ");
  el.snapshotChart.innerHTML = `
    <svg viewBox="0 0 200 200" role="img" aria-label="${escapeAttr(`Tuition coverage for ${monthName}: ${summary}.`)}">
      ${paths}
      <text x="100" y="97" class="snapshot-center-value">${percentPaid}%</text>
      <text x="100" y="116" class="snapshot-center-label">received</text>
    </svg>`;
  el.snapshotLegend.innerHTML = SNAPSHOT_SLICES.map((slice) => {
    const bucket = totals[slice.key];
    const share = expected > 0 ? Math.round((bucket.amount / expected) * 100) : 0;
    return `
      <div class="snapshot-legend-row">
        <i style="background:${slice.color}"></i>
        <div class="legend-copy"><strong>${slice.label}</strong><small>${bucket.count} account${bucket.count === 1 ? "" : "s"}</small></div>
        <div class="legend-amount"><strong>${money(bucket.amount)}</strong><small>${share}%</small></div>
      </div>`;
  }).join("");
  el.snapshotFootnote.textContent = earlierMonths
    ? `Not counted above: ${money(earlierAmount)} from ${earlierMonths} unpaid month${earlierMonths === 1 ? "" : "s"} before ${monthName} is still outstanding.`
    : `No months before ${monthName} are outstanding.`;
}

function renderAdvanced() {
  const thisYear = new Date().getFullYear();
  el.yearReportThisButton.querySelector("span").textContent = `${thisYear} year-end report`;
  el.yearReportLastButton.querySelector("span").textContent = `${thisYear - 1} year-end report`;
  const emailable = groupEmailMembers().length;
  el.groupEmailCount.textContent = `${emailable} active member${emailable === 1 ? "" : "s"} with an email address`;
  el.groupEmailButton.disabled = emailable === 0;
  renderRenewalList();
  renderCollectionList();
}

function renderRenewalList() {
  const rows = state.store.members
    .map((member) => ({ member, renewal: getAgreementExpirationStatus(member) }))
    .filter(({ renewal }) => renewal.level === "expired" || renewal.level === "expiring")
    .sort((a, b) => (a.renewal.daysUntil ?? 0) - (b.renewal.daysUntil ?? 0));
  el.renewalList.innerHTML = rows.length ? rows.map(({ member, renewal }) => {
    const detail = renewal.level === "expired"
      ? `Contract expired ${dateLabel(renewal.expirationDate)}`
      : `Expires ${dateLabel(renewal.expirationDate)} · ${renewal.daysUntil} day${renewal.daysUntil === 1 ? "" : "s"} left`;
    const email = member.email || payerFor(member).email || "";
    return `
      <div class="advanced-row">
        <button class="advanced-person" type="button" data-open-member="${member.id}">
          <div class="avatar">${escapeHtml(initials(member.name))}</div>
          <div class="person-copy"><strong>${escapeHtml(member.name)}</strong><small class="${renewal.level === "expired" ? "overdue-text" : ""}">${escapeHtml(detail)}</small></div>
        </button>
        <button class="button secondary small" type="button" data-renewal-email="${member.id}" ${email ? "" : `disabled title="Save an email address first."`}>Email renewal</button>
      </div>`;
  }).join("") : `<div class="empty-message">No contracts are expired or expiring within 30 days.</div>`;
  el.renewalList.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
  );
  el.renewalList.querySelectorAll("[data-renewal-email]").forEach((button) =>
    button.addEventListener("click", () => sendRenewalEmail(button.dataset.renewalEmail))
  );
}

function renderCollectionList() {
  const behind = billingPayers()
    .map((member) => ({ member, status: accountPaymentState(member), balance: accountBalance(member) }))
    .filter(({ member, status }) => status.level === "late" && member.collectionPlacement?.status !== "charged_off")
    .sort((a, b) => b.status.oldestDaysLate - a.status.oldestDaysLate);
  const placed = state.store.members
    .filter((member) => member.collectionPlacement?.status === "charged_off")
    .sort((a, b) => String(b.collectionPlacement.chargeOffDate).localeCompare(String(a.collectionPlacement.chargeOffDate)));
  const behindRows = behind.map(({ member, status, balance }) => `
    <div class="advanced-row">
      <button class="advanced-person" type="button" data-open-member="${member.id}">
        <div class="avatar">${escapeHtml(initials(member.name))}</div>
        <div class="person-copy"><strong>${escapeHtml(member.name)}</strong><small class="overdue-text">${status.oldestDaysLate} days behind · ${money(balance.dueNow)} due</small></div>
      </button>
      <button class="button secondary small" type="button" data-collection-member="${member.id}">Prepare placement…</button>
    </div>`);
  const placedRows = placed.map((member) => `
    <div class="advanced-row placed">
      <div class="advanced-person">
        <div class="avatar">${escapeHtml(initials(member.name))}</div>
        <div class="person-copy"><strong>${escapeHtml(member.name)}</strong><small>Placed ${dateLabel(member.collectionPlacement.chargeOffDate)} · ${money(member.collectionPlacement.frozenBalance)} frozen</small></div>
      </div>
      <span class="mini-status">Placed for collection</span>
    </div>`);
  el.collectionList.innerHTML = behindRows.concat(placedRows).join("")
    || `<div class="empty-message">No accounts are far enough behind for collections.</div>`;
  el.collectionList.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
  );
  el.collectionList.querySelectorAll("[data-collection-member]").forEach((button) =>
    button.addEventListener("click", () => openCollectionDialog(button.dataset.collectionMember))
  );
}

function openRenewalContract() {
  const contractWindow = window.open(CONTRACT_PDF_URL, "_blank");
  if (!contractWindow) toast("Allow pop-ups to open the contract.");
}

function downloadRenewalContract() {
  const link = document.createElement("a");
  link.href = CONTRACT_PDF_URL;
  link.download = CONTRACT_PDF_FILENAME;
  document.body.append(link);
  link.click();
  link.remove();
}

function sendRenewalEmail(memberId) {
  const member = state.store.members.find((candidate) => candidate.id === memberId);
  if (!member) return;
  const email = member.email || payerFor(member).email;
  if (!email) return toast("Save an email address first.");
  const message = buildRenewalEmail(member, getAgreementExpirationStatus(member));
  downloadRenewalContract();
  toast("Contract downloaded — attach it to the email.");
  window.location.href = `mailto:${email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
}

function runYearReport(year) {
  const report = getYearRevenue(state.store, year);
  if (report.paymentCount === 0) return toast(`No payments are recorded for ${year}.`);
  const monthRows = report.monthly.map((row) => {
    const monthNumber = Number(row.month.split("-")[1]);
    const monthName = new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long" });
    return `<tr><td>${monthName}</td><td class="num">${row.count}</td><td class="money">${money(row.total)}</td></tr>`;
  }).join("");
  const memberRows = report.byMember.map((entry) =>
    `<tr><td>${escapeHtml(entry.name)}</td><td class="num">${entry.count}</td><td class="money">${money(entry.total)}</td></tr>`
  ).join("");
  const reportHtml = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${year} Year-End Report · World Martial Arts Center</title>
        <style>
          body { margin: 0; background: #f4f7f3; color: #183133; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .page { width: min(820px, calc(100vw - 32px)); margin: 24px auto; padding: 46px; background: #fff; border-radius: 14px; box-shadow: 0 18px 48px rgba(29, 54, 49, .08); }
          header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-start; border-bottom: 3px solid #1f6b52; padding-bottom: 24px; }
          img { width: 88px; height: 88px; object-fit: contain; border-radius: 50%; }
          h1 { margin: 0 0 8px; font-family: Georgia, "Times New Roman", serif; font-weight: 500; font-size: 32px; letter-spacing: -.02em; }
          h2 { margin: 32px 0 8px; font-size: 20px; }
          p { margin: 0; color: #687a7b; }
          .meta { text-align: right; color: #687a7b; line-height: 1.45; }
          .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 26px; }
          .totals div { padding: 18px; border: 1px solid #dde5df; border-radius: 12px; background: #f4f7f3; }
          .totals span { display: block; color: #687a7b; font-size: 14px; }
          .totals strong { font-size: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th, td { padding: 12px 10px; border-bottom: 1px solid #dde5df; text-align: left; }
          th { color: #687a7b; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
          .num, .money { text-align: right; }
          tfoot td { border-top: 3px solid #1f6b52; border-bottom: 0; font-weight: 800; font-size: 19px; }
          .note { margin-top: 34px; padding: 18px; border-radius: 12px; background: #e7f2ec; color: #15503e; }
          .actions { width: min(820px, calc(100vw - 32px)); margin: 0 auto 24px; text-align: right; }
          button { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 11px; background: #1f6b52; color: #fff; font-weight: 750; cursor: pointer; }
          @media print {
            body { background: #fff; }
            .page { width: auto; margin: 0; box-shadow: none; border-radius: 0; }
            .actions { display: none; }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <header>
            <div>
              <h1>World Martial Arts Center</h1>
              <p>${year} Year-End Revenue Report · ${year}년 연말 결산 보고서</p>
            </div>
            <div class="meta">
              <img src="${new URL("assets/wmac-logo.jpeg", import.meta.url).href}" alt="World Martial Arts Center logo">
              <div>Generated ${new Date().toLocaleDateString()}</div>
            </div>
          </header>
          <div class="totals">
            <div><span>Total revenue</span><strong>${money(report.totalRevenue)}</strong></div>
            <div><span>Payments received</span><strong>${report.paymentCount}</strong></div>
          </div>
          <h2>Revenue by month</h2>
          <table>
            <thead><tr><th>Month</th><th class="num">Payments</th><th class="money">Amount</th></tr></thead>
            <tbody>${monthRows}</tbody>
            <tfoot><tr><td>Total</td><td class="num">${report.paymentCount}</td><td class="money">${money(report.totalRevenue)}</td></tr></tfoot>
          </table>
          <h2>Revenue by member</h2>
          <table>
            <thead><tr><th>Member</th><th class="num">Payments</th><th class="money">Amount</th></tr></thead>
            <tbody>${memberRows}</tbody>
          </table>
          <div class="note">Totals are grouped by the month each payment was for. Keep this report for tax records.</div>
        </main>
        <div class="actions"><button type="button" onclick="window.print()">Print or save as PDF</button></div>
      </body>
    </html>`;
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return toast("Allow pop-ups to open the report.");
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
}

function exportDailyStatusEmail() {
  const today = new Date();
  const rows = exportDailyPaymentStatusRows(state.store, today);
  if (rows.length === 0) return toast("There is no data to export.");
  const date = today.toISOString().slice(0, 10);
  const filename = `wmac-daily-payment-status-${date}.csv`;
  downloadCsv(toCsv(rows), filename);
  const subject = `WMAC daily payment status - ${date}`;
  const body = [
    "Hello,",
    "",
    "Attached is the daily World Martial Arts Center account and monthly payment-status snapshot.",
    "",
    `File to attach: ${filename}`,
    "",
    "Thank you,",
    "World Martial Arts Center"
  ].join("\r\n");
  toast("Attach the downloaded daily CSV to the email.");
  window.location.href = `mailto:${getDailyStatusEmail()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function exportNextYearRoster() {
  const rows = exportRosterRows(state.store);
  if (rows.length === 0) return toast("There are no active members to export.");
  const nextYear = new Date().getFullYear() + 1;
  downloadCsv(toCsv(rows), `wmac-members-${nextYear}.csv`);
  toast(`Saved ${rows.length} members for the ${nextYear} roster.`);
}

function collectionMember() {
  return state.store.members.find((member) => member.id === state.collectionMemberId);
}

function openCollectionDialog(memberId) {
  const member = state.store.members.find((candidate) => candidate.id === memberId);
  if (!member || member.collectionPlacement?.status === "charged_off") return;
  state.collectionMemberId = memberId;
  state.collectionDraft = createCollectionDraft(member, state.store.payments, new Date(), state.store.members);
  Object.entries(state.collectionDraft).forEach(([name, value]) => {
    const input = el.collectionForm.elements[name];
    if (input && typeof input.value === "string") input.value = value ?? "";
  });
  el.collectionFinalized.checked = false;
  el.collectionMemberLine.textContent = `${member.name} · liable payer ${state.collectionDraft.responsiblePartyName || member.name}`;
  updateCollectionPreview();
  el.collectionDialog.showModal();
}

function readCollectionDraft() {
  const draft = { ...state.collectionDraft };
  [
    "firstName", "lastName", "address", "city", "state", "zip", "dob", "homePhone", "workPhone", "cellPhone",
    "agreementSignDate", "agreementType", "agreementExpirationDate", "chargeOffDate", "serviceFees", "downPayment",
    "emailConsent", "textConsent"
  ].forEach((name) => {
    const input = el.collectionForm.elements[name];
    if (input) draft[name] = input.value;
  });
  draft.serviceFees = Number(draft.serviceFees || 0);
  return draft;
}

function updateCollectionPreview() {
  const member = collectionMember();
  if (!member) return;
  const draft = readCollectionDraft();
  const contract = draft.agreementType === "Contract";
  el.collectionForm.elements.agreementExpirationDate.disabled = !contract;
  el.collectionForm.elements.agreementExpirationDate.required = contract;
  const missing = getCollectionMissingFields(draft, member, state.store.payments);
  el.collectionMissing.textContent = missing.length
    ? `${missing.length} required item${missing.length === 1 ? "" : "s"} remaining: ${missing.join(" · ")}`
    : "All required placement fields are ready.";
  el.collectionMissing.classList.toggle("ready", missing.length === 0);
  let summary = `
    <div><span>Liable payer</span><strong>${escapeHtml(draft.responsiblePartyName || member.name)}</strong></div>
    <div><span>Monthly tuition</span><strong>${money(member.monthlyAmount)}</strong></div>
    <div><span>Late-fee terms</span><strong>${member.lateFeePercentage ?? 5}% or ${money(member.lateFeeMinimum ?? 5)}</strong></div>`;
  if (missing.length === 0) {
    try {
      const preview = buildCollectionPlacement(member, state.store.payments, draft);
      summary += `
        <div><span>Past due</span><strong>${money(preview.pastDueAmount)}</strong></div>
        <div><span>Late fees</span><strong>${money(preview.lateFees)}</strong></div>
        <div class="total"><span>Frozen balance</span><strong>${money(preview.frozenBalance)}</strong></div>`;
    } catch {
      // The missing-field message above stays the source of truth.
    }
  }
  el.collectionSummary.innerHTML = summary;
  const ready = missing.length === 0 && el.collectionFinalized.checked;
  el.collectionSaveButton.disabled = !ready;
  el.collectionSaveEmailButton.disabled = !ready;
}

function finalizeCollection(event, openEmail) {
  event.preventDefault();
  const member = collectionMember();
  if (!member || member.collectionPlacement?.status === "charged_off") return;
  if (!el.collectionForm.reportValidity()) return;
  const draft = readCollectionDraft();
  if (getCollectionMissingFields(draft, member, state.store.payments).length || !el.collectionFinalized.checked) {
    updateCollectionPreview();
    return;
  }
  let placement;
  try {
    placement = buildCollectionPlacement(member, state.store.payments, draft);
  } catch (error) {
    return toast(error.message);
  }
  const filename = collectionPlacementFilename(placement);
  state.store = upsertMember(state.store, {
    ...member,
    inactive: true,
    address: draft.address,
    city: draft.city,
    state: draft.state,
    zip: draft.zip,
    dob: draft.dob,
    homePhone: draft.homePhone,
    workPhone: draft.workPhone,
    cellPhone: draft.cellPhone,
    phone: draft.cellPhone,
    startDate: draft.agreementSignDate,
    agreementEndDate: draft.agreementExpirationDate || defaultAgreementEndDate(draft.agreementSignDate),
    agreementType: draft.agreementType,
    downPayment: draft.downPayment,
    emailConsent: draft.emailConsent,
    textConsent: draft.textConsent,
    collectionInfo: collectionInfoFromDraft(draft),
    collectionPlacement: placement
  });
  saveStore("Collection placement saved");
  downloadBlob(
    new Blob([createFirstCreditServicesWorkbook(placement)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
  el.collectionDialog.close();
  toast(`Saved ${filename}.`);
  render();
  if (openEmail) {
    const email = firstCreditServicesEmailDraft(placement, filename);
    window.location.href = `mailto:${email.to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  }
}

function renderSquareNavBadge() {
  const count = state.squarePayments.filter((payment) => payment.status === "pending" || payment.status === "needs_match").length;
  el.squareNavBadge.textContent = String(count);
  el.squareNavBadge.classList.toggle("hidden", count === 0);
}

async function loadSquarePayments() {
  state.squareLoading = true;
  state.squareError = "";
  if (state.view === "square") renderSquare();
  try {
    const data = window.paymentTrackerProviders
      ? await window.paymentTrackerProviders.list("square")
      : await fetchSquareJson("/api/square/payments");
    state.squareConfigured = Boolean(data.configured);
    state.squarePayments = (data.payments || []).map((payment) => ({
      ...payment,
      provider: "square",
      suggestedMemberId: payment.suggestedMemberId || suggestedPaymentMember(payment, state.store.members)?.id || ""
    })).sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt)));
    state.squareLoaded = true;
    if (!state.squareSelectedId) {
      state.squareSelectedId = state.squarePayments.find((payment) => payment.status === "pending" || payment.status === "needs_match")?.id
        || state.squarePayments[0]?.id
        || "";
    }
  } catch (error) {
    state.squareError = error.message || "Square could not be reached.";
    state.squareConfigured = false;
    state.squareLoaded = true;
  } finally {
    state.squareLoading = false;
    render();
  }
}

async function syncSquarePayments() {
  if (state.squareLoading) return;
  state.squareLoading = true;
  state.squareError = "";
  renderSquare();
  try {
    const data = window.paymentTrackerProviders
      ? await window.paymentTrackerProviders.sync("square")
      : await fetchSquareJson("/api/square/sync", { method: "POST" });
    state.squareConfigured = Boolean(data.configured);
    state.squarePayments = (data.payments || []).map((payment) => ({ ...payment, provider: "square" }))
      .sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt)));
    state.squareLoaded = true;
    state.squareSelectedId = state.squarePayments.find((payment) => payment.status === "pending" || payment.status === "needs_match")?.id
      || state.squarePayments[0]?.id
      || "";
    toast(`Square sync complete — ${data.imported || 0} payment${Number(data.imported || 0) === 1 ? "" : "s"} checked.`);
  } catch (error) {
    state.squareError = error.message || "Square sync failed.";
    toast(state.squareError);
  } finally {
    state.squareLoading = false;
    render();
  }
}

function renderSquare() {
  const pending = state.squarePayments.filter((payment) => payment.status === "pending" || payment.status === "needs_match");
  const approved = state.squarePayments.filter((payment) => payment.status === "approved");
  el.squarePendingCount.textContent = String(pending.length);
  el.squareMatchCount.textContent = String(state.squarePayments.filter((payment) => payment.status === "needs_match").length);
  el.squareApprovedCount.textContent = String(approved.length);
  el.squareConnectionStatus.textContent = state.squareLoading
    ? "Syncing…"
    : state.squareError
      ? "Needs attention"
      : state.squareConfigured
        ? "Ready"
        : "Not configured";
  el.squareConnectionStatus.classList.toggle("ready", state.squareConfigured && !state.squareError);
  el.syncSquareButton.disabled = state.squareLoading;
  el.squareEmptySyncButton.disabled = state.squareLoading;
  el.syncSquareLabel.textContent = state.squareLoading ? "Syncing…" : "Sync Square";

  const showEmpty = state.squarePayments.length === 0;
  el.squareEmpty.classList.toggle("hidden", !showEmpty);
  el.squareWorkspace.classList.toggle("hidden", showEmpty);
  if (showEmpty) {
    const emptyTitle = el.squareEmpty.querySelector("h2");
    const emptyCopy = el.squareEmpty.querySelector("p");
    if (emptyTitle) emptyTitle.textContent = state.squareError ? "Square connection needs attention" : "No Square payments waiting";
    if (emptyCopy) emptyCopy.textContent = state.squareError || "Sync Square to check for new completed payments.";
    return;
  }

  const selected = selectedSquarePayment();
  el.squareQueue.innerHTML = state.squarePayments.map((payment) => squareQueueMarkup(payment)).join("");
  el.squareDetail.innerHTML = selected ? squareDetailMarkup(selected) : `<div class="empty-message">Choose a Square payment.</div>`;
  bindSquareEvents();
}

function selectedSquarePayment() {
  const selected = state.squarePayments.find((payment) => payment.id === state.squareSelectedId)
    || state.squarePayments.find((payment) => payment.status === "pending" || payment.status === "needs_match")
    || state.squarePayments[0]
    || null;
  state.squareSelectedId = selected?.id || "";
  return selected;
}

function squarePaymentMember(payment) {
  return state.store.members.find((member) => member.id === (payment.memberId || payment.suggestedMemberId))
    || suggestedPaymentMember(payment, state.store.members);
}

function squareStatusLabel(status) {
  if (status === "approved") return "Confirmed";
  if (status === "ignored") return "Ignored";
  if (status === "needs_match") return "Needs member";
  return "Waiting";
}

function squareQueueMarkup(payment) {
  const member = squarePaymentMember(payment);
  const details = [dateLabel(payment.paidAt || payment.createdAt, ""), payment.receiptNumber ? `Receipt ${payment.receiptNumber}` : ""].filter(Boolean).join(" · ");
  return `
    <button class="square-queue-item ${payment.id === state.squareSelectedId ? "active" : ""}" type="button" data-square-select="${escapeAttr(payment.id)}">
      <span class="square-queue-top"><strong>${money(Number(payment.amountCents || 0) / 100)}</strong><span class="square-logo-pill">SQUARE</span></span>
      <strong>${escapeHtml(member?.name || payment.buyerName || "Choose a member")}</strong>
      <small>${escapeHtml(details || payment.buyerEmail || "No customer details")}</small>
      <span class="square-state ${escapeAttr(payment.status)}">${escapeHtml(squareStatusLabel(payment.status))}</span>
    </button>`;
}

function squareDetailMarkup(payment) {
  const member = squarePaymentMember(payment);
  const memberId = payment.memberId || payment.suggestedMemberId || member?.id || "";
  const month = stagedPaymentMonth(payment) || currentMonthKey();
  const monthCount = Number(payment.monthCount) || 1;
  const completed = payment.status === "approved" || payment.status === "ignored";
  const recommendedMonth = member
    ? nextUnpaidTuitionMonth(member, state.store.payments, squarePaymentDate(payment), state.store.members)
    : "";
  const options = [
    `<option value="">Choose a member</option>`,
    ...state.store.members.filter((candidate) => !candidate.inactive)
      .map((candidate) => `<option value="${escapeAttr(candidate.id)}" ${candidate.id === memberId ? "selected" : ""}>${escapeHtml(candidate.name || "New member")}</option>`)
  ].join("");
  
  const squareAmount = Number(payment.amountCents || 0) / 100;
  const monthlyAmount = Number(member?.monthlyAmount || 0);
  const monthsHint = monthCount > 1 && monthlyAmount > 0
    ? `${monthCount} months × ${money(monthlyAmount)} = ${money(monthCount * monthlyAmount)}${Math.abs(squareAmount - monthCount * monthlyAmount) > 0.01 ? ` (payment is ${money(squareAmount)})` : ""}`
    : "";
  
  return `
    <div class="square-detail-inner">
      <div class="square-detail-head">
        <div>
          <p class="eyebrow">Square payment</p>
          <h2>${money(squareAmount)}</h2>
          <p>${escapeHtml([payment.buyerName, payment.buyerEmail, payment.receiptNumber ? `Receipt ${payment.receiptNumber}` : ""].filter(Boolean).join(" · ") || "No customer details supplied")}</p>
        </div>
        <span class="square-state ${escapeAttr(payment.status)}">${escapeHtml(squareStatusLabel(payment.status))}</span>
      </div>
      <div class="square-confirmation-form">
        <label><span>Member</span><select data-square-member="${escapeAttr(payment.id)}" ${completed ? "disabled" : ""}>${options}</select></label>
        <label><span>Starting month</span><input data-square-month="${escapeAttr(payment.id)}" type="month" value="${escapeAttr(month)}" ${completed ? "disabled" : ""}></label>
        <label><span>Number of months</span><input data-square-month-count="${escapeAttr(payment.id)}" type="number" min="1" max="24" value="${escapeAttr(monthCount)}" ${completed ? "disabled" : ""}></label>
        <label class="full"><span>Note <small>optional</small></span><input data-square-note="${escapeAttr(payment.id)}" type="text" value="${escapeAttr(payment.reviewNote || "")}" placeholder="Gear, testing, special payment…" ${completed ? "disabled" : ""}></label>
        <div class="square-recommendation">${member ? `Recommended: apply to ${escapeHtml(formatMonthEn(recommendedMonth))}, the next unpaid tuition month.${monthsHint ? ` ${monthsHint}` : ""}` : "Choose the member this payment belongs to."}</div>
      </div>
      <div class="square-detail-actions">
        <button class="button secondary danger-link" type="button" data-square-ignore="${escapeAttr(payment.id)}" ${completed ? "disabled" : ""}>Ignore</button>
        <button class="button secondary" type="button" data-square-other="${escapeAttr(payment.id)}" ${!memberId || completed ? "disabled" : ""}>Confirm as other sale</button>
        <button class="button primary" type="button" data-square-tuition="${escapeAttr(payment.id)}" ${!memberId || completed ? "disabled" : ""}>Confirm tuition</button>
      </div>
    </div>`;
}

function bindSquareEvents() {
  el.squareQueue.querySelectorAll("[data-square-select]").forEach((button) =>
    button.addEventListener("click", () => {
      state.squareSelectedId = button.dataset.squareSelect;
      renderSquare();
    })
  );
  el.squareDetail.querySelectorAll("[data-square-member]").forEach((select) =>
    select.addEventListener("change", () => updateSquareDraft(select.dataset.squareMember, { memberId: select.value, suggestedMemberId: select.value }))
  );
  el.squareDetail.querySelectorAll("[data-square-month]").forEach((input) =>
    input.addEventListener("change", () => updateSquareDraft(input.dataset.squareMonth, { paymentMonth: input.value }))
  );
  el.squareDetail.querySelectorAll("[data-square-month-count]").forEach((input) =>
    input.addEventListener("change", () => {
      const count = Math.max(1, Math.min(24, Number(input.value) || 1));
      input.value = String(count);
      updateSquareDraft(input.dataset.squareMonthCount, { monthCount: count });
    })
  );
  el.squareDetail.querySelectorAll("[data-square-note]").forEach((input) => {
    input.addEventListener("input", () => updateSquareDraft(input.dataset.squareNote, { reviewNote: input.value }, false));
    input.addEventListener("change", () => saveSquareStatus(input.dataset.squareNote, { reviewNote: input.value }));
  });
  el.squareDetail.querySelectorAll("[data-square-tuition]").forEach((button) =>
    button.addEventListener("click", () => confirmSquarePayment(button.dataset.squareTuition, "tuition"))
  );
  el.squareDetail.querySelectorAll("[data-square-other]").forEach((button) =>
    button.addEventListener("click", () => confirmSquarePayment(button.dataset.squareOther, "one-off"))
  );
  el.squareDetail.querySelectorAll("[data-square-ignore]").forEach((button) =>
    button.addEventListener("click", () => ignoreSquarePayment(button.dataset.squareIgnore))
  );
}

function updateSquareDraft(paymentId, patch, rerender = true) {
  state.squarePayments = state.squarePayments.map((payment) =>
    payment.id === paymentId ? { 
      ...payment, 
      status: patch.memberId && payment.status === "needs_match" ? "pending" : payment.status,
      ...patch 
    } : payment
  );
  if (rerender) renderSquare();
}

async function confirmSquarePayment(paymentId, category) {
  const payment = state.squarePayments.find((item) => item.id === paymentId);
  const member = payment && squarePaymentMember(payment);
  if (!payment || !member) return toast("Choose a member first.");
  const squareStatus = String(payment.squareStatus || payment.providerStatus || "").toUpperCase();
  if (squareStatus && squareStatus !== "COMPLETED") return toast("Only completed Square payments can be confirmed.");
  const payer = payerFor(member);
  const startMonth = stagedPaymentMonth(payment) || nextUnpaidTuitionMonth(member, state.store.payments, squarePaymentDate(payment), state.store.members);
  const monthCount = Math.max(1, Math.min(24, Number(payment.monthCount) || 1));
  const totalAmount = Number(payment.amountCents || 0) / 100;
  const priorStore = state.store;
  
  // For multi-month tuition, create a batch of payments across consecutive months
  let nextStore = state.store;
  // Use Square payment ID as batch ID to link multi-month payments together
  const batchId = monthCount > 1 ? `multi-${paymentId}` : "";
  
  for (let i = 0; i < monthCount; i++) {
    const currentMonth = i === 0 ? startMonth : shiftMonth(startMonth, i);
    // Distribute amount evenly across months, with any remainder in the first month
    const baseAmount = Math.floor((totalAmount * 100) / monthCount) / 100;
    const remainder = i === 0 ? totalAmount - (baseAmount * monthCount) : 0;
    const monthAmount = baseAmount + remainder;
    
    nextStore = addPayment(nextStore, {
      memberId: category === "tuition" ? payer.id : member.id,
      month: currentMonth,
      amount: monthAmount,
      paidAt: payment.paidAt || todayKey(),
      source: "square",
      category,
      note: payment.reviewNote || (category === "one-off" ? "Square other sale" : ""),
      squarePaymentId: payment.squarePaymentId || payment.id,
      providerPaymentId: payment.providerPaymentId || payment.squarePaymentId || payment.id,
      paymentProvider: "square",
      batchId
    });
  }
  
  state.store = nextStore;
  const saved = await saveSquareStatus(paymentId, {
    status: "approved",
    memberId: category === "tuition" ? payer.id : member.id,
    suggestedMemberId: category === "tuition" ? payer.id : member.id,
    paymentMonth: startMonth,
    paymentCategory: category,
    reviewNote: payment.reviewNote || "",
    monthCount
  });
  if (!saved) {
    state.store = priorStore;
    return;
  }
  saveStore("Square payment confirmed");
  const monthLabel = monthCount > 1 ? `${monthCount} months starting ${formatMonthEn(startMonth)}` : formatMonthEn(startMonth);
  toast(`${money(totalAmount)} confirmed for ${member.name} (${monthLabel}).`);
  render();
}

async function ignoreSquarePayment(paymentId) {
  if (!window.confirm("Ignore this Square payment?")) return;
  const saved = await saveSquareStatus(paymentId, { status: "ignored", ignoredReason: "manual-review" });
  if (saved) {
    toast("Square payment ignored.");
    render();
  }
}

async function saveSquareStatus(paymentId, patch) {
  const prior = state.squarePayments.find((payment) => payment.id === paymentId);
  updateSquareDraft(paymentId, patch, false);
  try {
    const data = window.paymentTrackerProviders
      ? await window.paymentTrackerProviders.updateStatus("square", paymentId, patch)
      : await fetchSquareJson("/api/square/payments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, ...patch })
      });
    if (data.payment) updateSquareDraft(paymentId, data.payment, false);
    return true;
  } catch (error) {
    if (prior) updateSquareDraft(paymentId, prior, false);
    toast(error.message || "Could not save the Square confirmation.");
    return false;
  }
}

async function saveSquareSettings() {
  if (!window.paymentTrackerProviders?.saveSquareRelay) {
    el.squareSettingsStatus.textContent = "Set Square relay values in the server environment for browser use.";
    return;
  }
  el.saveSquareSettingsButton.disabled = true;
  try {
    const result = await window.paymentTrackerProviders.saveSquareRelay({
      baseUrl: el.squareRelayUrl.value,
      token: el.squareRelayToken.value
    });
    state.squareConfigured = Boolean(result.configured);
    el.squareRelayToken.value = "";
    el.squareSettingsStatus.textContent = result.configured ? "Square connection saved." : "Square connection cleared.";
    await loadSquarePayments();
  } catch (error) {
    el.squareSettingsStatus.textContent = error.message || "Could not save Square settings.";
  } finally {
    el.saveSquareSettingsButton.disabled = false;
  }
}

async function loadSquareSettings() {
  if (!window.paymentTrackerProviders?.getSettings) return;
  try {
    const settings = await window.paymentTrackerProviders.getSettings();
    el.squareRelayUrl.value = settings.squareRelayBaseUrl || "";
    state.squareConfigured = Boolean(settings.squareRelayConfigured || settings.squareDirectConfigured);
  } catch {
    // The confirmation page will show the connection error when it loads payments.
  }
}

async function fetchSquareJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Square request failed.");
  return data;
}

function squarePaymentDate(payment) {
  const value = payment.paidAt || payment.createdAt;
  const parsed = value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toggleRecordPayments() {
  const member = selectedMember();
  if (!member) return;
  if (el.recordPaymentButton.dataset.openPayer) return openMember(el.recordPaymentButton.dataset.openPayer);
  state.calendarOpen = !state.calendarOpen;
  renderMember();
}

function calendarCellLabel(month) {
  if (month.prepaid) return "Down payment";
  if (month.paid) return "✓ Paid";
  if (month.state === "behind") return `${month.daysLate} days late`;
  if (month.state === "attention") return "Due";
  if (month.state === "pending") return "Card pending";
  return "Upcoming";
}

function renderPaymentCalendar(member, status = accountPaymentState(member), balance = accountBalance(member)) {
  const disabled = balance.monthlyAmount <= 0;
  el.paymentCalendarGrid.innerHTML = status.months.map((month) => `
    <button class="calendar-month ${month.prepaid ? "prepaid" : month.paid ? "paid" : month.state}" type="button"
      data-calendar-month="${escapeAttr(month.month)}" ${month.prepaid || disabled ? "disabled" : ""}
      title="${month.prepaid ? "Covered by the contract down payment" : month.paid ? "Click to un-record this payment" : "Click to record this payment"}"
      aria-label="${escapeAttr(`${formatMonthEn(month.month)}: ${month.prepaid ? "covered by down payment" : month.paid ? "un-record payment" : "record payment"}`)}">
      <strong>${escapeHtml(shortMonth(month.month))}</strong>
      <span>${escapeHtml(calendarCellLabel(month))}</span>
    </button>`).join("");
  el.paymentCalendarGrid.querySelectorAll("[data-calendar-month]").forEach((button) =>
    button.addEventListener("click", () => toggleCalendarMonth(button.dataset.calendarMonth))
  );
}

function toggleCalendarMonth(monthKey) {
  const member = selectedMember();
  if (!member) return;
  applyMonthToggle(member.id, monthKey);
}

function toggleLandscapeMonth(memberId, monthKey) {
  applyMonthToggle(memberId, monthKey);
}

function applyMonthToggle(memberId, monthKey) {
  const member = state.store.members.find((candidate) => candidate.id === memberId);
  if (!member) return;
  if (!isPayer(member)) return toast(`Record payments on ${payerFor(member).name}'s account.`);
  const result = toggleMemberMonthPayment(state.store, member.id, monthKey);
  if (!result.changed) {
    if (accountPaymentState(member).prepaidMonths.has(monthKey)) return toast("That month is covered by the contract down payment.");
    if (accountBalance(member).monthlyAmount <= 0) return toast("Add the monthly tuition amount first.");
    return;
  }
  state.store = result.store;
  if (result.action === "unpaid") {
    saveStore("Payment removed");
    toast(`${formatMonthEn(monthKey)} marked unpaid.`);
  } else {
    saveStore("Payment recorded");
    toast(`${formatMonthEn(monthKey)} payment recorded.`);
  }
  render();
}

function openPaymentDialog() {
  const member = selectedMember();
  if (!member || !isPayer(member)) return;
  const status = accountPaymentState(member);
  el.paymentMonth.value = status.dueUnpaidMonths[0]?.month || status.currentMonth || currentMonthKey();
  el.paymentAmount.value = accountBalance(member).monthlyAmount || "";
  el.paymentDate.value = todayKey();
  el.paymentNote.value = "";
  el.paymentMenu.classList.add("hidden");
  el.paymentDialog.showModal();
}

function saveCustomPayment(event) {
  event.preventDefault();
  const member = selectedMember();
  if (!member || !isPayer(member)) return;
  state.store = addPayment(state.store, {
    memberId: member.id,
    month: el.paymentMonth.value,
    amount: el.paymentAmount.value,
    paidAt: el.paymentDate.value,
    note: el.paymentNote.value,
    source: "simple-desk"
  });
  saveStore("Payment recorded");
  el.paymentDialog.close();
  toast("Payment recorded.");
  render();
}

function catchUpPayments() {
  const member = selectedMember();
  if (!member || !isPayer(member)) return;
  const status = accountPaymentState(member);
  const amount = accountBalance(member).monthlyAmount;
  if (!status.dueUnpaidMonths.length || amount <= 0) return;
  status.dueUnpaidMonths.forEach(({ month }) => {
    state.store = addPayment(state.store, { memberId: member.id, month, amount, paidAt: todayKey(), source: "simple-desk-catch-up" });
  });
  saveStore("Past-due payments recorded");
  toast(`${status.dueUnpaidMonths.length} payment${status.dueUnpaidMonths.length === 1 ? "" : "s"} recorded and saved.`);
  render();
}

function sendReminder() {
  const member = selectedMember();
  if (!member) return;
  const payer = payerFor(member);
  const balance = getLateFeeBalance(payer, state.store.payments, new Date(), state.store.members);
  if (!payer.email || !balance.lines.length) return;
  const email = buildReminderEmail(payer, balance);
  window.location.href = `mailto:${payer.email}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  el.paymentMenu.classList.add("hidden");
}

function generateInvoice() {
  const member = selectedMember();
  if (!member || !isPayer(member)) return;
  const payer = payerFor(member);
  el.paymentMenu.classList.add("hidden");
  const balance = getLateFeeBalance(payer, state.store.payments, new Date(), state.store.members);
  if (!balance.lines.length) return toast("Nothing is currently due.");
  const rows = balance.lines.map((line) => `
    <tr>
      <td>${escapeHtml(formatMonthEn(line.month))}</td>
      <td>Monthly training tuition · 월 회비</td>
      <td class="money">${money(line.amount)}</td>
      <td class="money">${line.lateFee > 0 ? money(line.lateFee) : "—"}</td>
      <td class="money">${money(line.total)}</td>
    </tr>`).join("");
  const contactLines = [payer.parentName && `Parent/guardian: ${payer.parentName}`, payer.cellPhone || payer.phone, payer.email]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
  const invoiceHtml = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Invoice · ${escapeHtml(payer.name)}</title>
        <style>
          body { margin: 0; background: #f4f7f3; color: #183133; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          .page { width: min(820px, calc(100vw - 32px)); margin: 24px auto; padding: 46px; background: #fff; border-radius: 14px; box-shadow: 0 18px 48px rgba(29, 54, 49, .08); }
          header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-start; border-bottom: 3px solid #1f6b52; padding-bottom: 24px; }
          img { width: 88px; height: 88px; object-fit: contain; border-radius: 50%; }
          h1 { margin: 0 0 8px; font-family: Georgia, "Times New Roman", serif; font-weight: 500; font-size: 32px; letter-spacing: -.02em; }
          h2 { margin: 28px 0 8px; font-size: 19px; }
          p { margin: 0; color: #687a7b; }
          .meta { text-align: right; color: #687a7b; line-height: 1.45; }
          .billto { line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 22px; }
          th, td { padding: 14px 10px; border-bottom: 1px solid #dde5df; text-align: left; }
          th { color: #687a7b; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
          .money { text-align: right; }
          .total { display: flex; justify-content: flex-end; margin-top: 24px; font-size: 23px; font-weight: 800; }
          .note { margin-top: 34px; padding: 18px; border-radius: 12px; background: #e7f2ec; color: #15503e; }
          .actions { width: min(820px, calc(100vw - 32px)); margin: 0 auto 24px; text-align: right; }
          button { min-height: 44px; padding: 10px 18px; border: 0; border-radius: 11px; background: #1f6b52; color: #fff; font-weight: 750; cursor: pointer; }
          @media print {
            body { background: #fff; }
            .page { width: auto; margin: 0; box-shadow: none; border-radius: 0; }
            .actions { display: none; }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <header>
            <div>
              <h1>World Martial Arts Center</h1>
              <p>Member tuition invoice · 회비 청구서</p>
            </div>
            <div class="meta">
              <img src="${new URL("assets/wmac-logo.jpeg", import.meta.url).href}" alt="World Martial Arts Center logo">
              <div>Invoice date: ${new Date().toLocaleDateString()}</div>
            </div>
          </header>
          <section class="billto">
            <h2>Bill to</h2>
            <strong>${escapeHtml(payer.name)}</strong>
            ${contactLines}
          </section>
          <section>
            <h2>Amount due</h2>
            <table>
              <thead>
                <tr><th>Month</th><th>Description</th><th class="money">Tuition</th><th class="money">Late fee</th><th class="money">Amount</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="total">Total due: ${money(balance.totalDue)}</div>
          </section>
          <div class="note">Please bring this account current at your next class, or contact the front desk if a payment was already made.</div>
        </main>
        <div class="actions"><button type="button" onclick="window.print()">Print or save as PDF</button></div>
      </body>
    </html>`;
  const invoiceWindow = window.open("", "_blank");
  if (!invoiceWindow) return toast("Allow pop-ups to open the invoice.");
  invoiceWindow.document.write(invoiceHtml);
  invoiceWindow.document.close();
}

async function setUpSquareMonthlyInvoice() {
  const member = selectedMember();
  if (!member) return;
  const payer = payerFor(member);
  el.paymentMenu.classList.add("hidden");
  if (payer.id !== member.id) return toast(`Set up Square monthly invoices on ${payer.name}'s payer account.`);
  const balance = accountBalance(member);
  const startDate = squareInvoiceStartDate(payer, new Date(), balance.monthlyAmount);
  if (!payer.email || !startDate || balance.monthlyAmount <= 0) {
    return toast("Save the payer email, contract date, and monthly amount before Square setup.");
  }
  if (["ACTIVE", "PENDING"].includes(String(payer.squareMonthlyInvoice?.status || "").toUpperCase())) {
    return toast("A Square monthly invoice is already set up for this payer.");
  }
  el.squareRecurringButton.disabled = true;
  try {
    const payload = {
      memberId: payer.id,
      name: payer.name,
      email: payer.email,
      phone: payer.cellPhone || payer.phone || "",
      squareCustomerId: payer.squareCustomerId || "",
      amount: balance.monthlyAmount,
      startDate,
      cancelDate: squareInvoiceCancelDate(payer, startDate, balance.monthlyAmount)
    };
    const result = window.paymentTrackerProviders
      ? await window.paymentTrackerProviders.createSquareMonthlyInvoice(payload)
      : await fetchSquareJson("/api/square/subscriptions/monthly-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    state.store = upsertMember(state.store, {
      ...payer,
      squareCustomerId: result.customerId || payer.squareCustomerId,
      squareMonthlyInvoice: {
        subscriptionId: result.subscription?.id || "",
        status: result.subscription?.status || "PENDING",
        startDate: result.subscription?.start_date || startDate,
        cancelDate: result.subscription?.canceled_date || payload.cancelDate || "",
        monthlyAmount: balance.monthlyAmount,
        createdAt: result.subscription?.created_at || new Date().toISOString()
      }
    });
    saveStore("Square monthly invoice set up");
    toast(`Square will email ${payer.email} a monthly payment link starting ${startDate}.`);
  } catch (error) {
    toast(error.message || "Square monthly invoice setup failed.");
  } finally {
    render();
  }
}

function squareInvoiceStartDate(member, today = new Date(), monthlyAmount = Number(member?.monthlyAmount || 0)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(member?.startDate || ""))) return "";
  const [year, month, day] = member.startDate.split("-").map(Number);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const signingDate = new Date(year, month - 1, day);
  let candidate = signingDate > todayDate
    ? signingDate
    : dateWithDueDay(today.getFullYear(), today.getMonth() + 1, day);
  if (candidate < todayDate) candidate = dateWithDueDay(today.getFullYear(), today.getMonth() + 2, day);
  if (contractEndpointsPrepaid(member, monthlyAmount) && monthKeyFromDate(candidate) === member.startDate.slice(0, 7)) {
    candidate = dateWithDueDay(candidate.getFullYear(), candidate.getMonth() + 2, day);
  }
  const result = isoLocalDate(candidate);
  if (member.agreementType === "Contract" && member.agreementEndDate && result >= member.agreementEndDate) return "";
  return result;
}

function squareInvoiceCancelDate(member, startDate, monthlyAmount = Number(member?.monthlyAmount || 0)) {
  if (member.agreementType !== "Contract" || !/^\d{4}-\d{2}-\d{2}$/.test(String(member.agreementEndDate || ""))) return "";
  const dueDay = Number(member.startDate?.slice(8, 10)) || 1;
  const end = member.agreementEndDate;
  const cancelDate = contractEndpointsPrepaid(member, monthlyAmount)
    ? isoLocalDate(dateWithDueDay(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, dueDay))
    : end;
  return cancelDate > startDate ? cancelDate : "";
}

function contractEndpointsPrepaid(member, monthlyAmount) {
  return member?.agreementType === "Contract" &&
    Number(monthlyAmount || 0) > 0 &&
    Number(member.downPayment || 0) + 0.005 >= Number(monthlyAmount) * 2;
}

function dateWithDueDay(year, month, dueDay) {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(dueDay, lastDay));
}

function isoLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function groupEmailMembers() {
  return state.store.members
    .filter((member) => !member.inactive && memberEmailList(member).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function memberEmailList(member) {
  return String(member.email || "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function openGroupEmailDialog() {
  const members = groupEmailMembers();
  if (!members.length) return toast("No active members have email addresses.");
  el.groupEmailSubject.value = "World Martial Arts Center";
  el.groupEmailMembers.innerHTML = members.map((member) => `
    <label class="group-email-member">
      <input type="checkbox" value="${escapeAttr(member.id)}" checked>
      <span><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(memberEmailList(member).join(", "))}</small></span>
    </label>`).join("");
  updateGroupEmailHelp();
  el.groupEmailDialog.showModal();
}

function selectedGroupEmailMembers() {
  const selectedIds = new Set(
    Array.from(el.groupEmailMembers.querySelectorAll("input[type='checkbox']:checked")).map((input) => input.value)
  );
  return groupEmailMembers().filter((member) => selectedIds.has(member.id));
}

function setAllGroupEmailMembers(checked) {
  el.groupEmailMembers.querySelectorAll("input[type='checkbox']").forEach((input) => { input.checked = checked; });
  updateGroupEmailHelp();
}

function updateGroupEmailHelp() {
  const total = el.groupEmailMembers.querySelectorAll("input[type='checkbox']").length;
  const checked = el.groupEmailMembers.querySelectorAll("input[type='checkbox']:checked").length;
  el.groupEmailHelp.textContent = `${checked} of ${total} members with email selected.`;
  el.openGroupEmailButton.disabled = checked === 0;
}

function openGroupEmail() {
  const members = selectedGroupEmailMembers();
  if (!members.length) return toast("Select at least one member.");
  const seen = new Set();
  const emails = members.flatMap(memberEmailList).filter((email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const subject = el.groupEmailSubject.value.trim() || "World Martial Arts Center";
  el.groupEmailDialog.close();
  window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(subject)}`;
}

function removePaymentById(paymentId) {
  const payment = state.store.payments.find((item) => item.id === paymentId);
  if (!payment) return;
  if (!window.confirm(`Mark ${formatMonthEn(payment.month)} unpaid?`)) return;
  state.store = { ...state.store, payments: state.store.payments.filter((item) => item.id !== paymentId) };
  saveStore("Payment removed");
  toast("Payment marked unpaid.");
  render();
}

function addMember() {
  const member = {
    id: "",
    name: "",
    startDate: todayKey(),
    agreementEndDate: defaultAgreementEndDate(todayKey()),
    agreementType: "Contract",
    monthlyAmount: 0,
    participant: true,
    householdRole: "adult",
    programs: [],
    inactive: false
  };
  state.store = upsertMember(state.store, member);
  const created = state.store.members.find((candidate) => !candidate.name) || state.store.members.at(-1);
  saveStore("New member added");
  openMember(created.id);
  openEditor("profile");
}

function openEditor(mode) {
  const member = selectedMember();
  if (!member) return;
  state.editorMode = mode;
  const payer = payerFor(member);
  const configs = {
    profile: {
      eyebrow: "Member · 회원",
      title: member.name ? "Edit member" : "Add a new member",
      help: "Keep the essentials together. More details can be added later.",
      fields: [
        field("Name", "name", member.name, "text", true, "full"),
        field("Birthday", "dob", member.dob, "date"),
        householdField("Family / household name", member.householdName),
        selectField("Family role", "householdRole", member.householdRole || "adult", [["adult", "Adult"], ["parent", "Parent / guardian"], ["child", "Child"]]),
        checkboxField("Participates in classes", "participant", member.participant !== false)
      ]
    },
    bio: {
      eyebrow: "Biographical info · 회원 정보",
      title: "Contact details",
      help: "Information you use to contact and identify this member.",
      fields: [
        field("Cell phone", "cellPhone", member.cellPhone || member.phone, "tel"),
        field("Email", "email", member.email, "email"),
        field("Birthday", "dob", member.dob, "date"),
        field("Street address", "address", member.address, "text", false, "full"),
        field("City", "city", member.city),
        field("State", "state", member.state),
        field("ZIP code", "zip", member.zip)
      ]
    },
    contract: {
      eyebrow: "Contract · 계약",
      title: isPayer(member) ? "Membership contract" : `${payer.name}'s contract`,
      help: isPayer(member) ? "The contract dates and monthly tuition drive payment status." : "This family member uses the responsible payer's contract.",
      fields: [
        field("Contract signed", "startDate", payer.startDate, "date", true),
        field("Contract ends", "agreementEndDate", payer.agreementEndDate, "date"),
        moneyField("Monthly tuition", "monthlyAmount", payer.monthlyAmount),
        moneyField("Contract down payment", "downPayment", payer.downPayment),
        selectField("Agreement type", "agreementType", payer.agreementType || "Contract", [["Contract", "Annual contract"], ["Month-to-Month", "Month-to-month"]])
      ]
    },
    family: {
      eyebrow: "Family · 가족",
      title: "Family structure",
      help: "Pick an existing household from the list or type a new name. Households are named after the responsible payer's full name, so shared last names stay separate.",
      fields: [
        householdField("Family / household name", member.householdName, "full"),
        selectField("Family role", "householdRole", member.householdRole || "adult", [["adult", "Adult"], ["parent", "Parent / guardian"], ["child", "Child"]]),
        selectField("Responsible payer", "responsiblePartyId", payer.id, state.store.members.filter((candidate) => !candidate.inactive).map((candidate) => [candidate.id, candidate.name || "New member"])),
        checkboxField("Participates in classes", "participant", member.participant !== false)
      ]
    },
    training: {
      eyebrow: "Training · 수련",
      title: "Programs & certification",
      help: "White → Yellow → Green → Blue → Red, three tips per belt. Black-belt tip cycles advance the Dan stripe.",
      fields: [
        checkboxField("Tae Kwon Do", "programTaeKwonDo", (member.programs || []).includes("tae_kwon_do")),
        checkboxField("Muay Thai", "programMuayThai", (member.programs || []).includes("muay_thai")),
        selectField("Tae Kwon Do certification", "certTaeKwonDo", normalizeMemberCertifications(member).tae_kwon_do, [["", "Not set"], ...CERTIFICATION_LEVELS.map((level) => [level, level])]),
        selectField("Muay Thai certification", "certMuayThai", normalizeMemberCertifications(member).muay_thai, [["", "Not set"], ...MUAY_THAI_LEVELS.map((level) => [level, level])])
      ]
    }
  };
  const config = configs[mode];
  el.editorEyebrow.textContent = config.eyebrow;
  el.editorTitle.textContent = config.title;
  el.editorHelp.textContent = config.help;
  el.editorFields.innerHTML = config.fields.join("");
  if (mode === "contract" && !isPayer(member)) {
    el.editorFields.querySelectorAll("input, select").forEach((input) => { input.disabled = true; });
  }
  if (mode === "family") {
    // Choosing a payer names the household after that person's full name
    // when the name field is still blank.
    const payerSelect = el.editorFields.querySelector("[name='responsiblePartyId']");
    const householdInput = el.editorFields.querySelector("[name='householdName']");
    payerSelect?.addEventListener("change", () => {
      if (householdInput.value.trim()) return;
      const chosen = state.store.members.find((candidate) => candidate.id === payerSelect.value);
      if (chosen?.name) householdInput.value = `${chosen.name} family`;
    });
  }
  el.editorDialog.showModal();
  el.editorFields.querySelector("input:not([type='checkbox']):not(:disabled)")?.focus();
}

function closeEditor() {
  if (!selectedMember()?.name && state.editorMode === "profile") return;
  el.editorDialog.close();
}

function saveEditor(event) {
  event.preventDefault();
  const member = selectedMember();
  if (!member) return;
  const values = Object.fromEntries(new FormData(el.editorForm).entries());
  if (state.editorMode === "profile" || state.editorMode === "family") {
    values.participant = Boolean(el.editorForm.querySelector("[name='participant']")?.checked);
  }
  if (state.editorMode === "contract" && !isPayer(member)) return;
  const target = state.editorMode === "contract" ? payerFor(member) : member;
  const next = { ...target, ...values };
  if (state.editorMode === "contract") {
    next.monthlyAmount = Number(values.monthlyAmount || 0);
    next.downPayment = values.downPayment === "" ? "" : Number(values.downPayment || 0);
    if (values.agreementType === "Month-to-Month") next.agreementEndDate = "";
  }
  if (state.editorMode === "family") {
    const responsible = state.store.members.find((candidate) => candidate.id === values.responsiblePartyId);
    next.parentName = responsible && responsible.id !== member.id ? responsible.name : "";
  }
  if (state.editorMode === "training") {
    next.programs = [
      values.programTaeKwonDo ? "tae_kwon_do" : "",
      values.programMuayThai ? "muay_thai" : ""
    ].filter(Boolean);
    next.certifications = {
      tae_kwon_do: values.certTaeKwonDo || "",
      muay_thai: values.certMuayThai || "",
      legacyLabel: normalizeMemberCertifications(member).legacyLabel
    };
    next.beltLevel = values.certTaeKwonDo || values.certMuayThai || "";
    next.nextLevel = nextMemberCertification(next);
    delete next.programTaeKwonDo;
    delete next.programMuayThai;
    delete next.certTaeKwonDo;
    delete next.certMuayThai;
  }
  state.store = upsertMember(state.store, next);
  saveStore("Member information saved");
  el.editorDialog.close();
  toast("Changes saved.");
  render();
}

function field(label, name, value = "", type = "text", required = false, className = "") {
  return `<label class="${className}"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeAttr(value)}" ${required ? "required" : ""}></label>`;
}

function householdNameOptions() {
  const seen = new Map();
  state.store.members.forEach((member) => {
    const name = String(member.householdName || "").trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// A datalist combobox: type a new household name freely, or pick an existing
// one — the list filters to matching names as you type, like the search bar.
function householdField(label, value = "", className = "") {
  return `<label class="${className}"><span>${escapeHtml(label)}</span>
    <input name="householdName" type="text" value="${escapeAttr(value)}" list="householdNameList" autocomplete="off" placeholder="Type a new name or pick an existing household">
    <datalist id="householdNameList">${householdNameOptions().map((name) => `<option value="${escapeAttr(name)}"></option>`).join("")}</datalist>
  </label>`;
}

function moneyField(label, name, value = "") {
  return `<label><span>${escapeHtml(label)}</span><span class="money-input"><b>$</b><input name="${name}" type="number" min="0" step="0.01" value="${escapeAttr(value)}"></span></label>`;
}

function selectField(label, name, value, options) {
  return `<label><span>${escapeHtml(label)}</span><select name="${name}">${options.map(([optionValue, text]) =>
    `<option value="${escapeAttr(optionValue)}" ${String(optionValue) === String(value) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
}

function checkboxField(label, name, checked) {
  return `<label class="checkbox-label"><input name="${name}" type="checkbox" value="true" ${checked ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`;
}

function openNextMember() {
  const members = state.store.members.filter((member) => !member.inactive);
  const index = members.findIndex((member) => member.id === state.selectedId);
  if (members.length) openMember(members[(index + 1) % members.length].id);
}

function handleSearch() {
  const query = el.searchInput.value.trim();
  if (!query) {
    if (state.view === "roster") renderRoster();
    return;
  }
  state.view = "roster";
  el.homeView.classList.add("hidden");
  el.memberView.classList.add("hidden");
  el.rosterView.classList.remove("hidden");
  const matches = searchMembers(state.store.members, query);
  el.rosterTitle.textContent = `Search results`;
  el.rosterSummary.textContent = `${matches.length} match${matches.length === 1 ? "" : "es"} for “${query}”`;
  el.rosterList.innerHTML = matches.map((member) => `
    <button class="roster-row" type="button" data-open-member="${member.id}">
      <div class="person"><div class="avatar">${escapeHtml(initials(member.name))}</div><div class="person-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(memberSubtitle(member))}</small></div></div>
      <span>${escapeHtml(payerFor(member).name)}</span>
      <span class="mini-status ${accountStatus(member)}">${statusLabel(accountStatus(member))}</span>
      <strong>${accountBalance(member).dueNow ? money(accountBalance(member).dueNow) : "—"}</strong>
    </button>`).join("") || `<div class="empty-message">No matching members.</div>`;
  el.rosterList.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
  );
}

async function importCsv(file, kind) {
  if (!file) return;
  try {
    const { headers, records } = parseCsv(await file.text());
    if (!records.length) throw new Error("The CSV is empty.");
    if (kind === "backup" || isFullBackupCsv(headers)) {
      restoreFullBackup(headers, records);
      return;
    }
    const aliases = kind === "members" ? MEMBER_FIELD_ALIASES : PAYMENT_FIELD_ALIASES;
    const map = guessColumnMap(headers, aliases);
    if (kind === "members") {
      if (!map.name) throw new Error("A member-name column is required.");
      const result = importMembersFromRecords(records, map, state.store);
      state.store = result.store;
      toast(`Imported ${result.added.length} new and updated ${result.updated.length} existing members.`);
    } else {
      const result = importPaymentsFromRecords(records, map, state.store);
      state.store = result.store;
      toast(`Imported ${result.matches.length} payments.`);
    }
    saveStore("Import complete");
    el.toolsDialog.close();
    render();
  } catch (error) {
    toast(error.message || "Could not import that file.");
  } finally {
    el.memberCsv.value = "";
    el.paymentCsv.value = "";
    el.restoreCsv.value = "";
  }
}

function restoreFullBackup(headers, records) {
  if (!isFullBackupCsv(headers)) {
    return toast("Choose a WMAC full backup CSV.");
  }
  if (!window.confirm("This will replace the members and payment history saved on this computer with the selected backup. Continue?")) {
    return;
  }
  const result = restoreStoreFromBackupRows(records);
  state.store = result.store;
  state.selectedId = "";
  saveStore("Backup restored");
  toast(`Restored ${result.memberCount} members and ${result.paymentCount} payments.`);
  el.toolsDialog.close();
  showHome();
}

function exportBackup() {
  const rows = exportStoreRows(state.store);
  if (!rows.length) return toast("There is no data to export.");
  downloadCsv(toCsv(rows), `wmac-backup-${todayKey()}.csv`);
  toast("Backup downloaded.");
}

function downloadCsv(csv, filename) {
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindDemoLoaders() {
  document.querySelectorAll("[data-load-demo]").forEach((button) =>
    button.addEventListener("click", () => {
      const summary = seedDemoData(localStorage);
      state.store = loadStore();
      state.selectedId = "";
      toast(`Loaded ${summary.memberCount} sample members and ${summary.paymentCount} payments.`);
      render();
    }, { once: true })
  );
}

// The toast uses the popover API so it appears in the browser's top layer,
// above any open modal dialog (which would otherwise cover it). The .hidden
// class only matters as the initial state for browsers without popover
// support, where the attribute is ignored.
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  if (typeof el.toast.togglePopover === "function") {
    el.toast.classList.remove("hidden");
    el.toast.togglePopover(true);
    toastTimer = setTimeout(() => el.toast.togglePopover(false), 2800);
  } else {
    el.toast.classList.remove("hidden");
    toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2800);
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function capitalize(value = "") {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

render();
initAppUpdates();
loadSquareSettings();
loadSquarePayments();
