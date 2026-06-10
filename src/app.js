import {
  MEMBER_FIELD_ALIASES,
  PAYMENT_FIELD_ALIASES,
  addPayment,
  createEmptyStore,
  exportStoreRows,
  getMemberBalance,
  getMemberStatus,
  guessColumnMap,
  importMembersFromRecords,
  importPaymentsFromRecords,
  parseCsv,
  searchMembers,
  toCsv,
  upsertMember
} from "./data.js";

const STORAGE_KEY = "master-lee-payment-tracker";
const state = {
  store: loadStore(),
  selectedId: "",
  view: "dashboard",
  statusFilter: "all",
  mapping: null
};

const elements = {
  saveStatus: document.querySelector("#saveStatus"),
  dashboardButton: document.querySelector("#dashboardButton"),
  memberCsv: document.querySelector("#memberCsv"),
  paymentCsv: document.querySelector("#paymentCsv"),
  exportButton: document.querySelector("#exportButton"),
  searchInput: document.querySelector("#searchInput"),
  addMemberButton: document.querySelector("#addMemberButton"),
  paidCount: document.querySelector("#paidCount"),
  watchCount: document.querySelector("#watchCount"),
  lateCount: document.querySelector("#lateCount"),
  memberList: document.querySelector("#memberList"),
  dashboardView: document.querySelector("#dashboardView"),
  dashboardPaid: document.querySelector("#dashboardPaid"),
  dashboardWatch: document.querySelector("#dashboardWatch"),
  dashboardLate: document.querySelector("#dashboardLate"),
  dashboardDue: document.querySelector("#dashboardDue"),
  fieldSnapshot: document.querySelector("#fieldSnapshot"),
  highestBalanceList: document.querySelector("#highestBalanceList"),
  rosterView: document.querySelector("#rosterView"),
  backToDashboard: document.querySelector("#backToDashboard"),
  rosterTitle: document.querySelector("#rosterTitle"),
  rosterHelp: document.querySelector("#rosterHelp"),
  rosterMembers: document.querySelector("#rosterMembers"),
  emptyState: document.querySelector("#emptyState"),
  memberDetail: document.querySelector("#memberDetail"),
  detailName: document.querySelector("#detailName"),
  detailContact: document.querySelector("#detailContact"),
  statusBadge: document.querySelector("#statusBadge"),
  latestPaid: document.querySelector("#latestPaid"),
  monthStrip: document.querySelector("#monthStrip"),
  invoiceSummary: document.querySelector("#invoiceSummary"),
  invoiceButton: document.querySelector("#invoiceButton"),
  paymentForm: document.querySelector("#paymentForm"),
  paymentMonth: document.querySelector("#paymentMonth"),
  paymentAmount: document.querySelector("#paymentAmount"),
  memberForm: document.querySelector("#memberForm"),
  memberName: document.querySelector("#memberName"),
  memberPhone: document.querySelector("#memberPhone"),
  memberEmail: document.querySelector("#memberEmail"),
  memberParent: document.querySelector("#memberParent"),
  memberAmount: document.querySelector("#memberAmount"),
  memberStart: document.querySelector("#memberStart"),
  memberInactive: document.querySelector("#memberInactive"),
  mappingDialog: document.querySelector("#mappingDialog"),
  mappingForm: document.querySelector("#mappingForm"),
  mappingTitle: document.querySelector("#mappingTitle"),
  mappingHelp: document.querySelector("#mappingHelp"),
  mappingFields: document.querySelector("#mappingFields"),
  cancelMapping: document.querySelector("#cancelMapping"),
  toast: document.querySelector("#toast")
};

elements.dashboardButton.addEventListener("click", showDashboard);
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
elements.invoiceButton.addEventListener("click", generateInvoice);
elements.paymentForm.addEventListener("submit", savePayment);
elements.memberForm.addEventListener("submit", saveMember);
elements.cancelMapping.addEventListener("click", () => elements.mappingDialog.close("cancel"));
elements.mappingForm.addEventListener("submit", finishMappingImport);

