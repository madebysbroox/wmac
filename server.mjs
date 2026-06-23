import { execFile } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptyProviderPaymentStore,
  normalizeSquarePayment,
  normalizeWorldpayPayment,
  updateProviderPaymentStatus,
  upsertProviderPayment
} from "./src/data.js";
import { resolveStaticFilePath } from "./src/static-path.js";

const preferredPort = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "data");
const squareStorePath = join(dataDir, "square-payments.json");
const worldpayStorePath = join(dataDir, "worldpay-payments.json");
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
  if (apiPath.startsWith("/api/square/") || apiPath.startsWith("/api/worldpay/")) {
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
listen(currentPort);

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
  const provider = url.pathname.startsWith("/api/worldpay/") ? "worldpay" : "square";
  try {
    if (request.method === "GET" && url.pathname === `/api/${provider}/payments`) {
      const store = await readProviderStore(provider);
      json(response, 200, {
        configured: providerConfigured(provider),
        payments: store.payments,
        updatedAt: store.updatedAt
      });
      return;
    }

    if (request.method === "POST" && url.pathname === `/api/${provider}/payments/status`) {
      const body = await readJsonBody(request);
      const store = await readProviderStore(provider);
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
        json(response, 404, { error: `${providerLabel(provider)} payment not found.` });
        return;
      }
      await writeProviderStore(provider, result.store);
      json(response, 200, {
        payment: result.store.payments.find((payment) =>
          payment.id === body.id ||
          payment.squarePaymentId === body.id ||
          payment.worldpayPaymentId === body.id ||
          payment.providerPaymentId === body.id
        )
      });
      return;
    }

    if (request.method === "POST" && url.pathname === `/api/${provider}/sync`) {
      if (provider === "worldpay") {
        await syncWorldpayPayments(response);
      } else {
        await syncSquarePayments(response);
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/square/webhook") {
      await receiveSquareWebhook(request, response);
      return;
    }

    json(response, 404, { error: `${providerLabel(provider)} API route not found.` });
  } catch (error) {
    json(response, 500, { error: error.message || `${providerLabel(provider)} API error.` });
  }
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

  const squarePayment = normalizeSquarePayment(event);
  const store = upsertProviderPayment(await readProviderStore("square"), squarePayment);
  await writeProviderStore("square", store);
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
  const query = new URLSearchParams();
  if (process.env.SQUARE_LOCATION_ID) {
    query.set("location_id", process.env.SQUARE_LOCATION_ID);
  }
  query.set("sort_order", "DESC");
  query.set("limit", "100");

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

  let store = await readProviderStore("square");
  (body.payments || []).forEach((payment) => {
    store = upsertProviderPayment(store, normalizeSquarePayment({ payment }));
  });
  await writeProviderStore("square", store);
  json(response, 200, { imported: body.payments?.length || 0, payments: store.payments, configured: true });
}

