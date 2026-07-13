const COLOR_BELTS = ["White", "Yellow", "Green", "Blue", "Red"];
const DAN_TIP_COLORS = ["White", "Yellow", "Green", "Blue", "Red"];
const MAX_DAN = 8;

export const MUAY_THAI_LEVELS = ["Muay Thai Level 1", "Muay Thai Level 2", "Muay Thai Level 3"];

function ordinal(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }
  return `${value}${{ 1: "st", 2: "nd", 3: "rd" }[value % 10] || "th"}`;
}

function coloredBeltLevels() {
  return COLOR_BELTS.flatMap((color) => [
    `${color} Belt`,
    `${color} Belt · 1 Tip`,
    `${color} Belt · 2 Tips`,
    `${color} Belt · 3 Tips`
  ]);
}

function danLabel(dan) {
  const special = dan >= 4 ? " · Special Degree" : "";
  return `Black Belt · ${ordinal(dan)} Dan · ${dan} ${dan === 1 ? "Stripe" : "Stripes"}${special}`;
}

function blackBeltLevels() {
  const levels = [];
  for (let dan = 1; dan <= MAX_DAN; dan += 1) {
    const base = danLabel(dan);
    levels.push(base);
    if (dan < MAX_DAN) {
      DAN_TIP_COLORS.forEach((color) => levels.push(`${base} · ${color} Tip`));
    }
  }
  return levels;
}

export const CERTIFICATION_LEVELS = [...coloredBeltLevels(), ...blackBeltLevels()];

export function nextCertificationLevel(currentLevel) {
  const normalized = normalize(currentLevel);
  const index = CERTIFICATION_LEVELS.findIndex((level) => normalize(level) === normalized);
  return index >= 0 && index < CERTIFICATION_LEVELS.length - 1
    ? CERTIFICATION_LEVELS[index + 1]
    : "";
}

export function certificationProgress(currentLevel) {
  const normalized = normalize(currentLevel);
  const index = CERTIFICATION_LEVELS.findIndex((level) => normalize(level) === normalized);
  return index < 0 ? 0 : Math.round(((index + 1) / CERTIFICATION_LEVELS.length) * 100);
}

export function isCertificationLevel(level) {
  const normalized = normalize(level);
  return CERTIFICATION_LEVELS.some((candidate) => normalize(candidate) === normalized);
}

export function normalizeMemberCertifications(member = {}) {
  const saved = member.certifications || {};
  const legacy = String(member.beltLevel || "").trim();
  const taeKwonDo = String(saved.tae_kwon_do || (isCertificationLevel(legacy) ? legacy : "")).trim();
  const muayThai = String(saved.muay_thai || (MUAY_THAI_LEVELS.some((level) => normalize(level) === normalize(legacy)) ? legacy : "")).trim();
  const legacyLabel = String(saved.legacyLabel || (!taeKwonDo && !muayThai ? legacy : "")).trim();

  return {
    tae_kwon_do: taeKwonDo,
    muay_thai: muayThai,
    legacyLabel
  };
}

export function primaryCertificationLabel(member = {}) {
  const certifications = normalizeMemberCertifications(member);
  return certifications.tae_kwon_do || certifications.muay_thai || certifications.legacyLabel || "";
}

export function nextMemberCertification(member = {}) {
  const certifications = normalizeMemberCertifications(member);
  if (certifications.tae_kwon_do) {
    return nextCertificationLevel(certifications.tae_kwon_do);
  }
  const index = MUAY_THAI_LEVELS.findIndex((level) => normalize(level) === normalize(certifications.muay_thai));
  return index >= 0 && index < MUAY_THAI_LEVELS.length - 1 ? MUAY_THAI_LEVELS[index + 1] : "";
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
