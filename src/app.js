import {
  MEMBER_FIELD_ALIASES,
  PAYMENT_FIELD_ALIASES,
  addPayment,
  accountMembers,
  defaultAgreementEndDate,
  exportDailyPaymentStatusRows,
  exportRosterRows,
  exportStoreRows,
  getAgreementExpirationStatus,
  getContractDownPaymentRecord,
  getMemberBalance,
  getLateFeeBalance,
  getLandscapeRows,
  getMemberStatus,
  getMemberPaymentState,
  getResponsibleParty,
  getYearRevenue,
  guessColumnMap,
  householdMembers,
  importMembersFromRecords,
  importPaymentsFromRecords,
  isFullBackupCsv,
  migrateStore,
  nextUnpaidTuitionMonth,
  pendingStagedPaymentsForMember,
  parseCsv,
  recordContractDownPayment,
  removePayment,
  reconcileDuePayments,
  restoreStoreFromBackupRows,
  searchMembers,
  isActiveParticipant,
  stagedPaymentMonth,
  suggestedPaymentMember,
  toCsv,
  undoPaymentBatch,
  upsertMember
} from "./data.js";
import { loadStoreWithMigrationBackup } from "./storage.js";
import { getOperatorBrief } from "./operator.js";
import { createActivityLog, recordActivity, undoActivity } from "./activity.js";
import { buildRenewalEmail, formatAgreementDate } from "./renewals.js";
import {
  DEFAULT_EMAIL_TEMPLATE,
  ATTENTION_COPY,
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
import {
  CERTIFICATION_LEVELS,
  certificationProgress,
  nextMemberCertification,
  normalizeMemberCertifications,
  primaryCertificationLabel
} from "./certification.js";
import {
  buildCollectionPlacement,
  collectionInfoFromDraft,
  collectionPlacementFilename,
  createCollectionDraft,
  createFirstCreditServicesWorkbook,
  firstCreditServicesEmailDraft,
  getCollectionMissingFields
} from "./collections.js";

const STORAGE_KEY = "master-lee-payment-tracker";
const EMAIL_TEMPLATE_KEY = "master-lee-payment-tracker-email-template";
const ACTIVITY_LOG_KEY = "master-lee-payment-tracker-activity";
const RENEWAL_CONTRACT_URL = new URL("./assets/WMAC-membership-agreement-with-contact-permission.pdf", import.meta.url).href;
const RENEWAL_CONTRACT_FILENAME = "WMAC-membership-agreement-renewal.pdf";

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
  review: null,
  attentionReview: null,
  contractDatePicker: null,
  lastPaymentBatch: null,
  renewalNoticesShown: new Set(),
  activityLog: loadActivityLog(),
  landscapeFilter: "all",
  stagedPayments: [],
  selectedStagedId: "",
  paymentProviders: {
    square: { configured: false, error: "" }
  }
};

const elements = {};
[
  "saveStatus", "globalSearchInput", "globalSearchResults", "homeTab", "membersTab", "landscapeTab", "squareTab", "appLayout", "memberSidebar",
  "memberCsv", "paymentCsv", "restoreBackupCsv", "exportButton", "dailyStatusEmailButton",
  "searchInput", "addMemberButton", "paidCount", "pendingCount", "watchCount", "lateCount",
  "memberList", "dashboardView", "landscapeView", "landscapeSummary", "landscapeHead", "landscapeBody", "landscapeReviewButton",
  "todayFollowupCount", "todayFollowupList", "reviewAllAttentionButton", "startTodayReview", "dailyBriefSummary",
  "briefDueCard", "briefDueCount", "briefDueAmount", "briefCardCard", "briefCardCount", "briefCardDetail",
  "briefSetupCard", "briefSetupCount", "briefSetupDetail", "briefWeekCard", "briefWeekCount", "briefWeekAmount",
  "dashboardMonthLabel", "flowCollected", "flowCovered", "flowExpected", "flowDue", "flowProgress", "flowProgressText", "flowProgressLabel", "sixMonthFlow", "recentActivityList",
  "squareView", "squareStatusLine",
  "syncSquareButton", "squareSummary", "squarePayments",
  "squareDetail", "squareQueueHelp", "squareRelayUrl", "squareRelayToken", "saveSquareSettingsButton", "squareSettingsStatus", "rosterView",
  "backToDashboard", "rosterTitle", "rosterHelp", "rosterMembers", "emptyState",
  "memberDetail", "detailInitials", "detailName", "detailContact", "detailDueDay", "statusBadge", "contractRenewalFlag", "latestPaid", "householdCard", "familyAccountPanel", "familyAccountForm", "familyAccountHouseholdName", "familyAccountTotal", "familyExistingMember", "addExistingFamilyMemberButton", "familyAccountMembers", "addFamilyParentButton", "addFamilyChildButton", "progressCard",
  "contractRenewalNotice", "contractRenewalTitle", "contractRenewalMessage", "contractRenewalOpenButton", "contractRenewalEmailButton",
  "quickPayButton", "catchUpButton", "undoCatchUpButton", "paymentUpdatePanel", "monthStrip", "billingActionsPanel", "invoiceSummary", "invoiceButton", "emailButton", "collectionButton", "collectionNotice", "squareRecurringButton", "squareRecurringStatus",
  "quickProfilePanel", "quickProfileForm", "quickMemberName", "quickMemberDob", "quickMemberCellPhone", "quickMemberEmail", "quickMemberAddress", "quickMemberCity", "quickMemberState", "quickMemberZip", "quickResponsibleParty", "quickAgreementType", "quickMemberAmount", "quickMemberStart", "quickMemberAgreementEnd",
  "memberForm", "memberName",
  "memberHomePhone", "memberWorkPhone", "memberCellPhone", "memberAddress", "memberCity", "memberState", "memberZip", "memberDob",
  "memberEmail", "memberParent", "memberResponsibleParty", "memberHousehold", "memberRole", "memberParticipant",
  "memberTaeKwonDo", "memberMuayThai", "memberBeltLevel", "memberMuayThaiLevel", "memberNextLevel", "memberSquareCustomerId", "memberAmount", "memberLateFeeMinimum", "memberLateFeePercentage", "memberStart",
  "memberAgreementType", "memberAgreementEnd", "memberDownPayment", "memberRecordDownPaymentButton", "memberDownPaymentRecordStatus", "memberEmailConsent", "memberTextConsent", "memberPhoneConsent",
  "memberInactive", "mappingDialog", "mappingForm", "mappingTitle",
  "mappingHelp", "mappingReassure", "mappingFields", "cancelMapping", "toast",
  "yearReportButton", "nextYearCsvButton", "yearDialog",
  "yearLastButton", "yearThisButton", "cancelYearDialog", "paymentReviewDialog",
  "reviewTitle", "reviewHelp", "reviewMonthList", "reviewTotal", "emailSubjectInput",
  "emailBodyInput", "emailPreview", "saveEmailTemplateButton", "resetEmailTemplateButton",
  "generateSelectedInvoiceButton", "openSelectedEmailButton", "cancelPaymentReview",
  "emailAllMembersButton", "groupEmailDialog", "groupEmailHelp", "groupEmailSubjectInput",
  "groupEmailMembers", "selectAllEmailMembersButton", "clearAllEmailMembersButton",
  "cancelGroupEmailButton", "openGroupEmailButton",
  "attentionReviewDialog", "attentionReviewProgress", "attentionReviewName", "attentionReviewContext", "attentionReviewFacts",
  "attentionReviewMonths", "attentionAllPaid", "attentionKeepAsIs", "attentionExceptButton", "attentionExceptionPanel",
  "attentionExceptionMonths", "attentionSaveExceptions", "attentionReviewMessage", "attentionUndoButton", "closeAttentionReview",
  "updatePanel", "updateStatus", "checkUpdateButton", "installUpdateButton",
  "collectionDialog", "collectionForm", "cancelCollectionDialog", "collectionMissing", "collectionSummary",
  "collectionFirstName", "collectionLastName", "collectionAddress", "collectionCity", "collectionState", "collectionZip", "collectionDob",
  "collectionHomePhone", "collectionWorkPhone", "collectionCellPhone", "collectionAgreementSign", "collectionAgreementExpiration",
  "collectionAgreementType", "collectionChargeOffDate", "collectionServiceFees", "collectionDownPayment", "collectionEmailConsent",
  "collectionTextConsent", "collectionFinalized", "collectionDownloadButton", "collectionDownloadEmailButton",
  "contractDatePickerDialog", "contractDatePickerTitle", "contractDatePickerClose", "contractDatePickerPreviousYear",
  "contractDatePickerNextYear", "contractDatePickerYear", "contractDatePickerSelected", "contractDatePickerMonths",
  "contractRenewalDialog", "contractRenewalDialogIcon", "contractRenewalDialogTitle", "contractRenewalDialogMessage",
  "contractRenewalDialogOpenButton", "contractRenewalDialogEmailButton", "contractRenewalDialogClose"
].forEach((id) => {
  elements[id] = document.querySelector(`#${id}`);
});

function populateCertificationControls() {
  elements.memberBeltLevel.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "선택 안 함 · Not set";
  elements.memberBeltLevel.append(placeholder);
  CERTIFICATION_LEVELS.forEach((level) => {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = level;
    elements.memberBeltLevel.append(option);
  });
}

function setCertificationControlValue(select, value) {
  select.querySelector("[data-legacy-level]")?.remove();
  const savedValue = String(value || "");
  const known = Array.from(select.options).some((option) => option.value === savedValue);
  if (savedValue && !known) {
    const legacyOption = document.createElement("option");
    legacyOption.value = savedValue;
    legacyOption.textContent = `${savedValue} (기존 값 · Saved legacy value)`;
    legacyOption.dataset.legacyLevel = "true";
    select.append(legacyOption);
  }
  select.value = savedValue;
}

function updateNextCertificationField() {
  const member = {
    certifications: {
      tae_kwon_do: elements.memberBeltLevel.value,
      muay_thai: elements.memberMuayThaiLevel.value,
      legacyLabel: ""
    }
  };
  elements.memberNextLevel.value = nextMemberCertification(member) || (primaryCertificationLabel(member) ? "최고 자격 레벨 · Highest certification level" : "");
}

function syncMemberAgreementEndDate() {
  const previousStart = elements.memberStart.dataset.previousValue || selectedMember()?.startDate || "";
  const previousDefault = defaultAgreementEndDate(previousStart);
  if (!elements.memberAgreementEnd.value || elements.memberAgreementEnd.value === previousDefault) {
    elements.memberAgreementEnd.value = defaultAgreementEndDate(elements.memberStart.value);
  }
  elements.memberStart.dataset.previousValue = elements.memberStart.value;
}

function syncQuickAgreementEndDate() {
  const previousStart = elements.quickMemberStart.dataset.previousValue || selectedMember()?.startDate || "";
  const previousDefault = defaultAgreementEndDate(previousStart);
  if (!elements.quickMemberAgreementEnd.value || elements.quickMemberAgreementEnd.value === previousDefault) {
    elements.quickMemberAgreementEnd.value = defaultAgreementEndDate(elements.quickMemberStart.value);
  }
  elements.quickMemberStart.dataset.previousValue = elements.quickMemberStart.value;
}

function suggestedHouseholdName(payerId, member = selectedMember()) {
  const payer = state.store.members.find((candidate) => candidate.id === payerId);
  if (!payer?.name || !member || payer.id === member.id) {
    return "";
  }
  return `${payer.name} Family`;
}

function syncHouseholdNameWithPayer() {
  if (!elements.memberHousehold.value.trim()) {
    elements.memberHousehold.value = suggestedHouseholdName(elements.memberResponsibleParty.value);
  }
}

const CONTRACT_DATE_LABELS = {
  quickMemberStart: "Contract signing date",
  quickMemberAgreementEnd: "Contract end date",
  memberStart: "Contract signing date",
  memberAgreementEnd: "Contract end date"
};

function formatDatePickerValue(value) {
  if (!value) return "No date selected yet.";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function calendarMonthMarkup(year, month, selectedValue) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(year, month, 1));
  const blanks = Array.from({ length: firstWeekday }, () => '<span class="contract-calendar-day-empty" aria-hidden="true"></span>').join("");
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const selected = value === selectedValue ? " selected" : "";
    return `<button class="contract-calendar-day${selected}" type="button" data-contract-date-value="${value}" aria-label="${monthName} ${day}, ${year}">${day}</button>`;
  }).join("");
  return `<section class="contract-calendar-month"><h3>${monthName}</h3><div class="contract-calendar-weekdays" aria-hidden="true"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div><div class="contract-calendar-days">${blanks}${days}</div></section>`;
}

function renderContractDatePicker() {
  const picker = state.contractDatePicker;
  if (!picker) return;
  const input = document.querySelector(`#${picker.targetId}`);
  if (!input) return;
  const selectedValue = input.value;
  elements.contractDatePickerTitle.textContent = `${CONTRACT_DATE_LABELS[picker.targetId] || "Contract date"} · Year Calendar`;
  elements.contractDatePickerYear.textContent = String(picker.year);
  elements.contractDatePickerSelected.textContent = `Selected: ${formatDatePickerValue(selectedValue)}`;
  elements.contractDatePickerMonths.innerHTML = Array.from(
    { length: 12 },
    (_, month) => calendarMonthMarkup(picker.year, month, selectedValue)
  ).join("");
  elements.contractDatePickerMonths.querySelectorAll("[data-contract-date-value]").forEach((button) => {
    button.addEventListener("click", () => selectContractDate(button.dataset.contractDateValue));
  });
}

function openContractDatePicker(targetId) {
  const input = document.querySelector(`#${targetId}`);
  if (!input || input.disabled) return;
  const selectedYear = Number(input.value?.slice(0, 4));
  state.contractDatePicker = {
    targetId,
    year: Number.isInteger(selectedYear) && selectedYear > 0 ? selectedYear : new Date().getFullYear()
  };
  renderContractDatePicker();
  elements.contractDatePickerDialog.showModal();
}

function selectContractDate(value) {
  const picker = state.contractDatePicker;
  const input = picker && document.querySelector(`#${picker.targetId}`);
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  elements.contractDatePickerDialog.close();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

elements.homeTab.addEventListener("click", showDashboard);
elements.membersTab.addEventListener("click", showMembers);
elements.landscapeTab?.addEventListener("click", showLandscape);
elements.squareTab.addEventListener("click", showSquare);
elements.memberCsv.addEventListener("change", () => prepareCsvImport(elements.memberCsv.files[0], "members"));
elements.paymentCsv.addEventListener("change", () => prepareCsvImport(elements.paymentCsv.files[0], "payments"));
elements.restoreBackupCsv.addEventListener("change", () => prepareCsvImport(elements.restoreBackupCsv.files[0], "backup"));
elements.exportButton.addEventListener("click", exportBackup);
elements.dailyStatusEmailButton.addEventListener("click", exportDailyPaymentStatusEmail);
elements.searchInput.addEventListener("input", render);
elements.globalSearchInput.addEventListener("input", renderGlobalSearch);
elements.globalSearchInput.addEventListener("keydown", handleGlobalSearchKeydown);
elements.globalSearchResults.addEventListener("keydown", handleGlobalResultsKeydown);
elements.addMemberButton.addEventListener("click", addNewMember);
elements.paidCount.addEventListener("click", () => showRoster("paid"));
elements.pendingCount.addEventListener("click", () => showRoster("pending"));
elements.watchCount.addEventListener("click", () => showRoster("watch"));
elements.lateCount.addEventListener("click", () => showRoster("late"));
elements.startTodayReview.addEventListener("click", startDailyWork);
elements.briefDueCard.addEventListener("click", () => openAttentionReview());
elements.briefCardCard.addEventListener("click", showSquare);
elements.briefSetupCard.addEventListener("click", () => showRoster("setup"));
elements.briefWeekCard.addEventListener("click", showUpcomingLandscape);
elements.backToDashboard.addEventListener("click", showDashboard);
elements.syncSquareButton.addEventListener("click", syncSquarePayments);
elements.saveSquareSettingsButton.addEventListener("click", saveSquareConnectionSettings);
elements.quickPayButton.addEventListener("click", quickPayCurrentMonth);
elements.memberRecordDownPaymentButton.addEventListener("click", recordMemberDownPayment);
elements.catchUpButton.addEventListener("click", catchUpMemberPayments);
elements.undoCatchUpButton.addEventListener("click", undoMemberCatchUp);
elements.reviewAllAttentionButton.addEventListener("click", () => openAttentionReview());
elements.landscapeReviewButton.addEventListener("click", () => openAttentionReview());
elements.attentionAllPaid.addEventListener("click", markAttentionMemberPaid);
elements.attentionKeepAsIs.addEventListener("click", keepAttentionMemberAsIs);
elements.attentionExceptButton.addEventListener("click", toggleAttentionExceptions);
elements.attentionSaveExceptions.addEventListener("click", saveAttentionExceptions);
elements.attentionUndoButton.addEventListener("click", undoAttentionAction);
elements.closeAttentionReview.addEventListener("click", () => elements.attentionReviewDialog.close());
document.querySelectorAll("[data-landscape-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.landscapeFilter = button.dataset.landscapeFilter;
    renderLandscape();
  });
});
elements.invoiceButton.addEventListener("click", () => openPaymentReview("invoice"));
elements.emailButton.addEventListener("click", () => openPaymentReview("email"));
elements.collectionButton.addEventListener("click", openCollectionPlacement);
elements.squareRecurringButton.addEventListener("click", setUpSquareMonthlyInvoice);
elements.memberForm.addEventListener("submit", saveMember);
elements.quickProfileForm.addEventListener("submit", saveQuickProfile);
elements.familyAccountForm.addEventListener("submit", saveFamilyAccount);
elements.addFamilyParentButton.addEventListener("click", () => addFamilyAccountPerson("parent_guardian"));
elements.addFamilyChildButton.addEventListener("click", () => addFamilyAccountPerson("child"));
elements.addExistingFamilyMemberButton.addEventListener("click", addExistingMemberToFamily);
elements.familyAccountMembers.addEventListener("input", updateFamilyAccountDraftTotal);
elements.familyAccountMembers.addEventListener("change", updateFamilyAccountDraftTotal);
elements.familyAccountMembers.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-family-member]");
  if (removeButton) removeMemberFromFamily(removeButton.dataset.removeFamilyMember);
  const deleteButton = event.target.closest("[data-delete-family-member]");
  if (deleteButton) deleteMember(deleteButton.dataset.deleteFamilyMember);
});
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
elements.emailAllMembersButton.addEventListener("click", openGroupEmailDialog);
elements.groupEmailMembers.addEventListener("change", updateGroupEmailDialog);
elements.selectAllEmailMembersButton.addEventListener("click", () => setAllGroupEmailMembers(true));
elements.clearAllEmailMembersButton.addEventListener("click", () => setAllGroupEmailMembers(false));
elements.cancelGroupEmailButton.addEventListener("click", () => elements.groupEmailDialog.close());
elements.openGroupEmailButton.addEventListener("click", openGroupEmail);
elements.checkUpdateButton.addEventListener("click", checkForAppUpdate);
elements.installUpdateButton.addEventListener("click", installAppUpdate);
elements.cancelCollectionDialog.addEventListener("click", () => elements.collectionDialog.close());
elements.collectionForm.addEventListener("submit", (event) => finalizeCollectionPlacement(event, false));
elements.collectionDownloadEmailButton.addEventListener("click", (event) => finalizeCollectionPlacement(event, true));
elements.collectionForm.addEventListener("input", updateCollectionPlacementPreview);
elements.contractRenewalOpenButton.addEventListener("click", openRenewalContract);
elements.contractRenewalEmailButton.addEventListener("click", openRenewalEmail);
elements.contractRenewalDialogOpenButton.addEventListener("click", openRenewalContract);
elements.contractRenewalDialogEmailButton.addEventListener("click", openRenewalEmail);
elements.contractRenewalDialogClose.addEventListener("click", () => elements.contractRenewalDialog.close());
elements.contractDatePickerClose.addEventListener("click", () => elements.contractDatePickerDialog.close());
elements.contractDatePickerPreviousYear.addEventListener("click", () => {
  if (!state.contractDatePicker) return;
  state.contractDatePicker.year -= 1;
  renderContractDatePicker();
});
elements.contractDatePickerNextYear.addEventListener("click", () => {
  if (!state.contractDatePicker) return;
  state.contractDatePicker.year += 1;
  renderContractDatePicker();
});
document.querySelectorAll("[data-contract-date-picker]").forEach((button) => {
  button.addEventListener("click", () => openContractDatePicker(button.dataset.contractDatePicker));
});

