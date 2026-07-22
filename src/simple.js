import {
  MEMBER_FIELD_ALIASES,
  PAYMENT_FIELD_ALIASES,
  addPayment,
  defaultAgreementEndDate,
  exportStoreRows,
  getAgreementExpirationStatus,
  getContractDownPaymentRecord,
  getLandscapeRows,
  getLateFeeBalance,
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
  removePayment,
  searchMembers,
  stagedPaymentMonth,
  suggestedPaymentMember,
  toCsv,
  upsertMember
} from "./data.js";
import { loadStoreWithMigrationBackup } from "./storage.js";
import { buildReminderEmail, formatMonthEn } from "./i18n.js";

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
  squarePayments: [],
  squareSelectedId: "",
  squareConfigured: false,
  squareLoading: false,
  squareLoaded: false,
  squareError: ""
};

const ids = [
  "homeLink", "homeNav", "membersNav", "squareNav", "squareNavBadge", "searchInput", "addMemberButton", "settingsButton", "saveStatus",
  "homeView", "attentionList", "seeAllMembersButton", "paidStat", "dueStat", "familyStat", "membersStat",
  "paidCount", "dueCount", "familyCount", "memberCount", "recentMembers",
  "rosterView", "rosterTitle", "rosterSummary", "rosterList", "memberListToggle", "memberLandscapeToggle",
  "memberLandscape", "memberLandscapeHead", "memberLandscapeBody",
  "memberView", "memberBackButton", "memberAvatar", "memberNameHeading", "memberStatusBadge", "memberSubtitle",
  "editProfileButton", "nextMemberButton", "paymentCard", "paymentHeadline", "paymentSubhead", "amountDue",
  "recordPaymentButton", "recordPaymentLabel", "paymentMenuButton", "paymentMenu", "customPaymentButton",
  "catchUpButton", "reminderButton", "showAllPaymentsButton", "paymentHistory",
  "familyCard", "editFamilyButton", "familyMembers", "editContractButton", "contractStart", "contractEnd",
  "contractAmount", "contractDownPayment", "contractType", "contractProgress", "contractNote", "downPaymentAction",
  "downPaymentActionTitle", "downPaymentActionHelp", "recordDownPaymentButton", "editBioButton", "bioPhone", "bioEmail",
  "bioDob", "bioAddress", "editorDialog", "editorForm", "editorEyebrow", "editorTitle", "editorHelp",
  "editorFields", "closeEditorButton", "cancelEditorButton", "paymentDialog", "paymentForm", "closePaymentButton",
  "cancelPaymentButton", "paymentMonth", "paymentAmount", "paymentDate", "paymentNote",
  "toolsDialog", "closeToolsButton", "memberCsv", "paymentCsv", "exportButton", "toast",
  "squareView", "syncSquareButton", "syncSquareLabel", "squareEmptySyncButton", "squarePendingCount", "squareMatchCount", "squareApprovedCount",
  "squareConnectionStatus", "squareEmpty", "squareWorkspace", "squareQueue", "squareDetail", "squareRelayUrl",
  "squareRelayToken", "saveSquareSettingsButton", "squareSettingsStatus"
];
const el = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));

el.homeLink.addEventListener("click", (event) => { event.preventDefault(); showHome(); });
el.homeNav.addEventListener("click", showHome);
el.membersNav.addEventListener("click", () => showRoster("all"));
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
el.memberBackButton.addEventListener("click", () => state.view === "member" ? showHome() : showRoster(state.rosterFilter));
el.nextMemberButton.addEventListener("click", openNextMember);
el.recordPaymentButton.addEventListener("click", recordPrimaryPayment);
el.paymentMenuButton.addEventListener("click", () => el.paymentMenu.classList.toggle("hidden"));
el.customPaymentButton.addEventListener("click", openPaymentDialog);
el.catchUpButton.addEventListener("click", catchUpPayments);
el.reminderButton.addEventListener("click", sendReminder);
el.showAllPaymentsButton.addEventListener("click", () => { state.historyExpanded = !state.historyExpanded; renderMember(); });
el.editProfileButton.addEventListener("click", () => openEditor("profile"));
el.editBioButton.addEventListener("click", () => openEditor("bio"));
el.editContractButton.addEventListener("click", () => openEditor("contract"));
el.recordDownPaymentButton.addEventListener("click", recordSelectedDownPayment);
el.editFamilyButton.addEventListener("click", () => openEditor("family"));
el.closeEditorButton.addEventListener("click", closeEditor);
el.cancelEditorButton.addEventListener("click", closeEditor);
el.editorForm.addEventListener("submit", saveEditor);
el.closePaymentButton.addEventListener("click", () => el.paymentDialog.close());
el.cancelPaymentButton.addEventListener("click", () => el.paymentDialog.close());
el.paymentForm.addEventListener("submit", saveCustomPayment);
el.memberCsv.addEventListener("change", () => importCsv(el.memberCsv.files[0], "members"));
el.paymentCsv.addEventListener("change", () => importCsv(el.paymentCsv.files[0], "payments"));
el.exportButton.addEventListener("click", exportBackup);
el.syncSquareButton.addEventListener("click", syncSquarePayments);
el.squareEmptySyncButton.addEventListener("click", syncSquarePayments);
el.saveSquareSettingsButton.addEventListener("click", saveSquareSettings);

