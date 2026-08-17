import { execFile } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyProviderPaymentStore,
  normalizeSquarePayment,
  updateProviderPaymentStatus,
  upsertProviderPayment
} from "./src/data.js";
import { resolveStaticFilePath } from "./src/static-path.js";

// Load .env file if present (simple parser, no external dependencies)
async function loadEnvFile() {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), ".env");
  if (!existsSync(envPath)) {
    return;
  }
  try {
    const content = await readFile(envPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        let cleanValue = value.trim();
        // Remove surrounding quotes if present
        if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
            (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
          cleanValue = cleanValue.slice(1, -1);
        }
        // Only set if not already in environment
        if (!(key in process.env)) {
          process.env[key] = cleanValue;
        }
      }
    }
  } catch {
    // Ignore .env load errors
  }
}

await loadEnvFile();

const preferredPort = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "data");
const squareStorePath = join(dataDir, "square-payments.json");
const maxPortAttempts = 20;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png"
};

const server = createServer(async (request, response) => {
  const apiPath = new URL(request.url, `http://localhost:${preferredPort}`).pathname;
  if (apiPath.startsWith("/api/square/")) {
    await handlePaymentProviderApi(request, response);
    return;
  }

  const requestedPath = new URL(request.url, `http://localhost:${preferredPort}`).pathname;
  const filePath = resolveStaticFilePath(root, requestedPath);
  const relativePath = relative(root, filePath);

  if (relativePath.startsWith("..") || relativePath === ".." || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(notFoundMessage(requestedPath, filePath));
    return;
  }

  if (statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(notFoundMessage(requestedPath, filePath));
    return;
  }

  response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath)
    .on("error", () => {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end("Server error");
    })
    .pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    const nextPort = currentPort + 1;
    if (nextPort < preferredPort + maxPortAttempts) {
      console.log(`Port ${currentPort} is already busy. Trying http://${host}:${nextPort} instead...`);
      listen(nextPort);
      return;
    }

    console.error("Payment Tracker could not find an open port.");
    console.error("Close old Payment Tracker windows or end old node.exe processes in Task Manager, then try again.");
    process.exit(1);
  }

  console.error("Payment Tracker could not start.");
  console.error(error.message);
  process.exit(1);
});

let currentPort = preferredPort;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  listen(currentPort);
}

function listen(port) {
  currentPort = port;
  server.removeListener("listening", onListening);
  server.once("listening", onListening);
  server.listen(currentPort, host);
}

function onListening() {
  const url = `http://${host}:${currentPort}`;
  console.log(`Master Lee Payment Tracker is running at ${url}`);
  console.log(`Serving files from ${root}`);
  openBrowser(url);
}

function notFoundMessage(requestedPath, filePath) {
  return [
    "Not found",
    "",
    `Requested path: ${requestedPath}`,
    `Serving folder: ${root}`,
    `Tried file: ${filePath}`,
    "",
    "If this is the Payment Tracker home page, close every old black Payment Tracker window and run start-windows.bat again from the newly extracted folder."
  ].join("\n");
}

