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
    const localRaw = localStorage.getItem("mizane_v1");
    if (!localRaw) throw new Error("Données locales introuvables après la synchronisation comptable.");
    let localStore;
    try { localStore = JSON.parse(localRaw); } catch { throw new Error("Données locales illisibles après la synchronisation comptable."); }
    const billingResult = await syncBilling(supabase, companyId, membership.role, localStore.billing);
    if (billingResult.pulled > 0) {
      localStore.billing = billingResult.billing;
      localStorage.setItem("mizane_v1", JSON.stringify(localStore));
    }
    const result = {
      ...accountingResult,
      billingPushed: billingResult.pushed,
      billingPulled: billingResult.pulled,
      pulled: (Number(accountingResult.pulled) || 0) + (Number(billingResult.pulled) || 0),
    };
    window.dispatchEvent(new CustomEvent("mizane:cloud-synced", { detail: result }));
    return result;
  })().finally(() => {
    activeSync = null;
  });
  return activeSync;
}