render();

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

function saveStore(message = "Saved on this computer") {
  state.store.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  elements.saveStatus.textContent = message;
}

function render() {
  renderSummary();
  renderDashboard();
  renderRoster();
  renderMemberList();
  renderDetail();
}

function renderSummary() {
  const counts = statusCounts();
  elements.paidCount.textContent = `${counts.paid} paid`;
  elements.watchCount.textContent = `${counts.watch} attention`;
  elements.lateCount.textContent = `${counts.late} behind`;
}

function renderDashboard() {
  elements.dashboardView.classList.toggle("hidden", state.view !== "dashboard");
  if (state.view !== "dashboard") {
    return;
  }

  const rows = memberRows();
  const counts = statusCounts(rows);
  const totalDue = rows.reduce((sum, row) => sum + row.balance.totalDue, 0);
  const activeTotal = rows.length;
  const atRisk = counts.watch + counts.late;
  const currentRate = activeTotal ? Math.round((counts.paid / activeTotal) * 100) : 0;

  elements.dashboardPaid.querySelector("strong").textContent = counts.paid;
  elements.dashboardWatch.querySelector("strong").textContent = counts.watch;
  elements.dashboardLate.querySelector("strong").textContent = counts.late;
  elements.dashboardDue.textContent = formatMoney(totalDue);

  elements.fieldSnapshot.innerHTML = `
    <div><span>Active members</span><strong>${activeTotal}</strong></div>
    <div><span>Current this month</span><strong>${currentRate}%</strong></div>
    <div><span>Need follow-up</span><strong>${atRisk}</strong></div>
    <div><span>Inactive records</span><strong>${state.store.members.filter((member) => member.inactive).length}</strong></div>
  `;

  const highest = rows
    .filter((row) => row.balance.totalDue > 0)
    .sort((a, b) => b.balance.totalDue - a.balance.totalDue || a.member.name.localeCompare(b.member.name))
    .slice(0, 6);

  elements.highestBalanceList.innerHTML = highest.length
    ? highest.map((row) => rosterSummaryMarkup(row)).join("")
    : `<div><span>No unpaid balances</span><strong>All clear</strong></div>`;

  elements.highestBalanceList.querySelectorAll("[data-member-id]").forEach((button) => {
    button.addEventListener("click", () => selectMember(button.dataset.memberId));
  });
}

function renderRoster() {
  elements.rosterView.classList.toggle("hidden", state.view !== "roster");
  if (state.view !== "roster") {
    return;
  }

  const labels = {
    all: "All Members",
    paid: "Paid Up Members",
    watch: "Needs Attention",
    late: "Behind"
  };
  const rows = memberRows().filter((row) => state.statusFilter === "all" || row.status.level === state.statusFilter);
  elements.rosterTitle.textContent = labels[state.statusFilter] || labels.all;
  elements.rosterHelp.textContent = `${rows.length} active member${rows.length === 1 ? "" : "s"} in this group.`;
  elements.rosterMembers.innerHTML = rows.length
    ? rows.map((row) => rosterMemberMarkup(row)).join("")
    : `<div class="empty-state compact"><h3>No members here</h3><p>This group is empty right now.</p></div>`;

  elements.rosterMembers.querySelectorAll("[data-member-id]").forEach((button) => {
    button.addEventListener("click", () => selectMember(button.dataset.memberId));
  });
}

