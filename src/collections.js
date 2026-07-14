import { defaultAgreementEndDate, getMemberPaymentState, getLateFeeBalance } from "./data.js";

export const FIRST_CREDIT_SERVICES_EMAIL = "placements@fcsbpo.com";
export const FIRST_CREDIT_SERVICES_HEADERS = [
  "Club Number or Location Name",
  "Member #\n\nYour member's unique account number with your business",
  "Member Last Name",
  "Member First Name",
  "Address",
  "City",
  "State",
  "Zip Code",
  "SSN",
  "Member DOB",
  "Gender",
  "Home Phone Number",
  "Work Phone Number",
  "Cell Phone",
  "Agreement Sign Date",
  "Agreement Expiration Date",
  "Agreement Type\n\nContract or Month-to-Month",
  "Charge-off Date",
  "Down Payment",
  "# of Payments Billed",
  "# of Payments Received",
  "# of Payments Remaining",
  "Past Due Amount",
  "Monthly Payment",
  "Last Payment Date",
  "Last Payment Amount",
  "Remaining Contract Value",
  "Total of Late Fees",
  "Total of Service Fees",
  "Total Balance at Charge-off",
  "Email Address",
  "Do you have contractual consent to communicate with this member via email?",
  "Do you have contractual consent to communicate with this member via text message?"
];

export const FIRST_CREDIT_OPTIONAL_COLUMNS = new Set([8, 10, 18, 19, 20, 21, 30]);

const REQUIRED_LABELS = {
  firstName: "Member first name",
  lastName: "Member last name",
  address: "Street address",
  city: "City",
  state: "State",
  zip: "ZIP code",
  dob: "Date of birth",
  homePhone: "Home phone",
  workPhone: "Work phone",
  cellPhone: "Cell phone",
  agreementSignDate: "Agreement sign date",
  agreementExpirationDate: "Agreement expiration date",
  agreementType: "Agreement type",
  chargeOffDate: "Charge-off date",
  emailConsent: "Email consent",
  textConsent: "Text-message consent"
};

export function createCollectionDraft(member, payments = [], today = new Date()) {
  const saved = member?.collectionInfo || {};
  const names = splitMemberName(member?.name);
  const chargeOffDate = isoDate(today);
  const lastPayment = latestTuitionPayment(member, payments, chargeOffDate);
  return {
    clubName: "World Martial Arts Center",
    memberNumber: member?.externalId || member?.id || "",
    firstName: saved.firstName || names.firstName,
    lastName: saved.lastName || names.lastName,
    address: member?.address || saved.address || "",
    city: member?.city || saved.city || "",
    state: member?.state || saved.state || "",
    zip: member?.zip || saved.zip || "",
    ssn: saved.ssn || "",
    dob: member?.dob || saved.dob || "",
    gender: saved.gender || "",
    homePhone: member?.homePhone || saved.homePhone || "",
    workPhone: member?.workPhone || saved.workPhone || "",
    cellPhone: member?.cellPhone || member?.phone || saved.cellPhone || "",
    agreementSignDate: member?.startDate || saved.agreementSignDate || "",
    agreementExpirationDate: member?.agreementEndDate || saved.agreementExpirationDate || defaultAgreementEndDate(member?.startDate),
    agreementType: member?.agreementType || saved.agreementType || "Contract",
    chargeOffDate,
    downPayment: member?.downPayment ?? saved.downPayment ?? "",
    emailConsent: member?.emailConsent || saved.emailConsent || "No",
    textConsent: member?.textConsent || saved.textConsent || "No",
    serviceFees: saved.serviceFees ?? 0,
    email: member?.email || "",
    monthlyPayment: Number(member?.monthlyAmount || 0),
    lastPaymentDate: lastPayment?.paidAt || "N/A",
    lastPaymentAmount: Number(lastPayment?.amount || 0)
  };
}