function loadStore() {
  return loadStoreWithMigrationBackup(localStorage, { storageKey: STORAGE_KEY });
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

function openMember(memberId) {
  if (!state.store.members.some((member) => member.id === memberId)) return;
  state.view = "member";
  state.selectedId = memberId;
  state.historyExpanded = false;
  el.searchInput.value = "";
  addRecent(memberId);
  render();
}

function render() {
  el.homeView.classList.toggle("hidden", state.view !== "home");
  el.rosterView.classList.toggle("hidden", state.view !== "roster");
  el.memberView.classList.toggle("hidden", state.view !== "member");
  el.squareView.classList.toggle("hidden", state.view !== "square");
  el.homeNav.classList.toggle("active", state.view === "home");
  el.membersNav.classList.toggle("active", state.view === "roster" || state.view === "member");
  el.squareNav.classList.toggle("active", state.view === "square");
  if (state.view === "home") renderHome();
  if (state.view === "roster") renderRoster();
  if (state.view === "member") renderMember();
  if (state.view === "square") renderSquare();
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
    el.attentionList.innerHTML = `<div class="empty-message">${active.length ? "Everyone is paid up. Nothing needs attention today." : "Add your first member to get started."}</div>`;
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
  }).join("") : `<div class="empty-message">No members in this group.</div>`;
  el.rosterList.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
  );
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
      ${row.cells.map((cell) => `<td class="simple-landscape-cell ${cell.state}" title="${escapeAttr(formatMonthEn(cell.month))}">${landscapeSymbol(cell.state)}</td>`).join("")}
    </tr>`).join("") : `<tr><td colspan="15" class="empty-message">No active member accounts.</td></tr>`;
  el.memberLandscapeBody.querySelectorAll("[data-open-member]").forEach((button) =>
    button.addEventListener("click", () => openMember(button.dataset.openMember))
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

  if (!isPayer(member)) {
    el.paymentHeadline.textContent = `Payments are managed by ${payer.name}`;
    el.paymentSubhead.textContent = "Open the responsible payer to record family payments.";
    el.amountDue.textContent = money(balance.dueNow);
    el.recordPaymentButton.disabled = false;
    el.recordPaymentButton.classList.remove("done");
    el.recordPaymentButton.dataset.openPayer = payer.id;
    el.recordPaymentLabel.textContent = "Open payer account";
  } else if (currentPaid) {
    el.paymentHeadline.textContent = `${formatMonthEn(status.currentMonth)} is paid`;
    el.paymentSubhead.textContent = balance.dueUnpaidMonths.length ? `${balance.dueUnpaidMonths.length} earlier payment${balance.dueUnpaidMonths.length === 1 ? "" : "s"} still need attention.` : "This account is up to date.";
    el.amountDue.textContent = money(balance.dueNow);
    el.recordPaymentButton.disabled = false;
    el.recordPaymentButton.classList.add("done");
    delete el.recordPaymentButton.dataset.openPayer;
    el.recordPaymentLabel.textContent = "Click to mark this month unpaid";
  } else {
    el.paymentHeadline.textContent = balance.dueUnpaidMonths.length > 1 ? `${balance.dueUnpaidMonths.length} payments need attention` : `${formatMonthEn(status.currentMonth)} payment`;
    el.paymentSubhead.textContent = balance.monthlyAmount > 0 ? `Normal tuition is ${money(balance.monthlyAmount)} per month.` : "Add the monthly tuition amount before recording payment.";
    el.amountDue.textContent = money(balance.dueNow);
    el.recordPaymentButton.disabled = balance.monthlyAmount <= 0;
    el.recordPaymentButton.classList.remove("done");
    delete el.recordPaymentButton.dataset.openPayer;
    el.recordPaymentLabel.textContent = balance.monthlyAmount > 0 ? `${money(balance.monthlyAmount)} for ${formatMonthEn(status.currentMonth)}` : "Monthly amount not set";
  }

  el.catchUpButton.disabled = !isPayer(member) || !balance.dueUnpaidMonths.length || balance.monthlyAmount <= 0;
  el.reminderButton.disabled = !payer.email || !balance.dueUnpaidMonths.length;
  renderPaymentHistory(member);
  renderFamily(member);
  renderContract(member);
  renderBio(member);
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
  const payer = payerFor(member);
  el.familyMembers.innerHTML = family.map((person) => `
    <div class="family-member ${person.id === member.id ? "current" : ""}">
      <div class="avatar">${escapeHtml(initials(person.name))}</div>
      <div><strong>${escapeHtml(person.name)}</strong><small>${person.id === payer.id ? "Responsible payer" : person.participant === false ? "Contact only" : "Member"}</small></div>
      <span class="family-role">${escapeHtml(person.householdRole || "adult")}</span>
    </div>`).join("");
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
  el.recordDownPaymentButton.disabled = !canRecord;
  if (downPaymentRecord) {
    const matchesContract = Number(downPaymentRecord.amount || 0) === downPaymentAmount
      && downPaymentRecord.paidAt === payer.startDate;
    el.downPaymentActionTitle.textContent = matchesContract ? "Down payment recorded" : "Recorded payment needs updating";
    el.downPaymentActionHelp.textContent = `${money(downPaymentRecord.amount)} recorded on ${dateLabel(downPaymentRecord.paidAt)}.`;
    el.recordDownPaymentButton.textContent = matchesContract ? "Already recorded" : "Update recorded payment";
    el.recordDownPaymentButton.disabled = matchesContract || !canRecord;
  } else {
    el.downPaymentActionTitle.textContent = "Down payment not recorded";
    el.downPaymentActionHelp.textContent = "The contract value is saved, but no financial transaction has been created.";
    el.recordDownPaymentButton.textContent = "Record down payment";
  }
}

function recordSelectedDownPayment() {
  const member = selectedMember();
  if (!member) return;
  try {
    const result = recordContractDownPayment(state.store, payerFor(member).id);
    if (!result.changed) {
      toast("The contract down payment is already recorded.");
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

function renderBio(member) {
  const address = [member.address, member.city, member.state, member.zip].filter(Boolean).join(", ");
  el.bioPhone.textContent = member.cellPhone || member.phone || "Not set";
  el.bioEmail.textContent = member.email || "Not set";
  el.bioDob.textContent = dateLabel(member.dob);
  el.bioAddress.textContent = address || "Not set";
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
  const completed = payment.status === "approved" || payment.status === "ignored";
  const recommendedMonth = member
    ? nextUnpaidTuitionMonth(member, state.store.payments, squarePaymentDate(payment), state.store.members)
    : "";
  const options = [
    `<option value="">Choose a member</option>`,
    ...state.store.members.filter((candidate) => !candidate.inactive)
      .map((candidate) => `<option value="${escapeAttr(candidate.id)}" ${candidate.id === memberId ? "selected" : ""}>${escapeHtml(candidate.name || "New member")}</option>`)
  ].join("");
  return `
    <div class="square-detail-inner">
      <div class="square-detail-head">
        <div>
          <p class="eyebrow">Square payment</p>
          <h2>${money(Number(payment.amountCents || 0) / 100)}</h2>
          <p>${escapeHtml([payment.buyerName, payment.buyerEmail, payment.receiptNumber ? `Receipt ${payment.receiptNumber}` : ""].filter(Boolean).join(" · ") || "No customer details supplied")}</p>
        </div>
        <span class="square-state ${escapeAttr(payment.status)}">${escapeHtml(squareStatusLabel(payment.status))}</span>
      </div>
      <div class="square-confirmation-form">
        <label><span>Member</span><select data-square-member="${escapeAttr(payment.id)}" ${completed ? "disabled" : ""}>${options}</select></label>
        <label><span>Tuition month</span><input data-square-month="${escapeAttr(payment.id)}" type="month" value="${escapeAttr(month)}" ${completed ? "disabled" : ""}></label>
        <label class="full"><span>Note <small>optional</small></span><input data-square-note="${escapeAttr(payment.id)}" type="text" value="${escapeAttr(payment.reviewNote || "")}" placeholder="Gear, testing, special payment…" ${completed ? "disabled" : ""}></label>
        <div class="square-recommendation">${member ? `Recommended: apply to ${escapeHtml(formatMonthEn(recommendedMonth))}, the next unpaid tuition month.` : "Choose the member this payment belongs to."}</div>
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
    payment.id === paymentId ? { ...payment, ...patch, status: patch.memberId && payment.status === "needs_match" ? "pending" : payment.status } : payment
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
  const month = stagedPaymentMonth(payment) || nextUnpaidTuitionMonth(member, state.store.payments, squarePaymentDate(payment), state.store.members);
  const amount = Number(payment.amountCents || 0) / 100;
  const priorStore = state.store;
  const nextStore = addPayment(state.store, {
    memberId: category === "tuition" ? payer.id : member.id,
    month,
    amount,
    paidAt: payment.paidAt || todayKey(),
    source: "square",
    category,
    note: payment.reviewNote || (category === "one-off" ? "Square other sale" : ""),
    squarePaymentId: payment.squarePaymentId || payment.id,
    providerPaymentId: payment.providerPaymentId || payment.squarePaymentId || payment.id,
    paymentProvider: "square"
  });
  state.store = nextStore;
  const saved = await saveSquareStatus(paymentId, {
    status: "approved",
    memberId: category === "tuition" ? payer.id : member.id,
    suggestedMemberId: category === "tuition" ? payer.id : member.id,
    paymentMonth: month,
    paymentCategory: category,
    reviewNote: payment.reviewNote || ""
  });
  if (!saved) {
    state.store = priorStore;
    return;
  }
  saveStore("Square payment confirmed");
  toast(`${money(amount)} confirmed for ${member.name}.`);
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

