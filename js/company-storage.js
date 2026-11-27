// MIZANE — Liaison explicite entre le magasin comptable local et l'espace SaaS actif.
const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
const ACTIVE_USER_KEY = "mizane_active_user_v1";
const BINDING_KEY = "mizane_local_company_binding_v1";

export function getCompanyStorageStatus() {
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
