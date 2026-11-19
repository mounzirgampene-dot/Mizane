// MIZANE — Synchronisation bidirectionnelle du module Facturation.
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
  if (!Array.isArray(billing.documents)) billing.documents = [];
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
async function invoke(supabase, body, fallback) {
  const { data, error } = await supabase.functions.invoke("sync-billing", { body });
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
    if (!local.documents.length) {
      saveShadow(companyId, remote.data, remote.version);
      return { billing: remote.data, pushed: 0, pulled: 1 };
    }
    if (hash(local) !== hash(remote.data)) {
      throw new Error("Première synchronisation de la facturation : des documents existent sur cet appareil et dans le cloud. Aucune donnée n'a été écrasée ; il faut vérifier les deux versions avant de continuer.");
    }
    saveShadow(companyId, remote.data, remote.version);
    return { billing: local, pushed: 0, pulled: 0 };
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