export function getCollectionMissingFields(draft, member, payments = []) {
  const missing = [];
  Object.entries(REQUIRED_LABELS).forEach(([field, label]) => {
    if (field === "agreementExpirationDate" && draft.agreementType === "Month-to-Month") {
      return;
    }
    if (!String(draft[field] ?? "").trim()) {
      missing.push(label);
    }
  });
  if (!member?.id && !String(draft.memberNumber || "").trim()) {
    missing.push("Member number");
  }
  if (Number(member?.monthlyAmount || draft.monthlyPayment || 0) <= 0) {
    missing.push("Monthly payment amount");
  }
  if (draft.chargeOffDate) {
    const balance = chargeOffBalance(member, payments, draft.chargeOffDate, draft.serviceFees);
    if (balance.totalBalance <= 0) {
      missing.push("A delinquent balance due on the charge-off date");
    }
  }
  return missing;
}

export function buildCollectionPlacement(member, payments, draft, generatedAt = new Date()) {
  const missing = getCollectionMissingFields(draft, member, payments);
  if (missing.length) {
    throw new Error(`Missing required placement information: ${missing.join(", ")}`);
  }

  const balance = chargeOffBalance(member, payments, draft.chargeOffDate, draft.serviceFees);
  const paymentState = getMemberPaymentState(member, payments, dateAtNoon(draft.chargeOffDate));
  const billedMonths = paymentState.months.filter((month) => month.daysLate >= 0);
  const paymentsReceived = tuitionPayments(member, payments)
    .filter((payment) => !payment.paidAt || payment.paidAt <= draft.chargeOffDate);
  const remainingPayments = contractPaymentsRemaining(draft);
  const lastPayment = latestTuitionPayment(member, payments, draft.chargeOffDate);
  const info = collectionInfoFromDraft(draft);
  const row = [
    draft.clubName || "World Martial Arts Center",
    draft.memberNumber || member.externalId || member.id,
    draft.lastName,
    draft.firstName,
    draft.address,
    draft.city,
    draft.state,
    draft.zip,
    draft.ssn || "",
    draft.dob,
    draft.gender || "",
    draft.homePhone,
    draft.workPhone,
    draft.cellPhone,
    draft.agreementSignDate,
    draft.agreementType === "Month-to-Month" ? "N/A" : draft.agreementExpirationDate,
    draft.agreementType,
    draft.chargeOffDate,
    optionalNumber(draft.downPayment),
    billedMonths.length,
    paymentsReceived.length,
    draft.agreementType === "Contract" ? remainingPayments : "",
    balance.pastDueAmount,
    Number(member.monthlyAmount || draft.monthlyPayment),
    lastPayment?.paidAt || "N/A",
    Number(lastPayment?.amount || 0),
    draft.agreementType === "Contract" ? remainingPayments * Number(member.monthlyAmount || 0) : 0,
    balance.lateFees,
    balance.serviceFees,
    balance.totalBalance,
    member.email || draft.email || "",
    draft.emailConsent,
    draft.textConsent
  ];

  return {
    agency: "First Credit Services",
    status: "charged_off",
    chargeOffDate: draft.chargeOffDate,
    generatedAt: generatedAt.toISOString(),
    frozenBalance: balance.totalBalance,
    lateFeeMinimum: balance.lateFeeMinimum,
    lateFeePercentage: balance.lateFeePercentage,
    pastDueAmount: balance.pastDueAmount,
    lateFees: balance.lateFees,
    serviceFees: balance.serviceFees,
    delinquentMonths: balance.lines.map((line) => line.month),
    info,
    row
  };
}

