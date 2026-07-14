export function buildRenewalEmail(member, renewal) {
  const expiration = formatAgreementDate(renewal.expirationDate);
  const recipient = member.parentName || member.name;
  const timing = renewal.level === "expired"
    ? `expired on ${expiration}`
    : `will expire on ${expiration}`;

  return {
    subject: `World Martial Arts Center Membership Renewal - ${member.name}`,
    body: [
      `Hello ${recipient},`,
      "",
      `${member.name}'s current membership agreement ${timing}. Would you like to sign up for another one-year agreement?`,
      "",
      "Please review the agreement attached to this email. Complete and sign it, then bring the signed agreement with you to your next class.",
      "",
      "If you have any questions or would prefer a paper copy, please call Master Lee at (540) 347-7266.",
      "",
      "Thank you!",
      "",
      "World Martial Arts Center"
    ].join("\r\n")
  };
}

export function formatAgreementDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) {
    return value || "";
  }
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}
