import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_CREDIT_SERVICES_HEADERS,
  FIRST_CREDIT_OPTIONAL_COLUMNS,
  buildCollectionPlacement,
  collectionPlacementFilename,
  createCollectionDraft,
  createFirstCreditServicesWorkbook,
  getCollectionMissingFields
} from "../src/collections.js";

const member = {
  id: "mem-sam-park",
  externalId: "WMAC-1007",
  name: "Sam Park",
  startDate: "2026-01-01",
  monthlyAmount: 120,
  phone: "5550103000",
  email: "sam@example.com",
  participant: true,
  inactive: false
};

const payments = [
  { id: "p1", memberId: member.id, month: "2026-01", amount: 120, paidAt: "2026-01-01", category: "tuition" },
  { id: "p2", memberId: member.id, month: "2026-02", amount: 120, paidAt: "2026-02-03", category: "tuition" }
];

function completeDraft(overrides = {}) {
  return {
    ...createCollectionDraft(member, payments, new Date("2026-04-15T12:00:00Z")),
    firstName: "Sam",
    lastName: "Park",
    address: "123 Main Street",
    city: "Anytown",
    state: "NJ",
    zip: "07001",
    dob: "1990-05-20",
    homePhone: "555-010-1000",
    workPhone: "555-010-2000",
    cellPhone: "555-010-3000",
    agreementSignDate: "2026-01-01",
    agreementType: "Contract",
    agreementExpirationDate: "2026-06-30",
    chargeOffDate: "2026-04-15",
    serviceFees: 10,
    emailConsent: "Yes",
    textConsent: "No",
    ...overrides
  };
}

test("maps the exact First Credit Services layout and required header colors", () => {
  assert.equal(FIRST_CREDIT_SERVICES_HEADERS.length, 33);
  assert.equal(FIRST_CREDIT_SERVICES_HEADERS[17], "Charge-off Date");
  assert.equal(FIRST_CREDIT_SERVICES_HEADERS[29], "Total Balance at Charge-off");
  assert.deepEqual([...FIRST_CREDIT_OPTIONAL_COLUMNS], [8, 10, 18, 19, 20, 21, 30]);
});

test("reports member information that is not already stored", () => {
  const draft = createCollectionDraft(member, payments, new Date("2026-04-15T12:00:00Z"));
  const missing = getCollectionMissingFields(draft, member, payments);
  assert.ok(missing.includes("Street address"));
  assert.ok(missing.includes("Date of birth"));
  assert.ok(missing.includes("Home phone"));
  assert.ok(missing.includes("Work phone"));
  assert.ok(!missing.includes("Cell phone"), "the existing member phone pre-fills the cell-phone field");
});

test("prefills placement data from the permanent member record", () => {
  const draft = createCollectionDraft({
    ...member,
    address: "608 Blackwell Rd",
    city: "Warrenton",
    state: "VA",
    zip: "20186",
    dob: "1990-05-20",
    homePhone: "5405550101",
    workPhone: "5405550102",
    cellPhone: "5405550103",
    agreementType: "Contract",
    agreementEndDate: "2027-01-01",
    emailConsent: "No",
    textConsent: "No"
  }, payments, new Date("2026-04-15T12:00:00Z"));
  assert.equal(draft.address, "608 Blackwell Rd");
  assert.equal(draft.cellPhone, "5405550103");
  assert.equal(draft.agreementType, "Contract");
  assert.equal(draft.agreementExpirationDate, "2027-01-01");
});

test("freezes a charge-off snapshot using only amounts due by the charge-off date", () => {
  const placement = buildCollectionPlacement(member, payments, completeDraft(), new Date("2026-04-15T13:00:00Z"));
  assert.equal(placement.pastDueAmount, 240, "March and April tuition are due");
  assert.equal(placement.lateFees, 12, "both overdue months carry the existing $6 late fee rule");
  assert.equal(placement.serviceFees, 10);
  assert.equal(placement.frozenBalance, 262);
  assert.deepEqual(placement.delinquentMonths, ["2026-03", "2026-04"]);
  assert.equal(placement.row[19], 4, "four payments were billed through the charge-off date");
  assert.equal(placement.row[20], 2, "two payments were received");
  assert.equal(placement.row[21], 2, "May and June remain on the fixed contract");
  assert.equal(placement.row[26], 240, "remaining contract value is two monthly payments");
  assert.equal(placement.row[29], 262);
});

test("freezes the member's contract-specific late-fee minimum", () => {
  const tenDollarMember = { ...member, lateFeeMinimum: 10 };
  const placement = buildCollectionPlacement(
    tenDollarMember,
    payments,
    completeDraft(),
    new Date("2026-04-15T13:00:00Z")
  );
  assert.equal(placement.lateFeeMinimum, 10);
  assert.equal(placement.lateFeePercentage, 5);
  assert.equal(placement.lateFees, 20);
  assert.equal(placement.frozenBalance, 270);
});

test("freezes the member's contract-specific late-fee percentage", () => {
  const percentageMember = { ...member, lateFeeMinimum: 5, lateFeePercentage: 12 };
  const placement = buildCollectionPlacement(
    percentageMember,
    payments,
    completeDraft(),
    new Date("2026-04-15T13:00:00Z")
  );
  assert.equal(placement.lateFeePercentage, 12);
  assert.equal(placement.lateFees, 28.8);
  assert.equal(placement.frozenBalance, 278.8);
});

test("month-to-month placements use N/A for expiration and no remaining contract value", () => {
  const placement = buildCollectionPlacement(member, payments, completeDraft({
    agreementType: "Month-to-Month",
    agreementExpirationDate: ""
  }));
  assert.equal(placement.row[15], "N/A");
  assert.equal(placement.row[21], "");
  assert.equal(placement.row[26], 0);
});

test("creates a fresh Excel workbook and a member-specific filename", () => {
  const placement = buildCollectionPlacement(member, payments, completeDraft());
  const workbook = createFirstCreditServicesWorkbook(placement);
  assert.deepEqual(Array.from(workbook.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  const embeddedXml = new TextDecoder().decode(workbook);
  assert.match(embeddedXml, /First Credit Services Manual Placement/);
  assert.match(embeddedXml, /Total Balance at Charge-off/);
  assert.match(embeddedXml, /sam@example.com/);
  assert.equal(collectionPlacementFilename(placement), "first-credit-services-placement-sam-park-2026-04-15.xlsx");
});