populateCertificationControls();
elements.memberBeltLevel.addEventListener("change", updateNextCertificationField);
elements.memberMuayThaiLevel.addEventListener("change", updateNextCertificationField);
elements.memberStart.addEventListener("change", syncMemberAgreementEndDate);
elements.quickMemberStart.addEventListener("change", syncQuickAgreementEndDate);
elements.memberResponsibleParty.addEventListener("change", syncHouseholdNameWithPayer);

initAppUpdates();
render();
loadSquarePayments();
loadSquareConnectionSettings();

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function loadStore() {
  return loadStoreWithMigrationBackup(localStorage, { storageKey: STORAGE_KEY });
}

function saveStore(message = MSG.savedOnComputer) {
  state.store.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  elements.saveStatus.textContent = message;
}

function loadActivityLog() {
  return createActivityLog(localStorage.getItem(ACTIVITY_LOG_KEY));
}

function saveActivityLog() {
  localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(state.activityLog));
}

function logAddedPayments(member, paymentIds, months, labels = {}, metadata = {}, replacedPayments = []) {
  if (!paymentIds.length) {
    return "";
  }
  state.activityLog = recordActivity(state.activityLog, {
    kind: replacedPayments.length ? "payments-replaced" : "payments-added",
    memberId: member.id,
    memberName: member.name,
    paymentIds,
    months,
    labelKo: labels.ko || "납부 기록 추가",
    labelEn: labels.en || "Payment recorded",
    payments: replacedPayments,
    ...metadata
  });
  saveActivityLog();
  return state.activityLog.entries[0]?.id || "";
}

function logRemovedPayments(member, payments, labels = {}) {
  if (!payments.length) {
    return "";
  }
  state.activityLog = recordActivity(state.activityLog, {
    kind: "payments-removed",
    memberId: member.id,
    memberName: member.name,
    payments,
    months: payments.map((payment) => payment.month),
    labelKo: labels.ko || "납부 기록 취소",
    labelEn: labels.en || "Payment marked unpaid"
  });
  saveActivityLog();
  return state.activityLog.entries[0]?.id || "";
}

function logProviderStatus(payment, labels = {}) {
  if (!payment?.id) {
    return "";
  }
  state.activityLog = recordActivity(state.activityLog, {
    kind: "provider-status",
    memberId: payment.memberId || payment.suggestedMemberId || "",
    memberName: state.store.members.find((member) => member.id === (payment.memberId || payment.suggestedMemberId))?.name || payment.buyerName || "",
    stagedPaymentId: payment.id,
    provider: "square",
    previousStatus: payment.status || "pending",
    labelKo: labels.ko || "카드 검토 상태 변경",
    labelEn: labels.en || "Card review status changed"
  });
  saveActivityLog();
  return state.activityLog.entries[0]?.id || "";
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
  renderLandscape();
  renderSquare();
  renderRoster();
  renderMemberList();
  renderDetail();
}

function renderPageShell() {
  const isHome = state.page === "home";
  const isSquare = state.page === "square";
  const isLandscape = state.page === "landscape";
  elements.appLayout.classList.toggle("home-layout", isHome);
  elements.appLayout.classList.toggle("members-layout", state.page === "members");
  elements.appLayout.classList.toggle("roster-active", state.page === "members" && state.view === "roster");
  elements.appLayout.classList.toggle("landscape-layout", isLandscape);
  elements.appLayout.classList.toggle("square-layout", isSquare);
  elements.memberSidebar.classList.toggle("hidden", state.page !== "members");
  elements.homeTab.classList.toggle("active", isHome);
  elements.membersTab.classList.toggle("active", state.page === "members");
  elements.landscapeTab?.classList.toggle("active", isLandscape);
  elements.squareTab.classList.toggle("active", isSquare);
  elements.homeTab.setAttribute("aria-current", isHome ? "page" : "false");
  elements.membersTab.setAttribute("aria-current", state.page === "members" ? "page" : "false");
  elements.landscapeTab?.setAttribute("aria-current", isLandscape ? "page" : "false");
  elements.squareTab.setAttribute("aria-current", isSquare ? "page" : "false");
}

function renderSummary() {
  const counts = statusCounts();
  elements.paidCount.innerHTML = `완납 ${counts.paid}명 <small lang="en">paid</small>`;
  elements.pendingCount.innerHTML = `대기 ${counts.pending}명 <small lang="en">pending</small>`;
  elements.watchCount.innerHTML = `확인 필요 ${counts.watch}명 <small lang="en">attention</small>`;
  elements.lateCount.innerHTML = `미납 ${counts.late}명 <small lang="en">behind</small>`;
}

function renderGlobalSearch() {
  const query = elements.globalSearchInput.value.trim().toLocaleLowerCase();
  if (!query) {
    elements.globalSearchResults.classList.add("hidden");
    return;
  }
  const members = searchMembers(state.store.members, query).slice(0, 8);
  elements.globalSearchResults.innerHTML = members.length
    ? members.map((member, index) => {
      const payer = getResponsibleParty(member, state.store.members) || member;
      const isPayer = payer.id === member.id;
      const status = isPayer ? displayedMemberStatus(member) : null;
      const context = member.inactive
        ? "쉬는 회원 · Inactive"
        : !isPayer
          ? `${payer.name} 계정에서 납부 관리 · Payer account`
          : member.participant === false && !accountMembers(state.store.members, payer).some(isActiveParticipant)
          ? "가족 연락처 · Family contact"
          : `${STATUS_LABELS[status.level].ko} · ${STATUS_LABELS[status.level].en}`;
      const accountLabel = payer.id === member.id
        ? member.householdName || "개인 계정 · Individual account"
        : `${payer.name} · Payer account`;
      return `<button type="button" data-global-member="${escapeHtml(member.id)}" ${index === 0 ? "data-first-result" : ""}><span><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(accountLabel)}</small></span><em>${escapeHtml(context)}</em></button>`;
    }).join("")
    : `<div class="global-find-empty">찾는 회원이 없습니다.<small lang="en">No matching members.</small></div>`;
  elements.globalSearchResults.classList.remove("hidden");
  elements.globalSearchResults.querySelectorAll("[data-global-member]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.globalSearchInput.value = "";
      elements.globalSearchResults.classList.add("hidden");
      selectMember(button.dataset.globalMember);
    });
  });
}

function handleGlobalResultsKeydown(event) {
  const buttons = Array.from(elements.globalSearchResults.querySelectorAll("[data-global-member]"));
  const currentIndex = buttons.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    elements.globalSearchInput.value = "";
    renderGlobalSearch();
    elements.globalSearchInput.focus();
    return;
  }
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && currentIndex >= 0) {
    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    buttons[(currentIndex + offset + buttons.length) % buttons.length].focus();
  }
}

function handleGlobalSearchKeydown(event) {
  if (event.key === "Escape") {
    elements.globalSearchInput.value = "";
    renderGlobalSearch();
  }
  if (event.key === "Enter") {
    const firstResult = elements.globalSearchResults.querySelector("[data-first-result]");
    if (firstResult) {
      event.preventDefault();
      firstResult.click();
    }
  }
  if (event.key === "ArrowDown") {
    const firstResult = elements.globalSearchResults.querySelector("[data-first-result]");
    if (firstResult) {
      event.preventDefault();
      firstResult.focus();
    }
  }
}

function renderDashboard() {
  elements.dashboardView.classList.toggle("hidden", state.view !== "dashboard");
  if (state.view !== "dashboard") {
    return;
  }
  const brief = getOperatorBrief(state.store, state.stagedPayments);
  const followups = brief.tuitionFollowups;
  const actionCount = followups.length + brief.pendingCards.length + brief.setupRows.length;
  const today = new Date(`${brief.asOf}T12:00:00`);
  const koDate = today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const enDate = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  elements.dashboardMonthLabel.innerHTML = `<span lang="ko">${escapeHtml(koDate)}</span><small lang="en">${escapeHtml(enDate)}</small>`;
  elements.dailyBriefSummary.innerHTML = actionCount
    ? `<strong>${actionCount}개의 작업이 준비되어 있습니다.</strong><small lang="en">${actionCount} item${actionCount === 1 ? " is" : "s are"} ready for your attention.</small>`
    : `<strong>오늘 처리할 긴급 작업이 없습니다.</strong><small lang="en">The desk is clear. Nothing urgent needs action.</small>`;
  elements.startTodayReview.disabled = actionCount === 0;
  elements.briefDueCard.disabled = followups.length === 0;
  elements.briefDueCount.textContent = `${followups.length}명`;
  elements.briefDueAmount.textContent = formatMoney(followups.reduce((sum, item) => sum + Number(item.actionableAmount || 0), 0));
  elements.briefCardCount.textContent = `${brief.pendingCards.length}건`;
  const cardAmount = formatMoney(brief.pendingCards.reduce((sum, item) => sum + item.amount, 0));
  elements.briefCardDetail.innerHTML = `<span lang="ko">${cardAmount} 검토 대기</span><small lang="en">${cardAmount} awaiting review</small>`;
  elements.briefSetupCount.textContent = `${brief.setupRows.length}명`;
  elements.briefWeekCount.textContent = `${brief.totals.next7Days.members}명`;
  const scheduledAmount = formatMoney(brief.totals.next7Days.amount);
  elements.briefWeekAmount.innerHTML = `<span lang="ko">${scheduledAmount} 예정</span><small lang="en">${scheduledAmount} scheduled</small>`;
  elements.flowCollected.textContent = formatMoney(brief.totals.cashReceivedThisMonth.amount);
  elements.flowCovered.textContent = formatMoney(brief.totals.serviceMonthCovered.appliedAmount);
  elements.flowExpected.textContent = formatMoney(brief.totals.serviceMonthExpected.amount);
  elements.flowDue.textContent = formatMoney(brief.totals.dueNow.amount);
  elements.flowProgressText.textContent = `${brief.totals.coverageRate}%`;
  elements.flowProgressLabel.innerHTML = `<span lang="ko">이번 달 납부 회원 ${brief.totals.serviceMonthCovered.members}/${brief.totals.serviceMonthExpected.members}</span><span lang="en">Members paid this month ${brief.totals.serviceMonthCovered.members}/${brief.totals.serviceMonthExpected.members}</span>`;
  elements.flowProgress.style.width = `${brief.totals.coverageRate}%`;
  elements.flowProgress.parentElement.setAttribute("aria-valuenow", String(brief.totals.coverageRate));
  const maximumFlow = Math.max(1, ...brief.sixMonthFlow.map((row) => row.tuitionAmount));
  elements.sixMonthFlow.innerHTML = brief.sixMonthFlow.map((row) => {
    const height = Math.max(row.tuitionAmount ? 12 : 2, Math.round((row.tuitionAmount / maximumFlow) * 100));
    return `<div class="flow-month"><span class="flow-bar-track"><i style="height:${height}%"></i></span><strong>${escapeHtml(formatMonthKo(row.month).replace(/^\d+년 /, ""))}</strong><small>${formatMoney(row.tuitionAmount)}</small></div>`;
  }).join("");

  renderTodayFollowups(brief);
  renderRecentActivity();
}

function renderTodayFollowups(brief = getOperatorBrief(state.store, state.stagedPayments)) {
  const rows = brief.tuitionFollowups;
  elements.todayFollowupCount.textContent = rows.length;
  elements.reviewAllAttentionButton.disabled = rows.length === 0;
  elements.reviewAllAttentionButton.querySelector("small").textContent = rows.length
    ? `${ATTENTION_COPY.reviewAll.en} ${rows.length}`
    : "Nothing due today";
  elements.todayFollowupList.innerHTML = rows.length
    ? rows.slice(0, 7).map((row) => `
      <button class="today-followup-member ${row.reason === "behind" ? "urgent" : ""}" type="button" data-followup-member="${escapeHtml(row.memberId)}">
        <span>
          <strong>${escapeHtml(row.memberName)}</strong>
          <small>${row.householdName ? escapeHtml(row.householdName) : `<span lang="ko">개인 회원</span><span lang="en">Individual</span>`}</small>
        </span>
        <span class="followup-amount">
          <strong>${formatMoney(row.actionableAmount)}</strong>
          <small>${row.daysLate === 0 ? `<span lang="ko">오늘 납부일</span><span lang="en">Due today</span>` : `<span lang="ko">${row.daysLate}일 지남</span><span lang="en">${row.daysLate} days late</span>`}</small>
        </span>
      </button>
    `).join("")
    : `<div class="followup-clear"><strong>오늘 확인할 미납 없음</strong><small lang="en">No tuition due for follow-up today</small></div>`;
  elements.todayFollowupList.querySelectorAll("[data-followup-member]").forEach((button) => {
    button.addEventListener("click", () => openAttentionReview(button.dataset.followupMember));
  });
}

function renderRecentActivity() {
  const activities = state.activityLog.entries.slice(0, 6);
  elements.recentActivityList.innerHTML = activities.length
    ? activities.map((activity) => {
      const monthText = activity.months.length === 1
        ? formatMonthBi(activity.months[0])
        : activity.months.length > 1
          ? `${activity.months.length}개월 · ${activity.months.length} months`
          : "카드 검토 · Card review";
      return `<div class="activity-item ${activity.undoneAt ? "undone" : ""}">
        <div><strong>${escapeHtml(activity.memberName || "회원 · Member")}</strong><span>${escapeHtml(activity.labelKo || "납부 변경")}</span><small lang="en">${escapeHtml(activity.labelEn || "Payment change")} · ${escapeHtml(monthText)}</small></div>
        ${activity.undoneAt
          ? `<span class="activity-undone">취소됨<small lang="en">Undone</small></span>`
          : `<button type="button" class="activity-undo bi" data-undo-activity="${escapeHtml(activity.id)}"><span lang="ko">실행 취소</span><small lang="en">Oops — Undo</small></button>`}
      </div>`;
    }).join("")
    : `<div class="activity-empty"><strong>아직 작업이 없습니다.</strong><small lang="en">Payment changes will appear here with Undo.</small></div>`;
  elements.recentActivityList.querySelectorAll("[data-undo-activity]").forEach((button) => {
    button.addEventListener("click", () => undoRecentActivity(button.dataset.undoActivity));
  });
}

async function undoRecentActivity(activityId) {
  const activity = state.activityLog.entries.find((entry) => entry.id === activityId);
  const result = undoActivity(state.store, state.activityLog, activityId);
  if (!result.undone) {
    if (result.blockedBy) {
      showToast("이 결제의 더 최근 작업을 먼저 취소하세요. · Undo the newer change for this payment first.");
    }
    return;
  }
  if (activity?.stagedPaymentId) {
    const statusSaved = await saveStagedStatus(activity.stagedPaymentId, {
      status: activity.previousStatus || "pending",
      approvedAt: "",
      ignoredAt: "",
      ignoredReason: ""
    });
    if (!statusSaved) {
      showToast("카드 결제 상태를 되돌리지 못했습니다. 다시 시도하세요. · Could not restore the card payment status. Please try again.");
      render();
      return;
    }
  }
  state.store = result.store;
  state.activityLog = result.log;
  saveActivityLog();
  saveStore("선택한 작업을 취소했습니다. · Selected action undone.");
  showToast("선택한 작업을 취소했습니다. · Selected action undone.");
  render();
}

