import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createPaymentProviderService, squarePaymentIsCompleted } = require("../electron/payment-providers.cjs");

test("Square provider accepts completed payments and rejects unfinished states", () => {
  assert.equal(squarePaymentIsCompleted({ squareStatus: "COMPLETED" }), true);
  assert.equal(squarePaymentIsCompleted({ providerStatus: "completed" }), true);
  assert.equal(squarePaymentIsCompleted({ squareStatus: "APPROVED" }), false);
  assert.equal(squarePaymentIsCompleted({ payment: { status: "FAILED" } }), false);
});

test("legacy relay records without a provider status remain importable", () => {
  assert.equal(squarePaymentIsCompleted({ paymentId: "legacy-1", localStatus: "pending" }), true);
});

test("installed-app provider settings persist without exposing the relay token", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "wmac-provider-test-"));
  const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const service = createPaymentProviderService({ userDataPath, appRoot });

  await service.saveSquareRelay({ baseUrl: "https://relay.example.com/", token: "limited-sync-token" });
  const settings = await service.getPublicSettings();
  assert.equal(settings.squareRelayBaseUrl, "https://relay.example.com");
  assert.equal(settings.squareRelayConfigured, true);
  assert.equal("squareRelaySyncToken" in settings, false);

  const staged = await service.list("square");
  assert.equal(staged.configured, true);
  assert.deepEqual(staged.payments, []);
});