export function collectionInfoFromDraft(draft) {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    address: draft.address,
    city: draft.city,
    state: draft.state,
    zip: draft.zip,
    ssn: draft.ssn || "",
    dob: draft.dob,
    gender: draft.gender || "",
    homePhone: draft.homePhone,
    workPhone: draft.workPhone,
    cellPhone: draft.cellPhone,
    agreementSignDate: draft.agreementSignDate,
    agreementExpirationDate: draft.agreementExpirationDate || "",
    agreementType: draft.agreementType,
    downPayment: draft.downPayment ?? "",
    emailConsent: draft.emailConsent,
    textConsent: draft.textConsent,
    serviceFees: Number(draft.serviceFees || 0)
  };
}

export function createFirstCreditServicesWorkbook(placement) {
  if (!placement?.row || placement.row.length !== FIRST_CREDIT_SERVICES_HEADERS.length) {
    throw new Error("The placement record does not match the First Credit Services layout.");
  }
  const created = placement.generatedAt || new Date().toISOString();
  const files = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": rootRelationshipsXml(),
    "docProps/app.xml": appPropertiesXml(),
    "docProps/core.xml": corePropertiesXml(created),
    "xl/workbook.xml": workbookXml(),
    "xl/_rels/workbook.xml.rels": workbookRelationshipsXml(),
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(placement.row)
  };
  return createZip(files);
}

export function collectionPlacementFilename(placement) {
  const row = placement?.row || [];
  const member = `${row[3] || "member"}-${row[2] || ""}`.trim();
  const safe = member.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "member";
  return `first-credit-services-placement-${safe}-${placement?.chargeOffDate || isoDate(new Date())}.xlsx`;
}

export function firstCreditServicesEmailDraft(placement, filename) {
  const name = [placement?.row?.[3], placement?.row?.[2]].filter(Boolean).join(" ");
  return {
    to: FIRST_CREDIT_SERVICES_EMAIL,
    subject: `New manual placement - ${name}`,
    body: `Hello,\n\nPlease find attached the fresh First Credit Services manual placement spreadsheet for ${name}.\n\nCharge-off date: ${placement.chargeOffDate}\nTotal balance at charge-off: ${money(placement.frozenBalance)}\nFile to attach: ${filename}\n\nThank you,\nWorld Martial Arts Center`
  };
}

function chargeOffBalance(member, payments, chargeOffDate, serviceFees = 0) {
  const balance = getLateFeeBalance(member, payments, dateAtNoon(chargeOffDate));
  const lines = balance.lines.filter((line) => line.daysLate >= 0);
  const pastDueAmount = roundMoney(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0));
  const lateFees = roundMoney(lines.reduce((sum, line) => sum + Number(line.lateFee || 0), 0));
  const normalizedServiceFees = roundMoney(Number(serviceFees || 0));
  return {
    lines,
    lateFeeMinimum: balance.lateFeeMinimum,
    lateFeePercentage: balance.lateFeePercentage,
    pastDueAmount,
    lateFees,
    serviceFees: normalizedServiceFees,
    totalBalance: roundMoney(pastDueAmount + lateFees + normalizedServiceFees)
  };
}

function tuitionPayments(member, payments) {
  return (payments || []).filter((payment) =>
    payment.memberId === member?.id && (!payment.category || payment.category === "tuition")
  );
}

function latestTuitionPayment(member, payments, chargeOffDate) {
  return tuitionPayments(member, payments)
    .filter((payment) => !chargeOffDate || !payment.paidAt || payment.paidAt <= chargeOffDate)
    .sort((a, b) => String(b.paidAt || b.month || "").localeCompare(String(a.paidAt || a.month || "")))[0];
}

function contractPaymentsRemaining(draft) {
  if (draft.agreementType !== "Contract" || !draft.agreementExpirationDate || !draft.chargeOffDate) {
    return 0;
  }
  const start = dateAtNoon(draft.chargeOffDate);
  const end = dateAtNoon(draft.agreementExpirationDate);
  const dueDay = Number(String(draft.agreementSignDate || "").slice(8, 10)) || 1;
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  let count = 0;
  while (year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month <= end.getUTCMonth())) {
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(year, month, Math.min(dueDay, lastDay), 12));
    if (due > start && due <= end) {
      count += 1;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return count;
}