function renderLandscape() {
  elements.landscapeView.classList.toggle("hidden", state.view !== "landscape");
  if (state.view !== "landscape") {
    return;
  }
  const landscape = getLandscapeRows(state.store, state.stagedPayments);
  const brief = getOperatorBrief(state.store, state.stagedPayments);
  const months = [...landscape.months].reverse();
  const upcomingMemberIds = new Set(brief.dueNext7Days.map((row) => row.memberId));
  const rows = landscape.rows.filter((row) => {
    if (state.landscapeFilter === "due") return row.paymentState.dueUnpaidMonths.length > 0 && !row.paymentState.flags.setupNeeded;
    if (state.landscapeFilter === "late") return row.paymentState.level === "late";
    if (state.landscapeFilter === "pending") return row.paymentState.flags.pending;
    if (state.landscapeFilter === "setup") return row.paymentState.flags.setupNeeded;
    if (state.landscapeFilter === "upcoming") return upcomingMemberIds.has(row.member.id);
    return true;
  });
  const attentionCount = brief.tuitionFollowups.length;
  elements.landscapeSummary.textContent = `${rows.length}명 표시 · ${rows.length} shown / ${landscape.rows.length} active · ${attentionCount}명 오늘 검토`;
  elements.landscapeReviewButton.disabled = attentionCount === 0;
  document.querySelectorAll("[data-landscape-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.landscapeFilter === state.landscapeFilter);
    button.setAttribute("aria-pressed", String(button.dataset.landscapeFilter === state.landscapeFilter));
  });
  elements.landscapeHead.innerHTML = `
    <tr>
      <th scope="col" class="sticky-member"><span lang="ko">회원</span><small lang="en">Member</small></th>
      <th scope="col"><span lang="ko">가족</span><small lang="en">Household</small></th>
      <th scope="col"><span lang="ko">자격</span><small lang="en">Certification</small></th>
      <th scope="col"><span lang="ko">납부일</span><small lang="en">Due Day</small></th>
      <th scope="col"><span lang="ko">상태</span><small lang="en">Status</small></th>
      <th scope="col"><span lang="ko">오늘까지 미납</span><small lang="en">Due Now</small></th>
      ${months.map((month, index) => `<th scope="col" class="${index === 0 ? "current-month-column" : ""}"><span>${formatMonthKo(month)}</span><small lang="en">${escapeHtml(formatMonthEn(month))}</small></th>`).join("")}
    </tr>
  `;
  elements.landscapeBody.innerHTML = rows.length ? rows.map((row) => {
    const mainStatus = STATUS_LABELS[row.paymentState.level];
    const pending = row.paymentState.flags.pending ? `<small class="pending-flag">카드 검토 중 · Card pending</small>` : "";
    const setup = row.paymentState.flags.setupNeeded ? `<small class="setup-flag">정보 확인 필요 · Setup needed</small>` : "";
    const cellsByMonth = new Map(row.cells.map((cell) => [cell.month, cell]));
    return `
      <tr class="landscape-row payment-${row.paymentState.level}">
        <th scope="row" class="sticky-member"><button type="button" class="landscape-member-link" data-landscape-member="${escapeHtml(row.member.id)}">${escapeHtml(row.member.name)}</button></th>
        <td>${escapeHtml(row.member.householdName || "—")}</td>
        <td>${escapeHtml(row.certification || "미설정 · Not set")}</td>
        <td>${row.dueDay ? `${row.dueDay}일<small lang="en">Day ${row.dueDay}</small>` : "—"}</td>
        <td><span class="matrix-status status-${row.paymentState.level}">${mainStatus.ko}<small lang="en">${mainStatus.en}</small></span>${pending}${setup}</td>
        <td class="money-cell">${row.paymentState.flags.setupNeeded ? "—<small lang=\"en\">Setup needed</small>" : `${formatMoney(row.balance.dueNow)}<small lang="en">${row.paymentState.dueUnpaidMonths.length} due installment${row.paymentState.dueUnpaidMonths.length === 1 ? "" : "s"}</small>`}</td>
        ${months.map((month, index) => landscapeCellMarkup(row.member.id, row.member.name, cellsByMonth.get(month), index === 0)).join("")}
      </tr>
    `;
  }).join("") : `<tr class="landscape-empty-row"><td colspan="18"><strong>이 조건에 맞는 회원이 없습니다.</strong><small lang="en">No members match this filter.</small><button type="button" class="button secondary bi" data-landscape-reset><span lang="ko">전체 보기</span><small lang="en">Show All</small></button></td></tr>`;
  elements.landscapeBody.querySelectorAll("[data-landscape-member]").forEach((button) => {
    button.addEventListener("click", () => selectMember(button.dataset.landscapeMember));
  });
  elements.landscapeBody.querySelectorAll("[data-landscape-review-member]").forEach((button) => {
    button.addEventListener("click", () => openAttentionReview(button.dataset.landscapeReviewMember));
  });
  elements.landscapeBody.querySelector("[data-landscape-reset]")?.addEventListener("click", () => {
    state.landscapeFilter = "all";
    renderLandscape();
  });
}

function landscapeCellMarkup(memberId, memberName, cell, current = false) {
  const details = {
    paid: ["✓", "납부 완료 · Paid"],
    attention: ["!", "확인 필요 · Due now"],
    behind: ["!", "미납 · 10+ days behind"],
    pending: ["…", "카드 검토 중 · Card payment pending"],
    upcoming: ["○", "아직 납부일 전 · Not due yet"],
    not_billable: ["—", "해당 없음 · Not billable"]
  }[cell.state];
  const actionable = cell.state === "attention" || cell.state === "behind";
  const contents = actionable
    ? `<button type="button" class="matrix-cell-button" data-landscape-review-member="${escapeHtml(memberId)}" aria-label="Review ${escapeHtml(memberName)} ${escapeHtml(formatMonthEn(cell.month))}: ${details[1]}"><span aria-hidden="true">${details[0]}</span><span class="sr-only">${details[1]}</span></button>`
    : `<span aria-hidden="true">${details[0]}</span><span class="sr-only">${details[1]}</span>`;
  return `<td class="matrix-cell ${cell.state} ${actionable ? "actionable" : ""} ${current ? "current-month-column" : ""}" aria-label="${escapeHtml(memberName)} ${escapeHtml(formatMonthEn(cell.month))}: ${details[1]}">${contents}</td>`;
}

function renderSquare() {
  elements.squareView.classList.toggle("hidden", state.view !== "square");
  if (state.view !== "square") {
    return;
  }

  const pending = state.stagedPayments.filter((payment) => payment.status === "pending" || payment.status === "needs_match");
  const approved = state.stagedPayments.filter((payment) => payment.status === "approved");
  const ignored = state.stagedPayments.filter((payment) => payment.status === "ignored");
  const providerStatus = providerStatusText();
  const errors = Object.values(state.paymentProviders).map((provider) => provider.error).filter(Boolean);
  elements.squareStatusLine.textContent = errors[0] || `${providerStatus} · ${pending.length} pending`;
  elements.squareSummary.innerHTML = `
    <div class="metric-card status-pending"><span>대기 <small lang="en">Pending</small></span><strong>${pending.length}</strong></div>
    <div class="metric-card status-watch"><span>회원 선택 필요 <small lang="en">Needs Match</small></span><strong>${state.stagedPayments.filter((payment) => payment.status === "needs_match").length}</strong></div>
    <div class="metric-card status-paid"><span>승인됨 <small lang="en">Approved</small></span><strong>${approved.length}</strong></div>
    <div class="metric-card neutral"><span>보류/무시 <small lang="en">Ignored</small></span><strong>${ignored.length}</strong></div>
  `;
  if (elements.squareQueueHelp) {
    elements.squareQueueHelp.textContent = `${state.stagedPayments.length}건 · ${state.stagedPayments.length} payment${state.stagedPayments.length === 1 ? "" : "s"} · 최신순 Newest first`;
  }

  if (state.stagedPayments.length === 0) {
    elements.squarePayments.innerHTML = `
      <div class="empty-state compact square-empty">
        <h3>아직 카드 결제가 없습니다 <small lang="en">No card payments yet</small></h3>
        <p>Square 거래를 동기화하면 승인 전 확인 목록에 표시됩니다. · Sync Square to review incoming payments.</p>
      </div>
    `;
    elements.squareDetail.innerHTML = emptyPaymentDetailMarkup();
    return;
  }

  const selectedPayment = selectedStagedPayment();
  elements.squarePayments.innerHTML = state.stagedPayments.map((payment) => stagedPaymentQueueMarkup(payment)).join("");
  elements.squareDetail.innerHTML = selectedPayment ? stagedPaymentDetailMarkup(selectedPayment) : emptyPaymentDetailMarkup();
  bindStagedPaymentEvents();
}

function renderRoster() {
  elements.rosterView.classList.toggle("hidden", state.view !== "roster");
  if (state.view !== "roster") {
    return;
  }

  const title = ROSTER_TITLES[state.statusFilter] || ROSTER_TITLES.all;
  const searchedIds = new Set(searchMembers(state.store.members, elements.searchInput.value).map((member) => member.id));
  const rows = memberRows().filter((row) =>
    searchedIds.has(row.member.id) &&
    (state.statusFilter === "all" ||
      (state.statusFilter === "pending" ? row.status.flags?.pending :
        state.statusFilter === "setup" ? row.status.flags?.setupNeeded :
          row.status.level === state.statusFilter))
  );
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

  let accountId = "";
  members.forEach((member) => {
    const payer = getResponsibleParty(member, state.store.members) || member;
    if (payer.id !== accountId) {
      accountId = payer.id;
      const familySize = accountMembers(state.store.members, payer).length;
      if (familySize > 1) {
        const heading = document.createElement("div");
        heading.className = "account-list-heading";
        heading.textContent = `계정 · Account: ${payer.name || "Unnamed member"}`;
        elements.memberList.append(heading);
      }
    }
    const isPayer = member.id === payer.id;
    const status = displayedMemberStatus(member);
    const renewal = getAgreementExpirationStatus(member);
    const contactOnly = member.participant === false && !isPayer;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `member-item ${member.id === state.selectedId ? "active" : ""} ${member.id !== payer.id ? "account-dependent" : "account-payer"} ${renewal.level === "expiring" || renewal.level === "expired" ? `contract-${renewal.level}` : ""}`;
    const renewalLabel = renewal.level === "expired"
      ? " · 계약 만료 · Contract expired"
      : renewal.level === "expiring"
      ? ` · 계약 ${renewal.daysUntil}일 남음 · Contract ${renewal.daysUntil}d`
      : "";
    const paymentSummary = !isPayer
      ? `${payer.name} 납부자 계정 · Covered by payer`
      : contactOnly
        ? "비참가 연락처 · Contact only"
        : `${STATUS_LABELS[status.level].ko}${status.lastPaidMonth ? ` · ${formatMonthKo(status.lastPaidMonth)}` : ""}${renewalLabel}`;
    button.innerHTML = `
      <strong><span class="dot ${contactOnly ? "contact" : status.level}"></span>${escapeHtml(member.name)}${member.id === payer.id ? " <small class=\"account-owner-label\">Payer</small>" : ""}</strong>
      <span>${escapeHtml(paymentSummary)}</span>
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

  const collectionPlacement = member.collectionPlacement?.status === "charged_off" ? member.collectionPlacement : null;
  const collectionPlaced = Boolean(collectionPlacement);
  const payer = getResponsibleParty(member, state.store.members) || member;
  const isPayer = payer.id === member.id;
  const status = displayedMemberStatus(member);
  const renewal = getAgreementExpirationStatus(member);
  const balance = getMemberBalance(member, state.store.payments, new Date(), state.store.members);
  elements.detailInitials.textContent = initialsFor(member.name);
  elements.detailName.textContent = member.name;
  elements.detailContact.textContent = [formatPhone(member.phone), member.email, member.parentName && `보호자 ${member.parentName}`]
    .filter(Boolean)
    .join("  ");
  const dueDay = Number(status.months[0]?.dueDate?.split("-")[2]) || Number(member.startDate?.split("-")[2]) || 1;
  elements.detailDueDay.textContent = collectionPlaced
    ? `Charge-off: ${collectionPlacement.chargeOffDate} · Frozen balance ${formatMoney(collectionPlacement.frozenBalance)}`
    : !isPayer
    ? `${payer.name} 계정에서 납부 관리 · Payments are managed on ${payer.name}'s payer account`
    : `납부일: 매월 ${dueDay}일 · Payment due the ${ordinalEn(dueDay)} of each month`;
  elements.statusBadge.innerHTML = collectionPlaced
    ? `${STATUS_LABELS.collection.ko}<small lang="en">${STATUS_LABELS.collection.en}</small>`
    : !isPayer
    ? `납부자 계정<small lang="en">Covered by ${escapeHtml(payer.name)}</small>`
    : member.participant === false && balance.monthlyAmount <= 0
    ? `비참가<small lang="en">Contact only</small>`
    : `${STATUS_LABELS[status.level].ko}<small lang="en">${STATUS_LABELS[status.level].en}</small>${status.flags?.pending ? `<small class="status-pending-note">카드 검토 중 · Card pending</small>` : ""}${status.flags?.setupNeeded ? `<small class="status-setup-note">정보 확인 필요 · Setup needed</small>` : ""}`;
  elements.statusBadge.className = `status-badge status-${status.level}`;
  elements.latestPaid.textContent = collectionPlaced
    ? `First Credit Services 파일 생성: ${collectionPlacement.chargeOffDate} · Placement file created`
    : status.lastPaidMonth
    ? `마지막 납부: ${formatMonthBi(status.lastPaidMonth)}`
    : MSG.noPaymentsYet;
  elements.latestPaid.className = `latest-paid ${collectionPlaced || status.lastPaidMonth ? "has-payment" : "no-payment"}`;
  renderContractRenewal(member, renewal);

  renderHouseholdCard(member);
  renderFamilyAccountPanel(member);
  renderProgressCard(member);

  renderQuickPay(member, status);
  elements.quickPayButton.disabled = !isPayer || collectionPlaced || elements.quickPayButton.disabled;
  elements.catchUpButton.disabled = !isPayer || collectionPlaced || balance.dueUnpaidMonths.length === 0 || balance.monthlyAmount <= 0;
  elements.undoCatchUpButton.classList.toggle("hidden", state.lastPaymentBatch?.memberId !== payer.id);

  elements.monthStrip.innerHTML = "";
  status.billableMonths.forEach((monthKey) => {
    const month = { month: monthKey, paid: status.paidMonths.has(monthKey), prepaid: status.prepaidMonths?.has(monthKey) };
    const item = document.createElement("button");
    item.type = "button";
    item.disabled = !isPayer || collectionPlaced || balance.monthlyAmount <= 0 || month.prepaid;
    item.className = `month-box ${month.paid ? "paid" : "unpaid"}`;
    item.dataset.monthToggle = month.month;
    item.title = month.prepaid ? "Covered by the contract down payment" : month.paid ? "Mark this month unpaid" : "Mark this month paid";
    item.setAttribute("aria-label", `${formatMonthEn(month.month)}: ${month.prepaid ? "covered by down payment" : month.paid ? "mark unpaid" : "mark paid"}`);
    item.innerHTML = `
      <strong>${formatMonthKo(month.month)}</strong>
      <small lang="en">${formatMonthEn(month.month)}</small>
      <span>${month.prepaid ? "계약금 납부 · Down payment" : month.paid ? "납부함 · Paid" : "미납 · Not paid"}</span>
      <em>${month.prepaid ? "계약금으로 첫 달/마지막 달 납부됨 · Covered by contract down payment" : month.paid ? "클릭하여 미납으로 변경 · Click to mark unpaid" : "클릭하여 납부 완료 · Click to mark paid"}</em>
    `;
    elements.monthStrip.append(item);
  });
  elements.monthStrip.querySelectorAll("[data-month-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleMonthPaid(button.dataset.monthToggle));
  });

  elements.invoiceSummary.textContent = balance.unpaidMonths.length
    ? `미납 ${balance.unpaidMonths.length}개월 · ${formatMoney(balance.totalDue)} (${balance.unpaidMonths.length} unpaid month${balance.unpaidMonths.length === 1 ? "" : "s"})`
    : MSG.noUnpaidBalance;
  elements.invoiceButton.disabled = !isPayer || collectionPlaced || balance.totalDue <= 0;
  const emailReady = renderEmailButton(member, balance);
  elements.emailButton.disabled = !isPayer || collectionPlaced || !emailReady;
  elements.collectionButton.disabled = !isPayer || (!collectionPlaced && (status.level !== "late" || balance.dueNow <= 0 || balance.monthlyAmount <= 0));
  elements.collectionButton.title = !collectionPlaced && status.level !== "late"
    ? "회원이 미납 상태일 때 사용할 수 있습니다. · Available when the member is behind on payments."
    : "";
  elements.collectionButton.innerHTML = collectionPlaced
    ? `<span lang="ko">추심 파일 다시 저장</span><small lang="en">Download Placement Again</small>`
    : `<span lang="ko">추심 기관 파일 만들기</span><small lang="en">First Credit Services Placement</small>`;
  renderSquareMonthlyInvoice(member, payer, isPayer, balance, collectionPlaced);
  elements.collectionNotice.classList.toggle("hidden", !collectionPlaced);
  elements.collectionNotice.innerHTML = collectionPlaced
    ? `<strong>First Credit Services 이관 완료 · Placed for collection</strong><span>${escapeHtml(collectionPlacement.chargeOffDate)}에 잔액 ${formatMoney(collectionPlacement.frozenBalance)} 고정. 이 회원에 대한 청구 및 직접 결제 수집은 중단되었습니다. · Balance frozen; billing and direct payment collection are stopped.</span>`
    : "";

  elements.memberName.value = member.name;
  elements.memberHomePhone.value = formatPhone(member.homePhone);
  elements.memberWorkPhone.value = formatPhone(member.workPhone);
  elements.memberCellPhone.value = formatPhone(member.cellPhone || member.phone);
  elements.memberAddress.value = member.address || "";
  elements.memberCity.value = member.city || "";
  elements.memberState.value = member.state || "";
  elements.memberZip.value = member.zip || "";
  elements.memberDob.value = member.dob || "";
  elements.memberEmail.value = member.email || "";
  elements.memberParent.value = member.parentName || "";
  populateResponsiblePartyChoices(member);
  elements.memberHousehold.value = member.householdName || "";
  elements.memberRole.value = member.householdRole || "adult";
  elements.memberParticipant.checked = member.participant !== false;
  elements.memberTaeKwonDo.checked = (member.programs || []).includes("tae_kwon_do");
  elements.memberMuayThai.checked = (member.programs || []).includes("muay_thai");
  const certifications = normalizeMemberCertifications(member);
  setCertificationControlValue(elements.memberBeltLevel, certifications.tae_kwon_do);
  setCertificationControlValue(elements.memberMuayThaiLevel, certifications.muay_thai);
  elements.memberNextLevel.value = nextMemberCertification(member) || member.nextLevel || "";
  elements.memberSquareCustomerId.value = member.squareCustomerId || "";
  elements.memberAmount.value = member.monthlyAmount || "";
  elements.memberLateFeeMinimum.value = member.lateFeeMinimum ?? 5;
  elements.memberLateFeePercentage.value = member.lateFeePercentage ?? 5;
  elements.memberStart.value = member.startDate || "";
  elements.memberStart.dataset.previousValue = member.startDate || "";
  elements.memberAgreementType.value = member.agreementType || "Contract";
  elements.memberAgreementEnd.value = member.agreementEndDate || defaultAgreementEndDate(member.startDate);
  elements.memberDownPayment.value = member.downPayment ?? "";
  elements.memberEmailConsent.checked = member.emailConsent === "Yes";
  elements.memberTextConsent.checked = member.textConsent === "Yes";
  elements.memberPhoneConsent.checked = member.phoneConsent === "Yes";
  elements.memberInactive.checked = Boolean(member.inactive);
  const family = accountMembers(state.store.members, payer);
  const hasDependents = family.some((person) => person.id !== payer.id);
  const automaticPayerAmount = isPayer && member.participant === false;
  const memberAmountLabel = document.querySelector('label[for="memberAmount"]');
  const quickAmountLabel = document.querySelector('label[for="quickMemberAmount"]');
  const amountLabel = automaticPayerAmount
    ? `월 회비 자동 합산 <small lang="en">Calculated from participating family members</small>`
    : isPayer && member.participant !== false && hasDependents
      ? `본인 월 회비 <small lang="en">This member's amount; household total includes each participant</small>`
      : `월 회비 <small lang="en">Monthly amount</small>`;
  memberAmountLabel.innerHTML = amountLabel;
  quickAmountLabel.innerHTML = amountLabel;
  elements.memberAmount.disabled = collectionPlaced || automaticPayerAmount;
  elements.memberAmount.title = automaticPayerAmount ? "This payer total is calculated from participating family members." : "";
  if (automaticPayerAmount) {
    elements.memberAmount.value = "";
    elements.quickMemberAmount.value = "";
  }
  elements.memberLateFeeMinimum.disabled = collectionPlaced;
  elements.memberLateFeePercentage.disabled = collectionPlaced;
  elements.memberStart.disabled = collectionPlaced || !isPayer;
  elements.memberStart.title = !isPayer ? `Set the billing contract date on ${payer.name}'s payer account.` : "";
  elements.memberAgreementEnd.disabled = collectionPlaced || !isPayer;
  elements.memberAgreementEnd.title = !isPayer ? `Set the billing contract date on ${payer.name}'s payer account.` : "";
  elements.memberDownPayment.disabled = collectionPlaced || !isPayer;
  elements.memberDownPayment.title = !isPayer ? `Set the down payment on ${payer.name}'s payer account.` : "";
  const downPaymentRecord = getContractDownPaymentRecord(state.store, payer.id);
  const downPaymentAmount = Number(payer.downPayment || 0);
  const downPaymentMatches = downPaymentRecord
    && Number(downPaymentRecord.amount || 0) === downPaymentAmount
    && downPaymentRecord.paidAt === payer.startDate;
  elements.memberRecordDownPaymentButton.disabled = collectionPlaced
    || !isPayer
    || downPaymentAmount <= 0
    || !payer.startDate
    || Boolean(downPaymentMatches);
  elements.memberRecordDownPaymentButton.classList.toggle("hidden", !isPayer || downPaymentAmount <= 0);
  if (downPaymentMatches) {
    elements.memberDownPaymentRecordStatus.textContent = `${formatMoney(downPaymentRecord.amount)} recorded on ${downPaymentRecord.paidAt}.`;
  } else if (downPaymentRecord) {
    elements.memberDownPaymentRecordStatus.textContent = `${formatMoney(downPaymentRecord.amount)} was recorded on ${downPaymentRecord.paidAt}. Save contract changes, then update the recorded payment.`;
  } else if (downPaymentAmount > 0) {
    elements.memberDownPaymentRecordStatus.textContent = "The contract amount is saved, but no payment transaction has been created.";
  } else {
    elements.memberDownPaymentRecordStatus.textContent = "Saving the amount does not create a payment transaction.";
  }
  elements.memberInactive.disabled = collectionPlaced;
  elements.memberResponsibleParty.disabled = collectionPlaced;

  elements.quickMemberName.value = member.name;
  elements.quickMemberDob.value = member.dob || "";
  elements.quickMemberCellPhone.value = formatPhone(member.cellPhone || member.phone);
  elements.quickMemberEmail.value = member.email || "";
  elements.quickMemberAddress.value = member.address || "";
  elements.quickMemberCity.value = member.city || "";
  elements.quickMemberState.value = member.state || "";
  elements.quickMemberZip.value = member.zip || "";
  populateResponsiblePartyChoices(member, elements.quickResponsibleParty);
  elements.quickAgreementType.value = member.agreementType || "Contract";
  elements.quickMemberAmount.value = automaticPayerAmount ? "" : (member.monthlyAmount || "");
  elements.quickMemberStart.value = member.startDate || "";
  elements.quickMemberStart.dataset.previousValue = member.startDate || "";
  elements.quickMemberAgreementEnd.value = member.agreementEndDate || defaultAgreementEndDate(member.startDate);
  elements.quickProfileForm.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = collectionPlaced;
  });
  elements.quickMemberStart.disabled = collectionPlaced || !isPayer;
  elements.quickMemberStart.title = !isPayer ? `Set the billing contract date on ${payer.name}'s payer account.` : "";
  elements.quickMemberAgreementEnd.disabled = collectionPlaced || !isPayer;
  elements.quickMemberAgreementEnd.title = !isPayer ? `Set the billing contract date on ${payer.name}'s payer account.` : "";
  elements.quickMemberAmount.disabled = collectionPlaced || automaticPayerAmount;
  elements.quickMemberAmount.title = automaticPayerAmount ? "This payer total is calculated from participating family members." : "";
}

