import test from "node:test";
import assert from "node:assert/strict";

import { buildRenewalEmail } from "../src/renewals.js";

test("builds a renewal email that asks for another year and explains the attached contract", () => {
  const email = buildRenewalEmail(
    { name: "Jamie Lee", parentName: "Morgan Lee" },
    { level: "expiring", expirationDate: "2026-08-01" }
  );

  assert.equal(email.subject, "World Martial Arts Center Membership Renewal - Jamie Lee");
  assert.match(email.body, /Hello Morgan Lee/);
  assert.match(email.body, /will expire on August 1, 2026/);
  assert.match(email.body, /another one-year agreement/);
  assert.match(email.body, /agreement attached to this email/);
  assert.match(email.body, /bring the signed agreement with you to your next class/);
});

test("describes a contract that has already expired", () => {
  const email = buildRenewalEmail(
    { name: "Jamie Lee" },
    { level: "expired", expirationDate: "2026-08-01" }
  );

  assert.match(email.body, /Hello Jamie Lee/);
  assert.match(email.body, /expired on August 1, 2026/);
});

test("renewal email directs members to the front office, not Master Lee", () => {
  const email = buildRenewalEmail(
    { name: "Taylor Kim", parentName: "Jordan Kim" },
    { level: "expiring", expirationDate: "2026-09-15" }
  );

  assert.match(email.body, /call the front office at \(540\) 347-7266/);
  assert.ok(!email.body.includes("Master Lee"), "renewal email must not mention Master Lee in customer-facing copy");
});