function splitMemberName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || "", lastName: "" };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
}

function optionalNumber(value) {
  return String(value ?? "").trim() === "" ? "" : Number(value);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function dateAtNoon(value) {
  return new Date(`${value}T12:00:00Z`);
}

function worksheetXml(row) {
  const widths = [24, 19, 18, 18, 28, 18, 10, 12, 14, 14, 12, 18, 18, 18, 17, 20, 22, 16, 14, 15, 16, 17, 17, 16, 17, 17, 21, 17, 18, 22, 24, 28, 28];
  const dateColumns = new Set([9, 14, 15, 17, 24]);
  const moneyColumns = new Set([18, 22, 23, 25, 26, 27, 28, 29]);
  const integerColumns = new Set([19, 20, 21]);
  const headers = FIRST_CREDIT_SERVICES_HEADERS.map((value, index) => cellXml(index, 1, value, FIRST_CREDIT_OPTIONAL_COLUMNS.has(index) ? 2 : 1)).join("");
  const values = row.map((value, index) => {
    const style = dateColumns.has(index) && isIsoDate(value) ? 4 : moneyColumns.has(index) ? 5 : integerColumns.has(index) && value !== "" ? 6 : 3;
    return cellXml(index, 2, value, style, dateColumns.has(index));
  }).join("");
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${cols}</cols>
  <sheetData>
    <row r="1" ht="72" customHeight="1">${headers}</row>
    <row r="2" ht="22" customHeight="1">${values}</row>
  </sheetData>
  <autoFilter ref="A1:AG2"/>
</worksheet>`;
}

function cellXml(columnIndex, rowIndex, value, style, preferDate = false) {
  const ref = `${columnName(columnIndex)}${rowIndex}`;
  if (preferDate && isIsoDate(value)) {
    return `<c r="${ref}" s="${style}" t="n"><v>${excelDate(value)}</v></c>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value ?? "")}</t></is></c>`;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function excelDate(value) {
  return Math.floor((dateAtNoon(value).getTime() - Date.UTC(1899, 11, 30, 12)) / 86400000);
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function rootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/><numFmt numFmtId="165" formatCode="$#,##0.00"/></numFmts>
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function corePropertiesXml(created) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>World Martial Arts Center</dc:creator><cp:lastModifiedBy>World Martial Arts Center</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(created)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(created)}</dcterms:modified><dc:title>First Credit Services Manual Placement</dc:title></cp:coreProperties>`;
}

function appPropertiesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>WMAC Payment Tracker</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Sheet1</vt:lpstr></vt:vector></TitlesOfParts></Properties>`;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([name, content]) => ({ name, nameBytes: encoder.encode(name), data: encoder.encode(content) }));
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosTimestamp(new Date());
  entries.forEach((entry) => {
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + entry.nameBytes.length + entry.data.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0);
    write16(localView, 8, 0);
    write16(localView, 10, time);
    write16(localView, 12, date);
    write32(localView, 14, crc);
    write32(localView, 18, entry.data.length);
    write32(localView, 22, entry.data.length);
    write16(localView, 26, entry.nameBytes.length);
    write16(localView, 28, 0);
    local.set(entry.nameBytes, 30);
    local.set(entry.data, 30 + entry.nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + entry.nameBytes.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0);
    write16(centralView, 10, 0);
    write16(centralView, 12, time);
    write16(centralView, 14, date);
    write32(centralView, 16, crc);
    write32(centralView, 20, entry.data.length);
    write32(centralView, 24, entry.data.length);
    write16(centralView, 28, entry.nameBytes.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, offset);
    central.set(entry.nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  write16(endView, 20, 0);
  return concatBytes([...localParts, ...centralParts, end]);
}

function dosTimestamp(value) {
  const year = Math.max(1980, value.getFullYear());
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate()
  };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function write32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}