function populateResponsiblePartyChoices(member, select = elements.memberResponsibleParty) {
  const resolved = getResponsibleParty(member, state.store.members);
  const selectedId = member.responsiblePartyId || resolved?.id || member.id;
  const candidates = [...state.store.members]
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  select.replaceChildren();
  candidates.forEach((candidate) => {
    const option = document.createElement("option");
    option.value = candidate.id;
    const relationship = candidate.id === member.id ? "Self" : candidate.householdRole === "parent_guardian" ? "Parent/guardian" : candidate.householdName || "Member";
    option.textContent = `${candidate.name || "Unnamed member"} · ${relationship}`;
    select.append(option);
  });
  if (!candidates.some((candidate) => candidate.id === selectedId)) {
    const fallback = document.createElement("option");
    fallback.value = member.id;
    fallback.textContent = `${member.name || "Unnamed member"} · Self`;
    select.append(fallback);
  }
  select.value = selectedId;
}

function renderHouseholdCard(member) {
  const family = accountMembers(state.store.members, member);
  const payer = getResponsibleParty(member, state.store.members) || member;
  const householdName = payer.householdName || member.householdName || (family.length > 1 ? `${payer.name} Family` : "");
  const monthlyTotal = family
    .filter((person) => person.participant !== false && !person.inactive)
    .reduce((sum, person) => sum + Number(person.monthlyAmount || 0), 0);
  if (!householdName && family.length <= 1) {
    elements.householdCard.classList.add("hidden");
    elements.householdCard.innerHTML = "";
    return;
  }

  const roleLabels = {
    parent_guardian: "부모/보호자 · Parent/guardian",
    child: "자녀 · Child",
    adult: "성인 · Adult"
  };
  elements.householdCard.classList.remove("hidden");
  elements.householdCard.innerHTML = `
    <div class="section-kicker">청구 계정 · Payer account</div>
    <h3>${escapeHtml(householdName)}</h3>
    <p class="household-total">가족 월 회비 합계 · Family monthly total <strong>${formatMoney(monthlyTotal)}</strong></p>
    <div class="household-people">
      ${family.map((person) => `
        <button type="button" class="household-person ${person.id === member.id ? "current" : ""}" data-household-member="${escapeHtml(person.id)}">
          <span class="household-person-main"><strong>${escapeHtml(person.name)}</strong><small>${roleLabels[person.householdRole] || roleLabels.adult}</small><small class="household-monthly">${person.id === payer.id && person.participant === false ? "가족 회비 자동 합산 · Calculated from participating family members" : `월 회비: ${formatMoney(person.monthlyAmount)} · Monthly: ${formatMoney(person.monthlyAmount)}`}</small><small class="household-certification">자격: ${escapeHtml(primaryCertificationLabel(person) || "미설정")}<span lang="en">Certification: ${escapeHtml(primaryCertificationLabel(person) || "Not set")}</span></small><small class="household-contract">계약 시작: ${escapeHtml(person.startDate || "미정")} · Contract start: ${escapeHtml(person.startDate || "Not set")}</small></span>
          <span class="participation-chip ${person.id === payer.id ? "payer" : person.participant === false ? "contact" : "student"}">${person.id === payer.id ? "청구 책임자 · Payer" : person.participant === false ? "비참가 · Contact only" : "수련생 · Participant"}</span>
        </button>
      `).join("")}
    </div>
  `;
  elements.householdCard.querySelectorAll("[data-household-member]").forEach((button) => {
    button.addEventListener("click", () => selectMember(button.dataset.householdMember));
  });
}

function renderFamilyAccountPanel(member) {
  const family = accountMembers(state.store.members, member);
  const payer = getResponsibleParty(member, state.store.members) || member;
  const hasFamily = family.length > 1 || family.some((person) => person.householdRole === "parent_guardian" || person.householdRole === "child");
  const householdName = payer.householdName || member.householdName || (hasFamily ? `${payer.name} Family` : "");
  const monthlyTotal = family
    .filter((person) => person.participant !== false && !person.inactive)
    .reduce((sum, person) => sum + Number(person.monthlyAmount || 0), 0);

  elements.familyAccountHouseholdName.value = householdName;
  elements.familyAccountTotal.innerHTML = `<strong>청구 책임자 · Payer: ${escapeHtml(payer.name)}</strong><span>참가 가족 월 회비 합계 · Participating family monthly total: <b>${formatMoney(monthlyTotal)}</b></span>`;
  const familyIds = new Set(family.map((person) => person.id));
  const existingMembers = state.store.members
    .filter((person) => !familyIds.has(person.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  elements.familyExistingMember.innerHTML = `<option value="">기존 회원 선택 · Select existing member</option>${existingMembers.map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)} · ${person.householdRole || "adult"}</option>`).join("")}`;
  elements.addExistingFamilyMemberButton.disabled = existingMembers.length === 0;
  elements.familyAccountMembers.innerHTML = family.map((person) => `
    <article class="family-account-member" data-family-account-member="${escapeHtml(person.id)}">
      <div class="family-account-member-heading">
        <label class="family-payer-choice"><input type="radio" name="familyPayer" value="${escapeHtml(person.id)}"${person.id === payer.id ? " checked" : ""}> <span>청구 책임자 <small lang="en">Payer</small></span></label>
        <span class="family-account-member-tools"><label class="check-row"><input data-family-participant type="checkbox"${person.participant !== false ? " checked" : ""}> <span>수련 참가 <small lang="en">Participates</small></span></label><button class="family-remove-button" type="button" data-remove-family-member="${escapeHtml(person.id)}"><span lang="ko">가족에서 제거</span><small lang="en">Remove from Family</small></button><button class="family-delete-button" type="button" data-delete-family-member="${escapeHtml(person.id)}"><span lang="ko">영구 삭제</span><small lang="en">Delete Permanently</small></button></span>
      </div>
      <div class="family-account-member-grid">
        <label>이름 <small lang="en">Name</small><input data-family-name value="${escapeHtml(person.name)}" required></label>
        <label>역할 <small lang="en">Role</small><select data-family-role><option value="parent_guardian"${person.householdRole === "parent_guardian" ? " selected" : ""}>부모/보호자 · Parent/guardian</option><option value="child"${person.householdRole === "child" ? " selected" : ""}>자녀 · Child</option><option value="adult"${person.householdRole === "adult" ? " selected" : ""}>성인 · Adult</option></select></label>
        <label><span data-family-amount-label>월 회비 <small lang="en">Individual monthly amount</small></span><input data-family-monthly type="number" min="0" step="0.01" value="${Number(person.monthlyAmount || 0)}"${person.id === payer.id && person.participant === false ? " disabled" : ""}></label>
      </div>
    </article>
  `).join("");
  syncFamilyAmountControls();
}

function syncFamilyAmountControls(rows = Array.from(elements.familyAccountMembers.querySelectorAll("[data-family-account-member]"))) {
  const payerId = elements.familyAccountMembers.querySelector("input[name='familyPayer']:checked")?.value;
  rows.forEach((row) => {
    const participates = row.querySelector("[data-family-participant]")?.checked;
    const isAutomaticPayer = row.dataset.familyAccountMember === payerId && !participates;
    const amount = row.querySelector("[data-family-monthly]");
    const label = row.querySelector("[data-family-amount-label]");
    if (!amount || !label) return;
    amount.disabled = isAutomaticPayer;
    amount.title = isAutomaticPayer ? "The payer total is calculated from participating family members." : "";
    label.innerHTML = isAutomaticPayer
      ? `월 회비 자동 합산 <small lang="en">Calculated from participating family members</small>`
      : row.dataset.familyAccountMember === payerId
        ? `본인 월 회비 <small lang="en">This payer's own amount only</small>`
        : `월 회비 <small lang="en">Individual monthly amount</small>`;
  });
}

function updateFamilyAccountDraftTotal() {
  const rows = Array.from(elements.familyAccountMembers.querySelectorAll("[data-family-account-member]"));
  if (!rows.length) return;
  syncFamilyAmountControls(rows);
  const payerRow = elements.familyAccountMembers.querySelector("input[name='familyPayer']:checked")?.closest("[data-family-account-member]");
  const payerName = payerRow?.querySelector("[data-family-name]")?.value.trim() || "Not selected";
  const monthlyTotal = rows
    .filter((row) => row.querySelector("[data-family-participant]")?.checked)
    .reduce((sum, row) => sum + Number(row.querySelector("[data-family-monthly]")?.value || 0), 0);
  elements.familyAccountTotal.innerHTML = `<strong>청구 책임자 · Payer: ${escapeHtml(payerName)}</strong><span>참가 가족 월 회비 합계 · Participating family monthly total: <b>${formatMoney(monthlyTotal)}</b></span>`;
}

function renderProgressCard(member) {
  if (member.participant === false) {
    elements.progressCard.classList.add("hidden");
    elements.progressCard.innerHTML = "";
    return;
  }
  const programs = member.programs || [];
  const programLabels = programs.map((program) => program === "muay_thai" ? "무에타이 · Muay Thai" : "태권도 · Tae Kwon Do");
  const current = primaryCertificationLabel(member) || "첫 수업 · First class";
  const next = nextMemberCertification(member) || member.nextLevel || "최고 자격 레벨 · Highest certification level";
  const progress = certificationProgress(normalizeMemberCertifications(member).tae_kwon_do);
  elements.progressCard.classList.remove("hidden");
  elements.progressCard.innerHTML = `
    <div class="progress-copy">
      <div class="section-kicker">수련 여정 · Training Journey</div>
      <h3>${escapeHtml(current)} <span aria-hidden="true">→</span> ${escapeHtml(next)}</h3>
      <p>${programLabels.length ? programLabels.map((label) => `<span class="program-chip">${label}</span>`).join("") : "프로그램을 선택하세요 · Choose a program"}</p>
    </div>
    <div class="level-progress" role="progressbar" aria-label="Belt journey progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
      <span style="width: ${progress}%"></span>
    </div>
    <p class="progress-encouragement">다음 목표를 향해 계속 전진하세요! · Keep moving toward the next goal!</p>
  `;
}

// The reminder button opens a review step first, so Master Lee can choose the
// months and adjust the message before the computer's mail program opens.
function renderEmailButton(member, balance) {
  const ready = balance.totalDue > 0;
  elements.emailButton.classList.toggle("disabled", !ready);
  elements.emailButton.setAttribute("aria-disabled", String(!ready));
  return ready;
}

