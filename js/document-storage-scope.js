// MIZANE — Portée d’isolation des coffres documentaires locaux.
import { getCompanyStorageStatus } from "./company-storage.js";
const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
const ACTIVE_USER_KEY = "mizane_active_user_v1";
function safeSegment(value) { return encodeURIComponent(String(value || "device")).replace(/%/g, "_"); }
/** Résout un espace IndexedDB distinct par utilisateur et entreprise. */
export function resolveDocumentStorageScope({ storage = globalThis.localStorage, getStatus = getCompanyStorageStatus } = {}) {
  if (!storage || typeof storage.getItem !== "function") throw new Error("Le contexte du coffre documentaire est indisponible.");
  const companyId = String(storage.getItem(ACTIVE_COMPANY_KEY) || "").trim();
  const userId = String(storage.getItem(ACTIVE_USER_KEY) || "").trim();
  if (companyId) {
    const status = getStatus();
    if (!userId || !status?.ok || status.mode !== "company" || status.companyId !== companyId || status.userId !== userId) throw new Error("Accès au coffre local bloqué : l’utilisateur et l’entreprise actifs ne sont pas associés de manière vérifiée.");
    return { mode: "company", userId, companyId, databaseSuffix: "company_" + safeSegment(userId) + "_" + safeSegment(companyId) };
  }
  const localOwner = userId || "device";
  return { mode: "local", userId: localOwner, companyId: null, databaseSuffix: "local_" + safeSegment(localOwner) };
}