async function syncSquareRelayPayments(response) {
  const relayBaseUrl = process.env.SQUARE_RELAY_BASE_URL.replace(/\/$/, "");
  const token = process.env.SQUARE_RELAY_SYNC_TOKEN;
  const relayResponse = await fetch(`${relayBaseUrl}/payments`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const body = await relayResponse.json();
  if (!relayResponse.ok) {
    json(response, relayResponse.status, { error: "Square relay sync failed.", details: body });
    return;
  }

  let store = await readProviderStore("square");
  const payments = body.payments || [];
  for (const payment of payments) {
    store = upsertProviderPayment(store, normalizeSquarePayment({
      ...payment,
      sourceEventType: payment.eventType,
      squarePaymentId: payment.squarePaymentId || payment.paymentId,
      buyerEmail: payment.buyerEmail || payment.buyerEmailAddress,
      createdAt: payment.createdAt || payment.squareCreatedAt || payment.receivedAt,
      updatedAt: payment.updatedAt || payment.squareUpdatedAt || payment.receivedAt,
      paidAt: payment.paidAt || payment.squareCreatedAt || payment.receivedAt,
      squareStatus: payment.squareStatus || payment.status,
      status: payment.localStatus || "pending"
    }));
  }
  await writeProviderStore("square", store);

  const delivered = [];
  for (const payment of payments) {
    const paymentId = payment.paymentId || payment.squarePaymentId || payment.id;
    if (!paymentId) {
      continue;
    }
    try {
      const deliveredResponse = await fetch(`${relayBaseUrl}/payments/${encodeURIComponent(paymentId)}/delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (deliveredResponse.ok) {
        delivered.push(paymentId);
      }
    } catch {
      // The local copy is saved. A later sync can mark the relay item delivered.
    }
  }

  json(response, 200, {
    imported: payments.length,
    delivered: delivered.length,
    payments: store.payments,
    configured: true,
    source: "relay"
  });
}

async function syncWorldpayPayments(response) {
  if (worldpayRelayConfigured()) {
    await syncWorldpayRelayPayments(response);
    return;
  }

  const url = process.env.WORLDPAY_TRANSACTIONS_URL;
  if (!url) {
    json(response, 501, {
      error: "Worldpay sync is not configured yet.",
      nextStep: "Set WORLDPAY_RELAY_BASE_URL and WORLDPAY_RELAY_SYNC_TOKEN, or set WORLDPAY_TRANSACTIONS_URL with WORLDPAY_ACCESS_TOKEN/WORLDPAY_BASIC_AUTH for the POS transaction export endpoint."
    });
    return;
  }

  const headers = worldpayAuthHeaders();
  const worldpayResponse = await fetch(url, { headers });
  const body = await worldpayResponse.json();
  if (!worldpayResponse.ok) {
    json(response, worldpayResponse.status, { error: "Worldpay sync failed.", details: body });
    return;
  }

  const payments = extractPaymentList(body);
  let store = await readProviderStore("worldpay");
  for (const payment of payments) {
    store = upsertProviderPayment(store, normalizeWorldpayPayment(payment));
  }
  await writeProviderStore("worldpay", store);
  json(response, 200, { imported: payments.length, payments: store.payments, configured: true, source: "direct" });
}

async function syncWorldpayRelayPayments(response) {
  const relayBaseUrl = process.env.WORLDPAY_RELAY_BASE_URL.replace(/\/$/, "");
  const token = process.env.WORLDPAY_RELAY_SYNC_TOKEN;
  const relayResponse = await fetch(`${relayBaseUrl}/payments`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const body = await relayResponse.json();
  if (!relayResponse.ok) {
    json(response, relayResponse.status, { error: "Worldpay relay sync failed.", details: body });
    return;
  }

  const payments = extractPaymentList(body);
  let store = await readProviderStore("worldpay");
  for (const payment of payments) {
    store = upsertProviderPayment(store, normalizeWorldpayPayment({
      ...payment,
      localStatus: payment.localStatus || payment.local_status || "pending"
    }));
  }
  await writeProviderStore("worldpay", store);
  json(response, 200, { imported: payments.length, payments: store.payments, configured: true, source: "relay" });
}

async function readProviderStore(provider) {
  const storePath = providerStorePath(provider);
  try {
    const text = await readFile(storePath, "utf8");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.payments)) {
      return parsed;
    }
  } catch {
    return createEmptyProviderPaymentStore();
  }
  return createEmptyProviderPaymentStore();
}

async function writeProviderStore(provider, store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(providerStorePath(provider), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function providerStorePath(provider) {
  return provider === "worldpay" ? worldpayStorePath : squareStorePath;
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

function validateSquareWebhook(request, rawBody) {
  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || !process.env.SQUARE_WEBHOOK_NOTIFICATION_URL) {
    return true;
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

function providerConfigured(provider) {
  if (provider === "worldpay") {
    return Boolean(worldpayRelayConfigured() || process.env.WORLDPAY_TRANSACTIONS_URL);
  }
  return Boolean(squareRelayConfigured() || process.env.SQUARE_ACCESS_TOKEN || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
}

function squareRelayConfigured() {
  return Boolean(process.env.SQUARE_RELAY_BASE_URL && process.env.SQUARE_RELAY_SYNC_TOKEN);
}

function worldpayRelayConfigured() {
  return Boolean(process.env.WORLDPAY_RELAY_BASE_URL && process.env.WORLDPAY_RELAY_SYNC_TOKEN);
}

function worldpayAuthHeaders() {
  const headers = {};
  if (process.env.WORLDPAY_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.WORLDPAY_ACCESS_TOKEN}`;
  } else if (process.env.WORLDPAY_BASIC_AUTH) {
    headers.Authorization = `Basic ${Buffer.from(process.env.WORLDPAY_BASIC_AUTH).toString("base64")}`;
  }
  if (process.env.WORLDPAY_ACCEPT) {
    headers.Accept = process.env.WORLDPAY_ACCEPT;
  }
  return headers;
}

function extractPaymentList(body) {
  if (Array.isArray(body)) {
    return body;
  }
  for (const key of ["payments", "transactions", "items", "data", "results"]) {
    if (Array.isArray(body?.[key])) {
      return body[key];
    }
  }
  return body ? [body] : [];
}

function providerLabel(provider) {
  return provider === "worldpay" ? "Worldpay" : "Square";
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
