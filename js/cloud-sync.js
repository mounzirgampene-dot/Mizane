// MIZANE — Pont entre l'application comptable et la synchronisation SaaS.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { syncAccounting } from "./accounting-sync.js";
import { syncBilling } from "./billing-sync.js";

const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
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
  if (!user) return null;
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
    const billingPayload = { ...(localStore.billing || {}), stock: localStore.stock || null };
    const billingResult = await syncBilling(supabase, companyId, membership.role, billingPayload);
    if (billingResult.pulled > 0) {
      const syncedBilling = { ...billingResult.billing };
      if (syncedBilling.stock && typeof syncedBilling.stock === "object") localStore.stock = syncedBilling.stock;
      delete syncedBilling.stock;
      localStore.billing = syncedBilling;
      localStorage.setItem("mizane_v1", JSON.stringify(localStore));
    }
    const result = {
      ...accountingResult,
      billingPushed: billingResult.pushed,
      billingPulled: billingResult.pulled,
      stockIncluded: Boolean(localStore.stock),
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