async function handlePaymentProviderApi(request, response) {
  const url = new URL(request.url, `http://localhost:${preferredPort}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/square/payments") {
      const store = await readProviderStore();
      json(response, 200, {
        configured: providerConfigured(),
        payments: store.payments,
        updatedAt: store.updatedAt
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/square/payments/status") {
      const body = await readJsonBody(request);
      const store = await readProviderStore();
      const patch = {};
      if ("status" in body) {
        patch.status = body.status;
      }
      if ("memberId" in body) {
        patch.memberId = body.memberId || "";
      }
      if ("suggestedMemberId" in body || "memberId" in body) {
        patch.suggestedMemberId = body.suggestedMemberId || body.memberId || "";
      }
      if ("paymentMonth" in body) {
        patch.paymentMonth = body.paymentMonth || "";
      }
      if ("paymentCategory" in body) {
        patch.paymentCategory = body.paymentCategory || "";
      }
      if ("reviewNote" in body) {
        patch.reviewNote = body.reviewNote || "";
      }
      if (body.status === "approved") {
        patch.approvedAt = new Date().toISOString();
        patch.approvedBy = "local-review";
      }
      if (body.status === "ignored") {
        patch.ignoredAt = new Date().toISOString();
        patch.ignoredReason = body.ignoredReason || "";
      }
      const result = updateProviderPaymentStatus(store, body.id, patch);
      if (!result.found) {
        json(response, 404, { error: "Square payment not found." });
        return;
      }
      await writeProviderStore(result.store);
      json(response, 200, {
        payment: result.store.payments.find((payment) =>
          payment.id === body.id ||
          payment.squarePaymentId === body.id ||
          payment.providerPaymentId === body.id
        )
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/square/sync") {
      await syncSquarePayments(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/square/webhook") {
      await receiveSquareWebhook(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/square/subscriptions/monthly-invoice") {
      const body = await readJsonBody(request);
      const result = await createSquareMonthlyInvoice(body);
      json(response, 200, result);
      return;
    }

    json(response, 404, { error: "Square API route not found." });
  } catch (error) {
    json(response, 500, { error: error.message || "Square API error." });
  }
}

async function createSquareMonthlyInvoice(input = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const planVariationId = process.env.SQUARE_MONTHLY_INVOICE_PLAN_VARIATION_ID;
  if (!token || !locationId || !planVariationId) {
    throw new Error("Square monthly invoices need SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, and SQUARE_MONTHLY_INVOICE_PLAN_VARIATION_ID.");
  }
  const email = String(input.email || "").trim().toLowerCase();
  const amountCents = Math.round(Number(input.amount || 0) * 100);
  if (!email || !input.name || !input.memberId || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.startDate || "")) || amountCents < 100) {
    throw new Error("A payer name, email, billing date, and monthly amount of at least $1 are required.");
  }
  const baseUrl = process.env.SQUARE_ENVIRONMENT === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  let customerId = String(input.squareCustomerId || "").trim();
  
  // Look up customer by email before creating a new one
  if (!customerId) {
    try {
      const searchResult = await squareApiRequest(baseUrl, token, "/v2/customers/search", {
        query: {
          filter: {
            email_address: { exact: email }
          }
        }
      });
      if (searchResult.customers?.length > 0) {
        customerId = searchResult.customers[0].id;
      }
    } catch {
      // Search failed; proceed to create customer
    }
  }
  
  if (!customerId) {
    const [givenName, ...familyName] = String(input.name).trim().split(/\s+/);
    const customerIdempotencyKey = stableIdempotencyKey(`customer-${input.memberId}-${email}`);
    const customer = await squareApiRequest(baseUrl, token, "/v2/customers", {
      idempotency_key: customerIdempotencyKey,
      given_name: givenName || input.name,
      family_name: familyName.join(" "),
      email_address: email,
      phone_number: String(input.phone || "").trim(),
      reference_id: String(input.memberId)
    });
    customerId = customer.customer?.id || "";
  }
  if (!customerId) throw new Error("Square did not return a customer ID.");
  
  const subscriptionIdempotencyKey = stableIdempotencyKey(`subscription-${input.memberId}-${input.startDate}`);
  const result = await squareApiRequest(baseUrl, token, "/v2/subscriptions", {
    idempotency_key: subscriptionIdempotencyKey,
    customer_id: customerId,
    location_id: locationId,
    plan_variation_id: planVariationId,
    price_override_money: { amount: amountCents, currency: "USD" },
    start_date: input.startDate,
    monthly_billing_anchor_date: Number(input.startDate.slice(8, 10)),
    ...(input.cancelDate ? { canceled_date: input.cancelDate } : {}),
    timezone: "America/New_York",
    source: { name: "WMAC Payment Tracker" }
  });
  if (!result.subscription?.id) throw new Error("Square did not return a subscription ID.");
  return { customerId, subscription: result.subscription };
}

function stableIdempotencyKey(input) {
  return createHash("sha256").update(String(input)).digest("hex").slice(0, 32);
}

async function squareApiRequest(baseUrl, token, pathName, body) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": process.env.SQUARE_API_VERSION || "2026-07-15",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.errors?.[0]?.detail || payload.errors?.[0]?.code || "Square request failed.");
  return payload;
}

async function receiveSquareWebhook(request, response) {
  const rawBody = await readRawBody(request);
  if (!validateSquareWebhook(request, rawBody)) {
    json(response, 401, { error: "Webhook signature did not validate." });
    return;
  }

  const event = JSON.parse(rawBody || "{}");
  if (!String(event.type || "").startsWith("payment.")) {
    json(response, 200, { received: true, staged: false });
    return;
  }

  const providerStatus = String(event?.data?.object?.payment?.status || "").toUpperCase();
  if (providerStatus !== "COMPLETED") {
    json(response, 200, { received: true, staged: false, providerStatus });
    return;
  }

  const squarePayment = normalizeSquarePayment(event);
  const store = upsertProviderPayment(await readProviderStore(), squarePayment);
  await writeProviderStore(store);
  json(response, 200, { received: true, staged: true, id: squarePayment.id });
}

async function syncSquarePayments(response) {
  if (squareRelayConfigured()) {
    await syncSquareRelayPayments(response);
    return;
  }

  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    json(response, 501, {
      error: "Square sync is not configured yet.",
      nextStep: "Set SQUARE_RELAY_BASE_URL and SQUARE_RELAY_SYNC_TOKEN for the AWS relay, or set SQUARE_ACCESS_TOKEN for direct Square sync."
    });
    return;
  }

  const baseUrl = process.env.SQUARE_ENVIRONMENT === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
  let store = await readProviderStore();
  let cursor = "";
  let checked = 0;
  let imported = 0;
  let pages = 0;
  do {
    const query = new URLSearchParams({ sort_order: "DESC", limit: "100" });
    if (process.env.SQUARE_LOCATION_ID) query.set("location_id", process.env.SQUARE_LOCATION_ID);
    if (cursor) query.set("cursor", cursor);
    const squareResponse = await fetch(`${baseUrl}/v2/payments?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Square-Version": process.env.SQUARE_API_VERSION || "2026-05-20"
      }
    });
    const body = await squareResponse.json();
    if (!squareResponse.ok) {
      json(response, squareResponse.status, { error: "Square sync failed.", details: body });
      return;
    }
    for (const payment of body.payments || []) {
      checked += 1;
      if (payment.status !== "COMPLETED") continue;
      store = upsertProviderPayment(store, normalizeSquarePayment({ payment }));
      imported += 1;
    }
    cursor = body.cursor || "";
    pages += 1;
  } while (cursor && pages < 20);
  await writeProviderStore(store);
  json(response, 200, { checked, imported, payments: store.payments, configured: true });
}

