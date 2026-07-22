import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncSquareRelayPayments } from "../server.mjs";

const require = createRequire(import.meta.url);
const { createPaymentProviderService, squarePaymentIsCompleted } = require("../electron/payment-providers.cjs");

test("Square provider accepts completed payments and rejects unfinished states", () => {
  assert.equal(squarePaymentIsCompleted({ squareStatus: "COMPLETED" }), true);
  assert.equal(squarePaymentIsCompleted({ providerStatus: "completed" }), true);
  assert.equal(squarePaymentIsCompleted({ status: "COMPLETED" }), true);
  assert.equal(squarePaymentIsCompleted({ status: "PENDING" }), false);
  assert.equal(squarePaymentIsCompleted({ status: "FAILED" }), false);
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

test("Square monthly invoices create an email-payment subscription without a stored card", async () => {
  const oldEnvironment = {
    SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
    SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID,
    SQUARE_MONTHLY_INVOICE_PLAN_VARIATION_ID: process.env.SQUARE_MONTHLY_INVOICE_PLAN_VARIATION_ID,
    SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
    SQUARE_API_VERSION: process.env.SQUARE_API_VERSION
  };
  Object.assign(process.env, {
    SQUARE_ACCESS_TOKEN: "test-square-token",
    SQUARE_LOCATION_ID: "location-1",
    SQUARE_MONTHLY_INVOICE_PLAN_VARIATION_ID: "monthly-plan-1",
    SQUARE_ENVIRONMENT: "sandbox",
    SQUARE_API_VERSION: "2026-07-15"
  });
  try {
    const userDataPath = await mkdtemp(join(tmpdir(), "wmac-square-invoice-test-"));
    const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    const requests = [];
    const service = createPaymentProviderService({
      userDataPath,
      appRoot,
      fetchImpl: async (url, options = {}) => {
        requests.push({ url, options });
        if (url.endsWith("/v2/customers")) return jsonFetchResponse(200, { customer: { id: "customer-1" } });
        if (url.endsWith("/v2/subscriptions")) {
          return jsonFetchResponse(200, {
            subscription: { id: "subscription-1", status: "PENDING", start_date: "2026-08-15", canceled_date: "2027-07-15" }
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    });

    const result = await service.createSquareMonthlyInvoice({
      memberId: "payer-1",
      name: "Jamie Park",
      email: "jamie@example.com",
      phone: "555-0100",
      amount: 240,
      startDate: "2026-08-15",
      cancelDate: "2027-07-15"
    });

    assert.equal(result.customerId, "customer-1");
    assert.equal(result.subscription.id, "subscription-1");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, "https://connect.squareupsandbox.com/v2/customers");
    assert.equal(requests[1].url, "https://connect.squareupsandbox.com/v2/subscriptions");
    assert.equal(requests[1].options.headers.Authorization, "Bearer test-square-token");
    assert.equal(requests[1].options.headers["Square-Version"], "2026-07-15");
    const subscriptionRequest = JSON.parse(requests[1].options.body);
    assert.equal(subscriptionRequest.customer_id, "customer-1");
    assert.equal(subscriptionRequest.location_id, "location-1");
    assert.equal(subscriptionRequest.plan_variation_id, "monthly-plan-1");
    assert.deepEqual(subscriptionRequest.price_override_money, { amount: 24000, currency: "USD" });
    assert.equal(subscriptionRequest.start_date, "2026-08-15");
    assert.equal(subscriptionRequest.monthly_billing_anchor_date, 15);
    assert.equal(subscriptionRequest.canceled_date, "2027-07-15");
    assert.equal("card_id" in subscriptionRequest, false);
  } finally {
    for (const [key, value] of Object.entries(oldEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("installed app imports completed relay payments and safely acknowledges every exact event version", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "wmac-provider-relay-test-"));
  const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const acknowledgementRequests = [];
  let pollCount = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://relay.example.com/payments") {
      pollCount += 1;
      return jsonFetchResponse(200, {
        payments: pollCount === 1
          ? [
              relayPayment("complete-1", "event-complete-1", "COMPLETED"),
              relayPayment("conflict-1", "event-conflict-old", "COMPLETED"),
              relayPayment("missing-event", "", "COMPLETED"),
              relayPayment("pending-1", "event-pending-1", "PENDING"),
              relayPayment("failed-1", "event-failed-1", "FAILED")
            ]
          : [relayPayment("conflict-1", "event-conflict-new", "COMPLETED")]
      });
    }

    acknowledgementRequests.push({ url, options });
    const { eventId } = JSON.parse(options.body);
    return jsonFetchResponse(eventId === "event-conflict-old" ? 409 : 200, { ok: eventId !== "event-conflict-old" });
  };
  const service = createPaymentProviderService({ userDataPath, appRoot, fetchImpl });
  await service.saveSquareRelay({ baseUrl: "https://relay.example.com/", token: "limited-sync-token" });

  const first = await service.sync("square");
  assert.equal(first.imported, 3);
  assert.equal(first.delivered, 1);
  assert.equal(first.deliveryConflicts, 1);
  assert.deepEqual(first.payments.map((payment) => payment.id).sort(), ["complete-1", "conflict-1", "missing-event"]);
  assert.equal(acknowledgementRequests.length, 2);
  assert.deepEqual(
    acknowledgementRequests.map(({ options }) => JSON.parse(options.body)),
    [
      { eventId: "event-complete-1" },
      { eventId: "event-conflict-old" }
    ]
  );
  for (const { options } of acknowledgementRequests) {
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.headers.Authorization, "Bearer limited-sync-token");
  }

  const second = await service.sync("square");
  assert.equal(second.imported, 1);
  assert.equal(second.delivered, 1);
  assert.equal(second.deliveryConflicts, 0);
  assert.deepEqual(JSON.parse(acknowledgementRequests.at(-1).options.body), { eventId: "event-conflict-new" });
});

test("installed app follows every retained relay-history page without treating it as a shared queue", async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), "wmac-provider-relay-pages-test-"));
  const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const acknowledgements = [];
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://relay.example.com/payments") {
      return jsonFetchResponse(200, {
        payments: [relayPayment("page-one", "event-page-one", "COMPLETED")],
        nextCursor: "page-two"
      });
    }
    if (url === "https://relay.example.com/payments?cursor=page-two") {
      return jsonFetchResponse(200, {
        payments: [relayPayment("page-two", "event-page-two", "COMPLETED")],
        nextCursor: ""
      });
    }
    acknowledgements.push({ url, options });
    return jsonFetchResponse(200, { ok: true });
  };
  const service = createPaymentProviderService({ userDataPath, appRoot, fetchImpl });
  await service.saveSquareRelay({ baseUrl: "https://relay.example.com", token: "limited-sync-token" });

  const result = await service.sync("square");

  assert.equal(result.pages, 2);
  assert.equal(result.imported, 2);
  assert.deepEqual(result.payments.map((payment) => payment.id).sort(), ["page-one", "page-two"]);
  assert.deepEqual(acknowledgements.map(({ options }) => JSON.parse(options.body)), [
    { eventId: "event-page-one" },
    { eventId: "event-page-two" }
  ]);
});