function renderSquareMonthlyInvoice(member, payer, isPayer, balance, collectionPlaced) {
  const setup = payer.squareMonthlyInvoice || null;
  const active = ["ACTIVE", "PENDING"].includes(String(setup?.status || "").toUpperCase());
  const startDate = squareInvoiceStartDate(payer, new Date(), balance.monthlyAmount);
  const missing = [];
  if (!payer.email) missing.push("payer email");
  if (!payer.startDate) missing.push("payer contract date");
  if (balance.monthlyAmount <= 0) missing.push("monthly amount");
  const eligible = isPayer && !collectionPlaced && missing.length === 0 && Boolean(startDate);
  elements.squareRecurringButton.disabled = !eligible || active;
  elements.squareRecurringStatus.textContent = active
    ? `Square monthly invoice ${String(setup.status || "active").toLowerCase()} · Starts ${setup.startDate}${setup.cancelDate ? ` · ends ${setup.cancelDate}` : ""}`
    : !isPayer
      ? `Set this up on ${payer.name}'s payer account.`
      : missing.length
        ? `Before setup, save: ${missing.join(", ")}.`
        : `Square will email ${payer.email} a payment link every month starting ${startDate}. No card is stored or automatically charged.`;
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

function renderQuickPay(member, status) {
  const button = elements.quickPayButton;
  const payer = getResponsibleParty(member, state.store.members) || member;
  const isPayer = payer.id === member.id;
  const amount = getMemberBalance(member, state.store.payments, new Date(), state.store.members).monthlyAmount;
  const paidThisMonth = status.paidMonths.has(status.currentMonth);
  const prepaidThisMonth = status.prepaidMonths?.has(status.currentMonth);

  button.classList.toggle("done", paidThisMonth);
  button.classList.toggle("undo", paidThisMonth);
  if (!isPayer) {
    button.disabled = true;
    button.innerHTML = `<span lang="ko">${escapeHtml(payer.name)} 납부자 계정</span><small lang="en">Payments are recorded on the payer account</small>`;
  } else if (member.participant === false && amount <= 0) {
    button.disabled = true;
    button.innerHTML = `<span lang="ko">비참가 연락처</span><small lang="en">Contact only - no tuition due</small>`;
  } else if (prepaidThisMonth) {
    button.disabled = true;
    button.innerHTML = `<span lang="ko">이번 달 계약금 납부 완료</span><small lang="en">This month is covered by the contract down payment</small>`;
  } else if (paidThisMonth) {
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

function showLandscape() {
  state.page = "landscape";
  state.view = "landscape";
  state.statusFilter = "all";
  render();
}

function showUpcomingLandscape() {
  state.landscapeFilter = "upcoming";
  showLandscape();
}

function startDailyWork() {
  const brief = getOperatorBrief(state.store, state.stagedPayments);
  if (brief.tuitionFollowups.length > 0) {
    openAttentionReview();
  } else if (brief.pendingCards.length > 0) {
    showSquare();
  } else if (brief.setupRows.length > 0) {
    showRoster("setup");
  }
}

function showMembers() {
  state.page = "members";
  state.view = "roster";
  state.statusFilter = "all";
  render();
  elements.searchInput.focus();
}

function showRoster(statusFilter) {
  state.page = "members";
  state.view = "roster";
  state.statusFilter = statusFilter;
  render();
}

function showSquare() {
  state.page = "square";
  state.view = "square";
  render();
  loadSquarePayments();
}

function selectMember(memberId) {
  if (state.selectedId !== memberId) {
    elements.quickProfilePanel.open = false;
    // Payments are the primary action on a member record, so keep this
    // top-most section ready to use whenever a different member is opened.
    elements.paymentUpdatePanel.open = true;
    elements.billingActionsPanel.open = false;
    elements.contractRenewalNotice.open = false;
    elements.familyAccountPanel.open = false;
  }
  state.selectedId = memberId;
  state.page = "members";
  state.view = "member";
  render();
}

function renderContractRenewal(member, renewal) {
  const needsRenewal = renewal.level === "expiring" || renewal.level === "expired";
  elements.contractRenewalFlag.classList.toggle("hidden", !needsRenewal);
  elements.contractRenewalNotice.classList.toggle("hidden", !needsRenewal);
  if (!needsRenewal) {
    return;
  }

  const expiration = formatAgreementDate(renewal.expirationDate);
  const expired = renewal.level === "expired";
  const title = expired
    ? "계약이 만료되었습니다 · Contract expired"
    : `계약 만료 ${renewal.daysUntil}일 전 · Contract expires in ${renewal.daysUntil} days`;
  const message = expired
    ? `${expiration}에 계약이 만료되었습니다. 새 1년 계약을 안내하세요. · The agreement expired on ${expiration}. Ask whether the member would like another one-year agreement.`
    : `${expiration}에 계약이 만료됩니다. 지금 갱신 여부를 확인하세요. · The agreement expires on ${expiration}. This is a good time to ask about renewal.`;

  elements.contractRenewalFlag.className = `contract-renewal-flag contract-${renewal.level}`;
  elements.contractRenewalFlag.innerHTML = expired
    ? `계약 만료<small lang="en">Expired</small>`
    : `${renewal.daysUntil}일 남음<small lang="en">Contract renewal</small>`;
  elements.contractRenewalNotice.className = `contract-renewal-notice contract-${renewal.level}`;
  elements.contractRenewalTitle.textContent = title;
  elements.contractRenewalMessage.textContent = message;
  setRenewalEmailButtonState(elements.contractRenewalEmailButton, member);
}

function maybeShowContractRenewalDialog(member, renewal, title, message) {
  const noticeKey = `${member.id}:${renewal.level}:${renewal.expirationDate}`;
  if (state.renewalNoticesShown.has(noticeKey) || elements.contractRenewalDialog.open) {
    return;
  }
  state.renewalNoticesShown.add(noticeKey);
  elements.contractRenewalDialog.className = `contract-renewal-dialog contract-${renewal.level}`;
  elements.contractRenewalDialogIcon.textContent = renewal.level === "expired" ? "!" : String(renewal.daysUntil);
  elements.contractRenewalDialogTitle.textContent = title;
  elements.contractRenewalDialogMessage.textContent = message;
  setRenewalEmailButtonState(elements.contractRenewalDialogEmailButton, member);
  elements.contractRenewalDialog.showModal();
}

function setRenewalEmailButtonState(button, member) {
  const enabled = Boolean(member.email);
  button.disabled = !enabled;
  button.title = enabled
    ? ""
    : "이메일 주소를 먼저 저장하세요. · Save an email address first.";
}

function openRenewalContract() {
  const contractWindow = window.open(RENEWAL_CONTRACT_URL, "_blank");
  if (!contractWindow) {
    showToast(MSG.popupBlocked);
  }
}

function downloadRenewalContract() {
  const link = document.createElement("a");
  link.href = RENEWAL_CONTRACT_URL;
  link.download = RENEWAL_CONTRACT_FILENAME;
  document.body.append(link);
  link.click();
  link.remove();
}

function openRenewalEmail() {
  const member = selectedMember();
  if (!member || !member.email) {
    showToast("이메일 주소를 먼저 저장하세요. · Save an email address first.");
    return;
  }
  const renewal = getAgreementExpirationStatus(member);
  const email = buildRenewalEmail(member, renewal);
  downloadRenewalContract();
  elements.contractRenewalDialog.open && elements.contractRenewalDialog.close();
  showToast("계약서를 이메일에 첨부하세요 · Attach the downloaded contract to the email");
  window.location.href = `mailto:${member.email}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
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
    .filter((member) => {
      const payer = getResponsibleParty(member, state.store.members) || member;
      return payer.id === member.id && !member.inactive && accountMembers(state.store.members, payer).some(isActiveParticipant);
    })
    .map((member) => ({
      member,
      status: displayedMemberStatus(member),
      balance: getMemberBalance(member, state.store.payments, new Date(), state.store.members)
    }))
    .sort((a, b) => a.member.name.localeCompare(b.member.name));
}

function statusCounts(rows = memberRows()) {
  return rows.reduce(
    (counts, row) => {
      counts[row.status.level] += 1;
      if (row.status.flags?.pending) {
        counts.pending += 1;
      }
      return counts;
    },
    { paid: 0, pending: 0, watch: 0, late: 0 }
  );
}

function displayedMemberStatus(member) {
  const pending = pendingStagedPaymentsForMember(state.stagedPayments, member, state.store.members);
  const status = getMemberPaymentState(member, state.store.payments, new Date(), pending, state.store.members);
  if (member.collectionPlacement?.status === "charged_off") {
    return { ...status, level: "collection", label: "Placed for collection" };
  }
  return status;
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
      <span class="status-badge status-${row.status.level}">${STATUS_LABELS[row.status.level].ko}<small lang="en">${STATUS_LABELS[row.status.level].en}</small>${row.status.flags?.pending ? `<small class="status-pending-note">카드 검토 중 · Card pending</small>` : ""}${row.status.flags?.setupNeeded ? `<small class="status-setup-note">정보 확인 필요 · Setup needed</small>` : ""}</span>
      <strong>${escapeHtml(row.member.name)}</strong>
      <span>${escapeHtml(lastPaid)}</span>
      <span>${escapeHtml(dueText)}</span>
    </button>
  `;
}

function selectedStagedPayment() {
  const byId = state.stagedPayments.find((payment) => payment.id === state.selectedStagedId);
  const selected = byId
    || state.stagedPayments.find((payment) => payment.status === "pending" || payment.status === "needs_match")
    || state.stagedPayments[0]
    || null;
  state.selectedStagedId = selected?.id || "";
  return selected;
}

function stagedPaymentView(payment) {
  const suggested = state.store.members.find((member) => member.id === payment.memberId || member.id === payment.suggestedMemberId)
    || suggestedPaymentMember(payment, state.store.members);
  const selectedMemberId = payment.memberId || payment.suggestedMemberId || suggested?.id || "";
  const month = stagedPaymentMonth(payment);
  const statusClass = payment.status === "approved" ? "status-paid" : payment.status === "ignored" ? "neutral" : "status-pending";
  const selectedMember = state.store.members.find((member) => member.id === selectedMemberId);
  const canApprove = (payment.status === "pending" || payment.status === "needs_match") && selectedMemberId && month && selectedMember?.collectionPlacement?.status !== "charged_off";
  const provider = "square";
  const providerLabel = "Square";
  const options = [
    `<option value="">회원 선택 · Choose member</option>`,
    ...state.store.members
      .filter(isActiveParticipant)
      .map((member) => `<option value="${escapeHtml(member.id)}"${member.id === selectedMemberId ? " selected" : ""}>${escapeHtml(member.name)}</option>`)
  ].join("");
  const buyerLine = [payment.buyerName, payment.buyerEmail, formatPhone(payment.buyerPhone)].filter(Boolean).join(" · ") || "고객 정보 없음 · No customer details";
  const details = [
    payment.paidAt || payment.createdAt || "",
    payment.receiptNumber ? `Receipt ${payment.receiptNumber}` : "",
    payment.terminalId ? `Terminal ${payment.terminalId}` : "",
    payment.providerStatus ? `Status ${payment.providerStatus}` : ""
  ].filter(Boolean).join(" · ");
  const statusLabel = payment.status === "needs_match" ? "회원 선택 필요 · Needs match" : stagedStatusLabel(payment.status);
  const member = state.store.members.find((item) => item.id === selectedMemberId);
  const recommendedMonth = member ? nextUnpaidTuitionMonth(member, state.store.payments, dateForPayment(payment), state.store.members) : "";
  const isSelected = payment.id === state.selectedStagedId;

  return {
    suggested,
    selectedMemberId,
    month,
    statusClass,
    canApprove,
    provider,
    providerLabel,
    options,
    buyerLine,
    details,
    statusLabel,
    member,
    recommendedMonth,
    isSelected
  };
}

function stagedPaymentQueueMarkup(payment) {
  const view = stagedPaymentView(payment);
  const amount = formatMoney(Number(payment.amountCents || 0) / 100);
  const memberLine = view.member?.name || view.suggested?.name || "회원 선택 필요 · Choose member";
  const detailLine = [
    payment.paidAt || payment.createdAt || "",
    payment.terminalId ? `Terminal ${payment.terminalId}` : "",
    payment.receiptNumber ? `Receipt ${payment.receiptNumber}` : ""
  ].filter(Boolean).join(" · ");

  return `
    <button class="payment-queue-item ${view.isSelected ? "active" : ""} ${view.statusClass}" type="button" data-payment-select="${escapeHtml(payment.id)}">
      <span class="queue-topline">
        <strong>${amount}</strong>
        <span class="provider-badge provider-${escapeHtml(view.provider)}">${escapeHtml(view.providerLabel)}</span>
      </span>
      <span class="queue-member">${escapeHtml(memberLine)}</span>
      <span class="queue-meta">${escapeHtml(detailLine || view.buyerLine)}</span>
      <span class="queue-status">${view.statusLabel}</span>
    </button>
  `;
}

function stagedPaymentDetailMarkup(payment) {
  const view = stagedPaymentView(payment);
  const amount = formatMoney(Number(payment.amountCents || 0) / 100);
  const detailStatus = payment.status === "approved" || payment.status === "ignored";
  const actionText = view.member
    ? `추천: ${formatMonthBi(view.recommendedMonth)} 회비에 적용 · Recommended for ${formatMonthEn(view.recommendedMonth)} tuition`
    : "먼저 회원을 선택하세요 · Choose a member first";
  const actionHelp = view.member
    ? `${view.member.name}님의 가장 오래된 미납 월을 자동으로 선택합니다. · Uses this member’s oldest unpaid month.`
    : "자동 매칭이 없으면 회원을 직접 선택한 뒤 승인하세요. · Manually select the member before approving.";

  return `
    <article class="payment-command-card ${view.statusClass}">
      <div class="payment-command-head">
        <div>
          <span class="status-badge ${view.statusClass}">${view.statusLabel}</span>
          <span class="provider-badge provider-${escapeHtml(view.provider)}">${escapeHtml(view.providerLabel)}</span>
          <h3>${amount} <small lang="en">${escapeHtml(payment.currency || "USD")}</small></h3>
          <p>${escapeHtml(view.buyerLine)}</p>
          <p>${escapeHtml(view.details)}</p>
        </div>
      </div>

      <div class="payment-recommendation">
        <div>
          <strong>${escapeHtml(actionText)}</strong>
          <p>${escapeHtml(actionHelp)}</p>
        </div>
        <button class="button secondary bi" type="button" data-payment-next-owed="${escapeHtml(payment.id)}"${view.selectedMemberId && !detailStatus ? "" : " disabled"}>
          <span lang="ko">다음 미납 월</span><small lang="en">Next Owed Month</small>
        </button>
      </div>

      <div class="payment-detail-grid">
        <div class="payment-source-box">
          <span>원본 거래 <small lang="en">Source Transaction</small></span>
          <strong>${escapeHtml(view.providerLabel)}</strong>
          <p>${escapeHtml(payment.note || view.details || "No provider details")}</p>
        </div>
        <div class="square-payment-controls">
          <label>
            회원 <small lang="en">Member</small>
            <select data-payment-member="${escapeHtml(payment.id)}"${detailStatus ? " disabled" : ""}>${view.options}</select>
          </label>
          <label>
            납부 월 <small lang="en">Payment month</small>
            <input data-payment-month="${escapeHtml(payment.id)}" type="month" value="${escapeHtml(view.month)}"${detailStatus ? " disabled" : ""}>
          </label>
          <label class="payment-note-field">
            메모 <small lang="en">Payment metadata / note</small>
            <textarea data-payment-note="${escapeHtml(payment.id)}" rows="2" placeholder="예: gear, certification, special payment"${detailStatus ? " disabled" : ""}>${escapeHtml(payment.reviewNote || "")}</textarea>
          </label>
        </div>
      </div>
      <div class="square-payment-actions">
        ${payment.receiptUrl ? `<a class="button secondary bi" href="${escapeHtml(payment.receiptUrl)}" target="_blank" rel="noreferrer"><span lang="ko">영수증</span><small lang="en">Receipt</small></a>` : ""}
        <button class="button primary bi" type="button" data-payment-approve-tuition="${escapeHtml(payment.id)}"${view.canApprove ? "" : " disabled"}>
          <span lang="ko">회비 승인</span><small lang="en">Tuition</small>
        </button>
        <button class="button secondary bi" type="button" data-payment-approve-one-off="${escapeHtml(payment.id)}"${view.canApprove ? "" : " disabled"}>
          <span lang="ko">기타 매출</span><small lang="en">Other Sale</small>
        </button>
        <button class="button secondary bi" type="button" data-payment-ignore="${escapeHtml(payment.id)}"${detailStatus ? " disabled" : ""}>
          <span lang="ko">무시</span><small lang="en">Ignore</small>
        </button>
      </div>
    </article>
  `;
}

function emptyPaymentDetailMarkup() {
  return `
    <div class="empty-state compact square-empty">
      <h3>결제를 선택하세요 <small lang="en">Choose a payment</small></h3>
      <p>왼쪽 목록에서 결제를 선택하면 회원, 납부 월, 메모를 확인할 수 있습니다.</p>
    </div>
  `;
}

function bindStagedPaymentEvents() {
  elements.squarePayments.querySelectorAll("[data-payment-select]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStagedId = button.dataset.paymentSelect;
      render();
    });
  });
  elements.squareDetail.querySelectorAll("[data-payment-approve-tuition]").forEach((button) => {
    button.addEventListener("click", () => approveStagedPayment(button.dataset.paymentApproveTuition, "tuition"));
  });
  elements.squareDetail.querySelectorAll("[data-payment-approve-one-off]").forEach((button) => {
    button.addEventListener("click", () => approveStagedPayment(button.dataset.paymentApproveOneOff, "one-off"));
  });
  elements.squareDetail.querySelectorAll("[data-payment-ignore]").forEach((button) => {
    button.addEventListener("click", () => ignoreStagedPayment(button.dataset.paymentIgnore));
  });
  elements.squareDetail.querySelectorAll("[data-payment-member]").forEach((select) => {
    select.addEventListener("change", () => setStagedPaymentMember(select.dataset.paymentMember, select.value));
  });
  elements.squareDetail.querySelectorAll("[data-payment-month]").forEach((input) => {
    input.addEventListener("change", () => setStagedPaymentMonth(input.dataset.paymentMonth, input.value));
  });
  elements.squareDetail.querySelectorAll("[data-payment-next-owed]").forEach((button) => {
    button.addEventListener("click", () => setStagedPaymentNextOwedMonth(button.dataset.paymentNextOwed));
  });
  elements.squareDetail.querySelectorAll("[data-payment-note]").forEach((input) => {
    input.addEventListener("input", () => setStagedPaymentNote(input.dataset.paymentNote, input.value, { persist: false }));
    input.addEventListener("change", () => setStagedPaymentNote(input.dataset.paymentNote, input.value, { persist: true }));
  });
}

function stagedStatusLabel(status) {
  if (status === "approved") {
    return "승인됨 · Approved";
  }
  if (status === "ignored") {
    return "무시됨 · Ignored";
  }
  return "대기 · Pending";
}

