import {
  addPayment,
  createEmptyStore,
  defaultAgreementEndDate,
  recordContractDownPayment,
  upsertMember
} from "./data.js";

const STORE_KEY = "master-lee-payment-tracker";
const BACKUP_POINTER_KEY = "master-lee-payment-tracker-demo-previous-key";

// The demo people, payments, and down payments live here so both the standalone
// seeder page and the main app's "Load sample data" action build identical data.
export function buildDemoStore() {
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

  // Record the Lee family down payment so you can see the "Already recorded"
  // state (and its lump-sum entry in the 2025 tax revenue). Sam Park's contract
  // intentionally keeps its down-payment amount UNrecorded so you can click
  // through the explicit "Record down payment" workflow yourself.
  store = recordContractDownPayment(store, "demo-lee-parent").store;

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

  return { ...store, updatedAt: new Date().toISOString() };
}

// Writes demo data into the given Storage, backing up any existing store first.
// Returns a summary the caller can surface to the user.
export function seedDemoData(storage = localStorage) {
  const previous = storage.getItem(STORE_KEY);
  let backupKey = "";
  if (previous) {
    backupKey = `master-lee-payment-tracker-before-demo-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    storage.setItem(backupKey, previous);
    storage.setItem(BACKUP_POINTER_KEY, backupKey);
  }
  const store = buildDemoStore();
  storage.setItem(STORE_KEY, JSON.stringify(store));
  return {
    memberCount: store.members.length,
    paymentCount: store.payments.length,
    hadPrevious: Boolean(previous),
    backupKey
  };
}

export function restorePreDemoStore(storage = localStorage) {
  const key = storage.getItem(BACKUP_POINTER_KEY);
  const saved = key ? storage.getItem(key) : "";
  if (!saved) {
    return { restored: false, backupKey: "" };
  }
  storage.setItem(STORE_KEY, saved);
  return { restored: true, backupKey: key };
}

// When loaded directly by demo-seed.html (has #status), run immediately.
if (typeof document !== "undefined" && document.querySelector("#status")) {
  const status = document.querySelector("#status");
  const summary = seedDemoData(localStorage);
  status.textContent = `Loaded ${summary.memberCount} demo people and ${summary.paymentCount} demo ledger entries. ${summary.hadPrevious ? `Your previous store was backed up as ${summary.backupKey}.` : "No previous local store was found."}`;
  document.querySelector("#restoreButton")?.addEventListener("click", () => {
    const result = restorePreDemoStore(localStorage);
    status.textContent = result.restored
      ? `Restored previous local store from ${result.backupKey}. Open the app again to view it.`
      : "No previous demo backup was found in this browser.";
  });
}