function renderMemberList() {
  const members = searchMembers(state.store.members, elements.searchInput.value);
  elements.memberList.innerHTML = "";

  if (members.length === 0) {
    elements.memberList.innerHTML = `<div class="empty-state"><p>No matching members.</p></div>`;
    return;
  }

  members.forEach((member) => {
    const status = getMemberStatus(member, state.store.payments);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `member-item ${member.id === state.selectedId ? "active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(member.name)}</strong>
      <span>${status.label}${status.lastPaidMonth ? ` · Last paid ${formatMonth(status.lastPaidMonth)}` : ""}</span>
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
  elements.detailName.textContent = member.name;
  elements.detailContact.textContent = [formatPhone(member.phone), member.email, member.parentName && `Parent: ${member.parentName}`]
    .filter(Boolean)
    .join("  ");
  elements.statusBadge.textContent = status.label;
  elements.statusBadge.className = `status-badge status-${status.level}`;
  elements.latestPaid.textContent = status.lastPaidMonth
    ? `Most recent payment: ${formatMonth(status.lastPaidMonth)}`
    : "No payments recorded yet";
  elements.latestPaid.className = `latest-paid ${status.lastPaidMonth ? "has-payment" : "no-payment"}`;

  elements.monthStrip.innerHTML = "";
  status.recentMonths.forEach((month) => {
    const item = document.createElement("div");
    item.className = `month-box ${month.paid ? "paid" : "unpaid"}`;
    item.innerHTML = `<strong>${formatMonth(month.month)}</strong><span>${month.paid ? "Paid" : "Not paid"}</span>`;
    elements.monthStrip.append(item);
  });

  elements.invoiceSummary.textContent = balance.unpaidMonths.length
    ? `${balance.unpaidMonths.length} unpaid month${balance.unpaidMonths.length === 1 ? "" : "s"} · ${formatMoney(balance.totalDue)} due`
    : "No unpaid balance found for this member.";
  elements.invoiceButton.disabled = balance.totalDue <= 0;

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

function showDashboard() {
  state.view = "dashboard";
  state.statusFilter = "all";
  render();
}

function showRoster(statusFilter) {
  state.view = "roster";
  state.statusFilter = statusFilter;
  render();
}

function selectMember(memberId) {
  state.selectedId = memberId;
  state.view = "member";
  render();
}

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
  const lastPaid = row.status.lastPaidMonth ? `Last paid ${formatMonth(row.status.lastPaidMonth)}` : "No payments recorded";
  const dueText = row.balance.totalDue > 0
    ? `${formatMoney(row.balance.totalDue)} due · ${row.balance.unpaidMonths.length} month${row.balance.unpaidMonths.length === 1 ? "" : "s"}`
    : "No balance due";
  return `
    <button class="roster-member" type="button" data-member-id="${escapeHtml(row.member.id)}">
      <span class="status-badge status-${row.status.level}">${escapeHtml(row.status.label)}</span>
      <strong>${escapeHtml(row.member.name)}</strong>
      <span>${escapeHtml(lastPaid)}</span>
      <span>${escapeHtml(dueText)}</span>
    </button>
  `;
}

async function prepareCsvImport(file, kind) {
  if (!file) {
    return;
  }
  const parsed = parseCsv(await file.text());
  if (parsed.records.length === 0) {
    showToast("That CSV did not have any rows to import.");
    return;
  }

  const aliases = kind === "members" ? MEMBER_FIELD_ALIASES : PAYMENT_FIELD_ALIASES;
  const guessed = guessColumnMap(parsed.headers, aliases);
  state.mapping = { kind, parsed, aliases, map: guessed };
  elements.mappingTitle.textContent = kind === "members" ? "Match Member Columns" : "Match Payment Columns";
  elements.mappingHelp.textContent =
    kind === "members"
      ? "Name is required. The other fields can be left blank."
      : "The app will try to match payments by ID, email, phone, or name.";
  renderMappingFields();
  elements.mappingDialog.showModal();
}

function renderMappingFields() {
  const required = state.mapping.kind === "members" ? ["name"] : ["amount"];
  const labels = {
    name: "Member name",
    startDate: "Contract start date",
    monthlyAmount: "Monthly amount",
    email: "Email",
    phone: "Phone",
    parentName: "Parent or guardian",
    externalId: "Member ID",
    amount: "Payment amount",
    paidAt: "Payment date",
    month: "Payment month"
  };

  elements.mappingFields.innerHTML = "";
  Object.keys(state.mapping.aliases).forEach((field) => {
    const wrapper = document.createElement("div");
    wrapper.className = "form-row";
    const select = document.createElement("select");
    select.name = field;
    select.required = required.includes(field);
    select.innerHTML = `<option value="">Not in this CSV</option>${state.mapping.parsed.headers
      .map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`)
      .join("")}`;
    select.value = state.mapping.map[field] || "";
    wrapper.innerHTML = `<label>${labels[field]}${required.includes(field) ? " (needed)" : ""}</label>`;
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
    saveStore(`Imported ${result.imported.length} members`);
    showToast(`Imported ${result.imported.length} members. ${result.skipped.length} rows skipped.`);
  } else {
    const result = importPaymentsFromRecords(state.mapping.parsed.records, columnMap, state.store);
    state.store = result.store;
    saveStore(`Imported ${result.matches.length} payments`);
    showToast(`Imported ${result.matches.length} payments. ${result.unmatched.length} rows need checking.`);
  }

  state.mapping = null;
  elements.mappingDialog.close();
  elements.memberCsv.value = "";
  elements.paymentCsv.value = "";
  render();
}

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
  saveStore("New member added");
  selectMember(member.id);
  elements.memberName.focus();
  elements.memberName.select();
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
  saveStore("Payment saved");
  showToast(`Saved ${formatMonth(elements.paymentMonth.value)} payment for ${member.name}.`);
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
  saveStore("Member saved");
  showToast("Member information saved.");
  render();
}

function exportBackup() {
  const csv = toCsv(exportStoreRows(state.store));
  if (!csv) {
    showToast("There is no data to export yet.");
    return;
  }
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `master-lee-payment-backup-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function generateInvoice() {
  const member = selectedMember();
  if (!member) {
    return;
  }

  const balance = getMemberBalance(member, state.store.payments);
  if (balance.totalDue <= 0) {
    showToast("This member does not have a balance to invoice.");
    return;
  }

  const invoiceDate = new Date();
  const rows = balance.unpaidMonths
    .map((month) => `
      <tr>
        <td>${formatMonth(month)}</td>
        <td>Monthly training tuition</td>
        <td class="money">${formatMoney(balance.monthlyAmount)}</td>
      </tr>
    `)
    .join("");
  const contactLines = [member.parentName && `Parent/guardian: ${member.parentName}`, formatPhone(member.phone), member.email]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  const invoiceHtml = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice - ${escapeHtml(member.name)}</title>
        <style>
          body { margin: 0; background: #eef1f4; color: #1f2933; font-family: Arial, Helvetica, sans-serif; }
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
              <p>Member tuition invoice</p>
            </div>
            <div class="meta">
              <img src="${new URL("assets/wmac-logo.jpeg", import.meta.url).href}" alt="World Martial Arts Center logo">
              <div>Invoice date: ${invoiceDate.toLocaleDateString()}</div>
            </div>
          </header>

          <section class="billto">
            <h2>Bill To</h2>
            <strong>${escapeHtml(member.name)}</strong>
            ${contactLines}
          </section>

          <section>
            <h2>Amount Needed</h2>
            <table>
              <thead>
                <tr><th>Month</th><th>Description</th><th class="money">Amount</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="total">Total due: ${formatMoney(balance.totalDue)}</div>
          </section>

          <div class="note">Please bring this account current at your next class or contact the front desk if a payment was already made.</div>
        </main>
        <div class="actions"><button type="button" onclick="window.print()">Print or Save PDF</button></div>
      </body>
    </html>`;

  const invoiceWindow = window.open("", "_blank");
  if (!invoiceWindow) {
    showToast("The browser blocked the invoice window. Allow pop-ups for this app and try again.");
    return;
  }
  invoiceWindow.document.write(invoiceHtml);
  invoiceWindow.document.close();
}

function selectedMember() {
  return state.store.members.find((member) => member.id === state.selectedId);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatMonth(month) {
  if (!month) {
    return "";
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
  showToast.timer = window.setTimeout(() => elements.toast.classList.add("hidden"), 4200);
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