function recordPrimaryPayment() {
  const member = selectedMember();
  if (!member) return;
  if (el.recordPaymentButton.dataset.openPayer) return openMember(el.recordPaymentButton.dataset.openPayer);
  const status = accountPaymentState(member);
  if (status.paidMonths.has(status.currentMonth)) {
    state.store = removePayment(state.store, member.id, status.currentMonth);
    saveStore("Payment marked unpaid");
    toast(`${formatMonthEn(status.currentMonth)} marked unpaid.`);
  } else {
    const amount = accountBalance(member).monthlyAmount;
    if (amount <= 0) return;
    state.store = addPayment(state.store, { memberId: member.id, month: status.currentMonth, amount, paidAt: todayKey(), source: "simple-desk" });
    saveStore("Payment recorded");
    toast(`${formatMonthEn(status.currentMonth)} payment recorded.`);
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
  el.paymentMenu.classList.add("hidden");
  toast(`${status.dueUnpaidMonths.length} payment${status.dueUnpaidMonths.length === 1 ? "" : "s"} recorded.`);
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
        field("Family / household name", "householdName", member.householdName, "text"),
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
      help: "Assign this person to a family and choose who is responsible for payment.",
      fields: [
        field("Family / household name", "householdName", member.householdName, "text", false, "full"),
        selectField("Family role", "householdRole", member.householdRole || "adult", [["adult", "Adult"], ["parent", "Parent / guardian"], ["child", "Child"]]),
        selectField("Responsible payer", "responsiblePartyId", payer.id, state.store.members.filter((candidate) => !candidate.inactive).map((candidate) => [candidate.id, candidate.name || "New member"])),
        checkboxField("Participates in classes", "participant", member.participant !== false)
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
  state.store = upsertMember(state.store, next);
  saveStore("Member information saved");
  el.editorDialog.close();
  toast("Changes saved.");
  render();
}

function field(label, name, value = "", type = "text", required = false, className = "") {
  return `<label class="${className}"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeAttr(value)}" ${required ? "required" : ""}></label>`;
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
    el[kind === "members" ? "memberCsv" : "paymentCsv"].value = "";
  }
}

function exportBackup() {
  const rows = exportStoreRows(state.store);
  if (!rows.length) return toast("There is no data to export.");
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `wmac-backup-${todayKey()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Backup downloaded.");
}

let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 2800);
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
loadSquareSettings();
loadSquarePayments();