function providerStatusText() {
  return state.paymentProviders.square?.configured
    ? "Square ready"
    : "Square not configured";
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

  if (kind === "backup" || isFullBackupCsv(parsed.headers)) {
    restoreFullBackupCsv(parsed);
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

function restoreFullBackupCsv(parsed) {
  if (!isFullBackupCsv(parsed.headers)) {
    showToast("WMAC 전체 백업 CSV를 선택하세요. · Choose a WMAC full backup CSV.");
    return;
  }
  const confirmed = window.confirm(
    "This will replace the members and payment history saved on this computer with the selected backup. Continue?"
  );
  if (!confirmed) return;
  try {
    const result = restoreStoreFromBackupRows(parsed.records);
    state.store = result.store;
    state.selectedId = result.store.members[0]?.id || "";
    const message = `전체 백업 복원 완료 · Restored ${result.memberCount} members and ${result.paymentCount} payments`;
    saveStore(message);
    showToast(message);
    render();
  } catch (error) {
    showToast(error.message || "백업을 복원하지 못했습니다. · Could not restore the backup.");
  } finally {
    elements.memberCsv.value = "";
    elements.paymentCsv.value = "";
    elements.restoreBackupCsv.value = "";
  }
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
  elements.restoreBackupCsv.value = "";
  render();
}

function exportBackup() {
  const csv = toCsv(exportStoreRows(state.store));
  if (!csv) {
    showToast(MSG.nothingToExport);
    return;
  }
  downloadCsv(csv, `wmac-full-backup-${new Date().toISOString().slice(0, 10)}.csv`);
  showToast("전체 백업 CSV 저장됨 · Full backup CSV saved");
}

function exportDailyPaymentStatusEmail() {
  const today = new Date();
  const rows = exportDailyPaymentStatusRows(state.store, today);
  if (rows.length === 0) {
    showToast(MSG.nothingToExport);
    return;
  }
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
  showToast("일일 CSV를 이메일에 첨부하세요 · Attach the downloaded daily CSV to the email");
  window.location.href = `mailto:world_martial_art_ct@msn.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Square payment staging
// ---------------------------------------------------------------------------

async function loadSquarePayments() {
  await loadStagedPayments();
}

async function loadStagedPayments() {
  const result = await loadProviderPayments();
  state.stagedPayments = result.payments
    .sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt)));
  render();
}

async function loadProviderPayments() {
  try {
    const data = window.paymentTrackerProviders
      ? await window.paymentTrackerProviders.list("square")
      : await fetchProviderJson("/api/square/payments");
    const payments = (data.payments || []).map((payment) => ({
      ...payment,
      provider: "square",
      suggestedMemberId: payment.suggestedMemberId || suggestedPaymentMember(payment, state.store.members)?.id || ""
    }));
    state.paymentProviders.square = { configured: Boolean(data.configured), error: "" };
    return { payments };
  } catch (error) {
    state.paymentProviders.square = {
      configured: false,
      error: "스퀘어 대기 결제 저장소에 연결할 수 없습니다 · Square staging store is not available"
    };
    return { payments: [], error };
  }
}

async function syncSquarePayments() {
  await syncProviderPayments();
}

async function syncProviderPayments() {
  const button = elements.syncSquareButton;
  elements.syncSquareButton.disabled = true;
  try {
    const data = window.paymentTrackerProviders
      ? await window.paymentTrackerProviders.sync("square")
      : await fetchProviderJson("/api/square/sync", { method: "POST" });
    state.stagedPayments = (data.payments || [])
      .map((payment) => ({ ...payment, provider: "square" }))
      .sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt)));
    state.paymentProviders.square = { configured: Boolean(data.configured), error: "" };
    showToast(`스퀘어 결제 ${data.imported || 0}건 확인 · Checked ${data.imported || 0} Square payments`);
  } catch (error) {
    state.paymentProviders.square = {
      configured: false,
      error: `${error.message} · Authentication can be added when ready.`
    };
    showToast(state.paymentProviders.square.error);
  } finally {
    elements.syncSquareButton.disabled = false;
    button.disabled = false;
    render();
  }
}

async function setUpSquareMonthlyInvoice() {
  const member = selectedMember();
  if (!member) return;
  const payer = getResponsibleParty(member, state.store.members) || member;
  if (payer.id !== member.id) {
    showToast(`Set up Square monthly invoices on ${payer.name}'s payer account.`);
    return;
  }
  const balance = getMemberBalance(payer, state.store.payments, new Date(), state.store.members);
  const startDate = squareInvoiceStartDate(payer, new Date(), balance.monthlyAmount);
  if (!payer.email || !startDate || balance.monthlyAmount <= 0) {
    showToast("Save the payer email, contract date, and monthly amount before Square setup.");
    return;
  }
  if (["ACTIVE", "PENDING"].includes(String(payer.squareMonthlyInvoice?.status || "").toUpperCase())) {
    showToast("A Square monthly invoice is already set up for this payer.");
    return;
  }
  elements.squareRecurringButton.disabled = true;
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
      : await fetchProviderJson("/api/square/subscriptions/monthly-invoice", {
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
    saveStore("Square monthly invoice set up.");
    showToast(`Square will email ${payer.email} a monthly payment link starting ${startDate}.`);
    render();
  } catch (error) {
    showToast(error.message || "Square monthly invoice setup failed.");
    render();
  }
}

function setStagedPaymentMember(paymentId, memberId) {
  state.selectedStagedId = paymentId;
  state.stagedPayments = state.stagedPayments.map((payment) => {
    if (payment.id !== paymentId) {
      return payment;
    }
    const member = state.store.members.find((item) => item.id === memberId);
    const nextMonth = member ? nextUnpaidTuitionMonth(member, state.store.payments, dateForPayment(payment), state.store.members) : payment.paymentMonth;
    return {
      ...payment,
      memberId,
      suggestedMemberId: memberId,
      paymentMonth: nextMonth || payment.paymentMonth,
      status: memberId && payment.status === "needs_match" ? "pending" : payment.status
    };
  });
  render();
}

function setStagedPaymentMonth(paymentId, paymentMonth) {
  state.selectedStagedId = paymentId;
  state.stagedPayments = state.stagedPayments.map((payment) =>
    payment.id === paymentId ? { ...payment, paymentMonth } : payment
  );
  render();
}

function setStagedPaymentNextOwedMonth(paymentId) {
  state.selectedStagedId = paymentId;
  state.stagedPayments = state.stagedPayments.map((payment) => {
    if (payment.id !== paymentId) {
      return payment;
    }
    const memberId = payment.memberId || payment.suggestedMemberId;
    const member = state.store.members.find((item) => item.id === memberId);
    return member
      ? { ...payment, paymentMonth: nextUnpaidTuitionMonth(member, state.store.payments, dateForPayment(payment), state.store.members) }
      : payment;
  });
  render();
}

function setStagedPaymentNote(paymentId, reviewNote, { persist = false } = {}) {
  state.selectedStagedId = paymentId;
  state.stagedPayments = state.stagedPayments.map((payment) =>
    payment.id === paymentId ? { ...payment, reviewNote } : payment
  );
  if (persist) {
    saveStagedStatus(paymentId, { reviewNote });
  }
}

async function approveStagedPayment(paymentId, category = "tuition") {
  const payment = state.stagedPayments.find((item) => item.id === paymentId);
  const squareStatus = String(payment?.squareStatus || payment?.providerStatus || "").toUpperCase();
  if ((payment?.provider || "square") === "square" && squareStatus && squareStatus !== "COMPLETED") {
    showToast("완료된 Square 결제만 승인할 수 있습니다. · Only completed Square payments can be approved.");
    return;
  }
  const memberId = payment?.memberId || payment?.suggestedMemberId;
  const member = state.store.members.find((item) => item.id === memberId);
  if (!payment || !member) {
    showToast("회원과 납부 월을 먼저 선택하세요. · Choose a member and payment month first.");
    return;
  }
  if (member.collectionPlacement?.status === "charged_off") {
    showToast("추심 이관 후에는 카드 결제를 적용할 수 없습니다. · Card payments cannot change a charged-off balance.");
    return;
  }
  const payer = getResponsibleParty(member, state.store.members) || member;
  const month = category === "tuition" && !payment.paymentMonth
    ? nextUnpaidTuitionMonth(member, state.store.payments, dateForPayment(payment), state.store.members)
    : stagedPaymentMonth(payment);
  if (!month) {
    showToast("납부 월을 먼저 선택하세요. · Choose a payment month first.");
    return;
  }

  const provider = "square";
  const label = "Square";
  const amount = Number(payment.amountCents || 0) / 100;
  const beforePayments = state.store.payments;
  const beforeIds = new Set(state.store.payments.map((item) => item.id));
  const nextStore = addPayment(state.store, {
    memberId: category === "tuition" ? payer.id : member.id,
    month,
    amount,
    paidAt: payment.paidAt,
    source: provider,
    category,
    note: payment.reviewNote || (category === "one-off" ? `${label} one-off payment` : ""),
    squarePaymentId: payment.squarePaymentId || payment.id,
    providerPaymentId: payment.providerPaymentId || payment.squarePaymentId || payment.id,
    paymentProvider: provider
  });
  const statusSaved = await saveStagedStatus(payment.id, {
    status: "approved",
    memberId: category === "tuition" ? payer.id : member.id,
    suggestedMemberId: category === "tuition" ? payer.id : member.id,
    paymentMonth: month,
    paymentCategory: category,
    reviewNote: payment.reviewNote || ""
  });
  if (!statusSaved) {
    showToast("카드 검토 상태를 저장하지 못했습니다. 다시 시도하세요. · Could not save the card review status. Please try again.");
    render();
    return;
  }
  state.store = nextStore;
  saveStore(MSG.paymentSaved);
  const afterIds = new Set(state.store.payments.map((item) => item.id));
  const addedIds = state.store.payments.filter((item) => !beforeIds.has(item.id)).map((item) => item.id);
  const replacedPayments = beforePayments.filter((item) => !afterIds.has(item.id));
  logAddedPayments(member, addedIds, [month], {
    ko: `${label} 결제 승인`,
    en: `${label} payment approved`
  }, {
    stagedPaymentId: payment.id,
    provider,
    previousStatus: payment.status || "pending"
  }, replacedPayments);
  selectNextStagedPayment(payment.id);
  const categoryLabel = category === "one-off" ? "기타 매출 · other sale" : "회비 · tuition";
  showToast(`${member.name} — ${formatMonthBi(month)} ${label} 결제 승인됨 (${categoryLabel}) · ${label} payment approved`);
  render();
}

async function ignoreStagedPayment(paymentId) {
  const payment = state.stagedPayments.find((item) => item.id === paymentId);
  const statusSaved = await saveStagedStatus(paymentId, { status: "ignored", ignoredReason: "manual-review" });
  if (!statusSaved) {
    showToast("카드 검토 상태를 저장하지 못했습니다. 다시 시도하세요. · Could not save the card review status. Please try again.");
    render();
    return;
  }
  logProviderStatus(payment, {
    ko: "카드 결제 검토에서 제외",
    en: "Card payment ignored"
  });
  selectNextStagedPayment(paymentId);
  showToast("카드 결제를 무시했습니다 · Card payment ignored");
  render();
}

async function saveStagedStatus(paymentId, patch) {
  const current = state.stagedPayments.find((payment) => payment.id === paymentId);
  state.stagedPayments = state.stagedPayments.map((payment) =>
    payment.id === paymentId ? { ...payment, ...patch } : payment
  );

  try {
    const data = window.paymentTrackerProviders
      ? await window.paymentTrackerProviders.updateStatus("square", paymentId, patch)
      : await fetchProviderJson("/api/square/payments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, ...patch })
      });
    if (data.payment) {
      state.stagedPayments = state.stagedPayments.map((payment) =>
        payment.id === paymentId ? data.payment : payment
      );
    }
    return true;
  } catch {
    state.stagedPayments = state.stagedPayments.map((payment) =>
      payment.id === paymentId ? current : payment
    );
    return false;
  }
}

async function fetchProviderJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.nextStep || data.error || "Payment provider request failed.");
  }
  return data;
}

async function loadSquareConnectionSettings() {
  if (!window.paymentTrackerProviders) {
    elements.squareSettingsStatus.textContent = "개발 서버에서는 환경 변수로 연결합니다. · Development server uses environment variables.";
    return;
  }
  try {
    const settings = await window.paymentTrackerProviders.getSettings();
    elements.squareRelayUrl.value = settings.squareRelayBaseUrl || "";
    elements.squareSettingsStatus.textContent = settings.squareRelayConfigured
      ? "Square 중계 서버가 연결되어 있습니다. · Square relay is configured."
      : "Square 중계 서버 정보를 입력하세요. · Enter the Square relay information.";
  } catch (error) {
    elements.squareSettingsStatus.textContent = error.message;
  }
}

async function saveSquareConnectionSettings() {
  if (!window.paymentTrackerProviders) {
    showToast("설치된 Windows 앱에서 설정하세요. · Configure this in the installed Windows app.");
    return;
  }
  elements.saveSquareSettingsButton.disabled = true;
  try {
    const result = await window.paymentTrackerProviders.saveSquareRelay({
      baseUrl: elements.squareRelayUrl.value,
      token: elements.squareRelayToken.value
    });
    elements.squareRelayToken.value = "";
    elements.squareSettingsStatus.textContent = result.configured
      ? "연결을 저장했습니다. 이제 Sync Square를 누르세요. · Connection saved. Click Sync Square."
      : "연결 설정을 지웠습니다. · Connection settings cleared.";
    showToast(elements.squareSettingsStatus.textContent);
    await loadSquarePayments();
  } catch (error) {
    elements.squareSettingsStatus.textContent = error.message;
    showToast(error.message);
  } finally {
    elements.saveSquareSettingsButton.disabled = false;
  }
}

