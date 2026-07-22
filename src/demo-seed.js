import {
  addPayment,
  createEmptyStore,
  defaultAgreementEndDate,
  recordContractDownPayment,
  upsertMember
} from "./data.js";

const STORE_KEY = "master-lee-payment-tracker";
const BACKUP_POINTER_KEY = "master-lee-payment-tracker-demo-previous-key";
const now = new Date().toISOString().replace(/[:.]/g, "-");
const backupKey = `master-lee-payment-tracker-before-demo-${now}`;
const previous = localStorage.getItem(STORE_KEY);

if (previous) {
  localStorage.setItem(backupKey, previous);
  localStorage.setItem(BACKUP_POINTER_KEY, backupKey);
}

let store = createEmptyStore();
const members = [
  {
    id: "demo-lee-parent",
    name: "Janet Lee",
    householdName: "Lee Family",
    householdRole: "parent_guardian",
    participant: false,
    monthlyAmount: 0,
    startDate: "2025-12-15",
    agreementEndDate: "2026-12-15",
    agreementType: "Contract",
    downPayment: 280,
    email: "janet.lee@example.com",
    cellPhone: "555-0101",
    address: "101 Maple Ave",
    city: "Warrenton",
    state: "VA",
    zip: "20186",
    emailConsent: "Yes",
    textConsent: "Yes",
    phoneConsent: "Yes",
    squareCustomerId: "CUST_LEE_PARENT"
  },
  {
    id: "demo-lee-mina",
    name: "Mina Lee",
    householdName: "Lee Family",
    householdRole: "child",
    participant: true,
    responsiblePartyId: "demo-lee-parent",
    parentName: "Janet Lee",
    monthlyAmount: 140,
    startDate: "2025-12-15",
    agreementEndDate: "2026-12-15",
    agreementType: "Contract",
    dob: "2014-04-10",
    email: "janet.lee@example.com",
    cellPhone: "555-0101",
    programs: ["tae_kwon_do"],
    certifications: { tae_kwon_do: "Green Belt" }
  },
  {
    id: "demo-lee-daniel",
    name: "Daniel Lee",
    householdName: "Lee Family",
    householdRole: "child",
    participant: true,
    responsiblePartyId: "demo-lee-parent",
    parentName: "Janet Lee",
    monthlyAmount: 140,
    startDate: "2025-12-15",
    agreementEndDate: "2026-12-15",
    agreementType: "Contract",
    dob: "2016-09-19",
    email: "janet.lee@example.com",
    cellPhone: "555-0101",
    programs: ["tae_kwon_do"],
    certifications: { tae_kwon_do: "Yellow Belt" }
  },
  {
    id: "demo-park-sam",
    name: "Sam Park",
    householdName: "Park",
    householdRole: "adult",
    participant: true,
    monthlyAmount: 120,
    startDate: "2026-01-05",
    agreementEndDate: "2027-01-05",
    agreementType: "Contract",
    downPayment: 240,
    email: "sam.park@example.com",
    cellPhone: "555-0102",
    address: "22 Oak Street",
    city: "Warrenton",
    state: "VA",
    zip: "20186",
    dob: "1998-02-12",
    programs: ["tae_kwon_do", "muay_thai"],
    certifications: { tae_kwon_do: "Blue Belt", muay_thai: "Beginner" },
    squareCustomerId: "CUST_SAM_PARK"
  },
  {
    id: "demo-kim-sarah",
    name: "Sarah Kim",
    householdName: "Kim",
    householdRole: "adult",
    participant: true,
    monthlyAmount: 120,
    startDate: "2025-11-15",
    agreementEndDate: "2026-11-15",
    agreementType: "Contract",
    email: "sarah.kim@example.com",
    cellPhone: "555-0103",
    address: "88 Pine Lane",
    city: "Warrenton",
    state: "VA",
    zip: "20186",
    programs: ["tae_kwon_do"],
    certifications: { tae_kwon_do: "Red Belt" },
    squareCustomerId: "CUST_SARAH_KIM"
  },
  {
    id: "demo-chen-mia",
    name: "Mia Chen",
    householdName: "Chen",
    householdRole: "adult",
    participant: true,
    monthlyAmount: 150,
    startDate: "2026-07-01",
    agreementEndDate: defaultAgreementEndDate("2026-07-01"),
    agreementType: "Contract",
    email: "mia.chen@example.com",
    cellPhone: "555-0104",
    address: "7 Cedar Court",
    city: "Warrenton",
    state: "VA",
    zip: "20186",
    programs: ["muay_thai"],
    certifications: { muay_thai: "Intermediate" },
    squareCustomerId: "CUST_MIA_CHEN"
  },
  {
    id: "demo-garcia-alex",
    name: "Alex Garcia",
    householdName: "Garcia",
    householdRole: "adult",
    participant: true,
    monthlyAmount: 110,
    startDate: "2026-06-20",
    agreementEndDate: "2027-06-20",
    agreementType: "Month-to-Month",
    email: "alex.garcia@example.com",
    cellPhone: "555-0105",
    programs: ["tae_kwon_do"]
  }
];

for (const member of members) {
  store = upsertMember(store, member);
}

for (const payerId of ["demo-lee-parent", "demo-park-sam"]) {
  store = recordContractDownPayment(store, payerId).store;
}

const payments = [
  ["demo-lee-parent", "2026-01", 280, "2026-01-15", "manual"],
  ["demo-lee-parent", "2026-02", 280, "2026-02-15", "manual"],
  ["demo-lee-parent", "2026-03", 280, "2026-03-15", "manual"],
  ["demo-park-sam", "2026-02", 120, "2026-02-05", "manual"],
  ["demo-park-sam", "2026-03", 120, "2026-03-05", "manual"],
  ["demo-park-sam", "2026-04", 120, "2026-04-05", "manual"],
  ["demo-kim-sarah", "2025-12", 120, "2025-12-15", "manual"],
  ["demo-kim-sarah", "2026-01", 120, "2026-01-15", "manual"],
  ["demo-kim-sarah", "2026-02", 120, "2026-02-15", "manual"],
  ["demo-chen-mia", "2026-07", 150, "2026-07-01", "manual"],
  ["demo-garcia-alex", "2026-06", 110, "2026-06-20", "manual"]
];
for (const [memberId, month, amount, paidAt, source] of payments) {
  store = addPayment(store, { memberId, month, amount, paidAt, source });
}

localStorage.setItem(STORE_KEY, JSON.stringify({
  ...store,
  updatedAt: new Date().toISOString()
}));

const status = document.querySelector("#status");
status.textContent = `Loaded ${store.members.length} demo people and ${store.payments.length} demo ledger entries. ${previous ? `Your previous store was backed up as ${backupKey}.` : "No previous local store was found."}`;

document.querySelector("#restoreButton").addEventListener("click", () => {
  const key = localStorage.getItem(BACKUP_POINTER_KEY);
  const saved = key ? localStorage.getItem(key) : "";
  if (!saved) {
    status.textContent = "No previous demo backup was found in this browser.";
    return;
  }
  localStorage.setItem(STORE_KEY, saved);
  status.textContent = `Restored previous local store from ${key}. Open the app again to view it.`;
});