test("local server reports filtered imports and never acknowledges without an event id", async () => {
  const acknowledgementRequests = [];
  let writtenStore;
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://relay.example.com/payments") {
      return jsonFetchResponse(200, {
        payments: [
          relayPayment("complete-1", "event-complete-1", "COMPLETED"),
          relayPayment("missing-event", "", "COMPLETED"),
          relayPayment("pending-1", "event-pending-1", "PENDING")
        ]
      });
    }
    acknowledgementRequests.push({ url, options });
    return jsonFetchResponse(409, { ok: false, error: "Payment changed after it was fetched." });
  };
  const response = responseRecorder();

  await syncSquareRelayPayments(response, {
    relayBaseUrl: "https://relay.example.com",
    token: "limited-sync-token",
    fetchImpl,
    readStore: async () => ({ version: 1, payments: [], updatedAt: "" }),
    writeStore: async (store) => {
      writtenStore = store;
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.imported, 2);
  assert.equal(response.body.delivered, 0);
  assert.equal(response.body.deliveryConflicts, 1);
  assert.deepEqual(writtenStore.payments.map((payment) => payment.id).sort(), ["complete-1", "missing-event"]);
  assert.equal(acknowledgementRequests.length, 1);
  assert.deepEqual(
    acknowledgementRequests.map(({ options }) => JSON.parse(options.body)),
    [{ eventId: "event-complete-1" }]
  );
  for (const { options } of acknowledgementRequests) {
    assert.equal(options.headers["Content-Type"], "application/json");
  }
});

function relayPayment(paymentId, eventId, status) {
  return {
    paymentId,
    ...(eventId ? { eventId } : {}),
    status,
    amountCents: 12500,
    currency: "USD",
    squareCreatedAt: "2026-07-13T12:00:00.000Z",
    squareUpdatedAt: "2026-07-13T12:00:01.000Z"
  };
}

function jsonFetchResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function responseRecorder() {
  return {
    statusCode: 0,
    body: null,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body) {
      this.body = JSON.parse(body);
    }
  };
}