export async function syncSquareRelayPayments(response, dependencies = {}) {
  const relayBaseUrl = String(dependencies.relayBaseUrl || process.env.SQUARE_RELAY_BASE_URL || "").replace(/\/$/, "");
  const token = dependencies.token || process.env.SQUARE_RELAY_SYNC_TOKEN;
  const fetchRelay = dependencies.fetchImpl || fetch;
  const readStore = dependencies.readStore || (() => readProviderStore());
  const writeStore = dependencies.writeStore || ((store) => writeProviderStore(store));
  const relayResponse = await fetchRelay(`${relayBaseUrl}/payments`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const body = await relayResponse.json();
  if (!relayResponse.ok) {
    json(response, relayResponse.status, { error: "Square relay sync failed.", details: body });
    return;
  }

  let store = await readStore();
  const importedPayments = [];
  const newlyImportedPayments = [];
  let currentBody = body;
  let cursor = "";
  let pages = 0;
  const visitedCursors = new Set();
  do {
    const payments = currentBody.payments || [];
    for (const payment of payments) {
      if (!squareRelayPaymentIsCompleted(payment)) {
        continue;
      }
      const normalized = normalizeSquarePayment({
        ...payment,
        sourceEventType: payment.eventType,
        squarePaymentId: payment.squarePaymentId || payment.paymentId,
        buyerEmail: payment.buyerEmail || payment.buyerEmailAddress,
        createdAt: payment.createdAt || payment.squareCreatedAt || payment.receivedAt,
        updatedAt: payment.updatedAt || payment.squareUpdatedAt || payment.receivedAt,
        paidAt: payment.paidAt || payment.squareCreatedAt || payment.receivedAt,
        squareStatus: payment.squareStatus || payment.status,
        status: payment.localStatus || "pending"
      });
      const existing = (store.payments || []).find((item) =>
        item.id === normalized.id
        || (normalized.providerPaymentId && item.providerPaymentId === normalized.providerPaymentId)
      );
      store = upsertProviderPayment(store, normalized);
      importedPayments.push(payment);
      if (!existing || existing.providerEventId !== normalized.providerEventId) {
        newlyImportedPayments.push(payment);
      }
    }
    cursor = String(currentBody.nextCursor || "");
    pages += 1;
    if (!cursor || pages >= 100) {
      break;
    }
    if (visitedCursors.has(cursor)) {
      json(response, 502, { error: "Square relay returned a repeated page cursor." });
      return;
    }
    visitedCursors.add(cursor);
    const pageUrl = new URL(`${relayBaseUrl}/payments`);
    pageUrl.searchParams.set("cursor", cursor);
    const pageResponse = await fetchRelay(pageUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    currentBody = await pageResponse.json();
    if (!pageResponse.ok) {
      json(response, pageResponse.status, { error: "Square relay sync failed.", details: currentBody });
      return;
    }
  } while (true);
  await writeStore(store);

  const delivered = [];
  let deliveryConflicts = 0;
  for (const payment of newlyImportedPayments) {
    const paymentId = payment.paymentId || payment.squarePaymentId || payment.id;
    const eventId = relayPaymentEventId(payment);
    if (!paymentId || !eventId) {
      continue;
    }
    try {
      const deliveredResponse = await fetchRelay(`${relayBaseUrl}/payments/${encodeURIComponent(paymentId)}/delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ eventId })
      });
      if (deliveredResponse.ok) {
        delivered.push(paymentId);
      } else if (deliveredResponse.status === 409) {
        deliveryConflicts += 1;
      }
    } catch {
      // The local copy is saved. A later sync can mark the relay item delivered.
    }
  }

  json(response, 200, {
    imported: importedPayments.length,
    pages,
    delivered: delivered.length,
    deliveryConflicts,
    payments: store.payments,
    configured: true,
    source: "relay"
  });
}

export function squareRelayPaymentIsCompleted(payment) {
  const providerStatus = String(
    payment?.squareStatus ||
    payment?.providerStatus ||
    payment?.status ||
    payment?.payment?.status ||
    ""
  ).toUpperCase();
  return providerStatus === "COMPLETED";
}

function relayPaymentEventId(payment) {
  return String(payment?.eventId || payment?.event_id || "").trim();
}

async function readProviderStore() {
  try {
    const text = await readFile(squareStorePath, "utf8");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.payments)) {
      return parsed;
    }
  } catch {
    return createEmptyProviderPaymentStore();
  }
  return createEmptyProviderPaymentStore();
}

async function writeProviderStore(store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(squareStorePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request) {
  const raw = await readRawBody(request);
  return raw ? JSON.parse(raw) : {};
}

export function validateSquareWebhook(request, rawBody) {
  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || !process.env.SQUARE_WEBHOOK_NOTIFICATION_URL) {
    if (process.env.SQUARE_WEBHOOK_DEV_BYPASS === "1") {
      return true;
    }
    return false;
  }
  const signature = request.headers["x-square-hmacsha256-signature"];
  if (!signature) {
    return false;
  }
  const hmac = createHmac("sha256", process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
  hmac.update(`${process.env.SQUARE_WEBHOOK_NOTIFICATION_URL}${rawBody}`);
  const expected = Buffer.from(hmac.digest("base64"));
  const received = Buffer.from(String(signature));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function providerConfigured() {
  return Boolean(squareRelayConfigured() || process.env.SQUARE_ACCESS_TOKEN || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
}

function squareRelayConfigured() {
  return Boolean(process.env.SQUARE_RELAY_BASE_URL && process.env.SQUARE_RELAY_SYNC_TOKEN);
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function openBrowser(url) {
  if (process.env.NO_OPEN_BROWSER) {
    return;
  }

  const platform = process.platform;
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  execFile(command, args, { windowsHide: true }, () => {});
}
