import { execFile } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEmptySquareStore,
  normalizeSquarePayment,
  updateSquarePaymentStatus,
  upsertSquarePayment
} from "./src/data.js";
import { resolveStaticFilePath } from "./src/static-path.js";

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
  if (new URL(request.url, `http://localhost:${preferredPort}`).pathname.startsWith("/api/square/")) {
    await handleSquareApi(request, response);
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

async function handleSquareApi(request, response) {
  const url = new URL(request.url, `http://localhost:${preferredPort}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/square/payments") {
      const store = await readSquareStore();
      json(response, 200, {
        configured: squareConfigured(),
        payments: store.payments,
        updatedAt: store.updatedAt
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/square/payments/status") {
      const body = await readJsonBody(request);
      const store = await readSquareStore();
      const patch = {
        status: body.status,
        memberId: body.memberId || "",
        suggestedMemberId: body.suggestedMemberId || body.memberId || "",
        paymentMonth: body.paymentMonth || "",
        approvedAt: body.status === "approved" ? new Date().toISOString() : "",
        approvedBy: body.status === "approved" ? "local-review" : "",
        ignoredAt: body.status === "ignored" ? new Date().toISOString() : "",
        ignoredReason: body.ignoredReason || ""
      };
      const result = updateSquarePaymentStatus(store, body.id, patch);
      if (!result.found) {
        json(response, 404, { error: "Square payment not found." });
        return;
      }
      await writeSquareStore(result.store);
      json(response, 200, { payment: result.store.payments.find((payment) => payment.id === body.id || payment.squarePaymentId === body.id) });
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

    json(response, 404, { error: "Square API route not found." });
  } catch (error) {
    json(response, 500, { error: error.message || "Square API error." });
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
  const store = upsertSquarePayment(await readSquareStore(), squarePayment);
  await writeSquareStore(store);
  json(response, 200, { received: true, staged: true, id: squarePayment.id });
}

async function syncSquarePayments(response) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    json(response, 501, {
      error: "Square sync is not configured yet.",
      nextStep: "Set SQUARE_ACCESS_TOKEN after Square credentials are ready."
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

  let store = await readSquareStore();
  (body.payments || []).forEach((payment) => {
    store = upsertSquarePayment(store, normalizeSquarePayment({ payment }));
  });
  await writeSquareStore(store);
  json(response, 200, { imported: body.payments?.length || 0, payments: store.payments, configured: true });
}

async function readSquareStore() {
  try {
    const text = await readFile(squareStorePath, "utf8");
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.payments)) {
      return parsed;
    }
  } catch {
    return createEmptySquareStore();
  }
  return createEmptySquareStore();
}

async function writeSquareStore(store) {
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

function squareConfigured() {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY);
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