function dateForPayment(payment) {
  const date = new Date(payment?.paidAt || payment?.createdAt || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function selectNextStagedPayment(previousId) {
  const next = state.stagedPayments.find((payment) =>
    payment.id !== previousId && (payment.status === "pending" || payment.status === "needs_match")
  ) || state.stagedPayments.find((payment) => payment.id !== previousId);
  state.selectedStagedId = next?.id || "";
}

// ---------------------------------------------------------------------------
// Member and payment actions
// ---------------------------------------------------------------------------

function addNewMember() {
  const startDate = new Date().toISOString().slice(0, 10);
  const member = {
    id: makeId("mem"),
    name: "New Member",
    startDate,
    agreementEndDate: defaultAgreementEndDate(startDate),
    agreementType: "Contract",
    monthlyAmount: 0,
    lateFeeMinimum: 5,
    lateFeePercentage: 5,
    email: "",
    phone: "",
    homePhone: "",
    workPhone: "",
    cellPhone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    dob: "",
    emailConsent: "No",
    textConsent: "No",
    phoneConsent: "No",
    downPayment: "",
    parentName: "",
    responsiblePartyId: "",
    householdName: "",
    householdRole: "adult",
    participant: true,
    programs: [],
    certifications: { tae_kwon_do: "", muay_thai: "", legacyLabel: "" },
    beltLevel: "",
    nextLevel: "",
    squareCustomerId: "",
    externalId: "",
    inactive: false
  };
  state.store = upsertMember(state.store, member);
  saveStore(MSG.newMemberAdded);
  selectMember(member.id);
  elements.memberName.focus();
  elements.memberName.select();
}

function addFamilyMember() {
  const familyMember = selectedMember();
  if (!familyMember) {
    return;
  }

  const startDate = familyMember.startDate || new Date().toISOString().slice(0, 10);
  const member = {
    id: makeId("mem"),
    name: "New Family Member",
    startDate,
    agreementEndDate: defaultAgreementEndDate(startDate),
    agreementType: familyMember.agreementType || "Contract",
    monthlyAmount: familyMember.monthlyAmount || 0,
    lateFeeMinimum: familyMember.lateFeeMinimum ?? 5,
    lateFeePercentage: familyMember.lateFeePercentage ?? 5,
    email: "",
    phone: "",
    homePhone: "",
    workPhone: "",
    cellPhone: "",
    address: familyMember.address || "",
    city: familyMember.city || "",
    state: familyMember.state || "",
    zip: familyMember.zip || "",
    dob: "",
    emailConsent: "No",
    textConsent: "No",
    phoneConsent: "No",
    downPayment: "",
    parentName: familyMember.parentName || (familyMember.householdRole === "parent_guardian" ? familyMember.name : ""),
    responsiblePartyId: familyMember.responsiblePartyId || familyMember.id,
    householdName: familyMember.householdName,
    householdId: familyMember.householdId || "",
    householdRole: "child",
    participant: true,
    programs: [],
    certifications: { tae_kwon_do: "", muay_thai: "", legacyLabel: "" },
    beltLevel: "",
    nextLevel: "",
    squareCustomerId: "",
    externalId: "",
    inactive: false
  };
  state.store = upsertMember(state.store, member);
  saveStore(MSG.newMemberAdded);
  selectMember(member.id);
  elements.memberName.focus();
  elements.memberName.select();
}

function addFamilyAccountPerson(role) {
  const selected = selectedMember();
  if (!selected) return;
  const family = accountMembers(state.store.members, selected);
  const currentPayer = getResponsibleParty(selected, state.store.members) || selected;
  const hasParent = family.some((person) => person.householdRole === "parent_guardian");
  const becomesPayer = role === "parent_guardian" && !hasParent;
  const startDate = selected.startDate || new Date().toISOString().slice(0, 10);
  const person = {
    id: makeId("mem"),
    name: role === "parent_guardian" ? "New Parent / Guardian" : "New Child",
    startDate,
    agreementEndDate: defaultAgreementEndDate(startDate),
    agreementType: selected.agreementType || "Contract",
    monthlyAmount: 0,
    lateFeeMinimum: selected.lateFeeMinimum ?? 5,
    lateFeePercentage: selected.lateFeePercentage ?? 5,
    email: "",
    phone: "",
    homePhone: "",
    workPhone: "",
    cellPhone: "",
    address: selected.address || "",
    city: selected.city || "",
    state: selected.state || "",
    zip: selected.zip || "",
    dob: "",
    emailConsent: "No",
    textConsent: "No",
    phoneConsent: "No",
    downPayment: "",
    parentName: becomesPayer ? "" : currentPayer.name,
    responsiblePartyId: becomesPayer ? "" : currentPayer.id,
    householdName: selected.householdName || currentPayer.householdName || `${becomesPayer ? "New Parent / Guardian" : currentPayer.name} Family`,
    householdId: "",
    householdRole: role,
    participant: role !== "parent_guardian",
    programs: [],
    certifications: { tae_kwon_do: "", muay_thai: "", legacyLabel: "" },
    beltLevel: "",
    nextLevel: "",
    squareCustomerId: "",
    externalId: "",
    inactive: false
  };
  state.store = upsertMember(state.store, person);

  if (becomesPayer) {
    const householdName = `${person.name} Family`;
    state.store = migrateStore({
      ...state.store,
      members: state.store.members.map((candidate) =>
        [...family.map((item) => item.id), person.id].includes(candidate.id)
          ? {
              ...candidate,
              responsiblePartyId: person.id,
              parentName: candidate.id === person.id ? "" : person.name,
              householdName,
              householdId: ""
            }
          : candidate
      )
    });
  }

  saveStore(MSG.newMemberAdded);
  elements.familyAccountPanel.open = true;
  render();
  elements.familyAccountPanel.open = true;
  const nameInput = elements.familyAccountMembers.querySelector(`[data-family-account-member="${person.id}"] [data-family-name]`);
  nameInput?.focus();
  nameInput?.select();
}

function addExistingMemberToFamily() {
  const selected = selectedMember();
  const memberId = elements.familyExistingMember.value;
  const existing = state.store.members.find((person) => person.id === memberId);
  if (!selected || !existing) {
    showToast("추가할 기존 회원을 선택하세요. · Choose an existing member to add.");
    return;
  }
  const payer = getResponsibleParty(selected, state.store.members) || selected;
  const householdName = payer.householdName || selected.householdName || `${payer.name} Family`;
  let nextStore = upsertMember(state.store, {
    ...existing,
    responsiblePartyId: payer.id,
    parentName: existing.id === payer.id ? "" : payer.name,
    householdName,
    householdId: ""
  });
  if (!payer.householdName) {
    const savedPayer = nextStore.members.find((person) => person.id === payer.id);
    if (savedPayer) {
      nextStore = upsertMember(nextStore, { ...savedPayer, householdName, householdId: "" });
    }
  }
  state.store = nextStore;
  saveStore("기존 회원을 가족에 추가함 · Existing member added to family");
  showToast(`${existing.name} 님을 가족에 추가했습니다. · Added ${existing.name} to the family.`);
  render();
  elements.familyAccountPanel.open = true;
}

function removeMemberFromFamily(memberId) {
  const member = state.store.members.find((person) => person.id === memberId);
  if (!member) return;
  const family = accountMembers(state.store.members, member);
  if (family.length <= 1) {
    showToast("이 회원은 이미 단독 계정입니다. · This member is already standalone.");
    return;
  }
  const payer = getResponsibleParty(member, state.store.members) || member;
  const confirmed = window.confirm(
    `Remove ${member.name} from this family account? Their member record and ${state.store.payments.filter((payment) => payment.memberId === member.id).length} payment record(s) will be kept.`
  );
  if (!confirmed) return;

  const remainingFamily = family.filter((person) => person.id !== member.id);
  const replacementPayer = member.id === payer.id
    ? remainingFamily.find((person) => person.householdRole === "parent_guardian") || remainingFamily[0]
    : payer;
  const nextMembers = state.store.members.map((person) => {
    if (person.id === member.id) {
      return { ...person, responsiblePartyId: person.id, parentName: "", householdName: "", householdId: "" };
    }
    if (remainingFamily.some((relative) => relative.id === person.id)) {
      return {
        ...person,
        responsiblePartyId: replacementPayer.id,
        parentName: person.id === replacementPayer.id ? "" : replacementPayer.name,
        householdName: replacementPayer.householdName || `${replacementPayer.name} Family`,
        householdId: ""
      };
    }
    return person;
  });
  state.store = migrateStore({ ...state.store, members: nextMembers });
  saveStore("가족에서 회원 제거됨 · Member removed from family");
  showToast(`${member.name} 님을 가족에서 제거했습니다. 기록과 납부 내역은 보존되었습니다. · Removed ${member.name} from the family; their record and payments were kept.`);
  render();
}

function deleteMember(memberId) {
  const member = state.store.members.find((person) => person.id === memberId);
  if (!member) return;
  const paymentCount = state.store.payments.filter((payment) => payment.memberId === member.id).length;
  const confirmed = window.confirm(
    `${member.name} will be permanently deleted, along with ${paymentCount} payment record${paymentCount === 1 ? "" : "s"}. You can then enter the person again. Continue?`
  );
  if (!confirmed) return;

  const remainingMembers = state.store.members
    .filter((person) => person.id !== member.id)
    .map((person) => person.responsiblePartyId === member.id
      ? { ...person, responsiblePartyId: "", parentName: "" }
      : person);
  state.store = migrateStore({
    ...state.store,
    members: remainingMembers,
    payments: state.store.payments.filter((payment) => payment.memberId !== member.id)
  });
  if (state.selectedId === member.id) {
    state.selectedId = remainingMembers[0]?.id || "";
  }
  saveStore("회원 삭제됨 · Member deleted");
  showToast(`${member.name} 님과 해당 납부 기록을 삭제했습니다. · Deleted ${member.name} and their payment records.`);
  render();
}

function saveFamilyAccount(event) {
  event.preventDefault();
  const selected = selectedMember();
  if (!selected) return;
  const family = accountMembers(state.store.members, selected);
  const rows = Array.from(elements.familyAccountMembers.querySelectorAll("[data-family-account-member]"));
  const payerId = elements.familyAccountMembers.querySelector("input[name='familyPayer']:checked")?.value || family[0]?.id;
  const payerRow = rows.find((row) => row.dataset.familyAccountMember === payerId);
  const payerName = payerRow?.querySelector("[data-family-name]")?.value.trim()
    || family.find((person) => person.id === payerId)?.name
    || selected.name;
  const priorPayerName = family.find((person) => person.id === payerId)?.name || "";
  const requestedHouseholdName = elements.familyAccountHouseholdName.value.trim();
  const householdName = !requestedHouseholdName || requestedHouseholdName === `${priorPayerName} Family`
    ? `${payerName} Family`
    : requestedHouseholdName;

  let nextStore = state.store;
  rows.forEach((row) => {
    const member = nextStore.members.find((person) => person.id === row.dataset.familyAccountMember);
    if (!member) return;
    nextStore = upsertMember(nextStore, {
      ...member,
      name: row.querySelector("[data-family-name]").value.trim() || member.name,
      householdRole: row.querySelector("[data-family-role]").value,
      participant: row.querySelector("[data-family-participant]").checked,
      monthlyAmount: member.id === payerId && !row.querySelector("[data-family-participant]").checked
        ? 0
        : row.querySelector("[data-family-monthly]").value,
      responsiblePartyId: payerId,
      parentName: member.id === payerId ? "" : payerName,
      householdName,
      householdId: ""
    });
  });
  state.store = nextStore;
  saveStore("가족 청구 계정 저장됨 · Family account saved");
  showToast("가족 청구 계정이 저장되었습니다. · Family account saved.");
  render();
  elements.familyAccountPanel.open = true;
}

function quickPayCurrentMonth() {
  const member = selectedMember();
  if (!member || member.collectionPlacement?.status === "charged_off") {
    return;
  }
  const payer = getResponsibleParty(member, state.store.members) || member;
  if (payer.id !== member.id) {
    showToast(`납부는 ${payer.name} 계정에서 관리합니다. · Record payments on the payer account.`);
    return;
  }
  const status = getMemberStatus(member, state.store.payments, new Date(), state.store.members);
  const amount = getMemberBalance(member, state.store.payments, new Date(), state.store.members).monthlyAmount;
  if (status.prepaidMonths?.has(status.currentMonth)) {
    showToast("This month is covered by the contract down payment.");
    return;
  }
  if (status.paidMonths.has(status.currentMonth)) {
    markMonthUnpaid(status.currentMonth);
    return;
  }
  if (amount <= 0) {
    return;
  }
  markMonthPaid(status.currentMonth);
}

function catchUpMemberPayments() {
  const member = selectedMember();
  if (!member || member.collectionPlacement?.status === "charged_off") {
    return;
  }

  const payer = getResponsibleParty(member, state.store.members) || member;
  if (payer.id !== member.id) {
    showToast(`납부는 ${payer.name} 계정에서 관리합니다. · Record payments on the payer account.`);
    return;
  }
  const balance = getMemberBalance(member, state.store.payments, new Date(), state.store.members);
  if (!balance.dueUnpaidMonths.length || balance.monthlyAmount <= 0) {
    return;
  }

  const result = reconcileDuePayments(state.store, member, [], new Date());
  state.store = result.store;
  const activityId = logAddedPayments(member, result.batch.paymentIds, result.batch.months, {
    ko: "미납 회비 일괄 납부",
    en: "Catch-up payments recorded"
  });
  state.lastPaymentBatch = result.batch.paymentIds.length ? { ...result.batch, activityId } : null;
  saveStore(MSG.paymentsCaughtUpFor(member.name, result.batch.months.length));
  showToast(MSG.paymentsCaughtUpFor(member.name, result.batch.months.length));
  render();
}

function undoMemberCatchUp() {
  if (!state.lastPaymentBatch) {
    return;
  }
  if (state.lastPaymentBatch.activityId) {
    const result = undoActivity(state.store, state.activityLog, state.lastPaymentBatch.activityId);
    state.store = result.store;
    state.activityLog = result.log;
    saveActivityLog();
  } else {
    state.store = undoPaymentBatch(state.store, state.lastPaymentBatch);
  }
  state.lastPaymentBatch = null;
  saveStore("방금 완납 처리를 취소했습니다. · Catch-up undone.");
  showToast("방금 완납 처리를 취소했습니다. · Catch-up undone.");
  render();
}

function openAttentionReview(startMemberId = "") {
  const followups = getOperatorBrief(state.store, state.stagedPayments).tuitionFollowups;
  if (followups.length === 0) {
    showToast("오늘 확인할 미납이 없습니다. · No tuition is due for review today.");
    return;
  }
  const memberIds = followups.map((row) => row.memberId);
  const requestedIndex = memberIds.indexOf(startMemberId);
  state.attentionReview = {
    memberIds,
    index: requestedIndex >= 0 ? requestedIndex : 0,
    reviewed: 0,
    changed: 0,
    kept: 0,
    lastBatch: null,
    message: "",
    visibleMonths: {}
  };
  renderAttentionReview();
  elements.attentionReviewDialog.showModal();
}

function currentAttentionMember() {
  const review = state.attentionReview;
  if (!review || review.index >= review.memberIds.length) {
    return null;
  }
  return state.store.members.find((member) => member.id === review.memberIds[review.index]) || null;
}

function renderAttentionReview() {
  const review = state.attentionReview;
  if (!review) {
    return;
  }
  const member = currentAttentionMember();
  elements.attentionExceptionPanel.classList.add("hidden");
  elements.attentionExceptButton.setAttribute("aria-expanded", "false");
  elements.attentionUndoButton.disabled = !review.lastBatch;
  elements.attentionReviewMessage.textContent = review.message || "선택하면 자동으로 다음 회원으로 이동합니다. · Your choice advances to the next member.";

  if (!member) {
    elements.attentionReviewProgress.textContent = `${review.memberIds.length} / ${review.memberIds.length}`;
    elements.attentionReviewName.textContent = "검토 완료 · Review Complete";
    elements.attentionReviewContext.textContent = `${review.changed}명 변경 · ${review.changed} changed · ${review.kept}명 그대로 유지 · ${review.kept} kept as-is`;
    elements.attentionReviewFacts.innerHTML = "";
    elements.attentionReviewMonths.innerHTML = `<div class="review-complete-mark">✓</div>`;
    [elements.attentionAllPaid, elements.attentionKeepAsIs, elements.attentionExceptButton].forEach((button) => button.classList.add("hidden"));
    return;
  }

  [elements.attentionAllPaid, elements.attentionKeepAsIs, elements.attentionExceptButton].forEach((button) => button.classList.remove("hidden"));
  const pending = pendingStagedPaymentsForMember(state.stagedPayments, member, state.store.members);
  const paymentState = getMemberPaymentState(member, state.store.payments, new Date(), pending, state.store.members);
  const balance = getMemberBalance(member, state.store.payments, new Date(), state.store.members);
  const certifications = normalizeMemberCertifications(member);
  elements.attentionReviewProgress.textContent = `${review.index + 1} / ${review.memberIds.length}`;
  elements.attentionReviewName.textContent = member.name;
  elements.attentionReviewContext.textContent = `${member.householdName || "개인 회원"} · ${paymentState.oldestDaysLate === 0 ? "오늘 납부일 · Due today" : `${paymentState.oldestDaysLate}일 지남 · ${paymentState.oldestDaysLate} days late`}`;
  elements.attentionReviewFacts.innerHTML = `
    <div><small>자격 · Certification</small><strong>${escapeHtml(certifications.tae_kwon_do || certifications.muay_thai || certifications.legacyLabel || "미설정 · Not set")}</strong></div>
    <div><small>납부일 · Due day</small><strong>매월 ${Number(paymentState.months[0]?.dueDate?.split("-")[2]) || Number(member.startDate?.split("-")[2]) || 1}일</strong></div>
    <div><small>현재 미납액 · Balance</small><strong>${formatMoney(balance.dueNow)}</strong></div>
  `;
  const visibleMonths = review.visibleMonths[member.id] || paymentState.dueUnpaidMonths.map((month) => month.month);
  review.visibleMonths[member.id] = visibleMonths;
  const statesByMonth = new Map(paymentState.months.map((month) => [month.month, month]));
  elements.attentionReviewMonths.innerHTML = visibleMonths.map((monthKey) => {
    const month = statesByMonth.get(monthKey) || { month: monthKey, paid: false, pending: false, state: "attention" };
    return `
    <button type="button" class="attention-month ${month.paid ? "paid" : month.state}" data-attention-pay-month="${escapeHtml(month.month)}"${month.pending ? " disabled" : ""}>
      <strong>${formatMonthKo(month.month)}</strong>
      <small lang="en">${formatMonthEn(month.month)}</small>
      <span>${month.pending ? "카드 결제 검토 중 · Card review pending" : month.paid ? "납부함 — 클릭하여 미납으로 변경 · Paid — click to mark unpaid" : "클릭하여 납부 완료 · Click to mark paid"}</span>
    </button>
  `;
  }).join("");
  elements.attentionReviewMonths.querySelectorAll("[data-attention-pay-month]").forEach((button) => {
    button.addEventListener("click", () => toggleAttentionMonthPaid(button.dataset.attentionPayMonth));
  });
  elements.attentionExceptionMonths.innerHTML = paymentState.dueUnpaidMonths.map((month, index) => `
    <label class="attention-exception-choice">
      <input type="checkbox" value="${escapeHtml(month.month)}" checked${month.pending ? " disabled" : ""}>
      <span><strong>${formatMonthKo(month.month)}</strong><small lang="en">${formatMonthEn(month.month)} — ${month.pending ? "Card review pending" : "Still missing"}</small></span>
    </label>
  `).join("");
  const canChange = balance.monthlyAmount > 0 && paymentState.dueUnpaidMonths.length > 0;
  elements.attentionAllPaid.disabled = !canChange;
  elements.attentionSaveExceptions.disabled = !canChange;
}

function pendingReviewMonths(member) {
  const pending = pendingStagedPaymentsForMember(state.stagedPayments, member, state.store.members);
  return getMemberPaymentState(member, state.store.payments, new Date(), pending, state.store.members)
    .dueUnpaidMonths
    .filter((month) => month.pending)
    .map((month) => month.month);
}

function markAttentionMemberPaid() {
  const member = currentAttentionMember();
  if (!member) {
    return;
  }
  const pendingMonths = pendingReviewMonths(member);
  const result = reconcileDuePayments(state.store, member, pendingMonths, new Date());
  state.store = result.store;
  const activityId = logAddedPayments(member, result.batch.paymentIds, result.batch.months, {
    ko: "검토에서 납부 완료",
    en: "Review marked paid"
  });
  state.attentionReview.lastBatch = { ...result.batch, activityId };
  state.attentionReview.changed += 1;
  advanceAttentionReview(pendingMonths.length
    ? `${member.name}: 확인 가능한 월은 납부 완료, 카드 검토 ${pendingMonths.length}개월 유지 · Actionable months paid; ${pendingMonths.length} card-pending month${pendingMonths.length === 1 ? "" : "s"} unchanged`
    : `${member.name}: 모두 납부 완료 · All due months marked paid`);
}

function toggleAttentionMonthPaid(month) {
  const member = currentAttentionMember();
  if (!member || !month) {
    return;
  }
  const payer = getResponsibleParty(member, state.store.members) || member;
  const amount = getMemberBalance(member, state.store.payments, new Date(), state.store.members).monthlyAmount;
  if (payer.id !== member.id || amount <= 0) return;
  const pending = pendingStagedPaymentsForMember(state.stagedPayments, member, state.store.members);
  const paymentState = getMemberPaymentState(member, state.store.payments, new Date(), pending, state.store.members);
  if (paymentState.paidMonths.has(month)) {
    const removed = state.store.payments.filter((payment) =>
      payment.memberId === payer.id && payment.month === month && payment.category !== "one-off"
    );
    state.store = removePayment(state.store, payer.id, month);
    const activityId = logRemovedPayments(member, removed, {
      ko: "검토에서 한 달 미납으로 변경",
      en: "Review marked one month unpaid"
    });
    state.attentionReview.lastBatch = { memberId: payer.id, months: [month], paymentIds: [], activityId };
    state.attentionReview.changed += 1;
    state.attentionReview.message = `${member.name}: ${formatMonthBi(month)} 미납으로 변경 · Marked unpaid`;
    saveStore(MSG.paymentRemoved);
    showToast(MSG.paymentRemovedFor(member.name, formatMonthBi(month)));
    render();
    renderAttentionReview();
    return;
  }
  const beforeIds = new Set(state.store.payments.map((payment) => payment.id));
  state.store = addPayment(state.store, {
    memberId: payer.id,
    month,
    amount,
    source: "attention-review"
  });
  const paymentIds = state.store.payments.filter((payment) => !beforeIds.has(payment.id)).map((payment) => payment.id);
  if (!paymentIds.length) return;
  const activityId = logAddedPayments(member, paymentIds, [month], {
    ko: "검토에서 한 달 납부 완료",
    en: "Review marked one month paid"
  });
  state.attentionReview.lastBatch = { memberId: payer.id, months: [month], paymentIds, activityId };
  state.attentionReview.changed += 1;
  state.attentionReview.message = `${member.name}: ${formatMonthBi(month)} 납부 완료 · Payment recorded`;
  saveStore(MSG.paymentSaved);
  showToast(MSG.paymentSavedFor(member.name, formatMonthBi(month)));
  render();
  renderAttentionReview();
}

function keepAttentionMemberAsIs() {
  const member = currentAttentionMember();
  if (!member) {
    return;
  }
  state.attentionReview.lastBatch = null;
  state.attentionReview.kept += 1;
  advanceAttentionReview(`${member.name}: 그대로 유지 · Kept as-is`);
}

function toggleAttentionExceptions() {
  const hidden = elements.attentionExceptionPanel.classList.toggle("hidden");
  elements.attentionExceptButton.setAttribute("aria-expanded", String(!hidden));
}

function saveAttentionExceptions() {
  const member = currentAttentionMember();
  if (!member) {
    return;
  }
  const stillMissing = Array.from(new Set([
    ...Array.from(elements.attentionExceptionMonths.querySelectorAll("input:checked")).map((input) => input.value),
    ...pendingReviewMonths(member)
  ]));
  const result = reconcileDuePayments(state.store, member, stillMissing, new Date());
  state.store = result.store;
  const activityId = logAddedPayments(member, result.batch.paymentIds, result.batch.months, {
    ko: "일부 월 납부 완료",
    en: "Selected months marked paid"
  });
  state.attentionReview.lastBatch = result.batch.paymentIds.length ? { ...result.batch, activityId } : null;
  if (result.batch.paymentIds.length > 0) {
    state.attentionReview.changed += 1;
  } else {
    state.attentionReview.kept += 1;
  }
  advanceAttentionReview(`${member.name}: ${stillMissing.length}개월 미납 유지 · ${stillMissing.length} month${stillMissing.length === 1 ? "" : "s"} left missing`);
}

function advanceAttentionReview(message) {
  const review = state.attentionReview;
  review.reviewed += 1;
  review.index += 1;
  review.message = message;
  saveStore("검토 결과 저장됨 · Review saved");
  render();
  renderAttentionReview();
}

function undoAttentionAction() {
  const review = state.attentionReview;
  if (!review?.lastBatch) {
    return;
  }
  const batch = review.lastBatch;
  if (batch.activityId) {
    const result = undoActivity(state.store, state.activityLog, batch.activityId);
    state.store = result.store;
    state.activityLog = result.log;
    saveActivityLog();
  } else {
    state.store = undoPaymentBatch(state.store, batch);
  }
  review.index = Math.max(0, review.memberIds.indexOf(batch.memberId));
  review.reviewed = Math.max(0, review.reviewed - 1);
  review.changed = Math.max(0, review.changed - 1);
  review.lastBatch = null;
  review.message = "방금 변경을 취소했습니다. · Last payment change undone.";
  saveStore("방금 변경 취소됨 · Last change undone");
  render();
  renderAttentionReview();
}

function markMonthUnpaid(month) {
  const member = selectedMember();
  if (!member || !month || member.collectionPlacement?.status === "charged_off") {
    return;
  }
  const payer = getResponsibleParty(member, state.store.members) || member;
  if (payer.id !== member.id) {
    showToast(`납부는 ${payer.name} 계정에서 관리합니다. · Record payments on the payer account.`);
    return;
  }

  const removed = state.store.payments.filter((payment) => payment.memberId === payer.id && payment.month === month && payment.category !== "one-off");
  state.store = removePayment(state.store, payer.id, month);
  logRemovedPayments(member, removed);
  saveStore(MSG.paymentRemoved);
  showToast(MSG.paymentRemovedFor(member.name, formatMonthBi(month)));
  render();
}

function markMonthPaid(month) {
  const member = selectedMember();
  if (!member || !month || member.collectionPlacement?.status === "charged_off") {
    return;
  }
  const payer = getResponsibleParty(member, state.store.members) || member;
  if (payer.id !== member.id) {
    showToast(`납부는 ${payer.name} 계정에서 관리합니다. · Record payments on the payer account.`);
    return;
  }
  const amount = getMemberBalance(member, state.store.payments, new Date(), state.store.members).monthlyAmount;
  if (amount <= 0) {
    showToast("월 회비를 먼저 입력하세요. · Enter the monthly amount first.");
    return;
  }
  const beforeIds = new Set(state.store.payments.map((payment) => payment.id));
  state.store = addPayment(state.store, { memberId: payer.id, month, amount });
  const addedIds = state.store.payments.filter((payment) => !beforeIds.has(payment.id)).map((payment) => payment.id);
  logAddedPayments(member, addedIds, [month]);
  saveStore(MSG.paymentSaved);
  showToast(MSG.paymentSavedFor(member.name, formatMonthBi(month)));
  render();
}

function toggleMonthPaid(month) {
  const member = selectedMember();
  if (!member) return;
  const status = getMemberStatus(member, state.store.payments, new Date(), state.store.members);
  if (status.prepaidMonths?.has(month)) {
    showToast("This month is covered by the contract down payment.");
    return;
  }
  if (status.paidMonths.has(month)) {
    markMonthUnpaid(month);
  } else {
    markMonthPaid(month);
  }
}

function parentNameForPayer(member, payerId, fallback = "") {
  const payer = state.store.members.find((candidate) => candidate.id === payerId);
  return payer && payer.id !== member.id ? payer.name : fallback;
}

function saveQuickProfile(event) {
  event.preventDefault();
  const member = selectedMember();
  if (!member) return;
  const startDate = elements.quickMemberStart.value;
  const priorDefaultEnd = defaultAgreementEndDate(member.startDate);
  const requestedEnd = elements.quickMemberAgreementEnd.value;
  const agreementEndDate = !requestedEnd || requestedEnd === priorDefaultEnd
    ? defaultAgreementEndDate(startDate)
    : requestedEnd;
  const payerId = elements.quickResponsibleParty.value || member.id;
  const automaticPayerAmount = payerId === member.id && member.participant === false;
  state.store = upsertMember(state.store, {
    ...member,
    name: elements.quickMemberName.value,
    dob: elements.quickMemberDob.value,
    phone: elements.quickMemberCellPhone.value,
    cellPhone: elements.quickMemberCellPhone.value,
    email: elements.quickMemberEmail.value,
    address: elements.quickMemberAddress.value,
    city: elements.quickMemberCity.value,
    state: elements.quickMemberState.value,
    zip: elements.quickMemberZip.value,
    responsiblePartyId: payerId,
    parentName: parentNameForPayer(member, payerId, member.parentName),
    agreementType: elements.quickAgreementType.value,
    monthlyAmount: automaticPayerAmount ? 0 : elements.quickMemberAmount.value,
    startDate,
    agreementEndDate
  });
  saveStore(MSG.memberSaved);
  showToast(MSG.memberSavedToast);
  render();
}

function saveMember(event) {
  event.preventDefault();
  const member = selectedMember();
  if (!member) {
    return;
  }
  const payerId = elements.memberResponsibleParty.value || member.id;
  const automaticPayerAmount = payerId === member.id && !elements.memberParticipant.checked;
  const householdName = elements.memberHousehold.value.trim() || suggestedHouseholdName(payerId, member);
  state.store = upsertMember(state.store, {
    ...member,
    name: elements.memberName.value,
    phone: elements.memberCellPhone.value,
    homePhone: elements.memberHomePhone.value,
    workPhone: elements.memberWorkPhone.value,
    cellPhone: elements.memberCellPhone.value,
    address: elements.memberAddress.value,
    city: elements.memberCity.value,
    state: elements.memberState.value,
    zip: elements.memberZip.value,
    dob: elements.memberDob.value,
    email: elements.memberEmail.value,
    parentName: parentNameForPayer(member, payerId, elements.memberParent.value),
    responsiblePartyId: payerId,
    householdName,
    householdId: "",
    householdRole: elements.memberRole.value,
    participant: elements.memberParticipant.checked,
    programs: [
      elements.memberTaeKwonDo.checked ? "tae_kwon_do" : "",
      elements.memberMuayThai.checked ? "muay_thai" : ""
    ].filter(Boolean),
    certifications: {
      tae_kwon_do: elements.memberBeltLevel.value,
      muay_thai: elements.memberMuayThaiLevel.value,
      legacyLabel: normalizeMemberCertifications(member).legacyLabel
    },
    beltLevel: elements.memberBeltLevel.value || elements.memberMuayThaiLevel.value,
    nextLevel: elements.memberNextLevel.value,
    squareCustomerId: elements.memberSquareCustomerId.value,
    monthlyAmount: automaticPayerAmount ? 0 : elements.memberAmount.value,
    lateFeeMinimum: elements.memberLateFeeMinimum.value,
    lateFeePercentage: elements.memberLateFeePercentage.value,
    startDate: elements.memberStart.value,
    agreementType: elements.memberAgreementType.value,
    agreementEndDate: elements.memberAgreementEnd.value || defaultAgreementEndDate(elements.memberStart.value),
    downPayment: elements.memberDownPayment.value,
    emailConsent: elements.memberEmailConsent.checked ? "Yes" : "No",
    textConsent: elements.memberTextConsent.checked ? "Yes" : "No",
    phoneConsent: elements.memberPhoneConsent.checked ? "Yes" : "No",
    inactive: elements.memberInactive.checked
  });
  saveStore(MSG.memberSaved);
  showToast(MSG.memberSavedToast);
  render();
}

function recordMemberDownPayment() {
  const member = selectedMember();
  if (!member) return;
  const payer = getResponsibleParty(member, state.store.members) || member;
  if (payer.id !== member.id) {
    showToast(`계약금은 ${payer.name} 계정에서 기록하세요. · Record the down payment on the payer account.`);
    return;
  }
  try {
    const result = recordContractDownPayment(state.store, payer.id);
    if (!result.changed) {
      showToast("계약금 결제가 이미 기록되어 있습니다. · The down payment is already recorded.");
      return;
    }
    state.store = result.store;
    saveStore("계약금 결제 기록됨 · Contract down payment recorded");
    showToast(`${formatMoney(result.payment.amount)} 계약금 결제를 기록했습니다. · Down payment recorded.`);
    render();
  } catch (error) {
    showToast(error.message || "계약금 결제를 기록할 수 없습니다. · Could not record the down payment.");
  }
}

// ---------------------------------------------------------------------------
// First Credit Services collection placement
// ---------------------------------------------------------------------------

function openCollectionPlacement() {
  const member = selectedMember();
  if (!member) {
    return;
  }
  if (member.collectionPlacement?.status === "charged_off") {
    downloadCollectionPlacement(member.collectionPlacement);
    showToast("추심 파일을 다시 저장했습니다. · Placement spreadsheet saved again.");
    return;
  }

  const draft = createCollectionDraft(member, state.store.payments, new Date(), state.store.members);
  const values = {
    collectionFirstName: draft.firstName,
    collectionLastName: draft.lastName,
    collectionAddress: draft.address,
    collectionCity: draft.city,
    collectionState: draft.state,
    collectionZip: draft.zip,
    collectionDob: draft.dob,
    collectionHomePhone: formatPhone(draft.homePhone),
    collectionWorkPhone: formatPhone(draft.workPhone),
    collectionCellPhone: formatPhone(draft.cellPhone),
    collectionAgreementSign: draft.agreementSignDate,
    collectionAgreementExpiration: draft.agreementExpirationDate,
    collectionAgreementType: draft.agreementType,
    collectionChargeOffDate: draft.chargeOffDate,
    collectionServiceFees: Number(draft.serviceFees || 0).toFixed(2),
    collectionDownPayment: draft.downPayment,
    collectionEmailConsent: draft.emailConsent,
    collectionTextConsent: draft.textConsent
  };
  Object.entries(values).forEach(([id, value]) => {
    elements[id].value = value ?? "";
  });
  elements.collectionFinalized.checked = false;
  updateCollectionPlacementPreview();
  elements.collectionDialog.showModal();
  const firstMissing = elements.collectionForm.querySelector(":invalid");
  (firstMissing || elements.collectionFirstName).focus();
}

function readCollectionDraft() {
  const member = selectedMember();
  return {
    ...createCollectionDraft(member, state.store.payments, new Date(), state.store.members),
    firstName: elements.collectionFirstName.value.trim(),
    lastName: elements.collectionLastName.value.trim(),
    address: elements.collectionAddress.value.trim(),
    city: elements.collectionCity.value.trim(),
    state: elements.collectionState.value.trim().toUpperCase(),
    zip: elements.collectionZip.value.trim(),
    dob: elements.collectionDob.value,
    homePhone: elements.collectionHomePhone.value.trim(),
    workPhone: elements.collectionWorkPhone.value.trim(),
    cellPhone: elements.collectionCellPhone.value.trim(),
    agreementSignDate: elements.collectionAgreementSign.value,
    agreementExpirationDate: elements.collectionAgreementExpiration.value,
    agreementType: elements.collectionAgreementType.value,
    chargeOffDate: elements.collectionChargeOffDate.value,
    serviceFees: Number(elements.collectionServiceFees.value || 0),
    downPayment: elements.collectionDownPayment.value,
    emailConsent: elements.collectionEmailConsent.value,
    textConsent: elements.collectionTextConsent.value,
    ssn: "",
    gender: ""
  };
}

function updateCollectionPlacementPreview() {
  const member = selectedMember();
  if (!member) {
    return;
  }
  const draft = readCollectionDraft();
  const contract = draft.agreementType === "Contract";
  elements.collectionAgreementExpiration.disabled = !contract;
  elements.collectionAgreementExpiration.required = contract;
  const missing = getCollectionMissingFields(draft, member, state.store.payments);
  elements.collectionMissing.textContent = missing.length
    ? `필요한 정보 ${missing.length}개: ${missing.join(" · ")} · ${missing.length} required item${missing.length === 1 ? "" : "s"} remaining`
    : "모든 필수 정보가 준비되었습니다. · All required placement fields are ready.";
  elements.collectionMissing.classList.toggle("ready", missing.length === 0);

  let summary = `
    <div><span>청구 책임자 · Liable payer</span><strong>${escapeHtml(draft.responsiblePartyName || member.name)}</strong></div>
    <div><span>월 회비 · Monthly</span><strong>${formatMoney(member.monthlyAmount)}</strong></div>
    <div><span>연체료 조건 · Late-fee term</span><strong>${member.lateFeePercentage ?? 5}% or ${formatMoney(member.lateFeeMinimum ?? 5)}</strong></div>`;
  if (missing.length === 0) {
    try {
      const preview = buildCollectionPlacement(member, state.store.payments, draft);
      summary += `
        <div><span>미납 원금 · Past due</span><strong>${formatMoney(preview.pastDueAmount)}</strong></div>
        <div><span>연체료 · Late fees</span><strong>${formatMoney(preview.lateFees)}</strong></div>
        <div class="total"><span>고정 잔액 · Frozen balance</span><strong>${formatMoney(preview.frozenBalance)}</strong></div>`;
    } catch {
      // The missing-field message above remains the source of truth.
    }
  }
  elements.collectionSummary.innerHTML = summary;
  const ready = missing.length === 0 && elements.collectionFinalized.checked;
  elements.collectionDownloadButton.disabled = !ready;
  elements.collectionDownloadEmailButton.disabled = !ready;
}

function finalizeCollectionPlacement(event, openEmail) {
  event.preventDefault();
  const member = selectedMember();
  if (!member || member.collectionPlacement?.status === "charged_off") {
    return;
  }
  if (!elements.collectionForm.reportValidity()) {
    return;
  }
  const draft = readCollectionDraft();
  const missing = getCollectionMissingFields(draft, member, state.store.payments);
  if (missing.length || !elements.collectionFinalized.checked) {
    updateCollectionPlacementPreview();
    return;
  }

  let placement;
  try {
    placement = buildCollectionPlacement(member, state.store.payments, draft);
  } catch (error) {
    showToast(error.message);
    return;
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
  saveStore("추심 배치가 저장되었습니다 · Collection placement saved");
  downloadCollectionPlacement(placement, filename);
  elements.collectionDialog.close();
  render();
  showToast(`First Credit Services 파일 저장됨 · Saved ${filename}`);

  if (openEmail) {
    const email = firstCreditServicesEmailDraft(placement, filename);
    window.location.href = `mailto:${email.to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  }
}

function downloadCollectionPlacement(placement, filename = collectionPlacementFilename(placement)) {
  const bytes = createFirstCreditServicesWorkbook(placement);
  downloadBlob(
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
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

  const balance = getLateFeeBalance(member, state.store.payments, new Date(), state.store.members);
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
  elements.paymentReviewDialog.close();
  window.location.href = `mailto:${member.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function openGroupEmailDialog() {
  const members = groupEmailMembers();
  if (members.length === 0) {
    showToast("이메일 주소가 있는 활동 회원이 없습니다. · No active members have email addresses.");
    return;
  }

  elements.groupEmailSubjectInput.value = "World Martial Arts Center";
  elements.groupEmailMembers.innerHTML = members.map((member) => groupEmailMemberMarkup(member)).join("");
  updateGroupEmailDialog();
  elements.groupEmailDialog.showModal();
}

function updateGroupEmailDialog() {
  const checked = selectedGroupEmailMembers();
  const availableCount = elements.groupEmailMembers.querySelectorAll("input[type='checkbox']").length;
  elements.groupEmailHelp.textContent = `${checked.length}명 선택됨 · ${checked.length} selected from ${availableCount} members with email`;
  elements.openGroupEmailButton.disabled = checked.length === 0;
}

function setAllGroupEmailMembers(checked) {
  elements.groupEmailMembers.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = checked;
  });
  updateGroupEmailDialog();
}

function openGroupEmail() {
  const members = selectedGroupEmailMembers();
  if (members.length === 0) {
    showToast("이메일 받을 회원을 하나 이상 선택하세요. · Select at least one member.");
    return;
  }

  const emails = uniqueEmailList(members);
  const subject = elements.groupEmailSubjectInput.value.trim() || "World Martial Arts Center";
  elements.groupEmailDialog.close();
  window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(subject)}`;
}

function groupEmailMembers() {
  return state.store.members
    .filter((member) => !member.inactive && memberEmailList(member).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function selectedGroupEmailMembers() {
  const selectedIds = new Set(
    Array.from(elements.groupEmailMembers.querySelectorAll("input[type='checkbox']:checked"))
      .map((input) => input.value)
  );
  return groupEmailMembers().filter((member) => selectedIds.has(member.id));
}

function uniqueEmailList(members) {
  const seen = new Set();
  return members.flatMap(memberEmailList).filter((email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function memberEmailList(member) {
  return String(member.email || "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
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

function groupEmailMemberMarkup(member) {
  return `
    <label class="group-email-member">
      <input type="checkbox" value="${escapeHtml(member.id)}" checked>
      <span>
        <strong>${escapeHtml(member.name)}</strong>
        <small>${escapeHtml(memberEmailList(member).join(", "))}</small>
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
