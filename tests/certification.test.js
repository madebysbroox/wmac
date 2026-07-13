import test from "node:test";
import assert from "node:assert/strict";

import {
  CERTIFICATION_LEVELS,
  certificationProgress,
  isCertificationLevel,
  nextCertificationLevel,
  normalizeMemberCertifications,
  primaryCertificationLabel
} from "../src/certification.js";

test("colored belts follow the WMAC order and award three tips", () => {
  assert.equal(nextCertificationLevel("White Belt"), "White Belt · 1 Tip");
  assert.equal(nextCertificationLevel("White Belt · 3 Tips"), "Yellow Belt");
  assert.equal(nextCertificationLevel("Yellow Belt · 3 Tips"), "Green Belt");
  assert.equal(nextCertificationLevel("Green Belt · 3 Tips"), "Blue Belt");
  assert.equal(nextCertificationLevel("Blue Belt · 3 Tips"), "Red Belt");
  assert.equal(nextCertificationLevel("Red Belt · 3 Tips"), "Black Belt · 1st Dan · 1 Stripe");
});

test("black belts cycle through colors before receiving the next Dan stripe", () => {
  assert.equal(nextCertificationLevel("Black Belt · 1st Dan · 1 Stripe"), "Black Belt · 1st Dan · 1 Stripe · White Tip");
  assert.equal(nextCertificationLevel("Black Belt · 1st Dan · 1 Stripe · Red Tip"), "Black Belt · 2nd Dan · 2 Stripes");
  assert.equal(nextCertificationLevel("Black Belt · 3rd Dan · 3 Stripes · Red Tip"), "Black Belt · 4th Dan · 4 Stripes · Special Degree");
});

test("fourth through eighth Dan remain visible special degrees", () => {
  for (let dan = 4; dan <= 8; dan += 1) {
    assert.ok(CERTIFICATION_LEVELS.some((level) => level.includes(`${dan}th Dan`) && level.includes("Special Degree")));
  }
  assert.equal(CERTIFICATION_LEVELS.at(-1), "Black Belt · 8th Dan · 8 Stripes · Special Degree");
});

test("legacy certification migrates per member and preserves unknown labels", () => {
  const known = normalizeMemberCertifications({ beltLevel: "Yellow Belt · 2 Tips" });
  const muayThai = normalizeMemberCertifications({ beltLevel: "Muay Thai Level 2" });
  const unknown = normalizeMemberCertifications({ beltLevel: "Legacy Junior Rank" });

  assert.equal(known.tae_kwon_do, "Yellow Belt · 2 Tips");
  assert.equal(muayThai.muay_thai, "Muay Thai Level 2");
  assert.equal(unknown.legacyLabel, "Legacy Junior Rank");
  assert.equal(primaryCertificationLabel({ certifications: known }), "Yellow Belt · 2 Tips");
  assert.equal(isCertificationLevel("Orange Belt"), false);
  assert.ok(certificationProgress("Black Belt · 4th Dan · 4 Stripes · Special Degree") > certificationProgress("Red Belt"));
});
