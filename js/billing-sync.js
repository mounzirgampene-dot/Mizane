// MIZANE — Synchronisation bidirectionnelle et fusion initiale de la facturation.
import { makeBillingNumber } from "./billing-core.js";

const SHADOW_PREFIX = "mizane_billing_sync_shadow_v1:";
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
};
const signature = value => JSON.stringify(stable(value));
const hash = value => {
  const input = signature(value);
  let result = 2166136261;
  for (let i = 0; i < input.length; i++) {
    result ^= input.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16);
};
function normalizeBilling(value) {
  const billing = value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
  if (!Array.isArray(billing.documents)) billing.documents = [];\n  if (!Array.isArray(billing.pendingStockAccountingOperations)) billing.pendingStockAccountingOperations = [];
  if (!billing.settings || typeof billing.settings !== "object" || Array.isArray(billing.settings)) billing.settings = {};
  billing.nextId = Math.max(1, Number(billing.nextId) || 1);
  billing.nextPaymentId = Math.max(1, Number(billing.nextPaymentId) || 1);
  return billing;
}
function readShadow(companyId) {
  try {
    const raw = localStorage.getItem(SHADOW_PREFIX + companyId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveShadow(companyId, data, version) {
  localStorage.setItem(SHADOW_PREFIX + companyId, JSON.stringify({
    hash: hash(data), sync_version: Number(version) || 0,
  }));
}
export async function invokeWithRetry(request, { maxAttempts = 4, baseDelayMs = 250 } = {}) {
  let lastResult = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      lastResult = await request();
    } catch (error) {
      lastResult = { data: null, error };
    }
    if (!lastResult?.error) return lastResult;
    const status = Number(lastResult.error?.context?.status ?? lastResult.error?.status ?? 0);
    const message = String(lastResult.error?.message || "");
    const retryable = [408, 425, 429, 500, 502, 503, 504].includes(status) ||
      (!status && /network|fetch|timeout|temporar|connection|failed to send a request/i.test(message));
    if (!retryable || attempt === maxAttempts - 1) return lastResult;
    if (baseDelayMs > 0) await new Promise(resolve => setTimeout(resolve, baseDelayMs * (2 ** attempt)));
  }
  return lastResult || { data: null, error: new Error("Échec temporaire de la synchronisation.") };
}
async function invoke(supabase, body, fallback) {
  const { data, error } = await invokeWithRetry(
    () => supabase.functions.invoke("sync-billing", { body })
  );
  if (error) {
    let message = error.message || fallback;
    try {
      const response = error.context;
      const detail = response && typeof response.clone === "function" ? await response.clone().json() : null;
      if (detail?.error) message = detail.error;
    } catch {}
    throw new Error(message);
  }
  if (!data || data.company_id && data.company_id !== body.company_id) throw new Error("Réponse de synchronisation de facturation incohérente.");
  return data;
}
async function readRemote(supabase, companyId) {
  const result = await invoke(supabase, { action: "read", company_id: companyId }, "Lecture de la facturation cloud impossible.");
  return { data: result.data ? normalizeBilling(result.data) : null, version: Number(result.sync_version) || 0 };
}
async function writeRemote(supabase, companyId, data, version) {
  const result = await invoke(supabase, {
    action: "write",
    company_id: companyId,
    operation_uid: globalThis.crypto?.randomUUID?.() || fallbackUuid(),
    expected_sync_version: Number(version) || 0,
    data,
  }, "Envoi de la facturation cloud impossible.");
  if (result.conflict || result.ok === false) throw new Error("Conflit de synchronisation de la facturation : une autre modification a été enregistrée sur un autre appareil. Aucune version n'a été écrasée.");
  if (result.ok !== true) throw new Error("Le serveur n'a pas confirmé la synchronisation de la facturation.");
  return Number(result.sync_version) || 0;
}
function fallbackUuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function documentIdentity(doc) {
  const copy = clone(doc);
  for (const key of ["id", "payments", "paymentHistory", "paidAmount", "status", "convertedTo", "createdAt", "updatedAt"]) delete copy[key];
  return signature(copy);
}
function paymentIdentity(payment) {
  const copy = clone(payment);
  delete copy.id;
  delete copy.createdAt;
  return signature(copy);
}
function mergeInitialBilling(localValue, remoteValue) {
  const local = normalizeBilling(localValue);
  const remote = normalizeBilling(remoteValue);
  const hasPurchases = billing => Boolean(
    billing.purchases &&
    ((Array.isArray(billing.purchases.documents) && billing.purchases.documents.length) ||
     (Array.isArray(billing.purchases.suppliers) && billing.purchases.suppliers.length))
  );
  const localHasPurchases = hasPurchases(local);
  const remoteHasPurchases = hasPurchases(remote);
  if (localHasPurchases && remoteHasPurchases && signature(local.purchases) !== signature(remote.purchases)) {
    throw new Error("Conflit lors de la première synchronisation des Achats : les données locales et cloud diffèrent. Aucune version n'a été écrasée.");
  }
  const purchases = localHasPurchases ? clone(local.purchases) : clone(remote.purchases);\n  const stockOperations = new Map();\n  for (const operation of [...(remote.pendingStockAccountingOperations || []), ...(local.pendingStockAccountingOperations || [])]) {\n    if (!operation?.operationUid) continue;\n    const previous = stockOperations.get(String(operation.operationUid));\n    if (!previous || operation.status === "posted" || operation.status === "skipped" || (!["posted","skipped"].includes(previous.status) && new Date(operation.updatedAt || operation.createdAt || 0) >= new Date(previous.updatedAt || previous.createdAt || 0))) stockOperations.set(String(operation.operationUid), clone(operation));\n  }
  const settings = { ...clone(remote.settings), ...clone(local.settings) };
  const records = [];
  const byIdentity = new Map();
  const addDocuments = (billing, source) => {
    for (const original of billing.documents) {
      const doc = clone(original);
      const identity = documentIdentity(doc);
      const existing = byIdentity.get(identity);
      if (existing) {
        if (doc.type === "invoice") {
          const payments = new Map((existing.doc.payments || []).map(p => [paymentIdentity(p), p]));
          for (const payment of doc.payments || []) payments.set(paymentIdentity(payment), payment);
          existing.doc.payments = [...payments.values()];
          const history = new Map((existing.doc.paymentHistory || []).map(event => [event.eventId || signature(event), event]));
          for (const event of doc.paymentHistory || []) history.set(event.eventId || signature(event), event);
          existing.doc.paymentHistory = [...history.values()];
          const supersededIds = new Set(existing.doc.paymentHistory.filter(event => ["modification", "annulation"].includes(event.action)).map(event => Number(event.paymentId)).filter(Number.isFinite));
          existing.doc.payments = existing.doc.payments.filter(payment => !supersededIds.has(Number(payment.id)));
          existing.doc.paidAmount = existing.doc.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        }
        if (doc.id != null) existing.mergedIds ||= [];
        if (doc.id != null) existing.mergedIds.push({ source, id: doc.id });
        continue;
      }
      const record = { doc, source, oldId: doc.id };
      records.push(record);
      byIdentity.set(identity, record);
    }
  };
  addDocuments(remote, "cloud");
  addDocuments(local, "local");
  for (const record of records) {
    const doc = record.doc;
    if (doc.type !== "invoice") continue;
    doc.paymentHistory = Array.isArray(doc.paymentHistory) ? doc.paymentHistory : [];
    const supersededIds = new Set(doc.paymentHistory.filter(event => ["modification", "annulation"].includes(event.action)).map(event => Number(event.paymentId)).filter(Number.isFinite));
    doc.payments = (Array.isArray(doc.payments) ? doc.payments : []).filter(payment => !supersededIds.has(Number(payment.id)));
    doc.paidAmount = doc.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }

  let nextId = Math.max(1, Number(local.nextId) || 1, Number(remote.nextId) || 1);
  const idMaps = { cloud: new Map(), local: new Map() };
  for (const record of records) {
    const oldId = record.oldId;
    record.doc.id = nextId++;
    if (oldId != null) idMaps[record.source].set(oldId, record.doc.id);
    for (const merged of record.mergedIds || []) idMaps[merged.source].set(merged.id, record.doc.id);
  }
  for (const record of records) {
    if (record.doc.type === "quote" && record.doc.convertedTo != null) {
      record.doc.convertedTo = idMaps[record.source].get(record.doc.convertedTo) ?? record.doc.convertedTo;
    }
  }

  const usedNumbers = new Set();
  const counters = {
    quote: Math.max(1, Number(local.settings.nextQuote) || 1, Number(remote.settings.nextQuote) || 1),
    invoice: Math.max(1, Number(local.settings.nextInvoice) || 1, Number(remote.settings.nextInvoice) || 1),
  };
  for (const record of records) {
    const doc = record.doc;
    const originalNumber = String(doc.number || "");
    if (originalNumber && !usedNumbers.has(originalNumber)) {
      usedNumbers.add(originalNumber);
      continue;
    }
    const kind = doc.type === "quote" ? "quote" : "invoice";
    const year = String(doc.date || "").slice(0, 4) || String(new Date().getFullYear());
    let candidate;
    do {
      candidate = makeBillingNumber(kind, year, counters[kind]++, settings);
    } while (usedNumbers.has(candidate));
    doc.number = candidate;
    usedNumbers.add(candidate);
  }

  let nextPaymentId = Math.max(1, Number(local.nextPaymentId) || 1, Number(remote.nextPaymentId) || 1);
  for (const record of records) {
    const doc = record.doc;
    if (doc.type !== "invoice") continue;
    const seen = new Set();
    doc.payments = (Array.isArray(doc.payments) ? doc.payments : []).filter(payment => {
      const key = paymentIdentity(payment);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(payment => ({ ...payment, id: nextPaymentId++ }));
    doc.paidAmount = doc.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }
  settings.nextQuote = counters.quote;
  settings.nextInvoice = counters.invoice;
  return {
    ...remote,
    ...local,
    settings,
    purchases,
    documents: records.map(record => record.doc),
    nextId,
    nextPaymentId,
  };
}

export async function syncBilling(supabase, companyId, role, localValue) {
  const local = normalizeBilling(localValue);
  const remote = await readRemote(supabase, companyId);
  const shadow = readShadow(companyId);

  if (!shadow) {
    if (remote.version === 0) {
      if (role === "reader") return { billing: local, pushed: 0, pulled: 0 };
      const version = await writeRemote(supabase, companyId, local, 0);
      const confirmed = await readRemote(supabase, companyId);
      if (!confirmed.data || confirmed.version !== version || hash(confirmed.data) !== hash(local)) {
        throw new Error("La facturation envoyée n'a pas pu être confirmée par le serveur.");
      }
      saveShadow(companyId, confirmed.data, confirmed.version);
      return { billing: local, pushed: 1, pulled: 0 };
    }
    if (!local.documents.length && !local.purchases?.documents?.length && !local.purchases?.suppliers?.length && !local.pendingStockAccountingOperations.length) {
      saveShadow(companyId, remote.data, remote.version);
      return { billing: remote.data, pushed: 0, pulled: 1 };
    }
    if (role === "reader") throw new Error("La première synchronisation doit être effectuée par un administrateur ou un comptable.");
    if (hash(local) === hash(remote.data)) {
      saveShadow(companyId, remote.data, remote.version);
      return { billing: remote.data, pushed: 0, pulled: 1 };
    }
    const merged = mergeInitialBilling(local, remote.data);
    const version = await writeRemote(supabase, companyId, merged, remote.version);
    const confirmed = await readRemote(supabase, companyId);
    if (!confirmed.data || confirmed.version !== version || hash(confirmed.data) !== hash(merged)) {
      throw new Error("La fusion des factures n'a pas pu être confirmée. Les deux versions d'origine sont conservées.");
    }
    saveShadow(companyId, confirmed.data, confirmed.version);
    return { billing: confirmed.data, pushed: 1, pulled: 1 };
  }

  const localChanged = hash(local) !== shadow.hash;
  const cloudChanged = remote.version !== Number(shadow.sync_version);
  if (localChanged && cloudChanged && hash(local) !== hash(remote.data)) {
    throw new Error("Conflit simultané dans la Facturation : les deux appareils ont modifié les documents. Aucune version n'a été écrasée.");
  }
  if (localChanged && !cloudChanged) {
    if (role === "reader") throw new Error("Votre rôle est en lecture seule : les modifications de facturation ne peuvent pas être envoyées.");
    const version = await writeRemote(supabase, companyId, local, remote.version);
    const confirmed = await readRemote(supabase, companyId);
    if (!confirmed.data || confirmed.version !== version || hash(confirmed.data) !== hash(local)) {
      throw new Error("La facturation envoyée n'a pas pu être confirmée par le serveur.");
    }
    saveShadow(companyId, confirmed.data, confirmed.version);
    return { billing: local, pushed: 1, pulled: 0 };
  }
  if (cloudChanged && !localChanged) {
    saveShadow(companyId, remote.data, remote.version);
    return { billing: remote.data, pushed: 0, pulled: 1 };
  }
  saveShadow(companyId, remote.data || local, remote.version);
  return { billing: remote.data || local, pushed: 0, pulled: 0 };
}
