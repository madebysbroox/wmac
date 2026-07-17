const { readFile, writeFile, mkdir } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function createPaymentProviderService({ userDataPath, appRoot, fetchImpl = fetch }) {
  const dataDir = path.join(userDataPath, "provider-data");
  const settingsPath = path.join(userDataPath, "provider-settings.json");
  let dataModulePromise;

  const dataModule = () => {
    dataModulePromise ||= import(pathToFileURL(path.join(appRoot, "src", "data.js")).href);
    return dataModulePromise;
  };

  async function readJson(filePath, fallback) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      return fallback;
    }
  }

  async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  function storePath(provider) {
    return path.join(dataDir, `${provider}-payments.json`);
  }

  async function readStore(provider) {
    const { createEmptyProviderPaymentStore } = await dataModule();
    return readJson(storePath(provider), createEmptyProviderPaymentStore());
  }

  async function writeStore(provider, store) {
    await writeJson(storePath(provider), { ...store, updatedAt: new Date().toISOString() });
  }

  async function settings() {
    return readJson(settingsPath, {});
  }

  async function effectiveSettings() {
    const saved = await settings();
    return {
      squareRelayBaseUrl: saved.squareRelayBaseUrl || process.env.SQUARE_RELAY_BASE_URL || "",
      squareRelaySyncToken: saved.squareRelaySyncToken || process.env.SQUARE_RELAY_SYNC_TOKEN || "",
      squareAccessToken: process.env.SQUARE_ACCESS_TOKEN || "",
      squareEnvironment: process.env.SQUARE_ENVIRONMENT || "production",
      squareLocationId: process.env.SQUARE_LOCATION_ID || "",
      squareApiVersion: process.env.SQUARE_API_VERSION || "2026-05-20",
      worldBankcardRelayBaseUrl: process.env.WORLDBANKCARD_RELAY_BASE_URL || "",
      worldBankcardRelaySyncToken: process.env.WORLDBANKCARD_RELAY_SYNC_TOKEN || "",
      worldBankcardTransactionsUrl: process.env.WORLDBANKCARD_TRANSACTIONS_URL || "",
      worldBankcardAccessToken: process.env.WORLDBANKCARD_ACCESS_TOKEN || ""
    };
  }

  async function getPublicSettings() {
    const config = await effectiveSettings();
    return {
      squareRelayBaseUrl: config.squareRelayBaseUrl,
      squareRelayConfigured: Boolean(config.squareRelayBaseUrl && config.squareRelaySyncToken),
      squareDirectConfigured: Boolean(config.squareAccessToken)
    };
  }

  async function saveSquareRelay({ baseUrl, token }) {
    const saved = await settings();
    const cleanUrl = String(baseUrl || "").trim().replace(/\/$/, "");
    const cleanToken = String(token || "").trim();
    if (!cleanUrl && !cleanToken) {
      delete saved.squareRelayBaseUrl;
      delete saved.squareRelaySyncToken;
      await writeJson(settingsPath, saved);
      return { configured: false };
    }
    let parsed;
    try {
      parsed = new URL(cleanUrl);
    } catch {
      throw new Error("Enter a complete Square relay URL beginning with https://");
    }
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHost) {
      throw new Error("The Square relay must use HTTPS.");
    }
    const finalToken = cleanToken || saved.squareRelaySyncToken || "";
    if (!finalToken) {
      throw new Error("Enter the Square relay sync token.");
    }
    saved.squareRelayBaseUrl = cleanUrl;
    saved.squareRelaySyncToken = finalToken;
    await writeJson(settingsPath, saved);
    return { configured: true };
  }

  async function list(provider) {
    validateProvider(provider);
    const store = await readStore(provider);
    return {
      configured: await providerConfigured(provider),
      payments: store.payments || [],
      updatedAt: store.updatedAt || ""
    };
  }

  async function providerConfigured(provider) {
    const config = await effectiveSettings();
    if (provider === "square") {
      return Boolean((config.squareRelayBaseUrl && config.squareRelaySyncToken) || config.squareAccessToken);
    }
    return Boolean((config.worldBankcardRelayBaseUrl && config.worldBankcardRelaySyncToken) || config.worldBankcardTransactionsUrl);
  }

  async function sync(provider) {
    validateProvider(provider);
    const config = await effectiveSettings();
    if (provider === "square") {
      if (config.squareRelayBaseUrl && config.squareRelaySyncToken) {
        return syncSquareRelay(config);
      }
      if (config.squareAccessToken) {
        return syncSquareDirect(config);
      }
      throw new Error("Save the Square relay address and sync token first.");
    }
    if (config.worldBankcardRelayBaseUrl && config.worldBankcardRelaySyncToken) {
      return syncGenericRelay("worldbankcard", config.worldBankcardRelayBaseUrl, config.worldBankcardRelaySyncToken);
    }
    throw new Error("World Bankcard is not configured in the installed app.");
  }

  async function syncSquareDirect(config) {
    const { normalizeSquarePayment, upsertProviderPayment } = await dataModule();
    const baseUrl = config.squareEnvironment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
    const store = await readStore("square");
    let nextStore = store;
    let cursor = "";
    let checked = 0;
    let imported = 0;
    let pages = 0;
    const customerCache = new Map();
    do {
      const query = new URLSearchParams({ sort_order: "DESC", limit: "100" });
      if (config.squareLocationId) query.set("location_id", config.squareLocationId);
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`${baseUrl}/v2/payments?${query}`, {
        headers: {
          Authorization: `Bearer ${config.squareAccessToken}`,
          "Square-Version": config.squareApiVersion
        }
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.errors?.[0]?.detail || "Square sync failed.");
      }
      for (const payment of body.payments || []) {
        checked += 1;
        if (payment.status !== "COMPLETED") continue;
        const customer = payment.customer_id
          ? await retrieveSquareCustomer(baseUrl, payment.customer_id, config, customerCache)
          : null;
        nextStore = upsertProviderPayment(nextStore, normalizeSquarePayment({
          payment,
          buyerName: customer ? [customer.given_name, customer.family_name].filter(Boolean).join(" ") : "",
          buyerEmail: customer?.email_address || "",
          buyerPhone: customer?.phone_number || ""
        }));
        imported += 1;
      }
      cursor = body.cursor || "";
      pages += 1;
    } while (cursor && pages < 20);
    nextStore.lastSyncAt = new Date().toISOString();
    await writeStore("square", nextStore);
    return { configured: true, source: "direct", checked, imported, payments: nextStore.payments || [] };
  }

  async function syncSquareRelay(config) {
    const result = await syncGenericRelay("square", config.squareRelayBaseUrl, config.squareRelaySyncToken);
    const delivered = [];
    let deliveryConflicts = 0;
    for (const payment of result.newlyReceivedPayments) {
      const paymentId = payment.paymentId || payment.squarePaymentId || payment.id;
      const eventId = relayPaymentEventId(payment);
      if (!paymentId || !eventId) continue;
      try {
        const response = await fetchImpl(`${config.squareRelayBaseUrl}/payments/${encodeURIComponent(paymentId)}/delivered`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.squareRelaySyncToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ eventId })
        });
        if (response.ok) delivered.push(paymentId);
        else if (response.status === 409) deliveryConflicts += 1;
      } catch {
        // The durable local copy is already saved; the next sync can acknowledge it.
      }
    }
    delete result.receivedPayments;
    delete result.newlyReceivedPayments;
    return { ...result, delivered: delivered.length, deliveryConflicts };
  }

  async function syncGenericRelay(provider, baseUrl, token) {
    const { normalizeProviderPayment, upsertProviderPayment } = await dataModule();
    let store = await readStore(provider);
    const receivedPayments = [];
    const newlyReceivedPayments = [];
    let imported = 0;
    let cursor = "";
    let pages = 0;
    const visitedCursors = new Set();
    do {
      const url = new URL(`${String(baseUrl).replace(/\/$/, "")}/payments`);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || `${provider} relay sync failed.`);
      }
      const pagePayments = Array.isArray(body) ? body : body.payments || [];
      for (const payment of pagePayments) {
        if (provider === "square" && !squarePaymentIsCompleted(payment)) continue;
        const normalized = normalizeProviderPayment(payment, [], provider);
        const existing = (store.payments || []).find((item) =>
          item.id === normalized.id
          || (normalized.providerPaymentId && item.providerPaymentId === normalized.providerPaymentId)
        );
        store = upsertProviderPayment(store, normalized);
        receivedPayments.push(payment);
        if (!existing || existing.providerEventId !== normalized.providerEventId) {
          newlyReceivedPayments.push(payment);
        }
        imported += 1;
      }
      cursor = Array.isArray(body) ? "" : String(body.nextCursor || "");
      pages += 1;
      if (cursor && visitedCursors.has(cursor)) {
        throw new Error(`${provider} relay returned a repeated page cursor.`);
      }
      visitedCursors.add(cursor);
    } while (cursor && pages < 100);
    store.lastSyncAt = new Date().toISOString();
    await writeStore(provider, store);
    return { configured: true, source: "relay", imported, pages, payments: store.payments || [], receivedPayments, newlyReceivedPayments };
  }

  async function updateStatus(provider, paymentId, patch) {
    validateProvider(provider);
    const { updateProviderPaymentStatus } = await dataModule();
    const store = await readStore(provider);
    const auditPatch = { ...patch };
    if (patch.status === "approved") {
      auditPatch.approvedAt = new Date().toISOString();
      auditPatch.approvedBy = "windows-app";
    }
    if (patch.status === "ignored") {
      auditPatch.ignoredAt = new Date().toISOString();
    }
    const result = updateProviderPaymentStatus(store, paymentId, auditPatch);
    if (!result.found) throw new Error(`${provider} payment not found.`);
    await writeStore(provider, result.store);
    return {
      payment: result.store.payments.find((payment) => [payment.id, payment.providerPaymentId, payment.squarePaymentId, payment.worldBankcardPaymentId].includes(paymentId))
    };
  }

  return { list, sync, updateStatus, getPublicSettings, saveSquareRelay };
}

async function retrieveSquareCustomer(baseUrl, customerId, config, cache) {
  if (cache.has(customerId)) return cache.get(customerId);
  try {
    const response = await fetch(`${baseUrl}/v2/customers/${encodeURIComponent(customerId)}`, {
      headers: {
        Authorization: `Bearer ${config.squareAccessToken}`,
        "Square-Version": config.squareApiVersion
      }
    });
    const body = await response.json();
    const customer = response.ok ? body.customer || null : null;
    cache.set(customerId, customer);
    return customer;
  } catch {
    cache.set(customerId, null);
    return null;
  }
}

function squarePaymentIsCompleted(payment) {
  const status = String(
    payment?.squareStatus ||
    payment?.providerStatus ||
    payment?.status ||
    payment?.payment?.status ||
    ""
  ).toUpperCase();
  return !status || status === "COMPLETED";
}

function relayPaymentEventId(payment) {
  return String(payment?.eventId || payment?.event_id || "").trim();
}

function validateProvider(provider) {
  if (!["square", "worldbankcard"].includes(provider)) {
    throw new Error("Unsupported payment provider.");
  }
}

module.exports = { createPaymentProviderService, squarePaymentIsCompleted };
