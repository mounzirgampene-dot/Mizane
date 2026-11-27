// MIZANE — Liaison explicite entre le magasin comptable local et l'espace SaaS actif.
const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
const ACTIVE_USER_KEY = "mizane_active_user_v1";
const BINDING_KEY = "mizane_local_company_binding_v1";
const SESSION_LOCK_KEY = "mizane_company_session_lock_v1";

export function getCompanySessionLock() {
  try { return JSON.parse(localStorage.getItem(SESSION_LOCK_KEY) || "null"); }
  catch { return null; }
}

export function lockCompanyStorage(userId) {
  const binding = (() => { try { return JSON.parse(localStorage.getItem(BINDING_KEY) || "null"); } catch { return null; } })();
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY) || binding?.companyId || "";
  const verifiedUserId = String(userId || binding?.userId || "").trim();
  if (!companyId || !verifiedUserId || binding?.companyId !== companyId || binding?.userId !== verifiedUserId) return false;
  localStorage.setItem(SESSION_LOCK_KEY, JSON.stringify({ version: 1, userId: verifiedUserId, companyId, lockedAt: new Date().toISOString() }));
  localStorage.removeItem(ACTIVE_COMPANY_KEY);
  localStorage.removeItem(ACTIVE_USER_KEY);
  return true;
}

export function unlockCompanyStorage(userId, companyId, { authorizedCompanyMember = false } = {}) {
  const targetUserId = String(userId || "").trim();
  const targetCompanyId = String(companyId || "").trim();
  const lock = getCompanySessionLock();
  if (!lock) return true;
  let binding = null;
  try { binding = JSON.parse(localStorage.getItem(BINDING_KEY) || "null"); } catch { binding = null; }
  // L'identité du dernier utilisateur peut changer : l'autorisation actuelle
  // est vérifiée côté portail auprès de Supabase avant cet appel. On conserve
  // impérativement la même entreprise et une association locale déjà établie.
  if (!targetUserId || lock.companyId !== targetCompanyId || binding?.companyId !== lock.companyId) return false;
  if (lock.userId !== targetUserId && !authorizedCompanyMember) return false;
  if (binding.userId !== targetUserId) {
    localStorage.setItem(BINDING_KEY, JSON.stringify({
      ...binding, userId: targetUserId, reboundAt: new Date().toISOString(),
    }));
  }
  localStorage.removeItem(SESSION_LOCK_KEY);
  return true;
}

export function getCompanyStorageStatus() {
  const lock = getCompanySessionLock();
  if (lock?.companyId && lock?.userId) {
    return { ok: false, reason: "session-locked", companyId: lock.companyId, userId: lock.userId, lockedAt: lock.lockedAt || null };
  }
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY);
  if (!companyId) return { ok: true, mode: "local" };

  const userId = localStorage.getItem(ACTIVE_USER_KEY);
  if (!userId) return { ok: false, reason: "missing-user", companyId };

  let binding = null;
  try {
    binding = JSON.parse(localStorage.getItem(BINDING_KEY) || "null");
  } catch {
    binding = null;
  }

  if (!binding) return { ok: false, reason: "unbound", companyId, userId };
  if (binding.companyId !== companyId || binding.userId !== userId) {
    return { ok: false, reason: "mismatch", companyId, userId, binding };
  }

  return { ok: true, mode: "company", companyId, userId };
}

export function bindCompanyStorage(companyId, userId) {
  const targetCompanyId = String(companyId || "").trim();
  const targetUserId = String(userId || "").trim();
  if (!targetCompanyId || !targetUserId) {
    throw new Error("L'association du magasin local exige un utilisateur et une entreprise vérifiés.");
  }
  localStorage.setItem(BINDING_KEY, JSON.stringify({
    version: 1,
    companyId: targetCompanyId,
    userId: targetUserId,
    boundAt: new Date().toISOString(),
  }));
}
