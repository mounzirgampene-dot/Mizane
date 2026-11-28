// MIZANE — Pont entre l'application comptable et la synchronisation SaaS.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { syncAccounting } from "./accounting-sync.js";
import { syncBilling } from "./billing-sync.js";
import { getCompanyStorageStatus } from "./company-storage.js";

const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
const ACTIVE_USER_KEY = "mizane_active_user_v1";
const SHADOW_PREFIX = "mizane_sync_shadow_v1:";
let clientPromise;
let activeSync = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    );
  }
  return clientPromise;
}

export async function getCurrentCompanyRole() {
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  if (!companyId) return null;
  const supabase = await getClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData?.session?.user;
  if (!user) {
    localStorage.removeItem(ACTIVE_USER_KEY);
    return null;
  }
  localStorage.setItem(ACTIVE_USER_KEY, user.id);
  const { data: membership, error } = await supabase
    .from("company_memberships")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership || membership.status !== "active") return null;
  return membership.role;
}

export function syncCloudIfReady() {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
    if (!companyId) return { skipped: true, reason: "no-company" };

    // L'import initial et la création du shadow restent explicites dans le portail SaaS.
    // Cela évite de pousser une comptabilité locale non vérifiée vers la mauvaise entreprise.
    if (!localStorage.getItem(SHADOW_PREFIX + companyId)) {
      return { skipped: true, reason: "initial-sync-required" };
    }

    const supabase = await getClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData?.session?.user;
    if (!user) return { skipped: true, reason: "not-authenticated" };
    localStorage.setItem(ACTIVE_USER_KEY, user.id);
    const storageStatus = getCompanyStorageStatus();
    if (!storageStatus.ok || storageStatus.companyId !== companyId || storageStatus.userId !== user.id) {
      return { skipped: true, reason: "company-storage-not-bound" };
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("role,status")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || membership.status !== "active") {
      return { skipped: true, reason: "not-a-member" };
    }

    const accountingResult = await syncAccounting(supabase, companyId, membership.role);
    if (["admin", "accountant"].includes(membership.role)) {
      const localRaw = localStorage.getItem("mizane_v1");
      let periodStore = null;
      try { periodStore = localRaw ? JSON.parse(localRaw) : null; } catch {}
      for (const period of (periodStore?.settings?.closedPeriods || [])) {
        if (!period || period.status === "open") continue;
        const { error } = await supabase.rpc("manage_accounting_period", {
          p_company_id: companyId,
          p_start_date: period.startDate,
          p_end_date: period.endDate,
          p_action: "close",
          p_reason: null,
        });
        if (error) throw error;
      }
    }
    const localRaw = localStorage.getItem("mizane_v1");
    if (!localRaw) throw new Error("Données locales introuvables après la synchronisation comptable.");
    let localStore;
    try { localStore = JSON.parse(localRaw); } catch { throw new Error("Données locales illisibles après la synchronisation comptable."); }
    const billingPayload = { ...(localStore.billing || {}) };
    // Le stock possède désormais son propre journal transactionnel : ne plus le
    // réécrire dans company_billing. L'ancien champ reste lisible pour migration.
    delete billingPayload.stock;
    const billingResult = await syncBilling(supabase, companyId, membership.role, billingPayload);
    if (billingResult.pulled > 0) {
      const syncedBilling = { ...billingResult.billing };
      if (!localStore.stock && syncedBilling.stock && typeof syncedBilling.stock === "object") localStore.stock = syncedBilling.stock;
      delete syncedBilling.stock;
      localStore.billing = syncedBilling;
      localStorage.setItem("mizane_v1", JSON.stringify(localStore));
      if (localStore.stock && typeof localStore.stock === "object") window.dispatchEvent(new CustomEvent("mizane:legacy-stock-loaded", { detail: localStore.stock }));
    }
    const result = {
      ...accountingResult,
      billingPushed: billingResult.pushed,
      billingPulled: billingResult.pulled,
      legacyStockAvailable: Boolean(localStore.stock),
      pulled: (Number(accountingResult.pulled) || 0) + (Number(billingResult.pulled) || 0),
    };
    window.dispatchEvent(new CustomEvent("mizane:cloud-synced", { detail: result }));
    return result;
  })().finally(() => {
    activeSync = null;
  });
  return activeSync;
}


// Gestion des périodes comptables : le serveur demeure l'autorité de verrouillage.
export async function manageCloudAccountingPeriod({ startDate, endDate, action, reason = null }) {
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  if (!companyId) return { skipped: true, reason: "no-company" };
  if (!localStorage.getItem(SHADOW_PREFIX + companyId)) {
    throw new Error("Effectuez d'abord la synchronisation initiale de cette entreprise avant de gérer ses périodes comptables.");
  }
  const supabase = await getClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session?.user) throw new Error("Connectez-vous à votre espace professionnel pour gérer les périodes comptables.");
  const { data, error } = await supabase.rpc("manage_accounting_period", {
    p_company_id: companyId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_action: action,
    p_reason: reason,
  });
  if (error) {
    let message = error.message || "Opération sur la période comptable impossible.";
    try {
      const body = error.context && typeof error.context.clone === "function" ? await error.context.clone().json() : null;
      if (body?.message) message = body.message;
    } catch {}
    throw new Error(message);
  }
  if (!data?.ok) throw new Error("Le serveur n'a pas confirmé l'opération sur la période comptable.");
  return data;
}


