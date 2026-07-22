import {
  MEMBER_FIELD_ALIASES,
  PAYMENT_FIELD_ALIASES,
  addPayment,
  createEmptyStore,
  defaultAgreementEndDate,
  exportStoreRows,
  getAgreementExpirationStatus,
  getLateFeeBalance,
  getMemberBalance,
  getMemberPaymentState,
  getResponsibleParty,
  guessColumnMap,
  householdMembers,
  importMembersFromRecords,
  importPaymentsFromRecords,
  isActiveParticipant,
  migrateStore,
  parseCsv,
  removePayment,
  searchMembers,
  toCsv,
  upsertMember
} from "./data.js";
import { buildReminderEmail, formatMonthEn } from "./i18n.js";

const STORAGE_KEY = "master-lee-payment-tracker";
const RECENT_KEY = "master-lee-payment-tracker-recent";
const state = {
  store: loadStore(),
  selectedId: "",
  view: "home",
  rosterFilter: "all",
  editorMode: "",
  historyExpanded: false
};

const ids = [
  "homeLink", "searchInput", "addMemberButton", "settingsButton", "saveStatus",
  "homeView", "attentionList", "seeAllMembersButton", "paidStat", "dueStat", "familyStat", "membersStat",
  "paidCount", "dueCount", "familyCount", "memberCount", "recentMembers",
  "rosterView", "rosterBackButton", "rosterTitle", "rosterSummary", "rosterList",
  "memberView", "memberBackButton", "memberAvatar", "memberNameHeading", "memberStatusBadge", "memberSubtitle",
  "editProfileButton", "nextMemberButton", "paymentCard", "paymentHeadline", "paymentSubhead", "amountDue",
  "recordPaymentButton", "recordPaymentLabel", "paymentMenuButton", "paymentMenu", "customPaymentButton",
  "catchUpButton", "reminderButton", "showAllPaymentsButton", "paymentHistory",
  "familyCard", "editFamilyButton", "familyMembers", "editContractButton", "contractStart", "contractEnd",
  "contractAmount", "contractType", "contractProgress", "contractNote", "editBioButton", "bioPhone", "bioEmail",
  "bioDob", "bioAddress", "editorDialog", "editorForm", "editorEyebrow", "editorTitle", "editorHelp",
  "editorFields", "closeEditorButton", "cancelEditorButton", "paymentDialog", "paymentForm", "closePaymentButton",
  "cancelPaymentButton", "paymentMonth", "paymentAmount", "paymentDate", "paymentNote",
  "toolsDialog", "closeToolsButton", "memberCsv", "paymentCsv", "exportButton", "toast"
];
const el = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));

el.homeLink.addEventListener("click", (event) => { event.preventDefault(); showHome(); });
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
el.rosterBackButton.addEventListener("click", showHome);
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

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed?.members && parsed?.payments ? migrateStore(parsed) : createEmptyStore();
  } catch {
    return createEmptyStore();
  }
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
  if (state.view === "home") renderHome();
  if (state.view === "roster") renderRoster();
  if (state.view === "member") renderMember();
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
  el.contractStart.textContent = dateLabel(payer.startDate);
  el.contractEnd.textContent = payer.agreementType === "Month-to-Month" ? "Ongoing" : dateLabel(payer.agreementEndDate);
  el.contractAmount.textContent = money(accountBalance(member).monthlyAmount);
  el.contractType.textContent = payer.agreementType || "Contract";
  const start = Date.parse(payer.startDate || "");
  const end = Date.parse(payer.agreementEndDate || "");
  const now = Date.now();
  const percent = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100)) : 0;
  el.contractProgress.querySelector("span").style.width = `${percent}%`;
  el.contractProgress.classList.toggle("hidden", payer.agreementType === "Month-to-Month" || !end);
  el.contractNote.textContent = expiration.level === "expired" ? "Contract renewal is due." : expiration.daysUntil != null ? `${Math.max(0, expiration.daysUntil)} days remaining` : "";
}

function renderBio(member) {
  const address = [member.address, member.city, member.state, member.zip].filter(Boolean).join(", ");
  el.bioPhone.textContent = member.cellPhone || member.phone || "Not set";
  el.bioEmail.textContent = member.email || "Not set";
  el.bioDob.textContent = dateLabel(member.dob);
  el.bioAddress.textContent = address || "Not set";
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