export function assertCloudAccountingPeriodReady() {
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  if (companyId && !localStorage.getItem(SHADOW_PREFIX + companyId)) {
    throw new Error("Effectuez d'abord la synchronisation initiale de cette entreprise avant de clôturer un exercice.");
  }
  return true;
}


// API dédiée au moteur de stock transactionnel. Les opérations de stock ne
// transitent plus par le JSONB de facturation lorsqu'une entreprise SaaS est active.
function stockCompanyId() {
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  if (!companyId) throw new Error("Aucune entreprise professionnelle sélectionnée.");
  return companyId;
}
async function stockRpc(functionName, args = {}) {
  const companyId = stockCompanyId();
  const supabase = await getClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session?.user) throw new Error("Connectez-vous à votre espace professionnel pour accéder au stock.");
  const { data, error } = await supabase.rpc(functionName, { p_company_id: companyId, ...args });
  if (error) {
    let message = error.message || "Opération de stock impossible.";
    try {
      const body = error.context && typeof error.context.clone === "function" ? await error.context.clone().json() : null;
      if (body?.message) message = body.message;
    } catch {}
    throw new Error(message);
  }
  return data;
}
export function hasActiveStockCompany() {
  return Boolean(localStorage.getItem(ACTIVE_COMPANY_KEY));
}
export function readCloudStockPeriodValuation(startDate,endDate) {
  return stockRpc("stock_period_valuation", { p_start_date:startDate, p_end_date:endDate });
}
export function readCloudStock() {
  return Promise.all([
    stockRpc("stock_read_state"),
    stockRpc("stock_read_catalog"),
  ]).then(([state, catalog]) => ({ ...state, ...catalog }));
}
export function saveCloudStockFamily(family) {
  return stockRpc("stock_save_family", { p_family: family });
}
export function saveCloudStockType(type) {
  return stockRpc("stock_save_type", { p_type: type });
}
export function saveCloudStockProduct(product) {
  return stockRpc("stock_save_product", { p_product: product });
}
export function saveCloudStockWarehouse(warehouse) {
  return stockRpc("stock_save_warehouse", { p_warehouse: warehouse });
}
export function updateCloudStockSettings(settings) {
  return stockRpc("stock_update_settings", { p_settings: settings });
}
export function updateCloudStockReorderThresholds({ productId, minimumStock, targetStock }) {
  return stockRpc("stock_update_reorder_thresholds", {
    p_product_id: productId,
    p_minimum_stock: minimumStock,
    p_target_stock: targetStock,
  });
}
export function postCloudStockDocument({ operationUid, documentType, documentDate, reference = "", note = "", lines, sourceType = null, sourceId = null }) {
  return stockRpc("stock_post_document", {
    p_operation_uid: operationUid,
    p_document_type: documentType,
    p_document_date: documentDate,
    p_reference: reference,
    p_note: note,
    p_lines: lines,
    p_source_type: sourceType,
    p_source_id: sourceId,
  });
}
export function reverseCloudStockDocument(documentId, operationUid, reason) {
  return stockRpc("stock_reverse_document", {
    p_document_id: documentId,
    p_operation_uid: operationUid,
    p_reason: reason,
  });
}
export function reserveCloudStock({ operationUid, productId, warehouseId, quantity, reference = "", sourceType = null, sourceId = null }) {
  const linked = sourceType !== null || sourceId !== null;
  return stockRpc(linked ? "stock_reserve_linked" : "stock_reserve", {
    p_operation_uid: operationUid,
    p_product_id: productId,
    p_warehouse_id: warehouseId,
    p_quantity: quantity,
    p_reference: reference,
    ...(linked ? { p_source_type: sourceType, p_source_id: sourceId } : {}),
  });
}
export function releaseCloudStockReservation(reservationId) {
  return stockRpc("stock_release_reservation", { p_reservation_id: reservationId });
}


export function readCloudStockCounts() {
  return stockRpc("stock_count_read");
}
export function createCloudStockCount({ warehouseId, reference }) {
  return stockRpc("stock_count_create", { p_warehouse_id:warehouseId, p_reference:reference });
}
export function setCloudStockCountLine({ sessionId, lineId, countedQuantity }) {
  return stockRpc("stock_count_set_line", { p_session_id:sessionId, p_line_id:lineId, p_counted_quantity:countedQuantity });
}
export function submitCloudStockCount(sessionId) {
  return stockRpc("stock_count_submit", { p_session_id:sessionId });
}
export function finalizeCloudStockCount({ sessionId, operationUid, documentDate }) {
  return stockRpc("stock_count_finalize", { p_session_id:sessionId, p_operation_uid:operationUid, p_document_date:documentDate });
}
export function cancelCloudStockCount(sessionId) {
  return stockRpc("stock_count_cancel", { p_session_id:sessionId });
}
